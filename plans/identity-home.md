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

## Review fixes (P2/P3), commits `53f9006` and `0fd4287`

Header reference links resolve (Header read at depth 1; published Page shown, draft Page hidden), `--color-link` and
`--color-status-*` mapped in `@theme` with a guard test, publish instants shown in Asia/Manila (date-only values as
stored, `instant` flag on entries), posts titles and `generateTitle` use `siteName` with no double suffix (stored
`meta.title` values written earlier keep their old suffix until re-saved), root error boundary neutral with
`router.refresh()` + `reset()` in `startTransition`, `/` always in the pages sitemap (stored `home` Page no longer
listed), future-dated posts excluded from Latest updates, noon-UTC date-only comment and fixture, layout newline.
`/home` and `homeStatic` untouched. Left: P3 #6, #10, #11.

Re-run results: full int suite 42 files / 526 passed; full browser suite 55 passed; production-cache 3 passed;
`npm run build` succeeded; tsc clean; changed-file eslint clean; full lint 5 errors / 12 warnings (baseline 5 / 14).

## PalSU / Project Akademya realignment (`Hawksprey420/home-akademya` on `1b52772`)

Reworked the public shell and `/` after owner review against the FigJam requirements board and Project Akademya Figma:
- Commits `1012733`, `1b9eadd`, `afef4a4`, plus vendored League Spartan variable font, SSR header/footer landmark fixes and `home.e2e.spec.ts` revalidation fix.
- `/home` redirects to `/` outside draft mode (`src/app/(frontend)/[slug]/page.tsx`); Latest updates mixes posts, issuances and reports from the last 30 days with bordered uppercase tags and `Read →` / `Record →` / `PDF ↓` links (`src/home/getHomeData.ts`, `src/components/home/HomeSections.tsx`).
- Shell uses `#B4440C` PalSU authority band with seal (`public/brand/palsu-seal.png`), `#853107` deep-rust navband/footer with `#BD8C0F` gold rule, campus gate hero (`public/brand/campus-gate.png`) with 90% deep-rust statement band, and `#E0CB1C` official notice band.
- Verified on `56323/binturong_test`: 58/58 browser e2e passed (`home.e2e.spec.ts` 8/8, `navigation.e2e.spec.ts` 24/24), production-cache 3/3 passed (`npm run build` succeeded), `tsc --noEmit --incremental false` clean, changed-file eslint clean, full lint 5 errors / 12 warnings (baseline). Screenshots verified at 1280×900, 390×844 and full-page.
