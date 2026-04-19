import { useState, useCallback, useEffect } from 'react';
import { spots, type Spot } from './data/spots';
import { useGeolocation } from './hooks/useGeolocation';
import { useLiveScores } from './hooks/useLiveScores';
import MapView from './components/MapView';
import OutlookBar from './components/OutlookBar';
import ScorePanel from './components/ScorePanel';
import FilterMenu from './components/FilterMenu';
import SearchBar from './components/SearchBar';
import SearchOverlay from './components/SearchOverlay';
import SuggestSpotOverlay from './components/SuggestSpotOverlay';
import './App.css';

export interface Filters {
  sunrise: [number, number];
  sunset: [number, number];
  stargazing: [number, number];
}

export type TravelMode = 'walk' | 'car';

type CardType = 'sunrise' | 'sunset' | 'stargazing';

const defaultFilters: Filters = {
  sunrise: [0, 100],
  sunset: [0, 100],
  stargazing: [0, 100],
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
  const [hintDismissed, setHintDismissed] = useState(false);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [travelMode, setTravelMode] = useState<TravelMode>('walk');
  const userLocation = useGeolocation();
  const liveScores = useLiveScores(spots);

  const handleReset = useCallback(() => setFilters(defaultFilters), []);

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
        />
      </div>

      {/* Slim floating header — single row, ~40px tall, see-through so the
          map shows behind it. */}
      <header
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-2 px-4 h-10 pt-[env(safe-area-inset-top)] bg-cream/65 backdrop-blur-md border-b border-white/40"
        style={{ minHeight: 'calc(2.5rem + env(safe-area-inset-top))' }}
      >
        <h1 className="font-serif text-base font-semibold text-gray-800 leading-none">Ask Karl</h1>
        <div className="flex items-center gap-0.5">
          <SearchBar onOpen={() => setSearchOpen(true)} />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/40 transition-colors"
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
      </header>

      {/* Filter Menu */}
      <FilterMenu
        open={menuOpen}
        filters={filters}
        onChange={setFilters}
        onReset={handleReset}
        onClose={() => setMenuOpen(false)}
        travelMode={travelMode}
        onTravelModeChange={setTravelMode}
        liveScores={liveScores}
        onSuggestSpot={handleSuggestFromMenu}
      />

      {/* Outlook bar — floats at the bottom over the map. Hides when a spot
          is selected so the score panel can own the screen, and can be
          dismissed by the user. */}
      {!selectedSpot && !hintDismissed && (
        <div className="outlook-bar-wrap absolute bottom-6 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-1">
          <OutlookBar liveScores={liveScores} />
          <button
            onClick={() => setHintDismissed(true)}
            className="w-6 h-6 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-md text-gray-400 hover:text-gray-700 hover:bg-white active:bg-white/90 shadow-md border border-white/60 transition-colors"
            aria-label="Dismiss outlook"
          >
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Search overlay — full-screen, slides up from the bottom */}
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        liveScores={liveScores}
        userLocation={userLocation}
        onSelectSpot={handleSelectSpot}
        onSuggestSpot={handleSuggestFromSearch}
      />

      <SuggestSpotOverlay
        open={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        initialName={suggestSeed}
      />

      {/* Score Panel — modal overlay, doesn't take layout space */}
      {selectedSpot && (
        <ScorePanel
          key={selectedSpot.id}
          spot={selectedSpot}
          onClose={() => handleSelectSpot(null)}
          userLocation={userLocation}
          initialCardType={initialCardType}
          travelMode={travelMode}
          liveScores={liveScores}
        />
      )}
    </div>
  );
}

export default App;
