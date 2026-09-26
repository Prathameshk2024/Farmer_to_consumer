import { Router, type Request, type Response } from 'express'
import { isValidPhone, normalizePhone, samePhone } from '@shared/seller.js'
import { getDb, save } from '../db/store.js'
import { customerIdFor, findCustomer, isRegisteredCustomer } from '../db/customers.js'
import { callerIp, requireRole } from '../middleware/auth.js'
import { signToken } from '../auth/tokens.js'
import {
  createSession, describeClient, liveSessionsForUser, revokeSession,
} from '../auth/sessions.js'
import { authenticateAdmin, bootstrapAdmin, normalizeEmail } from '../auth/admins.js'
import { issueTicket } from '../auth/tickets.js'
import { recordAuthEvent } from '../auth/events.js'
import { hashIp, maskPhone } from '../auth/crypto.js'
import { clear as clearLimit, hit, LIMITS, type Limit } from '../auth/rateLimit.js'
import { sendOtp, verifyOtp } from '../services/otp.service.js'

/**
 * AUTHENTICATION
 * ==============
 * Phone plus OTP for sellers and customers; email plus password for
 * administrators. Verification happens HERE, on the server, never on the
 * client - a client that decides for itself whether the code was right is not
 * authentication, it is a suggestion.
 *
 * Three rules hold across every handler below:
 *
 *  - EVERY attempt is counted before it is answered. Rate limiting is not a
 *    nicety on a login endpoint: a six-digit code is a million guesses, and a
 *    password is far fewer, so without a cap the only question is how long a
 *    script needs.
 *  - Failures are indistinguishable to the caller. Wrong code, expired code,
 *    no code at all; unknown admin, wrong password, disabled account - one
 *    message each side. Anything more precise confirms facts about other
 *    people's accounts to whoever asks.
 *  - Everything that matters is written to the audit trail with the phone
 *    masked and the address hashed, so an incident can be reconstructed
 *    without the log itself being worth stealing.
 */
export const authRouter: Router = Router()

/**
 * Count an attempt, and answer 429 if it is over the line.
 *
 * Returns true when the caller has been dealt with, so handlers read as
 * `if (over(...)) return`.
 */
/**
 * "Try again in N" - in a unit a person uses.
 *
 * The daily send quota resets a whole day out, and the minutes version of that
 * read "1440 मिनिटांनी पुन्हा प्रयत्न करा", which is a number rather than an
 * answer. Nothing here is precise to the minute anyway.
 */
function retryInMr(sec: number): string {
  // Marathi inflects for number, so one of anything takes a different ending.
  // "1 दिवसांनी" is the kind of wrong that tells a woman this was not written
  // for the seller, on the one screen where they are already being told no.
  const say = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  if (sec < 60 * 60) return say(Math.ceil(sec / 60), 'मिनिटाने', 'मिनिटांनी')
  const hours = Math.ceil(sec / 3600)
  if (hours < 24) return say(hours, 'तासाने', 'तासांनी')
  return say(Math.ceil(hours / 24), 'दिवसाने', 'दिवसांनी')
}

function over(res: Response, key: string, limit: Limit): boolean {
  const result = hit(key, limit)
  if (result.ok) return false

  res.setHeader('Retry-After', String(result.retryAfterSec))
  res.status(429).json({
    error: 'Too many attempts',
    messageMr: `खूप वेळा प्रयत्न झाले. ${retryInMr(result.retryAfterSec)} पुन्हा प्रयत्न करा.`,
    retryAfterSec: result.retryAfterSec,
  })
  return true
}

/** The generic "that did not work" for OTP. Never says which part was wrong. */
function otpRejected(res: Response): void {
  res.status(401).json({ error: 'Wrong or expired OTP', messageMr: 'OTP चुकीचा किंवा कालबाह्य आहे. पुन्हा पाठवा.' })
}

/* ------------------------------------------------------------------ */
/* Send a code                                                         */
/* ------------------------------------------------------------------ */

authRouter.post('/otp/send', async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ''))
  const ip = hashIp(callerIp(req))

  if (!isValidPhone(phone)) {
    res.status(400).json({
      error: 'Invalid phone',
      messageMr: '10 अंकी मोबाईल नंबर टाका',
      fields: { phone: 'invalid' },
    })
    return
  }

  // Both keys, always. Per-phone alone lets somebody walk through numbers to
  // burn the SMS budget; per-IP alone punishes a whole village behind one
  // carrier NAT, which here is a real shape of traffic rather than an edge case.
  if (over(res, `otp:send:ip:${ip}`, LIMITS.otpSendPerIp)) {
    recordAuthEvent(getDb(), { type: 'ratelimit', ip, detail: 'otp.send ip' })
    save()
    return
  }
  if (over(res, `otp:send:phone:${phone}`, LIMITS.otpSendPerPhone)) {
    recordAuthEvent(getDb(), { type: 'otp.send.blocked', subject: maskPhone(phone), ip })
    save()
    return
  }

  const result = await sendOtp(phone)
  recordAuthEvent(getDb(), {
    type: result.sent ? 'otp.send' : 'otp.send.blocked',
    subject: maskPhone(phone),
    ip,
    detail: result.sent ? undefined : 'cooldown or delivery failure',
  })
  save()

  res.json(result)
})

/* ------------------------------------------------------------------ */
/* Check a code, and start a session                                   */
/* ------------------------------------------------------------------ */

authRouter.post('/otp/verify', async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ''))
  const code = String(req.body?.code ?? '')
  const role = req.body?.role === 'seller' ? 'seller' : 'customer'
  const ip = hashIp(callerIp(req))

  if (!isValidPhone(phone)) {
    otpRejected(res)
    return
  }

  if (over(res, `otp:verify:ip:${ip}`, LIMITS.otpVerifyPerIp)) return
  if (over(res, `otp:verify:phone:${phone}`, LIMITS.otpVerifyPerPhone)) {
    recordAuthEvent(getDb(), { type: 'ratelimit', subject: maskPhone(phone), ip, detail: 'otp.verify' })
    save()
    return
  }

  const check = await verifyOtp(phone, code)
  if (!check.ok) {
    recordAuthEvent(getDb(), {
      type: 'otp.verify.fail', subject: maskPhone(phone), role, ip, detail: check.reason,
    })
    save()
    otpRejected(res)
    return
  }

  // A correct code clears the failure budget, so somebody who mistyped twice
  // and then got it right is not still one slip from a lockout.
  clearLimit(`otp:verify:phone:${phone}`)

  const db = getDb()
  const client = describeClient(req.headers['user-agent'])

  if (role === 'seller') {
    // Normalised on both sides: records stored before this fix may hold
    // '98765 43210' or '+91...', and she is not registering a second time.
    const seller = db.sellers.find((s) => samePhone(s.phone, phone))

    if (!seller) {
      /**
       * No seller record yet. She is verified but has nothing to sign in to,
       * so instead of a session she gets a TICKET - short-lived, single-use
       * proof that this phone passed an OTP just now.
       *
       * /sellers/register demands it and reads the phone out of it. Before the
       * ticket existed, registration took a phone number straight from the
       * request body and issued a session for it, so anybody could create an
       * account against any unregistered number.
       */
      recordAuthEvent(db, { type: 'otp.verify.ok', subject: maskPhone(phone), role, ip, detail: 'unregistered' })
      save()
      res.json({
        registered: false,
        phone,
        ticket: issueTicket('seller-register', phone),
      })
      return
    }

    const session = createSession(db, {
      role: 'seller', userId: seller.id, phone, sellerId: seller.id, client,
    })
    recordAuthEvent(db, {
      type: 'session.start', subject: maskPhone(phone), role: 'seller', ip, sessionId: session.id,
    })
    save()

    res.json({
      registered: true,
      session: {
        token: signToken({ sid: session.id, role: 'seller' }),
        role: 'seller',
        userId: seller.id,
        phone,
        name: seller.name,
        sellerId: seller.id,
      },
    })
    return
  }

  /**
   * The phone is still the customer's account - the id is derived from it, not
   * allocated - but a verified phone alone is not a registration. She also has
   * to have given us a name, because that name is what the seller reads on the
   * order and what she is called when she is phoned about a delivery.
   *
   * The session is issued either way (she IS authenticated - the OTP is the
   * proof, and the name step needs a token to write with), and `registered`
   * tells the client whether to send her to /shop or to the one-field
   * registration screen.
   *
   * The record is deliberately NOT created here. `ensureCustomer` would make
   * an empty row that answers `registered: true` for ever after, and she would
   * never be asked her name at all.
   */
  const customerId = customerIdFor(phone)
  const registered = isRegisteredCustomer(db, customerId)
  const name = registered ? findCustomer(db, customerId)?.name : undefined

  const session = createSession(db, {
    role: 'customer', userId: customerId, phone, customerId, client,
  })
  recordAuthEvent(db, {
    type: 'session.start', subject: maskPhone(phone), role: 'customer', ip, sessionId: session.id,
  })
  save()

  res.json({
    registered,
    phone,
    session: {
      token: signToken({ sid: session.id, role: 'customer' }),
      role: 'customer',
      userId: customerId,
      phone,
      customerId,
      name,
    },
  })
})

/* ------------------------------------------------------------------ */
/* End a session                                                       */
/* ------------------------------------------------------------------ */

/**
 * Log out, properly.
 *
 * This route did not exist. "Log out" cleared localStorage and nothing else,
 * so the token stayed valid for its whole window - which meant a woman who
 * signed out on a borrowed phone had not actually signed out of anything.
 *
 * Idempotent and always 200: a client tidying up after an expired session must
 * not be handed an error for doing the right thing.
 */
authRouter.post('/logout', (req: Request, res: Response) => {
  const auth = req.auth
  if (auth) {
    const db = getDb()
    revokeSession(db, auth.sessionId, 'logout')
    recordAuthEvent(db, {
      type: 'session.end',
      subject: auth.phone ? maskPhone(auth.phone) : auth.userId,
      role: auth.role,
      ip: hashIp(callerIp(req)),
      sessionId: auth.sessionId,
    })
    save()
  }
  res.json({ ok: true })
})

/* ------------------------------------------------------------------ */
/* Her own signed-in devices                                           */
/* ------------------------------------------------------------------ */

/** What "you are signed in on three phones" needs, and nothing about anyone else. */
authRouter.get('/sessions', requireRole('seller', 'customer', 'admin'), (req, res) => {
  const auth = req.auth!
  res.json({
    sessions: liveSessionsForUser(getDb(), auth.userId).map((s) => ({
      id: s.id,
      client: s.client,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      current: s.id === auth.sessionId,
    })),
  })
})

/**
 * Sign one device out.
 *
 * Scoped to the caller's own sessions: an id belonging to somebody else finds
 * nothing and returns 404, indistinguishable from one that never existed.
 */
authRouter.delete('/sessions/:id', requireRole('seller', 'customer', 'admin'), (req, res) => {
  const auth = req.auth!
  const db = getDb()

  const mine = db.sessions.find((s) => s.id === req.params.id && s.userId === auth.userId)
  if (!mine || mine.revokedAt) {
    res.status(404).json({ error: 'Session not found', messageMr: 'हे सत्र सापडले नाही' })
    return
  }

  revokeSession(db, mine.id, 'logout')
  recordAuthEvent(db, {
    type: 'session.revoked',
    subject: auth.phone ? maskPhone(auth.phone) : auth.userId,
    role: auth.role,
    ip: hashIp(callerIp(req)),
    sessionId: mine.id,
  })
  save()

  res.json({ ok: true })
})

/* ------------------------------------------------------------------ */
/* Administrators                                                      */
/* ------------------------------------------------------------------ */

authRouter.post('/admin/login', (req, res) => {
  const email = normalizeEmail(String(req.body?.email ?? ''))
  const password = String(req.body?.password ?? '')
  const ip = hashIp(callerIp(req))
  const db = getDb()

  if (over(res, `admin:login:ip:${ip}`, LIMITS.adminLoginPerIp)) return
  if (over(res, `admin:login:email:${email}`, LIMITS.adminLoginPerEmail)) {
    recordAuthEvent(db, { type: 'ratelimit', subject: email, ip, detail: 'admin.login' })
    save()
    return
  }

  // One message and one status for every failure. An admin login that says
  // "no such account" is a directory of who administers the platform.
  const deny = () => {
    res.status(401).json({ error: 'Bad credentials', messageMr: 'ईमेल किंवा पासवर्ड चुकीचा आहे' })
  }

  if (!email || !password) {
    deny()
    return
  }

  const attempt = authenticateAdmin(db, email, password)
  const admin = attempt.ok ? attempt.admin : bootstrapAdmin(db, email, password)

  if (!admin) {
    recordAuthEvent(db, {
      type: 'admin.login.fail', subject: email, role: 'admin', ip,
      detail: attempt.ok ? 'bootstrap' : attempt.reason,
    })
    save()
    deny()
    return
  }

  clearLimit(`admin:login:email:${email}`)
  admin.lastLoginAt = new Date().toISOString()

  const session = createSession(db, {
    role: 'admin',
    userId: admin.id,
    client: describeClient(req.headers['user-agent']),
  })
  recordAuthEvent(db, {
    type: 'admin.login.ok', subject: admin.email, role: 'admin', ip, sessionId: session.id,
  })
  save()

  res.json({
    session: {
      token: signToken({ sid: session.id, role: 'admin' }),
      role: 'admin',
      userId: admin.id,
      name: admin.name,
      email: admin.email,
    },
  })
})
