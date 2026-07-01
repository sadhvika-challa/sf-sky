import { useEffect, useMemo, useRef } from 'react';
import SunCalc from 'suncalc';
import {
  getScoreTypesForHours,
  SF_LAT,
  SF_LNG,
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

  const sunEventMarkers = useMemo(
    () => computeSunEventMarkers(visibleKeys, dayBoundaries),
    [visibleKeys, dayBoundaries],
  );

  const sunEventByKey = useMemo(() => {
    const map = new Map<string, SunEventMarker>();
    for (const marker of sunEventMarkers) map.set(marker.hourKey, marker);
    return map;
  }, [sunEventMarkers]);

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
            const sunMarker = sunEventByKey.get(key);
            return (
              <div key={key} className="flex items-stretch">
                {showDayDivider && (
                  <div
                    className="self-center w-px h-2 mx-0.5 bg-gray-300/30"
                    aria-hidden="true"
                  />
                )}
                <div className="flex flex-col items-center">
                  <SunEventBadge
                    marker={sunMarker}
                    onJump={() => {
                      if (!sunMarker) return;
                      userTapRef.current = true;
                      onHourChange(sunMarker.hourKey);
                    }}
                  />
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

interface SunEventMarker {
  type: 'sunrise' | 'sunset';
  hourKey: string;
  time: Date;
}

/**
 * For each visible day (day 0 = first hour, then each midnight boundary),
 * compute the true sunrise/sunset times at the SF centroid and snap each to
 * the nearest hour key that appears in `visibleKeys`. Events that round to a
 * key outside the window are dropped.
 */
function computeSunEventMarkers(
  visibleKeys: string[],
  dayBoundaries: number[],
): SunEventMarker[] {
  if (visibleKeys.length === 0) return [];

  const validKeys = new Set(visibleKeys);
  const dayAnchors = [0, ...dayBoundaries.filter((i) => i > 0)];
  const seen = new Set<string>();
  const markers: SunEventMarker[] = [];

  for (const idx of dayAnchors) {
    const anchor = new Date(`${visibleKeys[idx]}:00:00`);
    if (Number.isNaN(anchor.getTime())) continue;
    const times = SunCalc.getTimes(anchor, SF_LAT, SF_LNG);
    for (const type of ['sunrise', 'sunset'] as const) {
      const time = times[type];
      if (!time || Number.isNaN(time.getTime())) continue;
      const key = nearestHourKey(time);
      if (!validKeys.has(key)) continue;
      const dedupe = `${type}:${key}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      markers.push({ type, hourKey: key, time });
    }
  }
  return markers;
}

function nearestHourKey(d: Date): string {
  const rounded = new Date(d);
  if (rounded.getMinutes() >= 30) rounded.setHours(rounded.getHours() + 1);
  rounded.setMinutes(0, 0, 0);
  const y = rounded.getFullYear();
  const m = String(rounded.getMonth() + 1).padStart(2, '0');
  const day = String(rounded.getDate()).padStart(2, '0');
  const h = String(rounded.getHours()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}`;
}

function formatEventTime(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${m}${suffix}`;
}

interface SunEventBadgeProps {
  marker: SunEventMarker | undefined;
  onJump: () => void;
}

/**
 * Small tappable pill that sits above the hour card whose nearest hour is the
 * actual sunrise/sunset. Reserves a fixed slot even when no marker is present
 * so every card in the strip stays vertically aligned.
 */
function SunEventBadge({ marker, onJump }: SunEventBadgeProps) {
  if (!marker) {
    return <div className="h-6" aria-hidden="true" />;
  }
  const palette = TIME_PALETTES[marker.type];
  const label =
    marker.type === 'sunrise'
      ? `Sunrise ${formatEventTime(marker.time)}`
      : `Sunset ${formatEventTime(marker.time)}`;
  return (
    <button
      type="button"
      onClick={(e) => {
        // Prevent bubbling to the underlying HourCard so we don't double-fire
        // an already-identical hour change.
        e.stopPropagation();
        onJump();
      }}
      aria-label={`Jump to ${label.toLowerCase()}`}
      title={label}
      className="flex items-center justify-center h-6 min-w-[24px] px-1 rounded-full cursor-pointer transition-transform duration-150 active:scale-95"
      style={{
        backgroundColor: palette.selectedBg,
        border: `1px solid ${palette.selectedBorder}`,
      }}
    >
      <ScoreTypeIcon
        type={marker.type}
        size={14}
        className={palette.iconColor}
      />
    </button>
  );
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
