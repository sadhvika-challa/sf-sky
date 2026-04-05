import { type Spot, getConditionLabel, getPoetic } from '../data/spots';
import SunCalc from 'suncalc';

type CardType = 'sunrise' | 'sunset' | 'stargazing';

interface ScoreCardProps {
  spot: Spot;
  type: CardType;
  eventDate: Date;
  distanceMi: number | null;
  walkMinutes: number | null;
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

// Estimated SF temperature based on month (rough averages)
function getEstimatedTemp(): number {
  const month = new Date().getMonth();
  const temps = [54, 56, 57, 58, 60, 62, 63, 64, 66, 64, 58, 54];
  return temps[month];
}

// Cloud cover estimate based on score
function getCloudCover(score: number): string {
  if (score >= 80) return 'Clear';
  if (score >= 60) return 'Partly';
  if (score >= 40) return 'Mid';
  return 'Overcast';
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
    <div className="w-[5px] h-[28px] rounded-full relative flex-shrink-0" style={{ background: getGaugeGradient() }}>
      <div
        className="absolute w-[9px] h-[9px] rounded-full border-[1.5px] border-white left-[-2px]"
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

export default function ScoreCard({ spot, type, eventDate, distanceMi, walkMinutes }: ScoreCardProps) {
  const score = spot[type];
  const times = SunCalc.getTimes(eventDate, spot.lat, spot.lng);
  const moonIllum = SunCalc.getMoonIllumination(eventDate);
  const dateLabel = formatDateShort(eventDate);
  const fullDate = formatFullDate(eventDate);

  let eventTimeData: { time: string; period: string };
  if (type === 'sunrise') {
    eventTimeData = formatTime(times.sunrise);
  } else if (type === 'sunset') {
    eventTimeData = formatTime(times.sunset);
  } else {
    eventTimeData = formatTime(times.nauticalDusk);
  }

  const condition = getConditionLabel(score);
  const poetic = getPoetic(type, score);
  const gradient = getSkyGradient(type, score);
  const barGradient = getBarGradient(type);
  const temp = getEstimatedTemp();
  const cloud = getCloudCover(score);
  const dots = dotColors[type];

  return (
    <div className="overflow-hidden bg-white shadow-lg min-w-[280px] max-w-[340px] flex-1 flex flex-col snap-start shrink-0">
      {/* Sky gradient header */}
      <div
        className="relative h-28 overflow-hidden"
        style={{ background: gradient }}
      >
        {/* Color dots — top left */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
          {dots.map((c, i) => (
            <span key={i} className="w-2 h-2 rounded-full" style={{ background: c.replace(/[\d.]+\)$/, '1)') }} />
          ))}
        </div>
        {type === 'stargazing' && (
          <div className="absolute bottom-2 right-3 text-white/40 text-[9px] font-mono tracking-wider uppercase">
            Moon {Math.round(moonIllum.fraction * 100)}%
          </div>
        )}
      </div>

      {/* Data section */}
      <div className="p-4 flex flex-col gap-4 flex-1">

        {/* Title row: "TODAY'S SUNSET" + date */}
        <div className="flex items-start justify-between">
          <div>
            <span className="font-mono text-[11px] tracking-[2px] text-gray-500 uppercase font-medium">
              {dateLabel}&apos;s {typeTitle[type]}
            </span>
            <p className="font-mono text-[9px] tracking-[1.5px] text-gray-400 uppercase mt-0.5">
              {poetic}
            </p>
          </div>
          <span className="font-mono text-[10px] text-gray-400 tracking-wide flex-shrink-0">
            {fullDate}
          </span>
        </div>

        {/* Large time */}
        <div className="flex items-baseline gap-1">
          <span className="font-serif text-[42px] leading-none font-light text-gray-800 tracking-tight">
            {eventTimeData.time}
          </span>
          <span className="font-serif text-lg text-gray-400 font-light">
            {eventTimeData.period}
          </span>
        </div>

        {/* Time to destination + Distance */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="font-mono text-[9px] tracking-[2px] text-gray-400 uppercase mb-1">
              Time to destination
            </p>
            <p className="font-serif text-2xl font-light text-gray-800">
              {walkMinutes !== null ? `${walkMinutes} min` : '—'}
            </p>
          </div>
          <div>
            <p className="font-mono text-[9px] tracking-[2px] text-gray-400 uppercase mb-1">
              Distance left
            </p>
            <p className="font-serif text-2xl font-light text-gray-800">
              {distanceMi !== null ? `${distanceMi.toFixed(1)} mi` : '—'}
            </p>
          </div>
        </div>

        {/* Conditions row: Condition + Temperature */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <div>
              <p className="font-mono text-[9px] tracking-[2px] text-gray-400 uppercase mb-1">
                {typeTitle[type]} Conditions
              </p>
              <p className="font-serif text-lg font-normal text-gray-800">{condition}</p>
            </div>
            <GaugeBar value={score} />
          </div>
          <div className="flex items-center gap-2">
            <div>
              <p className="font-mono text-[9px] tracking-[2px] text-gray-400 uppercase mb-1">
                Temperature
              </p>
              <p className="font-serif text-lg font-normal text-gray-800">{temp}°</p>
            </div>
            <GaugeBar value={Math.min(100, Math.max(0, (temp - 40) * 2.5))} />
          </div>
        </div>

        {/* Cloud + Light Pollution */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <div>
              <p className="font-mono text-[9px] tracking-[2px] text-gray-400 uppercase mb-1">
                Cloud Cover
              </p>
              <p className="font-serif text-lg font-normal text-gray-800">{cloud}</p>
            </div>
            <GaugeBar value={score} />
          </div>
          <div className="flex items-center gap-2">
            <div>
              <p className="font-mono text-[9px] tracking-[2px] text-gray-400 uppercase mb-1">
                Light Pollution
              </p>
              <p className="font-serif text-lg font-normal text-gray-800">{spot.lightPollution}</p>
            </div>
            <GaugeBar value={spot.lightPollution === 'Low' ? 85 : spot.lightPollution === 'Mid' ? 50 : 20} />
          </div>
        </div>

        {/* Visibility score bar */}
        <div className="mt-auto pt-2">
          <p className="font-mono text-[9px] tracking-[2px] text-gray-400 uppercase mb-2">
            % Full Visibility
          </p>
          <div className="h-3 bg-gray-100 overflow-hidden relative">
            <div
              className="h-full score-bar-fill"
              style={{
                width: `${score}%`,
                background: barGradient,
                opacity: 0.8,
              }}
            />
            <span className="absolute left-2 top-0 h-full flex items-center font-serif text-[11px] font-semibold text-gray-700">
              {score}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
