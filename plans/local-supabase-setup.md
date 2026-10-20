# Local Supabase setup

## Goal and settled decisions

Reproduce Binturong's hosted application schema locally using Payload migrations.
Keep cloud records intact and use a separate local database for tests. Payload
owns its tables; Supabase CLI owns local services. Keep one migration authority.

Approved product decisions remain editors/publishers, private draft files, and
equivalent local/cloud structure. The user explicitly chose to copy hosted CMS
users and password verifiers with content. Environment secrets and active sessions
remain separate; tests retain their own synthetic database. Domain collections and
visual implementation follow this setup.

## Phase log and current state

- Working tree: `dev`, original base `c9717ed`. Workflow enforcement was committed
  at `1fac880`; local worktree ignores at `f72edf2`; setup at `c8b1a54`; lint loading
  at `b151180`. This checkpoint's data-copy update is a documentation-only commit;
  private exports and account data are never staged. No push made.
- Owner changes preserved: `src/payload-types.ts` is byte-identical to its initial
  state; the owner's initialized `supabase/` directory now uses separate ports.
- Phase 0 completed: repository, linked design sources, and cloud reconnaissance.
  Hosted PostgreSQL 17.11 has 66 public tables and only the Payload `dev` marker.
- Phase 1 completed for local setup: baseline through Payload, disabled automatic
  schema push, separate test database, metadata comparison, and local documentation.
- Phase 2 local setup implemented: `20261019_151632_baseline` applied to local
  `postgres` and `binturong_test`. A repeated local migration run is a no-op.
- Local app, tests, and preserved cloud environment are separate ignored files
  with distinct Payload/preview/cron secrets. Tests reject unsafe connection URLs
  and Playwright starts its own server rather than reusing one.
- Cloud CLI link succeeded after login: project `ntzwpcnsjpijfhrgvvin`.
- Binturong core services run on `5532x`; Bintanong remains running on `5432x`.
- Bintanong-derived commit/review practices were already adopted. Added explicit
  destination, outgoing-range, fast-forward, and remote verification steps for
  authorized pushes; updated app instructions to match the actual test setup.
- No cloud schema, migration history, content, or permissions have been changed.
- Data-copy execution completed: 140 rows across 59 included tables match one cloud
  snapshot by count and SHA-256 row fingerprint. Includes hosted CMS accounts and
  password verifiers, versions, relationships, preferences, and search. Runtime
  sessions/locks/jobs/cache and local migration history remain environment-specific.
- Independent transfer review caught excluded sequence counters in the native dump.
  Restored five from the local backup; verified all 39 sequence states separately.
  Table import used a locked empty-target guard and transaction; a deliberately
  failed write probe rolled back. Sequence rollback requires explicit recovery.
- All 32 referenced media files exist and match recorded sizes; private local hashes
  saved. No cloud file-checksum comparison or real-password login was possible.
- Post-copy `npm run build` passed against the populated development database. The
  test database and owner's generated types remain unchanged. No new product code.
- Production HTTP smoke on loopback port 3002: seven published routes/indexes
  returned 200; all 32 media responses matched local SHA-256 hashes. This checks
  delivery, not visual layout or actual password login.
- Retry guard exercised against the populated target: import rejected before
  export/import. Final fingerprints reconfirmed all 66 development/test tables;
  both Supabase databases remain healthy on their separate ports.

## Verification on 19 October 2026

- Read-only cloud metadata recheck: exact match with generated local schema and
  original cloud snapshot: 66 tables, 566 columns, 163 constraints, 310 indexes,
  and 69 enum values. Cloud counts remain 4 pages, 3 posts, 4 media, 2 users,
  and 6 categories. At that inspection, records had not yet been copied locally;
  the later copy and verification are recorded in the current state above.
- `npm test`: 10 integration tests and 4 Chromium browser tests passed. Guard
  regression observed RED (8 failures) before implementation, then GREEN.
  Rechecked before committing the pending setup: the same 10 + 4 tests passed.
- An actual integration-runner invocation with an inherited synthetic hosted URL
  failed at the database guard before Payload initialized, as intended.
- `npm exec -- tsc --noEmit --incremental false`: passed.
- `npm run build`: passed, including type checking and sitemap generation.
- ESLint config now loads through installed Next flat exports. Full lint reports
  5 existing hook/ref errors in Header, Card, and Theme code; these files were
  not changed. This setup does not establish application-wide lint cleanliness.
- Independent code review: no blockers; reviewer verified safe/unsafe URL cases
  separately. Its only finding was stale checkpoint text, reconciled here.
- Changed-code ESLint: no errors, 4 unused-argument warnings in generated migration
  code. Prettier checks and `git diff --check` passed. All environment files and
  Supabase temporary credentials/link metadata are Git-ignored.

## Remaining boundaries

Local PostgreSQL is 17.6 versus cloud 17.11. Exact platform/config/security parity
is not established. Read-only `supabase config diff` reports 14 differences in
auth/email/MFA/SMS, pooler, and vector-storage settings; review these separately
before any config push. Both Vector log collectors restart due to their Docker log
connection; core services remain healthy. Cloud has broad grants, no application
table RLS, and no buckets. This baseline preserves structure, not security approval.

The cloud contains existing tables and only a `dev` marker. Running the baseline
there would attempt to recreate those tables. Hosted adoption requires a reviewed
one-time migration-history reconciliation and recovery procedure first. Storage,
role authorization, domain collections, and public UI remain subsequent slices.

## Next action

Resume the written domain/publication spec review in `.worktrees/domain-publication`
before writing its implementation plan. Before any later cloud migration release,
review the one-time baseline-history adoption and recovery procedure; never execute
baseline table-creation SQL on the existing hosted database.

Setup commands and limits: [local development](../docs/local-development.md).
