# Placeholder Identity and Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.
> Implement inline in RED-first tasks with focused commits and one independent
> whole-slice review before integration.

**Goal:** Neutral, contrast-verified semantic tokens with no Payload branding, and a
front page built from real published content with honest empty states.

**Architecture:** One token file (brand, semantic, scale) consumed by existing
Tailwind/shadcn names; a read-only `src/home/` query module returning typed section
data; a server-rendered homepage that replaces the starter fallback at `/`.

**Tech Stack:** Existing Payload/Next/Tailwind/Vitest/Playwright baseline. No new
dependencies, fonts, migrations or lockfile changes.

**Spec:** [Identity and homepage design](../specs/2026-11-09-identity-home-design.md).
Status: approved; owner decisions settled (see spec). Implementation started 10 November 2026 on dev merge d87070f; the refinements below supersede the draft task text where they differ.

## Global constraints

- Worktree `C:/Users/Hawksprey/orca/workspaces/Binturong/identity-home`, branch
  `Hawksprey420/identity-home`, drafted on integrated `dev` `da406cf`.
- **Preconditions:** `Hawksprey420/navigation` and `Hawksprey420/public-search` are
  integrated into `dev` and this branch is rebased on that result. Re-read the final
  header/footer, `searchTargets` and `html` opacity handling before Task 1; do not
  redo or restyle them. If either is not integrated, stop.
- Preserve owner changes and private environments in other checkouts. No cloud
  changes, real-content import, publishing, migration, push or deployment.
- Use only the guarded `binturong_test` database on the documented test port, serially,
  with synthetic fixtures. Never sample colors from screenshots or recreate marks.
- Commits follow `docs/engineering-workflow.md#commits`; one task, one commit.

## Task 1: Token layers and contrast guard

**Files:** `tests/int/design-tokens.int.spec.ts` (new), `src/app/(frontend)/tokens.css`
(new), `globals.css`, `tailwind.config.mjs`, `Logo`, `mergeOpenGraph`, `layout.tsx`
metadata, `public/` default OG reference.

- [ ] **RED:** write the token test: parse `tokens.css`, resolve brand to semantic
  variables for light and dark, assert 4.5:1 for body/muted/link/primary/each status
  pair and 3:1 for focus ring and border; assert every `var(--x)` in frontend CSS and
  `tailwind.config.mjs` is defined; assert no raw hex/oklch in `src/components` or
  `src/blocks` class strings (allowlist none). Add a metadata test asserting no
  "Payload" string in `mergeOpenGraph()` output or layout metadata. Run and observe
  failures (`--text`, status pairs, Payload strings).
- [ ] Create `tokens.css` with the three layers and move `:root`/dark values into it
  with neutral placeholders and a header comment naming the brand inputs expected;
  add paired status foregrounds, `--radius: 0.25rem`, scale and size tokens.
- [ ] Replace `var(--text)` with `var(--foreground)`; replace the Payload `Logo` image
  with the text wordmark component only if navigation has not already (else delete the
  now-unused remote-image `Logo`); neutral metadata, remove `twitter.creator` and the
  default OG image.
- [ ] Verify: token test passes; mutation check, change one placeholder to a failing
  contrast value and see the test fail, then restore. Run existing frontend/e2e suites
  that cover the shell. Commit: `feat(design): add placeholder semantic tokens`.

## Task 2: Homepage data module

**Files:** `tests/int/home-data.int.spec.ts` (new), `src/home/getHomeData.ts` (new),
`src/home/types.ts` (new), reuse `src/search/searchTargets.ts`.

- [ ] **RED:** with synthetic published, draft, unpublished and scheduled-draft Posts
  and Activities, assert: published only; newest first; limit 5; categories exposed
  as labels only; past activities excluded and today included; Issuances/Reports
  omitted while their `live` flag is false; notice absent with no qualifying Post and
  present for an in-window "Notice" Post (per Open decision 1) and absent when older
  than the window; unauthenticated Local API call with `overrideAccess: false` is used
  (a draft is never returned even if it has the newest date); results contain no file
  URLs, storage keys or author identifiers; a failing query rejects rather than
  returning empty arrays. Run and observe failure (module absent).
- [ ] Implement `getHomeData()` with parallel, bounded, published-only queries,
  selecting public fields, returning typed plain objects. No catch-and-empty.
- [ ] Verify the focused test and public-boundary regressions
  (`public-boundaries`, `domain-publication`). Commit:
  `feat(home): query published front-page sections`.

## Task 3: Homepage rendering

**Files:** `tests/int/home-render.int.spec.tsx` or the existing component-test style
(new), `src/components/home/*` (new, small server components), `src/app/(frontend)/
[slug]/page.tsx`, `src/endpoints/seed/home-static.ts` (usage only).

- [ ] **RED:** render each section with empty and populated data and assert headings
  in the guide's order, a single `h1`, link targets from canonical slug paths, honest
  empty-state text, notice region absent when no data, no `#` or empty `href`, no
  card-per-record markup, escaped titles (a title containing markup renders as text),
  and no `homeStatic` starter copy at `/`. Observe failure.
- [ ] Implement flat `RecordRow`-style rows and section components using tokens only;
  Student Services/Transparency links come from the navigation global, omitting
  unresolved items. Route `/` to the new page and stop using the starter fallback;
  leave `/home` and stored Pages untouched per Open decision 3.
- [ ] Confirm revalidation: publishing, unpublishing and deleting a synthetic Post and
  Activity refresh `/` through the existing hooks; add the missing tag or path call if
  absent, with a test. Commit: `feat(home): render the institutional front page`.

## Task 4: Browser, accessibility and responsive proof

**Files:** `tests/e2e/home.e2e.spec.ts` (new); docs checkpoint only if the owner asks.

- [ ] **RED:** Playwright with synthetic data and with an empty database: at 320 px
  and 1280 px no horizontal overflow; tab order equals reading order; focus visible
  with at least 3:1; 200% zoom keeps content reachable; no console errors; with
  JavaScript disabled the page is visible (no `opacity: 0`); draft titles never appear
  in HTML. Observe failure before the page exists, then pass after Task 3.
- [ ] Use an accessibility scanner only if already installed; otherwise record a manual
  checklist and the limitation. Do not add dependencies.
- [ ] Run the broader frontend and integration suites to detect secondary regressions.
  Commit: `test(home): cover responsive and keyboard front-page behavior`.

## Final checks and review

- [ ] Run lint, type generation check, type check, `npm run test:int`, `npm run
  test:e2e` and `npm run build` in this worktree, serially. Record exact commands,
  results and skips.
- [ ] Confirm `git diff --stat` has no migration, lockfile or dependency change, no
  Payload string in public output, and no raw colors in components.
- [ ] Request one independent whole-slice review in the order of
  `docs/engineering-workflow.md#review-and-proof`: specification, evidence,
  compatibility, defects. Fix confirmed defects with regressions.
- [ ] Update the task checkpoint under `plans/` with commits, results, remaining dirty
  files and the next action. Integrate through the separate integration worktree only
  after the owner authorizes it.

## Risks to watch

- Navigation and this slice both touch `layout.tsx`, the wordmark and `globals.css`:
  rebase carefully and re-run the shell tests after.
- Placeholder neutrals can pass contrast yet look unfinished; that is accepted until
  brand inputs arrive. Real palette values must be re-run through the token test.
- Cached front page may show stale or briefly unpublished titles if revalidation is
  incomplete; Task 3 owns that proof.

## Implementation refinements (10 November 2026)

Preconditions are met: navigation (`Wordmark`, header/footer, opacity fix), `searchTargets`
and the record sections (`listRecords`, `listActivities`, `/archives`, `/transparency`,
`/activities`) are in `dev`. Differences from the draft above:

1. **Links.** The homepage links to Updates (`/posts`), Archives (`/archives`) and Activities
   (`/activities`) because those routes now exist. Issuance/Report rows appear only for
   collections whose `searchTargets` entry is `live`.
2. **Rendering mode.** `/` is `force-dynamic` like the record sections. The notice window
   (14 days) and "upcoming" depend on the clock, so a statically cached page would go stale
   with no publish event to revalidate it. No cache entry means no leak and nothing to revalidate.
3. **Reads.** `src/home/getHomeData.ts` reuses `listRecords`; upcoming activities add one
   query beside `listActivities`. Every read: `overrideAccess: false`, `draft: false`, an explicit
   `_status = published` filter. A spy test asserts both layers on every `find`; the mutation
   proof (remove both, test must fail) is recorded in the checkpoint.
4. **Notice.** Newest published Post with category slug `notice`, `publishedAt` within the last 14
   days (and not in the future). Absent otherwise.
5. **Upcoming.** `eventDate` on or after the Asia/Manila calendar date, soonest first. Events are
   stored as UTC midnight of their calendar date.
6. **Order of work (RED first each time):** (a) token + metadata guard tests then
   `tokens.css`; (b) `getHomeData` int tests then module; (c) render tests then components and
   `/` route; (d) Playwright 320/1280, keyboard, no-JS, draft absence. One commit per task.
7. **Border contrast.** `--border` is a decorative divider (exempt from WCAG 1.4.11); control
   boundaries use `--input`, asserted at 3:1.