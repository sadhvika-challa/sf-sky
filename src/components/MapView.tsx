import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import { useEffect, useMemo, useRef } from 'react';
import L, { type LatLngBoundsExpression } from 'leaflet';
import { type Spot } from '../data/spots';
import { type UserLocation } from '../hooks/useGeolocation';
import { type LiveScoresMap } from '../hooks/useLiveScores';
import { getKarlComment } from '../utils/karl-copy';
import { getScoreTier, type ScoreTier, type ScoreType } from '../utils/scoring';
import { getUpcomingEventTimes } from '../utils/events';
import type { AppMode, Filters } from '../App';
import SpotMarker from './SpotMarker';
import ClusterMarker from './ClusterMarker';
import { isClusterFeature, useSupercluster } from '../hooks/useSupercluster';
import WeatherLayer from './WeatherLayer';
import type { WeatherMetric } from '../utils/interpolate';
import type { SpotForecast } from '../utils/weather';

const isCoarsePointer =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: none)').matches;

const SF_CENTER: [number, number] = [37.7649, -122.4494];
const ATX_CENTER: [number, number] = [30.30, -97.78];

const PAN_PADDING_DEG = 0.15;

function boundsFromSpots(spotList: ReadonlyArray<Spot>): LatLngBoundsExpression {
  if (spotList.length === 0) {
    return [[37.6, -122.6], [37.9, -122.3]];
  }
  const lats = spotList.map((s) => s.lat);
  const lngs = spotList.map((s) => s.lng);
  const south = Math.min(...lats) - PAN_PADDING_DEG;
  const north = Math.max(...lats) + PAN_PADDING_DEG;
  const west = Math.min(...lngs) - PAN_PADDING_DEG;
  const east = Math.max(...lngs) + PAN_PADDING_DEG;
  return [[south, west], [north, east]];
}

// Weather mode keeps the user inside the heatmap area. Numbers outside SF
// would float over an empty basemap with no gradient, which looked broken.
// Tight bounds + a higher minZoom together prevent that.
const WEATHER_BOUNDS: LatLngBoundsExpression = [
  [37.685, -122.530],
  [37.835, -122.350],
];
const WEATHER_MIN_ZOOM = 12;

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

/** Screen position in CSS pixels relative to the map container. */
export interface MapPoint {
  x: number;
  y: number;
}

interface MapViewProps {
  spots: ReadonlyArray<Spot>;
  selectedSpot: Spot | null;
  /** Spot the user just dismissed; map will pan to it and pulse its pin. */
  highlightedSpot: Spot | null;
  onSelectSpot: (spot: Spot) => void;
  onDeselectSpot: () => void;
  userLocation: UserLocation | null;
  filters: Filters;
  liveScores: LiveScoresMap;
  appMode: AppMode;
  weatherMetric: WeatherMetric;
  weatherHourKey: string;
  weatherForecasts: Map<number, SpotForecast>;
  /**
   * When true, MapView picks the visible pin closest to the map's
   * working center and reports its screen position via
   * `onTapSpotAnchorChange`. App.tsx uses that point to render the
   * tap-spot onboarding hint right below the chosen pin so the arrow
   * has a real target instead of pointing at empty space.
   */
  tapSpotHintActive?: boolean;
  onTapSpotAnchorChange?: (point: MapPoint | null) => void;
}

/**
 * MapContainer reads `maxBounds`/`minZoom` only at mount, so when the user
 * toggles between Explore and Weather we have to push the new constraints
 * onto the map instance ourselves and clamp the view back inside the new
 * bounds. Otherwise the user could be stranded zoomed-out over the bay.
 */
function ModeBoundsController({
  appMode,
  exploreBounds,
  center,
}: {
  appMode: AppMode;
  exploreBounds: LatLngBoundsExpression;
  center: [number, number];
}) {
  const map = useMap();
  const prevCenterRef = useRef(center);

  useEffect(() => {
    if (appMode === 'weather') {
      map.setMinZoom(WEATHER_MIN_ZOOM);
      map.setMaxBounds(WEATHER_BOUNDS as L.LatLngBoundsLiteral);
      if (map.getZoom() < WEATHER_MIN_ZOOM) {
        map.setZoom(WEATHER_MIN_ZOOM);
      }
      const bounds = L.latLngBounds(WEATHER_BOUNDS as L.LatLngBoundsLiteral);
      if (!bounds.contains(map.getCenter())) {
        map.panInside(bounds.getCenter(), { animate: false });
      }
    } else {
      map.setMinZoom(9);
      map.setMaxBounds(exploreBounds as L.LatLngBoundsLiteral);
      // If the city changed (center moved), fly to the new city.
      if (
        prevCenterRef.current[0] !== center[0] ||
        prevCenterRef.current[1] !== center[1]
      ) {
        map.flyTo(center, 11, { duration: 0.6 });
      }
      prevCenterRef.current = center;
    }
  }, [appMode, map, exploreBounds, center]);
  return null;
}

/**
 * Picks the visible pin closest to the working center of the map and
 * reports its screen position to the parent so the tap-spot onboarding
 * hint can anchor itself directly under a real pin.
 *
 * Why a helper component (vs. computing in App.tsx): we need
 * `useMap()` and the leaflet `move`/`zoom` event stream to keep the
 * point in sync as the user pans/zooms while the hint is visible. The
 * choice of pin is locked in once on activation so the hint doesn't
 * jitter between candidates as the map moves; we just track the
 * locked pin's coords from then on.
 */
function TapSpotAnchorTracker({
  active,
  onAnchor,
  spots: spotList,
}: {
  active: boolean;
  onAnchor: ((point: MapPoint | null) => void) | undefined;
  spots: ReadonlyArray<Spot>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!active || !onAnchor) {
      onAnchor?.(null);
      return;
    }

    let lockedLatLng: L.LatLng | null = null;

    function pickAnchor(): L.LatLng | null {
      const size = map.getSize();
      const targetX = size.x / 2;
      const targetY = size.y * 0.42;
      const sideMargin = 56;
      const topMargin = 110;
      const bottomMargin = 160;

      let best: { dist: number; latLng: L.LatLng } | null = null;
      for (const spot of spotList) {
        const p = map.latLngToContainerPoint([spot.lat, spot.lng]);
        if (p.x < sideMargin || p.x > size.x - sideMargin) continue;
        if (p.y < topMargin || p.y > size.y - bottomMargin) continue;
        const dist = Math.hypot(p.x - targetX, p.y - targetY);
        if (!best || dist < best.dist) {
          best = { dist, latLng: L.latLng(spot.lat, spot.lng) };
        }
      }
      return best?.latLng ?? null;
    }

    function reportLocked() {
      if (!lockedLatLng) return;
      const p = map.latLngToContainerPoint(lockedLatLng);
      onAnchor?.({ x: p.x, y: p.y });
    }

    lockedLatLng = pickAnchor();
    if (lockedLatLng) {
      reportLocked();
    } else {
      const size = map.getSize();
      onAnchor({ x: size.x / 2, y: size.y * 0.42 });
    }

    map.on('move zoom moveend zoomend resize', reportLocked);
    return () => {
      map.off('move zoom moveend zoomend resize', reportLocked);
    };
  }, [map, active, onAnchor, spotList]);

  return null;
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
 * Pans the map to a spot the user just dismissed so they can see where the
 * pin is, now that the score panel isn't covering the lower half. Unlike
 * `MapController`, this aims for the true viewport center (no panel offset)
 * and runs once per highlight — the highlight then auto-clears upstream.
 */
function HighlightController({ highlightedSpot }: { highlightedSpot: Spot | null }) {
  const map = useMap();

  useEffect(() => {
    if (!highlightedSpot) return;
    map.panTo([highlightedSpot.lat, highlightedSpot.lng], {
      animate: true,
      duration: 0.5,
    });
  }, [highlightedSpot, map]);

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

function getMarkerQuip(spot: Spot, liveScores: LiveScoresMap): string | undefined {
  const entry = liveScores.get(spot.id);
  if (!entry || !entry.isLive) return undefined;
  const best = Math.max(entry.sunrise, entry.sunset, entry.stargazing);
  if (best >= 30) return undefined;
  let bestType: ScoreType = 'sunset';
  if (entry.sunrise >= entry.sunset && entry.sunrise >= entry.stargazing) bestType = 'sunrise';
  else if (entry.stargazing > entry.sunset) bestType = 'stargazing';
  return getKarlComment(best, bestType, spot.id, undefined, spot.city);
}

// Tier-bucket filter. An empty (or full) selection for an event means "no
// constraint" — the user is opting out of filtering that event rather than
// asking for an empty result set. Otherwise the spot's live tier for that
// event must be in the selected bucket.
function tierAllows(score: number, allowed: ScoreTier[]): boolean {
  if (allowed.length === 0 || allowed.length === 3) return true;
  return allowed.includes(getScoreTier(score));
}

function passesFilter(spot: Spot, filters: Filters, liveScores: LiveScoresMap): boolean {
  const scores = liveScores.get(spot.id);
  const sunrise = scores?.sunrise ?? spot.sunrise;
  const sunset = scores?.sunset ?? spot.sunset;
  const stargazing = scores?.stargazing ?? spot.stargazing;
  return (
    tierAllows(sunrise, filters.sunrise) &&
    tierAllows(sunset, filters.sunset) &&
    tierAllows(stargazing, filters.stargazing)
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

/**
 * Cluster + render the visible spot pins. Lives inside the MapContainer so
 * `useSupercluster` (which wraps `useMap`) has the map instance available.
 */
interface SpotClusterLayerProps {
  spots: ReadonlyArray<Spot>;
  selectedSpot: Spot | null;
  highlightedSpotId: string | null;
  onSelectSpot: (spot: Spot) => void;
  filters: Filters;
  liveScores: LiveScoresMap;
}

interface ClusterPayload {
  spot: Spot;
  score: number;
  quip: string | undefined;
}

function SpotClusterLayer({
  spots: spotList,
  selectedSpot,
  highlightedSpotId,
  onSelectSpot,
  filters,
  liveScores,
}: SpotClusterLayerProps) {
  const map = useMap();

  const points = useMemo(() => {
    return spotList
      .filter((s) => passesFilter(s, filters, liveScores))
      .map((spot) => ({
        id: spot.id,
        lat: spot.lat,
        lng: spot.lng,
        payload: {
          spot,
          score: getNextEventScore(spot, liveScores),
          quip: getMarkerQuip(spot, liveScores),
        } satisfies ClusterPayload,
      }));
  }, [spotList, filters, liveScores]);

  const { clusters, supercluster } = useSupercluster<ClusterPayload>({
    points,
    // Cluster up through z14; from z15+ everything renders individually so
    // street-level browsing always shows real pins. Map maxZoom is 17.
    maxClusterZoom: 14,
    radius: 60,
  });

  return (
    <>
      {clusters.map((feature) => {
        const [lng, lat] = feature.geometry.coordinates as [number, number];

        if (isClusterFeature(feature)) {
          const clusterId = feature.properties.cluster_id as number;
          const count = feature.properties.point_count as number;

          // Color the cluster by the *best* score it contains — never an
          // average. A single low-scoring outlier shouldn't drag a cluster
          // full of great spots down into the "meh" color, and a single
          // hidden gem inside a dense neighborhood should still read as
          // "worth tapping". We pull every leaf (no cap) so the max is
          // truly the max even on big citywide clusters.
          let bestScore = 0;
          if (supercluster) {
            const leaves = supercluster.getLeaves(clusterId, Infinity) as Array<{
              properties: { payload: ClusterPayload };
            }>;
            for (const leaf of leaves) {
              if (leaf.properties.payload.score > bestScore) {
                bestScore = leaf.properties.payload.score;
              }
            }
          }

          return (
            <ClusterMarker
              key={`cluster-${clusterId}`}
              position={[lat, lng]}
              count={count}
              bestScore={bestScore}
              onClick={() => {
                if (!supercluster) return;
                const expansionZoom = Math.min(
                  supercluster.getClusterExpansionZoom(clusterId),
                  map.getMaxZoom(),
                );
                map.flyTo([lat, lng], expansionZoom, { duration: 0.4 });
              }}
            />
          );
        }

        const { payload } = feature.properties;
        return (
          <SpotMarker
            key={payload.spot.id}
            spot={payload.spot}
            score={payload.score}
            isActive={selectedSpot?.id === payload.spot.id}
            isHighlighted={highlightedSpotId === payload.spot.id}
            onClick={onSelectSpot}
            quip={payload.quip}
          />
        );
      })}
    </>
  );
}

export default function MapView({
  spots: spotList,
  selectedSpot,
  highlightedSpot,
  onSelectSpot,
  onDeselectSpot,
  userLocation,
  filters,
  liveScores,
  appMode,
  weatherMetric,
  weatherHourKey,
  weatherForecasts,
  tapSpotHintActive,
  onTapSpotAnchorChange,
}: MapViewProps) {
  const tileUrl =
    appMode === 'weather'
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  const exploreBounds = useMemo(() => boundsFromSpots(spotList), [spotList]);
  const city = spotList.length > 0 ? spotList[0].city : 'sf';
  const center: [number, number] = city === 'austin' ? ATX_CENTER : SF_CENTER;

  const isWeather = appMode === 'weather';
  return (
    <MapContainer
      center={center}
      zoom={12.5}
      zoomSnap={0.5}
      maxBounds={isWeather ? WEATHER_BOUNDS : exploreBounds}
      maxBoundsViscosity={isWeather ? 1 : 0.8}
      minZoom={isWeather ? WEATHER_MIN_ZOOM : 9}
      maxZoom={17}
      zoomControl={false}
      className="w-full h-full"
      attributionControl={false}
      preferCanvas
    >
      <TileLayer
        key={tileUrl}
        url={tileUrl}
        subdomains={['a', 'b', 'c', 'd']}
        detectRetina
        keepBuffer={4}
        updateWhenZooming={false}
        updateWhenIdle
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

      <ModeBoundsController appMode={appMode} exploreBounds={exploreBounds} center={center} />

      {appMode === 'explore' ? (
        <>
          <SpotClusterLayer
            spots={spotList}
            selectedSpot={selectedSpot}
            highlightedSpotId={highlightedSpot?.id ?? null}
            onSelectSpot={onSelectSpot}
            filters={filters}
            liveScores={liveScores}
          />
          <MapController selectedSpot={selectedSpot} />
          <HighlightController highlightedSpot={highlightedSpot} />
          <MapClickHandler onDeselect={onDeselectSpot} />
          <TapSpotAnchorTracker
            active={!!tapSpotHintActive}
            onAnchor={onTapSpotAnchorChange}
            spots={spotList}
          />
        </>
      ) : (
        <WeatherLayer
          metric={weatherMetric}
          hourKey={weatherHourKey}
          forecasts={weatherForecasts}
        />
      )}
    </MapContainer>
  );
}
