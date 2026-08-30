import { expect, test, type Locator, type Page } from '@playwright/test';
import { neighborhoods } from '../src/data/neighborhoods';
import {
  FIXED_NOW,
  OCEAN_BEACH_COORDINATES,
  assertNoDuplicateWeatherRequests,
  assertNoLiveOpenMeteoTraffic,
  expectWeatherRequestBudget,
  installDeterministicBrowserState,
  installWeatherHarness,
  seedCachedForecast,
  type WeatherFailureMode,
  type WeatherHarness,
} from './weather-fixture';

const SPOT_URL = '/?spot=sf-ocean-beach&view=now';
const FIFTEEN_MINUTES = 15 * 60 * 1_000;
const OVERLAY_TOTAL = neighborhoods.length;
const FIRST_USABLE_COVERAGE = 9;

function overlayState(page: Page): Locator {
  return page.locator('[data-weather-overlay-state]');
}

async function openWeatherOverlay(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Toggle weather overlay' }).click();
  await expect(page.getByRole('button', { name: 'Toggle weather overlay' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

async function selectOceanFromSearch(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Search spots' }).click();
  const search = page.getByRole('dialog', { name: 'Search spots' });
  await search.getByPlaceholder('Search spots…').fill('Ocean Beach');
  await search.getByRole('button', { name: /Ocean Beach/ }).click();
}

async function waitForOverlayCompletion(harness: WeatherHarness): Promise<void> {
  await expect.poll(() => harness.requests.forecast.length).toBe(OVERLAY_TOTAL);
  await expect.poll(() => harness.requests.active).toBe(0);
}

test.beforeEach(async ({ page }) => {
  await installDeterministicBrowserState(page);
});

test('keeps the cold shell and disabled overlay at a zero-request budget', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Toggle weather overlay' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  expectWeatherRequestBudget(harness.requests, { forecast: 0, airQuality: 0 });
  assertNoLiveOpenMeteoTraffic(harness.requests);
});

test('prioritizes one selected-spot pair without launching regional traffic', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const card = page
    .getByRole('dialog', { name: 'Ocean Beach sky scores' })
    .locator('[data-card-type="now"]');
  await expect(card.getByText('Current forecast · high confidence', { exact: true })).toBeVisible();
  expectWeatherRequestBudget(harness.requests, {
    forecast: 1,
    airQuality: 1,
    maxActive: 2,
    maxCoordinateJobs: 1,
  });
  expect(harness.requests.forecast).toEqual([OCEAN_BEACH_COORDINATES]);
  expect(harness.requests.airQuality).toEqual([OCEAN_BEACH_COORDINATES]);
  assertNoDuplicateWeatherRequests(harness.requests);
});

test('loads SF overlay progressively within its regional request budget', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  harness.responseDelayMs = 80;
  await page.goto('/');
  await openWeatherOverlay(page);

  await expect.poll(() => harness.requests.completed.length).toBeGreaterThanOrEqual(FIRST_USABLE_COVERAGE);
  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'partial');
  await expect(overlayState(page)).toContainText(/partial weather coverage, \d+ of 25 areas/i);
  expect(harness.requests.completed.length).toBeLessThan(OVERLAY_TOTAL);

  await waitForOverlayCompletion(harness);
  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'ready');
  await expect(overlayState(page)).toContainText(/weather coverage ready, 25 of 25 areas/i);
  expectWeatherRequestBudget(harness.requests, {
    forecast: OVERLAY_TOTAL,
    airQuality: 0,
    maxActive: 4,
    maxCoordinateJobs: 4,
  });
  assertNoDuplicateWeatherRequests(harness.requests);
  assertNoLiveOpenMeteoTraffic(harness.requests);
});

test('serves a warm selected spot and warm overlay without network requests', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  const cacheOptions = {
    fetchedAt: FIXED_NOW.getTime() - 60_000,
    expiresAt: FIXED_NOW.getTime() + 60 * 60 * 1_000,
  };
  await seedCachedForecast(page, OCEAN_BEACH_COORDINATES, cacheOptions);
  for (const neighborhood of neighborhoods) {
    await seedCachedForecast(page, `${neighborhood.lat},${neighborhood.lng}`, {
      ...cacheOptions,
      includeAirQuality: false,
    });
  }

  await page.goto(SPOT_URL);
  await expect(
    page.getByRole('dialog', { name: 'Ocean Beach sky scores' })
      .getByText('Current forecast · high confidence', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await openWeatherOverlay(page);
  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'ready');
  expectWeatherRequestBudget(harness.requests, { forecast: 0, airQuality: 0 });
});

test('revalidates the selected spot once after its 15-minute age budget', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  await page.goto(SPOT_URL);
  const card = page
    .getByRole('dialog', { name: 'Ocean Beach sky scores' })
    .locator('[data-card-type="now"]');
  await expect(card.getByText('Current forecast · high confidence', { exact: true })).toBeVisible();

  await page.clock.fastForward(FIFTEEN_MINUTES + 1);
  await expect.poll(
    () => harness.requests.forecast.filter((value) => value === OCEAN_BEACH_COORDINATES).length,
  ).toBe(2);
  expect(harness.requests.airQuality.filter((value) => value === OCEAN_BEACH_COORDINATES)).toHaveLength(2);
});

test('moves a newly selected spot ahead of queued overlay work', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  harness.responseDelayMs = 1_000;
  await page.goto('/');
  await openWeatherOverlay(page);
  await expect.poll(() => harness.requests.forecast.length).toBeGreaterThanOrEqual(3);
  const initialOverlayJobs = harness.requests.forecast.length;
  expect(initialOverlayJobs).toBeLessThanOrEqual(4);

  await selectOceanFromSearch(page);
  await expect.poll(() => harness.requests.forecast.indexOf(OCEAN_BEACH_COORDINATES)).toBeGreaterThanOrEqual(0);
  expect(harness.requests.forecast.indexOf(OCEAN_BEACH_COORDINATES)).toBeLessThanOrEqual(initialOverlayJobs);
  await expect(
    page.getByRole('dialog', { name: 'Ocean Beach sky scores' })
      .getByText('Current forecast · high confidence', { exact: true }),
  ).toBeVisible();
  await expect.poll(() => harness.requests.forecast.length).toBe(OVERLAY_TOTAL + 1);
  await expect.poll(() => harness.requests.active).toBe(0);
  expect(harness.requests.maxActiveCoordinateJobs).toBeLessThanOrEqual(4);
});

test('cancels queued overlay work when the user switches cities', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  harness.responseDelayMs = 1_000;
  await page.goto('/');
  await openWeatherOverlay(page);
  await expect.poll(() => harness.requests.forecast.length).toBeGreaterThanOrEqual(3);
  const startedBeforeCityChange = harness.requests.forecast.length;
  expect(startedBeforeCityChange).toBeLessThanOrEqual(4);

  await page.getByRole('button', { name: 'Switch city' }).click();
  await page.getByRole('dialog', { name: 'Choose a city' })
    .getByRole('button', { name: 'Select Chicago' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Switch city' }).locator('..').getByText('Chicago', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Toggle weather overlay' })).toHaveCount(0);
  await expect.poll(() => harness.requests.forecast.length).toBeLessThanOrEqual(startedBeforeCityChange);
  expect(new Set(harness.requests.forecast).size).toBe(harness.requests.forecast.length);
});

for (const scenario of [
  { name: 'offline', mode: { kind: 'offline' } as WeatherFailureMode, copy: /offline/i },
  { name: 'timeout', mode: { kind: 'timeout' } as WeatherFailureMode, copy: /timed out|timeout/i },
  { name: 'rate limit', mode: { kind: 'http', status: 429 } as WeatherFailureMode, copy: /try again|rate limit/i },
]) {
  test(`explains ${scenario.name} overlay failure and offers Retry`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Failure taxonomy is exercised once');
    const harness = await installWeatherHarness(page);
    harness.failureMode = scenario.mode;
    if (scenario.name === 'offline') {
      await page.addInitScript(() => {
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
      });
    }
    await page.goto('/');
    await openWeatherOverlay(page);

    if (scenario.name === 'timeout') {
      while (harness.requests.forecast.length < OVERLAY_TOTAL) {
        const before = harness.requests.forecast.length;
        await expect.poll(() => harness.requests.active).toBeGreaterThan(0);
        await page.clock.fastForward(15_000);
        harness.releaseTimeoutFailures();
        if (before < OVERLAY_TOTAL - 4) {
          await expect.poll(() => harness.requests.forecast.length).toBeGreaterThan(before);
        }
      }
      await page.clock.fastForward(15_000);
      harness.releaseTimeoutFailures();
    }

    await expect(overlayState(page)).toHaveAttribute(
      'data-weather-overlay-state',
      scenario.name === 'rate limit' ? 'rate-limit' : scenario.name,
    );
    await expect(overlayState(page)).toContainText(scenario.copy);
    const retry = overlayState(page).getByRole('button', { name: /retry/i });
    await expect(retry).toBeVisible();

    harness.failureMode = null;
    if (scenario.name === 'offline') {
      await page.evaluate(() => {
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
        window.dispatchEvent(new Event('online'));
      });
    }
    const beforeRetry = harness.requests.forecast.length;
    await retry.click();
    await expect.poll(() => harness.requests.forecast.length).toBeGreaterThan(beforeRetry);
  });
}

test('qualifies a completed overlay with missing regional evidence as partial', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  const first = neighborhoods[0];
  harness.failureModesByCoordinates.set(`${first.lat},${first.lng}`, {
    forecast: { kind: 'http', status: 503 },
  });
  await page.goto('/');
  await openWeatherOverlay(page);
  await waitForOverlayCompletion(harness);

  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'partial');
  await expect(overlayState(page)).toContainText(/partial weather coverage, 24 of 25 areas/i);
  await expect(overlayState(page).getByRole('button', { name: /retry/i })).toBeVisible();
});
