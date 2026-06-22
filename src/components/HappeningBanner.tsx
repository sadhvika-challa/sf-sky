import { useMemo, useRef, useState } from 'react';
import type { CuratedEvent } from '../data/events';
import { getTodaysEvents, getActiveEvents, formatActiveHours } from '../data/events';
import { eventGlyphSvg } from './eventGlyphs';

const EVENT_COLOR = '#C084FC';

/** Small violet diamond with the category glyph — echoes the map pin. */
function BannerDiamond({ event }: { event: CuratedEvent }) {
  return (
    <span
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: 16,
        height: 16,
        background: EVENT_COLOR,
        borderRadius: 3,
        transform: 'rotate(45deg)',
        boxShadow: '0 0 6px rgba(192,132,252,0.4)',
      }}
      aria-hidden="true"
    >
      <span
        style={{ transform: 'rotate(-45deg)', display: 'flex', lineHeight: 0 }}
        dangerouslySetInnerHTML={{ __html: eventGlyphSvg(event.category, 8) }}
      />
    </span>
  );
}

function EventCard({
  event,
  active,
  onSelect,
}: {
  event: CuratedEvent;
  active: boolean;
  onSelect: (event: CuratedEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className="snap-start flex items-center gap-2.5 text-left bg-cream/90 backdrop-blur-md border border-cream-dark rounded-xl shadow-md px-3 py-2.5 active:scale-[0.98] transition-transform"
      aria-label={`${event.name} — view details`}
    >
      <BannerDiamond event={event} />
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-sm font-medium text-gray-800 truncate">
          {event.name}
        </span>
        <span className="font-mono text-[9px] text-gray-500 uppercase tracking-[1px] flex items-center gap-1">
          {active && (
            <>
              <span
                className="inline-block w-1 h-1 rounded-full animate-pulse"
                style={{ background: EVENT_COLOR }}
              />
              <span style={{ color: '#7C3AED' }}>LIVE</span>
              <span className="text-gray-300">·</span>
            </>
          )}
          {formatActiveHours(event)}
        </span>
      </span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="text-gray-300 flex-shrink-0"
        aria-hidden="true"
      >
        <path d="M5 3l4 4-4 4" />
      </svg>
    </button>
  );
}

interface HappeningBannerProps {
  onSelectEvent: (event: CuratedEvent) => void;
  onDismiss: () => void;
}

export default function HappeningBanner({ onSelectEvent, onDismiss }: HappeningBannerProps) {
  // Active (in-window) events sort first so "what's on right now" leads.
  const events = useMemo(() => {
    const todays = getTodaysEvents();
    const activeIds = new Set(getActiveEvents().map((e) => e.id));
    return [...todays].sort((a, b) => {
      const aActive = activeIds.has(a.id) ? 0 : 1;
      const bActive = activeIds.has(b.id) ? 0 : 1;
      return aActive - bActive;
    });
  }, []);
  const activeIds = useMemo(() => new Set(getActiveEvents().map((e) => e.id)), []);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);

  if (events.length === 0) return null;

  const multiple = events.length > 1;

  const handleScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const cards = Array.from(scroller.querySelectorAll<HTMLElement>('[data-event-card]'));
    if (cards.length === 0) return;
    const cardWidth = cards[0].offsetWidth + 8; // + gap
    setPage(Math.round(scroller.scrollLeft / cardWidth));
  };

  return (
    <div
      className="absolute left-0 right-0 z-20 px-3 pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top) + 4rem)' }}
    >
      <div className="relative pointer-events-auto">
        {multiple ? (
          <div
            ref={scrollerRef}
            onScroll={handleScroll}
            className="flex gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-hide pr-8"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {events.map((evt) => (
              <div key={evt.id} data-event-card className="w-[260px] flex-shrink-0">
                <EventCard
                  event={evt}
                  active={activeIds.has(evt.id)}
                  onSelect={onSelectEvent}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="pr-8">
            <div className="w-full">
              <EventCard
                event={events[0]}
                active={activeIds.has(events[0].id)}
                onSelect={onSelectEvent}
              />
            </div>
          </div>
        )}

        {/* Dismiss — session-only; sits over the top-right corner. */}
        <button
          type="button"
          onClick={onDismiss}
          className="absolute -top-1.5 -right-0.5 w-6 h-6 rounded-full bg-cream border border-cream-dark shadow flex items-center justify-center text-gray-400 hover:text-gray-600"
          aria-label="Dismiss tonight's events"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {/* Page indicator dots — only when > 2 events. */}
        {events.length > 2 && (
          <div className="flex items-center justify-center gap-1.5 mt-1.5">
            {events.map((evt, i) => (
              <span
                key={evt.id}
                className={`rounded-full transition-all duration-200 ${
                  i === page ? 'w-3 h-1 bg-gray-500' : 'w-1 h-1 bg-gray-300'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
