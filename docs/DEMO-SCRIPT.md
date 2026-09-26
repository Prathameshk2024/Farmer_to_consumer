# Presentation script: every feature, on one laptop

For the presenter running a training-cum-presentation for teachers and
students on a projector or smart screen. Seller, customer and admin are all
run from one laptop. Checked against the code on `prathamesh2`.

The script follows one story from start to finish: a woman joins, sets up her
shop, gets approved, receives orders and gets paid. Each feature appears at
the moment it matters in that story.

---

## 0. Setup that will break the demo if skipped

### Seller and customer must NOT be in the same browser window

- [ ] The seller app deliberately **keeps all its tabs signed in as the same
      person** (`frontend/src/store/AuthContext.tsx`, the `storage` listener).
      If you log in as the customer in a second tab, **the seller tab silently
      becomes the customer too.**
- [ ] Use **two separate browser profiles**: Chrome profile "Seller" and
      Chrome profile "Customer". A normal window plus an Incognito window, or
      Chrome plus Edge, also works.
- [ ] The admin console is a different website, so it can sit in either window.
- [ ] Suggested layout: **seller on the left half of the screen, customer on
      the right half**, admin in a tab behind the seller. For every order
      step, the audience sees the action on one side and the result on the
      other.

### Make it look like a phone
- [ ] The app is designed for a phone. In each window open DevTools (F12),
      turn on the device toolbar (Ctrl+Shift+M) and pick a phone about 400px
      wide, **or** just narrow the window to half the screen.
- [ ] Zoom to 125–150% so the back row can read it. Test from the back of the
      room beforehand.
- [ ] Hide the bookmarks bar and close unrelated tabs. Turn off notifications
      on the laptop.

### Phones and numbers
- [ ] **Two real phone numbers, with the phones in the room**: one for the
      seller, one for the customer. The login code arrives by real SMS.
- [ ] If you are going to show **registration live**, both numbers must be
      **new** (never registered). Rehearse with *other* numbers.
- [ ] **Only 3 codes per number per 24 hours.** Don't rehearse on the demo
      numbers on the morning of the presentation.
- [ ] Keep one **backup seller number** and one **backup customer number**.
- [ ] The seller's phone needs a **real UPI app** with a real UPI ID (a
      trainer's). The customer's phone needs a UPI app with a little money,
      so you can make a real payment.

### Money you will actually move (keep it small)
- [ ] Set the demo products' price at **₹10–₹20**, so the buyer→seller UPI
      payment is real but cheap.
- [ ] Decide how the seller will get her 5 slots:
      - **Pay ₹50 for real** to the college UPI and approve it in admin. This
        shows the full proof-and-checks flow and is recommended.
      - **Or** use admin **Grant slots**. This is faster but skips the
        payment feature.

### Accounts and data
- [ ] An admin account works in the admin console (`npm run admin:users -- list`).
- [ ] Have a **ready photo of a product** on the laptop (and one bad, dark
      photo, used to show a rejection), plus a **screenshot of a UPI success
      screen** for the ₹50 proof. It must be on the laptop, because the
      upload happens from the laptop browser.
- [ ] At least **one other real live seller** exists in the catalogue (used
      to show "one shop per cart").
- [ ] This is the **live production site**. Anything you approve is visible
      to real buyers until the cleanup in section 12.
- [ ] **No deploys** on the day of the presentation.

### A fallback in case the network fails
- [ ] Screenshots or a screen recording of the full flow, taken at the rehearsal.

---

## 1. Introduction (10 min)

- [ ] What the market is, who it is for, and why it is named after
      कै. शांताबाई (काकी) सिद्रामप्पा आलुरे (the logo)
- [ ] **Three apps, one system**: the seller's app, the buyer's app (the same
      app, a different role) and the admin console
- [ ] **The Android app** is the same website inside an app wrapper. Show the
      APK on a phone if you have it.
- [ ] Design principles, worth saying aloud because they explain what the
      audience will see:
  - [ ] **Marathi first**, English available
  - [ ] Large text and large buttons. Every status has **colour + icon + word**.
  - [ ] Four bottom tabs, no hidden menus
  - [ ] **Voice input** (a mic) next to text boxes, with the keyboard always
        still available
  - [ ] Forms ask **one question per screen**
- [ ] **Landing page**: photo strip, "I want to sell" and "I want to buy",
      language choice

---

## 2. Seller registration: seller window (20 min)

- [ ] Landing → **I want to sell** → phone number → **OTP by SMS**
- [ ] Explain the security: a real code, single use, limited tries, 3 codes a day
- [ ] The **6-screen wizard**, with the progress dots and "Step X of 6":
  1. [ ] **About you**: name. Show the **mic** here and dictate the name.
  2. [ ] **Village and address**: village from the list, pincode
  3. [ ] **Your business**: shop name, type, **do you sell food?** This
         decides the categories and fields she sees later.
  4. [ ] **Digital use**: self-reported readiness. This is the "before"
         picture for the Digital Readiness Index.
  5. [ ] **Where your money arrives**: UPI ID
     - [ ] **Show the typo check**: type `name@ybll` and the app asks
           "Did you mean @ybl?"
     - [ ] Explain why: a wrong UPI ID sends the buyer's money to a stranger
  6. [ ] **Check**: every answer, with **Change** jumping back to that screen
- [ ] **Draft is saved**: go back or refresh halfway through and the answers
      are still there
- [ ] Done → the **SMB ID** (`SMB-<VILLAGE>-<NN>`). The number counts per
      village, so a field coordinator knows where to go.
- [ ] The **walkthrough**: the first time each tab opens, it explains itself

---

## 3. Seller home and the ₹50 subscription (15 min)

### Seller home (My business)
- [ ] Shop **open/closed** switch. Closing hides the whole shop from buyers.
- [ ] Slots used / available
- [ ] "Needs your action" list
- [ ] Links to products, orders, buyers, reviews

### The subscription
- [ ] Rule: **₹50 = 5 product slots, valid 6 months**, with no commission on
      sales
- [ ] Open the subscription/payment screen:
  - [ ] **QR code** plus **Save QR to phone**. Explain that a phone cannot
        scan its own screen, so she saves the QR and scans it from the
        gallery inside PhonePe or GPay.
  - [ ] **UPI ID with a copy button**, and the **amount written in words**
        next to the QR
  - [ ] The three written steps
- [ ] Pay the ₹50 from the seller's phone (or skip to Grant slots)
- [ ] Fill in the proof:
  - [ ] **Screenshot** of the success screen (required)
  - [ ] **Date and time paid**: try a future time and it is refused
  - [ ] **UTR**: type 11 digits and the button stays **disabled**. At
        exactly 12 digits it turns on.
- [ ] Submit → the **waiting** screen

### Admin window
- [ ] Sign in to the admin console
- [ ] **Home / Today**: counts of what is waiting
- [ ] **Payments**: the screenshot inline, open it large beside the UTR,
      time and amount, and **"waiting for X hours"**
- [ ] **Approve stays disabled until all three checks are ticked**: UTR
      matches, time matches, money on the statement. Tick them one at a time
      on screen.
- [ ] Approve → back in the seller window, refresh: **5 slots** and an end date
- [ ] Mention **Reject** (always allowed, no checklist) and the
      **7-day renewal reminder**, then the "paused — renew" state. After
      renewal everything comes back exactly as it was.

---

## 4. Adding a product and admin checking (20 min)

### Seller window: New product wizard
- [ ] Walkthrough ring on the progress dots
- [ ] **Photo**: from the gallery only, one photo. The app **compresses it on
      the device** (mention it saves mobile data). Remove it with ✕ and
      choose again.
- [ ] Category, with **"Other"** as the escape hatch when nothing fits
- [ ] Food product: **ingredients** and **veg/non-veg** (the printed
      FSSAI-style mark). A non-food product asks for material instead.
- [ ] Name (use the **mic**), price, MRP, unit, stock, **made to order**
- [ ] **Draft**: leave the wizard halfway, e.g. to change the language from
      Profile, and come back to find the work still there
- [ ] The final button says **"Send for checking"**, not "Publish". Explain why.
- [ ] Send **two** products: one good, and one with the dark photo

### Admin window: Products
- [ ] Pending queue
- [ ] **Reject** the dark-photo one **with a reason**, which is required
- [ ] **Approve** the good one

### Seller window
- [ ] The rejected product shows the **reason**, and **the slot is free again**
- [ ] The approved product is **LIVE**
- [ ] The **Updates** list (bell) now shows both decisions

---

## 5. Everything else in the seller app (10 min)

- [ ] **My products**:
  - [ ] Status pills (pending / live / paused / rejected / draft)
  - [ ] **Pause / Resume** a live product
  - [ ] **No delete button on a submitted product**. Only drafts can be
        deleted. Explain: otherwise one pack becomes unlimited products.
- [ ] **Edit product**: one page, not a wizard
  - [ ] **Price and stock: change as often as you like**
  - [ ] **Name, photo, category and similar: only 2 edits** on a live
        product. Show the "edits left" count and the field turning disabled
        once used up.
- [ ] **Profile**: edit profile, payment QR / UPI, **language switch**
      (switch to English and back), subscription
- [ ] **Help & Training**: replay any walkthrough, contact details
- [ ] **Growth** screen (Digital Readiness): self-reported factors plus the
      ones **measured by the platform**
- [ ] **My buyers**, **Reviews** (both empty for now; come back after the
      orders)

---

## 6. Customer registration and shopping: customer window (20 min)

- [ ] Landing → **I want to buy** → OTP → **name** (a buyer without a name is
      sent to register)
- [ ] **Explore / Home**, **Categories** → one category
- [ ] **Pincode bar**: enter a pincode. Outside the seller's area the app
      **warns but does not block**.
- [ ] **Product page**: photo (or a category photo if none), price, veg mark,
      ingredients, seller card (name, village, rating), **"More from this
      shop"**
- [ ] **Seller's shop page** (`/shop/seller/…`): the whole shop window
- [ ] **One shop per cart**: add the demo product, then try a product from
      *another* seller. It is **refused**, naming the shop that holds the
      cart, with a button to go and look at it. Nothing is cleared for you.
- [ ] **Cart**: + / − quantity (stops at stock), 0 removes the line
- [ ] **Delivery charge "ask the seller"**: when the seller set none, the
      total says "without delivery". It never falsely says "free".
- [ ] Mention that closing a shop or blocking a seller hides all their
      products, and a hidden product's link shows "not found"

---

## 7. Order 1: the full UPI life cycle (25 min, side by side)

| Customer (right) | Seller (left) |
|---|---|
| Checkout: address, **UPI**, place order | |
| Order screen: 4-stage tracker, order number with copy, status box | |
| | Bell / Orders: **new order** (refresh if needed; the app is not push) |
| | Order detail: items, buyer's phone, area note. **Accept** |
| **Now** the pay section appears: QR, **Save QR**, UPI ID copy, **amount written** | |
| Pay ₹10–20 from the customer's phone, enter the **12-digit UTR** | |
| | "Buyer says paid" (**a claim, not money**). Check the seller's own UPI app → **Money received** |
| | Point out that **"Packed" appeared only after confirming payment** |
| Tracker: **Shipped** | **Packed** |
| Tracker: **Out for delivery** | **Out for delivery** |
| Tracker: **Delivered** | **Delivered** |
| **Rating screen covers the whole app**, with no close button | |
| Show that nothing else works, not even the tabs, until it is rated. Stars + word, optional comment. | |

- [ ] Explain **why pay after acceptance**: if the seller rejects, no money
      is stuck with no refund route
- [ ] Explain **why UTR must be exactly 12 digits** and cannot be reused on
      another order
- [ ] Seller side afterwards: **Reviews** (the product is named),
      **rating on home**, **My buyers**
- [ ] Customer: **My Orders** tabs: active / completed / cancelled

---

## 8. Orders 2–4: the other paths (20 min)

- [ ] **Order 2: Cash on delivery + outside area.** Use a Maharashtra
      pincode *not* in the seller's list. The seller sees **"outside your
      area"**; accepting means "yes, I can get there". Walk it quickly to
      delivered; no payment step.
- [ ] **Try a non-Maharashtra pincode** (e.g. Goa 403xxx or Delhi 110001):
      refused at checkout
- [ ] **Order 3: the buyer cancels** while it is still *Placed*: 3 steps
      (consequence → **reason from list** → final confirm). Show that after
      acceptance the buyer's cancel button is gone and says to call the seller.
- [ ] **Order 4: the seller cancels** after accepting (the button is at the
      bottom, not in the action bar): the same 3 steps, **then a fourth
      screen: the refund notice**. The app moves no money, so she must send
      it back. It closes only on "I understand".
- [ ] **Reject** an order at *Placed* from the seller side (reason required)
- [ ] Both sides show **who cancelled and why**, each in their own language
- [ ] **Updates list** on both sides: one row per order, labelled with its
      current state

---

## 9. Admin console: the rest (15 min)

- [ ] **Sellers**: register list, subscription pill with date, filters
      (ending this week, expired), **Sort by** (e.g. highest earned)
- [ ] **Seller detail**: profile, readiness, products, payments, reviews
  - [ ] **Grant slots / Revoke slots**
  - [ ] **Block** with a reason. Show on the customer side that her whole
        shop disappears. **Unblock** again.
- [ ] **Products**: all listings, **take down a live one** (the slot comes back)
- [ ] **Orders**: list, open one in the detail panel, who ended it and why
- [ ] **Reviews**: low-rating filter, **Hide** with a reason. Show it vanish
      from the product page and the seller's average.
- [ ] **Impact**: programme numbers, **copy as text** for reports
- [ ] Admin language switch; sort choice remembered per list

---

## 10. Behind the scenes (optional, 5–10 min, for the technical part of the audience)

- [ ] One API (Cloud Run), two websites (Vercel), a Firestore database,
      Cloudinary photos, MSG91 SMS
- [ ] Every rule is checked **on the server**, not only on the screen (slot
      limits, order steps, who may edit what)
- [ ] Login security: tokens that can be revoked, 15-day idle logout, OTP limits
- [ ] Privacy: the public sees only the seller's shop card. **Her phone
      number reaches a buyer only on the buyer's own order.** Reviews show
      the buyer's first name only.
- [ ] Scrolling memory: go deep into the catalogue, open a product, press
      Back, and you land where you were
- [ ] Offline screen when the connection drops

---

## 11. Close and Q&A (10 min)

- [ ] Recap the life cycle in one sentence: *join → pay ₹50 → add product →
      approved → order → accept → paid → deliver → rated*
- [ ] **What is not built yet** (say it before someone asks): push
      notifications, chat, returns and refunds inside the app, seller replies
      to reviews, coupons, taking a photo directly with the camera
- [ ] How the audience can help: registering sellers in their villages,
      taking good product photos, teaching the payment steps
- [ ] Contact / help number

---

## 12. Cleanup straight after (this is the live site)

- [ ] Admin: **take down** the demo products, or **block** the demo seller
- [ ] Cancel any order still open
- [ ] **Hide** the demo reviews
- [ ] Note the ₹50 and the ₹10–20 payments for the accounts
- [ ] Log out of all three apps on the laptop, and clear both browser
      profiles if the laptop is shared

---

### Time plan

| Section | Minutes |
|---|---|
| 0 Setup (before the audience arrives) | 30 |
| 1 Introduction | 10 |
| 2 Seller registration | 20 |
| 3 Home + subscription | 15 |
| 4 Products + moderation | 20 |
| 5 Seller tools | 10 |
| 6 Customer shopping | 20 |
| 7 Order 1 (UPI) | 25 |
| 8 Orders 2–4 | 20 |
| 9 Admin | 15 |
| 10 Behind the scenes | 5–10 |
| 11 Q&A | 10 |
| **Talking time** | **about 2 h 50 min** |

If time is short, cut section 10 and do only one of orders 3 and 4.
