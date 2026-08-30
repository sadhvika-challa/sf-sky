import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { allSpots } from '../src/data/all-spots';
import { selectBestNearbyCandidates } from '../src/utils/bestNearby';
import {
  FIXED_NOW,
  assertNoDuplicateWeatherRequests,
  assertNoLiveOpenMeteoTraffic,
  expectWeatherRequestBudget,
  installDeterministicBrowserState,
  installWeatherHarness,
  seedCachedForecast,
  weatherCoordinateKey,
  type WeatherHarness,
} from './weather-fixture';

type LocationMode = 'allowed' | 'denied';

interface BestNearbyHarnessWindow extends Window {
  __bestNearbyLocationHarness: {
    calls: number;
    mode: LocationMode;
  };
}

const SF_LOCATION = { lat: 37.7749, lng: -122.4194 };

function nearbyCoordinateKeys(
  location: { lat: number; lng: number } = SF_LOCATION,
  city: 'sf' | 'austin' = 'sf',
): string[] {
  return selectBestNearbyCandidates(allSpots, location, city).candidates.map(({ spot }) =>
    weatherCoordinateKey(spot.lat, spot.lng),
  );
}

async function captureAndAudit(page: Page, testInfo: TestInfo): Promise<void> {
  const path = testInfo.outputPath(`best-nearby-${testInfo.project.name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach('best-nearby-ready', { path, contentType: 'image/png' });
  const recommendation = '[aria-label="Nearby spot recommendation"]';
  const auditRecommendation = async () => {
    const results = await new AxeBuilder({ page }).include(recommendation).analyze();
    const seriousOrCritical = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    const unresolvedContrast = results.incomplete.filter(
      (result) => result.id === 'color-contrast',
    );
    expect(seriousOrCritical).toEqual([]);
    expect(unresolvedContrast).toEqual([]);
  };

  await auditRecommendation();
  if (testInfo.project.name !== 'mobile-webkit') {
    await page.locator(`${recommendation} button[aria-label^="Open "]`).first().hover();
    await auditRecommendation();
  }
}

async function installLocationHarness(
  page: Page,
  options: {
    mode?: LocationMode;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
  } = {},
): Promise<void> {
  const {
    mode = 'allowed',
    latitude = 37.7749,
    longitude = -122.4194,
    accuracyMeters = 24,
  } = options;
  await page.addInitScript(({ initialMode, lat, lng, accuracy }) => {
    const harness = { calls: 0, mode: initialMode as LocationMode };
    (window as BestNearbyHarnessWindow).__bestNearbyLocationHarness = harness;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(
          success: PositionCallback,
          failure?: PositionErrorCallback | null,
        ) {
          harness.calls += 1;
          queueMicrotask(() => {
            if (harness.mode === 'denied') {
              failure?.({
                code: 1,
                message: 'Simulated denial',
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3,
              } as GeolocationPositionError);
              return;
            }
            success({
              coords: {
                accuracy,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                latitude: lat,
                longitude: lng,
                speed: null,
                toJSON: () => ({}),
              },
              timestamp: Date.now(),
              toJSON: () => ({}),
            } as GeolocationPosition);
          });
        },
        watchPosition: () => 1,
        clearWatch: () => undefined,
      } satisfies Geolocation,
    });
  }, { initialMode: mode, lat: latitude, lng: longitude, accuracy: accuracyMeters });
}

async function locationCalls(page: Page): Promise<number> {
  return page.evaluate(() =>
    (window as BestNearbyHarnessWindow).__bestNearbyLocationHarness.calls,
  );
}

async function useLocation(page: Page): Promise<void> {
  await page.getByRole('region', { name: 'Location preferences' })
    .getByRole('button', { name: 'Use my location' })
    .click();
}

async function expectReadyNearby(page: Page): Promise<void> {
  await expect(page.getByText('Best nearby now', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Nearby candidates' }))
    .toContainText(/confidence/i);
}

async function verifyThreeCandidateBudget(harness: WeatherHarness): Promise<void> {
  await expect.poll(() => harness.requests.forecast.length).toBe(3);
  await expect.poll(() => harness.requests.airQuality.length).toBe(3);
  assertNoLiveOpenMeteoTraffic(harness.requests);
  assertNoDuplicateWeatherRequests(harness.requests);
  expectWeatherRequestBudget(harness.requests, {
    forecast: 3,
    airQuality: 3,
    maxActive: 4,
    maxCoordinateJobs: 2,
  });
}

test.beforeEach(async ({ page }) => {
  await installDeterministicBrowserState(page);
});

test('waits for activation, ranks three same-city forecasts, and reuses the winner cache', async ({ page }, testInfo) => {
  await installLocationHarness(page);
  const weather = await installWeatherHarness(page);
  weather.responseDelayMs = 80;
  await page.goto('/');

  await expect.poll(() => locationCalls(page)).toBe(0);
  expectWeatherRequestBudget(weather.requests, { forecast: 0, airQuality: 0 });
  const locationRegion = page.getByRole('region', { name: 'Location preferences' });
  await expect(locationRegion).toContainText('See the best sky-viewing spots near you right now.');
  await expect(locationRegion.getByRole('button', { name: 'Choose a city' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Forecast hours' })).toHaveCount(0);

  await useLocation(page);
  await expectReadyNearby(page);
  await expect(page.getByRole('group', { name: 'Forecast hours' })).toHaveCount(0);
  const candidateButtons = page.getByRole('list', { name: 'Nearby candidates' }).getByRole('button');
  await expect(candidateButtons).toHaveCount(3);
  for (const candidate of await candidateButtons.all()) {
    await expect(candidate).toHaveAccessibleName(
      /score \d+ out of 100.*data confidence.*Retrieved.*mi/i,
    );
  }
  await verifyThreeCandidateBudget(weather);
  await captureAndAudit(page, testInfo);

  const before = {
    forecast: weather.requests.forecast.length,
    airQuality: weather.requests.airQuality.length,
  };
  await page.getByRole('button', { name: /best nearby now/i }).click();
  const scoreDialog = page.getByRole('dialog', { name: /sky scores$/ });
  await expect(scoreDialog).toBeVisible();
  await expect.poll(() => weather.requests.forecast.length).toBe(before.forecast);
  await expect.poll(() => weather.requests.airQuality.length).toBe(before.airQuality);

  const slider = scoreDialog.locator('[data-card-type="now"]')
    .getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await page.keyboard.press('Escape');
  if (await scoreDialog.isVisible()) await page.keyboard.press('Escape');
  await expect(scoreDialog).toBeHidden();

  const selectedHourNotice = page.getByRole('region', { name: 'Selected forecast hour' });
  await expect(selectedHourNotice).toBeVisible();
  await expect(page.getByText('Best nearby now', { exact: true })).toHaveCount(0);
  await selectedHourNotice.getByRole('button', { name: 'Return to Now' }).click();
  await expectReadyNearby(page);
  await expect.poll(() => weather.requests.forecast.length).toBe(before.forecast);
  await expect.poll(() => weather.requests.airQuality.length).toBe(before.airQuality);
});

test('keeps approximate location useful and labels every derived candidate distance', async ({ page }) => {
  await installLocationHarness(page, { accuracyMeters: 2_500 });
  const weather = await installWeatherHarness(page);
  await page.goto('/');

  await useLocation(page);
  await expectReadyNearby(page);
  const rows = page.getByRole('list', { name: 'Nearby candidates' }).getByRole('button');
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) await expect(row).toContainText('Approx.');
  await verifyThreeCandidateBudget(weather);
});

test('keeps coordinates ephemeral and lets the person return to city-only results', async ({ page }) => {
  const latitude = 37.771234;
  const longitude = -122.412345;
  const outboundUrls: string[] = [];
  page.on('request', (request) => outboundUrls.push(request.url()));
  await installLocationHarness(page, { latitude, longitude });
  await installWeatherHarness(page);
  await page.goto('/');

  await useLocation(page);
  await expectReadyNearby(page);

  const persistedState = await page.evaluate(async () => {
    const storage = {
      local: Object.entries(localStorage),
      session: Object.entries(sessionStorage),
    };
    const indexed: unknown[] = [];
    if (typeof indexedDB.databases === 'function') {
      for (const descriptor of await indexedDB.databases()) {
        if (!descriptor.name) continue;
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(descriptor.name!);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        for (const storeName of Array.from(database.objectStoreNames)) {
          const values = await new Promise<unknown[]>((resolve, reject) => {
            const request = database.transaction(storeName, 'readonly')
              .objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          indexed.push({ database: descriptor.name, storeName, values });
        }
        database.close();
      }
    }
    return JSON.stringify({ storage, indexed });
  });

  expect(persistedState).not.toContain(String(latitude));
  expect(persistedState).not.toContain(String(longitude));
  expect(outboundUrls.join('\n')).not.toContain(latitude.toFixed(4));
  expect(outboundUrls.join('\n')).not.toContain(longitude.toFixed(4));

  const locationRegion = page.getByRole('region', { name: 'Location preferences' });
  await locationRegion.getByRole('button', { name: 'Use city instead' }).click();
  await expect(locationRegion.getByRole('button', { name: 'Use my location' })).toBeVisible();
  await expect(locationRegion).toContainText('Your coordinates are never saved.');

  await page.reload();
  await expect.poll(() => locationCalls(page)).toBe(0);
  await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible();
});

test('shows useful loading feedback before the bounded comparison resolves', async ({ page }) => {
  await installLocationHarness(page);
  const weather = await installWeatherHarness(page);
  weather.responseDelayMs = 700;
  await page.goto('/');

  await useLocation(page);
  await expect(page.getByText('Checking nearby spots', { exact: true })).toBeVisible();
  await expect(page.getByText(/Comparing current forecast evidence near you/)).toBeVisible();
  await expectReadyNearby(page);
  await verifyThreeCandidateBudget(weather);
});

test('waits for a delayed third candidate before naming the actual winner', async ({ page }) => {
  await installLocationHarness(page);
  const weather = await installWeatherHarness(page);
  const delayedSpot = allSpots.find((spot) => spot.id === 'sf-cityscape-sky-bar');
  expect(delayedSpot).toBeDefined();
  const delayedCoordinate = weatherCoordinateKey(delayedSpot!.lat, delayedSpot!.lng);
  const deferred = weather.deferForecast(delayedCoordinate);
  await page.goto('/');

  await useLocation(page);
  await deferred.requested;
  await expect.poll(() => weather.requests.forecast.length).toBe(3);
  await expect.poll(() => weather.requests.airQuality.length).toBe(3);
  await expect.poll(() => weather.requests.completed.filter(
    (request) => request.startsWith('forecast:') && !request.endsWith(delayedCoordinate),
  ).length).toBe(2);

  await expect(page.getByText('Checking nearby spots', { exact: true })).toBeVisible();
  await expect(page.getByText('Best nearby now', { exact: true })).toHaveCount(0);

  deferred.release();
  await expectReadyNearby(page);
  await expect(page.getByRole('button', {
    name: /Open Cityscape Sky Bar, best nearby now/i,
  })).toBeVisible();
  await verifyThreeCandidateBudget(weather);
});

test('withholds a winner when air-quality evidence makes every forecast partial', async ({ page }) => {
  await installLocationHarness(page);
  const weather = await installWeatherHarness(page);
  for (const coordinate of nearbyCoordinateKeys()) {
    weather.failAirQualityCoordinates.add(coordinate);
  }
  await page.goto('/');

  await useLocation(page);
  await expect(page.getByText('Nearby estimates', { exact: true })).toBeVisible();
  await expect(page.getByText('Best nearby now', { exact: true })).toHaveCount(0);
  const candidates = page.getByRole('list', { name: 'Nearby candidates' });
  await expect(candidates).toContainText('Low data confidence');
  await verifyThreeCandidateBudget(weather);
});

test('keeps stale saved evidence visible without making a Best claim', async ({ page }) => {
  await installLocationHarness(page);
  const weather = await installWeatherHarness(page);
  const coordinates = nearbyCoordinateKeys();
  for (const coordinate of coordinates) {
    await seedCachedForecast(page, coordinate, {
      fetchedAt: FIXED_NOW.getTime() - 3 * 60 * 60 * 1_000,
      expiresAt: FIXED_NOW.getTime() + 60 * 60 * 1_000,
    });
    weather.failCoordinates.add(coordinate);
  }
  await page.goto('/');

  await useLocation(page);
  await expect(page.getByText('Nearby estimates', { exact: true })).toBeVisible();
  await expect(page.getByText('Best nearby now', { exact: true })).toHaveCount(0);
  const candidates = page.getByRole('list', { name: 'Nearby candidates' });
  await expect(candidates).toContainText('Low data confidence');
  await expect(candidates).toContainText('Retrieved 3h ago');
  await verifyThreeCandidateBudget(weather);
});

test('recovers an offline nearby comparison through one explicit retry', async ({ page }) => {
  await installLocationHarness(page);
  const weather = await installWeatherHarness(page);
  weather.failureMode = { kind: 'offline' };
  await page.goto('/');

  await useLocation(page);
  await expect(page.getByText('Nearby estimates', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Nearby candidates' }))
    .toContainText('forecast unavailable');
  await expect(page.getByText('Best nearby now', { exact: true })).toHaveCount(0);

  weather.failureMode = null;
  weather.responseDelayMs = 500;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Checking nearby spots', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
  await expectReadyNearby(page);
  await expect.poll(() => weather.requests.forecast.length).toBe(6);
  await expect.poll(() => weather.requests.airQuality.length).toBe(6);
  await expect.poll(() => weather.requests.forecast.length).toBe(6);
  await expect.poll(() => weather.requests.airQuality.length).toBe(6);
  expect(weather.requests.maxActiveCoordinateJobs).toBeLessThanOrEqual(2);
});

test('treats empty HTTP 200 forecast data as unrankable instead of inventing a winner', async ({ page }) => {
  await installLocationHarness(page);
  const weather = await installWeatherHarness(page);
  for (const coordinate of nearbyCoordinateKeys()) weather.emptyForecastCoordinates.add(coordinate);
  await page.goto('/');

  await useLocation(page);
  await expect(page.getByText('Nearby estimates', { exact: true })).toBeVisible();
  await expect(page.getByText('Best nearby now', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Nearby candidates' }))
    .toContainText('forecast unavailable');
  await verifyThreeCandidateBudget(weather);
});

test('offers an explicit city switch before requesting forecasts', async ({ page }) => {
  await installLocationHarness(page, {
    latitude: 30.2672,
    longitude: -97.7431,
  });
  const weather = await installWeatherHarness(page);
  await page.goto('/');

  await useLocation(page);
  const cityChoice = page.getByRole('region', { name: 'Nearby city choice' });
  await expect(cityChoice).toContainText('Spots nearby are in Austin');
  await expect(cityChoice).toContainText('Your map is still showing San Francisco.');
  expectWeatherRequestBudget(weather.requests, { forecast: 0, airQuality: 0 });

  await cityChoice.getByRole('button', { name: 'Switch to Austin' }).click();
  await expectReadyNearby(page);
  await verifyThreeCandidateBudget(weather);
});

test('cancels active and queued nearby work before a manual city comparison starts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Candidate cancellation is exercised once in Chromium.');
  await installLocationHarness(page);
  const weather = await installWeatherHarness(page);
  weather.responseDelayMs = 10_000;
  await page.goto('/');

  await useLocation(page);
  await expect.poll(() => weather.requests.forecast.length).toBe(2);
  const firstGeneration = weather.requests.lifecycle.filter((request) => request.terminal === null);
  expect(new Set(firstGeneration.map((request) => request.coordinateKey)).size).toBe(2);

  weather.responseDelayMs = 0;
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('button[aria-label="Switch city"]:visible').click();
  await page.getByRole('dialog', { name: 'Choose a city' })
    .getByRole('button', { name: 'Select Chicago' })
    .click();

  await expect.poll(() => firstGeneration.every((request) => request.terminal !== null)).toBe(true);
  expect(firstGeneration.every((request) => request.terminal === 'aborted')).toBe(true);
  // The queued third SF candidate never starts after the scope changes.
  const sfCoordinates = new Set(nearbyCoordinateKeys());
  expect(weather.requests.forecast.filter((coordinate) => sfCoordinates.has(coordinate))).toHaveLength(2);
  await expect(page.getByText('Best of the spots checked', { exact: true })).toBeVisible();
  expect(weather.requests.maxActiveCoordinateJobs).toBeLessThanOrEqual(2);
});

test('suggests the nearest supported city outside coverage without silently switching', async ({ page }) => {
  await installLocationHarness(page, {
    latitude: 34.0522,
    longitude: -118.2437,
    accuracyMeters: 1_500,
  });
  const weather = await installWeatherHarness(page);
  await page.goto('/');

  await useLocation(page);
  const coverage = page.getByRole('region', { name: 'Soleil coverage' });
  await expect(coverage).toContainText('Outside Soleil coverage');
  await expect(coverage).toContainText('nearest supported city is Santa Cruz');
  await expect(coverage).toContainText('Your location did not change the map.');
  expectWeatherRequestBudget(weather.requests, { forecast: 0, airQuality: 0 });

  await coverage.getByRole('button', { name: 'Browse Santa Cruz' }).click();
  await expect(page.getByText('Best of the spots checked', { exact: true })).toBeVisible();
  await expect(page.getByText('Best nearby now', { exact: true })).toHaveCount(0);
  await verifyThreeCandidateBudget(weather);
});

test('falls back to a checked-city result after location denial', async ({ page }) => {
  await installLocationHarness(page, { mode: 'denied' });
  const weather = await installWeatherHarness(page);
  await page.goto('/');

  await useLocation(page);
  await expect(page.getByRole('region', { name: 'Location preferences' }))
    .toContainText('Location access was denied.');
  await expect(page.getByText('Best of the spots checked', { exact: true })).toBeVisible();
  await expect(page.getByText('Best nearby now', { exact: true })).toHaveCount(0);
  await verifyThreeCandidateBudget(weather);
});
