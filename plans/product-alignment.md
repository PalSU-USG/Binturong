# Binturong product alignment

## Phase log

| Phase                     | State                                                     | Deliverable                                                                    |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 0: reconnaissance         | Complete, with inspection limits below                    | Architecture, gaps, affected modules, migration risks, and validation strategy |
| 1: specification and plan | Spec and account/access plan approved                     | Six dependent tasks and the later-slice roadmap                                |
| 2: execution              | All approved slices integrated on `dev`; resolutions next | Slices integrated; hosted Preview live; production not started                 |

Inspected on 19 October 2026. This is a reconnaissance report, not an approved
field-level specification or an implementation plan. During reconnaissance, no
application code, database state, dependencies, commits, branches, or remote settings
changed. The current checkpoint below records subsequent approved execution.

## Current checkpoint

Updated 19 November 2026. Local `dev` = GitHub `dev` = `debb6e3`. Vercel builds `dev`
as a Preview. No production deployment exists.

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
- **Unmerged branches:** `Hawksprey420/vercel-skill` (`8fc1494`, Vercel deploy skill for
  Codex, awaiting owner review). `phase02-domain-schema` and `test-db-56323` predate
  their integrated replacements.
- **Next action:** the owner confirms where the resolutions section lives. In parallel,
  the owner runs the admin hallway test (`plans/admin-usability.md`). After that:
  build the public resolutions section on a task branch.

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
