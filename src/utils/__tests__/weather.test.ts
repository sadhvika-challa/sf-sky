import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampPercentage,
  getHourlyForecastCompleteness,
  fetchSpotForecast,
  mergeOpenMeteoResponses,
  isStructurallyValidSpotForecast,
  type HourlyForecast,
} from '../weather';

afterEach(() => vi.restoreAllMocks());

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
});
