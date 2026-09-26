/**
 * Admin CLI — stands in for the separate admin site.
 *
 * The admin console is a separate application by design, so this script is how
 * you drive the admin API while testing. It talks to the running server over
 * HTTP and uses exactly the same endpoints the real console will, so anything
 * that works here will work there.
 *
 *   npx tsx backend/scripts/admin.ts farmers
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

interface FarmerRow { id: string; name: string; phone: string; farmerCode: string; status: string }

/** One farmer at a time, by phone, id or farmer code - after an admin has checked him. */
async function verify(target: string | undefined): Promise<void> {
  const r = await call<{ farmers: FarmerRow[] }>('/api/admin/farmers')
  const farmer = r.farmers.find((s) => s.id === target || s.phone === target || s.farmerCode === target)
  if (!farmer) {
    console.error(c.red(`\n  No farmer matches "${target ?? ''}".\n`))
    process.exit(1)
  }
  const out = await call<{ farmer: FarmerRow }>(`/api/admin/farmers/${farmer.id}/verify`, { method: 'POST' })
  console.log(c.green(`\n  ✓ Verified ${out.farmer.name} (${out.farmer.farmerCode})\n`))
}

async function farmers(): Promise<void> {
  const r = await call<{ farmers: FarmerRow[] }>('/api/admin/farmers')
  console.log(c.bold(`\n  ${r.farmers.length} farmer(s)\n`))
  for (const s of r.farmers) {
    const status = s.status === 'ACTIVE' ? c.green(s.status) : c.amber(s.status)
    console.log(
      `  ${s.farmerCode.padEnd(18)} ${s.name.padEnd(18)} +91 ${s.phone}  ${status}`,
    )
  }
  console.log('')
}

async function main(): Promise<void> {
  const [cmd = 'farmers', a1] = process.argv.slice(2)
  await login()

  switch (cmd) {
    case 'farmers': await farmers(); break
    case 'verify': await verify(a1); break
    default:
      console.log(`
  Commands:
    farmers                     every farmer with status
    verify <id|phone|farmer-code>    verify a farmer once, after checking him
`)
  }
}

main().catch((err) => {
  console.error(c.red(`\n  ${(err as Error).message}\n`))
  process.exit(1)
})
