# Admin usability

Status: Approved by the owner on 9 November 2026 (decisions recorded below). Not yet implemented.

Scope: the Payload admin at `/admin` for non-technical USG staff. Admin UI only: no
schema change, no new endpoint, no change to access, transition or scheduling code.

## Evidence (inspected on `dev` 5b858a2, Payload 3.90.2)

- All 13 collections and 2 globals render in one flat sidebar; none sets `admin.group`,
  and the plugins add forms, submissions, redirects, search and jobs. Labels are derived
  from slugs (`Academic-years`). Technical fields (`normalizedNumber`, `publishedAt`,
  `lastTransition`, upload `state`) are shown to every role.
- `BeforeDashboard` renders nothing, so the dashboard is the stock collection grid.
- The real lifecycle has **no review state**. `versions.drafts` gives `draft` and
  `published`; withdrawal returns a record to draft. "Review" is the publisher-only drawer
  "Review saved revision" in `DomainTransitions`, on domain collections only. Pages and
  Posts use Payload's stock Publish button, which an editor sees although access refuses it.
- Editors save drafts; publishers and above publish, withdraw, restore and schedule
  (`editContent`, `publishContent`). Only the server enforces this.
- No creator field exists on content (domain records have none; versions carry no author),
  so "My drafts" cannot be answered truthfully without a schema change.
- 3.90 supports `admin.dashboard.widgets` with a per-request `defaultLayout`, collection
  and global `admin.group`, `admin.hidden({ user })`, `labels`, `admin.description`,
  `components.beforeDocumentControls`, and CSS variables through `custom.scss`
  (confirmed in the installed `payload` type declarations).

## Invariants (must not change)

1. Hiding is presentation. Hidden collections, fields and buttons keep exactly today's
   server access. Tests assert direct API denial, not merely absence from the page.
2. No new authority path. The UI calls the existing review, publish, withdraw, restore and
   schedule endpoints and server functions unchanged; every publisher-only control is also
   refused server-side for editors.
3. Dashboard queries use `overrideAccess: false` with the request user, never privileged
   Local API. A failed query shows an error state, never an empty "nothing here" list.
4. Field `name`s, types and nesting are untouched. Only `label`, `description`, `position`,
   `condition`/`hidden`, `collapsible`, `group`, `defaultColumns` and ordering change.
   Audit fields stay server-owned (`retainDomainAudit`).
5. Published-only public reads, preview authentication and revalidation are not touched.

## 1. Role-aware information architecture

Plain nav groups, in this order (config order sets group order):

| Group            | Contents                                    | Visible to                      |
| ---------------- | ------------------------------------------- | ------------------------------- |
| Publish          | Pages, Posts, Activities, Official documents | all staff                       |
| Records          | Issuances, Reports, Academic years          | all staff                       |
| People & Offices | People, Offices, Organizations              | all staff                       |
| Site             | Media, Categories, Header, Footer           | Header and Footer: publisher+   |
| Accounts         | Users                                       | admin+                          |
| Advanced         | Forms, Submissions, Redirects, Search, Folders | Redirects, Forms: admin+; rest super_admin |

Collections get plain `labels` ("Official issuances", "Academic years"). Hiding uses
`admin.hidden({ user })` computed from `hasRole`, failing closed for an unknown user.
Plugin collections are regrouped through each plugin's `overrides.admin`. Whether Payload
also refuses a hidden collection's URL is verified in Task 1; it is irrelevant to
security (invariant 1). The `navigation` branch changes the public Header content, not
admin navigation, so there is no overlap.

## 2. Dashboard per role

Replace the stock grid with widgets (`admin.dashboard`), layout chosen per request role:

- **Start here** (all): "Post an update" (`/posts/create`), "Upload a document", "Add a
  person or office". A button renders only if the user's permissions allow create.
- **Drafts** (all): five most recently edited records with unpublished work across Pages,
  Posts and the domain collections. v1 is *Drafts*, not *My drafts* (decision 2).
- **Waiting for a publisher** (publisher+): the same query oldest-first with "Open and
  review" links. Absent for editors.
- **Recently published or withdrawn** (all): from `publishedAt` and `lastTransition`;
  shows action and time, not actor (user reads are access-limited).
- **Scheduled changes** (publisher+, optional): reuses the existing upcoming-schedule call.

Queries: one `find` per collection, `limit: 5`, `depth: 0`, `select` of title, status and
dates, run with `Promise.all`, merged in the widget. About nine small reads per load;
measure on representative data before adding more.

## 3. Form simplification

- Order fields as an editor thinks: title, summary, body, dates, relationships; technical
  last. Move `publishedAt`, `lastTransition`, SEO and slug into a collapsed "History and
  advanced" section, names unchanged.
- Hide `normalizedNumber`; show Documents `state` as "Upload status" (Ready, Checking, Failed).
- Plain label and one-sentence `description` on every editor-facing field: what it is
  and where readers see it. Slugs stay auto-generated, read-only for editors.
- Dates default empty (never guessed). Required-field messages keep Payload's text.
- Documents list: `defaultColumns` of title, status, updated; upload button stays on top.

## 4. Status panel and publish flow

A `beforeDocumentControls` panel (shared with `DomainTransitions`, added to Pages and Posts)
says in plain words: "Draft: only staff can see it", "Published: public since <date>",
"Withdrawn: was public, now hidden" (when `lastTransition.action` is `withdraw`; Pages and
Posts record no transition, so they show Draft), or "Saved changes not yet published". A
three-step line follows: 1 save a draft (anyone), 2 a publisher reviews the saved
revision, 3 the publisher publishes or schedules. One sentence addresses the current role
("You can save drafts. Ask a publisher to publish.").
Editors see no Publish, Unpublish or Schedule controls on Pages and Posts (role-aware
replacement of the stock button); the server still refuses them. Domain collections keep
`NativeTransitionButton` and its review drawer with simpler copy and unchanged behavior.
There is no "Submit for review" action: a saved draft is waiting (decision 1).

## 5. Visual refresh

`custom.scss` overrides Payload CSS variables (`--theme-*`, `--font-body`, `--base`, radius,
focus ring): calmer neutrals, 16px base text, stronger focus, clear active-nav state,
consistent spacing. Light and dark stay. It uses the placeholder identity from
`docs/design.md`: the text "Binturong" only; no logo, seal or colours are invented.
Admin branding stays out of `identity-home`. Labels are English (decision 3).

## 6. Accessibility

Keyboard-only completion of sign in, create draft, open review drawer and publish. Visible
focus and semantic headings and lists in custom widgets. Status never conveyed by colour
alone. WCAG AA contrast on overridden variables (checked with the contrast checker).
Usable at 200% zoom and 360px width with no horizontal scroll; drawer focus return preserved.

## Non-goals

No separate admin app; no new roles or states; no relaxation of access, review or audit;
no real brand assets; no schema or migration; no change to public pages, search or storage.

## Owner decisions (9 November 2026)

1. Stay on Payload's admin and reshape it; no separate admin app (template research:
   a separate admin would rebuild publishing, versions, Lexical and resumable upload).
2. English labels and help text now; Filipino later via translation overrides.
3. Add a server-set `lastEditedBy` relationship (to `users`) on editorial collections
   now, so the dashboard shows a true "My drafts". It is set only in a `beforeChange`
   hook from the authenticated `req.user`, read-only in the admin, never accepted from
   client input, and excluded from public output. This adds one additive Payload
   migration (backfill: null; old rows show under "Drafts", not "My drafts").
4. Editors see only "Save draft" on Pages/Posts with the line "A publisher will review
   and publish this."; server authority rules are unchanged.
5. Nav groups Publish, Records, People & Offices, Site, Accounts, Advanced; Redirects and
   Forms for admin and above; Search index and Folders for super_admin only; dark mode
   kept; no "ready for review" flag in v1.
6. Merge order: this slice merges last (after navigation, identity/homepage and record
   pages) and regenerates its migration on the final schema.

## Original options considered

1. **Ready-for-review flag.** Recommend no for v1: every saved draft counts as waiting.
   Revisit if publishers are flooded (needs a field and migration).
2. **"My drafts".** Recommend showing *Drafts* for all staff now; add a server-set
   `lastEditedBy` later only if wanted (migration, hook, privacy review).
3. **Language.** Recommend English now; labels live in config, so Filipino can follow.
4. **Redirects and Forms visibility.** Recommend admin+; Search and Folders super_admin only.
5. **Group names.** Recommend Publish, Records, People & Offices, Site, Accounts, Advanced.
6. **Editors on Pages and Posts.** Recommend hiding Publish and Schedule with an explanatory
   line, not disabled buttons.
7. **Dark mode.** Recommend keeping both; do not lock `theme`.
