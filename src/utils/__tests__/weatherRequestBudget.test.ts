import { describe, expect, it } from 'vitest';
import {
  deriveLocalHourKeys,
  OVERLAY_CONCURRENCY,
  OVERLAY_USABLE_ANCHORS,
  SELECTED_SPOT_CONCURRENCY,
} from '../../hooks/useNeighborhoodForecasts';

describe('weather request budget contracts', () => {
  it('reserves an immediate selected-spot lane within four aggregate coordinate jobs', () => {
    expect(SELECTED_SPOT_CONCURRENCY).toBe(1);
    expect(OVERLAY_CONCURRENCY).toBe(3);
    expect(SELECTED_SPOT_CONCURRENCY + OVERLAY_CONCURRENCY).toBe(4);
    expect(OVERLAY_USABLE_ANCHORS).toBe(9);
  });

  it('builds the forward 24-hour scrubber locally using canonical UTC identities', () => {
    const keys = deriveLocalHourKeys(new Date('2026-11-01T06:37:00Z'));
    expect(keys).toHaveLength(25);
    expect(keys[0]).toBe('2026-11-01T06:00:00Z');
    expect(keys[1]).toBe('2026-11-01T07:00:00Z');
    expect(keys[24]).toBe('2026-11-02T06:00:00Z');
    expect(new Set(keys).size).toBe(25);
  });
});
