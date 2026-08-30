import { describe, expect, it } from 'vitest';
import { getDistanceMiles, precisionForAccuracy } from '../geo';

describe('geospatial utilities', () => {
  it('calculates a stable Haversine distance', () => {
    const miles = getDistanceMiles(37.7544, -122.4477, 37.7594, -122.5107);
    expect(miles).toBeCloseTo(3.47, 1);
    expect(getDistanceMiles(30.2672, -97.7431, 30.2672, -97.7431)).toBe(0);
  });

  it('describes the accuracy contract without overstating precision', () => {
    expect(precisionForAccuracy(25)).toBe('precise');
    expect(precisionForAccuracy(100)).toBe('precise');
    expect(precisionForAccuracy(101)).toBe('approximate');
    expect(precisionForAccuracy(5_000)).toBe('approximate');
    expect(precisionForAccuracy(null)).toBe('unknown');
    expect(precisionForAccuracy(Number.NaN)).toBe('unknown');
    expect(precisionForAccuracy(-1)).toBe('unknown');
  });
});
