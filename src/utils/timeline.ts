import type { ViewMode } from './scoring';
import { resolveViewMode, type UpcomingEvents } from './events';
import type { HourlyForecast, SpotForecast } from './weather';

export const SCORE_CARD_ORDER = ['now', 'sunrise', 'sunset', 'stargazing'] as const;
export type ForecastRange = '24h' | '7d';
export const FORECAST_RANGE_HOURS: Record<ForecastRange, number> = { '24h': 24, '7d': 168 };
export const FORECAST_RANGE_STORAGE_KEY = 'sky:forecastRange';

/** Hourly night scores and an explicitly chosen stargazing event have distinct labels. */
export function timelineScoreLabel(viewMode: ViewMode, selectedView: ViewMode): string {
  if (selectedView === 'now') {
    if (viewMode === 'now') return 'Daytime';
    if (viewMode === 'stargazing') return 'Nighttime';
  }
  const mode = selectedView === 'now' ? viewMode : selectedView;
  return mode === 'sunrise' ? 'Sunrise' : mode === 'sunset' ? 'Sunset' : 'Stargazing';
}

export function parseForecastRange(value: string | null): ForecastRange {
  return value === '7d' ? '7d' : '24h';
}

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

export function cityDayStart(reference: Date, timeZone: string, offsetDays = 0): Date {
  const parts = cityCalendarParts(reference, timeZone);
  const target = Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays);
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = cityCalendarParts(new Date(instant), timeZone);
    instant += target - Date.UTC(local.year, local.month - 1, local.day, local.hour);
  }
  return new Date(instant);
}

export function forecastRangeWindow(now: Date, range: ForecastRange, timeZone: string): { start: Date; end: Date } {
  return range === '7d'
    ? { start: cityDayStart(now, timeZone, 1), end: cityDayStart(now, timeZone, 8) }
    : { start: now, end: new Date(now.getTime() + 24 * 3_600_000) };
}

export function rangeStartHourKey(now: Date, range: ForecastRange, timeZone: string): string {
  return range === '7d' ? formatCanonicalHourKey(forecastRangeWindow(now, range, timeZone).start) : '';
}

export function deriveSpotTimelineHourKeys(availableHourKeys: readonly string[], now: Date, range: ForecastRange = '24h', timeZone = 'UTC'): string[] {
  const currentKey = formatCanonicalHourKey(now);
  const { start, end } = forecastRangeWindow(now, range, timeZone);
  return [...new Set(availableHourKeys)].filter(isCanonicalHourKey)
    .filter((key) => range === '7d'
      ? Date.parse(key) >= start.getTime() && Date.parse(key) < end.getTime()
      : key > currentKey && Date.parse(key) <= end.getTime()).sort();
}

/** A fixed elapsed-time rail remains truthful when forecast hours are missing. */
export function buildForecastRangeHourKeys(now: Date, range: ForecastRange, timeZone = 'UTC'): string[] {
  if (range === '24h') {
    const firstMs = Date.parse(formatCanonicalHourKey(now)) + 3_600_000;
    return Array.from({ length: 24 }, (_, index) => formatCanonicalHourKey(new Date(firstMs + index * 3_600_000)));
  }
  const { start, end } = forecastRangeWindow(now, range, timeZone);
  const keys: string[] = [];
  for (let instantMs = start.getTime(); instantMs < end.getTime(); instantMs += 3_600_000) {
    keys.push(formatCanonicalHourKey(new Date(instantMs)));
  }
  return keys;
}

export function viewModeForHourKey(hourKey: string, _timeZone: string, lat: number, lng: number, now: Date): ViewMode {
  const selectedInstant = hourKey === '' ? now : parseCanonicalHourKey(hourKey);
  return resolveViewMode(selectedInstant ?? now, lat, lng);
}

export interface TimelineStop {
  view: ViewMode;
  instantMs: number;
  hourKey: string;
}

/** Hours and sky events share one absolute-time scale, including tonight's dusk. */
export function buildTimelineStops(hourKeys: readonly string[], now: Date, events: UpcomingEvents | readonly UpcomingEvents[], includeNow = true): TimelineStop[] {
  const stops: TimelineStop[] = includeNow ? [{ view: 'now', instantMs: now.getTime(), hourKey: '' }] : [];
  for (const key of hourKeys) {
    const instant = parseCanonicalHourKey(key);
    if (instant && (includeNow ? instant > now : instant >= now)) stops.push({ view: 'now', instantMs: instant.getTime(), hourKey: key });
  }
  if (stops.length === 0) stops.push({ view: 'now', instantMs: now.getTime(), hourKey: formatCanonicalHourKey(now) });
  const days: readonly UpcomingEvents[] = Array.isArray(events) ? events : [events as UpcomingEvents];
  const endMs = Math.max(now.getTime(), ...stops.map((stop) => stop.instantMs));
  for (const day of days) {
    for (const view of ['sunrise', 'sunset', 'stargazing'] as const) {
      const instantMs = day[view].getTime();
      const withinRange = !Array.isArray(events) || (instantMs >= now.getTime() && instantMs <= endMs);
      if (Number.isFinite(instantMs) && withinRange) stops.push({ view, instantMs, hourKey: '' });
    }
  }
  // An exact event replaces its coincident hourly stop, while live Now stays reachable.
  const eventInstants = new Set(stops.filter((stop) => stop.view !== 'now').map((stop) => stop.instantMs));
  return stops.filter((stop) => !stop.hourKey || !eventInstants.has(stop.instantMs))
    .sort((a, b) => a.instantMs - b.instantMs);
}

export function timelinePositionPct(instantMs: number, stops: readonly TimelineStop[]): number {
  if (stops.length < 2) return 0;
  const start = stops[0].instantMs;
  const span = stops[stops.length - 1].instantMs - start;
  return span > 0 ? Math.max(0, Math.min(100, (instantMs - start) / span * 100)) : 0;
}

export function nearestTimelineStopIndex(percent: number, stops: readonly TimelineStop[]): number {
  const target = stops[0]?.instantMs + Math.max(0, Math.min(100, percent)) / 100 *
    ((stops[stops.length - 1]?.instantMs ?? 0) - (stops[0]?.instantMs ?? 0));
  let closest = 0;
  for (let index = 1; index < stops.length; index += 1) {
    if (Math.abs(stops[index].instantMs - target) < Math.abs(stops[closest].instantMs - target)) closest = index;
  }
  return closest;
}
