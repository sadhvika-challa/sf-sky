export interface UserLocation {
  lat: number;
  lng: number;
}

export type LocationPrecision = 'precise' | 'approximate' | 'unknown';

export interface LocatedUser extends UserLocation {
  accuracyMeters: number | null;
  precision: LocationPrecision;
  capturedAt: number;
}

/**
 * Web browsers do not expose the iOS reduced-accuracy flag. An accuracy
 * radius at or below 100 metres is useful for nearby ranking, while a wider
 * radius must be described as approximate rather than implying exactness.
 */
export function precisionForAccuracy(accuracyMeters: number | null): LocationPrecision {
  if (accuracyMeters === null || !Number.isFinite(accuracyMeters) || accuracyMeters < 0) {
    return 'unknown';
  }
  return accuracyMeters <= 100 ? 'precise' : 'approximate';
}

/** Haversine distance in miles. */
export function getDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const earthRadiusMiles = 3958.8;
  const degreesToRadians = Math.PI / 180;
  const dLat = (lat2 - lat1) * degreesToRadians;
  const dLng = (lng2 - lng1) * degreesToRadians;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * degreesToRadians) *
      Math.cos(lat2 * degreesToRadians) *
      Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
