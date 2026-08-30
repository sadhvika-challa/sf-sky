import type { ViewMode } from './scoring';
import { resolveViewMode } from './events';
import type { HourlyForecast, SpotForecast } from './weather';

export const SCORE_CARD_ORDER = ['now', 'sunrise', 'sunset', 'stargazing'] as const;

const HOUR_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/;
const hourKeyFormatters = new Map<string, Intl.DateTimeFormat>();
const displayTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const displayDateFormatters = new Map<string, Intl.DateTimeFormat>();
const forecastIndexCache = new WeakMap<SpotForecast, Map<string, ForecastIndexEntry[]>>();

interface ForecastIndexEntry {
  key: string;
  instantMs: number;
}

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
  let formatter = hourKeyFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    hourKeyFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
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
  // Open-Meteo keys omit an offset. During the repeated fall-back hour, the
  // same key can represent two instants, so this parser deterministically
  // selects one but cannot recover which occurrence the source intended.
  // Reject nonexistent local hours during the spring daylight-saving jump.
  return sameParts(zonedParts(result, timeZone), parts) ? result : null;
}

/** Format an instant using the same city-local key shape as SpotForecast.hours. */
export function formatHourKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}`;
}

function displayTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = displayTimeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    displayTimeFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function displayDateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = displayDateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
    });
    displayDateFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function forecastTimeIndex(forecast: SpotForecast, timeZone: string): ForecastIndexEntry[] {
  let byTimeZone = forecastIndexCache.get(forecast);
  if (!byTimeZone) {
    byTimeZone = new Map();
    forecastIndexCache.set(forecast, byTimeZone);
  }
  const cached = byTimeZone.get(timeZone);
  if (cached) return cached;
  const index: ForecastIndexEntry[] = [];
  for (const key of Object.keys(forecast.hours)) {
    const instant = parseHourKeyInTimeZone(key, timeZone);
    if (instant) index.push({ key, instantMs: instant.getTime() });
  }
  byTimeZone.set(timeZone, index);
  return index;
}

/** Find the closest forecast slice using city-local hour keys. */
export function nearestForecastAtCityInstant(
  forecast: SpotForecast,
  instant: Date,
  timeZone: string,
): HourlyForecast | null {
  const exact = forecast.hours[formatHourKeyInTimeZone(instant, timeZone)];
  if (exact) return exact;
  let nearestKey = '';
  let nearestDiff = Infinity;
  for (const entry of forecastTimeIndex(forecast, timeZone)) {
    const diff = Math.abs(entry.instantMs - instant.getTime());
    if (diff < nearestDiff) {
      nearestKey = entry.key;
      nearestDiff = diff;
    }
  }
  return nearestKey ? forecast.hours[nearestKey] : null;
}

const VIEW_MODE_NAMES: Record<ViewMode, string> = {
  now: 'Now',
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  stargazing: 'Stargazing',
};

/** Shared truthful label for search results scored at the active timeline hour. */
export function formatActiveTimelineLabel(
  hourKey: string,
  viewMode: ViewMode,
  timeZone: string,
  now: Date,
): string {
  if (hourKey === '') return 'Right now';
  const instant = parseHourKeyInTimeZone(hourKey, timeZone);
  if (!instant) return `${VIEW_MODE_NAMES[viewMode]} · selected hour unavailable`;
  const selectedDate = hourKey.slice(0, 10);
  const todayDate = formatHourKeyInTimeZone(now, timeZone).slice(0, 10);
  const tomorrowDate = formatHourKeyInTimeZone(
    new Date(now.getTime() + 24 * 60 * 60 * 1000),
    timeZone,
  ).slice(0, 10);
  const dateLabel = selectedDate === todayDate
    ? 'Today'
    : selectedDate === tomorrowDate
      ? 'Tomorrow'
      : displayDateFormatter(timeZone).format(instant);
  return `${VIEW_MODE_NAMES[viewMode]} · ${dateLabel} at ${displayTimeFormatter(timeZone).format(instant)}`;
}

export function describeActiveForecastTrust(activeStates: readonly boolean[]): string {
  if (activeStates.length === 0) return 'No visible scores';
  const forecastCount = activeStates.filter(Boolean).length;
  if (forecastCount === activeStates.length) return 'Forecast-backed scores';
  if (forecastCount === 0) return 'Curated estimates';
  return 'Mix of forecast-backed scores and curated estimates';
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
