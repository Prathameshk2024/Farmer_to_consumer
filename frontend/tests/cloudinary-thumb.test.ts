import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cloudinaryThumb } from '../src/lib/upload.js'

/**
 * A card asks Cloudinary for the box it draws, not a square cut from it:
 * where the photo leads at 4:3, a square crop threw away the top and bottom
 * of the picture and still paid for the pixels.
 */
const url = 'https://res.cloudinary.com/demo/image/upload/v1/products/a.jpg'

test('a square box asks for a square photo, as every old caller did', () => {
  assert.equal(cloudinaryThumb(url, 800),
    'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,w_800,h_800/v1/products/a.jpg')
})

test('a 4:3 box asks for three quarters of the width in height', () => {
  assert.match(cloudinaryThumb(url, 800, 4 / 3), /c_fill,w_800,h_600\//)
  assert.match(cloudinaryThumb(url, 250, 4 / 3), /w_250,h_188\//)
})

test('a photo that is not on Cloudinary is left alone', () => {
  assert.equal(cloudinaryThumb('/assets/pickle.jpg', 800, 4 / 3), '/assets/pickle.jpg')
})
