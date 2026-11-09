import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import { syntheticContent } from '../helpers/contentFixtures'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'

type Row = { section?: string; link: object; children?: { link: object }[] }
const link = (label: string, url: string, extra: object = {}) => ({
  type: 'custom',
  label,
  url,
  ...extra,
})
const row = (section: string, label: string, url: string, children: string[][] = []): Row => ({
  section,
  link: link(label, url),
  children: children.map(([l, u]) => ({ link: link(l, u) })),
})
// Routes that exist today (/, /posts, /search) are used as targets; the rest are never followed.
const synthetic: Row[] = [
  row('home', 'Home', '/'),
  row('updates', 'Latest Updates', '/posts', [['All updates', '/posts']]),
  row('services', 'Student Services', '/search', [['Search services', '/search']]),
  row('government', 'Government', '/synthetic-government', [
    ['Offices', '/synthetic-government/offices'],
    ['Participating CSGs', '/synthetic-government/csgs'],
  ]),
  row('transparency', 'Transparency', '/synthetic-transparency', [
    ['Financial Reports', '/synthetic-transparency/financial'],
  ]),
  row('archives', 'Archives', '/synthetic-archives', [
    ['Executive', '/synthetic-archives/executive'],
  ]),
  row('contact', 'Contact', '/synthetic-contact', [['USG contacts', '/synthetic-contact/usg']]),
]
const labels = synthetic.map(({ link }) => (link as { label: string }).label)

test.describe('Primary navigation', () => {
  test.setTimeout(120000)
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  let original: unknown[] = []
  const postSlug = `synthetic-nav-${Date.now()}`
  let postID: number

  async function setHeader(request: APIRequestContext, navItems: unknown[]) {
    const response = await request.post('/api/globals/header', {
      headers: { Authorization: `JWT ${fixtures.tokens.publisher}` },
      data: { navItems },
    })
    expect(response.ok(), await response.text()).toBe(true)
  }
  const nav = (page: Page) => page.getByRole('navigation', { name: 'Primary' })
  const menuToggle = (page: Page) => nav(page).locator('summary', { hasText: /^\s*Menu\s*$/ })
  const groupToggle = (page: Page, name: string) =>
    nav(page).locator('summary', { hasText: `Show ${name} links` })

  test.beforeAll(async ({ request }) => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
    original = (await payload.findGlobal({ slug: 'header', depth: 0 })).navItems ?? []
    postID = (
      await payload.create({
        collection: 'posts',
        context: { disableRevalidate: true },
        data: {
          title: 'Synthetic navigation post',
          slug: postSlug,
          content: syntheticContent,
          _status: 'published',
        },
      })
    ).id
    await setHeader(request, synthetic)
  })
  test.afterAll(async ({ request }) => {
    await setHeader(request, original)
    await payload.delete({ collection: 'posts', id: postID, context: { disableRevalidate: true } })
    await removeTestAccounts(
      payload,
      Object.values(fixtures.users).map(({ id }) => id),
    )
  })

  test.describe('desktop', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('shows seven ordered destinations, institutional text and a separate Search link', async ({
      page,
    }) => {
      await page.goto('/posts')
      await expect(
        page.getByRole('banner').getByRole('link', { name: /University Student Government/ }),
      ).toBeVisible()
      await expect(page.locator('img[alt="Payload Logo"]')).toHaveCount(0)
      const top = nav(page).locator('xpath=(.//ul)[1]/li/a')
      await expect(top).toHaveText(labels)
      await expect(menuToggle(page)).toBeHidden()
      await expect(nav(page).getByRole('link', { name: 'Search' })).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Footer' })).toHaveCount(1)
      await expect(nav(page).getByRole('link', { name: 'Latest Updates' })).toHaveAttribute(
        'aria-current',
        'page',
      )
      await expect(nav(page).getByRole('link', { name: 'Home' })).not.toHaveAttribute(
        'aria-current',
        'page',
      )
    })

    test('group disclosure opens by keyboard, closes with Escape and restores focus', async ({
      page,
    }) => {
      await page.goto('/')
      const toggle = groupToggle(page, 'Government')
      await toggle.focus()
      await expect(toggle).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(nav(page).getByRole('link', { name: 'Offices' })).toBeVisible()
      await page.keyboard.press('Tab')
      await expect(nav(page).getByRole('link', { name: 'Offices' })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(nav(page).getByRole('link', { name: 'Offices' })).toBeHidden()
      await expect(toggle).toBeFocused()
      await page.keyboard.press('Space')
      await expect(nav(page).getByRole('link', { name: 'Offices' })).toBeVisible()
    })

    test('opening a sibling closes the previous group and outside clicks do not steal focus', async ({
      page,
    }) => {
      await page.goto('/')
      await groupToggle(page, 'Government').click()
      await expect(nav(page).getByRole('link', { name: 'Offices' })).toBeVisible()
      await groupToggle(page, 'Transparency').click()
      await expect(nav(page).getByRole('link', { name: 'Financial Reports' })).toBeVisible()
      await expect(nav(page).getByRole('link', { name: 'Offices' })).toBeHidden()
      await page.locator('footer').click({ position: { x: 5, y: 5 } })
      await expect(nav(page).getByRole('link', { name: 'Financial Reports' })).toBeHidden()
      expect(
        await page.evaluate(() => document.activeElement?.closest('nav[aria-label="Primary"]')),
      ).toBeNull()
    })

    test('activating a child link completes navigation, closes the group and focuses the heading', async ({
      page,
    }) => {
      await page.goto('/')
      await groupToggle(page, 'Latest Updates').click()
      await nav(page).getByRole('link', { name: 'All updates' }).click()
      await expect(page).toHaveURL(/\/posts$/)
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
      await expect(nav(page).getByRole('link', { name: 'All updates' })).toBeHidden()
      await page.goBack()
      await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/)
      await page.goForward()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })

    test('marks the ancestor section with text without claiming it is the current page', async ({
      page,
    }) => {
      await page.goto('/posts/' + postSlug)
      const updates = nav(page).getByRole('link', { name: /^Latest Updates/ })
      await expect(updates).not.toHaveAttribute('aria-current', 'page')
      await expect(updates).toHaveAttribute('data-section-current', 'true')
      await expect(updates).toContainText('(current section)')
      await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(0)
      // '/posts-archive' style collisions are not prefix matches.
      await expect(nav(page).getByRole('link', { name: 'Home' })).not.toHaveAttribute(
        'data-section-current',
        'true',
      )
    })
    test('has a skip link to a unique main landmark', async ({ page }) => {
      await page.goto('/posts')
      await page.keyboard.press('Tab')
      const skip = page.getByRole('link', { name: 'Skip to main content' })
      await expect(skip).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.locator('main#main-content')).toBeFocused()
      await expect(page.getByRole('main')).toHaveCount(1)
    })
  })

  test.describe('mobile', () => {
    test.use({ viewport: { width: 390, height: 800 } })

    test('uses an in-flow Menu disclosure with Search outside it', async ({ page }) => {
      await page.goto('/')
      await expect(menuToggle(page)).toBeVisible()
      await expect(nav(page).getByRole('link', { name: 'Government', exact: true })).toBeHidden()
      await expect(nav(page).getByRole('link', { name: 'Search' })).toBeVisible()
      await menuToggle(page).focus()
      await page.keyboard.press('Enter')
      await expect(nav(page).locator('xpath=(.//ul)[1]/li/a')).toHaveText(labels)
      await groupToggle(page, 'Government').click()
      await expect(nav(page).getByRole('link', { name: 'Offices' })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(nav(page).getByRole('link', { name: 'Offices' })).toBeHidden()
      await expect(groupToggle(page, 'Government')).toBeFocused()
      await expect(nav(page).getByRole('link', { name: 'Government', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(nav(page).getByRole('link', { name: 'Government', exact: true })).toBeHidden()
      await expect(menuToggle(page)).toBeFocused()
    })

    test('activating a link closes the menu and keeps in-flow layout without horizontal scroll', async ({
      page,
    }) => {
      await page.goto('/')
      await menuToggle(page).click()
      await nav(page).getByRole('link', { name: 'Latest Updates' }).click()
      await expect(page).toHaveURL(/\/posts$/)
      await expect(nav(page).getByRole('link', { name: 'Government', exact: true })).toBeHidden()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
    })

    test('focus moves to the Menu control when a breakpoint change hides focused content', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto('/')
      await expect(nav(page)).toHaveAttribute('data-enhanced', 'true')
      await nav(page).getByRole('link', { name: 'Government', exact: true }).focus()
      await page.setViewportSize({ width: 390, height: 800 })
      await expect(menuToggle(page)).toBeFocused()
    })

    test('opening Menu then a link in a new tab keeps the original page usable', async ({
      page,
    }) => {
      await page.goto('/')
      await menuToggle(page).click()
      const popup = page.context().waitForEvent('page')
      await nav(page)
        .getByRole('link', { name: 'Latest Updates' })
        .click({ modifiers: ['Control'] })
      await (await popup).close()
      await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/)
    })
  })

  test.describe('narrow layouts and zoom', () => {
    for (const width of [640, 320]) {
      test(`wraps long labels without clipping or horizontal overflow at ${width}px`, async ({
        page,
        request,
      }) => {
        const long =
          'A deliberately long synthetic destination label that must wrap instead of clipping'
        await setHeader(request, [row('home', 'Home', '/'), row('updates', long, '/posts')])
        await page.setViewportSize({ width, height: 800 })
        await page.goto('/')
        await menuToggle(page).click()
        const item = nav(page).getByRole('link', { name: long })
        await expect(item).toBeVisible()
        const box = (await item.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true)
        await setHeader(request, synthetic)
      })
    }

    test('targets are at least 44 CSS pixels', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 800 })
      await page.goto('/')
      await menuToggle(page).click()
      const toggles = nav(page).locator('summary', { hasText: /^\s*Show .* links\s*$/ })
      const groups = await toggles.count()
      expect(groups).toBe(synthetic.filter((r) => r.children?.length).length)
      const targets = nav(page).locator('summary, a')
      const count = await targets.count()
      // 7 parents + 1 Menu + 6 group toggles + 7 children + Search. Only one group stays open,
      // so every group is opened in turn and every target must be measured at least once.
      expect(count).toBe(22)
      const measured = new Set<number>()
      for (let open = 0; open < groups; open++) {
        await toggles.nth(open).click()
        for (let i = 0; i < count; i++) {
          if (!(await targets.nth(i).isVisible())) continue
          const box = (await targets.nth(i).boundingBox())!
          expect(box.height, `target ${i}`).toBeGreaterThanOrEqual(44)
          expect(box.width, `target ${i} width`).toBeGreaterThanOrEqual(44)
          measured.add(i)
        }
      }
      expect([...measured].length).toBe(count)
    })

    test('does not animate the disclosure when reduced motion is requested', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width: 390, height: 800 })
      await page.goto('/')
      // Simulates a later motion style being added to the navigation.
      await page.addStyleTag({
        content: '.site-nav, .site-nav * { transition: color 2s; animation: x 2s; }',
      })
      await menuToggle(page).click()
      await expect(nav(page).getByRole('link', { name: 'Government', exact: true })).toBeVisible()
      const motion = await nav(page)
        .locator('xpath=descendant-or-self::*')
        .evaluateAll((els) =>
          els.map((el) => {
            const s = getComputedStyle(el)
            return `${s.transitionDuration}|${s.animationName}`
          }),
        )
      expect(motion.length).toBeGreaterThan(20)
      for (const value of motion) expect(value).toMatch(/^(0s,?\s?)+\|none$/)
    })

    test('keeps open group menus inside the viewport near the right edge', async ({ page }) => {
      // Rows wrap differently at each width, so sweep the range where a trailing item can sit
      // close to the right edge instead of relying on one layout.
      await page.goto('/')
      // Right-justify the rows so trailing items sit against the right edge, as long labels do.
      await page.addStyleTag({
        content:
          '.site-nav, .site-nav-bar, .site-nav-menu { width: 100% } .site-nav-list { justify-content: flex-end }',
      })
      for (let width = 1024; width <= 1100; width += 4) {
        await page.setViewportSize({ width, height: 800 })
        const toggles = nav(page).locator('summary', { hasText: /^\s*Show .* links\s*$/ })
        for (let i = 0; i < (await toggles.count()); i++) {
          await toggles.nth(i).click()
          const menu = toggles.nth(i).locator('xpath=ancestor::li[1]//ul')
          // The alignment script runs on the asynchronous toggle event.
          await expect
            .poll(
              async () => {
                const box = (await menu.boundingBox())!
                return box.x >= 0 && box.x + box.width <= width
              },
              { message: `${width}px group ${i} stays on screen` },
            )
            .toBe(true)
          await toggles.nth(i).click()
        }
      }
    })
  })
  test.describe('resilience', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('empty header shows only Home and Search without an error and keeps content reachable', async ({
      page,
      request,
    }) => {
      await setHeader(request, [])
      await page.goto('/posts')
      await expect(nav(page).getByRole('link')).toHaveText(['Home', 'Search'])
      await expect(page.getByText('Navigation is unavailable')).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await setHeader(request, synthetic)
    })

    test('exposes no unavailable destination in live navigation and no placeholder hrefs', async ({
      page,
    }) => {
      await page.goto('/')
      const hrefs = await page
        .locator('header a, footer a')
        .evaluateAll((els) => els.map((el) => el.getAttribute('href')))
      for (const href of hrefs) expect(href && href !== '#').toBeTruthy()
      await expect(page.getByText('Not yet available')).toHaveCount(0)
    })

    test('keeps the page visible if the theme initialisation script fails', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new Error('Synthetic storage failure')
          },
        })
      })
      await page.goto('/posts')
      // The theme script failed, so only the CSS fallback can reveal the page.
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
      expect(
        await page.evaluate(() => document.documentElement.getAnimations().length),
      ).toBeGreaterThan(0)
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).opacity))
        .toBe('1')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })
  })

  test.describe('section orientation', () => {
    const breadcrumb = (page: Page) => page.getByRole('navigation', { name: 'Breadcrumb' })
    const sectionIndex = (page: Page) =>
      page.getByRole('navigation', { name: 'Latest Updates section' })

    test('shows ordered breadcrumbs, a section index and a single main and heading', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto(`/posts/${postSlug}`)
      await expect(breadcrumb(page).locator('li')).toHaveText([
        'Home',
        'Latest Updates',
        'Synthetic navigation post',
      ])
      await expect(breadcrumb(page).locator('[aria-current="page"]')).toHaveText(
        'Synthetic navigation post',
      )
      await expect(breadcrumb(page).getByRole('link', { name: 'Latest Updates' })).toHaveAttribute(
        'href',
        '/posts',
      )
      await expect(sectionIndex(page).getByRole('link', { name: 'All updates' })).toBeVisible()
      await expect(sectionIndex(page).locator('[aria-current="page"]')).toHaveText(
        'Synthetic navigation post',
      )
      await expect(page.getByRole('main')).toHaveCount(1)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      const index = (await sectionIndex(page).boundingBox())!
      const content = (await page.locator('.site-section-content').boundingBox())!
      expect(index.x + index.width).toBeLessThanOrEqual(content.x + 1)
      await page.reload()
      await expect(breadcrumb(page)).toBeVisible()
      await expect(sectionIndex(page)).toBeVisible()
    })

    test('takes the section breadcrumb from the Header configuration', async ({
      page,
      request,
    }) => {
      await setHeader(request, [
        row('updates', 'Synthetic News', '/search', [['All news', '/search']]),
      ])
      await page.goto(`/posts/${postSlug}`)
      await expect(breadcrumb(page).locator('li')).toHaveText([
        'Home',
        'Synthetic News',
        'Synthetic navigation post',
      ])
      await expect(breadcrumb(page).getByRole('link', { name: 'Synthetic News' })).toHaveAttribute(
        'href',
        '/search',
      )
      await setHeader(request, synthetic)
    })

    test('places the section index before the content on narrow screens', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 800 })
      await page.goto(`/posts/${postSlug}`)
      const index = (await sectionIndex(page).boundingBox())!
      const content = (await page.locator('.site-section-content').boundingBox())!
      expect(index.y + index.height).toBeLessThanOrEqual(content.y + 1)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
    })

    test('keeps the post readable when the header has no section configuration', async ({
      page,
      request,
    }) => {
      await setHeader(request, [])
      await page.goto(`/posts/${postSlug}`)
      await expect(sectionIndex(page)).toHaveCount(0)
      await expect(breadcrumb(page)).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await setHeader(request, synthetic)
    })
  })
  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } })

    test('desktop navigation links are present and visible and the page is not hidden', async ({
      page,
    }) => {
      await page.goto('/posts')
      await expect(nav(page).locator('xpath=(.//ul)[1]/li/a')).toHaveText(labels)
      await expect(nav(page).getByRole('link', { name: 'Government', exact: true })).toBeVisible()
      await expect(page.locator('html')).toHaveCSS('opacity', '1')
      await nav(page).getByRole('link', { name: 'Latest Updates' }).click()
      await expect(page).toHaveURL(/\/posts$/)
    })

    test('native disclosures toggle and several groups may stay open', async ({ page }) => {
      await page.goto('/')
      await groupToggle(page, 'Government').click()
      await groupToggle(page, 'Transparency').click()
      await expect(nav(page).getByRole('link', { name: 'Offices' })).toBeVisible()
      await expect(nav(page).getByRole('link', { name: 'Financial Reports' })).toBeVisible()
    })
  })
})
