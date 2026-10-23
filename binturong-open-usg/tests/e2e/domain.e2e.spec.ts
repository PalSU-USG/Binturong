import { randomUUID } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import type { DomainCollection } from '../../src/collections/shared/domainCollections'
import {
  createAccessFixtures,
  fixturePassword,
  removeTestAccounts,
} from '../helpers/accessFixtures'
import { login } from '../helpers/login'

test.describe('domain editorial workflow', () => {
  test.setTimeout(240000)
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const records: { collection: DomainCollection; id: number; field: string; value: string }[] = []
  const suffix = randomUUID()

  test.beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
    const user = { ...fixtures.users.editor, collection: 'users' as const }
    async function draft(
      collection: DomainCollection,
      field: string,
      data: Record<string, unknown>,
    ) {
      const value = `Synthetic ${collection} ${suffix}`
      const doc = await payload.create({
        collection,
        draft: true,
        overrideAccess: false,
        user,
        data: { ...data, [field]: value },
      })
      records.push({ collection, id: doc.id, field, value: `${value} edited` })
      return doc.id
    }
    const organization = await draft('organizations', 'name', { kind: 'usg' })
    const academicYear = await draft('academic-years', 'label', {})
    const office = await draft('offices', 'name', { organization })
    await draft('people', 'name', { terms: [{ office, academicYear }] })
    await draft('activities', 'title', {
      organization,
      academicYear,
      eventDate: '2026-10-23',
      location: 'Synthetic location',
    })
    await draft('issuances', 'title', { organization, issuingOffice: office, type: 'advisory' })
    await draft('reports', 'title', {
      organization,
      responsibleOffices: [office],
      type: 'financial',
    })
  })

  test.afterAll(async () => {
    for (const { collection, id } of [...records].reverse()) {
      await payload.db.deleteVersions({ collection, where: { parent: { equals: id } } })
      await payload.db.deleteOne({ collection, where: { id: { equals: id } } })
    }
    if (fixtures)
      await removeTestAccounts(
        payload,
        Object.values(fixtures.users).map(({ id }) => id),
      )
  })

  async function signIn(page: Page, role: 'editor' | 'publisher') {
    await page.context().clearCookies()
    await login({ page, user: { email: fixtures.users[role].email, password: fixturePassword } })
  }

  async function openRecord(page: Page, collection: DomainCollection, id: number) {
    await page.goto(`/admin/collections/${collection}/${id}`)
    const review = page.getByRole('button', { name: 'Review saved revision', exact: true })
    const takeover = page.getByRole('button', { name: 'Take over', exact: true })
    await expect
      .poll(async () => (await review.isEnabled()) || (await takeover.isVisible()))
      .toBe(true)
    if (await takeover.isVisible()) await takeover.click()
    await expect(review).toBeEnabled({ timeout: 15000 })
  }

  test('saves every domain draft as editor and reviews metadata as publisher with public revision isolation', async ({
    page,
    request,
  }, testInfo) => {
    await signIn(page, 'editor')
    for (const { collection, id, field, value } of records) {
      await test.step(`editor saves ${collection} draft through the native form`, async () => {
        await openRecord(page, collection, id)
        await page.locator(`#field-${field}`).fill(value)
        const saved = page.waitForResponse(
          (response) =>
            response.url().includes(`/api/${collection}/${id}`) &&
            response.request().method() === 'PATCH',
        )
        await page.locator('#action-save-draft').click()
        const response = await saved
        expect(response.status(), await response.text()).toBe(200)
        const persisted = await (
          await page.request.get(`/api/${collection}/${id}?draft=true&depth=0`)
        ).json()
        expect(persisted[field]).toBe(value)
        expect(persisted._status).toBe('draft')
        expect((await request.get(`/api/${collection}/${id}`)).status()).toBe(404)
        await page.getByRole('button', { name: 'Review saved revision', exact: true }).click()
        await expect(page.getByTestId('domain-reviewed-content')).toContainText(value)
        await expect(
          page.getByRole('button', { name: 'Publish reviewed revision', exact: true }),
        ).toHaveCount(0)
        const review = await (await page.request.get(`/api/${collection}/${id}/review`)).json()
        const denied = await page.request.post(`/api/${collection}/${id}/transition`, {
          data: { action: 'publish', expected: review.expected },
        })
        expect(denied.status()).toBe(403)
        expect((await request.get(`/api/${collection}/${id}`)).status()).toBe(404)
        await page.keyboard.press('Escape')
      })
    }

    await signIn(page, 'publisher')
    for (const { collection, id, field, value } of records.slice(0, 5)) {
      await test.step(`publisher reviews and publishes ${collection}`, async () => {
        await openRecord(page, collection, id)
        const reviewButton = page.getByRole('button', {
          name: 'Review saved revision',
          exact: true,
        })
        await expect(reviewButton).toBeEnabled()
        await reviewButton.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByTestId('domain-reviewed-content')).toContainText(value)
        const publish = page.getByRole('button', { name: 'Publish reviewed revision', exact: true })
        await expect(publish).toBeEnabled({ timeout: 15000 })
        await publish.focus()
        await expect(publish).toBeFocused()
        await page.keyboard.press('Enter')
        await expect
          .poll(async () => {
            const response = await request.get(`/api/${collection}/${id}?depth=2`)
            return response.ok() ? (await response.json())[field] : undefined
          })
          .toBe(value)
        const publicDoc = await (await request.get(`/api/${collection}/${id}?depth=2`)).json()
        expect(publicDoc._status).toBe('published')
        expect(publicDoc.publishedAt).toBeTruthy()
        expect(JSON.stringify(publicDoc)).not.toContain('actorID')
        expect(JSON.stringify(publicDoc)).not.toContain(fixtures.users.publisher.email)
      })
    }

    const activity = records.find(({ collection }) => collection === 'activities')!
    await signIn(page, 'editor')
    await openRecord(page, 'activities', activity.id)
    await page.locator('#field-title').fill('Synthetic private later activity draft')
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/activities/${activity.id}`) &&
        response.request().method() === 'PATCH',
    )
    await page.locator('#action-save-draft').click()
    expect((await saved).status()).toBe(200)
    expect(
      (await (await page.request.get(`/api/activities/${activity.id}?draft=true`)).json()).title,
    ).toBe('Synthetic private later activity draft')
    const published = await (await request.get(`/api/activities/${activity.id}`)).json()
    expect(published.title).toBe(activity.value)
    expect(published.organization.name).toBe(records[0].value)
    expect(published.academicYear.label).toBe(records[1].value)
    await page.setViewportSize({ width: 390, height: 844 })
    const widthBefore = await page.evaluate(() => document.documentElement.scrollWidth)
    await page.getByRole('button', { name: 'Review saved revision', exact: true }).click()
    await expect(page.getByTestId('domain-reviewed-content')).toContainText(
      'Synthetic private later activity draft',
    )
    const drawer = page.locator('.drawer--is-open .drawer__content-children')
    await expect
      .poll(async () =>
        drawer.evaluate(
          (element, originalWidth) => ({
            overflow: element.scrollWidth - element.clientWidth,
            outsideViewport: Math.max(0, element.getBoundingClientRect().right - innerWidth),
            addedPageWidth: Math.max(0, document.documentElement.scrollWidth - originalWidth),
          }),
          widthBefore,
        ),
      )
      .toEqual({ overflow: 0, outsideViewport: 0, addedPageWidth: 0 })
    await page.screenshot({ path: testInfo.outputPath('domain-editor-narrow.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await expect(drawer).not.toBeVisible()

    await signIn(page, 'publisher')
    for (const { collection, id, value } of records.slice(5)) {
      await test.step(`${collection} shows field errors and keeps official content private`, async () => {
        await openRecord(page, collection, id)
        await page.getByRole('button', { name: 'Review saved revision', exact: true }).click()
        await expect(page.getByTestId('domain-reviewed-content')).toContainText(value)
        await page.getByRole('button', { name: 'Publish reviewed revision', exact: true }).click()
        const error = page.locator('.domain-review').getByRole('alert')
        await expect(error).toContainText(/Main document/i)
        if (collection === 'reports') await expect(error).toContainText(/Reporting period/i)
        await expect(error).toBeFocused()
        expect((await request.get(`/api/${collection}/${id}`)).status()).toBe(404)
        await page.keyboard.press('Escape')
      })
    }
    await page.goto('/admin/collections/documents')
    await expect(page.getByRole('link', { name: /Create New/i })).toHaveCount(0)
    await expect(page.locator('input[type=file]')).toHaveCount(0)
    const denied = await page.request.post('/api/documents', {
      data: { title: 'Synthetic denied upload', organization: records[0].id },
    })
    expect(denied.status()).toBe(403)
    const publicFiles = await request.get('/api/documents')
    expect([401, 403]).toContain(publicFiles.status())
  })
})
