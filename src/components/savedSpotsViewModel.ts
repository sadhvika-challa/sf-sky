import { CITIES } from '../data/cities';
import type { City, Spot } from '../data/spots';

export interface SavedSpotGroup {
  cityId: City;
  cityName: string;
  spots: Spot[];
}

export function groupSavedSpots(
  spots: readonly Spot[],
  savedSpotIds: readonly string[],
): SavedSpotGroup[] {
  const savedIds = new Set(savedSpotIds);
  return CITIES.flatMap((city) => {
    const citySpots = spots.filter((spot) => spot.city === city.id && savedIds.has(spot.id));
    return citySpots.length > 0
      ? [{ cityId: city.id, cityName: city.name, spots: citySpots }]
      : [];
  });
}
