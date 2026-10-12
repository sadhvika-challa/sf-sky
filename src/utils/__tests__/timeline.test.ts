import { describe, expect, it } from 'vitest';
import {
  SCORE_CARD_ORDER,
  timelineScoreLabel,
  buildForecastRangeHourKeys,
  forecastRangeWindow,
  parseForecastRange,
  rangeStartHourKey,
  buildTimelineStops,
  timelinePositionPct,
  nearestTimelineStopIndex,
  addCityCalendarDays,
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
  isRepeatedLocalHourKey,
  viewModeForHourKey,
} from '../timeline';
import type { HourlyForecast, SpotForecast } from '../weather';
import { getEventsForDate, getTimelineEventDays } from '../events';
import { formatCityCalendarDate } from '../timeline';

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

  it('names the actual hourly score while keeping explicit sky events distinct', () => {
    expect(timelineScoreLabel('now', 'now')).toBe('Daytime');
    expect(timelineScoreLabel('stargazing', 'now')).toBe('Nighttime');
    expect(timelineScoreLabel('sunrise', 'now')).toBe('Sunrise');
    expect(timelineScoreLabel('sunset', 'now')).toBe('Sunset');
    expect(timelineScoreLabel('stargazing', 'stargazing')).toBe('Stargazing');
    expect(timelineScoreLabel('now', 'sunset')).toBe('Sunset');
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
    ['Chicago and Austin', 'America/Chicago', '2026-11-01T06:00:00Z', '2026-11-01T07:00:00Z', 'CDT', 'CST'],
    ['San Francisco and Santa Cruz', 'America/Los_Angeles', '2026-11-01T08:00:00Z', '2026-11-01T09:00:00Z', 'PDT', 'PST'],
  ])('keeps both repeated hours distinct for %s', (_cities, zone, first, second, firstAbbr, secondAbbr) => {
    const keys = [first, second];
    expect(formatLegacyWallHour(parseCanonicalHourKey(first)!, zone)).toBe('2026-11-01T01');
    expect(formatLegacyWallHour(parseCanonicalHourKey(second)!, zone)).toBe('2026-11-01T01');
    expect(isRepeatedLocalHourKey(first, zone)).toBe(true);
    expect(formatCanonicalHourLabel(first, zone, { includeZone: true })).toContain(firstAbbr);
    expect(formatCanonicalHourLabel(second, zone, { includeZone: true })).toContain(secondAbbr);
    expect(resolveLegacyWallClockHour('2026-11-01T01', keys, zone)).toBeNull();
  });

  it.each([
    ['Chicago and Austin spring', 'America/Chicago', '2026-03-08T06:00:00Z', '2026-03-08T00', '2026-03-09T00'],
    ['Chicago and Austin fall', 'America/Chicago', '2026-11-01T05:00:00Z', '2026-11-01T00', '2026-11-01T22'],
    ['San Francisco and Santa Cruz spring', 'America/Los_Angeles', '2026-03-08T08:00:00Z', '2026-03-08T00', '2026-03-09T00'],
    ['San Francisco and Santa Cruz fall', 'America/Los_Angeles', '2026-11-01T07:00:00Z', '2026-11-01T00', '2026-11-01T22'],
  ])('returns 24 consecutive real instants across %s', (_name, zone, start, firstWall, lastWall) => {
    const startMs = Date.parse(start);
    const keys = Array.from({ length: 25 }, (_, index) => formatCanonicalHourKey(new Date(startMs + index * 3_600_000)));
    const selected = deriveSpotTimelineHourKeys(keys, new Date(startMs - 1));
    expect(selected).toHaveLength(24);
    expect(selected.every((key, index) => index === 0 || Date.parse(key) - Date.parse(selected[index - 1]) === 3_600_000)).toBe(true);
    expect(formatLegacyWallHour(parseCanonicalHourKey(selected[0])!, zone)).toBe(firstWall);
    expect(formatLegacyWallHour(parseCanonicalHourKey(selected[23])!, zone)).toBe(lastWall);
  });

  it('adds Tomorrow by city calendar across the spring transition eve', () => {
    expect(addCityCalendarDays(new Date('2026-03-08T07:30:00Z'), 'America/Los_Angeles', 1)).toBe('2026-03-08');
    expect(addCityCalendarDays(new Date('2026-03-08T07:30:00Z'), 'America/Chicago', 1)).toBe('2026-03-09');
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

  it('includes the zone in live and selected Search labels during a repeated hour', () => {
    expect(formatActiveTimelineLabel('', 'now', 'America/Chicago', new Date('2026-11-01T06:15:00Z')))
      .toBe('Right now · 1:15 AM CDT');
    expect(formatActiveTimelineLabel('2026-11-01T07:00:00Z', 'now', 'America/Chicago', new Date('2026-11-01T06:15:00Z')))
      .toContain('1:00 AM CST');
  });

  it('describes active Search trust without overstating fallback estimates', () => {
    expect(describeActiveForecastTrust([true, true])).toBe('Forecast-backed scores');
    expect(describeActiveForecastTrust([true, false])).toBe('Mix of forecast-backed scores and curated estimates');
    expect(describeActiveForecastTrust([false, false])).toBe('Curated estimates');
  });
});


describe('event snapping on the absolute-time rail', () => {
  const now = new Date('2026-08-30T01:15:00Z');
  const events = {
    sunset: new Date('2026-08-30T02:44:00Z'),
    stargazing: new Date('2026-08-30T03:40:00Z'),
    sunrise: new Date('2026-08-30T13:37:00Z'),
  };
  const keys = Array.from({ length: 24 }, (_, i) => formatCanonicalHourKey(new Date(now.getTime() + (i + 1) * 3_600_000)));

  it('snaps precisely to sunset between forecast hours, with a short first interval', () => {
    const stops = buildTimelineStops(keys, now, events);
    const percent = timelinePositionPct(events.sunset.getTime(), stops);
    expect(stops[nearestTimelineStopIndex(percent, stops)].view).toBe('sunset');
    expect(stops[nearestTimelineStopIndex(percent + 0.1, stops)].instantMs).toBe(events.sunset.getTime());
    expect(timelinePositionPct(new Date(keys[0]).getTime(), stops)).toBeCloseTo(45 / (23 * 60 + 45) * 100);
  });

  it('keeps tonight’s stargazing time on the rail after dusk', () => {
    const afterDusk = new Date('2026-08-30T04:30:00Z');
    const stops = buildTimelineStops(keys, afterDusk, events);
    expect(stops.find((stop) => stop.view === 'stargazing')?.instantMs).toBe(events.stargazing.getTime());
    expect(timelinePositionPct(afterDusk.getTime(), stops)).toBeGreaterThan(0);
    const percent = timelinePositionPct(events.stargazing.getTime(), stops);
    expect(stops[nearestTimelineStopIndex(percent, stops)].view).toBe('stargazing');
  });

  it('uses an exact event instead of a duplicate hourly stop', () => {
    const stops = buildTimelineStops(keys, now, { ...events, sunset: new Date(keys[0]) });
    expect(stops.filter((stop) => stop.instantMs === new Date(keys[0]).getTime())).toHaveLength(1);
    expect(stops[1].view).toBe('sunset');
  });

  it('keeps repeated DST hours at different rail positions', () => {
    const keys = ['2026-11-01T08:00:00Z', '2026-11-01T09:00:00Z'];
    const stops = buildTimelineStops(keys, new Date('2026-11-01T07:45:00Z'), {
      sunrise: new Date('2026-11-01T14:37:00Z'), sunset: new Date('2026-11-02T01:15:00Z'), stargazing: new Date('2026-11-02T02:20:00Z'),
    });
    expect(timelinePositionPct(new Date(keys[1]).getTime(), stops)).toBeGreaterThan(timelinePositionPct(new Date(keys[0]).getTime(), stops));
  });
});


describe('weekly forecast selection', () => {
  const now = new Date('2026-10-12T19:15:00Z');
  const place = { lat: 37.7594, lng: -122.5107 };
  const zone = 'America/Los_Angeles';
  const keys = Array.from({ length: 192 }, (_, index) => formatCanonicalHourKey(new Date(now.getTime() + (index + 1) * 3_600_000)));

  it('shows Tuesday through next Monday while keeping the next 24 hours separate', () => {
    const week = deriveSpotTimelineHourKeys(keys, now, '7d', zone);
    expect(week).toHaveLength(168);
    expect(week[0]).toBe('2026-10-13T07:00:00Z');
    expect(week.at(-1)).toBe('2026-10-20T06:00:00Z');
    expect([...new Set(week.map((key) => formatCityCalendarDate(new Date(key), zone)))]).toEqual([
      '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19',
    ]);
    expect(deriveSpotTimelineHourKeys(keys.filter((_, index) => index > 12), now)).toHaveLength(11);
    expect(deriveSpotTimelineHourKeys(keys, now)).toHaveLength(24);
  });

  it('snaps to a specific future sunset and excludes events outside the loaded window', () => {
    const days = getTimelineEventDays(place, now, zone);
    const window = forecastRangeWindow(now, '7d', zone);
    const stops = buildTimelineStops(deriveSpotTimelineHourKeys(keys, now, '7d', zone), window.start, days, false);
    const target = days[4].sunset;
    const index = nearestTimelineStopIndex(timelinePositionPct(target.getTime(), stops), stops);
    expect(stops[index]).toMatchObject({ view: 'sunset', instantMs: target.getTime() });
    expect(stops.filter((stop) => stop.view === 'sunset')).toHaveLength(7);
    expect(stops.every((stop) => stop.instantMs >= window.start.getTime() && stop.instantMs < window.end.getTime())).toBe(true);
    expect(stops.some((stop) => stop.hourKey === '')).toBe(true);
    expect(stops[0].hourKey).toBe(rangeStartHourKey(now, '7d', zone));
    const short = buildTimelineStops(deriveSpotTimelineHourKeys(keys, now), now, days);
    expect(short.filter((stop) => stop.view === 'sunset')).toHaveLength(1);
  });

  it.each([
    ['2026-03-06T19:00:00Z', 167, '2026-03-07', '2026-03-13'],
    ['2026-10-30T19:00:00Z', 169, '2026-10-31', '2026-11-06'],
  ])('keeps seven calendar dates across clock changes from %s', (reference, count, firstDate, lastDate) => {
    const hours = buildForecastRangeHourKeys(new Date(reference), '7d', zone);
    const dates = [...new Set(hours.map((key) => formatCityCalendarDate(new Date(key), zone)))];
    expect(hours).toHaveLength(count);
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe(firstDate);
    expect(dates.at(-1)).toBe(lastDate);
    expect(hours.every((key, index) => index === 0 || Date.parse(key) - Date.parse(hours[index - 1]) === 3_600_000)).toBe(true);
  });

  it('keeps the full rail and marks the missing tail unavailable', () => {
    const rail = buildForecastRangeHourKeys(now, '7d', zone);
    const available = deriveSpotTimelineHourKeys(keys.slice(0, 48), now, '7d', zone);
    expect(rail).toHaveLength(168);
    expect(available.length).toBeLessThan(48);
    expect(hasExactTimelineHour(rail.at(-1)!, available)).toBe(false);
  });

  it('defaults safely when the saved range is missing or invalid', () => {
    expect(parseForecastRange('7d')).toBe('7d');
    expect(parseForecastRange('24h')).toBe('24h');
    expect(parseForecastRange(null)).toBe('24h');
    expect(parseForecastRange('invalid')).toBe('24h');
  });

  it.each([
    ['America/Los_Angeles', { lat: 37.7594, lng: -122.5107 }, '2026-10-12'],
    ['America/Chicago', { lat: 41.9, lng: -87.65 }, '2026-10-13'],
  ])('uses the selected city date at a UTC midnight boundary in %s', (timeZone, coordinates, date) => {
    const reference = new Date('2026-10-13T06:30:00Z');
    const events = getEventsForDate(coordinates, reference, timeZone);
    expect(formatCityCalendarDate(events.sunrise, timeZone)).toBe(date);
    expect(formatCityCalendarDate(events.sunset, timeZone)).toBe(date);
  });

  it.each(['America/Los_Angeles', 'America/Chicago'])('keeps one solar date per day through the fall clock change in %s', (timeZone) => {
    const days = getTimelineEventDays(place, new Date('2026-10-30T19:00:00Z'), timeZone);
    const dates = days.map((day) => formatCityCalendarDate(day.sunrise, timeZone));
    expect(dates).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
  });
});
