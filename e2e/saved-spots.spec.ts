import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  assertNoLiveOpenMeteoTraffic,
  installDeterministicBrowserState,
  installWeatherHarness,
} from './weather-fixture';

const DATABASE_NAME = 'soleil-device-storage';
const OBJECT_STORE_NAME = 'key-values';
const STORAGE_KEY = 'soleil:saved-spots';

const OCEAN_BEACH = { id: 'sf-ocean-beach', name: 'Ocean Beach', city: 'San Francisco' };
const MOUNT_BONNELL = {
  id: 'atx-mount-bonnell',
  name: 'Mount Bonnell (Covert Park)',
  city: 'Austin',
};
const WEST_CLIFF = {
  id: 'sc-west-cliff',
  name: 'West Cliff Drive (Lighthouse Point)',
  city: 'Santa Cruz',
};
const NORTH_AVENUE_BEACH = {
  id: 'chi-north-ave-beach',
  name: 'North Avenue Beach',
  city: 'Chicago',
};

interface SavedPayload {
  version: number;
  spotIds: string[];
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(`${name}-${testInfo.project.name}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

async function openDatabase(page: Page): Promise<void> {
  await page.evaluate(async ({ databaseName, objectStoreName }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(objectStoreName)) {
          request.result.createObjectStore(objectStoreName);
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });
  }, { databaseName: DATABASE_NAME, objectStoreName: OBJECT_STORE_NAME });
}

async function setAuthoritativeRaw(page: Page, raw: string | null): Promise<void> {
  await openDatabase(page);
  await page.evaluate(async ({ databaseName, objectStoreName, key, value }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(objectStoreName, 'readwrite');
        if (value === null) transaction.objectStore(objectStoreName).delete(key);
        else transaction.objectStore(objectStoreName).put(value, key);
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      };
    });
  }, {
    databaseName: DATABASE_NAME,
    objectStoreName: OBJECT_STORE_NAME,
    key: STORAGE_KEY,
    value: raw,
  });
}

async function authoritativeRaw(page: Page): Promise<string | null> {
  return page.evaluate(async ({ databaseName, objectStoreName, key }) =>
    new Promise<string | null>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(objectStoreName, 'readonly');
        const read = transaction.objectStore(objectStoreName).get(key);
        read.onerror = () => reject(read.error);
        read.onsuccess = () => resolve((read.result as string | null | undefined) ?? null);
        transaction.oncomplete = () => database.close();
      };
    }),
  { databaseName: DATABASE_NAME, objectStoreName: OBJECT_STORE_NAME, key: STORAGE_KEY });
}

async function authoritativePayload(page: Page): Promise<SavedPayload | null> {
  const raw = await authoritativeRaw(page);
  return raw === null ? null : JSON.parse(raw) as SavedPayload;
}

async function resetSavedSpots(page: Page): Promise<void> {
  // The application entry is route-split. Wait for the app route to mount
  // before mutating durable state so an in-flight hydration cannot overwrite
  // the test fixture after it is seeded.
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  await setAuthoritativeRaw(page, null);
  await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
}

async function seedSavedSpots(page: Page, ids: string[]): Promise<void> {
  await setAuthoritativeRaw(page, JSON.stringify({ version: 1, spotIds: ids }));
}

async function selectSpotFromSearch(page: Page, name: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Search spots' }).click();
  const search = page.getByRole('dialog', { name: 'Search spots' });
  await search.getByPlaceholder('Search spots…').fill(name);
  const result = search.getByRole('button', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  await expect(result).toBeVisible();
  await result.click();
  await expect(search).toBeHidden();
  const sheet = page.getByRole('dialog', { name: new RegExp(`${name} sky scores`) });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function saveButton(sheet: Locator, name: string): Promise<Locator> {
  const button = sheet.getByRole('button', {
    name: new RegExp(`^(Save ${name}|Remove ${name} from saved spots)$`),
  });
  await expect(button).toBeVisible();
  return button;
}

async function openSavedSpots(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Settings' }).click();
  const open = page.getByRole('button', { name: /Saved spots/i });
  await expect(open).toBeVisible();
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Saved spots' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function dismissSpotSheet(page: Page, name: string): Promise<void> {
  const sheet = page.getByRole('dialog', { name: `${name} sky scores` });
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveAttribute('aria-modal', 'false');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
}

async function countSettingsLabel(page: Page, count: number): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: /Saved spots/i }))
    .toHaveAccessibleName(`Saved spots, ${count}`);
  await page.keyboard.press('Escape');
}

async function installIndexedDbUnavailable(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: undefined,
    });
  });
}

async function failFutureReadwriteTransactions(page: Page): Promise<void> {
  await page.evaluate(() => {
    const prototype = IDBDatabase.prototype;
    const nativeTransaction = prototype.transaction;
    Object.defineProperty(prototype, 'transaction', {
      configurable: true,
      value(this: IDBDatabase, storeNames: string | string[], mode?: IDBTransactionMode) {
        if (mode === 'readwrite') throw new DOMException('Simulated quota failure', 'QuotaExceededError');
        return nativeTransaction.call(this, storeNames, mode);
      },
    });
  });
}

async function expectFocusInside(dialog: Locator): Promise<void> {
  await expect.poll(() => dialog.evaluate((modal) => modal.contains(document.activeElement)))
    .toBe(true);
  await expect(dialog).toBeVisible();
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !['desktop-chromium', 'mobile-webkit'].includes(testInfo.project.name),
    'Saved-spots acceptance runs on desktop Chromium and narrow mobile WebKit.',
  );
  await installDeterministicBrowserState(page);
});

test('saves from the selected sheet, confirms durability, and persists across relaunch', async ({ context, page }, testInfo) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpots(page);
  await page.reload();

  const sheet = await selectSpotFromSearch(page, OCEAN_BEACH.name);
  const toggle = await saveButton(sheet, OCEAN_BEACH.name);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status')).toContainText(/saved.*device/i);
  await expect.poll(() => authoritativePayload(page)).toEqual({
    version: 1,
    spotIds: [OCEAN_BEACH.id],
  });

  await dismissSpotSheet(page, OCEAN_BEACH.name);
  await countSettingsLabel(page, 1);
  await capture(page, testInfo, 'saved-from-spot-sheet');
  await page.close();

  const relaunched = await context.newPage();
  await installWeatherHarness(relaunched);
  await relaunched.goto('/');
  const saved = await openSavedSpots(relaunched);
  await expect(saved.getByText(OCEAN_BEACH.name, { exact: true })).toBeVisible();
  await expect(saved).toContainText(OCEAN_BEACH.city);
});

test('shows one all-city collection and opens a cross-city saved spot without duplicate forecasts', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpots(page);
  await seedSavedSpots(page, [
    OCEAN_BEACH.id,
    MOUNT_BONNELL.id,
    WEST_CLIFF.id,
    NORTH_AVENUE_BEACH.id,
  ]);
  await page.reload();

  const saved = await openSavedSpots(page);
  await expect(saved.getByText(OCEAN_BEACH.name, { exact: true })).toBeVisible();
  await expect(saved.getByText(MOUNT_BONNELL.name, { exact: true })).toBeVisible();
  await expect(saved.getByText(WEST_CLIFF.name, { exact: true })).toBeVisible();
  await expect(saved.getByText(NORTH_AVENUE_BEACH.name, { exact: true })).toBeVisible();
  await expect(saved).toContainText('San Francisco');
  await expect(saved).toContainText('Austin');
  await expect(saved).toContainText('Santa Cruz');
  await expect(saved).toContainText('Chicago');

  const beforeForecast = harness.requests.forecast.length;
  const beforeAirQuality = harness.requests.airQuality.length;
  await saved.getByRole('button', { name: `Open ${MOUNT_BONNELL.name}` }).click();
  await expect(page.getByRole('dialog', { name: `${MOUNT_BONNELL.name} sky scores` })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sky:activeCity'))).toBe('austin');
  await expect.poll(() => harness.requests.forecast.length - beforeForecast).toBe(1);
  await expect.poll(() => harness.requests.airQuality.length - beforeAirQuality).toBe(1);
  expect(new Set(harness.requests.forecast.slice(beforeForecast)).size).toBe(1);
  expect(new Set(harness.requests.airQuality.slice(beforeAirQuality)).size).toBe(1);
  assertNoLiveOpenMeteoTraffic(harness.requests);
});

test('unsaves from the sheet and collection, then preserves both removals after reload', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpots(page);
  await seedSavedSpots(page, [OCEAN_BEACH.id, MOUNT_BONNELL.id]);
  await page.reload();

  const sheet = await selectSpotFromSearch(page, OCEAN_BEACH.name);
  const sheetToggle = await saveButton(sheet, OCEAN_BEACH.name);
  await sheetToggle.click();
  await expect(page.getByRole('status')).toContainText(/removed|no longer saved/i);
  await dismissSpotSheet(page, OCEAN_BEACH.name);

  const saved = await openSavedSpots(page);
  await saved.getByRole('button', { name: `Remove ${MOUNT_BONNELL.name} from saved spots` }).click();
  const confirmation = saved.getByRole('group', { name: `Confirm removing ${MOUNT_BONNELL.name}` });
  await confirmation.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(saved.getByText(MOUNT_BONNELL.name, { exact: true })).toBeHidden();
  await expect(saved).toContainText(/no saved spots/i);
  await expect.poll(() => authoritativePayload(page)).toEqual({ version: 1, spotIds: [] });

  await saved.getByRole('button', { name: 'Close saved spots' }).click();
  await page.reload();
  const reloaded = await openSavedSpots(page);
  await expect(reloaded).toContainText(/no saved spots/i);
  await reloaded.getByRole('button', { name: 'Close saved spots' }).click();
  await countSettingsLabel(page, 0);
});

test('renders loading and empty states with device-only, no-sync guidance', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(IDBOpenDBRequest.prototype, 'onsuccess')
      ?? Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'onsuccess');
    if (!descriptor?.set || !descriptor.get) return;
    Object.defineProperty(IDBOpenDBRequest.prototype, 'onsuccess', {
      configurable: true,
      get: descriptor.get,
      set(handler: ((this: IDBRequest, event: Event) => unknown) | null) {
        descriptor.set!.call(this, handler === null ? null : function delayed(this: IDBRequest, event: Event) {
          window.setTimeout(() => handler.call(this, event), 5_000);
        });
      },
    });
  });
  await installWeatherHarness(page);
  await page.goto('/');

  const saved = await openSavedSpots(page);
  await expect(saved).toContainText(/loading saved spots/i);
  await expect(saved).toContainText(/saves stay on this device/i);
  await expect(saved).toContainText(/do not sync|won't sync|doesn't sync/i);
  await expect(saved).toContainText(/no saved spots/i);
  await expect(saved).toContainText(/open a spot|save.*spot/i);
  await capture(page, testInfo, 'saved-spots-empty');
});

test('recovers from corrupt legacy data through an honest empty state and a new durable save', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await setAuthoritativeRaw(page, '{not valid json');
  await page.reload();

  const saved = await openSavedSpots(page);
  await expect(saved).toContainText(/could not be read/i);
  await page.keyboard.press('Escape');

  const sheet = await selectSpotFromSearch(page, OCEAN_BEACH.name);
  await (await saveButton(sheet, OCEAN_BEACH.name)).click();
  await expect(page.getByRole('status')).toContainText(/saved.*device/i);
  await expect.poll(() => authoritativePayload(page)).toEqual({
    version: 1,
    spotIds: [OCEAN_BEACH.id],
  });
});

test('protects a future saved-spots version without exposing or overwriting it', async ({ page }) => {
  const futureRaw = JSON.stringify({ version: 99, spotIds: [OCEAN_BEACH.id], future: true });
  await installWeatherHarness(page);
  await page.goto('/');
  await setAuthoritativeRaw(page, futureRaw);
  await page.reload();

  const saved = await openSavedSpots(page);
  await expect(saved).toContainText(/newer version|protected|update Soleil/i);
  await expect(saved.getByRole('button', { name: /remove .* from saved spots/i })).toHaveCount(0);
  await page.keyboard.press('Escape');
  const sheet = await selectSpotFromSearch(page, OCEAN_BEACH.name);
  const save = sheet.getByRole('button', { name: new RegExp(`Save ${OCEAN_BEACH.name}`) });
  if (await save.count()) await expect(save).toBeDisabled();
  expect(await authoritativeRaw(page)).toBe(futureRaw);
});

test('fails closed when IndexedDB is unavailable and never claims a save', async ({ page }) => {
  await installIndexedDbUnavailable(page);
  await installWeatherHarness(page);
  await page.goto('/');

  const saved = await openSavedSpots(page);
  await expect(saved).toContainText(/could not be read/i);
  await page.keyboard.press('Escape');
  const sheet = await selectSpotFromSearch(page, OCEAN_BEACH.name);
  const toggle = await saveButton(sheet, OCEAN_BEACH.name);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('status')).toContainText(/could not save|couldn't save|not saved/i);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull();
});

test('rolls back an optimistic save after an IndexedDB write failure with honest feedback', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpots(page);
  await seedSavedSpots(page, []);
  await page.reload();
  const durableBefore = await authoritativeRaw(page);
  expect(durableBefore).not.toBeNull();
  await failFutureReadwriteTransactions(page);

  const sheet = await selectSpotFromSearch(page, OCEAN_BEACH.name);
  const toggle = await saveButton(sheet, OCEAN_BEACH.name);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('status')).toContainText(/could not save|couldn't save|not saved/i);
  expect(await authoritativeRaw(page)).toBe(durableBefore);
});

test('keeps the bundled saved catalog usable offline', async ({ context, page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpots(page);
  await seedSavedSpots(page, [MOUNT_BONNELL.id]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  await context.setOffline(true);

  const saved = await openSavedSpots(page);
  await expect(saved.getByText(MOUNT_BONNELL.name, { exact: true })).toBeVisible();
  await expect(saved).toContainText(MOUNT_BONNELL.city);
  await saved.getByRole('button', { name: `Open ${MOUNT_BONNELL.name}` }).click();
  await expect(page.getByRole('dialog', { name: `${MOUNT_BONNELL.name} sky scores` })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sky:activeCity'))).toBe('austin');
});

test('provides keyboard-operable controls and stable accessible names', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpots(page);
  await seedSavedSpots(page, [OCEAN_BEACH.id]);
  await page.reload();

  await page.getByRole('button', { name: 'Settings' }).focus();
  await page.keyboard.press('Enter');
  const opener = page.getByRole('button', { name: /Saved spots/i });
  await opener.focus();
  await expect(opener).toBeFocused();
  await page.keyboard.press('Enter');
  const saved = page.getByRole('dialog', { name: 'Saved spots' });
  await expect(saved).toBeVisible();

  const spot = saved.getByRole('button', { name: `Open ${OCEAN_BEACH.name}` });
  await spot.focus();
  await expect(spot).toBeFocused();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: `${OCEAN_BEACH.name} sky scores` });
  await expect(sheet).toBeVisible();
  await expect(sheet).toBeFocused();
  const remove = sheet.getByRole('button', { name: `Remove ${OCEAN_BEACH.name} from saved spots` });
  await remove.focus();
  await expect(remove).toBeFocused();
  await remove.press('Enter');
  await expect(sheet.getByRole('button', { name: `Save ${OCEAN_BEACH.name}` }))
    .toHaveAttribute('aria-pressed', 'false');
});

test('Escape closes only saved spots and preserves the collapsed spot sheet state', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpots(page);
  await seedSavedSpots(page, [OCEAN_BEACH.id]);
  await page.reload();

  const spotSheet = await selectSpotFromSearch(page, OCEAN_BEACH.name);
  await page.keyboard.press('Escape');
  await expect(spotSheet).toHaveAttribute('aria-modal', 'false');

  const saved = await openSavedSpots(page);
  await page.keyboard.press('Escape');
  await expect(saved).toBeHidden();
  await expect(spotSheet).toBeVisible();
  await expect(spotSheet).toHaveAttribute('aria-modal', 'false');
});

test('Escape closes only saved spots and preserves the expanded spot sheet state', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpots(page);
  await seedSavedSpots(page, [OCEAN_BEACH.id]);
  await page.reload();

  const spotSheet = await selectSpotFromSearch(page, OCEAN_BEACH.name);
  await expect(spotSheet).toHaveAttribute('aria-modal', 'true');

  // The expanded score sheet intentionally owns the pointer backdrop. Invoke
  // the still-visible public Settings control through its native activation so
  // this regression can verify modal key routing without inventing app state.
  await page.getByRole('button', { name: 'Settings' }).evaluate((button: HTMLButtonElement) => {
    button.click();
  });
  const savedEntry = page.getByRole('button', { name: 'Saved spots, 1', exact: true });
  await savedEntry.evaluate((button: HTMLButtonElement) => button.click());
  const saved = page.getByRole('dialog', { name: 'Saved spots' });
  await expect(saved).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(saved).toBeHidden();
  await expect(spotSheet).toBeVisible();
  await expect(spotSheet).toHaveAttribute('aria-modal', 'true');
});

test('traps natural forward and reverse tab navigation inside saved spots', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpots(page);
  await seedSavedSpots(page, [OCEAN_BEACH.id, MOUNT_BONNELL.id]);
  await page.reload();

  const saved = await openSavedSpots(page);
  const close = saved.getByRole('button', { name: 'Close saved spots' });
  await expect(close).toBeFocused();

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab');
    await expectFocusInside(saved);
  }
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Shift+Tab');
    await expectFocusInside(saved);
  }
});

test('moves focus into the selected saved spot sheet', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpots(page);
  await seedSavedSpots(page, [OCEAN_BEACH.id]);
  await page.reload();

  const saved = await openSavedSpots(page);
  const open = saved.getByRole('button', { name: `Open ${OCEAN_BEACH.name}` });
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(saved).toBeHidden();

  const spotSheet = page.getByRole('dialog', { name: `${OCEAN_BEACH.name} sky scores` });
  await expect(spotSheet).toBeVisible();
  await expect(spotSheet).toBeFocused();
});

test('restores focus into an existing collapsed sheet when reselecting the same saved spot', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpots(page);
  await seedSavedSpots(page, [OCEAN_BEACH.id]);
  await page.reload();

  const spotSheet = await selectSpotFromSearch(page, OCEAN_BEACH.name);
  await page.keyboard.press('Escape');
  await expect(spotSheet).toHaveAttribute('aria-modal', 'false');

  const saved = await openSavedSpots(page);
  const openSameSpot = saved.getByRole('button', { name: `Open ${OCEAN_BEACH.name}` });
  await openSameSpot.focus();
  await page.keyboard.press('Enter');

  await expect(saved).toBeHidden();
  await expect(spotSheet).toBeVisible();
  await expect(spotSheet).toHaveAttribute('aria-modal', 'false');
  await expect(spotSheet).toBeFocused();
});

test('does not offer rehydrate Retry after a failed save write', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpots(page);
  await seedSavedSpots(page, []);
  await page.reload();
  await failFutureReadwriteTransactions(page);

  const spotSheet = await selectSpotFromSearch(page, OCEAN_BEACH.name);
  await (await saveButton(spotSheet, OCEAN_BEACH.name)).click();
  await expect(spotSheet.getByRole('status')).toContainText(/was not saved.*try again/i);
  await dismissSpotSheet(page, OCEAN_BEACH.name);

  const saved = await openSavedSpots(page);
  await expect(saved).toContainText('The last change was not saved on this device.');
  await expect(saved.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
  await expect.poll(() => authoritativePayload(page)).toEqual({ version: 1, spotIds: [] });
});

test('retains a row and suppresses rehydrate Retry after failed removal', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await resetSavedSpots(page);
  await seedSavedSpots(page, [OCEAN_BEACH.id]);
  await page.reload();
  await countSettingsLabel(page, 1);
  await failFutureReadwriteTransactions(page);

  const saved = await openSavedSpots(page);
  await saved.getByRole('button', { name: `Remove ${OCEAN_BEACH.name} from saved spots` }).click();
  const confirmation = saved.getByRole('group', { name: `Confirm removing ${OCEAN_BEACH.name}` });
  await confirmation.getByRole('button', { name: 'Remove', exact: true }).click();

  await expect(saved.getByRole('button', { name: `Open ${OCEAN_BEACH.name}` })).toBeVisible();
  await expect(saved.getByRole('status').filter({ hasText: `${OCEAN_BEACH.name} was not removed` }))
    .toContainText(`${OCEAN_BEACH.name} was not removed. Try again.`);
  await expect(saved).toContainText('The last change was not saved on this device.');
  await expect(saved.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
  await expect.poll(() => authoritativePayload(page)).toEqual({
    version: 1,
    spotIds: [OCEAN_BEACH.id],
  });
});
