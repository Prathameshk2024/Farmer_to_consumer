import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { dictionaries } from '../src/i18n/strings.js'

/**
 * Marathi is the default and English is the fallback, which means the two
 * dictionaries have to stay the same shape - a key present in one and missing
 * from the other silently serves the wrong language to whoever is reading.
 *
 * These also catch the bug that prompted them: a seller switched to English
 * and the example text inside the empty inputs stayed in Marathi, because the
 * placeholders had been written straight into the JSX instead of going through
 * `t()`. A label is obviously user-facing text; a placeholder is exactly as
 * visible and just as easy to forget.
 */

const DEVANAGARI = /[ऀ-ॿ]/
const { mr, en } = dictionaries

test('both dictionaries carry exactly the same keys', () => {
  const missingEn = Object.keys(mr).filter((k) => !(k in en))
  const missingMr = Object.keys(en).filter((k) => !(k in mr))
  assert.deepEqual(missingEn, [], 'these keys have no English fallback')
  assert.deepEqual(missingMr, [], 'these keys have no Marathi, which is the default')
})

test('no dictionary value is left empty', () => {
  for (const [lang, dict] of [['mr', mr], ['en', en]] as const) {
    const blank = Object.entries(dict).filter(([, v]) => !v.trim())
    assert.deepEqual(blank.map(([k]) => k), [], `${lang} has empty strings`)
  }
})

/**
 * Two English entries are Devanagari on purpose and only two:
 *
 *  - the college's name in Marathi, printed beside its English name;
 *  - the language chooser's subtitle, which deliberately shows the OTHER
 *    language so a Marathi speaker who lands on an English screen can find
 *    her way back.
 *
 * Anything else in this list is a string somebody forgot to translate.
 */
const ENGLISH_MAY_BE_MARATHI = new Set(['lp.collegeMr', 'onb.chooseLangSub'])

test('the English dictionary is English', () => {
  const untranslated = Object.entries(en)
    .filter(([k, v]) => DEVANAGARI.test(v) && !ENGLISH_MAY_BE_MARATHI.has(k))
    .map(([k]) => k)
  assert.deepEqual(untranslated, [], 'English values still holding Marathi text')
})

/** The mirror of the above: proper nouns and UPI are Latin in both. */
const MARATHI_MAY_BE_LATIN = new Set([
  'app.nameEn', 'lp.collegeEn', 'onb.chooseLangSub', 'ord.paymentUpi',
])

test('the Marathi dictionary is Marathi', () => {
  const untranslated = Object.entries(mr)
    .filter(([k, v]) => !DEVANAGARI.test(v) && !MARATHI_MAY_BE_LATIN.has(k))
    .map(([k]) => k)
  assert.deepEqual(untranslated, [], 'Marathi values that are still English')
})

/* ------------------------------------------------------------------ */
/* What the components actually do with them                           */
/* ------------------------------------------------------------------ */

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sourceFiles(p, found)
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) found.push(p)
  }
  return found
}

const SRC = join(import.meta.dirname, '..', 'src')
const files = sourceFiles(SRC).filter((f) => !f.includes(`${'i18n'}`))

/**
 * The regression guard. A placeholder written as a literal cannot follow the
 * language switch, so it must come from the dictionary.
 */
test('no component hard-codes a Marathi placeholder', () => {
  const offenders: string[] = []
  for (const file of files) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const m = line.match(/placeholder\s*=\s*"([^"]*)"/)
      if (m && DEVANAGARI.test(m[1]!)) {
        offenders.push(`${file.replace(SRC, 'src')}:${i + 1}  ${m[1]}`)
      }
    })
  }
  assert.deepEqual(offenders, [], 'these placeholders never change language')
})

/** A key that does not exist renders as the key itself, in every language. */
test('every t() key a component asks for exists in the dictionary', () => {
  const missing = new Set<string>()
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
      const key = m[1]!
      if (!(key in mr)) missing.add(`${key}  (${file.replace(SRC, 'src')})`)
    }
  }
  assert.deepEqual([...missing], [], 'these keys would render as their own name')
})
