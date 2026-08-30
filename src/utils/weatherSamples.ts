// Shared helpers for projecting per-neighborhood `SpotForecast` data down
// to the per-metric/per-hour shape consumed by both the heatmap raster
// (in `WeatherLayer`) and the insight-card narrative (in `InsightCard`).
//
// Keeping these here means the two consumers never disagree on which
// exact canonical hourly slice applies — they both walk the same code path.

import { neighborhoods } from '../data/neighborhoods';
import {
  fogDensity,
  type HourlyForecast,
  type SpotForecast,
} from './weather';
import { type SamplePoint, type WeatherMetric } from './interpolate';
import { isCanonicalHourKey } from './timeline';

const SF_SUPPORT_CENTER = { lat: 37.7575, lng: -122.4385 };
const MIN_LAT_SPAN = 0.065;
const MIN_LNG_SPAN = 0.075;

/**
 * For each neighborhood, look up the value at `hourKey` from its forecast
 * and package it as an IDW sample point. Neighborhoods whose forecast
 * hasn't loaded yet (or whose value is NaN) are skipped.
 */
export function buildSamples(
  metric: WeatherMetric,
  hourKey: string,
  forecasts: Map<number, SpotForecast>,
): Map<number, SamplePoint> {
  const out = new Map<number, SamplePoint>();
  if (!isCanonicalHourKey(hourKey)) return out;

  for (const n of neighborhoods) {
    const forecast = forecasts.get(n.id);
    if (!forecast || !forecast.hours || typeof forecast.hours !== 'object') continue;
    const hourly = forecast.hours[hourKey];
    if (!hourly) continue;
    if (!isUsableMetricHour(metric, hourly)) continue;
    const value = pickMetric(metric, hourly);
    if (!Number.isFinite(value)) continue;
    out.set(n.id, { lat: n.lat, lng: n.lng, value });
  }
  return out;
}

/**
 * A city wash needs anchors across the map, not merely nine nearby points.
 * Require meaningful north/south and east/west spans plus support in every
 * quadrant around SF's center before interpolation can imply city coverage.
 */
export function hasSpatialSupport(samples: Map<number, SamplePoint>): boolean {
  if (samples.size === 0) return false;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  const quadrants = new Set<string>();
  for (const sample of samples.values()) {
    if (![sample.lat, sample.lng, sample.value].every(Number.isFinite)) continue;
    minLat = Math.min(minLat, sample.lat);
    maxLat = Math.max(maxLat, sample.lat);
    minLng = Math.min(minLng, sample.lng);
    maxLng = Math.max(maxLng, sample.lng);
    quadrants.add(
      `${sample.lat >= SF_SUPPORT_CENTER.lat ? 'n' : 's'}${sample.lng >= SF_SUPPORT_CENTER.lng ? 'e' : 'w'}`,
    );
  }
  return maxLat - minLat >= MIN_LAT_SPAN
    && maxLng - minLng >= MIN_LNG_SPAN
    && quadrants.size === 4;
}

/**
 * Per-neighborhood wind direction (degrees, meteorological convention) at
 * the active hour. Empty Map for non-wind layers — call sites can skip the
 * lookup entirely when the metric isn't `'wind'`.
 */
export function buildWindDirs(
  hourKey: string,
  forecasts: Map<number, SpotForecast>,
): Map<number, number> {
  const out = new Map<number, number>();
  if (!isCanonicalHourKey(hourKey)) return out;
  for (const n of neighborhoods) {
    const forecast = forecasts.get(n.id);
    if (!forecast || !forecast.hours || typeof forecast.hours !== 'object') continue;
    const hourly = forecast.hours[hourKey];
    if (!hourly || !Number.isFinite(hourly.windDir)) continue;
    out.set(n.id, hourly.windDir);
  }
  return out;
}

/** Validate the actual fields that drive a metric before treating an anchor as coverage. */
export function isUsableMetricHour(metric: WeatherMetric, hourly: HourlyForecast): boolean {
  if (!hourly || typeof hourly !== 'object') return false;
  switch (metric) {
    case 'temp':
      return Number.isFinite(hourly.tempF) && hourly.tempF >= -150 && hourly.tempF <= 150;
    case 'clouds':
      return isPercent(hourly.cloud);
    case 'precip':
      return isPercent(hourly.precipProb);
    case 'wind':
      return Number.isFinite(hourly.windMph) && hourly.windMph >= 0 && hourly.windMph <= 300;
    case 'fog':
      return Number.isFinite(hourly.visibilityKm) && hourly.visibilityKm >= 0
        && isPercent(hourly.cloudLow)
        && isPercent(hourly.humidity);
    default: {
      const _exhaustive: never = metric;
      return _exhaustive;
    }
  }
}

function isPercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

export function pickMetric(metric: WeatherMetric, h: HourlyForecast): number {
  switch (metric) {
    case 'temp':
      return h.tempF;
    case 'clouds':
      return h.cloud;
    case 'precip':
      return h.precipProb;
    case 'wind':
      return h.windMph;
    case 'fog':
      return fogDensity(h);
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled metric: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Step `hourKey` by `delta` hours within the available `hourKeys` set.
 * Returns null if the resulting index falls outside the array. Used by the
 * insight-card narrative to pull the previous hour for trend phrasing.
 */
export function offsetHourKey(
  hourKeys: string[],
  hourKey: string,
  delta: number,
): string | null {
  const idx = hourKeys.indexOf(hourKey);
  if (idx < 0) return null;
  const nextIdx = idx + delta;
  if (nextIdx < 0 || nextIdx >= hourKeys.length) return null;
  return hourKeys[nextIdx];
}
