import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Firestore } from 'firebase-admin/firestore'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { persistDiff, unsavedChanges } = await import('../src/db/firestore.js')
const { emptyDb } = await import('../src/db/seed.js')

/**
 * A WRITE FIRESTORE REFUSED MUST BE SENT AGAIN
 * ============================================
 * persistDiff used to record a change as saved before the commit carrying it.
 * When that commit failed - on the Spark plan, every write after the day's
 * 20,000th - the next diff found nothing new and sent nothing, and the change
 * lived in memory only until the next start threw it away: an order placed
 * that afternoon, gone. A change counts as saved once Firestore has taken it,
 * and not before.
 */

/** A Firestore whose first `failures` commits are refused, as Spark refuses them. */
function firestore(failures: number) {
  const sent: string[] = []
  const fs = {
    collection: (name: string) => ({ doc: (id: string) => `${name}/${id}` }),
    batch: () => {
      const ops: string[] = []
      return {
        set: (ref: string) => void ops.push(`set ${ref}`),
        delete: (ref: string) => void ops.push(`delete ${ref}`),
        async commit() {
          if (failures-- > 0) throw new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.')
          sent.push(...ops)
        },
      }
    },
  }
  return { fs: fs as unknown as Firestore, sent }
}

// One database across both tests, as in the server: what the first one saves
// is what the second one's diff is taken against.
const db = emptyDb()

test('a write that was refused is sent again by the next persist', async () => {
  db.orders.push({ id: 'o1', status: 'PLACED' } as never)
  const refusing = firestore(1)

  await assert.rejects(persistDiff(db, refusing.fs))
  assert.deepEqual(refusing.sent, [])
  assert.equal(unsavedChanges(db), 1, 'the order must still count as unsaved')

  const result = await persistDiff(db, refusing.fs)
  assert.deepEqual(refusing.sent, ['set orders/o1'])
  assert.equal(result.written, 1)
  assert.equal(unsavedChanges(db), 0)

  // Accepted once, it is not sent a second time.
  assert.equal((await persistDiff(db, refusing.fs)).written, 0)
})

test('a deletion that was refused is sent again by the next persist', async () => {
  db.orders.splice(0, 1)
  const refusing = firestore(1)

  await assert.rejects(persistDiff(db, refusing.fs))
  assert.equal(unsavedChanges(db), 1, 'the deletion must still count as unsent')

  await persistDiff(db, refusing.fs)
  assert.deepEqual(refusing.sent, ['delete orders/o1'])
  assert.equal(unsavedChanges(db), 0)
})
