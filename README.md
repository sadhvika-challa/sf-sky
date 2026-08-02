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
