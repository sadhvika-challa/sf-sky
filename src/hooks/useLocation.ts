import { useMemo, useSyncExternalStore } from 'react';
import {
  browserLocationProvider,
  LocationProviderError,
  type LocationProvider,
  type LocationRequestOptions,
} from '../platform/location';
import type { LocatedUser } from '../utils/geo';

export type LocationState =
  | { status: 'not-requested' }
  | { status: 'requesting' }
  | { status: 'allowed'; location: LocatedUser }
  | { status: 'denied' }
  | { status: 'timeout' }
  | { status: 'unavailable' }
  | { status: 'unsupported' };

export interface UseLocationResult {
  state: LocationState;
  request: (options?: LocationRequestOptions) => Promise<LocationState>;
  retry: (options?: LocationRequestOptions) => Promise<LocationState>;
}

function stateForFailure(error: unknown): LocationState {
  if (error instanceof LocationProviderError) return { status: error.reason };
  return { status: 'unavailable' };
}

type LocationListener = () => void;

export class LocationController {
  private state: LocationState = { status: 'not-requested' };
  private latestRequest = 0;
  private readonly listeners = new Set<LocationListener>();
  private readonly provider: LocationProvider;

  constructor(provider: LocationProvider) {
    this.provider = provider;
  }

  getSnapshot = (): LocationState => this.state;

  subscribe = (listener: LocationListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(state: LocationState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  async request(options?: LocationRequestOptions): Promise<LocationState> {
    const requestId = ++this.latestRequest;
    if (!this.provider.isSupported()) {
      const unsupported: LocationState = { status: 'unsupported' };
      this.publish(unsupported);
      return unsupported;
    }

    this.publish({ status: 'requesting' });
    try {
      const location = await this.provider.request(options);
      const allowed: LocationState = { status: 'allowed', location };
      if (requestId === this.latestRequest) this.publish(allowed);
      return allowed;
    } catch (error) {
      const failed = stateForFailure(error);
      if (requestId === this.latestRequest) this.publish(failed);
      return failed;
    }
  }

  retry(options?: LocationRequestOptions): Promise<LocationState> {
    return this.request(options);
  }
}

/**
 * Location is privacy-gated. Merely rendering this hook never invokes the
 * provider. The first provider call can only originate from request/retry.
 */
export function useLocation(
  provider: LocationProvider = browserLocationProvider,
): UseLocationResult {
  const controller = useMemo(() => new LocationController(provider), [provider]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return {
    state,
    request: (options) => controller.request(options),
    retry: (options) => controller.retry(options),
  };
}
