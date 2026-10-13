import SunCalc from 'suncalc';
import type { Spot } from '../data/spots';
import type { ViewMode } from './scoring';

export interface UpcomingEvents {
  /** Next sunrise instant (today's if it hasn't happened, otherwise tomorrow's). */
  sunrise: Date;
  /** Next sunset instant. */
  sunset: Date;
  /**
   * Next stargazing instant — `nauticalDusk` of the relevant evening, treating
   * "tonight" as still valid for ~3h after dusk to match `getNextEvents` in
   * `ScorePanel`.
   */
  stargazing: Date;
}

export interface EventTimes {
  sunrise: Date;
  sunset: Date;
  dusk: Date;
  /** Percentage positions on the 24h rail for each event. */
  sunrisePct: number;
  sunsetPct: number;
  duskPct: number;
}

const WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const calendarFormatters = new Map<string, Intl.DateTimeFormat>();

/** Resolve a city's calendar date at local noon, independently of the device zone. */
function cityNoon(reference: Date, timeZone: string, offsetDays = 0): Date {
  let formatter = calendarFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23',
    });
    calendarFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(reference);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const calendarNoon = Date.UTC(read('year'), read('month') - 1, read('day') + offsetDays, 12);
  let instant = calendarNoon;
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = formatter.formatToParts(new Date(instant));
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(local.find((part) => part.type === type)?.value);
    const wall = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'));
    instant += calendarNoon - wall;
  }
  return new Date(instant);
}

export function getEventsForDate(spot: Pick<Spot, 'lat' | 'lng'>, reference: Date, timeZone: string): UpcomingEvents {
  const times = SunCalc.getTimes(cityNoon(reference, timeZone), spot.lat, spot.lng);
  return { sunrise: times.sunrise, sunset: times.sunset, stargazing: times.nauticalDusk };
}

/** Include the partial final calendar day of a rolling seven-day forecast. */
export function getTimelineEventDays(spot: Pick<Spot, 'lat' | 'lng'>, now: Date, timeZone: string): UpcomingEvents[] {
  return Array.from({ length: 8 }, (_, offset) => getEventsForDate(spot, cityNoon(now, timeZone, offset), timeZone));
}

/**
 * Compute event times and their percentage positions within a 24-hour window
 * starting at `anchorNow`. Used by the UnifiedTimeline to position markers
 * and color zones.
 */
export function computeEventTimes(anchorNow: Date, lat: number, lng: number): EventTimes {
  const windowMs = 24 * 60 * 60 * 1000;
  const windowEnd = anchorNow.getTime() + windowMs;

  const today = new Date(anchorNow);
  const tomorrow = new Date(anchorNow.getTime() + 24 * 60 * 60 * 1000);
  const dayAfter = new Date(anchorNow.getTime() + 48 * 60 * 60 * 1000);

  const todayTimes = SunCalc.getTimes(today, lat, lng);
  const tomorrowTimes = SunCalc.getTimes(tomorrow, lat, lng);
  const dayAfterTimes = SunCalc.getTimes(dayAfter, lat, lng);

  const allSunrises = [todayTimes.sunrise, tomorrowTimes.sunrise, dayAfterTimes.sunrise];
  const allSunsets = [todayTimes.sunset, tomorrowTimes.sunset, dayAfterTimes.sunset];
  const allDusks = [todayTimes.nauticalDusk, tomorrowTimes.nauticalDusk, dayAfterTimes.nauticalDusk];
  const pickNext = (candidates: Date[]): Date => {
    for (const c of candidates) {
      if (!Number.isNaN(c.getTime()) && c.getTime() > anchorNow.getTime() && c.getTime() <= windowEnd) {
        return c;
      }
    }
    return candidates[1] ?? candidates[0];
  };

  const sunrise = pickNext(allSunrises);
  const sunset = pickNext(allSunsets);
  const dusk = pickNext(allDusks);

  const toPct = (d: Date): number => {
    const elapsed = d.getTime() - anchorNow.getTime();
    return Math.max(0, Math.min(100, (elapsed / windowMs) * 100));
  };

  return {
    sunrise,
    sunset,
    dusk,
    sunrisePct: toPct(sunrise),
    sunsetPct: toPct(sunset),
    duskPct: toPct(dusk),
  };
}

/**
 * Given a scrubbed time and a location, determine which ViewMode applies.
 * Uses ±30 min windows around sunrise/sunset, and a stargazing window from
 * max(nauticalDusk, sunset+30min) to sunrise-30min of the next morning.
 */
export function resolveViewMode(scrubbedTime: Date, lat: number, lng: number): ViewMode {
  const t = scrubbedTime.getTime();

  const day = new Date(scrubbedTime);
  const nextDay = new Date(scrubbedTime.getTime() + 24 * 60 * 60 * 1000);
  const prevDay = new Date(scrubbedTime.getTime() - 24 * 60 * 60 * 1000);

  const times = SunCalc.getTimes(day, lat, lng);
  const nextTimes = SunCalc.getTimes(nextDay, lat, lng);
  const prevTimes = SunCalc.getTimes(prevDay, lat, lng);

  const sunrises = [prevTimes.sunrise, times.sunrise, nextTimes.sunrise].filter(
    (d) => !Number.isNaN(d.getTime()),
  );
  const sunsets = [prevTimes.sunset, times.sunset, nextTimes.sunset].filter(
    (d) => !Number.isNaN(d.getTime()),
  );
  const dusks = [prevTimes.nauticalDusk, times.nauticalDusk, nextTimes.nauticalDusk].filter(
    (d) => !Number.isNaN(d.getTime()),
  );

  for (const sr of sunrises) {
    if (Math.abs(t - sr.getTime()) <= WINDOW_MS) return 'sunrise';
  }

  for (const ss of sunsets) {
    if (Math.abs(t - ss.getTime()) <= WINDOW_MS) return 'sunset';
  }

  // Stargazing: from max(dusk, sunset+30min) to next sunrise - 30min.
  // Check each dusk/sunset/next-sunrise triple.
  for (let i = 0; i < dusks.length; i++) {
    const dusk = dusks[i];
    const correspondingSunset = sunsets.find(
      (ss) => ss.getTime() <= dusk.getTime() && dusk.getTime() - ss.getTime() < 6 * 60 * 60 * 1000,
    );
    const starStart = Math.max(
      dusk.getTime(),
      correspondingSunset ? correspondingSunset.getTime() + WINDOW_MS : dusk.getTime(),
    );
    const nextSunrise = sunrises.find((sr) => sr.getTime() > starStart);
    const starEnd = nextSunrise
      ? nextSunrise.getTime() - WINDOW_MS
      : starStart + 8 * 60 * 60 * 1000;

    if (t >= starStart && t <= starEnd) return 'stargazing';
  }

  return 'now';
}

/**
 * Pick the next-occurring sunrise / sunset / stargazing instants for a spot.
 * Used both by `ScorePanel` (for card ordering) and by `useLiveScores` (to
 * decide which forecast hour to score against).
 */
export function getUpcomingEventTimes(spot: Spot, now: Date, timeZone?: string): UpcomingEvents {
  const today = new Date(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayTimes = SunCalc.getTimes(timeZone ? cityNoon(now, timeZone) : today, spot.lat, spot.lng);
  const tomorrowTimes = SunCalc.getTimes(timeZone ? cityNoon(now, timeZone, 1) : tomorrow, spot.lat, spot.lng);

  const sunrise = todayTimes.sunrise > now ? todayTimes.sunrise : tomorrowTimes.sunrise;
  const sunset = todayTimes.sunset > now ? todayTimes.sunset : tomorrowTimes.sunset;

  const todayDusk = todayTimes.nauticalDusk;
  const todayStarEnd = new Date(todayDusk.getTime() + 3 * 60 * 60 * 1000);
  const stargazing = todayStarEnd > now ? todayDusk : tomorrowTimes.nauticalDusk;

  return { sunrise, sunset, stargazing };
}
