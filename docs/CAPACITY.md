# Capacity — what each service holds, and what breaks first

Written 18 September 2026. **These are estimates**, built from how the code
reads, writes and polls, from document sizes measured on the 13 September
recovery snapshot (`backend/data/recovery/`), and from each provider's
published free limits as remembered on that date. No live dashboard was read.
Section 9 lists what to look up to replace the guesses with real numbers.

---

## 1. The plans in use

| Service | Plan | What that means here |
|---|---|---|
| Firestore (Firebase) | **Spark — free** | Daily limits are **hard stops**, not bills. See §4. |
| Cloud Run (`shantai-api`) | billed project, **CPU always allocated** | Pay for every second the instance exists, idle included. See §5. |
| Cloudinary | not recorded — assumed Free | 25 credits a month. See §6. |
| Vercel (two projects) | not recorded — assumed Hobby | 100 GB transfer, 1M requests a month. See §7. |
| MSG91 | pay per SMS | See §8. |
| Secret Manager, Cloud Build, Artifact Registry, Cloud Storage, Cloud Logging | billed project | All inside free allowances or cents. See §8. |

---

## 2. What one of each thing costs

| Thing | Firestore documents | Size of each | Firestore writes | Cloudinary |
|---|---|---|---|---|
| Seller | 1 | ~1.2 KB (measured: 1,206 B average) | ~4 to register | her payment QR, ~0.2 MB |
| Product | 1 | ~0.5 KB (measured: 493 B average) | ~3 (create, approve, edit) | ~0.4 MB with thumbnails; ~6 transformations |
| Order | 1, plus ~1.5 reviews (the buyer must rate every product) | ~1.2 KB + ~0.4 KB per review | ~13 over its life | — |
| Buyer | 1 | ~0.5 KB | — | — |
| Sign-in | ~3 auth-log rows + 1 session | ~0.25 KB each | ~4, and one SMS | — |
| Time spent in the app | — | — | 1 per 5 minutes of use (the session's `lastSeenAt`) | — |
| ₹50 payment | 1 | ~0.5 KB | ~4 | screenshot, ~0.45 MB |

Built-in ceilings: the auth log keeps at most 5,000 rows or 90 days, a person
at most 10 sessions, a seller at most 30 notices. **Orders and reviews end up
as roughly three documents in four** — they are what grows.

---

## 3. Three sizes of market, after one year

| | Now (13 Sep snapshot) | Pilot | District |
|---|---|---|---|
| Sellers / live products | 6 / 13 | 100 / 400 | 1,000 / 4,000 |
| Buyers registered / active in a month | not known | 1,000 / 300 | 10,000 / 3,000 |
| Orders a day | not known | 20 | 200 |
| **Firestore documents** | under ~1,000 | ~26,000 | ~210,000 |
| Raw data | under 1 MB | ~16 MB | ~145 MB |
| Firestore storage (raw × ~3 for indexes) | under 3 MB | ~50 MB | ~450 MB |
| Firestore writes a day | under 100 | ~1,100 | ~11,000 |
| Server memory | ~130 MB | ~230 MB | ~1 GB |
| Cloudinary stored | ~7 MB | ~0.35 GB | ~3.5 GB |
| Cloudinary delivered a month | tiny | ~2.5 GB | ~24 GB |
| Cloudinary credits a month | under 1 | ~3–4 | **~30** |
| Vercel requests a month | tiny | ~90,000 | **~900,000** |
| Vercel transfer a month | tiny | ~3 GB | ~25 GB |
| SMS a month | tens | ~400 (~₹100) | ~4,000 (~₹1,000) |

Growth at pilot level is roughly **2,000 Firestore documents a month**.

---

## 4. Firestore on the Spark plan

### The limits

| Per day (reset around midnight Pacific — 12:30 IST in US summer time, 13:30 IST in winter) | |
|---|---|
| Document reads | 50,000 |
| Document writes | 20,000 |
| Document deletes | 20,000 |
| **Total, not per day** | |
| Stored data | 1 GiB |
| Network egress | 10 GiB a month |

On Spark, going over does not cost money. Firestore **refuses** the request
until the reset.

### Reads: the rule that matters

The server does not read documents one at a time. **Every time it starts, it
reads every document in the database once**, holds them all in memory, and
reads Firestore again only at the next start. So:

> **documents × server starts in a day must stay under 50,000.**

| Documents | Starts allowed in a day |
|---|---|
| 1,000 | 50 |
| 5,000 | 10 |
| 10,000 | 5 |
| 25,000 | 2 |
| 50,000 | 1 — and nothing else may read that day |

What counts as a start:

- the first request after about 15 minutes with none, while minimum instances
  is 0 — on a quiet day this can happen ten times or more;
- every deploy, and every environment-variable change, which is a deploy;
- Cloud Run occasionally restarting an instance on its own.

Two things spend the same quota without starting the server: **browsing data
in the Firebase console** (one read per document shown), and any script that
opens the database directly (`admin:users`, `backfill:customers`,
`purge:demo`) — each such run is one full start's worth.

**Where this lands.** Today, with perhaps a few hundred documents, there is
room for dozens of starts. At pilot growth of ~2,000 documents a month and ten
starts on a busy day, the line is crossed at about 5,000 documents — **two to
three months of pilot-level use.** That arrives long before storage, writes or
memory become a problem.

### What happens when a limit is hit

These are read from the code (`backend/src/db/store.ts`,
`backend/src/db/firestore.ts`), not guessed:

- **Reads exhausted at a start.** Since 18 September 2026 the server **refuses
  to start** in production: the log says `Failed to start: Firestore could not
  be loaded (…). Refusing to start on an empty database.`, the process exits,
  and Cloud Run keeps retrying. **The API is down until the reset** (about
  12:30 IST) — both apps show their network error, nobody can sign in or
  order. If it happens during a deploy, the new revision fails and traffic
  stays on the old one.

  Before that date it started anyway on `backend/data/db.json`, which does not
  exist in the container: an empty marketplace, everyone signed out, and every
  order and registration written to a file that died with the instance. Down
  is the better of the two failures — nothing is lost.
- **Writes exhausted (or any failed write).** The log says
  `[firestore] persist failed: …` and
  `N change(s) are in memory only - retrying every 60s`. The server keeps
  running and serving everything from memory; the changes are retried every
  minute and all go through on the first retry after the reset (`writes are
  being accepted again`). **They are lost only if the instance stops before
  then** — a deploy, or Cloud Run shutting down an idle instance — and the log
  then says so: `shutting down with changes Firestore never accepted - they
  are LOST`. So on a day the write limit is hit: do not deploy until after the
  reset.
- **Storage (1 GiB).** Writes are refused — same as above. Far away: ~450 MB
  after a district-sized year.

### The ways out

1. **Move the Firebase project to the Blaze plan, with a budget alert.** Blaze
   keeps exactly the same daily free allowance, so nothing costs more at
   today's volume — past it, reads are about $0.06 per 100,000, so even the
   district case is a few dollars a month. What changes is that going over is
   a small bill instead of an outage. It also makes managed backups available.
   This is the cheapest fix by far.
2. Set Cloud Run minimum instances to 1, so there are only one to three starts
   a day. That buys time, but costs ~$44 a month (§5) — more than Blaze would.
3. Long term, stop loading everything at start: async per-document reads, as
   `CLAUDE.md` describes. That also removes the memory ceiling below.

### The memory ceiling (second in line)

The server holds each document twice — as an object, and as the text it
compares against to find what changed — about six times the raw data in all,
plus ~130 MB for Node itself. Every save also re-serialises the whole database.
At Cloud Run's default 512 MiB that tops out around **50,000 documents
(~50–60 MB of data)**, where each save starts costing a noticeable fraction of
a second. On Spark the read limit arrives first.

---

## 5. Cloud Run

**Billing.** With CPU always allocated, Cloud Run charges for every second the
instance exists, idle or not, and nothing per request. The free allowance is
roughly 240,000 vCPU-seconds and 450,000 GiB-seconds a month — about **67
hours** of a 1 vCPU / 512 MiB instance. Past that, one instance up all month
is about **$44** (≈ $0.000018 per vCPU-second, $0.000002 per GiB-second;
check the current price page).

**What keeps it up** is any request within the last ~15 minutes. Three things
poll:

| Poll | Every | Pauses when hidden? |
|---|---|---|
| Admin console stats (`admin/src/components/Shell.tsx`) | 60 s | **Yes, since 18 Sep 2026** |
| Seller waiting for payment approval (`frontend/src/screens/seller/Subscription.tsx`) | 10 s | **Yes, since 18 Sep 2026** |
| Buyer's rating gate (`RateOrderGate`) | 2 min | Yes, always did |

Before 18 September, an admin tab left open overnight kept the instance up
all night, and so did a seller's phone left on the payment-waiting screen for
the day an approval can take. Now the instance is up only while someone is
actually using an app, plus the ~15 minutes after.

Rough monthly cost: a few hours of use a day stays within the free allowance
or costs a few dollars; all-day use approaches $44.

---

## 6. Cloudinary

On the Free plan, **1 credit = 1 GB stored, or 1 GB delivered, or 1,000
transformations**, and there are 25 a month.

- **Stored**: ~0.4 MB per product with its thumbnails, ~0.2 MB per seller QR,
  ~0.45 MB per payment screenshot. Photos are compressed on the phone first
  (`frontend/src/lib/compress.ts`).
- **Delivered**: product cards and pages ask for resized WebP/AVIF
  (`cloudinaryThumb`), about 0.5–1.5 MB for a buyer's browsing session. The
  admin screens load photos and screenshots **full size**.
- **Ceiling**: at about **2,500–3,000 buyers active in a month** the 25 credits
  run out, nearly all of it delivery. The next plan up costs real money each
  month.
- **Rejected listings**: since 19 September 2026 the 48-hour sweep destroys the
  photo along with the row. Before that the photo stayed in Cloudinary for
  ever; those already left behind are not cleaned up retroactively.

---

## 7. Vercel

Assumed Hobby: 100 GB of transfer and 1,000,000 requests a month. A first
visit is about 1 MB (143 KB of compressed JavaScript, CSS, up to ~860 KB of
bundled photos); later visits mostly revalidate. Every app open, including
each launch of the APK, is roughly 20 requests, so **requests run out before
transfer** — around the district size in §3.

Hobby's terms cover personal, non-commercial use. Whether a marketplace
charging ₹50 subscriptions fits that is worth checking before it grows.

---

## 8. Everything else

| Service | Use | Limit | Verdict |
|---|---|---|---|
| **MSG91** | one SMS per sign-in; a seller signs in at least every 90 days, a buyer after 15 idle days; +~25% retries | at most 3 per number per day | ~₹0.2–0.3 each; ₹100–1,000 a month across §3 |
| **Secret Manager** | 4 secrets, read at every start | 6 active versions and 10,000 reads a month free | Free. Disable old versions when rotating. |
| **Cloud Build** | one build per deploy, ~3–6 minutes | 2,500 build-minutes a month free | Free |
| **Cloud Logging** | request logs and the app's own lines | 50 GiB a month free | Free |
| **Cloud Storage** (source upload bucket) | ~3 MB per deploy | ~$0.02 per GB-month | Negligible |
| **Artifact Registry** | a new image layer per deploy — see below | 0.5 GB free, then $0.10 per GB-month | Free once the five-image policy is set; otherwise cents that only ever grow |
| Browser storage | cart, session, drafts, settings: a few KB | 5–10 MB per site | No concern |

### Artifact Registry, explained

`gcloud run deploy --source .` does three things: it uploads the repository to
Cloud Build, Cloud Build turns the `Dockerfile` into a container image, and
that image is stored in **Artifact Registry** — Google's storage for container
images — in a repository called `cloud-run-source-deploy`. Cloud Run then runs
the stored image. Every deploy stores a new one, and **nothing ever deletes
the old ones**.

Most of each image is the same between deploys and is stored once: the
`node:22-slim` base, about 75 MB compressed. But the layer holding
`node_modules` is rebuilt from scratch every time, with no build cache, so its
bytes come out different even when the dependencies did not change. Measured:
the runtime `node_modules` is **149 MB unpacked, 84 MB of which is
`react-icons`** — a front-end package the server never loads, installed because
the Dockerfile's second stage runs `npm ci --omit=dev` for every workspace.
Compressed, that is roughly **40 MB of new storage per deploy**.

| Deploys so far | Stored | Monthly cost |
|---|---|---|
| ~10 | ~0.5 GB | free |
| 100 | ~4 GB | ~$0.35 |
| 300 | ~12 GB | ~$1.15 |

So it is not expensive. The reason to act is that it is the one line on the
bill that grows forever and nobody will notice. The policy is
`artifact-cleanup.json` at the repository root — keep the **five newest**
images, delete the rest, which holds storage near 0.25 GB, inside the free
0.5 GB. `docs/DEPLOY.md` §1 (*Old images*) has the commands. The cost of it:
a Cloud Run revision whose image has been deleted can no longer be rolled back
to, so rollback reaches five deploys back.

---

## 9. Watching it

**The one number to watch is Firestore reads per day**, because on Spark it is
the one that turns into an outage (§4).

- **Firebase console → Firestore → Usage** shows reads, writes and deletes per
  day against the free limits. If the busiest day passes **25,000 reads**
  (half the limit), act: Blaze, or fewer starts.
- **The document count** is what those reads are made of. It is in two places:
  - the **admin console's home screen**, under *Overall*: *Records in the
    database*, and *Server starts a day the free read limit covers*;
  - the **Cloud Run log** at every start, e.g.
    `[firestore] loaded 812 documents (61 starts a day fit in the free 50000 reads): sellers 6 · products 13 · …`
    — all nine collections. At **10 starts a day or fewer** (about 5,000
    documents) the next line is a warning.
- **Starts per day**: count the `[firestore] loaded` lines in the Cloud Run
  logs for a day, and compare with the second admin tile. When the two meet,
  the next start is refused and the API is down until the reset.

To replace the estimates in this file with real figures:

- `gcloud run services describe shantai-api --region asia-south1` — memory, CPU,
  minimum instances, the image in use;
- Firebase console — Firestore location, whether it is the `(default)`
  database, and the Usage tab;
- Cloudinary dashboard — credits used this month, and the plan;
- Vercel → Usage, and the plan on both projects;
- MSG91 — the per-SMS rate on the account.

---

## 10. Found while writing this — both fixed 18 September 2026

**A failed Firestore write was never retried.** `persistDiff()` in
`backend/src/db/firestore.ts` recorded each collection as "on the server"
*before* the batch holding its changes was committed. If the commit failed —
the Spark write limit, a network blip, a timeout — the next save compared
against that record, saw nothing new, and sent nothing; the change lived only
in memory and was lost at the next start. Now a change is recorded as saved
only after its batch commits, a failed persist is retried every 60 seconds
until one succeeds, and a shutdown that still cannot save says so in the log.
`backend/tests/persist-retry.test.ts` holds it.

**A failed load at start produced an empty marketplace.** Covered in §4: in
production the server now refuses to start instead.

What neither fix can do: changes waiting for the write limit to reset exist
only in the running instance's memory. An instance that stops before the
reset — a deploy, or Cloud Run retiring an idle instance when minimum
instances is 0 — still loses them. Blaze (§4) is what removes that.
