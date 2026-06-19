import { useEffect, useMemo, useRef } from 'react';
import {
  getScoreTypesForHours,
  type TimeOfDayType,
} from '../utils/hourScoreType';
import {
  SunriseIcon,
  SunsetIcon,
  StargazingIcon,
  NowIcon,
} from './icons/ScrubberIcons';

export interface EventMarker {
  type: 'sunrise' | 'sunset' | 'stargazing';
  hourKey: string;
  label: string;
  time: Date;
}

interface WeatherControlsProps {
  hourKeys: string[];
  hourKey: string;
  onHourChange: (key: string) => void;
  /** Index of the "now" hour within `hourKeys`, or -1 if not present. */
  nowIndex: number;
  eventMarkers?: EventMarker[];
  /** Best score among currently visible spots for each hour key. */
  bestScorePerHour?: Map<string, number>;
}

const SCRUBBER_HOUR_LIMIT = 48;

interface TimePalette {
  panelTint: string;
  iconColor: string;
  selectedBg: string;
  selectedBorder: string;
  accentDot: string;
}

const TIME_PALETTES: Record<TimeOfDayType, TimePalette> = {
  sunrise: {
    // Soft pink-peach dawn
    panelTint: 'rgba(244, 180, 152, 0.08)',
    iconColor: 'text-[#D4956A]',
    selectedBg: 'rgba(244, 180, 152, 0.12)',
    selectedBorder: '#D4956A',
    accentDot: '#D4956A',
  },
  sunset: {
    // Warm amber-violet dusk
    panelTint: 'rgba(200, 140, 180, 0.08)',
    iconColor: 'text-[#B07AAF]',
    selectedBg: 'rgba(200, 140, 180, 0.12)',
    selectedBorder: '#B07AAF',
    accentDot: '#B07AAF',
  },
  stargazing: {
    // Cool indigo night
    panelTint: 'rgba(123, 143, 180, 0.08)',
    iconColor: 'text-[#7B8FA1]',
    selectedBg: 'rgba(123, 143, 161, 0.12)',
    selectedBorder: '#7B8FA1',
    accentDot: '#7B8FA1',
  },
  now: {
    // Warm cream day (essentially invisible tint, the default)
    panelTint: 'rgba(139, 168, 136, 0.06)',
    iconColor: 'text-[#8BA888]',
    selectedBg: 'rgba(139, 168, 136, 0.12)',
    selectedBorder: '#8BA888',
    accentDot: '#8BA888',
  },
} as const;

const TYPE_LABELS: Record<TimeOfDayType, string> = {
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  stargazing: 'Stargazing',
  now: 'Now',
};

function ScoreTypeIcon({
  type,
  size,
  className,
}: {
  type: TimeOfDayType;
  size: number;
  className?: string;
}) {
  switch (type) {
    case 'sunrise':
      return <SunriseIcon size={size} className={className} />;
    case 'sunset':
      return <SunsetIcon size={size} className={className} />;
    case 'stargazing':
      return <StargazingIcon size={size} className={className} />;
    default:
      return <NowIcon size={size} className={className} />;
  }
}

/** Sage / tan / dusty-rose tier color, matching the rest of the app. */
function scoreColor(score: number): string {
  if (score >= 70) return '#5B9A7B';
  if (score >= 45) return '#C4956A';
  return '#B07A7A';
}

export default function WeatherControls({
  hourKeys,
  hourKey,
  onHourChange,
  nowIndex,
  bestScorePerHour,
}: WeatherControlsProps) {
  const visibleKeys = useMemo(
    () => hourKeys.slice(0, SCRUBBER_HOUR_LIMIT),
    [hourKeys],
  );

  const scoreTypes = useMemo(
    () => getScoreTypesForHours(visibleKeys),
    [visibleKeys],
  );

  const dayBoundaries = useMemo(
    () => deriveDayBoundaries(visibleKeys),
    [visibleKeys],
  );

  const selectedType = scoreTypes.get(hourKey) ?? 'now';
  const currentPalette = TIME_PALETTES[selectedType];
  const typeLabel = TYPE_LABELS[selectedType];
  const contextLabel = hourKey ? formatContextLabel(hourKey) : '–';

  const scrollRef = useRef<HTMLDivElement>(null);
  // Refs to each card so we can center the selected one on programmatic
  // selection. Keyed by hour key.
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  // Track whether the last selection came from a user tap on a card — taps
  // already put the card under the finger, so we skip the auto-scroll then.
  const userTapRef = useRef(false);

  useEffect(() => {
    if (userTapRef.current) {
      userTapRef.current = false;
      return;
    }
    const node = cardRefs.current.get(hourKey);
    if (node) {
      node.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [hourKey]);

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Forecast hours">
      {/* Header row: score type label (left) + time context (right) */}
      <div className="flex justify-between items-baseline px-1">
        <span className="font-instrument-serif text-xl text-[#1a1a18]">
          {typeLabel}
        </span>
        <span className="font-mono text-xs text-gray-400 tracking-wide">
          {contextLabel}
        </span>
      </div>

      {/* Tint layer + scrollable strip */}
      <div className="relative">
        {/* Background tint — transitions with score type */}
        <div
          className="absolute inset-0 rounded-2xl transition-colors duration-300"
          style={{ backgroundColor: currentPalette.panelTint }}
          aria-hidden="true"
        />

        {/* Horizontal scroll container */}
        <div
          ref={scrollRef}
          className="relative flex overflow-x-auto gap-0.5 px-2 py-2 scrollbar-hide"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          {visibleKeys.map((key, i) => {
            const type = scoreTypes.get(key) ?? 'now';
            const showDayDivider = i > 0 && dayBoundaries.includes(i);
            return (
              <div key={key} className="flex items-stretch">
                {showDayDivider && (
                  <div
                    className="self-center w-px h-2 mx-0.5 bg-gray-300/30"
                    aria-hidden="true"
                  />
                )}
                <HourCard
                  hourKey={key}
                  isSelected={key === hourKey}
                  isNow={i === nowIndex}
                  scoreType={type}
                  bestScore={bestScorePerHour?.get(key)}
                  palette={TIME_PALETTES[type]}
                  cardRef={(node) => {
                    if (node) cardRefs.current.set(key, node);
                    else cardRefs.current.delete(key);
                  }}
                  onClick={() => {
                    userTapRef.current = true;
                    onHourChange(key);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface HourCardProps {
  hourKey: string;
  isSelected: boolean;
  isNow: boolean;
  scoreType: TimeOfDayType;
  bestScore?: number;
  palette: TimePalette;
  cardRef: (node: HTMLButtonElement | null) => void;
  onClick: () => void;
}

function HourCard({
  hourKey,
  isSelected,
  isNow,
  scoreType,
  bestScore,
  palette,
  cardRef,
  onClick,
}: HourCardProps) {
  const timeLabel = isNow ? 'Now' : formatShortHour(hourKey);

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={`${isNow ? 'Now' : formatContextLabel(hourKey)}${
        bestScore !== undefined ? `, best score ${Math.round(bestScore)}` : ''
      }`}
      className="flex flex-col items-center gap-1 min-w-[48px] px-2 py-2.5 rounded-2xl border-[1.5px] transition-all duration-200 ease-out cursor-pointer"
      style={{
        borderColor: isSelected ? palette.selectedBorder : 'transparent',
        backgroundColor: isSelected ? palette.selectedBg : 'transparent',
      }}
    >
      {/* Time label */}
      <span
        className={`font-mono text-[11px] tabular-nums leading-none ${
          isSelected ? 'text-[#1a1a18]' : 'text-gray-400'
        }`}
      >
        {timeLabel}
      </span>

      {/* Icon */}
      <ScoreTypeIcon
        type={scoreType}
        size={16}
        className={isSelected ? palette.iconColor : 'text-gray-300'}
      />

      {/* Score (only when provided) */}
      {bestScore !== undefined && (
        <span
          className="font-mono text-[13px] font-semibold leading-none"
          style={{ color: scoreColor(bestScore), fontVariantNumeric: 'tabular-nums' }}
        >
          {Math.round(bestScore)}
        </span>
      )}
    </button>
  );
}

function deriveDayBoundaries(hourKeys: string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < hourKeys.length; i++) {
    const key = hourKeys[i];
    if (key.endsWith('T00')) out.push(i);
  }
  return out;
}

/** Compact hour like "8p", "12a", "2p" for a card's time label. */
function formatShortHour(hourKey: string): string {
  const parsed = new Date(`${hourKey}:00:00`);
  if (Number.isNaN(parsed.getTime())) return hourKey;
  const h = parsed.getHours();
  const suffix = h >= 12 ? 'p' : 'a';
  const h12 = h % 12 || 12;
  return `${h12}${suffix}`;
}

/**
 * Date context for the header, e.g. "Tonight · 8:35pm", "Today · 2:15pm",
 * "Tomorrow · 6:12am".
 */
function formatContextLabel(hourKey: string): string {
  const parsed = new Date(`${hourKey}:00:00`);
  if (Number.isNaN(parsed.getTime())) return hourKey;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
  );
  const dayDiff = Math.round(
    (startOfTarget.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000),
  );

  const hour = parsed.getHours();
  let dayWord: string;
  if (dayDiff === 0) {
    // Evening hours read more naturally as "Tonight".
    dayWord = hour >= 18 ? 'Tonight' : 'Today';
  } else if (dayDiff === 1) {
    dayWord = 'Tomorrow';
  } else {
    dayWord = parsed.toLocaleDateString(undefined, { weekday: 'long' });
  }

  const m = String(parsed.getMinutes()).padStart(2, '0');
  const suffix = hour >= 12 ? 'pm' : 'am';
  const h12 = hour % 12 || 12;
  return `${dayWord} · ${h12}:${m}${suffix}`;
}
