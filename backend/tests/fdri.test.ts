import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FDRI_INDICATORS, cleanFdri, fdriBand, fdriScore } from '@shared/fdri.js'

/**
 * The Farmer Digital Readiness Index from the research paper, section 10:
 * ten yes/no indicators, one mark each. The same function scores a farmer
 * who registered and a questionnaire a coordinator typed in, so the two
 * populations can be compared in one table.
 */

test('ten indicators, in the paper\'s order', () => {
  assert.deepEqual([...FDRI_INDICATORS], [
    'smartphone', 'internet', 'whatsapp', 'digitalPayment', 'onlineMarketInfo',
    'digitalPromotion', 'onlineSelling', 'directSelling', 'packagingBranding', 'trainingWillingness',
  ])
})

test('one mark per yes', () => {
  assert.equal(fdriScore({}), 0)
  assert.equal(fdriScore({ smartphone: true, whatsapp: true, digitalPayment: true }), 3)
  assert.equal(fdriScore(Object.fromEntries(FDRI_INDICATORS.map((k) => [k, true]))), 10)
})

test('bands break at 3/4 and 7/8', () => {
  assert.equal(fdriBand(0), 'low')
  assert.equal(fdriBand(3), 'low')
  assert.equal(fdriBand(4), 'moderate')
  assert.equal(fdriBand(7), 'moderate')
  assert.equal(fdriBand(8), 'high')
  assert.equal(fdriBand(10), 'high')
})

test('anything that is not literally true is a no', () => {
  const a = cleanFdri({ smartphone: 'yes', internet: 1, whatsapp: true, extra: true })
  assert.equal(a.smartphone, false)
  assert.equal(a.internet, false)
  assert.equal(a.whatsapp, true)
  assert.equal(Object.keys(a).length, 10, 'unknown keys are dropped')
})
