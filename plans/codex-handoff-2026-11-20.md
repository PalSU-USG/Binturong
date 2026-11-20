# Codex handoff, 20 November 2026

Claude Code stopped at the owner's request (usage at 75%). Read this note, then
`plans/product-alignment.md` (current checkpoint), `AGENTS.md`, `binturong-open-usg/AGENTS.md`
and `docs/engineering-workflow.md` before acting. Inspect Git yourself; this note is recorded
state, not proof. It replaces `plans/codex-handoff-2026-11-14.md` for current work.

## State at handoff

- `dev` = GitHub `dev` = `2655f81` (pushed 20 Nov, owner: "Push it for now"). Vercel builds
  it as Preview; the build itself was not watched.
- Main checkout `C:/Users/Hawksprey/Binturong`: CRLF-only noise in `src/payload-types.ts` and
  `src/app/(payload)/admin/importMap.js`; do not commit it. Untracked `.claude/`,
  `.playwright-mcp/`, `tsconfig.tsbuildinfo` are the owner's.
- Docker: only `binturong-db-45323`, `binturong-db-45322`, `binturong-storage-45321`. Docker
  Desktop crashed twice on 19 Nov ("registry startup key watcher error"); recovery was Quit,
  `wsl --shutdown`, restart. **Never choose "Reset to factory defaults"**: it deletes the
  owner's dev data (`binturong_domain`) and Bintanong's.
- Memory is tight (about 3–6 GB free of 32). Claude Code's runner killed both dev servers
  once. Run at most one Next server plus one test run at a time.
- Possibly still running when you start: a dev server for the branding preview on
  `127.0.0.1:3001` (from the `usg-branding` worktree, reading `binturong_domain`). The owner
  may expose it through ngrok; if so, it must use `--basic-auth` and be closed after review.

## Branches and worktrees (all under `C:/Users/Hawksprey/orca/workspaces/Binturong/`)

| Worktree / branch | State | Next |
| --- | --- | --- |
| `usg-branding` / `Hawksprey420/usg-branding` (`a2339e0`, `b852064`) | Official USG Branding Guide palette, Montserrat, Senate red / Tribunal blue rules on Legislative/Judicial pages. Tokens 78/78, e2e 65/68 (home test updated after; admin waiting-list test fails on `dev` too). No build run. | Add emblems, build, merge (owner: "1 is conditionally approved") |
| `admin-research` / `Hawksprey420/admin-research` (`0eaca3c`) | Research note committed | Show owner the 3 directions; merge the doc |
| `draft-autosave` / `Hawksprey420/draft-autosave` (`c6cf459`) | Autosave off + migration; tests above | Review, merge, migrate `binturong_domain` |
| `resolutions-archive`, `download-deadline`, `checkpoint-refresh`, `vercel-skill` | Merged into `dev` | Safe to remove after the owner agrees |

The owner's branding guide is `E:/Hawksprey/Downloads/OFFICIAL USG BRANDING GUIDE.pdf`
(4 slides). The memo sample is `E:/Hawksprey/Downloads/Memo-23-s.-26-27.pdf`; it contains real
names, so keep it out of the repo.

## Owner decisions on 19–20 November (exact words)

- Series: "Keep seriesYear = 2026 and add a link to the Academic Year record", then "Skip the
  check" (no series/academic-year match validation).
- Resolutions page: "yes", path `/archives/legislative/resolutions` ("Yeah go ahead").
- Download deadline: "Raise it to twenty" (minutes).
- Branding: black text on orange (chosen option "Black text on orange (Recommended)"); branch
  accents "Accent branch pages"; "1 is conditionally approved. You could use or find online the
  emblems if you need to be."
- Phase 3 is launch readiness (owner: "Go for it for now"); see the checkpoint.
- Admin: "so barebones, and barely usable"; research WordPress and other CMSes; "2, well go
  ahead" (autosave fix + blank-draft cleanup + research).
- Executive pages: "just draft me your response … Since I will still check it pa rin naman".
  Draft only; do not build until the owner answers.
- Production: "as much as possible, 1:1 sana para hindi mahirap" (mirror dev).
- Operations: "5. maybe go."

## Phase 3 work queue (in order)

1. **Branding: emblems done, build and merge owed.** `2cc4ce5` adds `public/brand/usg-emblem.png`,
   `senate-emblem.png`, `tribunal-emblem.png` (cut from slide 1 of the guide by flood-filling
   the orange background up to the emblems' white outlines; about 512 px wide), switches the
   `Wordmark` to the USG emblem (no circular clip, 1.25:1) and removes `usg-logo.png`. Tokens
   78/78, tsc and eslint clean, header screenshots checked at 1280 px light and 375 px dark.
   Senate/Tribunal emblems are in `public/brand/` but not placed on pages yet. Owed: stop the
   :3001 preview, `npm run build`, full browser suite, then merge to `dev` locally (owner
   condition met). Push only with owner approval.
2. **Blank drafts — built, not merged.** Branch `Hawksprey420/draft-autosave` (`c6cf459`):
   Pages/Posts `autosave: false`; migration `20261119_162009_draft_autosave_off` drops the
   `autosave` column + index from `_pages_v`/`_posts_v` (down() restores them); migration proof
   now expects 16 and asserts the drop; browser tests save with the "Save draft" button.
   Verified: admin-config 13/13, domain-migrations 2/2, access e2e 3/3, admin-usability e2e
   passes except the pre-existing waiting-list test; tsc and eslint clean. Needs an independent
   review, then merge. **After merging, run `npm run payload -- migrate` against the owner's
   `binturong_domain` (main `.env`) before starting the dev server.** The six blank drafts in
   `binturong_domain` were already deleted on 20 Nov (pages 4–7, posts 4–5, plus 7 version rows).
   Live preview no longer refreshes per keystroke; it updates on Save draft.
3. **Admin redesign.** Research is committed on `Hawksprey420/admin-research` (`0eaca3c`):
   `docs/superpowers/specs/2026-11-20-admin-ux-research.md`. It recommends direction C (keep
   the task-first home; split the waiting list into New/Changed rows with type and a button;
   home counts that link to pre-filtered lists; "All | Not live yet | Live" status links with
   counts above every list) and lists its unverified claims. Owner chose C on 20 Nov ("You could
   go, although you need to give me UI/UX recommendations + layout in markdown"); layout and UI
   rules are section 4a of the note (`634ef11`). **Slice 1 built, not merged:** branch
   `Hawksprey420/admin-status-links` (`e27d5e9`, worktree `resolutions-archive`): server
   component `src/admin/stateLinks` added via `withStateLinks` in `payload.config.ts` to the
   nine drafts collections; counts via `loadStateCounts` (`find` with `draft: true`, as the
   user, so they match Payload's list, which reads newest saves; a live record with saved
   changes counts as "Not live yet"). Verified: int 28/28 (new `admin-state-links` 4/4), tsc,
   eslint, e2e "state links" passes; the waiting-list e2e fails as on `dev`; "how-to" e2e
   passed once and then timed out on the anonymous login redirect (blank page, no leak).
   Learned: links clicked before Payload hydrates the list are lost; the test waits for
   `limit=` in the URL. Next: independent review, merge, then slice 2.
4. **Executive pages.** Owner reviews the draft below first.
5. **Production, 1:1 with dev.** Write `docs/production-runbook.md`: a second Supabase project
   with the same Postgres major version, the same Data API off/lockdown and the same storage
   bucket shape (private); Vercel Production environment with the same variable names as
   Preview (`DATABASE_URL`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, `CRON_SECRET`,
   `PREVIEW_SECRET`, `OFFICIAL_STORAGE_URL`, `OFFICIAL_STORAGE_BUCKET`,
   `OFFICIAL_STORAGE_SERVICE_KEY`) but new secret values; `vercel-build` applies the same 15
   migrations; set function max duration ≥ 20 min if the plan allows or record the real limit.
   First admin: create via `/admin` first-user screen (unverified behaviour; check the Users
   access rules) then promote in the Supabase SQL editor. All dashboard steps are the owner's.
6. **Operations.** (a) Per-IP limit on `GET /api/documents/:id/file`: prefer a Vercel
   Firewall rate-limit rule (no code, works across serverless instances) and document it; an
   in-memory limiter is per instance and weak. (b) `domain-schema` and `domain-references`
   GraphQL tests expect `[]` but the anonymous `Organizations(draft: true)` query now returns
   `data: null` with an error (fails closed, no leak); find the change that altered it and fix
   the expectation or the response. (c) `admin-usability` e2e "waiting list" fails on `dev`
   too; probably leftover test data from runs Docker interrupted. (d) A restore drill of the
   `binturong_domain` backup into a scratch DB.

## Draft for the owner: executive record-type pages (not built)

Recommendation: generalise `src/app/(frontend)/archives/[group]/resolutions/page.tsx` into one
allow-listed route `archives/[group]/[kind]/page.tsx` that reuses `RecordListPage`'s
`fixedType`. Start with:

| URL | Lists | Breadcrumb |
| --- | --- | --- |
| `/archives/legislative/resolutions` | Senate resolutions (exists) | Archives / Legislative / Resolutions |
| `/archives/executive/memoranda` | Executive memoranda | Archives / Executive / Memoranda |
| `/archives/executive/executive-orders` | Executive orders | Archives / Executive / Executive Orders |

Every other pair 404s structurally (`dynamicParams = false`). Memoranda use the same fields as
the owner's Memo 023, s. A.Y. 2026-2027: `type: memorandum`, number "023", `seriesYear` 2026
plus the academic-year link, issuing office = Office of the President (Executive branch). Open
questions for the owner: include executive orders now or later; should "acts" get a Legislative
page; should Judicial have type pages yet (no samples seen).

## Recommended agent flow (Codex)

Use one **coordinator** (owns `dev`, the checkpoint, merges and pushes) and short-lived
**workers**, each in its own worktree and branch, plus an independent **reviewer** per branch.

```text
coordinator (main checkout, dev)
 ├─ W1 branding-emblems   (usg-branding)        ─┐
 ├─ W2 draft-autosave     (new branch)          ─┼─ test lane: one at a time via .e2e-lock
 ├─ W6 ops-graphql-tests  (new branch)          ─┘
 ├─ W3 admin-mockups      (admin-research, docs only)   ─┐ no tests, can run anytime
 ├─ W5 prod-runbook       (new branch, docs only)       ─┤
 └─ W4 exec-pages draft   (already above; owner review)  ─┘
      each worker → reviewer (read-only) → coordinator merges with owner approval
```

Rules for the flow:

- At most **two** workers active at once (memory), and only **one** running integration,
  browser or build commands at a time: create
  `C:/Users/Hawksprey/orca/workspaces/Binturong/.e2e-lock` before a run and delete it in a
  `finally`; if it exists, wait.
- One Next server per folder. Browser tests start their own server on 3003 and need a real
  `node_modules` (`npm ci`), not a junction; Turbopack rejects junctions.
- Tests only touch `binturong_test` (`.env.test`, port 45323). Never write test data to
  `binturong_domain`. Copy `.env.test` from an existing worktree; never commit `.env*`.
- No schema change is expected in this queue. If one appears, only one worker may own the
  migration at a time; regenerate types and the import map after.
- Workers commit on their branch (conventional commits, explicit staging, no AI trailers).
  If the Codex sandbox cannot write git metadata, the coordinator commits for it.
- Reviewer verdict MERGE OK / WITH FOLLOW-UPS / DO NOT MERGE; apply follow-ups before merge.
- Coordinator updates the checkpoint after each merge; pushes only with owner approval
  (`git push origin dev:dev`; if credentials prompt, use
  `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin dev:dev`).
- Shell: PowerShell. Git Bash cannot fork (Mandatory ASLR); for one-liners use
  `& 'C:\Program Files\Git\usr\bin\sh.exe' -c '...'`.

## Verification owed

Branding: build, light/dark screenshots, full browser suite after emblems. Download deadline
and resolutions: merged with reviews; the Vercel function duration is still unknown. GraphQL
and waiting-list test failures above are pre-existing on `dev`.
