import { describe, expect, it } from 'vitest';
import {
  clampPercentage,
  getHourlyForecastCompleteness,
  type HourlyForecast,
} from '../weather';

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
});

describe('clampPercentage', () => {
  it('clamps labels to the valid percentage range', () => {
    expect(clampPercentage(-12)).toBe(0);
    expect(clampPercentage(42.6)).toBe(43);
    expect(clampPercentage(130)).toBe(100);
    expect(clampPercentage(NaN)).toBe(0);
  });
});
