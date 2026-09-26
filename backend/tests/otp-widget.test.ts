import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
process.env.MSG91_AUTH_KEY = 'test-auth-key'
process.env.MSG91_WIDGET_ID = 'test-widget-id'
delete process.env.NODE_ENV

const { msg91WidgetProvider } = await import('../src/services/otp.providers.js')

/**
 * THE MSG91 OTP WIDGET
 * ====================
 * The widget exists because it needs no DLT registration - MSG91's own
 * template and sender carry the message. The cost of that is that both halves
 * of the OTP happen in the browser, and the browser is the one place this
 * codebase has never been willing to trust with a login decision.
 *
 * What makes it safe is a single exchange: the widget hands the browser a JWT,
 * and the JWT is worthless until this server trades it with MSG91 - using an
 * auth key the browser does not have - for the number it was actually issued
 * for.
 *
 * The test that matters is the second one. A token proves that SOME number
 * passed an OTP. Accepting it without checking WHICH number would mean anyone
 * could verify their own phone, then post somebody else's in the body and be
 * handed her shop, her orders and her buyers' home addresses. That is the same
 * account-takeover shape as the "any four digits" hole in otp.test.ts, arriving
 * by a different door.
 */

const PHONE = '9822011223'
const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

/** Stub MSG91. Records what we sent so the request shape is checked too. */
function stubMsg91(body: unknown, opts: { ok?: boolean } = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    })
    return {
      ok: opts.ok ?? true,
      status: opts.ok === false ? 400 : 200,
      json: async () => body,
    } as Response
  }) as typeof fetch
  return calls
}

const provider = msg91WidgetProvider({ authKey: 'test-auth-key', widgetId: 'test-widget-id' })

test('a token issued for this number verifies', async () => {
  // MSG91 answers with the number in `message`, carrying the country code.
  stubMsg91({ type: 'success', message: `91${PHONE}` })
  assert.equal(await provider.verify!(PHONE, 'jwt.from.widget'), true)
})

test('a token issued for SOMEONE ELSE is refused', async () => {
  // The account-takeover regression. She verified her own phone honestly and
  // then claimed a different one; the token is genuine and must still not work.
  stubMsg91({ type: 'success', message: '919999988888' })
  assert.equal(await provider.verify!(PHONE, 'jwt.for.another.number'), false)
})

test('an error from MSG91 is refused, whatever it says', async () => {
  stubMsg91({ type: 'error', message: 'access token expired' })
  assert.equal(await provider.verify!(PHONE, 'stale.jwt'), false)

  // A non-2xx must not be read as a pass either, even shaped like a success.
  stubMsg91({ type: 'success', message: `91${PHONE}` }, { ok: false })
  assert.equal(await provider.verify!(PHONE, 'jwt'), false)
})

test('an unreachable MSG91 fails closed', async () => {
  globalThis.fetch = (async () => {
    throw new Error('ECONNREFUSED')
  }) as typeof fetch
  // Nobody gets signed in because the network was down. The alternative -
  // failing open - is an outage that hands out accounts.
  assert.equal(await provider.verify!(PHONE, 'jwt'), false)
})

test('a response with no number at all is refused', async () => {
  // Guards the shape assumption: if MSG91 ever stops putting the number in
  // `message`, this must fail closed rather than let everyone through.
  stubMsg91({ type: 'success' })
  assert.equal(await provider.verify!(PHONE, 'jwt'), false)
})

test('the auth key goes to MSG91, and never the other way', async () => {
  const calls = stubMsg91({ type: 'success', message: `91${PHONE}` })
  await provider.verify!(PHONE, 'jwt.from.widget')

  assert.equal(calls.length, 1)
  assert.match(calls[0]!.url, /\/api\/v5\/widget\/verifyAccessToken$/)
  assert.equal(calls[0]!.body.authkey, 'test-auth-key')
  assert.equal(calls[0]!.body['access-token'], 'jwt.from.widget')
})

test('sending is a no-op, because the widget already sent it', async () => {
  // /otp/send must not mint a local code in widget mode: it would leave a live
  // credential nobody can use and start a cooldown against a send we never made.
  const { sendOtp } = await import('../src/services/otp.service.js')
  const result = await sendOtp(PHONE)
  assert.equal(result.sent, true)
  assert.equal(result.demoCode, undefined, 'no code exists on this server to hand back')
})

test('the widget token survives the six-digit format check', async () => {
  // verifyOtp used to reject anything that was not six digits before it ever
  // reached the provider, which would have refused every widget token.
  const { verifyOtp } = await import('../src/services/otp.service.js')
  stubMsg91({ type: 'success', message: `91${PHONE}` })
  assert.deepEqual(await verifyOtp(PHONE, 'header.payload.signature'), { ok: true })
})
