# जवाहर शेतकरी बाजार · Jawahar Shetkari Bazar — Feature Specification

Farmers list produce, buyers order it, an admin verifies farmers and handles
complaints. Money goes from buyer to farmer directly; the platform never holds
it. Delivery or pickup is arranged between the two. Farmers and buyers use one
mobile-first **website**; the admin uses a separate web console. There is no
Android app.

The design record, with the reasons behind each choice, is
`docs/superpowers/specs/2026-09-26-farmer-to-consumer-design.md`. This file
describes what the product does.

---

## 1. Decisions

| Question | Answer |
|---|---|
| App or website? | Website only. No APK, no wrapper, no push notifications. |
| Login | Phone number + password (6+ characters, digits allowed). No OTP, no SMS. |
| Forgotten password | A public request page; an admin calls back with a temporary password that must be changed at next login. |
| One phone, two roles? | No. One phone is one account; farmer or buyer is chosen at registration. |
| Fee or commission? | None. Listing is free and the platform takes no share. |
| Who may sell? | A farmer verified once by an admin. After that, listings go live immediately. |
| Cart across farmers? | No. A cart holds one farmer's produce at a time. |
| Service area | Maharashtra pincodes only (hard gate). Inside it, a farmer's pincode list is a hint, not a gate. |
| Languages | Marathi (default and source text) and English (toggle, written on its own). |

---

## 2. Orders

```
PLACED → ACCEPTED → PACKED → OUT_FOR_DELIVERY → DELIVERED
                        └── (pickup) ─────────────┘
```

`shared/src/orderFlow.ts` is the single source of truth. For a pickup order,
`PACKED` reads "ready for pickup" and moves straight to `DELIVERED`; the
buyer sees three stages instead of four. `CANCELLED` ends an order from
either side.

- **Accept or reject.** The farmer accepts (optionally with a delivery time in
  their own words) or rejects with a reason from a list.
- **Payment after acceptance.** Payment mode is Cash on Delivery or UPI.
  A UPI order reaches the farmer unpaid; after acceptance the buyer pays the
  farmer's UPI ID (QR or copied ID) and enters the 12-digit UTR. A UTR is a
  claim, not money: only the farmer's own "money received", after checking
  their UPI app, confirms it, and `PACKED` is blocked until then.
- **Cancelling.** The buyer may cancel only while `PLACED`; the farmer from
  `ACCEPTED` to `OUT_FOR_DELIVERY`. A reason is always required. The farmer is
  then shown a refund notice: the site moves no money, so anything received
  must be returned by the farmer.
- **Rating.** After delivery the buyer must rate each product on the order
  (stars required, words optional) before placing another order.

---

## 3. Farmer

### Registration (one question per screen, progress dots)

1. Phone and password
2. Name (voice input allowed)
3. Village, taluka, pincode
4. Location — "माझे ठिकाण वापरा" with a consent sentence; skippable
5. Main crops
6. UPI ID — checked by `upiProblem()`; a near-miss handle ("@ybll") is named
7. Age group, education, landholding, farmer type
8. The ten FDRI questions, one yes/no each
9. Current selling channel and main problems
10. Review, with "बदला" back to each screen

The farmer gets an ID `F2C-<VILLAGE>-<NNN>`, serial per village. Status is
`PENDING_VERIFICATION` until an admin verifies; listings can be prepared but
nothing is public. Blocking stays available to the admin.

### FDRI — Farmer Digital Readiness Index (`shared/src/fdri.ts`)

Ten indicators, one point each: smartphone, internet, WhatsApp, digital
payment, online market information, digital promotion, online selling
experience, willingness for direct selling, packaging/branding readiness,
training willingness. Bands: Low 0–3, Moderate 4–7, High 8–10.

### Farmer app — four tabs

- **My business**: shop open/closed, orders needing action, rating, links to
  produce, orders, buyers, reviews and growth (FDRI).
- **New listing**: the listing wizard.
- **Profile**: details, UPI and QR, delivery and pickup, map pin, language,
  close account.
- **Help**: walkthroughs, contact, and a **complaint** to the admin
  (payment, order, product, account, other).

### Delivery and pickup

A farmer offers at least one:

- **Home delivery** — pincode list (a hint) and a delivery charge; 0 means
  "ask the farmer", never "free". `freeDeliveryAbove` is the farmer's own
  promise.
- **Pickup** — a named place, with optional GPS.

---

## 4. Produce listing

Fields: crop name, category, unit, available quantity, minimum order, price
per unit, one photo, harvest date, cultivation type, optional description.

- **Categories**: vegetables, leafy vegetables, fruits, grains, pulses,
  spices, processed products, other (the escape hatch).
- **Units**: kg, quintal, dozen, piece, litre.
- **Cultivation**: organic (सेंद्रिय), natural (नैसर्गिक), chemical
  (रासायनिक) — icon + word.
- **Harvest date**: not in the future; buyers see "harvested N days ago".
- **Minimum order**: at least 1, at most the stock; the cart steps between
  the minimum and the stock.
- A verified farmer's listing is `LIVE` at once. Price and quantity are
  always editable; the edit screen is one page, not a wizard.
- **Price hint** under the price box: the site's median for that crop and
  unit, recent order prices, and — with `DATA_GOV_IN_API_KEY` — the latest
  Agmarknet mandi price converted to the unit. Advice, never a default.
- Photos come from the gallery and are compressed on the phone before upload
  to Cloudinary.

### Traceability QR

Each listing has a QR (download as PNG, or print) pointing at
`/trace/<productId>`. The public trace page shows farmer name and ID,
village, crop, harvest date, cultivation, price, quantity, the farmer's phone,
an approximate map pin and "order now". It is visible exactly as far as the
listing is public.

---

## 5. Buyer

- Register with phone, password and name.
- Four tabs: **Explore**, **Categories**, **Cart**, **My profile**.
- **Explore**: search (with a mic), product cards with rating.
- **Farmer map** (Leaflet + OpenStreetMap): verified farmers with live
  produce, locations rounded to ~1 km, filter by category.
- **Product page**: photo, price per unit, harvest age, cultivation, farmer
  card with rating, more from this farmer. A farmer page shows all live
  produce.
- **Cart and checkout**: one farmer per cart; delivery (address, pincode) or
  pickup; COD or UPI.
- **My orders**: active, completed, cancelled; a tracker per order.
- **Profile**: saved addresses, language, close account.
- **Report** a listing or a review, with a reason.

What the public may see is one rule, `publiclyVisible()`: a `LIVE` listing of
an `ACTIVE` (verified) farmer whose shop is open. A hidden listing answers
404. A farmer leaves the API unauthenticated only as `PublicFarmer`, an
allow-list with the location rounded to 2 decimals; the phone reaches a buyer
on their own order and on the trace page.

---

## 6. Admin console

| Screen | What it does |
|---|---|
| Today / Home | What is waiting: unverified farmers, password requests, reports, complaints |
| Farmers | Register, sort, filter; detail with **Verify**, **Block**, **Reset password** |
| Password requests | Queue from the public forgot-password page; call, reset, or close |
| Products | All listings; **Reported** tab; take a listing down or clear reports |
| Orders | Every order, with who ended it and why |
| Reviews | Low ratings, reported, hidden; **Hide** with a reason |
| Complaints | Resolve with a note |
| Map | Exact farmer pins and unlinked questionnaire pins; filter by crop, village, FDRI band |
| Demand & supply | Per crop: quantity ordered in the last 30 days vs. quantity listed |
| Impact | Farmers, orders, money earned by farmers, FDRI bands |
| Surveys | Enter a paper questionnaire; link it to a farmer; delete it |
| Research | Tables 1–9 with a CSV download each |

Admins are database records with scrypt hashes, managed by
`npm run admin:users`. A password reset shows a 6-digit temporary password
once, sets `mustChangePassword` and revokes every session of that user.

### Research module (spec §5.9)

- **Surveys** (`/surveys`): a coordinator types in a paper questionnaire for a
  farmer with or without an account — village, optional phone, age group,
  education, landholding, farming type, crops, selling channels, problems, the
  ten FDRI questions (each may stay "not asked"), and an optional location.
  Stored in the `surveys` collection (`backend/src/routes/surveys.routes.ts`).
- **Linking**: a questionnaire whose phone matches a farmer is linked to that
  farmer, both when it is entered and when the farmer registers later; an
  admin can also link one by hand. A linked questionnaire is the same person,
  so it is not counted or pinned a second time. Closed accounts are never
  linked, and closing an account strips phone, location and photo from linked
  questionnaires.
- **Research tables** (`/research`): the paper's Tables 1–9
  (`shared/src/research.ts`) over every farmer not closed plus every unlinked
  questionnaire. Skipped answers appear as a "not answered" row, never as
  "no"; Tables 8–9 band only respondents who answered all ten FDRI questions.
  Each table downloads as a CSV (UTF-8 with BOM, so Excel keeps Devanagari).
- **Map**: unlinked questionnaires with a location are drawn as their own pins.

---

## 7. Designing for rural, first-time smartphone users

Status is colour + icon + word · 16px minimum text, 56px buttons, 44px touch
targets · four bottom tabs, no hamburger menu · one question per screen in
wizards · confirmations state the consequence · Latin digits · no web fonts ·
no emoji · voice input is an addition, never a replacement for the keyboard ·
Marathi follows `docs/MARATHI-STYLE.md`.

---

## 8. Non-functional

- One Cloud Run API (maximum instances 1, CPU always allocated), Firestore
  through `firebase-admin` only, Cloudinary for photos, two Vercel sites.
  See `docs/DEPLOY.md` and `docs/CAPACITY.md`.
- Every rule is enforced on the server; the client checks only for a faster,
  friendlier message.
- Every error carries a Marathi message: `{ error, messageMr, fields? }`.
- Sessions are server-side rows; logout and account close revoke them.
- Nightly backups to separate accounts: `docs/BACKUP.md`.

---

## 9. Not built yet

Phone notifications · chat · returns and refunds inside the site · delivery
charge by distance · in-app camera capture · farmer replies to reviews. See `docs/FUTURE-SCOPE.md`.
