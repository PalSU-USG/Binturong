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

| File | Purpose |
| --- | --- |
| `.env` | Local application database, named `postgres` |
| `.env.test` | Local disposable database, named `binturong_test` |
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
its own server on loopback port 3003 and refuses to reuse an existing server.
Admin tests create and delete synthetic users in the test database.

## Access verification

Run `npm test` for integration and serial Chromium checks. The browser suite verifies
editor autosave, publisher publication, admin restrictions and revocation of an
existing browser session. It writes synthetic fixtures only to `binturong_test`.

Run the production-cache check separately:

```powershell
npm run test:e2e -- --config=playwright.production.config.ts
```

It builds against the guarded test environment and starts an isolated production
server on loopback port 3004. A temporary deferred trigger pauses one synthetic
withdrawal at COMMIT while public requests refill warmed caches; cleanup removes
the trigger/function and fixtures. Do not interrupt that test while its barrier is
held, or run another writer against the same test database. The ordinary development
server uses port 3003. Neither server reuses the owner's application on port 3000.

These checks verify access behavior, not the approved institutional design. Public
screens still use the Payload template; the design-system and shell slices follow.

## Domain verification

Apply all ten reviewed Payload migrations before running the domain workflow.
Keep automatic schema push disabled. Run the checks from the task checkout with
its private `.env.test`; a copied `.env` may still target an older branch schema.
Do not run a bare production build against that file. The production Playwright
command above loads and guards the test environment before building and starting.

```powershell
npm run test:int -- tests/int/domain-migrations.int.spec.ts
npm run test:e2e -- tests/e2e/domain.e2e.spec.ts tests/e2e/domain-transitions.e2e.spec.ts
npm test
npm exec -- tsc --noEmit --incremental false
npm run lint
npm exec -- eslint src/components/DomainTransitions/index.tsx tests/e2e/domain-transitions.e2e.spec.ts tests/int/domain-migrations.int.spec.ts tests/helpers/domainMigrations.mjs tests/e2e/domain.e2e.spec.ts tests/e2e/access.e2e.spec.ts --max-warnings=0
npm run test:e2e -- --config=playwright.production.config.ts
```

The migration suite requires local database-creation permission. After checking
the exact `binturong_test` source URL, it creates uniquely named
`binturong_domain_proof_fresh_*` and `binturong_domain_proof_populated_*` databases.
Only those generated destinations receive migration fixtures. Every run retains
them and prints their names for review; it never resets or drops an existing
database or runs a down migration. Their later removal needs a separate deliberate
cleanup. The populated case starts from the original baseline, retains a working
synthetic password verifier and Post author/URL, then adopts directory/formal-record,
number-normalization and audit migrations over retained records and history.
It verifies repeat no-op, database constraints, actual restricted-role denial and
rollback after additive DDL. This proves synthetic adoption, not hosted adoption
or the accuracy of real institutional content.

The browser workflow uses real editor/publisher login and native draft, lock
takeover and reviewed-publication controls. Editors save all seven domain types;
publishers publish metadata in reference order. It checks anonymous API output,
published/draft separation, denied editor transitions, visible formal-record field
errors, sealed document creation, keyboard actions and a 390px review drawer.
The separate transition suite covers stale displayed revisions, history/restore,
publisher scheduling and editor review without publisher-only scheduling requests.
Official PDF writes/delivery and official-record publication stay
blocked until the private-storage slice; these tests create no ready-file bypass.

Run writers serially, including the production-cache barrier test. Full lint still
has inherited Header/Card/Theme errors and migration/frontend warnings; record its
actual result separately from strict changed-file lint. Passing these checks does
not authorize storage, cloud adoption, integration, deployment or visual approval.

## First local super-admin

The account migration makes existing users active editors; it promotes nobody.
After the owner nominates an existing active account, run from its task checkout:

```powershell
npm run bootstrap:super-admin -- --user-id <reviewed-id>
npm run bootstrap:super-admin -- --user-id <reviewed-id> --apply
```

The first command validates and rolls back its transaction. The second saves the
promotion. Both require a local `binturong_domain` or `binturong_test` database on
port 55322. An existing active super-admin blocks bootstrapping another account;
repeating the same promotion changes nothing. Later account changes use normal
super-admin management. Public first-user registration is disabled. No real account
has been selected or promoted by this implementation.

Apply all reviewed Payload migrations first, including the account authority and
credential guards. They stop native authentication bookkeeping from restoring stale
roles, status, password verifiers, or revoked sessions during concurrent account
changes. The hidden authentication revision advances when those account controls
change, including a disable followed by re-enabling. Recover
valuable data using a reviewed backup or forward migration; do not remove these
guards while running this account implementation.

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

These counts describe the original baseline, not the current access slice.
Account migrations add roles, disabled status, authentication revisions and guards
only to the isolated local branch/test databases. Cloud has not received them;
current full schema parity is not claimed. Platform/security equivalence is also
unverified. Local PostgreSQL is 17.6 and cloud is 17.11. Cloud migration adoption,
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
