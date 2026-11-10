import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { getHomeData, homeLinksFor, liveRecordCollections } from '@/home/getHomeData'
import type { NavItem } from '@/Header/resolveNavigation'
import { createRecordSectionFixtures } from '../helpers/recordFixtures'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

const DAY = 86_400_000
// 08:00 in Manila on 10 November 2026.
const NOW = new Date('2026-11-10T00:00:00.000Z')
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()
const day = (offset: number) =>
  new Date(Date.UTC(2026, 10, 10 + offset)).toISOString().replace(/T.*/, 'T00:00:00.000Z')

describe('homepage data', () => {
  let payload: Payload
  let fx: ReturnType<typeof createRecordSectionFixtures>
  let org: { id: number; name: string }
  let notice: number

  beforeAll(async () => {
    payload = await getPayload({ config })
    fx = createRecordSectionFixtures(payload)
    org = await fx.org({ name: `Home org ${fx.tag}` })
    notice = await fx.category('Notice', 'notice')
  })
  afterAll(async () => {
    await fx.cleanup()
  })

  describe('latest updates', () => {
    it('lists_published_posts_newest_first_limited_to_five_without_drafts', async () => {
      const titles = [] as string[]
      for (let i = 0; i < 7; i++) {
        const post = await fx.post({
          title: `Home update ${fx.tag} ${i}`,
          publishedAt: ago(2 + i),
        })
        titles.push(post.title)
      }
      const draft = await fx.post({
        title: `Home draft ${fx.tag}`,
        status: 'draft',
        publishedAt: ago(1),
      })
      const { updates } = await getHomeData(payload, NOW)
      const mine = updates.filter((row) => row.title.includes(fx.tag))
      expect(updates.length).toBeLessThanOrEqual(5)
      expect(mine.map((row) => row.title)).toEqual(titles.slice(0, mine.length))
      expect(JSON.stringify(updates)).not.toContain(draft.title)
      for (const row of mine) {
        expect(row.href).toMatch(/^\/posts\/synthetic-post-/)
        expect(row.date).toBeTruthy()
      }
    })

    it('exposes_category_titles_only', async () => {
      const post = await fx.post({
        title: `Home categorised ${fx.tag}`,
        publishedAt: ago(1),
        categories: [notice],
      })
      const { updates } = await getHomeData(payload, NOW)
      const row = updates.find((r) => r.title === post.title)
      expect(row?.label).toBe('Notice')
      expect(Object.keys(row!).sort()).toEqual(
        [
          'date',
          'dateLabel',
          'fileHref',
          'href',
          'instant',
          'key',
          'kind',
          'label',
          'meta',
          'title',
        ].sort(),
      )
    })
    it('tags_a_post_without_a_category_as_an_announcement', async () => {
      const post = await fx.post({ title: `Home untagged ${fx.tag}`, publishedAt: ago(1) })
      const { updates } = await getHomeData(payload, NOW)
      expect(updates.find((r) => r.title === post.title)).toMatchObject({
        label: 'Announcement',
        kind: 'update',
      })
    })
    it('excludes_a_post_dated_in_the_future', async () => {
      const future = await fx.post({ title: `Home future ${fx.tag}`, publishedAt: ago(-5) })
      const { updates } = await getHomeData(payload, NOW)
      expect(updates.map((row) => row.title)).not.toContain(future.title)
    })
  })

  describe('latest updates are a mixed 30-day list', () => {
    // Each test works in its own era so fixtures from other tests are long stale (rows are capped at 5).
    let era = NOW
    const eraAgo = (days: number) => new Date(era.getTime() - days * DAY).toISOString()
    const issuance = async (title: string, age: number, status?: 'draft' | 'published') =>
      fx.issuance({
        title: `${title} ${fx.tag}`,
        organization: org.id,
        mainDocument: await fx.file(org.id),
        publishedAt: eraAgo(age),
        status,
        type: 'executive_order',
      })

    it('mixes_posts_issuances_and_reports_newest_first_with_a_tag_and_pdf_per_row', async () => {
      era = new Date(NOW.getTime() + 200 * DAY)
      const post = await fx.post({ title: `Mixed post ${fx.tag}`, publishedAt: eraAgo(1) })
      const eo = await issuance('Mixed order', 2)
      const report = await fx.report({
        title: `Mixed report ${fx.tag}`,
        organization: org.id,
        mainDocument: await fx.file(org.id),
        publishedAt: eraAgo(3),
      })
      const { updates, updatesFresh } = await getHomeData(payload, era)
      expect(updatesFresh).toBe(true)
      const titles = updates.map((r) => r.title)
      const mine = [post.title, eo.title, report.title]
      expect(titles.filter((t) => mine.includes(t))).toEqual(mine)
      const row = (title: string) => updates.find((r) => r.title === title)!
      expect(row(post.title)).toMatchObject({ kind: 'update', fileHref: null })
      expect(row(eo.title)).toMatchObject({ kind: 'record', label: 'Executive order' })
      expect(row(eo.title).href).toBe(`/issuances/${eo.slug}`)
      expect(row(eo.title).fileHref).toMatch(/^\/api\/documents\/\d+\/file$/)
      expect(row(report.title).label).toMatch(/report/i)
      expect(updates.length).toBeLessThanOrEqual(5)
    })

    it('drops_items_older_than_thirty_days_while_something_fresher_exists', async () => {
      era = new Date(NOW.getTime() + 400 * DAY)
      const fresh = await fx.post({ title: `Window fresh ${fx.tag}`, publishedAt: eraAgo(5) })
      const stale = await fx.post({ title: `Window stale ${fx.tag}`, publishedAt: eraAgo(31) })
      const oldRecord = await issuance('Window old order', 45)
      const { updates, updatesFresh } = await getHomeData(payload, era)
      const titles = updates.map((r) => r.title)
      expect(updatesFresh).toBe(true)
      expect(titles).toContain(fresh.title)
      expect(titles).not.toContain(stale.title)
      expect(titles).not.toContain(oldRecord.title)
      for (const r of updates)
        expect(Date.parse(r.date!)).toBeGreaterThanOrEqual(era.getTime() - 30 * DAY)
    })

    it('falls_back_to_the_newest_items_and_says_so_when_nothing_is_that_fresh', async () => {
      era = new Date(NOW.getTime() + 600 * DAY)
      await fx.post({ title: `Fallback post ${fx.tag}`, publishedAt: eraAgo(1) })
      const later = new Date(era.getTime() + 400 * DAY)
      const { updates, updatesFresh } = await getHomeData(payload, later)
      expect(updatesFresh).toBe(false)
      expect(updates.length).toBeGreaterThan(0)
      expect(updates.length).toBeLessThanOrEqual(5)
    })

    it('never_lists_a_draft_or_future_dated_record', async () => {
      era = new Date(NOW.getTime() + 800 * DAY)
      const draft = await issuance('Mixed draft order', 0, 'draft')
      const future = await issuance('Mixed future order', -4)
      const { updates } = await getHomeData(payload, era)
      const all = JSON.stringify(updates)
      expect(all).not.toContain(draft.title)
      expect(all).not.toContain(future.title)
    })
  })

  describe('official notice', () => {
    const noticePost = (title: string, over: { age?: number; status?: 'draft' | 'published' }) =>
      fx.post({
        title: `${title} ${fx.tag}`,
        publishedAt: ago(over.age ?? 1),
        status: over.status,
        categories: [notice],
      })

    it('is_absent_when_no_notice_is_published', async () => {
      const plain = await fx.post({ title: `Home plain ${fx.tag}`, publishedAt: ago(0) })
      const { notice: found } = await getHomeData(payload, NOW)
      expect(found === null || !found.title.includes(plain.title)).toBe(true)
      expect(found?.title ?? '').not.toContain(plain.title)
    })

    it('shows_the_newest_published_notice_inside_fourteen_days', async () => {
      await noticePost('Older notice', { age: 6 })
      const newest = await noticePost('Newest notice', { age: 0 })
      const { notice: found } = await getHomeData(payload, NOW)
      expect(found).toMatchObject({ title: newest.title })
      expect(found?.href).toBe(`/posts/${newest.slug}`)
    })

    it('ignores_an_expired_notice_and_one_dated_in_the_future', async () => {
      const probe = createRecordSectionFixtures(payload)
      const fresh = await getHomeData(payload, new Date(NOW.getTime() + 400 * DAY))
      expect(fresh.notice).toBeNull()
      const future = await noticePost('Future notice', { age: -3 })
      const { notice: found } = await getHomeData(payload, NOW)
      expect(found?.title).not.toBe(future.title)
      await probe.cleanup()
    })

    it('ignores_an_unpublished_notice_even_when_it_is_the_newest', async () => {
      const draft = await noticePost('Draft notice', { age: 0, status: 'draft' })
      const { notice: found } = await getHomeData(payload, NOW)
      expect(found?.title).not.toBe(draft.title)
      expect(JSON.stringify(await getHomeData(payload, NOW))).not.toContain(draft.title)
    })
  })

  describe('upcoming activities', () => {
    it('lists_today_and_later_soonest_first_and_excludes_past_and_draft', async () => {
      const make = (title: string, eventDate: string, status?: 'draft' | 'published') =>
        fx.activity({ title: `${title} ${fx.tag}`, organization: org.id, eventDate, status })
      const past = await make('Past activity', day(-1))
      const later = await make('Later activity', day(10))
      const today = await make('Today activity', day(0))
      const soon = await make('Soon activity', day(2))
      const draft = await make('Draft activity', day(3), 'draft')
      const { activities } = await getHomeData(payload, NOW)
      const mine = activities.filter((row) => row.title.includes(fx.tag))
      expect(mine.map((row) => row.title)).toEqual([today.title, soon.title, later.title])
      const all = JSON.stringify(activities)
      expect(all).not.toContain(past.title)
      expect(all).not.toContain(draft.title)
      expect(activities.length).toBeLessThanOrEqual(5)
    })

    it('treats_date_only_values_stored_at_noon_utc_as_that_calendar_day', async () => {
      const at = (offset: number) => day(offset).replace('T00:00:00.000Z', 'T12:00:00.000Z')
      const yesterday = await fx.activity({
        title: `Noon yesterday ${fx.tag}`,
        organization: org.id,
        eventDate: at(-1),
      })
      const today = await fx.activity({
        title: `Noon today ${fx.tag}`,
        organization: org.id,
        eventDate: at(0),
      })
      const { activities } = await getHomeData(payload, NOW)
      const titles = activities.map((row) => row.title)
      expect(titles).toContain(today.title)
      expect(titles).not.toContain(yesterday.title)
      expect(activities.find((row) => row.title === today.title)?.instant).toBe(false)
    })
    it('uses_the_manila_calendar_date_for_today', async () => {
      // 20:00 UTC on the 10th is already the 11th in Manila, so an event dated the 10th is past.
      const evening = new Date('2026-11-10T20:00:00.000Z')
      const tenth = await fx.activity({
        title: `Manila tenth ${fx.tag}`,
        organization: org.id,
        eventDate: day(0),
      })
      const eleventh = await fx.activity({
        title: `Manila eleventh ${fx.tag}`,
        organization: org.id,
        eventDate: day(1),
      })
      const { activities } = await getHomeData(payload, evening)
      const titles = activities.map((row) => row.title)
      expect(titles).not.toContain(tenth.title)
      expect(titles).toContain(eleventh.title)
    })
  })

  describe('records', () => {
    it('lists_published_issuances_only_newest_first_reports_belong_to_transparency', async () => {
      const file = await fx.file(org.id)
      const second = await fx.file(org.id)
      const old = await fx.issuance({
        title: `Home old issuance ${fx.tag}`,
        organization: org.id,
        mainDocument: file,
        publishedAt: ago(3),
      })
      const newer = await fx.issuance({
        title: `Home new issuance ${fx.tag}`,
        organization: org.id,
        mainDocument: second,
        publishedAt: ago(1),
      })
      const report = await fx.report({
        title: `Home report ${fx.tag}`,
        organization: org.id,
        mainDocument: await fx.file(org.id),
        publishedAt: ago(0),
      })
      const hidden = await fx.issuance({
        title: `Home draft issuance ${fx.tag}`,
        organization: org.id,
        mainDocument: await fx.file(org.id),
        status: 'draft',
        publishedAt: ago(0),
      })
      const { records } = await getHomeData(payload, NOW)
      expect(records).not.toBeNull()
      const titles = records!.map((row) => row.title)
      expect(titles.indexOf(newer.title)).toBeGreaterThanOrEqual(0)
      expect(titles.indexOf(newer.title)).toBeLessThan(titles.indexOf(old.title))
      expect(titles).not.toContain(hidden.title)
      expect(titles).not.toContain(report.title)
      expect(records!.length).toBeLessThanOrEqual(5)
      const row = records!.find((r) => r.title === newer.title)!
      expect(row.href).toBe(`/issuances/${newer.slug}`)
      // Row data never carries storage details; only a controlled route or null.
      expect(JSON.stringify(records)).not.toMatch(/storageKey|sha256|ready\//)
    })

    it('omits_record_types_whose_route_is_not_live', () => {
      const targets = {
        issuances: { live: true },
        reports: { live: false },
        posts: { live: true },
      }
      expect(liveRecordCollections(targets as never)).toEqual(['issuances'])
      expect(liveRecordCollections({ issuances: { live: false } } as never)).toEqual([])
    })
  })

  describe('navigation links', () => {
    const item = (section: NavItem['section'], children: NavItem['children']): NavItem => ({
      id: section ?? 'x',
      label: section ?? 'x',
      href: '/x',
      newTab: false,
      available: true,
      section,
      children,
    })
    const child = (label: string, href: string | null, available = true) => ({
      id: label,
      label,
      href,
      newTab: false,
      available,
    })

    it('returns_only_available_children_with_real_destinations', () => {
      const items = [
        item('services', [
          child('Helpdesk', '/helpdesk'),
          child('Pending', null, false),
          child('Blank', '#'),
          child('Empty', ''),
        ]),
        item('transparency', [child('Financial', '/transparency/financial')]),
      ]
      expect(homeLinksFor(items, 'services').map((l) => l.label)).toEqual(['Helpdesk'])
      expect(homeLinksFor(items, 'transparency').map((l) => l.label)).toEqual(['Financial'])
      expect(homeLinksFor([], 'services')).toEqual([])
    })
  })

  describe('header reference links', () => {
    let original: unknown
    const made: number[] = []
    const page = async (label: string, status: 'published' | 'draft') => {
      const doc = await payload.db.create({
        collection: 'pages',
        data: {
          title: `${label} ${fx.tag}`,
          slug: `synthetic-${label.toLowerCase().replaceAll(' ', '-')}-${fx.tag}`,
          _status: status,
          hero: { type: 'none' },
        },
      })
      made.push(Number(doc.id))
      return Number(doc.id)
    }
    beforeAll(async () => {
      original = (await payload.findGlobal({ slug: 'header', depth: 0 })).navItems
    })
    afterAll(async () => {
      await payload.updateGlobal({ slug: 'header', data: { navItems: original as never } })
      for (const id of made)
        await payload.db.deleteOne({ collection: 'pages', where: { id: { equals: id } } })
    })

    it('shows_a_child_pointing_to_a_published_page_and_hides_one_pointing_to_a_draft', async () => {
      const live = await page('Live service', 'published')
      const draft = await page('Draft service', 'draft')
      const ref = (label: string, id: number) => ({
        link: { type: 'reference', label, reference: { relationTo: 'pages', value: id } },
      })
      await payload.updateGlobal({
        slug: 'header',
        data: {
          navItems: [
            {
              section: 'services',
              link: { type: 'custom', label: 'Student services', url: '/services' },
              children: [ref('Live service link', live), ref('Draft service link', draft)],
            },
          ],
        } as never,
      })
      const { services } = await getHomeData(payload, NOW)
      expect(services.map((l) => l.label)).toEqual(['Live service link'])
      expect(services[0].href).toBe(`/synthetic-live-service-${fx.tag}`)
    })
  })
  describe('access boundary', () => {
    type Call = { kind: string; args: Record<string, unknown> }
    function spy(overrides: Partial<Record<'find' | 'findGlobal', () => Promise<unknown>>> = {}) {
      const calls: Call[] = []
      const proxy = new Proxy(payload, {
        get(target, prop, receiver) {
          if (prop === 'find' || prop === 'findGlobal') {
            return (args: Record<string, unknown>) => {
              calls.push({ kind: String(prop), args })
              const override = overrides[prop]
              if (override) return override()
              return (target as never as Record<string, (a: unknown) => unknown>)[prop](args)
            }
          }
          return Reflect.get(target, prop, receiver)
        },
      })
      return { calls, proxy: proxy as Payload }
    }

    it('every_read_is_anonymous_non_draft_and_filtered_to_published', async () => {
      const { calls, proxy } = spy()
      await getHomeData(proxy, NOW)
      expect(calls.length).toBeGreaterThan(3)
      // The mixed Latest updates list reads posts and both record collections through these calls.
      const read = calls.filter((c) => c.kind === 'find').map((c) => String(c.args.collection))
      for (const collection of ['posts', 'issuances', 'reports']) expect(read).toContain(collection)
      for (const { kind, args } of calls) {
        // The one reviewed privileged read: documents are not public, so file facts are read for
        // ids taken from already-published records (see src/records/publicFileFacts.ts).
        if (kind === 'find' && args.collection === 'documents') continue
        const label = `${kind} ${String(args.collection ?? args.slug)}`
        expect(args.overrideAccess, label).toBe(false)
        expect(args.draft, label).toBe(false)
        expect(args.user, label).toBeUndefined()
        if (kind === 'find')
          expect(JSON.stringify(args.where), label).toContain('"_status":{"equals":"published"}')
      }
    })

    it('an_empty_read_yields_empty_sections_not_an_error', async () => {
      const empty = { docs: [], totalDocs: 0, totalPages: 0, page: 1 }
      const { proxy } = spy({
        find: async () => empty,
        findGlobal: async () => ({ navItems: [] }),
      })
      const data = await getHomeData(proxy, NOW)
      expect(data).toMatchObject({
        notice: null,
        updates: [],
        activities: [],
        services: [],
        transparency: [],
        updatesFresh: false,
      })
      expect(data.records).toEqual([])
    })

    it('a_failed_read_rejects_instead_of_looking_empty', async () => {
      const { proxy } = spy({
        find: async () => {
          throw new Error('database unavailable')
        },
      })
      await expect(getHomeData(proxy, NOW)).rejects.toThrow('database unavailable')
    })
  })
})
