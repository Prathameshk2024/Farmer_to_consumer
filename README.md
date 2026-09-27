# जवाहर शेतकरी बाजार · Jawahar Shetkari Bazar

A website that lets farmers in Maharashtra sell straight to buyers: farmers
list their produce, buyers order it, and an admin verifies each farmer once.
Marathi first, English as the toggle.

## Layout

```
frontend/   farmer + buyer website (React + Vite)
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

A fresh clone starts with an **empty** database. For demo farmers and produce,
put `SEED_DEMO_DATA=true` in `backend/.env` before the first start. To reseed
later, stop the API, delete `backend/data/db.json`, and start it again.

- **Farmer or buyer:** register with any 10-digit number and a password of
  at least 6 characters. There is no OTP.
- **Seeded farmers:** the four from the poster, all in अणदूर: राजेश पाटील
  `9822011223`, सविता कांबळे `9764455661`, गणेश जगदाळे `9890033441` and
  लक्ष्मी शिंदे `9850012345`. Seeding never invents passwords, so give one a
  demo password with the API stopped:
  `npm run admin -- set-password 9822011223 123456`, then sign in at
  `/login/farmer`.
- **Admin console:** there is no default account. Stop the API, then create
  one; the command asks for the password:

  ```bash
  npm run admin:users -- create you@example.com "Your Name"
  ```

  The API reads the database into memory at start, so a running API does not
  see the new account and can overwrite it. The console also holds survey
  entry and the research paper's Tables 1–9, each downloadable as CSV.

## Configuration

Copy `backend/.env.example` to `backend/.env`, and `frontend/.env.example` to
`frontend/.env`. Every integration is optional: with an empty `.env` the API
uses a JSON file instead of Firestore, category pictures instead of uploaded
photos, and no mandi price in the price hint (`DATA_GOV_IN_API_KEY`). The boot
banner lists what is live. The comments in `backend/.env.example` explain each
variable.

`VITE_*` values are compiled into the public JavaScript bundle. Never put a
secret in one.

## Deployment

The API runs on Cloud Run. `frontend/` and `admin/` are two Vercel projects
built from the `main` branch. Follow [`docs/DEPLOY.md`](docs/DEPLOY.md);
several required settings are not the platform defaults.

## Further reading

- [`CLAUDE.md`](CLAUDE.md): architecture, business rules and conventions.
  Read it before changing code.
- [`docs/FEATURE-SPEC.md`](docs/FEATURE-SPEC.md): the product specification.
- [`docs/MARATHI-STYLE.md`](docs/MARATHI-STYLE.md): read it before writing any
  Marathi text.
- [`docs/MANUAL-TEST-PLAN.md`](docs/MANUAL-TEST-PLAN.md): what to click
  through before a release.
