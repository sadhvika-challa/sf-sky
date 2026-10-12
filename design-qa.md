# Soleil Refresh Design QA

Owner: Codex. Risk: Medium (map presentation and selected-pin visibility).
Final result: passed

## Visual Truth And Scope

Source: /Users/sadhvikachalla/Documents/Codex/2026-10-11/i-have-a-few-things-that/outputs/soleil-sky-window-refined.png.
The user's final instruction supersedes the mockup's composition: preserve the card layout finished by the other chat. Apply its map, pins, white surfaces, and typography. Keep DM Mono details and omit the bottom icon row.
No card structure, travel-control placement, paging order, or breakdown structure was changed during the resumed styling work. Score text color was darkened for contrast.

## Captures And Normalization

- Mobile viewport: 390 x 844 CSS pixels; implementation screenshots: 390 x 844 pixels, density 1.
- Source: 853 x 1844 pixels, normalized with aspect-preserving containment to 390 x 844 for comparison.
- Desktop viewport and screenshots: 1440 x 900, density 1.
- Mobile selected state: Ocean Beach, Monday October 12, 2026 at 8:00 AM.
- Map overview captures: live time in San Francisco, October 11, 2026.
- Reference normalization: work/qa/soleil-reference-normalized.png.
- Mobile card: outputs/soleil-refresh-card-mobile.png.
- Mobile map: outputs/soleil-refresh-map-mobile.png.
- Desktop card: outputs/soleil-refresh-card-desktop.png.
- Desktop map: outputs/soleil-refresh-map-desktop.png.
Paths above are relative to /Users/sadhvikachalla/Documents/Codex/2026-10-11/i-have-a-few-things-that.

Full-view reference and mobile implementation were inspected together. Focused pin and timeline crops were inspected: work/qa/soleil-map-pin-detail.png and work/qa/soleil-timeline-detail.png.
Historical captures outputs/soleil-refresh-map-before.png and outputs/soleil-refresh-card-before.png predate the other chat's final card work and are context only, not evidence of matching final geometry.

## Required Fidelity Surfaces

- Typography: DM Sans primary headings and pin numerals, DM Mono times and data. Selected time is 14px and rail labels 11px; readable at phone width. Existing card labels and layout remain intact.
- Spacing and layout: one footer on the map, one inside the selected sheet, never both. The taller sheet, travel row, inset card, metric grouping, and desktop full-width behavior are intentional retained structure. No horizontal document overflow was observed.
- Colors: white surfaces, blue water (#A6D8F4), soft green parks, dark teal selected pin, continuous readable score colors. White numbers meet 4.5:1 across all 101 score values. Score text contrast and confidence contrast pass the card accessibility checks.
- Image quality: five original atmospheric sky assets, encoded as 1200 x 400 WebP, totaling about 112 KiB. Light follows local sun altitude; overcast/fog and cloudy night use appropriate imagery. Illustrative sky impressions, not live photographs or exact cloud predictions. No text over sky artwork.
- Copy and content: existing functional labels and forecast uncertainty remain. Weather and scores are live values, so differences from mock data are expected. No new marketing copy or helper paragraphs.
- Icons: reused existing product controls. Removed the four-icon time shortcut row. Retained keyboard card paging and precise solar/event rail stops.

## Comparison History And Fixes

1. P1, selected pin could be hidden inside a cluster or beneath the sheet. Render selected spot separately and use actual sheet height for pan positioning.
2. P1, legacy pan calculation mixed projected coordinates with viewport coordinates and could move the selected pin offscreen. Corrected to use viewport half-width/half-height. Final measured phone pin box is inside the uncovered map; dedicated desktop and mobile checks verify all bounds.
3. P2, card score text failed contrast on white (2.66:1 at one sampled score). Reused the readable pin spectrum for score text. Post-fix Axe checks report no serious or critical card violations.
4. P2, selected-time and ruler labels were too small for the main control. Increased to 14px and 11px. Rechecked snapping, one-control state, geometry, and contrast on Chromium and mobile WebKit.
5. P2, map recovery notice could be covered by the finished sheet. Portal the notice outside the map stacking context. Verified retry remains the topmost clickable control and recovery completes in both browsers.

All P1/P2 findings above are resolved. No open product-placement questions.

## Verification

- npm run lint: passed.
- npm exec -- tsc -b: passed through the final production build.
- npm test: 308 tests passed in 31 files.
- npm run build: passed, including 22 public URL checks and finalized PWA shell.
- Map, card, and all-city focused browser suite: 44 passed, 10 intentional platform skips.
- After the centering correction: 3 affected checks passed, 1 intentional skip.
- After final timeline typography: 6 affected checks passed.
- Four configured city journeys verified in desktop Chromium.
- Automated checks cover exact event snapping, hourly map-score updates, keyboard paging, card-face focus, public share replay, private spot persistence and share prevention, location popup/session and denied-permission recovery, missing forecast, and map outage/retry.
- Manual in-app browser checks with real map and forecasts: search and select Ocean Beach, scrub to 8 AM, pan with the sheet open, switch to a nearby pin without closing the sheet, return to live Now, zoom, and mobile/desktop rendering.
- Latest browser error/warning log: empty.
- Preview: http://localhost:5012/. HTTP 200; listening process PID 2556 belongs to the Soleil checkout.
- All five sky files appear in the production service-worker precache list.

## Intentional Differences And Limits

The user's finished cards intentionally retain their existing height, whitespace, header, and metric positions instead of the mockup's large image and compact composition. Real map geometry, clustering, spots, and scores replace the mockup's illustrative layout.
New sky assets were generated with the built-in image tool and optimized for the web. No live camera claim is made. Native iOS installation, App Store release, and a new full offline/PWA certification were not run for this visual refresh.
The existing large application bundle warning remains unrelated to this change.

## Follow-up Polish

The existing full-width desktop card and very small secondary metric captions can be revisited with Sadhvika if she wants a separate layout pass. They were retained to respect the final instruction.

## Implementation Checklist

Completed: approved style applied, card structure preserved, selected pin readable and visible, single timeline retained, images included, checks passed, local preview left running.

## Latest refinement, October 11, 2026

Final result: passed for the scoped pin, gradient, header, bookmark, confidence and sky-artwork refinements. The broader card simplification remains a design choice, with three generated mockups displayed and awaiting selection. The current card structure is preserved.

Validation: lint, TypeScript, 310 unit tests, production build with 69 PWA URLs, 19 focused browser checks passed and 5 existing platform skips. Reviewed the same Lafayette Park sunset state before and after at 390 x 844 plus desktop 1440 x 900. New confidence details fit both viewports. Live check-back times match the selected event: 12:38 PM and 4:38 PM for a 6:38 PM sunset. Missing forecasts and private uncalibrated roofs retain low-confidence explanations. No P0/P1/P2 issues remain in the implemented scope. Existing large sheet whitespace remains pending product layout choice. Full report and screenshots are saved in this chat's outputs/soleil-current-refinement-qa.md.


# Soleil Weekly Controls QA

final result: passed

Owner: Codex. Scope: Forecast range preference, seven future calendar dates, daily time selection, sky-view menu, and confidence presentation. Risk: Medium (time selection and synchronized forecast scores).

## Visual target and evidence

Source visual truth: outputs/soleil-slider-mockups/clickable-days-direction.png.
Implementation: outputs/soleil-weekly-phone.png, outputs/soleil-weekly-desktop.png, outputs/soleil-24-hour-phone.png, and outputs/soleil-forecast-settings.png.
Paths in this report are relative to /Users/sadhvikachalla/Documents/Codex/2026-10-12/based-off-of-the-um-like.

Source: 850 x 1850 pixels. Phone implementation: 402 x 874 pixels at a 402 x 874 CSS viewport, density 1. Source normalized to the same dimensions using Lanczos for visual comparison. The tiny aspect difference is less than 0.1%. Desktop: 1440 x 900. Additional narrow phone check: 360 x 780.

Matched state: Ocean Beach, Friday October 16, 2026, sunset 6:32 PM, approximate score 85 and Low confidence. Real provider data is used.
Full comparison: work/soleil-qa/clickable-days-full-comparison.png.
Focused readable footer comparison: work/soleil-qa/clickable-days-footer-comparison.png.
Source and implementation were viewed together in both comparison images.

## Findings and fidelity surfaces

No actionable P0/P1/P2 differences remain.

- Typography: Existing DM Sans headings and score, DM Mono data and time controls retained. Menu 13px, selected time 14px, hour ticks 11px, dates 11px/15px. Labels fit at 360px and do not overflow. Native select has an accessible name and keyboard control.
- Spacing: The daily rail extends to the sky card edges, leaving space for the unchanged 24px circular thumb. Seven dates use separate finger targets with selected-date highlighting. The menu has a minimum 44px height. The original temperature, Details, travel controls, and sky image remain. The extra date row raises the sheet by approximately 32px while preserving its existing structure.
- Colors: Thin lavender, blue, peach gradient retained. Selected day uses pale mint and dark teal. The original teal outlined white thumb remains. All confidence states retain their three ascending bars.
- Image quality: Actual existing sky assets reused without replacements. The generated reference is guidance for controls, not a new sky-photo asset. Warm sunset art follows the selected event.
- Copy: Conditions, Sunrise, Sunset, Stargazing are the four menu choices. Seven dates exclude today. The 24-hour/7-day preference lives in Settings. Weather-only estimate no longer appears as a caption; Low remains beside the score and missing air quality is explained in confidence details. Approximate scores retain the tilde.

Intentional source corrections: The generated mock mistakenly removed temperature and Details and placed an additional pill-style Low indicator beside travel controls. The implementation preserves the existing temperature and Details and places one Low label with the existing three confidence bars beside the score, following Sadhvika's request and established confidence placement. These corrections are accepted, not drift.

## Comparison history

The earlier dense continuous weekly rail was replaced following explicit user feedback. The revised visual direction was generated before implementation. The first combined comparison of the final direction and implementation found no P0/P1/P2 issues. Narrow-phone and desktop checks found no overflow or hidden persistent controls.

## Interaction verification

Actual in-app browser checks with live forecasts:

- Settings switches between 24 hours and 7 days, and the range preference survives reload.
- Seven-day dates are Tuesday October 13 through Monday October 19, excluding Monday October 12.
- Clicking a date selects that day. The daily rail covers midnight through 11 PM, with exact astronomical event stops.
- Choosing Sunrise, Sunset, or Stargazing selects the exact event timestamp, matching the active score card.
- Switching Friday sunset to Saturday preserves Sunset and changes to Saturday's exact event.
- Conditions uses hourly selection. Home, End and arrow keys work. A pointer drag changed Friday sunset to Friday 10 AM while keeping Friday selected.
- Selected map pin and card share the active approximate score and confidence.
- No Weather-only estimate caption appears. Low is visible. Confidence details explain missing air quality and possible smoke or haze.
- Dismissing the sheet leaves one map timeline, with day and view selection working there.
- Chicago's seven future dates and Monday sunset (6:04 PM) follow its local time zone.
- 360 x 780 phone, 402 x 874 phone, and 1440 x 900 desktop fit without timeline overflow.
- Browser error/warning log is empty for the final journey.

## Automated verification

- npm run lint: passed.
- npm exec -- tsc -b: passed, including production build.
- npm test: 328 passed in 31 files.
- npm run build: passed, including 22 public URL checks and the finalized PWA shell.
- Added calendar-boundary tests show exactly seven future dates and 167/169 real hours across daylight saving changes. Missing tail hours retain the full date range and are marked unavailable. Invalid saved range values default safely.
- Existing forecast/scoring tests cover future event dates, missing air quality, Low confidence, and missing hours without borrowing another day's forecast.
- Updated existing browser test source for clickable dates, Settings, menu choice, exact event selection, and hidden estimate captions. These updated browser tests were not run through the Playwright CLI during this UI pass; hands-on checks used the selected in-app browser.

Earlier forecast implementation checks passed nine new browser cases across Chromium, desktop WebKit, and mobile WebKit before the daily control refinement. These are historical evidence, not a claim that the latest UI browser suite was rerun.

Limits: Native iOS and a new offline/PWA certification were not exercised. The existing large application bundle build warning remains. Production was not deployed.

## Implementation checklist

Completed: Settings preference, seven future dates, clickable day selection, daily rail, four-option sky menu, exact event synchronization, unchanged circular thumb, clear Low label, confidence details, responsive verification, and local preview.

Preview: http://localhost:5027/?spot=sf-ocean-beach&range=7d. Vite PID 4801 belongs to work/sf-sky-weekly, the isolated checkout containing these changes. The preview uses live Open-Meteo forecasts and existing map providers.


# Soleil Day Navigation Refinement

final result: passed

Scope: Hourly score labels, card alignment, and separating the weekly picker from a single-day scrubber. This follows Sadhvika's October 12 request and supersedes the earlier persistent date row and Conditions label.

## Evidence

Source baseline: outputs/soleil-weekly-phone.png. Updated source requirements are the user's explicit Daytime/Nighttime, left-alignment, weekly-only menu, and All 7 days navigation request.
Actual implementation: outputs/soleil-week-overview.png, outputs/soleil-daytime-timeline.png, outputs/soleil-nighttime-timeline.png, outputs/soleil-day-navigation-sunset.png, outputs/soleil-day-navigation-desktop.png.
Combined before/after evidence: work/soleil-qa/day-navigation-before-after.png, inspected with both artifacts in the same comparison input.
Paths are relative to /Users/sadhvikachalla/Documents/Codex/2026-10-12/based-off-of-the-um-like.

Baseline and current phone images are 402 x 874 pixels at the same CSS viewport, density 1. No density normalization needed. Additional responsive checks: 360 x 780 and 1440 x 900.
The full comparison matches Ocean Beach, Friday October 16 sunset at 6:32 PM and approximately 85. Temperature changes from 75 to 74 due to refreshed live provider data. Map pan adjusts to the changed sheet height. Both are expected.

## Findings and visual fidelity

No actionable P0/P1/P2 findings remain.

- Typography: Existing DM Sans primary text and DM Mono control text retained. Conditions is replaced with Daytime/Nighttime for hourly views. Named solar windows and explicit Sunrise, Sunset and Stargazing events keep their score-specific names.
- Alignment and spacing: The caption and weekly select start at x=32, matching card temperature/text. The rail still reaches the sky card edges at x=12. Daily date is above the condition/time row, beside All 7 days. Seven clickable dates appear only in the overview. No horizontal overflow was measured on narrow phone or desktop.
- Colors: Existing gradient, round white teal-outlined thumb, mint selection and white card retained.
- Assets: Existing sky imagery and the existing Back chevron path reused. No new product asset or illustration was introduced.
- Copy: Weekly picker contains the sky-view select. Single-day and 24-hour timelines have a read-only score caption and hourly rail. The single-day timeline has All 7 days with a back chevron. No generic Conditions label remains.

## Verified interactions

Actual in-app browser with live forecasts:

1. Weekly overview shows the seven future dates and mode menu, without an hourly rail.
2. Clicking Friday enters its single-day rail and hides the menu and seven-date row.
3. Hourly noon reads Daytime. Late-night 11 PM reads Nighttime. The caption matches the score's existing automatic mode; scoring formulas are unchanged.
4. All 7 days returns to the overview while preserving Friday and its selected time.
5. Choosing Sunset in the weekly menu, then Saturday, shows Saturday's exact sunset and matching score-card timestamp.
6. Closing and reopening a spot preserves day navigation in the single shared map/spot control.
7. Switching to 24 hours removes the weekly menu and back arrow, retaining a single hourly scrubber and the dynamic caption.
8. Phone, narrow phone and desktop render the back/date/condition/time without overflow.
9. Final browser error/warning log is empty.

## Validation

- Lint: passed.
- TypeScript: passed.
- Vitest: 329 passed in 31 files.
- Production build: passed, including 22 public URL checks and PWA shell finalization.
- git diff --check: passed.
- Existing browser test source updated for new label contracts, weekly-only menu, overview-to-day navigation, and returning to all dates. These tests were not rerun through the Playwright CLI; hands-on testing used the selected in-app browser.
- Preview route returns HTTP 200. Vite PID 4801 belongs to the isolated work/sf-sky-weekly checkout containing the changes.

No native-device or new offline certification was performed. Existing large-bundle warning remains. Production was not deployed.

Preview: http://localhost:5027/?spot=sf-ocean-beach&range=7d.


# Soleil iPhone Visual Check

final result: passed

Device: iPhone 17 Pro Simulator, iOS 26.5. Route: http://localhost:5027/?spot=sf-ocean-beach&range=7d. Actual Safari, live weather and map data. Portrait and landscape right were exercised, including Safari's expanded toolbar and tab bar.

## Findings and fixes

1. P1: The map footer used a fixed 128px height. A selected day's navigation, condition, rail and hour labels exceeded it and were clipped at Safari's toolbar. The footer now sizes to its content. A ResizeObserver keeps the neighboring outlook panel's offset synchronized with the actual footer height.
2. P2: The circular thumb extended beyond the clipping boundary at the rail's first and last stops. Its center is constrained by its radius at both ends. The round scrubber, full-width rail and astronomical snap positions remain.
3. P1: Landscape safe-area spacing allowed the notch to cover the selected date and score. Map controls and spot content now respect horizontal safe areas. Compact landscape places spot identity and travel on one row and reserves space for the complete timeline, temperature and Details. Sky artwork remains in portrait.
4. P1: Rotation could snap the card carousel to a different event and change the selected time. Paging now realigns the selected card on width changes and ignores resize-generated scroll selection. Friday sunset stayed at 6:32 PM with score 85 through portrait-to-landscape-to-portrait rotation.
5. P2: Details used a fixed relative viewport height that could put its Back control below the visible card. Details now fills a bounded card area. In compact landscape the details pane and timeline sit beside each other; Back remains reachable.
6. P2: Native selects separated their choice UI from the field, and the sky-view arrow had excess space. The shared selector now places the chevron beside the value, inside the range field. Choices open in a matching-width anchored menu for Forecast range. The sky menu can open above its trigger when needed. Both support outside dismissal and keyboard selection.
7. Requested presentation change: Removed the tilde from every score display, including map markers, selected and collapsed cards, and shared score values. Low confidence and explanatory evidence remain. Scoring formulas were not changed.

## Evidence and comparison

Paths are relative to /Users/sadhvikachalla/Documents/Codex/2026-10-12/based-off-of-the-um-like.

- Before: outputs/soleil-iphone-timeline-before.png.
- Matched after: outputs/soleil-iphone-timeline-after.png.
- Selected spot: outputs/soleil-iphone-portrait-after.png.
- Range choices: outputs/soleil-iphone-range-menu-after.png.
- Landscape: outputs/soleil-iphone-landscape-after.png.
- Full before/after comparison: work/soleil-qa/iphone-clipping-full-comparison.png.
- Focused footer comparison: work/soleil-qa/iphone-clipping-footer-comparison.png.

Before and after were viewed together in each comparison input. Both matched map-only Friday October 16, midnight, Nighttime. Safari's toolbar is visible in both. The original onboarding hint is absent afterward, an expected session difference. Map positions and weather values vary as live data refreshes; the footer is the comparison target.

Portrait screen captures are 1206 x 2622 pixels, normalized with Lanczos to 402 x 874 screen pixels (density 3). These sizes include iPhone status and Safari chrome; the web content viewport changes as Safari bars expand. The exported landscape file also reports 1206 x 2622 pixels. Landscape was assessed directly in the rotated native Simulator window rather than inferred from that exported file.

## Fidelity surfaces

- Fonts: Existing DM Sans primary text and DM Mono controls retained. Time, date and hour labels stay readable.
- Spacing: All five daily hour labels, both thumb ends, and back/date/condition/time fit above Safari chrome. Horizontal notch insets keep content clear. The range button and its choice menu have the same width.
- Colors: Original white surfaces, pastel gradient, teal outlined white thumb, mint selection and score colors remain.
- Assets: Existing sky assets and chevron reused. The sky illustration is omitted in compact landscape to preserve actionable content. Portrait imagery is preserved.
- Copy: Functional Daytime, Nighttime and named-event labels remain. Scores are plain numbers. No new descriptions were added.

No actionable P0/P1/P2 findings remain in the checked scope.

## Interactions observed

- Actual iPhone Safari loads the requested route with live data.
- Settings opens the attached range menu; choosing 7 days updates the field and forecast.
- Weekly dates and the sky-view menu work; choosing Sunset and Friday opens the exact daily event.
- Closing the spot preserves the selected day on the map and displays the complete daily footer.
- Both end stops display a fully visible thumb and their hour labels.
- Portrait and landscape both show the full timeline; rotation preserves the selected event and time.
- Details opens and Back returns to the summary with the timeline retained. Landscape Details keeps Back and the timeline visible.
- The future sunset score reads 85, without a tilde, in both pin and card, beside Low confidence.

## Checks and limits

Lint, TypeScript, 329 Vitest tests in 31 files, production build, 22 public URL checks and git diff --check passed. Existing browser test source was updated for the attached menus and plain numbers. Added regression cases cover footer/endpoint containment and event preservation on resize. Those browser cases were not executed through the Playwright CLI during this pass; hands-on verification used the iPhone Simulator.

Physical devices, other iOS versions, the opposite landscape direction, a full offline/PWA certification, and keyboard or all-field scrolling through Details were not independently verified. The observed open/Back navigation and timeline visibility passed. No production deployment was performed.

The server is a detached process and belongs to work/sf-sky-weekly. The route returns HTTP 200. The Simulator is left running for review.
