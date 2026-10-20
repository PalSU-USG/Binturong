import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import {
  createAccessFixtures,
  fixturePassword,
  removeTestAccounts,
} from '../helpers/accessFixtures'
import { syntheticContent } from '../helpers/contentFixtures'
import { login } from '../helpers/login'

test.describe('CMS permission boundaries', () => {
  test.setTimeout(180000)
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  let postID: number
  const slug = `synthetic-${randomUUID()}`
  const originalTitle = `Synthetic public ${randomUUID()}`

  test.beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
    const post = await payload.create({
      collection: 'posts',
      context: { disableRevalidate: true },
      data: { title: originalTitle, slug, content: syntheticContent, _status: 'published' },
    })
    postID = post.id
  })
  test.afterAll(async () => {
    if (postID)
      await payload.delete({
        collection: 'posts',
        id: postID,
        context: { disableRevalidate: true },
      })
    if (fixtures)
      await removeTestAccounts(
        payload,
        Object.values(fixtures.users).map(({ id }) => id),
      )
  })

  test('editor saves a private draft and publisher publishes through the admin UI', async ({
    browser,
    request,
  }, testInfo) => {
    const editor = await browser.newContext()
    const publisher = await browser.newContext()
    try {
      const page = await editor.newPage()
      await login({ page, user: { email: fixtures.users.editor.email, password: fixturePassword } })
      await expect(page.getByText('Seed your database')).toHaveCount(0)
      await page.goto(`/admin/collections/posts/${postID}`)
      const title = page.locator('#field-title')
      await expect(title).toHaveValue(originalTitle)
      await title.click()
      await expect(title).toBeFocused()
      const saved = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/posts/${postID}`) &&
          response.url().includes('draft=true') &&
          response.request().method() === 'PATCH',
      )
      await title.fill('Synthetic reviewed browser draft')
      await page.keyboard.press('Tab')
      await expect(title).not.toBeFocused()
      expect((await saved).ok()).toBe(true)
      expect((await (await request.get(`/api/posts/${postID}`)).json()).title).toBe(originalTitle)
      const denied = await page.request.patch(`/api/posts/${postID}`, {
        data: { _status: 'published' },
      })
      expect(denied.status()).toBe(403)

      const publishPage = await publisher.newPage()
      await login({
        page: publishPage,
        user: { email: fixtures.users.publisher.email, password: fixturePassword },
      })
      await publishPage.goto(`/admin/collections/posts/${postID}`)
      await expect(publishPage.locator('#field-title')).toHaveValue(
        'Synthetic reviewed browser draft',
      )
      const published = publishPage.waitForResponse(
        (response) =>
          response.url().includes(`/api/posts/${postID}`) &&
          response.request().method() === 'PATCH',
      )
      await publishPage.locator('#action-save').click()
      expect((await published).ok()).toBe(true)
      expect((await (await request.get(`/api/posts/${postID}`)).json()).title).toBe(
        'Synthetic reviewed browser draft',
      )
      const publicPage = await browser.newPage()
      await publicPage.goto(`/posts/${slug}`)
      await expect(publicPage.locator('h1')).toHaveText('Synthetic reviewed browser draft')
      await publicPage.screenshot({
        path: testInfo.outputPath('published-desktop.png'),
        fullPage: true,
      })
      await publicPage.setViewportSize({ width: 390, height: 844 })
      await publicPage.reload()
      await expect(publicPage.locator('h1')).toBeVisible()
      expect(
        await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true)
      await publicPage.screenshot({
        path: testInfo.outputPath('published-mobile.png'),
        fullPage: true,
      })
      await publicPage.close()
    } finally {
      await editor.close()
      await publisher.close()
    }
  })

  test('admin cannot read or edit a super-admin account', async ({ browser }) => {
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await login({ page, user: { email: fixtures.users.admin.email, password: fixturePassword } })
      expect((await page.request.get(`/api/users/${fixtures.users.super_admin.id}`)).status()).toBe(
        404,
      )
      expect(
        (
          await page.request.patch(`/api/users/${fixtures.users.super_admin.id}`, {
            data: { name: 'Synthetic forbidden edit' },
          })
        ).status(),
      ).toBe(403)
      const deniedPage = await page.goto(
        `/admin/collections/users/${fixtures.users.super_admin.id}`,
      )
      expect(deniedPage?.status()).toBeLessThan(500)
      await expect(page.locator('h1')).toBeVisible()
      await expect(page.locator('#field-email')).toHaveCount(0)
      await expect(page.locator('body')).not.toContainText(fixtures.users.super_admin.email)
    } finally {
      await context.close()
    }
  })

  test('disabling an account revokes its already logged-in browser session', async ({
    browser,
  }) => {
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await login({ page, user: { email: fixtures.users.editor.email, password: fixturePassword } })
      expect((await (await page.request.get('/api/users/me')).json()).user.id).toBe(
        fixtures.users.editor.id,
      )
      await payload.update({
        collection: 'users',
        id: fixtures.users.editor.id,
        data: { disabled: true },
        user: { ...fixtures.users.super_admin, collection: 'users' },
        overrideAccess: false,
      })
      expect((await (await page.request.get('/api/users/me')).json()).user).toBeNull()
      expect(
        (
          await page.request.patch(`/api/posts/${postID}?draft=true`, {
            data: { title: 'Synthetic revoked edit' },
          })
        ).status(),
      ).toBe(403)
      await page.goto('/admin')
      await expect(page).toHaveURL(/\/admin\/login/)
    } finally {
      await context.close()
    }
  })
})
