import type {
  Category, Complaint, Customer, Order, Product, Report, Review, Farmer, Survey, SubscriptionPayment,
} from '@shared/types.js'
import { addMonths } from '@shared/subscription.js'
import { FDRI_INDICATORS, cleanFdri, fdriBand, fdriScore } from '@shared/fdri.js'
import { deriveCustomersFromOrders } from './customers.js'
import type { AdminUser, AuthEvent, Credential, PasswordRequest, SessionRecord } from '../auth/types.js'

export interface Db {
  farmers: Farmer[]
  products: Product[]
  orders: Order[]
  customers: Customer[]
  /** Buyers' feedback on delivered orders. Never seeded - see `seed()`. */
  reviews: Review[]
  /** Buyers flagging a listing or a review. Never seeded. */
  reports: Report[]
  /** What farmers and buyers have written to the desk. Never seeded. */
  complaints: Complaint[]
  /**
   * The auth collections. They live in the same store as everything else so
   * they get the same durability - a session that vanished on restart would
   * sign every farmer out on each deploy, which is exactly the behaviour the
   * registry exists to stop.
   *
   * They are never seeded. `seed()` fills a demo catalogue; inventing sessions
   * or administrators would be inventing credentials.
   */
  sessions: SessionRecord[]
  admins: AdminUser[]
  authEvents: AuthEvent[]
  /** Farmer and buyer passwords, apart from their rows. See auth/credentials.ts. */
  credentials: Credential[]
  /** Forgot-password requests waiting for an admin's call. Never seeded. */
  passwordRequests: PasswordRequest[]
  /** Questionnaires typed in by coordinators. Never seeded: invented answers would be invented research. */
  surveys: Survey[]
  /** The ₹50 ledger. Never seeded: an invented UTR is invented money. */
  payments: SubscriptionPayment[]
}

/**
 * Fill in collections a stored database is missing.
 *
 * db.json on someone's disk may predate a collection - `customers` was added
 * after the file format was already in use - and deploying new code does not
 * rewrite it. Without this, the first request would hit
 * `db.customers.find(...)` on undefined and throw.
 */
/** A database with nothing in it. What a live install starts from. */
export function emptyDb(): Db {
  return {
    farmers: [], products: [], orders: [], customers: [], reviews: [],
    reports: [], complaints: [], sessions: [], admins: [], authEvents: [],
    credentials: [], passwordRequests: [], surveys: [], payments: [],
  }
}

export function withDefaults(raw: Partial<Db>): Db {
  return {
    farmers: raw.farmers ?? [],
    products: raw.products ?? [],
    orders: raw.orders ?? [],
    customers: raw.customers ?? [],
    reviews: raw.reviews ?? [],
    reports: raw.reports ?? [],
    complaints: raw.complaints ?? [],
    sessions: raw.sessions ?? [],
    admins: raw.admins ?? [],
    authEvents: raw.authEvents ?? [],
    credentials: raw.credentials ?? [],
    passwordRequests: raw.passwordRequests ?? [],
    surveys: raw.surveys ?? [],
    payments: raw.payments ?? [],
  }
}

/**
 * The produce categories, in the order a buyer in a village market walks past
 * them. Every crop in `crops.ts` names one of these ids.
 */
export const CATEGORIES: Category[] = [
  { id: 'vegetables', icon: '🍅', mr: 'भाजीपाला',          en: 'Vegetables' },
  { id: 'leafy',      icon: '🥬', mr: 'पालेभाज्या',         en: 'Leafy greens' },
  { id: 'fruits',     icon: '🍇', mr: 'फळे',               en: 'Fruits' },
  { id: 'grains',     icon: '🌾', mr: 'धान्य',              en: 'Grains' },
  { id: 'pulses',     icon: '🫘', mr: 'कडधान्ये',           en: 'Pulses' },
  { id: 'spices',     icon: '🌶️', mr: 'मसाले',             en: 'Spices' },
  { id: 'processed',  icon: '🫙', mr: 'प्रक्रिया उत्पादने', en: 'Processed produce' },
  /**
   * Last. No list names every crop a farmer grows, and one whose crop is not
   * on it would otherwise file it under something it is not - which poisons
   * the filter for every buyer - or stop. It carries no photograph in
   * `categoryPhoto.ts`: there is no honest picture of "everything else".
   */
  { id: 'other',      icon: '📦', mr: 'इतर',               en: 'Other' },
]

/** Is this a category id the catalogue knows? The server refuses any other. */
export function isCategoryId(id: unknown): boolean {
  return CATEGORIES.some((c) => c.id === id)
}

/**
 * A seed farmer's FDRI: the first `yes` indicators answered yes, in the
 * paper's order. Every demo farmer lands in the moderate band (4-7).
 */
function fdriOf(yes: number) {
  const fdri = cleanFdri(Object.fromEntries(FDRI_INDICATORS.slice(0, yes).map((k) => [k, true])))
  const score = fdriScore(fdri)
  return { fdri, fdriScore: score, fdriBand: fdriBand(score) }
}

const now = Date.now()
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString()
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()

export function seed(): Db {
  /**
   * The four farmers on the poster, all in अणदूर. No passwords: a demo
   * farmer gets one with `npm run admin -- set-password <phone> <password>`.
   */
  const place = {
    village: 'अणदूर', villageCode: 'ANADUR', taluka: 'तुळजापूर', district: 'धाराशिव', pincode: '413603',
    locationConsent: true,
  } as const
  const shop = {
    upiVerified: true, isOpen: true, deliveryFee: 20, freeDeliveryAbove: 500, minOrder: 100,
    dispatch: 'same', pincodes: ['413603', '413601'], offersDelivery: true, status: 'ACTIVE',
    verifiedAt: daysAgo(60), verifiedBy: 'seed',
    // Six months from the verification, so the demo shops are on sale today.
    packsApproved: 1, subscriptionEndsAt: addMonths(daysAgo(60), 6),
    rating: 0, ratingCount: 0, qrScans: 0, qrOrders: 0,
  } as const
  const farmers: Farmer[] = [
    {
      ...place, ...shop, pincodes: [...shop.pincodes],
      id: 's1', farmerCode: 'F2C-ANADUR-001',
      name: 'राजेश पाटील', photo: '', phone: '9822011223', whatsapp: '9822011223',
      ageGroup: '36-50', education: 'secondary', landholding: 'small',
      farmerTypes: ['vegetable'], sellingChannels: ['trader', 'weekly'], problems: ['lowPrice', 'middlemen'],
      crops: ['tomato'], lat: 17.9941, lng: 76.2329,
      // Two of the four also let a buyer collect, so the demo shows both.
      pickup: { place: 'अणदूर बस स्थानकाजवळ', lat: 17.9912, lng: 76.2318 },
      shopName: 'राजेश पाटील', shopSlug: 'rajesh-patil-f2c-anadur-001',
      about: 'राजेश पाटील - अणदूर येथून थेट शेतमाल. टोमॅटो.',
      upiId: 'rajeshpatil@ybl', ...fdriOf(5), createdAt: daysAgo(60),
    },
    {
      ...place, ...shop, pincodes: [...shop.pincodes],
      id: 's2', farmerCode: 'F2C-ANADUR-002',
      name: 'सविता कांबळे', photo: '', phone: '9764455661', whatsapp: '9764455661',
      ageGroup: '25-35', education: 'higher', landholding: 'small',
      farmerTypes: ['vegetable'], sellingChannels: ['weekly', 'direct'], problems: ['transport'],
      crops: ['okra'], lat: 17.9918, lng: 76.2361,
      pickup: { place: 'अणदूर आठवडी बाजार, महादेव मंदिरासमोर', lat: 17.9935, lng: 76.2347 },
      shopName: 'सविता कांबळे', shopSlug: 'savita-kamble-f2c-anadur-002',
      about: 'सविता कांबळे - अणदूर येथून थेट शेतमाल. भेंडी.',
      upiId: 'savitak@okicici', ...fdriOf(6), createdAt: daysAgo(50),
    },
    {
      ...place, ...shop, pincodes: [...shop.pincodes],
      id: 's3', farmerCode: 'F2C-ANADUR-003',
      name: 'गणेश जगदाळे', photo: '', phone: '9890033441', whatsapp: '9890033441',
      ageGroup: '51-60', education: 'middle', landholding: 'medium',
      farmerTypes: ['vegetable', 'grain'], sellingChannels: ['apmc', 'trader'], problems: ['lowPrice', 'storage'],
      crops: ['onion'], lat: 17.9962, lng: 76.2297,
      shopName: 'गणेश जगदाळे', shopSlug: 'ganesh-jagdale-f2c-anadur-003',
      about: 'गणेश जगदाळे - अणदूर येथून थेट शेतमाल. कांदा.',
      upiId: 'ganeshj@paytm', ...fdriOf(4), createdAt: daysAgo(40),
    },
    {
      ...place, ...shop, pincodes: [...shop.pincodes],
      id: 's4', farmerCode: 'F2C-ANADUR-004',
      name: 'लक्ष्मी शिंदे', photo: '', phone: '9850012345', whatsapp: '9850012345',
      ageGroup: '36-50', education: 'primary', landholding: 'small',
      farmerTypes: ['grain'], sellingChannels: ['trader'], problems: ['noInfo', 'latePayment'],
      crops: ['gram'], lat: 17.9905, lng: 76.2342,
      shopName: 'लक्ष्मी शिंदे', shopSlug: 'lakshmi-shinde-f2c-anadur-004',
      about: 'लक्ष्मी शिंदे - अणदूर येथून थेट शेतमाल. हरभरा.',
      upiId: 'lakshmis@ybl', ...fdriOf(4), createdAt: daysAgo(30),
    },
  ]

  // One listing per farmer, their poster crop. Harvest dates are counted back
  // from today so the demo always reads as fresh.
  const harvested = (d: number) => new Date(now + 5.5 * 3_600_000 - d * 86_400_000).toISOString().slice(0, 10)
  const listing = { unit: 'kg', status: 'LIVE', views: 0 } as const
  const products: Product[] = [
    { ...listing, id: 'p1', farmerId: 's1', cropId: 'tomato', categoryId: 'vegetables', emoji: '🍅', name: 'टोमॅटो',
      price: 40, stock: 150, minOrder: 2, harvestDate: harvested(1), cultivation: 'organic', createdAt: daysAgo(1) },
    { ...listing, id: 'p2', farmerId: 's2', cropId: 'okra', categoryId: 'vegetables', emoji: '🥒', name: 'भेंडी',
      price: 35, stock: 60, minOrder: 1, harvestDate: harvested(0), cultivation: 'natural', createdAt: daysAgo(0) },
    { ...listing, id: 'p3', farmerId: 's3', cropId: 'onion', categoryId: 'vegetables', emoji: '🧅', name: 'कांदा',
      price: 28, stock: 800, minOrder: 5, harvestDate: harvested(12), cultivation: 'chemical', createdAt: daysAgo(10) },
    { ...listing, id: 'p4', farmerId: 's4', cropId: 'gram', categoryId: 'pulses', emoji: '🫘', name: 'हरभरा',
      price: 60, stock: 300, minOrder: 5, harvestDate: harvested(25), cultivation: 'chemical', createdAt: daysAgo(20) },
  ]

  const orders: Order[] = [
    {
      id: 'F2C1043', farmerId: 's1', customerId: 'c1',
      customerName: 'प्रिया देशमुख', customerPhone: '9011223344',
      address: 'फ्लॅट 302, शिवसागर अपार्टमेंट, विमाननगर, पुणे',
      landmark: 'सिम्बायोसिस कॉलेजजवळ', pincode: '413601',
      items: [
        { productId: 'p1', name: 'टोमॅटो', emoji: '🍅', qty: 5, price: 40 },
      ],
      itemsTotal: 200, deliveryFee: 20, total: 220,
      paymentMode: 'UPI', paymentStatus: 'UPI_SUBMITTED', paymentUtr: '431209887654',
      status: 'PLACED', placedAt: hoursAgo(1),
      events: [{ to: 'PLACED', at: hoursAgo(1), by: 'customer' }],
    },
    {
      id: 'F2C1042', farmerId: 's1', customerId: 'c2',
      customerName: 'अनिता कुलकर्णी', customerPhone: '9922334455',
      address: 'घर क्र. 12, गणेश नगर, अणदूर', landmark: 'ग्रामपंचायत ऑफिससमोर', pincode: '413601',
      items: [{ productId: 'p1', name: 'टोमॅटो', emoji: '🍅', qty: 3, price: 40 }],
      itemsTotal: 120, deliveryFee: 20, total: 140,
      paymentMode: 'COD', paymentStatus: 'COD_PENDING',
      status: 'PACKED', placedAt: hoursAgo(6),
      events: [
        { to: 'PLACED', at: hoursAgo(6), by: 'customer' },
        { to: 'ACCEPTED', at: hoursAgo(5), by: 'farmer' },
        { to: 'PACKED', at: hoursAgo(2), by: 'farmer' },
      ],
    },
    {
      id: 'F2C1039', farmerId: 's1', customerId: 'c3',
      customerName: 'सविता मोरे', customerPhone: '9765544332',
      address: 'मु. पो. रांजणगाव, ता. तुळजापूर', landmark: 'शाळेजवळ', pincode: '413602',
      items: [{ productId: 'p1', name: 'टोमॅटो', emoji: '🍅', qty: 4, price: 40 }],
      itemsTotal: 160, deliveryFee: 20, total: 180,
      paymentMode: 'COD', paymentStatus: 'COD_PENDING',
      status: 'OUT_FOR_DELIVERY', placedAt: hoursAgo(28),
      events: [
        { to: 'PLACED', at: hoursAgo(28), by: 'customer' },
        { to: 'ACCEPTED', at: hoursAgo(27), by: 'farmer' },
        { to: 'PACKED', at: hoursAgo(25), by: 'farmer' },
        { to: 'OUT_FOR_DELIVERY', at: hoursAgo(3), by: 'farmer' },
      ],
    },
    {
      id: 'F2C1031', farmerId: 's1', customerId: 'c4',
      customerName: 'रेखा भोसले', customerPhone: '9834455667',
      address: 'सर्वे नं. 45, तुळजापूर रोड, अणदूर', pincode: '413601',
      items: [{ productId: 'p1', name: 'टोमॅटो', emoji: '🍅', qty: 5, price: 40 }],
      itemsTotal: 200, deliveryFee: 20, total: 220,
      paymentMode: 'UPI', paymentStatus: 'UPI_CONFIRMED', paymentUtr: '430918776541',
      status: 'DELIVERED', placedAt: hoursAgo(9),
      events: [
        { to: 'PLACED', at: hoursAgo(9), by: 'customer' },
        { to: 'ACCEPTED', at: hoursAgo(8), by: 'farmer' },
        { to: 'PACKED', at: hoursAgo(7), by: 'farmer' },
        { to: 'OUT_FOR_DELIVERY', at: hoursAgo(5), by: 'farmer' },
        { to: 'DELIVERED', at: hoursAgo(4), by: 'farmer' },
      ],
    },
    {
      id: 'F2C1044', farmerId: 's2', customerId: 'c1',
      customerName: 'प्रिया देशमुख', customerPhone: '9011223344',
      address: 'फ्लॅट 302, शिवसागर अपार्टमेंट, विमाननगर, पुणे',
      landmark: 'सिम्बायोसिस कॉलेजजवळ', pincode: '413603',
      items: [{ productId: 'p2', name: 'भेंडी', emoji: '🥒', qty: 4, price: 35 }],
      itemsTotal: 140, deliveryFee: 20, total: 160,
      paymentMode: 'COD', paymentStatus: 'COD_PENDING',
      status: 'ACCEPTED', placedAt: hoursAgo(9),
      events: [
        { to: 'PLACED', at: hoursAgo(9), by: 'customer' },
        { to: 'ACCEPTED', at: hoursAgo(8), by: 'farmer' },
      ],
    },
  ]

  // Customers are not written by hand. They are derived from the orders above
  // by exactly the same code the backfill script runs against live data, so a
  // fresh install and a migrated database end up with identical records.
  const customers = deriveCustomersFromOrders(orders)

  // The auth collections start empty even in the demo seed. A seeded session
  // would be a working credential committed to the repository, and a seeded
  // administrator would be a known password on every fresh install - which is
  // exactly the shape of the default `changeme` this change exists to remove.
  // No seeded reviews either: invented praise in front of real customers is
  // the one thing feedback exists to rule out.
  return {
    farmers, products, orders, customers, reviews: [], reports: [], complaints: [],
    sessions: [], admins: [], authEvents: [],
    // No passwords either: a demo farmer signs in after an admin reset.
    credentials: [], passwordRequests: [],
    // No surveys: a questionnaire is a real person's answers.
    surveys: [],
    // No payments: an invented UTR is invented money.
    payments: [],
  }
}

