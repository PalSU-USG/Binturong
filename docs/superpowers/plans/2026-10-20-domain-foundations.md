# Domain Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for these dependent schema tasks, with independent task review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Binturong's structured records and metadata without changing existing content or enabling unverified official files.

**Architecture:** Keep Payload collections, drafts, versions and PostgreSQL migrations. Reuse phase01's roles, account authority lock and scheduling proof. New publication transitions validate the saved revision on the server; public record pages and storage follow separately.

**Tech Stack:** Payload3.90.2, Next16.3.3, PostgreSQL17, TypeScript, npm, Vitest and Playwright; existing dependencies only.

**Spec:** [Approved domain/publication design](../specs/2026-10-19-domain-publication-design.md). This is Slice1b, called phase02 by the owner. [Slice1a](2026-10-20-access-foundations.md) is complete and merged at `00f3b1f`.

**Review:** Independently accepted for execution on22 October2026 by `/root/review_domain_plan`; this approves the plan, not implemented behavior.

## Global constraints

- USG staff manage launch content, including participating CSG submissions. Organization records identify sources, not tenants.
- Roles inherit permissions: **super-admin → admin → publisher → editor**. Reload current authority; never trust a JWT role or a client context flag.
- Allow incomplete drafts. Draft edits leave the current published version visible.
- Keep existing Posts, IDs, relationships, and `/posts/*` URLs. Do not change Pages/Posts'50-version policy.
- Keep numeric IDs. Slugs are unique per collection and stable after first publication. Corrections require a deliberate redirect migration when canonical routes exist.
- Retain Issuance/Report versions without pruning (`maxPerDoc: 0`), using manual saves initially.
- Until private storage is verified, disable official file writes/delivery and fail official-record publication closed. No public-Media fallback or synthetic readiness bypass.
- Payload owns migrations; automatic schema push stays disabled. No main/cloud data changes, account promotions, dependency upgrades, push or integration without its authorization.

## Execution and boundaries

Planning checkout: `Hawksprey420/phase02-domain-schema`, base `00f3b1f`, initial checkpoint `9218162`. Execute serially, one native task worktree per task from its accepted predecessor; keep a separate integration worktree. Before editing, record base/path, exact checks and contracts in the existing checkpoint. Commit each verified unit, then request independent spec/evidence/compatibility review. No parallel writers to `binturong_test`.

All app paths below are under `binturong-open-usg/`. Each schema task includes `src/payload.config.ts`, regenerated `src/payload-types.ts`, a **new** Payload TypeScript migration + JSON snapshot, and `src/migrations/index.ts`. Use `npm run generate:types`, `npm run payload -- migrate:create <task_name>`, review SQL, then apply only to the guarded test or disposable migration-proof database. Never rewrite an applied migration. Revoke direct `PUBLIC`/`anon`/`authenticated` grants on newly created tables/sequences; verify actual restricted roles. Payload identity does not become Supabase identity, so do not add speculative `auth.uid()` policies.

Every task runs its named regression RED before implementation, then GREEN, full integration, types and changed-file lint before committing. Every critical guard gets a targeted bypass/mutation proof, followed by byte restoration. Exact common commands:

```powershell
npm run test:int -- tests/int/domain-schema.int.spec.ts
npm run test:int
npm exec -- tsc --noEmit --incremental false
npm exec -- eslint src/collections/Organizations.ts src/collections/AcademicYears.ts src/collections/shared/protectDomainWrites.ts src/fields/domainSlug.ts tests/int/domain-schema.int.spec.ts
```

## Field contracts

Names below are persisted API contracts. Optional source facts remain absent. Use native field validation for types and collection hooks for complete-candidate rules; do not maintain a second schema validator. Source dates use Payload date fields, validate real supplied dates, and keep their source-day meaning separate from publication timestamps. Do not infer unknown times. Lint command above is Task1's exact file list; subsequent tasks use their own explicit file lists from **Files**, including modified existing callers.

| Collection slug | Fields |
| --- | --- |
| `organizations` | `name`, `slug`, `kind` (`usg`, `csg`, `university_unit`), `participating` (default false) |
| `academic-years` | `label`, `slug`, optional `startDate`, `endDate` |
| `offices` | `name`, `slug`, `organization`, optional `parent`, optional `branch` (`executive`, `legislative`, `judicial`) |
| `people` | `name`, `slug`, `terms[]` with `office`, optional `startDate`, `endDate`, `academicYear`; no login-account link |
| `activities` | `title`, `slug`, `organization`, optional `academicYear`, `eventDate`, optional `time`, `location`, `description` |
| `documents` | `organization`, `title`, `state` (`pending`, `ready`, `failed`), `storageKey`, `originalFilename`, `mimeType`, `size`, `sha256`, optional `previousVersion` |
| `issuances` | `title`, `slug`, `organization`, optional `issuingOffice`, `type` (`executive_order`, `memorandum`, `act`, `resolution`, `advisory`), `documentNumber`, `seriesYear`, optional `issuedDate`, `effectiveDate`, `academicYear`, `summary`, `mainDocument`, `attachments[]`, `relatedRecords[]` |
| `reports` | `title`, `slug`, `organization`, optional `responsibleOffices[]`, `type` (`financial`, `accomplishment`), `reportingPeriod`, optional `periodStartDate`, `periodEndDate`, `academicYear`, `abstract`, `sourceVersionLabel`, `mainDocument`, `attachments[]`, `relatedRecords[]` |

`relatedRecords` is a polymorphic relationship to issuances/reports/posts/activities. Documents are immutable file-version entries, not a Payload upload collection; no public URL field or local upload directory. All other new collections use drafts/versions. Metadata uses50 versions initially; only Issuances/Reports promise permanent native version retention. New versioned collections also have protected `publishedAt` and `lastTransition` fields (Task5).

## Task 1: Draft organization and academic-year foundations

**Files:** create `src/collections/Organizations.ts`, `AcademicYears.ts`, `src/collections/shared/protectDomainWrites.ts`, `src/fields/domainSlug.ts`, `tests/int/domain-schema.int.spec.ts`. Include registration/types/migration as above.

Observed Task1 compatibility fixes also touch `src/hooks/enforceEditorialWrites.ts`
(resolve kebab-case slugs through the adapter's canonical table-name map) and
`src/access/activeAccount.ts` (reject IDs outside the current PostgreSQL serial range
before querying). Both failed through native execution before correction.

**Interfaces:** export `Organizations`, `AcademicYears` (`CollectionConfig`), `protectDomainWrites: CollectionBeforeOperationHook` and `domainSlug(useAsSlug: 'name'|'label'|'title'): RowField`. Reuse `enforceEditorialWrites`, `readPublishedOrStaff`, `authenticated`, `deleteDraftContent`. The slug helper extends native `slugField` with a field hook that checks canonical and latest-draft slug collisions under the write's account lock; native version tables have no unique index. All new-domain writes reload active authority, including privileged Local API calls. Until Task5 supplies a server-held transition, allow individual drafts only, even for publishers; deny direct publication/withdrawal/restore, bulk mutations and submitted audit fields. Deny API `autosave`, `publishAllLocales` and `unpublishAllLocales` flags on these new collections: configuration alone does not prevent native history mutation.

- [x] Add real Local API + REST/GraphQL tests: all four active roles prepare/read drafts; visitor/disabled/unknown-role access is denied; incomplete drafts work; supplied participation defaults false; duplicate slugs, direct publication and bulk writes fail. Exercise actual restricted DB-role grants.

```ts
const draft = await payload.create({ collection: 'organizations', draft: true,
  overrideAccess: false, user: fixtures.users.editor,
  data: { name: 'Synthetic organization', kind: 'usg' } })
expect(draft.participating).toBe(false)
await expect(payload.findByID({ collection: 'organizations', id: draft.id,
  overrideAccess: false })).rejects.toMatchObject({ status: 404 })
```

- [x] Run the focused command above; observe the missing-collection/authorization failures. Implement the two configs with manual drafts (`autosave: false`, `schedulePublish: false`), `domainSlug('name')` for Organizations and `domainSlug('label')` for AcademicYears. The helper uses native `slugField({ useAsSlug })`; later collections use `name` or `title` as listed. Test later draft slug edits, not just initial inserts. Do not seed USG names, dates or staff.
- [x] Generate/review/apply the additive migration to disposable targets. Re-run focused/full integration, types, changed lint; inspect generated contracts and migration grants. Commit `feat(domain): add draft organizations and academic years`, then independent review.

## Task 2: Offices, public people and activities

**Files:** create `src/collections/Offices.ts`, `People.ts`, `Activities.ts`, `src/collections/shared/protectDomainReferences.ts`, `tests/int/domain-references.int.spec.ts`; extend Task1's guard and field contracts only where needed.

**Interfaces:** `protectDomainReferences: CollectionBeforeOperationHook` blocks deleting referenced draft metadata and organization changes that would reinterpret retained office references. `validateDomainReferences` is a `CollectionBeforeChangeHook`; it receives Payload's full native candidate and current request/transaction. No separate pool or client-supplied ownership.

- [x] RED: missing/cross-organization parent, self/multi-node cycles, concurrent reciprocal-parent writes, missing references, invalid term/event dates, end-before-start, forged user links, referenced deletion and retained office organization changes. A source branch remains optional; CSGs gain no default branch structure.

```ts
await expect(payload.update({ collection: 'offices', id: office.id, draft: true,
  overrideAccess: false, user: fixtures.users.editor,
  data: { parent: office.id } })).rejects.toMatchObject({ status: 400 })
```

- [x] Implement the three collections and shared reference checks under the account lock. Resolve parents from canonical and latest draft state; never accept a cycle through either. Terms reference public People separately from Users. Unknown dates/time/location stay unset. Delete checks inspect retained native versions as well as current rows; bounded batches must not silently omit references.
- [x] Generate/review migration, prove rollback and the concurrent cycle with an observed DB wait, then focused/full checks. Commit `feat(domain): model offices people and activities`; independent review.

## Task 3: Formal record schemas and sealed Documents

**Files:** create `src/collections/Documents.ts`, `src/collections/Issuances/index.ts`, `src/collections/Reports/index.ts`, `src/collections/shared/officialFiles.ts`, `tests/int/formal-record-schema.int.spec.ts`; extend reference checks to these collections and retained versions.

**Inspection reconciliation (Task3):** `validateOfficialCandidate(req, collection, savedCandidate)` in `officialFiles.ts` reuses sanitized native field validators, then domain reference/date rules, then the sealed file gate. Direct tests establish this future service contract; Task5 wires reviewed transitions. Do not rerun field hooks or maintain a separate required-field list. Exact polymorphic equality includes `{ relationTo, value }`, also under `version.relatedRecords`. Extend the existing Posts delete hook only to preserve newly retained related-record references; keep its content/URLs/publication behavior intact.

**Interfaces:** `requireOfficialFiles(req: PayloadRequest, candidate: { mainDocument?: unknown; attachments?: unknown }): Promise<never>` currently throws a field-specific unavailable-storage error; the storage slice replaces its implementation with actual verification. Document read access is active staff only. A before-operation guard denies **all** Document mutations through REST/GraphQL/Local API, including privileged overrides. No upload or download endpoint exists. `mainDocument`/attachments reference Documents, never Media.

- [x] RED: editor can save incomplete Issuance/Report drafts; every role including super-admin cannot write Documents or publish an official record; client-written file state/key/checksum cannot enable publication; visitor cannot discover document keys or draft-related titles. Preserve Posts/Media behavior.

```ts
await expect(payload.create({ collection: 'documents', data: {
  title: 'Synthetic attempted file', state: 'ready', storageKey: 'forged' },
  overrideAccess: true })).rejects.toMatchObject({ status: 403 })
```

- [x] Implement configs, `maxPerDoc: 0` and manual record drafts. Add field-specific candidate checks for required title/slug/organization/type, report period, issuance number/year, dates and same-organization offices. Report validation errors before the final storage gate; a complete official candidate still cannot publish here. Preserve optional source facts.
- [x] Generate/review migration; run native REST/GraphQL/Local denied cases and full checks. Commit `feat(records): add formal record drafts and sealed documents`; independent review. This task does not certify PDF validity, file privacy after publication or successful official publication.

**Acceptance:** Runtime `582ac3a`, independently accepted by `/root/review_domain_records` on22 October2026:57 native tests, types, changed lint and generated snapshot comparison pass; no blocker. Implementer145 tests, six guard probes and eight-migration preservation proofs remain separately recorded in the task checkpoint.

## Task 4: Number integrity and reference retention

**Files:** create `src/collections/Issuances/normalizeDocumentNumber.ts`, `src/collections/Issuances/validateNumber.ts`, `tests/int/record-integrity.int.spec.ts`; modify Issuances config, shared reference guards and a new migration.

**Inspection reconciliation (Task4):** Installed3.90.2 can leave multiple `latest=true` versions when timestamps tie. Number and shared slug collisions must check each candidate parent's unfiltered head by `updatedAt DESC, id DESC`; superseded tied drafts do not reserve keys, while canonical rows still do. Backfill canonical and retained-version normalized numbers with exact JavaScript normalization before adding the canonical index; migration-local frozen normalization preserves migration reproducibility. Abort conflicting adoption atomically. Isolated canonical published-reference validation belongs here; real publication/withdrawal concurrency, participation transitions and transition rollback remain open until Task5 introduces the reviewed service. Synthetic SQL fixtures cannot certify those transitions.

**Interfaces:** `normalizeDocumentNumber(value: string): string` preserves punctuation/leading zeros, normalizes NFC, trims/collapses whitespace, lowercases and returns NFC again. Persist server-controlled nullable `normalizedNumber`; the key is organization/type/seriesYear/normalizedNumber. Complete keys must be unique; incomplete drafts may have null keys. Advisory without a source number leaves both number and normalized key unset.

- [x] RED: Unicode/whitespace/case equivalents collide; `001` differs from `1`, punctuation remains significant, fractional years fail, and a client cannot forge the normalized field. Two concurrent same-key saves produce one success. Native SQL rejects duplicate canonical tuples with SQLSTATE23505.

```ts
expect(normalizeDocumentNumber('  EO\t 001-A ')).toBe('eo 001-a')
expect(normalizeDocumentNumber('001')).not.toBe(normalizeDocumentNumber('1'))
```

- [x] Check other canonical rows **and** latest draft candidates under the shared account lock; exclude the current parent ID. Add the native compound unique index on canonical rows, not version history. Canonical reservations remain until a later publication replaces them or an unreferenced draft is deleted; draft edits alone do not free the old canonical key. Return a field error for this reservation, not an unexplained SQL exception. Cover native tied-version timestamps without trusting `latest=true` to be unique.
- [x] Block deleting metadata/files referenced by retained record versions. Add withdrawal validation for organizations/offices required by canonical published records, using published snapshots rather than newer drafts; prove the isolated rules now. Task5 must wire it to reviewed transitions, verify ending CSG participation blocks subsequent publications without filtering historical public reads, and prove concurrent publication/reference changes and rollback with lock barriers.
- [x] Generate/review index migration, fresh/upgrade/repeat proof, focused/full checks. Commit `feat(records): enforce numbering and retained references`; independent review.

**Acceptance:** Runtime `351ae3a`, checkpoint `395dc5c`; independently accepted by `/root/review_record_integrity` on22 October2026. Fresh67 native tests, types, changed lint, snapshot and guarded DB assertions pass, no finding. Implementer155 tests, five migration modes and six guard proofs remain separate evidence. Task5 dependencies below remain open.

## Task 5: Reviewed transitions, audit and scheduling

**Carried dependency from Task4:** Wire canonical published-reference withdrawal validation into this service. Verify participation changes preserve historical reads while blocking new publication, and exercise publication/reference races and rollback with observed lock barriers. These are not established by Task4's isolated synthetic fixtures.

**Files:** create `src/collections/shared/transitionDomainRecord.ts`, `validateDomainPublication.ts`, `domainTransitionEndpoints.ts`, `src/components/DomainTransitions/index.tsx`, `tests/int/domain-publication.int.spec.ts`; modify new collection configs, shared guards, existing `src/jobs/authorizePublication.ts`, `authorizeScheduling.ts`, `src/payload.config.ts`, and the supported server-function registration in `src/app/(payload)/layout.tsx` if needed. Regenerate types/import map and migration artifacts.

**Interfaces:** `RevisionProof = { versionID: number; versionHash: string }`; `transitionDomainRecord(req, { collection, documentID, action, expected, restore? })` accepts only registered new versioned collection slugs, positive safe IDs, `action: 'publish'|'withdraw'|'restore'`, required expected latest proof and a restore target proof only for restore. It returns `{ documentID, action, alreadyApplied }`. Reuse phase01's raw-version SHA256 and `sort: ['-updatedAt','-id']`; broaden the existing jobs whitelist rather than making another queue.

**Endpoints:** authenticated staff `GET /api/<collection>/:id/review` returns the saved draft + proof; publisher+ `POST /api/<collection>/:id/transition` accepts the input above. Proof and audit account IDs never appear in public output. Scope the transition grant to a private request-held WeakMap; request JSON/context/headers cannot mint it. Native CRUD/restore cannot bypass the service, including super-admin requests and Local API overrides.

- [ ] RED: publish saved metadata, preserve its public revision while editing, reject stale/missing/forged proof, invalid partial candidate and revoked authority, and reject direct status/audit writes. Exercise native restore's hook timing. Exact retry after lost response adds no version/audit event; conflicting state returns409.

```ts
const first = await transitionDomainRecord(req, input)
const replay = await transitionDomainRecord(req, input)
expect(first.alreadyApplied).toBe(false)
expect(replay.alreadyApplied).toBe(true)
expect((await payload.countVersions({ collection: 'organizations',
  where: { parent: { equals: input.documentID } }, req })).totalDocs
).toBe(versionCountBefore + 1)
```

- [ ] Service owns or joins the request transaction, pins its identity, acquires the account lock, reloads publisher and exact revisions, validates the **whole saved** candidate and current references, then writes one native update. Withdrawal uses the canonical published snapshot so it cannot accidentally copy an unreviewed draft into main. Restore validates the selected historical snapshot and the expected current revision separately, then writes that content through ordinary native update with fresh audit data; do not call native restoreVersion, which proxies request identity and forces draft status after collection hooks. Recheck original transaction after native hooks; swallowed errors must not escape rollback.
- [ ] Store protected `publishedAt` on first publication and retain it, plus versioned `lastTransition: { action, actorID, at, reviewedVersionID, reviewedVersionHash, expectedVersionID, expectedVersionHash }`. Reviewed proof identifies the content applied; expected proof identifies the precondition (different on restore). Exact retries must match actor, action, both proofs and resulting status; another restore target is not a replay. A newer draft/transition is a conflict. No public account identifiers, mutable audit input or separate approval state. Reject deleting ever-published new records; retain staff history. Test server denial of autosave/unpublish-all flags rather than relying on UI configuration to preserve history.
- [ ] Enforce published slug stability in the shared slug field hook after native generation, including explicit slug edits, forced `generateSlug`, draft saves and restored snapshots. Return a field error if the first published slug would change; corrections require an explicit redirect migration. Native slug uniqueness alone does not establish this guard.
- [ ] Extend complete-candidate checks to published metadata and current CSG participation. On office publication/restore, compare the candidate organization with the canonical snapshot and block changes that reinterpret retained references, even when the latest draft already uses the new organization. Ordinary name-only draft edits remain allowed. Official publish/restore remains blocked by `requireOfficialFiles`; successful metadata transitions prove the shared transaction/audit path. File verification/successful official publication stay in Slice2's acceptance.
- [ ] Replace only new collections' `admin.components.edit.PublishButton`/`UnpublishButton`; put reviewed restore controls in supported `beforeDocumentControls`. Use installed `Button`, `useFormModified`, `useDocumentInfo` and form hooks. Bind proof to the saved revision actually displayed, never silently fetch a newer proof on click. Require a saved, unmodified reviewed form, show field/conflict errors and reload on success. Test another staff save between opening the form and publishing:409, no automatic retry or publication of unseen edits. Keep Pages/Posts UI unchanged. For new-domain scheduling, the control must carry the displayed `expected: RevisionProof` to the server; extend the typed native wrapper to validate that proof under the same lock before queueing. Missing/stale proof cannot silently select a newer saved revision. Preserve old Pages/Posts scheduling contracts. Extend execution receipts to new collections; jobs use the same transition service and recheck files/references/actor at execution. Preserve existing88 regressions.
- [ ] Add rollback/retry, identical/concurrent transition, audit-forgery, relationship/privacy, job/autosave revision and withdrawal/cache tests. Generate/review artifacts; run focused/full integration, types, changed lint, build and browser checks. Commit `feat(publication): add reviewed domain transitions`; independent review.

## Task 6: Whole-slice verification and handoff

**Files:** create `tests/e2e/domain.e2e.spec.ts`, `tests/int/domain-migrations.int.spec.ts`; update `docs/local-development.md` and `plans/product-alignment.md` with actual evidence, not copied completion claims. Extend test helpers only for private synthetic fixtures; no production provisioning bypass.

- [ ] Browser: editor saves organization/year/office/person/activity/record drafts; publisher reviews/publishes metadata; stale proof and editor transitions fail; known-invalid records show field errors; official file controls remain unavailable. Assert actual API/public state, keyboard/focus and narrow-screen behavior. No institutional visual approval is claimed.
- [ ] Apply all migrations to fresh and populated disposable predecessors; repeat no-op; preserve existing IDs, password verifiers, relationships, URLs and main/cloud data. Prove canonical unique/FK constraints, denied direct DB-role grants and representative rollback. No down migration over retained records.
- [ ] Run `npm test`, types, full lint, changed lint, production-cache check and production build. Record inherited lint errors separately; new source failures block acceptance. Review generated types/import map, final diff, private exclusions and owner stash preservation.
- [ ] Request independent whole-slice review. Record accepted commits, real test counts, failed/skipped checks and remaining storage/deployment gates. Commit `test(domain): verify domain schemas and publication boundaries`. Do not merge/push automatically. Next approved roadmap item is private durable storage, followed by public records/search.

## Inspection sources and scope limits

Installed source is the version-specific authority: `payload/dist/collections/operations/{create,find,restoreVersion}.js`, `operations/utilities/update.js`, `fields/hooks/beforeValidate/promise.js`; `@payloadcms/drizzle/dist/{createVersion,queryDrafts,schema/buildRawSchema}.js`. Cross-check against [Payload drafts](https://payloadcms.com/docs/versions/drafts), [custom components](https://payloadcms.com/docs/custom-components/overview), and [PostgreSQL17 constraints](https://www.postgresql.org/docs/17/ddl-constraints.html).

This plan leaves storage provider/limits, PDF byte verification, canonical download routes, file recovery, cross-collection search, record detail pages, institutional shell/tokens and future integrations to their approved slices. Existing Media stays public. These exclusions must remain explicit in the final acceptance.
