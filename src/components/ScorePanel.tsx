import { useEffect, useRef, useState } from 'react';
import SunCalc from 'suncalc';
import { type Spot } from '../data/spots';
import { type UserLocation, getDistanceMiles } from '../hooks/useGeolocation';
import { type TravelMode } from '../App';
import { getScoreTier, tierColors, type ScoreTier } from '../utils/scoring';
import { type LiveScoresMap } from '../hooks/useLiveScores';
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
  liveScores: LiveScoresMap;
}

// Straight-line speed estimates (mph) — actual routed distance will differ
const SPEED_MPH: Record<TravelMode, number> = { walk: 3, car: 25 };

export default function ScorePanel({ spot, onClose, userLocation, initialCardType, travelMode, liveScores }: ScorePanelProps) {
  const distanceMi = userLocation
    ? getDistanceMiles(userLocation.lat, userLocation.lng, spot.lat, spot.lng)
    : null;
  const travelMinutes = distanceMi !== null
    ? Math.round((distanceMi / SPEED_MPH[travelMode]) * 60)
    : null;

  const cards = getNextEvents(spot);
  // The soonest upcoming event is the one we feature in the collapsed strip.
  // Read the score from the same live map that drives the map pin so the
  // strip number and the pin number always agree.
  const primary = cards[0];
  const live = liveScores.get(spot.id);
  const primaryScore = live ? live[primary.type] : spot[primary.type];
  const karlPill = getKarlPill(primaryScore);
  const scoreColor = getScoreColor(primaryScore);

  const getScoreFor = (type: CardType): number =>
    live ? live[type] : spot[type];

  // Open as a peek strip so the map underneath stays tappable. Users opt in to
  // the full read by tapping the handle or the strip itself.
  const [expanded, setExpanded] = useState(false);
  // Which card is currently centered in the swipe scroller — drives the
  // active page-indicator dot at the bottom of the sheet.
  const [activeCardType, setActiveCardType] = useState<CardType>(
    initialCardType ?? cards[0]?.type ?? 'sunrise'
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Swipe-down-to-dismiss on the drag handle (only when expanded). We track
  // pointer movement, translate the sheet to follow the finger, and either
  // dismiss past a distance/velocity threshold or spring back to rest.
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startY: number;
    startTime: number;
    moved: boolean;
  } | null>(null);
  // Set when a drag actually moved so the trailing click event doesn't toggle
  // collapse after the user lifts their finger.
  const suppressClickRef = useRef(false);

  const handleHandlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!expanded) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragStateRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startTime: performance.now(),
      moved: false,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleHandlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const delta = e.clientY - state.startY;
    if (Math.abs(delta) > 4) state.moved = true;
    // Allow free downward drag; rubber-band a small amount upward so the sheet
    // feels anchored at the top.
    const next = delta >= 0 ? delta : Math.max(delta, -40) * 0.3;
    setDragY(next);
  };

  const finishDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const delta = e.clientY - state.startY;
    const elapsed = performance.now() - state.startTime;
    const velocity = delta / Math.max(elapsed, 1); // px/ms, positive = downward
    const moved = state.moved;
    dragStateRef.current = null;
    setIsDragging(false);

    const sheetHeight = sheetRef.current?.getBoundingClientRect().height ?? 600;
    const distanceThreshold = Math.min(120, sheetHeight * 0.25);
    const velocityThreshold = 0.6; // ~600 px/s flick

    if (delta > distanceThreshold || velocity > velocityThreshold) {
      // Animate the sheet off-screen, then close.
      suppressClickRef.current = true;
      setDragY(sheetHeight);
      window.setTimeout(onClose, 200);
      return;
    }
    if (moved) suppressClickRef.current = true;
    setDragY(0);
  };

  const handleHandleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setExpanded(!expanded);
  };

  useEffect(() => {
    if (!initialCardType || !expanded) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scroller.querySelector<HTMLElement>(`[data-card-type="${initialCardType}"]`);
    if (!target) return;
    scroller.scrollTo({ left: target.offsetLeft - scroller.offsetLeft, behavior: 'smooth' });
  }, [initialCardType, spot.id, expanded]);

  // Track which card is centered as the user swipes. We watch each card with
  // an IntersectionObserver scoped to the horizontal scroller, picking the
  // entry with the highest intersection ratio as "active". This stays in sync
  // with both finger swipes and the programmatic scrollTo above.
  useEffect(() => {
    if (!expanded) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const cardEls = Array.from(
      scroller.querySelectorAll<HTMLElement>('[data-card-type]')
    );
    if (cardEls.length === 0) return;

    const ratios = new Map<HTMLElement, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target as HTMLElement, entry.intersectionRatio);
        }
        let bestEl: HTMLElement | null = null;
        let bestRatio = 0;
        for (const [el, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestEl = el;
          }
        }
        const next = bestEl?.dataset.cardType;
        if (next === 'sunrise' || next === 'sunset' || next === 'stargazing') {
          setActiveCardType(next);
        }
      },
      { root: scroller, threshold: [0.25, 0.5, 0.75, 1] }
    );

    for (const el of cardEls) observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, spot.id]);

  const handleDotClick = (type: CardType) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scroller.querySelector<HTMLElement>(`[data-card-type="${type}"]`);
    if (!target) return;
    scroller.scrollTo({ left: target.offsetLeft - scroller.offsetLeft, behavior: 'smooth' });
    setActiveCardType(type);
  };

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

  // Backdrop fade tracks drag progress so the dismissal feels physical: the
  // farther you pull the sheet down, the more the dim layer recedes.
  const backdropProgress = expanded ? Math.max(0, 1 - dragY / 320) : 0;

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {/* Backdrop — fades in only when expanded. While collapsed it's
          fully invisible AND non-interactive, so the map stays both visible
          and tappable for panning, zooming, and switching spots. */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/30 backdrop-blur-sm ${
          expanded ? 'pointer-events-auto' : 'pointer-events-none'
        } ${isDragging ? '' : 'transition-opacity duration-300'}`}
        style={{ opacity: backdropProgress }}
        aria-hidden="true"
      />

      {/* Bottom sheet — sized to its content so it never wastes vertical
          space, with a max cap so it can't ever swallow the whole screen. */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal={expanded}
        aria-label={`${spot.name} sky scores`}
        className="score-sheet absolute left-0 right-0 bottom-0 z-10 pointer-events-auto flex flex-col bg-cream/95 backdrop-blur-md border-t border-cream-dark shadow-2xl rounded-t-2xl overflow-hidden"
        style={{
          maxHeight: 'min(82dvh, 680px)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: dragY ? `translate3d(0, ${dragY}px, 0)` : undefined,
          transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Drag handle + expand affordance. When expanded, this also acts as
            a swipe-down-to-dismiss target. */}
        <button
          type="button"
          onClick={handleHandleClick}
          onPointerDown={handleHandlePointerDown}
          onPointerMove={handleHandlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          className="w-full flex flex-col items-center justify-center pt-2 pb-1 flex-shrink-0 group touch-none"
          aria-label={expanded ? 'Swipe down to dismiss, or tap to collapse' : 'Expand panel for full details'}
          aria-expanded={expanded}
          style={{ touchAction: 'none' }}
        >
          <span className="block w-9 h-1 rounded-full bg-gray-400/70 group-hover:bg-gray-500 transition-colors" />
        </button>

        {expanded ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 pt-1 pb-2 flex-shrink-0">
              <div className="min-w-0">
                <h2 className="font-serif text-lg font-semibold text-gray-800 truncate">{spot.name}</h2>
                <p className="text-[9px] tracking-[2px] text-gray-400 font-mono uppercase mt-0.5">
                  {spot.lat.toFixed(4)}°N, {Math.abs(spot.lng).toFixed(4)}°W &middot; {spot.elevation}m
                </p>
              </div>
              <span
                className="font-serif text-3xl font-light leading-none flex-shrink-0 tabular-nums"
                style={{ color: getScoreColor(getScoreFor(activeCardType)) }}
                aria-label={`${typeLabel[activeCardType]} score ${getScoreFor(activeCardType)} out of 100`}
              >
                {getScoreFor(activeCardType)}
              </span>
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

            {/* Page indicator dots — active dot tracks the currently visible
                card, and tapping a dot jumps the scroller to that card. */}
            <div
              className="flex items-center justify-center gap-1.5 pb-2 flex-shrink-0"
              role="tablist"
              aria-label="Card pages"
            >
              {cards.map((card) => {
                const isActive = card.type === activeCardType;
                return (
                  <button
                    key={card.type}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`Show ${typeLabel[card.type]} card`}
                    onClick={() => handleDotClick(card.type)}
                    className={`rounded-full transition-all duration-200 ${
                      isActive
                        ? 'w-3 h-1.5 bg-gray-700'
                        : 'w-1.5 h-1.5 bg-gray-300 hover:bg-gray-400'
                    }`}
                  />
                );
              })}
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
