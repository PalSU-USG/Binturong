# Private official documents: storage and delivery

Status: owner-approved implementation design, 3 November 2026. The owner approved
Supabase private storage with support for larger PDFs. This document fills in
the remaining contracts of the approved domain/publication specification.

## Scope and approach

Use one private Supabase bucket, `official-documents`, with separate `pending/`
and `ready/` prefixes. Payload remains the authority for document metadata,
editorial identities, publication and migrations. Supabase identity is not
inferred from Payload sessions. Existing public Media is unchanged.

The owner selected direct resumable uploads rather than a server-proxied 4 MiB
upload limit. S3 would add a provider without a project requirement. The proposed
initial maximum is **50,000,000 bytes per PDF**, with 6 MiB TUS chunks. The app
server handles only small JSON requests for initialization and finalization;
PDF bytes travel directly to storage. Downloads use a controlled streaming
response rather than a public URL or a buffered large function response.

## Upload and immutable versions

1. An active editor or higher submits title, organization, original filename,
   optional previous Document and a client-generated UUID request ID. The server
   reloads authority, validates exact input and allocates the document ID and
   object keys. Repeating the same actor/request/payload returns the same pending
   document; changing the payload is a conflict. Enforce creator/request identity
   with a database unique constraint. Previous versions must be ready and belong
   to the same organization. Count and limit each actor's ten pending sessions
   under the existing account/transaction lock.
2. The browser receives only a short-lived, exact-path **upload** capability for
   the pending object and sends it through `tus-js-client`. It receives no service
   key, signed download URL or capability for the ready prefix. Interrupted
   transfers resume with progress/error feedback. Sessions expire after two hours;
   expired or abandoned bytes remain private and are not automatically deleted.
3. Finalization is restricted to the session's still-active creator. The server
   reads at most maximum-plus-one bytes (rejecting the extra byte), parses a
   nonempty, unencrypted PDF with a reviewed parser, and derives actual MIME type,
   byte length and SHA-256. Parsing runs outside the request thread with a
   15-second/128 MiB JavaScript heap bound and worker termination on failure.
   This heap bound does not include PDF buffers: limit verification/downloads
   to two concurrent operations per process, reject excess work with retryable
   503, and verify realistic process memory under large/adversarial inputs.
   Provider requests have a 30-second timeout. Malformed, oversized and
   resource-exhausting inputs cannot become ready.
4. The server writes the **verified bytes**, not a racy provider copy of the
   pending path, to the reserved ready key with overwrite disabled. It verifies
   the stored bytes before recording readiness. Client retries cannot replace
   that object. The first successful ready-object creation selects canonical
   bytes. On an existing-key conflict, independently verify the existing object
   and derive metadata only from it, never from a competing staging read. A
   corrupt existing object fails closed and is retained for investigation. A
   verified object whose database commit failed is recoverable by retrying against
   that same server-assigned key and verifying those bytes again.
5. The database readiness update rechecks current authority and document state
   and expiry under the existing account/transaction lock. Exact retries return the same
   ready document. Lost responses and competing finalizers do not create extra
   versions or let metadata describe different bytes. Network/verification work
   does not hold the global editorial lock.

Provider/network/database failures leave the session pending and retryable.
Deterministically invalid PDFs can transition to failed and require a new request
ID. Expired sessions cannot become ready, including after an earlier object write;
already-committed ready sessions remain idempotently readable by the active creator.

Every replacement creates a new Documents entry with `previousVersion`; ready
metadata and keys are immutable. Ordinary REST/GraphQL/Local API writes remain
denied, including privileged Local API calls. Only request/data-bound internal
capabilities can create pending entries or complete their verified transition.
No client-supplied ready state, checksum, storage key or ownership is trusted.

## Publication and delivery

`requireOfficialFiles` verifies the saved record's main file and every attachment:
ready state, same organization, verified identity and existing private object.
Missing storage configuration, a public bucket, a missing/corrupt object or an
unverified entry fails closed. Manual publication, restore and scheduled execution
share this service. Draft changes do not replace a currently published file.

Preflight storage verification outside the global editorial lock, bound to the
exact reviewed revision and immutable file identities. The existing transition
then rechecks authority, revision, relationships and matching immutable metadata
inside its transaction. Never silently switch to a newer candidate after preflight.
The application never deletes or overwrites ready objects; out-of-band provider
tampering is detected again during delivery and surfaced as a storage failure.

`GET /api/documents/:id/file` resolves the server-controlled ready object. Fresh
active staff may inspect ready draft files; visitors need at least one current
canonical published Issuance/Report main-file or attachment reference. A guessed
ID or retained historical reference grants no public access. Recheck the current
reference after storage preparation, immediately before authorizing response
delivery; overlapping authorized transfers cannot recall bytes already received.

Read and hash the complete bounded object before emitting any bytes, then stream
that verified buffer in chunks. Do not forward an unchecked provider stream that
could deliver corrupt bytes before a trailing checksum failure. Hold the process
concurrency slot until the stream completes or is cancelled; cancellation releases
the slot. Prove large-response behavior and peak process memory in production mode.

Delivery is an attachment with a sanitized original filename, PDF MIME type,
`nosniff`, and private/no-store headers. It never redirects to storage and does
not accept user-controlled URLs or keys. Stream the verified bytes; a newer draft
cannot alter the response. Withdrawal stops later downloads unless another
published record still references that file. Replacements preserve old versions.

## Storage, persistence and UI boundaries

Add only the pending-session metadata needed on Documents (creator, request
identity/hash, staging key, expiry and verification timestamp), with a new Payload
migration and generated types. Preserve numeric IDs and old sealed entries;
never turn existing rows into verified documents through a backfill. Keep direct
Data API grants denied on Payload tables and test actual restricted roles.

Storage policies grant no anonymous/authenticated object read, list, replacement
or delete for this bucket. Backend service credentials stay server-side; the
only client write capability is the exact pending upload token. Inspect bucket
privacy and exercise provider access, rather than treating service-role success
as proof of public denial. Test buckets and fixtures remain separate from real
institutional content. No cloud bucket/policy change or deployment is included.

Add a focused Documents admin upload control using existing Payload UI primitives:
metadata, file selection, progress, resume/retry and verified/failed state. It
creates actual immutable file entries; ordinary document CRUD stays sealed.
Issuance/Report editors select ready files through the existing relationships.

New dependencies are limited to a PDF parser (`pdf-lib`) and resumable client
(`tus-js-client`); storage REST requests use platform fetch. Pin reviewed versions
and preserve the rest of the lockfile baseline. Confirm parser and worker behavior
in the production build, including a PDF larger than 4.5 MB.

## Acceptance and operational limits

Prove PDF bytes against original synthetic input, not generated metadata alone.
Cover actual roles, invalid/forged input, duplicate initialization, concurrent
finalization, revoked actors, interrupted uploads, parser/size limits, lost database
commit responses, wrong-organization references, draft privacy, withdrawal, shared
published references, retained versions and restoration. A targeted mutation must
make each critical new guard's focused test fail before its bytes are restored.

Exercise real local Supabase Storage and its anonymous denial paths, migrations
on fresh/populated disposable databases, browser upload/resume, and production
streaming/download behavior. Existing Phase02 permission/history/cache regressions
remain required. Mocks alone cannot establish storage or publication readiness.

Produce a file manifest (document ID, organization, key, size, SHA-256 and previous
version), verify byte-for-byte backup/restore with known synthetic files, and keep
original files and failed objects. No automatic cleanup, real-content migration,
cloud adoption, integration or deployment follows from this implementation. Before
institutional intake, separately verify the real inventory and offsite recovery.

References: [approved domain spec](2026-10-19-domain-publication-design.md),
[Supabase resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads),
[storage access controls](https://supabase.com/docs/guides/storage/security/access-control),
[PDF parser API](https://pdf-lib.js.org/docs/api/classes/pdfdocument), and
[large function payload guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).
