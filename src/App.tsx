import { useState, useCallback, useEffect } from 'react';
import { spots, type Spot } from './data/spots';
import { useGeolocation } from './hooks/useGeolocation';
import { useLiveScores } from './hooks/useLiveScores';
import MapView from './components/MapView';
import OutlookBar from './components/OutlookBar';
import ScorePanel from './components/ScorePanel';
import FilterMenu from './components/FilterMenu';
import SearchBar from './components/SearchBar';
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
          <SearchBar onSelectSpot={handleSelectSpot} />
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

      {/* Outlook bar — sits just under the header. Fades when a spot is
          selected so the score panel can own the screen without competing
          chrome at the top. */}
      <div
        className={`outlook-bar-wrap absolute left-1/2 -translate-x-1/2 z-[15] transition-opacity duration-200 ${
          selectedSpot ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        style={{ top: 'calc(2.5rem + env(safe-area-inset-top) + 0.5rem)' }}
      >
        <OutlookBar liveScores={liveScores} />
      </div>

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
      />

      {/* Empty state overlay */}
      {!selectedSpot && !hintDismissed && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[500]">
          <div className="flex items-center gap-1 bg-white/85 backdrop-blur-md rounded-full pl-5 pr-2 py-2.5 shadow-lg">
            <p className="text-[11px] tracking-[1.5px] text-gray-500 font-mono uppercase whitespace-nowrap">
              Tap a spot. Karl will weigh in.
            </p>
            <button
              onClick={() => setHintDismissed(true)}
              className="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-black/5 active:bg-black/10 transition-colors"
              aria-label="Dismiss hint"
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Score Panel — modal overlay, doesn't take layout space */}
      {selectedSpot && (
        <ScorePanel
          key={selectedSpot.id}
          spot={selectedSpot}
          onClose={() => handleSelectSpot(null)}
          userLocation={userLocation}
          initialCardType={initialCardType}
          travelMode={travelMode}
        />
      )}
    </div>
  );
}

export default App;
