# Phase 3 launch path: implementation plan

**Status: approved 21 Nov 2026 (owner: "Go."). Owner gates in section 2 still apply per task.**
It replaces queue items 3–6 of `plans/codex-handoff-2026-11-20.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reach the Phase 3 finish line: a staff editor, with no help, saves one real resolution
and one real memorandum, a publisher makes them live, and both show correctly on the production
site.

**Architecture:** No new subsystems. Merge three finished branches, then one `launch-fixes`
branch (public site), one `admin-slice-2` branch (admin home and labels), one `memo-pages` branch
(Executive archive page and citation line), one `ops-tests` branch (two pre-existing test
failures), one `cloud-ready` branch (media storage, pool size, download duration) so every
merge builds and runs on Vercel + Supabase cloud. Production setup and the trials are owner-run
steps with a written runbook.

**Tech stack:** Payload CMS 3.90.2, Next.js 16, React, TypeScript, Tailwind, PostgreSQL (Docker
locally, Supabase in production), Vitest (`npm run test:int`), Playwright (`npm run test:e2e`),
Vercel.

---

## 0. Why this plan exists

Decided (owner's exact words):

| Date | Owner said | What it decides |
| --- | --- | --- |
| 20 Nov 2026 | "Go for it for now" | Phase 3 = launch readiness. Finish line above. |
| 20 Nov 2026 | "You could go, although you need to give me UI/UX recommendations + layout in markdown" | Admin direction C (research note section 4a on `Hawksprey420/admin-research`). |
| 20 Nov 2026 | "I think you need to apply anti-slop design stuff." / "All from the beginning" / "Whole site" | antislop rules apply to all UI work; audit 001 is the finding list. |
| 20 Nov 2026 | "lets stick with the plan for now" (on the GPOA "DIGITAL USG PORTAL: Official Launching Activity") | No scope change from the GPOA entry. Its date, if known, is the deadline. |
| 21 Nov 2026 | "No need for the banderitas actually" | Character idea 5 (bunting) is dropped. |

Proposed in this plan (prompted by the owner's questions, not yet approved):

| Date | Owner asked | Proposal |
| --- | --- | --- |
| 21 Nov 2026 | "What's the master plan? I feel like we're going off tangent" | Cut work to the finish line; park the rest (section 9). |
| 21 Nov 2026 | "can you try to identify them.. if we can actually port some of them to phase 3?" | Port the small items in Phases B–E and G. |
| 21 Nov 2026 | "The admin usability?" | Admin slice 2 and a cut-down slice 4 join Phase 3, because the trial happens in the admin. |

Correction recorded while planning: the admin home already has an "Add an issuance" task card
(`src/admin/dashboard/index.tsx:83-87`), so slice 4's "+ New" already exists on the home page.
Slice 4 is cut to one "View the site" link (Task C3).

## 1. Rules every worker follows

- Read `AGENTS.md`, `binturong-open-usg/AGENTS.md`, `docs/engineering-workflow.md` and, for UI,
  `docs/design.md`. UI work also follows the antislop core + `antislop-ui` rules: no decoration
  without a written reason, no arrows by default, orange only on the header band and one key
  action.
- Worktrees live under `C:/Users/Hawksprey/orca/workspaces/Binturong/`. One branch per task
  group, named `Hawksprey420/<name>`, cut from `dev` **after** Phase A merges.
- Shell is PowerShell. Git Bash cannot fork on this machine; for a POSIX one-liner use
  `& 'C:\Program Files\Git\usr\bin\sh.exe' -c '...'`. Do not change ASLR settings or PATH.
- Memory is tight. At most two workers at once, and only one running a build, `test:int` or
  `test:e2e` at a time. Before such a run, create
  `C:/Users/Hawksprey/orca/workspaces/Binturong/.e2e-lock`; delete it in a `finally`. If it
  exists, wait.
- Tests use only `binturong_test` (`.env.test`, port 45323). Never write test data to
  `binturong_domain`. Copy `.env.test` from an existing worktree; never commit `.env*`.
- Browser tests start their own server on :3003 and need a real `node_modules` (`npm ci`).
- Commits: conventional commits, explicit `git add <paths>`, no AI credit or `Co-Authored-By`
  lines. Do not commit CRLF-only noise in `src/payload-types.ts` or `tsconfig.tsbuildinfo`.
- **Stop and ask the owner** before: deleting data in `binturong_domain`, running migrations on
  it, pushing, deploying, any Supabase or Vercel dashboard change, or a public ngrok tunnel
  (only with `--basic-auth`). Never Docker "Reset to factory defaults".
- Do not restart a dev server that was killed for low memory unless the owner asks.
- Each task ends with an independent reviewer (read-only) verdict: MERGE OK / WITH FOLLOW-UPS /
  DO NOT MERGE. The coordinator merges into `dev` locally; pushing needs owner approval.

Run commands from `binturong-open-usg/` inside the worktree:

```powershell
npm run test:int -- tests/int/<file>.int.spec.ts   # one file
npx tsc --noEmit
npm run lint
npm run test:e2e -- tests/e2e/<file>.e2e.spec.ts   # one browser file (takes the lock)
```

## 2. Owner gates (answers needed; tasks wait on them, others proceed)

| Gate | Question | Blocks |
| --- | --- | --- |
| G1 | OK to delete the three Payload demo posts and their media from `binturong_domain`? | B9 |
| G2 | Empty home sections: hide while empty, or keep the "nothing published yet" lines? | B8 |
| G3 | OK to run `npm run payload -- migrate` on `binturong_domain` after the autosave merge? | A2 step 4 |
| G4 | Executive orders page now or later? (Memoranda are built either way.) | D1 scope |
| G5 | Production domain. The memo letterhead gives `usg.psu.edu.ph`; usable only once the owner confirms it | G-tasks (official strip), V5 |
| G6 | Contact email for "Report a problem with this page". The letterhead gives `usg@psu.palawan.edu.ph`; usable only once the owner confirms it | G-tasks (report link) |
| G7 | Date of the GPOA launching activity, if known | Schedule only |
| G8 | Approve the executive-pages draft (`plans/codex-handoff-2026-11-20.md`, "Draft for the owner"): one route per record type, Memoranda at `/archives/executive/memoranda`. The recorded decision is "draft only; do not build until the owner answers". | D1 |
| G9 | Citation wording. The owner's sample reads "Memo 023, s. A.Y. 2026-2027" (file `Memo-23-s.-26-27.pdf`), not "s. 2026". Show the memo's own series line and the proposed rendering; the owner picks. | D2 |
| G11 | Media storage adapter (a new dependency) chosen from V0's research | V1 |
| G12 | Each push to GitHub `dev` (it triggers the Vercel Preview build on Supabase cloud) | V6 |
| G10 | Dry-run database: `binturong_test` or a scratch copy restored from the `binturong_domain` backup (recommended; it doubles as the restore drill). Test records never go into `binturong_domain`. | F |

---

## Phase A: merge what is already built

### Task A1: Branding (`Hawksprey420/usg-branding`, `2cc4ce5`)

**Files:** none changed unless a check fails.

- [ ] **Step 1:** Make sure no dev server is running from the `usg-branding` worktree (port 3001).
      If one is, ask the owner before stopping it (they may be previewing it).
- [ ] **Step 2:** Take the lock, then in `usg-branding/binturong-open-usg` run `npm run build`.
      Expected: build succeeds.
- [ ] **Step 3:** Run `npm run test:int`, then `npm run test:e2e`. Expected: all pass except the
      known pre-existing failures (`admin-usability` "waiting list"; GraphQL `domain-schema` /
      `domain-references` `[]` expectations). Record exact counts.
- [ ] **Step 4:** Reviewer pass, then merge into `dev` locally:
      `git -C C:/Users/Hawksprey/Binturong merge --no-ff Hawksprey420/usg-branding`.

### Task A2: Draft autosave (`Hawksprey420/draft-autosave`, `c6cf459`)

- [ ] **Step 1:** Reviewer pass on the branch diff (`git diff dev...Hawksprey420/draft-autosave`).
      Check: Pages/Posts `autosave: false`; migration `20261119_162009_draft_autosave_off`
      drops and `down()` restores the `autosave` column and index on `_pages_v` / `_posts_v`.
- [ ] **Step 2:** Rebase or merge `dev` into the branch if A1 landed first; re-run
      `npm run test:int -- tests/int/admin-config.int.spec.ts tests/int/domain-migrations.int.spec.ts`.
      Expected: 13/13 and 2/2.
- [ ] **Step 3:** Merge into `dev` locally.
- [ ] **Step 4 (G3):** With owner approval, from the main checkout:
      `npm run payload -- migrate` against `binturong_domain`. Expected output lists
      `20261119_162009_draft_autosave_off` as applied.

### Task A3: Admin slice 1 (`Hawksprey420/admin-status-links`, `e27d5e9`, worktree `resolutions-archive`)

- [ ] **Step 1:** Reviewer pass. Focus: counts read as the signed-in account
      (`overrideAccess: false`), a failed count shows `adminCopy.stateCountError` (never 0),
      links are plain anchors and `currentStatus` accepts both URL shapes.
- [ ] **Step 2:** Re-run `npm run test:int -- tests/int/admin-state-links.int.spec.ts` (4/4) and
      the e2e test "list state links open filtered lists whose size matches the count".
- [ ] **Step 3:** Merge into `dev` locally. Regenerate `src/app/(payload)/admin/importMap.js`
      only if the merge conflicts on it (`npm run generate:importmap`).

---

## Phase B: launch fixes (branch `Hawksprey420/launch-fixes` from `dev`)

### Task B1: Honest empty state on record lists (audit 12)

**Files:**
- Modify: `src/components/records/RecordList.tsx:18-42`
- Test: `tests/int/record-list-pages.int.spec.ts:114-120`

- [ ] **Step 1: Change the failing test** (replace the existing `shows_an_empty_state...` test):

```ts
  it('shows_an_empty_state_with_clear_filters_only_when_filtered', async () => {
    listRecords.mockResolvedValue(list({ rows: [], total: 0, pageCount: 0 }))
    const filtered = await page({ year: 'sy-1' })
    expect(filtered).toContain('No published records match these filters.')
    expect(filtered).toContain('Clear filters')
    const unfiltered = await page()
    expect(unfiltered).toContain('No records have been published here yet.')
    expect(unfiltered).not.toContain('match these filters')
    expect(unfiltered).not.toContain('Clear filters')
  })
```

- [ ] **Step 2:** Run `npm run test:int -- tests/int/record-list-pages.int.spec.ts`.
      Expected: FAIL on `No records have been published here yet.`
- [ ] **Step 3: Implement.** In `RecordList`, replace the `emptyText` default and the empty branch:

```tsx
export function RecordList({
  list,
  basePath,
  filters,
  emptyText = 'No records have been published here yet.',
}: {
  list: RecordListData
  basePath: string
  filters: RecordFilters
  emptyText?: string
}) {
  const filtered = Boolean(filters.year || filters.type || filters.csg)
  if (list.rows.length === 0)
    return (
      <div role="status">
        <p>{filtered ? 'No published records match these filters.' : emptyText}</p>
        {filtered && (
          <p>
            <Link className="inline-flex min-h-[var(--target-hit)] items-center underline" href={basePath}>
              Clear filters
            </Link>
          </p>
        )}
      </div>
    )
```

- [ ] **Step 4:** Re-run the test file. Expected: PASS. Then
      `rg "match these filters" tests/e2e` and update any e2e expectation that visits an
      unfiltered empty list.
- [ ] **Step 5:** Commit: `git add src/components/records/RecordList.tsx tests/int/record-list-pages.int.spec.ts`
      then `git commit -m "fix(records): say nothing is published yet when no filter is set"`.

### Task B2: One long date format on the post page (audit 14)

**Files:**
- Modify: `src/heros/PostHero/index.tsx:1,44`
- Delete: `src/utilities/formatDateTime.ts` (only caller is PostHero; confirm with
  `rg formatDateTime src` first)
- Test: `tests/int/record-list-pages.int.spec.ts` already proves `formatInstantDate`; add a
  PostHero render test in `tests/int/post-hero.int.spec.ts`.

- [ ] **Step 1: Write the failing test** `tests/int/post-hero.int.spec.ts`:

```ts
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PostHero } from '@/heros/PostHero'

describe('post hero date', () => {
  it('shows_the_manila_calendar_date_in_long_form', () => {
    const out = renderToStaticMarkup(
      <PostHero post={{ title: 'T', publishedAt: '2026-10-10T18:30:00.000Z' } as never} />,
    )
    expect(out).toContain('11 October 2026</time>')
    expect(out).not.toContain('10/11/2026')
  })
})
```

- [ ] **Step 2:** Run it. Expected: FAIL (output contains `10/11/2026` or `10/10/2026`). If the
      render throws because PostHero needs more post fields, add only the fields it reads to
      the fixture.
- [ ] **Step 3: Implement.** In `PostHero/index.tsx` replace the import with
      `import { formatInstantDate } from '@/components/records/format'` and line 44 with
      `<time dateTime={publishedAt}>{formatInstantDate(publishedAt)}</time>`. Delete
      `src/utilities/formatDateTime.ts`.
- [ ] **Step 4:** Re-run; expected PASS. `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `fix(posts): show post dates as the long Manila date like record lists`.

### Task B3: Solid hero band, no repeated label (audit 4 and the hero half of 10)

**Files:**
- Modify: `src/components/home/HomePage.tsx:29-57`
- Test: `tests/int/home-render.int.spec.ts` (add one assertion), `tests/int/design-tokens.int.spec.ts`
  (the 8.4:1 white-on-`--brand-deep` check already exists; do not change it).

- [ ] **Step 1: Failing test.** In `home-render.int.spec.ts`, in the test that renders
      `HomePage`, add:

```ts
    expect(out).toContain('bg-brand-deep ')
    expect(out).not.toContain('bg-brand-deep/90')
    expect(out).not.toMatch(/uppercase[^"]*">University Student Government</)
```

- [ ] **Step 2:** Run; expected FAIL on `bg-brand-deep/90`.
- [ ] **Step 3: Implement.** Change the band to `className="w-full bg-brand-deep py-4 text-center text-on-brand-deep md:py-6"`,
      delete the `<p ...uppercase...>University Student Government</p>` (the wordmark above
      already says it), and update the comment to: `The statement sits on a solid deep-rust band
      so its contrast never depends on the photo (checked in design-tokens.int.spec.ts).`
- [ ] **Step 4:** Re-run home-render; then `npm run test:e2e -- tests/e2e/home.e2e.spec.ts`.
      Fix any e2e that looked for the removed label.
- [ ] **Step 5:** Commit `fix(home): put the statement on a solid band and drop the repeated label`.

### Task B4: 44 px tap targets for menu and breadcrumb links (audit 3)

**Files:** `src/app/(frontend)/globals.css:319-343` and `:501-520`; test
`tests/e2e/ui-consistency.e2e.spec.ts`.

`.site-nav-link` already has `min-height: var(--target-hit)` yet measured 43 px, so the cause is
not a missing rule.

- [ ] **Step 1: Failing e2e test** in `ui-consistency.e2e.spec.ts`:

```ts
test('menu and breadcrumb links are at least 44px tall', async ({ page }) => {
  for (const path of ['/', '/archives/legislative']) {
    await page.goto(path)
    const heights = await page
      .locator('.site-nav-link:visible, .site-breadcrumbs a:visible')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
    expect(heights.length).toBeGreaterThan(0)
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44)
  }
})
```

- [ ] **Step 2:** Run it; expected FAIL with a height near 43.
- [ ] **Step 3: Find the cause.** In the browser (Playwright `page.evaluate`), read
      `getComputedStyle(el).minHeight`, `--target-hit` on `:root`, and `box-sizing`. Likely
      causes: `--target-hit` resolves below 44 px (rem against a smaller root size), or a later
      rule (`.site-nav-children .site-nav-link` at line 462, or the breadcrumb `li` rule)
      overrides it. Stop when one cause is shown by the computed values.
- [ ] **Step 4: Fix it once at that cause** (e.g. define `--target-hit: 2.75rem` with a 44px floor
      as `max(44px, 2.75rem)`, or remove the overriding rule). Give breadcrumb links the same
      `min-height: var(--target-hit)` if they lack it.
- [ ] **Step 5:** Re-run the e2e test and `tests/int/design-tokens.int.spec.ts`; both PASS.
      Commit `fix(navigation): make menu and breadcrumb links at least 44px tall`.

### Task B5: Script-tag console error on the 404 page (audit 5)

**Files:** likely `src/app/(frontend)/not-found.tsx`, `src/app/(frontend)/layout.tsx:39`,
`src/providers/Theme/InitTheme/index.tsx`; test `tests/e2e/frontend.e2e.spec.ts`.

- [ ] **Step 1: Failing e2e test** in `frontend.e2e.spec.ts`:

```ts
test('the 404 page logs no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const res = await page.goto('/no-such-page')
  expect(res?.status()).toBe(404)
  await page.waitForLoadState('networkidle')
  expect(errors.filter((e) => /script tag/i.test(e))).toEqual([])
})
```

- [ ] **Step 2:** Run; expected FAIL with "Encountered a script tag while rendering React component".
- [ ] **Step 3: Find the cause.** Only the 404 page shows it, so compare how `not-found.tsx` is
      rendered (it may render outside `<head>` handling, putting `InitTheme`'s
      `<script dangerouslySetInnerHTML>` into client-rendered body content). Confirm by
      temporarily removing `<InitTheme />` and re-running; restore it afterwards.
- [ ] **Step 4: Fix at the cause.** Preferred: render the theme script with
      `next/script` `strategy="beforeInteractive"` in the root layout, or keep the raw
      `<script>` but make sure it is only emitted inside `<head>` on every route, including
      not-found. Re-run the test plus `tests/e2e/navigation.e2e.spec.ts` (theme toggle still
      works, no flash of the wrong theme on reload).
- [ ] **Step 5:** Commit `fix(theme): load the theme script without a React script-tag error on 404`.

### Task B6: Heading skip on /contact (audit 17)

- [ ] **Step 1:** Find where `/contact` comes from: `rg -n "contact" src/app src/endpoints/seed`.
      If it is a CMS page in `binturong_domain`, the skip is in content: report the exact
      heading levels to the owner instead of editing their data. If it is code, continue.
- [ ] **Step 2:** Add to `ui-consistency.e2e.spec.ts`:

```ts
test('contact page headings do not skip levels', async ({ page }) => {
  await page.goto('/contact')
  const levels = await page
    .locator('main h1, main h2, main h3, main h4, main h5, main h6')
    .evaluateAll((els) => els.map((el) => Number(el.tagName[1])))
  for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThanOrEqual(levels[i - 1] + 1)
})
```

- [ ] **Step 3:** Run (FAIL), change the one wrong level in code, run (PASS), commit
      `fix(contact): keep heading levels in order`.

### Task B7: Record images show nothing when the file is missing (audit 2)

**Files:** find the component with `rg -n "next/image|<img" src/components/Media src/blocks`.

- [ ] **Step 1:** Write an int test that renders the media component with a resource whose
      `url` is null and asserts the output contains no `<img` and no empty frame wrapper.
- [ ] **Step 2:** Run (FAIL), make the component return `null` when there is no usable `url`,
      run (PASS). Do not add a placeholder graphic.
- [ ] **Step 3:** Commit `fix(media): render nothing when an image file is missing`.

### Task B8 (G2): Empty home sections (audit 8)

**Files:** `src/components/home/HomePage.tsx:80-106`, `tests/int/home-render.int.spec.ts`.

- [ ] **If the owner says "hide":** wrap Student services, General plan of activities and
      Transparency the same way Latest issuances is wrapped: render the `HomeSection` only when
      its list has items (`{data.services.length > 0 && (<HomeSection ...>...)}`), and change the
      `HomePage` doc comment to say empty sections are omitted. Test: render with empty lists and
      assert `home-services`, `home-activities`, `home-transparency` ids are absent; render with
      one item each and assert they are present. Archive pages keep their empty states.
- [ ] **If the owner says "keep":** no code change; record the answer in the checkpoint.
- [ ] Commit `fix(home): leave out front-page sections that have nothing published`.

### Task B9 (G1): Remove the Payload demo posts (audit 1)

- [ ] **Step 1:** List, read-only, what would be removed:
      posts by "Demo Author" and their media, with ids and titles. Show the owner the list.
- [ ] **Step 2:** Only after the owner's yes: delete them through the admin (as a publisher) or
      the Payload Local API from a one-off script in the scratchpad, never committed. Record the
      deleted ids in the checkpoint.
- [ ] **Step 3:** Confirm `src/endpoints/seed` cannot run in production
      (`rg -n "seed" src/endpoints src/app`); if a seed route exists, note whether it is
      admin-only. Report, do not change, unless it is reachable anonymously.

### Task B10: Phase B gate

- [ ] Full `npm run test:int`, `npx tsc --noEmit`, `npm run lint`, then `npm run test:e2e`.
      Record counts. Re-run the audit capture script
      (`node <scratchpad>/audit/capture.cjs <worktree> <outDir>`) against a dev server on this
      branch and attach the before/after list for audit items 2, 3, 4, 5, 8, 12, 14, 17.
- [ ] Reviewer, then merge into `dev`.

---

## Phase C: admin for the trial (branch `Hawksprey420/admin-slice-2` from `dev`)

### Task C1: Type label and one action button on home rows (slice 2)

**Files:**
- Modify: `src/admin/dashboard/queries.ts:11-17,87-99` (add `type`)
- Modify: `src/admin/dashboard/index.tsx:15-54,136-161`
- Modify: `src/admin/copy.ts` (add `continue`)
- Modify: `src/admin/dashboard/index.scss` (row layout)
- Test: `tests/int/admin-dashboard.int.spec.ts`

- [ ] **Step 1: Failing tests** in `admin-dashboard.int.spec.ts` (reuse its existing setup that
      creates a draft as an editor):

```ts
  it('labels_each_draft_with_its_type', async () => {
    const result = await loadDrafts(editorReq, { mine: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const issuance = result.items.find((i) => i.collection === 'issuances')
    expect(issuance?.type).toBe('Issuance')
  })
```

  and a render test asserting a row in "Your drafts" contains `Issuance`, `Saved ` and an
  anchor whose text starts with `Continue`, and a waiting row's anchor starts with
  `Open and review`.

- [ ] **Step 2:** Run; expected FAIL (`type` undefined).
- [ ] **Step 3: Implement.** In `queries.ts`:

```ts
export type DraftItem = {
  collection: Source
  id: number | string
  title: string
  type: string
  updatedAt: string
  href: string
}

const typeLabel = (req: PayloadRequest, slug: Source): string => {
  const singular = req.payload.collections[slug]?.config.labels?.singular
  return typeof singular === 'string' ? singular : slug
}
```

  and in `loadDrafts`'s row mapping add `type: typeLabel(req, slug),`.

  For issuances this says "Issuance" for both trial records, which does not tell a resolution
  from a memo. For `slug === 'issuances'`, also select `type` and map it through
  `issuanceTypes` from `src/records/recordFilters.ts` ("Resolution", "Memorandum"); add a test
  case for it.

  In `copy.ts` add `continue: 'Continue',` next to `open`.

  In `index.tsx`, change `List` so each row shows title, type, age and one button (UI rule 2 of
  section 4a). The button is the only link, and its accessible name includes the title:

```tsx
            <li key={item.href}>
              <span className="admin-home__item-title">{item.title || 'Untitled'}</span>
              <span className="admin-home__detail">{detail(item)}</span>
              <a className="admin-home__action" href={item.href}>
                {linkLabel}
                <span className="visually-hidden">: {item.title || 'Untitled'}</span>
              </a>
            </li>
```

  Pass `linkLabel={adminCopy.continue}` for "Your drafts", keep `adminCopy.openAndReview` for
  the waiting list and `adminCopy.open` for recent. Details become
  `` `${item.type}. Saved ${when(item.updatedAt)}` `` for drafts and waiting (drop the trailing
  "Open and review." text). Recent rows need a type too: add `type` to `RecentItem` the same way.

  In `index.scss`, lay the row out as a grid: title and detail stacked on the left, the button
  on the right, stacking under 30rem. The button uses Payload theme variables
  (`--theme-elevation-*`), not orange; min-height 2.75rem; 3px focus outline like
  `stateLinks/index.scss`.

- [ ] **Step 4:** Run the int file (PASS), `npx tsc --noEmit`, `npm run lint`, then
      `npm run test:e2e -- tests/e2e/admin-usability.e2e.spec.ts`; update selectors that clicked
      the title link to click the button.
- [ ] **Step 5:** Commit `feat(admin): show type and one Continue or Review button on home rows`.

Skipped on purpose: home counts that link to filtered lists. The home lists already show the
five newest; add counts when an editor asks "how many".

### Task C2: Plain wording for Payload's own labels (audit 13)

Audit 13 found Payload's "Create New", "Status: Draft/Published" and "Updated At". The config
already overrides Payload strings at `src/payload.config.ts:125`
(`i18n.translations.en.error.unauthorizedAdmin`); extend that object. Keys checked in
`node_modules/@payloadcms/translations/dist/languages/en.js` (Payload 3.90.2):
`general.createNew` ('Create New'), `general.updatedAt` ('Updated At'), `version.draft`
('Draft'), `version.published` ('Published'). This applies to every collection, which is the
point. Keep the plural "Official issuances": `admin-config.int.spec.ts:93` asserts it on purpose.

**Files:** `src/payload.config.ts:125`, `src/admin/copy.ts`; test `tests/int/admin-config.int.spec.ts`.

- [ ] **Step 1: Failing test:**

```ts
  it('replaces_payload_wording_with_the_admin_word_set', async () => {
    const en = (await configPromise).i18n?.translations?.en as Record<string, Record<string, string>>
    expect(en.general.createNew).toBe('Add new')
    expect(en.general.updatedAt).toBe('Last saved')
    expect(en.version.draft).toBe('Not live yet')
    expect(en.version.published).toBe('Live on the site')
  })
```

- [ ] **Step 2:** Run (FAIL).
- [ ] **Step 3: Implement.** Add `createNew: 'Add new'`, `lastSaved: 'Last saved'` to
      `adminCopy` and replace line 125 with:

```ts
  i18n: {
    translations: {
      en: {
        error: { unauthorizedAdmin: adminCopy.accountDisabled },
        general: { createNew: adminCopy.createNew, updatedAt: adminCopy.lastSaved },
        version: { draft: adminCopy.stateNotLive, published: adminCopy.statusPublished },
      },
    },
  },
```

  If tsc rejects a key, the key name is wrong for this version: recheck `en.js`; do not cast.
- [ ] **Step 4:** Run (PASS); run `admin-usability.e2e` and `admin.e2e` and update selectors that
      looked for "Create New" or "Published". Screenshot the Issuances list and edit view.
- [ ] **Step 5:** Commit `feat(admin): use the plain admin word set for Payload's own labels`.

### Task C3: "View the site" link in the admin header (slice 4, cut down)

**Files:** create `src/admin/viewSite/index.tsx`; modify `src/payload.config.ts:54-62`
(`admin.components.actions`); regenerate `src/app/(payload)/admin/importMap.js`; test in
`tests/int/admin-config.int.spec.ts`.

- [ ] **Step 1: Failing test:** assert `config.admin.components.actions` contains
      `'@/admin/viewSite'`.
- [ ] **Step 2: Implement:**

```tsx
import React from 'react'

import { adminCopy } from '@/admin/copy'

/** Lets staff check the public site, the place their published work appears. */
export default function ViewSite() {
  return (
    <a href="/" rel="noopener" target="_blank">
      {adminCopy.viewSite}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  )
}
```

  Add `viewSite: 'View the site',` to `copy.ts`; add `actions: ['@/admin/viewSite'],` under
  `admin.components`; run `npm run generate:importmap`.
- [ ] **Step 3:** Test PASS, tsc, lint; commit `feat(admin): add a View the site link to the header`.

### Task C4: USG emblem instead of the Payload logo (audit 16)

**Files:** create `src/admin/graphics/Logo.tsx` and `Icon.tsx`; modify `payload.config.ts`
(`admin.components.graphics`); assets already in `public/brand/usg-emblem.png`.

- [ ] **Step 1: Failing test** in `admin-config.int.spec.ts`: `graphics.Logo` is
      `'@/admin/graphics/Logo'` and `graphics.Icon` is `'@/admin/graphics/Icon'`.
- [ ] **Step 2: Implement:**

```tsx
// src/admin/graphics/Logo.tsx
import React from 'react'

export default function Logo() {
  return (
    <img alt="University Student Government, Palawan State University" height={80} src="/brand/usg-emblem.png" width={100} />
  )
}
```

```tsx
// src/admin/graphics/Icon.tsx
import React from 'react'

export default function Icon() {
  return <img alt="USG" height={24} src="/brand/usg-emblem.png" width={30} />
}
```

  (Emblem ratio is 1.25:1, per the branding handoff.) If lint flags `@next/next/no-img-element`,
  use `next/image` with the same sizes instead. Register under
  `admin.components.graphics`; `npm run generate:importmap`.
- [ ] **Step 3:** Test PASS; screenshot `/admin/login` light and dark; commit
      `feat(admin): show the USG emblem on login and in the header`.

### Task C5: Phase C gate

- [ ] `npm run test:int`, tsc, lint, `npm run test:e2e -- tests/e2e/admin-usability.e2e.spec.ts tests/e2e/admin.e2e.spec.ts`.
      Screenshot admin home as editor and publisher at 1280 px and 360 px. Reviewer, merge.

---

## Phase D: memo pages (branch `Hawksprey420/memo-pages` from `dev`)

### Task D1 (G8): One allow-listed archive route per record type

Do not start until the owner approves the executive-pages draft (G8).

**Files:**
- Create: `src/app/(frontend)/archives/[group]/[kind]/page.tsx`
- Delete: `src/app/(frontend)/archives/[group]/resolutions/page.tsx`
- Modify: `src/app/(frontend)/archives/[group]/page.tsx` (link to the type pages of that group,
  if the group page lists them; check first)
- Test: `tests/int/record-list-pages.int.spec.ts`, `tests/e2e/records.e2e.spec.ts`

- [ ] **Step 1: Failing tests.** e2e: `/archives/executive/memoranda` returns 200 with h1
      "Memoranda" and breadcrumb Archives / Executive; `/archives/legislative/resolutions` still
      200; `/archives/legislative/memoranda` and `/archives/executive/resolutions` return 404.
      If G4 = "now", also `/archives/executive/executive-orders` returns 200.
- [ ] **Step 2:** Run; expected FAIL on memoranda (404).
- [ ] **Step 3: Implement** `[kind]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { RecordListPage, type SearchParams } from '@/components/records/RecordListPage'
import type { issuanceTypes } from '@/records/recordFilters'

export const dynamic = 'force-dynamic'

type Kind = {
  group: 'legislative' | 'executive'
  groupLabel: string
  kind: string
  title: string
  type: (typeof issuanceTypes)[number]['value']
}

// Each type page belongs to the branch that issues it. Any other pair is a real 404.
const kinds: Kind[] = [
  { group: 'legislative', groupLabel: 'Legislative', kind: 'resolutions', title: 'Resolutions', type: 'resolution' },
  { group: 'executive', groupLabel: 'Executive', kind: 'memoranda', title: 'Memoranda', type: 'memorandum' },
  // G4: add { group: 'executive', groupLabel: 'Executive', kind: 'executive-orders', title: 'Executive orders', type: 'executive_order' } when the owner says "now".
]

export const dynamicParams = false
export const generateStaticParams = () => kinds.map(({ group, kind }) => ({ group, kind }))

type Args = {
  params: Promise<{ group: string; kind: string }>
  searchParams: Promise<SearchParams>
}

const find = async (params: Args['params']) => {
  const { group, kind } = await params
  return kinds.find((k) => k.group === group && k.kind === kind)
}

export default async function Page({ params, searchParams }: Args) {
  const page = await find(params)
  if (!page) notFound()
  return (
    <RecordListPage
      basePath={`/archives/${page.group}/${page.kind}`}
      fallback={{ label: 'Archives', href: '/archives' }}
      fixedType={page.type}
      scope={page.group}
      searchParams={searchParams}
      section="archives"
      title={page.title}
      trail={[{ label: page.groupLabel, href: `/archives/${page.group}` }]}
    />
  )
}

export async function generateMetadata({ params }: Pick<Args, 'params'>): Promise<Metadata> {
  const page = await find(params)
  return {
    title: page ? `${page.title} | ${page.groupLabel} | Archives | Binturong` : 'Archives | Binturong',
  }
}
```

  Check that `RecordScope` accepts `'executive'` (`src/records/recordFilters.ts`); if it does
  not, stop and report, because then executive records are not scoped by branch yet.
  Delete the old `resolutions/page.tsx`.
- [ ] **Step 4:** Run the int file and `npm run test:e2e -- tests/e2e/records.e2e.spec.ts`; PASS.
- [ ] **Step 5:** Commit `feat(archives): add an Executive memoranda page on one route per record type`.

### Task D2 (G9): Citation line on issuance pages (character idea 2, cut down)

Do not start until G9 is answered. The code below uses "s. 2026" as a stand-in only; if the owner
picks the academic-year form ("s. A.Y. 2026-2027"), the helper takes the linked academic year's
label instead of `seriesYear`, and the tests change to match.

**Files:** `src/components/records/RecordDetailPage.tsx` (find where the issuance title and
metadata render), new helper `src/records/citation.ts`, test `tests/int/record-detail.int.spec.ts`.

- [ ] **Step 1: Failing unit test** in a new `tests/int/citation.int.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { citation } from '@/records/citation'

describe('citation', () => {
  it('formats_the_philippine_record_citation', () => {
    expect(citation({ typeLabel: 'Memorandum', documentNumber: '023', seriesYear: 2026 })).toBe(
      'Memorandum No. 023, s. 2026',
    )
  })
  it('returns_null_when_the_number_or_series_is_missing', () => {
    expect(citation({ typeLabel: 'Memorandum', documentNumber: null, seriesYear: 2026 })).toBeNull()
    expect(citation({ typeLabel: 'Memorandum', documentNumber: '023', seriesYear: null })).toBeNull()
  })
})
```

- [ ] **Step 2:** Run (FAIL). **Step 3: Implement** `src/records/citation.ts`:

```ts
/** "Memorandum No. 023, s. 2026": how Philippine institutions cite a numbered record. */
export function citation({
  typeLabel,
  documentNumber,
  seriesYear,
}: {
  typeLabel: string
  documentNumber: string | null | undefined
  seriesYear: number | null | undefined
}): string | null {
  if (!documentNumber || !seriesYear) return null
  return `${typeLabel} No. ${documentNumber}, s. ${seriesYear}`
}
```

- [ ] **Step 4:** Show it on the issuance detail page directly under the h1 as a plain
      paragraph with `font-variant-numeric: tabular-nums` (no badge, no border, no colour). Add an
      assertion to `record-detail.int.spec.ts` that an issuance with number and series renders
      `Memorandum No. 023, s. 2026`, and one without a number renders no citation line.
      Show it in list rows only if `RecordRow` already shows the number; otherwise leave rows
      alone.
- [ ] **Step 5:** Commit `feat(records): show the record citation under the issuance title`.

Skipped: "Copy citation" button. Add it when someone asks to cite records elsewhere.

### Task D3: Phase D gate

- [ ] Full int + tsc + lint + `records.e2e` + `navigation.e2e`. Reviewer, merge.

---

## Phase E: make the suite trustworthy (branch `Hawksprey420/ops-tests` from `dev`; can run in parallel with B–D, but only one worker holds the test lock)

### Task E1: GraphQL `[]` expectations

- [ ] **Step 1:** Run `npm run test:int -- tests/int/domain-schema.int.spec.ts tests/int/domain-references.int.spec.ts`;
      record the failing assertions (anonymous `Organizations(draft: true)` now returns
      `data: null` with an error instead of `[]`).
- [ ] **Step 2:** `git log -S "draft" --oneline -- src/access src/collections` to find the change
      that altered the response. Decide with evidence: if the new behaviour fails closed by
      design (anonymous draft reads refused), change the tests to expect the error and no data;
      if not, fix the access function. Either way the test must assert no record data leaks.
- [ ] **Step 3:** Commit `test(graphql): expect anonymous draft queries to be refused` (or `fix(access): ...`).

### Task E2: Waiting-list e2e

- [ ] **Step 1:** Run `npm run test:e2e -- tests/e2e/admin-usability.e2e.spec.ts -g "waiting"`
      twice: once as is, once after recreating `binturong_test` from migrations. If it passes on
      a clean database, the cause is leftover rows: make the test create and clean up its own
      records (unique titles per run, `afterAll` delete) instead of assuming an empty list.
      If it fails on a clean database, debug the test against Phase C's new row markup.
- [ ] **Step 2:** Commit `test(admin): isolate the waiting-list test from leftover drafts`.

---

## Phase V: cloud readiness (Vercel + Supabase), runs alongside B–E

Recorded state (`plans/product-alignment.md`, 17 Nov): Vercel project `pal-su-usg/binturong`
(Root Directory `binturong-open-usg`, Node 22) builds GitHub `dev` as a Preview behind Vercel
SSO; `vercel-build` = `payload migrate && next build`; Supabase project `ntzwpcnsjpijfhrgvvin`
is the **dev** cloud database (Data API off, all migrations applied). Open there: no first
admin on hosted, no hosted storage bucket, function max duration unknown, pooler settings not
reviewed.

Found while planning (21 Nov): Media uploads go to local disk
(`src/collections/Media.ts:45`, `staticDir: public/media`) and no object-storage adapter is
installed. Vercel's filesystem is not durable, so image uploads on hosted would be lost or
fail. Official PDFs use their own storage (`OFFICIAL_STORAGE_*`), which is unset on hosted.
No route sets `maxDuration` (`rg maxDuration src` finds nothing).

The Preview is the integration test for the cloud: every merge to `dev` that the owner
approves to push (G12) is checked there with V6.

### Task V0: Research from current official docs (docs only, no lock)

- [ ] Read and record, with the date read and the URL, in a "Research" section of
      `docs/production-runbook.md`:
  1. Payload 3 storage adapters for Media on Vercel: `@payloadcms/storage-s3` (with Supabase
     Storage's S3-compatible endpoint) vs `@payloadcms/storage-vercel-blob`. For each: the
     version matching Payload 3.90.2, config shape, whether `disableLocalStorage` is set, and
     how image sizes (sharp) still work.
  2. Supabase connection from Vercel serverless with node-postgres: transaction pooler (6543)
     vs session pooler (5432) vs direct; prepared-statement limits; recommended `pool.max` per
     instance; SSL settings.
  3. Which connection `payload migrate` in `vercel-build` should use (migrations can need
     session-level features the transaction pooler lacks).
  4. Vercel function `maxDuration` limit on this team's plan, and how to set it per route in
     Next 16 (`export const maxDuration`).
  5. Supabase Storage limits relevant to official PDFs (max file size on the plan; private
     bucket; signed URL expiry).
- [ ] End with a recommendation per item. Research is a suggestion; G11 decides the adapter.
- [ ] Commit `docs(ops): record cloud research for Vercel and Supabase`.

### Task V1 (G11): Media off local disk

**Files:** `src/collections/Media.ts`, `src/payload.config.ts` (plugins), `package.json` /
lockfile (one new `@payloadcms/storage-*` package at 3.90.2), `.env.example`, test
`tests/int/admin-config.int.spec.ts`.

Follow the existing official-storage pattern: cloud storage only when its env vars are set;
local disk in dev and tests when unset, so `binturong_test` runs stay offline.

- [ ] **Step 1: Failing test:** with the media storage env vars set (stub values via
      `vi.stubEnv` before importing the config), the built config's plugin list contains the
      storage plugin for the `media` collection; with them unset it does not.
- [ ] **Step 2:** Run (FAIL). **Step 3:** `npm install <adapter>@3.90.2` (exact version, check
      `npm ls` shows one Payload version), add the plugin with `collections: { media: true }`,
      enabled only when the vars are set; add the vars to `.env.example` with a server-only
      comment like the official-storage block.
- [ ] **Step 4:** Test PASS; `npm run build` succeeds; commit
      `feat(media): store uploads in cloud storage when configured`.
- [ ] **Step 5 (owner):** create the bucket or Blob store, add the env vars to Vercel Preview.

### Task V2: Official PDF storage on hosted

- [ ] **Step 1 (owner):** create the private bucket `official-documents` in the dev Supabase
      project, and set `OFFICIAL_STORAGE_URL`, `OFFICIAL_STORAGE_BUCKET`,
      `OFFICIAL_STORAGE_SERVICE_KEY` in Vercel Preview only (the service key never goes in the
      repo or a `NEXT_PUBLIC_` variable).
- [ ] **Step 2:** Read `tests/int/document-storage-live.int.spec.ts` to see which env it needs;
      run it against the dev cloud bucket from a local shell with those vars set in the
      session only (not in `.env*`). Expected: PASS. Record the result.

### Task V3: Database connection settings for serverless

**Files:** `src/payload.config.ts:74-79`; test `tests/int/admin-config.int.spec.ts` (or the
existing connection-URL safety test; find it with `rg "unsafe" tests/int`).

- [ ] Apply V0 item 2: set `pool.max` to the recommended small number and any SSL option
      Supabase needs, reading only from env (no hard-coded hosts). Keep local Docker working.
- [ ] Test asserts the pool options; `npm run test:int` still passes locally.
- [ ] Record in the runbook which Supabase URL (pooler port) goes in `DATABASE_URL` for runtime
      and, if V0 item 3 says so, a separate migration URL used only by `vercel-build`.
- [ ] Commit `fix(db): size the connection pool for serverless functions`.

### Task V4: Download route duration

**Files:** the route serving `GET /api/documents/:id/file` (find with
`rg -n "documents/.*/file|/file'" src`).

- [ ] Add `export const maxDuration = <seconds>` at the V0 item 4 limit (target 1200 for the
      20-minute deadline the owner approved: "Raise it to twenty"). If the plan's limit is
      lower, use the limit and record that the download deadline is shorter on hosted.
- [ ] Test: an int test imports the route module and checks `maxDuration`. Commit
      `fix(documents): let file downloads run up to the hosted time limit`.

### Task V5: First admin on hosted (runbook, then owner)

- [ ] Read the bootstrap guard (`rg -n "bootstrap" src`) and the Users access rules; write the
      exact hosted procedure in the runbook (first-user screen if allowed, else create locally
      against the cloud URL from a one-off scratch script, then promote in the Supabase SQL
      editor). Mark any step not tried as unverified.
- [ ] Owner runs it on the dev cloud project first; the same steps then go to production.

### Task V6 (G12): Preview smoke after each approved push

- [ ] After the owner approves a push of `dev`, watch the Vercel build log to the end
      (`vercel inspect <url> --logs` or the dashboard). Expected: migrate lists the applied
      migrations, build succeeds.
- [ ] On the Preview (behind Vercel SSO): home returns 200; `/admin` login works with the hosted
      admin; upload an image (it shows after a redeploy, proving it is not on local disk);
      upload a PDF, publish a test record, download the PDF as an anonymous visitor; confirm a
      draft PDF is refused to an anonymous visitor. Delete the test record after.
- [ ] Record pass/fail per item in the checkpoint. A failure becomes a task on the next branch.

## Phase F: dev dry run (owner and one staff editor; no code)

- [ ] **Step 1 (G10):** Coordinator restores the latest `binturong_domain` backup into a scratch
      database (this is also the restore drill), points a dev server from the main checkout on
      `dev` at it, and runs migrations there. Never at `binturong_domain`. If the editor is not on
      this machine, the owner opens an ngrok tunnel **with `--basic-auth`** and closes it after.
- [ ] **Step 2:** The editor, unaided, saves a test resolution with its PDF; a publisher makes it
      live; both check `/archives/legislative/resolutions` and the record page. Repeat with a
      memorandum and `/archives/executive/memoranda`. Use clearly fake content ("TEST, delete
      after"), no real names.
- [ ] **Step 3:** Write down every place they hesitate or ask, word for word, in
      `plans/product-alignment.md`. Each one becomes a small fix or a parked item; nothing is
      fixed during the run.
- [ ] **Step 4:** Drop the scratch database afterwards (owner approval).

## Phase G: production 1:1 with dev

### Task G1-runbook: `docs/production-runbook.md` (docs only, any time)

Contents, from `plans/codex-handoff-2026-11-20.md` queue item 5:
- a second Supabase project, same Postgres major version, Data API off/lockdown identical to
  dev, private storage bucket of the same shape;
- the Vercel Production environment with the same variable names as Preview
  (`DATABASE_URL`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, `CRON_SECRET`, `PREVIEW_SECRET`,
  `OFFICIAL_STORAGE_URL`, `OFFICIAL_STORAGE_BUCKET`, `OFFICIAL_STORAGE_SERVICE_KEY`) and new
  secret values; the service-role key lives only in Vercel;
- `vercel-build` applies the same migrations (count them from `src/migrations` at the time);
- function max duration ≥ 20 minutes if the plan allows, else record the real limit;
- a Vercel Firewall rate-limit rule on `GET /api/documents/:id/file` (per IP), with the exact
  rule and why (in-memory limits are per serverless instance);
- the first admin: create via the `/admin` first-user screen, then check Users access rules,
  then promote in the Supabase SQL editor; mark the first-user behaviour as unverified until
  tried;
- a restore drill: the Phase F scratch restore, written up as steps (backup location, restore
  command, how records and files were checked, how the scratch database was dropped).

Every dashboard step is the owner's. Commit `docs(ops): write the production runbook`.

### Task G2 (owner, with the runbook)

- [ ] The owner creates production, sets variables, runs the restore drill, and deploys (each
      step asked and approved separately).

### Conditional on gates (build only once answered)

- **G5 domain known → official strip.** One line above the header: "Official website of the
  University Student Government, Palawan State University", with a native
  `<details><summary>How to tell</summary>` explaining the real address. Our own wording; no
  GOVPH name or bar. Test: renders on every route, keyboard-operable, no layout shift at 360 px.
- **G6 email known → footer line.** "Page last updated <date> · Report a problem with this page"
  (`mailto:` the real address). Date comes from the page's or record's `updatedAt`; omit the
  date when unknown.

## Phase H: the real trial (finish line)

- [ ] A staff editor, unaided, saves one real resolution and one real memorandum on production;
      a publisher makes them live; both appear on their archive pages with the right citation,
      date and PDF. Record the result in `plans/product-alignment.md`. Phase 3 is complete only
      when the owner says so.

---

## 9. Parked (not Phase 3; reopen after launch or when a trial shows the need)

- Character ideas 3 (dateline), 4 (calendar-leaf dates), 6 (branch seals). Idea 5 dropped.
- Audit 6 (arrows), 7 (orange restraint), 9 (badge box), the "In this section" half of 10,
  11 (two current-page marks), 15 (template blocks on the post page; mostly gone with B9),
  18 (arrows in my own mockups).
- Admin slice 3 (New vs Changed, "Live, with changes"): both trial records are new, so it never
  comes up. Add when people start editing live records.
- Admin home counts linking to filtered lists; inbox view; query presets; "Copy citation".
- Executive orders page if G4 = "later"; Legislative "acts" page; Judicial type pages (no
  samples seen).

## 10. Order and parallelism

```text
A1 → A2 → A3                      (coordinator, sequential, holds the test lock)
      V0 research + G1-runbook (docs, anytime, no lock)
      then in parallel, max two workers:
      B (launch-fixes)   C (admin-slice-2)   D (memo-pages)   E (ops-tests)   V1–V4 (cloud-ready)
      each approved push of dev → V6 Preview smoke on Vercel + Supabase dev cloud
B+C+D+E+V merged, V6 green → F (dry run; may run on the Preview instead of a local scratch DB)
      → fixes from F → G2 (production, same steps as V on a new Supabase project) → H (trial)
```

Checkpoint: after each merge, update `plans/product-alignment.md` in place (commit, dirty files,
latest verified result, next action).
