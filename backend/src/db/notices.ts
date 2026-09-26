import type { AdminNotice, AdminNoticeKind, Farmer } from '@shared/types.js'

/**
 * TELL HER WHAT THE OFFICE JUST DID.
 *
 * Every other line in her updates list is derived from an order, because an
 * order records its own history. An admin decision does not: a verification
 * only changes a status, so unless the decision is written down at the moment
 * it is made, "you were verified on Tuesday" cannot be recovered afterwards. Written by the handler that made the change, so the record and
 * the decision can never disagree.
 *
 * Trimmed to the last 30. This rides along inside her farmer document on every
 * read she makes, and nobody scrolls two years of admin decisions.
 */
export const NOTICE_LIMIT = 30

export function appendNotice(
  farmer: Farmer,
  kind: AdminNoticeKind,
  extra: { n?: number; subject?: string; note?: string } = {},
  at = new Date().toISOString(),
): AdminNotice[] {
  const notice: AdminNotice = { id: `${kind}:${at}`, at, kind, ...extra }
  farmer.notices = [...(farmer.notices ?? []), notice].slice(-NOTICE_LIMIT)
  return farmer.notices
}
