// Temperature-only expanded sheet. Layout (top → bottom):
//
//   1. Hero: big city-avg temp + warming/cooling/steady trend chip,
//      plus a one-liner about where today peaks.
//   2. Warmest / Coolest cards: the two outlier neighborhoods at the
//      currently-scrubbed hour, color-coded amber/blue.
//   3. Next-12-hours line chart: smooth city-avg curve with a marker
//      and dashed guide on the peak hour.
//   4. Karl quote card: longer-form narrative with an amber side rail.

import { useMemo } from 'react';
import { type SpotForecast } from '../../utils/weather';
import { buildSamples } from '../../utils/weatherSamples';
import { computeCityStats } from '../../utils/labelStats';
import { KarlQuoteCard, MetricChart, SectionLabel, TrendChip } from './shared';
import {
  buildCityAvgSeries,
  neighborhoodName,
  peakIndex,
  shortHourLabel,
  shortTermDelta,
  type SeriesPoint,
  type TrendDir,
} from './utils';

interface TempExpandedProps {
  hourKey: string;
  hourKeys: string[];
  forecasts: Map<number, SpotForecast>;
  longForm: string;
}

export default function TempExpanded({
  hourKey,
  hourKeys,
  forecasts,
  longForm,
}: TempExpandedProps) {
  const series = useMemo(
    () => buildCityAvgSeries('temp', hourKey, hourKeys, forecasts),
    [hourKey, hourKeys, forecasts],
  );

  const cityNow = useMemo(() => {
    const samples = buildSamples('temp', hourKey, forecasts);
    return computeCityStats(samples);
  }, [hourKey, forecasts]);

  const peak = useMemo<SeriesPoint | null>(() => {
    const idx = peakIndex(series);
    return idx >= 0 ? series[idx] : null;
  }, [series]);

  const trend = useMemo<TrendDir>(() => {
    const delta = shortTermDelta(series);
    if (delta >= 1.5) return 'up';
    if (delta <= -1.5) return 'down';
    return 'steady';
  }, [series]);

  const warmestName = neighborhoodName(cityNow.highId);
  const coolestName = neighborhoodName(cityNow.lowId);

  const subtitle = useMemo(() => {
    if (!peak || series.length === 0) return '';
    const peakIdx = series.findIndex((s) => s.key === peak.key);
    const isFlat = Math.abs(peak.value - series[0].value) < 1.5;
    if (isFlat) return `Holding near ${Math.round(peak.value)}° through the evening.`;
    if (peakIdx === 0) {
      // Already at the high — the rest of the window only goes down.
      return `Down from ${Math.round(peak.value)}° here, easing through the night.`;
    }
    const tail = series[series.length - 1].value;
    const direction = tail < peak.value - 1 ? ', then drops' : '';
    return `Peaks at ${Math.round(peak.value)}° around ${shortHourLabel(peak.key)}${direction}.`;
  }, [peak, series]);

  return (
    <div className="px-4 pt-3 pb-4 space-y-4">
      <section>
        <div className="flex items-baseline gap-3">
          <span className="text-[44px] leading-none font-light tabular-nums text-[#1a1a18]">
            {Number.isFinite(cityNow.avg) ? `${Math.round(cityNow.avg)}°` : '–'}
          </span>
          <TrendChip
            dir={trend}
            upLabel="warming"
            downLabel="cooling"
            upColor="var(--color-green-muted)"
            downColor="var(--color-blue-soft)"
          />
        </div>
        {subtitle && <p className="mt-2 text-[13px] text-[#5a5a55]">{subtitle}</p>}
      </section>

      <section className="grid grid-cols-2 gap-2.5">
        <ExtremeCard
          label="Warmest"
          value={cityNow.max}
          location={warmestName}
          color="var(--color-amber-warm)"
        />
        <ExtremeCard
          label="Coolest"
          value={cityNow.min}
          location={coolestName}
          color="var(--color-blue-soft)"
        />
      </section>

      <section>
        <SectionLabel>Next 12 hours</SectionLabel>
        <MetricChart
          series={series}
          markerKey={peak?.key ?? null}
          color="var(--color-amber-warm)"
          ariaLabel="Citywide temperature next 12 hours"
        />
      </section>

      <KarlQuoteCard text={longForm} accent="var(--color-amber-warm)" />
    </div>
  );
}

interface ExtremeCardProps {
  label: string;
  value: number;
  location: string;
  color: string;
}

function ExtremeCard({ label, value, location, color }: ExtremeCardProps) {
  return (
    <div className="rounded-xl bg-cream-dark/70 px-3 pt-3 pb-3.5 flex flex-col items-center text-center">
      <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-gray-500">
        {label}
      </span>
      <span
        className="mt-1.5 text-[28px] leading-none font-light tabular-nums"
        style={{ color }}
      >
        {Number.isFinite(value) ? `${Math.round(value)}°` : '–'}
      </span>
      <span className="mt-1.5 text-[12.5px] text-[#3a3a36]">{location || '–'}</span>
    </div>
  );
}
