import crypto from 'node:crypto'
import type { Address, Customer, Order } from '@shared/types.js'
import type { Db } from './seed.js'
import { newId } from './ids.js'

/**
 * CUSTOMER RECORDS
 * ================
 * Every function here takes the customer id the caller is *authenticated as*
 * and will not touch anything filed under a different id. That is the whole
 * privacy rule, kept in one place: the routes are thin wrappers that pass
 * `req.auth.customerId` straight through and never read an id from the body.
 *
 * An address id is looked up only inside that customer's own array, so a
 * guessed id belonging to someone else is indistinguishable from one that does
 * not exist - the caller cannot tell the difference, and neither outcome
 * reveals anything.
 *
 * Pure functions over a `Db`: no Firestore, no request objects, no module
 * state. Persisting is the caller's job, by calling `save()` afterwards.
 */

/** The phone IS the account, so the id is derived rather than allocated. */
export function customerIdFor(phone: string): string {
  return `c-${String(phone).replace(/\D/g, '')}`
}

export function findCustomer(db: Db, customerId: string): Customer | undefined {
  return db.customers.find((c) => c.id === customerId)
}

/** Fetch her record, creating an empty one the first time she is seen. */
export function ensureCustomer(
  db: Db,
  customerId: string,
  phone: string,
  name?: string,
): Customer {
  const existing = findCustomer(db, customerId)
  if (existing) {
    if (name && isRealName(name)) {
      existing.name = name
      existing.updatedAt = new Date().toISOString()
    }
    return existing
  }

  const now = new Date().toISOString()
  const customer: Customer = {
    id: customerId,
    phone: String(phone).replace(/\D/g, ''),
    name: name && isRealName(name) ? name : '',
    addresses: [],
    createdAt: now,
    updatedAt: now,
  }
  db.customers.push(customer)
  return customer
}

/**
 * The checkout placeholder must never overwrite a name she actually gave us.
 * One anonymous order would otherwise erase it.
 */
export const PLACEHOLDER_NAME = 'ग्राहक'

function isRealName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length > 0 && trimmed !== PLACEHOLDER_NAME
}

/**
 * Is this customer REGISTERED, as opposed to merely authenticated?
 *
 * A verified phone proves who she is; it does not finish an account. The name
 * does, because the name is what the seller reads on the order and what she is
 * called when a woman in a village phones her about a delivery. So a record
 * that exists but carries no name - or carries the ग्राहक placeholder a
 * checkout left behind - is not registered, and login sends her to the one
 * screen that asks for it.
 *
 * This lives here rather than in the route so the login check and the customer
 * record cannot drift apart about what "registered" means.
 */
export function isRegisteredCustomer(db: Db, customerId: string): boolean {
  const name = findCustomer(db, customerId)?.name
  return name ? isRealName(name) : false
}

export interface AddressInput {
  label?: string
  line: string
  landmark?: string
  city?: string
  pincode: string
  isDefault?: boolean
}

/** Two addresses are the same place if the line and the pincode match. */
function samePlace(a: { line: string; pincode: string }, b: { line: string; pincode: string }) {
  return (
    a.line.trim().toLowerCase() === b.line.trim().toLowerCase() &&
    a.pincode.trim() === b.pincode.trim()
  )
}

export function addAddress(db: Db, customerId: string, input: AddressInput): Address | null {
  const customer = findCustomer(db, customerId)
  if (!customer) return null

  const existing = customer.addresses.find((a) => samePlace(a, input))
  if (existing) return existing

  const address: Address = {
    id: newId('a'),
    label: input.label?.trim() || 'घर',
    line: input.line.trim(),
    landmark: input.landmark?.trim() || undefined,
    city: input.city?.trim() || undefined,
    pincode: input.pincode.trim(),
    // The first address she saves is her default; there is nothing to compare
    // it against and asking her to choose would be a pointless question.
    isDefault: customer.addresses.length === 0 || input.isDefault === true,
  }

  if (address.isDefault) clearOtherDefaults(customer, address.id)
  customer.addresses.push(address)
  customer.updatedAt = new Date().toISOString()
  return address
}

export function updateAddress(
  db: Db,
  customerId: string,
  addressId: string,
  patch: Partial<AddressInput>,
): Address | null {
  const customer = findCustomer(db, customerId)
  if (!customer) return null

  // Looked up only within her own addresses - somebody else's id finds nothing.
  const address = customer.addresses.find((a) => a.id === addressId)
  if (!address) return null

  if (patch.label !== undefined) address.label = patch.label.trim() || address.label
  if (patch.line !== undefined) address.line = patch.line.trim()
  if (patch.landmark !== undefined) address.landmark = patch.landmark.trim() || undefined
  if (patch.city !== undefined) address.city = patch.city.trim() || undefined
  if (patch.pincode !== undefined) address.pincode = patch.pincode.trim()

  if (patch.isDefault === true) {
    address.isDefault = true
    clearOtherDefaults(customer, address.id)
  }

  customer.updatedAt = new Date().toISOString()
  return address
}

export function deleteAddress(db: Db, customerId: string, addressId: string): boolean {
  const customer = findCustomer(db, customerId)
  if (!customer) return false

  const index = customer.addresses.findIndex((a) => a.id === addressId)
  if (index === -1) return false

  const [removed] = customer.addresses.splice(index, 1)

  // Never leave her with addresses but no default - the checkout picker would
  // have nothing to preselect.
  if (removed?.isDefault && customer.addresses.length > 0) {
    customer.addresses[0]!.isDefault = true
  }

  customer.updatedAt = new Date().toISOString()
  return true
}

function clearOtherDefaults(customer: Customer, keepId: string): void {
  for (const a of customer.addresses) {
    if (a.id !== keepId) a.isDefault = false
  }
}

/**
 * Record the customer behind an order she has just placed.
 *
 * This is what makes checkout remember her: the delivery address she typed is
 * kept, so next time it is waiting for her instead of a blank form. There is
 * no "save this address?" checkbox - for a first-time smartphone user one
 * fewer decision is worth more than the control, and she can edit them later.
 */
export function recordOrderCustomer(db: Db, order: Order): Customer {
  const customer = ensureCustomer(
    db,
    order.customerId,
    order.customerPhone,
    order.customerName,
  )

  if (order.address?.trim()) {
    addAddress(db, customer.id, {
      line: order.address,
      landmark: order.landmark,
      pincode: order.pincode,
    })
  }

  customer.updatedAt = new Date().toISOString()
  return customer
}

/* ------------------------------------------------------------------ */
/* Deriving customers from orders                                      */
/* ------------------------------------------------------------------ */

/**
 * Address ids derived from the place itself, not from a counter or a clock.
 * Re-deriving the same order twice has to produce the same id, otherwise every
 * run of the backfill would rewrite every address document for no reason.
 */
function derivedAddressId(line: string, pincode: string): string {
  const key = `${line.trim().toLowerCase()}|${pincode.trim()}`
  return `a${crypto.createHash('sha1').update(key).digest('hex').slice(0, 10)}`
}

/**
 * Rebuild customer records from the order history.
 *
 * Grouped by `customerPhone`, never by `customerId`: the seeded orders carry
 * ids like `c1` while login issues `c-<phone>`, so the id cannot be trusted as
 * an identity. The phone can.
 *
 * Used in two places on purpose - the seed calls it so a fresh install has
 * coherent customers, and the backfill script calls it against live data - so
 * both paths produce byte-identical records.
 */
export function deriveCustomersFromOrders(orders: Order[]): Customer[] {
  const byPhone = new Map<string, Order[]>()

  for (const o of orders) {
    const phone = String(o.customerPhone ?? '').replace(/\D/g, '')
    if (!phone) continue
    const list = byPhone.get(phone)
    if (list) list.push(o)
    else byPhone.set(phone, [o])
  }

  const customers: Customer[] = []

  for (const [phone, group] of byPhone) {
    // Newest first: her latest order is the best evidence of her current name
    // and of which address she is actually using.
    const sorted = [...group].sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1))
    const newest = sorted[0]!
    const oldest = sorted[sorted.length - 1]!

    const addresses: Address[] = []
    for (const o of sorted) {
      if (!o.address?.trim()) continue
      const id = derivedAddressId(o.address, o.pincode)
      if (addresses.some((a) => a.id === id)) continue
      addresses.push({
        id,
        label: 'घर',
        line: o.address.trim(),
        landmark: o.landmark?.trim() || undefined,
        pincode: o.pincode,
        // First one appended came from the newest order, so it is the one she
        // used most recently.
        isDefault: addresses.length === 0,
      })
    }

    customers.push({
      id: customerIdFor(phone),
      phone,
      name: isRealName(newest.customerName) ? newest.customerName : '',
      addresses,
      createdAt: oldest.placedAt,
      updatedAt: newest.placedAt,
    })
  }

  return customers
}

/* ------------------------------------------------------------------ */
/* Her buyers                                                          */
/* ------------------------------------------------------------------ */

export interface SellerBuyer {
  customerId: string
  name: string
  phone: string
  /** Completed business only - cancelled and rejected orders are not sales. */
  orderCount: number
  totalSpent: number
  lastOrderAt: string
  lastAddress: string
  pincode: string
}

/** An order that never completed is not money she earned. */
const NOT_A_SALE = new Set(['CANCELLED', 'REJECTED'])

/**
 * The buyers behind a seller's own orders.
 *
 * Scoped to `sellerId` and built ONLY from orders belonging to her. She sees
 * nothing about a buyer beyond what her own order already told her - not the
 * addresses that buyer saved for somebody else, not her orders with another
 * seller. That scoping is the whole privacy rule for this screen, which is why
 * it lives here rather than being assembled in the route.
 *
 * Counts and totals are derived on every call rather than stored. A counter
 * would go wrong the first time an order is cancelled, and go wrong quietly.
 */
export function buyersForSeller(db: Db, sellerId: string): SellerBuyer[] {
  const mine = db.orders.filter((o) => o.sellerId === sellerId)
  const byCustomer = new Map<string, SellerBuyer>()

  // Newest first, so the first order seen for a buyer is her most recent and
  // supplies the name and address the seller should be looking at.
  for (const o of [...mine].sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1))) {
    let buyer = byCustomer.get(o.customerId)

    if (!buyer) {
      buyer = {
        customerId: o.customerId,
        // The stored record is the better name: the order may carry the
        // ग्राहक placeholder from a checkout where she never typed one.
        name: findCustomer(db, o.customerId)?.name || o.customerName,
        phone: o.customerPhone,
        orderCount: 0,
        totalSpent: 0,
        lastOrderAt: o.placedAt,
        lastAddress: o.address,
        pincode: o.pincode,
      }
      byCustomer.set(o.customerId, buyer)
    }

    // A buyer whose every order fell through still belongs on the list, at
    // zero. Dropping her would tell the seller nobody ever tried.
    if (!NOT_A_SALE.has(o.status)) {
      buyer.orderCount += 1
      buyer.totalSpent += o.total
    }
  }

  return [...byCustomer.values()].sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt))
}

export interface OrderCustomerIdUpdate {
  orderId: string
  from: string
  to: string
}

export interface BackfillPlan {
  customers: Customer[]
  /** Orders whose customerId does not match the id derived from their phone. */
  orderUpdates: OrderCustomerIdUpdate[]
  /** Order ids carrying no phone number - reported so they are not lost. */
  skipped: string[]
}

/**
 * Work out what the migration would change, without changing anything.
 *
 * Running this twice in a row must produce an empty `orderUpdates` the second
 * time; that is what makes the script safe to re-run.
 */
export function planBackfill(orders: Order[]): BackfillPlan {
  const customers = deriveCustomersFromOrders(orders)
  const orderUpdates: OrderCustomerIdUpdate[] = []
  const skipped: string[] = []

  for (const o of orders) {
    const phone = String(o.customerPhone ?? '').replace(/\D/g, '')
    if (!phone) {
      skipped.push(o.id)
      continue
    }
    const to = customerIdFor(phone)
    if (o.customerId !== to) {
      orderUpdates.push({ orderId: o.id, from: o.customerId, to })
    }
  }

  return { customers, orderUpdates, skipped }
}
