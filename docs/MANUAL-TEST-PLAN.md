# Manual test plan — शेतकऱ्यापासून थेट ग्राहकापर्यंत · Farmers to Consumer

An end-to-end manual pass over the farmer/buyer website, the admin console and
the API. Run by one person on a laptop with three browser profiles, roughly in
order — later suites use data made by earlier ones.

Tick a row when "What must happen" is true on screen. When it is not, file it
with the template in section 14.

---

## 0. Before you start

### 0.1 Environment

```bash
npm install
npm run dev:all          # API :4000, website :5173, admin console :5174
```

Read the API boot banner (`describeConfig()` in `backend/src/config.ts`)
before calling an integration broken. With an empty `.env`: JSON-file
database, no Cloudinary, no mandi prices — all intended degraded modes.

### 0.2 Three browser profiles

Farmer and buyer are the same origin and share one session key
(`wb.session`), so they cannot be signed in together in one profile.

- **Profile A** — farmer (`:5173`)
- **Profile B** — buyer (`:5173`, a second profile or another browser)
- **Profile C** — admin console (`:5174`)

### 0.3 Data

`SEED_DEMO_DATA=true` in `backend/.env` seeds four farmers in अणदूर
(`backend/src/db/seed.ts`):

| Farmer | Phone | ID | Listing | Cultivation |
|---|---|---|---|---|
| राजेश पाटील | 9822011223 | F2C-ANADUR-001 | टोमॅटो ₹40/kg, min 2 | organic |
| सविता कांबळे | 9764455661 | F2C-ANADUR-002 | भेंडी ₹35/kg, min 1 | natural |
| गणेश जगदाळे | 9890033441 | F2C-ANADUR-003 | कांदा ₹28/kg, min 5 | chemical |
| लक्ष्मी शिंदे | 9850012345 | F2C-ANADUR-004 | हरभरा ₹60/kg, min 5 | chemical |

Seeding sets no passwords. With the API stopped:
`npm run admin -- set-password 9822011223 123456`.

Reset: stop the API and delete `backend/data/db.json`, or
`curl -X POST http://localhost:4000/api/dev/reset` with `ALLOW_DEV_RESET` set.

Admin: `npm run admin:users -- create you@example.com "Your Name"` (API stopped).

### 0.4 Automated gates first

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`

---

## 1. Suite A — Landing and public surface (Profile B, signed out)

| ID | What to do | What must happen |
|---|---|---|
| ☐ A1 | Load `/` | Marathi by default; name "शेतकऱ्यापासून थेट ग्राहकापर्यंत" first, "Farmers to Consumer" second; logo with no extra border or background |
| ☐ A2 | Switch to English, reload | Every string changes, placeholders included; the choice survives reload |
| ☐ A3 | Visit `/farmer` or `/shop/cart` signed out | Redirected, no farmer screen flashes |
| ☐ A4 | Measure in devtools | Text ≥16px, main buttons ≥56px, targets ≥44px |
| ☐ A5 | Prices anywhere | Latin digits (`₹40`) |
| ☐ A6 | Network tab, filter Font | No web font requests |
| ☐ A7 | Look for a hamburger menu or emoji | None |

## 2. Suite B — Password authentication and sessions

| ID | What to do | What must happen |
|---|---|---|
| ☐ B1 | Register a new buyer: phone, password `12345` | Refused: at least 6 characters |
| ☐ B2 | Register with `123456` | Accepted (digits-only allowed); lands on the buyer app |
| ☐ B3 | Register again with the same phone, either role | Refused with a message to log in instead |
| ☐ B4 | Log in with a wrong password 5 times | The 6th try is refused with the wait in Marathi words |
| ☐ B5 | Log in correctly, hard-refresh, press Back to `/` | Still signed in; the login screen redirects home |
| ☐ B6 | Log out | Signed out; Back does not restore the session |
| ☐ B7 | Token refresh: shorten the idle window locally, use the app past halfway | `X-Session-Token` arrives and `wb.session` holds the new token |
| ☐ B8 | Admin login at `:5174` with wrong password 5 times | Refused for 15 minutes |

## 3. Suite C — Forgotten password

| ID | What to do | What must happen |
|---|---|---|
| ☐ C1 | Login screen → "पासवर्ड विसरलात?" | Opens `/forgot-password/<role>` |
| ☐ C2 | Send with a registered phone, then with an unknown phone | Both show the same line: request sent, a representative will call |
| ☐ C3 | Send again from the same phone | No second row in the admin queue; the first row's time updates |
| ☐ C4 | Send a 4th time within 24 h | Refused |
| ☐ C5 | Admin → Password requests | Name, phone (tap to call), role, village, waiting time, and the matched account or "no account" |
| ☐ C6 | **Reset password** on the matched row | A 6-digit temporary password shown once; request marked done; the user's sessions end |
| ☐ C7 | Log in with the temporary password | Only the change-password screen is reachable until a new password is set |
| ☐ C8 | **Close** a request | Marked dismissed, leaves the queue |

## 4. Suite D — Farmer registration and verification

| ID | What to do | What must happen |
|---|---|---|
| ☐ D1 | Register as farmer | Ten screens, one topic each, progress dots and "step X of 10" |
| ☐ D2 | Refresh halfway | The draft is restored |
| ☐ D3 | Location step | Consent sentence first; "माझे ठिकाण वापरा" asks the browser; Skip works |
| ☐ D4 | UPI `name@ybll` | Refused and names "@ybl" |
| ☐ D5 | Review screen, tap "बदला" | Returns to that screen |
| ☐ D6 | Finish | Farmer ID `F2C-<VILLAGE>-<NNN>`; status awaiting verification |
| ☐ D7 | Create a listing before verification | Allowed, but not in the buyer catalogue, map or `/trace/<id>` (404) |
| ☐ D8 | Admin → Farmers → the farmer → **Verify** | Listings appear to buyers at once |
| ☐ D9 | Admin **Block** with reason | Whole shop disappears for buyers; unblock brings it back |

## 5. Suite E — Produce listing

| ID | What to do | What must happen |
|---|---|---|
| ☐ E1 | New listing wizard | Photo, crop, category, unit, price, quantity, minimum order, harvest date, cultivation — one per screen |
| ☐ E2 | Harvest date in the future | Refused |
| ☐ E3 | Minimum order above quantity | Refused |
| ☐ E4 | Price screen | Price hint shows the site's numbers with their source; with `DATA_GOV_IN_API_KEY` a mandi line, without it no line and no error; the price box stays empty |
| ☐ E5 | Submit as a verified farmer | `LIVE` immediately |
| ☐ E6 | Edit price and quantity | One-page edit; saves any number of times |
| ☐ E7 | Pause / resume, delete a draft | Paused leaves the catalogue; a draft is deleted |
| ☐ E8 | Listing QR → download, print | PNG saved; print page shows QR, crop, farmer name and ID |
| ☐ E9 | Open `/trace/<id>` signed out | Farmer, ID, village, crop, harvest date, cultivation, price, quantity, phone, map pin, order button |

## 6. Suite F — Buyer browsing

| ID | What to do | What must happen |
|---|---|---|
| ☐ F1 | Explore, search, categories | Only live listings of verified, open farmers |
| ☐ F2 | Search mic | Appears where supported; keyboard still works |
| ☐ F3 | Farmer map | Pins for verified farmers with live listings; category filter; tap opens the farmer card |
| ☐ F4 | Inspect `/api/catalog/...` responses | Farmer location rounded to 2 decimals; no phone on catalogue routes |
| ☐ F5 | Product page | "Harvested N days ago", cultivation icon + word, farmer card with rating |
| ☐ F6 | Pincode bar: a Maharashtra pincode not on the farmer's list | Warning, not a block |
| ☐ F7 | Pincode outside Maharashtra (or 403xxx, Goa) | Refused |

## 7. Suite G — Cart and checkout

| ID | What to do | What must happen |
|---|---|---|
| ☐ G1 | Add from farmer 1, then from farmer 2 | Refused, naming farmer 1, with a link; nothing cleared |
| ☐ G2 | Cart quantity | Steps from the minimum order up to the stock; 0 removes the line |
| ☐ G3 | Delivery charge 0 | "Ask the farmer"; totals read "without delivery" |
| ☐ G4 | Checkout choice | Delivery and/or pickup, as that farmer offers; COD or UPI |

## 8. Suite H — Order lifecycle (A and B side by side)

| ID | What to do | What must happen |
|---|---|---|
| ☐ H1 | Buyer places a UPI delivery order | Farmer sees it on refresh; no pay section for the buyer yet |
| ☐ H2 | Farmer accepts (optional time estimate) | Buyer sees QR, UPI ID copy, amount, UTR box |
| ☐ H3 | UTR with 11 digits | Submit disabled; 12 enables it |
| ☐ H4 | Same UTR on a second order | Refused |
| ☐ H5 | Farmer before confirming money | No "Packed" button; the API refuses `PACKED` |
| ☐ H6 | Farmer: Money received → Packed → Out for delivery → Delivered | Buyer tracker follows: confirmed, shipped, out for delivery, delivered |
| ☐ H7 | Buyer after delivery | Rating gate covers the app; each product rated; a new order is refused (409) until done |
| ☐ H8 | Pickup + COD order | Packed reads "ready for pickup"; next step is Delivered; buyer sees three stages |
| ☐ H9 | Buyer cancels while Placed | Three steps with a reason; after acceptance no cancel button |
| ☐ H10 | Farmer cancels after acceptance | Three steps, then the refund notice, which closes only on "I understand" |
| ☐ H11 | Farmer rejects at Placed | Reason required; both sides show who ended it and why |
| ☐ H12 | Updates list on both sides | One row per order, tagged with its current status |

## 9. Suite I — Reports, complaints and reviews

| ID | What to do | What must happen |
|---|---|---|
| ☐ I1 | Buyer reports a listing | Reason required; the listing stays live; appears in admin Products → Reported |
| ☐ I2 | Admin clears reports / takes the listing down | Cleared reports close; take-down removes the listing |
| ☐ I3 | Farmer or buyer reports a review | Appears under Reviews → Reported |
| ☐ I4 | Admin hides a review with reason | Leaves the product page and the average |
| ☐ I5 | Farmer raises a complaint from Help | Subject from the list, at least 10 characters; appears in admin Complaints; resolve works |
| ☐ I6 | Public review | Buyer's first name only |

## 10. Suite J — Farmer and buyer profiles

| ID | What to do | What must happen |
|---|---|---|
| ☐ J1 | Farmer edits delivery pincodes, charge, pickup place | Checkout offers match |
| ☐ J2 | Farmer resets map pin | New rounded pin on the buyer map |
| ☐ J3 | Growth screen | FDRI score and band from the ten answers |
| ☐ J4 | Buyer adds, edits and deletes addresses | Saved and offered at checkout |
| ☐ J5 | Close account with an order in flight | Refused, naming the open orders |
| ☐ J6 | Close account with none | Last four digits of the phone required; sessions end; a farmer can restore within 7 days |

## 11. Suite K — Admin console

| ID | What to do | What must happen |
|---|---|---|
| ☐ K1 | Today / Home | Counts of unverified farmers, password requests, reports, complaints |
| ☐ K2 | Farmers list: sort and filter | Choice remembered per list |
| ☐ K3 | Farmer detail: Reset password without a request | Same behaviour as C6 |
| ☐ K4 | Map | Exact pins; filters by crop, village, FDRI band |
| ☐ K5 | Demand & supply | Per crop, ordered (30 days) vs listed |
| ☐ K6 | Impact | Farmers, orders, money earned, FDRI bands |
| ☐ K7 | Orders → open one | Opens in a dialog, not below the fold |
| ☐ K8 | Language switch | Marathi default, English toggle |

## 12. Suite L — Security and API negatives (curl against `:4000`)

| ID | What to do | What must happen |
|---|---|---|
| ☐ L1 | Any `/api/admin/*` with no token | 401 |
| ☐ L2 | `/api/admin/farmers` with a farmer token | 403 |
| ☐ L3 | `/api/products/mine` with a buyer token | 403 |
| ☐ L4 | `/api/catalog/products` with no token | 200 |
| ☐ L5 | Decode a session token | `{sid, role, iat}` only; no identity |
| ☐ L6 | Change `role` or `sid` and resend | Rejected |
| ☐ L7 | A user with `mustChangePassword` calls any route but `POST /auth/password` | 403 |
| ☐ L8 | `POST /api/uploads/signature` with no token | 401; a signed response never contains the API secret |
| ☐ L9 | 3 MB body to `/api/auth/login` | Refused (8 kB cap) |
| ☐ L10 | 301 requests in a minute from one IP | 429 |
| ☐ L11 | Auth event log in `db.json` | Phones masked, IPs hashed |
| ☐ L12 | `CORS_ORIGIN` with two origins | Both allowed; any other blocked |
| ☐ L13 | `POST /api/dev/reset` in production | 404 |
| ☐ L14 | Boot in production without `SESSION_SECRET` | Refuses to boot |

## 13. Suite M — Degraded modes

| ID | What to do | What must happen |
|---|---|---|
| ☐ M1 | Empty `.env` | JSON file, no photos, no mandi line; the site is fully usable |
| ☐ M2 | Empty database, `SEED_DEMO_DATA` unset | Stays empty |
| ☐ M3 | Wrong Firebase credentials | Falls back to the JSON file and says so loudly |
| ☐ M4 | Go offline and tap something | Marathi error or the offline screen, no crash |
| ☐ M5 | Any provoked API failure | `{ error, messageMr, fields? }`; the Marathi message is shown |

### Regression list after any change to auth, the store or `shared/`

- [ ] Farmer and buyer stay signed in across refresh and Back
- [ ] A COD pickup order and a UPI delivery order both reach Delivered
- [ ] An unverified farmer's listing is not public; verified, it is
- [ ] Forgot password → admin reset → forced change works
- [ ] English shows no Devanagari placeholders
- [ ] `npm test` and `npm run typecheck` green

---

## 14. Bug report template

```
ID:            (test ID, e.g. H5)
Surface:       farmer / buyer / admin console / API
Build:         git rev-parse --short HEAD
Environment:   boot banner lines (database, images, mandi prices)
Account:       phone / farmer ID / admin email
Steps:         1.
               2.
Expected:      (the "What must happen" column)
Actual:        (what you saw; screenshot)
API response:  (status and {error, messageMr, fields})
Console:       (any JS error)
Severity:      blocker / major / minor / cosmetic
Reproducible:  always / sometimes / once
```
