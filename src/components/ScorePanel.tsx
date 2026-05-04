import { useCallback, useEffect, useRef, useState } from 'react';
import SunCalc from 'suncalc';
import { type Spot, type City } from '../data/spots';
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

function googleMapsTravelMode(mode: TravelMode): 'walking' | 'driving' {
  switch (mode) {
    case 'walk':
      return 'walking';
    case 'car':
      return 'driving';
  }
}

// Travel-mode pill is tinted to match the active card so the whole sheet
// reads as one mood. Colors are saturated enough to register but not so
// loud they fight the score number next to them.
interface TogglePalette {
  bg: string;
  indicator: string;
  activeFg: string;
  inactiveFg: string;
}

// Soft pastel pill base with a saturated indicator on top — the bold color
// only lives on the *selected* slot, so the toggle reads as a quiet
// background tint rather than a loud chrome element.
const TOGGLE_PALETTE: Record<CardType, TogglePalette> = {
  sunrise: {
    bg: '#FEF3C7',
    indicator: '#F59E0B',
    activeFg: '#FFFFFF',
    inactiveFg: '#92400E',
  },
  sunset: {
    bg: '#FFEDD5',
    indicator: '#EA580C',
    activeFg: '#FFFFFF',
    inactiveFg: '#9A3412',
  },
  stargazing: {
    bg: '#DBEAFE',
    indicator: '#1E40AF',
    activeFg: '#FFFFFF',
    inactiveFg: '#1E3A8A',
  },
};

// Tabler-style walking figure: head + torso + arm-and-leg in stride.
// Centered roughly on x=12 with a small lean forward so it reads as
// motion at icon sizes, not just "person standing".
function WalkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="13" cy="4" r="1.6" fill="currentColor" stroke="none" />
      <path d="M7 21l3-4" />
      <path d="M16 21l-2-4l-3-3l1-6" />
      <path d="M6 12l2-3l4-1l3 3l3 1" />
    </svg>
  );
}

// Compact car silhouette nudged up so its visual mass sits at the
// center of the 24x24 box — fixes the previous "low-rider" look where
// the wheels hugged the bottom edge.
function CarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12l1.4-4.2A2 2 0 0 1 8.3 6.5h7.4a2 2 0 0 1 1.9 1.3L19 12" />
      <path d="M3.5 12h17v3.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V14H7v1.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z" />
      <circle cx="7.5" cy="14" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="14" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface TravelTogglePillProps {
  travelMode: TravelMode;
  onChange: (mode: TravelMode) => void;
  palette: TogglePalette;
}

const TOGGLE_BUTTON_PX = 28;
const TOGGLE_PADDING_PX = 3;

function TravelTogglePill({ travelMode, onChange, palette }: TravelTogglePillProps) {
  return (
    <div
      role="group"
      aria-label="Travel mode"
      className="relative inline-flex items-center rounded-full"
      style={{
        background: palette.bg,
        padding: `${TOGGLE_PADDING_PX}px`,
      }}
    >
      {/* Sliding indicator — only this moves on toggle, so the icons
          themselves stay rooted to their slots. */}
      <span
        aria-hidden="true"
        className="absolute rounded-full transition-transform duration-200 ease-out"
        style={{
          background: palette.indicator,
          width: TOGGLE_BUTTON_PX,
          height: TOGGLE_BUTTON_PX,
          top: TOGGLE_PADDING_PX,
          left: TOGGLE_PADDING_PX,
          transform: travelMode === 'car' ? `translateX(${TOGGLE_BUTTON_PX}px)` : 'translateX(0)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
        }}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChange('walk');
        }}
        aria-pressed={travelMode === 'walk'}
        aria-label="Walk"
        title="Walk"
        className="relative z-10 flex items-center justify-center transition-colors"
        style={{
          width: TOGGLE_BUTTON_PX,
          height: TOGGLE_BUTTON_PX,
          color: travelMode === 'walk' ? palette.activeFg : palette.inactiveFg,
        }}
      >
        <WalkIcon />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChange('car');
        }}
        aria-pressed={travelMode === 'car'}
        aria-label="Drive"
        title="Drive"
        className="relative z-10 flex items-center justify-center transition-colors"
        style={{
          width: TOGGLE_BUTTON_PX,
          height: TOGGLE_BUTTON_PX,
          color: travelMode === 'car' ? palette.activeFg : palette.inactiveFg,
        }}
      >
        <CarIcon />
      </button>
    </div>
  );
}

interface ScorePanelProps {
  spot: Spot;
  onClose: () => void;
  userLocation: UserLocation | null;
  initialCardType?: CardType;
  travelMode: TravelMode;
  onTravelModeChange: (mode: TravelMode) => void;
  liveScores: LiveScoresMap;
  onCardSwipe?: () => void;
  city: City;
}

// We don't hit a routing API — `travelMinutes` is a calibrated estimate
// from the great-circle distance. Two corrections get us close to a real
// SF ETA without a network call:
//   1. SPEED_MPH uses SF-realistic averages (hilly walking, congested
//      surface streets) rather than open-road textbook speeds.
//   2. DETOUR_FACTOR scales crow-flies up to road-network distance —
//      SF's grid + hills + water means real routes are noticeably longer
//      than a straight line, more so for driving (bridges, one-ways).
const SPEED_MPH: Record<TravelMode, number> = { walk: 2.5, car: 15 };
const DETOUR_FACTOR: Record<TravelMode, number> = { walk: 1.4, car: 1.5 };

export default function ScorePanel({ spot, onClose, userLocation, initialCardType, travelMode, onTravelModeChange, liveScores, onCardSwipe, city }: ScorePanelProps) {
  const distanceMi = userLocation
    ? getDistanceMiles(userLocation.lat, userLocation.lng, spot.lat, spot.lng)
    : null;
  const travelMinutes = distanceMi !== null
    ? Math.round((distanceMi * DETOUR_FACTOR[travelMode] / SPEED_MPH[travelMode]) * 60)
    : null;

  const handleDirections = () => {
    const destination = `${spot.lat},${spot.lng}`;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=${googleMapsTravelMode(travelMode)}`;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  // Street View at the spot's coordinates — quick way to "see" what the
  // viewpoint actually looks like without leaving the planning flow.
  const handleStreetView = () => {
    const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${spot.lat},${spot.lng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

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

  // Open fully expanded so a pin tap goes straight to the scorecard rather
  // than parking on a peek strip the user has to tap a second time.
  const [expanded, setExpanded] = useState(true);
  // Which card is currently centered in the swipe scroller — drives the
  // active page-indicator dot at the bottom of the sheet.
  const initialActiveCardType: CardType =
    initialCardType ?? cards[0]?.type ?? 'sunrise';
  const [activeCardType, setActiveCardType] = useState<CardType>(
    initialActiveCardType,
  );
  // Onboarding hand-off: fire `onCardSwipe` exactly once when the user
  // moves to a card other than the one we mounted on. Tracking via a
  // ref (instead of a derived effect) means we don't re-fire on
  // unrelated re-renders or on dot-tap navigations after the first.
  const cardSwipeFiredRef = useRef(false);
  useEffect(() => {
    if (cardSwipeFiredRef.current) return;
    if (activeCardType === initialActiveCardType) return;
    cardSwipeFiredRef.current = true;
    onCardSwipe?.();
  }, [activeCardType, initialActiveCardType, onCardSwipe]);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Drive the entrance animation via inline transform (rather than a CSS
  // keyframe with `animation-fill-mode: forwards`), because a forwards-mode
  // animation on `transform` continues to apply after it ends and overrides
  // the drag-handle's inline transform — making the swipe gesture do nothing
  // visible. Two-frame defer ensures the initial `translateY(100%)` is
  // committed before we transition to rest.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
    };
  }, []);

  // Swipe-down-to-dismiss. The drag handle commits to a vertical drag
  // immediately; the broader card area waits to see whether the gesture is
  // dominantly vertical (dismiss) or horizontal (let the card scroller pan).
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // axis: 'y' = vertical drag in progress (we own the gesture); 'x' = user is
  // panning the card scroller horizontally, so we ignore it; null = still
  // deciding (only used by the content-area axis-lock entry point).
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
    moved: boolean;
    axis: 'x' | 'y' | null;
    captureEl: Element | null;
  } | null>(null);
  // Set when a drag actually moved so the trailing click event doesn't toggle
  // collapse after the user lifts their finger.
  const suppressClickRef = useRef(false);

  const finishDrag = useCallback((endY: number, endTime: number, pointerId: number) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== pointerId) return;
    const delta = endY - state.startY;
    const elapsed = endTime - state.startTime;
    const velocity = delta / Math.max(elapsed, 1); // px/ms, positive = downward
    const moved = state.moved;
    const axis = state.axis;
    dragStateRef.current = null;
    setIsDragging(false);

    if (axis !== 'y') {
      // We never took ownership of this gesture (horizontal swipe or tap) —
      // leave the sheet where it is.
      setDragY(0);
      return;
    }

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
  }, [onClose]);

  // Handle (pill) — eager vertical drag. The handle's only job is to dismiss,
  // so we lock to the y-axis on pointer down and capture immediately.
  const handleHandlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!expanded) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      moved: false,
      axis: 'y',
      captureEl: e.currentTarget,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleHandlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    if (state.axis !== 'y') return;
    const delta = e.clientY - state.startY;
    if (Math.abs(delta) > 4) state.moved = true;
    const next = delta >= 0 ? delta : Math.max(delta, -40) * 0.3;
    setDragY(next);
  };

  const handleHandlePointerEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    finishDrag(e.clientY, performance.now(), e.pointerId);
  };

  // Card content area — axis-locked vertical drag. We watch the first few
  // pixels of movement and only take ownership if the gesture is mostly
  // vertical. Horizontal motion is left to the native card scroller so
  // swipe-between-cards still works. We skip the gesture entirely when the
  // pointer starts on something interactive (button, link, etc.) so taps on
  // share / directions / dots aren't swallowed.
  const AXIS_LOCK_THRESHOLD = 8;

  const handleContentPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!expanded) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as Element | null;
    if (target?.closest('button, a, [role="button"], input, textarea, select')) {
      return;
    }
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      moved: false,
      axis: null,
      captureEl: e.currentTarget,
    };
  };

  const handleContentPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;

    if (state.axis === null) {
      if (Math.abs(dx) < AXIS_LOCK_THRESHOLD && Math.abs(dy) < AXIS_LOCK_THRESHOLD) {
        return;
      }
      if (Math.abs(dy) > Math.abs(dx)) {
        state.axis = 'y';
        state.moved = true;
        setIsDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // setPointerCapture can throw if the pointer is already released;
          // safe to ignore — we'll just rely on bubble events.
        }
      } else {
        state.axis = 'x';
      }
    }

    if (state.axis !== 'y') return;
    if (Math.abs(dy) > 4) state.moved = true;
    const next = dy >= 0 ? dy : Math.max(dy, -40) * 0.3;
    setDragY(next);
  };

  const handleContentPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    finishDrag(e.clientY, performance.now(), e.pointerId);
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
        className="absolute left-0 right-0 bottom-0 z-10 pointer-events-auto flex flex-col bg-cream/95 backdrop-blur-md border-t border-cream-dark shadow-2xl rounded-t-2xl overflow-hidden"
        style={{
          maxHeight: 'min(82dvh, 680px)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: !entered
            ? 'translate3d(0, 100%, 0)'
            : dragY
              ? `translate3d(0, ${dragY}px, 0)`
              : 'translate3d(0, 0, 0)',
          transition: isDragging
            ? 'none'
            : 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'transform',
        }}
      >
        {/* Drag handle — only rendered when the sheet is expanded, since
            that's the one state where swipe-down actually does something
            (dismiss). Collapsed state expands via the strip below being a
            tap target, so we don't need a faux-pill there. */}
        {expanded ? (
          <button
            type="button"
            onClick={handleHandleClick}
            onPointerDown={handleHandlePointerDown}
            onPointerMove={handleHandlePointerMove}
            onPointerUp={handleHandlePointerEnd}
            onPointerCancel={handleHandlePointerEnd}
            className="w-full flex flex-col items-center justify-center pt-2 pb-1 flex-shrink-0 group touch-none"
            aria-label="Swipe down to dismiss, or tap to collapse"
            aria-expanded={expanded}
            style={{ touchAction: 'none' }}
          >
            <span className="block w-9 h-1 rounded-full bg-gray-400/70 group-hover:bg-gray-500 transition-colors" />
          </button>
        ) : (
          <div className="h-2.5 flex-shrink-0" aria-hidden="true" />
        )}

        {expanded ? (
          <div
            className="flex flex-col flex-1 min-h-0"
            onPointerDown={handleContentPointerDown}
            onPointerMove={handleContentPointerMove}
            onPointerUp={handleContentPointerEnd}
            onPointerCancel={handleContentPointerEnd}
            style={{ touchAction: 'pan-x' }}
          >
            {/* Header — spot identity + travel context. Pure spot info,
                so the swipeable weather cards below can stay forecast-only. */}
            <div className="px-4 pt-1 pb-2 flex-shrink-0">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-serif text-lg font-semibold text-gray-800 truncate min-w-0">
                  {spot.name}
                </h2>
                <span
                  className="font-serif text-3xl font-light leading-none flex-shrink-0 tabular-nums"
                  style={{ color: getScoreColor(getScoreFor(activeCardType)) }}
                  aria-label={`${typeLabel[activeCardType]} score ${getScoreFor(activeCardType)} out of 100`}
                >
                  {getScoreFor(activeCardType)}
                </span>
              </div>

              {/* Travel row: pill toggle + plain ETA text + right-justified
                  icon pair (directions, street-view) that visually echoes
                  the share-button cluster sitting at the top-right of the
                  card just below. No background chip on the numbers — they
                  read as inline metadata, not a tappable element. */}
              <div className="mt-2 flex items-center gap-2.5">
                <TravelTogglePill
                  travelMode={travelMode}
                  onChange={onTravelModeChange}
                  palette={TOGGLE_PALETTE[activeCardType]}
                />

                <div className="flex items-baseline gap-1.5 tabular-nums leading-none">
                  <span
                    className="font-serif text-sm text-gray-800 inline-block text-right"
                    style={{ minWidth: '2.5ch' }}
                    aria-label={travelMode === 'walk' ? 'Walk time' : 'Drive time'}
                  >
                    {travelMinutes !== null ? travelMinutes : '—'}
                  </span>
                  <span className="font-mono text-[9px] text-gray-500 uppercase tracking-[1.5px]">
                    min
                  </span>
                  <span className="text-gray-300 mx-0.5" aria-hidden="true">·</span>
                  <span
                    className="font-serif text-sm text-gray-800 inline-block text-right"
                    style={{ minWidth: '2.5ch' }}
                  >
                    {distanceMi !== null ? distanceMi.toFixed(1) : '—'}
                  </span>
                  <span className="font-mono text-[9px] text-gray-500 uppercase tracking-[1.5px]">
                    mi
                  </span>
                </div>

                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleDirections}
                    className="w-7 h-7 rounded-full hover:bg-cream-dark/40 active:scale-95 flex items-center justify-center transition-colors text-gray-500 hover:text-gray-700"
                    aria-label={`Get directions to ${spot.name} in Google Maps`}
                    title="Open in Google Maps"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={handleStreetView}
                    className="w-7 h-7 rounded-full hover:bg-cream-dark/40 active:scale-95 flex items-center justify-center transition-colors text-gray-500 hover:text-gray-700"
                    aria-label={`Preview street view of ${spot.name}`}
                    title="Preview the view"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 7V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3" />
                      <path d="M15 7V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3" />
                      <path d="M4 21a2 2 0 0 1-2-2v-3.85c0-1.39 2-2.96 2-4.83V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2z" />
                      <path d="M20 21a2 2 0 0 0 2-2v-3.85c0-1.39-2-2.96-2-4.83V8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2z" />
                      <path d="M10 10h4" />
                      <path d="M2 16h20" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Cards — swipeable, one card per page, snaps cleanly */}
            <div
              ref={scrollerRef}
              className="score-cards-scroll flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory w-full min-h-0 flex-1"
              style={{ touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}
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
                    city={city}
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
          </div>
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
