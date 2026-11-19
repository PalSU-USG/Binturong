import { test, expect } from '@playwright/test'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import { createRecordSectionFixtures } from '../helpers/recordFixtures'

test.describe('record pages and sections', () => {
  let payload: Payload
  let fx: ReturnType<typeof createRecordSectionFixtures>
  let year: { id: number; slug: string; label: string }
  let emptyYear: { slug: string }
  const ids: Record<string, string> = {}
  let issuanceID = 0
  let fileID = 0

  test.beforeAll(async () => {
    payload = await getPayload({ config })
    fx = createRecordSectionFixtures(payload)
    const usg = await fx.org({ name: `USG ${fx.tag}` })
    year = await fx.year({ label: `AY ${fx.tag}` })
    emptyYear = await fx.year({ label: `Empty ${fx.tag}` })
    const office = await fx.office({
      organization: usg.id,
      name: `Office ${fx.tag}`,
      branch: 'executive',
    })
    fileID = await fx.file(usg.id, { filename: 'official.pdf', size: 1_887_437 })
    const related = await fx.report({
      organization: usg.id,
      mainDocument: fileID,
      academicYear: year.id,
      title: `Related ${fx.tag}`,
    })
    const issuance = await fx.issuance({
      organization: usg.id,
      mainDocument: fileID,
      academicYear: year.id,
      issuingOffice: office.id,
      title: `Issuance ${fx.tag}`,
      identifier: `EO No. ${fx.tag}`,
      summary: 'A plain summary.',
      related: [{ relationTo: 'reports', value: related.id }],
    })
    issuanceID = issuance.id
    ids.issuance = issuance.slug
    ids.draft = (
      await fx.issuance({
        organization: usg.id,
        mainDocument: fileID,
        academicYear: year.id,
        title: `Secret draft ${fx.tag}`,
        status: 'draft',
      })
    ).slug
    ids.office = office.slug
    const senate = await fx.office({
      organization: usg.id,
      name: `Senate ${fx.tag}`,
      branch: 'legislative',
    })
    for (const [title, type, status] of [
      [`Senate resolution ${fx.tag}`, 'resolution', 'published'],
      [`Senate memorandum ${fx.tag}`, 'memorandum', 'published'],
      [`Draft resolution ${fx.tag}`, 'resolution', 'draft'],
    ] as const)
      await fx.issuance({
        organization: usg.id,
        mainDocument: fileID,
        academicYear: year.id,
        issuingOffice: senate.id,
        title,
        type,
        status,
      })
    await fx.report({
      organization: usg.id,
      mainDocument: fileID,
      academicYear: year.id,
      title: `Financial ${fx.tag}`,
      type: 'financial',
    })
    const activity = await fx.activity({
      organization: usg.id,
      academicYear: year.id,
      eventDate: new Date().toISOString(),
      title: `Activity ${fx.tag}`,
      location: 'Main hall',
    })
    ids.activity = activity.slug
    await fx.person({
      name: `Holder ${fx.tag}`,
      terms: [{ office: office.id, startDate: '2020-01-01T12:00:00.000Z' }],
    })
  })
  test.afterAll(async () => {
    await fx?.cleanup()
  })

  test('an issuance page shows metadata, one controlled PDF link and published related records only', async ({
    page,
  }) => {
    const response = await page.goto(`/issuances/${ids.issuance}`)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: `Issuance ${fx.tag}` })).toBeVisible()
    await expect(page.getByRole('link', { name: /Download PDF \(1\.8 MB\)/ })).toHaveAttribute(
      'href',
      `/api/documents/${fileID}/file`,
    )
    await expect(page.getByText('A plain summary.')).toBeVisible()
    await expect(page.getByRole('link', { name: `Related ${fx.tag}` })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible()
    expect(await page.content()).not.toContain('ready/')
  })

  test('a draft or unknown record is a 404 that never names it', async ({ page }) => {
    for (const slug of [ids.draft, 'no-such-record']) {
      const response = await page.goto(`/issuances/${slug}`)
      expect(response?.status()).toBe(404)
      const text = await page.locator('body').innerText()
      expect(text).not.toContain(`Secret draft ${fx.tag}`)
      expect(text).not.toContain(slug!)
    }
  })

  test('withdrawing a record removes it from its page and lists immediately', async ({ page }) => {
    await payload.db.updateOne({
      collection: 'issuances',
      where: { id: { equals: issuanceID } },
      data: { _status: 'draft' },
    })
    expect((await page.goto(`/issuances/${ids.issuance}`))?.status()).toBe(404)
    await page.goto(`/archives?year=${year.slug}`)
    await expect(page.getByText(`Issuance ${fx.tag}`)).toHaveCount(0)
    await payload.db.updateOne({
      collection: 'issuances',
      where: { id: { equals: issuanceID } },
      data: { _status: 'published' },
    })
    expect((await page.goto(`/issuances/${ids.issuance}`))?.status()).toBe(200)
  })

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })
    test('archives filter through a plain form and show empty and notice states', async ({
      page,
    }) => {
      await page.goto('/archives')
      await page.getByLabel('Academic year').selectOption(year.slug)
      await page.getByRole('button', { name: 'Apply filters' }).click()
      await expect(page).toHaveURL(new RegExp(`year=${year.slug}`))
      await expect(
        page.getByRole('link', { name: `Issuance ${fx.tag}`, exact: true }),
      ).toBeVisible()
      await expect(page.getByText(`Secret draft ${fx.tag}`)).toHaveCount(0)
      await page.goto(`/archives?year=${emptyYear.slug}`)
      await expect(page.getByText('No published records match these filters.')).toBeVisible()
      await page.getByRole('link', { name: 'Clear filters' }).click()
      await expect(page).toHaveURL(/\/archives$/)
      await page.goto('/archives?year=no-such-year&page=abc&type=nope')
      await expect(page.getByText('Academic year not found; showing all years.')).toBeVisible()
      await expect(page.getByText('That page number is not valid')).toBeVisible()
    })
  })

  test('branch, transparency, government and activity pages render synthetic data', async ({
    page,
  }) => {
    await page.goto(`/archives/executive?year=${year.slug}`)
    await expect(page.getByRole('link', { name: `Issuance ${fx.tag}`, exact: true })).toBeVisible()
    expect((await page.goto('/archives/not-a-group'))?.status()).toBe(404)
    await page.goto('/transparency')
    await expect(page.getByRole('heading', { level: 1, name: 'Transparency' })).toBeVisible()
    await expect(page.getByRole('link', { name: /View all financial reports/ })).toBeVisible()
    await page.goto(`/transparency/financial-reports?year=${year.slug}`)
    await expect(page.getByRole('link', { name: `Financial ${fx.tag}`, exact: true })).toBeVisible()
    await page.goto('/government/organizational-chart')
    await expect(page.getByRole('link', { name: `Office ${fx.tag}` })).toBeVisible()
    await page.goto(`/government/offices/${ids.office}`)
    await expect(page.getByText(`Holder ${fx.tag}`)).toBeVisible()
    await expect(page.getByText('(current)')).toBeVisible()
    await page.goto(`/activities?year=${year.slug}`)
    await page
      .getByRole('link', { name: `Activity ${fx.tag}`, exact: true })
      .first()
      .click()
    await expect(page.getByText('Main hall')).toBeVisible()
    await page.goto('/government/participating-csgs')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('the legislative resolutions page lists published resolutions only', async ({ page }) => {
    const response = await page.goto(
      `/archives/legislative/resolutions?year=${year.slug}&type=memorandum`,
    )
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Resolutions' })).toBeVisible()
    await expect(
      page.getByRole('link', { name: `Senate resolution ${fx.tag}`, exact: true }),
    ).toBeVisible()
    await expect(page.getByText(`Senate memorandum ${fx.tag}`)).toHaveCount(0)
    await expect(page.getByText(`Draft resolution ${fx.tag}`)).toHaveCount(0)
    // An executive resolution belongs to its own branch, not this page.
    await expect(page.getByText(`Issuance ${fx.tag}`, { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Type')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Legislative' }).first()).toHaveAttribute(
      'href',
      '/archives/legislative',
    )
    for (const group of ['executive', 'judicial', 'not-a-group'])
      expect((await page.goto(`/archives/${group}/resolutions`))?.status(), group).toBe(404)
  })

  test('lists have no horizontal scroll at 320 px and work by keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    for (const url of [
      `/archives?year=${year.slug}`,
      `/archives/legislative/resolutions?year=${year.slug}`,
      `/issuances/${ids.issuance}`,
      '/transparency',
      '/government/organizational-chart',
    ]) {
      await page.goto(url)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, url).toBeLessThanOrEqual(0)
    }
    await page.goto(`/archives?year=${year.slug}`)
    await page.getByLabel('Academic year').focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
  })
})
