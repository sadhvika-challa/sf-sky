import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import HomeSheet from '../HomeSheet';

describe('HomeSheet', () => {
  it('keeps a located city mismatch explicit and reversible', () => {
    const html = renderToStaticMarkup(
      <HomeSheet
        locationState={{
          status: 'allowed',
          location: {
            lat: 30.27,
            lng: -97.74,
            accuracyMeters: 20,
            precision: 'precise',
            capturedAt: 1,
          },
        }}
        onRequestLocation={vi.fn()}
        onChooseCity={vi.fn()}
        onUseCityInstead={vi.fn()}
        scopeNotice={{
          kind: 'city-mismatch',
          activeCityName: 'San Francisco',
          suggestedCityName: 'Austin',
          onUseSuggestedCity: vi.fn(),
          onKeepCurrentCity: vi.fn(),
        }}
        recommendation={<p>should not render</p>}
      />,
    );
    expect(html).toContain('Spots nearby are in Austin');
    expect(html).toContain('Soleil will switch only if you choose to.');
    expect(html).toContain('Switch to Austin');
    expect(html).toContain('Keep San Francisco');
    expect(html).not.toContain('should not render');
  });

  it('suggests coverage without claiming the map switched', () => {
    const html = renderToStaticMarkup(
      <HomeSheet
        locationState={{
          status: 'allowed',
          location: {
            lat: 34.05,
            lng: -118.24,
            accuracyMeters: 1_000,
            precision: 'approximate',
            capturedAt: 1,
          },
        }}
        onRequestLocation={vi.fn()}
        onChooseCity={vi.fn()}
        onUseCityInstead={vi.fn()}
        scopeNotice={{
          kind: 'outside-coverage',
          suggestedCityName: 'Santa Cruz',
          suggestionDistance: '295 mi',
          onUseSuggestedCity: vi.fn(),
        }}
      />,
    );
    expect(html).toContain('Outside Soleil coverage');
    expect(html).toContain('nearest supported city is Santa Cruz, 295 mi away');
    expect(html).toContain('Your location did not change the map.');
    expect(html).toContain('Browse Santa Cruz');
    expect(html).toContain('Choose a city');
  });
});
