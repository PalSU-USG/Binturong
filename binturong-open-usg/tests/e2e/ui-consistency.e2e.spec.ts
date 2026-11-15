import { expect, test } from '@playwright/test'

test.describe('Public page consistency', () => {
  for (const width of [375, 1280]) {
    test(`search, recovery and theme controls at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      for (const theme of ['light', 'dark']) {
        await page.addInitScript((value) => localStorage.setItem('payload-theme', value), theme)
        for (const path of ['/search', '/search?q=synthetic-unmatched-ui-consistency', '/synthetic-missing-ui-consistency']) {
          await page.goto(path)
          await expect(page.locator('main .site-page-header')).toBeVisible()
          await expect(page.locator('main h1')).toHaveCount(1)
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        }
        const trigger = page.getByRole('combobox', { name: 'Select a theme' })
        expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44)
        await trigger.focus()
        await page.keyboard.press('Enter')
        await page.getByRole('option', { name: `Theme: ${theme}`, exact: true }).click()
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await page.goto('/search')
        for (const control of [page.getByRole('searchbox'), page.getByRole('button', { name: 'Search', exact: true })]) {
          expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
        }
      }
    })
  }
})
