import { useCallback, useEffect, useMemo, useState } from 'react';
import { neighborhoods, type Neighborhood } from '../data/neighborhoods';
import {
  fetchSpotForecast,
  WeatherRequestError,
  type SpotForecast,
  type WeatherRequestErrorKind,
} from '../utils/weather';
import { formatCanonicalHourKey } from '../utils/timeline';

export type NeighborhoodForecasts = Map<number, SpotForecast>;
export type NeighborhoodForecastPhase =
  | 'off' | 'loading' | 'partial' | 'ready' | 'refreshing' | 'saved' | 'unavailable';

export interface NeighborhoodForecastState {
  forecasts: NeighborhoodForecasts;
  hourKeys: string[];
  phase: NeighborhoodForecastPhase;
  loaded: number;
  total: number;
  errorKind: WeatherRequestErrorKind | null;
  retry: () => void;
}

const TOTAL = neighborhoods.length;
// One of the four coordinate lanes is always reserved for a selected spot.
// Overlay work therefore uses at most three lanes and can never starve the
// immediate selected-spot weather plus AQ job.
export const SELECTED_SPOT_CONCURRENCY = 1;
export const OVERLAY_CONCURRENCY = 3;
export const OVERLAY_USABLE_ANCHORS = 9;
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const FIRST_WAVE_IDS = [1, 3, 4, 6, 9, 16, 20, 22, 25];
const orderedNeighborhoods = [
  ...FIRST_WAVE_IDS.map((id) => neighborhoods.find((n) => n.id === id)!),
  ...neighborhoods.filter((n) => !FIRST_WAVE_IDS.includes(n.id)),
];

interface InternalState {
  forecasts: NeighborhoodForecasts;
  phase: NeighborhoodForecastPhase;
  errorKind: WeatherRequestErrorKind | null;
}

/** Current canonical hour plus the next 24 hours, without requiring a fetch. */
export function deriveLocalHourKeys(now = new Date()): string[] {
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  return Array.from({ length: 25 }, (_, index) =>
    formatCanonicalHourKey(new Date(start.getTime() + index * 3_600_000)),
  );
}

function classifyError(reason: unknown): WeatherRequestErrorKind {
  return reason instanceof WeatherRequestError ? reason.kind : 'network';
}

export function useNeighborhoodForecasts(
  enabled: boolean,
  timeZone: string,
  now = new Date(),
): NeighborhoodForecastState {
  const [state, setState] = useState<InternalState>({
    forecasts: new Map(), phase: 'off', errorKind: null,
  });
  const [generation, setGeneration] = useState(0);
  const retry = useCallback(() => setGeneration((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let nextIndex = 0;
    let failures = 0;
    let lastError: WeatherRequestErrorKind | null = null;
    const hadSavedForecasts = state.forecasts.size >= OVERLAY_USABLE_ANCHORS;
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setState((previous) => ({
        ...previous,
        phase: hadSavedForecasts ? 'refreshing' : 'loading',
        errorKind: null,
      }));
    });

    const loadNext = async () => {
      while (!controller.signal.aborted) {
        const index = nextIndex++;
        if (index >= orderedNeighborhoods.length) return;
        const neighborhood = orderedNeighborhoods[index];
        try {
          const forecast = await fetchSpotForecast(neighborhood.lat, neighborhood.lng, timeZone, {
            includeAirQuality: false,
            maxAgeMs: REFRESH_INTERVAL_MS,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setState((previous) => {
            const forecasts = new Map(previous.forecasts);
            forecasts.set(neighborhood.id, forecast);
            return {
              forecasts,
              phase: forecasts.size >= TOTAL
                ? 'ready'
                : forecasts.size >= OVERLAY_USABLE_ANCHORS ? 'partial' : previous.phase,
              errorKind: previous.errorKind,
            };
          });
        } catch (reason) {
          if (controller.signal.aborted) return;
          if (reason instanceof WeatherRequestError && reason.savedForecast) {
            setState((previous) => {
              const forecasts = new Map(previous.forecasts);
              forecasts.set(neighborhood.id, reason.savedForecast!);
              return { ...previous, forecasts };
            });
          }
          failures += 1;
          lastError = classifyError(reason);
        }
      }
    };

    void Promise.all(Array.from({ length: OVERLAY_CONCURRENCY }, loadNext)).then(() => {
      if (controller.signal.aborted) return;
      setState((previous) => {
        if (failures === 0 && previous.forecasts.size === TOTAL) {
          return { ...previous, phase: 'ready', errorKind: null };
        }
        if (hadSavedForecasts) return { ...previous, phase: 'saved', errorKind: lastError };
        if (previous.forecasts.size >= OVERLAY_USABLE_ANCHORS) {
          return { ...previous, phase: 'partial', errorKind: lastError };
        }
        return { ...previous, phase: 'unavailable', errorKind: lastError ?? 'network' };
      });
    });

    return () => controller.abort();
    // Forecast state is sampled once per generation. Including it would
    // restart the scheduler after every progressively loaded anchor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, generation, timeZone]);

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(retry, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, retry]);

  const hourKeys = useMemo(() => deriveLocalHourKeys(now), [now]);
  return {
    forecasts: state.forecasts,
    hourKeys,
    phase: enabled ? state.phase : 'off',
    loaded: state.forecasts.size,
    total: TOTAL,
    errorKind: state.errorKind,
    retry,
  };
}

export function getNeighborhoods(): ReadonlyArray<Neighborhood> {
  return neighborhoods;
}
