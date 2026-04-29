// Pure helpers and types shared across the per-metric expanded weather
// sheets. Components live in `shared.tsx` so that file can stay
// react-refresh friendly (components-only export).

import { neighborhoods } from '../../data/neighborhoods';
import { type SpotForecast } from '../../utils/weather';
import { type WeatherMetric } from '../../utils/interpolate';
import { buildSamples } from '../../utils/weatherSamples';
import { computeCityStats } from '../../utils/labelStats';

/** Number of forward hours every expanded sheet visualizes. */
export const HOURLY_STRIP_LENGTH = 12;

export interface SeriesPoint {
  key: string;
  value: number;
}

export type TrendDir = 'up' | 'down' | 'steady';

/**
 * City-average of a metric for the next `HOURLY_STRIP_LENGTH` hours,
 * starting at `hourKey`. Hours with no usable samples are skipped, so
 * the returned array length can be < 12 near the edge of the forecast.
 */
export function buildCityAvgSeries(
  metric: WeatherMetric,
  hourKey: string,
  hourKeys: string[],
  forecasts: Map<number, SpotForecast>,
): SeriesPoint[] {
  if (!hourKey || hourKeys.length === 0) return [];
  const startIdx = Math.max(0, hourKeys.indexOf(hourKey));
  const endIdx = Math.min(hourKeys.length, startIdx + HOURLY_STRIP_LENGTH);
  const out: SeriesPoint[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    const k = hourKeys[i];
    const samples = buildSamples(metric, k, forecasts);
    const stats = computeCityStats(samples);
    if (Number.isFinite(stats.avg)) out.push({ key: k, value: stats.avg });
  }
  return out;
}

export function neighborhoodName(id: number): string {
  if (id < 0) return '';
  return neighborhoods.find((n) => n.id === id)?.name ?? '';
}

export function shortHourLabel(hourKey: string): string {
  const parsed = new Date(`${hourKey}:00:00`);
  if (Number.isNaN(parsed.getTime())) return hourKey;
  return parsed
    .toLocaleTimeString(undefined, { hour: 'numeric' })
    .replace(/\s?(AM|PM)/, (_, p) => p.toLowerCase());
}

/**
 * Find the index of the maximum-value hour in `series`. Returns -1 for
 * empty arrays. Ties resolve to the first occurrence so peaks earlier
 * in the day take precedence over identical later peaks.
 */
export function peakIndex(series: SeriesPoint[]): number {
  if (series.length === 0) return -1;
  let bestIdx = 0;
  for (let i = 1; i < series.length; i++) {
    if (series[i].value > series[bestIdx].value) bestIdx = i;
  }
  return bestIdx;
}

export function troughIndex(series: SeriesPoint[]): number {
  if (series.length === 0) return -1;
  let bestIdx = 0;
  for (let i = 1; i < series.length; i++) {
    if (series[i].value < series[bestIdx].value) bestIdx = i;
  }
  return bestIdx;
}

/**
 * Average of the first `n` future-facing samples (skipping the head)
 * versus the head. Used by every metric to derive a directional chip.
 * Returns 0 when there's no forward window to compare against.
 */
export function shortTermDelta(series: SeriesPoint[], windowHours = 3): number {
  if (series.length < 2) return 0;
  const head = series[0].value;
  const next = series.slice(1, Math.min(windowHours + 1, series.length));
  if (next.length === 0) return 0;
  const nextAvg = next.reduce((s, x) => s + x.value, 0) / next.length;
  return nextAvg - head;
}

/** Catmull-Rom → cubic Bézier path. Smoother than polyline, no deps. */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function pickTickIndices(length: number): number[] {
  if (length <= 1) return [0];
  if (length <= 4) return Array.from({ length }, (_, i) => i);
  // 5 evenly spaced ticks, always including first and last.
  const ticks = new Set<number>();
  for (let i = 0; i < 5; i++) {
    ticks.add(Math.round((i * (length - 1)) / 4));
  }
  return Array.from(ticks).sort((a, b) => a - b);
}

/**
 * Stable id derived from a color string so multiple charts on the
 * same screen don't share a `<linearGradient>` definition. Hashing the
 * color is sufficient since per-metric colors don't collide.
 */
export function fillGradientId(color: string): string {
  let hash = 0;
  for (let i = 0; i < color.length; i++) {
    hash = (hash * 31 + color.charCodeAt(i)) | 0;
  }
  return `metric-chart-fill-${Math.abs(hash)}`;
}
