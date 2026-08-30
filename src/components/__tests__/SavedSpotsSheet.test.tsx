import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Spot } from '../../data/spots';
import FilterMenu from '../FilterMenu';
import SavedSpotsSheet from '../SavedSpotsSheet';
import { groupSavedSpots } from '../savedSpotsViewModel';

const SPOTS: Spot[] = [
  {
    id: 'sf-ocean-beach',
    name: 'Ocean Beach',
    city: 'sf',
    lat: 37.7594,
    lng: -122.5107,
    category: 'beach',
    elevation: 3,
    lightPollution: 'Low',
    horizonQuality: 'Open',
    sunrise: 25,
    sunset: 95,
    stargazing: 55,
  },
  {
    id: 'austin-mount-bonnell',
    name: 'Mount Bonnell',
    city: 'austin',
    lat: 30.321,
    lng: -97.773,
    category: 'hill',
    elevation: 236,
    lightPollution: 'Mid',
    horizonQuality: 'Open',
    sunrise: 80,
    sunset: 88,
    stargazing: 60,
  },
];

function render(
  overrides: Partial<React.ComponentProps<typeof SavedSpotsSheet>> = {},
): string {
  return renderToStaticMarkup(
    <SavedSpotsSheet
      open
      onClose={vi.fn()}
      spots={SPOTS}
      savedSpotIds={[]}
      status="ready"
      error={null}
      onSelectSpot={vi.fn()}
      onUnsave={vi.fn(async () => true)}
      onRetry={vi.fn(async () => undefined)}
      {...overrides}
    />,
  );
}

describe('SavedSpotsSheet', () => {
  it('exposes the all-city collection and count from Settings', () => {
    const html = renderToStaticMarkup(
      <FilterMenu
        open
        filters={{ sunrise: [], sunset: [], stargazing: [], now: [], category: [] }}
        onChange={vi.fn()}
        onReset={vi.fn()}
        onResetCategory={vi.fn()}
        onClose={vi.fn()}
        liveScores={new Map()}
        onSuggestSpot={vi.fn()}
        onReportBug={vi.fn()}
        city="sf"
        homeCityId="sf"
        onOpenCitySheet={vi.fn()}
        savedSpotsCount={2}
        onOpenSavedSpots={vi.fn()}
      />,
    );
    expect(html).toContain('aria-label="Saved spots, 2"');
    expect(html).toContain('>2</span>');
  });

  it('groups saved catalog spots by city without attaching rankings', () => {
    expect(groupSavedSpots(SPOTS, ['austin-mount-bonnell', 'sf-ocean-beach'])).toEqual([
      { cityId: 'sf', cityName: 'San Francisco', spots: [SPOTS[0]] },
      { cityId: 'austin', cityName: 'Austin', spots: [SPOTS[1]] },
    ]);

    const html = render({ savedSpotIds: ['austin-mount-bonnell', 'sf-ocean-beach'] });
    expect(html).toContain('San Francisco');
    expect(html).toContain('Austin');
    expect(html).toContain('aria-label="Open Ocean Beach"');
    expect(html).toContain('aria-label="Remove Mount Bonnell from saved spots"');
    expect(html).not.toMatch(/score|ranking/i);
  });

  it('explains device-only persistence and offers an actionable empty state', () => {
    const html = render();
    expect(html).toContain('Saves stay on this device. They do not sync to other devices.');
    expect(html).toContain('No saved spots yet');
    expect(html).toContain('Open any spot and use its save button.');
    expect(html).toContain('spot catalog is built into Soleil');
    expect(html).toContain('Live weather and map tiles need a connection');
  });

  it('renders loading and retriable read failure states honestly', () => {
    expect(render({ status: 'loading' })).toContain('Loading saved spots…');

    const failed = render({ status: 'error', error: 'read-failed' });
    expect(failed).toContain('Saved spots could not be read.');
    expect(failed).toContain('keep browsing every city');
    expect(failed).toContain('>Retry</button>');
    expect(failed).not.toContain('No saved spots yet');
  });

  it('distinguishes failed durability from success and preserves the durable list', () => {
    const html = render({
      status: 'error',
      error: 'write-failed',
      savedSpotIds: ['sf-ocean-beach'],
    });
    expect(html).toContain('The last change was not saved on this device.');
    expect(html).toContain('Your durable saved list is shown below.');
    expect(html).toContain('Ocean Beach');
    expect(html).not.toContain('>Retry</button>');
  });

  it('protects future-version data without offering a destructive retry', () => {
    const html = render({ status: 'protected', error: 'future-version' });
    expect(html).toContain('created by a newer version of Soleil');
    expect(html).toContain('protected from changes here');
    expect(html).not.toContain('>Retry</button>');
    expect(html).not.toContain('No saved spots yet');
  });
});
