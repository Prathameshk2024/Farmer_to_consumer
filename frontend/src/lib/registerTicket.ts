/**
 * Where the registration ticket waits between the OTP screen and the wizard.
 *
 * `sessionStorage`, not the URL: a ticket in a query string ends up in browser
 * history and in any server log that records the path, and it is a credential.
 * Session storage also survives a reload, which matters because the wizard is
 * six screens long and losing it would mean starting the OTP again.
 *
 * It lives in `lib/` rather than beside the screen that stashes it because
 * `lib/upload.ts` needs it too: during registration she has no session yet, so
 * the ticket is the only proof she can offer when asking for an upload
 * signature. A library importing a screen would be the wrong way round.
 */
const TICKET_KEY = 'wb.registerTicket'

export function stashRegisterTicket(ticket: string): void {
  try {
    sessionStorage.setItem(TICKET_KEY, ticket)
  } catch {
    /* private mode - registration will ask her to verify again */
  }
}

/** Read it back. Single-use server-side, so this may safely be called twice. */
export function takeRegisterTicket(): string {
  try {
    return sessionStorage.getItem(TICKET_KEY) ?? ''
  } catch {
    return ''
  }
}

export function clearRegisterTicket(): void {
  try {
    sessionStorage.removeItem(TICKET_KEY)
  } catch {
    /* nothing to clean up */
  }
}

/**
 * The phone and expiry inside a stashed ticket, if it is still in date.
 *
 * Decoded, NOT verified - the signature is the server's business and the
 * secret is not here. The worst a tampered payload can do is send her into a
 * wizard whose submit is then refused, which is recoverable; the point of
 * reading it is to know whether she still has a live OTP so the app can offer
 * to carry on instead of spending another SMS.
 */
export function liveTicket(now = Date.now()): { phone: string; exp: number } | null {
  const token = takeRegisterTicket()
  if (!token) return null

  try {
    const payload = token.slice(0, token.indexOf('.'))
    const body = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      phone?: string
      exp?: number
    }
    if (!body.phone || typeof body.exp !== 'number' || body.exp <= now) return null
    return { phone: body.phone, exp: body.exp }
  } catch {
    return null
  }
}
