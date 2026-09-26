import { Router } from 'express'
import type { Fulfilment, Order, OrderStatus, PaymentMode, FarmerGroup } from '@shared/types.js'
import {
  actionFor, awaitingCustomerPayment, awaitingPaymentConfirmation, canTransition,
  cleanDeliveryEstimate, initialPaymentStatus,
} from '@shared/orderFlow.js'
import { isMaharashtraPincode } from '@shared/farmer.js'
import { normalizeUtr, utrProblem } from '@shared/payment.js'
import { getDb, save } from '../db/store.js'
import type { Db } from '../db/seed.js'
import { recordOrderCustomer } from '../db/customers.js'
import { cancelOrder } from '../db/orderCancel.js'
import { ordersToRate, writeRatings } from '../db/reviews.js'
import { toPublicReview } from '@shared/review.js'
import { canSellNow } from '@shared/farmer.js'
import { orderQtyProblem } from '@shared/produce.js'
import { newShortId } from '../db/ids.js'
import { requireRole } from '../middleware/auth.js'

export const ordersRouter: Router = Router()

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

ordersRouter.get('/mine', requireRole('farmer', 'customer'), (req, res) => {
  const db = getDb()
  const auth = req.auth!
  const list =
    auth.role === 'farmer'
      ? db.orders.filter((o) => o.farmerId === auth.farmerId)
      : db.orders.filter((o) => o.customerId === auth.customerId)

  res.json({
    orders: [...list].sort((a, b) => b.placedAt.localeCompare(a.placedAt)),
    // The buyer's delivered orders still waiting for a rating. The app will not let
    // them go on until this is empty - see RateOrderGate.
    toRate: auth.role === 'customer' ? ordersToRate(db, list) : undefined,
  })
})

ordersRouter.get('/:id', requireRole('farmer', 'customer'), (req, res) => {
  const db = getDb()
  const auth = req.auth!
  const order = db.orders.find((o) => o.id === req.params.id)
  if (!order) {
    res.status(404).json({ error: 'Order not found' })
    return
  }
  // An order is only visible to the two parties on it.
  const mine =
    (auth.role === 'farmer' && order.farmerId === auth.farmerId) ||
    (auth.role === 'customer' && order.customerId === auth.customerId)
  if (!mine) {
    res.status(403).json({ error: 'Not your order' })
    return
  }

  /**
   * THE FARMER'S NUMBER, TO THE PERSON WHO ORDERED FROM THEM - AND NOBODY ELSE.
   *
   * It is not on any public farmer endpoint (`publicFarmer` in
   * db/publicFarmer.ts is an allow-list without it), so browsing the
   * catalogue never exposes it. It IS on the order, from the
   * moment the order exists: a buyer who has paid by UPI and is waiting for
   * produce needs to be able to ring the farmer sending it, and this route already
   * refuses anyone who is not one of the two parties, three lines up.
   *
   * It used to be withheld until the farmer ACCEPTED, which is exactly backwards -
   * the gap between placing and accepting is the window in which a buyer most
   * needs to reach them.
   */
  const farmer = db.farmers.find((s) => s.id === order.farmerId)

  // One review per product on this order. The buyer sees their own whatever
  // became of them, so a hidden one can say so. The farmer sees only those
  // still up: a review an admin took down is not theirs to keep reading.
  const reviews = db.reviews
    .filter((r) => r.orderId === order.id && (auth.role === 'customer' || !r.hidden))
    .map((r) => (auth.role === 'customer' ? r : toPublicReview(r)))

  res.json({
    order,
    reviews,
    farmer: farmer && {
      id: farmer.id,
      farmerCode: farmer.farmerCode,
      name: farmer.name,
      photo: farmer.photo,
      shopName: farmer.shopName,
      shopSlug: farmer.shopSlug,
      upiId: farmer.upiId,
      phone: farmer.phone,
    },
  })
})

/* ------------------------------------------------------------------ */
/* Checkout - one order per farmer                                     */
/* ------------------------------------------------------------------ */

interface PlaceBody {
  /** Not needed for pickup: the farmer's pickup place is the address. */
  address?: { line: string; landmark?: string; pincode: string }
  groups: FarmerGroup[]
  paymentMode: PaymentMode
  /** Absent means delivery. */
  fulfilment?: Fulfilment
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
  if (b.fulfilment !== 'pickup' && !b.address?.pincode) {
    res.status(400).json({ error: 'Address required', messageMr: 'पत्ता निवडा' })
    return
  }

  // Rating what arrived comes first. The buyer's app will not let them past the rating
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

  // Build every order first, commit only when all of them pass. A refusal in
  // the second farmer's group must not leave the first farmer's order in
  // memory, where the next save() would persist it.
  const built = buildOrders(db, b, { customerId: auth.customerId!, phone: auth.phone ?? '' })
  if (!built.ok) {
    res.status(built.status).json(built.body)
    return
  }
  const { orders: created, groupId } = built

  for (const order of created) {
    db.orders.unshift(order)
    const farmer = db.farmers.find((s) => s.id === order.farmerId)
    if (farmer && order.sourceShareCode === farmer.shopSlug) farmer.qrOrders += 1
  }

  // Remember who the buyer is and where they asked for it. A cart split across three
  // farmers is three orders but one customer, so this runs once on the first.
  if (created[0]) recordOrderCustomer(db, created[0])

  save()
  res.status(201).json({ orders: created, groupId })
})

type BuildResult =
  | { ok: true; orders: Order[]; groupId: string }
  | { ok: false; status: number; body: { error: string; messageMr: string; productId?: string } }

/**
 * Every check a checkout can fail, judged over ALL the groups, and the orders
 * it would create - without writing anything. Nothing in `db` is changed
 * here: the caller pushes the orders only when this says ok, so a refusal is
 * a refusal of the whole cart and never half of it.
 *
 * Serviceability and price are both re-derived from the database. Trusting
 * the client's totals is how a cart becomes a discount coupon.
 */
export function buildOrders(
  db: Db,
  b: Pick<PlaceBody, 'address' | 'groups' | 'paymentMode' | 'customerName' | 'sourceShareCode' | 'fulfilment'>,
  who: { customerId: string; phone: string },
): BuildResult {
  const groupId = `G${Date.now().toString(36).toUpperCase()}`
  const created: Order[] = []
  const refuse = (status: number, error: string, messageMr: string, productId?: string): BuildResult =>
    ({ ok: false, status, body: { error, messageMr, ...(productId ? { productId } : {}) } })

  const fulfilment: Fulfilment = b.fulfilment ?? 'delivery'
  if (fulfilment !== 'delivery' && fulfilment !== 'pickup') {
    return refuse(400, 'Unknown fulfilment', 'घरपोच किंवा शेतावरून नेणे निवडा')
  }
  const pickup = fulfilment === 'pickup'
  if (!pickup && !b.address?.pincode) return refuse(400, 'Address required', 'पत्ता निवडा')

  for (const g of b.groups) {
    const farmer = db.farmers.find((s) => s.id === g.farmerId)
    // A blocked, closed or unverified shop takes no new orders. Orders it
    // already has carry on: the farmer can still deliver them, or cancel and refund.
    if (!farmer || !canSellNow(farmer) || !farmer.isOpen) {
      return refuse(409, 'Farmer unavailable', 'हा शेतकरी सध्या ऑर्डर घेत नाही')
    }
    // Only what the farmer offers. A row from before offersDelivery existed delivered.
    const offered = pickup ? !!farmer.pickup?.place : (farmer.offersDelivery ?? true)
    if (!offered) return refuse(400, 'Fulfilment not offered', 'हा शेतकरी ही सोय देत नाही')
    /**
     * The farmer's listed areas are a hint now, not a gate.
     *
     * Anywhere in Maharashtra the order goes to the farmer and they decide -
     * the list was one pincode written at registration, and refusing 413002
     * because they typed 413004 threw away orders they would have taken.
     * Outside Maharashtra is still refused here, before them sees it.
     */
    // Pickup has no road trip, so none of the delivery-area rules apply.
    if (!pickup && !isMaharashtraPincode(b.address!.pincode)) {
      return refuse(409, 'Outside Maharashtra', 'सध्या महाराष्ट्रातच पोहोचवले जाते')
    }
    const outsideArea = !pickup && !farmer.pincodes.includes(b.address!.pincode)

    const items: Order['items'] = []
    for (const i of g.items ?? []) {
      const product = db.products.find((p) => p.id === i.productId)
      if (!product || product.status !== 'LIVE' || product.farmerId !== farmer.id) {
        return refuse(409, 'Product unavailable', 'हे उत्पादन आता उपलब्ध नाही', i.productId)
      }
      // Whole units, at least the farmer's minimum, no more than they have. Stock is
      // NOT decremented by an order - the farmer keeps it current themselves.
      const problem = orderQtyProblem(product, i.qty)
      if (problem) return refuse(409, 'Invalid quantity', problem, product.id)
      items.push({
        productId: product.id,
        name: product.name,
        emoji: product.emoji,
        qty: Number(i.qty),
        price: product.price, // server price, not the client's
      })
    }
    if (!items.length) return refuse(400, 'Empty cart', 'टोपली रिकामी आहे')

    const itemsTotal = items.reduce((n, i) => n + i.price * i.qty, 0)
    if (farmer.minOrder > 0 && itemsTotal < farmer.minOrder) {
      return refuse(409, 'Below minimum', `${farmer.shopName} किमान ऑर्डर ₹${farmer.minOrder}`)
    }

    const deliveryFee =
      pickup || (farmer.freeDeliveryAbove > 0 && itemsTotal >= farmer.freeDeliveryAbove)
        ? 0
        : farmer.deliveryFee

    const now = new Date().toISOString()
    created.push({
      // Unique against the stored orders AND the ones built so far in this cart.
      id: newShortId('F2C', (id) => db.orders.some((o) => o.id === id) || created.some((o) => o.id === id)),
      groupId,
      farmerId: farmer.id,
      customerId: who.customerId,
      customerName: b.customerName ?? 'ग्राहक',
      customerPhone: who.phone,
      // On pickup the "address" is where the buyer collects it; the pincode
      // is the farmer's own, the area the goods are in.
      address: pickup ? farmer.pickup!.place : b.address!.line,
      landmark: pickup ? undefined : b.address!.landmark,
      pincode: pickup ? farmer.pincode : b.address!.pincode,
      items,
      itemsTotal,
      deliveryFee,
      total: itemsTotal + deliveryFee,
      paymentMode: b.paymentMode,
      paymentStatus: initialPaymentStatus(b.paymentMode),
      ...(pickup ? { fulfilment } : {}),
      status: 'PLACED',
      placedAt: now,
      outsideArea: outsideArea || undefined,
      events: [{ to: 'PLACED', at: now, by: 'customer' }],
      sourceShareCode: b.sourceShareCode,
    })
  }
  return { ok: true, orders: created, groupId }
}

/* ------------------------------------------------------------------ */
/* Moving along the state machine                                      */
/* ------------------------------------------------------------------ */

ordersRouter.post('/:id/advance', requireRole('farmer'), (req, res) => {
  const db = getDb()
  const order = db.orders.find(
    (o) => o.id === req.params.id && o.farmerId === req.auth!.farmerId,
  )
  if (!order) {
    res.status(404).json({ error: 'Order not found' })
    return
  }

  const to = req.body?.to as OrderStatus
  if (!canTransition(order.status, to, order.fulfilment)) {
    res.status(409).json({
      error: `Cannot go ${order.status} -> ${to}`,
      messageMr: 'हा बदल करता येणार नाही',
    })
    return
  }

  const action = actionFor(order.status, to, order.fulfilment)

  if (action?.needsReason && !req.body?.reason) {
    res.status(400).json({ error: 'Reason required', messageMr: 'कारण निवडा' })
    return
  }

  /**
   * The gate that makes "pay after acceptance" safe.
   *
   * The farmer accepts an order they have not been paid for - that is the
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
    by: 'farmer',
    note: req.body?.reason,
  })

  /**
   * What the farmer told the buyer it would take, kept only on acceptance.
   *
   * Accepting is the one moment the farmer knows: they have just read the address and
   * the quantity. Skipping the question is allowed - the buyer then sees no
   * promise rather than an invented one - so an empty answer clears nothing
   * and stores nothing.
   */
  if (to === 'ACCEPTED') {
    const estimate = cleanDeliveryEstimate(req.body?.deliveryEstimate)
    if (estimate) order.deliveryEstimate = estimate
  }

  // Cash is collected at the doorstep, so delivery and collection are the same
  // moment. UPI is confirmed separately, by the farmer, before they pack.
  if (to === 'DELIVERED' && order.paymentMode === 'COD') {
    order.paymentStatus = 'COD_COLLECTED'
  }

  save()
  res.json({ order })
})

/**
 * Either party calling the order off - the buyer before acceptance, the
 * farmer after it. One route, because it is one state and one event; which
 * side is asking comes from the session, never from the body.
 */
ordersRouter.post('/:id/cancel', requireRole('farmer', 'customer'), (req, res) => {
  const db = getDb()
  const auth = req.auth!
  const by = auth.role === 'farmer' ? 'farmer' : 'customer'
  const order = db.orders.find(
    (o) =>
      o.id === req.params.id &&
      (by === 'farmer' ? o.farmerId === auth.farmerId : o.customerId === auth.customerId),
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
  res.json({ order })
})

/**
 * The buyer paying, after the farmer has accepted.
 *
 * This is what used to happen at checkout. It is a claim, not a verified
 * payment - the farmer confirms it they below - but it is a claim made against
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
   * is either a slip - the buyer paid once and typed it twice - or somebody walking
   * one real payment across several orders.
   *
   * A farmer confirms payments by eye, against a statement that shows each
   * reference once, and duplicates are exactly what that check cannot catch:
   * the line is there, it just is not for this order. An order has no admin
   * in the loop, so here it is refused outright. The same UTR on THIS order is left alone -
   * that is a buyer correcting a digit, not a second claim.
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

ordersRouter.post('/:id/confirm-payment', requireRole('farmer'), (req, res) => {
  const db = getDb()
  const order = db.orders.find(
    (o) => o.id === req.params.id && o.farmerId === req.auth!.farmerId,
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
