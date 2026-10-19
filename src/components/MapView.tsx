import { passesSpotFilter } from '../utils/spotFilters';
import { MapContainer, Marker, Tooltip, useMap } from 'react-leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L, { type LatLngBoundsExpression } from 'leaflet';
import { type City, type Spot } from '../data/spots';
import { type CuratedEvent, getEventsAtHour } from '../data/events';
import { type CityConfig } from '../data/cities';
import { type UserLocation } from '../hooks/useGeolocation';
import { type LiveScoresMap } from '../hooks/useLiveScores';
import { getKarlComment } from '../utils/karl-copy';
import { type ScoreType } from '../utils/scoring';
import type { Filters } from '../App';
import SpotMarker from './SpotMarker';
import EventMarker from './EventMarker';
import ClusterMarker from './ClusterMarker';
import { isClusterFeature, useSupercluster } from '../hooks/useSupercluster';
import WeatherLayer from './WeatherLayer';
import WindParticleLayer from './WindParticleLayer';
import type { WeatherMetric } from '../utils/interpolate';
import type { SpotForecast } from '../utils/weather';
import { parseCanonicalHourKey } from '../utils/timeline';
import type { ScoreEvidence } from '../utils/confidence';
import { buildSamples, buildWindDirs, hasSpatialSupport } from '../utils/weatherSamples';
import { OVERLAY_USABLE_ANCHORS } from '../hooks/useNeighborhoodForecasts';
import OpenFreeMapLayer, {
  MAP_BACKGROUND_RESTORED_NOTICE_MS,
  MapBackgroundStatus,
  type MapBackgroundNoticeState,
} from './OpenFreeMapLayer';

const isCoarsePointer =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: none)').matches;

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

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface MapViewProps {
  spots: ReadonlyArray<Spot>;
  selectedSpot: Spot | null;
  spotClosing: boolean;
  onSpotCentered: (spotId: string) => void;
  highlightedSpot: Spot | null;
  onSelectSpot: (spot: Spot) => void;
  onSelectEvent: (event: CuratedEvent) => void;
  onDeselectSpot: () => void;
  userLocation: UserLocation | null;
  filters: Filters;
  liveScores: LiveScoresMap;
  weatherOverlay: boolean;
  cityConfig: CityConfig;
  weatherMetric: WeatherMetric;
  weatherHourKey: string;
  weatherForecasts: Map<number, SpotForecast>;
  tapSpotHintActive?: boolean;
  onTapSpotAnchorChange?: (point: MapPoint | null) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
}

function BoundsReporter({ onChange }: { onChange?: (b: MapBounds) => void }) {
  const map = useMap();
  const cbRef = useRef(onChange);

  useEffect(() => {
    cbRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!cbRef.current) return;
    const report = () => {
      const b = map.getBounds();
      cbRef.current?.({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    };
    report();
    map.on('moveend', report);
    return () => { map.off('moveend', report); };
  }, [map]);

  return null;
}

/**
 * MapContainer reads `maxBounds`/`minZoom` only at mount, so when the user
 * toggles between Explore and Weather we have to push the new constraints
 * onto the map instance ourselves and clamp the view back inside the new
 * bounds. Otherwise the user could be stranded zoomed-out over the bay.
 */
function ModeBoundsController({
  isWeather,
  exploreBounds,
  center,
  defaultZoom,
}: {
  isWeather: boolean;
  exploreBounds: LatLngBoundsExpression;
  center: [number, number];
  defaultZoom: number;
}) {
  const map = useMap();
  const prevCenterRef = useRef(center);

  useEffect(() => {
    if (isWeather) {
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
      if (
        prevCenterRef.current[0] !== center[0] ||
        prevCenterRef.current[1] !== center[1]
      ) {
        const distance = Math.hypot(
          center[0] - prevCenterRef.current[0],
          center[1] - prevCenterRef.current[1],
        );
        const duration = distance > 2 ? 1.2 : 0.6;
        map.flyTo(center, defaultZoom, { duration });
      }
      prevCenterRef.current = center;
    }
  }, [isWeather, map, exploreBounds, center, defaultZoom]);
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

/** Center once per selection, then let the card open over a stationary map. */
function MapController({ selectedSpot, closing, onCentered }: {
  selectedSpot: Spot | null;
  closing: boolean;
  onCentered: (spotId: string) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedSpot || closing) return;
    const sheet = document.querySelector<HTMLElement>('.score-panel-sheet');
    const size = map.getSize();
    const edgePad = 60;
    const panelTop = size.y - (sheet?.offsetHeight ?? size.y * 0.4) - 22;
    const targetPx = L.point(size.x / 2, Math.max(edgePad, (edgePad + panelTop) / 2));
    const pinPx = map.latLngToContainerPoint([selectedSpot.lat, selectedSpot.lng]);
    if (pinPx.distanceTo(targetPx) < 1) {
      onCentered(selectedSpot.id);
      return;
    }
    const pinLatLng = map.project([selectedSpot.lat, selectedSpot.lng], map.getZoom());
    const desiredCenter = L.point(
      pinLatLng.x + (size.x / 2 - targetPx.x),
      pinLatLng.y + (size.y / 2 - targetPx.y),
    );
    map.stop();
    const finish = () => onCentered(selectedSpot.id);
    map.once('moveend', finish);
    map.panTo(map.unproject(desiredCenter, map.getZoom()), {
      animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      duration: 0.35,
    });
    return () => {
      map.off('moveend', finish);
      map.stop();
    };
  }, [selectedSpot, closing, map, onCentered]);

  return null;
}

function getMarkerQuip(spot: Spot, liveScores: LiveScoresMap): string | undefined {
  const entry = liveScores.get(spot.id);
  if (entry?.activeEvidence.sky) return entry.activeEvidence.sky.label;
  if (!entry || !entry.isLive) return undefined;
  const best = Math.max(entry.sunrise, entry.sunset, entry.stargazing);
  if (best >= 30) return undefined;
  let bestType: ScoreType = 'sunset';
  if (entry.sunrise >= entry.sunset && entry.sunrise >= entry.stargazing) bestType = 'sunrise';
  else if (entry.stargazing > entry.sunset) bestType = 'stargazing';
  return getKarlComment(best, bestType, spot.id, undefined, spot.city);
}



/**
 * Pin label score for the exact active timeline hour and resolved mode.
 * Missing spot forecasts stay unavailable until that spot's data arrives.
 */
function getViewModeScore(spot: Spot, liveScores: LiveScoresMap): number {
  const live = liveScores.get(spot.id);
  if (live) return live.active;
  return NaN;
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
  evidence: ScoreEvidence | null;
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
      .filter((s) => s.id !== selectedSpot?.id && passesSpotFilter(s, filters, liveScores))
      .map((spot) => ({
        id: spot.id,
        lat: spot.lat,
        lng: spot.lng,
        payload: {
          spot,
          score: getViewModeScore(spot, liveScores),
          evidence: liveScores.get(spot.id)?.activeEvidence ?? null,
          quip: getMarkerQuip(spot, liveScores),
        } satisfies ClusterPayload,
      }));
  }, [spotList, filters, liveScores, selectedSpot]);

  const { clusters, supercluster } = useSupercluster<ClusterPayload>({
    points,
    // Cluster up through z14; from z15+ everything renders individually so
    // street-level browsing always shows real pins. Map maxZoom is 17.
    maxClusterZoom: 14,
    radius: 60,
  });

  return (
    <>
      {selectedSpot && <SpotMarker
        spot={selectedSpot}
        score={getViewModeScore(selectedSpot, liveScores)}
        evidence={liveScores.get(selectedSpot.id)?.activeEvidence ?? null}
        isActive
        onClick={onSelectSpot}
        quip={getMarkerQuip(selectedSpot, liveScores)}
      />}
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
          let bestScore = NaN;
          if (supercluster) {
            const leaves = supercluster.getLeaves(clusterId, Infinity) as Array<{
              properties: { payload: ClusterPayload };
            }>;
            for (const leaf of leaves) {
              if (Number.isFinite(leaf.properties.payload.score) &&
                (!Number.isFinite(bestScore) || leaf.properties.payload.score > bestScore)) {
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
            evidence={payload.evidence}
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

/**
 * Renders the curated-event pins for the scrubbed timeline hour. Unlike spots,
 * events never participate in supercluster — there are only a handful and each
 * one is an editorial pick, so they always render individually at every zoom
 * level. Events are gated to the selected hour via `getEventsAtHour`, so
 * hour-scoped pins (e.g. July 4 fireworks at 21:00–22:30) surface only at
 * their window.
 */
function EventMarkerLayer({
  hourKey,
  city,
  onSelectEvent,
}: {
  /** Scrubbed timeline hour as a canonical UTC ISO key. */
  hourKey: string;
  city: City;
  onSelectEvent: (event: CuratedEvent) => void;
}) {
  const events = useMemo(() => {
    const at = hourKey ? (parseCanonicalHourKey(hourKey) ?? new Date()) : new Date();
    return getEventsAtHour(at, city);
  }, [city, hourKey]);

  if (events.length === 0) return null;

  return (
    <>
      {events.map((evt) => (
        <EventMarker
          key={evt.id}
          event={evt}
          isActive
          onClick={onSelectEvent}
        />
      ))}
    </>
  );
}

export default function MapView({
  spots: spotList,
  selectedSpot,
  spotClosing,
  onSpotCentered,
  highlightedSpot,
  onSelectSpot,
  onSelectEvent,
  onDeselectSpot,
  userLocation,
  filters,
  liveScores,
  weatherOverlay,
  cityConfig,
  weatherMetric,
  weatherHourKey,
  weatherForecasts,
  tapSpotHintActive,
  onTapSpotAnchorChange,
  onBoundsChange,
}: MapViewProps) {
  const isWeather = weatherOverlay;
  const [mapBackgroundState, setMapBackgroundState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [mapBackgroundAttempt, setMapBackgroundAttempt] = useState(0);
  const [recoveryPhase, setRecoveryPhase] = useState<'idle' | 'retrying' | 'restored'>('idle');
  const mapFrameRef = useRef<HTMLDivElement>(null);
  const recoveryPhaseRef = useRef<'idle' | 'retrying' | 'restored'>('idle');
  const restoredTimerRef = useRef<number | null>(null);

  const clearRestoredTimer = useCallback(() => {
    if (restoredTimerRef.current === null) return;
    window.clearTimeout(restoredTimerRef.current);
    restoredTimerRef.current = null;
  }, []);

  useEffect(() => clearRestoredTimer, [clearRestoredTimer]);

  const handleMapBackgroundState = useCallback((state: 'loading' | 'ready' | 'unavailable') => {
    setMapBackgroundState(state);

    if (state === 'unavailable') {
      clearRestoredTimer();
      recoveryPhaseRef.current = 'idle';
      setRecoveryPhase('idle');
      return;
    }

    if (state === 'loading' && recoveryPhaseRef.current === 'restored') {
      clearRestoredTimer();
      recoveryPhaseRef.current = 'idle';
      setRecoveryPhase('idle');
      return;
    }

    if (state === 'ready' && recoveryPhaseRef.current === 'retrying') {
      recoveryPhaseRef.current = 'restored';
      setRecoveryPhase('restored');
      mapFrameRef.current
        ?.querySelector<HTMLElement>('.leaflet-container')
        ?.focus({ preventScroll: true });
      clearRestoredTimer();
      restoredTimerRef.current = window.setTimeout(() => {
        restoredTimerRef.current = null;
        recoveryPhaseRef.current = 'idle';
        setRecoveryPhase('idle');
      }, MAP_BACKGROUND_RESTORED_NOTICE_MS);
    }
  }, [clearRestoredTimer]);

  const retryMapBackground = useCallback(() => {
    clearRestoredTimer();
    recoveryPhaseRef.current = 'retrying';
    setRecoveryPhase('retrying');
    setMapBackgroundState('loading');
    setMapBackgroundAttempt((attempt) => attempt + 1);
  }, [clearRestoredTimer]);

  const exploreBounds = useMemo(() => boundsFromSpots(spotList), [spotList]);

  const windSamples = useMemo(
    () => {
      if (!isWeather || weatherMetric !== 'wind' || !weatherHourKey) return new Map();
      const samples = buildSamples('wind', weatherHourKey, weatherForecasts);
      return samples.size >= OVERLAY_USABLE_ANCHORS && hasSpatialSupport(samples)
        ? samples
        : new Map();
    },
    [isWeather, weatherMetric, weatherHourKey, weatherForecasts],
  );
  const windDirMap = useMemo(
    () => windSamples.size >= OVERLAY_USABLE_ANCHORS
      ? buildWindDirs(weatherHourKey, weatherForecasts)
      : new Map(),
    [weatherHourKey, weatherForecasts, windSamples.size],
  );

  const center = cityConfig.center;
  return (
    <div
      ref={mapFrameRef}
      className={`map-view relative h-full w-full${isWeather ? ' is-weather' : ''}`}
    >
      <MapContainer
        center={center}
        zoom={cityConfig.defaultZoom}
        zoomSnap={0.5}
        maxBounds={isWeather ? WEATHER_BOUNDS : exploreBounds}
        maxBoundsViscosity={isWeather ? 1 : 0.8}
        minZoom={isWeather ? WEATHER_MIN_ZOOM : 9}
        maxZoom={17}
        zoomControl={false}
        className="w-full h-full"
        aria-label="Soleil sky map"
        attributionControl
        preferCanvas
      >
        <OpenFreeMapLayer
          weatherMode={isWeather}
          attempt={mapBackgroundAttempt}
          onStateChange={handleMapBackgroundState}
        />

        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={userIcon}
            zIndexOffset={500}
            title={userLocation.precision === 'approximate'
              ? 'Your approximate location'
              : 'Your location'}
            alt={userLocation.precision === 'approximate'
              ? 'Your approximate location'
              : 'Your location'}
          >
            {!isCoarsePointer && (
              <Tooltip direction="top" offset={[0, -10]} className="spot-tooltip" opacity={1} interactive={false}>
                {userLocation.precision === 'approximate'
                  ? 'Your approximate location'
                  : 'You are here'}
              </Tooltip>
            )}
          </Marker>
        )}

        <ModeBoundsController isWeather={isWeather} exploreBounds={exploreBounds} center={center} defaultZoom={cityConfig.defaultZoom} />
        <BoundsReporter onChange={onBoundsChange} />

        {isWeather && (
          <WeatherLayer
            metric={weatherMetric}
            hourKey={weatherHourKey}
            forecasts={weatherForecasts}
          />
        )}

        {isWeather && weatherMetric === 'wind' && windSamples.size > 0 && (
          <WindParticleLayer samples={windSamples} windDirs={windDirMap} />
        )}

        <SpotClusterLayer
          spots={spotList}
          selectedSpot={selectedSpot}
          highlightedSpotId={highlightedSpot?.id ?? null}
          onSelectSpot={onSelectSpot}
          filters={filters}
          liveScores={liveScores}
        />
        {/* Curated events surface only in Explore mode. They never appear over
            the weather heatmap, where the violet diamonds would compete with
            the gradient. */}
        {!isWeather && (
          <EventMarkerLayer
            hourKey={weatherHourKey}
            city={cityConfig.id}
            onSelectEvent={onSelectEvent}
          />
        )}
        <MapController selectedSpot={selectedSpot} closing={spotClosing} onCentered={onSpotCentered} />
        <MapClickHandler onDeselect={onDeselectSpot} />
        <TapSpotAnchorTracker
          active={!!tapSpotHintActive}
          onAnchor={onTapSpotAnchorChange}
          spots={spotList}
        />
      </MapContainer>

      {(() => {
        const noticeState: MapBackgroundNoticeState | null = recoveryPhase === 'retrying'
          ? 'retrying'
          : recoveryPhase === 'restored'
            ? 'restored'
            : mapBackgroundState === 'unavailable'
              ? 'unavailable'
              : null;
        return noticeState ? (
          <MapBackgroundStatus
            state={noticeState}
            onRetry={noticeState === 'unavailable' ? retryMapBackground : undefined}
          />
        ) : null;
      })()}
    </div>
  );
}
