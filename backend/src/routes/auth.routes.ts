import { Router, type Request, type Response } from 'express'
import { isValidPhone, normalizePhone } from '@shared/farmer.js'
import { getDb, save } from '../db/store.js'
import { findCustomer } from '../db/customers.js'
import { callerIp, requireRole } from '../middleware/auth.js'
import { signToken } from '../auth/tokens.js'
import {
  createSession, describeClient, liveSessionsForUser, revokeSession,
} from '../auth/sessions.js'
import { authenticateAdmin, bootstrapAdmin, normalizeEmail } from '../auth/admins.js'
import { changeOwnPassword, checkPassword } from '../auth/credentials.js'
import { submitPasswordRequest } from '../auth/passwordRequests.js'
import { recordAuthEvent } from '../auth/events.js'
import { hashIp, maskPhone } from '../auth/crypto.js'
import { clear as clearLimit, hit, LIMITS, type Limit } from '../auth/rateLimit.js'

/**
 * AUTHENTICATION
 * ==============
 * Phone plus password for farmers and customers; email plus password for
 * administrators. There is no SMS: a forgotten password is a request to a
 * person (POST /password-requests below, answered from the admin queue).
 *
 * Three rules hold across every handler below:
 *
 *  - EVERY attempt is counted before it is answered. Rate limiting is not a
 *    nicety on a login endpoint: a six-digit password is a million guesses,
 *    and a remembered one is far fewer, so without a cap the only question is
 *    how long a script needs.
 *  - Failures are indistinguishable to the caller. Unknown phone, wrong
 *    password; unknown admin, wrong password, disabled account - one
 *    message each side. Anything more precise confirms facts about other
 *    people's accounts to whoever asks.
 *  - Everything that matters is written to the audit trail with the phone
 *    masked and the address hashed, so an incident can be reconstructed
 *    without the log itself being worth stealing.
 */
export const authRouter: Router = Router()

/**
 * "Try again in N" - in a unit a person uses.
 *
 * The daily forgot-password quota resets a whole day out, and the minutes version of that
 * read "1440 मिनिटांनी पुन्हा प्रयत्न करा", which is a number rather than an
 * answer. Nothing here is precise to the minute anyway.
 */
function retryInMr(sec: number): string {
  // Marathi inflects for number, so one of anything takes a different ending.
  // "1 दिवसांनी" is the kind of wrong that tells a woman this was not written
  // for the farmer, on the one screen where they are already being told no.
  const say = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  if (sec < 60 * 60) return say(Math.ceil(sec / 60), 'मिनिटाने', 'मिनिटांनी')
  const hours = Math.ceil(sec / 3600)
  if (hours < 24) return say(hours, 'तासाने', 'तासांनी')
  return say(Math.ceil(hours / 24), 'दिवसाने', 'दिवसांनी')
}

/**
 * Count an attempt, and answer 429 if it is over the line.
 *
 * Returns true when the caller has been dealt with, so handlers read as
 * `if (over(...)) return`.
 */
function over(res: Response, key: string, limit: Limit): boolean {
  const result = hit(key, limit)
  if (result.ok) return false
  tooMany(res, result.retryAfterSec)
  return true
}

function tooMany(res: Response, retryAfterSec: number): void {
  res.setHeader('Retry-After', String(retryAfterSec))
  res.status(429).json({
    error: 'Too many attempts',
    messageMr: `खूप वेळा प्रयत्न झाले. ${retryInMr(retryAfterSec)} पुन्हा प्रयत्न करा.`,
    retryAfterSec,
  })
}

/* ------------------------------------------------------------------ */
/* Sign in                                                             */
/* ------------------------------------------------------------------ */

authRouter.post('/login', (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ''))
  const password = String(req.body?.password ?? '')
  const role = req.body?.role === 'farmer' ? 'farmer' : 'customer'
  const ip = hashIp(callerIp(req))
  const db = getDb()
  // One answer for an unknown phone and a wrong password: anything more says
  // which numbers have accounts.
  const deny = () => res.status(401).json({
    error: 'Bad credentials', messageMr: 'मोबाईल नंबर किंवा पासवर्ड चुकीचा आहे',
  })

  if (!isValidPhone(phone) || !password) { deny(); return }
  if (over(res, `login:ip:${ip}`, LIMITS.loginPerIp)) return
  if (over(res, `login:phone:${phone}`, LIMITS.loginPerPhone)) {
    recordAuthEvent(db, { type: 'ratelimit', subject: maskPhone(phone), ip, detail: 'login' })
    save()
    return
  }

  const cred = checkPassword(db, role, phone, password)
  const farmer = cred && role === 'farmer' ? db.farmers.find((f) => f.id === cred.userId) : undefined
  const customer = cred && role === 'customer' ? findCustomer(db, cred.userId) : undefined
  if (!cred || (!farmer && !customer)) {
    recordAuthEvent(db, { type: 'login.fail', subject: maskPhone(phone), role, ip })
    save()
    deny()
    return
  }
  // A right password clears the budget, so two typos and a success do not
  // leave her one slip from a lockout.
  clearLimit(`login:phone:${phone}`)

  const session = createSession(db, {
    role, userId: cred.userId, phone,
    farmerId: farmer?.id, customerId: customer?.id,
    client: describeClient(req.headers['user-agent']),
  })
  recordAuthEvent(db, { type: 'session.start', subject: maskPhone(phone), role, ip, sessionId: session.id })
  save()

  res.json({
    mustChangePassword: !!cred.mustChangePassword,
    session: {
      token: signToken({ sid: session.id, role }),
      role, userId: cred.userId, phone,
      name: farmer?.name ?? customer?.name,
      farmerId: farmer?.id, customerId: customer?.id,
      mustChangePassword: !!cred.mustChangePassword,
    },
  })
})

/* ------------------------------------------------------------------ */
/* Change her own password                                             */
/* ------------------------------------------------------------------ */

/** Also the way out of must-change: the middleware lets this route through. */
authRouter.post('/password', requireRole('farmer', 'customer'), (req, res) => {
  const auth = req.auth!
  const reply = changeOwnPassword(getDb(), { ...auth, role: auth.role as 'farmer' | 'customer' }, req.body)
  if (reply.status === 429) { tooMany(res, reply.retryAfterSec); return }
  if (reply.status === 200) save()
  res.status(reply.status).json(reply.body)
})

/* ------------------------------------------------------------------ */
/* Forgot password: a request to a person                              */
/* ------------------------------------------------------------------ */

/**
 * Public. The limits are counted before any account lookup, so a registered
 * and an unregistered number run out at the same moment, and the answer is
 * the same for both (see auth/passwordRequests.ts).
 */
authRouter.post('/password-requests', (req, res) => {
  const ip = hashIp(callerIp(req))
  const phone = normalizePhone(String(req.body?.phone ?? ''))
  if (over(res, `reset:ip:${ip}`, LIMITS.resetRequestPerIp)) return
  if (isValidPhone(phone) && over(res, `reset:phone:${phone}`, LIMITS.resetRequestPerPhone)) return

  const db = getDb()
  const reply = submitPasswordRequest(db, req.body)
  if (reply.status === 200) save()
  res.status(reply.status).json(reply.body)
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
authRouter.get('/sessions', requireRole('farmer', 'customer', 'admin'), (req, res) => {
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
authRouter.delete('/sessions/:id', requireRole('farmer', 'customer', 'admin'), (req, res) => {
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
