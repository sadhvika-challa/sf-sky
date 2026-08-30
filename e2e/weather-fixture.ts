import type { Page, Request, Route } from '@playwright/test';
import { Buffer } from 'node:buffer';

export const FIXED_NOW = new Date('2026-08-29T18:15:00-07:00');
export const OCEAN_BEACH_COORDINATES = '37.7594,-122.5107';
export const FIRST_FUTURE_HOUR_KEY = '2026-08-30T02:00:00Z';

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

function hourlyEpochSeconds(): number[] {
  const values: number[] = [];
  // Midnight PDT on August 29. Open-Meteo returns Unix seconds in UTC even
  // when the requested timezone controls its forecast-day boundaries.
  const start = Date.UTC(2026, 7, 29, 7);
  for (let index = 0; index < 72; index += 1) {
    values.push((start + index * 3_600_000) / 1_000);
  }
  return values;
}

const hourSeconds = hourlyEpochSeconds();

function valuesForHours(build: (index: number) => number): number[] {
  return hourSeconds.map((_, index) => build(index));
}

const forecastResponse = {
  hourly: {
    time: hourSeconds,
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
    time: hourSeconds,
    pm2_5: valuesForHours((index) => 4 + (index % 8)),
    us_aqi: valuesForHours((index) => 18 + (index % 9) * 3),
  },
};

function coordinates(url: URL): string {
  return weatherCoordinateKey(
    Number(url.searchParams.get('latitude')),
    Number(url.searchParams.get('longitude')),
  );
}

export function weatherCoordinateKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

function cacheKey(
  coordinateKey: string,
  timeZone = 'America/Los_Angeles',
  includeAirQuality = true,
): string {
  const [latitude, longitude] = coordinateKey.split(',').map(Number);
  return `weather:v5:${latitude.toFixed(4)}:${longitude.toFixed(4)}:${timeZone}:` +
    (includeAirQuality ? 'weather-aq' : 'weather');
}

function filteredHourlyResponse(
  source: Record<string, number[]>,
  omittedHours: Set<string>,
): Record<string, number[]> {
  const keepIndices = source.time
    .map((time, index) => ({
      time: new Date(time * 1_000).toISOString().replace('.000Z', 'Z'),
      index,
    }))
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
  return Object.fromEntries(hourSeconds.map((time, index) => [
    new Date(time * 1_000).toISOString().replace('.000Z', 'Z'),
    {
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
    },
  ]));
}

export interface WeatherRequestLog {
  forecast: string[];
  airQuality: string[];
  completed: string[];
  failed: string[];
  aborted: string[];
  lifecycle: WeatherRequestLifecycle[];
  active: number;
  maxActive: number;
  activeCoordinateJobs: number;
  maxActiveCoordinateJobs: number;
  unexpectedExternal: string[];
  unhandledOpenMeteo: string[];
}

export interface WeatherRequestLifecycle {
  id: number;
  endpoint: WeatherEndpoint;
  coordinateKey: string;
  startedAt: number;
  terminalAt: number | null;
  terminal: 'finished' | 'aborted' | null;
  failureText: string | null;
}

export type WeatherEndpoint = 'forecast' | 'airQuality';

export type WeatherFailureMode =
  | { kind: 'http'; status: number }
  | { kind: 'offline' }
  | { kind: 'timeout' };

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
  hourlyByCoordinates: Map<string, {
    forecast: Record<string, number[]>;
    airQuality: Record<string, number[]>;
  }>;
  defaultHourly?: {
    forecast: Record<string, number[]>;
    airQuality: Record<string, number[]>;
  };
  /** Artificial server latency, useful for observing the scheduler's concurrency cap. */
  responseDelayMs: number;
  failureMode: WeatherFailureMode | null;
  failureModesByCoordinates: Map<string, Partial<Record<WeatherEndpoint, WeatherFailureMode>>>;
  releaseTimeoutFailures: () => void;
  deferForecast: (coordinateKey: string) => DeferredForecast;
}

export async function installDeterministicBrowserState(
  page: Page,
  now: Date = FIXED_NOW,
): Promise<void> {
  await page.clock.install({ time: now });
  await page.addInitScript((keys: string[]) => {
    for (const key of keys) window.localStorage.setItem(key, '1');
    window.localStorage.setItem('karl-pwa:dismissed-at', String(Date.now()));
  }, ONBOARDING_KEYS);
}

export async function installWeatherHarness(page: Page): Promise<WeatherHarness> {
  const requests: WeatherRequestLog = {
    forecast: [],
    airQuality: [],
    completed: [],
    failed: [],
    aborted: [],
    lifecycle: [],
    active: 0,
    maxActive: 0,
    activeCoordinateJobs: 0,
    maxActiveCoordinateJobs: 0,
    unexpectedExternal: [],
    unhandledOpenMeteo: [],
  };
  const failCoordinates = new Set<string>();
  const deferredForecasts = new Map<string, {
    requested: () => void;
    released: Promise<void>;
  }>();
  let timeoutFailureWaiters: Array<() => void> = [];
  const harness: WeatherHarness = {
    requests,
    failCoordinates,
    failAirQualityCoordinates: new Set<string>(),
    missingHourKeysByCoordinates: new Map<string, Set<string>>(),
    partialMetricCoordinates: new Set<string>(),
    emptyForecastCoordinates: new Set<string>(),
    hourlyByCoordinates: new Map(),
    responseDelayMs: 0,
    failureMode: null,
    failureModesByCoordinates: new Map(),
    releaseTimeoutFailures: () => {
      const waiters = timeoutFailureWaiters;
      timeoutFailureWaiters = [];
      for (const release of waiters) release();
    },
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
  const activeCoordinateRequests = new Map<string, number>();
  const lifecycleByRequest = new WeakMap<Request, WeatherRequestLifecycle>();
  let nextRequestId = 1;

  const beginRequest = (
    request: Request,
    endpoint: WeatherEndpoint,
    coordinateKey: string,
  ): WeatherRequestLifecycle => {
    const lifecycle: WeatherRequestLifecycle = {
      id: nextRequestId++,
      endpoint,
      coordinateKey,
      startedAt: Date.now(),
      terminalAt: null,
      terminal: null,
      failureText: null,
    };
    requests.lifecycle.push(lifecycle);
    lifecycleByRequest.set(request, lifecycle);
    requests.active += 1;
    requests.maxActive = Math.max(requests.maxActive, requests.active);
    const coordinateRequestCount = activeCoordinateRequests.get(coordinateKey) ?? 0;
    activeCoordinateRequests.set(coordinateKey, coordinateRequestCount + 1);
    if (coordinateRequestCount === 0) {
      requests.activeCoordinateJobs += 1;
      requests.maxActiveCoordinateJobs = Math.max(
        requests.maxActiveCoordinateJobs,
        requests.activeCoordinateJobs,
      );
    }
    return lifecycle;
  };

  const finishRequest = (
    request: Request,
    terminal: 'finished' | 'aborted',
    failureText: string | null = null,
  ): void => {
      const lifecycle = lifecycleByRequest.get(request);
      if (!lifecycle || lifecycle.terminal !== null) return;
      lifecycle.terminal = terminal;
      lifecycle.terminalAt = Date.now();
      lifecycle.failureText = failureText;
      requests.active -= 1;
      const remainingCoordinateRequests =
        (activeCoordinateRequests.get(lifecycle.coordinateKey) ?? 1) - 1;
      if (remainingCoordinateRequests <= 0) {
        activeCoordinateRequests.delete(lifecycle.coordinateKey);
        requests.activeCoordinateJobs -= 1;
      } else {
        activeCoordinateRequests.set(lifecycle.coordinateKey, remainingCoordinateRequests);
      }
      const label = `${lifecycle.endpoint}:${lifecycle.coordinateKey}`;
      if (terminal === 'finished') requests.completed.push(label);
      else requests.aborted.push(label);
  };

  page.on('requestfinished', (request) => finishRequest(request, 'finished'));
  page.on('requestfailed', (request) => {
    finishRequest(request, 'aborted', request.failure()?.errorText ?? 'request failed');
  });

  const waitForResponseDelay = async (): Promise<void> => {
    if (harness.responseDelayMs <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, harness.responseDelayMs));
  };

  const applyFailure = async (
    route: Route,
    endpoint: WeatherEndpoint,
    coordinateKey: string,
  ): Promise<boolean> => {
    const mode = harness.failureModesByCoordinates.get(coordinateKey)?.[endpoint]
      ?? harness.failureMode;
    if (!mode) return false;
    requests.failed.push(`${endpoint}:${coordinateKey}:${mode.kind}`);
    if (mode.kind === 'http') {
      await route.fulfill({ status: mode.status, contentType: 'application/json', body: '{}' });
      return true;
    }
    if (mode.kind === 'offline') {
      await route.abort('internetdisconnected');
      return true;
    }
    await new Promise<void>((resolve) => timeoutFailureWaiters.push(resolve));
    try {
      await route.abort('timedout');
    } catch {
      // The application timeout may have already cancelled the intercepted request.
    }
    return true;
  };

  await page.route(/^https:\/\/(api|air-quality-api)\.open-meteo\.com\//, async (route: Route) => {
    const url = new URL(route.request().url());
    const coordinateKey = coordinates(url);
    if (url.hostname === 'api.open-meteo.com' && url.pathname === '/v1/forecast') {
      requests.forecast.push(coordinateKey);
      beginRequest(route.request(), 'forecast', coordinateKey);
      const deferred = deferredForecasts.get(coordinateKey);
      if (deferred) {
        deferred.requested();
        await deferred.released;
        deferredForecasts.delete(coordinateKey);
      }
      await waitForResponseDelay();
      if (await applyFailure(route, 'forecast', coordinateKey)) return;
      if (harness.failCoordinates.has(coordinateKey)) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        return;
      }
      const override = harness.hourlyByCoordinates.get(coordinateKey)?.forecast
        ?? harness.defaultHourly?.forecast;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: override ? { hourly: override } : forecastFixture(harness, coordinateKey),
      });
      return;
    }
    if (url.hostname === 'air-quality-api.open-meteo.com' && url.pathname === '/v1/air-quality') {
      requests.airQuality.push(coordinateKey);
      beginRequest(route.request(), 'airQuality', coordinateKey);
      await waitForResponseDelay();
      if (await applyFailure(route, 'airQuality', coordinateKey)) return;
      if (harness.failCoordinates.has(coordinateKey) || harness.failAirQualityCoordinates.has(coordinateKey)) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        return;
      }
      const override = harness.hourlyByCoordinates.get(coordinateKey)?.airQuality
        ?? harness.defaultHourly?.airQuality;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: override ? { hourly: override } : airQualityFixture(harness, coordinateKey),
      });
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
  options: {
    fetchedAt: number;
    expiresAt: number;
    partialMetrics?: boolean;
    includeAirQuality?: boolean;
    /** Seed only on the first navigation so reload tests can detect cache corruption or eviction. */
    seedOnce?: boolean;
  },
): Promise<void> {
  const value = {
    forecast: {
      hours: cachedHours(options.partialMetrics),
      timeZone: 'America/Los_Angeles',
      fetchedAt: options.fetchedAt,
    },
    expiresAt: options.expiresAt,
  };
  await page.addInitScript(({ key, serialized, seedOnce }) => {
    const marker = `soleil:e2e:seeded:${key}`;
    if (seedOnce && window.localStorage.getItem(marker) === '1') return;
    window.sessionStorage.setItem(key, serialized);
    if (seedOnce) window.localStorage.setItem(marker, '1');
  }, {
    key: cacheKey(coordinateKey, 'America/Los_Angeles', options.includeAirQuality !== false),
    serialized: JSON.stringify(value),
    seedOnce: options.seedOnce === true,
  });
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

export function expectWeatherRequestBudget(
  requests: WeatherRequestLog,
  expected: {
    forecast: number;
    airQuality: number;
    maxActive?: number;
    maxCoordinateJobs?: number;
  },
): void {
  if (requests.forecast.length !== expected.forecast) {
    throw new Error(
      `Expected ${expected.forecast} forecast requests, received ${requests.forecast.length}: ` +
      requests.forecast.join(', '),
    );
  }
  if (requests.airQuality.length !== expected.airQuality) {
    throw new Error(
      `Expected ${expected.airQuality} air-quality requests, received ${requests.airQuality.length}: ` +
      requests.airQuality.join(', '),
    );
  }
  if (expected.maxActive !== undefined && requests.maxActive > expected.maxActive) {
    throw new Error(
      `Expected at most ${expected.maxActive} concurrent requests, observed ${requests.maxActive}`,
    );
  }
  if (
    expected.maxCoordinateJobs !== undefined &&
    requests.maxActiveCoordinateJobs > expected.maxCoordinateJobs
  ) {
    throw new Error(
      `Expected at most ${expected.maxCoordinateJobs} concurrent coordinate jobs, observed ` +
      requests.maxActiveCoordinateJobs,
    );
  }
}
