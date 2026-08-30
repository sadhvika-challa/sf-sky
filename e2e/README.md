# Browser regression scope

`npm run test:e2e` starts Vite on port 5001 and runs the Now-card scrubber
journey in desktop Chromium, desktop WebKit, and a 402 by 874 mobile WebKit
profile. Open-Meteo weather and air-quality traffic is fulfilled by local,
city-hour fixtures. Carto map tiles are replaced by a one-pixel local fixture.

The mobile project exercises the scrubber's pointer-drag behavior at the narrow
viewport. A final physical-device gate remains for native finger tracking,
momentum, safe-area insets, and pointer capture on the target iPhone and iOS
version. Those hardware behaviors cannot be proven by browser emulation.
