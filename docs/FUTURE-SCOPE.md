# Future scope

Work that has been decided on but deliberately left for later. Each item says
why it matters and what "done" looks like, so whoever picks it up does not
have to rediscover either. Delete an item when it is done — git keeps the
history.

## Give the backup a read-only Firebase key

*Added 25 September 2026.*

The nightly backup (`.github/workflows/backup.yml`) reads the live Firestore
with `LIVE_FIREBASE_SERVICE_ACCOUNT`, which is the same full-access key Cloud
Run uses. The backup never writes to the live project — it reads a fixed list
of collections by name — so a leaked Actions secret should be able to read
the database at most, not change or delete it.

1. In the Google Cloud Console, on the **live** project: IAM & Admin →
   Service Accounts → create `backup-reader` with exactly one role,
   **Cloud Datastore Viewer** (`roles/datastore.viewer`).

   ```bash
   gcloud iam service-accounts create backup-reader --project=LIVE_PROJECT_ID
   gcloud projects add-iam-policy-binding LIVE_PROJECT_ID \
     --member="serviceAccount:backup-reader@LIVE_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/datastore.viewer"
   ```

2. Keys → Add key → JSON. Keep the file out of the repository.
3. GitHub → Settings → Secrets and variables → Actions → replace
   `LIVE_FIREBASE_SERVICE_ACCOUNT` with the file's contents (raw JSON or
   base64 JSON; `config.ts` reads either). Then delete the local file.
4. Actions → Backup → Run workflow with **dry_run** ticked. It should print
   `firestore read N documents` with the usual N; `PERMISSION_DENIED` means
   the role went on the wrong project. Then one real run.

**Do not delete the old key** — it is Cloud Run's, in Secret Manager.

Done also means:

- The note in `docs/BACKUP.md` that says the backup uses Cloud Run's key is
  rewritten to describe the read-only account.
- Decide whether to rotate Cloud Run's key: it sat in GitHub and was handed
  to Actions runners until now. Rotating is new key → new Secret Manager
  version → redeploy → delete the old key.
- `LIVE_CLOUDINARY_API_KEY` / `_SECRET` in the same workflow are also the
  live account's full keys. If the Cloudinary plan allows a key with
  restricted permissions, the same reasoning applies.

## Delivery charge by distance, set by the seller

*Added 25 September 2026.*

A seller has one flat `deliveryFee` (and `freeDeliveryAbove`), and no screen
asks her for either — so almost every order carries 0, which the cart shows
as "ask the seller" (see *One seller per cart* in `CLAUDE.md`). The buyer
learns the real charge only on a phone call after ordering.

Give the seller the option of charges by distance: for example ₹20 up to
5 km, ₹40 up to 10 km, ₹60 up to 20 km — bands she chooses. The checkout
then works out the charge for the buyer's address and shows

> **total = item price + delivery charge**

before the order is placed, and the order stores that figure in
`deliveryFee` / `total` exactly as today (`orders.routes.ts`, where the fee is
chosen now).

To settle before building it:

- **Where the distance comes from.** Nothing in the app has a location today —
  only pincodes. The cheapest honest answer is the distance between the
  centres of the seller's and the buyer's pincodes, from a bundled
  Maharashtra pincode table; asking for GPS adds a permission prompt and a
  wrong-location problem. Say on screen that the figure is approximate.
- **It stays optional.** A seller who sets no bands keeps today's behaviour,
  and 0 still means "ask the seller", never "free".
- **Beyond her last band.** Her pincode list is a hint, not a gate (*Where an
  order may go*), so an address past the last band should fall back to "ask
  the seller" rather than refuse the order.
- **`freeDeliveryAbove` still wins** when the order meets it — that is her
  promise.
- The server computes the charge; the client's figure is only a preview.
- Editing the bands follows the design rules: one page, not a wizard, and a
  Marathi label for every field (`docs/MARATHI-STYLE.md`).

## Signed-in devices, with sign-out, on her profile screen

*Added 25 September 2026.*

One account can be signed in on up to ten devices at once
(`MAX_SESSIONS_PER_USER` in `backend/src/auth/sessions.ts`), and signing in on
a new phone does not sign the old one out. Today nobody but an admin can see
where an account is signed in or end a session on a lost phone — she can only
log out of the phone in her hand. Google Play does not require this; it is for
"my phone was stolen" and for the handset a field coordinator shares.

The server half is already built and unused:

- `GET /api/auth/sessions` lists the caller's own live sessions (`client`,
  `createdAt`, `lastSeenAt`, `current`), and `DELETE /api/auth/sessions/:id`
  ends one of them, answering 404 for anyone else's.
- `api.sessions()` and `api.endSession()` in `frontend/src/lib/api.ts` wrap
  both. No screen calls them.

Done means:

- A "signed-in devices" section on the seller's profile (`screens/seller/Misc.tsx`)
  and on the buyer's, listing each session with its device and when it was
  last used, the current one marked "this phone" and without a sign-out
  button — Log out already does that.
- Signing a device out is a confirmation that states the consequence
  (that phone will need a new OTP), not "Are you sure?".
- Nothing extra for push: the FCM token lives on the session, so ending the
  session stops that phone's notifications.

To settle before building it:

- **Telling two phones apart.** `describeClient()` records only "Android",
  "Windows" and the like, so two Android phones are two identical rows. The
  last-used time may be enough; if not, record the phone model from the user
  agent at login. Do not store the raw user agent.
- **"Sign out everywhere else".** `revokeAllForUser()` exists but no route
  calls it. One button that ends every session but this one is probably the
  control a woman with a stolen phone actually needs.
- Every label in both languages, written separately (`docs/MARATHI-STYLE.md`).

## Move Firebase to Blaze, with a budget alert

*Added 25 September 2026.*

The live project is on the free **Spark** plan, where a daily limit is a hard
stop, not a bill: past 50,000 reads or 20,000 writes a day, Firestore refuses
requests until the reset. Because the server reads every document at each
start, reads grow with *documents × server starts*, and changes waiting on a
spent write limit exist only in memory — a deploy or an idle shutdown before
the reset loses them. `docs/CAPACITY.md` §4 and §10 have the numbers;
§4 *The ways out* names this as the cheapest fix.

Blaze keeps the same daily free allowance, so at today's volume it costs
nothing; past it, reads are about $0.06 per 100,000. Going over becomes a
small bill instead of an outage, and managed backups and point-in-time
recovery become available.

1. Firebase console → the **live** project → Usage and billing → Modify plan
   → **Blaze**, and attach a billing account.
2. Google Cloud console → Billing → **Budgets & alerts** → a budget on that
   project, e.g. ₹500 a month, with email alerts at 50%, 90% and 100%.
   A budget **alerts, it does not cap** — spending carries on past it — so
   the emails must go to someone who reads them.
3. Update the docs that assume Spark: `docs/CAPACITY.md` (§1 table, §4, §9's
   "act at 25,000 reads"), `docs/BACKUP.md` (the opening paragraph, and
   whether to turn on managed backups / point-in-time recovery alongside the
   GitHub Actions copy), and `docs/DEPLOY.md`'s "not on a day the Spark
   limits are spent".

The backup project can stay on Spark.

## Read documents per request instead of loading everything at start

*Added 25 September 2026. Not before the scale calls for it — see "When".*

The server loads every document into memory at start and answers from that
copy (*Persistence* in `CLAUDE.md`). That keeps every route synchronous and
every read free, and it is correct for exactly one process. Rewriting the
routes to read from Firestore per request is what lifts both ceilings that
design has: one instance, and a database that must fit in memory.

**When.** Only once one of these is actually true — until then the rewrite
costs more than it saves:

- one instance can no longer carry the traffic, and a second is needed;
- the database is heading for ~50,000 documents, where memory on 512 MiB and
  the whole-database re-serialise on every save become the limit
  (`docs/CAPACITY.md` §4, *The memory ceiling*);
- start-up time from the full load is long enough that buyers notice cold
  starts even with minimum instances at 1.

The read quota is **not** on this list. *Move Firebase to Blaze* (above)
fixes that for a few dollars, and on Spark this rewrite can spend reads
*faster* than today, not slower.

**What it buys.** More than one instance, and deploys that no longer overlap
two copies of the data. Starts that read nothing. No memory ceiling. Edits in
the Firebase console take effect at once instead of being overwritten by a
stale copy. The class of bug behind the 10 September deletion — an in-memory
copy that was wrong, treated as the truth — goes away. Scripts
(`admin:users`, `purge:demo`) read what they touch, not everything.

**What it costs — settle each before building:**

- **Reads move from each start to each request.** The session lookup becomes
  one read on every authenticated request. One catalogue page needs every
  LIVE product, each one's seller (`publiclyVisible`) and every review
  (`ratingsByProduct`). The admin console loads whole lists and sorts them in
  the browser. Without a cache, or ratings and counts stored as fields,
  ordinary browsing can out-read ten full starts a day.
- **Rules that scan a whole collection need another shape.** The
  duplicate-UTR check, slot counting, the per-village serial in the
  `SMB-<VILLAGE>-<NN>` ID, seller ratings and the dashboard counts each need a
  query with an index, or a stored counter. The 48-hour sweep of rejected
  listings and the archive purge need a scheduled job instead of running at
  boot.
- **Races that cannot happen today become possible.** One process runs one
  handler at a time against memory, so two requests cannot both take the
  last slot or both claim the same UTR. Slot limits, stock, duplicate UTRs,
  order transitions and single-use OTPs and registration tickets all need
  Firestore **transactions**.
- **State held in the process has to move out of it.** The rate limiter
  (`auth/rateLimit.ts`) is a `Map`; with two instances "three codes a day"
  becomes six. It needs a shared store.
- **Latency.** Each request pays network round trips, and reads made one
  after another (session → order → seller) add up on rural 4G.
- **Size of the rewrite.** `getDb()` has about 75 call sites in 15 files, and
  every helper beneath them becomes async. The diffed, batched `save()` gives
  way to explicit writes in each route — each one a place to forget a write.
  Tests that build a database in memory need the Firestore emulator or a
  fake.

**How.** One collection at a time, not all at once. Start with the ones that
grow without limit — `orders`, `reviews`, `sessions` — and keep the small,
slow-changing ones (`sellers`, `products`, `admins`) in memory until they
too need to move. `--max-instances=1` stays until the **last** collection
has moved; a single in-memory collection is enough for two instances to
overwrite each other.

Done means:

- `CLAUDE.md` *Persistence* and `docs/DEPLOY.md` §1 (*Exactly one instance*)
  describe the new model, and the one-instance warning is removed only when
  it is no longer true.
- `docs/CAPACITY.md` §4 counts reads per request, not documents × starts.
- `isBulkDelete()` is kept or replaced by an equivalent guard on any
  remaining batch path.
- Tests cover the transactions: two concurrent requests for the last slot,
  and the same UTR claimed on two orders at once, each succeed exactly once.
