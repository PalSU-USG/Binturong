# Production runbook

Status: written 21 Nov 2026 from repo files and the 21 Nov cloud research. Nothing in this
runbook has been run against production yet. No production Supabase project or Vercel
Production environment exists for this app as far as the repo records show.

Placeholders: anything in angle brackets, such as `<project-ref>`, `<region>`,
`<pooler-host>`, `<password>` or `<production-url>`, is a placeholder. Copy the real value
from the dashboard at the time. Do not commit real values.

Who does what: **OWNER** marks a dashboard action (Vercel, Supabase, DNS) that only the owner
performs, each one asked and approved separately. **AGENT** marks a repo action (a file
change, a test, a command run from a checkout) that goes through the normal branch, review
and commit workflow in `docs/engineering-workflow.md`.

## 1. Purpose and scope

Production mirrors dev 1:1. The owner, 20 Nov 2026 (recorded in
`plans/codex-handoff-2026-11-20.md`): "as much as possible, 1:1 sana para hindi mahirap".

That means the same code, the same Payload migrations, the same environment variable names,
the same Supabase settings (Data API off, private official-documents bucket of the same
shape) and the same Postgres major version. Only secret values, the project reference and
the public URL differ.

Dev today (recorded in `plans/product-alignment.md`, "Hosted dev deployment (17 Nov)"):
Vercel project `pal-su-usg/binturong`, Root Directory `binturong-open-usg`, Node 22, builds
GitHub `dev` as a Preview behind Vercel SSO. `vercel-build` runs `payload migrate` before
`next build`. The Supabase project `ntzwpcnsjpijfhrgvvin` is the dev database, not production.
The owner turned its Data API off and wiped `public`; then all 15 migrations ran, ending with
`20261117_053700_data_api_lockdown`. Still open on dev: no first admin on hosted, no hosted
storage bucket, function maximum duration unknown, pooler settings not reviewed.

Out of scope: choosing the production domain (gate G5) and any code change. Gate G11 is decided
(owner, 21 Nov 2026: "G11 go"): Media uses `@payloadcms/storage-s3` 3.90.2 against Supabase
Storage's S3-compatible endpoint. Code changes this runbook depends on are listed as AGENT
steps and are marked PROPOSED when they are not in the repo yet.

## 2. Facts to check first

These three facts change several answers below. The Vercel plan was given by the owner on
21 Nov 2026; the other two have not been checked (no login was used to write this runbook).
OWNER: read them from the dashboards and write them here with the date.

| Fact | Where to look | Value (fill in) |
| --- | --- | --- |
| Vercel plan of team `pal-su-usg` (Hobby, Pro or Enterprise) | Vercel team settings, billing | Hobby (owner, 21 Nov 2026) |
| Fluid compute on or off for project `pal-su-usg/binturong` | Vercel project settings, Functions | unknown |
| Supabase plan of the organization that will hold production (Free, Pro, Team, Enterprise) | Supabase organization billing | unknown |

How each one changes the answers (figures from the research in section 4, read 21 Nov 2026):

- **Vercel plan, for function duration.** With Fluid compute: Hobby has a 300 s default and a
  300 s maximum, with no extended maximum. Pro and Enterprise have a 300 s default, an 800 s
  maximum (generally available) and an 1800 s extended maximum (beta). The owner approved a
  20 minute (1200 s) download deadline, and `src/storage/documentDelivery.ts` sets
  `DELIVERY_DEADLINE_MS = 20 * 60_000`. A function can only run 1200 s on Pro or Enterprise,
  under the beta, set per function. On Hobby the real limit is 300 s, so a slow download
  would be cut off at 5 minutes with a 504 `FUNCTION_INVOCATION_TIMEOUT`, before the app's
  own 20 minute deadline.
- **Fluid compute, for duration and connection pooling.** Vercel caps Hobby functions at 60 s
  with Fluid compute off. Confirm Fluid compute is enabled before pushing the 300 s route
  configuration.
  Fluid is on by default for projects created on or after 23 Apr 2025, but whether it is on
  for this project is unconfirmed. Fluid also decides the pool advice: under Fluid, Vercel
  says not to set the pool maximum to 1 and recommends `attachDatabasePool` from
  `@vercel/functions` (not installed).
- **Supabase plan, for file size.** Free has a 50 MB maximum file size that cannot be raised.
  Pro and Team have 500 GB. The app's PDF bucket check requires `file_size_limit` of exactly
  50,000,000 bytes (`src/storage/officialStorage.ts`), which equals the Free ceiling. On Free,
  50 MB is a hard ceiling for the PDF bucket and for any new Media bucket. On Pro the bucket
  can keep the same 50,000,000 byte limit, which keeps it 1:1 with dev.

Also record the Supabase plan of the dev project (`ntzwpcnsjpijfhrgvvin`). If dev and
production are on different plans, they are not 1:1 on file limits.

## 3. Ordered steps

### Step 1. Supabase production project

1. **OWNER.** Create a second Supabase project for production. Write down its reference as
   `<prod-project-ref>` and its region as `<region>` in a private note, not in the repo.
2. **OWNER.** Use the same Postgres major version as dev. `docs/local-development.md` records
   cloud dev at 17.11 and local at 17.6, so the major version is 17. Check the version the
   new project shows before continuing (unverified until checked).
3. **OWNER.** Turn the Data API off, as on dev. If it must stay on for any reason, it must be
   locked down to match dev. Migration `20261117_053700_data_api_lockdown` applies the
   database side of the lockdown when `vercel-build` runs migrations (step 4); the dashboard
   switch is separate.
4. **OWNER.** Create the private bucket `official-documents` with the same shape the code
   checks for: private (not public), file size limit 50,000,000 bytes, allowed MIME type
   `application/pdf` only. The app refuses to use a bucket that differs
   (`src/storage/officialStorage.ts`).
5. **OWNER (G11 picked the S3 adapter).** Create a separate bucket for Media (for example
   `media`). It can stay private: the app serves every Media file through Payload's own route
   `/api/media/file/<filename>` (the adapter's `disablePayloadAccessControl` is left off), which
   reads the bucket with the S3 keys, so no browser fetches from the bucket directly. Then
   generate S3 access keys in the project's Storage settings (S3 section). These keys have full
   access to every bucket, including the private PDF bucket, and bypass RLS, so treat them like
   the service-role key. The five `MEDIA_S3_*` variables in step 3 come from here.
6. **OWNER.** Do the same storage setup on the dev project first if it is not done yet
   (Tasks V1 and V2), so production copies a setup that has passed the Preview smoke (step 9).

### Step 2. Connection strings

Two different URLs, both through the Supavisor shared pooler (IPv4 on every plan). Copy the
exact pooler hostname from the dashboard Connect panel; its format is unconfirmed, so it is
written as `<pooler-host>` here.

- **Runtime, `DATABASE_URL`:** transaction pooler, port 6543, user `postgres.<prod-project-ref>`.
  Shape: `postgresql://postgres.<prod-project-ref>:<password>@<pooler-host>:6543/postgres`.
  Transaction mode suits many short-lived function instances. It does not support named
  prepared statements; Payload/Drizzle sends unnamed statements here (from reading installed
  source), and whether unnamed statements are fully safe on Supavisor transaction mode is
  unconfirmed. The app's account lock is `pg_advisory_xact_lock`, which is transaction-scoped
  and fits transaction mode. Do not add session-level `SET`, `LISTEN` or session advisory locks.
- **Migrations, `MIGRATION_DATABASE_URL`:** session pooler, port 5432 on the pooler host.
  Shape: `postgresql://postgres.<prod-project-ref>:<password>@<pooler-host>:5432/postgres`.
  Session mode behaves like a normal connection, so a migration that needs session state works,
  and it avoids the IPv6-only direct host (whether Vercel build machines can reach IPv6 is
  unconfirmed).

**AGENT, PROPOSED (not in the repo yet).** The current script is
`"vercel-build": "npm run payload -- migrate && npm run build"` in
`binturong-open-usg/package.json`. The Payload Postgres adapter has no separate migration URL
option, so the research proposes overriding the variable for the migrate command only:

```json
"vercel-build": "DATABASE_URL=\"$MIGRATION_DATABASE_URL\" npm run payload -- migrate && npm run build"
```

Conditions for this change: it relies on Vercel's build shell being sh-like (Linux; not
verified by a test build); the build must fail if `MIGRATION_DATABASE_URL` is empty instead of
falling back to the runtime URL (the line above does not yet do that check); and it is applied
to dev first and proven by a Preview build before production uses it.

The `MIGRATION_DATABASE_URL` change above is still a recommendation; the owner has not
approved it (open question 9), so `vercel-build` still migrates over `DATABASE_URL`.

**Built (Task V3, branch `Hawksprey420/cloud-ready`).** `src/utilities/databasePool.ts` builds
the pool options from env only:

- Without `VERCEL` (local Docker, tests): exactly `{ connectionString }`, as before.
- On Vercel (`VERCEL=1`): `max` 5 and `idleTimeoutMillis` 5000 per function instance.
- `DATABASE_POOL_MAX` (whole number 1 to 100) overrides the size anywhere. Supabase advises a
  pool of 1 and Vercel advises not 1 under Fluid; start at 5 and watch Supabase's connection
  count.
- `DATABASE_SSL_CA` (Supabase's root certificate, PEM; `\n` escapes allowed) turns on verified
  TLS through the `ssl` object. Remove SSL parameters from `DATABASE_URL`, because node-postgres
  can replace the certificate settings with those parameters. Without the CA, TLS follows
  `DATABASE_URL`. Setting the CA on Preview is optional and should be tried there before production.

`@vercel/functions` `attachDatabasePool` is not used (not installed, and whether the Payload
adapter exposes its pool for it is unconfirmed).

One database, one migrator: dev Preview and Production use separate Supabase projects, so
their builds never migrate the same database. Payload 3.90.2 takes no advisory lock during
`payload migrate`, so two builds migrating one database at once are not serialized.

### Step 3. Vercel Production environment variables

**OWNER.** Set these in the Vercel Production environment, with the same names as Preview and
new values. Do not reuse any dev secret.

| Name | Production value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | transaction pooler URL from step 2 | secret |
| `MIGRATION_DATABASE_URL` | session pooler URL from step 2 | PROPOSED; only once the `vercel-build` change is merged; secret |
| `PAYLOAD_SECRET` | new random value | secret; signs JWTs |
| `NEXT_PUBLIC_SERVER_URL` | `<production-url>`, no trailing slash | public by design; used for CORS and links; depends on gate G5 (domain) |
| `CRON_SECRET` | new random value | secret; checked as `Authorization: Bearer <value>` by the jobs `run` access |
| `PREVIEW_SECRET` | new random value | secret |
| `OFFICIAL_STORAGE_URL` | `https://<prod-project-ref>.supabase.co` (placeholder; origin only, path empty or `/storage/v1`) | server-only |
| `OFFICIAL_STORAGE_BUCKET` | `official-documents` | same as dev |
| `OFFICIAL_STORAGE_SERVICE_KEY` | production service-role key | secret, server-only |
| `MEDIA_S3_BUCKET` | the Media bucket name from step 1.5, for example `media` | server-only |
| `MEDIA_S3_ENDPOINT` | `https://<prod-project-ref>.storage.supabase.co/storage/v1/s3` (placeholder; copy from Storage settings, S3 section) | server-only |
| `MEDIA_S3_REGION` | the project's region as shown in the same S3 section | server-only |
| `MEDIA_S3_ACCESS_KEY_ID` | S3 access key ID generated in step 1.5 | secret, server-only; reaches every bucket |
| `MEDIA_S3_SECRET_ACCESS_KEY` | its secret access key | secret, server-only |
| `DATABASE_POOL_MAX` | optional; leave unset for the default 5 on Vercel | server-only |
| `DATABASE_SSL_CA` | optional Supabase root certificate (PEM), remove SSL parameters from `DATABASE_URL` when set | server-only, try on Preview first |

Media storage switches on only when all five `MEDIA_S3_*` variables are set. With none set,
Media is written to the function's temporary disk and lost; with only some set, loading the
Payload config fails with an error naming the missing ones (so `payload migrate` in the build
fails too). Set all five in Preview first (Task V1 step 5).

When copying local CMS content to Preview, also copy the original media and each generated image
size into the Media bucket under the recorded object keys, or upload the originals through Payload
and remap the content references. Copying database rows alone leaves broken media URLs.
Dashboard labels in the table are from the Supabase S3 docs, not checked in the dashboard.

Rules for these values:

- The service-role key and the S3 access keys live only in Vercel environment variables. They
  never go in the repo, in `.env.example`, in a chat or in any `NEXT_PUBLIC_` variable,
  because `NEXT_PUBLIC_` values are sent to the browser.
- Check the exact Preview names in the Vercel dashboard and compare them with this table and
  with `binturong-open-usg/.env.example`; the table is built from the repo, not from the
  dashboard (unverified).
- Scope `MIGRATION_DATABASE_URL` to the build if the dashboard allows it.

### Step 4. Migrations on the first production build

**AGENT.** Before deploying, count the migrations in `binturong-open-usg/src/migrations`
(18 on 21 Nov 2026, the last being `20261121_112130_staff_access_requests`). **OWNER** approves
and starts the first Production deploy. **AGENT** reads the build log to the end: `payload
migrate` must list every migration as applied, then `next build` must succeed. A failed
migration fails the deploy, which is the intended behaviour.

### Step 5. First admin

`npm run create:first-account` (owner approval 21 Nov 2026: "commit the one time local
migration for the superadmin") creates one active super-admin, and only while the `users`
table is empty. It counts accounts under the account lock `pg_advisory_xact_lock(20261020, 1)`,
so the guard triggers accept the insert. Once any account exists it refuses with "Accounts
already exist", so it cannot be reused to add accounts later. Tested only against the local test
database (`tests/int/account-bootstrap.int.spec.ts`); not yet run on a hosted database.

1. **OWNER.** From `binturong-open-usg`, point `DATABASE_URL` at the hosted database for this
   shell only (session pooler, port 5432), then dry-run:

   ```powershell
   $env:DATABASE_URL = '<session-pooler-url>'
   npm run create:first-account -- --email <address> --name "<name>"
   ```

   The script prints the target host and asks you to type it, then asks for the password twice
   (at least 12 characters, not echoed). A dry run saves nothing and ends with "Dry run".
2. **OWNER.** Run the same command with `--apply`, then `Remove-Item Env:DATABASE_URL`.
3. **OWNER.** Sign in at `/admin` and confirm the Accounts screen opens. Create every other
   account from there. Do this on the dev database first, then on production.

`npm run bootstrap:super-admin` (promote an existing account) still accepts only local
databases by design.

### Step 6. Vercel Firewall rate-limit rule on downloads

**OWNER.** Add a Vercel Firewall rate-limit rule for requests to `GET /api/documents/:id/file`,
counted per IP. The route is a Payload custom endpoint (`src/storage/documentEndpoints.ts`,
path `/:id/file`) served by the catch-all `src/app/(payload)/api/[...slug]/route.ts`.

Rule shape to enter (unverified; check the fields and whether rate limiting is available on
the team's plan in the dashboard, since the 21 Nov research did not cover Vercel Firewall):

- Condition: request method is `GET` and request path matches `/api/documents/<anything>/file`.
- Key: client IP.
- Limit: `<requests>` per `<window>`; the owner picks the numbers. No number has been decided.
- Action when exceeded: deny with 429, or the closest action the dashboard offers.

Why a firewall rule and not code: an in-memory limiter keeps its counter inside one function
instance. On Vercel, requests are spread over many instances that start and stop on their own,
so each instance sees only part of one visitor's traffic and the counter resets whenever an
instance is replaced. The limit would be loose and unpredictable. The firewall counts at the
edge, in front of every instance, and needs no code. No rate limiter exists in the app code
today (searched 21 Nov 2026).

### Step 7. File download duration

The owner approved a 20 minute download deadline on 20 Nov ("Raise it to twenty"), and the
code uses 20 minutes (`DELIVERY_DEADLINE_MS` in `src/storage/documentDelivery.ts`).

**Built (Task V4, owner decision 21 Nov 2026, team plan Hobby).**
`src/app/(payload)/api/[...slug]/route.ts` exports `maxDuration = 300`, the Hobby maximum.
What that means:

- **Hosted downloads stop at 5 minutes on Hobby**, not the approved 20. A download still
  running at 300 s is cut off with a 504 `FUNCTION_INVOCATION_TIMEOUT` before the app's own
  20 minute deadline. Locally the 20 minute deadline still applies.
- 20 minutes needs either a Pro (or Enterprise) plan with `maxDuration` 1200 (over 800 s is the
  extended-duration beta, set per function), or Option B below (signed-URL downloads).
- The export is in Payload's catch-all route, so it applies to **every** Payload REST route in
  that file, not only `GET /api/documents/:id/file`.
- Under Fluid compute on Hobby, 300 s is already the default and the maximum, so the export
  pins the value rather than raising it. Confirm Fluid is enabled and verify the route in the
  first Preview build (step 9).
- The route file carries Payload's "generated, do not modify" header. Neither `payload` nor
  `@payloadcms/next` 3.90.2 rewrites it at build or run time (their `dist` folders were searched
  21 Nov 2026); `tests/int/download-duration.int.spec.ts` fails if a Payload upgrade or template
  copy drops the export.
- The function still buffers up to 50 MB in memory, and whether its fixed `Content-Length`
  stream counts as streamed for Vercel's 4.5 MB response limit is unconfirmed.

Option still open for a 20 minute download on Hobby:

- **Option B: redirect to a short-lived signed URL.** The endpoint keeps its access check, then
  answers 302 to a Supabase signed download URL (for example 60 to 300 s), so the browser
  downloads straight from storage and the function ends in milliseconds. This works on any
  Vercel plan, avoids buffering 50 MB in function memory and avoids the 4.5 MB question.
  Costs: a code change in the download path (security review needed, since it changes how
  published versus draft files are delivered), and the signed URL can be reused by anyone who
  has it until it expires. Supabase documents no maximum expiry, so keep it short.

The research recommends asking why 20 minutes is needed before buying it, since a 50 MB file
should not take that long unless the client is very slow. The shorter hosted deadline is
recorded above.

### Step 8. Restore drill

This is the Phase F scratch restore (gate G10) written as steps. It has not been run. Do it on
a local scratch database before production goes live, then again against production backups
once they exist.

1. **OWNER.** Approve the drill and which backup to use. Backups of the local `binturong_domain`
   database are kept in `C:/Users/Hawksprey/binturong-backups/` (recorded in
   `plans/product-alignment.md`). The format of the backup files was not checked for this
   runbook. Starting Docker Desktop also starts Bintanong's Supabase containers, so ask the owner
   before starting it.
2. **AGENT.** Create an empty scratch database, for example `binturong_restore_drill`, on the
   local container `binturong-db-45323`. Never restore into `binturong_domain` or
   `binturong_test`.
3. **AGENT.** Restore with the native tool that matches the backup format, passing the
   password through the environment (`PGPASSWORD`), never in the command text:
   `pg_restore --dbname <scratch-url> <backup-file>` for a custom-format dump, or
   `psql <scratch-url> -f <backup-file>` for a plain SQL dump. Placeholders; which one applies
   depends on the format.
4. **AGENT.** Point a dev server from the main checkout on `dev` at the scratch database and run
   `npm run payload -- migrate`. Expected: it applies only migrations newer than the backup, or
   none.
5. **AGENT.** Check records: compare row counts of the main tables (users, documents,
   issuances, reports, pages, media) against the source, and open a few public pages and
   `/admin`. Check files: run
   `npm run documents:manifest -- --out manifest.json --backup-dir backup` against the restored
   database and its storage; every entry must be `ok` (the command exits 2 otherwise). Keep the
   manifest and backup folder outside Git.
6. **AGENT.** Record what was checked and the results in the task checkpoint, without real
   content or credentials.
7. **OWNER approves, AGENT runs.** Drop the scratch database: `drop database binturong_restore_drill;`.

For production: whether Supabase keeps automatic backups for the production project, and how
often, depends on its plan and was not researched. OWNER: check the project's backup settings
and record them here.

### Step 9. Preview smoke checklist (Task V6)

Run after each push of `dev` the owner approves, and run the same list on production after its
first deploy (on production, use the production admin and clearly fake test content).

1. Watch the Vercel build log to the end (`vercel inspect <deployment-url> --logs` or the
   dashboard). Expected: migrate lists the applied migrations and the build succeeds. On the
   first build after Task V4, also confirm Vercel accepted `maxDuration` 300 (no build error,
   and the function's maximum duration shows 300 s where the dashboard lists it).
2. Home returns 200.
3. `/admin` login works with the hosted admin.
4. Upload an image under 4.5 MB, redeploy, and check it still shows on a public page and in
   the bucket. That proves it is not on local disk. Server uploads over 4.5 MB are refused by
   Vercel (413) because the adapter's `clientUploads` is off; that is expected for now.
5. Upload a PDF, publish a test record, and download the PDF as an anonymous visitor.
6. Confirm a draft PDF is refused to an anonymous visitor.
7. Delete the test record.
8. Record pass or fail per item in the checkpoint. A failure becomes a task on the next branch.

### Step 10. Rollback

1. **OWNER.** If a production deploy is bad, put the previous working Production deployment back
   from the Vercel dashboard (redeploy or promote it). The exact dashboard wording was not
   checked for this runbook.
2. Rolling back the deployment does not roll back the database. If the bad deploy applied a new
   migration, the previous code runs against the newer schema. Check that it still works before
   relying on the rollback.
3. Run a migration's `down()` only with the owner's explicit approval, after a fresh backup, and
   against the exact database named in the approval. `down()` can drop columns and data (for
   example, `20261020_060134_account_auth_revision` drops `users.auth_revision`).
4. Record what happened, which deployment is live, and the migration state in the checkpoint.

## 4. Research (read 21 Nov 2026)

Carried over from the V0 research notes written by a research agent on 21 Nov 2026. Items marked
unconfirmed were not established by an official source.

### Repo facts the research is fitted to (read 21 Nov 2026)

- `src/payload.config.ts`: `postgresAdapter({ push: false, pool: { connectionString:
  process.env.DATABASE_URL || '' } })`. No `max`, `ssl` or `idleTimeoutMillis` set. `sharp` is
  passed to the config.
- `src/collections/Media.ts`: `upload.staticDir = public/media`, seven `imageSizes`, `read:
  anyone`, writes `authenticated`.
- `src/storage/officialStorage.ts`: custom Supabase Storage REST client using
  `OFFICIAL_STORAGE_URL`, `OFFICIAL_STORAGE_SERVICE_KEY` (sent as `apikey` and
  `Authorization: Bearer`) and `OFFICIAL_STORAGE_BUCKET`. It checks the bucket is private,
  `file_size_limit === 50_000_000`, and only `application/pdf`. It reads with a 30 s timeout and
  buffers up to 50 MB in memory.
- `src/storage/documentLimits.ts`: `MAX_DOCUMENT_BYTES = 50_000_000`, `TUS_CHUNK_BYTES = 6 MiB`,
  `UPLOAD_SESSION_TTL_MS = 2 h`, `STORAGE_TIMEOUT_MS = 30 s`.
- The download route is a Payload custom endpoint served by the generated catch-all
  `src/app/(payload)/api/[...slug]/route.ts` ("DO NOT MODIFY"). No `vercel.json`; no
  `maxDuration`.
- Installed `@payloadcms/drizzle` 3.90.2 runs each migration in its own transaction and takes no
  advisory lock. No `.prepare(` call was found in `node_modules/@payloadcms`.
- `@vercel/functions` is not installed.

### Media storage adapter

- `@payloadcms/storage-s3` and `@payloadcms/storage-vercel-blob` both have 3.90.2, peer-depending
  on `payload` 3.90.2 (npm registry, `npm view`, run 21 Nov 2026). Pin 3.90.2 to match Payload.
- S3 adapter shape: `s3Storage({ collections: { media: true }, bucket, config: { credentials,
  region, ... } })`; Supabase also needs `endpoint` and `forcePathStyle: true`
  (https://payloadcms.com/docs/upload/storage-adapters and
  https://github.com/payloadcms/payload/blob/main/packages/storage-s3/README.md, read 21 Nov 2026).
- Vercel Blob adapter shape: `vercelBlobStorage({ enabled: true, collections: { media: true },
  token: process.env.BLOB_READ_WRITE_TOKEN })`
  (https://github.com/payloadcms/payload/blob/main/packages/storage-vercel-blob/README.md, read
  21 Nov 2026).
- `disableLocalStorage` defaults to `true` with the adapters. `disablePayloadAccessControl: true`
  serves files straight from the cloud host
  (https://github.com/payloadcms/payload/blob/main/packages/plugin-cloud-storage/README.md, read
  21 Nov 2026).
- Image sizes are uploaded on normal server uploads, from reading package source
  (https://unpkg.com/@payloadcms/plugin-cloud-storage@3.90.2/dist/utilities/getIncomingFiles.js,
  read 21 Nov 2026) and https://payloadcms.com/docs/upload/overview (read via search result 21 Nov
  2026). Not stated on an official doc page.
- "When deploying to Vercel, server uploads are limited with 4.5MB." `clientUploads: true` sends
  files from the browser to the bucket (Payload storage-adapters page, read 21 Nov 2026).
- Vercel request and response body limit is 4.5 MB; the response limit does not apply to
  streamed responses; over-limit requests get `413 FUNCTION_PAYLOAD_TOO_LARGE`
  (https://vercel.com/docs/functions/limitations, read 21 Nov 2026).
- Supabase S3 endpoint `https://<project_ref>.storage.supabase.co/storage/v1/s3`, region is the
  project's region, `forcePathStyle: true`. S3 access keys are server-only, have full access to
  all buckets and bypass RLS. The service role key is not an S3 credential
  (https://supabase.com/docs/guides/storage/s3/authentication, read 21 Nov 2026).
- Vercel Blob stores are private or public, fixed at creation
  (https://vercel.com/docs/vercel-blob, read 21 Nov 2026).
- Recommendation (research, not a decision; G11 decides): `@payloadcms/storage-s3@3.90.2`
  against a separate public Supabase bucket, `clientUploads` off at first,
  `disablePayloadAccessControl` false at first.

### Postgres from Vercel to Supabase

- Direct connection is IPv6 unless the IPv4 add-on is bought. The shared pooler is IPv4 on every
  plan: session mode port 5432, transaction mode port 6543, user `postgres.[REF]`. The shared
  pooler does not support prepared statements in transaction mode. For serverless: client at
  module scope, small pool, prepared statements off, SSL required; `verify-full` with the Supabase
  root certificate verifies the server
  (https://supabase.com/docs/guides/database/connecting-to-postgres, read 21 Nov 2026).
- Supabase recommends the transaction pooler for serverless clients
  (https://supabase.com/docs/guides/database/connecting-to-postgres/serverless-drivers, read
  21 Nov 2026).
- For node-postgres, omit the query `name` to avoid prepared statements
  (https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL, read
  21 Nov 2026).
- Under Fluid compute: pool at module scope, `attachDatabasePool(pool)`, short idle timeout,
  do not set max to 1 (https://vercel.com/kb/guide/connection-pooling-with-functions, read 21 Nov
  2026). `attachDatabasePool` supports `pg`
  (https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package, via search
  21 Nov 2026).
- Fluid is on by default for projects created on or after 23 Apr 2025
  (https://vercel.com/docs/fluid-compute, read 21 Nov 2026).
- `sslmode` or `sslrootcert` in the connection string replaces the `ssl` object
  (https://node-postgres.com/features/ssl, read 21 Nov 2026).

### Migrations at build time

- Run migrations in the build step; a failed migration fails the deploy. `prodMigrations` is
  advised against for serverless (https://payloadcms.com/docs/database/migrations, read 21 Nov
  2026).
- The Postgres adapter has no separate migration URL option
  (https://payloadcms.com/docs/database/postgres, read 21 Nov 2026).
- Recommendation: migrate over the session pooler (5432) with a `MIGRATION_DATABASE_URL`
  override in `vercel-build` (section 3, step 2).

### Function duration

- With Fluid compute: Hobby 300 s default and maximum; Pro and Enterprise 300 s default, 800 s
  maximum, 1800 s extended maximum (beta). Over 800 s must be set per function. Timeout returns
  504 `FUNCTION_INVOCATION_TIMEOUT`; duration includes streaming time
  (https://vercel.com/docs/functions/configuring-functions/duration and
  https://vercel.com/docs/functions/limitations, read 21 Nov 2026).
- `export const maxDuration` in a route file, or `vercel.json` `functions` (paths start with
  `src/` when a `src` directory is used). Precedence: function code, then `vercel.json`, then
  dashboard, then Fluid defaults (https://vercel.com/docs/fluid-compute, read 21 Nov 2026).

### Supabase Storage limits

- Maximum file size: Free 50 MB (cannot be raised), Pro 500 GB, Team 500 GB, Enterprise custom.
  Per-bucket limits can be lower; buckets can restrict MIME types
  (https://supabase.com/docs/guides/storage/uploads/file-limits, read 21 Nov 2026).
- Standard upload is ideal up to 6 MB; above that use TUS resumable uploads
  (https://supabase.com/docs/guides/storage/uploads/standard-uploads, read 21 Nov 2026).
- Resumable chunk size must be 6 MB; each upload URL is valid up to 24 hours
  (https://supabase.com/docs/guides/storage/uploads/resumable-uploads, read 21 Nov 2026).
- Signed upload URLs are valid for 2 hours
  (https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl, read 21 Nov
  2026).
- Signed download URL `expiresIn` is in seconds; no maximum is documented
  (https://supabase.com/docs/reference/javascript/storage-from-createsignedurl, read 21 Nov 2026).

### Implementation reading for Tasks V1, V3 and V4 (read 21 Nov 2026)

- Payload storage adapters page (https://payloadcms.com/docs/upload/storage-adapters, read
  21 Nov 2026): `s3Storage` takes `collections`, `bucket`, `config` (AWS `S3ClientConfig`),
  `acl`, `clientUploads`, `signedDownloads`, `enabled` (default `true`; "conditionally enable
  the plugin"). Per-collection `disableLocalStorage` "Defaults to `true`".
  `disablePayloadAccessControl: true` points URLs straight at the cloud host. "When deploying
  to Vercel, server uploads are limited with 4.5MB." The page does not cover Supabase or image
  sizes.
- Installed `@payloadcms/storage-s3` 3.90.2 and `@payloadcms/plugin-cloud-storage` 3.90.2
  source (read in `node_modules`, 21 Nov 2026):
  - With `enabled: false` the plugin returns the config unchanged except that it always adds
    its client upload handler to `admin.dependencies` "to avoid import map discrepancies between
    dev and prod". The app therefore always registers the plugin, enabled only when the
    `MEDIA_S3_*` variables are set, and `importMap.js` lists the handler.
  - When enabled it sets `disableLocalStorage: true` on `media`, adds the S3 static handler (so
    `/api/media/file/<filename>` streams the object from the bucket, with range and ETag
    support), and adds `afterChange`/`afterDelete` hooks that upload and delete the file and
    every image size.
  - Image sizes: Payload still runs sharp on the server and keeps each size's buffer in
    `req.payloadUploadSizes` (`payload/dist/uploads/image-resizing/createImageSizes.js`); the
    adapter's `getIncomingFiles` uploads the original plus those sizes. This is for server
    uploads (`clientUploads` off); client uploads remain unconfirmed.
  - `staticDir` stays in the collection config but nothing is written there once enabled.
- next/image: `next.config.ts` already allows `localPatterns` `/api/media/file/**`, and
  `ImageMedia` renders the record's relative `url`, so Supabase hosts need no `remotePatterns`
  entry while `disablePayloadAccessControl` stays off. `VideoMedia` read `/media/<filename>`
  from `public/`; it now uses the record's `url`.
- Next.js 16.3.3 bundled docs
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`,
  read 21 Nov 2026): `export const maxDuration = <seconds>` in `route.ts`; "Deployment
  platforms can use `maxDuration` from the Next.js build output".
- `@payloadcms/db-postgres` 3.90.2 passes `args.pool` to `pg` unchanged and keeps it as
  `poolOptions` on the adapter (`dist/index.js`, read 21 Nov 2026).

### Unconfirmed points (from the research)

- Whether sharp image sizes are generated when `clientUploads: true` is used.
- That Payload uploads all image sizes on server uploads (from package source, not a doc page).
- Whether Supavisor transaction mode is safe for node-postgres unnamed statements in all cases.
- Whether `@payloadcms/db-postgres` exposes its `pg` Pool for `attachDatabasePool`.
- Whether Vercel build machines can reach IPv6-only Supabase direct connections.
- Whether Fluid compute is enabled on `pal-su-usg/binturong`, and the team's Vercel plan.
- Whether a `Response` from a `ReadableStream` with a fixed `Content-Length` counts as streamed for
  the 4.5 MB limit.
- Maximum `expiresIn` for Supabase signed download URLs.
- Exact pooler hostname format; copy it from the dashboard Connect panel.
- The Supabase project's plan (Free 50 MB versus Pro).
- Whether the `payload-migrations` table has a unique constraint on `name` that would stop a
  concurrent duplicate run.

## 5. Open questions for the owner

1. Vercel plan: Hobby (owner, 21 Nov 2026). Still open: is Fluid compute on for
   `pal-su-usg/binturong`?
2. Which Supabase plan will the production project use, and which plan is the dev project on?
3. Download duration: `maxDuration` 300 on the catch-all for Hobby (owner, 21 Nov 2026; built in
   Task V4). Still open: is 5 minutes enough, or move to Pro or Option B for 20 minutes?
4. Media storage (G11): answered 21 Nov 2026, Supabase S3 adapter (built in Task V1).
5. Production domain (G5), which sets `NEXT_PUBLIC_SERVER_URL`.
6. First admin: answered 21 Nov 2026 by `npm run create:first-account` (Step 5).
7. Who is the first super-admin (which person and email)?
8. Rate-limit numbers for `GET /api/documents/:id/file`: how many requests per IP per window?
9. Approve the `MIGRATION_DATABASE_URL` change to `vercel-build`, tested on dev first?
10. Approve the restore drill, and which backup file to use?
11. What backup schedule should production have, and where should offsite copies of the PDF
    manifest backup live?
