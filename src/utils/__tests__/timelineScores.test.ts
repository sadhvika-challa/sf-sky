import { afterEach, describe, expect, it, vi } from 'vitest';
import SunCalc from 'suncalc';
import type { Spot } from '../../data/spots';
import {
  activeScoreForSpot,
  canonicalScoresForSpot,
  combineTimelineScores,
} from '../../hooks/useTimelineScores';
import { getUpcomingEventTimes } from '../events';
import { computeLiveScore, computeScoreAtTime, computeNowScore } from '../scoring';
import { formatCanonicalHourKey, parseCanonicalHourKey } from '../timeline';
import type { HourlyForecast, SpotForecast } from '../weather';

const TIME_ZONE = 'America/Los_Angeles';
const NOW = new Date('2026-08-29T19:00:00.000Z');

const spot: Spot = {
  id: 'sf-test',
  name: 'Test Viewpoint',
  lat: 37.78,
  lng: -122.51,
  city: 'sf',
  category: 'hill',
  elevation: 100,
  lightPollution: 'Low',
  horizonQuality: 'Open',
  sunrise: 61,
  sunset: 83,
  stargazing: 72,
};

function hour(overrides: Partial<HourlyForecast> = {}): HourlyForecast {
  return {
    cloud: 25,
    cloudLow: 10,
    cloudMid: 45,
    cloudHigh: 35,
    visibilityKm: 18,
    humidity: 55,
    tempF: 64,
    precipProb: 0,
    pm25: 4,
    aqi: 18,
    windMph: 7,
    gustMph: 10,
    windDir: 260,
    ...overrides,
  };
}

function forecast(defaultHour = hour()): SpotForecast {
  const hours: Record<string, HourlyForecast> = {};
  for (let offset = -24; offset <= 72; offset += 1) {
    const instant = new Date(NOW.getTime() + offset * 3_600_000);
    hours[formatCanonicalHourKey(instant)] = defaultHour;
  }
  return { hours, timeZone: TIME_ZONE, fetchedAt: NOW.getTime() };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('timeline score contract', () => {
  it('keeps canonical live sunrise, sunset, and stargazing scores at event parity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const source = forecast();
    const canonical = canonicalScoresForSpot(
      spot,
      source,
      formatCanonicalHourKey(NOW),
      NOW,
    );
    const events = getUpcomingEventTimes(spot, NOW);
    const moon = SunCalc.getMoonIllumination(events.stargazing).fraction;

    expect(canonical.sunrise).toBe(computeLiveScore(spot, 'sunrise', hour()));
    expect(canonical.sunset).toBe(computeLiveScore(spot, 'sunset', hour()));
    expect(canonical.stargazing).toBe(computeLiveScore(spot, 'stargazing', hour(), moon));
    expect(canonical.now).toBe(computeNowScore(spot, hour()));
    expect(canonical.isLive).toBe(true);
  });

  it('uses exact canonical instants for Now, sunrise, sunset, and stargazing', () => {
    const source = forecast();
    const events = getUpcomingEventTimes(spot, NOW);
    const nowWeather = hour({ tempF: 51, cloud: 11 });
    const sunriseWeather = hour({ cloud: 21, cloudLow: 31 });
    const sunsetWeather = hour({ cloud: 41, cloudHigh: 51 });
    const starWeather = hour({ cloud: 61, humidity: 71 });
    source.hours[formatCanonicalHourKey(NOW)] = nowWeather;
    source.hours[formatCanonicalHourKey(events.sunrise)] = sunriseWeather;
    source.hours[formatCanonicalHourKey(events.sunset)] = sunsetWeather;
    source.hours[formatCanonicalHourKey(events.stargazing)] = starWeather;

    const result = canonicalScoresForSpot(spot, source, formatCanonicalHourKey(NOW), NOW);
    expect(result.now).toBe(computeNowScore(spot, nowWeather));
    expect(result.sunrise).toBe(computeLiveScore(spot, 'sunrise', sunriseWeather));
    expect(result.sunset).toBe(computeLiveScore(spot, 'sunset', sunsetWeather));
    expect(result.stargazing).toBe(computeLiveScore(
      spot,
      'stargazing',
      starWeather,
      SunCalc.getMoonIllumination(events.stargazing).fraction,
    ));
  });

  it.each(['sunrise', 'sunset', 'stargazing'] as const)(
    'computes active %s from the exact selected hour without replacing its canonical event score',
    (viewMode) => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const source = forecast();
      const selectedKey = '2026-08-30T05:00:00Z';
      const selectedInstant = parseCanonicalHourKey(selectedKey)!;
      const selectedWeather = hour({ cloud: 91, cloudLow: 88, visibilityKm: 2 });
      source.hours[selectedKey] = selectedWeather;
      const canonical = canonicalScoresForSpot(
        spot,
        source,
        formatCanonicalHourKey(NOW),
        NOW,
      );
      const before = {
        sunrise: canonical.sunrise,
        sunset: canonical.sunset,
        stargazing: canonical.stargazing,
      };
      const active = activeScoreForSpot(
        spot,
        source,
        selectedKey,
        selectedInstant,
        viewMode,
        NOW,
        false,
      );
      const combined = combineTimelineScores(canonical, active);
      const moon = SunCalc.getMoonIllumination(selectedInstant).fraction;

      expect(combined.active).toBe(
        computeScoreAtTime(spot, viewMode, selectedWeather, moon),
      );
      expect(combined.activeIsLive).toBe(true);
      expect({
        sunrise: combined.sunrise,
        sunset: combined.sunset,
        stargazing: combined.stargazing,
      }).toEqual(before);
    },
  );

  it('marks active unavailable without contaminating canonical live scores', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const source = forecast();
    const canonical = canonicalScoresForSpot(
      spot,
      source,
      formatCanonicalHourKey(NOW),
      NOW,
    );
    const active = activeScoreForSpot(
      spot,
      source,
      '2026-09-10T12:00:00Z',
      parseCanonicalHourKey('2026-09-10T12:00:00Z'),
      'sunset',
      NOW,
      false,
    );
    const combined = combineTimelineScores(canonical, active);

    expect(combined.active).toBe(spot.sunset);
    expect(combined.activeIsLive).toBe(false);
    expect(combined.activeEvidence).toMatchObject({
      provenance: 'curated-estimate',
      state: 'unavailable',
    });
    expect(combined.sunset).toBe(canonical.sunset);
    expect(combined.isLive).toBe(true);
  });

  it('keeps a partial selected-hour forecast distinct from a curated estimate', () => {
    const source = forecast();
    const selectedKey = '2026-08-30T05:00:00Z';
    const selectedInstant = parseCanonicalHourKey(selectedKey)!;
    source.hours[selectedKey] = hour({ windMph: NaN });
    const active = activeScoreForSpot(
      spot,
      source,
      selectedKey,
      selectedInstant,
      'now',
      NOW,
      false,
    );

    expect(active.activeEvidence).toMatchObject({
      provenance: 'forecast',
      completeness: 'partial',
      state: 'partial-forecast',
    });
    expect(active.activeIsLive).toBe(false);
  });

  it('scores the two repeated local hours independently from their exact canonical data', () => {
    const source = forecast();
    const firstKey = '2026-11-01T08:00:00Z';
    const secondKey = '2026-11-01T09:00:00Z';
    const firstInstant = parseCanonicalHourKey(firstKey)!;
    const secondInstant = parseCanonicalHourKey(secondKey)!;
    source.hours[firstKey] = hour({ cloud: 5, cloudLow: 3, visibilityKm: 30 });
    source.hours[secondKey] = hour({ cloud: 95, cloudLow: 90, visibilityKm: 1 });

    const first = activeScoreForSpot(spot, source, firstKey, firstInstant, 'now', NOW, false);
    const second = activeScoreForSpot(spot, source, secondKey, secondInstant, 'now', NOW, false);

    expect(first.active).toBe(computeScoreAtTime(spot, 'now', source.hours[firstKey], SunCalc.getMoonIllumination(firstInstant).fraction));
    expect(second.active).toBe(computeScoreAtTime(spot, 'now', source.hours[secondKey], SunCalc.getMoonIllumination(secondInstant).fraction));
    expect(first.active).not.toBe(second.active);
    expect(first.activeIsLive).toBe(true);
    expect(second.activeIsLive).toBe(true);
  });
});
