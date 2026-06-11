// Live scoring: blend a spot's intrinsic base score (terrain, light pollution,
// horizon) with the actual forecast at the event time. Pure functions only —
// no React, no fetch, easy to reason about and to test.

import type { Spot } from '../data/spots';
import { fogDensity, type HourlyForecast } from './weather';

export type ScoreType = 'sunrise' | 'sunset' | 'stargazing';

const SUN_BASE_WEIGHT = 0.35;
const SUN_WEATHER_WEIGHT = 0.65;
const STAR_BASE_WEIGHT = 0.45;
const STAR_WEATHER_WEIGHT = 0.55;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function safe(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Score a sunrise/sunset based on cloud structure, visibility, and air quality.
 *
 * The "fire sky" intuition: you want enough mid/high cloud to catch color, but
 * not so much low cloud that the sun is hidden behind a wall of fog. Pure clear
 * skies give a clean but un-dramatic event; full overcast gives nothing.
 *
 * Returns 0-100.
 */
function scoreSunWeather(h: HourlyForecast): number {
  const cloudLow = clamp(safe(h.cloudLow, 50), 0, 100);
  const cloudMid = clamp(safe(h.cloudMid, 30), 0, 100);
  const cloudHigh = clamp(safe(h.cloudHigh, 30), 0, 100);
  const total = clamp(safe(h.cloud, (cloudLow + cloudMid + cloudHigh) / 3), 0, 100);

  // Mid clouds: triangular peak at ~50%, gentle falloff so a 30% setup still
  // reads as a strong sunset rather than a near-miss.
  const midScore = 100 - Math.abs(cloudMid - 50) * 1.5;
  // High clouds: similar, but peak slightly lower (~40%).
  const highScore = 100 - Math.abs(cloudHigh - 40) * 1.5;
  // Low clouds: penalty that grows past ~40% (SF's marine layer routinely
  // sits in the 30–40% band; penalizing earlier than that floors every spot).
  const lowPenalty = Math.max(0, cloudLow - 40) * 0.8;
  // Heavy total overcast caps everything.
  const overcastPenalty = total > 90 ? (total - 90) * 4 : 0;

  let cloudScore = midScore * 0.6 + highScore * 0.4 - lowPenalty - overcastPenalty;

  // Fog density (0..1) composites visibility + low-cloud + humidity. Computed
  // up front so the clear-sky floors below can defer to it: a clear-but-foggy
  // hour (rare, but the marine layer can sit low with little mid/high cloud)
  // shouldn't get floored up to "pleasant".
  const fog = fogDensity(h);

  // Clear-sky floors. The triangular cloud curve treats a cloudless sky as
  // mediocre because there's no mid/high cloud to "catch fire" — but a clean,
  // fog-free evening is still a perfectly good (if undramatic) view and must
  // not score like a hazy one. Only apply when fog is low so genuinely socked-
  // in nights still tank. (Removed in the scoring-accuracy pass to let fog bite
  // harder; that also broke clear skies, which this restores.)
  if (fog < 0.4) {
    if (Number.isFinite(total) && total < 10) cloudScore = Math.max(cloudScore, 70);
    if (Number.isFinite(total) && total < 25 && cloudLow < 25) {
      cloudScore = Math.max(cloudScore, 65);
    }
  }
  cloudScore = clamp(cloudScore, 0, 100);

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
function scoreStargazingWeather(h: HourlyForecast, moonIllum: number): number {
  const total = clamp(safe(h.cloud, 50), 0, 100);
  // Less cloud = better. Linear inverse, with a floor for textbook-clear
  // nights so they aren't penalized for the inverse curve's softness.
  let cloudScore = 100 - total;
  if (total < 15) cloudScore = Math.max(cloudScore, 90);

  // Humidity above ~90% means hazy skies even when "clear".
  const humidity = clamp(safe(h.humidity, 60), 0, 100);
  const humidityPenalty = humidity > 90 ? (humidity - 90) * 1.0 : 0;

  // Moon: full moon (1.0) costs ~15 points, new moon costs nothing.
  const moonPenalty = clamp(moonIllum, 0, 1) * 15;

  const weighted = cloudScore - humidityPenalty - moonPenalty;
  return clamp(weighted, 0, 100);
}

export function computeLiveScore(
  spot: Spot,
  type: ScoreType,
  hourly: HourlyForecast,
  moonIllum: number = 0,
): number {
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

  // Post-blend reality checks: cap the score when conditions are
  // objectively terrible, regardless of how good the base score is.
  const fog = fogDensity(hourly);
  if (type === 'sunrise' || type === 'sunset') {
    if (fog > 0.7) return Math.min(Math.round(clamp(blended, 0, 100)), 35);
    if (Number.isFinite(hourly.cloud) && hourly.cloud > 95)
      return Math.min(Math.round(clamp(blended, 0, 100)), 30);
    if (Number.isFinite(hourly.visibilityKm) && hourly.visibilityKm < 2)
      return Math.min(Math.round(clamp(blended, 0, 100)), 40);
  }
  if (type === 'stargazing') {
    if (Number.isFinite(hourly.cloud) && hourly.cloud > 95)
      return Math.min(Math.round(clamp(blended, 0, 100)), 20);
  }

  return Math.round(clamp(blended, 0, 100));
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

// Score quality tiers — drive pin color/size, outlook dot, score-card chrome.
// Palette is intentionally muted to match the cream/watercolor aesthetic of
// the app; do not swap in stoplight green/amber/red.
export type ScoreTier = 'great' | 'decent' | 'poor';

export const tierColors: Record<ScoreTier, string> = {
  great: '#5B9A7B',
  decent: '#C4956A',
  poor: '#B07A7A',
};

export function getScoreTier(score: number): ScoreTier {
  if (score >= 70) return 'great';
  if (score >= 45) return 'decent';
  return 'poor';
}

export function getTierColor(score: number): string {
  return tierColors[getScoreTier(score)];
}
