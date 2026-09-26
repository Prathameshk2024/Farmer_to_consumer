# Shantai Mahila Bazar — Feature Specification

Women entrepreneurs sell, customers buy, admin monitors. Delivery is manual and handled
directly between seller and buyer. Sellers and customers use the **app** (mobile-first web,
wrappable into a native app). Admin uses the **web** console.

Priority tags: **[P0]** build in the skeleton · **[P1]** needed before real launch · **[P2]** later.

---

## 1. Decisions to lock before building

These change the database shape, so they are cheaper to answer now than to migrate later.

| # | Question | Recommendation |
|---|---|---|
| 1 | Can one phone number be both seller and customer? | Yes — one account with `roles[]` and a role switcher. Avoids duplicate KYC. |
| 2 | Cart with items from three sellers? | Split into three orders under one `order_group`. Delivery and payment are both per-seller, so it has to be. |
| 3 | Is the ₹50 lifetime or does it expire? | **Decided September 2026: six months.** The shop stays open for 6 months from the admin's approval; then the whole shop pauses until a flat ₹50 renewal is approved, which puts back every pack and product as it was. Only `Seller.subscriptionEndsAt` is stored — see `shared/src/subscription.ts`. |
| 4 | Do product **drafts** consume a slot? | No. Only products that are live, pending approval, or paused. One product holds one slot: the seller cannot delete a submitted product to free it. Only an admin rejecting or taking down a product frees its slot (changed September 2026 — seller-side archiving let one pack rotate through unlimited products). A woman with a bad listing asks an admin to take it down. |
| 5 | Does the platform take a commission on orders? | Recommend **no** in v1. The money goes buyer → seller directly via her UPI; the platform never holds it. That avoids payment-aggregator licensing entirely. |
| 6 | Who guarantees the delivery happened? | Nobody but the seller — which is exactly why you need a delivery OTP. |
| 7 | Languages | **Marathi (default) + English.** Hindi is easy to add later since the i18n layer is the same. |
| 8 | Android only for v1? | The share-QR requirement points at the Play Store, so yes — Android first. iOS deferred deep linking is harder and can wait. |
| 9 | How is a seller's service area defined? | A pincode list per seller. Simplest thing that works for manual delivery. |

---

## 2. The order lifecycle is the product

Delivery is manual, so the state machine carries everything. Every other feature hangs off it.

**This sequence is locked. Six states, in this order, no additions:**

```
PLACED → ACCEPTED → PACKED → OUT FOR DELIVERY → DELIVERED → COMPLETED
```

Payment is deliberately *not* a step in this chain — see below. Adding a payment state
into the middle is the change that would break it, because a cash order and a UPI order
have to walk the same six screens.

### Happy path

| State | Who moves it | What gets captured |
|---|---|---|
| `PLACED` | Customer | items, address, payment mode, 4-digit delivery OTP generated |
| `ACCEPTED` | Seller | must accept before a timer expires (say 2 h) or it auto-cancels |
| `PACKED` | Seller | optional ready-by time |
| `OUT_FOR_DELIVERY` | Seller | who is delivering (self / family / helper), expected time |
| `DELIVERED` | Seller | **must enter the customer's delivery OTP** |
| `COMPLETED` | System | automatic, once the return window closes |

### Exceptions

| State | Who | Notes |
|---|---|---|
| `REJECTED` | Seller | reason required: out of stock, can't deliver there, shop closed |
| `CANCELLED_BY_CUSTOMER` | Customer | only before dispatch, reason required |
| `CANCELLED_BY_SELLER` | Seller | reason required, counts against her metrics |
| `RETURN_REQUESTED` → `RETURN_APPROVED` → `REFUNDED` | Buyer / Seller / Admin | photo proof and reason. Food is non-returnable by default |
| `DISPUTED` | Either party | routed to the admin desk with the full timeline |

### Payment status is a separate axis

Because money moves buyer → seller directly, payment does **not** belong in the order state machine.
Track it in its own column:

`COD_PENDING` → `COD_COLLECTED` · `UPI_SUBMITTED` → `UPI_CONFIRMED_BY_SELLER` · `REFUND_PENDING` → `REFUNDED`

### Rules that matter

- Every transition writes a row to `order_status_events` — actor, timestamp, note, optional GPS. That table **is** what admin monitors.
- The customer's phone stays **masked until the seller accepts**, and the seller's likewise.
- **Stuck-order alarms:** accepted with no dispatch in X hours, or out for delivery with no delivery in Y hours → admin alert plus a nudge to the seller.
- The buyer sees the OTP on the confirmation screen with one instruction, in Marathi: *give this number to the seller when your order arrives.*

---

## 3. Registration fee & product slots

### The flow

₹50 buys one **pack**: 5 product slots. Want a 6th product? Buy another pack — 5 more slots, 10 total.
There is no payment gateway; she pays the admin's bank/UPI account directly and admin approves it by hand.

```
1. Phone + OTP                     → account created
2. Fill profile + shop + her UPI   → seller_profile saved
3. PAYMENT SCREEN (blocking)       → admin's UPI QR + bank details + "₹50"
   she pays from her own UPI app
4. She enters the UTR / reference number + uploads the payment screenshot
5. status = PAYMENT_SUBMITTED      → she waits
6. Admin sees it in the approvals queue, checks the bank statement
7. Approve  → status = ACTIVE, +5 slots granted, SMS + push to her
   Reject   → reason shown, she can resubmit without losing anything
```

### Seller account states

| State | She can… |
|---|---|
| `REGISTERED` | fill profile, watch training videos, set up her shop — **cannot publish products** |
| `PAYMENT_SUBMITTED` | same, plus a clear "पेमेंट तपासले जात आहे" banner with the expected wait |
| `ACTIVE` | everything, up to her slot count |
| `PAYMENT_REJECTED` | see the reason, fix it, resubmit |
| `BLOCKED` | admin-suspended, listings hidden |

### The waiting screen **[P0]** — required

The moment she submits the reference number, she lands on a dedicated screen. Not a toast,
not a banner she can miss — a full screen that answers the only question she has: *did my ₹50
go through?*

It shows:

- A large clock or hourglass illustration — no error colours, nothing red
- **तुमचे पेमेंट मिळाले आहे** — "We have received your payment"
- **प्रशासकाच्या मंजुरीची वाट पहा** — "Please wait for admin approval"
- The expected wait in plain words: साधारण २४ तासांत मंजूर होईल
- What she submitted, echoed back: ₹50, the reference number, the date and time
- **मंजूर झाल्यावर तुम्हाला SMS येईल** — "You will get an SMS when it is approved." This is the line that stops her calling support.
- Two buttons: **प्रशिक्षण पहा** (Watch training) and **मदत** (Help, opens WhatsApp)
- A speaker button that reads all of the above aloud in Marathi

After that, the same status persists as a banner across the app, and the state resolves three ways:

| Outcome | What she sees |
|---|---|
| Approved | Push + SMS, and the app opens on अभिनंदन! आता तुम्ही ५ उत्पादने टाकू शकता with a direct button to add her first product |
| Rejected | The reason in plain Marathi, and a **resubmit** button that keeps everything she already entered |
| Still waiting after 48 h | The screen surfaces a "contact support" button, and the record is flagged in the admin dashboard |

> **Design note.** Don't lock her out of the app while waiting for approval. Approval is manual and could take hours; a woman who paid ₹50 and then hits a dead end will assume she was cheated. Let her into the dashboard in a "payment pending" state where she can set up her shop and watch training videos, with the publish button visibly locked. She stays engaged and admin gets a more complete profile to verify against.

### Slot accounting

- `slots_total` = approved packs × 5 · `slots_used` = products pending, live or paused
- **[P0]** A slot meter sits at the top of My Business and of My Products: `३ / ५ उत्पादने` with a filled bar. She must always know where she stands without doing arithmetic.
- **[P0]** At 5 of 5, the Upload button shows a lock icon and opens the buy-more screen. Never a silent failure or a raw error.
- **[P0]** A seller cannot delete a submitted product. Its slot frees only when an admin rejects it or takes it down, immediately, and her screen says the slot is free again. Drafts hold no slot and she may delete them.
- **[P1]** Warn at 4 of 5: "one slot left".
- **[P1]** Admin can grant free slots manually (goodwill, a trainee batch, a demo account).
- **[P2]** Bulk packs — ₹150 for 20 slots — once you know whether anyone buys a second pack.

### Payment fraud guards **[P1]**

- **Duplicate UTR detection** — flag if a reference number was already submitted by anyone. This is the obvious attack.
- Store the payer's UPI handle and name from the screenshot for the admin to eyeball.
- Rate-limit resubmissions; log every approve and reject with the admin's identity.

> **Scale warning.** Manual verification works fine up to a few hundred sellers, then it becomes a daily chore. When it hurts, the upgrade path is UPI auto-reconciliation against a bank statement feed, or a real gateway — not more admin staff. Build the queue so a future automated verifier can write to the same table.

---

## 4. Money flow — who pays whom

Two separate flows. Keeping them separate keeps the platform out of the payments business.

| Flow | From | To | Verified by |
|---|---|---|---|
| Registration / slot packs | Seller | **Admin's** account | Admin, manually, against the bank statement |
| Order payment | Customer | **The seller's own** UPI | The seller, in her app |

### Seller's UPI, captured at registration **[P0]**

**Make her upload, not type.** Typing `sunita@ybl` correctly is a real barrier, and one wrong character sends every customer's money to a stranger. Instead:

1. **"Upload your QR"** — she picks the PhonePe/GPay QR screenshot from her gallery, or photographs it. One tap, something she already knows how to do.
2. The app **decodes the UPI ID out of the QR image** client-side (jsQR or ZXing reads the `upi://pay?pa=…` string embedded in it). No typing at all.
3. It shows the decoded ID back in large text: *"तुमचा UPI: `sunita@ybl` — बरोबर आहे का?"* with Yes / No buttons.
4. **Manual typing is the fallback**, not the default — offered only if the decode fails.

Security is unchanged by this, and in one respect improved:

- **[P0]** The decoded ID is what gets stored and paid into, so a typo is impossible by construction. That removes the highest-consequence data-entry error in the whole app.
- **[P1]** A ₹1 verification transfer confirms the handle is real and belongs to her, before her first order.
- **[P1]** Admin sees the decoded ID **and** the uploaded QR image side by side in the verification queue and confirms they match.
- **[P1]** Changing her UPI later re-enters the verification queue and notifies her old number — otherwise it's an account-takeover route.

**Generate the QR rather than only showing her uploaded image.** From her UPI ID you can build a per-order QR with the exact amount already filled in:

```
upi://pay?pa=sunita@ybl&pn=Sunita%20Tai&am=340.00&cu=INR&tn=Order%20SMB1043&tr=SMB1043
```

An uploaded screenshot has no amount in it, so the customer has to type ₹340 by hand and can get it wrong. A generated QR cannot be mistyped. Show her uploaded image only if her UPI ID is missing or unverified.

### Customer payment at checkout **[P0]**

Because the cart splits by seller, **each sub-order gets its own payment step** with that seller's QR:

1. Customer picks **UPI** or **Cash on delivery**.
2. If UPI: a screen showing the seller's photo and shop name, the amount, her QR, and a **"पैसे द्या" (Pay now)** button that fires the UPI intent so GPay or PhonePe opens with everything pre-filled. The QR is for scanning from another device; the button is the fast path on the same phone.
3. Customer enters the UTR / reference number → `payment_status = UPI_SUBMITTED`.
4. The seller sees "Payment received?" on the order with a **Yes, received** button → `UPI_CONFIRMED_BY_SELLER`. Only then does she pack.
5. If she doesn't confirm within N hours, the order surfaces in the admin's stuck list.

> **Consequence to accept.** Since the platform never holds the money, the platform also cannot refund it. A refund is the seller sending money back, which admin can only chase, not enforce. Say this plainly in the return policy, and give the dispute desk the power to block a seller who won't refund. This is the price of not needing a payment aggregator licence, and for v1 it is the right trade.

---

## 5. Share QR & app install link

After her profile is approved, generate a QR she can print, stick on her door, and put on WhatsApp status.

### What the QR encodes

A short link on **your own domain**, never a vendor's: `https://shantaimahilabazar.com/s/sunita-pickles`

### What that link does

| Situation | Behaviour |
|---|---|
| App installed (Android) | **Android App Links** open her storefront directly in the app |
| App not installed | The web page shows her shop, then sends them to the Play Store |
| After they install | The app opens **on her storefront**, not the generic home screen |

That last row is *deferred deep linking*, and it's the hard part.

> **Do not use Firebase Dynamic Links.** It was shut down on 25 August 2025 — link creation, analytics and deferred deep linking are all dead. Most tutorials you'll find still recommend it.

**Recommended approach — free and native [P1]:**
Append the shop code to the Play Store URL as a referrer, and read it back on first launch with the **Play Install Referrer API**:

```
https://play.google.com/store/apps/details?id=com.shantai.bazar&referrer=shop%3Dsunita-pickles
```

Google supports this natively on Android, it costs nothing, and no vendor can shut it off. On first launch the app queries the referrer, finds `shop=sunita-pickles`, and routes there. If you later ship iOS, that's when to evaluate Branch or AppsFlyer OneLink — pay for it only when you actually need it.

### The QR as a real object **[P0]**

- Generated as a **shareable poster image**, not a bare QR: her photo, shop name in Marathi, "स्कॅन करा आणि ऑर्डर करा", and the QR.
- One-tap **Share on WhatsApp** and **Download** — she will use both constantly.
- **[P1]** A printable A5 PDF version for her door or a stall.
- **[P1]** Admin can bulk-generate posters for a whole training batch.

### Track it **[P1]**

Log scans, installs and orders per shop code, then show her the number on her dashboard: *"१२ लोक तुमच्या QR मधून आले"*. It turns an abstract feature into something she can feel, and it tells you whether the channel works at all.

---

## 6. Designing for rural, first-time smartphone users

You called this the most important requirement, so it gets its own section and it constrains
every screen in the spec. The assumption throughout: **she may be reading slowly, this may be her
first app that isn't WhatsApp, and the phone is probably shared.**

### Non-negotiables **[P0]**

- **Marathi is the default**, not an option buried in settings. Language is the first screen, two big buttons: **मराठी** / **English**.
- **Every icon carries a Marathi label.** Icons alone are guesses. A truck icon means nothing; "पाठवले" does.
- **Numerals stay in Latin digits** (₹500, not ५००) — that's what's printed on money and shown in every UPI app.
- **Minimum 16px text, 56px buttons, 44px touch targets.** Assume an inexpensive phone and imperfect eyesight.
- **No hamburger menu, no nested drawers.** Four bottom tabs, one level deep. If it doesn't fit in four tabs, it doesn't belong on the dashboard.
- **One question per screen** in every multi-step flow, with progress dots so she can see the end coming.
- **Camera before keyboard.** Product photos come from the camera. Anywhere text is unavoidable, put a **voice input** button next to the field.
- **Plain words, no jargon.** Not "SKU", "inventory", "listing status", "dashboard". Use "माझा व्यवसाय", "माझी उत्पादने", "किती शिल्लक आहे".
- **Colour plus icon plus word** for every order state — never colour alone. 🟡 नवीन ऑर्डर · 🔵 पाठवले · 🟢 पोहोचले.
- **Errors say what to do next**, in Marathi, never a code. "इंटरनेट नाही — पुन्हा प्रयत्न करा" with a retry button.
- **Confirm destructive things, undo everything else.** A confirmation dialog must spell out the consequence: "हे उत्पादन काढले तर एक जागा मोकळी होईल" — not "Are you sure?"

### High-leverage additions

- **[P1] Audio help on every screen.** A speaker button that reads the screen's instructions aloud in Marathi. This is the single biggest accessibility win for a low-literacy user, and it's cheap — pre-recorded clips, not TTS.
- **[P1] A 30-second how-to video** embedded at the top of each major screen, collapsible once she's watched it.
- **[P1] Guided first product.** After approval, walk her through adding product #1 with coach marks. The first success is what determines whether she comes back.
- **[P1] Offline tolerance.** A clear "इंटरनेट नाही" banner, a retry queue for order status updates, and cached product lists. Network in villages drops constantly and she must never lose typed work.
- **[P1] WhatsApp support** as a first-class channel — she already lives there. A help button that opens WhatsApp with her seller ID pre-filled beats any in-app ticket form.
- **[P2] Shared-phone safety.** A quick PIN lock on the seller section, since the phone may be the household's.

---

## 7. Shared foundations

Built once, consumed by all three roles.

- **[P0] Auth** — phone + OTP, role chosen at registration, JWT with refresh, persisted session, guest browsing with a login prompt at the cart. Rate-limit OTP sends. Email and password only for admin.
- **[P0] i18n** — Marathi and English, every string in a resource file including categories, notifications, SMS text and error messages. Marathi default.
- **[P0] Mobile shell** — bottom tab bar, four tabs per role, safe-area insets, back handling. Admin gets a desktop sidebar instead.
- **[P0] Media** — client-side image compression, one to six photos per product, CDN storage, lazy loading, skeleton placeholders.
- **[P0] Legal pages** — terms, privacy, return and refund policy, seller agreement, FSSAI disclosure, and a clear statement that payment is direct between buyer and seller.
- **[P1] Notifications** — push, SMS and WhatsApp, plus an in-app inbox. Templated per event: payment approved, new order, accepted, out for delivery, delivered, review request, low stock, FSSAI expiring, one slot left. SMS matters most — push gets missed.
- **[P1] Order chat** — scoped to one order, buyer to seller, masked numbers.
- **[P1] Search** — server-side index, autosuggest, typo tolerance, and it must handle Marathi queries.
- **[P1] Low-network handling** — cached catalog, retry queue, small payloads.

---

## 8. Entrepreneur app — 4 sections

### 8.1 My Business

The daily driver. This is the screen she opens the app for.

**Top of screen [P0]**
- **Slot meter** — `३ / ५ उत्पादने` with a filled bar and a "जागा वाढवा" button
- Orders today, pending-action count, earnings today / this week / this month
- **Shop open/closed toggle** — one tap to pause when she's out

**Action queue [P0]** — the most important widget in the app
- New orders awaiting acceptance, with a countdown
- **Payment received? confirm** for UPI orders
- Ready to pack · Out for delivery · Cash to collect
- Every row taps straight through to the order

**Orders [P0]**
- Tabs: New · Accepted · Out for delivery · Delivered · Cancelled · Returns
- Order detail: customer name, masked call button, address with "open in Maps", items, amount, payment mode and status, full timeline
- Buttons mirroring the state machine: Accept · Reject · Mark Packed · **Mark Out for Delivery** · **Mark Delivered (enter OTP)** · **Payment received** · Mark Cash Collected
- Cancel with reason, chat, share a simple bill

**My products [P0]**
- Slot meter repeated at the top
- Photo, price, stock, status: live / draft / pending approval / rejected / paused
- Inline quick actions — in-stock toggle, edit price, edit stock, duplicate, **delete a draft** (a submitted product cannot be deleted by her)
- Low-stock highlighting, and "pause all products" for a holiday
- Rejected products show admin's reason with a fix-and-resubmit button

**Shop settings [P0]**
- Shop name, logo, cover photo, her story
- Opening hours, weekly off, holiday mode
- **Delivery areas** as a pincode list, delivery charge, free delivery above a threshold, minimum order value
- Preparation and dispatch time, pickup-from-home allowed, return policy

**My QR [P0]** — the shareable poster, share to WhatsApp, download, and the scan count

**Rest of the section**
- **[P1] Earnings** — order-wise earnings, cash collected versus pending, UPI received, downloadable monthly statement
- **[P1] Reviews** — read, reply, report abusive ones
- **[P2] Insights** — views versus orders, top products, repeat customers, where her visitors came from
- **[P2] Offers** — percentage off, flat off, combos, free delivery above a value
- **[P2] Later** — batch and expiry tracking for food, raw-material records

### 8.2 Upload Product

A guided wizard, camera-first, autosaving as a draft at every step. Never one long form —
that's where first-time sellers give up.

**Slot check happens before step 1.** If she's at 5 of 5, she sees the buy-more screen instead
of the wizard, phrased as an opportunity, not an error.

- **[P0] Step 1 · Photos** — camera or gallery, one to six images, first is the cover, crop, auto-compress. **[P2]** short video.
- **[P0] Step 2 · Basics** — name per language, category into subcategory, short description with **voice-to-text [P1]**, tags.
- **[P0] Step 3 · Is this an eatable item?** The branch everything else depends on.

**If YES — food. Four fields, nothing else:**

| Field | Notes |
|---|---|
| **FSSAI number** | 14 digits, first digit `1` (Central) or `2` (State/Basic). Format-checked on the client, verified on the server. |
| **FSSAI expiry date** | Date picker. The platform is legally obliged to pull listings whose licence lapsed, so this drives a nightly auto-hide job with warnings at 30, 15 and 7 days. |
| **Ingredients** | Free text with **voice input** — she speaks it, she doesn't type it. |
| **Veg / Non-veg** | Two big buttons with the green and brown dots. One tap. |

**If NO — non-food. One field:**

| Field | Notes |
|---|---|
| **Material** | Free text with voice input, plus quick-pick chips for the common ones — cotton, silk, wool, clay, wood, brass, silver, paper, jute. |

> **What was cut, and why it's safe.** Earlier drafts also asked for a certificate photo, allergens, net weight, shelf life, storage instructions, prep time, size, colour and care instructions. That's 12 fields where 4 will do, and every extra field is a place a first-time seller abandons the form. Admin can verify an FSSAI number directly on the FSSAI public licence portal without her uploading a photo of the certificate. The dropped fields move to **[P2] optional extras**, shown behind an "अधिक माहिती द्या (optional)" link for sellers who want a richer listing — never blocking the first publish.

- **[P0] Step 4 · Pricing** — MRP, selling price, auto-computed discount, unit (kg, g, piece, dozen, litre, ml, set), **variants** for size or weight or colour each with its own price and stock, minimum and maximum order quantity.
- **[P0] Step 5 · Stock** — quantity, low-stock threshold, or made-to-order for unlimited, plus available days.
- **[P1] Step 6 · Delivery** — package weight, delivery charge inherited from the shop or overridden, serviceable pincodes, dispatch time.
- **[P1] Step 7 · Policies** — returnable or not, replacement window, cancellation window.
- **[P0] Step 8 · Preview and submit** — see it exactly as the customer will, then save as draft or submit for approval. **Show the slot cost: "हे प्रकाशित केल्यावर ४ / ५ जागा वापरल्या जातील."**
- **[P1] Helpers** — copy from an existing product, category templates that pre-fill fields, inline photography tips, a warning if the price looks below cost.

### 8.3 My Profile

- **[P0] Personal** — photo, name, date of birth, verified phone, languages
- **[P0] Business identity** — shop name, business type (individual, SHG member, Udyam registered), Udyam number, GSTIN if any, business address with map pin, pickup address
- **[P0] Payment details** — **her UPI ID and QR image**, verification status. This is what customers pay into, so it deserves its own screen, not a buried field.
- **[P0] My subscription** — slots total and used, payment history with dates and UTRs, **buy 5 more for ₹50**
- **[P0] Addresses** — pickup and personal
- **[P0] Settings** — language, notification preferences, hide my phone number, change phone, logout, deactivate or delete account
- **[P1] KYC** — Aadhaar or PAN masked after saving, bank account with IFSC, status badge: pending / verified / rejected with reason
- **[P1] Group affiliation** — SHG or Shantai group name, village, taluka, district, coordinator contact
- **[P1] Document locker** — FSSAI certificate, Udyam, ID proof, each with an expiry and a reminder
- **[P1] My tickets** — support requests and disputes she raised
- **[P2] Badges** — Verified Seller, Top Rated, 100 Orders. Cheap and genuinely motivating.
- **[P2] Refer another woman** — invite link with a reward

### 8.4 Help & Training

What makes the platform work for a first-time seller. A real feature, not a FAQ dump.

- **[P0] How-to videos** — short, vertical, **in Marathi**: how to pay the ₹50 and send the reference number, how to add a product, how to photograph with a phone, how to pack, how to mark out-for-delivery, how to take the OTP, **how to check money came into your UPI**. Downloadable for offline **[P1]**.
- **[P0] Step-by-step guides** with screenshots, searchable
- **[P0] FAQ** with search — lead with "मी ₹५० भरले पण मंजूर झाले नाही" and "पैसे कधी मिळतील"
- **[P0] Contact support** — in-app chat, request a call-back, **WhatsApp link**, helpline number
- **[P0] Raise a complaint or dispute** — attach an order, add photos, track status
- **[P1] Business courses** — modules → lessons → quiz → certificate. Pricing, packaging, talking to customers, **how to apply for FSSAI**, food hygiene, digital payments and fraud awareness, Udyam and GST basics, selling on WhatsApp.
- **[P1] Progress tracking** — percentage complete, resume where she left off, certificate
- **[P2] Live sessions** — webinar calendar, register, reminder, recording
- **[P2] Community feed** — announcements, other sellers' success stories, tips
- **[P2] Downloadables** — label template, price tag, WhatsApp-status poster
- **[P2] Government schemes** — MUDRA, PMEGP, Mahila Udyam Nidhi explainers

---

## 9. Customer app — 4 sections

### 9.1 Explore Products

- **[P0] Home** — pincode selector, search bar, banners, category strip, and rails: *New near you*, *Homemade & fresh*, *Top-rated women sellers*, *Festival specials*, *Recently viewed*
- **[P0] Search** — autosuggest, recent searches; **[P1]** typo tolerance and Marathi queries
- **[P0] Filters** — price range, rating, veg/non-veg, discount, in stock, **delivers to my pincode**, seller, distance
- **[P0] Sort** — relevance, price, rating, newest, nearest
- **[P0] Product detail** — gallery, price with MRP and discount, variants, unit, stock, seller card (photo, shop, rating, verified badge, distance), **FSSAI number displayed for food (legally required)**, veg mark, ingredients, allergens, shelf life, delivery estimate and charge to my pincode, return policy, add to cart / buy now, wishlist, **share to WhatsApp**, reviews with photos, similar products, more from this seller
- **[P0] Seller storefront** — her story, all her products, rating, policies. **This is the page her share-QR lands on, so it ships in the skeleton.**
- **[P1] Wishlist · follow seller**
- **[P2]** Q&A on products, short-video feed

### 9.2 Categories

- **[P0]** Icon grid → subcategories → landing page with banner, subcategory chips, filters, featured items
- **[P2]** Tiffin and subscription category, seasonal and festival collections

**Suggested taxonomy**
- Homemade Food & Snacks · Pickles, Papad & Masala · Sweets & Bakery · Beverages
- Handicrafts · Handloom & Textiles · Sarees & Dress Material · Tailoring & Custom Stitching
- Jewellery & Accessories · Beauty & Wellness (soaps, oils, herbal)
- Home Decor · Puja & Festival Items · Plants & Gardening · Gifting & Stationery
- Farm & Agri Produce · Services (mehndi, catering, tiffin)

### 9.3 Cart & Checkout

- **[P0] Cart grouped by seller** — each seller becomes a separate order with its own delivery charge, minimum order value **and its own payment**. Show this plainly or customers will be confused by several fees and several QRs.
- **[P0]** Quantity stepper, remove, save for later, stock and price change warnings
- **[P0] Bill breakup** — item total, discount, delivery fee per seller, grand total
- **[P0] Address** — saved addresses, add new with map pin, landmark and pincode, home or work label, **serviceability check against each seller**
- **[P0] Payment step per seller** — choose Cash on delivery or UPI. If UPI: **that seller's QR with the amount pre-filled**, a "Pay now" button firing the UPI intent, and a field for the reference number.
- **[P0] Order confirmation** — order ID plus **the delivery OTP shown large**: give this to the seller when your order arrives
- **[P0] Track order** — timeline, current status, payment status, call the seller, chat, cancel within the window, report an issue
- **[P0] Order history** — reorder, invoice and receipt
- **[P1]** Coupons; delivery time-slot preference and a note for the seller
- **[P1]** Rate and review after delivery; return or replacement request with a photo; refund status

### 9.4 My Profile

- **[P0]** Profile info, verified phone, email
- **[P0]** My orders with tracking and invoices
- **[P0]** Saved addresses
- **[P0]** Notification preferences and **language**
- **[P0]** Help and support, raise a ticket, order-level complaint
- **[P0]** Terms, privacy, delete account, logout
- **[P1]** Wishlist, followed sellers, my reviews, coupons and credits
- **[P2]** "Become a seller" — upgrade this account. Refer and earn.

---

## 10. Admin — web console

The job statement: see the whole flow, and step in when something breaks.

- **[P0] Auth and roles** — email and password with 2FA; Super Admin, Ops, Support, Content, Finance; a full audit log of every admin action
- **[P0] Payment approvals queue** — *the new highest-traffic admin screen.* Seller name, phone, amount, UTR, payment screenshot, payer UPI handle, submitted time, **duplicate-UTR flag**, and Approve / Reject with reason. Approving grants 5 slots and notifies her by SMS and push.
- **[P0] Admin payment accounts** — the bank details and UPI QR shown to sellers on the payment screen, editable here so you never redeploy to change an account number
- **[P0] Plan management** — price and slot count per pack, so ₹50 / 5 can change without a code change
- **[P0] Dashboard** — GMV, orders today and this week, active sellers, new registrations, **pending payment approvals**, **pending product approvals**, **stuck orders and SLA breaches**, cancellations, open disputes, cash pending collection
- **[P0] Seller management** — list and search, slot usage per seller, **manual slot grant**, subscription and payment history, KYC queue, document viewer, **FSSAI verification and expiry monitor**, **UPI verification**, block and unblock, audited view-as-seller
- **[P0] Product moderation** — approval queue, approve or reject with reason, **block food listings without a valid FSSAI**, banned-item flags, bulk actions, takedown, category re-mapping
- **[P0] Order monitoring** — every order filtered by status, seller, date or pincode; full timeline and audit per order; **stuck-order alerts** including UPI payments the seller hasn't confirmed; force-cancel; nudge the seller
- **[P0] Catalog config** — categories and subcategories, attributes, units, banners, homepage sections, featured placement
- **[P0] Content** — upload training videos and courses, FAQs, announcements, policy pages, **and the Marathi/English strings**
- **[P1] Share-QR analytics** — scans, installs and orders per shop code; bulk poster generation for a training batch
- **[P1] Customer management** — list, order history, block fraudulent accounts
- **[P1] Dispute desk** — ticket queue with an SLA, assignment, internal notes, resolution; power to block a seller who won't refund
- **[P1] Finance** — subscription revenue report, reconciliation against the bank statement, CSV export
- **[P1] Marketing** — coupons, campaigns, push composer with audience segments
- **[P1] Reports** — sales by category, seller and region; seller leaderboard; funnel; retention; average delivery time; cancellation reasons; slot utilisation
- **[P1] System** — staff and roles, app config, feature flags, maintenance mode, notification templates

---

## 11. Data model sketch

New tables for the subscription, seller UPI and share-QR requirements are marked `←`.

```
users(id, phone, name, email, roles[], language, status)
seller_profiles(user_id, business_type, udyam_no, gstin, group_name, village, taluka,
                kyc_status, account_status, upi_id, upi_qr_url, upi_verified)          ←
shops(seller_id, name, slug, logo, cover, about, is_open, hours, min_order, delivery_fee,
      free_delivery_above, prep_time, pincodes[], return_policy,
      share_code, share_qr_url, poster_url)                                            ←

plans(id, name, price, product_slots, validity_days)                                   ←
subscriptions(id, seller_id, plan_id, slots_granted, status, activated_at, expires_at)  ←
subscription_payments(id, seller_id, subscription_id, amount, method, utr_reference,
                      screenshot_url, payer_upi, payer_name, status, submitted_at,
                      verified_by, verified_at, reject_reason)                          ←
admin_payment_accounts(id, label, bank_name, account_no, ifsc, upi_id, qr_url, is_active) ←
share_link_events(id, shop_id, event_type, referrer, device_hash, at)                  ←

categories(id, parent_id, name_i18n, icon, sort_order)
products(id, shop_id, name_i18n, category_id, description, is_edible, status, unit,
         mrp, price, min_qty, max_qty, is_made_to_order, returnable, occupies_slot)     ←
product_variants(product_id, label, price, stock)
product_media(product_id, url, sort_order, is_cover)
food_details(product_id, fssai_number, fssai_expiry, fssai_cert_url, veg_mark,
             ingredients, allergens, net_weight, shelf_life, storage)
inventory(product_id, variant_id, stock, low_stock_threshold)

addresses(user_id, label, line1, landmark, pincode, lat, lng, is_default)
carts / cart_items(cart_id, product_id, variant_id, qty)
order_groups(id, customer_id, total, placed_at)
orders(id, group_id, shop_id, customer_id, address_snapshot, items_total, delivery_fee,
       total, payment_mode, payment_status, payment_utr, payment_screenshot_url,        ←
       payment_confirmed_at, status, delivery_otp, accepted_at, dispatched_at,
       delivered_at, cancel_reason, source_share_code)                                  ←
order_items(order_id, product_snapshot, qty, price)
order_status_events(order_id, from_state, to_state, actor_id, actor_role, note, at)

reviews(order_id, product_id, shop_id, rating, text, media[])
wishlists · coupons · tickets · disputes · notifications
training_courses / lessons / enrollments
banners · audit_logs · app_config · translations                                        ←
```

`slots_used` is derived — `count(products where status != 'archived')` — not stored, so it can
never drift out of sync with reality.

---

## 12. Non-functional requirements

- **Mobile-first, then wrappable** — build the UI at phone width; the admin console is the only desktop layout. Keep it all inside a PWA-capable single-page app so it can be wrapped into an APK without a rewrite — which is how it shipped: a React Native WebView loading the deployed site (`docs/DEPLOY.md` §6). The wrapper is also what makes App Links and the Install Referrer API available.
- **Rural usability** — see §6. It is a requirement, not a preference.
- **Performance** — first paint under about three seconds on 4G, compressed images, paginated lists, virtualised long lists. Budget for a ₹8,000 Android phone, not a flagship.
- **Security** — OTP rate limiting, role checks on every endpoint, KYC documents and payment screenshots in a **private** bucket behind signed URLs, PII encrypted at rest, phone numbers masked between parties, a full admin audit trail on every approve and reject.
- **Compliance** — FSSAI number on every food listing, expired licences auto-hidden, seller agreement accepted at registration, return and refund policy published, and an explicit disclosure that order payments go directly to the seller.
- **Accessibility** — 44px minimum touch targets, readable contrast, scalable text, and audio help.

---

## 13. Growth charts — hers and the platform's

Two audiences that need opposite treatments. Hers exists to **motivate**; admin's exists to
**operate and to report impact**.

> **Start capturing the events in Phase 0, even though the charts ship in Phase 6.** Analytics
> cannot be backfilled. If event logging is added six months after launch, the first six months
> of the platform's growth story simply doesn't exist — which for a programme that will have to
> prove impact to a funder or a government department is an expensive thing to lose.

### 13.1 Her growth **[P1]**

Eight rules, and they matter more than the chart types:

1. **Never compare her to other sellers.** Only to her own past. A leaderboard demotivates the majority who aren't near the top, and it leaks other women's earnings.
2. **The number comes first, the chart second.** Big number, arrow, word — the chart supports it.
3. **Bars, not lines.** Bars are far more legible to someone who has never read a chart.
4. **No axis, no gridlines, no legend.** Label every bar with its rupee value directly. She should never have to read a scale to know what a bar means.
5. **At most 7 bars** — 7 days or 6 months. Never more.
6. **Colour plus arrow plus word**, never colour alone: ↑ हिरवा + वाढ.
7. **Audio.** A speaker button reads the summary aloud in Marathi — same rule as everywhere else in the app.
8. **The empty state matters more than the chart.** With two orders, a chart is noise.

| Card | Form | What it shows |
|---|---|---|
| कमाई — earnings | Big number + 7 labelled bars | This month's total, versus last month, with the difference in rupees |
| ऑर्डर — orders | Big number + 7 bars | Order count this week versus last week |
| सर्वात जास्त विकलेले — top products | Horizontal bars with product photos, top 5 | Which product actually earns her the most. The most **actionable** thing she will ever see. |
| किती लोकांनी पाहिले — views to orders | Two numbers, not a chart | "१०० जणांनी पाहिले · १२ जणांनी ऑर्डर केली" |
| परत आलेले ग्राहक — repeat customers | Single number | Buyers who came back this month |
| तुमच्या QR मधून — from her QR | Three numbers | scans → installs → orders |

Beyond the charts:

- **[P1] Milestone cards** — *तुमची १०० वी ऑर्डर!* A celebration beats a chart for motivation.
- **[P1] Shareable monthly summary image** — *या महिन्यात मी ₹4,200 कमावले*, one tap to WhatsApp. Motivation and free marketing in the same feature. Probably the highest-return item in this section.
- **[P2] Plain-language suggestions** drawn from her own data: *शनिवारी सर्वात जास्त ऑर्डर येतात* · *लोणच्याला जास्त मागणी आहे*.

**Empty and low-data states:**

| Her data | What she sees |
|---|---|
| 0 orders | No chart at all. *पहिली ऑर्डर आल्यावर तुमचा आलेख इथे दिसेल* plus a link to the "getting your first order" training. |
| 1–4 orders | The numbers only, no chart. A 3-bar chart looks broken and reads as failure. |
| 5+ orders | Full treatment. |

### 13.2 Admin dashboards **[P1]**

Desktop, data-literate audience, so full dashboard treatment. Four boards.

**A · Usage and adoption**
- **Registration funnel** — registered → paid ₹50 → approved → first product published → first order received. **The single most important chart in the admin panel:** it shows exactly which step women fall out of, and every one of those steps is fixable.
- New registrations over time · active sellers (listed or fulfilled in the last 30 days) versus total registered
- DAU / WAU / MAU, split seller versus customer
- App installs attributed to share QRs · session and screen usage

**B · Selling**
- GMV over time, daily / weekly / monthly
- Order volume and average order value
- **Order status funnel with drop-off %** — placed → accepted → delivered → completed
- Sales by category · sales by district and taluka *(map [P2])* — geographic spread matters for a rural programme
- COD versus UPI split
- Cancellation and rejection rate over time, broken down by reason
- Delivery-time distribution — hours from ACCEPTED to DELIVERED

**C · Money raised by the women** — the impact board
- **Cumulative total earned by all women.** The headline number for the whole platform.
- **Earnings distribution histogram** — how many women earned ₹0, under ₹1,000, ₹1,000–5,000, over ₹5,000. This is the honest chart: it distinguishes helping many women a little from helping a few women a lot, which a total alone hides completely.
- **First-earning conversion** — the share of registered women who have earned at least ₹1. The most truthful single measure of whether the app works.
- **Median** monthly earnings per active seller — median, not mean, because a few high earners will distort the mean badly at this scale
- Earnings by district · month-on-month growth
- Top earners — internal only, never surfaced in the app

**D · Platform revenue and operations**
- ₹50 subscriptions collected over time
- **Slot-pack repurchase rate** — how many women bought a second pack. The clearest signal of whether the business model works at all.
- Pending versus approved payments, and **approval queue age** — how long women are waiting. That's an SLA on somebody's livelihood, so alert on it.
- Product approval queue age · stuck orders · open disputes and resolution time

**[P1] Impact report export.** A programme like this will have to show a funder, an NGO board or a government department: *N women, ₹X earned, Y districts.* Give admin a one-click monthly PDF and CSV. Built once, it saves assembling the same numbers by hand every month forever.

### 13.3 Chart standards

- **Never a dual-axis chart.** Two measures at different scales become two charts, not two y-axes.
- Sequential scales are one hue, light to dark. Diverging scales are two hues with a neutral grey midpoint. Never a rainbow.
- Categorical hues are assigned in a fixed order and never cycled; colour follows the entity, so filtering a series out must not repaint the survivors.
- Two or more series always carry a legend, and up to four are also directly labelled — identity is never colour alone.
- Every chart gets a date-range picker, compare-to-previous-period, and CSV export.
- **Validated categorical palette** (passes lightness band, chroma floor, CVD separation, normal-vision floor and contrast in both themes — use this order):

| Slot | Light | Dark |
|---|---|---|
| 1 | `#3D5AC4` | `#6E86E0` |
| 2 | `#B31A5B` | `#D4568C` |
| 3 | `#C07C10` | `#B8862F` |
| 4 | `#00897A` | `#1F9C88` |

### 13.4 Data these charts require

Most of it already exists in the schema. What has to be added now:

| Source | Feeds |
|---|---|
| `order_status_events` *(exists)* | order funnel, delivery times, stuck orders |
| `orders` where `COMPLETED` *(exists)* | all earnings and GMV figures |
| `subscription_payments` *(exists)* | platform revenue, repurchase rate, approval queue age |
| `share_link_events` *(exists)* | QR scans, installs, attributed orders |
| **`app_events(user_id, role, event, screen, at)`** ← new | DAU/WAU/MAU, screen usage, funnel steps |
| **`product_views(product_id, viewer_hash, at)`** ← new | views-to-orders, her "how many people looked" card |

---

## 14. Build order

| Phase | Contents |
|---|---|
| **0 — Skeleton** | Routing and role-based shells, every screen with real layout and mock data, the order state machine, **the subscription/slot state machine**, Marathi + English i18n scaffolding, and the design system built to §6's rules |
| **1 — Seller core** | Auth, registration with the ₹50 payment step, product upload wizard with the FSSAI branch and slot gate, my products, order actions, delivery OTP |
| **2 — Customer core** | Explore, categories, product detail, seller storefront, cart split by seller, per-seller UPI checkout, order tracking |
| **3 — Admin** | Payment approvals, seller and product moderation, order monitoring, catalog config |
| **4 — Real backend** | Replace mocks; notifications, reviews, disputes, share-QR generation and tracking |
| **5 — App wrapper** | React Native WebView APK (built), Android App Links, Play Install Referrer deep linking, Play Store listing |
| **6 — Growth charts** | Her earnings and orders cards, top products, milestones, shareable monthly summary; the four admin boards and the impact export |
| **7 — Polish** | Training content and audio help, offers, earnings reports |

**One thing from Phase 6 has to happen in Phase 0:** writing `app_events` and `product_views`.
The charts can wait; the data they read cannot be created retroactively.

---

## Sources

- [FSSAI registration process and the 14-digit number — ClearTax](https://cleartax.in/s/fssai-registration)
- [FSSAI food licence for e-commerce — ClearTax](https://cleartax.in/s/e-commerce-fssai-food-license-registration)
- [FSSAI direction on e-commerce food business operators (2024)](https://fssai.gov.in/upload/advisories/2024/07/669a5e5daca83direction%20merged.pdf)
- [Food safety compliance for e-commerce FBOs — CliniExperts](https://cliniexperts.com/regulatory-update/food-safety-compliance-for-e-commerce-fbos/)
- [Firebase Dynamic Links shutdown and migration — Branch](https://www.branch.io/guides/how-to-migrate-from-firebase-dynamic-links/)
- [Deferred deep linking after the FDL shutdown — MessageFlow](https://messageflow.com/blog/deferred-deep-linking/)
