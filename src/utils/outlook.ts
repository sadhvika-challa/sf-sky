// Roll up live per-spot scores into a citywide outlook for each event type.
// Used by the filter panel to flag days where weather makes a particular
// activity a poor bet, even at the best spots.

import type { City } from '../data/spots';
import type { LiveScoresMap } from '../hooks/useLiveScores';
import type { ScoreType } from './scoring';

export type OutlookStatus = 'good' | 'mixed' | 'poor';

export interface OutlookEntry {
  status: OutlookStatus;
  topScore: number;
}

export interface CityOutlook {
  sunrise: OutlookEntry;
  sunset: OutlookEntry;
  stargazing: OutlookEntry;
  /** True when at least one spot has a live (forecast-derived) score. */
  isLive: boolean;
}

const GOOD_THRESHOLD = 75;
const MIXED_THRESHOLD = 60;

function classify(top: number): OutlookStatus {
  if (top >= GOOD_THRESHOLD) return 'good';
  if (top >= MIXED_THRESHOLD) return 'mixed';
  return 'poor';
}

/**
 * Pick the score at the 90th percentile (rank-wise) so a single stale outlier
 * can't carry the day. Falls back to the simple max when fewer than 10 live
 * spots have loaded.
 */
function topDecile(sortedDesc: number[]): number {
  if (sortedDesc.length === 0) return 0;
  if (sortedDesc.length < 10) return sortedDesc[0];
  const idx = Math.max(0, Math.floor(sortedDesc.length * 0.1) - 1);
  return sortedDesc[idx];
}

function entryFor(scores: LiveScoresMap, type: ScoreType): OutlookEntry {
  const values: number[] = [];
  for (const entry of scores.values()) {
    if (!entry.isLive) continue;
    values.push(entry[type]);
  }
  values.sort((a, b) => b - a);
  const top = topDecile(values);
  return { status: classify(top), topScore: top };
}

export function computeCityOutlook(scores: LiveScoresMap): CityOutlook {
  let isLive = false;
  for (const entry of scores.values()) {
    if (entry.isLive) {
      isLive = true;
      break;
    }
  }

  return {
    sunrise: entryFor(scores, 'sunrise'),
    sunset: entryFor(scores, 'sunset'),
    stargazing: entryFor(scores, 'stargazing'),
    isLive,
  };
}

/**
 * Citywide outlook commentary. Karl voice for SF, neutral for Austin.
 */
export function outlookMessage(type: ScoreType, status: OutlookStatus, city: City = 'sf'): string {
  if (city === 'austin') return atxOutlookMessage(type, status);
  switch (status) {
    case 'good':
      switch (type) {
        case 'sunrise':
          return 'Karl slept in. Sunrise is wide open.';
        case 'sunset':
          return "Karl's off the clock. Get out there.";
        case 'stargazing':
          return 'Karl went home. Stars are out.';
        default: {
          const _exhaustive: never = type;
          throw new Error(`Unhandled score type: ${String(_exhaustive)}`);
        }
      }
    case 'mixed':
      switch (type) {
        case 'sunrise':
          return "Karl's half awake. Check the hilltops.";
        case 'sunset':
          return "Karl can't commit. Some spots are clear, some aren't.";
        case 'stargazing':
          return "Karl's lurking but there are gaps. Pick your spot carefully.";
        default: {
          const _exhaustive: never = type;
          throw new Error(`Unhandled score type: ${String(_exhaustive)}`);
        }
      }
    case 'poor':
      switch (type) {
        case 'sunrise':
          return "Karl pulled an all-nighter. Don't bother.";
        case 'sunset':
          return 'Karl chose violence. Maybe tomorrow.';
        case 'stargazing':
          return "Karl's everywhere. No stars tonight.";
        default: {
          const _exhaustive: never = type;
          throw new Error(`Unhandled score type: ${String(_exhaustive)}`);
        }
      }
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled outlook status: ${String(_exhaustive)}`);
    }
  }
}

function atxOutlookMessage(type: ScoreType, status: OutlookStatus): string {
  switch (status) {
    case 'good':
      switch (type) {
        case 'sunrise':
          return 'Clear skies this morning. Great conditions.';
        case 'sunset':
          return 'Wide open skies. Perfect sunset evening.';
        case 'stargazing':
          return 'Clear and dark tonight. Stars are out.';
        default: {
          const _exhaustive: never = type;
          throw new Error(`Unhandled score type: ${String(_exhaustive)}`);
        }
      }
    case 'mixed':
      switch (type) {
        case 'sunrise':
          return 'Partial cloud cover. Some spots clearer than others.';
        case 'sunset':
          return 'Mixed conditions. Check the western hilltops.';
        case 'stargazing':
          return 'Patchy clouds. Pick a darker spot carefully.';
        default: {
          const _exhaustive: never = type;
          throw new Error(`Unhandled score type: ${String(_exhaustive)}`);
        }
      }
    case 'poor':
      switch (type) {
        case 'sunrise':
          return 'Heavy cloud cover. Probably skip it.';
        case 'sunset':
          return 'Overcast. Maybe tomorrow.';
        case 'stargazing':
          return 'Too cloudy for stars tonight.';
        default: {
          const _exhaustive: never = type;
          throw new Error(`Unhandled score type: ${String(_exhaustive)}`);
        }
      }
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled outlook status: ${String(_exhaustive)}`);
    }
  }
}

export function statusLabel(status: OutlookStatus, city: City = 'sf'): string {
  if (city === 'austin') {
    switch (status) {
      case 'good': return 'Clear Skies';
      case 'mixed': return 'Mixed Conditions';
      case 'poor': return 'Overcast';
      default: {
        const _exhaustive: never = status;
        throw new Error(`Unhandled outlook status: ${String(_exhaustive)}`);
      }
    }
  }
  switch (status) {
    case 'good':
      return 'Karl-Free';
    case 'mixed':
      return "Karl's Lurking";
    case 'poor':
      return 'Karl Wins';
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled outlook status: ${String(_exhaustive)}`);
    }
  }
}
