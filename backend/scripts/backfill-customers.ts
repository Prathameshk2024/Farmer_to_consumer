/**
 * BACKFILL CUSTOMERS FROM ORDER HISTORY
 * =====================================
 * Builds a customer record per phone number out of the orders already stored,
 * and repairs the customer id on those orders.
 *
 * Why the ids need repairing: the seeded orders carry `c1`..`c4`, while login
 * issues `c-<phone>`. They never match, so a woman logging in today sees an
 * empty order history while her orders sit in the database.
 *
 * Reports and changes nothing unless `--commit` is passed. Safe to run twice -
 * customers are keyed by derived id and orders already carrying the right id
 * are left alone, so a second run reports zero changes.
 *
 *   npm run backfill:customers              # dry run
 *   npm run backfill:customers -- --commit  # write
 */
import { flush, getDb, initStore } from '../src/db/store.js'
import { planBackfill } from '../src/db/customers.js'
import { describeConfig } from '../src/config.js'

const commit = process.argv.includes('--commit')

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

async function main(): Promise<void> {
  await initStore()
  const db = getDb()

  console.log('')
  console.log(describeConfig())
  console.log('')
  console.log(`  Read ${db.orders.length} orders, ${db.customers?.length ?? 0} existing customers`)
  console.log('')

  const plan = planBackfill(db.orders)

  console.log('  CUSTOMERS TO WRITE')
  console.log('  ' + '-'.repeat(74))
  for (const c of plan.customers) {
    const orders = db.orders.filter(
      (o) => String(o.customerPhone ?? '').replace(/\D/g, '') === c.phone,
    )
    console.log(
      `  ${c.id.padEnd(16)} ${truncate(c.name || '(no name)', 18).padEnd(20)} ` +
        `${String(orders.length).padStart(2)} orders  ${c.addresses.length} address(es)`,
    )
    for (const a of c.addresses) {
      console.log(
        `      ${a.isDefault ? '*' : ' '} ${a.pincode}  ${truncate(a.line, 46)}`,
      )
    }
  }

  console.log('')
  console.log('  ORDER customerId REWRITES')
  console.log('  ' + '-'.repeat(74))
  if (plan.orderUpdates.length === 0) {
    console.log('  (none - every order already points at the right customer)')
  }
  for (const u of plan.orderUpdates) {
    console.log(`  ${u.orderId.padEnd(10)} ${u.from.padEnd(16)} ->  ${u.to}`)
  }

  if (plan.skipped.length > 0) {
    console.log('')
    console.log('  SKIPPED (no phone number, so no identity to file them under)')
    console.log('  ' + '-'.repeat(74))
    for (const id of plan.skipped) console.log(`  ${id}`)
  }

  console.log('')
  console.log(
    `  SUMMARY  ${plan.customers.length} customers, ` +
      `${plan.orderUpdates.length} orders rewritten, ${plan.skipped.length} skipped`,
  )

  if (!commit) {
    console.log('')
    console.log('  DRY RUN - nothing was written.')
    console.log('  Re-run with --commit to apply.')
    console.log('')
    return
  }

  // Upsert rather than replace: an address she added through the app after
  // ordering is not in the order history, and must not be thrown away.
  for (const derived of plan.customers) {
    const existing = db.customers.find((c) => c.id === derived.id)
    if (!existing) {
      db.customers.push(derived)
      continue
    }
    existing.name = existing.name || derived.name
    existing.phone = derived.phone
    for (const a of derived.addresses) {
      if (!existing.addresses.some((x) => x.id === a.id)) {
        existing.addresses.push({ ...a, isDefault: existing.addresses.length === 0 })
      }
    }
    existing.updatedAt = new Date().toISOString()
  }

  for (const u of plan.orderUpdates) {
    const order = db.orders.find((o) => o.id === u.orderId)
    if (order) order.customerId = u.to
  }

  await flush()

  console.log('')
  console.log('  COMMITTED.')
  console.log('')
}

main().catch((err: unknown) => {
  console.error('[backfill] failed:', err)
  process.exitCode = 1
})
