import { Router, type Request } from 'express'
import type { AdminStats, ReadinessBand } from '@shared/types.js'
import { PLAN, countUsedSlots, slotInfo } from '@shared/seller.js'
import { allChecksDone } from '@shared/payment.js'
import { BAND_LABEL } from '@shared/readiness.js'
import { summarizeReviews } from '@shared/review.js'
import {
  SUBSCRIPTION_MONTHS, addMonths, canSellNow, subscriptionState, subscriptionView,
} from '@shared/subscription.js'
import { applyApprovedPayment } from '../db/subscription.js'
import { getDb, save } from '../db/store.js'
import { documentCount, startsWithinFreeReads } from '../db/firestore.js'
import { sellerStatusAfterReject } from '../db/payments.js'
import { appendNotice as notifySeller } from '../db/notices.js'
import { requireRole } from '../middleware/auth.js'
import { destroyImage } from './uploads.routes.js'

/**
 * ADMIN API - BACKEND ONLY.
 * =========================
 * There is deliberately no admin UI in this repo: the client wants the admin
 * site built and hosted separately. Everything an admin console needs is here,
 * as JSON, behind `requireRole('admin')`.
 *
 * Get a token with:
 *   POST /api/auth/admin/login  { email, password }
 * then send it as `Authorization: Bearer <token>` on every call below.
 *
 * Before this goes anywhere near real data, replace the token check with
 * Firebase Auth plus an `admin` custom claim, and repeat the same rule in
 * Firestore security rules. A role check that exists only in the API is one
 * misconfigured client away from being no check at all.
 */
export const adminRouter: Router = Router()

adminRouter.use(requireRole('admin'))

/**
 * Who to record against a decision.
 *
 * `req.auth.userId` is now an administrator's record id, which is correct for
 * scoping and useless on a screen. Payments are money, and "who approved
 * this?" has to be answerable months later by someone reading the record - so
 * the readable name is stored, and the id only if the account has since been
 * removed. Before per-person accounts existed this said the same thing for
 * everybody, whoever clicked it.
 */
function verifierName(db: ReturnType<typeof getDb>, req: Request): string {
  const admin = db.admins.find((a) => a.id === req.auth?.userId)
  return admin ? `${admin.name} <${admin.email}>` : (req.auth?.userId ?? 'unknown')
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

adminRouter.get('/stats', (_req, res) => {
  const db = getDb()
  const today = new Date().toDateString()
  const monthAgo = Date.now() - 30 * 86_400_000

  const delivered = db.orders.filter(
    (o) => o.status === 'DELIVERED',
  )
  const deliveredAt = (o: (typeof delivered)[number]) =>
    o.events.find((e) => e.to === 'DELIVERED')?.at

  const earnedTotal = delivered.reduce((n, o) => n + o.total, 0)
  const earnedMonth = delivered
    .filter((o) => {
      const at = deliveredAt(o)
      return at ? new Date(at).getTime() >= monthAgo : false
    })
    .reduce((n, o) => n + o.total, 0)

  const sellersWithEarnings = new Set(delivered.map((o) => o.sellerId))

  // A stuck order is one the seller has taken responsibility for and then
  // sat on. These are the ones admin exists to chase.
  const stuck = db.orders.filter((o) => {
    const last = o.events[o.events.length - 1]
    if (!last) return false
    const ageH = (Date.now() - new Date(last.at).getTime()) / 3_600_000
    if (o.status === 'ACCEPTED' || o.status === 'PACKED') return ageH > 24
    if (o.status === 'OUT_FOR_DELIVERY') return ageH > 12
    return false
  })

  const bands: Record<ReadinessBand, number> = {
    starter: 0, basic: 0, advanced: 0, digital: 0,
  }
  for (const s of db.sellers) bands[s.readinessBand] += 1

  const bandOf = (v: number) =>
    v === 0 ? '₹0' : v < 1000 ? '< ₹1,000' : v <= 5000 ? '₹1,000-5,000' : '> ₹5,000'
  const perSeller = new Map<string, number>()
  for (const s of db.sellers) perSeller.set(s.id, 0)
  for (const o of delivered) perSeller.set(o.sellerId, (perSeller.get(o.sellerId) ?? 0) + o.total)
  const earningBandCounts = new Map<string, number>()
  for (const v of perSeller.values()) {
    const label = bandOf(v)
    earningBandCounts.set(label, (earningBandCounts.get(label) ?? 0) + 1)
  }

  const approvedPayments = db.payments.filter((p) => p.status === 'APPROVED')
  const packsBySeller = new Map<string, number>()
  for (const p of approvedPayments) {
    packsBySeller.set(p.sellerId, (packsBySeller.get(p.sellerId) ?? 0) + 1)
  }
  const repurchasers = [...packsBySeller.values()].filter((n) => n > 1).length

  const stats: AdminStats = {
    gmvMonth: earnedMonth,
    ordersToday: db.orders.filter((o) => new Date(o.placedAt).toDateString() === today).length,
    ordersWeek: db.orders.filter(
      (o) => Date.now() - new Date(o.placedAt).getTime() < 7 * 86_400_000,
    ).length,
    // "Active" means a buyer can reach her today, so a paused shop is not one.
    activeSellers: db.sellers.filter((s) => canSellNow(s)).length,
    subscriptionsExpiring: db.sellers.filter(
      (s) => s.status === 'ACTIVE' && subscriptionState(s) === 'expiring',
    ).length,
    subscriptionsExpired: db.sellers.filter(
      (s) => s.status === 'ACTIVE' && subscriptionState(s) === 'expired',
    ).length,
    totalSellers: db.sellers.length,
    newRegistrations: db.sellers.filter(
      (s) => Date.now() - new Date(s.createdAt).getTime() < 7 * 86_400_000,
    ).length,
    pendingPayments: db.payments.filter((p) => p.status === 'PENDING').length,
    pendingProducts: db.products.filter((p) => p.status === 'PENDING').length,
    stuckOrders: stuck.length,
    openDisputes: 0,
    womenEarnedTotal: earnedTotal,
    womenEarnedMonth: earnedMonth,
    // The most truthful single measure of whether the platform works.
    womenWithFirstEarning: sellersWithEarnings.size,
    // Summed from the approved records, not `count * PLAN.price`. The plan
    // price is what we charge TODAY: multiplying by it restates every payment
    // ever taken at today's price, so the day the ₹50 changes, last year's
    // income silently changes with it. A payment stores what was actually paid.
    subscriptionRevenue: approvedPayments.reduce((n, p) => n + (Number(p.amount) || 0), 0),
    approvedPaymentCount: approvedPayments.length,
    repurchaseRate: db.sellers.length ? repurchasers / db.sellers.length : 0,
    // On the dashboard because the boot log is the one place nobody reads.
    // docs/CAPACITY.md §4: on Spark, this size decides how many starts a day
    // the free reads cover before a start is refused and the API goes down.
    databaseDocuments: documentCount(db),
    startsWithinFreeReads: startsWithinFreeReads(documentCount(db)),
    earningBands: ['₹0', '< ₹1,000', '₹1,000-5,000', '> ₹5,000'].map((label) => ({
      label,
      v: earningBandCounts.get(label) ?? 0,
    })),
    readinessBands: (Object.keys(bands) as ReadinessBand[]).map((band) => ({
      band,
      v: bands[band],
    })),
  }

  res.json({ stats, bandLabels: BAND_LABEL })
})

/* ------------------------------------------------------------------ */
/* Payment approvals - the highest-traffic admin screen                */
/* ------------------------------------------------------------------ */

adminRouter.get('/payments', (req, res) => {
  const db = getDb()
  const status = (req.query.status as string) ?? 'PENDING'
  // The waiting time is an SLA on somebody's livelihood, and the console draws
  // it from `submittedAt` itself - a number computed here is frozen at the
  // moment of the response, and this console sits open on a desk for hours.
  const list = db.payments.filter((p) => (status === 'ALL' ? true : p.status === status))
  res.json({ payments: list })
})

adminRouter.post('/payments/:id/approve', (req, res) => {
  const db = getDb()
  const payment = db.payments.find((p) => p.id === req.params.id)
  if (!payment) {
    res.status(404).json({ error: 'Payment not found', messageMr: 'हा भरणा सापडला नाही' })
    return
  }
  if (payment.status !== 'PENDING') {
    res.status(409).json({
      error: `Already ${payment.status}`,
      messageMr: 'यावर आधीच निर्णय झाला आहे',
    })
    return
  }

  /**
   * Approval grants five slots, so it is not one click. The admin confirms
   * the UTR and the date and time against the screenshot, and that the money
   * actually reached the account - and the request says so, or it is refused.
   * The checklist in the console is this rule, drawn.
   */
  if (!allChecksDone(req.body?.checks)) {
    res.status(400).json({
      error: 'Verify the UTR, date and time, and receipt before approving',
      messageMr: 'मंजूर करण्याआधी UTR, तारीख-वेळ आणि पैसे जमा झाल्याची खात्री करा',
    })
    return
  }

  payment.status = 'APPROVED'
  payment.verifiedAt = new Date().toISOString()
  payment.verifiedBy = verifierName(db, req)

  // A pack adds five slots; either kind can start, reopen or extend her six
  // months. The rules, and what she is told, are in db/subscription.ts.
  const seller = db.sellers.find((s) => s.id === payment.sellerId)
  if (seller) applyApprovedPayment(seller, payment, payment.verifiedAt)
  save()

  // No SMS goes out on approval, and the waiting screen no longer promises
  // one. `notifySeller` above is the whole notification: she sees it in her
  // own app the next time she opens it. Adding an SMS here means adding it to
  // that screen's copy in the same change, or the promise outlives the send.
  res.json({ payment, seller })
})

adminRouter.post('/payments/:id/reject', (req, res) => {
  const db = getDb()
  const payment = db.payments.find((p) => p.id === req.params.id)
  if (!payment) {
    res.status(404).json({ error: 'Payment not found', messageMr: 'हा भरणा सापडला नाही' })
    return
  }
  payment.status = 'REJECTED'
  payment.rejectReason = String(req.body?.reason ?? 'UTR did not match the bank statement')
  payment.verifiedAt = new Date().toISOString()
  payment.verifiedBy = verifierName(db, req)

  // Not unconditionally PAYMENT_REJECTED: clearing a duplicate submission off
  // the queue must not revoke an account another payment already paid for.
  const seller = db.sellers.find((s) => s.id === payment.sellerId)
  if (seller) {
    seller.status = sellerStatusAfterReject(seller, db.payments, payment.id)
    notifySeller(seller, 'PAYMENT_REJECTED', { note: payment.rejectReason })
  }
  save()
  res.json({ payment })
})

/** Goodwill, a trainee batch, a demo account. */
adminRouter.post('/sellers/:id/grant-slots', (req, res) => {
  const db = getDb()
  const seller = db.sellers.find((s) => s.id === req.params.id)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found', messageMr: 'ही विक्रेती सापडली नाही' })
    return
  }
  const granted = Math.max(1, Number(req.body?.packs ?? 1))
  seller.packsApproved += granted
  if (seller.status === 'REGISTERED' || seller.status === 'PAYMENT_SUBMITTED') {
    seller.status = 'ACTIVE'
  }
  // A seller given her first slots needs a term to sell in. Granted slots do
  // not extend or reopen an existing one: goodwill is slots, and time is paid.
  if (!seller.subscriptionEndsAt) {
    seller.subscriptionEndsAt = addMonths(new Date().toISOString(), SUBSCRIPTION_MONTHS)
  }
  // In slots, not packs. A pack is our unit; what she counts is the number of
  // products she can now put up.
  notifySeller(seller, 'SLOTS_GRANTED', { n: granted * PLAN.slotsPerPack })
  save()
  res.json({ seller })
})

/**
 * Take slot packs back.
 *
 * The counterpart to grant-slots, for a pack granted in error. It refuses to
 * drop her allowance below what she is already using: silently un-publishing
 * products she has live is not something an admin should be able to do by
 * mistyping a number.
 */
adminRouter.post('/sellers/:id/revoke-slots', (req, res) => {
  const db = getDb()
  const seller = db.sellers.find((s) => s.id === req.params.id)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found', messageMr: 'ही विक्रेती सापडली नाही' })
    return
  }

  const packs = Math.max(1, Number(req.body?.packs ?? 1))
  // Slots in use by the same rule her meter shows. Counting every row would
  // include drafts and rejected listings, which hold no slot, and refuse a
  // revoke the console says is possible.
  const used = countUsedSlots(db.products.filter((p) => p.sellerId === seller.id))
  const remaining = Math.max(0, seller.packsApproved - packs)

  if (remaining * PLAN.slotsPerPack < used) {
    res.status(409).json({
      error: `She is using ${used} slots; that would leave ${remaining * PLAN.slotsPerPack}`,
      messageMr: `ती सध्या ${used} जागा वापरत आहे. इतक्या जागा काढता येणार नाहीत.`,
    })
    return
  }

  seller.packsApproved = remaining
  // No packs left means she cannot sell, so the status has to say so - leaving
  // her ACTIVE with zero slots would look like a broken account to her.
  if (remaining === 0 && seller.status === 'ACTIVE') seller.status = 'REGISTERED'
  notifySeller(seller, 'SLOTS_REVOKED', { n: packs * PLAN.slotsPerPack })

  save()
  res.json({ seller })
})

/* ------------------------------------------------------------------ */
/* Product moderation                                                  */
/* ------------------------------------------------------------------ */

adminRouter.get('/products', (req, res) => {
  const db = getDb()
  const status = (req.query.status as string) ?? 'PENDING'

  const open = db.reports.filter((r) => !r.reviewedAt)
  const reportsFor = (id: string) => open.filter((r) => r.targetId === id)

  /**
   * REPORTED is not a product status, it is a queue.
   *
   * A listing a buyer has flagged is still LIVE - nothing hides on a report
   * alone, or one annoyed person could empty a woman's shop. It joins this
   * list so an admin can look, and leaves it when they either take the
   * listing down or close the reports.
   */
  const list = (status === 'REPORTED'
    ? db.products.filter((p) => reportsFor(p.id).length > 0)
    : db.products.filter((p) => (status === 'ALL' ? true : p.status === status))
  ).map((p) => ({
    ...p,
    seller: db.sellers.find((s) => s.id === p.sellerId),
    reports: reportsFor(p.id),
  }))

  res.json({ products: list, reportedCount: new Set(open.map((r) => r.targetId)).size })
})

/**
 * Looked at, and the listing stays. The reports are closed rather than
 * deleted: "three people complained and an admin disagreed" is a different
 * fact from "nobody ever complained", and the next report starts a new row.
 */
adminRouter.post('/products/:id/clear-reports', (req, res) => {
  const db = getDb()
  const now = new Date().toISOString()
  const by = verifierName(db, req)
  let closed = 0
  for (const r of db.reports) {
    if (r.targetId === req.params.id && !r.reviewedAt) {
      r.reviewedAt = now
      r.reviewedBy = by
      closed++
    }
  }
  if (closed) save()
  res.json({ ok: true, closed })
})

adminRouter.post('/products/:id/moderate', (req, res) => {
  const db = getDb()
  const product = db.products.find((p) => p.id === req.params.id)
  if (!product) {
    res.status(404).json({ error: 'Product not found', messageMr: 'हे उत्पादन सापडले नाही' })
    return
  }

  const approve = !!req.body?.approve
  const reason = String(req.body?.reason ?? '').trim()

  /**
   * A rejection needs a reason, and the server is where that is true.
   *
   * She reads it in her own app, and it is the only thing standing between
   * "your papad listing was refused because the photo is too dark" and a
   * product that vanishes for no stated cause. The console asks for one; this
   * is what makes the console's rule real rather than polite.
   */
  if (!approve && !reason) {
    res.status(400).json({
      error: 'A rejection needs a reason - she reads it in her own app',
      messageMr: 'नाकारण्याचे कारण लिहा',
      fields: { reason: 'required' },
    })
    return
  }

  /**
   * A REJECTION IS A REMOVAL, THE MOMENT IT IS MADE.
   *
   * A rejected listing used to sit in her app for 48 hours before a sweeper
   * took it, so that she could read the reason on the row itself. Since a
   * rejection frees her slot immediately, that left a dead listing occupying
   * her screen - and next to it the new one she had already put in its place.
   * Two listings for one slot, one of them refused, is not a grace period; it
   * is clutter she cannot clear.
   *
   * The reason still reaches her, on the notice below, which is where she
   * reads every other admin decision. It is not lost with the row.
   */
  const owner = db.sellers.find((s) => s.id === product.sellerId)

  if (!approve) {
    db.products.splice(db.products.indexOf(product), 1)
    // Its reports go with it: they are about a listing that no longer exists.
    for (let i = db.reports.length - 1; i >= 0; i--) {
      if (db.reports[i]!.targetId === product.id) db.reports.splice(i, 1)
    }
    // Best effort and not awaited: the record is already gone and an image
    // left behind is a smaller problem than a decision that appears to hang.
    // This is the last moment we know the public id.
    void destroyImage(product.imagePublicId)
    if (owner) {
      notifySeller(owner, 'PRODUCT_REJECTED', { subject: product.name, note: reason })
    }
    save()
    res.json({ product: { ...product, status: 'REJECTED', rejectReason: reason } })
    return
  }

  product.status = 'LIVE'
  product.rejectReason = undefined
  product.rejectedAt = undefined

  // She is told about her own product by name: "which one?" is the first
  // thing she asks, and the id on the row means nothing to her.
  if (owner) notifySeller(owner, 'PRODUCT_APPROVED', { subject: product.name })

  save()
  res.json({ product })
})

/* ------------------------------------------------------------------ */
/* Complaints                                                          */
/* ------------------------------------------------------------------ */

/**
 * What sellers and buyers have written from Help & Training, newest first.
 * Open ones by default: this is a queue to work through, not an archive.
 */
adminRouter.get('/complaints', (req, res) => {
  const db = getDb()
  const status = (req.query.status as string) ?? 'OPEN'
  const list = db.complaints
    .filter((c) => (status === 'ALL' ? true : status === 'RESOLVED' ? !!c.resolvedAt : !c.resolvedAt))
    .sort((a, b) => b.at.localeCompare(a.at))
  res.json({ complaints: list, openCount: db.complaints.filter((c) => !c.resolvedAt).length })
})

/**
 * Dealt with. Who did it is stored for the same reason it is on a payment:
 * "who answered this woman?" has to be answerable months later.
 */
adminRouter.post('/complaints/:id/resolve', (req, res) => {
  const db = getDb()
  const complaint = db.complaints.find((c) => c.id === req.params.id)
  if (!complaint) {
    res.status(404).json({ error: 'Not found', messageMr: 'ही तक्रार सापडली नाही' })
    return
  }
  complaint.resolvedAt = new Date().toISOString()
  complaint.resolvedBy = verifierName(db, req)
  save()
  res.json({ complaint })
})

/* ------------------------------------------------------------------ */
/* Monitoring                                                          */
/* ------------------------------------------------------------------ */

adminRouter.get('/orders', (req, res) => {
  const db = getDb()
  const { status, sellerId, pincode } = req.query as Record<string, string | undefined>

  let list = [...db.orders]
  if (status) list = list.filter((o) => o.status === status)
  if (sellerId) list = list.filter((o) => o.sellerId === sellerId)
  if (pincode) list = list.filter((o) => o.pincode === pincode)

  res.json({
    orders: list
      .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
      .map((o) => ({
        ...o,
        seller: db.sellers.find((s) => s.id === o.sellerId)?.shopName,
        womenBizId: db.sellers.find((s) => s.id === o.sellerId)?.womenBizId,
      })),
  })
})

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

/**
 * Every review on the platform, hidden ones included.
 *
 * The admin reads what the public reads plus what was taken down, with the
 * seller's shop beside each one. Low ratings are the signal worth acting on -
 * a seller collecting ones and twos needs a call from a coordinator long
 * before she needs blocking - so `maxRating` filters to them.
 */
adminRouter.get('/reviews', (req, res) => {
  const db = getDb()
  const { sellerId, maxRating, hidden, reported } = req.query as Record<string, string | undefined>

  const open = db.reports.filter((r) => r.targetType === 'review' && !r.reviewedAt)
  const reportsFor = (id: string) => open.filter((r) => r.targetId === id)

  let list = [...db.reviews]
  if (sellerId) list = list.filter((r) => r.sellerId === sellerId)
  if (maxRating) list = list.filter((r) => r.rating <= Number(maxRating))
  if (hidden === 'true') list = list.filter((r) => r.hidden)
  if (hidden === 'false') list = list.filter((r) => !r.hidden)
  // Reported reviews are a queue like reported listings: flagging one hides
  // nothing by itself, it puts it in front of somebody who can decide.
  if (reported === 'true') list = list.filter((r) => reportsFor(r.id).length > 0)

  const sellerById = new Map(db.sellers.map((s) => [s.id, s]))
  res.json({
    reviews: list
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({
        ...r,
        seller: sellerById.get(r.sellerId)?.shopName,
        womenBizId: sellerById.get(r.sellerId)?.womenBizId,
        reports: reportsFor(r.id),
      })),
    summary: summarizeReviews(list),
    reportedCount: new Set(open.map((r) => r.targetId)).size,
  })
})

/**
 * Looked at, and the review stays. Same decision as closing a listing's
 * reports: hiding a buyer's words because somebody objected to them is a
 * judgement, not an automatic consequence of being reported.
 */
adminRouter.post('/reviews/:id/clear-reports', (req, res) => {
  const db = getDb()
  const now = new Date().toISOString()
  const by = verifierName(db, req)
  let closed = 0
  for (const r of db.reports) {
    if (r.targetId === req.params.id && !r.reviewedAt) {
      r.reviewedAt = now
      r.reviewedBy = by
      closed++
    }
  }
  if (closed) save()
  res.json({ ok: true, closed })
})

/**
 * Take a review down, or put it back.
 *
 * Hiding is the only thing an admin can do to a review. Editing a buyer's
 * words would make every review on the platform something the platform might
 * have written; deleting would leave nothing to look at if the seller or the
 * buyer disputes the decision. A reason is required to hide, and kept.
 */
adminRouter.post('/reviews/:id/hide', (req, res) => {
  const db = getDb()
  const review = db.reviews.find((r) => r.id === req.params.id)
  if (!review) {
    res.status(404).json({ error: 'Review not found', messageMr: 'हा अभिप्राय सापडला नाही' })
    return
  }

  const hide = !!req.body?.hidden
  const reason = String(req.body?.reason ?? '').trim()
  if (hide && !reason) {
    res.status(400).json({
      error: 'Hiding a review needs a reason',
      messageMr: 'अभिप्राय लपवण्याचे कारण लिहा',
      fields: { reason: 'required' },
    })
    return
  }

  review.hidden = hide || undefined
  review.hiddenAt = hide ? new Date().toISOString() : undefined
  review.hiddenBy = hide ? verifierName(db, req) : undefined
  review.hiddenReason = hide ? reason : undefined

  save()
  res.json({ review })
})

adminRouter.get('/sellers', (_req, res) => {
  const db = getDb()
  // What each woman has earned, for "highest earnings first" - counted the
  // way her own page and /admin/impact count it, delivered orders only. One
  // pass over orders, not one filter per seller.
  const earned = new Map<string, number>()
  for (const o of db.orders) {
    if (o.status === 'DELIVERED') earned.set(o.sellerId, (earned.get(o.sellerId) ?? 0) + o.total)
  }
  res.json({
    sellers: db.sellers.map((s) => {
      const products = db.products.filter(
        (p) => p.sellerId === s.id,
      )
      return {
        ...s,
        slots: slotInfo(s, products),
        productCount: products.length,
        earned: earned.get(s.id) ?? 0,
        // On the server's clock, like every other answer about the date.
        subscription: subscriptionView(s),
      }
    }),
  })
})

/**
 * One woman, whole.
 *
 * The register lists everybody and shows a line each; this is the page an
 * admin opens before deciding something about her, so it answers in one
 * request what would otherwise be four - her record, her listings, her orders
 * and every subscription payment she has ever submitted.
 */
adminRouter.get('/sellers/:id', (req, res) => {
  const db = getDb()
  const seller = db.sellers.find((s) => s.id === req.params.id)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found', messageMr: 'ही विक्रेती सापडली नाही' })
    return
  }

  // Archived listings are excluded exactly as they are in the register, so
  // "3 products" means the same number on both screens.
  const products = db.products.filter(
    (p) => p.sellerId === seller.id,
  )
  const orders = db.orders
    .filter((o) => o.sellerId === seller.id)
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt))

  const reviews = db.reviews
    .filter((r) => r.sellerId === seller.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  res.json({
    seller: {
      ...seller,
      slots: slotInfo(seller, products),
      productCount: products.length,
      subscription: subscriptionView(seller),
    },
    products,
    orders,
    // Hidden ones included and marked: the admin is the person who hid them.
    reviews,
    rating: summarizeReviews(reviews),
    payments: db.payments
      .filter((p) => p.sellerId === seller.id)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    /**
     * What she has earned, counted the way /admin/impact counts it: delivered
     * orders and nothing else. Two screens answering "how much has she made"
     * with two different numbers is how an admin stops trusting either.
     */
    earned: orders
      .filter((o) => o.status === 'DELIVERED')
      .reduce((n, o) => n + o.total, 0),
  })
})

adminRouter.post('/sellers/:id/block', (req, res) => {
  const db = getDb()
  const seller = db.sellers.find((s) => s.id === req.params.id)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found', messageMr: 'ही विक्रेती सापडली नाही' })
    return
  }
  const blocked = !!req.body?.blocked
  seller.status = blocked ? 'BLOCKED' : 'ACTIVE'

  if (blocked) {
    // Stamped so her own screens can tell her she has been blocked, and why.
    // Being silently unable to sell is the worst version of this.
    seller.blockedAt = new Date().toISOString()
    seller.blockReason = String(req.body?.reason ?? '').trim() || undefined
    notifySeller(seller, 'BLOCKED', { note: seller.blockReason })
  } else {
    seller.blockedAt = undefined
    seller.blockReason = undefined
    notifySeller(seller, 'UNBLOCKED')
  }

  save()
  res.json({ seller })
})

/**
 * Impact export. A programme like this has to show a funder or a government
 * department "N women, ₹X earned, Y villages" - build it once here rather than
 * assembling the same numbers by hand every month.
 */
adminRouter.get('/impact', (_req, res) => {
  const db = getDb()
  const delivered = db.orders.filter(
    (o) => o.status === 'DELIVERED',
  )

  const byVillage = new Map<string, { village: string; women: number; earned: number }>()
  for (const s of db.sellers) {
    const row = byVillage.get(s.villageCode) ?? { village: s.village, women: 0, earned: 0 }
    row.women += 1
    byVillage.set(s.villageCode, row)
  }
  for (const o of delivered) {
    const s = db.sellers.find((x) => x.id === o.sellerId)
    if (!s) continue
    const row = byVillage.get(s.villageCode)
    if (row) row.earned += o.total
  }

  res.json({
    generatedAt: new Date().toISOString(),
    totals: {
      women: db.sellers.length,
      activeWomen: db.sellers.filter((s) => s.status === 'ACTIVE').length,
      womenWithEarnings: new Set(delivered.map((o) => o.sellerId)).size,
      earned: delivered.reduce((n, o) => n + o.total, 0),
      orders: delivered.length,
      villages: byVillage.size,
    },
    byVillage: [...byVillage.entries()].map(([code, row]) => ({ code, ...row })),
    readiness: db.sellers.map((s) => ({
      womenBizId: s.womenBizId,
      village: s.village,
      score: s.readinessScore,
      band: s.readinessBand,
    })),
  })
})
