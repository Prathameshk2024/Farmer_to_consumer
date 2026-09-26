import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_REPORT_NOTE, isReportTarget, reportProblems,
} from '@shared/report.js'

/**
 * REPORTING WHAT SHOULD NOT BE HERE.
 *
 * Anyone can list anything in this market, and after an admin has approved a
 * listing the only people looking at it are buyers. So a buyer needs a way to
 * say "this is wrong" from the screen where she found it - which is also what
 * Google Play requires of an app carrying what its users write.
 *
 * The reason is the part that matters. "Spoiled food" and "that is not her
 * photograph" are different problems with different answers, and a queue of
 * reports that all say "inappropriate" cannot be triaged by anybody.
 */

test('a report without a reason is not a report', () => {
  assert.equal('reason' in reportProblems({}), true)
  assert.equal('reason' in reportProblems({ reason: 'made-up' }), true)
  assert.deepEqual(reportProblems({ reason: 'unsafe' }), {})
})

/**
 * `other` is the escape hatch - a list can never name everything - and it is
 * the one reason that has to carry words, or it says nothing at all.
 */
test('"other" has to say what is wrong', () => {
  assert.equal('note' in reportProblems({ reason: 'other' }), true)
  assert.equal('note' in reportProblems({ reason: 'other', note: 'बाद' }), true, 'four letters is not an explanation')
  assert.deepEqual(reportProblems({ reason: 'other', note: 'फोटो दुसऱ्या दुकानाचा आहे' }), {})
})

test('a named reason needs no words', () => {
  // She picked "does not look safe to eat". Making her type as well is how a
  // report stops being worth the trouble.
  assert.deepEqual(reportProblems({ reason: 'scam' }), {})
})

test('an essay is cut to something a queue can be read from', () => {
  const problems = reportProblems({ reason: 'other', note: 'अ'.repeat(MAX_REPORT_NOTE + 1) })
  assert.equal('note' in problems, true)
})

test('only content a user wrote can be reported', () => {
  assert.equal(isReportTarget('product'), true)
  assert.equal(isReportTarget('review'), true)
  assert.equal(isReportTarget('seller'), false, 'reporting a person is a different decision')
  assert.equal(isReportTarget(''), false)
})
