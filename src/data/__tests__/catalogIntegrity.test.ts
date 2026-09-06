import { describe, expect, it } from 'vitest';
import { allSpots } from '../all-spots';
import { CITIES } from '../cities';

describe('bundled city and spot catalog integrity', () => {
  it('provides at least one spot for every configured city and maps every spot back to one city', () => {
    const configuredCityIds = new Set(CITIES.map((city) => city.id));

    expect(configuredCityIds.size).toBe(CITIES.length);
    for (const city of CITIES) {
      expect(city.id.trim()).not.toBe('');
      expect(city.name.trim()).not.toBe('');
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: city.timeZone }))
        .not.toThrow();
      expect(allSpots.some((spot) => spot.city === city.id)).toBe(true);
    }
    for (const spot of allSpots) {
      expect(configuredCityIds.has(spot.city), `${spot.id} references ${spot.city}`).toBe(true);
    }
  });

  it('keeps persistent spot IDs nonempty and unique', () => {
    const ids = allSpots.map((spot) => spot.id);

    for (const id of ids) expect(id.trim()).not.toBe('');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps coordinates valid and every curated sky score finite from 0 through 100', () => {
    for (const spot of allSpots) {
      expect(Number.isFinite(spot.lat), `${spot.id} latitude`).toBe(true);
      expect(spot.lat, `${spot.id} latitude`).toBeGreaterThanOrEqual(-90);
      expect(spot.lat, `${spot.id} latitude`).toBeLessThanOrEqual(90);
      expect(Number.isFinite(spot.lng), `${spot.id} longitude`).toBe(true);
      expect(spot.lng, `${spot.id} longitude`).toBeGreaterThanOrEqual(-180);
      expect(spot.lng, `${spot.id} longitude`).toBeLessThanOrEqual(180);

      for (const scoreName of ['sunrise', 'sunset', 'stargazing'] as const) {
        const score = spot[scoreName];
        expect(Number.isFinite(score), `${spot.id} ${scoreName}`).toBe(true);
        expect(score, `${spot.id} ${scoreName}`).toBeGreaterThanOrEqual(0);
        expect(score, `${spot.id} ${scoreName}`).toBeLessThanOrEqual(100);
      }
    }
  });
});
