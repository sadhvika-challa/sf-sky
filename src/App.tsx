import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { spots, type Spot } from './data/spots';
import { useGeolocation } from './hooks/useGeolocation';
import { useLiveScores } from './hooks/useLiveScores';
import { useNeighborhoodForecasts } from './hooks/useNeighborhoodForecasts';
import { useSwipeDismiss } from './hooks/useSwipeDismiss';
import MapView from './components/MapView';
import ModeToggle from './components/ModeToggle';
import ScorePanel from './components/ScorePanel';
import FilterMenu from './components/FilterMenu';
import SearchBar from './components/SearchBar';
import SearchOverlay from './components/SearchOverlay';
import SuggestSpotOverlay from './components/SuggestSpotOverlay';
import WeatherControls from './components/WeatherControls';
import WeatherMetricToggle from './components/WeatherMetricToggle';
import WeatherSheetExpanded from './components/WeatherSheetExpanded';
import InsightCard from './components/InsightCard';
import type { ScoreTier } from './utils/scoring';
import type { WeatherMetric } from './utils/interpolate';
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

function readStoredAppMode(): AppMode {
  if (typeof window === 'undefined') return 'explore';
  try {
    const raw = window.localStorage.getItem(APP_MODE_STORAGE_KEY);
    return raw === 'weather' ? 'weather' : 'explore';
  } catch {
    return 'explore';
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

function App() {
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [initialCardType, setInitialCardType] = useState<CardType | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  // Pre-fill the suggest form when the user lands there from a no-results
  // search; otherwise it opens blank.
  const [suggestSeed, setSuggestSeed] = useState('');
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [travelMode, setTravelMode] = useState<TravelMode>('walk');
  const [appMode, setAppMode] = useState<AppMode>(readStoredAppMode);
  const [weatherMetric, setWeatherMetric] = useState<WeatherMetric>('temp');
  const [weatherHourKey, setWeatherHourKey] = useState<string>('');
  const [weatherSheetExpanded, setWeatherSheetExpanded] = useState(false);
  const userLocation = useGeolocation();
  const liveScores = useLiveScores(spots);
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
      setMenuOpen(false);
      setSearchOpen(false);
    } else {
      // Collapse the expanded weather sheet on mode-out so the next visit
      // to weather mode starts in the default compact layout.
      setWeatherSheetExpanded(false);
    }
  }, []);

  // Deep-link: ?spot=<id>&view=<sunrise|sunset|stargazing>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spotParam = params.get('spot');
    const viewParam = params.get('view');
    if (!spotParam) return;

    const spotId = Number(spotParam);
    if (!Number.isFinite(spotId)) return;

    const match = spots.find((s) => s.id === spotId);
    if (!match) return;

    setSelectedSpot(match);
    if (isCardType(viewParam)) setInitialCardType(viewParam);

    // Clean the URL so future shares don't accumulate stale params
    const cleanUrl = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, '', cleanUrl);
  }, []);

  const handleSelectSpot = useCallback((spot: Spot | null) => {
    setSelectedSpot(spot);
    setInitialCardType(undefined);
  }, []);

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

  return (
    <div className="h-dvh w-screen relative bg-cream font-mono overflow-hidden">
      {/* Map fills the full viewport; the header and outlook bar float over it. */}
      <div className="absolute inset-0 z-0">
        <MapView
          selectedSpot={selectedSpot}
          onSelectSpot={handleSelectSpot}
          onDeselectSpot={() => handleSelectSpot(null)}
          userLocation={userLocation}
          filters={filters}
          liveScores={liveScores}
          appMode={appMode}
          weatherMetric={weatherMetric}
          weatherHourKey={weatherHourKey}
          weatherForecasts={weatherForecasts}
        />
      </div>

      {/* Floating top row — tight icon-only mode toggle on the left, with
          the rest of the row dedicated to either explore chrome (search +
          settings) or the weather metric selector. Single line so the map
          bleeds straight up to the status bar. */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2"
      >
        <ModeToggle mode={appMode} onChange={handleModeChange} />
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
          <WeatherMetricToggle metric={weatherMetric} onChange={setWeatherMetric} />
        )}
      </div>

      {/* Insight card — Karl narrates the weather. Sits just below the
          mode toggle in weather mode; updates on hour scrub. */}
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
        />
      )}

      {appMode === 'weather' && (
        <BottomPanel
          weatherMetric={weatherMetric}
          weatherHourKeys={weatherHourKeys}
          weatherHourKey={weatherHourKey}
          onWeatherHourChange={setWeatherHourKey}
          weatherNowIndex={weatherNowIndex}
          weatherForecasts={weatherForecasts}
          weatherSheetExpanded={weatherSheetExpanded}
          onWeatherSheetExpandedChange={setWeatherSheetExpanded}
        />
      )}

      {/* Search overlay — explore-only, full-screen, slides up from the bottom */}
      {appMode === 'explore' && (
        <SearchOverlay
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          liveScores={liveScores}
          userLocation={userLocation}
          onSelectSpot={handleSelectSpot}
          onSuggestSpot={handleSuggestFromSearch}
        />
      )}

      {appMode === 'explore' && (
        <SuggestSpotOverlay
          open={suggestOpen}
          onClose={() => setSuggestOpen(false)}
          initialName={suggestSeed}
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
        />
      )}
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
    <div className="absolute bottom-0 left-0 right-0 z-30 pb-[env(safe-area-inset-bottom)]">
      <div
        ref={panelRef}
        className="mx-auto w-[min(560px,100%)] rounded-t-3xl bg-[rgba(250,250,248,0.97)] backdrop-blur-md border-t border-x border-white/60 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
        style={{
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
            metric={weatherMetric}
            hourKeys={weatherHourKeys}
            hourKey={weatherHourKey}
            onHourChange={onWeatherHourChange}
            nowIndex={weatherNowIndex}
          />
        </div>

        <div
          className="overflow-hidden transition-[max-height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-t border-black/5"
          style={{
            maxHeight: weatherSheetExpanded ? '380px' : '0px',
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
