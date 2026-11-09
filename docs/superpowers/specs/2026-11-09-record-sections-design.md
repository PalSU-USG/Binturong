# Record pages and public sections

Status: Approved by the owner on 9 November 2026 (decisions recorded below). Not yet implemented.
Parent: [Domain and publication foundations](2026-10-19-domain-publication-design.md).
Written against `dev` `da406cf`; storage has since landed (`dev` `9fa9d98`). Closes the
delivery order: record patterns, then Archives / Transparency / Government, as one slice.

## At a glance

- Detail pages: `/issuances/[slug]`, `/reports/[slug]`, `/activities/[slug]`: metadata
  first, one canonical PDF action, provenance, visible related records.
- `/archives`, `/transparency`, `/government` are server-rendered query views over
  published records. No new collection; no record is copied or moved.
- Age (30 days) only decides a "Recent" label. Records, URLs and archive membership
  never change with age.
- Record reads use `overrideAccess: false`, `draft: false`. A draft, withdrawn or
  unreferenced record cannot appear in a list, related row, breadcrumb or metadata.

## Dependencies

| Slice (branch)                | State at drafting | Needed for                                              |
| ----------------------------- | ----------------- | ------------------------------------------------------- |
| Storage (`private-documents`) | On `dev`          | `GET /api/documents/:id/file`, `requireOfficialFiles`   |
| Search (`public-search`)      | Not integrated    | `searchTargets.ts` `live` flag, pure "Recent" function  |
| Navigation (`navigation`)     | Not integrated    | Section identity, breadcrumbs, section index, children  |

Implementation starts only after Search and Navigation are on `dev` and this branch is
rebased on it. Search hides Issuance/Report results until these routes exist: this
slice flips those two targets to `live` in the commit that adds each route. Search
and storage each own a Payload migration; this slice adds none (no schema change).

## Findings in current code

1. Issuances, Reports, Offices, People, Organizations, Activities and Academic years
   have drafts, `domainSlug` slugs and `readPublishedOrStaff` public read.
2. Issuances: `issuingOffice`, `type` (executive_order, memorandum, act, resolution,
   advisory), `documentNumber`, `seriesYear`, `issuedDate`, `effectiveDate`, `summary`,
   `mainDocument`, `attachments`, `relatedRecords`; no branch. Offices carry an
   optional `branch` and `parent`. Reports: `responsibleOffices` (many), `type`
   (financial|accomplishment), `reportingPeriod`, period dates, `abstract`,
   `sourceVersionLabel`. Branch views are therefore derived from offices; records
   whose office has no branch cannot be classified without inventing data.
3. People hold `terms[]` (office, start/end, academic year). No photo, contact or
   login link. No "Constitutional Commission" concept exists.
4. **Documents are not publicly readable** (`read: authenticated`; storage key,
   upload fields internal-only). `overrideAccess: false` cannot fetch file name, size
   or hash for a visitor. See "Access and disclosure" for the narrow exception.
5. `CollectionArchive`/`Card` are Post-only and `ArchiveBlock` lacks
   `overrideAccess: false` (product-alignment risk 3); neither is reused.
6. `/posts` is `force-static` with `revalidate = 600`; reuse would show a withdrawn
   record for ten minutes. Revalidation of these routes is unverified.
7. Payload's handling of an unreadable polymorphic related target is unverified.

## Routes

| Route                                                | Content                                            |
| ---------------------------------------------------- | -------------------------------------------------- |
| `/issuances/[slug]`, `/reports/[slug]`               | Record detail (canonical, permanent)               |
| `/activities`, `/activities/[slug]`                  | Date-ordered list and detail; no calendar          |
| `/archives`                                          | Published issuances and reports, filterable        |
| `/archives/executive`, `/legislative`, `/judicial`   | Same list filtered by office branch                |
| `/archives/participating-csgs`                       | Records whose organization is of kind `csg`        |
| `/transparency`                                      | Redirect to financial reports                      |
| `/transparency/financial-reports`, `/accomplishment-reports` | Reports filtered by type                   |
| `/government`                                        | Intro and links to the pages below                 |
| `/government/organizational-chart`                   | Published offices as a parent/child list           |
| `/government/offices`, `/government/offices/[slug]`  | Directory; office page with holders                |
| `/government/participating-csgs`                     | Organizations of kind `csg`, participating true    |

Paths match the owner-approved navigation destinations. There is no `/issuances` or
`/reports` index. Constitutional Commissions is not routed (finding 3). Unknown or
withdrawn slugs return 404 without echoing the slug; verify slug redirects cover these routes.

## Record detail pattern

Server component; one shared shell, per-type metadata blocks. Order follows
`docs/design.md` (Issuance detail, Accomplishment report layouts).

1. Breadcrumbs (navigation component): Home, Archives or Transparency, branch/type
   when known, title. Unpublished ancestors are omitted, never named.
2. Header: type label, document number or reporting period (as entered), H1.
3. Metadata `dl`: published, last updated (published revision), issued/effective
   date, published issuing/responsible offices, academic year, organization, source
   version label. Unset fields are omitted, never "N/A" or zero. Source dates stay
   separate from `publishedAt`.
4. One "Download PDF" link to `/api/documents/<id>/file` (attachment-only delivery;
   no inline viewer). Attachments listed under "Documents" with the same action.
5. Summary or abstract (rich text), only when present.
6. Document information: filename, size, SHA-256 of the main file; nothing else from
   Documents (no storage key, uploader, pending state, versions).
7. Related records: titles and canonical links of published targets with a type
   label. Anything unpublished is absent, including title and count.
8. Provenance: published date, last updated, version label. No actor or account
   identifier; `lastTransition` is never selected.

If file facts cannot be read, metadata still renders with "The official file is
temporarily unavailable" instead of a link that would 404, and the failure is logged.
Activities show title, date, time, location, organization, year, description; no file.

## Shared list pattern

One `RecordRow` and `RecordList` serve Archives, Transparency, Government offices and
Activities. A row shows type label, identifier, title, source date, "Recent" when due
(Search's pure function, injected clock), "View record" and a PDF link only when the
file is ready. Rows are an ordered list with real headings and links.

- Filters are a plain `GET` form: `year` (academic-year slug), `type` (issuance type on
  Archives; fixed on Transparency pages). No text query (Search owns it). `page` is a
  positive integer, else page 1. Unknown `type` is ignored; unknown `year` shows
  "Academic year not found; showing all years", never a silent widening.
- Page size 12, total count, previous/next keeping filters, depth capped at 50.
  Archives merges two collections: fetch `page x 12` minimal rows per collection
  (`select`, `depth: 0`), merge by `(order key desc, id desc)`. Fine to a few thousand
  records; beyond that a stored sort key needs its own reviewed change.
- States: empty ("No published records match these filters", clear-filters link);
  error (section `error.tsx` with retry, never shown as empty); loading
  (`loading.tsx` reserving layout).

## Archives and Transparency

Archives lists published Issuances and Reports of every age; nothing is excluded for
being recent or moves as it ages. Branch pages filter on the office `branch`
(`issuingOffice` for issuances, any `responsibleOffices` for reports). `/archives`
shows all records, including unclassified. The CSG page filters
`organization.kind = csg` regardless of current participation: ending participation
blocks new publication only; history stays visible until withdrawn.
Transparency is two Report views by `type`, showing reporting period and organization
in each row; detail is document-first and metadata-dense. The navigation section index
lists the sibling pages plus the current page.

## Government

- Organizational chart: published offices of the USG organization as an indented list
  from `parent`, grouped by branch, unset branch under "Other offices". An unpublished
  parent is skipped and its children move up; no hidden title is exposed.
- Offices stay separate from people: an office page shows name, branch, organization,
  parent, children and holders from published People terms; no person page, photo or
  contact detail (none exists in the model).
- Holders: name, term dates as supplied, academic year. "Current" only when supplied
  dates (term's, else academic year's) include today; otherwise "Term dates not
  recorded", never current. Past terms stay listed.
- Participating CSGs: name and links to that CSG's published records, only for
  `participating = true`; zero shows an honest empty state, not an invented list.

## Access and disclosure

| Actor  | Resource                                  | Expected                           | Boundary                           |
| ------ | ----------------------------------------- | ---------------------------------- | ---------------------------------- |
| Anyone | Published record, list, related row        | Visible                            | `overrideAccess: false`            |
| Anyone | Draft-only/withdrawn record, slug or list  | 404 / absent, no title anywhere    | collection read + `draft: false`   |
| Anyone | Draft over a published record              | Published text only                | published revision                 |
| Anyone | Withdrawn record's file                    | 404 from delivery route            | storage slice rule                 |
| Anyone | Documents collection directly (REST/Local) | Denied                             | existing `authenticated` read      |
| Staff  | Public pages while signed in               | Published content, not draft       | public queries ignore the session  |

Documents are not publicly readable, so one server-only helper `readPublicFileFacts`
is the sole reviewed use of a privileged read. It takes only document ids from a record
already read publicly, requires the id to equal the record's main or attachment
reference, requires state `ready`, and returns an allow-listed `{ id, filename, size,
sha256 }`. It never accepts ids from the request. Public pages render dynamically in
v1 so withdrawal is immediate; static caching waits for proven revalidation.

## Accessibility and responsiveness

One H1 per page, named landmarks, skip link, breadcrumbs from navigation. Metadata is a
description list; rows are lists; filters are labelled controls with a visible submit,
no auto-submit. Single column, section index before content on narrow screens and
beside it when wide. Long titles and numbers wrap; no horizontal scroll at 320 px or
200% zoom. Targets at least 44 CSS px; contrast 4.5:1; state never by colour alone.
Dates in long form inside a `time` element. No client-only filtering.

## Out of scope

Calendar UI, Student Services and Contact pages, home redesign, visual identity (neutral
placeholder styles only), non-record search, inline PDF viewer, bulk import, tenant
workspaces, Constitutional Commissions model, schema/migration changes, cloud data,
Header edits (a publisher adds reviewed links afterward).

## Owner decisions (9 November 2026)

1. Record detail pages follow an arXiv-style abstract page: metadata block, summary as
   abstract, one "Download PDF (size)" action through the controlled delivery route,
   and a version history listing published versions only (number, date, size). The
   narrow server-side `readPublicFileFacts` read is approved for this, extended to the
   published version chain; it returns no storage keys and is covered by its own tests.
2. Archives order by `publishedAt`; records without a branch appear only on `/archives`.
3. Activities: plain list and detail pages; no calendar.
4. Constitutional Commissions stay unlinked ("Not yet available" in review, hidden live).
5. Current office holder is decided by term dates only.
6. `/transparency` is its own overview page listing Financial and Accomplishment
   Reports; intro copy is a content input (honest empty state until provided).

## Original options considered

1. **Archive ordering.** `publishedAt` (never null) or source date (nullable)?
   Recommend `publishedAt`, showing the source date in each row.
2. **Records with no office branch.** Recommend only under `/archives`, never a branch
   page; editors set the branch. An "Unclassified" page would advertise a data gap.
3. **Public file facts.** Recommend showing filename, size and SHA-256 via the
   allow-listed privileged helper. Alternative: show only the download link and make
   no privileged Documents read at all (simpler, fewer trust boundaries).
4. **PDF action.** Recommend one "Download PDF" now; an inline viewer needs a change
   to the approved delivery headers.
5. **Activities.** Recommend plain list and detail now, search later, calendar
   deferred. Or defer Activities entirely?
6. **Constitutional Commissions.** Recommend the link stays unavailable until the
   owner supplies the data and decides whether they become Offices with a new branch
   (a separate schema slice).
7. **"Current" holder.** Recommend dates-only. Alternative: a manual flag (new field).
8. **Transparency landing.** Recommend `/transparency` redirects to Financial Reports;
   alternative is a short landing page needing approved copy.

## Content inputs still needed

- Approved intro copy for Archives, Transparency and Government (none invented).
- Which Offices carry a branch; which published Offices, People terms, academic years
  exist. Empty sections ship as honest empty states until supplied.
- Participating CSG list and wording; Constitutional Commissions data.
- Real seal, logo and colours arrive in the later identity slice.
