/**
 * Credentials and feature switches, read from the environment only.
 *
 * Nothing here is ever committed. Copy backend/.env.example to backend/.env
 * and fill it in; .env is already gitignored.
 *
 * Every integration degrades instead of crashing: with no Firebase the app
 * persists to backend/data/db.json exactly as before, and with no Cloudinary
 * the product wizard falls back to the emoji picker. That matters because you
 * should be able to clone this repo and run it without any accounts at all.
 */

import type { AdminPaymentAccount } from '@shared/types.js'
import {
  demoProvider, msg91Provider, msg91WidgetProvider,
  type Msg91Config, type Msg91WidgetConfig, type OtpProvider,
} from './services/otp.providers.js'

function firstOf(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n]
    if (v && v.trim()) return v.trim()
  }
  return undefined
}

/* ------------------------------------------------------------------ */
/* Firebase / Firestore                                                */
/* ------------------------------------------------------------------ */

export interface FirebaseConfig {
  projectId: string
  /**
   * Absent under Application Default Credentials, where the identity comes
   * from the gcloud login on this machine rather than from a stored key.
   */
  clientEmail?: string
  privateKey?: string
  databaseId?: string
}

/**
 * A whole service account JSON, raw or base64, as the three fields we use.
 * Exported because the backup script reads its targets' keys the same way -
 * two parsers for one shape is how a key that works live fails in a backup.
 */
export function parseServiceAccount(
  raw: string,
): { projectId: string; clientEmail: string; privateKey: string } | null {
  try {
    const json = JSON.parse(
      // Some dashboards store it base64-encoded.
      raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'),
    ) as Record<string, string>
    if (json.project_id && json.client_email && json.private_key) {
      return {
        projectId: json.project_id,
        clientEmail: json.client_email,
        privateKey: json.private_key.replace(/\\n/g, '\n'),
      }
    }
  } catch {
    // Reported by the caller, which knows which variable it came from.
  }
  return null
}

function readFirebase(): FirebaseConfig | null {
  const databaseId = firstOf('FIRESTORE_DATABASE_ID')

  // A real service account always wins over the gcloud login below. Otherwise
  // a leftover FIREBASE_USE_ADC=true from local development would silently
  // shadow the key on a deployed server, and production would be running on
  // somebody's personal Google account without anyone noticing.
  //
  // Two accepted shapes: the three separate fields, or the whole service
  // account JSON in one variable (which is what most hosts hand you).
  const raw = firstOf('FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_SERVICE_ACCOUNT_JSON')
  if (raw) {
    const account = parseServiceAccount(raw)
    if (account) return { ...account, databaseId }
    console.warn('[config] FIREBASE_SERVICE_ACCOUNT is not valid JSON or base64 JSON')
  }

  const projectId = firstOf('FIREBASE_PROJECT_ID')
  const clientEmail = firstOf('FIREBASE_CLIENT_EMAIL')
  // Private keys carry newlines. In a .env they arrive as literal \n.
  const privateKey = firstOf('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n')

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey, databaseId }
  }

  // Last resort: Application Default Credentials, from
  // `gcloud auth application-default login`. That signs in as a HUMAN Google
  // account and caches the token outside the repo, so there is no key to store
  // - only the project id.
  //
  // Opt-in rather than automatic, because a bare FIREBASE_PROJECT_ID on a
  // machine with no gcloud install would otherwise send boot down this path
  // and fail, when falling back to the JSON file is the friendlier answer.
  //
  // DEVELOPMENT ONLY. A deployed server has no human to log in, and the token
  // expires; production needs one of the two service account shapes above.
  if (/^(1|true|yes)$/i.test(firstOf('FIREBASE_USE_ADC') ?? '')) {
    if (!projectId) {
      console.warn('[config] FIREBASE_USE_ADC is set but FIREBASE_PROJECT_ID is empty')
      return null
    }
    // Not IS_PROD: that is declared below, and readFirebase() runs first.
    if (process.env.NODE_ENV === 'production') {
      console.warn('[config] FIREBASE_USE_ADC in production - use a service account instead')
    }
    return { projectId, databaseId }
  }

  return null
}

export const firebase = readFirebase()
export const usingFirestore = firebase !== null
/** True when credentials come from the gcloud login rather than from a key. */
export const usingAdc = firebase !== null && !firebase.clientEmail

/* ------------------------------------------------------------------ */
/* Cloudinary                                                          */
/* ------------------------------------------------------------------ */

export interface CloudinaryConfig {
  cloudName: string
  apiKey: string
  apiSecret: string
  folder: string
}

/**
 * Accepts either CLOUDINARY_URL (`cloudinary://key:secret@cloud`) or the three
 * fields separately. The URL form is what Cloudinary's dashboard gives you.
 */
/** `cloudinary://key:secret@cloud`. Exported for the backup script's targets. */
export function parseCloudinaryUrl(url: string, folder: string): CloudinaryConfig | null {
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url.trim())
  if (!m) return null
  return {
    apiKey: m[1]!,
    apiSecret: m[2]!,
    cloudName: m[3]!.replace(/\/.*$/, ''),
    folder,
  }
}

function readCloudinary(): CloudinaryConfig | null {
  const folder = firstOf('CLOUDINARY_FOLDER') ?? 'shanta-mahila-bazar'
  const url = firstOf('CLOUDINARY_URL')

  if (url) {
    const parsed = parseCloudinaryUrl(url, folder)
    if (parsed) return parsed
    console.warn('[config] CLOUDINARY_URL is malformed; expected cloudinary://key:secret@cloud')
  }

  const cloudName = firstOf('CLOUDINARY_CLOUD_NAME')
  const apiKey = firstOf('CLOUDINARY_API_KEY')
  const apiSecret = firstOf('CLOUDINARY_API_SECRET')
  if (cloudName && apiKey && apiSecret) return { cloudName, apiKey, apiSecret, folder }

  return null
}

export const cloudinary = readCloudinary()
export const usingCloudinary = cloudinary !== null

/* ------------------------------------------------------------------ */
/* Everything else                                                     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Session signing                                                     */
/* ------------------------------------------------------------------ */

/**
 * The key session tokens are signed with. Sessions carry a customer id, and a
 * customer id now unlocks her saved home addresses - so an unsigned token
 * would let anyone read anyone's address by editing a base64 string.
 *
 * Development gets a fixed fallback so the repo still runs with no .env at
 * all. Production does not: booting with a known key would be the same as
 * having no signature.
 */
function readSessionSecret(): string {
  const secret = firstOf('SESSION_SECRET')
  if (secret) return secret

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET is required in production. Generate one with:\n' +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    )
  }
  console.warn('[config] SESSION_SECRET is not set - using the development key')
  return 'dev-only-insecure-session-secret'
}

export const SESSION_SECRET = readSessionSecret()

/**
 * Whether an EMPTY database should be filled with the demo sellers and
 * products in seed.ts.
 *
 * Off unless asked for. It used to be automatic, which is right for a fresh
 * clone and badly wrong for a live one: customers would be shown three
 * invented women and eleven invented products alongside the real ones, and a
 * single empty read would be enough to put them there.
 */
export const SEED_DEMO_DATA = /^(1|true|yes)$/i.test(firstOf('SEED_DEMO_DATA') ?? '')

/* ------------------------------------------------------------------ */
/* CORS                                                                */
/* ------------------------------------------------------------------ */

/**
 * Which browser origins may call this API.
 *
 * Two front ends share one backend - the seller/customer app and the admin
 * site, deployed separately - so this has to be a LIST. An environment
 * variable is a single string, and handing
 * "https://a.vercel.app,https://b.vercel.app" straight to `cors()` makes it one
 * literal origin that matches neither, blocking both sites at once.
 *
 * Unset means "any origin", which is what lets a fresh clone run with no
 * configuration at all. In production that is too open, so index.ts warns.
 */
export function parseCorsOrigin(raw: string | undefined): string[] | true {
  const trimmed = raw?.trim()
  if (!trimmed || trimmed === '*') return true

  const origins = trimmed
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, '')) // an Origin header carries no path
    .filter(Boolean)

  return origins.length > 0 ? origins : true
}

export const CORS_ORIGIN = parseCorsOrigin(process.env.CORS_ORIGIN)

export const PORT = Number(process.env.PORT ?? 4000)
export const IS_PROD = process.env.NODE_ENV === 'production'

/* ------------------------------------------------------------------ */
/* OTP delivery                                                        */
/* ------------------------------------------------------------------ */

/**
 * Which channel carries the code.
 *
 * Demo mode returns the code in the HTTP response so the app is walkable with
 * no SMS account. That is fine on a laptop and unacceptable on the internet -
 * a code in a response body is a code anyone can read - so production refuses
 * it outright rather than warning about it. This used to be a warning, and the
 * warning was ignored for as long as the project has existed.
 *
 * Two MSG91 shapes, and which one you have depends on DLT:
 *
 *  - WIDGET (MSG91_WIDGET_ID): no DLT registration needed, because the
 *    template and sender are MSG91's. The browser runs their widget and this
 *    server exchanges the resulting token for the verified number.
 *  - PLAIN SENDER (MSG91_TEMPLATE_ID): needs your own DLT-approved template.
 *    We generate the code and keep expiry, attempt cap and single use.
 *
 * The widget wins when both are set, because it is the one that works without
 * a DLT registration. See services/otp.providers.ts.
 */
export interface OtpSettings {
  demo: boolean
  msg91: Msg91Config | null
  widget: Msg91WidgetConfig | null
}

function readOtp(): OtpSettings {
  const authKey = firstOf('MSG91_AUTH_KEY')
  const templateId = firstOf('MSG91_TEMPLATE_ID')
  const widgetId = firstOf('MSG91_WIDGET_ID')

  if (authKey && widgetId) {
    return { demo: false, msg91: null, widget: { authKey, widgetId } }
  }

  if (authKey && templateId) {
    return {
      demo: false,
      msg91: { authKey, templateId, sender: firstOf('MSG91_SENDER') ?? 'WMNBIZ' },
      widget: null,
    }
  }

  if (widgetId && !authKey) {
    console.warn('[config] MSG91_WIDGET_ID needs MSG91_AUTH_KEY too - falling back')
  } else if (authKey || templateId) {
    console.warn('[config] MSG91 needs BOTH MSG91_AUTH_KEY and MSG91_TEMPLATE_ID - falling back')
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'No SMS provider is configured, and demo OTP cannot run in production - it returns\n' +
        '  the login code in the HTTP response, so anyone could sign in as anyone.\n' +
        '  Set MSG91_AUTH_KEY and MSG91_WIDGET_ID (the widget - no DLT registration\n' +
        '  needed), or MSG91_AUTH_KEY and MSG91_TEMPLATE_ID for your own DLT template.\n' +
        '  Or run with NODE_ENV unset.',
    )
  }

  return { demo: true, msg91: null, widget: null }
}

export const OTP = readOtp()

/** Built once, on first use, so importing config does not open a connection. */
let provider: OtpProvider | null = null

export function otpProvider(): OtpProvider {
  if (!provider) {
    provider = OTP.widget
      ? msg91WidgetProvider(OTP.widget)
      : OTP.msg91
        ? msg91Provider(OTP.msg91)
        : demoProvider()
  }
  return provider
}

/* ------------------------------------------------------------------ */
/* The first administrator                                             */
/* ------------------------------------------------------------------ */

/**
 * A HASH, never a password.
 *
 * ADMIN_PASSWORD used to hold a plaintext password that defaulted to
 * `changeme`. This replaces it, and the difference is not cosmetic: anyone who
 * can read the environment - a log of the deploy config, a screenshot of the
 * Cloud Run console, a leaked backup - previously got the password itself.
 *
 * It only works while there is no administrator at all. The first successful
 * sign-in writes a real record and this path closes for good. See
 * auth/admins.ts for the whole story.
 *
 * Generate one with:  npm run admin:users hash
 */
export interface AdminBootstrap {
  email: string
  name: string
  passwordHash: string
}

function readAdminBootstrap(): AdminBootstrap | null {
  const email = firstOf('ADMIN_BOOTSTRAP_EMAIL')
  const passwordHash = firstOf('ADMIN_BOOTSTRAP_PASSWORD_HASH')
  if (!email || !passwordHash) return null

  if (!passwordHash.startsWith('scrypt$')) {
    console.warn(
      '[config] ADMIN_BOOTSTRAP_PASSWORD_HASH is not a scrypt hash. It must be the output of ' +
        '`npm run admin hash`, not a password. Ignoring it.',
    )
    return null
  }

  return { email, name: firstOf('ADMIN_BOOTSTRAP_NAME') ?? email, passwordHash }
}

export const ADMIN_BOOTSTRAP = readAdminBootstrap()

/**
 * `/api/dev/reset` wipes the database.
 *
 * It used to be gated on NODE_ENV alone, which fails open: a host where
 * NODE_ENV is simply unset - the default on more platforms than not - left a
 * public, unauthenticated endpoint that destroys every seller, product and
 * order. Now it needs an explicit opt-in as well, so forgetting a variable
 * closes the door instead of opening it.
 */
export const ALLOW_DEV_RESET =
  !IS_PROD && /^(1|true|yes)$/i.test(firstOf('ALLOW_DEV_RESET') ?? '')

/**
 * Lets one write delete more than half of a collection.
 *
 * Off, and it stays off in production too - unlike ALLOW_DEV_RESET, because
 * the one time this mattered it mattered on the live database. `purge:demo`
 * and any other deliberate clear-out is expected to set it for that one run:
 *
 *   ALLOW_BULK_DELETE=true npm run purge:demo -- --commit
 *
 * See the dead-man's switch in db/firestore.ts for what it turns off, and why
 * that guard exists at all.
 */
export const ALLOW_BULK_DELETE = /^(1|true|yes)$/i.test(firstOf('ALLOW_BULK_DELETE') ?? '')

/**
 * WHERE THE ₹50 GOES.
 *
 * Read from the environment, defaulting to the programme's own account,
 * because this is the one string in the app that moves real money and it can
 * be wrong in a way nothing downstream can catch: the QR is generated FROM it,
 * so a typo makes a perfectly scannable code that pays a stranger, and the
 * woman who paid holds a valid UTR for a transaction the programme never saw.
 *
 * It used to live in `db/seed.ts`, invented alongside three invented sellers.
 * Env-readable so the account can be changed on the host without a deploy -
 * a college treasurer changing banks is not a code change.
 *
 * No account number or IFSC: she pays by UPI, those two lines were never used,
 * and a wrong A/C number printed under a QR is worse than none.
 */
export const ADMIN_PAYMENT_ACCOUNT: AdminPaymentAccount = {
  // As PRINTED on the poster in her hand, so she can check it against the name
  // her own UPI app shows after scanning.
  label: firstOf('ADMIN_UPI_NAME') ?? 'PRIN.JAWAHAR ARTS.SC.COM.',
  upiId: firstOf('ADMIN_UPI_ID') ?? 'jasccollegeandur@sbi',
  bankName: firstOf('ADMIN_BANK_NAME') ?? 'State Bank of India',
}

export function describeConfig(): string {
  const lines = [
    `  Database       ${
      usingFirestore
        ? `Firestore (${firebase!.projectId})${usingAdc ? ' via gcloud login' : ''}`
        : 'JSON file (backend/data/db.json)'
    }`,
    `  Images         ${usingCloudinary ? `Cloudinary (${cloudinary!.cloudName})` : 'off - emoji only'}`,
    `  OTP            ${otpProvider().name}`,
    `  Push           ${usingFirestore ? 'Firebase Cloud Messaging' : 'off'}`,
    `  CORS           ${CORS_ORIGIN === true ? 'any origin' : CORS_ORIGIN.join(', ')}`,
  ]
  if (IS_PROD && CORS_ORIGIN === true) {
    lines.push('  ⚠  CORS_ORIGIN is unset - any website can call this API from a browser.')
  }
  if (ALLOW_DEV_RESET) {
    lines.push('  ⚠  ALLOW_DEV_RESET is on - POST /api/dev/reset will wipe the database.')
  }
  return lines.join('\n')
}
