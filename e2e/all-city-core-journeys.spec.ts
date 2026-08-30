import { expect, test, type Locator } from '@playwright/test';
import {
  assertNoDuplicateWeatherRequests,
  assertNoLiveOpenMeteoTraffic,
  expectWeatherRequestBudget,
  installDeterministicBrowserState,
  installWeatherHarness,
} from './weather-fixture';

const CARD_ORDER = ['now', 'sunrise', 'sunset', 'stargazing'];

const REPRESENTATIVE_SPOTS = [
  {
    cityId: 'sf',
    cityName: 'San Francisco',
    spotId: 'sf-ocean-beach',
    spotName: 'Ocean Beach',
  },
  {
    cityId: 'chicago',
    cityName: 'Chicago',
    spotId: 'chi-north-ave-beach',
    spotName: 'North Avenue Beach',
  },
  {
    cityId: 'austin',
    cityName: 'Austin',
    spotId: 'atx-mount-bonnell',
    spotName: 'Mount Bonnell (Covert Park)',
  },
  {
    cityId: 'santa-cruz',
    cityName: 'Santa Cruz',
    spotId: 'sc-west-cliff',
    spotName: 'West Cliff Drive (Lighthouse Point)',
  },
] as const;

async function cardOrder(dialog: Locator): Promise<string[]> {
  return dialog.locator('[data-card-type]').evaluateAll((cards) =>
    cards.map((card) => card.getAttribute('data-card-type') ?? ''),
  );
}

test.beforeEach(async ({ page }) => {
  await installDeterministicBrowserState(page);
});

for (const representative of REPRESENTATIVE_SPOTS) {
  test(`${representative.cityName} keeps its representative spot and every sky card coherent`, async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop-chromium',
      'All-city data identity is exercised once; cross-browser interaction coverage lives in the focused flow specs.',
    );

    const weather = await installWeatherHarness(page);
    await page.goto(`/?spot=${representative.spotId}&view=now`);

    const dialog = page.getByRole('dialog', {
      name: `${representative.spotName} sky scores`,
    });
    const nowCard = dialog.locator('[data-card-type="now"]');
    const tablist = dialog.getByRole('tablist', { name: 'Card pages' });
    const slider = nowCard.getByRole('slider', { name: 'Forecast hour' });

    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sky:activeCity')))
      .toBe(representative.cityId);
    await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
    await expect(tablist.getByRole('tab')).toHaveCount(CARD_ORDER.length);
    await expect(tablist.getByRole('tab', { name: 'Show Now card' }))
      .toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByRole('group', { name: 'Timeline scrubber' })).toHaveCount(1);
    await expect(nowCard.getByRole('group', { name: 'Timeline scrubber' })).toBeVisible();
    for (const eventType of CARD_ORDER.slice(1)) {
      await expect(dialog.locator(`[data-card-type="${eventType}"]`)
        .getByRole('group', { name: 'Timeline scrubber' })).toHaveCount(0);
    }

    await expect(nowCard.getByText('Current forecast · high confidence', { exact: true }))
      .toBeVisible();
    await expect(slider).toHaveAttribute('aria-disabled', 'false');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await slider.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '1');
    await expect(nowCard.getByRole('heading', { level: 3 }))
      .toHaveText(/^NOW · (SELECTED HOUR|SUNRISE|SUNSET|STARGAZING)$/);
    await expect(nowCard.getByText('Selected-hour forecast · high confidence', { exact: true }))
      .toBeVisible();

    const scoreSurface = dialog.locator('[aria-label^="Now score "]');
    const selectedScore = (await scoreSurface.textContent())?.trim();
    expect(selectedScore).toMatch(/^\d{1,3}$/);
    await expect(scoreSurface).toHaveAttribute(
      'aria-label',
      new RegExp(
        `^Now score ${selectedScore} out of 100, selected-hour forecast · high confidence, retrieved just now$`,
      ),
    );
    await expect(nowCard.getByText(selectedScore!, { exact: true })).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);

    await nowCard.getByRole('button', { name: 'Now', exact: true }).click();
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await expect(nowCard.getByText('Current forecast · high confidence', { exact: true }))
      .toBeVisible();

    for (const eventType of CARD_ORDER.slice(1)) {
      const label = eventType[0].toUpperCase() + eventType.slice(1);
      const tab = tablist.getByRole('tab', { name: `Show ${label} card` });
      const card = dialog.locator(`[data-card-type="${eventType}"]`);
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(card.getByRole('heading', { level: 3 }))
        .toContainText(label.toUpperCase());
      await expect(card.getByText('Forecast-backed · Retrieved just now', { exact: true }))
        .toBeVisible();
      await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveAttribute('aria-modal', 'false');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Settings' }).click();
    const visibleCityRow = page.locator('button[aria-label="Switch city"]:visible').locator('..');
    await expect(visibleCityRow.getByText(representative.cityName, { exact: true })).toBeVisible();

    assertNoLiveOpenMeteoTraffic(weather.requests);
    assertNoDuplicateWeatherRequests(weather.requests);
    expectWeatherRequestBudget(weather.requests, {
      forecast: 1,
      airQuality: 1,
      maxActive: 2,
      maxCoordinateJobs: 1,
    });
  });
}
