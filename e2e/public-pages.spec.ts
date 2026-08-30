import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const publicPages = [
  {
    path: '/soleil/privacy',
    trailingPath: '/soleil/privacy/',
    title: 'Privacy | Soleil',
    heading: 'Your sky plans should stay yours.',
    description: /location, saved spots, weather requests, maps, and support messages/i,
  },
  {
    path: '/soleil/support',
    trailingPath: '/soleil/support/',
    title: 'Support | Soleil',
    heading: 'Help with Soleil',
    description: /location recovery, live weather, saved spots, and issue reporting/i,
  },
] as const

function trackDataProviderRequests(page: Page): string[] {
  const providerRequests: string[] = []
  page.on('request', (request) => {
    if (/open-meteo|carto(?:cdn)?\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(request.url())) {
      providerRequests.push(request.url())
    }
  })
  return providerRequests
}

for (const publicPage of publicPages) {
  test(`${publicPage.title} loads directly, refreshes, and remains independent of the map`, async ({ page }) => {
    const providerRequests = trackDataProviderRequests(page)

    await page.goto(publicPage.path)

    await expect(page).toHaveTitle(publicPage.title)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', publicPage.description)
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Public pages' })).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('contentinfo')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: publicPage.heading })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Soleil', exact: true }).first()).toHaveAttribute('href', '/')
    await expect(page.locator('.leaflet-container, .leaflet-control-container')).toHaveCount(0)
    await expect(page.locator('button')).toHaveCount(0)

    await page.reload()
    await expect(page).toHaveTitle(publicPage.title)
    await expect(page.getByRole('heading', { level: 1, name: publicPage.heading })).toBeVisible()

    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const highImpactViolations = accessibility.violations.filter(
      ({ impact }) => impact === 'serious' || impact === 'critical',
    )
    expect(highImpactViolations).toEqual([])
    expect(providerRequests).toEqual([])
  })

  test(`${publicPage.title} accepts its exact trailing-slash path`, async ({ page }) => {
    await page.goto(publicPage.trailingPath)
    await expect(page).toHaveTitle(publicPage.title)
    await expect(page.getByRole('heading', { level: 1, name: publicPage.heading })).toBeVisible()
  })
}

test('public pages expose working cross-links and support email', async ({ page }) => {
  await page.goto('/soleil/privacy')
  await expect(page.getByRole('link', { name: 'Soleil support page' })).toHaveAttribute('href', '/soleil/support')
  await expect(page.getByRole('link', { name: 'sadhvikac1@gmail.com' })).toHaveAttribute(
    'href',
    'mailto:sadhvikac1@gmail.com?subject=Soleil%20privacy%20question',
  )

  await page.goto('/soleil/support')
  await expect(page.getByRole('link', { name: 'Soleil privacy notice' })).toHaveAttribute('href', '/soleil/privacy')
  await expect(page.getByRole('link', { name: 'Email Soleil support' })).toHaveAttribute(
    'href',
    'mailto:sadhvikac1@gmail.com?subject=Soleil%20support%20request',
  )
  await expect(page.getByRole('link', { name: 'Third-party notices' })).toHaveAttribute(
    'href',
    '/third-party-notices.txt',
  )
})

test('keyboard users can skip repeated navigation and focus the main document', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Chromium provides deterministic link tabbing in CI')

  await page.goto('/soleil/privacy')
  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skipLink).toBeFocused()
  await expect(skipLink).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
})

test('mobile public pages scroll fully and keep primary targets at least 44 pixels tall', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile layout contract')

  await page.goto('/soleil/support')
  const documentSize = await page.evaluate(() => ({
    viewport: window.innerHeight,
    content: document.documentElement.scrollHeight,
  }))
  expect(documentSize.content).toBeGreaterThan(documentSize.viewport)

  const targetHeights = await page.locator(
    '.public-brand, .public-nav-link, .public-primary-link, .public-footer a',
  ).evaluateAll(
    (targets) => targets.map((target) => target.getBoundingClientRect().height),
  )
  expect(targetHeights.length).toBeGreaterThan(0)
  for (const height of targetHeights) {
    expect(height).toBeGreaterThanOrEqual(44)
  }

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect(page.getByRole('contentinfo')).toBeInViewport()
})
