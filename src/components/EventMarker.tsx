import { memo, useMemo } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { CuratedEvent } from '../data/events';
import { eventGlyphSvg } from './eventGlyphs';

const isCoarsePointer =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: none)').matches;

// Events get their own visual channel: a diamond (rotated square), not a
// circle, so shape alone separates "curated experience" from "scored spot".
// Single warm violet — deliberately absent from the score-tier palette, so it
// never reads as a 0–100 score.
const EVENT_COLOR = '#C084FC';
const SIZE = 28; // matches a "fair" tier spot pin — present but not competing
const HIT = 44;

function createEventIcon(event: CuratedEvent, isActive: boolean): L.DivIcon {
  // Static shadow when the event is today-but-not-live; the animated glow
  // (event-pin-active) only kicks in inside the daily active-hours window.
  const staticShadow = '0 0 8px rgba(192, 132, 252, 0.4), 0 1px 4px rgba(0,0,0,0.22)';
  const activeClass = isActive ? 'event-pin-active' : '';

  // The diamond is a square rotated 45°; the glyph is counter-rotated so it
  // stays upright inside it.
  const diamond = `<div class="${activeClass}" style="
    width:${SIZE}px; height:${SIZE}px;
    background:${EVENT_COLOR};
    border:2px solid white;
    border-radius:4px;
    transform:rotate(45deg);
    box-shadow:${isActive ? 'none' : staticShadow};
    display:flex; align-items:center; justify-content:center;
  ">
    <span style="transform:rotate(-45deg); display:flex; align-items:center; justify-content:center; line-height:0;">
      ${eventGlyphSvg(event.category)}
    </span>
  </div>`;

  const html = `<div style="
    position:relative;
    width:${HIT}px; height:${HIT}px;
    display:flex; align-items:center; justify-content:center;
    -webkit-tap-highlight-color: transparent;
  ">${diamond}</div>`;

  return L.divIcon({
    className: '',
    html,
    iconSize: [HIT, HIT],
    iconAnchor: [HIT / 2, HIT / 2],
    popupAnchor: [0, -SIZE / 2],
  });
}

interface EventMarkerProps {
  event: CuratedEvent;
  /** True while the event is inside its daily active-hours window. */
  isActive: boolean;
  onClick: (event: CuratedEvent) => void;
}

function EventMarker({ event, isActive, onClick }: EventMarkerProps) {
  const icon = useMemo(() => createEventIcon(event, isActive), [event, isActive]);

  return (
    <Marker
      position={[event.lat, event.lng]}
      icon={icon}
      // Above the crowd of scored spot pins (0–100) so the handful of curated
      // diamonds are always findable, but below the user-location marker (500)
      // and any actively-highlighted spot pin.
      zIndexOffset={isActive ? 420 : 400}
      eventHandlers={{
        click: () => onClick(event),
      }}
    >
      {!isCoarsePointer && (
        <Tooltip
          direction="top"
          offset={[0, -12]}
          className="spot-tooltip"
          opacity={1}
          interactive={false}
        >
          {event.name}
        </Tooltip>
      )}
    </Marker>
  );
}

export default memo(EventMarker);
