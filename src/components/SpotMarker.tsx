import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { type Spot } from '../data/spots';

interface SpotMarkerProps {
  spot: Spot;
  isActive: boolean;
  onClick: (spot: Spot) => void;
}

const colors: Record<Spot['category'], string> = {
  hilltop: '#F97316',
  waterfront: '#60A5FA',
  park: '#34D399',
};

function createMarkerIcon(category: Spot['category'], isActive: boolean): L.DivIcon {
  const size = isActive ? 16 : 10;
  const color = colors[category];

  const html = isActive
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

  return L.divIcon({
    className: '',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

export default function SpotMarker({ spot, isActive, onClick }: SpotMarkerProps) {
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
      <Tooltip
        direction="top"
        offset={[0, -12]}
        className="spot-tooltip"
        opacity={1}
      >
        {spot.name}
      </Tooltip>
    </Marker>
  );
}
