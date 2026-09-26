/**
 * Admin CLI — stands in for the separate admin site.
 *
 * The admin console is a separate application by design, so this script is how
 * you drive the admin API while testing. It talks to the running server over
 * HTTP and uses exactly the same endpoints the real console will, so anything
 * that works here will work there.
 *
 *   npx tsx backend/scripts/admin.ts sellers
 *   npx tsx backend/scripts/admin.ts verify 9822011223
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

interface SellerRow { id: string; name: string; phone: string; womenBizId: string; status: string }

/** One farmer at a time, by phone, id or SMB id - after an admin has checked him. */
async function verify(target: string | undefined): Promise<void> {
  const r = await call<{ sellers: SellerRow[] }>('/api/admin/sellers')
  const seller = r.sellers.find((s) => s.id === target || s.phone === target || s.womenBizId === target)
  if (!seller) {
    console.error(c.red(`\n  No seller matches "${target ?? ''}".\n`))
    process.exit(1)
  }
  const out = await call<{ seller: SellerRow }>(`/api/admin/sellers/${seller.id}/verify`, { method: 'POST' })
  console.log(c.green(`\n  ✓ Verified ${out.seller.name} (${out.seller.womenBizId})\n`))
}

async function sellers(): Promise<void> {
  const r = await call<{ sellers: SellerRow[] }>('/api/admin/sellers')
  console.log(c.bold(`\n  ${r.sellers.length} seller(s)\n`))
  for (const s of r.sellers) {
    const status = s.status === 'ACTIVE' ? c.green(s.status) : c.amber(s.status)
    console.log(
      `  ${s.womenBizId.padEnd(18)} ${s.name.padEnd(18)} +91 ${s.phone}  ${status}`,
    )
  }
  console.log('')
}

async function main(): Promise<void> {
  const [cmd = 'sellers', a1] = process.argv.slice(2)
  await login()

  switch (cmd) {
    case 'sellers': await sellers(); break
    case 'verify': await verify(a1); break
    default:
      console.log(`
  Commands:
    sellers                     every seller with status
    verify <id|phone|smb-id>    verify a farmer once, after checking him
`)
  }
}

main().catch((err) => {
  console.error(c.red(`\n  ${(err as Error).message}\n`))
  process.exit(1)
})
