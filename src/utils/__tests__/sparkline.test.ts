import { describe, expect, it } from 'vitest';
import type { Spot } from '../../data/spots';
import { computeSparkPoints, deriveSparkHours } from '../sparkline';
import { formatCanonicalHourKey } from '../timeline';
import type { HourlyForecast, SpotForecast } from '../weather';

const austinSpot: Spot = {
  id: 'atx-test',
  name: 'Austin Test Viewpoint',
  lat: 30.3,
  lng: -97.78,
  city: 'austin',
  category: 'park',
  elevation: 100,
  lightPollution: 'Mid',
  horizonQuality: 'Open',
  sunrise: 65,
  sunset: 80,
  stargazing: 58,
};

const clearHour: HourlyForecast = {
  cloud: 20,
  cloudLow: 8,
  cloudMid: 35,
  cloudHigh: 40,
  visibilityKm: 22,
  humidity: 52,
  tempF: 82,
  precipProb: 0,
  pm25: 4,
  aqi: 18,
  windMph: 7,
  gustMph: 10,
  windDir: 170,
};

describe('sparkline city hour keys', () => {
  it('uses Austin forecast keys for an Austin event viewed on a Los Angeles device', () => {
    const eventInstant = new Date('2026-08-31T01:30:00.000Z');
    const hours: Record<string, HourlyForecast> = {};
    for (const instant of deriveSparkHours('sunset', eventInstant)) {
      hours[formatCanonicalHourKey(instant)] = clearHour;
    }
    const forecast: SpotForecast = { hours, timeZone: 'America/Chicago', fetchedAt: eventInstant.getTime() };

    expect(formatCanonicalHourKey(eventInstant)).toBe('2026-08-31T01:00:00Z');
    expect(
      computeSparkPoints(
        austinSpot,
        'sunset',
        forecast,
        eventInstant,
        0.4,
      ),
    ).toHaveLength(5);
  });
});
