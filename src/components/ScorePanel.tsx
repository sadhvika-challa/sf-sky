import { useEffect, useRef, useState } from 'react';
import SunCalc from 'suncalc';
import { type Spot } from '../data/spots';
import { type UserLocation, getDistanceMiles } from '../hooks/useGeolocation';
import { type TravelMode } from '../App';
import { getScoreTier, tierColors, type ScoreTier } from '../utils/scoring';
import ScoreCard from './ScoreCard';

type CardType = 'sunrise' | 'sunset' | 'stargazing';

interface CardInfo {
  type: CardType;
  eventDate: Date;
  eventTime: Date;
}

function getNextEvents(spot: Spot): CardInfo[] {
  const now = new Date();
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayTimes = SunCalc.getTimes(today, spot.lat, spot.lng);
  const tomorrowTimes = SunCalc.getTimes(tomorrow, spot.lat, spot.lng);

  const cards: CardInfo[] = [];

  if (todayTimes.sunrise > now) {
    cards.push({ type: 'sunrise', eventDate: today, eventTime: todayTimes.sunrise });
  } else {
    cards.push({ type: 'sunrise', eventDate: tomorrow, eventTime: tomorrowTimes.sunrise });
  }

  if (todayTimes.sunset > now) {
    cards.push({ type: 'sunset', eventDate: today, eventTime: todayTimes.sunset });
  } else {
    cards.push({ type: 'sunset', eventDate: tomorrow, eventTime: tomorrowTimes.sunset });
  }

  const todayDusk = todayTimes.nauticalDusk;
  const todayStarEnd = new Date(todayDusk.getTime() + 3 * 60 * 60 * 1000);
  if (todayStarEnd > now) {
    cards.push({ type: 'stargazing', eventDate: today, eventTime: todayDusk > now ? todayDusk : now });
  } else {
    const tomorrowDusk = tomorrowTimes.nauticalDusk;
    cards.push({ type: 'stargazing', eventDate: tomorrow, eventTime: tomorrowDusk });
  }

  cards.sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime());
  return cards;
}

const typeLabel: Record<CardType, string> = {
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  stargazing: 'Stargazing',
};

function formatStripTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return '—';
  return date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase()
    .replace(/\s/g, ' ');
}

// Karl is SF fog: clear sky = Karl-free, mixed = Karl's lurking, socked in =
// Karl wins. Three tiers, mapped to the same palette as the map pins so the
// whole UI reads as one system.
function getKarlPill(score: number): { label: string; tier: ScoreTier } {
  const tier = getScoreTier(score);
  switch (tier) {
    case 'great':
      return { label: 'Karl-free', tier };
    case 'decent':
      return { label: "Karl's lurking", tier };
    case 'poor':
      return { label: 'Karl wins', tier };
    default: {
      const _exhaustive: never = tier;
      throw new Error(`Unhandled tier: ${String(_exhaustive)}`);
    }
  }
}

function getScoreColor(score: number): string {
  return tierColors[getScoreTier(score)];
}

interface ScorePanelProps {
  spot: Spot;
  onClose: () => void;
  userLocation: UserLocation | null;
  initialCardType?: CardType;
  travelMode: TravelMode;
}

// Straight-line speed estimates (mph) — actual routed distance will differ
const SPEED_MPH: Record<TravelMode, number> = { walk: 3, car: 25 };

export default function ScorePanel({ spot, onClose, userLocation, initialCardType, travelMode }: ScorePanelProps) {
  const distanceMi = userLocation
    ? getDistanceMiles(userLocation.lat, userLocation.lng, spot.lat, spot.lng)
    : null;
  const travelMinutes = distanceMi !== null
    ? Math.round((distanceMi / SPEED_MPH[travelMode]) * 60)
    : null;

  const cards = getNextEvents(spot);
  // The soonest upcoming event is the one we feature in the collapsed strip.
  const primary = cards[0];
  const primaryScore = spot[primary.type];
  const karlPill = getKarlPill(primaryScore);
  const scoreColor = getScoreColor(primaryScore);

  // Open as a peek strip so the map underneath stays tappable. Users opt in to
  // the full read by tapping the handle or the strip itself.
  const [expanded, setExpanded] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!initialCardType || !expanded) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scroller.querySelector<HTMLElement>(`[data-card-type="${initialCardType}"]`);
    if (!target) return;
    scroller.scrollTo({ left: target.offsetLeft - scroller.offsetLeft, behavior: 'smooth' });
  }, [initialCardType, spot.id, expanded]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (expanded) {
        setExpanded(false);
      } else {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, expanded]);

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {/* Backdrop — fades in only when expanded. While collapsed it's
          fully invisible AND non-interactive, so the map stays both visible
          and tappable for panning, zooming, and switching spots. */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
          expanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      {/* Bottom sheet — sized to its content so it never wastes vertical
          space, with a max cap so it can't ever swallow the whole screen. */}
      <div
        role="dialog"
        aria-modal={expanded}
        aria-label={`${spot.name} sky scores`}
        className="score-sheet absolute left-0 right-0 bottom-0 z-10 pointer-events-auto flex flex-col bg-cream/95 backdrop-blur-md border-t border-cream-dark shadow-2xl rounded-t-2xl overflow-hidden"
        style={{
          maxHeight: 'min(82dvh, 680px)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Drag handle + expand affordance */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex flex-col items-center justify-center pt-2 pb-1 flex-shrink-0 group"
          aria-label={expanded ? 'Collapse panel' : 'Expand panel for full details'}
          aria-expanded={expanded}
        >
          <span className="block w-9 h-1 rounded-full bg-gray-400/70 group-hover:bg-gray-500 transition-colors" />
          {!expanded && (
            <span className="mt-1 flex items-center gap-1 font-mono text-[8px] tracking-[2px] uppercase text-gray-400 group-hover:text-gray-600 transition-colors">
              <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 6.5L5 3.5L8 6.5" />
              </svg>
              Tap to expand
            </span>
          )}
        </button>

        {expanded ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-1 pb-2 flex-shrink-0">
              <div className="min-w-0">
                <h2 className="font-serif text-lg font-semibold text-gray-800 truncate">{spot.name}</h2>
                <p className="text-[9px] tracking-[2px] text-gray-400 font-mono uppercase mt-0.5">
                  {spot.lat.toFixed(4)}°N, {Math.abs(spot.lng).toFixed(4)}°W &middot; {spot.elevation}m
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 flex-shrink-0 ml-2 rounded-full bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                aria-label="Close panel"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2L12 12M12 2L2 12" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Cards — swipeable, one card per page, snaps cleanly */}
            <div
              ref={scrollerRef}
              className="score-cards-scroll flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory w-full min-h-0 flex-1"
              style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
            >
              {cards.map((card) => (
                <div
                  key={card.type}
                  data-card-type={card.type}
                  className="w-full flex-shrink-0 snap-center px-3 pb-4 pt-1"
                >
                  <ScoreCard
                    spot={spot}
                    type={card.type}
                    eventDate={card.eventDate}
                    distanceMi={distanceMi}
                    travelMinutes={travelMinutes}
                    travelMode={travelMode}
                  />
                </div>
              ))}
            </div>

            {/* Page indicator dots */}
            <div className="flex items-center justify-center gap-1.5 pb-2 flex-shrink-0">
              {cards.map((card) => (
                <span
                  key={card.type}
                  className="w-1 h-1 rounded-full bg-gray-300"
                  aria-hidden="true"
                />
              ))}
            </div>
          </>
        ) : (
          // Collapsed glanceable strip
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full flex items-center gap-3 px-4 pt-1 pb-3 text-left active:bg-cream-dark/30 transition-colors"
            aria-label={`Expand ${spot.name} details`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-base font-semibold text-gray-800 truncate">
                  {spot.name}
                </h2>
                <span
                  className="flex-shrink-0 font-mono text-[9px] tracking-[1.5px] uppercase px-1.5 py-0.5 rounded-full text-white"
                  style={{ background: tierColors[karlPill.tier] }}
                >
                  {karlPill.label}
                </span>
              </div>
              <p className="font-mono text-[10px] tracking-[1.5px] text-gray-500 uppercase mt-1 truncate">
                {typeLabel[primary.type]} &middot; {formatStripTime(primary.eventTime)}
                {distanceMi !== null && ` \u00b7 ${distanceMi.toFixed(1)} mi`}
              </p>
            </div>
            <span
              className="font-serif text-3xl font-light leading-none flex-shrink-0 tabular-nums"
              style={{ color: scoreColor }}
            >
              {primaryScore}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
