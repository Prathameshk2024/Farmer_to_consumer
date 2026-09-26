import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  makeWomenBizId, transliterate, VILLAGES, villageCode,
} from '@shared/womenbiz.js'

/**
 * A village is not a dropdown entry. Its code becomes the middle of every ID
 * printed on a woman's packaging and her QR poster, and the serial after it is
 * counted per village so that SMB-YELI-07 tells a field coordinator where to
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
 * down the list, which put four women in the wrong taluka on their own seller
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
  const issued = ['SMB-ANADUR-01', 'SMB-ANADUR-02', 'SMB-JEVALI-01']

  assert.equal(makeWomenBizId('येळी', issued), 'SMB-YELI-01')
  assert.equal(makeWomenBizId('आणदुर', issued), 'SMB-ANADUR-03')
})

test('the serial is two digits: the third woman from a village is 03', () => {
  // Not 003. The number is read aloud over a phone and copied onto packaging
  // by hand, and two digits is what this programme will ever need.
  const issued = ['SMB-CHIVARI-01', 'SMB-CHIVARI-02']
  assert.equal(makeWomenBizId('चिवरी', issued), 'SMB-CHIVARI-03')
})

test('ids issued in the old three-digit format still count correctly', () => {
  // Live records exist as SMB-CHIVARI-001. The serial is parsed as a NUMBER,
  // not compared as a string, so the next woman is 02 rather than a duplicate
  // 01 - and the two formats can sit side by side without a migration.
  assert.equal(makeWomenBizId('चिवरी', ['SMB-CHIVARI-001']), 'SMB-CHIVARI-02')
  assert.equal(
    makeWomenBizId('चिवरी', ['SMB-CHIVARI-001', 'SMB-CHIVARI-002', 'SMB-CHIVARI-03']),
    'SMB-CHIVARI-04',
  )
})

test('येळी counts on from its own last ID, not from the global one', () => {
  const issued = [
    'SMB-ANADUR-01', 'SMB-ANADUR-02', 'SMB-ANADUR-03',
    'SMB-YELI-01', 'SMB-YELI-02',
  ]

  assert.equal(makeWomenBizId('येळी', issued), 'SMB-YELI-03')
})
