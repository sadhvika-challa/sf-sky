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
    const pager = dialog.getByRole('group', { name: 'Sky cards', exact: true });
    const slider = page.getByRole('slider', { name: 'Forecast hour' });

    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sky:activeCity')))
      .toBe(representative.cityId);
    await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
    await expect(page.getByRole('tablist', { name: 'Sky views' })).toHaveCount(0);
    await expect(nowCard).toHaveAttribute('aria-hidden', 'false');
    await expect(page.getByRole('group', { name: 'Timeline scrubber' })).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Timeline scrubber' })).toBeVisible();
    for (const eventType of CARD_ORDER.slice(1)) {
      await expect(dialog.locator(`[data-card-type="${eventType}"]`)
        .getByRole('group', { name: 'Timeline scrubber' })).toHaveCount(0);
    }

    await expect(dialog.getByRole('group', { name: 'Forecast confidence: High' }))
      .toBeVisible();
    await expect(slider).toHaveAttribute('aria-disabled', 'false');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await slider.press('ArrowRight');
    // Exact events can occur before the next forecast hour in this city.
    for (let step = 0; step < 3 && await nowCard.getAttribute('aria-hidden') !== 'false'; step += 1) {
      await slider.press('ArrowRight');
    }
    await expect(nowCard).toHaveAttribute('aria-hidden', 'false');
    expect(Number(await slider.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    await expect(slider).not.toHaveAttribute('aria-valuetext', /Now ·/);
    await expect(dialog.getByRole('group', { name: 'Forecast confidence: High' }))
      .toBeVisible();

    const scoreSurface = dialog.locator('[data-primary-score] > span[aria-label*=" score "]');
    const selectedScore = (await scoreSurface.textContent())?.trim();
    expect(selectedScore).toMatch(/^\d{1,3}$/);
    await expect(scoreSurface).toHaveAttribute(
      'aria-label',
      new RegExp(
        `^(Daytime|Nighttime|Sunrise|Sunset) score ${selectedScore} out of 100, selected-hour forecast · high confidence, retrieved just now$`,
      ),
    );
    await expect(scoreSurface).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);

    await slider.press('Home');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await expect(dialog.getByRole('group', { name: 'Forecast confidence: High' }))
      .toBeVisible();

    for (const eventType of CARD_ORDER.slice(1)) {
      const label = eventType === 'stargazing' ? 'Nighttime' : eventType[0].toUpperCase() + eventType.slice(1);
      await pager.press('ArrowRight');
      const card = dialog.locator(`[data-card-type="${eventType}"]`);
      await expect(card).toHaveAttribute('aria-hidden', 'false');
      await expect(slider).toHaveAttribute('aria-valuetext', new RegExp(label));
      await expect(card.locator('[data-retrieval-badge]')).toBeVisible();
      await expect(cardOrder(dialog)).resolves.toEqual(CARD_ORDER);
    }

    await expect(dialog).toHaveAttribute('aria-modal', 'false');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Settings' }).click();
    const visibleCityRow = page.locator('button[aria-label="Switch city"]:visible').locator('..');
    await expect(visibleCityRow.getByText(representative.cityName, { exact: true })).toBeVisible();

    assertNoLiveOpenMeteoTraffic(weather.requests);
    assertNoDuplicateWeatherRequests(weather.requests);
    expectWeatherRequestBudget(weather.requests, {
      forecast: 2,
      airQuality: 2,
      maxActive: 4,
      maxCoordinateJobs: 2,
    });
  });
}
