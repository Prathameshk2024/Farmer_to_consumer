/**
 * BACK UP THE LIVE DATABASE AND PHOTOS
 * ====================================
 * One run does three things:
 *
 *   1. Reads every backed-up Firestore collection from the live project and
 *      writes it to a dated, gzipped JSON file in backend/data/backups/,
 *      keeping every copy from the last BACKUP_KEEP_DAYS (30) and the first
 *      of each month after that. Unpacked, it is db.json's shape, so the JSON
 *      driver can boot from it directly:
 *        node -e "process.stdout.write(require('zlib').gunzipSync(require('fs').readFileSync(process.argv[1])))" <file> > data/db.json
 *      `npm run restore -- --file <file>` loads it back into Firestore.
 *   2. Mirrors the same documents into a backup Firebase project on another
 *      account - unless the live project has shrunk suspiciously since the
 *      backup was last taken (see shrinkProblems in src/db/backupPlan.ts).
 *   3. Copies every photo the backup Cloudinary account does not have yet,
 *      Cloudinary to Cloudinary, keeping the same public_id, and downloads new
 *      ones to backend/data/backups/images/. Photos are never deleted from
 *      either copy: the payment screenshots are the proof behind approvals.
 *
 * The live project is only ever READ. Its free plan allows 50,000 reads a
 * day and one run costs one read per document - the same as one API start -
 * so run this once a day, not every hour.
 *
 *   npm run backup                   # today's target, by rotation
 *   npm run backup -- --to a         # a named target (repeatable)
 *   npm run backup -- --dry-run      # report, write nothing anywhere
 *   npm run backup -- --no-local-images
 *
 * Targets are configured in the environment - see readTargets() and the
 * BACKUP_ block in .env.example. With none configured, only the local file
 * is written. Exits non-zero if anything was refused or failed, so a scheduled
 * run that did not complete is visible as a failure.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { cert, deleteApp, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { ALLOW_BULK_DELETE, cloudinary, firebase } from '../src/config.js'
import { getFirestoreDb } from '../src/db/firestore.js'
import {
  BACKED_UP, pickTargets, readTargets, shrinkProblems, snapshotName, snapshotsToPrune,
  type BackupTarget,
} from '../src/db/backupPlan.js'
import {
  applyMirror, countsOf, listAssets, readCollections, uploadAsset, type Asset, type Collections,
} from '../src/db/backupIo.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const localImages = !args.includes('--no-local-images')
const requested = args.flatMap((a, i) => (a === '--to' && args[i + 1] ? [args[i + 1]!] : []))

const here = path.dirname(fileURLToPath(import.meta.url))
// A relative BACKUP_DIR means relative to where the command was typed, not to
// backend/, which is where npm runs a workspace script from.
const BACKUP_DIR = process.env.BACKUP_DIR?.trim()
  ? path.resolve(process.env.INIT_CWD ?? process.cwd(), process.env.BACKUP_DIR.trim())
  : path.join(here, '../data/backups')
const KEEP_DAYS = Math.max(1, Number(process.env.BACKUP_KEEP_DAYS) || 30)

let failed = false
function fail(message: string): void {
  console.error(`  FAILED  ${message}`)
  failed = true
}

/* ------------------------------------------------------------------ */
/* Firestore                                                           */
/* ------------------------------------------------------------------ */

function writeLocalSnapshot(live: Collections): void {
  const now = new Date()
  const file = path.join(BACKUP_DIR, snapshotName(now))
  // db.json's shape, with `sessions` empty rather than absent so the JSON
  // driver takes it as it is. To boot from it: unpack it to data/db.json and
  // start the API with no FIREBASE_* variables set.
  const snapshot: Record<string, unknown[]> = { sessions: [] }
  for (const [name, docs] of Object.entries(live)) {
    snapshot[name] = [...docs].map(([id, data]) => ({ id, ...data }))
  }

  const existing = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR) : []
  const doomed = snapshotsToPrune([...existing, path.basename(file)], now, KEEP_DAYS)

  if (dryRun) {
    console.log(`  local    would write ${file}`)
    if (doomed.length) console.log(`  local    would prune ${doomed.length} older copies`)
    return
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  fs.writeFileSync(file, gzipSync(JSON.stringify(snapshot, null, 2)))
  console.log(`  local    wrote ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`)

  // Only after today's copy is safely on disk, so a run that fails to write
  // never shrinks the history it was meant to add to.
  for (const name of doomed) fs.rmSync(path.join(BACKUP_DIR, name))
  if (doomed.length) {
    console.log(`  local    pruned ${doomed.length} copies older than ${KEEP_DAYS} days (first of each month kept)`)
  }
}

async function mirrorFirestore(target: BackupTarget, live: Collections): Promise<void> {
  const config = target.firestore!
  // The one mistake this script could make with the live data is taking it for
  // a backup: mirroring deletes a live project's documents to match whatever
  // it was handed.
  if (config.projectId === firebase?.projectId && config.databaseId === firebase?.databaseId) {
    fail(`target "${target.name}" is the LIVE Firebase project (${config.projectId}) - refusing`)
    return
  }

  let app: App | null = null
  try {
    app = initializeApp(
      { credential: cert(config), projectId: config.projectId },
      `backup-${target.name}`,
    )
    const db = config.databaseId ? getFirestore(app, config.databaseId) : getFirestore(app)
    const backup = await readCollections(db, BACKED_UP)

    const problems = shrinkProblems(countsOf(live), countsOf(backup))
    if (problems.length > 0 && !ALLOW_BULK_DELETE) {
      for (const p of problems) console.error(`           ${p}`)
      fail(
        `firestore → ${config.projectId}: the live project has shrunk since this backup was taken. ` +
          'Nothing was copied, so the backup still holds the older data. Find out why before trusting ' +
          'the live project; if the shrink is deliberate, re-run with ALLOW_BULK_DELETE=true.',
      )
      return
    }

    const { written, removed } = await applyMirror(db, live, backup, dryRun)
    const verb = dryRun ? 'would write' : 'wrote'
    console.log(`  firestore → ${config.projectId}: ${verb} ${written}, ${dryRun ? 'would remove' : 'removed'} ${removed}`)
  } catch (err) {
    fail(`firestore → ${config.projectId}: ${(err as Error).message}`)
  } finally {
    if (app) await deleteApp(app)
  }
}

/* ------------------------------------------------------------------ */
/* Cloudinary                                                          */
/* ------------------------------------------------------------------ */

async function mirrorCloudinary(target: BackupTarget, assets: Asset[], folder: string): Promise<void> {
  const to = target.cloudinary!
  if (to.cloudName === cloudinary?.cloudName) {
    fail(`target "${target.name}" is the LIVE Cloudinary account (${to.cloudName}) - refusing`)
    return
  }
  try {
    const have = new Set((await listAssets(to, folder)).map((a) => a.public_id))
    const missing = assets.filter((a) => !have.has(a.public_id))
    if (dryRun) {
      console.log(`  photos   → ${to.cloudName}: would copy ${missing.length} of ${assets.length}`)
      return
    }
    let copied = 0
    for (const asset of missing) {
      try {
        // By URL: Cloudinary fetches it from the live account itself.
        await uploadAsset(to, asset.secure_url, asset.public_id)
        copied++
      } catch (err) {
        fail(`photo ${asset.public_id} → ${to.cloudName}: ${(err as Error).message}`)
      }
    }
    console.log(`  photos   → ${to.cloudName}: copied ${copied} new, ${assets.length} in total`)
  } catch (err) {
    fail(`photos → ${to.cloudName}: ${(err as Error).message}`)
  }
}

/** Only files not already on disk, so each run downloads just the new ones. */
async function downloadAssets(assets: Asset[]): Promise<void> {
  const dir = path.join(BACKUP_DIR, 'images')
  const missing = assets.filter((a) => !fs.existsSync(path.join(dir, `${a.public_id}.${a.format}`)))
  if (dryRun) {
    console.log(`  photos   local: would download ${missing.length} of ${assets.length}`)
    return
  }
  let saved = 0
  for (const asset of missing) {
    const file = path.join(dir, `${asset.public_id}.${asset.format}`)
    try {
      const resp = await fetch(asset.secure_url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, Buffer.from(await resp.arrayBuffer()))
      saved++
    } catch (err) {
      fail(`download ${asset.public_id}: ${(err as Error).message}`)
    }
  }
  console.log(`  photos   local: downloaded ${saved} new, ${assets.length} in total`)
}

/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const folder = cloudinary?.folder ?? process.env.CLOUDINARY_FOLDER?.trim() ?? 'shanta-mahila-bazar'
  const { targets, problems } = readTargets(process.env, folder)
  for (const p of problems) fail(p)

  const { chosen, unknown } = pickTargets(targets, requested, new Date())
  for (const u of unknown) fail(`--to ${u}: no such target in BACKUP_TARGETS`)

  // A target that expects a copy the live side cannot supply is a broken
  // setup, not a quiet night. Without this a scheduled run whose live key
  // failed to parse skipped the database and still went green.
  for (const t of chosen) {
    if (t.firestore && !firebase) {
      fail(`target "${t.name}" has a Firebase key, but the live Firebase is not configured - check FIREBASE_SERVICE_ACCOUNT`)
    }
    if (t.cloudinary && !cloudinary) {
      fail(`target "${t.name}" has a Cloudinary account, but the live Cloudinary is not configured - check CLOUDINARY_*`)
    }
  }

  console.log('')
  console.log(`  backup${dryRun ? ' (DRY RUN - nothing is written)' : ''}`)
  console.log(`  targets  ${chosen.length ? chosen.map((t) => t.name).join(', ') : '(none - local copy only)'}`)
  console.log('')

  if (firebase) {
    try {
      const live = await readCollections(getFirestoreDb(), BACKED_UP)
      const total = Object.values(live).reduce((n, docs) => n + docs.size, 0)
      console.log(`  firestore read ${total} documents from ${firebase.projectId}`)
      writeLocalSnapshot(live)
      for (const t of chosen) if (t.firestore) await mirrorFirestore(t, live)
    } catch (err) {
      fail(`reading the live Firestore: ${(err as Error).message}`)
    }
  } else {
    console.log('  firestore not configured - no database to back up')
  }

  if (cloudinary) {
    try {
      const assets = await listAssets(cloudinary, folder)
      if (localImages) await downloadAssets(assets)
      for (const t of chosen) if (t.cloudinary) await mirrorCloudinary(t, assets, folder)
    } catch (err) {
      fail(`listing the live Cloudinary: ${(err as Error).message}`)
    }
  } else {
    console.log('  cloudinary not configured - no photos to back up')
  }

  console.log('')
  console.log(failed ? '  FINISHED WITH FAILURES - see above.' : '  DONE.')
  console.log('')
  if (failed) process.exitCode = 1
}

main().catch((err: unknown) => {
  console.error('[backup] failed:', err)
  process.exitCode = 1
})
