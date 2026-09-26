import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actionsFor,
  awaitingPaymentConfirmation,
  buyerStageIndex,
  buyerStages,
  canTransition,
  statusLabelKey,
} from '@shared/orderFlow.js'
import { canCancel } from '@shared/orderCancel.js'
import { validateFarmerProfile } from '@shared/farmer.js'
import { seed } from '../src/db/seed.js'
import { buildOrders } from '../src/routes/orders.routes.js'
import { recordOrderCustomer } from '../src/db/customers.js'

/**
 * A pickup order has no road trip, so "out for delivery" would be a step
 * nobody can take. Packed means "ready at the farm", and the next step is
 * the buyer collecting it.
 */

test('delivery keeps its five steps', () => {
  assert.equal(canTransition('PACKED', 'OUT_FOR_DELIVERY'), true)
  assert.equal(canTransition('PACKED', 'DELIVERED'), false)
})

test('pickup goes from ready straight to collected', () => {
  assert.equal(canTransition('PACKED', 'DELIVERED', 'pickup'), true)
  assert.equal(canTransition('PACKED', 'OUT_FOR_DELIVERY', 'pickup'), false)
  assert.deepEqual(actionsFor('PACKED', 'pickup').map((a) => a.to), ['DELIVERED'])
  assert.equal(statusLabelKey('PACKED', 'pickup'), 'ord.status.PACKED_PICKUP')
  assert.equal(statusLabelKey('PACKED'), 'ord.status.PACKED')
})

test('the buyer sees three stages for pickup', () => {
  assert.deepEqual(buyerStages('pickup').map((s) => s.status), ['ACCEPTED', 'PACKED', 'DELIVERED'])
  const order = { status: 'PACKED' as const, fulfilment: 'pickup' as const,
    events: [{ to: 'ACCEPTED' as const, at: '', by: 'farmer' as const }, { to: 'PACKED' as const, at: '', by: 'farmer' as const }] }
  assert.equal(buyerStageIndex(order), 1)
})

// The real predicate is canCancel(by, status); the brief called it mayCancel.
test('cancelling works the same for pickup', () => {
  assert.equal(canCancel('customer', 'PLACED'), true)
  assert.equal(canCancel('customer', 'PACKED'), false)
  assert.equal(canCancel('farmer', 'PACKED'), true, 'ready for pickup, farmer can still call it off')
})

// Ready for pickup is still PACKED, so the UPI gate that stops packing an
// unpaid order stops "ready for pickup" too.
test('a UPI pickup order is not ready until the farmer confirms the money', () => {
  assert.equal(canTransition('ACCEPTED', 'PACKED', 'pickup'), true)
  assert.equal(awaitingPaymentConfirmation({ paymentMode: 'UPI', paymentStatus: 'UPI_SUBMITTED' }), true)
  assert.equal(awaitingPaymentConfirmation({ paymentMode: 'UPI', paymentStatus: 'UPI_CONFIRMED' }), false)
})

/* Checkout: the same all-or-nothing buildOrders, with the fulfilment checks inside it. */

const who = { customerId: 'c-9876543210', phone: '9876543210' }
const pickupCart = (farmerId: string, productId: string, qty: number) => ({
  fulfilment: 'pickup' as const, paymentMode: 'UPI' as const,
  groups: [{ farmerId, items: [{ productId, qty }] }],
}) as unknown as Parameters<typeof buildOrders>[1]

test('a pickup order needs no address, pays no delivery and stores the pickup place', () => {
  const db = seed()
  const r = buildOrders(db, pickupCart('s1', 'p1', 5), who)
  assert.ok(r.ok, JSON.stringify(!r.ok && r.body))
  const o = r.orders[0]!
  assert.equal(o.fulfilment, 'pickup')
  assert.equal(o.deliveryFee, 0)
  assert.equal(o.total, o.itemsTotal)
  assert.equal(o.address, db.farmers.find((f) => f.id === 's1')!.pickup!.place)
  assert.equal(o.outsideArea, undefined)
})

test('pickup from a farmer who offers none is refused, whole cart', () => {
  const db = seed()
  delete db.farmers.find((f) => f.id === 's1')!.pickup
  const r = buildOrders(db, pickupCart('s1', 'p1', 5), who)
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.status, 400)
  assert.equal(!r.ok && r.body.messageMr, 'हा शेतकरी ही सोय देत नाही')
})

test('delivery from a pickup-only farmer is refused; a row without offersDelivery still delivers', () => {
  const db = seed()
  const s1 = db.farmers.find((f) => f.id === 's1')!
  const delivery = { ...(pickupCart('s1', 'p1', 5) as object), fulfilment: undefined,
    address: { line: 'घर 1, अणदूर', pincode: '413603' } } as unknown as Parameters<typeof buildOrders>[1]
  delete s1.offersDelivery
  assert.equal(buildOrders(db, delivery, who).ok, true)
  s1.offersDelivery = false
  const r = buildOrders(db, delivery, who)
  assert.equal(!r.ok && r.body.messageMr, 'हा शेतकरी ही सोय देत नाही')
})

test('a profile with neither delivery nor pickup is refused; a bad place is named', () => {
  assert.equal(validateFarmerProfile({ offersDelivery: false, pickup: undefined }).fulfilment,
    'घरपोच किंवा शेतावरून नेणे - किमान एक निवडा')
  assert.deepEqual(validateFarmerProfile({ offersDelivery: false, pickup: { place: 'अणदूर बस स्थानकाजवळ' } }), {})
  assert.ok(validateFarmerProfile({ pickup: { place: 'ab' } }).pickupPlace)
})

test('the pickup place does not go into the buyer\'s address book', () => {
  const db = seed()
  const r = buildOrders(db, pickupCart('s1', 'p1', 5), who)
  assert.ok(r.ok)
  const c = recordOrderCustomer(db, r.orders[0]!)
  assert.equal(c.addresses.some((a) => a.line === r.orders[0]!.address), false)
})
