/**
 * WHEN SOMETHING HAS GONE WRONG AND SHE NEEDS A PERSON.
 *
 * Help & Training answers the questions that have answers. This is the other
 * kind: the ₹50 that was never approved, the order that never arrived, the
 * buyer who will not pay. Those need somebody to look at HER account, so a
 * complaint is recorded with who wrote it rather than left as a conversation
 * on somebody's phone.
 *
 * A SUBJECT IS PICKED FROM A LIST. "Payment" and "an order" go to different
 * places in a queue, and a screen of complaints that all say "problem" cannot
 * be worked through by the one person answering them. `other` is the escape
 * hatch, as everywhere else in this app - a list never names everything.
 */
export const COMPLAINT_SUBJECTS = [
  'payment',
  'order',
  'product',
  'account',
  'other',
] as const

export type ComplaintSubject = (typeof COMPLAINT_SUBJECTS)[number]

/**
 * Long enough to be a complaint, short enough to read in a queue. The floor
 * matters more than the ceiling: "problem" is not something anyone can act
 * on, and sending it wastes her time as much as the admin's.
 */
export const MIN_COMPLAINT = 10
export const MAX_COMPLAINT = 500

export function isComplaintSubject(v: unknown): v is ComplaintSubject {
  return COMPLAINT_SUBJECTS.includes(v as ComplaintSubject)
}

/** Both sides check this: the sheet so she is told before she sends, the
 *  server because a client can send anything. */
export function complaintProblems(
  input: { subject?: unknown; message?: unknown },
): Record<string, string> {
  const fields: Record<string, string> = {}
  if (!isComplaintSubject(input.subject)) fields.subject = 'कशाबद्दल आहे ते निवडा'
  const message = String(input.message ?? '').trim()
  if (message.length < MIN_COMPLAINT) fields.message = 'काय झाले ते थोडक्यात लिहा'
  else if (message.length > MAX_COMPLAINT) fields.message = `${MAX_COMPLAINT} अक्षरांपेक्षा कमी लिहा`
  return fields
}
