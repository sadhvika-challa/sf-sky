import { describe, test, expect } from 'vitest';
import { fogDensity, getForecastAt, type HourlyForecast, type SpotForecast } from '../weather';

function makeHour(overrides: Partial<HourlyForecast> = {}): HourlyForecast {
  return {
    cloud: 30, cloudLow: 10, cloudMid: 40, cloudHigh: 30,
    visibilityKm: 16, humidity: 60, tempF: 58, precipProb: 0,
    pm25: 5, aqi: 20, windMph: 8, gustMph: 12, windDir: 270,
    ...overrides,
  };
}

describe('fogDensity', () => {
  test('classic Karl fog returns high density (>0.75)', () => {
    const fog = fogDensity(makeHour({ visibilityKm: 1, cloudLow: 95, humidity: 98 }));
    expect(fog).toBeGreaterThan(0.75);
  });

  test('clear south-side returns low density (<0.1)', () => {
    const fog = fogDensity(makeHour({ visibilityKm: 16, cloudLow: 5, humidity: 60 }));
    expect(fog).toBeLessThan(0.1);
  });

  test('returns value in 0-1 range', () => {
    const fog = fogDensity(makeHour());
    expect(fog).toBeGreaterThanOrEqual(0);
    expect(fog).toBeLessThanOrEqual(1);
  });

  test('handles NaN inputs gracefully', () => {
    const fog = fogDensity(makeHour({ visibilityKm: NaN, cloudLow: NaN, humidity: NaN }));
    expect(Number.isFinite(fog)).toBe(true);
  });

  test('moderate fog returns mid-range density', () => {
    const fog = fogDensity(makeHour({ visibilityKm: 5, cloudLow: 50, humidity: 85 }));
    expect(fog).toBeGreaterThan(0.2);
    expect(fog).toBeLessThan(0.7);
  });
});

describe('getForecastAt', () => {
  const forecast: SpotForecast = {
    hours: {
      '2026-06-02T18': makeHour({ tempF: 60 }),
      '2026-06-02T19': makeHour({ tempF: 58 }),
      '2026-06-02T20': makeHour({ tempF: 55 }),
    },
    fetchedAt: Date.now(),
  };

  test('returns exact hour match', () => {
    const when = new Date('2026-06-02T19:00:00');
    const result = getForecastAt(forecast, when);
    expect(result?.tempF).toBe(58);
  });

  test('returns closest hour when exact not found', () => {
    const when = new Date('2026-06-02T19:30:00');
    const result = getForecastAt(forecast, when);
    expect(result).not.toBeNull();
  });

  test('returns null for empty forecast', () => {
    const empty: SpotForecast = { hours: {}, fetchedAt: Date.now() };
    const result = getForecastAt(empty, new Date());
    expect(result).toBeNull();
  });
});
