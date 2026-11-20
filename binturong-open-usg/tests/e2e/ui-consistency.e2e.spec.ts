import { expect, test } from '@playwright/test'

test.describe('Public page consistency', () => {
  test('menu and breadcrumb links are at least 44px tall', async ({ page }) => {
    for (const path of ['/', '/archives/legislative']) {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      const targets = await page
        .locator('.site-nav-link:visible, .site-breadcrumbs a:visible')
        .evaluateAll((elements) =>
          elements.map((element) => ({
            label: element.textContent?.trim(),
            height: element.getBoundingClientRect().height,
            minHeight: getComputedStyle(element).minHeight,
            boxSizing: getComputedStyle(element).boxSizing,
            targetHit: getComputedStyle(document.documentElement).getPropertyValue('--target-hit'),
          })),
        )
      expect(targets.length).toBeGreaterThan(0)
      for (const target of targets)
        expect(target.height, `${path} ${JSON.stringify(target)}`).toBeGreaterThanOrEqual(44)
    }
  })

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
