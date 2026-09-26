import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { dictionaries, LANGS } from '../src/i18n/strings.js'

/**
 * The console is bilingual, which is only true if BOTH dictionaries are
 * complete. A missing Marathi string does not crash - `t()` falls back to
 * English - so without this test the failure is invisible until a Marathi
 * speaker opens the screen and finds one English word sitting in the middle
 * of it. That is exactly the bug that survives to production.
 */

test('every language in LANGS has a dictionary', () => {
  for (const { code } of LANGS) {
    assert.ok(dictionaries[code], `no dictionary for ${code}`)
  }
})

test('Marathi and English hold exactly the same keys', () => {
  const mr = Object.keys(dictionaries.mr).sort()
  const en = Object.keys(dictionaries.en).sort()

  const missingFromMr = en.filter((k) => !dictionaries.mr[k])
  const missingFromEn = mr.filter((k) => !dictionaries.en[k])

  assert.deepEqual(missingFromMr, [], 'keys with no Marathi translation')
  assert.deepEqual(missingFromEn, [], 'keys with no English translation')
})

test('no string is left empty in either language', () => {
  for (const [code, dict] of Object.entries(dictionaries)) {
    for (const [key, value] of Object.entries(dict)) {
      assert.ok(value.trim().length > 0, `${code}.${key} is empty`)
    }
  }
})

test('the Marathi dictionary is actually in Marathi', () => {
  // Guards against a copy-paste that leaves English text under the mr key.
  // Some entries are legitimately Latin (UTR, FSSAI), so this checks the bulk
  // rather than every line.
  const devanagari = /[ऀ-ॿ]/
  const values = Object.values(dictionaries.mr)
  const translated = values.filter((v) => devanagari.test(v)).length

  assert.ok(
    translated / values.length > 0.85,
    `only ${translated}/${values.length} Marathi strings contain Devanagari`,
  )
})

test('every seller status the API can return has a label', () => {
  // shared/src/types.ts SellerStatus - if a status is added there and not
  // here, the console would print the raw enum at a woman's account.
  for (const status of [
    'REGISTERED', 'PAYMENT_SUBMITTED', 'ACTIVE', 'PAYMENT_REJECTED', 'BLOCKED',
  ]) {
    assert.ok(dictionaries.mr[`st.${status}`], `no Marathi label for ${status}`)
    assert.ok(dictionaries.en[`st.${status}`], `no English label for ${status}`)
  }
})

test('every admin decision she can be shown has a label', () => {
  // shared/src/types.ts AdminNoticeKind. Her page reads these through a
  // template string, so the usage test below cannot see them - and an
  // unlabelled one prints "nt.SLOTS_GRANTED" in her decision history.
  for (const kind of [
    'SLOTS_GRANTED', 'SLOTS_REVOKED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED',
    'BLOCKED', 'UNBLOCKED', 'PRODUCT_APPROVED', 'PRODUCT_REJECTED',
  ]) {
    assert.ok(dictionaries.mr[`nt.${kind}`], `no Marathi label for ${kind}`)
    assert.ok(dictionaries.en[`nt.${kind}`], `no English label for ${kind}`)
  }
})

/**
 * A key that is asked for but never written renders as its own name - staff
 * read "sd.earned" where a heading should be, in both languages at once,
 * because the fallback is missing too. Nothing else catches it: the parity
 * test above only proves the two dictionaries agree with each other, not that
 * either agrees with the screens.
 */
const SRC = join(import.meta.dirname, '..', 'src')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}

test('every t() key a screen asks for exists in the dictionary', () => {
  const missing = new Set<string>()
  for (const file of sources(SRC)) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/t\(\s*'([a-zA-Z0-9_.]+)'/g)) {
      const key = m[1]!
      if (!(key in dictionaries.mr)) missing.add(`${key}  (${file.replace(SRC, 'src')})`)
    }
  }
  assert.deepEqual([...missing], [], 'these keys would render as their own name')
})
