import { expect, test } from '@playwright/test';
import {
  expectWeatherRequestBudget,
  installDeterministicBrowserState,
  installWeatherHarness,
} from './weather-fixture';

const NORTH_AVENUE_BEACH_COORDINATES = '41.9117,-87.6264';
const CHICAGO_SPOT_URL = '/?spot=chi-north-ave-beach&view=now';
const OCEAN_BEACH_COORDINATES = '37.7594,-122.5107';
const OCEAN_BEACH_URL = '/?spot=sf-ocean-beach&view=now';
const MOUNT_BONNELL_COORDINATES = '30.3210,-97.7734';
const MOUNT_BONNELL_URL = '/?spot=atx-mount-bonnell&view=now';

function hourlyFixture(
  startIso: string,
  temperaturesByInstant: Record<string, number> = {},
): { forecast: Record<string, number[]>; airQuality: Record<string, number[]> } {
  const start = new Date(startIso).getTime();
  const time = Array.from({ length: 72 }, (_, index) => (start + index * 3_600_000) / 1_000);
  const instants = time.map((epochSeconds) => new Date(epochSeconds * 1_000).toISOString());
  const values = (build: (index: number) => number) => time.map((_, index) => build(index));

  return {
    forecast: {
      time,
      cloud_cover: values((index) => 12 + (index % 5)),
      cloud_cover_low: values((index) => 4 + (index % 3)),
      cloud_cover_mid: values((index) => 6 + (index % 4)),
      cloud_cover_high: values((index) => 18 + (index % 7)),
      visibility: values((index) => 24_000 + index * 100),
      relative_humidity_2m: values((index) => 52 + (index % 5)),
      temperature_2m: instants.map((instant, index) => temperaturesByInstant[instant] ?? 48 + (index % 8)),
      precipitation_probability: values((index) => index % 6),
      wind_speed_10m: values((index) => 5 + (index % 4)),
      wind_gusts_10m: values((index) => 8 + (index % 5)),
      wind_direction_10m: values((index) => (index * 25) % 360),
    },
    airQuality: {
      time,
      pm2_5: values((index) => 3 + (index % 4)),
      us_aqi: values((index) => 14 + (index % 5)),
    },
  };
}

async function installShareCapture(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        (window as typeof window & { __soleilShareData?: ShareData }).__soleilShareData = data;
      },
    });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
  });
}

test('keeps both fall-back 1 AM hours distinct and restores the shared occurrence', async ({ page }) => {
  await installDeterministicBrowserState(page, new Date('2026-11-01T00:15:00-05:00'));
  await installShareCapture(page);
  const harness = await installWeatherHarness(page);
  harness.hourlyByCoordinates.set(NORTH_AVENUE_BEACH_COORDINATES, hourlyFixture(
    '2026-11-01T05:00:00Z',
    {
      '2026-11-01T06:00:00.000Z': 61,
      '2026-11-01T07:00:00.000Z': 37,
    },
  ));
  await page.goto(CHICAGO_SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'North Avenue Beach sky scores' });
  const nowCard = dialog.locator('[data-card-type="now"]');
  const slider = nowCard.getByRole('slider', { name: 'Forecast hour' });
  await expect(dialog).toBeVisible();

  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Stargazing, Today · 1:00 AM CDT');
  await expect(nowCard.getByText('61°', { exact: true })).toBeVisible();

  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '2');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Stargazing, Today · 1:00 AM CST');
  await expect(nowCard.getByText('37°', { exact: true })).toBeVisible();
  await expect(dialog).toBeVisible();

  await nowCard.getByRole('button', {
    name: 'Share selected hour card for North Avenue Beach',
  }).click();
  await expect.poll(() => page.evaluate(
    () => (window as typeof window & { __soleilShareData?: ShareData }).__soleilShareData?.url ?? '',
  )).toContain('instant=2026-11-01T07%3A00%3A00Z');
  const capturedUrl = await page.evaluate(
    () => (window as typeof window & { __soleilShareData?: ShareData }).__soleilShareData?.url ?? '',
  );

  await page.goto(capturedUrl);
  const restored = page
    .getByRole('dialog', { name: 'North Avenue Beach sky scores' })
    .locator('[data-card-type="now"]');
  const restoredSlider = restored.getByRole('slider', { name: 'Forecast hour' });
  await expect(restoredSlider).toHaveAttribute('aria-valuenow', '2');
  await expect(restoredSlider).toHaveAttribute('aria-valuetext', 'Stargazing, Today · 1:00 AM CST');
  await expect(restored.getByText('37°', { exact: true })).toBeVisible();
});

test('does not synthesize a spring-forward 2 AM hour', async ({ page }) => {
  await installDeterministicBrowserState(page, new Date('2026-03-08T00:15:00-06:00'));
  const harness = await installWeatherHarness(page);
  harness.hourlyByCoordinates.set(
    NORTH_AVENUE_BEACH_COORDINATES,
    hourlyFixture('2026-03-08T06:00:00Z'),
  );
  await page.goto(CHICAGO_SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'North Avenue Beach sky scores' });
  const slider = dialog.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  await expect(dialog).toBeFocused();
  await slider.focus();
  await expect(slider).toBeFocused();
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Stargazing, Today · 1:00 AM');

  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '2');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Stargazing, Today · 3:00 AM');
  await expect(slider).not.toHaveAttribute('aria-valuetext', /2:00 AM/);
});

test('keeps the first repeated 1 AM live while identifying the second as CST', async ({ page }) => {
  await installDeterministicBrowserState(page, new Date('2026-11-01T01:15:00-05:00'));
  const harness = await installWeatherHarness(page);
  harness.hourlyByCoordinates.set(NORTH_AVENUE_BEACH_COORDINATES, hourlyFixture(
    '2026-11-01T05:00:00Z',
    {
      '2026-11-01T06:00:00.000Z': 61,
      '2026-11-01T07:00:00.000Z': 37,
    },
  ));
  await page.goto(CHICAGO_SPOT_URL);

  const nowCard = page
    .getByRole('dialog', { name: 'North Avenue Beach sky scores' })
    .locator('[data-card-type="now"]');
  const slider = nowCard.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Stargazing, Now · 1:15 AM CDT');
  await expect(nowCard.getByText('61°', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('Current forecast · high confidence', { exact: true })).toBeVisible();

  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Stargazing, Today · 1:00 AM CST');
  await expect(nowCard.getByText('37°', { exact: true })).toBeVisible();
});

test('keeps the repeated-hour score and evidence aligned across card, Search, and marker', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Cross-surface parity is exercised once in Chromium');
  await installDeterministicBrowserState(page, new Date('2026-11-01T00:15:00-07:00'));
  const harness = await installWeatherHarness(page);
  harness.hourlyByCoordinates.set(OCEAN_BEACH_COORDINATES, hourlyFixture(
    '2026-11-01T07:00:00Z',
    { '2026-11-01T09:00:00.000Z': 39 },
  ));
  await page.goto(`${OCEAN_BEACH_URL}&instant=2026-11-01T09%3A00%3A00Z`);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const nowCard = dialog.locator('[data-card-type="now"]');
  const scoreNode = dialog.locator('[aria-label^="Now score "]');
  await expect(nowCard.getByText('Selected-hour forecast · high confidence', { exact: true })).toBeVisible();
  const selectedScore = (await scoreNode.textContent())?.trim();
  expect(selectedScore).toMatch(/^\d{1,3}$/);
  await expect(scoreNode).toHaveAttribute(
    'aria-label',
    new RegExp(`^Now score ${selectedScore} out of 100, selected-hour forecast · high confidence, retrieved just now$`),
  );

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  const marker = page.locator('[aria-label^="Ocean Beach, score "]');
  await expect(marker).toHaveAttribute(
    'aria-label',
    new RegExp(`^Ocean Beach, score ${selectedScore} out of 100, selected-hour forecast · high confidence, retrieved just now$`),
  );

  await page.getByRole('button', { name: 'Search spots' }).click();
  const search = page.getByRole('dialog', { name: 'Search spots' });
  await search.getByPlaceholder('Search spots…').fill('Ocean Beach');
  await expect(search.getByText('Scores for Stargazing · Today at 1:00 AM PST', { exact: true })).toBeVisible();
  const result = search.getByRole('button', { name: /Ocean Beach/ });
  await expect(result.getByText('Selected-hour forecast · high confidence', { exact: true })).toBeVisible();
  await expect(result.locator('span').last()).toHaveText(selectedScore!);
});

test('normalizes ambiguous, missing, and unique legacy hour links honestly', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Legacy replay policy is exercised once in Chromium');
  await installDeterministicBrowserState(page, new Date('2026-11-01T00:15:00-05:00'));
  const harness = await installWeatherHarness(page);
  harness.hourlyByCoordinates.set(
    NORTH_AVENUE_BEACH_COORDINATES,
    hourlyFixture('2026-11-01T05:00:00Z'),
  );

  await page.goto(`${CHICAGO_SPOT_URL}&hour=2026-11-01T01`);
  let dialog = page.getByRole('dialog', { name: 'North Avenue Beach sky scores' });
  await expect(dialog.getByRole('slider', { name: 'Forecast hour' })).toHaveAttribute('aria-valuenow', '0');
  await expect(dialog.locator('[data-card-type="now"]').getByRole('heading', { level: 3 })).toHaveText('RIGHT NOW');

  await page.goto(`${CHICAGO_SPOT_URL}&hour=2026-11-01T02`);
  dialog = page.getByRole('dialog', { name: 'North Avenue Beach sky scores' });
  await expect(dialog.getByRole('slider', { name: 'Forecast hour' })).toHaveAttribute('aria-valuenow', '3');
  await expect(dialog.getByRole('slider', { name: 'Forecast hour' })).toHaveAttribute(
    'aria-valuetext',
    'Stargazing, Today · 2:00 AM',
  );

  await page.goto(`${CHICAGO_SPOT_URL}&instant=2026-11-05T12%3A00%3A00Z`);
  dialog = page.getByRole('dialog', { name: 'North Avenue Beach sky scores' });
  await expect(dialog.getByRole('slider', { name: 'Forecast hour' })).toHaveAttribute('aria-valuenow', '0');
  await expect(dialog.locator('[data-card-type="now"]').getByRole('heading', { level: 3 })).toHaveText('RIGHT NOW');
});

test('keeps a skipped spring legacy hour at Now', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Legacy replay policy is exercised once in Chromium');
  await installDeterministicBrowserState(page, new Date('2026-03-08T00:15:00-06:00'));
  const harness = await installWeatherHarness(page);
  harness.hourlyByCoordinates.set(
    NORTH_AVENUE_BEACH_COORDINATES,
    hourlyFixture('2026-03-08T06:00:00Z'),
  );
  await page.goto(`${CHICAGO_SPOT_URL}&hour=2026-03-08T02`);

  const dialog = page.getByRole('dialog', { name: 'North Avenue Beach sky scores' });
  await expect(dialog.getByRole('slider', { name: 'Forecast hour' })).toHaveAttribute('aria-valuenow', '0');
  await expect(dialog.locator('[data-card-type="now"]').getByRole('heading', { level: 3 })).toHaveText('RIGHT NOW');
});

test('preserves repeated Pacific hours for an SF spot', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Additional timezone coverage is exercised once in Chromium');
  await installDeterministicBrowserState(page, new Date('2026-11-01T00:15:00-07:00'));
  const harness = await installWeatherHarness(page);
  harness.hourlyByCoordinates.set(OCEAN_BEACH_COORDINATES, hourlyFixture(
    '2026-11-01T07:00:00Z',
    {
      '2026-11-01T08:00:00.000Z': 64,
      '2026-11-01T09:00:00.000Z': 39,
    },
  ));
  await page.goto(OCEAN_BEACH_URL);

  const card = page.getByRole('dialog', { name: 'Ocean Beach sky scores' }).locator('[data-card-type="now"]');
  const slider = card.getByRole('slider', { name: 'Forecast hour' });
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Stargazing, Today · 1:00 AM PDT');
  await expect(card.getByText('64°', { exact: true })).toBeVisible();
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Stargazing, Today · 1:00 AM PST');
  await expect(card.getByText('39°', { exact: true })).toBeVisible();
});

test('preserves repeated Central hours for an Austin spot', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Additional timezone coverage is exercised once in Chromium');
  await installDeterministicBrowserState(page, new Date('2026-11-01T00:15:00-05:00'));
  const harness = await installWeatherHarness(page);
  harness.hourlyByCoordinates.set(MOUNT_BONNELL_COORDINATES, hourlyFixture(
    '2026-11-01T05:00:00Z',
    {
      '2026-11-01T06:00:00.000Z': 72,
      '2026-11-01T07:00:00.000Z': 45,
    },
  ));
  await page.goto(MOUNT_BONNELL_URL);

  const card = page
    .getByRole('dialog', { name: 'Mount Bonnell (Covert Park) sky scores' })
    .locator('[data-card-type="now"]');
  const slider = card.getByRole('slider', { name: 'Forecast hour' });
  await expect(card.getByText('Current forecast · high confidence', { exact: true })).toBeVisible();
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Stargazing, Today · 1:00 AM CDT');
  await expect(card.getByText('72°', { exact: true })).toBeVisible();
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Stargazing, Today · 1:00 AM CST');
  await expect(card.getByText('45°', { exact: true })).toBeVisible();
});

test('uses the selected repeated instant for the weather overlay sample', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Overlay sampling is exercised once in Chromium');
  await installDeterministicBrowserState(page, new Date('2026-11-01T00:15:00-07:00'));
  const harness = await installWeatherHarness(page);
  harness.defaultHourly = hourlyFixture(
    '2026-11-01T07:00:00Z',
    {
      '2026-11-01T08:00:00.000Z': 80,
      '2026-11-01T09:00:00.000Z': 20,
    },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle weather overlay' }).click();

  const hours = page.getByRole('group', { name: 'Forecast hours' });
  const firstOccurrence = hours.getByRole('button', { name: /^Today · 1:00 AM PDT/ });
  const secondOccurrence = hours.getByRole('button', { name: /^Today · 1:00 AM PST/ });
  const scale = page.locator('[aria-label="Temperature color scale"]');
  const averageMarker = scale.locator('div.absolute');
  const accessibleMapSummary = page.locator('[data-weather-overlay-state]').getByRole('img');

  await firstOccurrence.click();
  await expect(firstOccurrence).toHaveAttribute('aria-pressed', 'true');
  await expect(averageMarker).toHaveAttribute('style', /top: 27\.2727%/);
  await expect(accessibleMapSummary).toHaveAttribute(
    'aria-label',
    /San Francisco weather map.*1:00 AM PDT/i,
  );

  await secondOccurrence.click();
  await expect(secondOccurrence).toHaveAttribute('aria-pressed', 'true');
  await expect(averageMarker).toHaveAttribute('style', /top: 100%/);
  await expect(accessibleMapSummary).toHaveAttribute(
    'aria-label',
    /San Francisco weather map.*1:00 AM PST/i,
  );
  await expect.poll(() => harness.requests.forecast.length).toBe(25);
  await expect.poll(() => harness.requests.active).toBe(0);
  expectWeatherRequestBudget(harness.requests, {
    forecast: 25,
    airQuality: 0,
    maxActive: 3,
    maxCoordinateJobs: 3,
  });
});
