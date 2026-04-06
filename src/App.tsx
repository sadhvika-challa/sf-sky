import { useState, useCallback } from 'react';
import { type Spot } from './data/spots';
import { useGeolocation } from './hooks/useGeolocation';
import MapView from './components/MapView';
import ScorePanel from './components/ScorePanel';
import FilterMenu from './components/FilterMenu';
import SearchBar from './components/SearchBar';
import './App.css';

export interface Filters {
  sunrise: [number, number];
  sunset: [number, number];
  stargazing: [number, number];
}

const defaultFilters: Filters = {
  sunrise: [0, 100],
  sunset: [0, 100],
  stargazing: [0, 100],
};

function App() {
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const userLocation = useGeolocation();

  const handleReset = useCallback(() => setFilters(defaultFilters), []);

  return (
    <div className="app-noise h-dvh w-screen flex flex-col bg-cream font-mono overflow-hidden">
      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-5 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-cream/90 backdrop-blur-sm border-b border-cream-dark">
        <h1 className="font-serif text-lg font-semibold text-gray-800 leading-tight">Go Outside</h1>
        <div className="flex items-center gap-1">
          <SearchBar onSelectSpot={setSelectedSpot} />
          <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="w-8 h-8 flex flex-col items-center justify-center gap-[5px] rounded-md hover:bg-cream-dark/40 transition-colors"
          aria-label="Menu"
        >
          <span className={`block w-4.5 h-[1.5px] bg-gray-600 rounded-full transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-[6.5px]' : ''}`} />
          <span className={`block w-4.5 h-[1.5px] bg-gray-600 rounded-full transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-4.5 h-[1.5px] bg-gray-600 rounded-full transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-[6.5px]' : ''}`} />
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
      />

      {/* Map */}
      <div className="flex-1 relative z-10">
        <MapView selectedSpot={selectedSpot} onSelectSpot={setSelectedSpot} onDeselectSpot={() => setSelectedSpot(null)} userLocation={userLocation} filters={filters} />

        {/* Pastel tint overlay for vibes */}
        <div className="map-overlay" />

        {/* Empty state overlay */}
        {!selectedSpot && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[500] pointer-events-none">
            <div className="bg-white/85 backdrop-blur-md rounded-full px-5 py-2.5 shadow-lg">
              <p className="text-[11px] tracking-[1.5px] text-gray-500 font-mono uppercase whitespace-nowrap">
                Tap a spot to see the sky
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Score Panel */}
      {selectedSpot && (
        <div className="relative z-20">
          <ScorePanel
            key={selectedSpot.id}
            spot={selectedSpot}
            onClose={() => setSelectedSpot(null)}
            userLocation={userLocation}
          />
        </div>
      )}
    </div>
  );
}

export default App;
