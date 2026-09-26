# Presentation script: every feature, on one laptop

For a presenter showing the website to teachers, students or an Aavishkar
panel on a projector. Farmer, buyer and admin all run from one laptop.

The script follows one story: a farmer joins, is verified, lists produce,
receives orders and gets paid. Each feature appears where it matters.

---

## 0. Setup that will break the demo if skipped

**Farmer and buyer must not share a browser profile.** The app keeps all its
tabs signed in as the same person (`frontend/src/store/AuthContext.tsx`, the
`storage` listener), so logging in as the buyer in a second tab silently turns
the farmer tab into the buyer. Use two Chrome profiles (or Chrome + Edge).
The admin console is a separate site and can sit in either.

- [ ] Farmer on the left half of the screen, buyer on the right, admin in a
      tab behind the farmer.
- [ ] Make each window phone-sized (DevTools device toolbar, ~400px) and zoom
      to 125–150% so the back row can read it.
- [ ] Two phone numbers and passwords ready: a farmer and a buyer. For live
      registration, use numbers never registered before.
- [ ] The farmer needs a real UPI ID; the buyer's phone a UPI app with a
      little money. Price demo produce at ₹10–₹20.
- [ ] An admin account (`npm run admin:users -- list`).
- [ ] A good produce photo on the laptop (uploads happen from the laptop).
- [ ] At least one other live farmer in the catalogue, to show one farmer
      per cart.
- [ ] If this is the live site, everything approved is public until the
      cleanup in section 10. No deploys on the day.
- [ ] A screen recording of the full flow, in case the network fails.

---

## 1. Introduction (10 min)

- [ ] The problem from the research paper: middlemen take a large share of
      what the buyer pays. The model: farmer lists, buyer orders, money goes
      straight to the farmer.
- [ ] Three surfaces, one system: farmer and buyer share one website (a
      different role), the admin console is a second site.
- [ ] Design rules worth saying aloud: Marathi first with an English toggle;
      large text and buttons; every status is colour + icon + word; four
      bottom tabs; one question per screen in forms; a mic beside text boxes.
- [ ] Landing page: the need, objectives, workflow, benefits, the college.

## 2. Farmer registration: farmer window (20 min)

- [ ] Landing → register as farmer → **phone and password** (no OTP; a PIN
      of 6+ digits is fine).
- [ ] The ten-screen wizard with progress dots: name (show the **mic**) →
      village, taluka, pincode → location ("माझे ठिकाण वापरा", skippable) →
      crops → **UPI ID** → age, education, landholding, farmer type → the
      ten **FDRI** questions → current selling channel and problems → review.
- [ ] On the UPI screen type `name@ybll`: the site asks "Did you mean
      @ybl?". A wrong UPI ID sends a buyer's money to a stranger.
- [ ] Refresh halfway: the draft is still there.
- [ ] Done → farmer ID `F2C-<VILLAGE>-<NNN>`, serial per village.
- [ ] The farmer is **awaiting verification**: listings can be prepared, but
      buyers see nothing yet.

## 3. Verification and admin basics: admin window (10 min)

- [ ] Sign in → **Today** and **Home**: what is waiting.
- [ ] **Farmers** → the new farmer → **Verify** (once, for good).
- [ ] Mention **Block** with a reason, which hides the whole shop.
- [ ] **Password requests**: a farmer who forgot the password leaves phone
      and name on a public page; the admin calls back and uses **Reset
      password**, which shows a temporary password once and signs out every
      session. The farmer must change it at next login.

## 4. Listing produce: farmer window (15 min)

- [ ] New listing wizard: **photo** (gallery, compressed on the device) →
      crop and category ("Other" when nothing fits) → unit (kg, quintal,
      dozen, piece, litre) → **price per unit**, with the **price hint**
      under the box (the site's median and, with an API key, the Agmarknet
      mandi price) → quantity and **minimum order** → **harvest date** →
      **organic / natural / chemical**.
- [ ] A verified farmer's listing is **live at once**.
- [ ] **Edit** is one page; price and quantity change any time.
- [ ] **Traceability QR** on the listing: download or print it. Scan it
      with a phone → `/trace/<id>`: farmer, village, harvest date,
      cultivation, map pin, "order now".
- [ ] Profile: **delivery** (pincode list) and/or **pickup** (a named
      place); own map pin; language switch.
- [ ] **Growth**: the FDRI score and what the platform measured.

## 5. Buyer shopping: buyer window (15 min)

- [ ] Register as buyer (phone, password, name).
- [ ] Home, categories, **search with the mic**, **farmer map** (pins rounded
      to ~1 km; tap for the farmer card).
- [ ] Product page: photo, price per unit, "harvested N days ago",
      cultivation mark, farmer card with rating, more from this farmer.
- [ ] Pincode bar: outside the farmer's list **warns but does not block**;
      outside Maharashtra is refused.
- [ ] **One farmer per cart**: adding from a second farmer is refused, naming
      the farmer who holds the cart. Nothing is cleared.
- [ ] Cart quantity steps between the minimum order and the stock.
- [ ] Delivery charge 0 reads "ask the farmer", never "free".

## 6. Order 1: UPI and delivery (20 min, side by side)

| Buyer (right) | Farmer (left) |
|---|---|
| Checkout: **delivery**, address, **UPI**, place order | |
| | Updates / Orders: new order (refresh; there is no push). **Accept**, with an optional time estimate |
| Pay section appears: QR, UPI ID copy, amount; pay ₹10–20, enter the **12-digit UTR** | |
| | "Buyer says paid" is a claim. Check the farmer's own UPI app → **Money received** |
| | **Packed** appears only now |
| Tracker moves: shipped → out for delivery → delivered | Packed → Out for delivery → Delivered |
| **Rating screen covers the app** until each product is rated | |

- [ ] Why pay after acceptance: a rejected order never leaves money stranded.
- [ ] Why the UTR is exactly 12 digits and cannot be reused on another order.

## 7. Orders 2–4: other paths (15 min)

- [ ] **Order 2: pickup + cash on delivery.** Farmer: Accept → **Ready for
      pickup** → Delivered. The buyer's tracker shows three stages.
- [ ] **Order 3: the buyer cancels** while *Placed*: consequence → reason →
      confirm. After acceptance the button is gone.
- [ ] **Order 4: the farmer cancels** after accepting: the same three steps,
      then the **refund notice** — the site moves no money, so any payment
      received must be returned by the farmer.
- [ ] Both sides show who cancelled and why.

## 8. Admin console: the rest (15 min)

- [ ] **Products**: take a listing down; the **Reported** tab.
- [ ] **Orders**, **Reviews** (hide with a reason), **Complaints** (resolve).
- [ ] **Map**: exact pins, filter by crop, village and FDRI band.
- [ ] **Demand & supply**: ordered vs listed per crop, last 30 days.
- [ ] **Impact**: farmers, orders, money earned by farmers, FDRI bands.
- [ ] Sort by, and the language switch.

## 9. Behind the scenes (optional, 5 min)

- [ ] One API (Cloud Run), two websites (Vercel), Firestore, Cloudinary
      photos, OpenStreetMap tiles.
- [ ] Every rule is checked on the server, not only on the screen.
- [ ] Privacy: the public sees only the farmer card with a rounded location;
      the farmer's phone reaches a buyer on the buyer's own order or trace
      page. Reviews show the buyer's first name only.
- [ ] Not built yet: phone notifications, chat, returns and refunds inside
      the site, the research survey entry and tables (planned).

## 10. Cleanup straight after (on the live site)

- [ ] Take down the demo listings or block the demo farmer.
- [ ] Cancel any open order; hide the demo reviews.
- [ ] Log out of all three surfaces; clear the browser profiles on a shared
      laptop.

### Time plan

| Section | Minutes |
|---|---|
| 1 Introduction | 10 |
| 2 Farmer registration | 20 |
| 3 Verification | 10 |
| 4 Listing produce | 15 |
| 5 Buyer shopping | 15 |
| 6 Order 1 | 20 |
| 7 Orders 2–4 | 15 |
| 8 Admin | 15 |
| 9 Behind the scenes | 5 |
| **Talking time** | **about 2 h** |
