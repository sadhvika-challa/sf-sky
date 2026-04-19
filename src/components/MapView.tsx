import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L, { type LatLngBoundsExpression } from 'leaflet';
import { type Spot, spots } from '../data/spots';
import { type UserLocation } from '../hooks/useGeolocation';
import { type LiveScoresMap } from '../hooks/useLiveScores';
import { getKarlComment } from '../utils/karl-copy';
import type { ScoreType } from '../utils/scoring';
import { getUpcomingEventTimes } from '../utils/events';
import type { Filters } from '../App';
import SpotMarker from './SpotMarker';

const isCoarsePointer =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: none)').matches;

const SF_CENTER: [number, number] = [37.7649, -122.4494];

/**
 * Pannable area derived from the actual spot list with ~0.15° of padding on
 * each side. Hard-coding a tight SF box used to make regional spots like
 * Mt Diablo, Pt Reyes, and Pigeon Point unreachable on touch — the
 * rubber-band from `maxBoundsViscosity` felt like a wall on mobile. Computing
 * from data keeps this honest as the dataset grows.
 */
const PAN_PADDING_DEG = 0.15;
const SF_BOUNDS: LatLngBoundsExpression = (() => {
  const lats = spots.map((s) => s.lat);
  const lngs = spots.map((s) => s.lng);
  const south = Math.min(...lats) - PAN_PADDING_DEG;
  const north = Math.max(...lats) + PAN_PADDING_DEG;
  const west = Math.min(...lngs) - PAN_PADDING_DEG;
  const east = Math.max(...lngs) + PAN_PADDING_DEG;
  return [
    [south, west],
    [north, east],
  ];
})();

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

/**
 * On first mount, frame the map so every spot pin is visible. Skipped when a
 * spot is already selected (e.g. deep-link via ?spot=) so we don't fight the
 * pan-into-view in MapController.
 */
function FitAllSpots({ hasSelectedSpot }: { hasSelectedSpot: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (hasSelectedSpot) return;
    if (spots.length === 0) return;
    const bounds = L.latLngBounds(spots.map((s) => [s.lat, s.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], animate: false });
  // Run once on mount; later state changes shouldn't re-frame the map.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function MapController({ selectedSpot }: { selectedSpot: Spot | null }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedSpot) return;
    // Soft repositioning: only pan (no zoom change, no flyTo) and only when
    // the pin is hidden by the score panel or close to the viewport edge.
    // Keeps the user's mental map intact when they tap a pin that's already
    // comfortably in view.
    const pinPx = map.latLngToContainerPoint([selectedSpot.lat, selectedSpot.lng]);
    const size = map.getSize();
    const edgePad = 60;
    // Score panel collapsed strip covers roughly the bottom ~120px. Treat
    // the lower 40% as "hidden" so a pin tapped low on the map slides up
    // into the visible band rather than disappearing under the sheet.
    const panelTop = size.y * 0.6;
    const inSafeZone =
      pinPx.x >= edgePad &&
      pinPx.x <= size.x - edgePad &&
      pinPx.y >= edgePad &&
      pinPx.y <= panelTop;
    if (inSafeZone) return;

    // Aim for ~30% from the top so the pin sits clearly above the panel.
    const targetPx = L.point(size.x / 2, size.y * 0.3);
    const pinLatLng = map.project([selectedSpot.lat, selectedSpot.lng], map.getZoom());
    const center = map.project(map.getCenter(), map.getZoom());
    const desiredCenter = L.point(
      pinLatLng.x + (center.x - targetPx.x),
      pinLatLng.y + (center.y - targetPx.y),
    );
    map.panTo(map.unproject(desiredCenter, map.getZoom()), { animate: true, duration: 0.4 });
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

/**
 * Pin label score — the score for whichever event is chronologically next at
 * this spot. Falls back to the spot's static score when live data hasn't
 * arrived yet so pins always render with a number.
 */
function getNextEventScore(spot: Spot, liveScores: LiveScoresMap): number {
  const events = getUpcomingEventTimes(spot);
  const order: ScoreType[] = (['sunrise', 'sunset', 'stargazing'] as ScoreType[])
    .filter((t) => !Number.isNaN(events[t].getTime()))
    .sort((a, b) => events[a].getTime() - events[b].getTime());
  const next = order[0] ?? 'sunset';
  const live = liveScores.get(spot.id);
  return live ? live[next] : spot[next];
}

export default function MapView({ selectedSpot, onSelectSpot, onDeselectSpot, userLocation, filters, liveScores }: MapViewProps) {
  const filteredSpots = spots.filter((s) => passesFilter(s, filters, liveScores));
  return (
    <MapContainer
      center={SF_CENTER}
      zoom={13}
      maxBounds={SF_BOUNDS}
      maxBoundsViscosity={0.8}
      minZoom={9}
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
          score={getNextEventScore(spot, liveScores)}
          isActive={selectedSpot?.id === spot.id}
          onClick={onSelectSpot}
          quip={getMarkerQuip(spot, liveScores)}
        />
      ))}

      <FitAllSpots hasSelectedSpot={selectedSpot !== null} />
      <MapController selectedSpot={selectedSpot} />
      <MapClickHandler onDeselect={onDeselectSpot} />
    </MapContainer>
  );
}
