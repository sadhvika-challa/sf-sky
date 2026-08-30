import { describe, expect, it } from 'vitest';
import {
  buildScoreEvidence,
  describeScoreEvidenceSet,
  formatForecastRetrieved,
  getForecastConfidence,
  getForecastFreshness,
  scoreEvidenceAccessibilityLabel,
} from '../confidence';
import type { HourlyForecast } from '../weather';

const NOW = new Date('2026-06-11T12:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

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
    aqi: 18,
    windMph: 7,
    gustMph: 11,
    windDir: 270,
    ...overrides,
  };
}

function evidence(overrides: Partial<Parameters<typeof buildScoreEvidence>[0]> = {}) {
  return buildScoreEvidence({
    hourly: hour(),
    mode: 'now',
    moment: 'current',
    eventTime: NOW,
    fetchedAt: NOW.getTime() - 5 * MINUTE,
    now: NOW,
    ...overrides,
  });
}

describe('forecast freshness', () => {
  it('separates fresh, aging, stale, and unknown retrieval times', () => {
    expect(getForecastFreshness(NOW.getTime() - 5 * MINUTE, NOW.getTime())).toBe('fresh');
    expect(getForecastFreshness(NOW.getTime() - HOUR, NOW.getTime())).toBe('aging');
    expect(getForecastFreshness(NOW.getTime() - 3 * HOUR, NOW.getTime())).toBe('stale');
    expect(getForecastFreshness(null, NOW.getTime())).toBe('unknown');
  });

  it('formats the retrieval timestamp without implying a live observation', () => {
    expect(formatForecastRetrieved(NOW.getTime() - 30_000, NOW.getTime())).toBe('Retrieved just now');
    expect(formatForecastRetrieved(NOW.getTime() - 31 * MINUTE, NOW.getTime())).toBe('Retrieved 31m ago');
    expect(formatForecastRetrieved(NOW.getTime() - 3 * HOUR, NOW.getTime())).toBe('Retrieved 3h ago');
  });
});

describe('buildScoreEvidence', () => {
  it('identifies a fresh current forecast', () => {
    const read = evidence();
    expect(read).toMatchObject({
      provenance: 'forecast',
      freshness: 'fresh',
      completeness: 'complete',
      confidence: 'high',
      state: 'current-forecast',
      statusLabel: 'Current forecast · high confidence',
    });
  });

  it('identifies a selected future hour without calling it live', () => {
    const read = evidence({
      moment: 'selected-hour',
      eventTime: new Date(NOW.getTime() + 4 * HOUR),
    });
    expect(read.state).toBe('selected-hour-forecast');
    expect(read.confidence).toBe('medium');
    expect(read.statusLabel).toBe('Selected-hour forecast · medium confidence');
  });

  it('separates an aging forecast from a stale forecast', () => {
    const aging = evidence({ fetchedAt: NOW.getTime() - HOUR });
    const stale = evidence({ fetchedAt: NOW.getTime() - 3 * HOUR });
    expect(aging).toMatchObject({ freshness: 'aging', state: 'aging-forecast' });
    expect(stale).toMatchObject({
      freshness: 'stale',
      state: 'stale-forecast',
      confidence: 'low',
      reason: 'none',
    });
  });

  it('keeps complete data separate from an unknown retrieval age', () => {
    const read = evidence({ fetchedAt: null });
    expect(read).toMatchObject({
      provenance: 'forecast',
      freshness: 'unknown',
      completeness: 'complete',
      confidence: 'low',
      state: 'unknown-age-forecast',
      reason: 'missing-retrieval-time',
      statusLabel: 'Forecast age unknown · low confidence',
    });
  });

  it('marks retained data stale when refresh fails, regardless of timestamp age', () => {
    const read = evidence({ error: new Error('offline') });
    expect(read).toMatchObject({
      provenance: 'forecast',
      freshness: 'stale',
      state: 'stale-forecast',
      confidence: 'low',
      reason: 'refresh-error',
      statusLabel: 'Saved forecast · low confidence',
    });
  });

  it('marks missing required weather fields as partial and lowers confidence', () => {
    const read = evidence({ hourly: hour({ windMph: NaN }) });
    expect(read).toMatchObject({
      provenance: 'forecast',
      completeness: 'partial',
      state: 'partial-forecast',
      confidence: 'low',
      reason: 'missing-required-fields',
    });
  });

  it('does not grant high confidence to finite but out-of-domain weather', () => {
    const read = evidence({ hourly: hour({ cloud: 140 }) });
    expect(read).toMatchObject({
      completeness: 'partial',
      confidence: 'low',
      state: 'partial-forecast',
      reason: 'missing-required-fields',
    });
  });

  it('distinguishes loading, missing-hour unavailable, and curated estimate', () => {
    expect(evidence({ hourly: null, fetchedAt: null, loading: true }).state).toBe('loading');
    expect(evidence({
      hourly: null,
      unavailableReason: 'missing-hour',
    })).toMatchObject({
      state: 'unavailable',
      reason: 'missing-hour',
      statusLabel: 'Current forecast unavailable · curated estimate',
    });
    expect(evidence({ hourly: null, fetchedAt: null }).state).toBe('curated-estimate');
  });

  it.each([
    ['selected-hour', 'now', 'Selected hour unavailable · curated estimate'],
    ['event', 'sunrise', 'Sunrise forecast unavailable · curated estimate'],
    ['event', 'sunset', 'Sunset forecast unavailable · curated estimate'],
    ['event', 'stargazing', 'Stargazing forecast unavailable · curated estimate'],
  ] as const)('uses %s/%s missing-hour copy', (moment, mode, statusLabel) => {
    expect(evidence({
      hourly: null,
      moment,
      mode,
      unavailableReason: 'missing-hour',
    })).toMatchObject({ state: 'unavailable', reason: 'missing-hour', statusLabel });
  });

  it('distinguishes empty data from a fetch failure', () => {
    expect(evidence({
      hourly: null,
      unavailableReason: 'empty',
    })).toMatchObject({ state: 'unavailable', reason: 'empty' });
    expect(evidence({
      hourly: null,
      fetchedAt: null,
      error: new Error('network down'),
    })).toMatchObject({ state: 'unavailable', reason: 'fetch-error' });
  });

  it('treats malformed hourly data as unavailable rather than forecast-backed', () => {
    const malformed = hour(Object.fromEntries(
      Object.keys(hour()).map((key) => [key, NaN]),
    ) as Partial<HourlyForecast>);
    const read = evidence({ hourly: malformed, unavailableReason: 'malformed' });
    expect(read).toMatchObject({
      provenance: 'curated-estimate',
      completeness: 'missing',
      confidence: 'low',
      state: 'unavailable',
      reason: 'malformed',
    });
  });

  it('reports mixed result provenance without collapsing partial forecasts into estimates', () => {
    const partial = evidence({ hourly: hour({ windMph: NaN }) });
    const estimate = evidence({ hourly: null, fetchedAt: null });
    expect(describeScoreEvidenceSet([evidence(), partial])).toBe('Forecast-backed scores');
    expect(describeScoreEvidenceSet([partial, estimate])).toBe(
      'Mix of forecast-backed scores and curated estimates',
    );
  });

  it('puts provenance and a clamped score into map accessibility copy', () => {
    const estimate = evidence({ hourly: null, fetchedAt: null });
    expect(scoreEvidenceAccessibilityLabel(140, estimate)).toBe(
      '100 out of 100, curated estimate, forecast not retrieved',
    );
    expect(scoreEvidenceAccessibilityLabel(-4, evidence())).toContain(
      '0 out of 100, current forecast',
    );
  });

  it('never emits certainty or future-live claims', () => {
    const reads = [
      evidence(),
      evidence({ moment: 'selected-hour', eventTime: new Date(NOW.getTime() + HOUR) }),
      evidence({ fetchedAt: NOW.getTime() - 3 * HOUR }),
      evidence({ hourly: hour({ windMph: NaN }) }),
      evidence({ hourly: null, fetchedAt: null, loading: true }),
    ];
    for (const read of reads) {
      const copy = `${read.statusLabel} ${read.retrievalLabel}`.toLowerCase();
      expect(copy).not.toContain('live');
      expect(copy).not.toContain('locked');
      expect(copy).not.toContain('near certain');
    }
  });
});

describe('getForecastConfidence', () => {
  it('combines forecast horizon, freshness, completeness, and provenance', () => {
    expect(getForecastConfidence('forecast', 'fresh', 'complete', NOW, NOW)).toBe('high');
    expect(getForecastConfidence(
      'forecast',
      'fresh',
      'complete',
      new Date(NOW.getTime() + 4 * HOUR),
      NOW,
    )).toBe('medium');
    expect(getForecastConfidence(
      'forecast',
      'fresh',
      'complete',
      new Date(NOW.getTime() + 8 * HOUR),
      NOW,
    )).toBe('low');
    expect(getForecastConfidence('forecast', 'stale', 'complete', NOW, NOW)).toBe('low');
    expect(getForecastConfidence('forecast', 'fresh', 'partial', NOW, NOW)).toBe('low');
    expect(getForecastConfidence('curated-estimate', 'unknown', 'missing', NOW, NOW)).toBe('low');
  });
});
