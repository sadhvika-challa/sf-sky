import type { Page, Route } from '@playwright/test';
import { Buffer } from 'node:buffer';

export const FIXED_NOW = new Date('2026-08-29T18:15:00-07:00');
export const OCEAN_BEACH_COORDINATES = '37.7594,-122.5107';
export const FIRST_FUTURE_HOUR_KEY = '2026-08-29T19';

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

function cacheKey(coordinateKey: string): string {
  const [latitude, longitude] = coordinateKey.split(',').map(Number);
  return `weather:v4:${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
}

function filteredHourlyResponse(
  source: Record<string, string[] | number[]>,
  omittedHours: Set<string>,
): Record<string, string[] | number[]> {
  const keepIndices = source.time
    .map((time, index) => ({ time: String(time).slice(0, 13), index }))
    .filter(({ time }) => !omittedHours.has(time))
    .map(({ index }) => index);
  return Object.fromEntries(
    Object.entries(source).map(([key, values]) => [key, keepIndices.map((index) => values[index])]),
  );
}

function forecastFixture(harness: WeatherHarness, coordinateKey: string): unknown {
  if (harness.emptyForecastCoordinates.has(coordinateKey)) return { hourly: { time: [] } };
  const hourly = filteredHourlyResponse(
    forecastResponse.hourly,
    harness.missingHourKeysByCoordinates.get(coordinateKey) ?? new Set<string>(),
  );
  if (harness.partialMetricCoordinates.has(coordinateKey)) {
    delete hourly.temperature_2m;
    delete hourly.wind_speed_10m;
    delete hourly.visibility;
  }
  return { hourly };
}

function airQualityFixture(harness: WeatherHarness, coordinateKey: string): unknown {
  return {
    hourly: filteredHourlyResponse(
      airQualityResponse.hourly,
      harness.missingHourKeysByCoordinates.get(coordinateKey) ?? new Set<string>(),
    ),
  };
}

function cachedHours(partialMetrics = false): Record<string, Record<string, number>> {
  return Object.fromEntries(hourStrings.map((time, index) => [time.slice(0, 13), {
    cloud: forecastResponse.hourly.cloud_cover[index],
    cloudLow: forecastResponse.hourly.cloud_cover_low[index],
    cloudMid: forecastResponse.hourly.cloud_cover_mid[index],
    cloudHigh: forecastResponse.hourly.cloud_cover_high[index],
    visibilityKm: partialMetrics ? Number.NaN : forecastResponse.hourly.visibility[index] / 1_000,
    humidity: forecastResponse.hourly.relative_humidity_2m[index],
    tempF: partialMetrics ? Number.NaN : forecastResponse.hourly.temperature_2m[index],
    precipProb: forecastResponse.hourly.precipitation_probability[index],
    windMph: partialMetrics ? Number.NaN : forecastResponse.hourly.wind_speed_10m[index],
    gustMph: forecastResponse.hourly.wind_gusts_10m[index],
    windDir: forecastResponse.hourly.wind_direction_10m[index],
    pm25: airQualityResponse.hourly.pm2_5[index],
    aqi: airQualityResponse.hourly.us_aqi[index],
  }]));
}

export interface WeatherRequestLog {
  forecast: string[];
  airQuality: string[];
  unexpectedExternal: string[];
  unhandledOpenMeteo: string[];
}

export interface DeferredForecast {
  requested: Promise<void>;
  release: () => void;
}

export interface WeatherHarness {
  requests: WeatherRequestLog;
  failCoordinates: Set<string>;
  failAirQualityCoordinates: Set<string>;
  missingHourKeysByCoordinates: Map<string, Set<string>>;
  partialMetricCoordinates: Set<string>;
  emptyForecastCoordinates: Set<string>;
  deferForecast: (coordinateKey: string) => DeferredForecast;
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
    unhandledOpenMeteo: [],
  };
  const failCoordinates = new Set<string>();
  const deferredForecasts = new Map<string, {
    requested: () => void;
    released: Promise<void>;
  }>();
  const harness: WeatherHarness = {
    requests,
    failCoordinates,
    failAirQualityCoordinates: new Set<string>(),
    missingHourKeysByCoordinates: new Map<string, Set<string>>(),
    partialMetricCoordinates: new Set<string>(),
    emptyForecastCoordinates: new Set<string>(),
    deferForecast: (coordinateKey) => {
      if (deferredForecasts.has(coordinateKey)) {
        throw new Error(`Forecast is already deferred for ${coordinateKey}`);
      }
      let markRequested = () => {};
      let release = () => {};
      const requested = new Promise<void>((resolve) => {
        markRequested = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      deferredForecasts.set(coordinateKey, { requested: markRequested, released });
      return { requested, release };
    },
  };

  await page.route(/^https:\/\/(api|air-quality-api)\.open-meteo\.com\//, async (route: Route) => {
    const url = new URL(route.request().url());
    const coordinateKey = coordinates(url);
    if (url.hostname === 'api.open-meteo.com' && url.pathname === '/v1/forecast') {
      requests.forecast.push(coordinateKey);
      const deferred = deferredForecasts.get(coordinateKey);
      if (deferred) {
        deferred.requested();
        await deferred.released;
        deferredForecasts.delete(coordinateKey);
      }
      if (harness.failCoordinates.has(coordinateKey)) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', json: forecastFixture(harness, coordinateKey) });
      return;
    }
    if (url.hostname === 'air-quality-api.open-meteo.com' && url.pathname === '/v1/air-quality') {
      requests.airQuality.push(coordinateKey);
      if (harness.failCoordinates.has(coordinateKey) || harness.failAirQualityCoordinates.has(coordinateKey)) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', json: airQualityFixture(harness, coordinateKey) });
      return;
    }
    requests.unhandledOpenMeteo.push(route.request().url());
    await route.abort('blockedbyclient');
  });

  await page.route(/https:\/\/[a-d]\.basemaps\.cartocdn\.com\/.+\.png/, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG });
  });

  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com)\//, async (route: Route) => {
    requests.unexpectedExternal.push(route.request().url());
    await route.abort('blockedbyclient');
  });

  return harness;
}

export async function seedCachedForecast(
  page: Page,
  coordinateKey: string,
  options: { fetchedAt: number; expiresAt: number; partialMetrics?: boolean },
): Promise<void> {
  const value = {
    forecast: {
      hours: cachedHours(options.partialMetrics),
      fetchedAt: options.fetchedAt,
    },
    expiresAt: options.expiresAt,
  };
  await page.addInitScript(({ key, serialized }) => {
    window.sessionStorage.setItem(key, serialized);
  }, { key: cacheKey(coordinateKey), serialized: JSON.stringify(value) });
}

export async function expireCachedForecast(page: Page, coordinateKey: string): Promise<void> {
  await page.evaluate((key) => {
    const serialized = window.sessionStorage.getItem(key);
    if (!serialized) throw new Error(`Expected cached forecast at ${key}`);
    const cached = JSON.parse(serialized) as { expiresAt: number };
    cached.expiresAt = Date.now() - 1;
    window.sessionStorage.setItem(key, JSON.stringify(cached));
  }, cacheKey(coordinateKey));
}

export function assertNoLiveOpenMeteoTraffic(requests: WeatherRequestLog): void {
  if (requests.unhandledOpenMeteo.length > 0) {
    throw new Error(`Unhandled Open-Meteo traffic: ${requests.unhandledOpenMeteo.join(', ')}`);
  }
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
