import { randomUUID } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  createAccessFixtures,
  fixturePassword,
  removeTestAccounts,
} from '../helpers/accessFixtures'
import { login } from '../helpers/login'
import { syntheticContent } from '../helpers/contentFixtures'

test.describe('admin usability', () => {
  test.setTimeout(180000)
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const title = `Synthetic notice ${randomUUID().slice(0, 8)}`

  test.beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
    // The publisher list shows only the five oldest drafts per kind, so start from a clean set.
    const stale = await payload.find({
      collection: 'posts',
      draft: true,
      where: { _status: { equals: 'draft' } },
      limit: 500,
      depth: 0,
    })
    for (const { id } of stale.docs)
      await payload.delete({ collection: 'posts', id, context: { disableRevalidate: true } })
    // Leftover synthetic drafts of other kinds would also crowd the oldest-first list.
    for (const collection of ['people', 'activities', 'offices', 'organizations'] as const) {
      await payload.db.deleteMany({ collection, where: { _status: { equals: 'draft' } } })
      await payload.db.deleteVersions({ collection, where: { parent: { exists: false } } })
    }
  })
  test.afterAll(async () => {
    const leftovers = await payload.find({
      collection: 'posts',
      draft: true,
      where: { title: { like: 'Synthetic notice' } },
      limit: 100,
      depth: 0,
    })
    for (const { id } of leftovers.docs)
      await payload.delete({ collection: 'posts', id, context: { disableRevalidate: true } })
    if (fixtures)
      await removeTestAccounts(
        payload,
        Object.values(fixtures.users).map(({ id }) => id),
      )
  })

  async function as(browser: import('@playwright/test').Browser, role: 'editor' | 'publisher') {
    const context = await browser.newContext()
    const page = await context.newPage()
    await login({ page, user: { email: fixtures.users[role].email, password: fixturePassword } })
    return { page, context }
  }
  const nav = (page: Page) => page.getByRole('navigation')

  test('editor sees task cards, plain menu groups and only Save draft', async ({ browser }) => {
    const { page, context } = await as(browser, 'editor')
    try {
      await expect(page.getByRole('heading', { name: 'What do you want to do?' })).toBeVisible()
      for (const name of [
        'Post a notice',
        'Add an issuance',
        'Upload a report',
        'Add a person or office',
      ])
        await expect(page.getByRole('link', { name })).toBeVisible()
      await expect(page.getByRole('link', { name: /Edit the menu/ })).toHaveCount(0)
      await expect(page.getByRole('link', { name: /waiting for me/ })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Waiting for a publisher' })).toHaveCount(0)

      for (const group of ['Publish', 'Records', 'People & Offices', 'Site'])
        await expect(nav(page).getByText(group, { exact: true }).first()).toBeVisible()
      for (const group of ['Accounts', 'Advanced'])
        await expect(nav(page).getByText(group, { exact: true })).toHaveCount(0)
      await expect(nav(page).getByRole('link', { name: 'Top menu' })).toHaveCount(0)

      await page.getByRole('link', { name: /Post a notice/ }).click()
      await expect(page.locator('#field-title')).toBeVisible()
      await expect(
        page.getByText('You can save drafts. A publisher will review and publish this.'),
      ).toBeVisible()
      await expect(
        page.getByText('A publisher will review and publish this.', { exact: true }),
      ).toBeVisible()
      await expect(page.getByRole('button', { name: /Publish/ })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /Schedule/ })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible()

      // Opening the form must not create a record; autosave used to leave "Untitled" drafts.
      await page.waitForTimeout(1500)
      await expect(page).toHaveURL(/\/admin\/collections\/posts\/create/)
      await page.locator('#field-title').fill(title)
      const saved = page.waitForResponse(
        (response) =>
          response.url().includes('/api/posts') &&
          response.request().method() !== 'GET' &&
          response.ok(),
      )
      await page.getByRole('button', { name: 'Save draft' }).click()
      await saved
      await expect(page).toHaveURL(/\/admin\/collections\/posts\/\d+/)

      await page.goto('/admin')
      await expect(
        page
          .getByRole('region', { name: 'Your drafts' })
          .getByRole('link', { name: new RegExp(title) }),
      ).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('publisher sees the waiting list, the menu task and the Publish control', async ({
    browser,
  }) => {
    const { page, context } = await as(browser, 'publisher')
    try {
      const waiting = page.getByRole('region', { name: 'Waiting for a publisher' })
      await expect(waiting.getByRole('link', { name: new RegExp(title) })).toBeVisible()
      await expect(page.getByRole('link', { name: /Edit the menu/ })).toBeVisible()
      await expect(nav(page).getByText('Accounts', { exact: true })).toHaveCount(0)
      await waiting.getByRole('link', { name: new RegExp(title) }).click()
      await expect(page.getByRole('button', { name: 'Publish changes' })).toBeVisible()
      await expect(page.getByText('You can save drafts and make them live.')).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('the how-to page is readable and keyboard reachable', async ({ browser }) => {
    const anonContext = await browser.newContext()
    try {
      const anonPage = await anonContext.newPage()
      await anonPage.goto('/admin/how-to')
      await expect(anonPage).toHaveURL(/\/admin\/login/)
    } finally {
      await anonContext.close()
    }
    const { page, context } = await as(browser, 'editor')
    try {
      await page.getByRole('link', { name: /How do I/ }).focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/admin\/how-to/)
      await expect(page.getByRole('heading', { name: 'Upload a PDF' })).toBeVisible()
      await expect(nav(page).getByText('Publish', { exact: true }).first()).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('a hidden menu entry is not an authority boundary', async ({ browser }) => {
    const { page, context } = await as(browser, 'editor')
    try {
      // Hidden from the menu, and still refused by the server.
      const refused = await page.request.post('/api/redirects', {
        data: { from: '/a', to: { type: 'custom', url: '/b' } },
      })
      expect(refused.status()).toBe(403)
      const form = await page.request.post('/api/forms', { data: { title: 'Synthetic form' } })
      expect(form.status()).toBe(403)
      const submissions = await page.request.get('/api/form-submissions')
      expect(submissions.status()).toBe(403)
    } finally {
      await context.close()
    }
  })

  test('admin home has no horizontal scroll at 360px', async ({ browser }) => {
    const { page, context } = await as(browser, 'publisher')
    try {
      await page.setViewportSize({ width: 360, height: 740 })
      await page.goto('/admin')
      await expect(page.getByRole('heading', { name: 'What do you want to do?' })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    } finally {
      await context.close()
    }
  })

  test('list state links open filtered lists whose size matches the count', async ({ browser }) => {
    const unique = `${title} state`
    for (const published of [false, true])
      await payload.create({
        collection: 'posts',
        draft: !published,
        context: { disableRevalidate: true },
        data: {
          title: `${unique} ${published ? 'live' : 'draft'}`,
          slug: `synthetic-${randomUUID()}`,
          content: syntheticContent,
          _status: published ? 'published' : 'draft',
        },
      })
    const { page, context } = await as(browser, 'editor')
    try {
      await page.goto('/admin/collections/posts')
      // Payload adds `limit` to the URL once the list has hydrated; links clicked before that are lost.
      await expect(page).toHaveURL(/limit=/)
      const states = page.getByRole('navigation', { name: 'Show by state' })
      await expect(states.getByRole('link', { name: /^All \(\d+\)$/ })).toHaveAttribute(
        'aria-current',
        'page',
      )
      for (const [label, status, shown, hidden] of [
        ['Not live yet', 'draft', 'draft', 'live'],
        ['Live', 'published', 'live', 'draft'],
      ] as const) {
        const link = states.getByRole('link', { name: new RegExp(`^${label} \\(\\d+\\)$`) })
        const count = Number((await link.textContent())?.match(/\((\d+)\)/)?.[1])
        await link.click()
        await expect(page).toHaveURL(new RegExp(`=${status}&.*limit=`))
        await expect(states.getByRole('link', { name: new RegExp(`^${label} `) })).toHaveAttribute(
          'aria-current',
          'page',
        )
        await expect(page.getByRole('link', { name: `${unique} ${shown}` })).toBeVisible()
        await expect(page.getByRole('link', { name: `${unique} ${hidden}` })).toHaveCount(0)
        await expect(page.locator('tbody tr')).toHaveCount(Math.min(count, 10))
      }
    } finally {
      await context.close()
    }
  })
})
