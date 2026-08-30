import type { City, Spot } from '../data/spots';
import { CITIES, type CityConfig } from '../data/cities';
import type { LiveScoresMap } from '../hooks/useLiveScores';
import type { LocatedUser, UserLocation } from './geo';
import { getDistanceMiles } from './geo';
import type { ScoreEvidence } from './confidence';
import { computeNowBaseScore } from './scoring';

export const BEST_NEARBY_INITIAL_RADIUS_MILES = 10;
export const BEST_NEARBY_EXPANDED_RADIUS_MILES = 25;
export const BEST_NEARBY_MAX_RADIUS_MILES = 50;
export const BEST_NEARBY_SOFT_DEDUPE_MILES = 0.1;
export const BEST_NEARBY_MAX_CANDIDATES = 3;

export type BestNearbyState =
  | 'locating-candidates'
  | 'loading-forecasts'
  | 'ready-comparison'
  | 'insufficient-evidence'
  | 'no-supported-spots';

export type BestNearbyUserLocation = UserLocation | LocatedUser;

export interface BestNearbyCandidate {
  spot: Spot;
  distanceMiles: number;
  distanceBand: 'initial' | 'expanded' | 'farther-fallback';
}

export interface BestNearbySelection {
  /** A recommendation for comparison scope, never an instruction to switch app city state. */
  city: City | null;
  candidates: BestNearbyCandidate[];
}

export type BestNearbyCoverage =
  | {
      status: 'inside-configured-city';
      city: City;
      suggestedCity: null;
      suggestionDistanceMiles: null;
    }
  | {
      status: 'outside-coverage';
      city: null;
      suggestedCity: City | null;
      suggestionDistanceMiles: number | null;
    };

export interface BestNearbyRankedCandidate extends BestNearbyCandidate {
  nowScore: number | null;
  evidence: ScoreEvidence | null;
  comparable: boolean;
}

export interface BestNearbyResult {
  state: BestNearbyState;
  coverage: BestNearbyCoverage | null;
  city: City | null;
  candidates: BestNearbyRankedCandidate[];
  comparableCandidates: BestNearbyRankedCandidate[];
  /** Present only when at least two candidates have trustworthy forecast evidence. */
  best: BestNearbyRankedCandidate | null;
  bestClaim: 'best-nearby-now' | null;
}

export interface BuildBestNearbyOptions {
  spots: ReadonlyArray<Spot>;
  userLocation: BestNearbyUserLocation | null;
  liveScores: LiveScoresMap;
  /** True while forecast requests for the selected candidates remain in flight. */
  forecastsLoading?: boolean;
}

interface MeasuredSpot {
  spot: Spot;
  distanceMiles: number;
}

function compareMeasured(a: MeasuredSpot, b: MeasuredSpot): number {
  return a.distanceMiles - b.distanceMiles || a.spot.id.localeCompare(b.spot.id);
}

function isValidLocation(location: BestNearbyUserLocation): boolean {
  return Number.isFinite(location.lat) &&
    Number.isFinite(location.lng) &&
    location.lat >= -90 &&
    location.lat <= 90 &&
    location.lng >= -180 &&
    location.lng <= 180;
}

function measureSpots(
  spots: ReadonlyArray<Spot>,
  location: BestNearbyUserLocation,
): MeasuredSpot[] {
  if (!isValidLocation(location)) return [];
  return spots.flatMap((spot) => {
    if (!isValidLocation(spot)) return [];
    const distanceMiles = getDistanceMiles(location.lat, location.lng, spot.lat, spot.lng);
    return Number.isFinite(distanceMiles) ? [{ spot, distanceMiles }] : [];
  });
}

function nearestSupportedCity(measured: ReadonlyArray<MeasuredSpot>): City | null {
  const nearestByCity = new Map<City, MeasuredSpot>();
  for (const item of measured) {
    const current = nearestByCity.get(item.spot.city);
    if (!current || compareMeasured(item, current) < 0) nearestByCity.set(item.spot.city, item);
  }
  const cities = [...nearestByCity.entries()].sort((a, b) => {
    const distanceOrder = a[1].distanceMiles - b[1].distanceMiles;
    return distanceOrder || a[0].localeCompare(b[0]);
  });
  return cities[0]?.[0] ?? null;
}

function containsLocation(config: CityConfig, location: BestNearbyUserLocation): boolean {
  const [[south, west], [north, east]] = config.bounds;
  return location.lat >= south && location.lat <= north && location.lng >= west && location.lng <= east;
}

/** Resolve coverage without changing the app's active city. */
export function resolveBestNearbyCoverage(
  spots: ReadonlyArray<Spot>,
  userLocation: BestNearbyUserLocation,
  cityConfigs: ReadonlyArray<CityConfig> = CITIES,
): BestNearbyCoverage {
  if (isValidLocation(userLocation)) {
    const containing = cityConfigs
      .filter((config) => containsLocation(config, userLocation))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (containing) {
      return {
        status: 'inside-configured-city',
        city: containing.id,
        suggestedCity: null,
        suggestionDistanceMiles: null,
      };
    }
  }

  const configuredSuggestions = isValidLocation(userLocation)
    ? cityConfigs.map((config) => ({
        city: config.id,
        distanceMiles: getDistanceMiles(
          userLocation.lat,
          userLocation.lng,
          config.center[0],
          config.center[1],
        ),
      })).sort((a, b) =>
        a.distanceMiles - b.distanceMiles || a.city.localeCompare(b.city),
      )
    : [];
  // Custom callers may omit configs. Retain a catalog-based fallback for that
  // case, while production uses configured city centers as coverage authority.
  const measured = measureSpots(spots, userLocation);
  const catalogSuggestion = nearestSupportedCity(measured);
  const catalogNearest = catalogSuggestion
    ? measured.filter((item) => item.spot.city === catalogSuggestion).sort(compareMeasured)[0]
    : undefined;
  const suggestedCity = configuredSuggestions[0]?.city ?? catalogSuggestion;
  const suggestionDistanceMiles = configuredSuggestions[0]?.distanceMiles ??
    catalogNearest?.distanceMiles ?? null;
  return {
    status: 'outside-coverage',
    city: null,
    suggestedCity,
    suggestionDistanceMiles,
  };
}

function isSoftDuplicate(candidate: MeasuredSpot, selected: ReadonlyArray<MeasuredSpot>): boolean {
  return selected.some((existing) =>
    getDistanceMiles(
      candidate.spot.lat,
      candidate.spot.lng,
      existing.spot.lat,
      existing.spot.lng,
    ) <= BEST_NEARBY_SOFT_DEDUPE_MILES,
  );
}

function addNewCategories(
  pool: ReadonlyArray<MeasuredSpot>,
  selected: MeasuredSpot[],
): void {
  const ordered = [...pool].sort(compareMeasured);
  const selectedCategories = new Set(selected.map((item) => item.spot.category));

  for (const candidate of ordered) {
    if (selected.length >= BEST_NEARBY_MAX_CANDIDATES) return;
    if (selectedCategories.has(candidate.spot.category) || isSoftDuplicate(candidate, selected)) {
      continue;
    }
    selected.push(candidate);
    selectedCategories.add(candidate.spot.category);
  }
}

function fillCandidates(
  pool: ReadonlyArray<MeasuredSpot>,
  selected: MeasuredSpot[],
): void {
  const ordered = [...pool].sort(compareMeasured);
  for (const candidate of ordered) {
    if (selected.length >= BEST_NEARBY_MAX_CANDIDATES) return;
    if (selected.some((item) => item.spot.id === candidate.spot.id)) continue;
    if (isSoftDuplicate(candidate, selected)) continue;
    selected.push(candidate);
  }
}

export function selectBestNearbyCandidates(
  spots: ReadonlyArray<Spot>,
  userLocation: BestNearbyUserLocation,
  city: City,
): BestNearbySelection {
  const measured = measureSpots(spots, userLocation);
  const inCity = measured.filter((item) => item.spot.city === city);
  const initial = inCity.filter(
    (item) => item.distanceMiles <= BEST_NEARBY_INITIAL_RADIUS_MILES,
  );
  const expanded = inCity.filter(
    (item) =>
      item.distanceMiles > BEST_NEARBY_INITIAL_RADIUS_MILES &&
      item.distanceMiles <= BEST_NEARBY_EXPANDED_RADIUS_MILES,
  );
  const fartherFallback = inCity.filter(
    (item) =>
      item.distanceMiles > BEST_NEARBY_EXPANDED_RADIUS_MILES &&
      item.distanceMiles <= BEST_NEARBY_MAX_RADIUS_MILES,
  );

  const selected: MeasuredSpot[] = [];
  // Discover distinct nearby categories across both bands before filling
  // remaining slots. Initial-band candidates still enter first.
  addNewCategories(initial, selected);
  addNewCategories(expanded, selected);
  fillCandidates(initial, selected);
  fillCandidates(expanded, selected);
  // Farther options rescue a de-duplicated comparison that otherwise has
  // fewer than two candidates. They never pad a viable shortlist to three.
  if (selected.length < 2) {
    const rescue = [...fartherFallback].sort(compareMeasured);
    for (const candidate of rescue) {
      if (selected.length >= 2) break;
      if (isSoftDuplicate(candidate, selected)) continue;
      selected.push(candidate);
    }
  }

  // Soft dedupe must not make comparison impossible. Retain the nearest close
  // duplicate only after distinct options in every applicable band are spent.
  if (selected.length < 2) {
    const duplicateRescue = [...initial, ...expanded, ...fartherFallback].sort(compareMeasured);
    for (const candidate of duplicateRescue) {
      if (selected.length >= 2) break;
      if (selected.some((item) => item.spot.id === candidate.spot.id)) continue;
      selected.push(candidate);
    }
  }

  return {
    city,
    candidates: selected.map((item) => ({
      ...item,
      distanceBand: item.distanceMiles <= BEST_NEARBY_INITIAL_RADIUS_MILES
        ? 'initial'
        : item.distanceMiles <= BEST_NEARBY_EXPANDED_RADIUS_MILES
          ? 'expanded'
          : 'farther-fallback',
    })),
  };
}

export interface ManualCityCandidate {
  spot: Spot;
  curatedNowBaseScore: number;
}

export interface RankedManualCityCandidate extends ManualCityCandidate {
  nowScore: number | null;
  evidence: ScoreEvidence | null;
  comparable: boolean;
}

export interface ManualCityBestResult {
  state: Exclude<BestNearbyState, 'locating-candidates'>;
  city: City;
  candidates: RankedManualCityCandidate[];
  comparableCandidates: RankedManualCityCandidate[];
  best: RankedManualCityCandidate | null;
  bestClaim: 'best-of-checked' | null;
}

/** Choose forecast targets when location is denied or unavailable. */
export function selectManualCityCandidates(
  spots: ReadonlyArray<Spot>,
  city: City,
): ManualCityCandidate[] {
  return spots
    .filter((candidate) => candidate.city === city)
    .map((candidate) => ({ spot: candidate, curatedNowBaseScore: computeNowBaseScore(candidate) }))
    .sort((a, b) =>
      b.curatedNowBaseScore - a.curatedNowBaseScore || a.spot.id.localeCompare(b.spot.id),
    )
    .slice(0, BEST_NEARBY_MAX_CANDIDATES);
}

export function buildManualCityBestResult(
  spots: ReadonlyArray<Spot>,
  city: City,
  liveScores: LiveScoresMap,
  forecastsLoading = false,
): ManualCityBestResult {
  const selected = selectManualCityCandidates(spots, city);
  const candidates = selected.map((candidate) => {
    const live = liveScores.get(candidate.spot.id);
    const scoreEvidence = live?.evidence.now ?? null;
    const nowScore = live && Number.isFinite(live.now) ? live.now : null;
    return {
      ...candidate,
      nowScore,
      evidence: scoreEvidence,
      comparable: nowScore !== null && isComparableNowEvidence(scoreEvidence),
    };
  }).sort((a, b) => {
    if (a.comparable !== b.comparable) return a.comparable ? -1 : 1;
    if (a.comparable && b.comparable) {
      const scoreOrder = (b.nowScore as number) - (a.nowScore as number);
      if (scoreOrder) return scoreOrder;
    }
    return a.spot.id.localeCompare(b.spot.id);
  });
  const comparableCandidates = candidates.filter((candidate) => candidate.comparable);
  const ready = comparableCandidates.length >= 2;
  const comparisonComplete = !forecastsLoading;
  return {
    state: selected.length === 0
      ? 'no-supported-spots'
      : !comparisonComplete
          ? 'loading-forecasts'
        : ready
          ? 'ready-comparison'
          : 'insufficient-evidence',
    city,
    candidates,
    comparableCandidates,
    best: comparisonComplete && ready ? comparableCandidates[0] : null,
    bestClaim: comparisonComplete && ready ? 'best-of-checked' : null,
  };
}

export function isComparableNowEvidence(evidence: ScoreEvidence | null | undefined): boolean {
  return evidence?.provenance === 'forecast' &&
    evidence.completeness === 'complete' &&
    (evidence.confidence === 'high' || evidence.confidence === 'medium') &&
    (evidence.freshness === 'fresh' || evidence.freshness === 'aging');
}

export function rankBestNearbyCandidates(
  candidates: ReadonlyArray<BestNearbyCandidate>,
  liveScores: LiveScoresMap,
): BestNearbyRankedCandidate[] {
  return candidates.map((candidate) => {
    const live = liveScores.get(candidate.spot.id);
    const evidence = live?.evidence.now ?? null;
    const nowScore = live && Number.isFinite(live.now) ? live.now : null;
    return {
      ...candidate,
      nowScore,
      evidence,
      comparable: nowScore !== null && isComparableNowEvidence(evidence),
    };
  }).sort((a, b) => {
    if (a.comparable !== b.comparable) return a.comparable ? -1 : 1;
    if (a.comparable && b.comparable) {
      const scoreOrder = (b.nowScore as number) - (a.nowScore as number);
      if (scoreOrder) return scoreOrder;
    }
    return a.distanceMiles - b.distanceMiles || a.spot.id.localeCompare(b.spot.id);
  });
}

export function buildBestNearbyResult(options: BuildBestNearbyOptions): BestNearbyResult {
  if (!options.userLocation) {
    return {
      state: 'locating-candidates',
      coverage: null,
      city: null,
      candidates: [],
      comparableCandidates: [],
      best: null,
      bestClaim: null,
    };
  }

  const coverage = resolveBestNearbyCoverage(options.spots, options.userLocation);
  if (coverage.status === 'outside-coverage') {
    return {
      state: 'no-supported-spots',
      coverage,
      city: null,
      candidates: [],
      comparableCandidates: [],
      best: null,
      bestClaim: null,
    };
  }

  const selection = selectBestNearbyCandidates(
    options.spots,
    options.userLocation,
    coverage.city,
  );
  if (selection.candidates.length === 0) {
    return {
      state: 'no-supported-spots',
      coverage,
      city: coverage.city,
      candidates: [],
      comparableCandidates: [],
      best: null,
      bestClaim: null,
    };
  }

  const candidates = rankBestNearbyCandidates(selection.candidates, options.liveScores);
  const comparableCandidates = candidates.filter((candidate) => candidate.comparable);
  const ready = comparableCandidates.length >= 2;
  const comparisonComplete = !options.forecastsLoading;

  return {
    state: !comparisonComplete
        ? 'loading-forecasts'
      : ready
        ? 'ready-comparison'
        : 'insufficient-evidence',
    coverage,
    city: selection.city,
    candidates,
    comparableCandidates,
    best: comparisonComplete && ready ? comparableCandidates[0] : null,
    bestClaim: comparisonComplete && ready ? 'best-nearby-now' : null,
  };
}
