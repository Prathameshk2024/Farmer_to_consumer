# शांताई महिला बाजार · Shantai Mahila Bazar

A digital marketplace for rural women entrepreneurs in Maharashtra. Sellers
list what they make, customers order it, and an admin approves listings and
subscription payments.

## Layout

```
frontend/   seller + customer app  (React + Vite, also shipped inside an Android APK)
admin/      admin console          (React + Vite, deployed as its own site)
backend/    Express API for both   (includes /api/admin/*)
shared/     types and domain rules imported by all three
docs/       product spec, deployment, manual test plan, Marathi style guide
```

## Run it

```bash
npm install            # all four workspaces
npm run dev            # API :4000 + app :5173
npm run dev:all        # the above + admin console :5174

npm test               # backend, frontend and admin
npm run typecheck
npm run build
```

Vite proxies `/api` to `localhost:4000`, so development needs no configuration.

## Try it

A fresh clone starts with an **empty** database. For demo sellers and products,
put `SEED_DEMO_DATA=true` in `backend/.env` before the first start. To reseed
later, stop the API, delete `backend/data/db.json`, and start it again.

- **Seller or customer:** any 10-digit number. With no SMS provider
  configured, the OTP screen shows the 6-digit code; only that code works.
- **Seeded seller:** `9822011223` (Sunita, SMB-ANADUR-01).
- **Admin console:** there is no default account. Stop the API, then create
  one; the command asks for the password:

  ```bash
  npm run admin:users -- create you@example.com "Your Name"
  ```

  The API reads the database into memory at start, so a running API does not
  see the new account and can overwrite it.

## Configuration

Copy `backend/.env.example` to `backend/.env`, and `frontend/.env.example` to
`frontend/.env`. Every integration is optional: with an empty `.env` the API
uses a JSON file instead of Firestore, emoji instead of Cloudinary photos, and
the on-screen OTP instead of MSG91. The boot banner lists what is live. The
comments in `backend/.env.example` explain each variable.

`VITE_*` values are compiled into the public JavaScript bundle. Never put a
secret such as `MSG91_AUTH_KEY` in one.

## Deployment

The API runs on Cloud Run. `frontend/` and `admin/` are two Vercel projects
built from the `prathamesh2` branch. Follow [`docs/DEPLOY.md`](docs/DEPLOY.md);
several required settings are not the platform defaults.

## Android APK

The APK is not built from this repo. It is a separate Expo project, a React
Native WebView whose one screen loads the deployed `frontend/` from Vercel, so
deploying `frontend/` updates the app on every phone. Rebuild the APK only when
the wrapper itself changes. Its source is
[`Prathameshk2024/Android_app`](https://github.com/Prathameshk2024/Android_app),
branch `sub-main`. See
[`docs/DEPLOY.md`](docs/DEPLOY.md#6-the-android-build).

## Further reading

- [`CLAUDE.md`](CLAUDE.md): architecture, business rules and conventions.
  Read it before changing code.
- [`docs/FEATURE-SPEC.md`](docs/FEATURE-SPEC.md): the product specification.
- [`docs/MARATHI-STYLE.md`](docs/MARATHI-STYLE.md): read it before writing any
  Marathi text.
- [`docs/MANUAL-TEST-PLAN.md`](docs/MANUAL-TEST-PLAN.md): what to click
  through before a release.
