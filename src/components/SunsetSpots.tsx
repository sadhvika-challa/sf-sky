import type { RankedSkySpot } from '../utils/skySpotRanking';
import { formatSkyDuration, skyQualityLabel } from '../utils/skyExperience';
import { getMapPinColor, getMapPinTextColor } from '../utils/mapPinColor';

interface Props {
  spots: RankedSkySpot[];
  total: number;
  pending: number;
  retrying: boolean;
  timeLabel: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onRetry: () => void;
}

export default function SunsetSpots({ spots, total, pending, retrying, timeLabel, onSelect, onClose, onRetry }: Props) {
  return <section aria-label="Compare sky spots" data-sunset-comparison>
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-sans text-[16px] font-semibold text-[#173D43]">Spots at {timeLabel}</h2>
        <span className="font-mono text-[10px] text-gray-600" role="status">
          {spots.length} of {total} map spots available{pending > 0 ? ' · Loading' : ''}
        </span>
      </div>
      <button type="button" onClick={onClose} aria-label="Close spot comparison"
        className="min-h-11 px-3 font-mono text-xs text-[#173D43] focus-visible:outline-2 focus-visible:outline-[#155561]">Close</button>
    </div>
    {spots.length > 0 ? <ol aria-label="Spots ranked for the selected time" className="mt-1 space-y-1">
      {spots.slice(0, 5).map(({ spot, score, sky, evidence }) => <li key={spot.id}>
        <button type="button" onClick={() => onSelect(spot.id)}
          aria-label={`Open ${spot.name}, score ${score} out of 100 at ${timeLabel}, ${sky.label}, ${formatSkyDuration(sky)}, ${evidence.confidence} confidence`}
          className="flex min-h-16 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-[#F0F5F3] focus-visible:outline-2 focus-visible:outline-[#155561]">
          <span className="min-w-0">
            <span className="block truncate font-sans text-[14px] font-semibold text-[#173D43]">{spot.name}</span>
            <span className="block font-mono text-[10px] text-gray-600">{sky.label} · {skyQualityLabel(score)}</span>
            <span className="block font-mono text-[10px] text-gray-600">{formatSkyDuration(sky)} · {evidence.confidence} confidence</span>
          </span>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-mono text-[16px] font-semibold"
            style={{ backgroundColor: getMapPinColor(score), color: getMapPinTextColor(score) }}>{score}</span>
        </button>
      </li>)}
    </ol> : <div className="py-3 font-mono text-xs text-gray-600" role="status">
      {retrying ? 'Retrying spot forecasts' : pending ? 'Loading spot forecasts' : 'No supported forecasts for this time'}
      {!pending && <button type="button" onClick={onRetry} disabled={retrying} className="ml-2 min-h-11 px-2 underline">Retry forecasts</button>}
    </div>}
  </section>;
}
