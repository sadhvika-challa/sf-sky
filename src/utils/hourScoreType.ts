import SunCalc from 'suncalc';
import { parseCanonicalHourKey } from './timeline';

export type TimeOfDayType = 'sunrise' | 'sunset' | 'stargazing' | 'now';

// SF centroid, matching OutlookBar.tsx
export const SF_LAT = 37.7649;
export const SF_LNG = -122.4494;

/**
 * Given a canonical UTC hour key like "2025-06-19T03:00:00Z", return which score type
 * that hour falls into.
 *
 * Windows:
 * - sunrise: from 1h before sunrise to 1h after sunrise
 * - sunset: from 1h before sunset to 1h after sunset
 * - stargazing: from nauticalDusk to nauticalDawn
 * - now: everything else (daytime)
 */
export function getScoreTypeForHour(hourKey: string, lat = SF_LAT, lng = SF_LNG): TimeOfDayType {
  const date = parseCanonicalHourKey(hourKey);
  if (!date) return 'now';

  const times = SunCalc.getTimes(date, lat, lng);
  const hour = date.getTime();

  const sunriseMs = times.sunrise.getTime();
  const sunsetMs = times.sunset.getTime();
  const duskMs = times.nauticalDusk.getTime();
  const dawnMs = times.nauticalDawn.getTime();

  const ONE_HOUR = 60 * 60 * 1000;

  // Check sunrise window: 1h before to 1h after
  if (hour >= sunriseMs - ONE_HOUR && hour <= sunriseMs + ONE_HOUR) return 'sunrise';

  // Check sunset window: 1h before to 1h after
  if (hour >= sunsetMs - ONE_HOUR && hour <= sunsetMs + ONE_HOUR) return 'sunset';

  // Check stargazing: between nautical dusk and nautical dawn
  // Handle overnight: if dusk > dawn, it means dawn is tomorrow
  if (duskMs < dawnMs) {
    if (hour >= duskMs || hour <= dawnMs) return 'stargazing';
  } else {
    if (hour >= duskMs && hour <= dawnMs) return 'stargazing';
  }

  return 'now';
}

export function getScoreTypesForHours(hourKeys: string[], lat = SF_LAT, lng = SF_LNG): Map<string, TimeOfDayType> {
  const map = new Map<string, TimeOfDayType>();
  for (const key of hourKeys) {
    map.set(key, getScoreTypeForHour(key, lat, lng));
  }
  return map;
}
