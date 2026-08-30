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
    getUpdateConsistency: () => 'cross-context' | 'in-process' | 'unavailable';
    rehydrate: () => Promise<void>;
    startSync: () => void;
    armUpdateGate: () => void;
    releaseUpdate: () => void;
    updateRequested: () => boolean;
    unsubscribe: () => void;
  };
  __soleilSavedSpotsOperationSettled?: boolean;
}

const SAVED_SPOTS_KEY = 'soleil:saved-spots';
const SAVED_SPOTS_DATABASE = 'soleil-device-storage';
const SAVED_SPOTS_OBJECT_STORE = 'key-values';

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

async function mountSavedSpotsIntegration(
  page: Page,
  options: { subscribe?: boolean; gateUpdates?: boolean } = {},
): Promise<void> {
  await page.evaluate(async ({ subscribe, gateUpdates, storageKey }) => {
    const [
      { SavedSpotsController },
      { savedSpotsKeyValueStore },
      { KNOWN_SPOT_IDS, SPOT_ID_ALIASES },
    ] =
      await Promise.all([
        import('/src/hooks/useSavedSpots.ts'),
        import('/src/platform/indexedDbStorage.ts'),
        import('/src/data/spotIdentity.ts'),
      ]);
    let updateRequested = false;
    let releaseUpdate = () => undefined;
    let updateGate: Promise<void> | null = null;
    const armUpdateGate = () => {
      updateRequested = false;
      updateGate = new Promise<void>((resolve) => { releaseUpdate = resolve; });
    };
    if (gateUpdates) armUpdateGate();
    const store = gateUpdates
      ? {
          get updateConsistency() { return savedSpotsKeyValueStore.updateConsistency; },
          get: savedSpotsKeyValueStore.get,
          set: savedSpotsKeyValueStore.set,
          remove: savedSpotsKeyValueStore.remove,
          subscribe: savedSpotsKeyValueStore.subscribe,
          async update<Result>(
            key: string,
            updater: (current: string | null) => {
              value?: string | null;
              result: Result;
            },
          ): Promise<Result> {
            const gate = updateGate;
            if (gate) {
              updateRequested = true;
              await gate;
              updateGate = null;
            }
            return savedSpotsKeyValueStore.update(key, updater);
          },
        }
      : savedSpotsKeyValueStore;
    const controller = new SavedSpotsController(
      store,
      KNOWN_SPOT_IDS,
      SPOT_ID_ALIASES,
    );
    await controller.initialize();
    let unsubscribe = () => undefined;
    const startSync = () => {
      unsubscribe();
      unsubscribe = store.subscribe?.(storageKey, () => {
        void controller.rehydrate();
      }) ?? (() => undefined);
    };
    if (subscribe) startSync();
    (window as SavedSpotsHarnessWindow).__soleilSavedSpotsHarness = {
      getSavedSpotIds: () => controller.getSnapshot().savedSpotIds,
      setSaved: (spotId, saved) => controller.setSaved(spotId, saved),
      getUpdateConsistency: () => store.updateConsistency,
      rehydrate: () => controller.rehydrate(),
      startSync,
      armUpdateGate,
      releaseUpdate: () => releaseUpdate(),
      updateRequested: () => updateRequested,
      unsubscribe: () => unsubscribe(),
    };
  }, {
    subscribe: options.subscribe !== false,
    gateUpdates: options.gateUpdates === true,
    storageKey: SAVED_SPOTS_KEY,
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
  await resetSavedSpotsStorage(page);

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

async function savedSpotsUpdateConsistency(
  page: Page,
): Promise<'cross-context' | 'in-process' | 'unavailable'> {
  return page.evaluate(() =>
    (window as SavedSpotsHarnessWindow).__soleilSavedSpotsHarness
      ?.getUpdateConsistency() ?? 'in-process',
  );
}

async function mirroredSavedSpotIds(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { spotIds?: unknown };
    if (!Array.isArray(parsed.spotIds)) throw new Error('Saved-spots payload is malformed.');
    return parsed.spotIds.filter((id): id is string => typeof id === 'string').sort();
  }, SAVED_SPOTS_KEY);
}

async function authoritativeSavedSpotIds(page: Page): Promise<string[]> {
  return page.evaluate(async ({ databaseName, objectStoreName, key }) => {
    const raw = await new Promise<string | null>((resolve, reject) => {
      const open = indexedDB.open(databaseName, 1);
      open.onerror = () => reject(open.error ?? new Error('IndexedDB open failed.'));
      open.onsuccess = () => {
        const database = open.result;
        const transaction = database.transaction(objectStoreName, 'readonly');
        const request = transaction.objectStore(objectStoreName).get(key);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed.'));
        request.onsuccess = () => resolve((request.result as string | null | undefined) ?? null);
        transaction.oncomplete = () => database.close();
      };
    });
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { spotIds?: unknown };
    if (!Array.isArray(parsed.spotIds)) throw new Error('Saved-spots payload is malformed.');
    return parsed.spotIds.filter((id): id is string => typeof id === 'string').sort();
  }, {
    databaseName: SAVED_SPOTS_DATABASE,
    objectStoreName: SAVED_SPOTS_OBJECT_STORE,
    key: SAVED_SPOTS_KEY,
  });
}

async function resetSavedSpotsStorage(page: Page): Promise<void> {
  await page.evaluate(async ({ databaseName, key }) => {
    window.localStorage.removeItem(key);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB delete failed.'));
      request.onblocked = () => reject(new Error('IndexedDB delete was blocked.'));
      request.onsuccess = () => resolve();
    });
  }, { databaseName: SAVED_SPOTS_DATABASE, key: SAVED_SPOTS_KEY });
}

async function rehydrateSavedSpots(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as SavedSpotsHarnessWindow).__soleilSavedSpotsHarness?.rehydrate(),
  );
}

async function startSavedSpotsSync(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as SavedSpotsHarnessWindow).__soleilSavedSpotsHarness?.startSync();
    window.dispatchEvent(new Event('pageshow'));
  });
}

async function beginSavedSpotOperation(
  page: Page,
  spotId: string,
  saved: boolean,
): Promise<boolean> {
  return page.evaluate(async ({ id, target }) => {
    const harnessWindow = window as SavedSpotsHarnessWindow;
    harnessWindow.__soleilSavedSpotsOperationSettled = false;
    try {
      return await harnessWindow.__soleilSavedSpotsHarness?.setSaved(id, target) ?? false;
    } finally {
      harnessWindow.__soleilSavedSpotsOperationSettled = true;
    }
  }, { id: spotId, target: saved });
}

async function operationSettled(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    (window as SavedSpotsHarnessWindow).__soleilSavedSpotsOperationSettled === true,
  );
}

async function updateRequested(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    (window as SavedSpotsHarnessWindow).__soleilSavedSpotsHarness?.updateRequested() === true,
  );
}

async function releaseUpdate(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as SavedSpotsHarnessWindow).__soleilSavedSpotsHarness?.releaseUpdate(),
  );
}

async function armUpdateGate(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as SavedSpotsHarnessWindow).__soleilSavedSpotsHarness?.armUpdateGate(),
  );
}

async function mountUnsynchronizedPages(page: Page, secondPage: Page): Promise<void> {
  await Promise.all([
    mountSavedSpotsIntegration(page, { subscribe: false, gateUpdates: true }),
    mountSavedSpotsIntegration(secondPage, { subscribe: false, gateUpdates: true }),
  ]);
  const consistencies = await Promise.all([
    savedSpotsUpdateConsistency(page),
    savedSpotsUpdateConsistency(secondPage),
  ]);
  test.skip(
    consistencies.some((consistency) => consistency !== 'cross-context'),
    'This browser exposes only the documented in-process fallback, not cross-page atomicity.',
  );
}

test('preserves concurrent different-ID saves before either page can rehydrate', async ({ context, page }) => {
  await installLocationHarness(page, 'unsupported');
  await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpotsStorage(page);

  const secondPage = await context.newPage();
  try {
    await installDeterministicBrowserState(secondPage);
    await installLocationHarness(secondPage, 'unsupported');
    await installWeatherHarness(secondPage);
    await secondPage.goto('/');
    await mountUnsynchronizedPages(page, secondPage);

    const twinPeaksSave = beginSavedSpotOperation(page, 'sf-twin-peaks', true);
    const oceanBeachSave = beginSavedSpotOperation(secondPage, 'sf-ocean-beach', true);
    await expect.poll(() => updateRequested(page)).toBe(true);
    await expect.poll(() => updateRequested(secondPage)).toBe(true);
    expect(await operationSettled(page)).toBe(false);
    expect(await operationSettled(secondPage)).toBe(false);

    await Promise.all([releaseUpdate(page), releaseUpdate(secondPage)]);
    expect(await Promise.all([twinPeaksSave, oceanBeachSave])).toEqual([true, true]);

    const expected = ['sf-ocean-beach', 'sf-twin-peaks'];
    expect(await authoritativeSavedSpotIds(page)).toEqual(expected);
    expect(await mirroredSavedSpotIds(page)).toEqual(expected);

    await Promise.all([startSavedSpotsSync(page), startSavedSpotsSync(secondPage)]);
    await expect.poll(() => savedSpotIds(page).then((ids) => [...ids].sort())).toEqual(expected);
    await expect.poll(() => savedSpotIds(secondPage).then((ids) => [...ids].sort())).toEqual(expected);
  } finally {
    await secondPage.close();
  }
});

test('uses later durable commit as the same-ID save-versus-unsave rule', async ({ context, page }) => {
  await installLocationHarness(page, 'unsupported');
  await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpotsStorage(page);

  const secondPage = await context.newPage();
  try {
    await installDeterministicBrowserState(secondPage);
    await installLocationHarness(secondPage, 'unsupported');
    await installWeatherHarness(secondPage);
    await secondPage.goto('/');
    await mountUnsynchronizedPages(page, secondPage);

    const runConflict = async (
      first: { page: Page; saved: boolean },
      second: { page: Page; saved: boolean },
      firstExpected: string[],
      expected: string[],
    ) => {
      const firstCommit = beginSavedSpotOperation(first.page, 'sf-twin-peaks', first.saved);
      const secondCommit = beginSavedSpotOperation(second.page, 'sf-twin-peaks', second.saved);
      await expect.poll(() => updateRequested(first.page)).toBe(true);
      await expect.poll(() => updateRequested(second.page)).toBe(true);
      expect(await operationSettled(first.page)).toBe(false);
      expect(await operationSettled(second.page)).toBe(false);

      await releaseUpdate(first.page);
      expect(await firstCommit).toBe(true);
      expect(await authoritativeSavedSpotIds(page)).toEqual(firstExpected);
      await releaseUpdate(second.page);
      expect(await secondCommit).toBe(true);
      expect(await authoritativeSavedSpotIds(page)).toEqual(expected);
      expect(await mirroredSavedSpotIds(page)).toEqual(expected);
      await Promise.all([rehydrateSavedSpots(page), rehydrateSavedSpots(secondPage)]);
    };

    await runConflict(
      { page, saved: true },
      { page: secondPage, saved: false },
      ['sf-twin-peaks'],
      [],
    );
    await Promise.all([armUpdateGate(page), armUpdateGate(secondPage)]);
    await runConflict(
      { page, saved: false },
      { page: secondPage, saved: true },
      [],
      ['sf-twin-peaks'],
    );

    await Promise.all([startSavedSpotsSync(page), startSavedSpotsSync(secondPage)]);
    await expect.poll(() => savedSpotIds(page)).toEqual(['sf-twin-peaks']);
    await expect.poll(() => savedSpotIds(secondPage)).toEqual(['sf-twin-peaks']);
  } finally {
    await secondPage.close();
  }
});
