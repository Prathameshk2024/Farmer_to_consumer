import type {
  Address, Category, Customer, Order, Product,
  ProductRatingInput, PublicReview, PublicFarmer, RatingSummary, Review, Farmer, FarmerGroup, Fulfilment,
  FarmerWeek, Session,
} from '@shared/types.js'
import type { ReportReason, ReportTarget } from '@shared/report.js'
import type { FdriAnswers } from '@shared/fdri.js'
import type { ComplaintSubject } from '@shared/complaint.js'

/**
 * The single seam between the app and the server.
 *
 * No screen calls fetch directly. In development Vite proxies /api to
 * localhost:4000; the deployed build - which is also what the Android APK
 * loads - has no dev server to proxy through, so VITE_API_URL points at the API.
 */

const BASE = import.meta.env.VITE_API_URL ?? ''
const TOKEN_KEY = 'wb.token'

/**
 * A full API address for something the phone opens rather than fetches - a
 * file handed to Android's downloader. Still the one place that knows where
 * the API lives.
 */
export function apiUrl(path: string, query: Record<string, string> = {}): string {
  const qs = new URLSearchParams(query).toString()
  return `${BASE}/api${path}${qs ? `?${qs}` : ''}`
}

/**
 * In memory first; localStorage only carries the token across a reload.
 *
 * A phone with site data blocked - or simply full - made every write here a
 * no-op, and reading the token back out of storage on every request turned
 * that into: the farmer's shop on screen, no token on the wire, and a 401 on
 * the first thing they tapped. Memory is the source of truth, storage is the
 * backup.
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
    /* private mode - the session just won't survive a refresh */
  }
}

/**
 * TWO THINGS THE SESSION HAS TO TELL THE APP
 * ==========================================
 * `wb.token` is what this module sends; `wb.session` (in AuthContext) is what
 * survives a reload and decides which screens render. They have to agree, and
 * for a long time they did not:
 *
 *  - the server slides the idle window by handing back a fresh token on
 *    `X-Session-Token`. That landed in `wb.token` only. On the next reload
 *    AuthContext wrote the ORIGINAL token back over it, so the window never
 *    actually slid and a farmer was signed out exactly seven days after login
 *    however much she had used the app in between;
 *  - a 401 cleared `wb.token` and left `wb.session` sitting there, so the UI
 *    still believed she was signed in while every request failed.
 *
 * So the two events that change a session are published here, and AuthContext
 * is the one place that acts on them. Nothing else clears a session - not a
 * back press, not a reload, not opening /farmer again.
 */
type TokenListener = (token: string) => void
type ExpiryListener = () => void

const refreshListeners = new Set<TokenListener>()
const expiryListeners = new Set<ExpiryListener>()
const mustChangeListeners = new Set<ExpiryListener>()

/** The server re-stamped the session. Returns an unsubscribe. */
export function onTokenRefresh(fn: TokenListener): () => void {
  refreshListeners.add(fn)
  return () => refreshListeners.delete(fn)
}

/** The server rejected the token: it is genuinely dead. Returns an unsubscribe. */
export function onSessionExpired(fn: ExpiryListener): () => void {
  expiryListeners.add(fn)
  return () => expiryListeners.delete(fn)
}

/**
 * The server says this session may only change its password (an admin reset
 * it). AuthContext marks the session, and the router sends her to /password.
 */
export function onMustChangePassword(fn: ExpiryListener): () => void {
  mustChangeListeners.add(fn)
  return () => mustChangeListeners.delete(fn)
}

/** Thrown for any non-2xx. Carries the Marathi message and per-field errors. */
export class ApiError extends Error {
  status: number
  messageMr?: string
  fields?: Record<string, string>
  /**
   * The whole answer, for the failures that carry more than a sentence -
   * `openOrders` on a refused account closure, which the screen turns into a
   * list of orders to go and finish rather than a message to read.
   */
  body: Record<string, unknown>

  constructor(status: number, body: { error?: string; messageMr?: string; fields?: Record<string, string> }) {
    super(body.error ?? 'Request failed')
    this.status = status
    this.messageMr = body.messageMr
    this.fields = body.fields
    this.body = body as Record<string, unknown>
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })

  // The server slides the session forward: past halfway through the idle
  // window it hands back a freshly stamped token. Swapping it in here is what
  // stops an active user being signed out on a timer.
  const refreshed = res.headers.get('X-Session-Token')
  if (refreshed && refreshed !== token) {
    setToken(refreshed)
    for (const fn of refreshListeners) fn(refreshed)
  }

  const text = await res.text()

  /**
   * An EMPTY 5xx is not our API answering badly - every failure it raises
   * carries { error, messageMr, ref }. It is the Vite dev proxy giving up on
   * localhost:4000, which it reports as a 500 with no body at all, and that
   * reached the screen as the meaningless "Request failed".
   */
  if (!text && !res.ok && res.status >= 500) {
    throw new ApiError(res.status, {
      error: `API did not respond (HTTP ${res.status}) - is the backend running on :4000?`,
      messageMr: 'सर्व्हरशी संपर्क होत नाही. थोड्या वेळाने पुन्हा प्रयत्न करा.',
    })
  }

  let body: Record<string, unknown> = {}
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>
    } catch {
      // A non-JSON body means something other than our API answered - almost
      // always the Vite dev proxy reporting that the backend is not running,
      // which arrives as a 500 with an HTML body. Without this branch the
      // JSON.parse throws and the real status is lost behind "Network error".
      throw new ApiError(res.status, {
        error: `API did not respond (HTTP ${res.status}) - is the backend running on :4000?`,
        messageMr: 'सर्व्हरशी संपर्क होत नाही. थोड्या वेळाने पुन्हा प्रयत्न करा.',
      })
    }
  }

  // 401 means the SERVER rejected this token - expired, or signed with a
  // different secret. `requireRole` answers 403 for the wrong role, so this is
  // never "not allowed here"; it is "there is no session any more". Telling
  // AuthContext is the only way she gets back to the phone screen instead of
  // tapping a shop that answers 401 to everything.
  if (res.status === 401 && token) {
    setToken(null)
    for (const fn of expiryListeners) fn()
  }

  if (res.status === 403 && body.code === 'MUST_CHANGE_PASSWORD') {
    for (const fn of mustChangeListeners) fn()
  }

  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

const get = <T,>(p: string) => request<T>(p)
const post = <T,>(p: string, body?: unknown) =>
  request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) })
const patch = <T,>(p: string, body: unknown) =>
  request<T>(p, { method: 'PATCH', body: JSON.stringify(body) })
const del = <T,>(p: string) => request<T>(p, { method: 'DELETE' })

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const api = {
  /** Phone and password. `mustChangePassword` after an admin reset. */
  login: (phone: string, password: string, role: 'farmer' | 'customer') =>
    post<{ session: Session; mustChangePassword: boolean }>('/auth/login', { phone, password, role }),

  changePassword: (current: string, next: string) =>
    post<{ ok: true }>('/auth/password', { current, next }),

  registerCustomer: (body: { phone: string; name: string; password: string }) =>
    post<{ session: Session }>('/customers/register', body),

  /** Public. The same answer whether or not the number has an account. */
  requestPasswordReset: (body: { role: 'farmer' | 'customer'; phone: string; name: string; village?: string }) =>
    post<{ ok: true }>('/auth/password-requests', body),

  /**
   * End the session on the SERVER, not just in this browser.
   *
   * Logging out used to clear localStorage and nothing else, which left the
   * token valid for its whole window - so signing out on a borrowed phone did
   * not sign you out of anything.
   */
  logout: () => post<{ ok: true }>('/auth/logout'),

  /** Devices this account is signed in on. Never anybody else's. */
  sessions: () =>
    get<{
      sessions: {
        id: string
        client?: string
        createdAt: string
        lastSeenAt: string
        current: boolean
      }[]
    }>('/auth/sessions'),

  endSession: (id: string) => del<{ ok: true }>(`/auth/sessions/${id}`),

  /* ---------------- farmer ---------------- */

  registerFarmer: (body: FarmerRegistration) =>
    post<{ farmer: Farmer; session: Session }>('/farmers/register', body),

  me: () => get<{ farmer: Farmer }>('/farmers/me'),

  /** `pickup: null` turns pickup off. */
  updateMe: (patchBody: Partial<Omit<Farmer, 'pickup'>> & { pickup?: Farmer['pickup'] | null }) =>
    patch<{ farmer: Farmer }>('/farmers/me', patchBody),
  /** The farm on the map, set by an explicit tap, or cleared. */
  setMyLocation: (body: { lat: number; lng: number } | { clear: true }) =>
    patch<{ farmer: Farmer }>('/farmers/me/location', body),

  /** Her buyers, derived from her own orders. Never anybody else's. */
  myBuyers: () => get<{ buyers: FarmerBuyer[] }>('/farmers/me/buyers'),

  farmerById: (id: string) => get<{ farmer: PublicFarmer }>(`/farmers/${id}`),

  /* ---------------- products ---------------- */

  myProducts: () =>
    get<{ products: Product[] }>('/products/mine'),

  createProduct: (body: Partial<Product> & { asDraft?: boolean }) =>
    post<{ product: Product }>('/products', body),

  updateProduct: (id: string, body: Partial<Product>) =>
    patch<{ product: Product }>(`/products/${id}`, body),

  /** Any of his own listings - a sold-out crop is his to take down. */
  deleteProduct: (id: string) => del<{ ok: true }>(`/products/${id}`),

  /* ---------------- catalog (public) ---------------- */

  categories: () => get<{ categories: Category[] }>('/catalog/categories'),

  catalog: (params: { categoryId?: string; q?: string; pincode?: string; farmerId?: string } = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
    const s = qs.toString()
    return get<{ products: CatalogProduct[] }>(
      `/catalog/products${s ? `?${s}` : ''}`,
    )
  },

  /** `farmer` is the public card only - never her phone. See db/publicFarmer.ts. */
  product: (id: string) => get<{ product: CatalogProduct; farmer?: PublicFarmer }>(`/catalog/products/${id}`),

  /** What buyers said about one product. Public, as far as the product is. */
  productReviews: (id: string) =>
    get<{ reviews: PublicReview[]; summary: RatingSummary }>(`/catalog/products/${id}/reviews`),

  /** A scanned QR. Unlike `product`, the farmer's phone is on it - the farmer printed the code. */
  trace: (id: string) =>
    get<{ product: CatalogProduct; farmer: PublicFarmer & { phone: string } }>(`/catalog/products/${id}/trace`),

  /** Is this pincode covered by any open farmer? Derived, never a static list. */
  serviceability: (pincode: string) =>
    get<{
      pincode: string
      serviceable: boolean
      farmerCount: number
      productCount: number
      nearbyVillages: string[]
    }>(`/catalog/serviceability?pincode=${encodeURIComponent(pincode)}`),

  /* ---------------- her own record ---------------- */

  /**
   * Her customer record, addresses included. Created empty on first call.
   *
   * This replaced `addresses()`, which hit an unauthenticated endpoint and
   * returned the same two seeded addresses to everybody.
   */
  customerMe: () => get<{ customer: Customer }>('/customers/me'),

  updateCustomerMe: (name: string) => patch<{ customer: Customer }>('/customers/me', { name }),

  addAddress: (body: AddressInput) =>
    post<{ address: Address }>('/customers/me/addresses', body),

  updateAddress: (id: string, body: Partial<AddressInput>) =>
    patch<{ address: Address }>(`/customers/me/addresses/${id}`, body),

  deleteAddress: (id: string) => del<{ ok: true }>(`/customers/me/addresses/${id}`),

  /* ---------------- closing an account ---------------- */

  /**
   * Delete this account. Both routes answer 409 with `openOrders` while an
   * order is still in flight, which is a thing to finish rather than an error
   * to report - the sheet says so and names them.
   *
   * The farmer's is reversible for a week (`closingAt`); the buyer's is not.
   */
  closeFarmerAccount: (body: { reason: string; note?: string; confirm: string }) =>
    post<{ ok: true; closingAt: string }>('/farmers/me/close', body),

  restoreFarmerAccount: () => post<{ farmer: Farmer }>('/farmers/me/restore'),

  closeCustomerAccount: (confirm: string) =>
    post<{ ok: true }>('/customers/me/close', { confirm }),

  /* ---------------- orders ---------------- */

  /**
   * `toRate` comes back for a customer only: her delivered orders still
   * waiting for a rating, newest first. The app does not let her past them.
   */
  myOrders: () => get<{ orders: Order[]; toRate?: string[] }>('/orders/mine'),

  /**
   * `reviews` is one per rated product: the buyer's own in full (so a hidden
   * one can say so), the public copies for the farmer, hidden ones left out.
   */
  order: (id: string) =>
    get<{ order: Order; farmer?: Partial<Farmer>; reviews: (Review | PublicReview)[] }>(`/orders/${id}`),

  /** Every product on a delivered order, rated at once - given, or given again. */
  reviewOrder: (id: string, ratings: ProductRatingInput[]) =>
    post<{ reviews: Review[] }>(`/orders/${id}/review`, { ratings }),

  /**
   * Every visible review of her products, each naming the product, and the
   * rating buyers see on her card - her products' ratings taken together.
   */
  myReviews: () => get<{ reviews: PublicReview[]; summary: RatingSummary }>('/farmers/me/reviews'),

  placeOrders: (body: {
    /** Left out for pickup: the farmer's pickup place is the address. */
    address?: { line: string; landmark?: string; pincode: string }
    groups: FarmerGroup[]
    paymentMode: 'COD' | 'UPI'
    fulfilment?: Fulfilment
    customerName?: string
  }) => post<{ orders: Order[]; groupId: string }>('/orders', body),

  advanceOrder: (
    id: string,
    to: Order['status'],
    extra?: { reason?: string; deliveryEstimate?: string },
  ) =>
    post<{ order: Order }>(`/orders/${id}/advance`, { to, ...extra }),

  /**
   * Something has gone wrong and she needs a person. Recorded against her
   * account, so an admin can open it and answer - see complaints.routes.ts.
   */
  raiseComplaint: (body: { subject: ComplaintSubject; message: string }) =>
    post<{ ok: true }>('/complaints', body),

  /**
   * Her number, so a buyer can ask what delivery costs before she commits to
   * an order. Fetched on the tap, never carried in the catalogue - see the
   * route's comment for why.
   */
  farmerContact: (farmerId: string) =>
    get<{ phone: string; whatsapp: string }>(`/catalog/farmers/${farmerId}/contact`),

  /**
   * A buyer flagging a listing or a review. One report per person per thing;
   * a second tap is answered as if it were the first.
   */
  report: (body: {
    targetType: ReportTarget
    targetId: string
    reason: ReportReason
    note?: string
  }) => post<{ ok: true }>('/reports', body),

  /** The buyer paying, after the farmer has accepted. */
  payOrder: (id: string, utr: string) =>
    post<{ order: Order }>(`/orders/${id}/pay`, { utr }),

  confirmPayment: (id: string) => post<{ order: Order }>(`/orders/${id}/confirm-payment`),

  /** Either side calling an order off; the server knows which from the session. */
  cancelOrder: (id: string, reason: string, note?: string) =>
    post<{ order: Order }>(`/orders/${id}/cancel`, { reason, note }),

  /* ---------------- analytics ---------------- */

  farmerWeek: (id: string) => get<{ week: FarmerWeek | null }>(`/analytics/farmer/${id}/week`),
}

/** A product as the catalogue sends it: its farmer's public card and its own stars. */
export type CatalogProduct = Product & {
  farmer?: PublicFarmer
  /** Worked out from reviews on every request; 0 with none. */
  rating?: number
  ratingCount?: number
}

/** One row of the farmer's "My Buyers" screen. Derived server-side. */
export interface FarmerBuyer {
  customerId: string
  name: string
  phone: string
  orderCount: number
  totalSpent: number
  lastOrderAt: string
  lastAddress: string
  pincode: string
}

export interface AddressInput {
  label?: string
  line: string
  landmark?: string
  pincode: string
  isDefault?: boolean
}

export interface FarmerRegistration {
  phone: string
  password: string
  name: string
  whatsapp?: string
  village: string
  taluka: string
  district: string
  pincode: string
  about?: string
  upiId: string
  lat?: number
  lng?: number
  locationConsent?: boolean
  crops: string[]
  ageGroup?: string
  education?: string
  landholding?: string
  farmerTypes: string[]
  sellingChannels: string[]
  problems: string[]
  fdri: FdriAnswers
  dispatch?: Farmer['dispatch']
}
