import { test, expect } from '@playwright/test'

test.describe('Frontend', () => {
  test('can load homepage', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('Palawan State University / University Student Government')
    await expect(page.locator('h1')).toHaveText(
      'Official information, student services and institutional records.',
    )
    await expect(page.locator('body')).not.toContainText(/payload/i)
  })
})
