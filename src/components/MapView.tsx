import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L, { type LatLngBoundsExpression } from 'leaflet';
import { type Spot, spots } from '../data/spots';
import { type UserLocation } from '../hooks/useGeolocation';
import { type LiveScoresMap } from '../hooks/useLiveScores';
import { getKarlComment } from '../utils/karl-copy';
import type { ScoreType } from '../utils/scoring';
import type { Filters } from '../App';
import SpotMarker from './SpotMarker';

const isCoarsePointer =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: none)').matches;

const SF_CENTER: [number, number] = [37.7649, -122.4494];
const SF_BOUNDS: LatLngBoundsExpression = [
  [37.695, -122.530],
  [37.820, -122.350],
];

const USER_HIT = 40;
const userIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:${USER_HIT}px; height:${USER_HIT}px;
    display:flex; align-items:center; justify-content:center;
    -webkit-tap-highlight-color: transparent;
  ">
    <div style="
      width: 14px; height: 14px;
      background: #3B82F6;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 0 0 3px rgba(59,130,246,0.3), 0 2px 8px rgba(0,0,0,0.15);
    "></div>
  </div>`,
  iconSize: [USER_HIT, USER_HIT],
  iconAnchor: [USER_HIT / 2, USER_HIT / 2],
});

interface MapViewProps {
  selectedSpot: Spot | null;
  onSelectSpot: (spot: Spot) => void;
  onDeselectSpot: () => void;
  userLocation: UserLocation | null;
  filters: Filters;
  liveScores: LiveScoresMap;
}

function MapClickHandler({ onDeselect }: { onDeselect: () => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => {
      const target = e.originalEvent.target as HTMLElement | null;
      if (target?.closest('.leaflet-marker-icon')) return;
      onDeselect();
    };
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

/**
 * If the spot's best live score is rough (< 30), surface a Karl quip in the
 * marker tooltip. Returns undefined for static-only spots so we don't spoof
 * a "live" read with stale base scores.
 */
function getMarkerQuip(spot: Spot, liveScores: LiveScoresMap): string | undefined {
  const entry = liveScores.get(spot.id);
  if (!entry || !entry.isLive) return undefined;
  const best = Math.max(entry.sunrise, entry.sunset, entry.stargazing);
  if (best >= 30) return undefined;
  // Use the event type the spot is best at for a slightly less brutal line.
  let bestType: ScoreType = 'sunset';
  if (entry.sunrise >= entry.sunset && entry.sunrise >= entry.stargazing) bestType = 'sunrise';
  else if (entry.stargazing > entry.sunset) bestType = 'stargazing';
  return getKarlComment(best, bestType, spot.id);
}

function passesFilter(spot: Spot, filters: Filters, liveScores: LiveScoresMap): boolean {
  const scores = liveScores.get(spot.id);
  const sunrise = scores?.sunrise ?? spot.sunrise;
  const sunset = scores?.sunset ?? spot.sunset;
  const stargazing = scores?.stargazing ?? spot.stargazing;
  return (
    sunrise >= filters.sunrise[0] && sunrise <= filters.sunrise[1] &&
    sunset >= filters.sunset[0] && sunset <= filters.sunset[1] &&
    stargazing >= filters.stargazing[0] && stargazing <= filters.stargazing[1]
  );
}

export default function MapView({ selectedSpot, onSelectSpot, onDeselectSpot, userLocation, filters, liveScores }: MapViewProps) {
  const filteredSpots = spots.filter((s) => passesFilter(s, filters, liveScores));
  return (
    <MapContainer
      center={SF_CENTER}
      zoom={13}
      maxBounds={SF_BOUNDS}
      maxBoundsViscosity={0.8}
      minZoom={12}
      maxZoom={17}
      zoomControl={false}
      className="w-full h-full"
      attributionControl={false}
      preferCanvas
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains={['a', 'b', 'c', 'd']}
        detectRetina
      />

      {userLocation && (
        <Marker
          position={[userLocation.lat, userLocation.lng]}
          icon={userIcon}
          zIndexOffset={500}
        >
          {!isCoarsePointer && (
            <Tooltip direction="top" offset={[0, -10]} className="spot-tooltip" opacity={1} interactive={false}>
              You are here
            </Tooltip>
          )}
        </Marker>
      )}

      {filteredSpots.map((spot) => (
        <SpotMarker
          key={spot.id}
          spot={spot}
          isActive={selectedSpot?.id === spot.id}
          onClick={onSelectSpot}
          quip={getMarkerQuip(spot, liveScores)}
        />
      ))}

      <MapController selectedSpot={selectedSpot} />
      <MapClickHandler onDeselect={onDeselectSpot} />
    </MapContainer>
  );
}
