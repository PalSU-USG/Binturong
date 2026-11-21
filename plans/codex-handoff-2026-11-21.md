# Codex handoff, 21 Nov 2026

From the Claude session `3853cd48-e3a3-484c-b8c5-ef395dbc4be8` (transcript:
`~/.claude/projects/C--Users-Hawksprey-Binturong/3853cd48-e3a3-484c-b8c5-ef395dbc4be8.jsonl`).
Read this, then `plans/product-alignment.md` (checkpoint), then the plans named below. Verify every
claim here with `git log` and the tests before acting on it.

## Rules that still apply

- Ask the owner before pushing, deploying, migrating `binturong_domain` or any hosted database,
  deleting data, or touching login and permissions beyond an approved plan.
- Tests only against `binturong_test` (127.0.0.1:45323). Use `npm run test:int` / `npm run
  test:e2e` (they load `.env.test`); never call vitest or playwright directly.
- Shared test lock `C:/Users/Hawksprey/orca/workspaces/Binturong/.e2e-lock`: wait while it exists,
  create it before tests or builds, delete it in a finally block. A stale lock from a stopped
  worker may remain; check its timestamp and that no process is running before removing it.
- PowerShell only (Git Bash cannot fork). No AI credit in commits. Stage files explicitly.
- This machine runs low on RAM: run the full browser suite in two halves; full `test:int` can hit
  5-second timeouts in upload/search files under load. Rerun those files alone and report both.

## Where things are

GitHub `dev` = `b9d8465` (pushed 21 Nov, Preview built). Local `dev` = `5ee089b` plus this file,
not pushed. Local `dev` adds: the first-account command (`dafa3d5`), runbook Step 5, checkpoint
notes, the SSO plan and its approval.

| Branch | Worktree | Commits | State |
|---|---|---|---|
| `Hawksprey420/memo-pages` | `.claude/worktrees/agent-abde30637604b38b6` | `68b1336`, `0bbabf1`, `786525d` | Done. int 629/629, records+navigation e2e 34/34, `next build` exit 0 (route `/archives/[group]/[kind]` built as dynamic). **Not merged**; still needs a review and a check that unknown pairs return 404 in production |
| `Hawksprey420/cloud-ready` | `.claude/worktrees/agent-a266e275502528e77` | `403389e` V1 media→S3, `77fbaff` V3 pool, `6d51dd1` V4 maxDuration 300, `c6b8dda` runbook | Worker stopped by the usage limit while finishing the runbook's research section. Tree clean. Re-run its tests and `npm run build` before review |
| `Hawksprey420/sso` | `.claude/worktrees/agent-a2c735fb8ccd56f98` | `77f6993` deps only (`@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.119.0) | Worker stopped by the usage limit. **Large uncommitted, untested work in the worktree**: `src/auth/`, `src/collections/AccessRequests/`, `src/admin/GoogleSignIn.tsx`, `ApproveAccessRequest.tsx`, `InviteGoogleStaff/`, `src/collections/Users/inviteGoogleStaff.ts`, `src/app/(frontend)/auth/`, migration `20261121_112130_staff_access_requests`, edits to Users, payload.config, `.env.example`. Review it against the SSO plan before keeping any of it; it was written test-first per the brief but no results were reported |

Ignore `.claude/worktrees/agent-a8c2b1b382241f457` (older, not part of this work).

## Next actions, in order

1. **memo-pages:** `npm run build` in its worktree (only reads `binturong_domain`), an independent
   review, then merge into `dev`. The worker's notes are below.
2. **cloud-ready:** check its tests and build, review, merge. It needs the owner to set the media
   storage variables in Vercel Preview (listed in the runbook commit `c6b8dda`).
3. **SSO:** implement `docs/superpowers/plans/2026-11-21-sso-plan.md` on `Hawksprey420/sso`.
   Approved by the owner on 21 Nov (S1–S5 all yes; "Do it first on your end" = build and test it
   with Supabase mocked before the owner touches the dashboards). The plan's Design and Tests
   sections are the spec.
4. **Admin redesign:** build from the design canvas (below) after memo-pages merges; it touches
   the same issuance screens.
5. **Ask the owner to push `dev`** after merges, then do the Preview smoke check (V6).

## memo-pages notes from its worker

- The breadcrumb test for `/archives/executive/memoranda` dropped "Archives": the test database's
  Header has an Archives item with no link, and `Breadcrumbs` drops linkless ancestors instead of
  using the `/archives` fallback. The owner's local menu links Archives, so the real site is
  probably fine. Owner decision pending: add the fallback or not.
- The citation uses the academic year's label and the document number exactly as typed. "SY
  2026-2027" would print "s. SY 2026-2027"; "No. 023" would print "No. No. 023". Proposed: field
  validation (year like `2026-2027`, number without a "No." prefix) in the admin redesign branch.
- Search results still show the bare number, not the citation. Small follow-up.
- `dynamic = 'force-dynamic'` together with `dynamicParams = false` on the new
  `[group]/[kind]` route: confirm with a production build that unknown pairs 404.

## Admin redesign (design only, owner reviewing)

Canvas: https://claude.ai/artifact/4yJ4zBaY85xEMtGq4v4VA2 (private to the owner). Local source:
`~/AppData/Local/Temp/claude/c--Users-Hawksprey-Binturong/3853cd48-e3a3-484c-b8c5-ef395dbc4be8/scratchpad/admin-canvas/project/`
(temporary; copy it before it is cleaned up). Agreed direction from the owner's comments:

- Payload admin styled like a CMS (WordPress-style dashboard widgets), USG brown top bar and dark
  warm sidebar, orange for the active item and main button, Montserrat, Nerd Font glyphs (subset
  the font to the used glyphs before shipping; 2.3 MB whole).
- Light, dark and "match device" themes.
- Compact controls (28–36 px, not 44 px; WCAG 2.2 AA minimum is 24 px). This reverses the 44 px
  rule from admin slice 2 (`0058cb7`).
- Selective wording: no filler descriptions.
- Account menu as a dropdown; help as a "?" button; "View site".
- Add an issuance opens as a side panel (Payload document drawer) with the signed PDF uploaded
  inside the form; "Organization" is labelled "Issued by".
- A setup checklist on the dashboard until an organization and an academic year exist.
- Site management (super-admin): Accounts table as the main content, Access requests in a side
  panel, Needs attention (failed PDFs), Tools (record types, search index, redirects). Scheduled
  publishing sits next to Publish on each record; Forms is its own menu item.

## Owner decisions on record (21 Nov 2026)

Vercel plan Hobby (300 s function limit; hosted downloads stop at 5 minutes, not the approved 20).
G8 memo pages yes; G9 citation "Memorandum No. 023, s. 2026-2027" from the academic year label;
G11 `@payloadcms/storage-s3` on Supabase Storage; G1 demo posts replaced locally by three public
USG sample posts; SSO S1–S5 yes (Google Workspace, Supabase Auth for sign-in only, invite plus
request access, keep password sign-in during the trial, add the Supabase packages). G4
(executive orders page) unanswered.

## Open items for the owner

- Create the Supabase buckets (private `official-documents` for PDFs; one for images) and add the
  storage variables to Vercel Preview. Nothing can be uploaded on the Preview until then.
- Copy local content (menu, pages, sample posts) to the dev cloud database: approved in principle,
  not done; the owner must OK the target and the method.
- No Vercel cron exists, so scheduled publishing does not run on hosted; Hobby allows one run a
  day. Trial plan: publish by hand.
- After the trial: adjustable record types (backend), PDF pre-fill (text layer first, a small
  vision model for scans), SSO if not finished before.
- Rotate the dev database password (it was pasted into chat on 21 Nov) if not yet done, and
  update `DATABASE_URL` in Vercel.
