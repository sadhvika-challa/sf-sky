import { useState } from 'react';
import { type Spot, getConditionLabel, getPoetic } from '../data/spots';
import SunCalc from 'suncalc';
import { useSpotForecast } from '../hooks/useSpotForecast';
import { getForecastAt, type HourlyForecast } from '../utils/weather';
import { cloudCoverLabel, computeLiveScore, visibilityPercent } from '../utils/scoring';
import { getKarlComment } from '../utils/karl-copy';
import { type TravelMode } from '../App';

type CardType = 'sunrise' | 'sunset' | 'stargazing';

interface ScoreCardProps {
  spot: Spot;
  type: CardType;
  eventDate: Date;
  distanceMi: number | null;
  travelMinutes: number | null;
  travelMode: TravelMode;
}

function formatTime(date: Date): { time: string; period: string } {
  const str = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const parts = str.match(/^([\d:]+)\s*(AM|PM)$/i);
  if (parts) return { time: parts[1], period: parts[2].toLowerCase() };
  return { time: str, period: '' };
}

function formatDateShort(date: Date): string {
  const now = new Date();
  const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  if (isToday) return 'Today';
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.getDate() === tomorrow.getDate() && date.getMonth() === tomorrow.getMonth()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function googleMapsTravelMode(mode: TravelMode): 'walking' | 'driving' {
  switch (mode) {
    case 'walk':
      return 'walking';
    case 'car':
      return 'driving';
  }
}

// Fallback SF temperature when the forecast isn't loaded yet — rough monthly averages.
function getEstimatedTemp(): number {
  const month = new Date().getMonth();
  const temps = [54, 56, 57, 58, 60, 62, 63, 64, 66, 64, 58, 54];
  return temps[month];
}

function getSkyGradient(type: CardType, score: number): string {
  const i = score / 100;
  if (type === 'sunrise') {
    return `radial-gradient(ellipse at 70% 90%,
      hsl(30, ${50 + i * 45}%, ${72 + i * 15}%) 0%,
      hsl(350, ${30 + i * 40}%, ${75 + i * 12}%) 35%,
      hsl(270, ${20 + i * 30}%, ${78 + i * 10}%) 65%,
      hsl(220, ${20 + i * 25}%, ${82 + i * 8}%) 100%)`;
  }
  if (type === 'sunset') {
    return `radial-gradient(ellipse at 70% 90%,
      hsl(20, ${50 + i * 45}%, ${65 + i * 18}%) 0%,
      hsl(350, ${35 + i * 45}%, ${68 + i * 15}%) 30%,
      hsl(280, ${25 + i * 35}%, ${72 + i * 12}%) 60%,
      hsl(220, ${20 + i * 30}%, ${80 + i * 8}%) 100%)`;
  }
  return `radial-gradient(ellipse at 50% 80%,
    hsl(250, ${25 + i * 40}%, ${15 + i * 15}%) 0%,
    hsl(240, ${20 + i * 45}%, ${10 + i * 12}%) 50%,
    hsl(230, ${15 + i * 35}%, ${8 + i * 10}%) 100%)`;
}

function getBarGradient(type: CardType): string {
  if (type === 'sunrise') return 'linear-gradient(90deg, #FDE68A, #F59E0B, #EC4899)';
  if (type === 'sunset') return 'linear-gradient(90deg, #FCD34D, #F97316, #DC2626, #7C3AED)';
  return 'linear-gradient(90deg, #818CF8, #4338CA, #1E1B4B)';
}

function getGaugeGradient(): string {
  return 'linear-gradient(to top, #3B82F6, #F59E0B, #EF4444)';
}

function GaugeBar({ value }: { value: number }) {
  const pos = Math.max(5, Math.min(95, value));
  return (
    <div className="w-[4px] h-[22px] rounded-full relative flex-shrink-0 ml-auto" style={{ background: getGaugeGradient() }}>
      <div
        className="absolute w-[8px] h-[8px] rounded-full border-[1.5px] border-white left-[-2px]"
        style={{
          background: '#1F2937',
          bottom: `${pos}%`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </div>
  );
}


const dotColors: Record<CardType, string[]> = {
  sunrise: ['rgba(244,114,182,0.5)', 'rgba(251,191,36,0.4)', 'rgba(249,168,212,0.3)'],
  sunset: ['rgba(167,139,250,0.5)', 'rgba(251,146,60,0.5)', 'rgba(244,114,182,0.4)'],
  stargazing: ['rgba(255,255,255,0.4)', 'rgba(199,210,254,0.3)', 'rgba(255,255,255,0.2)'],
};

const typeTitle: Record<CardType, string> = {
  sunrise: "SUNRISE",
  sunset: "SUNSET",
  stargazing: "STARGAZING",
};

export default function ScoreCard({ spot, type, eventDate, distanceMi, travelMinutes, travelMode }: ScoreCardProps) {
  const [copied, setCopied] = useState(false);
  const times = SunCalc.getTimes(eventDate, spot.lat, spot.lng);
  const moonIllum = SunCalc.getMoonIllumination(eventDate);
  const dateLabel = formatDateShort(eventDate);
  const fullDate = formatFullDate(eventDate);

  let eventInstant: Date;
  let eventTimeData: { time: string; period: string };
  if (type === 'sunrise') {
    eventInstant = times.sunrise;
    eventTimeData = formatTime(times.sunrise);
  } else if (type === 'sunset') {
    eventInstant = times.sunset;
    eventTimeData = formatTime(times.sunset);
  } else {
    eventInstant = times.nauticalDusk;
    eventTimeData = formatTime(times.nauticalDusk);
  }

  const { forecast, loading, error } = useSpotForecast(spot);
  // Hourly slice valid only if we have a real Date (suncalc returns Invalid Date
  // at high latitudes when no event occurs that day).
  const hourly: HourlyForecast | null =
    forecast && !Number.isNaN(eventInstant.getTime())
      ? getForecastAt(forecast, eventInstant)
      : null;

  const score = hourly
    ? computeLiveScore(spot, type, hourly, moonIllum.fraction)
    : spot[type];
  const isLive = hourly !== null;

  const condition = getConditionLabel(score);
  const poetic = getPoetic(type, score);
  const karlLine = getKarlComment(score, type, spot.id, eventDate);
  const gradient = getSkyGradient(type, score);
  const barGradient = getBarGradient(type);
  const temp = hourly && Number.isFinite(hourly.tempF)
    ? Math.round(hourly.tempF)
    : getEstimatedTemp();
  const cloud = hourly ? cloudCoverLabel(hourly.cloud) : '—';
  const cloudBarValue = hourly && Number.isFinite(hourly.cloud)
    ? Math.round(100 - hourly.cloud) // bar shows clarity, so invert cloud cover
    : score;
  const visibilityValue = hourly ? visibilityPercent(hourly.visibilityKm) : score;
  const dots = dotColors[type];

  const handleShare = async () => {
    const eventLabel = typeTitle[type].toLowerCase();
    const url = `${window.location.origin}/?spot=${spot.id}&view=${type}`;
    const title = `Ask Karl — ${spot.name}`;
    // Karl-voiced share copy: brag if it's a good night, drag him if it isn't.
    const text = score >= 60
      ? `Karl's off at ${spot.name} — ${eventLabel} score: ${score}/100.`
      : `Karl wins at ${spot.name}. ${eventLabel} score: ${score}/100.`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore – nothing else we can do
    }
  };

  const handleDirections = () => {
    const destination = `${spot.lat},${spot.lng}`;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=${googleMapsTravelMode(travelMode)}`;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-md w-full flex flex-col">
      {/* Sky gradient header */}
      <div
        className="relative h-16 overflow-hidden flex-shrink-0"
        style={{ background: gradient }}
      >
        {/* Color dots — top left */}
        <div className="absolute top-2 left-2.5 flex items-center gap-1 z-10">
          {dots.map((c, i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: c.replace(/[\d.]+\)$/, '1)') }} />
          ))}
        </div>
        {/* Action buttons — top right */}
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
          <button
            type="button"
            onClick={handleDirections}
            className="w-6 h-6 rounded-full bg-white/85 backdrop-blur-sm shadow-sm flex items-center justify-center hover:bg-white transition-colors active:scale-95"
            aria-label={`Get directions to ${spot.name} in Google Maps`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="w-6 h-6 rounded-full bg-white/85 backdrop-blur-sm shadow-sm flex items-center justify-center hover:bg-white transition-colors active:scale-95"
            aria-label={`Share ${typeTitle[type].toLowerCase()} card for ${spot.name}`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="m7 8 5-5 5 5" />
              <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
            </svg>
          </button>
        </div>
        {copied && (
          <div className="absolute top-9 right-1.5 z-10 px-2 py-1 rounded-md bg-gray-800/90 text-white text-[9px] font-mono tracking-wide uppercase shadow-md">
            Link copied
          </div>
        )}
        {type === 'stargazing' && (
          <div className="absolute bottom-1.5 right-2.5 text-white/45 text-[8px] font-mono tracking-wider uppercase">
            Moon {Math.round(moonIllum.fraction * 100)}%
          </div>
        )}
        <div
          className="absolute bottom-1.5 left-2.5 flex items-center gap-1 text-white/75 text-[8px] font-mono tracking-[1.5px] uppercase"
          aria-live="polite"
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400' : 'bg-white/40'}`}
            style={isLive ? { boxShadow: '0 0 6px rgba(52,211,153,0.85)' } : undefined}
          />
          {loading && !forecast
            ? 'Asking Karl'
            : error && !forecast
              ? 'Karl broke it'
              : isLive
                ? 'Live'
                : 'Static'}
        </div>
      </div>

      {/* Data section */}
      <div className="px-3.5 pt-3 pb-3.5 flex flex-col gap-2.5 flex-1">

        {/* Title row: "TODAY'S SUNSET" + date */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="font-mono text-[10px] tracking-[2px] text-gray-500 uppercase font-medium">
              {dateLabel}&apos;s {typeTitle[type]}
            </span>
            <p className="font-mono text-[8px] tracking-[1.5px] text-gray-400 uppercase mt-0.5 truncate">
              {poetic}
            </p>
          </div>
          <span className="font-mono text-[9px] text-gray-400 tracking-wide flex-shrink-0 mt-0.5">
            {fullDate}
          </span>
        </div>

        {/* Large time + Karl's read inline-ish to save vertical space */}
        <div className="flex items-baseline gap-1 -mt-0.5">
          <span className="font-serif text-[32px] leading-none font-light text-gray-800 tracking-tight">
            {eventTimeData.time}
          </span>
          <span className="font-serif text-base text-gray-400 font-light">
            {eventTimeData.period}
          </span>
        </div>

        <p
          className="font-serif italic text-[12px] leading-snug text-gray-600"
          aria-label="Karl's take"
        >
          &ldquo;{karlLine}&rdquo;
          <span className="not-italic font-mono text-[8px] tracking-[2px] uppercase text-gray-400 ml-1.5">
            — Karl
          </span>
        </p>

        {/* Time to destination + Distance */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="font-mono text-[8px] tracking-[2px] text-gray-400 uppercase mb-0.5">
              {travelMode === 'walk' ? 'Walk time' : 'Drive time'}
            </p>
            <p className="font-serif text-lg font-light text-gray-800 leading-none">
              {travelMinutes !== null ? `${travelMinutes} min` : '—'}
            </p>
          </div>
          <div>
            <p className="font-mono text-[8px] tracking-[2px] text-gray-400 uppercase mb-0.5">
              Distance
            </p>
            <p className="font-serif text-lg font-light text-gray-800 leading-none">
              {distanceMi !== null ? `${distanceMi.toFixed(1)} mi` : '—'}
            </p>
          </div>
        </div>

        {/* Conditions row: Condition + Temperature */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-1.5">
            <div className="min-w-0">
              <p className="font-mono text-[8px] tracking-[2px] text-gray-400 uppercase mb-0.5">
                Conditions
              </p>
              <p className="font-serif text-sm font-normal text-gray-800 leading-tight truncate">{condition}</p>
            </div>
            <GaugeBar value={score} />
          </div>
          <div className="flex items-center gap-1.5">
            <div>
              <p className="font-mono text-[8px] tracking-[2px] text-gray-400 uppercase mb-0.5">
                Temp
              </p>
              <p className="font-serif text-sm font-normal text-gray-800 leading-tight">{temp}°</p>
            </div>
            <GaugeBar value={Math.min(100, Math.max(0, (temp - 40) * 2.5))} />
          </div>
        </div>

        {/* Cloud + Light Pollution */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-1.5">
            <div className="min-w-0">
              <p className="font-mono text-[8px] tracking-[2px] text-gray-400 uppercase mb-0.5">
                Clouds
              </p>
              <p className="font-serif text-sm font-normal text-gray-800 leading-tight truncate">{cloud}</p>
            </div>
            <GaugeBar value={cloudBarValue} />
          </div>
          <div className="flex items-center gap-1.5">
            <div>
              <p className="font-mono text-[8px] tracking-[2px] text-gray-400 uppercase mb-0.5">
                Light Poll.
              </p>
              <p className="font-serif text-sm font-normal text-gray-800 leading-tight">{spot.lightPollution}</p>
            </div>
            <GaugeBar value={spot.lightPollution === 'Low' ? 85 : spot.lightPollution === 'Mid' ? 50 : 20} />
          </div>
        </div>

        {/* Visibility score bar */}
        <div className="mt-auto pt-1">
          <p className="font-mono text-[8px] tracking-[2px] text-gray-400 uppercase mb-1">
            % Full Visibility
          </p>
          <div className="h-2.5 bg-gray-100 rounded-sm overflow-hidden relative">
            <div
              className="h-full score-bar-fill"
              style={{
                width: `${visibilityValue}%`,
                background: barGradient,
                opacity: 0.85,
              }}
            />
            <span className="absolute left-1.5 top-0 h-full flex items-center font-serif text-[10px] font-semibold text-gray-700">
              {visibilityValue}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
