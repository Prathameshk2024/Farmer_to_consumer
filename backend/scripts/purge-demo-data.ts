/**
 * REMOVE THE DEMO DATA FROM A LIVE DATABASE
 * =========================================
 * The seed in seed.ts invents three sellers and their products so a fresh
 * clone is usable. Once real women are registering, those invented sellers are
 * showing up in the customer catalogue beside them, which is not acceptable.
 *
 * This deletes them and everything hanging off them - their products, the
 * orders placed against them, the customers those orders created, and their
 * subscription payments. Real sellers and anything belonging to them are left
 * exactly as they are.
 *
 * A seed record is identified by the id shapes seed.ts hard-codes (s1, p3, o2,
 * sp1, c1...). Registered records get generated ids from newId(), which are
 * long and carry a timestamp, so the two can never be confused.
 *
 * Reports and changes nothing unless `--commit` is passed.
 *
 *   npm run purge:demo              # dry run
 *   npm run purge:demo -- --commit  # delete
 *
 * If the demo records are more than half of a collection - which they are on a
 * database with nothing else in it - the bulk-delete guard in db/firestore.ts
 * will refuse the write and say so. That guard exists because of the 10
 * September 2026 wipe. Deleting anyway is deliberate, and looks like it:
 *
 *   ALLOW_BULK_DELETE=true npm run purge:demo -- --commit
 */
import { flush, getDb, initStore } from '../src/db/store.js'
import { describeConfig } from '../src/config.js'

const commit = process.argv.includes('--commit')

/** seed.ts hard-codes short ids: s1, p12, o3, sp2, c4. newId() never does. */
const SEED_ID = /^(s|p|o|sp|c|a)\d{1,3}$/

function isSeedId(id: string): boolean {
  return SEED_ID.test(id)
}

async function main(): Promise<void> {
  await initStore()
  const db = getDb()

  console.log('')
  console.log(describeConfig())
  console.log('')

  const seedSellers = db.sellers.filter((s) => isSeedId(s.id))
  const seedSellerIds = new Set(seedSellers.map((s) => s.id))
  const realSellers = db.sellers.filter((s) => !seedSellerIds.has(s.id))

  // Anything belonging to a demo seller goes with her, whatever its own id.
  const doomedProducts = db.products.filter(
    (p) => seedSellerIds.has(p.sellerId) || isSeedId(p.id),
  )
  const doomedOrders = db.orders.filter(
    (o) => seedSellerIds.has(o.sellerId) || isSeedId(o.id),
  )
  const doomedPayments = db.payments.filter(
    (p) => seedSellerIds.has(p.sellerId) || isSeedId(p.id) || !db.sellers.some((s) => s.id === p.sellerId),
  )

  // A customer is demo data only if she exists BECAUSE of a demo order: she
  // must have at least one order going, and none staying.
  //
  // The "at least one" half matters. Without it this also deletes anyone who
  // has signed in but not yet bought anything - a real person with a real
  // phone number, whose record simply has no orders attached yet.
  const survivingOrders = db.orders.filter((o) => !doomedOrders.includes(o))
  const doomedCustomers = db.customers.filter(
    (c) =>
      doomedOrders.some((o) => o.customerId === c.id) &&
      !survivingOrders.some((o) => o.customerId === c.id),
  )

  // Feedback goes with the order it was written on. Left behind, it would be
  // stars on a shop that no longer exists.
  const doomedReviews = db.reviews.filter(
    (r) => seedSellerIds.has(r.sellerId) || doomedOrders.some((o) => o.id === r.orderId),
  )

  const show = (title: string, rows: string[]) => {
    console.log(`  ${title}`)
    console.log('  ' + '-'.repeat(74))
    if (rows.length === 0) console.log('  (none)')
    for (const r of rows) console.log(`  ${r}`)
    console.log('')
  }

  show('KEEPING - registered sellers', realSellers.map((s) => {
    const n = db.products.filter((p) => p.sellerId === s.id).length
    return `${s.id.padEnd(16)} ${s.name.padEnd(20)} ${s.status.padEnd(10)} ${n} products`
  }))

  show('DELETING - demo sellers', seedSellers.map(
    (s) => `${s.id.padEnd(16)} ${s.name.padEnd(20)} ${s.status}`,
  ))
  show('DELETING - products', doomedProducts.map(
    (p) => `${p.id.padEnd(16)} seller=${p.sellerId.padEnd(10)} ${p.name}`,
  ))
  show('DELETING - orders', doomedOrders.map(
    (o) => `${o.id.padEnd(16)} seller=${o.sellerId.padEnd(10)} ${o.customerName}`,
  ))
  show('DELETING - customers', doomedCustomers.map(
    (c) => `${c.id.padEnd(16)} ${c.name || '(no name)'}`,
  ))
  show('DELETING - payments', doomedPayments.map(
    (p) => `${p.id.padEnd(16)} seller=${p.sellerId.padEnd(14)} ${p.status}`,
  ))
  show('DELETING - reviews', doomedReviews.map(
    (r) => `${r.id.padEnd(16)} order=${r.orderId.padEnd(10)} ${r.rating}★`,
  ))

  console.log(
    `  SUMMARY  ${seedSellers.length} sellers, ${doomedProducts.length} products, ` +
      `${doomedOrders.length} orders, ${doomedCustomers.length} customers, ` +
      `${doomedPayments.length} payments, ${doomedReviews.length} reviews`,
  )
  console.log(`           ${realSellers.length} registered seller(s) kept`)

  if (!commit) {
    console.log('')
    console.log('  DRY RUN - nothing was deleted.')
    console.log('  Re-run with --commit to apply.')
    console.log('')
    return
  }

  db.sellers = db.sellers.filter((s) => !seedSellerIds.has(s.id))
  db.products = db.products.filter((p) => !doomedProducts.includes(p))
  db.orders = db.orders.filter((o) => !doomedOrders.includes(o))
  db.customers = db.customers.filter((c) => !doomedCustomers.includes(c))
  db.payments = db.payments.filter((p) => !doomedPayments.includes(p))
  db.reviews = db.reviews.filter((r) => !doomedReviews.includes(r))

  await flush()
  console.log('')
  console.log('  COMMITTED.')
  console.log('')
}

main().catch((err: unknown) => {
  console.error('[purge] failed:', err)
  process.exitCode = 1
})
