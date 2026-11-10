import { test, expect } from '@playwright/test'
import { getPayload } from 'payload'
import config from '../../src/payload.config'
import { assertTestDatabase } from '../helpers/assertTestDatabase'
import { createRecordSectionFixtures } from '../helpers/recordFixtures'

test('a withdrawn record disappears from its page and lists at once in the production build', async ({
  page,
}) => {
  assertTestDatabase(process.env.DATABASE_URL)
  const payload = await getPayload({ config })
  const fx = createRecordSectionFixtures(payload)
  try {
    const org = await fx.org()
    const year = await fx.year()
    const file = await fx.file(org.id)
    const record = await fx.report({
      organization: org.id,
      mainDocument: file,
      academicYear: year.id,
      title: `Synthetic cache record ${fx.tag}`,
    })
    const list = `/transparency/financial-reports?year=${year.slug}`
    for (const path of [`/reports/${record.slug}`, list]) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      expect(await page.locator('body').innerText()).toContain(record.title)
    }
    await payload.db.updateOne({
      collection: 'reports',
      where: { id: { equals: record.id } },
      data: { _status: 'draft' },
    })
    expect((await page.goto(`/reports/${record.slug}`))?.status()).toBe(404)
    await page.goto(list)
    expect(await page.locator('body').innerText()).not.toContain(record.title)
  } finally {
    await fx.cleanup()
  }
})
