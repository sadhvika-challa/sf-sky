import SunCalc from 'suncalc';
import type { Spot } from '../data/spots';
import type { HourlyForecast, SpotForecast } from './weather';
import type { ViewMode } from './scoring';
import { formatCanonicalHourKey, formatCityCalendarDate, formatInstantTimeLabel } from './timeline';
import { cloudAgreement, type CloudAgreement } from './skyEnsemble';

export type SkyScene = 'golden-light' | 'colorful-clouds' | 'afterglow' | 'blue-twilight' | 'clear-views' | 'fog-scenery' | 'fog' | 'overcast' | 'obscured' | 'stargazing' | 'unavailable';

export interface SkyReading {
  score: number | null;
  scene: SkyScene;
  label: string;
  reasons: string[];
  limitations: string[];
  colorPotential: number;
}

export interface SkyWindow extends SkyReading {
  cloudAgreement?: CloudAgreement;
  /** Quality is evaluated around the selected instant; duration is separate. */
  evaluatedStart?: number;
  evaluatedEnd?: number;
  durationCapped?: boolean;
  start: number;
  end: number;
  durationMinutes: number;
  coverage: number;
  stability: 'steady' | 'changing' | 'unknown';
}

export interface PlanningDay {
  date: string;
  window: SkyWindow | null;
  period: string;
  rainRisk: boolean;
  windy: boolean;
}

export const SKY_SCORING_VERSION = 'sf-sky-v2';
export const usesSkyExperience = (spot: Pick<Spot, 'city'>) => spot.city === 'sf' && import.meta.env.VITE_SF_SKY_MODEL !== 'legacy';
const HOUR = 3_600_000;
const STEP = 15 * 60_000;
const bounded = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const finite = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const fraction = (v: number) => bounded(v / 100);
const smooth = (lo: number, hi: number, v: number) => {
  const x = bounded((v - lo) / (hi - lo));
  return x * x * (3 - 2 * x);
};

export function unavailableSky(): SkyReading {
  return { score: null, scene: 'unavailable', label: 'Sky forecast unavailable', reasons: [],
    limitations: ['Cloud and visibility data are needed to estimate the sky.'], colorPotential: 0 };
}

/** Physical proxies, not a calibrated probability or a rendering of the sky.
 * Cloud cover measures area, not optical thickness. The empirical response
 * curves below remain conservative when the sunlight path is unobserved.
 * No temperature, wind comfort, permanent elevation bonus, or curated rating.
 */
export function readSkyAtTime(spot: Spot, h: HourlyForecast | null, instant: Date): SkyReading {
  if (!h || !finite(instant.getTime())) return unavailableSky();
  const sun = SunCalc.getPosition(instant, spot.lat, spot.lng);
  const altitude = sun.altitude * 180 / Math.PI;
  const night = altitude < -12;
  const required = night ? [h.cloud, h.visibilityKm] : [h.cloud, h.cloudLow, h.cloudMid, h.cloudHigh, h.visibilityKm];
  if (required.some(v => !finite(v) || v < 0) || [h.cloud, ...(!night ? [h.cloudLow, h.cloudMid, h.cloudHigh] : [])].some(v => v > 100)) return unavailableSky();
  const low = finite(h.cloudLow) ? fraction(h.cloudLow) : 0.5;
  const mid = finite(h.cloudMid) ? fraction(h.cloudMid) : 0;
  const high = finite(h.cloudHigh) ? fraction(h.cloudHigh) : 0;
  const total = fraction(h.cloud);
  const canvas = 1 - (1 - mid) * (1 - high);
  const clarity = 0.08 + 0.92 * smooth(0.2, 15, h.visibilityKm);
  const obstruction = low ** 1.5;
  const horizon = spot.horizonQuality === 'Open' ? 1 : spot.horizonQuality === 'Partial' ? 0.92 : 0.78;
  const limitations: string[] = [];
  const reasons: string[] = [];
  let haze = 1;
  if (finite(h.aerosolOpticalDepth) && h.aerosolOpticalDepth >= 0) {
    haze = Math.exp(-Math.max(0, h.aerosolOpticalDepth - 0.1) * 0.7);
    if (h.aerosolOpticalDepth > 0.35) reasons.push('Regional haze may soften colors and distant views.');
  } else if (finite(h.pm25) && h.pm25 >= 0) {
    haze = 1 - 0.45 * smooth(15, 80, h.pm25);
    limitations.push('Haze is estimated from surface pollution; atmospheric optical depth is unavailable.');
  } else {
    haze = 0.9;
    limitations.push('Haze data is unavailable for this time.');
  }

  const daylight = smooth(-12, 0, altitude);
  const goldenAngle = Math.exp(-(((altitude - 1) / 9) ** 2));
  const colorAngle = Math.exp(-(((altitude + 1) / 7) ** 2));
  // These overlapping response curves are empirical appeal proxies. Solar
  // depression describes illumination, not a calibrated beauty threshold.
  const afterglowAngle = smooth(0, 2, -altitude) * (1 - smooth(6, 10, -altitude));
  const twilightAngle = smooth(0, 5, -altitude) * (1 - smooth(8, 15, -altitude));
  // Radiation is an hourly mean. Use it as supporting daytime evidence only,
  // away from the horizon; zero surface radiation never rules out afterglow.
  let sunlightSupport = 1;
  if (altitude > 15 && finite(h.shortwaveRadiation) && h.shortwaveRadiation >= 0) {
    const reference = 1000 * Math.sin(altitude * Math.PI / 180);
    sunlightSupport = 0.7 + 0.3 * bounded(h.shortwaveRadiation / reference);
  }
  const colorPotential = colorAngle * (35 + 55 * canvas) * (1 - 0.82 * obstruction) * clarity * haze * horizon;
  const golden = goldenAngle * (84 - 25 * canvas) * (1 - 0.85 * obstruction) * clarity * haze * horizon;
  const clearViews = daylight * (76 + 10 * (1 - total) + 8 * canvas * (1 - canvas)) * (1 - 0.8 * obstruction) * clarity * haze * sunlightSupport;
  const afterglow = afterglowAngle * (42 + 44 * canvas) * (1 - 0.88 * obstruction) * clarity * haze * horizon;
  const twilight = twilightAngle * (72 + 8 * (1 - total) + 6 * canvas * (1 - canvas)) *
    (1 - 0.85 * obstruction) * clarity * haze * horizon;
  const moon = SunCalc.getMoonPosition(instant, spot.lat, spot.lng);
  const moonLight = SunCalc.getMoonIllumination(instant).fraction * smooth(0, 30, moon.altitude * 180 / Math.PI);
  const pollution = spot.lightPollution === 'Low' ? 6 : spot.lightPollution === 'Mid' ? 18 : 32;
  const stars = smooth(6, 18, -altitude) * Math.max(0, 100 * (1 - total) ** 1.4 - pollution - 20 * moonLight) * clarity * haze;
  const scenes = [
    { scene: 'golden-light' as SkyScene, value: golden, label: 'Golden light' },
    { scene: 'colorful-clouds' as SkyScene, value: colorPotential, label: 'Colorful clouds possible' },
    { scene: 'afterglow' as SkyScene, value: afterglow, label: sun.azimuth > 0 ? 'Afterglow possible' : 'Dawn glow possible' },
    { scene: 'blue-twilight' as SkyScene, value: twilight, label: 'Blue twilight' },
    { scene: 'clear-views' as SkyScene, value: clearViews, label: 'Clear views' },
    { scene: 'stargazing' as SkyScene, value: stars, label: 'Stargazing' },
  ];
  // A layer-qualified contract is reserved for a future verified source.
  // A generic cloud top, PBL height, or spot elevation cannot establish this.
  if (h.marineLayerVerified === true && finite(h.marineCloudTopMsl) && finite(h.marineCloudBaseMsl) &&
      h.marineCloudBaseMsl >= 0 && h.marineCloudTopMsl > h.marineCloudBaseMsl &&
      finite(h.marineHeightUncertaintyM) && h.marineHeightUncertaintyM >= 0 &&
      spot.elevation > h.marineCloudTopMsl + Math.max(75, h.marineHeightUncertaintyM)) {
    scenes.push({ scene: 'fog-scenery', value: 78 * daylight * clarity * haze * low, label: 'Fog scenery' });
  }
  // At full darkness, vanishing sunset tails cannot label a cloudy night as golden.
  if (altitude <= -15) for (const scene of scenes) if (scene.scene !== 'stargazing') scene.value = 0;
  scenes.sort((a, b) => b.value - a.value || (a.scene === 'stargazing' ? -1 : 1));
  let selected = scenes[0];
  if (altitude > -4 && altitude < 9 && low < 0.3 && canvas < 0.35 && selected.scene === 'clear-views') {
    selected = { ...selected, scene: 'golden-light', label: 'Golden light' };
  }
  if (h.visibilityKm < 2 && low > 0.5 && finite(h.humidity) && h.humidity >= 90) {
    selected = { scene: 'fog', value: Math.min(selected.value, 25), label: 'Fog likely' };
    reasons.push('Low clouds, high humidity, and reduced visibility suggest fog at the viewpoint.');
  } else if (h.visibilityKm < 3) {
    selected = { ...selected, scene: 'obscured', label: 'View likely obscured' };
  } else if (low >= 0.75 && total >= 0.85 && selected.value < 40) {
    selected = { ...selected, scene: 'overcast', label: 'Low overcast' };
  } else if (selected.scene === 'stargazing' && selected.value < 40) {
    selected = { ...selected, label: 'Night sky' };
  }
  if (selected.scene === 'colorful-clouds') {
    reasons.push('Middle or high clouds may catch low-angle sunlight.');
    limitations.push('Cloud thickness and the distant sunlight path are unresolved. Color is not assured.');
  } else if (selected.scene === 'golden-light') {
    reasons.push('The sun is low, with limited forecast obstruction.');
    limitations.push('Clouds along the distant sunlight path may still block golden light.');
  } else if (selected.scene === 'afterglow') {
    reasons.push('Low-angle sunlight may illuminate clouds while the sun is below the horizon.');
    limitations.push('Cloud thickness and the distant sunlight path are unresolved. Afterglow is not assured.');
  } else if (selected.scene === 'blue-twilight') {
    reasons.push('Scattered sunlight may leave blue twilight and a fading horizon glow.');
    limitations.push('Twilight brightness and visible colors depend on local cloud and horizon conditions.');
  } else if (selected.scene === 'clear-views') reasons.push('Forecast visibility and cloud structure favor open sky views.');
  else if (selected.scene === 'stargazing') reasons.push('Darkness, cloud cover, light pollution, and the moon above the horizon affect this estimate.');
  else if (selected.scene === 'fog-scenery') reasons.push('The viewpoint is above a verified marine cloud layer, with a height margin.');
  if (low > 0.4 && h.marineLayerVerified !== true) limitations.push('Marine cloud height is unavailable. An above-fog view cannot be confirmed.');
  return { score: Math.round(bounded(selected.value, 0, 100)), scene: selected.scene, label: selected.label,
    reasons, limitations, colorPotential: Math.round(colorPotential) };
}

/** Interpolate supported instantaneous weather fields between adjacent native
 * hours. Never bridge an absent hour or interpolate hourly radiation means.
 * This supports continuous light estimates, not minute-level fog predictions.
 */
export function skyWeatherAtTime(forecast: SpotForecast, instant: Date): HourlyForecast | null {
  if (!finite(instant.getTime())) return null;
  const key = formatCanonicalHourKey(instant);
  const current = forecast.hours[key];
  if (!current) return null;
  const hourStart = Date.parse(key);
  const next = forecast.hours[formatCanonicalHourKey(new Date(hourStart + HOUR))];
  if (!next) return current;
  const weight = (instant.getTime() - hourStart) / HOUR;
  const result = { ...current };
  const fields = ['cloud', 'cloudLow', 'cloudMid', 'cloudHigh', 'visibilityKm', 'humidity',
    'tempF', 'precipProb', 'windMph', 'gustMph', 'pm25', 'aqi', 'dewPointF', 'pressureMsl', 'aerosolOpticalDepth'] as const;
  for (const field of fields) {
    const a = current[field], b = next[field];
    if (finite(a) && finite(b) && (a >= 0 && b >= 0 || field === 'tempF' || field === 'dewPointF')) {
      result[field] = a + (b - a) * weight;
    }
  }
  return result;
}

const readingAt = (spot: Spot, forecast: SpotForecast, at: number) =>
  readSkyAtTime(spot, skyWeatherAtTime(forecast, new Date(at)), new Date(at));

/** Every selection uses the same centered 15-minute quality interval.
 * The remaining contiguous good period is measured separately, up to 3 hours.
 * The mode parameter preserves the public call contract without changing scope.
 */
export function buildSkyWindow(spot: Spot, forecast: SpotForecast | null, instant: Date, _mode: ViewMode = 'now', nowMs = Date.now()): SkyWindow {
  void _mode;
  const anchor = instant.getTime();
  const evaluatedStart = anchor - STEP / 2;
  const evaluatedEnd = anchor + STEP / 2;
  const empty: SkyWindow = { ...unavailableSky(), start: anchor, end: anchor,
    evaluatedStart, evaluatedEnd, durationMinutes: 0, coverage: 0, stability: 'unknown' };
  if (!forecast || !finite(anchor)) return empty;
  const representative = readingAt(spot, forecast, anchor);
  if (representative.score === null) return empty;
  const samples = [-5, 0, 5].map(minutes => readingAt(spot, forecast, anchor + minutes * 60_000));
  const supported = samples.filter(sample => sample.score !== null);
  const coverage = supported.length / samples.length;
  if (coverage < 0.5) return { ...empty, coverage };
  const values = supported.map(sample => sample.score!);
  const score = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const spread = Math.max(...values) - Math.min(...values);
  const limitations = [...new Set(supported.flatMap(sample => sample.limitations))];
  limitations.push('Weather inputs are hourly; viewing times and durations are approximate.');
  const agreement = cloudAgreement(forecast.cloudEnsemble, evaluatedStart, evaluatedEnd, nowMs, forecast.hours);
  if (agreement.agreement === 'mixed') limitations.push('Ensemble forecasts disagree about cloud cover or visibility.');
  if (coverage < 1) limitations.push('Part of this viewing window has missing weather data.');
  if (spread > 20) limitations.push('Conditions or available light change substantially during this window.');
  let end = anchor;
  const isStars = representative.scene === 'stargazing';
  if (score >= 60) {
    for (let at = anchor; at < anchor + 3 * HOUR; at += STEP) {
      const sample = readingAt(spot, forecast, at);
      if (sample.score === null || sample.score < 60 || (sample.scene === 'stargazing') !== isStars) break;
      const hourEnd = Date.parse(formatCanonicalHourKey(new Date(at))) + HOUR;
      const crossesUnsupportedHour = at + STEP > hourEnd && readingAt(spot, forecast, hourEnd).score === null;
      end = crossesUnsupportedHour ? hourEnd : at + STEP;
      if (end < at + STEP) break;
    }
  }
  return { ...representative, score, limitations, cloudAgreement: agreement,
    colorPotential: Math.round(supported.reduce((sum, sample) => sum + sample.colorPotential, 0) / supported.length),
    start: anchor, end, evaluatedStart, evaluatedEnd,
    durationMinutes: Math.round((end - anchor) / 60_000), durationCapped: end === anchor + 3 * HOUR,
    coverage, stability: coverage < 1 ? 'unknown' : spread > 20 ? 'changing' : 'steady' };
}

export interface SunsetOpportunity {
  peakAt: number;
  start: number;
  end: number;
  window: SkyWindow;
}

/** Compare short sky experiences around this day's sunset. These samples refine
 * solar geometry and interpolate hourly weather; they are approximate timings.
 */
export function findSunsetOpportunity(spot: Spot, forecast: SpotForecast | null,
  sunset: Date, nowMs = Date.now()): SunsetOpportunity | null {
  if (!forecast || !finite(sunset.getTime())) return null;
  const from = Math.max(sunset.getTime() - HOUR, nowMs);
  const until = sunset.getTime() + 90 * 60_000;
  const candidates: Array<{ at: number; reading: SkyReading }> = [];
  for (let at = Math.ceil(from / STEP) * STEP; at < until; at += STEP) {
    const altitude = SunCalc.getPosition(new Date(at), spot.lat, spot.lng).altitude * 180 / Math.PI;
    if (altitude > 6 || altitude < -12) continue;
    const reading = readingAt(spot, forecast, at);
    if (reading.score !== null && reading.scene !== 'stargazing') candidates.push({ at, reading });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.reading.score! - a.reading.score! ||
    Math.abs(a.at - sunset.getTime()) - Math.abs(b.at - sunset.getTime()) || a.at - b.at);
  const peak = candidates[0];
  const window = buildSkyWindow(spot, forecast, new Date(peak.at), 'now', nowMs);
  // Only the supported run containing the recommended time belongs to this outing.
  let start = peak.at;
  if (window.score !== null && window.score >= 60) {
    while (start - STEP >= from) {
      if (SunCalc.getPosition(new Date(start - STEP), spot.lat, spot.lng).altitude * 180 / Math.PI > 6) break;
      const previous = readingAt(spot, forecast, start - STEP);
      if (previous.score === null || previous.score < 60 || previous.scene === 'stargazing') break;
      start -= STEP;
    }
  }
  return { peakAt: peak.at, start, end: Math.min(until, window.end), window };
}

export function formatSkyDuration(window: SkyWindow): string {
  if (window.score === null) return 'Duration unavailable';
  if (window.durationMinutes === 0) return 'No good period forecast';
  return `${window.durationCapped ? 'At least' : 'About'} ${window.durationMinutes} min`;
}

export function skyQualityLabel(score: number | null): string {
  if (score === null || !finite(score)) return 'Unavailable';
  return score >= 80 ? 'Very good' : score >= 60 ? 'Good' : score >= 40 ? 'Limited' : 'Poor';
}

export function formatSkyWindow(window: SkyWindow, timeZone: string): string {
  if (window.score === null) return 'Viewing window unavailable';
  if (window.durationMinutes === 0) return 'No good period forecast';
  const minutes = Math.max(15, Math.round(window.durationMinutes / 15) * 15);
  return `${formatInstantTimeLabel(new Date(window.start), timeZone)} to ${formatInstantTimeLabel(new Date(window.end), timeZone)} · ${window.durationCapped ? 'At least' : 'About'} ${minutes} min`;
}

/** Morning/afternoon/evening blocks, with contiguous support. No exact peak
 * minute is advertised several days ahead and gaps cannot bridge a window.
 */
export function buildPlanningDays(spot: Spot, forecast: SpotForecast | null, now: Date, timeZone: string): PlanningDay[] {
  if (!forecast) return [];
  const today = formatCityCalendarDate(now, timeZone);
  const days = new Map<string, Array<{ instant: Date; hour: number; h: HourlyForecast }>>();
  const formatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone });
  for (const key of Object.keys(forecast.hours).sort()) {
    const instant = new Date(key);
    if (!finite(instant.getTime()) || instant <= now) continue;
    const date = formatCityCalendarDate(instant, timeZone);
    if (date <= today) continue;
    const hour = Number(formatter.format(instant));
    if (hour < 6 || hour >= 22) continue;
    const rows = days.get(date) ?? [];
    rows.push({ instant, hour, h: forecast.hours[key] });
    days.set(date, rows);
  }
  return [...days].slice(0, 7).map(([date, rows]) => {
    const candidates = rows.map(row => ({ row, window: buildSkyWindow(spot, forecast, row.instant, 'now', now.getTime()) }))
      .filter(c => c.window.score !== null && c.window.coverage === 1);
    const priority = (c: typeof candidates[number]) => c.window.score! -
      (c.window.cloudAgreement?.agreement === 'mixed' ? 20 : 0) - (c.window.stability === 'changing' ? 10 : 0) -
      (c.window.durationMinutes < 45 ? 15 : 0);
    candidates.sort((a, b) => priority(b) - priority(a) || a.row.hour - b.row.hour);
    const best = candidates[0];
    if (!best) return { date, window: null, period: 'Unavailable', rainRisk: false, windy: false };
    const period = best.row.hour < 12 ? 'Morning' : best.row.hour < 17 ? 'Afternoon' : 'Evening';
    const block = rows.filter(row => (row.hour < 12 ? 'Morning' : row.hour < 17 ? 'Afternoon' : 'Evening') === period);
    return { date, window: best.window, period,
      rainRisk: block.some(row => finite(row.h.precipProb) && row.h.precipProb > 50),
      windy: block.some(row => finite(row.h.gustMph) && row.h.gustMph > 25) };
  });
}
