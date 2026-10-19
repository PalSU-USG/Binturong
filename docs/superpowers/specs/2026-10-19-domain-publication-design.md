# Domain and publication foundations

Status: written spec for user review. The user approved the foundation in
conversation; the detailed contracts below are proposed for written approval.
This document does not claim that the product behavior is implemented.

## Purpose and scope

Binturong is PalSU USG's public-information, student-service, transparency, and
institutional-records portal. Preserve the approved identity and information
architecture in the [design guide](../../design.md), the existing Payload/Next/Postgres
foundation, and the [engineering workflow](../../engineering-workflow.md).

This spec establishes record identity, relationships, permissions, publication,
and document-visibility contracts. Durable storage, public search, navigation,
and visual implementation will follow as dependent slices with their own concrete
implementation tasks. A schema-only milestone does not authorize official uploads
or establish that the site is ready for institutional publication.

The [reconnaissance and decision record](../../../plans/product-alignment.md) identifies
the existing modules, migration baseline, source findings, and verification limits.

## Settled user decisions

- USG staff manage all records at launch, including participating CSG submissions.
- Preserve room for later multi-tenancy without implementing tenant memberships
  or claiming tenant isolation in this release.
- Capabilities inherit as `admin > publisher > editor`. Administrators can publish;
  publishers can prepare drafts; only administrators manage accounts and roles.
- Keep existing Posts, numeric identifiers, relationships, and `/posts/*` URLs.
- Separate official records and documents from editorial updates and photographs.
- Editors revise drafts while the current published revision remains public.
- Validate metadata and the canonical file before publication. Draft files remain
  private. File delivery depends on a currently published record reference.
- Preserve published file bytes; replacements create new document versions.
- Archives and Transparency are query views. Thirty-day aging never moves records.
- Use isolated worktrees for implementation; the user has already consented.
- Local Supabase must rehearse the hosted target so development and deployment
  behave consistently. Schema-only similarity is insufficient.
- The user's immediate mirroring priority is existing CMS data and relationships,
  including the original media/document bytes where available, rather than an
  empty database with matching tables.

## Model responsibilities

| Collection       | Responsibility and initial fields                                                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `posts`          | Existing editorial content, presented as updates. Preserve current fields and persistence contracts in this slice.                                                                                                                           |
| `issuances`      | Formal acts/orders/memoranda/resolutions/advisories: title, slug, organization, issuing office, type, document number, series year, issued/effective dates, academic year, summary, canonical document, attachments.                         |
| `reports`        | Financial/accomplishment reports: title, slug, organization, responsible offices, report type, reporting-period label, optional period dates/academic year, abstract, official version label when supplied, canonical document, attachments. |
| `documents`      | Official-file metadata and immutable file versions: organization, descriptive title, server-controlled storage identity, original filename, MIME type, byte size, SHA-256, and optional previous-version relationship.                       |
| `organizations`  | Institutional attribution: name, stable slug, kind (`usg`, `csg`, `university_unit`), and CSG participation flag, default false. This is not an authentication tenant.                                                                       |
| `offices`        | Stable institutional offices: name, organization, optional parent office, and optional Executive/Legislative/Judicial classification where supported by the source.                                                                          |
| `people`         | Approved public directory names and office-holder terms. Keep this separate from login Users. An assignment records office, start/end dates when known, and academic year when supplied.                                                     |
| `academic-years` | Approved year label, stable slug, and optional known start/end dates. Do not generate presumed current years or dates.                                                                                                                       |
| `activities`     | Activity/calendar records: title, slug, organization, academic year, event date, optional known time/location, and description. Calendar UI is a subsequent slice.                                                                           |
| `media`          | Photography and other non-record media; never the delivery path for private official PDFs. Existing media is not silently converted.                                                                                                         |
| `users`          | Existing authentication collection plus required role and administrator-controlled `disabled` flag, default false. Disabled accounts cannot authenticate or authorize content/job operations.                                                |

Keep Pages, Categories, existing plugins, Header, and Footer. New record fields
are defined in Payload configuration and reflected in generated types/migrations.
No replacement repository framework or parallel independently maintained schema is needed.

Issuances and Reports can link optional `relatedRecords` to issuances, reports,
posts, and activities. Public projections omit unpublished targets rather than
exposing their draft titles or metadata. Organizations, Offices, People, AcademicYears,
and Activities use drafts/versions for their own public metadata; publishing them
requires valid names/identifiers, references, and supplied dates, not a canonical PDF.
Documents use a server-controlled `fileStatus` (`pending`, `ready`, `failed`);
their public eligibility derives from published-record references, not a separate
editor-controlled publication flag.

## Record identity and validation

Use Payload's numeric primary keys. Record slugs are unique within their collection
and remain stable after first publication. Title edits must not silently regenerate
published slugs. A future explicit slug correction requires redirect/old-path handling.

Future canonical detail routes are `/issuances/[slug]` and `/reports/[slug]`.
Archives, Transparency, and combined Updates link to those canonical records.
Existing posts retain `/posts/[slug]`; renaming the UI does not rename the collection.
Do not add navigation links to these routes before their pages are implemented.

Publication requirements for Issuances and Reports:

- Nonblank title, stable slug, published organization/source, record type, and a
  verified canonical PDF. Attachments, when present, must also be verified files.
- Issuance types are `executive_order`, `memorandum`, `act`, `resolution`, and
  `advisory`. Numbered types require the source document number and series year.
  An advisory can omit a number when the original has none.
- Preserve document-number display text. Reject duplicates using the combination
  organization, issuance type, series year, and normalized document number
  (Unicode NFC, trimmed/collapsed whitespace, case-insensitive; retain leading zeros
  and punctuation). Enforce the unique key in PostgreSQL as well as validation.
- Report types are `financial` and `accomplishment`. Require a nonblank reporting-period
  label. Start/end dates and academic year are optional when unknown; supplied end
  dates cannot precede start dates. Never substitute an academic year for a fiscal year.
- Source dates, abstract/summary, offices, and official version labels remain unknown
  when the source does not supply them. Publication must not invent those facts.
- Referenced offices belong to the record's organization. A CSG record requires an
  explicitly participating CSG. Hierarchical offices must remain within one organization
  and cannot form cycles. Do not assume every CSG mirrors the USG's branches.

Incomplete drafts are allowed. Publication checks run against the complete candidate
revision, including relationships omitted from a partial update. Invalid types,
missing/deleted references, malformed dates, or missing/unverified file bytes block
publication with field-specific errors. No partial public transition may remain.

Use `publishedAt` for the first successful website publication of a new record,
assigned by the server and retained on later revisions. Keep source `issuedOn` and
`effectiveOn` separate. Existing Posts dates are preserved rather than rewritten.
Public metadata must come from the published revision, not a newer draft's `updatedAt`.

## Permissions

Use one required user role: `editor`, `publisher`, or `admin`. Hierarchy is explicit
in shared server-side capability checks. This release does not need a customizable
permission builder or organization memberships.

| Operation                                                    | Anonymous | Editor | Publisher | Admin |
| ------------------------------------------------------------ | --------- | ------ | --------- | ----- |
| Read published records/approved public metadata              | Allow     | Allow  | Allow     | Allow |
| Read and prepare drafts; authenticated preview               | Deny      | Allow  | Allow     | Allow |
| Upload a new private document version                        | Deny      | Allow  | Allow     | Allow |
| Publish, withdraw, restore, or schedule publication          | Deny      | Deny   | Allow     | Allow |
| Change a published official file's bytes in place            | Deny      | Deny   | Deny      | Deny  |
| Create users, assign roles, disable/delete accounts          | Deny      | Deny   | Deny      | Allow |
| Read/update own permitted profile and password               | Deny      | Self   | Self      | Allow |
| Invoke template data-reset seed endpoint in normal operation | Deny      | Deny   | Deny      | Deny  |

Collection, transition, and field checks enforce these rules through REST, GraphQL,
and user-scoped Local API calls. Admin UI visibility is not enforcement. Apply
`overrideAccess: false` and trusted request/user context to public/user-scoped reads.
Internal privileged reads need a narrow purpose and explicit output projection.

Existing public surfaces without drafts (Header, Footer, Categories, redirect
configuration, and form configuration) accept writes only from publishers/admins.
Editors cannot change live public output by bypassing a record's publish action.
Search index writes are reserved to trusted synchronization/reindex operations;
an ordinary user mutation must not become a privileged index write. Reindex requests
require publisher/admin authorization and publish-safe source projection. Public
form submissions retain their separately validated submission rules, not configuration
editing privileges.

Account role fields are administrator-controlled on both create and update. A
non-admin profile update cannot alter role, account status, or another account.
Missing/unknown roles fail closed. Existing users need a reviewed role backfill and
an explicitly nominated first administrator; never make all existing users admins
or rely on a public first-user registration route to bootstrap shared environments.
Prevent removal of the last active administrator, including concurrent changes.

Authorization uses current server-validated account state; role removal must not
leave an old session with publishing privileges. The implementation plan must verify
Payload's installed session behavior and account-state reload rather than assuming
that storing a role in a JWT guarantees freshness.

## Publication lifecycle

Use Payload drafts/versions instead of adding a second publication-status field.

1. An editor saves a draft. Unpublished records and files stay private.
2. Editing an existing published record saves a draft revision. Its current
   published metadata and file remain the public source of truth.
3. A publisher/admin publishes a specific reviewed revision. Recheck current role,
   record/revision state, required relationships, and file readiness at the write
   boundary. A stale or conflicting revision must produce a conflict, not overwrite
   a newer revision or publish different bytes than the publisher reviewed.
4. A successful publish records actor/time through server-controlled version history,
   retains stable identity/first publication date, and invalidates public caches,
   search projections, and sitemaps as applicable. Failures must be visible/recoverable.
5. A publisher/admin can withdraw the record. Public views, direct reads, previews
   without authorization, search, and file delivery must obey that withdrawal.
6. Historical revisions and file bytes remain available to authorized staff. Returning
   to an older revision is another validated publisher/admin transition.

A repeated publish/withdraw of the same current revision must be safe. A request
after a lost response must reconcile persisted state before retrying. A validation
failure rolls back the public transition. Do not invent a new business workflow
with submitted/approved/rejected stages in addition to these capabilities.

Payload does not automatically supply the publishing actor. Persist a server-derived
publication audit (action, actor, time, reviewed revision) with each transition's
version. Public projections omit account identifiers and auth data. Reject attempts
to supply or overwrite audit values through client fields, including administrator
requests; system jobs use the revalidated authorizing account.

Issuances and Reports retain their version history without automatic pruning
(`maxPerDoc: 0`). Initially use manual saves rather than enabling high-frequency
autosave with unlimited retention. Immutable Documents entries retain file history.
Existing Pages/Posts keep their current 50-version policy for compatibility; this
spec makes no permanent-history guarantee for those editorial collections. Changing
that policy is separate from retaining formal institutional records.

Scheduled transitions retain the same rules. At execution, verify the authorizing
account still has publishing authority and the scheduled revision still matches.
Reject stale/revoked jobs. The jobs endpoint's current login-only authorization must
be narrowed; system credentials do not grant arbitrary users permission to run it.

Published records use withdrawal rather than ordinary hard deletion. Draft-only,
unreferenced records may be deleted by publishers/admins. Prevent cascading deletion
of referenced organizations, offices, years, or retained official document versions.
Separate extraordinary data-removal/recovery work from routine editorial deletion.

Reject withdrawal of organization/office metadata while it is required by a currently
published record. Reject office organization reassignment while any retained record
references it; create the correct office entry and deliberately migrate references
instead. Reparenting within the same organization must preserve the acyclic hierarchy.
Organization/office withdrawal and publication checks must share concurrency protection
so simultaneous operations cannot leave a published record with invalid references.
Ending CSG participation blocks new CSG publications; historical published records
remain available until an explicit record withdrawal. Participation is not a switch
that silently erases institutional history.

## Documents and public delivery

Official PDFs belong in durable private object storage. File writes and public
delivery remain disabled/fail closed until that storage slice is implemented and
verified. The domain slice must not fall back to local public uploads.

The server derives MIME/size/checksum/storage identity from the actual upload;
client-supplied metadata cannot declare a file verified. Verify PDF content as well
as extension/content-type, enforce configured size limits, and surface failed uploads.
The storage plan will set concrete size limits from hosting constraints before upload
implementation; this spec does not guess an institutional limit.

Each file version gets a new immutable object identity and Documents entry.
Replacement uploads never overwrite retained objects. A candidate draft references
its new version; publishing changes the public reference atomically. A failed or
abandoned upload cannot create a publicly downloadable file. Do not add an automatic
garbage collector or delete old versions as a side effect of replacing an attachment.

Public delivery resolves a Documents entry through a currently published canonical
or attachment reference. A document referenced only by drafts is denied even if its
ID or object key is known. The published snapshot, not an editor's newer draft,
determines the accessible file. If two published records share a version, withdrawing
one does not hide the file while the other still legitimately publishes it.

Keep provider keys and direct private-object URLs server-side. Initially use a
controlled delivery path that checks authorization for each request and does not
cache protected responses; a previously issued bearer download URL must not bypass
withdrawal. Already downloaded copies cannot be recalled. File backup/recovery and
a verified migration manifest are required before institutional storage readiness.

## Organization attribution and later tenancy

All launch editors operate under one USG editorial authority. Organization fields
express provenance and classification, not a user's allowed tenant. People are not
login users. A CSG's public listing does not grant its representatives access.

A later tenancy slice must add trusted memberships, scoped capabilities, relationship
checks, database-role/grant decisions, and cross-organization tests across records,
files, search, preview, jobs, and caches. It may build on existing organization IDs;
do not add unused `tenantId` fields or permissive policies now.

Payload sessions do not automatically create Supabase JWT identity. Review Data API
exposure and grants independently of CMS permissions. The current broad grants/no-RLS
baseline is a deployment blocker to resolve deliberately; copying it is not security
approval. Payload-managed table changes remain under Payload migrations.

## Compatibility, migrations, and recovery

### Local and hosted parity

Use the same reviewed Payload migrations for application tables, constraints,
indexes, and authorization-related schema in both environments. Reconcile the
hosted baseline history before deploying later migrations. A local test result
does not apply that migration or establish hosted parity by itself.

Reproduce required bucket names, privacy settings, file limits, storage access
rules, application roles, and publication behavior locally before relying on them
in cloud. Provision infrastructure through a reviewed, repeatable procedure with
one authority per resource. Do not require manual local-only SQL or untracked
dashboard edits for the application to work.

Ports, origins/redirect hosts, environment secrets, mail delivery destinations,
and test fixtures can differ. Mirror the requested hosted CMS content into local
development with stable IDs, relationships, version history, and file references.
Keep that snapshot and any private export outside Git. Local login credential
handling is an explicit setup choice; development data must never replace the
dedicated synthetic test database. Required extension/version capabilities and behavior
must match; record and test platform version differences before claiming parity.

The current 14 config differences, missing buckets, grants/RLS differences, and
PostgreSQL minor-version mismatch are an outstanding reconciliation list. Classify
each as an intentional environment difference or a required correction. Desired
security changes must be tested locally and deliberately applied to cloud through
the approved release procedure, rather than preserving unsafe grants as the target.

Every persistence/storage/authorization slice must verify the resulting local and
hosted metadata/configuration and effective-role behavior before claiming deployment
complete. Keep cloud credentials out of local test commands and tracked artifacts.

### Migration and recovery boundaries

The recorded setup baseline is `c8b1a54`, with lint loading corrected by `b151180`.
The original checkout's owner-generated types remain outside those commits. An
implementation worktree must regenerate/compare derived types without altering the
owner's original file. Reuse the lockfile/dependency baseline; do not reinstall for
documentation-only work.

Before shared database changes, verify schema parity and reconcile the cloud's
existing `dev` migration marker with recovery evidence. Never execute baseline
table-creation SQL against existing hosted tables. Do not use a second Supabase
migration history for Payload tables or perform cloud changes during spec review.

Prefer additive collections and reviewed nullable-to-required/backfill transitions.
Preserve current records and original files. Every contract change must account for
generated types, relationships, search, redirects, previews, caches, and fixtures.
For role bootstrap/backfills, identify the target account explicitly, record the
pre-change state, verify the resulting permissions, and define recovery before writes.

## Acceptance evidence required during execution

- Fresh schema and upgrade migration tests, relationship/uniqueness constraints,
  invalid input, rollback, and repeated migration behavior.
- Actual anonymous/editor/publisher/admin sessions: denied role escalation,
  publication, cross-account changes, private-file reads, seed and jobs calls.
- Draft changes leave the published snapshot unchanged; only publishers/admins
  publish the reviewed revision; partial updates cannot skip required checks.
- Concurrent/stale publication and last-admin changes exercise observable contention,
  not timing sleeps. Retries reconcile committed state without duplicate transitions.
- File bytes/checksums and relationships survive replacement, failed upload,
  withdrawal, shared references, and restore. No public fallback exists without storage.
- Publish/unpublish/delete and stale jobs cannot leave private content in public
  lists, search, related records, redirects, sitemaps, previews, or caches.
- Later frontend slices preserve canonical record identity across the thirty-day
  boundary and verify mobile/desktop, keyboard/focus, 200% zoom, contrast, readable
  metadata, and loading/empty/error behavior against the approved design direction.
- Report applicable lint/type/integration/browser/build outputs, skipped boundaries,
  and independent review. Existing failures remain explicit rather than hidden.

## Exclusions and next stage

No tenant logins, SSO, Bintanong/MCP/PNPKI integration, custom helpdesk, PDF full-text
extraction, custom permission builder, bulk content import, invented institutional
fixtures, or wholesale design-system migration belongs in this foundation.

After written-spec approval, create the dependency-ordered implementation plan:
domain/permissions, durable storage, public search, navigation model, design tokens,
institutional shell/home, record patterns, and derived public sections. Each coherent
slice needs explicit tests, review, commits, and a current checkpoint. Execution
method is selected when reviewing that plan; worktree consent is already settled.
