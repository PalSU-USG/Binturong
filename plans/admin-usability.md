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
- Production-cache suite (port 3004): 3 passed. `npm run build`: compiled successfully (exit 0).

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

## Final verification (15 Nov 2026, after merging `dev` at `4bcf88c`)

- No schema drift (`migrate:create` found no changes), so `last_edited_by` stays the last
  migration. Types regenerated; tsc clean.
- Int: 588 passed; the merged `design-tokens` test failed on Payload admin variables
  (`--theme-*`, `--base`) and now allows them, then passes.
- Browser: 65 of 67 on the full run; the 2 home failures came from 6 leftover synthetic
  posts (10 Nov) in the 56322 test DB, deleted; home rerun 9 of 9. Build: exit 0.
- Sonnet review: no P0/P1. Follow-ups: move the `preserveLastEditedBy` WeakMap to
  `req.context`; the how-to guard sends disabled accounts to login without a message.

## Next action

Owner runs the hallway test (script above) with a real staff member and records answers
in this note.
