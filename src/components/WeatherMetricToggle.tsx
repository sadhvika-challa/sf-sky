import { metricLabel, type WeatherMetric } from '../utils/interpolate';

interface WeatherMetricToggleProps {
  metric: WeatherMetric;
  onChange: (m: WeatherMetric) => void;
}

const METRICS: WeatherMetric[] = ['temp', 'clouds', 'precip', 'wind', 'fog'];

/**
 * Compact metric segmented control for the weather-mode top row. Mirrors
 * the visual treatment of the floating ModeToggle so the two pills read
 * as a matched pair sitting over the map.
 */
export default function WeatherMetricToggle({
  metric,
  onChange,
}: WeatherMetricToggleProps) {
  return (
    <div
      className="flex-1 grid grid-cols-5 gap-0.5 rounded-full bg-[rgba(250,250,248,0.95)] border-[0.5px] border-black/[0.08] p-0.5 shadow-sm min-w-0"
      role="tablist"
      aria-label="Weather metric"
    >
      {METRICS.map((m) => {
        const active = metric === m;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m)}
            className={`h-8 rounded-full text-[11.5px] font-medium transition-colors leading-none px-1 ${
              active
                ? 'bg-[#1a1a18] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {metricLabel(m)}
          </button>
        );
      })}
    </div>
  );
}
