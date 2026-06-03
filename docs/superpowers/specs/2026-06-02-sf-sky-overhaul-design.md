# SF Sky — Code Quality & Scoring Overhaul

**Date:** 2026-06-02
**Status:** Design approved
**Scope:** Scoring accuracy fix, App.tsx decomposition, bug fixes, error handling, test suite, Supabase persistence, code quality improvements
**UI/UX:** No user-facing design changes. All work is under the hood.

---

## 1. Scoring Model Fix

**Branch:** `fix/scoring-accuracy`

### Problem

The live scoring model produces inflated scores when weather conditions are poor. A user observed a score of 93 at Lands End / Sutro Baths (`sf-lands-end`, base sunset: 92) during a completely foggy evening.

Root causes:

1. **Base weight too high.** The 50/50 base-weather split means a base-92 spot can never drop below ~46 even with worst-case weather.
2. **Artificial cloud score floors.** Lines 54-57 in `scoring.ts` floor the cloud score at 65-70 for low total cloud cover. Marine-layer fog reads as high low-cloud but moderate total cloud, so the floor fires and prevents the score from dropping.
3. **`fogDensity()` is never used in scoring.** The function exists in `weather.ts` (compositing visibility, low-cloud, and humidity into a 0-1 density) but is only called by the weather heatmap layer. The scoring path is entirely fog-blind.

### Fix

#### 1.1 Rebalance weights

| Event type | Old base/weather | New base/weather |
|---|---|---|
| Sunrise / Sunset | 50% / 50% | 35% / 65% |
| Stargazing | 55% / 45% | 45% / 55% |

#### 1.2 Remove misleading cloud score floors

Delete these lines in `scoreSunWeather()`:

```ts
if (Number.isFinite(total) && total < 10) cloudScore = Math.max(cloudScore, 70);
if (Number.isFinite(total) && total < 25 && cloudLow < 25) {
  cloudScore = Math.max(cloudScore, 65);
}
```

Clear skies will still score well naturally (low cloud values produce high `midScore` / `highScore`). The floors exist to protect "pleasant but un-dramatic" evenings, but they also protect fog — which is the opposite of the intent.

#### 1.3 Wire `fogDensity()` into `scoreSunWeather()`

Add a fog penalty term after the cloud/visibility/AQI weighted score:

```ts
import { fogDensity } from './weather';

// Inside scoreSunWeather():
const fog = fogDensity(h);
const fogPenalty = fog > 0.5 ? fog * 40 : 0;
const weighted = cloudScore * 0.7 + visScore * 0.3 - aqiPenalty - fogPenalty;
```

This makes fog a first-class input. A classic Karl-on-the-Sunset hour (fog ~0.85) would incur a ~34-point penalty.

#### 1.4 Post-blend condition overrides

Add a reality-check layer in `computeLiveScore()` that runs after the base-weather blend:

```ts
// After computing `blended`:
const fog = fogDensity(hourly);
if (type === 'sunrise' || type === 'sunset') {
  if (fog > 0.7) return Math.min(Math.round(blended), 35);
  if (hourly.cloud > 95) return Math.min(Math.round(blended), 30);
  if (hourly.visibilityKm < 2) return Math.min(Math.round(blended), 40);
}
if (type === 'stargazing') {
  if (hourly.cloud > 95) return Math.min(Math.round(blended), 20);
}
```

These overrides prevent any spot from scoring "great" when conditions are objectively terrible, regardless of its base score.

#### 1.5 Regression test

The Lands End foggy-evening scenario becomes a named test case:

```ts
test('Lands End scores low during heavy fog', () => {
  const landsEnd = { sunrise: 35, sunset: 92, stargazing: 60, ... };
  const foggyHour = {
    cloud: 80, cloudLow: 95, cloudMid: 10, cloudHigh: 5,
    visibilityKm: 1.2, humidity: 98, pm25: 5, ...
  };
  const score = computeLiveScore(landsEnd, 'sunset', foggyHour);
  expect(score).toBeLessThanOrEqual(35);
});
```

### Files

- `src/utils/scoring.ts` — weight changes, floor removal, fog penalty, overrides
- New: `src/utils/__tests__/scoring.test.ts`

---

## 2. App.tsx Decomposition

**Branch:** `refactor/app-decomposition`

### Problem

`App.tsx` is 864 lines with ~25 `useState` calls. All state, handlers, and onboarding logic live in one file. This makes it hard to reason about, hard to test, and risky to modify.

### Fix

#### 2.1 `useAppState` hook

Extract core application state into `src/hooks/useAppState.ts`:

- State: `selectedSpot`, `highlightedSpot`, `menuOpen`, `searchOpen`, `suggestOpen`, `bugReportOpen`, `suggestSeed`, `filters`, `travelMode`, `appMode`, `homeCityId`, `activeCityId`, `citySheetOpen`, `weatherMetric`, `weatherHourKey`, `weatherSheetExpanded`
- Handlers: `handleSelectSpot`, `handleModeChange`, `handleReset`, `setActiveCity`, `setHomeCity`, `handleOpenSuggest`, `handleSuggestFromSearch`, `handleSuggestFromMenu`, `handleReportBugFromMenu`
- All localStorage persistence effects

Internally uses `useReducer` with a discriminated-union action type for predictable state transitions. The specific action type names and reducer shape are implementation details — the spec only prescribes the public API (state values + handler functions returned as a flat object).

#### 2.2 `useOnboarding` hook

Extract the entire onboarding chain into `src/hooks/useOnboarding.ts`:

- State: `showWelcome`, `showTapSpotHint`, `tapSpotAnchor`, `showScrollCardsHint`, `showWeatherModeHint`, `showMetricsHint`, `showScrubHint`, `showCompleteHint`
- Handlers: all `handleDismiss*` callbacks, `handleScorePanelCardSwipe`, `handleWeatherMetricChange` (wraps metric setter), `handleWeatherHourChange` (wraps hour setter)
- localStorage flag reads/writes via `onboarding.ts` utils

#### 2.3 `BottomPanel` extraction

Move the `BottomPanel` function component (currently lines 733-862 in App.tsx) to `src/components/BottomPanel.tsx`. Pure cut-paste — no logic changes.

#### 2.4 Constants extraction

Move to `src/utils/constants.ts`:
- `DISMISS_HIGHLIGHT_MS`
- `APP_MODE_STORAGE_KEY`, `HOME_CITY_KEY`, `ACTIVE_CITY_KEY`
- `defaultFilters`

### Result

App.tsx shrinks from ~864 lines to ~250-300 lines of pure JSX composition — wiring hooks to components.

### Files

- `src/App.tsx` — slimmed down
- New: `src/hooks/useAppState.ts`
- New: `src/hooks/useOnboarding.ts`
- New: `src/components/BottomPanel.tsx`
- New: `src/utils/constants.ts`

---

## 3. Bug Fixes & Error Handling

**Branch:** `fix/bugs-and-error-handling`

### 3.1 Duplicate spot ID

Two spots share `id: "sf-inspiration-point"`:
- Line 477: Presidio — Inspiration Point (lat 37.7930, lng -122.4650)
- Line 991: Inspiration Point near Tilden/Orinda (lat 37.8950, lng -122.2250)

**Fix:** Rename the Tilden one to `sf-tilden-inspiration-point`. The Presidio spot keeps the original ID (more canonical SF spot, likely has deep-link references).

### 3.2 Error boundaries

Two React error boundaries:

**`MapErrorBoundary`** — wraps `<MapView>`:
- On crash: renders a static placeholder with spot name, a "Reload Map" button, and a brief error message
- The rest of the UI (search, filters, panels) stays functional

**`WeatherErrorBoundary`** — wraps weather mode components (InsightCard, WeatherLayer, BottomPanel):
- On crash: auto-switches to explore mode, shows a brief toast ("Weather data unavailable")
- Uses `componentDidCatch` to log the error for debugging

Both boundaries use React's class-component `getDerivedStateFromError` pattern (error boundaries don't support hooks).

### 3.3 Defensive weather parsing

In `weather.ts` `mergeResponses()`:
- Wrap the merge loop in try/catch — on malformed data, return `{ hours: {}, fetchedAt: Date.now() }`
- The existing `pick()` helper already returns NaN for missing array entries, but consumers aren't always guarding against NaN propagation

In `scoring.ts`:
- Add `Number.isFinite()` guards before every multiplication/division in `scoreSunWeather()` and `scoreStargazingWeather()` where they're missing
- If any input is NaN after guarding, fall back to the spot's static base score instead of producing a NaN-contaminated blend

### Files

- `src/data/spots.ts` — rename duplicate ID
- New: `src/components/MapErrorBoundary.tsx`
- New: `src/components/WeatherErrorBoundary.tsx`
- `src/utils/weather.ts` — defensive parsing
- `src/utils/scoring.ts` — NaN guards
- `src/App.tsx` — wrap MapView and weather components with boundaries

---

## 4. Test Suite

**Branch:** `feat/test-suite`

### Setup

- Add `vitest` as a devDependency
- Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `package.json`
- Vitest picks up the existing `vite.config.ts` transform pipeline — zero extra config

### Test coverage

| Module | Functions to test | Approx. test count |
|---|---|---|
| `scoring.ts` | `computeLiveScore`, `scoreSunWeather`, `scoreStargazingWeather`, `getScoreTier`, `cloudCoverLabel`, `visibilityPercent`, condition overrides | 12-15 |
| `weather.ts` | `mergeResponses`, `getForecastAt`, `fogDensity`, defensive parsing edge cases | 8-10 |
| `interpolate.ts` | `idw`, `colorRampFor`, `computeDynamicRange`, `formatMetricValue` | 6-8 |
| `narrative.ts` | `narrativeFor` for each metric, edge cases (empty maps, NaN) | 5-6 |
| `outlook.ts` | `computeCityOutlook`, status classification thresholds | 3-4 |
| `karl-copy.ts` | `getKarlComment`, `bucketFor`, hash determinism | 3-4 |
| `events.ts` | `getUpcomingEventTimes` — date boundary handling | 3-4 |

**Total:** ~40-50 unit tests.

### Test file location

Each test file lives next to its source: `src/utils/__tests__/<name>.test.ts`, `src/hooks/__tests__/<name>.test.ts`.

### What we are NOT testing (for now)

- Component rendering / snapshot tests — UI is stable and not changing
- E2E browser tests — disproportionate setup cost for current needs
- Integration tests against Open-Meteo — mock the HTTP layer instead

### Files

- `package.json` — add vitest + test scripts
- New: `src/utils/__tests__/scoring.test.ts`
- New: `src/utils/__tests__/weather.test.ts`
- New: `src/utils/__tests__/interpolate.test.ts`
- New: `src/utils/__tests__/narrative.test.ts`
- New: `src/utils/__tests__/outlook.test.ts`
- New: `src/utils/__tests__/karl-copy.test.ts`
- New: `src/utils/__tests__/events.test.ts`

---

## 5. Submission Persistence (Supabase)

**Branch:** `feat/submission-persistence`

### Schema

**Table: `spot_suggestions`**

| Column | Type | Notes |
|---|---|---|
| id | uuid | Auto-generated primary key |
| name | text | Suggested spot name |
| location | text | Freeform description or coordinates |
| notes | text (nullable) | Why it's a good spot |
| city | text | Which city context they submitted from |
| created_at | timestamptz | Auto, default `now()` |

**Table: `bug_reports`**

| Column | Type | Notes |
|---|---|---|
| id | uuid | Auto-generated primary key |
| description | text | What went wrong |
| page_context | text (nullable) | Mode, selected spot, active city at time of report |
| user_agent | text (nullable) | `navigator.userAgent` for debugging |
| created_at | timestamptz | Auto, default `now()` |

### Implementation

1. Install `@supabase/supabase-js`
2. Create `src/utils/supabase.ts` — thin client with anon key + project URL (env vars via Vite's `import.meta.env`)
3. Wire `SuggestSpotOverlay` submit handler → `supabase.from('spot_suggestions').insert()`
4. Wire `BugReportOverlay` submit handler → `supabase.from('bug_reports').insert()`
5. Add inline success/error feedback in each overlay (green checkmark or red error text — no toast library needed)

### Security

- No auth, no user accounts — anonymous suggestion boxes
- Supabase RLS: enable insert-only policy on both tables (anon role can INSERT, cannot SELECT/UPDATE/DELETE)
- Rate limiting can be added later if spam becomes an issue

### Graceful degradation

If Supabase is unreachable, the form closes with a "Thanks, we'll review it" message. The submission is lost but the user isn't blocked. No retry queue — not worth the complexity for anonymous suggestions.

### Files

- `package.json` — add `@supabase/supabase-js`
- New: `src/utils/supabase.ts`
- `src/components/SuggestSpotOverlay.tsx` — wire submit + feedback
- `src/components/BugReportOverlay.tsx` — wire submit + feedback
- `.env.local` (gitignored by Vite default) — Supabase URL + anon key as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- `.env.example` — template with placeholder values for other contributors

---

## 6. Code Quality Improvements

**Branch:** `chore/code-quality`

### 6.1 README

Replace the default Vite boilerplate with:
- Project description (what SF Sky is, the Karl personality)
- Tech stack summary
- Setup instructions (`npm install && npm run dev`)
- Build & deploy (`npm run build`, deployed to Vercel)
- How to add a new spot (format of the `spots.ts` entries)
- Scoring model summary (base score + weather blend + condition overrides)
- Branch conventions (conventional commits)

### 6.2 TypeScript strictness

In `tsconfig.app.json`:
- Verify `strict: true` is enabled (Vite templates usually set this)
- Add `noUncheckedIndexedAccess: true` — catches the exact class of bug where array/object lookups return `undefined` and propagate as NaN through math
- Fix any resulting type errors (likely a handful of `?.` additions)

### Files

- `README.md`
- `tsconfig.app.json`
- Scattered `?.` / type-narrowing fixes as needed

---

## 7. Branch Strategy & Merge Order

```
main
  |
  +-- fix/scoring-accuracy          (merge 1st — tests depend on new logic)
  +-- refactor/app-decomposition    (independent, merge 2nd or 3rd)
  +-- fix/bugs-and-error-handling   (independent, merge 2nd or 3rd)
  +-- feat/test-suite               (depends on scoring-accuracy being merged)
  +-- feat/submission-persistence   (fully independent)
  +-- chore/code-quality            (fully independent)
```

Each branch gets its own PR. No branch depends on another except `feat/test-suite` which should be rebased on top of `fix/scoring-accuracy` before merging.

---

## Out of Scope (Explicit)

- No UI/UX changes — the app looks and feels the same to users
- No new cities or spots
- No weather mode for Austin/Santa Cruz (infrastructure exists but needs neighborhood data — separate effort)
- No E2E tests or component tests
- No routing API integration for travel times (current estimate is good enough)
- No user accounts or authentication
