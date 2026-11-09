# Placeholder identity and institutional homepage

Status: Draft for owner review. Nothing here is implemented or approved.

## Goal and basis

Give Binturong a semantic design-token layer with neutral placeholder values, then
build the homepage as an institutional publication front page from real published
content. Real PalSU/USG brand values must later drop in by editing tokens only.
Sources: [design guide](../../design.md) (Global page shell, Home layout, Visual system),
[findings](../../design-architecture-findings.md), [domain/publication design](2026-10-19-domain-publication-design.md),
[product alignment](../../../plans/product-alignment.md) (visual identity and homepage
rows, "What must remain unchanged"), and the approved navigation and public-search
specs on their branches. Calm publication feel: energy 1, rhythm 1, motion 1.
Inspected at `da406cf` only; contrast, rendering and cache behavior are unverified.

## Dependencies (explicit)

Implementation starts only after these are integrated into `dev`:

1. **Navigation** (`Hawksprey420/navigation`): owns the authority band, primary
   navigation, footer, text wordmark in the header and the fix for `html { opacity: 0 }`.
   This slice supplies the tokens they consume and must not restyle or rebuild them.
2. **Public search** (`Hawksprey420/public-search`): owns `searchTargets` (label, canonical
   path, `live` flag per collection). The homepage reuses it to decide which record
   types may link; it must not keep a second list of live routes.

Record detail routes (`/issuances/[slug]`, `/reports/[slug]`) are a later slice. Until
they exist the homepage links to Updates only.

## Findings in current code

- Colors are shadcn-style neutrals (`--background`, `--primary`, `--muted`, ...) in
  `globals.css`, light and `[data-theme='dark']`. `--success/--warning/--error` are pale
  fills with no paired foreground; no brand layer exists.
- `tailwind.config.mjs` uses `var(--text)` for prose body and headings. `--text` is
  defined nowhere (confirmed by search of `src/`), so prose color falls back to inherited.
- `html { opacity: 0 }` until theme JavaScript sets `data-theme`; the layout renders no
  server theme attribute. Navigation fixes this; this slice's tests must not reintroduce it.
- `--radius` is 0.625rem; the guide asks for low-radius, flat surfaces. Geist Sans/Mono
  is installed and used; the guide prefers an existing family, so no font is added.
- `Logo` loads a remote Payload logo; metadata and OG say "Payload Website Template",
  `twitter.creator` is `@payloadcms`, and the OG image is Payload template art.
- The homepage is `[slug]` with slug `home`; when no Page exists it renders
  `homeStatic` (Payload starter copy). That fallback is the starter experience to retire.
- Collections already present: Posts (categories, publication state), Activities
  (`eventDate`), Issuances, Reports, Documents. No collection models a notice/advisory.

## Token architecture

Three layers in one file, `src/app/(frontend)/tokens.css`, imported before `globals.css`
rules. Components use only layer 3 (Tailwind utilities already bound to it).

1. **Brand** (`--brand-*`): the only layer a real palette edits. Placeholder values are
   neutral greys with one neutral dark "ink" for primary. No hue is invented, nothing is
   sampled from screenshots, no mark is recreated. Marked with a comment block listing
   the inputs expected.
2. **Semantic** (`--background`, `--foreground`, `--surface`, `--muted-foreground`,
   `--border`, `--primary`, `--primary-foreground`, `--link`, `--focus-ring`,
   `--status-{info,warning,error,success}-{bg,fg,border}`): mapped from layer 1. Existing
   shadcn names are kept so current primitives keep working; names the guide lists
   (text/background/surface/border/brand/status) are covered by these. Light and dark.
3. **Scale**: type roles from the guide (`home statement 44-56`, page title, section,
   record title, body, metadata 14, label 12-14), spacing scale, `--radius` 0.25rem,
   one overlay shadow, 44 px minimum target size, one content measure.

Rules: no raw color in components; every status uses text plus an icon or label, never
color alone; hierarchy must hold in greyscale. `--text` is removed in favor of
`--foreground` (one definition, no alias). Focus ring is at least 3:1 against adjacent
colors. A hostile or missing `data-theme` falls back to the light values.

Contrast is enforced as data, not review: a test reads the token file, resolves each
foreground/background pair (body, muted, link, primary button, each status, focus ring,
border on background) in both themes and asserts 4.5:1 (3:1 large text and UI parts).
It also fails on any `var(--x)` in CSS or Tailwind config with no definition.

## Placeholder identity

- Text wordmark "Palawan State University / University Student Government" is the
  navigation slice's header treatment; this slice replaces `Logo` and metadata so no
  Payload brand remains in public output: site name, title template, description,
  `twitter.creator` removed, default OG image removed (no approved image exists).
- Favicon files are Payload's. Replace only when the owner supplies an icon; otherwise
  list as outstanding. No seal, crest, gradient, illustration or hero photograph.
- Admin UI branding is out of scope.

## Homepage

Server-rendered, code-owned page in publication order, using the design guide's Home
layout minus anything without real data or an approved asset:

| Section | Source | Rule |
| --- | --- | --- |
| Statement | static text | Text only, compact, no photograph; wording per guide, owner-approved |
| Official notice | see Open decision 1 | Rendered only when one qualifies; absent otherwise |
| Latest Updates | published Posts, newest `publishedAt` first | 5 rows: date, category label, title, link |
| Latest issuances/reports | Issuances, Reports | Only types whose `searchTargets` entry is `live`; otherwise omitted |
| Student Services | navigation global links | Verified links only; unresolved items omitted, never `#` |
| General Plan of Activities | Activities, `eventDate` today or later, soonest first | 5 rows with date, title; link to full list only when a route exists |
| Transparency | navigation global links | Same rule as services |

Query module `src/home/` returns plain typed data per section. Each query applies
published-only access through the Local API with `overrideAccess: false` and no draft
reads, selects only public fields, and limits rows. A query error throws to the error
boundary; an empty array is rendered as an honest empty state ("No updates have been
published yet."), never confused with failure. No section is hidden because it is empty,
except the notice and non-live record types. Age never removes a record from its own
collection; "latest" is a presentation query.

Layout uses flat rows, thin dividers and headings with a landmark/heading order; no
card per record, no image behind dense content. One column on mobile, reading order
equals DOM order, 320 px and 200% zoom without horizontal scroll.

`homeStatic` and its starter fallback stop being rendered at `/`. Existing `home` Page
documents are left untouched in the database, and `/home` behavior is unchanged
(Open decision 3). Revalidation reuses the existing publish hooks; the plan verifies that
publishing, unpublishing or deleting a Post/Activity refreshes `/` and does not leak a
draft.

## Security and integrity

- No new write path, collection, migration or dependency. Reads only.
- Drafts, unpublished and private files never appear: tests publish, unpublish and
  schedule-draft synthetic records and assert absence. Links use canonical slug paths,
  never file URLs or storage keys.
- Rich text is not rendered on the homepage; titles render as escaped text.
- Retries and concurrency are trivially safe (idempotent reads). A stale cached homepage
  is the real risk; see revalidation above.

## Verification

Token contrast and undefined-variable tests; query tests against the guarded test
database with synthetic data (published only, ordering, limits, past activities
excluded, non-live types omitted, query failure surfaces); render tests for every empty
state; Playwright at 320 and 1280 widths, keyboard order, visible focus, no console
errors, no `opacity: 0` flash with JavaScript disabled. Not claimed: color accuracy
against real branding, screen-reader testing with real assistive technology.

## Out of scope

Real seal/logo/palette, photography, record detail/archive/government pages, activity
calendar, dark-mode toggle redesign, search changes, navigation changes, admin theming,
Bintanong, new fonts or component libraries, publishing any content.

## Open owner decisions

1. **Official notice source.** No model exists. Recommended: a Posts category named
   "Notice"; the newest published Post in it from the last 14 days is shown. No schema
   change; editors already know Posts. Alternative (a homepage global with expiry) is
   better editorially but needs a migration and its own review.
2. **Statement text.** Recommended: "Official information, student services and
   institutional records." (from the design guide) under the text wordmark.
3. **Existing `home` Page.** Recommended: code-owned front page; leave any stored Page
   untouched and unrendered at `/`. Alternative: render its content above the sections.
4. **Rows per section.** Recommended: 5 updates, 5 activities, 5 records.
5. **Activity visibility.** Recommended: show only upcoming activities; past ones
   remain on their own records/list later.

## Brand inputs still needed

- Approved PalSU seal and USG logo originals, permitted variants, clear space, minimum
  sizes and accessible names.
- Authoritative palette values and permitted combinations (primary, secondary, accent,
  status), including any dark-mode rules.
- Approved typeface, if one is mandated, with license for web use.
- Favicon/app icon and a default social-sharing image.
- Approved documentary photography with usage permission, if a hero image is wanted.
- Official site name, tagline and description for metadata.
