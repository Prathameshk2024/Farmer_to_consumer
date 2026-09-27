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
| Forgotten password | A public request page (no OTP): the person leaves phone and name, an admin calls back from a queue in the console and gives a temporary password, which must be changed at next login. |
| Fee | **Superseded by §11.** ₹50 buys one pack of 5 listing slots and keeps the shop open for 6 months; the farmer pays the college's UPI and an admin approves the proof by hand. |
| Moderation | **Superseded by §11.** Admin verifies a farmer once, *and* every new listing waits as `PENDING` until an admin publishes it. Buyers report bad listings; admin takes them down. |
| AI | No paid AI. Data-based price hint, demand/supply chart, voice search. |
| Languages | Marathi (default) and English, as in the reference. No Hindi. Marathi first: the default in the farmer/buyer app and in the admin console, the source text of every string, and the fallback for a missing key. English is a toggle, written on its own. |
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
  counters, `backfillSubscriptionTerms`. **Restored by §11.**
- Per-listing approval: `PENDING` as a listing status, the Pending tab in admin
  Products. `initialListingStatus()` returns `LIVE` for a verified farmer.
  **Restored by §11.**
- Edit limits: `MAX_EDITS`, `EDIT_COUNTED_FIELDS`, `editsLeft()`. There are no
  slots to rotate through, so the limit protects nothing. **Restored by §11.**
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
- Forgotten password, still with no OTP or SMS: the login screen has a
  "पासवर्ड विसरलात?" link to a public page `/forgot-password/:role` (the role
  comes from the login screen it was opened from). The person types phone and
  name; a farmer also types his village. One big button sends it. After
  sending, the page always shows the same line: "तुमची विनंती पाठवली. आमचे
  प्रतिनिधी तुम्हाला फोन करून नवा तात्पुरता पासवर्ड देतील." It never says
  whether the number has an account, so the page cannot be used to find out
  which numbers are registered.
- `POST /auth/password-requests { role, phone, name, village? }` is public and
  rate limited: 3 per phone per 24 hours and 20 per IP per hour
  (`auth/rateLimit.ts` `LIMITS`). A valid request always answers 200
  `{ ok: true }`, whether or not an account matches. A new request from the
  same phone and role while one is still open only refreshes that row's time;
  it does not add a row. Requests are stored in `passwordRequests`, with the
  matched account noted for the admin when there is one.
- Admin "Password requests" queue, with the open count on the dashboard. Each
  row shows name, phone (tap to call), role, village, how long it has waited,
  and the matched account or "no account with this number". The admin calls
  that number and gives the temporary password only on that call. Two actions:
  - **Reset password** calls `POST /admin/users/reset-password
    { role, userId, requestId? }`. It generates a 6-digit temporary password,
    shows it once to the admin, sets `mustChangePassword`, revokes every
    session of that user, and writes an audit notice with the admin's name.
    With `requestId`, it also marks the request DONE. The same button, without
    a request, is on the farmer and buyer detail pages.
  - **Close** (reason optional) marks the request DISMISSED.
- Closing an account also deletes that person's password requests.
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
- ~~A verified farmer's new listing is `LIVE` at once.~~ Superseded by §11: a
  new listing is `PENDING` until an admin publishes it. `publiclyVisible()` is
  unchanged in shape: `LIVE` product, farmer who `canSellNow` (verified and
  subscribed), shop open.

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

Marathi and English, the two the reference already has. Marathi has priority;
English is a toggle.

- Marathi is the default language in the farmer/buyer app and in the admin
  console. Both have the English toggle.
- Every string is written in Marathi first. Marathi is the source text.
  English is written on its own for its reader, not translated word for word.
- The language picker lists मराठी first.
- A key missing in `en` falls back to Marathi, never the other way round. The
  i18n parity test covers both dictionaries, so a gap fails the build before
  the fallback is ever needed.
- `docs/MARATHI-STYLE.md` still governs Marathi.

### 5.11 Branding

Name "शेतकऱ्यापासून थेट ग्राहकापर्यंत" first, with "Farmers to Consumer"
second, on the landing page, page titles and headers, in every language.
Tagline "शेतकरी समृद्ध | ग्राहक सुरक्षित | शेती टिकाऊ".

**Logo:** the same portrait mark as the reference project (maroon and gold in
its own gold ring), copied as `frontend/src/assets/logo.png`,
`admin/src/assets/logo.png` and both `public/` favicons. As before, never give
it a border or a background — it already carries its ring.

**Palette:** leaf green leads, maroon supports. Only the `THEME SWAP POINT`
block of `theme.css` (and the matching block in `admin.css`) changes:

| Token | Value | Use |
|---|---|---|
| `--leaf` | `#2e7d32` | primary action, header, active tab (white text 5.1:1) |
| `--leaf-dark` | `#1b5e20` | pressed |
| `--leaf-mid` | `#43a047` | secondary highlights |
| `--leaf-soft` | `#e8f5e9` | tinted surface |
| `--maroon` | `#7b1e2e` | second accent: price, farmer name, headings, links |
| `--maroon-soft` | `#f8e9e8` | maroon-tinted surface |
| `--gold` | `#b6851b` | stars, small highlights (kept from the logo) |
| `--bg` | `#f7f5ec` | page ground, a cooler cream than the reference |
| `--danger` | `#b3341f` | errors, kept distinct from maroon |

`--ok` points at `--leaf-dark`; status still carries icon + word, so a
green "confirmed" beside green buttons is never read from colour alone. Chart
series: leaf green, maroon, gold, then the reference's remaining validated
colours.

The reference has no `--primary` token: `var(--maroon)` is used directly 54
times in `theme.css`, 23 in `admin.css` and 6 in `.tsx` files. The step adds
`--primary`, `--primary-dark`, `--primary-soft` (pointing at the leaf tokens),
moves every action/header/tab use of `--maroon` onto them, and leaves
`--maroon` only where it is the accent (price, names, headings). After that,
retheming is again a change to the `:root` block alone.

Landing page follows the poster: need, objectives, workflow, benefits, college
card with researcher and guide names from the paper.

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
- `passwordRequests`: new. Role, phone, name, village (farmer), the matched
  account if any, time, status `OPEN` / `DONE` / `DISMISSED`, who closed it
  and when. Deleted with the account.
- `payments` (subscription): removed. **Restored by §11**, keyed by
  `farmerId`/`farmerCode`.
- `sessions`: drop `pushToken`, `pushLang`.

The database starts empty. `SEED_DEMO_DATA` seeds the four sample farmers from
the poster (Rajesh Patil tomato, Savita Kamble okra, Ganesh Jagdale onion,
Lakshmi Shinde gram) in Anadur.

## 8. Testing

Keep the reference suites that still apply, adapted to the new names. New or
rewritten tests:

- password register/login, wrong password, rate limit, must-change flow,
  admin reset revokes sessions
- forgot-password requests: an unknown phone gets the same answer as a known
  one, a repeat refreshes the open request, the fourth in 24 hours is refused,
  a reset from the queue marks the request DONE, and the account is noted only
  when one exists
- FDRI score and band edges (3/4, 7/8)
- pickup transitions and buyer stages
- trace route visibility matches `publiclyVisible()`
- public farmer key set and location rounding
- verification gate: unverified farmer's listing not public
- price hint median and unit conversion; missing API key
- research tables on a fixed fixture, including the cross-tab
- i18n parity across mr/en

`npm test`, `npm run typecheck` and `npm run build` pass before each step is
called done. `docs/MANUAL-TEST-PLAN.md` is rewritten for the new flows.

## 9. Build order

1. Copy, rename packages, `git init`, first commit; build and tests green.
2. Strip removed features (section 4); build and tests green.
3. Password authentication, forgot-password requests and admin reset.
4. Farmer model, registration wizard, verification, FDRI.
5. Produce listing, delivery and pickup.
6. Traceability QR.
7. Maps.
8. Price hint, demand/supply chart, voice search.
9. Survey entry, research tables, CSV export.
10. Branding, landing page and the Marathi-first language rules.
11. Docs (`CLAUDE.md`, `README.md`, `DEPLOY.md`, `MANUAL-TEST-PLAN.md`) and
    deployment.

## 10. Out of scope

Android app, push notifications, OTP/SMS, payment gateway, paid AI, crop
disease detection, cold-chain, FPO integration, cross-district logistics.

## 11. Addendum 2026-09-27: subscription and listing approval restored

Date: 2026-09-27. Status: decided in chat; supersedes the Fee and Moderation
rows of §2, the three "Restored by §11" removals in §4, the "LIVE at once"
line of §5.4 and the `payments` line of §7. Everything else in this document
stands. The work is a **port** of the reference project's rules into the
current code (farmer names, produce model, redesigned screens), not a revert
of commit `78d261f`; the exact removed code is at `git show 5a4fa96:<path>`.

### 11.1 Two gates, both required

A farmer sells only when **verified and subscribed**.

- **Verification** is unchanged from §5.2: `PENDING_VERIFICATION` at
  registration, `ACTIVE` after `POST /admin/farmers/:id/verify` (once, by a
  person). `FarmerStatus` gains no new values; the payment queue's state lives
  on the payment, never on the farmer.
- **Subscription**: ₹50 = one **pack** = 5 listing slots, and the shop is
  open for **6 calendar months** from the admin's approval of a payment.
- `canSellNow(f, now)` in `shared/src/subscription.ts` is
  `f.status === 'ACTIVE' && termOpen(f, now)`, where `termOpen` is
  `subscriptionEndsAt` present and later than `now`. A verified farmer who has
  never paid is **not** on sale; neither is one whose term ended. Every public
  path asks it: `publiclyVisible`, serviceability, `GET /farmers/:id`,
  `GET /catalog/farmers/:id/contact`, `POST /orders`, the price hint's
  platform median, and submitting a listing.
- Paying never changes `status`. The farmer may pay before or after
  verification, and **the term never runs while the farmer is unverified**:
  a payment approved for a `PENDING_VERIFICATION` farmer grants its slots and
  starts no term; `POST /admin/farmers/:id/verify` then starts the six months
  at the verification moment when the farmer holds approved packs and no term
  (`startTermOnVerify`). Once verified, approval behaves as §11.2 says.
- No screen computes the term on the phone. The API sends
  `subscriptionView` (server clock) on `/farmers/me`, `/products/mine`,
  `/farmers/me/subscription`, `/admin/farmers` and `/admin/farmers/:id`;
  the frontend never calls `canSellNow`.

### 11.2 The term

`Farmer.subscriptionEndsAt` is the whole stored state. Expiry writes nothing:
no listing flips, `isOpen` is untouched, no slot is released; the answer
changes when the clock passes the date, and renewal is the date moving.

- `addMonths(iso, 6)` counts calendar months in IST (+05:30) and clamps to
  the last day of a short month: 31 Aug → 28 Feb.
- States (`subscriptionState`): `none` (no date), `active`, `expiring`
  (7 days or fewer left, `RENEW_REMINDER_DAYS`), `expired`.
- `endsAtAfterApproval(f, kind, approvedAt)`: no term yet → 6 months from
  approval, whatever was bought; already expired → 6 months from approval;
  `RENEWAL` while open → 6 months after the **current** end; `PACK` mid-term →
  unchanged.
- `payableKinds(f, slotsLeft)`: never paid → `['PACK']`; expired →
  `['RENEWAL']` only; expiring → `RENEWAL` first, then `PACK` if slots are
  full; otherwise `PACK` only when slots are full. Sent to the screen as
  `payable` and enforced on submit (`paymentKindProblem`, Marathi).
- `applyApprovedPayment(farmer, payment, approvedAt)`: a `PACK` adds one to
  `packsApproved` and writes `PAYMENT_APPROVED` (`n: 5`). **Unverified farmer
  (`verifiedAt` absent):** nothing else — no term, `payment.termEndsAt`
  unset, whatever the kind; a `RENEWAL` approved here buys no second term, so
  verification starts exactly one. **Verified farmer:** either kind sets
  `subscriptionEndsAt` by the rule above, copies it to `payment.termEndsAt`,
  and writes `SUBSCRIPTION_RENEWED` (`note` = new end date) for a renewal or
  for any payment that reopened an expired shop. Status is never changed.
- `startTermOnVerify(farmer, verifiedAt)`: when `packsApproved > 0` and no
  `subscriptionEndsAt`, sets it to `addMonths(verifiedAt, 6)` and writes
  `SUBSCRIPTION_RENEWED` with the date. Called by the verify route (and so by
  the CLI's `verify`); a farmer with no packs is verified and waits to pay.
- Slots without money: `POST /admin/farmers/:id/grant-slots { packs }` adds
  packs and writes `SLOTS_GRANTED` (`n` in slots); it starts a term only for a
  **verified** farmer with none (six months from now) and never extends one —
  goodwill is slots, time is paid. For an unverified farmer the term starts at
  verification like any other pack. `POST /admin/farmers/:id/revoke-slots
  { packs }` answers 409 when the remaining slots would fall below those in
  use (`revokeProblem`), otherwise lowers `packsApproved` and writes
  `SLOTS_REVOKED`; neither route touches `status` or the term.

### 11.3 Paying

- Payee: `ADMIN_PAYMENT_ACCOUNT` in `backend/src/config.ts`, read from
  `ADMIN_UPI_NAME` / `ADMIN_UPI_ID` / `ADMIN_BANK_NAME`, defaulting to
  `PRIN.JAWAHAR ARTS.SC.COM.` / `jasccollegeandur@sbi` / `State Bank of
  India`. `backend/tests/payment-account.test.ts` asserts `upiProblem()` is
  null on it and the label and bank are non-empty. No account number or IFSC.
- Screen `/farmer/subscription` (`screens/farmer/Subscription.tsx`): amount,
  `QrCode` of `buildUpiLink({ upiId, name: label, amount: 50, note })`,
  `PaySteps screenshot`, payee name, `CopyValue` of the UPI ID arming
  `useReturnFromApp`, then the three proofs: screenshot (`PhotoPicker
  kind="payment"`), `paidAt` (`datetime-local`, pre-filled now), 12-digit UTR.
  Submit stays disabled until all three pass. `/farmer/waiting` polls every
  10 s while the tab is visible and settles on the **latest payment's**
  status.
- `POST /farmers/me/subscription/payment { kind, utr, paidAt, screenshotUrl,
  payerUpi? }`: 409 while a `PENDING` payment exists (one at a time); 409
  when `kind` is not payable; 400 on UTR (`utrProblem`), screenshot
  (`screenshotProblem`) or time (`paidAtProblem`: not in the future beyond
  10 minutes, not older than `PAID_AT_MAX_AGE_DAYS` = 7). A `kind` missing
  from the body means the most urgent payable one.
- `screenshotProblem(url, cloudinary)` in `backend/src/db/payments.ts`
  accepts only `https://res.cloudinary.com/<cloud>/image/upload/…/<folder>/payment/…`;
  with Cloudinary off it requires nothing, and the route says so as
  `screenshotRequired: false`.
- `duplicateUtr` is set when another farmer's payment carries the same UTR.
  The row is still queued; the console flags it.

### 11.4 Approving

- `GET /admin/payments?status=PENDING|APPROVED|REJECTED|ALL`. No
  `waitingHours` from the server: the console computes the wait from
  `submittedAt` with `waited()` and re-reads the clock every 30 minutes.
- `POST /admin/payments/:id/approve { checks }` refuses (400) unless `checks`
  holds all of `PAYMENT_CHECKS = ['utr', 'dateTime', 'received']`
  (`allChecksDone`), 404 unknown, 409 already decided. Then
  `applyApprovedPayment`, `verifiedAt`/`verifiedBy` on the payment.
- `POST /admin/payments/:id/reject { reason }`: no checklist; stores the
  reason, writes a `PAYMENT_REJECTED` notice with it. The farmer's status and
  term are untouched.
- Console: screenshot thumbnail opening large beside the UTR, time and
  amount; kind pill; duplicate pill; "paid over 24 h before sending" pill.
- CLI: `pending`, `approve <id|phone|farmer-code> --verified` (sends the
  three checks; refuses without the flag and never offers `all`), `reject
  <id> [reason]`, `grant <phone|farmer-code> [packs]`, `products`,
  `approve-product <id>`. `verify` goes through the same route, so it starts
  the term of a farmer who paid first.

### 11.5 Listing approval

- `initialListingStatus(asDraft)` is `DRAFT` or `PENDING`, never `LIVE`.
  `POST /admin/products/:id/moderate { approve: true }` is the only path to
  `LIVE` (only from `PENDING`, 409 otherwise) and writes `PRODUCT_APPROVED`
  (`subject` = name). `approve: false` with a required reason **deletes** the
  row, its photo and its reports and writes `PRODUCT_REJECTED`, from any
  status; the slot frees at that moment.
- `SLOT_CONSUMING = ['PENDING', 'LIVE', 'PAUSED']`; `DRAFT` holds no slot.
  `slotInfo(farmer, products)`: `total = packsApproved × 5`, `isFull = used
  >= total` (zero packs is full, not unlimited), `almostFull` when one is
  left.
- Submitting (`POST /products`, and `PATCH` `DRAFT → LIVE`) refuses in this
  order: 403 not verified; 403 no open term (`तुमची वर्गणी सुरू नाही…`); 402
  no free slot (`slots` in the body). Drafts skip all three.
- `farmerMayDelete(status)` is true only for `DRAFT`; `DELETE /products/:id`
  answers 403 otherwise and My Products shows Remove only on a draft.
- `LIVE ↔ PAUSED` stays the farmer's own free toggle. An edited `LIVE`
  listing stays `LIVE`. A `PENDING` listing may be edited freely and stays
  `PENDING`; the admin publishes the latest version.
- Publishing a listing does not check the farmer's term: a `LIVE` listing
  under an expired shop is hidden by `publiclyVisible` until renewal.
- The farmer's copy says "send for checking" (`prod.publish`), never
  "publish"; the review step says an admin looks first and how many slots
  this uses.
- Admin Products opens on a **Pending** tab (default filter `PENDING`),
  then Live, then Reported; `AdminStats.pendingProducts` badges it.

### 11.6 Two edits per live listing

- `MAX_EDITS = 2`, counted on `Product.editCount` (absent reads as 0).
- `EDIT_COUNTED_FIELDS = ['cropId', 'name', 'imageUrl', 'categoryId',
  'unit', 'cultivation']`. Free for ever: `price`, `stock`, `minOrder`,
  `harvestDate`, `description`, and the pause toggle.
- `countsAsEdit(before, after)` compares **values** (blank equals blank,
  whitespace-trimmed strings, numeric coercion), so a save that changed
  nothing costs nothing. `editsAreLimited(status)` is `LIVE` or `PAUSED`.
- `PATCH /products/:id` answers 409 `{ editsLeft: 0 }` when a counted change
  arrives with none left; otherwise increments `editCount` on a counted save.
- `EditProduct` shows edits left (info / warn at one / danger at none) and the
  "price and stock stay free" line; at zero it disables crop, category, name,
  photo (`PhotoPicker locked`), unit and cultivation, leaving the free fields
  live.

### 11.7 Admin console

- **Payments** screen (`/payments`, sidebar badge `pendingPayments`), sorted
  by `PAYMENT_SORTS` (newest, oldest = longest wait, amount, farmer name).
- Dashboard counters on `AdminStats`: `subscriptionsExpiring`,
  `subscriptionsExpired` (ACTIVE farmers in those states), `pendingPayments`,
  `pendingProducts`, `subscriptionRevenue` (sum of APPROVED amounts, never
  count × price), `approvedPaymentCount`. Home and Today show the two queues
  and the two subscription counts; Today shows income and approved count.
  `activeFarmers` already uses `canSellNow`, so it now counts subscribed
  shops only.
- **Farmers** list: status filter gains *ending within 7 days*, *expired*
  and *no subscription yet*; each verified farmer's row and detail page carry
  `SubscriptionPill` (date and colour, tone by state) and slots `used/total`.
  The detail page lists every payment with kind, status, UTR, reason and
  the end date it set (`termEndsAt`).
- **Grant / Remove slots** on the farmer's row and page (`FarmerActions`,
  behind `Confirm` with a 1–3 `PackPicker`): the grant sentence says how many
  slots and that no money changed hands; the revoke sentence says how many
  are in use and that the allowance cannot drop below them.

### 11.8 The farmer's screens

- `SubscriptionNotice` on My Business and My Products: the reminder week and
  the paused shop, each with the date and a renew button; nothing while the
  term is comfortably open. `SlotMeter` on My Business, My Products and the
  profile, with "add slots" only when full or with no packs.
- While expired, the shop-open card reads "paused, renews on approval" and
  a `LIVE` listing's pill reads `sub.pausedPill`; the stored status is
  untouched.
- Drafts are free (§11.5: drafts skip all three refusals). The Upload wizard
  stays open to every farmer who is not blocked or closing; only **sending**
  waits. When the farmer cannot send (`sendBlock`, in the server's order: not
  verified, no term, expired, slots full) the review step names the reason,
  offers the pay / renew / "5 more slots" button where one applies, and its
  one action is "save as draft". My Products' Add button is never disabled.
- A farmer who paid before being verified is told, on My Business and on the
  waiting screen's approved state, that **the six months start when they are
  verified** (`sub.startsOnVerify`); the "pay ₹50" prompt is not shown to
  someone who already holds packs.
- The registration done screen adds "Now pay ₹50 for 5 slots" with a button
  to `/farmer/subscription`, under the pending-verification notice.
- Updates list: `subscriptionFeed(view)` adds one derived row — the reminder
  (timed from `remindFrom`) or "paused, renew" (`standing`, never ages out);
  `adminFeed` renders `SUBSCRIPTION_RENEWED` with the date in the sentence;
  `PAYMENT_APPROVED`, `PAYMENT_REJECTED`, `PRODUCT_APPROVED` get their lines.
  `notif.verified` now says the subscription still matters.
- Help FAQ regains "I paid ₹50 but it is not approved"; the close-account
  sheet says the ₹50 is not returned.

### 11.9 Data model

- `Farmer`: `subscriptionEndsAt?: string`, `packsApproved?: number` (absent
  reads 0). `FarmerStatus` unchanged.
- `Product`: `status: 'DRAFT' | 'PENDING' | 'LIVE' | 'PAUSED'`,
  `editCount?: number`. No `REJECTED` or `ARCHIVED`: rejection deletes.
- `payments` collection (`SubscriptionPayment`): `id`, `kind?`,
  `termEndsAt?`, `farmerId`, `farmerName`, `farmerCode`, `phone`, `amount`,
  `utr`, `payerUpi`, `screenshotUrl?`, `paidAt?`, `submittedAt`, `status`
  (`PENDING | APPROVED | REJECTED`), `duplicateUtr`, `verifiedAt?`,
  `verifiedBy?`, `rejectReason?`. Added to `COLLECTIONS` in
  `db/firestore.ts`, so it is loaded at boot, counted in the read budget,
  guarded by `isBulkDelete` and included in backups.
- `AdminNoticeKind` adds `PAYMENT_APPROVED`, `PAYMENT_REJECTED`,
  `PRODUCT_APPROVED`, `SUBSCRIPTION_RENEWED`, `SLOTS_GRANTED`,
  `SLOTS_REVOKED` (ten in all). `SUBSCRIPTION_RENEWED` is worded as "your
  shop is open until {date}" on both sides, because it also announces the
  first term starting at verification.
- Closing an account: `scrubFarmer` also scrubs the farmer's payments —
  `farmerName` → placeholder, `phone` and `payerUpi` emptied, the screenshot
  destroyed by the public id parsed from its URL (`publicIdFromUrl`);
  `amount`, `utr`, `kind`, dates and status stay, because they are the
  programme's accounts.

### 11.10 Existing data

- `normalizeLegacyRows()` **stops** turning `PENDING` listings into `LIVE`;
  `PENDING` is a real status again. It still removes `REJECTED`/`ARCHIVED`
  rows with their photos and maps the old paid-before statuses to
  `PENDING_VERIFICATION`.
- `backfillSubscriptionTerms(db, now)` runs at boot after it, once per row:
  every non-closed farmer with `verifiedAt` **before `FREE_PERIOD_ENDED`**
  (`2026-09-28T00:00:00.000Z`, `shared/src/subscription.ts`) and no
  `subscriptionEndsAt` gets one. A farmer verified on or after the cutoff
  never sold for free and gets nothing: the backfill runs on every boot, and
  without the cutoff each cold start would hand an unpaid farmer a free term. Packs: if none, enough to hold the slots already in use, at least one
  (`max(1, ceil(used / 5))`). End date: 6 months from the last approved
  payment, else from `verifiedAt`, and never fewer than 7 days from `now`, so
  no shop that was selling under the free rule closes without a reminder
  week. A `PENDING_VERIFICATION` farmer with no payment is left alone.
- The demo seed gives its four farmers `packsApproved: 1` and a term of six
  months from their (60-day-old) verification; their four `LIVE` listings
  stay `LIVE` and visible. No payments are seeded: an invented UTR is
  invented money.

### 11.11 Judgement calls where the decisions were silent

1. **A pack approved before verification** grants its slots and starts no
   term; the six months begin at verification (decided 2026-09-28). Those
   payments carry no `termEndsAt` — the date they set is the one verification
   writes, and it is on the farmer. The term-start notice reuses
   `SUBSCRIPTION_RENEWED` rather than adding an eleventh kind.
2. **A verified farmer with no subscription is not on sale.** The reference's
   `canSellNow` treated "no date" as "not expired", which was safe only
   because status did the gating; here status is verification, so the term
   must be present. Hence the backfill, and hence the seed carries a term.
3. **Legacy verified farmers are given packs**, enough for what they already
   have on sale, rather than being asked to pay within seven days or lose
   their listings.
4. **No farmer statuses for payments** (`PAYMENT_SUBMITTED`,
   `PAYMENT_REJECTED` are not restored); `sellerStatusAfterReject` is not
   ported. Rejecting a payment changes the payment and writes a notice.
5. **Not restored**: the record-outside-payment route, the APK price-free
   twins, the "new payment" toast in the admin shell (the sidebar badge is
   the signal), and a `packsHigh` sort. Say so if any is wanted.
   `grant-slots` / `revoke-slots` **are** restored (decided 2026-09-28), with
   two departures from the reference: neither touches `status` (the
   reference flipped `REGISTERED ↔ ACTIVE`, which here would verify or
   un-verify by the back door), and revoking to zero packs leaves the term
   alone — with zero slots nothing can be in use, so nothing is on sale.
6. **`slotInfo.isFull` with zero packs is full.**
7. **`PENDING` listings are editable and unrationed**; approval is only from
   `PENDING`; the farmer cannot delete one.
8. **The counted photo field is `imageUrl` alone**; `imagePublicId` moves
   with it.
9. **Wait times on the Payments screen reuse the `pwr.wait.*` strings and
   the existing `waited()`** rather than restoring a second copy.
10. The order of refusals on submit is verification, term, slot, so the
    message a farmer reads names the first thing they can do about it.

### 11.12 Tests

Ported and adapted (`backend/tests`): `subscription.test.ts` (also the
term-at-verification cases and grant/revoke), `payment-proof.test.ts`,
`payment-reject.test.ts`, `payment-account.test.ts`, `slots.test.ts`,
`edit-limit.test.ts`, `listing-review.test.ts`. Rewritten:
`verification.test.ts` (verified **and** subscribed), `moderation.test.ts`
(`PENDING` untouched). Fixtures that build an `ACTIVE` farmer for a public
path gain a future `subscriptionEndsAt` (`catalog-visibility`, `trace`,
`map`, `price-hint`, `account-close`). Frontend: `notifications.test.ts`
covers `SUBSCRIPTION_RENEWED` and `subscriptionFeed`; the i18n and Marathi
tests guard every new string. Admin: `sort.test.ts` (`PAYMENT_SORTS`),
`format.test.ts` (`dateOnly`), `i18n.test.ts` (the four new notice kinds).
