import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { buildPlanningDays, findSunsetOpportunity, usesSkyExperience } from './utils/skyExperience';
import { type Spot, type SpotCategory, type City } from './data/spots';
import { type CuratedEvent } from './data/events';
import { allSpots } from './data/all-spots';
import { isHiddenGem } from './data/spotDiscovery';
import { getCityById, getValidCityId } from './data/cities';
import { useLocation } from './hooks/useLocation';
import { useTimelineScores } from './hooks/useTimelineScores';
import { selectForecastTargets } from './utils/forecastTargets';
import { useNeighborhoodForecasts } from './hooks/useNeighborhoodForecasts';
import MapView, { type MapBounds, type MapPoint } from './components/MapView';
import { buildSamples } from './utils/weatherSamples';
import ScorePanel from './components/ScorePanel';
import EventDetailSheet from './components/EventDetailSheet';
import FilterMenu from './components/FilterMenu';
import SearchBar from './components/SearchBar';
import SearchOverlay from './components/SearchOverlay';
import SuggestSpotOverlay from './components/SuggestSpotOverlay';
import BugReportOverlay from './components/BugReportOverlay';
import UnifiedTimeline from './components/UnifiedTimeline';
import { getUpcomingEventTimes, getEventsForDate, getTimelineEventDays, resolveViewMode } from './utils/events';
import { usePrivateSpots } from './hooks/usePrivateSpots';
import { KNOWN_SPOT_IDS } from './data/spotIdentity';
import WeatherMetricToggle from './components/WeatherMetricToggle';
import WeatherOverlayStatus from './components/WeatherOverlayStatus';
import OnboardingHint from './components/OnboardingHint';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import CitySheet from './components/CitySheet';
import MapErrorBoundary from './components/MapErrorBoundary';
import LocationPrompt from './components/LocationPrompt';
import { wasLocationPromptDismissed, rememberLocationPromptDismissal } from './utils/locationPromptSession';
import { isNativeRuntime } from './platform/runtime';
import HomeSheet, { type HomeSheetScopeNotice } from './components/HomeSheet';
import SunsetSpots from './components/SunsetSpots';
import { rankSkySpots } from './utils/skySpotRanking';
import { passesSpotFilter } from './utils/spotFilters';
import BestNearbyCard, {
  type BestNearbyCandidate as BestNearbyCardCandidate,
  type BestNearbyCardProps,
} from './components/BestNearbyCard';
import SavedSpotsSheet from './components/SavedSpotsSheet';
import { useSavedSpots } from './hooks/useSavedSpots';
import { appSettingsController } from './platform/appSettings';
import { type ScoreTier, type ViewMode } from './utils/scoring';
import type { WeatherMetric } from './utils/interpolate';
import {
  formatCanonicalHourKey,
  formatInstantTimeLabel,
  parseCanonicalHourKey,
  type ForecastRange,
  FORECAST_RANGE_STORAGE_KEY,
  parseForecastRange,
  forecastRangeWindow,
  rangeStartHourKey,
  deriveSpotTimelineHourKeys,
  isCanonicalHourKey,
  resolveLegacyWallClockHour,
  viewModeForHourKey,
} from './utils/timeline';
import {
  ONBOARDING_KEYS,
  isOnboardingDone,
  markOnboardingDone,
} from './utils/onboarding';
import {
  buildBestNearbyResult,
  buildManualCityBestResult,
  resolveBestNearbyCoverage,
  selectBestNearbyCandidates,
  selectManualCityCandidates,
  type BestNearbyRankedCandidate,
  type RankedManualCityCandidate,
} from './utils/bestNearby';
import './App.css';

// Per-event tier filter. Empty array = no constraint (show everything for
// that event). One or two tiers = show only spots in those buckets. We
// intentionally treat "all three selected" the same as empty so the active-
// filter indicator stays honest.
export interface Filters {
  sunrise: ScoreTier[];
  sunset: ScoreTier[];
  stargazing: ScoreTier[];
  now: ScoreTier[];
  category: SpotCategory[];
}

// Kept independent from FILTERS_KEY so category selections survive tier-filter
// resets and vice versa.
const CATEGORY_FILTER_STORAGE_KEY = 'sf-sky:categoryFilter';
const KNOWN_CATEGORIES: readonly SpotCategory[] = [
  'hill',
  'beach',
  'coastal-bluff',
  'park',
  'skyscraper',
  'waterfront',
];

export type TravelMode = 'walk' | 'car';

type CardType = 'now' | 'sunrise' | 'sunset' | 'stargazing';

const FILTERS_KEY = 'sf-sky:filters';
const HOME_CITY_KEY = 'sky:homeCity';
const ACTIVE_CITY_KEY = 'sky:activeCity';

function formatDistanceMiles(distanceMiles: number): string {
  if (!Number.isFinite(distanceMiles)) return '';
  if (distanceMiles < 10) return `${distanceMiles.toFixed(1)} mi`;
  return `${Math.round(distanceMiles)} mi`;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}

function toBestNearbyCardCandidate(
  candidate: BestNearbyRankedCandidate | RankedManualCityCandidate,
  approximateDistance: boolean,
): BestNearbyCardCandidate {
  const evidence = candidate.evidence;
  const distanceMiles = 'distanceMiles' in candidate ? candidate.distanceMiles : null;
  return {
    id: candidate.spot.id,
    name: candidate.spot.name,
    score: candidate.nowScore,
    confidence: capitalize(evidence?.confidence ?? 'low'),
    lastUpdatedLabel: evidence?.retrievalLabel ?? 'Forecast not retrieved',
    forecastBacked: evidence?.provenance === 'forecast',
    comparable: candidate.comparable,
    distance: distanceMiles === null ? undefined : formatDistanceMiles(distanceMiles),
    approximateDistance: distanceMiles === null ? false : approximateDistance,
    fartherFallback: 'distanceBand' in candidate && candidate.distanceBand === 'farther-fallback',
    accessWarning: candidate.spot.accessAlert?.message,
  };
}

function readStoredHomeCity(): City {
  if (typeof window === 'undefined') return 'sf';
  try {
    const raw = window.localStorage.getItem(HOME_CITY_KEY);
    return getValidCityId(raw);
  } catch {
    return 'sf';
  }
}

function readStoredActiveCity(fallback: City): City {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(ACTIVE_CITY_KEY);
    return getValidCityId(raw || fallback);
  } catch {
    return fallback;
  }
}

const defaultFilters: Filters = {
  sunrise: [],
  sunset: [],
  stargazing: [],
  now: [],
  category: [],
};

function readStoredCategoryFilter(): SpotCategory[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CATEGORY_FILTER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const filtered = parsed.filter((v): v is SpotCategory =>
      typeof v === 'string' && (KNOWN_CATEGORIES as readonly string[]).includes(v),
    );
    return filtered;
  } catch {
    return [];
  }
}

function readStoredFilters(): Filters {
  const category = readStoredCategoryFilter();
  if (typeof window === 'undefined') return { ...defaultFilters, category };
  try {
    const raw = window.localStorage.getItem(FILTERS_KEY);
    if (!raw) return { ...defaultFilters, category };
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.sunrise) &&
      Array.isArray(parsed.sunset) &&
      Array.isArray(parsed.stargazing)
    ) {
      return {
        sunrise: parsed.sunrise,
        sunset: parsed.sunset,
        stargazing: parsed.stargazing,
        now: Array.isArray(parsed.now) ? parsed.now : [],
        category,
      };
    }
    return { ...defaultFilters, category };
  } catch {
    return { ...defaultFilters, category };
  }
}

function isCardType(value: string | null): value is CardType {
  return value === 'now' || value === 'sunrise' || value === 'sunset' || value === 'stargazing';
}

function readInitialDeepLink(): { spot: Spot | null; cardType?: CardType; hourKey?: string; legacyHour?: string; eventTime?: Date; range?: ForecastRange } {
  if (typeof window === 'undefined') return { spot: null };
  const params = new URLSearchParams(window.location.search);
  const spotParam = params.get('spot');
  const viewParam = params.get('view');
  const instantParam = params.get('instant');
  const hourParam = params.get('hour');
  const eventParam = params.get('event');
  const eventTime = eventParam ? new Date(eventParam) : undefined;
  const spot = spotParam ? (allSpots.find((candidate) => candidate.id === spotParam) ?? null) : null;
  return {
    spot,
    range: params.get('range') === '7d' ? '7d' : undefined,
    cardType: isCardType(viewParam) ? viewParam : undefined,
    hourKey: isCanonicalHourKey(instantParam) ? instantParam : undefined,
    eventTime: isCardType(viewParam) && eventTime && Number.isFinite(eventTime.getTime()) &&
      formatCanonicalHourKey(eventTime) === instantParam ? eventTime : undefined,
    legacyHour: viewParam === 'now' && !isCanonicalHourKey(instantParam) && /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hourParam ?? '')
      ? hourParam ?? undefined
      : undefined,
  };
}

// How long the just-dismissed pin keeps its highlight ring + how long the
// map retains its selection highlight. Long enough for the eye to land on the
// pulse, short enough that it fades before it starts to feel like noise.
const DISMISS_HIGHLIGHT_MS = 1600;

function App() {
  const [initialDeepLink] = useState(readInitialDeepLink);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(initialDeepLink.spot);
  const [centeredSpotId, setCenteredSpotId] = useState<string | null>(null);
  const handleSpotCentered = useCallback((spotId: string) => setCenteredSpotId(spotId), []);
  const [closingSpotId, setClosingSpotId] = useState<string | null>(null);
  const cancelSpotDismissal = useCallback(() => setClosingSpotId(null), []);
  useEffect(() => {
    if (!closingSpotId || selectedSpot?.id !== closingSpotId) return;
    const timer = window.setTimeout(() => {
      setSelectedSpot((current) => current?.id === closingSpotId ? null : current);
      setCenteredSpotId(null);
      setClosingSpotId(null);
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.map-timeline [role="slider"]')?.focus({ preventScroll: true }));
    }, 260);
    return () => window.clearTimeout(timer);
  }, [closingSpotId, selectedSpot?.id]);
  // Curated events surface their own editorial sheet, mutually exclusive with
  // the spot ScorePanel (Part 4): opening one closes the other.
  const [selectedEvent, setSelectedEvent] = useState<CuratedEvent | null>(null);
  const [initialCardType, setInitialCardType] = useState<CardType | undefined>(
    initialDeepLink.cardType,
  );
  // After the score card is dismissed, briefly remember the spot the user
  // was just looking at so the map can pan to it and pulse the pin. This is
  // separate from `selectedSpot` because the card is already gone — we
  // don't want to reopen it, just give the user spatial context for where
  // they were.
  const [highlightedSpot, setHighlightedSpot] = useState<Spot | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  // Pre-fill the suggest form when the user lands there from a no-results
  // search; otherwise it opens blank.
  const [suggestSeed, setSuggestSeed] = useState('');
  const [filters, setFilters] = useState<Filters>(readStoredFilters);
  const [travelMode, setTravelMode] = useState<TravelMode>('walk');
  // Weather mode is intentionally session-off on launch. Regional forecast
  // traffic only starts after the user explicitly opens the overlay.
  const [weatherOverlay, setWeatherOverlay] = useState(false);
  const [cloudPulseKey, setCloudPulseKey] = useState(0);
  const [homeCityId, setHomeCityIdRaw] = useState<City>(readStoredHomeCity);
  const [activeCityId, setActiveCityIdRaw] = useState<City>(() =>
    initialDeepLink.spot?.city ?? readStoredActiveCity(readStoredHomeCity()),
  );
  // An explicit city choice preserves agency even when location is available.
  // Nearby mode resumes only after the person asks to use their location or
  // accepts the detected coverage city.
  const [manualCityMode, setManualCityMode] = useState(false);
  const [citySheetOpen, setCitySheetOpen] = useState(false);
  const [savedSpotsSheetOpen, setSavedSpotsSheetOpen] = useState(false);
  const privateSpots = usePrivateSpots();
  const visibleSpots = useMemo(() => [...allSpots, ...privateSpots.spots], [privateSpots.spots]);
  const knownSpotIds = useMemo(
    () => new Set([...KNOWN_SPOT_IDS, ...privateSpots.spots.map((spot) => spot.id)]),
    [privateSpots.spots],
  );
  const savedSpots = useSavedSpots({ knownIds: knownSpotIds });
  const activeCityConfig = getCityById(activeCityId) ?? getCityById('sf')!;
  const [weatherMetric, setWeatherMetric] = useState<WeatherMetric>('temp');
  const [timelineRange, setTimelineRange] = useState<ForecastRange>(() => {
    if (initialDeepLink.range) return initialDeepLink.range;
    const requestedInstant = Date.parse(initialDeepLink.hourKey ?? '');
    if (requestedInstant > Date.now() + 24 * 3_600_000
      && requestedInstant < forecastRangeWindow(new Date(), '7d', activeCityConfig.timeZone).end.getTime()) return '7d';
    try { return parseForecastRange(window.localStorage.getItem(FORECAST_RANGE_STORAGE_KEY)); }
    catch { return '24h'; }
  });
  const mapTimelineRef = useRef<HTMLElement>(null);
  const [timelineWeeklyView, setTimelineWeeklyView] = useState<'week' | 'day'>(
    initialDeepLink.hourKey || initialDeepLink.eventTime ? 'day' : 'week');
  useEffect(() => {
    const footer = mapTimelineRef.current;
    if (!footer) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty('--map-timeline-height', `${Math.ceil(footer.getBoundingClientRect().height)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(footer);
    return () => { observer.disconnect(); root.style.removeProperty('--map-timeline-height'); };
  }, [selectedSpot, closingSpotId, timelineRange, timelineWeeklyView]);

  const [timelineHourKey, setTimelineHourKey] = useState<string>(() =>
    initialDeepLink.hourKey ?? rangeStartHourKey(new Date(), timelineRange, activeCityConfig.timeZone));
  const [timelineEventTime, setTimelineEventTime] = useState<Date | undefined>(initialDeepLink.eventTime);
  const [planningDefaultPending, setPlanningDefaultPending] = useState(() => timelineRange === '7d' &&
    !initialDeepLink.hourKey && !initialDeepLink.eventTime &&
    (!initialDeepLink.cardType || initialDeepLink.cardType === 'now'));
  const documentVisibilityRef = useRef<DocumentVisibilityState>(document.visibilityState);
  const foregroundResetArmedRef = useRef(false);

  // Refreshed every 60s (see effect below) so viewMode stays current as
  // real time advances while the user sits on the live "now" view.
  const [now, setNow] = useState(() => new Date());

  // Resolve both live and forecast keys in the active city's time zone.
  const selectedSkyView = initialCardType ?? 'now';
  const viewMode: ViewMode = useMemo(() => {
    if (selectedSkyView !== 'now') return selectedSkyView;
    if (timelineEventTime) return resolveViewMode(timelineEventTime, activeCityConfig.center[0], activeCityConfig.center[1]);
    const lat = activeCityConfig.center[0];
    const lng = activeCityConfig.center[1];
    return viewModeForHourKey(
      timelineHourKey,
      activeCityConfig.timeZone,
      lat,
      lng,
      now,
    );
  }, [timelineHourKey, timelineEventTime, activeCityConfig, now, selectedSkyView]);
  // Onboarding: welcome card on first load, then a chain of one-time
  // hints tied to specific interactions. Each step is gated by a
  // localStorage flag (see `utils/onboarding.ts`); the component-level
  // state below tracks the in-session "is this currently visible"
  // question. Order mirrors the natural usage path:
  //   welcome → tap-spot → scroll-cards → scrub-timeline →
  //   weather-overlay → metrics → complete
  const [showTapSpotHint, setShowTapSpotHint] = useState(false);
  // Pixel position of the pin we anchor the tap-spot hint to. Driven
  // by MapView's `TapSpotAnchorTracker` so the hint follows the chosen
  // pin as the user pans/zooms while the hint is up.
  const [tapSpotAnchor, setTapSpotAnchor] = useState<MapPoint | null>(null);
  const [showScrollCardsHint, setShowScrollCardsHint] = useState(false);
  const [showWeatherOverlayHint, setShowWeatherOverlayHint] = useState(false);
  const [showMetricsHint, setShowMetricsHint] = useState(false);
  const [showScrubHint, setShowScrubHint] = useState(false);
  const [showCompleteHint, setShowCompleteHint] = useState(false);
  const activeSpots = useMemo(
    () => visibleSpots.filter((s) => s.city === activeCityId),
    [activeCityId, visibleSpots],
  );
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [sunsetBrowseOpen, setSunsetBrowseOpen] = useState(false);
  const [hiddenGemsOnly, setHiddenGemsOnly] = useState(false);
  const hasHiddenGems = activeSpots.some(isHiddenGem);
  const hiddenGemsActive = hasHiddenGems && hiddenGemsOnly;
  const discoverySpots = useMemo(
    () => hiddenGemsActive ? activeSpots.filter(isHiddenGem) : activeSpots,
    [activeSpots, hiddenGemsActive],
  );
  const [locationPromptOpen, setLocationPromptOpen] = useState(() => !isNativeRuntime() && !wasLocationPromptDismissed());
  const closeLocationPrompt = useCallback(() => {
    rememberLocationPromptDismissal();
    setLocationPromptOpen(false);
  }, []);
  const location = useLocation();
  const requestLocation = location.request;
  const clearLocation = location.clear;
  const userLocation = location.state.status === 'allowed'
    ? location.state.location
    : null;
  const bestNearbyCoverage = useMemo(
    () => userLocation ? resolveBestNearbyCoverage(allSpots, userLocation) : null,
    [userLocation],
  );
  const locationFallbackActive = location.state.status === 'denied' ||
    location.state.status === 'timeout' ||
    location.state.status === 'unavailable' ||
    location.state.status === 'unsupported';
  const manualRecommendationActive = location.state.status !== 'requesting' &&
    (manualCityMode || locationFallbackActive);
  const nearbyRecommendationActive = !manualRecommendationActive &&
    bestNearbyCoverage?.status === 'inside-configured-city' &&
    bestNearbyCoverage.city === activeCityId;
  const landingRecommendationEnabled = !weatherOverlay && !selectedEvent && !timelineHourKey && selectedSkyView === 'now';
  const nearbyTargets = useMemo(
    () => nearbyRecommendationActive && userLocation && landingRecommendationEnabled
      ? selectBestNearbyCandidates(allSpots, userLocation, activeCityId).candidates
      : [],
    [activeCityId, landingRecommendationEnabled, nearbyRecommendationActive, userLocation],
  );
  const manualTargets = useMemo(
    () => manualRecommendationActive && landingRecommendationEnabled
      ? selectManualCityCandidates(activeSpots, activeCityId)
      : [],
    [activeCityId, activeSpots, landingRecommendationEnabled, manualRecommendationActive],
  );
  const recommendationTargetSpots = useMemo(
    () => nearbyRecommendationActive
      ? nearbyTargets.map((candidate) => candidate.spot)
      : manualTargets.map((candidate) => candidate.spot),
    [manualTargets, nearbyRecommendationActive, nearbyTargets],
  );
  const regionalSpot = useMemo<Spot>(() => ({
    ...activeSpots[0],
    id: `regional:${activeCityId}`,
    name: activeCityConfig.name,
    lat: activeCityConfig.center[0],
    lng: activeCityConfig.center[1],
  }), [activeSpots, activeCityConfig, activeCityId]);
  const timelineEvents = useMemo(() => {
    const selectedDate = timelineHourKey ? parseCanonicalHourKey(timelineHourKey) : null;
    return selectedDate
      ? getEventsForDate(selectedSpot ?? regionalSpot, selectedDate, activeCityConfig.timeZone)
      : getUpcomingEventTimes(selectedSpot ?? regionalSpot, now, activeCityConfig.timeZone);
  }, [selectedSpot, regionalSpot, now, timelineHourKey, activeCityConfig.timeZone]);
  const timelineEventDays = useMemo(
    () => getTimelineEventDays(selectedSpot ?? regionalSpot, now, activeCityConfig.timeZone),
    [selectedSpot, regionalSpot, now, activeCityConfig.timeZone],
  );
  const selectedEventTime = timelineEventTime ?? (selectedSkyView === 'now' ? undefined : timelineEvents[selectedSkyView]);
  const effectiveHourKey = selectedEventTime ? formatCanonicalHourKey(selectedEventTime) : timelineHourKey;
  const forecastSpots = useMemo(() => [...activeSpots, regionalSpot], [activeSpots, regionalSpot]);
  const requestedSpotIds = useMemo(
    () => selectForecastTargets(activeSpots, mapBounds, selectedSpot?.id, regionalSpot.id,
      selectedSpot ? [] : recommendationTargetSpots.map(spot => spot.id)),
    [activeSpots, mapBounds, recommendationTargetSpots, selectedSpot, regionalSpot],
  );
  const timelineScores = useTimelineScores(
    forecastSpots,
    effectiveHourKey,
    viewMode,
    activeCityConfig.timeZone,
    now,
    requestedSpotIds,
    regionalSpot.id,
    selectedEventTime,
    timelineRange === '7d' ? selectedSpot?.id ?? regionalSpot.id : undefined,
    selectedSkyView !== 'now' && !!selectedEventTime,
  );
  const liveScores = timelineScores.scores;
  const recommendationForecastsLoading = timelineScores.forecastRetrying ||
    recommendationTargetSpots.some(
      (spot) => !timelineScores.forecasts.has(spot.id) && !timelineScores.forecastErrors.has(spot.id),
    );
  const nearbyRecommendationResult = useMemo(
    () => nearbyRecommendationActive && userLocation
      ? buildBestNearbyResult({
          spots: allSpots,
          userLocation,
          liveScores,
          forecastsLoading: recommendationForecastsLoading,
        })
      : null,
    [
      liveScores,
      nearbyRecommendationActive,
      recommendationForecastsLoading,
      userLocation,
    ],
  );
  const manualRecommendationResult = useMemo(
    () => manualRecommendationActive
      ? buildManualCityBestResult(
          activeSpots,
          activeCityId,
          liveScores,
          recommendationForecastsLoading,
        )
      : null,
    [
      activeCityId,
      activeSpots,
      liveScores,
      manualRecommendationActive,
      recommendationForecastsLoading,
    ],
  );
  const activeWeatherHourKey = effectiveHourKey || formatCanonicalHourKey(now);
  const neighborhoodForecastState = useNeighborhoodForecasts(
    weatherOverlay && activeCityConfig.hasWeatherMode,
    activeCityConfig.timeZone,
    weatherMetric,
    activeWeatherHourKey,
    now,
  );
  const { forecasts: weatherForecasts, hourKeys: weatherHourKeys } = neighborhoodForecastState;

  // Normalize deep links only after the selected spot's forecast is known.
  // Canonical links must exist in that forecast. Legacy wall times resolve
  // only when exactly one instant matches, so repeats and gaps stay at Now.
  useEffect(() => {
    if (!initialDeepLink.spot) return;
    const forecast = timelineScores.forecasts.get(initialDeepLink.spot.id);
    if (!forecast) return;
    if (
      initialDeepLink.hourKey &&
      timelineHourKey === initialDeepLink.hourKey &&
      !forecast.hours[initialDeepLink.hourKey]
    ) {
      queueMicrotask(() => {
        setTimelineHourKey(rangeStartHourKey(now, timelineRange, activeCityConfig.timeZone));
        setTimelineEventTime(undefined);
        setInitialCardType('now');
      });
      return;
    }
    if (!initialDeepLink.legacyHour || timelineHourKey) return;
    const resolved = resolveLegacyWallClockHour(
      initialDeepLink.legacyHour,
      Object.keys(forecast.hours),
      forecast.timeZone,
    );
    if (resolved) queueMicrotask(() => setTimelineHourKey(resolved));
  }, [initialDeepLink, timelineHourKey, timelineScores.forecasts, now, timelineRange, activeCityConfig.timeZone]);


  const mapTimelineHourKeys = useMemo(() => {
    const regionalForecast = timelineScores.forecasts.get(regionalSpot.id);
    const selectedForecast = selectedSpot ? timelineScores.forecasts.get(selectedSpot.id) : undefined;
    return deriveSpotTimelineHourKeys([
      ...Object.keys(regionalForecast?.hours ?? {}),
      ...Object.keys(selectedForecast?.hours ?? {}),
      ...(weatherOverlay ? weatherHourKeys : []),
    ], now, timelineRange, activeCityConfig.timeZone);
  }, [now, regionalSpot.id, selectedSpot, timelineScores.forecasts, weatherHourKeys, weatherOverlay, timelineRange, activeCityConfig.timeZone]);


  // Use each metric's fixed semantic range while anchors progressively load.
  // This prevents identical weather from changing color as coverage grows.
  const legend24hRange = undefined;

  // Visible-area average for the legend marker position.
  const visibleMetricAvg = useMemo(() => {
    if (!weatherOverlay) return undefined;
    const samples = buildSamples(weatherMetric, activeWeatherHourKey, weatherForecasts);
    if (samples.size === 0) return undefined;

    let sum = 0;
    let count = 0;
    for (const s of samples.values()) {
      if (mapBounds) {
        if (s.lat < mapBounds.south || s.lat > mapBounds.north) continue;
        if (s.lng < mapBounds.west || s.lng > mapBounds.east) continue;
      }
      sum += s.value;
      count++;
    }
    return count > 0 ? sum / count : undefined;
  }, [activeWeatherHourKey, mapBounds, weatherForecasts, weatherMetric, weatherOverlay]);

  const handleReset = useCallback(() => {
    // Tier filters only — category selections are managed by
    // `resetCategoryFilter` and their own storage key so a tier reset
    // doesn't wipe them out.
    setFilters((prev) => ({ ...defaultFilters, category: prev.category }));
    try { localStorage.removeItem(FILTERS_KEY); } catch { /* non-fatal */ }
  }, []);

  const resetCategoryFilter = useCallback(() => {
    setFilters((prev) => ({ ...prev, category: [] }));
    try { localStorage.removeItem(CATEGORY_FILTER_STORAGE_KEY); } catch { /* non-fatal */ }
  }, []);

  // Refresh `now` every 60s so eventTimes and viewMode stay current.
  // Return to the start of the chosen range when the app returns from background.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    let foregroundArmId: ReturnType<typeof setTimeout> | undefined;
    const armForegroundReset = () => {
      if (foregroundResetArmedRef.current || foregroundArmId !== undefined) return;
      foregroundArmId = setTimeout(() => {
        foregroundArmId = undefined;
        if (document.visibilityState === 'visible') foregroundResetArmedRef.current = true;
      }, 1_000);
    };
    if (document.visibilityState === 'visible') armForegroundReset();
    const onVisibility = () => {
      const previousVisibility = documentVisibilityRef.current;
      const nextVisibility = document.visibilityState;
      documentVisibilityRef.current = nextVisibility;
      if (nextVisibility !== 'visible') {
        if (foregroundArmId !== undefined) {
          clearTimeout(foregroundArmId);
          foregroundArmId = undefined;
        }
        return;
      }

      const shouldResetTimeline = foregroundResetArmedRef.current && previousVisibility === 'hidden';
      if (shouldResetTimeline) {
        const resumedNow = new Date();
        setNow(resumedNow);
        setTimelineHourKey(rangeStartHourKey(resumedNow, timelineRange, activeCityConfig.timeZone));
        setTimelineEventTime(undefined);
        setInitialCardType('now');
      }
      armForegroundReset();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      if (foregroundArmId !== undefined) clearTimeout(foregroundArmId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [timelineRange, activeCityConfig.timeZone]);

  // Persist tier filters. Category is stored under its own key below.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const { category: _cat, ...tierFilters } = filters;
      void _cat;
      window.localStorage.setItem(FILTERS_KEY, JSON.stringify(tierFilters));
    } catch { /* non-fatal */ }
  }, [filters]);

  // Persist category filter separately so tier-reset (handleReset) and any
  // future storage-format changes to FILTERS_KEY don't collide with it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        CATEGORY_FILTER_STORAGE_KEY,
        JSON.stringify(filters.category),
      );
    } catch { /* non-fatal */ }
  }, [filters.category]);

  // Persist city selections.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(HOME_CITY_KEY, homeCityId);
    } catch { /* non-fatal */ }
  }, [homeCityId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(ACTIVE_CITY_KEY, activeCityId);
    } catch { /* non-fatal */ }
  }, [activeCityId]);

  const applyActiveCity = useCallback((city: City) => {
    cancelSpotDismissal();
    setActiveCityIdRaw(city);
    setSunsetBrowseOpen(false);
    setTimelineHourKey(rangeStartHourKey(now, timelineRange, getCityById(city)!.timeZone));
    setTimelineEventTime(undefined);
    setPlanningDefaultPending(timelineRange === '7d' && city === 'sf');
    setSelectedSpot(null);
    setHighlightedSpot(null);
    setInitialCardType(undefined);
    setMenuOpen(false);
    setSearchOpen(false);
    setFilters(defaultFilters);
    try { localStorage.removeItem(FILTERS_KEY); } catch { /* non-fatal */ }
    try { localStorage.removeItem(CATEGORY_FILTER_STORAGE_KEY); } catch { /* non-fatal */ }
    setCitySheetOpen(false);
    const config = getCityById(city);
    if (config && !config.hasWeatherMode) {
      setWeatherOverlay(false);
    }
  }, [cancelSpotDismissal, now, timelineRange]);

  const setActiveCity = useCallback((city: City) => {
    setManualCityMode(true);
    applyActiveCity(city);
  }, [applyActiveCity]);

  const activateLocatedCity = useCallback((city: City) => {
    setManualCityMode(false);
    applyActiveCity(city);
  }, [applyActiveCity]);

  const setHomeCity = useCallback((city: City) => {
    setHomeCityIdRaw(city);
    setActiveCity(city);
  }, [setActiveCity]);

  const handleRequestLocation = useCallback(async () => {
    const nextState = await requestLocation();
    if (nextState.status === 'allowed') setManualCityMode(false);
    return nextState;
  }, [requestLocation]);

  const handleOpenLocationSettings = useCallback(
    () => appSettingsController.open(),
    [],
  );

  const handleUseCityInstead = useCallback(() => {
    clearLocation();
    setManualCityMode(true);
    setTimelineHourKey(rangeStartHourKey(now, timelineRange, activeCityConfig.timeZone));
    setTimelineEventTime(undefined);
  }, [clearLocation, now, timelineRange, activeCityConfig.timeZone]);

  const handleOpenSavedSpots = useCallback(() => {
    setMenuOpen(false);
    setSavedSpotsSheetOpen(true);
  }, []);

  const handleCloseSavedSpots = useCallback(() => {
    setSavedSpotsSheetOpen(false);
    requestAnimationFrame(() => {
      const underlyingSpotSheet = document.querySelector<HTMLElement>(
        '[role="dialog"][aria-label$=" sky scores"]',
      );
      if (underlyingSpotSheet) underlyingSpotSheet.focus({ preventScroll: true });
      else document.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')?.focus();
    });
  }, []);

  // React batches these state updates into one render. A saved spot in another
  // city therefore opens with its city already active, without briefly clearing
  // the selection or showing the prior city's map state.
  const handleSelectSavedSpot = useCallback((spot: Spot) => {
    cancelSpotDismissal();
    setManualCityMode(true);
    setActiveCityIdRaw(spot.city);
    setTimelineHourKey(rangeStartHourKey(now, timelineRange, getCityById(spot.city)!.timeZone));
    setTimelineEventTime(undefined);
    setPlanningDefaultPending(timelineRange === '7d' && usesSkyExperience(spot));
    setCenteredSpotId(null);
    setSelectedSpot(spot);
    setHighlightedSpot(null);
    setSelectedEvent(null);
    setInitialCardType(undefined);
    setMenuOpen(false);
    setSearchOpen(false);
    setCitySheetOpen(false);
    setSavedSpotsSheetOpen(false);
    setFilters(defaultFilters);
    try { localStorage.removeItem(FILTERS_KEY); } catch { /* non-fatal */ }
    try { localStorage.removeItem(CATEGORY_FILTER_STORAGE_KEY); } catch { /* non-fatal */ }
    const config = getCityById(spot.city);
    if (config && !config.hasWeatherMode) setWeatherOverlay(false);
    requestAnimationFrame(() => {
      const expectedLabel = `${spot.name} sky scores`;
      const scoreSheet = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"]'),
      ).find((dialog) => dialog.getAttribute('aria-label') === expectedLabel);
      scoreSheet?.focus({ preventScroll: true });
    });
  }, [cancelSpotDismissal, now, timelineRange]);

  const handleToggleWeatherOverlay = useCallback(() => {
    setCloudPulseKey((k) => k + 1);
    setWeatherOverlay((prev) => {
      const next = !prev;
      if (next) {
        setSearchOpen(false);
        if (!isOnboardingDone(ONBOARDING_KEYS.weatherOverlay)) {
          markOnboardingDone(ONBOARDING_KEYS.weatherOverlay);
          setShowWeatherOverlayHint(false);
        }
        if (!isOnboardingDone(ONBOARDING_KEYS.metrics)) {
          setShowMetricsHint(true);
        }
      } else {
        setShowMetricsHint(false);
        setShowCompleteHint(false);
      }
      return next;
    });
  }, []);

  // Remove deep-link parameters after their values seed the initial state.
  useEffect(() => {
    if (!initialDeepLink.spot) return;
    const cleanUrl = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, '', cleanUrl);
  }, [initialDeepLink.spot]);

  const handleSelectSpot = useCallback((spot: Spot | null) => {
    cancelSpotDismissal();
    const prev = selectedSpot;
    if (spot && (!prev || prev.id !== spot.id)) setCenteredSpotId(null);
    // Card is being dismissed (spot is null) and there *was* something
    // selected, remember it so the map can highlight the pin the
    // user was just reading about. Without this hand-off, the pin
    // disappears into the crowd the moment the card slides away.
    if (spot === null && prev !== null) {
      setHighlightedSpot(prev);
      // Onboarding: dismissing a score panel is the trigger for the
      // "switch to weather" hint (one-shot). Also clear the in-panel
      // scroll-cards hint; if the user closed the panel without
      // swiping, we don't keep the hint queued forever, but we also
      // don't burn the flag — they may re-open another spot and we
      // still want them to see it.
      if (!isOnboardingDone(ONBOARDING_KEYS.scrubTimeline)) {
        setShowScrubHint(true);
      }
      setShowScrollCardsHint(false);
    } else if (spot !== null) {
      // Selecting a new spot supersedes any lingering highlight from a
      // previous dismiss, and closes any open event sheet (mutual exclusion).
      setHighlightedSpot(null);
      setSelectedEvent(null);
      // Onboarding: tapping any pin satisfies the "tap a spot" hint
      // and triggers the next step in the chain — the in-panel
      // "scroll between cards" hint.
      if (!isOnboardingDone(ONBOARDING_KEYS.tapSpot)) {
        markOnboardingDone(ONBOARDING_KEYS.tapSpot);
        setShowTapSpotHint(false);
      }
      if (!isOnboardingDone(ONBOARDING_KEYS.scrollCards)) {
        setShowScrollCardsHint(true);
      }
    }
    if (spot === null && prev && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setClosingSpotId(prev.id);

    } else setSelectedSpot(spot);
  }, [selectedSpot, cancelSpotDismissal]);

  const handleSelectRecommendation = useCallback((spotId: string) => {
    const spot = recommendationTargetSpots.find((candidate) => candidate.id === spotId);
    if (spot) handleSelectSpot(spot);
  }, [handleSelectSpot, recommendationTargetSpots]);

  // Selecting an event opens its editorial sheet and closes any open spot
  // ScorePanel — the two bottom sheets are mutually exclusive (Part 4).
  const handleSelectEvent = useCallback((event: CuratedEvent | null) => {
    cancelSpotDismissal();
    setSelectedEvent(event);
    if (event) setSelectedSpot(null);
  }, [cancelSpotDismissal]);

  // Auto-clear the dismiss highlight so the pulse doesn't loop forever and
  // the map stops trying to recenter once the user moves on.
  useEffect(() => {
    if (!highlightedSpot) return;
    const timer = window.setTimeout(() => {
      setHighlightedSpot(null);
    }, DISMISS_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlightedSpot]);

  const handleOpenSuggest = useCallback((seed = '') => {
    setSuggestSeed(seed);
    setSuggestOpen(true);
  }, []);

  const handleSuggestFromSearch = useCallback(
    (seed: string) => {
      setSearchOpen(false);
      handleOpenSuggest(seed);
    },
    [handleOpenSuggest],
  );

  const handleSuggestFromMenu = useCallback(() => {
    setMenuOpen(false);
    handleOpenSuggest('');
  }, [handleOpenSuggest]);

  const handleReportBugFromMenu = useCallback(() => {
    setMenuOpen(false);
    setBugReportOpen(true);
  }, []);

  // Onboarding dismissal handlers. Each writes the corresponding flag
  // so the prompt never reappears across sessions.
  const handleDismissTapSpotHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.tapSpot);
    setShowTapSpotHint(false);
  }, []);

  const handleDismissScrollCardsHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.scrollCards);
    setShowScrollCardsHint(false);
  }, []);

  // Card swipe inside the score panel — first time the user swipes
  // between cards, treat the scroll-cards hint as "got it" and put it
  // away. Tapping the hint or closing the panel are the two other
  // exit paths; this one is the most natural.
  const handleScorePanelCardSwipe = useCallback(() => {
    if (isOnboardingDone(ONBOARDING_KEYS.scrollCards)) return;
    markOnboardingDone(ONBOARDING_KEYS.scrollCards);
    setShowScrollCardsHint(false);
  }, []);

  const handleDismissWeatherOverlayHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.weatherOverlay);
    setShowWeatherOverlayHint(false);
  }, []);

  const handleDismissMetricsHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.metrics);
    setShowMetricsHint(false);
  }, []);

  // Wrap the metric setter so picking any metric (temp / clouds /
  // precip / wind / fog) auto-dismisses the metrics hint and advances
  // to the final completion step.
  const handleWeatherMetricChange = useCallback((metric: WeatherMetric) => {
    setWeatherMetric(metric);
    if (!isOnboardingDone(ONBOARDING_KEYS.metrics)) {
      markOnboardingDone(ONBOARDING_KEYS.metrics);
      setShowMetricsHint(false);
      if (!isOnboardingDone(ONBOARDING_KEYS.complete)) {
        setShowCompleteHint(true);
      }
    }
  }, []);

  const handleDismissScrubHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.scrubTimeline);
    setShowScrubHint(false);
  }, []);

  const handleDismissCompleteHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.complete);
    setShowCompleteHint(false);
  }, []);

  const weatherOverlayAvailable = activeCityConfig.hasWeatherMode;

  // Timeline hour change handler — also advances the onboarding chain.
  // After scrubbing, show the weather-overlay hint (SF only) or jump
  // straight to the completion hint for cities without weather mode.
  const handleTimelineHourChange = useCallback((key: string) => {
    setPlanningDefaultPending(false);
    setInitialCardType('now');
    setTimelineEventTime(undefined);
    setTimelineHourKey(key || rangeStartHourKey(now, timelineRange, activeCityConfig.timeZone));
    if (!isOnboardingDone(ONBOARDING_KEYS.scrubTimeline)) {
      markOnboardingDone(ONBOARDING_KEYS.scrubTimeline);
      setShowScrubHint(false);
      if (weatherOverlayAvailable && !isOnboardingDone(ONBOARDING_KEYS.weatherOverlay)) {
        setShowWeatherOverlayHint(true);
      } else if (!isOnboardingDone(ONBOARDING_KEYS.complete)) {
        setShowCompleteHint(true);
      }
    }
  }, [weatherOverlayAvailable, now, timelineRange, activeCityConfig.timeZone]);

  const handleSkyViewChange = useCallback((type: CardType, eventTime?: Date) => {
    setPlanningDefaultPending(false);
    setInitialCardType(type);
    const selected = eventTime ?? (type === 'now' ? undefined : timelineHourKey ? timelineEvents[type] : undefined);
    setTimelineEventTime(selected);
    if (selected) setTimelineHourKey(formatCanonicalHourKey(selected));
    else if (type === 'now') setTimelineHourKey(timelineRange === '7d'
      ? timelineHourKey || rangeStartHourKey(now, timelineRange, activeCityConfig.timeZone) : '');
  }, [timelineHourKey, timelineEvents, timelineRange, now, activeCityConfig.timeZone]);

  const handleTimelineRangeChange = useCallback((range: ForecastRange) => {
    setTimelineRange(range);
    setTimelineWeeklyView('week');
    const selection = selectedEventTime ?? (timelineHourKey ? parseCanonicalHourKey(timelineHourKey) : null);
    const { start, end } = forecastRangeWindow(now, range, activeCityConfig.timeZone);
    setPlanningDefaultPending(range === '7d' && usesSkyExperience(selectedSpot ?? regionalSpot) &&
      (!selection || selection < start || selection >= end));
    if (!selection || selection < start || selection >= end) {
      setTimelineHourKey(rangeStartHourKey(now, range, activeCityConfig.timeZone));
      setTimelineEventTime(undefined);
      setInitialCardType('now');
    }
    try { window.localStorage.setItem(FORECAST_RANGE_STORAGE_KEY, range); } catch { /* Keep the current session usable. */ }
  }, [now, selectedEventTime, timelineHourKey, activeCityConfig.timeZone, selectedSpot, regionalSpot]);

  let homeScopeNotice: HomeSheetScopeNotice | null = null;
  if (
    landingRecommendationEnabled &&
    !manualCityMode &&
    userLocation &&
    bestNearbyCoverage?.status === 'inside-configured-city' &&
    bestNearbyCoverage.city !== activeCityId
  ) {
    const suggestedCity = getCityById(bestNearbyCoverage.city);
    if (suggestedCity) {
      homeScopeNotice = {
        kind: 'city-mismatch',
        activeCityName: activeCityConfig.name,
        suggestedCityName: suggestedCity.name,
        onUseSuggestedCity: () => activateLocatedCity(suggestedCity.id),
        onKeepCurrentCity: () => setManualCityMode(true),
      };
    }
  } else if (
    landingRecommendationEnabled &&
    !manualCityMode &&
    userLocation &&
    bestNearbyCoverage?.status === 'outside-coverage'
  ) {
    const suggestedCity = bestNearbyCoverage.suggestedCity
      ? getCityById(bestNearbyCoverage.suggestedCity)
      : null;
    homeScopeNotice = {
      kind: 'outside-coverage',
      suggestedCityName: suggestedCity?.name ?? null,
      suggestionDistance: bestNearbyCoverage.suggestionDistanceMiles === null
        ? null
        : formatDistanceMiles(bestNearbyCoverage.suggestionDistanceMiles),
      onUseSuggestedCity: suggestedCity
        ? () => setActiveCity(suggestedCity.id)
        : undefined,
    };
  }

  const activeRecommendation = nearbyRecommendationResult ?? manualRecommendationResult;
  let recommendationCardProps: BestNearbyCardProps | null = null;
  if (landingRecommendationEnabled && activeRecommendation) {
    const claimKind: BestNearbyCardProps['claimKind'] = nearbyRecommendationResult
      ? 'best-nearby-now'
      : 'best-of-checked';
    const approximateDistance = nearbyRecommendationResult !== null &&
      userLocation?.precision !== 'precise';
    const candidates = activeRecommendation.candidates.map((candidate) =>
      toBestNearbyCardCandidate(candidate, approximateDistance),
    );
    const winner = activeRecommendation.best
      ? candidates.find((candidate) => candidate.id === activeRecommendation.best?.spot.id)
      : undefined;
    const cardState = activeRecommendation.state === 'ready-comparison' && winner
      ? 'ready'
      : activeRecommendation.state === 'loading-forecasts'
        ? 'loading'
        : activeRecommendation.state === 'no-supported-spots'
          ? 'no-supported-spots'
          : 'insufficient-evidence';
    const baseProps = {
      claimKind,
      cityName: activeCityConfig.name,
      comparedCount: activeRecommendation.comparableCandidates.length,
      candidates,
      onSelectSpot: handleSelectRecommendation,
      onRetry: candidates.length > 0 ? () => timelineScores.retryForecast() : undefined,
    };
    recommendationCardProps = cardState === 'ready' && winner
      ? { ...baseProps, state: 'ready', winner }
      : { ...baseProps, state: cardState === 'ready' ? 'insufficient-evidence' : cardState };
  }

  const planningSpot = selectedSpot ?? regionalSpot;
  const planningForecast = timelineScores.forecasts.get(planningSpot.id) ?? null;
  const planningDays = useMemo(() => usesSkyExperience(planningSpot) && timelineRange === '7d'
    ? buildPlanningDays(planningSpot, planningForecast, now, activeCityConfig.timeZone) : undefined,
  [timelineRange, planningSpot, planningForecast, now, activeCityConfig.timeZone]);
  useEffect(() => {
    if (!planningDefaultPending || timelineRange !== '7d' || selectedSkyView !== 'now') return;
    if (selectedSpot && !timelineScores.forecasts.has(selectedSpot.id) && !timelineScores.forecastErrors.has(selectedSpot.id)) return;
    const best = planningDays?.find(day => day.window)?.window;
    if (!best) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPlanningDefaultPending(false);
      setTimelineHourKey(formatCanonicalHourKey(new Date(best.start)));
      setTimelineEventTime(undefined);
      setInitialCardType('now');
    });
    return () => { cancelled = true; };
  }, [planningDefaultPending, timelineRange, selectedSkyView, selectedSpot, planningDays, timelineScores.forecasts, timelineScores.forecastErrors]);
  const comparisonInstant = useMemo(() => selectedEventTime ?? (timelineHourKey ? parseCanonicalHourKey(timelineHourKey) : now) ?? now,
    [selectedEventTime, timelineHourKey, now]);
  const comparisonSpots = useMemo(() => discoverySpots.filter(spot =>
    mapBounds && spot.lat >= mapBounds.south && spot.lat <= mapBounds.north &&
    spot.lng >= mapBounds.west && spot.lng <= mapBounds.east && passesSpotFilter(spot, filters, liveScores)),
  [discoverySpots, mapBounds, filters, liveScores]);
  const rankedSkySpots = useMemo(() => sunsetBrowseOpen ? rankSkySpots(comparisonSpots, liveScores, timelineScores.forecastErrors) : [],
    [sunsetBrowseOpen, comparisonSpots, liveScores, timelineScores.forecastErrors]);
  const pendingComparison = comparisonSpots.filter(spot => !timelineScores.forecasts.has(spot.id) &&
    !timelineScores.forecastErrors.has(spot.id)).length;
  const sunsetOpportunity = useMemo(() => selectedSpot && usesSkyExperience(selectedSpot)
    ? findSunsetOpportunity(selectedSpot, timelineScores.forecasts.get(selectedSpot.id) ?? null,
      getEventsForDate(selectedSpot, comparisonInstant, activeCityConfig.timeZone).sunset, now.getTime()) : null,
  [selectedSpot, timelineScores.forecasts, comparisonInstant, activeCityConfig.timeZone, now]);
  const browseSunset = () => {
    if (!sunsetBrowseOpen) {
      const day = getEventsForDate(regionalSpot, comparisonInstant, activeCityConfig.timeZone);
      handleSkyViewChange('sunset', day.sunset);
    }
    setSunsetBrowseOpen(open => !open);
  };
  const renderTimelineControls = (expanded = false) => (
    <UnifiedTimeline
      edgeToEdge={expanded}
      sunsetOpportunity={sunsetOpportunity ?? undefined}
      sunsetPlanningFresh={!!planningForecast && now.getTime() - planningForecast.fetchedAt <= 2 * 3_600_000 && !timelineScores.forecastErrors.has(planningSpot.id)}
      onBrowseSunset={!selectedSpot && activeCityId === 'sf' && !weatherOverlay ? browseSunset : undefined}
      sunsetBrowseOpen={sunsetBrowseOpen}
      weeklyView={timelineWeeklyView}
      onWeeklyViewChange={setTimelineWeeklyView}
      hourKeys={mapTimelineHourKeys}
      hourKey={effectiveHourKey}
      onHourChange={handleTimelineHourChange}
      selectedView={selectedSkyView}
      selectedEventTime={selectedEventTime}
      onViewChange={handleSkyViewChange}
      viewMode={viewMode}
      eventTimes={timelineEventDays}
      range={timelineRange}
      timeZone={activeCityConfig.timeZone}
      loading={!timelineScores.forecasts.has(regionalSpot.id) && !timelineScores.forecastErrors.has(regionalSpot.id)}
      now={now}
      planningDays={planningDays}
      planningScope={selectedSpot ? 'This spot' : 'City estimate'}
      planningFresh={!!planningForecast && now.getTime() - planningForecast.fetchedAt <= 2 * 3_600_000 && !timelineScores.forecastErrors.has(planningSpot.id)}
      loadingSpotCount={requestedSpotIds.filter(id => id !== regionalSpot.id && !timelineScores.forecasts.has(id) && !timelineScores.forecastErrors.has(id)).length}
    />
  );

  return (
    <div className="h-dvh min-h-dvh w-screen relative bg-cream font-mono overflow-hidden">
      {/* Map is pinned to the actual viewport (not just `dvh`) so it always
          paints behind the bottom sheet — including the home-indicator
          safe-area zone where any uncovered pixel would otherwise read as
          the body's water-blue fallback. */}
      <div className="fixed inset-0 z-0">
        <MapErrorBoundary>
        <MapView
          spots={discoverySpots}
          selectedSpot={selectedSpot}
          spotClosing={closingSpotId === selectedSpot?.id}
          onSpotCentered={handleSpotCentered}
          highlightedSpot={highlightedSpot}
          onSelectSpot={handleSelectSpot}
          onSelectEvent={handleSelectEvent}
          onDeselectSpot={() => handleSelectSpot(null)}
          userLocation={userLocation}
          filters={filters}
          liveScores={liveScores}
          weatherOverlay={weatherOverlay}
          cityConfig={activeCityConfig}
          weatherMetric={weatherMetric}
          weatherHourKey={activeWeatherHourKey}
          weatherForecasts={weatherForecasts}
          tapSpotHintActive={showTapSpotHint && !selectedSpot}
          onTapSpotAnchorChange={setTapSpotAnchor}
          onBoundsChange={setMapBounds}
        />
        </MapErrorBoundary>
      </div>

      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center gap-1.5 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2"
        style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingRight: 'max(0.75rem, env(safe-area-inset-right))' }}
      >
        {weatherOverlayAvailable && (
          <button
            type="button"
            onClick={handleToggleWeatherOverlay}
            className={`w-9 h-9 flex items-center justify-center rounded-full border-[0.5px] shadow-sm transition-all duration-300 flex-shrink-0 ${
              weatherOverlay
                ? 'border-pink-200/60 text-pink-50'
                : 'bg-white text-gray-600 border-black/[0.08] hover:bg-gray-50'
            }`}
            style={weatherOverlay ? { background: 'linear-gradient(135deg, #D946A8, #CC2936)' } : undefined}
            aria-label="Toggle weather overlay"
            aria-pressed={weatherOverlay}
          >
            <svg
              key={cloudPulseKey}
              className={weatherOverlay ? 'sun-spin' : 'sun-toggle-bounce'}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </button>
        )}
        <SearchBar onOpen={() => setSearchOpen(true)} />
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white border-[0.5px] border-black/[0.08] shadow-sm hover:bg-gray-50 transition-colors flex-shrink-0"
          aria-label="Settings"
          aria-expanded={menuOpen}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-gray-600 transition-transform duration-300 ${menuOpen ? 'rotate-90' : ''}`}
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {weatherOverlayAvailable && (
        <WeatherMetricToggle
          metric={weatherMetric}
          onChange={handleWeatherMetricChange}
          visible={weatherOverlay}
          currentAvg={visibleMetricAvg}
          labelRange={legend24hRange}
        />
      )}

      {weatherOverlay && weatherOverlayAvailable && (
        <WeatherOverlayStatus
          {...neighborhoodForecastState}
          metric={weatherMetric}
          hourKey={activeWeatherHourKey}
          visibleAverage={visibleMetricAvg}
          cityName={activeCityConfig.name}
          timeZone={activeCityConfig.timeZone}
          now={now}
        />
      )}

      {!selectedSpot && !selectedEvent && (
        <HomeSheet
          onChooseCity={() => setCitySheetOpen(true)}
          scopeNotice={homeScopeNotice}
          recommendation={sunsetBrowseOpen && activeCityId === 'sf' ? <SunsetSpots
            spots={rankedSkySpots} total={comparisonSpots.length} pending={pendingComparison} retrying={timelineScores.forecastRetrying}
            timeLabel={`${new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: activeCityConfig.timeZone }).format(comparisonInstant)} · ${formatInstantTimeLabel(comparisonInstant, activeCityConfig.timeZone)}`}
            onSelect={id => { const spot = activeSpots.find(spot => spot.id === id); if (spot) handleSelectSpot(spot); }}
            onClose={() => setSunsetBrowseOpen(false)} onRetry={() => timelineScores.retryForecast()}
          /> : !timelineHourKey && recommendationCardProps ? (
            <div>
              <BestNearbyCard {...recommendationCardProps} />
              {manualCityMode && userLocation && (
                <button
                  type="button"
                  onClick={() => setManualCityMode(false)}
                  className="mt-1 min-h-11 rounded-md px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-600 underline decoration-gray-400 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
                >
                  Use nearby results instead
                </button>
              )}
            </div>
          ) : undefined}

        />
      )}

      {!selectedSpot && (
        <aside ref={mapTimelineRef} className="map-timeline" aria-label="Map time controls">
          {renderTimelineControls()}
        </aside>
      )}
      {privateSpots.error && <div className="private-spots-error" role="status">{privateSpots.error}</div>}

      {locationPromptOpen && (
        <LocationPrompt
          state={location.state}
          onRequest={handleRequestLocation}
          onClose={closeLocationPrompt}
          onChooseCity={() => { closeLocationPrompt(); setCitySheetOpen(true); }}
          onUseCityInstead={() => { handleUseCityInstead(); closeLocationPrompt(); }}
          canOpenLocationSettings={appSettingsController.isAvailable()}
          onOpenLocationSettings={handleOpenLocationSettings}
        />
      )}

      <FilterMenu
        open={menuOpen}
        forecastRange={timelineRange}
        onForecastRangeChange={handleTimelineRangeChange}
        filters={filters}
        onChange={setFilters}
        onReset={handleReset}
        onResetCategory={resetCategoryFilter}
        onClose={() => setMenuOpen(false)}
        liveScores={liveScores}
        onSuggestSpot={handleSuggestFromMenu}
        onReportBug={handleReportBugFromMenu}
        city={activeCityId}
        homeCityId={homeCityId}
        onOpenCitySheet={() => setCitySheetOpen(true)}
        savedSpotsCount={savedSpots.savedSpotIds.length}
        onOpenSavedSpots={handleOpenSavedSpots}
        onOpenLocation={() => { setMenuOpen(false); setLocationPromptOpen(true); }}
        hasHiddenGems={hasHiddenGems}
        hiddenGemsOnly={hiddenGemsActive}
        onHiddenGemsChange={setHiddenGemsOnly}
      />


      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        spots={discoverySpots}
        hasHiddenGems={hasHiddenGems}
        hiddenGemsOnly={hiddenGemsActive}
        onHiddenGemsChange={setHiddenGemsOnly}
        liveScores={liveScores}
        userLocation={userLocation}
        onSelectSpot={handleSelectSpot}
        onSuggestSpot={handleSuggestFromSearch}
        city={activeCityId}
        viewMode={viewMode}
        timelineHourKey={effectiveHourKey}
        timeZone={activeCityConfig.timeZone}
        timelineNow={now}
        timelineEventTime={selectedEventTime}
      />

      <SuggestSpotOverlay
        open={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        initialName={suggestSeed}
      />

      <BugReportOverlay
        open={bugReportOpen}
        onClose={() => setBugReportOpen(false)}
      />

      {selectedSpot && (
        <ScorePanel
          mapReady={centeredSpotId === selectedSpot.id}
          closing={closingSpotId === selectedSpot.id}
          spot={selectedSpot}
          onClose={() => handleSelectSpot(null)}
          userLocation={userLocation}
          initialCardType={initialCardType}
          onActiveCardChange={handleSkyViewChange}
          travelMode={travelMode}
          onTravelModeChange={setTravelMode}
          liveScores={liveScores}
          onCardSwipe={handleScorePanelCardSwipe}
          city={activeCityId}
          viewMode={viewMode}
          timelineHourKey={effectiveHourKey}
          timelineEventTime={selectedEventTime}
          timelineControls={renderTimelineControls}
          timeZone={activeCityConfig.timeZone}
          forecast={timelineScores.forecasts.get(selectedSpot.id) ?? null}
          forecastLoading={
            !timelineScores.forecasts.has(selectedSpot.id) &&
            !timelineScores.forecastErrors.has(selectedSpot.id)
          }
          forecastError={timelineScores.forecastErrors.get(selectedSpot.id) ?? null}
          onRetryForecast={() => timelineScores.retryForecast(selectedSpot.id)}
          forecastRetrying={timelineScores.forecastRetrying}
          now={now}
          saved={savedSpots.isSaved(selectedSpot.id)}
          savedSpotsStatus={savedSpots.status}
          onSetSaved={(nextSaved) => nextSaved
            ? savedSpots.save(selectedSpot.id)
            : savedSpots.unsave(selectedSpot.id)}
        />
      )}

      {!weatherOverlay && selectedEvent && (
        <EventDetailSheet
          key={selectedEvent.id}
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onSelectSpot={(spot) => {
            setSelectedEvent(null);
            handleSelectSpot(spot);
          }}
          liveScores={liveScores}
          viewMode={viewMode}
        />
      )}

      {!weatherOverlay && showTapSpotHint && !selectedSpot && tapSpotAnchor && (
        <OnboardingHint
          message="Tap a spot to see its score"
          arrow="up"
          style={{
            left: tapSpotAnchor.x,
            top: tapSpotAnchor.y + 22,
            transform: 'translateX(-50%)',
          }}
          onDismiss={handleDismissTapSpotHint}
        />
      )}

      {!weatherOverlay && showScrollCardsHint && selectedSpot && (
        <OnboardingHint
          message="Swipe to see all 4 cards"
          arrow="swipe"
          positionClassName="bottom-[calc(min(82dvh,680px)-1rem)] left-1/2 -translate-x-1/2"
          onDismiss={handleDismissScrollCardsHint}
        />
      )}

      {!weatherOverlay && showWeatherOverlayHint && !selectedSpot && (
        <OnboardingHint
          message="Tap to see forecast-backed scores on the map"
          arrow="to-sun"
          positionClassName="top-[calc(env(safe-area-inset-top)+4.25rem)] left-[3.0625rem]"
          onDismiss={handleDismissWeatherOverlayHint}
        />
      )}

      {weatherOverlay && showMetricsHint && (
        <OnboardingHint
          message="Switch metrics to explore temp, wind, fog & more"
          arrow="to-sun"
          positionClassName="top-[calc(env(safe-area-inset-top)+6rem)] left-[3.25rem]"
          onDismiss={handleDismissMetricsHint}
        />
      )}

      {showScrubHint && !selectedSpot && (
        <OnboardingHint
          message="Drag the timeline to see future conditions"
          arrow="down"
          positionClassName="bottom-[calc(env(safe-area-inset-bottom)+6rem)] left-1/2 -translate-x-1/2"
          onDismiss={handleDismissScrubHint}
        />
      )}

      {showCompleteHint && (
        <OnboardingHint
          message="That's it — enjoy the view :)"
          arrow="none"
          positionClassName="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          onDismiss={handleDismissCompleteHint}
          autoDismissMs={3200}
          ariaLabel="Onboarding complete. Tap to dismiss."
        />
      )}

      {/* City picker bottom sheet — rendered at App level so it overlays everything */}
      <CitySheet
        open={citySheetOpen}
        onClose={() => setCitySheetOpen(false)}
        activeCityId={activeCityId}
        homeCityId={homeCityId}
        onSelectCity={setActiveCity}
        onSetHomeCity={setHomeCity}
      />

      <SavedSpotsSheet
        open={savedSpotsSheetOpen}
        onClose={handleCloseSavedSpots}
        spots={visibleSpots}
        savedSpotIds={savedSpots.savedSpotIds}
        status={savedSpots.status}
        error={savedSpots.error}
        onSelectSpot={handleSelectSavedSpot}
        onUnsave={savedSpots.unsave}
        onRetry={savedSpots.rehydrate}
      />

      <PWAInstallPrompt spotInteracted={!!selectedSpot} />
    </div>
  );
}

export default App;
