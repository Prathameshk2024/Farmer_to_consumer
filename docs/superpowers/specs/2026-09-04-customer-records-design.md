# Customer records — Phase 1 design

**Date:** 2026-09-04
**Status:** Awaiting review
**Scope:** Phase 1 only. Phases 2 (seller "My Buyers") and 3 (admin customer
management) are explicitly out of scope.

---

## 1. Problem

Customer data entered in the app is never stored as a record.

`Db` holds `sellers`, `products`, `orders`, `payments`, `addresses`. There is no
customer entity, no `Customer` type, and no `customers` collection.
`auth.routes.ts` states the intent directly: *"Customers need no registration
step — the phone IS the account."* The customer id is computed on the fly as
`c-${phone}`.

Three concrete defects follow from this.

### 1.1 Saved addresses are shared and fake

`GET /api/catalog/addresses` (catalog.routes.ts:84) has **no auth check** and
returns the global `db.addresses` array to any caller. Those are the two seeded
Pune addresses in `seed.ts:257`. Checkout presents them as "your saved
addresses", so every customer sees the same two strangers' addresses. The
address a woman actually types is written into the order and then forgotten.

### 1.2 Customer ids do not match between seed data and login

The five live orders carry ids `c1`–`c4`. `auth.routes.ts:60` issues
`c-${phone}` at login. These never match. A real login by 9011223344
(प्रिया देशमुख) filters `/orders/mine` on `c-9011223344`, matches nothing, and
shows an empty order history — while both of the customer's orders sit in Firestore.

This bug exists today, independent of this work.

### 1.3 There is no way to enter an address at all

Confirmed by grep: no address entry form exists anywhere in the frontend.
`CartCheckout` and `CustomerProfile` only render addresses read-only. Checkout
functions today **solely because the two global seed addresses always exist**.

This is the reason Phase 1 is larger than "add a collection": scoping addresses
per customer without building an entry form would block checkout entirely for
every new customer.

### 1.4 Session tokens are forgeable

`middleware/auth.ts:7`: *"The token here is a base64 blob, NOT a signed
credential — anyone could forge one."*

Tolerable today, because a customer token unlocks only that customer's order list and two
fake addresses. Once real home addresses are stored per customer, a forged
token — `{"role":"customer","customerId":"c-9011223344"}`, base64-encoded —
reads any woman's home address. Storing PII behind a forgeable token is not
acceptable, so token signing is in scope for Phase 1.

---

## 2. Goals

1. A durable customer record per phone number, in Firestore.
2. Addresses belong to a customer, who can see, add, edit and delete only those.
3. Returning customers get their name and addresses prefilled at checkout.
4. The address used for an order is saved automatically.
5. The five existing orders are correctly associated with four customer records.
6. Session tokens are signed and tamper-evident.

## 3. Non-goals

- Seller "My Buyers" screen (Phase 2).
- Admin customer management (Phase 3).
- Any change to MSG91 OTP authentication. Token signing is an additional
  session-security layer, **not** a replacement for OTP.
- Deleting the old Firestore `addresses` documents. They stay untouched for
  rollback.

---

## 4. Data model

### 4.1 New type — `shared/src/types.ts`

```ts
export interface Customer {
  id: string          // 'c-<phone>' — derived, so it always matches the token
  phone: string
  name: string
  addresses: Address[]
  createdAt: string   // ISO
  updatedAt: string   // ISO
  blocked?: boolean   // reserved for Phase 3; unused and unread in Phase 1
}
```

### 4.2 Changed type

`Address.city` becomes optional:

```ts
export interface Address {
  id: string
  label: string
  line: string
  landmark?: string
  city?: string       // was required; orders never captured a city
  pincode: string
  isDefault: boolean
}
```

Every current render site (`CartCheckout`, `CustomerProfile`) shows
`{a.line}, {a.city} - {a.pincode}`, so those must tolerate an absent city.

### 4.3 Collections

`Db` gains `customers: Customer[]`. `'customers'` is added to `COLLECTIONS` in
`firestore.ts:31`.

`'addresses'` is **removed** from `COLLECTIONS` and from `Db`. Because
`firestore.ts` only reads and diffs collections named in that list, the two
existing `addresses` documents simply stop syncing. They remain in Firestore,
untouched. Rollback is restoring the list entry.

### 4.4 Two deliberate choices

**Addresses are embedded in the customer document, not a separate collection.**
A customer has two or three. They are only ever read together with the customer's record.
Embedding makes the write atomic and costs one document read rather than a
query, and stays far inside Firestore's 1 MB document limit.

**No stored order counts or spending totals.** "12 orders, ₹4,300" is derived
from `orders` at read time. A stored counter drifts the first time an order is
cancelled or edited, and the drift is silent.

---

## 5. Migration

One-off script: `backend/scripts/backfill-customers.ts`, run via
`npm run backfill:customers`. Supports `--dry-run` (default behaviour is to
require an explicit `--commit` flag; nothing writes without it).

### 5.1 Algorithm

1. Read all orders.
2. Group by `customerPhone` — the reliable key. **Not** `customerId`, which is
   inconsistent (defect 1.2).
3. For each phone group:
   - `id` = `c-<phone>`
   - `name` = `customerName` from the most recent order (by `placedAt`)
   - `addresses` = deduped on `line` + `pincode`; most recently used marked
     `isDefault: true`; `label` defaults to `'घर'`
   - `createdAt` = earliest `placedAt`; `updatedAt` = latest
4. Rewrite each order's `customerId` to `c-<phone>`.
5. Write customers and updated orders in one batch.

Orders with an empty `customerPhone` are **skipped and reported**, never
silently dropped.

### 5.2 Expected result, verified against live Firestore

| Customer | Phone | Orders | Addresses |
|---|---|---|---|
| प्रिया देशमुख | 9011223344 | 2 (SMB1043, SMB1044) | 2 — same line, pincodes 413601 and 413603 |
| अनिता कुलकर्णी | 9922334455 | 1 (SMB1042) | 1 |
| सविता मोरे | 9765544332 | 1 (SMB1039) | 1 |
| रेखा भोसले | 9834455667 | 1 (SMB1031) | 1, no landmark |

**4 customer documents created. 5 order documents updated.**

### 5.3 Idempotency

Re-running produces an identical result. Customers are upserted by id; orders
already carrying a `c-<phone>` id are left alone. The dry run of a second
execution must report zero changes.

### 5.4 Order of operations

The dry-run output is shown for approval **before** the live migration runs.

---

## 6. Session token signing

`middleware/auth.ts` only. MSG91 OTP flow is untouched.

- New `SESSION_SECRET` in `backend/.env`, surfaced through `config.ts`.
  Absent in development → a fixed development-only fallback with a startup
  warning. Absent in production → refuse to boot.
- `signToken(ctx)` → `base64url(payload) + '.' + base64url(HMAC-SHA256(payload, secret))`
- `verifyToken(token)` rejects: missing signature, bad signature, malformed
  payload. Comparison uses `crypto.timingSafeEqual`.
- Existing unsigned tokens become invalid. Users log in again once. Acceptable
  at current scale and explicitly approved.

---

## 7. API changes

### 7.1 New router — `backend/src/routes/customers.routes.ts`

All routes `requireRole('customer')`. Every route resolves the customer from
`req.auth.customerId` — **never** from a request body or path parameter. This
is what makes cross-customer access impossible.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/customers/me` | Her record and addresses. Creates an empty record on first call. |
| `PATCH` | `/api/customers/me` | Update `name`. |
| `POST` | `/api/customers/me/addresses` | Add an address. |
| `PATCH` | `/api/customers/me/addresses/:id` | Edit, or set as default. |
| `DELETE` | `/api/customers/me/addresses/:id` | Remove one. |

Address routes 404 when the id is not in *that customer's* `addresses` array, so a guessed
id from another customer is indistinguishable from a non-existent one.

Setting `isDefault: true` clears the flag on the customer's other addresses in the same
write.

### 7.2 Removed

`GET /api/catalog/addresses` — deleted, along with the `addresses` field on `Db`.

### 7.3 Changed — `POST /api/orders`

After orders are created and before `save()`, upsert the customer:

- create the record if absent
- update `name` when `customerName` was supplied and is not the `'ग्राहक'` placeholder
- append the delivery address if not already present (dedupe on `line` + `pincode`)
- mark it default when it is the only address on record
- set `updatedAt`

Request and response shapes are unchanged, so no other caller breaks.

---

## 8. Frontend changes

### 8.1 New — `AddressForm` component

`frontend/src/components/AddressForm.tsx`. Fields: label, line, landmark
(optional), pincode. Marathi-first, consistent with existing form components.
Validation: line non-empty, pincode exactly six digits.

New i18n keys in `frontend/src/i18n/strings.ts` for every label, in all
supported languages.

### 8.2 `CartCheckout.tsx`

- Replace `api.addresses()` with `api.customerMe()`.
- **Returning customer** — the saved addresses render as the picker. Existing
  selection precedence is preserved: previously chosen id → one matching the
  saved pincode → default → first.
- **New customer (no addresses)** — render `AddressForm` inline instead of an
  empty picker. On submit it posts to `/customers/me/addresses` and the new
  address becomes selected. **This is what unblocks checkout for new
  customers.**
- "Add another address" action available when some are already saved.
- The name sent with the order comes from the customer record when available,
  falling back to `session?.name`, then `'ग्राहक'`.
- No "save this address?" checkbox. The address used is saved automatically.

### 8.3 `CustomerProfile` (same file)

Currently calls the endpoint being retired, so it must change or it breaks.
Switch to `api.customerMe()` and make it the home for address management: list,
add, edit, set default, delete. Render `city` only when present.

### 8.4 `lib/api.ts`

Remove `addresses()`. Add `customerMe()`, `updateCustomerMe()`,
`addAddress()`, `updateAddress()`, `deleteAddress()`.

---

## 9. Testing

No test runner exists in this repo. Add `node:test` — built into Node 22, no
new dependency — with `npm test` at the root.

### 9.1 Backfill (pure functions, no Firestore)

- 5 seeded orders → exactly 4 customers
- प्रिया's two orders → one customer with two addresses
- रेखा's missing landmark → address created, no crash
- second run → zero changes (idempotent)
- order with empty `customerPhone` → skipped and reported

### 9.2 Customer routes

- `GET /customers/me` with no record → creates an empty one
- address add / edit / delete round-trip
- setting a new default clears the previous one
- **Customer A cannot read, edit or delete Customer B's addresses** — the
  central privacy test, asserted for GET, PATCH and DELETE
- deleting the last address leaves a valid record

### 9.3 Order placement

- first order → customer created carrying that address
- second order, same address → no duplicate
- second order, new address → appended
- name updated from the order
- `'ग्राहक'` placeholder does not overwrite a real stored name

### 9.4 Token signing

- hand-forged base64 token rejected
- tampered signature rejected
- valid token round-trips
- signed token for customer A does not grant access to customer B's data

### 9.5 Manual verification

Place a real order through the UI at `localhost:5173`, then confirm the
`customers` document in the Firebase console.

---

## 10. Rollback

| Change | Rollback |
|---|---|
| `customers` collection | Remove from `COLLECTIONS`; documents remain, unread |
| `addresses` retired | Restore the `COLLECTIONS` entry and the `Db` field; documents never deleted |
| Order `customerId` rewrite | Re-derivable from `customerPhone` at any time |
| Token signing | Revert `middleware/auth.ts`; users log in again |

No destructive operation is performed on existing Firestore data.

---

## 11. Files touched

**Shared:** `shared/src/types.ts`

**Backend:** `src/config.ts`, `src/middleware/auth.ts`, `src/db/seed.ts`,
`src/db/store.ts`, `src/db/firestore.ts`, `src/routes/customers.routes.ts` (new),
`src/routes/orders.routes.ts`, `src/routes/catalog.routes.ts`, `src/index.ts`,
`scripts/backfill-customers.ts` (new), `.env` + `.env.example`

**Frontend:** `src/lib/api.ts`, `src/components/AddressForm.tsx` (new),
`src/screens/customer/CartCheckout.tsx`, `src/i18n/strings.ts`

**Root:** `package.json` (test + backfill scripts)

---

## 12. Sequencing

1. Token signing, with tests
2. `Customer` type, collection wiring, seed
3. Customer routes, with tests
4. Order upsert, with tests
5. Backfill script + `--dry-run` output shown for approval
6. Live backfill
7. `AddressForm`, checkout and profile changes
8. Manual end-to-end verification

Steps 1–4 are invisible to users. The frontend keeps working against the old
endpoint until step 7, so the app is never left broken between steps.
