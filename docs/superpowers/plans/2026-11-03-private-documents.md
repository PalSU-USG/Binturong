# Private Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.
> Implement this single coherent storage/publication task inline, with focused
> commits and one independent whole-slice review before integration.

**Goal:** Upload and verify immutable official PDFs, publish their exact reviewed
references, and deliver bytes only through current authorization.

**Architecture:** Payload owns document/session metadata and editorial authority;
Supabase private Storage owns bytes. Direct signed TUS uploads land in pending
keys; the server verifies and writes immutable ready keys. Publication uses an
out-of-lock preflight bound to the exact reviewed revision and locked revalidation.

**Tech Stack:** Existing Payload/Next/Postgres/TypeScript baseline, platform fetch,
reviewed pinned `pdf-lib` and `tus-js-client`. No Supabase client SDK required.

**Spec:** [Owner-approved private documents](../specs/2026-11-03-private-documents-design.md).
Owner approved the design and requested implementation on 3 November 2026; native
execution continues with the session's existing independent-review workflow.

## Global constraints

- Worktree `C:/Users/Hawksprey/orca/workspaces/Binturong/private-documents`, branch
  `Hawksprey420/private-documents`, integrated `dev` base `da406cf`.
- Preserve owner changes and private environments in other checkouts. No cloud
  changes, real-content import, main CMS data migration, push or deployment.
- Files are at most 50,000,000 bytes; TUS chunks 6 MiB; sessions expire after two
  hours; at most ten pending sessions per active creator.
- Byte reads stop at maximum-plus-one; provider timeout 30 seconds; PDF worker
  timeout 15 seconds and JS heap 128 MiB; at most two verification/download
  operations per process. Bound buffers separately and measure actual memory.
- Ordinary Documents CRUD stays denied, including privileged Local API calls.
  Request/data-bound internal grants authorize pending creation and finalization.
- Immutable ready objects and Documents entries are never overwritten/deleted.
  Client input cannot establish file readiness, identity, checksum or authority.
- Supabase tokens authorize only exact pending-path uploads. Private service keys
  and download capabilities never reach the browser. Verify actual role denial.
- Payload owns its new migration; provider bucket setup uses Storage API, never
  competing Payload/Supabase migration authorities for the same tables.
- Run database/storage writers serially. Use only guarded `binturong_test` on
  56322 and a named synthetic private Storage bucket in the local provider.

## Review focus

1. Client retry after object upload but failed DB commit: recover canonical bytes,
   not competing staging bytes. Pin in session/concurrency tests.
2. Revocation/expiry during verification: locked readiness recheck denies commit.
3. Provider corruption or stream cancellation: no unchecked bytes leak; release
   the per-process slot on every exit. Pin in adapter/delivery tests.
4. Manual/restore/scheduled preflights: bind exact revision and file identities;
   no network I/O under the global editorial lock. Pin observed-lock tests.
5. Worker memory differs from JS heap: maximum and hostile PDFs must terminate
   predictably; production-mode >4.5 MB upload/download and memory proof required.

## Task: Private documents end to end

### 1. Provider and PDF verification

**Files:** create `src/storage/officialStorage.ts`, `documentLimits.ts`,
`verifyPDF.ts`, and focused `tests/int/document-storage.int.spec.ts`.
Update package/lock only for the two approved libraries. Add private local
provider preparation/fixtures under `tests/helpers/` where reusable.

**Interfaces:** `getOfficialStorage()` returns a server-only adapter with
`assertPrivateBucket()`, `createUploadToken(stagingKey)`, `read(key)` and
`writeVerified(key, bytes)`; writes reject existing keys and reads are bounded.
`verifyPDF(bytes): Promise<{ size: number; sha256: string; mimeType: 'application/pdf' }>`
uses a worker with explicit termination and the approved resource bounds.
`acquireDocumentSlot(): () => void` rejects saturation with retryable 503.
Use `OFFICIAL_STORAGE_URL`, `OFFICIAL_STORAGE_SERVICE_KEY`,
`OFFICIAL_STORAGE_BUCKET`; production HTTPS or explicit local loopback HTTP only.

- [x] Write focused regressions; observe missing implementation RED. Reject
  public buckets, redirects, malformed config, over-limit/chunked reads, corrupt/
  encrypted/empty PDFs, worker timeout and saturation. Compare hashes to original
  synthetic bytes. Test exact signed upload path and immutable collision behavior.
- [x] Implement minimum adapter/worker and inspect installed parser/TUS source.
  Start an isolated local Storage API using existing image/secrets safely; retain
  originals. Provision a synthetic private bucket through provider API. Verify
  real signed TUS upload and anonymous/authenticated read/list/write/delete denial.
- [x] Run focused GREEN (14/14), types and strict changed lint; commit the verified provider unit.

### 2. Upload sessions, immutable Documents and admin upload

**Files:** create `src/storage/documentUploads.ts`, `documentEndpoints.ts`,
`src/components/DocumentUpload/index.tsx` and relevant tests. Modify Documents,
generated types/import map, `.env.example`, local guide and a new Payload migration
+ JSON snapshot + migrations index.

**Interfaces:** `beginDocumentUpload(req, input)` accepts exactly title,
organization, originalFilename, optional previousVersion and requestId UUID.
It returns `{ documentID, state, upload? }`; pending upload has endpoint/token/
bucket/path/expiry. `finalizeDocumentUpload(req, documentID)` returns ready metadata.
`consumeDocumentWrite(req, operation, id, data)` consumes an exact internal grant.
Routes: `POST /api/documents/begin-upload`, `POST /api/documents/:id/finalize`.
Add nullable protected fields `uploadActor`, `uploadRequestId` (unique server
creator/UUID key), `uploadRequestHash`, `stagingKey`, `uploadExpiresAt`, `verifiedAt`.
Do not infer verification for old rows. Keep keys/session fields out of public output.

- [ ] RED: native CRUD/forged ready and capabilities denied; malformed IDs/fields,
  wrong organization/version, actor mismatch, duplicate conflicting request,
  pending quota, revoked/expired session, competing finalizers and interrupted
  commit. Use actual roles and observable barriers; assert persisted metadata/bytes.
- [ ] Implement initialization under the account lock, provider work outside the
  lock, and final locked state/actor/expiry recheck. First immutable object wins;
  collisions/retries derive metadata only from independently verified canonical
  bytes. Transient provider/DB failures stay pending; deterministic invalid PDFs
  become failed. Expired pending sessions cannot become ready.
- [ ] Add native admin list upload control with progress, resume/retry and clear
  verification states; use installed Payload UI and TUS client, no custom uploader.
- [ ] Generate/review/apply the additive migration only on guarded/disposable
  databases; prove old IDs/rows/history/roles preserved, repeat no-op and rollback.
  Extend the migration proof's exact migration count without weakening its guards.
  Run GREEN, broader integration, types/lint and commit.

### 3. Publication preflight and controlled delivery

**Files:** create `src/storage/officialPublication.ts`, `documentDelivery.ts`;
modify shared `officialFiles.ts`, `transitionDomainRecord.ts`,
`jobs/authorizeScheduling.ts`, `jobs/authorizePublication.ts`, Documents endpoints
and associated publication/delivery regressions.

**Interfaces:** `preflightOfficialPublication(req, input: TransitionInput)` stores
an internal request-bound proof of the exact reviewed candidate/file identities.
The existing locked `requireOfficialFiles` rechecks ready metadata/organization
and consumes that proof, without provider I/O. Preflight at manual, schedule and
job-entry boundaries before transaction/lock acquisition; joined transactions
without a valid preflight fail closed. Do not weaken Pages/Posts or metadata paths.
`downloadDocument(req, documentID): Promise<Response>` backs
`GET /api/documents/:id/file`, verifies complete bounded bytes, rechecks current
staff/published-reference authorization and streams the verified buffer with
private/no-store attachment headers. Release resource slots on cancel/error/end.

- [ ] RED: missing/public/corrupt storage, unverified/wrong-org main/attachments,
  stale preflight, revocation and joined transaction bypass. Schedule and restore
  use the same file proof, with receipt/retry integrity preserved.
- [ ] RED: guessed IDs, drafts/historical-only references, newer draft replacement,
  shared published references, withdrawn last reference, disabled actors, tampered
  keys, corrupt bytes and cancelled/saturated large downloads.
- [ ] Implement smallest shared enforcement; add mutation sensitivity and observed
  concurrency/lock proof. Run GREEN and existing role/history/cache regressions.
  Commit the complete publication/delivery contract.

### 4. Full workflow, recovery and independent acceptance

**Files:** add `tests/e2e/documents.e2e.spec.ts`, production large-document coverage,
`scripts/document-manifest.ts` and relevant recovery tests; update local guide,
current checkpoint and plan checkboxes with actual outcomes.

- [ ] Browser: real >4.5 MB PDF, interrupted/resumed TUS upload, server verification,
  denied forged metadata, immutable replacement, staff draft delivery, publisher
  publication, anonymous exact bytes, withdrawal and history restoration.
- [ ] Generate manifest with document ID/org/key/size/hash/previousVersion; prove
  backup/restore byte equality against original synthetic inputs. No deletion of
  original/failed objects or real data; real inventory/offsite proof stays rollout.
- [ ] Run full integration/browser, types, changed/full lint and guarded production
  build/cache/large-download/worker proof. Record inherited failures separately.
- [ ] Independent whole-branch spec/evidence/compatibility review at committed
  runtime; fix blockers with focused RED/GREEN. Record cleanup, ignored evidence,
  actual commit, remaining dirty files and one next action. Do not integrate/push
  this new slice until independently accepted and within explicit authorization.
