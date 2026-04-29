// Fog expanded sheet. Layout (top → bottom):
//
//   1. Karl's status hero: a single descriptor ("Creeping in", "Lifting",
//      "Settled in", "Clear") with a one-liner about the geography.
//   2. West → East fog forecast strip: 7 hand-picked neighborhoods on
//      the SF fog gradient, color-coded by current state with an ETA
//      below for the ones Karl hasn't reached yet.
//   3. Karl quote card.

import { useMemo } from 'react';
import { neighborhoods, type Neighborhood } from '../../data/neighborhoods';
import { type SpotForecast, fogDensity } from '../../utils/weather';
import { KarlQuoteCard, SectionLabel } from './shared';
import { HOURLY_STRIP_LENGTH, shortHourLabel } from './utils';

interface FogExpandedProps {
  hourKey: string;
  hourKeys: string[];
  forecasts: Map<number, SpotForecast>;
  longForm: string;
}

const FOG_COLOR = 'var(--color-amber-warm)';

const FOG_THRESHOLD = 0.5; // density above this counts as "fogged in"
const HAZE_THRESHOLD = 0.3;

const STATE_COLORS = {
  fog: 'var(--color-pin-poor)',
  incoming: 'var(--color-amber-warm)',
  clear: 'var(--color-pin-great)',
} as const;

// Hand-picked west-to-east SF transect that mirrors how Karl actually
// moves: ocean-side neighborhoods enter the fog first, downtown last.
// Names match `neighborhoods.ts` so the lookup is exact.
const TRANSECT_NAMES = [
  'Outer Richmond',
  'Sunset',
  'Inner Richmond',
  'Presidio',
  'Marina',
  'Mission',
  'Downtown',
] as const;

type FogState = 'fog' | 'incoming' | 'clear';

interface CellState {
  neighborhood: Neighborhood;
  state: FogState;
  /** Hour-key the fog arrives — set only when state === 'incoming'. */
  arrivalKey: string | null;
}

export default function FogExpanded({
  hourKey,
  hourKeys,
  forecasts,
  longForm,
}: FogExpandedProps) {
  const cells = useMemo(
    () => buildTransect(hourKey, hourKeys, forecasts),
    [hourKey, hourKeys, forecasts],
  );

  const status = useMemo(
    () => karlStatus(hourKey, hourKeys, forecasts),
    [hourKey, hourKeys, forecasts],
  );

  return (
    <div className="px-4 pt-3 pb-4 space-y-4">
      <section className="text-center">
        <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-gray-500">
          Karl's status
        </p>
        <p
          className="mt-1.5 text-[28px] leading-tight font-light"
          style={{ color: FOG_COLOR }}
        >
          {status.headline}
        </p>
        {status.subtitle && (
          <p className="mt-1.5 text-[13px] text-[#5a5a55]">{status.subtitle}</p>
        )}
      </section>

      <section>
        <SectionLabel>West → East fog forecast</SectionLabel>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {cells.map((cell) => (
            <FogCell key={cell.neighborhood.id} cell={cell} />
          ))}
        </div>
      </section>

      <KarlQuoteCard text={longForm} accent={FOG_COLOR} />
    </div>
  );
}

// --- transect cell --------------------------------------------------------

function FogCell({ cell }: { cell: CellState }) {
  const dotColor = STATE_COLORS[cell.state];
  // Background tint takes a hint from the dot color but stays subtle so
  // adjacent cells in different states still feel like a row, not a
  // collection of unrelated chips.
  const bgClass =
    cell.state === 'fog'
      ? 'bg-[#B07A7A]/10'
      : cell.state === 'incoming'
        ? 'bg-[#D97706]/10'
        : 'bg-[#5B9A7B]/10';
  const eta = etaLabel(cell);
  return (
    <div className={`rounded-md ${bgClass} px-1 py-2 flex flex-col items-center text-center min-w-0`}>
      <span
        aria-hidden="true"
        className="block w-1.5 h-1.5 rounded-full"
        style={{ background: dotColor }}
      />
      <span className="mt-1.5 text-[10.5px] leading-tight font-medium text-[#1a1a18] line-clamp-2">
        {cell.neighborhood.name}
      </span>
      {eta && (
        <span className="mt-0.5 text-[9px] text-gray-500">{eta}</span>
      )}
    </div>
  );
}

function etaLabel(cell: CellState): string {
  switch (cell.state) {
    case 'fog':
      return 'now';
    case 'incoming':
      return cell.arrivalKey ? `~${shortHourLabel(cell.arrivalKey)}` : 'soon';
    case 'clear':
      return '—';
  }
}

// --- data wrangling -------------------------------------------------------

/**
 * Build the west→east cell array. For each neighborhood on the
 * transect: read its current fog density; if it's above threshold,
 * mark `fog`; otherwise scan forward up to 12 hours for the first
 * crossing into fog and mark `incoming` with that ETA. Anything that
 * never crosses stays `clear`.
 */
function buildTransect(
  hourKey: string,
  hourKeys: string[],
  forecasts: Map<number, SpotForecast>,
): CellState[] {
  const startIdx = hourKey ? Math.max(0, hourKeys.indexOf(hourKey)) : 0;
  const endIdx = Math.min(hourKeys.length, startIdx + HOURLY_STRIP_LENGTH);

  return TRANSECT_NAMES.map((name) => {
    const n = neighborhoods.find((nb) => nb.name === name);
    // Defensive: if a transect name disappears from the data we still
    // want the row to render rather than crash. The placeholder row is
    // marked clear with no ETA so it visually fades.
    if (!n) {
      return {
        neighborhood: { id: -1, name, lat: 0, lng: 0 },
        state: 'clear' as FogState,
        arrivalKey: null,
      };
    }
    const f = forecasts.get(n.id);
    if (!f || !hourKey) {
      return { neighborhood: n, state: 'clear' as FogState, arrivalKey: null };
    }
    const head = f.hours[hourKey];
    const headDensity = head ? fogDensity(head) : NaN;
    if (Number.isFinite(headDensity) && headDensity >= FOG_THRESHOLD) {
      return { neighborhood: n, state: 'fog', arrivalKey: null };
    }
    for (let i = startIdx + 1; i < endIdx; i++) {
      const h = f.hours[hourKeys[i]];
      if (!h) continue;
      if (fogDensity(h) >= FOG_THRESHOLD) {
        return {
          neighborhood: n,
          state: 'incoming',
          arrivalKey: hourKeys[i],
        };
      }
    }
    return { neighborhood: n, state: 'clear', arrivalKey: null };
  });
}

interface KarlStatus {
  headline: string;
  subtitle: string;
}

/**
 * Pick Karl's headline + subtitle from the citywide fog series:
 *
 *   * Trough ≥ ~0.6        → "Settled in" (already socked in everywhere)
 *   * Trend up & wet later → "Creeping in" (incoming from the Gate)
 *   * Trend down           → "Lifting" (Karl easing off)
 *   * Otherwise            → "Patchy" / "Clear" depending on level
 */
function karlStatus(
  hourKey: string,
  hourKeys: string[],
  forecasts: Map<number, SpotForecast>,
): KarlStatus {
  if (!hourKey || hourKeys.length === 0) {
    return { headline: 'Loading…', subtitle: '' };
  }
  const startIdx = Math.max(0, hourKeys.indexOf(hourKey));
  const endIdx = Math.min(hourKeys.length, startIdx + HOURLY_STRIP_LENGTH);
  const series: number[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    let sum = 0;
    let count = 0;
    for (const n of neighborhoods) {
      const f = forecasts.get(n.id);
      const h = f?.hours[hourKeys[i]];
      if (!h) continue;
      sum += fogDensity(h);
      count += 1;
    }
    if (count > 0) series.push(sum / count);
  }
  if (series.length === 0) return { headline: 'Loading…', subtitle: '' };

  const head = series[0];
  const tail = series[series.length - 1];
  const peak = Math.max(...series);

  // East-side check feeds the geography line — if the east half stays
  // clear we can confidently say "still clear east", otherwise we keep
  // it generic so we don't promise something the model doesn't show.
  const eastClear = isEastClear(hourKey, forecasts);

  if (head >= 0.6 && tail >= 0.5) {
    return {
      headline: 'Settled in',
      subtitle: 'Karl is parked over the city for the night.',
    };
  }
  if (head < HAZE_THRESHOLD && peak >= FOG_THRESHOLD) {
    return {
      headline: 'Creeping in',
      subtitle: 'From the Gate, heading east through Richmond',
    };
  }
  if (head >= FOG_THRESHOLD && tail < HAZE_THRESHOLD) {
    return {
      headline: 'Lifting',
      subtitle: 'Karl is loosening his grip — east side clears first.',
    };
  }
  if (head < HAZE_THRESHOLD && peak < HAZE_THRESHOLD) {
    return {
      headline: 'Clear',
      subtitle: 'Karl is sitting this one out — clean lines all over.',
    };
  }
  return {
    headline: 'Patchy',
    subtitle: eastClear
      ? 'Fog hugging the coast, east side staying clear.'
      : 'Mixed coverage across the city — check your block.',
  };
}

function isEastClear(hourKey: string, forecasts: Map<number, SpotForecast>): boolean {
  let sum = 0;
  let count = 0;
  for (const n of neighborhoods) {
    if (n.lng < -122.42) continue; // east half only
    const f = forecasts.get(n.id);
    const h = f?.hours[hourKey];
    if (!h) continue;
    sum += fogDensity(h);
    count += 1;
  }
  if (count === 0) return false;
  return sum / count < HAZE_THRESHOLD;
}
