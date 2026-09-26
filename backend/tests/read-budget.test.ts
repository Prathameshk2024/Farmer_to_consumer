import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { documentCount, startsWithinFreeReads, summarise } = await import('../src/db/firestore.js')
const { emptyDb } = await import('../src/db/seed.js')

/**
 * THE SPARK PLAN'S READ BUDGET
 * ============================
 * Firestore is on Firebase's free plan: 50,000 reads a day, then refused. Every
 * server start reads every document once, and in production a start whose
 * reads are refused does not start at all. So the count the boot log and the admin dashboard
 * print has to be the count a start actually reads - all of it. The old line
 * named three collections, and the three it left out (sessions, the auth log,
 * reviews) are the ones that grow without anyone adding them by hand.
 */

test('every collection is counted, because every collection is read at start', () => {
  const db = emptyDb()
  for (const rows of Object.values(db)) (rows as { id: string }[]).push({ id: 'x' })

  assert.equal(documentCount(db), Object.keys(db).length)
  for (const name of Object.keys(db)) {
    assert.match(summarise(db), new RegExp(`\\b${name} 1\\b`), `${name} missing from the boot line`)
  }
})

test('the starts a day are what 50,000 reads buy at this size', () => {
  assert.equal(startsWithinFreeReads(5_000), 10)
  assert.equal(startsWithinFreeReads(26_000), 1)
  // Past 50,000 not even one start fits - the next one is refused.
  assert.equal(startsWithinFreeReads(50_001), 0)
  // An empty database must not divide by zero.
  assert.equal(startsWithinFreeReads(0), 50_000)
})
