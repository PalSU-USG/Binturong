# Codex handoff, 14 November 2026

Claude Code stopped here at the owner's request. Read this note, then
`plans/product-alignment.md`, `AGENTS.md`, `binturong-open-usg/AGENTS.md` and
`docs/engineering-workflow.md` before acting. Inspect Git yourself; this note is
recorded state, not proof.

## State

- Local `dev` = GitHub `dev` = `d53c142` (fast-forward pushes, owner-approved).
  Merged and pushed since the 12 Nov checkpoint: inner-pages design (`PageHeader`,
  `SectionLayout` band, `DestinationList`, `/posts` as Latest updates, exclusive
  animated nav dropdowns, warm dark theme), README rewrite, USG logo placeholder
  (`public/brand/usg-logo.png` in `Wordmark`).
- Main checkout `C:/Users/Hawksprey/Binturong` has CRLF-only noise in
  `src/payload-types.ts` and `src/app/(payload)/admin/importMap.js`; do not commit it.
  Owner stash `stash@{0}` stays unapplied.
- Owner dev server: `npm run dev -- --hostname 127.0.0.1 --port 3000` from the main
  checkout, reading `binturong_domain` on 56323. Never write test data there.

## In progress (uncommitted, unverified)

Worktree `C:/Users/Hawksprey/orca/workspaces/Binturong/home-redirect`, branch
`Hawksprey420/ui-consistency` (from `d53c142`). A Sonnet agent was stopped mid-work.
Dirty files: error/not-found/search/post pages, `globals.css`, `tokens.css`, Banner,
RelatedPosts, Card, SectionIndex, UpdatesListing, home components, RecordError,
`ui/button`, `ui/input`, PostHero, search Component/Results; new `components/Pager/`,
`components/PlainPage/`. Review the diff before keeping any of it.

Goal of that branch: one coherent PalSU look on every public page (search, 404,
error, CMS `[slug]` pages such as Contact still use template styling), using the
`modern-web-guidance`, `senior-frontend`, `refactoring-ui`, `ux-heuristics` and
`antislop-ui` skills in `.claude/skills` / `.agents/skills`.
Known items:
- e2e "targets are at least 44 CSS pixels" (`tests/e2e/navigation.e2e.spec.ts`) fails
  intermittently at 43.99998px, also on `dev`. Fix the element, not the test.
- Post detail logs 4 console errors (uninspected).
- `/posts` side menu has one item, the current page.
- Home and post hero images lack width/height.
- Findings from an independent Gemini audit: `plans/ui-audit-argon-2026-11-14.md`
  (model output; verify each). Includes footer theme trigger at 36px with a
  low-contrast chevron, leftover `setHeaderTheme('dark')` calls, `/search` without the
  band and with sub-44px controls.
- Do not change seed data or Header/Footer global content: the template posts
  ("Digital Horizons", disclaimer text) and footer "Payload"/"Source Code" links are an
  owner decision.

## Queue after that

1. Admin-usability (`C:/Users/Hawksprey/orca/workspaces/Binturong/admin-usability`,
   branch `Hawksprey420/admin-usability`): finish the independent review (stopped
   early; `git merge-tree` against dev was clean), full browser suite, regenerate the
   migration on the final schema (`domainMigrations.mjs` hard-codes 14), merge last.
2. README "Screenshots" section with current pages in `docs/screenshots/` plus a short
   PDF overview in `docs/`; update the README status section.
3. Update `plans/product-alignment.md` checkpoint.

## Rules carried over

- Task branch/worktree per change, independent review, local merge only with no
  P0/P1; owner has approved fast-forward pushes of finished, reviewed work to `dev`.
  Never push `main`.
- Tests only on `binturong_test` (`.env.test`, ports 55322/56322/56323). Before
  int/e2e/build, create `C:/Users/Hawksprey/orca/workspaces/Binturong/.e2e-lock`
  and delete it in a `finally`. One Next dev server per folder.
- Docker: `binturong-test-db-56323`, `binturong-domain-review-db-56322`,
  `binturong-document-storage-56321` (storage needs 56322). Do not start Bintanong;
  its Supabase containers auto-start with Docker and should be stopped.
- No AI attribution or co-author trailers. Never commit `.env*`.
- Bash on this machine can fail with fork errors; PowerShell works.
- Owner inputs still open: approved logo file, seal, colours, section copy, office
  branches, CSG list, PalSU portal link, hosting.
