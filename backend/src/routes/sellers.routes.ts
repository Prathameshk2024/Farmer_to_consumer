import { Router } from 'express'
import type { DigitalProfile, Seller, SubscriptionPayment } from '@shared/types.js'
import {
  defaultAbout, fssaiProblem, isValidPhone, isValidPincode, normalizeFssai,
  normalizePhone, PLAN, samePhone, slotInfo, validateSellerProfile,
} from '@shared/seller.js'
import { normalizeUtr, paidAtProblem, upiProblem, utrProblem } from '@shared/payment.js'
import { closeReasonProblem, confirmProblem } from '@shared/accountClose.js'
import { openOrdersForSeller, requestSellerClose, restoreSeller } from '../db/accountClose.js'
import { screenshotProblem } from '../db/payments.js'
import { makeShopSlug, makeWomenBizId, villageCode } from '@shared/womenbiz.js'
import { computeReadiness, readinessBand, recomputeForSeller } from '@shared/readiness.js'
import { getDb, newId, save } from '../db/store.js'
import { buyersForSeller } from '../db/customers.js'
import { sellerProductReviews, sellerRating } from '../db/reviews.js'
import { publicSeller } from '../db/publicSeller.js'
import {
  type PaymentKind, canSellNow, payableKinds, paymentKindProblem, subscriptionView,
} from '@shared/subscription.js'
import { ADMIN_PAYMENT_ACCOUNT, cloudinary, usingCloudinary } from '../config.js'
import { callerIp, requireRole } from '../middleware/auth.js'
import { signToken } from '../auth/tokens.js'
import { createSession, describeClient } from '../auth/sessions.js'
import { consumeTicket } from '../auth/tickets.js'
import { recordAuthEvent } from '../auth/events.js'
import { hashIp, maskPhone } from '../auth/crypto.js'
import { hit, LIMITS } from '../auth/rateLimit.js'

export const sellersRouter: Router = Router()

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

interface RegisterBody {
  /**
   * Single-use proof from /auth/otp/verify that this phone was verified. The
   * phone is read out of THIS, never out of the body - see the handler.
   */
  ticket: string
  /** Ignored. Kept only so an older client's payload still parses. */
  phone?: string
  name: string
  age?: number
  education?: string
  whatsapp?: string
  village: string
  taluka: string
  district: string
  pincode: string
  shopName: string
  about?: string
  businessType: Seller['businessType']
  shgName?: string
  yearsInBusiness?: number
  monthlyCapacity?: number
  sellsFood: boolean
  fssai?: string
  upiId: string
  upiQrUrl?: string
  upiQrPublicId?: string
  digital: DigitalProfile
  deliveryFee?: number
  minOrder?: number
  freeDeliveryAbove?: number
  dispatch?: Seller['dispatch']
}

/**
 * Create the seller record. She is REGISTERED at this point, not ACTIVE - she
 * still has to pay the 50 rupees and have admin approve it before she can
 * publish anything.
 *
 * Everything is validated here even though the client validates too. The client
 * validation exists to give her a fast message in Marathi; this exists because
 * the client can be bypassed.
 */
sellersRouter.post('/register', (req, res) => {
  const b = req.body as RegisterBody
  const fields: Record<string, string> = {}
  const ip = hashIp(callerIp(req))

  // Registration writes a record and issues a session, so it is worth money
  // and worth rate limiting even though it is otherwise gated by the ticket.
  const burst = hit(`register:ip:${ip}`, LIMITS.registerPerIp)
  if (!burst.ok) {
    res.setHeader('Retry-After', String(burst.retryAfterSec))
    res.status(429).json({
      error: 'Too many registrations',
      messageMr: 'खूप वेळा प्रयत्न झाले. थोड्या वेळाने पुन्हा प्रयत्न करा.',
    })
    return
  }

  /**
   * PROOF THAT THIS PHONE PASSED AN OTP, JUST NOW.
   *
   * This is the gate that was missing. The handler used to read `b.phone`
   * straight out of the request body and mint a seller session for it, with no
   * check of any kind - so anybody who could reach the API could create an
   * account against any unregistered number and be signed in as her. The
   * client walked through the OTP screen first, which is not the same thing as
   * the server requiring it.
   *
   * The phone now comes OUT of the single-use ticket and the body's copy is
   * ignored entirely, so there is no longer any path by which a caller names
   * the number he is registering.
   */
  const phone = consumeTicket('seller-register', String((b as { ticket?: string }).ticket ?? ''))
  if (!phone) {
    recordAuthEvent(getDb(), { type: 'otp.verify.fail', ip, detail: 'register without a valid ticket' })
    save()
    res.status(401).json({
      error: 'Phone not verified',
      messageMr: 'आधी मोबाईल नंबर तपासा. पुन्हा OTP मागवा.',
    })
    return
  }

  if (!isValidPhone(phone)) fields.phone = '10 अंकी मोबाईल नंबर टाका'
  if (!b.name?.trim()) fields.name = 'नाव आवश्यक आहे'
  if (!b.village?.trim()) fields.village = 'गाव आवश्यक आहे'
  if (!b.shopName?.trim()) fields.shopName = 'दुकानाचे नाव आवश्यक आहे'
  if (!isValidPincode(b.pincode)) fields.pincode = '6 अंकी पिनकोड टाका'
  const upiFault = upiProblem(b.upiId)
  if (upiFault) fields.upiId = upiFault
  const fssaiFault = fssaiProblem(b.fssai)
  if (fssaiFault) fields.fssai = fssaiFault
  if (b.age != null && (b.age < 18 || b.age > 90)) fields.age = 'वय 18 ते 90 दरम्यान असावे'

  if (Object.keys(fields).length) {
    res.status(400).json({ error: 'Validation failed', messageMr: 'माहिती तपासा', fields })
    return
  }

  const db = getDb()
  if (db.sellers.some((s) => samePhone(s.phone, phone))) {
    res.status(409).json({
      error: 'Already registered',
      messageMr: 'हा नंबर आधीच नोंदणीकृत आहे. लॉगिन करा.',
    })
    return
  }

  const digital: DigitalProfile = {
    smartphone: !!b.digital?.smartphone,
    internet: !!b.digital?.internet,
    upi: !!b.digital?.upi,
    whatsappBusiness: !!b.digital?.whatsappBusiness,
    socialMedia: !!b.digital?.socialMedia,
    digitalMarketing: !!b.digital?.digitalMarketing,
  }
  // Baseline score: self-reported only. The four measured factors stay at zero
  // until she actually does them, which is what makes before/after meaningful.
  const score = computeReadiness(digital)

  const womenBizId = makeWomenBizId(b.village, db.sellers.map((s) => s.womenBizId))
  const id = newId('s')

  const seller: Seller = {
    id,
    womenBizId,
    name: b.name.trim(),
    photo: '👩',
    phone: normalizePhone(phone),
    whatsapp: normalizePhone(b.whatsapp || phone),
    age: b.age,
    education: b.education,
    village: b.village.trim(),
    villageCode: villageCode(b.village),
    taluka: b.taluka?.trim() ?? '',
    district: b.district?.trim() ?? '',
    pincode: b.pincode.trim(),
    shopName: b.shopName.trim(),
    shopSlug: makeShopSlug(b.shopName, womenBizId),
    // Her shop opens with a description whether or not she wrote one.
    about: b.about?.trim() || defaultAbout({
      shopName: b.shopName.trim(),
      village: b.village.trim(),
      businessType: b.businessType ?? 'individual',
      shgName: b.shgName?.trim(),
      sellsFood: !!b.sellsFood,
      yearsInBusiness: b.yearsInBusiness,
    }),
    businessType: b.businessType ?? 'individual',
    shgName: b.shgName?.trim(),
    yearsInBusiness: b.yearsInBusiness,
    monthlyCapacity: b.monthlyCapacity,
    sellsFood: !!b.sellsFood,
    fssai: b.sellsFood ? normalizeFssai(b.fssai) || undefined : undefined,
    upiId: b.upiId.trim(),
    upiVerified: false,
    // Her own bank's QR, if she photographed it during registration. It is
    // optional: a QR can still be generated from the UPI id above, and one
    // more required upload is one more place a first-time user stops.
    upiQrUrl: b.upiQrUrl,
    upiQrPublicId: b.upiQrPublicId,
    upiQrReady: !!b.upiQrUrl,
    digital,
    readinessScore: score,
    readinessBand: readinessBand(score),
    isOpen: true,
    deliveryFee: Number(b.deliveryFee ?? 0),
    freeDeliveryAbove: Number(b.freeDeliveryAbove ?? 0),
    minOrder: Number(b.minOrder ?? 0),
    dispatch: b.dispatch ?? 'same',
    pincodes: [b.pincode.trim()],
    status: 'REGISTERED',
    packsApproved: 0,
    rating: 0,
    ratingCount: 0,
    qrScans: 0,
    qrOrders: 0,
    createdAt: new Date().toISOString(),
  }

  db.sellers.push(seller)
  save()

  // She is signed in from here, on a session that can later be revoked like
  // any other - registration is not a special kind of login.
  const session = createSession(db, {
    role: 'seller',
    userId: id,
    phone: seller.phone,
    sellerId: id,
    client: describeClient(req.headers['user-agent']),
  })
  recordAuthEvent(db, {
    type: 'register.seller',
    subject: maskPhone(seller.phone),
    role: 'seller',
    ip,
    sessionId: session.id,
  })
  save()

  res.status(201).json({
    seller,
    session: {
      token: signToken({ sid: session.id, role: 'seller' }),
      role: 'seller',
      userId: id,
      phone: seller.phone,
      name: seller.name,
      sellerId: id,
    },
  })
})

/* ------------------------------------------------------------------ */
/* Me                                                                  */
/* ------------------------------------------------------------------ */

sellersRouter.get('/me', requireRole('seller'), (req, res) => {
  const db = getDb()
  const seller = db.sellers.find((s) => s.id === req.auth!.sellerId)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found' })
    return
  }
  const products = db.products.filter((p) => p.sellerId === seller.id)
  res.json({ seller, slots: slotInfo(seller, products), subscription: subscriptionView(seller) })
})

/**
 * Her buyers, derived from her own orders.
 *
 * Nothing here is new to her: an order detail screen already shows the name,
 * address and phone of whoever placed it. This gathers them so she can see who
 * comes back, which is the thing a shopkeeper knows by memory and an app owner
 * otherwise never learns.
 */
sellersRouter.get('/me/buyers', requireRole('seller'), (req, res) => {
  res.json({ buyers: buyersForSeller(getDb(), req.auth!.sellerId!) })
})

/**
 * What her buyers said about her products, each review naming the product -
 * exactly the words the public reads on those products, and nothing hidden -
 * with the rating buyers see on her card, worked out the same way.
 */
sellersRouter.get('/me/reviews', requireRole('seller'), (req, res) => {
  const db = getDb()
  const sellerId = req.auth!.sellerId!
  res.json({ reviews: sellerProductReviews(db, sellerId), summary: sellerRating(db, sellerId) })
})

sellersRouter.patch('/me', requireRole('seller'), (req, res) => {
  const db = getDb()
  const i = db.sellers.findIndex((s) => s.id === req.auth!.sellerId)
  if (i < 0) {
    res.status(404).json({ error: 'Seller not found' })
    return
  }

  // Allow-list. Never spread req.body into a stored record - that is how a
  // seller sets her own status to ACTIVE or grants herself slots.
  const allowed = [
    'name', 'photo', 'whatsapp', 'about', 'shopName', 'isOpen', 'deliveryFee',
    'freeDeliveryAbove', 'minOrder', 'dispatch', 'pincodes', 'monthlyCapacity',
    'age', 'education', 'yearsInBusiness', 'shgName', 'digital',
    'upiQrUrl', 'upiQrReady',
  ] as const

  const current = db.sellers[i]!
  const patch: Partial<Seller> = {}
  for (const key of allowed) {
    if (key in req.body) (patch as Record<string, unknown>)[key] = req.body[key]
  }

  // UPI changes re-enter verification: otherwise it is an account-takeover route.
  if (typeof req.body.upiId === 'string' && req.body.upiId !== current.upiId) {
    const fault = upiProblem(req.body.upiId)
    if (fault) {
      res.status(400).json({ error: 'Bad UPI', messageMr: fault, fields: { upiId: fault } })
      return
    }
    patch.upiId = req.body.upiId
    patch.upiVerified = false
  }

  // The allow-list decides WHICH fields may move; this decides whether what
  // she sent makes sense. Same function the form runs, so the message under
  // the box is the same message either way.
  const fields = validateSellerProfile(patch)
  if (Object.keys(fields).length) {
    res.status(400).json({ error: 'Validation failed', messageMr: 'माहिती तपासा', fields })
    return
  }

  const next = { ...current, ...patch }

  // Keep the readiness index in step with what she actually has now.
  const products = db.products.filter((p) => p.sellerId === next.id)
  const completed = db.orders.filter((o) => o.sellerId === next.id && o.status === 'DELIVERED')
  const { score, band } = recomputeForSeller(next, {
    productCount: products.length,
    productsWithDetail: products.filter((p) => p.ingredients || p.material).length,
    completedOrders: completed.length,
  })
  next.readinessScore = score
  next.readinessBand = band

  db.sellers[i] = next
  save()
  res.json({ seller: next })
})

/* ------------------------------------------------------------------ */
/* Closing the account                                                 */
/* ------------------------------------------------------------------ */

/**
 * She asked for her account to be deleted.
 *
 * Three things have to be true before anything happens, and the server checks
 * all three however carefully the app already did: a reason, the last four
 * digits of her own number, and no order still in flight. The last one is not
 * a formality - a buyer waiting on a delivery cannot be left holding an order
 * whose seller has vanished, so the answer names the orders and she finishes
 * or cancels them with the buttons she already has.
 *
 * What this does NOT do is erase her. That is a week away - see
 * `db/accountClose.ts` - and every screen tells her so.
 */
sellersRouter.post('/me/close', requireRole('seller'), (req, res) => {
  const db = getDb()
  const seller = db.sellers.find((s) => s.id === req.auth!.sellerId)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found' })
    return
  }

  const reason = String(req.body?.reason ?? '')
  const note = req.body?.note === undefined ? undefined : String(req.body.note).trim()

  const reasonProblem = closeReasonProblem(reason, note)
  if (reasonProblem) {
    res.status(400).json({ error: 'Reason required', messageMr: reasonProblem, fields: { reason: reasonProblem } })
    return
  }

  const digitsProblem = confirmProblem(seller.phone, req.body?.confirm)
  if (digitsProblem) {
    res.status(400).json({ error: 'Confirmation failed', messageMr: digitsProblem, fields: { confirm: digitsProblem } })
    return
  }

  const open = openOrdersForSeller(db, seller.id)
  if (open.length > 0) {
    res.status(409).json({
      error: 'Open orders',
      messageMr: 'सुरू असलेली ऑर्डर आधी पूर्ण करा किंवा रद्द करा. त्यानंतर खाते बंद करता येईल.',
      openOrders: open.map((o) => ({ id: o.id, status: o.status })),
    })
    return
  }

  requestSellerClose(db, seller, { reason, note })
  recordAuthEvent(db, {
    type: 'session.end', subject: maskPhone(seller.phone), role: 'seller',
    ip: callerIp(req), detail: 'account.close',
  })
  save()
  res.json({ ok: true, closingAt: seller.closingAt })
})

/**
 * She changed her mind inside the week.
 *
 * Reached by signing in again, which is the whole point: the person who can
 * stop it is the person who can still pass an OTP on that number.
 */
sellersRouter.post('/me/restore', requireRole('seller'), (req, res) => {
  const db = getDb()
  const seller = db.sellers.find((s) => s.id === req.auth!.sellerId)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found' })
    return
  }
  if (seller.status !== 'CLOSED' || !seller.closingAt) {
    // Already erased, or never closing. Either way there is nothing to undo,
    // and saying so beats pretending an empty record came back.
    res.status(409).json({
      error: 'Not closing',
      messageMr: 'हे खाते बंद होत नाही आहे.',
    })
    return
  }

  restoreSeller(seller)
  save()
  res.json({ seller })
})

/* ------------------------------------------------------------------ */
/* Public seller record (the "sold by" card on a product)              */
/* ------------------------------------------------------------------ */

sellersRouter.get('/:id', (req, res) => {
  const seller = getDb().sellers.find((s) => s.id === req.params.id)
  // Same rule as /slug/:slug. A seller who has not been approved, or who has
  // been blocked, is not public - customers only ever see approved shops.
  // A paused shop is not public either, until she renews.
  if (!seller || !canSellNow(seller)) {
    res.status(404).json({ error: 'Seller not found', messageMr: 'ही विक्रेती सापडली नाही' })
    return
  }
  // The same allow-listed card the catalogue sends. This used to strip seven
  // named fields and pass everything else, including her admin notices.
  res.json({ seller: publicSeller(seller, sellerRating(getDb(), seller.id)) })
})

/* ------------------------------------------------------------------ */
/* Subscription: the 50 rupees                                         */
/* ------------------------------------------------------------------ */

sellersRouter.get('/me/subscription', requireRole('seller'), (req, res) => {
  const db = getDb()
  const sellerId = req.auth!.sellerId!
  const seller = db.sellers.find((s) => s.id === sellerId)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found' })
    return
  }
  const products = db.products.filter((p) => p.sellerId === sellerId)
  const slots = slotInfo(seller, products)
  res.json({
    plan: PLAN,
    account: ADMIN_PAYMENT_ACCOUNT,
    slots,
    status: seller.status,
    subscription: subscriptionView(seller),
    // What she may pay for right now, most urgent first. The screen draws
    // exactly this and the submit below refuses anything else.
    payable: payableKinds(seller, slots.left),
    // The screen asks for exactly what the submit below will insist on.
    screenshotRequired: usingCloudinary,
    payments: db.payments
      .filter((p) => p.sellerId === sellerId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
  })
})

/** She has paid and is submitting the reference number. */
sellersRouter.post('/me/subscription/payment', requireRole('seller'), (req, res) => {
  const db = getDb()
  const sellerId = req.auth!.sellerId!
  const seller = db.sellers.find((s) => s.id === sellerId)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found' })
    return
  }

  /**
   * ONE PENDING PAYMENT AT A TIME.
   *
   * Her app hides the pay button once something is waiting, but the button is
   * not the rule - a second tap on a slow connection, a back press onto the
   * form, or anything that is not the app would otherwise put a second ₹50 row
   * in the admin queue for the same money, and an admin who approves both
   * grants two packs for one payment.
   */
  const waiting = db.payments.find(
    (p) => p.sellerId === sellerId && p.status === 'PENDING',
  )
  if (waiting) {
    res.status(409).json({
      error: 'A payment is already waiting to be checked',
      messageMr: 'तुमचा भरणा आधीच तपासणीसाठी पाठवला आहे.',
    })
    return
  }

  /**
   * And only for something she actually needs.
   *
   * A PACK when her slots are full - taking ₹50 for five slots while she still
   * has empty ones is selling her something she already has. A RENEWAL from
   * the reminder onwards. An expired shop may only renew.
   *
   * `kind` is absent from app builds older than renewals. Such a build is only
   * ever paying because it was asked to, so an open renewal is what it means.
   */
  const products = db.products.filter(
    (p) => p.sellerId === sellerId,
  )
  const slots = slotInfo(seller, products)
  const kinds = payableKinds(seller, slots.left)
  const kind: PaymentKind =
    req.body?.kind === 'RENEWAL' || req.body?.kind === 'PACK'
      ? req.body.kind
      : (kinds[0] ?? 'PACK')
  const kindFault = paymentKindProblem(kind, seller, slots.left)
  if (kindFault) {
    res.status(409).json({ error: `Nothing to pay for as ${kind}`, messageMr: kindFault })
    return
  }

  const utr = normalizeUtr(req.body?.utr)
  const utrFault = utrProblem(utr)
  if (utrFault) {
    res.status(400).json({ error: 'Invalid UTR', messageMr: utrFault, fields: { utr: utrFault } })
    return
  }

  /**
   * Twelve digits alone prove nothing - anybody can type them. The screenshot
   * and the time she paid are what an admin holds the UTR against, so a
   * submission without them never reaches the queue.
   */
  const shotFault = screenshotProblem(req.body?.screenshotUrl, cloudinary)
  if (shotFault) {
    res.status(400).json({
      error: 'Payment screenshot required',
      messageMr: shotFault,
      fields: { screenshot: shotFault },
    })
    return
  }
  const paidAtFault = paidAtProblem(req.body?.paidAt)
  if (paidAtFault) {
    res.status(400).json({ error: 'Invalid payment time', messageMr: paidAtFault, fields: { paidAt: paidAtFault } })
    return
  }

  // Reusing one reference number across accounts is the obvious attack on
  // manual verification, so flag it here rather than hoping admin spots it.
  const duplicateUtr = db.payments.some((p) => p.utr === utr && p.sellerId !== sellerId)

  const payment: SubscriptionPayment = {
    id: newId('sp'),
    kind,
    sellerId,
    sellerName: seller.name,
    womenBizId: seller.womenBizId,
    phone: seller.phone,
    amount: PLAN.price,
    utr,
    payerUpi: String(req.body?.payerUpi ?? seller.upiId),
    screenshotUrl: req.body?.screenshotUrl || undefined,
    paidAt: new Date(req.body.paidAt).toISOString(),
    submittedAt: new Date().toISOString(),
    status: 'PENDING',
    duplicateUtr,
  }

  db.payments.unshift(payment)
  // Only a seller who is not selling yet is "waiting for approval". An ACTIVE
  // seller buying another pack, or renewing, keeps her status: flipping it hid
  // her whole shop from the catalogue for as long as the payment sat in the
  // queue - which is exactly backwards for a renewal paid before the date.
  if (seller.status !== 'ACTIVE' && seller.status !== 'BLOCKED') seller.status = 'PAYMENT_SUBMITTED'
  save()
  res.status(201).json({ payment, status: seller.status })
})
