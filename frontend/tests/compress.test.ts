import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPRESSION, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, MIN_QUALITY, fitWithin, qualitySteps,
} from '../src/lib/compress.js'

/**
 * EVERY IMAGE IS COMPRESSED BEFORE IT LEAVES THE PHONE.
 *
 * Product photos, her bank's QR and the payment screenshot all go through one
 * upload path. A 4MB camera photo or a 2MB screenshot PNG on village 4G is the
 * upload a woman gives up on; a few hundred KB is not. The canvas work needs a
 * browser, so these hold the numbers it runs on.
 */

test('nothing over 5MB is accepted off the picker', () => {
  assert.equal(MAX_UPLOAD_MB, 5)
  assert.equal(MAX_UPLOAD_BYTES, 5 * 1024 * 1024)
})

test('a 12MP camera photo comes down to 1200px on its long edge, aspect kept', () => {
  assert.deepEqual(fitWithin(4000, 3000, COMPRESSION.product.maxEdge), { width: 1200, height: 900 })
  assert.deepEqual(fitWithin(3000, 4000, COMPRESSION.product.maxEdge), { width: 900, height: 1200 })
})

test('a small image is never enlarged', () => {
  assert.deepEqual(fitWithin(640, 480, COMPRESSION.product.maxEdge), { width: 640, height: 480 })
})

/**
 * The admin reads twelve digits, a date and a time off the payment screenshot.
 * Shrunk like a product photo, a tall 1080x2400 screenshot would be 540px wide
 * and the UTR goes soft; it keeps its full width instead.
 */
test('a payment screenshot keeps enough pixels to read the UTR on it', () => {
  const shot = fitWithin(1080, 2400, COMPRESSION.payment.maxEdge)
  assert.ok(shot.width >= 800, `screenshot shrunk to ${shot.width}px wide`)
  assert.ok(COMPRESSION.payment.quality >= COMPRESSION.product.quality)
})

test('every kind aims well under the upload limit', () => {
  for (const c of Object.values(COMPRESSION)) {
    assert.ok(c.targetBytes < 1_000_000)
  }
})

test('quality steps down from the start, best first, and never below the floor', () => {
  assert.deepEqual(qualitySteps(0.85), [0.85, 0.75, 0.65, 0.55])
  assert.deepEqual(qualitySteps(0.78), [0.78, 0.68, 0.58])
  assert.ok(qualitySteps(0.3).every((q) => q >= MIN_QUALITY))
})
