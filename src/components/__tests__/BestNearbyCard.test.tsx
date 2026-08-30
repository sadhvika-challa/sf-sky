import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import BestNearbyCard, { type BestNearbyCandidate } from '../BestNearbyCard';

const candidates: BestNearbyCandidate[] = [
  {
    id: 'ocean-beach',
    name: 'Ocean Beach',
    score: 91,
    confidence: 'High',
    lastUpdatedLabel: 'Updated 8 min ago',
    distance: '2.1 mi',
    forecastBacked: true,
    comparable: true,
    approximateDistance: true,
    accessWarning: 'Parking lot closes at 10 PM',
  },
  {
    id: 'lands-end',
    name: 'Lands End',
    score: 87,
    confidence: 'Medium',
    lastUpdatedLabel: 'Updated 11 min ago',
    distance: '3.4 mi',
    forecastBacked: true,
    comparable: true,
    fartherFallback: true,
  },
];

type ReadyProps = Extract<React.ComponentProps<typeof BestNearbyCard>, { state: 'ready' }>;

function ready(overrides: Partial<Omit<ReadyProps, 'state'>> = {}) {
  return renderToStaticMarkup(
    <BestNearbyCard
      state="ready"
      claimKind="best-nearby-now"
      cityName="San Francisco"
      comparedCount={2}
      winner={candidates[0]}
      candidates={candidates}
      onSelectSpot={vi.fn()}
      {...overrides}
    />,
  );
}

describe('BestNearbyCard', () => {
  it('names a winner only with at least two comparable forecast-backed candidates', () => {
    const html = ready();
    expect(html).toContain('Best nearby now');
    expect(html).toContain('2 spots checked');
    expect(html).toContain('<p class="mt-1 text-[10px] text-gray-600">San Francisco</p>');
    expect(html).toContain('aria-label="Open Ocean Beach, best nearby now. score 91 out of 100. High data confidence. Updated 8 min ago. approximate 2.1 mi. access check needed"');
    expect(html).toContain('We rank stronger current scores first. Distance breaks exact score ties.');
    expect(html).not.toContain('Check access before you go.');

    const unsupported = { ...candidates[1], forecastBacked: false };
    const guarded = ready({ candidates: [candidates[0], unsupported] });
    expect(guarded).not.toContain('Best nearby now');
    expect(guarded).not.toContain('Top result');
    expect(guarded).toContain('not enough current forecast evidence');
  });

  it.each([
    ['insufficient-evidence' as const, 'Nearby estimates', 'not enough current forecast evidence'],
    ['no-supported-spots' as const, 'No supported spots nearby', 'do not have forecast-backed spots'],
  ])('keeps the %s state honest', (state, heading, copy) => {
    const html = renderToStaticMarkup(
      <BestNearbyCard
        state={state}
        claimKind="best-nearby-now"
        cityName="San Francisco"
        comparedCount={0}
        candidates={[]}
        onSelectSpot={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(html).toContain(heading);
    expect(html).toContain(copy);
    expect(html).toContain('>Try again</button>');
    expect(html).not.toContain('Best nearby now');
  });

  it('announces loading politely without showing ranking or access controls', () => {
    const html = renderToStaticMarkup(
      <BestNearbyCard
        state="loading"
        claimKind="best-nearby-now"
        cityName="San Francisco"
        comparedCount={0}
        candidates={[]}
        onSelectSpot={vi.fn()}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Comparing current forecast evidence near you in San Francisco…');
    expect(html).not.toContain('Best nearby now');
    expect(html).not.toContain('How spots are ranked');
  });

  it('renders at most three selectable candidates with textual distance and evidence cues', () => {
    const extra = (id: string): BestNearbyCandidate => ({ ...candidates[1], id, name: id });
    const html = ready({ candidates: [...candidates, extra('third'), extra('fourth')] });
    expect(html.match(/aria-label="Open /g)).toHaveLength(3);
    expect(html).toContain('Approx. </span>2.1 mi');
    expect(html).toContain('Farther option');
    expect(html).toContain('>Access check needed</summary>');
    expect(html).toContain('<p class="pb-2">Curated note, details may change: Parking lot closes at 10 PM</p>');
    expect(html).toContain('min-h-11');
    expect(html).not.toContain('fourth');
  });

  it('presents each candidate as a distinct selectable card with a clear winner state', () => {
    const html = ready();

    expect(html).toContain('class="mt-2 grid gap-2"');
    expect(html).toContain('data-recommendation-candidate="ocean-beach" data-winner="true"');
    expect(html).toContain('data-recommendation-candidate="lands-end" data-winner="false"');
    expect(html.match(/>View spot<\/span>/g)).toHaveLength(2);
    expect(html).toContain('rounded-full bg-[#8B5E3C]');
    expect(html).toContain('flex flex-col items-start gap-1');
  });

  it('does not present a curated fallback as a current score when forecast retrieval fails', () => {
    const unavailable: BestNearbyCandidate = {
      ...candidates[1],
      score: null,
      confidence: 'Low',
      lastUpdatedLabel: 'Forecast not retrieved',
      forecastBacked: false,
      comparable: false,
    };
    const html = ready({ candidates: [candidates[0], unavailable] });

    expect(html).toContain('aria-label="Current score unavailable"');
    expect(html).toContain('current score unavailable. Low data confidence. Forecast not retrieved. 3.4 mi. farther option');
    expect(html).toContain('>—</span>');
    expect(html).not.toContain('Score 87');
    expect(html).not.toContain('>87</span>');
  });

  it('uses checked-city claims without implying that the city fallback is nearby', () => {
    const cityResult = ready({ claimKind: 'best-of-checked', cityName: 'Austin' });
    expect(cityResult).toContain('Best of the spots checked');
    expect(cityResult).toContain('<p class="mt-1 text-[10px] text-gray-600">Austin</p>');
    expect(cityResult).toContain('High data confidence');
    expect(cityResult).toContain('aria-label="Open Ocean Beach, best of the spots checked. score 91 out of 100. High data confidence. Updated 8 min ago. approximate 2.1 mi. access check needed"');
    expect(cityResult).not.toMatch(/nearby/i);

    const unsupported = { ...candidates[1], forecastBacked: false };
    const cityFallback = ready({
      claimKind: 'best-of-checked',
      cityName: 'Austin',
      candidates: [candidates[0], unsupported],
    });
    expect(cityFallback).toContain('City outlook');
    expect(cityFallback).toContain('compare spots in Austin');
    expect(cityFallback).not.toContain('Best of the spots checked');
    expect(cityFallback).not.toMatch(/nearby/i);
  });
});
