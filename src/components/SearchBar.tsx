interface SearchBarProps {
  onOpen: () => void;
}

/**
 * Slim header trigger — taps open the full-screen `SearchOverlay`. The actual
 * search input + results list live there so the overlay can own focus, the
 * keyboard, and the scroll container without fighting the floating header.
 */
export default function SearchBar({ onOpen }: SearchBarProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-cream-dark/40 transition-colors"
      aria-label="Search spots"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-gray-600"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </button>
  );
}
