// Shared helpers for projecting per-neighborhood `SpotForecast` data down
// to the per-metric/per-hour shape consumed by both the heatmap raster
// (in `WeatherLayer`) and the insight-card narrative (in `InsightCard`).
//
// Keeping these here means the two consumers never disagree on which
// hourly slice or fallback applies — they both walk the same code path.

import { neighborhoods } from '../data/neighborhoods';
import {
  fogDensity,
  getForecastAt,
  type HourlyForecast,
  type SpotForecast,
} from './weather';
import { type SamplePoint, type WeatherMetric } from './interpolate';

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
  if (!hourKey) return out;

  for (const n of neighborhoods) {
    const forecast = forecasts.get(n.id);
    if (!forecast) continue;
    const hourly = forecast.hours[hourKey] ?? nearestHourly(forecast, hourKey);
    if (!hourly) continue;
    const value = pickMetric(metric, hourly);
    if (!Number.isFinite(value)) continue;
    out.set(n.id, { lat: n.lat, lng: n.lng, value });
  }
  return out;
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
  if (!hourKey) return out;
  for (const n of neighborhoods) {
    const forecast = forecasts.get(n.id);
    if (!forecast) continue;
    const hourly = forecast.hours[hourKey] ?? nearestHourly(forecast, hourKey);
    if (!hourly || !Number.isFinite(hourly.windDir)) continue;
    out.set(n.id, hourly.windDir);
  }
  return out;
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

function nearestHourly(forecast: SpotForecast, hourKey: string): HourlyForecast | null {
  // Reuse the time-aware lookup in weather.ts so partial hour ranges still
  // surface a value rather than falling back to NaN.
  const parsed = new Date(`${hourKey}:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return getForecastAt(forecast, parsed);
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
