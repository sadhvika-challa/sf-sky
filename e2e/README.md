# Browser regression scope

`npm run test:e2e` starts Vite on port 5001 and runs the Now-card scrubber,
forecast-trust, timezone identity, and request-budget journeys in desktop
Chromium, desktop WebKit, and a 402 by 874 mobile WebKit profile. Open-Meteo
weather and air-quality traffic is fully intercepted and fulfilled by local,
city-hour fixtures. Carto map tiles are replaced by a one-pixel local fixture.

## Enforced request budgets

The browser suite treats these as product contracts:

| Journey | Forecast requests | Air-quality requests | Concurrency |
| --- | ---: | ---: | --- |
| Cold launch, overlay off | 0 | 0 | No weather work starts |
| Select one spot | 1 | 1 | At most 2 endpoint requests and 1 coordinate job |
| Cold San Francisco overlay | 25 | 0 | At most 3 coordinate jobs |
| Selected Twin Peaks plus overlay | 25 total | 1 | Twin Peaks forecast starts once and is shared |
| Warm selected spot plus warm overlay | 0 | 0 | Session cache satisfies both scopes |
| Selected-spot revalidation after 15 minutes | 1 new request | 1 new request | One refresh pair |
| Overlay retry generation | At most 25 new requests | 0 | Each anchor starts at most once, at most 3 coordinate jobs |
| Malformed HTTP 200 overlay retry | 25 initial plus 25 retry | 0 | Invalid data is not cached as success |
| AQ-only selected refresh failure and retry | 1 forecast per generation | 1 AQ per generation | Retry bypasses freshness for both endpoints |

Selected-spot demand has a reserved lane and takes priority over queued overlay
work. Overlay requests do not start until the user turns the overlay on. The
harness rejects duplicate coordinate starts within a generation and records
every intercepted request from start through the browser's `requestfinished`
or `requestfailed` terminal event.

## Cancellation and recovery contracts

Cancellation is tested through public controls, not React state or test-only
application hooks:

- Turning the overlay off aborts every active first-wave request within 1.5
  seconds, starts no queued anchors, and removes the overlay status.
- Settings, Switch city, Chicago cancels the active San Francisco generation.
  Returning through Settings to San Francisco and enabling the overlay starts
  one clean 25-anchor generation with no stale mutation or duplicate starts.
- Rapid route changes are generation-safe. A canceled request must terminate as
  a browser failure event, not merely be ignored by React state.
- Offline and HTTP 429 states recover to `ready` after Retry on desktop WebKit
  and mobile WebKit. Timeout recovery runs on desktop WebKit. Every recovery
  asserts the 25-request second-generation ceiling and three-job concurrency
  ceiling.
- A malformed HTTP 200 response reaches `invalid-data`, paints no wash, and
  Retry starts one fresh 25-anchor generation that can recover to `ready`.
- A malformed revalidation cannot replace a usable saved overlay in memory or
  session storage. Reload preserves the same accessible map summary and average,
  reports `saved`, explains the incomplete refresh, and permits recovery.
- An AQ-only selected refresh failure retains the prior complete snapshot as
  one coherent saved version. Its original retrieval time remains visible,
  incomplete AQ evidence is explained, and Retry refreshes both endpoints.

The deterministic overlay state values exercised by tests are `loading`,
`progressive`, `partial`, `ready`, `refreshing`, `saved`, `offline`, `timeout`,
`rate-limit`, and `invalid-data`. Partial and terminal failures expose Retry.
Progressive coverage does not.

## Trust and rendering contracts

The trust-contract coverage includes loading, current and selected-hour
forecasts, a missing hour, initial fetch failure and recovery, stale cache,
saved forecast after a failed refresh, partial air-quality data, and absent
metric placeholders. It also checks Search result evidence, map and score-card
accessibility labels, exact fixture request counts, and the absence of
unhandled Open-Meteo traffic. The stale and refresh scenarios seed the same
session-storage cache shape used by the application.

A weather wash requires at least nine usable samples for the active metric and
canonical hour. The browser gate combines missing metric values, empty
forecasts, and exact active-hour omissions so only eight anchors are usable. It
asserts zero visible weather raster opacity both before the threshold and after
the generation reaches its terminal `invalid-data` state.

The overlay's accessible map summary uses the active city's local date and
time-zone abbreviation. Repeated fall-back hours remain distinguishable,
including the first `1:00 AM PDT` and second `1:00 AM PST` occurrences in San
Francisco.

## Location and device-storage contracts

Desktop Chromium and mobile WebKit exercise location as an explicit privacy
choice. The geolocation provider is instrumented before application code loads,
and its call count remains zero through launch until the user selects **Use my
location**. The allowed journey asserts exactly one provider call, a restored
map marker, and distance-bearing Search results. Reduced-accuracy coordinates
remain labeled as approximate in the location status, marker identity, and
derived distance copy.

Denied, timeout, and unavailable responses each expose their distinct status
and recover through the public **Retry** action. Unsupported browsers explain
that city browsing remains available without exposing a futile retry. A denied
journey also switches to Austin through the public Settings and city sheet,
proving that location failure does not block manual browsing.

Saved spots do not yet have a product UI in this release slice. The browser
acceptance test therefore uses an explicit integration fixture built from the
production `SavedSpotsController`, browser storage adapter, catalog IDs, and
storage subscription. A save from one real page must update another page in
the same browser context without reload. This proves the web cross-page
storage event path without inventing hidden user-facing controls. Visible save
and unsave journeys remain a gate for the later saved-spots UI slice.

The same two-page fixture also holds the production per-key Web Lock before
issuing writes. Both pages therefore begin their save intent before either can
commit or rehydrate. Different-ID saves must produce one durable union, then
both controllers must converge on that union. Same-ID save and unsave intents
are queued in both lock orders. The later lock-ordered durable commit wins, and
neither operation may report success while it is still waiting for the lock.
Browsers without Web Locks expose the adapter's documented in-process
consistency level and do not claim cross-page atomicity.

## Interaction stability and physical-device gate

Pointer tests wait for the spot sheet's animations and geometry to settle
before measuring or dragging the forecast scrubber and dismissal handle. This
keeps the input coordinate truthful without weakening the requirements that
the scrubber changes hour, the sheet remains open, card order remains stable,
and the dedicated handle dismisses the sheet.

The mobile project exercises pointer-drag behavior at the narrow viewport. A
selected forecast failure and public Retry recovery also run in mobile WebKit.
This covers the responsive action path before the native device gate. A final
physical-device gate remains for native finger tracking, momentum,
safe-area insets, and pointer capture on the target iPhone and iOS version.
Those hardware behaviors cannot be proven by browser emulation.
