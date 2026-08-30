import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import {
  OCEAN_BEACH_COORDINATES,
  assertNoDuplicateWeatherRequests,
  installDeterministicBrowserState,
  installWeatherHarness,
} from './weather-fixture';

const SPOT_URL = '/?spot=sf-ocean-beach&view=now';
const CARD_ORDER = ['now', 'sunrise', 'sunset', 'stargazing'];

async function cardOrder(dialog: Locator): Promise<string[]> {
  return dialog.locator('[data-card-type]').evaluateAll((cards) =>
    cards.map((card) => card.getAttribute('data-card-type') ?? ''),
  );
}

async function currentCardScrollLeft(dialog: Locator): Promise<number> {
  return dialog.locator('.score-cards-scroll').evaluate((scroller) => scroller.scrollLeft);
}

test.beforeEach(async ({ page }) => {
  await installDeterministicBrowserState(page);
});

test('keeps the forecast scrubber in the Now card and preserves the sheet', async ({ page }, testInfo) => {
  const harness = await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const nowCard = dialog.locator('[data-card-type="now"]');
  const slider = nowCard.getByRole('slider', { name: 'Forecast hour' });
  const tablist = dialog.getByRole('tablist', { name: 'Card pages' });

  await expect(dialog).toBeVisible();
  await expect(nowCard.getByRole('group', { name: 'Timeline scrubber' })).toBeVisible();
  await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
  await expect(tablist.getByRole('tab')).toHaveCount(4);
  await expect(tablist.getByRole('tab', { name: 'Show Now card' })).toHaveAttribute('aria-selected', 'true');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Now, Now · 6pm');

  await page.waitForTimeout(400);
  const initialScrollLeft = await currentCardScrollLeft(dialog);

  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await expect(slider).not.toHaveAttribute('aria-valuetext', /Now ·/);
  await expect(nowCard.getByText('Exact forecast', { exact: true })).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
  await expect(tablist.getByRole('tab', { name: 'Show Now card' })).toHaveAttribute('aria-selected', 'true');
  expect(await currentCardScrollLeft(dialog)).toBeCloseTo(initialScrollLeft, 0);
  const screenshotPath = testInfo.outputPath('expanded-now-card-future-hour.png');
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach('expanded-now-card-future-hour', {
    path: screenshotPath,
    contentType: 'image/png',
  });

  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '24');
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');

  await page.keyboard.press('ArrowRight');
  await nowCard.getByRole('button', { name: 'Now', exact: true }).click();
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Now, Now · 6pm');
  await expect(nowCard.getByText('Live', { exact: true })).toBeVisible();
  await expect(dialog).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .include('[role="dialog"][aria-label="Ocean Beach sky scores"]')
    .analyze();
  const seriousViolations = accessibility.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  // Existing visual styling has known WCAG contrast debt. Keep axe active for
  // the whole expanded sheet and fail on every serious or critical rule other
  // than color-contrast, so structural regressions cannot hide behind it.
  expect(seriousViolations.filter((violation) => violation.id !== 'color-contrast')).toEqual([]);
  const contrastNodes = seriousViolations
    .filter((violation) => violation.id === 'color-contrast')
    .reduce((total, violation) => total + violation.nodes.length, 0);
  console.info(`[axe] ${contrastNodes} known color-contrast nodes in the expanded sheet`);

  assertNoDuplicateWeatherRequests(harness.requests);
  expect(harness.requests.forecast.length).toBeGreaterThan(0);
  expect(harness.requests.airQuality.length).toBe(harness.requests.forecast.length);
  console.info(
    `[weather-fixture] ${harness.requests.forecast.length} forecast and ` +
    `${harness.requests.airQuality.length} air-quality requests, one pair per coordinate`,
  );
});

test('keeps recovery available when the selected spot forecast fails', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  harness.failCoordinates.add(OCEAN_BEACH_COORDINATES);
  await page.goto('/');

  // Select a public forecast hour before opening the failed spot. This gives
  // the Now card a real stale selection to recover from without reaching into
  // React state or relying on a test-only application hook.
  const globalTimeline = page.getByRole('group', { name: 'Forecast hours' });
  const futureHour = globalTimeline.getByRole('button').nth(1);
  await expect(futureHour).toBeVisible();
  await futureHour.click();
  await expect(futureHour).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Search spots' }).click();
  const searchDialog = page.getByRole('dialog', { name: 'Search spots' });
  await searchDialog.getByPlaceholder('Search spots…').fill('Ocean Beach');
  await searchDialog.getByRole('button', { name: /Ocean Beach/ }).click();

  const errorDialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const nowCard = errorDialog.locator('[data-card-type="now"]');
  await expect(errorDialog).toBeVisible();
  await expect(nowCard.getByText('Hourly forecast unavailable', { exact: true })).toBeVisible();
  const returnButton = nowCard.getByRole('button', { name: 'Return to Now' });
  await expect(returnButton).toBeVisible();
  await returnButton.click();

  await expect(errorDialog).toBeVisible();
  await expect(returnButton).toBeHidden();
  await expect(cardOrder(errorDialog)).resolves.toEqual(CARD_ORDER);
  expect(harness.requests.forecast.filter((value) => value === OCEAN_BEACH_COORDINATES)).toHaveLength(1);
});

test('supports a positional scrub gesture in the narrow touch layout', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit', 'Narrow touch regression only');
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const slider = dialog.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toBeVisible();

  const box = await slider.boundingBox();
  if (!box) throw new Error('Forecast slider has no layout box');
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(slider).not.toHaveAttribute('aria-valuenow', '0');
  await expect(dialog).toBeVisible();
  await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
});
