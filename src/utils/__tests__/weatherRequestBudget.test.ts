import { describe, expect, it } from 'vitest';
import {
  deriveOverlayCoverage,
  deriveLocalHourKeys,
  overlayRequestMaxAge,
  OVERLAY_CONCURRENCY,
  OVERLAY_USABLE_ANCHORS,
  SELECTED_SPOT_CONCURRENCY,
} from '../../hooks/useNeighborhoodForecasts';
import { neighborhoods } from '../../data/neighborhoods';
import type { HourlyForecast, SpotForecast } from '../weather';
import { buildSamples, hasSpatialSupport } from '../weatherSamples';
import {
  keepRefreshScheduleForScope,
  nextWeatherRefreshAt,
  WEATHER_REFRESH_INTERVAL_MS,
} from '../weatherRefresh';
import { TIMELINE_FORECAST_CONCURRENCY } from '../../hooks/useTimelineScores';

const HOUR_KEY = '2026-08-31T01:00:00Z';

function hourly(overrides: Partial<HourlyForecast> = {}): HourlyForecast {
  return {
    cloud: 25, cloudLow: 10, cloudMid: 30, cloudHigh: 20,
    visibilityKm: 18, humidity: 55, tempF: 62, precipProb: 5,
    pm25: NaN, aqi: NaN, windMph: 7, gustMph: 10, windDir: 270,
    ...overrides,
  };
}

function forecastsFor(
  ids: ReadonlyArray<number>,
  hourForId: (id: number) => HourlyForecast | null = () => hourly(),
): Map<number, SpotForecast> {
  return new Map(ids.map((id): [number, SpotForecast] => {
    const value = hourForId(id);
    const hours: Record<string, HourlyForecast> = value ? { [HOUR_KEY]: value } : {};
    return [id, {
      hours,
      timeZone: 'America/Los_Angeles',
      fetchedAt: 1234,
    }];
  }));
}

describe('weather request budget contracts', () => {
  it('reserves an immediate selected-spot lane within four aggregate coordinate jobs', () => {
    expect(SELECTED_SPOT_CONCURRENCY).toBe(1);
    expect(OVERLAY_CONCURRENCY).toBe(3);
    expect(SELECTED_SPOT_CONCURRENCY + OVERLAY_CONCURRENCY).toBe(4);
    expect(OVERLAY_USABLE_ANCHORS).toBe(9);
    expect(overlayRequestMaxAge(false)).toBe(WEATHER_REFRESH_INTERVAL_MS);
    expect(overlayRequestMaxAge(true)).toBe(0);
  });

  it('caps a Best Nearby comparison at two concurrent forecast coordinate jobs', () => {
    expect(TIMELINE_FORECAST_CONCURRENCY).toBe(2);
  });

  it('builds the forward 24-hour scrubber locally using canonical UTC identities', () => {
    const keys = deriveLocalHourKeys(new Date('2026-11-01T06:37:00Z'));
    expect(keys).toHaveLength(25);
    expect(keys[0]).toBe('2026-11-01T06:00:00Z');
    expect(keys[1]).toBe('2026-11-01T07:00:00Z');
    expect(keys[24]).toBe('2026-11-02T06:00:00Z');
    expect(new Set(keys).size).toBe(25);
  });

  it('anchors delayed refresh and failed retry cadence to actual completion', () => {
    const startedAt = 10_000;
    const completedAt = startedAt + 7_500;
    expect(nextWeatherRefreshAt(completedAt, completedAt)).toBe(
      completedAt + WEATHER_REFRESH_INTERVAL_MS,
    );
    expect(nextWeatherRefreshAt(null, completedAt)).toBe(
      completedAt + WEATHER_REFRESH_INTERVAL_MS,
    );
  });

  it('drops a selected retry deadline when the active spot scope changes', () => {
    const schedule = { scope: 'America/Los_Angeles:sf-twin-peaks', dueAt: 1234 };
    expect(keepRefreshScheduleForScope(schedule, schedule.scope)).toBe(schedule);
    expect(keepRefreshScheduleForScope(schedule, 'America/Los_Angeles:sf-ocean-beach')).toBeNull();
  });

  it('requires usable, spatially distributed active-hour samples before a wash', () => {
    const firstWave = [1, 3, 4, 6, 9, 16, 20, 22, 25];
    const supported = buildSamples('temp', HOUR_KEY, forecastsFor(firstWave));
    expect(supported.size).toBe(9);
    expect(hasSpatialSupport(supported)).toBe(true);
    expect(deriveOverlayCoverage(
      forecastsFor(firstWave), 'temp', HOUR_KEY, true, false, null,
    )).toMatchObject({ usable: 9, spatiallySupported: true, phase: 'progressive' });

    const northernCluster = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const clustered = buildSamples('temp', HOUR_KEY, forecastsFor(northernCluster));
    expect(clustered.size).toBe(9);
    expect(hasSpatialSupport(clustered)).toBe(false);
    expect(deriveOverlayCoverage(
      forecastsFor(northernCluster), 'temp', HOUR_KEY, true, false, null,
    )).toMatchObject({ usable: 9, spatiallySupported: false, phase: 'loading' });
  });

  it('derives readiness only from all 25 valid active metric samples', () => {
    const allIds = neighborhoods.map((neighborhood) => neighborhood.id);
    expect(deriveOverlayCoverage(
      forecastsFor(allIds), 'temp', HOUR_KEY, false, false, null,
    )).toMatchObject({ usable: 25, spatiallySupported: true, phase: 'ready', errorKind: null });

    const malformed = forecastsFor(allIds, (id) => id === 13 ? hourly({ tempF: NaN }) : hourly());
    expect(deriveOverlayCoverage(
      malformed, 'temp', HOUR_KEY, false, false, null,
    )).toMatchObject({ usable: 24, phase: 'partial', errorKind: 'invalid-data' });

    const missingHour = forecastsFor(allIds, (id) => id === 13 ? null : hourly());
    expect(deriveOverlayCoverage(
      missingHour, 'temp', HOUR_KEY, false, false, null,
    )).toMatchObject({ usable: 24, phase: 'partial', errorKind: 'invalid-data' });

    expect(deriveOverlayCoverage(
      new Map([[1, { hours: {} } as SpotForecast]]),
      'temp', HOUR_KEY, false, false, null,
    )).toMatchObject({ usable: 0, phase: 'unavailable', errorKind: 'invalid-data' });
  });
});
