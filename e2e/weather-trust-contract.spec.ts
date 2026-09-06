import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  FIRST_FUTURE_HOUR_KEY,
  FIXED_NOW,
  OCEAN_BEACH_COORDINATES,
  assertNoLiveOpenMeteoTraffic,
  expectWeatherRequestBudget,
  expireCachedForecast,
  installDeterministicBrowserState,
  installWeatherHarness,
  seedCachedForecast,
  type WeatherHarness,
} from './weather-fixture';

const SPOT_URL = '/?spot=sf-ocean-beach&view=now';
const FIFTEEN_MINUTES = 15 * 60 * 1_000;
const HOUR = 60 * 60 * 1_000;

async function oceanCard(page: Page): Promise<Locator> {
  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  await expect(dialog).toBeVisible();
  return dialog.locator('[data-card-type="now"]');
}

async function selectOceanFromSearch(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Search spots' }).click();
  const searchDialog = page.getByRole('dialog', { name: 'Search spots' });
  await searchDialog.getByPlaceholder('Search spots…').fill('Ocean Beach');
  await searchDialog.getByRole('button', { name: /Ocean Beach/ }).click();
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}-${testInfo.project.name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function auditSurface(page: Page, testInfo: TestInfo, selector: string, name: string): Promise<void> {
  const results = await new AxeBuilder({ page }).include(selector).analyze();
  const seriousOrCritical = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  console.info(
    `[axe:${testInfo.project.name}:${name}] serious-or-critical=` +
    JSON.stringify(seriousOrCritical.map((violation) => ({ id: violation.id, nodes: violation.nodes.length }))),
  );
  expect(seriousOrCritical).toEqual([]);
}

function reportRequests(harness: WeatherHarness, label: string): void {
  assertNoLiveOpenMeteoTraffic(harness.requests);
  console.info(
    `[weather-fixture:${label}] forecast=${harness.requests.forecast.length} ` +
    `air-quality=${harness.requests.airQuality.length} unhandled-open-meteo=0`,
  );
}

test.beforeEach(async ({ page }) => {
  await installDeterministicBrowserState(page);
});

test('exposes current forecast evidence in Search, the map marker, and the score card', async ({ page }, testInfo) => {
  const harness = await installWeatherHarness(page);
  await page.goto('/');
  expectWeatherRequestBudget(harness.requests, { forecast: 0, airQuality: 0 });
  await page.getByRole('button', { name: 'Search spots' }).click();

  const searchDialog = page.getByRole('dialog', { name: 'Search spots' });
  await searchDialog.getByPlaceholder('Search spots…').fill('Ocean Beach');
  const oceanResult = searchDialog.getByRole('button', { name: /Ocean Beach/ });
  await oceanResult.click();

  const nowCard = await oceanCard(page);
  await expect(nowCard.getByText('Current forecast · high confidence', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('Forecast-backed · Retrieved just now', { exact: true })).toBeVisible();
  await expect(page.locator('[aria-label^="Now score "]')).toHaveAttribute(
    'aria-label',
    /current forecast · high confidence, retrieved just now$/,
  );
  if (testInfo.project.name !== 'mobile-webkit') {
    const marker = page.locator('[aria-label^="Ocean Beach, score "]');
    await expect(marker).toHaveAttribute(
      'aria-label',
      /current forecast · high confidence, retrieved just now$/,
    );
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Search spots' }).click();
  const reopenedSearch = page.getByRole('dialog', { name: 'Search spots' });
  await reopenedSearch.getByPlaceholder('Search spots…').fill('Ocean Beach');
  await expect(reopenedSearch.getByRole('status')).toHaveText('Forecast-backed scores');
  await expect(
    reopenedSearch.getByRole('button', { name: /Ocean Beach/ })
      .getByText('Current forecast · high confidence', { exact: true }),
  ).toBeVisible();
  await capture(page, testInfo, 'current-search-evidence');
  await auditSurface(page, testInfo, '[role="dialog"][aria-label="Search spots"]', 'search');
  expectWeatherRequestBudget(harness.requests, { forecast: 1, airQuality: 1, maxActive: 2 });
  reportRequests(harness, `current-${testInfo.project.name}`);
});

test('shows retrieval while the selected spot forecast is loading', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'State contract is exercised once in Chromium');
  const harness = await installWeatherHarness(page);
  const oceanForecast = harness.deferForecast(OCEAN_BEACH_COORDINATES);
  await page.goto(SPOT_URL);
  await oceanForecast.requested;

  const nowCard = await oceanCard(page);
  try {
    await expect(nowCard.getByText('Retrieving forecast · curated estimate', { exact: true })).toBeVisible();
    await expect(nowCard.getByText('Curated estimate · Retrieval pending', { exact: true })).toBeVisible();
  } finally {
    oceanForecast.release();
  }
  await expect(nowCard.getByText('Current forecast · high confidence', { exact: true })).toBeVisible();
  reportRequests(harness, 'loading');
});

test('uses a curated estimate when a newly selected spot lacks the active hour', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'State contract is exercised once in Chromium');
  const harness = await installWeatherHarness(page);
  harness.missingHourKeysByCoordinates.set(OCEAN_BEACH_COORDINATES, new Set([FIRST_FUTURE_HOUR_KEY]));
  await page.goto('/?spot=sf-twin-peaks&view=now');
  const firstSpot = page.getByRole('dialog', { name: 'Twin Peaks sky scores' });
  const slider = firstSpot.locator('[data-card-type="now"]')
    .getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(firstSpot).toBeHidden();
  await selectOceanFromSearch(page);

  const nowCard = await oceanCard(page);
  await expect(nowCard.getByText('Selected hour unavailable · curated estimate', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('Curated estimate · Retrieved just now', { exact: true })).toBeVisible();
  reportRequests(harness, 'missing-hour');
});

test('explains a failed forecast fetch and preserves recovery', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium' && testInfo.project.name !== 'mobile-webkit',
    'Selected retry is exercised in desktop Chromium and mobile WebKit',
  );
  const harness = await installWeatherHarness(page);
  harness.failCoordinates.add(OCEAN_BEACH_COORDINATES);
  await page.goto(SPOT_URL);

  const nowCard = await oceanCard(page);
  await expect(nowCard.getByText('Forecast unavailable · curated estimate', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('Curated estimate · Forecast not retrieved', { exact: true })).toBeVisible();
  const retry = nowCard.getByRole('button', { name: 'Retry forecast for Ocean Beach' });
  await expect(retry).toBeVisible();
  await capture(page, testInfo, 'forecast-fetch-error');

  harness.failCoordinates.clear();
  await retry.click();
  await expect(nowCard.getByText('Current forecast · high confidence', { exact: true })).toBeVisible();
  expect(harness.requests.forecast.filter((coordinate) => coordinate === OCEAN_BEACH_COORDINATES)).toHaveLength(2);
  expect(harness.requests.airQuality.filter((coordinate) => coordinate === OCEAN_BEACH_COORDINATES)).toHaveLength(2);
  reportRequests(harness, 'fetch-error');
});

test('retains a stale cached forecast when cold revalidation fails', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'State contract is exercised once in Chromium');
  const harness = await installWeatherHarness(page);
  await seedCachedForecast(page, OCEAN_BEACH_COORDINATES, {
    fetchedAt: FIXED_NOW.getTime() - 3 * HOUR,
    expiresAt: FIXED_NOW.getTime() + HOUR,
  });
  harness.failCoordinates.add(OCEAN_BEACH_COORDINATES);
  await page.goto(SPOT_URL);

  const nowCard = await oceanCard(page);
  await expect(nowCard.getByText('Saved forecast · low confidence', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('Forecast-backed · Retrieved 3h ago', { exact: true })).toBeVisible();
  expect(harness.requests.forecast.filter((coordinate) => coordinate === OCEAN_BEACH_COORDINATES)).toHaveLength(1);
  expect(harness.requests.airQuality.filter((coordinate) => coordinate === OCEAN_BEACH_COORDINATES)).toHaveLength(1);
  await capture(page, testInfo, 'stale-cached-forecast');
  reportRequests(harness, 'stale-cache');
});

test('keeps a saved forecast when its background refresh fails', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Timer contract is exercised once in Chromium');
  const harness = await installWeatherHarness(page);
  await page.goto(SPOT_URL);
  const nowCard = await oceanCard(page);
  await expect(nowCard.getByText('Current forecast · high confidence', { exact: true })).toBeVisible();

  await expireCachedForecast(page, OCEAN_BEACH_COORDINATES);
  harness.failCoordinates.add(OCEAN_BEACH_COORDINATES);
  await page.clock.fastForward(FIFTEEN_MINUTES + 1);

  await expect(nowCard.getByText('Saved forecast · low confidence', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('Forecast-backed · Retrieved 15m ago', { exact: true })).toBeVisible();
  expect(harness.requests.forecast.filter((coordinate) => coordinate === OCEAN_BEACH_COORDINATES)).toHaveLength(2);
  expect(harness.requests.airQuality.filter((coordinate) => coordinate === OCEAN_BEACH_COORDINATES)).toHaveLength(2);
  await capture(page, testInfo, 'saved-forecast-refresh-error');
  reportRequests(harness, 'saved-refresh-error');
});

test('identifies partial evidence when air quality is unavailable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'State contract is exercised once in Chromium');
  const harness = await installWeatherHarness(page);
  harness.failAirQualityCoordinates.add(OCEAN_BEACH_COORDINATES);
  await page.goto(SPOT_URL);

  const nowCard = await oceanCard(page);
  await expect(nowCard.getByText('Partial forecast · low confidence', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('Partial forecast · Retrieved just now', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'partial-air-quality');
  reportRequests(harness, 'partial-air-quality');
});

test('retains one complete selected version when AQ-only revalidation fails and retries both endpoints', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Versioned AQ recovery is exercised once in Chromium');
  const harness = await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const nowCard = await oceanCard(page);
  await expect(nowCard.getByText('Current forecast · high confidence', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('Forecast-backed · Retrieved just now', { exact: true })).toBeVisible();
  harness.failAirQualityCoordinates.add(OCEAN_BEACH_COORDINATES);
  await page.clock.fastForward(FIFTEEN_MINUTES + 1);
  await expect.poll(
    () => harness.requests.forecast.filter((coordinate) => coordinate === OCEAN_BEACH_COORDINATES).length,
  ).toBe(2);
  await expect.poll(
    () => harness.requests.airQuality.filter((coordinate) => coordinate === OCEAN_BEACH_COORDINATES).length,
  ).toBe(2);

  await expect(nowCard.getByText('Saved forecast · low confidence', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('Forecast-backed · Retrieved 15m ago', { exact: true })).toBeVisible();
  await expect(nowCard.getByText(/refresh.*incomplete.*air.?quality|air.?quality.*unavailable/i)).toBeVisible();
  const retry = nowCard.getByRole('button', { name: 'Retry forecast for Ocean Beach' });
  await expect(retry).toBeVisible();

  harness.failAirQualityCoordinates.clear();
  await retry.click();
  await expect(nowCard.getByText('Current forecast · high confidence', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('Forecast-backed · Retrieved just now', { exact: true })).toBeVisible();
  expect(harness.requests.forecast.filter(
    (coordinate) => coordinate === OCEAN_BEACH_COORDINATES,
  )).toHaveLength(3);
  expect(harness.requests.airQuality.filter(
    (coordinate) => coordinate === OCEAN_BEACH_COORDINATES,
  )).toHaveLength(3);
  reportRequests(harness, 'aq-only-refresh-recovery');
});

test('uses placeholders instead of invented values for absent metrics', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'State contract is exercised once in Chromium');
  const harness = await installWeatherHarness(page);
  harness.partialMetricCoordinates.add(OCEAN_BEACH_COORDINATES);
  await page.goto(SPOT_URL);

  const nowCard = await oceanCard(page);
  await expect(nowCard.getByText('Partial forecast · low confidence', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('--°', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('Unavailable', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('Wind', { exact: true }).locator('..').getByText('--', { exact: true }).first()).toBeVisible();
  await expect(nowCard.getByText('Visibility', { exact: true }).locator('..').getByText('--', { exact: true }).first()).toBeVisible();
  reportRequests(harness, 'absent-metrics');
});
