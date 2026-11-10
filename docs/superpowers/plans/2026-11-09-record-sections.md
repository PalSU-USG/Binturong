# Record Pages and Public Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.
> Implement inline, task by task, RED first, with focused commits and one
> independent whole-slice review before integration.

**Goal:** Publish canonical Issuance, Report and Activity detail pages and the
Archives, Transparency and Government query views, with PDFs only through the
controlled delivery route.

**Architecture:** Server-rendered Next routes read published records through the
Payload Local API with `overrideAccess: false` and `draft: false`. Pure query
modules (filters, pagination, branch derivation, office tree, holders) feed shared
`RecordRow`/`RecordList` and one detail shell. No collection, field or migration
changes. One narrow server helper reads allow-listed file facts for ids taken from an
already public record.

**Tech Stack:** Existing Payload/Next/React/TypeScript baseline. No new dependencies.

**Spec:** [Record pages and public sections](../specs/2026-11-09-record-sections-design.md).
Not approved at drafting; do not start until the owner approves it and settles its
open decisions.

## Dependencies

Storage is on `dev` (`9fa9d98`). Search (`public-search`) and Navigation
(`navigation`) must be integrated into `dev` first, then this branch rebased and the
integrated helper names (`searchTargets.ts`, Recent function, breadcrumb and section
index components) confirmed. Stop and report if either is missing.

## Global constraints

- Worktree `C:/Users/Hawksprey/orca/workspaces/Binturong/record-sections`, branch
  `Hawksprey420/record-sections`. Preserve other checkouts and private environments.
  No cloud changes, real-content import, push or deployment.
- Use only guarded test databases `binturong_test` on 56322 or 56323, one task per
  database; run database writers serially; do not manage containers. Synthetic
  fixtures only; never read the main CMS database or private uploads.
- Every public read: `overrideAccess: false`, `draft: false`, explicit `select`,
  `depth` as small as possible. The only privileged read is `readPublicFileFacts`.
- Records never move; canonical URLs never change; age affects only "Recent".
- No schema, access-rule or migration change. If one proves necessary, stop and
  propose it separately.
- Placeholder identity only. Responsive to 320 px, keyboard operable, 200% zoom,
  with empty, loading and error states.
- Commits follow `docs/engineering-workflow.md#commits`, with explicit paths.

## Review focus

1. Drafts, withdrawn records and unpublished related targets, offices or ancestors
   leak no title, count, breadcrumb or metadata anywhere.
2. `readPublicFileFacts` cannot be steered by request input, returns only the
   allow-list and only for `ready` documents; a mutation removing a guard fails a test.
3. PDF links appear only for ready files and never contain a storage key; a failure to
   read facts is shown as unavailable and logged, never as empty.
4. Failures never render as empty lists; unknown filters never widen silently.
5. Merged Archives pagination is stable with equal dates and bounded in depth.
6. Holder "current" uses supplied dates only; offices are never merged with people.
7. Dynamic rendering shows withdrawal immediately; no stale static cache.

## Task: Record pages and public sections

### 1. Record query layer and file facts

**Files:** create `src/records/recordQueries.ts`, `recordFilters.ts`,
`publicFileFacts.ts`, and `tests/int/record-queries.int.spec.ts`.

**Interfaces:** `parseRecordFilters(searchParams, scope)` returns
`{ page, year, type, notices }` and never throws. `listRecords(payload, scope, filters,
now)` returns `{ rows, total, page, pageCount }` with minimal rows; the
`archives` scope merges Issuances and Reports by `(order key desc, id desc)`.
`readPublicRecord(payload, collection, slug)` returns a published record or `null`.
`readPublicFileFacts(payload, record)` returns `{ id, filename, size, sha256 }[]`.

- [x] RED: seed synthetic published, draft-only and withdrawn records, branches, a
  CSG record and a document in each state; write failing tests for denied/hidden
  records, branch and CSG filters, pagination ties and depth cap, invalid `page`,
  unknown `type`/`year`, related-target visibility, and facts for non-ready or
  foreign ids (denied). Observe missing implementation.
- [x] Implement the minimum modules; pin Payload's behaviour for unreadable related
  targets. Mutate each facts guard once and confirm its test fails, then restore.
- [x] Run focused GREEN, types and strict changed lint; commit the verified unit.

### 2. Detail shell and record routes

**Files:** create `src/components/records/RecordDetail.tsx`, `RecordMetadata.tsx`,
`RelatedRecords.tsx`, `DocumentActions.tsx`, route files under
`src/app/(frontend)/{issuances,reports,activities}/[slug]/`, and component and route
tests under `tests/int/`. Update `searchTargets.ts` to set Issuances and Reports
(and Activities only if approved) `live` in the same commit as their routes.

**Interfaces:** `<RecordDetail record facts breadcrumbs />` composes the spec's eight
ordered regions; unset fields are omitted. `DocumentActions` renders a link to
`/api/documents/<id>/file` or the unavailable message. `generateMetadata` uses
published fields only.

- [x] RED: tests for field omission, ordering, 404 for draft/withdrawn/unknown slugs
  without echoing the slug, facts-unavailable state, no storage key in HTML, related
  rows hiding unpublished targets, and search targets `live` only once a route exists.
- [x] Implement shell and routes with dynamic rendering, `not-found`, `error.tsx`,
  `loading.tsx`. Verify the slug-redirect behaviour for the new paths.
- [x] Run focused GREEN, types and strict changed lint; commit.

### 3. Archives and Transparency views

**Files:** create `RecordRow.tsx`, `RecordList.tsx`, `RecordFilters.tsx`, routes
under `src/app/(frontend)/{archives,transparency}/`, and tests.

**Interfaces:** each route calls `listRecords` with its scope (`archives`, branch,
`csg`, `financial`, `accomplishment`) and renders list, filters, pagination and the
navigation section index. `/transparency` redirects to financial reports.

- [x] RED: tests for each scope's membership, records older than 30 days still
  listed, "Recent" via injected clock, no-branch records only in `/archives`,
  clear-filters empty state, error state not rendered as empty, and unchanged
  canonical links after age passes.
- [x] Implement routes and components with a plain `GET` filter form and `no client
  filtering`. Check keyboard order and 320 px/200% zoom with a local build review.
- [x] Run focused GREEN, types and strict changed lint; commit.

### 4. Government and Activities

**Files:** create `src/records/officeTree.ts`, `holders.ts`, routes under
`src/app/(frontend)/{government,activities}/`, and tests.

**Interfaces:** `buildOfficeTree(offices)` skips unpublished parents and groups by
branch; `resolveHolders(terms, now)` returns `{ name, dates, academicYear, current }`
with `current` only from supplied dates.

- [x] RED: tests for tree grouping and orphan handling, unpublished office absent,
  holder "current" with no usable dates, past terms retained, office/people
  separation, participating-CSG empty state, activities ordering.
- [x] Implement pages with honest empty states; no person pages or contact details.
- [x] Run focused GREEN, types and strict changed lint; commit.

## Outcome notes

Task 1 mutation results: each facts and query guard was mutated; single-layer mutations of the
defence-in-depth pair (`overrideAccess: false` / `_status` predicate) survive by design, and removing
both fails 2 (facts), 6 (queries) and 4 (government) tests. Task 4 module tests were written after the
implementation, not before; holder-date mutations fail 3 and 4 tests. The independent review is run
by the coordinator and is not ticked here.

## Final verification

- [x] Run full unit/integration checks serially against one guarded database, type
  check, full lint, production build, and a browser pass at 320 px and 200% zoom with
  synthetic data, including keyboard navigation and the denied/empty/error states.
- [ ] One independent whole-slice review in the spec, evidence, compatibility,
  defects order; record observed results, skipped checks and untested boundaries.
- [x] Update the task checkpoint under `plans/` with commits, results and next action.
