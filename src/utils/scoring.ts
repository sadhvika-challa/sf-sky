// Live scoring: blend a spot's intrinsic base score (terrain, light pollution,
// horizon) with the actual forecast at the event time. Pure functions only —
// no React, no fetch, easy to reason about and to test.

import type { Spot } from '../data/spots';
import { fogDensity, type HourlyForecast } from './weather';

export type ScoreType = 'sunrise' | 'sunset' | 'stargazing';

/** Display mode for the map. Extends ScoreType with the real-time "now" mode. */
export type ViewMode = ScoreType | 'now';

const SUN_BASE_WEIGHT = 0.35;
const SUN_WEATHER_WEIGHT = 0.65;
const STAR_BASE_WEIGHT = 0.45;
const STAR_WEATHER_WEIGHT = 0.55;

// Cloud band verdict thresholds (sun events). Keep next to the scoring
// constants so they stay in sync with the triangular curves above.
export const LOW_CLOUD_GOOD = 25;
export const LOW_CLOUD_NEUTRAL = 40;
export const MID_CLOUD_GOOD_LOW = 35;
export const MID_CLOUD_GOOD_HIGH = 65;
export const HIGH_CLOUD_GOOD_LOW = 25;
export const HIGH_CLOUD_GOOD_HIGH = 55;
export const VIS_GOOD_KM = 15;
export const VIS_NEUTRAL_KM = 8;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function safe(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

// ── Cloud band reads ────────────────────────────────────────────────────

export interface CloudBandRead {
  /** 0-100 coverage for this band, or null if not finite in the forecast. */
  coverage: number | null;
  /** Verdict tag for the UI. */
  verdict: 'good' | 'neutral' | 'bad';
  /** Short human label, e.g. "catches color", "fog risk", "thin". */
  label: string;
}

function lowCloudRead(raw: number): CloudBandRead {
  if (!Number.isFinite(raw)) return { coverage: null, verdict: 'neutral', label: 'no data' };
  const v = clamp(raw, 0, 100);
  if (v < LOW_CLOUD_GOOD) return { coverage: v, verdict: 'good', label: 'clear low' };
  if (v <= LOW_CLOUD_NEUTRAL) return { coverage: v, verdict: 'neutral', label: 'ok' };
  return { coverage: v, verdict: 'bad', label: 'fog risk' };
}

function midCloudRead(raw: number): CloudBandRead {
  if (!Number.isFinite(raw)) return { coverage: null, verdict: 'neutral', label: 'no data' };
  const v = clamp(raw, 0, 100);
  if (v >= MID_CLOUD_GOOD_LOW && v <= MID_CLOUD_GOOD_HIGH) return { coverage: v, verdict: 'good', label: 'catches color' };
  if (v < MID_CLOUD_GOOD_LOW) return { coverage: v, verdict: 'neutral', label: 'thin' };
  return { coverage: v, verdict: 'bad', label: 'heavy' };
}

function highCloudRead(raw: number): CloudBandRead {
  if (!Number.isFinite(raw)) return { coverage: null, verdict: 'neutral', label: 'no data' };
  const v = clamp(raw, 0, 100);
  if (v >= HIGH_CLOUD_GOOD_LOW && v <= HIGH_CLOUD_GOOD_HIGH) return { coverage: v, verdict: 'good', label: 'catches color' };
  if (v < HIGH_CLOUD_GOOD_LOW) return { coverage: v, verdict: 'neutral', label: 'thin' };
  return { coverage: v, verdict: 'bad', label: 'milky' };
}

function visibilityVerdict(km: number): 'good' | 'neutral' | 'bad' {
  if (!Number.isFinite(km)) return 'neutral';
  if (km >= VIS_GOOD_KM) return 'good';
  if (km >= VIS_NEUTRAL_KM) return 'neutral';
  return 'bad';
}

// ── Cloud quality sub-score ──────────────────────────────────────────────

/**
 * Cloud quality score: how favorable the cloud structure is for this event.
 * For sunrise/sunset this is the "fire sky" assessment — mid/high cloud
 * that catches color vs. low cloud that blocks the horizon.
 * For stargazing it's simpler: less cloud = better.
 *
 * Returns 0-100 where 100 = ideal cloud setup for this event.
 */
export function cloudQualityScore(h: HourlyForecast, type: ScoreType): number {
  if (type === 'stargazing') {
    const total = clamp(safe(h.cloud, 50), 0, 100);
    let score = 100 - total;
    if (total < 15) score = Math.max(score, 90);
    return clamp(score, 0, 100);
  }

  // sunrise / sunset
  const cloudLow = clamp(safe(h.cloudLow, 50), 0, 100);
  const cloudMid = clamp(safe(h.cloudMid, 30), 0, 100);
  const cloudHigh = clamp(safe(h.cloudHigh, 30), 0, 100);
  const total = clamp(safe(h.cloud, (cloudLow + cloudMid + cloudHigh) / 3), 0, 100);

  const midScore = 100 - Math.abs(cloudMid - 50) * 1.5;
  const highScore = 100 - Math.abs(cloudHigh - 40) * 1.5;
  const lowPenalty = Math.max(0, cloudLow - 40) * 0.8;
  const overcastPenalty = total > 90 ? (total - 90) * 4 : 0;

  let score = midScore * 0.6 + highScore * 0.4 - lowPenalty - overcastPenalty;

  const fog = fogDensity(h);
  if (fog < 0.4) {
    if (Number.isFinite(total) && total < 10) score = Math.max(score, 70);
    if (Number.isFinite(total) && total < 25 && cloudLow < 25) {
      score = Math.max(score, 65);
    }
  }
  return clamp(score, 0, 100);
}

/**
 * Human-readable one-word label for a cloud quality score.
 * Labels are event-aware: sunset cares about drama potential,
 * stargazing cares about clarity.
 */
export function cloudQualityLabel(score: number, type: ScoreType): string {
  if (!Number.isFinite(score)) return '--';

  if (type === 'stargazing') {
    if (score >= 85) return 'Crystal';
    if (score >= 70) return 'Clear';
    if (score >= 50) return 'Hazy';
    return 'Overcast';
  }

  // sunrise / sunset
  if (score >= 80) return 'Vivid';
  if (score >= 65) return 'Clean';
  if (score >= 45) return 'Flat';
  return 'Washed';
}

// ── Weather sub-scores ──────────────────────────────────────────────────

/**
 * Score a sunrise/sunset based on cloud structure, visibility, and air quality.
 *
 * The "fire sky" intuition: you want enough mid/high cloud to catch color, but
 * not so much low cloud that the sun is hidden behind a wall of fog. Pure clear
 * skies give a clean but un-dramatic event; full overcast gives nothing.
 *
 * Returns 0-100.
 */
export function scoreSunWeather(h: HourlyForecast): number {
  const cloudScore = cloudQualityScore(h, 'sunset');

  // Visibility bonus: 15+ km is excellent (Open-Meteo's SF readings rarely
  // exceed ~18 km even on sparkling days), < 5 km is bad.
  const vis = safe(h.visibilityKm, 15);
  let visScore: number;
  if (vis >= 15) visScore = 100;
  else if (vis <= 5) visScore = 30;
  else visScore = 30 + ((vis - 5) / 10) * 70;

  // Air-quality penalty: PM2.5 above ~35 µg/m³ starts killing colors.
  const pm25 = safe(h.pm25, 0);
  const aqiPenalty = pm25 > 35 ? Math.min(40, (pm25 - 35) * 1.5) : 0;

  // Fog penalty: above 0.5, fog starts meaningfully degrading the view.
  const fog = fogDensity(h);
  const fogPenalty = fog > 0.5 ? fog * 40 : 0;

  const weighted = cloudScore * 0.7 + visScore * 0.3 - aqiPenalty - fogPenalty;
  return clamp(weighted, 0, 100);
}

/**
 * Score stargazing based on cloud cover, humidity, and moon illumination.
 * Light pollution is already baked into the spot's base score.
 *
 * Returns 0-100.
 */
export function scoreStargazingWeather(h: HourlyForecast, moonIllum: number): number {
  const cloudScore = cloudQualityScore(h, 'stargazing');

  // Humidity above ~90% means hazy skies even when "clear".
  const humidity = clamp(safe(h.humidity, 60), 0, 100);
  const humidityPenalty = humidity > 90 ? (humidity - 90) * 1.0 : 0;

  // Moon: full moon (1.0) costs ~15 points, new moon costs nothing.
  const moonPenalty = clamp(moonIllum, 0, 1) * 15;

  const weighted = cloudScore - humidityPenalty - moonPenalty;
  return clamp(weighted, 0, 100);
}

// ── Score breakdown ─────────────────────────────────────────────────────

export interface ScoreBreakdown {
  total: number;
  base: number;
  weather: number;
  baseWeight: number;
  weatherWeight: number;
  type: ScoreType;
  cloudLow: CloudBandRead | null;
  cloudMid: CloudBandRead | null;
  cloudHigh: CloudBandRead | null;
  visibilityKm: number | null;
  visibilityVerdict: 'good' | 'neutral' | 'bad';
  aqiPenaltyActive: boolean;
  totalCloud: number | null;
  humidityPenaltyActive: boolean;
  moonIllum: number | null;
}

export function computeScoreBreakdown(
  spot: Spot,
  type: ScoreType,
  hourly: HourlyForecast,
  moonIllum: number = 0,
): ScoreBreakdown {
  const base = spot[type];
  let weather: number;
  let baseWeight: number;
  let weatherWeight: number;

  switch (type) {
    case 'sunrise':
    case 'sunset':
      weather = scoreSunWeather(hourly);
      baseWeight = SUN_BASE_WEIGHT;
      weatherWeight = SUN_WEATHER_WEIGHT;
      break;
    case 'stargazing':
      weather = scoreStargazingWeather(hourly, moonIllum);
      baseWeight = STAR_BASE_WEIGHT;
      weatherWeight = STAR_WEATHER_WEIGHT;
      break;
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unhandled score type: ${String(_exhaustive)}`);
    }
  }

  const blended = base * baseWeight + weather * weatherWeight;

  // Post-blend reality checks (identical to the original computeLiveScore).
  let total: number;
  const fog = fogDensity(hourly);
  if (type === 'sunrise' || type === 'sunset') {
    if (fog > 0.7) {
      total = Math.min(Math.round(clamp(blended, 0, 100)), 35);
    } else if (Number.isFinite(hourly.cloud) && hourly.cloud > 95) {
      total = Math.min(Math.round(clamp(blended, 0, 100)), 30);
    } else if (Number.isFinite(hourly.visibilityKm) && hourly.visibilityKm < 2) {
      total = Math.min(Math.round(clamp(blended, 0, 100)), 40);
    } else {
      total = Math.round(clamp(blended, 0, 100));
    }
  } else if (type === 'stargazing') {
    if (Number.isFinite(hourly.cloud) && hourly.cloud > 95) {
      total = Math.min(Math.round(clamp(blended, 0, 100)), 20);
    } else {
      total = Math.round(clamp(blended, 0, 100));
    }
  } else {
    total = Math.round(clamp(blended, 0, 100));
  }

  const isSun = type === 'sunrise' || type === 'sunset';
  const pm25 = safe(hourly.pm25, 0);
  const humidity = clamp(safe(hourly.humidity, 60), 0, 100);
  const visKm = Number.isFinite(hourly.visibilityKm) ? hourly.visibilityKm : null;
  const totalCloud = Number.isFinite(hourly.cloud) ? hourly.cloud : null;

  return {
    total,
    base,
    weather,
    baseWeight,
    weatherWeight,
    type,
    cloudLow: isSun ? lowCloudRead(hourly.cloudLow) : null,
    cloudMid: isSun ? midCloudRead(hourly.cloudMid) : null,
    cloudHigh: isSun ? highCloudRead(hourly.cloudHigh) : null,
    visibilityKm: isSun ? visKm : null,
    visibilityVerdict: isSun ? visibilityVerdict(hourly.visibilityKm) : 'neutral',
    aqiPenaltyActive: isSun && pm25 > 35,
    totalCloud: type === 'stargazing' ? totalCloud : null,
    humidityPenaltyActive: type === 'stargazing' && humidity > 90,
    moonIllum: type === 'stargazing' ? clamp(moonIllum, 0, 1) : null,
  };
}

export function computeLiveScore(
  spot: Spot,
  type: ScoreType,
  hourly: HourlyForecast,
  moonIllum: number = 0,
): number {
  return computeScoreBreakdown(spot, type, hourly, moonIllum).total;
}

/**
 * Bucket a 0-100 cloud cover into the human label the card displays.
 */
export function cloudCoverLabel(cloud: number): string {
  if (!Number.isFinite(cloud)) return '—';
  if (cloud < 20) return 'Clear';
  if (cloud < 60) return 'Partly';
  if (cloud < 85) return 'Mid';
  return 'Overcast';
}

/**
 * Map visibility (km) to the 0-100 percentage shown by the visibility bar.
 * 0 km -> 0%, 30+ km -> 100%.
 */
export function visibilityPercent(visibilityKm: number): number {
  if (!Number.isFinite(visibilityKm)) return 0;
  return Math.round(clamp((visibilityKm / 30) * 100, 0, 100));
}

// ── "Now" mode scoring ──────────────────────────────────────────────────

const NOW_BASE_WEIGHT = 0.25;
const NOW_WEATHER_WEIGHT = 0.75;

/**
 * Derive a "now" base score from spot attributes. Higher elevation spots
 * escape SF's marine layer more often; open-horizon hilltops and parks
 * are more pleasant to hang out at. This replaces the hand-tuned base
 * score that sunrise/sunset/stargazing use.
 */
export function computeNowBaseScore(spot: Spot): number {
  let base = 40;

  if (spot.elevation >= 200) base += 30;
  else if (spot.elevation >= 100) base += 22;
  else if (spot.elevation >= 50) base += 12;
  else if (spot.elevation >= 20) base += 5;

  if (spot.category === 'park') base += 10;
  else if (
    spot.category === 'hill' ||
    spot.category === 'coastal-bluff' ||
    spot.category === 'skyscraper'
  ) base += 8;
  else base += 5;

  if (spot.horizonQuality === 'Open') base += 10;
  else if (spot.horizonQuality === 'Partial') base += 5;

  if (spot.lightPollution === 'Low') base += 5;

  return clamp(base, 0, 100);
}

/**
 * Score current conditions for "is this a nice place to be right now?"
 * Clear sky, good visibility, comfortable temperature, low wind.
 */
function scoreNowWeather(h: HourlyForecast): number {
  const total = clamp(safe(h.cloud, 50), 0, 100);
  let cloudScore = 100 - total;
  if (total < 10) cloudScore = Math.max(cloudScore, 95);

  const cloudLow = clamp(safe(h.cloudLow, 30), 0, 100);
  const fogPenalty = cloudLow > 40 ? (cloudLow - 40) * 0.5 : 0;

  const vis = safe(h.visibilityKm, 15);
  let visScore: number;
  if (vis >= 15) visScore = 100;
  else if (vis <= 5) visScore = 30;
  else visScore = 30 + ((vis - 5) / 10) * 70;

  const wind = safe(h.windMph, 8);
  let windScore: number;
  if (wind <= 8) windScore = 100;
  else if (wind <= 15) windScore = 100 - (wind - 8) * 5;
  else if (wind <= 25) windScore = 65 - (wind - 15) * 4;
  else windScore = Math.max(0, 25 - (wind - 25) * 3);

  const temp = safe(h.tempF, 62);
  let tempScore: number;
  if (temp >= 55 && temp <= 75) tempScore = 100;
  else if (temp < 55) tempScore = Math.max(20, 100 - (55 - temp) * 4);
  else tempScore = Math.max(20, 100 - (temp - 75) * 3);

  const pm25 = safe(h.pm25, 0);
  const aqiPenalty = pm25 > 35 ? Math.min(40, (pm25 - 35) * 1.5) : 0;

  const weighted =
    cloudScore * 0.35 +
    visScore * 0.20 +
    windScore * 0.20 +
    tempScore * 0.15 +
    (safe(h.precipProb, 0) > 50 ? -10 : 0) * 0.10
    - fogPenalty
    - aqiPenalty;

  return clamp(weighted, 0, 100);
}

/**
 * Compute the "now" score for a spot. Separate from computeLiveScore because
 * the base score is derived (not a field on Spot) and the weather function
 * is different.
 */
export function computeNowScore(spot: Spot, hourly: HourlyForecast): number {
  const base = computeNowBaseScore(spot);
  const weather = scoreNowWeather(hourly);
  const blended = base * NOW_BASE_WEIGHT + weather * NOW_WEATHER_WEIGHT;
  return Math.round(clamp(blended, 0, 100));
}

// Score quality tiers — drive pin size, outlook dot, score-card chrome, and
// the Karl verdict pills. The palette is more saturated than the original
// muted watercolor tones: we lean a touch more vibrant (and a touch greener)
// so a good night reads as genuinely inviting — the app wants people to feel
// good about heading out, especially through SF's gloomy summer marine layer.
//
// Tier *centers* line up with the band anchors of the continuous spectrum
// below (great ≈ score 88, decent ≈ 63, poor ≈ 25) so the discrete pill
// colors and the interpolated pin colors never look out of step.
export type ScoreTier = 'vivid' | 'good' | 'fair' | 'low' | 'poor';

export const tierColors: Record<ScoreTier, string> = {
  vivid: '#5B9A7B',
  good: '#8AAD5A',
  fair: '#C9A94E',
  low: '#C4835A',
  poor: '#B56B6B',
};

export function getScoreTier(score: number): ScoreTier {
  if (score >= 80) return 'vivid';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  if (score >= 20) return 'low';
  return 'poor';
}

export function getTierColor(score: number): string {
  return tierColors[getScoreTier(score)];
}

const TIER_RGB: Record<ScoreTier, [number, number, number]> = {
  vivid: [91, 154, 123],
  good: [138, 173, 90],
  fair: [201, 169, 78],
  low: [196, 131, 90],
  poor: [181, 107, 107],
};

// ── Continuous score spectrum ────────────────────────────────────────────
//
// A smooth 5-stop ramp across the 0–100 score range, anchored at the tier
// midpoints (poor → low → fair → good → vivid). Adjacent scores get
// near-identical colors so there's no jarring snap at tier boundaries.
// The hard tier buckets above still drive *layout* (pin size, labels); this
// drives the actual *fill color* wherever a pin or score number is painted.
interface SpectrumStop {
  at: number; // 0–1 along the ramp (score / 100)
  rgb: [number, number, number];
}

const SCORE_SPECTRUM_STOPS: SpectrumStop[] = [
  { at: 0.0,  rgb: [181, 107, 107] }, //  0  — poor
  { at: 0.1,  rgb: [181, 107, 107] }, // 10  — poor anchor
  { at: 0.3,  rgb: [196, 131, 90] },  // 30  — low anchor
  { at: 0.5,  rgb: [201, 169, 78] },  // 50  — fair anchor
  { at: 0.7,  rgb: [138, 173, 90] },  // 70  — good anchor
  { at: 0.9,  rgb: [91, 154, 123] },  // 90  — vivid anchor
  { at: 1.0,  rgb: [91, 154, 123] },  // 100 — vivid
];

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * Continuous spectrum color for a 0–100 score. Returns a CSS `rgb(...)`
 * string interpolated across the red→gold→green ramp. Out-of-range scores
 * clamp to the nearest end.
 */
export function getSpectrumColor(score: number): string {
  const t = Number.isFinite(score) ? clamp(score, 0, 100) / 100 : 0;
  const stops = SCORE_SPECTRUM_STOPS;

  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].at && t <= stops[i + 1].at) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }

  const span = hi.at - lo.at;
  const localT = span === 0 ? 0 : (t - lo.at) / span;
  const r = lerpChannel(lo.rgb[0], hi.rgb[0], localT);
  const g = lerpChannel(lo.rgb[1], hi.rgb[1], localT);
  const b = lerpChannel(lo.rgb[2], hi.rgb[2], localT);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Canonical tier color at a given opacity -- e.g. `tierColorRgba('vivid', 0.3)`. */
export function tierColorRgba(tier: ScoreTier, alpha: number): string {
  const [r, g, b] = TIER_RGB[tier];
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Route to the correct scoring function based on ViewMode.
 * Used by `useTimelineScores` to score any spot at any scrubbed hour.
 */
export function computeScoreAtTime(
  spot: Spot,
  viewMode: ViewMode,
  hourly: HourlyForecast,
  moonIllum: number,
): number {
  switch (viewMode) {
    case 'sunrise':
    case 'sunset':
    case 'stargazing':
      return computeLiveScore(spot, viewMode, hourly, moonIllum);
    case 'now':
      return computeNowScore(spot, hourly);
    default: {
      const _exhaustive: never = viewMode;
      throw new Error(`Unhandled view mode: ${String(_exhaustive)}`);
    }
  }
}
