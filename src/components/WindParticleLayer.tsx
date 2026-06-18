import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { SF_OUTLINE } from '../data/sf-outline';
import type { SamplePoint } from '../utils/interpolate';

interface WindSample {
  lat: number;
  lng: number;
  speed: number;
  dir: number;
}

interface WindParticleLayerProps {
  samples: Map<number, SamplePoint>;
  windDirs: Map<number, number>;
}

const PARTICLE_COUNT = 900;
const TRAIL_LEN = 5;
const MAX_AGE = 100;
const AGE_JITTER = 40;
const SPEED_SCALE = 0.000025;

const WIND_PANE_NAME = 'windParticlePane';

function idwWindVector(
  ws: WindSample[],
  lat: number,
  lng: number,
  power: number,
): { vx: number; vy: number; speed: number } {
  if (ws.length === 0) return { vx: 0, vy: 0, speed: 0 };
  let wxS = 0, wyS = 0, wsS = 0, wS = 0;
  for (const s of ws) {
    const dLat = s.lat - lat;
    const dLng = s.lng - lng;
    const d2 = dLat * dLat + dLng * dLng;
    if (d2 < 1e-10) {
      const r = ((s.dir + 180) * Math.PI) / 180;
      return { vx: Math.sin(r) * s.speed, vy: -Math.cos(r) * s.speed, speed: s.speed };
    }
    const w = 1 / Math.pow(d2, power / 2);
    const r = ((s.dir + 180) * Math.PI) / 180;
    wxS += Math.sin(r) * s.speed * w;
    wyS += -Math.cos(r) * s.speed * w;
    wsS += s.speed * w;
    wS += w;
  }
  if (wS === 0) return { vx: 0, vy: 0, speed: 0 };
  return { vx: wxS / wS, vy: wyS / wS, speed: wsS / wS };
}

function buildLandMask(
  w: number, h: number,
  nwLat: number, nwLng: number,
  latSpan: number, lngSpan: number,
): Uint8Array {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  for (let i = 0; i < SF_OUTLINE.length; i++) {
    const [lat, lng] = SF_OUTLINE[i];
    const px = ((lng - nwLng) / lngSpan) * w;
    const py = ((nwLat - lat) / latSpan) * h;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  const img = ctx.getImageData(0, 0, w, h);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = img.data[i * 4 + 3] > 128 ? 1 : 0;
  return mask;
}

interface Particle {
  trailLat: Float64Array;
  trailLng: Float64Array;
  head: number;
  len: number;
  age: number;
  maxAge: number;
  speed: number;
}

export default function WindParticleLayer({ samples, windDirs }: WindParticleLayerProps) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const windSamplesRef = useRef<WindSample[]>([]);

  useEffect(() => {
    const ws: WindSample[] = [];
    for (const [id, sample] of samples) {
      const dir = windDirs.get(id);
      if (dir === undefined || !Number.isFinite(dir)) continue;
      ws.push({ lat: sample.lat, lng: sample.lng, speed: sample.value, dir });
    }
    windSamplesRef.current = ws;
  }, [samples, windDirs]);

  useEffect(() => {
    if (!map.getPane(WIND_PANE_NAME)) {
      map.createPane(WIND_PANE_NAME);
      const paneEl = map.getPane(WIND_PANE_NAME)!;
      paneEl.style.zIndex = '410';
      paneEl.style.pointerEvents = 'none';
    }
    const pane = map.getPane(WIND_PANE_NAME)!;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;pointer-events:none;';
    pane.appendChild(canvas);
    canvasRef.current = canvas;

    const dpr = window.devicePixelRatio || 1;
    let cssW = 0, cssH = 0;

    function resize() {
      const container = map.getContainer();
      const r = container.getBoundingClientRect();
      cssW = r.width; cssH = r.height;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }
    resize();
    const resizeObs = new ResizeObserver(resize);
    resizeObs.observe(map.getContainer());

    const MASK_RES = 200;
    let landMask: Uint8Array | null = null;
    let mNwLat = 0, mNwLng = 0, mLatSpan = 0, mLngSpan = 0, mW = 0, mH = 0;

    function rebuildMask() {
      const b = map.getBounds();
      const nw = b.getNorthWest(), se = b.getSouthEast();
      mNwLat = nw.lat; mNwLng = nw.lng;
      mLatSpan = nw.lat - se.lat; mLngSpan = se.lng - nw.lng;
      const asp = mLngSpan / mLatSpan;
      mW = Math.round(MASK_RES * Math.max(asp, 1));
      mH = Math.round(MASK_RES / Math.min(asp, 1));
      landMask = buildLandMask(mW, mH, mNwLat, mNwLng, mLatSpan, mLngSpan);
    }
    rebuildMask();

    function isOnLandGeo(lat: number, lng: number): boolean {
      if (!landMask) return false;
      const mx = Math.floor(((lng - mNwLng) / mLngSpan) * mW);
      const my = Math.floor(((mNwLat - lat) / mLatSpan) * mH);
      if (mx < 0 || mx >= mW || my < 0 || my >= mH) return false;
      return landMask[my * mW + mx] === 1;
    }

    function randomLandLatLng(): { lat: number; lng: number } {
      const b = map.getBounds();
      const nw = b.getNorthWest(), se = b.getSouthEast();
      for (let i = 0; i < 60; i++) {
        const lat = se.lat + Math.random() * (nw.lat - se.lat);
        const lng = nw.lng + Math.random() * (se.lng - nw.lng);
        if (isOnLandGeo(lat, lng)) return { lat, lng };
      }
      return { lat: 37.77, lng: -122.43 };
    }

    function makeParticle(): Particle {
      const { lat, lng } = randomLandLatLng();
      const p: Particle = {
        trailLat: new Float64Array(TRAIL_LEN),
        trailLng: new Float64Array(TRAIL_LEN),
        head: 0, len: 1,
        age: Math.floor(Math.random() * MAX_AGE),
        maxAge: MAX_AGE + Math.floor(Math.random() * AGE_JITTER),
        speed: 0,
      };
      p.trailLat[0] = lat;
      p.trailLng[0] = lng;
      return p;
    }

    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(makeParticle());

    const ctx = canvas.getContext('2d')!;

    function animate() {
      const ws = windSamplesRef.current;

      const topLeft = map.containerPointToLayerPoint([0, 0]);
      canvas.style.left = `${Math.round(topLeft.x)}px`;
      canvas.style.top = `${Math.round(topLeft.y)}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      if (ws.length === 0) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const bounds = map.getBounds();
      const nw = bounds.getNorthWest(), se = bounds.getSouthEast();
      const nwPx = map.latLngToContainerPoint(nw);
      const sePx = map.latLngToContainerPoint(se);
      const pxW = sePx.x - nwPx.x;
      const pxH = sePx.y - nwPx.y;
      const lngRange = se.lng - nw.lng;
      const latRange = nw.lat - se.lat;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const p of particles) {
        const curLat = p.trailLat[p.head];
        const curLng = p.trailLng[p.head];
        const { vx, vy, speed } = idwWindVector(ws, curLat, curLng, 1.4);
        p.speed = speed;

        const newLat = curLat + vy * SPEED_SCALE;
        const newLng = curLng + vx * SPEED_SCALE;
        p.age++;

        if (!isOnLandGeo(newLat, newLng) || p.age >= p.maxAge) {
          const { lat, lng } = randomLandLatLng();
          const nh = (p.head + 1) % TRAIL_LEN;
          p.trailLat[nh] = lat;
          p.trailLng[nh] = lng;
          p.head = nh;
          p.len = 1;
          p.age = 0;
          p.maxAge = MAX_AGE + Math.floor(Math.random() * AGE_JITTER);
          p.speed = 0;
          continue;
        }

        const nh = (p.head + 1) % TRAIL_LEN;
        p.trailLat[nh] = newLat;
        p.trailLng[nh] = newLng;
        p.head = nh;
        if (p.len < TRAIL_LEN) p.len++;

        if (speed < 0.5 || p.len < 2) continue;

        const fadeIn = Math.min(p.age / 10, 1);
        const ageRatio = p.age / p.maxAge;
        const fadeOut = ageRatio > 0.8 ? Math.max(1 - (ageRatio - 0.8) / 0.2, 0) : 1;
        const life = fadeIn * fadeOut;

        const baseAlpha = speed < 5 ? 0.35 : speed < 12 ? 0.5 : 0.65;
        const baseWidth = speed < 5 ? 0.6 : speed < 12 ? 0.8 : 1.0;
        const rgb = speed < 5 ? '55,105,165' : speed < 12 ? '40,85,150' : '65,125,190';

        for (let s = 0; s < p.len - 1; s++) {
          const idx0 = ((p.head - s) + TRAIL_LEN) % TRAIL_LEN;
          const idx1 = ((p.head - s - 1) + TRAIL_LEN) % TRAIL_LEN;

          const x0 = nwPx.x + ((p.trailLng[idx0] - nw.lng) / lngRange) * pxW;
          const y0 = nwPx.y + ((nw.lat - p.trailLat[idx0]) / latRange) * pxH;
          const x1 = nwPx.x + ((p.trailLng[idx1] - nw.lng) / lngRange) * pxW;
          const y1 = nwPx.y + ((nw.lat - p.trailLat[idx1]) / latRange) * pxH;

          const segFade = 1 - s / (p.len - 1);
          const a = baseAlpha * life * segFade;
          if (a < 0.02) continue;

          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.strokeStyle = `rgba(${rgb},${a.toFixed(3)})`;
          ctx.lineWidth = baseWidth * (0.3 + 0.7 * segFade);
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    const onMapChange = () => rebuildMask();
    map.on('moveend zoomend', onMapChange);

    return () => {
      cancelAnimationFrame(rafRef.current);
      map.off('moveend zoomend', onMapChange);
      resizeObs.disconnect();
      canvas.remove();
      canvasRef.current = null;
    };
  }, [map]);

  return null;
}
