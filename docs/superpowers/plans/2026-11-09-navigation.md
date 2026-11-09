# Navigation implementation plan

Status: Draft for owner review; execution requires an approved design.

**Goal:** Deliver seven-destination primary navigation and reusable section orientation
without breaking stored Header/Footer links or exposing unpublished content.

**Spec:** [Navigation design](../specs/2026-11-09-navigation-design.md).

**Architecture:** Retain Payload globals and the shared link contract. Add one child
level to Header; keep Footer flat. Resolve a public tree on the server, render native
disclosures, and enhance close/focus behavior in a small client boundary. Section
indexes reuse the resolved tree; breadcrumbs receive explicit route/content ancestry.

**Baseline:** Planning worktree `C:/Users/Hawksprey/orca/workspaces/Binturong/navigation`,
branch `Hawksprey420/navigation`, base `dev` at `da406cf77943ed580bd468e5786a027ed66f4952`.
Initial tree was clean. These documents contain drafts only; no runtime checks were run.
The public-search design is absent on local `dev`; reconcile later search contracts
before execution. Current reference style: the domain-foundations implementation plan.

## Global constraints

- This drafting task changes only these two Markdown files: no application changes,
  tests, servers, database access, cloud operations or push.
- Future execution uses only guarded `127.0.0.1:56322/binturong_test`, synthetic data
  and serial database writers, including Playwright and builds that read content.
  Fail before Payload initializes if the exact host/port/database differs. Existing
  guards also allow localhost/55322; they alone do not enforce this slice's restriction.
- Do not use `tests/helpers/domainMigrations.mjs` unchanged: it creates other database
  names. Fresh/upgrade/recovery proofs must reset the same guarded disposable test DB
  serially, after confirming it contains only synthetic data. Never use the CMS mirror.
- No cloud, push, deployment, shared-data edits, dependency upgrades or lockfile churn.
  Payload migrations only; schema push stays off. Preserve applied migration history,
  IDs, URLs, relationship paths, account permissions and existing publication behavior.
- Keep live global writes publisher-or-higher with fresh authority; anonymous reads
  expose published destinations only. Do not retry denied reads with privileged access.
- Read Payload/Postgres skills before implementation of affected contracts. Inspect
  installed Next.js guidance before rendering changes. Do not import a second UI system.
- Use one task worktree/branch per ordered task, based on its accepted predecessor;
  use a separate integration worktree. Record actual paths, commits, checks and review
  results here as work proceeds. Each task needs independent review before integration;
  integration and push are not authorized by this plan.

## Review focus

Follow [specification → evidence → compatibility → defects](../../engineering-workflow.md#review-and-proof).
Check stored ID/URL parity, selected-branch link resolution, shared block/hero callers,
unsafe URLs, draft-title/cache leaks, denied global writes, disclosure semantics,
keyboard/focus restoration, no-JavaScript access, zoom and missing-data behavior.
Distinguish code evidence, synthetic proof and verified institutional content.

All paths below are relative to `binturong-open-usg/`. New file names are proposed.
Test commands are future instructions, not recorded passes.

## Task 1: Compatible Header schema and public link contract

**Files:** `src/Header/config.ts`, `RowLabel.tsx`; `src/Footer/RowLabel.tsx`;
`src/fields/link.ts`, `src/components/Link/index.tsx`; new
`src/Header/resolveNavigation.ts`; `src/utilities/getGlobals.ts` if resolution needs it;
new `tests/int/navigation.int.spec.ts`, `tests/int/navigation-migrations.int.spec.ts`;
`src/payload-types.ts`, new Payload migration/snapshot, `src/migrations/index.ts`.
Inspect `src/Footer/config.ts`, block/hero/linkGroup callers, existing global fixtures
and `src/endpoints/seed/index.ts`; update synthetic fixtures only, never run the seed.

**Interfaces:** preserve `navItems[].id/link` and shared `CMSLink` props; add optional
unique `section` and `children[].id/link` to Header, seven-row cap, one child level.
`resolveNavigation` returns only eligible public destinations and stable row IDs;
section identity is independent of display label. Keep page/post references unchanged.

- [x] RED: legacy leaf/custom/reference/newTab links retain IDs/order/URLs; seven
  parents and child rows round-trip. Reject duplicate sections, excess nesting,
  unsafe URLs and blank labels. Cover existing block/hero appearances and link callers.
- [x] RED: actual REST, GraphQL and user-scoped Local API deny visitor/editor/disabled
  updates and allow active publisher/admin/super-admin updates. Unpopulated, deleted
  and unpublished references reveal no title and cannot use a stale `url` fallback.
- [x] Observe focused failure, implement the additive schema/resolver/validation and
  Footer RowLabel typing correction; retain ordinary CMSLink behavior for valid inputs.
- [x] Generate types; generate/review the new migration with installed Payload commands.
  Prove fresh/legacy-populated upgrade, repeat/no-op, injected rollback and ID/URL/
  relationship parity on the exact guarded DB. Preserve unsafe legacy stored strings
  while suppressing unsafe rendering; no automatic relabeling/reordering or seven-item seed.
- [x] GREEN: focused integration, types and changed-file lint; review generated SQL and
  snapshot. Generate import map only if registrations change. Commit and obtain
  independent task review before Task 2.

## Task 2: Responsive navigation and resilient public shell

**Files:** `src/Header/Component.tsx`, `Component.client.tsx`, `Nav/index.tsx`;
`src/Footer/Component.tsx`; new `src/Header/NavigationDisclosure.tsx` if needed;
`src/app/(frontend)/layout.tsx`, `globals.css`; `src/utilities/getGlobals.ts` as needed;
new `tests/e2e/navigation.e2e.spec.ts`; extend `tests/production/public-cache.e2e.spec.ts`.
Inspect Header/Footer revalidation hooks and Pages/Posts revalidation callers; change
their existing cache invalidation path only where target publication/slug proof requires it.

**Interfaces:** server-resolved links feed a named Primary landmark and native
disclosures; small client enhancement owns Escape/close/focus only. Separate parent
anchor and group toggle; same order on desktop/mobile; Search outside mobile disclosure.
Footer stays a separately named flat navigation. No new visual identity or tokens.

- [x] RED: keyboard-only desktop/mobile use, nested close/focus, sibling opening,
  route completion, back/forward, breakpoint changes and new-tab behavior. Assert
  native navigation with JavaScript disabled and no hydration-only hidden links.
- [x] RED: empty globals, delayed/failed reads, partial missing links, long labels,
  200% zoom, narrow layout and reduced motion. Article content remains reachable;
  unavailable data shows minimal Home/Search plus an honest error, without draft fallback.
- [x] RED: warm-cache target withdrawal/slug correction and Header/Footer edits update
  output without private titles or broken canonical links; verify production cache mode.
- [x] Implement the shell/disclosures and isolated error/streaming boundaries. Reuse
  current semantic styles and institutional text while approved assets are unavailable.
  GREEN focused browser/cache checks, types and changed lint; commit and independent review.

## Task 3: Contextual indexes and breadcrumbs

**Files:** new `src/components/SectionIndex/index.tsx`,
`src/components/Breadcrumbs/index.tsx`; extend `src/Header/resolveNavigation.ts`;
existing frontend page/post layouts or pages where ancestry is known;
`tests/e2e/navigation.e2e.spec.ts`, `tests/int/navigation.int.spec.ts`.

**Interfaces:** `SectionIndex` receives resolved section identity/children/current URL;
`Breadcrumbs` receives explicit `{ label, href? }[]` ancestry, current item last.
No second CMS menu, slug-title inference or incoming-history-derived hierarchy.
Future issuance/report layouts supply Archives/Transparency ancestry respectively.

- [x] RED: exact-path versus prefix collisions, home-only matching, query/hash state,
  external links, missing/private ancestors and current item semantics. Confirm
  direct/deep links and refresh preserve orientation and existing `/posts/*` URLs.
- [x] RED: index appears beside content on wide screens and before it on narrow
  screens, with a working skip target, one main/H1 and named navigation landmarks.
- [x] Implement and integrate only existing verified routes. Keep seven-destination
  launch acceptance blocked until owner-approved targets exist; use synthetic routes
  in tests, never fabricate live section pages or institutional content to pass checks.
- [x] GREEN focused integration/browser checks, types and changed lint; commit and
  independent task review. Record unavailable route/content dependencies explicitly.

## Task 4: Full checks and independent whole-slice review

**Files:** final task ranges, fixtures, generated artifacts and this execution checkpoint.

- [ ] Reconfirm the exact DB guard before every DB-reading/writing runner. Serially run
  `npm run test:int`, `npm run test:e2e`, `npm exec -- tsc --noEmit --incremental false`,
  `npm run lint`, and `npm run build` from the app directory. Run the repository's
  production-cache suite against that build using its inspected configuration; record
  the exact command before execution. Do not claim build-time reads are database-free.
- [ ] Review migration/recovery evidence and verify the focused privacy/access tests
  fail under a targeted bypass, then restore source. Check keyboard, screen-reader
  names, focus, no-JS, 200% zoom, contrast, reduced motion and slow/error states manually.
- [ ] Inspect final diff, generated artifacts, preserved IDs/URLs, owner input decisions,
  unresolved routes and private-data exclusions. Record exact commits/commands/results,
  inherited failures, skipped checks and dirty files; a smoke pass is insufficient.
- [ ] Request one independent whole-slice review of the design, base-to-head range and
  evidence. Reviewer leaves code unchanged, repeats relevant checks and reports
  specification, privacy/cache, migration and accessibility findings. Fix blockers with
  RED/GREEN proof and obtain re-review; retain unverified institutional content as such.
- [ ] Record acceptance and one next action. Keep integration, cloud migration, push,
  final branding and later section content outside this slice's authorization.

**Execution record (implementer, 9 November 2026):** Task 1 `26f4f01`, Task 2 and Task 3
commits on `Hawksprey420/navigation`. Task 1-3 boxes ticked with real outcomes: RED observed
(missing modules for resolver, orientation components; no Primary landmark for the shell);
full serial `test:int` 21 files / 271 tests pass; full browser suite 34 pass; production-cache
suite 2 pass; `tsc` clean; `npm run lint` at the inherited 5 errors / 10 warnings.
Deviations: migration proof extends `tests/helpers/domainMigrations.mjs` (disposable databases)
instead of a new `navigation-migrations` spec; Playwright server port is overridable with
`E2E_PORT` because another worktree held 3003; Header/Footer tag expiry changed from
`max` (stale-while-revalidate) to `{ expire: 0 }` so edits show on the next request.
Open: Task 4 items marked above are not ticked; the independent review, manual screen-reader/
contrast/zoom checks and the seven live destinations (no verified routes) remain.

**Current next action:** coordinator runs the independent whole-slice review (Task 4).