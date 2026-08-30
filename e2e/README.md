# Browser regression scope

## Production PWA acceptance

`npm run test:pwa` builds the production artifact and starts a dedicated preview on port 5002 with service workers enabled. Its Chromium acceptance project verifies the installable manifest and decoded icon sizes through the browser, then proves a fresh revisioned application shell can cold-start the bundled spot catalog offline after the browser HTTP cache is cleared. It also proves that an obsolete Soleil shell is removed without deleting unrelated product caches.

This is an application-shell contract, not an offline weather claim. Live forecasts, map tiles, and directions require a connection. The test makes an external forecast request while offline and requires it to fail rather than returning invented current data. Browser automation cannot prove Safari's Add to Home Screen interaction, so that remains a physical iPhone release gate documented in [the PWA device acceptance checklist](../docs/pwa-device-acceptance.md).

CI retains each successful or failed browser run for seven days in artifacts named `browser-journeys-<commit>` and `pwa-acceptance-<commit>`. Each artifact includes a JSON report and any traces, screenshots, or test attachments emitted for that exact GitHub source commit. These artifacts support review, but they do not replace the physical iPhone record.

`npm run test:e2e` starts Vite on port 5001 and runs the Now-card scrubber,
forecast-trust, timezone identity, and request-budget journeys in desktop
Chromium, desktop WebKit, and a 402 by 874 mobile WebKit profile. Open-Meteo
weather and air-quality traffic is fully intercepted and fulfilled by local,
city-hour fixtures. OpenFreeMap's remote style is replaced by a local empty
MapLibre style, and any legacy CARTO request fails the test harness.

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

Saved spots have a visible, device-local product journey. Desktop Chromium and
the 402 by 874 mobile WebKit profile exercise the selected-sheet save control,
durable success feedback, settings count, one all-city collection, cross-city
selection, and removal from both the selected sheet and collection. The saved
selection must switch the active city and open the requested spot sheet in one
transition. Opening it starts exactly one forecast and one air-quality request,
without duplicate coordinate work.

Reload and same-context relaunch checks read the authoritative
`soleil-device-storage` IndexedDB database directly. The suite also verifies
the loading and empty states, corrupt-data recovery, future-version protection
without overwrite, IndexedDB-unavailable fail-closed behavior, write-failure
rollback, offline bundled-catalog access, keyboard activation, accessible
names, and the explicit explanation that saves stay on this device and do not
sync. Desktop and narrow-phone screenshots are attached to the acceptance run.

The lower-level browser acceptance test continues to use an explicit
integration fixture built from the production `SavedSpotsController`, browser
storage adapter, catalog IDs, and storage subscription. A save from one real
page must update another page in the same browser context without reload. This
proves the web cross-page storage event path independently of the visible UI.

The same two-page fixture gates both controller updates before either starts
its IndexedDB transaction. Both pages therefore begin their save intent before
either can commit or rehydrate. Different-ID saves must produce one union in
the authoritative `soleil-device-storage` database, mirror that union to the
legacy local-storage key, and converge both controllers. Same-ID save and
unsave intents are released in both transaction orders. The later durable
transaction wins, and neither operation may report success while it is still
gated. IndexedDB-unavailable environments fail closed instead of claiming
cross-page atomicity from a weaker storage mechanism.

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
