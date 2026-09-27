import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Two palettes live in one file so the owner can switch with one word in
 * index.html. These tests keep that promise honest: every pair of colours
 * a person reads stays readable in sunlight in BOTH palettes, the admin
 * console carries the same palette, and no component smuggles in a colour
 * of its own that a switch would leave behind.
 */
const root = fileURLToPath(new URL('../../', import.meta.url))
const theme = readFileSync(join(root, 'frontend/src/styles/theme.css'), 'utf8')
const admin = readFileSync(join(root, 'admin/src/styles/admin.css'), 'utf8')

function block(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector + ' {')
  assert.ok(start >= 0, `missing ${selector}`)
  const body = css.slice(start, css.indexOf('}', start))
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim()
  return out
}
const SOIL = ':root[data-palette="soil"]'
const FIELD = ':root[data-palette="field"]'

function lum(hex: string): number {
  const n = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!)
}
function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}
function resolve(p: Record<string, string>, v: string): string {
  const m = v.match(/^var\(--([\w-]+)\)$/)
  return m ? resolve(p, p[m[1]!]!) : v
}

const READ_PAIRS: [string, string, number][] = [
  ['ink', 'bg', 4.5], ['ink-2', 'bg', 4.5], ['ink-3', 'bg', 4.5], ['ink-3', 'surface', 4.5],
  ['#ffffff', 'soil', 4.5], ['#ffffff', 'leaf', 4.5], ['soil', 'bg', 4.5], ['soil', 'surface', 4.5],
  ['maroon', 'surface', 4.5], ['gold-deep', 'surface', 4.5], ['ink', 'gold-band', 4.5], ['ink', 'gold', 4.5],
  ['ok', 'ok-soft', 4.5], ['warn', 'warn-soft', 4.5], ['danger', 'danger-soft', 4.5], ['info', 'info-soft', 4.5],
  ['cult-natural', 'cult-natural-soft', 4.5], ['cult-organic', 'cult-organic-soft', 4.5],
  ['cult-chemical', 'cult-chemical-soft', 4.5], ['leaf', 'leaf-soft', 4.5],
]

for (const [name, sel] of [['A soil & turmeric', SOIL], ['B field & monsoon', FIELD]] as const) {
  test(`palette ${name}: every text/background pair people read passes AA`, () => {
    const p = block(theme, sel)
    for (const [fg, bg, min] of READ_PAIRS) {
      const a = fg.startsWith('#') ? fg : resolve(p, p[fg] ?? assert.fail(`${sel} lacks --${fg}`))
      const b = resolve(p, p[bg] ?? assert.fail(`${sel} lacks --${bg}`))
      assert.ok(ratio(a, b) >= min, `${name}: ${fg} on ${bg} is ${ratio(a, b).toFixed(2)}:1`)
    }
  })
}

test('both palettes define the same tokens, so a switch leaves nothing unset', () => {
  assert.deepEqual(Object.keys(block(theme, FIELD)).sort(), Object.keys(block(theme, SOIL)).sort())
})

test('the admin console carries exactly the same two palettes', () => {
  assert.deepEqual(block(admin, SOIL), block(theme, SOIL))
  assert.deepEqual(block(admin, FIELD), block(theme, FIELD))
})

test('no component or stylesheet outside the palette blocks hard-codes a colour', () => {
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (!/\.(tsx|css)$/.test(f)) continue
      let src = readFileSync(full, 'utf8')
      if (/theme\.css$|admin\.css$/.test(f)) {
        // only the palette blocks may name a hex colour
        src = src.replace(/:root\[data-palette="(soil|field)"\][^{]*\{[^}]*\}/g, '')
      }
      src = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
        if (/QrCode\.tsx$/.test(f)) continue // the QR must stay dark-on-white whatever the palette
        offenders.push(`${full.slice(root.length)}: ${m[0]}`)
      }
    }
  }
  walk(join(root, 'frontend/src'))
  walk(join(root, 'admin/src'))
  assert.deepEqual(offenders, [])
})

test('index.html of both apps picks a palette by one attribute', () => {
  for (const app of ['frontend', 'admin']) {
    const html = readFileSync(join(root, app, 'index.html'), 'utf8')
    assert.match(html, /<html[^>]*data-palette="(soil|field)"/)
  }
})

test('no rule puts light text on turmeric: white on --gold is 2:1 in sunlight', () => {
  // The pair ['on-dark', 'gold'] must FAIL AA in palette A, which is why it
  // is not in READ_PAIRS - text on --gold is --ink, and this holds that.
  assert.ok(ratio(resolve(block(theme, SOIL), 'var(--on-dark)'), block(theme, SOIL).gold!) < 4.5)
  const offenders: string[] = []
  for (const [file, css] of [['theme.css', theme], ['admin.css', admin]] as const) {
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = m[2]!
      if (/background(-color)?:\s*var\(--gold\)/.test(body) && /(^|[;\s])color:\s*var\(--(on-dark|surface)\)/.test(body)) {
        offenders.push(`${file}: ${m[1]!.trim()}`)
      }
    }
  }
  assert.deepEqual(offenders, [])
})
