import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialsOf } from '../src/lib/initials.js'

/**
 * Sellers are shown by their initials rather than by a shared 👩, and almost
 * every one of those names is in Devanagari - where the obvious implementation
 * is quietly wrong.
 *
 * `'सुनीता'.slice(0, 1)` is स. The ु that makes it सु is a separate code
 * point, so slicing drops it and prints a letter she would not recognise as
 * the start of her own name. That is the bug this file exists to prevent, and
 * it is invisible to anyone testing with Latin names.
 */

test('a Marathi name keeps its vowel sign', () => {
  // The regression test. स would be wrong; सु is how the name starts.
  assert.equal(initialsOf('सुनीता'), 'सु')
})

test('a Marathi full name gives one akshara, not two', () => {
  // अ क is not how an initial is written in Marathi - it reads as a misspelt
  // word rather than as a monogram.
  assert.equal(initialsOf('सुनीता पाटील'), 'सु')
  // अर्पिता is अ + र्पि + ता: the र् binds forward to the प, so the first
  // written letter is the bare अ.
  assert.equal(initialsOf('अर्पिता कुंभार'), 'अ')
})

test('a conjunct is kept whole, not cut at the halant', () => {
  // क् on its own is a half-form. It does not stand alone and reads as a typo,
  // so the virama has to pull the following consonant in with it.
  assert.equal(initialsOf('क्षमा'), 'क्ष')
  assert.equal(initialsOf('विद्या'), 'वि')
})

test('a Latin full name gives the familiar two letters', () => {
  assert.equal(initialsOf('Arpita Kumbhar'), 'AK')
  assert.equal(initialsOf('arpita kumbhar'), 'AK')
})

test('a Latin single name gives one letter', () => {
  assert.equal(initialsOf('Arpita'), 'A')
})

test('a middle name is skipped in favour of the family name', () => {
  // First and last is what people expect from a monogram.
  assert.equal(initialsOf('Arpita Shivaji Kumbhar'), 'AK')
})

test('extra whitespace does not become an initial', () => {
  assert.equal(initialsOf('  Arpita   Kumbhar  '), 'AK')
  assert.equal(initialsOf('   सुनीता  '), 'सु')
})

test('a nameless record renders nothing rather than a stray letter', () => {
  // A customer who has not given her name yet is a real state - see the
  // customer registration flow - and an empty circle is the honest picture.
  for (const empty of ['', '   ', undefined]) {
    assert.equal(initialsOf(empty), '')
  }
})

test('a shop name works as well as a person name', () => {
  // The cart shows sellers by shop, and the profile shows them by person.
  assert.equal(initialsOf('कुंभार गृहउद्योग'), 'कुं')
  assert.equal(initialsOf('Sunita Home Foods'), 'SF')
})

test('the result is never longer than two clusters', () => {
  // It has to fit inside a circle at 40px on a 360px phone.
  for (const name of ['Arpita Kumbhar', 'सुनीता पाटील', 'A B C D E F']) {
    assert.ok(Array.from(initialsOf(name)).length <= 4, `${name} produced ${initialsOf(name)}`)
  }
})
