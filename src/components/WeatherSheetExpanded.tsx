import { useMemo } from 'react';
import { neighborhoods } from '../data/neighborhoods';
import { type SpotForecast, fogDensity } from '../utils/weather';
import { metricLabel, type WeatherMetric } from '../utils/interpolate';
import { buildSamples, buildWindDirs, pickMetric } from '../utils/weatherSamples';
import { computeCityStats } from '../utils/labelStats';
import { longFormFor } from '../utils/narrative';

interface WeatherSheetExpandedProps {
  metric: WeatherMetric;
  hourKey: string;
  hourKeys: string[];
  forecasts: Map<number, SpotForecast>;
  onHourChange: (key: string) => void;
}

const HOURLY_STRIP_LENGTH = 12;

/**
 * Pulled-up bottom-sheet content. Three sections, top to bottom:
 *
 *   1. Hourly strip: city-average of the active metric for the next 12
 *      hours starting at `hourKey`. Tapping a cell scrubs to that hour.
 *   2. Karl commentary: longer-form prose from `narrative.ts`.
 *   3. Layer-specific detail: e.g. peak gust for Wind, Karl arrival/
 *      departure ETA for Fog. Falls back to a quiet line for the others.
 */
export default function WeatherSheetExpanded({
  metric,
  hourKey,
  hourKeys,
  forecasts,
  onHourChange,
}: WeatherSheetExpandedProps) {
  const strip = useMemo(
    () => buildHourlyStrip(metric, hourKey, hourKeys, forecasts),
    [metric, hourKey, hourKeys, forecasts],
  );

  const longForm = useMemo(() => {
    if (!hourKey || forecasts.size === 0) return '';
    const samples = buildSamples(metric, hourKey, forecasts);
    if (samples.size === 0) return '';
    const prevIdx = hourKeys.indexOf(hourKey) - 1;
    const prev =
      prevIdx >= 0 ? buildSamples(metric, hourKeys[prevIdx], forecasts) : null;
    const windDirs = metric === 'wind' ? buildWindDirs(hourKey, forecasts) : undefined;
    return longFormFor(metric, samples, prev, windDirs);
  }, [metric, hourKey, hourKeys, forecasts]);

  const detail = useMemo(
    () => layerDetail(metric, hourKey, hourKeys, forecasts),
    [metric, hourKey, hourKeys, forecasts],
  );

  return (
    <div className="px-3 pt-2 pb-3 space-y-4">
      <section>
        <SectionLabel>{metricLabel(metric)} · next 12 hours</SectionLabel>
        <div
          className="mt-1.5 -mx-1 overflow-x-auto score-cards-scroll"
          aria-label={`Hourly ${metricLabel(metric)} forecast`}
        >
          <div className="flex gap-1 px-1 min-w-max">
            {strip.map((cell) => (
              <button
                key={cell.key}
                type="button"
                onClick={() => onHourChange(cell.key)}
                className={`min-w-[44px] flex-shrink-0 rounded-lg px-2 py-2 flex flex-col items-center transition-colors ${
                  cell.key === hourKey
                    ? 'bg-[#1a1a18] text-white'
                    : 'bg-cream-dark/60 text-gray-700 hover:bg-cream-dark/80'
                }`}
                aria-pressed={cell.key === hourKey}
              >
                <span className="text-[10px] uppercase tracking-wider opacity-70">
                  {cell.label}
                </span>
                <span className="mt-1 text-[14px] font-semibold tabular-nums">
                  {cell.display}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <SectionLabel>Karl says</SectionLabel>
        <p className="mt-1 font-serif italic text-[12.5px] leading-snug text-[#3a3a36]">
          {longForm || 'Loading forecast…'}
        </p>
      </section>

      {detail && (
        <section>
          <SectionLabel>{detail.title}</SectionLabel>
          <p className="mt-1 text-[12px] leading-snug text-[#3a3a36]">
            {detail.body}
          </p>
        </section>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-gray-500">
      {children}
    </div>
  );
}

interface HourlyCell {
  key: string;
  label: string;
  display: string;
}

/**
 * 12-cell horizontal scroll: city-average of the active metric for each of
 * the next `HOURLY_STRIP_LENGTH` hours starting at `hourKey`. Each cell
 * shows a short hour label ("3pm", "12am") and the rounded value with the
 * metric's own format (e.g. "62°", "85%", "Foggy").
 */
function buildHourlyStrip(
  metric: WeatherMetric,
  hourKey: string,
  hourKeys: string[],
  forecasts: Map<number, SpotForecast>,
): HourlyCell[] {
  if (!hourKey || hourKeys.length === 0) return [];
  const startIdx = Math.max(0, hourKeys.indexOf(hourKey));
  const endIdx = Math.min(hourKeys.length, startIdx + HOURLY_STRIP_LENGTH);

  const cells: HourlyCell[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    const key = hourKeys[i];
    const samples = buildSamples(metric, key, forecasts);
    const stats = computeCityStats(samples);
    const value = stats.avg;
    cells.push({
      key,
      label: shortHourLabel(key),
      display: displayValueFor(metric, value),
    });
  }
  return cells;
}

function shortHourLabel(hourKey: string): string {
  const parsed = new Date(`${hourKey}:00:00`);
  if (Number.isNaN(parsed.getTime())) return hourKey;
  return parsed
    .toLocaleTimeString(undefined, { hour: 'numeric' })
    .replace(/\s?(AM|PM)/, (_, p) => p.toLowerCase());
}

function displayValueFor(metric: WeatherMetric, value: number): string {
  if (!Number.isFinite(value)) return '–';
  switch (metric) {
    case 'temp':
      return `${Math.round(value)}°`;
    case 'fog':
      // Words instead of numbers, matching the on-map labels.
      if (value >= 0.65) return 'Fog';
      if (value >= 0.35) return 'Haze';
      return 'Clear';
    case 'wind':
      return `${Math.round(value)}`;
    case 'clouds':
    case 'precip':
      return `${Math.round(value)}%`;
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled metric: ${String(_exhaustive)}`);
    }
  }
}

interface LayerDetail {
  title: string;
  body: string;
}

/**
 * Layer-specific extra content for the bottom of the expanded sheet.
 * Returns null when there's nothing additional worth saying for the layer.
 */
function layerDetail(
  metric: WeatherMetric,
  hourKey: string,
  hourKeys: string[],
  forecasts: Map<number, SpotForecast>,
): LayerDetail | null {
  if (!hourKey || forecasts.size === 0) return null;

  switch (metric) {
    case 'wind': {
      // Peak gust over the next 24h, plus where it lands.
      const gust = peakNext24h(hourKey, hourKeys, forecasts, (h) => h.gustMph);
      if (!gust) return null;
      return {
        title: 'Gusts',
        body: `Peak ${Math.round(gust.value)} mph at ${gust.locationName}, ${shortHourLabel(gust.key)}.`,
      };
    }
    case 'fog': {
      const eta = predictKarl(hourKey, hourKeys, forecasts);
      return { title: "Karl's schedule", body: eta };
    }
    case 'precip': {
      const next = nextWetHour(hourKey, hourKeys, forecasts);
      if (!next) {
        return {
          title: 'Next wet hour',
          body: 'Nothing in the model for the next 24 hours.',
        };
      }
      return {
        title: 'Next wet hour',
        body: `${shortHourLabel(next.key)} at ${next.locationName} (${Math.round(next.value)}%).`,
      };
    }
    case 'temp': {
      const peak = peakNext24h(hourKey, hourKeys, forecasts, (h) => h.tempF);
      if (!peak) return null;
      return {
        title: 'Citywide peak',
        body: `${Math.round(peak.value)}° at ${peak.locationName}, ${shortHourLabel(peak.key)}.`,
      };
    }
    case 'clouds': {
      const peak = peakNext24h(hourKey, hourKeys, forecasts, (h) => h.cloud);
      if (!peak) return null;
      return {
        title: 'Cloudiest hour',
        body: `${Math.round(peak.value)}% at ${peak.locationName}, ${shortHourLabel(peak.key)}.`,
      };
    }
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled metric: ${String(_exhaustive)}`);
    }
  }
}

interface PeakHit {
  key: string;
  value: number;
  locationName: string;
}

/**
 * Generic "highest value over the next 24h, citywide" lookup. Walks every
 * loaded forecast for every hour in the next 24 and returns the (hour,
 * neighborhood, value) of the maximum. Used by Wind, Temp, Clouds.
 */
function peakNext24h(
  hourKey: string,
  hourKeys: string[],
  forecasts: Map<number, SpotForecast>,
  pick: (h: { tempF: number; cloud: number; gustMph: number }) => number,
): PeakHit | null {
  const startIdx = Math.max(0, hourKeys.indexOf(hourKey));
  const endIdx = Math.min(hourKeys.length, startIdx + 24);
  let best: PeakHit | null = null;
  for (let i = startIdx; i < endIdx; i++) {
    const key = hourKeys[i];
    for (const n of neighborhoods) {
      const f = forecasts.get(n.id);
      const h = f?.hours[key];
      if (!h) continue;
      const v = pick(h);
      if (!Number.isFinite(v)) continue;
      if (!best || v > best.value) {
        best = { key, value: v, locationName: n.name };
      }
    }
  }
  return best;
}

function nextWetHour(
  hourKey: string,
  hourKeys: string[],
  forecasts: Map<number, SpotForecast>,
): PeakHit | null {
  const startIdx = Math.max(0, hourKeys.indexOf(hourKey));
  const endIdx = Math.min(hourKeys.length, startIdx + 24);
  for (let i = startIdx; i < endIdx; i++) {
    const key = hourKeys[i];
    let bestForHour: PeakHit | null = null;
    for (const n of neighborhoods) {
      const f = forecasts.get(n.id);
      const h = f?.hours[key];
      if (!h) continue;
      const v = pickMetric('precip', h);
      if (!Number.isFinite(v) || v < 30) continue;
      if (!bestForHour || v > bestForHour.value) {
        bestForHour = { key, value: v, locationName: n.name };
      }
    }
    if (bestForHour) return bestForHour;
  }
  return null;
}

/**
 * Predict when Karl arrives or leaves over the next 24h based on citywide
 * average fog density. Crossing 0.5 upward = "rolling in", crossing 0.3
 * downward = "lifting". Reports both transitions when both occur.
 */
function predictKarl(
  hourKey: string,
  hourKeys: string[],
  forecasts: Map<number, SpotForecast>,
): string {
  const startIdx = Math.max(0, hourKeys.indexOf(hourKey));
  const endIdx = Math.min(hourKeys.length, startIdx + 24);

  const series: Array<{ key: string; avg: number }> = [];
  for (let i = startIdx; i < endIdx; i++) {
    const key = hourKeys[i];
    let sum = 0;
    let count = 0;
    for (const n of neighborhoods) {
      const f = forecasts.get(n.id);
      const h = f?.hours[key];
      if (!h) continue;
      sum += fogDensity(h);
      count += 1;
    }
    if (count > 0) series.push({ key, avg: sum / count });
  }
  if (series.length === 0) return 'No forecast data available yet.';

  let arrivesAt: string | null = null;
  let lifts: string | null = null;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].avg;
    const cur = series[i].avg;
    if (!arrivesAt && prev < 0.5 && cur >= 0.5) arrivesAt = series[i].key;
    if (!lifts && prev > 0.3 && cur <= 0.3) lifts = series[i].key;
  }

  if (arrivesAt && lifts) {
    return `Rolling in around ${shortHourLabel(arrivesAt)}, lifting around ${shortHourLabel(lifts)}.`;
  }
  if (arrivesAt) return `Rolling in around ${shortHourLabel(arrivesAt)}.`;
  if (lifts) return `Lifting around ${shortHourLabel(lifts)}.`;

  // No transitions in the window — describe the steady state.
  const avg = series.reduce((s, x) => s + x.avg, 0) / series.length;
  if (avg >= 0.5) return 'Steady fog through the next 24 hours. Karl is staying put.';
  if (avg >= 0.25) return 'Patchy haze for the next 24 hours, no full clear-out.';
  return 'Clear through the next 24 hours. Karl is sitting this one out.';
}
