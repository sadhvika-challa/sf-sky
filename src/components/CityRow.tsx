import type { City } from '../data/spots';
import { getCityById } from '../data/cities';

interface CityRowProps {
  activeCityId: City;
  homeCityId: City;
  onOpenCitySheet: () => void;
}

function GlobeIcon() {
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
      aria-hidden="true"
      className="text-gray-300"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export default function CityRow({ activeCityId, homeCityId, onOpenCitySheet }: CityRowProps) {
  const city = getCityById(activeCityId);
  if (!city) return null;

  const isVisiting = activeCityId !== homeCityId;

  return (
    <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-cream-dark">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base leading-none flex-shrink-0" aria-hidden="true">
          {city.emoji}
        </span>
        <span className="font-serif text-base font-semibold text-gray-800 truncate">
          {city.name}
        </span>
        {isVisiting && (
          <span
            className="flex-shrink-0 text-[8px] tracking-[2px] uppercase font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded"
            aria-label="Currently visiting"
          >
            Visiting
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onOpenCitySheet}
        className="flex items-center gap-1 font-mono text-[10px] tracking-[2px] uppercase text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
        aria-label="Switch city"
      >
        <GlobeIcon />
        Switch
      </button>
    </div>
  );
}
