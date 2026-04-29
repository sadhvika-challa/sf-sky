// Precipitation expanded sheet has two visually distinct modes:
//
//   * Wet mode — peak probability ≥ WET_THRESHOLD anywhere in the next
//     12h. Renders the full hero/pill/chart/Karl stack so the user can
//     see when, where, and how hard the rain hits.
//   * Dry mode — nothing in the model. Collapses to a centered "No
//     rain" headline + Karl quote so we don't fake a chart out of zeros.

import { useMemo } from 'react';
import { neighborhoods } from '../../data/neighborhoods';
import { type SpotForecast } from '../../utils/weather';
import { buildSamples } from '../../utils/weatherSamples';
import { computeCityStats } from '../../utils/labelStats';
import { InfoPill, KarlQuoteCard, MetricChart, SectionLabel } from './shared';
import {
  HOURLY_STRIP_LENGTH,
  buildCityAvgSeries,
  shortHourLabel,
  type SeriesPoint,
} from './utils';

interface PrecipExpandedProps {
  hourKey: string;
  hourKeys: string[];
  forecasts: Map<number, SpotForecast>;
  longForm: string;
}

const PRECIP_COLOR = 'var(--color-pin-poor)';

// Anything below ~10% is well within "noise" for the model — the Open-
// Meteo spread alone covers that. Treat the layer as "dry" until the
// peak probability clears this bar.
const WET_THRESHOLD = 10;

export default function PrecipExpanded({
  hourKey,
  hourKeys,
  forecasts,
  longForm,
}: PrecipExpandedProps) {
  const series = useMemo(
    () => buildCityAvgSeries('precip', hourKey, hourKeys, forecasts),
    [hourKey, hourKeys, forecasts],
  );

  const peakHit = useMemo(
    () => peakPrecipNext12h(hourKey, hourKeys, forecasts),
    [hourKey, hourKeys, forecasts],
  );

  const isWet = (peakHit?.value ?? 0) >= WET_THRESHOLD;

  if (!isWet) {
    return <PrecipDry longForm={longForm} />;
  }

  return (
    <PrecipWet
      series={series}
      peakHit={peakHit}
      longForm={longForm}
    />
  );
}

// --- wet mode -------------------------------------------------------------

interface PrecipWetProps {
  series: SeriesPoint[];
  peakHit: PrecipHit | null;
  longForm: string;
}

function PrecipWet({ series, peakHit, longForm }: PrecipWetProps) {
  const headValue = series[0]?.value ?? NaN;

  const subtitle = useMemo(() => {
    if (!peakHit || series.length === 0) return '';
    const tail = series[series.length - 1].value;
    const peakIdx = series.findIndex((s) => s.key === peakHit.key);
    const peakIsLater = peakIdx > 0;
    const dryByEnd = tail < WET_THRESHOLD;
    if (peakIsLater && dryByEnd) {
      return `Rain developing this afternoon, clearing by ${shortHourLabel(series[series.length - 1].key)}.`;
    }
    if (peakIsLater) {
      return `Rain ramping up toward ${shortHourLabel(peakHit.key)}.`;
    }
    if (dryByEnd) {
      return `Wet right now, easing through the next few hours.`;
    }
    return 'Wet across the window — keep the layer handy.';
  }, [peakHit, series]);

  return (
    <div className="px-4 pt-3 pb-4 space-y-4">
      <section>
        <div className="flex items-baseline gap-2">
          <span className="text-[44px] leading-none font-light tabular-nums text-[#1a1a18]">
            {Number.isFinite(headValue) ? `${Math.round(headValue)}%` : '–'}
          </span>
          <span className="text-[14px] text-gray-500">now</span>
        </div>
        {subtitle && <p className="mt-2 text-[13px] text-[#5a5a55]">{subtitle}</p>}
      </section>

      {peakHit && (
        <section>
          <InfoPill dotColor={PRECIP_COLOR}>
            <strong className="font-semibold">Peak:</strong> {Math.round(peakHit.value)}%
            chance around {shortHourLabel(peakHit.key)} · {peakHit.locationName} area
          </InfoPill>
        </section>
      )}

      <section>
        <SectionLabel>Rain probability</SectionLabel>
        <MetricChart
          series={series}
          markerKey={peakHit?.key ?? null}
          color={PRECIP_COLOR}
          ariaLabel="Citywide rain probability next 12 hours"
          withFill
          yMinFloor={0}
          yMaxCeil={100}
        />
      </section>

      <KarlQuoteCard text={longForm} accent={PRECIP_COLOR} />
    </div>
  );
}

// --- dry mode -------------------------------------------------------------

function PrecipDry({ longForm }: { longForm: string }) {
  return (
    <div className="px-4 pt-4 pb-4 space-y-5">
      <section className="text-center pt-2">
        <p
          className="text-[34px] leading-none font-light"
          style={{ color: 'var(--color-green-muted)' }}
        >
          No rain
        </p>
        <p className="mt-2 text-[13px] text-[#5a5a55]">
          Nothing in the forecast for the next 12 hours
        </p>
      </section>
      <KarlQuoteCard text={longForm} accent="var(--color-amber-warm)" />
    </div>
  );
}

// --- helpers --------------------------------------------------------------

interface PrecipHit {
  key: string;
  value: number;
  locationName: string;
}

/**
 * Highest per-neighborhood precip probability over the next 12 hours.
 * Returns the hour, value, and where it lands so the pill can name a
 * neighborhood ("Glen Park area") rather than just a number.
 */
function peakPrecipNext12h(
  hourKey: string,
  hourKeys: string[],
  forecasts: Map<number, SpotForecast>,
): PrecipHit | null {
  if (!hourKey || hourKeys.length === 0) return null;
  const startIdx = Math.max(0, hourKeys.indexOf(hourKey));
  const endIdx = Math.min(hourKeys.length, startIdx + HOURLY_STRIP_LENGTH);
  let best: PrecipHit | null = null;
  for (let i = startIdx; i < endIdx; i++) {
    const key = hourKeys[i];
    // Anchor on the city-avg hour to make the pill agree with the chart;
    // then attribute the *location* to whichever neighborhood is wettest
    // in that same hour.
    const samples = buildSamples('precip', key, forecasts);
    const stats = computeCityStats(samples);
    if (!Number.isFinite(stats.max)) continue;
    if (best && stats.max <= best.value) continue;
    const wettestId = stats.highId;
    const name = neighborhoods.find((n) => n.id === wettestId)?.name ?? '';
    best = { key, value: stats.max, locationName: name };
  }
  return best;
}
