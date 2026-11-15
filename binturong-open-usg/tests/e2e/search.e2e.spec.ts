import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import { syntheticContent } from '../helpers/contentFixtures'

test.describe('public search', () => {
  let payload: Payload
  const tag = randomUUID().replaceAll('-', '').slice(0, 10)
  const title = `Searchable${tag} update`
  let postID: number

  test.beforeAll(async () => {
    payload = await getPayload({ config })
    const post = await payload.create({
      collection: 'posts',
      data: { title, slug: `searchable-${tag}`, content: syntheticContent, _status: 'published' },
      context: { disableRevalidate: true },
    })
    postID = post.id
  })
  test.afterAll(async () => {
    if (postID)
      await payload.delete({
        collection: 'posts',
        where: { id: { equals: postID } },
        context: { disableRevalidate: true },
      })
  })

  test('shows the prompt for an empty or one-character query and lists nothing', async ({
    page,
  }) => {
    for (const url of ['/search', '/search?q=', '/search?q=a']) {
      await page.goto(url)
      await expect(page.getByText('Enter at least two characters')).toBeVisible()
      await expect(page.locator('ol.site-destinations')).toHaveCount(0)
    }
  })

  test('finds a published update and links to its page', async ({ page }) => {
    await page.goto(`/search?q=searchable${tag}`)
    const link = page.getByRole('link', { name: title })
    await expect(link).toHaveAttribute('href', `/posts/searchable-${tag}`)
    await expect(page.getByText('Recent')).toBeVisible()
  })

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })
    test('submits the plain GET form', async ({ page }) => {
      await page.goto('/search')
      await page.getByRole('searchbox').fill(`searchable${tag}`)
      await page.getByRole('button', { name: 'Search' }).click()
      await expect(page).toHaveURL(new RegExp(`/search\\?q=searchable${tag}$`))
      await expect(page.getByRole('link', { name: title })).toBeVisible()
    })
  })

  test('encodes special characters, renders them as text and adds no history per keystroke', async ({
    page,
  }) => {
    const hostile = '<script>window.xss=1</script> a&b #c 50%'
    await page.goto('/search')
    const historyBefore = await page.evaluate(() => history.length)
    await page.getByRole('searchbox').pressSequentially('abcd', { delay: 400 })
    expect(await page.evaluate(() => history.length)).toBe(historyBefore)
    await page.getByRole('searchbox').fill(hostile)
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page).toHaveURL(/\/search\?q=/)
    const url = new URL(page.url())
    expect(url.searchParams.get('q')).toBe(hostile)
    await expect(page.getByText('No results for')).toBeVisible()
    await expect(page.getByRole('searchbox')).toHaveValue('<script>window.xss=1</script> a&b #c 50')
    expect(await page.evaluate(() => (window as unknown as { xss?: number }).xss)).toBeUndefined()
    await expect(page.locator('script', { hasText: 'xss' })).toHaveCount(0)
  })

  test('shows no results for an unmatched query and keeps it distinct from an error', async ({
    page,
  }) => {
    await page.goto(`/search?q=nomatch${tag}`)
    await expect(page.getByText(`No results for “nomatch${tag}”`)).toBeVisible()
    await expect(page.getByText('Search is unavailable')).toHaveCount(0)
  })

  test('has an accessible search form and works at a narrow width with keyboard focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto('/search')
    await expect(page.getByRole('search')).toBeVisible()
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(['A', 'BUTTON', 'INPUT']).toContain(focused)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  })
})
