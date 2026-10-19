import { memo, useEffect, useMemo, useRef } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { type Spot } from '../data/spots';
import { getScoreTier, type ScoreTier } from '../utils/scoring';
import { getMapPinColor, getMapPinTextColor } from '../utils/mapPinColor';
import { scoreEvidenceAccessibilityLabel, formatScoreValue, type ScoreEvidence } from '../utils/confidence';

const isCoarsePointer =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: none)').matches;

interface SpotMarkerProps {
  spot: Spot;
  /** Score for the next upcoming event at this spot (0–100). */
  score: number;
  evidence: ScoreEvidence | null;
  isActive: boolean;
  /** Briefly pulse this pin (used after the score card is dismissed so the
   *  user can see where the spot they were just viewing is on the map). */
  isHighlighted?: boolean;
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
    case 'vivid':
      return { size: 36, fontSize: 14, showScore: true };
    case 'good':
      return { size: 34, fontSize: 13, showScore: true };
    case 'fair':
      return { size: 32, fontSize: 12, showScore: true };
    case 'low':
      return { size: 30, fontSize: 12, showScore: true };
    case 'poor':
      return { size: 28, fontSize: 11, showScore: true };
    default: {
      const _exhaustive: never = tier;
      throw new Error(`Unhandled tier: ${String(_exhaustive)}`);
    }
  }
}

const HIT = 44;

function createMarkerIcon(score: number, isActive: boolean, isHighlighted: boolean, scoreLabel: string): L.DivIcon {
  const tier = getScoreTier(score);
  // Score colors change smoothly; the selected spot has a distinct teal ring.
  const color = getMapPinColor(score);
  const { size, fontSize, showScore } = pinSpec(tier);
  const borderWidth = isActive ? 3 : 2;
  const ring = isActive ? 'box-shadow: 0 0 0 2px #155561, 0 3px 8px rgba(21,85,97,0.24);' : 'box-shadow: 0 2px 5px rgba(23,37,39,0.20);';

  // Sonar-style ring stamped behind the dot. Sized to the dot itself so the
  // pulse always feels proportional to the pin tier, and tinted with the
  // pin's tier color so it reads as "this one" instead of a generic flash.
  const pulse = isHighlighted
    ? `<span class="spot-pulse-ring" style="
        position:absolute;
        width:${size}px; height:${size}px;
        border-radius:50%;
        background:${color};
        pointer-events:none;
      "></span>`
    : '';
  const label = showScore
    ? `<span style="
        color:${getMapPinTextColor(score)};
        font-family:'DM Sans', sans-serif;
        font-size:${fontSize}px;
        font-weight:700;
        line-height:1;
        letter-spacing:0;
      ">${scoreLabel}</span>`
    : '';

  const dot = `<div style="
    position:relative;
    width:${size}px; height:${size}px;
    border-radius:50%;
    background:${color};
    border:${borderWidth}px solid white;
    ${ring}
    display:flex; align-items:center; justify-content:center;
  ">${label}</div>`;

  const html = `<div style="
    position:relative;
    width:${HIT}px; height:${HIT}px;
    display:flex; align-items:center; justify-content:center;
    -webkit-tap-highlight-color: transparent;
  ">${pulse}${dot}</div>`;

  return L.divIcon({
    className: '',
    html,
    iconSize: [HIT, HIT],
    iconAnchor: [HIT / 2, HIT / 2],
    popupAnchor: [0, -size / 2],
  });
}

function SpotMarker({ spot, score, evidence, isActive, isHighlighted = false, onClick, quip }: SpotMarkerProps) {
  const markerRef = useRef<L.Marker>(null);
  const evidenceLabel = evidence
    ? scoreEvidenceAccessibilityLabel(score, evidence)
    : `${Math.max(0, Math.min(100, Math.round(score)))} out of 100, curated estimate`;
  // Memoize the icon so live-score ticks that don't change the displayed
  // number (or active state) don't trigger leaflet's setIcon DOM swap.
  // Without this, every `liveScores` update repaints all ~115 markers.
  const scoreLabel = formatScoreValue(score);
  const icon = useMemo(
    () => createMarkerIcon(score, isActive, isHighlighted, scoreLabel),
    [score, isActive, isHighlighted, scoreLabel],
  );
  // Higher-scoring pins render on top so dense clusters favor the better
  // night, then highlighted/active pins win so the pulse isn't masked by a
  // neighbor. Range stays well below the user location marker (zIndexOffset
  // 500 in MapView).
  const zIndexOffset = isActive
    ? 1000
    : isHighlighted
      ? 900
      : Number.isFinite(score) ? Math.round(Math.max(0, Math.min(100, score))) : 0;

  useEffect(() => {
    markerRef.current?.getElement()?.setAttribute(
      'aria-label',
      `${spot.name}, score ${evidenceLabel}`,
    );
  }, [evidenceLabel, spot.name]);

  return (
    <Marker
      ref={markerRef}
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
