import type { Order } from '@shared/types.js'

/**
 * Pure helpers, kept out of the components so they can be tested with the
 * repo's existing node:test runner and no DOM library.
 */

/** ₹1,240 - Indian digit grouping, which is not the same as Western. */
export function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

/** 04 Sep, 14:05 - no year; everything on these screens is recent. */
export function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

/**
 * 15 Mar 2027 - a date WITH its year, in IST.
 *
 * `when()` drops the year because everything it prints is recent. A
 * subscription end date is half a year away, and "15 Mar" is ambiguous in
 * exactly the months when it matters.
 */
export function dateOnly(iso: string | undefined): string {
  const d = new Date(iso ?? '')
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  })
}

/**
 * How long something has waited, in the largest whole unit: minutes under an
 * hour, hours under a day, then days. The screen turns it into words.
 */
export function waited(iso: string, now = Date.now()): { n: number; unit: 'min' | 'hour' | 'day' } {
  const min = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000))
  if (min < 60) return { n: min, unit: 'min' }
  if (min < 24 * 60) return { n: Math.floor(min / 60), unit: 'hour' }
  return { n: Math.floor(min / (24 * 60)), unit: 'day' }
}

/**
 * The customer's details, as the ORDERS LIST is allowed to see them.
 *
 * An admin chasing a stuck order needs to know which order and which farmer.
 * The admin does not need the buyer's name, phone and home address on screen
 * while doing it - that is a list of people's home addresses on a console that
 * will live at a public URL.
 *
 * The full details stay one click away inside a specific order, where looking
 * is a deliberate act rather than a side effect of scrolling a queue.
 */
export interface MaskedCustomer {
  initial: string
  phoneTail: string
  pincode: string
}

export function maskCustomer(order: Order): MaskedCustomer {
  const name = (order.customerName ?? '').trim()
  const phone = (order.customerPhone ?? '').replace(/\D/g, '')

  return {
    // One character is enough to tell two orders apart in a list.
    initial: name ? [...name][0]! : '?',
    // Last two digits only. Enough to match against a phone call, useless
    // to anyone reading over a shoulder.
    phoneTail: phone.length >= 2 ? phone.slice(-2) : '',
    // The pincode is operational - it is how deliveries are grouped - and it
    // identifies an area, not a person.
    pincode: order.pincode ?? '',
  }
}

/** "अ ·· 44 · 413601" - what the orders list prints in place of a buyer. */
export function maskedLabel(order: Order): string {
  const m = maskCustomer(order)
  const tail = m.phoneTail ? ` ·· ${m.phoneTail}` : ''
  return `${m.initial}${tail}${m.pincode ? ` · ${m.pincode}` : ''}`
}

/**
 * An order nobody has moved for too long.
 *
 * The thresholds mirror /admin/stats exactly - 24 hours once the farmer has accepted
 * or packed it, 12 once it is out for delivery. Two different numbers on two
 * screens for the same idea is how an admin stops trusting either.
 */
export function isStuck(order: Order, now = Date.now()): boolean {
  const last = order.events[order.events.length - 1]
  if (!last) return false
  const ageH = (now - new Date(last.at).getTime()) / 3_600_000
  if (order.status === 'ACCEPTED' || order.status === 'PACKED') return ageH > 24
  if (order.status === 'OUT_FOR_DELIVERY') return ageH > 12
  return false
}
