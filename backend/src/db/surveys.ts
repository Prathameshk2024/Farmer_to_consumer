import type { Farmer } from '@shared/types.js'
import { samePhone } from '@shared/farmer.js'
import { isValidLatLng } from '@shared/geo.js'
import type { Db } from './seed.js'

/**
 * The farmers a questionnaire may be linked to. Never a closed account: its
 * phone is blank or about to be, and a linked questionnaire stops counting on
 * its own, so linking one to a closed farmer would drop that person from the
 * research tables altogether.
 */
export const linkableFarmers = (db: Db): Farmer[] => db.farmers.filter((f) => f.status !== 'CLOSED')

/**
 * A farmer registering with a phone a coordinator already typed on a paper
 * questionnaire is the same person: link it now so they are counted once,
 * from their own record. Returns how many were linked.
 */
export function linkSurveysByPhone(db: Db, farmer: Farmer): number {
  const found = db.surveys.filter((s) => !s.linkedFarmerId && s.phone && samePhone(s.phone, farmer.phone))
  for (const s of found) s.linkedFarmerId = farmer.id
  return found.length
}

/** A typed-in text field: a string or nothing, trimmed and capped. */
export const surveyText = (v: unknown, max = 80): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

/** Only a web address, and not an essay: anything else is a link nobody should click. */
export const surveyPhotoUrl = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length <= 500 && /^https:\/\//.test(v) ? v : undefined

/**
 * Questionnaire pins for the admin map. A linked questionnaire is the farmer
 * already pinned from their own record; drawing it again would put the same
 * person on the map twice.
 */
export const unlinkedSurveyPoints = (db: Db) =>
  db.surveys.filter((s) => !s.linkedFarmerId && isValidLatLng(s.lat, s.lng))
