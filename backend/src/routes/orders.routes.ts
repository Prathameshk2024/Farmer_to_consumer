import { Router } from 'express'
import type { Order, OrderStatus, PaymentMode, SellerGroup } from '@shared/types.js'
import {
  actionFor, awaitingCustomerPayment, awaitingPaymentConfirmation, canTransition,
  cleanDeliveryEstimate, initialPaymentStatus,
} from '@shared/orderFlow.js'
import { isMaharashtraPincode } from '@shared/seller.js'
import { normalizeUtr, utrProblem } from '@shared/payment.js'
import { getDb, save } from '../db/store.js'
import { recordOrderCustomer } from '../db/customers.js'
import { cancelOrder } from '../db/orderCancel.js'
import { ordersToRate, writeRatings } from '../db/reviews.js'
import { toPublicReview } from '@shared/review.js'
import { canSellNow } from '@shared/subscription.js'
import { newShortId } from '../db/ids.js'
import { requireRole } from '../middleware/auth.js'
import { notifyOrderAdvanced, notifyOrderCancelled, notifyOrderPlaced, notifyPaymentClaimed } from '../push/notify.js'

export const ordersRouter: Router = Router()

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

ordersRouter.get('/mine', requireRole('seller', 'customer'), (req, res) => {
  const db = getDb()
  const auth = req.auth!
  const list =
    auth.role === 'seller'
      ? db.orders.filter((o) => o.sellerId === auth.sellerId)
      : db.orders.filter((o) => o.customerId === auth.customerId)

  res.json({
    orders: [...list].sort((a, b) => b.placedAt.localeCompare(a.placedAt)),
    // Her delivered orders still waiting for a rating. Her app will not let
    // her go on until this is empty - see RateOrderGate.
    toRate: auth.role === 'customer' ? ordersToRate(db, list) : undefined,
  })
})

ordersRouter.get('/:id', requireRole('seller', 'customer'), (req, res) => {
  const db = getDb()
  const auth = req.auth!
  const order = db.orders.find((o) => o.id === req.params.id)
  if (!order) {
    res.status(404).json({ error: 'Order not found' })
    return
  }
  // An order is only visible to the two parties on it.
  const mine =
    (auth.role === 'seller' && order.sellerId === auth.sellerId) ||
    (auth.role === 'customer' && order.customerId === auth.customerId)
  if (!mine) {
    res.status(403).json({ error: 'Not your order' })
    return
  }

  /**
   * HER NUMBER, TO THE PERSON WHO ORDERED FROM HER - AND NOBODY ELSE.
   *
   * It is not on any public seller endpoint (`publicSeller` in
   * db/publicSeller.ts is an allow-list without it), so browsing the
   * catalogue never exposes it. It IS on the order, from the
   * moment the order exists: a buyer who has paid by UPI and is waiting for
   * food needs to be able to ring the woman making it, and this route already
   * refuses anyone who is not one of the two parties, three lines up.
   *
   * It used to be withheld until she ACCEPTED, which is exactly backwards -
   * the gap between placing and accepting is the window in which a buyer most
   * needs to reach her.
   */
  const seller = db.sellers.find((s) => s.id === order.sellerId)

  // One review per product on this order. The buyer sees their own whatever
  // became of them, so a hidden one can say so. The seller sees only those
  // still up: a review an admin took down is not hers to keep reading.
  const reviews = db.reviews
    .filter((r) => r.orderId === order.id && (auth.role === 'customer' || !r.hidden))
    .map((r) => (auth.role === 'customer' ? r : toPublicReview(r)))

  res.json({
    order,
    reviews,
    seller: seller && {
      id: seller.id,
      womenBizId: seller.womenBizId,
      name: seller.name,
      photo: seller.photo,
      shopName: seller.shopName,
      shopSlug: seller.shopSlug,
      upiId: seller.upiId,
      phone: seller.phone,
    },
  })
})

/* ------------------------------------------------------------------ */
/* Checkout - one order per seller                                     */
/* ------------------------------------------------------------------ */

interface PlaceBody {
  address: { line: string; landmark?: string; pincode: string }
  groups: SellerGroup[]
  paymentMode: PaymentMode
  customerName?: string
  sourceShareCode?: string
}

ordersRouter.post('/', requireRole('customer'), (req, res) => {
  const db = getDb()
  const auth = req.auth!
  const b = req.body as PlaceBody

  if (!b.groups?.length) {
    res.status(400).json({ error: 'Empty cart', messageMr: 'टोपली रिकामी आहे' })
    return
  }
  if (!b.address?.pincode) {
    res.status(400).json({ error: 'Address required', messageMr: 'पत्ता निवडा' })
    return
  }

  // Rating what arrived comes first. Her app will not let her past the rating
  // screen; this is the same rule where the app cannot be talked round.
  const unrated = ordersToRate(db, db.orders.filter((o) => o.customerId === auth.customerId))
  if (unrated.length) {
    res.status(409).json({
      error: 'Rate your delivered order first',
      messageMr: 'आधी मिळालेल्या वस्तूंना तारे द्या',
      toRate: unrated,
    })
    return
  }

  // Serviceability and price are both re-derived from the database. Trusting
  // the client's totals is how a cart becomes a discount coupon.
  const groupId = `G${Date.now().toString(36).toUpperCase()}`
  const created: Order[] = []

  for (const g of b.groups) {
    const seller = db.sellers.find((s) => s.id === g.sellerId)
    // A shop paused for an unpaid subscription takes no new orders. Orders it
    // already has carry on: she can still deliver them, or cancel and refund.
    if (!seller || !canSellNow(seller) || !seller.isOpen) {
      res.status(409).json({
        error: 'Seller unavailable',
        messageMr: 'ही विक्रेती सध्या ऑर्डर घेत नाही',
      })
      return
    }
    /**
     * The seller's listed areas are a hint now, not a gate.
     *
     * Anywhere in Maharashtra the order goes to the seller and they decide -
     * the list was one pincode written at registration, and refusing 413002
     * because they typed 413004 threw away orders they would have taken.
     * Outside Maharashtra is still refused here, before them sees it.
     */
    if (!isMaharashtraPincode(b.address.pincode)) {
      res.status(409).json({
        error: 'Outside Maharashtra',
        messageMr: 'सध्या महाराष्ट्रातच पोहोचवले जाते',
      })
      return
    }
    const outsideArea = !seller.pincodes.includes(b.address.pincode)

    const items = g.items.map((i) => {
      const product = db.products.find((p) => p.id === i.productId)
      if (!product || product.status !== 'LIVE') {
        throw Object.assign(new Error('Product unavailable'), { status: 409 })
      }
      return {
        productId: product.id,
        name: product.name,
        emoji: product.emoji,
        qty: Math.max(1, Number(i.qty)),
        price: product.price, // server price, not the client's
      }
    })

    const itemsTotal = items.reduce((n, i) => n + i.price * i.qty, 0)
    if (seller.minOrder > 0 && itemsTotal < seller.minOrder) {
      res.status(409).json({
        error: 'Below minimum',
        messageMr: `${seller.shopName} किमान ऑर्डर ₹${seller.minOrder}`,
      })
      return
    }

    const deliveryFee =
      seller.freeDeliveryAbove > 0 && itemsTotal >= seller.freeDeliveryAbove
        ? 0
        : seller.deliveryFee

    const now = new Date().toISOString()
    const order: Order = {
      id: newShortId('SMB', (id) => db.orders.some((o) => o.id === id)),
      groupId,
      sellerId: seller.id,
      customerId: auth.customerId!,
      customerName: b.customerName ?? 'ग्राहक',
      customerPhone: auth.phone ?? '',
      address: b.address.line,
      landmark: b.address.landmark,
      pincode: b.address.pincode,
      items,
      itemsTotal,
      deliveryFee,
      total: itemsTotal + deliveryFee,
      paymentMode: b.paymentMode,
      paymentStatus: initialPaymentStatus(b.paymentMode),
      status: 'PLACED',
      placedAt: now,
      outsideArea: outsideArea || undefined,
      events: [{ to: 'PLACED', at: now, by: 'customer' }],
      sourceShareCode: b.sourceShareCode,
    }

    db.orders.unshift(order)
    created.push(order)
    if (order.sourceShareCode === seller.shopSlug) seller.qrOrders += 1
  }

  // Remember who she is and where she asked for it. A cart split across three
  // sellers is three orders but one customer, so this runs once on the first.
  if (created[0]) recordOrderCustomer(db, created[0])

  save()
  // The seller hears about each order she now has. Never awaited: the buyer's
  // reply must not wait on Firebase.
  for (const o of created) void notifyOrderPlaced(db, o)
  res.status(201).json({ orders: created, groupId })
})

/* ------------------------------------------------------------------ */
/* Moving along the state machine                                      */
/* ------------------------------------------------------------------ */

ordersRouter.post('/:id/advance', requireRole('seller'), (req, res) => {
  const db = getDb()
  const order = db.orders.find(
    (o) => o.id === req.params.id && o.sellerId === req.auth!.sellerId,
  )
  if (!order) {
    res.status(404).json({ error: 'Order not found' })
    return
  }

  const to = req.body?.to as OrderStatus
  if (!canTransition(order.status, to)) {
    res.status(409).json({
      error: `Cannot go ${order.status} -> ${to}`,
      messageMr: 'हा बदल करता येणार नाही',
    })
    return
  }

  const action = actionFor(order.status, to)

  if (action?.needsReason && !req.body?.reason) {
    res.status(400).json({ error: 'Reason required', messageMr: 'कारण निवडा' })
    return
  }

  /**
   * The gate that makes "pay after acceptance" safe.
   *
   * The seller accepts an order they have not been paid for - that is the
   * whole point, because the buyer pays once they have said yes. Packing is
   * where it stops: nothing leaves their kitchen until they have seen the
   * money in their own UPI app and pressed "payment received".
   */
  if (to === 'PACKED' && awaitingPaymentConfirmation(order)) {
    res.status(409).json({
      error: 'Payment not confirmed yet',
      messageMr: 'पैसे आल्याची खात्री केल्यावरच पुढे जा',
    })
    return
  }

  order.status = to
  order.events.push({
    to,
    at: new Date().toISOString(),
    by: 'seller',
    note: req.body?.reason,
  })

  /**
   * What she told the buyer it would take, kept only on acceptance.
   *
   * Accepting is the one moment she knows: she has just read the address and
   * the quantity. Skipping the question is allowed - the buyer then sees no
   * promise rather than an invented one - so an empty answer clears nothing
   * and stores nothing.
   */
  if (to === 'ACCEPTED') {
    const estimate = cleanDeliveryEstimate(req.body?.deliveryEstimate)
    if (estimate) order.deliveryEstimate = estimate
  }

  // Cash is collected at the doorstep, so delivery and collection are the same
  // moment. UPI is confirmed separately, by her, before she packs.
  if (to === 'DELIVERED' && order.paymentMode === 'COD') {
    order.paymentStatus = 'COD_COLLECTED'
  }

  save()
  void notifyOrderAdvanced(db, order, to)
  res.json({ order })
})

/**
 * Either party calling the order off - the buyer before acceptance, the
 * seller after it. One route, because it is one state and one event; which
 * side is asking comes from the session, never from the body.
 */
ordersRouter.post('/:id/cancel', requireRole('seller', 'customer'), (req, res) => {
  const db = getDb()
  const auth = req.auth!
  const by = auth.role === 'seller' ? 'seller' : 'customer'
  const order = db.orders.find(
    (o) =>
      o.id === req.params.id &&
      (by === 'seller' ? o.sellerId === auth.sellerId : o.customerId === auth.customerId),
  )
  if (!order) {
    res.status(404).json({ error: 'Order not found', messageMr: 'हे ऑर्डर सापडले नाही' })
    return
  }

  const result = cancelOrder(order, by, req.body ?? {})
  if (!result.ok) {
    res.status(result.status).json({ error: result.error, messageMr: result.messageMr })
    return
  }

  save()
  void notifyOrderCancelled(db, order, by)
  res.json({ order })
})

/**
 * The buyer paying, after the seller has accepted.
 *
 * This is what used to happen at checkout. It is a claim, not a verified
 * payment - the seller confirms it they below - but it is a claim made against
 * a real order they have agreed to deliver, with the order id in the UPI note,
 * so they can match it to a line in their bank statement.
 */
ordersRouter.post('/:id/pay', requireRole('customer'), (req, res) => {
  const db = getDb()
  const order = db.orders.find(
    (o) => o.id === req.params.id && o.customerId === req.auth!.customerId,
  )
  if (!order) {
    res.status(404).json({ error: 'Order not found', messageMr: 'हे ऑर्डर सापडले नाही' })
    return
  }

  if (!awaitingCustomerPayment(order)) {
    res.status(409).json({
      error: `Not awaiting payment (${order.status} / ${order.paymentStatus})`,
      messageMr: 'या ऑर्डरसाठी आत्ता पैसे भरायचे नाहीत',
    })
    return
  }

  const utr = normalizeUtr(req.body?.utr)
  const problem = utrProblem(utr)
  if (problem) {
    res.status(400).json({ error: 'Invalid UTR', messageMr: problem, fields: { utr: problem } })
    return
  }

  /**
   * One transaction has one RRN, so the same twelve digits on a second order
   * is either a slip - she paid once and typed it twice - or somebody walking
   * one real payment across several orders.
   *
   * A seller confirms payments by eye, against a statement that shows each
   * reference once, and duplicates are exactly what that check cannot catch:
   * the line is there, it just is not for this order. Subscription payments
   * already flag this for the admin; an order has no admin in the loop, so
   * here it is refused outright. The same UTR on THIS order is left alone -
   * that is a woman correcting a digit, not a second claim.
   */
  const usedElsewhere = db.orders.some((o) => o.id !== order.id && o.paymentUtr === utr)
  if (usedElsewhere) {
    res.status(409).json({
      error: 'UTR already used on another order',
      messageMr: 'हा क्रमांक दुसऱ्या ऑर्डरसाठी वापरला आहे. तुमच्या UPI ॲपमधला याच ऑर्डरचा क्रमांक टाका',
      fields: { utr: 'हा क्रमांक दुसऱ्या ऑर्डरसाठी वापरला आहे' },
    })
    return
  }

  order.paymentUtr = utr
  order.paymentStatus = 'UPI_SUBMITTED'
  save()
  void notifyPaymentClaimed(db, order)
  res.json({ order })
})

/**
 * The buyer rating every product on a delivered order - given, or given again.
 * Body: `{ ratings: [{ productId, rating, comment? }] }`, one per product.
 * The rules are in `db/reviews.ts` and `shared/review.ts`.
 */
ordersRouter.post('/:id/review', requireRole('customer'), (req, res) => {
  const db = getDb()
  const order = db.orders.find(
    (o) => o.id === req.params.id && o.customerId === req.auth!.customerId,
  )
  if (!order) {
    res.status(404).json({ error: 'Order not found', messageMr: 'हे ऑर्डर सापडले नाही' })
    return
  }

  const result = writeRatings(db, order, req.body?.ratings)
  if (!result.ok) {
    res.status(result.status).json({ error: result.error, messageMr: result.messageMr })
    return
  }

  save()
  res.json({ reviews: result.reviews })
})

ordersRouter.post('/:id/confirm-payment', requireRole('seller'), (req, res) => {
  const db = getDb()
  const order = db.orders.find(
    (o) => o.id === req.params.id && o.sellerId === req.auth!.sellerId,
  )
  if (!order) {
    res.status(404).json({ error: 'Order not found' })
    return
  }
  if (order.paymentMode !== 'UPI') {
    res.status(409).json({ error: 'Not a UPI order' })
    return
  }
  order.paymentStatus = 'UPI_CONFIRMED'
  save()
  res.json({ order })
})
