import { hmac, randomId, timingEqual } from './crypto.js'

/**
 * PROOF THAT A PHONE WAS VERIFIED
 * ===============================
 * This exists to close a hole rather than to add a feature.
 *
 * `POST /sellers/register` used to take a phone number out of the request body
 * and mint a seller session for it. No OTP, no session, no check of any kind -
 * so anyone who could reach the API could create an account against any
 * unregistered number and be signed in as her. The client walked through the
 * OTP screen first, which is not the same thing as the server requiring it.
 *
 * So verifying an OTP now also issues a short-lived, single-use TICKET, and
 * registration will not proceed without one. Crucially the phone comes OUT of
 * the ticket - the body's copy is ignored entirely - so there is no longer any
 * path by which a caller names the number he is registering.
 *
 * Fifteen minutes: long enough for a six-screen wizard filled in slowly on a
 * phone, short enough that a ticket found in a log or a browser history is
 * almost always already dead.
 */

const TTL_MS = 15 * 60 * 1000

export type TicketPurpose = 'seller-register'

interface TicketBody {
  purpose: TicketPurpose
  phone: string
  exp: number
  jti: string
}

/**
 * Tickets already spent.
 *
 * In memory, and honestly so. The deployment is pinned to one process for the
 * same reason the whole datastore is (see db/firestore.ts), and the cost of a
 * restart here is that one unexpired ticket could be presented twice - by
 * somebody who already passed the OTP for that number. That is a small enough
 * hole to accept in exchange for not putting a write on the login path. Move
 * it to the store if the process ever stops being singular.
 */
const spent = new Map<string, number>()

function sweep(now: number): void {
  for (const [jti, exp] of spent) if (exp <= now) spent.delete(jti)
}

export function issueTicket(purpose: TicketPurpose, phone: string, now = Date.now()): string {
  const body: TicketBody = { purpose, phone, exp: now + TTL_MS, jti: randomId(12) }
  const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')
  // Domain-separated: a session token presented here will not verify, and this
  // will not verify as a session token.
  return `${payload}.${hmac(`ticket:${purpose}`, payload)}`
}

/**
 * Check a ticket and spend it. Returns the verified phone, or null.
 *
 * Null for every failure - bad signature, wrong purpose, expired, already used
 * - because the caller does not need to tell them apart and a message that did
 * would tell an attacker which part of his forgery was right.
 */
export function consumeTicket(
  purpose: TicketPurpose,
  token: string,
  now = Date.now(),
): string | null {
  try {
    sweep(now)

    const dot = String(token ?? '').indexOf('.')
    if (dot < 1) return null

    const payload = token.slice(0, dot)
    if (!timingEqual(token.slice(dot + 1), hmac(`ticket:${purpose}`, payload))) return null

    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TicketBody
    if (body.purpose !== purpose) return null
    if (typeof body.exp !== 'number' || body.exp <= now) return null
    if (!body.phone || !body.jti) return null
    if (spent.has(body.jti)) return null

    spent.set(body.jti, body.exp)
    return body.phone
  } catch {
    return null
  }
}

/**
 * Is this ticket valid, WITHOUT spending it?
 *
 * Uploads need this. During registration she has no session - the seller
 * record does not exist yet - so the ticket is the only proof she can offer
 * when asking for a Cloudinary signature, and she may need several (a QR now,
 * a photo a moment later) before the one registration call spends it.
 *
 * Read-only on purpose: consuming a ticket here would mean uploading a photo
 * silently cancelled her registration.
 */
export function peekTicket(
  purpose: TicketPurpose,
  token: string,
  now = Date.now(),
): string | null {
  try {
    const dot = String(token ?? '').indexOf('.')
    if (dot < 1) return null

    const payload = token.slice(0, dot)
    if (!timingEqual(token.slice(dot + 1), hmac(`ticket:${purpose}`, payload))) return null

    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TicketBody
    if (body.purpose !== purpose) return null
    if (typeof body.exp !== 'number' || body.exp <= now) return null
    if (!body.phone || !body.jti) return null
    if (spent.has(body.jti)) return null

    return body.phone
  } catch {
    return null
  }
}

/** Test seam: forget every spent ticket. Never called by the server. */
export function resetSpentTickets(): void {
  spent.clear()
}
