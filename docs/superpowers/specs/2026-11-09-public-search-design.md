# Public search

Status: **Approved by the owner on 9 November 2026** (decisions recorded at the end). Not yet implemented.
Parent: [Domain and publication foundations](2026-10-19-domain-publication-design.md)
(search, publication and delivery-order sections). Base: `dev` `da406cf`.

## At a glance

- One public page, `/search`, finds published Updates, Issuances and Reports by
  title, summary and document identifier.
- The index is a derived cache of published revisions. Draft, withdrawn and
  private-file data never enter it; access is still enforced on every read.
- Every result links to its record's canonical page, never to a file.
- Age never removes or moves a result. A "Recent" label is computed per request.
- This slice ships working Posts search and the Issuance/Report pipeline. Those
  records appear in results only after their detail routes exist.

## Findings in current code

Source-read only; no code was run in this slice.

1. Search indexes only `posts` (`src/plugins/index.ts`). The plugin's defaults are
   `syncDrafts: false`, `deleteDrafts: true`; verified in
   `@payloadcms/plugin-search@3.90.2` `syncDocAsSearchIndex.js`.
2. `publishedSearchAccess` is hardcoded to Posts and fetches every published Post
   id on every read. It is correct and covered by `public-boundaries.int.spec.ts`
   (stale rows hidden after a failed sync, REST and GraphQL), but its cost grows
   with the record count and it must be extended per collection.
3. `authorizeReindex` rejects any body except `collections: ['posts']` and checks
   convergence for Posts only.
4. The page passes every hit to `CollectionArchive`, which hardcodes
   `relationTo="posts"` and builds `/posts/<slug>`. Any other indexed type would
   link to the wrong or a missing page. This is the main blocker to widening the index.
5. `search/page.tsx` types `q` as a string. A repeated parameter (`?q=a&q=b`) is
   an array at runtime, which reaches `like`. It also uses `pagination: false`
   with `limit: 12` (no paging), has no sort, and an empty `q` lists the first 12 rows.
6. `Search` (client) navigates with `?q=${value}` unencoded on every debounce,
   including mount, so `&`, `#` and `%` corrupt the URL and history fills.
7. Payload's Postgres `like` splits on spaces and wraps each word in `%…%`
   (`@payloadcms/drizzle` `parseParams.js`). `%`, `_` and `\` in user input stay
   active `ilike` wildcards. Low severity, but a bare `%` matches everything.
8. The plugin swallows sync errors, so a failed write can leave a stale row.
   `syncedDocsSet` also skips a second sync of one record in one request.
9. Organizations, Offices, People and Academic years use `name`/`label`, not
   `title`; the plugin copies `doc.title` only. Search metadata for them would
   be empty without an explicit mapping.

No draft leakage was found in the Posts path: the access predicate, not the sync
hook, is the enforcement boundary. Not verified: restore and scheduled-publish sync.

## What is indexed

| Collection  | Indexed | Result label | Canonical path       | Route exists |
| ----------- | ------- | ------------ | -------------------- | ------------ |
| Posts       | yes     | Update       | `/posts/{slug}`      | yes          |
| Issuances   | yes     | Issuance     | `/issuances/{slug}`  | no (planned) |
| Reports     | yes     | Report       | `/reports/{slug}`    | no (planned) |
| Activities  | no      | -            | calendar UI later    | no           |
| Organizations, Offices, People, Academic years | no | - | filters and context, not results | no |
| Documents   | **never** | -          | files stay private   | n/a          |

One module (`src/search/searchTargets.ts`) owns label, path builder and a `live`
flag per collection. The page queries only `live` targets and builds each link
from the hit's `doc.relationTo` and `slug`, URL-encoded. No other code builds
a search link. Flipping `live` is the only change record-pattern pages need.

Row fields come from an allowlist in `beforeSync`; the source document is never
spread into the row. Fields: `title`, `slug`, `meta.title`, `meta.description`,
`categories` (Posts, existing), plus new `identifier` (Issuance document number
or Report reporting-period label; text as entered), `summary` (plain text of the
published summary or abstract, at most 300 characters, extracted with
`@payloadcms/richtext-lexical/plaintext`), `publishedAt` (date) and `sortAt`
(`publishedAt` or `createdAt`, ordering only, because PostgreSQL sorts NULL first
in descending order). Document references, storage keys, filenames,
checksums, `lastTransition`, actor ids and related-record titles are never indexed. Main
and attachment Documents are never read during sync. Related records are excluded
because their visibility changes independently.

## Query behavior

- URL: `/search?q=…&type=…&page=…`. `q` is read as a single string (first value
  wins), NFC-normalized, trimmed, whitespace-collapsed, limited to 100 characters;
  `%`, `_` and `\` are removed. Fewer than two characters yields the prompt state.
- `type` is `all` (default), `updates`, `issuances` or `reports`. An unknown value
  means `all`. `page` is a positive integer; anything else means 1.
- Match: case-insensitive substring across `title`, `identifier`, `summary`,
  `meta.title`, `meta.description`, `slug`; every space-separated word must match.
  Sort `-sortAt, -id`, so paging is stable. Relevance ranking is deferred.
- Page size 12, with total count and previous/next links that preserve `q` and
  `type`. A page past the end shows a link to page 1.
- Every query uses `overrideAccess: false`, `draft: false`, `depth: 0` and an
  explicit `select`. `/search` has no cache layer: it reads `searchParams`, so
  results follow the index immediately.
- The form is a plain `GET` form (`action="/search"`, `name="q"`, value from URL).
  It works without JavaScript and does not navigate on every keystroke.

## Freshness

Age changes presentation only. A result shows "Recent" when its `publishedAt` is
within 30 days of the request time, computed by a pure function with an injected
clock. The flag is never stored, so nothing needs a nightly job. Ordering and
inclusion ignore age, so a record at day 29 and day 31 has the same row and URL.
The label uses `publishedAt`, not source dates such as `issuedDate`.

## States

- Prompt: no or too-short `q`. Explains what can be searched; does not list records.
- Results: label, title, identifier, summary, published date, link.
- No results: names the query, suggests fewer words, links to Updates and Archives.
- Error: a failed query throws to `search/error.tsx` ("Search is unavailable",
  retry button). An error is never rendered as "No results".
- Query text is rendered as text, never as HTML.

## Index maintenance

The index follows published state. Writes come only from the plugin hooks and the
authorized reindex endpoint; direct writes stay denied (existing tests).

| Event                                | Required index result                            |
| ------------------------------------ | ------------------------------------------------ |
| Publish (first)                      | One row for the published revision               |
| Draft save over a published record   | Row keeps the published text; no draft text      |
| Publish a later revision             | Row refreshed; still one row                     |
| Withdraw                             | Row removed in the withdrawal transaction        |
| Restore                              | Row recreated only through publication checks    |
| Delete (draft-only records)          | No row; `beforeDelete` removes any stray row     |
| Scheduled publish                    | Same as publish                                  |
| Sync write fails                     | Stale row stays invisible (access), repairable   |

Reindex remains publisher-only, transactional and published-only. It widens from
`posts` to the indexed collections, deletes only rows in those collections, and
keeps its convergence check (row count, relation, title, slug, identifier, summary).
An unknown or unindexed collection in the body is rejected. Reindex is the recovery
path after a swallowed sync failure and the backfill after this slice's migration.

## Access and disclosure

- Public read of a row requires its source record to be currently published,
  checked per collection and paired with `doc.relationTo`. Staff see the same
  results on the public page, so previews are not search-visible.
- Draft title, summary and identifier never appear in a row. Private PDFs are
  referenced by neither the row nor the result. Search results never contain
  `/api/documents/…`; the PDF action belongs to the record page.
- REST `/api/search` and GraphQL expose only row fields; `depth` population
  returns the source record under its own read access.
- Matrix to test: anonymous, editor, publisher, admin. Resources: row of published
  Post/Issuance/Report, row of withdrawn record, draft-only record, Document.
  Operations: public page, REST, GraphQL, direct write. Boundary: collection
  access plus search read access.

## Performance

`ilike '%word%'` cannot use a btree index. At launch scale (hundreds to low
thousands of rows) a sequential scan is acceptable. Do not add `pg_trgm` or
full-text search without a measured need: run `EXPLAIN (ANALYZE)` on the real
query at 5,000 synthetic rows and keep the result with the slice record.
Ceiling to revisit: the published-id predicate also scales with published records;
above roughly 5,000 per collection, replace it with hydrating each page of hits
through the source collection and make `/api/search` staff-only. Both are
Payload-owned changes (extra migration for a GIN index).

## Out of scope

PDF text extraction (deferred by the parent spec), relevance ranking, typo tolerance,
filters beyond content type (Archives owns them), search of people/offices/events,
autocomplete, analytics, header search UI (navigation slice), sitemap changes,
cloud database or storage changes.

## Dependencies

- Soft, on `Hawksprey420/private-documents` (not on `dev`): none for behavior,
  because search never touches Documents. Both branches add a Payload migration
  and snapshot; whichever integrates second must regenerate its migration on top.
  That branch edits `transitionDomainRecord.ts`; this slice does not.
- Record detail routes (`record patterns` slice) before any non-Post result renders.

## Not verified

Plugin behavior on `restoreVersion` and scheduled publication; whether withdrawal
through `payload.update` removes the row inside its transaction; `in: []` handling
when a collection has no published records; null `publishedAt` on legacy Posts;
real query timing; the live behavior of any of the above.

## Owner decisions (9 November 2026)

1. Issuances and Reports: index now, hide from results until their detail routes land.
2. Empty or one-character query: show a prompt only; run no query.
3. "Recent" is anchored on CMS `publishedAt`.
4. Document numbers: substring match on a normalized form (case, spaces and
   punctuation ignored, e.g. "Res. No. 2026-014" ≈ "res no 2026014"), plus a small
   fixed, reviewed alias list for record-type prefixes (e.g. Res/Resolution,
   EO/Executive Order). Keep the alias list in code with tests; no editor-managed
   alias table. Raw entered numbers stay stored and displayed unchanged.
