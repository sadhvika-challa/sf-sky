import type { Spot, SpotCategory } from '../data/spots';
import type { Filters } from '../App';
import type { LiveScoresMap } from '../hooks/useTimelineScores';
import { getScoreTier, type ScoreTier } from './scoring';

// Tier-bucket filter. An empty (or full) selection for an event means "no
// constraint", the user is opting out of filtering that event rather than
// asking for an empty result set. Otherwise the spot's live tier for that
// event must be in the selected bucket.
function tierAllows(score: number, allowed: ScoreTier[]): boolean {
  if (allowed.length === 0 || allowed.length === 5) return true;
  return allowed.includes(getScoreTier(score));
}

// Category filter. Same "empty = unfiltered" convention as tierAllows:
// deselecting all chips shows every spot, not zero spots. A full
// selection (all 6 known values) short-circuits the includes check.
function categoryAllows(category: SpotCategory, allowed: SpotCategory[]): boolean {
  if (allowed.length === 0 || allowed.length === 6) return true;
  return allowed.includes(category);
}

export function passesSpotFilter(spot: Spot, filters: Filters, liveScores: LiveScoresMap): boolean {
  const scores = liveScores.get(spot.id);
  const sunrise = scores?.sunrise ?? spot.sunrise;
  const sunset = scores?.sunset ?? spot.sunset;
  const stargazing = scores?.stargazing ?? spot.stargazing;
  return (
    tierAllows(sunrise, filters.sunrise) &&
    tierAllows(sunset, filters.sunset) &&
    tierAllows(stargazing, filters.stargazing) &&
    categoryAllows(spot.category, filters.category)
  );
}
