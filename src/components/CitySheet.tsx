import { useCallback, useEffect, useRef, useState } from 'react';
import type { City } from '../data/spots';
import { CITIES, type CityConfig } from '../data/cities';

interface CitySheetProps {
  open: boolean;
  onClose: () => void;
  activeCityId: City;
  homeCityId: City;
  onSelectCity: (city: City) => void;
  onSetHomeCity: (city: City) => void;
}

function HomeIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      className="text-amber-500"
    >
      <path d="M12 3l-9.5 8.5h3V21h5v-6h3v6h5V11.5h3z" />
    </svg>
  );
}

const LONG_PRESS_MS = 500;

function CityRowItem({
  city,
  isActive,
  isHome,
  onTap,
  onLongPress,
}: {
  city: CityConfig;
  isActive: boolean;
  isHome: boolean;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handlePointerDown = useCallback(() => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }, [onLongPress]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!didLongPress.current) {
      onTap();
    }
  }, [onTap]);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      aria-label={isHome ? `${city.name}, home city` : `Select ${city.name}`}
      className={`w-full flex items-start gap-3 px-4 py-3.5 text-left rounded-xl transition-colors duration-150 touch-none ${
        isActive
          ? 'bg-cream-dark/50'
          : 'bg-transparent hover:bg-cream-dark/30 active:bg-cream-dark/40'
      }`}
      style={{ touchAction: 'none' }}
    >
      <span className="text-2xl leading-none mt-0.5 flex-shrink-0" aria-hidden="true">
        {city.emoji}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-serif text-base font-semibold text-gray-800">
            {city.name}
          </span>
          {isHome && <HomeIcon />}
        </div>
        <p className="font-mono text-[11px] italic text-gray-500 mt-0.5 truncate">
          {city.tagline}
        </p>
      </div>
    </button>
  );
}

export default function CitySheet({
  open,
  onClose,
  activeCityId,
  homeCityId,
  onSelectCity,
  onSetHomeCity,
}: CitySheetProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [homeSetFeedback, setHomeSetFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else if (mounted) {
      setVisible(false);
      const t = setTimeout(() => {
        setMounted(false);
        setHomeSetFeedback(null);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleSetHome = useCallback(
    (cityId: City) => {
      const city = CITIES.find((c) => c.id === cityId);
      if (!city) return;
      onSetHomeCity(cityId);
      setHomeSetFeedback(`${city.emoji} ${city.name} is now your home city`);
      setTimeout(() => onClose(), 800);
    },
    [onSetHomeCity, onClose],
  );

  if (!mounted) return null;

  const isVisiting = activeCityId !== homeCityId;

  return (
    <div className={`fixed inset-0 z-[900] ${visible ? '' : 'pointer-events-none'}`}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/25 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a city"
        className="absolute bottom-0 left-0 right-0 mx-auto w-[min(480px,100%)] rounded-t-[18px] bg-cream shadow-2xl border-t border-cream-dark flex flex-col"
        style={{
          maxHeight: '75vh',
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: visible
            ? 'transform 350ms cubic-bezier(0.16, 1, 0.3, 1)'
            : 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1" aria-hidden="true">
          <span className="block w-9 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Title row */}
        <div className="flex items-center justify-between px-4 pt-1 pb-3">
          <h2 className="font-serif text-base font-semibold text-gray-800">
            Choose a city
          </h2>
          {isVisiting && (
            <button
              type="button"
              onClick={() => onSelectCity(homeCityId)}
              className="font-mono text-[10px] tracking-[1px] uppercase text-amber-700 hover:text-amber-900 transition-colors"
            >
              Back to home
            </button>
          )}
        </div>

        {/* Home-set feedback toast */}
        {homeSetFeedback && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-center">
            <span className="font-mono text-[11px] text-green-800">{homeSetFeedback}</span>
          </div>
        )}

        {/* City list */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
          {CITIES.map((city) => (
            <CityRowItem
              key={city.id}
              city={city}
              isActive={city.id === activeCityId}
              isHome={city.id === homeCityId}
              onTap={() => onSelectCity(city.id)}
              onLongPress={() => handleSetHome(city.id)}
            />
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-cream-dark">
          <p className="font-mono text-[9px] tracking-[1px] text-gray-400 text-center">
            Long-press a city to set it as your home
          </p>
        </div>
      </div>
    </div>
  );
}
