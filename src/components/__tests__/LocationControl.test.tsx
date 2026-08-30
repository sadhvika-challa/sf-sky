import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { LocationState } from '../../hooks/useLocation';
import LocationControl from '../LocationControl';

function render(state: LocationState): string {
  return renderToStaticMarkup(
    <LocationControl
      state={state}
      onRequest={vi.fn()}
      onChooseCity={vi.fn()}
      onUseCityInstead={vi.fn()}
    />,
  );
}

describe('LocationControl', () => {
  it('offers an explicit, accessible opt-in with privacy and benefit copy', () => {
    const html = render({ status: 'not-requested' });
    expect(html).toContain('aria-label="Location preferences"');
    expect(html).toContain('role="status"');
    expect(html).toContain('See the best sky-viewing spots near you right now. Your coordinates are never saved.');
    expect(html).toContain('Use my location');
    expect(html).toContain('Choose a city');
  });

  it.each([
    [{ status: 'denied' }, 'Location access was denied.', true],
    [{ status: 'timeout' }, 'Location timed out.', true],
    [{ status: 'unavailable' }, 'Location is unavailable right now.', true],
    [{ status: 'unsupported' }, 'This browser does not support location.', false],
  ] as const)('renders honest %s recovery copy', (state, message, hasRetry) => {
    const html = render(state);
    expect(html).toContain(message);
    expect(html.includes('>Retry</button>')).toBe(hasRetry);
    expect(html).toContain('browsing by city');
    expect(html).toContain('Choose a city');
  });

  it('labels approximate location and distances while allowing retry', () => {
    const html = render({
      status: 'allowed',
      location: {
        lat: 37.75,
        lng: -122.44,
        accuracyMeters: 2_000,
        precision: 'approximate',
        capturedAt: 1,
      },
    });
    expect(html).toContain('Using approximate location. Distances are approximate.');
    expect(html).toContain('>Retry</button>');
    expect(html).toContain('Use city instead');
  });

  it('confirms precise location without a retry action', () => {
    const html = render({
      status: 'allowed',
      location: {
        lat: 37.75,
        lng: -122.44,
        accuracyMeters: 20,
        precision: 'precise',
        capturedAt: 1,
      },
    });
    expect(html).toContain('Using your precise location. Nearby distances are ready.');
    expect(html).not.toContain('>Retry</button>');
    expect(html).not.toContain('Choose a city');
    expect(html).toContain('Use city instead');
  });
});
