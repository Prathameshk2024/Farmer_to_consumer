import test from 'node:test'
import assert from 'node:assert/strict'
import { dictionaries } from '../src/i18n/strings.js'

/**
 * THE MECHANICAL HALF OF docs/MARATHI-STYLE.md, for the console.
 *
 * The same sheet governs all three modules - an admin reading "भरणा" here and
 * a seller reading "पेमेंट" in her own app are being shown two words for one
 * thing, and only one of them can look it up.
 *
 * Marathi ONLY. The English dictionary is an independent piece of writing, not
 * a translation, and nothing here is a reason to change it.
 */

const mr = dictionaries.mr
const everything = Object.entries(mr).map(([k, v]) => ({ where: k, value: v }))

test('postpositions are joined to the word they follow', () => {
  // §1. English and Hindi both put a space there; Marathi does not.
  const postpositions = [
    'मध्ये', 'साठी', 'कडे', 'पर्यंत', 'सोबत', 'पासून', 'नुसार', 'बद्दल', 'शिवाय',
  ]
  const bad: string[] = []
  for (const { where, value } of everything) {
    for (const p of postpositions) {
      if (new RegExp(`[\\u0900-\\u097F]\\s+${p}(\\s|$|[.,?!])`).test(value)) {
        bad.push(`${where} — "${p}" is detached`)
      }
    }
  }
  assert.deepEqual(bad, [])
})

test('ॲ is the single character U+0972, never अ + ZWJ + ॅ', () => {
  // §5. The app ships no web fonts, so the legacy sequence is a gamble on
  // whatever Noto build the reader's machine happens to carry.
  const bad = everything.filter((e) => e.value.includes('अ‍ॅ')).map((e) => e.where)
  assert.deepEqual(bad, [])
})

test('digits are Latin, never Devanagari', () => {
  const bad = everything.filter((e) => /[०-९]/.test(e.value)).map((e) => e.where)
  assert.deepEqual(bad, [])
})

test('one word for one thing', () => {
  // §4, across modules: the console and her app must not name the same object
  // differently, because she is the one who has to recognise it in both.
  const banned: [RegExp, string][] = [
    [/UPI ID/, 'use "UPI आयडी"'],
    [/पाहा/, 'use "पहा"'],
    [/कार्ट/, 'use "टोपली"'],
    [/स्लॉट/, 'use "जागा"'],
    [/प्रॉडक्ट/, 'use "उत्पादन"'],
  ]
  const bad: string[] = []
  for (const { where, value } of everything) {
    for (const [re, fix] of banned) {
      if (re.test(value)) bad.push(`${where} — ${fix}`)
    }
  }
  assert.deepEqual(bad, [])
})

test('no space before punctuation, and no doubled spaces', () => {
  const bad: string[] = []
  for (const { where, value } of everything) {
    if (/\s[,.?!]/.test(value)) bad.push(`${where} — space before punctuation`)
    if (/ {2}/.test(value)) bad.push(`${where} — doubled space`)
  }
  assert.deepEqual(bad, [])
})

test('every seller is a woman, so she is विक्रेती', () => {
  // Not merely inconsistent: this console exists to administer a market for
  // women, and the word it uses for them is the word that reaches their app.
  const bad = everything.filter((e) => /विक्रेता/.test(e.value)).map((e) => e.where)
  assert.deepEqual(bad, [])
})

test('ऑर्डर is neuter, on both sides of the same order', () => {
  /**
   * §2. It was written feminine for a while - `ऑर्डर आली`, `माझ्या ऑर्डर` -
   * which is the Hindi gender for this loanword, not the Marathi one. Native
   * speakers saw it immediately; nobody reading a diff of 740 strings did.
   *
   * The seller's app and the buyer's app must not disagree about it either.
   * One order is one object, described to two people.
   */
  /**
   * Anchored at a word start. Unanchored, "ही ऑर्डर" matches inside
   * "कुठेही ऑर्डर" and "तुम्ही ऑर्डर", which are both correct - Devanagari has
   * no \b that helps here, so the boundary is written out.
   */
  const feminine = [
    'ऑर्डर आली', 'ऑर्डर स्वीकारली', 'ऑर्डर पाठवली', 'ऑर्डर पोहोचली',
    'ऑर्डर झाली', 'ऑर्डर केली', 'ऑर्डर मिळाली', 'ऑर्डर रद्द केली',
    'माझ्या ऑर्डर', 'तुमची ऑर्डर', 'ही ऑर्डर', 'पहिली ऑर्डर',
    'शेवटची ऑर्डर', 'आजच्या ऑर्डर', 'तिच्या ऑर्डर', 'अडकलेल्या ऑर्डर',
  ]
  const bad: string[] = []
  for (const { where, value } of everything) {
    for (const f of feminine) {
      if (new RegExp(`(^|\s)${f}`).test(value)) {
        bad.push(`${where} — "${f}" (ऑर्डर is neuter)`)
      }
    }
  }
  assert.deepEqual(bad, [])
})
