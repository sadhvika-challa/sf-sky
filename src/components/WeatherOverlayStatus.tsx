import type { NeighborhoodForecastState } from '../hooks/useNeighborhoodForecasts';

type Props = Pick<NeighborhoodForecastState, 'phase' | 'loaded' | 'total' | 'errorKind' | 'retry'>;

function failureCopy(kind: Props['errorKind']): string {
  switch (kind) {
    case 'offline': return 'Weather overlay unavailable offline.';
    case 'timeout': return 'Weather overlay request timed out.';
    case 'rate-limit': return 'Weather service is temporarily rate limited.';
    case 'http': return 'Weather service returned an error.';
    case 'aborted': return 'Weather overlay loading was cancelled.';
    default: return 'Weather overlay is temporarily unavailable.';
  }
}

export default function WeatherOverlayStatus({ phase, loaded, total, errorKind, retry }: Props) {
  if (phase === 'off') return null;
  const deterministicState = phase === 'unavailable' && errorKind ? errorKind : phase;
  let copy: string;
  switch (phase) {
    case 'loading': copy = `Loading weather coverage, ${loaded} of ${total} areas.`; break;
    case 'partial': copy = `Partial weather coverage, ${loaded} of ${total} areas.`; break;
    case 'ready': copy = `Weather coverage ready, ${loaded} of ${total} areas.`; break;
    case 'refreshing': copy = `Refreshing weather coverage. Showing saved forecast for ${loaded} areas.`; break;
    case 'saved': copy = `Showing saved forecast for ${loaded} areas. ${failureCopy(errorKind)}`; break;
    case 'unavailable': copy = failureCopy(errorKind); break;
    default: return null;
  }
  const canRetry = phase === 'partial' || phase === 'saved' || phase === 'unavailable';
  return (
    <div
      role="status"
      aria-live="polite"
      data-weather-overlay-state={deterministicState}
      className="absolute left-1/2 top-[calc(env(safe-area-inset-top)+4rem)] z-20 -translate-x-1/2 rounded-full bg-white/95 px-3 py-2 text-center font-mono text-[11px] text-gray-700 shadow-sm"
    >
      <span>{copy}</span>
      {canRetry && (
        <button type="button" onClick={retry} className="ml-2 font-semibold text-[#8B5E3C] underline">
          Retry
        </button>
      )}
    </div>
  );
}
