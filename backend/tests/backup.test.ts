import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const {
  BACKED_UP, stableJson, planCollection, shrinkProblems, readTargets, pickTargets,
  snapshotName, snapshotsToPrune, parseSnapshot, imagePublicIds,
} = await import('../src/db/backupPlan.js')
const { COLLECTIONS } = await import('../src/db/firestore.js')

/**
 * The backup is a copy into free projects on other accounts, because the live
 * one is on the Spark plan and has no managed backups. These are the rules
 * that decide what that copy does; scripts/backup.ts only carries them out.
 */

const docs = (entries: Record<string, unknown>) => new Map(Object.entries(entries))

test('every collection the app persists is backed up, except live credentials', () => {
  // A collection added to the app and not to the backup would be the one
  // thing missing on the day it is needed.
  assert.deepEqual([...BACKED_UP], COLLECTIONS.filter((c) => c !== 'sessions'))
  assert.ok(!BACKED_UP.includes('sessions' as never), 'a copied session is a stolen session')
  assert.ok(BACKED_UP.includes('admins'), 'without admins nobody can sign in to a restored console')
})

test('two reads of one document compare equal whatever order their fields came in', () => {
  assert.equal(stableJson({ a: 1, b: { c: [1, { d: 2, e: 3 }] } }), stableJson({ b: { c: [1, { e: 3, d: 2 }] }, a: 1 }))
  assert.notEqual(stableJson({ a: 1 }), stableJson({ a: 2 }))
})

test('only what differs is written, so a daily run does not spend the free write quota', () => {
  const live = docs({ s1: { name: 'Sunita' }, s2: { name: 'Asha' }, s3: { name: 'Meena' } })
  const backup = docs({ s1: { name: 'Sunita' }, s2: { name: 'Asha (old)' } })
  assert.deepEqual(planCollection(live, backup), { write: ['s2', 's3'], remove: [] })
})

test('the backup mirrors deletions, so a restore does not bring back what was removed', () => {
  // Purged demo sellers and deleted drafts would otherwise all reappear on
  // the day the backup is restored.
  const live = docs({ s1: { name: 'Sunita' } })
  const backup = docs({ s1: { name: 'Sunita' }, s9: { name: 'Demo' } })
  assert.deepEqual(planCollection(live, backup), { write: [], remove: ['s9'] })
})

test('a live project that lost more than half a collection is not copied over the backup', () => {
  // 10 September 2026: sellers and products briefly empty in the live
  // project. A backup taken then must keep its six women, not delete them.
  const problems = shrinkProblems(
    { sellers: 0, products: 0, orders: 40 },
    { sellers: 6, products: 13, orders: 40 },
  )
  assert.equal(problems.length, 2)
  assert.match(problems[0]!, /sellers: 6 in the backup, only 0 live/)
})

test('ordinary change is not a wipe', () => {
  assert.deepEqual(shrinkProblems({ sellers: 20, products: 30 }, { sellers: 21, products: 40 }), [])
  // Small collections empty legitimately, the same threshold as isBulkDelete.
  assert.deepEqual(shrinkProblems({ sellers: 3, admins: 0 }, { sellers: 3, admins: 2 }), [])
  // The auth log prunes itself on a schedule of its own.
  assert.deepEqual(shrinkProblems({ authEvents: 3 }, { authEvents: 400 }), [])
})

test('an empty live read is refused against any non-empty backup, however small', () => {
  assert.equal(shrinkProblems({ sellers: 0, admins: 0 }, { sellers: 2, admins: 1 }).length, 1)
  // A first run into an empty backup has nothing to protect.
  assert.deepEqual(shrinkProblems({ sellers: 0 }, { sellers: 0 }), [])
})

test('targets are read from the environment, with a mistake named rather than skipped', () => {
  const account = JSON.stringify({ project_id: 'smb-backup-a', client_email: 'x@y', private_key: 'k' })
  const { targets, problems } = readTargets(
    {
      BACKUP_TARGETS: 'a, b, c',
      BACKUP_A_FIREBASE_SERVICE_ACCOUNT: Buffer.from(account).toString('base64'),
      BACKUP_A_CLOUDINARY_URL: 'cloudinary://key:secret@smb-backup',
      BACKUP_B_CLOUDINARY_URL: 'not a url',
    },
    'shanta-mahila-bazar',
  )
  assert.equal(targets[0]!.firestore!.projectId, 'smb-backup-a')
  assert.equal(targets[0]!.cloudinary!.cloudName, 'smb-backup')
  assert.equal(problems.length, 2)
  assert.match(problems[0]!, /BACKUP_B_CLOUDINARY_URL is malformed/)
  assert.match(problems[1]!, /"c" has neither/)
})

test('one target per run, rotating by day, so the other still holds yesterday', () => {
  const targets = [{ name: 'a' }, { name: 'b' }]
  const today = pickTargets(targets, [], new Date('2026-09-23T02:00:00Z')).chosen
  const tomorrow = pickTargets(targets, [], new Date('2026-09-24T02:00:00Z')).chosen
  assert.equal(today.length, 1)
  assert.notEqual(today[0]!.name, tomorrow[0]!.name)
})

test('--to names targets explicitly, and a name that does not exist is reported', () => {
  const targets = [{ name: 'a' }, { name: 'b' }]
  assert.deepEqual(pickTargets(targets, ['a', 'b'], new Date()).chosen.map((t) => t.name), ['a', 'b'])
  assert.deepEqual(pickTargets(targets, ['z'], new Date()).unknown, ['z'])
})

test('the local copy is named by the time it was taken, so names sort by date', () => {
  assert.equal(snapshotName(new Date('2026-09-23T10:30:45Z')), 'firestore-2026-09-23T10-30.json.gz')
})

test('local copies: every day of the last month, then the first of each month for good', () => {
  const now = new Date('2026-09-23T10:00:00Z')
  const names = [
    'firestore-2026-06-01T02-00.json.gz', // first of June - kept for good
    'firestore-2026-06-02T02-00.json.gz',
    'firestore-2026-07-15T02-00.json',    // first of July, written before gzip - kept
    'firestore-2026-07-16T02-00.json',
    'firestore-2026-08-20T02-00.json.gz', // first of August, and inside no window - kept
    'firestore-2026-08-24T02-00.json.gz', // 30 days ago - kept
    'firestore-2026-09-22T02-00.json.gz',
    'images',                             // not a snapshot - never touched
    'notes.txt',
  ]
  assert.deepEqual(snapshotsToPrune(names, now, 30), [
    'firestore-2026-06-02T02-00.json.gz',
    'firestore-2026-07-16T02-00.json',
  ])
})

test('a short history loses nothing', () => {
  const now = new Date('2026-09-23T10:00:00Z')
  assert.deepEqual(snapshotsToPrune(['firestore-2026-09-22T02-00.json.gz'], now, 30), [])
  assert.deepEqual(snapshotsToPrune([], now, 30), [])
})

test('a local copy is read back as the backed-up collections, and never as sessions', () => {
  const { collections, problems } = parseSnapshot({
    sessions: [{ id: 'sess_1' }],
    sellers: [{ id: 's1', name: 'Sunita' }],
    orders: [],
  })
  assert.deepEqual(problems, [])
  // A restore that wrote sessions would sign out everybody using the app.
  assert.ok(!collections.has('sessions'))
  assert.deepEqual([...collections.get('sellers')!.keys()], ['s1'])
  // Present and empty is a fact about the file; the restore checks it.
  assert.equal(collections.get('orders')!.size, 0)
})

test('a collection the file does not have is left alone, not read as empty', () => {
  // An old copy predating `reviews` must not empty the live reviews.
  const { collections } = parseSnapshot({ sellers: [{ id: 's1' }] })
  assert.ok(!collections.has('reviews'))
})

test('a file that is not a database copy is refused, not restored', () => {
  assert.equal(parseSnapshot([1, 2]).problems.length, 1)
  assert.equal(parseSnapshot({ unrelated: [] }).problems.length, 1)
  assert.match(parseSnapshot({ sellers: [{ name: 'no id' }] }).problems[0]!, /no id/)
})

test('a downloaded photo goes back under the public_id it was saved from', () => {
  // The database stores full URLs, so the id - not the file - is what matters.
  assert.deepEqual(
    imagePublicIds(
      [
        'shanta-mahila-bazar\\product\\abc123.jpg',
        'shanta-mahila-bazar/payment/xyz.png',
        'something-else/photo.jpg',
      ],
      'shanta-mahila-bazar',
    ),
    [
      { path: 'shanta-mahila-bazar\\product\\abc123.jpg', publicId: 'shanta-mahila-bazar/product/abc123' },
      { path: 'shanta-mahila-bazar/payment/xyz.png', publicId: 'shanta-mahila-bazar/payment/xyz' },
    ],
  )
})

test('a restore describes the shrink in its own direction', () => {
  const [problem] = shrinkProblems({ sellers: 1 }, { sellers: 19 }, {
    source: 'in the file', sourceWhole: 'the file', target: 'shantaimahilabajar',
  })
  assert.equal(problem, 'sellers: 19 in shantaimahilabajar, only 1 in the file')
})
