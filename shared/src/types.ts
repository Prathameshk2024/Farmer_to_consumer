/**
 * Types shared by the frontend and the backend.
 *
 * This folder is the single source of truth for anything that crosses the
 * wire. Both tsconfigs alias it to `@shared/*`, so a change here is a compile
 * error on whichever side has not caught up - which is the whole reason this
 * project is in TypeScript.
 */

/* ------------------------------------------------------------------ */
/* Roles & auth                                                        */
/* ------------------------------------------------------------------ */

export type Role = 'seller' | 'customer' | 'admin'

export interface Session {
  token: string
  role: Role
  userId: string
  phone?: string
  name?: string
  /** Present only for sellers. */
  sellerId?: string
  /** Present only for customers. */
  customerId?: string
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
  by: 'customer' | 'seller' | 'admin' | 'system'
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
  sellerId: string
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
  status: OrderStatus
  /**
   * Legacy. Delivery no longer requires an OTP; kept optional so orders
   * already stored with one still parse. Nothing reads it.
   */
  deliveryOtp?: string
  placedAt: string
  /**
   * The delivery pincode is not in the seller's listed areas - inside
   * Maharashtra, so the order reached their anyway and the decision is their.
   * Their order screen says so, because Accept means "yes, I can get there".
   */
  outsideArea?: boolean
  events: OrderEvent[]
  sourceShareCode?: string
  /**
   * How long the seller said the delivery would take, in her own words - "2
   * दिवसांत", "उद्या संध्याकाळी". Asked at the moment she ACCEPTS, because
   * that is the first time she knows: she has just read the address, the
   * quantity and what is on her shelf. Free text rather than a date, because
   * the honest answer to "when?" in a village with one bus is a phrase, not a
   * timestamp - and a false precision is worse than none.
   *
   * Optional: an order accepted before this existed, or by a seller who
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
 * A product, not the seller: the public reads what a jar of pickle was like,
 * not a score for the woman who made it. And keyed to an order, so only
 * somebody who actually received the product may rate it - one order, one
 * voice per product in it.
 */
export interface Review {
  id: string
  orderId: string
  productId: string
  /** The name on the order line, copied - a deleted listing keeps its reviews readable. */
  productName: string
  /** Whose product. For her own reviews list and the admin console; never public. */
  sellerId: string
  customerId: string
  /**
   * First name only, copied when written. Everyone can read a review, and a
   * full name beside a village is enough to find a woman's house.
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
/* Seller                                                              */
/* ------------------------------------------------------------------ */

export type SellerStatus =
  | 'REGISTERED'
  | 'PAYMENT_SUBMITTED'
  | 'ACTIVE'
  | 'PAYMENT_REJECTED'
  | 'BLOCKED'
  /** She asked for her account to be deleted. See shared/src/accountClose.ts. */
  | 'CLOSED'

export type BusinessType = 'individual' | 'shg' | 'udyam'

export type DispatchTime = 'same' | '1' | '23'

/**
 * The six digital-usage answers behind the Shanta Mahila Bazar Digital Readiness Index.
 * Collected once at registration and re-measured after training, so the
 * before/after comparison the research design needs is possible at all.
 */
export interface DigitalProfile {
  smartphone: boolean
  internet: boolean
  upi: boolean
  whatsappBusiness: boolean
  socialMedia: boolean
  digitalMarketing: boolean
}

/**
 * SOMETHING AN ADMIN DID TO HER ACCOUNT.
 *
 * Every other line in her updates list is derived from an order, because the
 * order already records what happened and when. An admin decision leaves no
 * such trail: a granted pack is a number that is simply larger than it was, so
 * "you were given 5 more slots, on Tuesday" cannot be reconstructed after the
 * fact. This is the smallest thing that can be: an append-only list on her own
 * record, trimmed, written by the same handler that made the change.
 */
export type AdminNoticeKind =
  | 'SLOTS_GRANTED'
  | 'SLOTS_REVOKED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | 'BLOCKED'
  | 'UNBLOCKED'
  | 'PRODUCT_APPROVED'
  | 'PRODUCT_REJECTED'
  /** Her shop is open for another six months. `note` carries the new end date (ISO). */
  | 'SUBSCRIPTION_RENEWED'

export interface AdminNotice {
  id: string
  at: string
  kind: AdminNoticeKind
  /** Slots, where the sentence carries a number. Slots, not packs - a pack is our word. */
  n?: number
  /**
   * WHAT the decision was about - the product's name. Kept apart from the
   * reason so each side can be labelled in her own language: "dustbin" and
   * "कारण: Invalid" read as two facts, where "dustbin - Invalid" reads as a
   * product with a strange name.
   */
  subject?: string
  /**
   * WHY, in the admin's own words. Shown to her as written, so keep it plain.
   * Older rows carry the subject and the reason joined in here; they are
   * printed as they stand.
   */
  note?: string
}

export interface Seller {
  id: string
  /** Shanta Mahila Bazar ID, e.g. SMB-ANADUR-001. Printed on packaging and posters. */
  womenBizId: string

  // personal
  name: string
  photo: string
  phone: string
  whatsapp?: string
  age?: number
  education?: string

  // location
  village: string
  villageCode: string
  taluka: string
  district: string
  pincode: string

  // business
  shopName: string
  shopSlug: string
  about?: string
  businessType: BusinessType
  shgName?: string
  yearsInBusiness?: number
  /** Units she can make per month. Drives what admin can realistically promise. */
  monthlyCapacity?: number
  sellsFood: boolean
  /**
   * Her FSSAI licence number, asked once at registration and only if she
   * sells food. Optional (see fssaiProblem), though the form does not say
   * so: labelled "optional", nearly everyone skips it, including the women
   * who hold a licence and gain by showing it.
   */
  fssai?: string

  // money in. `upiId` is collected at registration because she cannot be paid
  // without it. The payment QR is a SEPARATE, later step: it is generated from
  // that UPI ID (or she uploads her bank's own QR image), and `upiQrReady`
  // records that she has actually been through that step.
  upiId: string
  upiVerified: boolean
  upiQrUrl?: string
  upiQrPublicId?: string
  upiQrReady?: boolean

  // digital readiness
  digital: DigitalProfile
  readinessScore: number
  readinessBand: ReadinessBand

  // shop settings
  isOpen: boolean
  deliveryFee: number
  freeDeliveryAbove: number
  minOrder: number
  dispatch: DispatchTime
  pincodes: string[]

  // platform
  status: SellerStatus
  /**
   * When an admin blocked her, and why. Her own screens read these to tell
   * her what happened - a blocked seller who is simply shown an empty shop
   * has no idea whether the app is broken or she has been removed.
   */
  blockedAt?: string
  blockReason?: string
  /**
   * SHE ASKED FOR THE ACCOUNT TO BE DELETED.
   *
   * `closingAt` is when the erasing happens - a week after she asked, so a
   * woman who did not understand what she was confirming can still stop it by
   * signing in. Her shop is hidden from the moment she asks, because `status`
   * is already CLOSED. `closedAt` is stamped when the scrub has actually run;
   * a row with `closedAt` holds no personal data at all.
   */
  closingAt?: string
  closedAt?: string
  /** Why she left, as a code from CLOSE_REASONS; `closeNote` has words only for "other". */
  closeReason?: string
  closeNote?: string
  /**
   * When her shop pauses unless she renews. Six months from the approval that
   * started or renewed it; absent until her first payment is approved. The
   * only stored piece of the subscription - see shared/src/subscription.ts.
   */
  subscriptionEndsAt?: string
  packsApproved: number
  /**
   * Legacy and no longer written. It fed a lifetime cap on listings per pack
   * that existed only because a seller could delete a listing to free its
   * slot; she cannot any more, so the cap is gone. Old rows still carry it.
   */
  listingsPublished?: number
  /** Admin decisions about her account, newest last. Trimmed on write. */
  notices?: AdminNotice[]
  /**
   * Stored values are legacy and never read. On every public answer both are
   * replaced by her products' ratings taken together (`summarizeReviews` over
   * every visible review of her products) - see `publicSeller`.
   */
  rating: number
  ratingCount: number
  qrScans: number
  qrOrders: number
  createdAt: string
}

/**
 * A seller as ANYONE may see her - the "sold by" card, the shop page, checkout.
 *
 * An allow-list, on purpose. The version before this was a deny-list that
 * named seven private fields and let everything else through, so every field
 * added to Seller afterwards - admin notices, the reason she was blocked -
 * went public the day it was added. Adding a field here is now a decision.
 * `backend/src/db/publicSeller.ts` builds it; `backend/tests/public-seller.test.ts`
 * holds the list.
 */
export type PublicSeller = Pick<
  Seller,
  | 'id' | 'womenBizId' | 'name' | 'photo' | 'shopName' | 'shopSlug' | 'village'
  | 'deliveryFee' | 'freeDeliveryAbove' | 'minOrder' | 'pincodes'
  | 'upiId' | 'upiQrReady' | 'upiQrUrl'
  | 'rating' | 'ratingCount'
>

export type ReadinessBand = 'starter' | 'basic' | 'advanced' | 'digital'

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

export type ProductStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'LIVE'
  | 'REJECTED'
  | 'PAUSED'
  | 'ARCHIVED'

export type Unit = 'kg' | 'g' | 'piece' | 'dozen' | 'litre' | 'ml' | 'set'

export interface Product {
  id: string
  sellerId: string
  /** Fallback shown until a real photo exists, and if one fails to load. */
  emoji: string
  /** Cloudinary secure_url. Read through the LRU cache, never fetched directly. */
  imageUrl?: string
  /** Cloudinary public_id, so a replaced photo can be deleted from the account. */
  imagePublicId?: string
  name: string
  nameEn?: string
  categoryId: string
  isFood: boolean

  // food only - all four are required when isFood is true
  ingredients?: string
  vegType?: 'veg' | 'nonveg'
  /**
   * Her FSSAI licence number, if she has one. OPTIONAL and staying that way:
   * most women here cook at home and are below the registration threshold, and
   * a required licence number would shut them out of the market this exists
   * to open. The ones who do have it gain by showing it, which is why it is
   * asked at all - and only on food, where it means anything.
   */
  fssai?: string

  // non-food only
  material?: string

  price: number
  mrp: number
  unit: Unit
  /**
   * HOW MUCH ONE OF THESE IS, counted in `unit`: 500 with unit `g`, 1 with
   * unit `set`. A price with no size is not a price - "₹80 for pickle" tells
   * a buyer nothing until she knows whether that is a 200g jar or a kilo, and
   * she cannot compare two sellers without it.
   *
   * Optional on the type because listings published before the question
   * existed do not carry one; required by `listingProblems` on anything
   * submitted since.
   */
  packSize?: number
  /**
   * For a `set`: how many items are inside one. "1 set" is not an amount -
   * a set of four ladoos and a set of twenty are the same word.
   */
  piecesPerPack?: number
  stock: number
  madeToOrder?: boolean

  status: ProductStatus
  rejectReason?: string
  /**
   * When an admin rejected it. A rejected listing is removed automatically
   * 48 hours later (see shared/src/moderation.ts) - the stamp is what that
   * clock counts from, and what her app counts down to.
   */
  rejectedAt?: string
  views: number
  /**
   * How many of MAX_EDITS the seller has spent on this listing. Absent on
   * anything published before the rule existed, which reads as none used -
   * nobody loses an edit to a change they made when editing was free.
   */
  editCount?: number
  createdAt: string
}

export interface Category {
  id: string
  icon: string
  mr: string
  en: string
  /**
   * Which half of the wizard this category belongs to. **Absent means both** -
   * `other` is the only one, and it has to be offered to a woman selling food
   * and to one selling cloth alike, because what it is for is everything the
   * list forgot.
   */
  food?: boolean
}

/* ------------------------------------------------------------------ */
/* Subscription                                                        */
/* ------------------------------------------------------------------ */

export type PaymentApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface SubscriptionPayment {
  id: string
  /**
   * What the ₹50 was for: five more slots, or six more months. Absent on
   * everything submitted before renewals existed, which were all packs.
   */
  kind?: 'PACK' | 'RENEWAL'
  /** The shop's end date this approval left her with - the renewal history an admin reads. */
  termEndsAt?: string
  sellerId: string
  sellerName: string
  womenBizId: string
  phone: string
  amount: number
  utr: string
  payerUpi: string
  /**
   * Her UPI app's success screen. Required on every submission made while
   * uploads are switched on; absent only on older rows and when they are off.
   */
  screenshotUrl?: string
  /** When she says she paid - read off that screen, and checked against it. */
  paidAt?: string
  submittedAt: string
  status: PaymentApprovalStatus
  /** Set when the same reference number was already used by someone else. */
  duplicateUtr: boolean
  verifiedAt?: string
  verifiedBy?: string
  rejectReason?: string
}

export interface AdminPaymentAccount {
  label: string
  upiId: string
  bankName: string
  /**
   * Optional, and absent in practice: she pays by UPI, and a wrong account
   * number printed under a QR code is worse than no account number.
   */
  accountNo?: string
  ifsc?: string
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
 * Her addresses live inside this document rather than in a collection of their
 * own. She has two or three, they are only ever read alongside the rest of her
 * record, and embedding keeps a checkout write atomic instead of split across
 * two documents.
 *
 * Deliberately absent: order counts and spending totals. Those are derived
 * from `orders` when they are needed. A stored counter goes wrong the first
 * time an order is cancelled, and goes wrong silently.
 */
export interface Customer {
  /** `c-<phone>` - derived, so it always matches the id inside her token. */
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
  sellerId: string
  /**
   * The shop's name, copied in when the item was added. The cart holds one
   * seller's goods and has to be able to say whose without waiting on the
   * catalogue to load - a refusal that names no shop explains nothing.
   */
  sellerName?: string
  name: string
  emoji: string
  price: number
  unit: Unit
  qty: number
}

/** A cart split into one bucket per seller. Each becomes its own order. */
export interface SellerGroup {
  sellerId: string
  seller?: Seller
  items: CartItem[]
  itemsTotal: number
  deliveryFee: number
  /**
   * No charge is set, so the buyer is told to ask the seller rather than told
   * it is free. False when a seller's own free-delivery minimum is met - that
   * "free" is her promise.
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

export interface SellerWeek {
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
  /** Approved, not blocked, and inside their subscription - sellers anyone can buy from today. */
  activeSellers: number
  /** Open, and pausing within RENEW_REMINDER_DAYS unless they renew. */
  subscriptionsExpiring: number
  /** Paused: the six months ran out and they have not renewed. */
  subscriptionsExpired: number
  totalSellers: number
  newRegistrations: number
  pendingPayments: number
  /** Listings waiting for an admin to publish them. */
  pendingProducts: number
  stuckOrders: number
  openDisputes: number
  womenEarnedTotal: number
  womenEarnedMonth: number
  womenWithFirstEarning: number
  /** Summed from APPROVED payment records, never from the plan price times a count. */
  subscriptionRevenue: number
  /** How many payments that total is made of. */
  approvedPaymentCount: number
  repurchaseRate: number
  /** Every document the server holds - and so reads from Firestore at each start. */
  databaseDocuments: number
  /** How many starts a day the Spark plan's 50,000 free reads cover at that size. */
  startsWithinFreeReads: number
  earningBands: { label: string; v: number }[]
  readinessBands: { band: ReadinessBand; v: number }[]
}

/* ------------------------------------------------------------------ */
/* API envelope                                                        */
/* ------------------------------------------------------------------ */

export interface ApiError {
  error: string
  /** Marathi message, safe to show a seller directly. */
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
  sellerId?: string
  /** What the row is about, copied for the same reason: a name in the queue. */
  targetName?: string
  reason: import('./report.js').ReportReason
  /** Only 'other' carries words; every other reason is the code alone. */
  note?: string
  /**
   * Who flagged it - a buyer, or the seller the review is about. She is the
   * person an abusive review is aimed at, so she gets the same way out as
   * anyone reading it.
   */
  byUserId: string
  byRole: 'customer' | 'seller'
  at: string
  /** Closed by an admin who looked and left the listing up. */
  reviewedAt?: string
  reviewedBy?: string
}

/**
 * A complaint somebody raised from Help & Training.
 *
 * Stored with who wrote it, because that is the whole difference between
 * this and a WhatsApp message: an admin can open her account, see the ₹50 she
 * is asking about, and answer. Her name and number are copied in so the queue
 * can be read and she can be rung back without a lookup per row.
 */
export interface Complaint {
  id: string
  byRole: 'seller' | 'customer'
  byUserId: string
  /** Copied at the time, so the queue reads without joins. */
  name: string
  phone: string
  /** Sellers only - the id a field coordinator recognises. */
  womenBizId?: string
  subject: import('./complaint.js').ComplaintSubject
  message: string
  at: string
  /** Dealt with. Who, so "who answered this?" has an answer months later. */
  resolvedAt?: string
  resolvedBy?: string
}

