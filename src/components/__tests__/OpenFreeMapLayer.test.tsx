import { renderToStaticMarkup } from 'react-dom/server';
import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('react-leaflet', () => ({ useMap: vi.fn() }));
vi.mock('@maplibre/maplibre-gl-leaflet', () => ({}));

import {
  MAP_BACKGROUND_ATTEMPT_TIMEOUT_MS,
  MAP_BACKGROUND_ERROR_THRESHOLD,
  MAP_BACKGROUND_RESTORED_NOTICE_MS,
  MapBackgroundStatus,
  OPEN_FREE_MAP_STYLES,
  prepareOpenFreeMapStyle,
} from '../OpenFreeMapLayer';

const STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: 'water', type: 'fill', source: 'openmaptiles' },
    { id: 'road-label', type: 'symbol', source: 'openmaptiles' },
    { id: 'road', type: 'line', source: 'openmaptiles' },
  ],
};

describe('OpenFreeMapLayer', () => {
  it('uses official OpenFreeMap styles and a bounded attempt', () => {
    expect(OPEN_FREE_MAP_STYLES).toEqual({
      explore: 'https://tiles.openfreemap.org/styles/liberty',
      weather: 'https://tiles.openfreemap.org/styles/positron',
    });
    expect(MAP_BACKGROUND_ATTEMPT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(MAP_BACKGROUND_ATTEMPT_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
    expect(MAP_BACKGROUND_ERROR_THRESHOLD).toBeGreaterThan(1);
    expect(MAP_BACKGROUND_RESTORED_NOTICE_MS).toBeGreaterThan(0);
    expect(MAP_BACKGROUND_RESTORED_NOTICE_MS).toBeLessThanOrEqual(5_000);
  });

  it('removes symbol layers only in weather mode', () => {
    const weatherStyle = prepareOpenFreeMapStyle(STYLE, true);
    expect(weatherStyle.layers.map((layer) => layer.id)).toEqual(['water', 'road']);
    expect(prepareOpenFreeMapStyle(STYLE, false)).toBe(STYLE);
    expect(STYLE.layers).toHaveLength(3);
  });

  it('offers truthful unavailable, retrying, and restored live states', () => {
    const unavailable = renderToStaticMarkup(
      <MapBackgroundStatus state="unavailable" onRetry={vi.fn()} />,
    );
    expect(unavailable).toContain('role="status"');
    expect(unavailable).toContain('aria-live="polite"');
    expect(unavailable).toContain('Spot details still work');
    expect(unavailable).toContain('weather will appear when its data loads');
    expect(unavailable).toContain('Retry map background');
    expect(unavailable).not.toContain('role="dialog"');

    const retrying = renderToStaticMarkup(
      <MapBackgroundStatus state="retrying" />,
    );
    expect(retrying).toContain('Retrying map background.');
    expect(retrying).toContain('aria-disabled="true"');
    expect(retrying).not.toContain('disabled=""');

    const restored = renderToStaticMarkup(
      <MapBackgroundStatus state="restored" />,
    );
    expect(restored).toContain('Map background restored.');
    expect(restored).not.toContain('<button');
  });
});
