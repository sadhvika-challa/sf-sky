import { useEffect, useRef } from 'react';
import SunCalc from 'suncalc';
import { type Spot } from '../data/spots';
import { type UserLocation, getDistanceMiles } from '../hooks/useGeolocation';
import { type TravelMode } from '../App';
import ScoreCard from './ScoreCard';

type CardType = 'sunrise' | 'sunset' | 'stargazing';

interface CardInfo {
  type: CardType;
  eventDate: Date;
  eventTime: Date;
}

function getNextEvents(spot: Spot): CardInfo[] {
  const now = new Date();
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayTimes = SunCalc.getTimes(today, spot.lat, spot.lng);
  const tomorrowTimes = SunCalc.getTimes(tomorrow, spot.lat, spot.lng);

  const cards: CardInfo[] = [];

  if (todayTimes.sunrise > now) {
    cards.push({ type: 'sunrise', eventDate: today, eventTime: todayTimes.sunrise });
  } else {
    cards.push({ type: 'sunrise', eventDate: tomorrow, eventTime: tomorrowTimes.sunrise });
  }

  if (todayTimes.sunset > now) {
    cards.push({ type: 'sunset', eventDate: today, eventTime: todayTimes.sunset });
  } else {
    cards.push({ type: 'sunset', eventDate: tomorrow, eventTime: tomorrowTimes.sunset });
  }

  const todayDusk = todayTimes.nauticalDusk;
  const todayStarEnd = new Date(todayDusk.getTime() + 3 * 60 * 60 * 1000);
  if (todayStarEnd > now) {
    cards.push({ type: 'stargazing', eventDate: today, eventTime: todayDusk > now ? todayDusk : now });
  } else {
    const tomorrowDusk = tomorrowTimes.nauticalDusk;
    cards.push({ type: 'stargazing', eventDate: tomorrow, eventTime: tomorrowDusk });
  }

  cards.sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime());
  return cards;
}

interface ScorePanelProps {
  spot: Spot;
  onClose: () => void;
  userLocation: UserLocation | null;
  initialCardType?: CardType;
  travelMode: TravelMode;
}

// Straight-line speed estimates (mph) — actual routed distance will differ
const SPEED_MPH: Record<TravelMode, number> = { walk: 3, car: 25 };

export default function ScorePanel({ spot, onClose, userLocation, initialCardType, travelMode }: ScorePanelProps) {
  const distanceMi = userLocation
    ? getDistanceMiles(userLocation.lat, userLocation.lng, spot.lat, spot.lng)
    : null;
  const travelMinutes = distanceMi !== null
    ? Math.round((distanceMi / SPEED_MPH[travelMode]) * 60)
    : null;

  const cards = getNextEvents(spot);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!initialCardType) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scroller.querySelector<HTMLElement>(`[data-card-type="${initialCardType}"]`);
    if (!target) return;
    // Use offsetLeft so we don't fight smooth-scroll on the page itself
    scroller.scrollTo({ left: target.offsetLeft - scroller.offsetLeft, behavior: 'smooth' });
  }, [initialCardType, spot.id]);

  return (
    <div className="score-panel-enter bg-cream/95 backdrop-blur-md border-t border-cream-dark">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div>
          <h2 className="font-serif text-xl font-semibold text-gray-800">{spot.name}</h2>
          <p className="text-[10px] tracking-[2px] text-gray-400 font-mono uppercase mt-0.5">
            {spot.lat.toFixed(4)}°N, {Math.abs(spot.lng).toFixed(4)}°W &middot; {spot.elevation}m
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
          aria-label="Close panel"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2L12 12M12 2L2 12" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Cards */}
      <div ref={scrollerRef} className="score-cards-scroll flex gap-4 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 overflow-x-auto snap-x snap-mandatory" style={{ touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}>
        {cards.map((card) => (
          <ScoreCard
            key={card.type}
            spot={spot}
            type={card.type}
            eventDate={card.eventDate}
            distanceMi={distanceMi}
            travelMinutes={travelMinutes}
            travelMode={travelMode}
          />
        ))}
      </div>
    </div>
  );
}
