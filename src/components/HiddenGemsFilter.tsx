interface HiddenGemsFilterProps {
  active: boolean;
  onChange: (active: boolean) => void;
}

export default function HiddenGemsFilter({ active, onChange }: HiddenGemsFilterProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onChange(!active)}
      className={`min-h-11 px-4 rounded-full border font-mono text-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 ${active ? 'bg-gray-800 text-cream border-gray-800' : 'bg-cream text-gray-700 border-cream-dark hover:border-gray-400'}`}
    >
      Hidden gems
    </button>
  );
}
