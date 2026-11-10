# Identity and homepage checkpoint

Branch `Hawksprey420/identity-home` on `dev` merge `d87070f`. Spec and plan:
`docs/superpowers/specs/2026-11-09-identity-home-design.md`, `docs/superpowers/plans/2026-11-09-identity-home.md`
(implementation refinements appended). No migration, schema change, dependency or lockfile change; nothing pushed.

Commits: `0319f56` tokens and neutral metadata, `126aa37` `src/home` queries (+ `listUpcomingActivities`),
`cff214f` front page route and components, `6773fce` browser tests, `9732180` lint tidy, plus plan/checkpoint docs.

Decisions: `/` is code-owned and `force-dynamic` (notice window and "upcoming" are clock-dependent, so no cache
to revalidate); the stored `home` Page is untouched and not rendered at `/`. Notice = newest published Post with
category slug `notice`, last 14 days, not future-dated. Upcoming = `eventDate` on/after the Asia/Manila date.
`--border` is a decorative divider; control boundaries use `--input` (3:1). New `(frontend)/error.tsx` boundary.

Mutation proof (`tests/int/home-data.int.spec.ts`): removing both `overrideAccess:false` and the published filter on
the post reads fails 3 tests (draft leaks into updates and notice, spy test); removing either alone fails the spy
test only (behavior still held by the other layer). Source restored.

Verified (binturong_test on 56323): see "Results" below. Not claimed: real brand colors, screen-reader testing.
Outstanding brand inputs: seal/logo, palette, typeface, favicon (still Payload's), share image, official site name.

Next action: coordinator's independent review, then integration through the integration worktree if authorized.

## Results (serial, binturong_test on 56323)

- Full int suite: 41 files / 514 tests; 513 passed, 1 timed out under load (`official-publication` "non-PDF stored bytes",
  60 s, machine memory-starved, 2927 s run); that file alone: 19/19 passed.
- Full browser suite: 55 passed. Production-cache suite: 3 passed. `npm run build`: succeeded.
- `tsc --noEmit --incremental false`: clean. Changed-file eslint: clean. Full lint: 5 errors / 12 warnings (baseline 5 / 14).
- Browser tests written after the implementation (int tests were RED first); `frontend.e2e` title/h1 expectation updated.
