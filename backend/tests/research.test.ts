import { test } from 'node:test'
import assert from 'node:assert/strict'
import { researchTables, respondents } from '@shared/research.js'

const yes = (n: number) => Object.fromEntries(
  ['smartphone', 'internet', 'whatsapp', 'digitalPayment', 'onlineMarketInfo', 'digitalPromotion',
   'onlineSelling', 'directSelling', 'packagingBranding', 'trainingWillingness'].map((k, i) => [k, i < n]))

/**
 * The paper's Tables 1-9, from registered farmers and typed-in
 * questionnaires together. A skipped answer is a row of its own ("not
 * answered") - dropping it would quietly change every percentage.
 */

const farmers = [
  { id: 'f1', status: 'ACTIVE', ageGroup: '25-35', education: 'graduate', landholding: 'small', fdri: yes(9) },
  { id: 'f2', status: 'CLOSED', ageGroup: '25-35', fdri: yes(2) },
] as never[]
const surveys = [
  { id: 's1', ageGroup: '36-50', education: 'primary', landholding: 'medium', fdri: yes(5) },
  { id: 's2', fdri: { smartphone: true } },
  { id: 's3', ageGroup: 'o60', fdri: yes(1), linkedFarmerId: 'f1' },
] as never[]

test('closed farmers and linked surveys are not counted twice', () => {
  const r = respondents(farmers, surveys)
  assert.equal(r.length, 3, 'f1, s1, s2')
})

test('Table 1 counts age groups with a not-answered row and percentages', () => {
  const t1 = researchTables(respondents(farmers, surveys)).find((t) => t.id === 1)!
  const row = (label: string) => t1.rows.find((r) => r[0] === label)
  assert.deepEqual(row('25-35')?.slice(1), [1, 33.3])
  assert.deepEqual(row('36-50')?.slice(1), [1, 33.3])
  assert.deepEqual(row('not answered')?.slice(1), [1, 33.3])
})

test('Table 8 bands: 9 is high, 5 moderate, and one answer out of ten is not a score', () => {
  const t8 = researchTables(respondents(farmers, surveys)).find((t) => t.id === 8)!
  const band = (b: string) => t8.rows.find((r) => r[0] === b)?.[1]
  assert.equal(band('high'), 1)
  assert.equal(band('moderate'), 1)
  assert.equal(band('low'), 0, 'skipping questions is not the same as answering no')
  assert.equal(band('not answered'), 1)
  assert.equal(band('score 1'), 0)
})

test('Table 2 keeps every education level, even one nobody gave', () => {
  const t2 = researchTables(respondents(farmers, surveys)).find((t) => t.id === 2)!
  assert.ok(t2.rows.some((r) => r[1] === 0), 'a zero row stays, as in Table 1')
  assert.ok(t2.rows.some((r) => r[0] === 'not answered'), 's2 gave no education')
  const none = researchTables(respondents([], [surveys[0]])).find((t) => t.id === 2)!
  assert.ok(!none.rows.some((r) => r[0] === 'not answered'), 'an empty not-answered row is dropped')
})

test('Table 9 cross-tabs band against direct-selling willingness', () => {
  const t9 = researchTables(respondents(farmers, surveys)).find((t) => t.id === 9)!
  assert.deepEqual(t9.headers, ['FDRI band', 'Willing', 'Not willing', 'Total', 'Willing %'])
  assert.deepEqual(t9.rows.find((r) => r[0] === 'high'), ['high', 1, 0, 1, 100])
  assert.deepEqual(t9.rows.find((r) => r[0] === 'low'), ['low', 0, 0, 0, 0])
  assert.deepEqual(t9.rows.find((r) => r[0] === 'not answered'), ['not answered', 0, 1, 1, 0])
})

test('all nine tables exist, numbered 1-9', () => {
  assert.deepEqual(researchTables([]).map((t) => t.id), [1, 2, 3, 4, 5, 6, 7, 8, 9])
})
