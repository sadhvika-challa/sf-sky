import type { Filters } from '../App';

interface FilterMenuProps {
  open: boolean;
  filters: Filters;
  onChange: (f: Filters) => void;
  onReset: () => void;
  onClose: () => void;
}

type FilterKey = keyof Filters;

const labels: Record<FilterKey, string> = {
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  stargazing: 'Stargazing',
};

function RangeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const [min, max] = value;

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] tracking-[2px] text-gray-500 uppercase font-mono">{label}</span>
        <span className="text-[11px] font-mono text-gray-700">{min} – {max}</span>
      </div>
      <div className="relative h-8 flex items-center">
        {/* Track */}
        <div className="absolute w-full h-[3px] bg-gray-200 rounded-full" />
        {/* Active range */}
        <div
          className="absolute h-[3px] bg-gray-600 rounded-full"
          style={{ left: `${min}%`, width: `${max - min}%` }}
        />
        {/* Min thumb */}
        <input
          type="range"
          min={0}
          max={100}
          value={min}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), max - 1);
            onChange([v, max]);
          }}
          className="range-thumb absolute w-full"
        />
        {/* Max thumb */}
        <input
          type="range"
          min={0}
          max={100}
          value={max}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), min + 1);
            onChange([min, v]);
          }}
          className="range-thumb absolute w-full"
        />
      </div>
    </div>
  );
}

export default function FilterMenu({ open, filters, onChange, onReset, onClose }: FilterMenuProps) {
  const isFiltered = Object.values(filters).some(([min, max]) => min > 0 || max < 100);

  return (
    <div
      className={`absolute z-30 top-0 right-0 w-72 h-full bg-cream/95 backdrop-blur-md border-l border-cream-dark shadow-xl transition-transform duration-300 ease-out ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{ paddingTop: 'max(3.5rem, calc(env(safe-area-inset-top) + 3rem))' }}
    >
      <div className="px-5 pb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-base font-semibold text-gray-800">Filter Scores</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="text-[10px] tracking-[1.5px] text-gray-400 uppercase font-mono mb-5">
          Show spots with scores in range
        </p>

        {(Object.keys(labels) as FilterKey[]).map((key) => (
          <RangeSlider
            key={key}
            label={labels[key]}
            value={filters[key]}
            onChange={(v) => onChange({ ...filters, [key]: v })}
          />
        ))}

        {isFiltered && (
          <button
            onClick={onReset}
            className="mt-2 text-[10px] tracking-[2px] uppercase font-mono text-gray-500 hover:text-gray-700 transition-colors underline underline-offset-2"
          >
            Reset all
          </button>
        )}
      </div>
    </div>
  );
}
