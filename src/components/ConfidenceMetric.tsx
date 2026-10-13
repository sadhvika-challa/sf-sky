import { useEffect, useId, useRef, useState } from 'react';
import { getConfidenceReviewTimes, type ScoreEvidence } from '../utils/confidence';

interface ConfidenceMetricProps {
  evidence: ScoreEvidence;
  compact?: boolean;
  eventTime?: Date;
  now?: Date;
  timeZone?: string;
  privateSpot?: boolean;
}

export default function ConfidenceMetric({ evidence, compact = false, eventTime, now = new Date(), timeZone = 'UTC', privateSpot = false }: ConfidenceMetricProps) {
  const [open, setOpen] = useState(false);
  const [panelMaxHeight, setPanelMaxHeight] = useState<number>();
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const detailsId = useId();
  const label = evidence.confidence[0].toUpperCase() + evidence.confidence.slice(1);
  const filled = evidence.confidence === 'high' ? 3 : evidence.confidence === 'medium' ? 2 : 1;
  const windows = eventTime ? getConfidenceReviewTimes(eventTime) : null;
  const isFuture = eventTime && eventTime.getTime() > now.getTime();
  const formatReviewTime = (instant: Date) => {
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(instant);
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(instant);
    return `${day} · ${time}`;
  };

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      button.current?.focus({ preventScroll: true });
    };
    const resize = () => setPanelMaxHeight(Math.max(120, window.innerHeight - (root.current?.getBoundingClientRect().bottom ?? 0) - 24));
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', resize);
    };
  }, [open]);

  const explanation = privateSpot
    ? 'This roof is not calibrated yet, so its score stays at low confidence. These times are useful for checking the weather forecast again.'
    : evidence.state === 'loading'
      ? 'The forecast is loading. Confidence will update when weather data arrives.'
    : evidence.provenance !== 'forecast'
      ? 'This score uses an estimate because a weather forecast is unavailable.'
      : evidence.reason === 'missing-air-quality'
        ? 'Air-quality data is unavailable for this time. This approximate score uses the available weather and stays at low confidence. Smoke or haze could lower the score.'
        : evidence.completeness !== 'complete'
        ? 'Some forecast data is missing. Confidence can improve when a complete forecast is available.'
        : evidence.freshness === 'stale' || evidence.freshness === 'unknown'
          ? 'The forecast needs a fresh update before confidence can improve.'
          : 'Confidence reflects forecast freshness, complete weather data, and how close this time is.';

  return (
    <span
      ref={root}
      className="relative inline-flex font-mono text-gray-600"
      role="group"
      aria-label={`Forecast confidence: ${label}`}
      title={`Forecast confidence: ${label}`}
      data-contrast-audit="forecast-confidence"
    >
      <button ref={button} type="button" aria-label={`Forecast confidence: ${label}. Show details`}
        aria-expanded={open} aria-controls={open ? detailsId : undefined} onClick={() => {
          if (!open) setPanelMaxHeight(Math.max(120, window.innerHeight - (root.current?.getBoundingClientRect().bottom ?? 0) - 24));
          setOpen(!open);
        }}
        className="inline-flex min-h-11 min-w-11 justify-center items-center gap-1.5 rounded-lg px-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155561]">
      <svg width="18" height="18" viewBox="0 0 14 14" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <rect key={index} x={index * 4.5 + 1} y={9 - index * 3} width="3" height={4 + index * 3} rx="0.8" fill="currentColor" opacity={index < filled ? 1 : 0.2} />
        ))}
      </svg>
      {compact ? null : `${label} confidence`}
      </button>
      {open && (
        <span id={detailsId} role="region" aria-label="Forecast confidence details"
          style={{ maxHeight: panelMaxHeight }}
          className="absolute right-0 top-full z-50 block w-[min(18rem,calc(100vw-6rem))] overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 font-sans text-sm leading-relaxed text-gray-700 shadow-lg">
          <span className="block font-semibold text-gray-900">{label} confidence</span>
          <span className="mt-2 block">{explanation}</span>
          {windows && isFuture && (
            <span className="mt-3 block" data-confidence-windows>
              <span className="flex justify-between gap-2"><span>Medium window</span><span className="font-mono text-xs">{formatReviewTime(windows.medium)}</span></span>
              <span className="mt-2 flex justify-between gap-2"><span>High window</span><span className="font-mono text-xs">{formatReviewTime(windows.high)}</span></span>
              <span className="mt-3 block">Recheck during these windows with fresh, complete data. Weather can still change.</span>
            </span>
          )}
          <span className="mt-3 block text-xs">This is forecast confidence, not the probability of a colorful sky. Sunrise and sunset times are calculated separately.</span>
        </span>
      )}
    </span>
  );
}
