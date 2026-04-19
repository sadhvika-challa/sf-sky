import { useEffect, useMemo, useState } from 'react';
import type { Filters, TravelMode } from '../App';
import type { LiveScoresMap } from '../hooks/useLiveScores';
import {
  computeCityOutlook,
  outlookMessage,
  statusLabel,
  type CityOutlook,
  type OutlookStatus,
} from '../utils/outlook';
import type { ScoreType } from '../utils/scoring';

interface FilterMenuProps {
  open: boolean;
  filters: Filters;
  onChange: (f: Filters) => void;
  onReset: () => void;
  onClose: () => void;
  travelMode: TravelMode;
  onTravelModeChange: (m: TravelMode) => void;
  liveScores: LiveScoresMap;
}

type FilterKey = keyof Filters;

const labels: Record<FilterKey, string> = {
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  stargazing: 'Stargazing',
};

const eventOrder: ScoreType[] = ['sunrise', 'sunset', 'stargazing'];

// Warm palette indicators: green for good, amber for mixed, burnt for poor.
const statusDot: Record<OutlookStatus, string> = {
  good: '#6B9E6B',
  mixed: '#D97706',
  poor: '#B45309',
};

function contextualTitle(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "This Morning's Sky";
  if (hour < 17) return "Today's Sky";
  return "Tonight's Sky";
}

function RangeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const [min, max] = value;

  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] font-mono text-gray-700">
          {label} <span className="text-gray-400">·</span>{' '}
          <span className="text-gray-500">{min}–{max}</span>
        </span>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="absolute w-full h-[3px] bg-gray-200 rounded-full" />
        <div
          className="absolute h-[3px] bg-gray-600 rounded-full"
          style={{ left: `${min}%`, width: `${max - min}%` }}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={min}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), max - 1);
            onChange([v, max]);
          }}
          className="range-thumb absolute w-full"
        />
        <input
          type="range"
          min={0}
          max={100}
          value={max}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), min + 1);
            onChange([min, v]);
          }}
          className="range-thumb absolute w-full"
        />
      </div>
    </div>
  );
}

function OutlookCards({ outlook }: { outlook: CityOutlook }) {
  const [expanded, setExpanded] = useState<ScoreType | null>(null);

  if (!outlook.isLive) return null;

  return (
    <div className="mb-3">
      <div className="grid grid-cols-3 gap-1.5">
        {eventOrder.map((type) => {
          const entry = outlook[type];
          const isOpen = expanded === type;
          const message = outlookMessage(type, entry.status);
          const canExpand = message.length > 0;
          return (
            <button
              key={type}
              type="button"
              onClick={() => canExpand && setExpanded(isOpen ? null : type)}
              aria-expanded={isOpen}
              title={message || undefined}
              className={`text-left rounded-lg border bg-cream-dark/30 px-2.5 py-2 transition-colors ${
                canExpand ? 'hover:bg-cream-dark/50 cursor-pointer' : 'cursor-default'
              } ${isOpen ? 'border-gray-300' : 'border-transparent'}`}
            >
              <div className="text-[10px] font-mono text-gray-500 leading-tight">
                {labels[type]}
              </div>
              <div className="font-serif text-lg leading-tight text-gray-800 mt-0.5">
                {entry.topScore}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: statusDot[entry.status] }}
                  aria-hidden="true"
                />
                <span className="text-[10px] font-mono text-gray-600">
                  {statusLabel(entry.status)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {expanded && outlookMessage(expanded, outlook[expanded].status) && (
        <p className="text-[10px] font-mono text-gray-500 mt-2 px-1 leading-snug">
          {outlookMessage(expanded, outlook[expanded].status)}
        </p>
      )}
    </div>
  );
}

function TravelPill({
  travelMode,
  onTravelModeChange,
}: {
  travelMode: TravelMode;
  onTravelModeChange: (m: TravelMode) => void;
}) {
  const baseClass =
    'flex items-center gap-1 h-7 px-3 rounded-full text-[10px] tracking-[1.5px] uppercase font-mono transition-colors';
  const activeClass = 'bg-gray-700 text-cream';
  const inactiveClass = 'text-gray-500 hover:text-gray-700';

  return (
    <div className="mb-3 flex items-center justify-between">
      <span className="text-[11px] font-mono text-gray-500">Travel</span>
      <div className="inline-flex items-center bg-cream-dark/40 rounded-full p-0.5">
        <button
          type="button"
          onClick={() => onTravelModeChange('walk')}
          className={`${baseClass} ${travelMode === 'walk' ? activeClass : inactiveClass}`}
          aria-pressed={travelMode === 'walk'}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13" cy="4" r="2" />
            <path d="M7 22l3-8 4 2 2 6" />
            <path d="M10 14l-1-4 4-2 3 4 3 1" />
          </svg>
          Walk
        </button>
        <button
          type="button"
          onClick={() => onTravelModeChange('car')}
          className={`${baseClass} ${travelMode === 'car' ? activeClass : inactiveClass}`}
          aria-pressed={travelMode === 'car'}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5" />
            <path d="M3 13h18v5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
            <circle cx="7.5" cy="16.5" r="0.5" fill="currentColor" />
            <circle cx="16.5" cy="16.5" r="0.5" fill="currentColor" />
          </svg>
          Car
        </button>
      </div>
    </div>
  );
}

function ScoreRangeAccordion({
  filters,
  onChange,
  isFiltered,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  isFiltered: boolean;
}) {
  const [open, setOpen] = useState(isFiltered);

  return (
    <div className="border-t border-cream-dark pt-2.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between py-1 text-left"
      >
        <span className="text-[11px] font-mono text-gray-700">
          Score range
          {isFiltered && (
            <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-gray-600 align-middle" />
          )}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 4l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div className="pt-2">
          {(Object.keys(labels) as FilterKey[]).map((key) => (
            <RangeSlider
              key={key}
              label={labels[key]}
              value={filters[key]}
              onChange={(v) => onChange({ ...filters, [key]: v })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterContent({
  filters,
  onChange,
  onReset,
  onClose,
  travelMode,
  onTravelModeChange,
  liveScores,
}: Omit<FilterMenuProps, 'open'>) {
  const isFiltered = Object.values(filters).some(([min, max]) => min > 0 || max < 100);
  const outlook = useMemo(() => computeCityOutlook(liveScores), [liveScores]);
  const title = useMemo(() => contextualTitle(), []);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif text-base font-semibold text-gray-800">{title}</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <OutlookCards outlook={outlook} />

      <TravelPill travelMode={travelMode} onTravelModeChange={onTravelModeChange} />

      <ScoreRangeAccordion filters={filters} onChange={onChange} isFiltered={isFiltered} />

      {isFiltered && (
        <button
          onClick={onReset}
          className="mt-2 text-[10px] tracking-[2px] uppercase font-mono text-gray-500 hover:text-gray-700 transition-colors underline underline-offset-2"
        >
          Reset all
        </button>
      )}
    </>
  );
}

export default function FilterMenu({
  open,
  filters,
  onChange,
  onReset,
  onClose,
  travelMode,
  onTravelModeChange,
  liveScores,
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
    travelMode,
    onTravelModeChange,
    liveScores,
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
