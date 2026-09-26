# Manual test plan — शांताई महिला बाजार / Shantai Mahila Bazar

An end-to-end manual test suite covering the seller app, the customer app, the admin
console, and the API behind all three. Written to be run by one person on a laptop
with two browser profiles, in roughly this order — later suites depend on data created
by earlier ones.

Every row is a test. Tick the box when the "What must happen" column is true on screen.
When it is not, record it with the bug template in section 19.

---

## 0. Before you start

### 0.1 Environment

```bash
npm install
npm run dev:all          # API :4000, seller app :5173, admin console :5174
```

Watch the API boot banner. It prints which integrations are actually live
(`describeConfig()` in `backend/src/config.ts`). Read it before reporting an
integration as "broken" — with an empty `.env` you get the JSON-file database,
no Cloudinary, and demo OTP, and all three are the intended degraded modes.

| Surface | URL |
|---|---|
| API health | http://192.168.31.110:4000/api/health |
| Seller + customer app | http://192.168.31.110:5173 |
| Admin console | http://192.168.31.110:5174 |

### 0.2 Two browser profiles are mandatory

The seller app and the customer app are the same origin (`:5173`) and share **one**
localStorage session key, `wb.session`. You cannot be signed in as a seller and as a
customer in the same browser at the same time. Use:

- **Profile A** — the seller (Chrome, normal window)
- **Profile B** — the customer (Chrome incognito, a second profile, or Firefox)
- **Profile C** — the admin console at `:5174` (separate origin, separate storage)

Several order-lifecycle tests need A and B open side by side.

### 0.3 Resetting the data

```bash
# Either delete the file and restart the API
rm backend/data/db.json

# Or, while it is running
curl -X POST http://192.168.31.110:4000/api/dev/reset
```

`/api/dev/reset` 404s when `NODE_ENV=production`. Re-seed before Suites C, F and K —
they consume slots and change seller status.

### 0.4 Automated gates — run these first

A manual pass over a build that already fails `npm test` wastes a day.

- [ ] `npm run typecheck` — all three workspaces clean
- [ ] `npm test` — backend + frontend + admin all green
- [ ] `npm run build` — backend tsc and both Vite builds succeed

### 0.5 Admin account

There is no default admin password.

```bash
npm run admin:users -- create you@example.com "Your Name"
```

Note the email and password; Suite L needs them.

### 0.6 Seed accounts and their shape

Everything in Suites G–I depends on these numbers, from `backend/src/db/seed.ts`.

| Seller | Phone | ID | Village | Packs (slots) | Delivery | Free above | Min order | Pincodes |
|---|---|---|---|---|---|---|---|---|
| सुनीता पाटील | 9822011223 | SMB-ANADUR-01 | आणदुर | 1 (5) | ₹20 | ₹500 | ₹100 | 413601, 413602, 413604 |
| मंगल जाधव | 9764455661 | SMB-JEVALI-01 | जेवळी | 2 (10) | ₹40 | ₹1500 | ₹0 | 413603, 413601 |
| कविता शिंदे | 9890033441 | SMB-BHOSGA-01 | भोसगा | 1 (5) | ₹0 | — | ₹150 | 413604, 413601 |

Products of note: `p3` (papad) has **stock 0**; `p4` (ghee, Sunita) is **PENDING** so it
must never appear in the public catalogue; `p9` (पुरणपोळी) is **made to order**.

The payments queue seeds with three PENDING rows — one flagged `duplicateUtr`, one that
has been waiting ~50 hours — plus one already APPROVED.

Any 10-digit number starting 6–9 is a valid login. The OTP screen **shows** the 6-digit
code in demo mode, and that code is really checked — anything else is refused.

---

## 1. Suite A — Landing page and public surface

Profile B, signed out. Start at http://192.168.31.110:5173.

| ID | What to do | What must happen |
|---|---|---|
| ☐ A1 | Load `/` | Renders in **Marathi** by default. The brand portrait shows with its own gold ring and **no** extra border or background box |
| ☐ A2 | Watch the photo strips for ~10s | Both strips cross-fade every 2 seconds |
| ☐ A3 | Enable OS "reduce motion", reload | Strips hold on the first frame, no fading |
| ☐ A4 | Inspect the category tiles | Photographs, not emoji |
| ☐ A5 | Switch language to English | Every visible string changes, **including input placeholders**. No Devanagari left except seller/product data |
| ☐ A6 | Reload after switching | The language choice survives the reload |
| ☐ A7 | Tap the customer door | Lands on `/login/customer` |
| ☐ A8 | Tap the seller "I am new" door | Lands on `/join/seller` |
| ☐ A9 | Visit `/seller` while signed out | Redirected to `/` — no seller screen flashes first |
| ☐ A10 | Visit `/shop/cart` while signed out | Redirected to `/` |
| ☐ A11 | Visit `/nonsense-route` | Redirected to `/` |
| ☐ A12 | Visit `/register/seller` with no ticket | Redirected to `/login/seller`, not a dead form |
| ☐ A13 | Measure text and buttons in devtools | Body text ≥16px, primary buttons ≥56px tall, tap targets ≥44px |
| ☐ A14 | Look at any price | Latin digits (`₹500`), never `५००` |
| ☐ A15 | Devtools → Network, filter Font | **No web font requests.** Marathi renders from the system font |
| ☐ A16 | Look for a hamburger menu anywhere | There is none |

---

## 2. Suite B — Authentication, OTP and sessions

Profile B unless stated.

### 2.1 Phone entry

| ID | What to do | What must happen |
|---|---|---|
| ☐ B1 | `/login/customer`, enter `123` | Refused with a Marathi message; no SMS sent |
| ☐ B2 | Enter `1234567890` (starts with 1) | Refused — Indian mobiles start 6–9 |
| ☐ B3 | Enter `+91 98220 11223` with spaces | Accepted; normalised to the ten digits |
| ☐ B4 | Enter `09822011223` | Accepted — the leading trunk `0` is stripped |
| ☐ B5 | Enter a valid new number | OTP screen appears **showing the 6-digit code** |

### 2.2 OTP verification

| ID | What to do | What must happen |
|---|---|---|
| ☐ B6 | Type a wrong 6-digit code | Refused. The message never says *which* part was wrong (not "expired", not "wrong digit") |
| ☐ B7 | Type the shown code | Signed in |
| ☐ B8 | On a new number, type 5 wrong codes in a row | The code is destroyed after the 5th. The correct code no longer works — you must resend |
| ☐ B9 | Tap "resend" twice within 30s | The second is refused by the cooldown |
| ☐ B10 | Wait 5 minutes, then use the code | Expired, refused |
| ☐ B11 | Send 6 OTPs to one number within an hour | The 6th returns **429** with `Retry-After` and a Marathi "try again in N minutes" |
| ☐ B12 | 11 verify attempts in 15 minutes on one number | The 11th returns 429 |
| ☐ B13 | After B12, verify correctly on a fresh number | Still works — the limiter is per-subject, not global |

### 2.3 Registered vs. authenticated customer

| ID | What to do | What must happen |
|---|---|---|
| ☐ B14 | Log in with a **brand-new** customer number | Sent to `/register/customer` — authenticated but not registered |
| ☐ B15 | Submit an empty name there | Refused with a field-level Marathi message |
| ☐ B16 | Give a name and submit | Lands on `/shop` |
| ☐ B17 | Log out, log in with the same number | Goes **straight to `/shop`**, no name screen |

### 2.4 Session persistence — only logout and a 401 may end a session

| ID | What to do | What must happen |
|---|---|---|
| ☐ B18 | Signed in as a customer, press Back repeatedly to `/` | Still signed in. The landing page renders and does not bounce you |
| ☐ B19 | From `/`, open `/login/customer` while signed in as a customer | Redirected straight to `/shop` — never asked for another OTP |
| ☐ B20 | Signed in as a seller, open `/login/seller` | Redirected straight to `/seller` |
| ☐ B21 | Signed in as a **seller**, open `/shop` | Redirected to `/seller` (own home), **not** to `/` |
| ☐ B22 | Signed in as a **customer**, open `/seller` | Redirected to `/shop` |
| ☐ B23 | Hard-refresh (Ctrl+Shift+R) on any signed-in screen | Still signed in |
| ☐ B24 | Close the tab, reopen the URL | Still signed in |
| ☐ B25 | Log out explicitly | Back at `/`. `wb.session` is gone from localStorage |
| ☐ B26 | After logout, press Back into `/seller` | Redirected to `/` — the token is dead server-side, not merely cleared locally |

### 2.5 Token rotation (the one that breaks silently)

| ID | What to do | What must happen |
|---|---|---|
| ☐ B27 | Devtools → Network. Trigger any API call and inspect the response headers | Some responses carry `X-Session-Token`, and it is **readable** by JS — i.e. it survives the CORS `exposedHeaders` list |
| ☐ B28 | After such a response, read `localStorage.wb.session` | The token **inside `wb.session`** has been replaced, not only an in-memory copy |
| ☐ B29 | Reload after B28 | Still signed in with the **new** token, not the original |

### 2.6 Admin login (Profile C, `:5174`)

| ID | What to do | What must happen |
|---|---|---|
| ☐ B30 | Sign in with the account from §0.5 | The console home renders |
| ☐ B31 | Sign in with an unknown email | Refused, with a message identical to a wrong password — no account enumeration |
| ☐ B32 | 6 failed logins on one email in 15 minutes | 429 |
| ☐ B33 | Signed out, open `/payments` directly | The sign-in screen only. No shell, no navigation, no half-rendered queue behind it |

---

## 3. Suite C — Seller registration (6-step wizard)

Profile A. **Reseed first** if you have already registered on this number.
Use a fresh 10-digit number per run.

| ID | What to do | What must happen |
|---|---|---|
| ☐ C1 | `/join/seller` → new number → OTP | Lands on step 1 of 6 with progress dots |
| ☐ C2 | Count the questions per screen | One question (or one tight group) per screen — this is a wizard by design |
| ☐ C3 | Press Back on step 1 | Returns to `/`; it does not trap you |
| ☐ C4 | Leave the required name blank, press Next | Blocked with a Marathi message under the field |
| ☐ C5 | Enter age `12` | Refused — 18 to 90 |
| ☐ C6 | Enter age `95` | Refused |
| ☐ C7 | Enter pincode `012345` | Refused — 6 digits, not starting with 0 |
| ☐ C8 | Enter UPI `notaupi` | Refused |
| ☐ C9 | Enter UPI `someone@ybl` | Accepted |
| ☐ C10 | Pick a **survey village** (आणदुर / जेवळी / भोसगा / चिवरी / रुद्रवाडी / येळी) | The final ID uses the fixed Latin code, e.g. `SMB-ANADUR-04` |
| ☐ C11 | Register a second seller in the **same** village | The serial increments **per village**, not globally |
| ☐ C12 | Register in a village **not** on the survey list, typed in Devanagari | The ID carries a readable transliterated Latin code |
| ☐ C13 | Finish the wizard | Her `SMB-…` ID is shown on screen and she is signed in as a seller |
| ☐ C14 | Check her status on the profile screen | **REGISTERED**, not ACTIVE — she cannot publish until the ₹50 is approved |
| ☐ C15 | Leave "about" blank, then open her public shop | A default Marathi description was composed from shop name + village (+ SHG, + years). The shop is never blank |
| ☐ C16 | Choose "SHG" as the business type and give an SHG name | The SHG appears in the generated description |
| ☐ C17 | Register with an already-registered number | **409** — "this number is already registered, please log in" |
| ☐ C18 | Mid-wizard, change the language from the language control | The answers already given are still there afterwards |
| ☐ C19 | Upload the payment QR photo on the last screen | The upload succeeds **even though no seller record exists yet** — the registration ticket authorises it |
| ☐ C20 | Wait 15+ minutes mid-wizard, then submit | The ticket has expired: refused with "verify your number again", and you are sent back to OTP |

### 3.1 The registration gate (API level, curl)

| ID | What to do | What must happen |
|---|---|---|
| ☐ C21 | `POST /api/sellers/register` with a full valid body and **no** `ticket` | **401**. No seller created, no session issued |
| ☐ C22 | The same, with a `ticket` already used once | 401 — tickets are single-use |
| ☐ C23 | A valid ticket but a **different** phone in the body | The seller is created against the **ticket's** phone. The body's phone is ignored entirely |
| ☐ C24 | 11 registration attempts from one IP in an hour | 429 |

---

## 4. Suite D — Subscription, slots and payment approval

Profile A as a newly registered (REGISTERED) seller, Profile C as admin.

| ID | What to do | What must happen |
|---|---|---|
| ☐ D1 | The new seller tries to publish a product | Refused — 403, "wait for the administrator's approval" |
| ☐ D2 | The same seller saves it **as a draft** | Allowed. A draft consumes no slot |
| ☐ D3 | Open the subscription screen | ₹50 = 5 slots, the admin's UPI account shown, no payment gateway |
| ☐ D4 | Submit a UTR of `12345` (5 characters) | Refused — at least 6 |
| ☐ D5 | Submit a valid UTR | Sent for approval; the pay button disappears; the waiting screen appears |
| ☐ D6 | Submit a **second** payment immediately (back button, second tap) | **409** — one pending payment at a time. The admin queue must not grow a duplicate ₹50 row |
| ☐ D7 | Admin console → Payments | Her row is there, with a waiting time in hours |
| ☐ D8 | Admin approves it | Her status flips to **ACTIVE**, `packsApproved` +1, and she is notified |
| ☐ D9 | Back in Profile A, the waiting screen | Notices the approval without a manual reload — it polls |
| ☐ D10 | She publishes 5 products | All 5 go live. The slot meter reads 5/5 |
| ☐ D11 | Try to publish a 6th | **402** — "all slots full, pay ₹50 for 5 more". The Add button is disabled too, but confirm the **server** refuses it, not just the button |
| ☐ D12 | With 5/5 used, submit a payment | Allowed |
| ☐ D13 | With slots still free (say 3/5 used), submit a payment | **409** — "you still have N free slots, no need to pay now" |
| ☐ D14 | Archive one live product | A slot frees **immediately**; the meter drops to 4/5 |
| ☐ D15 | Save a draft while full | Allowed — drafts never consume a slot |
| ☐ D16 | Pause a live product | It **still** consumes its slot (PAUSED is slot-consuming) |
| ☐ D17 | Admin rejects a payment with a reason | Her status returns to what it was before; she is notified with the reason |
| ☐ D18 | Admin rejects a *duplicate* payment for a seller who has another approved one | She stays ACTIVE — clearing a duplicate must not revoke an account another payment paid for |
| ☐ D19 | Admin approves the same payment twice | The second is **409 "already decided"** — no double pack |
| ☐ D20 | Admin grants 1 pack to a REGISTERED seller | She becomes ACTIVE with 5 slots and is notified in **slots**, not packs |
| ☐ D21 | Admin revokes more packs than she has spare | **409** with the numbers spelled out. Nothing is silently un-published |
| ☐ D22 | Admin revokes her **last** pack while nothing is published | She drops to REGISTERED, not ACTIVE-with-zero-slots |
| ☐ D23 | Submit a UTR already used by a **different** seller | The row is flagged as a duplicate UTR in the admin queue |

---

## 5. Suite E — The upload wizard and its draft

Profile A as an ACTIVE seller with free slots.
Seven steps: photo → basics → food → details → price → stock → preview.

| ID | What to do | What must happen |
|---|---|---|
| ☐ E1 | Open "new product" | Step 1 of 7 with progress dots, one question per screen |
| ☐ E2 | Press Back on step 1 | Returns to `/seller` |
| ☐ E3 | Try to advance past the photo step with no photo, Cloudinary configured | Blocked — a photo is required |
| ☐ E4 | The same with Cloudinary **not** configured (empty `.env`) | The picker reports itself unavailable and the step **can be passed** — it is never a wall she cannot get past |
| ☐ E5 | Look for a camera button or an emoji fallback grid | Neither exists. Gallery only, one photo |
| ☐ E6 | After picking a photo, look at "choose from gallery" | Disabled — it does not silently replace the photo |
| ☐ E7 | Tap the ✕ on the thumbnail, then pick **the same file again** | It is accepted. (The input resets its own `value`; without that, no `change` event fires) |
| ☐ E8 | On basics, leave the name blank | Blocked |
| ☐ E9 | Mark it food, leave ingredients blank | Blocked — "tell us what is in it" |
| ☐ E10 | Mark it food, skip veg/non-veg | Blocked |
| ☐ E11 | Mark it **not** food, leave material blank | Blocked |
| ☐ E12 | Set price `0` | Blocked |
| ☐ E13 | Tick "made to order" | Stock is forced to 0 and the stock field stops mattering |
| ☐ E14 | On the preview step, tap any summarised field | Jumps back to that exact step |
| ☐ E15 | Publish | The product goes **LIVE immediately** — there is no pre-publish admin queue |
| ☐ E16 | Check the customer app | The new product is in the catalogue |

### 5.1 The draft (the shared-phone bug)

| ID | What to do | What must happen |
|---|---|---|
| ☐ E17 | Open the wizard and leave immediately without typing | `localStorage` has **no** `wb.draft.product.*` key — walking in and out leaves no trace |
| ☐ E18 | Fill steps 1–3, leave to change the language, come back | The work is still there |
| ☐ E19 | Inspect the storage key | It is `wb.draft.product.<sellerId>`, and the seller id is **also inside the payload** |
| ☐ E20 | Half-fill a draft as seller A, log out, log in as seller B on the same browser, open the wizard | Seller B sees a **blank** wizard. Not a stranger's photo on step 1 |
| ☐ E21 | Hand-create a legacy `wb.draft.product` key (no seller id), then open the wizard | The old key is deleted on sight and ignored |
| ☐ E22 | Complete and publish a draft | The draft key is cleared |

---

## 6. Suite F — Editing, pausing and archiving a product

Profile A. **Editing is not a wizard** — everything is on one page.

| ID | What to do | What must happen |
|---|---|---|
| ☐ F1 | Open a live product → Edit | **One page**, every field visible. No steps, no dots |
| ☐ F2 | Change only the price and save | Saved, and the product **stays LIVE**. It is not knocked into any queue |
| ☐ F3 | Change the photo and save | Saved, still LIVE |
| ☐ F4 | Change name / category / ingredients and save | Saved, still LIVE. Moderation is after the fact now, not before |
| ☐ F5 | Look for a food ↔ handmade switch | `isFood` is **immutable** on edit — it picks the category set and stamps the FSSAI licence |
| ☐ F6 | Save with an empty name | Refused with a field message |
| ☐ F7 | Pause a live product | Status PAUSED. It disappears from the customer catalogue |
| ☐ F8 | Un-pause it | Back to LIVE and visible again |
| ☐ F9 | Publish a DRAFT from the products list | Goes to LIVE — and only if she is ACTIVE **and** has a free slot |
| ☐ F10 | Publish a draft missing required fields | Refused with the same field checks as a new listing. Drafts are not a way around validation |
| ☐ F11 | Publish a draft when slots are full | **402**. "Save as draft" is not a way around the slot gate |
| ☐ F12 | Archive a product | The confirmation dialog states the **consequence**, not a bare "Are you sure?" |
| ☐ F13 | Confirm the archive | Gone from her list; the slot frees immediately |
| ☐ F14 | `PATCH` **another** seller's product id via curl with your seller token | **404** — and certainly not a successful edit |

---

## 7. Suite G — Customer browsing, pincode and search

Profile B as a registered customer.

| ID | What to do | What must happen |
|---|---|---|
| ☐ G1 | Open `/shop` | Products from all three seed sellers, each with a seller card |
| ☐ G2 | Look for `p4` (घरगुती तूप, PENDING) | **Not present** — only LIVE products from ACTIVE, open sellers |
| ☐ G3 | Search `लोणचे` | आंब्याचे लोणचे matches |
| ☐ G4 | Search `pickle` | Also matches — search covers `nameEn` |
| ☐ G5 | Search `zzzz` | An empty state with words, not a blank screen |
| ☐ G6 | Set pincode `413603` | Only Mangal's products remain — she is the only seller covering 413603 |
| ☐ G7 | Set pincode `999999` | Not serviceable, said clearly. Not an empty grid with no explanation |
| ☐ G8 | Enter `12345` in the pincode bar | Refused — 6 digits |
| ☐ G9 | Reload after setting a pincode | The pincode is remembered |
| ☐ G10 | Open Categories | Tiles render; each opens its own product list |
| ☐ G11 | Open a product detail | Price, unit, seller card, village, and for food: ingredients and the veg/non-veg mark |
| ☐ G12 | Open `p3` (stock 0) | Out of stock is stated in **words**, not only by a colour or a disabled button |
| ☐ G13 | Open `p9` (made to order) | Labelled made-to-order; stock 0 does not read as "unavailable" |
| ☐ G14 | Look for any seller's **phone number** on a public screen | Never shown — the public view strips it |
| ☐ G15 | Take a **non-LIVE** product id from a seller's own list (`GET /api/products/mine` with her token — a DRAFT, PAUSED or REJECTED one) and fetch it unauthenticated: `curl -i localhost:4000/api/catalog/products/<id>` | **404**, with the same body as a made-up id. Not readable by holding the id, and the 404 does not reveal that the listing exists. Do **not** run this against an id that no longer exists at all — that passes for the wrong reason |
| ☐ G15a | Block that seller in the admin console, then fetch one of her **LIVE** product ids the same way | 404 as well. Blocking removes her from the list *and* her catalogue from id lookups; `publiclyVisible()` in `catalog.routes.ts` is the one rule both paths use, covered by `backend/tests/catalog-visibility.test.ts` |
| ☐ G16 | Close a seller's shop, then reload the catalogue | Her products vanish from the public list |
| ☐ G17 | Open a shop share link (`POST /api/catalog/share/<slug>/scan`) | The scan is recorded (`qrScans` +1) and you land on her shop |

---

## 8. Suite H — Cart and checkout

Profile B. This is the money path — do every row.

| ID | What to do | What must happen |
|---|---|---|
| ☐ H1 | Add one product to the cart | The cart badge updates |
| ☐ H2 | Reload | The cart survives (`wb.cart` in localStorage) |
| ☐ H3 | Change a quantity | Line total and grand total both update |
| ☐ H4 | Remove an item | It leaves the cart |
| ☐ H5 | Add products from **two different sellers** | The cart groups them by seller, each with her own delivery terms |
| ☐ H6 | Sunita's items totalling ₹90, checkout | Refused — her minimum order is ₹100 |
| ☐ H7 | Sunita's items totalling ₹300 | ₹20 delivery added |
| ☐ H8 | Sunita's items totalling ₹520 | Delivery **₹0** — free above ₹500 |
| ☐ H9 | Kavita's items | No delivery fee at any total; her ₹150 minimum is still enforced |
| ☐ H10 | Check out with no address | Refused — "choose an address" |
| ☐ H11 | Add a new address at checkout | Saved to her account and selectable |
| ☐ H12 | Address pincode `413603` for a Sunita-only cart | Refused — "Sunita does not deliver to this pincode" |
| ☐ H13 | Two-seller cart, place the order | **Two orders**, one per seller, sharing one `groupId` |
| ☐ H14 | Choose **COD** | Order placed with payment status COD_PENDING |
| ☐ H15 | Choose **UPI** | Her QR / UPI intent link is shown carrying the **exact amount**, and a UTR field is offered |
| ☐ H16 | Compare the UPI link's amount with the order total | They match exactly — the link is generated from her UPI id, not read off an uploaded screenshot |
| ☐ H17 | Place a UPI order | Payment status UPI_SUBMITTED |
| ☐ H18 | The confirmation screen | Order id, seller, total and what happens next, in Marathi |
| ☐ H19 | Tamper: place an order via curl with `price: 1` on the items | The server re-derives the price from the database. The stored total is the **real** price |
| ☐ H20 | Order a **paused / non-LIVE** product via curl | 409 — product unavailable |
| ☐ H21 | Order from a **closed** seller via curl | 409 — "this seller is not taking orders right now" |
| ☐ H22 | Place an order with an empty `groups` array | 400 — "cart is empty" |
| ☐ H23 | After ordering, look at the cart | Cleared |

---

## 9. Suite I — The order lifecycle

Profiles A and B side by side, on the order created in Suite H.
State machine: `PLACED → ACCEPTED → PACKED → OUT_FOR_DELIVERY → DELIVERED`.
Five states. DELIVERED is the end — there is no COMPLETED step.

| ID | What to do | What must happen |
|---|---|---|
| ☐ I1 | The seller's "My Business" home | The new order is in the action queue — the most important widget on the screen |
| ☐ I2 | Open the order as the seller | Customer name, phone, address, landmark, pincode, items, total |
| ☐ I3 | Open the order as the **customer** | The **seller's phone number is visible immediately**, at PLACED, before she accepts |
| ☐ I4 | The buttons offered at PLACED | Exactly "Accept" and "Reject" |
| ☐ I5 | Accept | Status ACCEPTED. The customer's tracking screen reflects it |
| ☐ I6 | The buttons at ACCEPTED | Only "Mark packed" |
| ☐ I7 | Mark packed, then look at the next button | "Out for delivery", and it asks for **confirmation stating the consequence** |
| ☐ I8 | Mark out for delivery, then mark delivered | Status DELIVERED |
| ☐ I9 | Look at the screen at DELIVERED | **No further step is offered and none is greyed out below it.** Nothing implies something is still outstanding |
| ☐ I10 | A COD order at DELIVERED | Payment status flips to COD_COLLECTED automatically — delivery and collection are the same moment |
| ☐ I11 | A UPI order: the seller confirms payment | Payment status UPI_CONFIRMED, as a **separate** action from advancing the order |
| ☐ I12 | A UPI order still at UPI_SUBMITTED | It shows in the seller's action queue as needing her |
| ☐ I13 | `POST /orders/:id/advance` with `to: DELIVERED` from PLACED, via curl | **409** — illegal transition |
| ☐ I14 | Reject an order **without** a reason via curl | **400** — a reason is required |
| ☐ I15 | Reject with a reason in the UI | Status REJECTED; the reason is on the order and the customer can read it |
| ☐ I16 | The buttons at REJECTED and at DELIVERED | None |
| ☐ I17 | Look for a customer "cancel order" button | There is none. `customerCanCancel` exists in `shared/` but no endpoint or UI reaches it — CANCELLED is currently unreachable. Record as a gap, not a bug, unless the spec says otherwise |
| ☐ I18 | `GET /orders/:id` with a **third** party's token | **403** — an order is visible only to its two parties |
| ☐ I19 | `POST /orders/:id/advance` as a different seller | 404 |
| ☐ I20 | The customer's order list | Newest first |
| ☐ I21 | Every status chip | Colour **plus** icon **plus** word. Never colour alone |
| ☐ I22 | The notification bell, both sides | The unread count reflects new events; opening the feed clears it; the last-seen mark survives a reload |

---

## 10. Suite J — Customer profile and addresses

Profile B.

| ID | What to do | What must happen |
|---|---|---|
| ☐ J1 | Open the profile | Name, orders link, saved addresses |
| ☐ J2 | Change the name | Saved; the next order carries the new name |
| ☐ J3 | Save a name that is only spaces | Refused |
| ☐ J4 | Add an address | Appears in the list and is selectable at checkout |
| ☐ J5 | Add an address with pincode `1234` | Refused — 6 digits |
| ☐ J6 | Edit only an address's line | Saved; the pincode is untouched |
| ☐ J7 | Set a different address as default | Only one default at a time; checkout preselects it |
| ☐ J8 | Delete an address | Gone from the list and from checkout |
| ☐ J9 | Delete an id that does not exist, via curl | 404 |
| ☐ J10 | `GET /api/customers/me` with a **different** customer's token | You get that token's own customer, never yours. Confirm no path reads someone else's addresses |
| ☐ J11 | Log out and back in | The name and addresses are still there — they live on the server, not in localStorage |

---

## 11. Suite K — The rest of the seller app

Profile A.

| ID | What to do | What must happen |
|---|---|---|
| ☐ K1 | My Business: the shop open/closed toggle | One tap at the top of the screen. Closing it removes her products from the public catalogue |
| ☐ K2 | The slot meter card | Used / total matches the products list |
| ☐ K3 | The bottom navigation | Exactly **four** tabs, one level deep |
| ☐ K4 | Payment QR screen: enter an invalid UPI id | Refused |
| ☐ K5 | Enter a valid UPI id and upload a QR image | Saved, `upiQrReady` set |
| ☐ K6 | Customer checkout after K5 | **Her bank's** QR image is shown, not one this app drew |
| ☐ K7 | Edit profile: age 17 | Refused (18–90) |
| ☐ K8 | Edit profile: delivery fee `-500` via curl | Refused by the server, not only by the form |
| ☐ K9 | Edit profile: a pincode of `12ab56` | Refused |
| ☐ K10 | Edit profile: try to change `status`, `packsApproved` or `womenBizId` via curl | Ignored — they are not on the allow-list |
| ☐ K11 | My Buyers | Repeat customers with order counts and totals. Rejected and cancelled orders are **not** counted as sales |
| ☐ K12 | Growth screen | Her week's numbers render, and a seller with zero orders does not crash it |
| ☐ K13 | Help & Training → replay a walkthrough | The tour runs on the real screen and rings the **real** control, not a drawn copy |
| ☐ K14 | Open each of the four tabs for the first time in a fresh browser | Each screen explains itself once, then never again |
| ☐ K15 | Finish a tour, log out, log back in | The tour does **not** replay — `wb.tours` is per device, not per account |
| ☐ K16 | Run a tour whose target control is absent (an empty cart, a gated wizard) | The step still shows, just without the ring. No crash |
| ☐ K17 | Voice input: tap a mic on a text field in Chrome | It dictates into **that** field only, and the keyboard is still there |
| ☐ K18 | Open the same screen in a browser with no Web Speech API | The mic simply does not render. Nothing is broken or greyed out |
| ☐ K19 | Notifications screen | Order events plus admin notices (approval, rejection, slots, block) in one feed |
| ☐ K20 | Admin blocks her, then reload her app | She is **told** she is blocked, with the reason. Not silently unable to sell |
| ☐ K21 | Admin unblocks her | She is notified and can sell again |

---

## 12. Suite L — Admin console

Profile C at `:5174`.

| ID | What to do | What must happen |
|---|---|---|
| ☐ L1 | Home / Today | Pending payments and stuck orders shown as action tiles with counts |
| ☐ L2 | Click the pending-payments tile | Navigates to Payments |
| ☐ L3 | Today: the health stats | Active sellers, total sellers, new this week, orders today/week, ₹ earned month/total, women with a first earning, subscription income, payments approved |
| ☐ L4 | Today: the two donut charts | Earning spread and readiness spread render with a centre label. No NaN, no empty ring on seeded data |
| ☐ L5 | With everything handled | An "all clear" empty state, not a blank panel |
| ☐ L6 | Payments queue | Three PENDING rows, each with waiting hours; the ~50h one is visibly the oldest |
| ☐ L7 | The duplicate-UTR row | Flagged as a duplicate |
| ☐ L8 | Approve a payment | The row leaves the queue; the seller becomes ACTIVE with +5 slots |
| ☐ L9 | Reject a payment with no reason, via curl | 400 — the **server** requires the reason, not just the form |
| ☐ L10 | Products screen, filter PENDING | The seeded `p4` is there |
| ☐ L11 | Approve a product | It goes LIVE and the seller is notified **by product name** |
| ☐ L12 | Reject a product with no reason, via curl | 400 |
| ☐ L13 | Reject a product with a reason | Status REJECTED. Her app shows the reason **and a countdown of hours** until removal (48h) |
| ☐ L14 | Reject the **same** product again | **409 "already rejected"** — the 48 hours must not restart |
| ☐ L15 | Approve a previously rejected product | Its reason and its deadline are both cleared |
| ☐ L16 | Age a rejection past 48h (edit `rejectedAt` in `db.json`, restart) | It is swept on the next read, on both the admin list and her list — the two never disagree |
| ☐ L17 | Sellers screen | Every seller with slot usage and product count |
| ☐ L18 | Block a seller with a reason | Status BLOCKED, `blockedAt` and reason stamped, and she is notified |
| ☐ L19 | Grant slots | +5 per pack, and she is notified in slots |
| ☐ L20 | Revoke more slots than she has spare | 409, with the exact numbers |
| ☐ L21 | Orders screen: filter by status, seller and pincode | Each filter narrows the list; newest first; each row shows the shop name and SMB id |
| ☐ L22 | Impact screen | Per-village women count and ₹ earned. Only DELIVERED orders count as earnings |
| ☐ L23 | The console's language toggle | Both languages complete; no raw `t()` keys on screen |
| ☐ L24 | Idle for over 8 hours, or edit the session's last-seen time in `db.json` | The admin session has expired — 8h idle, far shorter than the seller's 15 days |
| ☐ L25 | The admin logo | The same portrait mark as the seller app, favicon included, with **no** extra ring or background |

---

## 13. Suite M — Language, design rules and accessibility

Run these across both apps.

| ID | What to do | What must happen |
|---|---|---|
| ☐ M1 | Walk every screen in Marathi | No English leaks except brand names and Latin digits |
| ☐ M2 | Walk every screen in English | No Devanagari leaks — **including inside input placeholders** |
| ☐ M3 | Look for a string rendered as its own key (e.g. `prod.add`) | None. A missing key renders as its own name, visibly, in both languages |
| ☐ M4 | Every status chip in both apps | Colour + icon + word |
| ☐ M5 | Every confirmation dialog | States the consequence. No bare "Are you sure?" |
| ☐ M6 | Every price, count and pincode | Latin digits |
| ☐ M7 | Zoom to 200% | Nothing is clipped or unreachable |
| ☐ M8 | Narrow to 320px | No horizontal scroll; buttons still ≥56px |
| ☐ M9 | Tab through a form with the keyboard | Focus is visible and correctly ordered |
| ☐ M10 | Devtools → Network, hard reload | No web-font requests on any screen |
| ☐ M11 | Change one colour in `theme.css`'s `:root` block, reload | The whole app re-themes from that one block |
| ☐ M12 | Look at the emoji that remain | Only **data** — a seller's avatar, veg/non-veg marks. Never chrome |

---

## 14. Suite N — Security and API-level negatives

`curl` or any REST client against `:4000`. These are the tests the UI cannot do.

| ID | What to do | What must happen |
|---|---|---|
| ☐ N1 | Call any `/api/admin/*` route with **no** token | 401 |
| ☐ N2 | Call `/api/admin/payments` with a **seller** token | 403 |
| ☐ N3 | Call `/api/products/mine` with a **customer** token | 403 |
| ☐ N4 | Call `/api/catalog/products` with no token | **200** — public routes stay public; `attachAuth` never rejects |
| ☐ N5 | Base64url-decode a session token and read the payload | It carries `{sid, role, iat}` and **no identity**. No sellerId, no phone |
| ☐ N6 | Change `role` inside the payload and re-send | Rejected — the HMAC no longer matches |
| ☐ N7 | Keep the signature, swap in another `sid` | Rejected |
| ☐ N8 | Delete that session's row from `sessions` in `db.json`, restart, reuse the token | 401 immediately — "her phone was stolen" is real |
| ☐ N9 | Present a **registration ticket** as a session token | Rejected — signatures are domain-separated by purpose |
| ☐ N10 | `GET /api/auth/sessions` as a seller | Only her own live sessions |
| ☐ N11 | `DELETE /api/auth/sessions/:id` for **someone else's** session | Refused |
| ☐ N12 | Revoke one of your own sessions from another device | That device gets a 401 on its next call and is signed out |
| ☐ N13 | `POST /api/uploads/signature` with no token and no ticket | 401 |
| ☐ N14 | Inspect a signature response | Signature, timestamp and folder — **never** the Cloudinary API secret |
| ☐ N15 | Devtools → Network while uploading a photo | The bytes go **direct to Cloudinary**, not through `:4000` |
| ☐ N16 | `POST /api/uploads/delete` as a customer | 403 |
| ☐ N17 | Send a 3MB JSON body to `/api/auth/otp/send` | Refused — the auth router caps bodies at 8kb |
| ☐ N18 | 301 requests from one IP in a minute | 429 from the global backstop |
| ☐ N19 | Behind a proxy, confirm `trust proxy` is in effect | Rate limits key on the real client IP, not one shared address |
| ☐ N20 | Read the auth event log in `db.json` | Phones are **masked**, IPs are **hashed** — the log is not itself worth stealing |
| ☐ N21 | Call the API from an origin not in `CORS_ORIGIN` | Blocked |
| ☐ N22 | Set `CORS_ORIGIN` to two comma-separated origins | **Both** are allowed — it is parsed into a list, not handed over as one joined string |
| ☐ N23 | `POST /api/dev/reset` with `NODE_ENV=production` | 404 |
| ☐ N24 | Boot with `NODE_ENV=production` and **no** `SESSION_SECRET` | The server **refuses to boot** |
| ☐ N25 | Boot with `NODE_ENV=production` and no SMS provider | Refuses to boot — demo OTP cannot run in production |

---

## 15. Suite O — Degraded modes and resilience

| ID | What to do | What must happen |
|---|---|---|
| ☐ O1 | Boot with a completely empty `.env` | JSON-file database, demo OTP, no Cloudinary. The app is fully walkable and the banner says exactly this |
| ☐ O2 | Boot with an **empty** database and `SEED_DEMO_DATA` unset | It stays empty. No invented sellers ever appear in front of a real customer |
| ☐ O3 | Boot with `SEED_DEMO_DATA=1` on an empty database | The seed data appears |
| ☐ O4 | Boot with **wrong** Firebase credentials | It falls back to the JSON file and **says so loudly**. Reads and writes agree — neither silently uses the other store |
| ☐ O5 | Make several writes in under a second (advance three orders) | They coalesce into one batched write (~400ms), and `db.json` is correct afterwards |
| ☐ O6 | Kill the API mid-session and restart it | The frontend shows a Marathi error, not a white screen. Sessions survive the restart |
| ☐ O7 | Go offline in devtools and tap a button that calls the API | A Marathi error message, no crash |
| ☐ O8 | Come back online and retry | It works |
| ☐ O9 | Every API failure you can provoke | The response is `{ error, messageMr, fields? }` and the **Marathi** message is what the user sees |
| ☐ O10 | Confirm the deployment is pinned to one API instance | Two instances each hold their own in-memory snapshot and silently overwrite each other. Autoscaling must stay off |
| ☐ O11 | Delete a seller in the Firebase console while the API is running, then use her account | She still works, on the data the API loaded at boot. **This is the architecture, not a bug** — the whole dataset is read once at startup and never re-read |
| ☐ O12 | After O11, restart the API and try again | Now she is gone. A restart is the only thing that picks up an out-of-band edit |
| ☐ O13 | After O11, change something about that seller *before* restarting (edit her profile, take an order) | The document is **recreated** in Firestore: the diffed write sees a record that differs from the boot snapshot and sends it. Never edit data in the console against a running API |

---

## 16. Suite P — Android APK (React Native WebView)

Only if you are testing the packaged build. The APK loads the deployed site
(`docs/DEPLOY.md` §6), so run this after the Vercel deploy you mean to check.

| ID | What to do | What must happen |
|---|---|---|
| ☐ P1 | Install the APK and open it | The deployed site loads, the same build as the web |
| ☐ P2 | Turn off the network and open it | No English error dialog and no raw `net::ERR_…` text. Nothing is bundled into the APK, so it cannot show the shop offline |
| ☐ P3 | Deploy a visible change to `frontend/`, close the app fully and reopen it | The change is there without reinstalling the APK |
| ☐ P4 | Android hardware Back on a seller screen | Same behaviour as browser Back, and it never signs her out |
| ☐ P5 | The photo picker | Opens the **gallery**. There is no camera capture |
| ☐ P6 | Press the mic on a text field | Android asks for the microphone once; what she says fills the field |
| ☐ P7 | Marathi text | Renders from Android's Noto Sans Devanagari, with nothing downloaded |
| ☐ P8 | Copy the UPI ID on a payment screen, switch to PhonePe, paste, come back | The paste is the exact ID. On return, the 12-digit UTR box is scrolled into view and focused |
| ☐ P9 | Tap a call button and a WhatsApp help button | The phone dialler and WhatsApp open, not a web page inside the app |

Deep links into a shop (App Links + the Play Install Referrer API) are not
built yet, so there is nothing to test there.

---

## 17. Suite Q — Push notifications (APK)

Only on a real phone with a build that carries `expo-notifications` and
`google-services.json` (`docs/DEPLOY.md` §6, "Push notifications"), against a
backend deployment with `FIREBASE_*` credentials set — without them the boot
banner prints `Push  off` and there is nothing here to see. A second phone or
browser profile is needed to act as the other side of each order.

| ID | What to do | What must happen |
|---|---|---|
| ☐ Q1 | Sign in as a seller or a buyer inside the APK | Android's permission prompt appears now, not earlier on the landing page |
| ☐ Q2 | With that seller signed in, place an order for her from a second device or browser — once with the app in the foreground, once backgrounded, once fully closed (swiped away) | Each time, "नवीन ऑर्डर आले आहे" arrives in the notification tray, with sound |
| ☐ Q3 | Tap the notification once from a fully closed app, and once from a running one | Both taps open that order's screen, `/seller/orders/:id` |
| ☐ Q4 | As the buyer, have the seller walk the order through accept, pack, send out and deliver (or reject); then switch the app's language to English and repeat with another order | A notification arrives for every step, in Marathi first and in English after the switch |
| ☐ Q5 | Log out on the phone, confirm nothing more arrives, then sign in as a different seller or buyer on the same phone | Nothing arrives to the logged-out session; only the newly signed-in person's notifications arrive afterward |
| ☐ Q6 | Repeat Q2–Q3 on at least one Xiaomi, Oppo, Vivo or Realme phone, with Autostart allowed and battery use set to "No restrictions" | Notifications still arrive with the app fully closed |

---

## 18. Cross-cutting regression matrix

Re-run this short list after **any** change to auth, the store, or `shared/`.

- [ ] Log in as a seller, hard-refresh, still signed in
- [ ] Log in as a customer, press Back to `/`, still signed in
- [ ] Place a COD order end to end through DELIVERED
- [ ] Place a UPI order and confirm the payment separately
- [ ] Publish a product; it appears in the customer catalogue
- [ ] Fill every slot; the 6th is refused by the **server**
- [ ] Admin approves a payment; the seller goes ACTIVE
- [ ] Admin rejects a product with a reason; she reads the reason and a countdown
- [ ] Switch to English; no Devanagari placeholders anywhere
- [ ] `npm test` and `npm run typecheck` still green

---

## 19. Bug report template

```
ID:            (the test ID, e.g. H12)
Surface:       seller app / customer app / admin console / API
Build:         git rev-parse --short HEAD
Environment:   .env shape (Cloudinary on/off, Firestore on/off, OTP mode from the boot banner)
Account:       phone / SMB id / admin email
Steps:         1.
               2.
               3.
Expected:      (quote the "What must happen" column)
Actual:        (what you saw; screenshot)
API response:  (status plus the {error, messageMr, fields} body, from devtools Network)
Console:       (any JS error)
Severity:      blocker / major / minor / cosmetic
Reproducible:  always / sometimes / once
```

---

## 20. Documentation that is out of date

Two things in `CLAUDE.md` no longer match the code. Test the **code**, not the doc:

1. **The order state machine is five states, not six.** `COMPLETED` was removed;
   `shared/src/orderFlow.ts` ends at `DELIVERED`. Suite I is written against the code.
2. **There is no pre-publish moderation queue for products.** A seller's listing goes
   straight to `LIVE` (`backend/src/routes/products.routes.ts`), and editing a live
   listing no longer sends it back to a queue — `MODERATED_FIELDS` and
   `touchesModeratedContent()` do not exist any more. Moderation is after the fact:
   an admin can still take a listing down. Suites E and F are written against the code.

`CANCELLED` is a third case: it exists as an order status and has strings in both
dictionaries, but no endpoint or UI can reach it. Test I17 records that as a gap.
