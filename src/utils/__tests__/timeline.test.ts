import { describe, expect, it } from 'vitest';
import {
  SCORE_CARD_ORDER,
  deriveSpotTimelineHourKeys,
  formatActiveTimelineLabel,
  formatHourKeyInTimeZone,
  hasExactTimelineHour,
  normalizeTimelineHourKey,
  nearestForecastAtCityInstant,
  parseHourKeyInTimeZone,
  viewModeForHourKey,
} from '../timeline';
import type { HourlyForecast, SpotForecast } from '../weather';

function forecastHour(tempF: number): HourlyForecast {
  return {
    cloud: 20,
    cloudLow: 10,
    cloudMid: 30,
    cloudHigh: 40,
    visibilityKm: 20,
    humidity: 50,
    tempF,
    precipProb: 0,
    pm25: 3,
    aqi: 12,
    windMph: 6,
    gustMph: 9,
    windDir: 180,
  };
}

describe('timeline helpers', () => {
  it('keeps the score cards in the fixed product order', () => {
    expect(SCORE_CARD_ORDER).toEqual(['now', 'sunrise', 'sunset', 'stargazing']);
  });

  it('preserves Return to Now even without forecast hours', () => {
    expect(normalizeTimelineHourKey('', [])).toBe('');
    expect(normalizeTimelineHourKey('2026-08-30T12', [])).toBe('');
  });

  it('accepts only an exact forecast hour', () => {
    const keys = ['2026-08-30T12', '2026-08-30T13'];
    expect(hasExactTimelineHour('2026-08-30T12', keys)).toBe(true);
    expect(hasExactTimelineHour('2026-08-30T14', keys)).toBe(false);
    expect(normalizeTimelineHourKey('2026-08-30T14', keys)).toBe('');
  });

  it('derives the next 24 exact spot hours after the city-local current hour', () => {
    const now = new Date('2026-08-30T00:30:00.000Z');
    const keys = ['2026-08-29T16', '2026-08-29T17', '2026-08-29T18'];
    expect(deriveSpotTimelineHourKeys(keys, now, 'America/Los_Angeles')).toEqual([
      '2026-08-29T18',
    ]);
  });

  it('parses the same wall-clock hour as different instants across time zones', () => {
    const chicago = parseHourKeyInTimeZone('2026-08-30T20', 'America/Chicago');
    const losAngeles = parseHourKeyInTimeZone('2026-08-30T20', 'America/Los_Angeles');
    expect(chicago?.toISOString()).toBe('2026-08-31T01:00:00.000Z');
    expect(losAngeles?.toISOString()).toBe('2026-08-31T03:00:00.000Z');
    expect(formatHourKeyInTimeZone(chicago!, 'America/Chicago')).toBe('2026-08-30T20');
  });

  it('classifies a Chicago wall-clock hour in Chicago rather than the device zone', () => {
    expect(viewModeForHourKey(
      '2026-06-21T05',
      'America/Chicago',
      41.9,
      -87.65,
      new Date('2026-06-21T12:00:00.000Z'),
    )).toBe('sunrise');
  });

  it('rejects a nonexistent daylight-saving hour', () => {
    expect(parseHourKeyInTimeZone('2026-03-08T02', 'America/Chicago')).toBeNull();
  });

  it('resolves an Austin event hour by Austin keys on a Los Angeles device', () => {
    const eventInstant = new Date('2026-08-31T01:00:00.000Z');
    expect(formatHourKeyInTimeZone(eventInstant, 'America/Los_Angeles')).toBe('2026-08-30T18');
    expect(formatHourKeyInTimeZone(eventInstant, 'America/Chicago')).toBe('2026-08-30T20');
    const austinHour = forecastHour(96);
    const losAngelesHour = forecastHour(62);
    const forecast: SpotForecast = {
      hours: {
        '2026-08-30T18': losAngelesHour,
        '2026-08-30T20': austinHour,
      },
      fetchedAt: eventInstant.getTime(),
    };

    expect(
      nearestForecastAtCityInstant(forecast, eventInstant, 'America/Chicago'),
    ).toBe(austinHour);
  });

  it('derives an honest active Search label in the city time zone', () => {
    const now = new Date('2026-08-30T16:00:00.000Z');
    expect(formatActiveTimelineLabel('', 'now', 'America/Chicago', now)).toBe('Right now');
    expect(
      formatActiveTimelineLabel('2026-08-30T20', 'sunset', 'America/Chicago', now),
    ).toBe('Sunset · Today at 8:00 PM');
  });
});
