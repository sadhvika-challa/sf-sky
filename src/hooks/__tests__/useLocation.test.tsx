import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { createBrowserLocationProvider, LocationProviderError, type LocationProvider } from '../../platform/location';
import { LocationController, useLocation, type UseLocationResult } from '../useLocation';

describe('useLocation privacy contract', () => {
  it('does not invoke the provider merely because the hook mounts', async () => {
    const provider: LocationProvider = {
      isSupported: vi.fn(() => true),
      request: vi.fn(async () => ({
        lat: 37.75,
        lng: -122.44,
        accuracyMeters: 20,
        precision: 'precise' as const,
        capturedAt: 1,
      })),
    };
    let result: UseLocationResult | undefined;

    function Harness() {
      result = useLocation(provider);
      return null;
    }

    const fakeWindow = {
      HTMLIFrameElement: function HTMLIFrameElement() {},
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      getSelection: () => null,
    };
    const fakeDocument = {
      nodeType: 9,
      defaultView: fakeWindow,
      documentElement: { namespaceURI: 'http://www.w3.org/1999/xhtml' },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    const container = {
      nodeType: 1,
      nodeName: 'DIV',
      tagName: 'DIV',
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      ownerDocument: fakeDocument,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(container as unknown as Element);

    try {
      await act(async () => root.render(<Harness />));
      expect(result?.state).toEqual({ status: 'not-requested' });
      expect(provider.isSupported).not.toHaveBeenCalled();
      expect(provider.request).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });

  it('moves through requesting and allowed while retaining accuracy evidence', async () => {
    let resolveLocation: ((location: Awaited<ReturnType<LocationProvider['request']>>) => void) | undefined;
    const provider: LocationProvider = {
      isSupported: () => true,
      request: () => new Promise((resolve) => { resolveLocation = resolve; }),
    };
    const controller = new LocationController(provider);
    const request = controller.request();
    expect(controller.getSnapshot()).toEqual({ status: 'requesting' });

    resolveLocation?.({
      lat: 36.9741,
      lng: -122.0308,
      accuracyMeters: 30,
      precision: 'precise',
      capturedAt: 456,
    });
    await request;
    expect(controller.getSnapshot()).toEqual({
      status: 'allowed',
      location: {
        lat: 36.9741,
        lng: -122.0308,
        accuracyMeters: 30,
        precision: 'precise',
        capturedAt: 456,
      },
    });
  });

  it('coalesces repeated activation while a location request is pending', async () => {
    let resolveLocation: ((location: Awaited<ReturnType<LocationProvider['request']>>) => void) | undefined;
    const provider: LocationProvider = {
      isSupported: () => true,
      request: vi.fn(() => new Promise<Awaited<ReturnType<LocationProvider['request']>>>((resolve) => {
        resolveLocation = resolve;
      })),
    };
    const controller = new LocationController(provider);

    const first = controller.request();
    const repeated = controller.request();
    expect(repeated).toBe(first);
    expect(provider.request).toHaveBeenCalledTimes(1);
    resolveLocation?.({
      lat: 37.75,
      lng: -122.44,
      accuracyMeters: 20,
      precision: 'precise',
      capturedAt: 1,
    });
    await Promise.all([first, repeated]);
    expect(controller.getSnapshot().status).toBe('allowed');
  });

  it.each([
    ['denied'],
    ['timeout'],
    ['unavailable'],
  ] as const)('represents %s and allows an explicit retry', async (reason) => {
    const provider: LocationProvider = {
      isSupported: () => true,
      request: vi.fn()
        .mockRejectedValueOnce(new LocationProviderError(reason))
        .mockResolvedValueOnce({
          lat: 41.8781,
          lng: -87.6298,
          accuracyMeters: null,
          precision: 'unknown',
          capturedAt: 789,
        }),
    };
    const controller = new LocationController(provider);

    await controller.request();
    expect(controller.getSnapshot()).toEqual({ status: reason });
    await controller.retry();
    expect(controller.getSnapshot().status).toBe('allowed');
    expect(provider.request).toHaveBeenCalledTimes(2);
  });

  it('represents unsupported without calling the provider', async () => {
    const provider: LocationProvider = {
      isSupported: () => false,
      request: vi.fn(),
    };
    const controller = new LocationController(provider);

    await expect(controller.request()).resolves.toEqual({ status: 'unsupported' });
    expect(controller.getSnapshot()).toEqual({ status: 'unsupported' });
    expect(provider.request).not.toHaveBeenCalled();
  });

  it('maps browser coordinates, accuracy, timestamp, and request options', async () => {
    const getCurrentPosition = vi.fn((
      success: PositionCallback,
      failure?: PositionErrorCallback | null,
      options?: PositionOptions,
    ) => {
      void failure;
      void options;
      success({
      coords: {
        latitude: 30.2672,
        longitude: -97.7431,
        accuracy: 1_500,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: 1234,
      toJSON: () => ({}),
      });
    });
    const provider = createBrowserLocationProvider(() => ({
      geolocation: { getCurrentPosition },
    } as unknown as Navigator));

    await expect(provider.request({
      enableHighAccuracy: false,
      timeoutMs: 4_000,
      maximumAgeMs: 2_000,
    })).resolves.toEqual({
      lat: 30.2672,
      lng: -97.7431,
      accuracyMeters: 1_500,
      precision: 'approximate',
      capturedAt: 1234,
    });
    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: false,
      timeout: 4_000,
      maximumAge: 2_000,
    });
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ] as const)('maps browser failure code %i to %s', async (code, reason) => {
    const provider = createBrowserLocationProvider(() => ({
      geolocation: {
        getCurrentPosition: (
          _success: PositionCallback,
          failure?: PositionErrorCallback | null,
        ) => failure?.({ code, message: reason } as GeolocationPositionError),
      },
    } as unknown as Navigator));

    const request = provider.request();
    await expect(request).rejects.toBeInstanceOf(LocationProviderError);
    await expect(request).rejects.toMatchObject({ reason });
  });

  it('exposes unsupported providers without attempting a request', async () => {
    const provider = createBrowserLocationProvider(() => undefined);
    expect(provider.isSupported()).toBe(false);
    const request = provider.request();
    await expect(request).rejects.toBeInstanceOf(LocationProviderError);
    await expect(request).rejects.toMatchObject({ reason: 'unavailable' });
  });
});
