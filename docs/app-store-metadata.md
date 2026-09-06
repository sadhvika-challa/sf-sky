# Soleil App Store metadata draft

This is working copy for App Store Connect. Anything marked unresolved must be decided before submission. Character limits and required fields can change, so validate the final text in App Store Connect.

## Identity

| Field | Draft | Status |
| --- | --- | --- |
| App name | Soleil | Confirm availability in App Store Connect. |
| Bundle identifier | `com.sadhvika.soleil` | Intended permanent identifier. |
| Subtitle | Find your best sky nearby | Draft, within the current 30-character limit. |
| Primary category | Weather | Recommended, human approval required. |
| Secondary category | Travel | Recommended, human approval required. |
| Copyright | `2026 [seller legal name]` | Replace after choosing Individual or Organization enrollment. |
| Privacy policy URL | `https://sadhvika.com/soleil/privacy` | Proposed only, currently unpublished. |
| Support URL | `https://sadhvika.com/soleil/support` | Proposed only, currently unpublished. |
| Marketing URL | `https://sadhvika.com/soleil` | Optional proposal, currently unpublished. |
| Release website origin | `https://go-outside-six.vercel.app` | Provisional current sharing origin. Approve or replace in a coordinated release. |

## Promotional text

Find nearby places for sunsets, sunrises, and stargazing, with current conditions, forecast confidence, and an hour-by-hour sky outlook.

Promotional text is optional and can be updated without submitting a new version. Confirm all claims against the release candidate.

## Description

Soleil helps you decide where and when to step outside for a better sky.

Explore viewing spots in San Francisco, Chicago, Austin, and Santa Cruz. Open a spot to see current conditions, sunrise and sunset outlooks, stargazing guidance, forecast confidence, and when the information was last updated. Use the Now scrubber to see how a spot's color and score change through the day.

If you choose to share your location, Best Nearby Now compares supported spots near you. Location is optional. You can always browse cities and spots manually.

Save favorite spots on your device so they remain available across launches. The built-in spot catalog is available without a connection, while live weather and map tiles require internet access.

Forecasts are guidance, not a guarantee. Soleil shows confidence and freshness so you can judge how much to trust the current score.

## Keywords

Suggested comma-separated draft:

```text
sunset,sunrise,stargazing,weather,sky,forecast,golden hour,viewpoint,clouds,nearby
```

Validate the final comma-separated value against Apple's current 100-byte limit and localization rules.

## What's New for version 1.0

Soleil's first App Store release brings nearby sky recommendations, city and spot browsing, sunset and sunrise outlooks, stargazing guidance, a weather map, forecast confidence and freshness, hourly scrubbing, and device-local saved spots.

## Review notes

```text
Soleil is a React application packaged in a Capacitor iOS shell. It provides a native-app experience beyond a simple website wrapper:

1. Best Nearby Now ranks supported viewing spots when the reviewer optionally grants When In Use location access.
2. Location is optional. Tap Choose a city to browse San Francisco, Chicago, Austin, or Santa Cruz without granting location.
3. Open any spot to inspect current conditions, forecast confidence, and the last-updated time. The scrubber on the Now card changes the displayed color and score across the day.
4. Sunset, sunrise, and stargazing views provide distinct sky guidance. The weather map provides a separate spatial view of conditions.
5. Save a spot, terminate the app, and relaunch it. Saved spots persist locally on the device through Capacitor Preferences. Soleil has no account requirement.
6. The spot catalog is bundled for offline browsing. Live weather and map tiles require an internet connection, and the interface identifies unavailable or stale data.
7. If location is denied, Soleil provides Choose a city and a clear retry path. On iOS, Open Settings opens the app's Settings page. Soleil does not request background location.

Suggested review path:
Launch Soleil, choose a city, open a spot, use the Now scrubber, review confidence and freshness, save the spot, and relaunch. The complete city-browsing path works without location permission or a reviewer account.

No login, demo account, special hardware, purchase, or subscription is required.
```

Before submission, add any provider outage caveat that affects the review build and a direct contact who can answer App Review questions.

## TestFlight beta description

Soleil helps people find promising places and times for sunsets, sunrises, and stargazing. This beta includes Best Nearby Now, manual city browsing, spot details, a Now scrubber, weather and sky outlooks, confidence and freshness labels, a weather map, and device-local saved spots.

## What to Test

```text
Please test on an iPhone, with and without location access:

• Browse San Francisco, Chicago, Austin, and Santa Cruz manually.
• Allow location and check Best Nearby Now, distances, and map position.
• Deny location and verify city browsing, retry, and Open Settings recovery.
• Open a spot and scrub the Now card through the day.
• Review sunset, sunrise, stargazing, weather, confidence, and last-updated states.
• Save and remove spots, then terminate and relaunch to verify persistence.
• Try a poor or offline connection and confirm the app distinguishes bundled spots from unavailable live weather and map tiles.

Report the device, iOS version, city or spot, time, and a screenshot with each issue.
```

## Screenshot story draft

Use current UI from the exact candidate build. Do not composite states the app cannot produce.

1. **Best sky nearby:** Home with a credible nearby recommendation and confidence.
2. **Choose your city:** Manual city browsing, proving location is optional.
3. **See the day change:** Spot detail with the Now scrubber and changing score or color.
4. **Know what to trust:** Confidence and last-updated context visible together.
5. **Plan for every sky:** Sunset, sunrise, and stargazing modes.
6. **Read the map:** Weather overlay with an honest loading or freshness state.
7. **Keep your places:** Saved Spots after a relaunch.

Capture the required iPhone display sizes after the device-family decision. If iPad remains supported, create an intentional iPad screenshot set rather than scaling iPhone images.

## Localization and claim review

- [ ] Product names, cities, and provider attribution match the release candidate.
- [ ] “Nearby” is shown only where a location or a clear distance basis exists.
- [ ] Forecast language remains probabilistic and never promises a sunset, sunrise, or stargazing outcome.
- [ ] Offline language distinguishes the bundled spot catalog from live weather and map tiles.
- [ ] Location language states that permission is optional and When In Use only.
- [ ] Saved Spots language says on-device, not cloud-synced.
- [ ] Screenshots do not show personal location, notification banners, test data, debug UI, or placeholder artwork.
- [ ] Seller name, copyright, support contact, and URLs reflect the enrolled account.
