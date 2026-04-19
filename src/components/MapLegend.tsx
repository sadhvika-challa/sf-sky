import type { Spot } from '../data/spots';
import { categoryColors, categoryLabels } from './SpotMarker';

const categories = Object.keys(categoryColors) as Spot['category'][];

export default function MapLegend() {
  return (
    <div
      className="absolute z-[500] top-3 left-3 flex items-center gap-2.5 bg-white/85 backdrop-blur-md rounded-full px-2.5 py-1 shadow-md"
      role="img"
      aria-label="Pin color legend"
    >
      {categories.map((category) => (
        <span key={category} className="flex items-center gap-1">
          <span
            className="inline-block w-2 h-2 rounded-full border border-white"
            style={{
              background: categoryColors[category],
              boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            }}
            aria-hidden="true"
          />
          <span className="text-[10px] font-mono text-gray-600 leading-none">
            {categoryLabels[category]}
          </span>
        </span>
      ))}
    </div>
  );
}
