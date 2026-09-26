import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPLAINT_SUBJECTS, MAX_COMPLAINT, MIN_COMPLAINT, complaintProblems, isComplaintSubject,
} from '@shared/complaint.js'

/**
 * WHEN SOMETHING HAS GONE WRONG AND SHE NEEDS A PERSON.
 *
 * Help & Training answers the questions that have answers; a complaint is the
 * other kind - the ₹50 that was never approved, the buyer who will not pay.
 * Those need somebody to open HER account, so it is recorded against it
 * rather than left as a message on one person's phone. WhatsApp is still
 * offered beside it for the thing that cannot wait for a queue.
 */

test('a complaint says what it is about', () => {
  // "Payment" and "an order" are different desks. A queue where every row
  // says "problem" cannot be worked through by the one person answering it.
  assert.equal('subject' in complaintProblems({ message: 'काहीतरी झाले आहे इथे' }), true)
  assert.equal('subject' in complaintProblems({ subject: 'nonsense', message: 'काहीतरी झाले आहे' }), true)
  assert.deepEqual(complaintProblems({ subject: 'payment', message: '₹50 भरले, मंजूर नाही' }), {})
})

test('every subject on the list is one the server takes', () => {
  for (const s of COMPLAINT_SUBJECTS) assert.equal(isComplaintSubject(s), true)
  assert.equal(isComplaintSubject('urgent'), false)
})

/**
 * The floor matters more than the ceiling. "problem" is not something anybody
 * can act on, and sending it wastes her time as much as the admin's.
 */
test('it has to say enough to act on', () => {
  assert.equal('message' in complaintProblems({ subject: 'order', message: 'अडचण' }), true)
  assert.equal('message' in complaintProblems({ subject: 'order', message: '' }), true)
  assert.equal(MIN_COMPLAINT, 10)
})

test('an essay is refused rather than silently cut', () => {
  const long = { subject: 'other', message: 'अ'.repeat(MAX_COMPLAINT + 1) }
  assert.equal('message' in complaintProblems(long), true)
})

/** `other` is the escape hatch, as everywhere else: a list names nothing fully. */
test('there is always a way to say something the list does not cover', () => {
  assert.ok(COMPLAINT_SUBJECTS.includes('other'))
  assert.deepEqual(complaintProblems({ subject: 'other', message: 'गावात नेटवर्क नाही' }), {})
})
