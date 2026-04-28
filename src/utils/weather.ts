// Open-Meteo client for SF Sky.
// Fetches an hourly weather + air-quality forecast for a given lat/lng and
// caches it in sessionStorage with a 30-minute TTL so we don't hammer the API
// while the user pans around.

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const CACHE_TTL_MS = 30 * 60 * 1000;
// Bump the version whenever the shape of HourlyForecast changes so we don't
// hand stale entries (missing fields) to consumers after a deploy.
const CACHE_PREFIX = 'weather:v3:';

export interface HourlyForecast {
  /** Total cloud cover, 0-100. */
  cloud: number;
  /** Low-altitude cloud cover, 0-100. */
  cloudLow: number;
  /** Mid-altitude cloud cover, 0-100. */
  cloudMid: number;
  /** High-altitude cloud cover, 0-100. */
  cloudHigh: number;
  /** Visibility in kilometers. */
  visibilityKm: number;
  /** Relative humidity, 0-100. */
  humidity: number;
  /** Temperature in degrees Fahrenheit. */
  tempF: number;
  /** Precipitation probability, 0-100 (may be 0 if not provided). */
  precipProb: number;
  /** PM2.5 concentration in µg/m³ (NaN if unavailable). */
  pm25: number;
  /** US AQI value (NaN if unavailable). */
  aqi: number;
  /** Wind speed in mph at 10m. */
  windMph: number;
  /** Peak wind gust speed in mph at 10m (NaN if not provided). */
  gustMph: number;
  /** Wind direction in degrees (meteorological: 0 = from N, 90 = from E). */
  windDir: number;
}

export interface SpotForecast {
  /** ISO hour key (YYYY-MM-DDTHH) -> hourly forecast slice. */
  hours: Record<string, HourlyForecast>;
  /** Wall-clock fetch time, ms since epoch. */
  fetchedAt: number;
}

interface CachedEntry {
  forecast: SpotForecast;
  expiresAt: number;
}

const inflight = new Map<string, Promise<SpotForecast>>();

function cacheKey(lat: number, lng: number): string {
  return `${CACHE_PREFIX}${lat.toFixed(3)}:${lng.toFixed(3)}`;
}

function readCache(key: string): SpotForecast | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (parsed.expiresAt < Date.now()) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.forecast;
  } catch {
    return null;
  }
}

function writeCache(key: string, forecast: SpotForecast): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const entry: CachedEntry = { forecast, expiresAt: Date.now() + CACHE_TTL_MS };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Quota exceeded or storage disabled — ignore, we'll just refetch.
  }
}

/**
 * Build the ISO hour key used to index `SpotForecast.hours`.
 * Open-Meteo with `timezone=auto` returns local-time strings like
 * "2026-04-18T19:00", so we format the date in the same shape using local time.
 */
function isoHourKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}`;
}

interface OpenMeteoForecastResponse {
  hourly?: {
    time?: string[];
    cloud_cover?: number[];
    cloud_cover_low?: number[];
    cloud_cover_mid?: number[];
    cloud_cover_high?: number[];
    visibility?: number[];
    relative_humidity_2m?: number[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
    wind_speed_10m?: number[];
    wind_gusts_10m?: number[];
    wind_direction_10m?: number[];
  };
}

interface OpenMeteoAirQualityResponse {
  hourly?: {
    time?: string[];
    pm2_5?: number[];
    us_aqi?: number[];
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return (await res.json()) as T;
}

function buildForecastUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    hourly: [
      'cloud_cover',
      'cloud_cover_low',
      'cloud_cover_mid',
      'cloud_cover_high',
      'visibility',
      'relative_humidity_2m',
      'temperature_2m',
      'precipitation_probability',
      'wind_speed_10m',
      'wind_gusts_10m',
      'wind_direction_10m',
    ].join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto',
    forecast_days: '3',
  });
  return `${FORECAST_URL}?${params.toString()}`;
}

function buildAirQualityUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    hourly: ['pm2_5', 'us_aqi'].join(','),
    timezone: 'auto',
    forecast_days: '3',
  });
  return `${AIR_QUALITY_URL}?${params.toString()}`;
}

function pick(arr: number[] | undefined, i: number): number {
  if (!arr || i < 0 || i >= arr.length) return NaN;
  const v = arr[i];
  return typeof v === 'number' ? v : NaN;
}

function hourKeyFromOpenMeteo(time: string): string {
  // Open-Meteo returns "YYYY-MM-DDTHH:MM"; truncate to "YYYY-MM-DDTHH".
  return time.length >= 13 ? time.slice(0, 13) : time;
}

function mergeResponses(
  forecast: OpenMeteoForecastResponse,
  air: OpenMeteoAirQualityResponse | null,
): SpotForecast {
  const hours: Record<string, HourlyForecast> = {};
  const times = forecast.hourly?.time ?? [];

  // Build an index of AQI hour -> array position for O(n) merging.
  const aqiIndex = new Map<string, number>();
  const aqiTimes = air?.hourly?.time ?? [];
  for (let i = 0; i < aqiTimes.length; i++) {
    aqiIndex.set(hourKeyFromOpenMeteo(aqiTimes[i]), i);
  }

  for (let i = 0; i < times.length; i++) {
    const key = hourKeyFromOpenMeteo(times[i]);
    const visibilityMeters = pick(forecast.hourly?.visibility, i);
    const aqiI = aqiIndex.get(key);

    hours[key] = {
      cloud: pick(forecast.hourly?.cloud_cover, i),
      cloudLow: pick(forecast.hourly?.cloud_cover_low, i),
      cloudMid: pick(forecast.hourly?.cloud_cover_mid, i),
      cloudHigh: pick(forecast.hourly?.cloud_cover_high, i),
      visibilityKm: Number.isFinite(visibilityMeters) ? visibilityMeters / 1000 : NaN,
      humidity: pick(forecast.hourly?.relative_humidity_2m, i),
      tempF: pick(forecast.hourly?.temperature_2m, i),
      precipProb: pick(forecast.hourly?.precipitation_probability, i),
      pm25: aqiI !== undefined ? pick(air?.hourly?.pm2_5, aqiI) : NaN,
      aqi: aqiI !== undefined ? pick(air?.hourly?.us_aqi, aqiI) : NaN,
      windMph: pick(forecast.hourly?.wind_speed_10m, i),
      gustMph: pick(forecast.hourly?.wind_gusts_10m, i),
      windDir: pick(forecast.hourly?.wind_direction_10m, i),
    };
  }

  return { hours, fetchedAt: Date.now() };
}

export async function fetchSpotForecast(lat: number, lng: number): Promise<SpotForecast> {
  const key = cacheKey(lat, lng);

  const cached = readCache(key);
  if (cached) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const [forecast, air] = await Promise.all([
      fetchJson<OpenMeteoForecastResponse>(buildForecastUrl(lat, lng)),
      // Air-quality endpoint occasionally fails or rate-limits separately;
      // don't let it block the main forecast.
      fetchJson<OpenMeteoAirQualityResponse>(buildAirQualityUrl(lat, lng)).catch(() => null),
    ]);
    const merged = mergeResponses(forecast, air);
    writeCache(key, merged);
    return merged;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

/**
 * Composite fog density (0..1) blending visibility, low-cloud cover, and
 * humidity. Open-Meteo doesn't surface a dedicated fog field, so we derive
 * one from the three signals that actually correlate with marine-layer fog
 * in SF:
 *   - visibility: dominant signal, low vis is the strongest tell
 *   - low cloud: stratus near the deck = Karl
 *   - humidity: close to saturation enables fog formation
 *
 * Tuned so a classic Karl-on-the-Sunset hour (vis ~1km, cloudLow ~95,
 * humidity ~98) lands ~0.85, and a clear south-side hour (vis 16km,
 * cloudLow 5, humidity 60) lands ~0.05.
 */
export function fogDensity(h: HourlyForecast): number {
  const visKm = Number.isFinite(h.visibilityKm) ? h.visibilityKm : 16;
  const cloudLow = Number.isFinite(h.cloudLow) ? h.cloudLow : 0;
  const humidity = Number.isFinite(h.humidity) ? h.humidity : 60;
  const visTerm = clamp01(1 - visKm / 10);
  const cloudTerm = clamp01(cloudLow / 100);
  const humTerm = clamp01((humidity - 70) / 25);
  return clamp01(visTerm * 0.5 + cloudTerm * 0.35 + humTerm * 0.15);
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Return the hourly slice nearest `when`. Falls back to the closest available
 * hour if the exact key isn't present (e.g. event date past the 3-day horizon).
 */
export function getForecastAt(forecast: SpotForecast, when: Date): HourlyForecast | null {
  const exactKey = isoHourKey(when);
  const exact = forecast.hours[exactKey];
  if (exact) return exact;

  const target = when.getTime();
  let best: { key: string; diff: number } | null = null;
  for (const key of Object.keys(forecast.hours)) {
    // Parse "YYYY-MM-DDTHH" as local time.
    const parsed = new Date(`${key}:00:00`);
    const diff = Math.abs(parsed.getTime() - target);
    if (!best || diff < best.diff) {
      best = { key, diff };
    }
  }
  return best ? forecast.hours[best.key] : null;
}

/**
 * Best-effort prefetch for many spots in parallel. Errors per-spot are
 * swallowed because this is purely a warmup; consumers that actually need a
 * forecast should call `fetchSpotForecast` directly to get its rejection.
 */
export function prefetchSpotForecasts(
  coords: ReadonlyArray<{ lat: number; lng: number }>,
): void {
  for (const c of coords) {
    fetchSpotForecast(c.lat, c.lng).catch(() => {});
  }
}
