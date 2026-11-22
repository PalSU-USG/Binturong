# Binturong product alignment

## Phase log

| Phase                     | State                                                     | Deliverable                                                                    |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 0: reconnaissance         | Complete, with inspection limits below                    | Architecture, gaps, affected modules, migration risks, and validation strategy |
| 1: specification and plan | Spec and account/access plan approved                     | Six dependent tasks and the later-slice roadmap                                |
| 2: execution              | Complete: roadmap slices 1–8 integrated and pushed        | Slices integrated; hosted Preview live; production not started                 |
| 3: launch readiness       | Started 20 Nov 2026 (owner: "Go for it for now")          | Done when a staff editor, unaided, publishes one real resolution and one memo on production. Plan (approved 21 Nov, owner: "Go."): `docs/superpowers/plans/2026-11-21-phase3-launch-path.md`; replaces queue items 3–6 of `plans/codex-handoff-2026-11-20.md` |

Inspected on 19 October 2026. This is a reconnaissance report, not an approved
field-level specification or an implementation plan. During reconnaissance, no
application code, database state, dependencies, commits, branches, or remote settings
changed. The current checkpoint below records subsequent approved execution.

## Current checkpoint

**Google SSO on Preview (23 Nov 2026).** The owner's Supabase redirect correction was
verified with a canceled Google flow returning to the exact Preview callback. With owner
approval, moved the three staff SSO variables to Preview only and set Preview's
`NEXT_PUBLIC_SERVER_URL` to `https://binturong-preview.vercel.app`. Integrated candidate
`fadf15d` on `Hawksprey420/phase3-sso-integration` with an identical app tree, then
fast-forwarded GitHub and local `dev` to `b53467c`. Vercel deployment
`dpl_GY7g8pA1WGiQ7bZtaLif9cjtfufe` is READY on the stable Preview alias. The build log
confirmed Payload applied `20261121_112130_staff_access_requests` to hosted dev.

- Protected Preview smoke via Vercel CLI confirmed HTTP 200 for home and the admin
  login page, the Google button, the app's 303 to Supabase with the exact Preview
  callback, a cross-origin POST denied with 403, and a canceled callback returning
  to login with retry status. A real campus Google sign-in and live password recovery
  remain unverified on this deployment.
- Next action is for the owner to try the campus Google button on
  `https://binturong-preview.vercel.app/admin/login`. Confirm access with an existing
  staff account and rehearse fallback admin recovery before inviting staff.
- Prepared a one-page synthetic PDF and small PNG outside the repository for the storage
  smoke. Both opened with their respective parsers. The hosted upload and download checks
  still need an authenticated CMS session. No hosted test records were written or deleted.

**Preview sign-in recovered (23 Nov 2026).** The owner found the existing CMS password and
Vercel recorded HTTP 200 from `POST /api/users/login` at 03:03 Manila time. The recovery
terminal exited before confirmation and reported no saved change. The password was not reset.

**Preview deployed (23 Nov 2026).** With owner approval, fast-forwarded GitHub `dev` from
`b9d8465` to `d711d5c`. Vercel deployment `dpl_CzxuSig6FZmL6wPdpvjUSTDTwCLv` reached
READY for that exact commit. The build log confirmed Payload applied
`20261121_051921_media_storage_fields` and Next.js completed the build.

- Protected Preview smoke via Vercel CLI returned HTTP 200 for home, Executive Memoranda,
  Legislative Resolutions and the CMS login page. The unsupported Executive Resolutions
  route returned 404. The anonymous Media list returned zero rows.
- Next action is the hosted storage smoke from the [runbook](../docs/production-runbook.md#step-9-preview-smoke-checklist-task-v6)
  with an authorized CMS admin. Verify Media upload and retrieval, PDF upload and public
  download, and refusal of draft PDF access. CMS sign-in, bucket access and uploads have
  not yet been verified. No smoke-test records were written or deleted.

**Media Preview scope corrected (23 Nov 2026).** With owner approval, updated the five
existing `MEDIA_S3_*` variables in place on `pal-su-usg/binturong` using Vercel's scope-only
API edit. A fresh listing confirmed that all five now target Preview only and both access
keys remain sensitive. GitHub `dev` still points to `b9d8465`. Next action is to obtain
explicit approval for the `dev` push, automatic Preview deployment, and the Media migration
against Preview's configured database. Bucket access and uploads await the Preview check.

**Preview settings follow-up (23 Nov 2026).** The five `MEDIA_S3_*` variables now exist on
Vercel with Production scope only. Retarget these dev-project settings to Preview and verify
the variable metadata before requesting push, deployment and hosted migration approval.
The latest Production redeploy failed because `main` at `ff2ef51` contains only `README.md`.
The configured Root Directory, `binturong-open-usg`, exists on GitHub `dev` at `b9d8465`,
whose latest Preview remains ready. These findings come from read-only Vercel deployment and
variable metadata and `git ls-tree`. No application tests or storage operations were run.

**Preview preflight (23 Nov 2026).** Started from local `dev` at `fb6eed6`. GitHub
`dev` still pointed to `b9d8465` via `git ls-remote`. Restored the line-ending-only diff in
`binturong-open-usg/src/payload-types.ts` and confirmed its Git diff was empty. Only the
previously reported untracked tool output remained before this checkpoint edit.

- Read-only Vercel CLI checks on `pal-su-usg/binturong` reported `resourceConfig.fluid: true`
  and production branch `main`. Preview has all three `OFFICIAL_STORAGE_*` variable names and
  `DATABASE_URL`. The project environment listing showed none of the five `MEDIA_S3_*` names.
  This verifies variable presence only. Bucket access and uploads remain untested.
- The ready Preview for `b9d8465` ran `vercel-build`, Payload migrations and the Next.js
  build, as confirmed by its build log. The outgoing code adds the hosted Media migration
  `20261121_051921_media_storage_fields`. Application tests were not rerun for this preflight.
- Next action is to configure the five Media variables for Preview as described in the
  [runbook](../docs/production-runbook.md#step-3-vercel-production-environment-variables),
  recheck them, and obtain the owner's approval for the `dev` push, Preview deployment and
  automatic migration against Preview's configured database.

**Codex continuation (21 Nov 2026).** Local `dev` integrated memo pages and cloud readiness at
`b3a6809`. GitHub `dev` remains `b9d8465`. The [Claude handoff](codex-handoff-2026-11-21.md)
records the starting point.

- Memo branch `37fc8fe` and cloud branch `3751821` were independently reviewed. Memo checks
  passed 39 integration, eight records browser and 26 navigation browser tests. Cloud checks
  passed 18 integration tests, including fresh and populated migration proofs. The production
  build against the isolated test database returned 200 for both supported archive URLs and 404
  for four unsupported pairs. Full integration on port 45323 passed 640/645. The five account failures
  involved a leftover synthetic super-admin. All 18 checks in those three specs passed on the
  empty alternate test database on port 45322. Lint still reports the five inherited errors.
- With owner approval, Codex backed up `binturong_domain` to
  `~/binturong-backups/binturong_domain-pre-media-20261121-195825.dump`, verified the archive
  and copied checksum, and applied only `20261121_051921_media_storage_fields`. The history
  records the migration once. Both Media columns exist and the table still has three rows.
- SSO branch `Hawksprey420/sso` is implemented at `83bb70c`. Its integration candidate
  `Hawksprey420/phase3-sso-integration` at `fadf15d` combines both migration histories and
  regenerates the Payload schema snapshot against Cloud. Its production build, 42 focused
  integration checks and three mocked Chromium workflows passed. SSO stays on the candidate
  branch pending the hosted rollout. Payload retains role checks and the password fallback.
- The admin canvas source is backed up outside the repo under
  `~/binturong-backups/admin-canvas-4yJ4zBaY85xEMtGq4v4VA2`. The redesign is awaiting the
  owner's approval. Hosted buckets, the live Google callback, Preview smoke and rollout approval
  remain open. The Vercel connector required reauthentication, so Fluid compute is unverified.
- Next action is to confirm Preview's storage and Fluid settings, then obtain approval for the
  `dev` push that triggers the Preview build. Use the candidate's SSO plan for the Google OAuth
  and Supabase callback settings before its separate Preview check.

**Phase 3 progress (21 Nov 2026; pushed to GitHub `dev` at `b9d8465`, owner: "hmm you can
push it now").** Vercel Preview for `b9d8465` built (state success,
`binturong-bcjnalrpm-pal-su-usg.vercel.app`, behind Vercel login; pages not yet checked). Merged: branding (`d43b519`),
production runbook (`73a2a86`, `docs/production-runbook.md`), draft autosave with guarded
migration (`630dfc5`), admin slice 1 with review fixes (`980baec`), launch fixes B1–B5, B7
(`3ac6098`), admin slice 2 C1–C4 with review fixes (Phase C merge), E2 waiting-list test fix.
Verified on `dev`: tsc clean; `test:int` 612/612 (before Phase C; Phase C branch 614/614);
full `test:e2e` after Phase C 66/72 in a 24.7 min memory-starved run, and all six failing
files then passed alone (admin-usability + domain-transitions 10/10, domain + records +
access 11/11). E1 (GraphQL) passes on every run; nothing to fix. `npm run lint` has 5
pre-existing errors (Header, Card, Theme). Owed:
V6 Preview smoke check; G8/G9 for Phase D; Vercel/Supabase plan facts and G11 for Phase V;
copying local content (menu, pages, posts) to the hosted database (owner saw a bare Preview:
the Header menu lives only in the local database). Done 21 Nov: G3, both pending migrations on
local `binturong_domain` (backup in session scratchpad); first hosted admin via
`npm run create:first-account` (`dafa3d5`, runbook Step 5; account-bootstrap 7/7); owner ran
it on the dev cloud project and reported "I've already done it" (V5 done on dev).
Owner decisions 21 Nov 2026: Vercel plan "Hobby" (function limit 300 s, so hosted downloads
stop at 5 min, not the approved 20); G8 "Yes you ca build the memo pages"; G9 "G9 is go" =
citation "Memorandum No. 023, s. 2026-2027" from the linked academic year label (replaces the
"s. 2026" stand-in in the plan); G11 "G11 go" = `@payloadcms/storage-s3` on Supabase Storage;
G1 "maybe you can try to find anything from USG online as sample content (then pull its
images)" = replace the Payload demo posts with public USG content. Done on local
`binturong_domain` 21 Nov: demo posts 1–3 and media 1–3 deleted; posts 9–11 published, our own
summaries with source links and a "Sample post … Replace or delete before launch" line (PSU news
16 and 21 Dec 2022 with one PSU photo each; Palawan Daily News 20 Mar 2020, text only because
the photo is the paper's). One-time script kept outside the repo; not yet rendered in a browser. G4 unanswered (executive
orders page stays "later"). Admin redesign A–D (issuance form uploads its own PDF; one
vocabulary; three main task cards; empty-database setup checklist) proposed, awaiting answer. Full `test:int` on this machine: 615/625, all 10 failures 5 s timeouts
or knock-on effects in upload/search files at 1.9 GB free RAM; upload file still fails alone
under that load, untouched by this change. B6 heading
skip is CMS content (seed `contact-page.ts` h3 after h1). Run the full browser suite in two
halves on this machine; one 25 min run times out under memory pressure.

Updated 19 November 2026. GitHub `dev` = `debb6e3`; local `dev` is ahead by the four
merges below (not pushed). Vercel builds GitHub `dev` as a Preview. No production
deployment exists.

- **Integrated on `dev`:** access (`00f3b1f`), domain foundations (`6ec0427`), private
  documents, search (`c5f29e2`), navigation (`0e7dabd`), record sections (`cd703a4`),
  identity/home (`7fdb83f`), inner pages (`d53c142`), UI consistency (`4bcf88c`), admin
  usability (`081ee0a`), test ports (`32e529e`), Data API lockdown (`e88a49b`) and admin
  follow-ups (`debb6e3`). Each slice's evidence and open follow-ups are in its own note:
  `plans/public-search.md`, `plans/record-sections.md`, `plans/identity-home.md`,
  `plans/admin-usability.md`. Last full run (15 Nov, admin usability): 588 integration,
  65/67 browser (the 2 failures were leftover test data; rerun 9/9), tsc and build pass.
- **Owner decision (15 Nov 2026):** USG will publish Senate resolutions (then memoranda
  and orders) on the site, and resolutions get their own public section. Sample: a USG
  Senate resolution PDF the owner holds (real names and amounts; not tracked). It maps
  to `Issuances` (`type: resolution`). The sample's series is an academic-year range
  ("s. of 2026-2027"). **Settled 19 Nov 2026** (owner chose "Keep seriesYear = 2026 and
  add a link to the Academic Year record", then "Skip the check"): store the start year in
  `seriesYear`, link the existing `academicYear` relationship, and show its `label`. No
  series text column (a third copy that could disagree) and no server check that the two
  match, because calendar-year series such as an EO "s. 2027" issued in January 2027 fall
  inside AY 2026-2027. Revisit if real resolutions use a label the year cannot express.
  The letterhead also gives the official unit name "University Student Government —
  Tiniguiban", `usg.psu.edu.ph`, `usg@psu.palawan.edu.ph` and the office address;
  use them only after the owner confirms.
- **Hosted dev deployment (17 Nov):** Vercel project `pal-su-usg/binturong` (Root Directory
  `binturong-open-usg`, Node 22) builds `dev` as Preview behind Vercel SSO. `vercel-build`
  runs `payload migrate` before `next build`. The Supabase project `ntzwpcnsjpijfhrgvvin`
  is the **dev** database, not production: it held a template-era dev-push schema (66
  tables, no RLS, full `anon` grants, 2 users with hashes) while the Data API was on; the
  owner turned the Data API off and wiped `public`, then all 15 migrations ran, ending with
  `20261117_053700_data_api_lockdown`. Preview secrets were rotated. Open: no first admin
  on hosted (bootstrap guard is local-only), no hosted storage bucket, production needs a
  separate Supabase project.
- **Local services (17 Nov, owner: "Just move the ports", then "move all of them"):**
  Windows reserves 56283–56382. Containers: `binturong-db-45323` (volume
  `binturong-test-db-56323`; main `.env`, database `binturong_domain`, owner dev server),
  `binturong-db-45322` (volume `supabase_db_binturong-open-usg`, network alias
  `binturong-domain-review-db-56322`) and `binturong-storage-45321`. Test guards use
  45321–45323 since `926ed88`. Old containers are kept, stopped, with an `-old` suffix.
  Main `.env` has no `OFFICIAL_STORAGE_*`, so the dev server cannot upload documents.
  Backups: `C:/Users/Hawksprey/binturong-backups/`. Never write test data to
  `binturong_domain`. Starting Docker Desktop also starts Bintanong's Supabase
  containers; ask the owner first.
- **Storage follow-ups (owner: record, not blocking):** add a total download
  deadline (~10 min) and per-IP rate limiting in front of `GET /api/documents/:id/file`;
  give the post-verification authorization/bucket checks their own timeout; the
  decoded-stream cap may reject legitimate PDFs with very large object streams;
  production serverless file tracing of the pdf-lib worker path is untested.
- **Owner inputs:** approved logo/seal/palette (the logo is a placeholder), section intro
  copy, office branches, CSG list and commissions data, PalSU portal link, and the
  Header/Footer template content (template posts, "Payload" links) remain owner decisions.
  Publishers must link new sections in the Header global.
- **Workflow notes:** no AI attribution trailers; Codex sandbox needs the oh-my-posh cache,
  the repo `.git` and loopback network allowed, and cannot write git metadata, so the
  coordinator commits its work. Bash cannot fork on this machine; use PowerShell.
- **Resolutions page (19 Nov, owner: "yes" to its own section, then "Yeah go ahead" on
  `/archives/legislative/resolutions`):** the path follows the FigJam board's "Archives
  (Executive dept, Legis dept, …)" and the design guide's branch-then-type breadcrumb.
  `RecordListPage` gained `fixedType`; the URL cannot change it. Branch
  `Hawksprey420/resolutions-archive` (`b5ea0c7`): list-page int 9/9, records e2e 7/7
  (published resolution shown; memorandum, draft and executive resolution hidden; 320 px
  no overflow), tsc, eslint and build pass. Not yet: independent review, full suites,
  light/dark visual check. A publisher must add the Archives side-menu link (Header global).
- **Download deadline (19 Nov):** branch `Hawksprey420/download-deadline` (`d76040f`) caps
  total PDF delivery, raised to 20 minutes in `eb3d8e5` (owner: "Raise it to twenty") so
  slow connections can finish a 50 MB file. Open: the Vercel function max duration is
  unknown from the repo; if it is shorter, Vercel ends the download first.
- **Test DB cleanup (19 Nov, owner "yes"):** 29 synthetic leftover rows deleted from
  `binturong_test` (45323). Account tests then pass. Still failing on `dev` code:
  `domain-schema` and `domain-references` GraphQL tests, because the anonymous
  `Organizations(draft: true)` query now returns an error (data `null`) where the tests
  expect `[]`. It fails closed (no leak); find which change altered it and fix the test
  or the response.
- **Merged 19 Nov (owner: "merge them"), local only:** `vercel-skill`, `checkpoint-refresh`,
  `download-deadline` (`9b5c179`) and `resolutions-archive` (`666a516`); dev at `3e7b0f5`,
  tsc clean. Both code branches had independent reviews: MERGE WITH FOLLOW-UPS, no
  P0/P1; follow-ups applied (structural 404, real-query test, spec and design docs).
  Open from review: per-IP download rate limiting; Vercel function max duration.
  `phase02-domain-schema` and `test-db-56323` predate their integrated replacements.
- **Executive sample (19 Nov):** the owner's Memo 023, s. A.Y. 2026-2027 (real names; not
  tracked) maps to `Issuances` `type: memorandum`, `seriesYear` 2026 plus `academicYear`,
  issued by the President's office (Executive). Executive memos also number by academic year.
- **Next action:** the owner chooses executive record-type pages (memoranda only, or also
  executive orders) under the same `fixedType` route; then generalize
  `archives/[group]/resolutions` into an allow-listed branch/type route. Pushing `dev`
  needs owner approval. The owner runs the admin hallway test when possible.

## Sources and reconnaissance snapshot

Primary context: [workspace instructions](../AGENTS.md), [app instructions](../binturong-open-usg/AGENTS.md),
[engineering workflow](../docs/engineering-workflow.md), [design guide](../docs/design.md),
and [design findings](../docs/design-architecture-findings.md).

- Reconnaissance checkout: `dev`, HEAD `c9717ed8b5618a82d5b10278ce39baf88a2133d5`.
  Git inspection confirms a normal checkout with one worktree.
- Existing dirty work includes root/app instructions, environment examples and
  ignores, README, lint/test configuration, package scripts, `payload.config.ts`,
  generated `payload-types.ts`, and engineering guidance. Untracked work includes
  the initial migration, Supabase configuration, database guard/tests, local guide,
  and setup checkpoint. Preserve all of it; do not treat HEAD as containing setup.
- [Local setup checkpoint](local-supabase-setup.md) holds the earlier database
  comparison, test/build results, cloud link, and outstanding platform differences.
  Setup was not repeated during this reconnaissance.
- A future worktree created from HEAD alone would omit those setup changes. The
  execution plan must deliberately carry its required baseline without sweeping
  unrelated owner changes into a commit.

## Current architecture

The app is a CMS-driven full-stack Next.js application. Payload admin, REST,
GraphQL, and the public frontend share one deployment and configuration. It has
headless APIs, but no separate CMS/frontend deployment exists.

| Area           | Observed implementation                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Runtime        | Next 16.3.3, React 19.2.6, Payload 3.90.2, PostgreSQL adapter, Node 22.22.3                            |
| Styling        | Installed Tailwind 4.3.3, CSS semantic variables, legacy Tailwind configuration, Geist fonts           |
| Collections    | Pages, Posts, Media, Categories, Users; plugins add forms, submissions, redirects, and search          |
| Globals        | Header and Footer; no institutional homepage/settings model                                            |
| Editing        | Lexical, page blocks, drafts/versions, preview, scheduled publication, cache/sitemap hooks             |
| Public routes  | `/`, generic `/[slug]`, `/posts`, post detail/pagination, `/search`; preview and seed endpoints        |
| Admin/API      | Payload-generated admin and REST/GraphQL integration under `src/app/(payload)/`                        |
| Search         | Post-only index with title/slug/meta/category projections; public display uses post cards              |
| Storage        | Media uploads to `public/media`, public reads, image derivatives; no configured object-storage adapter |
| Authentication | Payload `users`; login-only helpers, no editor/publisher/admin or organization scope                   |
| Persistence    | Automatic schema push disabled; initial Payload migration present but uncommitted                      |
| Tests          | One privileged API smoke test, nine database-target guard cases, four browser smoke tests              |

Existing reusable primitives are button, checkbox, input, label, select,
textarea, card, and pagination, with Radix dependencies for some behaviors.
Reuse their behavior and token integration before considering another UI library.
The current archive renderer is a post-card grid, not the target institutional archive.

## Current versus target and affected modules

Paths in this table are relative to `binturong-open-usg/`.

| Gap                                        | Target and implication                                                                                                              | Affected files/modules                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Generic Posts as the only editorial record | Separate Issuances, Reports, Documents, Activities, Organizations, Offices, People, AcademicYears; settle how Posts becomes Updates | `src/collections/`, `src/payload.config.ts`, generated types, migrations                        |
| Login grants broad management rights       | Editors prepare, publishers publish, admins manage accounts; enforce transitions and role assignment on the server                  | Users, `src/access/`, collection hooks, preview/jobs/seed routes, tests                         |
| Public local uploads                       | Durable official files remain private before publication, with explicit authorized delivery and recovery                            | Media, new Documents, plugins, storage configuration, document routes, Next image configuration |
| Post-only search                           | Approved published updates and record metadata with correct type/canonical URL and no private-file leakage                          | `src/plugins/index.ts`, `src/search/`, search route, hooks/reindex behavior                     |
| Flat Header array, maximum six rows        | Seven primary destinations with grouped mobile/desktop navigation and contextual section indexes                                    | Header config/components, `src/fields/link.ts`, CMSLink, Footer, types/migrations               |
| Generic visual identity                    | PalSU authority band, genuine approved imagery, readable type, restrained semantic tokens and surfaces                              | frontend layout/CSS, Tailwind config, Logo, UI primitives, metadata/OG assets                   |
| CMS-block homepage and starter fallback    | Institutional publication front page with notices, actual updates/records, services, and activities                                 | frontend page routes, `src/endpoints/seed/home-static.ts`, blocks, homepage/settings model      |
| Blog card/detail assumptions               | Metadata-first list/detail patterns, canonical PDF actions, provenance and related records                                          | CollectionArchive, Card, heros, RichText, new record modules/routes                             |
| No dedicated public sections               | Archives/Transparency are filtered views; Government separates offices from holders                                                 | frontend routes/query modules, governance collections, filters, breadcrumbs, side navigation    |
| Template verification                      | Role, publication, file privacy, migration, record identity, responsive and keyboard regressions                                    | `tests/int/`, `tests/e2e/`, test helpers and fixtures                                           |

The thirty-day freshness rule belongs in queries. Crossing the boundary must not
move records between collections, change their identifiers, or break canonical URLs.

## Trust boundaries and release risks

These are source findings, not claims that production exploit tests were run.

1. `Users/index.ts` applies `authenticated` to create/read/update/delete. Any
   logged-in CMS user has those collection permissions today. Role assignment and
   account administration need explicit server-side restrictions before adding roles.
2. `next/seed/route.ts` accepts any authenticated user; its seed implementation
   clears collections and versions. Keep this outside ordinary editorial operation.
   Jobs execution also currently accepts any authenticated user.
3. `ArchiveBlock/Component.tsx` queries posts without `overrideAccess: false` or
   a publication predicate. Payload Local API defaults bypass collection access.
   A published page containing this block can query records outside public policy.
   This path needs a focused draft-disclosure regression before changing it.
4. Public post/page detail and main list queries already enforce access in their
   normal public paths. Preserve those protections while auditing related content,
   redirects, globals, previews, and caches. Do not assume every Local API call leaks.
5. Search plugin 3.90.2 defaults to `syncDrafts: false` and `deleteDrafts: true`.
   The current public search query bypasses collection access, but that alone does
   not prove draft indexing. Exercise publish/edit/unpublish/delete and stale-index
   cases before extending the index or claiming publication safety.
6. Media reads and the `public/media` path cannot enforce private draft documents.
   A private bucket alone is insufficient if a delivery route or signed URL bypasses
   the record's current publication/authorization policy.
7. Earlier read-only setup inspection found broad cloud Data API grants and no RLS
   on application tables. Payload sessions do not propagate Supabase JWT identity;
   the adapter's privileged role bypasses RLS. Plan grants, exposed schemas, and
   effective-role tests together. No blanket `auth.uid()` policy is justified.

## Schema, data, and migration implications

- Payload remains the migration authority for its managed tables. Do not introduce
  a parallel Supabase table-migration history or edit an already-applied baseline.
- Earlier metadata comparison matched 66 tables, 566 columns, 163 constraints,
  310 indexes, and 69 enum values. Cloud still needs reviewed adoption of that
  baseline because its history contains only `dev`; the table-creation migration
  must not be executed on its existing schema.
- New collections create tables, relationship tables, constraints, indexes, and
  draft/version structures. Plan defaults/backfills and an upgrade against existing
  records, not just creation on an empty database.
- Keep existing numeric IDs, relationships, `/posts/*` links, redirects, SEO,
  search projections, preview paths, and scheduled-publication behavior compatible
  until an explicit Posts/Updates migration is designed. A label-only change and a
  collection-slug rename have different persistence and URL consequences.
- Preserve offices independently of people and their terms. Specify organization
  ownership, CSG participation, identifier uniqueness, publication dates, record/file
  versions, and attachment visibility before finalizing fields and constraints.
- Existing accounts need a deliberate privileged bootstrap/backfill; new users
  must not self-assign publisher/admin permissions. Do not infer roles from names.
- Changing navigation needs a compatible conversion of stored Header/link data.
  Generated types and admin import maps are derived artifacts, not hand-edited models.
- Moving files requires a manifest, byte/checksum verification, stable relationships,
  retry/conflict behavior, and a recovery path. Confirm which original files exist;
  database media rows alone do not establish that their bytes are available.
- Local/cloud application schema equivalence is not complete platform parity.
  The setup checkpoint records PostgreSQL minor-version differences, 14 configuration
  differences, absent buckets, and restarting Vector collectors. No cloud changes
  are part of this reconnaissance.

## Visual and reference inspection

Direct FigJam inspection of [requirements node 32:78](https://www.figma.com/board/grbw5PtS8NvkmBdZvXJQxy/PalSU-USG-Website?node-id=32-78)
confirms the home, updates, helpdesk/handbook, archive, transparency, organization,
contact, and freshness requirements. Its older alternatives do not supersede the
repository's later arXiv-style reports or query-only archive decisions.

Project Akademya's linked page `1057:423` was inspected through metadata, then
high-fidelity context/renders for [Home 1072:424](https://www.figma.com/design/HN3YftezbKwb2jdijABe02/Project-Akademya?node-id=1072-424)
and [directory detail 1202:140](https://www.figma.com/design/HN3YftezbKwb2jdijABe02/Project-Akademya?node-id=1202-140).
Retain the institutional band/seal, documentary imagery, notice concept, and
side-navigation structure. Retire the heavy blur, translucent brown surfaces,
image-backed dense content, fixed desktop positioning, and oversized interface text.

The frame exposes limited white/Segoe UI style definitions and a Fluent button
instance. This is not an approved Binturong token library. Code Connect inspection
is blocked by the account's plan/seat; no empty-mapping claim is made. Exact brand
tokens and approved reusable photography still need authoritative sources.

Selected reference inspection stayed within the roles assigned by the design docs:

- [kd-portal collection registration](https://raw.githubusercontent.com/govtechmy/kd-portal/main/src/collections/index.ts)
  separates policy, files, directories, and broadcasts. Its [configuration](https://raw.githubusercontent.com/govtechmy/kd-portal/main/src/payload.config.ts)
  combines search with S3 storage but uses MongoDB. Its [dependency baseline](https://raw.githubusercontent.com/govtechmy/kd-portal/main/package.json)
  uses Next 15 and Tailwind 3, unlike this app. Borrow domain/presentation ideas;
  do not copy adapters, dependencies, or its default-account initialization.
- [MYDS](https://design.digital.gov.my/en), [USWDS collections](https://designsystem.digital.gov/components/collection/),
  and [GOV.UK breadcrumbs](https://design-system.service.gov.uk/components/breadcrumbs/)
  remain references for civic interaction, metadata lists, and orientation. Existing
  primitives have not demonstrated a need for wholesale MYDS installation.
- [arXiv version availability](https://info.arxiv.org/help/versions.html) supports the
  document/version reference role. Binturong's approved record model remains primary.

Source-level visual gaps include the Payload logo/title/social metadata, absent
institutional navigation, post-card grids, and incomplete record-specific states.
`tailwind.config.mjs` references `--text` without a definition found in frontend CSS.
The page is initially hidden by `html { opacity: 0 }` until theme JavaScript adds
`data-theme`, with no server theme attribute in the layout. Test that failure path
as part of the shell slice. Contrast and responsive quality are not certified here.

## Validation strategy and evidence limits

- Schema: run new Payload migrations on fresh and existing-data disposable databases;
  inspect generated SQL, relationships, defaults, uniqueness, failure rollback, and
  repeated application. Establish hosted baseline adoption separately.
- Authorization: exercise anonymous/editor/publisher/admin sessions through REST,
  relevant GraphQL, previews, and Local API with access enforced. Attempt forged
  role/owner/status fields, denied account writes, unpublished relationships, direct
  file access, and cross-organization access only if that scope is adopted.
- Publication/storage: test missing official files, interrupted/repeated uploads,
  conflicting replacements, concurrent publication, unpublish/delete, expired links,
  retained versions, and backup/restore. Never seed or reset shared data as a test.
- Search/records: verify stable canonical links and metadata across the freshness
  boundary, query encoding, empty/no-results/error states, pagination/filter URLs,
  reindexing, and removal of private or unpublished records from all public surfaces.
- UI: test narrow/desktop layouts, 200% zoom, keyboard/focus and disclosure behavior,
  reduced motion, slow/missing data, JavaScript failure, both supported themes, and
  computed contrast. Inspect actual rendered output against the approved direction.
- Release checks: applicable lint, `tsc --noEmit`, integration/browser suites,
  production build, final diff, and independent review before integration. Follow
  the repository's scoped conventional commits and explicit authorized push workflow.

Earlier setup recorded 10 passing integration tests, four browser smoke tests,
type checking/build success, and five pre-existing Header/Card/Theme lint errors.
Those results were not rerun or promoted into product acceptance in this phase.
The browser smoke suite still asserts the starter homepage and does not validate
the requested institution, roles, file privacy, or record lifecycle.

The existing production server started successfully against the verified local
database and was stopped after the inspection attempt. The requested in-app browser
reported unavailable and discovery returned no browsers. No substitute browser was
used; live visual, responsive, zoom, and keyboard inspection remain unverified.

## What must remain unchanged for now

Preserve owner changes, existing IDs/content, applied migration history, and the
working Payload/Next/Postgres foundation. Do not rename Posts, redesign the homepage,
guess brand colors, install another component system, move older records into an
archive collection, publish synthetic content, or alter cloud grants/config/history
as a side effect of reconnaissance. Helpdesk may remain an approved external form.
MCP, PNPKI, Bintanong, SSO, and a custom helpdesk remain later integrations.

## Next action

Continue from the current checkpoint above; its next action is authoritative.
