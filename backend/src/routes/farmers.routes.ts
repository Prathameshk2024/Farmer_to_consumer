import { Router } from 'express'
import type { DigitalProfile, Farmer } from '@shared/types.js'
import {
  defaultAbout, fssaiProblem, isValidPhone, isValidPincode, normalizeFssai,
  normalizePhone, validateFarmerProfile, canSellNow,
} from '@shared/farmer.js'
import { upiProblem } from '@shared/payment.js'
import { passwordProblemMr } from '@shared/password.js'
import { closeReasonProblem, confirmProblem } from '@shared/accountClose.js'
import { openOrdersForFarmer, requestFarmerClose, restoreFarmer } from '../db/accountClose.js'
import { makeShopSlug, makeFarmerCode, villageCode } from '@shared/farmerCode.js'
import { computeReadiness, readinessBand, recomputeForFarmer } from '@shared/readiness.js'
import { getDb, newId, save } from '../db/store.js'
import { buyersForFarmer } from '../db/customers.js'
import { farmerProductReviews, farmerRating } from '../db/reviews.js'
import { publicFarmer } from '../db/publicFarmer.js'
import { callerIp, requireRole } from '../middleware/auth.js'
import { signToken } from '../auth/tokens.js'
import { createSession, describeClient } from '../auth/sessions.js'
import { farmerPhoneTaken, setCredential } from '../auth/credentials.js'
import { recordAuthEvent } from '../auth/events.js'
import { hashIp, maskPhone } from '../auth/crypto.js'
import { hit, LIMITS } from '../auth/rateLimit.js'

export const farmersRouter: Router = Router()

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

interface RegisterBody {
  phone: string
  /** Checked by passwordProblemMr; stored only as a hash, in `credentials`. */
  password: string
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
  businessType: Farmer['businessType']
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
  dispatch?: Farmer['dispatch']
}

/**
 * Create the farmer record. He is PENDING_VERIFICATION at this point, not
 * ACTIVE - an admin checks him once (POST /admin/farmers/:id/verify) before
 * buyers see anything he lists.
 *
 * Everything is validated here even though the client validates too. The client
 * validation exists to give her a fast message in Marathi; this exists because
 * the client can be bypassed.
 */
farmersRouter.post('/register', (req, res) => {
  const b = req.body as RegisterBody
  const fields: Record<string, string> = {}
  const ip = hashIp(callerIp(req))

  // Registration writes a record and issues a session, so it is worth money
  // and worth rate limiting and nothing else stands between a script and a pile of accounts.
  const burst = hit(`register:ip:${ip}`, LIMITS.registerPerIp)
  if (!burst.ok) {
    res.setHeader('Retry-After', String(burst.retryAfterSec))
    res.status(429).json({
      error: 'Too many registrations',
      messageMr: 'खूप वेळा प्रयत्न झाले. थोड्या वेळाने पुन्हा प्रयत्न करा.',
    })
    return
  }

  // No SMS proves the number is his. The admin's one-time verification is
  // that check (see "Verification, once" in CLAUDE.md), and a farmer stays
  // PENDING_VERIFICATION, invisible to buyers, until it happens.
  const phone = normalizePhone(String(b.phone ?? ''))
  const password = String(b.password ?? '')

  if (!isValidPhone(phone)) fields.phone = '10 अंकी मोबाईल नंबर टाका'
  const pwFault = passwordProblemMr(password)
  if (pwFault) fields.password = pwFault
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
  if (farmerPhoneTaken(db, phone)) {
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

  const farmerCode = makeFarmerCode(b.village, db.farmers.map((s) => s.farmerCode))
  const id = newId('s')

  const farmer: Farmer = {
    id,
    farmerCode,
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
    shopSlug: makeShopSlug(b.shopName, farmerCode),
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
    status: 'PENDING_VERIFICATION',
    rating: 0,
    ratingCount: 0,
    qrScans: 0,
    qrOrders: 0,
    createdAt: new Date().toISOString(),
  }

  db.farmers.push(farmer)
  setCredential(db, { role: 'farmer', userId: farmer.id, phone, password })
  save()

  // She is signed in from here, on a session that can later be revoked like
  // any other - registration is not a special kind of login.
  const session = createSession(db, {
    role: 'farmer',
    userId: id,
    phone: farmer.phone,
    farmerId: id,
    client: describeClient(req.headers['user-agent']),
  })
  recordAuthEvent(db, {
    type: 'register.farmer',
    subject: maskPhone(farmer.phone),
    role: 'farmer',
    ip,
    sessionId: session.id,
  })
  save()

  res.status(201).json({
    farmer,
    session: {
      token: signToken({ sid: session.id, role: 'farmer' }),
      role: 'farmer',
      userId: id,
      phone: farmer.phone,
      name: farmer.name,
      farmerId: id,
    },
  })
})

/* ------------------------------------------------------------------ */
/* Me                                                                  */
/* ------------------------------------------------------------------ */

farmersRouter.get('/me', requireRole('farmer'), (req, res) => {
  const db = getDb()
  const farmer = db.farmers.find((s) => s.id === req.auth!.farmerId)
  if (!farmer) {
    res.status(404).json({ error: 'Farmer not found' })
    return
  }
  res.json({ farmer })
})

/**
 * Her buyers, derived from her own orders.
 *
 * Nothing here is new to her: an order detail screen already shows the name,
 * address and phone of whoever placed it. This gathers them so she can see who
 * comes back, which is the thing a shopkeeper knows by memory and an app owner
 * otherwise never learns.
 */
farmersRouter.get('/me/buyers', requireRole('farmer'), (req, res) => {
  res.json({ buyers: buyersForFarmer(getDb(), req.auth!.farmerId!) })
})

/**
 * What her buyers said about her products, each review naming the product -
 * exactly the words the public reads on those products, and nothing hidden -
 * with the rating buyers see on her card, worked out the same way.
 */
farmersRouter.get('/me/reviews', requireRole('farmer'), (req, res) => {
  const db = getDb()
  const farmerId = req.auth!.farmerId!
  res.json({ reviews: farmerProductReviews(db, farmerId), summary: farmerRating(db, farmerId) })
})

farmersRouter.patch('/me', requireRole('farmer'), (req, res) => {
  const db = getDb()
  const i = db.farmers.findIndex((s) => s.id === req.auth!.farmerId)
  if (i < 0) {
    res.status(404).json({ error: 'Farmer not found' })
    return
  }

  // Allow-list. Never spread req.body into a stored record - that is how a
  // farmer sets her own status to ACTIVE.
  const allowed = [
    'name', 'photo', 'whatsapp', 'about', 'shopName', 'isOpen', 'deliveryFee',
    'freeDeliveryAbove', 'minOrder', 'dispatch', 'pincodes', 'monthlyCapacity',
    'age', 'education', 'yearsInBusiness', 'shgName', 'digital',
    'upiQrUrl', 'upiQrReady',
  ] as const

  const current = db.farmers[i]!
  const patch: Partial<Farmer> = {}
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
  const fields = validateFarmerProfile(patch)
  if (Object.keys(fields).length) {
    res.status(400).json({ error: 'Validation failed', messageMr: 'माहिती तपासा', fields })
    return
  }

  const next = { ...current, ...patch }

  // Keep the readiness index in step with what she actually has now.
  const products = db.products.filter((p) => p.farmerId === next.id)
  const completed = db.orders.filter((o) => o.farmerId === next.id && o.status === 'DELIVERED')
  const { score, band } = recomputeForFarmer(next, {
    productCount: products.length,
    productsWithDetail: products.filter((p) => p.ingredients || p.material).length,
    completedOrders: completed.length,
  })
  next.readinessScore = score
  next.readinessBand = band

  db.farmers[i] = next
  save()
  res.json({ farmer: next })
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
 * whose farmer has vanished, so the answer names the orders and she finishes
 * or cancels them with the buttons she already has.
 *
 * What this does NOT do is erase her. That is a week away - see
 * `db/accountClose.ts` - and every screen tells her so.
 */
farmersRouter.post('/me/close', requireRole('farmer'), (req, res) => {
  const db = getDb()
  const farmer = db.farmers.find((s) => s.id === req.auth!.farmerId)
  if (!farmer) {
    res.status(404).json({ error: 'Farmer not found' })
    return
  }

  const reason = String(req.body?.reason ?? '')
  const note = req.body?.note === undefined ? undefined : String(req.body.note).trim()

  const reasonProblem = closeReasonProblem(reason, note)
  if (reasonProblem) {
    res.status(400).json({ error: 'Reason required', messageMr: reasonProblem, fields: { reason: reasonProblem } })
    return
  }

  const digitsProblem = confirmProblem(farmer.phone, req.body?.confirm)
  if (digitsProblem) {
    res.status(400).json({ error: 'Confirmation failed', messageMr: digitsProblem, fields: { confirm: digitsProblem } })
    return
  }

  const open = openOrdersForFarmer(db, farmer.id)
  if (open.length > 0) {
    res.status(409).json({
      error: 'Open orders',
      messageMr: 'सुरू असलेली ऑर्डर आधी पूर्ण करा किंवा रद्द करा. त्यानंतर खाते बंद करता येईल.',
      openOrders: open.map((o) => ({ id: o.id, status: o.status })),
    })
    return
  }

  requestFarmerClose(db, farmer, { reason, note })
  recordAuthEvent(db, {
    type: 'session.end', subject: maskPhone(farmer.phone), role: 'farmer',
    ip: callerIp(req), detail: 'account.close',
  })
  save()
  res.json({ ok: true, closingAt: farmer.closingAt })
})

/**
 * She changed her mind inside the week.
 *
 * Reached by signing in again, which is the whole point: the person who can
 * stop it is the person who still knows the password.
 */
farmersRouter.post('/me/restore', requireRole('farmer'), (req, res) => {
  const db = getDb()
  const farmer = db.farmers.find((s) => s.id === req.auth!.farmerId)
  if (!farmer) {
    res.status(404).json({ error: 'Farmer not found' })
    return
  }
  if (farmer.status !== 'CLOSED' || !farmer.closingAt) {
    // Already erased, or never closing. Either way there is nothing to undo,
    // and saying so beats pretending an empty record came back.
    res.status(409).json({
      error: 'Not closing',
      messageMr: 'हे खाते बंद होत नाही आहे.',
    })
    return
  }

  restoreFarmer(farmer)
  save()
  res.json({ farmer })
})

/* ------------------------------------------------------------------ */
/* Public farmer record (the "sold by" card on a product)              */
/* ------------------------------------------------------------------ */

farmersRouter.get('/:id', (req, res) => {
  const farmer = getDb().farmers.find((s) => s.id === req.params.id)
  // Same rule as /slug/:slug. A farmer who has not been approved, or who has
  // been blocked, is not public - customers only ever see verified shops.
  if (!farmer || !canSellNow(farmer)) {
    res.status(404).json({ error: 'Farmer not found', messageMr: 'हा शेतकरी सापडला नाही' })
    return
  }
  // The same allow-listed card the catalogue sends. This used to strip seven
  // named fields and pass everything else, including her admin notices.
  res.json({ farmer: publicFarmer(farmer, farmerRating(getDb(), farmer.id)) })
})
