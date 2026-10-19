import { describe, expect, it } from 'vitest';
import { spots } from '../../data/spots';
import { activeScoreForSpot, canonicalScoresForSpot, combineTimelineScores } from '../../hooks/useTimelineScores';
import { formatCanonicalHourKey } from '../timeline';
import { rankSkySpots } from '../skySpotRanking';
import type { HourlyForecast, SpotForecast } from '../weather';

const now = new Date('2026-10-18T23:00:00Z');
const selected = new Date('2026-10-19T02:00:00Z');
const first = spots.find(spot => spot.id === 'sf-ocean-beach')!;
const second = spots.find(spot => spot.id === 'sf-twin-peaks')!;
const clear: HourlyForecast = { cloud: 5, cloudLow: 2, cloudMid: 3, cloudHigh: 4, visibilityKm: 20,
  humidity: 60, tempF: 62, precipProb: 0, windMph: 8, gustMph: 12, windDir: 270, pm25: 5, aqi: 20 };
function entry(spot: typeof first, hourly: HourlyForecast) {
  const source: SpotForecast = { fetchedAt: now.getTime(), timeZone: 'America/Los_Angeles',
    hours: Object.fromEntries(Array.from({ length: 24 }, (_, hour) =>
      [formatCanonicalHourKey(new Date(now.getTime() + (hour - 6) * 3_600_000)), { ...hourly }])) };
  return combineTimelineScores(canonicalScoresForSpot(spot, source, formatCanonicalHourKey(now), now),
    activeScoreForSpot(spot, source, formatCanonicalHourKey(selected), selected, 'sunset', now, false));
}

describe('spot comparison at a shared time', () => {
  it('ranks the actual selected-time forecasts rather than curated sunset ratings', () => {
    const fog = { ...clear, cloud: 100, cloudLow: 100, humidity: 99, visibilityKm: 0.5 };
    const scores = new Map([[first.id, entry(first, fog)], [second.id, entry(second, clear)]]);
    const ranked = rankSkySpots([first, second], scores);
    expect(first.sunset).toBeGreaterThan(second.sunset);
    expect(ranked.map(row => row.spot.id)).toEqual([second.id, first.id]);
    expect(ranked[0].score).toBe(scores.get(second.id)!.active);
    expect(ranked[0].sky.scene).toBe('blue-twilight');
    expect(rankSkySpots([first], scores).map(row => row.spot.id)).toEqual([first.id]);
  });
  it('excludes unsupported, stale, and failed forecasts from a fresh comparison', () => {
    const healthy = entry(first, clear);
    const other = entry(second, clear);
    const scores = new Map([[first.id, healthy], [second.id, other]]);
    expect(rankSkySpots([first, second], scores, new Map([[first.id, new Error('Refresh failed')]])))
      .toHaveLength(1);
    healthy.activeEvidence.freshness = 'stale';
    expect(rankSkySpots([first], scores)).toEqual([]);
    other.activeEvidence.completeness = 'partial';
    expect(rankSkySpots([first, second], scores)).toEqual([]);
    expect(rankSkySpots([first], new Map())).toEqual([]);
  });
  it('uses remaining duration to distinguish equal quality without changing scores', () => {
    const a = entry(first, clear), b = entry(second, clear);
    a.active = b.active = 70;
    a.sky!.durationMinutes = 15;
    b.sky!.durationMinutes = 45;
    const ranked = rankSkySpots([first, second], new Map([[first.id, a], [second.id, b]]));
    expect(ranked[0].spot.id).toBe(second.id);
    expect(ranked.map(row => row.score)).toEqual([70, 70]);
  });
});
