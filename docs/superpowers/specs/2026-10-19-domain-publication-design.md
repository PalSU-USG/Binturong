# Domain and publication foundations

Status: approved by the user. This defines intended behavior; implementation has not started.

## At a glance

Binturong combines a university publication, government service portal, and
institutional archive. Follow the [design guide](../../design.md) and retain
Payload, Next.js, and PostgreSQL.

- USG staff manage launch content, including participating CSG submissions.
- Roles inherit permissions: **super-admin → admin → publisher → editor**.
- Editors prepare drafts; publishers and higher roles publish or withdraw them.
- Draft edits leave the current published version visible.
- Official PDFs stay private until a published record links to them.
- Replacing a file creates a new version; published file bytes stay intact.
- Keep existing Posts, IDs, relationships, and `/posts/*` URLs.
- Archives and Transparency show filtered records. Thirty-day aging never moves records.
- Leave room for future CSG workspaces without adding tenant accounts now.

## Content model

| Collection     | Purpose and fields                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Posts          | Existing editorial content, displayed as Updates; preserve its fields.                                                                                    |
| Issuances      | Title, slug, organization, issuing office, type, document number, series year, issued/effective dates, academic year, summary, main PDF, attachments.     |
| Reports        | Title, slug, organization, responsible offices, type, reporting-period label/dates, academic year, abstract, source version label, main PDF, attachments. |
| Documents      | Official file versions: organization, title, storage identity, original filename, MIME type, size, SHA-256, optional previous version.                    |
| Organizations  | Name, stable slug, kind (`usg`, `csg`, `university_unit`), CSG participation flag, initially false.                                                       |
| Offices        | Name, organization, optional parent; Executive/Legislative/Judicial branch only when supported by the source.                                             |
| People         | Approved public names and office terms, separate from login accounts. Record office, known term dates, and supplied academic year.                        |
| Academic years | Approved label, stable slug, known start/end dates.                                                                                                       |
| Activities     | Title, slug, organization, academic year, event date, known time/location, description. Calendar UI comes later.                                          |
| Media          | Existing photographs and other public media. Private official PDFs use Documents.                                                                         |
| Users          | Existing CMS accounts with a required role and protected `disabled` flag, initially false.                                                                |

Keep Pages, Categories, plugins, Header, and Footer. Define fields in Payload and
generate their types and migrations from that configuration.

Organizations, Offices, People, Academic years, and Activities use drafts/versions.
Publishing requires valid names, identifiers, references, and supplied dates;
these entries do not require a PDF. Documents have server-controlled file states:
`pending`, `ready`, or `failed`. Their public access follows published records.

Issuances and Reports may link to related issuances, reports, posts, and activities.
Public responses hide unpublished related entries, including their titles.

## Roles and account safety

Store one role: `editor`, `publisher`, `admin`, or `super_admin`.
Each higher role inherits the lower roles' permissions.

| Role        | Can do                                                                         |
| ----------- | ------------------------------------------------------------------------------ |
| Visitor     | Read published content and eligible files.                                     |
| Editor      | Read drafts, preview, prepare content, upload private document versions.       |
| Publisher   | Also publish, withdraw, restore, schedule, and change live site configuration. |
| Admin       | Also create and manage editor/publisher accounts and their roles.              |
| Super-admin | Also create and manage admin/super-admin accounts and their roles.             |

Account management includes disabling and deleting accounts. Admins cannot manage
other admins, super-admins, or grant either role. All users can edit permitted
profile fields and their own password; account status and roles remain protected.
No role may overwrite retained file bytes, forge audit fields, bypass publication
checks, or invoke the template reset/seed endpoint during normal operation.

Nominate the first super-admin explicitly during migration. Backfill other users
with reviewed roles; never promote everyone or bootstrap through public registration.
Prevent removal, demotion, or disabling of the last active super-admin, including
concurrent attempts. Disabled accounts cannot authenticate or authorize requests/jobs.
Unknown roles deny access. Recheck current account state so stale sessions cannot
retain revoked powers; verify the installed Payload behavior during implementation.

Enforce permissions on REST, GraphQL, field updates, and user-scoped Local API calls.
Use `overrideAccess: false` with trusted user/request context. Privileged internal
calls need a specific purpose and limited output. Hiding admin controls is insufficient.

Header, Footer, Categories, redirects, and form configuration change live output
without drafts: restrict writes to publishers and higher roles. Public form
submissions keep their own validation. Search writes belong to trusted sync/reindex
operations; reindex requests require publishing permission and published-only input.

## Record and publication rules

Keep numeric IDs. Slugs are unique per collection and stable after first publication.
Later slug corrections require redirects. New detail routes will be
`/issuances/[slug]` and `/reports/[slug]`; add navigation links when those pages exist.

Allow incomplete drafts. Before publication, validate the whole candidate revision,
including fields absent from a partial update. Return field-specific errors:

- Require a nonblank title, slug, published organization, type, and verified main
  PDF. Verify every attachment too. Reject missing/deleted references and bad dates.
- Issuance types: `executive_order`, `memorandum`, `act`, `resolution`, `advisory`.
  Numbered issuances require the source number and series year; an advisory can
  omit its number when the original has none.
- Preserve displayed document numbers. Prevent duplicates in validation and PostgreSQL
  using organization + type + series year + normalized number. Normalize Unicode NFC,
  trimmed/collapsed whitespace, and case; retain punctuation and leading zeros.
- Report types: `financial`, `accomplishment`. Require a reporting-period label.
  Optional end dates cannot precede start dates. Academic and fiscal years differ.
- Leave unknown source dates, summaries/abstracts, offices, years, and version labels
  unset. Do not invent institutional content.
- Referenced offices must belong to the record's organization. Office parents stay
  within that organization and cannot form cycles. Publishing records directly
  owned by a CSG requires that CSG's current participation. People are shared
  directory identities: their terms may reference published offices of inactive
  CSGs, including alongside offices of participating organizations. This also
  applies to later People publication and restore; referenced offices must still
  be published. Do not assume CSGs copy USG branches.

Use Payload's draft/version workflow:

1. Editor saves a draft; the current published revision remains public.
2. Publisher or higher role selects a reviewed revision. The server rechecks role,
   revision, references, and files. Stale/conflicting requests fail visibly.
3. Publish atomically, retain identity, and refresh public caches, search, and sitemaps.
4. Withdrawal removes public access across records, files, related entries, search,
   previews, and caches. Authorized staff retain history; restoring it requires the
   same publication checks.

The server records action, actor, time, and reviewed revision with each transition's
version. Reject client-written audit fields, including super-admin requests; omit
account identifiers from public output. Set `publishedAt` on first publication,
retain it afterward, and keep source dates separate. Preserve existing Posts dates.
Public metadata comes from the published revision, including modification dates.

Repeat publish/withdraw requests safely. After a lost response, check persisted
state before retrying. Validation failure rolls back the transition. Scheduled jobs
recheck the authorizing account and exact revision; reject revoked/stale jobs and
restrict the current login-only jobs endpoint. Add no separate approval-status workflow.

Retain Issuance/Report versions without pruning (`maxPerDoc: 0`), using manual saves
initially. Keep immutable Documents versions. Existing Pages/Posts retain their
50-version policy; their history has no permanent-retention guarantee.

Withdraw published records instead of routinely deleting them. Publishers and
higher roles may delete unreferenced draft-only records. Block deletion of referenced
metadata/files and withdrawal of organizations/offices required by published records.
Block office organization changes while retained records reference it; migrate those
references deliberately. Protect these checks against concurrent publication and
preserve acyclic office parents. Ending CSG participation blocks new publication
and restore of directly owned records while leaving historical records visible
until explicitly withdrawn. It does not block publication of shared People records.

## File storage and delivery

Use durable private object storage. Until it is ready, disable official file writes
and delivery; there is no fallback to public local uploads.

The server verifies actual PDF content and derives MIME type, size, checksum, and
storage identity. Set upload limits from hosting constraints in the storage plan.
Failed/abandoned uploads stay private. Each replacement gets a new object and
Documents entry; publishing switches references atomically. Retain previous versions;
automatic cleanup is outside this slice.

Check each download against a currently published main-file or attachment reference.
Knowing a draft file's ID/key grants no access. Use the published revision's file;
a newer draft cannot replace it publicly. A file shared by published records remains
available while any valid published reference exists.

Keep provider keys and private object URLs server-side. Use controlled delivery
without protected-response caching or reusable bearer links that bypass withdrawal.
Downloaded copies cannot be recalled. Verify backups, recovery, and a file migration
manifest before accepting institutional uploads.

## Migration and environment safety

USG staff share one editorial authority at launch. Organization fields record source,
not permissions. Future tenancy requires trusted memberships and isolation tests for
records, files, search, previews, jobs, and caches. Defer unused tenant fields.

Payload owns table migrations. Preserve existing IDs, data, URLs, relationships,
original files, and the lockfile. Account for generated types, search, redirects,
previews, caches, and fixtures when changing contracts. Preserve the owner's separate
generated-types changes; regenerate within the implementation worktree.

Local setup is recorded in the main checkout's [setup checkpoint](../../../plans/local-supabase-setup.md):
baseline `c8b1a54`, lint loading `b151180`, snapshot evidence `e14f87c`.
Reconcile cloud's existing `dev` marker before later migrations; never run initial
table-creation SQL against its existing tables or introduce competing Supabase history.
Back up and define recovery before shared writes, role backfills, or bootstrap.

Use the same reviewed migrations and required storage/access behavior locally and
in cloud. Ports, origins, secrets, mail destinations, sessions, and tests may differ.
The user requested hosted CMS content, relationships, file references, and password
verifiers locally. Keep private exports outside Git and synthetic tests separate.
This is a snapshot, not automatic synchronization; verify file bytes separately.

Resolve the recorded 14 config differences, PostgreSQL minor-version mismatch,
missing buckets, and broad grants/no-RLS before claiming deployment readiness.
Payload sessions do not supply Supabase JWT identity. Review Data API exposure and
effective database roles separately. A local pass does not deploy changes to cloud.

## Proof and delivery order

For each slice, follow the [engineering workflow](../../engineering-workflow.md):

- Test fresh/upgrade migrations, constraints, invalid input, rollback, and retries.
- Test actual visitor/editor/publisher/admin/super-admin access, account escalation,
  admins attempting to manage peers/super-admins, stale sessions/jobs, private-file
  reads, and seed/jobs restrictions.
- Exercise concurrent publication and last-super-admin protection with observable
  contention. Verify drafts never replace published content or leak through related
  entries, search, previews, sitemaps, redirects, or caches.
- Verify files through replacement, failed upload, shared references, withdrawal,
  restore, and recovery. Report lint/type/integration/browser/build results honestly.
- Later UI slices check responsive layouts, keyboard/focus, 200% zoom, contrast,
  readable metadata, loading/empty/error states, and the approved design direction.

After spec review, plan: domain/permissions → storage → public search → navigation
→ tokens → institutional shell/home → record patterns → Archives/Transparency/Government.
Keep slices small, reviewed, committed, and logged. Worktree consent is already given.

Defer tenant logins, SSO, Bintanong/MCP/PNPKI, custom helpdesk, PDF text extraction,
custom permission builders, bulk imports, and replacement design systems.
