import type { AdminNotice, AdminNoticeKind, Seller } from '@shared/types.js'

/**
 * TELL HER WHAT THE OFFICE JUST DID.
 *
 * Every other line in her updates list is derived from an order, because an
 * order records its own history. An admin decision does not: a granted pack
 * only makes a number bigger, so unless the decision is written down at the
 * moment it is made, "you were given 5 slots on Tuesday" cannot be recovered
 * afterwards. Written by the handler that made the change, so the record and
 * the decision can never disagree.
 *
 * Trimmed to the last 30. This rides along inside her seller document on every
 * read she makes, and nobody scrolls two years of admin decisions.
 */
export const NOTICE_LIMIT = 30

export function appendNotice(
  seller: Seller,
  kind: AdminNoticeKind,
  extra: { n?: number; subject?: string; note?: string } = {},
  at = new Date().toISOString(),
): AdminNotice[] {
  const notice: AdminNotice = { id: `${kind}:${at}`, at, kind, ...extra }
  seller.notices = [...(seller.notices ?? []), notice].slice(-NOTICE_LIMIT)
  return seller.notices
}
