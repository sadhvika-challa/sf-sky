# Soleil App Privacy data inventory

This inventory is a release worksheet, not a completed App Store privacy label or legal opinion. Apple's definition of collection generally focuses on data transmitted off the device and retained beyond the time needed to service the request. Data handled by third-party partners still counts when it is collected from the app. The release owner must verify actual production behavior, provider terms, logs, and retention before answering App Store Connect.

Apple guidance: [App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/), [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files), and [Third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/).

## Current product assertions to preserve

- Soleil has no user account, sign-in, advertising SDK, or analytics SDK in the audited repository.
- Soleil requests location only after the person taps `Use my location`.
- The iOS purpose string requests When In Use access. No background or Always location capability is declared.
- Coordinates are intended to be session-only and are not intentionally written to Capacitor Preferences, IndexedDB, or local storage.
- Saved spot identifiers are stored locally on iOS through Capacitor Preferences, which maps to `UserDefaults`. They are not intended to leave the device.
- The app-owned privacy manifest declares UserDefaults access with required reason `CA92.1`. The complete archived app privacy report must also include manifests from embedded SDKs.
- Live weather, air quality, and map tiles require network requests. Their production data handling and retention must be audited before selecting App Privacy answers.

## Data-flow inventory

| Flow | Data involved | Destination | Stated app purpose | Local persistence | Vendor retention or linkage | App Privacy decision |
| --- | --- | --- | --- | --- | --- | --- |
| Optional device location | Precise or approximate latitude and longitude returned by iOS after permission | In-app location logic | Rank nearby spots, show distance, choose a nearby city, position the map | Intended to remain session-only | Not applicable while it remains on device | Verify with runtime testing and code review. Location can also influence later provider requests, described below. |
| Forecast request | Built-in spot or neighborhood coordinates, forecast parameters, time zone, network metadata such as IP address | Open-Meteo forecast API | Retrieve live weather used by sky scores and details | Response may be held in application memory or browser caches during use | **Unresolved:** confirm Open-Meteo production terms, request logs, IP handling, retention, and whether coordinates or IP are linked | Audited callers currently pass catalog spot or neighborhood coordinates, not raw device coordinates. Verify this in the production binary, then make the human decision for Location, Product Interaction, and Other Data categories. Do not assume “Data Not Collected.” |
| Air-quality request | Built-in spot coordinates, requested measures, time zone, network metadata such as IP address | Open-Meteo air-quality API | Retrieve air-quality inputs used by sky guidance | Response may be held in application memory or browser caches during use | **Unresolved:** same vendor audit as forecast traffic | Audited callers currently use catalog coordinates. Human decision required after confirming whether the service merely returns data or retains request data. |
| Base map tiles | Tile coordinates, zoom, viewport-derived request sequence, network metadata such as IP address | CARTO basemap hosts | Render the map | Tiles may be cached by WebKit or network layers | **Unresolved:** confirm CARTO terms, logs, retention, and whether tile traffic is used for tracking | Human decision required. Tile coordinates can reveal an area being viewed even when device location is not explicitly included. |
| Web fonts | Font-family request, network metadata such as IP address and user agent | Google Fonts hosts | Load Soleil's current typography | Font files may be cached by WebKit or network layers | **Unresolved:** confirm Google's current Fonts privacy terms, request logging, and retention | The native WebView currently requests these hosts at launch. Include this flow in the vendor audit and App Privacy decision, or bundle approved font files before release. |
| Directions or Street View action | Destination name or coordinates and user-selected action | Google Maps website or installed handler | Open optional directions or imagery outside Soleil | Not intentionally stored by Soleil | Governed by Google after the user chooses the external action | Confirm whether Apple treats this as data collection by Soleil or as user-directed transfer. Disclose the external destination in the privacy policy. |
| External event links | Selected event URL and network metadata | Event publisher website | Open optional event information outside Soleil | Not intentionally stored by Soleil | Governed by the destination after the user chooses the link | Confirm that Soleil adds no tracking parameters. Describe external links in the privacy policy. |
| Share action | Spot name, canonical Soleil web URL, and content the person chooses to share | iOS share sheet and chosen destination | User-directed sharing | Subject to the selected share extension | Governed by the destination chosen by the person | Usually user-directed, but verify the exact payload and privacy policy wording. |
| Saved Spots | Spot identifiers and storage schema | Capacitor Preferences and iOS UserDefaults | Persist favorites across app launches | Yes, on the device until removal, app uninstall, or platform cleanup | No intended server recipient | Expected not to be App Store “collection” because it remains on device. Verify no backup or synchronization claim is made. |
| Other preferences | Home and active city, filters, category, temperature unit, onboarding state, and install-prompt state | Browser storage used by the shared React application | Preserve display choices and dismissed guidance | Yes, locally on the device or in the browser profile | No intended server recipient | Expected not to be App Store “collection” because it remains on device. Document removal through uninstall or clearing site data, and verify native storage behavior in the candidate. |
| PWA saved spots | Spot identifiers and storage schema | IndexedDB in the browser | Persist favorites across browser launches | Yes, in the browser profile | No intended server recipient | Relevant to the public privacy policy even though the App Store label applies to the iOS app. |
| Built-in spot catalog | Public spot metadata and coordinates | Bundled in the application | Enable city and spot browsing | Bundled with the app | No user data | Not user-data collection. Verify content rights and attribution separately. |
| Crash diagnostics | No app-specific crash SDK found in the audited repository | Apple may provide diagnostics according to device and developer settings | Diagnose crashes | Controlled by Apple | Apple platform behavior | Confirm App Store Connect diagnostic settings and whether any future crash SDK is added before release. |
| Analytics and advertising | None found in the audited repository | None intended | None | None | None | Re-audit dependencies and the production binary. Any future analytics or advertising addition reopens the privacy review. |

## Required production vendor audit

For Open-Meteo, CARTO, Google, the release host, and any provider added before submission, record:

```text
Vendor and service:
Production hostname:
Data sent by Soleil:
Data automatically visible to vendor, including IP or user agent:
Purpose:
Is data retained after servicing the request?:
Retention period:
Is data linked to a person or device?:
Is data used for tracking or advertising?:
Is data shared onward?:
Contract, terms, or privacy-policy URL:
Evidence date:
Reviewed by:
Resulting App Privacy category and purpose:
```

Do not infer “Data Not Collected” from the absence of Soleil accounts or analytics. Direct API and tile requests can expose coordinates, viewed areas, IP addresses, and device metadata to providers.

## Privacy manifest acceptance

- [ ] Confirm `PrivacyInfo.xcprivacy` is included in the app target and archive.
- [ ] Confirm `NSPrivacyAccessedAPICategoryUserDefaults` reason `CA92.1` remains accurate for saved spots.
- [ ] Confirm the app declares `NSPrivacyTracking` as false only if the production binary and all SDK behavior support that claim.
- [ ] Confirm no tracking domains are used.
- [ ] Confirm any collected-data declarations in privacy manifests match the production audit.
- [ ] Generate Xcode's aggregated privacy report from the exact archive.
- [ ] Review every SDK privacy manifest in that report, including Capacitor packages.
- [ ] Reconcile the privacy report, this inventory, the public privacy policy, and App Store Connect answers.
- [ ] Re-run the review whenever dependencies, providers, analytics, crash reporting, advertising, account features, or location behavior change.

## Public privacy policy content

The public policy should accurately explain:

- What Soleil does and who operates it.
- That location is optional and requested only after an explicit action.
- Whether precise or approximate coordinates leave the device as part of any live-data request.
- The weather, air-quality, map, external-link, hosting, and distribution providers used in production.
- What each provider receives, why, and how long it retains the data, based on verified evidence.
- That saved spots are local to the device and are not account-synced.
- The difference between native app storage and PWA browser storage.
- How to remove local data, including removing saved spots and uninstalling or clearing site data.
- How to revoke location permission in iOS Settings.
- Whether Apple-provided diagnostics are accessible to the developer.
- A working privacy contact and policy effective date.

Proposed URL: `https://sadhvika.com/soleil/privacy`. It is currently unpublished and must not be entered in App Store Connect until it resolves publicly over HTTPS.

## App Store Connect approval record

```text
Candidate commit (full SHA):
Marketing version:
Build number:
Archive privacy report filename:
Vendor audit completed by/date:
Privacy policy URL and publish date:
App Privacy answers entered by/date:
Tracking answer:
Data categories selected:
Purposes selected:
Linked-to-user selections:
Tracking selections:
Reviewer notes or unresolved risks:
Final approval by/date:
```
