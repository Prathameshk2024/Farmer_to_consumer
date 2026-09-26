import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMaharashtraPincode } from '@shared/seller.js'

/**
 * WHO DECIDES WHETHER SHE CAN DELIVER THERE.
 *
 * Her delivery-area list is one pincode - her own - written at registration
 * and never editable, so a buyer one village away was refused by the server
 * before the seller ever saw the order. A woman in 413004 will happily carry a
 * jar of pickle to 413002; nobody asked her.
 *
 * So the list stops being a gate. Anywhere in Maharashtra the order reaches
 * her and she accepts or rejects it herself. Outside Maharashtra it is still
 * refused outright, because that is not a delivery she could make on a bus.
 */

test('a Maharashtra pincode is hers to decide', () => {
  for (const code of ['400001', '413002', '413004', '421301', '431001', '445402']) {
    assert.equal(isMaharashtraPincode(code), true, code)
  }
})

test('anywhere else is refused before it reaches her', () => {
  for (const code of ['110001', '560001', '395001', '500081', '700001']) {
    assert.equal(isMaharashtraPincode(code), false, code)
  }
})

/**
 * Goa is 403xxx, which sits inside the 40-44 band. It is not Maharashtra, and
 * a woman in Dharashiv is not delivering pickle to Panaji.
 */
test('Goa is not Maharashtra', () => {
  for (const code of ['403001', '403507', '403806']) {
    assert.equal(isMaharashtraPincode(code), false, code)
  }
})

/** Not a pincode at all is not a delivery address either. */
test('junk is not a delivery area', () => {
  for (const bad of ['', '41300', '4130044', 'abcdef', undefined]) {
    assert.equal(isMaharashtraPincode(bad), false, String(bad))
  }
})
