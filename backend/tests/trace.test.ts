import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { traceView } = await import('../src/routes/catalog.routes.js')
const { emptyDb } = await import('../src/db/seed.js')

/**
 * A printed QR outlives the listing. Scanning it must show the farmer only
 * while the product is on sale - the same rule as the catalogue - and the
 * same "not found" as an id that never existed otherwise.
 */

const FUTURE = '2099-01-01T00:00:00.000Z'

function world(farmerStatus: string, productStatus: string, isOpen = true) {
  const db = emptyDb()
  db.farmers.push({ id: 'f1', status: farmerStatus, isOpen, subscriptionEndsAt: FUTURE, name: 'राजेश पाटील', phone: '9822011223',
    farmerCode: 'F2C-ANADUR-001', village: 'अणदूर', crops: ['tomato'], lat: 17.99364, lng: 76.23361,
    locationConsent: true, offersDelivery: true } as never)
  db.products.push({ id: 'p1', farmerId: 'f1', status: productStatus, cropId: 'tomato', name: 'टोमॅटो',
    harvestDate: '2026-09-25', cultivation: 'organic', price: 40, unit: 'kg', stock: 100, minOrder: 5 } as never)
  return db
}

test("a live product from a verified farmer is traceable, with the farmer's phone", () => {
  const v = traceView(world('ACTIVE', 'LIVE'), 'p1')!
  assert.equal(v.farmer.phone, '9822011223')
  assert.equal(v.farmer.lat, 17.99, 'rounded, as everywhere public')
  assert.equal(v.product.harvestDate, '2026-09-25')
})

for (const [label, f, p, open] of [
  ['blocked farmer', 'BLOCKED', 'LIVE', true],
  ['unverified farmer', 'PENDING_VERIFICATION', 'LIVE', true],
  ['draft', 'ACTIVE', 'DRAFT', true],
  ['closed shop', 'ACTIVE', 'LIVE', false],
] as const) {
  test(`${label}: nothing`, () => {
    assert.equal(traceView(world(f, p, open), 'p1'), null)
  })
}

test('an unknown id: nothing', () => {
  assert.equal(traceView(world('ACTIVE', 'LIVE'), 'nope'), null)
})
