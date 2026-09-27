# Farmer-first redesign — design

Date: 28 September 2026 · Scope: visual design of the farmer + buyer website (`frontend/`), colour tokens of the admin console (`admin/`). Mockups agreed in the brainstorming companion: palette A, landing layout A, app-screen direction.

## 1. Goal

The website should look and feel **made for farmers**: earthy, rooted in the field, proud of the farmer, rather than a generic green shopping app. A farmer landing on it should recognise their own world before reading a word.

Success:
- The landing page opens on a real-looking photo of a Maharashtra farmer and the farmer's promise; the farmer's button is the first and biggest action.
- Every screen of the farmer + buyer app uses the new palette and card style; nothing looks like the old green/maroon theme.
- **The flow does not change**: same routes, same screens, same steps, same buttons and tabs, same texts except the new landing copy listed below.
- All existing tests pass; build, typecheck green.

Out of scope: new features, new screens, new data (the farmer-home tiles in the mockup were illustrative only), the admin console's layout (only its colour tokens change), the logo image.

## 2. Constraints (unchanged rules)

- Marathi first, English toggle; every string through `t()` in both dictionaries; gender-neutral wording; no Shantai wording.
- Body text 16px, buttons `--btn-h`, touch targets ≥ 44px, four bottom tabs, no hamburger.
- Status = colour + icon + word, never colour alone. No emoji rendered anywhere.
- **No web fonts** (system Noto Sans Devanagari).
- Cheap Android on slow 4G: images compressed, lazy below the fold, the hero image ≤ 180 KB.
- `theme.css` `:root` block stays the single THEME SWAP POINT; component CSS reads tokens only.
- WCAG AA contrast for all text (4.5:1 body, 3:1 large text and icons), readable in outdoor sunlight.

## 3. Palette A — Soil & Turmeric (माती आणि हळद)

Token changes in `frontend/src/styles/theme.css` `:root` (names kept so components keep working; values replaced). The same values go into `admin/src/styles/admin.css`.

| Role | Token(s) | New value | Use |
|---|---|---|---|
| Soil (brand, header) | `--soil` (new), `--soil-dark` (new), `--soil-soft` (new) | `#5a3a1f`, `#3f2814`, `#f3e8d8` | App bar, landing top band and footer, headings, prices |
| Crop green (action) | `--leaf`, `--leaf-dark`, `--leaf-mid`, `--leaf-soft` → `--primary*` | `#3f7d20`, `#2f5d17`, `#5a9a33`, `#e3efd6` | The one main button, verified/natural, active states |
| Turmeric (highlight) | `--gold`, `--gold-deep`, `--gold-soft`, `--gold-band` | `#e0a526`, `#8a6310`, `#faefd3`, `#f3d27a` | Highlights, active tab bar, chips, stars, step numbers |
| Accent (was maroon) | `--maroon*` | remapped to soil values | Existing uses of "accent" become soil brown |
| Ground | `--bg`, `--bg-2`, `--surface`, `--surface-2` | `#fbf6ea`, `#f3e9d6`, `#ffffff`, `#fdf9f0` | Page, sections, cards |
| Lines | `--line`, `--line-2` | `#e6d6b8`, `#d4bf98` | Card borders, dividers |
| Ink | `--ink`, `--ink-2`, `--ink-3` | `#2e2116`, `#5e4a3a`, `#8a7765` | Text |
| Status | `--ok*`, `--warn*`, `--danger*`, `--info*` | ok = crop green; warn `#8a5a00`/`#fbe7c2`; danger `#b3341f`/`#fbe8e3`; info `#4a5f52`/`#ecf0ea` | Pills and notices |
| Cultivation | `--cult-natural`, `--cult-organic`, `--cult-chemical` (new, each with `-soft`) | natural `#2f5d17`/`#e3efd6`; organic `#1f6b4a`/`#dcefe4`; chemical `#8a4b0f`/`#fbe3c4` | Cultivation pill, always with its icon + word |
| Charts | `--series1..4` | crop green, soil, turmeric-deep, `#3d5ac4` | Charts |
| Shadows | `--shadow*` | tinted with soil `rgba(90,58,31,…)` | Cards |

Contrast checks (to verify with a script in the plan): white on soil ≈ 10:1, white on crop green ≈ 5:1, ink on turmeric band ≥ 9:1, soil on cream ≥ 9:1, `--ink-3` on cream ≥ 4.5:1 (darken if not).

## 4. Images

Generated with higgsfield (`generate_image`), photorealistic, Maharashtra (Marathwada/Solapur-Dharashiv) setting, natural light; people are farmers of different genders and ages, dressed as working farmers, no text or logos in the image. Exported as compressed JPEG (WebP if the build keeps a JPEG fallback — decide in the plan), stored in `frontend/src/assets/photos/`, imported so Vite fingerprints them.

| File | Where | Content |
|---|---|---|
| `hero-field.jpg` (16:9 and a 4:5 crop) | Landing hero | Farmer standing in a green field at sunrise, looking at the crop |
| `step-register.jpg` | How it works, step 1 | Farmer at the farm edge using a basic Android phone |
| `step-list.jpg` | Step 2 | Farmer holding a basket of fresh onions/tomatoes, being photographed |
| `step-sell.jpg` | Step 3 | Buyer collecting produce at the farm, paying by phone (UPI) |
| `auth-farmer.jpg` | Top of farmer login/registration | Close, warm portrait-style shot of hands with harvested produce |
| `market-strip.jpg` | Buyer login/registration top, empty catalogue state | A village weekly market stall with vegetables |

About 6–8 generations (a retry or two allowed). Category fallback photos in `assets/categories/` stay. The college card keeps its current content (no generated college photo — it would misrepresent a real place).

## 5. Landing page (layout A)

Order, top to bottom, all in `screens/landing/Landing.tsx` + theme CSS:

1. **Top band** (soil): logo + name, language toggle.
2. **Photo hero**: `hero-field` full width with a dark-to-transparent gradient; on it the promise (new key `lp.heroTitle` "तुमच्या शेतमालाला योग्य दाम" / "A fair price for your harvest") and sub-line (`lp.heroSub` "मध्यस्थ नाही. थेट ग्राहक." / "No middlemen. Straight to the buyer."). `HeroArt` is replaced by this.
3. **Doors**: the farmer's register button first and largest (crop green, full width); buyer's button secondary (outlined soil); one "already have an account? log in" row with the farmer and buyer login links. Same targets as today's four door links.
4. **Trust row**: three tiles — free for farmers / no commission, UPI straight to the farmer, QR farm identity (new keys `lp.trust1..3` + subs). Only claims that are true in the code.
5. **How it works**: three steps with small photos and turmeric step numbers (reuses the six `lp.wf*` meanings condensed into three new keys `lp.step1..3`; the full six-step workflow stays below as a compact strip).
6. **Features** as chips (`lp.feat1..7`).
7. **Need → result**: two columns, existing `lp.need*` and `lp.ben*`.
8. **Goals** (`lp.goal*`), compact list.
9. **College / Aavishkar card** (existing `CollegeCard`, restyled).
10. **Footer** (soil): quote, motto, help phone.

Existing `lp.*` strings are kept; only the hero/trust/step keys are new (both dictionaries, Marathi per MARATHI-STYLE).

## 6. App screens (flow unchanged)

Applied through tokens first, then per-component CSS where the token swap is not enough:

- **App bar**: soil background, white text; farmer screens show the farmer's name / code / verified badge where the screen already shows them.
- **Bottom tabs**: white bar, soil icons+words, active tab crop green with a turmeric top bar.
- **Cards**: white, `--line` border, `--r` radius, soil-tinted shadow; product cards lead with the photo (larger image area in the two-column catalogue), price in soil, cultivation pill, farmer + village line.
- **Product page**: full-width photo, large price, harvest + minimum order line, farmer card on a soil-soft ground with rating and verified mark, main button crop green.
- **Buttons**: primary crop green; secondary outlined soil; quiet text soil; danger unchanged.
- **Chips/filters**: turmeric-soft, active chip soil with white text.
- **Auth screens** (farmer/buyer login, registration wizards, forgot password): a photo band at the top (`auth-farmer` / `market-strip`), then the existing form.
- **Empty states**: a small photo or icon on soil-soft, no duplicate of the action bar button (existing rule).
- **Trace page, maps, orders, cart, checkout, profile, notifications, reviews, complaints, walkthrough, offline screen**: token swap plus spacing polish; no structural change.
- **Admin console**: token values only.

## 7. Testing

- `npm test`, `npm run typecheck`, `npm run build` green; i18n/marathi tests cover the new keys.
- A small contrast test (node:test) computes the ratios of the token pairs in §3 so a later palette edit cannot silently drop below AA.
- Manual check in a phone-sized browser (Chrome devtools 360×800): landing, farmer login → home → add produce, buyer catalogue → product → cart → checkout, trace page. Screenshot before/after for the owner.
- Bundle check: landing total image weight ≤ 450 KB, hero ≤ 180 KB.

## 8. Order of work

1. Generate and compress images; commit assets.
2. Palette tokens + contrast test (frontend + admin).
3. Landing page rebuild.
4. Shared components (app bar, tabs, cards, buttons, chips, pills).
5. Screen-by-screen polish (auth, buyer, farmer, trace, misc).
6. Manual phone-size check, screenshots, final gate.
