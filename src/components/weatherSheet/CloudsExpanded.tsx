// Clouds-only expanded sheet. Layout (top → bottom):
//
//   1. Hero: city-avg cloud cover % + clearing/clouding/steady chip,
//      with a one-liner about how the next 12 hours play out.
//   2. Clearest-window pill: contiguous block of low-cloud hours so the
//      user can spot the golden window at a glance.
//   3. Next-12-hours line chart: blue smooth curve with a soft fill
//      below and a marker on the trough (clearest moment).
//   4. Karl quote card: longer-form narrative.

import { useMemo } from 'react';
import { type SpotForecast } from '../../utils/weather';
import { InfoPill, KarlQuoteCard, MetricChart, SectionLabel, TrendChip } from './shared';
import {
  buildCityAvgSeries,
  shortHourLabel,
  shortTermDelta,
  troughIndex,
  type SeriesPoint,
  type TrendDir,
} from './utils';

interface CloudsExpandedProps {
  hourKey: string;
  hourKeys: string[];
  forecasts: Map<number, SpotForecast>;
  longForm: string;
}

const CLOUDS_COLOR = 'var(--color-blue-soft)';

export default function CloudsExpanded({
  hourKey,
  hourKeys,
  forecasts,
  longForm,
}: CloudsExpandedProps) {
  const series = useMemo(
    () => buildCityAvgSeries('clouds', hourKey, hourKeys, forecasts),
    [hourKey, hourKeys, forecasts],
  );

  const headValue = series[0]?.value ?? NaN;

  // Trend uses raw % delta — 8% over the next ~3 hours is roughly the
  // smallest change that reads as "noticeably clearing/clouding" on the
  // map. Below that we leave the chip as steady.
  const trend = useMemo<TrendDir>(() => {
    const delta = shortTermDelta(series);
    if (delta >= 8) return 'up';
    if (delta <= -8) return 'down';
    return 'steady';
  }, [series]);

  const clearest = useMemo(() => findClearestWindow(series), [series]);

  const subtitle = useMemo(() => {
    if (series.length === 0) return '';
    const head = Math.round(headValue);
    const tail = Math.round(series[series.length - 1].value);
    const peak = series.reduce((acc, s) => (s.value > acc.value ? s : acc), series[0]);
    const trough = series.reduce((acc, s) => (s.value < acc.value ? s : acc), series[0]);
    const range = peak.value - trough.value;
    if (range < 12) {
      // Cover barely moves — describe the steady state instead of a story.
      if (head >= 75) return 'Overcast and holding through the evening.';
      if (head <= 20) return 'Clear and holding through the evening.';
      return 'Mixed cover, holding steady through the evening.';
    }
    const troughIdx = series.findIndex((s) => s.key === trough.key);
    const peakIdx = series.findIndex((s) => s.key === peak.key);
    if (troughIdx > 0 && peakIdx > troughIdx) {
      return `Clearing through the afternoon, building again after ${shortHourLabel(peak.key)}.`;
    }
    if (peakIdx > 0 && troughIdx > peakIdx) {
      return `Building through ${shortHourLabel(peak.key)}, then breaking up later.`;
    }
    if (tail < head - 10) return `Clearing toward ${shortHourLabel(series[series.length - 1].key)}.`;
    if (tail > head + 10) return `Clouding up toward ${shortHourLabel(series[series.length - 1].key)}.`;
    return 'Mixed cover through the next 12 hours.';
  }, [headValue, series]);

  return (
    <div className="px-4 pt-3 pb-4 space-y-4">
      <section>
        <div className="flex items-baseline gap-3">
          <span className="text-[44px] leading-none font-light tabular-nums text-[#1a1a18]">
            {Number.isFinite(headValue) ? `${Math.round(headValue)}%` : '–'}
          </span>
          <TrendChip
            dir={trend}
            upLabel="clouding"
            downLabel="clearing"
            upColor="var(--color-blue-soft)"
            downColor="var(--color-green-muted)"
          />
        </div>
        {subtitle && <p className="mt-2 text-[13px] text-[#5a5a55]">{subtitle}</p>}
      </section>

      {clearest && (
        <section>
          <InfoPill dotColor="var(--color-green-muted)">
            <strong className="font-semibold">Clearest window:</strong>{' '}
            {clearest.label} · {Math.round(clearest.coverAvg)}% cover
          </InfoPill>
        </section>
      )}

      <section>
        <SectionLabel>Cloud cover</SectionLabel>
        <MetricChart
          series={series}
          markerKey={clearest?.markerKey ?? null}
          color={CLOUDS_COLOR}
          ariaLabel="Citywide cloud cover next 12 hours"
          withFill
          yMinFloor={0}
          yMaxCeil={100}
        />
      </section>

      <KarlQuoteCard text={longForm} accent={CLOUDS_COLOR} />
    </div>
  );
}

interface ClearestWindow {
  /** Human label like "5–7pm" or "now–4pm". */
  label: string;
  /** Average cloud % across the window. */
  coverAvg: number;
  /** Hour-key inside the window where cover hits its minimum. */
  markerKey: string;
}

/**
 * Find the longest contiguous run of hours where cloud cover stays
 * within `tolerancePct` of the trough. Returns the window's friendly
 * label, average cover, and the trough key (used as the chart marker).
 *
 * Returns null when there's no meaningful trough — e.g. an all-overcast
 * day or a series too short to have a window.
 */
function findClearestWindow(series: SeriesPoint[]): ClearestWindow | null {
  if (series.length < 2) return null;
  const tIdx = troughIndex(series);
  if (tIdx < 0) return null;
  const trough = series[tIdx].value;
  // If the day is overcast, "clearest window" stops being useful — bail
  // so the pill doesn't promise a sun break that won't happen.
  if (trough >= 70) return null;

  const tolerance = 8; // within ~8% of the trough still counts as the window
  const ceiling = trough + tolerance;
  let start = tIdx;
  while (start > 0 && series[start - 1].value <= ceiling) start--;
  let end = tIdx;
  while (end < series.length - 1 && series[end + 1].value <= ceiling) end++;

  const slice = series.slice(start, end + 1);
  const coverAvg = slice.reduce((s, p) => s + p.value, 0) / slice.length;
  return {
    label: windowLabel(series[start].key, series[end].key, start === 0),
    coverAvg,
    markerKey: series[tIdx].key,
  };
}

function windowLabel(startKey: string, endKey: string, startIsNow: boolean): string {
  if (startKey === endKey) {
    return startIsNow ? 'now' : shortHourLabel(startKey);
  }
  const start = startIsNow ? 'now' : shortHourLabel(startKey);
  // End label is exclusive — show the hour after the last sample so a
  // 5pm-only window reads "5–6pm" rather than "5–5pm".
  const end = shortHourLabel(addHour(endKey));
  return `${start}–${end}`;
}

function addHour(hourKey: string): string {
  const parsed = new Date(`${hourKey}:00:00`);
  if (Number.isNaN(parsed.getTime())) return hourKey;
  parsed.setHours(parsed.getHours() + 1);
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  const h = String(parsed.getHours()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}`;
}
