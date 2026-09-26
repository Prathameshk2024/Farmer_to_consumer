/**
 * REPORTING WHAT SHOULD NOT BE HERE.
 *
 * Anyone can list anything in this market, and the only people who see a
 * listing before an admin does are the buyers looking at it. So a buyer needs
 * a way to say "this is wrong" from the screen where she found it - which is
 * also what Google Play requires of any app carrying content its users write:
 * an in-app way to flag objectionable content, and someone who acts on it.
 *
 * A REASON IS ALWAYS REQUIRED, picked from this list. "Spoiled food" and "not
 * her photograph" are different problems with different answers, and a queue
 * of reports that all say "inappropriate" cannot be triaged by anybody.
 * `other` is the escape hatch and the only one that needs typed words, for
 * the same reason cancelling an order does: a list can never name everything.
 */
export const REPORT_REASONS = [
  'unsafe',
  'wrongInfo',
  'notTheirs',
  'offensive',
  'scam',
  'other',
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

/** What can be reported. Both are things one user wrote for others to read. */
export const REPORT_TARGETS = ['product', 'review'] as const
export type ReportTarget = (typeof REPORT_TARGETS)[number]

/** Long enough to explain, short enough to read in a queue. */
export const MIN_REPORT_NOTE = 5
export const MAX_REPORT_NOTE = 200

export function isReportReason(v: unknown): v is ReportReason {
  return REPORT_REASONS.includes(v as ReportReason)
}

export function isReportTarget(v: unknown): v is ReportTarget {
  return REPORT_TARGETS.includes(v as ReportTarget)
}

/**
 * Both sides check this: the sheet so she is told before she sends, the
 * server because a client can send anything.
 */
export function reportProblems(
  input: { reason?: unknown; note?: unknown },
): Record<string, string> {
  const fields: Record<string, string> = {}
  if (!isReportReason(input.reason)) {
    fields.reason = 'कारण निवडा'
    return fields
  }
  if (input.reason === 'other') {
    const note = String(input.note ?? '').trim()
    if (note.length < MIN_REPORT_NOTE) fields.note = 'काय अडचण आहे ते थोडक्यात लिहा'
    else if (note.length > MAX_REPORT_NOTE) fields.note = `${MAX_REPORT_NOTE} अक्षरांपेक्षा कमी लिहा`
  }
  return fields
}
