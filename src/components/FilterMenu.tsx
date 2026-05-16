import { useEffect, useMemo, useState } from 'react';
import type { Filters } from '../App';
import type { City } from '../data/spots';
import { getCityById } from '../data/cities';
import type { LiveScoresMap } from '../hooks/useLiveScores';
import {
  computeCityOutlook,
  outlookMessage,
  statusLabel,
  type CityOutlook,
  type OutlookStatus,
} from '../utils/outlook';
import { tierColors, type ScoreTier, type ScoreType } from '../utils/scoring';
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

// Tier filter is the same three buckets that drive map-pin color and the
// score-panel pill: a green chip here = a green pin on the map. We default
// to "all-on" visually (no chips lit means no constraint), so the user can
// peel buckets off ("hide poor sunsets") rather than reasoning about
// numeric ranges. Empty and "all three" both mean unfiltered, which keeps
// the active-filter dot honest.
const TIER_ORDER: ScoreTier[] = ['great', 'decent', 'poor'];

const tierChipLabel: Record<ScoreTier, string> = {
  great: 'Great',
  decent: 'Decent',
  poor: 'Poor',
};

function isUnfiltered(selected: ScoreTier[]): boolean {
  return selected.length === 0 || selected.length === TIER_ORDER.length;
}

function toggleTier(selected: ScoreTier[], tier: ScoreTier): ScoreTier[] {
  // Empty means "all on" to the user, so the first tap should *exclude* the
  // tapped tier rather than narrow to a single bucket. Mirror this when the
  // user has filled all three: tapping any chip should drop it.
  const effectiveOn = isUnfiltered(selected)
    ? new Set<ScoreTier>(TIER_ORDER)
    : new Set<ScoreTier>(selected);

  if (effectiveOn.has(tier)) effectiveOn.delete(tier);
  else effectiveOn.add(tier);

  // Re-collapse "all three" back to [] so the model has one canonical
  // representation of "no constraint".
  if (effectiveOn.size === TIER_ORDER.length) return [];
  return TIER_ORDER.filter((t) => effectiveOn.has(t));
}

function TierFilterRow({
  label,
  selected,
  onChange,
}: {
  label: string;
  selected: ScoreTier[];
  onChange: (next: ScoreTier[]) => void;
}) {
  const allOn = isUnfiltered(selected);

  return (
    <div className="mb-2.5 last:mb-0">
      <div className="text-[11px] font-mono text-gray-700 mb-1">{label}</div>
      <div className="flex items-center gap-1.5">
        {TIER_ORDER.map((tier) => {
          const isOn = allOn || selected.includes(tier);
          const color = tierColors[tier];
          return (
            <button
              key={tier}
              type="button"
              onClick={() => onChange(toggleTier(selected, tier))}
              aria-pressed={isOn}
              aria-label={`${tierChipLabel[tier]} ${label.toLowerCase()}`}
              className="flex-1 h-7 rounded-full text-[10px] tracking-[1.5px] uppercase font-mono transition-all duration-150 border"
              style={
                isOn
                  ? { background: color, borderColor: color, color: '#fff' }
                  : { background: 'transparent', borderColor: '#D6CCC0', color: '#9A8F82' }
              }
            >
              {tierChipLabel[tier]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OutlookCards({ outlook, city }: { outlook: CityOutlook; city: City }) {
  const [expanded, setExpanded] = useState<ScoreType | null>(null);

  if (!outlook.isLive) return null;

  return (
    <div className="mb-3">
      <div className="grid grid-cols-3 gap-1.5">
        {eventOrder.map((type) => {
          const entry = outlook[type];
          const isOpen = expanded === type;
          const message = outlookMessage(type, entry.status, city);
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
                  {statusLabel(entry.status, city)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {expanded && outlookMessage(expanded, outlook[expanded].status, city) && (
        <p className="text-[10px] font-mono text-gray-500 mt-2 px-1 leading-snug">
          {outlookMessage(expanded, outlook[expanded].status, city)}
        </p>
      )}
    </div>
  );
}

const SF_GLOSSARY: { label: string; body: string }[] = [
  {
    label: 'Conditions',
    body: "Karl's overall read for this event — blends the spot's baseline (terrain, horizon, light pollution) with live cloud structure, visibility, and air quality.",
  },
  {
    label: 'Temp',
    body: "Forecast air temperature at the event time, in °F. Falls back to a seasonal SF average when live data isn't loaded.",
  },
  {
    label: 'Clouds',
    body: "Total sky coverage right now: Clear (<20%), Partly (<60%), Mid (<85%), Overcast. For sunsets, a little mid/high cloud is good — too much low cloud or fog isn't.",
  },
  {
    label: 'Humidity',
    body: "Relative humidity at the event time. High humidity often means haze, fog, or marine layer creeping in — bad news for sharp horizons.",
  },
  {
    label: 'Light Pollution',
    body: "How dark the sky is overhead at this spot. Low = best for stars, High = SF city glow drowns them out. Intrinsic to the location, not the forecast.",
  },
  {
    label: '% Full Visibility',
    body: "How far you can see through the air, scaled 0–100% (≥30 km = 100%). Low values usually mean haze, smoke, or marine layer.",
  },
];

const ATX_GLOSSARY: { label: string; body: string }[] = [
  {
    label: 'Conditions',
    body: "Overall read for this event — blends the spot's baseline (terrain, horizon, light pollution) with live cloud structure, visibility, and air quality.",
  },
  {
    label: 'Temp',
    body: "Forecast air temperature at the event time, in °F. Falls back to a seasonal average when live data isn't loaded.",
  },
  {
    label: 'Clouds',
    body: "Total sky coverage right now: Clear (<20%), Partly (<60%), Mid (<85%), Overcast. For sunsets, a little mid/high cloud is good — too much low cloud isn't.",
  },
  {
    label: 'Humidity',
    body: "Relative humidity at the event time. High humidity often means haze and washed-out colors — especially in Austin summers.",
  },
  {
    label: 'Light Pollution',
    body: "How dark the sky is overhead at this spot. Low = best for stars, High = city glow drowns them out. Intrinsic to the location, not the forecast.",
  },
  {
    label: '% Full Visibility',
    body: "How far you can see through the air, scaled 0–100% (≥30 km = 100%). Low values usually mean haze or humidity.",
  },
];

function GlossaryAccordion({ city }: { city: City }) {
  const [open, setOpen] = useState(false);
  const glossary = city !== 'sf' ? ATX_GLOSSARY : SF_GLOSSARY;

  return (
    <div className="border-t border-cream-dark pt-2.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between py-1 text-left"
      >
        <span className="text-[11px] font-mono text-gray-700">What these mean</span>
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
        <dl className="pt-1.5 pb-0.5 space-y-2">
          {glossary.map((entry) => (
            <div key={entry.label}>
              <dt className="font-mono text-[9px] tracking-[1.5px] uppercase text-gray-500">
                {entry.label}
              </dt>
              <dd className="font-serif text-[11px] leading-snug text-gray-600 mt-0.5">
                {entry.body}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function QualityFilterAccordion({
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
          Show only
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
            <TierFilterRow
              key={key}
              label={labels[key]}
              selected={filters[key]}
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
  liveScores,
  onSuggestSpot,
  onReportBug,
  city,
  homeCityId,
  onOpenCitySheet,
}: Omit<FilterMenuProps, 'open'>) {
  const isFiltered = Object.values(filters).some((tiers) => !isUnfiltered(tiers));
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

      <CityRow
        activeCityId={city}
        homeCityId={homeCityId}
        onOpenCitySheet={onOpenCitySheet}
      />

      <OutlookCards outlook={outlook} city={city} />

      <QualityFilterAccordion filters={filters} onChange={onChange} isFiltered={isFiltered} />

      {isFiltered && (
        <button
          onClick={onReset}
          className="mt-2 text-[10px] tracking-[2px] uppercase font-mono text-gray-500 hover:text-gray-700 transition-colors underline underline-offset-2"
        >
          Reset all
        </button>
      )}

      <div className="mt-3">
        <GlossaryAccordion city={city} />
      </div>

      {(() => {
        const config = getCityById(city);
        if (config && !config.hasWeatherMode) {
          return (
            <p className="mt-2 text-[9px] font-mono text-gray-400 italic">
              Weather mode coming soon for {config.name}.
            </p>
          );
        }
        return null;
      })()}

      <div className="mt-3 pt-2.5 border-t border-cream-dark">
        <button
          type="button"
          onClick={onSuggestSpot}
          className="w-full flex items-center justify-between py-1 text-left group"
        >
          <span className="text-[11px] font-mono text-gray-700 group-hover:text-gray-900 transition-colors">
            Suggest a spot
          </span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="text-gray-400 group-hover:text-gray-600 transition-colors"
          >
            <path d="M3 2l3 3-3 3" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onReportBug}
          className="w-full flex items-center justify-between py-1 text-left group"
        >
          <span className="text-[11px] font-mono text-gray-700 group-hover:text-gray-900 transition-colors">
            Report a bug
          </span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="text-gray-400 group-hover:text-gray-600 transition-colors"
          >
            <path d="M3 2l3 3-3 3" />
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
