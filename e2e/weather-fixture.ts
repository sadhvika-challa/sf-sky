import type { Page, Route } from '@playwright/test';
import { Buffer } from 'node:buffer';

export const FIXED_NOW = new Date('2026-08-29T18:15:00-07:00');
export const OCEAN_BEACH_COORDINATES = '37.7594,-122.5107';

const ONBOARDING_KEYS = [
  'onboarding:v2:welcome',
  'onboarding:v2:tap-spot',
  'onboarding:v2:scroll-cards',
  'onboarding:v2:weather-overlay',
  'onboarding:v2:metrics',
  'onboarding:v2:scrub-timeline',
  'onboarding:v2:complete',
];

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/l4W7WQAAAABJRU5ErkJggg==',
  'base64',
);

function localHourStrings(): string[] {
  const values: string[] = [];
  const start = Date.UTC(2026, 7, 29, 0);
  for (let index = 0; index < 72; index += 1) {
    values.push(new Date(start + index * 3_600_000).toISOString().slice(0, 13) + ':00');
  }
  return values;
}

const hourStrings = localHourStrings();

function valuesForHours(build: (index: number) => number): number[] {
  return hourStrings.map((_, index) => build(index));
}

const forecastResponse = {
  hourly: {
    time: hourStrings,
    cloud_cover: valuesForHours((index) => (index * 17) % 101),
    cloud_cover_low: valuesForHours((index) => (index * 11) % 80),
    cloud_cover_mid: valuesForHours((index) => (index * 7) % 70),
    cloud_cover_high: valuesForHours((index) => 20 + ((index * 13) % 75)),
    visibility: valuesForHours((index) => 5_000 + index * 550),
    relative_humidity_2m: valuesForHours((index) => 48 + (index % 12) * 4),
    temperature_2m: valuesForHours((index) => 52 + (index % 12) * 2),
    precipitation_probability: valuesForHours((index) => (index * 9) % 55),
    wind_speed_10m: valuesForHours((index) => 3 + (index % 10) * 2),
    wind_gusts_10m: valuesForHours((index) => 7 + (index % 10) * 2.5),
    wind_direction_10m: valuesForHours((index) => (index * 31) % 360),
  },
};

const airQualityResponse = {
  hourly: {
    time: hourStrings,
    pm2_5: valuesForHours((index) => 4 + (index % 8)),
    us_aqi: valuesForHours((index) => 18 + (index % 9) * 3),
  },
};

function coordinates(url: URL): string {
  return `${url.searchParams.get('latitude')},${url.searchParams.get('longitude')}`;
}

export interface WeatherRequestLog {
  forecast: string[];
  airQuality: string[];
  unexpectedExternal: string[];
}

export interface WeatherHarness {
  requests: WeatherRequestLog;
  failCoordinates: Set<string>;
}

export async function installDeterministicBrowserState(page: Page): Promise<void> {
  await page.clock.install({ time: FIXED_NOW });
  await page.addInitScript((keys: string[]) => {
    for (const key of keys) window.localStorage.setItem(key, '1');
    window.localStorage.setItem('karl-pwa:dismissed-at', String(Date.now()));
  }, ONBOARDING_KEYS);
}

export async function installWeatherHarness(page: Page): Promise<WeatherHarness> {
  const requests: WeatherRequestLog = {
    forecast: [],
    airQuality: [],
    unexpectedExternal: [],
  };
  const failCoordinates = new Set<string>();

  await page.route('https://api.open-meteo.com/v1/forecast?*', async (route: Route) => {
    const url = new URL(route.request().url());
    const coordinateKey = coordinates(url);
    requests.forecast.push(coordinateKey);
    if (failCoordinates.has(coordinateKey)) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', json: forecastResponse });
  });

  await page.route('https://air-quality-api.open-meteo.com/v1/air-quality?*', async (route: Route) => {
    const url = new URL(route.request().url());
    const coordinateKey = coordinates(url);
    requests.airQuality.push(coordinateKey);
    if (failCoordinates.has(coordinateKey)) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', json: airQualityResponse });
  });

  await page.route(/https:\/\/[a-d]\.basemaps\.cartocdn\.com\/.+\.png/, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG });
  });

  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com)\//, async (route: Route) => {
    requests.unexpectedExternal.push(route.request().url());
    await route.abort('blockedbyclient');
  });

  return { requests, failCoordinates };
}

export function assertNoDuplicateWeatherRequests(requests: WeatherRequestLog): void {
  const forecastUnique = new Set(requests.forecast);
  const airUnique = new Set(requests.airQuality);
  if (forecastUnique.size !== requests.forecast.length) {
    throw new Error(`Duplicate forecast requests: ${requests.forecast.length} calls for ${forecastUnique.size} coordinates`);
  }
  if (airUnique.size !== requests.airQuality.length) {
    throw new Error(`Duplicate air-quality requests: ${requests.airQuality.length} calls for ${airUnique.size} coordinates`);
  }
}
