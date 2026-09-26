import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  makeFarmerCode, transliterate, VILLAGES, villageCode,
} from '@shared/farmerCode.js'

/**
 * A village is not a dropdown entry. Its code becomes the middle of every ID
 * printed on a woman's packaging and her QR poster, and the serial after it is
 * counted per village so that F2C-YELI-007 tells a field coordinator where to
 * go. That makes adding a village a data change with two obligations, and this
 * file is where both are checked.
 */

test('येळी is one of the supported villages', () => {
  const yeli = VILLAGES.find((v) => v.mr === 'येळी')
  assert.ok(yeli, 'येळी is missing from VILLAGES')
  assert.equal(yeli.code, 'YELI')
  assert.equal(yeli.taluka, 'उमरगा')
  assert.equal(yeli.district, 'धाराशिव')
})

/**
 * EACH VILLAGE CARRIES ITS OWN TALUKA.
 *
 * Every row used to say तुळजापूर - true of the first village and then copied
 * down the list, which put four women in the wrong taluka on their own farmer
 * records. The taluka is printed with her address and is how a coordinator
 * works out whose round she is on, so this pins the four that are not
 * Tuljapur. Correct one only against the register.
 */
test('the taluka is the village\'s own, not the first one on the list', () => {
  const taluka = (mr: string) => VILLAGES.find((v) => v.mr === mr)?.taluka

  assert.equal(taluka('आणदुर'), 'तुळजापूर')
  assert.equal(taluka('चिवरी'), 'तुळजापूर')
  assert.equal(taluka('जेवळी'), 'लोहारा')
  assert.equal(taluka('भोसगा'), 'लोहारा')
  assert.equal(taluka('रुद्रवाडी'), 'लोहारा')
  assert.equal(taluka('येळी'), 'उमरगा')

  // The guard against the bug coming back: one taluka for every village is
  // what a copied-down list looks like.
  assert.ok(new Set(VILLAGES.map((v) => v.taluka)).size > 1, 'every village has the same taluka')
})

test('all six survey villages are in धाराशिव', () => {
  for (const v of VILLAGES) assert.equal(v.district, 'धाराशिव', `${v.mr} is filed under ${v.district}`)
})

test('every fixed village code matches what transliteration would produce', () => {
  // The table exists to pin spellings, not to contradict the transliterator.
  // A code that disagrees means the same village would get two different IDs
  // depending on whether she picked it from the list or typed it in.
  for (const v of VILLAGES) {
    assert.equal(
      villageCode(v.mr),
      v.code,
      `${v.mr}: the table says ${v.code}, transliteration says ${transliterate(v.mr)}`,
    )
  }
})

test('every village code is plain uppercase Latin', () => {
  // The ID is read aloud over a phone and typed by people who do not read
  // Devanagari, which is the whole reason the code is not the village name.
  for (const v of VILLAGES) {
    assert.match(v.code, /^[A-Z]+$/, `${v.mr} has an unusable code: ${v.code}`)
  }
})

test('no two villages share a code', () => {
  // Sharing one would merge two villages' serials into a single run, and the
  // ID would stop saying where she is.
  const codes = VILLAGES.map((v) => v.code)
  assert.equal(new Set(codes).size, codes.length, `duplicate code in ${codes.join(', ')}`)
})

test('a new village starts its own serial at 001', () => {
  // Adding येळी must not push existing villages along, and must not inherit a
  // number from them either.
  const issued = ['F2C-ANADUR-001', 'F2C-ANADUR-002', 'F2C-JEVALI-001']

  assert.equal(makeFarmerCode('येळी', issued), 'F2C-YELI-001')
  assert.equal(makeFarmerCode('आणदुर', issued), 'F2C-ANADUR-003')
})

test('the serial is three digits: the third farmer from a village is 003', () => {
  // Zero-padded so every code in a village has the same width on packaging.
  const issued = ['F2C-CHIVARI-001', 'F2C-CHIVARI-002']
  assert.equal(makeFarmerCode('चिवरी', issued), 'F2C-CHIVARI-003')
})

test('the serial is parsed as a number, so it grows past 999 without colliding', () => {
  // The serial is compared as a NUMBER, not a string, and padStart does not
  // truncate - the thousandth farmer is 1000, not a duplicate 000.
  assert.equal(makeFarmerCode('चिवरी', ['F2C-CHIVARI-001']), 'F2C-CHIVARI-002')
  assert.equal(
    makeFarmerCode('चिवरी', ['F2C-CHIVARI-998', 'F2C-CHIVARI-999']),
    'F2C-CHIVARI-1000',
  )
})

test('येळी counts on from its own last ID, not from the global one', () => {
  const issued = [
    'F2C-ANADUR-001', 'F2C-ANADUR-002', 'F2C-ANADUR-003',
    'F2C-YELI-001', 'F2C-YELI-002',
  ]

  assert.equal(makeFarmerCode('येळी', issued), 'F2C-YELI-003')
})
