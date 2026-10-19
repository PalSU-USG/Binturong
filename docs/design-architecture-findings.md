# Binturong design and architecture findings

Status: design direction and implementation guidance, not a completed product specification.

This document records the current product intent, inspected design artifacts, repository state,
nearest-neighbor references, and design/architecture decisions established during the 19 October
2026 review. It is intended to give future human and agent work a durable starting point before
new prompts, schema work, frontend implementation, or design-system integration.

## Product intent

Binturong is intended to be a content-heavy public information and transparency portal for the
Palawan State University University Student Government (USG). It should behave more like an
institutional records and public-service website than a marketing landing page.

Current design shorthand:

> modern university publication × government service portal × institutional archive

The site should prioritize discoverability, accessibility, document provenance, stable URLs,
structured metadata, publication history, and long-term institutional continuity. Visual novelty
is secondary to clarity and trust.

## Primary design sources

The following artifacts are current design sources of truth for requirements and historical
visual direction:

- Binturong requirements / PalSU USG Website FigJam board:
  https://www.figma.com/board/grbw5PtS8NvkmBdZvXJQxy/PalSU-USG-Website?node-id=32-78&t=5dptj1kj0CtLkw68-0
- Project Akademya design remnants, including the former PalSU directory website concepts:
  https://www.figma.com/design/HN3YftezbKwb2jdijABe02/Project-Akademya?node-id=1057-423

The FigJam currently describes these primary areas:

- Home with PalSU/USG officer imagery, announcements, and the General Plan of Activities.
- Latest Updates with recent USG executive orders, memoranda, laws/acts, and tags.
- Student Helpdesk, initially allowed to use a Google Forms-based workflow, plus the student handbook.
- Archives for Executive, Legislative, Judicial, and opt-in College Student Governments (CSGs).
- Transparency reports, including USG financial reports by fiscal/academic year and
  accomplishment reports for USG and participating CSGs.
- Organizational chart and constitutional commissions, with CSG inclusion later.
- Contact information for OSAS units and the USG.
- A one-month freshness window for surfacing recent records before they are primarily presented
  through archive views.

The one-month rule should be implemented as a query/presentation rule, not as a record migration.
A record should keep the same identity, canonical URL, and collection while the frontend decides
whether it belongs in a recent or archive view.

## External design references

The current design language intentionally draws from multiple public-sector references, with each
source contributing a different layer instead of being copied wholesale:

- GOV.UK Design System — content hierarchy, restraint, forms, accessibility, and readable
  government-service patterns: https://design-system.service.gov.uk/
- U.S. Web Design System (USWDS) — collections, alerts, side navigation, search, filters,
  document-heavy public information, and accessibility: https://designsystem.digital.gov/
- BetterGov.PH — modern Philippine civic-tech presentation and transparency-oriented UX:
  https://bettergov.ph/
- Provincial Government of Palawan — local institutional information architecture and
  public-sector content structure: https://palawan.gov.ph/
- Malaysia Government Design System (MYDS) — modern Southeast Asian government component
  patterns and reusable React design-system primitives: https://design.digital.gov.my/
- GovTech Malaysia `kd-portal` — nearest-neighbor implementation reference because it is an
  actual Next.js + Payload CMS government portal with government-specific content models:
  https://github.com/govtechmy/kd-portal
- arXiv — reference for dense, metadata-first, canonical-document presentation for formal
  reports and institutional records: https://arxiv.org/

These references are for information architecture, interaction design, accessibility, content
presentation, and implementation patterns. Binturong must not copy the branding or national
identity of another government platform.

## Nearest-neighbor conclusion

The strongest current nearest neighbor is GovTech Malaysia's `kd-portal` combined with MYDS. It
should be treated as a donor/reference project, not as a replacement codebase.

Do not migrate Binturong wholesale to `kd-portal`. The existing Binturong repository already has
the preferred application foundation: Payload CMS, Next.js, PostgreSQL/Supabase, the current
build/test setup, and project-specific engineering guidance. A wholesale migration would create
unnecessary database-adapter, version, content-model, and configuration work.

Instead, selectively borrow from `kd-portal` and MYDS:

- civic/government information hierarchy;
- policy/record presentation patterns;
- directory and contact structures;
- alert and notice patterns;
- accessible navigation and search patterns;
- document-centric list/detail layouts;
- reusable component behavior where compatible with the local stack.

## Project Akademya: what should survive

The Project Akademya remnants contain useful PalSU-specific design DNA and should not be thrown
away. Preserve and mature these ideas:

1. **Institutional authority band** — PalSU seal/name plus a strong, recognizable header.
2. **Real PalSU photography** — campus/officer imagery used as identity-setting editorial
   photography, not as the texture behind every interface surface.
3. **Notice strip** — evolve the old development-warning strip into a real `OfficialNotice`
   pattern with information, advisory, important, warning, and emergency states.
4. **Hierarchical side navigation** — evolve the old directory-detail sidebar into a modern,
   responsive civic side-nav for Archives, Government, and Transparency sections.
5. **Direct, task-oriented information hierarchy** — retain the old bias toward getting users
   to a destination quickly instead of adding decorative landing-page copy.

The following old patterns should generally be retired rather than carried forward:

- large translucent brown panels as the primary container for most content;
- excessive backdrop blur and glass effects;
- very large 40–62 px typography throughout dense information screens;
- campus imagery as the background for document-heavy pages;
- treating every content category as a large card;
- using a display font everywhere when a highly readable information typeface is needed.

Binturong should look like the adult institutional evolution of Project Akademya, not an unrelated
template and not a literal recreation of the old directory UI.

## Target design language

Recommended synthesis:

> Project Akademya PalSU identity + MYDS/kd-portal civic UX + arXiv document density +
> GOV.UK/USWDS content discipline + Binturong's own institutional data model.

Practical visual rules:

- Prefer flat information surfaces, dividers, hierarchy, and spacing over heavy elevation.
- Use restrained corner radii and shadows; overlays/modals may use stronger elevation.
- Avoid cardifying every record. Lists and metadata rows should remain first-class patterns.
- Use PalSU/USG branding for identity, but derive exact production color tokens from approved
  branding sources rather than guessing them from screenshots.
- Keep editorial photography concentrated in hero/feature contexts.
- Keep records, reports, archives, and transparency pages visually quieter than Home.
- Use information-dense typography for metadata and records; reserve display typography for
  identity and major headings.

Suggested type scale direction, subject to final token work:

- Home statement: 44–56 px
- Page title: 36–44 px
- Section heading: 28–32 px
- Record title: 18–24 px
- Body: 16–18 px
- Metadata: 14 px
- Classification label: 12–14 px

## Recommended navigation model

Normalize the public navigation around user goals instead of mirroring database collections:

- Home
- Latest Updates
- Student Services
  - Student Helpdesk
  - Student Handbook
  - Bintanong, when integration is approved
- Government
  - Organizational Chart
  - Offices
  - Constitutional Commissions
  - CSGs when participating
- Transparency
  - Financial Reports
  - Accomplishment Reports
- Archives
  - Executive
  - Legislative
  - Judicial
  - participating CSGs
- Contact
  - OSAS units
  - USG contacts

The current flat header implementation is not sufficient for this hierarchy and should be
reworked before final navigation styling.

## Homepage direction

The homepage should feel like the front page of an institutional publication, not a SaaS landing
page. A recommended order is:

1. PalSU/USG institutional header and primary navigation.
2. PalSU/USG officer or campus hero photography with concise identity text.
3. Important advisory / official notice when present.
4. Latest Updates.
5. Student Services shortcuts.
6. General Plan of Activities / upcoming activities.
7. Transparency shortcuts.
8. Latest Issuances.
9. Institutional footer.

Avoid generic marketing slogans and decorative feature sections that do not help a student find
a service, record, report, or official update.

## Document and report presentation

Formal reports should be closer to arXiv than to Wikipedia. The canonical document remains
central, while the website provides structured metadata and a readable summary around it.

An accomplishment-report page should support at least:

- title;
- report type;
- organization;
- academic/fiscal year;
- responsible offices/authors;
- publication date;
- version;
- abstract or executive summary;
- canonical PDF/document download;
- related reports;
- related issuances or General Plan of Activities entries.

Financial reports may remain even more document-centric: strong metadata plus the official file,
with only the supporting context necessary for discovery and provenance.

Do not force every formal record into a generic blog-post body.

## Recommended Payload domain model

The current stock-like `Posts` model is useful for news-like updates, but it should not become the
universal container for every official record.

Recommended long-term collections:

### Content

- `Pages`
- `Updates` (the current `Posts` concept can evolve toward this)
- `Issuances`
- `Reports`
- `Documents`
- `Activities` / `Events`

### Governance

- `Organizations`
- `Offices`
- `People`

### Classification

- `AcademicYears`
- `Categories`
- tags where required

### Services

- Helpdesk / Payload forms or an approved external form workflow

### Media

- photography and other non-record media

### Globals

- Header
- Footer
- Homepage
- Site settings/contact configuration as needed

`Archives` and `Transparency` should generally be query/presentation layers over these
collections, not separate dumping-ground collections.

### Issuances

`Issuances` should carry structured official-record metadata such as:

- title;
- type (executive order, memorandum, act, resolution, advisory, etc.);
- document number;
- series year;
- issuing office/department;
- publication/effective dates;
- summary/body where appropriate;
- canonical document and attachments;
- academic year;
- tags/classification;
- related/superseding records if later required.

### Reports

`Reports` should support financial and accomplishment reports without making them blog posts.
Recommended fields include organization, responsible offices, academic/fiscal year, abstract,
publication date, canonical document, version, related reports, and related issuances.

### Documents

Consider a separate `Documents` collection instead of treating official PDFs as ordinary image
media. This becomes increasingly useful for provenance, versioning, checksums, metadata, future
PNPKI/signature state, accessibility variants, and stable relationships from reports and issuances.

## Current repository findings on `dev`

At the time of this review, the application is still close to the official Payload Website
starter. That is favorable because the product-specific domain model can still be introduced
without undoing a large amount of custom schema work.

Current technical foundation includes:

- Next.js 16.3.3;
- React 19.2.6;
- Payload CMS 3.90.2;
- Tailwind CSS 4.1.x;
- PostgreSQL adapter;
- Payload form builder;
- nested docs;
- redirects;
- SEO;
- search;
- Lexical rich text;
- Vitest and Playwright.

Current Payload collections are `Pages`, `Posts`, `Media`, `Categories`, and `Users`, with
`Header` and `Footer` globals.

Important gaps between the current repository and the design intent:

- `Posts` is still a generic blog/article model; it should not absorb all official records.
- Search currently targets posts rather than the complete institutional record surface.
- The Header global is a flat navigation list and is not sufficient for the planned hierarchy.
- `Users` currently provides basic Payload authentication only; no product-specific role or
  tenant model exists yet.
- `Media` currently writes uploads to local `public/media`. The intended Supabase/object-storage
  architecture for durable official documents is not implemented yet.
- The current media model is image-oriented. Formal documents may deserve their own collection.

Before a Vercel-style production deployment is treated as document-storage ready, move official
uploads to durable object storage and verify backup/recovery behavior.

## Architecture wording correction

The design board currently describes a "Headless/decoupled CMS architecture." The current
repository colocates Payload and the public Next.js frontend in one application. Payload can still
provide headless APIs, but the implementation is presently better described as a CMS-driven
full-stack Next.js architecture with a decoupled content model.

Do not claim a physically separate CMS/frontend deployment unless that architecture is actually
implemented later.

## Relationship to Bintanong engineering practices

Binturong already contains engineering practices adapted from the Bintanong project. The `dev`
branch head immediately before this document was added was commit `8848bfadaa7a1754480a37a6397140928edd9bd4`,
`docs(agents): adopt Bintanong engineering practices`.

Those existing repository instructions remain authoritative. This document does not replace them.
Future agents should preserve the imported practices around:

- conventional, scoped commits based on the actual staged diff;
- small coherent changes rather than broad unrelated cleanup;
- recoverable handoffs and durable task state;
- contract compatibility and migration awareness;
- adversarial verification rather than relying only on happy paths;
- actual-role authorization/security checks instead of privileged-test assumptions;
- test-first focused regressions for non-trivial behavior changes;
- distinguishing observed verification from assumptions;
- preserving user changes and avoiding destructive history edits.

Use Binturong's own Payload/Next.js/PostgreSQL architecture and lifecycle. Do not copy
Bintanong-specific research-pipeline phases, immutable knowledge-release rules, or project-specific
worker restrictions unless Binturong explicitly adopts them later.

## Design-system adoption rule

Do not install or wholesale-adopt MYDS merely because it is the nearest-neighbor design system.
First inventory the current local UI primitives and determine which MYDS patterns provide real
value. Prefer selective reuse/adaptation over duplicating two overlapping component libraries.

If MYDS packages are later introduced, treat that as an explicit dependency/design-system change
with its own verification and accessibility review.

## Implementation order

Recommended sequence:

1. Confirm/finalize the domain model and naming.
2. Implement the required Payload collections/relationships and persistent document storage.
3. Expand search to the approved public record surface.
4. Rework Header/navigation information architecture.
5. Establish Binturong design tokens and accessible base components.
6. Implement the public shell and homepage.
7. Implement Latest Updates and Issuance list/detail patterns.
8. Implement Transparency and arXiv-like report detail pages.
9. Implement Archives and Government/organization navigation.
10. Integrate native Helpdesk/forms only when needed; Google Forms remains acceptable for an
    initial low-complexity release.
11. Add optional Bintanong/MCP/PNPKI integrations only after the underlying records and APIs are
    stable enough to support them.

Schema and information architecture should precede cosmetic theming. A polished civic frontend
on top of an undifferentiated blog schema will create avoidable rework.

## Conversation decision log — 19 October 2026

The following decisions were established during the design/repository review and should be
preserved unless new evidence or an explicit product decision supersedes them:

1. **Binturong is not a generic student-organization website.** It is being designed as a
   public-information, transparency, student-service, and institutional-records portal for the
   PalSU University Student Government.
2. **The current `dev` codebase stays.** Do not replace it with another Payload starter or
   wholesale-fork `kd-portal`. The existing Payload + Next.js + PostgreSQL foundation is the
   chassis; external projects are donors/references.
3. **`kd-portal` + MYDS is the closest implementation/design neighbor identified so far.** Borrow
   government-domain modeling and civic UI patterns selectively rather than importing Malaysian
   identity or blindly adding a second component system.
4. **Project Akademya is a visual ancestor, not dead work.** Preserve its PalSU institutional
   identity band, real campus photography, notice-strip concept, side-navigation idea, and direct
   task-oriented hierarchy. Retire excessive blur, giant translucent panels, oversized text on
   dense pages, and image-backed information surfaces.
5. **Formal accomplishment reports are closer to arXiv than Wikipedia.** The canonical PDF or
   official document remains central, with structured metadata, abstract/executive summary,
   version/provenance, responsible offices/authors, related records, and stable download/view
   actions around it.
6. **Updates and official records are not the same content type.** Generic `Posts` can evolve
   toward announcements/news/advisories, while EOs, memoranda, acts, resolutions, financial
   reports, and accomplishment reports deserve structured domain collections.
7. **The one-month freshness rule is a view/query concern.** Records do not migrate into an
   archive collection after 30 days. Identity, URL, metadata, and collection remain stable.
8. **`Archives` and `Transparency` are presentation/query sections, not dumping-ground
   collections.** Model the underlying records correctly and derive those sections from them.
9. **Document persistence must be fixed before institutional use.** The current local
   `public/media` upload path is not the target durability model for Vercel-style deployment;
   official documents should use durable object storage with an intentional backup/recovery story.
10. **Schema and information architecture precede visual theming.** Do not polish a civic
    homepage while the backend still treats nearly all content as generic posts/categories.
11. **MCP, PNPKI, and Bintanong integration are later adapters/integrations.** The core records,
    APIs, provenance, and authorization model should be sound without depending on them.
12. **Google Forms is acceptable for Helpdesk v1.** Avoid prematurely building a bespoke ticketing
    system merely because Payload can support native forms.
13. **The design should remain recognizably PalSU/Binturong.** External design systems provide
    behavior, information hierarchy, and accessibility guidance; they do not define Binturong's
    brand.

## Agent prompt boot sequence

A future implementation prompt should explicitly require the agent to inspect and obey the
repository before changing code.

Minimum repository reading order:

1. `AGENTS.md`
2. `binturong-open-usg/AGENTS.md`
3. `docs/engineering-workflow.md`
4. this document
5. `binturong-open-usg/.agents/skills/payload/SKILL.md`
6. only the Payload reference files relevant to the change
7. `.agents/skills/supabase-postgres-best-practices/SKILL.md` for schema/index/migration work
8. `.agents/skills/supabase/SKILL.md` for Supabase storage/services/clients

For Figma-dependent work, inspect the linked FigJam requirements and Project Akademya design nodes
directly through Figma tooling when available rather than implementing from memory or screenshots
alone.

For agent harnesses that provide Superpowers-style engineering skills, use the process skills
appropriate to the task rather than invoking everything indiscriminately:

- `brainstorming` before product/design behavior is changed;
- `writing-plans` for approved architectural changes;
- `test-driven-development` for implementation behavior and bug fixes;
- `systematic-debugging` when a test/build/runtime failure occurs;
- `verification-before-completion` before claiming the task is done;
- `requesting-code-review` for substantial feature work before merge.

For Figma-capable harnesses, use the Figma inspection/design-to-code workflow and preserve the
project's existing Next.js/Payload/Tailwind conventions instead of pasting generated absolute-
positioned prototype code into production.

## Prompt-ready execution context

A future agent prompt can start from this premise:

> You are working on the `dev` branch of `PalSU-USG/Binturong`. Do not treat the current Payload
> Website starter UI or generic `Posts` schema as the finished product design. First read the
> repository instructions and design findings, inspect the linked Figma sources, and derive
> implementation work from the approved Binturong portal requirements. Preserve the existing
> Next.js/Payload/PostgreSQL codebase. Use `kd-portal`/MYDS, GOV.UK, USWDS, BetterGov.PH,
> Provincial Government of Palawan, Project Akademya, and arXiv as references according to the
> roles documented here, not as wholesale templates.

The implementation agent should explicitly separate these layers:

- **Product/source-of-truth layer:** the Binturong FigJam requirements and approved product
  decisions documented in this file.
- **Historical visual layer:** Project Akademya Figma remnants and PalSU-specific visual DNA.
- **Reference implementation layer:** `kd-portal` + MYDS patterns, adapted rather than copied.
- **Government UX layer:** GOV.UK/USWDS/BetterGov.PH civic interaction and accessibility ideas.
- **Document UX layer:** arXiv-style metadata-first formal record presentation.
- **Runtime layer:** the existing Binturong Next.js/Payload/PostgreSQL repository and its
  established engineering conventions.

### Recommended skills/process for substantial implementation

Use only the skills that match the stage; do not invoke a wall of unrelated skills.

1. Repository agent instructions / `using-superpowers` if the harness requires it.
2. `brainstorming` for product/design or architectural changes not already fully specified.
3. `writing-plans` after the architectural spec/approach is approved.
4. Payload project skill before changing collections, fields, hooks, access rules, admin, or
   publication behavior.
5. Supabase/PostgreSQL skills for storage, schema, migrations, indexes, RLS, or persistence work.
6. Figma inspection/design-to-code skills when translating approved design artifacts; inspect
   nodes directly rather than coding from screenshots alone.
7. `test-driven-development` for implementation behavior and bug fixes.
8. `systematic-debugging` when tests/build/runtime behavior deviates from expectation.
9. `verification-before-completion` before any claim of completion.
10. `requesting-code-review` for major feature slices before integration/merge.

### First architectural slice to tackle

Before a broad frontend restyle, produce an approved schema/relationship design for:

- `Issuances`
- `Reports`
- `Documents`
- `Organizations`
- `Offices`
- `People`
- `AcademicYears`
- the relationship between `Updates` and the existing `Posts` model
- durable document/media storage
- the public search surface
- hierarchical Header/navigation data

Then implement those changes in small, migration-aware, testable units before doing the full
visual shell.

## Non-goals and anti-patterns

Avoid these unless a later approved requirement changes them:

- migrating wholesale to `kd-portal`;
- turning Binturong into a generic SaaS/dashboard visual language;
- creating separate `Archive` or `Transparency` dumping-ground collections;
- moving records between collections merely because they became older than one month;
- making all government records generic `Posts` plus categories;
- building a bespoke helpdesk/ticketing system before the workflow actually requires one;
- designing the core data model around MCP rather than stable institutional records and APIs;
- exposing AI-development model/version details as a core public product feature.

## Next design decision

The next high-leverage decision is the exact content/domain schema for `Issuances`, `Reports`,
`Documents`, `Organizations`, `Offices`, `People`, and `AcademicYears`, plus how official files
are stored and related. That decision should be settled before major homepage/theming work.
