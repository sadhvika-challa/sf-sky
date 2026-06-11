import { useEffect, useState } from 'react';
import SunCalc from 'suncalc';
import type { Spot } from '../data/spots';
import { fetchSpotForecast, getForecastAt, type SpotForecast } from '../utils/weather';
import { computeLiveScore } from '../utils/scoring';
import { getUpcomingEventTimes } from '../utils/events';

export interface LiveSpotScores {
  sunrise: number;
  sunset: number;
  stargazing: number;
  /** True if at least one score was computed from a real forecast. */
  isLive: boolean;
}

export type LiveScoresMap = Map<string, LiveSpotScores>;

function staticScores(spot: Spot): LiveSpotScores {
  return {
    sunrise: spot.sunrise,
    sunset: spot.sunset,
    stargazing: spot.stargazing,
    isLive: false,
  };
}

function liveScoresForSpot(spot: Spot, forecast: SpotForecast): LiveSpotScores {
  const events = getUpcomingEventTimes(spot);
  const moonIllum = SunCalc.getMoonIllumination(events.stargazing).fraction;

  const sunriseHour = Number.isNaN(events.sunrise.getTime())
    ? null
    : getForecastAt(forecast, events.sunrise);
  const sunsetHour = Number.isNaN(events.sunset.getTime())
    ? null
    : getForecastAt(forecast, events.sunset);
  const starHour = Number.isNaN(events.stargazing.getTime())
    ? null
    : getForecastAt(forecast, events.stargazing);

  return {
    sunrise: sunriseHour ? computeLiveScore(spot, 'sunrise', sunriseHour) : spot.sunrise,
    sunset: sunsetHour ? computeLiveScore(spot, 'sunset', sunsetHour) : spot.sunset,
    stargazing: starHour
      ? computeLiveScore(spot, 'stargazing', starHour, moonIllum)
      : spot.stargazing,
    isLive: Boolean(sunriseHour || sunsetHour || starHour),
  };
}

function buildInitialMap(spots: ReadonlyArray<Spot>): LiveScoresMap {
  const map: LiveScoresMap = new Map();
  for (const spot of spots) map.set(spot.id, staticScores(spot));
  return map;
}

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Fetch forecasts for every spot in parallel and expose a Map of spot id ->
 * live (or fallback) scores. Entries start as static scores and are upgraded
 * to live values as each spot's forecast resolves, so the UI never has a
 * "missing data" state.
 */
export function useLiveScores(spots: ReadonlyArray<Spot>): LiveScoresMap {
  const [scores, setScores] = useState<LiveScoresMap>(() => buildInitialMap(spots));
  const [refreshTick, setRefreshTick] = useState(0);

  // Long-lived sessions never remount this hook: the installed PWA gets
  // resumed from the home screen for days without a cold reload, so scores
  // computed at mount (against mount-day event times and weather) would be
  // served forever. Re-score every 15 minutes and immediately whenever the
  // app returns to the foreground. The sessionStorage forecast cache
  // (30-min TTL) absorbs most of the refetch cost; re-running the scoring
  // also re-resolves "next event" times so we never score yesterday's sunset.
  useEffect(() => {
    const bump = () => setRefreshTick((t) => t + 1);
    const interval = setInterval(bump, REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') bump();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    for (const spot of spots) {
      fetchSpotForecast(spot.lat, spot.lng)
        .then((forecast) => {
          if (cancelled) return;
          const next = liveScoresForSpot(spot, forecast);
          setScores((prev) => {
            const updated = new Map(prev);
            updated.set(spot.id, next);
            return updated;
          });
        })
        .catch(() => {
          // Leave the static fallback in place.
        });
    }

    return () => {
      cancelled = true;
    };
  }, [spots, refreshTick]);

  return scores;
}
