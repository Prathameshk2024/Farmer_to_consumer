import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { dictionaries } from '../src/i18n/strings.js'

/**
 * THE MECHANICAL HALF OF docs/MARATHI-STYLE.md
 *
 * Most of that sheet is a reading job - gender agreement, word order, whether
 * a sentence sounds like a neighbour or like a form. These are the rules a
 * machine can hold, and they are the ones that come back: every one of them
 * was in the dictionary at some point, and none of them is visible to someone
 * skimming a diff of 740 strings.
 *
 * This file checks Marathi ONLY. The English dictionary is an independent
 * piece of writing, not a translation, and nothing here should ever be read as
 * a reason to change it.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const mr = dictionaries.mr

/** Every Marathi string that ships, wherever it is written. */
function sharedAndBackendMarathi(): { where: string; value: string }[] {
  const files = [
    '../../shared/src/payment.ts',
    '../../shared/src/seller.ts',
    '../../shared/src/orderCancel.ts',
    '../../shared/src/review.ts',
    '../../shared/src/subscription.ts',
    '../../backend/src/routes/products.routes.ts',
    '../../backend/src/db/reviews.ts',
    '../../backend/src/db/orderCancel.ts',
  ].map((p) => path.resolve(here, p))

  const out: { where: string; value: string }[] = []
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/'([^'\n]*[ऀ-ॿ][^'\n]*)'/g)) {
      out.push({ where: `${path.basename(file)}: ${m[1]}`, value: m[1] })
    }
  }
  return out
}

const everything = [
  ...Object.entries(mr).map(([k, v]) => ({ where: k, value: v })),
  ...sharedAndBackendMarathi(),
]

test('postpositions are joined to the word they follow', () => {
  /**
   * §1. The commonest mistake in Marathi UI text, because English and Hindi
   * both put a space there: "बाजार मध्ये" for "बाजारात", "4 थी पर्यंत" for
   * "4 थीपर्यंत". It reads as two words to someone sounding it out.
   */
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
  /**
   * §5. The legacy sequence renders as ॲ only where the font and the shaper
   * cooperate. This app ships no web fonts on purpose - it renders in whatever
   * Noto the phone happens to have - so the sequence is a gamble on a stranger's
   * Android build, and it breaks length and search besides.
   */
  const zwjCandra = 'अ‍ॅ'
  const bad = everything.filter((e) => e.value.includes(zwjCandra)).map((e) => e.where)
  assert.deepEqual(bad, [])
})

test('digits are Latin, never Devanagari', () => {
  // §6, and already a design rule in CLAUDE.md: ₹500 is what is printed on
  // money and shown by every UPI app.
  const bad = everything.filter((e) => /[०-९]/.test(e.value)).map((e) => e.where)
  assert.deepEqual(bad, [])
})

test('one word for one thing', () => {
  /**
   * §4. A synonym reads as a DIFFERENT thing to someone decoding rather than
   * skimming, so the same object keeps the same word on every screen and in
   * all three modules.
   */
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
  // §7. Invisible in a diff, visible on a 5-inch screen.
  const bad: string[] = []
  for (const { where, value } of everything) {
    if (/\s[,.?!]/.test(value)) bad.push(`${where} — space before punctuation`)
    if (/ {2}/.test(value)) bad.push(`${where} — doubled space`)
  }
  assert.deepEqual(bad, [])
})

test('every seller is a woman, so she is विक्रेती', () => {
  /**
   * §4 again, and the one place the wrong word is not merely inconsistent:
   * this market exists for women, and "विक्रेता" tells a seller reading her own
   * app that it was written for somebody else.
   */
  const bad = Object.entries(mr)
    .filter(([, v]) => /विक्रेता/.test(v))
    .map(([k]) => k)
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
