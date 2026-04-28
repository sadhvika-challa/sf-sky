import { useEffect, useMemo, useState } from 'react';
import { neighborhoods, type Neighborhood } from '../data/neighborhoods';
import { fetchSpotForecast, type SpotForecast } from '../utils/weather';

export type NeighborhoodForecasts = Map<number, SpotForecast>;

export interface NeighborhoodForecastState {
  /** id -> forecast. Empty until at least one fetch resolves. */
  forecasts: NeighborhoodForecasts;
  /** Sorted ISO hour keys ("YYYY-MM-DDTHH") usable by the time scrubber. */
  hourKeys: string[];
}

const EMPTY_STATE: NeighborhoodForecastState = {
  forecasts: new Map(),
  hourKeys: [],
};

/**
 * Fetch Open-Meteo forecasts for every neighborhood centroid in parallel.
 *
 * Reuses the per-coordinate caching + inflight de-dup in `fetchSpotForecast`,
 * so visiting Weather mode after Explore mode doesn't refetch what we
 * already have.
 *
 * Gated on `enabled` so we don't pay the cost when the user never opens
 * Weather mode.
 */
export function useNeighborhoodForecasts(enabled: boolean): NeighborhoodForecastState {
  const [forecasts, setForecasts] = useState<NeighborhoodForecasts>(() => new Map());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    for (const n of neighborhoods) {
      fetchSpotForecast(n.lat, n.lng)
        .then((forecast) => {
          if (cancelled) return;
          setForecasts((prev) => {
            // Skip the state update if this neighborhood was already
            // populated from cache by a prior pass — keeps React from
            // running 21 sequential renders on a warm cache.
            if (prev.get(n.id) === forecast) return prev;
            const next = new Map(prev);
            next.set(n.id, forecast);
            return next;
          });
        })
        .catch(() => {
          // Per-spot failure: leave it absent. The interpolation falls
          // back to the remaining neighborhoods.
        });
    }

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const hourKeys = useMemo(() => deriveHourKeys(forecasts), [forecasts]);

  if (!enabled) return EMPTY_STATE;
  return { forecasts, hourKeys };
}

/**
 * Pull the union of hour keys across all loaded forecasts and return them
 * sorted. Open-Meteo gives every spot the same 72-hour window in practice,
 * but unioning is cheap and tolerates a partially-loaded state on first
 * paint.
 */
function deriveHourKeys(forecasts: NeighborhoodForecasts): string[] {
  if (forecasts.size === 0) return [];
  const set = new Set<string>();
  for (const f of forecasts.values()) {
    for (const k of Object.keys(f.hours)) set.add(k);
  }
  return Array.from(set).sort();
}

export function getNeighborhoods(): ReadonlyArray<Neighborhood> {
  return neighborhoods;
}
