import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMaharashtraPincode } from '@shared/farmer.js'

/**
 * WHO DECIDES WHETHER THE FARMER CAN DELIVER THERE.
 *
 * The farmer's delivery-area list is one pincode - their own - written at registration
 * and never editable, so a buyer one village away was refused by the server
 * before the farmer ever saw the order. A farmer in 413004 will happily carry a
 * crate of onions to 413002; nobody asked them.
 *
 * So the list stops being a gate. Anywhere in Maharashtra the order reaches
 * the farmer and they accept or reject it themselves. Outside Maharashtra it is still
 * refused outright, because that is not a delivery they could make on a bus.
 */

test('a Maharashtra pincode is theirs to decide', () => {
  for (const code of ['400001', '413002', '413004', '421301', '431001', '445402']) {
    assert.equal(isMaharashtraPincode(code), true, code)
  }
})

test('anywhere else is refused before it reaches the farmer', () => {
  for (const code of ['110001', '560001', '395001', '500081', '700001']) {
    assert.equal(isMaharashtraPincode(code), false, code)
  }
})

/**
 * Goa is 403xxx, which sits inside the 40-44 band. It is not Maharashtra, and
 * a farmer in Dharashiv is not delivering onions to Panaji.
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
