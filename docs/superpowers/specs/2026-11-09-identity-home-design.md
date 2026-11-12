# Placeholder identity and institutional homepage

Status: Approved by the owner on 9 November 2026 (decisions recorded below). Not yet implemented.

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

## Owner decisions (9 November 2026)

Approved as recommended: notice = newest published Post in a "Notice" category from the
last 14 days (no schema change); statement "Official information, student services and
institutional records."; code-owned front page (stored `home` Page untouched and not
rendered at `/`); 5 rows per section; upcoming activities only.

## Original options considered

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


## Owner design realignment (11 November 2026)

The owner rejected the placeholder identity shipped by this slice: a plain white text page with no
identity that ignored `docs/design.md`'s Home layout and the Figma sources. This section supersedes
the "placeholder identity" parts of this spec; data, access and rendering rules above still hold.

Sources: `docs/design.md` (Global page shell, Home layout, Latest Updates layout, Deliberate
non-goals); `docs/design-architecture-findings.md` Homepage direction; the FigJam requirements board
(Palawan provincial site as inspiration, PalSU hero, horizontal nav, Home = officers hero,
announcements, general plan of activities, latest updates with a tag per post and 1 month of
freshness); the Project Akademya Figma node 1072:424 (burnt-orange `#B4440C` authority bar with
seal and League Spartan wordmark, yellow notice band, campus photo hero with a translucent rust
band, deep-rust panel).

Decisions:

1. Palette from Akademya as brand-layer tokens: `--brand #B4440C`, `--brand-deep #853107`,
   `--accent-gold #BD8C0F`, `--notice` yellow, `--on-brand #FFF6F6`. Mapped through `--primary`,
   `--link`, `--focus-ring` and `--status-warning-*`. Shades are adjusted only where the contrast
   test requires. The token test now accepts hex and covers the new pairs plus the worst-case
   hero band blend.
2. League Spartan (`next/font/google`) for headings, wordmark, nav and tags. Body stays Geist Sans:
   `docs/design.md` asks for a highly readable information face for most of the interface, not a
   display face everywhere.
3. Seal and campus photo are the owner's Akademya files in `public/brand/`, flagged in
   `tokens.css` as "replace with approved originals". Seal `alt=""` (adjacent wordmark names it);
   the hero photo is decorative (`alt=""`), the statement is real text.
4. Header: rust authority band (seal, two-line wordmark) over a deeper rust navigation band. Menu
   logic, dropdowns and the Header global are unchanged. No gold "portal" button: there is no
   approved portal URL and white on `#BD8C0F` is 3.0:1.
5. Home order follows `docs/design.md` exactly: hero, notice, Latest updates, Student services,
   General plan of activities, Transparency, Latest issuances. Hero is 40-55vh on desktop with a
   90 percent deep-rust band so the h1 stays readable on any part of the photo.
6. Latest updates is a mixed list of published posts and issuances/reports from the last 30 days
   (by `publishedAt`, not future-dated), newest first, 5 rows, a type tag per row. Fallback when
   nothing is that fresh: the newest items, with the sentence "No updates in the last 30 days;
   showing the most recent." (chosen over an empty state so the front page is never blank while
   records exist). The 14-day notice rule is unchanged.
7. `/home` redirects to `/` outside draft mode; draft mode still renders a stored `home` Page for
   live preview; the `homeStatic` template fallback is dropped for public visitors.

## Design references applied (13 November 2026, inner pages)

Sources checked for this pass. Patterns were adapted, not copied; no outside branding is used.
Limits: the Figma `figma-design-to-code` guidance was not installed in this environment, so only
`get_screenshot` was used on the Figma nodes (no generated code); BetterGov.PH returned no page
content to the fetch tool and MYDS pages gave only the motion foundation.

| Source | Pattern taken | Why |
| --- | --- | --- |
| Project Akademya, list/detail frames 1202:140 and 1118:11144 | Rust left list panel with white League Spartan items and a title; dark-rust content heading bar; gold/yellow notice band; seal in the rust header | Gives section side nav its look (`.site-section-index` is a brand-deep panel with a gold title rule and a notice-yellow current bar (plain gold is only 2.8:1 on brand-deep)) and the page-identity band its colour |
| FigJam design language (32:78, 60:34) | "A proper transparency portal instead of fancy landing pages"; modern university publication x service portal x archive | Keeps motion and decoration restrained: 200ms fades, one gold accent, flat editorial rows, no card walls |
| USWDS header | Dropdowns open on click/keyboard, not hover; Escape or focus-out closes; current section highlighted; nonessential motion off for reduced motion | Matches the existing `PrimaryNavigation` behaviour; `name="site-nav-group"` on the `<details>` makes one-open-at-a-time native, so it also holds without JavaScript |
| USWDS side navigation | Current item marked by a border plus weight, one to three levels, tested against WCAG | Current side-nav item has a yellow bar, bold and tint with `aria-current="page"` |
| GOV.UK service navigation | Active item uses `aria-current` and a non-colour fallback; Menu toggle on small screens | Same `aria-current` plus bold/bar; the Menu disclosure is kept |
| MYDS motion foundation (kd-portal) | Short token 200ms for buttons and dropdowns; ease-out for functional UI; motion must serve a purpose | Dropdown panel enters with opacity plus a 0.5rem slide in 200ms ease-out; hover colour changes 200ms |
| Provincial Government of Palawan | Top nav with Government/Transparency submenus; "Latest Updates" block with "Read more"; accessibility toolbar | Confirms section naming; Latest updates is a rows list with "Read update" |
| arXiv abstract page | Title, then labelled metadata, abstract, access actions, then history | Record detail keeps the title in the band and metadata/actions in the body (unchanged order) |
| Refactoring UI / antislop-ui | Spacing scale, tinted neutrals, no stacked effects, left bar only when it marks real state | Warm dark theme (tinted greys), spacing on `--space-*`, one shadow level |

Dark theme: neutral greys were replaced by warm brown-tinted neutrals (hue 45 to 70) so dark mode
reads as PalSU rather than plain black; every semantic pair is still checked by
`tests/int/design-tokens.int.spec.ts`.
