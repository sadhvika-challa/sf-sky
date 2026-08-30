import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  installDeterministicBrowserState,
  installWeatherHarness,
} from './weather-fixture';

type SimulatedLocationMode =
  | 'allowed'
  | 'denied'
  | 'timeout'
  | 'unavailable'
  | 'unsupported';

interface LocationHarnessWindow extends Window {
  __soleilLocationHarness: {
    calls: number;
    mode: SimulatedLocationMode;
  };
}

interface SavedSpotsHarnessWindow extends Window {
  __soleilSavedSpotsHarness?: {
    getSavedSpotIds: () => readonly string[];
    setSaved: (spotId: string, saved: boolean) => Promise<boolean>;
    unsubscribe: () => void;
  };
}

const FAILURE_COPY: Readonly<Record<
  Exclude<SimulatedLocationMode, 'allowed' | 'unsupported'>,
  RegExp
>> = {
  denied: /Location access was denied\. Allow it in device settings, then retry, or keep browsing by city\./,
  timeout: /Location timed out\. Retry, or keep browsing by city\./,
  unavailable: /Location is unavailable right now\. Retry, or keep browsing by city\./,
};

async function installLocationHarness(
  page: Page,
  mode: SimulatedLocationMode,
  accuracyMeters = 24,
): Promise<void> {
  await page.addInitScript(({ initialMode, accuracy }) => {
    const harness = {
      calls: 0,
      mode: initialMode as SimulatedLocationMode,
    };
    (window as LocationHarnessWindow).__soleilLocationHarness = harness;

    if (initialMode === 'unsupported') {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: undefined,
      });
      return;
    }

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(
          success: PositionCallback,
          failure?: PositionErrorCallback | null,
        ) {
          harness.calls += 1;
          queueMicrotask(() => {
            if (harness.mode === 'allowed') {
              success({
                coords: {
                  accuracy,
                  altitude: null,
                  altitudeAccuracy: null,
                  heading: null,
                  latitude: 37.7749,
                  longitude: -122.4194,
                  speed: null,
                  toJSON: () => ({}),
                },
                timestamp: Date.now(),
                toJSON: () => ({}),
              } as GeolocationPosition);
              return;
            }

            const code = harness.mode === 'denied'
              ? 1
              : harness.mode === 'timeout'
                ? 3
                : 2;
            failure?.({
              code,
              message: `Simulated ${harness.mode}`,
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            } as GeolocationPositionError);
          });
        },
        watchPosition: () => 1,
        clearWatch: () => undefined,
      } satisfies Geolocation,
    });
  }, { initialMode: mode, accuracy: accuracyMeters });
}

async function locationCalls(page: Page): Promise<number> {
  return page.evaluate(() =>
    (window as LocationHarnessWindow).__soleilLocationHarness.calls,
  );
}

async function setLocationMode(
  page: Page,
  mode: Exclude<SimulatedLocationMode, 'unsupported'>,
): Promise<void> {
  await page.evaluate((nextMode) => {
    (window as LocationHarnessWindow).__soleilLocationHarness.mode = nextMode;
  }, mode);
}

async function openLocationPreferences(page: Page): Promise<Locator> {
  const preferences = page.getByRole('region', { name: 'Location preferences' });
  await expect(preferences).toBeVisible();
  return preferences;
}

async function openOceanBeachSearchResult(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Search spots' }).click();
  const search = page.getByRole('dialog', { name: 'Search spots' });
  await search.getByPlaceholder('Search spots…').fill('Ocean Beach');
  const result = search.getByRole('button', { name: /Ocean Beach/ });
  await expect(result).toBeVisible();
  return result;
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !['desktop-chromium', 'mobile-webkit'].includes(testInfo.project.name),
    'Location acceptance runs on desktop Chromium and mobile WebKit.',
  );
  await installDeterministicBrowserState(page);
});

test('requests location only after activation and restores the marker and distances', async ({ page }) => {
  await installLocationHarness(page, 'allowed');
  await installWeatherHarness(page);
  await page.goto('/');

  await expect.poll(() => locationCalls(page)).toBe(0);
  const preferences = await openLocationPreferences(page);
  await expect(preferences).toContainText('See nearby spots and distances. Your coordinates are never saved.');
  await expect.poll(() => locationCalls(page)).toBe(0);

  await preferences.getByRole('button', { name: 'Use my location' }).click();
  await expect(preferences).toContainText('Using your precise location. Nearby distances are ready.');
  await expect.poll(() => locationCalls(page)).toBe(1);
  await expect(page.getByTitle('Your location')).toBeAttached();

  const oceanBeach = await openOceanBeachSearchResult(page);
  await expect(oceanBeach).toContainText(/\d+\.\d mi/);
  await expect.poll(() => locationCalls(page)).toBe(1);
});

for (const failure of ['denied', 'timeout', 'unavailable'] as const) {
  test(`explains ${failure} location and recovers through Retry`, async ({ page }) => {
    await installLocationHarness(page, failure);
    await installWeatherHarness(page);
    await page.goto('/');

    const preferences = await openLocationPreferences(page);
    await preferences.getByRole('button', { name: 'Use my location' }).click();
    await expect(preferences).toContainText(FAILURE_COPY[failure]);
    await expect.poll(() => locationCalls(page)).toBe(1);

    await setLocationMode(page, 'allowed');
    await preferences.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(preferences).toContainText('Using your precise location. Nearby distances are ready.');
    await expect.poll(() => locationCalls(page)).toBe(2);
    await expect(page.getByTitle('Your location')).toBeAttached();
  });
}

test('keeps manual city browsing usable after location failure', async ({ page }) => {
  await installLocationHarness(page, 'denied');
  await installWeatherHarness(page);
  await page.goto('/');

  const preferences = await openLocationPreferences(page);
  await preferences.getByRole('button', { name: 'Use my location' }).click();
  await expect(preferences).toContainText(FAILURE_COPY.denied);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('button[aria-label="Switch city"]:visible').click();
  const cities = page.getByRole('dialog', { name: 'Choose a city' });
  await cities.getByRole('button', { name: 'Select Austin' }).click();
  await expect(
    page.getByRole('button', { name: 'Switch city' }).locator('..').getByText('Austin', { exact: true }),
  ).toBeVisible();
  await expect.poll(() => locationCalls(page)).toBe(1);
});

test('explains unsupported location without presenting a futile Retry action', async ({ page }) => {
  await installLocationHarness(page, 'unsupported');
  await installWeatherHarness(page);
  await page.goto('/');

  const preferences = await openLocationPreferences(page);
  await preferences.getByRole('button', { name: 'Use my location' }).click();
  await expect(preferences).toContainText('This browser does not support location. Keep browsing by city.');
  await expect(preferences.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
  await expect.poll(() => locationCalls(page)).toBe(0);
});

test('labels reduced-accuracy results and all derived distances as approximate', async ({ page }) => {
  await installLocationHarness(page, 'allowed', 2_500);
  await installWeatherHarness(page);
  await page.goto('/');

  const preferences = await openLocationPreferences(page);
  await preferences.getByRole('button', { name: 'Use my location' }).click();
  await expect(preferences).toContainText('Using approximate location. Distances are approximate.');
  await expect(page.getByTitle('Your approximate location')).toBeAttached();

  const oceanBeach = await openOceanBeachSearchResult(page);
  await expect(oceanBeach).toContainText(/approx\..*\d+\.\d mi|\d+\.\d mi.*approx\./i);
});

async function mountSavedSpotsIntegration(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const [{ SavedSpotsController }, { browserKeyValueStore }, { KNOWN_SPOT_IDS, SPOT_ID_ALIASES }] =
      await Promise.all([
        import('/src/hooks/useSavedSpots.ts'),
        import('/src/platform/storage.ts'),
        import('/src/data/spotIdentity.ts'),
      ]);
    const controller = new SavedSpotsController(
      browserKeyValueStore,
      KNOWN_SPOT_IDS,
      SPOT_ID_ALIASES,
    );
    await controller.initialize();
    const unsubscribe = browserKeyValueStore.subscribe?.('soleil:saved-spots', () => {
      void controller.rehydrate();
    }) ?? (() => undefined);
    (window as SavedSpotsHarnessWindow).__soleilSavedSpotsHarness = {
      getSavedSpotIds: () => controller.getSnapshot().savedSpotIds,
      setSaved: (spotId, saved) => controller.setSaved(spotId, saved),
      unsubscribe,
    };
  });
}

async function savedSpotIds(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    (window as SavedSpotsHarnessWindow).__soleilSavedSpotsHarness?.getSavedSpotIds() ?? [],
  );
}

test('propagates a saved-spot write to another page without reload', async ({ context, page }) => {
  await installLocationHarness(page, 'unsupported');
  await installWeatherHarness(page);
  await page.goto('/');
  await page.evaluate(() => window.localStorage.removeItem('soleil:saved-spots'));

  const secondPage = await context.newPage();
  try {
    await installDeterministicBrowserState(secondPage);
    await installLocationHarness(secondPage, 'unsupported');
    await installWeatherHarness(secondPage);
    await secondPage.goto('/');
    await mountSavedSpotsIntegration(page);
    await mountSavedSpotsIntegration(secondPage);
    expect(await savedSpotIds(secondPage)).toEqual([]);

    const saved = await page.evaluate(() =>
      (window as SavedSpotsHarnessWindow).__soleilSavedSpotsHarness
        ?.setSaved('sf-twin-peaks', true),
    );
    expect(saved).toBe(true);
    await expect.poll(() => savedSpotIds(secondPage)).toEqual(['sf-twin-peaks']);
  } finally {
    await secondPage.close();
  }
});
