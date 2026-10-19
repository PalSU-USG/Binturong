# Local Supabase and Payload

Binturong uses its own Supabase stack, separate from Bintanong. Run application
commands from `binturong-open-usg/`. Docker Desktop must be running.

## Services and environments

```powershell
supabase start
supabase status
```

The API is `http://127.0.0.1:55321`, PostgreSQL uses port `55322`, Studio is
`http://127.0.0.1:55323`, and the mail viewer is `http://127.0.0.1:55324`.
Treat the full status output as sensitive: it includes local credentials.

| File         | Purpose                                               |
| ------------ | ----------------------------------------------------- |
| `.env`       | Local application database, named `postgres`          |
| `.env.test`  | Local disposable database, named `binturong_test`     |
| `.env.cloud` | Preserved original hosted environment; reference only |

All three files are ignored by Git. Use the database credentials from your local
Supabase status. Give development, tests, and cloud different Payload, preview,
and cron secrets. Keep hosted credentials in deployment secrets; do not copy
them into tracked fixtures or paste them into commands.

For a fresh checkout, copy `.env.example` to `.env`, fill in the local credentials,
and create `.env.test` with a `DATABASE_URL` targeting
`127.0.0.1:55322/binturong_test`, its own `PAYLOAD_SECRET`, `PREVIEW_SECRET`,
`CRON_SECRET`, and `NEXT_PUBLIC_SERVER_URL=http://localhost:3000`.

## Application migrations

Payload owns its application tables and migration history. Automatic schema push
is disabled, so apply migrations before starting the app:

```powershell
npm run payload -- migrate
npm run dev
```

The initial migration is `20261019_151632_baseline`. It creates the existing
application schema on an empty database. A second migration run makes no changes.
After changing collection configuration, generate and review a new migration:

```powershell
npm run payload -- migrate:create describe_the_change
```

Keep the generated TypeScript, JSON snapshot, and migration index together. Do
not also manage these tables through `supabase db pull` / `supabase db push`.
Supabase configuration and future infrastructure provisioning have separate
responsibilities; they must not create a competing history for Payload tables.

## Test database

On first setup only, create the empty test database:

```powershell
docker exec supabase_db_binturong-open-usg psql -U postgres -d postgres -c "CREATE DATABASE binturong_test;"
```

If it already exists, preserve it and skip that command. With the shell's
`DATABASE_URL` unset, apply the same baseline using the test environment:

```powershell
node --env-file=.env.test --no-deprecation node_modules/payload/bin.js migrate
npm exec -- playwright install chromium
npm test
```

Both test runners load `.env.test` and reject hosted URLs, the development
database, other ports, and connection-string query overrides. Playwright starts
its own server on port 3000 and refuses to reuse an existing server. Admin tests
create and delete synthetic users in the test database.

## Hosted project and baseline adoption

The inspected hosted project reference is `ntzwpcnsjpijfhrgvvin`. CLI linking
requires an account with access to that project:

```powershell
supabase login
supabase link --project-ref ntzwpcnsjpijfhrgvvin
```

Linking does not synchronize schema or data. This checkout was linked successfully
after signing in with an account that can access the project. The app's hosted
database credentials were used for read-only inspection and snapshot export.

Do not run the initial migration against the existing hosted database. Its tables
already exist, while its migration history contains only the `dev` marker. A
one-time baseline adoption must first verify the complete schema again, preserve
recovery evidence, and reconcile that marker with the verified baseline without
executing its table-creation statements. That hosted write has not been performed.

Subsequent approved releases should apply the same reviewed Payload migrations
locally and in cloud. Review `supabase config diff` separately before any config
push; local URLs and defaults must not overwrite intentional hosted settings.

## Verified parity and remaining differences

On 19 October 2026, the generated local baseline matched cloud metadata exactly:
66 tables, 566 columns, 163 constraints, 310 indexes, and 69 enum values.

The subsequent authorized data copy imported 140 rows across 59 application tables
from one consistent cloud snapshot. It includes 4 pages, 3 posts, 4 media records,
6 categories, 2 CMS users, Header/Footer, relationships, versions, search, and
preferences. Per-table row counts and SHA-256 fingerprints matched after import,
including the stored user password verifiers. Actual password login was not tested.
This is a point-in-time development snapshot, not continuous synchronization.

The existing 32 original/derivative media files are present in `public/media` and
match the cloud-recorded file sizes. Local SHA-256 hashes were recorded privately;
cloud file checksums were unavailable, so equal file bytes were not independently
proven. Keep these ignored uploads when moving to another development checkout.

Active sessions, document locks, jobs, cache, and migration history were excluded.
All 39 sequence states were checked; five excluded runtime/migration counters were
restored from the pre-import backup after review found that the dump included them.
The dedicated test database and the owner's generated types were unchanged.

For another refresh, first preserve local edits and take a private backup. Recheck
the source project and exact local destination, schema compatibility, and media
availability. Export a consistent source snapshot; use native `pg_dump`/`psql` with
passwords passed through the environment, never command text. Exclude the runtime
tables above **and their sequences**. Import into an empty, prepared local target
under locks and one transaction, and compare counts/fingerprints before committing.
A nonempty target must stop for deliberate reconciliation, not be cleared by default.
Verify sequence state separately: PostgreSQL `setval` survives transaction rollback,
so failed imports require explicit sequence recovery from the backup. Do not replay
the data dump into an already populated database or run the seed endpoint there.

Private exports contain account credential material. Keep exports, recovery SQL,
row fingerprints, and raw logs outside Git. Preserve separate environment secrets;
do not copy cloud sessions or send development mail through production delivery.
The one-off transfer used private temporary files; no reusable refresh command or
scheduled synchronization is installed.

After the copy, `npm run build` passed. A temporary production server on loopback
port 3002 returned 200 for seven published routes/indexes and served all 32 media
files with matching local hashes. This does not verify visual appearance or login.

This establishes application schema parity, not complete platform or security
equivalence. Local PostgreSQL is 17.6 and cloud is 17.11. Cloud migration adoption,
grants/RLS hardening, durable storage, and bucket provisioning remain outstanding.
The read-only `supabase config diff` also reported 14 settings differences: auth
redirects, email/OTP and MFA behavior, SMS, pooler limits, and vector storage.
Some reflect local addresses or unsupported settings; review the others before
claiming configuration parity. No hosted config push was performed.
The inspected cloud has no buckets, broad Data API role grants, and no RLS on
its application tables. Do not treat reproducing that baseline as securing it.

Vector log collectors currently restart on both local stacks because their Docker
log connection is refused. Core Supabase services remain running. Full application
lint also reports existing React hook/ref errors in Header, Card, and Theme code.
