import { useEffect, useMemo } from 'react';
import type { Filters } from '../App';
import type { City } from '../data/spots';
import { getCityById } from '../data/cities';
import type { LiveScoresMap } from '../hooks/useLiveScores';
import CityRow from './CityRow';

interface FilterMenuProps {
  open: boolean;
  filters: Filters;
  onChange: (f: Filters) => void;
  onReset: () => void;
  onClose: () => void;
  liveScores: LiveScoresMap;
  onSuggestSpot: () => void;
  onReportBug: () => void;
  city: City;
  homeCityId: City;
  onOpenCitySheet: () => void;
}

function contextualTitle(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "This Morning's Sky";
  if (hour < 17) return "Today's Sky";
  return "Tonight's Sky";
}

function FilterContent({
  onClose,
  onSuggestSpot,
  onReportBug,
  city,
  homeCityId,
  onOpenCitySheet,
}: Omit<FilterMenuProps, 'open'>) {
  const title = useMemo(() => contextualTitle(), []);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif text-xl text-gray-800">{title}</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-cream-dark/50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <CityRow
        activeCityId={city}
        homeCityId={homeCityId}
        onOpenCitySheet={onOpenCitySheet}
      />

      {(() => {
        const config = getCityById(city);
        if (config && !config.hasWeatherMode) {
          return (
            <p className="mt-3 text-[9px] font-mono text-gray-400 italic">
              Weather mode coming soon for {config.name}.
            </p>
          );
        }
        return null;
      })()}

      <div className="mt-4 pt-3 border-t border-cream-dark flex flex-col">
        <button
          type="button"
          onClick={onSuggestSpot}
          className="w-full flex items-center justify-between px-3 py-3.5 rounded-lg bg-transparent active:bg-cream-dark/40 transition-colors border-b border-cream-dark"
        >
          <span className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-400 shrink-0">
              <path d="M8 1C5.8 1 4 2.8 4 5c0 3 4 7.5 4 7.5s4-4.5 4-7.5c0-2.2-1.8-4-4-4Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="8" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <span className="font-mono text-[12px] tracking-[1px] text-gray-600">
              Suggest a spot
            </span>
          </span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-gray-300 shrink-0">
            <path d="M5 3l4 4-4 4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onReportBug}
          className="w-full flex items-center justify-between px-3 py-3.5 rounded-lg bg-transparent active:bg-cream-dark/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-400 shrink-0">
              <path d="M13 5.5L8.5 2 4 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 5.5V11a1 1 0 001 1h7a1 1 0 001-1V5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 8.5h2M12 8.5h2M5 14l1.5-2M11 14l-1.5-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="font-mono text-[12px] tracking-[1px] text-gray-600">
              Report a bug
            </span>
          </span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-gray-300 shrink-0">
            <path d="M5 3l4 4-4 4" />
          </svg>
        </button>
      </div>
    </>
  );
}

export default function FilterMenu({
  open,
  filters,
  onChange,
  onReset,
  onClose,
  liveScores,
  onSuggestSpot,
  onReportBug,
  city,
  homeCityId,
  onOpenCitySheet,
}: FilterMenuProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const contentProps = {
    filters,
    onChange,
    onReset,
    onClose,
    liveScores,
    onSuggestSpot,
    onReportBug,
    city,
    homeCityId,
    onOpenCitySheet,
  };

  return (
    <>
      {/* Mobile: centered modal with backdrop */}
      <div className={`sm:hidden ${open ? '' : 'pointer-events-none'}`}>
        <div
          onClick={onClose}
          className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-200 ${
            open ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden="true"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sky outlook"
          className={`fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-cream/95 backdrop-blur-md border border-cream-dark shadow-2xl transition-all duration-200 ${
            open ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
          style={{
            paddingTop: 'max(0.875rem, env(safe-area-inset-top))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          }}
        >
          <div className="px-4">
            <FilterContent {...contentProps} />
          </div>
        </div>
      </div>

      {/* Desktop: right-side slide panel */}
      <div
        className={`hidden sm:block absolute z-30 top-0 right-0 w-72 h-full bg-cream/95 backdrop-blur-md border-l border-cream-dark shadow-xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ paddingTop: 'max(3.5rem, calc(env(safe-area-inset-top) + 3rem))' }}
      >
        <div className="px-4 pb-4">
          <FilterContent {...contentProps} />
        </div>
      </div>
    </>
  );
}
