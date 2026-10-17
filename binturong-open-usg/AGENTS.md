# App engineering guidance

Apply the [workspace instructions](../AGENTS.md) together with these app-specific rules.
Paths below are relative to `binturong-open-usg/`. Start Payload work with
[the Payload skill](.agents/skills/payload/SKILL.md), then read the relevant reference.

## Architecture and conventions

- `src/payload.config.ts` registers collections, globals, plugins, authentication,
  generated types, and the PostgreSQL adapter. It is the configuration entry point.
- `src/app/(frontend)/` contains public pages, preview routes, and the seed endpoint.
  `src/app/(payload)/` contains Payload admin and REST/GraphQL integration.
- `src/collections/`, `src/access/`, and collection-local `hooks/` own content schemas,
  authorization, and lifecycle behavior. `src/Header/` and `src/Footer/` define globals.
- `src/blocks/` pairs CMS block configuration with rendering. Check `RenderBlocks.tsx`,
  rich-text rendering, and generated types when adding or changing a block.
- Reuse `src/components/`, `src/components/ui/`, `src/fields/`, `src/utilities/`, and
  existing providers. Keep server components as the default; add client boundaries
  where interaction requires them. Follow existing `@/` and `@payload-config` aliases.
- Follow the existing TypeScript and Prettier configuration. Define schema changes in
  collection, field, global, or plugin configuration, then regenerate derived artifacts.

Treat collection/field names, block slugs, relationship targets, and API response shapes
as persisted or external contracts. Trace stored documents, renderers, plugins, queries,
generated types, and fixtures before changing them. Preserve compatibility or provide an
explicit migration; a successful type check does not validate existing database content.

## Access and publishing invariants

The current `users` collection authenticates CMS users; there is no role or tenant field.
The shared `authenticated` helper checks login only. Treat a requirement for finer access
as a schema and server authorization change, not as an existing admin-role distinction.

- Anonymous page and post reads must remain limited to published content. Preserve
  preview authentication and the separation between public and draft queries.
- Payload Local API calls bypass access checks by default. For public or user-scoped
  operations, pass `overrideAccess: false` and the appropriate authenticated request/user.
  Privileged internal calls need a specific reason and a restricted output shape.
- Preserve author privacy: `populateAuthors` exposes selected author fields through
  `populatedAuthors`; it is not permission to expose full user records or emails.
- Pass `req` through nested hook writes so related changes share the transaction.
  Guard recursive hooks with context flags, following the existing hook patterns.
- Preserve publish, unpublish, delete, search-sync, redirect, and sitemap revalidation
  behavior when changing content workflows. Review both old and new URLs for slug changes.
- Keep database credentials, Payload/preview/cron secrets, and privileged API keys on
  the server. Review custom endpoints independently of admin UI visibility.
- Test public relationships, populated fields, search results, preview routes, and cached
  output for private or unpublished data. Permission failures must propagate; never retry
  a denied user operation with privileged Local API access or administrative credentials.

For access changes, test anonymous and authenticated requests through the affected API
boundary. Include unpublished content, manipulated IDs, and denied writes. A Local API
test using its default privileged access cannot establish authorization correctness.

## Schema and generated files

After schema changes, run `npm run generate:types` and review `src/payload-types.ts`.
After changing admin component registrations, run `npm run generate:importmap` and review
`src/app/(payload)/admin/importMap.js`. Regenerate these files from source configuration
instead of hand-editing them; preserve unrelated pre-existing changes.

Use the installed Payload migration commands (`npm run payload -- --help`) to discover
the supported workflow. Review generated SQL for data loss and test migrations against a
disposable database before applying them to shared data. Development schema push is
not a production migration strategy; disable it when connecting development to shared data.

Keep applied migration history intact and make subsequent schema corrections in new
migrations. Test both a fresh database and the upgrade path for affected existing records.
Preserve Payload's normal content editing/versioning model; Bintanong's immutable knowledge
releases are not a reason to freeze this CMS's published documents.

## Commands and environment traps

Run commands from this app directory. Inspect `package.json` for the current scripts.
The tracked lockfile is `package-lock.json`; use npm for dependency changes unless the
task explicitly migrates package managers. The scripts and Docker/Playwright setup still
include pnpm assumptions. Check that mismatch before installing or invoking those paths;
keep the existing lockfile rather than creating a competing one.

`src/payload.config.ts` uses PostgreSQL, while `.env.example` defaults to a MongoDB URL.
Use a PostgreSQL `DATABASE_URL` for this adapter. Check the target without printing its
credentials. Template README and container instructions require verification against the
active configuration before use.

| Check            | Command                    | When needed                                            |
| ---------------- | -------------------------- | ------------------------------------------------------ |
| Lint             | `npm run lint`             | Changed application code                               |
| Type check       | `npm exec -- tsc --noEmit` | TypeScript or schema changes                           |
| Integration      | `npm run test:int`         | API, schema, hooks, or persistence behavior            |
| Browser          | `npm run test:e2e`         | Public pages, admin, preview, or interactive workflows |
| Production build | `npm run build`            | Routing, rendering, config, or build behavior          |

Vitest uses `tests/int/**/*.int.spec.ts` and loads `.env`. Playwright uses `tests/e2e/`,
loads `.env`, and starts `pnpm dev` on port 3000 with server reuse enabled. Confirm both
the database and any reused server target a disposable test environment. Do not assume
`test.env` is loaded automatically. Admin helpers create/delete test users; the seed
endpoint clears collections and globals. Never run them against valuable data.

The current tests are template smoke tests, not evidence of role isolation, RLS, retry
safety, or production readiness. Add focused regression cases for changed behavior and
exercise relevant denied access, duplicate, concurrent, and failure paths. Documentation-only
changes need link, command, and diff review rather than database or browser execution.

For an access regression, use synthetic users/content and assert both the allowed result
and the denied result through the affected route or Local API with access enforcement.
For publish/cache changes, verify the public result after publishing, unpublishing, and
deleting; a successful admin write alone does not prove the public page is current.

Finish with the behavior changed, verification results, and any untested risk. Report
pre-existing failures separately from regressions introduced by the change.
