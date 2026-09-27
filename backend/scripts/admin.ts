/**
 * Admin CLI — stands in for the separate admin site.
 *
 * The admin console is a separate application by design, so this script is how
 * you drive the admin API while testing. It talks to the running server over
 * HTTP and uses exactly the same endpoints the real console will, so anything
 * that works here will work there.
 *
 *   npm run admin -- farmers
 *   npm run admin -- verify 9822011223
 *   npm run admin -- pending
 *   npm run admin -- approve 9822011223 --verified
 *   npm run admin -- reject sp2 "UTR not in the bank statement"
 *   npm run admin -- grant 9822011223 2
 *   npm run admin -- products
 *   npm run admin -- approve-product <id>
 *   npm run admin -- set-password 9822011223 123456
 *
 * `set-password` is the exception: it writes the store directly, like
 * admins.ts, because it exists for the seeded demo farmers, who have no
 * password (seeding never invents credentials). Stop the API first - it holds
 * the database in memory and would overwrite the new row. The password is on
 * the command line, so it lands in shell history: a demo password only; a
 * real farmer gets *Reset password* in the admin console.
 *
 * Env: API_URL (default http://localhost:4000), ADMIN_EMAIL, ADMIN_PASSWORD.
 */

import { flush, getDb, initStore, save } from '../src/db/store.js'
import { setCredential } from '../src/auth/credentials.js'
import { normalizePhone } from '@shared/farmer.js'
import { passwordProblemMr } from '@shared/password.js'

const API = process.env.API_URL ?? 'http://localhost:4000'
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com'
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'changeme'

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  amber: (s: string) => `\x1b[33m${s}\x1b[0m`,
}

let token = ''

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  let body: unknown = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`${res.status} from ${path} — is the API running on ${API}?`)
  }
  if (!res.ok) {
    const b = body as { error?: string }
    throw new Error(`${res.status} ${b.error ?? 'request failed'}`)
  }
  return body as T
}

async function login(): Promise<void> {
  try {
    const r = await call<{ session: { token: string } }>('/api/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    token = r.session.token
  } catch (err) {
    console.error(c.red('\n  Could not sign in as admin.'))
    console.error(`  ${(err as Error).message}`)
    console.error(c.dim(`  Start the API first:  npm run dev:api\n`))
    process.exit(1)
  }
}

interface FarmerRow {
  id: string; name: string; phone: string; farmerCode: string; status: string
  packsApproved?: number; subscriptionEndsAt?: string
  slots?: { used: number; total: number }
}

interface Payment {
  id: string
  kind?: 'PACK' | 'RENEWAL'
  farmerId: string
  farmerName: string
  farmerCode: string
  phone: string
  amount: number
  utr: string
  payerUpi: string
  screenshotUrl?: string
  paidAt?: string
  submittedAt: string
  status: string
  duplicateUtr: boolean
}

async function listPending(): Promise<Payment[]> {
  const r = await call<{ payments: Payment[] }>('/api/admin/payments?status=PENDING')
  return r.payments
}

function stamp(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function printPayments(list: Payment[]): void {
  if (!list.length) {
    console.log(c.dim('\n  No payments waiting.\n'))
    return
  }
  console.log(c.bold(`\n  ${list.length} payment(s) waiting for approval\n`))
  for (const p of list) {
    // Worked out here from the submission time: the server sends no wait.
    const wait = Math.floor((Date.now() - Date.parse(p.submittedAt)) / 3_600_000)
    const waitTxt =
      wait > 24 ? c.red(`waiting ${wait}h`) : wait > 12 ? c.amber(`waiting ${wait}h`) : c.dim(`waiting ${wait}h`)
    console.log(`  ${c.bold(p.id.padEnd(16))} ${p.farmerName}  ${c.dim(p.kind ?? 'PACK')}`)
    console.log(`  ${''.padEnd(16)} ${c.dim(p.farmerCode)}  +91 ${p.phone}`)
    console.log(`  ${''.padEnd(16)} ₹${p.amount}  UTR ${p.utr}  ${p.payerUpi}`)
    console.log(`  ${''.padEnd(16)} paid ${p.paidAt ? stamp(p.paidAt) : c.amber('not stated')}  ·  sent ${stamp(p.submittedAt)}`)
    console.log(`  ${''.padEnd(16)} screenshot ${p.screenshotUrl ?? c.red('NONE — check the bank statement')}`)
    console.log(`  ${''.padEnd(16)} ${waitTxt}${p.duplicateUtr ? '  ' + c.red('DUPLICATE UTR — check carefully') : ''}`)
    console.log('')
  }
  console.log(c.dim('  Open the screenshot, match its UTR, date and time, and find the ₹50 on the statement.'))
  console.log(c.dim('  Then:  npm run admin -- approve <id|phone|farmer-code> --verified\n'))
}

/**
 * One payment at a time, and only after saying it was checked.
 *
 * Each approval grants five slots on a UTR that anybody can type, so
 * approving a queue without opening a single screenshot is exactly the hole
 * the checklist closes - the API refuses an approval that does not carry the
 * checks, and `--verified` is this script saying so. There is no `all`.
 */
async function approve(target: string | undefined, verified: boolean): Promise<void> {
  if (!target || target === 'all' || !verified) {
    console.error(c.red('\n  Approve one payment at a time, after checking it:'))
    console.error('  npm run admin -- approve <id|phone|farmer-code> --verified')
    console.error(c.dim('  --verified means: the UTR, date and time in the screenshot match, and the ₹50 is on the statement.\n'))
    process.exit(1)
  }

  const pending = await listPending()
  if (!pending.length) {
    console.log(c.dim('\n  Nothing to approve.\n'))
    return
  }

  const chosen = pending.filter((p) => p.id === target || p.phone === target || p.farmerCode === target)
  if (!chosen.length) {
    console.error(c.red(`\n  No pending payment matches "${target}".`))
    printPayments(pending)
    process.exit(1)
  }

  for (const p of chosen) {
    const r = await call<{ farmer?: FarmerRow }>(
      `/api/admin/payments/${p.id}/approve`,
      { method: 'POST', body: JSON.stringify({ checks: ['utr', 'dateTime', 'received'] }) },
    )
    const f = r.farmer
    console.log(
      c.green(`\n  ✓ Approved ${p.id}`) +
        `  ${p.farmerName} (${p.farmerCode})` +
        (f ? `\n    ${(f.packsApproved ?? 0) * 5} product slots · ${
          f.subscriptionEndsAt ? `shop open until ${stamp(f.subscriptionEndsAt)}` : 'the six months start at verification'
        }` : ''),
    )
  }
  console.log('')
}

async function reject(id: string | undefined, reason: string): Promise<void> {
  if (!id) {
    console.error(c.red('\n  Usage: npm run admin -- reject <id> [reason]\n'))
    process.exit(1)
  }
  await call(`/api/admin/payments/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
  console.log(c.amber(`\n  ✗ Rejected ${id} — ${reason}\n`))
}

/** Slots with no payment: goodwill, a training batch, a demo account. Status is never touched. */
async function grant(target: string | undefined, packs: number): Promise<void> {
  const r = await call<{ farmers: FarmerRow[] }>('/api/admin/farmers')
  const farmer = r.farmers.find((s) => s.phone === target || s.farmerCode === target)
  if (!farmer) {
    console.error(c.red(`\n  No farmer with phone or farmer code "${target ?? ''}".\n`))
    process.exit(1)
  }
  const out = await call<{ farmer: FarmerRow }>(
    `/api/admin/farmers/${farmer.id}/grant-slots`,
    { method: 'POST', body: JSON.stringify({ packs }) },
  )
  console.log(
    c.green(`\n  ✓ Granted ${packs} pack(s) to ${farmer.name} (${farmer.farmerCode})`) +
      `\n    ${(out.farmer.packsApproved ?? 0) * 5} product slots\n`,
  )
}

/** One farmer at a time, by phone, id or farmer code - after an admin has checked them. */
async function verify(target: string | undefined): Promise<void> {
  const r = await call<{ farmers: FarmerRow[] }>('/api/admin/farmers')
  const farmer = r.farmers.find((s) => s.id === target || s.phone === target || s.farmerCode === target)
  if (!farmer) {
    console.error(c.red(`\n  No farmer matches "${target ?? ''}".\n`))
    process.exit(1)
  }
  const out = await call<{ farmer: FarmerRow }>(`/api/admin/farmers/${farmer.id}/verify`, { method: 'POST' })
  console.log(c.green(`\n  ✓ Verified ${out.farmer.name} (${out.farmer.farmerCode})`))
  // A farmer who paid first starts the six months at this moment.
  if (out.farmer.subscriptionEndsAt) console.log(`    shop open until ${stamp(out.farmer.subscriptionEndsAt)}`)
  console.log('')
}

async function farmers(): Promise<void> {
  const r = await call<{ farmers: FarmerRow[] }>('/api/admin/farmers')
  console.log(c.bold(`\n  ${r.farmers.length} farmer(s)\n`))
  for (const s of r.farmers) {
    const status = s.status === 'ACTIVE' ? c.green(s.status) : c.amber(s.status)
    console.log(
      `  ${s.farmerCode.padEnd(18)} ${s.name.padEnd(18)} +91 ${s.phone}  ${status}  ${s.slots?.used ?? 0}/${s.slots?.total ?? 0} slots`,
    )
  }
  console.log('')
}

/** Listings sent in and waiting for a person to look at them. */
async function products(): Promise<void> {
  const r = await call<{ products: { id: string; name: string; cropId: string; farmer?: { farmerCode: string } }[] }>(
    '/api/admin/products?status=PENDING',
  )
  if (!r.products.length) {
    console.log(c.dim('\n  No products waiting to be checked.\n'))
    return
  }
  console.log(c.bold(`\n  ${r.products.length} product(s) waiting\n`))
  for (const p of r.products) {
    console.log(`  ${c.bold(p.id.padEnd(16))} ${p.name}  ${c.dim(p.cropId)}  ${p.farmer?.farmerCode ?? ''}`)
  }
  console.log(c.dim('\n  Publish with:  npm run admin -- approve-product <id>\n'))
}

async function approveProduct(id: string | undefined): Promise<void> {
  if (!id) {
    console.error(c.red('\n  Usage: npm run admin -- approve-product <id>\n'))
    process.exit(1)
  }
  await call(`/api/admin/products/${id}/moderate`, {
    method: 'POST',
    body: JSON.stringify({ approve: true }),
  })
  console.log(c.green(`\n  ✓ Product ${id} is live.\n`))
}

/** A password for one farmer, by phone, straight into `credentials`. */
async function setPassword(phoneArg: string | undefined, password: string | undefined): Promise<void> {
  const problem = passwordProblemMr(password ?? '')
  if (!phoneArg || problem) {
    console.error(c.red(`\n  Usage: npm run admin -- set-password <phone> <password>\n  ${problem ?? ''}\n`))
    process.exit(1)
  }
  await initStore()
  const db = getDb()
  const phone = normalizePhone(phoneArg)
  const farmer = db.farmers.find((f) => f.phone === phone)
  if (!farmer) {
    console.error(c.red(`\n  No farmer has the phone ${phone}.\n`))
    process.exit(1)
  }
  setCredential(db, { role: 'farmer', userId: farmer.id, phone, password: password! })
  save()
  await flush()
  console.log(c.green(`\n  ✓ ${farmer.name} (${farmer.farmerCode}) can now sign in with ${phone}\n`))
  process.exit(0)
}

async function main(): Promise<void> {
  const [cmd = 'farmers', a1, a2] = process.argv.slice(2)
  if (cmd === 'set-password') return setPassword(a1, a2)
  await login()

  switch (cmd) {
    case 'farmers': await farmers(); break
    case 'verify': await verify(a1); break
    case 'pending': printPayments(await listPending()); break
    case 'approve': await approve(a1, a2 === '--verified'); break
    case 'reject': await reject(a1, a2 ?? 'UTR did not match the bank statement'); break
    case 'grant': await grant(a1, Number(a2 ?? 1)); break
    case 'products': await products(); break
    case 'approve-product': await approveProduct(a1); break
    default:
      console.log(`
  Commands:
    farmers                          every farmer with status and slot usage
    verify <id|phone|farmer-code>    verify a farmer once, after checking them
                                     (starts the six months if they paid first)
    pending                          ₹50 payments waiting for approval
    approve <id|phone|farmer-code> --verified
                                     approve after checking the screenshot - 5 slots
    reject <id> [reason]             reject a payment with a reason
    grant <phone|farmer-code> [packs]  slots with no payment; never extends a term
    products                         listings waiting to be checked
    approve-product <id>             publish a waiting listing
    set-password <phone> <password>  a demo password for a seeded farmer (API stopped)
`)
  }
}

main().catch((err) => {
  console.error(c.red(`\n  ${(err as Error).message}\n`))
  process.exit(1)
})
