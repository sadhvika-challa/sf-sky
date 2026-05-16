import type { AppMode } from '../App';
import type { City } from '../data/spots';
import { getCityById } from '../data/cities';

interface ModeToggleProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  city: City;
}

export default function ModeToggle({ mode, onChange, city }: ModeToggleProps) {
  const config = getCityById(city);
  const weatherAvailable = config?.hasWeatherMode ?? false;

  return (
    <div
      className={`inline-grid ${weatherAvailable ? 'grid-cols-2' : 'grid-cols-1'} gap-0.5 rounded-full bg-[rgba(250,250,248,0.95)] border-[0.5px] border-black/[0.08] p-0.5 shadow-sm flex-shrink-0`}
      role="tablist"
      aria-label="App mode"
    >
      <ModePill
        active={mode === 'explore'}
        onClick={() => onChange('explore')}
        ariaLabel="Explore spots mode"
      >
        <SunHorizonIcon />
      </ModePill>
      {weatherAvailable && (
        <ModePill
          active={mode === 'weather'}
          onClick={() => onChange('weather')}
          ariaLabel="Weather map mode"
        >
          <CloudIcon />
        </ModePill>
      )}
    </div>
  );
}

interface ModePillProps {
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}

function ModePill({ active, onClick, ariaLabel, children }: ModePillProps) {
  const base =
    'w-8 h-8 flex items-center justify-center rounded-full transition-colors';
  const activeCls = 'bg-white text-gray-800 shadow-sm';
  const idleCls = 'text-gray-500 hover:text-gray-700';
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`${base} ${active ? activeCls : idleCls}`}
    >
      {children}
    </button>
  );
}

function SunHorizonIcon() {
  // Half-sun cresting the horizon with a fan of rays above and two short
  // water lines below — same vocabulary as the reference, sized down to
  // read at 18px inside the toggle pill.
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 14.5a4.5 4.5 0 0 1 9 0" />
      <line x1="2.5" y1="14.5" x2="6" y2="14.5" />
      <line x1="18" y1="14.5" x2="21.5" y2="14.5" />
      <line x1="5" y1="18" x2="19" y2="18" />
      <line x1="8.5" y1="21" x2="15.5" y2="21" />
      <line x1="12" y1="3" x2="12" y2="6" />
      <line x1="8.6" y1="4.4" x2="9.7" y2="7.2" />
      <line x1="15.4" y1="4.4" x2="14.3" y2="7.2" />
      <line x1="5.4" y1="7.4" x2="7.5" y2="9.5" />
      <line x1="18.6" y1="7.4" x2="16.5" y2="9.5" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.5A4 4 0 0 0 6.5 19h11z" />
    </svg>
  );
}
