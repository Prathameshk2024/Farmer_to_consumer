import crypto from 'node:crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { attachAuth, callerIp, requireRole } from './middleware/auth.js'
import { hit, LIMITS, sweep as sweepLimits } from './auth/rateLimit.js'
import { pruneSessions } from './auth/sessions.js'
import { describeAdminState } from './auth/admins.js'
import { authRouter } from './routes/auth.routes.js'
import { sellersRouter } from './routes/sellers.routes.js'
import { productsRouter } from './routes/products.routes.js'
import { catalogRouter } from './routes/catalog.routes.js'
import { ordersRouter } from './routes/orders.routes.js'
import { complaintsRouter } from './routes/complaints.routes.js'
import { reportsRouter } from './routes/reports.routes.js'
import { adminRouter } from './routes/admin.routes.js'
import { flush, getDb, initStore, resetDb, save } from './db/store.js'
import { uploadsRouter } from './routes/uploads.routes.js'
import { qrRouter } from './routes/qr.routes.js'
import { customersRouter } from './routes/customers.routes.js'
import { pushRouter } from './routes/push.routes.js'
import {
  ALLOW_DEV_RESET, CORS_ORIGIN, describeConfig, PORT as CONFIG_PORT, usingFirestore,
} from './config.js'
import { sellerWeek } from './db/analytics.js'
import { purgeArchived, purgeRejected } from './db/moderation.js'
import { sweepClosedAccounts } from './db/accountClose.js'
import { backfillSubscriptionTerms } from './db/subscription.js'
import { splitOrderReviews } from './db/reviews.js'
import { onNotice } from './db/notices.js'
import { fcmTransport, setPushTransport } from './push/send.js'
import { notifyAdminNotice } from './push/notify.js'

const app = express()
const PORT = CONFIG_PORT

/**
 * Cloud Run terminates TLS and forwards, so without this every request appears
 * to come from its front end. Per-IP rate limiting would then key the whole
 * internet to one bucket - locking everybody out at once, or letting everybody
 * through, depending which way it broke. `1` means "trust exactly one hop",
 * which is the deployment; trusting all hops would let a client forge
 * X-Forwarded-For and pick its own identity.
 */
app.set('trust proxy', 1)
app.disable('x-powered-by')

/**
 * Security headers. This API serves JSON to two browser front ends, so what
 * matters here is HSTS and refusing to be sniffed or framed; a CSP belongs on
 * the Vercel apps that actually render HTML.
 */
app.use(
  helmet({
    contentSecurityPolicy: false,
    // Resources are fetched cross-origin by design - two front ends, one API.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: { maxAge: 15552000, includeSubDomains: true },
    referrerPolicy: { policy: 'no-referrer' },
  }),
)

// A LIST, not a string: the seller/customer app and the admin site are
// deployed to different origins and both call this one API.
// exposedHeaders matters: a browser cannot read a custom response header
// unless it is named here, and X-Session-Token is how a sliding session gets
// back to the client. Without it every session would expire on schedule
// however active the user was.
app.use(cors({ origin: CORS_ORIGIN, exposedHeaders: ['X-Session-Token'] }))

/**
 * A blunt ceiling over everything, before any parsing or lookup happens.
 *
 * The per-endpoint limits in auth/rateLimit.ts are the ones that matter for
 * guessing attacks; this one exists so that no single client can occupy the
 * process, and so an attack shows up in the audit trail rather than as a
 * mysteriously slow site.
 */
app.use((req, res, next) => {
  const result = hit(`global:${callerIp(req)}`, LIMITS.globalPerIp)
  if (result.ok) {
    next()
    return
  }
  res.setHeader('Retry-After', String(result.retryAfterSec))
  res.status(429).json({
    error: 'Too many requests',
    messageMr: 'खूप विनंत्या आल्या. थोड्या वेळाने पुन्हा प्रयत्न करा.',
  })
})

/**
 * 2MB is sized for product payloads. Auth takes a phone number and a six-digit
 * code, so it gets a limit to match - there is no reason for a login endpoint
 * to accept two megabytes, and every reason not to.
 */
app.use('/api/auth', express.json({ limit: '8kb' }))
app.use(express.json({ limit: '2mb' }))
app.use(attachAuth)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'shanta-mahila-bazar-api', time: new Date().toISOString() })
})

app.use('/api/auth', authRouter)
app.use('/api/sellers', sellersRouter)
app.use('/api/products', productsRouter)
app.use('/api/catalog', catalogRouter)
app.use('/api/customers', customersRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/complaints', complaintsRouter)
app.use('/api/push', pushRouter)
app.use('/api/uploads', uploadsRouter)
app.use('/api/qr', qrRouter)

// Admin has no frontend in this repo by design - the admin site is separate.
app.use('/api/admin', adminRouter)

/**
 * Her growth chart, computed from her own orders.
 *
 * Scoped to the signed-in seller rather than to the id in the path: the id was
 * never checked, so any seller could read another woman's weekly earnings by
 * changing a number in the URL.
 */
app.get('/api/analytics/seller/:id/week', requireRole('seller'), (req, res) => {
  res.json({ week: sellerWeek(getDb(), req.auth!.sellerId!) })
})

/**
 * Wipes the database. Needs an explicit opt-in as well as a non-production
 * NODE_ENV, because gating on NODE_ENV alone fails OPEN: it is unset by
 * default on more hosts than not, and that left a public, unauthenticated
 * endpoint that destroys every seller, product and order.
 */
app.post('/api/dev/reset', (_req, res) => {
  if (!ALLOW_DEV_RESET) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  resetDb()
  res.json({ ok: true })
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

/**
 * The last line of defence, and it must not talk.
 *
 * `err.message` used to go straight to the client, which turns any unhandled
 * throw into an information leak - file paths, driver errors, occasionally a
 * fragment of a query. The full error is logged with a short id; the client
 * gets the id and nothing else, so a support conversation can still find the
 * exact incident in the log.
 */
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const ref = crypto.randomBytes(4).toString('hex')
  console.error(`[api] ${ref}`, err)

  const status = err.status ?? 500
  res.status(status).json({
    // A deliberate 4xx raised by our own code is safe to repeat back; anything
    // else is an internal failure and says nothing.
    error: status < 500 ? err.message : 'Server error',
    messageMr: 'काहीतरी चूक झाली. पुन्हा प्रयत्न करा.',
    ref,
  })
})

/**
 * The store must finish loading before the first request. Otherwise a handler
 * can read seed data and then persist it straight over a real Firestore.
 */
/**
 * Housekeeping the auth state needs to stay bounded.
 *
 * Dead sessions and expired rate-limit windows are both unbounded growth left
 * alone: one is a database collection that only ever gets bigger, the other is
 * a map holding an entry per phone number and address ever seen - which is not
 * only a leak but a list of everyone who has tried to use the platform sitting
 * in memory. `unref` so the timer never holds the process open at shutdown.
 */
function startHousekeeping(): void {
  const timer = setInterval(() => {
    sweepLimits()
    if (pruneSessions(getDb()) > 0) save()
    // Rejecting deletes the listing, so this only clears rows left by the
    // old 48-hour rule. A sweep, not a timer per product: timers do not
    // survive the next deploy.
    if (purgeRejected(getDb().products) > 0) save()
    // A closed account is erased a week after she asked, and the same
    // reasoning applies: the week almost always contains a deploy.
    if (sweepClosedAccounts(getDb()) > 0) save()
  }, 15 * 60 * 1000)
  timer.unref?.()
}

async function main() {
  await initStore()
  // Phone notifications go through the same Firebase project as the database.
  // Without Firestore (local development) the transport stays unset and every
  // send is a no-op.
  if (usingFirestore) setPushTransport(fcmTransport())
  // Admin decisions are written from six handlers; hearing them here means
  // none of them can forget to tell her. setImmediate runs it after the
  // handler has saved and replied.
  onNotice((seller, notice) => setImmediate(() => void notifyAdminNotice(getDb(), seller.id, notice)))
  // Listings rejected under the old 48-hour rule go now, before the first
  // request can be served one that should not exist. The archived rows are
  // tombstones from when deleting a product only stamped it:
  // nothing has read one since, and a collection that only grows is what makes
  // the database unreadable to the people who have to audit it.
  if (purgeRejected(getDb().products) + purgeArchived(getDb().products) > 0) save()
  // Accounts whose seven days ran out while the server was off are erased
  // before the first request, for the same reason: the promise was a date,
  // not an uptime.
  const closed = sweepClosedAccounts(getDb())
  if (closed > 0) {
    console.log(`[account] erased ${closed} closed account(s)`)
    save()
  }
  // Sellers from before the six-month rule have no end date; they get one
  // once, here, before the first request asks whether their shop is open.
  // Nothing is swept on a timer after that - expiry is read off the date.
  const terms = backfillSubscriptionTerms(getDb())
  if (terms > 0) {
    console.log(`[subscription] gave ${terms} existing seller(s) a six-month term`)
    save()
  }
  // Reviews from when a whole order got one rating become one per product.
  const split = splitOrderReviews(getDb())
  if (split > 0) {
    console.log(`[reviews] split ${split} order review(s) into per-product ratings`)
    save()
  }
  startHousekeeping()

  app.listen(PORT, () => {
    console.log(`\n  Shantai Mahila Bazar API   http://localhost:${PORT}/api/health`)
    console.log(`  Admin API      http://localhost:${PORT}/api/admin/*  (backend only)`)
    console.log(describeConfig())
    const admins = describeAdminState(getDb())
    if (admins) console.log(admins)
    console.log('')
  })
}

// Writes are coalesced over 400ms, so a shutdown mid-window would lose them.
// If Firestore is still refusing them (Spark's daily write limit), memory is
// the only copy and it goes with this process - say so, rather than exit as
// though everything had been saved.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void flush()
      .then((saved) => {
        if (!saved) {
          console.error('[firestore] shutting down with changes Firestore never accepted - they are LOST')
        }
      })
      .finally(() => process.exit(0))
  })
}

main().catch((err) => {
  console.error('\n  Failed to start:', (err as Error).message)
  process.exit(1)
})
