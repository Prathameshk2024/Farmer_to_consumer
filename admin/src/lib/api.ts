import type {
  AdminStats, Complaint, Order, Product, RatingSummary, ReadinessBand, Report, Review, Seller,
  SubscriptionPayment,
} from '@shared/types.js'
import type { SubscriptionView } from '@shared/subscription.js'

/**
 * The one seam between the console and the API.
 *
 * Same backend as the seller app - in development Vite proxies /api to
 * localhost:4000, in production VITE_API_URL points at the Cloud Run service.
 * Every call carries the admin bearer token; the API rejects anything else
 * with 401 at `adminRouter.use(requireRole('admin'))`.
 */

const BASE = import.meta.env.VITE_API_URL ?? ''
/** Exported so AuthContext can recognise it on a cross-tab `storage` event. */
export const TOKEN_KEY = 'wb.admin.token'

/**
 * The token lives in MEMORY; localStorage only carries it across a reload.
 *
 * Reading it back out of storage on every request made the whole console
 * depend on a write that can fail silently - blocked site data, private mode,
 * a full quota, a second tab that 401'd and cleared the key. The failure mode
 * was the worst one on offer: signed in on screen, because AuthContext holds
 * the session in React state, and no credentials on the wire, because
 * getToken() had nothing to read. Every panel answered 401 and the only cure
 * was a reload, which signed the seller out.
 */
let memoryToken: string | null = null

export function getToken(): string | null {
  if (memoryToken) return memoryToken
  try {
    memoryToken = localStorage.getItem(TOKEN_KEY)
  } catch {
    /* storage unavailable - memory is the source of truth anyway */
  }
  return memoryToken
}

export function setToken(token: string | null): void {
  memoryToken = token
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode - the session just will not survive a refresh */
  }
}

/**
 * A 401 means the session is genuinely dead, and the console has to ACT on it.
 *
 * Clearing localStorage on its own was not enough: React still held the
 * signed-in session, so the shell stayed up and every panel on it re-requested
 * with no token and got another 401 - a console that looks signed in and
 * answers nothing, until somebody thinks to reload. Published here, acted on
 * in AuthContext and nowhere else, the same way the seller app does it.
 */
type ExpiryListener = () => void
const expiryListeners = new Set<ExpiryListener>()

export function onSessionExpired(fn: ExpiryListener): () => void {
  expiryListeners.add(fn)
  return () => expiryListeners.delete(fn)
}

/**
 * Carries both languages. The API returns `error` in English and, on the
 * routes that matter, `messageMr` in Marathi; the console picks by the
 * language the admin is reading in rather than translating on the client.
 */
export class ApiError extends Error {
  status: number
  messageMr?: string

  constructor(status: number, body: { error?: string; messageMr?: string }) {
    super(body.error ?? 'Request failed')
    this.status = status
    this.messageMr = body.messageMr
  }

  /** The message to show, in the language on screen. */
  text(lang: string): string {
    return lang === 'mr' && this.messageMr ? this.messageMr : this.message
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()

  let res: Response
  try {
    res = await fetch(`${BASE}/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new ApiError(0, {
      error: 'Cannot reach the server',
      messageMr: 'सर्व्हरशी संपर्क होत नाही',
    })
  }

  // The server slides the session forward: past halfway through the idle
  // window it hands back a freshly stamped token. Swapping it in here is what
  // stops an active user being signed out on a timer.
  const refreshed = res.headers.get('X-Session-Token')
  if (refreshed) setToken(refreshed)

  const text = await res.text()
  let body: Record<string, unknown> = {}
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>
    } catch {
      // Not our API answering - usually the dev proxy reporting the backend
      // is down, which arrives as HTML with a 500.
      throw new ApiError(res.status, {
        error: `API did not respond (HTTP ${res.status})`,
        messageMr: 'सर्व्हरकडून उत्तर आले नाही',
      })
    }
  }

  // An expired or revoked session: drop the stored credentials so the next
  // render shows the sign-in screen instead of a shell full of failed panels.
  // Sessions expire on inactivity now, so this is a normal end, not an error.
  if (res.status === 401) {
    setToken(null)
    try {
      localStorage.removeItem('wb.admin.session')
    } catch {
      /* nothing to clean up */
    }
    for (const fn of expiryListeners) fn()
  }

  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

const get = <T,>(p: string) => request<T>(p)
const post = <T,>(p: string, body?: unknown) =>
  request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) })

/* ------------------------------------------------------------------ */
/* Shapes the admin endpoints return                                   */
/* ------------------------------------------------------------------ */

export interface AdminSession {
  token: string
  role: 'admin'
  /** The administrator's record id. What `verifiedBy` on a payment points at. */
  userId: string
  name: string
  email: string
}

/** The waiting time is computed from `submittedAt` here, so it can tick. */
export type PaymentRow = SubscriptionPayment
/** /admin/orders decorates each order with the seller's shop name and id. */
export type OrderRow = Order & { seller?: string; womenBizId?: string }
/** /admin/products decorates each listing with its seller and any open reports. */
export type ProductRow = Product & { seller?: Seller; reports?: Report[] }
/** /admin/reviews decorates each review with the seller's shop name and id. */
export type ReviewRow = Review & { seller?: string; womenBizId?: string; reports?: Report[] }
export type SellerRow = Seller & {
  productCount: number
  /** Delivered orders only, summed on the server. */
  earned?: number
  slots: { used: number; total: number }
  /** Where her six months stand, on the server's clock. */
  subscription?: SubscriptionView
}

/**
 * Everything one seller's page needs, in one answer.
 *
 * `earned` is computed on the server rather than summed here: it counts
 * delivered orders only, and that definition belongs next to the one the
 * impact report uses, not copied into a screen.
 */
export interface SellerDetail {
  seller: SellerRow
  products: ProductRow[]
  orders: OrderRow[]
  payments: SubscriptionPayment[]
  earned: number
  /** Hidden ones included and marked. */
  reviews: Review[]
  /** Visible reviews only - what her shop page shows. */
  rating: RatingSummary
}

export interface ImpactReport {
  generatedAt: string
  totals: {
    women: number
    activeWomen: number
    womenWithEarnings: number
    earned: number
    orders: number
    villages: number
  }
  byVillage: { code: string; village: string; women: number; earned: number }[]
  readiness: { womenBizId: string; village: string; score: number; band: ReadinessBand }[]
}

export const api = {
  signIn: (email: string, password: string) =>
    post<{ session: AdminSession }>('/auth/admin/login', { email, password }),

  /**
   * End the session on the server.
   *
   * An admin token approves payments and can read every buyer's home address,
   * and it is used on shared desks. Clearing localStorage alone left it valid
   * for the rest of its window.
   */
  logout: () => post<{ ok: true }>('/auth/logout'),

  stats: () =>
    get<{ stats: AdminStats; bandLabels: Record<string, unknown> }>('/admin/stats'),

  /** status: PENDING (default) | APPROVED | REJECTED | ALL */
  payments: (status = 'PENDING') =>
    get<{ payments: PaymentRow[] }>(`/admin/payments?status=${encodeURIComponent(status)}`),

  /** `checks` is what the admin compared; the server refuses an approval without all of them. */
  approvePayment: (id: string, checks: string[]) =>
    post<{ payment: SubscriptionPayment; seller?: Seller }>(`/admin/payments/${id}/approve`, { checks }),

  rejectPayment: (id: string, reason: string) =>
    post<{ payment: SubscriptionPayment }>(`/admin/payments/${id}/reject`, { reason }),

  /** status: PENDING (default) | LIVE | REJECTED | ALL */
  products: (status = 'PENDING') =>
    get<{ products: ProductRow[]; reportedCount: number }>(
      `/admin/products?status=${encodeURIComponent(status)}`,
    ),

  /** Looked at, and the listing stays up. The reports close; the row does not. */
  clearReports: (id: string) => post<{ ok: true }>(`/admin/products/${id}/clear-reports`, {}),

  moderateProduct: (id: string, approve: boolean, reason?: string) =>
    post<{ product: Product }>(`/admin/products/${id}/moderate`, { approve, reason }),

  /** What sellers and buyers wrote from Help & Training. A queue to empty. */
  complaints: (status = 'OPEN') =>
    get<{ complaints: Complaint[]; openCount: number }>(
      `/admin/complaints?status=${encodeURIComponent(status)}`,
    ),

  resolveComplaint: (id: string) =>
    post<{ complaint: Complaint }>(`/admin/complaints/${id}/resolve`, {}),

  sellers: () => get<{ sellers: SellerRow[] }>('/admin/sellers'),

  sellerDetail: (id: string) => get<SellerDetail>(`/admin/sellers/${id}`),

  grantSlots: (id: string, packs: number) =>
    post<{ seller: Seller }>(`/admin/sellers/${id}/grant-slots`, { packs }),

  /** Takes packs back. Refused by the server if it would drop her below the
   *  slots she is already using. */
  revokeSlots: (id: string, packs: number) =>
    post<{ seller: Seller }>(`/admin/sellers/${id}/revoke-slots`, { packs }),

  /** The reason is shown to her in her own app, so it is not optional noise. */
  blockSeller: (id: string, blocked: boolean, reason?: string) =>
    post<{ seller: Seller }>(`/admin/sellers/${id}/block`, { blocked, reason }),

  orders: (params: { status?: string; sellerId?: string; pincode?: string } = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
    const s = qs.toString()
    return get<{ orders: OrderRow[] }>(`/admin/orders${s ? `?${s}` : ''}`)
  },

  impact: () => get<ImpactReport>('/admin/impact'),

  /** Every review, hidden ones included. `maxRating: 2` is the low-ratings view. */
  reviews: (
    params: { sellerId?: string; maxRating?: number; hidden?: boolean; reported?: boolean } = {},
  ) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v))
    const s = qs.toString()
    return get<{ reviews: ReviewRow[]; summary: RatingSummary; reportedCount: number }>(
      `/admin/reviews${s ? `?${s}` : ''}`,
    )
  },

  /** Looked at, and the review stays up. */
  clearReviewReports: (id: string) => post<{ ok: true }>(`/admin/reviews/${id}/clear-reports`, {}),

  /** Take a review down (reason required, and kept) or put it back. */
  hideReview: (id: string, hidden: boolean, reason?: string) =>
    post<{ review: Review }>(`/admin/reviews/${id}/hide`, { hidden, reason }),
}
