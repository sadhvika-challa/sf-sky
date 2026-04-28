import { useEffect, useMemo, useRef, useState } from 'react';
import { metricLabel, type WeatherMetric } from '../utils/interpolate';

interface WeatherControlsProps {
  metric: WeatherMetric;
  onMetricChange: (m: WeatherMetric) => void;
  hourKeys: string[];
  hourKey: string;
  onHourChange: (key: string) => void;
  /** Index of the "now" hour within `hourKeys`, or -1 if not present. */
  nowIndex: number;
}

const METRICS: WeatherMetric[] = ['temp', 'clouds', 'precip', 'wind', 'fog'];

// Brief allows 24-48h. Clamp to 48 so we don't render 70+ tick marks on
// the scrubber (visually heavy and the back third is rarely scrubbed to).
const SCRUBBER_HOUR_LIMIT = 48;

export default function WeatherControls({
  metric,
  onMetricChange,
  hourKeys,
  hourKey,
  onHourChange,
  nowIndex,
}: WeatherControlsProps) {
  const visibleKeys = useMemo(
    () => hourKeys.slice(0, SCRUBBER_HOUR_LIMIT),
    [hourKeys],
  );
  const currentIndex = Math.max(0, visibleKeys.indexOf(hourKey));
  const max = Math.max(0, visibleKeys.length - 1);

  const dayBoundaries = useMemo(() => deriveDayBoundaries(visibleKeys), [visibleKeys]);
  const label = hourKey ? formatHourLabel(hourKey) : '–';

  // Track pointer-down state to drive the thumb pulse on release and to
  // bold the right-hand time label while the user is actively scrubbing.
  const [dragging, setDragging] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const lastIdxRef = useRef<number>(currentIndex);

  useEffect(() => {
    lastIdxRef.current = currentIndex;
  }, [currentIndex]);

  return (
    <div
      className="flex flex-col gap-2.5"
      role="group"
      aria-label="Weather map controls"
    >
      <div className="grid grid-cols-5 gap-1 bg-cream-dark/60 rounded-full p-1">
        {METRICS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMetricChange(m)}
            className={`h-7 rounded-full text-[12px] font-medium transition-colors ${
              metric === m
                ? 'bg-[#1a1a18] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            aria-pressed={metric === m}
          >
            {metricLabel(m)}
          </button>
        ))}
      </div>

      <LegendRow metric={metric} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (nowIndex >= 0 && visibleKeys[nowIndex]) onHourChange(visibleKeys[nowIndex]);
          }}
          disabled={nowIndex < 0 || nowIndex === currentIndex}
          className="text-[11px] font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed tabular-nums whitespace-nowrap"
        >
          Now
        </button>
        <div className="relative flex-1 h-6">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-cream-dark/80" />

          {/* Per-hour subtle ticks. Skip drawing the very first/last to avoid
              colliding with the Now dot and the right-edge thumb. */}
          {max > 0 &&
            visibleKeys.map((_, idx) => {
              if (idx === 0 || idx === max) return null;
              if (dayBoundaries.includes(idx)) return null;
              return (
                <div
                  key={`hr-${idx}`}
                  className="absolute top-1/2 -translate-y-1/2 w-px h-1 bg-gray-400/25"
                  style={{ left: `${(idx / max) * 100}%` }}
                  aria-hidden="true"
                />
              );
            })}

          {/* Day boundary ticks. Index 0 ("now") would visually conflict
              with the Now button, so skip drawing it here. */}
          {dayBoundaries.map((idx) =>
            idx === 0 || max === 0 ? null : (
              <div
                key={`day-${idx}`}
                className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-gray-400/60"
                style={{ left: `${(idx / max) * 100}%` }}
                aria-hidden="true"
              />
            ),
          )}

          {nowIndex >= 0 && nowIndex <= max && max > 0 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-soft"
              style={{ left: `calc(${(nowIndex / max) * 100}% - 3px)` }}
              aria-hidden="true"
            />
          )}

          <input
            type="range"
            min={0}
            max={max}
            value={currentIndex}
            disabled={visibleKeys.length === 0}
            onChange={(e) => {
              const idx = Number(e.target.value);
              const next = visibleKeys[idx];
              if (!next) return;
              // Hour boundary haptic — gracefully no-op on desktop / iOS.
              if (idx !== lastIdxRef.current) {
                navigator.vibrate?.(8);
              }
              onHourChange(next);
            }}
            onPointerDown={() => setDragging(true)}
            onPointerUp={() => {
              setDragging(false);
              // Trigger a brief thumb pulse to confirm the snap-to-hour.
              setPulseKey((k) => k + 1);
            }}
            onPointerCancel={() => setDragging(false)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
            aria-label="Forecast hour"
          />

          {/* Visible thumb indicator. We hide the native one and re-draw a
              small disk so it lines up regardless of browser styling. The
              `pulseKey` re-mounts the inner ring on release so the snap
              pulse animation re-fires every time without JS. */}
          {visibleKeys.length > 0 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border border-[#1a1a18] shadow-sm pointer-events-none"
              style={{ left: `calc(${(currentIndex / Math.max(max, 1)) * 100}% - 7px)` }}
            >
              <span
                key={pulseKey}
                aria-hidden="true"
                className="block absolute inset-0 rounded-full border border-[#1a1a18]/40 weather-thumb-pulse"
              />
            </div>
          )}
        </div>
        <span
          className={`font-mono text-[11px] tabular-nums whitespace-nowrap transition-colors ${
            dragging ? 'text-[#1a1a18] font-semibold' : 'text-gray-500'
          }`}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

/**
 * Indices of hour keys whose hour-of-day is 0 (midnight) — used for the day
 * separator ticks under the scrubber.
 */
function deriveDayBoundaries(hourKeys: string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < hourKeys.length; i++) {
    const key = hourKeys[i];
    // key is "YYYY-MM-DDTHH"; check the HH part.
    if (key.endsWith('T00')) out.push(i);
  }
  return out;
}

function formatHourLabel(hourKey: string): string {
  const parsed = new Date(`${hourKey}:00:00`);
  if (Number.isNaN(parsed.getTime())) return hourKey;
  const weekday = parsed.toLocaleDateString(undefined, { weekday: 'short' });
  // Lowercase am/pm to match the brief's "Thu 2am" sample.
  const time = parsed
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: undefined })
    .replace(/\s?(AM|PM)/, (_, p) => p.toLowerCase());
  return `${weekday} ${time}`;
}

interface LegendRowProps {
  metric: WeatherMetric;
}

/**
 * Three-dot legend specific to the active layer. Re-renders when the metric
 * pill changes so the user always sees the color↔meaning mapping for the
 * currently visible heatmap.
 */
function LegendRow({ metric }: LegendRowProps) {
  const items = legendForMetric(metric);
  return (
    <div
      className="flex items-center justify-center gap-3 text-[10px] text-gray-500"
      aria-label={`${metricLabel(metric)} legend`}
    >
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span
            style={{
              letterSpacing: '0.4px',
              textTransform: 'uppercase',
              fontWeight: i === 1 ? 400 : 500,
            }}
          >
            {item.label}
          </span>
        </span>
      ))}
    </div>
  );
}

interface LegendItem {
  label: string;
  color: string;
}

function legendForMetric(metric: WeatherMetric): [LegendItem, LegendItem, LegendItem] {
  switch (metric) {
    case 'temp':
      return [
        { label: 'Colder', color: '#4a8ac4' },
        { label: 'Avg', color: 'rgba(0,0,0,0.25)' },
        { label: 'Warmer', color: '#d4733a' },
      ];
    case 'clouds':
      return [
        { label: 'Cloudy', color: '#3a6e9e' },
        { label: 'Avg', color: 'rgba(0,0,0,0.25)' },
        { label: 'Clear', color: '#d4733a' },
      ];
    case 'precip':
      return [
        { label: 'Heavy', color: '#3c64b4' },
        { label: 'Light', color: '#6496d2' },
        { label: 'Dry', color: 'rgba(0,0,0,0.25)' },
      ];
    case 'wind':
      return [
        { label: 'Windy', color: '#d4733a' },
        { label: 'Avg', color: 'rgba(0,0,0,0.25)' },
        { label: 'Calm', color: '#4a8ac4' },
      ];
    case 'fog':
      return [
        { label: 'Foggy', color: '#7a7a90' },
        { label: 'Hazy', color: '#bababa' },
        { label: 'Clear', color: '#3a8a5c' },
      ];
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled metric: ${String(_exhaustive)}`);
    }
  }
}
