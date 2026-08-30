import { useEffect, useMemo, useState } from 'react';
import SunCalc from 'suncalc';
import type { Spot } from '../data/spots';
import { fetchSpotForecast, type HourlyForecast, type SpotForecast } from '../utils/weather';
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
  /** Canonical score for the next sunrise event. */
  sunrise: number;
  /** Canonical score for the next sunset event. */
  sunset: number;
  /** Canonical score for the next stargazing event. */
  stargazing: number;
  /** Canonical score for the current city-local hour. */
  now: number;
  /** True when at least one canonical score uses forecast data. */
  isLive: boolean;
  /** Score for the exact selected timeline hour and resolved view mode. */
  active: number;
  /** True only when active uses an exact forecast hour. */
  activeIsLive: boolean;
}

export type LiveScoresMap = Map<string, LiveSpotScores>;
export type SpotForecastMap = Map<string, SpotForecast>;
export type SpotForecastErrorMap = Map<string, Error>;

export interface TimelineScoresResult {
  scores: LiveScoresMap;
  forecasts: SpotForecastMap;
  forecastErrors: SpotForecastErrorMap;
}

function staticScoreForMode(spot: Spot, viewMode: ViewMode): number {
  return viewMode === 'now' ? computeNowBaseScore(spot) : spot[viewMode];
}

function staticCanonicalScores(
  spot: Spot,
): Omit<LiveSpotScores, 'active' | 'activeIsLive'> {
  return {
    sunrise: spot.sunrise,
    sunset: spot.sunset,
    stargazing: spot.stargazing,
    now: computeNowBaseScore(spot),
    isLive: false,
  };
}

function staticScores(spot: Spot, viewMode: ViewMode): LiveSpotScores {
  return {
    ...staticCanonicalScores(spot),
    active: staticScoreForMode(spot, viewMode),
    activeIsLive: false,
  };
}

interface ForecastIndexEntry {
  key: string;
  instantMs: number;
}

const forecastIndexCache = new WeakMap<SpotForecast, Map<string, ForecastIndexEntry[]>>();

function forecastTimeIndex(forecast: SpotForecast, timeZone: string): ForecastIndexEntry[] {
  let byTimeZone = forecastIndexCache.get(forecast);
  if (!byTimeZone) {
    byTimeZone = new Map();
    forecastIndexCache.set(forecast, byTimeZone);
  }
  const cached = byTimeZone.get(timeZone);
  if (cached) return cached;
  const index: ForecastIndexEntry[] = [];
  for (const key of Object.keys(forecast.hours)) {
    const instant = parseHourKeyInTimeZone(key, timeZone);
    if (instant) index.push({ key, instantMs: instant.getTime() });
  }
  byTimeZone.set(timeZone, index);
  return index;
}

function nearestForecastAtInstant(
  forecast: SpotForecast,
  instant: Date,
  timeZone: string,
): HourlyForecast | null {
  const exact = forecast.hours[formatHourKeyInTimeZone(instant, timeZone)];
  if (exact) return exact;
  let nearestKey = '';
  let nearestDiff = Infinity;
  for (const entry of forecastTimeIndex(forecast, timeZone)) {
    const diff = Math.abs(entry.instantMs - instant.getTime());
    if (diff < nearestDiff) {
      nearestKey = entry.key;
      nearestDiff = diff;
    }
  }
  return nearestKey ? forecast.hours[nearestKey] : null;
}

/** Compute canonical event scores without reference to the scrubbed hour. */
export function canonicalScoresForSpot(
  spot: Spot,
  forecast: SpotForecast,
  timeZone: string,
  currentHourKey: string,
): Omit<LiveSpotScores, 'active' | 'activeIsLive'> {
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
  const nowHour = forecast.hours[currentHourKey] ?? null;
  return {
    sunrise: sunriseHour ? computeLiveScore(spot, 'sunrise', sunriseHour) : spot.sunrise,
    sunset: sunsetHour ? computeLiveScore(spot, 'sunset', sunsetHour) : spot.sunset,
    stargazing: starHour
      ? computeLiveScore(spot, 'stargazing', starHour, moonIllum)
      : spot.stargazing,
    now: nowHour ? computeNowScore(spot, nowHour) : computeNowBaseScore(spot),
    isLive: Boolean(sunriseHour || sunsetHour || starHour || nowHour),
  };
}

export function activeScoreForSpot(
  spot: Spot,
  forecast: SpotForecast | null,
  selectedHourKey: string,
  selectedInstant: Date | null,
  viewMode: ViewMode,
): { active: number; activeIsLive: boolean } {
  const hourly = forecast?.hours[selectedHourKey] ?? null;
  if (!hourly || !selectedInstant) {
    return { active: staticScoreForMode(spot, viewMode), activeIsLive: false };
  }
  const moonIllum = SunCalc.getMoonIllumination(selectedInstant).fraction;
  return {
    active: computeScoreAtTime(spot, viewMode, hourly, moonIllum),
    activeIsLive: true,
  };
}

export function combineTimelineScores(
  canonical: Omit<LiveSpotScores, 'active' | 'activeIsLive'>,
  active: Pick<LiveSpotScores, 'active' | 'activeIsLive'>,
): LiveSpotScores {
  return { ...canonical, ...active };
}

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Single source of truth for canonical event scores, active timeline scores,
 * and the forecast objects consumed by the selected spot sheet.
 */
export function useTimelineScores(
  spots: ReadonlyArray<Spot>,
  hourKey: string,
  viewMode: ViewMode,
  timeZone: string,
  now: Date,
): TimelineScoresResult {
  const [forecasts, setForecasts] = useState<SpotForecastMap>(() => new Map());
  const [forecastErrors, setForecastErrors] = useState<SpotForecastErrorMap>(() => new Map());
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const bump = () => setRefreshTick((tick) => tick + 1);
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
          setForecasts((previous) => {
            if (previous.get(spot.id) === forecast) return previous;
            const next = new Map(previous);
            next.set(spot.id, forecast);
            return next;
          });
          setForecastErrors((previous) => {
            if (!previous.has(spot.id)) return previous;
            const next = new Map(previous);
            next.delete(spot.id);
            return next;
          });
        })
        .catch((reason: unknown) => {
          if (cancelled) return;
          const error = reason instanceof Error ? reason : new Error(String(reason));
          setForecastErrors((previous) => {
            const next = new Map(previous);
            next.set(spot.id, error);
            return next;
          });
        });
    }
    return () => {
      cancelled = true;
    };
  }, [spots, refreshTick]);

  const currentHourKey = formatHourKeyInTimeZone(now, timeZone);
  const canonicalScores = useMemo(() => {
    const result = new Map<string, Omit<LiveSpotScores, 'active' | 'activeIsLive'>>();
    for (const spot of spots) {
      const forecast = forecasts.get(spot.id);
      if (forecast) {
        result.set(spot.id, canonicalScoresForSpot(spot, forecast, timeZone, currentHourKey));
      } else {
        result.set(spot.id, staticCanonicalScores(spot));
      }
    }
    return result;
  }, [currentHourKey, forecasts, spots, timeZone]);

  // The selected instant is parsed once per scrub step, not once per spot.
  const selectedHourKey = hourKey || currentHourKey;
  const selectedInstant = useMemo(
    () => hourKey ? parseHourKeyInTimeZone(hourKey, timeZone) : now,
    [hourKey, now, timeZone],
  );

  const scores = useMemo<LiveScoresMap>(() => {
    const result: LiveScoresMap = new Map();
    for (const spot of spots) {
      const canonical = canonicalScores.get(spot.id);
      const active = activeScoreForSpot(
        spot,
        forecasts.get(spot.id) ?? null,
        selectedHourKey,
        selectedInstant,
        viewMode,
      );
      result.set(
        spot.id,
        combineTimelineScores(canonical ?? staticScores(spot, viewMode), active),
      );
    }
    return result;
  }, [canonicalScores, forecasts, selectedHourKey, selectedInstant, spots, viewMode]);

  return { scores, forecasts, forecastErrors };
}
