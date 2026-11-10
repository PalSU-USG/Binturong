# Record pages and public sections checkpoint

Branch `Hawksprey420/record-sections` (merged from dev `16533fc`). Spec and plan:
`docs/superpowers/specs/2026-11-09-record-sections-design.md`, `docs/superpowers/plans/2026-11-09-record-sections.md`.

Commits: `f02ba8d` queries and file facts, `4a965c9` detail pages and search live, `e0e09bb` archives,
transparency and activities lists, `45f0988` government and activity detail, `5663472` browser tests
and loading removal, then the docs commit. No migration, no schema change, nothing pushed.

Verified (against `binturong_test` on 56323): full integration suite 38 files / 430 tests passed;
`tsc` clean; changed-file eslint clean with zero warnings; full lint at the inherited baseline
(5 errors, 14 warnings); `npm run build` succeeded; production-cache suite 3 passed; browser
suite 48 passed with 1 failure (`domain-transitions` "exact saved internal link targets"), which
passed when run alone.

Next action: coordinator's independent review; then an owner decision on loading states
(see the spec's implementation notes) and Header links for the new sections.
