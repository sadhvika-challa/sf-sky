import { useMemo, useRef, useState } from 'react';
import type { ViewMode } from '../utils/scoring';
import type { UpcomingEvents } from '../utils/events';
import SelectMenu from './SelectMenu';
import { skyQualityLabel, type SunsetOpportunity, type PlanningDay } from '../utils/skyExperience';
import {
  cityCalendarParts,
  timelineScoreLabel,
  formatCanonicalHourLabel,
  formatCanonicalHourKey,
  formatCityCalendarDate,
  formatInstantTimeLabel,
  parseCanonicalHourKey,
  isRepeatedLocalHourInstant,
  buildTimelineStops,
  buildForecastRangeHourKeys,
  forecastRangeWindow,
  timelinePositionPct,
  nearestTimelineStopIndex,
  type ForecastRange,
} from '../utils/timeline';

interface UnifiedTimelineProps {
  sunsetOpportunity?: SunsetOpportunity;
  sunsetPlanningFresh?: boolean;
  onBrowseSunset?: () => void;
  sunsetBrowseOpen?: boolean;
  loadingSpotCount?: number;
  planningDays?: PlanningDay[];
  planningScope?: string;
  planningFresh?: boolean;
  hourKeys: string[];
  hourKey: string;
  onHourChange: (key: string) => void;
  viewMode: ViewMode;
  eventTimes: readonly UpcomingEvents[];
  range: ForecastRange;
  timeZone: string;
  loading?: boolean;
  edgeToEdge?: boolean;
  weeklyView: 'week' | 'day';
  onWeeklyViewChange: (view: 'week' | 'day') => void;
  now: Date;
  selectedView: ViewMode;
  selectedEventTime?: Date;
  onViewChange: (view: ViewMode, instant?: Date) => void;
}

const ZONE_COLORS: Record<ViewMode, string> = {
  stargazing: '#6660A8',
  sunrise: '#F7A5BF',
  now: '#9EDDF8',
  sunset: '#FFB68F',
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
  range,
  timeZone,
  loading = false,
  edgeToEdge = false,
  weeklyView,
  onWeeklyViewChange,
  now,
  selectedView,
  selectedEventTime,
  onViewChange,
  planningDays,
  planningScope,
  planningFresh = false,
  loadingSpotCount = 0,
  sunsetOpportunity,
  sunsetPlanningFresh = true,
  onBrowseSunset,
  sunsetBrowseOpen = false,
}: UnifiedTimelineProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [pulseKey, setPulseKey] = useState(0);
  const disabled = hourKeys.length === 0;
  const selectedInstant = selectedEventTime?.getTime() ?? (parseCanonicalHourKey(hourKey)?.getTime() ?? now.getTime());
  const selectedDate = formatCityCalendarDate(new Date(selectedInstant), timeZone);
  const rangeHours = useMemo(() => buildForecastRangeHourKeys(now, range, timeZone), [now, range, timeZone]);
  const days = useMemo(() => [...new Map(rangeHours.map((key) => [formatCityCalendarDate(new Date(key), timeZone), key])).entries()]
    .map(([date, key]) => ({ date, instant: new Date(key) })), [rangeHours, timeZone]);
  const dayHours = range === '7d'
    ? rangeHours.filter((key) => formatCityCalendarDate(new Date(key), timeZone) === selectedDate)
    : rangeHours;
  const stops = buildTimelineStops(
    hourKeys.length > 0 ? dayHours : [],
    range === '7d' && dayHours[0] ? new Date(dayHours[0]) : forecastRangeWindow(now, range, timeZone).start,
    eventTimes, range === '24h',
  );
  if (selectedView === 'now' && selectedEventTime && !stops.some(stop => stop.instantMs === selectedInstant)) {
    stops.push({ view: 'now', instantMs: selectedInstant, hourKey: formatCanonicalHourKey(selectedEventTime) });
    stops.sort((a, b) => a.instantMs - b.instantMs);
  }
  const max = stops.length - 1;
  const selectionUnavailable = hourKey !== '' && !hourKeys.includes(hourKey);
  const exactIndex = stops.findIndex((stop) => selectedEventTime
    ? stop.view === selectedView && stop.instantMs === selectedInstant : stop.view === 'now' && stop.hourKey === hourKey);
  const currentIndex = exactIndex >= 0 ? exactIndex : nearestTimelineStopIndex(timelinePositionPct(selectedInstant, stops), stops);
  const thumbPct = timelinePositionPct(selectedInstant, stops);
  const weekOverview = range === '7d' && weeklyView === 'week';
  const selectedTimeLabel = range === '7d'
    ? `${new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone }).format(new Date(selectedInstant))} · ${formatInstantTimeLabel(new Date(selectedInstant), timeZone)}`
    : selectedEventTime
      ? formatEventTime(selectedEventTime, timeZone, now)
      : formatSelectedTime(hourKey, timeZone, now);

  const markers = stops.filter((stop) => stop.view !== 'now').map((stop) => ({
    view: stop.view, instantMs: stop.instantMs, percent: timelinePositionPct(stop.instantMs, stops),
  }));
  const solarMarkers = markers.filter((marker) => marker.view !== 'stargazing').sort((a, b) => a.percent - b.percent);
  const initialColor = solarMarkers[0]?.view === 'sunrise' ? ZONE_COLORS.stargazing : ZONE_COLORS.now;
  const gradientStops = [`${initialColor} 0%`];
  let finalColor = initialColor;
  for (const [index, marker] of solarMarkers.entries()) {
    const nextPercent = solarMarkers[index + 1]?.percent ?? 100;
    const nightMarker = markers.find((candidate) => candidate.view === 'stargazing' && candidate.percent > marker.percent);
    const phasePercent = marker.view === 'sunset' && nightMarker
      && nightMarker.percent > marker.percent && nightMarker.percent < nextPercent
      ? nightMarker.percent : (marker.percent + nextPercent) / 2;
    gradientStops.push(`${ZONE_COLORS[marker.view]} ${marker.percent}%`);
    finalColor = marker.view === 'sunrise' ? ZONE_COLORS.now : ZONE_COLORS.stargazing;
    gradientStops.push(`${finalColor} ${phasePercent}%`);
  }
  gradientStops.push(`${finalColor} 100%`);
  const zoneGradient = range === '7d'
    ? 'linear-gradient(to right, #938DFF 0%, #9BC4F5 35%, #F4B49D 65%, #A698F9 100%)'
    : `linear-gradient(to right, ${gradientStops.join(', ')})`;

  const selectStop = (index: number) => {
    const stop = stops[Math.max(0, Math.min(max, index))];
    if (stop.view === 'now' && stop.hourKey && stop.instantMs !== Date.parse(stop.hourKey)) onViewChange('now', new Date(stop.instantMs));
    else if (stop.view === 'now') onHourChange(stop.hourKey);
    else onViewChange(stop.view, new Date(stop.instantMs));
  };

  const resolvePosition = (clientX: number) => {
    const rail = railRef.current;
    if (!rail || disabled) return;
    const rect = rail.getBoundingClientRect();
    selectStop(nearestTimelineStopIndex((clientX - rect.left) / Math.max(rect.width, 1) * 100, stops));
  };

  const viewLabel = timelineScoreLabel(viewMode, selectedView);
  const selectedDayEvents = eventTimes.find((day) => formatCityCalendarDate(day.sunrise, timeZone) === selectedDate);
  const selectedPlanning = planningDays?.find(day => day.date === selectedDate);
  const hourlyLabel = selectedDayEvents
    ? selectedInstant >= selectedDayEvents.sunrise.getTime() && selectedInstant < selectedDayEvents.sunset.getTime() ? 'Daytime' : 'Nighttime'
    : viewMode === 'stargazing' ? 'Nighttime' : 'Daytime';
  const selectDay = (date: string) => {
    onWeeklyViewChange('day');
    const events = eventTimes.find((day) => formatCityCalendarDate(day.sunrise, timeZone) === date);
    if (selectedView !== 'now' && events) {
      onViewChange(selectedView, events[selectedView]);
      return;
    }
    const best = planningDays?.find(day => day.date === date)?.window;
    if (weekOverview && best) {
      onHourChange(`${new Date(best.start).toISOString().slice(0, 13)}:00:00Z`);
      return;
    }
    const hour = cityCalendarParts(new Date(selectedInstant), timeZone).hour;
    const key = rangeHours.find((key) => formatCityCalendarDate(new Date(key), timeZone) === date
      && cityCalendarParts(new Date(key), timeZone).hour === hour);
    if (key) onHourChange(key);
  };
  const valueText = `${viewLabel}, ${selectedTimeLabel}`;

  return (
    <div
      className={`flex flex-col gap-1 ${range === '7d' && edgeToEdge ? '-mx-5' : ''}`}
      role="group"
      aria-label="Timeline scrubber"
      data-forecast-range={range}
      data-timeline-level={range === '7d' ? weeklyView : '24h'}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {range === '7d' && !weekOverview && <div data-day-navigation className="flex min-h-11 items-center justify-between gap-2 px-5">
        <button type="button" aria-label="All 7 days" onClick={() => onWeeklyViewChange('week')}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg font-mono text-[12px] text-gray-600 focus-visible:outline-2 focus-visible:outline-[#155561]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          All 7 days
        </button>
        <span className="font-mono text-[12px] text-gray-600">{new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone }).format(new Date(selectedInstant))}</span>
      </div>}
      <div data-time-caption className={`flex min-h-11 items-center justify-between gap-2 ${range === '7d' ? 'px-5' : ''}`}>
        <span className="flex flex-col items-start">
        {weekOverview ? <SelectMenu<ViewMode> label="Sky view" plain value={selectedView}
          options={[{ value: 'now', label: hourlyLabel }, { value: 'sunrise', label: 'Sunrise' }, { value: 'sunset', label: 'Sunset' }, { value: 'stargazing', label: 'Stargazing' }]}
          onChange={(view) => onViewChange(view, view !== 'now' ? selectedDayEvents?.[view] : undefined)} /> : <span className="font-mono text-[13px] font-medium text-[#173D43]" data-score-condition>{viewLabel}</span>}
        {loadingSpotCount > 0 && <span role="status" data-spot-forecast-progress className="font-mono text-[10px] text-gray-500">
          Loading {loadingSpotCount} {loadingSpotCount === 1 ? 'spot' : 'spots'}
        </span>}
        </span>
        <span className="ml-auto font-mono text-[14px] font-medium tabular-nums text-[#173D43]" aria-live="polite" data-selected-time data-selected-instant={new Date(selectedInstant).toISOString()}>
          {range === '7d' && !weekOverview ? formatInstantTimeLabel(new Date(selectedInstant), timeZone) : selectedTimeLabel}
        </span>
      </div>

      {!weekOverview && <div
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
          else if (event.key === 'PageUp' || event.key === 'PageDown') {
            const target = selectedInstant + (event.key === 'PageUp' ? 1 : -1) * 24 * 3_600_000;
            nextIndex = nearestTimelineStopIndex(timelinePositionPct(target, stops), stops);
          }
          else if (event.key === 'Home') nextIndex = range === '24h'
            ? Math.max(0, stops.findIndex((stop) => stop.view === 'now' && stop.hourKey === '')) : 0;
          else if (event.key === 'End') nextIndex = max;
          else return;
          event.preventDefault();
          selectStop(nextIndex);
        }}
      >
        {(disabled || selectionUnavailable) && (
          <p className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-white/95 px-2 text-center font-mono text-[10px] text-gray-500" role="status">
            {loading ? 'Loading forecast hours…' : selectionUnavailable ? range === '7d' ? 'That hour is unavailable. Choose another hour.' : 'That hour is unavailable. Choose another hour or Now.' : 'Hourly forecast unavailable'}
          </p>
        )}
        <div className={`absolute inset-x-0 top-[18px] -translate-y-1/2 rounded-full ${range === '7d' ? 'h-[5px]' : 'h-[10px]'}`} style={{ background: zoneGradient }} aria-hidden="true" />
        {sunsetOpportunity && sunsetOpportunity.window.score !== null && sunsetOpportunity.window.score >= 60 && <span
          data-viewing-window aria-hidden="true" className="pointer-events-none absolute top-[18px] h-3 -translate-y-1/2 rounded-full border-2 border-[#387B6A] bg-[#C2E4D9]/70"
          style={{ left: `${timelinePositionPct(sunsetOpportunity.start, stops)}%`, width: `${Math.max(0, timelinePositionPct(sunsetOpportunity.end, stops) - timelinePositionPct(sunsetOpportunity.start, stops))}%` }} />}
        {range === '24h' && <span data-timeline-now className="absolute top-[18px] -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#1a1a18]" style={{ left: `${timelinePositionPct(now.getTime(), stops)}%` }} title="Current time" aria-hidden="true" />}
        {markers.map((marker) => (
          <span key={`${marker.view}:${marker.instantMs}`} data-timeline-event={marker.view} data-event-instant={new Date(marker.instantMs).toISOString()} className={`absolute -translate-y-1/2 -translate-x-1/2 rounded-full ${range === '7d' ? 'top-[7px] w-1 h-1' : 'top-[18px] w-[5px] h-3 border border-white'}`} style={{ left: `clamp(12px, ${marker.percent}%, calc(100% - 12px))`, backgroundColor: range === '7d'
              ? marker.view === 'sunset' ? '#F6A36E' : '#A49AFE'
              : marker.view === 'sunrise' ? '#C44373' : marker.view === 'sunset' ? '#B55230' : '#354261' }} aria-hidden="true" />
        ))}
        {stops.filter((stop) => stop.view === 'now' && stop.hourKey && stop.instantMs % 3_600_000 === 0).map((stop) => {
          const percent = timelinePositionPct(stop.instantMs, stops);
          const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date(stop.instantMs)));
          const label = range === '7d'
            ? hour % 6 === 0 || stop.hourKey === dayHours.at(-1)
            : hour % 6 === 0 && percent >= 4 && percent <= 96;
          return <span key={stop.hourKey} aria-hidden="true" className="absolute top-[30px]" style={{ left: `${percent}%`, transform: percent === 0 ? 'none' : percent === 100 ? 'translateX(-100%)' : 'translateX(-50%)' }}>
            <span className={`block w-px bg-gray-400/70 ${percent === 0 ? '' : percent === 100 ? 'ml-auto' : 'mx-auto'} ${label ? 'h-2' : 'h-1'}`} />
            {label && <span className="mt-1 block whitespace-nowrap font-mono text-[11px] text-gray-600">
              {new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone }).format(new Date(stop.instantMs))}
            </span>}
          </span>;
        })}
        {!disabled && (
          <span data-timeline-thumb className="absolute top-[18px] -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white pointer-events-none z-20 border-[3px] border-[#155561] shadow-sm" style={{ left: `clamp(12px, ${thumbPct}%, calc(100% - 12px))` }} aria-hidden="true">
            <span key={pulseKey} className="block absolute inset-0 rounded-full border border-[#155561]/30 weather-thumb-pulse" />
          </span>
        )}
      </div>}
      {!weekOverview && (onBrowseSunset || sunsetOpportunity) && <div className="flex items-center justify-between gap-3 font-mono text-[11px] text-[#173D43]" data-sunset-actions>
        {onBrowseSunset && <button type="button" onClick={onBrowseSunset} aria-expanded={sunsetBrowseOpen}
          className="min-h-11 rounded-lg px-2 font-semibold focus-visible:outline-2 focus-visible:outline-[#155561]">Sunset spots</button>}
        {sunsetOpportunity && <button type="button" onClick={() => onViewChange('now', new Date(sunsetOpportunity.peakAt))}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 text-left focus-visible:outline-2 focus-visible:outline-[#155561]"
          data-best-sunset-time>
          <span>{!sunsetPlanningFresh ? 'Saved sunset period' : sunsetOpportunity.window.score !== null && sunsetOpportunity.window.score >= 60 ? 'Best sunset period' : 'Strongest sunset forecast'}</span>
          <span>Around {formatInstantTimeLabel(new Date(sunsetOpportunity.peakAt), timeZone)} →</span>
        </button>}
      </div>}
      {weekOverview && <div role="group" aria-label="Forecast day" className="mt-2 grid grid-cols-7 gap-1 px-1">
        {days.map(({ date, instant }) => <button key={date} type="button" aria-pressed={date === selectedDate}
          aria-label={new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone }).format(instant)}
          onClick={() => selectDay(date)}
          className={`flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl font-mono focus-visible:outline-2 focus-visible:outline-[#155561] ${date === selectedDate ? 'bg-[#DEF1E8] font-semibold text-[#173D43]' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
          <span className="text-[11px]">{new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(instant)}</span>
          <span className="text-[15px]">{new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone }).format(instant)}</span>
          {planningDays && <span className="text-[8px] leading-3" title={skyQualityLabel(planningDays.find(day => day.date === date)?.window?.score ?? null)}>
            {skyQualityLabel(planningDays.find(day => day.date === date)?.window?.score ?? null)}
          </span>}
        </button>)}
      </div>}
      {weekOverview && planningDays && <div data-weekly-outlook className="mx-1 mt-2 rounded-xl bg-[#F4F7F8] px-3 py-2 font-mono text-xs text-[#173D43]">
        <div className="flex items-center justify-between gap-3">
          <span>{planningScope} · {planningFresh ? 'Best sky outlook' : planningDays.length ? 'Saved sky outlook' : 'Outlook unavailable'}</span>
          <span>{selectedPlanning?.window ? `${skyQualityLabel(selectedPlanning.window.score)} · ${selectedPlanning.period}` : 'Forecast unavailable'}</span>
        </div>
        {selectedPlanning?.window && <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 text-left focus-visible:outline-2 focus-visible:outline-[#155561]"
          onClick={() => {
            onWeeklyViewChange('day');
            onHourChange(`${new Date(selectedPlanning.window!.start).toISOString().slice(0, 13)}:00:00Z`);
          }}>
          <span>{selectedPlanning.window.label}</span><span>View {selectedPlanning.period.toLowerCase()} →</span>
        </button>}
        {selectedPlanning?.window && <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-600">
          <span>Timing may shift</span>
          <span>{selectedPlanning.window.cloudAgreement?.agreement === 'agree' ? 'Cloud forecasts agree' : selectedPlanning.window.cloudAgreement?.agreement === 'mixed' ? 'Cloud forecasts differ' : 'Cloud agreement unavailable'}</span>
          {selectedPlanning.rainRisk && <span>Rain possible</span>}
          {selectedPlanning.windy && <span>Gusty conditions</span>}
        </div>}
      </div>}
    </div>
  );
}
