import { randomUUID } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'
import { createRecordSectionFixtures } from '../helpers/recordFixtures'

type Fixtures = ReturnType<typeof createRecordSectionFixtures>

const day = (offset: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return `${d.toISOString().slice(0, 10)}T00:00:00.000Z`
}
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

test.describe('Front page', () => {
  test.setTimeout(120000)
  let payload: Payload
  let fx: Fixtures
  let accessFx: Awaited<ReturnType<typeof createAccessFixtures>>
  let storedHomeID: number | null = null
  let originalNav: unknown
  const marker = `Synthetic home ${randomUUID().slice(0, 8)}`
  const t = (label: string) => `${label} ${marker}`

  test.beforeAll(async ({ request }) => {
    payload = await getPayload({ config })
    fx = createRecordSectionFixtures(payload)
    accessFx = await createAccessFixtures(payload)
    const org = await fx.org({ name: t('Org') })
    const notice = await fx.category('Notice', 'notice')
    await fx.post({ title: t('Published update'), publishedAt: ago(10) })
    await fx.post({ title: t('Stale update'), publishedAt: ago(60) })
    await fx.issuance({
      title: t('Executive order'),
      organization: org.id,
      mainDocument: await fx.file(org.id),
      publishedAt: ago(2),
      type: 'executive_order',
    })
    // Model the owner's header: Home, Latest Updates, Government, Transparency, Archives, Contact.
    originalNav = (await payload.findGlobal({ slug: 'header', depth: 0 })).navItems ?? []
    const custom = (label: string, url: string) => ({ type: 'custom' as const, label, url })
    const child = (label: string, url: string) => ({ link: custom(label, url) })
    const headerRes = await request.post('/api/globals/header', {
      headers: { Authorization: `JWT ${accessFx.tokens.publisher}` },
      data: {
        navItems: [
          { link: custom('Home', '/'), section: 'home' },
          { link: custom('Latest Updates', '/posts'), section: 'updates' },
          {
            link: custom('Government', '/government'),
            section: 'government',
            children: [child('Offices', '/government/offices')],
          },
          {
            link: custom('Transparency', '/transparency'),
            section: 'transparency',
            children: [child('Financial Reports', '/transparency/financial-reports')],
          },
          {
            link: custom('Archives', '/archives'),
            section: 'archives',
            children: [child('Executive', '/archives/executive')],
          },
          { link: custom('Contact', '/contact'), section: 'contact' },
        ],
      },
    })
    expect(headerRes.ok(), await headerRes.text()).toBe(true)
    await fx.post({ title: t('Live notice'), publishedAt: ago(1), categories: [notice] })
    await fx.post({ title: t('Expired notice'), publishedAt: ago(30), categories: [notice] })
    await fx.post({ title: t('Draft update'), status: 'draft', publishedAt: ago(0) })
    await fx.activity({ title: t('Upcoming activity'), organization: org.id, eventDate: day(3) })
    await fx.activity({ title: t('Past activity'), organization: org.id, eventDate: day(-3) })
    await fx.activity({
      title: t('Draft activity'),
      organization: org.id,
      eventDate: day(4),
      status: 'draft',
    })
    // A stored `home` Page must stay untouched and unrendered at `/`.
    const existing = await payload.db.findOne({
      collection: 'pages',
      where: { slug: { equals: 'home' } },
    })
    if (!existing) {
      const created = await payload.db.create({
        collection: 'pages',
        data: {
          title: t('Stored home'),
          slug: 'home',
          _status: 'published',
          hero: { type: 'none' },
        },
      })
      storedHomeID = Number(created.id)
    }
  })

  test.afterAll(async ({ request }) => {
    await request.post('/api/globals/header', {
      headers: { Authorization: `JWT ${accessFx.tokens.publisher}` },
      data: { navItems: originalNav },
    })
    if (storedHomeID)
      await payload.db.deleteOne({ collection: 'pages', where: { id: { equals: storedHomeID } } })
    await fx.cleanup()
    await removeTestAccounts(
      payload,
      Object.values(accessFx.users).map((u) => u.id),
    )
  })

  const overflow = (page: Page) =>
    page.evaluate(() => {
      const limit = document.documentElement.clientWidth
      const offenders = [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > limit + 0.5)
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`)
      return { extra: document.documentElement.scrollWidth - limit, offenders }
    })
  test('shows published content only and never leaks drafts, expired or past items', async ({
    page,
    request,
  }) => {
    const errors: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    const body = page.locator('main')
    await expect(body).toContainText(t('Live notice'))
    await expect(page.getByRole('heading', { name: 'Official notice' })).toBeVisible()
    await expect(body).toContainText(t('Upcoming activity'))
    const raw = await (await request.get('/')).text()
    // An expired notice is still a published update; only the notice block ages out.
    const noticeRegion = page.getByRole('region', { name: 'Official notice' })
    await expect(noticeRegion).toContainText(t('Live notice'))
    await expect(noticeRegion).not.toContainText(t('Expired notice'))
    // The notice colors come from @theme utilities; a missing mapping leaves it unstyled.
    const bg = await noticeRegion.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).not.toMatch(/^rgba\(0, 0, 0, 0\)|^transparent/)
    for (const hidden of ['Draft update', 'Past activity', 'Draft activity'])
      expect(raw, hidden).not.toContain(t(hidden))
    expect(raw).not.toMatch(/storageKey|sha256/)
    // The stored `home` Page is not rendered at `/`, and `/home` still resolves.
    expect(raw).not.toContain(t('Stored home'))
    expect(errors).toEqual([])
  })

  test('shows the mixed 30-day updates with tags and actions, hiding stale items', async ({
    page,
  }) => {
    await page.goto('/')
    const updates = page.getByRole('region', { name: 'Latest updates' })
    await expect(updates).toContainText(t('Published update'))
    await expect(updates).toContainText(t('Executive order'))
    await expect(updates).toContainText('Executive order')
    await expect(updates).not.toContainText(t('Stale update'))
    await expect(
      updates.getByRole('link', { name: new RegExp(`^Record\\s*:\\s*${t('Executive order')}`) }),
    ).toBeVisible()
    await expect(
      updates.getByRole('link', { name: new RegExp(`^PDF\\s*:\\s*${t('Executive order')}`) }),
    ).toBeVisible()
    await expect(
      updates.getByRole('link', { name: new RegExp(`^Read update\\s*:\\s*${t('Published update')}`) }),
    ).toBeVisible()
  })

  test('wears the PalSU identity: rust authority band, seal, hero within 55vh', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    const header = page.getByRole('banner')
    expect(await header.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgb(180, 68, 12)',
    )
    await expect(header.locator('img.site-wordmark-seal')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const hero = await page.locator('section[aria-labelledby="home-statement"]').boundingBox()
    expect(hero!.height).toBeLessThanOrEqual(900 * 0.55)
    expect(hero!.height).toBeGreaterThanOrEqual(900 * 0.3)
    const shotDir = process.env.HOME_SCREENSHOT_DIR
    if (shotDir) {
      await page.screenshot({ path: `${shotDir}/home-1280.png`, fullPage: false })
      await page.screenshot({ path: `${shotDir}/home-full.png`, fullPage: true })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.screenshot({ path: `${shotDir}/home-390.png`, fullPage: false })
    }
  })

  test('redirects /home to the front page', async ({ request }) => {
    const res = await request.get('/home', { maxRedirects: 0 })
    expect([307, 308]).toContain(res.status())
    expect(new URL(res.headers()['location'], 'http://x').pathname).toBe('/')
    const followed = await request.get('/home')
    expect(await followed.text()).not.toContain(t('Stored home'))
  })

  for (const width of [320, 1280]) {
    test(`has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')
      expect(await overflow(page)).toEqual({ extra: 0, offenders: [] })
    })
  }

  test('is also free of overflow at 320px with 200% text size', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/')
    await page.addStyleTag({ content: 'html { font-size: 200% !important }' })
    expect(await overflow(page)).toEqual({ extra: 0, offenders: [] })
  })

  test('keyboard order follows reading order and focus is visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    const links = await page
      .locator('main a[href]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('href')))
    expect(links.length).toBeGreaterThan(3)
    const seen: (string | null)[] = []
    for (let i = 0; i < 80 && seen.length < links.length; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || !el.closest('main')) return null
        const style = getComputedStyle(el)
        return {
          href: el.getAttribute('href'),
          outline: parseFloat(style.outlineWidth),
          outlineStyle: style.outlineStyle,
        }
      })
      if (!info) continue
      seen.push(info.href)
      expect(info.outlineStyle, `focus style for ${info.href}`).not.toBe('none')
      expect(info.outline, `focus width for ${info.href}`).toBeGreaterThanOrEqual(2)
    }
    expect(seen).toEqual(links)
  })

  test('is visible and complete with JavaScript disabled', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    try {
      const page = await context.newPage()
      await page.goto(`${baseURL}/`)
      await expect(page.locator('h1')).toBeVisible()
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).opacity)).toBe(
        '1',
      )
      await expect(page.locator('main')).toContainText(t('Published update'))
    } finally {
      await context.close()
    }
  })
})
