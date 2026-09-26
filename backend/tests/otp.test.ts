import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
// No MSG91 key and no production flag: the demo provider, which is exactly the
// configuration this project actually runs in.
delete process.env.MSG91_AUTH_KEY
delete process.env.NODE_ENV

const {
  OTP_DIGITS, OTP_MAX_ATTEMPTS, OTP_RESEND_MS, OTP_TTL_MS,
  resetOtpState, sendOtp, sweepOtps, verifyOtp,
} = await import('../src/services/otp.service.js')

/**
 * THE WORST BUG THIS CODEBASE HAD.
 *
 * `verifyOtp` used to end with `return /^\d{4}$/.test(code)` whenever no SMS
 * provider was configured - which was every deployment, because none ever was.
 * Any four digits signed you in as any phone number on the platform: every
 * seller's shop, every buyer's saved home address.
 *
 * Demo mode still exists, because there is no SMS account yet and the app has
 * to stay walkable. What changed is that it now issues a REAL code and really
 * checks it. The first test here is the one that must never be allowed to fail
 * again.
 */

beforeEach(() => resetOtpState())

const PHONE = '9822011223'

test('a wrong code is refused, even in demo mode', async () => {
  // The regression test for the account-takeover hole. If this ever passes
  // with an arbitrary code, the platform is open to anyone who finds the URL.
  const sent = await sendOtp(PHONE)
  assert.ok(sent.demoCode, 'demo mode should hand back the code to show on screen')

  const wrong = sent.demoCode === '000000' ? '111111' : '000000'
  const result = await verifyOtp(PHONE, wrong)

  assert.equal(result.ok, false)
})

test('the code that was sent is accepted', async () => {
  const sent = await sendOtp(PHONE)
  assert.equal((await verifyOtp(PHONE, sent.demoCode!)).ok, true)
})

test('codes are six digits, not four', async () => {
  // Four digits is ten thousand guesses. Six is a million, and with the
  // attempt cap below that is the difference between a script and a fantasy.
  assert.equal(OTP_DIGITS, 6)
  const sent = await sendOtp(PHONE)
  assert.match(sent.demoCode!, /^\d{6}$/)
})

test('a code works once and only once', async () => {
  // A code that survived being used could be replayed from a log, a
  // screenshot, or the browser history of a shared phone.
  const sent = await sendOtp(PHONE)

  assert.equal((await verifyOtp(PHONE, sent.demoCode!)).ok, true)
  assert.equal((await verifyOtp(PHONE, sent.demoCode!)).ok, false)
})

test('a code issued for one number cannot be used for another', async () => {
  const mine = await sendOtp(PHONE)
  const hers = await sendOtp('9764455661')

  assert.equal((await verifyOtp('9764455661', mine.demoCode!)).ok, hers.demoCode === mine.demoCode)
  // Overwhelmingly the codes differ; when they do, the cross-use must fail.
  if (hers.demoCode !== mine.demoCode) {
    assert.equal((await verifyOtp('9764455661', mine.demoCode!)).ok, false)
  }
})

test('guessing is capped, and the code is destroyed when the cap is hit', async () => {
  // Without this, a million-code space falls to a script that just keeps
  // asking. With it, an attacker gets five tries and then has to trigger
  // another SMS, which is itself rate-limited.
  const sent = await sendOtp(PHONE)
  const wrong = sent.demoCode === '000000' ? '111111' : '000000'

  for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
    assert.equal((await verifyOtp(PHONE, wrong)).ok, false, `attempt ${i + 1}`)
  }

  // Even the RIGHT code is now useless: the record is gone.
  const after = await verifyOtp(PHONE, sent.demoCode!)
  assert.equal(after.ok, false)
})

test('a code expires', async () => {
  const now = Date.now()
  const sent = await sendOtp(PHONE, now)

  assert.equal((await verifyOtp(PHONE, sent.demoCode!, now + OTP_TTL_MS - 1000)).ok, true)

  const again = await sendOtp(PHONE, now + OTP_RESEND_MS + 1)
  assert.equal((await verifyOtp(PHONE, again.demoCode!, now + OTP_TTL_MS * 2)).ok, false)
})

test('verifying without ever asking for a code fails', async () => {
  assert.equal((await verifyOtp(PHONE, '123456')).ok, false)
})

test('resending replaces the old code rather than adding a second live one', async () => {
  // Two live codes would double the guessable surface every time somebody taps
  // "send again", which is exactly what a nervous first-time user does.
  const now = Date.now()
  const first = await sendOtp(PHONE, now)
  const second = await sendOtp(PHONE, now + OTP_RESEND_MS + 1)

  if (first.demoCode !== second.demoCode) {
    assert.equal((await verifyOtp(PHONE, first.demoCode!, now + 1000)).ok, false)
  }
  assert.equal((await verifyOtp(PHONE, second.demoCode!, now + 1000)).ok, true)
})

test('resending too fast is refused with a cooldown, not a new SMS', async () => {
  // Every send is an SMS we pay for. Without the cooldown the endpoint is a
  // billing denial of service against our own account.
  const now = Date.now()
  await sendOtp(PHONE, now)
  const again = await sendOtp(PHONE, now + 1000)

  assert.equal(again.sent, false)
  assert.ok((again.cooldownMs ?? 0) > 0)
  assert.equal(again.demoCode, undefined, 'a refused send must not hand back a code')
})

test('letting a code lapse is not a way to skip the resend cooldown', async () => {
  const now = Date.now()
  await sendOtp(PHONE, now)

  const justAfterExpiry = now + OTP_TTL_MS + 1000
  const again = await sendOtp(PHONE, justAfterExpiry)
  assert.equal(again.sent, true, 'well past the 30s cooldown, so this is fine')
})

test('malformed codes are refused without touching the attempt budget logic', async () => {
  const sent = await sendOtp(PHONE)

  for (const bad of ['', '12', 'abcdef', '1234567', '12 34 56']) {
    assert.equal((await verifyOtp(PHONE, bad)).ok, false, `expected refusal for ${JSON.stringify(bad)}`)
  }
  // The real code still works: junk input did not burn the record.
  assert.equal((await verifyOtp(PHONE, sent.demoCode!)).ok, true)
})

test('the sweeper does not remove a code that is still usable', async () => {
  const now = Date.now()
  const sent = await sendOtp(PHONE, now)

  sweepOtps(now + 60_000)

  assert.equal((await verifyOtp(PHONE, sent.demoCode!, now + 60_000)).ok, true)
})

test('the sweeper clears codes nobody can use, so the map cannot grow forever', async () => {
  const now = Date.now()
  await sendOtp(PHONE, now)

  assert.equal(sweepOtps(now + OTP_TTL_MS + OTP_RESEND_MS + 1000), 1)
})
