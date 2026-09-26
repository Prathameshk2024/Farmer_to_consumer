# Training session checklist

For trainers and field coordinators running a 2–3 hour session on the website
for farmers, with students and teachers helping.

---

## Before the session: the rate limits will notice a training room

The server limits sign-ups and logins per internet connection
(`backend/src/auth/rateLimit.ts`). If the whole room is on one venue Wi-Fi or
one phone's hotspot, the room counts as one address:

| Limit | Value | What happens in the room |
|---|---|---|
| Registrations from one connection | **10 per hour** | The 11th farmer waits an hour |
| Logins from one connection | 50 per hour | Typos by the whole room add up |
| Wrong passwords for one phone | 5 per 15 minutes | That phone waits 15 minutes |
| Forgot-password requests | 3 per phone per day, 20 per connection per hour | — |

- [ ] **Best option:** each farmer uses their own mobile data, not a shared network.
- [ ] **Or** raise the limits for the day, deploy **the night before**, and put them back afterwards. The counts are held in memory, so a deploy also resets them.
- [ ] **Never deploy during the session.** The server must run as a single copy, and for a few seconds during a deploy there are two.

---

## A. The day before

- [ ] Admin console login works. Have **two admins**: one presents, one verifies farmers live.
- [ ] Set up **one demo farmer** (a trainer's number), verified, with 3–4 live listings and a real UPI ID. All practice orders go to this farmer.
- [ ] **Practice orders never go to real farmers.** An order reaches whoever it is placed with.
- [ ] Materials: projector or a phone mirrored to a screen; the website address as a printed QR code; a list of expected farmers (name, phone, village); one-page Marathi cards (login, adding produce, accepting an order, confirming a payment); a few produce samples to photograph; power banks and cables; an attendance and photo-consent sheet.
- [ ] Walk the whole flow once on a cheap Android phone in Chrome: register → verify (admin) → listing → order → accept → payment → deliver or pickup → rating. Time it.

## B. On the day (arrive 45 minutes early)

- [ ] Check 4G signal in the hall for each carrier.
- [ ] Open the site once; the first load may be slow after the server was idle.
- [ ] Admin console open on a laptop at the Farmers list, filtered to those awaiting verification.
- [ ] Seat farmers in groups of 3–4 with one volunteer each. Brief volunteers: **point, do not press** — the farmer's own finger does it. Never ask anyone for their password.
- [ ] Offer "Add to home screen" in Chrome so the site opens like an app.

## C. Session plan (about 2 hours 45 minutes)

| Time | Part | Content |
|---|---|---|
| 0:00–0:15 | Introduction | What the site does, who buys, that it is free |
| 0:15–0:55 | Registration | In small groups, because of the limits above |
| 0:55–1:05 | Tea break | Admin verifies the new farmers |
| 1:05–1:40 | Adding produce | Photo, crop, unit, price, quantity, minimum order, harvest date, cultivation |
| 1:40–2:15 | Orders and money | Trainers place live orders; each farmer accepts and completes one |
| 2:15–2:30 | The buyer's side | Students and teachers as buyers |
| 2:30–2:45 | Safety, questions, closing | Printed cards, help number |

## D. What to cover

### 1. Introduction
- [ ] A shop on the phone that buyers from other villages and towns can see.
- [ ] **Free.** No fee, no commission.
- [ ] **Money goes straight from the buyer to the farmer's UPI, or as cash on delivery.** The site never holds money.
- [ ] Everything is in Marathi, and the mic can type by voice.

### 2. Registration (ten screens, one question each)
1. [ ] **Phone and password.** At least 6 characters; digits only is fine. Write it down somewhere safe at home.
2. [ ] Name · 3. Village, taluka, pincode · 4. Location — "माझे ठिकाण वापरा" puts the farm on the buyers' map (rounded to about 1 km); it can be skipped.
5. [ ] Main crops.
6. [ ] **UPI ID — the most important screen.** Open PhonePe or GPay and read the UPI ID from there, not from memory. A wrong ID sends buyers' money to a stranger. If the site asks "Did you mean @ybl?", check and correct it.
7. [ ] Age group, education, landholding, farmer type · 8. The ten digital-readiness questions — there are no right or wrong answers · 9. How produce is sold today and the main problems.
10. [ ] Review every answer; "बदला" goes back to that screen.
- [ ] Explain the farmer ID (e.g. `F2C-ANADUR-001`): village and serial number.
- [ ] Until an admin verifies the farmer, listings can be prepared but buyers do not see them. Show one verification live.

### 3. Forgotten password
- [ ] "पासवर्ड विसरलात?" on the login screen: leave phone and name, and a representative calls back with a temporary password, which must be changed at the next login.

### 4. Adding produce
- [ ] **One photo, from the gallery.** Take it with the camera first: good light, plain background, the whole produce visible.
- [ ] Crop, category (use **"Other"** rather than a wrong category), unit, price per unit, available quantity, minimum order, harvest date, organic / natural / chemical.
- [ ] The price hint under the price box shows what others ask on the site and, when available, the mandi price. It is advice, not a rule.
- [ ] A verified farmer's listing goes live at once. Price and quantity can be changed any time — keep them honest.
- [ ] Delivery, pickup or both: set a pickup place and/or delivery pincodes on the profile.
- [ ] Show the listing's QR code: print it and stick it on the crate; a buyer who scans it sees the farmer, village, harvest date and cultivation.

### 5. Orders (do it live)
- [ ] A new order appears in the updates list **while the site is open**; there is no pop-up notification. Open the site twice a day.
- [ ] "Outside your area" means the pincode is not on the farmer's list — decide whether delivery is possible.
- [ ] **Accept or reject**, with a reason from the list.
- [ ] **UPI order:** after acceptance the buyer pays → **check your own UPI app** → only then press "Money received". A UTR typed by the buyer is not money. Until the money is confirmed, the "Packed" button does not appear.
- [ ] **Cash on delivery:** collect the cash at delivery or pickup.
- [ ] Delivery: Packed → Out for delivery → Delivered. Pickup: Ready for pickup → Delivered.
- [ ] Delivery charge 0 shows buyers "ask the farmer". Call the buyer; the number is on the order.
- [ ] A farmer can cancel between Accepted and Out for delivery. **Money already received must be returned by the farmer**; the site moves no money.

### 6. The buyer's side
- [ ] Register with phone and password, then name.
- [ ] Browse, search (the mic works here too), the farmer map, a farmer's page.
- [ ] A cart holds one farmer's produce at a time.
- [ ] Order → wait for acceptance → **then pay** (QR or UPI ID, then the 12-digit UTR), or cash.
- [ ] **Rating is required after delivery** before another order can be placed. Say so in advance.

### 7. Safety
- [ ] Never tell anyone your password or UPI PIN. There is no PIN for *receiving* money.
- [ ] A "payment done" screenshot or SMS is not money. Only your own UPI app is.
- [ ] Do not put a phone number in a listing description.
- [ ] On a shared phone, **log out** after use.

## E. Suiting the audience

- [ ] Speak Marathi and use the site's own words: ऑर्डर, भरणा, स्वीकारा.
- [ ] One step → they do it → check → next. Go at the pace of the slowest person.
- [ ] Every status has a colour, an icon and a word — point at all three.
- [ ] Use a local example with a real price ("टोमॅटो, 1 kg, ₹30").
- [ ] Photos only with consent. Choose a time that fits field work.

## F. Closing and after

- [ ] Hand out the cards, the help number and the local coordinator's name.
- [ ] List anyone who did not finish (network, limits) and follow up the next day.
- [ ] Admin: verify every real registration the same day; cancel practice orders.
- [ ] If limits were raised, put them back and deploy.
- [ ] Note which screen or word caused trouble, so it can be fixed.
- [ ] Call each farmer after a week and ask whether the first order has come.

**What the site does not do yet**, so it can be answered honestly: no phone
notifications, no chat, no returns or refunds inside the site, no in-app
camera (photos come from the gallery).
