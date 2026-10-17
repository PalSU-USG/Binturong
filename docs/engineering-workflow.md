# Engineering workflow

These rules adapt Bintanong's commit, review, contract, and recovery practices to
Binturong. Use the app's actual Payload architecture and verification commands.

## Commits

Use `type(scope): summary`; the scope is optional. Use a lowercase type, a short
subsystem scope, and a plain-English imperative summary naming the actual change.
Aim for 72 characters or fewer and omit the final period. Avoid vague subjects
such as `update files` or claims that exceed what the diff implements.

| Type       | Use for                                                    |
| ---------- | ---------------------------------------------------------- |
| `feat`     | New runtime or product functionality                       |
| `fix`      | Correcting a defect                                        |
| `docs`     | Documentation, plans, decisions, checkpoints, and handoffs |
| `refactor` | Restructuring with unchanged behavior                      |
| `test`     | Tests or test infrastructure                               |
| `perf`     | Performance improvements                                   |
| `build`    | Dependencies, lockfiles, bundling, or build configuration  |
| `ci`       | Continuous integration or delivery automation              |
| `style`    | Formatting with unchanged meaning/behavior                 |
| `chore`    | Other maintenance                                          |

Choose the type from the outcome, not the file extension. A behavior fix and its
regression test belong together under `fix`; adding RLS reference documentation is
`docs`, while implementing an authorization fix is `fix`. A new collection with
working behavior can be `feat`. Use scopes such as `agents`, `access`, `pages`,
`posts`, `media`, or `db` when they identify the affected subsystem.

Examples of the message format, not claims of delivered functionality:

```text
docs(agents): adopt Bintanong engineering practices
fix(access): enforce permissions on user-scoped Local API reads
test(pages): reject anonymous draft reads
refactor(posts): extract shared author projection
```

Add a body when motivation, compatibility, or validation helps a reviewer. Explain
the problem, resulting behavior, and material limitations; include the relevant
check commands/results without copying raw logs. Use `!` or a `BREAKING CHANGE:`
footer only for an actual breaking change and explain its migration path.
Do not add AI attribution or generated-by/co-author trailers for agents; preserve
real authorship and legitimate contributor metadata.

Commit early in small, coherent, verified units when committing is within the
authorized task. Include the tests, fixtures, generated artifacts, and necessary
documentation that make each unit work. Keep unrelated cleanup separate.

Before each commit:

1. Inspect status and diffs; distinguish your work from existing owner changes.
2. Stage explicit paths or hunks. Avoid broad `git add .` or `git add -A`, especially
   with installed skills, private inputs, or generated artifacts in the working tree.
3. Review `git diff --cached` and `git diff --cached --check`. Confirm no secrets,
   private data, unrelated changes, or unintended generated-file churn are included.
4. Run the applicable checks and read every result. Read the final message against
   the staged diff; a `feat` label cannot turn a plan into implemented behavior.

Preserve published history. For authorized history edits, verify fresh remote refs,
identify the exact unpublished range, create a recovery ref, preserve dirty work,
and compare file trees afterward. Commit conventions do not authorize a push,
merge, deployment, or history rewrite.

## Contracts and recovery

- Inventory every producer, consumer, persisted representation, and test affected
  by a contract change. Reuse the existing schema/type definitions and adapters.
  Do not create independently maintained copies of business rules or field sets.
- At external boundaries, reject malformed or unsupported values deliberately.
  Test coercion traps where relevant: numeric strings, booleans as IDs/numbers,
  whitespace, invalid dates, extra fields, missing fields, and unknown versions.
  Preserve unknown/missing separately from explicit zero, false, empty, or none.
- For compatibility work, compare old and new behavior on representative valid and
  invalid inputs. Change expected results only when the requirement or demonstrated
  previous bug justifies it. Re-exported helpers and downstream callers count too.
- Define what a repeated write means. For operations requiring idempotency, an
  exact replay should preserve the result; a conflicting payload must not silently
  overwrite it. Test persisted state, not only response counts or HTTP status.
- A timeout can follow a committed write. Propagate uncertain outcomes and reconcile
  persisted state before retrying; do not add blind retries to non-idempotent work.
  Recheck stale ownership/status under the relevant transaction or lock when needed.
- Exercise rollback with a failure after an earlier write, and verify the original
  state survives. For concurrency fixes, use observable barriers or lock waits;
  elapsed sleeps alone do not establish that a race was exercised.
- Keep implementation changes separate from schema/data deployment. Preserve
  applied migrations, test upgrades against existing records, and record recovery
  steps for data changes. Use Payload's migration authority for its managed tables.

## Review and proof

Review in this order:

1. **Specification:** check every requested behavior and invariant. Identify missing
   work and changes outside scope before polishing implementation details.
2. **Evidence:** reproduce the reported defect or key scenario and run the relevant
   checks. Read actual output, including skips. A reviewer's verification is separate
   from the implementer's report; label self-review honestly when no independent
   review occurred. Delegate only when the task or applicable instructions call for it.
3. **Compatibility:** check callers, generated artifacts, persisted data, exports,
   error handling, and recovery behavior outside the intended change.
4. **Defects:** report file/line, triggering input or command, observed impact, and
   a practical correction. Separate confirmed defects from suspicions and limitations.

A regression must fail when the protected behavior is broken. For a critical guard,
verify a targeted bypass or mutation makes its focused test fail, then restore the
guard. Keep such experiments isolated; they do not require a new testing framework.
Ensure another earlier validation does not mask the guard being tested.

Record the acceptance condition, tested commit/working tree, commands, outcomes,
and untested boundaries. Passing synthetic tests does not establish production-data
accuracy. An advisor report, type check, or build is one kind of evidence, not proof
of every application invariant. New contradictory evidence reopens the affected
claim; retain prior results with their original scope rather than hiding the failure.

## Security boundaries

For affected endpoints or data operations, write a small access matrix: actor,
resource, operation, expected allow/deny, and enforcement boundary. Test through
the actual runtime role/session and API path. A privileged test cannot prove a
restricted user's permissions; a UI-hidden control cannot enforce them.

Inspect effective privileges as well as policy definitions: inherited/default
grants, table/sequence privileges, callable functions, and owner/bypass roles where
applicable. Exercise indirect reads through relationships, search, previews, and
caches. Denied operations must not fall back to administrative credentials.

Before publication or a privileged transition, validate the complete required state
at the enforcing boundary. Afterward, verify public visibility and related data,
including unpublish/delete behavior. Keep migrations reproducible and compare
deployed state with them when deployment is in scope. Apply the existing task's
authorization; successful local verification does not itself deploy a change.

## Reference basis

Inspected the local Bintanong checkout at
`C:/Users/Hawksprey/source/repos/Bintanong`, HEAD `85366d4`, on 17 October 2026.
These are provenance references, not dependencies on that checkout being installed:

| Bintanong evidence                                                             | Practice adapted here                                                             |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `.agents/skills/conventional-commits/SKILL.md` and recent Git subjects         | Message grammar, change types, staged-diff review, and protected history          |
| `.claude/agents/extractor-implementer.md` and `extractor-reviewer.md`          | Test-first scoped work; specification, evidence, compatibility, then defects      |
| `docs/decisions/phase-04-security-review.md` and runtime-privilege migrations  | Effective-role verification; clean advisors can miss application failures         |
| `tests/test_storage_loader_idempotency.py` and `test_storage_concurrency.py`   | Exact replay, conflict rejection, rollback, and observed concurrency barriers     |
| `tests/test_contracts_parity.py` and `docs/decisions/phase-01-traceability.md` | Consumer parity, binding checks, and regression tests that exercise real guards   |
| `AGENTS.md` and phase-handoff artifacts                                        | Compact current state, settled decisions, evidence precedence, and bounded review |

Bintanong's research corpus, Python/model setup, source-approval phases, immutable
knowledge-release model, and historical worker restrictions remain project-specific.
Carry over the failure-prevention practices; use Binturong's own architecture,
dependencies, editing lifecycle, and task authorization.
