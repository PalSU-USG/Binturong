# Admin redesign, login screen and USG sample content: plan for Codex

Status: requested by the owner on 23 Nov 2026 ("the other plans for admin usability too. And
UI improvements for logging in + seeding USG related content to see"). It covers three tracks.
Do them in the order below; each is its own task branch per `docs/engineering-workflow.md`.
Nothing is approved for release until the owner says so. Ask before any push, hosted write or
migration, as usual.

Sources: admin canvas https://claude.ai/artifact/4yJ4zBaY85xEMtGq4v4VA2 (private to the owner;
backup `~/binturong-backups/admin-canvas-4yJ4zBaY85xEMtGq4v4VA2`, which predates the 23 Nov
dialog boards), owner decisions in `plans/codex-handoff-2026-11-21.md` and
`plans/codex-handoff-2026-11-23.md`, and `docs/design.md`. Treat the canvas as a picture of the
goal, not as code to copy.

## Track 1: login screen (smallest, do first)

**Today.** `src/components/BeforeLogin` still shows the Payload template text ("Welcome to
your dashboard! This is where site admins will log in…"). Payload's email/password form comes
next, and the Google button (`src/admin/GoogleSignIn.tsx`, registered as `afterLogin`) sits
below it as a secondary button. Status messages are a bare `<p role="status">`.

**Goal.** Staff see at a glance that this is the USG staff sign-in and that the campus Google
button is the normal way in, with password as the backup.

- Replace `BeforeLogin` with: the USG emblem (`/brand/usg-emblem.png`), "PSU University
  Student Government" and "Staff sign-in", then the Google button as the primary (orange)
  button, then a divider reading "or use your password". Move the Google form there from
  `afterLogin`. Keep `googleSSOConfig()` as the switch: when SSO is not configured, render
  only the heading and no divider.
- Show the `?sso=` status messages above the Google button as a visible notice (not just text):
  `requested` and `disabled` as information, `denied` and `retry` as errors. Keep the
  existing four messages and the `Object.hasOwn` allow-list.
- `afterLogin`: one help line, "No account yet? Sign in with your campus Google account to
  ask for access.", and a "View site" link to `/`.
- Style through Payload's theme variables in `src/app/(payload)/custom.scss` (USG brown top,
  orange `#f6931e` for the primary action, Montserrat), light and dark. No new dependency.
- Leave Payload's password form and its forgot-password link unchanged (fallback admin
  recovery depends on them).

**Done when** the login page shows no template text; the Google button comes before the
password form; each `sso` status shows its message; an unknown `sso` value shows nothing;
keyboard order is Google, email, password, Login; it holds at 320 px wide in both themes.

**Tests.** Update the existing SSO browser test (mocked Supabase) to assert the order and the
four messages; add one for an unknown status. Run `npm run test:e2e` for the auth files and
`npm run build`.

## Track 2: USG sample content seed (so the Preview has something to look at)

**Why.** The hosted dev database is nearly empty: the menu, pages and the three USG sample
posts exist only in local `binturong_domain`. The owner approved copying that content to hosted
dev only, not production ("Hmm, for now yes", 23 Nov). The template seed endpoint stays denied
to every role; do not reopen it.

**Method (proposed; show the owner before running it on hosted).** A committed script that
creates the content through the Payload Local API, not a database dump. A dump would also
copy local accounts, sessions and IDs, and its image rows would point at local files.

- `scripts/seed-usg-sample.ts`, npm script `seed:usg-sample`. Follow
  `scripts/create-first-account.ts`: dry run unless `--apply`; prompt for the target host and
  refuse if it does not match the `DATABASE_URL` hostname; one transaction; print what it
  would create or skip.
- Refuse when the target has `NODE_ENV=production` or the host matches a production project,
  unless a future owner decision says otherwise.
- Idempotent by slug or natural key: rerunning skips existing documents and never overwrites
  or deletes anything. It never touches `users`.
- Content, written as data in `scripts/seed-usg-sample/`:
  - The Header and Footer menus, read once from local `binturong_domain` and written into the
    seed data (check every link points to a route that exists).
  - The pages the menu links to, if they exist locally.
  - Organizations: University Student Government, Student Senate, Student Tribunal, each with
    its emblem from `public/brand/`.
  - The academic year needed by the sample records.
  - The three published sample posts recorded in `plans/product-alignment.md` (21 Nov): our own
    summaries, source links and the "Sample post … Replace or delete before launch" line. The
    two PSU photos are uploaded through Payload so they land in the Media bucket on hosted.
    Keep the image source and credit with each image. The Palawan Daily News post stays
    text-only.
  - Optional, if cheap: one sample memorandum per archive page, with a generated one-page PDF
    stamped "SAMPLE – not an official issuance", so the archive pages and the citation
    "Memorandum No. 023, s. 2026-2027" render.
- Run order: local `binturong_test` (int test), then a dry run against hosted dev and show the
  owner the output, then `--apply` only after the owner approves it.

**Done when** a dry run lists the planned documents; `--apply` creates them once; a second
run creates nothing; the Preview home, menu, posts and archive pages show the content; the
images load from the bucket. **Tests:** an int test on `binturong_test` covering create,
rerun-skips, host mismatch refusal and the no-users rule.

**Depends on** the hosted storage smoke (images must upload). New owner emblem files
(higher resolution, Tribunal without orange) are not in the repo yet; use the current ones
until the owner supplies them.

## Track 3: admin redesign (biggest; slice it)

Agreed direction (owner canvas comments, 21–23 Nov): a CMS-style admin with a USG brown top
bar, a dark warm sidebar, orange for the active item and main button, Montserrat, Nerd Font
glyphs subset to the glyphs used; light, dark and "match device" themes; compact controls of
28–36 px (WCAG 2.2 minimum is 24 px; this reverses the 44 px rule from admin slice 2,
`0058cb7`); no filler descriptions.

Slices, each a separate branch, smallest first:

1. **Theme and shell.** Colours, font, sidebar and top bar through Payload theme variables
   and `custom.scss`; account menu as a dropdown (My account, theme, Sign out); "?" help
   button; "View site". Subset the Nerd Font (the whole file is 2.3 MB) and self-host it.
   Check contrast in both themes with `antislop-human`'s checker.
2. **Dashboard.** "Start something new" cards (Issuance, Notice, Report, Person, Office);
   "Your drafts" table with Continue; "Waiting for a publisher"; "Recently live"; a setup
   checklist ("Add who issues papers", "Add the academic year") shown until an organization
   and an academic year exist. Reuse `src/admin/dashboard/`. Show real data or an honest
   empty state, never invented rows.
3. **Add an issuance as a centered dialog** (owner chose the dialog over the side panel on 23
   Nov, "This!"), using Payload's document drawer. "Organization" is labelled "Issued by". The
   signed PDF is uploaded inside the form, with the six states from the canvas: empty,
   uploading with Cancel, checking, attached with Replace and Remove, failed with the reason,
   and blocked until "Issued by" is filled. Validate the number (no "No." prefix) and the
   academic year format (`2026-2027`), per the memo-pages notes in the 21 Nov handoff. The
   header shows the live citation ("Cited as Memorandum No. 023, s. 2026-2027").
4. **Site management (super-admin).** The Accounts table is the main content (Name, Email,
   Role with a "?" explaining roles, Sign-in method); Access requests opens as a centered
   dialog (owner, 23 Nov: "model sana to"); Invite by email; "Needs attention" for failed PDFs;
   Tools: Record types (read-only list for now; editable types are after the trial), Search
   index rebuild, Redirects. Forms gets its own menu item. Scheduled publishing sits next to
   Publish on each record.

Rules for every slice: keep all server-side access checks and the publish workflow unchanged
(this is presentation only unless a slice says otherwise); show every state (loading, empty,
error); keyboard and screen-reader use; 320 px wide; both themes. Browser-test each slice and
take before/after screenshots for the owner.

Out of scope here: PDF pre-fill (after the trial; plan in the 23 Nov handoff), editable record
types, the executive orders page (G4 unanswered).

## Order and the one next action

Track 1, then Track 2 (after the storage smoke passes), then Track 3 slices 1–4. Next
action: build Track 1 on its own branch and show the owner screenshots of the new login page
in light and dark.
