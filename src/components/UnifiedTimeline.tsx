import { useCallback, useMemo, useRef, useState } from 'react';
import type { ViewMode } from '../utils/scoring';
import type { UpcomingEvents } from '../utils/events';
import {
  formatCanonicalHourLabel,
  formatCityCalendarDate,
  formatInstantTimeLabel,
  parseCanonicalHourKey,
  isRepeatedLocalHourInstant,
  buildTimelineStops,
  timelinePositionPct,
  nearestTimelineStopIndex,
} from '../utils/timeline';

interface UnifiedTimelineProps {
  hourKeys: string[];
  hourKey: string;
  onHourChange: (key: string) => void;
  viewMode: ViewMode;
  eventTimes: UpcomingEvents;
  timeZone: string;
  loading?: boolean;
  now: Date;
  selectedView: ViewMode;
  selectedEventTime?: Date;
  onViewChange: (view: ViewMode) => void;
}

const ZONE_COLORS: Record<ViewMode, string> = {
  stargazing: '#6660A8',
  sunrise: '#F7A5BF',
  now: '#9EDDF8',
  sunset: '#FFB68F',
};

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  stargazing: 'Nighttime',
  sunrise: 'Sunrise',
  now: 'Daytime',
  sunset: 'Sunset',
};

function formatSelectedTime(hourKey: string, timeZone: string, now: Date): string {
  if (!hourKey) return `Today · ${formatInstantTimeLabel(now, timeZone, isRepeatedLocalHourInstant(now, timeZone))}`;
  const instant = parseCanonicalHourKey(hourKey);
  if (!instant) return 'Forecast hour unavailable';
  const todayKey = formatCityCalendarDate(now, timeZone);
  const selectedDate = formatCityCalendarDate(instant, timeZone);
  const dayLabel = selectedDate === todayKey
    ? 'Today'
    : new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(instant);
  const includeZone = isRepeatedLocalHourInstant(instant, timeZone);
  return `${dayLabel} · ${formatCanonicalHourLabel(hourKey, timeZone, { includeZone })}`;
}

function formatEventTime(instant: Date, timeZone: string, now: Date): string {
  const day = formatCityCalendarDate(instant, timeZone) === formatCityCalendarDate(now, timeZone)
    ? 'Today' : new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(instant);
  return `${day} · ${formatInstantTimeLabel(instant, timeZone)}`;
}

export default function UnifiedTimeline({
  hourKeys,
  hourKey,
  onHourChange,
  viewMode,
  eventTimes,
  timeZone,
  loading = false,
  now,
  selectedView,
  selectedEventTime,
  onViewChange,
}: UnifiedTimelineProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [pulseKey, setPulseKey] = useState(0);
  const disabled = hourKeys.length === 0;
  const stops = useMemo(() => buildTimelineStops(hourKeys, now, eventTimes), [hourKeys, now, eventTimes]);
  const max = stops.length - 1;
  const selectionUnavailable = !selectedEventTime && hourKey !== '' && !hourKeys.includes(hourKey);
  const selectedInstant = selectedEventTime?.getTime() ?? (parseCanonicalHourKey(hourKey)?.getTime() ?? now.getTime());
  const currentIndex = Math.max(0, stops.findIndex((stop) => selectedEventTime
    ? stop.view === selectedView : stop.view === 'now' && stop.hourKey === hourKey));
  const thumbPct = timelinePositionPct(selectedInstant, stops);
  const labelView = selectedView === 'now' ? viewMode : selectedView;
  const selectedTimeLabel = selectedEventTime
    ? formatEventTime(selectedEventTime, timeZone, now)
    : formatSelectedTime(hourKey, timeZone, now);

  const markers = (['sunrise', 'sunset', 'stargazing'] as const).map((view) => ({
    view, percent: timelinePositionPct(eventTimes[view].getTime(), stops),
  }));
  const solarMarkers = markers.filter((marker) => marker.view !== 'stargazing').sort((a, b) => a.percent - b.percent);
  const initialColor = solarMarkers[0]?.view === 'sunrise' ? ZONE_COLORS.stargazing : ZONE_COLORS.now;
  const gradientStops = [`${initialColor} 0%`];
  let finalColor = initialColor;
  for (const [index, marker] of solarMarkers.entries()) {
    const nextPercent = solarMarkers[index + 1]?.percent ?? 100;
    const nightMarker = markers.find((candidate) => candidate.view === 'stargazing');
    const phasePercent = marker.view === 'sunset' && nightMarker
      && nightMarker.percent > marker.percent && nightMarker.percent < nextPercent
      ? nightMarker.percent : (marker.percent + nextPercent) / 2;
    gradientStops.push(`${ZONE_COLORS[marker.view]} ${marker.percent}%`);
    finalColor = marker.view === 'sunrise' ? ZONE_COLORS.now : ZONE_COLORS.stargazing;
    gradientStops.push(`${finalColor} ${phasePercent}%`);
  }
  gradientStops.push(`${finalColor} 100%`);
  const zoneGradient = `linear-gradient(to right, ${gradientStops.join(', ')})`;

  const selectStop = useCallback((index: number) => {
    const stop = stops[Math.max(0, Math.min(max, index))];
    if (stop.view === 'now') onHourChange(stop.hourKey);
    else onViewChange(stop.view);
  }, [stops, max, onHourChange, onViewChange]);

  const resolvePosition = useCallback((clientX: number) => {
    const rail = railRef.current;
    if (!rail || disabled) return;
    const rect = rail.getBoundingClientRect();
    selectStop(nearestTimelineStopIndex((clientX - rect.left) / Math.max(rect.width, 1) * 100, stops));
  }, [disabled, selectStop, stops]);

  const valueText = `${VIEW_MODE_LABELS[labelView]}, ${selectedTimeLabel}`;

  return (
    <div
      className="flex flex-col gap-1"
      role="group"
      aria-label="Timeline scrubber"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <div className="flex min-h-11 items-center justify-between gap-2 px-0.5">
        <span className="font-mono text-[13px] font-medium leading-tight text-[#173D43]">
          {VIEW_MODE_LABELS[labelView]}
        </span>
        <span className="ml-auto font-mono text-[14px] font-medium tabular-nums text-[#173D43]" aria-live="polite" data-selected-time>
          {selectedTimeLabel}
        </span>
      </div>

      <div
        ref={railRef}
        className={`relative h-14 touch-none select-none rounded-lg ${disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}
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
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextIndex = Math.floor(currentIndex) + 1;
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextIndex = Math.ceil(currentIndex) - 1;
          else if (event.key === 'Home') nextIndex = stops.findIndex((stop) => stop.view === 'now' && !stop.hourKey);
          else if (event.key === 'End') nextIndex = max;
          else return;
          event.preventDefault();
          selectStop(nextIndex);
        }}
      >
        {(disabled || selectionUnavailable) && (
          <p className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-white/95 px-2 text-center font-mono text-[10px] text-gray-500" role="status">
            {selectionUnavailable ? 'That hour is unavailable. Choose another hour or the current time.' : loading ? 'Loading forecast hours…' : 'Hourly forecast unavailable'}
          </p>
        )}
        <div className="absolute inset-x-0 top-[18px] -translate-y-1/2 h-[10px] rounded-full" style={{ background: zoneGradient }} aria-hidden="true" />
        <span data-timeline-now className="absolute top-[18px] -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#1a1a18]" style={{ left: `${timelinePositionPct(now.getTime(), stops)}%` }} title="Current time" aria-hidden="true" />
        {markers.map((marker) => (
          <span key={marker.view} data-timeline-event={marker.view} className="absolute top-[18px] -translate-y-1/2 -translate-x-1/2 w-[5px] h-3 rounded-full border border-white" style={{ left: `${marker.percent}%`, backgroundColor: marker.view === 'sunrise' ? '#C44373' : marker.view === 'sunset' ? '#B55230' : '#354261' }} aria-hidden="true" />
        ))}
        {stops.filter((stop) => stop.view === 'now' && stop.hourKey).map((stop) => {
          const percent = timelinePositionPct(stop.instantMs, stops);
          const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date(stop.instantMs)));
          const label = hour % 6 === 0 && percent >= 4 && percent <= 96;
          return <span key={stop.hourKey} aria-hidden="true" className="absolute top-[30px] -translate-x-1/2" style={{ left: `${percent}%` }}>
            <span className={`mx-auto block w-px bg-gray-400/70 ${label ? 'h-2' : 'h-1'}`} />
            {label && <span className="mt-1 block whitespace-nowrap font-mono text-[11px] text-gray-600">{new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone }).format(new Date(stop.instantMs))}</span>}
          </span>;
        })}
        {!disabled && (
          <span data-timeline-thumb className="absolute top-[18px] -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white pointer-events-none z-20 border-[3px] border-[#155561] shadow-sm" style={{ left: `${thumbPct}%` }} aria-hidden="true">
            <span key={pulseKey} className="block absolute inset-0 rounded-full border border-[#155561]/30 weather-thumb-pulse" />
          </span>
        )}
      </div>

    </div>
  );
}
