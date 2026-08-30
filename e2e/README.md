# Browser regression scope

`npm run test:e2e` starts Vite on port 5001 and runs the Now-card scrubber and
forecast-trust journeys in desktop Chromium, desktop WebKit, and a 402 by 874
mobile WebKit profile. Open-Meteo weather and air-quality traffic is fully
intercepted and fulfilled by local, city-hour fixtures. Carto map tiles are
replaced by a one-pixel local fixture.

The trust-contract coverage includes loading, current and selected-hour
forecasts, a missing hour, initial fetch failure, stale cache, saved forecast
after a failed refresh, partial air-quality data, and absent metric
placeholders. It also checks Search result evidence, map and score-card
accessibility labels, exact fixture request counts, and the absence of
unhandled Open-Meteo traffic. The stale and refresh scenarios seed the same
session-storage cache shape used by the application.

The mobile project exercises the scrubber's pointer-drag behavior at the narrow
viewport. A final physical-device gate remains for native finger tracking,
momentum, safe-area insets, and pointer capture on the target iPhone and iOS
version. Those hardware behaviors cannot be proven by browser emulation.
