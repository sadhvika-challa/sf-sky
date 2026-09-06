import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { neighborhoods, type Neighborhood } from '../data/neighborhoods';
import {
  fetchSpotForecast,
  WeatherRequestError,
  type SpotForecast,
  type WeatherRequestErrorKind,
} from '../utils/weather';
import { formatCanonicalHourKey } from '../utils/timeline';
import { buildSamples, hasSpatialSupport, isUsableMetricHour } from '../utils/weatherSamples';
import type { WeatherMetric } from '../utils/interpolate';
import { nextWeatherRefreshAt, WEATHER_REFRESH_INTERVAL_MS } from '../utils/weatherRefresh';

export type NeighborhoodForecasts = Map<number, SpotForecast>;
export type NeighborhoodForecastPhase =
  | 'off' | 'loading' | 'progressive' | 'partial' | 'ready' | 'refreshing' | 'saved' | 'unavailable';

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
const FIRST_WAVE_IDS = [1, 3, 4, 6, 9, 16, 20, 22, 25];
const orderedNeighborhoods = [
  ...FIRST_WAVE_IDS.map((id) => neighborhoods.find((n) => n.id === id)!),
  ...neighborhoods.filter((n) => !FIRST_WAVE_IDS.includes(n.id)),
];

export function overlayRequestMaxAge(forceRefresh: boolean): number {
  return forceRefresh ? 0 : WEATHER_REFRESH_INTERVAL_MS;
}

interface InternalState {
  forecasts: NeighborhoodForecasts;
  loading: boolean;
  hadSavedAtStart: boolean;
  errorKind: WeatherRequestErrorKind | null;
  nextRefreshAt: number | null;
}

export interface OverlayCoverageRead {
  usable: number;
  spatiallySupported: boolean;
  phase: NeighborhoodForecastPhase;
  errorKind: WeatherRequestErrorKind | null;
}

export function deriveOverlayCoverage(
  forecasts: NeighborhoodForecasts,
  metric: WeatherMetric,
  hourKey: string,
  loading: boolean,
  hadSavedAtStart: boolean,
  requestError: WeatherRequestErrorKind | null,
): OverlayCoverageRead {
  const samples = buildSamples(metric, hourKey, forecasts);
  const usable = samples.size;
  const spatiallySupported = hasSpatialSupport(samples);
  if (loading) {
    if (hadSavedAtStart && usable >= OVERLAY_USABLE_ANCHORS && spatiallySupported) {
      return { usable, spatiallySupported, phase: 'refreshing', errorKind: null };
    }
    return {
      usable,
      spatiallySupported,
      phase: usable >= OVERLAY_USABLE_ANCHORS && spatiallySupported ? 'progressive' : 'loading',
      errorKind: null,
    };
  }
  if (usable === TOTAL && spatiallySupported && requestError === null) {
    return { usable, spatiallySupported, phase: 'ready', errorKind: null };
  }
  const errorKind = requestError ?? 'invalid-data';
  if (usable >= OVERLAY_USABLE_ANCHORS && spatiallySupported) {
    return {
      usable,
      spatiallySupported,
      phase: hadSavedAtStart && requestError ? 'saved' : 'partial',
      errorKind,
    };
  }
  return { usable, spatiallySupported, phase: 'unavailable', errorKind };
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
  metric: WeatherMetric,
  hourKey: string,
  now = new Date(),
): NeighborhoodForecastState {
  const [state, setState] = useState<InternalState>({
    forecasts: new Map(), loading: false, hadSavedAtStart: false,
    errorKind: null, nextRefreshAt: null,
  });
  const [generation, setGeneration] = useState(0);
  const forceGenerationRef = useRef<number | null>(null);
  const retry = useCallback(() => {
    setState((previous) => ({ ...previous, nextRefreshAt: null }));
    setGeneration((value) => {
      const next = value + 1;
      forceGenerationRef.current = next;
      return next;
    });
  }, []);
  const refreshAutomatically = useCallback(() => {
    setGeneration((value) => {
      const next = value + 1;
      forceGenerationRef.current = null;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let nextIndex = 0;
    let failures = 0;
    let lastError: WeatherRequestErrorKind | null = null;
    let recoveredSavedEvidence = false;
    const forceRefresh = forceGenerationRef.current === generation;
    const savedSamples = buildSamples(metric, hourKey, state.forecasts);
    const hadSavedForecasts = savedSamples.size >= OVERLAY_USABLE_ANCHORS
      && hasSpatialSupport(savedSamples);
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setState((previous) => ({
        ...previous,
        loading: true,
        hadSavedAtStart: hadSavedForecasts,
        errorKind: null,
        nextRefreshAt: null,
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
            maxAgeMs: overlayRequestMaxAge(forceRefresh),
            requiredMetric: metric,
            requiredHourKey: hourKey,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          const activeHour = forecast.hours?.[hourKey];
          const usableForGeneration = !!activeHour && isUsableMetricHour(metric, activeHour);
          if (!usableForGeneration) {
            failures += 1;
            lastError = 'invalid-data';
          }
          setState((previous) => {
            const forecasts = new Map(previous.forecasts);
            // Never replace usable saved evidence with a malformed refresh.
            // Cold malformed data remains inspectable but contributes no wash.
            if (usableForGeneration || !forecasts.has(neighborhood.id)) {
              forecasts.set(neighborhood.id, forecast);
            }
            return {
              ...previous,
              forecasts,
            };
          });
        } catch (reason) {
          if (controller.signal.aborted) return;
          if (reason instanceof WeatherRequestError && reason.savedForecast) {
            recoveredSavedEvidence = true;
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
        return {
          ...previous,
          loading: false,
          hadSavedAtStart: hadSavedForecasts || recoveredSavedEvidence,
          errorKind: failures > 0 ? (lastError ?? 'network') : null,
          // Anchor the next generation to actual completion, not hook mount.
          nextRefreshAt: nextWeatherRefreshAt(null),
        };
      });
      if (forceGenerationRef.current === generation) forceGenerationRef.current = null;
    });

    return () => controller.abort();
    // Metric and hour affect presentation coverage, not which coordinate
    // requests belong to this generation. Sampling them here avoids
    // restarting all 25 requests when the user scrubs or changes metric.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, generation, timeZone]);

  useEffect(() => {
    if (!enabled || state.loading || state.nextRefreshAt === null) return;
    const delay = Math.max(0, state.nextRefreshAt - Date.now());
    const timeout = setTimeout(refreshAutomatically, delay);
    return () => clearTimeout(timeout);
  }, [enabled, refreshAutomatically, state.loading, state.nextRefreshAt]);

  const hourKeys = useMemo(() => deriveLocalHourKeys(now), [now]);
  const coverage = deriveOverlayCoverage(
    state.forecasts,
    metric,
    hourKey,
    state.loading,
    state.hadSavedAtStart,
    state.errorKind,
  );
  return {
    forecasts: state.forecasts,
    hourKeys,
    phase: enabled ? coverage.phase : 'off',
    loaded: coverage.usable,
    total: TOTAL,
    errorKind: coverage.errorKind,
    retry,
  };
}

export function getNeighborhoods(): ReadonlyArray<Neighborhood> {
  return neighborhoods;
}
