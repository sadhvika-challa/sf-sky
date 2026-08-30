# Soleil Agent Guide

## Project Purpose

Soleil helps people choose a place and time for sunrise, sunset, and stargazing. It combines curated viewing spots with live weather, air quality, astronomical timing, and location-aware map experiences.

The current application is a React and TypeScript PWA. The product direction is one shared application core delivered on the web and in an iOS shell. Preserve the useful web experience and share links while adding native capabilities incrementally.

## Product Commitments

- Support every configured city and feature unless an issue explicitly narrows the scope.
- Treat score, forecast confidence, and forecast freshness as distinct concepts.
- Keep the map, selected spot sheet, score, weather presentation, and time selection synchronized.
- Put time scrubbing for a selected spot in the Now experience. Sunrise, Sunset, and Stargazing remain event-specific views.
- Persist saved spots across launches without requiring an account for the first release.
- Ask for location only after explaining the user benefit. The experience must still work when location is denied or unavailable.
- Keep the PWA viable as the public, shareable counterpart to the iOS app.
- The all-city weather overlay is not required for the first App Store release.

## Repository Boundaries

- `src/components/` owns interface components and map or sheet interactions.
- `src/hooks/` owns stateful browser and forecast integrations.
- `src/utils/` owns deterministic scoring, weather parsing, confidence, copy, and other reusable logic.
- `src/data/` owns curated cities, spots, neighborhoods, and events.
- `public/` owns the PWA manifest, service worker, and static icons.
- `.github/` owns contributor workflow and CI configuration.
- Keep scoring and forecast transforms in pure functions when possible. Do not duplicate scoring rules inside components.
- Do not commit secrets, signing assets, provisioning profiles, Apple credentials, or private user data.
- Do not introduce a backend, account system, paid service, analytics collection, or new privacy-sensitive data flow without an explicit product decision.
- Treat Open-Meteo and map tiles as fallible external dependencies. Preserve useful loading, partial-data, stale-data, offline, and error states.

## Change Ownership

Every issue and pull request must name one owner and list the files or directories it expects to change. Agents working concurrently must use isolated branches or worktrees and avoid overlapping files. If scope must expand into files owned by another active change, coordinate before editing.

Keep changes bounded. Separate product behavior, infrastructure, dependency upgrades, and broad refactors when they can be reviewed independently.

## Verification Expectations

Run the checks appropriate to the change, and record the commands and results in the pull request.

The baseline suite is:

```bash
npm ci
npm run lint
npm exec -- tsc -b
npm test
npm run build
```

Additional evidence is required when relevant:

- Pure scoring, confidence, weather, or persistence logic: Add or update deterministic Vitest coverage.
- User flows: Verify the primary path plus denied permission, missing forecast, offline, empty, loading, and error states that the change can affect.
- Visual or responsive changes: Provide before and after screenshots at a narrow phone viewport and a desktop viewport.
- Map or timeline changes: Verify selecting, dismissing, panning, zooming, scrubbing, returning to Now, and switching cities as applicable.
- Weather request changes: Report request count, caching behavior, refresh behavior, and degraded API behavior.
- PWA changes: Verify a production build, manifest, service-worker registration, installability, and an offline navigation fallback.
- Native changes: Verify the web fallback plus an iOS simulator or physical-device path. State the Xcode, simulator or device, iOS version, and backend environment used.
- Accessibility-sensitive changes: Verify keyboard access, visible focus, labels, reduced motion, Dynamic Type or text scaling where supported, and adequate contrast.

Do not claim a device, browser, offline, or App Store behavior was verified unless it was actually exercised. Record anything not tested as a known gap.

## Review and Risk

Classify each pull request as low, medium, or high risk.

- Low: Documentation, tests, isolated copy, or reversible styling with no behavior change.
- Medium: Bounded interaction, state, forecast, persistence, build, or dependency changes.
- High: Scoring contract changes, broad navigation or map rewrites, privacy changes, native signing or entitlements, data loss risk, or release configuration.

Low- and medium-risk changes may merge after CI passes and an independent review. High-risk work and milestone releases require an explicit human gate. Never merge with unresolved review comments, failing checks, missing required evidence, or unclear rollback behavior.

## Writing and Interface Copy

Use proper capitalization and punctuation in user-facing text. Keep language plain, specific, and honest about forecast uncertainty. Never use an em dash. Do not describe probabilistic forecasts as guarantees.
