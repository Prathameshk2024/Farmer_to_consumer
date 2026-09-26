import { test } from 'node:test'
import assert from 'node:assert/strict'

/**
 * MSG91 keeps its OTP session in page memory, and the phone screen and the OTP
 * screen are two routes. A reload between them - HMR in development, a dropped
 * connection, Android reclaiming a tab she backgrounded to go and read the SMS
 * - loses that session, and MSG91 then answers every code with
 * "reqId is required.". That reached her as "that OTP is wrong", so she retyped
 * the right code until she gave up: the one button that recovers it, "send
 * again", was itself a retry on the session that had gone.
 *
 * These tests are about that dead end. They run against ONE module instance in
 * order, because "this page load has not sent anything yet" is exactly the
 * state a reload leaves behind and cannot be re-entered afterwards.
 */

const PHONE = '9822011223'

/** What the widget was asked to do, in order. */
const calls: string[] = []
/** MSG91's message for the next verifyOtp, or null to let it succeed. */
let verifyFailsWith: string | null = null

function method(name: string) {
  return (_arg: string | null, ok: (v: unknown) => void, fail: (e: unknown) => void) => {
    calls.push(name)
    if (name === 'verifyOtp' && verifyFailsWith) fail({ message: verifyFailsWith })
    else ok({ message: 'access-token' })
  }
}

const win: Record<string, unknown> = {
  initSendOTP() {
    win.sendOtp = method('sendOtp')
    win.verifyOtp = method('verifyOtp')
    win.retryOtp = method('retryOtp')
  },
}

// The script never really loads here, so the stub is what fires onload.
Object.assign(globalThis, {
  window: win,
  document: {
    createElement: () => ({}) as Record<string, unknown>,
    head: {
      appendChild(script: { onload?: () => void }) {
        queueMicrotask(() => script.onload?.())
      },
    },
  },
})

const widget = await import('../src/lib/msg91Widget.js')

test('a code typed after a reload is refused as a lost session, not a wrong code', async () => {
  await assert.rejects(
    () => widget.verifyWidgetOtp('123456'),
    (e: Error) => e.message === widget.WIDGET_SESSION_LOST,
  )
  assert.deepEqual(calls, [], 'nothing should be asked of MSG91 without a session')
})

test('send again after a reload sends a NEW code rather than retrying a dead session', async () => {
  await widget.retryWidgetOtp(PHONE)
  assert.deepEqual(calls, ['sendOtp'])
})

test('send again within the same page load is a retry, so her SMS stays valid', async () => {
  calls.length = 0
  await widget.retryWidgetOtp(PHONE)
  assert.deepEqual(calls, ['retryOtp'])
})

test('verifying after a send returns the access token our server checks', async () => {
  assert.equal(await widget.verifyWidgetOtp('123456'), 'access-token')
})

test("MSG91's own \"reqId is required\" is reported as a lost session too", async () => {
  verifyFailsWith = 'reqId is required.'
  await assert.rejects(
    () => widget.verifyWidgetOtp('123456'),
    (e: Error) => e.message === widget.WIDGET_SESSION_LOST,
  )
})

test('a refused exchange spends the request, so send again opens a new one', async () => {
  // Our server would not take the token: MSG91 has already marked that request
  // verified, and a retry would resend against it and be refused identically.
  widget.forgetWidgetSession()
  calls.length = 0
  await widget.retryWidgetOtp(PHONE)
  assert.deepEqual(calls, ['sendOtp'], 'a spent request must not be retried')
})

test('"otp already verifed" spends the request, and send again fetches a new code', async () => {
  // The answer to the first attempt never arrived - the API was down - so
  // MSG91 has the request verified and will not do it again. Retrying against
  // it sends an SMS whose code is refused, which is the worst of both.
  await widget.sendWidgetOtp(PHONE)
  verifyFailsWith = 'otp already verifed'
  await assert.rejects(
    () => widget.verifyWidgetOtp('123456'),
    (e: Error) => e.message === widget.WIDGET_SESSION_LOST,
  )

  verifyFailsWith = null
  calls.length = 0
  await widget.retryWidgetOtp(PHONE)
  assert.deepEqual(calls, ['sendOtp'], 'a verified request must not be retried')
})
