# Push notifications — design

Date: 2026-09-21 · Status: approved in conversation, awaiting written review

## Goal

A seller or buyer using the Android APK gets a phone notification — in the
notification tray, with sound, **even when the app is closed** — when something
happens to her order or her shop. Tapping it opens the app on that order.

Today the app has only the in-app updates list and the bell count
(`frontend/src/lib/notifications.ts`), which she sees only when she opens the
app. CLAUDE.md lists push notifications under *Not built yet*.

## Decisions already made

| Question | Decision |
|---|---|
| Delivery service | **Firebase Cloud Messaging (FCM), sent directly by our API** through `firebase-admin`, already a dependency. Free with no message limit on the Spark plan. Rejected: Expo's push service (needs an Expo account and project, and a Firebase private key uploaded to Expo, with nothing gained without an iPhone app); browser Web Push (Android System WebView cannot show it). |
| Events | All four groups below. |
| Wrapper source | The **other machine's** `appgold-main`. It carries fixes this machine's copy lacks (for example the Marathi no-network screen). It is brought here and put under git before anything changes. |
| Firebase console | The user has access and will add the Android app. |
| Language | The language she chose in the app (`wb.lang`, Marathi by default), not the phone's. |

## What she experiences

- **Permission** is asked once, by Android, the first time a seller or buyer
  is **signed in** inside the APK — never on the landing page, where she does
  not yet know what the app is. If she refuses, nothing else changes.
- **What arrives:**

  | To | When | Title (mr) | Title (en) | Body |
  |---|---|---|---|---|
  | Seller | Buyer places an order | नवीन ऑर्डर आले आहे | You have a new order | items · ₹total · buyer's name |
  | Seller | Buyer cancels | ग्राहकाने ऑर्डर रद्द केले | The customer cancelled the order | items · order id |
  | Seller | Buyer enters a UTR ("I paid") | ग्राहकाने ₹{total} भरल्याचे कळवले आहे | The customer says they paid ₹{total} | mr: पैसे खात्यात आले आहेत का, ते UPI ॲपमध्ये पहा. · en: Check your UPI app to see whether it arrived. + order id |
  | Seller | Any admin decision (`AdminNoticeKind`) | the existing `notif.adm.*` sentence | the existing `notif.adm.*` sentence | the notice's `note` (reason / product), if any |
  | Buyer | Seller accepts, packs, sends out, delivers, rejects, or cancels | the existing `notif.cus.*` sentence | the existing `notif.cus.*` sentence | items · ₹total |

  The titles are **the same sentences the in-app updates list already
  prints** (`notif.sel.*`, `notif.cus.*`, `notif.adm.*` in
  `frontend/src/i18n/strings.ts`). The one new line, "buyer says I paid", is
  built from existing app text (`cancel.sel.q3Paid`, `refund.claimedBody`) and
  must pass `frontend/tests/marathi.test.ts`. Product and buyer names are
  printed as she typed them.
- **Tap** opens the app on the page the row would open in the updates list:
  a seller's order → `/seller/orders/:id`, a buyer's order →
  `/shop/orders/:id`, an admin decision → that kind's page (`ADMIN_ROW` in
  `lib/notifications.ts`: `/seller/products`, `/seller/subscription` or
  `/seller`). This works from a closed app too.
- **Shared phones:** a notification belongs to the person signed in on that
  phone now. Logging out, being signed out by a 401, or a session expiring
  stops them at once. The same woman signed in on two phones gets them on both.
- **Failure is silent:** a notification that cannot be sent never fails the
  order, the payment or the admin action. The update still waits in the bell
  list.

## Architecture

```
APK wrapper (Expo)            Web app (Vercel)                 API (Cloud Run)
───────────────────           ─────────────────                ────────────────
                      ◄─────  "push:enable" (signed in)
permission + FCM token
token  ──────────────────────►  pushBridge.ts  ──── POST /api/push/token ────►  session.pushToken
                                                                               session.pushLang
                                                     order / admin event ──►  push/: targets → FCM
tap on notification ◄─────────────────────────────────── FCM ◄─────────────────
open base URL + data.path
```

### 1. APK wrapper (`appgold-main`, outside this repo)

- **Before any change:** copy in the other machine's folder, `git init`, and
  commit it as-is. The native `android/` folder has to be regenerated
  (`npx expo prebuild --platform android`), and without a commit that step can
  overwrite hand-made native fixes with no way back. (This also closes the
  2026-09-17 deferred item "put the wrapper under git".)
- `npx expo install expo-notifications`. In `app.json`: add the
  `expo-notifications` plugin (a small white notification icon drawn from the
  portrait mark, accent `#7b1e2e`) and `android.googleServicesFile:
  "./google-services.json"`. The plugin adds `POST_NOTIFICATIONS`.
- `app/index.tsx`:
  - create an Android channel `orders` (high importance, default sound);
  - `onMessage` from the page with `{ type: 'push:enable' }` → request
    permission → `getDevicePushTokenAsync()` → hand the token to the page with
    `injectJavaScript("window.__smbPushToken && window.__smbPushToken('<token>')")`;
    do the same again from `addPushTokenListener` when FCM rotates it;
  - `setNotificationHandler`: show the banner while the app is open too;
  - on a tap (`addNotificationResponseReceivedListener`), load
    `BASE_URL + data.path` in the WebView; on a cold start from a tap
    (`getLastNotificationResponseAsync`), use it as the initial `source.uri`.
    A `path` is accepted only if it starts with `/` and not `//` or `/\`, so a
    notification can never point the WebView at another site.
- Build with `expo run:android` as today. Every phone reinstalls once; an old
  APK keeps working, just without notifications.

### 2. Web app (`frontend/`)

- New `src/lib/pushBridge.ts`, exporting a `usePushBridge()` hook that
  `App.tsx` calls once, inside `AuthProvider` and `I18nProvider`:
  - acts only inside the APK (`window.ReactNativeWebView` present) and only
    while the session role is `seller` or `customer`;
  - posts `{ type: 'push:enable' }` to the wrapper on sign-in and on app open
    with a live session;
  - defines `window.__smbPushToken = (token) => api.registerPush(token, lang)`,
    and registers again when `lang` changes;
  - does nothing on logout: the server drops the token with the session.
- `src/lib/api.ts`: `registerPush(token, lang)` → `POST /api/push/token`
  (it stays the only seam to the server).
- In a normal browser, nothing happens.

### 3. Backend (`backend/`, `shared/`)

- **Storage:** `SessionRecord` (`backend/src/auth/types.ts`) gains optional
  `pushToken?: string` and `pushLang?: 'mr' | 'en'`. No new collection, so
  `COLLECTIONS`, the boot-time read count and the Spark read budget are
  unchanged. A registration is one session write, made only when the token or
  language changed.
- **Route** `POST /api/push/token` (`requireRole('seller', 'customer')`), in a
  new `routes/push.routes.ts` mounted at `/api/push`:
  - body `{ token, lang }`; the token must be a string of 20–4096 characters
    with no whitespace, and `lang` is `mr` or `en` (default `mr`), else 400
    `{ error, messageMr }`;
  - sets both on **the caller's session**, and **removes the same token from
    every other session**. One phone belongs to one signed-in person, which is
    the shared-phone rule;
  - rate-limited with `auth/rateLimit.ts`, keyed by session and by IP: 10
    registrations an hour. A phone registers a handful of times a day at most.
- **`backend/src/push/`:**
  - `targets.ts`: `sellerTargets(db, sellerId)` / `customerTargets(db,
    customerId)` → live sessions (`findLiveSession`) of the right role with a
    `pushToken`, one entry per distinct token;
  - `send.ts`: `sendPush(targets, message)` via `getMessaging().sendEach()`,
    as an Android notification message on channel `orders` with `data.path`.
    Tokens FCM reports as `messaging/registration-token-not-registered` or
    `invalid-registration-token` are cleared from their sessions and
    `save()` is called. Every error is logged, never thrown. With no Firebase
    configured it is a no-op, and `describeConfig()` prints `Push  off`;
  - `notify.ts`: `notifyOrderEvent(db, order, event)`,
    `notifyPaymentClaimed(db, order)` and `notifyAdminNotice(db, seller,
    notice)` pick the recipient from who caused the event, build the text in
    each target's `pushLang`, and call `sendPush` **without awaiting it**, after
    the change has been saved (Cloud Run keeps CPU allocated, see
    *Deployment shape*).
- **Text:** new `shared/src/pushText.ts` builds `{ title, body, path }` per
  event and language. The body's item summary ("आंब्याचे लोणचे +1") uses the
  same rule as `itemSummary()` in `lib/notifications.ts`, which moves into
  `shared/` so both sides call one function. Every line has a Marathi and an English version, written
  independently as CLAUDE.md requires.
- **Triggers:**

  | Event | Where | Notifies |
  |---|---|---|
  | Order created (`PLACED`) | `routes/orders.routes.ts`, `POST /` | seller |
  | `ACCEPTED`, `PACKED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `REJECTED` | `POST /:id/advance` | buyer |
  | `CANCELLED` | `db/orderCancel.ts` | the side that did not cancel |
  | UTR submitted | `POST /:id/pay` | seller |
  | Any `AdminNoticeKind` | `db/notices.ts` `appendNotice()` | seller |

  `COMPLETED` and the subscription reminder week are **not** pushed.
  `COMPLETED` has no line in the updates list either, and the reminder is
  derived by the API when someone asks rather than written at a moment, so no
  code runs when the week begins.

## Error handling

- Sending never throws into a route. Failures are logged with the order id or
  notice kind, and the route's response is unchanged.
- Tokens FCM reports as unregistered (the app was uninstalled, or its data
  cleared) are removed on the first such failure. Any other failure is logged
  with its FCM error code and the token is left alone.
- A token registered by a revoked or expired session is ignored at send time
  (`findLiveSession`). `pruneSessions` clears the row later, as today.
- Offline phone: FCM holds the message and delivers it when the phone
  reconnects, which is FCM's default behaviour.

## Testing

Automated (`node:test`, the repo's existing style; FCM replaced by a fake
sender that records calls):

- `backend/tests/push-token.test.ts`: the token is saved on the caller's
  session; the same token is removed from other sessions; junk tokens and bad
  `lang` get 400; admin sessions are refused.
- `backend/tests/push-targets.test.ts`: only live sessions of the right
  seller or buyer; revoked and expired sessions are skipped; tokens are
  deduplicated.
- `backend/tests/push-triggers.test.ts`: each trigger in the table sends one
  message, to the right side, in that session's language, with the right
  `path`; no send for `COMPLETED`; a send failure does not change the route's
  response.
- `backend/tests/push-send.test.ts`: dead-token cleanup; no-op without
  Firebase.
- `frontend/tests/pushText.test.ts`: every title equals the matching
  `notif.*` dictionary line in both languages (the wording cannot drift),
  except the new "buyer says I paid" line, which has no dictionary twin and
  is held by the Marathi style rules instead;
  English has no Devanagari; paths match `ADMIN_ROW` and the order routes.
- `frontend/tests/pushBridge.test.ts`: no action outside the APK or without a
  seller/customer session; registers with the current `lang`, and again on a
  change.
- The CLAUDE.md test counts are updated.

Manual (a new suite in `docs/MANUAL-TEST-PLAN.md`, on a real phone with the
new APK):

1. The permission prompt appears after login, not on the landing page.
2. A seller gets "नवीन ऑर्डर आले आहे" with the app in the foreground, in the
   background, and fully closed (swiped away).
3. A tap opens that order, from a closed app and from a running one.
4. The buyer gets each step; English after switching the language.
5. After logout nothing more arrives; when a second person logs in on the same
   phone, only their notifications arrive.
6. Tried on at least one Xiaomi, Oppo, Vivo or Realme phone (see *Limits*).

## Rollout

1. Deploy the backend and the web app when nobody is ordering (the
   `--max-instances=1` deploy caveat). It is harmless alone: no session has a
   token yet, so nothing is sent.
2. Firebase console: add the Android app `com.siddharam_sutar.mywebviewapp`
   to the project whose Firestore the API uses, and download
   `google-services.json`. Check that the Firebase Cloud Messaging API (V1) is
   enabled in that Google Cloud project.
3. Wrapper: bring in the other machine's copy, commit it, make the changes,
   build, and test on the user's own phone.
4. Share the new APK (on WhatsApp as a *document*, so it is not recompressed).
   Old APKs keep working without notifications.

Rollback: stop sharing the new APK. The backend sends nothing to sessions
without tokens.

## Docs to update in the same change

- CLAUDE.md: a short **Push notifications** section (token on the session,
  one phone for one person, triggers, text from `pushText.ts`, no-op without
  Firebase); remove "push notifications" from *Not built yet*; note the
  wrapper's new dependency under *Deployment shape*.
- `docs/DEPLOY.md` §6: `google-services.json`, prebuild, channel, and the
  battery-settings note.
- A Marathi help line in the app's help section about allowing notifications
  and setting battery use to "No restrictions".

## Limits

- **Xiaomi, Oppo, Vivo and Realme** phones often delay or block notifications
  from closed apps. Each user may need to allow **Autostart** and set battery
  use to **No restrictions**. The help line above says so.
- Android only: no iPhone app exists.
- Buyers in a plain browser get no phone notifications, only the bell list.
- No subscription-reminder push (see *Triggers*).

## Out of scope

Admin-console notifications · notification history on the server · per-event
opt-out settings · scheduled reminders · iPhone.
