/**
 * Admin CLI — stands in for the separate admin site.
 *
 * The admin console is a separate application by design, so this script is how
 * you drive the admin API while testing. It talks to the running server over
 * HTTP and uses exactly the same endpoints the real console will, so anything
 * that works here will work there.
 *
 *   npx tsx backend/scripts/admin.ts pending
 *   npx tsx backend/scripts/admin.ts approve 9822011223 --verified
 *   npx tsx backend/scripts/admin.ts reject sp2 "UTR not in the bank statement"
 *   npx tsx backend/scripts/admin.ts sellers
 *   npx tsx backend/scripts/admin.ts grant 9822011223 2
 *   npx tsx backend/scripts/admin.ts products
 *
 * Env: API_URL (default http://localhost:4000), ADMIN_EMAIL, ADMIN_PASSWORD.
 */

const API = process.env.API_URL ?? 'http://localhost:4000'
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@shantabazar.in'
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'changeme'

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  amber: (s: string) => `\x1b[33m${s}\x1b[0m`,
}

interface Payment {
  id: string
  sellerId: string
  sellerName: string
  womenBizId: string
  phone: string
  amount: number
  utr: string
  payerUpi: string
  screenshotUrl?: string
  paidAt?: string
  submittedAt: string
  status: string
  duplicateUtr: boolean
  waitingHours?: number
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

async function listPending(): Promise<Payment[]> {
  const r = await call<{ payments: Payment[] }>('/api/admin/payments?status=PENDING')
  return r.payments
}

function printPayments(list: Payment[]): void {
  if (!list.length) {
    console.log(c.dim('\n  No payments waiting.\n'))
    return
  }
  console.log(c.bold(`\n  ${list.length} payment(s) waiting for approval\n`))
  for (const p of list) {
    const wait = p.waitingHours ?? 0
    const waitTxt =
      wait > 24 ? c.red(`waiting ${wait}h`) : wait > 12 ? c.amber(`waiting ${wait}h`) : c.dim(`waiting ${wait}h`)
    console.log(`  ${c.bold(p.id.padEnd(16))} ${p.sellerName}`)
    console.log(`  ${''.padEnd(16)} ${c.dim(p.womenBizId)}  +91 ${p.phone}`)
    console.log(`  ${''.padEnd(16)} ₹${p.amount}  UTR ${p.utr}  ${p.payerUpi}`)
    console.log(`  ${''.padEnd(16)} paid ${p.paidAt ? stamp(p.paidAt) : c.amber('not stated')}  ·  sent ${stamp(p.submittedAt)}`)
    console.log(`  ${''.padEnd(16)} screenshot ${p.screenshotUrl ?? c.red('NONE — check the bank statement')}`)
    console.log(`  ${''.padEnd(16)} ${waitTxt}${p.duplicateUtr ? '  ' + c.red('DUPLICATE UTR — check carefully') : ''}`)
    console.log('')
  }
  console.log(c.dim('  Open the screenshot, match its UTR, date and time, and find the ₹50 on the statement.'))
  console.log(c.dim('  Then:  npx tsx backend/scripts/admin.ts approve <id|phone> --verified\n'))
}

function stamp(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/**
 * One payment at a time, and only after saying it was checked.
 *
 * `approve all` used to exist. Each approval grants five slots on a UTR that
 * anybody can type, so approving a queue without opening a single screenshot
 * is exactly the hole the checklist closes - the API refuses an approval that
 * does not carry the checks, and `--verified` is this script saying so.
 */
async function approve(target: string | undefined, verified: boolean): Promise<void> {
  if (!target || target === 'all' || !verified) {
    console.error(c.red('\n  Approve one payment at a time, after checking it:'))
    console.error('  npx tsx backend/scripts/admin.ts approve <id|phone> --verified')
    console.error(c.dim('  --verified means: the screenshot\'s UTR, date and time match, and the ₹50 is on the statement.\n'))
    process.exit(1)
  }

  const pending = await listPending()
  if (!pending.length) {
    console.log(c.dim('\n  Nothing to approve.\n'))
    return
  }

  const chosen = pending.filter((p) => p.id === target || p.phone === target || p.womenBizId === target)

  if (!chosen.length) {
    console.error(c.red(`\n  No pending payment matches "${target}".`))
    printPayments(pending)
    process.exit(1)
  }

  for (const p of chosen) {
    const r = await call<{ seller?: { packsApproved: number; status: string; name: string } }>(
      `/api/admin/payments/${p.id}/approve`,
      { method: 'POST', body: JSON.stringify({ checks: ['utr', 'dateTime', 'received'] }) },
    )
    const s = r.seller
    console.log(
      c.green(`\n  ✓ Approved ${p.id}`) +
        `  ${p.sellerName} (${p.womenBizId})` +
        (s ? `\n    status ${c.bold(s.status)} · ${s.packsApproved * 5} product slots` : ''),
    )
  }
  console.log(c.dim('\n  She can now publish products. Refresh her app.\n'))
}

async function reject(id: string, reason: string): Promise<void> {
  await call(`/api/admin/payments/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
  console.log(c.amber(`\n  ✗ Rejected ${id} — ${reason}\n`))
}

async function grant(phone: string, packs: number): Promise<void> {
  const r = await call<{ sellers: { id: string; phone: string; name: string; womenBizId: string }[] }>(
    '/api/admin/sellers',
  )
  const seller = r.sellers.find((s) => s.phone === phone || s.womenBizId === phone)
  if (!seller) {
    console.error(c.red(`\n  No seller with phone/ID "${phone}".\n`))
    process.exit(1)
  }
  const out = await call<{ seller: { packsApproved: number; status: string } }>(
    `/api/admin/sellers/${seller.id}/grant-slots`,
    { method: 'POST', body: JSON.stringify({ packs }) },
  )
  console.log(
    c.green(`\n  ✓ Granted ${packs} pack(s) to ${seller.name} (${seller.womenBizId})`) +
      `\n    status ${c.bold(out.seller.status)} · ${out.seller.packsApproved * 5} product slots\n`,
  )
}

async function sellers(): Promise<void> {
  const r = await call<{
    sellers: {
      name: string; phone: string; womenBizId: string; status: string
      slots: { used: number; total: number }
    }[]
  }>('/api/admin/sellers')
  console.log(c.bold(`\n  ${r.sellers.length} seller(s)\n`))
  for (const s of r.sellers) {
    const status = s.status === 'ACTIVE' ? c.green(s.status) : c.amber(s.status)
    console.log(
      `  ${s.womenBizId.padEnd(18)} ${s.name.padEnd(18)} +91 ${s.phone}  ${status}  ${s.slots.used}/${s.slots.total} slots`,
    )
  }
  console.log('')
}

async function products(): Promise<void> {
  const r = await call<{ products: { id: string; name: string; isFood: boolean; fssai?: string }[] }>(
    '/api/admin/products?status=PENDING',
  )
  if (!r.products.length) {
    console.log(c.dim('\n  No products waiting for moderation.\n'))
    return
  }
  console.log(c.bold(`\n  ${r.products.length} product(s) waiting\n`))
  for (const p of r.products) {
    console.log(`  ${p.id.padEnd(16)} ${p.name}  ${p.isFood ? `FSSAI ${p.fssai ?? c.red('MISSING')}` : ''}`)
  }
  console.log(c.dim('\n  Approve with:  npx tsx backend/scripts/admin.ts approve-product <id>\n'))
}

async function approveProduct(id: string): Promise<void> {
  await call(`/api/admin/products/${id}/moderate`, {
    method: 'POST',
    body: JSON.stringify({ approve: true }),
  })
  console.log(c.green(`\n  ✓ Product ${id} is live.\n`))
}

async function main(): Promise<void> {
  const [cmd = 'pending', a1, a2] = process.argv.slice(2)
  await login()

  switch (cmd) {
    case 'pending': printPayments(await listPending()); break
    case 'approve': await approve(a1, a2 === '--verified'); break
    case 'reject': await reject(a1!, a2 ?? 'UTR did not match the bank statement'); break
    case 'grant': await grant(a1!, Number(a2 ?? 1)); break
    case 'sellers': await sellers(); break
    case 'products': await products(); break
    case 'approve-product': await approveProduct(a1!); break
    default:
      console.log(`
  Commands:
    pending                     list ₹50 payments waiting for approval
    approve <id|phone> --verified
                                approve after checking the screenshot — grants 5 product slots
    reject <id> [reason]        reject with a reason
    grant <phone> [packs]       grant slots directly, no payment needed
    sellers                     every seller with status and slot usage
    products                    products waiting for moderation
    approve-product <id>        publish a pending product
`)
  }
}

main().catch((err) => {
  console.error(c.red(`\n  ${(err as Error).message}\n`))
  process.exit(1)
})
