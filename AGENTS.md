# Soleil Agent Guide

## Project Purpose

Soleil helps people choose a place and time for sunrise, sunset, and stargazing. It combines curated viewing spots with live weather, air quality, astronomical timing, and location-aware map experiences.

The current application is a React and TypeScript PWA. The product direction is one shared application core delivered on the web and in an iOS shell. Preserve the useful web experience and share links while adding native capabilities incrementally.

## Product Commitments

- Discuss UI changes with Sadhvika before implementing them. Preserve the lighter map and approved timeline placement unless she approves another direction.
- Private custom spots belong only in device storage, never in the curated catalog, source code, public listings, or shared cards and links. Future publication must preserve an explicit private visibility choice and enforce ownership if account sync is introduced.

- Support every configured city and feature unless an issue explicitly narrows the scope.
- Treat score, forecast confidence, and forecast freshness as distinct concepts.
- Keep the map, selected spot sheet, score, weather presentation, and time selection synchronized.
- Show one sticky bottom scrubber immediately on the map. Opening a spot moves that control into the white spot sheet footer, preserving selected time and exact event snapping. Never show map and spot scrubbing controls simultaneously. Do not show the bottom Now, Sunrise, Sunset, or Stargazing icon row. Keep the timeline label, selected time, card, and map scores synchronized. Keep confidence beside the score and text labels out of the colored sky artwork. Do not restore the nighttime event strip without Sadhvika's approval.
- The approved refresh direction uses the map and pins from the Sky Window mockup (displayed modern layout option 2), with white surfaces and natural atmospheric sky imagery. Retain DM Mono typewriter typography for time and useful data labels alongside readable primary typography. Refine and discuss the visual target before implementing it.
- Use bright mint and spring-green spot fills with readable dark numerals. The timeline blends continuously between its solar-time colors and has no separate top-right Now control. Keep bookmark, spot name, confidence and score on one header line. Successful bookmarking changes the icon without adding visible success subtext; preserve accessible announcements and visible error recovery. Confidence opens an explanation with event-relative review times, conditional on fresh, complete data. Private roof estimates remain uncalibrated regardless of forecast proximity. Sky previews illustrate the selected hour's light and cloud category rather than an exact view.
- The latest approved composition combines the first compact-card mockup with the second map and circular-pin style, as shown in Emerald Sky Dock. Pin colors progress from light rose, sand and gold through fresh green to deep emerald. The best scores (80 and above) should attract attention through darker saturated fills; a selected pin retains its score fill and gains an outline. The main spot card keeps travel controls, sky imagery, temperature and Details, with deeper weather and spot information in Details. Use exactly three ascending confidence bars beside the score, without a visible Low, Medium or High word until the explanation opens. Do not draw a divider between the main card and the shared timeline.
- Spot details open in a bottom sheet that leaves the uncovered map usable. Selecting another pin switches the spot without requiring the sheet to close. Allow the sheet to expand for more detail, with a clear collapse and close action; do not require a full-screen modal to browse spots.
- Persist saved spots across launches without requiring an account for the first release.
- Show web/PWA location access in an automatic popup once per browsing session, with Location in Settings to reopen it. Request browser permission only after the user chooses Use my location. Keep the map clear of the persistent location card. The timeline uses a single absolute-time scale for its thumb and event markers, with exact sunrise, sunset, and stargazing snap points from the same event times as the cards.
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


The latest approved sky labels are Daytime, Sunrise, Sunset, and Nighttime. The current instant is a timeline marker, not a sky category. Derive its displayed phase from the selected time and local solar events. Preserve existing internal view keys and shared-link compatibility. Spot cards reveal upward from a stationary timeline dock, with one scrubber during opening and closing. Align the selected pager before paint and do not retain an old sky image while its source changes. Respect reduced motion.
