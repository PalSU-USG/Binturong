# Codex handoff, 23 Nov 2026

Codex owns Binturong from here; the owner is using Claude for another project. This note
adds nothing to the plan itself. The plan and its next action are the
[current checkpoint](product-alignment.md#current-checkpoint) (last written by Codex at
`fb32c73`). The earlier [21 Nov handoff](codex-handoff-2026-11-21.md) still holds for the
standing rules (ask before push, deploy, hosted migrations, data deletion and login changes;
tests only on `binturong_test` through the shared lock; PowerShell only; no AI credit).

## State

Superseded by Codex's checkpoint entries of 23 Nov (SSO on Preview at `b53467c`). With the
owner's approval ("Go for 1"), Claude pushed the docs-only commit `1c1b992` to GitHub `dev`.
Untracked `.claude/`, `.playwright-mcp/` and `tsconfig.tsbuildinfo` are tool output.

## Owner decisions, 23 Nov 2026 (answers to Claude's list of open owner items)

- Dev database password rotated and Supabase redirect URLs added ("already done for 3",
  "for 4, yes done"). Fluid compute confirmed ("7. Yes").
- SSO in the same Preview push "as long its safe". Codex had already shipped it to Preview.
- Copy local content (menu, pages, sample posts) to the hosted dev database: "Hmm, for now
  yes". Approves the copy into hosted dev only, not production. The method is not chosen yet:
  propose one to the owner first, and include the sample-post images, which must go to the
  Media bucket.
- Admin redesign: "The comments will guide u". From the canvas comments, Add an issuance and
  Access requests both open as a centered dialog, not a side panel ("This!", "model sana
  to"). This replaces the side-panel direction in the 21 Nov handoff. Boards titled
  "(chosen)" and "(not chosen)" on the canvas mark the choice.
- The owner sent the three branch emblems (USG, Student Senate, Student Tribunal). Copies
  without text already exist in `binturong-open-usg/public/brand/`, but only `usg-emblem.png`
  is used. The owner's new versions are higher resolution, and the Tribunal one has no
  orange; they are not in the repo yet. Where each emblem appears has not been decided.

## Parked: Codex-App inventory review (owner: "you can tack that on next time")

On 22 Nov Claude read `github.com/Hawksprey420/Codex-App`, a fork of another student's
Firebase Studio app ("Codex", property inventory). Its report PDF is headed "University
Student Government - Tiniguiban Heights", so it was built for the USG; whether it ever held
real USG data is unknown.

- Stack: Next.js 15, Firestore written from the browser, Firebase Auth (anonymous sign-in
  on), Genkit/Gemini. No tests. Nothing ports to Payload/Postgres as code.
- Its Firestore rules let any signed-in account grant itself admin and let any signed-in
  account read every collection; stock changes are read-modify-write in the browser with
  no server check. Do not reuse its rules or data paths.
- Worth reusing as requirements only: item fields (name, quantity, category, location,
  acquisition date or "not available", condition, supplier, cost, warranty, photo), the
  transaction types Borrow / Return / Issue-Use / Adjust / Dispose, the Admin / Inventory
  Officer / Viewer split, and the audit PDF grouped by category and sorted by name.
- If the owner adds inventory to Binturong's scope, the shape is two Payload collections
  (Items, Inventory Transactions) with server-side role access and a hook that writes the
  stock change and its log entry in one database transaction behind a `quantity >= 0`
  check. Not approved; it needs an owner decision after Phase 3.
- Owner action, outside this repo: ask the original author whether the live app held real
  USG data, and report the rules problem to them privately if so.
