import { useEffect, useMemo, useRef, useState } from 'react';
import { type SpotForecast } from '../utils/weather';
import { type WeatherMetric } from '../utils/interpolate';
import { buildSamples, buildWindDirs, offsetHourKey } from '../utils/weatherSamples';
import { narrativeFor, type InsightCopy } from '../utils/narrative';

interface InsightCardProps {
  metric: WeatherMetric;
  hourKey: string;
  hourKeys: string[];
  forecasts: Map<number, SpotForecast>;
}

const EMPTY_COPY: InsightCopy = { main: '', sub: '' };

/**
 * Floating "Karl narrates the weather" card pinned just below the safe-area
 * top inset. The copy is a pure function of (metric, hourKey, samples), so
 * scrubbing the time slider regenerates it for free.
 *
 * Two stacked layers crossfade on copy change so the narrative swaps
 * without a content jump — the layout stays steady (no height animation),
 * just the text swaps via a 150ms opacity transition.
 */
export default function InsightCard({
  metric,
  hourKey,
  hourKeys,
  forecasts,
}: InsightCardProps) {
  const copy = useMemo<InsightCopy>(() => {
    if (!hourKey || forecasts.size === 0) return EMPTY_COPY;
    const samples = buildSamples(metric, hourKey, forecasts);
    const prevKey = offsetHourKey(hourKeys, hourKey, -1);
    const prevSamples = prevKey ? buildSamples(metric, prevKey, forecasts) : null;
    const windDirs = metric === 'wind' ? buildWindDirs(hourKey, forecasts) : undefined;
    return narrativeFor(metric, samples, prevSamples, windDirs);
  }, [metric, hourKey, hourKeys, forecasts]);

  const displayed = useCrossfadeCopy(copy);

  if (!displayed.current.main && !displayed.previous.main) return null;

  return (
    <div
      className="absolute left-3 right-3 z-10 rounded-xl border-[0.5px] border-black/[0.08] bg-[rgba(250,250,248,0.95)] px-3.5 py-2.5 shadow-sm pointer-events-none"
      style={{
        top: 'calc(env(safe-area-inset-top) + 4rem)',
      }}
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        <CopyLayer copy={displayed.previous} fading />
        <CopyLayer copy={displayed.current} />
      </div>
    </div>
  );
}

interface CopyLayerProps {
  copy: InsightCopy;
  fading?: boolean;
}

/**
 * One pass of (main + sub) text. The "current" instance sits in normal flow
 * and gets a fade-in; the "previous" sits absolutely on top of it during
 * the 150ms crossfade window so the swap reads as a smooth dissolve.
 */
function CopyLayer({ copy, fading = false }: CopyLayerProps) {
  return (
    <div
      style={{
        position: fading ? 'absolute' : 'relative',
        inset: fading ? '0 0 auto 0' : undefined,
        opacity: fading ? 0 : 1,
        transition: 'opacity 150ms ease',
      }}
      aria-hidden={fading}
    >
      <div
        className="font-serif text-[#1a1a18]"
        style={{
          fontSize: '13.5px',
          fontWeight: 500,
          lineHeight: 1.25,
          letterSpacing: '-0.1px',
        }}
      >
        {copy.main || '\u00a0'}
      </div>
      <div
        className="font-serif italic text-[#6b6b65]"
        style={{
          fontSize: '12px',
          lineHeight: 1.35,
          marginTop: '2px',
        }}
      >
        {copy.sub || '\u00a0'}
      </div>
    </div>
  );
}

interface CrossfadeState {
  current: InsightCopy;
  previous: InsightCopy;
}

/**
 * Hold onto the previous copy for one render after `copy` changes so the
 * card can crossfade. Resolves the "previous" snapshot back to empty after
 * the transition window so we don't leak stale text into accessibility
 * trees indefinitely.
 */
function useCrossfadeCopy(copy: InsightCopy): CrossfadeState {
  const [state, setState] = useState<CrossfadeState>(() => ({
    current: copy,
    previous: EMPTY_COPY,
  }));
  const lastRef = useRef<InsightCopy>(copy);

  useEffect(() => {
    if (
      copy.main === lastRef.current.main &&
      copy.sub === lastRef.current.sub
    ) {
      return;
    }
    setState({ current: copy, previous: lastRef.current });
    lastRef.current = copy;
    const t = window.setTimeout(() => {
      setState((s) => ({ current: s.current, previous: EMPTY_COPY }));
    }, 180);
    return () => window.clearTimeout(t);
  }, [copy]);

  return state;
}
