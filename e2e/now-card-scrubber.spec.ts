import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import {
  OCEAN_BEACH_COORDINATES,
  assertNoDuplicateWeatherRequests,
  assertNoLiveOpenMeteoTraffic,
  expectWeatherRequestBudget,
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

test('opens photos from the action row in a full-screen viewer and restores focus after closing it', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/?spot=sf-panorama-park&view=sunset');
  const sheet = page.getByRole('dialog', { name: 'Panorama Park, Yerba Buena Island sky scores' });
  const photoButton = sheet.getByRole('button', { name: 'View photos for Panorama Park, Yerba Buena Island' });
  const slider = sheet.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toBeVisible();
  await expect(sheet.getByRole('tabpanel').getByRole('group', { name: 'Forecast confidence: High' })).toBeVisible();
  const timeBefore = await slider.getAttribute('aria-valuetext');
  await expect(sheet.getByRole('tabpanel').locator('img')).toHaveCount(0);
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
  expect(modal!.x).toBeCloseTo(0, 0);
  expect(modal!.y).toBeCloseTo(0, 0);
  expect(modal!.width).toBeCloseTo(viewport.width, 0);
  expect(modal!.height).toBeCloseTo(viewport.height, 0);
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
  await expect(sheet.getByRole('tab', { name: 'Show Sunset card' })).toHaveAttribute('aria-selected', 'true');
  await photoButton.click();
  await viewer.getByRole('button', { name: 'Close photos', exact: true }).click();
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

test('gives every card-page tab a full hit target and supports keyboard paging', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const tablist = page.getByRole('tablist', { name: 'Sky views' });
  const tabs = tablist.getByRole('tab');
  await expect(dialog).toBeVisible();
  await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
  await expect(tabs).toHaveCount(CARD_ORDER.length);

  const tabGeometry = await tabs.evaluateAll((elements) => elements.map((element) => {
    const target = element.getBoundingClientRect();
    const dot = element.firstElementChild?.getBoundingClientRect();
    return {
      target: { left: target.left, right: target.right, top: target.top, bottom: target.bottom, width: target.width, height: target.height },
      dot: dot ? { width: dot.width, height: dot.height } : null,
    };
  }));
  for (const [index, geometry] of tabGeometry.entries()) {
    expect(geometry.target.width, `${CARD_ORDER[index]} tab width`).toBeGreaterThanOrEqual(43.99);
    expect(geometry.target.height, `${CARD_ORDER[index]} tab height`).toBeGreaterThanOrEqual(43.99);
    expect(geometry.dot?.width, `${CARD_ORDER[index]} visual dot stays compact`).toBeLessThanOrEqual(24);
    expect(geometry.dot?.height, `${CARD_ORDER[index]} visual dot stays compact`).toBeLessThanOrEqual(24);
    if (index > 0) {
      expect(
        geometry.target.left,
        `${CARD_ORDER[index - 1]} and ${CARD_ORDER[index]} targets must not overlap`,
      ).toBeGreaterThanOrEqual(tabGeometry[index - 1].target.right - 0.01);
    }
  }

  const nowTab = tablist.getByRole('tab', { name: 'Show Now card' });
  const sunriseTab = tablist.getByRole('tab', { name: 'Show Sunrise card' });
  const sunsetTab = tablist.getByRole('tab', { name: 'Show Sunset card' });
  const stargazingTab = tablist.getByRole('tab', { name: 'Show Stargazing card' });
  await expect(nowTab).toHaveAttribute('tabindex', '0');
  await expect(sunriseTab).toHaveAttribute('tabindex', '-1');
  const nowPage = dialog.locator('[data-card-type="now"]');
  const sunrisePage = dialog.locator('[data-card-type="sunrise"]');
  await expect(nowPage).toHaveAttribute('aria-hidden', 'false');
  await expect(sunrisePage).toHaveAttribute('aria-hidden', 'true');
  await expect(nowPage.getByRole('button', { name: 'See breakdown' })).toHaveCount(1);
  await expect(sunrisePage.getByRole('button', { name: 'See breakdown' })).toHaveCount(0);

  await nowTab.focus();
  await nowTab.press('ArrowRight');
  await expect(sunriseTab).toBeFocused();
  await expect(sunriseTab).toHaveAttribute('aria-selected', 'true');
  await expect(sunriseTab).toHaveAttribute('tabindex', '0');
  await expect(nowPage).toHaveAttribute('aria-hidden', 'true');
  await expect(sunrisePage).toHaveAttribute('aria-hidden', 'false');
  await expect(nowPage.getByRole('button', { name: 'See breakdown' })).toHaveCount(0);
  await expect(sunrisePage.getByRole('button', { name: 'See breakdown' })).toHaveCount(1);

  await sunriseTab.press('End');
  await expect(stargazingTab).toBeFocused();
  await expect(stargazingTab).toHaveAttribute('aria-selected', 'true');

  await stargazingTab.press('ArrowRight');
  await expect(nowTab).toBeFocused();
  await expect(nowTab).toHaveAttribute('aria-selected', 'true');

  await nowTab.press('ArrowLeft');
  await expect(stargazingTab).toBeFocused();
  await stargazingTab.press('Home');
  await expect(nowTab).toBeFocused();
  await expect(nowTab).toHaveAttribute('aria-selected', 'true');
  await expect(sunsetTab).toHaveAttribute('aria-selected', 'false');
  await expect(dialog).toBeVisible();
  await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
});

test('keeps only the spot scrubber inside the card and preserves its state', async ({ page }, testInfo) => {
  const harness = await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const nowCard = dialog.locator('[data-card-type="now"]');
  const slider = page.getByRole('slider', { name: 'Forecast hour' });
  const tablist = page.getByRole('tablist', { name: 'Sky views' });

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Spot time controls' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Map time controls' })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Timeline scrubber' })).toBeVisible();
  await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
  await expect(tablist.getByRole('tab')).toHaveCount(4);
  await expect(tablist.getByRole('tab', { name: 'Show Now card' })).toHaveAttribute('aria-selected', 'true');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Now, Now · 6:15 PM');

  await waitForStableGeometry(dialog);
  const initialScrollLeft = await currentCardScrollLeft(dialog);

  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await expect(slider).not.toHaveAttribute('aria-valuetext', /Now ·/);
  await expect(nowCard.getByRole('group', { name: 'Forecast confidence: High' })).toBeVisible();
  await expect(nowCard.getByText('Forecast-backed · Retrieved just now', { exact: true })).toBeVisible();
  await expect(nowCard.getByRole('heading', { level: 3 })).toHaveText('NOW · SELECTED HOUR');
  await expect(dialog).toBeVisible();
  await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
  await expect(tablist.getByRole('tab', { name: 'Show Now card' })).toHaveAttribute('aria-selected', 'true');
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
  await page.getByRole('region', { name: 'Spot time controls' }).getByRole('tab', { name: 'Show Now card', exact: true }).click();
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Now, Now · 6:15 PM');
  await expect(nowCard.getByRole('group', { name: 'Forecast confidence: High' })).toBeVisible();
  await expect(nowCard.getByText('Forecast-backed · Retrieved just now', { exact: true })).toBeVisible();
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
  const trustStatusBackground = await nowCard
    .locator('[data-contrast-audit="forecast-confidence"]')
    .evaluate((element) => getComputedStyle(element.closest('[data-card-scroll]')!.firstElementChild!).backgroundColor);
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
  expectWeatherRequestBudget(harness.requests, { forecast: 2, airQuality: 2, maxActive: 4 });
  console.info(
    '[weather-fixture] selected-spot and city timeline budget: two forecasts and two air-quality requests',
  );
});

test('keeps only the visible card face in the accessibility tree and restores focus after flipping', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const nowCard = dialog.locator('[data-card-type="now"]');
  const breakdown = nowCard.getByRole('button', { name: 'See breakdown' });
  await expect(breakdown).toBeVisible();
  await expect(nowCard.getByRole('button', { name: 'Back' })).toHaveCount(0);

  await breakdown.click();
  const back = nowCard.getByRole('button', { name: 'Back' });
  await expect(back).toBeVisible();
  await expect(back).toBeFocused();
  await expect(nowCard.getByRole('button', { name: 'See breakdown' })).toHaveCount(0);

  await back.click();
  const restoredBreakdown = nowCard.getByRole('button', { name: 'See breakdown' });
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
  expect(shared?.text).toContain('selected hour score at 7:00 pm');

  await page.goto(String(shared?.url));
  const restored = page
    .getByRole('dialog', { name: 'Ocean Beach sky scores' })
    .locator('[data-card-type="now"]');
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toHaveAttribute('aria-valuenow', '1');
  await expect(restored.getByRole('heading', { level: 3 })).toHaveText('NOW · SELECTED HOUR');
  await expect(restored.getByRole('group', { name: 'Forecast confidence: High' })).toBeVisible();
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
  await expect(slider).toHaveAttribute('aria-valuetext', 'Now, Today · 7:00 PM');
  await expect(nowCard.getByText('66°', { exact: true })).toBeVisible();
  await expect(nowCard.getByRole('group', { name: 'Forecast confidence: High' })).toBeVisible();

  const sheetScore = (await dialog.locator('[aria-label^="Now score "]').textContent())?.trim();
  expect(sheetScore).toMatch(/^\d{1,3}$/);
  await expect(dialog.locator('[aria-label^="Now score "]')).toHaveAttribute(
    'aria-label',
    new RegExp(`^Now score ${sheetScore} out of 100, selected-hour forecast · high confidence, retrieved just now$`),
  );
  await expect(nowCard.getByText(sheetScore!, { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('[aria-label^="Ocean Beach, score "]')).toHaveAttribute(
    'aria-label',
    new RegExp(`^Ocean Beach, score ${sheetScore} out of 100, selected-hour forecast · high confidence, retrieved just now$`),
  );

  await page.getByRole('button', { name: 'Search spots' }).click();
  const search = page.getByRole('dialog', { name: 'Search spots' });
  await search.getByPlaceholder('Search spots…').fill('Ocean Beach');
  await expect(search.getByText('Scores for Now · Today at 7:00 PM', { exact: true })).toBeVisible();
  const result = search.getByRole('button', { name: /Ocean Beach/ });
  await expect(result.getByText('Selected-hour forecast · high confidence', { exact: true })).toBeVisible();
  await expect(result.locator('span').last()).toHaveText(sheetScore!);

  await result.click();
  const reopenedCard = page
    .getByRole('dialog', { name: 'Ocean Beach sky scores' })
    .locator('[data-card-type="now"]');
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toHaveAttribute(
    'aria-valuetext',
    'Now, Today · 7:00 PM',
  );
  await expect(reopenedCard.getByText('66°', { exact: true })).toBeVisible();
  await expect(reopenedCard.getByRole('group', { name: 'Forecast confidence: High' })).toBeVisible();
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
    await expect(slider).toHaveAttribute('aria-valuetext', 'Now, Now · 8:15 PM');
    await expect(nowCard.getByRole('heading', { level: 3 })).toHaveText('RIGHT NOW');
    await expect(nowCard.getByRole('group', { name: 'Forecast confidence: High' })).toBeVisible();
    await expect(nowCard.getByText('64°', { exact: true })).toBeVisible();

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
  await expect(nowCard.getByText('Forecast unavailable · curated estimate', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('Curated estimate · Forecast not retrieved', { exact: true })).toBeVisible();
  const requestsBeforeReturn = harness.requests.forecast.filter(
    (value) => value === OCEAN_BEACH_COORDINATES,
  ).length;
  const returnButton = page.getByRole('region', { name: 'Spot time controls' }).getByRole('tab', { name: 'Show Now card', exact: true });
  await expect(returnButton).toBeVisible();
  await returnButton.click();

  await expect(errorDialog).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toHaveAttribute('aria-valuenow', '0');
  await expect(nowCard.getByText('Forecast unavailable · curated estimate', { exact: true })).toBeVisible();
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
    dialog.locator('[data-card-type="now"]')
      .getByRole('group', { name: 'Forecast confidence: High' }),
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
  await expect(nowPage.getByRole('button', { name: 'See breakdown' })).toBeAttached();

  const reachability = await nowPage.evaluate((pageElement) => {
    const scroller = pageElement.parentElement;
    const cardScroll = pageElement.querySelector<HTMLElement>('[data-card-scroll]');
    const scoreCard = cardScroll?.firstElementChild;
    const breakdown = Array.from(pageElement.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('See breakdown'),
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
      button.textContent?.includes('See breakdown'),
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
    const activeTab = document.querySelector<HTMLElement>(
      '[aria-label="Sky views"] [role="tab"][aria-selected="true"]',
    );
    const centeredType = centeredCard?.dataset.cardType;

    return centeredType !== 'now'
      && activeTab?.getAttribute('aria-controls') === centeredCard?.id;
  })).toBe(true);
});

test('dismisses the sheet from the dedicated handle pointer drag', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const handle = dialog.getByRole('button', { name: 'Swipe down to dismiss, or tap to collapse' });
  await expect(handle).toBeVisible();
  await expect(
    dialog.locator('[data-card-type="now"]')
      .getByRole('group', { name: 'Forecast confidence: High' }),
  ).toBeVisible();
  const box = await waitForStableGeometry(handle);
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
  const pins = page.locator('.leaflet-marker-pane [role="button"][aria-label*="city forecast estimate"]');
  await expect(pins.first()).toHaveAttribute('aria-label', /city forecast estimate/);
  const pinScores = () => pins.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')).sort());
  const before = await pinScores();
  await slider.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', (await slider.getAttribute('aria-valuemax'))!);
  await expect.poll(pinScores).not.toEqual(before);
  await slider.press('Home');
  await expect.poll(pinScores).toEqual(before);
  const viewport = page.viewportSize()!;
  const box = (await timeline.boundingBox())!;
  expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
  assertNoDuplicateWeatherRequests(harness.requests);
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
  await expect(dialog).toContainText('Private · This device');
  await expect(dialog.getByRole('button', { name: /^Share / })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Remove Test Roof from saved spots' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog).toContainText('Uncalibrated roof estimate');
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


test('synchronizes event icons, card times, timeline labels, and card swipes', async ({ page }) => {
  const weather = await installWeatherHarness(page);
  await page.goto(SPOT_URL);
  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const views = page.getByRole('tablist', { name: 'Sky views' });
  const timeline = dialog.getByRole('region', { name: 'Spot time controls' });
  await expect(dialog.locator('[data-card-type="now"]').getByRole('group', { name: 'Forecast confidence: High' })).toBeVisible();
  const requestsBefore = weather.requests.forecast.length;
  await views.getByRole('tab', { name: 'Show Sunset card' }).click();
  const sunset = dialog.locator('[data-card-type="sunset"]');
  await expect(sunset).toHaveAttribute('aria-hidden', 'false');
  await expect(views.getByRole('tab', { name: 'Show Sunset card' })).toHaveAttribute('aria-selected', 'true');
  await expect(timeline).toContainText('Sunset');
  const eventTime = await sunset.locator('span').filter({ hasText: /^\d{1,2}:\d{2}$/ }).first().textContent();
  await expect(timeline).toContainText(eventTime!.trim());
  await expect(views.getByRole('tab')).toHaveCount(4);
  await expect(views.getByRole('tab').locator('svg')).toHaveCount(4);
  expect((await views.innerText()).trim()).toBe('');
  for (const artwork of await dialog.locator('[data-sky-artwork]').all()) {
    expect((await artwork.textContent())?.trim()).toBe('');
  }
  await expect(sunset.getByRole('group', { name: /^Forecast confidence:/ })).toBeVisible();
  await expect(dialog.locator('[aria-label^="Sunset score"]')).toHaveAttribute('aria-label', /forecast/);
  await dialog.locator('.score-cards-scroll').evaluate((element) => {
    const target = element.querySelector<HTMLElement>('[data-card-type="sunrise"]')!;
    element.scrollTo({ left: target.offsetLeft - (element as HTMLElement).offsetLeft, behavior: 'instant' });
  });
  await expect(views.getByRole('tab', { name: 'Show Sunrise card' })).toHaveAttribute('aria-selected', 'true');
  await expect(timeline).toContainText('Sunrise');
  await timeline.getByRole('slider').press('ArrowRight');
  await expect(views.getByRole('tab', { name: 'Show Now card' })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.locator('[data-card-type="now"]')).toHaveAttribute('aria-hidden', 'false');
  await timeline.getByRole('tab', { name: 'Show Now card' }).click();
  await expect(timeline.getByRole('slider')).toHaveAttribute('aria-valuenow', '0');
  expect(weather.requests.forecast.length).toBe(requestsBefore);
});

test('removes the nighttime event strip and uses icon-only choices on the map', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /The Bay Lights|Photosynthesis|SPECTRA|Dismiss tonight/ })).toHaveCount(0);
  const views = page.getByRole('group', { name: 'Sky views' });
  expect((await views.innerText()).trim()).toBe('');
  await views.getByRole('button', { name: 'Sunrise', exact: true }).click();
  await expect(views.getByRole('button', { name: 'Sunrise', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('complementary', { name: 'Map time controls' })).toContainText('Sunrise');
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
    await expect(page.getByRole('tab', { name: `Show ${view[0].toUpperCase() + view.slice(1)} card` })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => {
      const thumb = await page.locator('[data-timeline-thumb]').boundingBox();
      const dot = await marker.boundingBox();
      return Math.abs((thumb!.x + thumb!.width / 2) - (dot!.x + dot!.width / 2));
    }).toBeLessThan(0.5);
    const timeText = await page.getByRole('group', { name: 'Timeline scrubber' }).innerText();
    const cardText = await dialog.locator(`[data-card-type="${view}"]`).innerText();
    expect(cardText.replace(/\s+/g, ' ').toLowerCase()).toContain(timeText.split(' · ')[1].trim().toLowerCase());
  }
  await slider.press('Home');
  await expect(page.getByRole('tab', { name: 'Show Now card' })).toHaveAttribute('aria-selected', 'true');
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
  const time = (await timeline.innerText()).split(' · ')[1].trim().toLowerCase();
  expect((await card.innerText()).replace(/\s+/g, ' ').toLowerCase()).toContain(time);
  const thumb = await page.locator('[data-timeline-thumb]').boundingBox();
  const marker = await page.locator('[data-timeline-event="stargazing"]').boundingBox();
  expect(Math.abs(thumb!.x + thumb!.width / 2 - marker!.x - marker!.width / 2)).toBeLessThan(0.5);
  await slider.press('Home');
  await expect(page.getByRole('tab', { name: 'Show Now card' })).toHaveAttribute('aria-selected', 'true');
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
  await spot.press('Escape');
  await expect(slider).toHaveCount(1);
  await expect(mapTimeline).toHaveCount(0);
  await spot.getByRole('button', { name: 'Expand Ocean Beach details' }).click();
  await expect(spot.getByRole('region', { name: 'Spot time controls' })).toBeVisible();
  await expect(slider).toHaveAttribute('aria-valuetext', selectedTime!);
  await spot.press('Escape');
  await spot.press('Escape');
  await expect(spot).toHaveCount(0);
  await expect(mapTimeline).toBeVisible();
  await expect(slider).toHaveCount(1);
  await expect(slider).toHaveAttribute('aria-valuetext', selectedTime!);
});
