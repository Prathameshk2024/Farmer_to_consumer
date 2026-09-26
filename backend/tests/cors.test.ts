import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { parseCorsOrigin } = await import('../src/config.js')

/**
 * Two front ends share one API: the farmer/customer app and the admin site,
 * deployed separately. `cors({ origin })` takes a list, but an environment
 * variable is one string - so "a.vercel.app,b.vercel.app" arrives as a single
 * literal origin that matches neither site, and every request from both is
 * blocked. Splitting it is the whole job.
 */

test('nothing configured allows any origin, so a fresh clone just runs', () => {
  assert.equal(parseCorsOrigin(undefined), true)
  assert.equal(parseCorsOrigin(''), true)
  assert.equal(parseCorsOrigin('   '), true)
})

test('an explicit star means the same thing', () => {
  assert.equal(parseCorsOrigin('*'), true)
})

test('one origin becomes a one-item list', () => {
  assert.deepEqual(parseCorsOrigin('https://f2c.vercel.app'), ['https://f2c.vercel.app'])
})

test('two origins are split, which is the case this exists for', () => {
  assert.deepEqual(
    parseCorsOrigin('https://f2c.vercel.app,https://f2c-admin.vercel.app'),
    ['https://f2c.vercel.app', 'https://f2c-admin.vercel.app'],
  )
})

test('spaces around the comma are forgiven', () => {
  assert.deepEqual(
    parseCorsOrigin(' https://a.vercel.app , https://b.vercel.app '),
    ['https://a.vercel.app', 'https://b.vercel.app'],
  )
})

test('a pasted trailing slash does not silently break matching', () => {
  // An Origin header never carries a path, so "https://a.app/" would match
  // nothing - and the failure looks like a CORS misconfiguration, not a typo.
  assert.deepEqual(parseCorsOrigin('https://a.vercel.app/'), ['https://a.vercel.app'])
})

test('empty segments and a trailing comma are ignored', () => {
  assert.deepEqual(parseCorsOrigin('https://a.vercel.app,,'), ['https://a.vercel.app'])
})

test('a list of nothing but separators is treated as unset', () => {
  assert.equal(parseCorsOrigin(',,  ,'), true)
})
