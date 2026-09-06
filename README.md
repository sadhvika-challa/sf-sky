# Soleil

Soleil is a mobile-first map for choosing where and when to watch a sunrise, sunset, or night sky. It combines curated viewing spots with live forecast data, air quality, astronomical timing, and place-specific qualities to present scores and explanations that help people decide where to go.

The repository ships the shared React application as both an installable PWA and a Capacitor iOS shell. Native behavior is added behind explicit platform boundaries so the shareable website remains available.

## Current experience

- Explore curated spots in San Francisco, Austin, Santa Cruz, and Chicago.
- Compare Now, Sunrise, Sunset, and Stargazing scores.
- Scrub through forecast hours and see scores and map presentation change.
- Inspect weather metrics, forecast confidence, access notes, and directions.
- Use a weather overlay and metric views for San Francisco.
- Search and filter spots, switch cities, use location, and install the PWA.

Scores are recommendations, not guarantees. Weather and air-quality data come from Open-Meteo. Astronomical calculations use SunCalc. The beta map uses OpenFreeMap vector data with OpenMapTiles and OpenStreetMap attribution.

## Technology

- React 19 and TypeScript
- Vite 8
- Leaflet and React Leaflet, with MapLibre GL for OpenFreeMap vector maps
- Tailwind CSS 4 plus application CSS
- Vitest
- A web app manifest and service worker for PWA installation and offline navigation fallback
- Capacitor 8, with an iOS 15+ shell and native Preferences storage for saved spots

No environment variables are required for local development today. Runtime forecast data and map tiles require network access. After one successful online production launch, the installed PWA can cold-start its bundled spot catalog without a connection. Cached forecasts can remain visible with their last-updated indicator, but forecast refreshes, map tiles, and directions require a connection.

## Local setup

Requirements:

- Node.js 22
- npm, using the committed lockfile

Install and start the development server:

```bash
npm ci
npm run dev -- --host 0.0.0.0 --port 5001
```

Open `http://localhost:5001`. Binding to `0.0.0.0` also allows phone testing on the same local network, subject to macOS firewall and browser location-security restrictions. For installability, service workers, and reliable browser geolocation on a phone, use an HTTPS preview deployment.

## Verification

Run the same checks used by CI:

```bash
npm run lint
npm exec -- tsc -b
npm test
npm run build
npm run ios:verify
npm run ios:release:verify
npm run test:pwa:artifact
```

`npm run build` verifies the committed root-scoped public URL contract before producing the PWA artifacts. After an exact candidate is deployed to a proposed permanent hostname, verify its anonymous, read-only HTTP contract separately:

```bash
npm run public:release:verify -- --origin https://example.com
```

This command does not deploy, change DNS, select a hostname, or approve App Store metadata.

The production output is written to `dist/`. Preview it locally with:

```bash
npm run preview -- --host 0.0.0.0 --port 5001
```

Run `npm run test:pwa` when changing the manifest, service worker, install prompt, entry assets, or build process. It builds the exact production artifact and verifies Chromium installability, declared icons, revisioned precaching, preservation of unrelated caches, and a cold offline launch with the browser HTTP cache cleared. Development mode intentionally does not register a service worker.

Before approving a public PWA candidate, complete the [physical iPhone PWA acceptance checklist](docs/pwa-device-acceptance.md) against the exact deployed commit. This verifies Safari installation and standalone behavior that browser automation cannot reproduce.

## Architecture

```text
src/App.tsx                 Application coordination and top-level state
src/components/            Map, sheets, cards, search, filters, and weather UI
src/hooks/                 Geolocation, forecast loading, caching, and timeline state
src/utils/                 Scoring, confidence, weather parsing, astronomy, and copy
src/data/                  Curated cities, spots, neighborhoods, and events
public/manifest.json       PWA metadata
public/sw.js               Static-asset cache and offline navigation fallback
```

`App.tsx` selects the active city, spot, event, filters, timeline hour, and weather mode. Forecast hooks load coordinate-based Open-Meteo data and cache it in session storage. Pure utilities turn forecast slices and curated spot attributes into scores, confidence, narratives, and display ranges. React Leaflet renders those results on the map, while sheets and cards provide the detailed decision flow. Durable web preferences such as city, filters, weather mode, onboarding, and units use local storage.

For the native workflow, boundaries, verification commands, and remaining Apple gates, see [Soleil iOS development](docs/ios-development.md). Release owners should also use the [physical iPhone PWA acceptance checklist](docs/pwa-device-acceptance.md), [App Store release checklist](docs/app-store-release-checklist.md), [metadata draft](docs/app-store-metadata.md), [privacy data inventory](docs/app-privacy-data-inventory.md), and [TestFlight acceptance checklist](docs/testflight-acceptance.md).

## Data and product boundaries

- Curated place data lives in `src/data/`. A spot change should preserve stable IDs and city ownership.
- Score and confidence rules live in `src/utils/`. Add deterministic tests when changing their contract.
- External forecast and map services can fail. New experiences must define loading, partial, stale, unavailable, and offline behavior.
- Do not commit Apple credentials, signing certificates, provisioning profiles, secrets, or private user data.
- The iOS shell is scaffolded, but physical-device behavior is not verified until the Xcode and device gates in the iOS development guide are complete.

See [AGENTS.md](AGENTS.md) for project decisions, file boundaries, risk levels, and evidence expectations. Use the GitHub work-item and pull-request templates for all changes.
