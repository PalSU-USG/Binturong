# Codex handoff, 23 Nov 2026

Codex owns Binturong from here; the owner is using Claude for another project. This note
adds nothing to the plan itself. The plan and its next action are the
[current checkpoint](product-alignment.md#current-checkpoint) (last written by Codex at
`fb32c73`). The earlier [21 Nov handoff](codex-handoff-2026-11-21.md) still holds for the
standing rules (ask before push, deploy, hosted migrations, data deletion and login changes;
tests only on `binturong_test` through the shared lock; PowerShell only; no AI credit).

## State on 23 Nov

- Local `dev` = `fb32c73`, not pushed. GitHub `dev` = `b9d8465`.
- Dirty: `binturong-open-usg/src/payload-types.ts` differs only in line endings
  (`git diff --ignore-cr-at-eol` is empty); restore it rather than commit it. Untracked
  `.claude/`, `.playwright-mcp/` and `tsconfig.tsbuildinfo` are tool output.
- No Binturong code changed since `fb32c73`. No tests were run for this note.

## Next action

Unchanged from the checkpoint: confirm Preview's storage variables and Fluid compute setting
in Vercel (the connector needs reauthentication), then ask the owner to approve the `dev`
push that triggers the Preview build.

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
