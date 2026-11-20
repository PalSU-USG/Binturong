import { test, expect } from '@playwright/test'

test.describe('Frontend', () => {
  test('the 404 page logs no React script tag error', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' && /script tag/i.test(message.text())) {
        errors.push(message.text())
      }
    })
    const response = await page.goto('/no-such-page')
    expect(response?.status()).toBe(404)
    await page.waitForLoadState('networkidle')
    expect(errors).toEqual([])
  })

  test('applies the stored theme before the app scripts load, including on a 404', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('payload-theme', 'dark'))
    await page.emulateMedia({ colorScheme: 'light' })
    await page.route(/\/_next\/static\/.*\.js(?:\?|$)/, (route) => route.abort())

    for (const [path, status] of [['/', 200], ['/no-such-page', 404]] as const) {
      const response = await page.goto(path)
      expect(response?.status()).toBe(status)
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await expect(page.locator('head #theme-script')).toHaveCount(1)
    }
  })

  test('can load homepage', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('Palawan State University / University Student Government')
    await expect(page.locator('h1')).toHaveText(
      'Official information, student services and institutional records.',
    )
    await expect(page.locator('body')).not.toContainText(/payload/i)
  })
})
