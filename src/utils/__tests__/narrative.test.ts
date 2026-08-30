import { describe, test, expect } from 'vitest';
import { narrativeFor } from '../narrative';
import type { SamplePoint } from '../interpolate';

function makeSamples(values: [number, number][]): Map<number, SamplePoint> {
  const map = new Map<number, SamplePoint>();
  for (const [id, value] of values) {
    map.set(id, { lat: 37.76, lng: -122.45, value });
  }
  return map;
}

describe('narrativeFor', () => {
  test('returns loading copy for empty samples', () => {
    const result = narrativeFor('temp', new Map(), null);
    expect(result.sub).toContain('Loading');
  });

  test('temp returns avg and spread', () => {
    const samples = makeSamples([[1, 55], [2, 65]]);
    const result = narrativeFor('temp', samples, null);
    expect(result.main).toContain('60');
    expect(result.main).toContain('avg');
  });

  test('fog mentions Karl for SF neighborhoods', () => {
    const high = makeSamples([[1, 0.8], [2, 0.9]]);
    const result = narrativeFor('fog', high, null);
    expect(result.main.toLowerCase()).toContain('karl');
  });

  test('precip handles dry conditions', () => {
    const dry = makeSamples([[1, 0], [2, 0]]);
    const result = narrativeFor('precip', dry, null);
    expect(result.main.toLowerCase()).toContain('no rain');
  });

  test('wind returns avg mph', () => {
    const samples = makeSamples([[1, 10], [2, 14]]);
    const result = narrativeFor('wind', samples, null);
    expect(result.main).toContain('12');
    expect(result.main.toLowerCase()).toContain('avg');
  });

  test('clouds returns avg percentage', () => {
    const samples = makeSamples([[1, 40], [2, 60]]);
    const result = narrativeFor('clouds', samples, null);
    expect(result.main).toContain('50');
  });
});
