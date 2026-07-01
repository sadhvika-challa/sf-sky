// Per-spot hourly sparkline: given an event card's type + peak instant, pick
// a handful of nearby hours from an already-fetched forecast and score each
// one with the same math the main card uses. Purely additive — no new
// requests, no changes to the scoring pipeline.

import type { Spot } from '../data/spots';
import type { SpotForecast, HourlyForecast } from './weather';
import {
  computeLiveScore,
  getTierColor,
  type ScoreType,
} from './scoring';

/** Card types that get a sparkline (i.e. "now" is intentionally excluded). */
export type SparkType = ScoreType;

/** How many stargazing hours we sample forward from nauticalDusk. */
const STARGAZING_POINTS = 7;

/**
 * Build the ISO hour key used to index `SpotForecast.hours`. Mirrors
 * `weather.ts`'s local-time formatting so the direct lookup below only
 * accepts hours that actually landed in the forecast (i.e. no silent
 * fuzzy-fallback to some distant hour when the requested time is past the
 * 3-day horizon).
 */
function hourKeyForDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}`;
}

/**
 * Snap a date down to the top of its containing hour, so each sampled point
 * lines up with a forecast slice key.
 */
function snapToHour(date: Date): Date {
  const snapped = new Date(date);
  snapped.setMinutes(0, 0, 0);
  return snapped;
}

/**
 * Derive the array of hour instants to sample for the sparkline.
 *
 * - `sunrise`/`sunset`: 5 hourly points centered on the event (-2h..+2h).
 * - `stargazing`: 7 hourly points starting at nauticalDusk, walking forward
 *   through the night. Capped so the strip stays glanceable — a fully sampled
 *   dusk→dawn window can run 8+ hours which is too dense at this size.
 */
export function deriveSparkHours(type: SparkType, eventInstant: Date): Date[] {
  if (Number.isNaN(eventInstant.getTime())) return [];

  const center = snapToHour(eventInstant);
  const hourMs = 60 * 60 * 1000;

  if (type === 'sunrise' || type === 'sunset') {
    const out: Date[] = [];
    for (let offset = -2; offset <= 2; offset++) {
      out.push(new Date(center.getTime() + offset * hourMs));
    }
    return out;
  }

  const out: Date[] = [];
  for (let i = 0; i < STARGAZING_POINTS; i++) {
    out.push(new Date(center.getTime() + i * hourMs));
  }
  return out;
}

export interface SparkPoint {
  /** The hour this point represents. */
  date: Date;
  /** Blended 0-100 score at that hour. */
  score: number;
  /** Tier color that the map pin/score chrome would use for this score. */
  color: string;
  /** True for the sampled hour closest to the card's peak event instant. */
  isPeak: boolean;
}

/**
 * Score each derived hour against the given forecast. Missing hours are
 * skipped rather than filled with a fuzzy neighbor — a shorter sparkline is
 * fine at the edge of the forecast window, but we don't want to plot a score
 * derived from an hour that isn't actually the one requested.
 */
export function computeSparkPoints(
  spot: Spot,
  type: SparkType,
  forecast: SpotForecast,
  eventInstant: Date,
  moonIllum: number,
): SparkPoint[] {
  const hours = deriveSparkHours(type, eventInstant);
  if (hours.length === 0) return [];

  // Pick the sampled hour closest to the true event instant to mark as peak.
  let peakIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < hours.length; i++) {
    const diff = Math.abs(hours[i].getTime() - eventInstant.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      peakIdx = i;
    }
  }

  const points: SparkPoint[] = [];
  for (let i = 0; i < hours.length; i++) {
    const hourly: HourlyForecast | undefined = forecast.hours[hourKeyForDate(hours[i])];
    if (!hourly) continue;
    const score = computeLiveScore(spot, type, hourly, moonIllum);
    points.push({
      date: hours[i],
      score,
      color: getTierColor(score),
      isPeak: i === peakIdx,
    });
  }
  return points;
}
