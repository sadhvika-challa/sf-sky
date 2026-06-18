import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ViewMode } from '../utils/scoring';
import type { EventTimes } from '../utils/events';

interface UnifiedTimelineProps {
  hourKeys: string[];
  hourKey: string;
  onHourChange: (key: string) => void;
  viewMode: ViewMode;
  eventTimes: EventTimes;
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

function formatTimeLabel(date: Date): string {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const suffix = h >= 12 ? 'p' : 'a';
  const h12 = h % 12 || 12;
  return `${h12}:${m}${suffix}`;
}

function nearestHourLabel(date: Date): string {
  const rounded = date.getMinutes() >= 30
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours() + 1)
    : new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
  const h = rounded.getHours();
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}${suffix}`;
}

function formatScrubTime(hourKey: string): string {
  if (!hourKey) return 'Now';
  const d = new Date(`${hourKey}:00:00`);
  if (Number.isNaN(d.getTime())) return hourKey;

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const h = d.getHours();
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  const time = `${h12}:00${suffix}`;

  if (isToday) {
    return (h >= 18 || h < 6) ? `Tonight · ${time}` : `Today · ${time}`;
  }
  if (isTomorrow) {
    if (h < 6) return `Tonight · ${time}`;
    return `Tomorrow · ${time}`;
  }

  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  return `${weekday} · ${time}`;
}

function formatEventScrubTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return '—';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  const time = `${h12}:${m}${suffix}`;

  if (isToday) {
    return (h >= 18 || h < 6) ? `Tonight · ${time}` : `Today · ${time}`;
  }
  if (isTomorrow) {
    if (h < 6) return `Tonight · ${time}`;
    return `Tomorrow · ${time}`;
  }

  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  return `${weekday} · ${time}`;
}

function nearestHourKeyForTime(eventTime: Date, hourKeys: string[]): string {
  if (hourKeys.length === 0) return '';
  const target = eventTime.getTime();
  let best = hourKeys[0];
  let bestDiff = Infinity;
  for (const key of hourKeys) {
    const t = new Date(`${key}:00:00`).getTime();
    const diff = Math.abs(t - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = key;
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
}: UnifiedTimelineProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [snappedEvent, setSnappedEvent] = useState<{
    type: 'sunrise' | 'sunset';
    time: Date;
  } | null>(null);

  const max = Math.max(0, hourKeys.length - 1);
  const currentIndex = hourKey === '' ? 0 : Math.max(0, hourKeys.indexOf(hourKey));
  const baseThumbPct = max > 0 ? (currentIndex / max) * 100 : 0;

  const railPcts = useMemo(() => {
    if (hourKeys.length < 2) return { sunrisePct: 0, sunsetPct: 0, duskPct: 0 };
    const startMs = new Date(`${hourKeys[0]}:00:00`).getTime();
    const endMs = new Date(`${hourKeys[hourKeys.length - 1]}:00:00`).getTime();
    const span = endMs - startMs || 1;
    const toPct = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - startMs) / span) * 100));
    return {
      sunrisePct: toPct(eventTimes.sunrise),
      sunsetPct: toPct(eventTimes.sunset),
      duskPct: toPct(eventTimes.dusk),
    };
  }, [hourKeys, eventTimes]);

  const thumbPct = snappedEvent
    ? (snappedEvent.type === 'sunrise' ? railPcts.sunrisePct : railPcts.sunsetPct)
    : baseThumbPct;

  // Compute zone segments for the rail background gradient.
  const zoneGradient = useMemo(() => {
    const { sunrisePct, sunsetPct, duskPct } = railPcts;
    const sunriseStart = Math.max(0, sunrisePct - 3);
    const sunriseEnd = Math.min(100, sunrisePct + 3);
    const sunsetStart = Math.max(0, sunsetPct - 3);
    const sunsetEnd = Math.min(100, sunsetPct + 3);

    const segments: string[] = [];
    segments.push(`${ZONE_COLORS.stargazing} 0%`);
    segments.push(`${ZONE_COLORS.stargazing} ${sunriseStart}%`);
    segments.push(`${ZONE_COLORS.sunrise} ${sunriseStart}%`);
    segments.push(`${ZONE_COLORS.sunrise} ${sunriseEnd}%`);
    segments.push(`${ZONE_COLORS.now} ${sunriseEnd}%`);
    segments.push(`${ZONE_COLORS.now} ${sunsetStart}%`);
    segments.push(`${ZONE_COLORS.sunset} ${sunsetStart}%`);
    segments.push(`${ZONE_COLORS.sunset} ${sunsetEnd}%`);
    segments.push(`${ZONE_COLORS.stargazing} ${sunsetEnd}%`);

    if (duskPct > sunsetEnd) {
      segments.push(`${ZONE_COLORS.stargazing} ${duskPct}%`);
    }
    segments.push(`${ZONE_COLORS.stargazing} 100%`);

    return `linear-gradient(to right, ${segments.join(', ')})`;
  }, [railPcts]);

  const resolvePositionToKey = useCallback(
    (clientX: number) => {
      if (!railRef.current || hourKeys.length === 0) return;
      const rect = railRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const pct = x / rect.width;
      const idx = Math.round(pct * max);
      // The far-left position is the live "Now" state ('' key), matching the
      // Now dot at 0%. This keeps the scrubber forward-looking — it can never
      // land on the rounded current-hour slot, which already reads as past.
      const key = idx <= 0 ? '' : hourKeys[Math.min(idx, max)];
      if (key !== undefined) onHourChange(key);
    },
    [hourKeys, max, onHourChange],
  );

  // Tracks whether a drag actually moved, so a press that *starts* on a
  // marker but turns into a drag doesn't also fire the marker's
  // tap-to-jump on release.
  const movedDuringDragRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const fromButton = !!(e.target as HTMLElement).closest?.('button');
      movedDuringDragRef.current = false;
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      if (!fromButton) {
        setSnappedEvent(null);
        resolvePositionToKey(e.clientX);
      }
    },
    [resolvePositionToKey],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      movedDuringDragRef.current = true;
      setSnappedEvent(null);
      resolvePositionToKey(e.clientX);
    },
    [dragging, resolvePositionToKey],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
    setPulseKey((k) => k + 1);
  }, []);

  // Haptic feedback on hour change.
  const lastKeyRef = useRef(hourKey);
  useEffect(() => {
    if (hourKey !== lastKeyRef.current) {
      lastKeyRef.current = hourKey;
      if (dragging) navigator.vibrate?.(8);
    }
  }, [hourKey, dragging]);

  const sunriseKey = useMemo(
    () => nearestHourKeyForTime(eventTimes.sunrise, hourKeys),
    [eventTimes.sunrise, hourKeys],
  );
  const sunsetKey = useMemo(
    () => nearestHourKeyForTime(eventTimes.sunset, hourKeys),
    [eventTimes.sunset, hourKeys],
  );

  const clampPct = (pct: number) => Math.max(3, Math.min(97, pct));

  return (
    <div
      className="flex flex-col gap-1.5"
      role="group"
      aria-label="Timeline scrubber"
    >
      {/* Active label row */}
      <div className="flex items-center justify-between px-0.5">
        <span className="font-serif text-[18px] leading-tight text-gray-800">
          {VIEW_MODE_LABELS[viewMode]}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-[#9a9488]">
          {snappedEvent
            ? formatEventScrubTime(snappedEvent.time)
            : hourKey === ''
              ? `Now · ${nearestHourLabel(new Date())}`
              : formatScrubTime(hourKey)}
        </span>
      </div>

      {/* Zoned rail */}
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
        aria-label="Timeline position"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' && currentIndex < max) {
            setSnappedEvent(null);
            onHourChange(hourKeys[currentIndex + 1]);
          } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
            setSnappedEvent(null);
            onHourChange(hourKeys[currentIndex - 1]);
          } else if (e.key === 'Home') {
            setSnappedEvent(null);
            onHourChange('');
          }
        }}
      >
        {/* Rail track */}
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[6px] rounded-full"
          style={{ background: zoneGradient }}
          aria-hidden="true"
        />

        {/* Now dot (left edge) */}
        <button
          type="button"
          onClick={() => {
            if (movedDuringDragRef.current) return;
            setSnappedEvent(null);
            onHourChange('');
          }}
          className="absolute top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full bg-[#1a1a18] z-10 hover:scale-150 transition-transform"
          style={{ left: '0%' }}
          aria-label="Jump to now"
        />

        {/* Sunrise marker */}
        {railPcts.sunrisePct > 0 && railPcts.sunrisePct < 100 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (movedDuringDragRef.current) return;
              setSnappedEvent({ type: 'sunrise', time: eventTimes.sunrise });
              if (sunriseKey) onHourChange(sunriseKey);
            }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-6 h-6 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
            style={{
              left: `${railPcts.sunrisePct}%`,
              backgroundColor: '#D946A8',
              border: '2px solid #FAF9F6',
            }}
            aria-label={`Jump to sunrise at ${formatTimeLabel(eventTimes.sunrise)}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 18a5 5 0 0 0-10 0" />
              <line x1="12" y1="9" x2="12" y2="2" />
              <polyline points="8 6 12 2 16 6" />
            </svg>
          </button>
        )}

        {/* Sunset marker */}
        {railPcts.sunsetPct > 0 && railPcts.sunsetPct < 100 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (movedDuringDragRef.current) return;
              setSnappedEvent({ type: 'sunset', time: eventTimes.sunset });
              if (sunsetKey) onHourChange(sunsetKey);
            }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-6 h-6 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
            style={{
              left: `${railPcts.sunsetPct}%`,
              backgroundColor: '#CC2936',
              border: '2px solid #FAF9F6',
            }}
            aria-label={`Jump to sunset at ${formatTimeLabel(eventTimes.sunset)}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 18a5 5 0 0 0-10 0" />
              <line x1="12" y1="2" x2="12" y2="9" />
              <polyline points="16 6 12 10 8 6" />
            </svg>
          </button>
        )}

        {/* Thumb */}
        {hourKeys.length > 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-[#1a1a18] pointer-events-none z-20"
            style={{
              left: `${thumbPct}%`,
              border: '2.5px solid #FAF9F6',
            }}
          >
            <span
              key={pulseKey}
              aria-hidden="true"
              className="block absolute inset-0 rounded-full border border-[#1a1a18]/40 weather-thumb-pulse"
            />
          </div>
        )}
      </div>

      {/* Time labels below rail */}
      <div className="relative h-3 text-[9px] font-mono text-[#9a9488]">
        {railPcts.sunrisePct > 2 && railPcts.sunrisePct < 98 && (
          <span
            className="absolute -translate-x-1/2"
            style={{ left: `${clampPct(railPcts.sunrisePct)}%` }}
          >
            {formatTimeLabel(eventTimes.sunrise)}
          </span>
        )}
        {railPcts.sunsetPct > 2 && railPcts.sunsetPct < 98 && (
          <span
            className="absolute -translate-x-1/2"
            style={{ left: `${clampPct(railPcts.sunsetPct)}%` }}
          >
            {formatTimeLabel(eventTimes.sunset)}
          </span>
        )}
      </div>
    </div>
  );
}
