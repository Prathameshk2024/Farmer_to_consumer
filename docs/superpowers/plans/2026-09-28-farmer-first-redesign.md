# Farmer-first Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the farmer + buyer website in the Soil & Turmeric palette with a photo-led, farmer-first landing page, keeping every route, screen and step unchanged.

**Architecture:** All colour lives in one palette block per app (`frontend/src/styles/theme.css`, `admin/src/styles/admin.css`); palette A is the default, palette B is pre-written beside it and chosen by `data-palette` on `<html>`. Components read tokens only. Generated photos are bundled assets imported by the landing and auth screens. Tests guard contrast, palette parity between the two apps, and hard-coded colours.

**Tech Stack:** React + Vite, plain CSS tokens, node:test via tsx, Pillow (Python) for image compression, higgsfield `generate_image` for photos.

**Spec:** `docs/superpowers/specs/2026-09-28-farmer-first-redesign-design.md` (approved; palette A chosen, landing layout A, app-screen direction approved; palette B pre-defined for a one-attribute switch).

## Global Constraints

- Flow unchanged: no route, screen, step, button, tab or API change. Only styling, the landing arrangement, new landing copy keys and photo bands.
- Marathi first, English toggle; every string through `t()` in both dictionaries; placeholders too; Marathi per `docs/MARATHI-STYLE.md`.
- Gender-neutral text everywhere; no Shantai wording; the logo files unchanged.
- Body text 16px, buttons `--btn-h` (54px), touch targets ≥ 44px, four bottom tabs, no hamburger.
- Status = colour + icon + word. No emoji rendered.
- No web fonts. Hero image ≤ 180 KB, all landing photos together ≤ 450 KB, below-the-fold images `loading="lazy"`.
- WCAG AA: 4.5:1 for text, 3:1 for large text/icons; both palettes.
- Palette A = default (`:root`, `:root[data-palette="soil"]`); palette B = `:root[data-palette="field"]`. Switching = changing `data-palette` in `frontend/index.html` and `admin/index.html` only.
- Gate after every task: `npm test && npm run typecheck && npm run build`.

## Review Focus

1. A photo fails to load or loads slowly on 4G → the hero text must stay readable (soil background under the gradient, not a white box).
2. Narrow phones (320px) and the English toggle → hero title, door buttons and trust tiles must wrap, never overflow horizontally.
3. Switching to palette B → no screen keeps a palette-A colour (guarded by the hard-coded-colour test).
4. `--ink-3` and small grey text on cream in sunlight → must meet 4.5:1 (guarded by the contrast test).
5. Reduced motion / slow devices → no new animation; nothing depends on hover.

---

### Task 1: Photos (main session — needs the higgsfield tool)

**Files:**
- Create: `frontend/src/assets/photos/hero-field.jpg`, `hero-field-tall.jpg`, `step-register.jpg`, `step-list.jpg`, `step-sell.jpg`, `auth-farmer.jpg`, `market-strip.jpg`
- Create: `frontend/tests/photo-budget.test.ts`

**Interfaces:** Produces the seven files above; later tasks import them by these exact names.

- [ ] **Step 1: Generate.** With `generate_image`, photorealistic, natural light, Marathwada/Solapur–Dharashiv setting, working farmers of different genders and ages, no text/logos/watermarks:
  - hero-field (16:9): a farmer standing in a green jowar/onion field at sunrise, looking at the crop, space for text in the lower third.
  - hero-field-tall (4:5): same scene, vertical.
  - step-register (4:3): a farmer at the edge of the field using a basic Android phone.
  - step-list (4:3): a farmer holding a woven basket of fresh onions and tomatoes.
  - step-sell (4:3): a buyer collecting a bag of vegetables from a farmer at the farm gate, phone in hand to pay.
  - auth-farmer (16:9): close shot of weathered hands holding freshly harvested produce, warm light.
  - market-strip (16:9): a village weekly market stall with heaps of vegetables.
- [ ] **Step 2: Compress** with Pillow: hero-field 1280×720 q≈72, hero-field-tall 800×1000, others 800px wide, `optimize=True, progressive=True`, lowering quality until the budget holds.
- [ ] **Step 3: Budget test** `frontend/tests/photo-budget.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The landing page is opened on cheap phones over rural 4G. The hero has
 * to arrive before the reader gives up, so its weight is a rule, not a hope.
 */
const dir = fileURLToPath(new URL('../src/assets/photos/', import.meta.url))
const kb = (f: string) => statSync(dir + f).size / 1024

test('the hero photo stays under 180 KB', () => {
  assert.ok(kb('hero-field.jpg') <= 180, `hero-field.jpg is ${kb('hero-field.jpg').toFixed(0)} KB`)
  assert.ok(kb('hero-field-tall.jpg') <= 180)
})

test('the landing photos together stay under 450 KB', () => {
  const landing = ['hero-field.jpg', 'step-register.jpg', 'step-list.jpg', 'step-sell.jpg']
  const total = landing.reduce((n, f) => n + kb(f), 0)
  assert.ok(total <= 450, `landing photos weigh ${total.toFixed(0)} KB`)
})
```

- [ ] **Step 4:** `cd frontend && node --import tsx --test tests/photo-budget.test.ts` → PASS.
- [ ] **Step 5: Commit** `git add frontend/src/assets/photos frontend/tests/photo-budget.test.ts && git commit -m "Farm photos for the landing and sign-in screens"`

---

### Task 2: Palette tokens (A default, B ready) and the guards

**Files:**
- Modify: `frontend/src/styles/theme.css` (the `:root` colour tokens + header comment), `admin/src/styles/admin.css` (same), `frontend/index.html`, `admin/index.html` (`data-palette="soil"` on `<html>`, `theme-color` → `#5a3a1f`), `frontend/src/components/MapView.tsx:43-44` (fallbacks), `frontend/src/components/Produce.tsx` (`CultivationPill` uses cultivation classes)
- Create: `frontend/tests/palette.test.ts`

**Interfaces:**
- Produces tokens (both palettes, both apps): `--soil --soil-dark --soil-soft`, `--leaf --leaf-dark --leaf-mid --leaf-soft` (= `--primary*`), `--gold --gold-deep --gold-soft --gold-band`, `--maroon*` (aliased to soil in A, terracotta in B — it is the price/accent colour), `--bg --bg-2 --surface --surface-2 --line --line-2 --ink --ink-2 --ink-3 --placeholder`, `--ok* --warn* --danger* --info*`, `--cult-natural --cult-natural-soft --cult-organic --cult-organic-soft --cult-chemical --cult-chemical-soft`, `--series1..4`, `--shadow-sm --shadow --shadow-up`.
- Produces classes `.pill--natural`, `.pill--organic`, `.pill--chemical`.

- [ ] **Step 1: Write the failing test** `frontend/tests/palette.test.ts`:

```ts
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
```

- [ ] **Step 2:** `cd frontend && node --import tsx --test tests/palette.test.ts` → FAIL (missing `:root[data-palette="soil"]`).
- [ ] **Step 3: Implement.** In `theme.css`, move every colour token out of `:root` into two blocks placed right after it (sizes, radii, spacing, fonts stay in `:root`). The first selector list makes A the default:

```css
:root, :root[data-palette="soil"] {
  /* A · Soil & Turmeric (माती आणि हळद) - the default */
  --soil: #5a3a1f; --soil-dark: #3f2814; --soil-soft: #f3e8d8;
  --leaf: #3f7d20; --leaf-dark: #2f5d17; --leaf-mid: #5a9a33; --leaf-soft: #e3efd6;
  --primary: var(--leaf); --primary-dark: var(--leaf-dark); --primary-soft: var(--leaf-soft);
  --maroon: var(--soil); --maroon-dark: var(--soil-dark); --maroon-mid: #7a5230; --maroon-soft: var(--soil-soft);
  --gold: #e0a526; --gold-deep: #8a6310; --gold-soft: #faefd3; --gold-band: #f3d27a;
  --green: var(--leaf); --green-dark: var(--leaf-dark); --green-soft: var(--leaf-soft);
  --ink: #2e2116; --ink-2: #5e4a3a; --ink-3: #75614f;
  --bg: #fbf6ea; --bg-2: #f3e9d6; --surface: #ffffff; --surface-2: #fdf9f0;
  --line: #e6d6b8; --line-2: #d4bf98; --placeholder: #a8957f;
  --ok: var(--leaf-dark); --ok-soft: var(--leaf-soft);
  --warn: #8a5a00; --warn-soft: #fbe7c2;
  --danger: #b3341f; --danger-soft: #fbe8e3;
  --info: #4a5f52; --info-soft: #ecf0ea;
  --cult-natural: #2f5d17; --cult-natural-soft: #e3efd6;
  --cult-organic: #1f6b4a; --cult-organic-soft: #dcefe4;
  --cult-chemical: #8a4b0f; --cult-chemical-soft: #fbe3c4;
  --series1: #3f7d20; --series2: #5a3a1f; --series3: #8a6310; --series4: #3d5ac4;
  --shadow-sm: 0 1px 2px rgba(90, 58, 31, 0.08);
  --shadow: 0 2px 12px rgba(90, 58, 31, 0.09);
  --shadow-up: 0 -2px 14px rgba(90, 58, 31, 0.11);
}

:root[data-palette="field"] {
  /* B · Field & Monsoon (हिरवे शेत) - switch with data-palette="field" in index.html */
  --soil: #1f5f3a; --soil-dark: #164a2c; --soil-soft: #e1efd9;
  --leaf: #1f5f3a; --leaf-dark: #164a2c; --leaf-mid: #3d8a4f; --leaf-soft: #e1efd0;
  --primary: var(--leaf); --primary-dark: var(--leaf-dark); --primary-soft: var(--leaf-soft);
  --maroon: #b4492a; --maroon-dark: #8c3720; --maroon-mid: #c9603f; --maroon-soft: #f8e4dc;
  --gold: #8bbf3f; --gold-deep: #4f7a16; --gold-soft: #eef6de; --gold-band: #cfe6a8;
  --green: var(--leaf); --green-dark: var(--leaf-dark); --green-soft: var(--leaf-soft);
  --ink: #1d2a1f; --ink-2: #45554a; --ink-3: #5f6d62;
  --bg: #f4f7ef; --bg-2: #e8efdf; --surface: #ffffff; --surface-2: #f9fbf5;
  --line: #d9e4cc; --line-2: #bfd0aa; --placeholder: #8a988c;
  --ok: var(--leaf-dark); --ok-soft: var(--leaf-soft);
  --warn: #8a5a00; --warn-soft: #fbe7c2;
  --danger: #b3341f; --danger-soft: #fbe8e3;
  --info: #4a5f52; --info-soft: #ecf0ea;
  --cult-natural: #2f5d17; --cult-natural-soft: #e3efd6;
  --cult-organic: #1f6b4a; --cult-organic-soft: #dcefe4;
  --cult-chemical: #8a4b0f; --cult-chemical-soft: #fbe3c4;
  --series1: #1f5f3a; --series2: #b4492a; --series3: #4f7a16; --series4: #3d5ac4;
  --shadow-sm: 0 1px 2px rgba(31, 95, 58, 0.08);
  --shadow: 0 2px 12px rgba(31, 95, 58, 0.09);
  --shadow-up: 0 -2px 14px rgba(31, 95, 58, 0.11);
}
```

  `block()` finds `:root[data-palette="soil"] {`, which is the tail of the A selector list, so keep the selector exactly as written. Copy both blocks byte-for-byte into `admin.css`, replacing its colour tokens. Rewrite the THEME SWAP POINT comment to describe the two palettes and the one-word switch. Any leftover hex in either stylesheet outside these blocks becomes a token (add one to BOTH palettes if needed). `MapView.tsx` fallbacks: read `--primary`/`--maroon` and drop the literal fallbacks (use `'currentColor'` if empty). `CultivationPill`: `className={`pill pill--${cultivation}`}` with `.pill--natural { background: var(--cult-natural-soft); color: var(--cult-natural); border-color: var(--cult-natural); }` and the same for organic/chemical. `<html lang="mr" data-palette="soil">` in both `index.html`; `theme-color` `#5a3a1f`.
- [ ] **Step 4:** run the palette test → PASS; then the full gate.
- [ ] **Step 5: Commit** `"Soil & Turmeric palette, Field & Monsoon ready behind one attribute"`.

---

### Task 3: Landing page (layout A)

**Files:**
- Modify: `frontend/src/screens/landing/Landing.tsx`, `frontend/src/styles/theme.css` (landing section only), `frontend/src/i18n/strings.ts`
- Delete: `frontend/src/screens/landing/HeroArt.tsx` (replaced by the photo hero)

**Interfaces:** Consumes Task 1 photos, Task 2 tokens. New keys (mr + en): `lp.heroTitle`, `lp.heroSub`, `lp.farmerCta`, `lp.buyerCta`, `lp.haveAccount`, `lp.loginFarmer`, `lp.loginBuyer`, `lp.trust1`, `lp.trust1Sub`, `lp.trust2`, `lp.trust2Sub`, `lp.trust3`, `lp.trust3Sub`, `lp.howTitle`, `lp.step1`, `lp.step1Sub`, `lp.step2`, `lp.step2Sub`, `lp.step3`, `lp.step3Sub`, `lp.needResultTitle`.

Marathi / English:
- heroTitle: `तुमच्या शेतमालाला योग्य दाम` / `A fair price for your harvest`
- heroSub: `मध्यस्थ नाही. थेट ग्राहक.` / `No middlemen. Straight to the buyer.`
- farmerCta: `मी शेतकरी आहे · नोंदणी करा` / `I farm · Register`
- buyerCta: `मला ताजा माल घ्यायचा आहे` / `I want fresh produce`
- haveAccount: `आधीच खाते आहे?` / `Already have an account?`
- loginFarmer: `शेतकरी लॉगिन` / `Farmer login`; loginBuyer: `ग्राहक लॉगिन` / `Buyer login`
- trust1 `मोफत` / `Free`, trust1Sub `कमिशन नाही` / `No commission`
- trust2 `UPI` / `UPI`, trust2Sub `पैसे थेट खात्यात` / `Paid straight to you`
- trust3 `QR` / `QR`, trust3Sub `शेताची ओळख` / `Farm identity`
- howTitle `कसे चालते?` / `How it works`
- step1 `नोंदणी` / `Register`, step1Sub `फोन नंबर आणि पासवर्ड` / `Phone number and password`
- step2 `माल यादीत टाका` / `List your produce`, step2Sub `फोटो, किंमत, काढणीची तारीख` / `Photo, price, harvest date`
- step3 `विका, पैसे थेट` / `Sell, get paid directly`, step3Sub `UPI किंवा रोख` / `UPI or cash`
- needResultTitle `गरज आणि परिणाम` / `The need and the result`

(Before adding: `grep` the dictionaries; reuse an existing key with the same meaning instead of adding a duplicate. Run `frontend/tests/marathi.test.ts` — its word list may ask for a different word; follow it.)

- [ ] **Step 1: Failing check** — add to `frontend/tests/i18n.test.ts` nothing new (the existing "every t() key exists" test fails as soon as Landing asks for the new keys). Write the Landing JSX first, run `cd frontend && node --import tsx --test tests/i18n.test.ts` → FAIL listing the missing keys.
- [ ] **Step 2: Implement** the order from spec §5:

```tsx
import heroWide from '../../assets/photos/hero-field.jpg'
import heroTall from '../../assets/photos/hero-field-tall.jpg'
import stepRegister from '../../assets/photos/step-register.jpg'
import stepList from '../../assets/photos/step-list.jpg'
import stepSell from '../../assets/photos/step-sell.jpg'
// …
<header className="ltop">{/* logo + app.name + language toggle, as today */}</header>
<section className="lphoto">
  <picture>
    <source media="(min-width: 700px)" srcSet={heroWide} />
    <img className="lphoto__img" src={heroTall} alt="" fetchPriority="high" />
  </picture>
  <div className="lphoto__text">
    <h1 className="lphoto__title">{t('lp.heroTitle')}</h1>
    <p className="lphoto__sub">{t('lp.heroSub')}</p>
  </div>
</section>
<main className="wrap lstack">
  <div className="ldoors">
    <button className="btn" onClick={() => go('farmer', 'register')}><IconFarmer aria-hidden="true" /> {t('lp.farmerCta')}</button>
    <button className="btn btn--ghost" onClick={() => go('customer', 'register')}><IconBuy aria-hidden="true" /> {t('lp.buyerCta')}</button>
    <p className="ldoors__login">{t('lp.haveAccount')}{' '}
      <button className="linkbtn" onClick={() => go('farmer', 'login')}>{t('lp.loginFarmer')}</button>{' · '}
      <button className="linkbtn" onClick={() => go('customer', 'login')}>{t('lp.loginBuyer')}</button></p>
  </div>
  <ul className="ltrust">{[1, 2, 3].map((n) => (
    <li key={n}><strong>{t(`lp.trust${n}`)}</strong><span>{t(`lp.trust${n}Sub`)}</span></li>))}</ul>
  <section><div className="sec-head"><h2 className="sec-head__t">{t('lp.howTitle')}</h2></div>
    <ol className="lsteps">{[[stepRegister, 1], [stepList, 2], [stepSell, 3]].map(([src, n]) => (
      <li key={n as number} className="lstep"><span className="lstep__n">{n as number}</span>
        <img className="lstep__img" src={src as string} alt="" loading="lazy" width="96" height="72" />
        <span><strong>{t(`lp.step${n}`)}</strong><span className="small dim">{t(`lp.step${n}Sub`)}</span></span></li>))}</ol>
    {/* the existing six-step workflow strip (lp.wf1..6) stays here, compact */}
  </section>
  {/* features as chips (lp.feat1..7), need → result two columns (lp.need*, lp.ben*),
      goals (lp.goal*), mission + intro (lp.mission, lp.intro), CollegeCard, footer: all existing keys */}
</main>
```

  CSS (landing section of `theme.css`, tokens only): `.ltop` soil bar with white text; `.lphoto` `position:relative; background: var(--soil); min-height: 58vh; max-height: 520px; overflow:hidden` so text stays readable if the photo fails; `.lphoto__img` `width:100%; height:100%; object-fit:cover; position:absolute; inset:0`; `.lphoto::after` `content:''; position:absolute; inset:0; background: linear-gradient(180deg, transparent 35%, var(--soil-dark) 100%); opacity: .9`; `.lphoto__title` `color: var(--surface)`, `font-size: clamp(1.6rem, 7vw, 2.4rem)`, `text-wrap: balance`; `.ldoors .btn` full width, farmer first; `.ltrust` three-column grid, wraps to one column under 340px; `.lstep` card row with turmeric `.lstep__n` (ink on `--gold`); footer soil with `--gold-band` motto. No `#fff` literals — use `var(--surface)`.
- [ ] **Step 3:** add the keys to both dictionaries; i18n + marathi tests PASS.
- [ ] **Step 4:** full gate; then `npm run dev:web`, open `http://localhost:5173/` at 360×800 and 320×640 in both languages: nothing overflows; block the hero image in devtools → title still readable on soil.
- [ ] **Step 5: Commit** `"Landing: photo hero, farmer first, trust tiles and three steps"`.

---

### Task 4: Shared components in the new palette

**Files:** Modify `frontend/src/styles/theme.css` (app bar, bottom nav, cards, buttons, chips, pills, section heads, notices, inputs, dialogs, toasts), `frontend/src/components/ui.tsx` only if a class name must be added.

**Interfaces:** Consumes Task 2 tokens; produces the look every screen inherits.

- [ ] **Step 1:** Take phone-size screenshots (360×800) of catalogue, product page, cart, farmer home, farmer orders **before** the change into `C:\…\scratchpad\before\` for the owner.
- [ ] **Step 2: Implement** (tokens only):
  - `.appbar`: `background: var(--soil); color: var(--surface)`; buttons inside white outline.
  - `.bottomnav`: `background: var(--surface); border-top: 1px solid var(--line)`; `.bottomnav__item` colour `var(--ink-2)`; `--on`: colour `var(--primary)`, a 3px `var(--gold)` bar on top (`box-shadow: inset 0 3px 0 var(--gold)`), icon on `var(--primary-soft)`.
  - `.card`: `background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); box-shadow: var(--shadow-sm)`.
  - `.btn` primary `var(--primary)`; `.btn--ghost` `color/border var(--soil)`; `.btn--quiet` `surface-2`.
  - `.chip` `background: var(--gold-soft); border-color: var(--gold-band)`; `.chip--on` `background: var(--soil); color: var(--surface)`.
  - `.sec-head::after` a `var(--gold)` rule; `.sec-head__t` `color: var(--soil)`.
  - Prices (`.price`, wherever `var(--maroon)` was the price colour) stay on `--maroon` (= soil in A).
- [ ] **Step 3:** full gate; palette test still PASS (no hex added).
- [ ] **Step 4: Commit** `"Shared components in Soil & Turmeric"`.

---

### Task 5: Photo-led screens — catalogue, product, auth

**Files:** Modify `frontend/src/screens/customer/Browse.tsx` (product card and product page markup classes only), `frontend/src/screens/auth/Auth.tsx`, `frontend/src/screens/auth/FarmerRegister.tsx`, `frontend/src/screens/auth/CustomerRegister.tsx`, `frontend/src/styles/theme.css`.

**Interfaces:** Consumes Task 1 `auth-farmer.jpg`, `market-strip.jpg`; Task 2/4 tokens and classes.

- [ ] **Step 1: Implement:**
  - Catalogue card: image area 4:3 (`aspect-ratio: 4 / 3; object-fit: cover`), name bold, price `--maroon` large, `CultivationPill`, farmer + village line `--ink-3`. Same data, same order of taps.
  - Product page: photo full width (`aspect-ratio: 4 / 3`, max-height 50vh), price `var(--t-xl)`, harvest + minimum-order line, farmer card on `var(--soil-soft)` with rating and verified mark; primary button unchanged in position.
  - Auth screens: a 140px photo band at the top — farmer login + farmer registration use `auth-farmer.jpg`; buyer login + buyer registration use `market-strip.jpg`; `alt=""`, `loading="lazy"` not used (above the fold), band background `var(--soil)` so a failed photo is still a clean band. The form below is unchanged.
  - Empty catalogue: `market-strip.jpg` small, rounded, above the existing empty text.
- [ ] **Step 2:** full gate.
- [ ] **Step 3:** dev server check at 360×800: catalogue → product → add to cart; farmer login; buyer registration. Flow identical to before.
- [ ] **Step 4: Commit** `"Photo-led catalogue, product page and sign-in screens"`.

---

### Task 6: Every other screen, phone check and screenshots

**Files:** Modify `frontend/src/styles/theme.css` and screen files only where a screen uses a class that looks wrong in the new palette: `screens/farmer/*`, `screens/customer/CartCheckout.tsx`, `screens/customer/FarmerMap.tsx`, `screens/trace/Trace.tsx`, `screens/Notifications.tsx`, `components/OrderTracker.tsx`, `components/Walkthrough.tsx`, `components/OfflineScreen.tsx`, `components/Reviews.tsx`, `components/ComplaintSheet.tsx`, `components/CloseAccount.tsx`, `screens/landing/CollegeCard.tsx`.

- [ ] **Step 1:** Walk every route at 360×800 in Marathi and English (farmer: home, products, upload wizard, edit product, orders, buyers, reviews, profile, payment QR, help; buyer: catalogue, category, shop, map, product, cart, checkout, placed, orders, order detail, profile; public: trace page, landing; offline screen). Fix what reads wrong: leftover green-on-green, maroon-era headings, low-contrast greys, cramped spacing. Tokens only.
- [ ] **Step 2:** Screenshots **after** into `scratchpad\after\` matching Task 4's before set, plus landing and trace page.
- [ ] **Step 3:** Switch `frontend/index.html` to `data-palette="field"`, reload two screens, confirm palette B applies everywhere, switch back to `soil`. (Proves the one-word switch; do not commit B.)
- [ ] **Step 4:** full gate; commit `"Every screen in the new palette"`.

---

## Self-review

- Spec coverage: §3 palette → T2 · §4 images → T1 · §5 landing → T3 · §6 app screens → T4, T5, T6 · admin tokens → T2 · §7 testing → T1 (budget), T2 (contrast, parity, hard-coded colours, switch), T3–T6 (gate + phone checks) · palette B switch → T2 + T6 Step 3.
- Review Focus mapped: 1 → T3 Step 4 (hero on soil when the image fails) · 2 → T3 Step 4 (320px, English) · 3 → T2 hard-coded-colour test + T6 Step 3 · 4 → T2 contrast test (`ink-3` pairs) · 5 → no animation added anywhere; T4–T6 add none.
