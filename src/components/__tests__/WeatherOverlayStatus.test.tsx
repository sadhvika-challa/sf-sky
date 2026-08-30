import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import WeatherOverlayStatus from '../WeatherOverlayStatus';
import {
  getWeatherOverlayPresentation,
  weatherMapSummary,
} from '../weatherOverlayStatusModel';

describe('WeatherOverlayStatus', () => {
  it('shows healthy progressive coverage without exposing Retry', () => {
    const presentation = getWeatherOverlayPresentation('progressive', 12, 25, null);
    expect(presentation).toMatchObject({ canRetry: false });
    expect(presentation?.visual).toContain('12 of 25');
    expect(presentation?.announcement).not.toContain('12 of 25');

    const html = renderToStaticMarkup(
      <WeatherOverlayStatus
        phase="progressive"
        loaded={12}
        total={25}
        errorKind={null}
        retry={vi.fn()}
        metric="temp"
        hourKey="2026-08-31T01:00:00Z"
        visibleAverage={62}
      />,
    );
    expect(html).not.toContain('>Retry<');
    expect(html).toContain('role="status"');
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
  });

  it('exposes Retry only for a settled degraded generation', () => {
    expect(getWeatherOverlayPresentation('partial', 18, 25, 'rate-limit'))
      .toMatchObject({ canRetry: true });
    expect(getWeatherOverlayPresentation('loading', 8, 25, null))
      .toMatchObject({ canRetry: false });
  });

  it('summarizes metric, canonical hour, fixed range, coverage, and average', () => {
    expect(weatherMapSummary('wind', '2026-08-31T01:00:00Z', 9, 25, 7.4)).toBe(
      'Weather map for wind at 2026-08-31T01:00:00Z. Fixed range 0 mph to 30 mph. Usable coverage 9 of 25 areas. Visible-area average 7 mph.',
    );
  });
});
