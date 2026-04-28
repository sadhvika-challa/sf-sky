import type { AppMode } from '../App';

interface ModeToggleProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
}

/**
 * Wide segmented control that lives inside the bottom panel. The two pills
 * split the available width evenly so they read as primary navigation
 * (Explore vs Weather) rather than a secondary chrome control.
 */
export default function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-full bg-cream-dark/70 p-1"
      role="tablist"
      aria-label="App mode"
    >
      <ModePill
        active={mode === 'explore'}
        onClick={() => onChange('explore')}
        label="Explore"
        ariaLabel="Explore spots mode"
      >
        <SunIcon />
      </ModePill>
      <ModePill
        active={mode === 'weather'}
        onClick={() => onChange('weather')}
        label="Weather"
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
  label: string;
  ariaLabel: string;
  children: React.ReactNode;
}

function ModePill({ active, onClick, label, ariaLabel, children }: ModePillProps) {
  const base =
    'flex items-center justify-center gap-1.5 h-9 rounded-full text-[13px] font-medium transition-colors';
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
      <span className="leading-none">{label}</span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.5A4 4 0 0 0 6.5 19h11z" />
    </svg>
  );
}
