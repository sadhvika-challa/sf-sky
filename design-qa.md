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


## Latest approved compact card and dock animation

Result: Passed for the approved scope.

## Approved design

Reference: soleil-emerald-sky-dock.png, combining card option 1 and map option 2. Preserve the live map, circular score pins, existing travel controls, and detailed Spot/Sky views. The compact front contains the sky impression, temperature, and Details control. Confidence uses three ascending bars beside the score, with explanations on demand. There is no divider above the shared timeline.

The latest naming decision uses Daytime, Sunrise, Sunset, and Nighttime. Current time remains a marker on the timeline rather than a sky category. Internal view keys and shared-link compatibility remain intact.

## Implemented surfaces

- Score colors progress through pale rose, sand, gold, fresh green, and deep emerald. Scores at 80 and above become especially dark. Marker text switches between dark ink and white to retain at least 4.5:1 contrast. Selection adds an outline and preserves the score color.
- White surfaces, DM Sans primary type, and DM Mono time labels retain the approved modern style and typewriter character.
- The bookmark, spot name, three confidence bars, and score remain on one row. Travel controls remain visible. Successful bookmarking has accessible feedback without extra visible text.
- The main card is compact, with all weather and contribution information in Details. Units persist when returning from Details. Inactive card details cannot enlarge the main sheet.
- The card opens through a 440 ms upward reveal anchored to the timeline dock. Closing reverses the reveal. The timeline remains at the same screen position with one scrubber throughout. Reduced motion bypasses the transition.
- Pager alignment happens before paint, so the requested page is present on the first animation frame. Changing sky sources replaces the image node, avoiding retention of the previous decoded image.
- The displayed sky phase follows the selected time and local solar events. Sunrise and sunset still snap to exact event instants. Daytime and Nighttime replace the old Now and Stargazing presentation labels.

## Visual evidence

- soleil-smooth-card-mobile.png: public Lafayette Park sunset, 390 x 844, real forecast, compact front and connected timeline.
- soleil-smooth-card-details.png: detailed weather and contribution view at phone width.
- soleil-nighttime-map.png: one sticky map scrubber labeled Nighttime at the actual current local time.
- soleil-smooth-card-desktop.png: desktop rendering after restoring the browser's native size.
- The selected reference and implemented mobile screen were compared. Real map geometry, clusters, live scores, temperature preference, and unknown travel distance differ intentionally from the illustrative mockup. Controls retain 44 px hit targets, so the identity and travel rows are taller than the mockup.

## Verification

- 311 unit tests passed in 31 files, including confidence review windows, private spots, solar artwork selection, and the entire score-color contrast spectrum.
- Lint, TypeScript, production build, 22 public URL checks, and PWA shell finalization passed. Seven sky assets are included in the build.
- 44 affected desktop Chromium and mobile WebKit checks passed, with 10 intentional platform skips. After correcting old score-label selectors, all 4 city journey checks passed separately. Total affected passing checks: 48.
- New animation checks sample successive frames and confirm the sunset page and sky source stay consistent, there is exactly one scrubber, the dock does not move, and the reveal actually progresses. Reduced-motion checks confirm no animation and verify daytime and nighttime current-time labels and imagery.
- Existing checks cover event snapping, keyboard paging, swiping, drag dismissal, Details focus and scrolling, score parity, public share replay, device-private spots, confidence explanations, and location consent/recovery.
- Manual in-app browser review used the real public Lafayette Park forecast: sunset selection from the map, pin opening, closing, Details, Back, mobile rendering, and restored desktop rendering. Latest warning/error logs were empty.
- Preview HTTP 200; PID 2556 belongs to the changed Soleil checkout. Preview left running at http://localhost:5012/.

## Limits

Sky images are illustrative light and cloud impressions informed by forecast data, not live photography or an exact cloud prediction. Forecast loading can legitimately change the weather impression when data arrives. Travel estimates require a location; access was not requested during visual QA. The existing large application chunk warning remains. Native installation, publishing, and a new full offline certification were not part of this request.

No open P0, P1, or P2 findings remain in this scoped review.


## Latest map and sheet interaction verification

The map centers a newly selected spot once in the area above the compact card. Its pan finishes before the first card reveals. Opening Details, changing the sheet height, and dismissal preserve the map position. Switching spots while the sheet is open updates the card without replaying the entrance animation. Spot-specific temporary state resets, and timeline selection remains shared.

Verification: lint, TypeScript, production build, 22 public URL checks, and 311 unit tests passed. The affected desktop Chromium and mobile WebKit suite passed 49 checks with 10 intentional platform skips. One nighttime mobile check was interrupted by a development server refresh after a comment update; its focused rerun passed, completing all 50 affected checks. Frame sampling confirms a stationary map during the reveal, one scrubber, a consistent selected sky page, and no entrance replay on the second spot. Manual phone checks against the real Lafayette Park sunset forecast confirm Details and closing leave the map transform unchanged. The verified localhost:5012 server remains running from the changed checkout. Native installation and publication were not part of visual QA. No open P0, P1, or P2 findings remain in this scoped review.
