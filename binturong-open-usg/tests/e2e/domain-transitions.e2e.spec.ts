import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import {
  createAccessFixtures,
  fixturePassword,
  removeTestAccounts,
} from '../helpers/accessFixtures'
import { login } from '../helpers/login'

test.describe('native reviewed domain controls', () => {
  test.setTimeout(180000)
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  let id: number
  let officialID: number
  const name = `Synthetic browser review ${randomUUID()}`
  test.beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })
  test.beforeEach(async () => {
    officialID = 0
    const doc = await payload.create({
      collection: 'organizations',
      draft: true,
      overrideAccess: false,
      user: { ...fixtures.users.editor, collection: 'users' },
      data: { name, kind: 'usg' },
    })
    id = doc.id
  })
  test.afterEach(async () => {
    if (officialID) {
      await payload.db.deleteVersions({
        collection: 'issuances',
        where: { parent: { equals: officialID } },
      })
      await payload.db.deleteOne({ collection: 'issuances', where: { id: { equals: officialID } } })
    }
    if (id) {
      const jobs = await payload.find({
        collection: 'payload-jobs',
        where: {
          and: [
            { 'input.doc.value': { equals: String(id) } },
            { 'input.doc.relationTo': { equals: 'organizations' } },
          ],
        },
      })
      for (const job of jobs.docs) await payload.delete({ collection: 'payload-jobs', id: job.id })
      await payload.db.deleteVersions({
        collection: 'organizations',
        where: { parent: { equals: id } },
      })
      await payload.db.deleteOne({ collection: 'organizations', where: { id: { equals: id } } })
    }
  })
  test.afterAll(async () => {
    if (fixtures)
      await removeTestAccounts(
        payload,
        Object.values(fixtures.users).map(({ id }) => id),
      )
  })

  test('shows the reviewed candidate, rejects stale proof visibly and permits native draft resave', async ({
    page,
    request,
  }, testInfo) => {
    await login({
      page,
      user: { email: fixtures.users.publisher.email, password: fixturePassword },
    })
    await page.goto(`/admin/collections/organizations/${id}`)
    await expect(page.locator('#field-name')).toHaveValue(name)
    const original = await (await page.request.get(`/api/organizations/${id}/review`)).json()
    await page.getByRole('button', { name: 'Review saved revision', exact: true }).click()
    const content = page.getByTestId('domain-reviewed-content')
    await expect(content).toContainText(name)
    await expect(content).not.toContainText('versionHash')
    const newerName = 'Synthetic newer saved browser revision'
    expect(
      (
        await page.request.patch(`/api/organizations/${id}?draft=true`, {
          data: { name: newerName },
        })
      ).ok(),
    ).toBe(true)
    await page.getByRole('button', { name: 'Publish reviewed revision', exact: true }).click()
    await expect(page.locator('.domain-review').getByRole('alert')).toContainText(
      'reviewed revision changed',
    )
    expect((await request.get(`/api/organizations/${id}`)).status()).toBe(404)
    await expect(content).toContainText(name)
    await expect(content).not.toContainText(newerName)
    await page.getByRole('button', { name: 'Review latest saved revision', exact: true }).click()
    await expect(content).toContainText(newerName)
    await page.getByRole('button', { name: 'Publish reviewed revision', exact: true }).click()
    await expect
      .poll(async () => (await (await request.get(`/api/organizations/${id}`)).json()).name)
      .toBe(newerName)
    await expect(page.locator('#field-name')).toHaveValue(newerName)
    for (const suffix of ['first', 'second']) {
      await page
        .locator('#field-name')
        .fill(`Synthetic ordinary native draft after publication ${suffix}`)
      const saved = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/organizations/${id}`) &&
          response.request().method() === 'PATCH',
      )
      await page.locator('#action-save-draft').click()
      const savedResponse = await saved
      const serializedKeys = [
        ...new Set(
          Array.from(
            (savedResponse.request().postData() ?? '').matchAll(/"([a-zA-Z0-9_.]+)"\s*:/g),
            ([, key]) => key,
          ),
        ),
      ].sort()
      expect(savedResponse.status(), await savedResponse.text()).toBe(200)
      expect(serializedKeys).not.toContain('publishedAt')
      expect(serializedKeys).not.toContain('lastTransition')
      await expect(
        page.getByRole('button', { name: 'Review saved revision', exact: true }),
      ).toBeEnabled()
    }
    expect((await (await request.get(`/api/organizations/${id}`)).json()).name).toBe(newerName)
    await page.setViewportSize({ width: 390, height: 844 })
    const nativePageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    await page.getByRole('button', { name: 'Review saved revision', exact: true }).click()
    await expect(content).toContainText('Synthetic ordinary native draft after publication')
    await expect(
      page.getByRole('button', { name: 'Publish reviewed revision', exact: true }),
    ).toBeEnabled()
    const layout = await page
      .locator('.drawer--is-open .drawer__content-children')
      .evaluate((drawer) => ({
        overflow: drawer.scrollWidth - drawer.clientWidth,
        right: drawer.getBoundingClientRect().right,
        viewport: innerWidth,
        pageWidth: document.documentElement.scrollWidth,
      }))
    expect(layout.overflow, JSON.stringify(layout)).toBe(0)
    expect(layout.right).toBeLessThanOrEqual(layout.viewport)
    expect(
      layout.pageWidth,
      `Native page width before review: ${nativePageWidth}`,
    ).toBeLessThanOrEqual(nativePageWidth)
    await page.getByRole('button', { name: 'Publish reviewed revision', exact: true }).focus()
    await expect(
      page.getByRole('button', { name: 'Publish reviewed revision', exact: true }),
    ).toBeFocused()
    await page.screenshot({ path: testInfo.outputPath('domain-review-narrow.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await expect(content).not.toBeVisible()
    await page.getByRole('button', { name: 'Review saved revision', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Publish reviewed revision', exact: true }),
    ).toBeEnabled()
    expect(
      (
        await page.request.patch(`/api/organizations/${id}?draft=true`, {
          data: { name: 'Synthetic scheduling conflict revision' },
        })
      ).ok(),
    ).toBe(true)
    const future = new Date(Date.now() + 86400000)
    const localDate = new Date(future.getTime() - future.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    await page.getByLabel(/Publication date and time/).fill(localDate)
    await page.getByRole('button', { name: 'Schedule reviewed publication', exact: true }).click()
    await expect(page.locator('.domain-review').getByRole('alert')).toContainText(
      'reviewed revision changed',
    )
    await expect(page.locator('.domain-review')).not.toContainText('Reviewed change scheduled.')
    await page.getByRole('button', { name: 'Review latest saved revision', exact: true }).click()
    await expect(content).toContainText('Synthetic scheduling conflict revision')
    await expect(
      page.getByRole('button', { name: 'Schedule reviewed publication', exact: true }),
    ).toBeEnabled()
    await page.getByRole('button', { name: 'Schedule reviewed publication', exact: true }).click()
    await expect(page.locator('.domain-review')).toContainText('Reviewed change scheduled.')
    await page.getByRole('button', { name: 'Cancel scheduled change', exact: true }).click()
    await expect(page.locator('.domain-review')).toContainText('Scheduled change cancelled.')
    await expect(page.locator('.domain-review')).toContainText('No scheduled changes.')
    await page.getByLabel('Historical version', { exact: true }).click()
    await page
      .getByRole('option')
      .filter({ hasText: `(version ${original.reviewed.versionID})` })
      .click()
    await page.getByRole('button', { name: 'Review selected version', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Historical content to restore' })).toBeVisible()
    await expect(content).toContainText(name)
    await expect(content).not.toContainText('Synthetic scheduling conflict revision')
    await page.getByRole('button', { name: 'Restore reviewed revision', exact: true }).click()
    await expect
      .poll(async () => (await (await request.get(`/api/organizations/${id}`)).json()).name)
      .toBe(name)
  })

  test('allows editor review and displays complete official publication errors', async ({
    page,
    request,
  }) => {
    await login({ page, user: { email: fixtures.users.editor.email, password: fixturePassword } })
    await page.goto(`/admin/collections/organizations/${id}`)
    await page.getByRole('button', { name: 'Review saved revision', exact: true }).click()
    await expect(page.getByTestId('domain-reviewed-content')).toContainText(name)
    await expect(page.locator('.domain-review')).toContainText('A publisher can publish')
    await expect(
      page.getByRole('button', { name: 'Publish reviewed revision', exact: true }),
    ).toHaveCount(0)
    const headers = { Authorization: `JWT ${fixtures.tokens.publisher}` }
    const review = await (await request.get(`/api/organizations/${id}/review`, { headers })).json()
    expect(
      (
        await request.post(`/api/organizations/${id}/transition`, {
          headers,
          data: { action: 'publish', expected: review.expected },
        })
      ).ok(),
    ).toBe(true)
    const official = await payload.create({
      collection: 'issuances',
      draft: true,
      overrideAccess: false,
      user: { ...fixtures.users.editor, collection: 'users' },
      data: { title: 'Synthetic official browser validation', type: 'advisory', organization: id },
    })
    officialID = official.id
    await page.context().clearCookies()
    await login({
      page,
      user: { email: fixtures.users.publisher.email, password: fixturePassword },
    })
    await page.goto(`/admin/collections/issuances/${officialID}`)
    await page.getByRole('button', { name: 'Review saved revision', exact: true }).click()
    await expect(page.getByTestId('domain-reviewed-content')).toContainText(official.title!)
    await expect(
      page.getByRole('button', { name: 'Publish reviewed revision', exact: true }),
    ).toBeEnabled()
    await page.getByRole('button', { name: 'Publish reviewed revision', exact: true }).click()
    await expect(page.locator('.domain-review').getByRole('alert')).toContainText(/Main document/i)
    await expect(page.locator('.domain-review').getByRole('alert')).toBeFocused()
    expect((await request.get(`/api/issuances/${officialID}`)).status()).toBe(404)
  })
})
