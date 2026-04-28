// Insight-card copy generators. Pure functions of the current city stats
// (and optionally the prior hour's, to detect "intensifying" / "creeping
// in" / "arriving" phrasing).
//
// Per-metric branches return both a main line (the bold summary stat) and
// a sub line (the italic narrative). Karl gets his own voice on the fog
// branch — the rest stay matter-of-fact.

import { neighborhoods } from '../data/neighborhoods';
import { type SamplePoint, type WeatherMetric } from './interpolate';
import { computeCityStats, type CityStats } from './labelStats';

export interface InsightCopy {
  main: string;
  sub: string;
}

const EMPTY: InsightCopy = { main: '–', sub: 'Loading forecast…' };

export function narrativeFor(
  metric: WeatherMetric,
  samples: Map<number, SamplePoint>,
  prev: Map<number, SamplePoint> | null,
  windDirs?: Map<number, number>,
): InsightCopy {
  if (samples.size === 0) return EMPTY;
  const stats = computeCityStats(samples);
  const prevStats = prev ? computeCityStats(prev) : null;

  switch (metric) {
    case 'temp':
      return tempCopy(stats, samples, prevStats);
    case 'clouds':
      return cloudsCopy(stats, samples);
    case 'precip':
      return precipCopy(stats, samples, prevStats);
    case 'wind':
      return windCopy(stats, samples, windDirs ?? new Map());
    case 'fog':
      return fogCopy(stats, samples, prevStats);
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled metric: ${String(_exhaustive)}`);
    }
  }
}

// --- per-metric copy branches ---------------------------------------------

function tempCopy(
  stats: CityStats,
  samples: Map<number, SamplePoint>,
  prev: CityStats | null,
): InsightCopy {
  const avg = Math.round(stats.avg);
  const hi = Math.round(stats.max);
  const lo = Math.round(stats.min);
  const main = `${avg}° avg · H: ${hi}° L: ${lo}°`;

  const coldest = nameFor(samples, stats.lowId);
  const hottest = nameFor(samples, stats.highId);
  const spread = Math.round(stats.spread);

  let sub: string;
  if (spread <= 2) {
    sub = `Even temps citywide — barely a degree between ${coldest} and ${hottest}.`;
  } else if (prev && stats.spread - prev.spread > 2) {
    // Microclimates intensifying.
    sub = `Microclimates intensifying — ${spread}° spread by ${hi > avg + spread / 2 ? hottest : coldest}.`;
  } else if (lo < 50) {
    sub = `${spread}° spread across the city. ${coldest} is coldest — bundle up heading west.`;
  } else if (hi >= 80) {
    sub = `${spread}° spread. ${hottest} running hot — east side keeps the heat.`;
  } else {
    sub = `${spread}° spread across the city. ${coldest} cooler, ${hottest} warmer.`;
  }
  return { main, sub };
}

function cloudsCopy(stats: CityStats, samples: Map<number, SamplePoint>): InsightCopy {
  const avg = Math.round(stats.avg);
  const main = `Avg ${avg}% cloud cover`;

  if (avg >= 85) {
    return { main, sub: 'Solid overcast across the city. No breaks tonight.' };
  }
  if (avg <= 10) {
    return { main, sub: 'Clear skies citywide — rare night.' };
  }
  // Cloudy-where vs clear-where narrative — split by north/south split since
  // SF's marine layer normally pushes from the NW.
  const cloudy = nameFor(samples, stats.highId);
  const clear = nameFor(samples, stats.lowId);
  if (stats.spread >= 30) {
    return {
      main,
      sub: `Cloudy around ${cloudy}, clearing toward ${clear}.`,
    };
  }
  return { main, sub: `Mixed cover. ${cloudy} thickest, ${clear} thinnest.` };
}

function precipCopy(
  stats: CityStats,
  samples: Map<number, SamplePoint>,
  prev: CityStats | null,
): InsightCopy {
  const max = Math.round(stats.max);
  if (max <= 1) {
    return {
      main: 'No rain tonight',
      sub: 'Dry across the entire city through morning.',
    };
  }
  if (max < 20) {
    const wettest = nameFor(samples, stats.highId);
    return {
      main: `Light chance — peak ${max}%`,
      sub: `Slim odds. ${wettest} the most likely to see anything.`,
    };
  }
  const wettest = nameFor(samples, stats.highId);
  if (prev && stats.max - prev.max > 15) {
    return {
      main: `Light rain in spots — peak ${max}%`,
      sub: `${wettest} getting wet. Spreading east over the next few hours.`,
    };
  }
  return {
    main: `Rain in spots — peak ${max}%`,
    sub: `${wettest} taking the brunt. Carry a jacket.`,
  };
}

function windCopy(
  stats: CityStats,
  samples: Map<number, SamplePoint>,
  windDirs: Map<number, number>,
): InsightCopy {
  const avg = Math.round(stats.avg);
  const dir = dominantDirection(samples, windDirs);
  const dirPhrase = dir ? ` from the ${dir.toLowerCase()}` : '';
  const main = `Avg ${avg} mph${dirPhrase}`;

  if (avg <= 4) {
    return { main, sub: 'Calm citywide — flag-on-flagpole weather.' };
  }
  if (stats.spread >= 8) {
    const windy = nameFor(samples, stats.highId);
    const calm = nameFor(samples, stats.lowId);
    return { main, sub: `Breezy at ${windy}. Calm around ${calm}.` };
  }
  if (avg >= 14) {
    return { main, sub: 'Whitecap-on-the-bay kind of night. Hold your hat.' };
  }
  return { main, sub: 'Steady breeze citywide.' };
}

function fogCopy(
  stats: CityStats,
  samples: Map<number, SamplePoint>,
  prev: CityStats | null,
): InsightCopy {
  // Karl's voice. The four states map roughly to:
  //   no fog anywhere → "went home"
  //   fog growing       → "creeping in from the Gate"
  //   fog steady high   → "settled in for the night"
  //   fog receding      → "loosening his grip"
  const avg = stats.avg;
  const max = stats.max;
  const trend = prev ? avg - prev.avg : 0;

  if (max < 0.2) {
    return {
      main: 'Karl went home',
      sub: 'Clear across the city. Rare night — enjoy it.',
    };
  }
  if (avg >= 0.6) {
    const foggy = westSideName(samples) ?? nameFor(samples, stats.highId);
    return {
      main: "Karl's settled in for the night",
      sub: `${foggy} socked in. Don't bother heading west.`,
    };
  }
  if (trend > 0.1) {
    const next = nameFor(samples, stats.highId);
    return {
      main: "Karl's creeping in from the Gate",
      sub: `${next} fogging up. East side still clear for now.`,
    };
  }
  if (trend < -0.1) {
    return {
      main: "Karl's loosening his grip",
      sub: `${nameFor(samples, stats.lowId)} cleared up. Rest of the city next.`,
    };
  }
  // Steady mixed state.
  const foggy = nameFor(samples, stats.highId);
  const clear = nameFor(samples, stats.lowId);
  return {
    main: 'Karl is choosy tonight',
    sub: `${foggy} fogged in. ${clear} clear.`,
  };
}

// --- long-form variants for the expanded sheet ----------------------------

/**
 * Longer-form Karl commentary used in the expanded bottom sheet. Same
 * inputs as `narrativeFor` — returns 2-3 sentences instead of a one-liner.
 */
export function longFormFor(
  metric: WeatherMetric,
  samples: Map<number, SamplePoint>,
  prev: Map<number, SamplePoint> | null,
  windDirs?: Map<number, number>,
): string {
  const short = narrativeFor(metric, samples, prev, windDirs);
  const stats = computeCityStats(samples);

  switch (metric) {
    case 'temp': {
      const hot = nameFor(samples, stats.highId);
      const cold = nameFor(samples, stats.lowId);
      return `${short.sub} Plan accordingly: ${cold} is the spot to skip if you're underdressed, ${hot} for anyone chasing warmth.`;
    }
    case 'clouds':
      return `${short.sub} Cloud cover shifts hour-to-hour — scrub forward to see when the deck breaks.`;
    case 'precip':
      if (stats.max <= 1) {
        return 'Bone dry across every neighborhood. No precip in the model through morning — leave the umbrella at home.';
      }
      return `${short.sub} Best window for staying dry is wherever the gradient stays light blue.`;
    case 'wind': {
      const windy = nameFor(samples, stats.highId);
      return `${short.sub} ${windy} is the most exposed — if you're heading there bring a layer that won't flap.`;
    }
    case 'fog':
      return `${short.sub} Karl tends to push east as the night cools and pull back by mid-morning. Use the scrubber to see when he hits your block.`;
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled metric: ${String(_exhaustive)}`);
    }
  }
}

// --- helpers --------------------------------------------------------------

function nameFor(_samples: Map<number, SamplePoint>, id: number): string {
  if (id < 0) return 'somewhere';
  // The samples arg is kept for symmetry / future per-sample lookups even
  // though today we resolve names purely from the neighborhoods constant.
  const n = neighborhoods.find((nb) => nb.id === id);
  return n?.name ?? 'somewhere';
}

function westSideName(samples: Map<number, SamplePoint>): string | null {
  // Pick the foggiest west-side neighborhood for the "Karl settled in"
  // line. West side = lng < -122.46.
  let best: { id: number; value: number } | null = null;
  for (const [id, s] of samples) {
    if (s.lng > -122.46) continue;
    if (!Number.isFinite(s.value)) continue;
    if (!best || s.value > best.value) best = { id, value: s.value };
  }
  return best ? nameFor(samples, best.id) : null;
}

/**
 * Speed-weighted circular mean of wind direction vectors. Returns the
 * nearest cardinal abbreviation (N/NE/E/...) or null if there's no usable
 * wind data. Calm samples (<2 mph) drop out so a single windy outlier
 * doesn't get drowned by 20 calm zeros.
 */
function dominantDirection(
  speeds: Map<number, SamplePoint>,
  windDirs: Map<number, number>,
): string | null {
  let sx = 0;
  let sy = 0;
  let total = 0;
  for (const [id, s] of speeds) {
    const dir = windDirs.get(id);
    if (dir === undefined || !Number.isFinite(dir)) continue;
    if (s.value < 2) continue;
    // Met convention: dir is the angle the wind is *coming from*. Convert
    // to vector components and weight by speed.
    const rad = (dir * Math.PI) / 180;
    sx += Math.sin(rad) * s.value;
    sy += Math.cos(rad) * s.value;
    total += 1;
  }
  if (total === 0) return null;
  const meanRad = Math.atan2(sx, sy);
  let deg = (meanRad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  const bins = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return bins[Math.round(deg / 45) % 8];
}
