# Engineering guidance

## Scope and sources of truth

This workspace contains `binturong-open-usg/`, a Payload CMS website built with
Next.js, React, TypeScript, and PostgreSQL. Read its [app instructions](binturong-open-usg/AGENTS.md)
before changing the app. The current implementation still contains Payload template
content; establish the requested product behavior before treating that content as a requirement.

Use the user's requirements, relevant project documentation, executable configuration,
schemas, and tests to establish intent and actual behavior. Report disagreements explicitly.
The app README contains inherited template instructions that can disagree with the code.
Treat current Git state and fresh verification as evidence of implementation; plans and
handoffs describe intent and recorded state. Resolve discrepancies before claiming completion.

## Working method

1. Inspect the working tree and applicable instructions. Preserve existing user changes
   and untracked files; distinguish them from your own edits.
2. Trace the affected code and its callers before editing. Identify changes needed in
   tests, fixtures, generated artifacts, configuration, and exports.
3. State material assumptions, affected trust boundaries, and invariants. For critical
   writes, decide how duplicates, retries, concurrent requests, and partial failures behave.
4. Implement the smallest coherent change using existing components and services.
   Keep exploratory prototypes separate from established implementations and data.
5. For non-trivial behavior changes, write a focused regression and observe its expected
   failure before implementing the smallest correction. Verify the fix and related
   regressions. For bugs, reproduce and isolate the cause at the shared responsible layer.
6. Run checks appropriate to the change. Report what passed, what could not be checked,
   and remaining risks; distinguish observed results from assumptions.

Prioritize correctness, security, data integrity, and recovery. Validate external input
at the server boundary. Keep authorization out of client-controlled fields and UI-only
restrictions. Use transactions and constraints where they protect required invariants.
Preserve error handling; surface failures rather than treating an empty result as success.

## Continuity and decisions

For work spanning sessions, read the current task plan/checkpoint and inspect Git before
resuming. Follow its next action; repeat completed work only when new evidence invalidates
the recorded result. Open historical reports only for a specific dependency or unresolved
question. A new session is not a reason to repeat setup, installs, or settled reviews.

Keep durable task state in the repository. Reuse existing task documents; if sustained
work needs a checkpoint and none exists, use one task note under `plans/`. Record the goal,
relevant commit/dirty files, latest verified result, decisions, blockers, and one exact next
action. Update after material work and before a handoff. Keep it a compact current snapshot;
link detailed evidence instead of copying the same update into multiple files. A small
completed edit needs no phase scaffold. Do not introduce Bintanong's numbered-phase tooling
or project-specific exit gates unless Binturong establishes that workflow.

Preserve settled user decisions with their scope and rationale. Reopen them only for a
new contradiction or changed requirement. If content meaning requires human judgment,
show the exact source region or record, the ambiguity, and a proposed treatment in a small
batch. Record the actual answer and continue independent authorized work while waiting.
Routine technical fixes do not require another content approval.

Give diagnostics a concrete question and stopping condition. After repeated equivalent
failures, inspect new evidence or change approach. Escalate only the unresolved decision;
a local blocker should not stop unrelated work that can safely proceed.

## Content integrity and verification

For imported or source-backed CMS content, preserve originals and derive corrections
separately. Verify against original inputs and a designated reference; generated output
cannot validate itself. Distinguish extraction defects from missing or contradictory
original content. Preserve the affected source/version/field and limitation. Blank or
unknown values do not establish zero, absence of a requirement, or completion.

Parsing and schema validation establish structure, not content accuracy. Request focused
review for consequential ambiguous fields; a decision about one field does not approve a
whole document or publish it. Keep draft, reviewed, and published states distinct.

Use synthetic or anonymized fixtures in tracked tests. Keep private uploads, production
exports, secrets, and raw sensitive execution evidence outside tracked artifacts. For
critical workflows, exercise denied access, invalid input, duplicate/concurrent writes,
retries, and partial failure where applicable. Record exact commands and results with
their scope; distinguish synthetic checks from validation against real inputs.

Preserve the dependency and lockfile baseline unless the task requires a change; inspect
installed versions and existing assets before installing or downloading replacements.
Handoffs must identify uncommitted work and failed or skipped checks; a checkpoint or
passing smoke test alone is not completion.

## Commit, review, and contract workflows

Before creating, amending, or rewording any commit, apply the
[commit rules](docs/engineering-workflow.md#commits), including documentation and handoff
commits. Use the actual staged change to choose its type, scope, and imperative summary.

Before changing API/schema contracts, persistence, or authorization, read
[contracts and recovery](docs/engineering-workflow.md#contracts-and-recovery).
For meaningful implementation changes and code reviews, apply the
[review sequence](docs/engineering-workflow.md#review-and-proof). Read its
[security checks](docs/engineering-workflow.md#security-boundaries) when access or publication
behavior changes. These practices are adapted to Binturong from inspected Bintanong code
and workflow records; their source map is in the guide.

## Skills and references

Read only the references needed for the task; examples must be adapted to this app's
actual identity model, database roles, and connection behavior.

| Task                                                                      | Read before implementation                                                                                                                                       |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payload collections, hooks, access, API, or admin                         | [Payload skill](binturong-open-usg/.agents/skills/payload/SKILL.md) and its relevant `reference/` file                                                           |
| PostgreSQL schema, migrations, SQL, indexes, RLS, or database performance | [Postgres skill](.agents/skills/supabase-postgres-best-practices/SKILL.md)                                                                                       |
| Supabase services, clients, CLI, or MCP                                   | [Supabase skill](.agents/skills/supabase/SKILL.md); verify current documentation and relevant changelog entries                                                  |
| Database tenant isolation or RLS policy changes                           | [RLS basics](.agents/skills/supabase-postgres-best-practices/references/security-rls-basics.md)                                                                  |
| RLS query performance                                                     | [RLS performance](.agents/skills/supabase-postgres-best-practices/references/security-rls-performance.md)                                                        |
| Reported incorrect Supabase skill guidance                                | [Skill feedback procedure](.agents/skills/supabase/references/skill-feedback.md) and [issue template](.agents/skills/supabase/assets/feedback-issue-template.md) |

Reading a feedback procedure does not authorize posting an issue or sending a message.
Keep third-party skill sources intact unless the task explicitly concerns those files.

## Database and RLS boundaries

Payload owns the current app's schema through its PostgreSQL adapter. Use its migration
workflow for Payload-managed tables. Inspect any future Supabase schema workflow before
choosing a migration tool; keep each table under one migration authority.

For Supabase Data API exposure, enable RLS and review grants together. Model ownership
or tenant membership from trusted server-controlled data. Test reads and writes as the
actual application roles, including denied access and attempts to change ownership.
Superuser or service-role success is not proof that an RLS policy works.

Payload sessions do not automatically supply Supabase JWT claims or `auth.uid()` to
direct PostgreSQL connections. Establish identity propagation before adding policies.
Table owners normally bypass RLS; superusers and `BYPASSRLS` roles bypass it even with
`FORCE ROW LEVEL SECURITY`. Check the role used by the adapter before claiming isolation.
See the [PostgreSQL RLS rules](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
and [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security).

Optimize only after validating access behavior. Inspect plans under representative roles
and data, index relevant predicates, and compare measured results. Use `(select auth.uid())`
only where Supabase identity exists and the expression is independent of the current row.
Treat `SECURITY DEFINER` as a privilege boundary requiring explicit review, not a routine
performance fix.
