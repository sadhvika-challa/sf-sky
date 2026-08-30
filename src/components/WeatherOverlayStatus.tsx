import type { NeighborhoodForecastState } from '../hooks/useNeighborhoodForecasts';
import type { WeatherMetric } from '../utils/interpolate';
import { getWeatherOverlayPresentation, weatherMapSummary } from './weatherOverlayStatusModel';

type Props = Pick<NeighborhoodForecastState, 'phase' | 'loaded' | 'total' | 'errorKind' | 'retry'> & {
  metric: WeatherMetric;
  hourKey: string;
  visibleAverage?: number;
  cityName: string;
  timeZone: string;
  now: Date;
};

export default function WeatherOverlayStatus({
  phase, loaded, total, errorKind, retry, metric, hourKey, visibleAverage, cityName, timeZone, now,
}: Props) {
  const presentation = getWeatherOverlayPresentation(phase, loaded, total, errorKind);
  if (!presentation) return null;
  const deterministicState = phase === 'unavailable' && errorKind ? errorKind : phase;
  return (
    <div
      data-weather-overlay-state={deterministicState}
      className="absolute left-1/2 top-[calc(env(safe-area-inset-top)+4rem)] z-20 -translate-x-1/2 rounded-full bg-white/95 px-3 py-2 text-center font-mono text-[11px] text-gray-700 shadow-sm"
    >
      <span aria-hidden="true">{presentation.visual}</span>
      <span className="sr-only" role="status" aria-live="polite">{presentation.announcement}</span>
      <span
        className="sr-only"
        role="img"
        aria-label={weatherMapSummary(
          cityName, timeZone, metric, hourKey, now, loaded, total, visibleAverage,
        )}
      />
      {presentation.canRetry && (
        <button type="button" onClick={retry} className="ml-2 font-semibold text-[#8B5E3C] underline">
          Retry
        </button>
      )}
    </div>
  );
}
