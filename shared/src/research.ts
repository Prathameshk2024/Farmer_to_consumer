import { fdriBand, fdriScore, type FdriAnswers, type FdriIndicator } from './fdri.js'
import { AGE_GROUPS, EDUCATION_LEVELS } from './profile.js'
import type { Farmer, Survey } from './types.js'

export interface Respondent {
  source: 'farmer' | 'survey'
  ageGroup?: string
  education?: string
  landholding?: string
  fdri: Partial<FdriAnswers>
}

export interface ResearchTable { id: number; titleEn: string; titleMr: string; headers: string[]; rows: (string | number)[][] }

const NA = 'not answered'
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0)

/**
 * Every farmer who has not closed the account, plus every questionnaire not
 * linked to one. A linked questionnaire is the same person as the farmer, so
 * counting it too would count that person twice.
 */
export function respondents(farmers: Farmer[], surveys: Survey[]): Respondent[] {
  return [
    ...farmers.filter((f) => f.status !== 'CLOSED').map((f) => ({ source: 'farmer' as const, ageGroup: f.ageGroup, education: f.education, landholding: f.landholding, fdri: f.fdri ?? {} })),
    ...surveys.filter((s) => !s.linkedFarmerId).map((s) => ({ source: 'survey' as const, ageGroup: s.ageGroup, education: s.education, landholding: s.landholding, fdri: s.fdri ?? {} })),
  ]
}

/** One categorical column: count, percent, and a not-answered row when any. */
function frequency(rows: Respondent[], values: readonly string[], get: (r: Respondent) => string | undefined) {
  const counts = new Map<string, number>(values.map((v) => [v, 0]))
  let missing = 0
  for (const r of rows) {
    const v = get(r)
    if (v && counts.has(v)) counts.set(v, counts.get(v)! + 1)
    else missing++
  }
  const out: (string | number)[][] = [...counts].map(([v, n]) => [v, n, pct(n, rows.length)])
  if (missing) out.push([NA, missing, pct(missing, rows.length)])
  return out
}

/** Yes / No / not answered for one FDRI indicator. */
function yesNo(rows: Respondent[], k: FdriIndicator) {
  const yes = rows.filter((r) => r.fdri[k] === true).length
  const no = rows.filter((r) => r.fdri[k] === false).length
  const na = rows.length - yes - no
  const out: (string | number)[][] = [['yes', yes, pct(yes, rows.length)], ['no', no, pct(no, rows.length)]]
  if (na) out.push([NA, na, pct(na, rows.length)])
  return out
}

const band = (r: Respondent) => fdriBand(fdriScore(r.fdri))
const DIGITAL_USE: FdriIndicator[] = ['smartphone', 'internet', 'whatsapp', 'digitalPayment']
const BANDS = ['low', 'moderate', 'high'] as const

export function researchTables(rows: Respondent[]): ResearchTable[] {
  const freqHeaders = ['Value', 'Count', '%']
  const educations: string[] = EDUCATION_LEVELS.map((e) => e.value)

  const t2 = [...educations, NA].map((edu) => {
    const group = rows.filter((r) => (edu === NA ? !r.education || !educations.includes(r.education) : r.education === edu))
    const users = group.filter((r) => DIGITAL_USE.some((k) => r.fdri[k] === true)).length
    return [edu, group.length, users, pct(users, group.length)]
  }).filter((r) => r[1] !== 0)

  const t8 = [
    ...BANDS.map((b) => {
      const n = rows.filter((r) => band(r) === b).length
      return [b, n, pct(n, rows.length)]
    }),
    ...Array.from({ length: 11 }, (_, s) => {
      const n = rows.filter((r) => fdriScore(r.fdri) === s).length
      return [`score ${s}`, n, pct(n, rows.length)]
    }),
  ]

  // A respondent who skipped the direct-selling question counts as "not
  // willing" here: willingness has to be said out loud. The admin screen
  // states this under the table (res.t9Note).
  const t9 = BANDS.map((b) => {
    const group = rows.filter((r) => band(r) === b)
    const willing = group.filter((r) => r.fdri.directSelling === true).length
    return [b, willing, group.length - willing, group.length, pct(willing, group.length)]
  })

  return [
    { id: 1, titleEn: 'Age groups of farmers', titleMr: 'शेतकऱ्यांचे वयोगट', headers: freqHeaders,
      rows: frequency(rows, AGE_GROUPS.map((a) => a.value), (r) => r.ageGroup) },
    { id: 2, titleEn: 'Digital use by education', titleMr: 'शिक्षणानुसार डिजिटल वापर',
      headers: ['Education', 'Respondents', 'Use any digital tool', '%'], rows: t2 },
    { id: 3, titleEn: 'Smartphone ownership', titleMr: 'स्मार्टफोन मालकी', headers: freqHeaders, rows: yesNo(rows, 'smartphone') },
    { id: 4, titleEn: 'Digital payment usage', titleMr: 'डिजिटल पेमेंट वापर', headers: freqHeaders, rows: yesNo(rows, 'digitalPayment') },
    { id: 5, titleEn: 'Online market information', titleMr: 'ऑनलाइन बाजारभाव माहिती', headers: freqHeaders, rows: yesNo(rows, 'onlineMarketInfo') },
    { id: 6, titleEn: 'Direct selling willingness', titleMr: 'थेट विक्रीची तयारी', headers: freqHeaders, rows: yesNo(rows, 'directSelling') },
    { id: 7, titleEn: 'Digital training requirement', titleMr: 'डिजिटल प्रशिक्षणाची गरज', headers: freqHeaders, rows: yesNo(rows, 'trainingWillingness') },
    { id: 8, titleEn: 'FDRI score', titleMr: 'FDRI गुण', headers: ['Band / score', 'Count', '%'], rows: t8 },
    { id: 9, titleEn: 'Digital readiness vs direct selling willingness', titleMr: 'डिजिटल तयारी आणि थेट विक्रीची तयारी',
      headers: ['FDRI band', 'Willing', 'Not willing', 'Total', 'Willing %'], rows: t9 },
  ]
}
