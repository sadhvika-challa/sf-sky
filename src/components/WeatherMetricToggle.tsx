import { useMemo } from 'react';
import { RAMPS, type WeatherMetric } from '../utils/interpolate';

interface WeatherMetricToggleProps {
  metric: WeatherMetric;
  onChange: (m: WeatherMetric) => void;
  visible: boolean;
  currentAvg?: number;
  /** Stable range across the full 24h forecast, used for fixed labels. */
  labelRange?: { min: number; max: number };
}

const METRICS: WeatherMetric[] = ['temp', 'clouds', 'precip', 'wind', 'fog'];

const METRIC_LABELS: Record<WeatherMetric, string> = {
  temp: 'Temperature',
  clouds: 'Clouds',
  precip: 'Precipitation',
  wind: 'Wind',
  fog: 'Fog',
};

const METRIC_ACTIVE_COLORS: Record<WeatherMetric, string> = {
  temp: '#dc2626',
  clouds: '#2563eb',
  precip: '#4f46e5',
  wind: '#0d9488',
  fog: '#7c3aed',
};

function MetricIcon({ metric }: { metric: WeatherMetric }) {
  switch (metric) {
    case 'temp':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
        </svg>
      );
    case 'clouds':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 10h-1a6 6 0 0 0-11.5 0H5a3.5 3.5 0 0 0 0 7h13a3 3 0 0 0 0-6z" />
        </svg>
      );
    case 'precip':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="3" x2="7" y2="9" />
          <line x1="13" y1="2" x2="12" y2="8" />
          <line x1="18" y1="3" x2="17" y2="9" />
          <line x1="6" y1="14" x2="5" y2="20" />
          <line x1="11" y1="13" x2="10" y2="19" />
          <line x1="16" y1="14" x2="15" y2="20" />
        </svg>
      );
    case 'wind':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.59 4.59A2 2 0 1 1 11 8H2" />
          <path d="M12.59 19.41A2 2 0 1 0 14 16H2" />
          <path d="M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2" />
        </svg>
      );
    case 'fog':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7q2.5-2.5 5 0t5 0t5 0" />
          <path d="M5 12q2.5-2.5 5 0t5 0" />
          <path d="M3 17q2.5-2.5 5 0t5 0t5 0" />
        </svg>
      );
  }
}

function buildGradientCSS(metric: WeatherMetric): string {
  const ramp = RAMPS[metric];
  const stops = [...ramp.stops]
    .reverse()
    .map((s) => `rgb(${s.rgb[0]}, ${s.rgb[1]}, ${s.rgb[2]}) ${(1 - s.at) * 100}%`);
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

function formatLegendValue(metric: WeatherMetric, value: number): string {
  switch (metric) {
    case 'temp': return `${Math.round(value)}°F`;
    case 'clouds': return `${Math.round(value)}%`;
    case 'precip': return `${Math.round(value)}%`;
    case 'wind': return `${Math.round(value)} mph`;
    case 'fog': {
      if (value >= 0.7) return 'Foggy';
      if (value >= 0.35) return 'Hazy';
      return 'Clear';
    }
  }
}

export default function WeatherMetricToggle({
  metric,
  onChange,
  visible,
  currentAvg,
  labelRange,
}: WeatherMetricToggleProps) {
  const gradientCSS = useMemo(() => buildGradientCSS(metric), [metric]);

  const legendLabels = useMemo(() => {
    const range = labelRange ?? RAMPS[metric];
    return {
      top: formatLegendValue(metric, range.max),
      bottom: formatLegendValue(metric, range.min),
    };
  }, [metric, labelRange]);

  const markerPct = useMemo(() => {
    if (currentAvg == null || !Number.isFinite(currentAvg)) return null;
    const range = labelRange ?? RAMPS[metric];
    const t = (currentAvg - range.min) / (range.max - range.min);
    const clamped = Math.max(0, Math.min(1, t));
    return (1 - clamped) * 100;
  }, [currentAvg, metric, labelRange]);

  return (
    <>
      {/* Vertical toolbar on the left */}
      <div
        className={`absolute left-3 z-20 flex flex-col items-center gap-1 rounded-full bg-[rgba(250,250,248,0.95)] border-[0.5px] border-black/[0.08] shadow-sm p-1 transition-all duration-300 ease-out origin-top ${
          visible
            ? 'opacity-100 scale-y-100'
            : 'opacity-0 scale-y-0 pointer-events-none'
        }`}
        style={{ top: 'calc(env(safe-area-inset-top) + 3.25rem)' }}
        role="tablist"
        aria-label="Weather metric"
      >
        {METRICS.map((m, i) => {
          const active = metric === m;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={METRIC_LABELS[m]}
              onClick={() => onChange(m)}
              className="relative flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 ease-out"
              style={{
                color: active ? METRIC_ACTIVE_COLORS[m] : '#9ca3af',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(-6px)',
                transitionDelay: visible ? `${i * 40}ms` : '0ms',
              }}
            >
              <MetricIcon metric={m} />
            </button>
          );
        })}
      </div>

      {/* Vertical legend on the right edge */}
      <div
        className={`absolute right-3 z-20 flex flex-col items-center gap-1.5 transition-all duration-300 ease-out ${
          visible
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
        style={{
          top: 'calc(env(safe-area-inset-top) + 3.25rem)',
          transitionDelay: visible ? '80ms' : '0ms',
        }}
        aria-label={`${METRIC_LABELS[metric]} color scale`}
      >
        <span className="text-[9px] font-mono text-gray-600 leading-none">
          {legendLabels.top}
        </span>
        <div
          className="relative w-2 rounded-full border-[0.5px] border-black/[0.08]"
          style={{
            height: '120px',
            background: gradientCSS,
          }}
        >
          {markerPct != null && (
            <div
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-black border-2 border-black shadow-sm transition-all duration-300 ease-out"
              style={{ top: `${markerPct}%` }}
            />
          )}
        </div>
        <span className="text-[9px] font-mono text-gray-600 leading-none">
          {legendLabels.bottom}
        </span>
      </div>
    </>
  );
}
