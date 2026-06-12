import { describe, it, expect } from 'vitest';
import {
  getScoreConfidence,
  EARLY_HOURS,
  FIRMING_HOURS,
  TOMORROW_HOURS,
} from '../confidence';

function hoursFromNow(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function minsFromNow(now: Date, mins: number): Date {
  return new Date(now.getTime() + mins * 60 * 1000);
}

describe('getScoreConfidence', () => {
  const now = new Date('2026-06-11T12:00:00');

  it('returns early for invalid eventTime (NaN)', () => {
    const result = getScoreConfidence(new Date(NaN), now);
    expect(result.level).toBe('early');
    expect(result.detail).toBe('no live forecast');
    expect(result.chipLabel).toBe('early read');
  });

  it('returns early for >18h out (tomorrow)', () => {
    const event = hoursFromNow(now, TOMORROW_HOURS + 2);
    const result = getScoreConfidence(event, now);
    expect(result.level).toBe('early');
    expect(result.detail).toContain('forecast for tomorrow');
    expect(result.chipLabel).toBe('early read');
  });

  it('returns early for >6h out', () => {
    const event = hoursFromNow(now, EARLY_HOURS + 2);
    const result = getScoreConfidence(event, now);
    expect(result.level).toBe('early');
    expect(result.hoursOut).toBe(8);
    expect(result.detail).toBe('forecast 8h out \u00b7 still settling');
    expect(result.chipLabel).toBe('early read');
  });

  it('returns firming for 2-6h out', () => {
    const event = hoursFromNow(now, 4);
    const result = getScoreConfidence(event, now);
    expect(result.level).toBe('firming');
    expect(result.hoursOut).toBe(4);
    expect(result.detail).toBe('forecast 4h out \u00b7 getting solid');
    expect(result.chipLabel).toBe('firming up');
  });

  it('returns locked for <2h out (hours)', () => {
    const event = hoursFromNow(now, 1.5);
    const result = getScoreConfidence(event, now);
    expect(result.level).toBe('locked');
    expect(result.hoursOut).toBe(1);
    expect(result.detail).toBe('forecast 1h out \u00b7 near certain');
    expect(result.chipLabel).toBe('locked in');
  });

  it('returns locked with minutes for <1h out', () => {
    const event = minsFromNow(now, 30);
    const result = getScoreConfidence(event, now);
    expect(result.level).toBe('locked');
    expect(result.hoursOut).toBe(0);
    expect(result.detail).toBe('forecast 30min out \u00b7 near certain');
    expect(result.chipLabel).toBe('locked in');
  });

  it('returns locked for event in the past', () => {
    const event = hoursFromNow(now, -1);
    const result = getScoreConfidence(event, now);
    expect(result.level).toBe('locked');
    expect(result.hoursOut).toBe(0);
  });

  // Boundary tests
  it('boundary: exactly 6h is firming, not early', () => {
    const event = hoursFromNow(now, EARLY_HOURS);
    const result = getScoreConfidence(event, now);
    expect(result.level).toBe('firming');
  });

  it('boundary: exactly 2h is locked, not firming', () => {
    const event = hoursFromNow(now, FIRMING_HOURS);
    const result = getScoreConfidence(event, now);
    expect(result.level).toBe('locked');
  });

  it('boundary: exactly 18h is early (not tomorrow)', () => {
    const event = hoursFromNow(now, TOMORROW_HOURS);
    const result = getScoreConfidence(event, now);
    expect(result.level).toBe('early');
    expect(result.detail).not.toContain('tomorrow');
  });

  it('no em dashes in any output', () => {
    const cases = [
      new Date(NaN),
      hoursFromNow(now, 20),
      hoursFromNow(now, 8),
      hoursFromNow(now, 4),
      hoursFromNow(now, 1.5),
      minsFromNow(now, 30),
      hoursFromNow(now, -1),
    ];
    for (const event of cases) {
      const result = getScoreConfidence(event, now);
      expect(result.detail).not.toContain('\u2014');
      expect(result.chipLabel).not.toContain('\u2014');
    }
  });
});
