# Farmers to Consumer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a copy of the Shantai Mahila Bazar monorepo into "Farmers to Consumer", a website where rural farmers sell produce directly to consumers. It uses phone + password login, one-time farmer verification, traceability QR codes, maps, price hints and the FDRI research module.

**Architecture:** Copy `E:\Shantai_mahila_bazar_web` (with every rule and fix it carries), strip what does not apply, rename seller → farmer mechanically, then add features one by one. The shape stays the same: one Express API with an in-memory store over Firestore, one React/Vite app for farmers and buyers, one React/Vite admin console, and `shared/` domain rules imported by all three.

**Tech Stack:** Node 22, TypeScript 5.7, Express 4, firebase-admin 13, React 18, Vite 5, react-router 6, react-icons, qrcode, Leaflet 1.9 (new), `node:test` via tsx.

**Spec:** `docs/superpowers/specs/2026-09-26-farmer-to-consumer-design.md`. Read it before any task. Also read `CLAUDE.md` in the repo root once Task 1 has copied it. Every rule there still holds unless this plan removes it.

## Global Constraints

- Cross-workspace imports: `import type { X } from '@shared/<file>.js'` — `.js` extension on a `.ts` file, always.
- `shared/` is consumed as TypeScript source; never add a build step to it.
- Errors are `{ error, messageMr, fields? }`; every user-facing failure carries a Marathi message.
- No screen calls `fetch` directly; `frontend/src/lib/api.ts` and `admin/src/lib/api.ts` are the only seams.
- Every UI string goes through `t('key')`, placeholders included. Dictionaries: `mr` (default), `en`, `hi` (from Task 13).
- Marathi follows `docs/MARATHI-STYLE.md`.
- Design rules: status = colour + icon + word; 16px minimum text, 56px buttons, 44px touch targets; four bottom tabs, no hamburger; one question per wizard screen; editing is one page; confirmations state the consequence; Latin digits; no web fonts; no emoji rendered; voice input is an addition.
- Colours come only from the `:root` THEME SWAP POINT tokens. Primary `#2e7d32` leaf green, accent `#7b1e2e` maroon (spec §5.11 table).
- Tests: `node:test` + `node:assert/strict`, run through tsx. Comments explain *why*.
- Persistence: exactly one API process; `isBulkDelete()` guard stays; never auto-seed.
- Password: minimum 6 characters, digits-only allowed, scrypt via `backend/src/auth/crypto.ts`.
- Login limit: 5 failures per phone per 15 min; 50 per IP per hour.
- Public farmer location: rounded to 2 decimals. Exact coordinates only for admin and the farmer himself.
- FDRI: 10 indicators × 1 point; Low 0–3, Moderate 4–7, High 8–10.
- Farmer code: `F2C-<VILLAGE>-<NNN>`, serial per village, 3 digits.
- Website only: no APK, no push, no OTP, no subscription.
- Every task ends with `npm test`, `npm run typecheck` and `npm run build` green, then a commit that ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A phone number typed with spaces or +91 at login** — must match the account registered as 10 digits (`normalizePhone`). Test in Task 5.
2. **A farmer who is blocked or not yet verified opens a trace QR link someone printed** — must get the same 404 as a missing product, not farmer data. Test in Task 9.
3. **A pickup order a buyer tries to cancel after "ready for pickup"** — the buyer may cancel only while `PLACED`; the farmer's cancel must still work at `PACKED` for pickup. Test in Task 8.
4. **A listing whose unit is `dozen` or `piece` asking for a mandi price** — Agmarknet is ₹/quintal, so the hint must omit the mandi line rather than print a wrong conversion. Test in Task 11.
5. **Survey records with missing answers (coordinator skipped a question)** — research tables must count them as "not answered", never crash or drop the row. Test in Task 12.

---

## File Structure (after all tasks)

```
shared/src/
  types.ts            Farmer, Product, Order (+fulfilment), Survey, Credential-free
  orderFlow.ts        + pickup branch: actionsFor(), canTransition(from,to,fulfilment), buyerStages()
  farmer.ts           (was seller.ts) phone/pincode/UPI rules, verification, listing rules
  farmerCode.ts       (was womenbiz.ts) F2C-<VILLAGE>-<NNN>
  fdri.ts             NEW  (replaces readiness.ts)
  profile.ts          NEW  age groups, education, landholding, farmer types, channels, problems
  crops.ts            NEW  crop list with Agmarknet commodity names
  produce.ts          NEW  units, cultivation, harvest-date and min-order rules
  geo.ts              NEW  coordinate validation and public rounding
  research.ts         NEW  Tables 1–9
  csv.ts              NEW  CSV with BOM
  password.ts         NEW  password rule shared by client and server
  (kept) orderCancel.ts payment.ts review.ts report.ts complaint.ts accountClose.ts
backend/src/
  auth/credentials.ts NEW  phone+password store (never on Farmer/Customer rows)
  routes/auth.routes.ts   login, change password, logout, sessions, admin login
  routes/farmers.routes.ts (was sellers.routes.ts)
  routes/insights.routes.ts NEW price hint
  insights/price.ts   NEW  platform median + Agmarknet
  routes/surveys.routes.ts NEW admin survey entry + research tables
frontend/src/
  screens/auth/Auth.tsx     phone + password login, register start
  screens/auth/ChangePassword.tsx NEW
  screens/auth/FarmerRegister.tsx (was SellerRegister.tsx)
  screens/trace/Trace.tsx   NEW public QR landing
  components/MapView.tsx    NEW Leaflet wrapper
  components/ProductQr.tsx  NEW download/print QR
  components/PriceHint.tsx  NEW
  screens/customer/FarmerMap.tsx NEW
admin/src/
  screens/Surveys.tsx NEW   survey entry + list
  screens/Research.tsx NEW  Tables 1–9 + CSV
  screens/Demand.tsx NEW    demand/supply chart
  screens/MapScreen.tsx NEW exact map
  components/MapView.tsx NEW (same wrapper, admin copy)
```

---

### Task 1: Copy the reference and establish a green baseline

**Files:**
- Create: everything under `e:\Farmer_to_consumer_website\` from the reference (the spec and plan already exist in `docs/superpowers/`)
- Modify: `package.json`, `shared/package.json`, `backend/package.json`, `frontend/package.json`, `admin/package.json`, `Dockerfile`, `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: workspaces named `@f2c/shared`, `@f2c/backend`, `@f2c/frontend`, `@f2c/admin`. Root scripts `dev`, `dev:all`, `test`, `typecheck`, `build` keep their names.

- [ ] **Step 1: Copy with robocopy (keeps the uncommitted reference edits, skips generated and secret files)**

Run in PowerShell:
```powershell
robocopy E:\Shantai_mahila_bazar_web E:\Farmer_to_consumer_website /E `
  /XD .git node_modules .claude brag-output brag-output-2026-09-21-210937 dist coverage .vercel recovery backups `
  /XF CLAUDE.md .env *.tsbuildinfo db.json artifact-cleanup.json current-changes.patch *.apk *.keystore google-services.json *serviceAccount*.json *firebase-adminsdk*.json .env.msg91-backup
```
Expected: exit code below 8. `CLAUDE.md` is excluded because this repo already has one (the Workflow / Model routing / Delegation rules). Append the reference's one below those rules, dropping only its first `# CLAUDE.md` heading line:
```bash
tail -n +2 /e/Shantai_mahila_bazar_web/CLAUDE.md >> CLAUDE.md
```
The Workflow section must stay at the top. Later tasks edit only the appended part.

Then check that `docs/superpowers/specs/2026-09-26-farmer-to-consumer-design.md` is still ours: `git diff --stat docs/superpowers` shows no change.

- [ ] **Step 2: Rename the workspace packages**

```bash
cd /e/Farmer_to_consumer_website
grep -rl "@shantai/" --include=package.json --include=Dockerfile --include=*.md . | grep -v node_modules | xargs sed -i 's/@shantai\//@f2c\//g'
sed -i 's/"name": "womenbiz"/"name": "farmers-to-consumer"/' package.json
rm -f package-lock.json
npm install
```
Expected: install finishes. `npm ls --workspaces --depth=0` lists four `@f2c/*` packages.

- [ ] **Step 3: Baseline gate**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass. The reference counts are backend ≈350, frontend ≈134, admin ≈37 tests. If anything fails here, it failed in the reference too. Stop and report it; do not fix it inside this task.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Copy Shantai Mahila Bazar as the starting point

Unmodified copy of E:/Shantai_mahila_bazar_web (branch prathamesh2,
including its uncommitted SUPPORT_PHONE edit), with the workspaces
renamed to @f2c/*. Every later change is a diff against this.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Remove push notifications, the APK page and the QR download route

**Files:**
- Delete: `backend/src/push/` (notify.ts, register.ts, send.ts, targets.ts), `backend/src/routes/push.routes.ts`, `backend/src/routes/qr.routes.ts`, `shared/src/pushText.ts`, `frontend/src/lib/pushBridge.ts`, `frontend/src/components/PushBridge.tsx`, `frontend/src/screens/landing/DeleteAccount.tsx`, `backend/tests/push-send.test.ts`, `backend/tests/push-targets.test.ts`, `backend/tests/push-token.test.ts`, `backend/tests/push-triggers.test.ts`, `backend/tests/qr-download.test.ts`, `frontend/tests/pushBridge.test.ts`, `frontend/tests/pushText.test.ts`
- Modify: `backend/src/index.ts`, `backend/src/routes/orders.routes.ts`, `backend/src/auth/types.ts`, `backend/src/auth/rateLimit.ts`, `backend/src/db/notices.ts`, `backend/src/config.ts`, `frontend/src/App.tsx`, `frontend/src/lib/api.ts`, `frontend/src/screens/landing/Landing.tsx`, `frontend/src/i18n/strings.ts`, `docs/DEPLOY.md`

**Interfaces:**
- Consumes: Task 1 tree.
- Produces: `SessionRecord` without `pushToken`/`pushLang`; no `/api/push/*` or `/api/qr/*` routes; no `/delete-account` route.

- [ ] **Step 1: Delete the files listed above**

```bash
git rm -r backend/src/push backend/src/routes/push.routes.ts backend/src/routes/qr.routes.ts \
  shared/src/pushText.ts frontend/src/lib/pushBridge.ts frontend/src/components/PushBridge.tsx \
  frontend/src/screens/landing/DeleteAccount.tsx \
  backend/tests/push-*.test.ts backend/tests/qr-download.test.ts \
  frontend/tests/pushBridge.test.ts frontend/tests/pushText.test.ts
```

- [ ] **Step 2: Remove every reference**

Run `npm run typecheck`. Remove each import and call it reports:
- `backend/src/index.ts`: remove `pushRouter`/`qrRouter` imports and `app.use('/api/push' …)` / `app.use('/api/qr' …)`, the `onNotice(...)` push wiring, and the `Push` line of the boot banner.
- `backend/src/routes/orders.routes.ts`: delete every `void notify…(…)` line and its import.
- `backend/src/auth/types.ts`: delete the `pushToken` and `pushLang` fields from `SessionRecord`.
- `backend/src/auth/rateLimit.ts`: delete `pushTokenPerSession`, `pushTokenPerIp` and `qrPerIp` from `LIMITS`.
- `backend/src/db/notices.ts`: delete the `onNotice` hook and its listener variable.
- `frontend/src/App.tsx`: delete the `<PushBridge />` element, the `DeleteAccount` import and its `<Route path="/delete-account" …>`.
- `frontend/src/lib/api.ts`: delete `registerPush`.
- `frontend/src/screens/landing/Landing.tsx`: delete the footer link to `/delete-account`.
- `frontend/src/i18n/strings.ts`: delete keys starting `push.` and `del.` in both dictionaries (`grep -n "'push\.\|'del\." frontend/src/i18n/strings.ts`).
- `backend/src/config.ts`: delete the FCM/push flag and its banner text.

Also check that no stray text remains: `grep -rn "push\|__smbPushToken\|delete-account" backend/src frontend/src shared/src` should print only unrelated words (`.push(` array calls).

- [ ] **Step 3: Cut the APK from the docs**

In `docs/DEPLOY.md`, delete section "6. The Android build" to the end of the file. In `CLAUDE.md`, delete the sections "Push notifications", "Deleting an account" paragraph 1 (the Google Play sentence and the `/delete-account` sentence only), and in "Deployment shape" every bullet that mentions the APK, WebView or wrapper. Keep the Vercel/Cloud Run text.

- [ ] **Step 4: Gate**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS. The frontend i18n test proves that no component still asks for a deleted key.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Remove push notifications, the Play delete page and the QR download route

This is a website with no Android wrapper, so the FCM transport, the
page-to-APK token handshake and the WebView download workaround have
nothing to talk to. In-app account close stays.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Remove subscription, slots and per-listing approval; add one-time verification

**Files:**
- Delete: `shared/src/subscription.ts`, `backend/src/db/subscription.ts`, `backend/src/db/payments.ts`, `frontend/src/screens/seller/Subscription.tsx`, `frontend/src/components/SubscriptionNotice.tsx`, `admin/src/screens/Payments.tsx`, `admin/src/components/Subscription.tsx`, `backend/tests/subscription.test.ts`, `backend/tests/payment-proof.test.ts`, `backend/tests/payment-reject.test.ts`, `backend/tests/payment-account.test.ts`, `backend/tests/slots.test.ts`, `backend/tests/edit-limit.test.ts`, `backend/tests/listing-review.test.ts`
- Modify: `shared/src/types.ts`, `shared/src/seller.ts`, `shared/src/payment.ts`, `backend/src/db/seed.ts`, `backend/src/db/firestore.ts`, `backend/src/db/accountClose.ts`, `backend/src/db/moderation.ts`, `backend/src/db/analytics.ts`, `backend/src/config.ts`, `backend/src/index.ts`, `backend/src/routes/{admin,catalog,orders,products,sellers}.routes.ts`, `backend/scripts/{admin,purge-demo-data}.ts`, `frontend/src/App.tsx`, `frontend/src/lib/{api,notifications,tours}.ts`, `frontend/src/components/NotificationBell.tsx`, `frontend/src/screens/Notifications.tsx`, `frontend/src/screens/seller/{MyBusiness,MyProducts,UploadProduct,EditProduct,EditProfile,Misc}.tsx`, `frontend/src/screens/auth/SellerRegister.tsx`, `admin/src/App.tsx`, `admin/src/components/Shell.tsx`, `admin/src/lib/{api,format}.ts`, `admin/src/screens/{Home,Today,Sellers,SellerDetail,Products}.tsx`, both `strings.ts`
- Test: `backend/tests/verification.test.ts` (new)

**Interfaces:**
- Consumes: Task 2 tree.
- Produces:
  - `SellerStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'BLOCKED' | 'CLOSED'`
  - `ProductStatus = 'DRAFT' | 'LIVE' | 'PAUSED'`
  - `canSellNow(s: Pick<Seller,'status'>): boolean` in `shared/src/seller.ts`
  - `initialListingStatus(asDraft: boolean): ProductStatus` returns `'DRAFT'` or `'LIVE'`
  - `POST /api/admin/sellers/:id/verify` → `{ seller }`; writes `verifiedAt`, `verifiedBy`
  - `AdminNoticeKind` gains `'VERIFIED'` and loses the slot/payment/subscription kinds
  - `Db` without `payments`

- [ ] **Step 1: Write the failing test**

`backend/tests/verification.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canSellNow, initialListingStatus } from '@shared/seller.js'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { publiclyVisible } = await import('../src/routes/catalog.routes.js')

/**
 * A farmer is checked once, by a person, and after that his produce goes
 * straight on sale. Produce changes daily; a queue per listing would sell
 * yesterday's tomatoes. The check that remains is on the farmer.
 */

test('only a verified, unblocked farmer can sell', () => {
  assert.equal(canSellNow({ status: 'PENDING_VERIFICATION' }), false)
  assert.equal(canSellNow({ status: 'ACTIVE' }), true)
  assert.equal(canSellNow({ status: 'BLOCKED' }), false)
  assert.equal(canSellNow({ status: 'CLOSED' }), false)
})

test('a submitted listing is live at once; a draft stays a draft', () => {
  assert.equal(initialListingStatus(false), 'LIVE')
  assert.equal(initialListingStatus(true), 'DRAFT')
})

test('an unverified farmer\'s live listing is not public', () => {
  const product = { status: 'LIVE' as const }
  assert.equal(publiclyVisible(product, { status: 'PENDING_VERIFICATION', isOpen: true }), false)
  assert.equal(publiclyVisible(product, { status: 'ACTIVE', isOpen: true }), true)
  assert.equal(publiclyVisible(product, { status: 'ACTIVE', isOpen: false }), false)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && node --import tsx --test tests/verification.test.ts`
Expected: FAIL (the type error / `'PENDING_VERIFICATION'` not handled, `initialListingStatus(false)` returns `'PENDING'`).

- [ ] **Step 3: Change the shared rules**

In `shared/src/types.ts`:
```ts
export type SellerStatus =
  | 'PENDING_VERIFICATION'
  | 'ACTIVE'
  | 'BLOCKED'
  /** He asked for his account to be deleted. See shared/src/accountClose.ts. */
  | 'CLOSED'

export type ProductStatus = 'DRAFT' | 'LIVE' | 'PAUSED'

export type AdminNoticeKind = 'VERIFIED' | 'BLOCKED' | 'UNBLOCKED' | 'PRODUCT_REJECTED'
```
In `Seller`, delete `subscriptionEndsAt`, `packsApproved`, `listingsPublished`. Add:
```ts
  /** When an admin checked this farmer, and who. Absent until then. */
  verifiedAt?: string
  verifiedBy?: string
```
In `Product`, delete `rejectReason`, `rejectedAt`, `editCount`. Delete `SubscriptionPayment`, `PaymentApprovalStatus` and `AdminPaymentAccount`. In `AdminStats`, delete `subscriptionsExpiring`, `subscriptionsExpired`, `pendingPayments`, `pendingProducts`, `subscriptionRevenue`, `approvedPaymentCount`, and add `pendingVerification: number`.

In `shared/src/seller.ts`, delete `PLAN`, `SLOT_CONSUMING`, `countUsedSlots`, `SlotInfo`, `slotInfo`, `MAX_EDITS`, `EDIT_COUNTED_FIELDS`, `countsAsEdit`, `editsLeft`, `editsAreLimited`. Replace `initialListingStatus` and add `canSellNow`:
```ts
/**
 * A verified farmer's listing is on sale the moment he sends it. The person
 * check happens once, on the farmer (POST /admin/sellers/:id/verify), and
 * a listing that turns out wrong is reported and taken down.
 */
export function initialListingStatus(asDraft: boolean): ProductStatus {
  return asDraft ? 'DRAFT' : 'LIVE'
}

/** May buyers see and order from this farmer right now? */
export function canSellNow(s: Pick<Seller, 'status'>): boolean {
  return s.status === 'ACTIVE'
}
```
`sellerMayDelete(status)` now returns `true` for every status: there are no slots to protect, so a farmer removes a sold-out crop himself. Keep `PRODUCT_STATUS_STYLE` with only `live`, `draft` and `paused`.

In `shared/src/payment.ts`, delete `paidAtProblem` and anything that only served subscription payments. Keep `normalizeUtr`, the UTR rules, `upiProblem` and `KNOWN_UPI_HANDLES`.

- [ ] **Step 4: Change the backend**

- `backend/src/routes/catalog.routes.ts`:
  ```ts
  export function publiclyVisible(
    product: Pick<Product, 'status'> | undefined,
    seller: Pick<Seller, 'status' | 'isOpen'> | undefined,
  ): boolean {
    if (!product || !seller) return false
    return product.status === 'LIVE' && canSellNow(seller) && !!seller.isOpen
  }
  ```
- `sellers.routes.ts` register: `status: 'PENDING_VERIFICATION'`, and drop `packsApproved`. Delete `/me/subscription` and the payment routes.
- `products.routes.ts`: delete the slot checks, the edit-count checks and `PENDING`. `POST /products` refuses with 403 `{ messageMr: 'तुमची तपासणी झाल्यावर माल विक्रीसाठी जाईल' }` when `!canSellNow(seller)` and the body is not a draft.
- `admin.routes.ts`: delete the payments routes, `grant-slots`, `revoke-slots` and the pending queue. `moderate` with `approve: true` disappears; `approve: false` (take down) stays as it is. Add:
  ```ts
  adminRouter.post('/sellers/:id/verify', (req, res) => {
    const db = getDb()
    const seller = db.sellers.find((s) => s.id === req.params.id)
    if (!seller) { res.status(404).json({ error: 'Not found', messageMr: 'शेतकरी सापडला नाही' }); return }
    if (seller.status !== 'PENDING_VERIFICATION') {
      res.status(409).json({ error: 'Not pending', messageMr: 'हा शेतकरी आधीच तपासलेला आहे' }); return
    }
    seller.status = 'ACTIVE'
    seller.verifiedAt = new Date().toISOString()
    seller.verifiedBy = adminName(req)
    appendNotice(seller, { kind: 'VERIFIED' })
    save()
    res.json({ seller })
  })
  ```
  (`adminName(req)` is the helper `admin.routes.ts` already uses to stamp `verifiedBy` on payments; keep it when deleting the payment routes.)
- `db/seed.ts`: remove `payments` from `Db`, `emptyDb`, `withDefaults`. Seeded sellers get `status: 'ACTIVE'`, `verifiedAt`, `verifiedBy: 'seed'`.
- `db/firestore.ts`: remove `'payments'` from the collection list.
- `db/analytics.ts`: compute `pendingVerification = sellers.filter(s => s.status === 'PENDING_VERIFICATION').length` and delete the removed stats.
- `db/accountClose.ts`: delete payment-screenshot deletion and the ₹50 wording in comments.
- `config.ts`: delete `ADMIN_PAYMENT_ACCOUNT` and the `ADMIN_UPI_*` variables.
- `index.ts`: delete `backfillSubscriptionTerms` and `purgeRejected` calls. Keep `purgeArchived`, then delete it in `moderation.ts` too if nothing produces `ARCHIVED`.
- `scripts/admin.ts`, `scripts/purge-demo-data.ts`: delete the payments commands and fields.

- [ ] **Step 5: Change the frontend and admin**

- Delete the files listed. Remove their routes (`/seller/subscription`, admin `/payments`) and their tabs/links.
- `lib/notifications.ts`: delete `subscriptionFeed`. Map `VERIFIED` to a new key `notif.verified` ("तुमची तपासणी झाली. आता तुमचा माल विक्रीसाठी दिसेल." / "You are verified. Your produce is now on sale.").
- `MyBusiness.tsx`: replace the subscription card with this card when `seller.status === 'PENDING_VERIFICATION'`:
  ```tsx
  <Notice tone="warn">{t('biz.pendingVerification')}</Notice>
  ```
  with `biz.pendingVerification` = "तुमची नोंदणी झाली. आमचे प्रतिनिधी तपासणी करतील, मग तुमचा माल ग्राहकांना दिसेल." / "You are registered. Our team will verify you; then buyers will see your produce."
- `UploadProduct.tsx`: the final button reads `upl.publish` = "विक्रीसाठी टाका" / "Put on sale". Delete the slot meter and the "send for checking" copy.
- `EditProduct.tsx`: remove the disabled-by-edit-limit logic; every field is editable.
- Admin `SellerDetail.tsx`: when the status is `PENDING_VERIFICATION`, show a primary button `sel.verify` ("Verify farmer" / "शेतकरी तपासला") that posts to `/admin/sellers/:id/verify` behind the existing `Confirm` component. The consequence line is `sel.verifyConsequence` ("His live listings will be visible to buyers at once.").
- Admin `Sellers.tsx`: replace the subscription filter with a "Waiting for verification" filter. `Home.tsx`/`Today.tsx`: replace the payment counters with `pendingVerification`.
- Delete all now-unused keys from all dictionaries (`sub.`, `pay.` admin-payment keys, `slot`, `edit.left`).

- [ ] **Step 6: Run the test and the gate**

Run: `cd backend && node --import tsx --test tests/verification.test.ts` → PASS.
Run: `npm test && npm run typecheck && npm run build` → PASS.

- [ ] **Step 7: Strike the removed rules from CLAUDE.md**

Delete the sections "Slots and subscription", "Editing a published product", "Nothing goes live until an admin publishes it" and the ₹50-proof paragraphs. Add a section "Verification, once" that says what Step 3 says in its comments.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Make selling free and verify each farmer once

No subscription, packs, slots or payment-proof queue. A farmer is
PENDING_VERIFICATION after registering; one admin check makes him
ACTIVE, and from then on a listing goes on sale when he sends it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Rename seller to farmer everywhere

**Files:**
- Modify: every file under `shared/src`, `backend/src`, `backend/scripts`, `backend/tests`, `frontend/src`, `frontend/tests`, `admin/src`, `admin/tests`, plus `CLAUDE.md` and `docs/*.md`
- Rename: files whose names contain `seller`/`Seller`/`womenbiz`

**Interfaces:**
- Consumes: Task 3 tree.
- Produces: `Farmer`, `FarmerStatus`, `PublicFarmer`, `farmerId`, `db.farmers`, the Firestore collection `farmers`, `FARMER_ACTIONS`, `farmerCode` (was `womenBizId`), `makeFarmerCode(villageMr, existing)`, `parseFarmerCode(code)`, `shared/src/farmer.ts`, `shared/src/farmerCode.ts`, routes `/api/farmers/*`, frontend `/farmer/*` and `/shop/farmer/:farmerId`, `frontend/src/screens/farmer/`.

- [ ] **Step 1: Rename paths**

```bash
cd /e/Farmer_to_consumer_website
for f in $(git ls-files shared backend frontend admin | grep -iE 'seller|womenbiz'); do
  n=$(echo "$f" | sed -e 's/Seller/Farmer/g; s/seller/farmer/g; s/womenbiz/farmerCode/g')
  mkdir -p "$(dirname "$n")"; git mv "$f" "$n"
done
```

- [ ] **Step 2: Rename identifiers and text (case-preserving)**

```bash
git ls-files shared backend frontend admin CLAUDE.md docs | grep -E '\.(ts|tsx|md|css|json)$' | grep -v package-lock | \
  xargs sed -i -e 's/womenBizId/farmerCode/g; s/WomenBizId/FarmerCode/g; s/womenbiz/farmerCode/g' \
               -e 's/womenEarned/farmersEarned/g; s/womenWithFirstEarning/farmersWithFirstEarning/g' \
               -e 's/Seller/Farmer/g; s/seller/farmer/g; s/SELLER/FARMER/g'
```
Do not run this over the spec or this plan: `docs/superpowers/` must be excluded. Restore those two paths with `git checkout -- docs/superpowers` right after.

- [ ] **Step 3: Make the farmer code F2C-…-NNN**

In `shared/src/farmerCode.ts`:
```ts
export function makeFarmerCode(villageMr: string, existingIds: string[]): string {
  const code = villageCode(villageMr)
  const prefix = `F2C-${code}-`
  const used = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n))
  const next = (used.length ? Math.max(...used) : 0) + 1
  return `${prefix}${String(next).padStart(3, '0')}`
}

export function parseFarmerCode(id: string): { village: string; serial: number } | null {
  const m = /^F2C-([A-Z]+)-(\d{3,})$/.exec(id || '')
  if (!m) return null
  return { village: m[1], serial: parseInt(m[2], 10) }
}
```
Update `backend/tests/villages.test.ts` expectations from `SMB-ANADUR-01` to `F2C-ANADUR-001` and `SMB-` to `F2C-`.

- [ ] **Step 4: Fix what sed cannot**

Run `npm run typecheck` and fix each error. The known ones:
- `farmerMayDelete`, `FarmerGroup`, `callerFarmerId` compile as they are; check that imports match the renamed files.
- Old UTR/UPI comments that say "her" stay; they are comments.
- `frontend/src/lib/tours.ts` and `productDraft.ts` storage keys become `wb.draft.product.<farmerId>`. That is a new site, so nothing needs migrating.

Run: `grep -rn "SMB\|Shantai\|shantai\|womenBiz" shared backend frontend admin --include=*.ts --include=*.tsx`
Expected: only `app.name` strings and the logo alt text remain; Task 14 replaces those.

- [ ] **Step 5: Gate**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS with the same test count as after Task 3.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Rename seller to farmer across code, routes, collections and docs

Mechanical, case-preserving rename. The farmer code becomes
F2C-<VILLAGE>-<NNN>, per village as before.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Phone + password authentication and admin password reset

**Files:**
- Create: `shared/src/password.ts`, `backend/src/auth/credentials.ts`, `backend/tests/password-auth.test.ts`, `frontend/src/screens/auth/ChangePassword.tsx`
- Delete: `backend/src/services/otp.service.ts`, `backend/src/services/otp.providers.ts`, `backend/src/auth/tickets.ts`, `frontend/src/lib/msg91Widget.ts`, `frontend/src/lib/registerTicket.ts`, `backend/tests/otp.test.ts`, `backend/tests/otp-widget.test.ts`, `frontend/tests/msg91-widget.test.ts`
- Modify: `backend/src/auth/types.ts`, `backend/src/auth/rateLimit.ts`, `backend/src/routes/auth.routes.ts`, `backend/src/routes/farmers.routes.ts`, `backend/src/routes/customers.routes.ts`, `backend/src/routes/uploads.routes.ts`, `backend/src/routes/admin.routes.ts`, `backend/src/middleware/auth.ts`, `backend/src/db/seed.ts`, `backend/src/db/firestore.ts`, `backend/src/db/accountClose.ts`, `backend/src/config.ts`, `shared/src/orderFlow.ts` (comment only), `frontend/src/screens/auth/Auth.tsx`, `frontend/src/screens/auth/FarmerRegister.tsx`, `frontend/src/screens/auth/CustomerRegister.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/api.ts`, `frontend/src/lib/upload.ts`, `frontend/src/store/AuthContext.tsx`, `frontend/src/components/ui.tsx` (delete `OtpInput`), `admin/src/lib/api.ts`, `admin/src/screens/FarmerDetail.tsx`, `admin/src/screens/Buyers*` (wherever a customer row is shown), all dictionaries, `backend/.env.example`, `frontend/.env.example`

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword`, `burnPasswordTime`, `randomCode` from `backend/src/auth/crypto.ts`; `createSession`, `revokeAllForUser` from `sessions.ts`; `normalizePhone`, `isValidPhone` from `@shared/farmer.js`.
- Produces:
  - `shared/src/password.ts`: `MIN_PASSWORD = 6`, `passwordProblemMr(pw: string): string | null`
  - `backend/src/auth/credentials.ts`: `interface Credential { id; role: 'farmer'|'customer'; userId; phone; passwordHash; mustChangePassword?: boolean; updatedAt }`, `findCredential(db, role, phone)`, `setCredential(db, {role,userId,phone,password,mustChange?})`, `checkPassword(db, role, phone, password): Credential | null`, `removeCredential(db, userId)`
  - `Db.credentials: Credential[]`
  - `POST /api/auth/login { phone, password, role }` → `{ session, mustChangePassword }`
  - `POST /api/auth/password { current, next }` → `{ ok: true }`
  - `POST /api/farmers/register` body gains `phone`, `password`; no ticket
  - `POST /api/customers/register { phone, name, password }` → `{ session }`
  - `POST /api/admin/users/reset-password { role, userId }` → `{ tempPassword }`
  - `LIMITS.loginPerPhone = { max: 5, windowMs: 15 min }`, `LIMITS.loginPerIp = { max: 50, windowMs: 60 min }`
  - `Session.mustChangePassword?: boolean`; middleware answers 403 `{ error: 'Password change required', code: 'MUST_CHANGE_PASSWORD' }` on every farmer/customer route except `/auth/password` and `/auth/logout`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/password-auth.test.ts`:
```ts
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { emptyDb } = await import('../src/db/seed.js')
const { setCredential, checkPassword, findCredential, removeCredential } =
  await import('../src/auth/credentials.js')
const { passwordProblemMr, MIN_PASSWORD } = await import('@shared/password.js')
const { hit, LIMITS, resetAllLimits } = await import('../src/auth/rateLimit.js')

/**
 * No SMS, so the password is the whole proof of who is signing in. It is
 * stored apart from the farmer and customer rows because those rows are
 * sent to their owners' phones whole; a hash on them would travel too.
 */

let db = emptyDb()
beforeEach(() => { db = emptyDb(); resetAllLimits() })

test('six digits are enough; five are not', () => {
  assert.equal(MIN_PASSWORD, 6)
  assert.equal(passwordProblemMr('123456'), null, 'a PIN is what a farmer remembers')
  assert.ok(passwordProblemMr('12345'))
  assert.ok(passwordProblemMr(' 123456'), 'a leading space is a typo nobody can see')
})

test('the right password signs in; the wrong one does not', () => {
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '482913' })
  assert.equal(checkPassword(db, 'farmer', '9822011223', '482913')?.userId, 'f1')
  assert.equal(checkPassword(db, 'farmer', '9822011223', '482914'), null)
})

test('a phone typed with +91 and spaces is the same account', () => {
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '482913' })
  assert.equal(checkPassword(db, 'farmer', '+91 98220 11223', '482913')?.userId, 'f1')
})

test('a farmer password does not open a buyer account on the same phone', () => {
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '482913' })
  assert.equal(checkPassword(db, 'customer', '9822011223', '482913'), null)
})

test('the hash is never the password', () => {
  setCredential(db, { role: 'customer', userId: 'c-9822011223', phone: '9822011223', password: '482913' })
  const row = findCredential(db, 'customer', '9822011223')!
  assert.ok(row.passwordHash.startsWith('scrypt$'))
  assert.ok(!row.passwordHash.includes('482913'))
})

test('setting a password again replaces it rather than adding a row', () => {
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '482913' })
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '111222', mustChange: true })
  assert.equal(db.credentials.length, 1)
  assert.equal(db.credentials[0].mustChangePassword, true)
  assert.equal(checkPassword(db, 'farmer', '9822011223', '482913'), null)
})

test('closing an account removes its credential', () => {
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '482913' })
  removeCredential(db, 'f1')
  assert.equal(db.credentials.length, 0)
})

test('five wrong guesses per phone, then a wait', () => {
  assert.deepEqual(LIMITS.loginPerPhone, { max: 5, windowMs: 15 * 60 * 1000 })
  for (let i = 0; i < 5; i++) assert.ok(hit('login:phone:9822011223', LIMITS.loginPerPhone).ok)
  assert.equal(hit('login:phone:9822011223', LIMITS.loginPerPhone).ok, false)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --import tsx --test tests/password-auth.test.ts`
Expected: FAIL — `Cannot find module '../src/auth/credentials.js'`.

- [ ] **Step 3: Implement the shared rule**

`shared/src/password.ts`:
```ts
/**
 * THE PASSWORD RULE, ON BOTH SIDES.
 *
 * Six characters, and digits alone are fine. A farmer who has never had a
 * password remembers a number - a PIN, a date - and a composition rule
 * would only push him to write it on the phone's back cover. Five tries per
 * fifteen minutes is what makes six digits enough.
 */
export const MIN_PASSWORD = 6

export function passwordProblemMr(password: string): string | null {
  const pw = String(password ?? '')
  if (/^\s|\s$/.test(pw)) return 'पासवर्डच्या सुरुवातीला किंवा शेवटी जागा नको'
  if (pw.length < MIN_PASSWORD) return `पासवर्ड किमान ${MIN_PASSWORD} अक्षरे किंवा अंक असावा`
  return null
}
```

- [ ] **Step 4: Implement the credential store**

`backend/src/auth/types.ts` — add:
```ts
/**
 * A phone number's password, for one role. Never on the Farmer or Customer
 * row, because those rows travel whole to their owner's phone.
 */
export interface Credential {
  id: string
  role: 'farmer' | 'customer'
  userId: string
  phone: string
  passwordHash: string
  /** Set by an admin reset: the next sign-in must choose a new password. */
  mustChangePassword?: boolean
  updatedAt: string
}
```
`backend/src/auth/credentials.ts`:
```ts
import type { Db } from '../db/seed.js'
import { normalizePhone } from '@shared/farmer.js'
import { newId } from '../db/ids.js'
import { burnPasswordTime, hashPassword, verifyPassword } from './crypto.js'
import type { Credential } from './types.js'

export function findCredential(db: Db, role: Credential['role'], phone: string): Credential | undefined {
  const p = normalizePhone(phone)
  return db.credentials.find((c) => c.role === role && c.phone === p)
}

export function setCredential(
  db: Db,
  input: { role: Credential['role']; userId: string; phone: string; password: string; mustChange?: boolean },
  now = Date.now(),
): Credential {
  const phone = normalizePhone(input.phone)
  const existing = findCredential(db, input.role, phone)
  const row: Credential = existing ?? {
    id: newId('cred'), role: input.role, userId: input.userId, phone, passwordHash: '', updatedAt: '',
  }
  row.userId = input.userId
  row.passwordHash = hashPassword(input.password)
  row.mustChangePassword = input.mustChange || undefined
  row.updatedAt = new Date(now).toISOString()
  if (!existing) db.credentials.push(row)
  return row
}

/**
 * The credential if the password is right, else null. An unknown phone
 * still pays for a scrypt hash, so response time does not say which phones
 * have accounts.
 */
export function checkPassword(db: Db, role: Credential['role'], phone: string, password: string): Credential | null {
  const row = findCredential(db, role, phone)
  if (!row) { burnPasswordTime(password); return null }
  return verifyPassword(password, row.passwordHash) ? row : null
}

export function removeCredential(db: Db, userId: string): void {
  const i = db.credentials.findIndex((c) => c.userId === userId)
  if (i >= 0) db.credentials.splice(i, 1)
}
```
`backend/src/db/seed.ts`: add `credentials: Credential[]` to `Db`, to `emptyDb()` (`credentials: []`) and to `withDefaults` (`credentials: raw.credentials ?? []`). `backend/src/db/firestore.ts`: add `'credentials'` to the collection list. `backend/src/auth/rateLimit.ts`: delete the four `otp*` limits and add:
```ts
  /** Wrong passwords for one phone: five, then fifteen minutes. */
  loginPerPhone: { max: 5, windowMs: 15 * 60 * 1000 },
  /** Wider per IP: a village shares its carrier's address. */
  loginPerIp: { max: 50, windowMs: 60 * 60 * 1000 },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && node --import tsx --test tests/password-auth.test.ts` → PASS.

- [ ] **Step 6: Replace the OTP routes with login and password change**

In `backend/src/routes/auth.routes.ts`, delete `/otp/send`, `/otp/verify`, `otpRejected`, and the imports of `issueTicket`, `sendOtp`, `verifyOtp`. Keep `retryInMr`, `over`, `/logout`, `/sessions`, `/admin/login`. Add:
```ts
authRouter.post('/login', (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ''))
  const password = String(req.body?.password ?? '')
  const role = req.body?.role === 'farmer' ? 'farmer' : 'customer'
  const ip = hashIp(callerIp(req))
  const db = getDb()
  const deny = () => res.status(401).json({
    error: 'Bad credentials', messageMr: 'मोबाईल नंबर किंवा पासवर्ड चुकीचा आहे',
  })

  if (!isValidPhone(phone) || !password) { deny(); return }
  if (over(res, `login:ip:${ip}`, LIMITS.loginPerIp)) return
  if (over(res, `login:phone:${phone}`, LIMITS.loginPerPhone)) {
    recordAuthEvent(db, { type: 'ratelimit', subject: maskPhone(phone), ip, detail: 'login' })
    save()
    return
  }

  const cred = checkPassword(db, role, phone, password)
  const farmer = cred && role === 'farmer' ? db.farmers.find((f) => f.id === cred.userId) : undefined
  const customer = cred && role === 'customer' ? findCustomer(db, cred.userId) : undefined
  if (!cred || (!farmer && !customer)) {
    recordAuthEvent(db, { type: 'login.fail', subject: maskPhone(phone), role, ip })
    save()
    deny()
    return
  }
  clearLimit(`login:phone:${phone}`)

  const session = createSession(db, {
    role, userId: cred.userId, phone,
    farmerId: farmer?.id, customerId: customer?.id,
    client: describeClient(req.headers['user-agent']),
  })
  recordAuthEvent(db, { type: 'session.start', subject: maskPhone(phone), role, ip, sessionId: session.id })
  save()

  res.json({
    mustChangePassword: !!cred.mustChangePassword,
    session: {
      token: signToken({ sid: session.id, role }),
      role, userId: cred.userId, phone,
      name: farmer?.name ?? customer?.name,
      farmerId: farmer?.id, customerId: customer?.id,
      mustChangePassword: !!cred.mustChangePassword,
    },
  })
})

authRouter.post('/password', requireRole('farmer', 'customer'), (req, res) => {
  const auth = req.auth!
  const db = getDb()
  const role = auth.role as 'farmer' | 'customer'
  const next = String(req.body?.next ?? '')
  const problem = passwordProblemMr(next)
  if (problem) { res.status(400).json({ error: 'Weak password', messageMr: problem, fields: { next: problem } }); return }

  const cred = checkPassword(db, role, auth.phone ?? '', String(req.body?.current ?? ''))
  if (!cred) { res.status(401).json({ error: 'Bad credentials', messageMr: 'जुना पासवर्ड चुकीचा आहे' }); return }

  setCredential(db, { role, userId: cred.userId, phone: cred.phone, password: next })
  // Every other phone signed in as this person is signed out: a password
  // is changed because someone else may know the old one.
  revokeAllForUser(db, cred.userId, 'password-change', auth.sessionId)
  save()
  res.json({ ok: true })
})
```
Check that `revokeAllForUser` accepts a session id to keep. If its signature is `(db, userId, reason)` only, add an optional `exceptId?: string` parameter and skip that id inside the loop.

Add `'login.fail'` to the `AuthEvent['type']` union in `auth/types.ts`.

- [ ] **Step 7: Enforce must-change in middleware**

In `backend/src/middleware/auth.ts`, inside `requireRole` after the role check:
```ts
    if ((req.auth.role === 'farmer' || req.auth.role === 'customer')
        && req.auth.mustChangePassword
        && !['/api/auth/password', '/api/auth/logout'].includes(req.originalUrl.split('?')[0])) {
      res.status(403).json({
        error: 'Password change required', code: 'MUST_CHANGE_PASSWORD',
        messageMr: 'आधी नवा पासवर्ड ठेवा',
      })
      return
    }
```
In `attachAuth`, set `req.auth.mustChangePassword = !!db.credentials.find(c => c.userId === session.userId)?.mustChangePassword`. Add `mustChangePassword?: boolean` to `AuthContext`.

- [ ] **Step 8: Register with a password**

`farmers.routes.ts` `POST /register`: delete the ticket block. Read `phone` and `password` from the body. Validate `isValidPhone(phone)` and `passwordProblemMr(password)` into `fields.phone` / `fields.password`. Keep the `registerPerIp` limit and the 409 for a phone already in `db.farmers`. After pushing the farmer:
```ts
  setCredential(db, { role: 'farmer', userId: farmer.id, phone, password: String(b.password) })
```
then create the session exactly as the old code did.

`customers.routes.ts`: add `POST /register` (public, `registerPerIp` limited):
```ts
customersRouter.post('/register', (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ''))
  const name = String(req.body?.name ?? '').trim()
  const password = String(req.body?.password ?? '')
  const fields: Record<string, string> = {}
  if (!isValidPhone(phone)) fields.phone = '10 अंकी मोबाईल नंबर टाका'
  if (!name) fields.name = 'नाव आवश्यक आहे'
  const pw = passwordProblemMr(password); if (pw) fields.password = pw
  if (Object.keys(fields).length) { res.status(400).json({ error: 'Validation failed', messageMr: 'माहिती तपासा', fields }); return }

  const db = getDb()
  if (findCredential(db, 'customer', phone)) {
    res.status(409).json({ error: 'Already registered', messageMr: 'हा नंबर आधीच नोंदणीकृत आहे. लॉगिन करा.' }); return
  }
  const customer = ensureCustomer(db, phone, name)
  setCredential(db, { role: 'customer', userId: customer.id, phone, password })
  const session = createSession(db, { role: 'customer', userId: customer.id, phone, customerId: customer.id,
    client: describeClient(req.headers['user-agent']) })
  save()
  res.json({ session: { token: signToken({ sid: session.id, role: 'customer' }), role: 'customer',
    userId: customer.id, phone, customerId: customer.id, name } })
})
```
(`ensureCustomer(db, phone, name)` already exists in `db/customers.ts`; check its argument order there before calling it.) Delete the old name-only `/me/name` registration route if the new register route replaces it.

`uploads.routes.ts`: a ticket allowed an upload during registration. Replace it: registration photos are uploaded *after* the account exists (the wizard now creates the account before the UPI-QR step), so signature requests need a farmer session. Delete the ticket branch.

`accountClose.ts`: call `removeCredential(db, id)` in the scrub for both farmers and customers.

`config.ts`: delete `MSG91_*`, the OTP demo mode and the "production refuses the server-side OTP path" check. Keep `SESSION_SECRET` required in production.

- [ ] **Step 9: Admin reset**

In `admin.routes.ts`:
```ts
adminRouter.post('/users/reset-password', (req, res) => {
  const db = getDb()
  const role = req.body?.role === 'farmer' ? 'farmer' : 'customer'
  const userId = String(req.body?.userId ?? '')
  const person = role === 'farmer' ? db.farmers.find((f) => f.id === userId) : findCustomer(db, userId)
  if (!person || !person.phone) { res.status(404).json({ error: 'Not found', messageMr: 'खाते सापडले नाही' }); return }

  // Six digits the admin reads out over the phone. Shown once, never stored
  // in the clear, and useless after the first sign-in because it must be changed.
  const tempPassword = randomCode(6)
  setCredential(db, { role, userId, phone: person.phone, password: tempPassword, mustChange: true })
  revokeAllForUser(db, userId, 'admin')
  recordAuthEvent(db, { type: 'password.reset', subject: maskPhone(person.phone), role, detail: adminName(req) })
  save()
  res.json({ tempPassword })
})
```
Add `'password.reset'` to the `AuthEvent` type union.

- [ ] **Step 10: Frontend**

- `lib/api.ts`: delete `sendOtp`/`verifyOtp`. Add:
  ```ts
  login: (phone: string, password: string, role: 'farmer' | 'customer') =>
    post<{ session: Session; mustChangePassword: boolean }>('/auth/login', { phone, password, role }),
  changePassword: (current: string, next: string) => post<{ ok: true }>('/auth/password', { current, next }),
  registerCustomer: (body: { phone: string; name: string; password: string }) =>
    post<{ session: Session }>('/customers/register', body),
  ```
  In `request()`, when `res.status === 403 && body.code === 'MUST_CHANGE_PASSWORD'`, call every `mustChangeListeners` fn (a new listener set exported as `onMustChangePassword(fn)`, same pattern as `onSessionExpired`).
- `shared/src/types.ts` `Session`: add `mustChangePassword?: boolean`.
- `store/AuthContext.tsx`: subscribe to `onMustChangePassword` and set `session.mustChangePassword = true`.
- `App.tsx`: replace `/join/:role`, `/login/:role`, `/otp/:role` with `/login/:role` → `<LoginScreen />`. Keep `/register/farmer` and `/register/customer`. Add `/password` → `<ChangePassword />`. In `Require`, when `session.mustChangePassword` is true and the path is not `/password`, return `<Navigate to="/password" replace />`.
- `screens/auth/Auth.tsx`: replace `PhoneScreen` and `OtpScreen` with one `LoginScreen`:
  ```tsx
  export function LoginScreen() {
    const t = useT()
    const nav = useNavigate()
    const role = roleFrom(useParams().role)
    const { signIn, session } = useAuth()
    const [phone, setPhone] = useState('')
    const [password, setPassword] = useState('')
    const [show, setShow] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    if (session?.role === role) return <Navigate to={homeFor(role)} replace />

    const submit = async () => {
      setBusy(true); setError(null)
      try {
        const r = await api.login(phone, password, role)
        signIn(r.session)
        nav(r.mustChangePassword ? '/password' : homeFor(role), { replace: true })
      } catch (e) {
        setError(e instanceof ApiError ? e.messageMr ?? t('auth.failed') : t('auth.failed'))
      } finally { setBusy(false) }
    }

    return (
      <div className="screen">
        <AppBar title={t(role === 'farmer' ? 'auth.loginFarmer' : 'auth.loginBuyer')} back />
        <Field label={t('auth.phone')}>
          <TextInput inputMode="numeric" autoComplete="tel" maxLength={14} value={phone}
            onChange={setPhone} placeholder={t('auth.phonePh')} />
        </Field>
        <Field label={t('auth.password')}>
          <TextInput type={show ? 'text' : 'password'} autoComplete="current-password"
            value={password} onChange={setPassword} placeholder={t('auth.passwordPh')} />
        </Field>
        <Button tone="ghost" onClick={() => setShow(!show)}>{t(show ? 'auth.hide' : 'auth.show')}</Button>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button onClick={submit} disabled={busy || !isValidPhone(phone) || password.length < MIN_PASSWORD}>
          {t('auth.login')}
        </Button>
        <p className="body">{t('auth.forgot')}</p>
        <a className="btn btn--ghost" href={`tel:+91${SUPPORT_PHONE}`}><IconCall aria-hidden="true" /> {t('help.call')}</a>
        <Button tone="ghost" onClick={() => nav(`/register/${role}`)}>{t('auth.newAccount')}</Button>
      </div>
    )
  }
  ```
  Keep `roleFrom`, but change its values to `'farmer' | 'customer'`. Check the `TextInput` prop names (`onChange` gets a string or an event) against `components/ui.tsx:217` and match them.
- `screens/auth/ChangePassword.tsx`: the same shape with three fields (current, new, new again). Call `api.changePassword`. On success, set `session.mustChangePassword = false` through `AuthContext` and go to `homeFor(role)`. After an admin reset, "current" is the temporary password; label it `auth.currentOrTemp` ("सध्याचा किंवा दिलेला तात्पुरता पासवर्ड").
- `FarmerRegister.tsx`: the first step becomes phone + password + password again (validated with `isValidPhone` and `passwordProblemMr`, and the two passwords must match: `auth.mismatch`). Send `phone` and `password` in `api.registerFarmer`. Delete ticket reading.
- `CustomerRegister.tsx`: one screen with name, phone, password, password again, calling `api.registerCustomer`.
- `Landing.tsx`: the four entry buttons go to `/register/farmer`, `/login/farmer`, `/register/customer`, `/login/customer`.
- Dictionaries: add `auth.phone`, `auth.phonePh`, `auth.password`, `auth.passwordPh`, `auth.passwordAgain`, `auth.show`, `auth.hide`, `auth.login`, `auth.loginFarmer`, `auth.loginBuyer`, `auth.forgot` ("पासवर्ड विसरलात? मदत केंद्राला फोन करा, ते नवा पासवर्ड देतील." / "Forgot your password? Call the help desk and they will give you a new one."), `auth.newAccount`, `auth.failed`, `auth.mismatch`, `auth.currentOrTemp`, `auth.newPassword`, `auth.changeTitle`. Delete every `otp.` key.
- Admin `FarmerDetail.tsx` and the customer detail panel: a "Reset password" button behind `Confirm` (consequence: "Their current password stops working and every phone they are signed in on is signed out."). After confirming, show `tempPassword` in large digits with a copy button and the line "Read this to them. They must choose a new one when they sign in."

- [ ] **Step 11: Delete OTP files and gate**

```bash
git rm backend/src/services/otp.service.ts backend/src/services/otp.providers.ts backend/src/auth/tickets.ts \
  frontend/src/lib/msg91Widget.ts frontend/src/lib/registerTicket.ts \
  backend/tests/otp.test.ts backend/tests/otp-widget.test.ts frontend/tests/msg91-widget.test.ts
```
In `backend/tests/auth-hardening.test.ts`, delete the ticket cases. In `backend/tests/customer-registration.test.ts`, rewrite the cases around `POST /customers/register`.
Run: `npm test && npm run typecheck && npm run build` → PASS.

- [ ] **Step 12: Update CLAUDE.md "Sessions"**

Replace the OTP, MSG91, ticket and three-codes-a-day paragraphs with: the password rule, the credential collection and why it is separate, the login limits, must-change, and admin reset.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "Sign in with phone and password; admins reset forgotten ones

No SMS provider. Passwords are scrypt hashes in their own credentials
collection, never on the farmer or customer row. Five wrong tries per
phone per 15 minutes. An admin reset issues a six-digit temporary
password, signs the person out everywhere, and forces a change.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Farmer profile, registration wizard, location and FDRI

**Files:**
- Create: `shared/src/fdri.ts`, `shared/src/profile.ts`, `shared/src/crops.ts`, `shared/src/geo.ts`, `backend/tests/fdri.test.ts`, `backend/tests/geo.test.ts`
- Delete: `shared/src/readiness.ts`
- Modify: `shared/src/types.ts`, `shared/src/index.ts`, `shared/src/accountClose.ts` (`FARMER_PII_FIELDS`), `backend/src/routes/farmers.routes.ts`, `backend/src/db/publicFarmer.ts`, `backend/src/db/seed.ts`, `backend/src/db/analytics.ts`, `backend/src/routes/admin.routes.ts`, `backend/tests/public-farmer.test.ts`, `frontend/src/screens/auth/FarmerRegister.tsx`, `frontend/src/screens/auth/farmerDraft.ts`, `frontend/src/screens/farmer/EditProfile.tsx`, `frontend/src/screens/farmer/Misc.tsx`, `frontend/src/components/ui.tsx` (readiness badge), `admin/src/screens/{Farmers,FarmerDetail,Today}.tsx`, dictionaries

**Interfaces:**
- Consumes: `Farmer` from Task 4.
- Produces:
  - `fdri.ts`: `FDRI_INDICATORS` (readonly tuple of 10 keys), `type FdriIndicator`, `type FdriAnswers = Record<FdriIndicator, boolean>`, `type FdriBand = 'low'|'moderate'|'high'`, `FDRI_QUESTIONS: Record<FdriIndicator,{mr:string;en:string;hi:string}>`, `cleanFdri(raw: unknown): FdriAnswers`, `fdriScore(a: Partial<FdriAnswers>): number`, `fdriBand(score: number): FdriBand`
  - `profile.ts`: `AGE_GROUPS`, `EDUCATION_LEVELS` (moved from farmer.ts), `LANDHOLDINGS`, `FARMER_TYPES`, `SELLING_CHANNELS`, `SELLING_PROBLEMS` — each `{ value: string; mr: string; en: string; hi: string }[]` — and `type AgeGroup`, `Landholding`, `FarmerType`, `SellingChannel`, `SellingProblem`
  - `crops.ts`: `CROPS: { id: string; categoryId: string; mr: string; en: string; hi: string; agmarknet?: string }[]`, `cropById(id)`
  - `geo.ts`: `isValidLatLng(lat, lng): boolean` (India bounding box 6–38 N, 68–98 E), `roundCoord(n: number, places = 2): number`, `publicLocation(p: {lat?: number; lng?: number; locationConsent?: boolean}): {lat:number;lng:number} | undefined`
  - `Farmer` fields: `lat?`, `lng?`, `locationConsent?`, `crops: string[]`, `ageGroup?`, `education?`, `landholding?`, `farmerTypes: FarmerType[]`, `sellingChannels: SellingChannel[]`, `problems: SellingProblem[]`, `fdri: FdriAnswers`, `fdriScore: number`, `fdriBand: FdriBand`. Removed: `digital`, `readinessScore`, `readinessBand`, `businessType`, `shgName`, `yearsInBusiness`, `monthlyCapacity`, `sellsFood`, `fssai`, `age`.
  - `PublicFarmer` adds `farmerCode` (already), `crops`, `lat?`, `lng?` (rounded), `pickup` (Task 8 fills it)
  - `PATCH /api/farmers/me/location { lat, lng } | { clear: true }`

- [ ] **Step 1: Write the failing tests**

`backend/tests/fdri.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FDRI_INDICATORS, cleanFdri, fdriBand, fdriScore } from '@shared/fdri.js'

/**
 * The Farmer Digital Readiness Index from the research paper, section 10:
 * ten yes/no indicators, one mark each. The same function scores a farmer
 * who registered and a questionnaire a coordinator typed in, so the two
 * populations can be compared in one table.
 */

test('ten indicators, in the paper\'s order', () => {
  assert.deepEqual([...FDRI_INDICATORS], [
    'smartphone', 'internet', 'whatsapp', 'digitalPayment', 'onlineMarketInfo',
    'digitalPromotion', 'onlineSelling', 'directSelling', 'packagingBranding', 'trainingWillingness',
  ])
})

test('one mark per yes', () => {
  assert.equal(fdriScore({}), 0)
  assert.equal(fdriScore({ smartphone: true, whatsapp: true, digitalPayment: true }), 3)
  assert.equal(fdriScore(Object.fromEntries(FDRI_INDICATORS.map((k) => [k, true]))), 10)
})

test('bands break at 3/4 and 7/8', () => {
  assert.equal(fdriBand(0), 'low')
  assert.equal(fdriBand(3), 'low')
  assert.equal(fdriBand(4), 'moderate')
  assert.equal(fdriBand(7), 'moderate')
  assert.equal(fdriBand(8), 'high')
  assert.equal(fdriBand(10), 'high')
})

test('anything that is not literally true is a no', () => {
  const a = cleanFdri({ smartphone: 'yes', internet: 1, whatsapp: true, extra: true })
  assert.equal(a.smartphone, false)
  assert.equal(a.internet, false)
  assert.equal(a.whatsapp, true)
  assert.equal(Object.keys(a).length, 10, 'unknown keys are dropped')
})
```
`backend/tests/geo.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidLatLng, publicLocation, roundCoord } from '@shared/geo.js'

/**
 * A farm is somebody's home. Buyers see where to go to within about a
 * kilometre; the exact point stays with the farmer and the admin.
 */

test('Anadur is a valid point; zero-zero and Europe are not', () => {
  assert.equal(isValidLatLng(17.9936, 76.2336), true)
  assert.equal(isValidLatLng(0, 0), false)
  assert.equal(isValidLatLng(48.85, 2.35), false)
  assert.equal(isValidLatLng(NaN, 76), false)
})

test('public points are rounded to two decimals', () => {
  assert.equal(roundCoord(17.99364), 17.99)
  assert.deepEqual(publicLocation({ lat: 17.99364, lng: 76.23361, locationConsent: true }), { lat: 17.99, lng: 76.23 })
})

test('no consent, no point', () => {
  assert.equal(publicLocation({ lat: 17.99, lng: 76.23, locationConsent: false }), undefined)
  assert.equal(publicLocation({ locationConsent: true }), undefined)
})
```
Add to `backend/tests/public-farmer.test.ts`: the exact key set now includes `crops`, `lat`, `lng`, and excludes `phone`, `fdri`, `fdriScore`, `ageGroup`, `landholding`. Also add a case where the farmer has `lat: 17.99364` and the result has `17.99`.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --import tsx --test tests/fdri.test.ts tests/geo.test.ts tests/public-farmer.test.ts`
Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Implement fdri.ts**

```ts
/**
 * FARMER DIGITAL READINESS INDEX (FDRI)
 * =====================================
 * From the research paper, section 10. Ten indicators, one mark each, out
 * of ten. Asked as ten yes/no taps at registration and on the survey form,
 * and stored per indicator so any one of them can be tabulated alone.
 */
export const FDRI_INDICATORS = [
  'smartphone', 'internet', 'whatsapp', 'digitalPayment', 'onlineMarketInfo',
  'digitalPromotion', 'onlineSelling', 'directSelling', 'packagingBranding', 'trainingWillingness',
] as const

export type FdriIndicator = (typeof FDRI_INDICATORS)[number]
export type FdriAnswers = Record<FdriIndicator, boolean>
export type FdriBand = 'low' | 'moderate' | 'high'

export const FDRI_QUESTIONS: Record<FdriIndicator, { mr: string; en: string; hi: string }> = {
  smartphone: { mr: 'तुमच्याकडे स्मार्टफोन आहे का?', en: 'Do you have a smartphone?', hi: 'क्या आपके पास स्मार्टफोन है?' },
  internet: { mr: 'तुम्ही इंटरनेट वापरता का?', en: 'Do you use the internet?', hi: 'क्या आप इंटरनेट चलाते हैं?' },
  whatsapp: { mr: 'तुम्ही WhatsApp वापरता का?', en: 'Do you use WhatsApp?', hi: 'क्या आप WhatsApp चलाते हैं?' },
  digitalPayment: { mr: 'तुम्ही UPI / ऑनलाइन पैसे पाठवता किंवा घेता का?', en: 'Do you send or receive money by UPI?', hi: 'क्या आप UPI से पैसे भेजते या लेते हैं?' },
  onlineMarketInfo: { mr: 'बाजारभाव फोनवर पाहता का?', en: 'Do you check market prices on your phone?', hi: 'क्या आप फ़ोन पर मंडी भाव देखते हैं?' },
  digitalPromotion: { mr: 'तुमच्या मालाची माहिती फोनवरून इतरांना पाठवता का?', en: 'Do you advertise your produce from your phone?', hi: 'क्या आप फ़ोन से अपनी उपज का प्रचार करते हैं?' },
  onlineSelling: { mr: 'याआधी ऑनलाइन काही विकले आहे का?', en: 'Have you ever sold anything online?', hi: 'क्या आपने पहले कभी ऑनलाइन कुछ बेचा है?' },
  directSelling: { mr: 'ग्राहकाला थेट माल विकायला तयार आहात का?', en: 'Are you willing to sell directly to buyers?', hi: 'क्या आप सीधे ग्राहक को बेचने को तैयार हैं?' },
  packagingBranding: { mr: 'माल पॅक करून, स्वतःच्या नावाने विकायला तयार आहात का?', en: 'Are you ready to pack and brand your produce?', hi: 'क्या आप उपज को पैक करके अपने नाम से बेचने को तैयार हैं?' },
  trainingWillingness: { mr: 'डिजिटल प्रशिक्षण घ्यायला आवडेल का?', en: 'Would you like digital training?', hi: 'क्या आप डिजिटल प्रशिक्षण लेना चाहेंगे?' },
}

export function cleanFdri(raw: unknown): FdriAnswers {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return Object.fromEntries(FDRI_INDICATORS.map((k) => [k, src[k] === true])) as FdriAnswers
}

export function fdriScore(a: Partial<FdriAnswers>): number {
  return FDRI_INDICATORS.reduce((n, k) => n + (a[k] === true ? 1 : 0), 0)
}

/** 0–3 low · 4–7 moderate · 8–10 high (paper, section 10). */
export function fdriBand(score: number): FdriBand {
  if (score <= 3) return 'low'
  if (score <= 7) return 'moderate'
  return 'high'
}
```

- [ ] **Step 4: Implement geo.ts, profile.ts and crops.ts**

`shared/src/geo.ts`:
```ts
/** Roughly India. A phone that reports 0,0 or a VPN's Europe is not a farm here. */
export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98
}

export function roundCoord(n: number, places = 2): number {
  const f = 10 ** places
  return Math.round(n * f) / f
}

/**
 * What a buyer may see: about a kilometre, and only with the farmer's yes.
 * Two decimals is the village, not the house.
 */
export function publicLocation(p: { lat?: number; lng?: number; locationConsent?: boolean }):
  { lat: number; lng: number } | undefined {
  if (!p.locationConsent || !isValidLatLng(p.lat, p.lng)) return undefined
  return { lat: roundCoord(p.lat!), lng: roundCoord(p.lng!) }
}
```
`shared/src/profile.ts` (values are stored; labels are shown):
```ts
type Opt = { value: string; mr: string; en: string; hi: string }

export const AGE_GROUPS = [
  { value: 'u25', mr: '25 पेक्षा कमी', en: 'Under 25', hi: '25 से कम' },
  { value: '25-35', mr: '25 ते 35', en: '25 to 35', hi: '25 से 35' },
  { value: '36-50', mr: '36 ते 50', en: '36 to 50', hi: '36 से 50' },
  { value: '51-60', mr: '51 ते 60', en: '51 to 60', hi: '51 से 60' },
  { value: 'o60', mr: '60 पेक्षा जास्त', en: 'Over 60', hi: '60 से ज़्यादा' },
] as const satisfies readonly Opt[]

export const LANDHOLDINGS = [
  { value: 'small', mr: 'लहान (2 हेक्टरपेक्षा कमी)', en: 'Small (under 2 ha)', hi: 'छोटा (2 हेक्टेयर से कम)' },
  { value: 'medium', mr: 'मध्यम (2 ते 10 हेक्टर)', en: 'Medium (2 to 10 ha)', hi: 'मध्यम (2 से 10 हेक्टेयर)' },
  { value: 'large', mr: 'मोठे (10 हेक्टरपेक्षा जास्त)', en: 'Large (over 10 ha)', hi: 'बड़ा (10 हेक्टेयर से ज़्यादा)' },
] as const satisfies readonly Opt[]

export const FARMER_TYPES = [
  { value: 'vegetable', mr: 'भाजीपाला', en: 'Vegetables', hi: 'सब्ज़ी' },
  { value: 'grain', mr: 'धान्य', en: 'Grains', hi: 'अनाज' },
  { value: 'fruit', mr: 'फळे', en: 'Fruit', hi: 'फल' },
  { value: 'processing', mr: 'प्रक्रिया उत्पादने', en: 'Processed products', hi: 'प्रसंस्कृत उत्पाद' },
] as const satisfies readonly Opt[]

export const SELLING_CHANNELS = [
  { value: 'trader', mr: 'गावातील व्यापारी', en: 'Local trader', hi: 'गाँव का व्यापारी' },
  { value: 'apmc', mr: 'बाजार समिती (APMC)', en: 'APMC market', hi: 'मंडी (APMC)' },
  { value: 'weekly', mr: 'आठवडी बाजार', en: 'Weekly market', hi: 'हाट बाज़ार' },
  { value: 'direct', mr: 'थेट ग्राहक', en: 'Directly to buyers', hi: 'सीधे ग्राहक' },
  { value: 'online', mr: 'ऑनलाइन / WhatsApp', en: 'Online / WhatsApp', hi: 'ऑनलाइन / WhatsApp' },
] as const satisfies readonly Opt[]

export const SELLING_PROBLEMS = [
  { value: 'lowPrice', mr: 'योग्य भाव मिळत नाही', en: 'Price too low', hi: 'सही दाम नहीं मिलता' },
  { value: 'middlemen', mr: 'दलाल / मध्यस्थ जास्त', en: 'Too many middlemen', hi: 'बिचौलिए ज़्यादा' },
  { value: 'transport', mr: 'वाहतूक खर्च', en: 'Transport cost', hi: 'ढुलाई खर्च' },
  { value: 'storage', mr: 'साठवणूक नाही', en: 'No storage', hi: 'भंडारण नहीं' },
  { value: 'noInfo', mr: 'बाजारभावाची माहिती नाही', en: 'No price information', hi: 'भाव की जानकारी नहीं' },
  { value: 'latePayment', mr: 'पैसे उशिरा मिळतात', en: 'Late payment', hi: 'पैसे देर से मिलते हैं' },
] as const satisfies readonly Opt[]

export type AgeGroup = (typeof AGE_GROUPS)[number]['value']
export type Landholding = (typeof LANDHOLDINGS)[number]['value']
export type FarmerType = (typeof FARMER_TYPES)[number]['value']
export type SellingChannel = (typeof SELLING_CHANNELS)[number]['value']
export type SellingProblem = (typeof SELLING_PROBLEMS)[number]['value']

/** Keep only values that are in the list: a client can send anything. */
export function pick<T extends string>(list: readonly { value: T }[], raw: unknown): T | undefined {
  return list.some((o) => o.value === raw) ? (raw as T) : undefined
}
export function pickMany<T extends string>(list: readonly { value: T }[], raw: unknown): T[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((v) => list.some((o) => o.value === v)))] as T[] : []
}
```
Move `EDUCATION_LEVELS` from `farmer.ts` into `profile.ts`, add an `hi` label to each entry, and re-export nothing from `farmer.ts` (update importers).

`shared/src/crops.ts` — categories match Task 7:
```ts
export interface Crop { id: string; categoryId: string; mr: string; en: string; hi: string; agmarknet?: string }

/**
 * The crops around Anadur first. `agmarknet` is the commodity name the
 * government mandi-price feed uses; a crop without one gets no mandi line.
 */
export const CROPS: Crop[] = [
  { id: 'onion', categoryId: 'vegetables', mr: 'कांदा', en: 'Onion', hi: 'प्याज़', agmarknet: 'Onion' },
  { id: 'tomato', categoryId: 'vegetables', mr: 'टोमॅटो', en: 'Tomato', hi: 'टमाटर', agmarknet: 'Tomato' },
  { id: 'okra', categoryId: 'vegetables', mr: 'भेंडी', en: 'Okra', hi: 'भिंडी', agmarknet: 'Bhindi(Ladies Finger)' },
  { id: 'brinjal', categoryId: 'vegetables', mr: 'वांगी', en: 'Brinjal', hi: 'बैंगन', agmarknet: 'Brinjal' },
  { id: 'potato', categoryId: 'vegetables', mr: 'बटाटा', en: 'Potato', hi: 'आलू', agmarknet: 'Potato' },
  { id: 'chilli', categoryId: 'vegetables', mr: 'हिरवी मिरची', en: 'Green chilli', hi: 'हरी मिर्च', agmarknet: 'Green Chilli' },
  { id: 'methi', categoryId: 'leafy', mr: 'मेथी', en: 'Fenugreek leaves', hi: 'मेथी', agmarknet: 'Methi(Leaves)' },
  { id: 'palak', categoryId: 'leafy', mr: 'पालक', en: 'Spinach', hi: 'पालक', agmarknet: 'Spinach' },
  { id: 'coriander', categoryId: 'leafy', mr: 'कोथिंबीर', en: 'Coriander', hi: 'धनिया', agmarknet: 'Coriander(Leaves)' },
  { id: 'grapes', categoryId: 'fruits', mr: 'द्राक्षे', en: 'Grapes', hi: 'अंगूर', agmarknet: 'Grapes' },
  { id: 'pomegranate', categoryId: 'fruits', mr: 'डाळिंब', en: 'Pomegranate', hi: 'अनार', agmarknet: 'Pomegranate' },
  { id: 'banana', categoryId: 'fruits', mr: 'केळी', en: 'Banana', hi: 'केला', agmarknet: 'Banana' },
  { id: 'mango', categoryId: 'fruits', mr: 'आंबा', en: 'Mango', hi: 'आम', agmarknet: 'Mango' },
  { id: 'jowar', categoryId: 'grains', mr: 'ज्वारी', en: 'Jowar', hi: 'ज्वार', agmarknet: 'Jowar(Sorghum)' },
  { id: 'wheat', categoryId: 'grains', mr: 'गहू', en: 'Wheat', hi: 'गेहूँ', agmarknet: 'Wheat' },
  { id: 'bajra', categoryId: 'grains', mr: 'बाजरी', en: 'Bajra', hi: 'बाजरा', agmarknet: 'Bajra(Pearl Millet/Cumbu)' },
  { id: 'soybean', categoryId: 'pulses', mr: 'सोयाबीन', en: 'Soybean', hi: 'सोयाबीन', agmarknet: 'Soyabean' },
  { id: 'tur', categoryId: 'pulses', mr: 'तूर', en: 'Tur (pigeon pea)', hi: 'तुअर', agmarknet: 'Arhar (Tur/Red Gram)(Whole)' },
  { id: 'gram', categoryId: 'pulses', mr: 'हरभरा', en: 'Gram', hi: 'चना', agmarknet: 'Bengal Gram(Gram)(Whole)' },
  { id: 'moong', categoryId: 'pulses', mr: 'मूग', en: 'Moong', hi: 'मूंग', agmarknet: 'Green Gram (Moong)(Whole)' },
  { id: 'turmeric', categoryId: 'spices', mr: 'हळद', en: 'Turmeric', hi: 'हल्दी', agmarknet: 'Turmeric' },
  { id: 'jaggery', categoryId: 'processed', mr: 'गूळ', en: 'Jaggery', hi: 'गुड़', agmarknet: 'Gur(Jaggery)' },
  { id: 'other', categoryId: 'other', mr: 'इतर', en: 'Other', hi: 'अन्य' },
]

export function cropById(id: string | undefined): Crop | undefined {
  return CROPS.find((c) => c.id === id)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && node --import tsx --test tests/fdri.test.ts tests/geo.test.ts` → PASS.

- [ ] **Step 6: Farmer type, register route, public card**

- `shared/src/types.ts` `Farmer`: apply the field changes listed under Interfaces. `shopName` stays; registration sets it to the farmer's name. Delete `DigitalProfile`, `BusinessType`, `ReadinessBand`. In `AdminStats`, replace `readinessBands` with `fdriBands: { band: FdriBand; v: number }[]`.
- `farmers.routes.ts` register: read the new body fields through `pick`/`pickMany`/`cleanFdri`, `crops` filtered through `cropById`, and location only when `locationConsent === true && isValidLatLng(lat, lng)`. Set `fdriScore = fdriScore(fdri)` and `fdriBand = fdriBand(score)`. Delete every FSSAI, business-type and readiness line.
- Add `PATCH /me/location`: `{ clear: true }` deletes `lat`, `lng` and `locationConsent`; otherwise the body must pass `isValidLatLng` and it sets `locationConsent: true`.
- `PATCH /me` (profile edit) accepts `crops` and the profile fields with the same cleaning.
- `db/publicFarmer.ts`: add `crops: f.crops` and `...publicLocation(f)`. Update `PublicFarmer` in `types.ts` to include `'crops'` and `lat?: number; lng?: number`.
- `shared/src/accountClose.ts`: `FARMER_PII_FIELDS` gains `lat`, `lng`, `locationConsent`, `ageGroup`, `education`, `landholding`, `fdri` and loses the deleted fields. The account-close test walks the list.
- `db/analytics.ts`: count `fdriBands` from farmers.
- `db/seed.ts`: the four demo farmers from the poster, in village अणदूर (pincode 413603):

  | name | crop | price | unit |
  |---|---|---|---|
  | राजेश पाटील | tomato | 40 | kg |
  | सविता कांबळे | okra | 35 | kg |
  | गणेश जगदाळे | onion | 28 | kg |
  | लक्ष्मी शिंदे | gram | 60 | kg |

  Give each one `status: 'ACTIVE'`, a moderate FDRI and `locationConsent: true` near 17.99, 76.23. Seeded farmers get no credentials (no invented passwords). The README says to create a password for the demo with `npm run admin -- set-password <phone> <password>`. Add that command to `backend/scripts/admin.ts` using `setCredential`.

- [ ] **Step 7: Registration wizard**

`FarmerRegister.tsx`: keep the reference's wizard frame (`Dots`, one topic per screen, back/next, draft saved through `farmerDraft.ts`). The steps array becomes:

1. `account` — phone, password, password again (from Task 5)
2. `name` — `VoiceInput` for the name
3. `place` — village (existing village picker with the voice mic), taluka, pincode
4. `location` — consent sentence `reg.locationWhy` ("ग्राहकांना तुमचे गाव नकाशावर दिसेल. घराचा नेमका पत्ता दिसणार नाही." / "Buyers will see your village on a map, not your exact house."), a primary button `reg.useLocation` calling `navigator.geolocation.getCurrentPosition` with `{ enableHighAccuracy: true, timeout: 15000 }`, and `common.skip`. On error, show `reg.locationFailed` and allow skipping. Keep the numbers only if `isValidLatLng`.
5. `crops` — chips from `CROPS` (multi-select, at least one)
6. `upi` — the existing UPI step unchanged
7. `about` — age group, education, landholding (each a `Choice` list), farmer types (multi)
8. `fdri` — ten `YesNo` rows, one per `FDRI_INDICATORS`, labelled from `FDRI_QUESTIONS[k][lang]`. The paper's instrument is a list, so this is the one screen with ten questions on it; each row is a single tap.
9. `market` — selling channels (multi) and problems (multi)
10. `review` — the existing summary screen

`farmerDraft.ts`: add the new fields to the draft shape; drop the removed ones. Update `frontend/tests/farmer-draft.test.ts`.

`EditProfile.tsx`: crops, the four profile choices and a "Change my location" row (same geolocation button, plus `Remove location` calling `PATCH /me/location { clear: true }`).

Admin `FarmerDetail.tsx`: show the FDRI score, band pill (icon + word) and the ten answers as a two-column yes/no list. Also show the profile fields and the exact coordinates with a link `https://www.openstreetmap.org/?mlat=<lat>&mlon=<lng>#map=15/<lat>/<lng>`. Admin `Farmers.tsx`: an FDRI band filter.

Dictionaries: `reg.*` keys for every new label. Band labels `fdri.band.low|moderate|high` ("कमी"/"मध्यम"/"उच्च" · "Low"/"Moderate"/"High").

- [ ] **Step 8: Gate and commit**

```bash
git rm shared/src/readiness.ts
npm test && npm run typecheck && npm run build
git add -A
git commit -m "Farmer profile, location with consent, and the FDRI

Registration asks the paper's questionnaire: age, education,
landholding, farmer type, crops, selling channels and problems, and
the ten FDRI indicators (0-3 low, 4-7 moderate, 8-10 high). Location is
optional; buyers see it rounded to about a kilometre.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Produce listings

**Files:**
- Create: `shared/src/produce.ts`, `backend/tests/produce.test.ts`
- Delete: `backend/tests/fssai.test.ts`, `backend/tests/product-size.test.ts`, `frontend/src/lib/productSize.ts`
- Modify: `shared/src/types.ts`, `shared/src/farmer.ts` (delete `sizeProblems`, `needsPieceCount`, `FSSAI_*`), `backend/src/db/seed.ts` (`CATEGORIES`), `backend/src/routes/products.routes.ts`, `backend/src/routes/catalog.routes.ts`, `backend/tests/categories.test.ts`, `frontend/src/screens/farmer/{UploadProduct,EditProduct,MyProducts,productDraft}.tsx|ts`, `frontend/src/screens/customer/Browse.tsx`, `frontend/src/screens/customer/CartCheckout.tsx`, `frontend/src/store/{CartContext,cartRules}.ts(x)`, `frontend/src/lib/categoryPhoto.ts`, `frontend/src/components/icons.tsx`, `admin/src/screens/Products.tsx`, dictionaries

**Interfaces:**
- Consumes: `CROPS`, `cropById` (Task 6).
- Produces:
  - `type Unit = 'kg' | 'quintal' | 'dozen' | 'piece' | 'litre'`, `UNITS: Unit[]`
  - `type Cultivation = 'organic' | 'natural' | 'chemical'`, `CULTIVATIONS`
  - `Product` = `{ id, farmerId, cropId, name, categoryId, imageUrl?, imagePublicId?, emoji, unit, price, stock, minOrder, harvestDate, cultivation, description?, status, views, createdAt }`
  - `listingProblems(p: Partial<Product>, now?: number): Record<string, string>` (Marathi messages)
  - `harvestAgeDays(harvestDate: string, now?: number): number`
  - `cartStep(p: Pick<Product,'minOrder'|'stock'>, qty: number, dir: 1 | -1): number`
  - `CATEGORIES` ids: `vegetables`, `leafy`, `fruits`, `grains`, `pulses`, `spices`, `processed`, `other`

- [ ] **Step 1: Write the failing test**

`backend/tests/produce.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cartStep, harvestAgeDays, listingProblems } from '@shared/produce.js'

const DAY = 86_400_000
const now = Date.parse('2026-09-26T06:00:00Z')
const good = {
  cropId: 'tomato', name: 'टोमॅटो', categoryId: 'vegetables', unit: 'kg' as const,
  price: 40, stock: 200, minOrder: 5, harvestDate: '2026-09-25', cultivation: 'organic' as const,
}

test('a complete listing has no problems', () => {
  assert.deepEqual(listingProblems(good, now), {})
})

test('price, stock and minimum order must make sense together', () => {
  assert.ok(listingProblems({ ...good, price: 0 }, now).price)
  assert.ok(listingProblems({ ...good, stock: -1 }, now).stock)
  assert.ok(listingProblems({ ...good, minOrder: 0 }, now).minOrder)
  assert.ok(listingProblems({ ...good, minOrder: 300 }, now).minOrder, 'more than he has')
})

test('a harvest date cannot be tomorrow', () => {
  assert.ok(listingProblems({ ...good, harvestDate: '2026-09-27' }, now).harvestDate)
})

test('fresh produce older than 60 days is refused; grain is not', () => {
  const old = new Date(now - 61 * DAY).toISOString().slice(0, 10)
  assert.ok(listingProblems({ ...good, harvestDate: old }, now).harvestDate)
  assert.deepEqual(listingProblems({ ...good, cropId: 'wheat', categoryId: 'grains', harvestDate: old }, now), {})
})

test('unknown unit, crop or cultivation is refused', () => {
  assert.ok(listingProblems({ ...good, unit: 'g' as never }, now).unit)
  assert.ok(listingProblems({ ...good, cropId: 'nonsense' }, now).cropId)
  assert.ok(listingProblems({ ...good, cultivation: 'magic' as never }, now).cultivation)
})

test('harvest age in whole days', () => {
  assert.equal(harvestAgeDays('2026-09-25', now), 1)
  assert.equal(harvestAgeDays('2026-09-26', now), 0)
})

test('the cart steps between the minimum and the stock', () => {
  const p = { minOrder: 5, stock: 12 }
  assert.equal(cartStep(p, 5, -1), 0, 'below the minimum the line goes')
  assert.equal(cartStep(p, 5, 1), 6)
  assert.equal(cartStep(p, 12, 1), 12, 'no more than he has')
  assert.equal(cartStep(p, 0, 1), 5, 'the first tap adds the minimum')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --import tsx --test tests/produce.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement produce.ts**

```ts
import { cropById } from './crops.js'
import type { Product } from './types.js'

export type Unit = 'kg' | 'quintal' | 'dozen' | 'piece' | 'litre'
export const UNITS: Unit[] = ['kg', 'quintal', 'dozen', 'piece', 'litre']

export type Cultivation = 'organic' | 'natural' | 'chemical'
export const CULTIVATIONS: Cultivation[] = ['organic', 'natural', 'chemical']

/** Fresh produce past this is not fresh, and saying so is the buyer's protection. */
export const FRESH_MAX_DAYS = 60
const FRESH_CATEGORIES = new Set(['vegetables', 'leafy', 'fruits'])

export function harvestAgeDays(harvestDate: string, now = Date.now()): number {
  const day = Date.parse(`${harvestDate}T00:00:00+05:30`)
  const today = Date.parse(`${new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+05:30`)
  return Math.round((today - day) / 86_400_000)
}

export function listingProblems(p: Partial<Product>, now = Date.now()): Record<string, string> {
  const f: Record<string, string> = {}
  if (!cropById(p.cropId)) f.cropId = 'पीक निवडा'
  if (!String(p.name ?? '').trim()) f.name = 'मालाचे नाव लिहा'
  if (!UNITS.includes(p.unit as Unit)) f.unit = 'एकक निवडा'
  if (!CULTIVATIONS.includes(p.cultivation as Cultivation)) f.cultivation = 'शेती पद्धत निवडा'
  if (!(Number(p.price) > 0)) f.price = 'किंमत 0 पेक्षा जास्त असावी'
  if (!(Number.isInteger(p.stock) && p.stock! >= 0)) f.stock = 'उपलब्ध माल 0 किंवा जास्त असावा'
  if (!(Number.isInteger(p.minOrder) && p.minOrder! >= 1)) f.minOrder = 'किमान 1 ऑर्डर असावी'
  else if (Number.isInteger(p.stock) && p.stock! > 0 && p.minOrder! > p.stock!) f.minOrder = 'किमान ऑर्डर उपलब्ध मालापेक्षा जास्त आहे'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.harvestDate ?? ''))) f.harvestDate = 'काढणीची तारीख टाका'
  else {
    const age = harvestAgeDays(p.harvestDate!, now)
    if (age < 0) f.harvestDate = 'काढणीची तारीख उद्याची असू शकत नाही'
    else if (FRESH_CATEGORIES.has(String(p.categoryId)) && age > FRESH_MAX_DAYS) f.harvestDate = `ताजा माल ${FRESH_MAX_DAYS} दिवसांपेक्षा जुना नसावा`
  }
  return f
}

/** Next cart quantity: never between 0 and the minimum, never past the stock. */
export function cartStep(p: Pick<Product, 'minOrder' | 'stock'>, qty: number, dir: 1 | -1): number {
  const min = Math.max(1, p.minOrder || 1)
  if (dir === 1) return qty < min ? Math.min(min, p.stock) : Math.min(qty + 1, p.stock)
  return qty - 1 < min ? 0 : qty - 1
}
```
Update `Product` in `types.ts` to the Interfaces shape and move `Unit` there by re-exporting: `export type { Unit, Cultivation } from './produce.js'`. Delete `isFood`, `ingredients`, `vegType`, `fssai`, `material`, `mrp`, `packSize`, `piecesPerPack`, `madeToOrder`, `nameEn`. `CartItem.unit` keeps its type; add `minOrder: number`.

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && node --import tsx --test tests/produce.test.ts` → PASS.

- [ ] **Step 5: Wire it through**

- `CATEGORIES` in `db/seed.ts`: the eight ids above with Marathi/English labels (vegetables भाजीपाला, leafy पालेभाज्या, fruits फळे, grains धान्य, pulses कडधान्ये, spices मसाले, processed प्रक्रिया उत्पादने, other इतर). Delete the `food` flag from `Category` and from the tests. `backend/tests/categories.test.ts` keeps "`other` sorts last". Also fix the known gap: `POST /products` and `PATCH` now refuse a `categoryId` that is not in `CATEGORIES`, and set `categoryId` from `cropById(cropId).categoryId` unless the crop is `other`.
- `products.routes.ts`: validate with `listingProblems`. `PATCH` accepts every field (no edit limit). A farmer may `DELETE` any of his own listings (`farmerMayDelete` returns true); keep the Cloudinary cleanup.
- `catalog.routes.ts`: `q` also matches the crop's `mr`/`en`/`hi` labels. Add filters `cropId` and `cultivation`.
- `UploadProduct.tsx` wizard steps: crop (chips from `CROPS` grouped by category) → photo (existing `PhotoPicker`) → name (pre-filled from the crop label, editable) → unit → price per unit → quantity available + minimum order → harvest date (`<input type="date" max={today}>`) → cultivation (three big choices with icons `IconOrganic`, `IconNatural`, `IconChemical` added to `icons.tsx` from `react-icons/gi` `GiPlantSeed`, `GiSprout`, `GiChemicalDrop`) → review. Delete the food/non-food fork and every food-only screen.
- `EditProduct.tsx`: the same fields on one page.
- `productDraft.ts` + its test: the new shape.
- `Browse.tsx` product card and detail: show price per unit (`₹40 / किलो`), the cultivation pill (icon + word), "harvested N days ago" (`prod.harvestedAgo`; `prod.harvestedToday` when 0) and the minimum order when it is above 1.
- `CartContext`/`cartRules`: use `cartStep` for the + and − buttons. `ProductDetail` adds `minOrder` as the first quantity.
- `categoryPhoto.ts`: delete the reference's food photos that do not fit. Keep a photo only for categories that have an honest match, else the icon fallback (as the reference rule says).
- Unit labels in dictionaries: `unit.kg` किलो/kg, `unit.quintal` क्विंटल/quintal, `unit.dozen` डझन/dozen, `unit.piece` नग/piece, `unit.litre` लिटर/litre. Delete `unit.g`, `unit.ml`, `unit.set`.
- Admin `Products.tsx`: columns crop, cultivation, harvest date, stock/unit. Delete the veg and FSSAI columns.

- [ ] **Step 6: Gate and commit**

```bash
git rm backend/tests/fssai.test.ts backend/tests/product-size.test.ts frontend/src/lib/productSize.ts
npm test && npm run typecheck && npm run build
git add -A
git commit -m "Produce listings: crop, unit, minimum order, harvest date, cultivation

Replaces the packaged-food listing. Fresh produce older than 60 days is
refused, and the cart steps between the minimum order and the stock.
The server now refuses a categoryId that is not in the list.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Home delivery and pickup

**Files:**
- Create: `backend/tests/pickup.test.ts`
- Modify: `shared/src/types.ts`, `shared/src/orderFlow.ts`, `shared/src/orderCancel.ts`, `backend/src/routes/orders.routes.ts`, `backend/src/routes/farmers.routes.ts`, `backend/src/db/publicFarmer.ts`, `frontend/src/components/OrderTracker.tsx`, `frontend/src/screens/farmer/Orders.tsx`, `frontend/src/screens/farmer/EditProfile.tsx`, `frontend/src/screens/customer/CartCheckout.tsx`, `frontend/src/lib/notifications.ts`, `admin/src/screens/Orders.tsx`, dictionaries

**Interfaces:**
- Consumes: `FARMER_ACTIONS`, `canTransition`, `BUYER_STAGES`, `buyerStageIndex` (renamed in Task 4).
- Produces:
  - `type Fulfilment = 'delivery' | 'pickup'`; `Order.fulfilment?: Fulfilment` (absent reads as delivery)
  - `Farmer.offersDelivery: boolean`, `Farmer.pickup?: { place: string; lat?: number; lng?: number }`
  - `actionsFor(status: OrderStatus, fulfilment?: Fulfilment): FarmerAction[]`
  - `canTransition(from, to, fulfilment?: Fulfilment): boolean`
  - `buyerStages(fulfilment?: Fulfilment): { key: string; status: OrderStatus }[]`
  - `buyerStageIndex(order: Pick<Order,'status'|'events'|'fulfilment'>): number`
  - `statusLabelKey(status, fulfilment?)` returns `ord.status.PACKED_PICKUP` for a pickup order at `PACKED`
  - `PublicFarmer` adds `offersDelivery` and `pickup` (place text and the rounded point)
  - `POST /orders` body `fulfilment`

- [ ] **Step 1: Write the failing test**

`backend/tests/pickup.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionsFor, buyerStageIndex, buyerStages, canTransition, statusLabelKey } from '@shared/orderFlow.js'
import { mayCancel } from '@shared/orderCancel.js'

/**
 * A pickup order has no road trip, so "out for delivery" would be a step
 * nobody can take. Packed means "ready at the farm", and the next step is
 * the buyer collecting it.
 */

test('delivery keeps its five steps', () => {
  assert.equal(canTransition('PACKED', 'OUT_FOR_DELIVERY'), true)
  assert.equal(canTransition('PACKED', 'DELIVERED'), false)
})

test('pickup goes from ready straight to collected', () => {
  assert.equal(canTransition('PACKED', 'DELIVERED', 'pickup'), true)
  assert.equal(canTransition('PACKED', 'OUT_FOR_DELIVERY', 'pickup'), false)
  assert.deepEqual(actionsFor('PACKED', 'pickup').map((a) => a.to), ['DELIVERED'])
  assert.equal(statusLabelKey('PACKED', 'pickup'), 'ord.status.PACKED_PICKUP')
  assert.equal(statusLabelKey('PACKED'), 'ord.status.PACKED')
})

test('the buyer sees three stages for pickup', () => {
  assert.deepEqual(buyerStages('pickup').map((s) => s.status), ['ACCEPTED', 'PACKED', 'DELIVERED'])
  const order = { status: 'PACKED' as const, fulfilment: 'pickup' as const,
    events: [{ to: 'ACCEPTED' as const, at: '', by: 'farmer' as const }, { to: 'PACKED' as const, at: '', by: 'farmer' as const }] }
  assert.equal(buyerStageIndex(order), 1)
})

test('cancelling works the same for pickup', () => {
  assert.equal(mayCancel('customer', { status: 'PLACED' }), true)
  assert.equal(mayCancel('customer', { status: 'PACKED' }), false)
  assert.equal(mayCancel('farmer', { status: 'PACKED' }), true, 'ready for pickup, farmer can still call it off')
})
```
Before writing the last test, check the export name in `shared/src/orderCancel.ts` (`grep -n "export function" shared/src/orderCancel.ts`). If the predicate has another name or signature, write the test against the real one. The behaviour asserted must stay: buyer only at `PLACED`; farmer from `ACCEPTED` to `OUT_FOR_DELIVERY`, which includes `PACKED`.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --import tsx --test tests/pickup.test.ts` → FAIL (`actionsFor` not exported).

- [ ] **Step 3: Implement in orderFlow.ts**

Add to `shared/src/types.ts`: `export type Fulfilment = 'delivery' | 'pickup'` and `fulfilment?: Fulfilment` on `Order`. In `orderFlow.ts`, after `FARMER_ACTIONS`:
```ts
/** At a pickup order's PACKED, the one step left is the buyer collecting it. */
const PICKUP_PACKED: FarmerAction[] = [
  { to: 'DELIVERED', labelKey: 'ord.markPickedUp', tone: 'primary' },
]

export function actionsFor(status: OrderStatus, fulfilment: Fulfilment = 'delivery'): FarmerAction[] {
  if (fulfilment === 'pickup' && status === 'PACKED') return PICKUP_PACKED
  return FARMER_ACTIONS[status] || []
}

export function buyerStages(fulfilment: Fulfilment = 'delivery') {
  return fulfilment === 'pickup'
    ? [
        { key: 'track.confirmed', status: 'ACCEPTED' as OrderStatus },
        { key: 'track.readyForPickup', status: 'PACKED' as OrderStatus },
        { key: 'track.pickedUp', status: 'DELIVERED' as OrderStatus },
      ]
    : BUYER_STAGES
}
```
Change the existing functions:
```ts
export function canTransition(from: OrderStatus, to: OrderStatus, fulfilment?: Fulfilment): boolean {
  return actionsFor(from, fulfilment).some((a) => a.to === to)
}
export function actionFor(from: OrderStatus, to: OrderStatus, fulfilment?: Fulfilment): FarmerAction | undefined {
  return actionsFor(from, fulfilment).find((a) => a.to === to)
}
export function statusLabelKey(status: OrderStatus, fulfilment?: Fulfilment): string {
  return fulfilment === 'pickup' && status === 'PACKED' ? 'ord.status.PACKED_PICKUP' : `ord.status.${status}`
}
export function buyerStageIndex(order: Pick<Order, 'status' | 'events' | 'fulfilment'>): number {
  const reached = (s: OrderStatus) => order.events.some((e) => e.to === s)
  let last = -1
  buyerStages(order.fulfilment).forEach((stage, i) => {
    if (reached(stage.status) || stepIndex(order.status) >= stepIndex(stage.status)) last = i
  })
  return last
}
```
`needsFarmerAction(order)` uses `actionsFor(order.status, order.fulfilment).length > 0`.

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && node --import tsx --test tests/pickup.test.ts` → PASS.

- [ ] **Step 5: Callers**

Run `grep -rn "canTransition\|actionFor\|FARMER_ACTIONS\|BUYER_STAGES\|statusLabelKey" backend/src frontend/src admin/src` and pass `order.fulfilment` at every call site. The frontend draws buttons from `actionsFor(order.status, order.fulfilment)`, never from `FARMER_ACTIONS[...]` directly.

- `orders.routes.ts` `POST /orders`: read `fulfilment`. `'pickup'` requires `farmer.pickup?.place`; `'delivery'` (default) requires `farmer.offersDelivery`. Refuse otherwise with 400 `{ messageMr: 'हा शेतकरी ही सोय देत नाही' }`. For pickup, skip `isMaharashtraPincode` and the delivery fee (`deliveryFee: 0`, and the order stores the pickup place as its `address`). `POST /orders/:id/advance` validates with `canTransition(order.status, to, order.fulfilment)`.
- `farmers.routes.ts` `PATCH /me`: accept `offersDelivery: boolean` and `pickup: { place: string (3–120 chars), lat?, lng? }` or `pickup: null`. Refuse a save that leaves neither on (`fields.fulfilment = 'घरपोच किंवा शेतावरून नेणे - किमान एक निवडा'`). Registration sets `offersDelivery: true` by default and asks nothing more; the farmer turns pickup on in profile.
- `publicFarmer.ts`: `offersDelivery`, and `pickup: f.pickup ? { place: f.pickup.place, ...publicLocation({ ...f.pickup, locationConsent: true }) } : undefined`. The pickup place is a spot the farmer chose to publish, so it does not need the home-location consent. It is still rounded.
- `CartCheckout.tsx`: when the farmer offers both, a two-option `Choice` "घरपोच" / "शेतावरून नेणार" (icons `IconTruck`, `IconFarm`). For pickup, hide the address form and show the place, the map link and the line `chk.pickupNote` ("ऑर्डर स्वीकारल्यावर शेतकरी माल तयार ठेवेल. तयार झाल्यावर तुम्हाला कळेल."). Totals read without delivery.
- `OrderTracker.tsx`: `BuyerTracker` iterates `buyerStages(order.fulfilment)`.
- `Orders.tsx` (farmer): the pickup pill (icon + word `ord.pickup`) on the row and detail. The `markPickedUp` button reads "ग्राहकाने माल नेला" / "Buyer collected it".
- Dictionaries: `ord.status.PACKED_PICKUP` ("नेण्यासाठी तयार" / "Ready for pickup"), `track.readyForPickup`, `track.pickedUp`, `ord.markPickedUp`, `ord.pickup`, `ord.delivery`, `chk.fulfilment`, `chk.pickupNote`, `prof.offersDelivery`, `prof.pickupPlace`, `prof.pickupPlacePh`.

- [ ] **Step 6: Gate and commit**

```bash
npm test && npm run typecheck && npm run build
git add -A
git commit -m "Let a farmer offer pickup as well as delivery

A pickup order skips OUT_FOR_DELIVERY: packed reads 'ready for pickup'
and the next step is the buyer collecting it. The buyer's tracker shows
three stages. Payment after acceptance and the cancel rules are unchanged.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Traceability QR

**Files:**
- Create: `backend/tests/trace.test.ts`, `frontend/src/screens/trace/Trace.tsx`, `frontend/src/components/ProductQr.tsx`
- Modify: `backend/src/routes/catalog.routes.ts`, `frontend/src/App.tsx`, `frontend/src/lib/api.ts`, `frontend/src/screens/farmer/MyProducts.tsx`, `frontend/src/styles/theme.css` (print rules), dictionaries

**Interfaces:**
- Consumes: `publiclyVisible`, `publicFarmer`, `ratingsBy*` helpers already in `catalog.routes.ts`.
- Produces:
  - `GET /api/catalog/products/:id/trace` → `{ product: CatalogProduct, farmer: PublicFarmer & { phone: string } }`, 404 exactly where `GET /catalog/products/:id` would 404
  - `traceUrl(productId: string): string` in `frontend/src/lib/trace.ts` = `${location.origin}/trace/${productId}`
  - frontend public route `/trace/:productId`

- [ ] **Step 1: Write the failing test**

`backend/tests/trace.test.ts` — model it on the setup `backend/tests/catalog-visibility.test.ts` already uses to seed a Db and call a router. Reuse its helper; do not invent a new harness.
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { traceView } = await import('../src/routes/catalog.routes.js')
const { emptyDb } = await import('../src/db/seed.js')

/**
 * A printed QR outlives the listing. Scanning it must show the farmer only
 * while the product is on sale - the same rule as the catalogue - and the
 * same "not found" as an id that never existed otherwise.
 */

function world(farmerStatus: string, productStatus: string, isOpen = true) {
  const db = emptyDb()
  db.farmers.push({ id: 'f1', status: farmerStatus, isOpen, name: 'राजेश पाटील', phone: '9822011223',
    farmerCode: 'F2C-ANADUR-001', village: 'अणदूर', crops: ['tomato'], lat: 17.99364, lng: 76.23361,
    locationConsent: true, offersDelivery: true } as never)
  db.products.push({ id: 'p1', farmerId: 'f1', status: productStatus, cropId: 'tomato', name: 'टोमॅटो',
    harvestDate: '2026-09-25', cultivation: 'organic', price: 40, unit: 'kg', stock: 100, minOrder: 5 } as never)
  return db
}

test('a live product from a verified farmer is traceable, with his phone', () => {
  const v = traceView(world('ACTIVE', 'LIVE'), 'p1')!
  assert.equal(v.farmer.phone, '9822011223')
  assert.equal(v.farmer.lat, 17.99, 'rounded, as everywhere public')
  assert.equal(v.product.harvestDate, '2026-09-25')
})

for (const [label, f, p, open] of [
  ['blocked farmer', 'BLOCKED', 'LIVE', true],
  ['unverified farmer', 'PENDING_VERIFICATION', 'LIVE', true],
  ['draft', 'ACTIVE', 'DRAFT', true],
  ['closed shop', 'ACTIVE', 'LIVE', false],
] as const) {
  test(`${label}: nothing`, () => {
    assert.equal(traceView(world(f, p, open), 'p1'), null)
  })
}

test('an unknown id: nothing', () => {
  assert.equal(traceView(world('ACTIVE', 'LIVE'), 'nope'), null)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --import tsx --test tests/trace.test.ts` → FAIL (`traceView` not exported).

- [ ] **Step 3: Implement**

In `catalog.routes.ts`:
```ts
/**
 * WHAT A SCANNED QR SHOWS. The farmer's phone is on it on purpose: the
 * poster promises "farmer contact" to anyone holding his produce, and he
 * printed the code himself. Everything else is the public card.
 */
export function traceView(db: Db, productId: string) {
  const product = db.products.find((p) => p.id === productId)
  const farmer = product && db.farmers.find((f) => f.id === product.farmerId)
  if (!product || !farmer || !publiclyVisible(product, farmer)) return null
  return {
    product: withRating(db, product),
    farmer: { ...publicFarmer(farmer, farmerRating(db, farmer.id)), phone: farmer.phone },
  }
}

catalogRouter.get('/products/:id/trace', (req, res) => {
  const view = traceView(getDb(), req.params.id)
  if (!view) { res.status(404).json({ error: 'Not found', messageMr: 'हा माल सापडला नाही' }); return }
  res.json(view)
})
```
`withRating` and `farmerRating` stand for whatever `GET /catalog/products/:id` already calls to attach the product rating and build the farmer's rating summary. Extract those two lines of that handler into these helpers and call them from both routes, so the two answers cannot drift.

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && node --import tsx --test tests/trace.test.ts` → PASS.

- [ ] **Step 5: Frontend**

`frontend/src/lib/trace.ts`:
```ts
export const traceUrl = (productId: string) => `${window.location.origin}/trace/${productId}`
```
`frontend/src/components/ProductQr.tsx`:
```tsx
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Product } from '@shared/types.js'
import { useT } from '../i18n/I18nProvider.js'
import { Button } from './ui.js'
import { traceUrl } from '../lib/trace.js'

/**
 * A code the farmer sticks on the sack. Download gives a PNG for WhatsApp;
 * print gives one clean page (the print stylesheet hides everything else).
 */
export function ProductQr({ product, farmerName, farmerCode }: {
  product: Pick<Product, 'id' | 'name'>; farmerName: string; farmerCode: string
}) {
  const t = useT()
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    QRCode.toDataURL(traceUrl(product.id), { width: 640, margin: 2, color: { dark: '#1b5e20ff', light: '#ffffffff' } })
      .then(setSrc)
  }, [product.id])
  if (!src) return null
  return (
    <div className="qr-print">
      <img src={src} alt={t('qr.alt', { name: product.name })} width={240} height={240} />
      <p className="qr-print__crop">{product.name}</p>
      <p className="qr-print__who">{farmerName} · {farmerCode}</p>
      <div className="btn-row no-print">
        <a className="btn btn--ghost" href={src} download={`${farmerCode}-${product.id}.png`}>{t('common.download')}</a>
        <Button tone="ghost" onClick={() => window.print()}>{t('qr.print')}</Button>
      </div>
    </div>
  )
}
```
In `theme.css`, add:
```css
@media print {
  body * { visibility: hidden; }
  .qr-print, .qr-print * { visibility: visible; }
  .qr-print { position: absolute; inset: 0; text-align: center; padding-top: 20mm; }
  .no-print { display: none !important; }
}
```
`MyProducts.tsx`: each live product row gets a `qr.show` button opening a `<dialog>` with `<ProductQr>`, following the reference's showModal rule in CLAUDE.md Conventions.

`screens/trace/Trace.tsx`: a public page (no `Require`) that calls `api.trace(id)` through `useAsync(…, [id], 'trace:'+id)`. It shows:
- app bar with the logo and `LanguagePicker`
- product photo (`ProductImage`) and name
- rows (label + value): farmer (name + code), village, crop, harvest date + days ago, cultivation pill, price per unit, available quantity
- a call button `tel:+91<phone>` and a WhatsApp button `https://wa.me/91<phone>`
- a small `MapView` (Task 10) when `farmer.lat` exists; before Task 10 lands, a link to OpenStreetMap
- a primary button `trace.order`, going to `/shop/p/<id>` when signed in as a customer and otherwise to `/login/customer` with `state: { next: '/shop/p/<id>' }`. Make `LoginScreen` honour `location.state.next`.

On 404 the page shows `EmptyState` `trace.gone` ("हा माल आता विक्रीसाठी नाही." / "This produce is no longer on sale.").

`api.ts`: `trace: (id: string) => get<{ product: CatalogProduct; farmer: PublicFarmer & { phone: string } }>(\`/catalog/products/${id}/trace\`)`.
`App.tsx`: `<Route path="/trace/:productId" element={<Trace />} />` next to `/`.

- [ ] **Step 6: Gate and commit**

```bash
npm test && npm run typecheck && npm run build
git add -A
git commit -m "Traceability QR on every listing

Each live product has a QR the farmer can download or print. Scanning
it opens /trace/:id with farmer, village, harvest date, cultivation,
price, quantity and contact - visible exactly as far as the catalogue
shows the product, and 404 otherwise.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Maps

**Files:**
- Create: `frontend/src/components/MapView.tsx`, `frontend/src/screens/customer/FarmerMap.tsx`, `admin/src/components/MapView.tsx`, `admin/src/screens/MapScreen.tsx`, `backend/tests/map.test.ts`
- Modify: `frontend/package.json`, `admin/package.json`, `backend/src/routes/catalog.routes.ts`, `backend/src/routes/admin.routes.ts`, `frontend/src/App.tsx`, `frontend/src/components/layouts.tsx`, `frontend/src/screens/trace/Trace.tsx`, `frontend/src/screens/farmer/EditProfile.tsx`, `admin/src/App.tsx`, `admin/src/components/Shell.tsx`, `frontend/src/lib/api.ts`, `admin/src/lib/api.ts`, dictionaries

**Interfaces:**
- Consumes: `publicLocation` (Task 6), `publiclyVisible`.
- Produces:
  - `GET /api/catalog/map?categoryId=` → `{ pins: { farmerId, name, village, lat, lng, crops: string[], liveCount: number }[] }`. Rounded, verified farmers with at least one public product only.
  - `GET /api/admin/map` → `{ farmers: { id, name, village, lat, lng, fdriBand, crops }[], surveys: { id, village, lat, lng, fdriBand }[] }`. Exact. The `surveys` list is empty until Task 12.
  - `MapView` props: `{ pins: { id: string; lat: number; lng: number; label: string; tone?: 'primary' | 'accent' }[]; height?: number; onSelect?: (id: string) => void; center?: [number, number]; zoom?: number }`

- [ ] **Step 1: Write the failing test**

`backend/tests/map.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { mapPins } = await import('../src/routes/catalog.routes.js')
const { emptyDb } = await import('../src/db/seed.js')

test('only verified farmers with produce on sale, and only with consent, rounded', () => {
  const db = emptyDb()
  const f = (id: string, status: string, consent: boolean) => ({
    id, status, isOpen: true, name: id, village: 'अणदूर', crops: ['onion'],
    lat: 17.99364, lng: 76.23361, locationConsent: consent }) as never
  db.farmers.push(f('a', 'ACTIVE', true), f('b', 'ACTIVE', false), f('c', 'PENDING_VERIFICATION', true), f('d', 'ACTIVE', true))
  const p = (id: string, farmerId: string) => ({ id, farmerId, status: 'LIVE', categoryId: 'vegetables' }) as never
  db.products.push(p('p1', 'a'), p('p2', 'b'), p('p3', 'c'))
  const pins = mapPins(db, undefined)
  assert.deepEqual(pins.map((x) => x.farmerId), ['a'], 'b refused, c unverified, d has nothing on sale')
  assert.equal(pins[0].lat, 17.99)
  assert.equal(pins[0].liveCount, 1)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --import tsx --test tests/map.test.ts` → FAIL.

- [ ] **Step 3: Implement the route**

In `catalog.routes.ts`:
```ts
export function mapPins(db: Db, categoryId: string | undefined) {
  const live = new Map<string, number>()
  const farmers = new Map(db.farmers.map((f) => [f.id, f]))
  for (const p of db.products) {
    if (categoryId && p.categoryId !== categoryId) continue
    if (publiclyVisible(p, farmers.get(p.farmerId))) live.set(p.farmerId, (live.get(p.farmerId) ?? 0) + 1)
  }
  return db.farmers.flatMap((f) => {
    const at = live.get(f.id) ? publicLocation(f) : undefined
    return at ? [{ farmerId: f.id, name: f.name, village: f.village, crops: f.crops, liveCount: live.get(f.id)!, ...at }] : []
  })
}

catalogRouter.get('/map', (req, res) => {
  res.json({ pins: mapPins(getDb(), req.query.categoryId as string | undefined) })
})
```
In `admin.routes.ts`, `GET /map` returns exact points from every farmer with valid coordinates (`isValidLatLng`), whatever the consent: admin sees all. `surveys: []` for now.

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && node --import tsx --test tests/map.test.ts` → PASS.

- [ ] **Step 5: Leaflet component**

```bash
npm install leaflet@^1.9.4 -w @f2c/frontend -w @f2c/admin
npm install -D @types/leaflet@^1.9.12 -w @f2c/frontend -w @f2c/admin
```
`frontend/src/components/MapView.tsx` (copy it byte for byte to `admin/src/components/MapView.tsx`):
```tsx
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapPin { id: string; lat: number; lng: number; label: string; tone?: 'primary' | 'accent' }

/**
 * OpenStreetMap through Leaflet, imperatively: one map object per mount,
 * pins redrawn when the list changes. Circle markers, not the image pins,
 * because Leaflet's default icon URLs break under a bundler and a circle
 * costs no download. Colours are read from the theme tokens.
 */
export default function MapView({ pins, height = 320, onSelect, center = [17.99, 76.23], zoom = 11 }: {
  pins: MapPin[]; height?: number; onSelect?: (id: string) => void; center?: [number, number]; zoom?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map>()
  const layer = useRef<L.LayerGroup>()

  useEffect(() => {
    if (!box.current || map.current) return
    map.current = L.map(box.current, { scrollWheelZoom: false }).setView(center, zoom)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = undefined }
  }, [])

  useEffect(() => {
    const g = layer.current; if (!g || !map.current) return
    g.clearLayers()
    const css = getComputedStyle(document.documentElement)
    const colour = { primary: css.getPropertyValue('--primary').trim(), accent: css.getPropertyValue('--maroon').trim() }
    for (const p of pins) {
      L.circleMarker([p.lat, p.lng], { radius: 10, weight: 2, color: '#fff', fillOpacity: 0.9, fillColor: colour[p.tone ?? 'primary'] })
        .bindTooltip(p.label)
        .on('click', () => onSelect?.(p.id))
        .addTo(g)
    }
    if (pins.length) map.current.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng])).pad(0.3), { maxZoom: 13 })
  }, [pins, onSelect])

  return <div ref={box} style={{ height, borderRadius: 'var(--radius)', zIndex: 0 }} role="region" aria-label="map" />
}
```
Load it lazily wherever it is used: `const MapView = lazy(() => import('../components/MapView.js'))` inside `<Suspense fallback={<Loading />}>`, so Leaflet (~40KB gz) is downloaded only on map screens.

`--primary` exists from Task 14. Until then, `MapView` falls back: `colour.primary || '#2e7d32'`.

- [ ] **Step 6: Screens**

- `FarmerMap.tsx` at `/shop/map`: a category chip row (reuse the categories list), `MapView` of `pins` with `label = name + ' · ' + village`, and below it the tapped farmer's card with a button to `/shop/farmer/:farmerId`. Also give a text list of the same pins under the map, because a map alone fails a person who cannot read one. Link it from the Browse home header with `IconMap` + `map.title` ("शेतकरी नकाशा" / "Farmer map"). Do not add a fifth bottom tab.
- `Trace.tsx`: replace the OSM link with a `MapView` of one pin, height 200.
- `EditProfile.tsx`: after the location is set, show a one-pin `MapView` with the exact point (his own), height 200.
- Admin `MapScreen.tsx` at `/map`, in `Shell` nav: filters crop / village / FDRI band. Farmers are `tone: 'primary'`, surveys `tone: 'accent'`, with a legend that uses words and a shape swatch.
- Dictionaries: `map.title`, `map.empty` ("नकाशावर अजून कोणी नाही" / "No farmers on the map yet"), `map.listTitle`, `map.legendFarmer`, `map.legendSurvey`.

- [ ] **Step 7: Gate and commit**

```bash
npm test && npm run typecheck && npm run build
git add -A
git commit -m "Farmer map for buyers and an exact map for admins

Leaflet over OpenStreetMap, loaded only on map screens. Buyers see
verified farmers with produce on sale, rounded to about a kilometre and
only with consent; admins see exact points with crop, village and FDRI
filters.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Price hint, demand/supply chart, voice search

**Files:**
- Create: `backend/src/insights/price.ts`, `backend/src/routes/insights.routes.ts`, `backend/tests/price-hint.test.ts`, `frontend/src/components/PriceHint.tsx`, `admin/src/screens/Demand.tsx`
- Modify: `backend/src/config.ts`, `backend/src/index.ts`, `backend/.env.example`, `backend/src/routes/admin.routes.ts`, `frontend/src/screens/farmer/{UploadProduct,EditProduct}.tsx`, `frontend/src/screens/customer/Browse.tsx`, `frontend/src/lib/useVoiceInput.ts`, `frontend/src/lib/api.ts`, `admin/src/lib/api.ts`, `admin/src/App.tsx`, `admin/src/components/Shell.tsx`, dictionaries

**Interfaces:**
- Consumes: `cropById`, `Unit`.
- Produces:
  - `median(values: number[]): number | undefined`
  - `perUnitFromQuintal(pricePerQuintal: number, unit: Unit): number | undefined` — kg → /100, quintal → ×1, other units → undefined
  - `platformPrice(db, cropId, unit, now?): { median?: number; listings: number; orders: number }`
  - `parseAgmarknet(json: unknown): { market: string; date: string; modal: number } | undefined` (most recent record)
  - `mandiPrice(cropId, fetcher?, now?): Promise<{ market: string; date: string; perQuintal: number } | undefined>` — 6h cache, never throws
  - `GET /api/insights/price?cropId=&unit=` → `{ platform: {...}, mandi?: { market, date, price } }` (farmer session)
  - `GET /api/admin/demand?days=30` → `{ rows: { cropId, ordered: number, listed: number, unit: Unit }[] }`
  - `DATA_GOV_IN_API_KEY` env (optional)

- [ ] **Step 1: Check the live API shape once, by hand**

Get a free key at https://data.gov.in (Sign up → My Account → API key). Then:
```bash
curl -s "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=$KEY&format=json&limit=3&filters%5Bstate.keyword%5D=Maharashtra&filters%5Bcommodity%5D=Onion" | head -c 1500
```
Expected: JSON with `records: [{ state, district, market, commodity, arrival_date, modal_price, ... }]`. If `state.keyword` returns nothing, retry with `filters%5Bstate%5D=Maharashtra` and use whichever works in `price.ts` below. Record the working filter names in the comment above `mandiUrl`. Try the district as both `Dharashiv` and `Osmanabad` (the feed may still use the old name). Without a key, skip this step; the tests below use a fixture.

- [ ] **Step 2: Write the failing test**

`backend/tests/price-hint.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { median, perUnitFromQuintal, platformPrice, parseAgmarknet, mandiPrice } =
  await import('../src/insights/price.js')
const { emptyDb } = await import('../src/db/seed.js')

/**
 * Advice, never a default. The farmer sees what others here ask and what
 * the mandi paid, with the source beside each number, and types his own.
 */

test('median of an odd and an even list; nothing for nothing', () => {
  assert.equal(median([30, 10, 20]), 20)
  assert.equal(median([10, 20, 30, 40]), 25)
  assert.equal(median([]), undefined)
})

test('a quintal price becomes a kilo price; dozens and pieces get none', () => {
  assert.equal(perUnitFromQuintal(2800, 'kg'), 28)
  assert.equal(perUnitFromQuintal(2800, 'quintal'), 2800)
  assert.equal(perUnitFromQuintal(2800, 'dozen'), undefined)
  assert.equal(perUnitFromQuintal(2800, 'piece'), undefined)
})

test('platform price counts live listings of the same crop and unit only', () => {
  const db = emptyDb()
  const f = { id: 'f', status: 'ACTIVE', isOpen: true } as never
  db.farmers.push(f)
  const p = (id: string, price: number, unit = 'kg', status = 'LIVE', cropId = 'onion') =>
    ({ id, farmerId: 'f', cropId, unit, price, status }) as never
  db.products.push(p('a', 20), p('b', 30), p('c', 999, 'quintal'), p('d', 999, 'kg', 'DRAFT'), p('e', 999, 'kg', 'LIVE', 'tomato'))
  const r = platformPrice(db, 'onion', 'kg')
  assert.equal(r.median, 25)
  assert.equal(r.listings, 2)
})

test('the newest mandi record wins', () => {
  const r = parseAgmarknet({ records: [
    { market: 'Tuljapur', arrival_date: '20/09/2026', modal_price: '2500' },
    { market: 'Dharashiv', arrival_date: '24/09/2026', modal_price: '2800' },
  ] })
  assert.deepEqual(r, { market: 'Dharashiv', date: '2026-09-24', modal: 2800 })
  assert.equal(parseAgmarknet({ records: [] }), undefined)
  assert.equal(parseAgmarknet('garbage'), undefined)
})

test('a failing feed is an absent line, not an error', async () => {
  const boom = async () => { throw new Error('network') }
  assert.equal(await mandiPrice('onion', boom), undefined)
  assert.equal(await mandiPrice('other', async () => ({ records: [] })), undefined, 'no commodity name, no call')
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd backend && node --import tsx --test tests/price-hint.test.ts` → FAIL.

- [ ] **Step 4: Implement**

`backend/src/config.ts`: `export const DATA_GOV_IN_API_KEY = process.env.DATA_GOV_IN_API_KEY?.trim() || ''`, with a banner line `Mandi prices   on` / `off (no DATA_GOV_IN_API_KEY)`. Add the variable, commented, to `backend/.env.example`.

`backend/src/insights/price.ts`:
```ts
import type { Db } from '../db/seed.js'
import type { Unit } from '@shared/produce.js'
import { cropById } from '@shared/crops.js'
import { canSellNow } from '@shared/farmer.js'
import { DATA_GOV_IN_API_KEY } from '../config.js'

export function median(values: number[]): number | undefined {
  if (!values.length) return undefined
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100
}

/** Mandi prices are per quintal (100 kg). Only kg and quintal convert honestly. */
export function perUnitFromQuintal(pricePerQuintal: number, unit: Unit): number | undefined {
  if (unit === 'quintal') return pricePerQuintal
  if (unit === 'kg') return Math.round(pricePerQuintal) / 100
  return undefined
}

const DAY = 86_400_000

export function platformPrice(db: Db, cropId: string, unit: Unit, now = Date.now()) {
  const farmers = new Map(db.farmers.map((f) => [f.id, f]))
  const live = db.products.filter((p) => p.cropId === cropId && p.unit === unit && p.status === 'LIVE'
    && farmers.get(p.farmerId) && canSellNow(farmers.get(p.farmerId)!))
  const productIds = new Set(db.products.filter((p) => p.cropId === cropId && p.unit === unit).map((p) => p.id))
  const recent = db.orders.filter((o) => o.status === 'DELIVERED' && now - Date.parse(o.placedAt) <= 30 * DAY)
    .flatMap((o) => o.items.filter((i) => productIds.has(i.productId)).map((i) => i.price))
  return { median: median([...live.map((p) => p.price), ...recent]), listings: live.length, orders: recent.length }
}

export function parseAgmarknet(json: unknown): { market: string; date: string; modal: number } | undefined {
  const records = (json as { records?: unknown })?.records
  if (!Array.isArray(records)) return undefined
  const rows = records.flatMap((r) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(r?.arrival_date ?? ''))
    const modal = Number(r?.modal_price)
    return m && modal > 0 ? [{ market: String(r.market ?? ''), date: `${m[3]}-${m[2]}-${m[1]}`, modal }] : []
  })
  return rows.sort((a, b) => b.date.localeCompare(a.date))[0]
}

type Fetcher = (url: string) => Promise<unknown>
const defaultFetcher: Fetcher = async (url) => (await fetch(url, { signal: AbortSignal.timeout(8000) })).json()
const cache = new Map<string, { at: number; value: Awaited<ReturnType<typeof mandiPrice>> }>()
const SIX_HOURS = 6 * 3_600_000

/**
 * Agmarknet "Current daily price" resource. Filter names verified on
 * <date of Task 11 Step 1> — update this line if the feed changes them.
 * District first (the feed may still say Osmanabad), then the state.
 */
function mandiUrls(commodity: string): string[] {
  const base = `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=${DATA_GOV_IN_API_KEY}&format=json&limit=50`
  const c = `&filters%5Bcommodity%5D=${encodeURIComponent(commodity)}`
  const st = '&filters%5Bstate.keyword%5D=Maharashtra'
  return [
    `${base}${c}${st}&filters%5Bdistrict%5D=Dharashiv`,
    `${base}${c}${st}&filters%5Bdistrict%5D=Osmanabad`,
    `${base}${c}${st}`,
  ]
}

export async function mandiPrice(cropId: string, fetcher: Fetcher = defaultFetcher, now = Date.now()) {
  const commodity = cropById(cropId)?.agmarknet
  if (!commodity) return undefined
  const hit = cache.get(cropId)
  if (hit && now - hit.at < SIX_HOURS) return hit.value
  let value: { market: string; date: string; perQuintal: number } | undefined
  try {
    for (const url of mandiUrls(commodity)) {
      const rec = parseAgmarknet(await fetcher(url))
      if (rec) { value = { market: rec.market, date: rec.date, perQuintal: rec.modal }; break }
    }
  } catch (e) {
    console.warn('[insights] mandi price failed:', (e as Error).message)
  }
  cache.set(cropId, { at: now, value })
  return value
}
```
`backend/src/routes/insights.routes.ts`:
```ts
import { Router } from 'express'
import { requireRole } from '../middleware/auth.js'
import { getDb } from '../db/store.js'
import { UNITS, type Unit } from '@shared/produce.js'
import { cropById } from '@shared/crops.js'
import { DATA_GOV_IN_API_KEY } from '../config.js'
import { mandiPrice, perUnitFromQuintal, platformPrice } from '../insights/price.js'

export const insightsRouter: Router = Router()

insightsRouter.get('/price', requireRole('farmer'), async (req, res) => {
  const cropId = String(req.query.cropId ?? '')
  const unit = String(req.query.unit ?? '') as Unit
  if (!cropById(cropId) || !UNITS.includes(unit)) {
    res.status(400).json({ error: 'Bad crop or unit', messageMr: 'पीक आणि एकक निवडा' }); return
  }
  const platform = platformPrice(getDb(), cropId, unit)
  const m = DATA_GOV_IN_API_KEY ? await mandiPrice(cropId) : undefined
  const price = m && perUnitFromQuintal(m.perQuintal, unit)
  res.json({ platform, mandi: m && price !== undefined ? { market: m.market, date: m.date, price } : undefined })
})
```
Mount it in `index.ts`: `app.use('/api/insights', insightsRouter)`.

Demand in `admin.routes.ts`:
```ts
adminRouter.get('/demand', (req, res) => {
  const db = getDb()
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30))
  const since = Date.now() - days * 86_400_000
  const productById = new Map(db.products.map((p) => [p.id, p]))
  const rows = new Map<string, { cropId: string; unit: Unit; ordered: number; listed: number }>()
  const row = (cropId: string, unit: Unit) => {
    const k = `${cropId}|${unit}`
    if (!rows.has(k)) rows.set(k, { cropId, unit, ordered: 0, listed: 0 })
    return rows.get(k)!
  }
  for (const p of db.products) if (p.status === 'LIVE') row(p.cropId, p.unit).listed += p.stock
  for (const o of db.orders) {
    if (Date.parse(o.placedAt) < since || o.status === 'REJECTED' || o.status === 'CANCELLED') continue
    for (const i of o.items) { const p = productById.get(i.productId); if (p) row(p.cropId, p.unit).ordered += i.qty }
  }
  res.json({ rows: [...rows.values()].sort((a, b) => b.ordered - a.ordered) })
})
```

- [ ] **Step 5: Run to verify pass**

Run: `cd backend && node --import tsx --test tests/price-hint.test.ts` → PASS.

- [ ] **Step 6: Frontend and admin**

- `PriceHint.tsx`: takes `{ cropId, unit }`, calls `api.priceHint(cropId, unit)`, renders nothing while loading, and on error renders two lines at most:
  - `hint.platform` — "इथे इतर शेतकरी: ₹{price} / {unit} ({n} जाहिराती)" / "Others here ask ₹{price} / {unit} ({n} listings)", shown only when `platform.median` exists
  - `hint.mandi` — "{market} बाजार समिती, {date}: ₹{price} / {unit}" / "{market} APMC, {date}: ₹{price} / {unit}"

  Under both, a small `hint.note` — "हा फक्त अंदाज आहे. किंमत तुम्हीच ठरवा." / "This is only a guide. You set the price." It never writes into the price field.
- Put `<PriceHint>` under the price input in `UploadProduct.tsx` (price step) and `EditProduct.tsx`.
- Voice search: in `Browse.tsx`, the search box becomes a `VoiceInput` (it already owns its mic). `useVoiceInput.ts` picks the recogniser language from the app language: `{ mr: 'mr-IN', en: 'en-IN', hi: 'hi-IN' }[lang]`. Check how it is chosen today and change only that mapping.
- Admin `Demand.tsx` at `/demand`: a horizontal bar pair per crop (ordered vs listed). Follow the reference's chart standards (FEATURE-SPEC §13.3 and the existing `Donut.tsx` / Impact styling): series 1 leaf green = ordered, series 2 maroon = listed, value labels on the bars, and a period select 7/30/90 days. Include a table view under the chart with the same numbers.
- `api.ts` (both): `priceHint`, `demand`.

- [ ] **Step 7: Gate and commit**

```bash
npm test && npm run typecheck && npm run build
git add -A
git commit -m "Price hints, a demand/supply chart and voice search

The listing form shows the median asking price here and, with a
data.gov.in key, the latest Agmarknet modal price converted to the
listing's unit (kg and quintal only). Admins get ordered-vs-listed per
crop. The catalogue search takes speech in Marathi, Hindi or English.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Survey entry, research tables and CSV

**Files:**
- Create: `shared/src/research.ts`, `shared/src/csv.ts`, `backend/src/routes/surveys.routes.ts`, `backend/tests/research.test.ts`, `admin/src/screens/Surveys.tsx`, `admin/src/screens/Research.tsx`, `admin/tests/csv.test.ts`
- Modify: `shared/src/types.ts`, `backend/src/db/seed.ts`, `backend/src/db/firestore.ts`, `backend/src/index.ts`, `backend/src/routes/admin.routes.ts` (map `surveys`), `admin/src/App.tsx`, `admin/src/components/Shell.tsx`, `admin/src/lib/api.ts`, `admin/src/i18n/strings.ts`

**Interfaces:**
- Consumes: `FdriAnswers`, `fdriScore`, `fdriBand`, `cleanFdri`, profile lists and `pick`/`pickMany` (Task 6).
- Produces:
  - `Survey { id; village; taluka?; phone?; ageGroup?; education?; landholding?; farmerTypes: FarmerType[]; crops: string[]; sellingChannels: SellingChannel[]; problems: SellingProblem[]; fdri: Partial<FdriAnswers>; lat?; lng?; photoUrl?; linkedFarmerId?; enteredBy: string; at: string }`
  - `Db.surveys: Survey[]`
  - `Respondent { source: 'farmer' | 'survey'; ageGroup?; education?; landholding?; fdri: Partial<FdriAnswers> }`
  - `respondents(farmers, surveys): Respondent[]` (unlinked surveys + non-closed farmers)
  - `researchTables(rows: Respondent[]): ResearchTable[]` where `ResearchTable = { id: 1..9; titleEn; titleMr; headers: string[]; rows: (string|number)[][] }`
  - `toCsv(headers: string[], rows: (string|number)[][]): string` — BOM + CRLF, quoted where needed
  - Routes (admin): `GET /api/admin/surveys`, `POST /api/admin/surveys`, `DELETE /api/admin/surveys/:id`, `POST /api/admin/surveys/:id/link { farmerId }`, `GET /api/admin/research`

- [ ] **Step 1: Write the failing tests**

`backend/tests/research.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { researchTables, respondents } from '@shared/research.js'

const yes = (n: number) => Object.fromEntries(
  ['smartphone', 'internet', 'whatsapp', 'digitalPayment', 'onlineMarketInfo', 'digitalPromotion',
   'onlineSelling', 'directSelling', 'packagingBranding', 'trainingWillingness'].map((k, i) => [k, i < n]))

/**
 * The paper's Tables 1-9, from registered farmers and typed-in
 * questionnaires together. A skipped answer is a row of its own ("not
 * answered") - dropping it would quietly change every percentage.
 */

const farmers = [
  { id: 'f1', status: 'ACTIVE', ageGroup: '25-35', education: 'graduate', landholding: 'small', fdri: yes(9) },
  { id: 'f2', status: 'CLOSED', ageGroup: '25-35', fdri: yes(2) },
] as never[]
const surveys = [
  { id: 's1', ageGroup: '36-50', education: 'primary', landholding: 'medium', fdri: yes(5) },
  { id: 's2', fdri: { smartphone: true } },
  { id: 's3', ageGroup: 'o60', fdri: yes(1), linkedFarmerId: 'f1' },
] as never[]

test('closed farmers and linked surveys are not counted twice', () => {
  const r = respondents(farmers, surveys)
  assert.equal(r.length, 3, 'f1, s1, s2')
})

test('Table 1 counts age groups with a not-answered row and percentages', () => {
  const t1 = researchTables(respondents(farmers, surveys)).find((t) => t.id === 1)!
  const row = (label: string) => t1.rows.find((r) => r[0] === label)
  assert.deepEqual(row('25-35')?.slice(1), [1, 33.3])
  assert.deepEqual(row('36-50')?.slice(1), [1, 33.3])
  assert.deepEqual(row('not answered')?.slice(1), [1, 33.3])
})

test('Table 8 bands: 9 is high, 5 moderate, 1 low', () => {
  const t8 = researchTables(respondents(farmers, surveys)).find((t) => t.id === 8)!
  const band = (b: string) => t8.rows.find((r) => r[0] === b)?.[1]
  assert.equal(band('high'), 1)
  assert.equal(band('moderate'), 1)
  assert.equal(band('low'), 1)
})

test('Table 9 cross-tabs band against direct-selling willingness', () => {
  const t9 = researchTables(respondents(farmers, surveys)).find((t) => t.id === 9)!
  assert.deepEqual(t9.headers, ['FDRI band', 'Willing', 'Not willing', 'Total', 'Willing %'])
  assert.deepEqual(t9.rows.find((r) => r[0] === 'high'), ['high', 1, 0, 1, 100])
  assert.deepEqual(t9.rows.find((r) => r[0] === 'low'), ['low', 0, 1, 1, 0])
})

test('all nine tables exist, numbered 1-9', () => {
  assert.deepEqual(researchTables([]).map((t) => t.id), [1, 2, 3, 4, 5, 6, 7, 8, 9])
})
```
`admin/tests/csv.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toCsv } from '@shared/csv.js'

test('BOM first so Excel reads Marathi; quotes and commas survive', () => {
  const s = toCsv(['गाव', 'n'], [['अणदूर, ता. तुळजापूर', 3], ['say "hi"', 1]])
  assert.ok(s.startsWith('\uFEFF'))
  assert.equal(s, '\uFEFFगाव,n\r\n"अणदूर, ता. तुळजापूर",3\r\n"say ""hi""",1\r\n')
})
```
Check that `admin/tsconfig` and the admin Vite alias resolve `@shared/*` (they do in the reference). If `admin/tests` cannot import `@shared`, put the CSV test in `backend/tests` instead.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --import tsx --test tests/research.test.ts` → FAIL.

- [ ] **Step 3: Implement csv.ts and research.ts**

`shared/src/csv.ts`:
```ts
/** UTF-8 with a BOM and CRLF: what Excel on a college PC opens without mangling Devanagari. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '\uFEFF' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
```
`shared/src/research.ts`:
```ts
import { FDRI_INDICATORS, fdriBand, fdriScore, type FdriAnswers, type FdriIndicator } from './fdri.js'
import { AGE_GROUPS, EDUCATION_LEVELS } from './profile.js'
import type { Farmer, Survey } from './types.js'

export interface Respondent {
  source: 'farmer' | 'survey'
  ageGroup?: string
  education?: string
  landholding?: string
  fdri: Partial<FdriAnswers>
}

export interface ResearchTable { id: number; titleEn: string; titleMr: string; headers: string[]; rows: (string | number)[][] }

const NA = 'not answered'
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0)

/**
 * Every farmer who has not closed his account, plus every questionnaire
 * not linked to one. A linked questionnaire is the same person as the
 * farmer, so counting it too would count him twice.
 */
export function respondents(farmers: Farmer[], surveys: Survey[]): Respondent[] {
  return [
    ...farmers.filter((f) => f.status !== 'CLOSED').map((f) => ({ source: 'farmer' as const, ageGroup: f.ageGroup, education: f.education, landholding: f.landholding, fdri: f.fdri ?? {} })),
    ...surveys.filter((s) => !s.linkedFarmerId).map((s) => ({ source: 'survey' as const, ageGroup: s.ageGroup, education: s.education, landholding: s.landholding, fdri: s.fdri ?? {} })),
  ]
}

/** One categorical column: count, percent, and a not-answered row when any. */
function frequency(rows: Respondent[], values: readonly string[], get: (r: Respondent) => string | undefined) {
  const counts = new Map<string, number>(values.map((v) => [v, 0]))
  let missing = 0
  for (const r of rows) {
    const v = get(r)
    if (v && counts.has(v)) counts.set(v, counts.get(v)! + 1)
    else missing++
  }
  const out: (string | number)[][] = [...counts].map(([v, n]) => [v, n, pct(n, rows.length)])
  if (missing) out.push([NA, missing, pct(missing, rows.length)])
  return out
}

/** Yes / No / not answered for one FDRI indicator. */
function yesNo(rows: Respondent[], k: FdriIndicator) {
  const yes = rows.filter((r) => r.fdri[k] === true).length
  const no = rows.filter((r) => r.fdri[k] === false).length
  const na = rows.length - yes - no
  const out: (string | number)[][] = [['yes', yes, pct(yes, rows.length)], ['no', no, pct(no, rows.length)]]
  if (na) out.push([NA, na, pct(na, rows.length)])
  return out
}

const band = (r: Respondent) => fdriBand(fdriScore(r.fdri))
const DIGITAL_USE: FdriIndicator[] = ['smartphone', 'internet', 'whatsapp', 'digitalPayment']

export function researchTables(rows: Respondent[]): ResearchTable[] {
  const freqHeaders = ['Value', 'Count', '%']
  const educations = EDUCATION_LEVELS.map((e) => e.value)

  const t2 = [...educations, NA].map((edu) => {
    const group = rows.filter((r) => (edu === NA ? !r.education || !educations.includes(r.education) : r.education === edu))
    const users = group.filter((r) => DIGITAL_USE.some((k) => r.fdri[k] === true)).length
    return [edu, group.length, users, pct(users, group.length)]
  }).filter((r) => r[1] !== 0)

  const scores = Array.from({ length: 11 }, (_, s) => s)
  const t8 = [
    ...(['low', 'moderate', 'high'] as const).map((b) => {
      const n = rows.filter((r) => band(r) === b).length
      return [b, n, pct(n, rows.length)]
    }),
    ...scores.map((s) => {
      const n = rows.filter((r) => fdriScore(r.fdri) === s).length
      return [`score ${s}`, n, pct(n, rows.length)]
    }),
  ]

  const t9 = (['low', 'moderate', 'high'] as const).map((b) => {
    const group = rows.filter((r) => band(r) === b)
    const willing = group.filter((r) => r.fdri.directSelling === true).length
    return [b, willing, group.length - willing, group.length, pct(willing, group.length)]
  })

  return [
    { id: 1, titleEn: 'Age groups of farmers', titleMr: 'शेतकऱ्यांचे वयोगट', headers: freqHeaders,
      rows: frequency(rows, AGE_GROUPS.map((a) => a.value), (r) => r.ageGroup) },
    { id: 2, titleEn: 'Digital use by education', titleMr: 'शिक्षणानुसार डिजिटल वापर',
      headers: ['Education', 'Respondents', 'Use any digital tool', '%'], rows: t2 },
    { id: 3, titleEn: 'Smartphone ownership', titleMr: 'स्मार्टफोन मालकी', headers: freqHeaders, rows: yesNo(rows, 'smartphone') },
    { id: 4, titleEn: 'Digital payment usage', titleMr: 'डिजिटल पेमेंट वापर', headers: freqHeaders, rows: yesNo(rows, 'digitalPayment') },
    { id: 5, titleEn: 'Online market information', titleMr: 'ऑनलाइन बाजारभाव माहिती', headers: freqHeaders, rows: yesNo(rows, 'onlineMarketInfo') },
    { id: 6, titleEn: 'Direct selling willingness', titleMr: 'थेट विक्रीची तयारी', headers: freqHeaders, rows: yesNo(rows, 'directSelling') },
    { id: 7, titleEn: 'Digital training requirement', titleMr: 'डिजिटल प्रशिक्षणाची गरज', headers: freqHeaders, rows: yesNo(rows, 'trainingWillingness') },
    { id: 8, titleEn: 'FDRI score', titleMr: 'FDRI गुण', headers: ['Band / score', 'Count', '%'], rows: t8 },
    { id: 9, titleEn: 'Digital readiness vs direct selling willingness', titleMr: 'डिजिटल तयारी आणि थेट विक्रीची तयारी',
      headers: ['FDRI band', 'Willing', 'Not willing', 'Total', 'Willing %'], rows: t9 },
  ]
}
```
Table 9 counts a respondent who did not answer `directSelling` as "not willing". This is deliberate and stated in the table note on the admin screen (`res.t9Note`).

Add `Survey` to `types.ts` (Interfaces shape). Add `surveys: Survey[]` to `Db`, `emptyDb`, `withDefaults`, and `'surveys'` to the Firestore collection list.

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && node --import tsx --test tests/research.test.ts` and `cd admin && node --import tsx --test tests/csv.test.ts` → PASS.

- [ ] **Step 5: Routes**

`backend/src/routes/surveys.routes.ts` — mounted under the admin router so `requireRole('admin')` already applies (`adminRouter.use('/surveys', surveysRouter)`, and `adminRouter.get('/research', …)`):
```ts
surveysRouter.get('/', (_req, res) => { res.json({ surveys: getDb().surveys }) })

surveysRouter.post('/', (req, res) => {
  const b = req.body ?? {}
  const village = String(b.village ?? '').trim()
  if (!village) { res.status(400).json({ error: 'Village required', messageMr: 'गाव आवश्यक आहे', fields: { village: 'गाव आवश्यक आहे' } }); return }
  const phone = b.phone ? normalizePhone(String(b.phone)) : undefined
  if (phone && !isValidPhone(phone)) { res.status(400).json({ error: 'Bad phone', messageMr: '10 अंकी मोबाईल नंबर टाका', fields: { phone: 'invalid' } }); return }
  const fdriIn = (b.fdri && typeof b.fdri === 'object') ? b.fdri : {}
  // Only answered questions are stored: a skipped one must stay "not answered", not "no".
  const fdri = Object.fromEntries(FDRI_INDICATORS.filter((k) => typeof fdriIn[k] === 'boolean').map((k) => [k, fdriIn[k]]))
  const survey: Survey = {
    id: newId('sv'), village, taluka: String(b.taluka ?? '').trim() || undefined, phone,
    ageGroup: pick(AGE_GROUPS, b.ageGroup), education: pick(EDUCATION_LEVELS, b.education),
    landholding: pick(LANDHOLDINGS, b.landholding), farmerTypes: pickMany(FARMER_TYPES, b.farmerTypes),
    crops: Array.isArray(b.crops) ? b.crops.filter((c: unknown) => cropById(String(c))) : [],
    sellingChannels: pickMany(SELLING_CHANNELS, b.sellingChannels), problems: pickMany(SELLING_PROBLEMS, b.problems),
    fdri, ...(isValidLatLng(b.lat, b.lng) ? { lat: b.lat, lng: b.lng } : {}),
    photoUrl: typeof b.photoUrl === 'string' ? b.photoUrl : undefined,
    enteredBy: adminName(req), at: new Date().toISOString(),
  }
  // Same phone already registered as a farmer: link now, count once.
  const farmer = phone ? getDb().farmers.find((f) => samePhone(f.phone, phone)) : undefined
  if (farmer) survey.linkedFarmerId = farmer.id
  getDb().surveys.push(survey)
  save()
  res.json({ survey })
})

surveysRouter.post('/:id/link', (req, res) => {
  const db = getDb()
  const s = db.surveys.find((x) => x.id === req.params.id)
  const f = db.farmers.find((x) => x.id === String(req.body?.farmerId ?? ''))
  if (!s || !f) { res.status(404).json({ error: 'Not found', messageMr: 'सापडले नाही' }); return }
  s.linkedFarmerId = f.id
  save()
  res.json({ survey: s })
})

surveysRouter.delete('/:id', (req, res) => {
  const db = getDb()
  const i = db.surveys.findIndex((x) => x.id === req.params.id)
  if (i < 0) { res.status(404).json({ error: 'Not found', messageMr: 'सापडले नाही' }); return }
  db.surveys.splice(i, 1)
  save()
  res.json({ ok: true })
})
```
`adminRouter.get('/research', (_req, res) => { const db = getDb(); res.json({ tables: researchTables(respondents(db.farmers, db.surveys)), n: … }) })`, where `n = { farmers, surveys }` are the two source counts. `GET /admin/map` now fills `surveys` from rows with coordinates, with `fdriBand: fdriBand(fdriScore(s.fdri))`.

- [ ] **Step 6: Admin screens**

- `Surveys.tsx` at `/surveys`: a "New survey" form in a `<dialog>`. Fields: village, taluka, phone (optional), age group, education, landholding (selects), farmer types, crops, channels, problems (checkbox groups), the ten FDRI questions as Yes / No / Not asked radio triples (default Not asked), and a "Use this device's location" button. Below it, the list of surveys: newest first, the row shows village, date, entered by, FDRI score and band pill, linked farmer, with Delete behind `Confirm` ("This questionnaire leaves every research table."). A count line: "{n} questionnaires · {m} linked to farmers".
- `Research.tsx` at `/research`: a heading "Respondents: {farmers} registered farmers + {surveys} questionnaires = {total}", then each table as an HTML `<table>` with its title in English and Marathi, a "Download CSV" button per table and a "Download all" that builds one CSV per table in sequence (`toCsv` + `URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))`, file names `table-<id>.csv`). Show `res.t9Note` under Table 9.
- `Shell.tsx`: add Surveys, Research, Map and Demand links.
- Admin dictionaries: every label in both languages.

- [ ] **Step 7: Gate and commit**

```bash
npm test && npm run typecheck && npm run build
git add -A
git commit -m "Survey entry and the paper's research tables

Coordinators type in questionnaires for farmers without an account.
Tables 1-9 are computed over registered farmers plus unlinked surveys,
with skipped answers kept as 'not answered', and each downloads as a
CSV that Excel opens with Marathi intact.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Hindi

**Files:**
- Modify: `frontend/src/i18n/strings.ts`, `frontend/src/i18n/I18nProvider.tsx`, `frontend/tests/i18n.test.ts`, `admin/src/i18n/strings.ts`, `admin/src/i18n/I18nProvider.tsx`, `admin/tests/i18n.test.ts`, `frontend/src/components/ui.tsx` (`LanguagePicker`), every screen that reads `lang === 'en' ? … : …` from shared label objects (`FDRI_QUESTIONS`, profile lists, `CROPS`)

**Interfaces:**
- Consumes: all dictionaries as they stand after Task 12.
- Produces: `LangCode = 'mr' | 'en' | 'hi'`; `label(o: { mr: string; en: string; hi: string }, lang: LangCode): string` in `frontend/src/lib/label.ts` (and an admin copy).

- [ ] **Step 1: Extend the parity test first**

In `frontend/tests/i18n.test.ts`, change the parity assertions from `mr`↔`en` to all three dictionaries having the same key set. Add: "every `hi` value contains Devanagari unless the `en` value is identical (brand names, UPI)". Do the same in `admin/tests/i18n.test.ts`.
Run: `npm test -w @f2c/frontend` → FAIL (no `hi` dictionary).

- [ ] **Step 2: Add the dictionary and provider support**

```ts
export const LANGS = [
  { code: 'mr', label: 'मराठी', sub: 'Marathi' },
  { code: 'hi', label: 'हिंदी', sub: 'Hindi' },
  { code: 'en', label: 'English', sub: 'इंग्रजी' },
] as const
```
`const hi: Record<string, string> = { … }` has every key of `en`, written as Hindi, not word-for-word from Marathi. Use simple everyday Hindi a farmer in Dharashiv district would hear (उपज, दाम, किसान, ग्राहक, ऑर्डर, भुगतान). `dictionaries = { mr, en, hi }`. `I18nProvider` reads the stored value: `const v = localStorage.getItem(STORAGE_KEY); return v === 'en' || v === 'hi' ? v : 'mr'`.

`frontend/src/lib/label.ts`:
```ts
import type { LangCode } from '../i18n/strings.js'
export const label = (o: { mr: string; en: string; hi: string }, lang: LangCode) => o[lang]
```
Replace each `lang === 'en' ? o.en : o.mr` (`grep -rn "=== 'en' ?" frontend/src admin/src`) with `label(o, lang)`.

- [ ] **Step 3: Gate and commit**

Run: `npm test && npm run typecheck && npm run build` → PASS.
```bash
git add -A
git commit -m "Add Hindi as a third language

Every string exists in Marathi, Hindi and English; the parity test now
holds all three. Marathi stays the default.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Theme, branding, landing page and a gender-neutral copy pass

**Files:**
- Modify: `frontend/src/styles/theme.css`, `admin/src/styles/admin.css`, every `.tsx` with `var(--maroon` (6 files, found by grep), `frontend/src/components/QrCode.tsx` (`QR_COLOURS`), `frontend/src/screens/landing/{Landing,CollegeCard,HeroArt,PhotoRotator}.tsx`, `frontend/index.html`, `admin/index.html`, `frontend/public/*`, `admin/public/*`, `frontend/src/assets/*`, all dictionaries, `frontend/tests/marathi.test.ts`, `admin/tests/marathi.test.ts`

**Interfaces:**
- Consumes: everything.
- Produces: tokens `--primary`, `--primary-dark`, `--primary-soft`, `--leaf`, `--leaf-dark`, `--leaf-mid`, `--leaf-soft`; `--maroon*` kept as the accent.

- [ ] **Step 1: Tokens**

In `theme.css` `:root` (THEME SWAP POINT), add before `--maroon`:
```css
  --leaf: #2e7d32;            /* primary action, header, active tab - white text 5.1:1 */
  --leaf-dark: #1b5e20;       /* pressed */
  --leaf-mid: #43a047;
  --leaf-soft: #e8f5e9;       /* tinted surface */

  --primary: var(--leaf);
  --primary-dark: var(--leaf-dark);
  --primary-soft: var(--leaf-soft);
```
Also set `--bg: #f7f5ec;`, `--ok: var(--leaf-dark);`, `--ok-soft: var(--leaf-soft);`, `--series1: #2e7d32; --series2: #7b1e2e; --series3: #b6851b;`. Rewrite the palette comment for the new roles: leaf green for actions, maroon for price, names and headings, gold for stars.

- [ ] **Step 2: Move action uses to --primary**

```bash
grep -n "var(--maroon" frontend/src/styles/theme.css admin/src/styles/admin.css frontend/src --include=*.tsx -r
```
For each hit, decide: a button, header/app bar, active tab, focus ring, progress dot, link-button background or selected chip → `--primary` (and `--maroon-dark` → `--primary-dark`, `--maroon-soft` behind a selected control → `--primary-soft`). A price, farmer name, section heading or inline text link → keep `--maroon`. Apply the same split in `admin.css`. `QR_COLOURS.dark` becomes `'#1b5e20ff'`.

Check contrast. With the app running (`npm run dev`), open `/`, `/login/farmer`, `/shop` and `/farmer`. Every white-on-green text must sit on `--primary` or `--primary-dark` (≥ 4.5:1), never on `--leaf-mid`.

- [ ] **Step 3: Logo and names**

The logo files copied in Task 1 are the mark the user supplied (same portrait, gold ring). Keep `frontend/src/assets/logo.png`, `admin/src/assets/logo.png` and both `public/` favicons, with no border and no background. Update:
- `app.name` → mr "शेतकऱ्यापासून थेट ग्राहकापर्यंत", en "Farmers to Consumer", hi "किसान से सीधे ग्राहक तक"
- `app.nameShort` (new) → "Farmers to Consumer" in all three (brand)
- `app.tagline` → mr "शेतकरी समृद्ध | ग्राहक सुरक्षित | शेती टिकाऊ", en "Prosperous farmers · Safe buyers · Sustainable farming", hi "समृद्ध किसान | सुरक्षित ग्राहक | टिकाऊ खेती"
- `<title>` in both `index.html` files: "Farmers to Consumer" and "Farmers to Consumer · Admin"
- `grep -rn "Shantai\|शांताई\|SMB\|महिला" frontend/src admin/src backend/src shared/src` must return nothing afterwards.

- [ ] **Step 4: Landing page, following the poster**

`Landing.tsx` sections, top to bottom, each a `Card` with a heading and short lines (no emoji, icons from `icons.tsx`):
1. Hero: logo, `app.name`, `app.tagline`, `lp.mission` ("शेतकऱ्यांच्या मेहनतीचे योग्य मूल्य आणि ग्राहकांना शुद्ध, सुरक्षित व ताजे अन्नधान्य — हेच आमचे ध्येय!"), and the four entry buttons (farmer: register / login; buyer: register / login). The farmer ones use `door--primary`.
2. `lp.needTitle` प्रकल्पाची गरज — the five poster lines.
3. `lp.workflowTitle` कार्यप्रवाह — six steps with icons: शेतकरी नोंदणी → उत्पादनाची माहिती अपलोड → किंमत अंदाज → डिजिटल बाजारपेठ → QR कोडद्वारे माहिती → वितरण व ट्रॅकिंग. The poster's "AI द्वारे विश्लेषण" is worded "किंमत अंदाज", because this build has no AI (spec §5.8).
4. `lp.featuresTitle` प्रकल्पाची वैशिष्ट्ये — the web portal, price hint, QR traceability, GPS farmer map, digital payment (UPI), organic/local promotion, three languages.
5. `lp.benefitsTitle` संभाव्य परिणाम — the poster's five lines.
6. `CollegeCard`: जवाहर कला, विज्ञान व वाणिज्य महाविद्यालय, अणदूर, ता. तुळजापूर, जि. धाराशिव. Aavishkar Research Convention. संशोधक: कु. गायत्री पाटील (बी. कॉम. 3). मार्गदर्शक: प्रा. डॉ. डी. डी. कदम, प्रा. डॉ. एस. ए. इनामदार, प्रा. आर. व्हि. पवार, प्रा. कु. डी. एस. गणाचारी. वाणिज्य विभाग.
7. Footer: `lp.footerQuote` "शेतकऱ्यांच्या श्रमाला, ग्राहकांच्या आरोग्यासाठी तंत्रज्ञानाची साथ!", the help phone, and the links "Farmer map" and "Help".

`PhotoRotator`/`HeroArt`: remove the reference's photos of women's products. Use the category photos kept in Task 7 if any fit (vegetables, grains). Otherwise drop the rotator and keep `HeroArt` as a simple CSS field illustration using the tokens.

- [ ] **Step 5: Gender-neutral Marathi and Hindi**

The reference addresses women. Farmers are men and women.
```bash
grep -n "करते'\|आलीस\|विक्रेती\|उद्योजिका\|महिला\|ताई\|तिच\|ती \|तुझ" frontend/src/i18n/strings.ts admin/src/i18n/strings.ts
```
Rewrite each hit in the plural-respectful form Marathi uses for any adult (`तुम्ही … करता`, `नंतर करू`). `common.skip` becomes `नंतर करू`. Per `docs/MARATHI-STYLE.md`, keep ऑर्डर neuter. Then update `CLAUDE.md`'s note that `नंतर करते` is deliberate: it is now `नंतर करू`, for the same reason (the reader's own first-person voice), made neutral. Do the same pass on Hindi (`करूँगी` → `करेंगे`). Update `marathi.test.ts` if it pins any of the old strings.

- [ ] **Step 6: Gate, look, commit**

Run: `npm test && npm run typecheck && npm run build` → PASS.
Run `npm run dev:all` and walk through landing → register farmer → upload listing → buyer register → order → farmer accept → pay → pack → deliver → review, once in each language. Screenshot the landing and one screen per role at 360px width and check that nothing overflows.
```bash
git add -A
git commit -m "Leaf green and maroon theme, Farmers to Consumer branding, poster landing

Primary actions move to a --primary token (leaf green); maroon stays
for prices, names and headings. Copy no longer assumes the reader is a
woman, in Marathi or Hindi.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Documentation and deployment

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/DEPLOY.md`, `docs/FEATURE-SPEC.md`, `docs/MANUAL-TEST-PLAN.md`, `docs/DEMO-SCRIPT.md`, `docs/TRAINING-CHECKLIST.md`, `docs/FUTURE-SCOPE.md`, `docs/CAPACITY.md`, `backend/.env.example`, `frontend/.env.example`, `.github/workflows/backup.yml`, `frontend/vercel.json`, `admin/vercel.json`
- Delete: `brag` output, if any was copied

**Interfaces:**
- Consumes: the finished app.
- Produces: docs that match the code; a deployed API and two Vercel sites.

- [ ] **Step 1: CLAUDE.md**

Update to the new product. Keep every architecture section that still holds (persistence, bulk-delete guard, sessions minus OTP, account close, order state machine plus pickup, money after acceptance, cancel, UTR/UPI rules, one farmer per cart, delivery area as a hint, public visibility, scroll memory, draft keys, photos, reviews, updates list, reports, complaints, sorting, config, conventions, design rules, deployment shape minus the APK). Add sections for: verification, password auth, FDRI, location privacy, produce rules, pickup, trace QR, maps, price hint, research module, three languages. The test counts in "Commands" must be the real ones from `npm test`.

- [ ] **Step 2: README, spec, test plan, demo**

- `README.md`: name, layout, run. Demo login: seed with `SEED_DEMO_DATA=true`, then `npm run admin -- set-password 9822011223 123456` and sign in at `/login/farmer`. Admin account creation as before.
- `docs/FEATURE-SPEC.md`: replace it with a short pointer to the design spec in `docs/superpowers/specs/`, plus the reference sections that still apply (order lifecycle, money flow, rural design rules).
- `docs/MANUAL-TEST-PLAN.md`: rewrite the flows for password login, forgotten password (admin reset), farmer verification, listing with harvest date, pickup order, trace QR scan from a second phone, map, price hint with and without the key, survey entry, research CSV opened in Excel, and Hindi.
- `docs/DEMO-SCRIPT.md`: the Aavishkar demo, 5 minutes: poster → landing → farmer registers (FDRI) → admin verifies → listing with price hint → QR printed → buyer scans the QR → orders → farmer accepts → UPI pay → pickup → review → admin research tables.
- `docs/TRAINING-CHECKLIST.md`: for field coordinators. Cover registering a farmer on their own phone, writing the password down with them, the verification visit, and entering a paper questionnaire.
- `docs/FUTURE-SCOPE.md`: keep items that still apply. Add from the paper: Android app, AI price recommendation, crop disease detection, demand forecasting, digital weighing receipt, FPO integration, cold chain.
- `docs/CAPACITY.md`: add `credentials` and `surveys` to the read budget.

- [ ] **Step 3: DEPLOY.md and environment**

Rewrite for new names:
- Cloud Run service `f2c-api`, region `asia-south1`, `--max-instances=1`, `--no-cpu-throttling`.
- Secrets `SESSION_SECRET`, `FIREBASE_SERVICE_ACCOUNT`, `CLOUDINARY_URL` from Secret Manager. `DATA_GOV_IN_API_KEY` is optional.
- Two Vercel projects, `f2c-frontend` (root `frontend`) and `f2c-admin` (root `admin`), `VITE_API_URL` set to the Cloud Run URL, tracking the branch you deploy from (name it in the doc, e.g. `main`).
- `CORS_ORIGIN` = both Vercel URLs, comma-separated.
- A new Firebase project and a new Cloudinary folder, so nothing is shared with Shantai.

`.env.example` files: delete MSG91, FCM and admin UPI variables; add `DATA_GOV_IN_API_KEY`. `.github/workflows/backup.yml`: point it at the new project's secrets (names unchanged) and add `credentials` and `surveys` if the workflow lists collections.

- [ ] **Step 4: Deploy (the user runs the account-owning steps)**

This step needs the user's Google Cloud, Firebase, Cloudinary and Vercel accounts. Stop and ask the user before creating any cloud resource. Then, following `DEPLOY.md`:
1. Create the Firebase project and service account; create the Firestore database in `asia-south1`.
2. Build and deploy the API: `gcloud run deploy f2c-api --source . --region asia-south1 --max-instances 1 --no-cpu-throttling …` (the exact command recorded in DEPLOY.md).
3. Create the first admin with `ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD_HASH` (`npm run admin:users -- hash`), sign in once, then remove both variables.
4. Create the two Vercel projects and set `VITE_API_URL`; set `CORS_ORIGIN` on the API; redeploy the API.
5. Smoke test on a real Android phone in Chrome: register a farmer, verify him in admin, list, scan the QR with another phone, order, pay, pickup, review.

- [ ] **Step 5: Final gate and commit**

Run: `npm test && npm run typecheck && npm run build` → PASS.
```bash
git add -A
git commit -m "Docs and deployment guide for Farmers to Consumer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage: §3 copy → T1 · §4 removals → T2, T3, T5, T7 · §5.1 auth → T5 · §5.2 farmer → T4, T6 · §5.3 FDRI → T6 · §5.4 produce → T7 · §5.5 delivery/pickup → T8 · §5.6 QR → T9 · §5.7 maps → T10 · §5.8 hints/demand/voice → T11 · §5.9 research → T12 · §5.10 languages → T13 · §5.11 branding/palette → T14 · §6 design rules → Global Constraints · §7 data model → T3, T5–T8, T12 · §8 tests → each task · §9 order → task order · docs/deploy → T15.
- Review Focus coverage: phone formats → T5 test "a phone typed with +91"; unverified/blocked QR → T9 loop test; pickup cancel → T8 test; dozen/piece mandi → T11 test; missing survey answers → T12 test "not answered".
- Known judgement calls recorded in the tasks: seeded farmers have no password (T6); Table 9 counts an unanswered direct-selling question as not willing (T12, shown as a note); the pickup place is public without home-location consent but rounded (T8).
