import { useCallback, useMemo, useRef, useState } from 'react';
import type { ViewMode } from '../utils/scoring';
import type { UpcomingEvents } from '../utils/events';
import { NowIcon, SunriseIcon, SunsetIcon, StargazingIcon } from './icons/ScrubberIcons';
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
  hasSelectedSpot?: boolean;
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

function formatSelectedTime(hourKey: string, timeZone: string, now: Date): string {
  if (!hourKey) return `Now · ${formatInstantTimeLabel(now, timeZone)}`;
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

const SKY_VIEWS = ['now', 'sunrise', 'sunset', 'stargazing'] as const;
const VIEW_ICONS = { now: NowIcon, sunrise: SunriseIcon, sunset: SunsetIcon, stargazing: StargazingIcon };

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
  hasSelectedSpot = false,
}: UnifiedTimelineProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [pulseKey, setPulseKey] = useState(0);
  const viewButtons = useRef<Partial<Record<ViewMode, HTMLButtonElement | null>>>({});
  const disabled = hourKeys.length === 0;
  const stops = useMemo(() => buildTimelineStops(hourKeys, now, eventTimes), [hourKeys, now, eventTimes]);
  const max = stops.length - 1;
  const selectionUnavailable = !selectedEventTime && hourKey !== '' && !hourKeys.includes(hourKey);
  const selectedInstant = selectedEventTime?.getTime() ?? (parseCanonicalHourKey(hourKey)?.getTime() ?? now.getTime());
  const currentIndex = Math.max(0, stops.findIndex((stop) => selectedEventTime
    ? stop.view === selectedView : stop.view === 'now' && stop.hourKey === hourKey));
  const thumbPct = timelinePositionPct(selectedInstant, stops);
  const labelView = selectedView === 'now' ? (hourKey ? viewMode : 'now') : selectedView;
  const selectedTimeLabel = selectedEventTime
    ? formatEventTime(selectedEventTime, timeZone, now)
    : formatSelectedTime(hourKey, timeZone, now);

  const markers = (['sunrise', 'sunset', 'stargazing'] as const).map((view) => ({
    view, percent: timelinePositionPct(eventTimes[view].getTime(), stops),
  }));
  const solarMarkers = markers.filter((marker) => marker.view !== 'stargazing').sort((a, b) => a.percent - b.percent);
  let color = solarMarkers[0]?.view === 'sunrise' ? ZONE_COLORS.stargazing : ZONE_COLORS.now;
  const gradientStops = [`${color} 0%`];
  for (const marker of solarMarkers) {
    const start = Math.max(0, marker.percent - 3);
    const end = Math.min(100, marker.percent + 3);
    gradientStops.push(`${color} ${start}%`, `${ZONE_COLORS[marker.view]} ${start}%`, `${ZONE_COLORS[marker.view]} ${end}%`);
    color = marker.view === 'sunrise' ? ZONE_COLORS.now : ZONE_COLORS.stargazing;
    gradientStops.push(`${color} ${end}%`);
  }
  gradientStops.push(`${color} 100%`);
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
      className="flex flex-col gap-1.5"
      role="group"
      aria-label="Timeline scrubber"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between px-0.5">
        <span className="font-serif text-[18px] leading-tight text-gray-800">
          {VIEW_MODE_LABELS[labelView]}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-gray-500" aria-live="polite">
          {selectedTimeLabel}
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
          <p className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-[#FAF9F6]/95 px-2 text-center font-mono text-[10px] text-gray-500" role="status">
            {selectionUnavailable ? 'That hour is unavailable. Choose another hour or Now.' : loading ? 'Loading forecast hours…' : 'Hourly forecast unavailable'}
          </p>
        )}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[6px] rounded-full" style={{ background: zoneGradient }} aria-hidden="true" />
        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#1a1a18]" style={{ left: `${timelinePositionPct(now.getTime(), stops)}%` }} aria-hidden="true" />
        {markers.map((marker) => (
          <span key={marker.view} data-timeline-event={marker.view} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-[#FAF9F6]" style={{ left: `${marker.percent}%`, backgroundColor: marker.view === 'sunrise' ? '#D946A8' : marker.view === 'sunset' ? '#CC2936' : '#2c2c4a' }} aria-hidden="true" />
        ))}
        {!disabled && (
          <span data-timeline-thumb className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-[#1a1a18] pointer-events-none z-20 border-[2.5px] border-[#FAF9F6]" style={{ left: `${thumbPct}%` }} aria-hidden="true">
            <span key={pulseKey} className="block absolute inset-0 rounded-full border border-[#1a1a18]/40 weather-thumb-pulse" />
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1" role={hasSelectedSpot ? 'tablist' : 'group'} aria-label="Sky views">
        {SKY_VIEWS.map((view) => {
          const Icon = VIEW_ICONS[view];
          const selected = view === selectedView;
          return (
            <button
              key={view}
              ref={(element) => { viewButtons.current[view] = element; }}
              id={`score-card-tab-${view}`}
              type="button"
              role={hasSelectedSpot ? 'tab' : undefined}
              aria-selected={hasSelectedSpot ? selected : undefined}
              aria-pressed={hasSelectedSpot ? undefined : selected}
              aria-controls={hasSelectedSpot ? `score-card-panel-${view}` : undefined}
              aria-label={hasSelectedSpot ? `Show ${VIEW_MODE_LABELS[view]} card` : VIEW_MODE_LABELS[view]}
              title={VIEW_MODE_LABELS[view]}
              tabIndex={hasSelectedSpot && !selected ? -1 : 0}
              className={`min-h-11 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gray-700 ${selected ? 'bg-gray-800/8 text-gray-900' : 'text-gray-500 hover:bg-gray-800/5'}`}
              onClick={() => onViewChange(view)}
              onKeyDown={(event) => {
                const index = SKY_VIEWS.indexOf(view);
                let nextIndex = index;
                if (event.key === 'ArrowRight') nextIndex = (index + 1) % SKY_VIEWS.length;
                else if (event.key === 'ArrowLeft') nextIndex = (index + SKY_VIEWS.length - 1) % SKY_VIEWS.length;
                else if (event.key === 'Home') nextIndex = 0;
                else if (event.key === 'End') nextIndex = SKY_VIEWS.length - 1;
                else return;
                event.preventDefault();
                const next = SKY_VIEWS[nextIndex];
                onViewChange(next);
                viewButtons.current[next]?.focus();
              }}
            >
              <Icon size={24} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
