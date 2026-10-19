# SF sky scoring pilot

Owner: Codex for Sadhvika. Branch: `codex/soleil-sky-quality`. Risk: high, because the score contract changes. Scope: SF scoring, shared evidence presentation, forecast ingestion, weekly planning, and regression tests. Other cities keep their existing scoring model. The separate frontend worktree is untouched.

## Meaning and implementation

The score estimates how worthwhile the sky itself may be to see at the spot around the selected time. It is not a percentage chance of a beautiful sky, a place rating, or a measure of thermal comfort. The scene label distinguishes golden light, potentially colorful clouds, afterglow, blue twilight, clear views, fog, obscuration, and stargazing. A low number alone does not relabel an otherwise clear sky as overcast.

`src/utils/skyExperience.ts` owns the experimental `sf-sky-v2` model. It uses continuous solar elevation, cloud layers, visibility, optical-depth or pollution proxies, horizon openness, and nighttime moon/light-pollution context. Temperature, wind comfort, curated place ratings, and a permanent elevation bonus do not affect sky quality. Rain and gusts remain separate planning considerations.

All selections use the same centered 15-minute quality interval, including ordinary scrubber times and exact sunrise/sunset markers. Three samples, at five minutes before, at the selected instant, and five minutes after, estimate its average appeal. The primary score has no variability penalty. A missing anchor or less than half supported samples produces no score; partial coverage stays low confidence.

Finite instantaneous weather values interpolate between adjacent supported hourly records. This includes cloud fractions, visibility, humidity, temperature, wind speed, and haze proxies. Interpolation never bridges a missing anchor or invents an unknown optional value. Hourly radiation means, wind direction, and marine-layer metadata are not interpolated. Subhourly sampling improves solar geometry and avoids hourly steps; it does not create new weather observations.

Duration is a separate estimate of the remaining uninterrupted good period, starting at the selected time. It follows 15-minute samples scoring at least 60, up to three hours. Missing or malformed hourly weather breaks the run, including when a selected minute crosses an unsupported hourly boundary. Transitions into or out of stargazing also stop the run. The three-hour ceiling is shown as “At least 180 min”; shorter runs use “About”. A poor instant can therefore show “No good period forecast” without lowering its quality score further.

Afterglow and blue twilight have overlapping solar-elevation response curves between the sunset and stargazing scenes. Cloud layers, visibility, haze, and horizon openness still affect their appeal. Morning glow uses a dawn label. These are empirical appearance proxies, not predictions of an observed color palette. The twilight artwork is an illustrative generated image, not a camera feed or a rendered weather forecast.

The response curves, quality bands (80 very good, 60 good, 40 limited), planning penalties, twilight curves, and agreement thresholds are explicit empirical assumptions. They are not coefficients established by the cited science. Engineering checks establish consistency and failure behavior; aesthetic accuracy has not been validated.

The former sharp cloud-cover cap is removed in SF. Cloud fraction measures area rather than optical thickness. A mostly high-cloud sunset can have color potential, while low cloud can block the view. Cloud thickness and the sunward light path remain unresolved and are disclosed. Hourly shortwave radiation only supports daytime estimates above 15 degrees solar elevation; zero surface radiation does not rule out afterglow.

## Fog constraints

Low cloud, humidity, and visibility can suggest fog at the viewer. Spot height alone cannot establish a view above fog. A fog-scenery score requires a verified marine layer with cloud base, top in meters MSL, and a height uncertainty margin. The public provider adapter currently supplies none of those verified marine-layer fields. Consequently, the live app does not promise an above-fog scene.

A generic highest cloud top or boundary-layer height would not satisfy this contract. Directional coastal fog motion, local terrain obstruction, cloud optical thickness, and remote sunward cloud bands are not resolved by this implementation. Integrating those inputs is further scientific/data engineering work, not a completed capability.

## Free data and request behavior

Existing Open-Meteo weather and AQ requests now ingest dew point, mean sea-level pressure, shortwave radiation, direct normal irradiance, sunshine duration, and aerosol optical depth. Optical depth and shortwave radiation currently affect scoring; the other new signals are retained for further validation rather than assigned unsupported weights. Representative grid coordinates and elevation are retained where supplied. Retrieval time is distinct from model initialization, which is not currently available in this adapter.

A live probe on October 18, 2026 returned 192 weather hours at Ocean Beach and Twin Peaks. AQ and optical-depth coverage was 114 of 168 requested hours. Missing later haze data is disclosed, never filled with zeros, and receives an empirical 10% uncertainty penalty. This penalty is not a smoke forecast.

The optional GFS ensemble request runs only for the selected SF planning spot, or the regional SF coordinate when no spot is selected. The live endpoint returned 192 hours and 31 members of total cloud cover and visibility. Its low, middle, and high cloud fields were entirely null despite HTTP 200, so those fields are deliberately not requested or used. Ensemble agreement cannot confirm fog placement.

The ensemble compares 10th-to-90th percentile spread and the member median against the displayed forecast. All hours require at least 20 complete members. Empirical agreement bands are 30 percentage points of total cloud cover and 10 km visibility. These are support indicators, not calibrated beauty probabilities or independent trials. Mixed support lowers confidence and planning priority; it does not secretly change the quality score. Fresh complete steady windows may earn medium confidence beyond 48 hours when supported. The uncalibrated SF model never earns high confidence.

Normal weather/AQ remain two HTTP requests per requested coordinate, with existing cache and refresh behavior. More requested variables can increase provider metered usage even without adding requests. Cache schema is now v7. The ensemble adds at most one successful request per planning coordinate per hour per loaded app instance, with an eight-coordinate memory cache and a 10-second timeout. Failures return no agreement and leave weather-based planning usable. Forecast effect transitions can abort an in-flight optional request; unsuccessful requests may retry on a later transition. No promise of a cross-tab or daily request quota is made.

Private spot requests continue through `forecastCoordinates`, using rounded forecast coordinates. No exact private coordinates, new backend, account, telemetry, or paid feed is introduced. Hosted free-use terms and aggregate production quotas still need checking for the intended deployment scale.

## Per-spot map scores and selected time

The map requests a forecast for each spot inside the current map bounds, with the selected spot prioritized. It also keeps the regional timeline request and recommendation targets. The regional forecast never supplies a numeric score for another spot. Each loaded pin, Search result, and opened card reads the spot's snapshot at the same selected absolute instant. A 7 p.m. selection therefore scores every loaded dot using its own 7 p.m. weather, including after panning, opening, closing, and reopening a card.

Unknown scores display `--` with a neutral gray fill. Zero remains a valid poor-sky forecast, not a loading placeholder. A loading count identifies the pending spot requests. Opening the seven-day view without an explicit time chooses the first day's recommended viewing period once its data arrives, rather than silently starting at midnight. Explicit hourly and event selections remain unchanged.

This intentionally replaces the earlier two-coordinate map budget. Weather and AQ requests remain bounded to two coordinate jobs (four HTTP requests) at once, with eight days of hourly weather per successful coordinate. Scrubbing does not request each hour separately. Panning adds visible coordinates and can cancel transfers that are no longer needed; completed fresh snapshots are reused. Failed coordinates are not retried on every viewport change. A spot Retry targets that spot; the normal refresh schedule can retry failed data later. Free-provider usage still scales with the number of visible coordinates.

## Planning and presentation

The next seven city-calendar days have a broad best-sky period: morning, afternoon, or evening. The planner checks hourly candidate times using the same short quality interval, with separate planning penalties for short good runs, rapid changes, and ensemble disagreement. A period label identifies where the best supported candidate falls; it does not promise an entire afternoon of equally good sky. Exact weather remains hourly. The user can open the candidate on the existing day timeline. Rain and gusts are flagged separately.

“Sunset spots” selects the chosen calendar day's astronomical sunset on the shared scrubber, then compares the five highest supported scores among spots within the current map bounds and category/tier filter. Scrubbing updates that list and the map together. Ranking uses each spot's active score, with good duration as a tie-breaker. It excludes unavailable, failed, stale, and incomplete forecasts. The available/total count makes this scope visible; the list does not claim to identify the best spot across all of SF.

For an opened spot, “Best sunset period” selects an approximate recommended time from quarter-hour candidates between one hour before and 90 minutes after that spot's sunset, restricted to solar elevations from +6 to -12 degrees and to times not already past. Ties favor proximity to sunset. Its highlighted rail band follows the supported good run containing that candidate. If all candidates are poor, the action says “Strongest sunset forecast” instead. Saved data is labeled as saved. Exact recommended times, such as 6:15 p.m., survive sharing and reopen at that same instant. Actual sunrise and sunset markers retain their astronomical times.

These comparisons and sunset candidates reuse loaded forecasts and add no weather requests. Weather remains hourly, so minute-level recommendations and duration are approximate. The seven-day overview remains a broad best-sky planner, not a guarantee of a seven-day sunset itinerary.

Map, card, Search, canonical event scores, and sparklines use the same SF engine. Unavailable scores display `--`, not a curated rating. Quality, confidence, and retrieval freshness remain separate. Details describe expected scene, approximate duration, reasons, and limits. Ensemble failure has an explicit unavailable state.

Rollback: set `VITE_SF_SKY_MODEL=legacy` and rebuild. This disables SF scoring and best-sky planning while preserving the cache-compatible extra weather fields. The default is the experimental SF pilot. No production deployment or merge is included in this work.

## Validation and remaining work

Deterministic tests cover cloud-cover continuity, comfort/rating independence, fog-height requirements, missing weather/haze, interrupted durations, seven-day planning, ensemble gaps/staleness/spread/reference disagreement, outage fallback, legacy-city behavior, and shared score surfaces. Browser checks cover loading, missing metrics, stale caches, failed refresh and retry, selected-hour alignment, and weekly planning. Final validation on October 18, 2026:

- `npm run lint`: passed.
- `npm exec -- tsc -b`: passed.
- `npm test`: 400 tests passed across 39 files.
- `npm run build`: passed, including 22 public URL contract checks. Existing large-chunk and Node deprecation notices remain.
- Playwright: the broad regression run exercised sunset comparisons, exact-time sharing, twilight, point-score consistency, sky planning, forecast trust, timeline/card interactions, all-city journeys, and DST identity in desktop Chromium and mobile WebKit. It passed 93 cases with 24 intentional project-specific skips; one DST overlay case passed its time/temperature assertions but exposed an obsolete request-count expectation. The focused rerun passed all exercised cases across sunset planning and DST identity (17 unique cases, with seven intentional project-specific skips). A phone sunset test was interrupted by a development-server reload while documentation changed; its isolated rerun passed both phone cases. No source files changed during that rerun. This is not a claim that every E2E spec or project was run.
- Accessibility checks exercised by the browser suite passed, including the confidence panel and expanded sheet.
- Actual free-provider preview exercised in the desktop and narrow layouts, including planning-to-hour navigation, 7 p.m. map/card score agreement, and confidence disclosure. The earlier `outputs/score-fix-7pm.png` captures the prior v1 model, not the current twilight model. Current sunset comparison and selected-period screenshots are saved alongside it.
- Preview listener PID 15315 was verified against this exact worktree on port 5002. The preview uses live public Open-Meteo forecasts and map tiles.

This does not claim a full PWA offline artifact suite, an iOS device/simulator pass, or observed aesthetic accuracy. User feedback and aesthetic evaluation remain deferred.

Scientific follow-up: add verified marine-layer height/uncertainty and directional cloud observations, capture forecasts as issued with model-run provenance, and evaluate against independent physical observations over SF microclimates and seasons. Historical reanalysis or a later revised forecast must not substitute for the forecast available when a decision was made. Human aesthetic feedback remains intentionally deferred.

## Scientific and provider references

- [NOAA/SPC: The Colors of Sunset and Twilight](https://www.spc.noaa.gov/publications/corfidi/sunset.html), scattering, aerosols, and distant cloud illumination.
- [Open-Meteo GFS forecast documentation](https://open-meteo.com/en/docs/gfs-api), model grids and forecast variables.
- [Open-Meteo ensemble documentation](https://open-meteo.com/en/docs/ensemble-api), ensemble products and their supported variables. Live non-null coverage must still be checked.
- [Open-Meteo air-quality documentation](https://open-meteo.com/en/docs/air-quality-api), regional aerosol and pollution forecasts.
- [NOAA RAP variable diagnosis](https://rapidrefresh.noaa.gov/RAP_var_diagnosis.html), cloud and boundary-layer diagnostic definitions.
- [NOAA GOES fog and low-stratus products](https://vlab.noaa.gov/web/towr-s/goes-16-fog-and-low-stratus), physical observation candidates for future fog validation.

Twilight definitions and cloud-color context: [USNO rise/set and twilight definitions](https://aa.usno.navy.mil/faq/RST_defs), [Hong Kong Observatory: Colours of Clouds](https://www.hko.gov.hk/en/education/earth-science/optical-phenomena/00349-colours-of-clouds.html). Solar-elevation boundaries describe light phases; they do not determine aesthetic quality by themselves.
