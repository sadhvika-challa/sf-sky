/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { StyleSpecification } from 'maplibre-gl';
import '@maplibre/maplibre-gl-leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';

export const OPEN_FREE_MAP_STYLES = {
  explore: 'https://tiles.openfreemap.org/styles/liberty',
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

/**
 * Weather uses OpenFreeMap's light Positron cartography without symbol
 * layers. Removing those layers before MapLibre receives the style prevents
 * labels from flashing through the weather colors during initial paint.
 */
export function prepareOpenFreeMapStyle(
  style: StyleSpecification,
  weatherMode: boolean,
): StyleSpecification {
  if (!weatherMode) return style;
  return {
    ...style,
    layers: style.layers.filter((layer) => layer.type !== 'symbol'),
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

  return (
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
