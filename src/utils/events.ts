import SunCalc from 'suncalc';
import type { Spot } from '../data/spots';

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

/**
 * Pick the next-occurring sunrise / sunset / stargazing instants for a spot.
 * Used both by `ScorePanel` (for card ordering) and by `useLiveScores` (to
 * decide which forecast hour to score against).
 */
export function getUpcomingEventTimes(spot: Spot): UpcomingEvents {
  const now = new Date();
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayTimes = SunCalc.getTimes(today, spot.lat, spot.lng);
  const tomorrowTimes = SunCalc.getTimes(tomorrow, spot.lat, spot.lng);

  const sunrise = todayTimes.sunrise > now ? todayTimes.sunrise : tomorrowTimes.sunrise;
  const sunset = todayTimes.sunset > now ? todayTimes.sunset : tomorrowTimes.sunset;

  const todayDusk = todayTimes.nauticalDusk;
  const todayStarEnd = new Date(todayDusk.getTime() + 3 * 60 * 60 * 1000);
  const stargazing = todayStarEnd > now ? todayDusk : tomorrowTimes.nauticalDusk;

  return { sunrise, sunset, stargazing };
}
