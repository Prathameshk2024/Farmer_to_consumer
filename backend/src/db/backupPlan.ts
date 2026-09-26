import { parseCloudinaryUrl, parseServiceAccount, type CloudinaryConfig } from '../config.js'
import { COLLECTIONS, isBulkDelete } from './firestore.js'

/**
 * THE RULES OF `npm run backup`
 * =============================
 * The live project is on the Spark plan, so there are no managed backups and
 * no point-in-time recovery - only the one hour of version history that
 * rescued six sellers on 10 September 2026. The backup is instead a copy into
 * separate free Firebase and Cloudinary accounts, and this file decides what
 * that copy does. scripts/backup.ts does the reading and writing.
 *
 * Nothing here ever writes to the live project. It is read, once per run.
 */

/**
 * `sessions` holds live credentials. Copying it to another account only
 * widens who could steal one; losing it in a disaster means everybody signs
 * in again, which is the cheapest thing on this list.
 */
export const BACKED_UP = COLLECTIONS.filter((name) => name !== 'sessions')
export type BackedUp = (typeof BACKED_UP)[number]

/**
 * A rolling log the app prunes on its own schedule, so a large drop there is
 * housekeeping rather than a wipe. Exempt from the shrink check below.
 */
const ROLLING: readonly string[] = ['authEvents']

/**
 * Key order is not part of a document, so two copies of the same one must
 * compare equal however each read happened to order its fields.
 */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * What one collection in a backup must change to match the live one: the
 * documents that differ, and the ones the live project no longer has.
 *
 * The backup MIRRORS deletions rather than keeping everything forever. A copy
 * that never deletes brings back every purged demo seller and every deleted
 * draft on the day it is restored, and it only ever grows, so no shrink check
 * could be measured against it. What stops a wipe being mirrored is
 * `shrinkProblems`, the rotation between targets, and the dated local files.
 */
export function planCollection(
  live: Map<string, unknown>,
  backup: Map<string, unknown>,
): { write: string[]; remove: string[] } {
  const write: string[] = []
  for (const [id, doc] of live) {
    if (!backup.has(id) || stableJson(backup.get(id)) !== stableJson(doc)) write.push(id)
  }
  const remove = [...backup.keys()].filter((id) => !live.has(id))
  return { write, remove }
}

/**
 * Reasons NOT to copy into this backup today.
 *
 * The same line the live app draws in `isBulkDelete`: no collection may lose
 * more than half its documents in one step. On 10 September the live project
 * held empty `sellers` and `products` for a few minutes; a backup taken in
 * those minutes would have faithfully deleted its own copy of six women. So a
 * live project that has shrunk that far since the backup was taken is treated
 * as the problem, and the backup is left as the evidence.
 *
 * `ALLOW_BULK_DELETE=true` on the command is the override, as everywhere else.
 */
export function shrinkProblems(
  liveCounts: Record<string, number>,
  backupCounts: Record<string, number>,
  // A restore runs the same check the other way round - a local file as the
  // source, the live project as the target - and says so in its own words.
  labels = { source: 'live', sourceWhole: 'the live project', target: 'the backup' },
): string[] {
  const problems: string[] = []
  const liveTotal = Object.values(liveCounts).reduce((a, b) => a + b, 0)
  const backupTotal = Object.values(backupCounts).reduce((a, b) => a + b, 0)
  if (liveTotal === 0 && backupTotal > 0) {
    problems.push(`${labels.sourceWhole} read as EMPTY, and ${labels.target} holds ${backupTotal} documents`)
  }
  for (const [name, before] of Object.entries(backupCounts)) {
    if (ROLLING.includes(name)) continue
    const now = liveCounts[name] ?? 0
    if (isBulkDelete(before - now, before)) {
      problems.push(`${name}: ${before} in ${labels.target}, only ${now} ${labels.source}`)
    }
  }
  return problems
}

/**
 * The dated local copy. Gzipped: the file is JSON, which compresses about
 * tenfold, and one is written per run, so it is the difference between
 * megabytes and gigabytes a year once the order history grows.
 */
export function snapshotName(now: Date): string {
  return `firestore-${now.toISOString().slice(0, 16).replace(':', '-')}.json.gz`
}

const SNAPSHOT = /^firestore-(\d{4})-(\d{2})-(\d{2})T\d{2}-\d{2}\.json(\.gz)?$/

/**
 * Which local copies to delete: everything older than `keepDays`, except the
 * earliest copy of each calendar month, which is kept for good.
 *
 * Every day of the last month, because damage is usually noticed within days
 * and the day before it is the copy wanted. One per month after that, because
 * "what did the shop look like in March" is a question a funder's report will
 * ask, and a year of monthly copies costs less than a week of daily ones.
 *
 * Names this function does not recognise are never touched.
 */
export function snapshotsToPrune(names: string[], now: Date, keepDays: number): string[] {
  // Whole days: a copy dated exactly `keepDays` ago is inside the window all
  // that day, not only until the hour it happened to be taken.
  const then = new Date(now.getTime() - keepDays * 86_400_000)
  const cutoff = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate())
  const dated = names
    .map((name) => ({ name, m: SNAPSHOT.exec(name) }))
    .filter((f): f is { name: string; m: RegExpExecArray } => f.m !== null)
    .sort((a, b) => a.name.localeCompare(b.name))

  const monthly = new Set<string>()
  const firstOfMonth = new Set<string>()
  for (const { name, m } of dated) {
    const month = `${m[1]}-${m[2]}`
    if (!monthly.has(month)) {
      monthly.add(month)
      firstOfMonth.add(name)
    }
  }

  return dated
    .filter(({ name, m }) => {
      const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      return day < cutoff && !firstOfMonth.has(name)
    })
    .map(({ name }) => name)
}

/**
 * A local copy, as the collections a restore would write.
 *
 * Only backed-up collections are taken: `sessions` is empty in every copy by
 * design, and a restore must never touch the live one - that would sign out
 * everybody who is using the app while it runs. A collection the file does
 * not have is left out rather than read as empty, so an old file never
 * empties a collection that did not exist when it was written.
 */
export function parseSnapshot(json: unknown): {
  collections: Map<string, Map<string, Record<string, unknown>>>
  problems: string[]
} {
  const collections = new Map<string, Map<string, Record<string, unknown>>>()
  const problems: string[] = []
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { collections, problems: ['the file is not a database copy (expected an object of collections)'] }
  }
  const obj = json as Record<string, unknown>
  for (const name of BACKED_UP) {
    const rows = obj[name]
    if (rows === undefined) continue
    if (!Array.isArray(rows)) {
      problems.push(`${name} is not a list`)
      continue
    }
    const docs = new Map<string, Record<string, unknown>>()
    for (const row of rows) {
      const id = (row as { id?: unknown } | null)?.id
      if (typeof id !== 'string' || !id) {
        problems.push(`${name} has a document with no id`)
        continue
      }
      docs.set(id, row as Record<string, unknown>)
    }
    collections.set(name, docs)
  }
  if (collections.size === 0 && problems.length === 0) {
    problems.push('the file holds none of the backed-up collections')
  }
  return { collections, problems }
}

/**
 * The public_id each downloaded photo was stored under, read back from where
 * the backup put it: `images/<public_id>.<format>`. Paths outside the app's
 * folder are ignored - nothing else in that directory was put there by us.
 */
export function imagePublicIds(relativePaths: string[], folder: string): { path: string; publicId: string }[] {
  return relativePaths
    .map((p) => ({ path: p, publicId: p.replace(/\\/g, '/').replace(/\.[^./]+$/, '') }))
    .filter(({ publicId }) => publicId.startsWith(`${folder}/`))
}

export interface BackupTarget {
  name: string
  firestore?: { projectId: string; clientEmail: string; privateKey: string; databaseId?: string }
  cloudinary?: CloudinaryConfig
}

/**
 * Targets come from the environment, so no key is ever in the repo:
 *
 *   BACKUP_TARGETS=a,b
 *   BACKUP_A_FIREBASE_SERVICE_ACCOUNT=<json or base64>
 *   BACKUP_A_FIRESTORE_DATABASE_ID=      (optional, named database)
 *   BACKUP_A_CLOUDINARY_URL=cloudinary://key:secret@cloud
 *
 * A target may have either half. One with neither is a mistake, not a choice.
 */
export function readTargets(
  env: Record<string, string | undefined>,
  folder: string,
): { targets: BackupTarget[]; problems: string[] } {
  const targets: BackupTarget[] = []
  const problems: string[] = []
  const names = (env.BACKUP_TARGETS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

  for (const name of names) {
    const key = name.toUpperCase().replace(/[^A-Z0-9]/g, '_')
    const target: BackupTarget = { name }

    const raw = env[`BACKUP_${key}_FIREBASE_SERVICE_ACCOUNT`]?.trim()
    if (raw) {
      const account = parseServiceAccount(raw)
      if (account) {
        const databaseId = env[`BACKUP_${key}_FIRESTORE_DATABASE_ID`]?.trim() || undefined
        target.firestore = { ...account, databaseId }
      } else {
        problems.push(`BACKUP_${key}_FIREBASE_SERVICE_ACCOUNT is not valid JSON or base64 JSON`)
      }
    }

    const url = env[`BACKUP_${key}_CLOUDINARY_URL`]?.trim()
    if (url) {
      const parsed = parseCloudinaryUrl(url, folder)
      if (parsed) target.cloudinary = parsed
      else problems.push(`BACKUP_${key}_CLOUDINARY_URL is malformed; expected cloudinary://key:secret@cloud`)
    }

    if (!raw && !url) problems.push(`backup target "${name}" has neither a Firebase key nor a Cloudinary URL`)
    targets.push(target)
  }
  return { targets, problems }
}

/**
 * Which targets this run copies into.
 *
 * Named on the command line, those. Otherwise ONE target, rotating by day,
 * because two backups taken at the same moment are one backup twice: damage
 * nobody notices until tomorrow is then in both. With two targets, the one
 * not copied today still holds yesterday.
 */
export function pickTargets(
  targets: BackupTarget[],
  requested: string[],
  now: Date,
): { chosen: BackupTarget[]; unknown: string[] } {
  if (requested.length > 0) {
    const unknown = requested.filter((r) => !targets.some((t) => t.name === r))
    return { chosen: targets.filter((t) => requested.includes(t.name)), unknown }
  }
  if (targets.length === 0) return { chosen: [], unknown: [] }
  const day = Math.floor(now.getTime() / 86_400_000)
  return { chosen: [targets[day % targets.length]!], unknown: [] }
}
