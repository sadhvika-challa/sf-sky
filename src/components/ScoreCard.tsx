import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toBlob } from 'html-to-image';
import { type Spot, type City, type AccessAlert, getPoetic } from '../data/spots';
import SunCalc from 'suncalc';
import { useSpotForecast } from '../hooks/useSpotForecast';
import { convertTempF, useTempUnit, type TempUnit } from '../hooks/useTempUnit';
import { getForecastAt, fogDensity, type HourlyForecast } from '../utils/weather';
import { cloudCoverLabel, cloudQualityScore, cloudQualityLabel, computeScoreBreakdown, computeNowScore, computeNowBaseScore, scoreSunWeather, scoreStargazingWeather, type ScoreBreakdown } from '../utils/scoring';
import { getKarlComment, getKarlBreakdownLine } from '../utils/karl-copy';

type CardType = 'now' | 'sunrise' | 'sunset' | 'stargazing';

interface ScoreCardProps {
  spot: Spot;
  type: CardType;
  eventDate: Date;
  city: City;
  scrubHourKey?: string;
  scrubViewMode?: 'now' | 'sunrise' | 'sunset' | 'stargazing';
}

function formatTime(date: Date): { time: string; period: string } {
  const str = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const parts = str.match(/^([\d:]+)\s*(AM|PM)$/i);
  if (parts) return { time: parts[1], period: parts[2].toLowerCase() };
  return { time: str, period: '' };
}

function formatDateShort(date: Date): string {
  const now = new Date();
  const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  if (isToday) return 'Today';
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.getDate() === tomorrow.getDate() && date.getMonth() === tomorrow.getMonth()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function getEstimatedTemp(): number {
  const month = new Date().getMonth();
  const temps = [54, 56, 57, 58, 60, 62, 63, 64, 66, 64, 58, 54];
  return temps[month];
}

function getSkyGradient(type: CardType, score: number): string {
  const i = score / 100;

  if (type === 'now') {
    return `radial-gradient(ellipse at 50% 20%,
      hsl(205, ${35 + i * 50}%, ${78 + i * 14}%) 0%,
      hsl(195, ${25 + i * 35}%, ${82 + i * 10}%) 40%,
      hsl(45, ${15 + i * 25}%, ${88 + i * 6}%) 100%)`;
  }

  if (type === 'sunrise') {
    if (score >= 70) {
      return 'linear-gradient(to top, #F59E0B 0%, #F9A8D4 45%, #BFDBFE 100%)';
    }
    if (score >= 45) {
      return 'linear-gradient(to top, #FED7AA 0%, #E0E7FF 100%)';
    }
    return 'linear-gradient(to top, #D1D5DB 0%, #94A3B8 100%)';
  }

  if (type === 'sunset') {
    if (score >= 70) {
      return 'linear-gradient(to top, #EA580C 0%, rgba(192,38,211,0.3) 40%, #1E3A5F 100%)';
    }
    if (score >= 45) {
      return 'linear-gradient(to top, rgba(245,158,11,0.6) 0%, #64748B 100%)';
    }
    return 'linear-gradient(to top, #78716C 0%, #475569 100%)';
  }

  // stargazing
  if (score >= 70) {
    return 'linear-gradient(to bottom, #0F172A 0%, #1E3A5F 50%, #0F172A 100%)';
  }
  if (score >= 45) {
    return 'linear-gradient(to bottom, #1E293B 0%, #334155 100%)';
  }
  return 'linear-gradient(to bottom, #374151 0%, #6B7280 100%)';
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

function MetricBar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-[3px] bg-gray-200/80 rounded-full overflow-hidden mt-1.5">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
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


interface MetricCellProps {
  label: string;
  value: string;
  barValue?: number;
  barColor?: string;
}

function MetricCell({ label, value, barValue, barColor }: MetricCellProps) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[8px] tracking-[1.5px] text-gray-400 uppercase">{label}</p>
      <p className="font-serif text-[15px] font-normal text-gray-800 leading-tight truncate mt-0.5">
        {value}
      </p>
      {barValue != null && barColor && <MetricBar value={barValue} color={barColor} />}
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  barValue: number;
  barColor: string;
}

function DetailRow({ label, value, barValue, barColor }: DetailRowProps) {
  return (
    <div className="flex items-center gap-4 py-2.5">
      <span className="font-serif text-[14px] text-gray-700 w-[90px] flex-shrink-0">{label}</span>
      <div className="flex-1 h-[3px] bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${Math.max(0, Math.min(100, barValue))}%`, background: barColor }}
        />
      </div>
      <span className="font-mono text-[12px] text-gray-600 w-[52px] text-right flex-shrink-0">{value}</span>
    </div>
  );
}


interface TempUnitToggleProps {
  unit: TempUnit;
  onChange: (next: TempUnit) => void;
}

const TEMP_BTN_PX = 22;
const TEMP_PAD_PX = 2;

function TempUnitToggle({ unit, onChange }: TempUnitToggleProps) {
  return (
    <div
      role="group"
      aria-label="Temperature unit"
      className="mt-1 relative inline-flex items-center rounded-full bg-gray-100/70 font-mono text-[9px] tracking-[1px]"
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

const dotColors: Record<CardType, string[]> = {
  now: ['rgba(250,204,21,0.5)', 'rgba(147,197,253,0.4)', 'rgba(253,224,71,0.3)'],
  sunrise: ['rgba(217,70,168,0.5)', 'rgba(217,70,168,0.3)', 'rgba(217,70,168,0.2)'],
  sunset: ['rgba(204,41,54,0.5)', 'rgba(204,41,54,0.35)', 'rgba(217,70,168,0.3)'],
  stargazing: ['rgba(255,255,255,0.4)', 'rgba(199,210,254,0.3)', 'rgba(255,255,255,0.2)'],
};

const typeTitle: Record<CardType, string> = {
  now: "RIGHT NOW",
  sunrise: "SUNRISE",
  sunset: "SUNSET",
  stargazing: "STARGAZING",
};

// ── Access Alert Badge ──────────────────────────────────────────────────

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
    if (!open) {
      setCoords(null);
      return;
    }
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
          <span className="block font-serif text-[12px] leading-snug text-gray-600">
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

export default function ScoreCard({ spot, type, eventDate, city, scrubHourKey, scrubViewMode }: ScoreCardProps) {
  const [copied, setCopied] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const times = SunCalc.getTimes(eventDate, spot.lat, spot.lng);
  const moonIllum = SunCalc.getMoonIllumination(eventDate);
  const dateLabel = type === 'now' ? 'Now' : formatDateShort(eventDate);
  const fullDate = formatFullDate(eventDate);

  let eventInstant: Date;
  let eventTimeData: { time: string; period: string };
  if (type === 'now') {
    if (!scrubHourKey) {
      eventInstant = new Date();
      eventTimeData = formatTime(new Date());
    } else if (scrubViewMode === 'now') {
      const scrubDate = new Date(`${scrubHourKey}:00:00`);
      eventInstant = scrubDate;
      eventTimeData = formatTime(scrubDate);
    } else {
      const scrubDate = new Date(`${scrubHourKey}:00:00`);
      const scrubTimes = SunCalc.getTimes(scrubDate, spot.lat, spot.lng);
      const midpoint = new Date(
        (scrubTimes.sunrise.getTime() + scrubTimes.sunset.getTime()) / 2
      );
      eventInstant = midpoint;
      eventTimeData = formatTime(midpoint);
    }
  } else if (type === 'sunrise') {
    eventInstant = times.sunrise;
    eventTimeData = formatTime(times.sunrise);
  } else if (type === 'sunset') {
    eventInstant = times.sunset;
    eventTimeData = formatTime(times.sunset);
  } else {
    eventInstant = times.nauticalDusk;
    eventTimeData = formatTime(times.nauticalDusk);
  }

  const { forecast, loading, error } = useSpotForecast(spot);
  const hourly: HourlyForecast | null =
    forecast && !Number.isNaN(eventInstant.getTime())
      ? getForecastAt(forecast, eventInstant)
      : null;

  const breakdown: ScoreBreakdown | null = hourly && type !== 'now'
    ? computeScoreBreakdown(spot, type, hourly, moonIllum.fraction)
    : null;
  const score = (() => {
    if (type === 'now') {
      return hourly ? computeNowScore(spot, hourly) : computeNowBaseScore(spot);
    }
    return breakdown ? breakdown.total : spot[type];
  })();
  const isLive = hourly !== null;

  const spotScore = type === 'now' ? computeNowBaseScore(spot) : spot[type];
  const skyScore = (() => {
    if (!hourly) return null;
    if (type === 'now') return null;
    if (type === 'stargazing') return scoreStargazingWeather(hourly, moonIllum.fraction);
    return scoreSunWeather(hourly);
  })();

  const poetic = getPoetic(type, score);
  const isSunEvent = type === 'sunrise' || type === 'sunset';
  const karlLine = breakdown && isSunEvent
    ? getKarlBreakdownLine(breakdown.base, breakdown.weather)
    : getKarlComment(score, type, spot.id, eventDate, city);
  const gradient = getSkyGradient(type, score);

  const tempF = hourly && Number.isFinite(hourly.tempF)
    ? hourly.tempF
    : getEstimatedTemp();
  const [tempUnit, setTempUnit] = useTempUnit();
  const displayTemp = Math.round(convertTempF(tempF, tempUnit));
  const tempCopy = getTempCopy(tempF);
  const humidityStr = hourly && Number.isFinite(hourly.humidity)
    ? `${Math.round(hourly.humidity)}%`
    : '--';
  const dots = dotColors[type];

  const handleShare = async () => {
    const eventLabel = typeTitle[type].toLowerCase();
    const url = `${window.location.origin}/?spot=${spot.id}&view=${type}`;
    const title = `Ask Karl \u00b7 ${spot.name}`;
    const text = score >= 60
      ? `Karl's off at ${spot.name}. ${eventLabel} score: ${score}/100.`
      : `Karl wins at ${spot.name}. ${eventLabel} score: ${score}/100.`;

    const node = cardRef.current;
    let file: File | null = null;
    if (node) {
      try {
        const blob = await toBlob(node, {
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor: '#ffffff',
        });
        if (blob) {
          const safeName = spot.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
          file = new File([blob], `ask-karl-${safeName}-${type}.png`, { type: 'image/png' });
        }
      } catch {
        // Image capture failed; fall through to text-only share.
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
    if (!hourly) return '--';
    const fog = fogDensity(hourly);
    if (fog > 0.7) return 'Foggy';
    if (fog > 0.4) return 'Hazy';
    if (hourly.cloud > 85) return 'Overcast';
    if (hourly.windMph > 20) return 'Windy';
    return 'Strong';
  })();
  const visLabel = hourly && Number.isFinite(hourly.visibilityKm)
    ? `${Math.round((hourly.visibilityKm / 30) * 100)}%`
    : '--';
  const visBarValue = hourly && Number.isFinite(hourly.visibilityKm)
    ? Math.min(100, (hourly.visibilityKm / 30) * 100)
    : 0;

  // Fog data for detail face
  const fogLevel = (() => {
    if (!hourly) return { label: '--', barValue: 0 };
    const fog = fogDensity(hourly);
    if (fog > 0.7) return { label: 'Dense', barValue: 90 };
    if (fog > 0.3) return { label: 'Light', barValue: 50 };
    return { label: 'None', barValue: 5 };
  })();

  // Wind data for the "now" card metric grid
  const windMph = hourly && Number.isFinite(hourly.windMph) ? hourly.windMph : 8;
  const windLabelText = getWindLabel(windMph);
  const windBarValue = windBarPercent(windMph);

  return (
    <div ref={cardRef} className="relative rounded-xl bg-white shadow-md w-full">
      <div className="grid" style={{ gridTemplateColumns: '1fr' }}>

        {/* ── Face A: Summary ── */}
        <div
          className={`transition-all duration-250 ease-out ${
            showDetail ? 'opacity-0 scale-[0.97] pointer-events-none' : 'opacity-100 scale-100'
          }`}
          style={{ gridArea: '1 / 1' }}
        >
          <div className="rounded-xl flex flex-col overflow-hidden h-full">
            {/* Sky gradient header */}
            <div
              className="relative overflow-hidden flex-shrink-0"
              style={{ background: gradient, minHeight: 140 }}
            >
              <div className="absolute top-2 left-2.5 flex items-center gap-1 z-10">
                {dots.map((c, i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: c.replace(/[\d.]+\)$/, '1)') }} />
                ))}
              </div>
              <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1.5">
                {spot.accessAlert && (
                  <AccessAlertBadge alert={spot.accessAlert} spotName={spot.name} />
                )}
                <button
                  type="button"
                  onClick={handleShare}
                  className="w-6 h-6 rounded-full bg-white/85 backdrop-blur-sm shadow-sm flex items-center justify-center hover:bg-white transition-colors active:scale-95"
                  aria-label={`Share ${typeTitle[type].toLowerCase()} card for ${spot.name}`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12" />
                    <path d="m7 8 5-5 5 5" />
                    <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
                  </svg>
                </button>
              </div>
              {copied && (
                <div className="absolute top-9 right-1.5 z-10 px-2 py-1 rounded-md bg-gray-800/90 text-white text-[9px] font-mono tracking-wide uppercase shadow-md">
                  Link copied
                </div>
              )}
              {type === 'stargazing' && (
                <div
                  className="absolute bottom-1.5 right-2.5 text-white/45 text-[8px] font-mono tracking-wider uppercase"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
                >
                  Moon {Math.round(moonIllum.fraction * 100)}%
                </div>
              )}
              <div
                className="absolute bottom-1.5 left-2.5 flex items-center gap-1 text-white/75 text-[8px] font-mono tracking-[1.5px] uppercase"
                aria-live="polite"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400' : 'bg-white/40'}`}
                  style={isLive ? { boxShadow: '0 0 6px rgba(52,211,153,0.85)' } : undefined}
                />
                {loading && !forecast
                  ? 'Asking Karl'
                  : error && !forecast
                    ? 'Karl broke it'
                    : isLive
                      ? 'Live'
                      : 'Static'}
              </div>
              {type === 'stargazing' && (
                <>
                  <span className="twinkle-star absolute w-[2px] h-[2px] rounded-full bg-white" style={{ top: '18%', left: '22%', animationDelay: '0s' }} />
                  <span className="twinkle-star absolute w-[2px] h-[2px] rounded-full bg-white" style={{ top: '35%', left: '55%', animationDelay: '0.7s' }} />
                  <span className="twinkle-star absolute w-[2px] h-[2px] rounded-full bg-white" style={{ top: '28%', left: '78%', animationDelay: '1.4s' }} />
                  <span className="twinkle-star absolute w-[2px] h-[2px] rounded-full bg-white" style={{ top: '55%', left: '40%', animationDelay: '2.1s' }} />
                  <span className="twinkle-star absolute w-[2px] h-[2px] rounded-full bg-white" style={{ top: '45%', left: '88%', animationDelay: '2.8s' }} />
                </>
              )}
            </div>

            {/* Data section */}
            <div className="px-5 pt-5 pb-3 flex flex-col flex-1">
              {/* Title row */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-mono text-[13px] tracking-[2.5px] text-gray-700 uppercase font-semibold leading-tight">
                    {type === 'now' ? typeTitle[type] : <>{dateLabel}&apos;s {typeTitle[type]}</>}
                  </h3>
                  <p className="font-mono text-[8px] tracking-[1.5px] text-gray-400 uppercase mt-1 truncate">
                    {poetic}
                  </p>
                </div>
                <span className="font-mono text-[9px] text-gray-400 tracking-wide flex-shrink-0 mt-1">
                  {fullDate}
                </span>
              </div>

              {/* Large time */}
              <div className="flex items-baseline gap-1 mt-4">
                <span className="font-serif text-[36px] leading-none font-light text-gray-800 tracking-tight">
                  {eventTimeData.time}
                </span>
                <span className="font-serif text-lg text-gray-400 font-light">
                  {eventTimeData.period}
                </span>
              </div>

              {/* Score + poetic description */}
              <div className="mt-4">
                <div className="flex items-baseline gap-2">
                  <span className="font-serif text-[28px] font-light text-gray-800 leading-none tabular-nums">
                    {score}
                  </span>
                  <span className="font-serif italic text-[14px] text-gray-500">{poetic}</span>
                </div>
                <p className="font-mono text-[8px] tracking-[1.5px] text-gray-400 uppercase mt-1.5">
                  {isLive ? 'Forecast firming up' : 'Static estimate'}
                </p>
              </div>

              {/* Condensed metrics strip */}
              {type === 'now' ? (
                <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-3 border-t border-gray-100 pt-4 mt-4">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-serif text-[24px] font-light text-gray-800 leading-none tabular-nums">
                        {displayTemp}&deg;
                      </span>
                    </div>
                    <p className="font-serif italic text-[10px] text-gray-500 mt-0.5">{tempCopy}</p>
                    <TempUnitToggle unit={tempUnit} onChange={setTempUnit} />
                  </div>
                  <MetricCell
                    label="Clouds"
                    value={cloudLabel}
                    barValue={hourly ? hourly.cloud : 0}
                    barColor={METRIC_COLORS.clouds}
                  />
                  <MetricCell
                    label="Wind"
                    value={windLabelText}
                    barValue={windBarValue}
                    barColor={METRIC_COLORS.wind}
                  />
                  <MetricCell
                    label="Visibility"
                    value={visLabel}
                    barValue={visBarValue}
                    barColor={METRIC_COLORS.visibility}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-3 border-t border-gray-100 pt-4 mt-4">
                  {/* Temperature column */}
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-serif text-[24px] font-light text-gray-800 leading-none tabular-nums">
                        {displayTemp}&deg;
                      </span>
                    </div>
                    <p className="font-serif italic text-[10px] text-gray-500 mt-0.5">{tempCopy}</p>
                    <TempUnitToggle unit={tempUnit} onChange={setTempUnit} />
                  </div>
                  {/* Clouds */}
                  <MetricCell
                    label="Clouds"
                    value={cloudLabel}
                    barValue={hourly ? hourly.cloud : 0}
                    barColor={METRIC_COLORS.clouds}
                  />
                  {/* Conditions */}
                  <MetricCell
                    label="Conditions"
                    value={conditionsLabel}
                  />
                  {/* Visibility */}
                  <MetricCell
                    label="Visibility"
                    value={visLabel}
                    barValue={visBarValue}
                    barColor={METRIC_COLORS.visibility}
                  />
                </div>
              )}

            </div>

            {/* See breakdown tap target */}
            <div className="px-5 pb-4 pt-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowDetail(true)}
                className="flex items-center justify-center gap-1.5 w-full pt-2 pb-1 font-mono text-[9px] tracking-[1.5px] uppercase text-gray-500 hover:text-gray-400 transition-colors"
              >
                See breakdown
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── Face B: Detail ── */}
        <div
          className={`transition-all duration-250 ease-out ${
            showDetail ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97] pointer-events-none'
          }`}
          style={{ gridArea: '1 / 1' }}
        >
          <div className="rounded-xl flex flex-col overflow-hidden h-full">
            {/* Gradient-backed score context row */}
            <div
              className="flex items-center justify-between px-5 py-3.5 rounded-t-xl flex-shrink-0"
              style={{ background: gradient, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
            >
              <p className="font-mono text-[8px] tracking-[1.5px] text-white/80 uppercase">
                {type === 'now' ? typeTitle[type] : <>{dateLabel}&apos;s {typeTitle[type]}</>}
              </p>
              <p className="font-serif italic text-[11px] text-white/80 leading-snug max-w-[60%] text-right">
                &ldquo;{karlLine}&rdquo;
              </p>
            </div>

            {/* Scrollable detail content */}
            <div className="flex-1 overflow-y-auto px-5">
              {/* SPOT section */}
              <div className="border-t border-gray-100 pt-4 pb-3">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-mono text-[9px] tracking-[1.5px] text-gray-400 uppercase">Spot</span>
                  <span className="font-serif text-[18px] text-gray-800 tabular-nums">{spotScore}</span>
                </div>
                <DetailRow
                  label="Horizon"
                  value={spot.horizonQuality}
                  barValue={horizonPercent(spot.horizonQuality)}
                  barColor={DETAIL_BAR_COLORS.horizon}
                />
                <DetailRow
                  label="Elevation"
                  value={`${spot.elevation} m`}
                  barValue={Math.min(100, (spot.elevation / 500) * 100)}
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
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-mono text-[9px] tracking-[1.5px] text-gray-400 uppercase">
                    {type === 'now' ? 'Conditions' : 'Sky'}
                  </span>
                  {skyScore != null && (
                    <span className="font-serif text-[18px] text-gray-800 tabular-nums">{Math.round(skyScore)}</span>
                  )}
                </div>
                {type === 'now' ? (
                  <>
                    <DetailRow
                      label="Cloud"
                      value={cloudLabel}
                      barValue={hourly ? hourly.cloud : 0}
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
                      barValue={visBarValue}
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
                      label="Cloud"
                      value={hourly ? cloudQualityLabel(cloudQualityScore(hourly, type as 'sunrise' | 'sunset'), type as 'sunrise' | 'sunset') : '--'}
                      barValue={hourly ? cloudQualityScore(hourly, type as 'sunrise' | 'sunset') : 0}
                      barColor={DETAIL_BAR_COLORS.cloud}
                    />
                    <DetailRow
                      label="Humidity"
                      value={humidityStr}
                      barValue={hourly ? hourly.humidity : 0}
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
                      value={hourly ? cloudQualityLabel(cloudQualityScore(hourly, 'stargazing'), 'stargazing') : '--'}
                      barValue={hourly ? cloudQualityScore(hourly, 'stargazing') : 0}
                      barColor={DETAIL_BAR_COLORS.cloud}
                    />
                    <DetailRow
                      label="Humidity"
                      value={humidityStr}
                      barValue={hourly ? hourly.humidity : 0}
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

            {/* Back button -- pinned footer, same position as "See Breakdown" */}
            <div className="px-5 pb-4 pt-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowDetail(false)}
                className="flex items-center justify-center gap-1.5 w-full pt-2 pb-1 font-mono text-[9px] tracking-[1.5px] uppercase text-gray-500 hover:text-gray-400 transition-colors"
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
