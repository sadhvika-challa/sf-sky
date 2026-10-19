import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { installDeterministicBrowserState, installWeatherHarness, OCEAN_BEACH_COORDINATES } from './weather-fixture';

const now = new Date('2026-10-18T16:00:00-07:00');
const time = Array.from({ length: 192 }, (_, i) => Date.UTC(2026, 9, 18, 7) / 1000 + i * 3600);
const values = (n: number) => time.map(() => n);
function weather(fog = false) {
  return { forecast: { time, cloud_cover: values(fog ? 100 : 5), cloud_cover_low: values(fog ? 100 : 2),
    cloud_cover_mid: values(3), cloud_cover_high: values(4), visibility: values(fog ? 500 : 20000),
    relative_humidity_2m: values(fog ? 99 : 60), temperature_2m: values(62), precipitation_probability: values(0),
    wind_speed_10m: values(8), wind_gusts_10m: values(12), wind_direction_10m: values(270) },
  airQuality: { time, pm2_5: values(5), us_aqi: values(20), aerosol_optical_depth: values(0.1) } };
}
const twinCoordinates = '37.7544,-122.4477';

test.beforeEach(async ({ page }) => {
  await installDeterministicBrowserState(page, now);
});

test('compares sunset spots at one time and keeps twilight, dots, and opened cards aligned', async ({ page }, testInfo) => {
  const harness = await installWeatherHarness(page);
  harness.defaultHourly = weather(true);
  harness.hourlyByCoordinates.set(twinCoordinates, weather());
  harness.hourlyByCoordinates.set(OCEAN_BEACH_COORDINATES, weather());
  await page.goto('/');
  await expect(page.locator('[data-spot-forecast-progress]')).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Sunset spots', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'Compare sky spots' });
  await expect(comparison).toBeVisible();
  const candidate = comparison.getByRole('button', { name: /^Open Twin Peaks, score/ });
  await expect(candidate).toBeVisible();
  const score = (await candidate.getAttribute('aria-label'))!.match(/score (\d+) out of 100/)![1];
  await expect(page.getByRole('button', { name: /^Twin Peaks, score/ })).toHaveText(score);
  await candidate.click();
  const dialog = page.getByRole('dialog', { name: 'Twin Peaks sky scores' });
  await expect(dialog.locator('[data-active-score]')).toHaveText(score);
  const before = harness.requests.forecast.filter(key => key === twinCoordinates).length;
  await page.getByRole('slider', { name: 'Forecast hour' }).press('ArrowRight');
  await expect(page.locator('[data-selected-time]')).toContainText('7:00 PM');
  await expect(dialog.locator('[data-card-type="now"] [data-sky-experience]')).toContainText('Blue twilight');
  const atSeven = await dialog.locator('[data-active-score]').innerText();
  expect(Number(atSeven)).toBeGreaterThanOrEqual(60);
  await expect(page.getByRole('button', { name: /^Twin Peaks, score/ })).toHaveText(atSeven);
  await expect(dialog.locator('[data-card-type="now"] [data-sky-duration]')).toContainText(/About \d+ min/);
  await expect(page.getByRole('group', { name: 'Timeline scrubber' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(comparison.getByRole('button', { name: /^Open Twin Peaks, score/ })).toHaveAttribute('aria-label', new RegExp(`score ${atSeven} out of 100.*7:00 PM`));
  expect(harness.requests.forecast.filter(key => key === twinCoordinates)).toHaveLength(before);
  const audit = await new AxeBuilder({ page }).include('[data-sunset-comparison]').analyze();
  expect(audit.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('sunset-comparison.png') });
});

test('recommends a spot-specific sunset time and restores its exact shared selection', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Exact share replay is exercised once in Chromium.');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
      (window as typeof window & { __sunsetShared?: ShareData }).__sunsetShared = data;
    } });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
  });
  const harness = await installWeatherHarness(page);
  harness.defaultHourly = weather();
  await page.goto('/?spot=sf-twin-peaks&view=now&instant=2026-10-19T02%3A00%3A00Z');
  const dialog = page.getByRole('dialog', { name: 'Twin Peaks sky scores' });
  const bestTime = dialog.locator('[data-best-sunset-time]');
  await expect(bestTime).toContainText('Best sunset period');
  await bestTime.click();
  const selected = await page.locator('[data-selected-time]').getAttribute('data-selected-instant');
  expect(new Date(selected!).getUTCMinutes()).not.toBe(0);
  const score = await dialog.locator('[data-active-score]').innerText();
  await expect(page.getByRole('button', { name: /^Twin Peaks, score/ })).toHaveText(score);
  await dialog.locator('[data-card-type="now"]').getByRole('button', { name: /Share selected hour card/ }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __sunsetShared?: ShareData }).__sunsetShared?.url)).toContain('event=');
  const shared = await page.evaluate(() => (window as typeof window & { __sunsetShared?: ShareData }).__sunsetShared!.url!);
  await page.goto(shared);
  await expect(page.locator('[data-selected-time]')).toHaveAttribute('data-selected-instant', selected!);
  await expect(page.getByRole('dialog', { name: 'Twin Peaks sky scores' }).locator('[data-active-score]')).toHaveText(score);
});

test('keeps failed forecasts out of the comparison and recovers with explicit retry', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  harness.defaultHourly = weather();
  harness.failureMode = { kind: 'http', status: 503 };
  await page.goto('/');
  await page.getByRole('button', { name: 'Sunset spots', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'Compare sky spots' });
  await expect(comparison).toContainText('No supported forecasts', { timeout: 30_000 });
  await expect(comparison.getByRole('button', { name: /^Open / })).toHaveCount(0);
  harness.failureMode = null;
  await comparison.getByRole('button', { name: 'Retry forecasts' }).click();
  await expect(comparison.getByRole('button', { name: /^Open / }).first()).toBeVisible();
  await expect(page.getByRole('group', { name: 'Timeline scrubber' })).toHaveCount(1);
});
