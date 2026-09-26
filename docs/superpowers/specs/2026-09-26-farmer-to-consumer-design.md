# Farmers to Consumer (शेतकऱ्यापासून थेट ग्राहकापर्यंत) — Design

Date: 2026-09-26
Status: approved in chat, awaiting written-spec review

## 1. Purpose

An Aavishkar research prototype for Jawahar Arts, Science and Commerce College,
Anadur (ता. तुळजापूर, जि. धाराशिव). It implements the "Digital Direct Marketing
Model" from the research paper *From Farmer to Consumer: A Digital Direct
Marketing Model for Rural Agricultural Produce* and the Aavishkar poster:

- rural farmers register, list produce with photo, quantity, price and GPS;
- consumers search, order, pay the farmer by UPI, collect or receive delivery,
  and give feedback;
- an admin verifies farmers, handles complaints and reports, and records the
  research survey;
- the Farmer Digital Readiness Index (FDRI) and the paper's Tables 1–9 come out
  of the data.

Users are rural farmers, many with low literacy and first smartphones. Every
design rule in the reference project that exists for that reason stays.

Success: a deployed website (no Android app) that a farmer can register on and
sell through with help from a field coordinator at most once, and that produces
the research tables for 100–200 surveyed farmers.

## 2. Decisions

| Decision | Choice |
|---|---|
| Base | Copy `E:\Shantai_mahila_bazar_web` (branch `prathamesh2`, working tree including uncommitted edits) and adapt it. Every rule and fix recorded in its `CLAUDE.md` carries over unless this spec removes it. |
| Delivery shape | Website only. No APK, no WebView wrapper, no push notifications. |
| Login | Phone number + password. No OTP, no SMS provider. |
| Forgotten password | Admin sets a temporary password from the console; the farmer or buyer must change it at next login. |
| Fee | Free for farmers. No subscription, no slots, no payment-proof queue. |
| Moderation | Admin verifies a farmer once. After that his listings go live immediately. Buyers report bad listings; admin takes them down. |
| AI | No paid AI. Data-based price hint, demand/supply chart, voice search. |
| Languages | Marathi (default), English, Hindi. |
| Hosting | Same as reference: one Cloud Run API (max instances 1, CPU always allocated), Firestore via `firebase-admin`, Cloudinary for photos, two Vercel projects (`frontend`, `admin`). |

## 3. What is copied, and what is not

Copied: `shared/`, `backend/`, `frontend/`, `admin/`, `docs/`, `.github/`,
`Dockerfile`, `firestore.rules`, root `package.json`, `package-lock.json`,
`.gitignore`, `CLAUDE.md`, `README.md`.

Not copied: `.git`, `node_modules`, `brag-output*`, `.claude`, any `.env`,
`backend/data/db.json`, `backend/data/backups`, `backend/data/recovery`,
`*.tsbuildinfo`, `artifact-cleanup.json`.

The new repository starts with `git init` and one commit of the unmodified
copy, so every later adaptation is a readable diff against the reference.

Package names change from `@shantai/*` to `@f2c/*`; the `@shared/*` import
alias and its `.js`-extension convention stay exactly as they are.

## 4. Removed

Each removal deletes code, its tests, its strings in all dictionaries, its admin
screen and its section in `CLAUDE.md`.

- OTP: `services/otp.*`, `auth/tickets.ts`, `lib/msg91Widget.ts`,
  `lib/registerTicket.ts`, the OTP screen, MSG91 env variables.
- Push: `backend/src/push/`, `push.routes.ts`, `shared/src/pushText.ts`,
  `lib/pushBridge.ts`, `components/PushBridge.tsx`, `SessionRecord.pushToken`.
- APK: `DEPLOY.md` §6, wrapper notes in `CLAUDE.md`, `screens/landing/DeleteAccount.tsx`
  (the Play Store page). In-app account close stays.
- Subscription and slots: `shared/src/subscription.ts`, slot rules in
  `seller.ts`, `backend/src/db/subscription.ts`, `db/payments.ts`,
  `screens/seller/Subscription.tsx`, `SubscriptionNotice`, admin `Payments.tsx`,
  admin `Subscription.tsx`, `ADMIN_PAYMENT_ACCOUNT`, subscription dashboard
  counters, `backfillSubscriptionTerms`.
- Per-listing approval: `PENDING` as a listing status, the Pending tab in admin
  Products. `initialListingStatus()` returns `LIVE` for a verified farmer.
- Edit limits: `MAX_EDITS`, `EDIT_COUNTED_FIELDS`, `editsLeft()`. There are no
  slots to rotate through, so the limit protects nothing.
- Women-specific and packaged-food fields: FSSAI number, veg/non-veg,
  ingredients, material, `piecesPerPack`, `womenbiz.ts` naming.

## 5. Changed and added

### 5.1 Authentication (`backend/src/auth/`)

- `POST /auth/register` `{ phone, name, password, role }` and
  `POST /auth/login` `{ phone, password }`. Both return the existing session
  token; sessions, idle windows, `X-Session-Token` refresh and revocation are
  unchanged.
- Passwords use the scrypt helper already used for admin accounts
  (`auth/admins.ts`), moved into `auth/crypto.ts` so there is one hashing path.
  Minimum 6 characters; digits-only is allowed, because a PIN is what a farmer
  can remember.
- Rate limit on login: 5 failures per phone per 15 minutes and per IP, keyed
  as in `auth/rateLimit.ts`. The refusal says the wait in Marathi words, as
  `retryInMr()` does today.
- One phone number is one account; the role (farmer or buyer) is chosen at
  registration. A phone already registered answers with a message that tells
  the person to log in instead.
- `mustChangePassword` on the account. When set, every route except
  `POST /auth/password` answers 403 with a code the app turns into the
  change-password screen.
- Admin: `POST /admin/users/:id/reset-password` generates a 6-digit temporary
  password, shows it once to the admin, sets `mustChangePassword`, and revokes
  every session of that user. It writes an audit notice with the admin's name.
- `SESSION_SECRET` is still required in production.

### 5.2 Farmer (renamed from Seller)

Type, collection, routes and UI say "farmer" (`शेतकरी`). The Firestore
collection is `farmers`.

- Farmer ID: `F2C-<VILLAGE>-<NNN>`, serial per village, generated the same way
  as `womenbiz.ts` does today (non-survey villages transliterated).
- Registration wizard, one question per screen with progress dots:
  1. name (voice input allowed)
  2. village, taluka, pincode
  3. location — one button "माझे ठिकाण वापरा" using
     `navigator.geolocation`, preceded by a consent sentence; skippable
  4. main crops (multi-select chips)
  5. UPI ID (existing `upiProblem()` validation)
  6. age group, education, landholding (small < 2 ha, medium 2–10 ha,
     large > 10 ha), farmer type (vegetable, grain, fruit, processing — multi)
  7. the ten FDRI questions, one yes/no tap each
  8. current selling channel and main selling problems (multi-select, from
     the paper's research questions)
- Status after registration: `PENDING_VERIFICATION`. The farmer can build
  listings; nothing is public until an admin verifies him. Verification is one
  button on the admin farmer page. Blocking stays as today.
- Location is stored exact (`lat`, `lng`) and never leaves the API exact on a
  public route: `PublicFarmer` carries it rounded to 2 decimals (~1 km).
  `backend/tests/public-farmer.test.ts` asserts the key set and the rounding.

### 5.3 FDRI (`shared/src/fdri.ts`, replaces `readiness.ts`)

The paper's ten indicators, one point each:

1. Smartphone 2. Internet 3. WhatsApp 4. Digital payment 5. Online market
information 6. Digital product promotion 7. Online selling experience
8. Willingness for direct selling 9. Packaging/branding readiness
10. Digital training willingness

Score 0–10. Bands: Low 0–3, Moderate 4–7, High 8–10. The same function scores a
registered farmer and a survey record (5.9). Questions are stored per
indicator so the tables can be cut by any one of them.

### 5.4 Produce listing

`Product` fields: crop name, category, unit, available quantity, minimum order
quantity, price per unit, photo, harvest date, cultivation type, optional
description.

- Categories (constant in code, as today): vegetables, leafy vegetables,
  fruits, grains, pulses, spices, processed products, other. `other` keeps its
  role as the escape hatch.
- Units: kg, quintal, dozen, piece, litre. Price is per unit.
- Cultivation type: organic (सेंद्रिय), natural (नैसर्गिक), chemical
  (रासायनिक). Shown as icon + word, never colour alone.
- Harvest date: a date input, not in the future, not older than 60 days for
  vegetables/fruits. Buyers see "harvested N days ago".
- Minimum order: at least 1 unit, at most available quantity. The cart
  quantity steps between minimum and stock.
- Listing wizard stays one question per screen; the edit screen stays one page.
  Price and quantity are always editable.
- A verified farmer's new listing is `LIVE` at once. `publiclyVisible()` is
  unchanged in shape: `LIVE` product, `ACTIVE` (verified) farmer, shop open.

### 5.5 Delivery and pickup

A farmer sets at least one of:

- **Home delivery** — pincode list, a hint not a gate, exactly as today;
  delivery charge 0 still means "ask the farmer".
- **Pickup** — a place he names (text) with optional GPS.

The buyer picks one at checkout from what that farmer offers. Order state
machine keeps its six states. For a pickup order `PACKED` is labelled
"ready for pickup" and `canTransition()` allows `PACKED → DELIVERED`, skipping
`OUT_FOR_DELIVERY`. `BUYER_STAGES` shows three stages for pickup. Payment after
acceptance, UTR rules, cancel flow, refund notice, review gate: unchanged.

### 5.6 Traceability QR

- Public route `/trace/:productId` in the frontend and
  `GET /api/catalog/products/:id/trace` in the API, visible exactly as far as
  `publiclyVisible()` allows (same 404).
- Shows: farmer name and ID, village, crop, harvest date, cultivation type,
  price, available quantity, farmer phone (tap to call), approximate map pin,
  "order now" button.
- The farmer's product screen shows the QR (existing `QrCode` component) with
  a "download" button that saves a PNG and a "print" button with a print
  stylesheet (QR, crop, farmer name, ID). This is safe now that there is no
  WebView.

### 5.7 Maps

Leaflet with OpenStreetMap tiles, loaded only on map screens.

- Buyer: "शेतकरी नकाशा" screen — pins for verified farmers with live listings,
  rounded location, filter by category; tap a pin for the farmer card.
- Farmer: his own pin on profile; can reset it.
- Admin: exact pins, filter by crop, village, FDRI band; farmers and survey
  records in different colours.

### 5.8 Price hint and demand/supply

- `GET /api/insights/price?crop=<name>&unit=<unit>` returns the platform
  median of live listings and the last 30 days of order prices for that crop
  and unit, and, when `DATA_GOV_IN_API_KEY` is set, the latest Agmarknet modal
  price for the nearest market (Dharashiv district first, then Maharashtra),
  converted from ₹/quintal to the listing's unit. Cached in memory for 6 hours.
  Without the key, the mandi line is absent, not an error.
- The listing and edit screens show the hint under the price box as plain
  numbers with their source. It is advice, never a default value.
- Admin "Demand & supply" chart: per crop, quantity ordered in the last 30
  days against quantity listed.
- Voice search: the search box gets the existing `VoiceInput` mic, with the
  recogniser language taken from the app language.

### 5.9 Research module (admin)

- **Survey entry**: a form in the admin console for a field coordinator to
  record one questionnaire (the paper's §8.5/§9 variables: village, age,
  education, landholding, farmer type, crops, current selling channel,
  problems, the ten FDRI answers, optional GPS and photo). Stored in a
  `surveys` collection. A survey record can later be linked to a farmer
  account by phone.
- **Research tables**: the paper's Tables 1–9 computed over registered
  farmers plus unlinked survey records:
  1 age groups · 2 digital use by education · 3 smartphone ownership ·
  4 digital payment use · 5 online market information · 6 direct-selling
  willingness · 7 training requirement · 8 FDRI score distribution and bands ·
  9 FDRI band × direct-selling willingness (cross-tab with counts and row %).
- Each table has a CSV download (UTF-8 with BOM so Excel shows Marathi).
- The existing Impact dashboard stays and counts farmers, orders, money
  earned by farmers, and FDRI bands.

### 5.10 Languages

Marathi default, English and Hindi. The `I18nProvider` gains `hi`; the i18n
parity test covers three dictionaries. `docs/MARATHI-STYLE.md` still governs
Marathi. Hindi strings are written as Hindi, not translated word for word.

### 5.11 Branding

Name "Farmers to Consumer" / "शेतकऱ्यापासून थेट ग्राहकापर्यंत", tagline
"शेतकरी समृद्ध | ग्राहक सुरक्षित | शेती टिकाऊ". Green and orange from the
poster, set in the `THEME SWAP POINT` block of `theme.css` only. Logo: the
college logo supplied by the team (placeholder mark until then). Landing page
follows the poster: need, objectives, workflow, benefits, college card with
researcher and guide names from the paper.

## 6. Design rules (unchanged, restated because they are constraints)

Status is colour + icon + word · 16px minimum text, 56px buttons, 44px touch
targets · four bottom tabs, no hamburger · one question per wizard screen ·
confirmations state the consequence · Latin digits · no web fonts · no emoji ·
voice input is an addition, never a replacement for the keyboard.

## 7. Data model changes (summary)

- `farmers` (was `sellers`): drop subscription, slot, FSSAI and women-only
  fields; add `passwordHash`, `mustChangePassword`, `lat`, `lng`,
  `locationConsent`, `crops[]`, `ageGroup`, `education`, `landholding`,
  `farmerTypes[]`, `sellingChannels[]`, `problems[]`, `fdri` (ten booleans),
  `pickup { place, lat?, lng? }`, `offersDelivery`, `verifiedAt`, `verifiedBy`.
- `customers`: add `passwordHash`, `mustChangePassword`.
- `products`: drop food/material/edit-count fields; add `minOrder`,
  `harvestDate`, `cultivation`.
- `orders`: add `fulfilment: 'delivery' | 'pickup'`.
- `surveys`: new.
- `payments` (subscription): removed.
- `sessions`: drop `pushToken`, `pushLang`.

The database starts empty. `SEED_DEMO_DATA` seeds the four sample farmers from
the poster (Rajesh Patil tomato, Savita Kamble okra, Ganesh Jagdale onion,
Lakshmi Shinde gram) in Anadur.

## 8. Testing

Keep the reference suites that still apply, adapted to the new names. New or
rewritten tests:

- password register/login, wrong password, rate limit, must-change flow,
  admin reset revokes sessions
- FDRI score and band edges (3/4, 7/8)
- pickup transitions and buyer stages
- trace route visibility matches `publiclyVisible()`
- public farmer key set and location rounding
- verification gate: unverified farmer's listing not public
- price hint median and unit conversion; missing API key
- research tables on a fixed fixture, including the cross-tab
- i18n parity across mr/en/hi

`npm test`, `npm run typecheck` and `npm run build` pass before each step is
called done. `docs/MANUAL-TEST-PLAN.md` is rewritten for the new flows.

## 9. Build order

1. Copy, rename packages, `git init`, first commit; build and tests green.
2. Strip removed features (section 4); build and tests green.
3. Password authentication and admin reset.
4. Farmer model, registration wizard, verification, FDRI.
5. Produce listing, delivery and pickup.
6. Traceability QR.
7. Maps.
8. Price hint, demand/supply chart, voice search.
9. Survey entry, research tables, CSV export.
10. Hindi.
11. Branding and landing page.
12. Docs (`CLAUDE.md`, `README.md`, `DEPLOY.md`, `MANUAL-TEST-PLAN.md`) and
    deployment.

## 10. Out of scope

Android app, push notifications, OTP/SMS, payment gateway, paid AI, crop
disease detection, cold-chain, FPO integration, cross-district logistics.
