# Binturong product alignment

## Phase log

| Phase                     | State                                  | Deliverable                                                                    |
| ------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| 0: reconnaissance         | Complete, with inspection limits below | Architecture, gaps, affected modules, migration risks, and validation strategy |
| 1: specification and plan | Written spec awaiting review           | Resolve domain contracts and write coherent implementation slices              |
| 2: execution              | Not started                            | Implement only after the applicable planning workflow permits it               |

Inspected on 19 October 2026. This is a reconnaissance report, not an approved
field-level specification or an implementation plan. During reconnaissance, no
application code, database state, dependencies, commits, branches, or remote settings
changed. The current checkpoint below records later Phase 1 progress.

## Current checkpoint

- Verified setup committed at `c8b1a54`; ESLint loading fix at `b151180`.
- Bintanong workflow rechecked and enforced in `1fac880`; worktree ignore in
  `f72edf2`. These are local commits; no push, cloud migration, or config push made.
- Fresh setup verification: `npm test` passed 10 integration and 4 Chromium tests;
  `tsc --noEmit --incremental false` and production build passed. Changed-code lint
  has no errors; full lint still has five existing errors and eight warnings.
- Verification ran with the preserved owner `src/payload-types.ts` changes present.
  They remain uncommitted and byte-identical to the original owner state. An isolated
  implementation must regenerate/check its own derived types before runtime changes.
- The user approved the domain/publication foundation in conversation. Written spec
  review is next; no product implementation has started.
- Active worktree: `.worktrees/domain-publication`, branch `feat/domain-publication`,
  created from `062ca84`. This is documentation-only work: runtime environments and
  dependencies were not installed/copied and no database/browser tests were rerun here.
- Written spec: [domain/publication design](../docs/superpowers/specs/2026-10-19-domain-publication-design.md).
  Self-review checks scope, missing definitions, contradictory states, and compatibility.
- Independent spec review identified live-surface permissions, version retention,
  and referenced-metadata transitions as gaps. The spec now defines each, including
  explicit transition audit fields because Payload does not supply a publishing actor.
  This was a document review, not verification of unimplemented runtime behavior.
- The subsequent authorized setup copied 140 rows in 59 tables, including CMS users
  and password verifiers, into local development. Row fingerprints match the cloud
  snapshot; all 39 sequence states were checked after recovering five excluded
  counters. All 32 media files match recorded sizes. The test database and owner
  types were unchanged; the post-copy production build passed. The main checkout's
  setup checkpoint holds transfer evidence; private exports are not in this branch.
- Local production HTTP smoke passed for seven published routes/indexes and all
  32 media files. This is delivery verification, not visual or login verification.
- Main setup evidence is committed at `e14f87c`; the initial written spec at
  `4f54953`. This branch's follow-up records the user's full CMS credential-copy
  decision. Independent final transfer review found no documentation blockers.
- Latest request: simplify the spec and add super-admin. The revised spec uses
  shorter wording and one role table. Proposed scope: admins manage editors and
  publishers; super-admins manage admin/super-admin accounts. Preserve the last
  active super-admin. This is documentation only; account roles are unchanged.
- Revision checks: Prettier, local links, contract/role consistency, placeholder
  scan, and diff whitespace passed. App tests/build were not rerun for prose edits.

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

Review the written domain/publication spec. After user approval, write the
implementation plan; do not reopen the already-settled ownership, role hierarchy,
foundation design, or worktree consent.

## Phase 1 working brief

The intended outcome and visual direction remain those in the design guide.
The first architectural spec covers domain and publication foundations. Storage,
public search, navigation, tokens, shell/home, record patterns, and the derived
Archives/Transparency/Government views follow as dependent slices.

Carry forward the settled decisions: editors prepare, designated publishers
publish, administrators manage accounts, official files remain private before
publication, and Payload owns application migrations. Preserve numeric IDs and
existing Posts URLs/relationships while refining the Updates presentation.

Approved foundation: separate structured record collections, keep Posts as the
existing editorial collection initially, and use Payload drafts/versions for
publication. Editors prepare draft revisions while the published revision remains
visible; publishers/admins publish or withdraw. Validate metadata and the canonical
file before publication. Preserve published file bytes through new document
versions, and gate public file delivery through published-record references.

User decision: USG staff manage all records at launch, including submissions from
participating CSGs. Leave room for multi-tenancy if later required or justified.
Model organization/source attribution separately from editorial permission. Do
not add tenant memberships, CSG logins, or claim tenant isolation in v1. A later
tenant feature needs explicit membership, scope, and effective-role tests; an
organization relationship alone does not provide isolation.

User decisions: administrators inherit publishing authority; add a super-admin role.
Use super-admin > admin > publisher > editor. The written spec defines account
management and last-super-admin protection. A custom permission builder stays deferred.

User authorized worktrees for execution. Reuse that consent when implementation
starts; first preserve/carry the required uncommitted setup baseline deliberately.
Do not create a worktree from HEAD and assume the current setup is present there.

User clarified local Supabase must mirror the hosted target for a seamless workflow,
with existing CMS data and relationships as the immediate priority. The requested
development snapshot is distinct from the synthetic test database. Local/cloud login
credentials were explicitly included at the user's request. The requested snapshot
is now imported; active sessions, runtime state, environment secrets, and migration
history remain local. File presence and sizes were verified separately from media
rows; cloud file checksums and real-password login remain unverified.
Schema/migrations, buckets/access rules,
and role/publication behavior remain parity requirements. Ports, origins, secrets,
and mail destinations may differ. The existing 14 config differences and platform/
security/storage gaps remain reconciliation work, not an accepted final mirror.

The next artifact is the written architectural spec, followed by its review and
the implementation plan. Phase 2 has not started.
