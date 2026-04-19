import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { type Spot } from '../data/spots';

const isCoarsePointer =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: none)').matches;

interface SpotMarkerProps {
  spot: Spot;
  isActive: boolean;
  onClick: (spot: Spot) => void;
  /** Optional one-liner shown under the spot name (used for Karl quips on bad-night spots). */
  quip?: string;
}

export const categoryColors: Record<Spot['category'], string> = {
  hilltop: '#FDBA74',
  waterfront: '#93C5FD',
  park: '#86EFAC',
};

export const categoryLabels: Record<Spot['category'], string> = {
  hilltop: 'Hilltop',
  waterfront: 'Waterfront',
  park: 'Park',
};

const HIT = 40;

function createMarkerIcon(category: Spot['category'], isActive: boolean): L.DivIcon {
  const size = isActive ? 16 : 10;
  const color = categoryColors[category];

  const dot = isActive
    ? `<div style="position:relative; width:${size}px; height:${size}px;">
        <div style="
          position:absolute; inset:-6px;
          border-radius:50%;
          background: ${color};
          opacity: 0.2;
          animation: ping 1.5s cubic-bezier(0,0,0.2,1) infinite;
        "></div>
        <div style="
          width:${size}px; height:${size}px;
          border-radius:50%;
          background:${color};
          border:2.5px solid white;
          box-shadow: 0 1px 6px rgba(0,0,0,0.3);
        "></div>
      </div>`
    : `<div style="
        width:${size}px; height:${size}px;
        border-radius:50%;
        background:${color};
        border:2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.2);
      "></div>`;

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

export default function SpotMarker({ spot, isActive, onClick, quip }: SpotMarkerProps) {
  const icon = createMarkerIcon(spot.category, isActive);

  return (
    <Marker
      position={[spot.lat, spot.lng]}
      icon={icon}
      zIndexOffset={isActive ? 1000 : 0}
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
