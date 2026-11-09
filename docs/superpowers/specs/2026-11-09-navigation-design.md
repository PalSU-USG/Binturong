# Primary navigation and section orientation

Status: Approved by the owner on 9 November 2026 (decisions at the end). Not yet implemented.

## Goal and basis

Help visitors reach public information and understand their location in Binturong.
Retain Payload globals, Next.js server rendering, existing IDs and canonical URLs.
This is a proposal, not implementation or permission to publish navigation content.
Sources: [design guide](../../design.md), [design findings](../../design-architecture-findings.md),
[domain/publication design](2026-10-19-domain-publication-design.md), and
[product alignment](../../../plans/product-alignment.md#current-versus-target-and-affected-modules).
The seven destinations below come from those documents. Labels, order and targets
remain owner-review inputs; proposed paths must not be mistaken for existing routes.
Use calm publication/service navigation: energy 1, rhythm 1, motion 1. Grouping
reduces scanning; section indexes expose context without widening the global menu.

## Destination hierarchy

| Primary destination, proposed order | Section links from approved requirements |
| --- | --- |
| Home | Home destination; identity link also returns here |
| Latest Updates | Published updates; retain existing `/posts/*` detail URLs |
| Student Services | Student Helpdesk; Student Handbook |
| Government | Organizational Chart; Offices; Constitutional Commissions; Participating CSGs |
| Transparency | Financial Reports; Accomplishment Reports |
| Archives | Executive; Legislative; Judicial; Participating CSG records |
| Contact | OSAS units; USG contacts, as approved page anchors or destinations |

Search remains a separate, named `/search` link outside the seven destinations.
Bintanong is absent until its integration is approved. No invented Helpdesk URL,
handbook PDF, contact details, CSG participation or section content. Archives and
Transparency remain views over records, not new content collections.

Seven is the target information architecture, not seven links to nonexistent pages.
Release each destination only after its route/published page is verified. During
review, show unavailable destinations as plain text with “Not yet available”; never
use `#`, empty URLs or disabled anchors. Missing destinations block full IA acceptance.
Creating the later archive, report or government query pages is outside this slice.

## Desktop, mobile and disclosure behavior

- Preserve an identity region followed by a named `Primary` navigation landmark.
  Keep the existing identity footprint until approved assets arrive; use institutional
  text instead of the Payload logo. Search stays reachable outside the mobile menu.
- Desktop shows all primary items in order. A parent destination is an anchor;
  an adjacent “Show [section] links” disclosure controls its child list. Never make one
  control both navigate and toggle. Use lists and disclosures, not ARIA menu roles.
- Mobile uses an in-flow “Menu” disclosure containing the same ordered hierarchy.
  Groups expand within it; no modal, focus trap, hover requirement or body scroll lock.
  Switch to this form when content no longer fits, including at 200% zoom.
- Server HTML contains every eligible link. Prefer native `details`/`summary` for
  the outer mobile disclosure and group disclosures, with the parent anchor outside
  the group summary. JavaScript adds coordinated close/Escape behavior only.
  Do not add redundant button roles or manually maintained ARIA state to native summary.
- Tab/Shift+Tab follow document order; Enter activates anchors; Enter/Space toggles
  summaries. Closed content has no tabbable descendants. Visible focus is never removed.
  With enhancement, Escape closes the innermost open disclosure and restores focus
  to its summary; opening a sibling closes the previous sibling. Before hiding focused
  content on a breakpoint change, restore focus to the visible controlling disclosure.
- Link activation closes enhanced mobile/group disclosures. Client-side navigation
  moves focus to the new main heading after completion, without changing normal
  new-tab behavior. Closing through an outside pointer does not steal that pointer's focus.
  Without JavaScript, native toggling and full-page anchor navigation remain usable;
  multiple groups may stay open and Escape coordination is not promised.

## Section orientation

Add a skip link to a unique main-content target. Each page has one main landmark
and one descriptive H1. Mark the exact destination with `aria-current="page"`;
mark its ancestor section visually and with text, without claiming it is the current page.
Match normalized canonical paths at segment boundaries; ignore query/hash for primary
selection. Home matches only home. External links never become active sections.

Section layouts receive an explicit section identity and breadcrumb ancestor chain.
Reuse the resolved Header group's children as a named section index: beside main
content on wide screens, before it in flow on narrow screens. Keep current-page text
visible even when siblings are unavailable. No separate CMS copy of the same menu.

Breadcrumbs are a named navigation landmark with an ordered list: Home, section,
known ancestors, current title. The current item is text with `aria-current="page"`.
Use route/content metadata, not guessed slug titles or browser history. Issuances
belong under Archives and reports under Transparency regardless of the incoming link;
do not change their canonical URLs. Missing/private ancestors are omitted without
exposing titles. Provide components/contracts now; integrate existing pages where
their hierarchy is known. Later section routes adopt them when those routes exist.

## Payload data and compatible conversion

`header` and `footer` stay public-read globals with `publishContent` updates only.
They change live configuration without drafts. Preserve fresh active-account checks
and enforcement through REST, GraphQL and user-scoped Local API, not admin visibility.

- Keep `Header.navItems[]` and each row's existing `id` and `link` shape. Raise its
  six-row cap to seven. Add optional `section` identity (`home`, `updates`, `services`,
  `government`, `transparency`, `archives`, `contact`) and optional `children[]`,
  each with its own row ID and the existing `link` group. One child level only.
  Supplied section identities are unique; legacy rows may have none.
- Keep Footer's existing flat `navItems[]`, six-row cap and link contract. Give its
  landmark a distinct name. Do not silently replace stored footer links with the
  Header or invent OSAS/legal/contact links. Fix its RowLabel's Header type coupling.
- Keep shared `link.type`, `reference` (`pages`/`posts`), `url`, `label`, `newTab` and
  appearance behavior for block/hero callers. Section routes use reviewed custom
  URLs; this slice does not widen relationship targets or rename Posts to Updates.
- Resolve only the selected link branch. Unpopulated/deleted/unpublished references
  produce no public title/link and never fall back to a stale custom URL. Public
  resolution uses `draft: false`, `overrideAccess: false`; verify nested relationship
  behavior rather than assuming the current depth-one global read proves privacy.
- Validate new/edited links server-side: nonblank label, valid selected destination,
  supported site-relative or `https`/`http`/`mailto`/`tel` URL; reject script/data and
  protocol-relative URLs. Preserve existing stored strings; omit unsafe output and
  report it to staff for correction. New-tab links announce that behavior and retain
  `noopener noreferrer`. Shared CMSLink changes require block/hero compatibility proof.

Payload owns the additive schema migration, generated types and migration snapshot.
Existing `header`/`footer` parent rows, `*_nav_items` row IDs/order, `*_rels` IDs/paths
and page/post relationship values remain intact. Old rows become leaf items with
absent section and empty children; no label-based matching, reseeding or automatic
reordering. Owner-approved grouping is a separate configuration edit, preserving
existing top-level IDs/URLs and recording any deliberate move or replacement.
Generate import maps only if component registrations change; never hand-edit artifacts.
Before deployment, capture a private backup and old/new navigation manifest. Prove
fresh and populated upgrades, repeat application, interrupted rollback and ID/URL
parity with synthetic fixtures. On conflict abort transactionally; do not overwrite
editorial data. Roll back application code while retaining additive columns/data;
no destructive down migration after children have been authored. Shared deployment
and data editing need separate authorization.

## Missing data, caches and accessibility

Render the public link tree on the server with a small enhancement boundary. Empty
globals are distinct from fetch failures. For slow reads, stream a reserved shell
with institutional text, Home and Search; do not block article content on the menu.
On failure, retain that minimal shell and a brief navigation-unavailable message;
log the failure server-side without secrets. Never fall back to draft/staff data.
Retain global cache tags and verify withdrawal/slug changes invalidate affected
navigation relationships too. Stale cached titles must not disclose withdrawn content;
the present Header/Footer-only invalidation does not establish this guarantee.

At 200% zoom and narrow widths, wrap labels and use the mobile/in-flow pattern;
no clipped menu, horizontal page overflow or focus hidden behind overlays. Targets
should be at least 44 CSS px. Check text contrast 4.5:1 (large text 3:1) and control/
focus contrast 3:1. Current state uses text/shape as well as color. Respect reduced
motion; disclosure access never waits for animation. Reuse existing semantic styles.

## Scope and unverified points

Tokens, typography selection, visual identity, final authority band/footer styling,
home redesign, new section query/detail pages, search implementation and integrations
are later slices. No dependency or lockfile changes are proposed. Source inspection
at `da406cf` only: stored globals, published destinations, browser
behavior, contrast, migrations and live cache privacy are unverified. Linked Figma
and external references were not re-inspected; use the recorded repository findings.

## Inputs needed from the owner

1. **Menu labels:** confirm the seven labels and child labels in the hierarchy above;
   default to that approved-document wording, with “Latest Updates” rather than “Updates”.
2. **Order/grouping:** confirm the displayed order and child order above; default to
   that sequence on desktop, mobile and section indexes, with Search separate.
3. **Destinations/content:** supply or approve each canonical page/route, Helpdesk URL,
   handbook edition/file, participating CSG destinations, Contact/OSAS anchors and
   Footer link labels/order/official URLs. Default: preserve verified existing links;
   mark unresolved items unavailable in review, omit them from live navigation.
4. **Logos and seal files:** supply approved PalSU seal and USG logo originals,
   permitted variants, usage rules and accessible names. Default: plain “Palawan State
   University / University Student Government” text; no recreated or borrowed marks.
5. **Colors:** supply authoritative PalSU/USG palette values and permitted combinations.
   Default: existing neutral semantic styles subject to contrast verification; no
   screenshot sampling, invented brand palette or new tokens in this slice.

## Owner decisions (9 November 2026)

1. The seven destinations, their order and child links are approved as proposed above.
2. Build with placeholders: plain-text institutional wordmark and existing neutral styles;
   no recreated marks or invented palette. Real seal, logo and colors arrive in the later
   tokens/identity slice.
3. Content links: keep verified existing links; anything unknown stays unavailable in
   review and is omitted from live navigation until the owner provides it.
