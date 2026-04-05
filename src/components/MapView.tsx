import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L, { type LatLngBoundsExpression } from 'leaflet';
import { type Spot, spots } from '../data/spots';
import { type UserLocation } from '../hooks/useGeolocation';
import type { Filters } from '../App';
import SpotMarker from './SpotMarker';

const SF_CENTER: [number, number] = [37.7649, -122.4494];
const SF_BOUNDS: LatLngBoundsExpression = [
  [37.695, -122.530],
  [37.820, -122.350],
];

const userIcon = L.divIcon({
  className: '',
  html: `<div style="
    width: 14px; height: 14px;
    background: #3B82F6;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 0 3px rgba(59,130,246,0.3), 0 2px 8px rgba(0,0,0,0.15);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

interface MapViewProps {
  selectedSpot: Spot | null;
  onSelectSpot: (spot: Spot) => void;
  onDeselectSpot: () => void;
  userLocation: UserLocation | null;
  filters: Filters;
}

function MapClickHandler({ onDeselect }: { onDeselect: () => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onDeselect();
    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [map, onDeselect]);
  return null;
}

function MapController({ selectedSpot }: { selectedSpot: Spot | null }) {
  const map = useMap();

  useEffect(() => {
    if (selectedSpot) {
      const zoom = 15;
      const spotPoint = map.project([selectedSpot.lat, selectedSpot.lng], zoom);
      const mapHeight = map.getSize().y;
      // Score panel covers ~60% of screen. Place the spot at ~20% from top.
      const offsetY = mapHeight * 0.4;
      const adjustedPoint = L.point(spotPoint.x, spotPoint.y + offsetY);
      const adjustedLatLng = map.unproject(adjustedPoint, zoom);
      map.flyTo(adjustedLatLng, zoom, { duration: 0.8 });
    }
  }, [selectedSpot, map]);

  return null;
}

function passesFilter(spot: Spot, filters: Filters): boolean {
  return (
    spot.sunrise >= filters.sunrise[0] && spot.sunrise <= filters.sunrise[1] &&
    spot.sunset >= filters.sunset[0] && spot.sunset <= filters.sunset[1] &&
    spot.stargazing >= filters.stargazing[0] && spot.stargazing <= filters.stargazing[1]
  );
}

export default function MapView({ selectedSpot, onSelectSpot, onDeselectSpot, userLocation, filters }: MapViewProps) {
  const filteredSpots = spots.filter((s) => passesFilter(s, filters));
  return (
    <MapContainer
      center={SF_CENTER}
      zoom={13}
      maxBounds={SF_BOUNDS}
      maxBoundsViscosity={0.8}
      minZoom={12}
      maxZoom={17}
      zoomControl={false}
      className="warm-tiles w-full h-full"
      attributionControl={false}
    >
      {/* Clean base — no labels */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
        className="base-tiles"
      />
      {/* Labels only — controlled opacity */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
        className="label-tiles"
      />

      {userLocation && (
        <Marker
          position={[userLocation.lat, userLocation.lng]}
          icon={userIcon}
          zIndexOffset={500}
        >
          <Tooltip direction="top" offset={[0, -10]} className="spot-tooltip" opacity={1}>
            You are here
          </Tooltip>
        </Marker>
      )}

      {filteredSpots.map((spot) => (
        <SpotMarker
          key={spot.id}
          spot={spot}
          isActive={selectedSpot?.id === spot.id}
          onClick={onSelectSpot}
        />
      ))}

      <MapController selectedSpot={selectedSpot} />
      <MapClickHandler onDeselect={onDeselectSpot} />
    </MapContainer>
  );
}
