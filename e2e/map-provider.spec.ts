import { expect, test, type Page, type Route } from '@playwright/test';
import { installDeterministicBrowserState } from './weather-fixture';

const LIBERTY_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const POSITRON_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

const EMPTY_OPENFREEMAP_STYLE = {
  version: 8,
  name: 'Soleil browser-test basemap',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#dce8ec' },
    },
  ],
};

interface ProviderIsolation {
  requests: string[];
  libertyRequests: string[];
  positronRequests: string[];
  weatherRequests: string[];
  cartoRequests: string[];
  unexpectedRequests: string[];
}

async function isolateProviderTraffic(
  page: Page,
  handleProviderStyle: (route: Route, styleUrl: string) => Promise<void>,
): Promise<ProviderIsolation> {
  const requests: string[] = [];
  const libertyRequests: string[] = [];
  const positronRequests: string[] = [];
  const weatherRequests: string[] = [];
  const cartoRequests: string[] = [];
  const unexpectedRequests: string[] = [];

  await page.route(/^https:\/\//, async (route) => {
    const url = route.request().url();
    requests.push(url);
    if (url === LIBERTY_STYLE_URL || url === POSITRON_STYLE_URL) {
      if (url === LIBERTY_STYLE_URL) libertyRequests.push(url);
      else positronRequests.push(url);
      await handleProviderStyle(route, url);
      return;
    }
    const hostname = new URL(url).hostname;
    if (hostname === 'api.open-meteo.com' || hostname === 'air-quality-api.open-meteo.com') {
      weatherRequests.push(url);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { hourly: { time: [] } },
      });
      return;
    }
    if (/carto(?:cdn)?\.com/i.test(url)) cartoRequests.push(url);
    unexpectedRequests.push(url);
    await route.abort('blockedbyclient');
  });

  return {
    requests,
    libertyRequests,
    positronRequests,
    weatherRequests,
    cartoRequests,
    unexpectedRequests,
  };
}

async function fulfillEmptyStyle(route: Route): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: EMPTY_OPENFREEMAP_STYLE,
  });
}

async function expectLinkedAttribution(page: Page): Promise<void> {
  const openFreeMap = page.getByRole('link', { name: 'OpenFreeMap', exact: true });
  const openMapTiles = page.getByRole('link', { name: '© OpenMapTiles', exact: true });
  const openStreetMap = page.getByRole('link', { name: 'OpenStreetMap', exact: true });

  await expect(openFreeMap).toBeVisible();
  await expect(openFreeMap).toHaveAttribute('href', 'https://openfreemap.org/');
  await expect(openMapTiles).toBeVisible();
  await expect(openMapTiles).toHaveAttribute('href', 'https://openmaptiles.org/');
  await expect(openStreetMap).toBeVisible();
  await expect(openStreetMap).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
}

async function selectAndExerciseNowSheet(page: Page, spotName: string) {
  await page.getByRole('button', { name: 'Search spots' }).click();
  const search = page.getByRole('dialog', { name: 'Search spots' });
  await expect(search).toBeVisible();
  await search.getByPlaceholder('Search spots…').fill(spotName);
  const result = search.locator('li').filter({ hasText: spotName }).getByRole('button').first();
  await expect(result).toBeVisible();
  await result.click();

  const sheet = page.getByRole('dialog', { name: `${spotName} sky scores` });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-card-type="now"]')).toBeVisible();
  await expect(sheet.getByRole('tab', { name: 'Show Now card' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Escape');
  await page.clock.runFor(350);
  await expect(sheet.getByRole('button', { name: `Expand ${spotName} details` })).toBeVisible();
  return sheet;
}

test.beforeEach(async ({ page }) => {
  await installDeterministicBrowserState(page);
});

test('requests the official Liberty style, never CARTO, and exposes linked attribution', async ({ page }) => {
  const traffic = await isolateProviderTraffic(page, (route) => fulfillEmptyStyle(route));

  await page.goto('/');

  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
  await expectLinkedAttribution(page);
  expect(traffic.libertyRequests.length).toBeGreaterThan(0);
  expect(new Set(traffic.libertyRequests)).toEqual(new Set([LIBERTY_STYLE_URL]));
  expect(traffic.cartoRequests).toEqual([]);
  expect(traffic.unexpectedRequests).toEqual([]);
});

test('keeps Weather controls and recovery above the Now sheet during a style outage', async ({ page }) => {
  let recoverProvider = false;
  let releaseRecovery = () => {};
  const recoveryGate = new Promise<void>((resolve) => {
    releaseRecovery = resolve;
  });
  const traffic = await isolateProviderTraffic(page, async (route) => {
    if (!recoverProvider) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        json: { error: 'simulated provider outage' },
      });
      return;
    }
    await recoveryGate;
    await fulfillEmptyStyle(route);
  });

  await page.goto('/');

  const notice = page.locator('.map-background-status');
  await expect(notice).toBeVisible();
  await expect(notice.locator('[role="status"]')).toHaveText(
    'Map background unavailable. Spot details still work, and weather will appear when its data loads.',
  );
  await expect(notice).not.toHaveAttribute('role', 'dialog');
  await expect(notice).not.toHaveAttribute('aria-modal', 'true');

  await selectAndExerciseNowSheet(page, 'Ocean Beach');
  await expect(notice).toBeVisible();

  const weatherToggle = page.getByRole('button', { name: 'Toggle weather overlay' });
  await weatherToggle.click();
  await expect(weatherToggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => traffic.positronRequests.length).toBeGreaterThan(0);
  await expect(notice).toBeVisible();

  const spotSheet = await selectAndExerciseNowSheet(page, 'Twin Peaks');
  await expect(notice).toBeVisible();

  const retry = page.getByRole('button', { name: 'Retry map background' });
  await expect(retry).toBeVisible();
  await expect(retry).toBeEnabled();
  await expect(retry).toBeInViewport();
  const [noticeBox, retryBox, sheetBox] = await Promise.all([
    notice.boundingBox(),
    retry.boundingBox(),
    spotSheet.boundingBox(),
  ]);
  expect(noticeBox).not.toBeNull();
  expect(retryBox).not.toBeNull();
  expect(sheetBox).not.toBeNull();
  expect(retryBox!.height).toBeGreaterThanOrEqual(44);
  expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(sheetBox!.y);

  recoverProvider = true;
  await retry.click();

  const retrying = page.getByRole('button', { name: 'Retrying map background' });
  await expect(notice.locator('[role="status"]')).toHaveText('Retrying map background.');
  await expect(retrying).toBeVisible();
  await expect(retrying).toBeDisabled();
  await expect(retrying).toHaveAttribute('aria-disabled', 'true');
  await expect(retrying).toBeFocused();
  await expect(retrying).toHaveCSS('min-height', '44px');

  releaseRecovery();

  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
  await expectLinkedAttribution(page);
  await expect(notice.locator('[role="status"]')).toHaveText('Map background restored.');
  await expect(page.locator('.leaflet-container')).toBeFocused();
  await page.clock.runFor(3_000);
  await expect(notice).toBeHidden();
  await expect(page.locator('.leaflet-container')).toBeFocused();
  expect(traffic.libertyRequests.length).toBeGreaterThan(0);
  expect(traffic.positronRequests.length).toBeGreaterThanOrEqual(2);
  expect(traffic.weatherRequests.length).toBeGreaterThan(0);
  expect(traffic.cartoRequests).toEqual([]);
  expect(traffic.unexpectedRequests).toEqual([]);
});
