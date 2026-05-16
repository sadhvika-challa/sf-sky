import { useEffect, useMemo, useRef, useState } from 'react';
import { type Spot, type City } from '../data/spots';
import { type LiveScoresMap } from '../hooks/useLiveScores';
import { type UserLocation, getDistanceMiles } from '../hooks/useGeolocation';
import { getUpcomingEventTimes } from '../utils/events';
import { getKarlComment } from '../utils/karl-copy';
import { getScoreTier, tierColors, type ScoreType } from '../utils/scoring';

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  spots: ReadonlyArray<Spot>;
  liveScores: LiveScoresMap;
  userLocation: UserLocation | null;
  onSelectSpot: (spot: Spot) => void;
  onSuggestSpot: (seed: string) => void;
  city: City;
}

interface RankedSpot {
  spot: Spot;
  nextType: ScoreType;
  nextTime: Date;
  score: number;
  distanceMi: number | null;
}

const TYPE_LABEL: Record<ScoreType, string> = {
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  stargazing: 'Stargazing',
};

function formatEventTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return '—';
  return date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
}

function buildRanking(
  spotList: ReadonlyArray<Spot>,
  liveScores: LiveScoresMap,
  userLocation: UserLocation | null,
): RankedSpot[] {
  return spotList.map((spot) => {
    const events = getUpcomingEventTimes(spot);
    const order: ScoreType[] = (['sunrise', 'sunset', 'stargazing'] as ScoreType[])
      .filter((t) => !Number.isNaN(events[t].getTime()))
      .sort((a, b) => events[a].getTime() - events[b].getTime());
    const nextType: ScoreType = order[0] ?? 'sunset';
    const live = liveScores.get(spot.id);
    const score = live ? live[nextType] : spot[nextType];
    const distanceMi = userLocation
      ? getDistanceMiles(userLocation.lat, userLocation.lng, spot.lat, spot.lng)
      : null;
    return { spot, nextType, nextTime: events[nextType], score, distanceMi };
  });
}

export default function SearchOverlay({
  open,
  onClose,
  spots: spotList,
  liveScores,
  userLocation,
  onSelectSpot,
  onSuggestSpot,
  city,
}: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  // Render-vs-mount split so we can play exit animation before unmounting.
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Defer the visible flip so the initial transform applies before
      // transitioning — without it the slide-up animation is skipped.
      requestAnimationFrame(() => setVisible(true));
    } else if (mounted) {
      setVisible(false);
      const t = window.setTimeout(() => {
        setMounted(false);
        setQuery('');
      }, 200);
      return () => window.clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const ranked = useMemo(
    () => buildRanking(spotList, liveScores, userLocation),
    [spotList, liveScores, userLocation],
  );

  const trimmed = query.trim().toLowerCase();
  const hasQuery = trimmed.length > 0;

  const results = useMemo(() => {
    if (hasQuery) {
      // Filter by name; preserve score-desc order so the most promising
      // matches still bubble up first.
      return ranked
        .filter((r) => r.spot.name.toLowerCase().includes(trimmed))
        .sort((a, b) => b.score - a.score);
    }
    return [...ranked].sort((a, b) => b.score - a.score);
  }, [ranked, trimmed, hasQuery]);

  if (!mounted) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search spots"
      className="fixed inset-0 z-[1000] bg-cream flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Sticky search row */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 pt-3 pb-3 bg-cream border-b border-cream-dark/60">
        <div className="relative flex-1">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search spots…"
            autoComplete="off"
            spellCheck={false}
            className="w-full h-10 pl-9 pr-3 text-sm font-mono bg-cream-dark/40 border border-cream-dark rounded-lg outline-none focus:border-gray-400 transition-colors placeholder:text-gray-400 text-gray-700"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-mono text-gray-600 hover:text-gray-800 active:text-gray-900 px-2 py-1 transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {!hasQuery && (
          <div className="px-4 pt-4 pb-2">
            <p className="font-mono text-[10px] tracking-[2px] uppercase text-gray-500">
              {city === 'sf' ? 'Tonight per Karl' : "Tonight's outlook"}
            </p>
          </div>
        )}

        {results.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="font-serif text-base italic text-gray-500">
              {city === 'sf'
                ? "No spots match. Karl can't help with that one."
                : 'No spots match that search.'}
            </p>
            <button
              type="button"
              onClick={() => onSuggestSpot(query.trim())}
              className="mt-4 text-[10px] tracking-[2px] uppercase font-mono text-gray-600 hover:text-gray-900 transition-colors underline underline-offset-2"
            >
              {city === 'sf'
                ? "Don't see your spot? Tell Karl about it."
                : "Don't see your spot? Suggest one."}
            </button>
          </div>
        ) : (
          <ul className="px-2">
            {results.map((r) => {
              const tier = getScoreTier(r.score);
              const distance =
                r.distanceMi !== null ? ` · ${r.distanceMi.toFixed(1)} mi` : '';
              const karl = getKarlComment(r.score, r.nextType, r.spot.id, undefined, city);
              return (
                <li
                  key={r.spot.id}
                  className="border-b border-cream-dark/50 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSpot(r.spot);
                      onClose();
                    }}
                    className="w-full flex items-start gap-3 px-3 py-3 text-left rounded-md active:bg-cream-dark/40 hover:bg-cream-dark/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-base font-semibold text-gray-800 truncate">
                        {r.spot.name}
                      </p>
                      <p className="font-mono text-[11px] text-gray-500 mt-0.5 truncate">
                        {TYPE_LABEL[r.nextType]} · {formatEventTime(r.nextTime)}
                        {distance}
                      </p>
                      <p className="font-serif text-[13px] italic text-gray-500 mt-1 leading-snug">
                        {karl}
                      </p>
                    </div>
                    <span
                      className="font-serif text-2xl font-light leading-none tabular-nums flex-shrink-0 mt-0.5"
                      style={{ color: tierColors[tier] }}
                    >
                      {r.score}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
