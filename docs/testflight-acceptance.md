# Soleil TestFlight acceptance

Complete this checklist for the exact processed TestFlight build that may be submitted to App Review. A pass from a local web preview, simulator, unsigned build, or different commit does not transfer to the candidate.

## Candidate identity

Every field is required. If the source commit cannot be tied to the uploaded archive, stop and rebuild from a clean checkout.

```text
Release owner:
Tester:
Test date and time zone:
Candidate commit (full SHA):
Branch or release tag:
Git working tree clean: Yes / No
CI result and URL:
Bundle identifier: com.sadhvika.soleil
Marketing version:
Build number:
App Store Connect build processing state:
TestFlight build installed:
Public web origin compiled into build:
Xcode version:
iOS SDK version:
Archive creation date:
Signing team name (private release log only):
Device: iPhone 17 Pro
iOS version: 26.6
Device storage available:
Network profiles tested:
Install path: New install / TestFlight update
Previous installed version and build, if update:
Device-family decision: iPhone only / iPhone and iPad
Known limitations approved before test:
```

Confirm in App Store Connect that the processed build's version, build number, bundle identifier, icon, minimum iOS, supported devices, encryption status, and privacy manifest match this record.

## Install and launch

- [ ] Install from TestFlight, not Xcode.
- [ ] Confirm the app name and icon are the approved release assets. Provisional artwork is a failure for public-release acceptance.
- [ ] Launch from a terminated state and confirm there is no blank, stale, or debug screen.
- [ ] Confirm launch orientation, safe areas, status bar, sheets, and map fit the iPhone 17 Pro.
- [ ] Background the app, lock and unlock the phone, then return. Confirm the current screen remains coherent.
- [ ] Force-quit and relaunch. Confirm saved state and live-data freshness are truthful.
- [ ] Confirm no web install prompt, service-worker update prompt, browser chrome, or `capacitor://localhost` URL is shown inside the iOS app.
- [ ] Confirm no debug logs, test controls, placeholder copy, or test endpoints are visible.

## Location optionality and recovery

Start from a clean install with location permission not yet requested.

- [ ] Confirm Soleil does not request location at launch.
- [ ] Confirm manual city and spot browsing works before any location prompt.
- [ ] Tap `Use my location`, choose `Don't Allow`, and confirm the app does not claim it moved to the user's location.
- [ ] Confirm the denied state offers `Open Settings`, `Retry location`, and `Choose a city`.
- [ ] Tap `Open Settings` and confirm iOS opens Soleil's app-specific Settings page.
- [ ] Set Location to `While Using the App`, return, and confirm Soleil asks for an explicit retry without making a false permission claim.
- [ ] Retry and confirm the location marker, distances, active city, and Best Nearby Now recover.
- [ ] Turn Precise Location off, return, retry, and confirm location and every derived distance are labeled approximate.
- [ ] Turn Precise Location on, return, retry, and confirm precise-location messaging recovers.
- [ ] Revoke permission, force-quit, and relaunch. Confirm manual city browsing remains usable.
- [ ] Confirm Soleil never requests Always or background location.
- [ ] Confirm a location failure, timeout, or unavailable result has a useful recovery path.

## Home and Best Nearby Now

- [ ] With location allowed, confirm Best Nearby Now ranks only supported spots and provides a clear reason for the recommendation.
- [ ] Confirm distance, score, confidence, and freshness correspond to the selected spot and time.
- [ ] Confirm approximate location does not imply precise distance.
- [ ] Confirm denied or unavailable location does not fabricate a nearby recommendation.
- [ ] Confirm a city can still be selected manually.
- [ ] Check an unusually weak, stale, partial, or unavailable forecast and confirm the app lowers trust appropriately instead of presenting false certainty.

## All cities and spots

- [ ] Browse San Francisco and open at least two spots.
- [ ] Browse Chicago and open at least two spots.
- [ ] Browse Austin and open at least two spots.
- [ ] Browse Santa Cruz and open at least two spots.
- [ ] Confirm map markers, selected spot, city labels, and detail cards agree.
- [ ] Confirm switching cities clears or updates any selection that no longer belongs to the active city.
- [ ] Confirm long names and dense map areas remain readable and tappable.

Record the exact spots used:

```text
San Francisco:
Chicago:
Austin:
Santa Cruz:
```

## Spot details and sky modes

For at least one spot in each city:

- [ ] Open the spot and confirm the Now card is the initial current-state view.
- [ ] Confirm the hourly scrubber is on the Now card, not the Sunset or Sunrise cards.
- [ ] Move the scrubber to the earliest, middle, latest, and current-hour positions.
- [ ] Confirm the selected time, score, color, conditions, confidence, and freshness remain internally consistent.
- [ ] Confirm returning to Now does not leave a stale scrubber value or mislabeled score.
- [ ] Review Sunset and confirm its score, time, explanation, confidence, and freshness are specific to sunset.
- [ ] Review Sunrise and confirm its score, time, explanation, confidence, and freshness are specific to sunrise.
- [ ] Review Stargazing and confirm its score, time, explanation, confidence, and freshness are specific to night conditions.
- [ ] Confirm unavailable forecast hours, partial provider responses, and stale responses have explicit states.
- [ ] Confirm forecast guidance is never worded as a guarantee.
- [ ] Confirm Last Updated uses the correct spot time zone and does not become a misleading future or negative age.

## Weather map

- [ ] Open the weather map on a healthy connection and confirm tiles and overlays load.
- [ ] Confirm overlay time, active layer, legend, confidence, and freshness are understandable.
- [ ] Change map position and zoom, then confirm controls stay responsive.
- [ ] Switch between weather and ordinary map presentation, if available, and confirm the selected spot remains coherent.
- [ ] Disable the network while the map is open. Confirm missing live tiles or weather data do not look current.
- [ ] Restore the network and confirm there is a clear, functioning recovery path.
- [ ] Confirm provider attribution is present wherever required by provider terms.

## Saved Spots

- [ ] Save one spot from each supported city.
- [ ] Open Saved Spots and confirm all four appear once, with correct city and spot labels.
- [ ] Force-quit and relaunch. Confirm saved spots persist.
- [ ] Open a saved spot while offline. Confirm the bundled spot can open and live-data limitations are explicit.
- [ ] Remove one spot and confirm it disappears from both the detail state and Saved Spots.
- [ ] Force-quit and relaunch again. Confirm the removal persists.
- [ ] Install the candidate as a TestFlight update over the previous build and confirm existing saved spots migrate or remain intact.
- [ ] Uninstall Soleil, reinstall from TestFlight, and confirm the app does not promise restoration of device-local saved spots.

## Links, sharing, and external actions

- [ ] Share a spot and confirm the payload contains a public HTTPS Soleil URL, not a Capacitor URL or preview-only host unless that host is the approved release origin.
- [ ] Open the shared link on another device or browser and confirm it resolves to the intended public experience.
- [ ] Open directions and confirm the destination is correct before leaving Soleil.
- [ ] Open Street View or external event content, where present, and confirm the user initiated the transition.
- [ ] Return to Soleil from an external app and confirm the prior state remains usable.
- [ ] Confirm no external website can replace the app's top-level WebView.

## Network, offline, freshness, and time

Test on normal Wi-Fi, cellular, constrained or high-latency networking, and offline mode where practical.

- [ ] Confirm the bundled city and spot catalog remains browsable offline.
- [ ] Confirm live weather and map tiles clearly state when a connection is required.
- [ ] Confirm cached or previously loaded weather is labeled with its real age and confidence.
- [ ] Confirm retry behavior does not produce duplicate requests, frozen controls, or conflicting states.
- [ ] Cross a local hour boundary and confirm current time, scrubber identity, scores, and freshness update correctly.
- [ ] Change the device time zone, relaunch, and confirm each spot still uses the spot's local time for sky events and hourly data.
- [ ] Verify one spot near midnight and one location whose time zone differs from the device.

## Accessibility and interaction

- [ ] With VoiceOver enabled, complete manual city selection, spot opening, Now scrubbing, saving, and location recovery.
- [ ] Confirm controls have understandable names, values, hints, focus order, and state announcements.
- [ ] Confirm the scrubber exposes its value and can be adjusted without sight.
- [ ] At the largest accessibility text size, confirm sheets scroll and no required control or trust label is clipped or overlapped.
- [ ] Confirm interactive targets are at least 44 by 44 points where required.
- [ ] Enable Increase Contrast and Reduce Transparency, then confirm essential information remains legible.
- [ ] Enable Reduce Motion and confirm no essential state depends on animation.
- [ ] Test light and dark appearance if the release claims both.
- [ ] Confirm external-app and Settings transitions return focus to a sensible place.

## Privacy and security observations

- [ ] Confirm location coordinates are not present in Preferences, IndexedDB, local storage, logs, crash messages, or share payloads except where a user explicitly shares a coordinate-based destination.
- [ ] Confirm saved spot storage contains only the intended local schema.
- [ ] Confirm no analytics, advertising, unexpected diagnostic, or unapproved provider traffic appears during a representative session.
- [ ] Confirm forecast, air-quality, map, directions, event, share, and release-host traffic matches the approved data inventory.
- [ ] Confirm the public privacy and support URLs load without authentication.
- [ ] Confirm the Xcode aggregated privacy report was reviewed against the exact archive.
- [ ] Confirm no signing credential, provisioning profile, private key, Apple API key, or team secret exists in the source repository or build artifacts shared with testers.

## Stability session

- [ ] Use the app for at least 30 minutes across all main flows without a crash, hang, runaway loading state, or severe battery or heat issue.
- [ ] Repeat cold launch five times.
- [ ] Repeat background and foreground ten times.
- [ ] Review TestFlight crash and feedback data after the planned internal-testing window.
- [ ] Resolve or explicitly accept every crash, data-loss issue, misleading trust state, and blocker-level accessibility issue.

## Additional iPad gate

Complete this section only if `TARGETED_DEVICE_FAMILY` still includes iPad. It cannot be waived while iPad support is advertised by the binary.

- [ ] Run the full core journey on each required iPad form factor.
- [ ] Test every declared iPad orientation.
- [ ] Confirm sheets, map, cards, scrubber, typography, safe areas, pointer interaction, and multitasking layouts are intentional.
- [ ] Capture and approve current iPad screenshots.
- [ ] Record iPad model, iPadOS version, tester, and evidence links.

## Acceptance result

```text
Result: PASS / FAIL
Blocking issues:
Accepted non-blocking issues and owner:
Screenshot or recording evidence:
Crash-free evidence:
Privacy inventory version/date:
Metadata version/date:
Approved candidate commit (full SHA):
Approved marketing version:
Approved build number:
Approved TestFlight build:
Approved by:
Approval date:
```

A pass is valid only for the exact commit, marketing version, build number, processed TestFlight build, and device-family scope recorded above. Any source, configuration, provider, metadata claim, privacy answer, signing entitlement, version, or build change requires proportional retesting and a new acceptance record.
