import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toBlob } from 'html-to-image';
import { type Spot, type AccessAlert, getConditionLabel, getPoetic } from '../data/spots';
import SunCalc from 'suncalc';
import { useSpotForecast } from '../hooks/useSpotForecast';
import { convertTempF, useTempUnit, type TempUnit } from '../hooks/useTempUnit';
import { getForecastAt, type HourlyForecast } from '../utils/weather';
import { cloudCoverLabel, computeLiveScore, visibilityPercent } from '../utils/scoring';
import { getKarlComment } from '../utils/karl-copy';

type CardType = 'sunrise' | 'sunset' | 'stargazing';

interface ScoreCardProps {
  spot: Spot;
  type: CardType;
  eventDate: Date;
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

// Fallback SF temperature when the forecast isn't loaded yet — rough monthly averages.
function getEstimatedTemp(): number {
  const month = new Date().getMonth();
  const temps = [54, 56, 57, 58, 60, 62, 63, 64, 66, 64, 58, 54];
  return temps[month];
}

function getSkyGradient(type: CardType, score: number): string {
  const i = score / 100;
  if (type === 'sunrise') {
    return `radial-gradient(ellipse at 70% 90%,
      hsl(30, ${50 + i * 45}%, ${72 + i * 15}%) 0%,
      hsl(350, ${30 + i * 40}%, ${75 + i * 12}%) 35%,
      hsl(270, ${20 + i * 30}%, ${78 + i * 10}%) 65%,
      hsl(220, ${20 + i * 25}%, ${82 + i * 8}%) 100%)`;
  }
  if (type === 'sunset') {
    return `radial-gradient(ellipse at 70% 90%,
      hsl(20, ${50 + i * 45}%, ${65 + i * 18}%) 0%,
      hsl(350, ${35 + i * 45}%, ${68 + i * 15}%) 30%,
      hsl(280, ${25 + i * 35}%, ${72 + i * 12}%) 60%,
      hsl(220, ${20 + i * 30}%, ${80 + i * 8}%) 100%)`;
  }
  return `radial-gradient(ellipse at 50% 80%,
    hsl(250, ${25 + i * 40}%, ${15 + i * 15}%) 0%,
    hsl(240, ${20 + i * 45}%, ${10 + i * 12}%) 50%,
    hsl(230, ${15 + i * 35}%, ${8 + i * 10}%) 100%)`;
}

// Friendly one-liner derived from the forecast temp — sits under the big
// number in the featured-temperature tile.
function getTempCopy(temp: number): string {
  if (temp < 45) return 'Bundle up';
  if (temp < 55) return 'Bring a layer';
  if (temp < 62) return 'Light layer';
  if (temp < 70) return 'Comfortable';
  if (temp < 78) return 'Warm out';
  return 'Hot one';
}

// Light pollution is categorical, not numeric — map the three buckets to
// bar fills so they read as "more pollution = more bar".
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

interface MetricCellProps {
  label: string;
  value: string;
  barValue: number;
  barColor: string;
}

function MetricCell({ label, value, barValue, barColor }: MetricCellProps) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[8px] tracking-[1.5px] text-gray-400 uppercase">{label}</p>
      <p className="font-serif text-[15px] font-normal text-gray-800 leading-tight mt-0.5 truncate">
        {value}
      </p>
      <MetricBar value={barValue} color={barColor} />
    </div>
  );
}

// Per-metric bar colors. Cool blue for clouds, warm orange for light
// pollution (bigger = more glow), amber for the overall conditions read,
// green for visibility (bigger = clearer).
const METRIC_COLORS = {
  clouds: '#3B82F6',
  lightPoll: '#F97316',
  conditions: '#F59E0B',
  visibility: '#22C55E',
} as const;

// Solid badge with a sonar-style ping ring (CSS pseudo-element). The badge
// itself is a normal button; tapping it surfaces a portal-mounted tooltip
// with the spot's access caveat. We portal to escape the header's
// `overflow:hidden` so the tooltip never gets clipped.
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

// Tiny segmented pill that swaps the temperature display between °F and °C.
// Lives inside the temp tile so the toggle reads as part of the number it
// controls, not a separate piece of chrome. The active slot inverts to a
// dark fill so it's unambiguous at this size.
interface TempUnitToggleProps {
  unit: TempUnit;
  onChange: (next: TempUnit) => void;
}

function TempUnitToggle({ unit, onChange }: TempUnitToggleProps) {
  return (
    <div
      role="group"
      aria-label="Temperature unit"
      className="mt-2 inline-flex items-center rounded-full bg-white/70 p-[2px] font-mono text-[9px] tracking-[1px]"
    >
      {(['F', 'C'] as const).map((opt) => {
        const active = opt === unit;
        return (
          <button
            key={opt}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(opt);
            }}
            aria-pressed={active}
            aria-label={opt === 'F' ? 'Show degrees Fahrenheit' : 'Show degrees Celsius'}
            className={`px-1.5 py-[1px] rounded-full transition-colors ${
              active
                ? 'bg-gray-800 text-white'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            °{opt}
          </button>
        );
      })}
    </div>
  );
}

const dotColors: Record<CardType, string[]> = {
  sunrise: ['rgba(244,114,182,0.5)', 'rgba(251,191,36,0.4)', 'rgba(249,168,212,0.3)'],
  sunset: ['rgba(167,139,250,0.5)', 'rgba(251,146,60,0.5)', 'rgba(244,114,182,0.4)'],
  stargazing: ['rgba(255,255,255,0.4)', 'rgba(199,210,254,0.3)', 'rgba(255,255,255,0.2)'],
};

const typeTitle: Record<CardType, string> = {
  sunrise: "SUNRISE",
  sunset: "SUNSET",
  stargazing: "STARGAZING",
};

export default function ScoreCard({ spot, type, eventDate }: ScoreCardProps) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const times = SunCalc.getTimes(eventDate, spot.lat, spot.lng);
  const moonIllum = SunCalc.getMoonIllumination(eventDate);
  const dateLabel = formatDateShort(eventDate);
  const fullDate = formatFullDate(eventDate);

  let eventInstant: Date;
  let eventTimeData: { time: string; period: string };
  if (type === 'sunrise') {
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
  // Hourly slice valid only if we have a real Date (suncalc returns Invalid Date
  // at high latitudes when no event occurs that day).
  const hourly: HourlyForecast | null =
    forecast && !Number.isNaN(eventInstant.getTime())
      ? getForecastAt(forecast, eventInstant)
      : null;

  const score = hourly
    ? computeLiveScore(spot, type, hourly, moonIllum.fraction)
    : spot[type];
  const isLive = hourly !== null;

  const condition = getConditionLabel(score);
  const poetic = getPoetic(type, score);
  const karlLine = getKarlComment(score, type, spot.id, eventDate);
  const gradient = getSkyGradient(type, score);
  // Internal temp stays in °F so getTempCopy's thresholds keep their meaning;
  // the displayed value is converted on the fly per the user's preference.
  const tempF = hourly && Number.isFinite(hourly.tempF)
    ? hourly.tempF
    : getEstimatedTemp();
  const [tempUnit, setTempUnit] = useTempUnit();
  const displayTemp = Math.round(convertTempF(tempF, tempUnit));
  const tempCopy = getTempCopy(tempF);
  const cloud = hourly ? cloudCoverLabel(hourly.cloud) : '—';
  // Bar shows actual cloud coverage — short bar = clear sky, full bar = overcast.
  const cloudBarValue = hourly && Number.isFinite(hourly.cloud)
    ? Math.round(hourly.cloud)
    : Math.max(5, 100 - score);
  const visibilityValue = hourly ? visibilityPercent(hourly.visibilityKm) : score;
  const dots = dotColors[type];

  const handleShare = async () => {
    const eventLabel = typeTitle[type].toLowerCase();
    const url = `${window.location.origin}/?spot=${spot.id}&view=${type}`;
    const title = `Ask Karl — ${spot.name}`;
    // Karl-voiced share copy: brag if it's a good night, drag him if it isn't.
    const text = score >= 60
      ? `Karl's off at ${spot.name} — ${eventLabel} score: ${score}/100.`
      : `Karl wins at ${spot.name}. ${eventLabel} score: ${score}/100.`;

    // Snapshot the card so the share carries an actual image of what's being shared.
    // 2x pixelRatio keeps it crisp on retina displays / iMessage previews.
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
        // Image capture failed (e.g. tainted canvas); fall through to text-only share.
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

    // No Web Share — offer the image as a download so the user can attach it themselves,
    // and copy the link to the clipboard as a backup.
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
      // ignore – nothing else we can do
    }
  };

  return (
    <div ref={cardRef} className="relative rounded-xl bg-white shadow-md w-full flex flex-col">
      {/* Sky gradient header */}
      <div
        className="relative h-16 overflow-hidden flex-shrink-0 rounded-t-xl"
        style={{ background: gradient }}
      >
        {/* Color dots — top left */}
        <div className="absolute top-2 left-2.5 flex items-center gap-1 z-10">
          {dots.map((c, i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: c.replace(/[\d.]+\)$/, '1)') }} />
          ))}
        </div>
        {/* Action buttons — top right. The access alert (when present) sits
            to the left of the share button so it's the first chrome the
            user reads, but doesn't displace the existing button cluster. */}
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
          <div className="absolute bottom-1.5 right-2.5 text-white/45 text-[8px] font-mono tracking-wider uppercase">
            Moon {Math.round(moonIllum.fraction * 100)}%
          </div>
        )}
        <div
          className="absolute bottom-1.5 left-2.5 flex items-center gap-1 text-white/75 text-[8px] font-mono tracking-[1.5px] uppercase"
          aria-live="polite"
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
      </div>

      {/* Data section — pure weather info for this event */}
      <div className="px-3.5 pt-3 pb-3.5 flex flex-col gap-2.5 flex-1">

        {/* Title row: "TODAY'S SUNSET" leads the card now that the spot
            name lives in the panel header above. */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-mono text-[13px] tracking-[2.5px] text-gray-700 uppercase font-semibold leading-tight">
              {dateLabel}&apos;s {typeTitle[type]}
            </h3>
            <p className="font-mono text-[8px] tracking-[1.5px] text-gray-400 uppercase mt-1 truncate">
              {poetic}
            </p>
          </div>
          <span className="font-mono text-[9px] text-gray-400 tracking-wide flex-shrink-0 mt-1">
            {fullDate}
          </span>
        </div>

        {/* Large time + Karl's read */}
        <div className="flex items-baseline gap-1 -mt-0.5">
          <span className="font-serif text-[32px] leading-none font-light text-gray-800 tracking-tight">
            {eventTimeData.time}
          </span>
          <span className="font-serif text-base text-gray-400 font-light">
            {eventTimeData.period}
          </span>
        </div>

        <p
          className="font-serif italic text-[12px] leading-snug text-gray-600"
          aria-label="Karl's take"
        >
          &ldquo;{karlLine}&rdquo;
          <span className="not-italic font-mono text-[8px] tracking-[2px] uppercase text-gray-400 ml-1.5">
            — Karl
          </span>
        </p>

        {/* Featured temperature tile + compact 2x2 metric grid. The temp
            gets visual weight on the left because it's the single most
            actionable number ("do I need a jacket?"); the grid carries the
            rest of the forecast read at a glance. */}
        <div className="mt-auto pt-1 grid grid-cols-[96px_1fr] gap-2.5 items-stretch">
          <div className="rounded-lg bg-cream-dark/30 px-2 py-3 flex flex-col items-center justify-center text-center">
            <span className="font-serif text-[34px] font-light leading-none text-gray-800 tabular-nums">
              {displayTemp}°
            </span>
            <span className="font-serif italic text-[11px] text-gray-500 mt-1.5 leading-tight">
              {tempCopy}
            </span>
            <TempUnitToggle unit={tempUnit} onChange={setTempUnit} />
          </div>
          <div className="grid grid-cols-2 grid-rows-2 gap-x-4 gap-y-2.5 content-around">
            <MetricCell
              label="Clouds"
              value={cloud}
              barValue={cloudBarValue}
              barColor={METRIC_COLORS.clouds}
            />
            <MetricCell
              label="Light Poll."
              value={spot.lightPollution}
              barValue={lightPollPercent(spot.lightPollution)}
              barColor={METRIC_COLORS.lightPoll}
            />
            <MetricCell
              label="Conditions"
              value={condition}
              barValue={score}
              barColor={METRIC_COLORS.conditions}
            />
            <MetricCell
              label="Visibility"
              value={`${visibilityValue}%`}
              barValue={visibilityValue}
              barColor={METRIC_COLORS.visibility}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
