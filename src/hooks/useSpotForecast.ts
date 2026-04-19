import { useEffect, useState } from 'react';
import type { Spot } from '../data/spots';
import { fetchSpotForecast, type SpotForecast } from '../utils/weather';

export interface SpotForecastState {
  forecast: SpotForecast | null;
  loading: boolean;
  error: Error | null;
}

interface InternalState {
  /** Coordinate-keyed identity of the spot whose forecast we currently hold. */
  spotKey: string | null;
  forecast: SpotForecast | null;
  error: Error | null;
}

function spotKey(spot: Spot | null): string | null {
  return spot ? `${spot.lat},${spot.lng}` : null;
}

/**
 * Fetch (and cache) the Open-Meteo forecast for a given spot. Re-runs whenever
 * the spot's coordinates change. Cache hits resolve on the next microtask so
 * already-visited spots barely flash "loading".
 */
export function useSpotForecast(spot: Spot | null): SpotForecastState {
  const [state, setState] = useState<InternalState>({ spotKey: null, forecast: null, error: null });

  useEffect(() => {
    if (!spot) return;
    let cancelled = false;
    const key = spotKey(spot);
    fetchSpotForecast(spot.lat, spot.lng)
      .then((forecast) => {
        if (cancelled) return;
        setState({ spotKey: key, forecast, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ spotKey: key, forecast: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [spot]);

  if (!spot) return { forecast: null, loading: false, error: null };
  // We have stored data for a different (or no) spot — render as loading until
  // the in-flight fetch resolves.
  if (state.spotKey !== spotKey(spot)) {
    return { forecast: null, loading: true, error: null };
  }
  return { forecast: state.forecast, loading: false, error: state.error };
}
