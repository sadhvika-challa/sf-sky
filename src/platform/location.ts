import { precisionForAccuracy, type LocatedUser } from '../utils/geo';

export type LocationFailureReason = 'denied' | 'timeout' | 'unavailable';

export class LocationProviderError extends Error {
  readonly reason: LocationFailureReason;

  constructor(
    reason: LocationFailureReason,
    message?: string,
  ) {
    super(message ?? reason);
    this.name = 'LocationProviderError';
    this.reason = reason;
  }
}

export interface LocationRequestOptions {
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
  maximumAgeMs?: number;
}

export interface LocationProvider {
  isSupported(): boolean;
  request(options?: LocationRequestOptions): Promise<LocatedUser>;
}

function normalizeAccuracy(accuracy: number): number | null {
  return Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null;
}

function geolocationErrorReason(code: number): LocationFailureReason {
  if (code === 1) return 'denied';
  if (code === 3) return 'timeout';
  return 'unavailable';
}

export function createBrowserLocationProvider(
  getNavigator: () => Navigator | undefined = () =>
    typeof navigator === 'undefined' ? undefined : navigator,
): LocationProvider {
  return {
    isSupported() {
      return Boolean(getNavigator()?.geolocation);
    },
    request(options = {}) {
      const geolocation = getNavigator()?.geolocation;
      if (!geolocation) {
        return Promise.reject(new LocationProviderError('unavailable', 'Location is unsupported.'));
      }

      return new Promise((resolve, reject) => {
        geolocation.getCurrentPosition(
          (position) => {
            const accuracyMeters = normalizeAccuracy(position.coords.accuracy);
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracyMeters,
              precision: precisionForAccuracy(accuracyMeters),
              capturedAt: position.timestamp,
            });
          },
          (error) => {
            reject(new LocationProviderError(geolocationErrorReason(error.code), error.message));
          },
          {
            enableHighAccuracy: options.enableHighAccuracy ?? true,
            timeout: options.timeoutMs ?? 10_000,
            maximumAge: options.maximumAgeMs ?? 0,
          },
        );
      });
    },
  };
}

export const browserLocationProvider = createBrowserLocationProvider();
