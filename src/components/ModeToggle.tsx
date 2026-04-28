import type { AppMode } from '../App';

interface ModeToggleProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
}

/**
 * Tight icon-only segmented control. Sits in the top-left corner over the
 * map and leaves the rest of the top row free for explore/weather chrome.
 */
export default function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div
      className="inline-grid grid-cols-2 gap-0.5 rounded-full bg-[rgba(250,250,248,0.95)] border-[0.5px] border-black/[0.08] p-0.5 shadow-sm flex-shrink-0"
      role="tablist"
      aria-label="App mode"
    >
      <ModePill
        active={mode === 'explore'}
        onClick={() => onChange('explore')}
        ariaLabel="Explore spots mode"
      >
        <SearchIcon />
      </ModePill>
      <ModePill
        active={mode === 'weather'}
        onClick={() => onChange('weather')}
        ariaLabel="Weather map mode"
      >
        <CloudIcon />
      </ModePill>
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

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16.65" y2="16.65" />
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
