import { memo, useMemo } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { type Spot } from '../data/spots';
import { getScoreTier, tierColors, type ScoreTier } from '../utils/scoring';

const isCoarsePointer =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: none)').matches;

interface SpotMarkerProps {
  spot: Spot;
  /** Score for the next upcoming event at this spot (0–100). */
  score: number;
  isActive: boolean;
  onClick: (spot: Spot) => void;
  /** Optional one-liner shown under the spot name (used for Karl quips on bad-night spots). */
  quip?: string;
}

interface PinSpec {
  size: number;
  fontSize: number;
  showScore: boolean;
}

function pinSpec(tier: ScoreTier): PinSpec {
  switch (tier) {
    case 'great':
      return { size: 34, fontSize: 12, showScore: true };
    case 'decent':
      return { size: 28, fontSize: 11, showScore: true };
    case 'poor':
      // 22px / 9px is tight for a 2-digit number — drop the text and just
      // show the muted dot so low-scoring spots fade into the background.
      return { size: 22, fontSize: 9, showScore: false };
    default: {
      const _exhaustive: never = tier;
      throw new Error(`Unhandled tier: ${String(_exhaustive)}`);
    }
  }
}

const HIT = 44;

function createMarkerIcon(score: number, isActive: boolean): L.DivIcon {
  const tier = getScoreTier(score);
  const color = tierColors[tier];
  const { size, fontSize, showScore } = pinSpec(tier);
  const borderWidth = isActive ? 3 : 2;
  const ring = isActive ? 'box-shadow: 0 0 0 3px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.25);' : 'box-shadow: 0 1px 4px rgba(0,0,0,0.22);';
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  const label = showScore
    ? `<span style="
        color:white;
        font-family:'DM Mono', monospace;
        font-size:${fontSize}px;
        font-weight:600;
        line-height:1;
        letter-spacing:0;
        text-shadow:0 1px 1px rgba(0,0,0,0.18);
      ">${safeScore}</span>`
    : '';

  const dot = `<div style="
    width:${size}px; height:${size}px;
    border-radius:50%;
    background:${color};
    border:${borderWidth}px solid white;
    ${ring}
    display:flex; align-items:center; justify-content:center;
  ">${label}</div>`;

  const html = `<div style="
    width:${HIT}px; height:${HIT}px;
    display:flex; align-items:center; justify-content:center;
    -webkit-tap-highlight-color: transparent;
  ">${dot}</div>`;

  return L.divIcon({
    className: '',
    html,
    iconSize: [HIT, HIT],
    iconAnchor: [HIT / 2, HIT / 2],
    popupAnchor: [0, -size / 2],
  });
}

function SpotMarker({ spot, score, isActive, onClick, quip }: SpotMarkerProps) {
  // Memoize the icon so live-score ticks that don't change the displayed
  // number (or active state) don't trigger leaflet's setIcon DOM swap.
  // Without this, every `liveScores` update repaints all ~115 markers.
  const icon = useMemo(() => createMarkerIcon(score, isActive), [score, isActive]);
  // Higher-scoring pins render on top so dense clusters favor the better
  // night. Active pin always wins. Range chosen to stay well below the user
  // location marker (zIndexOffset 500 in MapView) while still ordering pins.
  const zIndexOffset = isActive ? 1000 : Math.round(Math.max(0, Math.min(100, score)));

  return (
    <Marker
      position={[spot.lat, spot.lng]}
      icon={icon}
      zIndexOffset={zIndexOffset}
      eventHandlers={{
        click: () => onClick(spot),
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
          {quip ? (
            <span>
              {spot.name}
              <span style={{ display: 'block', fontStyle: 'italic', opacity: 0.75, marginTop: 2 }}>
                {quip}
              </span>
            </span>
          ) : (
            spot.name
          )}
        </Tooltip>
      )}
    </Marker>
  );
}

export default memo(SpotMarker);
