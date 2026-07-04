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

// Small American flag glyph rendered at the same footprint as the diamond so
// tap targets, anchors, and the active-hours pulse stay aligned. The pulse
// wrapper is a square with the same SIZE so `.event-pin-active` (or its
// fireworks variant) puts a glow ring behind the flag identical to the one
// behind the diamond.
const FLAG_SVG = `<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35));">
  <rect x="5" y="3" width="1.7" height="20" rx="0.85" fill="#6b5b4b"/>
  <rect x="6.3" y="4" width="16.5" height="11" rx="1.1" fill="#B22234" stroke="#ffffff" stroke-width="0.9"/>
  <rect x="6.3" y="5.6"  width="16.5" height="1.57" fill="#ffffff"/>
  <rect x="6.3" y="8.74" width="16.5" height="1.57" fill="#ffffff"/>
  <rect x="6.3" y="11.88" width="16.5" height="1.57" fill="#ffffff"/>
  <rect x="6.3" y="4" width="7.2" height="6.3" rx="1.1" fill="#3C3B6E"/>
  <g fill="#ffffff">
    <circle cx="8.1" cy="5.4" r="0.5"/><circle cx="9.9" cy="5.4" r="0.5"/><circle cx="11.7" cy="5.4" r="0.5"/>
    <circle cx="9.0" cy="6.9" r="0.5"/><circle cx="10.8" cy="6.9" r="0.5"/>
    <circle cx="8.1" cy="8.4" r="0.5"/><circle cx="9.9" cy="8.4" r="0.5"/><circle cx="11.7" cy="8.4" r="0.5"/>
  </g>
</svg>`;

function createEventIcon(event: CuratedEvent, isActive: boolean): L.DivIcon {
  // Static shadow when the event is today-but-not-live; the animated glow
  // (event-pin-active) only kicks in inside the daily active-hours window.
  const staticShadow = '0 0 8px rgba(192, 132, 252, 0.4), 0 1px 4px rgba(0,0,0,0.22)';
  const activeClass = isActive ? 'event-pin-active' : '';

  let inner: string;
  if (event.category === 'fireworks') {
    // Fireworks pins swap the violet diamond for a full flag SVG at the same
    // footprint. Warm-gold pulse when active so the July 4 pins read
    // celebratory rather than the standard installation violet.
    const fireworksActiveClass = isActive ? 'event-pin-active-fireworks' : '';
    inner = `<div class="${fireworksActiveClass}" style="
      width:${SIZE}px; height:${SIZE}px;
      border-radius:6px;
      display:flex; align-items:center; justify-content:center;
      box-shadow:${isActive ? 'none' : '0 1px 4px rgba(0,0,0,0.22)'};
    ">${FLAG_SVG}</div>`;
  } else {
    // The diamond is a square rotated 45°; the glyph is counter-rotated so it
    // stays upright inside it.
    inner = `<div class="${activeClass}" style="
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
  }

  const html = `<div style="
    position:relative;
    width:${HIT}px; height:${HIT}px;
    display:flex; align-items:center; justify-content:center;
    -webkit-tap-highlight-color: transparent;
  ">${inner}</div>`;

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
