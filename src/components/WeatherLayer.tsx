import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L, { type LatLngBoundsExpression } from 'leaflet';
import { neighborhoods } from '../data/neighborhoods';
import { SF_OUTLINE } from '../data/sf-outline';
import { type SpotForecast } from '../utils/weather';
import {
  colorRampFor,
  computeDynamicRange,
  formatMetricValue,
  idw,
  METRIC_IDW_POWER,
  METRIC_OVERLAY_OPACITY,
  type SamplePoint,
  type WeatherMetric,
} from '../utils/interpolate';
import {
  classifyLabel,
  computeCityStats,
  pickLabelsForZoom,
  windDirToAbbr,
  type CityStats,
  type LabelCandidate,
} from '../utils/labelStats';
import { buildSamples, buildWindDirs } from '../utils/weatherSamples';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';

// SF heatmap canvas bounds. Sized to comfortably contain the SF land
// polygon plus a few hundred meters of ocean/bay padding so the soft mask
// edge has room to fade. The visible shape is controlled by the SF mask
// inside `rasterize`, not by this rectangle.
//
// Bounds extend a touch past the easternmost (Hunters Point peninsula) and
// northernmost (breakwater) polygon vertices so the MASK_BLUR_PX halo
// fades cleanly into transparency instead of being clipped by the canvas
// edge — clipping there would re-introduce a hard line right where we're
// trying to soften the coastline.
const HEATMAP_BOUNDS: { south: number; west: number; north: number; east: number } = {
  south: 37.698,
  west: -122.524,
  north: 37.825,
  east: -122.346,
};

const HEATMAP_LEAFLET_BOUNDS: LatLngBoundsExpression = [
  [HEATMAP_BOUNDS.south, HEATMAP_BOUNDS.west],
  [HEATMAP_BOUNDS.north, HEATMAP_BOUNDS.east],
];

// Canvas raster resolution. 240x240 gives the SF coastline mask enough
// pixels to render smoothly without obvious staircasing at typical zooms.
const RASTER_W = 240;
const RASTER_H = 240;

// Coastline softness — pixels of gaussian-style blur applied when rendering
// the SF mask. A wider blur:
//   - feathers the city edge so the south county line and other straight
//     segments don't read as a hard cut
//   - lets the colored field bleed slightly past the polygon, naturally
//     covering piers / Hunters Point peninsula / Embarcadero waterfront
//     without us having to trace every cove in the outline
const MASK_BLUR_PX = 9;

// Inserted once per process — defines the crossfade transition AND the
// blend mode for the double-buffered overlays. `multiply` makes the
// gradient feel like it's part of the basemap (roads, parks, and
// topography show through tinted by temperature/clouds/etc) instead of a
// flat sticker on top. Doing it from JS keeps the layer self-contained.
//
// Fog crossfades noticeably slower than the other metrics because the
// brief asks for the layer to "animate like fog actually rolling across
// the city" — a long opacity ease + smoother IDW power makes one hour of
// scrub feel like the marine layer drifting in, not a static frame swap.
const TRANSITION_STYLE_ID = 'weather-overlay-style';
const TRANSITION_MS_DEFAULT = 280;
const TRANSITION_MS_FOG = 600;
function ensureTransitionStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(TRANSITION_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = TRANSITION_STYLE_ID;
  style.textContent = `.weather-overlay {
    transition: opacity ${TRANSITION_MS_DEFAULT}ms ease-out;
    will-change: opacity;
    mix-blend-mode: multiply;
  }
  .weather-overlay.is-fog {
    transition: opacity ${TRANSITION_MS_FOG}ms cubic-bezier(0.4, 0.0, 0.4, 1);
  }`;
  document.head.appendChild(style);
}

function applyFogClass(overlay: L.ImageOverlay, isFog: boolean): void {
  const el = overlay.getElement() as HTMLImageElement | null;
  if (!el) return;
  el.classList.toggle('is-fog', isFog);
}

interface WeatherLayerProps {
  metric: WeatherMetric;
  /** ISO hour key ("YYYY-MM-DDTHH") to render. Empty string = no render yet. */
  hourKey: string;
  forecasts: Map<number, SpotForecast>;
}

export default function WeatherLayer({ metric, hourKey, forecasts }: WeatherLayerProps) {
  const samples = useMemo(
    () => buildSamples(metric, hourKey, forecasts),
    [metric, hourKey, forecasts],
  );
  // Wind direction lives outside `SamplePoint` (which is metric-agnostic) so
  // we build a side map only when the wind layer is active. Empty for every
  // other metric — SmartLabel ignores it.
  const windDirs = useMemo(
    () => (metric === 'wind' ? buildWindDirs(hourKey, forecasts) : new Map<number, number>()),
    [metric, hourKey, forecasts],
  );
  const cityStats = useMemo(() => computeCityStats(samples), [samples]);

  return (
    <>
      <HeatmapOverlay metric={metric} samples={samples} />
      <WeatherLabelsLayer
        metric={metric}
        samples={samples}
        cityStats={cityStats}
        windDirs={windDirs}
      />
    </>
  );
}

/**
 * Subscribe to the leaflet map's zoom level. Updates on `zoomend` only —
 * intermediate values during pinch/scroll would force a label-icon rebuild
 * on every animation frame, which leaflet does not enjoy.
 */
function useMapZoom(): number {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useEffect(() => {
    const handler = () => setZoom(map.getZoom());
    map.on('zoomend', handler);
    return () => {
      map.off('zoomend', handler);
    };
  }, [map]);
  return zoom;
}

interface HeatmapOverlayProps {
  metric: WeatherMetric;
  samples: Map<number, SamplePoint>;
}

/**
 * Renders the gradient with two leaflet image overlays acting as a swap
 * chain. When the metric or hour changes:
 *  1. We rasterize the next frame on the back buffer.
 *  2. Once the resulting <img> has decoded, we crossfade opacity (back -> 1,
 *     front -> 0) using the CSS transition installed at module load.
 *  3. The buffers swap roles for the next update.
 *
 * Rasterization itself is rAF-throttled so that scrubbing the time slider
 * fast doesn't queue up dozens of intermediate frames — only the latest
 * pending raster gets rendered per animation frame.
 */
function HeatmapOverlay({ metric, samples }: HeatmapOverlayProps) {
  const map = useMap();
  const overlaysRef = useRef<{ a: L.ImageOverlay; b: L.ImageOverlay } | null>(null);
  // 0 = "a" is currently visible, 1 = "b" is currently visible.
  const visibleRef = useRef<0 | 1>(0);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ metric: WeatherMetric; samples: SamplePoint[] } | null>(null);

  useEffect(() => {
    ensureTransitionStyles();
    const a = L.imageOverlay('', HEATMAP_LEAFLET_BOUNDS, {
      opacity: 0,
      interactive: false,
      pane: 'overlayPane',
      className: 'weather-overlay',
    });
    const b = L.imageOverlay('', HEATMAP_LEAFLET_BOUNDS, {
      opacity: 0,
      interactive: false,
      pane: 'overlayPane',
      className: 'weather-overlay',
    });
    a.addTo(map);
    b.addTo(map);
    overlaysRef.current = { a, b };
    visibleRef.current = 0;
    return () => {
      a.remove();
      b.remove();
      overlaysRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      pendingRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!overlaysRef.current) return;
    if (samples.size === 0) {
      // Fade everything out without drawing — typical when forecasts are
      // still loading on first paint or when the user lands on an hour
      // before any neighborhood resolves.
      overlaysRef.current.a.setOpacity(0);
      overlaysRef.current.b.setOpacity(0);
      return;
    }

    pendingRef.current = { metric, samples: Array.from(samples.values()) };
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const job = pendingRef.current;
      pendingRef.current = null;
      const overlays = overlaysRef.current;
      if (!job || !overlays) return;

      const url = rasterize(job.metric, job.samples);
      const targetOpacity = METRIC_OVERLAY_OPACITY[job.metric];
      const isFog = job.metric === 'fog';
      const front = visibleRef.current === 0 ? overlays.a : overlays.b;
      const back = visibleRef.current === 0 ? overlays.b : overlays.a;

      // Sync the fog class on both buffers — both images carry the same
      // transition duration so neither side snaps while the other eases.
      applyFogClass(overlays.a, isFog);
      applyFogClass(overlays.b, isFog);

      // Pre-decode the new image so the swap is flicker-free. We rely on
      // the <img> ref leaflet exposes via getElement(); on first call it
      // may be null until the layer is fully attached.
      const swap = () => {
        back.setOpacity(targetOpacity);
        front.setOpacity(0);
        visibleRef.current = visibleRef.current === 0 ? 1 : 0;
      };

      const imgEl = back.getElement() as HTMLImageElement | null;
      if (imgEl) {
        // Once the new src has loaded into the back buffer, crossfade.
        const handleLoad = () => {
          imgEl.removeEventListener('load', handleLoad);
          swap();
        };
        imgEl.addEventListener('load', handleLoad, { once: true });
        back.setUrl(url);
      } else {
        // First frame: no <img> yet, just paint and show immediately.
        back.setUrl(url);
        swap();
      }
    });
  }, [metric, samples]);

  return null;
}

interface WeatherLabelsLayerProps {
  metric: WeatherMetric;
  samples: Map<number, SamplePoint>;
  cityStats: CityStats;
  windDirs: Map<number, number>;
}

/**
 * Renders the smart neighborhood labels as React-owned absolutely-positioned
 * divs inside a portal mounted on the leaflet container. Going through the
 * map container (not a leaflet pane) keeps the label DOM stable across hour
 * scrubs — the same nodes update their text/color/size, which is what lets
 * the counter-roll and outlier crossfade animations actually run instead of
 * being torn down and recreated every frame.
 *
 * Position is recomputed from `latLngToContainerPoint` on every map move/
 * zoom so the labels track the basemap.
 */
function WeatherLabelsLayer({ metric, samples, cityStats, windDirs }: WeatherLabelsLayerProps) {
  const map = useMap();
  // Lazy-init the portal div during render so we never need to setState
  // from inside an effect (avoids React 19's `set-state-in-effect` rule)
  // and the value is render-stable for the createPortal call below.
  const [portalNode] = useState<HTMLDivElement | null>(() => {
    if (typeof document === 'undefined') return null;
    ensureLabelStyles();
    const div = document.createElement('div');
    div.className = 'weather-labels-layer';
    div.style.cssText =
      'position: absolute; inset: 0; pointer-events: none; z-index: 450;';
    return div;
  });
  const [, forceTick] = useReducer((n: number) => n + 1, 0);
  const zoom = useMapZoom();

  useEffect(() => {
    if (!portalNode) return;
    map.getContainer().appendChild(portalNode);

    const handler = () => forceTick();
    // `move` covers pan; `zoom` fires continuously during pinch animations.
    // Listening to both keeps labels glued to the basemap throughout.
    map.on('move zoom zoomend viewreset', handler);
    return () => {
      map.off('move zoom zoomend viewreset', handler);
      portalNode.remove();
    };
  }, [map, portalNode]);

  // Precip "nothing happening" state — the per-neighborhood numbers don't
  // help when it's dry citywide, so we collapse to a single big "0%".
  if (portalNode && metric === 'precip' && isCitywideDry(samples)) {
    return createPortal(<PrecipEmptyState />, portalNode);
  }

  // Don't even build candidates without a portal target or any data.
  if (!portalNode || samples.size === 0) return null;

  const candidates: LabelCandidate[] = [];
  for (const n of neighborhoods) {
    const sample = samples.get(n.id);
    if (!sample || !Number.isFinite(sample.value)) continue;
    const status = classifyLabel(metric, sample.value, cityStats.avg);
    const point = map.latLngToContainerPoint([n.lat, n.lng]);
    candidates.push({
      neighborhood: n,
      value: sample.value,
      status,
      // Use absolute deviation so the collision-resolver always keeps the
      // bigger story regardless of direction (hottest *or* coldest wins
      // over a near-average neighbor).
      deviation: Number.isFinite(cityStats.avg)
        ? Math.abs(sample.value - cityStats.avg)
        : 0,
      px: { x: point.x, y: point.y },
    });
  }
  const visible = pickLabelsForZoom(candidates, zoom);

  // Branch by metric at the parent so each label component has a stable
  // hook call sequence — SmartLabel uses `useAnimatedNumber`, FogLabel
  // doesn't, so they can't share an entrypoint without violating the
  // rules of hooks.
  return createPortal(
    <>
      {visible.map((c) =>
        metric === 'fog' ? (
          <FogLabel
            key={c.neighborhood.id}
            name={c.neighborhood.name}
            density={c.value}
            x={c.px.x}
            y={c.px.y}
          />
        ) : (
          <SmartLabel
            key={c.neighborhood.id}
            metric={metric}
            name={c.neighborhood.name}
            value={c.value}
            status={c.status}
            delta={
              Number.isFinite(cityStats.avg) ? c.value - cityStats.avg : 0
            }
            windDir={metric === 'wind' ? windDirs.get(c.neighborhood.id) : undefined}
            x={c.px.x}
            y={c.px.y}
          />
        ),
      )}
    </>,
    portalNode,
  );
}

interface SmartLabelProps {
  // 'fog' is excluded so SmartLabel never has to early-return — fog labels
  // go through `FogLabel` directly and the conditional hook problem
  // disappears.
  metric: Exclude<WeatherMetric, 'fog'>;
  name: string;
  value: number;
  status: 'outlierHigh' | 'outlierLow' | 'neutral';
  delta: number;
  windDir: number | undefined;
  x: number;
  y: number;
}

function SmartLabel({ metric, name, value, status, delta, windDir, x, y }: SmartLabelProps) {
  const animated = useAnimatedNumber(value, 220);
  const display = formatMetricValue(metric, animated);
  const valueText = metric === 'temp' ? `${display}°` : display;

  const isOutlier = status !== 'neutral';
  const valueColor = colorForStatus(status);
  // Outliers render slightly larger to draw the eye. The 18→22 transition
  // is what makes a microclimate "pop" out of the dimmed map.
  const valueFontSize = isOutlier ? 22 : 18;

  // Wind direction sits inline with the value at the same size but lower
  // opacity. Brief: drop direction when calmer than avg (status outlierLow
  // covers "calmer", neutral covers "near calm").
  const showWindDir =
    metric === 'wind' && status !== 'outlierLow' && windDir !== undefined;
  const windAbbr = showWindDir ? windDirToAbbr(windDir) : '';

  const showBadge = isOutlier && Math.abs(delta) >= 0.5;
  const badgeText = formatDeltaBadge(metric, delta);

  return (
    <div
      className="weather-label"
      style={{
        transform: `translate3d(${x}px, ${y}px, 0)`,
        // Higher = neutral fades more; the dimming is what makes outliers
        // read first when scanning the map.
        opacity: isOutlier ? 1 : 0.32,
      }}
    >
      <div
        className="weather-label__value"
        style={{
          color: valueColor,
          fontSize: `${valueFontSize}px`,
        }}
      >
        <span className="tabular-nums">{valueText}</span>
        {showWindDir && (
          <span className="weather-label__wind-dir">{windAbbr}</span>
        )}
      </div>
      <div
        className="weather-label__name"
        style={{
          color: status === 'neutral' ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.55)',
        }}
      >
        {name}
      </div>
      {showBadge && (
        <div
          className="weather-label__badge"
          style={{
            color: valueColor,
            backgroundColor: badgeBgForStatus(status),
          }}
        >
          {badgeText}
        </div>
      )}
    </div>
  );
}

interface FogLabelProps {
  name: string;
  density: number;
  x: number;
  y: number;
}

function FogLabel({ name, density, x, y }: FogLabelProps) {
  // Three-state classification per the brief. Thresholds tuned alongside
  // `fogDensity` so a typical Karl morning over the Sunset reads "Foggy".
  let word: 'Foggy' | 'Hazy' | 'Clear';
  let color: string;
  let weight = 500;
  if (density >= 0.65) {
    word = 'Foggy';
    color = '#7a7a90';
  } else if (density >= 0.35) {
    word = 'Hazy';
    color = '#7a7a90';
    weight = 400;
  } else {
    word = 'Clear';
    color = '#3a8a5c';
  }
  const isOutlier = word !== 'Hazy';

  return (
    <div
      className="weather-label"
      style={{
        transform: `translate3d(${x}px, ${y}px, 0)`,
        opacity: isOutlier ? 1 : 0.55,
      }}
    >
      <div
        className="weather-label__value"
        style={{ color, fontSize: '18px', fontWeight: weight }}
      >
        {word}
      </div>
      <div
        className="weather-label__name"
        style={{ color: 'rgba(0,0,0,0.5)' }}
      >
        {name}
      </div>
    </div>
  );
}

function PrecipEmptyState() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        pointerEvents: 'none',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '64px',
          fontWeight: 500,
          color: 'rgba(26,26,24,0.85)',
          letterSpacing: '-2px',
          lineHeight: 1,
        }}
      >
        0%
      </div>
      <div
        style={{
          marginTop: '8px',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '13px',
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
          color: 'rgba(26,26,24,0.55)',
        }}
      >
        city-wide
      </div>
    </div>
  );
}

function colorForStatus(status: 'outlierHigh' | 'outlierLow' | 'neutral'): string {
  switch (status) {
    case 'outlierHigh':
      return '#d4733a';
    case 'outlierLow':
      return '#4a8ac4';
    case 'neutral':
      return 'rgba(0,0,0,0.55)';
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled status: ${String(_exhaustive)}`);
    }
  }
}

function badgeBgForStatus(
  status: 'outlierHigh' | 'outlierLow' | 'neutral',
): string {
  switch (status) {
    case 'outlierHigh':
      return 'rgba(212,115,58,0.12)';
    case 'outlierLow':
      return 'rgba(74,138,196,0.12)';
    case 'neutral':
      return 'transparent';
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled status: ${String(_exhaustive)}`);
    }
  }
}

/** "+3°", "-15%", "+3 mph" — the unit annotation used inside the badge. */
function formatDeltaBadge(metric: WeatherMetric, delta: number): string {
  const sign = delta >= 0 ? '+' : '−';
  const mag = Math.round(Math.abs(delta));
  switch (metric) {
    case 'temp':
      return `${sign}${mag}°`;
    case 'clouds':
    case 'precip':
      return `${sign}${mag}%`;
    case 'wind':
      return `${sign}${mag} mph`;
    case 'fog':
      // Fog uses words, not deltas — but keep the switch exhaustive.
      return '';
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled metric: ${String(_exhaustive)}`);
    }
  }
}

function isCitywideDry(samples: Map<number, SamplePoint>): boolean {
  if (samples.size === 0) return false;
  for (const s of samples.values()) {
    if (Number.isFinite(s.value) && s.value > 1) return false;
  }
  return true;
}

const LABEL_STYLE_ID = 'weather-label-style';
function ensureLabelStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(LABEL_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = LABEL_STYLE_ID;
  // All animation lives in CSS so React can swap props without retriggering
  // mount work. `transform` carries the per-label position so we don't pay
  // for layout on every map move.
  style.textContent = `.weather-label {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    -webkit-tap-highlight-color: transparent;
    font-family: 'DM Sans', sans-serif;
    line-height: 1;
    white-space: nowrap;
    transform-origin: 0 0;
    transition: opacity 250ms ease;
    will-change: transform, opacity;
    /* The translate sets x,y; we shift the label back by half its width so
       the value sits centered over the geographic anchor. */
    margin-left: -45px;
    margin-top: -10px;
    width: 90px;
    text-align: center;
  }
  .weather-label__value {
    font-weight: 500;
    letter-spacing: -0.4px;
    transition: color 250ms ease, font-size 250ms ease, font-weight 250ms ease;
    text-shadow: 0 1px 2px rgba(255,255,255,0.6);
  }
  .weather-label__wind-dir {
    margin-left: 4px;
    opacity: 0.55;
    font-weight: 500;
  }
  .weather-label__name {
    margin-top: 2px;
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    transition: color 250ms ease;
  }
  .weather-label__badge {
    display: inline-block;
    margin-top: 3px;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.2px;
    animation: weatherLabelBadgeIn 200ms ease both;
  }
  @keyframes weatherLabelBadgeIn {
    from { opacity: 0; transform: translateY(-2px); }
    to   { opacity: 1; transform: translateY(0); }
  }`;
  document.head.appendChild(style);
}

/**
 * Build a data URL of the gradient.
 *
 * Per pixel:
 *  1. The SF land mask gives the alpha — fully opaque inside the city,
 *     softly fading at the coastline, fully transparent over water and
 *     outside the county. This is what guarantees the gradient stays "on
 *     SF" instead of bleeding into the bay.
 *  2. IDW (power=IDW_POWER) over the neighborhood samples gives the color
 *     for each in-city pixel. Sample coverage is dense enough that every
 *     point in SF gets a meaningful interpolated value — the city reads as
 *     one continuous "blanket" of color rather than disconnected blobs.
 *
 * Color uses a *dynamic* range based on the current sample spread so a
 * 2-3deg variation across the city still renders as visibly different
 * colors.
 */
function rasterize(metric: WeatherMetric, samples: ReadonlyArray<SamplePoint>): string {
  const canvas = document.createElement('canvas');
  canvas.width = RASTER_W;
  canvas.height = RASTER_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(RASTER_W, RASTER_H);
  const data = img.data;
  const { south, west, north, east } = HEATMAP_BOUNDS;
  const latSpan = north - south;
  const lngSpan = east - west;

  const range = computeDynamicRange(metric, samples.map((s) => s.value)) ?? undefined;
  const mask = getLandMask();

  for (let y = 0; y < RASTER_H; y++) {
    // Pixel y=0 is the north (top) of the canvas; lat decreases as y grows.
    const lat = north - (y / (RASTER_H - 1)) * latSpan;
    for (let x = 0; x < RASTER_W; x++) {
      const idx = (y * RASTER_W + x) * 4;
      const maskAlpha = mask[idx + 3];
      if (maskAlpha === 0) {
        data[idx + 3] = 0;
        continue;
      }
      const lng = west + (x / (RASTER_W - 1)) * lngSpan;
      const value = idw(samples, lat, lng, METRIC_IDW_POWER[metric]);
      const [r, g, b] = colorRampFor(metric, value, range);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      // Per-metric opacity is applied at the leaflet image-overlay layer
      // (`setOpacity` on swap), so per-pixel alpha is just the SF mask.
      data[idx + 3] = maskAlpha;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

// Cached pixel data of the SF land mask. Built lazily on first rasterize and
// reused for every subsequent frame — the polygon doesn't change.
let landMaskCache: Uint8ClampedArray | null = null;

/**
 * Render the SF outline polygon into an offscreen canvas at raster size,
 * with a small blur so the coastline reads as soft instead of pixelated.
 * Returns the raw pixel data (RGBA Uint8ClampedArray) so the caller can
 * use the alpha channel as a per-pixel multiplier.
 */
function getLandMask(): Uint8ClampedArray {
  if (landMaskCache) return landMaskCache;

  const canvas = document.createElement('canvas');
  canvas.width = RASTER_W;
  canvas.height = RASTER_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Fall back to all-opaque so the rest of the layer still shows
    // something (better than rendering nothing if a browser refuses 2d).
    landMaskCache = new Uint8ClampedArray(RASTER_W * RASTER_H * 4).fill(255);
    return landMaskCache;
  }

  const { south, west, north, east } = HEATMAP_BOUNDS;
  const latSpan = north - south;
  const lngSpan = east - west;

  // The blur is applied as a canvas filter for the polygon draw only; we
  // reset it after so subsequent operations on the same context aren't
  // affected (relevant if anyone reuses this canvas, future-proofing).
  ctx.filter = `blur(${MASK_BLUR_PX}px)`;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < SF_OUTLINE.length; i++) {
    const [lat, lng] = SF_OUTLINE[i];
    const x = ((lng - west) / lngSpan) * (RASTER_W - 1);
    const y = ((north - lat) / latSpan) * (RASTER_H - 1);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.filter = 'none';

  landMaskCache = ctx.getImageData(0, 0, RASTER_W, RASTER_H).data;
  return landMaskCache;
}
