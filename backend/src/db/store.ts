import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IS_PROD, SEED_DEMO_DATA, usingFirestore } from '../config.js'
import { type Db, emptyDb, seed, withDefaults } from './seed.js'
import {
  STARTS_WARNING, documentCount, loadAll, persistDiff, seedInto, startsWithinFreeReads, summarise,
  unsavedChanges,
} from './firestore.js'

/**
 * Persistence.
 *
 * Two drivers behind one synchronous interface, chosen by whether Firebase
 * credentials are present:
 *
 *   Firestore   when FIREBASE_* is configured
 *   JSON file   otherwise, so the app still runs with no accounts at all
 *
 * `getDb()` stays synchronous in both cases — the whole dataset lives in
 * memory and writes go through in the background. See firestore.ts for why,
 * and for the single-instance limitation that comes with it.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(here, '../../data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

// Empty until initStore() runs. Not the demo seed: a route that fires before
// boot finishes should find nothing, not three invented sellers.
let db: Db = emptyDb()
let ready = false

/**
 * Starts as `usingFirestore`, but drops to false if the connection cannot be
 * established at boot — an expired gcloud login, a missing key, no network.
 *
 * Reads and writes must agree on this. Leaving writes pointed at Firestore
 * after reads had fallen back would drop every change on the floor: the
 * per-write catch below would log and continue, and nothing would reach the
 * JSON file either.
 */
let firestoreLive = usingFirestore

/* ------------------------------------------------------------------ */
/* JSON file driver                                                    */
/* ------------------------------------------------------------------ */

function loadFile(): Db {
  try {
    if (fs.existsSync(DB_FILE)) {
      // withDefaults, because a file written before `customers` existed would
      // otherwise hand every route an undefined collection.
      return withDefaults(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as Partial<Db>)
    }
  } catch (err) {
    console.warn('[db] could not read db.json, reseeding:', (err as Error).message)
  }
  // Same rule as the Firestore path: no stored data does not mean invent some.
  const fresh = SEED_DEMO_DATA ? seed() : emptyDb()
  writeFile(fresh)
  return fresh
}

function writeFile(next: Db): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(DB_FILE, JSON.stringify(next, null, 2), 'utf8')
  } catch (err) {
    console.error('[db] write failed:', (err as Error).message)
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

/** Must be awaited before the server starts listening. */
export async function initStore(): Promise<void> {
  if (firestoreLive) {
    try {
      const loaded = await loadAll()
      if (loaded) {
        db = loaded
        console.log('[firestore] loaded', summarise(db))
        const starts = startsWithinFreeReads(documentCount(db))
        if (starts <= STARTS_WARNING) {
          console.warn(
            `[firestore] only ${starts} start(s) a day now fit in the Spark plan's free reads. ` +
              'A day with more cold starts, deploys or console browsing runs out, and the next ' +
              'start is REFUSED - the API is down until the reset. See docs/CAPACITY.md §4.',
          )
        }
      } else if (SEED_DEMO_DATA) {
        // Explicitly asked for: a brand-new project gets the demo data so the
        // app is immediately usable and the collections exist to browse.
        db = seed()
        await seedInto(db)
        console.log('[firestore] seeded demo data (SEED_DEMO_DATA is on)')
      } else {
        // The default. An empty database stays empty - inventing sellers in
        // front of real customers is worse than an empty catalogue.
        db = emptyDb()
        console.log('[firestore] database is empty - set SEED_DEMO_DATA=true to load demo data')
      }
    } catch (err) {
      // In production, refuse to start rather than start empty. The fallback
      // below reads backend/data/db.json, which does not exist in the
      // container: the server came up with an empty catalogue, everyone
      // signed out, and every order and registration written to a file that
      // died with the instance - then vanished for good when the next start
      // found Firestore again. On the Spark plan that happens every time the
      // day's reads run out. Down is honest; empty loses data. Cloud Run
      // retries the start, and a failed start during a deploy leaves traffic
      // on the old revision.
      if (IS_PROD) {
        throw new Error(
          `Firestore could not be loaded (${(err as Error).message}). Refusing to start on an ` +
            'empty database. RESOURCE_EXHAUSTED / "Quota exceeded" means the Spark plan\'s ' +
            'daily reads are spent; they reset around midnight Pacific (12:30-13:30 IST). ' +
            'See docs/CAPACITY.md §4.',
        )
      }
      // Development: an expired gcloud login should not stop work. Carry on
      // against the JSON file, but say so plainly - a silent downgrade would
      // have someone wondering why the Firebase console stays empty.
      firestoreLive = false
      console.error('[firestore] connection failed:', (err as Error).message)
      console.error('[firestore] falling back to backend/data/db.json - writes will NOT reach Firestore')
      db = loadFile()
    }
  } else {
    db = loadFile()
  }
  ready = true
}

export function getDb(): Db {
  if (!ready) {
    // A route ran before initStore() finished. Better a loud error here than
    // silently serving seed data over a real database.
    console.warn('[db] getDb() called before initStore() completed')
  }
  return db
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

let pendingWrite: NodeJS.Timeout | null = null
/** The persist now running, and at most one waiting behind it. */
let running: Promise<boolean> = Promise.resolve(true)
let queued: Promise<boolean> | null = null
/** Set while Firestore is refusing writes; cleared by the first persist that lands. */
let retry: NodeJS.Timeout | null = null
const RETRY_MS = 60_000

/**
 * Schedule a persist. Coalesced over 400ms: placing an order touches several
 * documents in quick succession and they should cost one batch, not five.
 */
export function save(): void {
  if (!firestoreLive) {
    writeFile(db)
    return
  }
  if (pendingWrite) clearTimeout(pendingWrite)
  pendingWrite = setTimeout(() => void flush(), 400)
}

/**
 * Persist now. Resolves true once Firestore has accepted everything this
 * process holds, false if it refused.
 *
 * One persist runs at a time, and calls made meanwhile share the single run
 * queued behind it - so a caller that awaits this (the shutdown handler, the
 * CLI scripts) waits for a run that started after it asked. It used to return
 * at once whenever a write was already in flight, and shutdown then exited
 * underneath that write.
 */
export function flush(): Promise<boolean> {
  if (!firestoreLive) {
    writeFile(db)
    return Promise.resolve(true)
  }
  if (!queued) {
    queued = running.then(() => {
      queued = null
      running = persistOnce()
      return running
    })
  }
  return queued
}

async function persistOnce(): Promise<boolean> {
  try {
    const { written, deleted, refused } = await persistDiff(db)
    if (written || deleted) {
      console.log(`[firestore] wrote ${written}, deleted ${deleted}`)
    }
    if (refused) {
      // Loud, and every time - a refusal means memory and the server now
      // disagree, and the reason for that disagreement is still unfixed.
      console.error(
        `[firestore] ${refused} deletion(s) refused by the bulk-delete guard. ` +
          'Something emptied a collection in memory; find it before trusting this process.',
      )
    }
    if (retry) {
      clearInterval(retry)
      retry = null
      console.log('[firestore] writes are being accepted again; nothing is waiting')
    }
    return true
  } catch (err) {
    // Nothing is marked saved until Firestore accepts it (persistDiff), so
    // retrying is all it takes - and it must not wait for some unrelated
    // save to come along. On Spark's write limit every retry fails until the
    // reset, and the first one after it sends the lot.
    console.error('[firestore] persist failed:', (err as Error).message)
    console.error(
      `[firestore] ${unsavedChanges(db)} change(s) are in memory only - ` +
        `retrying every ${RETRY_MS / 1000}s until Firestore accepts them`,
    )
    if (!retry) {
      retry = setInterval(() => void flush(), RETRY_MS)
      // Never the reason the process stays alive: a CLI script whose write
      // failed should still finish and say so.
      retry.unref()
    }
    return false
  }
}

export function resetDb(): Db {
  // The dev-reset endpoint. It respects the same switch, so hitting it against
  // a real database wipes it back to empty rather than filling it with demo
  // sellers that customers would then see.
  db = SEED_DEMO_DATA ? seed() : emptyDb()
  save()
  return db
}

// Lives in ids.ts to keep seed -> customers -> store from becoming a cycle.
// Re-exported so the 30-odd existing `import { newId } from './store.js'` call
// sites keep working.
export { newId } from './ids.js'
