import type { Spot } from '../data/spots';
import type { LiveScoresMap } from '../hooks/useTimelineScores';
import type { ScoreEvidence } from './confidence';
import type { SkyWindow } from './skyExperience';

export interface RankedSkySpot {
  spot: Spot;
  score: number;
  sky: SkyWindow;
  evidence: ScoreEvidence;
}

/** All rows use the map's shared instant and the spot's own fresh forecast. */
export function rankSkySpots(spots: readonly Spot[], scores: LiveScoresMap, errors: ReadonlyMap<string, Error> = new Map()): RankedSkySpot[] {
  return spots.flatMap(spot => {
    const live = scores.get(spot.id);
    const evidence = live?.activeEvidence;
    if (errors.has(spot.id) || !live || !Number.isFinite(live.active) || !live.sky || !evidence ||
        evidence.provenance !== 'forecast' || evidence.completeness !== 'complete' ||
        (evidence.freshness !== 'fresh' && evidence.freshness !== 'aging')) return [];
    return [{ spot, score: live.active, sky: live.sky, evidence }];
  }).sort((a, b) => b.score - a.score || b.sky.durationMinutes - a.sky.durationMinutes ||
    a.spot.name.localeCompare(b.spot.name));
}
