import type {
  Category, Complaint, Customer, Order, Product, Report, Review, Seller, SubscriptionPayment,
} from '@shared/types.js'
import { computeReadiness, readinessBand } from '@shared/readiness.js'
import type { DigitalProfile } from '@shared/types.js'
import { deriveCustomersFromOrders } from './customers.js'
import type { AdminUser, AuthEvent, SessionRecord } from '../auth/types.js'

export interface Db {
  sellers: Seller[]
  products: Product[]
  orders: Order[]
  payments: SubscriptionPayment[]
  customers: Customer[]
  /** Buyers' feedback on delivered orders. Never seeded - see `seed()`. */
  reviews: Review[]
  /** Buyers flagging a listing or a review. Never seeded. */
  reports: Report[]
  /** What sellers and buyers have written to the desk. Never seeded. */
  complaints: Complaint[]
  /**
   * The auth collections. They live in the same store as everything else so
   * they get the same durability - a session that vanished on restart would
   * sign every seller out on each deploy, which is exactly the behaviour the
   * registry exists to stop.
   *
   * They are never seeded. `seed()` fills a demo catalogue; inventing sessions
   * or administrators would be inventing credentials.
   */
  sessions: SessionRecord[]
  admins: AdminUser[]
  authEvents: AuthEvent[]
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
    sellers: [], products: [], orders: [], payments: [], customers: [], reviews: [],
    reports: [], complaints: [], sessions: [], admins: [], authEvents: [],
  }
}

export function withDefaults(raw: Partial<Db>): Db {
  return {
    sellers: raw.sellers ?? [],
    products: raw.products ?? [],
    orders: raw.orders ?? [],
    payments: raw.payments ?? [],
    customers: raw.customers ?? [],
    reviews: raw.reviews ?? [],
    reports: raw.reports ?? [],
    complaints: raw.complaints ?? [],
    sessions: raw.sessions ?? [],
    admins: raw.admins ?? [],
    authEvents: raw.authEvents ?? [],
  }
}

export const CATEGORIES: Category[] = [
  { id: 'food',       icon: '🍱', mr: 'घरगुती खाद्यपदार्थ', en: 'Homemade Food',     food: true },
  { id: 'pickle',     icon: '🫙', mr: 'लोणची, पापड, मसाले', en: 'Pickles & Masala',  food: true },
  { id: 'sweets',     icon: '🍬', mr: 'मिठाई व बेकरी',      en: 'Sweets & Bakery',   food: true },
  { id: 'namkeen',    icon: '🥟', mr: 'शेव, भेळ, चिवडा',    en: 'Namkeen & Snacks',  food: true },
  { id: 'handicraft', icon: '🧺', mr: 'हस्तकला',            en: 'Handicrafts',       food: false },
  { id: 'embroidery', icon: '🪡', mr: 'भरतकाम',             en: 'Embroidery',        food: false },
  { id: 'textile',    icon: '🧵', mr: 'कापड व साड्या',      en: 'Textiles & Sarees', food: false },
  { id: 'tailoring',  icon: '✂️', mr: 'शिवणकाम',           en: 'Tailoring',         food: false },
  { id: 'agarbatti',  icon: '🕯️', mr: 'अगरबत्ती व मेणबत्ती', en: 'Agarbatti & Candles', food: false },
  { id: 'jewellery',  icon: '📿', mr: 'दागिने',             en: 'Jewellery',         food: false },
  { id: 'beauty',     icon: '🌿', mr: 'सौंदर्य व आरोग्य',   en: 'Beauty & Wellness', food: false },
  { id: 'decor',      icon: '🪔', mr: 'घर सजावट',           en: 'Home Decor',        food: false },
  { id: 'farm',       icon: '🌾', mr: 'शेतीपूरक उत्पादने',  en: 'Farm Produce',      food: true },
  /**
   * Last, and in both halves of the wizard on purpose.
   *
   * Twelve categories cannot name everything a village makes, and a woman
   * whose product is not on the list had two ways out: file it under something
   * it is not, or stop. The first poisons the category filter for every buyer,
   * the second loses the seller. `food` is absent so this shows whether she
   * said food or handmade - it is the answer for both.
   *
   * It carries no photograph in `categoryPhoto.ts`, deliberately: there is no
   * honest picture of "everything else".
   */
  { id: 'other',      icon: '📦', mr: 'इतर',                en: 'Other' },
]

const digital = (
  s: boolean, i: boolean, u: boolean, w: boolean, sm: boolean, dm: boolean,
): DigitalProfile => ({
  smartphone: s, internet: i, upi: u,
  whatsappBusiness: w, socialMedia: sm, digitalMarketing: dm,
})

/** Score a seed seller with plausible measured factors so the index isn't flat. */
function scored(d: DigitalProfile, measured: [boolean, boolean, boolean, boolean]) {
  const score = computeReadiness(d, {
    hasBranding: measured[0],
    hasPackagingDetail: measured[1],
    hasOnlineOrders: measured[2],
    hasDigitalFinance: measured[3],
  })
  return { readinessScore: score, readinessBand: readinessBand(score) }
}

const now = Date.now()
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString()
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()

const d1 = digital(true, true, true, true, false, false)
const d2 = digital(true, true, true, true, true, true)
const d3 = digital(true, false, false, true, false, false)

export function seed(): Db {
  const sellers: Seller[] = [
    {
      id: 's1',
      womenBizId: 'SMB-ANADUR-01',
      name: 'सुनीता पाटील', photo: '👩🏽', phone: '9822011223', whatsapp: '9822011223',
      age: 38, education: 'secondary',
      village: 'आणदुर', villageCode: 'ANADUR', taluka: 'तुळजापूर', district: 'धाराशिव', pincode: '413601',
      shopName: 'सुनीता गृहउद्योग', shopSlug: 'sunitagruhaudyoga-smb-anadur-01',
      about: 'गेली 12 वर्षे मी घरी लोणची आणि मसाले बनवते. सर्व पदार्थ घरचेच.',
      businessType: 'shg', shgName: 'जिजाऊ महिला बचत गट',
      yearsInBusiness: 12, monthlyCapacity: 120,
      sellsFood: true,
      upiId: 'sunita@ybl', upiVerified: true,
      digital: d1, ...scored(d1, [true, true, true, true]),
      isOpen: true, deliveryFee: 20, freeDeliveryAbove: 500, minOrder: 100,
      dispatch: 'same', pincodes: ['413601', '413602', '413604'],
      status: 'ACTIVE', packsApproved: 1, rating: 4.6, ratingCount: 38,
      qrScans: 41, qrOrders: 7, createdAt: daysAgo(90),
    },
    {
      id: 's2',
      womenBizId: 'SMB-JEVALI-01',
      name: 'मंगल जाधव', photo: '👩🏻', phone: '9764455661', whatsapp: '9764455661',
      age: 45, education: 'middle',
      village: 'जेवळी', villageCode: 'JEVALI', taluka: 'तुळजापूर', district: 'धाराशिव', pincode: '413603',
      shopName: 'मंगल हातमाग', shopSlug: 'mangalahatamaga-smb-jevali-01',
      about: 'बचत गटातर्फे आम्ही हातमागाच्या साड्या आणि चादरी बनवतो.',
      businessType: 'shg', shgName: 'सावित्री महिला बचत गट',
      yearsInBusiness: 8, monthlyCapacity: 25,
      sellsFood: false,
      upiId: 'mangalj@okicici', upiVerified: true,
      digital: d2, ...scored(d2, [true, true, true, true]),
      isOpen: true, deliveryFee: 40, freeDeliveryAbove: 1500, minOrder: 0,
      dispatch: '23', pincodes: ['413603', '413601'],
      status: 'ACTIVE', packsApproved: 2, rating: 4.8, ratingCount: 21,
      qrScans: 12, qrOrders: 2, createdAt: daysAgo(60),
    },
    {
      id: 's3',
      womenBizId: 'SMB-BHOSGA-01',
      name: 'कविता शिंदे', photo: '👩🏾', phone: '9890033441',
      age: 31, education: 'higher',
      village: 'भोसगा', villageCode: 'BHOSGA', taluka: 'तुळजापूर', district: 'धाराशिव', pincode: '413604',
      shopName: 'कविता गृहउद्योग', shopSlug: 'kavitagruhaudyoga-smb-bhosga-01',
      about: 'सणासुदीला लागणारे सर्व घरगुती पदार्थ.',
      businessType: 'individual',
      yearsInBusiness: 3, monthlyCapacity: 60,
      sellsFood: true,
      upiId: 'kavitas@paytm', upiVerified: false,
      digital: d3, ...scored(d3, [false, true, false, false]),
      isOpen: true, deliveryFee: 0, freeDeliveryAbove: 0, minOrder: 150,
      dispatch: '1', pincodes: ['413604', '413601'],
      status: 'ACTIVE', packsApproved: 1, rating: 4.4, ratingCount: 12,
      qrScans: 5, qrOrders: 0, createdAt: daysAgo(20),
    },
  ]

  const products: Product[] = [
    { id: 'p1', sellerId: 's1', emoji: '🫙', name: 'आंब्याचे लोणचे', nameEn: 'Mango Pickle',
      categoryId: 'pickle', isFood: true,
      ingredients: 'कैरी, मोहरी, मेथी, हळद, तिखट, तेल, मीठ', vegType: 'veg',
      price: 220, mrp: 250, unit: 'kg', stock: 12, status: 'LIVE', views: 184, createdAt: daysAgo(80) },
    { id: 'p2', sellerId: 's1', emoji: '🌶️', name: 'कांदा लसूण मसाला', nameEn: 'Kanda Lasun Masala',
      categoryId: 'pickle', isFood: true,
      ingredients: 'लाल मिरची, कांदा, लसूण, खोबरे, तीळ, मीठ', vegType: 'veg',
      price: 180, mrp: 200, unit: 'g', stock: 8, status: 'LIVE', views: 141, createdAt: daysAgo(75) },
    { id: 'p3', sellerId: 's1', emoji: '🥟', name: 'तांदळाचे पापड', nameEn: 'Rice Papad',
      categoryId: 'namkeen', isFood: true,
      ingredients: 'तांदूळ पीठ, जिरे, मीठ, पापडखार', vegType: 'veg',
      price: 90, mrp: 0, unit: 'g', stock: 0, status: 'LIVE', views: 63, createdAt: daysAgo(40) },
    { id: 'p4', sellerId: 's1', emoji: '🍯', name: 'घरगुती तूप', nameEn: 'Homemade Ghee',
      categoryId: 'food', isFood: true,
      ingredients: 'गाईचे दूध', vegType: 'veg',
      price: 650, mrp: 700, unit: 'litre', stock: 4, status: 'PENDING', views: 0, createdAt: hoursAgo(20) },
    { id: 'p5', sellerId: 's2', emoji: '🥻', name: 'पैठणी साडी', nameEn: 'Paithani Saree',
      categoryId: 'textile', isFood: false, material: 'रेशीम, जरी',
      price: 8500, mrp: 11000, unit: 'piece', stock: 2, status: 'LIVE', views: 312, createdAt: daysAgo(55) },
    { id: 'p6', sellerId: 's2', emoji: '🧣', name: 'सुती दुपट्टा', nameEn: 'Cotton Dupatta',
      categoryId: 'textile', isFood: false, material: 'सुती कापड',
      price: 450, mrp: 600, unit: 'piece', stock: 15, status: 'LIVE', views: 97, createdAt: daysAgo(50) },
    { id: 'p7', sellerId: 's2', emoji: '🧺', name: 'बांबूची टोपली', nameEn: 'Bamboo Basket',
      categoryId: 'handicraft', isFood: false, material: 'बांबू',
      price: 340, mrp: 0, unit: 'piece', stock: 6, status: 'LIVE', views: 55, createdAt: daysAgo(30) },
    { id: 'p8', sellerId: 's2', emoji: '🪡', name: 'भरतकाम उशी कव्हर', nameEn: 'Embroidered Cushion Cover',
      categoryId: 'embroidery', isFood: false, material: 'सुती कापड, रेशमी धागा',
      price: 280, mrp: 350, unit: 'set', stock: 9, status: 'LIVE', views: 44, createdAt: daysAgo(15) },
    { id: 'p9', sellerId: 's3', emoji: '🍬', name: 'पुरणपोळी', nameEn: 'Puran Poli',
      categoryId: 'sweets', isFood: true,
      ingredients: 'गहू, हरभरा डाळ, गूळ, वेलची, तूप', vegType: 'veg',
      price: 40, mrp: 0, unit: 'piece', stock: 0, madeToOrder: true, status: 'LIVE', views: 208, createdAt: daysAgo(18) },
    { id: 'p10', sellerId: 's3', emoji: '🥮', name: 'बेसन लाडू', nameEn: 'Besan Ladoo',
      categoryId: 'sweets', isFood: true,
      ingredients: 'बेसन, साखर, तूप, वेलची', vegType: 'veg',
      price: 380, mrp: 420, unit: 'kg', stock: 5, status: 'LIVE', views: 133, createdAt: daysAgo(12) },
    { id: 'p11', sellerId: 's3', emoji: '🕯️', name: 'सुगंधी अगरबत्ती', nameEn: 'Incense Sticks',
      categoryId: 'agarbatti', isFood: false, material: 'बांबू काडी, सुगंधी तेल',
      price: 60, mrp: 80, unit: 'set', stock: 30, status: 'LIVE', views: 76, createdAt: daysAgo(6) },
  ]

  const orders: Order[] = [
    {
      id: 'SMB1043', sellerId: 's1', customerId: 'c1',
      customerName: 'प्रिया देशमुख', customerPhone: '9011223344',
      address: 'फ्लॅट 302, शिवसागर अपार्टमेंट, विमाननगर, पुणे',
      landmark: 'सिम्बायोसिस कॉलेजजवळ', pincode: '413601',
      items: [
        { productId: 'p1', name: 'आंब्याचे लोणचे', emoji: '🫙', qty: 1, price: 220 },
        { productId: 'p2', name: 'कांदा लसूण मसाला', emoji: '🌶️', qty: 2, price: 180 },
      ],
      itemsTotal: 580, deliveryFee: 0, total: 580,
      paymentMode: 'UPI', paymentStatus: 'UPI_SUBMITTED', paymentUtr: '431209887654',
      status: 'PLACED', placedAt: hoursAgo(1),
      events: [{ to: 'PLACED', at: hoursAgo(1), by: 'customer' }],
    },
    {
      id: 'SMB1042', sellerId: 's1', customerId: 'c2',
      customerName: 'अनिता कुलकर्णी', customerPhone: '9922334455',
      address: 'घर क्र. 12, गणेश नगर, आणदुर', landmark: 'ग्रामपंचायत ऑफिससमोर', pincode: '413601',
      items: [{ productId: 'p3', name: 'तांदळाचे पापड', emoji: '🥟', qty: 3, price: 90 }],
      itemsTotal: 270, deliveryFee: 20, total: 290,
      paymentMode: 'COD', paymentStatus: 'COD_PENDING',
      status: 'PACKED', placedAt: hoursAgo(6),
      events: [
        { to: 'PLACED', at: hoursAgo(6), by: 'customer' },
        { to: 'ACCEPTED', at: hoursAgo(5), by: 'seller' },
        { to: 'PACKED', at: hoursAgo(2), by: 'seller' },
      ],
    },
    {
      id: 'SMB1039', sellerId: 's1', customerId: 'c3',
      customerName: 'सविता मोरे', customerPhone: '9765544332',
      address: 'मु. पो. रांजणगाव, ता. तुळजापूर', landmark: 'शाळेजवळ', pincode: '413602',
      items: [{ productId: 'p1', name: 'आंब्याचे लोणचे', emoji: '🫙', qty: 2, price: 220 }],
      itemsTotal: 440, deliveryFee: 20, total: 460,
      paymentMode: 'COD', paymentStatus: 'COD_PENDING',
      status: 'OUT_FOR_DELIVERY', placedAt: hoursAgo(28),
      events: [
        { to: 'PLACED', at: hoursAgo(28), by: 'customer' },
        { to: 'ACCEPTED', at: hoursAgo(27), by: 'seller' },
        { to: 'PACKED', at: hoursAgo(25), by: 'seller' },
        { to: 'OUT_FOR_DELIVERY', at: hoursAgo(3), by: 'seller' },
      ],
    },
    {
      id: 'SMB1031', sellerId: 's1', customerId: 'c4',
      customerName: 'रेखा भोसले', customerPhone: '9834455667',
      address: 'सर्वे नं. 45, तुळजापूर रोड, आणदुर', pincode: '413601',
      items: [{ productId: 'p2', name: 'कांदा लसूण मसाला', emoji: '🌶️', qty: 1, price: 180 }],
      itemsTotal: 180, deliveryFee: 20, total: 200,
      paymentMode: 'UPI', paymentStatus: 'UPI_CONFIRMED', paymentUtr: '430918776541',
      status: 'DELIVERED', placedAt: hoursAgo(9),
      events: [
        { to: 'PLACED', at: hoursAgo(9), by: 'customer' },
        { to: 'ACCEPTED', at: hoursAgo(8), by: 'seller' },
        { to: 'PACKED', at: hoursAgo(7), by: 'seller' },
        { to: 'OUT_FOR_DELIVERY', at: hoursAgo(5), by: 'seller' },
        { to: 'DELIVERED', at: hoursAgo(4), by: 'seller' },
      ],
    },
    {
      id: 'SMB1044', sellerId: 's2', customerId: 'c1',
      customerName: 'प्रिया देशमुख', customerPhone: '9011223344',
      address: 'फ्लॅट 302, शिवसागर अपार्टमेंट, विमाननगर, पुणे',
      landmark: 'सिम्बायोसिस कॉलेजजवळ', pincode: '413603',
      items: [{ productId: 'p6', name: 'सुती दुपट्टा', emoji: '🧣', qty: 1, price: 450 }],
      itemsTotal: 450, deliveryFee: 40, total: 490,
      paymentMode: 'COD', paymentStatus: 'COD_PENDING',
      status: 'ACCEPTED', placedAt: hoursAgo(9),
      events: [
        { to: 'PLACED', at: hoursAgo(9), by: 'customer' },
        { to: 'ACCEPTED', at: hoursAgo(8), by: 'seller' },
      ],
    },
  ]

  const payments: SubscriptionPayment[] = [
    { id: 'sp1', sellerId: 's4', sellerName: 'शोभा गायकवाड', womenBizId: 'SMB-CHIVARI-01',
      phone: '9764112233', amount: 50, utr: '512309887711', payerUpi: 'shobha@ybl',
      submittedAt: hoursAgo(4), status: 'PENDING', duplicateUtr: false },
    { id: 'sp2', sellerId: 's5', sellerName: 'वैशाली पवार', womenBizId: 'SMB-RUDRAWADI-01',
      phone: '9822556677', amount: 50, utr: '431209887654', payerUpi: 'vaishali@okhdfcbank',
      submittedAt: hoursAgo(19), status: 'PENDING', duplicateUtr: true },
    { id: 'sp3', sellerId: 's6', sellerName: 'लता कांबळे', womenBizId: 'SMB-ANADUR-02',
      phone: '9011778899', amount: 50, utr: '509911223344', payerUpi: 'lata.k@paytm',
      submittedAt: hoursAgo(50), status: 'PENDING', duplicateUtr: false },
    { id: 'sp4', sellerId: 's1', sellerName: 'सुनीता पाटील', womenBizId: 'SMB-ANADUR-01',
      phone: '9822011223', amount: 50, utr: '401122334455', payerUpi: 'sunita@ybl',
      submittedAt: daysAgo(30), status: 'APPROVED', duplicateUtr: false, verifiedAt: daysAgo(30) },
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
    sellers, products, orders, payments, customers, reviews: [], reports: [], complaints: [],
    sessions: [], admins: [], authEvents: [],
  }
}

