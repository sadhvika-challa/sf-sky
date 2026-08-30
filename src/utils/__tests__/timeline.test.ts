import { describe, expect, it } from 'vitest';
import {
  SCORE_CARD_ORDER,
  canonicalKeysRepeatLocalHour,
  deriveSpotTimelineHourKeys,
  describeActiveForecastTrust,
  formatActiveTimelineLabel,
  formatCanonicalHourKey,
  formatCanonicalHourLabel,
  formatLegacyWallHour,
  hasExactTimelineHour,
  normalizeTimelineHourKey,
  nearestForecastAtCityInstant,
  parseCanonicalHourKey,
  resolveLegacyWallClockHour,
  viewModeForHourKey,
} from '../timeline';
import type { HourlyForecast, SpotForecast } from '../weather';

function forecastHour(tempF: number): HourlyForecast {
  return {
    cloud: 20, cloudLow: 10, cloudMid: 30, cloudHigh: 40, visibilityKm: 20,
    humidity: 50, tempF, precipProb: 0, pm25: 3, aqi: 12,
    windMph: 6, gustMph: 9, windDir: 180,
  };
}

describe('canonical timeline identity', () => {
  it('keeps the score cards in the fixed product order', () => {
    expect(SCORE_CARD_ORDER).toEqual(['now', 'sunrise', 'sunset', 'stargazing']);
  });

  it('formats and strictly parses a fixed-width UTC key', () => {
    const instant = new Date('2026-11-01T06:34:59.999Z');
    expect(formatCanonicalHourKey(instant)).toBe('2026-11-01T06:00:00Z');
    expect(parseCanonicalHourKey('2026-11-01T06:00:00Z')?.toISOString()).toBe('2026-11-01T06:00:00.000Z');
    expect(parseCanonicalHourKey('2026-11-01T01')).toBeNull();
    expect(parseCanonicalHourKey('2026-11-01T06:30:00Z')).toBeNull();
  });

  it('preserves the empty live sentinel and accepts only exact canonical hours', () => {
    const keys = ['2026-08-30T12:00:00Z', '2026-08-30T13:00:00Z'];
    expect(normalizeTimelineHourKey('', [])).toBe('');
    expect(hasExactTimelineHour(keys[0], keys)).toBe(true);
    expect(hasExactTimelineHour('2026-08-30T12', keys)).toBe(false);
    expect(normalizeTimelineHourKey('2026-08-30T14:00:00Z', keys)).toBe('');
  });

  it('derives the next 24 absolute hours without synthesizing a spring-gap slot', () => {
    const now = new Date('2026-03-08T07:30:00Z');
    const keys = [
      '2026-03-08T07:00:00Z', // 1 AM CST
      '2026-03-08T08:00:00Z', // 3 AM CDT
      '2026-03-08T09:00:00Z',
    ];
    expect(deriveSpotTimelineHourKeys(keys, now)).toEqual(keys.slice(1));
    expect(keys.map((key) => formatLegacyWallHour(parseCanonicalHourKey(key)!, 'America/Chicago')))
      .toEqual(['2026-03-08T01', '2026-03-08T03', '2026-03-08T04']);
  });

  it.each([
    ['America/Chicago', '2026-11-01T06:00:00Z', '2026-11-01T07:00:00Z', 'CDT', 'CST'],
    ['America/Los_Angeles', '2026-11-01T08:00:00Z', '2026-11-01T09:00:00Z', 'PDT', 'PST'],
  ])('keeps both repeated %s hours distinct and labels their zones', (zone, first, second, firstAbbr, secondAbbr) => {
    const keys = [first, second];
    expect(formatLegacyWallHour(parseCanonicalHourKey(first)!, zone)).toBe('2026-11-01T01');
    expect(formatLegacyWallHour(parseCanonicalHourKey(second)!, zone)).toBe('2026-11-01T01');
    expect(canonicalKeysRepeatLocalHour(first, keys, zone)).toBe(true);
    expect(formatCanonicalHourLabel(first, zone, { includeZone: true })).toContain(firstAbbr);
    expect(formatCanonicalHourLabel(second, zone, { includeZone: true })).toContain(secondAbbr);
    expect(resolveLegacyWallClockHour('2026-11-01T01', keys, zone)).toBe(first);
  });

  it.each([
    ['America/Chicago', '2026-03-08T02', ['2026-03-08T07:00:00Z', '2026-03-08T08:00:00Z']],
    ['America/Los_Angeles', '2026-03-08T02', ['2026-03-08T09:00:00Z', '2026-03-08T10:00:00Z']],
  ] as const)('rejects a skipped legacy hour in %s', (zone, legacy, keys) => {
    expect(resolveLegacyWallClockHour(legacy, keys, zone)).toBeNull();
  });

  it('resolves a normal legacy wall time when exactly one instant matches', () => {
    expect(resolveLegacyWallClockHour(
      '2026-08-30T20',
      ['2026-08-31T00:00:00Z', '2026-08-31T01:00:00Z', '2026-08-31T02:00:00Z'],
      'America/Chicago',
    )).toBe('2026-08-31T01:00:00Z');
  });

  it('looks up the same event instant regardless of city or device zone', () => {
    const instant = new Date('2026-08-31T01:00:00Z');
    const selected = forecastHour(96);
    const source: SpotForecast = {
      hours: { '2026-08-31T01:00:00Z': selected },
      timeZone: 'America/Chicago',
      fetchedAt: instant.getTime(),
    };
    expect(nearestForecastAtCityInstant(source, instant)).toBe(selected);
    expect(viewModeForHourKey('2026-06-21T10:00:00Z', 'America/Chicago', 41.9, -87.65, instant)).toBe('sunrise');
  });

  it('formats Search labels in the city calendar', () => {
    const now = new Date('2026-08-30T16:00:00Z');
    expect(formatActiveTimelineLabel('', 'now', 'America/Chicago', now)).toBe('Right now');
    expect(formatActiveTimelineLabel('2026-08-31T01:00:00Z', 'sunset', 'America/Chicago', now))
      .toBe('Sunset · Today at 8:00 PM');
  });

  it('describes active Search trust without overstating fallback estimates', () => {
    expect(describeActiveForecastTrust([true, true])).toBe('Forecast-backed scores');
    expect(describeActiveForecastTrust([true, false])).toBe('Mix of forecast-backed scores and curated estimates');
    expect(describeActiveForecastTrust([false, false])).toBe('Curated estimates');
  });
});
