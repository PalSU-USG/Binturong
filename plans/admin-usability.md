# Admin usability checkpoint

Branch `Hawksprey420/admin-usability` (worktree `C:/Users/Hawksprey/orca/workspaces/Binturong/admin-usability`),
base: `dev` merge `ad5eb8e`. Spec: `docs/superpowers/specs/2026-11-09-admin-usability-design.md`
(implementation record at the end). Plan: `docs/superpowers/plans/2026-11-09-admin-usability.md`.
Hallway test: `docs/superpowers/plans/2026-11-09-admin-usability-hallway-test.md`.

## Commits

- `edb5aa6` feat(admin): plain-language admin with task home, status panel and lastEditedBy
- `5f4aea3` fix(admin): keep publication audit fields mounted outside the collapsed section
- (docs commit with this note, spec record, hallway script, plan)

## Verified results (test DB `binturong_test` on 56322 only)

- Int suite, serial: 459 tests, 42 files, all pass after clearing leaked synthetic users
  from interrupted earlier runs (those leftovers, not code, had failed the account tests).
  `domain-migrations` now asserts 14 migrations plus the last-saved-by upgrade and `down()`.
- Browser suite (full): 52 passed, 2 failed before the audit-field fix. The two
  (`domain` and `domain-transitions` e2e) pass after it; targeted rerun of domain,
  domain-transitions and admin-usability: 10 passed.
- tsc `--noEmit --incremental false`: clean. Full lint: 5 errors / 14 warnings (the inherited
  baseline). Changed files: clean.
- Production-cache suite and `npm run build`: see the final report (run last under the lock).

## Decisions and deviations

See the spec's implementation record. Main ones: custom dashboard view instead of
experimental widgets; domain review drawer wording kept (existing browser tests assert it);
slug not read-only for editors; `lastEditedBy` means "last saved", not "last published".

## Merge note

This slice merges LAST. Its migration `20261110_152826_last_edited_by` was generated on the
schema at `ad5eb8e`. If another slice adds a migration first, regenerate it with
`npm run payload -- migrate:create last_edited_by` on the final schema, reconcile
`src/migrations/index.ts`, update the count in `tests/helpers/domainMigrations.mjs` and
`tests/int/domain-migrations.int.spec.ts`, and rerun `generate:types` / `generate:importmap`.
Collection order in `src/payload.config.ts` sets the menu group order; keep it.

## Next action

Owner runs the hallway test (script above) with a real staff member and records answers
in this note. Independent reviewer: see "Review focus" in the plan.
