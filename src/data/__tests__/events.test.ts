import { describe, expect, it } from 'vitest';
import { getActiveEvents, getEventsAtHour, getTodaysEvents } from '../events';

describe('curated event city scope', () => {
  const eventNight = new Date(2026, 7, 30, 21, 0, 0);

  it('returns San Francisco events only for San Francisco', () => {
    expect(getTodaysEvents(eventNight, 'sf').length).toBeGreaterThan(0);
    expect(getEventsAtHour(eventNight, 'sf').length).toBeGreaterThan(0);
    expect(getActiveEvents(eventNight, 'sf').length).toBeGreaterThan(0);
  });

  it.each(['austin', 'santa-cruz'] as const)(
    'does not leak San Francisco events into %s',
    (city) => {
      expect(getTodaysEvents(eventNight, city)).toEqual([]);
      expect(getEventsAtHour(eventNight, city)).toEqual([]);
      expect(getActiveEvents(eventNight, city)).toEqual([]);
    },
  );
});
