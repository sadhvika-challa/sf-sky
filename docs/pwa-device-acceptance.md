# Physical iPhone PWA acceptance

Use this checklist to verify Soleil as a website and installed Progressive Web App on a physical iPhone. This is a release record for Safari behavior that Chromium and WebKit emulation cannot prove.

This checklist does not approve the Capacitor application, native signing, TestFlight distribution, or App Store submission. It requires no Apple Developer Program membership. Complete the separate [TestFlight acceptance checklist](./testflight-acceptance.md) for the native application.

## Candidate record

Acceptance is valid only for the exact deployed source commit and HTTPS origin recorded below. Any source change, service-worker change, manifest change, hosting rewrite, or origin change requires proportional retesting.

| Field | Record |
| --- | --- |
| Source commit |  |
| Pull request or release |  |
| HTTPS origin |  |
| Deployment identifier |  |
| Test date and time |  |
| Tester |  |
| Device | iPhone 17 Pro |
| iOS version | 26.6 |
| Safari version, if shown |  |
| Network used |  |
| Result | Pass / Fail |

Before testing, confirm that the origin is anonymous, uses HTTPS, and serves the recorded candidate without a login, redirect to another host, or preview-access gate. Run the public-origin verifier against that same origin and retain its output with this record:

```bash
npm run public:release:verify -- --origin https://example.com
```

## Clean installation

- [ ] Remove any existing Soleil Home Screen icon.
- [ ] In Settings, clear Soleil website data for the candidate origin, or record why existing data is intentionally being used.
- [ ] Open the recorded HTTPS origin directly in Safari.
- [ ] Confirm the initial screen renders without a blank view, redirect, authentication prompt, or browser error.
- [ ] Confirm Soleil does not request location before **Use my location** is selected.
- [ ] Confirm manual city browsing is available before deciding about location access.

## Safari website journey

- [ ] Switch manually among San Francisco, Austin, Santa Cruz, and Chicago.
- [ ] Select a spot and confirm the sheet opens with cards ordered Now, Sunrise, Sunset, and Stargazing.
- [ ] On the Now card, drag the hourly scrubber with a finger. Confirm the hour, score, color, and weather evidence update together.
- [ ] Confirm scrubbing does not dismiss the spot sheet, reorder the cards, or move the scrubber onto another card.
- [ ] Confirm each score shows confidence and freshness language, including a visible last-updated state when forecast data is available.
- [ ] Save a spot, close the Safari tab, reopen the origin, and confirm the saved spot remains available.
- [ ] Confirm saved-spots copy states that saves remain on this device and do not sync to an account.
- [ ] Open Settings and confirm the PWA installation guidance is understandable in Safari.

## Add to Home Screen

- [ ] Use Safari's Share action and select **Add to Home Screen**.
- [ ] Confirm the proposed name is **Soleil** and the icon is recognizable.
- [ ] Add Soleil, then launch it from the new Home Screen icon.
- [ ] Confirm it opens as a standalone experience without Safari browser controls.
- [ ] Confirm the launch starts at Soleil's root experience, not a missing page or stale preview path.
- [ ] Confirm the app respects the status bar, Dynamic Island, safe-area insets, bottom Home indicator, and portrait orientation.
- [ ] Confirm the installed PWA does not show its own install prompt or installation guidance.

## Location choice

Run both branches. Reset Safari location permission between branches if necessary, and record the reset method.

### Allow

- [ ] Select **Use my location** and allow the permission request.
- [ ] Confirm Soleil explains that location is being used and shows the device position or nearby context.
- [ ] Confirm Best Nearby Now presents a nearby result or an honest unavailable state.
- [ ] Confirm manual city switching still works after location is allowed.

### Deny

- [ ] Deny location when prompted.
- [ ] Confirm the app explains the denied state without blocking the rest of the experience.
- [ ] Switch cities manually and open a spot successfully.
- [ ] Use the visible retry or recovery path and confirm the resulting guidance matches iOS behavior.

## Installed PWA persistence

- [ ] Save one spot from the installed PWA.
- [ ] Swipe away the installed PWA from the app switcher.
- [ ] Relaunch from the Home Screen and confirm the saved spot persists.
- [ ] Open the saved spot and confirm the correct city and spot sheet open together.
- [ ] Remove the saved spot, force-quit, relaunch, and confirm it remains removed.
- [ ] Confirm Safari and the installed PWA do not claim that saved spots synchronize with one another or with another device.

## Offline application shell

Live forecasts, confidence updates, map tiles, and directions require a connection. This section verifies only the bundled application shell and spot catalog.

- [ ] Launch the installed PWA once while online and wait for the main experience to settle.
- [ ] Force-quit the PWA.
- [ ] Enable Airplane Mode and disable Wi-Fi.
- [ ] Relaunch from the Home Screen.
- [ ] Confirm the Soleil shell and bundled spot catalog open without a blank screen or Safari error page.
- [ ] Confirm live weather is labeled unavailable, offline, saved, or stale. It must not be presented as newly retrieved current data.
- [ ] Confirm manual city and bundled spot browsing still work.
- [ ] Restore connectivity and use the visible retry or refresh path.
- [ ] Confirm live data recovers and freshness information advances without reinstalling the PWA.

## Update behavior

Run this section when validating a deployment that replaces an earlier accepted candidate.

- [ ] Record the prior commit or deployment that is currently installed.
- [ ] Deploy the new recorded candidate to the same origin.
- [ ] Launch the installed PWA online, close it, and launch it again.
- [ ] Confirm the new candidate appears without a mixed or broken application shell.
- [ ] Confirm saved spots remain intact across the application-shell update.
- [ ] If the old shell remains, record the number of launches and elapsed time before the update appears. Do not report the new candidate as accepted until it is actually active.

## Accessibility and interaction spot check

- [ ] Increase Text Size by at least two settings and confirm primary controls remain readable and operable.
- [ ] Enable VoiceOver and confirm city selection, spot selection, Now-card tabs, scrubber value, save control, confidence, freshness, and dismissal controls have understandable announcements.
- [ ] Confirm focus does not move behind the open spot sheet.
- [ ] Confirm the scrubber can be adjusted without accidentally dismissing or paging the sheet.
- [ ] Confirm interactive targets near the screen edges remain usable around safe areas.

## Evidence

Attach evidence to the release record without including private location details that are not needed for review.

| Evidence | Attachment or note |
| --- | --- |
| Public-origin verifier output |  |
| Safari initial launch |  |
| Add to Home Screen and standalone launch |  |
| Now scrubber interaction |  |
| Location allowed result |  |
| Location denied recovery |  |
| Saved spot after force-quit |  |
| Offline cold launch |  |
| Online recovery |  |
| VoiceOver and larger-text spot check |  |
| Defects or follow-up pull requests |  |

## Approval

- [ ] Every required item above passed on the recorded candidate, or each exception is documented and explicitly accepted.
- [ ] The source commit matches the deployed candidate.
- [ ] The PWA remains a supported release surface alongside the native iOS application.
- [ ] No native signing, TestFlight, privacy-label, device-family, or App Store approval is inferred from this PWA result.

PWA release owner: ____________________

Decision date: ____________________

Decision: Approved / Rejected

Notes:
