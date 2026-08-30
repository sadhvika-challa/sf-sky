import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampPercentage,
  getHourlyForecastCompleteness,
  fetchSpotForecast,
  mergeOpenMeteoResponses,
  isStructurallyValidSpotForecast,
  WeatherRequestError,
  weatherRefreshExplanation,
  type HourlyForecast,
} from '../weather';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function hour(overrides: Partial<HourlyForecast> = {}): HourlyForecast {
  return {
    cloud: 25,
    cloudLow: 10,
    cloudMid: 45,
    cloudHigh: 35,
    visibilityKm: 18,
    humidity: 55,
    tempF: 62,
    precipProb: 5,
    pm25: 4,
    aqi: NaN,
    windMph: 7,
    gustMph: NaN,
    windDir: NaN,
    ...overrides,
  };
}

function weatherResponse(epoch: number, tempF = 62): object {
  return {
    hourly: {
      time: [epoch],
      cloud_cover: [25], cloud_cover_low: [10], cloud_cover_mid: [45],
      cloud_cover_high: [35], visibility: [18_000], relative_humidity_2m: [55],
      temperature_2m: [tempF], precipitation_probability: [5],
      wind_speed_10m: [7], wind_gusts_10m: [10], wind_direction_10m: [270],
    },
  };
}

function airQualityResponse(epoch: number, pm25 = 4): object {
  return { hourly: { time: [epoch], pm2_5: [pm25], us_aqi: [18] } };
}

describe('getHourlyForecastCompleteness', () => {
  it('does not require AQI, gust, or direction fields that do not affect scoring', () => {
    expect(getHourlyForecastCompleteness(hour({ aqi: NaN, gustMph: NaN, windDir: NaN }), 'now')).toMatchObject({
      completeness: 'complete',
      percent: 100,
    });
  });

  it('marks an air-quality endpoint gap partial where PM2.5 affects scoring', () => {
    const missingAirQuality = hour({ pm25: NaN });
    expect(getHourlyForecastCompleteness(missingAirQuality, 'now').completeness).toBe('partial');
    expect(getHourlyForecastCompleteness(missingAirQuality, 'sunrise').completeness).toBe('partial');
    expect(getHourlyForecastCompleteness(missingAirQuality, 'sunset').completeness).toBe('partial');
    expect(getHourlyForecastCompleteness(missingAirQuality, 'stargazing').completeness).toBe('complete');
  });

  it('uses mode-specific required weather fields', () => {
    const missingWind = hour({ windMph: NaN });
    expect(getHourlyForecastCompleteness(missingWind, 'now').completeness).toBe('partial');
    expect(getHourlyForecastCompleteness(missingWind, 'sunset').completeness).toBe('complete');
  });

  it('distinguishes partial, missing, and absent hourly data', () => {
    expect(getHourlyForecastCompleteness(hour({ cloudLow: NaN }), 'sunrise').completeness)
      .toBe('partial');
    const malformed = hour({ cloud: NaN, humidity: NaN });
    expect(getHourlyForecastCompleteness(malformed, 'stargazing').completeness).toBe('missing');
    expect(getHourlyForecastCompleteness(null, 'now').completeness).toBe('missing');
  });

  it.each([
    ['cloud', -1],
    ['cloudLow', 101],
    ['visibilityKm', -0.1],
    ['tempF', 151],
    ['tempF', -151],
    ['precipProb', 101],
    ['pm25', -0.1],
    ['windMph', -1],
  ] as const)('marks out-of-domain Now field %s=%s partial', (field, value) => {
    expect(getHourlyForecastCompleteness(hour({ [field]: value }), 'now').completeness)
      .toBe('partial');
  });

  it.each([
    ['cloud', 101],
    ['cloudLow', -1],
    ['cloudMid', 101],
    ['cloudHigh', -1],
    ['visibilityKm', -1],
    ['humidity', 101],
    ['pm25', -1],
  ] as const)('marks out-of-domain sunset field %s=%s partial', (field, value) => {
    expect(getHourlyForecastCompleteness(hour({ [field]: value }), 'sunset').completeness)
      .toBe('partial');
  });

  it('marks an hour missing when every required field is outside its domain', () => {
    const invalid = hour({
      cloud: 101,
      cloudLow: -1,
      visibilityKm: -1,
      tempF: 151,
      precipProb: -1,
      pm25: -1,
      windMph: -1,
    });
    expect(getHourlyForecastCompleteness(invalid, 'now')).toMatchObject({
      completeness: 'missing',
      availableFields: 0,
      percent: 0,
    });
  });
});

describe('clampPercentage', () => {
  it('clamps labels to the valid percentage range', () => {
    expect(clampPercentage(-12)).toBe(0);
    expect(clampPercentage(42.6)).toBe(43);
    expect(clampPercentage(130)).toBe(100);
    expect(clampPercentage(NaN)).toBe(0);
  });
});

describe('Unix-time forecast ingestion', () => {
  it('rejects legacy or malformed cached forecast shapes', () => {
    expect(isStructurallyValidSpotForecast({
      hours: { '2026-11-01T01': hour() },
      timeZone: 'America/Chicago',
      fetchedAt: 1234,
    })).toBe(false);
    expect(isStructurallyValidSpotForecast({
      hours: { '2026-11-01T06:00:00Z': hour() },
      fetchedAt: 1234,
    })).toBe(false);
    expect(isStructurallyValidSpotForecast({
      hours: { '2026-11-01T06:00:00Z': hour() },
      timeZone: 'America/Chicago',
      fetchedAt: 1234,
    })).toBe(true);
  });

  it('preserves both repeated local hours and merges AQ by absolute instant', () => {
    const first = Date.parse('2026-11-01T06:00:00Z') / 1000;
    const second = Date.parse('2026-11-01T07:00:00Z') / 1000;
    const weather = {
      hourly: {
        time: [first, second],
        cloud_cover: [11, 22], cloud_cover_low: [1, 2], cloud_cover_mid: [3, 4],
        cloud_cover_high: [5, 6], visibility: [10_000, 20_000],
        relative_humidity_2m: [60, 70], temperature_2m: [51, 52],
        precipitation_probability: [7, 8], wind_speed_10m: [9, 10],
        wind_gusts_10m: [11, 12], wind_direction_10m: [180, 190],
      },
    };
    const air = { hourly: { time: [second, first], pm2_5: [72, 61], us_aqi: [172, 161] } };
    const result = mergeOpenMeteoResponses(weather, air, 'America/Chicago', 1234);

    expect(Object.keys(result.hours)).toEqual(['2026-11-01T06:00:00Z', '2026-11-01T07:00:00Z']);
    expect(result.hours['2026-11-01T06:00:00Z']).toMatchObject({ cloud: 11, pm25: 61, aqi: 161 });
    expect(result.hours['2026-11-01T07:00:00Z']).toMatchObject({ cloud: 22, pm25: 72, aqi: 172 });
    expect(result).toMatchObject({ timeZone: 'America/Chicago', fetchedAt: 1234 });
  });

  it('rejects malformed and duplicate source epochs without overwriting an hour', () => {
    const valid = Date.parse('2026-11-01T06:00:00Z') / 1000;
    const next = valid + 3_600;
    const result = mergeOpenMeteoResponses({
      hourly: {
        time: [valid, valid, next, next + 1, 1.5, NaN],
        cloud_cover: [10, 99, 20, 30, 40, 50],
      },
    }, {
      hourly: {
        time: [next, next, valid + 1],
        pm2_5: [4, 99, 8],
        us_aqi: [18, 199, 28],
      },
    }, 'America/Chicago', 1234);

    expect(result.hours['2026-11-01T06:00:00Z']).toBeUndefined();
    expect(result.hours['2026-11-01T07:00:00Z']).toMatchObject({ cloud: 20 });
    expect(result.hours['2026-11-01T07:00:00Z'].pm25).toBeNaN();
    expect(Object.keys(result.hours)).toEqual(['2026-11-01T07:00:00Z']);
  });

  it('sends Unix-time requests with the configured zone and isolates inflight identity by zone', async () => {
    const epoch = Date.parse('2026-08-31T01:00:00Z') / 1000;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const isAir = url.hostname.startsWith('air-quality');
      return new Response(JSON.stringify({
        hourly: isAir
          ? { time: [epoch], pm2_5: [4], us_aqi: [18] }
          : { time: [epoch], cloud_cover: [20] },
      }), { status: 200 });
    });

    await Promise.all([
      fetchSpotForecast(30.3, -97.78, 'America/Chicago'),
      fetchSpotForecast(30.3, -97.78, 'America/Los_Angeles'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.every((url) => url.searchParams.get('timeformat') === 'unixtime')).toBe(true);
    expect(urls.filter((url) => url.searchParams.get('timezone') === 'America/Chicago')).toHaveLength(2);
    expect(urls.filter((url) => url.searchParams.get('timezone') === 'America/Los_Angeles')).toHaveLength(2);
  });

  it('uses one weather request and no AQ request for a regional overlay anchor', async () => {
    const epoch = Date.parse('2026-08-31T01:00:00Z') / 1000;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      hourly: { time: [epoch], cloud_cover: [20] },
    }), { status: 200 }));

    await fetchSpotForecast(37.7935, -122.4622, 'America/Los_Angeles', {
      includeAirQuality: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.open-meteo.com/v1/forecast');
  });

  it('shares the Twin Peaks weather endpoint across overlay and selected consumers', async () => {
    const epoch = Date.parse('2026-08-31T01:00:00Z') / 1000;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      await gate;
      const isAir = new URL(String(input)).hostname.startsWith('air-quality');
      return new Response(JSON.stringify({ hourly: isAir
        ? { time: [epoch], pm2_5: [4], us_aqi: [18] }
        : { time: [epoch], cloud_cover: [20] } }), { status: 200 });
    });
    const overlayController = new AbortController();
    const overlay = fetchSpotForecast(37.7544, -122.4477, 'America/Los_Angeles', {
      includeAirQuality: false,
      signal: overlayController.signal,
    });
    const selected = fetchSpotForecast(37.7544, -122.4477, 'America/Los_Angeles');
    overlayController.abort();
    release();

    await expect(overlay).rejects.toMatchObject({ kind: 'aborted' });
    await expect(selected).resolves.toMatchObject({ timeZone: 'America/Los_Angeles' });
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.filter((url) => url.includes('/v1/forecast'))).toHaveLength(1);
    expect(urls.filter((url) => url.includes('/v1/air-quality'))).toHaveLength(1);
  });

  it('bounds the endpoint capability cache when no tighter max age is supplied', async () => {
    let now = Date.parse('2026-08-31T01:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const epoch = now / 1000;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      hourly: { time: [epoch], cloud_cover: [20] },
    }), { status: 200 }));

    await fetchSpotForecast(37.7555, -122.4555, 'America/Los_Angeles', {
      includeAirQuality: false,
    });
    now += 4 * 60 * 60 * 1000;
    await fetchSpotForecast(37.7555, -122.4555, 'America/Los_Angeles', {
      includeAirQuality: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts an orphaned shared capability and starts a fresh later request', async () => {
    const epoch = Date.parse('2026-08-31T01:00:00Z') / 1000;
    let abortedForecasts = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (fetchMock.mock.calls.length <= 2) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            if (url.pathname.includes('/forecast')) abortedForecasts += 1;
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        });
      }
      const isAir = url.hostname.startsWith('air-quality');
      return new Response(JSON.stringify({ hourly: isAir
        ? { time: [epoch], pm2_5: [4], us_aqi: [18] }
        : { time: [epoch], cloud_cover: [20] } }), { status: 200 });
    });
    const overlayController = new AbortController();
    const selectedController = new AbortController();
    const overlay = fetchSpotForecast(37.7566, -122.4566, 'America/Los_Angeles', {
      includeAirQuality: false,
      signal: overlayController.signal,
    });
    const selected = fetchSpotForecast(37.7566, -122.4566, 'America/Los_Angeles', {
      signal: selectedController.signal,
    });
    overlayController.abort();
    selectedController.abort();

    await expect(overlay).rejects.toMatchObject({ kind: 'aborted' });
    await expect(selected).rejects.toMatchObject({ kind: 'aborted' });
    await vi.waitFor(() => expect(abortedForecasts).toBe(1));

    await expect(fetchSpotForecast(37.7566, -122.4566, 'America/Los_Angeles'))
      .resolves.toMatchObject({ timeZone: 'America/Los_Angeles' });
    const forecastCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/v1/forecast'));
    expect(forecastCalls).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('keeps inflight dedupe alive when only one subscriber cancels', async () => {
    const epoch = Date.parse('2026-08-31T01:00:00Z') / 1000;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      await gate;
      const isAir = new URL(String(input)).hostname.startsWith('air-quality');
      return new Response(JSON.stringify({ hourly: isAir
        ? { time: [epoch], pm2_5: [4], us_aqi: [18] }
        : { time: [epoch], cloud_cover: [20] } }), { status: 200 });
    });
    const firstController = new AbortController();
    const first = fetchSpotForecast(37.7001, -122.4001, 'America/Los_Angeles', {
      signal: firstController.signal,
    });
    const second = fetchSpotForecast(37.7001, -122.4001, 'America/Los_Angeles');
    firstController.abort();
    release();

    await expect(first).rejects.toMatchObject({ kind: 'aborted' });
    await expect(second).resolves.toMatchObject({ timeZone: 'America/Los_Angeles' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lets an immediate remount reuse the orphaned physical generation', async () => {
    const epoch = Date.parse('2026-08-31T01:00:00Z') / 1000;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      await Promise.race([
        gate,
        new Promise<void>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
      ]);
      const isAir = new URL(String(input)).hostname.startsWith('air-quality');
      return new Response(JSON.stringify({ hourly: isAir
        ? { time: [epoch], pm2_5: [4], us_aqi: [18] }
        : { time: [epoch], cloud_cover: [20] } }), { status: 200 });
    });
    const controller = new AbortController();
    const aborted = fetchSpotForecast(37.7011, -122.4011, 'America/Los_Angeles', {
      signal: controller.signal,
    });
    controller.abort();
    const remounted = fetchSpotForecast(37.7011, -122.4011, 'America/Los_Angeles');
    release();

    await expect(aborted).rejects.toMatchObject({ kind: 'aborted' });
    await expect(remounted).resolves.toMatchObject({ timeZone: 'America/Los_Angeles' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('classifies rate limits and isolates request identity at four decimal coordinates', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 429 }),
    );
    const first = fetchSpotForecast(37.12341, -122.4, 'America/Los_Angeles', { includeAirQuality: false });
    const second = fetchSpotForecast(37.12349, -122.4, 'America/Los_Angeles', { includeAirQuality: false });

    const results = await Promise.allSettled([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(WeatherRequestError);
        expect(result.reason).toMatchObject({ kind: 'rate-limit', status: 429 });
      }
    }
  });

  it('classifies a request deadline as a timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));

    await expect(fetchSpotForecast(37.6001, -122.3001, 'America/Los_Angeles', {
      includeAirQuality: false,
      timeoutMs: 5,
    })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('keeps a stale cached forecast attached when revalidation fails', async () => {
    vi.stubGlobal('sessionStorage', memoryStorage());
    const epoch = Date.parse('2026-08-31T01:00:00Z') / 1000;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      hourly: { time: [epoch], cloud_cover: [20] },
    }), { status: 200 }));
    const saved = await fetchSpotForecast(37.6101, -122.3101, 'America/Los_Angeles', {
      includeAirQuality: false,
    });
    fetchMock.mockResolvedValue(new Response('{}', { status: 429 }));

    await expect(fetchSpotForecast(37.6101, -122.3101, 'America/Los_Angeles', {
      includeAirQuality: false,
      maxAgeMs: -1,
    })).rejects.toMatchObject({ kind: 'rate-limit', savedForecast: saved });

    // A normal cache consumer can still recover the same evidence because a
    // failed refresh did not evict it from session storage.
    await expect(fetchSpotForecast(37.6101, -122.3101, 'America/Los_Angeles', {
      includeAirQuality: false,
    })).resolves.toEqual(saved);
  });

  it.each([
    ['empty hours', { hourly: { time: [] } }],
    ['NaN active metric', weatherResponse(Date.parse('2026-08-31T01:00:00Z') / 1000, NaN)],
  ])('does not overwrite durable usable evidence with HTTP 200 %s', async (_label, malformed) => {
    const storage = memoryStorage();
    vi.stubGlobal('sessionStorage', storage);
    const hourKey = '2026-08-31T01:00:00Z';
    const epoch = Date.parse(hourKey) / 1000;
    let response: object = weatherResponse(epoch);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify(response), { status: 200 }));
    const lat = _label === 'empty hours' ? 37.6201 : 37.6202;

    const saved = await fetchSpotForecast(lat, -122.3201, 'America/Los_Angeles', {
      includeAirQuality: false,
      requiredMetric: 'temp',
      requiredHourKey: hourKey,
    });
    const storageKey = storage.key(0)!;
    const durableBefore = storage.getItem(storageKey);
    response = malformed;

    await expect(fetchSpotForecast(lat, -122.3201, 'America/Los_Angeles', {
      includeAirQuality: false,
      maxAgeMs: -1,
      requiredMetric: 'temp',
      requiredHourKey: hourKey,
    })).rejects.toMatchObject({
      kind: 'invalid-data',
      savedForecast: saved,
    });
    expect(storage.getItem(storageKey)).toBe(durableBefore);
    await expect(fetchSpotForecast(lat, -122.3201, 'America/Los_Angeles', {
      includeAirQuality: false,
      requiredMetric: 'temp',
      requiredHourKey: hourKey,
    })).resolves.toEqual(saved);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retains one complete selected snapshot when only AQ refresh fails, then recovers', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('sessionStorage', storage);
    const hourKey = '2026-08-31T01:00:00Z';
    const epoch = Date.parse(hourKey) / 1000;
    let phase: 'initial' | 'aq-failure' | 'recovered' = 'initial';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const isAir = new URL(String(input)).hostname.startsWith('air-quality');
      if (phase === 'aq-failure' && isAir) return new Response('{}', { status: 429 });
      const payload = isAir
        ? airQualityResponse(epoch, phase === 'recovered' ? 7 : 4)
        : weatherResponse(epoch, phase === 'recovered' ? 65 : 62);
      return new Response(JSON.stringify(payload), { status: 200 });
    });

    const saved = await fetchSpotForecast(37.6301, -122.3301, 'America/Los_Angeles', {
      requiredHourKey: hourKey,
    });
    expect(saved.hours[hourKey].pm25).toBe(4);
    const storageKey = storage.key(0)!;
    const durableBefore = storage.getItem(storageKey);
    phase = 'aq-failure';

    await expect(fetchSpotForecast(37.6301, -122.3301, 'America/Los_Angeles', {
      maxAgeMs: -1,
      requiredHourKey: hourKey,
    })).rejects.toMatchObject({
      kind: 'rate-limit',
      evidenceGap: 'air-quality',
      savedForecast: saved,
      message: 'Forecast refresh was incomplete because air-quality evidence was unavailable',
    });
    expect(storage.getItem(storageKey)).toBe(durableBefore);

    let refreshError: Error | null = null;
    try {
      await fetchSpotForecast(37.6301, -122.3301, 'America/Los_Angeles', {
        maxAgeMs: -1,
        requiredHourKey: hourKey,
      });
    } catch (reason) {
      refreshError = reason instanceof Error ? reason : new Error(String(reason));
    }
    expect(weatherRefreshExplanation(refreshError)).toBe(
      'Air-quality evidence was unavailable during refresh. Showing the saved forecast.',
    );

    phase = 'recovered';
    const recovered = await fetchSpotForecast(37.6301, -122.3301, 'America/Los_Angeles', {
      maxAgeMs: 0,
      requiredHourKey: hourKey,
    });
    expect(recovered.hours[hourKey]).toMatchObject({ tempF: 65, pm25: 7 });
    expect(storage.getItem(storageKey)).not.toBe(durableBefore);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
});
