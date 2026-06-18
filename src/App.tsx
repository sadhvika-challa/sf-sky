import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { type Spot, type City } from './data/spots';
import { allSpots } from './data/all-spots';
import { getCityById, getValidCityId } from './data/cities';
import { useGeolocation } from './hooks/useGeolocation';
import { useTimelineScores } from './hooks/useTimelineScores';
import { useNeighborhoodForecasts } from './hooks/useNeighborhoodForecasts';
import MapView, { type MapBounds, type MapPoint } from './components/MapView';
import { buildSamples } from './utils/weatherSamples';
import { computeDynamicRange } from './utils/interpolate';
import ScorePanel from './components/ScorePanel';
import FilterMenu from './components/FilterMenu';
import SearchBar from './components/SearchBar';
import SearchOverlay from './components/SearchOverlay';
import SuggestSpotOverlay from './components/SuggestSpotOverlay';
import BugReportOverlay from './components/BugReportOverlay';
import UnifiedTimeline from './components/UnifiedTimeline';
import WeatherMetricToggle from './components/WeatherMetricToggle';
import WelcomeCard from './components/WelcomeCard';
import OnboardingHint from './components/OnboardingHint';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import CitySheet from './components/CitySheet';
import MapErrorBoundary from './components/MapErrorBoundary';
import type { ScoreTier, ViewMode } from './utils/scoring';
import { resolveViewMode, computeEventTimes, type EventTimes } from './utils/events';
import type { WeatherMetric } from './utils/interpolate';
import {
  ONBOARDING_KEYS,
  isOnboardingDone,
  markOnboardingDone,
} from './utils/onboarding';
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
}

export type TravelMode = 'walk' | 'car';

type CardType = 'now' | 'sunrise' | 'sunset' | 'stargazing';

const WEATHER_OVERLAY_KEY = 'sf-sky:weatherOverlay';
const FILTERS_KEY = 'sf-sky:filters';
const HOME_CITY_KEY = 'sky:homeCity';
const ACTIVE_CITY_KEY = 'sky:activeCity';

function readStoredWeatherOverlay(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(WEATHER_OVERLAY_KEY) === 'true';
  } catch {
    return false;
  }
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

/**
 * "YYYY-MM-DDTHH" key for the current local hour. Matches the format
 * `weather.ts` uses for `SpotForecast.hours`.
 */
function nowHourKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}`;
}

const defaultFilters: Filters = {
  sunrise: [],
  sunset: [],
  stargazing: [],
  now: [],
};

function readStoredFilters(): Filters {
  if (typeof window === 'undefined') return defaultFilters;
  try {
    const raw = window.localStorage.getItem(FILTERS_KEY);
    if (!raw) return defaultFilters;
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
      };
    }
    return defaultFilters;
  } catch {
    return defaultFilters;
  }
}

function isCardType(value: string | null): value is CardType {
  return value === 'sunrise' || value === 'sunset' || value === 'stargazing';
}

// How long the just-dismissed pin keeps its highlight ring + how long the
// map "remembers" to recenter on it. Long enough for the eye to land on the
// pulse, short enough that it fades before it starts to feel like noise.
const DISMISS_HIGHLIGHT_MS = 1600;

function App() {
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [initialCardType, setInitialCardType] = useState<CardType | undefined>(undefined);
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
  const [weatherOverlay, setWeatherOverlay] = useState(readStoredWeatherOverlay);
  const [cloudPulseKey, setCloudPulseKey] = useState(0);
  const [homeCityId, setHomeCityIdRaw] = useState<City>(readStoredHomeCity);
  const [activeCityId, setActiveCityIdRaw] = useState<City>(() => readStoredActiveCity(readStoredHomeCity()));
  const [citySheetOpen, setCitySheetOpen] = useState(false);
  const activeCityConfig = getCityById(activeCityId) ?? getCityById('sf')!;
  const [weatherMetric, setWeatherMetric] = useState<WeatherMetric>('temp');
  const [timelineHourKey, setTimelineHourKey] = useState<string>('');

  // Derive viewMode from the scrubbed hour. When at '' (now), use city centroid
  // to resolve the current time-of-day mode.
  const viewMode: ViewMode = useMemo(() => {
    const lat = activeCityConfig.center[0];
    const lng = activeCityConfig.center[1];
    if (timelineHourKey === '') {
      return resolveViewMode(new Date(), lat, lng);
    }
    const scrubbed = new Date(`${timelineHourKey}:00:00`);
    return resolveViewMode(scrubbed, lat, lng);
  }, [timelineHourKey, activeCityConfig]);

  // Pre-compute event times for the timeline rail.
  const [now, setNow] = useState(() => new Date());
  const eventTimes: EventTimes = useMemo(() => {
    const lat = activeCityConfig.center[0];
    const lng = activeCityConfig.center[1];
    return computeEventTimes(now, lat, lng);
  }, [now, activeCityConfig]);
  // Onboarding: welcome card on first load, then a chain of one-time
  // hints tied to specific interactions. Each step is gated by a
  // localStorage flag (see `utils/onboarding.ts`); the component-level
  // state below tracks the in-session "is this currently visible"
  // question. Order roughly mirrors the natural usage path:
  //   welcome → tap-spot → scroll-cards → weather-mode →
  //   metrics + scrub-timeline → complete
  const [showWelcome, setShowWelcome] = useState(
    () => !isOnboardingDone(ONBOARDING_KEYS.welcome),
  );
  const [showTapSpotHint, setShowTapSpotHint] = useState(false);
  // Pixel position of the pin we anchor the tap-spot hint to. Driven
  // by MapView's `TapSpotAnchorTracker` so the hint follows the chosen
  // pin as the user pans/zooms while the hint is up.
  const [tapSpotAnchor, setTapSpotAnchor] = useState<MapPoint | null>(null);
  const [showScrollCardsHint, setShowScrollCardsHint] = useState(false);
  const [showWeatherModeHint, setShowWeatherModeHint] = useState(false);
  const [showMetricsHint, setShowMetricsHint] = useState(false);
  const [showScrubHint, setShowScrubHint] = useState(false);
  const [showCompleteHint, setShowCompleteHint] = useState(false);
  const activeSpots = useMemo(
    () => allSpots.filter((s) => s.city === activeCityId),
    [activeCityId],
  );
  const userLocation = useGeolocation();
  const liveScores = useTimelineScores(activeSpots, timelineHourKey, viewMode);
  const { forecasts: weatherForecasts, hourKeys: weatherHourKeys } =
    useNeighborhoodForecasts(true);

  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);

  // Stable 24h range for legend labels — computed once from all hours, never
  // changes as the user scrubs the timeline.
  const legend24hRange = useMemo(() => {
    if (!weatherOverlay || weatherForecasts.size === 0 || weatherHourKeys.length === 0) return undefined;
    const allValues: number[] = [];
    for (const hk of weatherHourKeys) {
      const samples = buildSamples(weatherMetric, hk, weatherForecasts);
      for (const s of samples.values()) allValues.push(s.value);
    }
    return computeDynamicRange(weatherMetric, allValues) ?? undefined;
  }, [weatherOverlay, weatherMetric, weatherForecasts, weatherHourKeys]);

  // Visible-area average for the legend marker position.
  const visibleMetricAvg = useMemo(() => {
    if (!weatherOverlay) return undefined;
    const hourKey = timelineHourKey || nowHourKey();
    const samples = buildSamples(weatherMetric, hourKey, weatherForecasts);
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
  }, [weatherOverlay, weatherMetric, timelineHourKey, weatherForecasts, mapBounds]);

  const handleReset = useCallback(() => {
    setFilters(defaultFilters);
    try { localStorage.removeItem(FILTERS_KEY); } catch { /* non-fatal */ }
  }, []);

  // Refresh `now` every 60s so eventTimes and viewMode stay current.
  // Also reset the timeline to "now" when the app returns from background.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setNow(new Date());
        setTimelineHourKey('');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // One-time migration from the old appMode key.
  useEffect(() => {
    try {
      const old = localStorage.getItem('sf-sky:appMode');
      if (old === 'weather') {
        localStorage.setItem(WEATHER_OVERLAY_KEY, 'true');
        setWeatherOverlay(true);
      }
      localStorage.removeItem('sf-sky:appMode');
    } catch { /* non-fatal */ }
  }, []);

  // Persist overlay preference.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(WEATHER_OVERLAY_KEY, String(weatherOverlay));
    } catch { /* non-fatal */ }
  }, [weatherOverlay]);

  // Persist tier filters.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    } catch { /* non-fatal */ }
  }, [filters]);

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

  const setActiveCity = useCallback((city: City) => {
    setActiveCityIdRaw(city);
    setSelectedSpot(null);
    setHighlightedSpot(null);
    setInitialCardType(undefined);
    setMenuOpen(false);
    setSearchOpen(false);
    setFilters(defaultFilters);
    try { localStorage.removeItem(FILTERS_KEY); } catch { /* non-fatal */ }
    setCitySheetOpen(false);
    const config = getCityById(city);
    if (config && !config.hasWeatherMode) {
      setWeatherOverlay(false);
    }
  }, []);

  const setHomeCity = useCallback((city: City) => {
    setHomeCityIdRaw(city);
    setActiveCity(city);
  }, [setActiveCity]);

  const handleToggleWeatherOverlay = useCallback(() => {
    setCloudPulseKey((k) => k + 1);
    setWeatherOverlay((prev) => {
      const next = !prev;
      if (next) {
        setSearchOpen(false);
        if (!isOnboardingDone(ONBOARDING_KEYS.weatherMode)) {
          markOnboardingDone(ONBOARDING_KEYS.weatherMode);
          setShowWeatherModeHint(false);
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

  // Deep-link: ?spot=<id>&view=<sunrise|sunset|stargazing>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spotParam = params.get('spot');
    const viewParam = params.get('view');
    if (!spotParam) return;

    const match = allSpots.find((s) => s.id === spotParam);
    if (!match) return;

    if (match.city !== activeCityId) {
      setActiveCityIdRaw(match.city);
    }
    setSelectedSpot(match);
    if (isCardType(viewParam)) setInitialCardType(viewParam);

    const cleanUrl = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, '', cleanUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Latest-selected spot, mirrored into a ref so `handleSelectSpot` (which
  // intentionally has no deps) can branch on the prior selection without
  // capturing a stale closure or doing a setState-from-updater.
  const selectedSpotRef = useRef<Spot | null>(null);
  useEffect(() => {
    selectedSpotRef.current = selectedSpot;
  }, [selectedSpot]);

  const handleSelectSpot = useCallback((spot: Spot | null) => {
    const prev = selectedSpotRef.current;
    // Card is being dismissed (spot is null) and there *was* something
    // selected — remember it so the map can recenter + pulse the pin the
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
      // previous dismiss.
      setHighlightedSpot(null);
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
    setSelectedSpot(spot);
    setInitialCardType(undefined);
  }, []);

  // Auto-clear the dismiss highlight so the pulse doesn't loop forever and
  // the map stops trying to recenter once the user moves on.
  useEffect(() => {
    if (!highlightedSpot) return;
    const timer = window.setTimeout(() => {
      setHighlightedSpot(null);
    }, DISMISS_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlightedSpot]);

  // Close score panel when the user scrubs the timeline — the panel content
  // is anchored to a specific moment and scrubbing away invalidates it.
  const prevTimelineKeyRef = useRef(timelineHourKey);
  useEffect(() => {
    if (prevTimelineKeyRef.current !== timelineHourKey && selectedSpot) {
      setSelectedSpot(null);
    }
    prevTimelineKeyRef.current = timelineHourKey;
  }, [timelineHourKey, selectedSpot]);

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
  const handleDismissWelcome = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.welcome);
    setShowWelcome(false);
    // Hand off to the tap-spot hint immediately, but only when this is a
    // genuine first-visit chain — if the user has already tapped a pin
    // in some prior session, skip it entirely.
    if (!isOnboardingDone(ONBOARDING_KEYS.tapSpot)) {
      setShowTapSpotHint(true);
    }
  }, []);

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

  const handleDismissWeatherModeHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.weatherMode);
    setShowWeatherModeHint(false);
  }, []);

  const handleDismissMetricsHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.metrics);
    setShowMetricsHint(false);
  }, []);

  // Wrap the metric setter so picking any metric (temp / clouds /
  // precip / wind / fog) auto-dismisses the metrics hint.
  const handleWeatherMetricChange = useCallback((metric: WeatherMetric) => {
    setWeatherMetric(metric);
    if (!isOnboardingDone(ONBOARDING_KEYS.metrics)) {
      markOnboardingDone(ONBOARDING_KEYS.metrics);
      setShowMetricsHint(false);
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

  // Timeline hour change handler — also advances the onboarding chain.
  const handleTimelineHourChange = useCallback((key: string) => {
    setTimelineHourKey(key);
    if (!isOnboardingDone(ONBOARDING_KEYS.scrubTimeline)) {
      markOnboardingDone(ONBOARDING_KEYS.scrubTimeline);
      setShowScrubHint(false);
      if (!isOnboardingDone(ONBOARDING_KEYS.complete)) {
        setShowCompleteHint(true);
      }
    }
  }, []);

  const weatherOverlayAvailable = activeCityConfig.hasWeatherMode;

  return (
    <div className="h-dvh min-h-dvh w-screen relative bg-cream font-mono overflow-hidden">
      {/* Map is pinned to the actual viewport (not just `dvh`) so it always
          paints behind the bottom sheet — including the home-indicator
          safe-area zone where any uncovered pixel would otherwise read as
          the body's water-blue fallback. */}
      <div className="fixed inset-0 z-0">
        <MapErrorBoundary>
        <MapView
          spots={activeSpots}
          selectedSpot={selectedSpot}
          highlightedSpot={highlightedSpot}
          onSelectSpot={handleSelectSpot}
          onDeselectSpot={() => handleSelectSpot(null)}
          userLocation={userLocation}
          filters={filters}
          liveScores={liveScores}
          viewMode={viewMode}
          weatherOverlay={weatherOverlay}
          cityConfig={activeCityConfig}
          weatherMetric={weatherMetric}
          weatherHourKey={timelineHourKey || nowHourKey()}
          weatherForecasts={weatherForecasts}
          tapSpotHintActive={showTapSpotHint && !selectedSpot}
          onTapSpotAnchorChange={setTapSpotAnchor}
          onBoundsChange={setMapBounds}
        />
        </MapErrorBoundary>
      </div>

      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center gap-1.5 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2"
      >
        {weatherOverlayAvailable && (
          <button
            type="button"
            onClick={handleToggleWeatherOverlay}
            className={`w-9 h-9 flex items-center justify-center rounded-full border-[0.5px] shadow-sm transition-all duration-300 flex-shrink-0 ${
              weatherOverlay
                ? 'border-pink-200/60 text-pink-50'
                : 'bg-[rgba(250,250,248,0.95)] text-gray-600 border-black/[0.08] hover:bg-[rgba(250,250,248,1)]'
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
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[rgba(250,250,248,0.95)] border-[0.5px] border-black/[0.08] shadow-sm hover:bg-[rgba(250,250,248,1)] transition-colors flex-shrink-0"
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

      {!selectedSpot && (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 bg-white/95 backdrop-blur-sm rounded-t-xl shadow-[0_-2px_10px_rgba(0,0,0,0.08)]"
        >
          <UnifiedTimeline
            hourKeys={weatherHourKeys}
            hourKey={timelineHourKey}
            onHourChange={handleTimelineHourChange}
            viewMode={viewMode}
            eventTimes={eventTimes}
          />
        </div>
      )}

      <FilterMenu
        open={menuOpen}
        filters={filters}
        onChange={setFilters}
        onReset={handleReset}
        onClose={() => setMenuOpen(false)}
        liveScores={liveScores}
        onSuggestSpot={handleSuggestFromMenu}
        onReportBug={handleReportBugFromMenu}
        city={activeCityId}
        homeCityId={homeCityId}
        onOpenCitySheet={() => setCitySheetOpen(true)}
      />


      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        spots={activeSpots}
        liveScores={liveScores}
        userLocation={userLocation}
        onSelectSpot={handleSelectSpot}
        onSuggestSpot={handleSuggestFromSearch}
        city={activeCityId}
        viewMode={viewMode}
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
          key={selectedSpot.id}
          spot={selectedSpot}
          onClose={() => handleSelectSpot(null)}
          userLocation={userLocation}
          initialCardType={initialCardType ?? viewMode}
          travelMode={travelMode}
          onTravelModeChange={setTravelMode}
          liveScores={liveScores}
          onCardSwipe={handleScorePanelCardSwipe}
          city={activeCityId}
          viewMode={viewMode}
          timelineHourKey={timelineHourKey}
        />
      )}

      {!weatherOverlay && showTapSpotHint && !selectedSpot && tapSpotAnchor && (
        <OnboardingHint
          message="Tap a spot to see tonight's score"
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
          message="Swipe to see all 3 cards"
          arrow="swipe"
          positionClassName="bottom-[calc(min(82dvh,680px)-1rem)] left-1/2 -translate-x-1/2"
          onDismiss={handleDismissScrollCardsHint}
        />
      )}

      {!weatherOverlay && showWeatherModeHint && !selectedSpot && (
        <OnboardingHint
          message="Tap to see live weather across the city"
          arrow="to-cloud"
          positionClassName="top-[calc(env(safe-area-inset-top)+4.25rem)] left-[3.0625rem]"
          onDismiss={handleDismissWeatherModeHint}
        />
      )}

      {weatherOverlay && showMetricsHint && (
        <OnboardingHint
          message="Switch metrics to see temp, wind, fog, and more"
          arrow="to-cloud"
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

      {/* Welcome card — first-ever load only. Rendered last so its
          backdrop sits above all other floating UI. */}
      {showWelcome && <WelcomeCard onDismiss={handleDismissWelcome} />}

      <PWAInstallPrompt spotInteracted={!!selectedSpot} />
    </div>
  );
}

export default App;
