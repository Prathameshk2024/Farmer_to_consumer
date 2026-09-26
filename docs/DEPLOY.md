# Deployment — Cloud Run + two Vercel projects

The shape:

```
       Cloud Run                        Vercel project 1
   ┌──────────────────┐            ┌──────────────────────┐
   │  Express API     │ ◄───────── │  farmer + buyer app  │   frontend/
   │  + Firestore     │            └──────────────────────┘
   │  + Cloudinary    │            Vercel project 2
   │                  │ ◄───────── ┌──────────────────────┐
   └──────────────────┘            │  admin site          │   admin/
                                   └──────────────────────┘
```

One backend, two front ends, three deployments — all from this one repository.
Each Vercel project points at a different **Root Directory**, so they build and
deploy independently while still sharing `shared/src/types.ts`.

| Piece | Name used below |
|---|---|
| Cloud Run service | `f2c-api`, region `asia-south1` |
| Vercel project, farmer + buyer site | `f2c-frontend`, Root Directory `frontend` |
| Vercel project, admin console | `f2c-admin`, Root Directory `admin` |
| Branch both Vercel projects track | `main` |

---

## 0. Accounts: new ones, nothing shared

Every account below is created fresh for this site. Nothing is reused from
any earlier project — not the Firebase project, not the Cloudinary folder, not
a secret.

1. **Google Cloud project** with billing on (Cloud Run needs it). Enable Cloud
   Run, Cloud Build, Artifact Registry and Secret Manager.
2. **Firebase project** on that Google Cloud project. Create the Firestore
   database (Native mode, `(default)`, location `asia-south1`). Then *Project
   settings → Service accounts → Generate new private key*: that JSON is
   `FIREBASE_SERVICE_ACCOUNT`.
3. **Firestore rules**: open *Firestore → Rules*, paste `firestore.rules` from
   the repository root, and publish. It denies every client-SDK read and
   write; the API uses `firebase-admin`, which the rules do not apply to.
4. **Cloudinary**: an account of its own, folder `f2c`. The dashboard's *API
   environment variable* is `CLOUDINARY_URL`.
5. **Secret Manager**: three secrets, named after the variables they fill —
   `SESSION_SECRET` (a fresh random value, see §1), `FIREBASE_SERVICE_ACCOUNT`
   (the JSON on one line) and `CLOUDINARY_URL`. Give the Cloud Run runtime
   service account `roles/secretmanager.secretAccessor` on each.
6. **Optional:** a data.gov.in API key for `DATA_GOV_IN_API_KEY`.

---

## 1. Cloud Run — the API

The service (the commands below call it `f2c-api`; use whatever name it is
created with):

| | |
|---|---|
| Service | `f2c-api` |
| Region | `asia-south1` (Mumbai) |
| URL | `https://f2c-api-<project number>.asia-south1.run.app` — record it here once deployed |

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

The first deploy, from a clone, at the repository root:

```bash
gcloud run deploy f2c-api --source . --region asia-south1 --project <PROJECT_ID>   --allow-unauthenticated --max-instances 1 --no-cpu-throttling   --set-env-vars CLOUDINARY_FOLDER=f2c   --set-secrets SESSION_SECRET=SESSION_SECRET:latest,FIREBASE_SERVICE_ACCOUNT=FIREBASE_SERVICE_ACCOUNT:latest,CLOUDINARY_URL=CLOUDINARY_URL:latest
```

Then the first administrator (single quotes: the hash contains `$`):

```bash
gcloud run services update f2c-api --region asia-south1 --project <PROJECT_ID>   --update-env-vars 'ADMIN_BOOTSTRAP_EMAIL=you@example.com,ADMIN_BOOTSTRAP_PASSWORD_HASH=<hash from npm run admin:users -- hash>'
```

Sign in once at the admin site, then remove both:

```bash
gcloud run services update f2c-api --region asia-south1 --project <PROJECT_ID>   --remove-env-vars ADMIN_BOOTSTRAP_EMAIL,ADMIN_BOOTSTRAP_PASSWORD_HASH
```

Later deploys need only:

```bash
gcloud run deploy f2c-api --source . --region asia-south1 --project <PROJECT_ID>
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

To try the image locally, where Docker is installed:

```bash
docker build -t f2c-api .
docker run -p 4000:4000 --env-file backend/.env f2c-api
```

**Never with a `.env` holding the production Firebase key.** That container is
a second process writing the live database, which is exactly what *Exactly
one instance* forbids. And since the image sets `NODE_ENV=production`, it also
needs `SESSION_SECRET` set, or it refuses to boot.

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
gcloud run services describe f2c-api --region asia-south1 --project <PROJECT_ID>
```

Look for `autoscaling.knative.dev/maxScale: '1'` and
`run.googleapis.com/cpu-throttling: 'false'`. To set both:

```bash
gcloud run services update f2c-api --region asia-south1 --project <PROJECT_ID> \
  --max-instances 1 --no-cpu-throttling
```

`<PROJECT_ID>` is the project's name, not the number in the URL — gcloud
refuses the number.

### ⚠ Exactly one instance. Not two.

`backend/src/db/firestore.ts` loads the whole database into memory at boot and
writes changes back. That is deliberate and documented there, and it is correct
for **one** process only. Two instances each hold their own snapshot and
overwrite each other's writes — orders vanish, farmers reappear after deletion,
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
it. The three marked secret are held in **Secret Manager** and exposed to the
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
| `CLOUDINARY_FOLDER` | `f2c` |
| `CORS_ORIGIN` | Both Vercel URLs, comma-separated. See §3. |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD_HASH` | First sign-in only, while no administrator exists. Make the hash locally with `npm run admin:users -- hash` — Cloud Run has no shell to run it in. Remove both once a real account exists. There is no `ADMIN_PASSWORD`. |
| `DATA_GOV_IN_API_KEY` | Optional. A data.gov.in key for the Agmarknet mandi price in the price hint. Without it the hint shows only the site's own prices. |
| `SEED_DEMO_DATA` | Leave unset. Setting it would put invented farmers in front of real customers. |
| `ALLOW_BULK_DELETE` | Leave unset. It is for one command run by hand, never for the service. |

Generate the session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Cold starts

With minimum instances at 0, Cloud Run stops an idle instance, and the next
request waits while a new one boots — and boot here means loading the **whole
database** from Firestore before the first request is answered. For a farmer on
a rural connection that wait reads as a broken app. `--min-instances 1` keeps
one warm and is billed for it.

Stopping itself is safe: Cloud Run sends `SIGTERM` ten seconds before it kills
an instance, and `backend/src/index.ts` flushes pending writes on it, so the
400 ms write-coalescing window is not lost.

---

## 2. Vercel — two projects, one repo

Create **two** Vercel projects from the same repository. The only difference is
the Root Directory.

| | `f2c-frontend` | `f2c-admin` |
|---|---|---|
| Root Directory | `frontend` | `admin` |
| Framework preset | Vite | Vite |
| Environment variables | `VITE_API_URL=<Cloud Run URL>` | `VITE_API_URL=<Cloud Run URL>` |

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

**Production is the branch Vercel is told it is.** The app is on `main`.
Check it in both projects: *Settings → Environments → Production → Branch
Tracking*.

Pushing any other branch makes a preview deployment, on its own URL, which §3
will then block.

### Both projects need their `vercel.json` — it is already in the repo

`frontend/vercel.json` and `admin/vercel.json` each hold one rewrite:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Both apps route in the browser. Vercel knows nothing about `/farmer/orders` or
`/password-requests`, so without this, **reloading any page other than the home page
returns 404** — the first thing anyone does after being sent a link. Static
files are matched before rewrites, so `/assets/…` still serves the real bundle.

The rewrite only works with absolute asset paths, which is Vite's default and
why neither app sets `base`. A relative base is resolved against the current
directory: reloading `/farmer/orders` asks for `/farmer/assets/index-xxx.js`,
the rewrite answers with `index.html`, and a script tag receiving HTML is a
blank screen. Nothing to configure in Vercel; the default `npm run build` is
right.

Every `VITE_*` value is read at **build** time, not run time — changing one
means redeploying, not just restarting. Anything named `VITE_*` is inlined
into the JS bundle that ships to every browser, so never put a secret in one.

In development neither app needs it: `vite.config.ts` proxies `/api` to
`localhost:4000`.

---

## 3. CORS — the part that is easy to get wrong

`CORS_ORIGIN` is **comma-separated**, because two different origins call this
API (use the URLs Vercel actually assigns; these assume the names were free):

```
CORS_ORIGIN=https://f2c-frontend.vercel.app,https://f2c-admin.vercel.app
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
  gcloud run services update f2c-api --region asia-south1 --project <PROJECT_ID> \
    --update-env-vars "^;^CORS_ORIGIN=https://f2c-frontend.vercel.app,https://f2c-admin.vercel.app"
  ```

Confirm it on boot — the banner prints what is active, in the service's
*Logs* tab:

```
  Database       Firestore (<project id>)
  Images         Cloudinary (<cloud name>)
  Mandi prices   on
  CORS           https://f2c-frontend.vercel.app, https://f2c-admin.vercel.app
```

---

## 4. Order of operations

CORS needs the Vercel URLs, and Vercel needs the API URL, so it takes two
passes:

1. Deploy the API to Cloud Run with maximum instances 1 and CPU always
   allocated. Set everything except `CORS_ORIGIN`.
2. Deploy both Vercel projects with `VITE_API_URL` pointing at Cloud Run.
3. Set `CORS_ORIGIN` on Cloud Run to the two Vercel URLs (the `^;^` command in
   §3). That makes a new revision — the same quiet-moment rule applies.
4. Check the Firestore rules are the ones from `firestore.rules` (§0).
5. Check the boot banner shows Firestore, Cloudinary and both origins.
6. Register and log in once on a real phone.

---

## 5. Before real users

- [ ] `SESSION_SECRET` set to a fresh random value — changing it later signs every user out
- [ ] `SESSION_SECRET`, `FIREBASE_SERVICE_ACCOUNT` and `CLOUDINARY_URL` come from Secret Manager, not plain variables
- [ ] `ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD_HASH` set for the first sign-in (`npm run admin:users -- hash`), then removed once a real administrator exists
- [ ] `CORS_ORIGIN` set to both origins
- [ ] Cloud Run maximum instances is 1
- [ ] Cloud Run CPU is always allocated (`cpu-throttling: 'false'`)
- [ ] `firestore.rules` published (§0)
- [ ] `SEED_DEMO_DATA` unset
- [ ] `robots.txt` with `Disallow: /` on the admin project

