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
| Forecast request | Built-in spot or neighborhood coordinates, forecast parameters, time zone, network metadata such as IP address | Open-Meteo forecast API | Retrieve live weather used by sky scores and details | Response may be held in application memory or browser caches during use | Open-Meteo says its free API may log IP addresses, that troubleshooting logs may contain geographic query coordinates, that it does not share those logs with third parties, and that log files are deleted after 90 days | Audited callers currently pass catalog spot or neighborhood coordinates, not raw device coordinates. Verify this in the production binary, then make the human App Privacy decision. The provider's 90-day logs mean the answer must not be inferred solely from Soleil having no account. |
| Air-quality request | Built-in spot coordinates, requested measures, time zone, network metadata such as IP address | Open-Meteo air-quality API | Retrieve air-quality inputs used by sky guidance | Response may be held in application memory or browser caches during use | The same Open-Meteo free API logging terms apply, including possible geographic query coordinates and deletion after 90 days | Audited callers currently use catalog coordinates. Human App Privacy review remains required. |
| Base map tiles | Tile coordinates, zoom, viewport-derived request sequence, IP address, HTTP referrer, user agent, timestamps, request volume, and API key when configured | CARTO basemap hosts | Render the map | Tiles may be cached by WebKit or network layers | CARTO's current basemap terms say it truncates IP addresses on ingestion, retains Request Data for 30 days in the United States, and may retain aggregated de-identified statistics | Tile requests reveal the viewed area. CARTO now requires a unique API key, while the audited code currently calls unkeyed raster URLs. Provider authorization is an unresolved release gate, separate from the privacy disclosure. |
| Bundled web fonts | Font files included in the Soleil application shell | The installed app or same-origin web host | Display Soleil's typography | Cached with the application shell | The candidate bundles Fontsource Latin-subset files and no longer loads typography from Google Fonts | Verify the production document contains no Google Fonts stylesheet or font request. Font copyright notices and the SIL Open Font License are committed with the application. |
| Website and PWA hosting | Requested path, IP address, city or country inferred from IP, user agent, referrer, timestamp, and service diagnostics | Vercel | Deliver the public Soleil website and PWA | Browser and edge caches may retain application assets | Vercel's privacy notice says it processes service-generated logs, IP-derived city and country, diagnostics, capacity, and usage information. The audited source does not establish the exact end-user log retention for Soleil's plan | Applies to the website and PWA. The packaged iOS application loads its application shell from the device, but shared links and support or privacy pages use the public host. |
| Directions or Street View action | Destination name or coordinates and user-selected action | Google Maps website or installed handler | Open optional directions or imagery outside Soleil | Not intentionally stored by Soleil | Governed by Google after the user chooses the external action | Confirm whether Apple treats this as data collection by Soleil or as user-directed transfer. Disclose the external destination in the privacy policy. |
| External event links | Selected event URL and network metadata | Event publisher website | Open optional event information outside Soleil | Not intentionally stored by Soleil | Governed by the destination after the user chooses the link | Confirm that Soleil adds no tracking parameters. Describe external links in the privacy policy. |
| Share action | Spot name, canonical Soleil web URL, and content the person chooses to share | iOS share sheet and chosen destination | User-directed sharing | Subject to the selected share extension | Governed by the destination chosen by the person | Usually user-directed, but verify the exact payload and privacy policy wording. |
| Support email | User-entered bug description or spot suggestion. Bug drafts also include the current Soleil URL, user agent, and timestamp | The person's email app, email provider, and `sadhvikac1@gmail.com` if the person sends the draft | Respond to support requests and evaluate product or spot improvements | A draft may remain in the person's mail app. Sent mail remains in the operator's mailbox until manually deleted | Access is currently limited to Sadhvika. A fixed retention period is unresolved, so the public notice discloses that limitation and provides a deletion-request path | Nothing is transmitted merely by opening the Soleil form. The person reviews and sends the email through their chosen mail provider. Approve a fixed retention practice before final publication. |
| Saved Spots | Spot identifiers and storage schema | Capacitor Preferences and iOS UserDefaults | Persist favorites across app launches | Yes, on the device until removal, app uninstall, or platform cleanup | No intended server recipient | Expected not to be App Store “collection” because it remains on device. Verify no backup or synchronization claim is made. |
| Other preferences | Home and active city, filters, category, temperature unit, onboarding state, and install-prompt state | Browser storage used by the shared React application | Preserve display choices and dismissed guidance | Yes, locally on the device or in the browser profile | No intended server recipient | Expected not to be App Store “collection” because it remains on device. Document removal through uninstall or clearing site data, and verify native storage behavior in the candidate. |
| PWA saved spots | Spot identifiers and storage schema | IndexedDB in the browser | Persist favorites across browser launches | Yes, in the browser profile | No intended server recipient | Relevant to the public privacy policy even though the App Store label applies to the iOS app. |
| Built-in spot catalog | Public spot metadata and coordinates | Bundled in the application | Enable city and spot browsing | Bundled with the app | No user data | Not user-data collection. Verify content rights and attribution separately. |
| Crash diagnostics | No app-specific crash SDK found in the audited repository | Apple may provide privacy-protected usage and crash information when the person opts in through iOS settings | Diagnose crashes and improve reliability | Controlled by Apple | Apple controls collection and sharing. The release owner has not yet approved whether App Store Connect analytics and crash reports will be accessed | Confirm the release-owner practice and App Privacy answer. Any future crash SDK reopens this review. |
| Analytics and advertising | None found in the audited repository | None intended | None | None | None | Re-audit dependencies and the production binary. Any future analytics or advertising addition reopens the privacy review. |

## Required production vendor audit

For Open-Meteo, CARTO, Google Maps, Vercel, Apple diagnostics, and any provider added before submission, record:

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

Current primary-source evidence:

- [Open-Meteo Terms and Privacy](https://open-meteo.com/en/terms)
- [CARTO Basemap Terms](https://carto.com/legal/basemap-terms/)
- [CARTO API key requirement](https://carto.com/basemaps/apikey/)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
- [Google Privacy Policy](https://policies.google.com/privacy)
- [Vercel Privacy Notice](https://vercel.com/legal/privacy-policy)
- [Apple analytics sharing controls](https://support.apple.com/en-us/108971)
- [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)

Recheck each source against the candidate date. Provider terms can change independently of the repository.

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
