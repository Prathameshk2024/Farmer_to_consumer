/**
 * MSG91 OTP WIDGET — THE BROWSER HALF
 * ===================================
 * Chosen because it needs no DLT registration: the template and the sender ID
 * are MSG91's, not ours. The cost is that sending and checking the code both
 * happen out here, in the browser.
 *
 * That does NOT mean the browser decides who is signed in. The widget hands
 * back a signed JWT, not a verdict, and the JWT is worth nothing until the
 * server trades it with MSG91 — using an auth key that is not in this bundle —
 * for the number it was actually issued for. See backend
 * services/otp.providers.ts; the phone comparison there is the whole security
 * of the flow.
 *
 * `exposeMethods: true` is deliberate. Left to itself the widget renders its
 * own modal: English, its own type sizes, its own buttons. This app has design
 * rules that are constraints rather than preferences — 16px minimum, 56px
 * buttons, Marathi first — so we take the three methods and keep our own OTP
 * screen.
 *
 * With no widget configured every function here is unreachable: `widgetEnabled`
 * is false and Auth.tsx stays on the server-side code path, which is what a
 * fresh clone with no MSG91 account runs.
 */

const WIDGET_ID = import.meta.env?.VITE_MSG91_WIDGET_ID
const TOKEN_AUTH = import.meta.env?.VITE_MSG91_TOKEN_AUTH
const SCRIPT_SRC = 'https://verify.msg91.com/otp-provider.js'

/** Both, or neither. A widget id with no token auth cannot send anything. */
export const widgetEnabled = Boolean(WIDGET_ID && TOKEN_AUTH)

/**
 * How many digits MSG91 sends, from the widget's own dashboard setting.
 *
 * It is configurable there, and a mismatch is silent and total: our OTP boxes
 * would never fill, so the verify button would never enable and she could not
 * log in at all. Cheaper as one variable than as a support call.
 */
export const widgetOtpLength = Number(import.meta.env?.VITE_MSG91_OTP_LENGTH) || 6

type Ok = (data: unknown) => void
type Fail = (err: unknown) => void

declare global {
  interface Window {
    initSendOTP?: (config: Record<string, unknown>) => void
    sendOtp?: (identifier: string, success: Ok, failure: Fail) => void
    verifyOtp?: (otp: string, success: Ok, failure: Fail) => void
    retryOtp?: (channel: string | null, success: Ok, failure: Fail) => void
  }
}

/** Loaded once per page, however many times she goes back and forth. */
let loading: Promise<void> | null = null

/**
 * WHO THIS PAGE LOAD SENT A CODE TO
 * =================================
 * MSG91 keeps its OTP session - the reqId - in page memory, and the phone
 * screen and the OTP screen are two routes. Any reload between them loses it,
 * and then every code she types comes back "reqId is required.", which reaches
 * her as "that OTP is wrong" and sends her back to the keypad for ever.
 *
 * A reload there is not exotic: HMR does it in development, a dropped
 * connection does it, and Android does it to a tab that was backgrounded while
 * she went to read the SMS - which is the one thing this screen asks her to do.
 *
 * Nothing recovers a lost reqId, so the only honest answer is a fresh send.
 * Remembering the number this page sent to is what lets "send again" be that.
 */
let sentTo: string | null = null

/**
 * Thrown when the widget has no session for the code she is typing. Auth.tsx
 * matches on it to point her at "send again" rather than at the keypad.
 */
export const WIDGET_SESSION_LOST = 'msg91-widget-session-lost'

/**
 * `initSendOTP` does not attach the three methods synchronously, so checking
 * for them the instant it returns reports them missing on a slow connection
 * and works fine on a fast one - the worst kind of bug to be handed by a
 * seller in a village.
 *
 * Waiting is also what turns a silent nothing into a named failure: if they
 * never arrive, that is the widget refusing this origin, and saying so here
 * beats "sendOtp is not available" from three frames deeper.
 */
async function waitForMethods(timeoutMs = 5000): Promise<void> {
  const started = Date.now()
  while (!window.sendOtp) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        'MSG91 widget loaded but never exposed sendOtp - check the widget id, ' +
          'the token auth, and that this origin is in its allowed domains',
      )
    }
    await new Promise((r) => setTimeout(r, 50))
  }
}

function loadWidget(): Promise<void> {
  if (loading) return loading

  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = async () => {
      if (!window.initSendOTP) {
        loading = null
        reject(new Error('MSG91 widget loaded but initSendOTP is missing'))
        return
      }
      try {
        window.initSendOTP({
          widgetId: WIDGET_ID,
          tokenAuth: TOKEN_AUTH,
          // Keep our own screens; take only the three methods.
          exposeMethods: true,
          /**
           * Required even with exposeMethods, and the widget throws
           * "success callback function missing !" without them - then never
           * attaches window.sendOtp, so the real failure surfaces later and
           * somewhere else entirely.
           *
           * With exposeMethods these two are not the ones that carry the
           * result; the per-call callbacks in `call()` are. Nothing may depend
           * on these firing.
           */
          success: () => {},
          failure: () => {},
        })
      } catch (err) {
        loading = null
        reject(new Error(`MSG91 initSendOTP failed: ${(err as Error).message}`))
        return
      }

      try {
        await waitForMethods()
        resolve()
      } catch (err) {
        loading = null
        reject(err as Error)
      }
    }
    script.onerror = () => {
      // Let the next attempt try again rather than caching the failure for the
      // life of the page — on a village connection one dropped script must not
      // mean she can never log in without a full reload.
      loading = null
      reject(new Error('MSG91 widget script failed to load'))
    }
    document.head.appendChild(script)
  })

  return loading
}

/**
 * The widget's callbacks are not promises and report failure as a value rather
 * than a throw, so every one of them is wrapped here. `settled` matters: a
 * provider that called both callbacks would otherwise resolve and then reject.
 */
function call(
  method: 'sendOtp' | 'verifyOtp' | 'retryOtp',
  arg: string | null,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const fn = window[method]
    if (!fn) {
      reject(new Error(`MSG91 ${method} is not available`))
      return
    }
    let settled = false
    const done = <T>(f: (v: T) => void) => (v: T) => {
      if (settled) return
      settled = true
      f(v)
    }
    ;(fn as (a: string | null, s: Ok, f: Fail) => void)(
      arg,
      done(resolve),
      done((err) => reject(new Error(messageFrom(err)))),
    )
  })
}

/** MSG91 reports errors as `{ message }`, sometimes as a bare string. */
function messageFrom(err: unknown): string {
  if (typeof err === 'string') return err
  const m = (err as { message?: unknown })?.message
  return typeof m === 'string' ? m : 'OTP failed'
}

/**
 * Forget this page's session, so "send again" opens a NEW one.
 *
 * MSG91 verifies a request exactly once. After that it still answers
 * `verifyOtp` with a token, but a token carrying no expiry that
 * verifyAccessToken refuses - so a request our server would not take is spent
 * for good. `retryOtp` resends against that same spent request, which means
 * the SMS arrives and the code is still refused. Only a fresh `sendOtp` gets a
 * new reqId, and this is what makes the resend button reach for one.
 */
export function forgetWidgetSession(): void {
  sentTo = null
}

/** Send the code. `identifier` carries the country code; the app never does. */
export async function sendWidgetOtp(phone: string): Promise<void> {
  await loadWidget()
  await call('sendOtp', `91${phone}`)
  sentTo = phone
}

/**
 * Ask for it again over SMS. `null` is MSG91's text channel.
 *
 * `retryOtp` needs the same reqId `verifyOtp` does, so after a reload it fails
 * exactly the way verifying does. A fresh send is the only way back, and this
 * is already the button she is looking at when it happens.
 */
export async function retryWidgetOtp(phone: string): Promise<void> {
  if (sentTo !== phone) {
    await sendWidgetOtp(phone)
    return
  }
  await loadWidget()
  await call('retryOtp', null)
}

/**
 * Check the code with MSG91 and return the access token.
 *
 * The token is what goes to our own /auth/otp/verify. Getting one here means
 * MSG91 accepted the code — it does not mean she is signed in, and nothing in
 * this file should ever be read as if it did.
 */
export async function verifyWidgetOtp(code: string): Promise<string> {
  // No send from THIS page load means MSG91 has nothing to check the code
  // against, however right the six digits in her hand are.
  if (!sentTo) throw new Error(WIDGET_SESSION_LOST)

  await loadWidget()
  const data = await call('verifyOtp', code).catch((err: Error) => {
    /**
     * MSG91's two ways of saying the same thing:
     *   "reqId is required."  the page reloaded and took the session with it
     *   "otp already verifed" this request was verified by an attempt whose
     *                         answer never reached us - the server was down,
     *                         the network dropped, the seller pressed twice
     * Either way MSG91 will not verify that request again, so those digits are
     * spent however right they were. Drop the session so the resend button
     * fetches a NEW code instead of retrying against a dead one.
     */
    if (/reqid|already verif/i.test(err.message)) {
      forgetWidgetSession()
      throw new Error(WIDGET_SESSION_LOST)
    }
    throw err
  })

  const token = (data as { message?: unknown })?.message
  if (typeof token !== 'string' || !token) {
    throw new Error('MSG91 verified the code but returned no access token')
  }
  return token
}
