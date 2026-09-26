import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultAbout, validateSellerProfile } from '@shared/seller.js'

/**
 * A new seller's shop page should not be blank.
 *
 * `about` is optional at registration, and most women skip it - it is the one
 * free-text field in a long form, on a phone, in Marathi. Left empty, her shop
 * opens with a name and nothing else, which reads as an abandoned listing to
 * the first customer who finds it.
 *
 * So it is composed from what she already told us. She can replace it any time
 * from My Business; this only fills the gap.
 */

const base = {
  shopName: 'अर्पिता गृह उद्योग',
  village: 'आणदुर',
  businessType: 'individual' as const,
  sellsFood: false,
}

test('a shop with no description gets one built from her own details', () => {
  const about = defaultAbout(base)

  assert.ok(about.includes('अर्पिता गृह उद्योग'), 'her shop name')
  assert.ok(about.includes('आणदुर'), 'her village')
  assert.ok(about.length > 0)
})

test('a food seller is described as one', () => {
  const about = defaultAbout({ ...base, sellsFood: true })

  assert.ok(about.includes('घरगुती'), 'homemade is the whole proposition for food')
})

test('a self-help group is named, because that is her credibility', () => {
  const about = defaultAbout({ ...base, businessType: 'shg', shgName: 'जय भवानी बचत गट' })

  assert.ok(about.includes('जय भवानी बचत गट'))
})

test('an SHG with no group name does not leave a dangling phrase', () => {
  const about = defaultAbout({ ...base, businessType: 'shg' })

  assert.ok(!about.includes('undefined'))
  assert.ok(!about.includes('  '), 'no double spaces from a missing value')
})

test('it is a sentence, not a template with holes in it', () => {
  const about = defaultAbout(base)

  assert.ok(!about.includes('{'))
  assert.ok(!about.includes('undefined'))
  assert.ok(about.trim() === about)
})

test('years in business are mentioned when she gave them', () => {
  const about = defaultAbout({ ...base, yearsInBusiness: 5 })

  assert.ok(about.includes('5'))
})

test('zero years is not mentioned as an achievement', () => {
  const about = defaultAbout({ ...base, yearsInBusiness: 0 })

  assert.ok(!about.includes('0 '), 'a brand new business should not advertise it')
})

/* ------------------------------------------------------------------ */
/* What she may change about herself                                   */
/* ------------------------------------------------------------------ */

/**
 * The allow-list on PATCH /sellers/me decides WHICH fields can move - status,
 * slots and her SMB ID are not on it. This decides whether the values are
 * usable, and it runs on the server because the form is not the rule: anything
 * holding her token can send a delivery fee of -500.
 */

test('an edit that clears a required field is refused', () => {
  assert.equal(validateSellerProfile({ name: '   ' }).name, 'नाव आवश्यक आहे')
  assert.equal(validateSellerProfile({ shopName: '' }).shopName, 'दुकानाचे नाव आवश्यक आहे')
})

/** Absent is not empty: she is editing her shop name, not deleting her age. */
test('a field she did not send is not validated', () => {
  assert.deepEqual(validateSellerProfile({ shopName: 'अर्पिता गृह उद्योग' }), {})
})

test('money and counts can never be negative', () => {
  const f = validateSellerProfile({ deliveryFee: -20, minOrder: -1, monthlyCapacity: -5 })

  assert.ok(f.deliveryFee, 'a negative delivery fee would pay the customer')
  assert.ok(f.minOrder)
  assert.ok(f.monthlyCapacity)
  assert.deepEqual(validateSellerProfile({ deliveryFee: 0, minOrder: 100 }), {}, 'free delivery is legal')
})

test('a UPI id that cannot be paid is refused', () => {
  assert.ok(validateSellerProfile({ upiId: 'sunita' }).upiId)
  assert.deepEqual(validateSellerProfile({ upiId: 'sunita@ybl' }), {})
})

/** Her delivery pincodes are where orders come from. A typo is a lost order. */
test('every delivery pincode has to be a pincode', () => {
  assert.ok(validateSellerProfile({ pincodes: ['413601', '41360'] }).pincodes)
  assert.deepEqual(validateSellerProfile({ pincodes: ['413601', '413606'] }), {})
})

test('age stays inside the range the registration form asks for', () => {
  assert.ok(validateSellerProfile({ age: 12 }).age)
  assert.ok(validateSellerProfile({ age: 120 }).age)
  assert.deepEqual(validateSellerProfile({ age: 34 }), {})
})
