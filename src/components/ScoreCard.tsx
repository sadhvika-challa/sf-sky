import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toBlob } from 'html-to-image';
import { buildPublicShareUrl } from '../platform/runtime';
import { PUBLIC_APP_PATH } from '../platform/publicUrlContract';
import { type Spot, type City, type AccessAlert } from '../data/spots';
import SunCalc from 'suncalc';
import { getSkyArtwork } from '../utils/skyArtwork';
import { convertTempF, useTempUnit, type TempUnit } from '../hooks/useTempUnit';
import { clampPercentage, fogDensity, weatherRefreshExplanation, type HourlyForecast, type SpotForecast } from '../utils/weather';
import { formatScoreValue, type ScoreEvidence } from '../utils/confidence';
import { cloudCoverLabel, cloudQualityScore, cloudQualityLabel, computeScoreBreakdown, computeNowScore, computeNowBaseScore, scoreSunWeather, scoreStargazingWeather, type ScoreBreakdown } from '../utils/scoring';
import { getKarlComment, getKarlBreakdownLine } from '../utils/karl-copy';
import {
  addCityCalendarDays,
  formatCanonicalHourKey,
  formatCityCalendarDate,
  formatInstantTimeLabel,
} from '../utils/timeline';

type CardType = 'now' | 'sunrise' | 'sunset' | 'stargazing';

interface ScoreCardProps {
  embedded?: boolean;
  active?: boolean;
  spot: Spot;
  type: CardType;
  eventInstant: Date;
  selectedDate?: boolean;
  city: City;
  scrubHourKey?: string;
  scrubViewMode?: 'now' | 'sunrise' | 'sunset' | 'stargazing';
  activeScore?: number;
  canonicalScore?: number;
  scoreEvidence: ScoreEvidence;
  timeZone: string;
  forecast: SpotForecast | null;
  forecastLoading: boolean;
  forecastError: Error | null;
  onRetryForecast?: () => void;
  forecastRetrying?: boolean;
  now: Date;
}

function formatTime(date: Date, timeZone: string): { time: string; period: string } {
  const str = formatInstantTimeLabel(date, timeZone);
  const parts = str.match(/^([\d:]+)\s*(AM|PM)(?:\s+(.+))?$/i);
  if (parts) return { time: parts[1], period: `${parts[2].toLowerCase()}${parts[3] ? ` ${parts[3]}` : ''}` };
  return { time: str, period: '' };
}

function formatDateShort(date: Date, timeZone: string, now: Date): string {
  const dateKey = formatCityCalendarDate(date, timeZone);
  const todayKey = formatCityCalendarDate(now, timeZone);
  if (dateKey === todayKey) return 'Today';
  const tomorrowKey = addCityCalendarDays(now, timeZone, 1);
  if (dateKey === tomorrowKey) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric' });
}

function formatFullDate(date: Date, timeZone: string): string {
  return date.toLocaleDateString('en-US', { timeZone, month: 'numeric', day: 'numeric', year: 'numeric' });
}

function getTempCopy(temp: number): string {
  if (temp < 45) return 'Bundle up';
  if (temp < 55) return 'Bring a layer';
  if (temp < 62) return 'Light layer';
  if (temp < 70) return 'Comfortable';
  if (temp < 78) return 'Warm out';
  return 'Hot one';
}

function lightPollPercent(level: 'Low' | 'Mid' | 'High'): number {
  switch (level) {
    case 'Low':
      return 22;
    case 'Mid':
      return 58;
    case 'High':
      return 90;
  }
}

function horizonPercent(quality: 'Open' | 'Partial' | 'Blocked'): number {
  switch (quality) {
    case 'Open':
      return 100;
    case 'Partial':
      return 60;
    case 'Blocked':
      return 20;
  }
}

const METRIC_COLORS = {
  clouds: '#3B82F6',
  lightPoll: '#F97316',
  visibility: '#22C55E',
  wind: '#8B5CF6',
} as const;

const DETAIL_BAR_COLORS = {
  horizon: '#5b9a7b',
  elevation: '#7ba4c4',
  lightPoll: '#c4956a',
  cloud: '#7ba4c4',
  humidity: '#b07a7a',
  fog: '#8a8279',
  moon: '#9f8cd8',
} as const;


interface DetailRowProps {
  label: string;
  value: string;
  barValue?: number;
  barColor: string;
}

function DetailRow({ label, value, barValue, barColor }: DetailRowProps) {
  return (
    <div className="flex items-center gap-4 py-2.5">
      <span className="font-mono text-[14px] text-gray-700 w-[90px] flex-shrink-0">{label}</span>
      <div className="flex-1 h-[3px] bg-gray-100 rounded-full overflow-hidden">
        {barValue !== undefined && (
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${clampPercentage(barValue)}%`, background: barColor }}
          />
        )}
      </div>
      <span className="font-mono text-[12px] text-gray-600 w-[52px] text-right flex-shrink-0">{value}</span>
    </div>
  );
}


interface TempUnitToggleProps {
  unit: TempUnit;
  onChange: (next: TempUnit) => void;
}

const TEMP_BTN_PX = 44;
const TEMP_PAD_PX = 2;

function TempUnitToggle({ unit, onChange }: TempUnitToggleProps) {
  return (
    <div
      role="group"
      aria-label="Temperature unit"
      className="mt-1 relative inline-flex items-center rounded-full bg-gray-100/70 font-mono text-xs"
      style={{ padding: TEMP_PAD_PX }}
    >
      <span
        aria-hidden="true"
        className="absolute rounded-full bg-gray-800 transition-transform duration-200 ease-out"
        style={{
          width: TEMP_BTN_PX,
          height: TEMP_BTN_PX,
          top: TEMP_PAD_PX,
          left: TEMP_PAD_PX,
          transform: unit === 'C' ? `translateX(${TEMP_BTN_PX}px)` : 'translateX(0)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
        }}
      />
      {(['F', 'C'] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange(opt);
          }}
          aria-pressed={opt === unit}
          aria-label={opt === 'F' ? 'Show degrees Fahrenheit' : 'Show degrees Celsius'}
          className="relative z-10 flex items-center justify-center transition-colors duration-200"
          style={{
            width: TEMP_BTN_PX,
            height: TEMP_BTN_PX,
            color: opt === unit ? '#ffffff' : '#6b7280',
          }}
        >
          °{opt}
        </button>
      ))}
    </div>
  );
}

const typeTitle: Record<CardType, string> = {
  now: "DAYTIME",
  sunrise: "SUNRISE",
  sunset: "SUNSET",
  stargazing: "STARGAZING",
};

const ALERT_TOOLTIP_WIDTH = 230;
const ALERT_TOOLTIP_GAP = 10;
const ALERT_VIEWPORT_MARGIN = 8;

interface AccessAlertBadgeProps {
  alert: AccessAlert;
  spotName: string;
}

function AccessAlertBadge({ alert, spotName }: AccessAlertBadgeProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    arrowLeft: number;
    placeAbove: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: PointerEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('pointerdown', handlePointer);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerdown', handlePointer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    function position() {
      const button = buttonRef.current;
      const pop = popoverRef.current;
      if (!button) return;
      const btnRect = button.getBoundingClientRect();
      const popHeight = pop?.offsetHeight ?? 80;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const btnCenterX = btnRect.left + btnRect.width / 2;

      const spaceBelow = vh - btnRect.bottom;
      const spaceAbove = btnRect.top;
      const placeAbove = spaceBelow < popHeight + ALERT_TOOLTIP_GAP + ALERT_VIEWPORT_MARGIN
        && spaceAbove > spaceBelow;

      const top = placeAbove
        ? btnRect.top - ALERT_TOOLTIP_GAP - popHeight
        : btnRect.bottom + ALERT_TOOLTIP_GAP;

      let left = btnCenterX - ALERT_TOOLTIP_WIDTH / 2;
      left = Math.max(
        ALERT_VIEWPORT_MARGIN,
        Math.min(left, vw - ALERT_TOOLTIP_WIDTH - ALERT_VIEWPORT_MARGIN),
      );
      const arrowLeft = btnCenterX - left;

      setCoords({ top, left, arrowLeft, placeAbove });
    }
    position();
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    return () => {
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
    };
  }, [open]);

  const popover = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={popoverRef}
          role="tooltip"
          className="fixed z-[1000] rounded-md bg-cream shadow-lg px-3 py-2 text-left"
          style={{
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
            width: ALERT_TOOLTIP_WIDTH,
            visibility: coords ? 'visible' : 'hidden',
            border: '0.5px solid var(--color-cream-dark, #F5EDE0)',
          }}
        >
          {coords && (
            <span
              aria-hidden
              className="absolute block w-2 h-2 rotate-45 bg-cream"
              style={{
                left: coords.arrowLeft - 4,
                top: coords.placeAbove ? undefined : -4,
                bottom: coords.placeAbove ? -4 : undefined,
                borderTop: coords.placeAbove ? 'none' : '0.5px solid var(--color-cream-dark, #F5EDE0)',
                borderLeft: coords.placeAbove ? 'none' : '0.5px solid var(--color-cream-dark, #F5EDE0)',
                borderRight: coords.placeAbove ? '0.5px solid var(--color-cream-dark, #F5EDE0)' : 'none',
                borderBottom: coords.placeAbove ? '0.5px solid var(--color-cream-dark, #F5EDE0)' : 'none',
              }}
            />
          )}
          <span className="block font-mono text-[8px] tracking-[1.5px] uppercase text-gray-400 mb-1">
            Heads up
          </span>
          <span className="block font-mono text-[12px] leading-snug text-gray-600">
            {alert.message}
          </span>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label={`Heads up about ${spotName}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="alert-badge w-6 h-6 rounded-full shadow-sm flex items-center justify-center text-white font-mono font-bold text-[13px] leading-none active:scale-95 transition-transform"
        style={{ background: 'var(--pin-decent)' }}
      >
        <span aria-hidden>!</span>
      </button>
      {popover}
    </>
  );
}

// ── Wind helpers (Now card) ──────────────────────────────────────────────

function getWindLabel(mph: number): string {
  if (!Number.isFinite(mph)) return '—';
  if (mph < 8) return 'Calm';
  if (mph < 15) return 'Breezy';
  if (mph < 25) return 'Windy';
  return 'Gusty';
}

function windBarPercent(mph: number): number {
  if (!Number.isFinite(mph)) return 0;
  return Math.round(Math.min(100, (mph / 30) * 100));
}

// ── Main ScoreCard ──────────────────────────────────────────────────────

export default function ScoreCard({ embedded = false, active = true, spot, type, eventInstant, selectedDate = false, city, scrubHourKey, scrubViewMode, activeScore, canonicalScore, scoreEvidence, timeZone, forecast, forecastError: error, onRetryForecast, forecastRetrying = false, now }: ScoreCardProps) {
  const [copied, setCopied] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detailView, setDetailView] = useState<'spot' | 'sky'>('sky');
  const detailsVisible = showDetail && active;
  const detailId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const breakdownButtonRef = useRef<HTMLButtonElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusAfterFlipRef = useRef<'summary' | 'detail' | null>(null);

  useEffect(() => {
    const destination = focusAfterFlipRef.current;
    if (!destination) return;
    focusAfterFlipRef.current = null;
    const frame = requestAnimationFrame(() => {
      if (destination === 'detail') backButtonRef.current?.focus({ preventScroll: true });
      else breakdownButtonRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [showDetail]);

  const displayType: CardType = type === 'now' ? (scrubViewMode ?? 'now') : type;
  const dateLabel = type === 'now' ? formatDateShort(eventInstant, timeZone, now) : formatDateShort(eventInstant, timeZone, now);
  const eventTimeData = formatTime(eventInstant, timeZone);
  const fullDate = formatFullDate(eventInstant, timeZone);
  const moonIllum = SunCalc.getMoonIllumination(eventInstant);

  const exactHourKey = type === 'now'
    ? (scrubHourKey || formatCanonicalHourKey(eventInstant))
    : '';
  const hourly: HourlyForecast | null = forecast && !Number.isNaN(eventInstant.getTime())
    ? (forecast.hours[type === 'now'
        ? exactHourKey
        : formatCanonicalHourKey(eventInstant)] ?? null)
    : null;

  const breakdown: ScoreBreakdown | null = hourly && displayType !== 'now'
    ? computeScoreBreakdown(spot, displayType, hourly, moonIllum.fraction)
    : null;
  const score = (() => {
    if (type === 'now') {
      if (activeScore !== undefined) return activeScore;
      return hourly ? computeNowScore(spot, hourly) : computeNowBaseScore(spot);
    }
    if (canonicalScore !== undefined) return canonicalScore;
    return breakdown ? breakdown.total : spot[type];
  })();
  const refreshExplanation = weatherRefreshExplanation(error);

  const spotScore = type === 'now' ? computeNowBaseScore(spot) : spot[type];
  const skyScore = (() => {
    if (!hourly) return null;
    if (type === 'now') return null;
    if (type === 'stargazing') return scoreStargazingWeather(hourly, moonIllum.fraction);
    return scoreSunWeather(hourly);
  })();

  const isSunEvent = displayType === 'sunrise' || displayType === 'sunset';
  const karlLine = breakdown && isSunEvent
    ? getKarlBreakdownLine(breakdown.base, breakdown.weather)
    : getKarlComment(score, displayType, spot.id, eventInstant, city);
  const artwork = getSkyArtwork(spot.lat, spot.lng, eventInstant, hourly);


  const tempF = hourly && Number.isFinite(hourly.tempF) ? hourly.tempF : null;
  const [tempUnit, setTempUnit] = useTempUnit();
  const displayTemp = tempF === null ? '--' : Math.round(convertTempF(tempF, tempUnit));
  const tempCopy = tempF === null ? 'Unavailable' : getTempCopy(tempF);
  const humidityStr = hourly && Number.isFinite(hourly.humidity)
    ? `${clampPercentage(hourly.humidity)}%`
    : '--';

  const handleShare = async () => {
    if (spot.visibility === 'private') return;
    const eventLabel = type === 'now' && scrubHourKey
      ? 'selected hour'
      : (type === 'now' && displayType === 'stargazing' ? 'NIGHTTIME' : typeTitle[displayType]).toLowerCase();
    const hourParam = scrubHourKey || selectedDate
      ? `&instant=${encodeURIComponent(formatCanonicalHourKey(eventInstant))}${type === 'now' ? '' : `&event=${encodeURIComponent(eventInstant.toISOString())}`}`
      : '';
    const url = buildPublicShareUrl(`${PUBLIC_APP_PATH}?spot=${spot.id}&view=${type}${hourParam}`);
    const title = `Soleil \u00b7 ${spot.name}`;
    const timeContext = type === 'now'
      ? ` at ${eventTimeData.time} ${eventTimeData.period}`
      : '';
    const text = score >= 60
      ? `Clear skies at ${spot.name}. ${eventLabel} score${timeContext}: ${score}/100.`
      : `Clouded out at ${spot.name}. ${eventLabel} score${timeContext}: ${score}/100.`;

    const node = cardRef.current;
    let file: File | null = null;
    if (node) {
      const captureNode = node.cloneNode(true) as HTMLDivElement;
      captureNode.style.position = 'fixed';
      captureNode.style.left = '-100000px';
      captureNode.style.width = `${node.getBoundingClientRect().width}px`;
      captureNode.setAttribute('aria-hidden', 'true');
      captureNode.inert = true;
      const shareScore = captureNode.querySelector<HTMLElement>('[data-share-score]');
      if (shareScore) shareScore.style.display = 'block';
      document.body.appendChild(captureNode);
      try {
        const blob = await toBlob(captureNode, {
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor: '#ffffff',
        });
        if (blob) {
          const safeName = spot.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
          file = new File([blob], `soleil-${safeName}-${type}.png`, { type: 'image/png' });
        }
      } catch {
        // Image capture failed; fall through to text-only share.
      } finally {
        captureNode.remove();
      }
    }

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      const shareData: ShareData = file && navigator.canShare?.({ files: [file] })
        ? { title, text, url, files: [file] }
        : { title, text, url };
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }

    if (file) {
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };


  // Derived cloud/visibility/conditions for the summary strip
  const cloudLabel = hourly ? cloudCoverLabel(hourly.cloud) : '--';
  const conditionsLabel = (() => {
    if (!hourly || ![
      hourly.cloud,
      hourly.cloudLow,
      hourly.visibilityKm,
      hourly.humidity,
      hourly.windMph,
    ].every(Number.isFinite)) return '--';
    const fog = fogDensity(hourly);
    if (fog > 0.7) return 'Foggy';
    if (fog > 0.4) return 'Hazy';
    if (hourly.cloud > 85) return 'Overcast';
    if (hourly.windMph > 20) return 'Windy';
    return 'Strong';
  })();
  const visLabel = hourly && Number.isFinite(hourly.visibilityKm)
    ? `${clampPercentage((hourly.visibilityKm / 30) * 100)}%`
    : '--';
  const visBarValue = hourly && Number.isFinite(hourly.visibilityKm)
    ? Math.min(100, (hourly.visibilityKm / 30) * 100)
    : 0;

  // Fog data for detail face
  const fogLevel = (() => {
    if (!hourly || ![
      hourly.visibilityKm,
      hourly.cloudLow,
      hourly.humidity,
    ].every(Number.isFinite)) return { label: '--', barValue: undefined };
    const fog = fogDensity(hourly);
    if (fog > 0.7) return { label: 'Dense', barValue: 90 };
    if (fog > 0.3) return { label: 'Light', barValue: 50 };
    return { label: 'None', barValue: 5 };
  })();

  // Wind data for the "now" card metric grid
  const windMph = hourly && Number.isFinite(hourly.windMph) ? hourly.windMph : null;
  const windLabelText = windMph === null ? '--' : getWindLabel(windMph);
  const windBarValue = windMph === null ? undefined : windBarPercent(windMph);

  return (
    <div ref={cardRef} data-card-details={detailsVisible} data-card-instant={eventInstant.toISOString()} className={`relative bg-white w-full ${embedded ? '' : 'rounded-xl shadow-md'}`} style={{ height: embedded && detailsVisible ? '100%' : undefined }}>
      <div className="relative grid" style={{ gridTemplateColumns: '1fr', gridTemplateRows: embedded && detailsVisible ? 'minmax(0, 1fr)' : undefined, height: embedded && detailsVisible ? '100%' : undefined }}>

        {/* ── Face A: Summary ── */}
        <div
          className={`transition-all duration-250 ease-out ${
            detailsVisible ? 'opacity-0 scale-[0.97] pointer-events-none' : 'opacity-100 scale-100'
          }`}
          style={{ gridArea: '1 / 1', display: detailsVisible ? 'none' : undefined }}
          aria-hidden={detailsVisible}
          inert={detailsVisible}
        >
          <div className={`flex flex-col overflow-hidden h-full min-h-0 ${embedded ? '' : 'rounded-xl'}`}>
            {/* Forecast light and cloud impression, with no text over the artwork. */}
            <div
              className={`relative overflow-hidden flex-shrink-0 ${embedded ? 'rounded-xl' : ''}`}
              style={{ minHeight: embedded ? 120 : 140 }}
              data-sky-artwork
            >
              <img key={artwork.src} src={artwork.src} alt={artwork.label} decoding="async"
                fetchPriority={active ? 'high' : 'auto'}
                className="absolute inset-0 h-full w-full object-cover" data-sky-image />
              <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1.5">
                {spot.accessAlert && (
                  <AccessAlertBadge alert={spot.accessAlert} spotName={spot.name} />
                )}
                {spot.visibility !== 'private' && <button
                  type="button"
                  onClick={handleShare}
                  className="w-6 h-6 rounded-full bg-white/85 backdrop-blur-sm shadow-sm flex items-center justify-center hover:bg-white transition-colors active:scale-95"
                  aria-label={`Share ${type === 'now' && scrubHourKey ? 'selected hour' : (type === 'now' && displayType === 'stargazing' ? 'NIGHTTIME' : typeTitle[displayType]).toLowerCase()} card for ${spot.name}${type === 'now' ? ` at ${formatInstantTimeLabel(eventInstant, timeZone)}` : ''}`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12" />
                    <path d="m7 8 5-5 5 5" />
                    <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
                  </svg>
                </button>}
              </div>

            </div>

            {/* Data section */}
            <div data-card-summary-body className="px-5 pt-2 pb-0 flex flex-col flex-1">
              {/* Title row */}
              <div className="flex items-start justify-between gap-2" data-card-event style={{ display: embedded ? 'none' : undefined }}>
                <div className="min-w-0">
                  <h3 className="font-mono text-[13px] tracking-[1.5px] text-gray-700 uppercase font-semibold leading-tight">
                    {type === 'now' ? (type === 'now' && displayType === 'stargazing' ? 'NIGHTTIME' : typeTitle[displayType]) : <>{dateLabel}&apos;s {typeTitle[type]}</>}
                  </h3>
                </div>
                <span className="font-mono text-[9px] text-gray-500 tracking-wide flex-shrink-0 mt-1">
                  {fullDate}
                </span>
              </div>

              {/* Large time */}
              <div className="flex items-baseline gap-1 mt-4" data-card-event style={{ display: embedded ? 'none' : undefined }}>
                <span className="font-mono text-[36px] leading-none font-light text-gray-800 tracking-tight">
                  {eventTimeData.time}
                </span>
                <span className="font-mono text-lg text-gray-500 font-light">
                  {eventTimeData.period}
                </span>
              </div>

              <div>
                <p className="sr-only" role="status" data-retrieval-badge>{scoreEvidence.retrievalLabel}</p>
                <span data-share-score aria-hidden="true" className="font-sans text-[28px]" style={{ display: 'none' }}>{formatScoreValue(score)}</span>
                {copied && <p className="mt-2 font-mono text-[10px] text-gray-500" role="status">Link copied</p>}
                {(scoreEvidence.reason !== 'none' && scoreEvidence.reason !== 'missing-air-quality' || (spot.visibility === 'private' && scoreEvidence.confidence === 'low')) && scoreEvidence.state !== 'loading' && (
                  <p className="mt-2 font-mono text-[10px] text-gray-500" role="status">{scoreEvidence.statusLabel.replace(/ · (low|medium|high) confidence$/i, '')}</p>
                )}
                {type === 'now' && refreshExplanation && (
                  <p className="mt-2 font-mono text-[10px] leading-relaxed text-amber-800">
                    {refreshExplanation}
                  </p>
                )}
                {type === 'now' && error && onRetryForecast && (
                  <button
                    type="button"
                    onClick={onRetryForecast}
                    disabled={forecastRetrying}
                    className="mt-2 font-mono text-[10px] font-semibold text-[#8B5E3C] underline underline-offset-2 disabled:cursor-wait disabled:opacity-60"
                  >
                    {forecastRetrying ? `Retrying forecast for ${spot.name}` : `Retry forecast for ${spot.name}`}
                  </button>
                )}

              </div>

              <div className="flex items-center justify-between gap-3" data-card-summary>
                <span className="font-mono text-[28px] font-normal leading-none tabular-nums text-gray-800" data-temperature
                  style={{ fontSize: tempF === null ? 14 : undefined }}
                  aria-label={tempF === null ? 'Temperature unavailable' : `Temperature ${displayTemp} degrees ${tempUnit === 'F' ? 'Fahrenheit' : 'Celsius'}`}>
                  {tempF === null ? 'Unavailable' : `${displayTemp}°${tempUnit}`}
                </span>
                <button ref={breakdownButtonRef} type="button" onClick={() => {
                  focusAfterFlipRef.current = 'detail';
                  setShowDetail(true);
                }} className="flex min-h-11 items-center gap-1.5 rounded-md px-1 font-mono text-sm text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155561]">
                  Details
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Face B: Detail ── */}
        <div
          className={`transition-all duration-250 ease-out ${
            detailsVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97] pointer-events-none'
          }`}
          style={{ gridArea: '1 / 1', minHeight: 0, display: detailsVisible ? undefined : 'none' }}
          aria-hidden={!detailsVisible}
          inert={!detailsVisible}
        >
          <div className={`flex flex-col overflow-hidden h-full min-h-0 ${embedded ? '' : 'rounded-xl'}`}>
            {/* Score context stays outside the sky artwork. */}
            <div
              data-details-context className="flex items-center justify-between px-5 py-3.5 rounded-t-xl flex-shrink-0"
              style={{ background: '#F4F7F8' }}
            >
              <p className="font-mono text-[8px] tracking-[1.5px] text-gray-600 uppercase">
                {type === 'now' ? (type === 'now' && displayType === 'stargazing' ? 'NIGHTTIME' : typeTitle[displayType]) : <>{dateLabel}&apos;s {typeTitle[type]}</>}
              </p>
              <p className="font-mono italic text-[11px] text-gray-600 leading-snug max-w-[60%] text-right">
                &ldquo;{karlLine}&rdquo;
              </p>
            </div>

            {/* Scrollable detail content */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5">
              <div className="flex border-b border-gray-100" role="tablist" aria-label="Score contributions">
                {(['spot', 'sky'] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    role="tab"
                    id={`${detailId}-${view}-tab`}
                    data-breakdown-tab={view}
                    aria-controls={`${detailId}-${view}-panel`}
                    aria-selected={detailView === view}
                    tabIndex={detailView === view ? 0 : -1}
                    onClick={() => setDetailView(view)}
                    onKeyDown={(event) => {
                      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                      event.preventDefault();
                      const next = event.key === 'Home' ? 'spot' : event.key === 'End' ? 'sky' : view === 'spot' ? 'sky' : 'spot';
                      setDetailView(next);
                      event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-breakdown-tab="${next}"]`)?.focus();
                    }}
                    className={`min-h-11 flex-1 border-b-2 font-mono text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-gray-700 ${detailView === view ? 'border-gray-700 text-gray-800' : 'border-transparent text-gray-500'}`}
                  >
                    {view === 'spot' ? 'Spot' : 'Sky'}
                  </button>
                ))}
              </div>
              <div className="grid">
              {/* SPOT section */}
              <div
                role="tabpanel"
                id={`${detailId}-spot-panel`}
                aria-labelledby={`${detailId}-spot-tab`}
                aria-hidden={detailView !== 'spot'}
                inert={detailView !== 'spot'}
                tabIndex={detailView === 'spot' ? 0 : -1}
                className="pt-3 pb-2"
                style={{ gridArea: '1 / 1', display: detailView === 'spot' ? undefined : 'none' }}
              >
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-mono text-[9px] tracking-[1.5px] text-gray-400 uppercase">Spot</span>
                  <span className="font-mono text-[18px] text-gray-800 tabular-nums">{spotScore}</span>
                </div>
                <DetailRow
                  label="Horizon"
                  value={spot.horizonQuality}
                  barValue={horizonPercent(spot.horizonQuality)}
                  barColor={DETAIL_BAR_COLORS.horizon}
                />
                <DetailRow
                  label="Elevation"
                  value={spot.visibility === 'private' && spot.elevation === 0 ? 'Unknown' : `${spot.elevation} m`}
                  barValue={spot.visibility === 'private' && spot.elevation === 0 ? undefined : Math.min(100, (spot.elevation / 500) * 100)}
                  barColor={DETAIL_BAR_COLORS.elevation}
                />
                <DetailRow
                  label="Light poll."
                  value={spot.lightPollution}
                  barValue={lightPollPercent(spot.lightPollution)}
                  barColor={DETAIL_BAR_COLORS.lightPoll}
                />
              </div>

              {/* SKY section */}
              <div
                role="tabpanel"
                id={`${detailId}-sky-panel`}
                aria-labelledby={`${detailId}-sky-tab`}
                aria-hidden={detailView !== 'sky'}
                inert={detailView !== 'sky'}
                tabIndex={detailView === 'sky' ? 0 : -1}
                className="pt-3 pb-2"
                style={{ gridArea: '1 / 1', display: detailView === 'sky' ? undefined : 'none' }}
              >
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-mono text-[9px] tracking-[1.5px] text-gray-400 uppercase">
                    {type === 'now' ? 'Conditions' : 'Sky'}
                  </span>
                  {skyScore != null && (
                    <span className="font-mono text-[18px] text-gray-800 tabular-nums">{Math.round(skyScore)}</span>
                  )}
                </div>
                <p className="mb-2 font-mono text-xs text-gray-600" data-retrieval-detail>{scoreEvidence.retrievalLabel}</p>
                <div className="flex items-center justify-between gap-2 py-2">
                  <span className="font-mono text-sm text-gray-700">Temperature</span>
                  <span className="font-mono text-base text-gray-800">{tempF === null ? 'Unavailable' : `${displayTemp}°${tempUnit}`}</span>
                  <TempUnitToggle unit={tempUnit} onChange={setTempUnit} />
                </div>
                <p className="mb-2 font-mono text-xs text-gray-600">{tempCopy}</p>
                {type !== 'now' && <>
                  <DetailRow label="Cloud cover" value={cloudLabel}
                    barValue={hourly && Number.isFinite(hourly.cloud) ? clampPercentage(hourly.cloud) : undefined} barColor={METRIC_COLORS.clouds} />
                  <DetailRow label="Conditions" value={conditionsLabel} barColor={METRIC_COLORS.clouds} />
                  <DetailRow label="Wind" value={windLabelText} barValue={windBarValue} barColor={METRIC_COLORS.wind} />
                  <DetailRow label="Visibility" value={visLabel} barValue={visBarValue} barColor={METRIC_COLORS.visibility} />
                </>}
                {type === 'now' ? (
                  <>
                    <DetailRow
                      label="Cloud"
                      value={cloudLabel}
                      barValue={hourly && Number.isFinite(hourly.cloud) ? hourly.cloud : undefined}
                      barColor={DETAIL_BAR_COLORS.cloud}
                    />
                    <DetailRow
                      label="Wind"
                      value={windLabelText}
                      barValue={windBarValue}
                      barColor={METRIC_COLORS.wind}
                    />
                    <DetailRow
                      label="Visibility"
                      value={visLabel}
                      barValue={hourly && Number.isFinite(hourly.visibilityKm) ? visBarValue : undefined}
                      barColor={DETAIL_BAR_COLORS.fog}
                    />
                    <DetailRow
                      label="Fog"
                      value={fogLevel.label}
                      barValue={fogLevel.barValue}
                      barColor={DETAIL_BAR_COLORS.fog}
                    />
                  </>
                ) : isSunEvent ? (
                  <>
                    <DetailRow
                      label="Cloud quality"
                      value={hourly && [hourly.cloud, hourly.cloudLow, hourly.cloudMid, hourly.cloudHigh].every(Number.isFinite) ? cloudQualityLabel(cloudQualityScore(hourly, type as 'sunrise' | 'sunset'), type as 'sunrise' | 'sunset') : '--'}
                      barValue={hourly && [hourly.cloud, hourly.cloudLow, hourly.cloudMid, hourly.cloudHigh].every(Number.isFinite) ? cloudQualityScore(hourly, type as 'sunrise' | 'sunset') : undefined}
                      barColor={DETAIL_BAR_COLORS.cloud}
                    />
                    <DetailRow
                      label="Humidity"
                      value={humidityStr}
                      barValue={hourly && Number.isFinite(hourly.humidity) ? hourly.humidity : undefined}
                      barColor={DETAIL_BAR_COLORS.humidity}
                    />
                    <DetailRow
                      label="Fog"
                      value={fogLevel.label}
                      barValue={fogLevel.barValue}
                      barColor={DETAIL_BAR_COLORS.fog}
                    />
                  </>
                ) : (
                  <>
                    <DetailRow
                      label="Cloud"
                      value={hourly && Number.isFinite(hourly.cloud) ? cloudQualityLabel(cloudQualityScore(hourly, 'stargazing'), 'stargazing') : '--'}
                      barValue={hourly && Number.isFinite(hourly.cloud) ? cloudQualityScore(hourly, 'stargazing') : undefined}
                      barColor={DETAIL_BAR_COLORS.cloud}
                    />
                    <DetailRow
                      label="Humidity"
                      value={humidityStr}
                      barValue={hourly && Number.isFinite(hourly.humidity) ? hourly.humidity : undefined}
                      barColor={DETAIL_BAR_COLORS.humidity}
                    />
                    <DetailRow
                      label="Moon"
                      value={`${Math.round(moonIllum.fraction * 100)}%`}
                      barValue={Math.round(moonIllum.fraction * 100)}
                      barColor={DETAIL_BAR_COLORS.moon}
                    />
                  </>
                )}
              </div>
              </div>

            </div>

            {/* Back button -- pinned footer, same position as "See Breakdown" */}
            <div className="score-card-back px-5 pb-4 pt-3 flex-shrink-0">
              <button
                ref={backButtonRef}
                type="button"
                onClick={() => {
                  focusAfterFlipRef.current = 'summary';
                  setShowDetail(false);
                }}
                className="flex min-h-11 items-center justify-center gap-1.5 w-full rounded-md font-mono text-sm text-gray-700 focus-visible:outline-2 focus-visible:outline-[#155561]"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Back
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
