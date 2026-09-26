import { Router } from 'express'
import type { Report } from '@shared/types.js'
import {
  MAX_REPORT_NOTE, isReportTarget, reportProblems,
} from '@shared/report.js'
import { getDb, newId, save } from '../db/store.js'
import { requireRole } from '../middleware/auth.js'

/**
 * A BUYER SAYING SOMETHING SHOULD NOT BE HERE.
 *
 * Anyone can list anything in this market and an admin sees a listing only
 * when it is submitted; after that the people looking at it are buyers. This
 * is the route that lets one of them say so - and the in-app reporting that
 * Google Play requires of an app carrying what its users write.
 *
 * Reports are stored rather than derived: nothing else on a product changes
 * when somebody reports it, so the row IS the record. They are deleted with
 * the listing when an admin takes it down.
 */
export const reportsRouter: Router = Router()

reportsRouter.post('/', requireRole('customer', 'seller'), (req, res) => {
  const db = getDb()
  // Either side may flag: a buyer reading a listing, and the seller an
  // abusive review is written about. Hers is the only complaint nobody else
  // is in a position to make.
  const byRole = req.auth!.role === 'seller' ? 'seller' as const : 'customer' as const
  const byUserId = (byRole === 'seller' ? req.auth!.sellerId : req.auth!.customerId)!
  const { targetType, targetId } = req.body ?? {}

  if (!isReportTarget(targetType) || !targetId) {
    res.status(400).json({ error: 'Unknown target', messageMr: 'हे नोंदवता आले नाही' })
    return
  }

  const fields = reportProblems(req.body ?? {})
  if (Object.keys(fields).length) {
    res.status(400).json({ error: 'Validation failed', messageMr: 'कारण निवडा', fields })
    return
  }

  // What is being reported has to exist, or the queue fills with rows nobody
  // can act on - and a 404 here is also what stops a stranger probing ids.
  const product = targetType === 'product'
    ? db.products.find((p) => p.id === targetId)
    : undefined
  const review = targetType === 'review'
    ? db.reviews.find((r) => r.id === targetId)
    : undefined
  if (!product && !review) {
    res.status(404).json({ error: 'Not found', messageMr: 'हे सापडले नाही' })
    return
  }

  /**
   * One report per buyer per thing. A second tap is a woman making sure it
   * went, not a second complaint, and counting it twice would make three
   * annoyed people look like a scandal in the admin queue.
   */
  const already = db.reports.find(
    (r) => r.byUserId === byUserId && r.targetId === targetId && !r.reviewedAt,
  )
  if (already) {
    res.json({ ok: true, report: already, duplicate: true })
    return
  }

  const report: Report = {
    id: newId('rep'),
    targetType,
    targetId,
    sellerId: product?.sellerId ?? review?.sellerId,
    targetName: product?.name ?? review?.productName,
    reason: req.body.reason,
    note: req.body.reason === 'other'
      ? String(req.body.note ?? '').trim().slice(0, MAX_REPORT_NOTE)
      : undefined,
    byUserId,
    byRole,
    at: new Date().toISOString(),
  }

  db.reports.push(report)
  save()
  res.status(201).json({ ok: true, report })
})
