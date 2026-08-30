import { useCallback, useEffect, useMemo, useState } from 'react';
import SunCalc from 'suncalc';
import type { Spot } from '../data/spots';
import {
  fetchSpotForecast,
  getHourlyForecastCompleteness,
  WeatherRequestError,
  type HourlyForecast,
  type SpotForecast,
} from '../utils/weather';
import {
  computeLiveScore,
  computeNowScore,
  computeNowBaseScore,
  computeScoreAtTime,
  type ViewMode,
} from '../utils/scoring';
import { getUpcomingEventTimes } from '../utils/events';
import { buildScoreEvidence, type ScoreEvidence } from '../utils/confidence';
import {
  formatCanonicalHourKey,
  parseCanonicalHourKey,
} from '../utils/timeline';
import {
  keepRefreshScheduleForScope,
  nextWeatherRefreshAt,
  WEATHER_REFRESH_INTERVAL_MS,
} from '../utils/weatherRefresh';

export interface LiveSpotScores {
  sunrise: number;
  sunset: number;
  stargazing: number;
  now: number;
  /** Legacy aggregate used by outlook copy. True when any event uses forecast data. */
  isLive: boolean;
  /** Evidence for each canonical score. */
  evidence: Record<ViewMode, ScoreEvidence>;
  active: number;
  /** Legacy exact-hour flag. Partial or estimated hours are never marked live. */
  activeIsLive: boolean;
  activeEvidence: ScoreEvidence;
}

type CanonicalSpotScores = Omit<LiveSpotScores, 'active' | 'activeIsLive' | 'activeEvidence'>;
type ActiveSpotScore = Pick<LiveSpotScores, 'active' | 'activeIsLive' | 'activeEvidence'>;

export type LiveScoresMap = Map<string, LiveSpotScores>;
export type SpotForecastMap = Map<string, SpotForecast>;
export type SpotForecastErrorMap = Map<string, Error>;

export interface TimelineScoresResult {
  scores: LiveScoresMap;
  forecasts: SpotForecastMap;
  forecastErrors: SpotForecastErrorMap;
  retryForecast: () => void;
  forecastRetrying: boolean;
}

function staticScoreForMode(spot: Spot, viewMode: ViewMode): number {
  return viewMode === 'now' ? computeNowBaseScore(spot) : spot[viewMode];
}

function exactHour(
  forecast: SpotForecast,
  instant: Date,
): HourlyForecast | null {
  if (Number.isNaN(instant.getTime())) return null;
  return forecast.hours[formatCanonicalHourKey(instant)] ?? null;
}

function unavailableReason(
  forecast: SpotForecast | null,
  hourly: HourlyForecast | null,
  mode: ViewMode,
): 'missing-hour' | 'malformed' | 'empty' | undefined {
  if (!forecast) return undefined;
  if (Object.keys(forecast.hours).length === 0) return 'empty';
  if (!hourly) return 'missing-hour';
  if (getHourlyForecastCompleteness(hourly, mode).completeness === 'missing') return 'malformed';
  return undefined;
}

export function canonicalScoresForSpot(
  spot: Spot,
  forecast: SpotForecast | null,
  currentHourKey: string,
  now: Date,
  loading = false,
  error: Error | null = null,
): CanonicalSpotScores {
  const events = getUpcomingEventTimes(spot, now);
  const sunriseHour = forecast ? exactHour(forecast, events.sunrise) : null;
  const sunsetHour = forecast ? exactHour(forecast, events.sunset) : null;
  const starHour = forecast ? exactHour(forecast, events.stargazing) : null;
  const nowHour = forecast?.hours[currentHourKey] ?? null;
  const moonIllum = SunCalc.getMoonIllumination(events.stargazing).fraction;

  const evidence: Record<ViewMode, ScoreEvidence> = {
    sunrise: buildScoreEvidence({
      hourly: sunriseHour,
      mode: 'sunrise',
      moment: 'event',
      eventTime: events.sunrise,
      fetchedAt: forecast?.fetchedAt ?? null,
      now,
      loading,
      error,
      unavailableReason: unavailableReason(forecast, sunriseHour, 'sunrise'),
    }),
    sunset: buildScoreEvidence({
      hourly: sunsetHour,
      mode: 'sunset',
      moment: 'event',
      eventTime: events.sunset,
      fetchedAt: forecast?.fetchedAt ?? null,
      now,
      loading,
      error,
      unavailableReason: unavailableReason(forecast, sunsetHour, 'sunset'),
    }),
    stargazing: buildScoreEvidence({
      hourly: starHour,
      mode: 'stargazing',
      moment: 'event',
      eventTime: events.stargazing,
      fetchedAt: forecast?.fetchedAt ?? null,
      now,
      loading,
      error,
      unavailableReason: unavailableReason(forecast, starHour, 'stargazing'),
    }),
    now: buildScoreEvidence({
      hourly: nowHour,
      mode: 'now',
      moment: 'current',
      eventTime: now,
      fetchedAt: forecast?.fetchedAt ?? null,
      now,
      loading,
      error,
      unavailableReason: unavailableReason(forecast, nowHour, 'now'),
    }),
  };

  return {
    sunrise: sunriseHour && evidence.sunrise.provenance === 'forecast'
      ? computeLiveScore(spot, 'sunrise', sunriseHour)
      : spot.sunrise,
    sunset: sunsetHour && evidence.sunset.provenance === 'forecast'
      ? computeLiveScore(spot, 'sunset', sunsetHour)
      : spot.sunset,
    stargazing: starHour && evidence.stargazing.provenance === 'forecast'
      ? computeLiveScore(spot, 'stargazing', starHour, moonIllum)
      : spot.stargazing,
    now: nowHour && evidence.now.provenance === 'forecast'
      ? computeNowScore(spot, nowHour)
      : computeNowBaseScore(spot),
    isLive: Object.values(evidence).some((read) => read.provenance === 'forecast'),
    evidence,
  };
}

export function activeScoreForSpot(
  spot: Spot,
  forecast: SpotForecast | null,
  selectedHourKey: string,
  selectedInstant: Date | null,
  viewMode: ViewMode,
  now: Date,
  isCurrent: boolean,
  loading = false,
  error: Error | null = null,
): ActiveSpotScore {
  const hourly = forecast?.hours[selectedHourKey] ?? null;
  const activeEvidence = buildScoreEvidence({
    hourly,
    mode: viewMode,
    moment: isCurrent ? 'current' : 'selected-hour',
    eventTime: selectedInstant,
    fetchedAt: forecast?.fetchedAt ?? null,
    now,
    loading,
    error,
    unavailableReason: selectedInstant
      ? unavailableReason(forecast, hourly, viewMode)
      : 'missing-hour',
  });
  if (!hourly || !selectedInstant || activeEvidence.provenance !== 'forecast') {
    return {
      active: staticScoreForMode(spot, viewMode),
      activeIsLive: false,
      activeEvidence,
    };
  }
  const moonIllum = SunCalc.getMoonIllumination(selectedInstant).fraction;
  return {
    active: computeScoreAtTime(spot, viewMode, hourly, moonIllum),
    activeIsLive:
      activeEvidence.provenance === 'forecast' && activeEvidence.completeness === 'complete',
    activeEvidence,
  };
}

export function combineTimelineScores(
  canonical: CanonicalSpotScores,
  active: ActiveSpotScore,
): LiveSpotScores {
  return { ...canonical, ...active };
}

/** Single source of truth for score values and their evidence contract. */
export function useTimelineScores(
  spots: ReadonlyArray<Spot>,
  hourKey: string,
  viewMode: ViewMode,
  timeZone: string,
  now: Date,
  requestedSpotIds: ReadonlyArray<string> = spots.map((spot) => spot.id),
): TimelineScoresResult {
  const [forecasts, setForecasts] = useState<SpotForecastMap>(() => new Map());
  const [forecastErrors, setForecastErrors] = useState<SpotForecastErrorMap>(() => new Map());
  const [refreshRequest, setRefreshRequest] = useState({ generation: 0, force: false });
  const [retryingScope, setRetryingScope] = useState<string | null>(null);
  const [refreshSchedule, setRefreshSchedule] = useState<{
    scope: string;
    generation: number;
    dueAt: number;
  } | null>(null);
  const requestedScope = `${timeZone}:${requestedSpotIds.join(',')}`;
  const bumpRefresh = useCallback((force: boolean) => {
    setRefreshRequest((previous) => ({ generation: previous.generation + 1, force }));
  }, []);
  const retryForecast = useCallback(() => {
    setRetryingScope(requestedScope);
    setRefreshSchedule(null);
    bumpRefresh(true);
  }, [bumpRefresh, requestedScope]);

  const activeRefreshSchedule = keepRefreshScheduleForScope(refreshSchedule, requestedScope);
  const forecastRetrying = retryingScope === requestedScope;

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') bumpRefresh(false);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [bumpRefresh]);

  useEffect(() => {
    if (!activeRefreshSchedule || requestedSpotIds.length === 0) return;
    const timeout = setTimeout(
      () => bumpRefresh(false),
      Math.max(0, activeRefreshSchedule.dueAt - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [activeRefreshSchedule, bumpRefresh, requestedSpotIds.length]);

  useEffect(() => {
    const controller = new AbortController();
    const requested = new Set(requestedSpotIds);
    const requestGeneration = refreshRequest.generation;
    const scheduleNext = (dueAt: number) => {
      setRefreshSchedule((previous) => {
        if (
          previous &&
          previous.scope === requestedScope &&
          previous.generation === requestGeneration
        ) {
          return { ...previous, dueAt: Math.min(previous.dueAt, dueAt) };
        }
        return { scope: requestedScope, generation: requestGeneration, dueAt };
      });
    };
    for (const spot of spots) {
      if (!requested.has(spot.id)) continue;
      fetchSpotForecast(spot.lat, spot.lng, timeZone, {
        maxAgeMs: refreshRequest.force ? 0 : WEATHER_REFRESH_INTERVAL_MS,
        signal: controller.signal,
      })
        .then((forecast) => {
          if (controller.signal.aborted) return;
          if (refreshRequest.force) {
            setRetryingScope((scope) => scope === requestedScope ? null : scope);
          }
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
          // fetchedAt is stamped after endpoint completion. A slow first
          // request therefore still receives a full 15-minute fresh window.
          scheduleNext(nextWeatherRefreshAt(
            forecast.requestCompletedAt ?? forecast.fetchedAt,
          ));
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          if (refreshRequest.force) {
            setRetryingScope((scope) => scope === requestedScope ? null : scope);
          }
          const error = reason instanceof Error ? reason : new Error(String(reason));
          if (reason instanceof WeatherRequestError && reason.savedForecast) {
            setForecasts((previous) => {
              const next = new Map(previous);
              next.set(spot.id, reason.savedForecast!);
              return next;
            });
          }
          setForecastErrors((previous) => {
            const next = new Map(previous);
            next.set(spot.id, error);
            return next;
          });
          // Failed revalidation never hot-loops. Retained evidence stays in
          // place and the next automatic attempt waits a full interval.
          scheduleNext(nextWeatherRefreshAt(null));
        });
    }
    return () => controller.abort();
  }, [requestedScope, requestedSpotIds, spots, refreshRequest, timeZone]);

  const requestedSet = useMemo(() => new Set(requestedSpotIds), [requestedSpotIds]);

  const currentHourKey = formatCanonicalHourKey(now);
  const selectedHourKey = hourKey || currentHourKey;
  const selectedInstant = useMemo(
    () => hourKey ? parseCanonicalHourKey(hourKey) : now,
    [hourKey, now],
  );

  const scores = useMemo<LiveScoresMap>(() => {
    const result: LiveScoresMap = new Map();
    for (const spot of spots) {
      const forecast = forecasts.get(spot.id) ?? null;
      const error = forecastErrors.get(spot.id) ?? null;
      const loading = requestedSet.has(spot.id) && forecast === null && error === null;
      const canonical = canonicalScoresForSpot(
        spot,
        forecast,
        currentHourKey,
        now,
        loading,
        error,
      );
      const active = activeScoreForSpot(
        spot,
        forecast,
        selectedHourKey,
        selectedInstant,
        viewMode,
        now,
        hourKey === '',
        loading,
        error,
      );
      result.set(spot.id, combineTimelineScores(canonical, active));
    }
    return result;
  }, [
    currentHourKey,
    forecastErrors,
    forecasts,
    hourKey,
    now,
    selectedHourKey,
    selectedInstant,
    spots,
    requestedSet,
    viewMode,
  ]);

  return { scores, forecasts, forecastErrors, retryForecast, forecastRetrying };
}
