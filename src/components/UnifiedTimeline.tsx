import { useCallback, useMemo, useRef, useState } from 'react';
import type { ViewMode } from '../utils/scoring';
import type { EventTimes } from '../utils/events';
import { formatHourKeyInTimeZone, parseHourKeyInTimeZone } from '../utils/timeline';

interface UnifiedTimelineProps {
  hourKeys: string[];
  hourKey: string;
  onHourChange: (key: string) => void;
  viewMode: ViewMode;
  eventTimes: EventTimes;
  timeZone: string;
  loading?: boolean;
}

const ZONE_COLORS: Record<ViewMode, string> = {
  stargazing: 'rgba(44, 44, 74, 0.30)',
  sunrise: 'rgba(217, 70, 168, 0.30)',
  now: 'rgba(135, 189, 222, 0.25)',
  sunset: 'rgba(204, 41, 54, 0.30)',
};

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  stargazing: 'Stargazing',
  sunrise: 'Sunrise',
  now: 'Now',
  sunset: 'Sunset',
};

function formatTime(date: Date, timeZone: string, includeMinutes = true): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: includeMinutes ? '2-digit' : undefined,
    hour12: true,
  }).format(date).toLowerCase().replace(/\s/g, '');
}

function formatSelectedTime(hourKey: string, timeZone: string): string {
  if (!hourKey) return `Now · ${formatTime(new Date(), timeZone, false)}`;
  const instant = parseHourKeyInTimeZone(hourKey, timeZone);
  if (!instant) return 'Forecast hour unavailable';
  const todayKey = formatHourKeyInTimeZone(new Date(), timeZone).slice(0, 10);
  const selectedDate = hourKey.slice(0, 10);
  const date = new Date(`${selectedDate}T12:00:00Z`);
  const dayLabel = selectedDate === todayKey
    ? 'Today'
    : new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date);
  return `${dayLabel} · ${formatTime(instant, timeZone)}`;
}

function nearestHourKeyForTime(eventTime: Date, hourKeys: string[], timeZone: string): string {
  let best = '';
  let bestDiff = Infinity;
  for (const key of hourKeys) {
    const instant = parseHourKeyInTimeZone(key, timeZone);
    if (!instant) continue;
    const diff = Math.abs(instant.getTime() - eventTime.getTime());
    if (diff < bestDiff) {
      best = key;
      bestDiff = diff;
    }
  }
  return best;
}

export default function UnifiedTimeline({
  hourKeys,
  hourKey,
  onHourChange,
  viewMode,
  eventTimes,
  timeZone,
  loading = false,
}: UnifiedTimelineProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [pulseKey, setPulseKey] = useState(0);
  const disabled = hourKeys.length === 0;
  // Position zero is always the canonical live state. Forecast hours begin at one.
  const max = hourKeys.length;
  const selectedForecastIndex = hourKey === '' ? -1 : hourKeys.indexOf(hourKey);
  const selectionUnavailable = hourKey !== '' && selectedForecastIndex < 0;
  const currentIndex = selectedForecastIndex >= 0 ? selectedForecastIndex + 1 : 0;
  const thumbPct = max > 0 ? (currentIndex / max) * 100 : 0;

  const railPcts = useMemo(() => ({
    sunrisePct: eventTimes.sunrisePct,
    sunsetPct: eventTimes.sunsetPct,
  }), [eventTimes.sunrisePct, eventTimes.sunsetPct]);

  const zoneGradient = useMemo(() => {
    const sunriseStart = Math.max(0, railPcts.sunrisePct - 3);
    const sunriseEnd = Math.min(100, railPcts.sunrisePct + 3);
    const sunsetStart = Math.max(0, railPcts.sunsetPct - 3);
    const sunsetEnd = Math.min(100, railPcts.sunsetPct + 3);
    return `linear-gradient(to right, ${ZONE_COLORS.stargazing} 0%, ${ZONE_COLORS.stargazing} ${sunriseStart}%, ${ZONE_COLORS.sunrise} ${sunriseStart}%, ${ZONE_COLORS.sunrise} ${sunriseEnd}%, ${ZONE_COLORS.now} ${sunriseEnd}%, ${ZONE_COLORS.now} ${sunsetStart}%, ${ZONE_COLORS.sunset} ${sunsetStart}%, ${ZONE_COLORS.sunset} ${sunsetEnd}%, ${ZONE_COLORS.stargazing} ${sunsetEnd}%, ${ZONE_COLORS.stargazing} 100%)`;
  }, [railPcts]);

  const keyForIndex = useCallback((index: number): string => {
    if (index <= 0) return '';
    return hourKeys[Math.min(index - 1, hourKeys.length - 1)] ?? '';
  }, [hourKeys]);

  const resolvePosition = useCallback((clientX: number) => {
    const rail = railRef.current;
    if (!rail || disabled) return;
    const rect = rail.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const index = Math.round((x / Math.max(rect.width, 1)) * max);
    onHourChange(keyForIndex(index));
  }, [disabled, keyForIndex, max, onHourChange]);

  const jumpToEvent = useCallback((event: 'sunrise' | 'sunset') => {
    const key = nearestHourKeyForTime(eventTimes[event], hourKeys, timeZone);
    if (key) onHourChange(key);
  }, [eventTimes, hourKeys, onHourChange, timeZone]);

  const valueText = `${VIEW_MODE_LABELS[viewMode]}, ${formatSelectedTime(hourKey, timeZone)}`;

  return (
    <div
      className="flex flex-col gap-1.5"
      role="group"
      aria-label="Timeline scrubber"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between px-0.5">
        <span className="font-serif text-[18px] leading-tight text-gray-800">
          {VIEW_MODE_LABELS[viewMode]}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-[#9a9488]" aria-live="polite">
          {formatSelectedTime(hourKey, timeZone)}
        </span>
      </div>

      <div
        ref={railRef}
        className={`relative h-11 touch-none select-none rounded-lg ${disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}
        role="slider"
        aria-label="Forecast hour"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={currentIndex}
        aria-valuetext={valueText}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
          draggingRef.current = true;
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          resolvePosition(event.clientX);
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
          if (draggingRef.current) resolvePosition(event.clientX);
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          draggingRef.current = false;
          setPulseKey((key) => key + 1);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={(event) => {
          event.stopPropagation();
          draggingRef.current = false;
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          let nextIndex = currentIndex;
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextIndex += 1;
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextIndex -= 1;
          else if (event.key === 'Home') nextIndex = 0;
          else if (event.key === 'End') nextIndex = max;
          else return;
          event.preventDefault();
          onHourChange(keyForIndex(Math.max(0, Math.min(max, nextIndex))));
        }}
      >
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[6px] rounded-full" style={{ background: zoneGradient }} aria-hidden="true" />
        <span className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#1a1a18]" style={{ left: 0 }} aria-hidden="true" />
        {railPcts.sunrisePct > 0 && railPcts.sunrisePct < 100 && (
          <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#D946A8] border-2 border-[#FAF9F6]" style={{ left: `${railPcts.sunrisePct}%` }} aria-hidden="true" />
        )}
        {railPcts.sunsetPct > 0 && railPcts.sunsetPct < 100 && (
          <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#CC2936] border-2 border-[#FAF9F6]" style={{ left: `${railPcts.sunsetPct}%` }} aria-hidden="true" />
        )}
        {!disabled && (
          <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-[#1a1a18] pointer-events-none z-20 border-[2.5px] border-[#FAF9F6]" style={{ left: `${thumbPct}%` }} aria-hidden="true">
            <span key={pulseKey} className="block absolute inset-0 rounded-full border border-[#1a1a18]/40 weather-thumb-pulse" />
          </span>
        )}
      </div>

      {selectionUnavailable && (
        <p className="text-center font-mono text-[10px] text-amber-700" role="status">
          That exact hour is unavailable. Choose another hour or return to Now.
        </p>
      )}
      {disabled ? (
        <div className="min-h-10 flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] text-[#9a9488]" role="status">
            {loading ? 'Loading forecast hours…' : 'Hourly forecast unavailable'}
          </p>
          {hourKey !== '' && (
            <button
              type="button"
              className="min-h-10 px-3 rounded-lg text-[10px] font-mono text-gray-700 bg-gray-100 active:bg-gray-200"
              onClick={() => onHourChange('')}
            >
              Return to Now
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1" aria-label="Timeline shortcuts">
          <button type="button" className="min-h-10 rounded-lg text-[10px] font-mono text-gray-600 active:bg-gray-100" onClick={() => onHourChange('')}>Now</button>
          <button type="button" className="min-h-10 rounded-lg text-[10px] font-mono text-[#9B1D7D] active:bg-pink-50" onClick={() => jumpToEvent('sunrise')}>Sunrise {formatTime(eventTimes.sunrise, timeZone, false)}</button>
          <button type="button" className="min-h-10 rounded-lg text-[10px] font-mono text-[#8B1A23] active:bg-red-50" onClick={() => jumpToEvent('sunset')}>Sunset {formatTime(eventTimes.sunset, timeZone, false)}</button>
        </div>
      )}
    </div>
  );
}
