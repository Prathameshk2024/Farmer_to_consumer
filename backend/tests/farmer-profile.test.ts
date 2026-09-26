import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultAbout, validateFarmerProfile } from '@shared/farmer.js'

/**
 * A new farmer's shop page should not be blank.
 *
 * `about` is optional at registration, and most farmers skip it - it is the one
 * free-text field in a long form, on a phone, in Marathi. Left empty, the shop
 * opens with a name and nothing else, which reads as an abandoned listing to
 * the first customer who finds it.
 *
 * So it is composed from what the farmer already told us. They can replace it any time
 * from My Business; this only fills the gap.
 */

const base = { shopName: 'राजेश पाटील', village: 'अणदूर' }

test('a shop with no description gets one built from the farmer\'s own details', () => {
  const about = defaultAbout(base)

  assert.ok(about.includes('राजेश पाटील'), 'the name')
  assert.ok(about.includes('अणदूर'), 'the village')
})

test('the crops are named, in Marathi', () => {
  const about = defaultAbout({ ...base, crops: ['tomato', 'onion'] })

  assert.ok(about.includes('टोमॅटो, कांदा'))
})

test('it is a sentence, not a template with holes in it', () => {
  for (const about of [defaultAbout(base), defaultAbout({ ...base, crops: ['nonsense', 'other'] })]) {
    assert.ok(!about.includes('undefined'))
    assert.ok(!about.includes('  '), 'no double spaces from a missing value')
    assert.ok(!about.includes('इतर'), '"other" is not a crop to advertise')
    assert.ok(about.trim() === about)
  }
})

/* ------------------------------------------------------------------ */
/* What a farmer may change about themselves                           */
/* ------------------------------------------------------------------ */

/**
 * The allow-list on PATCH /farmers/me decides WHICH fields can move - status
 * and farmer code are not on it. This decides whether the values are
 * usable, and it runs on the server because the form is not the rule: anything
 * holding their token can send a delivery fee of -500.
 */

test('an edit that clears a required field is refused', () => {
  assert.equal(validateFarmerProfile({ name: '   ' }).name, 'नाव आवश्यक आहे')
  assert.equal(validateFarmerProfile({ shopName: '' }).shopName, 'दुकानाचे नाव आवश्यक आहे')
})

/** Absent is not empty: the farmer is editing the shop name, not deleting the UPI ID. */
test('a field the farmer did not send is not validated', () => {
  assert.deepEqual(validateFarmerProfile({ shopName: 'अर्पिता गृह उद्योग' }), {})
})

test('money and counts can never be negative', () => {
  const f = validateFarmerProfile({ deliveryFee: -20, minOrder: -1, freeDeliveryAbove: -5 })

  assert.ok(f.deliveryFee, 'a negative delivery fee would pay the customer')
  assert.ok(f.minOrder)
  assert.ok(f.freeDeliveryAbove)
  assert.deepEqual(validateFarmerProfile({ deliveryFee: 0, minOrder: 100 }), {}, 'free delivery is legal')
})

test('a UPI id that cannot be paid is refused', () => {
  assert.ok(validateFarmerProfile({ upiId: 'sunita' }).upiId)
  assert.deepEqual(validateFarmerProfile({ upiId: 'sunita@ybl' }), {})
})

/** The farmer's delivery pincodes are where orders come from. A typo is a lost order. */
test('every delivery pincode has to be a pincode', () => {
  assert.ok(validateFarmerProfile({ pincodes: ['413601', '41360'] }).pincodes)
  assert.deepEqual(validateFarmerProfile({ pincodes: ['413601', '413606'] }), {})
})
