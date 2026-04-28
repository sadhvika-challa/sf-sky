interface SearchBarProps {
  onOpen: () => void;
}

/**
 * Full-width input-styled trigger that opens the `SearchOverlay`. Looks like
 * a real text input (rounded pill, search icon, placeholder text) so the
 * user understands they can search even though tapping it actually opens an
 * overlay where the keyboard, focus, and result list live.
 */
export default function SearchBar({ onOpen }: SearchBarProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex-1 flex items-center gap-2 h-9 pl-3 pr-4 rounded-full bg-[rgba(250,250,248,0.95)] border-[0.5px] border-black/[0.08] shadow-sm text-left text-gray-400 hover:bg-[rgba(250,250,248,1)] transition-colors"
      aria-label="Search spots"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-gray-500 flex-shrink-0"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <span className="font-sans text-[13px] leading-none">Search spots…</span>
    </button>
  );
}
