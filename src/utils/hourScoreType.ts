import SunCalc from 'suncalc';

export type TimeOfDayType = 'sunrise' | 'sunset' | 'stargazing' | 'now';

// SF centroid, matching OutlookBar.tsx
export const SF_LAT = 37.7649;
export const SF_LNG = -122.4494;

/**
 * Given an ISO hour key like "2025-06-18T20", return which score type
 * that hour falls into.
 *
 * Windows:
 * - sunrise: from 1h before sunrise to 1h after sunrise
 * - sunset: from 1h before sunset to 1h after sunset
 * - stargazing: from nauticalDusk to nauticalDawn
 * - now: everything else (daytime)
 */
export function getScoreTypeForHour(hourKey: string): TimeOfDayType {
  const date = new Date(`${hourKey}:00:00`);
  if (Number.isNaN(date.getTime())) return 'now';

  const times = SunCalc.getTimes(date, SF_LAT, SF_LNG);
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

export function getScoreTypesForHours(hourKeys: string[]): Map<string, TimeOfDayType> {
  const map = new Map<string, TimeOfDayType>();
  for (const key of hourKeys) {
    map.set(key, getScoreTypeForHour(key));
  }
  return map;
}
