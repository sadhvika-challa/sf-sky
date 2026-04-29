// Wind expanded sheet. Layout (top → bottom):
//
//   1. Hero row (3 columns): speed + gust line · compass dial ·
//      direction abbreviation. Compass needle rotates to the FROM angle
//      so the user's reading matches the on-map wind labels.
//   2. Gusty pill (only when gusts cross ~15 mph in the next ~3 hours).
//   3. Next-12-hours wind speed chart, with marker on the windiest hour.
//   4. Karl quote card.

import { useMemo } from 'react';
import { neighborhoods } from '../../data/neighborhoods';
import { type SpotForecast } from '../../utils/weather';
import { buildSamples, buildWindDirs } from '../../utils/weatherSamples';
import { computeCityStats } from '../../utils/labelStats';
import { InfoPill, KarlQuoteCard, MetricChart, SectionLabel } from './shared';
import {
  HOURLY_STRIP_LENGTH,
  buildCityAvgSeries,
  peakIndex,
  shortHourLabel,
} from './utils';

interface WindExpandedProps {
  hourKey: string;
  hourKeys: string[];
  forecasts: Map<number, SpotForecast>;
  longForm: string;
}

const WIND_COLOR = 'var(--color-blue-soft)';
const GUST_THRESHOLD_MPH = 15;

export default function WindExpanded({
  hourKey,
  hourKeys,
  forecasts,
  longForm,
}: WindExpandedProps) {
  const series = useMemo(
    () => buildCityAvgSeries('wind', hourKey, hourKeys, forecasts),
    [hourKey, hourKeys, forecasts],
  );

  const cityNow = useMemo(() => {
    const samples = buildSamples('wind', hourKey, forecasts);
    return computeCityStats(samples);
  }, [hourKey, forecasts]);

  const gustNow = useMemo(
    () => peakGustAtHour(hourKey, forecasts),
    [hourKey, forecasts],
  );

  const dominantDir = useMemo(
    () => dominantDirectionDeg(hourKey, forecasts),
    [hourKey, forecasts],
  );

  const peak = useMemo(() => {
    const idx = peakIndex(series);
    return idx >= 0 ? series[idx] : null;
  }, [series]);

  const gustWindow = useMemo(
    () => gustyWindow(hourKey, hourKeys, forecasts),
    [hourKey, hourKeys, forecasts],
  );

  const dirAbbr = dominantDir !== null ? compassAbbr(dominantDir) : '';

  return (
    <div className="px-4 pt-3 pb-4 space-y-4">
      <section className="grid grid-cols-3 gap-3 items-center">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[40px] leading-none font-light tabular-nums text-[#1a1a18]">
              {Number.isFinite(cityNow.avg) ? Math.round(cityNow.avg) : '–'}
            </span>
            <span className="text-[13px] text-gray-500">mph</span>
          </div>
          {Number.isFinite(gustNow) && (
            <p className="mt-1 text-[12px] text-[#5a5a55]">
              Gusts to {Math.round(gustNow)} mph
            </p>
          )}
        </div>
        <div className="flex justify-center">
          <Compass dirDeg={dominantDir} />
        </div>
        <div className="text-right">
          <p className="text-[12px] text-gray-500">From the</p>
          <p className="mt-0.5 text-[18px] font-semibold tracking-wide text-[#1a1a18]">
            {dirAbbr || '–'}
          </p>
        </div>
      </section>

      {gustWindow && (
        <section>
          <InfoPill dotColor="var(--color-amber-warm)">
            <strong className="font-semibold">Gusty</strong> through{' '}
            {shortHourLabel(gustWindow.endKey)} — exposed hilltops breezy
          </InfoPill>
        </section>
      )}

      <section>
        <SectionLabel>Wind speed (mph)</SectionLabel>
        <MetricChart
          series={series}
          markerKey={peak?.key ?? null}
          color={WIND_COLOR}
          ariaLabel="Citywide wind speed next 12 hours"
          withFill
          yMinFloor={0}
        />
      </section>

      <KarlQuoteCard text={longForm} accent={WIND_COLOR} />
    </div>
  );
}

// --- compass --------------------------------------------------------------

interface CompassProps {
  /** Wind FROM direction in meteorological degrees (0 = from N). */
  dirDeg: number | null;
}

/**
 * Tiny compass dial used in the wind hero. The needle's tail points
 * AT the source direction (matching the textual "From the WNW") with
 * a heavier head opposite to convey the actual airflow direction.
 */
function Compass({ dirDeg }: CompassProps) {
  // SVG `rotate` rotates clockwise from 0 = up, which already matches
  // meteorological FROM-direction degrees, so we can pass dirDeg as-is.
  const angle = dirDeg ?? 0;
  const hasDir = dirDeg !== null && Number.isFinite(dirDeg);
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" aria-hidden="true">
      <circle
        cx="29"
        cy="29"
        r="26"
        fill="rgba(255,255,255,0.6)"
        stroke="rgba(0,0,0,0.08)"
        strokeWidth="0.75"
      />
      <text x="29" y="11" textAnchor="middle" fontSize="7" fill="#9a9a93">N</text>
      <text x="50" y="31.5" textAnchor="middle" fontSize="7" fill="#9a9a93">E</text>
      <text x="29" y="52" textAnchor="middle" fontSize="7" fill="#9a9a93">S</text>
      <text x="8" y="31.5" textAnchor="middle" fontSize="7" fill="#9a9a93">W</text>
      {hasDir && (
        <g transform={`rotate(${angle} 29 29)`}>
          <line
            x1="29"
            y1="14"
            x2="29"
            y2="44"
            stroke="#1a1a18"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <polygon
            points="29,40 26,46 32,46"
            fill="#1a1a18"
          />
        </g>
      )}
    </svg>
  );
}

// --- helpers --------------------------------------------------------------

function peakGustAtHour(
  hourKey: string,
  forecasts: Map<number, SpotForecast>,
): number {
  if (!hourKey) return NaN;
  let best = -Infinity;
  for (const n of neighborhoods) {
    const f = forecasts.get(n.id);
    const h = f?.hours[hourKey];
    if (!h || !Number.isFinite(h.gustMph)) continue;
    if (h.gustMph > best) best = h.gustMph;
  }
  return best === -Infinity ? NaN : best;
}

/**
 * Speed-weighted vector mean of wind direction across all loaded
 * neighborhoods at `hourKey`. Returns the FROM angle in degrees, or
 * null when there's nothing windy enough (>= 2 mph) to read direction
 * from. Mirrors `dominantDirection` in narrative.ts but returns degrees
 * instead of an abbreviation so the compass can rotate continuously.
 */
function dominantDirectionDeg(
  hourKey: string,
  forecasts: Map<number, SpotForecast>,
): number | null {
  if (!hourKey) return null;
  const speeds = buildSamples('wind', hourKey, forecasts);
  const dirs = buildWindDirs(hourKey, forecasts);
  let sx = 0;
  let sy = 0;
  let total = 0;
  for (const [id, s] of speeds) {
    const dir = dirs.get(id);
    if (dir === undefined || !Number.isFinite(dir)) continue;
    if (s.value < 2) continue;
    const rad = (dir * Math.PI) / 180;
    sx += Math.sin(rad) * s.value;
    sy += Math.cos(rad) * s.value;
    total += 1;
  }
  if (total === 0) return null;
  let deg = (Math.atan2(sx, sy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

function compassAbbr(deg: number): string {
  const bins = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(deg / 22.5) % 16;
  return bins[idx];
}

interface GustWindow {
  endKey: string;
}

/**
 * Find the run of upcoming hours where peak gusts hold above
 * `GUST_THRESHOLD_MPH`. Returns the hour where it finally drops back
 * below the threshold, or null when there's no gusty stretch worth
 * calling out (so the pill stays hidden on calm days).
 */
function gustyWindow(
  hourKey: string,
  hourKeys: string[],
  forecasts: Map<number, SpotForecast>,
): GustWindow | null {
  if (!hourKey || hourKeys.length === 0) return null;
  const startIdx = Math.max(0, hourKeys.indexOf(hourKey));
  const endIdx = Math.min(hourKeys.length, startIdx + HOURLY_STRIP_LENGTH);
  let lastGusty = -1;
  for (let i = startIdx; i < endIdx; i++) {
    const gust = peakGustAtHour(hourKeys[i], forecasts);
    if (Number.isFinite(gust) && gust >= GUST_THRESHOLD_MPH) {
      lastGusty = i;
      continue;
    }
    if (lastGusty >= 0) {
      // First non-gusty hour — that's when the wind eases off.
      return { endKey: hourKeys[i] };
    }
  }
  if (lastGusty < 0) return null;
  // Gusty all the way to the end of our window — point at the last
  // hour we have data for.
  return { endKey: hourKeys[Math.min(endIdx - 1, lastGusty)] };
}
