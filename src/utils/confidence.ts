import type { ViewMode } from './scoring';
import {
  getHourlyForecastCompleteness,
  type ForecastCompleteness,
  type HourlyForecast,
} from './weather';

export type ScoreProvenance = 'forecast' | 'curated-estimate';
export type ForecastFreshness = 'fresh' | 'aging' | 'stale' | 'unknown';
export type ScoreConfidence = 'high' | 'medium' | 'low';
export type ForecastMoment = 'current' | 'selected-hour' | 'event';
export type ScorePresentationState =
  | 'loading'
  | 'current-forecast'
  | 'selected-hour-forecast'
  | 'event-forecast'
  | 'aging-forecast'
  | 'stale-forecast'
  | 'partial-forecast'
  | 'unavailable'
  | 'curated-estimate';
export type ScoreEvidenceReason =
  | 'none'
  | 'loading'
  | 'missing-required-fields'
  | 'missing-hour'
  | 'malformed'
  | 'empty'
  | 'fetch-error'
  | 'refresh-error'
  | 'missing-retrieval-time'
  | 'no-forecast';

export interface ScoreEvidence {
  provenance: ScoreProvenance;
  freshness: ForecastFreshness;
  completeness: ForecastCompleteness;
  confidence: ScoreConfidence;
  state: ScorePresentationState;
  reason: ScoreEvidenceReason;
  fetchedAt: number | null;
  statusLabel: string;
  retrievalLabel: string;
  provenanceLabel: string;
}

export interface ScoreEvidenceInput {
  hourly: HourlyForecast | null;
  mode: ViewMode;
  moment: ForecastMoment;
  eventTime: Date | null;
  fetchedAt: number | null;
  now: Date;
  loading?: boolean;
  error?: Error | null;
  unavailableReason?: 'missing-hour' | 'malformed' | 'empty';
}

export const FRESH_FORECAST_MS = 45 * 60 * 1000;
export const STALE_FORECAST_MS = 2 * 60 * 60 * 1000;
export const HIGH_CONFIDENCE_HOURS = 2;
export const MEDIUM_CONFIDENCE_HOURS = 6;

export function getForecastFreshness(
  fetchedAt: number | null,
  nowMs: number,
): ForecastFreshness {
  if (fetchedAt === null || !Number.isFinite(fetchedAt) || fetchedAt > nowMs + 60_000) {
    return 'unknown';
  }
  const age = nowMs - fetchedAt;
  if (age <= FRESH_FORECAST_MS) return 'fresh';
  if (age <= STALE_FORECAST_MS) return 'aging';
  return 'stale';
}

export function formatForecastRetrieved(fetchedAt: number | null, nowMs: number): string {
  if (fetchedAt === null || !Number.isFinite(fetchedAt) || fetchedAt > nowMs + 60_000) {
    return 'Retrieval time unavailable';
  }
  const ageMs = Math.max(0, nowMs - fetchedAt);
  if (ageMs < 60_000) return 'Retrieved just now';
  if (ageMs < 3_600_000) return `Retrieved ${Math.floor(ageMs / 60_000)}m ago`;
  return `Retrieved ${Math.floor(ageMs / 3_600_000)}h ago`;
}

function hoursUntil(eventTime: Date | null, now: Date): number | null {
  if (!eventTime || Number.isNaN(eventTime.getTime())) return null;
  return Math.max(0, (eventTime.getTime() - now.getTime()) / 3_600_000);
}

export function getForecastConfidence(
  provenance: ScoreProvenance,
  freshness: ForecastFreshness,
  completeness: ForecastCompleteness,
  eventTime: Date | null,
  now: Date,
): ScoreConfidence {
  if (provenance !== 'forecast' || completeness !== 'complete') return 'low';
  if (freshness === 'stale' || freshness === 'unknown') return 'low';

  const horizon = hoursUntil(eventTime, now);
  if (horizon === null) return 'low';
  if (freshness === 'fresh' && horizon <= HIGH_CONFIDENCE_HOURS) return 'high';
  if (horizon <= MEDIUM_CONFIDENCE_HOURS) return 'medium';
  return 'low';
}

function forecastStatusLabel(
  moment: ForecastMoment,
  mode: ViewMode,
  freshness: ForecastFreshness,
  completeness: ForecastCompleteness,
): { state: ScorePresentationState; label: string } {
  if (freshness === 'stale') return { state: 'stale-forecast', label: 'Stale forecast' };
  if (completeness !== 'complete' || freshness === 'unknown') {
    return { state: 'partial-forecast', label: 'Partial forecast' };
  }
  if (freshness === 'aging') return { state: 'aging-forecast', label: 'Aging forecast' };
  if (moment === 'current') return { state: 'current-forecast', label: 'Current forecast' };
  if (moment === 'selected-hour') {
    return { state: 'selected-hour-forecast', label: 'Selected-hour forecast' };
  }
  const eventLabel = mode === 'stargazing'
    ? 'Stargazing forecast'
    : `${mode[0].toUpperCase()}${mode.slice(1)} forecast`;
  return { state: 'event-forecast', label: eventLabel };
}

/** Build the presentation contract consumed by every score surface. */
export function buildScoreEvidence(input: ScoreEvidenceInput): ScoreEvidence {
  const nowMs = input.now.getTime();
  const fetchedAt = input.fetchedAt !== null && Number.isFinite(input.fetchedAt)
    ? input.fetchedAt
    : null;
  const completenessRead = getHourlyForecastCompleteness(input.hourly, input.mode);
  const hasUsableForecast = input.hourly !== null && completenessRead.completeness !== 'missing';
  // A failed refresh makes a retained forecast stale for decision-making,
  // even when its original retrieval timestamp is still relatively recent.
  const freshness = input.error && hasUsableForecast
    ? 'stale'
    : getForecastFreshness(fetchedAt, nowMs);
  const provenance: ScoreProvenance = hasUsableForecast ? 'forecast' : 'curated-estimate';
  const confidence = getForecastConfidence(
    provenance,
    freshness,
    completenessRead.completeness,
    input.eventTime,
    input.now,
  );
  const retrievalLabel = fetchedAt === null
    ? input.loading
      ? 'Retrieval pending'
      : 'Forecast not retrieved'
    : formatForecastRetrieved(fetchedAt, nowMs);

  if (!hasUsableForecast) {
    if (input.loading && fetchedAt === null) {
      return {
        provenance,
        freshness,
        completeness: completenessRead.completeness,
        confidence,
        state: 'loading',
        reason: 'loading',
        fetchedAt,
        statusLabel: 'Retrieving forecast · curated estimate',
        retrievalLabel,
        provenanceLabel: 'Curated estimate',
      };
    }

    if (input.error || input.unavailableReason) {
      const unavailableLabel = input.unavailableReason === 'missing-hour'
        ? 'Selected hour unavailable · curated estimate'
        : input.unavailableReason === 'malformed' || input.unavailableReason === 'empty'
          ? 'Forecast data unavailable · curated estimate'
          : 'Forecast unavailable · curated estimate';
      return {
        provenance,
        freshness,
        completeness: completenessRead.completeness,
        confidence,
        state: 'unavailable',
        reason: input.error
          ? 'fetch-error'
          : (input.unavailableReason ?? 'no-forecast'),
        fetchedAt,
        statusLabel: unavailableLabel,
        retrievalLabel,
        provenanceLabel: 'Curated estimate',
      };
    }

    return {
      provenance,
      freshness,
      completeness: completenessRead.completeness,
      confidence,
      state: 'curated-estimate',
      reason: 'no-forecast',
      fetchedAt,
      statusLabel: 'Curated estimate',
      retrievalLabel,
      provenanceLabel: 'Curated estimate',
    };
  }

  const status = forecastStatusLabel(
    input.moment,
    input.mode,
    freshness,
    completenessRead.completeness,
  );
  const displayedStatus = input.error
    ? { state: 'stale-forecast' as const, label: 'Saved forecast' }
    : status;
  return {
    provenance,
    freshness,
    completeness: completenessRead.completeness,
    confidence,
    state: displayedStatus.state,
    reason: input.error
      ? 'refresh-error'
      : completenessRead.completeness === 'partial'
        ? 'missing-required-fields'
        : freshness === 'unknown'
          ? 'missing-retrieval-time'
          : 'none',
    fetchedAt,
    statusLabel: `${displayedStatus.label} · ${confidence} confidence`,
    retrievalLabel,
    provenanceLabel: completenessRead.completeness === 'complete'
      ? 'Forecast-backed'
      : 'Partial forecast',
  };
}

export function scoreEvidenceAccessibilityLabel(score: number, evidence: ScoreEvidence): string {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  return `${clampedScore} out of 100, ${evidence.statusLabel.toLowerCase()}, ${evidence.retrievalLabel.toLowerCase()}`;
}

export function describeScoreEvidenceSet(evidence: ReadonlyArray<ScoreEvidence>): string {
  if (evidence.length === 0) return 'No visible scores';
  const forecastCount = evidence.filter((read) => read.provenance === 'forecast').length;
  if (forecastCount === evidence.length) return 'Forecast-backed scores';
  if (forecastCount === 0) return 'Curated estimates';
  return 'Mix of forecast-backed scores and curated estimates';
}
