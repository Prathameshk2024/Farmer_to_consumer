import { Router, type Request } from 'express'
import type { AdminStats } from '@shared/types.js'
import { canSellNow } from '@shared/farmer.js'
import { summarizeReviews } from '@shared/review.js'
import { getDb, save } from '../db/store.js'
import { documentCount, startsWithinFreeReads } from '../db/firestore.js'
import { fdriBandCounts } from '../db/analytics.js'
import { appendNotice as notifyFarmer } from '../db/notices.js'
import { requireRole } from '../middleware/auth.js'
import { findCustomer } from '../db/customers.js'
import { closePasswordRequest, resetUserPassword } from '../auth/passwordRequests.js'
import type { PasswordRequest } from '../auth/types.js'
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
 * scoping and useless on a screen. "Who verified this farmer?" has to be answerable months later by someone reading the record - so
 * the readable name is stored, and the id only if the account has since been
 * removed. Before per-person accounts existed this said the same thing for
 * everybody, whoever clicked it.
 */
function verifierName(db: ReturnType<typeof getDb>, req: Request): string {
  const admin = db.admins.find((a) => a.id === req.auth?.userId)
  return admin ? `${admin.name} <${admin.email}>` : (req.auth?.userId ?? 'unknown')
}

/* ------------------------------------------------------------------ */
/* Passwords: the reset, and the forgot-password queue                 */
/* ------------------------------------------------------------------ */

/**
 * A six-digit temporary password, returned once. The admin reads it out on a
 * call to the account's own number; nothing stores it in the clear.
 */
adminRouter.post('/users/reset-password', (req, res) => {
  const db = getDb()
  const result = resetUserPassword(db, {
    role: req.body?.role === 'farmer' ? 'farmer' : 'customer',
    userId: String(req.body?.userId ?? ''),
    requestId: req.body?.requestId ? String(req.body.requestId) : undefined,
    by: verifierName(db, req),
  })
  if (!result) {
    res.status(404).json({ error: 'Not found', messageMr: 'खाते सापडले नाही' })
    return
  }
  save()
  res.json(result)
})

adminRouter.get('/password-requests', (req, res) => {
  const db = getDb()
  const status = ['OPEN', 'DONE', 'DISMISSED'].includes(String(req.query.status)) ? String(req.query.status) : 'OPEN'
  const nameOf = (r: PasswordRequest) => !r.matchedUserId ? undefined
    : r.role === 'farmer' ? db.farmers.find((f) => f.id === r.matchedUserId)?.name
    : findCustomer(db, r.matchedUserId)?.name
  const requests = db.passwordRequests
    .filter((r) => r.status === status)
    .sort((a, b) => a.at.localeCompare(b.at)) // longest wait first
    .map((r) => ({ ...r, matchedName: nameOf(r) }))
  res.json({ requests })
})

adminRouter.post('/password-requests/:id/close', (req, res) => {
  const db = getDb()
  const reason = req.body?.reason ? String(req.body.reason) : undefined
  const request = closePasswordRequest(db, req.params.id, 'DISMISSED', verifierName(db, req), reason)
  if (!request) {
    res.status(404).json({ error: 'Not open', messageMr: 'ही विनंती सापडली नाही किंवा आधीच बंद झाली आहे' })
    return
  }
  save()
  res.json({ request })
})

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

  const farmersWithEarnings = new Set(delivered.map((o) => o.farmerId))

  // A stuck order is one the farmer has taken responsibility for and then
  // sat on. These are the ones admin exists to chase.
  const stuck = db.orders.filter((o) => {
    const last = o.events[o.events.length - 1]
    if (!last) return false
    const ageH = (Date.now() - new Date(last.at).getTime()) / 3_600_000
    if (o.status === 'ACCEPTED' || o.status === 'PACKED') return ageH > 24
    if (o.status === 'OUT_FOR_DELIVERY') return ageH > 12
    return false
  })

  const bandOf = (v: number) =>
    v === 0 ? '₹0' : v < 1000 ? '< ₹1,000' : v <= 5000 ? '₹1,000-5,000' : '> ₹5,000'
  const perFarmer = new Map<string, number>()
  for (const s of db.farmers) perFarmer.set(s.id, 0)
  for (const o of delivered) perFarmer.set(o.farmerId, (perFarmer.get(o.farmerId) ?? 0) + o.total)
  const earningBandCounts = new Map<string, number>()
  for (const v of perFarmer.values()) {
    const label = bandOf(v)
    earningBandCounts.set(label, (earningBandCounts.get(label) ?? 0) + 1)
  }

  // Buyers who came back: a phone with more than one order.
  const ordersByPhone = new Map<string, number>()
  for (const o of db.orders) ordersByPhone.set(o.customerPhone, (ordersByPhone.get(o.customerPhone) ?? 0) + 1)
  const repeatBuyers = [...ordersByPhone.values()].filter((n) => n > 1).length

  const stats: AdminStats = {
    gmvMonth: earnedMonth,
    ordersToday: db.orders.filter((o) => new Date(o.placedAt).toDateString() === today).length,
    ordersWeek: db.orders.filter(
      (o) => Date.now() - new Date(o.placedAt).getTime() < 7 * 86_400_000,
    ).length,
    // "Active" means a buyer can reach him today.
    activeFarmers: db.farmers.filter((s) => canSellNow(s)).length,
    totalFarmers: db.farmers.length,
    newRegistrations: db.farmers.filter(
      (s) => Date.now() - new Date(s.createdAt).getTime() < 7 * 86_400_000,
    ).length,
    pendingVerification: db.farmers.filter((s) => s.status === 'PENDING_VERIFICATION').length,
    stuckOrders: stuck.length,
    openDisputes: 0,
    farmersEarnedTotal: earnedTotal,
    farmersEarnedMonth: earnedMonth,
    // The most truthful single measure of whether the platform works.
    farmersWithFirstEarning: farmersWithEarnings.size,
    repurchaseRate: ordersByPhone.size ? repeatBuyers / ordersByPhone.size : 0,
    openPasswordRequests: db.passwordRequests.filter((r) => r.status === 'OPEN').length,
    // On the dashboard because the boot log is the one place nobody reads.
    // docs/CAPACITY.md §4: on Spark, this size decides how many starts a day
    // the free reads cover before a start is refused and the API goes down.
    databaseDocuments: documentCount(db),
    startsWithinFreeReads: startsWithinFreeReads(documentCount(db)),
    earningBands: ['₹0', '< ₹1,000', '₹1,000-5,000', '> ₹5,000'].map((label) => ({
      label,
      v: earningBandCounts.get(label) ?? 0,
    })),
    fdriBands: fdriBandCounts(db.farmers),
  }

  res.json({ stats })
})

adminRouter.post('/farmers/:id/verify', (req, res) => {
  const db = getDb()
  const farmer = db.farmers.find((s) => s.id === req.params.id)
  if (!farmer) { res.status(404).json({ error: 'Not found', messageMr: 'शेतकरी सापडला नाही' }); return }
  if (farmer.status !== 'PENDING_VERIFICATION') {
    res.status(409).json({ error: 'Not pending', messageMr: 'हा शेतकरी आधीच तपासलेला आहे' }); return
  }
  farmer.status = 'ACTIVE'
  farmer.verifiedAt = new Date().toISOString()
  farmer.verifiedBy = verifierName(db, req)
  notifyFarmer(farmer, 'VERIFIED')
  save()
  res.json({ farmer })
})

/* ------------------------------------------------------------------ */
/* Product moderation                                                  */
/* ------------------------------------------------------------------ */

adminRouter.get('/products', (req, res) => {
  const db = getDb()
  const status = (req.query.status as string) ?? 'ALL'

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
    farmer: db.farmers.find((s) => s.id === p.farmerId),
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

  // Listings are not approved one by one any more; the farmer is verified
  // once. Only taking a listing down is left, and an old client asking to
  // approve must not be read as a take-down.
  if (req.body?.approve) {
    res.status(400).json({ error: 'Listings are not approved', messageMr: 'माल एकेक करून मंजूर होत नाही' })
    return
  }
  const reason = String(req.body?.reason ?? '').trim()

  /**
   * A rejection needs a reason, and the server is where that is true.
   *
   * She reads it in her own app, and it is the only thing standing between
   * "your onion listing was refused because the photo is too dark" and a
   * product that vanishes for no stated cause. The console asks for one; this
   * is what makes the console's rule real rather than polite.
   */
  if (!reason) {
    res.status(400).json({
      error: 'A rejection needs a reason - the farmer reads it in their own app',
      messageMr: 'नाकारण्याचे कारण लिहा',
      fields: { reason: 'required' },
    })
    return
  }

  /**
   * A REJECTION IS A REMOVAL, THE MOMENT IT IS MADE.
   *
   * The row, its photo and its reports go at once. The reason still reaches
   * him, on the notice below, which is where he reads every other admin
   * decision. It is not lost with the row.
   */
  const owner = db.farmers.find((s) => s.id === product.farmerId)

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
    notifyFarmer(owner, 'PRODUCT_REJECTED', { subject: product.name, note: reason })
  }
  save()
  res.json({ product })
})

/* ------------------------------------------------------------------ */
/* Complaints                                                          */
/* ------------------------------------------------------------------ */

/**
 * What farmers and buyers have written from Help & Training, newest first.
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
 * Dealt with. Who did it is stored for the same reason it is on a verification:
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
  const { status, farmerId, pincode } = req.query as Record<string, string | undefined>

  let list = [...db.orders]
  if (status) list = list.filter((o) => o.status === status)
  if (farmerId) list = list.filter((o) => o.farmerId === farmerId)
  if (pincode) list = list.filter((o) => o.pincode === pincode)

  res.json({
    orders: list
      .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
      .map((o) => ({
        ...o,
        farmer: db.farmers.find((s) => s.id === o.farmerId)?.shopName,
        farmerCode: db.farmers.find((s) => s.id === o.farmerId)?.farmerCode,
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
 * farmer's shop beside each one. Low ratings are the signal worth acting on -
 * a farmer collecting ones and twos needs a call from a coordinator long
 * before she needs blocking - so `maxRating` filters to them.
 */
adminRouter.get('/reviews', (req, res) => {
  const db = getDb()
  const { farmerId, maxRating, hidden, reported } = req.query as Record<string, string | undefined>

  const open = db.reports.filter((r) => r.targetType === 'review' && !r.reviewedAt)
  const reportsFor = (id: string) => open.filter((r) => r.targetId === id)

  let list = [...db.reviews]
  if (farmerId) list = list.filter((r) => r.farmerId === farmerId)
  if (maxRating) list = list.filter((r) => r.rating <= Number(maxRating))
  if (hidden === 'true') list = list.filter((r) => r.hidden)
  if (hidden === 'false') list = list.filter((r) => !r.hidden)
  // Reported reviews are a queue like reported listings: flagging one hides
  // nothing by itself, it puts it in front of somebody who can decide.
  if (reported === 'true') list = list.filter((r) => reportsFor(r.id).length > 0)

  const farmerById = new Map(db.farmers.map((s) => [s.id, s]))
  res.json({
    reviews: list
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({
        ...r,
        farmer: farmerById.get(r.farmerId)?.shopName,
        farmerCode: farmerById.get(r.farmerId)?.farmerCode,
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
 * have written; deleting would leave nothing to look at if the farmer or the
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

adminRouter.get('/farmers', (_req, res) => {
  const db = getDb()
  // What each woman has earned, for "highest earnings first" - counted the
  // way her own page and /admin/impact count it, delivered orders only. One
  // pass over orders, not one filter per farmer.
  const earned = new Map<string, number>()
  for (const o of db.orders) {
    if (o.status === 'DELIVERED') earned.set(o.farmerId, (earned.get(o.farmerId) ?? 0) + o.total)
  }
  res.json({
    farmers: db.farmers.map((s) => {
      const products = db.products.filter(
        (p) => p.farmerId === s.id,
      )
      return {
        ...s,
        productCount: products.length,
        earned: earned.get(s.id) ?? 0,
      }
    }),
  })
})

/**
 * One woman, whole.
 *
 * The register lists everybody and shows a line each; this is the page an
 * admin opens before deciding something about her, so it answers in one
 * request what would otherwise be three - her record, her listings and her
 * orders.
 */
adminRouter.get('/farmers/:id', (req, res) => {
  const db = getDb()
  const farmer = db.farmers.find((s) => s.id === req.params.id)
  if (!farmer) {
    res.status(404).json({ error: 'Farmer not found', messageMr: 'हा शेतकरी सापडला नाही' })
    return
  }

  // Counted exactly as the register counts them, so "3 products" means the
  // same number on both screens.
  const products = db.products.filter(
    (p) => p.farmerId === farmer.id,
  )
  const orders = db.orders
    .filter((o) => o.farmerId === farmer.id)
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt))

  const reviews = db.reviews
    .filter((r) => r.farmerId === farmer.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  res.json({
    farmer: {
      ...farmer,
      productCount: products.length,
    },
    products,
    orders,
    // Hidden ones included and marked: the admin is the person who hid them.
    reviews,
    rating: summarizeReviews(reviews),
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

adminRouter.post('/farmers/:id/block', (req, res) => {
  const db = getDb()
  const farmer = db.farmers.find((s) => s.id === req.params.id)
  if (!farmer) {
    res.status(404).json({ error: 'Farmer not found', messageMr: 'हा शेतकरी सापडला नाही' })
    return
  }
  const blocked = !!req.body?.blocked
  // Unblocking goes back to what the verification says: blocking and
  // unblocking an unverified farmer must not verify him.
  farmer.status = blocked ? 'BLOCKED' : farmer.verifiedAt ? 'ACTIVE' : 'PENDING_VERIFICATION'

  if (blocked) {
    // Stamped so her own screens can tell her she has been blocked, and why.
    // Being silently unable to sell is the worst version of this.
    farmer.blockedAt = new Date().toISOString()
    farmer.blockReason = String(req.body?.reason ?? '').trim() || undefined
    notifyFarmer(farmer, 'BLOCKED', { note: farmer.blockReason })
  } else {
    farmer.blockedAt = undefined
    farmer.blockReason = undefined
    notifyFarmer(farmer, 'UNBLOCKED')
  }

  save()
  res.json({ farmer })
})

/**
 * Impact export. A programme like this has to show a funder or a government
 * department "N farmers, ₹X earned, Y villages" - build it once here rather than
 * assembling the same numbers by hand every month.
 */
adminRouter.get('/impact', (_req, res) => {
  const db = getDb()
  const delivered = db.orders.filter(
    (o) => o.status === 'DELIVERED',
  )

  const byVillage = new Map<string, { village: string; farmers: number; earned: number }>()
  for (const s of db.farmers) {
    const row = byVillage.get(s.villageCode) ?? { village: s.village, farmers: 0, earned: 0 }
    row.farmers += 1
    byVillage.set(s.villageCode, row)
  }
  for (const o of delivered) {
    const s = db.farmers.find((x) => x.id === o.farmerId)
    if (!s) continue
    const row = byVillage.get(s.villageCode)
    if (row) row.earned += o.total
  }

  res.json({
    generatedAt: new Date().toISOString(),
    totals: {
      farmers: db.farmers.length,
      activeFarmers: db.farmers.filter((s) => s.status === 'ACTIVE').length,
      farmersWithEarnings: new Set(delivered.map((o) => o.farmerId)).size,
      earned: delivered.reduce((n, o) => n + o.total, 0),
      orders: delivered.length,
      villages: byVillage.size,
    },
    byVillage: [...byVillage.entries()].map(([code, row]) => ({ code, ...row })),
    // Closed accounts are erased to zero answers, not a score anyone gave.
    fdri: db.farmers.filter((f) => f.status !== 'CLOSED').map((s) => ({
      farmerCode: s.farmerCode,
      village: s.village,
      score: s.fdriScore,
      band: s.fdriBand,
    })),
  })
})
