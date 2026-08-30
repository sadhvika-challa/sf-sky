import type { ViewMode } from './scoring';
import { resolveViewMode } from './events';

export const SCORE_CARD_ORDER = ['now', 'sunrise', 'sunset', 'stargazing'] as const;

const HOUR_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/;

interface HourKeyParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}
function readHourKeyParts(hourKey: string): HourKeyParts | null {
  const match = HOUR_KEY_PATTERN.exec(hourKey);
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
  };
  if (
    parts.month < 1 || parts.month > 12 ||
    parts.day < 1 || parts.day > 31 ||
    parts.hour < 0 || parts.hour > 23
  ) {
    return null;
  }
  return parts;
}

function zonedParts(date: Date, timeZone: string): HourKeyParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
  };
}

function sameParts(left: HourKeyParts, right: HourKeyParts): boolean {
  return left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour;
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour);
  const inputAtHour = Math.floor(date.getTime() / 3_600_000) * 3_600_000;
  return representedAsUtc - inputAtHour;
}

/** Parse an Open-Meteo wall-clock hour in its city's IANA time zone. */
export function parseHourKeyInTimeZone(hourKey: string, timeZone: string): Date | null {
  const parts = readHourKeyParts(hourKey);
  if (!parts) return null;
  const wallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour);
  let instantMs = wallClockAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = timeZoneOffsetMs(new Date(instantMs), timeZone);
    const next = wallClockAsUtc - offset;
    if (next === instantMs) break;
    instantMs = next;
  }
  const result = new Date(instantMs);
  // Reject nonexistent local hours during the spring daylight-saving jump.
  return sameParts(zonedParts(result, timeZone), parts) ? result : null;
}

/** Format an instant using the same city-local key shape as SpotForecast.hours. */
export function formatHourKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}`;
}

/** Preserve '' as the canonical live state and reject unavailable forecast keys. */
export function normalizeTimelineHourKey(
  requestedKey: string,
  availableHourKeys: readonly string[],
): string {
  if (requestedKey === '') return '';
  return availableHourKeys.includes(requestedKey) ? requestedKey : '';
}

export function hasExactTimelineHour(
  hourKey: string,
  availableHourKeys: readonly string[],
): boolean {
  return hourKey !== '' && availableHourKeys.includes(hourKey);
}

/** Return at most 24 future exact-hour keys after the city's current hour. */
export function deriveSpotTimelineHourKeys(
  availableHourKeys: readonly string[],
  now: Date,
  timeZone: string,
): string[] {
  const currentKey = formatHourKeyInTimeZone(now, timeZone);
  return [...new Set(availableHourKeys)]
    .filter((key) => readHourKeyParts(key) !== null && key > currentKey)
    .sort()
    .slice(0, 24);
}

export function viewModeForHourKey(
  hourKey: string,
  timeZone: string,
  lat: number,
  lng: number,
  now: Date,
): ViewMode {
  const selectedInstant = hourKey === '' ? now : parseHourKeyInTimeZone(hourKey, timeZone);
  return resolveViewMode(selectedInstant ?? now, lat, lng);
}
