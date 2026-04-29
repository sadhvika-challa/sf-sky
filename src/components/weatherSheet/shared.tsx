// Shared React components used across the per-metric expanded weather
// sheets. Pure helpers and types live in `utils.ts` so this file can
// stay components-only and play nicely with React Fast Refresh.

import type { ReactNode } from 'react';
import {
  fillGradientId,
  pickTickIndices,
  shortHourLabel,
  smoothPath,
  type SeriesPoint,
} from './utils';

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-gray-500">
      {children}
    </div>
  );
}

interface KarlQuoteCardProps {
  text: string;
  /** CSS color for the side rail. Defaults to amber-warm. */
  accent?: string;
}

/**
 * Karl's longer-form narrative, rendered as a serif italic pull-quote
 * with a 4px colored side rail and a tiny "KARL" byline. The accent
 * color picks up the metric's hero tint so the quote feels of-a-piece
 * with the rest of the sheet.
 */
export function KarlQuoteCard({ text, accent = 'var(--color-amber-warm)' }: KarlQuoteCardProps) {
  if (!text) return null;
  return (
    <div className="relative rounded-xl bg-cream-dark/60 pl-4 pr-3.5 py-3 overflow-hidden">
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ background: accent }}
      />
      <p className="font-serif italic text-[13px] leading-snug text-[#3a3a36]">
        “{text}”
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-gray-500 font-semibold">
        Karl
      </p>
    </div>
  );
}

interface InfoPillProps {
  /** CSS color for the leading dot. */
  dotColor: string;
  children: ReactNode;
}

/**
 * The small inline "● Clearest window: …" badge. Uses cream-dark fill
 * so it reads as a quiet caption rather than a CTA.
 */
export function InfoPill({ dotColor, children }: InfoPillProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-cream-dark/70 px-3 py-1.5 text-[12.5px] text-[#3a3a36]">
      <span
        aria-hidden="true"
        className="block w-1.5 h-1.5 rounded-full"
        style={{ background: dotColor }}
      />
      <span>{children}</span>
    </div>
  );
}

interface TrendChipProps {
  dir: 'up' | 'down' | 'steady';
  /** Word shown when `dir === 'up'`, e.g. "warming" / "clouding". */
  upLabel: string;
  /** Word shown when `dir === 'down'`, e.g. "cooling" / "clearing". */
  downLabel: string;
  /** Word shown when `dir === 'steady'`. */
  steadyLabel?: string;
  /** CSS color for the up state. */
  upColor: string;
  /** CSS color for the down state. */
  downColor: string;
}

/**
 * Inline trend chip: tiny up/down arrow + a single descriptor. Caller
 * picks the words and colors so each metric can frame its trend in its
 * own voice (warming/cooling, clearing/clouding, intensifying/easing).
 */
export function TrendChip({
  dir,
  upLabel,
  downLabel,
  steadyLabel = 'steady',
  upColor,
  downColor,
}: TrendChipProps) {
  if (dir === 'steady') {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-gray-500">
        <span aria-hidden="true">→</span>
        {steadyLabel}
      </span>
    );
  }
  const isUp = dir === 'up';
  const color = isUp ? upColor : downColor;
  const label = isUp ? upLabel : downLabel;
  // Up-arrow vs down-arrow paths in a 14×14 viewbox. Same head/shaft
  // geometry, mirrored across the horizontal axis.
  const arrow = isUp ? 'M7 11V3M7 3l-4 4M7 3l4 4' : 'M7 3v8M7 11l-4-4M7 11l4-4';
  return (
    <span
      className="inline-flex items-center gap-1 text-[13px] font-medium"
      style={{ color }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path
          d={arrow}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </span>
  );
}

interface MetricChartProps {
  series: SeriesPoint[];
  /** Hour-key of the marker dot + dashed guide. Pass null to omit. */
  markerKey: string | null;
  /** Stroke / marker color. */
  color: string;
  ariaLabel: string;
  /** When true, paints a soft fill below the curve in `color`. */
  withFill?: boolean;
  /** Force the y-axis lower bound (e.g. 0 for percent metrics). */
  yMinFloor?: number;
  /** Force the y-axis upper bound (e.g. 100 for percent metrics). */
  yMaxCeil?: number;
}

/**
 * Smooth-ish line chart over a SeriesPoint array, with a marker dot +
 * dashed vertical guide on `markerKey`. We pad the y range slightly so
 * a near-flat series doesn't graze the top/bottom of the box, and an
 * optional `yMinFloor`/`yMaxCeil` lets percent metrics anchor the axis.
 */
export function MetricChart({
  series,
  markerKey,
  color,
  ariaLabel,
  withFill = false,
  yMinFloor,
  yMaxCeil,
}: MetricChartProps) {
  if (series.length < 2) {
    return (
      <div className="mt-2 h-[110px] flex items-center justify-center text-[11px] text-gray-400">
        Not enough hours of data yet.
      </div>
    );
  }

  const width = 320;
  const height = 110;
  const padX = 12;
  const padTop = 14;
  const padBottom = 22;

  const values = series.map((s) => s.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = Math.max(rawMax - rawMin, 4);
  let yMin = rawMin - span * 0.15;
  let yMax = rawMax + span * 0.25;
  if (yMinFloor !== undefined) yMin = Math.max(yMin, yMinFloor);
  if (yMaxCeil !== undefined) yMax = Math.min(yMax, yMaxCeil);
  // Guard against zero-height ranges after clamping (e.g. a flat-zero
  // precip series with floor=0 would otherwise divide by zero).
  if (yMax - yMin < 1) yMax = yMin + 1;

  const xFor = (i: number) =>
    padX + (i * (width - padX * 2)) / (series.length - 1);
  const yFor = (v: number) => {
    const t = (v - yMin) / (yMax - yMin);
    return padTop + (1 - t) * (height - padTop - padBottom);
  };

  const points = series.map((s, i) => ({ x: xFor(i), y: yFor(s.value) }));
  const path = smoothPath(points);
  const areaPath =
    withFill && points.length > 1
      ? `${path} L${points[points.length - 1].x},${height - padBottom} L${points[0].x},${height - padBottom} Z`
      : '';

  const markerIdx = markerKey ? series.findIndex((s) => s.key === markerKey) : -1;
  const marker =
    markerIdx >= 0
      ? { x: points[markerIdx].x, y: points[markerIdx].y }
      : null;

  const tickIndices = pickTickIndices(series.length);
  const fillId = fillGradientId(color);

  return (
    <div className="mt-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[110px]"
        preserveAspectRatio="none"
        aria-label={ariaLabel}
        role="img"
      >
        {withFill && (
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
        )}
        {withFill && areaPath && <path d={areaPath} fill={`url(#${fillId})`} />}
        {marker && (
          <line
            x1={marker.x}
            y1={marker.y}
            x2={marker.x}
            y2={height - padBottom}
            stroke={color}
            strokeWidth="0.75"
            strokeDasharray="2 3"
            opacity="0.55"
          />
        )}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {marker && (
          <circle cx={marker.x} cy={marker.y} r="3.5" fill={color} />
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-gray-400 px-2">
        {tickIndices.map((idx) => (
          <span key={idx}>
            {idx === 0 ? 'Now' : shortHourLabel(series[idx].key)}
          </span>
        ))}
      </div>
    </div>
  );
}
