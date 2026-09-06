import type { NeighborhoodForecastPhase } from '../hooks/useNeighborhoodForecasts';
import type { WeatherRequestErrorKind } from '../utils/weather';
import { formatMetricValue, RAMPS, type WeatherMetric } from '../utils/interpolate';
import {
  addCityCalendarDays,
  formatCityCalendarDate,
  parseCanonicalHourKey,
} from '../utils/timeline';

function failureCopy(kind: WeatherRequestErrorKind | null): string {
  switch (kind) {
    case 'offline': return 'Weather overlay unavailable offline.';
    case 'timeout': return 'Weather overlay request timed out.';
    case 'rate-limit': return 'Weather service is temporarily rate limited.';
    case 'http': return 'Weather service returned an error.';
    case 'aborted': return 'Weather overlay loading was cancelled.';
    case 'invalid-data': return 'Weather service returned incomplete data for this view.';
    default: return 'Weather overlay is temporarily unavailable.';
  }
}

export function getWeatherOverlayPresentation(
  phase: NeighborhoodForecastPhase,
  loaded: number,
  total: number,
  errorKind: WeatherRequestErrorKind | null,
): { visual: string; announcement: string; canRetry: boolean } | null {
  if (phase === 'off') return null;
  let visual: string;
  let announcement: string;
  switch (phase) {
    case 'loading':
      visual = `Loading weather coverage, ${loaded} of ${total} areas.`;
      announcement = 'Loading weather coverage.';
      break;
    case 'progressive':
      visual = `Loading weather coverage, ${loaded} of ${total} areas. Partial map available.`;
      announcement = 'The weather map now has usable partial coverage and is still loading.';
      break;
    case 'partial':
      visual = `Partial weather coverage, ${loaded} of ${total} areas. ${failureCopy(errorKind)}`;
      announcement = visual;
      break;
    case 'ready':
      visual = `Weather coverage ready, ${loaded} of ${total} areas.`;
      announcement = 'Weather coverage is ready.';
      break;
    case 'refreshing':
      visual = `Refreshing weather coverage. Showing saved forecast for ${loaded} areas.`;
      announcement = 'Refreshing weather coverage while saved forecast remains visible.';
      break;
    case 'saved':
      visual = `Showing saved forecast for ${loaded} areas. ${failureCopy(errorKind)}`;
      announcement = visual;
      break;
    case 'unavailable':
      visual = failureCopy(errorKind);
      announcement = visual;
      break;
  }
  const canRetry = phase === 'partial' || phase === 'saved' || phase === 'unavailable';
  return { visual, announcement, canRetry };
}

export function weatherMapSummary(
  cityName: string,
  timeZone: string,
  metric: WeatherMetric,
  hourKey: string,
  now: Date,
  loaded: number,
  total: number,
  visibleAverage?: number,
): string {
  const range = RAMPS[metric];
  const localTime = formatWeatherMapLocalTime(hourKey, timeZone, now);
  const average = visibleAverage !== undefined && Number.isFinite(visibleAverage)
    ? ` Visible-area average ${formatSummaryValue(metric, visibleAverage)}.`
    : '';
  return `${cityName} weather map for ${metric} on ${localTime}. Fixed range ${formatSummaryValue(metric, range.min)} to ${formatSummaryValue(metric, range.max)}. Usable coverage ${loaded} of ${total} areas.${average}`;
}

export function formatWeatherMapLocalTime(
  hourKey: string,
  timeZone: string,
  now: Date,
  locale = 'en-US',
): string {
  const instant = parseCanonicalHourKey(hourKey);
  if (!instant) return 'an unavailable local time';
  const selectedDate = formatCityCalendarDate(instant, timeZone);
  const today = formatCityCalendarDate(now, timeZone);
  const tomorrow = addCityCalendarDays(now, timeZone, 1);
  const date = selectedDate === today
    ? 'Today'
    : selectedDate === tomorrow
      ? 'Tomorrow'
      : new Intl.DateTimeFormat(locale, {
        timeZone,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(instant);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(instant);
  return `${date} · ${time}`;
}

function formatSummaryValue(metric: WeatherMetric, value: number): string {
  const formatted = formatMetricValue(metric, value);
  if (metric === 'temp') return `${formatted}°F`;
  if (metric === 'wind') return `${formatted} mph`;
  if (metric === 'fog') return `${formatted}% fog density`;
  return formatted;
}
