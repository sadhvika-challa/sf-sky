import type { ReactNode } from 'react';
import type { LocationState } from '../hooks/useLocation';
import LocationControl from './LocationControl';

export type HomeSheetScopeNotice =
  | {
      kind: 'city-mismatch';
      activeCityName: string;
      suggestedCityName: string;
      onUseSuggestedCity: () => void;
      onKeepCurrentCity: () => void;
    }
  | {
      kind: 'outside-coverage';
      suggestedCityName: string | null;
      suggestionDistance: string | null;
      onUseSuggestedCity?: () => void;
    };

interface HomeSheetProps {
  locationState: LocationState;
  onRequestLocation: () => void | Promise<LocationState>;
  onChooseCity: () => void;
  onUseCityInstead: () => void;
  scopeNotice?: HomeSheetScopeNotice | null;
  recommendation?: ReactNode;
  timeline?: ReactNode;
}

function ScopeNotice({ notice, onChooseCity }: {
  notice: HomeSheetScopeNotice;
  onChooseCity: () => void;
}) {
  if (notice.kind === 'city-mismatch') {
    return (
      <section
        aria-label="Nearby city choice"
        className="rounded-2xl border border-black/[0.08] bg-[rgba(250,250,248,0.96)] p-3 shadow-sm"
      >
        <h2 className="font-serif text-[17px] font-semibold text-[#1a1a18]">
          Spots nearby are in {notice.suggestedCityName}
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-600">
          Your map is still showing {notice.activeCityName}. Soleil will switch only if you choose to.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={notice.onUseSuggestedCity}
            className="min-h-11 rounded-full bg-gray-800 px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
          >
            Switch to {notice.suggestedCityName}
          </button>
          <button
            type="button"
            onClick={notice.onKeepCurrentCity}
            className="min-h-11 rounded-full border border-black/10 px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
          >
            Keep {notice.activeCityName}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Soleil coverage"
      className="rounded-2xl border border-black/[0.08] bg-[rgba(250,250,248,0.96)] p-3 shadow-sm"
    >
      <h2 className="font-serif text-[17px] font-semibold text-[#1a1a18]">
        Outside Soleil coverage
      </h2>
      <p className="mt-1 text-[12px] leading-relaxed text-gray-600">
        {notice.suggestedCityName
          ? `The nearest supported city is ${notice.suggestedCityName}${notice.suggestionDistance ? `, ${notice.suggestionDistance} away` : ''}.`
          : 'Choose a supported city to keep exploring current sky conditions.'}
        {' '}Your location did not change the map.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {notice.suggestedCityName && notice.onUseSuggestedCity && (
          <button
            type="button"
            onClick={notice.onUseSuggestedCity}
            className="min-h-11 rounded-full bg-gray-800 px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
          >
            Browse {notice.suggestedCityName}
          </button>
        )}
        <button
          type="button"
          onClick={onChooseCity}
          className="min-h-11 rounded-full border border-black/10 px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
        >
          Choose a city
        </button>
      </div>
    </section>
  );
}

export default function HomeSheet({
  locationState,
  onRequestLocation,
  onChooseCity,
  onUseCityInstead,
  scopeNotice = null,
  recommendation,
  timeline,
}: HomeSheetProps) {
  return (
    <aside
      aria-label="Sky outlook"
      className="absolute bottom-0 left-0 right-0 z-20 max-h-[min(62dvh,38rem)] overflow-y-auto rounded-t-xl bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] backdrop-blur-sm overscroll-contain"
    >
      <LocationControl
        state={locationState}
        onRequest={onRequestLocation}
        onChooseCity={onChooseCity}
        onUseCityInstead={onUseCityInstead}
      />
      <div className="space-y-2">
        {scopeNotice && <ScopeNotice notice={scopeNotice} onChooseCity={onChooseCity} />}
        {!scopeNotice && recommendation}
        {timeline}
      </div>
    </aside>
  );
}
