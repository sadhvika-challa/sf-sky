import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { type Spot, type City } from './data/spots';
import { allSpots } from './data/all-spots';
import { getCityById, getValidCityId } from './data/cities';
import { useGeolocation } from './hooks/useGeolocation';
import { useLiveScores } from './hooks/useLiveScores';
import { useNeighborhoodForecasts } from './hooks/useNeighborhoodForecasts';
import { useSwipeDismiss } from './hooks/useSwipeDismiss';
import MapView, { type MapPoint } from './components/MapView';
import ModeToggle from './components/ModeToggle';
import ScorePanel from './components/ScorePanel';
import FilterMenu from './components/FilterMenu';
import SearchBar from './components/SearchBar';
import SearchOverlay from './components/SearchOverlay';
import SuggestSpotOverlay from './components/SuggestSpotOverlay';
import BugReportOverlay from './components/BugReportOverlay';
import WeatherControls from './components/WeatherControls';
import WeatherMetricToggle from './components/WeatherMetricToggle';
import WeatherSheetExpanded from './components/WeatherSheetExpanded';
import InsightCard from './components/InsightCard';
import WelcomeCard from './components/WelcomeCard';
import OnboardingHint from './components/OnboardingHint';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import CitySheet from './components/CitySheet';
import MapErrorBoundary from './components/MapErrorBoundary';
import WeatherErrorBoundary from './components/WeatherErrorBoundary';
import type { ScoreTier } from './utils/scoring';
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
}

export type TravelMode = 'walk' | 'car';

export type AppMode = 'explore' | 'weather';

type CardType = 'sunrise' | 'sunset' | 'stargazing';

const APP_MODE_STORAGE_KEY = 'sf-sky:appMode';
const HOME_CITY_KEY = 'sky:homeCity';
const ACTIVE_CITY_KEY = 'sky:activeCity';

function readStoredAppMode(): AppMode {
  if (typeof window === 'undefined') return 'explore';
  try {
    const raw = window.localStorage.getItem(APP_MODE_STORAGE_KEY);
    return raw === 'weather' ? 'weather' : 'explore';
  } catch {
    return 'explore';
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
};

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
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [travelMode, setTravelMode] = useState<TravelMode>('walk');
  const [appMode, setAppMode] = useState<AppMode>(readStoredAppMode);
  const [homeCityId, setHomeCityIdRaw] = useState<City>(readStoredHomeCity);
  const [activeCityId, setActiveCityIdRaw] = useState<City>(() => readStoredActiveCity(readStoredHomeCity()));
  const [citySheetOpen, setCitySheetOpen] = useState(false);
  const activeCityConfig = getCityById(activeCityId) ?? getCityById('sf')!;
  const [weatherMetric, setWeatherMetric] = useState<WeatherMetric>('temp');
  const [weatherHourKey, setWeatherHourKey] = useState<string>('');
  const [weatherSheetExpanded, setWeatherSheetExpanded] = useState(false);
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
  const liveScores = useLiveScores(activeSpots);
  const { forecasts: weatherForecasts, hourKeys: weatherHourKeys } =
    useNeighborhoodForecasts(appMode === 'weather');

  const handleReset = useCallback(() => setFilters(defaultFilters), []);

  // Persist mode toggle so reloads remember the user's preference.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(APP_MODE_STORAGE_KEY, appMode);
    } catch {
      // Storage disabled / quota exceeded — non-fatal.
    }
  }, [appMode]);

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
    setCitySheetOpen(false);
    const config = getCityById(city);
    if (config && !config.hasWeatherMode && appMode === 'weather') {
      setAppMode('explore');
    }
  }, [appMode]);

  const setHomeCity = useCallback((city: City) => {
    setHomeCityIdRaw(city);
    setActiveCity(city);
  }, [setActiveCity]);

  // When weather forecasts arrive (or change), default the scrubber to the
  // hour closest to "now" so the user lands on real-time data first.
  useEffect(() => {
    if (appMode !== 'weather') return;
    if (weatherHourKeys.length === 0) return;
    if (weatherHourKey && weatherHourKeys.includes(weatherHourKey)) return;
    const now = nowHourKey();
    const exact = weatherHourKeys.indexOf(now);
    setWeatherHourKey(exact >= 0 ? weatherHourKeys[exact] : weatherHourKeys[0]);
  }, [appMode, weatherHourKeys, weatherHourKey]);

  const weatherNowIndex = useMemo(() => {
    if (weatherHourKeys.length === 0) return -1;
    return weatherHourKeys.indexOf(nowHourKey());
  }, [weatherHourKeys]);

  const handleModeChange = useCallback((mode: AppMode) => {
    setAppMode(mode);
    // Close any explore-mode overlays so the weather UI isn't fighting the
    // score panel / menu for the screen.
    if (mode === 'weather') {
      setSelectedSpot(null);
      setInitialCardType(undefined);
      setHighlightedSpot(null);
      setMenuOpen(false);
      setSearchOpen(false);
      // Snap the scrubber back to "now" on every entry so the user
      // always lands on present-time conditions instead of wherever
      // they left off scrubbing in a previous session. The effect
      // below picks up the empty key and resolves it to the live hour.
      setWeatherHourKey('');
      // Onboarding: switching into Weather satisfies the "switch to
      // weather" hint, and is the trigger to surface both the metrics
      // and the scrub-timeline hints (one-shot each). The two are at
      // opposite ends of the screen — top toggle vs bottom scrubber —
      // so showing them together doesn't crowd either.
      if (!isOnboardingDone(ONBOARDING_KEYS.weatherMode)) {
        markOnboardingDone(ONBOARDING_KEYS.weatherMode);
        setShowWeatherModeHint(false);
      }
      if (!isOnboardingDone(ONBOARDING_KEYS.metrics)) {
        setShowMetricsHint(true);
      }
      if (!isOnboardingDone(ONBOARDING_KEYS.scrubTimeline)) {
        setShowScrubHint(true);
      }
    } else {
      // Collapse the expanded weather sheet on mode-out so the next visit
      // to weather mode starts in the default compact layout.
      setWeatherSheetExpanded(false);
      // Hide weather-only hints when leaving weather; their flags are
      // only set on real interactions / explicit dismiss, so they can
      // re-appear on a future entry if still pending.
      setShowMetricsHint(false);
      setShowScrubHint(false);
      setShowCompleteHint(false);
    }
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
      if (!isOnboardingDone(ONBOARDING_KEYS.weatherMode)) {
        setShowWeatherModeHint(true);
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

  // Wrap the scrubber callback so any user-driven hour change auto-
  // dismisses the scrub-timeline hint AND fires the final "enjoy" hint
  // (the wrap-up of the onboarding flow). The "default to now" effect
  // calls `setWeatherHourKey` directly, so it doesn't fire this path
  // and won't accidentally dismiss / advance before the user actually
  // touches the slider.
  const handleWeatherHourChange = useCallback((key: string) => {
    setWeatherHourKey(key);
    if (!isOnboardingDone(ONBOARDING_KEYS.scrubTimeline)) {
      markOnboardingDone(ONBOARDING_KEYS.scrubTimeline);
      setShowScrubHint(false);
      // Final step: only show the wrap-up if the user actually got
      // here through the onboarding flow (i.e. they hadn't already
      // completed it on a previous session).
      if (!isOnboardingDone(ONBOARDING_KEYS.complete)) {
        setShowCompleteHint(true);
      }
    }
  }, []);

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
          appMode={appMode}
          cityConfig={activeCityConfig}
          weatherMetric={weatherMetric}
          weatherHourKey={weatherHourKey}
          weatherForecasts={weatherForecasts}
          tapSpotHintActive={
            appMode === 'explore' && showTapSpotHint && !selectedSpot
          }
          onTapSpotAnchorChange={setTapSpotAnchor}
        />
        </MapErrorBoundary>
      </div>

      {/* Floating top row — tight icon-only mode toggle on the left, with
          the rest of the row dedicated to either explore chrome (search +
          settings) or the weather metric selector. Single line so the map
          bleeds straight up to the status bar. */}
      <div
        className={`absolute top-0 left-0 right-0 z-20 flex items-center px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 ${
          appMode === 'explore' ? 'gap-1.5' : 'gap-2'
        }`}
      >
        <ModeToggle mode={appMode} onChange={handleModeChange} city={activeCityId} />
        {appMode === 'explore' ? (
          <>
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
          </>
        ) : (
          <WeatherMetricToggle metric={weatherMetric} onChange={handleWeatherMetricChange} />
        )}
      </div>

      {/* Insight card + bottom panel wrapped in an error boundary that
          falls back to explore mode if weather data crashes. */}
      <WeatherErrorBoundary onFallback={() => handleModeChange('explore')}>
      {appMode === 'weather' && (
        <InsightCard
          metric={weatherMetric}
          hourKey={weatherHourKey}
          hourKeys={weatherHourKeys}
          forecasts={weatherForecasts}
        />
      )}

      {/* Filter Menu — explore-only; weather mode has its own controls panel. */}
      {appMode === 'explore' && (
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
      )}

      {appMode === 'weather' && (
        <BottomPanel
          weatherMetric={weatherMetric}
          weatherHourKeys={weatherHourKeys}
          weatherHourKey={weatherHourKey}
          onWeatherHourChange={handleWeatherHourChange}
          weatherNowIndex={weatherNowIndex}
          weatherForecasts={weatherForecasts}
          weatherSheetExpanded={weatherSheetExpanded}
          onWeatherSheetExpandedChange={setWeatherSheetExpanded}
        />
      )}
      </WeatherErrorBoundary>

      {/* Search overlay — explore-only, full-screen, slides up from the bottom */}
      {appMode === 'explore' && (
        <SearchOverlay
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          spots={activeSpots}
          liveScores={liveScores}
          userLocation={userLocation}
          onSelectSpot={handleSelectSpot}
          onSuggestSpot={handleSuggestFromSearch}
          city={activeCityId}
        />
      )}

      {appMode === 'explore' && (
        <SuggestSpotOverlay
          open={suggestOpen}
          onClose={() => setSuggestOpen(false)}
          initialName={suggestSeed}
        />
      )}

      {appMode === 'explore' && (
        <BugReportOverlay
          open={bugReportOpen}
          onClose={() => setBugReportOpen(false)}
        />
      )}

      {/* Score Panel — explore-only modal overlay */}
      {appMode === 'explore' && selectedSpot && (
        <ScorePanel
          key={selectedSpot.id}
          spot={selectedSpot}
          onClose={() => handleSelectSpot(null)}
          userLocation={userLocation}
          initialCardType={initialCardType}
          travelMode={travelMode}
          onTravelModeChange={setTravelMode}
          liveScores={liveScores}
          onCardSwipe={handleScorePanelCardSwipe}
          city={activeCityId}
        />
      )}

      {/* Onboarding hints — handwritten labels with hand-drawn arrows
          pointing at the relevant UI. The chain is sequenced to follow
          a real user's path through the app:
            1. tap-spot       (explore, no panel) → arrow up at the map
            2. scroll-cards   (panel open)        → swipe arrow on panel
            3. weather-mode   (panel just closed) → arrow at mode toggle
            4. metrics        (weather mode)      → arrow at top toggle
            5. scrub-timeline (weather mode)      → arrow at scrubber
            6. complete       (after first scrub) → centered wrap-up
          Mode-scoping (e.g. the scrub hint never paints in explore)
          keeps each prompt anchored to the UI it's actually about. */}
      {appMode === 'explore' && showTapSpotHint && !selectedSpot && tapSpotAnchor && (
        <OnboardingHint
          message="Tap a spot to see tonight's score"
          arrow="up"
          // Anchored to the chosen pin's screen position via MapView.
          // `top` sits ~22px below the pin so the up-arrow's tip points
          // back at the pin; the -50% translateX centers the hint
          // horizontally on the pin.
          style={{
            left: tapSpotAnchor.x,
            top: tapSpotAnchor.y + 22,
            transform: 'translateX(-50%)',
          }}
          onDismiss={handleDismissTapSpotHint}
        />
      )}

      {/* Scroll-cards hint hugs the panel's top edge so it sits right
          above the cards (which start ~100px into the panel). The
          score panel caps at min(82dvh, 680px); on phones this sits
          just inside the panel header, on iPad-class screens it
          floats slightly above the panel — both read as "by the
          cards" rather than "at the top of the screen". */}
      {appMode === 'explore' && showScrollCardsHint && selectedSpot && (
        <OnboardingHint
          message="Swipe to see all 3 cards"
          arrow="swipe"
          positionClassName="bottom-[calc(min(82dvh,680px)-1rem)] left-1/2 -translate-x-1/2"
          onDismiss={handleDismissScrollCardsHint}
        />
      )}

      {/* Weather-mode hint uses the dedicated 'to-cloud' arrow whose
          tip is geometrically aligned to land on the cloud icon (the
          right-hand pill of the mode toggle). The arrow lives outside
          the clickable button (see OnboardingHint), so a tap on the
          cloud icon under the arrow goes straight to the toggle and
          switches modes — which auto-dismisses the hint via
          handleModeChange. */}
      {appMode === 'explore' && showWeatherModeHint && !selectedSpot && (
        <OnboardingHint
          message="Weather mode to see weather across the city"
          arrow="to-cloud"
          positionClassName="top-[calc(env(safe-area-inset-top)+4.25rem)] left-[3.0625rem]"
          onDismiss={handleDismissWeatherModeHint}
        />
      )}

      {appMode === 'weather' && showMetricsHint && (
        <OnboardingHint
          message="Click to switch between modes to see different things"
          arrow="up"
          positionClassName="top-[calc(env(safe-area-inset-top)+3.75rem)] left-1/2 -translate-x-1/2"
          onDismiss={handleDismissMetricsHint}
        />
      )}

      {appMode === 'weather' && showScrubHint && (
        <OnboardingHint
          message="Drag to see how conditions change tonight"
          arrow="down"
          positionClassName="bottom-[calc(env(safe-area-inset-bottom)+6rem)] left-1/2 -translate-x-1/2"
          onDismiss={handleDismissScrubHint}
        />
      )}

      {appMode === 'weather' && showCompleteHint && (
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

interface BottomPanelProps {
  weatherMetric: WeatherMetric;
  weatherHourKeys: string[];
  weatherHourKey: string;
  onWeatherHourChange: (key: string) => void;
  weatherNowIndex: number;
  weatherForecasts: ReturnType<typeof useNeighborhoodForecasts>['forecasts'];
  weatherSheetExpanded: boolean;
  onWeatherSheetExpandedChange: (expanded: boolean) => void;
}

/**
 * Weather-mode bottom sheet. The pill handle only appears when the sheet
 * is expanded (so swipe-down can collapse it); in the compact state we
 * show a chevron-up affordance instead so users never see a drag handle
 * for a gesture that does nothing.
 */
function BottomPanel({
  weatherMetric,
  weatherHourKeys,
  weatherHourKey,
  onWeatherHourChange,
  weatherNowIndex,
  weatherForecasts,
  weatherSheetExpanded,
  onWeatherSheetExpandedChange,
}: BottomPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const canSwipeDown = weatherSheetExpanded;

  const handleDismiss = useCallback(() => {
    onWeatherSheetExpandedChange(false);
  }, [onWeatherSheetExpandedChange]);

  const { dragY, isDragging, suppressClickRef, handlers, reset } = useSwipeDismiss({
    onDismiss: handleDismiss,
    enabled: canSwipeDown,
    distanceThreshold: 80,
  });

  // If the parent collapses the sheet (e.g. mode switch), make sure any
  // in-flight drag transform clears so the panel doesn't snap back from a
  // stale offset on the next interaction.
  useEffect(() => {
    if (!canSwipeDown) reset();
  }, [canSwipeDown, reset]);

  const handlePillClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (weatherSheetExpanded) {
      onWeatherSheetExpandedChange(false);
    }
  };

  const showPill = canSwipeDown;
  const showExpandChevron = !weatherSheetExpanded;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30">
      {/* Panel chrome bleeds all the way to the screen bottom (safe area
          absorbed as inner padding) so the cream never lifts off the
          edge — otherwise the body's water-blue bg shows as a strip
          below the panel on devices with a home indicator. */}
      <div
        ref={panelRef}
        className="mx-auto w-[min(560px,100%)] rounded-t-3xl bg-[rgba(250,250,248,0.97)] backdrop-blur-md border-t border-x border-white/60 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: dragY ? `translate3d(0, ${dragY}px, 0)` : undefined,
          transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: isDragging ? 'transform' : undefined,
        }}
      >
        {showPill ? (
          <button
            type="button"
            onClick={handlePillClick}
            onPointerDown={handlers.onPointerDown}
            onPointerMove={handlers.onPointerMove}
            onPointerUp={handlers.onPointerUp}
            onPointerCancel={handlers.onPointerCancel}
            className="w-full flex justify-center pt-2 pb-1 group touch-none"
            style={{ touchAction: 'none' }}
            aria-label="Swipe down to collapse weather details"
            aria-expanded={weatherSheetExpanded}
          >
            <span className="block w-9 h-1 rounded-full bg-gray-300 group-hover:bg-gray-400 transition-colors" />
          </button>
        ) : showExpandChevron ? (
          <button
            type="button"
            onClick={() => onWeatherSheetExpandedChange(true)}
            className="w-full flex justify-center pt-1.5 pb-0.5 group"
            aria-label="Expand weather details"
            aria-expanded={false}
          >
            <svg
              width="18"
              height="10"
              viewBox="0 0 18 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="text-gray-400 group-hover:text-gray-600 transition-colors"
            >
              <path d="M2 7l7-5 7 5" />
            </svg>
          </button>
        ) : (
          <div className="h-2.5" aria-hidden="true" />
        )}

        <div className="px-3 pb-3">
          <WeatherControls
            hourKeys={weatherHourKeys}
            hourKey={weatherHourKey}
            onHourChange={onWeatherHourChange}
            nowIndex={weatherNowIndex}
          />
        </div>

        <div
          className="overflow-hidden transition-[max-height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-t border-black/5"
          style={{
            maxHeight: weatherSheetExpanded ? '540px' : '0px',
          }}
          aria-hidden={!weatherSheetExpanded}
        >
          <WeatherSheetExpanded
            metric={weatherMetric}
            hourKey={weatherHourKey}
            hourKeys={weatherHourKeys}
            forecasts={weatherForecasts}
            onHourChange={onWeatherHourChange}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
