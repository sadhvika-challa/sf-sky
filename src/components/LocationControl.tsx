import type { LocationState } from '../hooks/useLocation';

interface LocationControlProps {
  state: LocationState;
  onRequest: () => void | Promise<LocationState>;
  onChooseCity: () => void;
  onUseCityInstead: () => void;
}

interface LocationControlContent {
  message: string;
  action: 'Use my location' | 'Retry' | 'Finding…' | null;
}

function getLocationControlContent(state: LocationState): LocationControlContent {
  switch (state.status) {
    case 'not-requested':
      return {
        message: 'See the best sky-viewing spots near you right now. Your coordinates are never saved.',
        action: 'Use my location',
      };
    case 'requesting':
      return { message: 'Finding your location…', action: 'Finding…' };
    case 'allowed':
      if (state.location.precision === 'approximate') {
        return {
          message: 'Using approximate location. Distances are approximate.',
          action: 'Retry',
        };
      }
      if (state.location.precision === 'precise') {
        return {
          message: 'Using your precise location. Nearby distances are ready.',
          action: null,
        };
      }
      return {
        message: 'Using your location. Nearby distances are ready.',
        action: null,
      };
    case 'denied':
      return {
        message: 'Location access was denied. Allow it in device settings, then retry, or keep browsing by city.',
        action: 'Retry',
      };
    case 'timeout':
      return {
        message: 'Location timed out. Retry, or keep browsing by city.',
        action: 'Retry',
      };
    case 'unavailable':
      return {
        message: 'Location is unavailable right now. Retry, or keep browsing by city.',
        action: 'Retry',
      };
    case 'unsupported':
      return {
        message: 'This browser does not support location. Keep browsing by city.',
        action: null,
      };
  }
}

export default function LocationControl({
  state,
  onRequest,
  onChooseCity,
  onUseCityInstead,
}: LocationControlProps) {
  const content = getLocationControlContent(state);
  const pending = state.status === 'requesting';
  const showChooseCity = state.status !== 'allowed' && state.status !== 'requesting';

  return (
    <section
      aria-label="Location preferences"
      className="mb-2 border-b border-cream-dark/70 pb-2"
    >
      <div className="flex min-h-11 items-center gap-3">
        <p
          className="min-w-0 flex-1 font-sans text-[12px] leading-snug text-gray-600"
          role="status"
          aria-live="polite"
        >
          {content.message}
        </p>
        {content.action && (
          <button
            type="button"
            onClick={() => void onRequest()}
            disabled={pending}
            className="min-h-11 flex-shrink-0 rounded-full bg-gray-800 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:cursor-wait disabled:opacity-60"
          >
            {content.action}
          </button>
        )}
      </div>
      {showChooseCity && (
        <button
          type="button"
          onClick={onChooseCity}
          className="min-h-11 rounded-md px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-600 underline decoration-gray-400 underline-offset-4 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-700"
        >
          Choose a city
        </button>
      )}
      {state.status === 'allowed' && (
        <button
          type="button"
          onClick={onUseCityInstead}
          className="min-h-11 rounded-md px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-600 underline decoration-gray-400 underline-offset-4 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-700"
        >
          Use city instead
        </button>
      )}
    </section>
  );
}
