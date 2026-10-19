import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  OCEAN_BEACH_COORDINATES,
  assertNoDuplicateWeatherRequests,
  assertNoLiveOpenMeteoTraffic,
  expectPointForecastConcurrency,
  installDeterministicBrowserState,
  installWeatherHarness,
} from './weather-fixture';

const SPOT_URL = '/?spot=sf-ocean-beach&view=now';
const CARD_ORDER = ['now', 'sunrise', 'sunset', 'stargazing'];

async function setForecastRange(page: Page, range: '24h' | '7d') {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Forecast range' }).click();
  await page.getByRole('option', { name: range === '7d' ? '7 days' : '24 hours', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
}

async function cardOrder(dialog: Locator): Promise<string[]> {
  return dialog.locator('[data-card-type]').evaluateAll((cards) =>
    cards.map((card) => card.getAttribute('data-card-type') ?? ''),
  );
}

async function currentCardScrollLeft(dialog: Locator): Promise<number> {
  return dialog.locator('.score-cards-scroll').evaluate((scroller) => scroller.scrollLeft);
}

interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function sameBox(left: LayoutBox, right: LayoutBox): boolean {
  return [left.x, left.y, left.width, left.height].every(
    (value, index) => Math.abs(value - [right.x, right.y, right.width, right.height][index]) < 0.25,
  );
}

async function waitForStableGeometry(locator: Locator): Promise<LayoutBox> {
  await expect(locator).toBeVisible();
  await locator.evaluate(async (element) => {
    const sheet = element.closest('[role="dialog"]') ?? element;
    await Promise.all(sheet.getAnimations().map((animation) => animation.finished.catch(() => {})));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });

  let previous = await locator.boundingBox();
  if (!previous) throw new Error('Element has no layout box');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await locator.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const current = await locator.boundingBox();
    if (!current) throw new Error('Element lost its layout box while waiting for stable geometry');
    if (sameBox(previous, current)) return current;
    previous = current;
  }
  throw new Error(`Element geometry did not settle: ${JSON.stringify(previous)}`);
}

test.beforeEach(async ({ page }) => {
  await installDeterministicBrowserState(page);
});

test('opens photos from the action row in a centered modal and restores focus after closing it', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/?spot=sf-panorama-park&view=sunset');
  const sheet = page.getByRole('dialog', { name: 'Panorama Park, Yerba Buena Island sky scores' });
  const photoButton = sheet.getByRole('button', { name: 'View photos for Panorama Park, Yerba Buena Island' });
  const slider = sheet.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Forecast confidence: (Low|Medium). Show details$/ })).toBeVisible();
  const timeBefore = await slider.getAttribute('aria-valuetext');
  await expect(sheet.locator('img[src^="/spot-views/"]')).toHaveCount(0);
  const directions = await sheet.getByRole('button', { name: 'Get directions' }).boundingBox();
  const streetView = await sheet.getByRole('button', { name: 'Open Street View' }).boundingBox();
  const camera = await photoButton.boundingBox();
  expect(camera!.y).toBeCloseTo(directions!.y, 0);
  expect(camera!.y).toBeCloseTo(streetView!.y, 0);
  expect(camera!.x).toBeGreaterThan(streetView!.x);
  expect(camera!.width).toBeGreaterThanOrEqual(44);
  await photoButton.click();
  const viewer = page.getByRole('dialog', { name: 'View photos for Panorama Park, Yerba Buena Island' });
  await expect(viewer).toBeVisible();
  const modal = await viewer.boundingBox();
  const viewport = page.viewportSize()!;
  expect(modal!.x).toBeGreaterThanOrEqual(16);
  expect(modal!.y).toBeGreaterThanOrEqual(32);
  expect(modal!.width).toBeLessThanOrEqual(860);
  expect(modal!.height).toBeLessThanOrEqual(viewport.height - 64);
  expect(modal!.height).toBeLessThan(Math.min(760, viewport.height * 0.85));
  expect(modal!.x + modal!.width / 2).toBeCloseTo(viewport.width / 2, 0);
  expect(modal!.y + modal!.height / 2).toBeCloseTo(viewport.height / 2, 0);
  await expect(viewer.getByText('Reference view. Not a live image or forecast.')).toBeVisible();
  await expect(viewer.getByRole('img')).toHaveJSProperty('naturalWidth', 1280);
  await expect(viewer.getByRole('link', { name: 'Photo: Awinch1001' })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.spot-view-dialog').analyze()).violations).toEqual([]);
  const close = viewer.getByRole('button', { name: 'Close photos', exact: true });
  await expect(close).toHaveText('');
  await close.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(photoButton).toBeFocused();
  await expect(sheet).toBeVisible();
  await expect(slider).toHaveAttribute('aria-valuetext', timeBefore!);
  await expect(sheet.locator('[data-card-type="sunset"]')).toHaveAttribute('aria-hidden', 'false');
  await photoButton.click();
  await viewer.getByRole('button', { name: 'Close photos', exact: true }).click();
  await expect(viewer).toHaveCount(0);
  await expect(photoButton).toBeFocused();
  await photoButton.click();
  await page.mouse.click(2, 2);
  await expect(viewer).toHaveCount(0);
  await expect(photoButton).toBeFocused();
});

test('recovers from a failed view photo and makes hidden gems reversible in search', async ({ page }) => {
  await installWeatherHarness(page);
  let failPhotos = true;
  await page.route('**/spot-views/*.jpg', (route) => failPhotos ? route.abort() : route.continue());
  await page.goto('/?spot=sf-panorama-park&view=sunset');
  const sheet = page.getByRole('dialog', { name: 'Panorama Park, Yerba Buena Island sky scores' });
  await sheet.getByRole('button', { name: 'View photos for Panorama Park, Yerba Buena Island' }).click();
  const viewer = page.getByRole('dialog', { name: 'View photos for Panorama Park, Yerba Buena Island' });
  await expect(viewer.getByText('Photo unavailable')).toBeVisible();
  await expect(viewer.getByText('Bay Bridge and San Francisco skyline across the bay, beside the Point of Infinity sculpture.')).toBeVisible();
  failPhotos = false;
  await viewer.getByRole('button', { name: 'Retry photo' }).click();
  await expect(viewer.getByRole('img')).toHaveJSProperty('naturalWidth', 1280);
  await viewer.getByRole('button', { name: 'Close photos' }).click();
  await sheet.press('Escape');
  await page.getByRole('button', { name: 'Search spots', exact: true }).click();
  const search = page.getByRole('dialog', { name: 'Search spots' });
  const gems = search.getByRole('button', { name: 'Hidden gems', exact: true });
  await gems.click();
  await expect(gems).toHaveAttribute('aria-pressed', 'true');
  await expect(search.locator('li')).toHaveCount(7);
  await search.getByPlaceholder('Search spots…').fill('Ocean Beach');
  await expect(search.getByRole('button', { name: 'Show all spots' })).toBeVisible();
  await search.getByRole('button', { name: 'Show all spots' }).click();
  await expect(search.locator('li')).toHaveCount(1);
  await expect(gems).toHaveAttribute('aria-pressed', 'false');
});

test('keeps cities without hidden gems browsable after enabling the collection in SF', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Search spots', exact: true }).click();
  const search = page.getByRole('dialog', { name: 'Search spots' });
  await search.getByRole('button', { name: 'Hidden gems', exact: true }).click();
  await expect(search.locator('li')).toHaveCount(7);
  await search.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Switch city' }).click();
  await page.getByRole('button', { name: 'Select Austin', exact: true }).click();
  await page.getByRole('button', { name: 'Search spots', exact: true }).click();
  await expect(search.getByRole('button', { name: 'Hidden gems' })).toHaveCount(0);
  await search.getByPlaceholder('Search spots…').fill('Mount Bonnell');
  await expect(search.locator('li')).toHaveCount(1);
});

test('keeps keyboard card paging without the removed icon row', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);
  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const cards = dialog.getByRole('group', { name: 'Sky cards', exact: true });
  await expect(cards).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Sky views' })).toHaveCount(0);
  await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
  for (const type of ['sunrise', 'sunset', 'stargazing', 'now']) {
    await cards.press('ArrowRight');
    await expect(dialog.locator(`[data-card-type="${type}"]`)).toHaveAttribute('aria-hidden', 'false');
  }
  await cards.press('ArrowLeft');
  await expect(dialog.locator('[data-card-type="stargazing"]')).toHaveAttribute('aria-hidden', 'false');
});

test('keeps only the spot scrubber inside the card and preserves its state', async ({ page }, testInfo) => {
  const harness = await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const nowCard = dialog.locator('[data-card-type="now"]');
  const slider = page.getByRole('slider', { name: 'Forecast hour' });

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Spot time controls' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Map time controls' })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Timeline scrubber' })).toBeVisible();
  await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
  await expect(page.getByRole('tablist', { name: 'Sky views' })).toHaveCount(0);
  await expect(dialog.locator('[data-card-type="now"]')).toHaveAttribute('aria-hidden', 'false');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Daytime, Now · 6:15 PM');

  await waitForStableGeometry(dialog);
  const initialScrollLeft = await currentCardScrollLeft(dialog);

  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await expect(slider).not.toHaveAttribute('aria-valuetext', /Now ·/);
  await expect(dialog.getByRole('group', { name: /^Forecast confidence: (Low|Medium)$/ })).toBeVisible();
  await expect(nowCard.locator('[data-retrieval-badge]')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Timeline scrubber' })).toContainText('Today');
  await expect(dialog).toBeVisible();
  await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
  await expect(dialog.locator('[data-card-type="now"]')).toHaveAttribute('aria-hidden', 'false');
  expect(await currentCardScrollLeft(dialog)).toBeCloseTo(initialScrollLeft, 0);
  const screenshotPath = testInfo.outputPath(`expanded-now-card-future-hour-${testInfo.project.name}.png`);
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach('expanded-now-card-future-hour', {
    path: screenshotPath,
    contentType: 'image/png',
  });

  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', (await slider.getAttribute('aria-valuemax'))!);
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');

  await page.keyboard.press('ArrowRight');
  await slider.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Daytime, Now · 6:15 PM');
  await expect(dialog.getByRole('group', { name: /^Forecast confidence: (Low|Medium)$/ })).toBeVisible();
  await expect(nowCard.locator('[data-retrieval-badge]')).toBeVisible();
  await expect(dialog).toBeVisible();

  const currentScreenshotPath = testInfo.outputPath(`expanded-now-card-current-${testInfo.project.name}.png`);
  await page.screenshot({ path: currentScreenshotPath });
  await testInfo.attach('expanded-now-card-current', {
    path: currentScreenshotPath,
    contentType: 'image/png',
  });

  const accessibility = await new AxeBuilder({ page })
    .include('[role="dialog"][aria-label="Ocean Beach sky scores"]')
    .analyze();
  const seriousViolations = accessibility.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  const trustStatusContrast = await new AxeBuilder({ page })
    .include('[data-contrast-audit="forecast-confidence"]')
    .withRules(['color-contrast'])
    .analyze();
  const unresolvedContrast = trustStatusContrast.incomplete.filter(
    (result) => result.id === 'color-contrast',
  );
  const trustStatusViolations = trustStatusContrast.violations.filter(
    (result) => result.id === 'color-contrast',
  );
  const trustStatusBackground = await dialog.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(seriousViolations).toEqual([]);
  expect(trustStatusViolations).toEqual([]);
  expect(unresolvedContrast).toEqual([]);
  expect(trustStatusBackground).not.toBe('rgba(0, 0, 0, 0)');
  console.info(
    `[axe:${testInfo.project.name}:expanded-sheet] serious-or-critical=` +
    JSON.stringify(seriousViolations.map((violation) => ({ id: violation.id, nodes: violation.nodes.length }))),
  );

  assertNoDuplicateWeatherRequests(harness.requests);
  assertNoLiveOpenMeteoTraffic(harness.requests);
  expectPointForecastConcurrency(harness.requests);
  console.info(
    '[weather-fixture] visible point forecasts use bounded concurrency and cached hourly snapshots',
  );
});

test('keeps only the visible card face in the accessibility tree and restores focus after flipping', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const nowCard = dialog.locator('[data-card-type="now"]');
  const breakdown = nowCard.getByRole('button', { name: 'Details' });
  await expect(breakdown).toBeVisible();
  await expect(nowCard.getByRole('button', { name: 'Back' })).toHaveCount(0);

  await breakdown.click();
  const back = nowCard.getByRole('button', { name: 'Back' });
  await expect(back).toBeVisible();
  await expect(back).toBeFocused();
  await expect(nowCard.getByRole('button', { name: 'Details' })).toHaveCount(0);

  await back.click();
  const restoredBreakdown = nowCard.getByRole('button', { name: 'Details' });
  await expect(restoredBreakdown).toBeVisible();
  await expect(restoredBreakdown).toBeFocused();
  await expect(nowCard.getByRole('button', { name: 'Back' })).toHaveCount(0);
});

test('shares and restores the selected Now-card hour', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Share replay contract is exercised once in Chromium');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        (window as typeof window & { __soleilShareData?: ShareData }).__soleilShareData = data;
      },
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => false,
    });
  });
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const nowCard = dialog.locator('[data-card-type="now"]');
  const slider = page.getByRole('slider', { name: 'Forecast hour' });
  await waitForStableGeometry(dialog);
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');

  const shareButton = nowCard.getByRole('button', {
    name: 'Share selected hour card for Ocean Beach',
  });
  await expect(shareButton).toBeVisible();
  await shareButton.click();
  await expect.poll(() => page.evaluate(
    () => (window as typeof window & { __soleilShareData?: ShareData }).__soleilShareData?.url ?? null,
  )).toContain('instant=2026-08-30T02%3A00%3A00Z');
  const shared = await page.evaluate(
    () => (window as typeof window & { __soleilShareData?: ShareData }).__soleilShareData,
  );
  expect(shared?.text).toContain('Sky quality:');
  expect(shared?.text).toContain('at 7:00 pm');
  expect(shared?.text).not.toContain('Clear skies at');

  await page.goto(String(shared?.url));
  const restored = page
    .getByRole('dialog', { name: 'Ocean Beach sky scores' })
    .locator('[data-card-type="now"]');
  await expect(restored).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByRole('group', { name: 'Timeline scrubber' })).toContainText('Today');
  await expect(page.getByRole('dialog', { name: 'Ocean Beach sky scores' }).getByRole('group', { name: /^Forecast confidence: (Low|Medium)$/ })).toBeVisible();
});

test('keeps selected-hour score, evidence, time, and weather aligned after scrubbing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Cross-surface parity is exercised once in Chromium');
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const nowCard = dialog.locator('[data-card-type="now"]');
  const slider = page.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Daytime, Today · 7:00 PM');
  await expect(nowCard.locator('[data-temperature]')).toHaveText('66°F');
  await expect(dialog.getByRole('group', { name: /^Forecast confidence: (Low|Medium)$/ })).toBeVisible();

  const sheetScore = (await dialog.locator('[aria-label^="Daytime score "]').textContent())?.trim();
  expect(sheetScore).toMatch(/^\d{1,3}$/);
  await expect(dialog.locator('[aria-label^="Daytime score "]')).toHaveAttribute(
    'aria-label',
    new RegExp(`^Daytime score ${sheetScore} out of 100, .+, sky estimate · (low|medium) confidence, retrieved just now$`),
  );
  await expect(dialog.locator('[data-primary-score]')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('[aria-label^="Ocean Beach, score "]')).toHaveAttribute(
    'aria-label',
    new RegExp(`^Ocean Beach, score ${sheetScore} out of 100, .+, sky estimate · (low|medium) confidence, retrieved just now$`),
  );

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Search spots' }).click();
  const search = page.getByRole('dialog', { name: 'Search spots' });
  await search.getByPlaceholder('Search spots…').fill('Ocean Beach');
  await expect(search.getByText('Scores for Daytime · Today at 7:00 PM', { exact: true })).toBeVisible();
  const result = search.getByRole('button', { name: /Ocean Beach/ });
  await expect(result.getByText(/^Sky estimate · (low|medium) confidence$/)).toBeVisible();
  await expect(result.locator('span').last()).toHaveText(sheetScore!);

  await result.click();
  const reopenedCard = page
    .getByRole('dialog', { name: 'Ocean Beach sky scores' })
    .locator('[data-card-type="now"]');
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toHaveAttribute(
    'aria-valuetext',
    'Daytime, Today · 7:00 PM',
  );
  await expect(reopenedCard.locator('[data-temperature]')).toHaveText('66°F');
  await expect(page.getByRole('dialog', { name: 'Ocean Beach sky scores' }).getByRole('group', { name: /^Forecast confidence: (Low|Medium)$/ })).toBeVisible();
});

test.describe('city time differs from the browser time zone', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('identifies Now from the Austin timeline using the city clock', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Cross-timezone identity is exercised once in Chromium');
    await installWeatherHarness(page);
    await page.goto('/?spot=atx-mount-bonnell&view=now');

    await expect.poll(() => page.evaluate(() => new Date().toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    }))).toBe('10:15 AM');
    const dialog = page.getByRole('dialog', { name: 'Mount Bonnell (Covert Park) sky scores' });
    const nowCard = dialog.locator('[data-card-type="now"]');
    const slider = page.getByRole('slider', { name: 'Forecast hour' });
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Sunset, Now · 8:15 PM');
    await expect(page.getByRole('group', { name: 'Timeline scrubber' })).toContainText('Now');
    await expect(dialog.getByRole('group', { name: 'Forecast confidence: High' })).toBeVisible();
    await expect(nowCard.locator('[data-temperature]')).toHaveText('64°F');

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Search spots' }).click();
    await expect(page.getByRole('dialog', { name: 'Search spots' })
      .getByText('Scores for Right now', { exact: true })).toBeVisible();
  });
});

test('keeps recovery available when the selected spot forecast fails', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  harness.failCoordinates.add(OCEAN_BEACH_COORDINATES);
  await page.goto('/?spot=sf-twin-peaks&view=now');

  const firstSpot = page.getByRole('dialog', { name: 'Twin Peaks sky scores' });
  const firstSlider = page.getByRole('slider', { name: 'Forecast hour' });
  await expect(firstSlider).toHaveAttribute('aria-disabled', 'false');
  await firstSlider.press('ArrowRight');
  await expect(firstSlider).toHaveAttribute('aria-valuenow', '1');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(firstSpot).toBeHidden();

  await page.getByRole('button', { name: 'Search spots' }).click();
  const searchDialog = page.getByRole('dialog', { name: 'Search spots' });
  await searchDialog.getByPlaceholder('Search spots…').fill('Ocean Beach');
  await searchDialog.getByRole('button', { name: /Ocean Beach/ }).click();

  const errorDialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const nowCard = errorDialog.locator('[data-card-type="now"]');
  await expect(errorDialog).toBeVisible();
  await expect(nowCard.getByText('Sky forecast unavailable', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(nowCard.locator('[data-retrieval-badge]')).toBeVisible();
  await errorDialog.getByRole('button', { name: 'Forecast confidence: Low. Show details' }).click();
  await expect(errorDialog.getByRole('region', { name: 'Forecast confidence details' })).toContainText('Cloud or visibility data is unavailable');
  await page.keyboard.press('Escape');
  await expect(errorDialog).toBeVisible();
  const requestsBeforeReturn = harness.requests.forecast.filter(
    (value) => value === OCEAN_BEACH_COORDINATES,
  ).length;
  const returnSlider = page.getByRole('slider', { name: 'Forecast hour' });
  await expect(returnSlider).toBeVisible();
  await returnSlider.press('Home');

  await expect(errorDialog).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toHaveAttribute('aria-valuenow', '0');
  await expect(nowCard.getByText('Sky forecast unavailable', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(cardOrder(errorDialog)).resolves.toEqual(CARD_ORDER);
  expect(harness.requests.forecast.filter(
    (value) => value === OCEAN_BEACH_COORDINATES,
  )).toHaveLength(requestsBeforeReturn);
  assertNoLiveOpenMeteoTraffic(harness.requests);
});

test('supports a positional scrub gesture in the narrow touch layout', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit', 'Narrow touch regression only');
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const slider = page.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toBeVisible();
  await expect(
    dialog.getByRole('group', { name: /^Forecast confidence: (Low|Medium)$/ }),
  ).toBeVisible();

  const box = await waitForStableGeometry(slider);
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(slider).not.toHaveAttribute('aria-valuenow', '0');
  await expect(dialog).toBeVisible();
  await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
});

test('keeps the complete Now card reachable in the narrow touch layout', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit', 'Narrow touch regression only');
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const nowPage = dialog.locator('[data-card-type="now"]');
  await expect(nowPage.getByRole('button', { name: 'Details' })).toBeAttached();

  const reachability = await nowPage.evaluate((pageElement) => {
    const scroller = pageElement.parentElement;
    const cardScroll = pageElement.querySelector<HTMLElement>('[data-card-scroll]');
    const scoreCard = cardScroll?.firstElementChild;
    const breakdown = Array.from(pageElement.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Details'),
    );
    if (!scroller || !cardScroll || !scoreCard || !breakdown) {
      throw new Error('Now-card layout nodes missing');
    }

    const scrollerRect = scroller.getBoundingClientRect();
    const cardRect = scoreCard.getBoundingClientRect();
    const breakdownRect = breakdown.getBoundingClientRect();
    const scrollerStyle = getComputedStyle(scroller);
    const pageStyle = getComputedStyle(pageElement);
    const cardScrollStyle = getComputedStyle(cardScroll);
    const cardStyle = getComputedStyle(scoreCard);
    const clippedPixels = Math.max(0, Math.round(cardRect.bottom - scrollerRect.bottom));
    const scrollerCanScroll =
      (scrollerStyle.overflowY === 'auto' || scrollerStyle.overflowY === 'scroll') &&
      scroller.scrollHeight > scroller.clientHeight;
    const cardPageCanScroll =
      (cardScrollStyle.overflowY === 'auto' || cardScrollStyle.overflowY === 'scroll') &&
      cardScroll.scrollHeight > cardScroll.clientHeight;

    return {
      scroller: {
        clientHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
        overflowY: scrollerStyle.overflowY,
      },
      page: {
        clientHeight: pageElement.clientHeight,
        scrollHeight: pageElement.scrollHeight,
        overflowY: pageStyle.overflowY,
      },
      cardScroll: {
        clientHeight: cardScroll.clientHeight,
        scrollHeight: cardScroll.scrollHeight,
        overflowX: cardScrollStyle.overflowX,
        overflowY: cardScrollStyle.overflowY,
      },
      scoreCard: {
        clientHeight: (scoreCard as HTMLElement).clientHeight,
        scrollHeight: (scoreCard as HTMLElement).scrollHeight,
        overflowY: cardStyle.overflowY,
      },
      clippedPixels,
      breakdownVisibleInScroller: breakdownRect.bottom <= scrollerRect.bottom + 1,
      hasVerticalScrollPath: scrollerCanScroll || cardPageCanScroll,
    };
  });

  console.info(`[mobile-reachability] ${JSON.stringify(reachability)}`);
  expect(
    reachability.clippedPixels === 0 || reachability.hasVerticalScrollPath,
    `Now card is clipped without a vertical scroll path: ${JSON.stringify(reachability)}`,
  ).toBe(true);
  expect(reachability.breakdownVisibleInScroller || reachability.hasVerticalScrollPath).toBe(true);

  await nowPage.evaluate((pageElement) => {
    const cardScroll = pageElement.querySelector<HTMLElement>('[data-card-scroll]');
    if (cardScroll) cardScroll.scrollTop = cardScroll.scrollHeight;
  });
  const breakdownIsReachable = await nowPage.evaluate((pageElement) => {
    const scroller = pageElement.parentElement;
    const breakdown = Array.from(pageElement.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Details'),
    );
    if (!scroller || !breakdown) return false;
    const scrollerRect = scroller.getBoundingClientRect();
    const breakdownRect = breakdown.getBoundingClientRect();
    return breakdownRect.top >= scrollerRect.top - 1 && breakdownRect.bottom <= scrollerRect.bottom + 1;
  });
  expect(breakdownIsReachable).toBe(true);
  const scrolledScreenshotPath = testInfo.outputPath('mobile-now-card-scrolled-bottom.png');
  await page.screenshot({ path: scrolledScreenshotPath });
  await testInfo.attach('mobile-now-card-scrolled-bottom', {
    path: scrolledScreenshotPath,
    contentType: 'image/png',
  });
});

test('pages horizontally when the gesture starts over scrollable card content', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-webkit', 'Mouse wheel is unavailable in mobile WebKit');
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const scroller = dialog.locator('.score-cards-scroll');
  const nowPage = dialog.locator('[data-card-type="now"]');
  const cardScroll = nowPage.locator('[data-card-scroll]');
  await expect(nowPage).toBeVisible();
  await waitForStableGeometry(dialog);

  const cardOverflow = await nowPage.evaluate((element) => {
    const inner = element.querySelector<HTMLElement>('[data-card-scroll]');
    if (!inner) throw new Error('Card scroll wrapper missing');
    const outerStyle = getComputedStyle(element);
    const innerStyle = getComputedStyle(inner);
    return {
      outerOverflowX: outerStyle.overflowX,
      outerOverflowY: outerStyle.overflowY,
      innerOverflowX: innerStyle.overflowX,
      innerOverflowY: innerStyle.overflowY,
      innerClientWidth: inner.clientWidth,
      innerScrollWidth: inner.scrollWidth,
    };
  });
  console.info(`[horizontal-paging] ${JSON.stringify(cardOverflow)}`);
  expect(cardOverflow.outerOverflowX).toBe('visible');
  expect(cardOverflow.outerOverflowY).toBe('visible');
  expect(cardOverflow.innerOverflowY).toBe('auto');
  expect(cardOverflow.innerScrollWidth).toBe(cardOverflow.innerClientWidth);

  const pageBox = await cardScroll.boundingBox();
  if (!pageBox) throw new Error('Now card page has no layout box');
  await page.mouse.move(
    pageBox.x + pageBox.width / 2,
    pageBox.y + Math.min(180, pageBox.height / 3),
  );
  await page.mouse.wheel(pageBox.width * 0.9, 0);

  await expect.poll(async () => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(
    pageBox.width * 0.5,
  );
  await expect.poll(async () => scroller.evaluate((element) => {
    const viewportCenter = element.scrollLeft + element.clientWidth / 2;
    const cards = Array.from(element.querySelectorAll<HTMLElement>('[data-card-type]'));
    const centeredCard = cards.reduce<HTMLElement | null>((closest, card) => {
      if (!closest) return card;
      const cardDistance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - viewportCenter);
      const closestDistance = Math.abs(
        closest.offsetLeft + closest.offsetWidth / 2 - viewportCenter,
      );
      return cardDistance < closestDistance ? card : closest;
    }, null);
    const activeTab = document.querySelector<HTMLElement>('[data-card-type][aria-hidden="false"]');
    const centeredType = centeredCard?.dataset.cardType;

    return centeredType !== 'now'
      && activeTab?.id === centeredCard?.id;
  })).toBe(true);
});

test('dismisses the sheet from the dedicated handle pointer drag', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const handle = dialog.getByRole('button', { name: 'Swipe down to dismiss, or tap to close' });
  await expect(handle).toBeVisible();
  await expect(
    dialog.getByRole('group', { name: /^Forecast confidence: (Low|Medium)$/ }),
  ).toBeVisible();
  await expect(dialog).toHaveAttribute('data-entered', 'true');
  const box = await waitForStableGeometry(handle);
  await expect.poll(() => handle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button') === element;
  })).toBe(true);
  console.info(`[handle-target] ${Math.round(box.width)}x${Math.round(box.height)}px`);
  expect(box.height, 'Dedicated sheet-dismiss handle must provide a 44px touch target').toBeGreaterThanOrEqual(43.99);

  for (const actionName of ['Get directions', 'Open Street View']) {
    const action = dialog.getByRole('button', { name: actionName });
    const actionBox = await action.boundingBox();
    if (!actionBox) throw new Error(`${actionName} has no layout box`);
    const verticalOverlap = Math.max(
      0,
      Math.min(box.y + box.height, actionBox.y + actionBox.height) - Math.max(box.y, actionBox.y),
    );
    expect(verticalOverlap, `Sheet handle overlaps ${actionName}`).toBe(0);
    const receivesPointer = await action.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return document
        .elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        ?.closest('button') === element;
    });
    expect(receivesPointer, `${actionName} must remain the topmost pointer target`).toBe(true);
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 180, { steps: 8 });
  await page.mouse.up();

  await expect(dialog).toBeHidden();
});


test('updates map scores from the persistent bottom scrubber without selecting a spot', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  await page.goto('/');
  const timeline = page.getByRole('complementary', { name: 'Map time controls' });
  const slider = timeline.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  await expect(page.getByRole('slider')).toHaveCount(1);
  const pin = page.locator('.leaflet-marker-pane [role="button"][aria-label*="sky estimate"]').first();
  await expect(pin).toHaveAttribute('aria-label', /sky estimate/);
  await expect(page.locator('[data-spot-forecast-progress]')).toHaveCount(0, { timeout: 30000 });
  const callsBefore = harness.requests.forecast.length + harness.requests.airQuality.length;
  const before = await pin.getAttribute('aria-label');
  await slider.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', (await slider.getAttribute('aria-valuemax'))!);
  await expect(pin).not.toHaveAttribute('aria-label', before!);
  await slider.press('Home');
  await expect(pin).toHaveAttribute('aria-label', before!);
  const viewport = page.viewportSize()!;
  const box = (await timeline.boundingBox())!;
  expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
  expect(harness.requests.forecast.length + harness.requests.airQuality.length).toBe(callsBefore);
});

test('persists private spots on this device and disables public card sharing', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  const roof = {
    id: 'private:test-roof', name: 'Test Roof', address: 'Example address', city: 'sf', visibility: 'private',
    lat: 37.78123, lng: -122.45123, category: 'skyscraper', elevation: 0,
    lightPollution: 'High', horizonQuality: 'Partial', sunrise: 60, sunset: 30, stargazing: 20,
  };
  await page.unroute('**/__soleil/private-spots');
  await page.route('**/__soleil/private-spots', (route) => route.fulfill({ json: [roof] }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Search spots', exact: true }).click();
  const search = page.getByRole('dialog', { name: 'Search spots' });
  await search.getByPlaceholder('Search spots…').fill('Example address');
  await search.getByRole('button', { name: /Test Roof/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Test Roof sky scores' });
  await expect(dialog.getByText('Private', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Private', { exact: true })).toHaveAttribute('title', 'Private, visible only on this device');
  await expect(dialog.getByRole('button', { name: /^Share / })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Remove Test Roof from saved spots' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog).toContainText('Uncalibrated roof estimate');
  await dialog.getByRole('button', { name: 'Forecast confidence: Low. Show details' }).click();
  await expect(dialog.getByRole('region', { name: 'Forecast confidence details' })).toContainText('This roof is not calibrated yet');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect.poll(() => harness.requests.forecast.filter((coordinates) => coordinates === '37.7800,-122.4500').length).toBeGreaterThan(0);
  expect(harness.requests.forecast.some((coordinates) => coordinates === '37.7812,-122.4512')).toBe(false);
  await page.route('**/__soleil/private-spots', (route) => route.fulfill({ status: 204 }));
  await page.reload();
  await page.getByRole('button', { name: 'Search spots', exact: true }).click();
  await page.getByPlaceholder('Search spots…').fill('Test Roof');
  await expect(page.getByRole('dialog', { name: 'Search spots' }).getByRole('button', { name: /Test Roof/ })).toBeVisible();
});

test('keeps bottom controls truthful when city weather is unavailable', async ({ page }) => {
  await installWeatherHarness(page);
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto('/');
  const timeline = page.getByRole('complementary', { name: 'Map time controls' });
  await expect(timeline).toContainText('Hourly forecast unavailable');
  await expect(timeline.getByRole('slider')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: 'Search spots', exact: true })).toBeVisible();
});


test('synchronizes the rail, card paging, and selected time without icon shortcuts', async ({ page }) => {
  const weather = await installWeatherHarness(page);
  await page.goto(SPOT_URL);
  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const slider = page.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('[data-spot-forecast-progress]')).toHaveCount(0, { timeout: 30000 });
  const requestsBefore = weather.requests.forecast.length;
  await dialog.getByRole('group', { name: 'Sky cards', exact: true }).press('ArrowRight');
  await expect(dialog.locator('[data-card-type="sunrise"]')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByRole('group', { name: 'Timeline scrubber' })).toContainText('Sunrise');
  await slider.press('ArrowRight');
  await expect(dialog.locator('[data-card-type="now"]')).toHaveAttribute('aria-hidden', 'false');
  await slider.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('tablist', { name: 'Sky views' })).toHaveCount(0);
  for (const artwork of await dialog.locator('[data-sky-artwork]').all()) {
    expect((await artwork.textContent())?.trim()).toBe('');
  }
  expect(weather.requests.forecast.length).toBe(requestsBefore);
});

test('keeps the map timeline sticky and removes both nighttime strip and icon row', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /The Bay Lights|Photosynthesis|SPECTRA|Dismiss tonight/ })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Sky views' })).toHaveCount(0);
  const timeline = page.getByRole('complementary', { name: 'Map time controls' });
  await expect(timeline).toBeVisible();
  await expect(timeline.getByRole('slider')).toHaveAttribute('aria-disabled', 'false');
  await timeline.getByRole('slider').press('ArrowRight');
  await timeline.getByRole('slider').press('Home');
  await expect(timeline.getByRole('slider')).toHaveAttribute('aria-valuenow', '0');
});

test('snaps event dots to the matching card, exact timestamp, and thumb position', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);
  const slider = page.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  for (const view of ['sunset', 'sunrise', 'stargazing']) {
    const marker = page.locator(`[data-timeline-event="${view}"]`);
    await waitForStableGeometry(slider);
    const box = await marker.boundingBox();
    if (!box) throw new Error('Missing event marker');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(dialog.locator(`[data-card-type="${view}"]`)).toHaveAttribute('aria-hidden', 'false');
    await expect.poll(async () => {
      const thumb = await page.locator('[data-timeline-thumb]').boundingBox();
      const dot = await marker.boundingBox();
      return Math.abs((thumb!.x + thumb!.width / 2) - (dot!.x + dot!.width / 2));
    }).toBeLessThan(0.5);
    expect(await slider.getAttribute('aria-valuetext')).toContain(view[0].toUpperCase() + view.slice(1));
  }
  await slider.press('Home');
  await expect(dialog.locator('[data-card-type="now"]')).toHaveAttribute('aria-hidden', 'false');
});

test('shows location automatically before requesting access and remembers dismissal for the session', async ({ page }) => {
  await installWeatherHarness(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('location-popup-test-started')) {
      sessionStorage.removeItem('soleil:location-prompt-dismissed:v1');
      sessionStorage.setItem('location-popup-test-started', '1');
    }
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition: () => { throw new Error('Location requested before consent'); },
    } });
  });
  await page.goto('/');
  const prompt = page.getByRole('dialog', { name: 'Find nearby spots' });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Use my location' })).toBeVisible();
  await expect(prompt.getByRole('status')).toContainText('Your coordinates are never saved');
  await prompt.press('Shift+Tab');
  await expect(prompt.getByRole('button', { name: 'Not now' })).toBeFocused();
  await prompt.getByRole('button', { name: 'Not now' }).press('Tab');
  await expect(prompt.getByRole('button', { name: 'Use my location' })).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  await prompt.getByRole('button', { name: 'Not now' }).click();
  await expect(prompt).toBeHidden();
  await expect(page.getByRole('region', { name: 'Location preferences' })).toHaveCount(0);
  await page.reload();
  await expect(prompt).toBeHidden();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Location', exact: true }).filter({ visible: true }).click();
  await expect(prompt).toBeVisible();
  await prompt.press('Escape');
  await expect(prompt).toBeHidden();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
});

test('recovers from denied location and closes the popup after an allowed retry', async ({ page }) => {
  await installWeatherHarness(page);
  await page.addInitScript(() => {
    let requests = 0;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition: (success: PositionCallback, error: PositionErrorCallback) => {
        requests += 1;
        if (requests === 1) error({ code: 1, message: 'Denied' } as GeolocationPositionError);
        else success({ coords: { latitude: 37.7594, longitude: -122.5107, accuracy: 30 }, timestamp: Date.now() } as GeolocationPosition);
      },
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Location', exact: true }).filter({ visible: true }).click();
  const prompt = page.getByRole('dialog', { name: 'Find nearby spots' });
  await prompt.getByRole('button', { name: 'Use my location' }).click();
  await expect(prompt.getByRole('status')).toContainText('denied');
  await expect(prompt.getByRole('button', { name: 'Choose a city' })).toBeVisible();
  await prompt.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(prompt).toBeHidden();
  await expect(page.getByRole('region', { name: 'Location preferences' })).toHaveCount(0);
});


test('aligns tonight’s stargazing card and marker after dusk', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-29T21:30:00-07:00'));
  await installWeatherHarness(page);
  await page.goto('/?spot=sf-ocean-beach&view=stargazing');
  const slider = page.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  const card = page.locator('[data-card-type="stargazing"]');
  const timeline = page.getByRole('group', { name: 'Timeline scrubber' });
  await expect(timeline).toContainText('Today');
  await expect(card).toHaveAttribute('aria-hidden', 'false');
  const thumb = await page.locator('[data-timeline-thumb]').boundingBox();
  const marker = await page.locator('[data-timeline-event="stargazing"]').first().boundingBox();
  expect(Math.abs(thumb!.x + thumb!.width / 2 - marker!.x - marker!.width / 2)).toBeLessThan(0.5);
  await slider.press('Home');
  await expect(card).toHaveAttribute('aria-hidden', 'true');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
});


test('moves one timeline between the map and spot card without losing the selected hour', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  const mapTimeline = page.getByRole('complementary', { name: 'Map time controls' });
  const slider = page.getByRole('slider', { name: 'Forecast hour' });
  await expect(mapTimeline).toBeVisible();
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  await slider.press('ArrowRight');
  const selectedTime = await slider.getAttribute('aria-valuetext');
  await page.getByRole('button', { name: 'Search spots' }).click();
  const search = page.getByRole('dialog', { name: 'Search spots' });
  await search.getByPlaceholder('Search spots…').fill('Ocean Beach');
  await search.getByRole('button', { name: /Ocean Beach/ }).click();
  const spot = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  await expect(spot.getByRole('region', { name: 'Spot time controls' })).toBeVisible();
  await expect(mapTimeline).toHaveCount(0);
  await expect(slider).toHaveCount(1);
  await expect(slider).toHaveAttribute('aria-valuetext', selectedTime!);
  await expect.poll(async () => {
    const pin = await page.locator('.leaflet-marker-icon[aria-label^="Ocean Beach,"]').boundingBox();
    const sheet = await spot.boundingBox();
    const viewport = page.viewportSize()!;
    return Boolean(pin && sheet && pin.x >= 0 && pin.x + pin.width <= viewport.width && pin.y >= 44 && pin.y + pin.height <= sheet.y);
  }).toBe(true);
  await spot.press('Escape');
  await expect(spot).toHaveCount(0);
  await expect(mapTimeline).toBeVisible();
  await expect(slider).toHaveCount(1);
  await expect(slider).toHaveAttribute('aria-valuetext', selectedTime!);
});

test('opens confidence review windows without closing the spot and keeps the header on one line', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/?spot=sf-lafayette-park&view=sunset');
  const dialog = page.getByRole('dialog', { name: 'Lafayette Park sky scores' });
  const confidence = dialog.getByRole('button', { name: /Forecast confidence: .*Show details/ });
  await confidence.click();
  const details = dialog.getByRole('region', { name: 'Forecast confidence details' });
  await expect(details).toBeVisible();
  await expect(details).toContainText('experimental sky estimate');
  await expect(details).toContainText('at most medium confidence');
  await expect(details).toContainText('Check again before leaving');
  await expect(details).toContainText('not the probability of a colorful sky');
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(confidence).toBeFocused();
  const centers = await Promise.all([
    dialog.getByRole('button', { name: 'Save Lafayette Park', exact: true }),
    dialog.getByRole('heading', { name: 'Lafayette Park', exact: true }),
    confidence,
    dialog.locator('[data-primary-score] > span[aria-label^="Sunset score"]'),
  ].map(async (locator) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error('Missing header item');
    return box.y + box.height / 2;
  }));
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(2);
  const beforeSave = await dialog.boundingBox();
  await dialog.getByRole('button', { name: 'Save Lafayette Park', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Remove Lafayette Park from saved spots' })).toHaveAttribute('aria-pressed', 'true');
  const afterSave = await dialog.boundingBox();
  expect(afterSave?.height).toBe(beforeSave?.height);
  await expect(dialog.getByRole('button', { name: 'Return to Now', exact: true })).toHaveCount(0);
  const marker = dialog.locator('[data-timeline-now]');
  const box = await marker.boundingBox();
  if (!box) throw new Error('Missing current-time marker');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toHaveAttribute('aria-valuetext', 'Daytime, Now · 6:15 PM');
  const accessibility = await new AxeBuilder({ page })
    .include('[role="dialog"][aria-label="Lafayette Park sky scores"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test('keeps travel and temperature in the compact card with full forecast information in Details', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/?spot=sf-lafayette-park&view=sunset');
  const dialog = page.getByRole('dialog', { name: 'Lafayette Park sky scores' });
  const card = dialog.locator('[data-card-type="sunset"]');
  await expect(card.getByRole('button', { name: 'Details', exact: true })).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Travel mode' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Get directions' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Open Street View' })).toBeVisible();
  await expect(card.locator('[data-temperature]')).toBeVisible();
  await expect(card.getByRole('tablist', { name: 'Score contributions' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Show degrees Celsius' })).toHaveCount(0);
  await expect(dialog.getByRole('group', { name: /Forecast confidence:/ })).toHaveText('');
  await expect(dialog.getByRole('region', { name: 'Spot time controls' })).toHaveCSS('border-top-width', '0px');
  const summaryBox = await dialog.boundingBox();
  expect(summaryBox?.height).toBeLessThan(page.viewportSize()!.height * 0.65);
  await card.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(card.getByRole('tab', { name: 'Sky', exact: true })).toHaveAttribute('aria-selected', 'true');
  const outerScroll = card.locator('[data-card-scroll]');
  await expect.poll(() => outerScroll.evaluate((element) => element.scrollTop)).toBe(0);
  const tabBox = await card.getByRole('tablist', { name: 'Score contributions' }).boundingBox();
  const outerBox = await outerScroll.boundingBox();
  expect(tabBox!.y).toBeGreaterThanOrEqual(outerBox!.y - 1);
  const sky = card.getByRole('tabpanel');
  for (const label of ['Temperature', 'Cloud cover', 'Conditions', 'Wind', 'Visibility', 'Humidity', 'Fog signal']) {
    await expect(sky.getByText(label, { exact: true })).toBeVisible();
  }
  await card.getByRole('button', { name: 'Show degrees Celsius' }).click();
  await expect(card.getByRole('button', { name: 'Show degrees Celsius' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('tab', { name: 'Spot', exact: true }).click();
  await expect(card.getByRole('tabpanel').getByText('Horizon', { exact: true })).toBeVisible();
  await expect(card.getByRole('tabpanel').getByText('Elevation', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Details', exact: true })).toBeFocused();
  await expect(card.locator('[data-temperature]')).toHaveText(/°C$/);
  await expect.poll(async () => (await dialog.boundingBox())?.height).toBeCloseTo(summaryBox!.height, 0);
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toHaveCount(1);
});

test('clicking forecast dates and dragging keeps map and spot synchronized without hourly refetches', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  await page.goto(SPOT_URL);
  const slider = page.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  await expect(page.getByRole('button', { name: /^Ocean Beach, score/ })).toHaveAttribute('aria-label', /sky estimate/);
  await expect.poll(() => harness.requests.active).toBe(0);
  await expect(page.locator('[data-spot-forecast-progress]')).toHaveCount(0, { timeout: 30000 });
  const requestsBefore = harness.requests.forecast.length + harness.requests.airQuality.length;
  await setForecastRange(page, '7d');
  const days = page.getByRole('group', { name: 'Forecast day', exact: true });
  await expect(days.getByRole('button')).toHaveCount(7);
  await expect(days.getByRole('button', { name: 'Sunday, August 30', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(slider).toHaveCount(0);
  await days.getByRole('button', { name: 'Saturday, September 5', exact: true }).click();
  await expect(page.locator('[data-timeline-event="sunset"]')).toHaveCount(1);
  await slider.press('End');
  const selected = await page.locator('[data-selected-time]').getAttribute('data-selected-instant');
  expect(Date.parse(selected!)).toBeGreaterThan(Date.parse('2026-09-05T00:00:00Z'));
  const score = await page.locator('[data-active-score]').innerText();
  await expect(page.getByRole('button', { name: /^Ocean Beach, score/ })).toContainText(score);
  await expect(page.locator('[data-card-type="now"] [data-card-instant]')).toHaveAttribute('data-card-instant', selected!);
  await page.getByRole('button', { name: 'All 7 days', exact: true }).click();
  await page.getByRole('group', { name: 'Forecast day', exact: true }).getByRole('button', { name: 'Friday, September 4', exact: true }).click();
  await expect(page.locator('[data-selected-time]')).not.toHaveAttribute('data-selected-instant', selected!);
  expect(harness.requests.forecast.length + harness.requests.airQuality.length).toBe(requestsBefore);
  await page.getByRole('button', { name: 'Swipe down to dismiss, or tap to close' }).click();
  await expect(page.getByRole('dialog', { name: 'Ocean Beach sky scores' })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toHaveCount(1);
  await expect(page.locator('[data-forecast-range]')).toHaveAttribute('data-forecast-range', '7d');
  await setForecastRange(page, '24h');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Daytime, Now · 6:15 PM');
  assertNoDuplicateWeatherRequests(harness.requests);
});

test('preserves the exact selected event while the viewport rotates', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);
  const slider = page.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  const marker = page.locator('[data-timeline-event="sunset"]');
  const box = await waitForStableGeometry(marker);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const instant = await page.locator('[data-selected-time]').getAttribute('data-selected-instant');
  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await waitForStableGeometry(page.getByRole('dialog', { name: 'Ocean Beach sky scores' }));
    await expect(page.locator('[data-card-type="sunset"]')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('[data-selected-time]')).toHaveAttribute('data-selected-instant', instant!);
    const bounds = await page.getByRole('group', { name: 'Timeline scrubber' }).boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  }
});

test('keeps the map daily controls and both end thumbs inside the viewport', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toHaveAttribute('aria-disabled', 'false');
  await setForecastRange(page, '7d');
  await page.getByRole('button', { name: 'Saturday, September 5', exact: true }).click();
  await page.getByRole('button', { name: 'Swipe down to dismiss, or tap to close' }).click();
  const footer = page.getByRole('complementary', { name: 'Map time controls' });
  await waitForStableGeometry(footer);
  const slider = footer.getByRole('slider', { name: 'Forecast hour' });
  for (const edge of ['Home', 'End']) {
    await slider.press(edge);
    const rail = await slider.boundingBox();
    const thumb = await page.locator('[data-timeline-thumb]').boundingBox();
    expect(thumb!.x).toBeGreaterThanOrEqual(rail!.x - 1);
    expect(thumb!.x + thumb!.width).toBeLessThanOrEqual(rail!.x + rail!.width + 1);
    const bottom = await footer.evaluate((element) => {
      const controls = element.querySelector('[data-timeline-level]')!.getBoundingClientRect();
      return { bottom: controls.bottom, viewport: window.innerHeight, footer: element.getBoundingClientRect().bottom };
    });
    expect(bottom.bottom).toBeLessThanOrEqual(bottom.footer);
    expect(bottom.bottom).toBeLessThanOrEqual(bottom.viewport);
  }
});

test('weekly event snaps show the exact future event in the card and shared timeline', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);
  const slider = page.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  await setForecastRange(page, '7d');
  await page.getByRole('combobox', { name: 'Sky view' }).click();
  await page.getByRole('option', { name: 'Sunset', exact: true }).click();
  await page.getByRole('group', { name: 'Forecast day', exact: true }).getByRole('button', { name: 'Thursday, September 3', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Sky view' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'All 7 days', exact: true })).toBeVisible();
  const marker = page.locator('[data-timeline-event="sunset"]');
  const instant = await marker.getAttribute('data-event-instant');
  const box = await waitForStableGeometry(marker);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('[data-card-type="sunset"]')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('[data-selected-time]')).toHaveAttribute('data-selected-instant', instant!);
  await expect(page.locator('[data-card-type="sunset"] [data-card-instant]')).toHaveAttribute('data-card-instant', instant!);
  const score = await page.locator('[data-active-score]').innerText();
  await expect(page.getByRole('button', { name: /^Ocean Beach, score/ })).toContainText(score);
  await slider.press('ArrowRight');
  await expect(page.locator('[data-card-type="now"]')).toHaveAttribute('aria-hidden', 'false');
  await expect(slider).not.toHaveAttribute('aria-valuetext', /Now ·/);
  await slider.press('Home');
  await expect(page.locator('[data-selected-time]')).toHaveAttribute('data-selected-instant', '2026-09-03T07:00:00.000Z');
  await expect(page.locator('[data-forecast-range]')).toHaveAttribute('data-forecast-range', '7d');
  await page.reload();
  await expect(page.locator('[data-forecast-range]')).toHaveAttribute('data-forecast-range', '7d');
});

test('weekly scores disclose missing haze while retaining available sky forecasts', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  const time = Array.from({ length: 192 }, (_, index) => (Date.UTC(2026, 7, 29, 7) + index * 3_600_000) / 1000);
  const values = (value: number) => time.map(() => value);
  harness.hourlyByCoordinates.set(OCEAN_BEACH_COORDINATES, {
    forecast: { time, cloud_cover: values(30), cloud_cover_low: values(10), cloud_cover_mid: values(45), cloud_cover_high: values(35),
      visibility: values(18_000), relative_humidity_2m: values(55), temperature_2m: values(65), precipitation_probability: values(0),
      wind_speed_10m: values(5), wind_gusts_10m: values(8), wind_direction_10m: values(270) },
    airQuality: { time, pm2_5: time.map((_, index) => index < 96 ? 4 : NaN), us_aqi: time.map((_, index) => index < 96 ? 18 : NaN) },
  });
  await page.goto(SPOT_URL);
  const slider = page.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  await setForecastRange(page, '7d');
  await page.getByRole('combobox', { name: 'Sky view' }).click();
  await page.getByRole('option', { name: 'Sunset', exact: true }).click();
  await page.getByRole('group', { name: 'Forecast day', exact: true }).getByRole('button', { name: 'Saturday, September 5', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Sky view' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'All 7 days', exact: true })).toBeVisible();
  const marker = page.locator('[data-timeline-event="sunset"]');
  const box = await waitForStableGeometry(marker);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('[data-active-score]')).toHaveText(/^\d+$/);
  await expect(page.getByRole('dialog', { name: 'Ocean Beach sky scores' }).getByText('Weather-only estimate', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Forecast confidence: Low. Show details' })).toHaveText('');
  await expect(page.getByRole('button', { name: /^Ocean Beach, score/ })).toHaveAttribute('aria-label', /planning outlook · low confidence/);
  await page.getByRole('button', { name: 'Forecast confidence: Low. Show details' }).click();
  await expect(page.getByRole('region', { name: 'Forecast confidence details' })).toContainText('Haze data is unavailable for this time');
  await expect(page.getByRole('region', { name: 'Forecast confidence details' })).toContainText('Check again the day before and before leaving');
});
