# SF Sky Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix scoring accuracy bugs, decompose App.tsx, add error handling, build a test suite, wire up Supabase for form submissions, and improve code quality — all on separate feature branches.

**Architecture:** Six independent feature branches off `main`, each addressing one concern. Scoring fix merges first (test suite depends on it). All other branches are independent. No UI/UX changes.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Tailwind CSS v4, Leaflet, Open-Meteo API, Supabase, SunCalc

---

## Task 1: Scoring Model Fix — Branch Setup & Weight Rebalance

**Branch:** `fix/scoring-accuracy`

**Files:**
- Modify: `src/utils/scoring.ts:10-13` (weight constants)
- Modify: `src/utils/scoring.ts:53-57` (remove cloud score floors)

- [ ] **Step 1: Create the branch**

```bash
cd ~/sf-sky && git checkout main && git checkout -b fix/scoring-accuracy
```

- [ ] **Step 2: Rebalance the weight constants**

In `src/utils/scoring.ts`, replace lines 10-13:

```ts
const SUN_BASE_WEIGHT = 0.5;
const SUN_WEATHER_WEIGHT = 0.5;
const STAR_BASE_WEIGHT = 0.55;
const STAR_WEATHER_WEIGHT = 0.45;
```

with:

```ts
const SUN_BASE_WEIGHT = 0.35;
const SUN_WEATHER_WEIGHT = 0.65;
const STAR_BASE_WEIGHT = 0.45;
const STAR_WEATHER_WEIGHT = 0.55;
```

- [ ] **Step 3: Remove the misleading cloud score floors**

In `src/utils/scoring.ts`, delete lines 53-57 (the two `Math.max` floor lines and the comment above them):

```ts
  // Floors for clean evenings: a clear sky isn't "fire", but it's still a
  // pleasant view and shouldn't read as obscured.
  if (Number.isFinite(total) && total < 10) cloudScore = Math.max(cloudScore, 70);
  if (Number.isFinite(total) && total < 25 && cloudLow < 25) {
    cloudScore = Math.max(cloudScore, 65);
  }
```

- [ ] **Step 4: Verify the app still builds**

```bash
cd ~/sf-sky && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/utils/scoring.ts
git commit -m "fix: rebalance scoring weights and remove cloud score floors

Sun events: base 35% / weather 65% (was 50/50).
Stargazing: base 45% / weather 55% (was 55/45).
Remove cloud score floors that were preventing fog from tanking scores."
```

---

## Task 2: Scoring Model Fix — Wire Fog Density & Condition Overrides

**Branch:** `fix/scoring-accuracy` (continue)

**Files:**
- Modify: `src/utils/scoring.ts:1-6` (add import)
- Modify: `src/utils/scoring.ts` `scoreSunWeather()` function (add fog penalty)
- Modify: `src/utils/scoring.ts` `computeLiveScore()` function (add overrides)

- [ ] **Step 1: Add fogDensity import**

In `src/utils/scoring.ts`, add after the existing imports (line 6):

```ts
import { fogDensity } from './weather';
```

- [ ] **Step 2: Add fog penalty to scoreSunWeather()**

In `src/utils/scoring.ts`, in the `scoreSunWeather()` function, replace the line:

```ts
  const weighted = cloudScore * 0.7 + visScore * 0.3 - aqiPenalty;
```

with:

```ts
  // Fog penalty: fogDensity composites visibility + low-cloud + humidity
  // into 0..1. Above 0.5, fog starts meaningfully degrading the view.
  const fog = fogDensity(h);
  const fogPenalty = fog > 0.5 ? fog * 40 : 0;

  const weighted = cloudScore * 0.7 + visScore * 0.3 - aqiPenalty - fogPenalty;
```

- [ ] **Step 3: Add condition overrides to computeLiveScore()**

In `src/utils/scoring.ts`, in the `computeLiveScore()` function, replace:

```ts
  const blended = base * baseWeight + weather * weatherWeight;
  return Math.round(clamp(blended, 0, 100));
```

with:

```ts
  const blended = base * baseWeight + weather * weatherWeight;

  // Post-blend reality checks: cap the score when conditions are
  // objectively terrible, regardless of how good the base score is.
  const fog = fogDensity(hourly);
  if (type === 'sunrise' || type === 'sunset') {
    if (fog > 0.7) return Math.min(Math.round(clamp(blended, 0, 100)), 35);
    if (Number.isFinite(hourly.cloud) && hourly.cloud > 95)
      return Math.min(Math.round(clamp(blended, 0, 100)), 30);
    if (Number.isFinite(hourly.visibilityKm) && hourly.visibilityKm < 2)
      return Math.min(Math.round(clamp(blended, 0, 100)), 40);
  }
  if (type === 'stargazing') {
    if (Number.isFinite(hourly.cloud) && hourly.cloud > 95)
      return Math.min(Math.round(clamp(blended, 0, 100)), 20);
  }

  return Math.round(clamp(blended, 0, 100));
```

- [ ] **Step 4: Verify build**

```bash
cd ~/sf-sky && npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/utils/scoring.ts
git commit -m "fix: wire fogDensity into scoring and add condition overrides

fogDensity() was only used by the weather heatmap — now it also
penalizes sun event scores when fog is heavy.

Post-blend overrides cap scores when conditions are objectively
terrible: fog > 0.7 caps at 35, cloud > 95% caps at 30,
visibility < 2km caps at 40."
```

---

## Task 3: Scoring Regression Tests

**Branch:** `fix/scoring-accuracy` (continue)

**Files:**
- Modify: `package.json` (add vitest)
- Create: `src/utils/__tests__/scoring.test.ts`

- [ ] **Step 1: Install vitest**

```bash
cd ~/sf-sky && npm install -D vitest
```

- [ ] **Step 2: Add test scripts to package.json**

In `package.json`, add to the `"scripts"` object:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create the scoring test file**

Create `src/utils/__tests__/scoring.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { computeLiveScore, getScoreTier, cloudCoverLabel, visibilityPercent } from '../scoring';
import type { HourlyForecast } from '../weather';
import type { Spot } from '../../data/spots';

// --- Test helpers ---

function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: 'test-spot',
    name: 'Test Spot',
    lat: 37.76,
    lng: -122.51,
    city: 'sf',
    category: 'hilltop',
    elevation: 100,
    lightPollution: 'Low',
    horizonQuality: 'Open',
    sunrise: 70,
    sunset: 70,
    stargazing: 70,
    ...overrides,
  };
}

function makeHour(overrides: Partial<HourlyForecast> = {}): HourlyForecast {
  return {
    cloud: 30,
    cloudLow: 10,
    cloudMid: 40,
    cloudHigh: 30,
    visibilityKm: 16,
    humidity: 60,
    tempF: 58,
    precipProb: 0,
    pm25: 5,
    aqi: 20,
    windMph: 8,
    gustMph: 12,
    windDir: 270,
    ...overrides,
  };
}

function makeFoggyHour(): HourlyForecast {
  return makeHour({
    cloud: 80,
    cloudLow: 95,
    cloudMid: 10,
    cloudHigh: 5,
    visibilityKm: 1.2,
    humidity: 98,
    pm25: 5,
  });
}

function makeClearHour(): HourlyForecast {
  return makeHour({
    cloud: 5,
    cloudLow: 2,
    cloudMid: 3,
    cloudHigh: 5,
    visibilityKm: 18,
    humidity: 50,
    pm25: 3,
  });
}

// --- Regression: Lands End foggy evening ---

describe('Scoring regression: Lands End foggy evening', () => {
  const landsEnd = makeSpot({
    id: 'sf-lands-end',
    name: 'Lands End / Sutro Baths',
    sunset: 92,
    sunrise: 35,
    stargazing: 60,
  });

  test('sunset scores <= 35 during heavy fog', () => {
    const score = computeLiveScore(landsEnd, 'sunset', makeFoggyHour());
    expect(score).toBeLessThanOrEqual(35);
  });

  test('sunrise scores <= 35 during heavy fog', () => {
    const score = computeLiveScore(landsEnd, 'sunrise', makeFoggyHour());
    expect(score).toBeLessThanOrEqual(35);
  });

  test('sunset scores well on clear evenings', () => {
    const score = computeLiveScore(landsEnd, 'sunset', makeClearHour());
    expect(score).toBeGreaterThanOrEqual(50);
  });
});

// --- Condition overrides ---

describe('Condition overrides', () => {
  const highBaseSpot = makeSpot({ sunset: 95, sunrise: 90 });

  test('fog > 0.7 caps sunset at 35', () => {
    const foggy = makeHour({ cloudLow: 95, visibilityKm: 0.5, humidity: 99, cloud: 90 });
    const score = computeLiveScore(highBaseSpot, 'sunset', foggy);
    expect(score).toBeLessThanOrEqual(35);
  });

  test('cloud > 95% caps sunset at 30', () => {
    const overcast = makeHour({ cloud: 98, cloudLow: 90, cloudMid: 80, cloudHigh: 70, visibilityKm: 10, humidity: 70 });
    const score = computeLiveScore(highBaseSpot, 'sunset', overcast);
    expect(score).toBeLessThanOrEqual(30);
  });

  test('visibility < 2km caps sunset at 40', () => {
    const lowVis = makeHour({ visibilityKm: 1.0, cloud: 50, cloudLow: 30, humidity: 70 });
    const score = computeLiveScore(highBaseSpot, 'sunset', lowVis);
    expect(score).toBeLessThanOrEqual(40);
  });

  test('cloud > 95% caps stargazing at 20', () => {
    const overcast = makeHour({ cloud: 98, cloudLow: 90, cloudMid: 80, cloudHigh: 70 });
    const score = computeLiveScore(highBaseSpot, 'stargazing', overcast);
    expect(score).toBeLessThanOrEqual(20);
  });
});

// --- Weight balance ---

describe('Weight balance', () => {
  test('weather dominates when conditions are bad', () => {
    const good = makeSpot({ sunset: 95 });
    const clear = computeLiveScore(good, 'sunset', makeClearHour());
    const foggy = computeLiveScore(good, 'sunset', makeFoggyHour());
    expect(clear - foggy).toBeGreaterThan(30);
  });

  test('base score still matters on identical weather', () => {
    const high = makeSpot({ sunset: 95 });
    const low = makeSpot({ sunset: 20 });
    const hour = makeClearHour();
    const highScore = computeLiveScore(high, 'sunset', hour);
    const lowScore = computeLiveScore(low, 'sunset', hour);
    expect(highScore).toBeGreaterThan(lowScore);
  });
});

// --- Utility functions ---

describe('getScoreTier', () => {
  test('scores >= 70 are great', () => expect(getScoreTier(70)).toBe('great'));
  test('scores >= 45 are decent', () => expect(getScoreTier(45)).toBe('decent'));
  test('scores < 45 are poor', () => expect(getScoreTier(44)).toBe('poor'));
  test('score 100 is great', () => expect(getScoreTier(100)).toBe('great'));
  test('score 0 is poor', () => expect(getScoreTier(0)).toBe('poor'));
});

describe('cloudCoverLabel', () => {
  test('< 20 is Clear', () => expect(cloudCoverLabel(10)).toBe('Clear'));
  test('< 60 is Partly', () => expect(cloudCoverLabel(40)).toBe('Partly'));
  test('< 85 is Mid', () => expect(cloudCoverLabel(70)).toBe('Mid'));
  test('>= 85 is Overcast', () => expect(cloudCoverLabel(90)).toBe('Overcast'));
  test('NaN returns dash', () => expect(cloudCoverLabel(NaN)).toBe('—'));
});

describe('visibilityPercent', () => {
  test('0 km -> 0%', () => expect(visibilityPercent(0)).toBe(0));
  test('30 km -> 100%', () => expect(visibilityPercent(30)).toBe(100));
  test('15 km -> 50%', () => expect(visibilityPercent(15)).toBe(50));
  test('NaN -> 0', () => expect(visibilityPercent(NaN)).toBe(0));
});
```

- [ ] **Step 4: Run tests**

```bash
cd ~/sf-sky && npx vitest run src/utils/__tests__/scoring.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/utils/__tests__/scoring.test.ts
git commit -m "test: add scoring regression tests

Covers the Lands End foggy-evening bug, condition overrides,
weight balance, and utility functions (getScoreTier, cloudCoverLabel,
visibilityPercent). 20+ test cases."
```

---

## Task 4: Bug Fix — Duplicate Spot ID

**Branch:** `fix/bugs-and-error-handling`

**Files:**
- Modify: `src/data/spots.ts:991`

- [ ] **Step 1: Create the branch**

```bash
cd ~/sf-sky && git checkout main && git checkout -b fix/bugs-and-error-handling
```

- [ ] **Step 2: Rename the duplicate ID**

In `src/data/spots.ts`, at line 991, change:

```ts
    id: "sf-inspiration-point", name: "Inspiration Point",
```

to:

```ts
    id: "sf-tilden-inspiration-point", name: "Inspiration Point",
```

- [ ] **Step 3: Verify build**

```bash
cd ~/sf-sky && npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/data/spots.ts
git commit -m "fix: rename duplicate sf-inspiration-point spot ID

Two spots shared id 'sf-inspiration-point' — Presidio (line 477) and
Tilden/Orinda (line 991). The Tilden one is now 'sf-tilden-inspiration-point'.
Presidio keeps the original ID as the more canonical SF spot."
```

---

## Task 5: Defensive Weather Parsing

**Branch:** `fix/bugs-and-error-handling` (continue)

**Files:**
- Modify: `src/utils/weather.ts:180-217` (`mergeResponses`)

- [ ] **Step 1: Wrap mergeResponses in try/catch**

In `src/utils/weather.ts`, replace the `mergeResponses` function (lines 180-217) with:

```ts
function mergeResponses(
  forecast: OpenMeteoForecastResponse,
  air: OpenMeteoAirQualityResponse | null,
): SpotForecast {
  try {
    const hours: Record<string, HourlyForecast> = {};
    const times = forecast.hourly?.time ?? [];

    // Build an index of AQI hour -> array position for O(n) merging.
    const aqiIndex = new Map<string, number>();
    const aqiTimes = air?.hourly?.time ?? [];
    for (let i = 0; i < aqiTimes.length; i++) {
      aqiIndex.set(hourKeyFromOpenMeteo(aqiTimes[i]), i);
    }

    for (let i = 0; i < times.length; i++) {
      const key = hourKeyFromOpenMeteo(times[i]);
      const visibilityMeters = pick(forecast.hourly?.visibility, i);
      const aqiI = aqiIndex.get(key);

      hours[key] = {
        cloud: pick(forecast.hourly?.cloud_cover, i),
        cloudLow: pick(forecast.hourly?.cloud_cover_low, i),
        cloudMid: pick(forecast.hourly?.cloud_cover_mid, i),
        cloudHigh: pick(forecast.hourly?.cloud_cover_high, i),
        visibilityKm: Number.isFinite(visibilityMeters) ? visibilityMeters / 1000 : NaN,
        humidity: pick(forecast.hourly?.relative_humidity_2m, i),
        tempF: pick(forecast.hourly?.temperature_2m, i),
        precipProb: pick(forecast.hourly?.precipitation_probability, i),
        pm25: aqiI !== undefined ? pick(air?.hourly?.pm2_5, aqiI) : NaN,
        aqi: aqiI !== undefined ? pick(air?.hourly?.us_aqi, aqiI) : NaN,
        windMph: pick(forecast.hourly?.wind_speed_10m, i),
        gustMph: pick(forecast.hourly?.wind_gusts_10m, i),
        windDir: pick(forecast.hourly?.wind_direction_10m, i),
      };
    }

    return { hours, fetchedAt: Date.now() };
  } catch {
    // Malformed API response — return empty forecast so consumers
    // fall back to static base scores instead of crashing.
    return { hours: {}, fetchedAt: Date.now() };
  }
}
```

- [ ] **Step 2: Verify build**

```bash
cd ~/sf-sky && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/utils/weather.ts
git commit -m "fix: wrap mergeResponses in try/catch for defensive parsing

Malformed Open-Meteo responses now return an empty forecast instead
of crashing. Consumers fall back to static base scores."
```

---

## Task 6: Error Boundaries

**Branch:** `fix/bugs-and-error-handling` (continue)

**Files:**
- Create: `src/components/MapErrorBoundary.tsx`
- Create: `src/components/WeatherErrorBoundary.tsx`
- Modify: `src/App.tsx` (wrap components)

- [ ] **Step 1: Create MapErrorBoundary**

Create `src/components/MapErrorBoundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class MapErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[MapErrorBoundary]', error, info.componentStack);
  }

  handleReload = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full bg-cream">
          <div className="text-center px-6">
            <p className="font-serif text-lg text-gray-700 mb-2">
              Map hit a snag
            </p>
            <p className="font-mono text-xs text-gray-500 mb-4">
              Something went wrong loading the map.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="px-4 py-2 rounded-lg bg-gray-700 text-cream font-mono text-[11px] tracking-[2px] uppercase hover:bg-gray-800 transition-colors"
            >
              Reload Map
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Create WeatherErrorBoundary**

Create `src/components/WeatherErrorBoundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Called when the boundary catches — lets App switch back to explore mode. */
  onFallback?: () => void;
}

interface State {
  hasError: boolean;
}

export default class WeatherErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[WeatherErrorBoundary]', error, info.componentStack);
    this.props.onFallback?.();
  }

  componentDidUpdate(prevProps: Props): void {
    // Reset the error state when the parent re-mounts children (e.g.
    // user switches back to weather mode after a recovery).
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-gray-800/90 text-cream font-mono text-[10px] tracking-[1.5px] uppercase shadow-lg">
          Weather data unavailable
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 3: Wire boundaries into App.tsx**

In `src/App.tsx`, add imports at the top (after the existing component imports):

```ts
import MapErrorBoundary from './components/MapErrorBoundary';
import WeatherErrorBoundary from './components/WeatherErrorBoundary';
```

Wrap the `<MapView>` in the JSX (inside the `<div className="fixed inset-0 z-0">`):

Replace:
```tsx
        <MapView
```

with:
```tsx
        <MapErrorBoundary>
        <MapView
```

And after the closing `/>` of MapView, add:
```tsx
        </MapErrorBoundary>
```

Wrap the weather-mode InsightCard and BottomPanel. Find the `{appMode === 'weather' && (` block for `<InsightCard` and the one for `<BottomPanel`. Wrap both in a single `WeatherErrorBoundary`. Replace:

```tsx
      {/* Insight card — Karl narrates the weather. Sits just below the
          mode toggle in weather mode; updates on hour scrub. */}
      {appMode === 'weather' && (
        <InsightCard
```

with:

```tsx
      {/* Insight card + bottom panel wrapped in an error boundary that
          falls back to explore mode if weather data crashes. */}
      <WeatherErrorBoundary onFallback={() => handleModeChange('explore')}>
      {appMode === 'weather' && (
        <InsightCard
```

And after the closing of the `BottomPanel` block (`)}` for the weather BottomPanel), add:

```tsx
      </WeatherErrorBoundary>
```

- [ ] **Step 4: Verify build**

```bash
cd ~/sf-sky && npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/MapErrorBoundary.tsx src/components/WeatherErrorBoundary.tsx src/App.tsx
git commit -m "fix: add error boundaries for map and weather components

MapErrorBoundary shows a reload button if the map crashes.
WeatherErrorBoundary falls back to explore mode with a toast
if weather data processing throws."
```

---

## Task 7: App.tsx Decomposition — Constants & BottomPanel Extraction

**Branch:** `refactor/app-decomposition`

**Files:**
- Create: `src/utils/constants.ts`
- Create: `src/components/BottomPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the branch**

```bash
cd ~/sf-sky && git checkout main && git checkout -b refactor/app-decomposition
```

- [ ] **Step 2: Create constants file**

Create `src/utils/constants.ts`:

```ts
import type { Filters } from '../App';

export const DISMISS_HIGHLIGHT_MS = 1600;

export const APP_MODE_STORAGE_KEY = 'sf-sky:appMode';
export const HOME_CITY_KEY = 'sky:homeCity';
export const ACTIVE_CITY_KEY = 'sky:activeCity';

export const defaultFilters: Filters = {
  sunrise: [],
  sunset: [],
  stargazing: [],
};
```

- [ ] **Step 3: Extract BottomPanel to its own file**

Create `src/components/BottomPanel.tsx` by cutting the `BottomPanelProps` interface and the `BottomPanel` function (lines 716-862) from `src/App.tsx`. Add the necessary imports:

```tsx
import { useCallback, useEffect, useRef } from 'react';
import type { WeatherMetric } from '../utils/interpolate';
import type { useNeighborhoodForecasts } from '../hooks/useNeighborhoodForecasts';
import { useSwipeDismiss } from '../hooks/useSwipeDismiss';
import WeatherControls from './WeatherControls';
import WeatherSheetExpanded from './WeatherSheetExpanded';

export interface BottomPanelProps {
  weatherMetric: WeatherMetric;
  weatherHourKeys: string[];
  weatherHourKey: string;
  onWeatherHourChange: (key: string) => void;
  weatherNowIndex: number;
  weatherForecasts: ReturnType<typeof useNeighborhoodForecasts>['forecasts'];
  weatherSheetExpanded: boolean;
  onWeatherSheetExpandedChange: (expanded: boolean) => void;
}

// Paste the entire BottomPanel function body here — no logic changes.
// Add `export default` before `function BottomPanel`.
```

- [ ] **Step 4: Update App.tsx imports**

In `src/App.tsx`:
- Remove the `BottomPanel` function and `BottomPanelProps` interface (lines 716-862)
- Remove the `DISMISS_HIGHLIGHT_MS`, storage key constants, and `defaultFilters` definitions
- Add imports:

```ts
import BottomPanel from './components/BottomPanel';
import { DISMISS_HIGHLIGHT_MS, APP_MODE_STORAGE_KEY, HOME_CITY_KEY, ACTIVE_CITY_KEY, defaultFilters } from './utils/constants';
```

- [ ] **Step 5: Verify build**

```bash
cd ~/sf-sky && npm run build
```

Expected: Build succeeds. No behavior changes.

- [ ] **Step 6: Commit**

```bash
git add src/utils/constants.ts src/components/BottomPanel.tsx src/App.tsx
git commit -m "refactor: extract BottomPanel and constants from App.tsx

BottomPanel moved to its own component file.
Storage keys, defaultFilters, DISMISS_HIGHLIGHT_MS moved to constants.ts.
No behavior changes."
```

---

## Task 8: App.tsx Decomposition — useOnboarding Hook

**Branch:** `refactor/app-decomposition` (continue)

**Files:**
- Create: `src/hooks/useOnboarding.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create useOnboarding hook**

Create `src/hooks/useOnboarding.ts`:

```ts
import { useState, useCallback } from 'react';
import type { MapPoint } from '../components/MapView';
import type { WeatherMetric } from '../utils/interpolate';
import {
  ONBOARDING_KEYS,
  isOnboardingDone,
  markOnboardingDone,
} from '../utils/onboarding';

export interface OnboardingState {
  showWelcome: boolean;
  showTapSpotHint: boolean;
  tapSpotAnchor: MapPoint | null;
  showScrollCardsHint: boolean;
  showWeatherModeHint: boolean;
  showMetricsHint: boolean;
  showScrubHint: boolean;
  showCompleteHint: boolean;
}

export interface OnboardingHandlers {
  handleDismissWelcome: () => void;
  handleDismissTapSpotHint: () => void;
  handleDismissScrollCardsHint: () => void;
  handleDismissWeatherModeHint: () => void;
  handleDismissMetricsHint: () => void;
  handleDismissScrubHint: () => void;
  handleDismissCompleteHint: () => void;
  handleScorePanelCardSwipe: () => void;
  setTapSpotAnchor: (anchor: MapPoint | null) => void;
  setShowTapSpotHint: (show: boolean) => void;
  setShowScrollCardsHint: (show: boolean) => void;
  setShowWeatherModeHint: (show: boolean) => void;
  setShowMetricsHint: (show: boolean) => void;
  setShowScrubHint: (show: boolean) => void;
  setShowCompleteHint: (show: boolean) => void;
  /** Wraps a metric setter to auto-dismiss the metrics hint. */
  wrapMetricChange: (setter: (m: WeatherMetric) => void) => (m: WeatherMetric) => void;
  /** Wraps an hour-key setter to auto-dismiss the scrub hint and fire the complete hint. */
  wrapHourChange: (setter: (k: string) => void) => (k: string) => void;
}

export function useOnboarding(): OnboardingState & OnboardingHandlers {
  const [showWelcome, setShowWelcome] = useState(
    () => !isOnboardingDone(ONBOARDING_KEYS.welcome),
  );
  const [showTapSpotHint, setShowTapSpotHint] = useState(false);
  const [tapSpotAnchor, setTapSpotAnchor] = useState<MapPoint | null>(null);
  const [showScrollCardsHint, setShowScrollCardsHint] = useState(false);
  const [showWeatherModeHint, setShowWeatherModeHint] = useState(false);
  const [showMetricsHint, setShowMetricsHint] = useState(false);
  const [showScrubHint, setShowScrubHint] = useState(false);
  const [showCompleteHint, setShowCompleteHint] = useState(false);

  const handleDismissWelcome = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.welcome);
    setShowWelcome(false);
    if (!isOnboardingDone(ONBOARDING_KEYS.tapSpot)) {
      setShowTapSpotHint(true);
    }
  }, []);

  const handleDismissTapSpotHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.tapSpot);
    setShowTapSpotHint(false);
  }, []);

  const handleDismissScrollCardsHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.scrollCards);
    setShowScrollCardsHint(false);
  }, []);

  const handleScorePanelCardSwipe = useCallback(() => {
    if (isOnboardingDone(ONBOARDING_KEYS.scrollCards)) return;
    markOnboardingDone(ONBOARDING_KEYS.scrollCards);
    setShowScrollCardsHint(false);
  }, []);

  const handleDismissWeatherModeHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.weatherMode);
    setShowWeatherModeHint(false);
  }, []);

  const handleDismissMetricsHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.metrics);
    setShowMetricsHint(false);
  }, []);

  const handleDismissScrubHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.scrubTimeline);
    setShowScrubHint(false);
  }, []);

  const handleDismissCompleteHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.complete);
    setShowCompleteHint(false);
  }, []);

  const wrapMetricChange = useCallback(
    (setter: (m: WeatherMetric) => void) => (metric: WeatherMetric) => {
      setter(metric);
      if (!isOnboardingDone(ONBOARDING_KEYS.metrics)) {
        markOnboardingDone(ONBOARDING_KEYS.metrics);
        setShowMetricsHint(false);
      }
    },
    [],
  );

  const wrapHourChange = useCallback(
    (setter: (k: string) => void) => (key: string) => {
      setter(key);
      if (!isOnboardingDone(ONBOARDING_KEYS.scrubTimeline)) {
        markOnboardingDone(ONBOARDING_KEYS.scrubTimeline);
        setShowScrubHint(false);
        if (!isOnboardingDone(ONBOARDING_KEYS.complete)) {
          setShowCompleteHint(true);
        }
      }
    },
    [],
  );

  return {
    showWelcome,
    showTapSpotHint,
    tapSpotAnchor,
    showScrollCardsHint,
    showWeatherModeHint,
    showMetricsHint,
    showScrubHint,
    showCompleteHint,
    handleDismissWelcome,
    handleDismissTapSpotHint,
    handleDismissScrollCardsHint,
    handleDismissWeatherModeHint,
    handleDismissMetricsHint,
    handleDismissScrubHint,
    handleDismissCompleteHint,
    handleScorePanelCardSwipe,
    setTapSpotAnchor,
    setShowTapSpotHint,
    setShowScrollCardsHint,
    setShowWeatherModeHint,
    setShowMetricsHint,
    setShowScrubHint,
    setShowCompleteHint,
    wrapMetricChange,
    wrapHourChange,
  };
}
```

- [ ] **Step 2: Update App.tsx to use useOnboarding**

In `src/App.tsx`:
- Remove all onboarding `useState` calls (showWelcome through showCompleteHint)
- Remove all `handleDismiss*` callbacks
- Remove `handleScorePanelCardSwipe`, `handleWeatherMetricChange`, `handleWeatherHourChange`
- Add import: `import { useOnboarding } from './hooks/useOnboarding';`
- Call the hook: `const onboarding = useOnboarding();`
- Replace all references (e.g. `showWelcome` → `onboarding.showWelcome`)
- Use `onboarding.wrapMetricChange(setWeatherMetric)` and `onboarding.wrapHourChange(setWeatherHourKey)` for the wrapped handlers

- [ ] **Step 3: Verify build**

```bash
cd ~/sf-sky && npm run build
```

Expected: Build succeeds. No behavior changes.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useOnboarding.ts src/App.tsx
git commit -m "refactor: extract onboarding logic to useOnboarding hook

All 8 onboarding hint states, their dismiss handlers, and the
metric/hour wrapper functions now live in useOnboarding.
App.tsx sheds ~120 lines."
```

---

## Task 8b: App.tsx Decomposition — useAppState Hook (Optional, High-Risk)

**Branch:** `refactor/app-decomposition` (continue)

**Files:**
- Create: `src/hooks/useAppState.ts`
- Modify: `src/App.tsx`

> **Note:** This is the largest single refactor. It moves ~15 useState calls and ~10 handlers out of App.tsx into a useReducer-based hook. Do this AFTER Tasks 7-8 are verified working. If time is tight, this can be deferred — the constants/BottomPanel/useOnboarding extractions already cut App.tsx significantly.

- [ ] **Step 1: Create useAppState hook**

Create `src/hooks/useAppState.ts` that encapsulates:
- All remaining useState calls in App.tsx (selectedSpot, highlightedSpot, menuOpen, searchOpen, suggestOpen, bugReportOpen, suggestSeed, filters, travelMode, appMode, homeCityId, activeCityId, citySheetOpen, weatherMetric, weatherHourKey, weatherSheetExpanded)
- All their associated handlers (handleSelectSpot, handleModeChange, handleReset, setActiveCity, setHomeCity, handleOpenSuggest, handleSuggestFromSearch, handleSuggestFromMenu, handleReportBugFromMenu)
- The localStorage persistence effects
- The deep-link effect
- The weather hour key auto-set effect

Use `useReducer` internally with a discriminated union action type. Export a flat return object with state values and handler functions.

The hook's public API should match the existing App.tsx interface 1:1 so the JSX in App.tsx only needs to swap `state.xyz` for the current bare `xyz` references.

- [ ] **Step 2: Update App.tsx to use useAppState**

Replace all extracted state and handlers with the hook call. App.tsx should be ~250-300 lines of pure JSX composition after this step.

- [ ] **Step 3: Verify build and manual smoke test**

```bash
cd ~/sf-sky && npm run build
```

Manually verify: spot selection, mode switching, city switching, search, filters, deep links all still work.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAppState.ts src/App.tsx
git commit -m "refactor: extract core app state to useAppState hook

All ~15 useState calls and ~10 handlers now live in a useReducer-based
hook. App.tsx is pure JSX composition (~250 lines)."
```

---

## Task 9: Full Test Suite

**Branch:** `feat/test-suite`

**Files:**
- Create: `src/utils/__tests__/weather.test.ts`
- Create: `src/utils/__tests__/interpolate.test.ts`
- Create: `src/utils/__tests__/narrative.test.ts`
- Create: `src/utils/__tests__/outlook.test.ts`
- Create: `src/utils/__tests__/karl-copy.test.ts`

- [ ] **Step 1: Create the branch (off main, after scoring-accuracy is merged)**

```bash
cd ~/sf-sky && git checkout main && git checkout -b feat/test-suite
```

Note: This branch should be created AFTER `fix/scoring-accuracy` has been merged to main. If it hasn't been merged yet, branch off `fix/scoring-accuracy` instead.

- [ ] **Step 2: Ensure vitest is installed**

If vitest was already installed in the scoring branch and merged, skip. Otherwise:

```bash
cd ~/sf-sky && npm install -D vitest
```

And add test scripts to `package.json` if not present:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create weather.test.ts**

Create `src/utils/__tests__/weather.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { fogDensity, getForecastAt, type HourlyForecast, type SpotForecast } from '../weather';

function makeHour(overrides: Partial<HourlyForecast> = {}): HourlyForecast {
  return {
    cloud: 30, cloudLow: 10, cloudMid: 40, cloudHigh: 30,
    visibilityKm: 16, humidity: 60, tempF: 58, precipProb: 0,
    pm25: 5, aqi: 20, windMph: 8, gustMph: 12, windDir: 270,
    ...overrides,
  };
}

describe('fogDensity', () => {
  test('classic Karl fog returns high density', () => {
    const fog = fogDensity(makeHour({ visibilityKm: 1, cloudLow: 95, humidity: 98 }));
    expect(fog).toBeGreaterThan(0.75);
  });

  test('clear south-side returns low density', () => {
    const fog = fogDensity(makeHour({ visibilityKm: 16, cloudLow: 5, humidity: 60 }));
    expect(fog).toBeLessThan(0.1);
  });

  test('returns 0-1 range', () => {
    const fog = fogDensity(makeHour());
    expect(fog).toBeGreaterThanOrEqual(0);
    expect(fog).toBeLessThanOrEqual(1);
  });

  test('handles NaN inputs gracefully', () => {
    const fog = fogDensity(makeHour({ visibilityKm: NaN, cloudLow: NaN, humidity: NaN }));
    expect(Number.isFinite(fog)).toBe(true);
  });
});

describe('getForecastAt', () => {
  const forecast: SpotForecast = {
    hours: {
      '2026-06-02T18': makeHour({ tempF: 60 }),
      '2026-06-02T19': makeHour({ tempF: 58 }),
      '2026-06-02T20': makeHour({ tempF: 55 }),
    },
    fetchedAt: Date.now(),
  };

  test('returns exact hour match', () => {
    const when = new Date('2026-06-02T19:00:00');
    const result = getForecastAt(forecast, when);
    expect(result?.tempF).toBe(58);
  });

  test('returns closest hour when exact not found', () => {
    const when = new Date('2026-06-02T19:30:00');
    const result = getForecastAt(forecast, when);
    expect(result).not.toBeNull();
  });

  test('returns null for empty forecast', () => {
    const empty: SpotForecast = { hours: {}, fetchedAt: Date.now() };
    const result = getForecastAt(empty, new Date());
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 4: Create interpolate.test.ts**

Create `src/utils/__tests__/interpolate.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { idw, colorRampFor, computeDynamicRange, formatMetricValue } from '../interpolate';

describe('idw', () => {
  test('returns NaN for empty points', () => {
    expect(idw([], 37.76, -122.45)).toBeNaN();
  });

  test('returns exact value when target is on a sample', () => {
    const points = [{ lat: 37.76, lng: -122.45, value: 42 }];
    expect(idw(points, 37.76, -122.45)).toBe(42);
  });

  test('interpolates between two points', () => {
    const points = [
      { lat: 37.0, lng: -122.0, value: 0 },
      { lat: 38.0, lng: -122.0, value: 100 },
    ];
    const result = idw(points, 37.5, -122.0);
    expect(result).toBeGreaterThan(30);
    expect(result).toBeLessThan(70);
  });

  test('closer point has more influence', () => {
    const points = [
      { lat: 37.0, lng: -122.0, value: 0 },
      { lat: 37.1, lng: -122.0, value: 100 },
    ];
    const result = idw(points, 37.09, -122.0);
    expect(result).toBeGreaterThan(70);
  });
});

describe('colorRampFor', () => {
  test('returns a 3-element RGB array', () => {
    const color = colorRampFor('temp', 70);
    expect(color).toHaveLength(3);
    color.forEach(c => {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(255);
    });
  });

  test('NaN returns gray fallback', () => {
    expect(colorRampFor('temp', NaN)).toEqual([200, 200, 200]);
  });
});

describe('computeDynamicRange', () => {
  test('returns null for empty values', () => {
    expect(computeDynamicRange('temp', [])).toBeNull();
  });

  test('returns null for all-NaN values', () => {
    expect(computeDynamicRange('temp', [NaN, NaN])).toBeNull();
  });

  test('expands small ranges to minimum span', () => {
    const range = computeDynamicRange('temp', [60, 62]);
    expect(range).not.toBeNull();
    expect(range!.max - range!.min).toBeGreaterThanOrEqual(6);
  });

  test('preserves ranges wider than minimum', () => {
    const range = computeDynamicRange('temp', [50, 80]);
    expect(range).toEqual({ min: 50, max: 80 });
  });
});

describe('formatMetricValue', () => {
  test('temp rounds to integer', () => expect(formatMetricValue('temp', 58.7)).toBe('59'));
  test('clouds adds %', () => expect(formatMetricValue('clouds', 42)).toBe('42%'));
  test('NaN returns dash', () => expect(formatMetricValue('temp', NaN)).toBe('–'));
});
```

- [ ] **Step 5: Create narrative.test.ts**

Create `src/utils/__tests__/narrative.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { narrativeFor } from '../narrative';
import type { SamplePoint } from '../interpolate';

function makeSamples(values: [number, number][]): Map<number, SamplePoint> {
  const map = new Map<number, SamplePoint>();
  for (const [id, value] of values) {
    map.set(id, { lat: 37.76, lng: -122.45, value });
  }
  return map;
}

describe('narrativeFor', () => {
  test('returns loading copy for empty samples', () => {
    const result = narrativeFor('temp', new Map(), null);
    expect(result.sub).toContain('Loading');
  });

  test('temp returns avg and spread', () => {
    const samples = makeSamples([[1, 55], [2, 65]]);
    const result = narrativeFor('temp', samples, null);
    expect(result.main).toContain('60');
    expect(result.main).toContain('avg');
  });

  test('fog mentions Karl for SF neighborhoods', () => {
    const high = makeSamples([[1, 0.8], [2, 0.9]]);
    const result = narrativeFor('fog', high, null);
    expect(result.main.toLowerCase()).toContain('karl');
  });

  test('precip handles dry conditions', () => {
    const dry = makeSamples([[1, 0], [2, 0]]);
    const result = narrativeFor('precip', dry, null);
    expect(result.main.toLowerCase()).toContain('no rain');
  });
});
```

- [ ] **Step 6: Create outlook.test.ts**

Create `src/utils/__tests__/outlook.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { computeCityOutlook, outlookMessage, statusLabel } from '../outlook';
import type { LiveScoresMap, LiveSpotScores } from '../../hooks/useLiveScores';

function makeScoresMap(entries: [string, Partial<LiveSpotScores>][]): LiveScoresMap {
  const map: LiveScoresMap = new Map();
  for (const [id, partial] of entries) {
    map.set(id, {
      sunrise: 50, sunset: 50, stargazing: 50, isLive: true,
      ...partial,
    });
  }
  return map;
}

describe('computeCityOutlook', () => {
  test('good outlook when top spots score high', () => {
    const scores = makeScoresMap([
      ['a', { sunset: 85 }],
      ['b', { sunset: 80 }],
    ]);
    const outlook = computeCityOutlook(scores);
    expect(outlook.sunset.status).toBe('good');
  });

  test('poor outlook when all scores are low', () => {
    const scores = makeScoresMap([
      ['a', { sunset: 30 }],
      ['b', { sunset: 25 }],
    ]);
    const outlook = computeCityOutlook(scores);
    expect(outlook.sunset.status).toBe('poor');
  });

  test('isLive is false when no live scores', () => {
    const scores: LiveScoresMap = new Map();
    scores.set('a', { sunrise: 50, sunset: 50, stargazing: 50, isLive: false });
    expect(computeCityOutlook(scores).isLive).toBe(false);
  });
});

describe('outlookMessage', () => {
  test('SF good sunset mentions Karl', () => {
    const msg = outlookMessage('sunset', 'good', 'sf');
    expect(msg.toLowerCase()).toContain('karl');
  });

  test('Austin good sunset does not mention Karl', () => {
    const msg = outlookMessage('sunset', 'good', 'austin');
    expect(msg.toLowerCase()).not.toContain('karl');
  });
});

describe('statusLabel', () => {
  test('SF good is Karl-Free', () => expect(statusLabel('good', 'sf')).toBe('Karl-Free'));
  test('Austin good is Clear Skies', () => expect(statusLabel('good', 'austin')).toBe('Clear Skies'));
});
```

- [ ] **Step 7: Create karl-copy.test.ts**

Create `src/utils/__tests__/karl-copy.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { getKarlComment } from '../karl-copy';

describe('getKarlComment', () => {
  test('returns a non-empty string', () => {
    const comment = getKarlComment(80, 'sunset', 'sf-ocean-beach');
    expect(comment.length).toBeGreaterThan(0);
  });

  test('same spot/day/type returns same line (deterministic)', () => {
    const date = new Date('2026-06-02');
    const a = getKarlComment(80, 'sunset', 'sf-ocean-beach', date);
    const b = getKarlComment(80, 'sunset', 'sf-ocean-beach', date);
    expect(a).toBe(b);
  });

  test('different spots get variety', () => {
    const date = new Date('2026-06-02');
    const a = getKarlComment(80, 'sunset', 'sf-ocean-beach', date);
    const b = getKarlComment(80, 'sunset', 'sf-twin-peaks', date);
    // Not guaranteed to differ on every pair, but statistically likely.
    // We just verify both return valid strings.
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });

  test('SF uses Karl voice', () => {
    const comment = getKarlComment(10, 'sunset', 'test', new Date(), 'sf');
    expect(comment.toLowerCase()).toContain('karl');
  });

  test('Austin uses neutral voice', () => {
    const comment = getKarlComment(90, 'sunset', 'test', new Date(), 'austin');
    expect(comment.toLowerCase()).not.toContain('karl');
  });
});
```

- [ ] **Step 8: Run the full test suite**

```bash
cd ~/sf-sky && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/utils/__tests__/
git commit -m "test: add comprehensive unit test suite

Covers weather (fogDensity, getForecastAt), interpolation (idw,
colorRampFor, computeDynamicRange), narrative (Karl copy per metric),
outlook (city outlook classification), and karl-copy (deterministic
comment selection). ~45 test cases total."
```

---

## Task 10: Supabase Persistence — Client Setup

**Branch:** `feat/submission-persistence`

**Files:**
- Create: `src/utils/supabase.ts`
- Create: `.env.example`
- Modify: `package.json`

- [ ] **Step 1: Create the branch**

```bash
cd ~/sf-sky && git checkout main && git checkout -b feat/submission-persistence
```

- [ ] **Step 2: Install Supabase client**

```bash
cd ~/sf-sky && npm install @supabase/supabase-js
```

- [ ] **Step 3: Create Supabase client**

Create `src/utils/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Supabase client for anonymous form submissions (spot suggestions, bug
 * reports). Returns null if env vars are missing — callers should degrade
 * gracefully (show "thanks" and move on).
 */
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export interface SpotSuggestionRow {
  name: string;
  location: string;
  notes: string | null;
  city: string;
}

export interface BugReportRow {
  description: string;
  page_context: string | null;
  user_agent: string | null;
}

export async function submitSpotSuggestion(row: SpotSuggestionRow): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('spot_suggestions').insert(row);
  return !error;
}

export async function submitBugReport(row: BugReportRow): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('bug_reports').insert(row);
  return !error;
}
```

- [ ] **Step 4: Create .env.example**

Create `.env.example`:

```
# Supabase — anonymous submissions for spot suggestions and bug reports.
# Get these from your Supabase project settings → API.
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] **Step 5: Verify .env.local is in .gitignore**

```bash
cd ~/sf-sky && grep -q '.env.local' .gitignore && echo "OK" || echo ".env.local >> .gitignore"
```

If not present, add `.env.local` to `.gitignore`.

- [ ] **Step 6: Commit**

```bash
git add src/utils/supabase.ts .env.example package.json package-lock.json
git commit -m "feat: add Supabase client for anonymous form submissions

Thin client with insert helpers for spot_suggestions and bug_reports.
Gracefully degrades to no-op if env vars are missing."
```

---

## Task 11: Supabase Persistence — Wire Up Overlays

**Branch:** `feat/submission-persistence` (continue)

**Files:**
- Modify: `src/components/SuggestSpotOverlay.tsx`
- Modify: `src/components/BugReportOverlay.tsx`

- [ ] **Step 1: Wire SuggestSpotOverlay**

In `src/components/SuggestSpotOverlay.tsx`:

Add import at top:
```ts
import { submitSpotSuggestion } from '../utils/supabase';
```

Add a `submitting` state and `error` state after the existing useState calls:
```ts
const [submitting, setSubmitting] = useState(false);
const [error, setError] = useState(false);
```

Replace the `handleSubmit` function (lines 79-87) with:

```ts
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || submitting) return;

    setSubmitting(true);
    setError(false);

    const ok = await submitSpotSuggestion({
      name: trimmedName,
      location: '',
      notes: why.trim() || null,
      city: 'sf',
    });

    setSubmitting(false);

    if (ok) {
      setSubmitted(true);
    } else {
      // Supabase unreachable — fall back to mailto.
      window.location.href = buildMailto(trimmedName, why.trim());
      setSubmitted(true);
    }
  }
```

Update the submit button (line 166) to show loading state — replace `disabled={!canSubmit}` with:

```tsx
disabled={!canSubmit || submitting}
```

And change the button text from `Send it to Karl` to:

```tsx
{submitting ? 'Sending...' : 'Send it to Karl'}
```

- [ ] **Step 2: Wire BugReportOverlay**

In `src/components/BugReportOverlay.tsx`:

Add import at top:
```ts
import { submitBugReport } from '../utils/supabase';
```

Add states:
```ts
const [submitting, setSubmitting] = useState(false);
```

Replace the `handleSubmit` function (lines 71-78) with:

```ts
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = description.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);

    const ok = await submitBugReport({
      description: trimmed,
      page_context: typeof window !== 'undefined' ? window.location.href : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });

    setSubmitting(false);

    if (ok) {
      setSubmitted(true);
    } else {
      // Supabase unreachable — fall back to mailto.
      window.location.href = buildMailto(trimmed);
      setSubmitted(true);
    }
  }
```

Update the submit button `disabled={!canSubmit}` to `disabled={!canSubmit || submitting}` and change text to:

```tsx
{submitting ? 'Sending...' : 'Send to Karl'}
```

- [ ] **Step 3: Verify build**

```bash
cd ~/sf-sky && npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/SuggestSpotOverlay.tsx src/components/BugReportOverlay.tsx
git commit -m "feat: wire spot suggestion and bug report forms to Supabase

Both forms now submit to Supabase first, falling back to mailto
if the insert fails. Loading state prevents double-submit."
```

---

## Task 12: Code Quality — README & TypeScript Strictness

**Branch:** `chore/code-quality`

**Files:**
- Modify: `README.md`
- Modify: `tsconfig.app.json`

- [ ] **Step 1: Create the branch**

```bash
cd ~/sf-sky && git checkout main && git checkout -b chore/code-quality
```

- [ ] **Step 2: Replace README**

Replace the entire contents of `README.md` with:

```markdown
# SF Sky

A sunset, sunrise, and stargazing spot finder for San Francisco and the Bay Area. Scores every viewpoint in real-time by blending terrain quality with live weather forecasts from Open-Meteo.

Personality by **Karl** — SF's famous fog.

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Leaflet / react-leaflet (interactive map)
- Open-Meteo API (weather + air quality, free, no key)
- SunCalc (sunrise/sunset/moon calculations)
- Supabase (anonymous form submissions)
- PWA with service worker

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build & Deploy

```bash
npm run build    # outputs to dist/
npm run preview  # preview the production build locally
```

Deployed to Vercel.

## Scoring Model

Each spot has a **base score** (0-100) for sunrise, sunset, and stargazing based on terrain, light pollution, and horizon quality. At runtime, the base score is blended with a **weather score** derived from the Open-Meteo forecast at event time:

- **Sun events:** 35% base + 65% weather
- **Stargazing:** 45% base + 55% weather

Condition overrides cap the score when conditions are objectively terrible (heavy fog, full overcast, very low visibility).

## Adding a Spot

Add an entry to `src/data/spots.ts`:

```ts
{
  id: "sf-your-spot",
  name: "Your Spot Name",
  lat: 37.xxxx, lng: -122.xxxx,
  city: 'sf',
  category: 'hilltop' | 'waterfront' | 'park',
  elevation: 100,  // meters
  lightPollution: 'Low' | 'Mid' | 'High',
  horizonQuality: 'Open' | 'Partial' | 'Blocked',
  sunrise: 70,   // 0-100
  sunset: 70,    // 0-100
  stargazing: 70, // 0-100
}
```

## Conventions

- **Commits:** conventional commits (`fix:`, `feat:`, `refactor:`, `chore:`, `test:`)
- **Branches:** one feature branch per concern, PRed independently
- **Tests:** `npm test` (vitest)
```

- [ ] **Step 3: Add noUncheckedIndexedAccess**

In `tsconfig.app.json`, add `"noUncheckedIndexedAccess": true` after the `"noFallthroughCasesInSwitch": true` line:

```json
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
```

- [ ] **Step 4: Check for resulting type errors**

```bash
cd ~/sf-sky && npx tsc --noEmit 2>&1 | head -40
```

Fix any errors that appear — they'll likely be cases where an array index or object property access needs a `?.` or an explicit undefined check. These are the exact class of bugs that cause NaN propagation.

- [ ] **Step 5: Verify build**

```bash
cd ~/sf-sky && npm run build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add README.md tsconfig.app.json src/
git commit -m "chore: replace boilerplate README and enable noUncheckedIndexedAccess

README now documents the project, scoring model, how to add spots,
and conventions. noUncheckedIndexedAccess catches undefined-from-index
bugs at compile time."
```

---

## Summary

| Task | Branch | What |
|---|---|---|
| 1-3 | `fix/scoring-accuracy` | Weight rebalance, fog wiring, overrides, regression tests |
| 4-6 | `fix/bugs-and-error-handling` | Duplicate ID, defensive parsing, error boundaries |
| 7-8, 8b | `refactor/app-decomposition` | Constants, BottomPanel, useOnboarding, useAppState extraction |
| 9 | `feat/test-suite` | Full unit test suite (weather, interpolate, narrative, outlook, karl-copy) |
| 10-11 | `feat/submission-persistence` | Supabase client + overlay wiring |
| 12 | `chore/code-quality` | README + TypeScript strictness |

**Merge order:** Tasks 1-3 first → then 4-6, 7-8, 10-11, 12 in any order → Task 9 last (depends on scoring being merged).
