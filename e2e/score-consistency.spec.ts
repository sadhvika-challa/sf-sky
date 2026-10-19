import { expect, test } from '@playwright/test';
import { installDeterministicBrowserState, installWeatherHarness, OCEAN_BEACH_COORDINATES } from './weather-fixture';

const time = Array.from({ length: 192 }, (_, i) => Date.UTC(2026, 7, 29, 7) / 1000 + i * 3600);
const values = (n: number) => time.map(() => n);
function sky(fog = false) {
  return { forecast: { time, cloud_cover: values(fog ? 100 : 5), cloud_cover_low: values(fog ? 100 : 2),
    cloud_cover_mid: values(3), cloud_cover_high: values(4), visibility: values(fog ? 500 : 20000),
    relative_humidity_2m: values(fog ? 99 : 60), temperature_2m: values(62), precipitation_probability: values(0),
    wind_speed_10m: values(8), wind_gusts_10m: values(12), wind_direction_10m: values(270) },
  airQuality: { time, pm2_5: values(5), us_aqi: values(20), aerosol_optical_depth: values(0.1) } };
}
test.beforeEach(async ({ page }) => {
  await installDeterministicBrowserState(page);
});

test('uses the spot forecast before opening, without replacing it with city weather', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  harness.defaultHourly = sky(true);
  harness.hourlyByCoordinates.set(OCEAN_BEACH_COORDINATES, sky());
  const local = harness.deferForecast(OCEAN_BEACH_COORDINATES);
  await page.goto('/?spot=sf-ocean-beach&view=now');
  await local.requested;
  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const score = dialog.locator('[data-active-score]');
  const pin = page.getByRole('button', { name: /^Ocean Beach, score / });
  try {
    await expect(score).toHaveText('--');
    await expect(pin).toHaveText('--');
  } finally { local.release(); }
  await expect(score).toHaveText(/^\d+$/);
  const exact = await score.innerText();
  expect(Number(exact)).toBeGreaterThan(60);
  await expect(pin).toHaveText(exact);
  const callsBeforeReopen = harness.requests.forecast.filter(c => c === OCEAN_BEACH_COORDINATES).length;
  await page.keyboard.press('Escape');
  await expect(pin).toHaveText(exact);
  await pin.click();
  await expect(dialog.locator('[data-active-score]')).toHaveText(exact);
  expect(harness.requests.forecast.filter(c => c === OCEAN_BEACH_COORDINATES)).toHaveLength(callsBeforeReopen);
});

test('updates every loaded visible dot to its own 7 PM forecast without hourly requests', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  harness.defaultHourly = sky(true);
  const twin = sky(true);
  const tank = sky();
  const selected = time.indexOf(Date.parse('2026-08-30T02:00:00Z') / 1000);
  for (const field of Object.keys(twin.forecast) as Array<keyof typeof twin.forecast>) {
    if (field === 'time') continue;
    twin.forecast[field][selected] = sky().forecast[field][selected];
    tank.forecast[field][selected] = sky(true).forecast[field][selected];
  }
  const twinCoordinates = '37.7544,-122.4477';
  const tankCoordinates = '37.7610,-122.4480';
  harness.hourlyByCoordinates.set(twinCoordinates, twin);
  harness.hourlyByCoordinates.set(tankCoordinates, tank);
  await page.goto('/');
  const twinPin = page.getByRole('button', { name: /^Twin Peaks, score / });
  const tankPin = page.getByRole('button', { name: /^Tank Hill Park, score / });
  await expect(twinPin).toHaveText(/^\d+$/);
  await expect(tankPin).toHaveText(/^\d+$/);
  const twinBefore = Number(await twinPin.innerText());
  const tankBefore = Number(await tankPin.innerText());
  expect(tankBefore).toBeGreaterThan(twinBefore + 20);
  await page.getByRole('slider', { name: 'Forecast hour' }).press('ArrowRight');
  await expect(page.locator('[data-selected-time]')).toContainText('7:00 PM');
  await expect.poll(async () => Number(await twinPin.innerText())).toBeGreaterThan(twinBefore + 30);
  expect(Number(await tankPin.innerText())).toBeLessThan(tankBefore - 20);
  const atSeven = await twinPin.innerText();
  await twinPin.click();
  const dialog = page.getByRole('dialog', { name: 'Twin Peaks sky scores' });
  await expect(dialog.locator('[data-active-score]')).toHaveText(atSeven);
  await expect(page.locator('[data-selected-time]')).toContainText('7:00 PM');
  expect(harness.requests.forecast.filter(c => c === twinCoordinates)).toHaveLength(1);
  expect(harness.requests.forecast.filter(c => c === tankCoordinates)).toHaveLength(1);
});

test('opens the weekly outlook at a recommended daytime window instead of midnight', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  const data = sky(true);
  const day = sky();
  for (const [field, values] of Object.entries(data.forecast)) {
    if (field === 'time') continue;
    for (let i = 0; i < values.length; i++) if (i % 24 >= 10 && i % 24 <= 17) {
      values[i] = day.forecast[field as keyof typeof day.forecast][i];
    }
  }
  harness.defaultHourly = data;
  await page.goto('/?spot=sf-ocean-beach&range=7d');
  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  await expect(dialog.locator('[data-card-type="now"] [data-sky-experience]')).toContainText(/Clear views|Golden light/);
  await expect(page.locator('[data-selected-time]')).not.toContainText('12:00 AM');
  expect(Number(await dialog.locator('[data-active-score]').innerText())).toBeGreaterThan(60);
  await expect(page.getByRole('button', { name: /^Ocean Beach, score / })).toHaveText(await dialog.locator('[data-active-score]').innerText());
});

test('preserves an explicit nighttime selection and its valid poor score', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  harness.defaultHourly = sky(true);
  await page.goto('/?spot=sf-ocean-beach&range=7d&instant=2026-08-30T07%3A00%3A00Z');
  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  await expect(dialog.locator('[data-active-score]')).toHaveText(/^\d+$/);
  await expect(dialog.locator('[data-active-score]')).toHaveText('0');
  await expect(page.locator('[data-selected-time]')).toHaveAttribute('data-selected-instant', '2026-08-30T07:00:00.000Z');
  await expect(dialog.locator('[data-card-type="now"] [data-sky-experience]')).toContainText('Poor');
});
