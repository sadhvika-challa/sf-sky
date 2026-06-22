import { useCallback, useEffect, useRef, useState } from 'react';
import type { CuratedEvent } from '../data/events';
import { formatActiveHours, isEventActive } from '../data/events';
import type { Spot } from '../data/spots';
import { allSpots } from '../data/all-spots';
import { getEventKarlLine } from '../utils/karl-copy';
import { computeNowBaseScore, type ViewMode } from '../utils/scoring';
import type { LiveScoresMap } from '../hooks/useLiveScores';

interface EventDetailSheetProps {
  event: CuratedEvent;
  onClose: () => void;
  /** Tapping the linked-spot row closes this sheet and opens the spot's ScorePanel. */
  onSelectSpot: (spot: Spot) => void;
  liveScores?: LiveScoresMap;
  viewMode?: ViewMode;
}

const VIEW_MODE_LABEL: Record<ViewMode, string> = {
  now: 'now',
  sunrise: 'sunrise',
  sunset: 'sunset',
  stargazing: 'stargazing',
};

/** Live (or base) score for a spot at the current view mode. */
function spotScore(spot: Spot, liveScores: LiveScoresMap | undefined, viewMode: ViewMode): number {
  const live = liveScores?.get(spot.id);
  if (live) return live[viewMode];
  if (viewMode === 'now') return computeNowBaseScore(spot);
  return spot[viewMode];
}

function categoryLabel(category: CuratedEvent['category']): string {
  return category.replace(/-/g, ' ').toUpperCase();
}

export default function EventDetailSheet({
  event,
  onClose,
  onSelectSpot,
  liveScores,
  viewMode = 'now',
}: EventDetailSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const live = isEventActive(event);
  const karlLine = getEventKarlLine(event);
  const linkedSpot = event.spotId
    ? allSpots.find((s) => s.id === event.spotId)
    : undefined;

  const handleDirections = () => {
    const destination = `${event.lat},${event.lng}`;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  const handleShare = async () => {
    const text = `${karlLine} Check it on Soleil.`;
    const shareData: ShareData = {
      title: event.name,
      text,
      url: event.url ?? window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${shareData.url ?? ''}`.trim());
      }
    } catch {
      // User dismissed the share sheet, or clipboard denied — non-fatal.
    }
  };

  // Entrance animation — mirror ScorePanel: start at translateY(100%), defer
  // two frames so the initial transform commits before transitioning to rest.
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

  // Swipe-down-to-dismiss — same gesture model as ScorePanel's drag handle.
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startY: number;
    startTime: number;
    moved: boolean;
  } | null>(null);

  const finishDrag = useCallback(
    (endY: number, endTime: number, pointerId: number) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== pointerId) return;
      const delta = endY - state.startY;
      const elapsed = endTime - state.startTime;
      const velocity = delta / Math.max(elapsed, 1);
      dragStateRef.current = null;
      setIsDragging(false);

      const sheetHeight = sheetRef.current?.getBoundingClientRect().height ?? 480;
      const distanceThreshold = Math.min(120, sheetHeight * 0.25);
      if (delta > distanceThreshold || velocity > 0.6) {
        setDragY(sheetHeight);
        window.setTimeout(onClose, 200);
        return;
      }
      setDragY(0);
    },
    [onClose],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
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

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const delta = e.clientY - state.startY;
    if (Math.abs(delta) > 4) state.moved = true;
    const next = delta >= 0 ? delta : Math.max(delta, -40) * 0.3;
    setDragY(next);
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    finishDrag(e.clientY, performance.now(), e.pointerId);
  };

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const backdropProgress = Math.max(0, 1 - dragY / 320);

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/30 backdrop-blur-sm pointer-events-auto ${
          isDragging ? '' : 'transition-opacity duration-300'
        }`}
        style={{ opacity: backdropProgress }}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${event.name} details`}
        className="absolute left-0 right-0 bottom-0 z-10 pointer-events-auto flex flex-col bg-cream/95 backdrop-blur-md border-t border-cream-dark shadow-2xl rounded-t-2xl overflow-hidden"
        style={{
          maxHeight: 'min(60dvh, 480px)',
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
        {/* Drag handle */}
        <button
          type="button"
          onClick={onClose}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          className="w-full flex flex-col items-center justify-center pt-2 pb-1 flex-shrink-0 group touch-none"
          aria-label="Swipe down to dismiss"
          style={{ touchAction: 'none' }}
        >
          <span className="block w-9 h-1 rounded-full bg-gray-400/70 group-hover:bg-gray-500 transition-colors" />
        </button>

        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto px-4 pt-1 pb-4">
          {/* Category pill */}
          <span
            className="self-start font-mono text-[10px] tracking-[1.5px] px-2 py-1 rounded-full"
            style={{ background: 'rgba(192, 132, 252, 0.15)', color: '#7C3AED' }}
          >
            {categoryLabel(event.category)}
          </span>

          {/* Event name — hero */}
          <h2 className="font-serif text-xl font-semibold text-gray-800 mt-2.5">
            {event.name}
          </h2>

          {/* Tagline — Karl's voice */}
          <p className="font-serif text-sm italic text-gray-600 mt-1">
            {karlLine}
          </p>

          {/* Time window */}
          <div className="font-mono text-[10px] text-gray-500 uppercase tracking-[2px] mt-3 flex items-center gap-1.5">
            {live && (
              <>
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: '#C084FC' }}
                  aria-hidden="true"
                />
                <span style={{ color: '#7C3AED' }}>LIVE</span>
                <span className="text-gray-300">·</span>
              </>
            )}
            <span>{formatActiveHours(event)}</span>
          </div>

          {/* Description */}
          <p className="font-sans text-sm text-gray-700 leading-relaxed mt-3">
            {event.description}
          </p>

          {/* Note callout — mirrors the spot accessAlert pattern */}
          {event.note && (
            <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                className="text-amber-700 flex-shrink-0 mt-0.5"
                aria-hidden="true"
              >
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 7.2v3.4M8 5.2v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span className="text-[11px] font-mono text-amber-800 leading-snug">
                {event.note}
              </span>
            </div>
          )}

          {/* Linked spot row */}
          {linkedSpot && (
            <button
              type="button"
              onClick={() => onSelectSpot(linkedSpot)}
              className="mt-3 flex items-center gap-1.5 text-left active:opacity-70 transition-opacity"
              aria-label={`Open ${linkedSpot.name} scores`}
            >
              <span className="font-mono text-[11px] text-gray-500">At</span>
              <span className="font-serif text-sm font-medium text-violet-700 underline decoration-violet-300 underline-offset-2">
                {linkedSpot.name}
              </span>
              <span className="font-mono text-[11px] text-gray-500">
                · {spotScore(linkedSpot, liveScores, viewMode)}/100 for {VIEW_MODE_LABEL[viewMode]}
              </span>
            </button>
          )}

          {/* Action row */}
          <div className="mt-4 pt-3 border-t border-cream-dark flex items-center gap-1">
            <button
              type="button"
              onClick={handleDirections}
              className="w-11 h-11 rounded-full flex items-center justify-center text-gray-400 active:bg-cream-dark/40 active:text-gray-600"
              aria-label="Get directions"
              title="Get directions"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 11l19-9-9 19-2-8-8-2z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="w-11 h-11 rounded-full flex items-center justify-center text-gray-400 active:bg-cream-dark/40 active:text-gray-600"
              aria-label="Share this event"
              title="Share"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
              </svg>
            </button>

            {event.url && (
              <a
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-gray-500 hover:text-gray-700 px-2 py-2"
              >
                More info
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <path d="M15 3h6v6M10 14L21 3" />
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
