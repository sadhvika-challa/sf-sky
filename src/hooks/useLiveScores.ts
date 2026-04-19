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

export type LiveScoresMap = Map<number, LiveSpotScores>;

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

/**
 * Fetch forecasts for every spot in parallel and expose a Map of spot id ->
 * live (or fallback) scores. Entries start as static scores and are upgraded
 * to live values as each spot's forecast resolves, so the UI never has a
 * "missing data" state.
 */
export function useLiveScores(spots: ReadonlyArray<Spot>): LiveScoresMap {
  const [scores, setScores] = useState<LiveScoresMap>(() => buildInitialMap(spots));

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
  }, [spots]);

  return scores;
}
