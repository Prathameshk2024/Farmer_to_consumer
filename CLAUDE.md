# CLAUDE.md

# Workflow

Never do the work yourself.
Always dispatch a sub-agent.
Don't always use Fable. Use Opus 5.5 for easier tasks.

# Model routing

- Fable 5.1: architecture, hard bugs, code review, anything
  where being wrong is expensive
- Opus 5.5: edits, tests, docs, refactors, the bulk of the work
- Haiku 4.5: lookups, file searches, summaries, one-line answers
- Pass `model` on every Agent call. No default routing.

# Delegation

- One sub-agent per task. Plan first, then dispatch.
- Run independent sub-agents in parallel, not one after another.
- Read the report, never the files. If a sub-agent did the work,
  trust its summary instead of re-reading everything it touched.
- Sub-agents return findings, not raw dumps.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

शांताई महिला बाजार / Shantai Mahila Bazar — a digital marketplace for rural women entrepreneurs in Maharashtra. Three user-facing surfaces, one API:

- **frontend/** — the farmer + customer app (React/Vite)
- **admin/** — the admin console (React/Vite, deployed separately)
- **backend/** — Express API serving all three, including `/api/admin/*`
- **shared/** — domain types and rules imported by all of the above

Product spec: `docs/FEATURE-SPEC.md`. Deployment: `docs/DEPLOY.md`.
Marathi style: `docs/MARATHI-STYLE.md` — read it before writing any Marathi string.

`README.md` is deliberately short — layout, run, demo logins, links. Rules and architecture live here and in `docs/`, not there; the long README it replaced repeated them and had drifted from the code in more than a dozen places.

## Commands

```bash
npm install            # installs all four workspaces
npm run dev            # API :4000 + farmer app :5173
npm run dev:all        # the above + admin console :5174
npm run dev:api        # API only
npm run dev:web        # farmer app only
npm run dev:admin      # admin console only

npm test               # backend (350) + frontend (136) + admin (37) tests
npm run typecheck      # all three workspaces
npm run build          # backend tsc + both Vite builds

npm run admin          # interactive admin CLI (backend/scripts/admin.ts)
npm run admin:users -- list          # administrator accounts (create / passwd / disable)
npm run admin:users -- hash          # a password hash for ADMIN_BOOTSTRAP_PASSWORD_HASH
npm run backfill:customers -- --help
npm run purge:demo -- --help
npm run backup -- --dry-run      # live Firestore + photos to the backup accounts (BACKUP_* in backend/.env.example)
```

Run a single test file — `node:test` via tsx, no framework:

```bash
cd backend && node --import tsx --test tests/session.test.ts
cd admin   && node --import tsx --test tests/i18n.test.ts
```

Vite proxies `/api` to `localhost:4000`, so nothing needs configuring in development. A fresh clone starts with an **empty** database; demo data needs `SEED_DEMO_DATA=true` in `backend/.env`. Reseed by stopping the API and deleting `backend/data/db.json`, or with `POST /api/dev/reset`, which 404s unless `ALLOW_DEV_RESET` is set outside production.

Demo logins: register a farmer at `/register/farmer` or a buyer at `/register/customer` (phone + a password of 6 or more characters). Seeded farmers such as `9822011223` (Sunita, F2C-ANADUR-001) have no password - seeding never invents credentials - so give one a temporary password with *Reset password* on their page in the admin console.

There is no default admin password any more. Make an account with `npm run admin:users -- create you@example.com "Your Name"`, or set `ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD_HASH` on a host with no shell.

## Import convention — read this before writing any import

Cross-workspace imports use the `@shared/*` alias **with a `.js` extension on a `.ts` file**:

```ts
import type { Order } from '@shared/types.js'   // resolves to shared/src/types.ts
```

The backend is `module: NodeNext`, which requires the `.js` extension at runtime. The two Vite configs rewrite `@shared/<x>.js` → `shared/src/<x>.ts` with a regex alias. Dropping the `.js`, or writing `.ts`, breaks one side or the other. Local relative imports inside `frontend/` and `admin/` follow the same `.js` convention.

`shared/` is not built — it is consumed as TypeScript source. A change there is a compile error on whichever side has not caught up, which is the point.

`frontend/` and `admin/` still list `"@f2c/shared": "*"` in `dependencies`, although no import names that package. The line is for Vercel, not for the code: it skips deploying a monorepo project whose commit touched nothing it depends on, and it learns the dependencies from `package.json` alone. Without it, a commit that changes only `orderFlow.ts` or `payment.ts` would redeploy neither app, and the live site would keep enforcing the old rule. Do not remove it as unused.

## Architecture

### Persistence: one synchronous interface, two drivers

`backend/src/db/store.ts` exposes a **synchronous** `getDb()` backed by either Firestore or a JSON file, chosen by whether `FIREBASE_*` credentials are present. The entire dataset is loaded into memory at boot; `save()` schedules a diffed, batched write coalesced over 400ms.

Consequences that matter when changing anything in `backend/src/`:

- **`initStore()` must finish before the first request.** `index.ts` awaits it.
- **Writes are diffed, not blanket.** Only changed documents are sent. Do not introduce a code path that rewrites whole collections.
- **No single persist may delete more than half a collection.** `isBulkDelete()` in `firestore.ts` refuses it, keeps the documents, and logs loudly; `ALLOW_BULK_DELETE=true` on the one command that means it is the override. This exists because on 10 September 2026 a persist whose in-memory `farmers` and `products` were empty deleted six real farmers and thirteen products, recovered only from Firestore's one-hour version history. A refusal means memory and the server disagree — find out why before trusting that process.
- **This is correct for exactly ONE server process.** Two instances each hold their own snapshot and silently overwrite each other. Cloud Run is pinned to `--max-instances=1`, and a deploy is the one moment that ceiling does not hold: the new revision starts before the old one has drained, so for a few seconds there are two. Deploy when nobody is placing orders. Outgrowing this means converting route handlers to async per-document reads — real work, not a config change.
- A Firestore connection failure at boot **falls back to the JSON file** and says so loudly. Reads and writes track the same `firestoreLive` flag so they can never disagree.
- An empty database stays empty unless `SEED_DEMO_DATA` is set. Never make seeding automatic — it would put invented farmers in front of real customers.

Firebase is **server-side only**, via `firebase-admin` with a service account. There is no Firebase Web SDK anywhere, and adding one would be an architectural change, not a convenience: `firestore.rules` denies all client-SDK access because every business rule (legal order transitions, who may edit what) lives in the API.

### Sessions

`backend/src/auth/` is the whole stack; `middleware/auth.ts` composes it. The token is `base64url({sid, role, iat}).base64url(HMAC(payload))` signed with `SESSION_SECRET`.

**The token carries no identity.** `sid` points at a row in the `sessions` collection, and `req.auth.farmerId` is read from that row on every request — so a token cannot assert an identity the server did not issue, and deleting the row revokes it instantly. That is what makes logout and "the phone was stolen" real.

- `auth/crypto.ts` is the only file that touches `node:crypto`. Every signature is **domain-separated by purpose**, so an HMAC made for one job (a hashed IP) cannot be presented as a session token.
- **Phone + password, no SMS.** The rule is `shared/src/password.ts`: `MIN_PASSWORD = 6`, digits alone allowed (a farmer remembers a PIN, not a composition rule), no leading or trailing space; `passwordProblemMr()` is the one check, used by the screens and the routes. Hashes are scrypt (`hashPassword` in `auth/crypto.ts`). `POST /auth/login {phone, password, role}` answers one 401 for an unknown phone and a wrong password, and an unknown phone still pays for a hash (`burnPasswordTime`), so neither the message nor the timing says which numbers have accounts.
- **Credentials are their own collection** (`credentials`, `auth/credentials.ts`), one row per phone *per role* - a farmer password does not open a buyer account on the same number. Never on the `Farmer` or `Customer` row, because those rows are sent whole to their owners' phones and a hash on them would travel too. Registration writes one: `POST /farmers/register` takes `phone` + `password` (409 if the phone is a farmer already), `POST /customers/register {phone, name, password}` is one screen (`registerCustomer()` in `db/customers.ts`; 409 if the phone already has a buyer credential, and 409 `CLAIM_VIA_ADMIN` if a buyer row for that phone already has addresses or orders - typing a number proves nothing, so such a buyer asks for a password and the admin reset is the ownership check; an empty row may be adopted). A farmer phone is taken by a farmer row *or* a farmer credential (`farmerPhoneTaken`). Uploads need a session; the wizard no longer uploads anything, and the payment QR is added on `/farmer/payment` afterwards.
- **Rate limits** live in `auth/rateLimit.ts`, keyed by *both* subject and IP. This needs `app.set('trust proxy', 1)`; without it Cloud Run's front end makes every request share one address. Login: **5 per phone per 15 minutes, 50 per IP per hour**; a right password clears the phone's count. `retryInMr()` in `auth.routes.ts` says the wait back in days, hours or minutes, and inflects for one, because "1 दिवसांनी" tells a woman this was not written for her on the one screen where she is already being told no.
- **Changing a password** (`POST /auth/password {current, next}`, `changeOwnPassword()` in `auth/credentials.ts`) spends the same `login:phone:` budget as login, so a live session is not a way to guess the owner's PIN, and signs out every other session of that person (`revokeAllForUser(..., exceptId)`), because a password is changed when someone else may know the old one.
- **Admin reset** (`POST /admin/users/reset-password {role, userId, requestId?}`, the `ResetPassword` component behind `Confirm` on the farmer page, the order's buyer panel and the queue) sets a six-digit temporary password, returns it once, signs the person out everywhere and marks the credential `mustChangePassword`. `attachAuth` copies that flag onto `req.auth`, and `requireRole` answers **403 `MUST_CHANGE_PASSWORD`** on every farmer/customer route except `/auth/password` and `/auth/logout`. The app's `api.ts` publishes `onMustChangePassword`, `AuthContext` marks the session, and `Require` sends it to `/password`.
- **Forgot password is a request to a person.** The public `/forgot-password/:role` page posts `POST /auth/password-requests {role, phone, name, village?}` (village required for a farmer, to tell two Rajesh Patils apart). It answers **200 `{ok:true}` for every valid body, account or not** - any difference would let a stranger test which numbers are registered; the matched account is noted for the admin only. Limits are counted before any lookup: **3 per phone per 24h, 20 per IP per hour**. Asking again while a request is OPEN refreshes its `at` instead of adding a row. The admin queue (`/password-requests` in the console, count on the dashboard and in the nav) lists OPEN rows longest wait first; the rule on that screen is to call the requesting number, confirm name and village, and read the temporary password out only on that call. A reset with `requestId` closes the row as DONE only when that request's matched account and role are the ones being reset; "Close" dismisses it with an optional reason. Closing an account deletes its credential and its requests (`forgetAuth` in `db/accountClose.ts`).
- **Admins** are database records with scrypt hashes (`auth/admins.ts`), managed by `npm run admin:users`. There is no `ADMIN_PASSWORD`.
- **Idle windows, not absolute**: admin 8h, farmer/customer 15 days (inactive for more than 15 days ends the session). Different because the risk differs, and because signing in again means typing a password a farmer rarely uses. There is also an **absolute** ceiling (admin 7d, others 90d) so a copied token cannot be kept alive forever by being used.
- Past halfway through the window the server re-stamps the token onto the **`X-Session-Token`** response header; `frontend/src/lib/api.ts` and `admin/src/lib/api.ts` swap it in. This header must stay in the CORS `exposedHeaders` list or every session expires on a timer regardless of activity.
- **The token is held in memory; `localStorage` only carries it across a reload.** Both api clients keep a `memoryToken` and fall back to storage only when it is empty. Reading storage on every request made the whole app depend on a write that fails silently — blocked site data, private mode, a full quota — and the failure mode was the worst on offer: signed in on screen, because React holds the session, and no credentials on the wire.
- `attachAuth` never rejects — `requireRole(...)` does, so public routes stay public.
- On the farmer/customer app the refreshed token must reach **`wb.session`**, not just `wb.token`: `api.ts` publishes `onTokenRefresh`/`onSessionExpired` and `AuthContext` is the only subscriber. The admin console publishes `onSessionExpired` the same way, and its `AuthContext` is likewise the only subscriber — clearing storage alone left React holding a signed-in session, so the shell stayed up and every panel on it re-requested with no token and got another 401. Writing it to `wb.token` alone means the next reload restores the original from `wb.session` and the slide is lost — the window then counts from login rather than from last use.
- **Only two things end a session**: Log out, and a 401. Back, refresh and re-entering `/farmer` must never clear one, so the login screens redirect an already-signed-in matching role straight to its home instead of asking for the password again.

### Deleting an account

`shared/src/accountClose.ts` is the rule, `backend/src/db/accountClose.ts` applies it, `backend/tests/account-close.test.ts` holds it, and `CloseAccountSheet` in `frontend/src/components/CloseAccount.tsx` is the screen.

- **The row stays and the person is erased.** `scrubFarmer()` empties every field that is her — phone, name, photo, village, UPI, the readiness answers, an admin's notices about her — and leaves the id, `status: 'CLOSED'`, the `farmerCode` printed on packaging, and the money. Three reasons it is not a row delete: a past order is the *buyer's* record as much as the farmer's (kept, and disclosed); `isBulkDelete()` refuses a persist that removes more than half a collection, and a farmer with five listings in a small catalogue is more than half of it; and orders and the admin console look a farmer up by id, so a dangling id is a blank shop name on somebody else's screen. `FARMER_PII_FIELDS` is the one list, walked by the test — a field added to `Farmer` and forgotten there is a phone number surviving a deletion.
- **Her phone goes back into circulation**, because registration's uniqueness check compares stored phones and hers is now blank. Closing is not a ban.
- **CLOSED is not in `canSellNow()`**, so the shop leaves the catalogue, `GET /farmers/:id` 404s and `POST /orders` refuses — from the status alone, with no product touched. That is also what makes the undo a one-line restore.
- **Seven days between asking and erasing** (`UNDO_DAYS`). The shop closes and every session is revoked the moment she asks; `sweepClosedAccounts()` does the erasing later, at boot and on the 15-minute timer, a sweep rather than a timer because the week almost always contains a deploy. Restoring goes back to `ACTIVE` only if he was verified (`verifiedAt`), otherwise to `PENDING_VERIFICATION` — closing and restoring must not skip the check. Signing in during it puts a "your account is closing" notice at the top of My Business with one button (`POST /farmers/me/restore`). **A buyer gets no window**: what she loses is an address book, and her account is her phone number, so signing in again gives her a new empty one rather than this one back.
- **Two screens and four digits stop a stray tap.** The entry point is deliberately nowhere near Log out — its own card at the very bottom of the profile, a quiet line rather than a red button — and the sheet walks the `CancelOrderSheet` shape: what it costs (her own listing count), why she is leaving, then **the last four digits of her own number, typed**. Not a word to copy, which is a literacy test, and not her password again, which is one more thing to remember and proves only possession of a phone she is already signed in on. The server re-checks all of it.
- **An order in flight refuses the close** (409 with `openOrders`), on both sides. The sheet names the orders instead of printing an error: a buyer waiting on a delivery cannot be left holding an order whose farmer has vanished, and she already has the buttons to finish or cancel one.
- **A closing buyer leaves the orders she placed**: `customerName` becomes the `ग्राहक` placeholder, `customerPhone` and `address` are emptied, her reviews keep their stars and lose her name. The pincode stays — it is a delivery area, not a doorstep.
- Her bank QR image goes too, by its stored public id.

### Order state machine

`shared/src/orderFlow.ts` is the single source of truth:

```
PLACED → ACCEPTED → PACKED → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
```

Locked at six states. Payment is still a separate axis rather than a seventh state, but it is no longer independent of the walk: **a UPI order stops at `PACKED` until the farmer says the money arrived.** The backend validates transitions with `canTransition()`; the frontend draws its buttons from `FARMER_ACTIONS`. Neither hard-codes a status string, and new code should not either.

**The buyer sees four stages, not five states** — `BUYER_STAGES` and `buyerStageIndex()` in `orderFlow.ts`, drawn by `OrderStatusBox` / `BuyerTracker` in `frontend/src/components/OrderTracker.tsx`: Order confirmed (`ACCEPTED`), Shipped (`PACKED`), Out for delivery (`OUT_FOR_DELIVERY`), Delivered — a bold title and the day, green dot and green line for every stage reached, red for an order that ended (showing only the stages it passed). The order screen opens with the product lines, the order number (copyable) and a one-line status box that expands into the tracker. The farmer's screens keep all five states (`Timeline` in `screens/farmer/Orders.tsx`). My Orders has three tabs — active, completed (delivered), cancelled.

### Money after acceptance, not before

The buyer used to pay at checkout. Now the order reaches the farmer unpaid (`UPI_PENDING`), she accepts if she can deliver, and only then does the buyer pay — because her delivery-area list is a hint rather than a gate, rejection is an ordinary outcome, and a rejected prepaid order leaves the money in her account with no refund path in this app.

Two predicates in `orderFlow.ts` say whose turn it is, and both sides read them rather than comparing statuses:

- `awaitingCustomerPayment()` — UPI + `UPI_PENDING` + `ACCEPTED`. The buyer's order screen draws the QR and the UTR box from this; `POST /orders/:id/pay` refuses anything else.
- `awaitingPaymentConfirmation()` — UPI and not yet `UPI_CONFIRMED`. `POST /orders/:id/advance` refuses `PACKED` on it, and `Orders.tsx` hides the button so she does not discover the rule by being told no.

A typed UTR is a claim, not money: `UPI_SUBMITTED` only means the buyer says so. Only her own `confirm-payment`, made after looking at her UPI app, reaches `UPI_CONFIRMED`. Checkout no longer accepts a `paymentUtr` at all.

### Calling an order off

`shared/src/orderCancel.ts` is the rule; `backend/src/db/orderCancel.ts` applies it and `POST /orders/:id/cancel` is the one route, for both sides — which side is asking comes from the session, never the body. Both land on the existing `CANCELLED` state; the event's `by` says who.

- **The buyer, only while `PLACED`.** Nothing has been paid (UPI is paid after acceptance) and nothing is cooking. After acceptance the button is gone and the screen says to call the farmer — "the customer asked to cancel" is on her list for exactly that.
- **The farmer, from `ACCEPTED` to `OUT_FOR_DELIVERY`.** Before acceptance she has Reject; `DELIVERED` is not undone by a button. Her Cancel button sits below the content, never in the action bar her thumb lives on.
- **Both sides walk the same three steps** in `CancelOrderSheet`, worded for the reader: "cancel it for certain?" (what it costs the other person), the reason, then "cancel this order?" (it cannot be undone) — only that third button sends it.
- **Then the farmer gets a fourth screen: the refund.** The app moves no money, so whatever the buyer paid is in her account and only she can return it. `refundOwed()` reads it off `paymentStatus` — `confirmed`, `claimed` (a UTR, which she is told to check) or `none` (still told to return any cash or advance). It closes only on "I understand", and `RefundNotice` keeps saying it on the cancelled order's screen while money was reported; the buyer's screen says the farmer must send it back.
- **A reason is always required, picked from a list.** "Other" is the escape hatch and the only one that needs typed words (5–200 characters). The event stores the reason **code** in `reason`, not a sentence, so each reader sees it in their own language; `note` carries words only for "other". Old rejects kept their translated sentence in `note` and are shown as written.
- `endingEvent()` finds the event that ended an order; both apps' order screens and the admin order panel draw who stopped it and why from it. `backend/tests/order-cancel.test.ts` holds all of this.

### The two numbers nobody can check for her

`shared/src/payment.ts`. There is no gateway and no bank callback in this app,
so both hand-typed numbers on the payment screens fail in opposite directions:
a wrong **UPI ID** sends the money to a stranger, a wrong **UTR** leaves a real
payment with nothing to match it against. The rule on both, on both sides of
both flows, was `length < 6`.

- **A UTR is exactly 12 digits** — the RRN, which is what a bank statement
  shows and therefore the only reference a farmer checking by eye can find.
  `normalizeUtr()` strips spaces and hyphens **and nothing else**: stripping
  every non-digit would turn PhonePe's own long transaction id into twelve
  digits that were never an RRN, and truncating it would invent one that looks
  perfect and matches no line anywhere. Wrong input has to stay wrong to be
  reportable.
- **The same UTR may not be claimed on a second order.** One transaction has
  one RRN. An order has no admin in the loop, so `POST /orders/:id/pay` refuses it outright — re-posting
  it on the *same* order is a woman correcting a digit and is left alone.
- **`upiProblem()` is not an allow-list, on purpose.** `KNOWN_UPI_HANDLES`
  exists to catch a typo in the half of the address she cannot proofread: she
  can read "sunita" back, but "ybll" looks exactly as right as "ybl". A handle
  within one or two edits of a real one is refused *and named* ("तुम्हाला
  "@ybl" म्हणायचे आहे का?"); an unknown handle that is not a near miss is
  **accepted**, because new banks appear and this file does not, and locking a
  farmer out of her own real UPI ID costs her every order she takes.
- `isValidUpi()` in `farmer.ts` delegates here, so all seven call sites —
  registration, profile edit, the QR screen, both server routes — tightened at
  once and cannot drift apart. A test asserts they agree.
- **The amount is on the screen, not only inside the QR.** The generated link
  carries it and she cannot read a QR; paying the wrong figure into a UPI app
  is the one mistake neither side can undo. `CopyValue` beside it is an icon
  at the 44px floor and no word — labelled, the button was wider than the UPI
  ID it belonged to, and the ID is the thing she is meant to read. `.copyrow`
  never wraps: a long ID breaks across lines beside the button, because a
  button pushed onto its own line under the ID read as a separate control.
- The submit button is **disabled while the number cannot be right**. A live
  button under a malformed UTR reads as "this is fine, press me", and it is the
  last thing standing between her and an unmatchable payment.

Both validators return **Marathi**, like `farmerProfileProblems` — it is what
each side already puts in `fields`, and a second English table is one more
thing to leave behind.

### One farmer per cart

The cart holds **one farmer's goods at a time**. The first shop a buyer adds
from owns it until she empties it or orders from it; a product from another
shop is refused on the spot, with the name of the shop that holds the cart and
a button to go and look at it.

`frontend/src/store/cartRules.ts` is the rule — `cartFarmer()`, `canAddFrom()`
— and `CartContext.add()` is the only caller, returning `false` instead of
adding. `ProductDetail` in `screens/customer/Browse.tsx` is the one screen
that adds to a cart, so that is where the refusal is drawn.

**Quantity is editable on the cart line**, in both directions. It was
down-only for a while — quantity belongs on the product screen, where the
stock is — which left a buyer who wanted a third jar tapping back into the
catalogue to find the product again. The ceiling came to the cart instead:
`Cart` already loads the catalogue for the farmer card, so the `+` stops at
`stock` (or 20 for made-to-order), and a product that has since left the
catalogue keeps what is in the basket and goes no higher. Zero still removes
the line.

**Nothing is ever cleared on her behalf.** Emptying a cart to make room for a
tap is how a woman loses the only record of what she had chosen; the refusal
points at the cart and lets her decide. `CartItem.farmerName` is copied in on
the way so the message can name the shop without waiting for the catalogue.

**A delivery charge of 0 means "ask the farmer", never "free".** No screen asks a farmer for a charge, so 0 is almost always one nobody set, and the cart printed a "free" she had never promised. `FarmerGroup.deliveryToAsk` (in `CartContext`) marks it: the cart line reads विक्रेतीला विचारा with a line saying the farmer will tell them the charge and that her phone is on the order the moment it is placed (true — `GET /orders/:id` returns it from `PLACED`); every total beside it reads *Total (without delivery)*; the checkout repeats the line before she commits; the farmer card on the product and shop pages says the same instead of ₹0. "Free" stays only where a farmer's own `freeDeliveryAbove` is met — that one is her promise.

Grouping by farmer stays. Checkout, `POST /orders` and every delivery rule are
built on it, one group is the honest shape of one farmer, and a cart saved in
`localStorage` before this rule can still hold two - which is exactly why the
`groups.length > 1` branches in `CartCheckout.tsx` are still there.

Because the cart is locked, what else that farmer sells is the most useful
thing on a product screen: **"More from this shop"** shows her three newest
other listings, and `/shop/farmer/:farmerId` (`FarmerShop`) is the whole
window - farmer card, delivery terms, every LIVE product. `/catalog/products`
takes a `farmerId` filter so three products cost three products rather than
the whole catalogue on rural 4G.

### Where an order may go

`isMaharashtraPincode()` in `shared/src/farmer.ts` is the only hard geographic gate: 40–44, minus 403 which is Goa. Outside it the order is refused at `POST /orders` before the farmer sees it.

**Inside it, her `pincodes` list is a hint, not a gate.** That list is usually one pincode typed at registration, and refusing 413002 because she wrote 413004 threw away orders she would have taken. The order reaches her with `outsideArea: true`, her order screen says so, and Accept means "yes, I can get there". The checkout and `PincodeBar` warn rather than block, for the same reason.

### Verification, once

A farmer is checked once, by a person, and after that his produce goes straight on sale. Produce changes daily; a queue per listing would sell yesterday's tomatoes. The check that remains is on the farmer.

- **Registering makes him `PENDING_VERIFICATION`.** `POST /admin/farmers/:id/verify` (the *Verify farmer* button on his page in the console, behind `Confirm`) makes him `ACTIVE` and stamps `verifiedAt` and `verifiedBy`, and writes a `VERIFIED` notice he reads in his updates. It answers 409 for anyone not pending.
- **`canSellNow(s)` in `shared/src/farmer.ts` is `status === 'ACTIVE'`**, and every public path asks it: `publiclyVisible`, serviceability, `GET /farmers/:id`, `POST /orders`, and putting a listing on sale. An unverified farmer's `LIVE` listing is not public.
- **`initialListingStatus(asDraft)`** is `DRAFT` or `LIVE`. `POST /products` and `DRAFT → LIVE` refuse with 403 (`तुमची तपासणी झाल्यावर माल विक्रीसाठी जाईल`) while `!canSellNow`; drafts are his to write before the check.
- **Unblocking and restoring a closed account go back to what the verification says** — `ACTIVE` only when `verifiedAt` is set — so neither is a way round the check.
- **Free.** No packs, slots, edit limits or payment proof. He removes any of his own listings himself (`farmerMayDelete` is always true), and edits every field of a live one.
- A listing that turns out wrong is reported and taken down (below). `backend/tests/verification.test.ts` holds the rule.
- **Rows from the old statuses are normalised at boot** by `normalizeLegacyRows()` in `db/moderation.ts`: a `PENDING` product becomes `LIVE`, a `REJECTED` or `ARCHIVED` one is removed with its photo, and a `REGISTERED`, `PAYMENT_SUBMITTED` or `PAYMENT_REJECTED` farmer becomes `PENDING_VERIFICATION`.

### What the public may see

`publiclyVisible(product, farmer)` in `catalog.routes.ts` is the single rule, used by **both** the catalogue list and the by-id lookup: `LIVE` product, `ACTIVE` farmer, shop open. The two used to decide it separately, and a listing hidden from the list but readable by id is not hidden — it is findable by anyone who tries the id. Both halves matter: a LIVE product under a BLOCKED farmer is still off the shelf, and a shop closed for the afternoon takes its whole window with it.

A hidden listing answers **404, not 403**, and the same 404 as an id that never existed — distinguishing them confirms that a draft she has not finished is there. `backend/tests/catalog-visibility.test.ts` holds the rule.

**A farmer leaves the API unauthenticated only as `PublicFarmer`**, built by `publicFarmer()` in `backend/src/db/publicFarmer.ts` and used by the catalogue list, `GET /catalog/products/:id` and `GET /farmers/:id`. It is an **allow-list**: name, photo, shop, SMB ID, village, delivery terms, pincodes, UPI ID/QR, and the rating derived from reviews. It replaced a deny-list (`publicView`) that stripped seven named fields, and the product route, which sent her whole record — phone, admin notices, block reason, readiness answers — to anyone with a product id. Her phone reaches a buyer only on their own order. `backend/tests/public-farmer.test.ts` asserts the exact key set, so a new field on the card is a decision, not an accident.

### Editing a listing

The screen is `frontend/src/screens/farmer/EditProduct.tsx`, and it is
deliberately **not** the wizard: one question per screen is right when the job
is teaching a farmer what a listing needs, and wrong when the farmer came to
fix one number. `isFood` is immutable — it picks the category set and
which half of the fields apply (ingredients and veg/non-veg, or material), so
changing it would leave a listing carrying claims that no longer fit it.

### Scroll position

`ScrollMemory` in `App.tsx` with `lib/scrollMemory.ts`: forward navigation
starts at the top, **POP restores where she was**, keyed on the history entry
rather than the path because the same screen reached twice is two different
places she was reading. It was one `scrollTo(0, 0)` on every route change,
which is right going forward and exactly wrong coming back - she scrolled deep
into the catalogue, opened a product, pressed back, and the list had forgotten
her.

**The restore waits for the content rather than racing it.** Every screen
fetches its own data, so at the moment she returns the list is one spinner
tall and the browser clamps any scroll past that height — which is why "back
goes to the first product" was the complaint. `makeRestorer()` in
`scrollMemory.ts` keeps asking while the page is still too short (`waiting`),
through the fetch and through the photographs that change the height again as
they load, and stops as soon as it lands, as soon as the page is tall enough
but the scroll went elsewhere, or at `RESTORE_WINDOW_MS`. A fixed number of
tries was the old rule and it expired before a Cloud Run list on 4G arrived.

Two things it must not do, both enforced in `ScrollMemory`: it **stops the
moment she scrolls herself** (`wheel`, `touchstart`, `pointerdown`, `keydown`
— never `scroll`, which is what the restore itself causes), and it **suspends
saving while restoring**, or the clamped `0` of a page that is still a spinner
is written over the place she actually left off.

**Back paints her place in the FIRST frame, not the second.** Two things make
that true, and both are needed. `useAsync` takes an optional **`cacheKey`**
(`lib/screenCache.ts`): the last answer that key received is rendered
immediately, at full height, while the fetch goes out to replace it — so
coming back no longer means spinner, then list, then a jump. And the restore
runs in a **`useLayoutEffect`**, before the browser paints; as an ordinary
effect it landed one frame late, which is exactly the blink of the top of the
page people reported. Cache keys are on the screens she returns to (catalogue,
categories, a category, a shop, a product, both order lists, her products).
The cache is memory-only, capped at 40 entries, dropped for a key whose
refetch fails, and **cleared when a session ends** — on a field coordinator's
phone a kept "my products" is the previous woman's shop.

**Nothing is saved on the way out, and that is load-bearing.** Both the scroll
listener's cleanup and the restore's teardown used to end with
`rememberScroll(key, window.scrollY)` — "leaving is the one moment the
position is certainly final". It is the one moment it is certainly *wrong*:
by the time an effect cleanup runs, React has already swapped the tall
catalogue for a short product page, the document is one screen high, and the
browser has clamped the scroll to 0. So leaving wrote `0` over `1074`, and
Back then restored the top faithfully — which is why "back always goes to the
first product" survived a rewrite of the retry logic that was never the
problem. Only real scroll events write a position now. Traced in a real
browser over CDP on 20 September 2026; the console said
`[mem] set default 1074` immediately followed by `[mem] set default 0`.

That same clamp is why **`useAsync` reports `loading` only when it has nothing
to show**. Screens render a spinner *instead of* their content, so flipping
`loading` on a refetch replaced a tall list with a short spinner, the scroll
had nowhere to go, and from the outside the page "jumped to the top when I did
something at the bottom". A refetch now keeps the old data on screen until the
new data lands.

**But only for the same screen.** Product A and product B are one component at
two addresses — a card under "More from this shop" changes the id and React
keeps the screen — so "keep what is on screen" left A's page, and A's Add
button, standing at B's address until B arrived. `useAsync` now tags its data
with `screenIdentity(deps, cacheKey)` and asks `shownFor()` on every render: a
different id gets its own cached answer or a spinner, decided while drawing
rather than in an effect, which would paint one frame of A first.
`frontend/tests/screen-cache.test.ts` holds it.

The screen cache saves **no server or database reads** and is not meant to:
every screen still fetches on every visit, and the API answers from the
in-memory store (see *Persistence*), so Firestore is read once per boot however
often a screen is opened.

### The upload wizard's draft

A half-filled product is written to `localStorage` so that leaving the screen — most often to change the language from the profile screen — does not throw the work away. `frontend/src/screens/farmer/productDraft.ts` owns it.

The key is `wb.draft.product.<farmerId>` and the farmer id is **also stored inside the payload**. The first version used one shared key, and on a field coordinator's phone, where farmer after farmer registers on the same handset, the next woman opened "New product" and found a stranger's photo on step 1. Nothing is written until `hasStarted()` is true, so opening the wizard and walking away leaves no trace, and `readDraft` deletes the old unkeyed `wb.draft.product` on sight.

### Categories

`CATEGORIES` in `backend/src/db/seed.ts`, served by `GET /api/catalog/categories`. It is a constant in code, not a collection: a product stores only `categoryId`, and the label, icon and photograph are all derived from it.

**`other` is the escape hatch, and it carries no `food` flag.** `Category.food` absent means *both halves*, because both wizard screens filter the list by the food question the farmer has already answered — flag it either way and half the farmers lose their escape hatch. Twelve categories cannot name everything a village makes, and a woman whose product is not listed otherwise has two choices: file it under something it is not, which poisons the filter for every buyer, or stop. It sorts last and has no entry in `categoryPhoto.ts`, because there is no honest picture of "everything else". `backend/tests/categories.test.ts` holds all of that.

Known gap: **the server never checks `categoryId` against this list** — `products.routes.ts` only requires it to be non-empty, so a junk id is stored and the product then falls out of every category filter. There is at least one such row in production (`pickles`, plural).

### Product photos

**Every upload is compressed on the phone, and nothing over 5MB is accepted.** Product photos, her bank's QR and the payment screenshot all go through `uploadImage()` in `frontend/src/lib/upload.ts`, so anything uploaded later gets the same treatment. Each image is re-encoded as JPEG, small ones included, with quality stepped down until it meets a target size. The numbers are in `lib/compress.ts`: product 1200px and ~350KB; payment screenshot 1800px and ~600KB, because the admin has to *read* the UTR and time on it. The canvas is painted white first, since a transparent PNG pixel encodes as black in JPEG. Cloudinary's signed upload transformation in `uploads.routes.ts` repeats the same size caps, as a backstop for a phone that could not compress. `frontend/tests/compress.test.ts` holds it.

`PhotoPicker` takes **one photo, from the gallery, and nothing else**. The camera button and the emoji fallback grid are both gone, so a photo is now required unless Cloudinary is off — the picker reports that upward through `onUnavailable` and the step stops being a wall the farmer cannot pass. Once a photo is in, "choose from gallery" is disabled rather than silently replacing it; the ✕ on the thumbnail is the way to change it. The file input resets its own `value`, or removing a photo and picking the same file again fires no `change` event at all.

**Photos are shown by a plain `<img loading="lazy">` on the Cloudinary thumbnail URL** (`ProductImage`, sized by `cloudinaryThumb`), and repeat views come from the browser's own cache, which Cloudinary allows for 30 days. There was an in-memory LRU of blob URLs (`imageCache.ts`) on the belief that it saved reads; photos never touch the API or Firestore, so it saved none. It cost bandwidth instead — every card `fetch()`ed its photo on mount, so a catalogue downloaded whole while she looked at four — and evicting a blob revoked a URL a card on screen still held, so Back to a long list showed category stock photos. It was removed on 25 September 2026; do not bring a blob cache back.

A listing that still has no picture — an old one, or Cloudinary off — falls back to a photograph of its **category**, never of a product: `frontend/src/lib/categoryPhoto.ts`, the same bundled files the landing page already ships, so it costs no new bytes. A generic jar of pickle above a farmer's name is honest about being a category picture; a specific-looking photo of someone else's pickle is not. Categories with no honest match (beauty, farm produce, jewellery) are absent on purpose and keep the emoji — a wrong photo is worse than none.

### Feedback: buyers rate products; a farmer's rating comes from them

`shared/src/review.ts` is the rule, `backend/src/db/reviews.ts` applies it, `backend/tests/reviews.test.ts` holds it, and `RateOrderGate` in `frontend/src/components/Reviews.tsx` is the screen.

- **One review per product per delivered order**, written by the buyer on that order through `POST /orders/:id/review` with `{ ratings: [{ productId, rating, comment? }] }`. **Every product on the order, all at once** (`ratingsProblem`) — a product listed twice is rated once. No order, no review: that stops a rival's one-stars and a farmer's own five-stars. Rating again replaces that product's review on that order.
- **Stars required, words optional** (max 500). Every row of stars prints its number and a word (`rev.word.N`) — never stars alone.
- **The buyer cannot skip it.** While any delivered order inside `REVIEW_WINDOW_DAYS` (30) is unrated (`needsRating`; the server lists them as `toRate` on `/orders/mine`), `RateOrderGate` covers the whole customer app, bottom tabs included, with no close button; `CustomerLayout` makes everything behind it `inert`. Rating one brings up the next. It checks on open, on return to the app, every two minutes, and on navigation (at most every 30 s). The server enforces the same rule: `POST /orders` answers 409 while any are waiting. Orders older than the window are never asked about.
- **A farmer's rating is her products' ratings, taken together** — every visible review of every product she sells, each counted once (`ratingsByFarmer` / `farmerRating`), so a product rated often weighs more than one rated once. Buyers never rate her directly. It is on `PublicFarmer` (her card on the product and shop pages, with "across all her products"), on her home card and at the top of `/farmer/reviews`. The stored `Farmer.rating`/`ratingCount` are legacy and never read. Each catalogue product carries its own `rating`/`ratingCount`, derived from `reviews` on every request (`ratingsByProduct`) — a stored average goes stale the moment an admin hides a review. `GET /catalog/products/:id/reviews` is public exactly as far as the product is (`publiclyVisible`, same 404).
- **First name only in public** (`publicName`, copied at write time). `toPublicReview` strips `customerId`, `farmerId` and every moderation field. Each review copies `productName`, so a deleted listing's reviews stay readable.
- **Hide is the only admin action** (`POST /admin/reviews/:id/hide`, reason required and kept). A hidden review leaves the product's list and average; editing it does not bring it back; the buyer sees that it was hidden, the farmer stops seeing it.
- **Where it shows:** product cards (stars only when there are some) and the product page (summary + every review) · the buyer's order screen (what they gave, with "change" inside the window) · her home card, `/farmer/reviews` and her order screen, each review naming its product · the admin **Reviews** screen (product column; low-ratings and hidden filters) and each farmer's page.
- **Older whole-order reviews** are split once at boot (`splitOrderReviews`): the same stars and words on every product that order held, the original document kept for the first product and new ones added — nothing deleted.
- `reviews` is a Firestore collection like the others and is **never seeded**. `purge:demo` removes reviews on the orders it removes.

### The updates list

`frontend/src/lib/notifications.ts` is **derived, never stored**. Every line comes from `OrderEvent`s already on the order, or from `farmer.notices` written by the admin handler that made the change — both already fetched. A `notifications` collection would be a second copy of facts we hold, wrong the first time somebody forgot to write a row. This is not push; the app has to be open.

- **One row per ORDER, not per event.** An order that is accepted, packed, sent out and delivered is one row that changes, named after what is in it (`itemSummary`), wearing its state as a `Pill` drawn from `STATUS_STYLE` — the same colour and icon its order screen uses. Four rows repeating the same total, one per verb, is a history read back rather than an answer to "where is my order".
- **The tag is the order's own `status`, not the last event the other side caused.** On the farmer's side those are rarely the same thing — a customer only ever causes `PLACED` and `CANCELLED` — so a tag drawn from the buyer's last move said "new order" on every row for ever, including ones she had packed and delivered herself.
- Timed by the **latest** other-side event, which is what the bell's count compares against, so an order that moves again after she looked counts once rather than once per step. There is no per-row "new" mark: the tag already says where the order is, and a badge beside it is two things competing to be the thing she reads.
- **The other side's actions only** (`e.by !== mine`). A farmer does not need telling she accepted an order two seconds ago.
- An admin decision has no order and no product, so it carries no `title` and prints its own sentence instead. `noticeLabelKey` still writes those sentences per side — "Order placed" is a fact about a row, "You have a new order" is a thing to go and do.

### Taking a listing down, and deleting one

Validation functions in `shared/src/farmer.ts` run on **both** sides: the client for a fast friendly message, the server because the client can lie.

**A take-down is a removal, the moment it is made.** `POST /admin/products/:id/moderate` with `approve: false` and a reason splices the row, destroys its photo, deletes its reports, and writes a `PRODUCT_REJECTED` notice that carries the reason — which is where he reads every other admin decision. `approve: true` is refused with 400: listings are not approved one by one any more.

**Deleting a listing deletes the document.** `DELETE /products/:id` takes any of his own listings, splices the row and destroys its Cloudinary image (best effort, not awaited — the record is already gone and the farmer is waiting on a phone).

This is safe because **an order copies what it needs**: `OrderItem` carries the name, emoji, quantity and price from checkout, and nothing dereferences `productId` to draw an order. `backend/tests/product-delete.test.ts` holds that contract — normalising those fields away would quietly empty a year of order history the first time a listing is deleted.

### Paying a farmer by UPI

The buyer's order screen offers a QR, written steps, the UPI ID with a copy button, and a UTR box, in that order. **A phone cannot scan its own screen**, so the two routes that work from one handset are: take a screenshot of the QR, then scan it from the gallery inside PhonePe or Google Pay; or copy the UPI ID and paste it there. `PaySteps` in `components/PayFromPhone.tsx` writes the first route out one tap per line — screenshot (power + volume-down), open the app, scan, gallery icon, check name and amount, come back for the UTR.

**There is no "Pay" button on a `upi://pay` link, and it must not come back while payees are personal UPI IDs.** It existed twice. The second time it opened PhonePe and Google Pay correctly, and they refused the payment with "declined for security reasons": UPI apps treat a payment that *another app* starts, to a *personal* UPI ID, as the shape of a scam, and every payee here is one. Nothing in the link fixes that; the same code scanned from the gallery pays fine (tested on real phones, 14 September 2026). A pay link works again only for business UPI IDs (PhonePe Business, Paytm for Business…), and then only for those accounts. `buildUpiLink()` sends no `tr` for the same reason: a merchant field on a personal ID is one more thing the risk check reads as a fake shop.

The tap after paying is Back, so `lib/useReturnFromApp.ts` is armed when she copies the ID (a screenshot fires no event the page can hear, so that route does not arm it), and on her return (hidden, then visible — never `focus` alone) the screen scrolls the UTR box into view and focuses it, once per arming.

### How long the delivery will take

`Order.deliveryEstimate` — free text in her own words ("2 दिवसांत"), asked at
the one moment she knows: `FARMER_ACTIONS.PLACED` carries `needsEstimate`, so
tapping **Accept** opens the sheet before the order moves. A buyer whose order
was accepted used to be told `ACCEPTED` and nothing about time, and "when?" is
her next question.

Not a date picker: the honest answer in a village with one bus a day is a
phrase, and a calendar would make her invent a precision she does not have.
Four chips carry the common answers because typing Marathi is the barrier, not
knowing the reply. **Skipping is allowed** — a time she was pushed into
inventing is worse for the buyer than none — and `cleanDeliveryEstimate()`
stores nothing for an empty answer. It is kept only on the `ACCEPTED`
transition, and shown on both order screens under the status.

### What size is it

`Product.packSize` counts in the listing's own `unit` (500 with `g`), and
`piecesPerPack` answers the second question a **set** raises: a set of four
ladoos and a set of twenty are the same word. `sizeProblems()` and
`needsPieceCount()` in `shared/src/farmer.ts` are the rule, enforced by the
wizard, the edit screen and `listingProblems` on the server — a price with no
size cannot be compared with the shop next door.

Both are in `EDIT_COUNTED_FIELDS`: moving 500 g to 250 g at the same price is
a different product, not a correction. The price itself stays free to change,
for the reason it always was. `sizeLabel()` in `frontend/src/lib/productSize.ts`
prints it ("500 ग्रॅम", "1 सेट (6 नग)"); a listing from before the question
existed has none, and its unit alone is still the honest answer.

### Reporting a listing or a review

`shared/src/report.ts` holds the reasons; `POST /reports` (customer only)
stores one row per buyer per thing — a second tap is a woman making sure it
went, not a second complaint, and is answered as if it were the first. This is
the only moderation signal that arrives *after* a listing is live.

- **A report changes nothing on its own.** The listing stays LIVE: one annoyed
  buyer must not be able to empty a woman's shop. It joins the admin console's
  **Reported** tab (`GET /admin/products?status=REPORTED`), beside the Live
  tab — there is no review queue, since listings are not approved one by
  one. A reported REVIEW joins the console's Reviews screen under its
  **Reported** filter (`?reported=true`), with `clear-reports` beside Hide.
- **Either side may flag a review.** `POST /reports` takes `customer` or
  `farmer` (`byRole`), because the person an abusive review is written about
  is the one nobody else is in a position to speak for. Products are reported
  by buyers, who are the only ones looking at them.
- **Two ways out, both deliberate.** Take the listing down (deletes it, and
  its reports with it) or `POST /admin/products/:id/clear-reports`, which
  closes them with who looked. Closed rather than deleted: "three people
  complained and an admin disagreed" is a different fact from "nobody ever
  complained".
- **A reason is always required**, from the list, and only `other` carries
  typed words — a queue where every row says "inappropriate" cannot be
  triaged. Reports are anonymous to the farmer.
- `reports` is a Firestore collection, so it counts against the daily read
  budget (docs/CAPACITY.md §4). `backend/tests/report.test.ts` holds the rules.

### Sorting the admin lists

Farmers, Products and Orders each have a **Sort by** menu. `admin/src/lib/sort.ts` holds one option table per list, because "highest" is a different number on each: what she has earned (delivered orders, added to `/admin/farmers` as `earned`), what a product costs, what an order came to. Sorting is client-side, since every list already arrives whole. Names go through an `Intl.Collator` for Marathi and English, so Devanagari and Latin names each sort properly and case is ignored. The choice is remembered per list in `localStorage`, and newest-first is the default everywhere. `admin/tests/sort.test.ts` holds it.

### Other shared modules

- `farmerCode.ts` — the `F2C-<VILLAGE>-<NNN>` ID. The serial is **per village**, not global, so the code tells a field coordinator where to go. Non-survey villages are transliterated from Devanagari.
- `readiness.ts` — Digital Readiness Index. Six factors self-reported at registration (the day-one baseline), four **measured by the platform** from what the farmer actually does. Keep that split; it is what makes the before/after comparison meaningful.

### Config and graceful degradation

`backend/src/config.ts` reads everything from the environment, and every integration degrades rather than crashing. With an empty `.env`: JSON-file database, emoji instead of photos, and phone + password sign-in with no SMS provider. The boot banner (`describeConfig()`) prints what is actually live — check it before debugging a "broken" integration.

`SESSION_SECRET` is the one exception: a fixed development fallback, but the server **refuses to boot in production without it**.

`ALLOW_BULK_DELETE` is the other flag that is not about degradation. Unlike `ALLOW_DEV_RESET` it is honoured in production too, because the one time the guard behind it mattered, it mattered on the live database. Leave it blank in every `.env`; set it inline on the single command that means it (`ALLOW_BULK_DELETE=true npm run purge:demo -- --commit`).

`CORS_ORIGIN` is comma-separated and parsed into a **list**, because two front ends on different origins call one API. Handing a comma-joined string straight to `cors()` matches neither and blocks both.

Photos upload **direct from the browser to Cloudinary** via a short-lived signature from `/api/uploads/signature`; the bytes never pass through the server and the API secret never leaves it.

## Conventions

- **Errors** are `{ error, messageMr, fields? }`. Every user-facing failure carries a Marathi message. `ApiError` in the frontend api client surfaces all three.
- **No screen calls `fetch` directly** — `frontend/src/lib/api.ts` and `admin/src/lib/api.ts` are the only seams to the server.
- **A panel that opens from a long list is a `<dialog>` opened with `showModal()`**, not a card appended to the page — the admin order detail used to render below the fold, and Open looked dead. Never `close()` it in an effect cleanup: StrictMode runs effect, cleanup, effect in development, the `close` event from that cleanup lands after the second `showModal()`, and `onClose` unmounts the dialog it just opened. Guard with `if (!dialog.open)` and let unmounting take it out of the top layer.
- **i18n**: Marathi is the default and the source text, listed first in both apps' `LANGS`; English is the toggle. A key missing from English falls back to Marathi (`translate()` in each `strings.ts`). Every string goes through `t('key')` from `I18nProvider` — **placeholders included**, which is where they kept being missed: an English UI with a Marathi example inside the input is the same bug as an untranslated label. `frontend/tests/i18n.test.ts` asserts dictionary parity, that each dictionary is in its own language, that no component hard-codes a Devanagari `placeholder=`, and that every `t()` key a component asks for exists — a missing one renders as its own name, on screen, in both languages.
- **Marathi follows one source**: `docs/MARATHI-STYLE.md`, which is the महाराष्ट्र शासन orthography (1972, rev. 2009) — the spelling these women were taught from बालभारती textbooks, and therefore the spelling they recognise. It settles postpositions (joined: `बाजारात`, never `बाजार मध्ये`), gender agreement (**ऑर्डर is neuter** — `ऑर्डर आले`, `माझे ऑर्डर` — भरणा masculine), Marathi word order over translated English (`… हे यावरून ठरते`, never `यावरून ठरते की …`), one word per thing, and `ॲ` as U+0972 rather than the ZWJ sequence. Two colloquial registers are deliberate and must not be "corrected": the landing CTAs (`मला विकायचं आहे`) and the reader's own first-person buttons (`नंतर करू`, formerly `नंतर करते`: the same first-person voice, made neutral because farmers are men and women). `frontend/tests/marathi.test.ts` and `admin/tests/marathi.test.ts` enforce the mechanically checkable half.
- **English is not a translation of Marathi.** The two dictionaries are independent pieces of writing that say the same thing differently, so a Marathi fix never edits the English line beside it — and the reverse. `lp.collegeMr` and `onb.chooseLangSub` are the only two English entries that are Devanagari on purpose.
- **Tests** are `node:test` + `node:assert/strict`, run through tsx. They read as prose explaining *why* a rule exists — match that when adding one.
- Comments here explain reasoning and trade-offs, not mechanics. Follow suit rather than narrating what the code already says.

## Design rules (constraints, not preferences)

From spec section 6, encoded in `frontend/src/styles/theme.css`:

- Status is colour **+ icon + word**, never colour alone. Every icon carries a word.
- 16px minimum text, 56px buttons, 44px touch targets.
- Four bottom tabs, one level deep. **No hamburger menu.**
- One question per screen in wizards, with progress dots. **Editing is not a wizard** — `EditProduct` puts every field on one page, because four taps between the farmer and the price the farmer came to change is not simplicity.
- Confirmation dialogs state the consequence, never a bare "Are you sure?"
- An empty state never repeats the action already standing in the bar below it. `MyProducts` had "New product" twice, one above the other, and the second read as a different thing rather than the same one.
- Latin digits (₹500, not ५००) — that is what is printed on money.
- **No web fonts.** Android ships Noto Sans Devanagari, so Marathi renders from system fonts at zero network cost.
- `theme.css` opens with a `:root` block marked **THEME SWAP POINT**; every colour, size and radius comes from those tokens, so retheming is a change to that block alone.

Voice input (`frontend/src/lib/useVoiceInput.ts`) wraps the Web Speech API and is an **addition** — the keyboard is never removed, and the mic simply does not render where speech is unsupported. Every `VoiceInput` owns its own mic and dictates into itself; there is no app-wide microphone.

Icons come from `react-icons` through `frontend/src/components/icons.tsx` (and `admin/src/components/icons.tsx`), the only files that name a vendor icon. **No emoji is shown anywhere in the three apps.** `STATUS_STYLE` and `PRODUCT_STATUS_STYLE` carry an icon *name* (`StatusIconName`, `ProductStatusIconName`) that `StatusIcon` / `ProductStatusIcon` draw; a product or order line with no photo shows `IconProduct`; veg/non-veg is `VegMark`, drawn in CSS like the printed FSSAI mark; done screens show a green tick. `Product.emoji` and `Category.icon` are still stored but never rendered. The only marks of that kind left are a tick and a cross — as icons.

The brand mark is a portrait of कै. शांताबाई (काकी) सिद्रामप्पा आलुरे, the woman the market is named for. `frontend/src/assets/logo.png` and `admin/src/assets/logo.png` are the same mark; both apps also carry it as a favicon from their `public/` folder. It already contains its own gold ring, so never give it a border or a background — either prints a second ring.

The landing page follows the project poster: a hero card (logo, name Marathi first with `app.nameShort` under it, tagline, mission, four entry buttons), then need, workflow, features, outcomes and the college, each a `Card`. There are no photographs on it; `HeroArt` is a field drawn in CSS from the tokens.

## Deployment shape

One Cloud Run service (`shantai-api`, `asia-south1` — the API) and two Vercel projects from this same repo, distinguished only by Root Directory (`frontend` and `admin`). `VITE_API_URL` is read at **build** time, so changing it means redeploying.

**The app is the `prathamesh2` branch, and both Vercel projects must track it by name.** `main` holds only the initial commit and `prathamesh` — GitHub's default branch — is an older copy from 8 September with no `admin/` and a lockfile missing rollup's Linux binary, so every default Vercel reaches for builds the wrong code or fails outright. The two branches share nothing after the initial commit; do not merge `prathamesh` in.

The service needs two settings that are not Cloud Run's defaults, and neither is visible from the outside:

- **Maximum instances 1.** See *Persistence* above. The default is 100.
- **CPU always allocated** (`--no-cpu-throttling`). `save()` writes 400ms *after* the response has gone, and by default Cloud Run takes the CPU away the moment a response is sent — the write then waits for the next request, or for the `SIGTERM` flush when the instance is stopped.

`SESSION_SECRET`, `FIREBASE_SERVICE_ACCOUNT` and `CLOUDINARY_URL` reach the service from **Secret Manager**, not as plain variables; a new secret version takes effect only on the next revision.

How the container is built is not recorded in this repo: there is no Dockerfile and no `cloudbuild.yaml`. `docs/DEPLOY.md` says so, and is where that command belongs once somebody writes it down.

**Both apps route in the browser, so both need `vercel.json`** — one catch-all rewrite to `index.html`, already committed in each folder. Without it every URL but the home page 404s on reload, which is the first thing anyone does with a link they were sent.

**Neither Vite config sets `base`, and neither should.** The default absolute `/assets/…` is the only path right at every route depth: a relative one under the SPA rewrite makes `/farmer/orders` fetch `/farmer/assets/index-xxx.js`, receive `index.html`, and render a blank page. A `--mode capacitor` build with `base: './'`, `cap:*` scripts, `capacitor.config.json` and the `offline.html` its `errorPath` named all existed for a Capacitor APK that never shipped, and were removed. Nothing in the repo is Capacitor now; do not add a file that only a Capacitor build would read. The last two came back once, in `e0801ab` ("Preserve Capacitor and offline support"), with nothing reading them, and were removed again on 21 September 2026 — a dropped connection is `components/OfflineScreen.tsx`.

## Not built yet

Farmer replies to reviews · chat · disputes · returns and refunds · coupons · real camera capture · QR decoding · courses and certificates · the farmer's own address book.