import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import WeatherOverlayStatus from '../WeatherOverlayStatus';
import {
  formatWeatherMapLocalTime,
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
        cityName="San Francisco"
        timeZone="America/Los_Angeles"
        now={new Date('2026-08-31T01:30:00Z')}
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

  it('summarizes city-local time, fixed range, coverage, and average without raw UTC', () => {
    const summary = weatherMapSummary(
      'San Francisco',
      'America/Los_Angeles',
      'wind',
      '2026-08-31T01:00:00Z',
      new Date('2026-08-31T01:30:00Z'),
      9,
      25,
      7.4,
    );
    expect(summary).toBe(
      'San Francisco weather map for wind on Today · 6:00 PM PDT. Fixed range 0 mph to 30 mph. Usable coverage 9 of 25 areas. Visible-area average 7 mph.',
    );
    expect(summary).not.toContain('2026-08-31T01:00:00Z');
  });

  it('distinguishes both repeated DST hours by city-zone abbreviation', () => {
    const now = new Date('2026-11-01T12:00:00Z');
    expect(formatWeatherMapLocalTime(
      '2026-11-01T08:00:00Z', 'America/Los_Angeles', now,
    )).toBe('Today · 1:00 AM PDT');
    expect(formatWeatherMapLocalTime(
      '2026-11-01T09:00:00Z', 'America/Los_Angeles', now,
    )).toBe('Today · 1:00 AM PST');
  });
});
