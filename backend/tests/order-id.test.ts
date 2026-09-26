import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newShortId } from '../src/db/ids.js'

/**
 * An order id is money's name. The seller reads it back over the phone, the
 * customer quotes it when she asks where her packet is, and a UPI payment is
 * reconciled against it by hand. Every lookup in the API is a find-first, so
 * the day two orders share an id the second buyer opens the first buyer's
 * order and the wrong woman is credited with the payment.
 *
 * SMB ids are four digits - 9,000 of them - which is small enough that the
 * birthday bound makes a repeat an even bet at about 112 orders. The draw is
 * therefore only ever a proposal; this file is the check that it is verified
 * against the register before it becomes an order.
 */

/** The register the route passes in: the orders already saved. */
const register = (ids: Iterable<string>) => {
  const used = new Set(ids)
  return (id: string) => used.has(id)
}

test('an id already in the register is never handed out again', () => {
  // 8,999 of the 9,000 are spoken for. Two hundred draws against that and not
  // one of them may land on an order that already exists - the id that comes
  // back is either the single free short one or the long fallback, and never
  // somebody else's.
  const all = Array.from({ length: 9000 }, (_, n) => `SMB${1000 + n}`)
  const taken = register(all.filter((id) => id !== 'SMB9999'))
  for (let i = 0; i < 200; i += 1) {
    const id = newShortId('SMB', taken)
    assert.ok(!taken(id), `${id} belongs to an order that already exists`)
  }
})

test('a full space still yields an unused id rather than a clash', () => {
  // Past a few thousand live orders the short draws start missing entirely.
  // The fallback is longer and uglier on a receipt, and it is still hers
  // alone - refusing to mint an id would mean refusing a paid order.
  const all = Array.from({ length: 9000 }, (_, n) => `SMB${1000 + n}`)
  const taken = register(all)
  const id = newShortId('SMB', taken)
  assert.ok(!taken(id), `${id} was already taken`)
  assert.match(id, /^SMB/)
})

test('ten thousand orders in a row never repeat an id', () => {
  // Straight through the point where the short space runs out. Without the
  // check this fails inside the first few hundred.
  const issued = new Set<string>()
  for (let i = 0; i < 10_000; i += 1) {
    const id = newShortId('SMB', (x) => issued.has(x))
    assert.ok(!issued.has(id), `${id} was issued twice, on order ${i + 1}`)
    issued.add(id)
  }
})

test('a register that claims everything fails loudly instead of hanging', () => {
  // This cannot happen with a real order list, and the loop that answers it
  // still has to be bounded: a checkout that never returns is worse than one
  // that errors.
  assert.throws(() => newShortId('SMB', () => true), /Could not mint/)
})
