# Public search task note

Branch `Hawksprey420/public-search` (base `dev` `da406cf`). Spec and plan:
`docs/superpowers/specs/2026-11-09-public-search-design.md`,
`docs/superpowers/plans/2026-11-09-public-search.md`. Owner decisions 1-4 are in the spec.

## State

Implemented and verified on the guarded `binturong_test` database (127.0.0.1:56322). Nothing
pushed or integrated. Commits: pure helpers `8ab1bed`, index model and migration `53fd4c8`,
page and query module `905b9dd`. The independent whole-slice review is not done.

## Verified (synthetic data, serial)

- `npm run test:int`: 22 files, 240 tests passed. `npm run test:e2e`: 18 passed (6 are search).
- `npx tsc --noEmit`: clean. `npm run build`: passes with `.env.test` loaded.
- `npm run lint`: 5 errors, all in untouched Header, Card and Theme files (pre-existing). Changed
  files are clean apart from generated-migration unused-argument warnings, as in earlier migrations.
- Migration `20261108_202329_search_index_fields` (additive): fresh and populated proofs pass in
  `domain-migrations.int.spec.ts` (eleven migrations, repeat no-op, an existing search row survives,
  `sort_at` backfilled from `created_at`). Applied to `binturong_test` with `payload migrate`.
- Mutation: replacing the per-collection published predicate with `true` fails the new stale-row
  tests and two existing `public-boundaries` tests; restored afterwards.
- EXPLAIN (ANALYZE) on 5,000 synthetic Post rows (rolled-back transaction, hand-written SQL that
  mirrors the Payload join): 0.12 ms for a page of 12 via `search_sort_at_idx`; an `ilike` count
  over the set 4.9 ms. No extra index added. Not measured through Payload end to end.

## Findings

- `doc.relationTo` accepts `equals` only (`in` throws a QueryError); `relationIn` builds an `or`.
- Official Issuance and Report publication is sealed, so their index behaviour is tested with rows
  written below the hooks plus the authorized reindex. Hook-driven withdraw, restore and scheduled
  sync for those two collections is unverified. Posts are verified through publish, draft save,
  republish, withdraw, delete and `restoreVersion`. Scheduled publish is not exercised.
- Payload reports no totals past the last page, so `runSearch` counts to offer a page-1 link.
- The error state is verified at page level (a failed query rejects, so `error.tsx` renders); no
  browser test forces a server-side failure.

## Unverified

200% zoom and visual match to the design guide; keyboard order beyond a Tab smoke check; behaviour
at real content volume; `/issuances` and `/reports` routes (not live, so results stay hidden).

## Next action

Run the independent whole-slice review against the spec's review focus, then ask the owner to
authorize integration. If `Hawksprey420/private-documents` integrates first, regenerate this
migration and snapshot on top of it and re-run `domain-migrations.int.spec.ts`.