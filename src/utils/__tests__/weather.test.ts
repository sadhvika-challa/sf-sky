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
