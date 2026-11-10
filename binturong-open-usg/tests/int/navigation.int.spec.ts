import { randomUUID } from 'node:crypto'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, handleEndpoints, type Payload } from 'payload'
import { GRAPHQL_POST } from '@payloadcms/next/routes'

import config from '@/payload.config'
import { Header as HeaderConfig } from '@/Header/config'
import { Footer as FooterConfig } from '@/Footer/config'
import { resolveLink, resolveNavigation } from '@/Header/resolveNavigation'
import { safeUrl } from '@/utilities/safeUrl'
import { CMSLink } from '@/components/Link'
import type { Header, Post } from '@/payload-types'
import { userRoles, type UserRole } from '@/access/roles'
import { withAccountProvisioning } from '@/collections/Users/accountProvisioning'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'
import { syntheticContent } from '../helpers/contentFixtures'
import { createLocalReq } from 'payload'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

const context = { disableRevalidate: true }
const custom = (label: string, url: string, extra: object = {}) => ({
  link: { type: 'custom' as const, label, url, ...extra },
})
const sections = [
  'home',
  'updates',
  'services',
  'government',
  'transparency',
  'archives',
  'contact',
] as const

describe('safe URL contract', () => {
  it.each([
    ['/government', '/government'],
    ['/a/b?x=1#y', '/a/b?x=1#y'],
    ['https://example.invalid/x', 'https://example.invalid/x'],
    ['http://example.invalid', 'http://example.invalid'],
    ['mailto:a@example.invalid', 'mailto:a@example.invalid'],
    ['tel:+630000000', 'tel:+630000000'],
    ['  /padded  ', '/padded'],
  ])('accepts %s', (input, output) => expect(safeUrl(input)).toBe(output))

  it.each([
    'javascript:alert(1)',
    ' JaVaScRiPt:alert(1)',
    'data:text/html,x',
    '//evil.example',
    '/\\evil.example',
    '/ok\nnewline',
    'relative/path',
    '#',
    '',
    '   ',
    'ftp://example.invalid',
    'vbscript:x',
  ])('rejects %j', (input) => expect(safeUrl(input)).toBeNull())

  it('rejects_non_strings', () => {
    for (const value of [null, undefined, 4, {}, []]) expect(safeUrl(value)).toBeNull()
  })
})

describe('link resolution selects one branch and never leaks', () => {
  const published = {
    id: 3,
    slug: 'visible',
    title: 'Draft title must not appear',
    _status: 'published',
  }
  it('resolves_published_references_with_collection_prefix', () => {
    expect(
      resolveLink({
        type: 'reference',
        label: 'Authored',
        reference: { relationTo: 'posts', value: published as never },
      }),
    ).toMatchObject({ href: '/posts/visible', label: 'Authored' })
    expect(
      resolveLink({
        type: 'reference',
        label: 'Page',
        reference: { relationTo: 'pages', value: { ...published, slug: 'about' } as never },
      })?.href,
    ).toBe('/about')
  })
  it.each([
    ['unpopulated id', { relationTo: 'posts', value: 3 }],
    ['draft document', { relationTo: 'posts', value: { ...published, _status: 'draft' } }],
    ['no slug', { relationTo: 'posts', value: { id: 3, _status: 'published' } }],
    ['missing', null],
  ])('omits_%s_without_falling_back_to_a_stale_url', (_name, reference) => {
    expect(
      resolveLink({
        type: 'reference',
        label: 'Stale',
        url: '/stale-custom-url',
        reference: reference as never,
      }),
    ).toBeNull()
  })
  it('ignores_the_reference_for_custom_links_and_never_uses_its_title', () => {
    const resolved = resolveLink({
      type: 'custom',
      label: 'Custom',
      url: '/custom',
      reference: { relationTo: 'posts', value: published as never },
    })
    expect(resolved).toEqual({ href: '/custom', label: 'Custom', newTab: false })
  })
  it('omits_blank_labels_and_unsafe_urls_but_reports_unavailable_in_review', () => {
    for (const link of [
      { type: 'custom' as const, label: '   ', url: '/x' },
      { type: 'custom' as const, label: 'Bad', url: 'javascript:alert(1)' },
      { type: 'custom' as const, label: 'Bad', url: '//evil.example' },
    ])
      expect(resolveLink(link)).toBeNull()
  })
  it('preserves_new_tab', () => {
    expect(
      resolveLink({ type: 'custom', label: 'x', url: 'https://example.invalid', newTab: true })
        ?.newTab,
    ).toBe(true)
  })
})

describe('navigation tree', () => {
  const header = (navItems: NonNullable<Header['navItems']>): Header =>
    ({ id: 1, navItems, updatedAt: '', createdAt: '' }) as Header
  it('keeps_ids_order_and_sections_and_filters_children', () => {
    const tree = resolveNavigation(
      header([
        { id: 'a', section: 'home', link: { type: 'custom', label: 'Home', url: '/' } },
        {
          id: 'b',
          section: 'government',
          link: { type: 'custom', label: 'Government', url: '/government' },
          children: [
            { id: 'c1', link: { type: 'custom', label: 'Offices', url: '/offices' } },
            { id: 'c2', link: { type: 'custom', label: 'Bad', url: 'javascript:x' } },
          ],
        },
        { id: 'z', link: { type: 'custom', label: 'Legacy', url: 'https://example.invalid' } },
      ]),
    )
    expect(tree.map(({ id, section, href }) => [id, section ?? null, href])).toEqual([
      ['a', 'home', '/'],
      ['b', 'government', '/government'],
      ['z', null, 'https://example.invalid'],
    ])
    expect(tree[1].children.map(({ id }) => id)).toEqual(['c1'])
    expect(tree[0].children).toEqual([])
  })
  it('omits_an_unavailable_group_live_and_marks_it_in_review', () => {
    const data = header([
      {
        id: 'g',
        section: 'archives',
        link: {
          type: 'reference',
          label: 'Archives',
          reference: { relationTo: 'posts', value: 9 },
        },
        children: [{ id: 'k', link: { type: 'custom', label: 'Executive', url: '/executive' } }],
      },
    ])
    expect(resolveNavigation(data)).toEqual([])
    const review = resolveNavigation(data, { review: true })
    expect(review).toHaveLength(1)
    expect(review[0]).toMatchObject({ id: 'g', label: 'Archives', available: false, href: null })
  })
  it('handles_empty_and_missing_data', () => {
    expect(resolveNavigation(null)).toEqual([])
    expect(resolveNavigation(header([]))).toEqual([])
    expect(resolveNavigation({} as Header)).toEqual([])
  })
})

describe('CMSLink callers stay compatible', () => {
  const html = (props: React.ComponentProps<typeof CMSLink>) =>
    renderToStaticMarkup(React.createElement(CMSLink, props))
  it('renders_inline_default_outline_and_new_tab_links_as_before', () => {
    expect(html({ type: 'custom', url: '/x', label: 'Inline' })).toBe(
      '<a class="" href="/x">Inline</a>',
    )
    expect(
      html({ type: 'custom', url: '/x', label: 'Btn', appearance: 'default', size: 'lg' }),
    ).toContain('href="/x"')
    expect(html({ type: 'custom', url: '/x', label: 'Out', appearance: 'outline' })).toContain(
      '>Out</a>',
    )
    const tab = html({ type: 'custom', url: 'https://example.invalid', label: 'T', newTab: true })
    expect(tab).toContain('target="_blank"')
    expect(tab).toContain('rel="noopener noreferrer"')
    expect(
      html({
        type: 'reference',
        label: 'Ref',
        reference: { relationTo: 'posts', value: { id: 1, slug: 's' } as Post },
      }),
    ).toContain('href="/posts/s"')
  })
  it('renders_nothing_for_unsafe_or_stale_links', () => {
    expect(html({ type: 'custom', url: 'javascript:alert(1)', label: 'x' })).toBe('')
    expect(
      html({
        type: 'reference',
        url: '/stale',
        label: 'x',
        reference: { relationTo: 'posts', value: 4 },
      }),
    ).toBe('')
  })
})

describe('Header and Footer globals', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  let originalHeader: Header['navItems']
  const posts: number[] = []
  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
    originalHeader = (await payload.findGlobal({ slug: 'header', depth: 0 })).navItems
  })
  afterAll(async () => {
    for (const id of posts) await payload.delete({ collection: 'posts', id, context })
    await payload.updateGlobal({
      slug: 'header',
      data: { navItems: originalHeader ?? [] },
      context,
    })
    await removeTestAccounts(
      payload,
      Object.values(fixtures?.users ?? {}).map(({ id }) => id),
    )
  })
  const actor = (role: UserRole) => ({ ...fixtures.users[role], collection: 'users' as const })
  const update = (navItems: unknown[], role: UserRole = 'publisher') =>
    payload.updateGlobal({
      slug: 'header',
      data: { navItems } as never,
      user: actor(role),
      overrideAccess: false,
      context,
    })
  async function post(status: 'published' | 'draft') {
    const doc = await payload.create({
      collection: 'posts',
      data: {
        title: `Synthetic nav ${randomUUID()}`,
        slug: `synthetic-nav-${randomUUID()}`,
        content: syntheticContent,
        _status: status,
      },
      draft: status === 'draft',
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    posts.push(doc.id)
    return doc
  }

  it('declares_seven_rows_one_child_level_and_unique_optional_sections', () => {
    const navItems = HeaderConfig.fields.find(
      (f) => 'name' in f && f.name === 'navItems',
    ) as never as {
      maxRows: number
      fields: {
        name?: string
        type: string
        options?: { value: string }[]
        fields?: { name?: string }[]
      }[]
    }
    expect(navItems.maxRows).toBe(7)
    const section = navItems.fields.find((f) => f.name === 'section')!
    expect(section.options?.map(({ value }) => value)).toEqual([...sections])
    const children = navItems.fields.find((f) => f.name === 'children')!
    expect(children.type).toBe('array')
    expect(children.fields!.map((f) => f.name).filter((n) => n !== 'id')).toEqual(['link'])
    const footer = FooterConfig.fields.find(
      (f) => 'name' in f && f.name === 'navItems',
    ) as never as {
      maxRows: number
      fields: { name?: string }[]
    }
    expect(footer.maxRows).toBe(6)
    expect(footer.fields.map((f) => f.name).filter((n) => n !== 'id')).toEqual(['link'])
  })

  it('round_trips_seven_parents_children_and_keeps_legacy_leaf_ids', async () => {
    const legacy = await update([
      custom('Legacy A', '/legacy-a'),
      custom('Legacy B', 'https://example.invalid', { newTab: true }),
    ])
    const legacyIds = legacy.navItems!.map(({ id }) => id)
    const target = await post('published')
    const rows = [
      ...legacy.navItems!.map(({ id, link }) => ({ id, link })),
      ...sections.slice(2).map((section) => ({
        section,
        ...custom(section, `/${section}`),
        children: [custom(`${section} child`, `/${section}/child`)],
      })),
    ]
    rows[2] = {
      ...rows[2],
      link: {
        type: 'reference',
        label: 'Ref',
        reference: { relationTo: 'posts', value: target.id },
      },
    } as never
    const saved = await update(rows)
    expect(saved.navItems).toHaveLength(7)
    expect(saved.navItems!.slice(0, 2).map(({ id }) => id)).toEqual(legacyIds)
    expect(saved.navItems![0].section ?? null).toBeNull()
    expect(saved.navItems![1].link).toMatchObject({ newTab: true, url: 'https://example.invalid' })
    expect(saved.navItems![3].children).toHaveLength(1)
    expect(saved.navItems![3].children![0].id).toBeTruthy()
    const reread = await payload.findGlobal({
      slug: 'header',
      depth: 1,
      overrideAccess: false,
      draft: false,
    })
    expect(reread.navItems!.map(({ id }) => id)).toEqual(saved.navItems!.map(({ id }) => id))
    const tree = resolveNavigation(reread)
    expect(tree.map(({ href }) => href)).toContain(`/posts/${target.slug}`)
  })

  it.each([
    [
      'duplicate sections',
      () => [
        { section: 'home', ...custom('A', '/a') },
        { section: 'home', ...custom('B', '/b') },
      ],
    ],
    ['eight rows', () => Array.from({ length: 8 }, (_, i) => custom(`r${i}`, `/r${i}`))],
    ['blank label', () => [custom('   ', '/blank')]],
    ['script URL', () => [custom('Unsafe', 'javascript:alert(1)')]],
    ['data URL', () => [custom('Unsafe', 'data:text/html,x')]],
    ['protocol-relative URL', () => [custom('Unsafe', '//evil.example')]],
    ['bare relative URL', () => [custom('Unsafe', 'relative')]],
    [
      'unsafe child URL',
      () => [{ ...custom('Parent', '/p'), children: [custom('Child', 'javascript:x')] }],
    ],
    ['blank child label', () => [{ ...custom('Parent', '/p'), children: [custom(' ', '/c')] }]],
  ])('rejects_%s', async (_name, rows) => {
    await expect(update(rows())).rejects.toMatchObject({ status: 400 })
  })
  it('does_not_surface_withdrawn_unpopulated_or_draft_targets', async () => {
    const live = await post('published')
    const withdrawn = await post('published')
    const never = await post('draft')
    const link = (doc: { id: number }, label: string) => ({
      link: {
        type: 'reference',
        label,
        url: '/stale-url',
        reference: { relationTo: 'posts', value: doc.id },
      },
    })
    await update([link(live, 'Live'), link(withdrawn, 'Withdrawn'), link(never, 'Never')])
    await payload.update({
      collection: 'posts',
      id: withdrawn.id,
      data: { _status: 'draft' },
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    const reread = await payload.findGlobal({
      slug: 'header',
      depth: 1,
      overrideAccess: false,
      draft: false,
    })
    const labels = resolveNavigation(reread).map(({ label }) => label)
    expect(labels).toEqual(['Live'])
    expect(JSON.stringify(resolveNavigation(reread))).not.toContain('stale-url')
    for (const depth of [0, 2]) {
      const other = await payload.findGlobal({
        slug: 'header',
        depth,
        overrideAccess: false,
        draft: false,
      })
      expect(resolveNavigation(other).map(({ label }) => label)).toEqual(
        depth === 0 ? [] : ['Live'],
      )
    }
  })

  const row = [custom('Access probe', '/access-probe')]
  const rest = (role?: UserRole) =>
    handleEndpoints({
      config,
      request: new Request('http://127.0.0.1:3003/api/globals/header', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(role ? { Authorization: `JWT ${fixtures.tokens[role]}` } : {}),
        },
        body: JSON.stringify({ navItems: row }),
      }),
    })
  const graphql = (role?: UserRole) =>
    GRAPHQL_POST(config)(
      new Request('http://127.0.0.1:3003/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(role ? { Authorization: `JWT ${fixtures.tokens[role]}` } : {}),
        },
        body: JSON.stringify({
          query: `mutation { updateHeader(data: { navItems: [{ link: { type: "custom", label: "Access probe", url: "/access-probe" } }] }) { navItems { id } } }`,
        }),
      }),
    )
  async function currentLabels() {
    const header = await payload.findGlobal({ slug: 'header', depth: 0 })
    return (header.navItems ?? []).map(({ link }) => link.label)
  }

  for (const role of userRoles) {
    const allowed = role !== 'editor'
    it(`${role}_${allowed ? 'can' : 'cannot'}_update_the_header_through_rest_graphql_and_local_api`, async () => {
      for (const channel of ['rest', 'graphql', 'local'] as const) {
        await update([custom('Baseline', '/baseline')])
        if (channel === 'rest') await rest(role)
        else if (channel === 'graphql') {
          const result = await (await graphql(role)).json()
          if (allowed) expect(result.errors, JSON.stringify(result.errors)).toBeUndefined()
        } else await update(row, role).catch(() => undefined)
        expect(await currentLabels(), `${role} ${channel}`).toEqual([
          allowed ? 'Access probe' : 'Baseline',
        ])
      }
    })
  }

  it('denies_visitors_and_disabled_accounts', async () => {
    await update([custom('Baseline', '/baseline')])
    expect((await rest()).status).toBe(403)
    await graphql()
    expect(await currentLabels()).toEqual(['Baseline'])
    const req = await createLocalReq({}, payload)
    await withAccountProvisioning(req, () =>
      payload.update({
        collection: 'users',
        id: fixtures.users.publisher.id,
        data: { disabled: true },
        req,
      }),
    )
    expect([401, 403]).toContain((await rest('publisher')).status)
    await expect(update(row)).rejects.toMatchObject({ status: 403 })
    expect(await currentLabels()).toEqual(['Baseline'])
  })
})
