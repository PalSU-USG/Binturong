# Account and Access Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the approved four-role hierarchy in the existing CMS, protect accounts, and close existing publication bypasses.

**Architecture:** Keep Payload authentication, sessions, access rules, and hooks. Share role checks across collections and endpoints; use Payload's PostgreSQL transaction for account changes. Preserve the existing frontend and content.

**Tech Stack:** Installed Payload 3.90.2, Next.js 16.3.3, TypeScript, PostgreSQL 17, Vitest, Playwright; npm and the existing lockfile.

**Spec:** [Approved domain/publication design](../specs/2026-10-19-domain-publication-design.md).

## Scope and roadmap

This is the first foundation slice. It implements accounts and access on existing
Pages/Posts and site configuration. New domain collections, formal-record revision
audits, PDF storage, and public record pages follow in separate plans. Passing this
plan does not make the full product or hosted deployment ready.

| Order          | Slice                           | Result                                                                                                                                                                                       |
| -------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a — this plan | Accounts and current CMS access | Four roles, safe account changes, protected writes and previews.                                                                                                                             |
| 1b             | Domain/schema foundations       | Organizations, Offices, People, Academic years, Activities, Documents, Issuances, Reports; validation, reviewed-revision transitions, audit/history. Official file operations stay disabled. |
| 2              | Private durable storage         | Verified immutable PDFs, controlled downloads, withdrawal, backup/recovery. Required before official record publication.                                                                     |
| 3              | Public records and search       | Published-only queries and search projections with canonical record links.                                                                                                                   |
| 4–5            | Navigation and base UI          | Header model, approved tokens, accessible primitives and typography.                                                                                                                         |
| 6–7            | Institutional shell and records | Home, responsive list/detail layouts, metadata and interaction states.                                                                                                                       |
| 8              | Public sections                 | Archives, Transparency, Government as views over the approved records.                                                                                                                       |
| Later          | Integrations                    | Revisit only after foundations work.                                                                                                                                                         |

Use native implementation in a separate worktree per task, with independent task
review and a separate integration worktree. Do not run parallel schema writers. Review later plans at their
slice boundaries rather than designing every future screen now.

## Global constraints

- Store one role: `editor`, `publisher`, `admin`, or `super_admin`.
- Each higher role inherits the lower roles' permissions.
- Admins manage editor/publisher accounts; super-admins also manage admins/super-admins.
- Prevent removal, demotion, or disabling of the last active super-admin.
- Draft edits leave the current published version visible.
- Keep existing Posts, IDs, relationships, and `/posts/*` URLs.
- Payload owns table migrations. Automatic schema push stays disabled.
- No cloud writes, root development-data resets, dependency upgrades, or owner-file changes.

## Review focus

These cases need explicit tests, beyond ordinary allow/deny checks:

1. Saved JWT after demotion/disable: its former powers stop working — Tasks 2 and 5.
2. Two super-admins demoting each other: one active super-admin survives — Task 2.
3. Empty database first-user registration: no public bootstrap bypass — Task 2.
4. Editor changes a published record without `_status`, or restores a version: public content stays protected — Task 3.
5. Draft/search or preview/cache crossover: private titles never become public — Tasks 4 and 6.

## Before execution

- [x] Verify branch `feat/domain-publication`, clean worktree, approved spec, and main owner changes.
- [x] Prepare dependencies from the existing lockfile. `npm ci` was stopped under low host memory; a real copy of the installed baseline replaced it. No package/lockfile changes or external dependency junction remain.
- [x] Prepare ignored worktree environments: development uses a separate local `binturong_domain` database on port 55322; tests retain guarded `binturong_test`. Use private backups and the verified local snapshot for the development copy. Keep main `postgres`, cloud, and Bintanong untouched.
- [x] Run the unchanged tests/type check/build once here; record inherited lint failures separately. Never run tests against the CMS snapshot. Update this plan's checkboxes and the task checkpoint as work completes.

All file paths below are relative to `binturong-open-usg/`. Each task follows
RED → minimal implementation → GREEN → explicit staged-diff review → commit.

### Task 1: Define roles and add safe schema defaults

**Files:** create `src/access/roles.ts`, `tests/int/roles.int.spec.ts`, `tests/int/role-schema.int.spec.ts`;
modify `src/collections/Users/index.ts`, `src/payload-types.ts`, `src/migrations/index.ts`;
add the CLI-generated `access_roles` migration and JSON snapshot in `src/migrations/`.
Update typed seed/test user creation callers with safe defaults; run backend integration
tests in Node so real Payload login signing uses one runtime realm.

**Interfaces:** export `UserRole = 'editor' | 'publisher' | 'admin' | 'super_admin'`,
`hasRole(role: unknown, minimum: UserRole): boolean`, and
`canManageRole(actor: unknown, target: unknown): boolean` from `roles.ts`.
Generated `User` gains required `role` and `disabled` fields.

- [x] Write `inherits_roles_and_rejects_unknown_values` and observe RED:
      `hasRole('super_admin', 'publisher') === true`,
      `hasRole('editor', 'publisher') === false`, unknown/null/array roles return false;
      `canManageRole('admin', 'admin') === false`, super-admin can manage every known role.
- [x] Run `npm run test:int -- tests/int/roles.int.spec.ts`; confirm the expected failure before implementation.
- [x] Implement the four-value policy. Add role default `editor` and disabled default `false`; protect both fields from self-service writes. Generate types and `npm run payload -- migrate:create access_roles`. Review SQL: backfill existing users to editor before requiring the role; never auto-promote accounts. Preserve credentials and IDs.
- [x] Apply only to disposable/local branch databases. Verify fresh migration, populated synthetic upgrade, repeat-run no-op, and unchanged IDs/password verifiers. Re-run the focused tests and `npm exec -- tsc --noEmit --incremental false`.
- [x] Review/stage the listed source, test, generated types, and migration files; commit `feat(access): define the four CMS roles`.

### Task 2: Protect accounts, authentication, and bootstrap

**Files:** create `src/access/activeAccount.ts`, `src/collections/Users/hooks/protectAccounts.ts`,
`src/collections/Users/bootstrap.ts`, `scripts/bootstrap-super-admin.ts`,
`tests/helpers/accessFixtures.ts`, `tests/int/accounts.int.spec.ts`;
modify Users config, `package.json`, and `tests/helpers/seedUser.ts`.

**Interfaces:** `getActiveAccount(req: PayloadRequest): Promise<Pick<User, 'id' | 'role' | 'disabled'> | null>`;
`protectAccounts` exports native before-operation/change/delete hooks;
`bootstrapSuperAdmin(req: PayloadRequest, userID: number): Promise<void>` is CLI-only.
`createAccessFixtures(payload: Payload): Promise<{ users: Record<UserRole, User>; tokens: Record<UserRole, string> }>` returns synthetic accounts and login tokens.

- [ ] Add failing tests: self-profile succeeds; role/status injection fails; admins cannot create/promote/edit/delete admin peers or super-admins; super-admin management succeeds; unknown roles and disabled users are denied. Exercise the actual first-register operation, including GraphQL and an empty test database.
- [ ] Run `npm run test:int -- tests/int/accounts.int.spec.ts` and record RED.
- [ ] Implement fresh account lookup and protected field/target checks. Block unauthenticated account creation even when the native first-register path internally uses `overrideAccess: true`. Only the CLI bootstrap/test provisioner gets a server-held request marker; request bodies/query/context cannot grant it. Keep ordinary users' reads self-only and admin queries limited to manageable accounts. Preserve safe author-name projection.
- [ ] Keep native session authentication (`useSessions: true`), deny disabled/unknown-role logins, clear sessions on disabling, and reject refresh for disabled accounts. Installed JWT auth already reloads the user and checks session IDs; verify that behavior with real tokens instead of building another auth system.
- [ ] Serialize account role/status/deletion checks using `pg_advisory_xact_lock(20261020, 1)` on **the current Payload adapter transaction**. Re-read actor, target, and active super-admin count under that lock. Fail if no transaction exists; do not use a separate pool connection. Reject bulk user update/delete until they can preserve these checks. Test two concurrent demotions/deletions with observable lock waits, injected failure rollback, and a subsequent successful write.
- [ ] Add `npm run bootstrap:super-admin -- --user-id <reviewed-id>` with dry-run default and explicit `--apply`. Restrict it to the prepared local branch/test databases, promote only an existing active nominated account, serialize it with the same lock, and make exact repeats harmless. The CLI owns its transaction; hooks join it. Missing/invalid IDs, disabled accounts, nonlocal targets, or attempts to bypass normal account management after bootstrap fail. Do not nominate a real account without the owner's selection.
- [ ] Run the focused tests, including old-token login/refresh checks. Update synthetic admin fixtures explicitly; cleanup must not bypass last-super-admin protection except through the isolated test provisioner.
- [ ] Review/stage only this task's files; commit `feat(access): protect privileged account management`.

### Task 3: Enforce drafting and publishing permissions

**Files:** create `src/access/contentAccess.ts`, `src/hooks/enforceEditorialWrites.ts`,
`tests/int/editorial-access.int.spec.ts`; modify Pages, Posts, Media, Categories,
`src/Header/config.ts`, `src/Footer/config.ts`, `src/plugins/index.ts`,
`src/access/authenticated.ts`, and `src/access/authenticatedOrPublished.ts`.

**Interfaces:** native `Access` exports `editContent`, `publishContent`, and `readPublishedOrStaff`;
native before-operation/change/delete hooks `enforceEditorialWrites`. All use `getActiveAccount`.

- [ ] Add RED cases for every role through enforced Local API plus REST/GraphQL: editor draft save succeeds; publish, withdraw, restore-to-public, delete-published, and schedule attempts fail. Include omitted `_status`, bulk updates, and `draft: false`. Publishers and higher roles can publish valid existing Page/Post content. Editor revisions preserve the public title/body.
- [ ] Run `npm run test:int -- tests/int/editorial-access.int.spec.ts`; observe the existing bypasses.
- [ ] Wire shared checks into every affected collection/global/plugin override. Readers see published records or authorized drafts; editors use the native draft path. Restrict live Header/Footer/Categories/redirect/form configuration writes to publisher+. Keep Pages/Posts' current 50-version policy, native required fields, hooks, and URLs. Public media stays public; official PDF handling remains outside this slice.
- [ ] Require publishing permission on native restore and scheduling paths, not just `_status` fields. Ordinary hard deletion cannot remove published entries. Keep form-submission validation separate from form-configuration permissions. Preserve existing plugin fields/hooks when overriding access.
- [ ] Re-run the focused matrix and related account tests. Verify author projections expose no emails, roles, password fields, or sessions.
- [ ] Review/stage exact changed files; commit `feat(access): enforce editorial publication permissions`.

### Task 4: Close indirect reads and search writes

**Files:** create `src/search/authorizeReindex.ts`, `src/search/publishedSearchAccess.ts`,
`tests/int/public-boundaries.int.spec.ts`;
modify `src/plugins/index.ts`, `src/search/beforeSync.ts`,
`src/utilities/getDocument.ts`, `getGlobals.ts`, `getRedirects.ts`,
`src/blocks/ArchiveBlock/Component.tsx`, and affected frontend query callers.

**Interfaces:** `authorizeReindex(req: PayloadRequest): Promise<Response>` wraps the installed plugin's handler;
`publishedSearchAccess: Access` restricts public search rows to currently published Post IDs;
existing cached query signatures stay unchanged. Public queries use `overrideAccess: false`, `draft: false`.

- [ ] Add failing tests for anonymous draft reads through redirects, archive blocks, related posts, search, and cached helpers; draft changes must not alter the current published search title. Direct search CRUD is denied for every ordinary user; only publisher+ may request reindex.
- [ ] Run `npm run test:int -- tests/int/public-boundaries.int.spec.ts`; record the exact failing paths.
- [ ] Fix the shared query/caller that owns each leak. Keep preview queries authenticated and separate from shared public caches. Narrow privileged author/category lookups to their needed fields and propagate genuine failures.
- [ ] Preserve the native search plugin. Guard its installed reindex endpoint after plugin registration and before its handler runs. Give only that server-held invocation permission to run its native access checks; ordinary collection writes remain denied. Keep sync limited to published revisions, preserve the prior published projection on draft saves, and remove entries on withdrawal/delete. A body-supplied context flag must never enable trusted writes. Verify behavior against the installed handler, which checks search create/update/delete permissions.
- [ ] Add `publishedSearchAccess`: derive permitted source IDs from an access-enforced, published-only Post query selecting IDs, then constrain search reads to those IDs and `doc.relationTo: posts`. Empty results deny reads. Cover public REST/GraphQL as well as the frontend when failed sync leaves stale rows. Verify withdrawal stays private during failed index repair; cross-collection search waits for Slice 3.
- [ ] Re-run the focused cases plus publication tests, including a failed sync followed by retry. Index repair must converge to the published source without duplicate entries or private fallback.
- [ ] Commit `fix(access): protect public queries and search maintenance` after staged-diff review.

### Task 5: Protect preview, jobs, and destructive seed paths

**Files:** modify `src/payload.config.ts`, `src/app/(frontend)/next/preview/route.ts`,
`src/app/(frontend)/next/seed/route.ts`, `src/components/BeforeDashboard/index.tsx`;
extend `src/hooks/enforceEditorialWrites.ts` and Pages/Posts scheduling configuration;
create `src/jobs/authorizePublication.ts`, `tests/int/operational-access.int.spec.ts`.
Update generated types/migration snapshots if scheduled-job authorization data changes.

**Interfaces:** `authorizePublication(req: PayloadRequest, job: { accountID: number; collection: 'pages' | 'posts'; documentID: number; versionID: number }): Promise<void>`
revalidates the authorizing account and exact revision before a scheduled transition.

- [ ] Add RED tests: all user roles are denied `/next/seed`; preview requires a current active staff account and valid preview secret; editor/disabled users cannot run jobs; a revoked scheduling actor cannot publish through cron.
- [ ] Run `npm run test:int -- tests/int/operational-access.int.spec.ts` and confirm expected failures.
- [ ] Make seed return 403 before calling any seeding code and remove its dashboard action. Retain private synthetic fixture setup for tests. Use active-account checks for preview and jobs. Preserve authenticated relative preview redirects.
- [ ] Keep scheduler runner authentication separate from per-job authority. Persist server-controlled `accountID`, `collection`, `documentID`, and `versionID` on scheduled transitions; recheck them at execution. Reject legacy jobs without that proof rather than guessing an actor. If the built-in scheduled task cannot enforce it, replace only that task adapter, preserving the native queue. Include any required migration in this task.
- [ ] Run focused tests for allowed publishing jobs, stale/revoked jobs, invalid secrets, malformed account IDs, and retries after failure. A valid cron secret alone cannot approve arbitrary publication.
- [ ] Review/stage the complete unit; commit `fix(access): guard preview jobs and seed operations`.

### Task 6: Verify the complete slice and prepare review

**Files:** create `tests/e2e/access.e2e.spec.ts`; update existing admin/frontend e2e tests
only where role-aware fixtures require it; update `plans/product-alignment.md` and local setup guidance.

- [ ] Add browser regressions: editor saves a draft without changing public content; publisher publishes; admin cannot manage a super-admin; disabling an account invalidates its existing session. Assert server outcomes as well as UI visibility.
- [ ] Run `npm test`, `npm exec -- tsc --noEmit --incremental false`, `npm run lint`, and `npm run build`. Record inherited failures separately; new failures in changed code block completion. Recheck migrations on fresh and populated synthetic databases, repeat-run behavior, and preserved IDs/credentials. Do not run a down migration over valuable role data; recover using a reviewed backup/forward correction.
- [ ] Exercise actual anonymous and all four authenticated roles against REST, GraphQL, preview, search/reindex, jobs, and user-scoped Local API. Check keyboard/focus in affected admin flows; inspect desktop/mobile behavior where controls changed. Report unavailable browser tooling explicitly.
- [ ] Review the full diff, generated files, private-data exclusions, and root owner-file preservation. Request independent specification/evidence/compatibility review; fix blockers and rerun affected checks.
- [ ] Commit the verification/fixture documentation as `test(access): verify the CMS permission boundaries`. Record actual commits, failures/skips, remaining data-deployment steps, and next action in the checkpoint. Do not merge, push, migrate cloud, or claim the later domain/storage slices complete.

## Handoff

Review this plan before execution. After approval, use native execution in the
task worktrees, with test-first tasks, independent task reviews, and a final integration review. The next
plan is domain/schema foundations; it owns the new formal-record lifecycle and
files stay disabled until the separate storage slice passes.
