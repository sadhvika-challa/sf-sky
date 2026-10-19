import type { Spot } from '../data/spots';

interface Bounds { north: number; south: number; east: number; west: number }

/** Fetch one hourly forecast per visible spot, with the selected spot first.
 * Scrubbing changes the hour read from these snapshots, not request targets.
 */
export function selectForecastTargets(spots: readonly Spot[], bounds: Bounds | null,
  selectedId: string | undefined, regionalId: string, recommendationIds: readonly string[] = []): string[] {
  const visible = bounds ? spots.filter(spot => spot.lat >= bounds.south && spot.lat <= bounds.north &&
    spot.lng >= bounds.west && spot.lng <= bounds.east).map(spot => spot.id) : [];
  return [...new Set([...(selectedId ? [selectedId] : []), regionalId, ...recommendationIds, ...visible])];
}
