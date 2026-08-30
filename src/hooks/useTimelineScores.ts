import { useEffect, useMemo, useState } from 'react';
import SunCalc from 'suncalc';
import type { Spot } from '../data/spots';
import { fetchSpotForecast, type SpotForecast } from '../utils/weather';
import {
  computeLiveScore,
  computeNowScore,
  computeNowBaseScore,
  computeScoreAtTime,
  type ViewMode,
} from '../utils/scoring';
import { getUpcomingEventTimes } from '../utils/events';
import { formatHourKeyInTimeZone, parseHourKeyInTimeZone } from '../utils/timeline';

export interface LiveSpotScores {
  sunrise: number;
  sunset: number;
  stargazing: number;
  now: number;
  isLive: boolean;
}

export type LiveScoresMap = Map<string, LiveSpotScores>;

function staticScores(spot: Spot): LiveSpotScores {
  return {
    sunrise: spot.sunrise,
    sunset: spot.sunset,
    stargazing: spot.stargazing,
    now: computeNowBaseScore(spot),
    isLive: false,
  };
}

function exactForecastAtInstant(forecast: SpotForecast, instant: Date, timeZone: string) {
  return forecast.hours[formatHourKeyInTimeZone(instant, timeZone)] ?? null;
}

function nearestForecastAtInstant(forecast: SpotForecast, instant: Date, timeZone: string) {
  const exact = exactForecastAtInstant(forecast, instant, timeZone);
  if (exact) return exact;
  let nearestKey = '';
  let nearestDiff = Infinity;
  for (const key of Object.keys(forecast.hours)) {
    const candidate = parseHourKeyInTimeZone(key, timeZone);
    if (!candidate) continue;
    const diff = Math.abs(candidate.getTime() - instant.getTime());
    if (diff < nearestDiff) {
      nearestKey = key;
      nearestDiff = diff;
    }
  }
  return nearestKey ? forecast.hours[nearestKey] : null;
}

function liveScoresForSpot(
  spot: Spot,
  forecast: SpotForecast,
  timeZone: string,
): LiveSpotScores {
  const events = getUpcomingEventTimes(spot);
  const moonIllum = SunCalc.getMoonIllumination(events.stargazing).fraction;

  const sunriseHour = Number.isNaN(events.sunrise.getTime())
    ? null
    : nearestForecastAtInstant(forecast, events.sunrise, timeZone);
  const sunsetHour = Number.isNaN(events.sunset.getTime())
    ? null
    : nearestForecastAtInstant(forecast, events.sunset, timeZone);
  const starHour = Number.isNaN(events.stargazing.getTime())
    ? null
    : nearestForecastAtInstant(forecast, events.stargazing, timeZone);

  const nowHour = exactForecastAtInstant(forecast, new Date(), timeZone);

  const result = {
    sunrise: sunriseHour ? computeLiveScore(spot, 'sunrise', sunriseHour) : spot.sunrise,
    sunset: sunsetHour ? computeLiveScore(spot, 'sunset', sunsetHour) : spot.sunset,
    stargazing: starHour
      ? computeLiveScore(spot, 'stargazing', starHour, moonIllum)
      : spot.stargazing,
    now: nowHour ? computeNowScore(spot, nowHour) : computeNowBaseScore(spot),
    isLive: Boolean(sunriseHour || sunsetHour || starHour || nowHour),
  };
  return result;
}

function scrubbedScoresForSpot(
  spot: Spot,
  forecast: SpotForecast,
  hourKey: string,
  viewMode: ViewMode,
  timeZone: string,
): LiveSpotScores {
  const hourly = forecast.hours[hourKey] ?? null;
  if (!hourly) return staticScores(spot);

  const scrubbedTime = parseHourKeyInTimeZone(hourKey, timeZone);
  if (!scrubbedTime) return staticScores(spot);
  const moonIllum = SunCalc.getMoonIllumination(scrubbedTime).fraction;
  const activeScore = computeScoreAtTime(spot, viewMode, hourly, moonIllum);

  const events = getUpcomingEventTimes(spot);
  const eventMoonIllum = SunCalc.getMoonIllumination(events.stargazing).fraction;
  const sunriseHour = Number.isNaN(events.sunrise.getTime()) ? null : nearestForecastAtInstant(forecast, events.sunrise, timeZone);
  const sunsetHour = Number.isNaN(events.sunset.getTime()) ? null : nearestForecastAtInstant(forecast, events.sunset, timeZone);
  const starHour = Number.isNaN(events.stargazing.getTime()) ? null : nearestForecastAtInstant(forecast, events.stargazing, timeZone);
  const nowHour = exactForecastAtInstant(forecast, new Date(), timeZone);

  const result = {
    sunrise: viewMode === 'sunrise' ? activeScore : (sunriseHour ? computeLiveScore(spot, 'sunrise', sunriseHour) : spot.sunrise),
    sunset: viewMode === 'sunset' ? activeScore : (sunsetHour ? computeLiveScore(spot, 'sunset', sunsetHour) : spot.sunset),
    stargazing: viewMode === 'stargazing' ? activeScore : (starHour ? computeLiveScore(spot, 'stargazing', starHour, eventMoonIllum) : spot.stargazing),
    now: viewMode === 'now' ? activeScore : (nowHour ? computeNowScore(spot, nowHour) : computeNowBaseScore(spot)),
    isLive: true,
  };
  return result;
}

function buildInitialMap(spots: ReadonlyArray<Spot>): LiveScoresMap {
  const map: LiveScoresMap = new Map();
  for (const spot of spots) map.set(spot.id, staticScores(spot));
  return map;
}

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Single source of truth for pin scores. Replaces `useLiveScores`.
 *
 * When `hourKey` is '' (timeline at "now"), scores the exact city-local
 * current forecast hour plus each upcoming event hour.
 *
 * When `hourKey` is set (user is scrubbing), extracts the cached forecast
 * exact slice for that hour and computes `computeScoreAtTime` for every spot.
 */
export function useTimelineScores(
  spots: ReadonlyArray<Spot>,
  hourKey: string,
  viewMode: ViewMode,
  timeZone: string,
): LiveScoresMap {
  const [forecasts, setForecasts] = useState<Map<string, SpotForecast>>(() => new Map());
  const [refreshTick, setRefreshTick] = useState(0);

  // Periodic refresh + foreground refresh (same as old useLiveScores).
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

  // Fetch forecasts for all spots.
  useEffect(() => {
    let cancelled = false;

    for (const spot of spots) {
      fetchSpotForecast(spot.lat, spot.lng)
        .then((forecast) => {
          if (cancelled) return;
          setForecasts((prev) => {
            if (prev.get(spot.id) === forecast) return prev;
            const next = new Map(prev);
            next.set(spot.id, forecast);
            return next;
          });
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [spots, refreshTick]);

  // Derive scores synchronously from (spots, forecasts, hourKey, viewMode).
  // Computing this during render — rather than in an effect — guarantees the
  // returned map is always consistent with the `viewMode` it was built for.
  // An async effect lagged behind `viewMode` (which App derives synchronously
  // from the scrubbed hour), so at each sunrise/sunset boundary pins briefly
  // read the previous map's untouched field — the spot's high *static base*
  // score — and flashed green until the recompute committed.
  const scores = useMemo<LiveScoresMap>(() => {
    if (forecasts.size === 0) return buildInitialMap(spots);

    const next: LiveScoresMap = new Map();
    for (const spot of spots) {
      const forecast = forecasts.get(spot.id);
      if (!forecast) {
        next.set(spot.id, staticScores(spot));
        continue;
      }

      if (hourKey === '') {
        next.set(spot.id, liveScoresForSpot(spot, forecast, timeZone));
      } else {
        next.set(spot.id, scrubbedScoresForSpot(spot, forecast, hourKey, viewMode, timeZone));
      }
    }
    return next;
  }, [spots, forecasts, hourKey, timeZone, viewMode]);

  return scores;
}
