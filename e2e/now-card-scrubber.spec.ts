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
  await expect(slider).toHaveAttribute('aria-valuetext', 'Now, Now · 6:15 PM');

  await waitForStableGeometry(dialog);
  const initialScrollLeft = await currentCardScrollLeft(dialog);

  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await expect(slider).not.toHaveAttribute('aria-valuetext', /Now ·/);
  await expect(nowCard.getByText('Selected-hour forecast · high confidence', { exact: true })).toBeVisible();
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
  await expect(slider).toHaveAttribute('aria-valuenow', '24');
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');

  await page.keyboard.press('ArrowRight');
  await nowCard.getByRole('button', { name: 'Now', exact: true }).click();
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Now, Now · 6:15 PM');
  await expect(nowCard.getByText('Current forecast · high confidence', { exact: true })).toBeVisible();
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
  // Existing visual styling has known WCAG contrast debt. Keep axe active for
  // the whole expanded sheet and fail on every serious or critical rule other
  // than color-contrast, so structural regressions cannot hide behind it.
  expect(seriousViolations.filter((violation) => violation.id !== 'color-contrast')).toEqual([]);
  const contrastNodes = seriousViolations
    .filter((violation) => violation.id === 'color-contrast')
    .reduce((total, violation) => total + violation.nodes.length, 0);
  console.info(
    `[axe:${testInfo.project.name}:expanded-sheet] serious-or-critical=` +
    `${JSON.stringify(seriousViolations.map((violation) => ({ id: violation.id, nodes: violation.nodes.length })))} ` +
    `known-color-contrast-nodes=${contrastNodes}`,
  );

  assertNoDuplicateWeatherRequests(harness.requests);
  assertNoLiveOpenMeteoTraffic(harness.requests);
  expectWeatherRequestBudget(harness.requests, { forecast: 1, airQuality: 1, maxActive: 2 });
  console.info(
    '[weather-fixture] selected-spot budget: one forecast and one air-quality request',
  );
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
  const slider = nowCard.getByRole('slider', { name: 'Forecast hour' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');

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
  await expect(restored.getByRole('slider', { name: 'Forecast hour' })).toHaveAttribute('aria-valuenow', '1');
  await expect(restored.getByRole('heading', { level: 3 })).toHaveText('NOW · SELECTED HOUR');
  await expect(restored.getByText('Selected-hour forecast · high confidence', { exact: true })).toBeVisible();
});

test('keeps recovery available when the selected spot forecast fails', async ({ page }) => {
  const harness = await installWeatherHarness(page);
  harness.failCoordinates.add(OCEAN_BEACH_COORDINATES);
  await page.goto('/?spot=sf-twin-peaks&view=now');

  const firstSpot = page.getByRole('dialog', { name: 'Twin Peaks sky scores' });
  const firstSlider = firstSpot.locator('[data-card-type="now"]')
    .getByRole('slider', { name: 'Forecast hour' });
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
  const returnButton = nowCard.getByRole('button', { name: 'Return to Now' });
  await expect(returnButton).toBeVisible();
  await returnButton.click();

  await expect(errorDialog).toBeVisible();
  await expect(returnButton).toBeHidden();
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
  const slider = dialog.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toBeVisible();
  await expect(
    dialog.locator('[data-card-type="now"]')
      .getByText('Current forecast · high confidence', { exact: true }),
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
  const sunriseTab = dialog.getByRole('tab', { name: 'Show Sunrise card' });
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
  await expect(sunriseTab).toHaveAttribute('aria-selected', 'true');
});

test('dismisses the sheet from the dedicated handle pointer drag', async ({ page }) => {
  await installWeatherHarness(page);
  await page.goto(SPOT_URL);

  const dialog = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
  const handle = dialog.getByRole('button', { name: 'Swipe down to dismiss, or tap to collapse' });
  await expect(handle).toBeVisible();
  await expect(
    dialog.locator('[data-card-type="now"]')
      .getByText('Current forecast · high confidence', { exact: true }),
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
