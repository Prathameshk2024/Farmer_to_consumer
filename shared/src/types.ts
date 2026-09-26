/**
 * Types shared by the frontend and the backend.
 *
 * This folder is the single source of truth for anything that crosses the
 * wire. Both tsconfigs alias it to `@shared/*`, so a change here is a compile
 * error on whichever side has not caught up - which is the whole reason this
 * project is in TypeScript.
 */

import type { FdriAnswers, FdriBand } from './fdri.js'
import type { Unit, Cultivation } from './produce.js'
import type { AgeGroup, Education, FarmerType, Landholding, SellingChannel, SellingProblem } from './profile.js'

/* ------------------------------------------------------------------ */
/* Roles & auth                                                        */
/* ------------------------------------------------------------------ */

export type Role = 'farmer' | 'customer' | 'admin'

export interface Session {
  token: string
  role: Role
  userId: string
  phone?: string
  name?: string
  /** Present only for farmers. */
  farmerId?: string
  /** Present only for customers. */
  customerId?: string
  /** An admin reset the password: the user must choose a new one before anything else. */
  mustChangePassword?: boolean
}

/* ------------------------------------------------------------------ */
/* Order lifecycle                                                     */
/* ------------------------------------------------------------------ */

export type OrderStatus =
  | 'PLACED'
  | 'ACCEPTED'
  | 'PACKED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED'

export type PaymentMode = 'COD' | 'UPI'

/**
 * How the goods reach the buyer. Pickup has no road trip: PACKED means "ready
 * at the farm" and the next step is the buyer collecting it. Absent on an old
 * order, which reads as delivery.
 */
export type Fulfilment = 'delivery' | 'pickup'

export type PaymentStatus =
  | 'COD_PENDING'
  | 'COD_COLLECTED'
  /** Accepted or not yet: a UPI order the buyer has not paid for. */
  | 'UPI_PENDING'
  | 'UPI_SUBMITTED'
  | 'UPI_CONFIRMED'

export interface OrderEvent {
  to: OrderStatus
  at: string
  by: 'customer' | 'farmer' | 'admin' | 'system'
  note?: string
  /**
   * On a CANCELLED event, the code from `orderCancel.ts` - stored as a code so
   * each reader sees it in their own language. `note` then carries the words
   * only when the code is "other".
   */
  reason?: string
}

export interface OrderItem {
  productId: string
  name: string
  emoji: string
  qty: number
  price: number
}

export interface Order {
  id: string
  groupId?: string
  farmerId: string
  customerId: string
  customerName: string
  customerPhone: string
  address: string
  landmark?: string
  pincode: string
  items: OrderItem[]
  itemsTotal: number
  deliveryFee: number
  total: number
  paymentMode: PaymentMode
  paymentStatus: PaymentStatus
  paymentUtr?: string
  /** Absent reads as delivery. On pickup, `address` holds the pickup place. */
  fulfilment?: Fulfilment
  status: OrderStatus
  placedAt: string
  /**
   * The delivery pincode is not in the farmer's listed areas - inside
   * Maharashtra, so the order reached their anyway and the decision is their.
   * Their order screen says so, because Accept means "yes, I can get there".
   */
  outsideArea?: boolean
  events: OrderEvent[]
  sourceShareCode?: string
  /**
   * How long the farmer said the delivery would take, in their own words - "2
   * दिवसांत", "उद्या संध्याकाळी". Asked at the moment they ACCEPT, because
   * that is the first time they know: they have just read the address, the
   * quantity and what is on their shelf. Free text rather than a date, because
   * the honest answer to "when?" in a village with one bus is a phrase, not a
   * timestamp - and a false precision is worse than none.
   *
   * Optional: an order accepted before this existed, or by a farmer who
   * skipped the question, simply does not carry one.
   */
  deliveryEstimate?: string
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

/**
 * One buyer's word on ONE PRODUCT from one delivered order. The rules are in
 * `review.ts`.
 *
 * A product, not the farmer: the public reads what a bag of onions was like,
 * not a score for the farmer who grew it. And keyed to an order, so only
 * somebody who actually received the product may rate it - one order, one
 * voice per product in it.
 */
export interface Review {
  id: string
  orderId: string
  productId: string
  /** The name on the order line, copied - a deleted listing keeps its reviews readable. */
  productName: string
  /** Whose product. For the farmer's own reviews list and the admin console; never public. */
  farmerId: string
  customerId: string
  /**
   * First name only, copied when written. Everyone can read a review, and a
   * full name beside a village is enough to find somebody's house.
   */
  customerName: string
  /** 1 to 5. */
  rating: number
  comment?: string
  createdAt: string
  updatedAt?: string
  /**
   * Taken down by an admin - abuse, a phone number, a quarrel that belongs on
   * a call. Hidden reviews leave every public list and every average.
   */
  hidden?: boolean
  hiddenAt?: string
  hiddenBy?: string
  hiddenReason?: string
}

/** A review as the public sees it: which product, who, how many stars, what they said. */
export type PublicReview = Pick<
  Review,
  | 'id' | 'orderId' | 'productId' | 'productName' | 'customerName' | 'rating' | 'comment'
  | 'createdAt' | 'updatedAt'
>

/** One product's stars, as the buyer sends them. */
export interface ProductRatingInput {
  productId: string
  rating: number
  comment?: string
}

export interface RatingSummary {
  /** One decimal place; 0 when there is nothing to average. */
  average: number
  count: number
  /** How many reviews gave 1, 2, 3, 4 and 5 stars, in that order. */
  byStars: [number, number, number, number, number]
}

/* ------------------------------------------------------------------ */
/* Farmer                                                              */
/* ------------------------------------------------------------------ */

export type FarmerStatus =
  | 'PENDING_VERIFICATION'
  | 'ACTIVE'
  | 'BLOCKED'
  /** The farmer asked for their account to be deleted. See shared/src/accountClose.ts. */
  | 'CLOSED'

export type DispatchTime = 'same' | '1' | '23'

/**
 * SOMETHING AN ADMIN DID TO A FARMER'S ACCOUNT.
 *
 * Every other line in the farmer's updates list is derived from an order, because the
 * order already records what happened and when. An admin decision leaves no
 * such trail: a verified account is just a status that changed, so "you were
 * verified, on Tuesday" cannot be reconstructed after the fact. This is the smallest thing that can be: an append-only list on their own
 * record, trimmed, written by the same handler that made the change.
 */
export type AdminNoticeKind = 'VERIFIED' | 'BLOCKED' | 'UNBLOCKED' | 'PRODUCT_REJECTED'

export interface AdminNotice {
  id: string
  at: string
  kind: AdminNoticeKind
  /** A number the sentence carries. Legacy rows only; nothing writes it now. */
  n?: number
  /**
   * WHAT the decision was about - the product's name. Kept apart from the
   * reason so each side can be labelled in its own language: "dustbin" and
   * "कारण: Invalid" read as two facts, where "dustbin - Invalid" reads as a
   * product with a strange name.
   */
  subject?: string
  /**
   * WHY, in the admin's own words. Shown to the farmer as written, so keep it plain.
   * Older rows carry the subject and the reason joined in here; they are
   * printed as they stand.
   */
  note?: string
}

export interface Farmer {
  id: string
  /** Farmer code, e.g. F2C-ANADUR-001. Printed on packaging and posters. */
  farmerCode: string

  // personal
  name: string
  photo: string
  phone: string
  whatsapp?: string

  // the paper's questionnaire (profile.ts): stored as codes, labelled on screen
  ageGroup?: AgeGroup
  education?: Education
  landholding?: Landholding
  farmerTypes: FarmerType[]
  sellingChannels: SellingChannel[]
  problems: SellingProblem[]
  /** Crop ids from crops.ts. */
  crops: string[]

  // location
  village: string
  villageCode: string
  taluka: string
  district: string
  pincode: string
  /**
   * The exact point, only with the farmer's yes (`locationConsent`). The farmer and the
   * admin see it; the public card gets it rounded (`publicLocation` in geo.ts).
   */
  lat?: number
  lng?: number
  locationConsent?: boolean

  // business
  shopName: string
  shopSlug: string
  about?: string

  // money in. `upiId` is collected at registration because the farmer cannot be paid
  // without it. The payment QR is a SEPARATE, later step: it is generated from
  // that UPI ID (or the farmer uploads their bank's own QR image), and `upiQrReady`
  // records that they have actually been through that step.
  upiId: string
  upiVerified: boolean
  upiQrUrl?: string
  upiQrPublicId?: string
  upiQrReady?: boolean

  // Farmer Digital Readiness Index (fdri.ts): the ten answers, and the score
  // and band computed from them when they were given.
  fdri: FdriAnswers
  fdriScore: number
  fdriBand: FdriBand

  // shop settings
  isOpen: boolean
  deliveryFee: number
  freeDeliveryAbove: number
  minOrder: number
  dispatch: DispatchTime
  pincodes: string[]
  /**
   * The farmer brings it to the door. Registration sets true; an older row without
   * it reads as true (`?? true`), because every farmer delivered before.
   */
  offersDelivery?: boolean
  /**
   * The buyer may collect it here. A spot the farmer chose to publish, so the public
   * card shows it without the home-location consent - still rounded.
   */
  pickup?: { place: string; lat?: number; lng?: number }

  // platform
  status: FarmerStatus
  /**
   * When an admin blocked the farmer, and why. Their own screens read these to tell
   * them what happened - a blocked farmer who is simply shown an empty shop
   * has no idea whether the app is broken or they have been removed.
   */
  blockedAt?: string
  blockReason?: string
  /**
   * THE FARMER ASKED FOR THE ACCOUNT TO BE DELETED.
   *
   * `closingAt` is when the erasing happens - a week after they asked, so a
   * farmer who did not understand what they were confirming can still stop it by
   * signing in. The shop is hidden from the moment they ask, because `status`
   * is already CLOSED. `closedAt` is stamped when the scrub has actually run;
   * a row with `closedAt` holds no personal data at all.
   */
  closingAt?: string
  closedAt?: string
  /** Why they left, as a code from CLOSE_REASONS; `closeNote` has words only for "other". */
  closeReason?: string
  closeNote?: string
  /** When an admin checked this farmer, and who. Absent until then. */
  verifiedAt?: string
  verifiedBy?: string
  /** Admin decisions about the farmer's account, newest last. Trimmed on write. */
  notices?: AdminNotice[]
  /**
   * Stored values are legacy and never read. On every public answer both are
   * replaced by the farmer's products' ratings taken together (`summarizeReviews` over
   * every visible review of their products) - see `publicFarmer`.
   */
  rating: number
  ratingCount: number
  qrScans: number
  qrOrders: number
  createdAt: string
}

/**
 * A farmer as ANYONE may see them - the "sold by" card, the shop page, checkout.
 *
 * An allow-list, on purpose. The version before this was a deny-list that
 * named seven private fields and let everything else through, so every field
 * added to Farmer afterwards - admin notices, the reason they were blocked -
 * went public the day it was added. Adding a field here is now a decision.
 * `backend/src/db/publicFarmer.ts` builds it; `backend/tests/public-farmer.test.ts`
 * holds the list.
 */
export type PublicFarmer = Pick<
  Farmer,
  | 'id' | 'farmerCode' | 'name' | 'photo' | 'shopName' | 'shopSlug' | 'village'
  | 'deliveryFee' | 'freeDeliveryAbove' | 'minOrder' | 'pincodes'
  | 'upiId' | 'upiQrReady' | 'upiQrUrl'
  | 'rating' | 'ratingCount' | 'crops'
> & {
  /** Rounded to two decimals, and only with the farmer's consent - `publicLocation`. */
  lat?: number
  lng?: number
  offersDelivery: boolean
  /** The place text and its point rounded to two decimals. */
  pickup?: { place: string; lat?: number; lng?: number }
}

/* ------------------------------------------------------------------ */
/* Products                                                          */
/* ------------------------------------------------------------------ */

export type ProductStatus = 'DRAFT' | 'LIVE' | 'PAUSED'

export type { Unit, Cultivation } from './produce.js'

export interface Product {
  id: string
  farmerId: string
  /** A crop id from crops.ts. `other` is the only crop whose category the farmer picks. */
  cropId: string
  /** Pre-filled from the crop's label; the farmer's own words if they changed it. */
  name: string
  /** Set by the server from the crop, except for `other`. */
  categoryId: string
  /** Cloudinary secure_url. Read through the LRU cache, never fetched directly. */
  imageUrl?: string
  /** Cloudinary public_id, so a replaced photo can be deleted from the account. */
  imagePublicId?: string
  /** Fallback shown until a real photo exists, and if one fails to load. */
  emoji: string
  unit: Unit
  /** Rupees for ONE unit: ₹40 / किलो. */
  price: number
  /** Whole units the farmer has to sell. 0 means sold out for now. */
  stock: number
  /** The fewest units the farmer sends in one order - a trip for 1 kg may not pay. */
  minOrder: number
  /** YYYY-MM-DD. Buyers read "harvested N days ago" from it (produce.ts). */
  harvestDate: string
  cultivation: Cultivation
  description?: string

  status: ProductStatus
  views: number
  createdAt: string
}

export interface Category {
  id: string
  icon: string
  mr: string
  en: string
}

/* ------------------------------------------------------------------ */
/* Addresses & cart                                                    */
/* ------------------------------------------------------------------ */

export interface Address {
  id: string
  label: string
  line: string
  landmark?: string
  /**
   * Optional: an order captures a line, a landmark and a pincode but never a
   * city, so an address recovered from one has none to give.
   */
  city?: string
  pincode: string
  isDefault: boolean
}

/**
 * A customer, keyed by phone number.
 *
 * The customer's addresses live inside this document rather than in a collection of their
 * own. There are two or three, they are only ever read alongside the rest of the
 * record, and embedding keeps a checkout write atomic instead of split across
 * two documents.
 *
 * Deliberately absent: order counts and spending totals. Those are derived
 * from `orders` when they are needed. A stored counter goes wrong the first
 * time an order is cancelled, and goes wrong silently.
 */
export interface Customer {
  /** `c-<phone>` - derived, so it always matches the id inside their token. */
  id: string
  phone: string
  name: string
  addresses: Address[]
  createdAt: string
  updatedAt: string
  /** Reserved for admin moderation (Phase 3). Nothing reads it yet. */
  blocked?: boolean
}

export interface CartItem {
  productId: string
  farmerId: string
  /**
   * The shop's name, copied in when the item was added. The cart holds one
   * farmer's goods and has to be able to say whose without waiting on the
   * catalogue to load - a refusal that names no shop explains nothing.
   */
  farmerName?: string
  name: string
  emoji: string
  price: number
  unit: Unit
  /**
   * The farmer's minimum for this product, copied in when added so the + and
   * - buttons can step without the catalogue. A line saved before this existed
   * has none and is read as 1 (`cartRules`).
   */
  minOrder: number
  qty: number
}

/** A cart split into one bucket per farmer. Each becomes its own order. */
export interface FarmerGroup {
  farmerId: string
  farmer?: Farmer
  items: CartItem[]
  itemsTotal: number
  deliveryFee: number
  /**
   * No charge is set, so the buyer is told to ask the farmer rather than told
   * it is free. False when a farmer's own free-delivery minimum is met - that
   * "free" is the farmer's promise.
   */
  deliveryToAsk: boolean
  total: number
  minOrder: number
  belowMinimum: boolean
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

export interface WeekDay {
  d: string
  dEn: string
  v: number
}

export interface FarmerWeek {
  days: WeekDay[]
  lastWeekTotal: number
  ordersThisWeek: number
  ordersLastWeek: number
  views: number
  ordered: number
  repeatCustomers: number
}

export interface AdminStats {
  gmvMonth: number
  ordersToday: number
  ordersWeek: number
  /** Verified and not blocked - farmers anyone can buy from today. */
  activeFarmers: number
  totalFarmers: number
  newRegistrations: number
  /** Registered and waiting for an admin to verify them once. */
  pendingVerification: number
  stuckOrders: number
  openDisputes: number
  farmersEarnedTotal: number
  farmersEarnedMonth: number
  farmersWithFirstEarning: number
  repurchaseRate: number
  /** Forgot-password requests waiting for an admin's call. */
  openPasswordRequests: number
  /** Every document the server holds - and so reads from Firestore at each start. */
  databaseDocuments: number
  /** How many starts a day the Spark plan's 50,000 free reads cover at that size. */
  startsWithinFreeReads: number
  earningBands: { label: string; v: number }[]
  fdriBands: { band: FdriBand; v: number }[]
}

/* ------------------------------------------------------------------ */
/* API envelope                                                        */
/* ------------------------------------------------------------------ */

export interface ApiError {
  error: string
  /** Marathi message, safe to show a farmer directly. */
  messageMr?: string
  fields?: Record<string, string>
}

/**
 * A buyer saying a listing or a review should not be here.
 *
 * Stored rather than derived, because it is the only record that the report
 * was ever made: nothing else on the product changes when somebody reports
 * it. An admin reads the queue, and either takes the listing down - which
 * deletes it and these rows with it - or closes the reports as looked at.
 */
export interface Report {
  id: string
  targetType: import('./report.js').ReportTarget
  targetId: string
  /** Whose listing or review, copied so the queue can be read without joins. */
  farmerId?: string
  /** What the row is about, copied for the same reason: a name in the queue. */
  targetName?: string
  reason: import('./report.js').ReportReason
  /** Only 'other' carries words; every other reason is the code alone. */
  note?: string
  /**
   * Who flagged it - a buyer, or the farmer the review is about. The farmer is the
   * person an abusive review is aimed at, so they get the same way out as
   * anyone reading it.
   */
  byUserId: string
  byRole: 'customer' | 'farmer'
  at: string
  /** Closed by an admin who looked and left the listing up. */
  reviewedAt?: string
  reviewedBy?: string
}

/**
 * A complaint somebody raised from Help & Training.
 *
 * Stored with who wrote it, because that is the whole difference between
 * this and a WhatsApp message: an admin can open their account, see the order they
 * are asking about, and answer. The writer's name and number are copied in so the queue
 * can be read and they can be rung back without a lookup per row.
 */
export interface Complaint {
  id: string
  byRole: 'farmer' | 'customer'
  byUserId: string
  /** Copied at the time, so the queue reads without joins. */
  name: string
  phone: string
  /** Farmers only - the id a field coordinator recognises. */
  farmerCode?: string
  subject: import('./complaint.js').ComplaintSubject
  message: string
  at: string
  /** Dealt with. Who, so "who answered this?" has an answer months later. */
  resolvedAt?: string
  resolvedBy?: string
}

