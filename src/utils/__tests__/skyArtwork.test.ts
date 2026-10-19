import SunCalc from 'suncalc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSkyArtwork } from '../skyArtwork';
import type { HourlyForecast } from '../weather';

const CLEAR = { cloud: 10, cloudLow: 0, visibilityKm: 16 } as HourlyForecast;
const instant = new Date('2026-10-12T15:00:00Z');
afterEach(() => vi.restoreAllMocks());

describe('forecast sky impressions', () => {
  it('uses local sun altitude for daytime, golden hour, and night', () => {
    const sun = vi.spyOn(SunCalc, 'getPosition');
    for (const [altitude, kind] of [[0.5, 'day'], [0.1, 'golden-clear'], [-0.4, 'night']] as const) {
      sun.mockReturnValue({ altitude, azimuth: 0 });
      expect(getSkyArtwork(37.76, -122.51, instant, CLEAR).src).toBe(`/sky/${kind}.webp`);
    }
  });

  it('distinguishes clear, high-cloud, and overcast golden-hour forecasts', () => {
    vi.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: 0.01, azimuth: 0 });
    expect(getSkyArtwork(37.76, -122.51, instant, CLEAR).src).toBe('/sky/golden-clear.webp');
    expect(getSkyArtwork(37.76, -122.51, instant, { ...CLEAR, cloud: 40, cloudHigh: 40 }).src).toBe('/sky/golden.webp');
    for (const forecast of [{ ...CLEAR, cloud: 90 }, { ...CLEAR, cloudLow: 80 }, { ...CLEAR, visibilityKm: 0.5 }]) {
      expect(getSkyArtwork(37.76, -122.51, instant, forecast).src).toBe('/sky/golden-overcast.webp');
    }
    expect(getSkyArtwork(37.76, -122.51, instant, null).src).toBe('/sky/golden.webp');
    expect(getSkyArtwork(37.76, -122.51, instant, null).label).toContain('forecast conditions unavailable');
  });

  it('uses cloudy imagery for low clouds, overcast skies, or fog, including at night', () => {
    const sun = vi.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: 0.5, azimuth: 0 });
    for (const forecast of [{ ...CLEAR, cloud: 90 }, { ...CLEAR, cloudLow: 80 }, { ...CLEAR, visibilityKm: 0.5 }]) {
      expect(getSkyArtwork(37.76, -122.51, instant, forecast).src).toBe('/sky/overcast.webp');
    }
    sun.mockReturnValue({ altitude: -0.4, azimuth: 0 });
    expect(getSkyArtwork(37.76, -122.51, instant, { ...CLEAR, cloud: 90 }).src).toBe('/sky/night-overcast.webp');
  });

  it('identifies unavailable forecast conditions without claiming a camera image', () => {
    vi.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: -0.4, azimuth: 0 });
    expect(getSkyArtwork(37.76, -122.51, instant, null).label).toBe('Illustrative night sky, forecast conditions unavailable');
  });
  it('keeps the illustration compatible with a colorful-cloud forecast', () => {
    vi.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: 0, azimuth: 0 });
    expect(getSkyArtwork(37.76, -122.51, instant, { ...CLEAR, cloud: 96, cloudHigh: 96 }, 'colorful-clouds').src).toBe('/sky/golden.webp');
  });
  it('keeps twilight visibly distinct from a star-filled night', () => {
    vi.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: -0.12, azimuth: 0 });
    for (const scene of ['blue-twilight', 'afterglow'] as const) {
      const art = getSkyArtwork(37.76, -122.51, instant, CLEAR, scene);
      expect(art.src).toBe('/sky/twilight.png');
      expect(art.label).toBe('Illustrative twilight sky');
    }
  });

});
