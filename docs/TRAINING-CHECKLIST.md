# Training session checklist

For trainers and co-trainers running a 2–3 hour session on the app for rural
women sellers, with students and teachers helping. Checked against the code on
`prathamesh2`.

---

## ⚠️ Fix this before the session: the app's safety limits will block a training room

The server limits how many logins and sign-ups can come from one internet
connection. If everyone in the room is on the same venue Wi-Fi or one phone's
hotspot, the whole room counts as one user (`backend/src/auth/rateLimit.ts`):

| Limit | Value | What happens in the room |
|---|---|---|
| OTP requests from one connection | **20 per hour** | The 21st woman can't get a code for an hour |
| Seller sign-ups from one connection | **10 per hour** | Only 10 women can register per hour |
| OTP codes per phone number | **3 per 24 hours** | Pressing "resend" 3 times locks her out until tomorrow |
| Code checks from one connection | 50 per hour | Typos by the whole room add up |

- [ ] **Best option:** each woman uses her own mobile data, not venue Wi-Fi or a shared hotspot.
- [ ] **Or** raise these limits for the day, deploy **the night before**, and put them back afterwards. The counts are kept in memory, so a new deploy also resets them.
- [ ] **Never deploy during the session.** The server must run as a single copy, and for a few seconds during a deploy there are two.
- [ ] Tell everyone: **type the code once, and don't press "resend" again and again.** 3 codes a day is the limit.
- [ ] The code arrives by SMS on the phone that has that SIM. The SIM must be in the phone she is holding, not at home.

---

## A. The day before

**Accounts and data**
- [ ] Make sure the admin console login works. Have **two admins** available: one presents, one approves listings and payments live.
- [ ] Set up **one demo seller shop** (a trainer's number) with 3–4 approved products and a real UPI ID. All practice orders go to this shop.
- [ ] Decide on practice orders: **women must not place test orders with real sellers.** Any order placed reaches the real seller.
- [ ] Decide what happens to practice listings. Every new product goes to admin for checking. Approve the real ones; **reject** the practice ones, which gives the slot back.
- [ ] Decide on the ₹50 pack: will women actually pay on the day? If yes, the admin needs the college account's bank statement or UPI app open, because approval needs 3 ticks: UTR matches, date and time match, money received.
- [ ] Check the college UPI ID and name on the payment screen match the poster.

**Materials**
- [ ] Projector, or a phone mirrored to the screen / TV (screen-mirroring app plus cable)
- [ ] Printed **APK install steps** or a QR code for the link, and the APK file on a pendrive/Bluetooth for phones with no data
- [ ] A printed list of each woman's name, phone number and village
- [ ] Printed **one-page Marathi cards**: login, adding a product, accepting an order, confirming a payment. Mostly pictures and few words.
- [ ] Sample products to photograph: a pickle jar, papad, a bag. Take a good photo beforehand to show as an example.
- [ ] Power banks, extension boards and charging cables (Type-C and micro-USB)
- [ ] An attendance / consent sheet, with separate consent for taking photos of the women

**Practice run**
- [ ] Do the whole flow once on a cheap Android phone **inside the APK**: login → register → product → order → accept → payment → deliver → review.
- [ ] Time it. This tells you how long each part will really take in the room.

---

## B. On the day, before starting (arrive 45 minutes early)

- [ ] Check the network in the hall: 4G signal for each carrier (Jio, Airtel, Vi)
- [ ] Open the app once. The first load may be slow because the server was idle.
- [ ] Admin console open on a laptop, on the pending products and payments pages
- [ ] Seat women **in pairs or groups of 3–4** (someone who can read beside someone who can't), with one student/teacher volunteer per group
- [ ] Brief the volunteers for 10 minutes: **don't take the phone and do it for her; point with your finger and let her press.** Never ask to see her OTP.
- [ ] Check phones: Android, enough free storage, APK installed or ready to install

---

## C. Session plan (about 2 hours 45 minutes)

| Time | Part | Content |
|---|---|---|
| 0:00–0:15 | **Introduction** | Why the market is named after शांताबाई काकी, who can sell, what is sold. Photos of real sellers. |
| 0:15–0:30 | **Installing the app** | Install the APK and allow "unknown apps". Introduce the language (Marathi by default). |
| 0:30–0:55 | **Login + seller registration** | In small groups (because of the limits above) |
| 0:55–1:05 | Tea break | Pending registrations get finished |
| 1:05–1:40 | **Adding a product** | Photo, name, price, stock, "send for checking" |
| 1:40–2:15 | **Orders and money** | Trainers place live orders; each woman accepts, packs and delivers |
| 2:15–2:30 | **The buyer's side** | Students/teachers as buyers |
| 2:30–2:45 | **Safety, questions, closing** | Printed cards, help number |

---

## D. What to cover in each part

### 1. Introduction
- [ ] "What will the app do for you?" A shop on your phone that buyers from other villages can see.
- [ ] **Costs:** registration is free. **₹50 = 5 products for 6 months.** No commission on sales.
- [ ] **Money comes straight from the buyer to your UPI.** The app does not hold your money.
- [ ] No English is needed. The whole app is in Marathi, and you can **speak into the mic** to type.

### 2. Login
- [ ] Enter your 10-digit mobile number → a 6-digit code comes by SMS → type it in.
- [ ] **Never tell this code to anyone**, even someone who calls saying "I'm from Shantai Bazar".
- [ ] You don't need to log in every time. If you don't open the app for 15 days, you'll be asked again.
- [ ] "Back" or refresh doesn't log you out. Only the **Log out** button does.

### 3. Seller registration (6 screens)
1. [ ] **About you**: name
2. [ ] **Village and address**: pick the village from the list; pincode
3. [ ] **Your business**: shop name, type of business, **do you sell food?** Explain carefully: **this answer is hard to change later**, and it decides which product categories she sees.
4. [ ] **Digital use**: tell them there's no right or wrong answer. It is for measuring before and after.
5. [ ] **Where your money arrives**: UPI ID. ⚠️ **The most important screen.**
   - Have her open PhonePe or GPay and **read the UPI ID from there**. Don't type it from memory.
   - A wrong UPI ID means buyers' money goes to a stranger.
   - If the app says "Did you mean @ybl?", read it and correct it.
6. [ ] **Check**: read every answer. "बदला" (Change) takes you back to that screen.
- [ ] Explain the **SMB ID** (e.g. SMB-ANADUR-01), including what the village and number mean.
- [ ] Show that the first time a screen opens it explains itself (the walkthrough), and that **Help & Training** replays it any time.

### 4. The ₹50 pack
- [ ] Why it's needed: without a pack, nothing can go live.
- [ ] **A phone can't scan its own screen.** Two ways:
  - **"Save QR to phone"** → PhonePe/GPay → scan QR → **pick from gallery**
  - Or **copy the UPI ID** → paste it in PhonePe
- [ ] After paying, three things are needed:
  - [ ] a **screenshot** of the success screen
  - [ ] the date and time you paid
  - [ ] the **12-digit UTR** (show where it is in PhonePe/GPay: "UTR" or "UPI Ref No.")
- [ ] The admin checks by hand, so **it won't turn on instantly**. Show the waiting screen.
- [ ] **Six months later:** a reminder comes a week ahead. If the date passes, the shop is paused. Pay ₹50 and **everything comes back exactly as before**, products included.

### 5. Adding a product
- [ ] **Photo:** only one photo, from the gallery. Show a good photo and a bad one: light, plain background, whole product visible, not blurry. Take it with the phone camera first, then choose it in the app.
- [ ] Name, category. If the product isn't in the list, choose **"Other"**. Don't put it in the wrong category.
- [ ] For food: ingredients and **veg/non-veg**. Anything else: material.
- [ ] **Price, MRP, stock.** Made to order? Explain what that means.
- [ ] The button says **"send for checking"**, not "publish". The product appears to buyers only **after admin checks it**. Show one approval live in the room.
- [ ] If it's rejected, the reason is shown in the app and the slot is freed. Fix it and send it again.
- [ ] ⚠️ **Rules:**
  - [ ] **You can't delete a product that has been sent.** If you want it removed, ask the admin.
  - [ ] **Name, photo, category and so on can be changed only 2 times.**
  - [ ] **Price and stock can be changed any number of times.** Keep them up to date.
  - [ ] A draft costs no slot and can be deleted.
- [ ] Use the **mic** for the product description.

### 6. Orders, the most important part (do it live)
Trainers place orders from the buyer's side into the women's shops (or the demo shop):
- [ ] **A new order arrives** → the bell / updates list. The app only knows **while it's open**; there is no pop-up notification. Tell them to **open the app twice a day**.
- [ ] Look at the order: product, quantity, buyer's village. If it says **"outside your area"**, decide whether you can get there.
- [ ] **Accept or Reject.** Rejecting needs a reason from the list.
- [ ] **UPI order:** after you accept, the buyer pays → you **check your own PhonePe/GPay to see if the money arrived** → only then press "Money received".
  - [ ] ⚠️ **A UTR typed by the buyer is not money.** Always check your own UPI app.
  - [ ] Until you confirm the money, the "Packed" button doesn't appear. That is on purpose.
- [ ] Packed → Out for delivery → Delivered
- [ ] **Delivery charge:** the app doesn't ask for it, so the buyer sees "ask the seller". **Call the buyer and tell them the charge.** The buyer's phone number is on the order.
- [ ] **Cancelling:** the seller can cancel between Accepted and Out for delivery. The button is at the bottom. **If money came in, you have to send it back yourself.** The app doesn't return money.
- [ ] A buyer can cancel only before you accept. After that they'll call you.

### 7. The buyer's side (students/teachers)
- [ ] Customer registration: phone, OTP, name
- [ ] Browse by category, the product page, "More from this shop"
- [ ] **A cart holds one shop's goods at a time.** Adding from another shop is refused; finish or empty the cart first.
- [ ] Order → wait for the seller to accept → **then pay** (QR/UPI ID, then the 12-digit UTR)
- [ ] The order screen shows 4 stages: confirmed → shipped → out for delivery → delivered
- [ ] **Rating is required after delivery.** Until they rate, the app won't let them do anything else or place a new order. Tell them in advance so it doesn't come as a surprise.
- [ ] Only the buyer's first name is shown publicly.

### 8. Reviews and the business screen
- [ ] The seller's rating is the average of her products' ratings
- [ ] Where to see reviews, "My business", "My buyers"
- [ ] Good packing, on-time delivery and honest photos lead to good ratings

### 9. Safety and fraud (don't skip this)
- [ ] Never tell the OTP to anyone
- [ ] A fake "payment done" screenshot or SMS is not money. **Only trust your own UPI app.**
- [ ] Don't tell anyone your UPI PIN, and there is no PIN for *receiving* money. "Enter your PIN to receive" is a scam.
- [ ] Don't put your phone number in a product description
- [ ] On a shared phone, **log out** after use

---

## E. Suiting the audience

- [ ] **Speak Marathi.** Use the app's own words: ऑर्डर, भरणा, स्वीकारा. Avoid English terms (not "submit" or "dashboard").
- [ ] **Show one step → they do it → check → next step.** Go at the pace of the slowest woman.
- [ ] Point at the icons and colours: green tick = done, red = cancelled. Every status has a word written with it.
- [ ] Don't take the phone away from her. **Her finger should do the pressing.**
- [ ] Don't praise or criticise anyone's reading in front of the group.
- [ ] Give an example of a local product and a real price ("mango pickle, 500g, ₹150").
- [ ] Take photos only with consent, and don't photograph women who refuse.
- [ ] Choose a time that works around household work. Keep a break and water.
- [ ] Take questions again after every part: "Did anyone get stuck here?"

---

## F. Closing (last 15 minutes)

- [ ] Hand out the printed cards, the help number and the name of the local coordinator
- [ ] Tell the next steps: pay ₹50 → add products → wait for approval
- [ ] Keep a list of anyone who didn't finish registering (OTP limit, network) and **follow up the next day**
- [ ] Two-minute verbal feedback: what was easy, what was hard

## G. After the session

- [ ] Admin: approve or reject all pending products and payments **the same day**. A long wait is discouraging.
- [ ] Cancel practice orders and reject practice products
- [ ] If you raised the limits, put them back and deploy
- [ ] Write down what caused trouble (which screen, which word) so the app can be fixed
- [ ] Call each woman after a week and ask whether her first order has come

---

**Take along:** a list of what the app doesn't do yet, so you can answer
honestly when asked. There are no notifications on the phone, no chat, no
returns or refunds inside the app, and no direct camera photo (the photo must
come from the gallery).
