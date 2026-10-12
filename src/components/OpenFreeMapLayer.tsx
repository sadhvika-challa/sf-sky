/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { StyleSpecification } from 'maplibre-gl';
import '@maplibre/maplibre-gl-leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';

export const OPEN_FREE_MAP_STYLES = {
  explore: 'https://tiles.openfreemap.org/styles/positron',
  weather: 'https://tiles.openfreemap.org/styles/positron',
} as const;

export const MAP_BACKGROUND_ATTEMPT_TIMEOUT_MS = 12_000;
export const MAP_BACKGROUND_ERROR_THRESHOLD = 3;
export const MAP_BACKGROUND_RESTORED_NOTICE_MS = 3_000;

const MAP_ATTRIBUTION = [
  '<a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a>',
  '<a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a>',
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
].join(' ');

type MapBackgroundState = 'loading' | 'ready' | 'unavailable';

interface OpenFreeMapLayerProps {
  weatherMode: boolean;
  attempt: number;
  onStateChange: (state: MapBackgroundState) => void;
}

export type MapBackgroundNoticeState = 'unavailable' | 'retrying' | 'restored';

interface MapBackgroundStatusProps {
  state: MapBackgroundNoticeState;
  onRetry?: () => void;
}

const EXPLORE_PAINT: Record<string, Record<string, string>> = {
  background: { 'background-color': '#F7F9F8' },
  water: { 'fill-color': '#A6D8F4' },
  waterway: { 'line-color': '#A6D8F4' },
  park: { 'fill-color': '#D2E8CF' },
  landcover_wood: { 'fill-color': '#C4DEC1' },
  landuse_residential: { 'fill-color': '#EDF1EE' },
  building: { 'fill-color': '#E8ECE9', 'fill-outline-color': '#DBE2DD' },
  highway_minor: { 'line-color': '#FFFFFF' },
  highway_path: { 'line-color': '#DDE5DC' },
  'water_name_point_label': { 'text-color': '#4F8CAE' },
  'water_name_line_label': { 'text-color': '#4F8CAE' },
};

/** Keep the provider's geography, scale rules, and label placement. */
export function prepareOpenFreeMapStyle(
  style: StyleSpecification,
  weatherMode: boolean,
): StyleSpecification {
  return {
    ...style,
    layers: weatherMode
      ? style.layers.filter((layer) => layer.type !== 'symbol')
      : style.layers.map((layer) => EXPLORE_PAINT[layer.id]
        ? { ...layer, paint: { ...layer.paint, ...EXPLORE_PAINT[layer.id] } } as typeof layer
        : layer),
  };
}

export function MapBackgroundStatus({ state, onRetry }: MapBackgroundStatusProps) {
  const actionRef = useRef<HTMLButtonElement>(null);
  const message = state === 'unavailable'
    ? 'Map background unavailable. Spot details still work, and weather will appear when its data loads.'
    : state === 'retrying'
      ? 'Retrying map background.'
      : 'Map background restored.';

  useEffect(() => {
    if (state === 'retrying') actionRef.current?.focus({ preventScroll: true });
  }, [state]);

  const notice = (
    <aside
      className="map-background-status"
      data-state={state}
      aria-labelledby="map-background-status-title"
    >
      <p
        id="map-background-status-title"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
      </p>
      {state !== 'restored' && (
        <button
          ref={actionRef}
          type="button"
          onClick={state === 'unavailable' ? onRetry : undefined}
          aria-disabled={state === 'retrying'}
        >
          {state === 'unavailable' ? 'Retry map background' : 'Retrying map background'}
        </button>
      )}
    </aside>
  );
  return typeof document === 'undefined' ? notice : createPortal(notice, document.body);
}

/**
 * Hosts OpenFreeMap's vector style inside the official MapLibre-to-Leaflet
 * binding. Leaflet remains the interaction owner, so the existing markers,
 * clustering, bounds, overlays, gestures, and sheet coordination are kept.
 */
export default function OpenFreeMapLayer({
  weatherMode,
  attempt,
  onStateChange,
}: OpenFreeMapLayerProps) {
  const map = useMap();
  const stateCallbackRef = useRef(onStateChange);

  useEffect(() => {
    stateCallbackRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    let cancelled = false;
    let failed = false;
    let errorCount = 0;
    let layer: L.MaplibreGL | null = null;
    let maplibreMap: ReturnType<L.MaplibreGL['getMaplibreMap']> | null = null;
    const abortController = new AbortController();

    stateCallbackRef.current('loading');

    const failAttempt = () => {
      if (cancelled || failed) return;
      failed = true;
      stateCallbackRef.current('unavailable');
    };

    const handleMapError = () => {
      errorCount += 1;
      if (errorCount >= MAP_BACKGROUND_ERROR_THRESHOLD) failAttempt();
    };

    const handleMapIdle = () => {
      errorCount = 0;
      window.clearTimeout(timeoutId);
      if (!cancelled && !failed) stateCallbackRef.current('ready');
    };

    const timeoutId = window.setTimeout(() => {
      abortController.abort();
      failAttempt();
    }, MAP_BACKGROUND_ATTEMPT_TIMEOUT_MS);

    const load = async () => {
      try {
        const styleUrl = weatherMode
          ? OPEN_FREE_MAP_STYLES.weather
          : OPEN_FREE_MAP_STYLES.explore;
        const response = await fetch(styleUrl, {
          signal: abortController.signal,
          cache: attempt > 0 ? 'reload' : 'default',
        });
        if (!response.ok) throw new Error(`OpenFreeMap style returned ${response.status}`);

        const style = await response.json() as StyleSpecification;
        if (!style || !Array.isArray(style.layers) || !style.sources) {
          throw new Error('OpenFreeMap style was not valid');
        }
        if (cancelled) return;

        const attributionControl = {
          customAttribution: MAP_ATTRIBUTION,
        } as unknown as NonNullable<L.LeafletMaplibreGLOptions['attributionControl']>;

        layer = L.maplibreGL({
          style: prepareOpenFreeMapStyle(style, weatherMode),
          interactive: false,
          attributionControl,
          maxZoom: 17,
        });
        layer.addTo(map);
        maplibreMap = layer.getMaplibreMap();

        maplibreMap.on('error', handleMapError);
        maplibreMap.on('idle', handleMapIdle);
      } catch {
        failAttempt();
      }
    };

    void load();

    return () => {
      cancelled = true;
      abortController.abort();
      window.clearTimeout(timeoutId);
      maplibreMap?.off('error', handleMapError);
      maplibreMap?.off('idle', handleMapIdle);
      if (layer && map.hasLayer(layer)) layer.removeFrom(map);
    };
  }, [attempt, map, weatherMode]);

  return null;
}
