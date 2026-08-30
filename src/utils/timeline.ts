import type { ViewMode } from './scoring';
import { resolveViewMode } from './events';
import type { HourlyForecast, SpotForecast } from './weather';

export const SCORE_CARD_ORDER = ['now', 'sunrise', 'sunset', 'stargazing'] as const;

declare const canonicalHourKeyBrand: unique symbol;
/** A forecast-hour identity. It always names an absolute UTC instant. */
export type CanonicalHourKey = string & { readonly [canonicalHourKeyBrand]: true };

export interface CityCalendarParts { year: number; month: number; day: number; hour: number }

const CANONICAL_HOUR_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00:00Z$/;
const LEGACY_WALL_HOUR_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/;
const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const displayTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const displayTimeZoneFormatters = new Map<string, Intl.DateTimeFormat>();
const displayDateFormatters = new Map<string, Intl.DateTimeFormat>();
const forecastIndexCache = new WeakMap<SpotForecast, Array<{ key: string; instantMs: number }>>();

function validCalendarParts(match: RegExpExecArray | null): CityCalendarParts | null {
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]) };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31 || parts.hour > 23) return null;
  return parts;
}

/** Format an instant as the fixed-width canonical UTC forecast key. */
export function formatCanonicalHourKey(date: Date): CanonicalHourKey {
  if (Number.isNaN(date.getTime())) throw new RangeError('Cannot format an invalid forecast instant');
  return `${date.toISOString().slice(0, 13)}:00:00Z` as CanonicalHourKey;
}

/** Strictly parse a canonical key. Legacy city-local wall times are rejected. */
export function parseCanonicalHourKey(value: string): Date | null {
  if (!validCalendarParts(CANONICAL_HOUR_PATTERN.exec(value))) return null;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && formatCanonicalHourKey(date) === value ? date : null;
}

export function isCanonicalHourKey(value: string | null): value is CanonicalHourKey {
  return value !== null && parseCanonicalHourKey(value) !== null;
}

/** City-local calendar parts for an instant, independent of the device zone. */
export function cityCalendarParts(date: Date, timeZone: string): CityCalendarParts {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    });
    partsFormatters.set(timeZone, formatter);
  }
  const formatted = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(formatted.find((p) => p.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour') };
}

export function formatCityCalendarDate(date: Date, timeZone: string): string {
  const p = cityCalendarParts(date, timeZone);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function formatLegacyWallHour(date: Date, timeZone: string): string {
  const p = cityCalendarParts(date, timeZone);
  return `${formatCityCalendarDate(date, timeZone)}T${String(p.hour).padStart(2, '0')}`;
}

/** Resolve an old wall-clock link only when it identifies exactly one instant. */
export function resolveLegacyWallClockHour(legacyHour: string, availableKeys: readonly string[], timeZone: string): CanonicalHourKey | null {
  if (!validCalendarParts(LEGACY_WALL_HOUR_PATTERN.exec(legacyHour))) return null;
  const matches = availableKeys.filter(isCanonicalHourKey).filter((key) => {
    const instant = parseCanonicalHourKey(key);
    return instant !== null && formatLegacyWallHour(instant, timeZone) === legacyHour;
  }).sort();
  return matches.length === 1 ? matches[0] as CanonicalHourKey : null;
}

/** Add calendar days in a city without assuming every local day is 24 hours. */
export function addCityCalendarDays(date: Date, timeZone: string, days: number): string {
  const parts = cityCalendarParts(date, timeZone);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return `${String(shifted.getUTCFullYear()).padStart(4, '0')}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function displayTimeFormatter(timeZone: string, includeZone: boolean): Intl.DateTimeFormat {
  const cache = includeZone ? displayTimeZoneFormatters : displayTimeFormatters;
  let formatter = cache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
      ...(includeZone ? { timeZoneName: 'short' as const } : {}),
    });
    cache.set(timeZone, formatter);
  }
  return formatter;
}

function displayDateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = displayDateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' });
    displayDateFormatters.set(timeZone, formatter);
  }
  return formatter;
}

export function formatCanonicalHourLabel(hourKey: string, timeZone: string, options: { includeZone?: boolean } = {}): string {
  const instant = parseCanonicalHourKey(hourKey);
  return instant ? displayTimeFormatter(timeZone, options.includeZone ?? false).format(instant) : hourKey;
}

/** Detect a repeated city-local hour from neighboring real instants. */
export function isRepeatedLocalHourInstant(instant: Date, timeZone: string): boolean {
  if (Number.isNaN(instant.getTime())) return false;
  const wall = formatLegacyWallHour(instant, timeZone);
  return [-3_600_000, 3_600_000].some((delta) =>
    formatLegacyWallHour(new Date(instant.getTime() + delta), timeZone) === wall,
  );
}

export function isRepeatedLocalHourKey(hourKey: string, timeZone: string): boolean {
  const instant = parseCanonicalHourKey(hourKey);
  return instant !== null && isRepeatedLocalHourInstant(instant, timeZone);
}

export function formatInstantTimeLabel(
  instant: Date,
  timeZone: string,
  includeZone = isRepeatedLocalHourInstant(instant, timeZone),
): string {
  return displayTimeFormatter(timeZone, includeZone).format(instant);
}

function forecastTimeIndex(forecast: SpotForecast): Array<{ key: string; instantMs: number }> {
  const cached = forecastIndexCache.get(forecast);
  if (cached) return cached;
  const index = Object.keys(forecast.hours).flatMap((key) => {
    const instant = parseCanonicalHourKey(key);
    return instant ? [{ key, instantMs: instant.getTime() }] : [];
  });
  forecastIndexCache.set(forecast, index);
  return index;
}

/** Find the closest forecast slice by absolute instant. */
export function nearestForecastAtCityInstant(forecast: SpotForecast, instant: Date): HourlyForecast | null {
  const exact = forecast.hours[formatCanonicalHourKey(instant)];
  if (exact) return exact;
  let nearestKey = '';
  let nearestDiff = Infinity;
  for (const entry of forecastTimeIndex(forecast)) {
    const diff = Math.abs(entry.instantMs - instant.getTime());
    if (diff < nearestDiff) { nearestKey = entry.key; nearestDiff = diff; }
  }
  return nearestKey ? forecast.hours[nearestKey] : null;
}

const VIEW_MODE_NAMES: Record<ViewMode, string> = { now: 'Now', sunrise: 'Sunrise', sunset: 'Sunset', stargazing: 'Stargazing' };

export function formatActiveTimelineLabel(hourKey: string, viewMode: ViewMode, timeZone: string, now: Date): string {
  if (hourKey === '') {
    return isRepeatedLocalHourInstant(now, timeZone)
      ? `Right now · ${formatInstantTimeLabel(now, timeZone)}`
      : 'Right now';
  }
  const instant = parseCanonicalHourKey(hourKey);
  if (!instant) return `${VIEW_MODE_NAMES[viewMode]} · selected hour unavailable`;
  const selectedDate = formatCityCalendarDate(instant, timeZone);
  const todayDate = formatCityCalendarDate(now, timeZone);
  const tomorrowDate = addCityCalendarDays(now, timeZone, 1);
  const dateLabel = selectedDate === todayDate ? 'Today' : selectedDate === tomorrowDate ? 'Tomorrow' : displayDateFormatter(timeZone).format(instant);
  return `${VIEW_MODE_NAMES[viewMode]} · ${dateLabel} at ${displayTimeFormatter(timeZone, isRepeatedLocalHourInstant(instant, timeZone)).format(instant)}`;
}

export function describeActiveForecastTrust(activeStates: readonly boolean[]): string {
  if (activeStates.length === 0) return 'No visible scores';
  const count = activeStates.filter(Boolean).length;
  if (count === activeStates.length) return 'Forecast-backed scores';
  if (count === 0) return 'Curated estimates';
  return 'Mix of forecast-backed scores and curated estimates';
}

export function normalizeTimelineHourKey(requestedKey: string, availableHourKeys: readonly string[]): string {
  if (requestedKey === '') return '';
  return isCanonicalHourKey(requestedKey) && availableHourKeys.includes(requestedKey) ? requestedKey : '';
}

export function hasExactTimelineHour(hourKey: string, availableHourKeys: readonly string[]): boolean {
  return isCanonicalHourKey(hourKey) && availableHourKeys.includes(hourKey);
}

export function deriveSpotTimelineHourKeys(availableHourKeys: readonly string[], now: Date): string[] {
  const currentKey = formatCanonicalHourKey(now);
  return [...new Set(availableHourKeys)].filter(isCanonicalHourKey).filter((key) => key > currentKey).sort().slice(0, 24);
}

export function viewModeForHourKey(hourKey: string, _timeZone: string, lat: number, lng: number, now: Date): ViewMode {
  const selectedInstant = hourKey === '' ? now : parseCanonicalHourKey(hourKey);
  return resolveViewMode(selectedInstant ?? now, lat, lng);
}
