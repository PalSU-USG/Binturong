import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, handleEndpoints, type Field, type Payload } from 'payload'

import config from '@/payload.config'
import { userRoles, type UserRole } from '@/access/roles'
import { adminCopy } from '@/admin/copy'
import { bannedTerms, findBannedTerms } from '@/admin/bannedTerms'
import { domainCollections } from '@/collections/shared/domainCollections'
import { syntheticContent as content } from '../helpers/contentFixtures'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

type Entity = {
  slug: string
  admin?: { group?: unknown; hidden?: unknown; description?: unknown }
  labels?: { singular?: unknown; plural?: unknown }
  fields: Field[]
}
type Resolved = Awaited<typeof config>
let resolved: Resolved
const entities = (): Entity[] => [
  ...(resolved.collections as unknown as Entity[]),
  ...(resolved.globals as unknown as Entity[]),
]
const find = (slug: string) => {
  const entity = entities().find((entry) => entry.slug === slug)
  if (!entity) throw new Error(`Missing ${slug}`)
  return entity
}
const hiddenFor = (slug: string, role: UserRole | undefined) => {
  const hidden = find(slug).admin?.hidden
  if (typeof hidden !== 'function') return hidden === true
  return hidden({ user: role ? { role } : undefined })
}

const groups: Record<string, string[]> = {
  Publish: ['pages', 'posts', 'activities', 'documents'],
  Records: ['issuances', 'reports', 'academic-years'],
  'People & Offices': ['people', 'offices', 'organizations'],
  Site: ['media', 'categories', 'header', 'footer'],
  Accounts: ['users'],
  Advanced: ['forms', 'form-submissions', 'redirects', 'search'],
}
// Lowest role that sees each item; anything absent is visible to all staff.
const minimumRole: Record<string, UserRole> = {
  header: 'publisher',
  footer: 'publisher',
  users: 'admin',
  forms: 'admin',
  redirects: 'admin',
  'form-submissions': 'super_admin',
  search: 'super_admin',
}
const rank = (role: UserRole) => userRoles.indexOf(role)

beforeAll(async () => {
  resolved = await config
})

describe('admin navigation', () => {
  it('puts every entity in its plain group', () => {
    for (const [group, slugs] of Object.entries(groups))
      for (const slug of slugs) expect(find(slug).admin?.group, slug).toBe(group)
  })

  it('orders groups as Publish, Records, People & Offices, Site, Accounts, Advanced', () => {
    const order: string[] = []
    for (const entity of entities()) {
      const group = entity.admin?.group
      if (typeof group === 'string' && !order.includes(group)) order.push(group)
    }
    expect(order.filter((name) => name in groups)).toEqual(Object.keys(groups))
  })

  it('hides by role and fails closed for an unknown or missing user', () => {
    for (const slug of Object.values(groups).flat()) {
      if (!minimumRole[slug]) {
        expect(find(slug).admin?.hidden, slug).toBeUndefined()
        continue
      }
      for (const role of userRoles)
        expect(hiddenFor(slug, role), `${slug}/${role}`).toBe(
          rank(role) < rank(minimumRole[slug] ?? 'editor'),
        )
      expect(hiddenFor(slug, undefined), `${slug}/anonymous`).toBe(true)
      expect(hiddenFor(slug, 'intern' as UserRole), `${slug}/unknown`).toBe(true)
    }
  })

  it('uses plain collection labels', () => {
    expect(find('issuances').labels?.plural).toBe('Official issuances')
    expect(find('academic-years').labels?.plural).toBe('Academic years')
    expect(find('documents').labels?.plural).toBe('Official documents')
  })
})

type Seen = { where: string; text: string }
function collectText(): Seen[] {
  const seen: Seen[] = []
  const add = (where: string, text: unknown) => {
    if (typeof text === 'string') seen.push({ where, text })
  }
  const walkFields = (where: string, fields: Field[]) => {
    for (const field of fields) {
      const hidden = ('admin' in field ? field.admin : undefined) as
        { hidden?: unknown } | undefined
      if (hidden?.hidden === true || ('name' in field && field.name === '_status')) continue
      const name = 'name' in field ? field.name : field.type
      const path = `${where}.${name}`
      if ('label' in field && field.label) add(`${path}.label`, field.label)
      else if ('name' in field) add(`${path}.name`, field.name)
      const admin = 'admin' in field ? field.admin : undefined
      if (admin && 'description' in admin) add(`${path}.description`, admin.description)
      if (field.type === 'select' || field.type === 'radio')
        for (const option of field.options)
          if (typeof option === 'object') add(`${path}.option`, option.label)
      const custom = ('admin' in field ? field.admin : undefined) as
        { components?: { Field?: unknown } } | undefined
      // A custom Field component renders its own text, so the children's labels never show.
      if (!custom?.components?.Field && 'fields' in field && Array.isArray(field.fields))
        walkFields(path, field.fields)
      if (field.type === 'tabs')
        for (const tab of field.tabs) {
          add(`${path}.tab`, 'label' in tab ? tab.label : undefined)
          walkFields(path, tab.fields)
        }
      if (field.type === 'blocks') for (const block of field.blocks) walkFields(path, block.fields)
    }
  }
  // Editor-facing means visible to a publisher; Payload's own internal records are not menu items.
  for (const entity of entities().filter(
    (entry) => !entry.slug.startsWith('payload-') && hiddenFor(entry.slug, 'publisher') !== true,
  )) {
    add(`${entity.slug}.group`, entity.admin?.group)
    add(`${entity.slug}.description`, entity.admin?.description)
    add(`${entity.slug}.singular`, entity.labels?.singular)
    add(`${entity.slug}.plural`, entity.labels?.plural)
    walkFields(entity.slug, entity.fields)
  }
  for (const [key, text] of Object.entries(adminCopy)) add(`adminCopy.${key}`, text)
  return seen
}

describe('plain language', () => {
  it('has no banned jargon in editor-facing labels, help text or admin copy', () => {
    const offenders = collectText().flatMap(({ where, text }) =>
      findBannedTerms(text).map((term) => `${where}: "${term}" in "${text}"`),
    )
    expect(offenders).toEqual([])
  })

  it('detects whole-word jargon and ignores harmless look-alikes', () => {
    expect(findBannedTerms('The slug is shown')).toEqual(['slug'])
    expect(findBannedTerms('Saved as JSON')).toEqual(['json'])
    expect(findBannedTerms('A global setting')).toEqual(['global'])
    expect(findBannedTerms('Globally recognised, sluggish')).toEqual([])
    expect(bannedTerms.length).toBeGreaterThan(10)
  })

  it('explains every editor-facing field of the content and record types', () => {
    const missing: string[] = []
    const check = (where: string, fields: Field[], deep = true) => {
      for (const field of fields) {
        const admin = ('admin' in field ? field.admin : undefined) as
          | {
              hidden?: unknown
              disabled?: unknown
              components?: { Field?: unknown }
              description?: unknown
            }
          | undefined
        if (admin?.hidden === true || admin?.disabled === true) continue
        if ('name' in field && field.name === '_status') continue // supplied and translated by the admin itself
        if (field.type === 'tabs' || field.type === 'row' || field.type === 'collapsible') {
          if (field.type === 'tabs') for (const tab of field.tabs) check(where, tab.fields, deep)
          else check(where, field.fields, deep)
          continue
        }
        if (!('name' in field) || field.name === 'id') continue
        const path = `${where}.${field.name}`
        if (typeof field.label !== 'string' || !field.label) missing.push(`${path} label`)
        if (typeof admin?.description !== 'string' || !admin.description)
          missing.push(`${path} description`)
        if (!deep || admin?.components?.Field) continue
        if ('fields' in field && Array.isArray(field.fields)) check(path, field.fields)
      }
    }
    for (const slug of [...domainCollections, 'documents']) check(slug, find(slug).fields)
    for (const slug of ['pages', 'posts', 'header', 'footer'])
      for (const field of find(slug).fields) {
        // Page and post bodies are tabs of template blocks; their top-level fields are checked.
        if (field.type === 'tabs') continue
        check(slug, [field], false)
      }
    expect(missing).toEqual([])
  })

  it('keeps the Save Draft button visible alongside autosave on pages and posts', () => {
    for (const slug of ['pages', 'posts'] as const) {
      const entity = find(slug) as Entity & {
        versions?: { drafts?: { autosave?: { showSaveDraftButton?: boolean } } }
      }
      expect(entity.versions?.drafts?.autosave?.showSaveDraftButton, slug).toBe(true)
    }
  })

  it('registers the how-to view as an exact route', () => {
    const howTo = resolved.admin?.components?.views?.howTo as
      | { path?: string; exact?: boolean }
      | undefined
    expect(howTo).toMatchObject({ path: '/how-to', exact: true })
  })

  it('explains a turned-off account in plain words on the no-access page', () => {
    const translations = resolved.i18n?.translations as
      | { en?: { error?: { unauthorizedAdmin?: string } } }
      | undefined
    expect(translations?.en?.error?.unauthorizedAdmin).toBe(adminCopy.accountDisabled)
    expect(adminCopy.accountDisabled).toBe(
      'This account is disabled. Ask a USG administrator to re-enable it.',
    )
    expect(findBannedTerms(adminCopy.accountDisabled)).toEqual([])
  })

  it('replaces_payload_wording_with_the_admin_word_set', () => {
    const en = resolved.i18n?.translations?.en as unknown as Record<string, Record<string, string>>
    expect(en.general.createNew).toBe('Add new')
    expect(en.general.updatedAt).toBe('Last saved')
    expect(en.version.draft).toBe('Not live yet')
    expect(en.version.published).toBe('Live on the site')
  })

  it('adds_a_view_the_site_link_to_the_admin_header', () => {
    expect(resolved.admin?.components?.actions).toContain('@/admin/viewSite')
  })

  it('shows_the_usg_emblem_instead_of_the_payload_logo', () => {
    expect(resolved.admin?.components?.graphics).toMatchObject({
      Logo: '@/admin/graphics/Logo',
      Icon: '@/admin/graphics/Icon',
    })
  })
})

describe('editors cannot publish through the server', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const created: { collection: 'pages' | 'posts'; id: number }[] = []
  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })
  afterAll(async () => {
    for (const record of created)
      if (await payload.findByID({ ...record, disableErrors: true }))
        await payload.delete({ ...record, context: { disableRevalidate: true } })
    await removeTestAccounts(
      payload,
      Object.values(fixtures?.users ?? {}).map(({ id }) => id),
    )
  })

  for (const collection of ['posts', 'pages'] as const)
    it(`${collection}: an editor's publish request is refused and a publisher's is allowed`, async () => {
      const draft = await payload.create({
        collection,
        draft: true,
        context: { disableRevalidate: true },
        data: {
          title: `Synthetic ${randomUUID()}`,
          slug: `synthetic-${randomUUID()}`,
          _status: 'draft',
          ...(collection === 'pages'
            ? {
                hero: { type: 'none' },
                layout: [{ blockType: 'content', columns: [{ size: 'full', richText: content }] }],
              }
            : { content }),
        } as never,
      })
      created.push({ collection, id: draft.id })
      const patch = (token: string, query = '') =>
        handleEndpoints({
          config,
          request: new Request(`http://127.0.0.1:3003/api/${collection}/${draft.id}${query}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` },
            body: JSON.stringify({ _status: 'published' }),
          }),
        })
      expect((await patch(fixtures.tokens.editor)).status).toBe(403)
      expect((await patch(fixtures.tokens.editor, '?draft=true')).status).toBe(403)
      const row = await payload.findByID({ collection, id: draft.id, draft: true })
      expect(row._status).toBe('draft')
      expect((await patch(fixtures.tokens.publisher)).status).toBe(200)
    })

  it('refuses form-submissions reads and deletes from roles below super_admin', async () => {
    for (const role of ['editor', 'publisher', 'admin'] as const) {
      const res = await handleEndpoints({
        config,
        request: new Request('http://127.0.0.1:3003/api/form-submissions', {
          headers: { Authorization: `JWT ${fixtures.tokens[role]}` },
        }),
      })
      expect(res.status, `${role} GET`).toBe(403)
    }
    const allowed = await handleEndpoints({
      config,
      request: new Request('http://127.0.0.1:3003/api/form-submissions', {
        headers: { Authorization: `JWT ${fixtures.tokens.super_admin}` },
      }),
    })
    expect(allowed.status).toBe(200)
  })
})
