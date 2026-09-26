import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidLatLng, publicLocation, roundCoord } from '@shared/geo.js'

/**
 * A farm is somebody's home. Buyers see where to go to within about a
 * kilometre; the exact point stays with the farmer and the admin.
 */

test('Anadur is a valid point; zero-zero and Europe are not', () => {
  assert.equal(isValidLatLng(17.9936, 76.2336), true)
  assert.equal(isValidLatLng(0, 0), false)
  assert.equal(isValidLatLng(48.85, 2.35), false)
  assert.equal(isValidLatLng(NaN, 76), false)
})

test('public points are rounded to two decimals', () => {
  assert.equal(roundCoord(17.99364), 17.99)
  assert.deepEqual(publicLocation({ lat: 17.99364, lng: 76.23361, locationConsent: true }), { lat: 17.99, lng: 76.23 })
})

test('no consent, no point', () => {
  assert.equal(publicLocation({ lat: 17.99, lng: 76.23, locationConsent: false }), undefined)
  assert.equal(publicLocation({ locationConsent: true }), undefined)
})
