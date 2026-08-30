import { expect, test } from '@playwright/test';
import {
  installDeterministicBrowserState,
  installWeatherHarness,
} from './weather-fixture';

const NORTH_AVENUE_BEACH_COORDINATES = '41.9117,-87.6264';
const CHICAGO_SPOT_URL = '/?spot=chi-north-ave-beach&view=now';

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

  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Stargazing, Today · 1:00 AM CDT');
  await expect(nowCard.getByText('61°', { exact: true })).toBeVisible();

  await page.keyboard.press('ArrowRight');
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
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Stargazing, Today · 1:00 AM');

  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '2');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Stargazing, Today · 3:00 AM');
  await expect(slider).not.toHaveAttribute('aria-valuetext', /2:00 AM/);
});
