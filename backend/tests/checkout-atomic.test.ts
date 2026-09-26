import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seed } from '../src/db/seed.js'
import { buildOrders } from '../src/routes/orders.routes.js'

/**
 * A CART IS PLACED WHOLE OR NOT AT ALL.
 *
 * Checkout used to push each farmer's order as it went, so a bad quantity in
 * the SECOND farmer's group answered 409 with the first farmer's order already
 * in memory - unsaved, but written by the next save() anyone made. The buyer
 * was told "no" and the first farmer got an order anyway. `buildOrders`
 * judges every group and writes nothing; the route pushes only on ok.
 */

const who = { customerId: 'c-9876543210', phone: '9876543210' }
const address = { line: 'घर 1, अणदूर', pincode: '413603' }
const cart = (okraQty: number) => ({
  address, paymentMode: 'COD' as const,
  groups: [
    { farmerId: 's1', items: [{ productId: 'p1', qty: 5 }] }, // tomato, fine
    { farmerId: 's2', items: [{ productId: 'p2', qty: okraQty }] }, // okra
  ],
}) as unknown as Parameters<typeof buildOrders>[1]

test('a bad quantity in the second farmer\'s group refuses the whole cart and writes nothing', () => {
  const db = seed()
  const before = db.orders.length
  const r = buildOrders(db, cart(1.5), who)
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.status, 409)
  // The buyer is told why, in Marathi, naming the product: a bare 409 is a button that does nothing.
  assert.ok(!r.ok && r.body.messageMr.trim().length > 0)
  assert.match(!r.ok ? r.body.messageMr : '', /भेंडी/)
  assert.equal(db.orders.length, before, 'the first farmer\'s order is not left behind')
})

test('above the stock in the second group is refused the same way', () => {
  const db = seed()
  const before = db.orders.length
  const r = buildOrders(db, cart(10_000), who)
  assert.equal(r.ok, false)
  assert.equal(db.orders.length, before)
})

test('a valid two-farmer cart builds two orders with distinct ids, and still writes nothing itself', () => {
  const db = seed()
  const before = db.orders.length
  const r = buildOrders(db, cart(4), who)
  assert.ok(r.ok)
  assert.equal(r.ok && r.orders.length, 2)
  assert.notEqual(r.ok && r.orders[0]!.id, r.ok && r.orders[1]!.id)
  assert.equal(db.orders.length, before, 'committing is the route\'s job, after every group passed')
})

/** An item listed under the wrong farmer would be billed to someone who does not sell it. */
test('a product placed in another farmer\'s group is refused', () => {
  const db = seed()
  const r = buildOrders(db, { ...cart(4), groups: [{ farmerId: 's1', items: [{ productId: 'p2', qty: 4 }] }] } as never, who)
  assert.equal(r.ok, false)
})
