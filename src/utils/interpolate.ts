// Spatial interpolation + per-metric color ramps for the Weather mode
// heatmap. Pure functions — no DOM, no React.

export type WeatherMetric = 'temp' | 'clouds' | 'precip' | 'wind' | 'fog';

/**
 * Per-metric outlier thresholds. A neighborhood's value must deviate from
 * the city average by at least this much (in the metric's own units) to be
 * styled as an outlier (warm/cool color + delta badge) rather than dimmed.
 *
 * Tuned per the spec — temp 2°F, clouds/precip 15/10%, wind 2mph. Fog uses
 * the 0..1 density scale (~0.2 = roughly two steps on Foggy/Hazy/Clear).
 */
export const OUTLIER_THRESHOLD: Record<WeatherMetric, number> = {
  temp: 2,
  clouds: 15,
  precip: 10,
  wind: 2,
  fog: 0.2,
};

/**
 * Per-metric IDW power. Smaller values weight far samples more heavily,
 * giving softer / more diffuse gradients. Fog uses the lowest power so
 * the wash reads as atmospheric haze with no obvious "anchor centers"
 * around each neighborhood — Karl is supposed to feel like a continuous
 * sheet of marine layer, not a constellation of fog bubbles.
 */
export const METRIC_IDW_POWER: Record<WeatherMetric, number> = {
  temp: 1.1,
  clouds: 1.1,
  precip: 1.2,
  wind: 1.1,
  fog: 0.8,
};

/**
 * Per-metric overlay opacity (0..1) applied on top of the SF land mask.
 * The composite is then drawn with `mix-blend-mode: multiply`, so these
 * numbers tune *how dark* each layer's wash gets:
 *   - precip stays light so a dry-everywhere hour reads as basically the
 *     un-tinted basemap (the empty-state copy carries the rest of the load)
 *   - fog goes heavy because it's the signature layer — Karl is supposed
 *     to feel like he's actually sitting on the city
 *   - temp/wind/clouds sit in the middle so streets and parks still read
 *     through the gradient
 */
export const METRIC_OVERLAY_OPACITY: Record<WeatherMetric, number> = {
  temp: 0.45,
  clouds: 0.40,
  precip: 0.50,
  wind: 0.35,
  fog: 0.55,
};

export interface SamplePoint {
  lat: number;
  lng: number;
  value: number;
}

/**
 * Inverse-distance-weighting interpolation. Returns the weighted average of
 * `points`' values at the target lat/lng, using `1 / d^power` weights.
 *
 * Returns NaN if `points` is empty. If the target sits exactly on a sample
 * point we short-circuit to that value to avoid the 1/0 blowup.
 */
export function idw(
  points: ReadonlyArray<SamplePoint>,
  lat: number,
  lng: number,
  power = 2,
): number {
  if (points.length === 0) return NaN;

  let weightedSum = 0;
  let weightSum = 0;
  for (const p of points) {
    const dLat = p.lat - lat;
    const dLng = p.lng - lng;
    const distSq = dLat * dLat + dLng * dLng;
    if (distSq < 1e-10) return p.value;
    const w = 1 / Math.pow(distSq, power / 2);
    weightedSum += p.value * w;
    weightSum += w;
  }
  return weightSum === 0 ? NaN : weightedSum / weightSum;
}

export interface ColorStop {
  /** Position 0-1 along the ramp. */
  at: number;
  /** [r, g, b] 0-255. */
  rgb: [number, number, number];
}

export interface MetricRamp {
  min: number;
  max: number;
  stops: ColorStop[];
}

// Temperature: cool blue → near-neutral cream at city-average → warm amber.
// The brief asks for "average areas: neutral/transparent" so the multiply
// blend at the midpoint barely tints the basemap — this is what makes the
// outliers (the actual story) read first.
const TEMP_RAMP: MetricRamp = {
  min: 40,
  max: 95,
  stops: [
    { at: 0.0,  rgb: [80, 120, 200] },
    { at: 0.2,  rgb: [90, 190, 180] },
    { at: 0.35, rgb: [120, 200, 120] },
    { at: 0.5,  rgb: [240, 220, 100] },
    { at: 0.7,  rgb: [240, 160, 60] },
    { at: 0.85, rgb: [220, 80, 60] },
    { at: 1.0,  rgb: [180, 50, 100] },
  ],
};

// Clouds: subtle gray-blue wash. Gray-blue at heavy matches the brief
// `rgba(180,190,210,0.45)`; light/clear stays near-white so a clear sky
// looks like the un-tinted basemap.
const CLOUDS_RAMP: MetricRamp = {
  min: 0,
  max: 100,
  stops: [
    { at: 0.0, rgb: [255, 255, 255] },
    { at: 0.3, rgb: [245, 245, 245] },
    { at: 0.6, rgb: [220, 220, 225] },
    { at: 1.0, rgb: [180, 180, 190] },
  ],
};

const PRECIP_RAMP: MetricRamp = {
  min: 0,
  max: 100,
  stops: [
    { at: 0.0,  rgb: [245, 250, 245] },
    { at: 0.25, rgb: [130, 200, 130] },
    { at: 0.5,  rgb: [240, 210, 70] },
    { at: 0.75, rgb: [230, 130, 50] },
    { at: 1.0,  rgb: [200, 50, 50] },
  ],
};

// Wind: pale → warm orange. The brief calls for warm orange in windy
// areas; we drop the magenta tail so the gradient reads as "windier =
// hotter color" without veering into the precip palette.
const WIND_RAMP: MetricRamp = {
  min: 0,
  max: 30,
  stops: [
    { at: 0.0,  rgb: [250, 250, 255] },
    { at: 0.3,  rgb: [180, 220, 240] },
    { at: 0.6,  rgb: [100, 170, 220] },
    { at: 0.85, rgb: [70, 110, 190] },
    { at: 1.0,  rgb: [90, 60, 160] },
  ],
};

// Fog: muted gray-purple haze. The 0..1 density domain keeps the math
// simple (no need to renormalize from a 0..100 scale) and lets the ramp
// translate directly: 0 = clear, 1 = fully socked in.
const FOG_RAMP: MetricRamp = {
  min: 0,
  max: 1,
  stops: [
    { at: 0.0, rgb: [255, 255, 255] }, // clear (transparent after blend)
    { at: 0.45, rgb: [195, 195, 210] }, // hazy
    { at: 1.0, rgb: [150, 150, 170] },  // foggy
  ],
};

export const RAMPS: Record<WeatherMetric, MetricRamp> = {
  temp: TEMP_RAMP,
  clouds: CLOUDS_RAMP,
  precip: PRECIP_RAMP,
  wind: WIND_RAMP,
  fog: FOG_RAMP,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

/**
 * Map a metric value to its color ramp. Returns [r, g, b] 0-255.
 * Out-of-range values clamp to the nearest end stop.
 *
 * If `range` is provided, it overrides the metric's default min/max — used
 * for dynamic-range rendering so a 4degF spread across the city still
 * produces visually distinct colors. The default range is wider and tuned
 * for the absolute scale.
 */
export function colorRampFor(
  metric: WeatherMetric,
  value: number,
  range?: { min: number; max: number },
): [number, number, number] {
  const ramp = RAMPS[metric];
  if (!Number.isFinite(value)) return [200, 200, 200];

  const lo = range?.min ?? ramp.min;
  const hi = range?.max ?? ramp.max;
  const span = hi - lo;
  if (span <= 0) return ramp.stops[Math.floor(ramp.stops.length / 2)].rgb;
  const t = (value - lo) / span;
  if (t <= 0) return ramp.stops[0].rgb;
  if (t >= 1) return ramp.stops[ramp.stops.length - 1].rgb;

  for (let i = 0; i < ramp.stops.length - 1; i++) {
    const a = ramp.stops[i];
    const b = ramp.stops[i + 1];
    if (t >= a.at && t <= b.at) {
      const stopSpan = b.at - a.at;
      const localT = stopSpan === 0 ? 0 : (t - a.at) / stopSpan;
      return lerpRgb(a.rgb, b.rgb, localT);
    }
  }
  return ramp.stops[ramp.stops.length - 1].rgb;
}

// Minimum data span per metric, in the metric's own units. Without this,
// flat conditions (e.g. SF holding 54degF citywide) would compress to a
// single color and hide whatever differences do exist.
const MIN_SPAN: Record<WeatherMetric, number> = {
  temp: 6,
  clouds: 20,
  precip: 15,
  wind: 6,
  // Fog density is 0..1; a 0.3 minimum span keeps the ramp from collapsing
  // when the entire city is e.g. moderately hazy.
  fog: 0.3,
};

/**
 * Compute a dynamic color-ramp range for the current set of sample values.
 * Centers the ramp on the actual data, expanding to at least `MIN_SPAN`
 * units so a tight value cluster still shows visible color variation.
 *
 * Returns null when there are no finite samples to range over (the caller
 * should fall back to the metric's default range).
 */
export function computeDynamicRange(
  metric: WeatherMetric,
  values: ReadonlyArray<number>,
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) return null;

  const span = max - min;
  const required = MIN_SPAN[metric];
  if (span >= required) return { min, max };

  // Expand symmetrically around the data midpoint.
  const mid = (min + max) / 2;
  const half = required / 2;
  let lo = mid - half;
  let hi = mid + half;

  // Metrics with a natural floor of 0 (everything except temp) should never
  // produce a negative range — doing so pushes actual-zero values into the
  // middle of the ramp, making dry/calm conditions look alarming.
  if (metric !== 'temp' && lo < 0) {
    hi -= lo;
    lo = 0;
  }

  return { min: lo, max: hi };
}

/** Format a metric value for the neighborhood label. */
export function formatMetricValue(metric: WeatherMetric, value: number): string {
  if (!Number.isFinite(value)) return '–';
  switch (metric) {
    case 'temp':
      return `${Math.round(value)}`;
    case 'clouds':
    case 'precip':
      return `${Math.round(value)}%`;
    case 'wind':
      return `${Math.round(value)}`;
    case 'fog':
      // Fog labels render words (Foggy/Hazy/Clear) at the call site, so the
      // numeric formatter is only used for debug/legend hover.
      return `${Math.round(value * 100)}`;
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled metric: ${String(_exhaustive)}`);
    }
  }
}

/** Short unit label for the metric, shown e.g. in the controls panel. */
export function metricUnit(metric: WeatherMetric): string {
  switch (metric) {
    case 'temp':
      return '°F';
    case 'clouds':
      return '% cloud';
    case 'precip':
      return '% precip';
    case 'wind':
      return 'mph';
    case 'fog':
      return 'fog';
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled metric: ${String(_exhaustive)}`);
    }
  }
}

export function metricLabel(metric: WeatherMetric): string {
  switch (metric) {
    case 'temp':
      return 'Temp';
    case 'clouds':
      return 'Clouds';
    case 'precip':
      return 'Precip';
    case 'wind':
      return 'Wind';
    case 'fog':
      return 'Fog';
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled metric: ${String(_exhaustive)}`);
    }
  }
}
