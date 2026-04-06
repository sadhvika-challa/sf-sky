import { useState, useRef, useEffect } from 'react';
import { type Spot, spots } from '../data/spots';

interface SearchBarProps {
  onSelectSpot: (spot: Spot) => void;
}

export default function SearchBar({ onSelectSpot }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = query.length > 0
    ? spots.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  const showDropdown = focused && results.length > 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const categoryColor = (cat: string) => {
    if (cat === 'hilltop') return 'bg-orange-400';
    if (cat === 'waterfront') return 'bg-blue-400';
    return 'bg-emerald-400';
  };

  return (
    <div ref={containerRef} className="relative z-30">
      {/* Toggle button */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-cream-dark/40 transition-colors"
          aria-label="Search"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      )}

      {/* Search input */}
      {open && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              placeholder="Search spots…"
              className="w-44 sm:w-56 h-8 pl-8 pr-3 text-xs font-mono bg-cream-dark/30 border border-cream-dark rounded-lg outline-none focus:border-gray-400 transition-colors placeholder:text-gray-400"
            />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <button
            onClick={() => { setOpen(false); setQuery(''); setFocused(false); }}
            className="text-gray-400 hover:text-gray-600 text-xs font-mono"
          >
            ✕
          </button>
        </div>
      )}

      {/* Dropdown */}
      {open && showDropdown && (
        <div className="absolute top-10 right-0 w-64 max-h-72 overflow-y-auto bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-cream-dark">
          {results.map((spot) => (
            <button
              key={spot.id}
              onClick={() => {
                onSelectSpot(spot);
                setQuery('');
                setOpen(false);
                setFocused(false);
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-cream-dark/30 transition-colors flex items-center gap-3 border-b border-cream-dark/50 last:border-b-0"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${categoryColor(spot.category)}`} />
              <div className="min-w-0">
                <p className="text-xs font-mono text-gray-700 truncate">{spot.name}</p>
                <p className="text-[10px] font-mono text-gray-400 capitalize">{spot.category} · {spot.elevation}m</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
