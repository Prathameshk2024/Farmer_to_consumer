/**
 * HOW A CODE ACTUALLY REACHES HER PHONE
 * =====================================
 * The delivery channel, and nothing else. Generating the code, hashing it,
 * expiring it and capping the guesses all stay in otp.service.ts, so swapping
 * MSG91 for Twilio - or plugging one in for the first time - changes only this
 * file and cannot weaken any of those properties by accident.
 *
 * `verify` is optional on purpose. Most gateways just send an SMS and we check
 * the code ourselves; a few (MSG91 Verify, Twilio Verify) own the code and
 * check it for you. The service handles both, and prefers to own the code,
 * because that is what keeps the attempt cap and the single-use rule ours.
 *
 * NOTHING HERE MAY LOG A CODE outside demo mode. A code in a log file is a
 * credential in a log file.
 */

import { samePhone } from '@shared/seller.js'


export interface OtpProvider {
  /** Shown in the boot banner, so it is obvious which one is live. */
  name: string
  /** Returns false if delivery failed; the service then discards the code. */
  send(phone: string, code: string): Promise<boolean>
  /** Only for gateways that own the code themselves. */
  verify?(phone: string, code: string): Promise<boolean>
}

export interface Msg91Config {
  authKey: string
  templateId: string
  sender: string
}

export interface Msg91WidgetConfig {
  authKey: string
  widgetId: string
}

/**
 * MSG91 OTP WIDGET
 * ================
 * Chosen because it needs no DLT registration: the widget is MSG91's own
 * hosted flow, so the template and sender ID are theirs, not ours.
 *
 * That moves sending AND checking into the browser, which is normally the one
 * thing this file refuses to allow. What makes it safe is that the widget hands
 * the browser a signed JWT rather than a verdict, and the JWT means nothing
 * until this server exchanges it with MSG91 for the number it was issued for.
 * The browser never gets to assert "she passed"; it can only carry a token we
 * re-check with the auth key it does not have.
 *
 *   browser: widget sends + collects the code -> access-token (JWT)
 *   browser: POST /api/auth/otp/verify { phone, code: <access-token> }
 *   server:  POST verifyAccessToken { authkey, access-token } -> the number
 *
 * The last step is the whole security of it, and the phone comparison below is
 * the part that is easy to leave out: a token proves that SOME number was
 * verified, and without checking WHICH, anyone could verify their own phone and
 * then send somebody else's in the body.
 */
export function msg91WidgetProvider(cfg: Msg91WidgetConfig): OtpProvider {
  return {
    name: `MSG91 widget (${cfg.widgetId})`,

    // The widget already sent it, from the browser, before this server heard
    // about the attempt at all. /otp/send stays a no-op so the client can call
    // it harmlessly.
    async send() {
      return true
    },

    async verify(phone, accessToken) {
      try {
        const resp = await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ authkey: cfg.authKey, 'access-token': accessToken }),
          signal: AbortSignal.timeout(10_000),
        })

        const body = (await resp.json()) as { type?: string; message?: string; code?: string }

        if (!resp.ok || body.type !== 'success') {
          /**
           * The code matters more than the message. MSG91 answers 200 with
           * "AuthenticationFailure" for two completely different faults, and
           * only `code` separates them: 418 API Security: this server's IP is
           * not on the auth key's whitelist. MSG91 never looks at the token,
           * so it fails identically for every code, on every phone, for ever -
           * and reads on screen as "that OTP is wrong". A day was spent on
           * that once. Dashboard -> username -> Authkey -> Actions. 701 the
           * token is bad, expired, or already spent. The only one of these the
           * seller can cause, and the one that means the flow is working -
           * MSG91 got as far as looking at the token. 201 OUR auth key is
           * wrong or deleted - nobody can ever log in 701 "invalid
           * access-token". The ONLY one of these that is
           *        ordinary: the key was accepted and the token itself is bad
           *        or expired, which is what a mistyped code looks like.
           *        Seeing 701 for a bogus token is how you prove a new auth
           *        key works, without sending an SMS.
           * Logging the message alone sends you looking at the wrong half.
           * Never the token itself; it is a live credential.
           */
          console.error(
            '[otp] widget token rejected:', resp.status, body.type, body.message,
            body.code
              ? `(code ${body.code}${
                body.code === '201' ? ' - CHECK MSG91_AUTH_KEY' : ''
              }${
                body.code === '418'
                  ? " - MSG91 API Security: whitelist this server's IP on the auth key"
                  : ''
              })`
              : '',
          )
          return false
        }

        // On success `message` carries the identifier the token was issued for,
        // with the country code: "919822011223". samePhone normalises both
        // sides, so a token for another number simply does not match.
        const mine = samePhone(body.message, phone)

        // This branch used to answer 401 and log nothing, which reads from the
        // outside exactly like a rejected token - the same screen, the same
        // status, and a debugging session spent on the wrong half. Last four
        // digits only: enough to see that two different numbers are in play,
        // and not a phone number in a log file.
        if (!mine) {
          const tail = (v: unknown) => String(v ?? '').slice(-4)
          console.error(
            '[otp] widget token is for another number:',
            `...${tail(body.message)} != ...${tail(phone)}`,
          )
        }

        return mine
      } catch (err) {
        console.error('[otp] MSG91 widget unreachable:', (err as Error).message)
        return false
      }
    },
  }
}

/**
 * MSG91, used as a plain sender.
 *
 * We hand it a code we generated and keep the authority over expiry, attempt
 * limits and single use. Delegating verification to MSG91 would hand all three
 * to a third party's defaults, and a login is not the place to inherit
 * somebody else's policy.
 *
 * The auth key never leaves this process. It must not be bundled into the
 * frontend under any circumstance.
 */
export function msg91Provider(cfg: Msg91Config): OtpProvider {
  return {
    name: 'MSG91',
    async send(phone, code) {
      const url = new URL('https://control.msg91.com/api/v5/otp')
      url.searchParams.set('template_id', cfg.templateId)
      url.searchParams.set('mobile', `91${phone}`)
      url.searchParams.set('otp', code)
      url.searchParams.set('sender', cfg.sender)

      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { authkey: cfg.authKey, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10_000),
        })
        if (!resp.ok) {
          // The status and MSG91's message, never the code.
          console.error('[otp] MSG91 send failed', resp.status, await resp.text())
          return false
        }
        return true
      } catch (err) {
        console.error('[otp] MSG91 unreachable:', (err as Error).message)
        return false
      }
    },
  }
}

/**
 * No SMS account, so the code comes back in the response and the app shows it
 * on the OTP screen.
 *
 * This is NOT the old "any four digits" bypass. A real code is generated,
 * hashed, expired and attempt-capped exactly as in production; the only
 * difference is the delivery channel, which is the screen instead of the
 * network. Everything the security of the flow rests on is identical, so the
 * demo exercises the real path rather than a parallel one that has never been
 * tested.
 *
 * Refused in production by config.ts, because a code returned in an HTTP
 * response is a code anybody can read.
 */
export function demoProvider(): OtpProvider {
  return {
    name: 'demo (code shown on screen)',
    async send(phone, code) {
      console.log(`[otp] demo - code for ${phone} is ${code}`)
      return true
    },
  }
}
