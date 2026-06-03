import { useMemo } from 'react';
import { type Spot } from '../data/spots';
import { type LiveScoresMap } from '../hooks/useLiveScores';
import { getUpcomingEventTimes } from '../utils/events';
import { getScoreTier, tierColors, type ScoreType } from '../utils/scoring';
import { useCountdown } from '../hooks/useCountdown';

interface BestNowPillProps {
  spots: ReadonlyArray<Spot>;
  liveScores: LiveScoresMap;
  onSelect: (spot: Spot) => void;
}

const EVENT_EMOJI: Record<ScoreType, string> = {
  sunrise: '🌅',
  sunset: '🌇',
  stargazing: '✨',
};

const EVENT_LABEL: Record<ScoreType, string> = {
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  stargazing: 'Stargazing',
};

interface BestSpot {
  spot: Spot;
  type: ScoreType;
  score: number;
  eventTime: Date;
}

function findBest(
  spots: ReadonlyArray<Spot>,
  liveScores: LiveScoresMap,
): BestSpot | null {
  if (spots.length === 0) return null;

  let best: BestSpot | null = null;

  for (const spot of spots) {
    const events = getUpcomingEventTimes(spot);
    // Pick the soonest event type for this spot
    const types: ScoreType[] = ['sunrise', 'sunset', 'stargazing'];
    const soonest = types
      .filter((t) => !Number.isNaN(events[t].getTime()))
      .sort((a, b) => events[a].getTime() - events[b].getTime())[0];

    if (!soonest) continue;

    const live = liveScores.get(spot.id);
    const score = live ? live[soonest] : spot[soonest];

    if (!best || score > best.score) {
      best = { spot, type: soonest, score, eventTime: events[soonest] };
    }
  }

  return best;
}

export default function BestNowPill({ spots, liveScores, onSelect }: BestNowPillProps) {
  const best = useMemo(
    () => findBest(spots, liveScores),
    [spots, liveScores],
  );

  const { label: countdown, urgency } = useCountdown(best?.eventTime ?? new Date(NaN));

  if (!best) return null;

  const tier = getScoreTier(best.score);

  return (
    <button
      type="button"
      onClick={() => onSelect(best.spot)}
      className="absolute bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[rgba(250,250,248,0.97)] border-[0.5px] border-black/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.10)] backdrop-blur-md hover:shadow-[0_6px_20px_rgba(0,0,0,0.14)] active:scale-[0.97] transition-all duration-200"
      style={{ minHeight: 44 }}
      aria-label={`Best spot tonight: ${best.spot.name}, score ${best.score}`}
    >
      <span className="text-sm" aria-hidden="true">
        {EVENT_EMOJI[best.type]}
      </span>
      <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-gray-500">
        {EVENT_LABEL[best.type]}
      </span>
      <span className="font-serif text-sm font-semibold text-gray-800 truncate max-w-[140px]">
        {best.spot.name}
      </span>
      <span
        className="font-serif text-lg font-light tabular-nums leading-none"
        style={{ color: tierColors[tier] }}
      >
        {best.score}
      </span>
      {urgency !== 'now' && (
        <span className="font-mono text-[9px] tracking-[1px] text-gray-400 tabular-nums">
          {countdown}
        </span>
      )}
    </button>
  );
}
