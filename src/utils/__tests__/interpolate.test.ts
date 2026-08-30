import { describe, test, expect } from 'vitest';
import { idw, colorRampFor, computeDynamicRange, formatMetricValue } from '../interpolate';

describe('idw', () => {
  test('returns NaN for empty points', () => {
    expect(idw([], 37.76, -122.45)).toBeNaN();
  });

  test('returns exact value when target is on a sample', () => {
    const points = [{ lat: 37.76, lng: -122.45, value: 42 }];
    expect(idw(points, 37.76, -122.45)).toBe(42);
  });

  test('interpolates between two points', () => {
    const points = [
      { lat: 37.0, lng: -122.0, value: 0 },
      { lat: 38.0, lng: -122.0, value: 100 },
    ];
    const result = idw(points, 37.5, -122.0);
    expect(result).toBeGreaterThan(30);
    expect(result).toBeLessThan(70);
  });

  test('closer point has more influence', () => {
    const points = [
      { lat: 37.0, lng: -122.0, value: 0 },
      { lat: 37.1, lng: -122.0, value: 100 },
    ];
    const result = idw(points, 37.09, -122.0);
    expect(result).toBeGreaterThan(70);
  });
});

describe('colorRampFor', () => {
  test('returns a 3-element RGB array', () => {
    const color = colorRampFor('temp', 70);
    expect(color).toHaveLength(3);
    color.forEach(c => {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(255);
    });
  });

  test('NaN returns gray fallback', () => {
    expect(colorRampFor('temp', NaN)).toEqual([200, 200, 200]);
  });

  test('different temps produce different colors', () => {
    const cold = colorRampFor('temp', 50);
    const hot = colorRampFor('temp', 95);
    expect(cold).not.toEqual(hot);
  });
});

describe('computeDynamicRange', () => {
  test('returns null for empty values', () => {
    expect(computeDynamicRange('temp', [])).toBeNull();
  });

  test('returns null for all-NaN values', () => {
    expect(computeDynamicRange('temp', [NaN, NaN])).toBeNull();
  });

  test('expands small ranges to minimum span', () => {
    const range = computeDynamicRange('temp', [60, 62]);
    expect(range).not.toBeNull();
    expect(range!.max - range!.min).toBeGreaterThanOrEqual(6);
  });

  test('preserves ranges wider than minimum', () => {
    const range = computeDynamicRange('temp', [50, 80]);
    expect(range).toEqual({ min: 50, max: 80 });
  });
});

describe('formatMetricValue', () => {
  test('temp rounds to integer', () => expect(formatMetricValue('temp', 58.7)).toBe('59'));
  test('clouds adds %', () => expect(formatMetricValue('clouds', 42)).toBe('42%'));
  test('precip adds %', () => expect(formatMetricValue('precip', 15)).toBe('15%'));
  test('wind rounds to integer', () => expect(formatMetricValue('wind', 8.3)).toBe('8'));
  test('NaN returns dash', () => expect(formatMetricValue('temp', NaN)).toBe('–'));
});
