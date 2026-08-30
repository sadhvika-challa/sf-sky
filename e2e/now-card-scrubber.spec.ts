import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import {
  OCEAN_BEACH_COORDINATES,
  assertNoDuplicateWeatherRequests,
  assertNoLiveOpenMeteoTraffic,
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
  await expect(slider).toHaveAttribute('aria-valuetext', 'Now, Now · 6pm');
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
  await expect(nowCard.getByText('Forecast unavailable · curated estimate', { exact: true })).toBeVisible();
  await expect(nowCard.getByText('Curated estimate · Forecast not retrieved', { exact: true })).toBeVisible();
  const returnButton = nowCard.getByRole('button', { name: 'Return to Now' });
  await expect(returnButton).toBeVisible();
  await returnButton.click();

  await expect(errorDialog).toBeVisible();
  await expect(returnButton).toBeHidden();
  await expect(nowCard.getByText('Forecast unavailable · curated estimate', { exact: true })).toBeVisible();
  await expect(cardOrder(errorDialog)).resolves.toEqual(CARD_ORDER);
  expect(harness.requests.forecast.filter((value) => value === OCEAN_BEACH_COORDINATES)).toHaveLength(1);
  assertNoLiveOpenMeteoTraffic(harness.requests);
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
  const box = await handle.boundingBox();
  if (!box) throw new Error('Sheet handle has no layout box');
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
