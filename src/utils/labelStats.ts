// Pure helpers backing the smart-label system in Weather mode. The label
// component decides "do I count as an outlier?" and "should I render at this
// zoom?" based on the city-wide stats computed here.
//
// Splitting this from the React layer keeps the math testable without a DOM
// and lets both the labels and the insight card consume the same numbers.

import { neighborhoods, type Neighborhood } from '../data/neighborhoods';
import { OUTLIER_THRESHOLD, type SamplePoint, type WeatherMetric } from './interpolate';

export interface CityStats {
  /** Arithmetic mean of all finite sample values. NaN if no samples. */
  avg: number;
  min: number;
  max: number;
  /** max - min, in metric units. */
  spread: number;
  /** Neighborhood id with the highest value. -1 if no samples. */
  highId: number;
  /** Neighborhood id with the lowest value. -1 if no samples. */
  lowId: number;
  count: number;
}

const EMPTY_STATS: CityStats = {
  avg: NaN,
  min: NaN,
  max: NaN,
  spread: 0,
  highId: -1,
  lowId: -1,
  count: 0,
};

/**
 * Per-neighborhood stats summary used by the label outlier classifier and
 * the insight-card narrative. We accept the same `Map<id, SamplePoint>`
 * `WeatherLayer` already builds so callers don't have to massage shapes.
 */
export function computeCityStats(samples: Map<number, SamplePoint>): CityStats {
  if (samples.size === 0) return EMPTY_STATS;

  let sum = 0;
  let count = 0;
  let min = Infinity;
  let max = -Infinity;
  let highId = -1;
  let lowId = -1;
  for (const [id, s] of samples) {
    if (!Number.isFinite(s.value)) continue;
    sum += s.value;
    count += 1;
    if (s.value < min) {
      min = s.value;
      lowId = id;
    }
    if (s.value > max) {
      max = s.value;
      highId = id;
    }
  }
  if (count === 0) return EMPTY_STATS;

  return {
    avg: sum / count,
    min,
    max,
    spread: max - min,
    highId,
    lowId,
    count,
  };
}

export type LabelStatus = 'outlierHigh' | 'outlierLow' | 'neutral';

/**
 * Bucket a neighborhood's value relative to the city average. Returns
 * `outlierHigh` / `outlierLow` when it deviates by at least the metric's
 * threshold, otherwise `neutral` (will render dimmed).
 */
export function classifyLabel(
  metric: WeatherMetric,
  value: number,
  avg: number,
): LabelStatus {
  if (!Number.isFinite(value) || !Number.isFinite(avg)) return 'neutral';
  const delta = value - avg;
  const threshold = OUTLIER_THRESHOLD[metric];
  if (delta >= threshold) return 'outlierHigh';
  if (delta <= -threshold) return 'outlierLow';
  return 'neutral';
}

// Neighborhoods that the brief specifies should always render at city zoom.
// Names match `data/neighborhoods.ts` exactly; keep this list in sync if a
// neighborhood is renamed.
const PRIORITY_NAMES = new Set([
  'Presidio',
  'Marina',
  'Outer Richmond',
  'Sunset',
  'Twin Peaks',
  'Mission',
  'SOMA',
  'Downtown',
  'Glen Park',
  'Bayview',
  'Lake Merced',
]);

/** Resolve the priority neighborhood name list to ids once at module load. */
export const PRIORITY_NEIGHBORHOOD_IDS: ReadonlySet<number> = new Set(
  neighborhoods.filter((n) => PRIORITY_NAMES.has(n.name)).map((n) => n.id),
);

export interface LabelCandidate {
  neighborhood: Neighborhood;
  value: number;
  status: LabelStatus;
  /** |value - avg| — used to break collisions in favor of the bigger story. */
  deviation: number;
  /** Pre-projected screen pixel position for collision testing. */
  px: { x: number; y: number };
}

/**
 * Pick which labels actually render at the current zoom.
 *
 * Strategy:
 *   1. Always include the priority neighborhoods (Presidio, Sunset, etc.).
 *   2. Backfill with the largest-deviation outliers up to a per-zoom cap.
 *   3. Greedily drop any candidate that collides (within `collisionRadiusPx`)
 *      with an already-chosen one — keeping the bigger deviation. This is
 *      what stops Marina/North Beach from stacking on top of each other at
 *      city zoom.
 *
 * `project` should be `map.latLngToContainerPoint`-style; we keep the
 * dependency abstract so tests can pass a stub.
 */
export function pickLabelsForZoom(
  candidates: LabelCandidate[],
  zoom: number,
): LabelCandidate[] {
  if (candidates.length === 0) return [];

  // City zoom (~12-12.5) gets 10-12 labels; finer zooms unlock everything.
  const cap = labelCapForZoom(zoom);
  const collisionRadiusPx = collisionRadiusForZoom(zoom);

  // Sort priority-first, then by deviation desc. Stable enough that two
  // neutrals with identical 0 deviation just keep input order.
  const sorted = [...candidates].sort((a, b) => {
    const ap = PRIORITY_NEIGHBORHOOD_IDS.has(a.neighborhood.id) ? 1 : 0;
    const bp = PRIORITY_NEIGHBORHOOD_IDS.has(b.neighborhood.id) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return b.deviation - a.deviation;
  });

  const chosen: LabelCandidate[] = [];
  for (const c of sorted) {
    if (chosen.length >= cap) break;
    let collides = false;
    for (const other of chosen) {
      const dx = other.px.x - c.px.x;
      const dy = other.px.y - c.px.y;
      if (dx * dx + dy * dy < collisionRadiusPx * collisionRadiusPx) {
        collides = true;
        break;
      }
    }
    if (!collides) chosen.push(c);
  }
  return chosen;
}

function labelCapForZoom(zoom: number): number {
  if (zoom >= 14) return 50; // effectively uncapped for our 25 anchors
  if (zoom >= 13) return 18;
  if (zoom >= 12) return 12;
  return 10;
}

function collisionRadiusForZoom(zoom: number): number {
  if (zoom >= 14) return 40;
  if (zoom >= 13) return 60;
  if (zoom >= 12) return 80;
  return 95;
}

/**
 * Compass abbreviation for a meteorological wind-direction degree
 * (0 = wind from N, 90 = from E, etc.). Returns the 8-point cardinal
 * abbreviation — `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`.
 */
export function windDirToAbbr(deg: number): string {
  if (!Number.isFinite(deg)) return '';
  const normalized = ((deg % 360) + 360) % 360;
  // Slice into 8 bins centered on each cardinal — i.e. N covers 337.5..22.5.
  const bins = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(normalized / 45) % 8;
  return bins[idx];
}
