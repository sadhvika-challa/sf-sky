import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventMarker } from '../App';

interface WeatherControlsProps {
  hourKeys: string[];
  hourKey: string;
  onHourChange: (key: string) => void;
  /** Index of the "now" hour within `hourKeys`, or -1 if not present. */
  nowIndex: number;
  eventMarkers?: EventMarker[];
}

const SCRUBBER_HOUR_LIMIT = 48;

const EVENT_COLORS: Record<EventMarker['type'], string> = {
  sunrise: '#D946A8',
  sunset: '#CC2936',
  stargazing: '#a78bfa',
};

function formatEventTime(time: Date): string {
  const h = time.getHours();
  const m = String(time.getMinutes()).padStart(2, '0');
  const suffix = h >= 12 ? 'p' : 'a';
  const h12 = h % 12 || 12;
  return `${h12}:${m}${suffix}`;
}

export default function WeatherControls({
  hourKeys,
  hourKey,
  onHourChange,
  nowIndex,
  eventMarkers,
}: WeatherControlsProps) {
  const visibleKeys = useMemo(
    () => hourKeys.slice(0, SCRUBBER_HOUR_LIMIT),
    [hourKeys],
  );
  const currentIndex = Math.max(0, visibleKeys.indexOf(hourKey));
  const max = Math.max(0, visibleKeys.length - 1);

  const dayBoundaries = useMemo(() => deriveDayBoundaries(visibleKeys), [visibleKeys]);
  const startLabel = visibleKeys.length > 0 ? formatHourLabel(visibleKeys[0]) : '–';
  const currentLabel = hourKey ? formatHourLabel(hourKey) : '–';

  const visibleMarkers = useMemo(() => {
    if (!eventMarkers || max === 0) return [];
    return eventMarkers
      .map((m) => {
        const idx = visibleKeys.indexOf(m.hourKey);
        if (idx < 0) return null;
        return { ...m, idx };
      })
      .filter((m): m is EventMarker & { idx: number } => m !== null);
  }, [eventMarkers, visibleKeys, max]);

  const [dragging, setDragging] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const lastIdxRef = useRef<number>(currentIndex);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    lastIdxRef.current = currentIndex;
  }, [currentIndex]);

  const thumbPct = max > 0 ? (currentIndex / max) * 100 : 0;
  const isAtNow = nowIndex >= 0 && currentIndex === nowIndex;

  const resolvePositionToIndex = useCallback(
    (clientX: number) => {
      if (!railRef.current || visibleKeys.length === 0) return;
      const rect = railRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const pct = x / rect.width;
      const idx = Math.round(pct * max);
      const clamped = Math.max(0, Math.min(idx, max));
      const next = visibleKeys[clamped];
      if (!next) return;
      if (clamped !== lastIdxRef.current) {
        navigator.vibrate?.(8);
      }
      onHourChange(next);
    },
    [visibleKeys, max, onHourChange],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      resolvePositionToIndex(e.clientX);
    },
    [resolvePositionToIndex],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      resolvePositionToIndex(e.clientX);
    },
    [dragging, resolvePositionToIndex],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
    setPulseKey((k) => k + 1);
  }, []);

  const handleNowClick = useCallback(() => {
    if (nowIndex >= 0 && visibleKeys[nowIndex]) {
      onHourChange(visibleKeys[nowIndex]);
    }
  }, [nowIndex, visibleKeys, onHourChange]);

  return (
    <div
      className="flex flex-col py-3"
      role="group"
      aria-label="Weather map controls"
    >
      {/* Time labels */}
      <div className="flex items-center justify-between mb-2 px-2">
        <span className="font-mono text-[11px] text-gray-500 tabular-nums">
          {startLabel}
        </span>
        <span
          className={`font-mono text-[13px] tabular-nums transition-colors ${
            dragging ? 'text-gray-700 font-bold' : 'text-gray-700 font-medium'
          }`}
        >
          {currentLabel}
        </span>
      </div>

      {/* Rail container with 8px inset */}
      <div className="px-2">
        <div
          ref={railRef}
          className="relative h-8 touch-none select-none cursor-pointer"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={currentIndex}
          aria-label="Forecast hour"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' && currentIndex < max) {
              onHourChange(visibleKeys[currentIndex + 1]);
            } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
              onHourChange(visibleKeys[currentIndex - 1]);
            }
          }}
        >
          {/* Background track — 3px */}
          <div
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-cream-dark"
            aria-hidden="true"
          />

          {/* Filled (progress) portion */}
          {max > 0 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full"
              style={{
                left: 0,
                width: `${thumbPct}%`,
                backgroundColor: 'rgba(91, 154, 123, 0.4)',
              }}
              aria-hidden="true"
            />
          )}

          {/* Hour ticks — 3px tall */}
          {max > 0 &&
            visibleKeys.map((_, idx) => {
              if (idx === 0 || idx === max) return null;
              if (dayBoundaries.includes(idx)) return null;
              return (
                <div
                  key={`hr-${idx}`}
                  className="absolute top-1/2 -translate-y-1/2 w-px h-[3px] bg-gray-300/30"
                  style={{ left: `${(idx / max) * 100}%` }}
                  aria-hidden="true"
                />
              );
            })}

          {/* Day boundary ticks — 6px tall */}
          {dayBoundaries.map((idx) =>
            idx === 0 || max === 0 ? null : (
              <div
                key={`day-${idx}`}
                className="absolute top-1/2 -translate-y-1/2 w-px h-[6px] bg-gray-400/50"
                style={{ left: `${(idx / max) * 100}%` }}
                aria-hidden="true"
              />
            ),
          )}

          {/* Event markers */}
          {visibleMarkers.map((marker) => (
            <button
              key={`${marker.type}-${marker.hourKey}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onHourChange(marker.hourKey);
              }}
              className="absolute flex flex-col items-center pointer-events-auto z-10"
              style={{
                left: `${(marker.idx / max) * 100}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
              aria-label={`Jump to ${marker.label} at ${formatEventTime(marker.time)}`}
            >
              <div
                className="w-0.5 h-3 rounded-full"
                style={{ backgroundColor: EVENT_COLORS[marker.type] }}
              />
              <div
                className="mt-0.5 text-[8px] font-mono uppercase tracking-wider leading-none"
                style={{ color: EVENT_COLORS[marker.type] }}
              >
                {marker.type === 'stargazing' ? 'Stars' : marker.label}
              </div>
              <div className="text-[7px] font-mono text-gray-500 leading-none">
                {formatEventTime(marker.time)}
              </div>
            </button>
          ))}

          {/* "Now" green dot on the track */}
          {nowIndex >= 0 && nowIndex <= max && max > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNowClick();
              }}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 flex items-center justify-center w-[44px] h-[44px]"
              style={{ left: `${(nowIndex / max) * 100}%` }}
              aria-label="Jump to now"
            >
              <div
                className={`w-1.5 h-1.5 rounded-full bg-pin-great ${
                  isAtNow ? 'animate-[nowPulse_2s_ease-in-out_infinite]' : ''
                }`}
              />
            </button>
          )}

          {/* Custom thumb — 44px touch target, 20px visual */}
          {visibleKeys.length > 0 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none z-20 flex items-center justify-center w-[44px] h-[44px]"
              style={{ left: `${thumbPct}%` }}
            >
              <div
                className={`relative w-5 h-5 rounded-full bg-white border border-gray-300 transition-transform duration-100 ${
                  dragging ? 'scale-110' : 'scale-100'
                }`}
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}
              >
                <span
                  key={pulseKey}
                  aria-hidden="true"
                  className="block absolute inset-0 rounded-full bg-white/50 weather-thumb-bounce"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* "Now" label below the track, aligned to the Now dot */}
      {nowIndex >= 0 && nowIndex <= max && max > 0 && (
        <div className="relative h-4 mt-0.5 px-2">
          <button
            type="button"
            onClick={handleNowClick}
            disabled={isAtNow}
            className="absolute -translate-x-1/2 font-mono text-[9px] text-pin-great font-medium disabled:opacity-60"
            style={{ left: `calc(0.5rem + ${(nowIndex / max) * 100}%)` }}
          >
            Now
          </button>
        </div>
      )}
    </div>
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

function formatHourLabel(hourKey: string): string {
  const parsed = new Date(`${hourKey}:00:00`);
  if (Number.isNaN(parsed.getTime())) return hourKey;
  const weekday = parsed.toLocaleDateString(undefined, { weekday: 'short' });
  const time = parsed
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: undefined })
    .replace(/\s?(AM|PM)/, (_, p) => p.toLowerCase());
  return `${weekday} ${time}`;
}
