# Public Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.
> Implement these dependent tasks inline with focused commits, then one
> independent whole-slice review before integration.

**Goal:** Search published Updates, Issuances and Reports from `/search` with
correct canonical links, bounded queries, and an index that follows publication.

**Architecture:** Keep the Payload search plugin and its `search` collection as a
derived cache. Row content comes from a per-collection allowlist; read access is
the enforcement boundary and is checked per source collection. One registry owns
label, canonical path and a `live` flag. The page is a server component with a
plain GET form.

**Tech Stack:** Existing Payload 3.90.2, Next, PostgreSQL, TypeScript, Vitest,
Playwright. No new dependencies (plain-text extraction ships in
`@payloadcms/richtext-lexical/plaintext`).

**Spec:** [Public search design](../specs/2026-11-09-public-search-design.md).
**Status: draft, not owner-approved. Do not execute until the open decisions
there are answered or defaulted to their recommendations.**

## Global constraints

- Worktree `C:/Users/Hawksprey/orca/workspaces/Binturong/public-search`, branch
  `Hawksprey420/public-search`, base `dev` `da406cf`. No cloud changes, push,
  deployment, real-content import or main CMS data change.
- The worktree has no `node_modules`; reuse the lockfile baseline (no upgrades) and
  record how dependencies were provided.
- Run database writers serially, only against guarded `binturong_test` on 56322
  (`tests/helpers/assertTestDatabase.ts`). Synthetic fixtures only.
- Search writes stay trusted-only. Never index Documents, file keys, filenames,
  checksums, audit fields or related-record titles. Links never point at files.
- Preserve existing search tests in `public-boundaries.int.spec.ts` and
  `operational-access.int.spec.ts`; extend them, do not weaken them.
- Payload owns the migration (additive, nullable fields). Do not edit applied
  migrations. If `Hawksprey420/private-documents` integrates first, regenerate this
  migration and snapshot on top of it and re-run the exact-count migration proof.

## Review focus

1. A stale or draft title appearing anywhere public: page, REST, GraphQL, `depth`
   population. Prove with a mutation that removes the per-collection predicate.
2. A result linking to the wrong collection or a missing route.
3. Withdrawal, restore, scheduled publish and failed sync leaving a visible row.
4. Hostile `q`: arrays, wildcards, very long, unicode, markup, `&`/`#`/`%`.
5. Empty-published-set handling in the access predicate (`in: []`).

## Task: Public search end to end

### 1. Index model, access and reindex

**Files:** create `src/search/searchTargets.ts`, `tests/int/search-index.int.spec.ts`.
Modify `src/plugins/index.ts`, `src/search/beforeSync.ts`, `fieldOverrides.ts`,
`publishedSearchAccess.ts`, `authorizeReindex.ts`; regenerate `src/payload-types.ts`;
new Payload migration, JSON snapshot, `src/migrations/index.ts`; extend
`tests/helpers/domainMigrations.mjs` expected count.

**Interfaces:** `searchTargets` maps `posts | issuances | reports` to
`{ label, path(slug), live }` (`live` true only for posts). Helpers:
`searchCanonicalPath(relationTo, slug)` returns an encoded path or throws for an
unregistered collection; `indexedCollections`. New row fields: `identifier`,
`identifierKey` (indexed; `normalizeIdentifier(identifier)`), `summary` (at most
300 plain characters), `publishedAt`, `sortAt` (indexed). Create
`src/search/identifier.ts`: `normalizeIdentifier(s)` lowercases, NFC-normalizes and
drops spaces/punctuation, then maps a fixed, reviewed prefix alias list
(e.g. `resolution`→`res`, `executiveorder`→`eo`) to one canonical form. The raw
`identifier` stays stored and displayed unchanged.
`beforeSync` builds rows from an allowlist per collection and never spreads the
source. `publishedSearchAccess` builds `or` of
`{ doc.relationTo = c, doc.value in publishedIDs(c) }`, skipping empty sets; when
all are empty it returns a constraint that matches nothing.

- [ ] RED: tests against the real hooks and roles, using the actual REST/GraphQL
  path. Cover: publish creates one row; draft save keeps published text; later
  publish refreshes one row; withdraw removes the row and public reads; stale row
  from a failed sync is invisible; delete of a draft-only record leaves none;
  scheduled publish; restore through the domain transition. Row for an Issuance and
  Report holds `identifier`/`summary` but no Document id, filename or key. Empty
  published set returns an empty list, not an error. Each fails for the missing
  collections/fields before implementation.
- [ ] RED: reindex accepts only indexed collections, rejects unknown/empty/duplicate,
  deletes only those collections' rows, converges on all fields, and rolls back on a
  forced failure leaving the previous index intact.
- [ ] GREEN: implement the minimum above. Inspect the plugin's `restoreVersion` and
  `scheduled` sync paths in the installed source and by test; fix only what a test
  shows broken, in the shared layer.
- [ ] Mutation check: temporarily drop the per-collection predicate and confirm the
  stale-row test fails; restore it. Generate and review the migration; apply only to
  the guarded database; prove existing rows survive, repeat is a no-op.
- [ ] Run focused GREEN, existing search suites, `npx tsc --noEmit`, changed-file
  lint; commit `feat(search): index published issuances and reports`.

### 2. Query module, page and form

**Files:** create `src/search/query.ts`, `src/search/SearchResults.tsx`,
`src/app/(frontend)/search/error.tsx`, `tests/int/search-query.int.spec.ts`,
`tests/e2e/search.e2e.spec.ts`. Modify `src/app/(frontend)/search/page.tsx`,
`src/search/Component.tsx`.

**Interfaces:** `parseSearchParams(raw): { q: string | null; type; page }` applies
the spec's normalization and defaults. `isRecent(publishedAt, now, days = 30)` is
pure. `runSearch(payload, params, now)` returns `{ hits, totalDocs, totalPages,
page }` using `overrideAccess: false`, `draft: false`, `depth: 0`, explicit `select`,
`limit: 12`, sort `-sortAt,-id`, and only `live` targets. Hits carry
`{ label, title, href, identifier, summary, publishedAt, recent }`. The page renders
prompt, results, no-results; errors propagate to `error.tsx`.

- [ ] RED (`parseSearchParams`): arrays, empty, one character, 101 characters,
  whitespace runs, NFC/NFD, `%` `_` `\`, markup, bad `type`/`page` (0, -1, 1.5, `abc`,
  huge). Each fails before the module exists.
- [ ] RED (`normalizeIdentifier`, pure): case/space/punctuation variants and each
  alias collapse to one key ("Res. No. 2026-014", "resolution no 2026014");
  unrelated prefixes don't collide; empty/markup-only input yields no key. Query
  side: when the normalized query is non-empty, also substring-match `identifierKey`.
- [ ] RED (`runSearch`, real DB and roles): title/identifier/summary/slug matches;
  multi-word AND; wildcard input cannot widen results; `type` filter; stable
  paging across equal dates; past-last-page; non-live types absent even when rows
  exist; draft/withdrawn/stale rows absent; every link is `/posts/{slug}` for a Post
  and never contains `/api/` or a Document id; record at day 29 and day 31 (injected
  clock) has the same href and result, only `recent` differs.
- [ ] RED (`tests/e2e/search.e2e.spec.ts`, browser): GET form works with JavaScript
  disabled; `q` with `&`, `#`, `%`, `<script>` is encoded and shown as text; no
  history entry per keystroke; empty, no-results and error states render; error
  state is not the no-results state (force a failed query via a test-only mock).
- [ ] GREEN: implement the minimum. Replace the `CollectionArchive` usage on this
  page with `SearchResults`; leave `CollectionArchive` and `Card` unchanged. Replace
  the template page title with the project name in `generateMetadata`.
- [ ] Measure: `EXPLAIN (ANALYZE)` of the final query at 5,000 synthetic rows on the
  guarded database; record the plan and timing in the slice record. Add no index
  unless the result justifies one.
- [ ] Run focused GREEN, `npx tsc --noEmit`, changed-file lint, commit
  `feat(search): add the public search page and query module`.

### 3. Full checks and whole-slice review

- [ ] Run, serially: `npm run lint`, `npx tsc --noEmit`, `npm run test:int`,
  `npm run test:e2e`, `npm run build`. Read every result; report the pre-existing
  Header/Card/Theme lint errors recorded in `plans/product-alignment.md` separately
  from any new failure (unverified on this base).
- [ ] Browser-check `/search` at narrow and desktop widths, 200% zoom and keyboard
  focus against the design guide. If a browser is unavailable, record it as
  unverified.
- [ ] Update the task note under `plans/` with commits, commands, results, the
  unverified list from the spec, and one next action. No push or integration.
- [ ] Request one independent whole-slice review against the spec's review focus;
  record its findings and the fixes. Integration waits for owner authorization.
