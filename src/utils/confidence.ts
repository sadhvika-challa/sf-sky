// Forecast confidence: how much the score can still drift before the event.
// Pure functions only — no React, no fetch, no Date.now() (pass `now`).
//
// Open-Meteo's US best_match blends GFS (6h update cycle) with HRRR (hourly
// updates, ~1.5-2h publish lag). Inside ~6h the sunset-hour forecast starts
// reflecting fresh HRRR runs; inside 2h it is effectively nowcast. These
// thresholds mirror that cadence.

export type ScoreConfidence = 'early' | 'firming' | 'locked';

export interface ConfidenceRead {
  level: ScoreConfidence;
  /** Whole hours until the event, floored, min 0. */
  hoursOut: number;
  /** Mono-font detail line, e.g. "forecast 5h out \u00b7 still settling". */
  detail: string;
  /** Chip label: "early read" | "firming up" | "locked in". */
  chipLabel: string;
}

export const EARLY_HOURS = 6;
export const FIRMING_HOURS = 2;
export const TOMORROW_HOURS = 18;

export const CONFIDENCE_COLORS: Record<ScoreConfidence, string> = {
  early: '#C4956A',
  firming: '#C4956A',
  locked: '#5B9A7B',
};

export function getScoreConfidence(eventTime: Date, now: Date): ConfidenceRead {
  if (Number.isNaN(eventTime.getTime())) {
    return { level: 'early', hoursOut: 0, detail: 'no live forecast', chipLabel: 'early read' };
  }

  const diffMs = eventTime.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const hoursOut = Math.max(0, Math.floor(diffHours));

  if (diffHours > TOMORROW_HOURS) {
    return {
      level: 'early',
      hoursOut,
      detail: 'forecast for tomorrow \u00b7 early read',
      chipLabel: 'early read',
    };
  }

  if (diffHours > EARLY_HOURS) {
    return {
      level: 'early',
      hoursOut,
      detail: `forecast ${hoursOut}h out \u00b7 still settling`,
      chipLabel: 'early read',
    };
  }

  if (diffHours > FIRMING_HOURS) {
    return {
      level: 'firming',
      hoursOut,
      detail: `forecast ${hoursOut}h out \u00b7 getting solid`,
      chipLabel: 'firming up',
    };
  }

  // Under 2h (including during/after the event)
  if (diffHours < 1 && diffMs > 0) {
    const minsOut = Math.max(0, Math.floor(diffMs / (1000 * 60)));
    return {
      level: 'locked',
      hoursOut: 0,
      detail: `forecast ${minsOut}min out \u00b7 near certain`,
      chipLabel: 'locked in',
    };
  }

  return {
    level: 'locked',
    hoursOut,
    detail: `forecast ${hoursOut}h out \u00b7 near certain`,
    chipLabel: 'locked in',
  };
}
