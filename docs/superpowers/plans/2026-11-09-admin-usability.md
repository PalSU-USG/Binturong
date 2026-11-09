# Admin Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.
> Implement inline, RED-first, with focused commits and one independent whole-slice
> review before integration. Starts only after the owner approves the spec.

**Goal:** Give each staff role a short plain-language admin: grouped navigation,
a useful dashboard, simpler forms and an explained draft-to-published flow.

**Architecture:** Configuration and admin components only. Server access, transitions
and scheduling are consumed unchanged; hiding is presentation, never authority.

**Tech Stack:** Existing Payload 3.90.2 / Next / TypeScript baseline, `custom.scss`,
Playwright. No new dependencies, schema or migration.

**Spec:** [Admin usability](../specs/2026-11-09-admin-usability-design.md) (Draft until approved).

## Global constraints

- Worktree `C:/Users/Hawksprey/orca/workspaces/Binturong/admin-usability`, branch
  `Hawksprey420/admin-usability`, base `dev` `5b858a2`. No push, deployment or cloud change.
- Field `name`s/types/nesting unchanged; `npm run generate:types` must produce no diff
  other than labels/descriptions if any; run `generate:importmap` after new components.
- Synthetic users only (editor, publisher, admin, super_admin) in guarded `binturong_test`;
  run database writers serially; never touch real content.
- Dashboard reads use `overrideAccess: false` and the request user. Failures render an
  error state. Every UI restriction needs a paired API-denial assertion.
- Merge order: independent of `navigation`, `identity-home`, `record-sections` (public
  site). Overlap is limited to `src/payload.config.ts` and collection `admin` blocks that
  `record-sections` may touch; rebase this branch last and resolve those by hand. Do not
  edit `src/Header`/`Footer` content or `Logo`.

## Review focus

1. Hidden is not denied: direct URL and REST access per role unchanged.
2. Dashboard widgets never leak a record or count the role cannot read.
3. Editors cannot trigger publish through the replaced Pages/Posts button path.
4. Stale or failed queries are visible, not silently empty.
5. Keyboard, contrast and 200% zoom on every new component.

## Task 1: Role-aware navigation and labels

**Files:** modify `src/payload.config.ts`, `src/plugins/index.ts`, each collection/global
`admin` block; create `src/admin/navVisibility.ts` (`hiddenFor(minRole)`); create
`tests/e2e/admin-nav.e2e.spec.ts`; extend `tests/helpers/accessFixtures.ts` if needed.

- [ ] RED: per role, assert exact visible nav groups/links from the spec table (editor
  lacks Accounts, Advanced, Header/Footer; publisher lacks Accounts; super_admin sees all).
- [ ] RED: for each hidden item, assert direct REST read/write is still denied or allowed
  exactly as before (compare with `access.e2e.spec.ts` expectations); record whether the
  hidden collection URL is refused.
- [ ] Add `admin.group`, `labels`, `description`, and fail-closed `admin.hidden`; regroup
  plugin collections via overrides without altering plugin access overrides.
- [ ] Verify GREEN, `tsc`, lint; commit `feat(admin): group navigation by role`.

## Task 2: Role dashboard

**Files:** create `src/admin/dashboard/` (`StartHere`, `DraftsWidget`, `WaitingWidget`,
`RecentWidget`, `queries.ts`); modify `payload.config.ts` (`admin.dashboard`, remove
`BeforeDashboard`); regenerate importmap; create `tests/int/admin-dashboard.int.spec.ts`
and `tests/e2e/admin-dashboard.e2e.spec.ts`.

- [ ] RED (integration): `queries.ts` run as each role with synthetic drafts/published
  rows returns only readable fields, max five per collection, correct ordering; a
  forced read error yields an error result, not an empty list.
- [ ] RED (e2e): editor sees Start here, Drafts, Recent and no Waiting widget; publisher
  also sees Waiting with working review links; buttons absent when create is denied.
- [ ] Implement widgets as server components using `Promise.all`, `depth: 0`, `select`.
- [ ] Measure query count and time on the synthetic set; record in the task note.
- [ ] Verify, commit `feat(admin): add role dashboard widgets`.

## Task 3: Simpler forms and status panel

**Files:** create `src/components/StatusPanel/index.tsx` (+ scss); modify domain
collection field `label`/`description`/grouping, `Pages`, `Posts`, `Documents`,
`domainPublicationFields.ts`, `DomainTransitions` copy; create
`tests/e2e/admin-forms.e2e.spec.ts`.

- [ ] RED: panel text per state (draft, published, withdrawn, unpublished changes) and per
  role sentence; editors on Pages/Posts have no Publish/Schedule controls.
- [ ] RED (API): editor still receives denial when sending the publish request directly.
- [ ] RED: technical fields sit in a collapsed section; saved payload shape is unchanged
  (save a record, compare stored JSON keys with a pre-change snapshot).
- [ ] Implement panel, role-aware Pages/Posts button, grouping and plain labels.
- [ ] Regenerate types and importmap; review diffs; commit `feat(admin): explain status and simplify forms`.

## Task 4: Visual refresh and accessibility

**Files:** modify `src/app/(payload)/custom.scss`; create
`tests/e2e/admin-a11y.e2e.spec.ts`.

- [ ] RED: keyboard-only flow (login, create draft, open review drawer, publish as
  publisher) passes; focus is visible; viewport 360px and 200% zoom show no horizontal scroll.
- [ ] RED: contrast ratios of overridden text/background/focus pairs meet WCAG AA
  (contrast checker output recorded in the task note).
- [ ] Implement variable overrides; keep light and dark; text "Binturong" only, no assets.
- [ ] Verify, commit `style(admin): refresh admin theme`.

## Final verification and review

- [ ] `npm run lint`, `npm exec -- tsc --noEmit`, `npm run test:int`, `npm run test:e2e`
  (guarded DB 56323, serial), `npm run build`; report passes, skips and pre-existing failures.
- [ ] Screenshots per role at desktop and 360px (synthetic data only).
- [ ] One independent whole-slice review focused on the Review focus list; fix blockers
  with regressions and rerun checks.
- [ ] Update one checkpoint note under `plans/` with commits, results and next action.
