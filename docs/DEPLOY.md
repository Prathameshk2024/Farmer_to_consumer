# Deployment — Cloud Run + two Vercel projects

The shape:

```
       Cloud Run                        Vercel project 1
   ┌──────────────────┐            ┌──────────────────────┐
   │  Express API     │ ◄───────── │  seller + buyer app  │   frontend/
   │  + Firestore     │            └──────────────────────┘
   │  + Cloudinary    │            Vercel project 2
   │                  │ ◄───────── ┌──────────────────────┐
   └──────────────────┘            │  admin site          │   admin/
                                   └──────────────────────┘
```

One backend, two front ends, three deployments — all from this one repository.
Each Vercel project points at a different **Root Directory**, so they build and
deploy independently while still sharing `shared/src/types.ts`.

---

## 1. Cloud Run — the API

The live service:

| | |
|---|---|
| Service | `shantai-api` |
| Region | `asia-south1` (Mumbai) |
| URL | `https://shantai-api-204453348000.asia-south1.run.app` |

### How the container is built

The image is the **`Dockerfile` at the repository root**, and the build
context must be the root too: the backend compiles `../shared/src` along with
its own code, so a build started inside `backend/` cannot see half of what it
needs.

It is two stages, both `node:22-slim`:

1. **Build.** Every workspace's `package.json` and the root lockfile are
   copied first, because `npm ci` refuses a lockfile whose workspaces are
   missing — so `frontend/` and `admin/` manifests go in even though none of
   their source does. Then `shared/src`, `backend/src`, `backend/scripts` and
   `backend/tsconfig.json`, and `npm --workspace=@f2c/backend run build`.
2. **Run.** `npm ci --omit=dev` and the compiled `backend/dist` only — no
   TypeScript, no source, no `.env`. `NODE_ENV=production` is set in the
   image; everything else arrives from Cloud Run (below). It starts with
   `node backend/dist/backend/src/index.js`.

**The build is two commands, and the second one is not optional.**
`npm run build` in `backend/` is `tsc` followed by
`scripts/fix-shared-imports.js`. `tsc` type-checks `@shared/*` through
`tsconfig.json`'s `paths` but writes the specifier into its output unchanged,
and there is no package called `@shared` at runtime — so without the rewrite
the container builds cleanly and then dies on its first import with
`ERR_MODULE_NOT_FOUND: Cannot find package '@shared/…'`. The script turns each
one into a relative path to the compiled copy in `dist/shared/src`, and fails
the build if one points at nothing.
`EXPOSE 4000` is documentation only. Cloud Run sets `PORT` (8080) and
`config.ts` listens on whatever it says.

To deploy from a clone, at the repository root:

```bash
gcloud run deploy shantai-api --source . --region asia-south1 --project <PROJECT_ID>
```

`--source` uploads the folder to Cloud Build, which finds the Dockerfile and
builds it. The upload honours `.gcloudignore`, and gcloud generates one from
`.gitignore` when there is none — so `node_modules`, `dist` and every `.env`
stay behind. A redeploy of an existing service keeps its settings (maximum
instances, CPU, variables, secrets) unless a flag changes them. **Every deploy
is a new revision**, and for a few seconds two instances run — see *Exactly
one instance* below before choosing when.

**Not on a day Firestore's Spark limits are spent** (`docs/CAPACITY.md` §4).
Every start reads the whole database: with the reads gone, the new revision
refuses to start (`Refusing to start on an empty database` in its log) and the
deploy fails, leaving the old revision serving. With the writes gone, the old
revision is holding unsaved changes in memory that a deploy would throw away —
its log says `in memory only - retrying every 60s`. Either way, deploy after
the reset, around 12:30 IST.

Not yet compared with the live service: which image the current revision runs
and the names of the secrets it mounts. `gcloud run services describe` (next
section) shows both; record them here once checked.

To try the image locally, where Docker is installed:

```bash
docker build -t shantai-api .
docker run -p 4000:4000 --env-file backend/.env shantai-api
```

**Never with a `.env` holding the production Firebase key.** That container is
a second process writing the live database, which is exactly what *Exactly
one instance* forbids. And since the image sets `NODE_ENV=production`, it also
needs `SESSION_SECRET` and MSG91 set, or it refuses to boot.

Without Docker, `npm run build` then `npm run start` in `backend/` runs the
same compiled output.

### Old images — keep the newest five

Every `--source` deploy stores a new image in the Artifact Registry repository
`cloud-run-source-deploy`, and nothing deletes the old ones: about 40 MB more
storage per deploy, for ever (`docs/CAPACITY.md` §8 has the arithmetic).
`artifact-cleanup.json` at the repository root is the policy: delete every
image except the five newest. Set it once, from the root:

```bash
# 1. Dry run - nothing is deleted; Artifact Registry only logs what it would.
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \
  --project=<PROJECT_ID> --location=asia-south1 \
  --policy=artifact-cleanup.json --dry-run

# 2. Once that looks right, turn it on.
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \
  --project=<PROJECT_ID> --location=asia-south1 \
  --policy=artifact-cleanup.json --no-dry-run

# Check what is set:
gcloud artifacts repositories describe cloud-run-source-deploy \
  --project=<PROJECT_ID> --location=asia-south1
```

Things to know:

- **Keep beats delete.** The first rule matches every image; the second
  protects the five newest, and a Keep rule always wins.
- **It is not instant.** Cleanup runs in the background, roughly once a day.
- **Rolling back reaches five deploys, no further.** A Cloud Run revision whose
  image is gone cannot be rolled back to. If a bad deploy is found late, the fix
  is a new deploy of the old commit, not a rollback.
- Editing `artifact-cleanup.json` changes nothing by itself — run step 2 again.

### Two settings that are not Cloud Run's defaults

| Setting | Value | Default | Why |
|---|---|---|---|
| Maximum instances | **1** | 100 | See the warning below. |
| CPU allocation | **Always allocated** | Only during requests | `save()` writes 400 ms *after* the response is sent. With the default, Cloud Run takes the CPU away the moment the response goes, and the write waits for the next request or for shutdown. |

Neither is visible from outside the service, so check them rather than assume:

```bash
gcloud run services describe shantai-api --region asia-south1 --project <PROJECT_ID>
```

Look for `autoscaling.knative.dev/maxScale: '1'` and
`run.googleapis.com/cpu-throttling: 'false'`. To set both:

```bash
gcloud run services update shantai-api --region asia-south1 --project <PROJECT_ID> \
  --max-instances 1 --no-cpu-throttling
```

`<PROJECT_ID>` is the project's name, not the number in the URL — gcloud
refuses the number.

### ⚠ Exactly one instance. Not two.

`backend/src/db/firestore.ts` loads the whole database into memory at boot and
writes changes back. That is deliberate and documented there, and it is correct
for **one** process only. Two instances each hold their own snapshot and
overwrite each other's writes — orders vanish, sellers reappear after deletion,
and nothing in the logs says why.

So: **maximum instances stays at 1.** If you outgrow one instance, the fix is
to convert the route handlers to async per-document Firestore reads first. It
is a real piece of work, not a config change.

**A deploy is the one moment the ceiling does not hold.** Maximum instances is
counted per revision, and a new revision starts and takes traffic before the
old one has finished draining — for a few seconds there are two processes.
Every deploy, and every environment-variable change (which is a deploy), does
this. Do it when nobody is placing orders, not in the evening.

### Environment variables

Set these on the service (Console → *Edit & deploy new revision* → *Variables
& Secrets*). Cloud Run sets `PORT` itself and `config.ts` reads it — do not set
it. The four marked secret are held in **Secret Manager** and exposed to the
service as environment variables, not typed in as plain values — a plain
variable is readable by anyone with viewer access to the project.

Two things follow from that. The service's runtime service account needs
`roles/secretmanager.secretAccessor` on each secret, or the revision fails to
start. And a secret is read when an instance starts, so adding a new version
changes nothing until the next revision is deployed.

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | **Secret. Required.** The server refuses to boot without it. Generate a fresh one, do not reuse your local value. Changing it later signs every user out. |
| `FIREBASE_SERVICE_ACCOUNT` | **Secret.** The whole service-account JSON on one line. |
| `CLOUDINARY_URL` | **Secret.** `cloudinary://key:secret@cloud` from the Cloudinary dashboard. |
| `CLOUDINARY_FOLDER` | `shanta-mahila-bazar` |
| `CORS_ORIGIN` | Both Vercel URLs, comma-separated. See §3. |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD_HASH` | First sign-in only, while no administrator exists. Make the hash locally with `npm run admin:users -- hash` — Cloud Run has no shell to run it in. Remove both once a real account exists. There is no `ADMIN_PASSWORD`. |
| `MSG91_AUTH_KEY` | **Secret.** The account Auth Key, and the only thing that can check a widget token. Never copy it into a `VITE_*` variable. |
| `MSG91_WIDGET_ID` | The OTP widget's id. With `MSG91_AUTH_KEY` this selects the widget, which needs no DLT registration. |
| `MSG91_TEMPLATE_ID` / `MSG91_SENDER` | Only for your own DLT-approved template. Leave unset while using the widget. |
| `SEED_DEMO_DATA` | Leave unset. Setting it would put invented sellers in front of real customers. |
| `ALLOW_BULK_DELETE` | Leave unset. It is for one command run by hand, never for the service. |

Generate the session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Cold starts

With minimum instances at 0, Cloud Run stops an idle instance, and the next
request waits while a new one boots — and boot here means loading the **whole
database** from Firestore before the first request is answered. For a seller on
a rural connection that wait reads as a broken app. `--min-instances 1` keeps
one warm and is billed for it.

Stopping itself is safe: Cloud Run sends `SIGTERM` ten seconds before it kills
an instance, and `backend/src/index.ts` flushes pending writes on it, so the
400 ms write-coalescing window is not lost.

---

## 2. Vercel — two projects, one repo

Create **two** Vercel projects from the same repository. The only difference is
the Root Directory.

| | Project 1 | Project 2 |
|---|---|---|
| Root Directory | `frontend` | `admin` |
| Framework preset | Vite | Vite |
| Environment variables | `VITE_API_URL=https://shantai-api-204453348000.asia-south1.run.app`<br>`VITE_MSG91_WIDGET_ID=...`<br>`VITE_MSG91_TOKEN_AUTH=...` | `VITE_API_URL` only |

Vercel detects the npm workspaces and installs from the repo root, so `shared/`
resolves normally. Your local `.env` files are gitignored, so Vercel sees none
of them — every value above is typed into the dashboard.

Two Root Directory settings matter here, and both are in *Settings → Build and
Deployment → Root Directory*:

- **Include source files outside of the Root Directory** must stay **on** (it
  is, by default). Both apps read `../shared/src` straight off disk; with it off
  the build fails because `tsc` cannot find it.
- **Skip deployment** can stay on, because `frontend/package.json` and
  `admin/package.json` both declare `"@f2c/shared": "*"`. That line is how
  Vercel knows a commit to `shared/` alone affects them. Remove it and such a
  commit deploys neither app.

**Production is the branch Vercel is told it is**, and in this repository no
default picks the right one. On import Vercel chooses `main` if it exists,
and here `main` holds only the initial commit; GitHub's default branch is
`prathamesh`, an older copy of the app from 8 September with no `admin/`
folder, and a root `package-lock.json` written on Windows that is missing
rollup's Linux binary. The first deployment built that branch and failed with
`Cannot find module @rollup/rollup-linux-x64-gnu`. The app is `prathamesh2`.

Set it in both projects: *Settings → Environments → Production → Branch
Tracking*, then *Deployments → Create Deployment* with the branch name. Do not
merge `prathamesh` into it — the two branches share nothing after the initial
commit, and its commits are an older version of the same files.

Pushing any other branch makes a preview deployment, on its own URL, which §3
will then block.

### Both projects need their `vercel.json` — it is already in the repo

`frontend/vercel.json` and `admin/vercel.json` each hold one rewrite:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Both apps route in the browser. Vercel knows nothing about `/seller/orders` or
`/payments`, so without this, **reloading any page other than the home page
returns 404** — the first thing anyone does after being sent a link. Static
files are matched before rewrites, so `/assets/…` still serves the real bundle.

The rewrite only works with absolute asset paths, which is Vite's default and
why neither app sets `base`. A relative base is resolved against the current
directory: reloading `/seller/orders` asks for `/seller/assets/index-xxx.js`,
the rewrite answers with `index.html`, and a script tag receiving HTML is a
blank screen. Nothing to configure in Vercel; the default `npm run build` is
right.

Every `VITE_*` value is read at **build** time, not run time — changing one
means redeploying, not just restarting. The admin console has no login OTP, so
the MSG91 pair belongs to project 1 alone.

The two MSG91 values here are public by design; the browser cannot run the
widget without them. **`MSG91_AUTH_KEY` is not one of them** — it lives on
Cloud Run only. Anything named `VITE_*` is inlined into the JS bundle that
ships to every phone, so putting the auth key here would publish it.

MSG91's widget settings restrict which domains may use it. Add the Vercel URL
there, or the widget loads and then refuses to send.

In development neither app needs it: `vite.config.ts` proxies `/api` to
`localhost:4000`.

---

## 3. CORS — the part that is easy to get wrong

`CORS_ORIGIN` is **comma-separated**, because two different origins call this
API:

```
CORS_ORIGIN=https://shanta-bazar.vercel.app,https://shanta-admin.vercel.app
```

Rules worth knowing:

- **No trailing slashes.** An `Origin` header never carries a path. They are
  stripped for you, but do not rely on it elsewhere.
- **Leaving it blank means any origin.** Fine locally, too open in production —
  the boot banner prints a warning when `NODE_ENV=production` and it is unset.
- **Vercel preview deployments get their own URLs** (`...-git-branch-....vercel.app`)
  and will be blocked. Either add the ones you use, or test previews against a
  separate API.
- **gcloud splits `--update-env-vars` on commas too**, so the obvious command
  sets `CORS_ORIGIN` to the first URL and treats the second as a malformed
  variable. Change the delimiter with gcloud's `^;^` prefix:

  ```bash
  gcloud run services update shantai-api --region asia-south1 --project <PROJECT_ID> \
    --update-env-vars "^;^CORS_ORIGIN=https://shanta-bazar.vercel.app,https://shanta-admin.vercel.app"
  ```

Confirm it on boot — the banner prints what is active, in the service's
*Logs* tab:

```
  Database       Firestore (shantaimahilabajar)
  Images         Cloudinary (wvd4cteq)
  OTP            MSG91 widget (356a4b...)
  CORS           https://shanta-bazar.vercel.app, https://shanta-admin.vercel.app
```

`OTP  demo (code shown on screen)` on a production host means the widget did
not configure and the API should not have booted — check both `MSG91_AUTH_KEY`
and `MSG91_WIDGET_ID` are set, since either alone falls back.

---

## 4. Order of operations

CORS needs the Vercel URLs, and Vercel needs the API URL, so it takes two
passes:

1. Deploy the API to Cloud Run with maximum instances 1 and CPU always
   allocated. Set everything except `CORS_ORIGIN`.
2. Deploy both Vercel projects with `VITE_API_URL` pointing at Cloud Run, and
   the `VITE_MSG91_*` pair on project 1.
3. Set `CORS_ORIGIN` on Cloud Run to the two Vercel URLs (the `^;^` command in
   §3). That makes a new revision — the same quiet-moment rule applies.
4. Add the project-1 Vercel URL to the MSG91 widget's allowed domains.
5. Deploy the Firestore rules: `firebase deploy --only firestore:rules`.
6. Check the boot banner shows Firestore, Cloudinary, the MSG91 widget and both
   origins.
7. Log in once on a real phone. The widget path is the one thing here that
   cannot be verified from the banner alone.

---

## 5. Before real users

- [ ] `SESSION_SECRET` set to a fresh random value — changing it later signs every user out
- [ ] `SESSION_SECRET`, `FIREBASE_SERVICE_ACCOUNT`, `CLOUDINARY_URL` and `MSG91_AUTH_KEY` come from Secret Manager, not plain variables
- [ ] MSG91 configured — **the API refuses to boot in production without it**, because demo mode returns the login code in the HTTP response
- [ ] `VITE_MSG91_WIDGET_ID` + `VITE_MSG91_TOKEN_AUTH` set on the Vercel frontend project, and the Vercel URL added to the widget's allowed domains
- [ ] `MSG91_AUTH_KEY` appears **only** on Cloud Run, never in a `VITE_*` variable
- [ ] The auth key committed in `.env.example` at `a0775b7` has been rotated — deleting the line did not revoke it
- [ ] `ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD_HASH` set for the first sign-in (`npm run admin:users -- hash`), then removed once a real administrator exists
- [ ] `CORS_ORIGIN` set to both origins
- [ ] Cloud Run maximum instances is 1
- [ ] Cloud Run CPU is always allocated (`cpu-throttling: 'false'`)
- [ ] `firestore.rules` deployed
- [ ] `SEED_DEMO_DATA` unset
- [ ] `robots.txt` with `Disallow: /` on the admin project

---

## 6. The Android build

The APK is **not built from this repo**. It is a React Native WebView: an Expo
project (SDK 54) where `app/index.tsx` is the whole app. Its one screen loads
the production deployment of Vercel project 1 over the network:

```
https://shantai-mahila-bajar-app-frontend.vercel.app/
```

**Build from `https://github.com/Prathameshk2024/Android_app`, branch
`sub-main`** (checked 26 September 2026). It is the only copy with both push
notifications and the navigation fixes below. The other copies are older and
must not be built from:

| Copy | What it lacks |
|---|---|
| `Prathameshk2024/Android_app` `main` | Back via `window.history.back()`, reopening on the last page, the sideways-drift fix |
| `ArpitaHanjagi/Android_App` | Push notifications entirely |
| a local `appgold-main` folder (named here before) | Superseded by the repos above |

What follows from that:

- **Deploying `frontend/` updates the app** on every phone the next time it
  loads. A frontend change needs no APK build, and the APK has no
  `VITE_API_URL` of its own — it runs the web build.
- **Rebuild the APK only when the wrapper changes**, or when that URL does. It
  is hard-coded in `app/index.tsx`, so a new Vercel domain without a new APK
  leaves every installed app pointing at the old one.
- **CORS and MSG91 need nothing extra.** The WebView's origin is that Vercel
  URL, which must already be in `CORS_ORIGIN` (§3) and in the widget's allowed
  domains (§2) for the web app to work. If requests fail only inside the APK,
  compare the URL in `app/index.tsx` with those two lists first.
- **No network, no app.** Nothing is bundled into the APK.

The wrapper is Android System WebView, not Chrome, and it does more than
display the page:

- Any link whose scheme is not `http(s)`, `data:`, `blob:` or `about:` —
  `tel:`, `upi:`, `whatsapp:` — is handed to Android to open another app.
- Any URL containing `.pdf`, `.csv`, `.xlsx`, `.xls`, `.doc`, `.txt`, `.zip`,
  `download=`, `export=` or `attachment=` goes to a native downloader instead of
  loading. A page link that merely contains one of those never opens in the app.
  Nothing in the site triggers a download inside the APK any more — the "Save
  QR to phone" button that relied on this was removed.
- **Android Back runs `window.history.back()` in the page**, never the
  WebView's native `goBack()`. Native `goBack()` does not reliably keep
  `window.history.state`; React Router then falls back to the key `"default"`
  and the site's scroll memory breaks — Back lands at the top of the catalogue.
- **It reopens on the last page.** An allow-list of routes (`RESTORABLE_ROUTES`)
  is saved as she moves; checkout, payment and the upload wizard are never
  restored. After a cold launch on a deep page, Back steps up to `/shop` or
  `/seller` once, then exits. A tapped notification's page outranks the saved
  one.
- **It injects `overscroll-behavior-x: none`** so the product carousels stop
  dragging the whole page sideways. Never add an `overflow` rule to `<html>`
  there: it turns `<body>` into the scroll container, `window.scrollY` reads 0
  for ever, and scroll restoration stops working.

A web API that works in Chrome is not guaranteed there (`navigator.share` is
absent), so anything that touches the phone has to be tried inside the APK —
suite P of `docs/MANUAL-TEST-PLAN.md`.

To build it, from the wrapper's folder: `npm install`, then
`npm run android` (`expo run:android`) for a build on a connected phone. Its
release build type is currently signed with the debug keystore
(`android/app/build.gradle`), which the Play Store refuses; a Play listing
needs its own upload keystore first, and the package name
(`com.siddharam_sutar.mywebviewapp`) cannot change after the first upload.
The wrapper's own error pop-ups ("WebView error", "UPI App Not Found") are
still in English.

### Permissions

Declared in both the wrapper's `app.json` and its committed
`android/app/src/main/AndroidManifest.xml`. As of `sub-main` on 26 September
2026:

| Permission | Why | What to do |
|---|---|---|
| `INTERNET` | The whole app | Keep |
| `RECORD_AUDIO` (listed twice) | Voice typing | Keep once |
| `CAMERA` | Nothing uses the camera | **Keep, on purpose** — see below |
| `ACCESS_BACKGROUND_LOCATION` | Nothing | **Remove before any Play submission.** Play demands a declaration and a video for it and rejects apps that cannot justify it |
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Nothing — the site never asks for location | Remove |
| `SYSTEM_ALERT_WINDOW` in the main manifest | Nothing | Remove; it belongs only in the debug manifests, where it already is |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` | Only a fallback download path; no effect on Android 13+ | Remove |
| `VIBRATE` | Nothing | Harmless |
| `POST_NOTIFICATIONS` | Push on Android 13+ | Not declared in the repo; expected from the Firebase Messaging library's manifest at build time. **Check the built APK** |

**`CAMERA` decides what the photo picker offers.** `react-native-webview`
(13.16, `needsCameraPermission`) offers a "take photo" choice beside the
gallery only when `CAMERA` is *not* declared, or is declared and granted.
Declared and never granted — the current state — gives the gallery alone,
which is the product rule. Removing `CAMERA` therefore *adds* camera capture.

**Who asks for what, and when:**

- **Notifications:** Android's prompt, raised by the wrapper when the page
  sends `push:enable` — so after a seller or buyer signs in, never on the
  landing page. Android 12 and older has no prompt. A refusal is currently
  invisible: the wrapper simply stops, and after two refusals Android stops
  asking. Nothing tells her or sends her to Settings.
- **Microphone:** the wrapper never requests it at runtime.
  `react-native-webview` asks Android only for `getUserMedia`, which the Web
  Speech API may not use. Test on a fresh install; if the mic reports
  "denied", calling `getUserMedia({ audio: true })` once before starting
  recognition raises the real prompt without a new APK.
- **Clipboard, gallery, background running:** nothing to ask. The site only
  writes to the clipboard, Android's photo picker needs no permission, and
  FCM delivers to a closed app.

To change a permission, edit `app.json` and the manifest identically, or edit
`app.json` and prebuild (never `--clean`, see below). Libraries merge in their
own, so confirm the result on the built APK with
`aapt dump permissions app-release.apk`; `android.blockedPermissions` in
`app.json` removes one a library added.

### Push notifications

Spec: `docs/superpowers/specs/2026-09-21-push-notifications-design.md`. What
it takes to turn a phone notification on:

- **Firebase console, once.** Open the same Firebase project the API's
  Firestore lives in — `npm run dev:api` prints the project id, and
  production is whichever project `FIREBASE_SERVICE_ACCOUNT` points at.
  ⚙ Project settings → General → Your apps → Add app → Android, package
  name `com.siddharam_sutar.mywebviewapp` (exactly as in the wrapper's
  `app.json`), no SHA-1 needed. Download `google-services.json`. Under
  Project settings → Cloud Messaging, confirm "Firebase Cloud Messaging API
  (V1)" says Enabled — if not, enable it from the Google Cloud console
  linked off that page. `google-services.json` is not a secret (the key
  inside is restricted to this app), but it belongs to the wrapper, not this
  repo.
- **Commit the wrapper before touching `android/`.** `google-services.json`
  goes at the wrapper's root; `npx expo install expo-notifications` and the
  `expo-notifications` plugin entry in `app.json` come next. Only then run
  `npx expo prebuild --platform android` — **never** `--clean`, which
  discards the existing `android/` folder with no way back. A commit taken
  first is the only way to recover a hand-made native fix that prebuild
  overwrites; diff `android/` against it afterwards.
- **The `orders` channel.** Android 13+ will not even ask for notification
  permission until the app has created a channel, so the wrapper creates one
  named `orders` at high importance with the default sound before anything
  else runs.
- **Deploy order:** the API and `frontend/` first, then the APK last. The
  backend half is harmless on its own — no session has a token yet, so
  nothing is sent — and deploying it first means the API is already live
  once phones start reaching it from the new build.
- **Battery settings.** Xiaomi, Oppo, Vivo and Realme phones throttle or
  block notifications from an app that is not open, by default. Each of
  those needs **Autostart** allowed and battery use set to **No
  restrictions** for a closed-app notification to arrive — the seller app's
  own help card (Misc screen) says so in Marathi.
- **No Firestore, no push.** Without `FIREBASE_*` credentials the API falls
  back to the JSON file; the boot banner then prints `Push  off` and every
  send is a silent no-op, the same as any other integration this app
  degrades rather than crashes without.

Manual test coverage: `docs/MANUAL-TEST-PLAN.md`, Suite Q.
