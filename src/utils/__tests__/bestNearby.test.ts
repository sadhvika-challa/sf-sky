import { describe, expect, it } from 'vitest';
import type { City, Spot, SpotCategory } from '../../data/spots';
import type { CityConfig } from '../../data/cities';
import type { LiveSpotScores, LiveScoresMap } from '../../hooks/useLiveScores';
import type { ScoreEvidence } from '../confidence';
import {
  buildBestNearbyResult,
  buildManualCityBestResult,
  isComparableNowEvidence,
  rankBestNearbyCandidates,
  resolveBestNearbyCoverage,
  selectBestNearbyCandidates,
  selectManualCityCandidates,
  type BestNearbyCandidate,
} from '../bestNearby';

const MILES_PER_LONGITUDE_DEGREE_AT_EQUATOR = 69.093;

function spot(
  id: string,
  milesEast: number,
  city: City = 'sf',
  category: SpotCategory = 'park',
  lat = 0,
): Spot {
  return {
    id,
    name: id,
    lat,
    lng: milesEast / MILES_PER_LONGITUDE_DEGREE_AT_EQUATOR,
    city,
    category,
    elevation: 0,
    lightPollution: 'Mid',
    horizonQuality: 'Open',
    sunrise: 50,
    sunset: 50,
    stargazing: 50,
  };
}

function sfSpot(
  id: string,
  milesEast: number,
  category: SpotCategory = 'park',
): Spot {
  const latitude = 37.75;
  const milesPerLongitudeDegree = MILES_PER_LONGITUDE_DEGREE_AT_EQUATOR *
    Math.cos(latitude * Math.PI / 180);
  return {
    ...spot(id, 0, 'sf', category, latitude),
    lng: -122.45 + milesEast / milesPerLongitudeDegree,
  };
}

function evidence(overrides: Partial<ScoreEvidence> = {}): ScoreEvidence {
  return {
    provenance: 'forecast',
    freshness: 'fresh',
    completeness: 'complete',
    confidence: 'high',
    state: 'current-forecast',
    reason: 'none',
    fetchedAt: 1,
    statusLabel: 'Current forecast',
    retrievalLabel: 'Retrieved just now',
    provenanceLabel: 'Forecast',
    ...overrides,
  };
}

function live(now: number, nowEvidence = evidence()): LiveSpotScores {
  return {
    sunrise: 50,
    sunset: 50,
    stargazing: 50,
    now,
    isLive: true,
    evidence: {
      sunrise: nowEvidence,
      sunset: nowEvidence,
      stargazing: nowEvidence,
      now: nowEvidence,
    },
    active: now,
    activeIsLive: true,
    activeEvidence: nowEvidence,
  };
}

function scores(entries: Array<[string, number, ScoreEvidence?]>): LiveScoresMap {
  return new Map(entries.map(([id, value, scoreEvidence]) => [
    id,
    live(value, scoreEvidence),
  ]));
}

describe('selectBestNearbyCandidates', () => {
  it('scopes all candidates to the explicitly resolved city', () => {
    const selection = selectBestNearbyCandidates([
      spot('sf-near', 2, 'sf', 'park'),
      spot('sf-expanded', 12, 'sf', 'beach'),
      spot('austin-close', 3, 'austin', 'hill'),
    ], { lat: 0, lng: 0 }, 'sf');

    expect(selection.city).toBe('sf');
    expect(selection.candidates.map((candidate) => candidate.spot.id)).toEqual([
      'sf-near',
      'sf-expanded',
    ]);
  });

  it('returns no candidates when every spot in the resolved city is beyond 50 miles', () => {
    expect(selectBestNearbyCandidates([
      spot('too-far', 50.2),
    ], { lat: 0, lng: 0 }, 'sf')).toEqual({ city: 'sf', candidates: [] });
  });

  it('starts within 10 miles, expands through 25, prefers category variety, and caps at three', () => {
    const selection = selectBestNearbyCandidates([
      spot('near-park', 2, 'sf', 'park'),
      spot('near-hill', 4, 'sf', 'hill'),
      spot('expanded-beach', 12, 'sf', 'beach'),
      spot('expanded-waterfront', 14, 'sf', 'waterfront'),
    ], { lat: 0, lng: 0 }, 'sf');

    expect(selection.candidates.map(({ spot: candidateSpot, distanceBand }) => [
      candidateSpot.id,
      distanceBand,
    ])).toEqual([
      ['near-park', 'initial'],
      ['near-hill', 'initial'],
      ['expanded-beach', 'expanded'],
    ]);
  });

  it('uses the expanded band for diversity before filling with a repeated nearby category', () => {
    const selection = selectBestNearbyCandidates([
      spot('near-one', 2, 'sf', 'park'),
      spot('near-two', 3, 'sf', 'park'),
      spot('near-three', 4, 'sf', 'park'),
      spot('expanded-hill', 12, 'sf', 'hill'),
    ], { lat: 0, lng: 0 }, 'sf');
    expect(selection.candidates.map((candidate) => candidate.spot.id)).toEqual([
      'near-one',
      'expanded-hill',
      'near-two',
    ]);
  });

  it('soft-dedupes catalog spots within 0.1 miles of an already selected spot', () => {
    const selection = selectBestNearbyCandidates([
      spot('first', 2, 'sf', 'park'),
      spot('near-duplicate', 2.05, 'sf', 'beach'),
      spot('distinct', 4, 'sf', 'hill'),
    ], { lat: 0, lng: 0 }, 'sf');

    expect(selection.candidates.map((candidate) => candidate.spot.id)).toEqual([
      'first',
      'distinct',
    ]);
  });

  it('automatically uses an over-25-to-50-mile fallback only to rescue fewer than two nearby candidates', () => {
    const catalog = [
      spot('near', 5, 'sf', 'park'),
      spot('nearest-farther', 28, 'sf', 'hill'),
      spot('other-farther', 32, 'sf', 'beach'),
    ];
    const selection = selectBestNearbyCandidates(catalog, { lat: 0, lng: 0 }, 'sf');

    expect(selection.candidates.map(({ spot: candidateSpot, distanceBand }) => [
      candidateSpot.id,
      distanceBand,
    ])).toEqual([
      ['near', 'initial'],
      ['nearest-farther', 'farther-fallback'],
    ]);
  });

  it('does not pad a viable two-candidate nearby shortlist with a farther fallback', () => {
    const selection = selectBestNearbyCandidates([
      spot('near-one', 5),
      spot('near-two', 20, 'sf', 'hill'),
      spot('farther', 35, 'sf', 'beach'),
    ], { lat: 0, lng: 0 }, 'sf');

    expect(selection.candidates.map((candidate) => candidate.spot.id)).toEqual([
      'near-one',
      'near-two',
    ]);
  });

  it('rejects invalid user coordinates instead of accidentally selecting a city', () => {
    expect(selectBestNearbyCandidates([spot('near', 1)], {
      lat: Number.NaN,
      lng: 0,
    }, 'sf')).toEqual({ city: 'sf', candidates: [] });
  });

  it('retains a close duplicate when dedupe would otherwise leave fewer than two candidates', () => {
    const selection = selectBestNearbyCandidates([
      spot('first', 2, 'sf', 'park'),
      spot('only-close-option', 2.05, 'sf', 'beach'),
    ], { lat: 0, lng: 0 }, 'sf');
    expect(selection.candidates.map((candidate) => candidate.spot.id)).toEqual([
      'first',
      'only-close-option',
    ]);
  });

  it('prefers a distinct farther fallback before retaining a close nearby duplicate', () => {
    const selection = selectBestNearbyCandidates([
      spot('first', 2, 'sf', 'park'),
      spot('close-duplicate', 2.05, 'sf', 'beach'),
      spot('farther-distinct', 28, 'sf', 'hill'),
    ], { lat: 0, lng: 0 }, 'sf');
    expect(selection.candidates.map((candidate) => candidate.spot.id)).toEqual([
      'first',
      'farther-distinct',
    ]);
  });
});

describe('resolveBestNearbyCoverage', () => {
  const configs: CityConfig[] = [
    {
      id: 'sf', name: 'SF', short: 'SF', emoji: '', tagline: '', timeZone: 'UTC',
      hasWeatherMode: true, center: [0, 0], defaultZoom: 1,
      bounds: [[-1, -1], [1, 1]],
    },
    {
      id: 'austin', name: 'Austin', short: 'ATX', emoji: '', tagline: '', timeZone: 'UTC',
      hasWeatherMode: false, center: [10, 10], defaultZoom: 1,
      bounds: [[9, 9], [11, 11]],
    },
  ];

  it('returns the containing configured city independently from shortlist proximity', () => {
    expect(resolveBestNearbyCoverage([], { lat: 0, lng: 0 }, configs)).toEqual({
      status: 'inside-configured-city',
      city: 'sf',
      suggestedCity: null,
      suggestionDistanceMiles: null,
    });
  });

  it('returns outside coverage with a nearby supported-city suggestion, not a city switch', () => {
    const coverage = resolveBestNearbyCoverage([
      spot('sf-near', 2, 'sf'),
      spot('austin-nearer', 1, 'austin'),
    ], { lat: 0, lng: 0 }, []);
    expect(coverage).toMatchObject({
      status: 'outside-coverage',
      city: null,
      suggestedCity: 'austin',
    });
    expect(coverage.suggestionDistanceMiles).toBeCloseTo(1, 1);
  });

  it('suggests the nearest supported city even when it is more than 50 miles away', () => {
    expect(resolveBestNearbyCoverage([
      spot('far', 51),
    ], { lat: 0, lng: 0 }, [])).toEqual({
      status: 'outside-coverage',
      city: null,
      suggestedCity: 'sf',
      suggestionDistanceMiles: expect.any(Number),
    });
  });
});

describe('forecast comparability and ranking', () => {
  it.each([
    ['forecast', 'complete', 'high', 'fresh', true],
    ['forecast', 'complete', 'medium', 'aging', true],
    ['curated-estimate', 'complete', 'high', 'fresh', false],
    ['forecast', 'partial', 'high', 'fresh', false],
    ['forecast', 'complete', 'low', 'fresh', false],
    ['forecast', 'complete', 'high', 'stale', false],
    ['forecast', 'complete', 'high', 'unknown', false],
  ] as const)(
    'requires approved evidence: %s, %s, %s, %s',
    (provenance, completeness, confidence, freshness, expected) => {
      expect(isComparableNowEvidence(evidence({
        provenance,
        completeness,
        confidence,
        freshness,
      }))).toBe(expected);
    },
  );

  it('ranks by current Now score, then distance, then stable spot ID', () => {
    const candidates: BestNearbyCandidate[] = [
      { spot: spot('z', 4), distanceMiles: 4, distanceBand: 'initial' },
      { spot: spot('a', 4), distanceMiles: 4, distanceBand: 'initial' },
      { spot: spot('higher', 8), distanceMiles: 8, distanceBand: 'initial' },
    ];
    const ranked = rankBestNearbyCandidates(candidates, scores([
      ['z', 80],
      ['a', 80],
      ['higher', 90],
    ]));

    expect(ranked.map((candidate) => candidate.spot.id)).toEqual(['higher', 'a', 'z']);
  });

  it('keeps non-comparable estimates out of the quality ranking', () => {
    const candidates: BestNearbyCandidate[] = [
      { spot: spot('estimate', 1), distanceMiles: 1, distanceBand: 'initial' },
      { spot: spot('forecast', 5), distanceMiles: 5, distanceBand: 'initial' },
    ];
    const ranked = rankBestNearbyCandidates(candidates, scores([
      ['estimate', 100, evidence({ provenance: 'curated-estimate' })],
      ['forecast', 50],
    ]));

    expect(ranked.map((candidate) => [candidate.spot.id, candidate.comparable])).toEqual([
      ['forecast', true],
      ['estimate', false],
    ]);
  });

  it('treats a non-finite Now score as non-comparable despite valid evidence', () => {
    const [ranked] = rankBestNearbyCandidates([
      { spot: spot('bad-score', 1), distanceMiles: 1, distanceBand: 'initial' },
    ], scores([['bad-score', Number.NaN]]));
    expect(ranked).toMatchObject({ nowScore: null, comparable: false });
  });
});

describe('buildBestNearbyResult state model', () => {
  const catalog = [sfSpot('one', 2, 'park'), sfSpot('two', 4, 'hill')];
  const sfLocation = { lat: 37.75, lng: -122.45 };

  it('distinguishes locating candidates from having no supported spots', () => {
    expect(buildBestNearbyResult({
      spots: catalog,
      userLocation: null,
      liveScores: new Map(),
    }).state).toBe('locating-candidates');

    expect(buildBestNearbyResult({
      spots: [spot('far', 60)],
      userLocation: { lat: 0, lng: 0 },
      liveScores: new Map(),
    }).state).toBe('no-supported-spots');
  });

  it('reports forecast loading without declaring a best candidate', () => {
    const result = buildBestNearbyResult({
      spots: catalog,
      userLocation: sfLocation,
      liveScores: scores([['one', 80]]),
      forecastsLoading: true,
    });
    expect(result).toMatchObject({ state: 'loading-forecasts', best: null });
    expect(result.comparableCandidates).toHaveLength(1);
  });

  it('waits for the full shortlist even after two candidates are comparable', () => {
    const result = buildBestNearbyResult({
      spots: [...catalog, sfSpot('three', 6, 'beach')],
      userLocation: sfLocation,
      liveScores: scores([['one', 80], ['two', 70]]),
      forecastsLoading: true,
    });

    expect(result).toMatchObject({
      state: 'loading-forecasts',
      best: null,
      bestClaim: null,
    });
    expect(result.comparableCandidates).toHaveLength(2);
  });

  it('reports insufficient evidence after loading without promoting curated estimates', () => {
    const result = buildBestNearbyResult({
      spots: catalog,
      userLocation: sfLocation,
      liveScores: scores([
        ['one', 99, evidence({ provenance: 'curated-estimate' })],
        ['two', 70],
      ]),
    });
    expect(result).toMatchObject({ state: 'insufficient-evidence', best: null });
    expect(result.comparableCandidates.map((candidate) => candidate.spot.id)).toEqual(['two']);
  });

  it('declares a quality-first best only once at least two candidates are comparable', () => {
    const result = buildBestNearbyResult({
      spots: catalog,
      userLocation: sfLocation,
      liveScores: scores([['one', 70], ['two', 90]]),
    });
    expect(result.state).toBe('ready-comparison');
    expect(result.best?.spot.id).toBe('two');
    expect(result.bestClaim).toBe('best-nearby-now');
    expect(result.comparableCandidates.map((candidate) => candidate.spot.id)).toEqual([
      'two',
      'one',
    ]);
  });
});

describe('manual-city shortlist', () => {
  const manualCatalog = [
    { ...spot('low', 0), elevation: 0, horizonQuality: 'Blocked' as const },
    { ...spot('high', 0, 'sf', 'hill'), elevation: 250 },
    { ...spot('middle', 0), elevation: 100 },
    { ...spot('fourth', 0), elevation: 50 },
    spot('other-city', 0, 'austin'),
  ];

  it('selects at most three spots in the manual city by curated Now base score', () => {
    const selected = selectManualCityCandidates(manualCatalog, 'sf');
    expect(selected).toHaveLength(3);
    expect(selected.map((candidate) => candidate.spot.id)).toEqual([
      'high',
      'middle',
      'fourth',
    ]);
    expect(selected[0].curatedNowBaseScore).toBeGreaterThan(selected[1].curatedNowBaseScore);
  });

  it.each(['sf', 'santa-cruz', 'austin', 'chicago'] as const)(
    'keeps the manual shortlist within %s and caps it at three',
    (city) => {
      const otherCity: City = city === 'sf' ? 'austin' : 'sf';
      const catalog = [
        spot(`${city}-one`, 0, city, 'park'),
        spot(`${city}-two`, 0, city, 'hill'),
        spot(`${city}-three`, 0, city, 'beach'),
        spot(`${city}-four`, 0, city, 'waterfront'),
        spot(`${otherCity}-other`, 0, otherCity, 'park'),
      ];

      const selected = selectManualCityCandidates(catalog, city);
      expect(selected).toHaveLength(3);
      expect(selected.every((candidate) => candidate.spot.city === city)).toBe(true);
    },
  );

  it('does not turn the curated shortlist leader into a best claim before forecasts', () => {
    const result = buildManualCityBestResult(manualCatalog, 'sf', new Map(), false);
    expect(result).toMatchObject({
      state: 'insufficient-evidence',
      best: null,
      bestClaim: null,
    });
  });

  it('makes a best-of-checked claim only after two shortlisted forecasts are comparable', () => {
    const result = buildManualCityBestResult(manualCatalog, 'sf', scores([
      ['high', 60],
      ['middle', 90],
    ]));
    expect(result.state).toBe('ready-comparison');
    expect(result.best?.spot.id).toBe('middle');
    expect(result.bestClaim).toBe('best-of-checked');
  });

  it('does not name a manual-city winner while another shortlisted forecast is pending', () => {
    const result = buildManualCityBestResult(manualCatalog, 'sf', scores([
      ['high', 60],
      ['middle', 90],
    ]), true);
    expect(result).toMatchObject({
      state: 'loading-forecasts',
      best: null,
      bestClaim: null,
    });
  });
});
