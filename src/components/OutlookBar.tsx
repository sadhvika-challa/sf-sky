import { useEffect, useState } from 'react';
import SunCalc from 'suncalc';
import type { LiveScoresMap } from '../hooks/useLiveScores';
import {
  computeCityOutlook,
  outlookMessage,
  type OutlookStatus,
} from '../utils/outlook';
import { tierColors, type ScoreTier } from '../utils/scoring';
import type { ScoreType } from '../utils/scoring';

interface OutlookBarProps {
  liveScores: LiveScoresMap;
}

// SF "centroid" used to decide which event happens next citywide. Spot-by-spot
// times vary by < 1 minute across the city, so a single anchor is fine.
const SF_LAT = 37.7649;
const SF_LNG = -122.4494;

// Outlook status -> pin tier so the dot color sits in the same palette as the
// pins on the map.
function statusToTier(status: OutlookStatus): ScoreTier {
  switch (status) {
    case 'good':
      return 'great';
    case 'mixed':
      return 'decent';
    case 'poor':
      return 'poor';
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled outlook status: ${String(_exhaustive)}`);
    }
  }
}

function getNextCityEvent(now: Date): ScoreType {
  const today = SunCalc.getTimes(now, SF_LAT, SF_LNG);
  const tomorrow = SunCalc.getTimes(
    new Date(now.getTime() + 24 * 60 * 60 * 1000),
    SF_LAT,
    SF_LNG,
  );

  const sunrise = today.sunrise > now ? today.sunrise : tomorrow.sunrise;
  const sunset = today.sunset > now ? today.sunset : tomorrow.sunset;
  // Treat dusk as "current" for ~3h after it lands, matching ScorePanel.
  const todayDusk = today.nauticalDusk;
  const stargazingActiveUntil = new Date(todayDusk.getTime() + 3 * 60 * 60 * 1000);
  const stargazing = stargazingActiveUntil > now ? todayDusk : tomorrow.nauticalDusk;

  const all: Array<{ type: ScoreType; at: Date }> = [
    { type: 'sunrise', at: sunrise },
    { type: 'sunset', at: sunset },
    { type: 'stargazing', at: stargazing },
  ];
  const candidates = all.filter((c) => !Number.isNaN(c.at.getTime()));

  candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
  return candidates[0]?.type ?? 'sunset';
}

export default function OutlookBar({ liveScores }: OutlookBarProps) {
  // Re-evaluate the "next event" on a slow timer so the bar rolls over from
  // sunset to stargazing to sunrise without needing a route change.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const nextEvent = getNextCityEvent(now);
  const outlook = computeCityOutlook(liveScores);
  const entry = outlook[nextEvent];
  const tier = statusToTier(entry.status);
  const dotColor = tierColors[tier];
  const message = outlookMessage(nextEvent, entry.status);

  return (
    <div
      className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/80 backdrop-blur-md pl-2.5 pr-3.5 py-1.5 shadow-md border border-white/60 max-w-[calc(100vw-2rem)]"
      role="status"
      aria-live="polite"
      aria-label={`Karl's outlook for the next ${nextEvent}`}
    >
      <span
        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
        style={{
          background: dotColor,
          boxShadow: `0 0 0 2px rgba(255,255,255,0.85), 0 0 6px ${dotColor}55`,
        }}
        aria-hidden="true"
      />
      <p className="font-serif italic text-[12px] leading-tight text-gray-700 truncate">
        {message}
      </p>
    </div>
  );
}
