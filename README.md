# Binturong

Binturong is the public website and content management system for the University Student Government (USG) of Palawan State University (PalSU). One application serves both the public site and the staff admin.

**Status: in development. Nothing is deployed.** There is no production or staging site, and the hosted Supabase project is paused. The repository runs locally only.

## What it does

Public site:

- Updates (posts) and pages
- Student services
- Records and archives: issuances, reports, activities
- Transparency section
- Government directory: offices, organizations, people
- Search across published content
- Private documents (PDFs) held in private storage and delivered through the app

Staff admin, built on the Payload admin panel:

- Role-based editing with four roles: `editor`, `publisher`, `admin`, `super_admin`
- Editors save drafts. Publishers and higher roles publish, withdraw, restore and schedule.
- Published pages and posts cannot be hard-deleted.
- Public requests see published content only. Preview requires a signed-in staff account.

The roles and publishing rules are enforced on the server. See [binturong-open-usg/AGENTS.md](binturong-open-usg/AGENTS.md) for the invariants.

Parts of the app still contain Payload website-template content. Check the code and [plans/product-alignment.md](plans/product-alignment.md) before treating any template page as a requirement.

## Stack

Versions come from `binturong-open-usg/package.json`.

| Part | Version |
| --- | --- |
| Payload CMS (`payload`, `@payloadcms/*`) | 3.90.2 |
| Next.js | 16.3.3 |
| React | 19.2.6 |
| TypeScript | 5.7.3 |
| Tailwind CSS | 4.x |
| Database | PostgreSQL through `@payloadcms/db-postgres` (local Supabase runs 17.6) |
| Tests | Vitest 4.0.18 (integration), Playwright 1.58.2 (browser) |
| Node.js | 20.18.1 or newer; the setup was verified on 22.22.3 |

## Repository layout

```text
AGENTS.md                  Engineering rules for the workspace
docs/                      Design guide, engineering workflow, local setup
plans/                     Task checkpoints and the product alignment record
binturong-open-usg/        The application
  src/payload.config.ts    Collections, globals, plugins, database adapter
  src/collections/         Content schemas
  src/access/              Authorization
  src/migrations/          Payload migrations (PostgreSQL schema history)
  src/app/(frontend)/      Public pages
  src/app/(payload)/       Admin and REST/GraphQL routes
  scripts/                 Super-admin bootstrap, document manifest
  tests/                   Integration (int), browser (e2e), production-cache tests
  supabase/                Local Supabase configuration
```

## Local setup

Run application commands from `binturong-open-usg/`. You need Node.js, npm, Docker Desktop and the Supabase CLI. The full procedure, including fallback ports and hosted-database notes, is in [docs/local-development.md](docs/local-development.md). The commands below are PowerShell.

1. Install dependencies with npm. The tracked lockfile is `package-lock.json`.

   ```powershell
   cd binturong-open-usg
   npm install
   ```

2. Start local Supabase. It provides PostgreSQL on port 55322. The status output includes local credentials, so do not paste it anywhere.

   ```powershell
   supabase start
   supabase status
   ```

3. Create the environment files. All of them are ignored by Git. You create `.env` and `.env.test`. `.env.cloud` is a reference copy that may already exist in your checkout.

   | File | Purpose |
   | --- | --- |
   | `.env` | Development. Copy `.env.example` and fill in the local database password and three secrets. |
   | `.env.test` | Disposable test database `binturong_test`. Needs its own `DATABASE_URL`, `PAYLOAD_SECRET`, `PREVIEW_SECRET`, `CRON_SECRET`. |
   | `.env.cloud` | Reference copy of the original hosted environment. Do not use it for development. |

   Use different secrets in each file. Never commit them.

4. Apply migrations. Automatic schema push is disabled (`push: false`), so an empty database has no tables until you migrate.

   ```powershell
   npm run payload -- migrate
   npm run dev
   ```

   The dev server runs at `http://localhost:3000`.

5. Optional: promote one existing account to `super_admin`. Public first-user registration is disabled. Run the dry run first, then `--apply`. It works only against a local `binturong_domain` or `binturong_test` database on port 55322, 56322 or 56323.

   ```powershell
   npm run bootstrap:super-admin -- --user-id <id>
   npm run bootstrap:super-admin -- --user-id <id> --apply
   ```

### Test database safety

- Tests load `.env.test`. The runners refuse any target other than the local `binturong_test` database on port 55322, 56322 or 56323. They also reject hosted URLs, the development database and connection-string overrides.
- First-time setup creates the empty test database, then migrates it. Unset `DATABASE_URL` in your shell first. A value already set there overrides `--env-file`, and this direct command skips the test-runner guard.

  ```powershell
  docker exec supabase_db_binturong-open-usg psql -U postgres -d postgres -c "CREATE DATABASE binturong_test;"
  node --env-file=.env.test --no-deprecation node_modules/payload/bin.js migrate
  npm exec -- playwright install chromium
  ```

- Playwright starts its own server on port 3003 and will not reuse a running one.
- Browser tests create and delete synthetic users. The template seed code clears collections, although the seed endpoint currently denies every request. Never run either against data you want to keep.
- Run database-writing suites one at a time.

## Scripts

Run from `binturong-open-usg/`.

| Task | Command |
| --- | --- |
| Lint | `npm run lint` |
| Type check | `npm exec -- tsc --noEmit` |
| Integration tests | `npm run test:int` |
| Browser tests | `npm run test:e2e` |
| Integration, then browser | `npm test` |
| Production build | `npm run build` |
| Regenerate Payload types | `npm run generate:types` |
| Regenerate admin import map | `npm run generate:importmap` |
| Payload CLI (migrations) | `npm run payload -- <command>` |
| Document manifest check | `npm run documents:manifest` |
| Super-admin bootstrap | `npm run bootstrap:super-admin` |

Known traps:

- `npm run dev:prod`, `ii` and `reinstall` depend on pnpm, and `dev:prod` and `reinstall` also call `rm`. The project uses npm. Do not use them.
- `docker-compose.yml` and `Dockerfile` come from the Payload template and do not match this project. The compose file defines MongoDB and uses yarn.
- Full `npm run lint` reports existing errors in Header, Card and Theme code. Lint the files you changed and record the full result separately.
- After schema changes, run `npm run generate:types`. After changing admin component registrations, run `npm run generate:importmap`.
- To change a Payload collection, create a migration: `npm run payload -- migrate:create <name>`. Keep applied migrations unchanged and correct them with new ones.

## Contributing

The binding rules are in [AGENTS.md](AGENTS.md) and [docs/engineering-workflow.md](docs/engineering-workflow.md):

- Work on a task branch, in its own worktree. Do not commit to `main`.
- Write a failing test for a behavior change before the fix. Test denied access, invalid input, duplicate writes and retries where they apply.
- Use `type(scope): summary` commit messages, such as `fix(access): enforce permissions on user-scoped reads`. Keep commits small and verified. Stage explicit paths, not `git add .`.
- Get an independent review before integration. Integrate approved work in a separate integration worktree.
- Push only reviewed branches, with a normal fast-forward push. Do not push to `main` without review.
- Never commit `.env*` files, secrets, private uploads or production exports. Use synthetic data in tests.
- For UI work, read [docs/design.md](docs/design.md) first.

## Project status

Integrated on the local `dev` branch: account roles and publishing access, domain content types, private document storage, public search, navigation, record sections, and the code-owned home page. The current checkpoint and open follow-ups are in [plans/product-alignment.md](plans/product-alignment.md).

Pending:

- Admin usability work, then integration of its migration
- Owner-supplied content: brand seal, logo, palette, section introductions, office branches and commission data
- Moving the hosted Supabase database onto the migration history. Hosted baseline adoption has not been done, and the hosted project is paused.
- Production storage bucket, rate limiting for document downloads, and real document uploads
- Any deployment

## Documentation

- [AGENTS.md](AGENTS.md): engineering rules
- [binturong-open-usg/AGENTS.md](binturong-open-usg/AGENTS.md): app architecture and invariants
- [docs/local-development.md](docs/local-development.md): local Supabase, test databases, migrations, storage
- [docs/engineering-workflow.md](docs/engineering-workflow.md): commits, review, pushes, contracts
- [docs/design.md](docs/design.md) and [docs/design-architecture-findings.md](docs/design-architecture-findings.md): design guide and rationale
- [plans/product-alignment.md](plans/product-alignment.md): product alignment and current checkpoint
