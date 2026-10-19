import { expect, test } from '@playwright/test';
import { installDeterministicBrowserState, installWeatherHarness } from './weather-fixture';

test.beforeEach(async ({ page }) => {
  await installDeterministicBrowserState(page);
});

test('offers a broad sky window and uses populated ensemble fields without promising fog placement', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  const time = Array.from({ length: 192 }, (_, i) => Date.UTC(2026, 7, 29, 7) / 1000 + i * 3600);
  const fill = (n: number) => time.map(() => n);
  harness.defaultHourly = { forecast: { time, cloud_cover: fill(5), cloud_cover_low: fill(2),
    cloud_cover_mid: fill(3), cloud_cover_high: fill(4), visibility: fill(20000),
    relative_humidity_2m: fill(60), temperature_2m: fill(62), precipitation_probability: fill(0),
    wind_speed_10m: fill(8), wind_gusts_10m: fill(12), wind_direction_10m: fill(270) },
  airQuality: { time, pm2_5: fill(5), us_aqi: fill(20), aerosol_optical_depth: fill(0.1) } };
  let ensembleCalls = 0;
  await page.route(/^https:\/\/ensemble-api\.open-meteo\.com\//, async route => {
    ensembleCalls++;
    expect(new URL(route.request().url()).searchParams.get('hourly')).toBe('cloud_cover,visibility');
    const hourly: Record<string, number[]> = { time };
    for (let member = 0; member < 31; member++) {
      const suffix = member ? `_member${String(member).padStart(2, '0')}` : '';
      hourly[`cloud_cover${suffix}`] = fill(5);
      hourly[`visibility${suffix}`] = fill(20000);
    }
    await route.fulfill({ json: { hourly } });
  });
  await page.goto('/?spot=sf-ocean-beach&range=7d');
  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const outlook = dialog.locator('[data-weekly-outlook]');
  await expect(outlook).toContainText('Best sky outlook');
  await expect(outlook).toContainText('Cloud forecasts agree');
  await expect(dialog.getByRole('group', { name: 'Forecast day' }).getByRole('button')).toHaveCount(7);
  await outlook.getByRole('button').click();
  await expect(dialog.getByRole('button', { name: 'All 7 days' })).toBeVisible();
  await expect(dialog.locator('[data-card-type="now"] [data-sky-experience]')).toContainText(/Clear views|Golden light/);
  await dialog.getByRole('button', { name: 'Forecast confidence: Medium. Show details' }).click();
  const confidence = dialog.getByRole('region', { name: 'Forecast confidence details' });
  await expect(confidence).toContainText('31 ensemble members');
  await expect(confidence).toContainText('does not confirm fog placement or sky beauty');
  await expect(confidence).toContainText('experimental');
  await expect(confidence).toContainText('At least 180 min');
  expect(ensembleCalls).toBe(1);
});

test('keeps planning useful when optional ensemble data fails', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/?spot=sf-ocean-beach&range=7d');
  const outlook = page.locator('[data-weekly-outlook]');
  await expect(outlook).toContainText('Cloud agreement unavailable');
  await expect(outlook.getByRole('button')).toBeEnabled();
  await outlook.getByRole('button').click();
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toBeEnabled();
  await expect(page.locator('[data-primary-score]')).not.toContainText('NaN');
});
