import { Router } from 'express'
import type { Complaint } from '@shared/types.js'
import { MAX_COMPLAINT, complaintProblems } from '@shared/complaint.js'
import { getDb, newId, save } from '../db/store.js'
import { requireRole } from '../middleware/auth.js'

/**
 * COMPLAINTS FROM INSIDE THE APP.
 *
 * Help & Training answers the questions that have answers; this is for the
 * ones that need a person to open her account - the ₹50 that was never
 * approved, the order that never arrived. She can also reach the desk on
 * WhatsApp, and that is offered beside this, but a WhatsApp message lives on
 * one phone: it cannot be counted, assigned or found again next month. This
 * one is a record.
 *
 * Her name and number are copied onto the row rather than looked up per read,
 * so the queue can be read - and she can be rung back - without a join.
 */
export const complaintsRouter: Router = Router()

complaintsRouter.post('/', requireRole('seller', 'customer'), (req, res) => {
  const db = getDb()
  const auth = req.auth!
  const byRole = auth.role === 'seller' ? 'seller' as const : 'customer' as const

  const fields = complaintProblems(req.body ?? {})
  if (Object.keys(fields).length) {
    res.status(400).json({ error: 'Validation failed', messageMr: 'माहिती तपासा', fields })
    return
  }

  const seller = byRole === 'seller' ? db.sellers.find((s) => s.id === auth.sellerId) : undefined
  const customer = byRole === 'customer'
    ? db.customers.find((c) => c.id === auth.customerId)
    : undefined
  const who = seller ?? customer
  if (!who) {
    res.status(404).json({ error: 'Account not found', messageMr: 'खाते सापडले नाही' })
    return
  }

  const complaint: Complaint = {
    id: newId('cmp'),
    byRole,
    byUserId: who.id,
    name: who.name,
    phone: who.phone,
    womenBizId: seller?.womenBizId,
    subject: req.body.subject,
    message: String(req.body.message ?? '').trim().slice(0, MAX_COMPLAINT),
    at: new Date().toISOString(),
  }

  db.complaints.push(complaint)
  save()
  res.status(201).json({ ok: true, complaint })
})
