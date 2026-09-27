# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

जवाहर शेतकरी बाजार / Jawahar Shetkari Bazar — a website where farmers in Maharashtra sell produce straight to buyers. Farmers register, an admin verifies each one once, they pay ₹50 for a pack of five listing slots and six months of shop, each listing is published by an admin, buyers order for delivery or pickup and pay by UPI or cash. The admin console also holds field-survey entry and the research paper's Tables 1–9.

- **frontend/** — farmer + buyer website (React/Vite)
- **admin/** — admin console (React/Vite, deployed separately)
- **backend/** — Express API for both, including `/api/admin/*`
- **shared/** — domain types and rules imported by all three

Design spec: `docs/superpowers/specs/2026-09-26-farmer-to-consumer-design.md`. Deployment: `docs/DEPLOY.md`. Read `docs/MARATHI-STYLE.md` before writing any Marathi string. `README.md` stays short (layout, run, demo logins); rules and architecture live here and in `docs/`.

## Commands

```bash
npm install            # all four workspaces
npm run dev            # API :4000 + farmer/buyer site :5173
npm run dev:all        # the above + admin console :5174
npm run dev:api | dev:web | dev:admin

npm test               # backend (420) + frontend (140) + admin (40) tests
npm run typecheck      # all three workspaces
npm run build          # backend tsc + both Vite builds

npm run admin -- farmers                          # every farmer with status
npm run admin -- verify <id|phone|farmer-code>    # verify a farmer from the CLI (starts the term if they paid first)
npm run admin -- pending                          # ₹50 payments waiting for approval
npm run admin -- approve <id|phone|farmer-code> --verified   # after checking UTR, time and bank statement
npm run admin -- reject <id> [reason]             # reject a payment; the farmer reads the reason
npm run admin -- grant <phone|farmer-code> [packs]           # slots with no payment; never extends a term
npm run admin -- products                         # listings waiting to be checked
npm run admin -- approve-product <id>             # publish a waiting listing
npm run admin -- set-password <phone> <password>  # demo password for a (seeded) farmer; API stopped
npm run admin:users -- create you@example.com "Your Name"   # admin accounts (list / passwd / disable / hash)
npm run backfill:customers -- --help
npm run purge:demo -- --help
npm run backup -- --dry-run      # see BACKUP_* in backend/.env.example and docs/BACKUP.md
```

Single test file (`node:test` via tsx, no framework):

```bash
cd backend && node --import tsx --test tests/password-auth.test.ts
cd admin   && node --import tsx --test tests/i18n.test.ts
```

Vite proxies `/api` to `localhost:4000`. A fresh clone starts with an **empty** database; demo data needs `SEED_DEMO_DATA=true` in `backend/.env`. Reseed by stopping the API and deleting `backend/data/db.json`, or `POST /api/dev/reset` (404 unless `ALLOW_DEV_RESET` is set outside production). Seeding never invents passwords: give a seeded farmer one with `npm run admin -- set-password 9822011223 123456`, then sign in at `/login/farmer`. There is no default admin; create one with `admin:users`, or on a host with no shell set `ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD_HASH`, sign in once, and remove both. The API holds the database in memory, so run the CLIs with it stopped.

## Import convention — read before writing any import

Cross-workspace imports use `@shared/*` **with a `.js` extension on a `.ts` file**:

```ts
import type { Order } from '@shared/types.js'   // resolves to shared/src/types.ts
```

The backend is `module: NodeNext`, which needs `.js` at runtime; both Vite configs rewrite `@shared/<x>.js` → `shared/src/<x>.ts`. Dropping the `.js` or writing `.ts` breaks one side. Relative imports inside `frontend/` and `admin/` use `.js` too. `shared/` is not built — it is consumed as TypeScript source, so a change there is a compile error wherever the other side has not caught up. The backend build is `tsc` **plus** `scripts/fix-shared-imports.js`, which rewrites `@shared/…` specifiers in the output; without it the container dies on its first import.

`frontend/` and `admin/` list `"@f2c/shared": "*"` in `dependencies` although nothing imports that name. It is for Vercel, which decides whether a commit touches a project from `package.json` alone; without it a change only to `shared/` redeploys neither app. Do not remove it as unused.

## Architecture

### Persistence: one synchronous interface, one process

`backend/src/db/store.ts` exposes a **synchronous** `getDb()` backed by Firestore or a JSON file, chosen by whether `FIREBASE_*` credentials are present. The whole dataset (farmers, products, orders, payments, customers, reviews, reports, complaints, the auth collections, surveys) is loaded at boot; `save()` schedules a diffed, batched write coalesced over 400ms.

- **`initStore()` finishes before the first request** — `index.ts` awaits it.
- **Writes are diffed.** Only changed documents are sent; never add a path that rewrites a whole collection.
- **No persist may delete more than half a collection.** `isBulkDelete()` in `firestore.ts` refuses it, keeps the documents and logs loudly; `ALLOW_BULK_DELETE=true`, set inline on the one command that means it, is the override. The lesson behind it: a process whose in-memory arrays were empty once persisted that emptiness over real farmers and products. A refusal means memory and the server disagree — find out why before trusting that process.
- **Correct for exactly ONE server process.** Two instances hold two snapshots and overwrite each other silently. Cloud Run is pinned to `--max-instances=1`; a deploy briefly runs two revisions, so deploy when nobody is ordering. Outgrowing this means async per-document reads in every handler — real work, not a config change.
- **Boot failure:** in production, a Firestore load failure refuses to start ("Refusing to start on an empty database" — often the Spark plan's daily reads, `docs/CAPACITY.md` §4); down is honest, empty loses data. In development it falls back to the JSON file and says so. Reads and writes share one `firestoreLive` flag.
- An empty database stays empty unless `SEED_DEMO_DATA` is set. Never seed automatically.
- `normalizeLegacyRows()` (`db/moderation.ts`) runs at boot and turns rows stored under removed rules (PENDING/REJECTED/ARCHIVED listings, unpaid farmer statuses) into current ones; a no-op on clean data.

Firebase is **server-side only** (`firebase-admin`, service account). No Firebase Web SDK anywhere: `firestore.rules` denies all client access because every business rule lives in the API.

### Sessions and password sign-in

`backend/src/auth/` is the stack; `middleware/auth.ts` composes it. There is **no SMS and no OTP** anywhere.

- **Farmers and buyers sign in with phone + password; admins with email + password.** Passwords live in the `credentials` collection (`auth/credentials.ts`), never on a Farmer or Customer row. `shared/src/password.ts` is the rule on both sides: at least 6 characters, digits alone allowed, no leading/trailing space — a composition rule would only get the password written on the phone's back cover. Hashes are scrypt; an unknown phone still pays for a hash so timing does not reveal which numbers have accounts.
- **Phone is the account**, so `normalizePhone()` (`shared/src/farmer.ts`) reduces "+91 98765 43210", "098765…" and "9876543210" to one value everywhere it is stored or compared.
- **One answer for every failure** — unknown phone and wrong password read the same, and every attempt is counted before it is answered.
- **Forgotten password is a request to a person** (`auth/passwordRequests.ts`). The public `/forgot-password/:role` page posts `POST /auth/password-requests`; the reply is identical whether or not the number is registered, and the match is kept for the admin only. The admin's **Password requests** queue (`admin/src/screens/PasswordRequests.tsx`) resets from the request: `POST /admin/users/reset-password` returns a **six-digit temporary password once**, read out on a call to the account's own number, revokes every session, and marks the credential `mustChangePassword`. Until it is changed, the middleware lets that session reach only `/api/auth/password` and `/api/auth/logout` (403 `MUST_CHANGE_PASSWORD`), and the app routes to `/password`.
- **Rate limits** (`auth/rateLimit.ts`) are keyed by subject *and* IP — subject alone lets a script walk numbers, IP alone punishes a village behind one carrier NAT. Login: 5 wrong per phone per 15 min, 50 per IP per hour. Forgot-password: 3 per phone per day, 20 per IP per hour. Registration: 10 per IP per hour. This needs `app.set('trust proxy', 1)`. `retryInMr()` says the wait in days/hours/minutes and inflects for one.
- **Registration signs you in** (`POST /farmers/register`, `POST /customers/register`), setting the credential and a session together. No SMS proves the phone; for farmers the admin's verification is that check.
- **The token carries no identity.** It is `base64url({sid, role, iat}).HMAC`, signed with `SESSION_SECRET`; `sid` points at a `sessions` row that holds the user, so deleting the row revokes it instantly. `auth/crypto.ts` is the only file touching `node:crypto`, and every signature is domain-separated by purpose.
- **Idle windows** (admin 8h, farmer/buyer 15 days) plus **absolute ceilings** (7d / 90d) so a copied token cannot live forever by being used. Past half the idle window the server re-stamps the token on **`X-Session-Token`**, which must stay in CORS `exposedHeaders`. Both api clients hold the token in memory and use `localStorage` only across a reload; on the farmer/buyer app the refreshed token must reach `wb.session` too (`AuthContext` is the only subscriber of `onTokenRefresh`/`onSessionExpired`).
- `attachAuth` never rejects; `requireRole(...)` does (401 = dead session, 403 = not your door). **Only Log out and a 401 end a session** — Back, refresh and re-entering a section never do; login screens redirect an already-signed-in matching role home.

### Verification, once

A new farmer is `PENDING_VERIFICATION` and invisible to buyers. An admin checks the person once — usually a field visit — and `POST /admin/farmers/:id/verify` (or `npm run admin -- verify`) makes them `ACTIVE`, stamps `verifiedAt`/`verifiedBy`, and writes a `VERIFIED` notice. Block/unblock and account restore key on `verifiedAt`, so they never drop a verified farmer back to waiting.

Verification is one of **two** gates. `canSellNow()` in `shared/src/subscription.ts` is `status === 'ACTIVE'` **and** an open term; a verified farmer who has never paid is not on sale. Paying never changes status. **The term never runs while the farmer is unverified**: a payment approved before the visit grants slots only, and `startTermOnVerify` (called by the verify route) starts the six months at verification when the farmer holds packs and no term — so nobody pays for the wait, and two ₹50s approved before the visit are still one first term.

### Nothing goes live until an admin publishes it

`initialListingStatus()` in `shared/src/farmer.ts` is the rule, and it returns `DRAFT` or `PENDING`, never `LIVE`. `POST /products` and a draft sent in (`PATCH` with `status: 'LIVE'` from `DRAFT`, behind the same verification, term and slot gates as a new listing) both land on `PENDING`; `POST /admin/products/:id/moderate { approve: true }` is the only path to `LIVE`, and only from `PENDING` (409 otherwise), writing a `PRODUCT_APPROVED` notice. A listing carries a photograph, a price, a harvest date and a claim about how the crop was grown, and it goes out under the programme's name — so a person looks before a buyer does.

- **Reject and take-down are one act**: `approve: false` with a required reason deletes the row, its photo and its reports at once and writes `PRODUCT_REJECTED` with the reason. Deleting the row is what gives the slot back (`SLOT_CONSUMING` is `PENDING`, `LIVE`, `PAUSED`; a draft holds none).
- **A farmer deletes drafts only** (`farmerMayDelete()`; `DELETE /products/:id` answers 403 otherwise). Anything sent in holds a slot, and freeing a slot is the admin's decision — which is also what keeps the edit limit below from being dodged by delete-and-relist.
- A `PENDING` listing stays editable and unrationed while it waits; a `LIVE` listing that is edited stays `LIVE` rather than going back into the queue. `LIVE ↔ PAUSED` is the farmer's own toggle and costs nothing.
- The farmer's side says **"send for checking"** (`prod.publish`), on the button and under it (`prod.reviewNote`), and the row reads तपासणी सुरू: a screen that said "published" about a listing nobody has approved has told them nothing.
- The admin's **Products** opens on the waiting listings (`GET /admin/products` defaults to `PENDING`), with Publish and Reject on each; `npm run admin -- products` / `approve-product <id>` do the same from the CLI.
- Every public path (`publiclyVisible`, the map, trace, serviceability, price hint, demand) tests `status === 'LIVE'`, so a waiting listing is invisible to buyers. `normalizeLegacyRows` leaves `PENDING` alone.

### Editing a published listing

`PATCH /products/:id` is the only way a listing changes after it exists, and **a live listing may change what it *is* twice**. `MAX_EDITS`, `EDIT_COUNTED_FIELDS`, `countsAsEdit()`, `editsLeft()` and `editsAreLimited()` in `shared/src/farmer.ts` are the rule; the server enforces it (409 `{ editsLeft: 0 }`), `EditProduct` reads the same functions and disables what has run out.

A slot is one listing live at a time, so editing never wins a second listing — but without a limit one paid slot becomes a different crop every season. Two edits is the line between fixing a listing and replacing it.

- **Counted:** `cropId`, `name`, `imageUrl`, `categoryId`, `unit`, `cultivation`. **Free for ever:** `price`, `stock`, `minOrder`, `harvestDate`, `description`, and pause/resume — a farmer who cannot correct a price stops keeping it honest.
- `countsAsEdit()` compares **values**, not keys: the edit form posts the whole product on every save, and a save that changed nothing (or only whitespace) costs nothing.
- `editsAreLimited()` is `LIVE` / `PAUSED` only; a draft or a waiting listing is still being written.
- `editCount` is optional and absent reads as 0, so nothing published before the rule loses an edit.
- `EditProduct` shows how many edits are left, warns when the change on screen would spend the last one, and at zero shows the crop, name, photo, unit and cultivation without offering to change them (`PhotoPicker locked`, pickers `disabled`); price, stock, minimum and harvest date stay live.

### Produce rules

`shared/src/produce.ts` and `crops.ts`, enforced by the wizard, the edit screen and the server alike (`listingProblems()`):

- A listing names a **crop** from `CROPS`; its category is derived from the crop (`categoryFor()`), so onions cannot be filed under fruit. Only crop `other` lets the farmer pick a category, and the server refuses a `categoryId` not in `CATEGORIES` (`backend/src/db/seed.ts`).
- **Unit** is kg, quintal, dozen, piece or litre; price is rupees per one unit. **Stock** and **minimum order** are whole units; stock 0 is "sold out for now". Orders do **not** decrement stock — the farmer keeps it current. `orderQtyProblem()` checks lines on the server; `cartStep()` steps the cart between minimum and stock.
- **Harvest date** is required, never in the future, and for vegetables, leafy greens and fruit no older than `FRESH_MAX_DAYS` (60), counted in IST. **Cultivation** is organic, natural or chemical. Description ≤ 500.
- The upload wizard asks one question per screen; `EditProduct` puts every field on one page, because a farmer who came to fix a price should not walk four screens — and a live listing may change what it *is* twice (see *Editing a published listing*).

### Farmer profile, FDRI and codes

- Registration also asks the paper's questionnaire (`shared/src/profile.ts`: age group, education, landholding, farmer types, selling channels, problems) — all optional and stored as codes, dropped rather than refused if unknown.
- **FDRI** (`shared/src/fdri.ts`): ten yes/no indicators, one mark each; bands 0–3 low, 4–7 moderate, 8–10 high. Stored per indicator so each can be tabulated alone.
- **Farmer code** (`shared/src/farmerCode.ts`): `F2C-<VILLAGE>-<NNN>`, serial **per village** so the code tells a coordinator where to go. Known survey villages have fixed codes in `VILLAGES`; others are transliterated from Devanagari. A new farmer whose phone matches a typed-in survey is linked to it (`linkSurveysByPhone`).

### Location privacy and maps

`shared/src/geo.ts`. A farm point is stored only with an explicit yes (`locationConsent`) and only if `isValidLatLng()` (roughly India). Buyers get it through `publicLocation()`: **rounded to two decimals (~1 km) and absent without consent** — the village, not the house. The **pickup place** is a spot the farmer chose to publish, so it needs no consent, but its point is rounded the same way. The admin map (`GET /admin/map`) shows exact points regardless of consent — the programme placing a farm on its own field map is why the point was collected — plus unlinked survey points.

`MapView.tsx` is a Leaflet + OpenStreetMap wrapper, copied byte for byte between `frontend/` and `admin/`, using circle markers (bundlers break Leaflet's pin images). The buyer's map (`/shop/map`, `GET /catalog/map`) pins only farmers with something `publiclyVisible`.

### Order state machine and pickup

`shared/src/orderFlow.ts` is the single source of truth:

```
PLACED → ACCEPTED → PACKED → OUT_FOR_DELIVERY → DELIVERED     (+ REJECTED, CANCELLED)
```

Five states, `DELIVERED` is the end. Payment is a separate axis. The backend validates with `canTransition(from, to, fulfilment)`; the frontend draws buttons from `actionsFor(status, fulfilment)`. Neither hard-codes a status string.

**Pickup** (`Order.fulfilment = 'pickup'`) is a branch, not new states: at `PACKED` the one action is "picked up" → `DELIVERED`, never "out for delivery". No address, no delivery fee; the order's address is the farmer's pickup place. A farmer offers delivery, pickup (a place in their profile) or both — never neither (`validateFarmerProfile`). The buyer sees `buyerStages()`: four stages for delivery (confirmed, shipped, out for delivery, delivered), three for pickup (confirmed, ready for pickup, picked up). The farmer's screens keep every state.

**Accept asks how long delivery will take** (`needsEstimate`): free text in the farmer's own words, four quick chips, skippable, stored by `cleanDeliveryEstimate()` on `ACCEPTED` only. A date picker would force a precision a village with one bus a day does not have.

### Money after acceptance, not before

The order reaches the farmer unpaid; they accept if they can fulfil it, and only then does the buyer pay — because rejection is ordinary and a rejected prepaid order has no refund path in this app. Two predicates say whose turn it is:

- `awaitingCustomerPayment()` — UPI + `UPI_PENDING` + `ACCEPTED`. The buyer's screen shows the QR and UTR box from it; `POST /orders/:id/pay` refuses anything else.
- `awaitingPaymentConfirmation()` — UPI and not yet `UPI_CONFIRMED`. `advance` refuses `PACKED` on it and the button is hidden. A typed UTR is a claim (`UPI_SUBMITTED`); only the farmer's `confirm-payment`, after checking their UPI app, is money.

### The two hand-typed numbers

`shared/src/payment.ts`. No gateway, no bank callback, so both numbers fail silently in opposite directions: a wrong **UPI ID** pays a stranger, a wrong **UTR** leaves a payment nothing matches.

- **A UTR is exactly 12 digits** (the RRN, what a bank statement shows). `normalizeUtr()` strips spaces and hyphens and nothing else — stripping all non-digits could turn a long app transaction id into twelve digits that were never an RRN. **One UTR, one order**: re-using it on a second order is refused; re-posting on the same order is a correction.
- **`upiProblem()` is not an allow-list.** `KNOWN_UPI_HANDLES` catches near-miss typos in the handle ("@ybll" → did you mean "@ybl"?); an unknown handle that is not a near miss is accepted, because new banks appear. `isValidUpi()` delegates here so every call site agrees.
- The amount is printed beside the QR; the UPI ID has a copy icon (`.copyrow` never wraps). The submit button stays disabled while the number cannot be right. Both validators return Marathi.
- **No "Pay" button on a `upi://pay` link while payees are personal UPI IDs**: UPI apps decline app-initiated payments to personal IDs as scam-shaped, while the same QR scanned from the gallery pays. `buildUpiLink()` sends no `tr` for the same reason. `PaySteps` (`components/PayFromPhone.tsx`) writes out screenshot → open UPI app → scan from gallery → check name and amount → come back; `useReturnFromApp` focuses the UTR box on return after the ID was copied.

### Calling an order off

`shared/src/orderCancel.ts` is the rule, `backend/src/db/orderCancel.ts` applies it, `POST /orders/:id/cancel` is the one route; which side is asking comes from the session. The **buyer** may cancel only while `PLACED`; the **farmer** from `ACCEPTED` to `OUT_FOR_DELIVERY` (before that they Reject). Both walk `CancelOrderSheet`'s three steps — consequence, reason from a list (`other` needs 5–200 typed characters), final confirm. The event stores the reason **code** so each reader sees their own language. Then the farmer gets a refund screen: `refundOwed()` reads `confirmed` / `claimed` / `none` off `paymentStatus`, because the app moves no money and only the farmer can return it. `endingEvent()` tells every order screen who stopped it and why.

### One farmer per cart

`frontend/src/store/cartRules.ts` (`cartFarmer()`, `canAddFrom()`); `CartContext.add()` returns `false` instead of adding. The first shop added from owns the cart until it is emptied or ordered; a product from another shop is refused with that shop's name and a link to it. **Nothing is cleared on the buyer's behalf.** Quantity is editable on the cart line within minimum and stock. Grouping by farmer stays in checkout and `POST /orders` (an old saved cart can still hold two). "More from this shop" and `/shop/farmer/:farmerId` use the `farmerId` filter on `/catalog/products` so a phone on 4G fetches one shop, not the catalogue.

**A delivery charge of 0 means "ask the farmer", never "free"** (`FarmerGroup.deliveryToAsk`): totals read "without delivery", and a signed-in buyer can get the farmer's number from `GET /catalog/farmers/:id/contact` to ask. "Free" only where the farmer's own `freeDeliveryAbove` is met. `POST /orders` answers 409 while any delivered order in the review window is unrated.

### Where an order may go

`isMaharashtraPincode()` (40–44, minus Goa's 403) is the only hard gate, checked at `POST /orders`. **Inside it the farmer's `pincodes` list is a hint**: an order outside it arrives with `outsideArea: true` and Accept means "yes, I can get there". Checkout and `PincodeBar` warn rather than block. Pickup orders skip the pincode check.

### Slots and subscription

`shared/src/farmer.ts`. ₹50 = one pack = 5 listing slots (`PLAN`), no payment gateway — the farmer pays the programme's UPI and an admin approves by hand. `SLOT_CONSUMING` is `PENDING`, `LIVE`, `PAUSED` and deliberately excludes `DRAFT`, so a farmer can experiment before paying. `slotInfo()` reads zero packs as **full**, not unlimited: verification is the account gate now, so a verified farmer with no packs reaches the slot gate. Submitting refuses in order: 403 not verified, 403 no open term, 402 no free slot — so the message names the first thing the farmer can do about it. **Drafts skip all three**, so the upload wizard stays open to anyone not blocked: only its send button waits, and `sendBlock()` (`screens/farmer/sendGate.ts`) says for what. `backend/tests/slots.test.ts` holds the counting.

**The ₹50 lasts six months.** `shared/src/subscription.ts` is the rule, `backend/src/db/subscription.ts` applies approvals, `backend/tests/subscription.test.ts` holds both.

- **Only one date is stored: `Farmer.subscriptionEndsAt`.** Expiry writes nothing — no product flipped to `PAUSED`, the `isOpen` switch untouched, no slot released. Public routes ask `canSellNow()` (verified **and** term open): `publiclyVisible`, serviceability, `GET /farmers/:id`, `/contact`, `POST /orders`, the price hint's platform median; submitting a listing asks `termOpen()` after the verification check. So renewal is the date moving, and "everything exactly as before" — same packs, same products, same slots — is true by construction. Orders already in progress carry on.
- **Six calendar months from the admin's approval**, counted in IST, clamped at month end (`addMonths`). One date for the whole shop however many packs; a **flat ₹50 `RENEWAL`** renews all of them. A `PACK` bought mid-term adds slots and leaves the date alone. A renewal paid in the reminder week adds six months to the *current end*, so no paid days are lost. Any payment approved for an already-paused shop reopens it from the approval. For an unverified farmer an approval moves no date at all (see *Verification, once*).
- **What may be paid for is `payableKinds()`**, sent to the screen as `payable` and enforced on submit (`paymentKindProblem`): a pack when slots are full (or none are held), a renewal from `RENEW_REMINDER_DAYS` (7) before the end, and *only* a renewal once paused. One `PENDING` payment at a time (409). `SubscriptionPayment.kind` records which; a request with no `kind` means the most urgent open one.
- **Every screen is told the state by the API** (`subscriptionView` and `slots`, on `/farmers/me`, `/products/mine`, `/farmers/me/subscription`, `/admin/farmers[/:id]`) — the server's clock, never the phone's; the frontend never calls `canSellNow`.
- **The reminder is derived**: `subscriptionFeed()` turns the view into one row (see *The updates list*); an approved renewal, or a term started at verification, writes a `SUBSCRIPTION_RENEWED` notice carrying the new date. My Business and My Products show `SubscriptionNotice`; a paused shop's live listings read "paused" on the farmer's list while their stored status stays `LIVE`.
- **The farmer's `status` carries no payment state**; the queue's state is on the payment. Rejecting a payment (`rejectPayment`) marks it, keeps the reason and writes `PAYMENT_REJECTED` — nothing on the account moves. The waiting screen settles on the latest payment's status.
- **Admin:** a subscription pill (with the date) on every verified farmer in the register and on their page, filters for ending-this-week, expired and never paid, the kind and resulting end date on each payment, and `subscriptionsExpiring` / `subscriptionsExpired` / `subscriptionRevenue` / `approvedPaymentCount` on the dashboard. `activeFarmers` counts only shops a buyer can reach today. **Grant / remove slots** (`POST /admin/farmers/:id/grant-slots` / `revoke-slots`): granted slots start a term for a farmer who has none, but never extend one — time is paid — and only once verified; before that a grant is slots, and the term starts at verification like a pack's. Neither grant nor revoke touches `status`, and revoke refuses (409) to drop below the slots in use.
- **Farmers from the free period** — verified before `FREE_PERIOD_ENDED` (`2026-09-28T00:00:00.000Z`, `shared/src/subscription.ts`) — get a term once at boot from `backfillSubscriptionTerms`: packs enough for what is on sale (at least one), six months from their last approved payment or else their verification, and never fewer than seven days from the deploy, so no shop closes the morning after without a reminder week. Unverified and closed farmers, and anyone verified on or after the cutoff, are left alone: the backfill runs on every boot, so without the cutoff each cold start would give every unpaid verified farmer a free term.

**Where the ₹50 goes is `ADMIN_PAYMENT_ACCOUNT` in `config.ts`**, env-readable (`ADMIN_UPI_ID`, `ADMIN_UPI_NAME`, `ADMIN_BANK_NAME`), defaulting to the college's own account. It is the one string in the app that moves real money and nothing downstream can catch it being wrong: the QR is generated FROM it, so a typo makes a perfectly scannable code that pays a stranger and leaves the farmer holding a valid UTR for a payment the programme never saw. `backend/tests/payment-account.test.ts` asserts it is payable and is not the old placeholder. No account number or IFSC — farmers pay by UPI, and a wrong A/C under a QR is worse than none; the payee NAME is stored exactly as printed on the poster so the farmer can check it against what their UPI app shows. The subscription screen pays it the way every payment here is paid — QR, `PaySteps`, copyable ID, no pay link (see *The two hand-typed numbers*).

**The ₹50 needs proof, not twelve digits.** Anybody can type a UTR, and approving one grants five slots. So a subscription payment carries three things an admin holds against each other:

- **A screenshot of the UPI app's success screen — required.** A `PhotoPicker` upload (`kind: 'payment'`) into its own signed Cloudinary folder. `screenshotProblem()` in `backend/src/db/payments.ts` accepts only a URL in *this* account's `…/payment/` folder, so a pasted link or a product photo cannot stand in for it. With Cloudinary off there is no way to attach one, so nothing is required, and `/farmers/me/subscription` says so as `screenshotRequired`.
- **When the farmer paid** — `paidAt`, a `datetime-local` pre-filled with now. `paidAtProblem()` in `shared/src/payment.ts` refuses a time in the future (10 minutes' slack for phone clocks) or older than 7 days.
- **The UTR**, as everywhere (`utrProblem`). Any earlier payment with the same UTR that was not rejected — another farmer's or the farmer's own — sets `duplicateUtr` (`isDuplicateUtr()`), and the console flags it.

The admin queue (`/payments`) shows the screenshot inline and opens it large beside the UTR, the stated time and the amount. **Approve stays disabled until three checks are ticked** — the UTR matches, the date and time match, the money is on the bank statement — and `POST /admin/payments/:id/approve` refuses any request whose `checks` lack one of `PAYMENT_CHECKS`, so the checklist is the rule and not decoration. The CLI takes `approve <id> --verified` and offers no `approve all`. Rejecting needs no checklist: refusing an unproven payment is always safe. `backend/tests/payment-proof.test.ts` holds all of it.

Because approval is by hand, **how long the farmer has been waiting is the number that makes somebody act on it**, and the console owns it: `waited()` in `admin/src/lib/format.ts` computes it from `submittedAt` and `Payments.tsx` re-reads the clock every 30 minutes so a console left open on a desk stops showing the age it had at page load. `/admin/payments` deliberately sends no `waitingHours`: a number computed on the server is frozen at the moment of the response, and two sources for one figure is how an admin stops trusting either.

### What the public may see

`publiclyVisible(product, farmer)` in `catalog.routes.ts` — `LIVE` product, `ACTIVE` (verified) farmer, shop open — is used by the list, the by-id lookup, reviews, the trace page and the map. A hidden listing answers **404, the same as an id that never existed**. A farmer leaves the API unauthenticated only as `PublicFarmer`, built by the **allow-list** `publicFarmer()` in `db/publicFarmer.ts`: name, photo, shop, farmer code, village, delivery terms, pincodes, UPI ID/QR, crops, rounded location (with consent), pickup place, and the derived rating. The phone is not on it; a buyer gets it on their own order, from `/contact`, or on a scanned trace page. `public-farmer.test.ts` asserts the exact key set.

### Trace QR

Every live listing has a QR (`components/ProductQr.tsx`, download as PNG or print one clean page) that opens `/trace/:productId` (`lib/trace.ts` builds the URL from the serving origin, so a preview deploy prints its own). `GET /catalog/products/:id/trace` (`traceView()`) returns the public card **plus the farmer's phone** — the farmer printed the code and the poster promises contact to whoever holds the produce — under the same `publiclyVisible` 404, so an unverified or blocked farmer's QR shows nothing.

### Price hint, demand chart, voice search

- **Price hint** (`PriceHint.tsx`, `GET /insights/price`, farmer only, `backend/src/insights/price.ts`): the median of live listings and last-30-day delivered orders for the same crop and unit, plus the latest Agmarknet mandi modal price when `DATA_GOV_IN_API_KEY` is set (Dharashiv, then Osmanabad, then Maharashtra; cached six hours; a failing feed is silence, never an error). Mandi prices are per quintal and convert only to kg and quintal. **Advice, never a default**: nothing writes into the price field, and each number carries its source. The feed's filter names have not been checked against the live API with a key.
- **Demand chart** (`admin/src/screens/Demand.tsx`, `GET /admin/demand`): ordered versus on the shelf, per crop — a count, not a forecast; each crop pair has its own scale and a table repeats the numbers.
- **Voice search**: `useVoiceInput.ts` wraps the Web Speech API in the app's language (`mr-IN` / `en-IN`). Every `VoiceInput` owns its own mic, including the catalogue search; the keyboard is never removed and the mic does not render where speech is unsupported.

### Surveys and research

Coordinators type paper questionnaires into **Surveys** (`/api/admin/surveys`, `backend/src/db/surveys.ts`). Every answer is optional and a skipped one stays absent, so tables count "not answered" rather than "no". A survey is linked to a registered farmer by phone (automatically at registration, or by hand), and then that person is counted once, from their own record; closed accounts are never linkable.

**Research** (`shared/src/research.ts`, `GET /admin/research`, `admin/src/screens/Research.tsx`) builds Tables 1–9 from respondents = non-closed farmers + unlinked surveys. An FDRI score is banded only when all ten indicators were answered. Each table downloads as CSV via `shared/src/csv.ts` — UTF-8 **with BOM** and CRLF, so Excel opens Devanagari intact.

### Deleting an account

`shared/src/accountClose.ts` is the rule, `backend/src/db/accountClose.ts` applies it, `CloseAccountSheet` (`components/CloseAccount.tsx`) is the screen.

- **The row stays; the person is erased.** `FARMER_PII_FIELDS` is the one list of what goes (phone, name, photo, village, UPI, questionnaire, FDRI, notices…), walked by `account-close.test.ts`; the id, `status: 'CLOSED'`, farmer code and order money stay. The farmer's ₹50 payments lose the payer (`scrubPayment`: name, phone, payer UPI, the screenshot destroyed by `publicIdFromUrl`) and keep the money. Past orders are the buyer's record, `isBulkDelete()` would refuse the row deletes, and other screens look farmers up by id.
- The credential and password requests are removed, so the **phone can register again**. Linked surveys lose phone, point and photo; the answers stay as research.
- **Seven days** (`UNDO_DAYS`) between asking and erasing: the shop closes and sessions end at once, `sweepClosedAccounts()` erases later (at boot and on the 15-minute timer). Signing in during the week shows a restore button (`POST /farmers/me/restore`). **A buyer gets no window** — their orders keep the `ग्राहक` placeholder name, phone and address emptied, pincode kept.
- The sheet asks what it costs, why, then **the last four digits of their own number, typed** — not a word to copy, not an SMS. An order in flight refuses the close (409 with `openOrders`) and the sheet names those orders.

### Reviews

`shared/src/review.ts`, `backend/src/db/reviews.ts`, `RateOrderGate` in `components/Reviews.tsx`. One review per product per delivered order, every product on the order at once, stars required, words optional (≤ 500). No order, no review. While any delivered order inside `REVIEW_WINDOW_DAYS` (30) is unrated, the gate covers the buyer app (everything behind it `inert`) and `POST /orders` answers 409. A product's rating and a **farmer's rating (all their products' reviews together)** are derived on every request, never stored. Public reviews carry a first name only (`publicName`); `toPublicReview` strips ids and moderation fields. **Hide** (with a kept reason) is the only admin action.

### Reports and complaints

- **Reports** (`shared/src/report.ts`, `POST /reports`): buyers report products; buyers **and farmers** report reviews (the person a review is about can speak for themselves). One row per reporter per thing; a reason from the list, words only for `other`. **A report changes nothing on its own** — the listing stays live. It joins the admin **Reported** tab (`GET /admin/products?status=REPORTED`) or the Reviews screen's Reported filter; the way out is take-down or `clear-reports`, which closes rather than deletes (an admin disagreeing is a different fact from nobody complaining). Anonymous to the farmer.
- **Complaints** (`shared/src/complaint.ts`, `POST /complaints` from Help & Training, farmer or buyer): a subject from the list (payment, order, product, account, other), 10–500 characters, recorded with who wrote it; the admin **Complaints** queue resolves them.

### The updates list

`frontend/src/lib/notifications.ts` is **derived, never stored** — from `OrderEvent`s already on the order and from `farmer.notices` written by the admin handler that made a change (verified, blocked, unblocked, slots granted or taken back, payment approved or rejected, listing published or taken down), and from `subscriptionFeed()` — the reminder week, and a `standing` "paused, renew" row that never ages out; `SUBSCRIPTION_RENEWED` carries the new date. One row per **order**, tagged with the order's own status via `STATUS_STYLE`, timed by the latest *other-side* event, showing only the other side's actions. Not push; the app has to be open.

### Scroll position and the screen cache

`ScrollMemory` in `App.tsx` with `lib/scrollMemory.ts`: forward navigation starts at the top, **POP restores**, keyed on the history entry. `makeRestorer()` keeps trying while the page is still too short, until it lands or `RESTORE_WINDOW_MS`; it stops the moment the user scrolls (`wheel`, `touchstart`, `pointerdown`, `keydown` — never `scroll`) and suspends saving while restoring. **Nothing is saved on the way out**: by the time a cleanup runs the next screen is mounted and the browser has clamped scroll to 0, so saving then wrote 0 over the real position.

`useAsync` takes a `cacheKey` (`lib/screenCache.ts`): the last answer paints in the first frame while the refetch goes out, and the restore runs in `useLayoutEffect`. It reports `loading` only when it has nothing to show, and tags data with `screenIdentity()` so product A's page never stands at product B's address. The cache is memory-only, capped at 40, dropped on a failed refetch and **cleared when a session ends** (shared handsets). It saves no server reads — the API answers from memory anyway.

### Drafts

- **Product wizard** (`screens/farmer/productDraft.ts`): `localStorage` key `wb.draft.product.<farmerId>`, farmer id also inside the payload, nothing written until `hasStarted()`; the old shared key `wb.draft.product` is deleted on sight. One shared key once showed the next farmer on a coordinator's phone a stranger's photo.
- **Registration** (`screens/auth/farmerDraft.ts`): `sessionStorage`, keyed `wb.draft.farmer.<phone>`, never holding the password — a half-registered farmer's details must not outlive the tab on a shared phone.

### Photos

Every upload goes through `uploadImage()` (`lib/upload.ts`) and is re-encoded on the phone as JPEG on a white canvas (`lib/compress.ts`: 1200px / ~350KB for products); nothing over 5MB is accepted, and Cloudinary's signed transformation in `uploads.routes.ts` repeats the caps. Uploads go **browser → Cloudinary** with a short-lived signature from `/api/uploads/signature`; bytes never pass the server. `PhotoPicker` takes one photo from the gallery; with Cloudinary off it reports `onUnavailable` so the step is not a wall. Photos render as plain `<img loading="lazy">` on a `cloudinaryThumb` URL and rely on the browser cache — **do not add a blob cache**. A listing with no photo shows its **category** picture (`lib/categoryPhoto.ts`), never another product's; categories with no honest picture show an icon.

### Sorting the admin lists

Farmers, Products, Orders and Payments each have a **Sort by** menu; `admin/src/lib/sort.ts` holds one option table per list. Client-side (lists arrive whole), names through an `Intl.Collator` for Marathi and English, newest first by default, the choice remembered per list in `localStorage` (`SortSelect`).

### Config and graceful degradation

`backend/src/config.ts` reads everything from the environment and every integration degrades: with an empty `.env` you get the JSON file, category pictures instead of uploads, and no mandi price. The boot banner (`describeConfig()`) prints what is live — check it before debugging a "broken" integration.

- `SESSION_SECRET` has a development fallback; **production refuses to boot without it**.
- `ALLOW_BULK_DELETE` is honoured in production too; leave it blank in every `.env`.
- `CORS_ORIGIN` is comma-separated and parsed into a **list** — two front ends call one API, and a comma-joined string matches neither.
- `DATA_GOV_IN_API_KEY` is optional (price hint's mandi line).
- `ADMIN_UPI_ID` / `ADMIN_UPI_NAME` / `ADMIN_BANK_NAME` move where the ₹50 goes (defaults: the college's account); the boot banner prints it as `Fee payee`.

## Conventions

- **Errors** are `{ error, messageMr, fields? }`; every user-facing failure carries Marathi. `ApiError` surfaces all three.
- **No screen calls `fetch`** — `frontend/src/lib/api.ts` and `admin/src/lib/api.ts` are the only seams.
- **A panel opened from a long list is a `<dialog>` with `showModal()`**. Never `close()` it in an effect cleanup (StrictMode's cleanup `close` lands after the second `showModal()`); guard with `if (!dialog.open)`.
- **Marathi first.** Marathi is the default in **both** apps (`I18nProvider` reads `wb.lang` / `wb.admin.lang` and treats anything but `en` as `mr`); English is the toggle, remembered per app. A missing key falls back to **Marathi**, not English. Every string goes through `t('key')`, placeholders included. `frontend/tests/i18n.test.ts` and `admin/tests/i18n.test.ts` assert dictionary parity, each dictionary in its own language (only `app.name`, `lp.collegeMr` and `onb.chooseLangSub` are Devanagari in English), no hard-coded Devanagari `placeholder=`, and that every `t()` key exists.
- **Marathi spelling follows `docs/MARATHI-STYLE.md`** (महाराष्ट्र शासन orthography): joined postpositions, **ऑर्डर is neuter**, Marathi word order, one word per thing, `ॲ` as U+0972, Latin digits. The farmer is **शेतकरी**. Deliberately colloquial and not to be "corrected": the landing CTAs (`मला विकायचं आहे`) and the reader's own first-person-plural buttons (`नंतर करू`). `marathi.test.ts` in both apps enforces the checkable half.
- **English is not a translation of Marathi.** The dictionaries are independent writing; a fix to one never edits the line beside it.
- **Gender-neutral, and no old branding.** All user-facing text, comments, tests and docs are gender-neutral: farmers and buyers are "they" (Marathi: plural forms, no gendered nouns such as उद्योजिका or विक्रेती). Nothing may reintroduce the name, wording or copy of the project this was forked from; the logo files are the only thing kept. The i18n and Marathi tests in `frontend/tests` and `admin/tests` fail on gendered pronouns and on the old brand words.
- **Tests** are `node:test` + `node:assert/strict` via tsx, written as prose explaining *why* a rule exists.
- Comments explain reasoning and trade-offs, not mechanics.

## Design rules (constraints, not preferences)

Encoded in `frontend/src/styles/theme.css`, whose `:root` **THEME SWAP POINT** block holds every colour, size and radius (leaf green and maroon):

- Status is colour **+ icon + word**, never colour alone.
- Body text 16px (`--t-base`), 54px buttons (`--btn-h`), 44px touch targets (`--tap`).
- Four bottom tabs, one level deep. **No hamburger menu.**
- One question per screen in wizards, with progress dots. **Editing is not a wizard.**
- Confirmations state the consequence, never a bare "Are you sure?"
- An empty state never repeats the action already in the bar below it.
- Latin digits (₹500) — what is printed on money.
- **No web fonts**; Android ships Noto Sans Devanagari.
- Icons come from `react-icons` through `components/icons.tsx` in each app, the only files naming a vendor icon. **No emoji is shown anywhere**; `Product.emoji` and `Category.icon` are stored but not rendered.
- First-time screens explain themselves with a per-section walkthrough (`lib/tours.ts`), replayable from Help & Training.
- The brand mark is `frontend/src/assets/logo.png` and `admin/src/assets/logo.png` (the same image, also the favicons in `public/`). It carries its own ring — never add a border or background.

## Deployment shape

From `docs/DEPLOY.md`: one Cloud Run service **`f2c-api`** in `asia-south1`, built from the root `Dockerfile` (build context must be the repo root), and two Vercel projects from this repo — **`f2c-frontend`** (Root Directory `frontend`) and **`f2c-admin`** (Root Directory `admin`) — both tracking **`main`**. All accounts (Google Cloud, Firebase, Cloudinary folder `f2c`) are new and shared with nothing else.

- **Maximum instances 1** (see *Persistence*) and **CPU always allocated** (`--no-cpu-throttling`), because `save()` writes 400ms after the response and Cloud Run otherwise takes the CPU away. Neither is the default.
- `SESSION_SECRET`, `FIREBASE_SERVICE_ACCOUNT` and `CLOUDINARY_URL` come from **Secret Manager**; a new version takes effect on the next revision. `CORS_ORIGIN` is both Vercel URLs.
- `VITE_API_URL` is read at **build** time; changing it means redeploying. `VITE_*` values are public — never put a secret in one.
- **Both apps need their `vercel.json`** catch-all rewrite to `index.html`, or every deep link 404s on reload. **Neither Vite config sets `base`**: the default absolute `/assets/…` is the only path correct at every route depth.
- This is a website only. There is no mobile app, APK or WebView wrapper; do not add files only such a build would read. A dropped connection is `components/OfflineScreen.tsx`.

## Not built yet

Farmer replies to reviews · chat · disputes · returns and refunds · coupons · camera capture · QR decoding in the app · AI price recommendation · crop disease detection · demand forecasting · digital weighing receipts · FPO integration · cold chain.
