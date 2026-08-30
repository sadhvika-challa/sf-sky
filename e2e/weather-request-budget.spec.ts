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
  weatherCoordinateKey,
  type WeatherFailureMode,
  type WeatherHarness,
  type WeatherRequestLifecycle,
} from './weather-fixture';

const SPOT_URL = '/?spot=sf-ocean-beach&view=now';
const TWIN_PEAKS_URL = '/?spot=sf-twin-peaks&view=now';
const TWIN_PEAKS_COORDINATES = '37.7544,-122.4477';
const CURRENT_HOUR_KEY = '2026-08-30T01:00:00Z';
const FIFTEEN_MINUTES = 15 * 60 * 1_000;
const OVERLAY_TOTAL = neighborhoods.length;
const FIRST_USABLE_COVERAGE = 9;
const FIRST_WAVE_IDS = new Set([1, 3, 4, 6, 9, 16, 20, 22, 25]);

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

async function dismissSpotSheet(page: Page, accessibleName: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: accessibleName });
  for (let attempt = 0; attempt < 2 && await dialog.isVisible(); attempt += 1) {
    await page.keyboard.press('Escape');
  }
  await expect(dialog).toBeHidden();
}

async function waitForOverlayCompletion(harness: WeatherHarness): Promise<void> {
  await expect.poll(() => harness.requests.forecast.length).toBe(OVERLAY_TOTAL);
  await expect.poll(() => harness.requests.active).toBe(0);
}

async function switchCity(page: Page, city: 'Chicago' | 'San Francisco'): Promise<number> {
  await page.getByRole('button', { name: 'Settings' }).click();
  const visibleSwitchCity = page.locator('button[aria-label="Switch city"]:visible');
  await expect(visibleSwitchCity).toHaveCount(1);
  await visibleSwitchCity.click();
  const cityButton = page.getByRole('dialog', { name: 'Choose a city' }).getByRole('button', {
    name: city === 'San Francisco'
      ? /^(Select San Francisco|San Francisco, home city)$/
      : `Select ${city}`,
  });
  const actionAt = Date.now();
  await cityButton.click();
  await expect(
    page.getByRole('button', { name: 'Switch city' }).locator('..').getByText(city, { exact: true }),
  ).toBeVisible();
  return actionAt;
}

async function expectPromptTermination(
  harness: WeatherHarness,
  requests: WeatherRequestLifecycle[],
  actionAt: number,
  expectGlobalIdle = true,
): Promise<void> {
  await expect.poll(() => requests.every((request) => request.terminal !== null)).toBe(true);
  const latestTerminalAt = Math.max(...requests.map((request) => request.terminalAt ?? Infinity));
  expect(
    latestTerminalAt - actionAt,
    `Active requests must terminate within 1.5 seconds: ${JSON.stringify(requests)}`,
  ).toBeLessThanOrEqual(1_500);
  expect(requests.every((request) => request.terminal === 'aborted')).toBe(true);
  if (expectGlobalIdle) await expect.poll(() => harness.requests.active).toBe(0);
}

function generationForecasts(
  harness: WeatherHarness,
  firstLifecycleId: number,
): WeatherRequestLifecycle[] {
  return harness.requests.lifecycle.filter(
    (request) => request.id >= firstLifecycleId && request.endpoint === 'forecast',
  );
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
  const deferredSecondWave = neighborhoods
    .filter((neighborhood) => !FIRST_WAVE_IDS.has(neighborhood.id))
    .map((neighborhood) => harness.deferForecast(
      weatherCoordinateKey(neighborhood.lat, neighborhood.lng),
    ));
  await page.goto('/');
  await openWeatherOverlay(page);

  await expect.poll(() => harness.requests.completed.length).toBeGreaterThanOrEqual(FIRST_USABLE_COVERAGE);
  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'progressive');
  await expect(overlayState(page)).toContainText(/partial map available/i);
  await expect(overlayState(page).getByRole('button', { name: /retry/i })).toHaveCount(0);
  expect(harness.requests.completed.length).toBeLessThan(OVERLAY_TOTAL);

  for (const deferred of deferredSecondWave) deferred.release();
  await waitForOverlayCompletion(harness);
  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'ready');
  await expect(overlayState(page)).toContainText(/weather coverage ready, 25 of 25 areas/i);
  expectWeatherRequestBudget(harness.requests, {
    forecast: OVERLAY_TOTAL,
    airQuality: 0,
    maxActive: 3,
    maxCoordinateJobs: 3,
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
    await seedCachedForecast(page, weatherCoordinateKey(neighborhood.lat, neighborhood.lng), {
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
  const initialForecast = harness.deferForecast(OCEAN_BEACH_COORDINATES);
  await page.goto(SPOT_URL);
  await initialForecast.requested;
  await page.clock.fastForward(10_000);
  initialForecast.release();
  const card = page
    .getByRole('dialog', { name: 'Ocean Beach sky scores' })
    .locator('[data-card-type="now"]');
  await expect(card.getByText('Current forecast · high confidence', { exact: true })).toBeVisible();

  await page.clock.fastForward(FIFTEEN_MINUTES - 1);
  expect(harness.requests.forecast.filter((value) => value === OCEAN_BEACH_COORDINATES)).toHaveLength(1);
  await page.clock.fastForward(2);
  await expect.poll(
    () => harness.requests.forecast.filter((value) => value === OCEAN_BEACH_COORDINATES).length,
  ).toBe(2);
  await expect.poll(
    () => harness.requests.airQuality.filter((value) => value === OCEAN_BEACH_COORDINATES).length,
  ).toBe(2);
});

test('deduplicates the shared Twin Peaks forecast across selected and overlay demand', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  await page.goto(TWIN_PEAKS_URL);
  await expect(
    page.getByRole('dialog', { name: 'Twin Peaks sky scores' })
      .getByText('Current forecast · high confidence', { exact: true }),
  ).toBeVisible();

  await dismissSpotSheet(page, 'Twin Peaks sky scores');
  await openWeatherOverlay(page);
  await waitForOverlayCompletion(harness);
  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'ready');

  expectWeatherRequestBudget(harness.requests, {
    forecast: OVERLAY_TOTAL,
    airQuality: 1,
    maxCoordinateJobs: 4,
  });
  expect(harness.requests.forecast.filter((value) => value === TWIN_PEAKS_COORDINATES)).toHaveLength(1);
  expect(harness.requests.airQuality).toEqual([TWIN_PEAKS_COORDINATES]);
  assertNoDuplicateWeatherRequests(harness.requests);
});

test('moves a newly selected spot ahead of queued overlay work', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  harness.responseDelayMs = 1_000;
  await page.goto('/');
  await openWeatherOverlay(page);
  await expect.poll(() => harness.requests.forecast.length).toBeGreaterThanOrEqual(3);
  expect(harness.requests.forecast.length).toBeLessThanOrEqual(4);

  await page.getByRole('button', { name: 'Search spots' }).click();
  const search = page.getByRole('dialog', { name: 'Search spots' });
  await search.getByPlaceholder('Search spots…').fill('Ocean Beach');
  const oceanResult = search.getByRole('button', { name: /Ocean Beach/ });
  const overlayJobsBeforeSelection = harness.requests.forecast.length;
  await oceanResult.click();
  await expect.poll(() => harness.requests.forecast.indexOf(OCEAN_BEACH_COORDINATES)).toBeGreaterThanOrEqual(0);
  expect(harness.requests.forecast.indexOf(OCEAN_BEACH_COORDINATES)).toBeLessThanOrEqual(
    overlayJobsBeforeSelection,
  );
  harness.responseDelayMs = 0;
  await expect(
    page.getByRole('dialog', { name: 'Ocean Beach sky scores' })
      .getByText('Current forecast · high confidence', { exact: true }),
  ).toBeVisible();
  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'ready');
  await expect.poll(() => harness.requests.forecast.length).toBe(OVERLAY_TOTAL + 1);
  await expect.poll(() => harness.requests.active).toBe(0);
  expect(harness.requests.maxActiveCoordinateJobs).toBeLessThanOrEqual(4);
});

test('cancels queued overlay work when the user switches cities', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  harness.responseDelayMs = 10_000;
  await page.goto('/');
  await openWeatherOverlay(page);
  await expect.poll(() => harness.requests.forecast.length).toBeGreaterThanOrEqual(3);
  const startedBeforeCityChange = harness.requests.forecast.length;
  expect(startedBeforeCityChange).toBeLessThanOrEqual(4);
  const activeBeforeCityChange = harness.requests.lifecycle.filter(
    (request) => request.terminal === null,
  );
  const actionAt = await switchCity(page, 'Chicago');
  await expect(page.getByRole('button', { name: 'Toggle weather overlay' })).toHaveCount(0);
  await expectPromptTermination(harness, activeBeforeCityChange, actionAt, false);
  // The explicit city choice starts the new Best of the spots checked
  // journey. Its first wave remains bounded to two coordinate jobs while the
  // prior overlay generation is already cancelled.
  await expect.poll(() => harness.requests.forecast.length).toBe(startedBeforeCityChange + 2);
  const activeManualCoordinates = new Set(
    harness.requests.lifecycle
      .filter((request) => request.terminal === null)
      .map((request) => request.coordinateKey),
  );
  expect(activeManualCoordinates.size).toBeLessThanOrEqual(2);

  harness.responseDelayMs = 0;
  const activeChicagoComparison = harness.requests.lifecycle.filter(
    (request) => request.terminal === null,
  );
  const returnActionAt = await switchCity(page, 'San Francisco');
  await expectPromptTermination(harness, activeChicagoComparison, returnActionAt, false);
  await expect(page.getByText('Best of the spots checked', { exact: true })).toBeVisible();
  await expect.poll(() => harness.requests.active).toBe(0);
  const secondGenerationId = harness.requests.lifecycle.length + 1;
  await openWeatherOverlay(page);
  await expect.poll(() => generationForecasts(harness, secondGenerationId).length).toBe(OVERLAY_TOTAL);
  await expect.poll(() => harness.requests.active).toBe(0);
  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'ready');
  const secondGeneration = generationForecasts(harness, secondGenerationId);
  expect(new Set(secondGeneration.map((request) => request.coordinateKey)).size).toBe(OVERLAY_TOTAL);
  expect(secondGeneration.every((request) => request.terminal === 'finished')).toBe(true);
  expect(harness.requests.maxActiveCoordinateJobs).toBeLessThanOrEqual(3);
});

test('toggle-off aborts active overlay work and a new generation starts once per anchor', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  harness.responseDelayMs = 10_000;
  await page.goto('/');
  await openWeatherOverlay(page);
  await expect.poll(() => harness.requests.forecast.length).toBe(3);
  const firstGenerationCount = harness.requests.forecast.length;
  const activeBeforeToggle = harness.requests.lifecycle.filter((request) => request.terminal === null);
  const actionAt = Date.now();

  await page.getByRole('button', { name: 'Toggle weather overlay' }).click();
  await expect(page.getByRole('button', { name: 'Toggle weather overlay' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(overlayState(page)).toHaveCount(0);
  await expectPromptTermination(harness, activeBeforeToggle, actionAt);
  await expect.poll(() => harness.requests.forecast.length).toBe(firstGenerationCount);

  harness.responseDelayMs = 0;
  const secondGenerationId = harness.requests.lifecycle.length + 1;
  await openWeatherOverlay(page);
  await expect.poll(() => generationForecasts(harness, secondGenerationId).length).toBe(OVERLAY_TOTAL);
  await expect.poll(() => harness.requests.active).toBe(0);
  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'ready');
  const secondGeneration = generationForecasts(harness, secondGenerationId);
  expect(new Set(secondGeneration.map((request) => request.coordinateKey)).size).toBe(OVERLAY_TOTAL);
  expect(secondGeneration.every((request) => request.terminal === 'finished')).toBe(true);
  expect(harness.requests.maxActiveCoordinateJobs).toBeLessThanOrEqual(3);
});

for (const scenario of [
  { name: 'offline', mode: { kind: 'offline' } as WeatherFailureMode, copy: /offline/i },
  { name: 'timeout', mode: { kind: 'timeout' } as WeatherFailureMode, copy: /timed out|timeout/i },
  { name: 'rate limit', mode: { kind: 'http', status: 429 } as WeatherFailureMode, copy: /try again|rate limit/i },
]) {
  test(`explains ${scenario.name} overlay failure and offers Retry`, async ({ page }, testInfo) => {
    const supportedProject = scenario.name === 'timeout'
      ? testInfo.project.name === 'desktop-webkit'
      : testInfo.project.name === 'desktop-webkit' || testInfo.project.name === 'mobile-webkit';
    test.skip(!supportedProject, 'Failure recovery matrix is WebKit-specific');
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
    await expect.poll(() => harness.requests.forecast.length).toBe(beforeRetry + OVERLAY_TOTAL);
    await expect.poll(() => harness.requests.active).toBe(0);
    await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'ready');
    const retryGeneration = harness.requests.forecast.slice(beforeRetry);
    expect(retryGeneration).toHaveLength(OVERLAY_TOTAL);
    expect(new Set(retryGeneration).size).toBe(OVERLAY_TOTAL);
    expect(harness.requests.maxActiveCoordinateJobs).toBeLessThanOrEqual(3);
  });
}

test('recovers a cold overlay from malformed HTTP 200 data with one fresh retry generation', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  for (const neighborhood of neighborhoods) {
    harness.emptyForecastCoordinates.add(
      weatherCoordinateKey(neighborhood.lat, neighborhood.lng),
    );
  }
  await page.goto('/');
  await openWeatherOverlay(page);
  await expect.poll(() => harness.requests.forecast.length).toBe(OVERLAY_TOTAL);
  await expect.poll(() => harness.requests.active).toBe(0);

  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'invalid-data');
  await expect(overlayState(page)).toContainText(/incomplete data/i);
  await expect.poll(async () => page.locator('.weather-overlay').evaluateAll((elements) =>
    elements.every((element) => Number(getComputedStyle(element).opacity) === 0),
  )).toBe(true);
  const retry = overlayState(page).getByRole('button', { name: /retry/i });
  await expect(retry).toBeVisible();

  harness.emptyForecastCoordinates.clear();
  const beforeRetry = harness.requests.forecast.length;
  await retry.click();
  await expect.poll(() => harness.requests.forecast.length).toBe(beforeRetry + OVERLAY_TOTAL);
  await expect.poll(() => harness.requests.active).toBe(0);
  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'ready');
  const retryGeneration = harness.requests.forecast.slice(beforeRetry);
  expect(retryGeneration).toHaveLength(OVERLAY_TOTAL);
  expect(new Set(retryGeneration).size).toBe(OVERLAY_TOTAL);
  expect(harness.requests.maxActiveCoordinateJobs).toBeLessThanOrEqual(3);
});

test('preserves saved overlay evidence across malformed revalidation and reload', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  const cacheOptions = {
    fetchedAt: FIXED_NOW.getTime() - 16 * 60 * 1_000,
    expiresAt: FIXED_NOW.getTime() + 60 * 60 * 1_000,
    includeAirQuality: false,
    seedOnce: true,
  };
  for (const neighborhood of neighborhoods) {
    const coordinateKey = weatherCoordinateKey(neighborhood.lat, neighborhood.lng);
    await seedCachedForecast(page, coordinateKey, cacheOptions);
    harness.emptyForecastCoordinates.add(coordinateKey);
  }

  await page.goto('/');
  await openWeatherOverlay(page);
  await expect.poll(() => harness.requests.forecast.length).toBe(OVERLAY_TOTAL);
  await expect.poll(() => harness.requests.active).toBe(0);
  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'saved');
  await expect(overlayState(page)).toContainText(/showing saved forecast for 25 areas/i);
  await expect(overlayState(page)).toContainText(/incomplete data/i);
  const savedSummary = await overlayState(page).getByRole('img').getAttribute('aria-label');
  expect(savedSummary).toMatch(/usable coverage 25 of 25 areas/i);
  await expect(overlayState(page).getByRole('button', { name: /retry/i })).toBeVisible();

  await page.reload();
  await openWeatherOverlay(page);
  await expect.poll(() => harness.requests.forecast.length).toBe(OVERLAY_TOTAL * 2);
  await expect.poll(() => harness.requests.active).toBe(0);
  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'saved');
  await expect(overlayState(page)).toContainText(/showing saved forecast for 25 areas/i);
  await expect(overlayState(page)).toContainText(/incomplete data/i);
  await expect(overlayState(page).getByRole('img')).toHaveAttribute('aria-label', savedSummary!);

  harness.emptyForecastCoordinates.clear();
  const beforeRetry = harness.requests.forecast.length;
  await overlayState(page).getByRole('button', { name: /retry/i }).click();
  await expect.poll(() => harness.requests.forecast.length).toBe(beforeRetry + OVERLAY_TOTAL);
  await expect.poll(() => harness.requests.active).toBe(0);
  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'ready');
  expect(new Set(harness.requests.forecast.slice(beforeRetry)).size).toBe(OVERLAY_TOTAL);
  expect(harness.requests.maxActiveCoordinateJobs).toBeLessThanOrEqual(3);
});

test('qualifies a completed overlay with missing regional evidence as partial', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  const first = neighborhoods[0];
  harness.failureModesByCoordinates.set(weatherCoordinateKey(first.lat, first.lng), {
    forecast: { kind: 'http', status: 503 },
  });
  await page.goto('/');
  await openWeatherOverlay(page);
  await waitForOverlayCompletion(harness);

  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'partial');
  await expect(overlayState(page)).toContainText(/partial weather coverage, 24 of 25 areas/i);
  await expect(overlayState(page).getByRole('button', { name: /retry/i })).toBeVisible();
});

test('never presents an authoritative wash from fewer than nine usable active-hour samples', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  harness.responseDelayMs = 80;
  for (const neighborhood of neighborhoods.slice(0, 6)) {
    harness.partialMetricCoordinates.add(weatherCoordinateKey(neighborhood.lat, neighborhood.lng));
  }
  for (const neighborhood of neighborhoods.slice(6, 12)) {
    harness.emptyForecastCoordinates.add(weatherCoordinateKey(neighborhood.lat, neighborhood.lng));
  }
  for (const neighborhood of neighborhoods.slice(12, 17)) {
    harness.missingHourKeysByCoordinates.set(
      weatherCoordinateKey(neighborhood.lat, neighborhood.lng),
      new Set([CURRENT_HOUR_KEY]),
    );
  }

  await page.goto('/');
  await openWeatherOverlay(page);
  const temperatureMetric = page.getByRole('tab', { name: 'Temperature' });
  await expect(temperatureMetric).toBeVisible();
  if (await temperatureMetric.getAttribute('aria-selected') !== 'true') {
    await temperatureMetric.click();
  }
  await expect(temperatureMetric).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => harness.requests.completed.length).toBeGreaterThanOrEqual(3);
  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'loading');
  await expect.poll(async () => page.locator('.weather-overlay').evaluateAll((elements) =>
    elements.every((element) => Number(getComputedStyle(element).opacity) === 0),
  )).toBe(true);

  await waitForOverlayCompletion(harness);

  await expect(overlayState(page)).toHaveAttribute('data-weather-overlay-state', 'invalid-data');
  await expect(overlayState(page)).toContainText(/incomplete data|unavailable/i);
  await expect(overlayState(page).getByRole('button', { name: /retry/i })).toBeVisible();
  await expect.poll(async () => page.locator('.weather-overlay').evaluateAll((elements) =>
    elements.every((element) => Number(getComputedStyle(element).opacity) === 0),
  )).toBe(true);
});
