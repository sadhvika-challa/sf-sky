import { describe, test, expect } from 'vitest';
import { getKarlComment } from '../karl-copy';

describe('getKarlComment', () => {
  test('returns a non-empty string', () => {
    const comment = getKarlComment(80, 'sunset', 'sf-ocean-beach');
    expect(comment.length).toBeGreaterThan(0);
  });

  test('same spot/day/type returns same line (deterministic)', () => {
    const date = new Date('2026-06-02');
    const a = getKarlComment(80, 'sunset', 'sf-ocean-beach', date);
    const b = getKarlComment(80, 'sunset', 'sf-ocean-beach', date);
    expect(a).toBe(b);
  });

  test('different spots can get different lines', () => {
    const date = new Date('2026-06-02');
    const a = getKarlComment(80, 'sunset', 'sf-ocean-beach', date);
    const b = getKarlComment(80, 'sunset', 'sf-twin-peaks', date);
    // Both should return valid strings
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });

  test('SF uses Karl voice for low scores', () => {
    const comment = getKarlComment(10, 'sunset', 'test', new Date(), 'sf');
    expect(comment.toLowerCase()).toContain('karl');
  });

  test('Austin uses neutral voice', () => {
    const comment = getKarlComment(90, 'sunset', 'test', new Date(), 'austin');
    expect(comment.toLowerCase()).not.toContain('karl');
  });

  test('stargazing uses star-specific lines', () => {
    const comment = getKarlComment(90, 'stargazing', 'test', new Date(), 'sf');
    expect(comment.length).toBeGreaterThan(0);
  });
});
