import type { Spot } from '../data/spots';
import { getCityById } from '../data/cities';
import type { KeyValueStore } from '../platform/storage';

export const PRIVATE_SPOTS_STORAGE_KEY = 'soleil:private-spots:v1';
export type PrivateSpot = Spot & { visibility: 'private' };

interface PrivateSpotsRecord {
  version: 1;
  spots: PrivateSpot[];
}

export function isPrivateSpot(value: unknown): value is PrivateSpot {
  if (!value || typeof value !== 'object') return false;
  const spot = value as PrivateSpot;
  return typeof spot.id === 'string' && /^private:[a-z0-9-]+$/.test(spot.id) &&
    typeof spot.name === 'string' && spot.name.trim().length > 0 &&
    spot.visibility === 'private' && !!getCityById(spot.city) &&
    Number.isFinite(spot.lat) && Math.abs(spot.lat) <= 90 &&
    Number.isFinite(spot.lng) && Math.abs(spot.lng) <= 180 &&
    ['hill', 'beach', 'coastal-bluff', 'park', 'skyscraper', 'waterfront'].includes(spot.category) &&
    Number.isFinite(spot.elevation) && spot.elevation >= 0 &&
    ['Low', 'Mid', 'High'].includes(spot.lightPollution) &&
    ['Open', 'Partial', 'Blocked'].includes(spot.horizonQuality) &&
    [spot.sunrise, spot.sunset, spot.stargazing].every((score) => Number.isFinite(score) && score >= 0 && score <= 100) &&
    (spot.address === undefined || typeof spot.address === 'string');
}

export function parsePrivateSpots(raw: string | null): PrivateSpot[] {
  if (!raw) return [];
  const record = JSON.parse(raw) as PrivateSpotsRecord;
  if (record.version !== 1 || !Array.isArray(record.spots) || !record.spots.every(isPrivateSpot)) {
    throw new Error('Private spots could not be read. Stored data was preserved.');
  }
  return record.spots;
}

export async function addPrivateSpots(store: KeyValueStore, spots: readonly PrivateSpot[]): Promise<PrivateSpot[]> {
  if (!spots.every(isPrivateSpot)) throw new Error('Invalid private spot.');
  return store.update(PRIVATE_SPOTS_STORAGE_KEY, (raw) => {
    const existing = parsePrivateSpots(raw);
    const byId = new Map(existing.map((spot) => [spot.id, spot]));
    for (const spot of spots) if (!byId.has(spot.id)) byId.set(spot.id, spot);
    const result = [...byId.values()];
    return { value: JSON.stringify({ version: 1, spots: result }), result };
  });
}

// Neighborhood weather does not require a private spot's precise coordinates.
export function forecastCoordinates(spot: Spot): { lat: number; lng: number } {
  return spot.visibility === 'private'
    ? { lat: Number(spot.lat.toFixed(2)), lng: Number(spot.lng.toFixed(2)) }
    : { lat: spot.lat, lng: spot.lng };
}
