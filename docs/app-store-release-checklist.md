# Soleil App Store release checklist

This checklist separates repository readiness from actions that require Sadhvika's Apple account, legal attestations, a physical device, or App Store Connect. It is not evidence that a build has been signed, uploaded, or approved.

## Current known status

| Area | Current state | Release decision or evidence still required |
| --- | --- | --- |
| Product | One React application supports the website, installable PWA, and Capacitor iOS shell. | Keep web and iOS behavior aligned for the exact release commit. |
| Bundle identifier | `com.sadhvika.soleil` is committed in the Capacitor and Xcode projects. | Treat it as permanent once the first App Store record or build uses it. |
| App name | `Soleil` | Confirm availability when creating the App Store Connect record. |
| Version and build | Xcode currently declares marketing version `1.0` and build `1`. | Confirm the exact values for each candidate. Increase the build number for every upload of the same version. |
| Minimum iOS | `15.0` | Confirm that supporting iOS 15 remains intentional after a full Xcode build and device matrix review. |
| Device family | The Xcode target currently declares `1,2`, which means iPhone and iPad. | Choose iPhone-only or fully support iPad before creating screenshots and submitting. |
| Target device | Sadhvika's iPhone 17 Pro on iOS 26.6 | Run the physical-device and TestFlight acceptance checklists on this device. This does not replace coverage for every supported device family. |
| Apple toolchain | The current Codex host has Command Line Tools selected, not a full Xcode installation. | Install and select Xcode 26 or later, then build with the iOS 26 SDK or later. |
| Apple membership | Sadhvika is not enrolled in the Apple Developer Program. | Enroll before App Store Connect and TestFlight distribution. |
| Signing | No team ID, certificate, provisioning profile, credential, or upload secret is committed. | Select a team and use Xcode-managed signing locally. Keep all signing material out of the repository. |
| Artwork | Native icon and splash assets are provisional. | Approve final Soleil artwork and validate the opaque 1024 by 1024 App Store icon. |
| Public web origin | Native sharing currently uses `https://go-outside-six.vercel.app` unless `VITE_PUBLIC_WEB_ORIGIN` overrides it. | Approve the permanent public origin. If it changes, coordinate app sharing, web metadata, Universal Links, and App Store metadata. |
| Map provider authorization | Soleil currently requests CARTO raster basemaps without an API key. CARTO's current terms require each customer to use a unique key. | Obtain and configure an approved CARTO key, or approve and validate a replacement provider, before either public web/PWA deployment or TestFlight release approval. Strict release preflight detects the current production URL directly and remains blocked while it is present. |
| Privacy and support pages | Proposed URLs are not published, and a fixed support-email retention period is not yet approved. | Approve the operator retention practice, publish, and verify the public pages before submission. Suggested paths are `https://sadhvika.com/soleil/privacy` and `https://sadhvika.com/soleil/support`, but these are not commitments until live. |
| Privacy | The app declares When In Use location and a UserDefaults required-reason API. | Complete the production vendor and retention audit, generate Xcode's privacy report, and submit truthful App Privacy answers. |
| Web fonts | Soleil now bundles the used Fontsource webfont subsets and their license notices. | Confirm the exact production build makes no automatic Google Fonts request. |
| Export compliance | No repository value makes a legal export-compliance attestation. | The account holder must answer App Store Connect's encryption questions for the exact binary. |

## Gate 1: Make the product-scope decisions

- [ ] Choose supported device families.
  - The current target includes iPhone and iPad.
  - The smallest first-release scope is iPhone-only, which matches the named iPhone 17 Pro test device and avoids implying an untested iPad experience.
  - Keeping iPad support requires iPad layout, orientation, accessibility, screenshot, and TestFlight evidence.
- [ ] Confirm whether iOS 15 remains the minimum supported version.
- [ ] Approve the permanent release website origin.
- [ ] Approve the production map-provider contract. The current CARTO integration needs a unique API key under CARTO's current terms. Do not deploy this integration to the public web/PWA or approve it for TestFlight while the strict release preflight reports the unkeyed URL.
- [ ] Approve the final icon, splash treatment, and screenshot visual direction.
- [ ] Approve the App Store category. Draft recommendation: primary `Weather`, secondary `Travel`.
- [ ] Decide whether version `1.0` or `1.0.0` is the intended first public version. Do not change it after submitting that version for review without a release reason.

## Gate 2: Enroll and establish ownership

- [ ] Choose an enrollment type.
  - **Individual:** Apple's seller name is the account holder's legal personal name.
  - **Organization:** Requires a real legal entity, authority to bind it, a D-U-N-S Number, an organization-associated email address, and a functional organization website. Owning `sadhvika.com` alone does not make an individual project eligible for organization enrollment.
- [ ] Enroll in the [Apple Developer Program](https://developer.apple.com/help/account/membership/program-enrollment/). The standard membership is currently listed by Apple as USD 99 per membership year, subject to region and eligibility.
- [ ] Accept current Apple agreements.
- [ ] Complete banking and tax information only if the app or future in-app purchases require it.
- [ ] Keep the Apple ID, two-factor authentication, recovery access, certificates, and provisioning profiles under Sadhvika's control.

A free Personal Team can be useful for temporary testing on Sadhvika's own iPhone, but it cannot distribute through TestFlight or the App Store and its provisioning expires. It is not a substitute for enrollment.

## Gate 3: Prepare the Apple records

- [ ] Register an explicit App ID for `com.sadhvika.soleil` in Certificates, Identifiers & Profiles. See [Register an App ID](https://developer.apple.com/help/account/identifiers/register-an-app-id).
- [ ] Create the App Store Connect app record with the exact bundle identifier. See [Add a new app](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app).
- [ ] Record the Apple SKU in the private release log. It does not need to be user-facing.
- [ ] Set app access for App Store Connect users.
- [ ] Complete the current age-rating questionnaire. Apple requires the updated rating system for submissions. See [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/).
- [ ] Complete content-rights, export-compliance, pricing, availability, storefront, and any EU Digital Services Act trader-status questions that App Store Connect presents.

Do not commit App Store Connect credentials, issuer IDs, private keys, signing identities, team IDs, provisioning profiles, or API keys.

## Gate 4: Prepare the release content

- [ ] Publish a privacy policy at an approved HTTPS URL.
- [ ] Publish a support page with a working contact route at an approved HTTPS URL.
- [ ] Finalize the text in [app-store-metadata.md](./app-store-metadata.md).
- [ ] Finalize the privacy answers using [app-privacy-data-inventory.md](./app-privacy-data-inventory.md).
- [ ] Approve the final 1024 by 1024 App Store icon. It must not contain transparency.
- [ ] Capture current screenshots from the exact candidate build.
  - Apple accepts 1 to 10 screenshots per required display size.
  - The iPhone 17 Pro is in Apple's 6.3-inch class. Verify the current required screenshot classes in App Store Connect before capture.
  - If iPad remains supported, capture and validate the required iPad screenshots too.
- [ ] Ensure screenshots, description, and review notes show actual current behavior and do not overstate forecast certainty, offline behavior, location precision, or supported cities.

Use Apple's current [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) when exporting assets.

## Gate 5: Build the exact candidate

- [ ] Install and select Xcode 26 or later.
- [ ] Confirm the selected Xcode includes the iOS 26 SDK or later. Apple states that uploads must use Xcode 26 and the iOS 26 SDK starting April 28, 2026. Check [Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/) again on release day.
- [ ] Run repository checks from a clean checkout of the exact candidate commit.
- [ ] Run `npm ci`, `npm run build`, `npm run ios:verify`, and the repository's release-readiness verification command.
- [ ] Run strict release preflight with the intended version and build. The four approval variables are nonsecret attestations and must be set only by the named release owner after reviewing the corresponding evidence:

```bash
SOLEIL_RELEASE_CANDIDATE=1 \
SOLEIL_MARKETING_VERSION=1.0 \
SOLEIL_BUILD_NUMBER=1 \
SOLEIL_DEVICE_FAMILY_APPROVAL=approved \
SOLEIL_PRIVACY_AUDIT_APPROVAL=approved \
SOLEIL_ARTWORK_APPROVAL=approved \
SOLEIL_PUBLIC_ORIGIN_APPROVAL=approved \
npm run ios:release:verify
```

  Strict preflight also requires eligible repository state, an authorized production map integration for both public web/PWA deployment and TestFlight, and removal of the legacy signing identity through the supported Xcode version. The map-provider gate reads the production map source and cannot be bypassed by an attestation while an unkeyed CARTO raster URL remains. An attestation cannot bypass an ineligible icon, splash, origin, privacy structure, or device-family setting. This command verifies only the gates it names. It does not attest to enrollment, export compliance, App Store metadata, archive validation, signing, physical-device acceptance, or TestFlight acceptance.
- [ ] Confirm generated native web assets have no uncommitted drift.
- [ ] In Xcode, select Sadhvika's team and use automatic signing.
- [ ] Confirm Release configuration, bundle identifier, marketing version, build number, deployment target, and device family.
- [ ] Generate and inspect Xcode's aggregated privacy report for the archive.
- [ ] Run the archive locally on the iPhone 17 Pro where possible, then complete [testflight-acceptance.md](./testflight-acceptance.md).
- [ ] Archive with the generic iOS device destination and validate the archive in Xcode Organizer.

No successful browser test or static repository check replaces an Xcode archive, signing validation, or physical-device test.

## Gate 6: Upload and use TestFlight

- [ ] Upload the validated archive through Xcode Organizer. See [Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds).
- [ ] Wait for App Store Connect processing and resolve all warnings.
- [ ] Verify the processed build displays the intended version, build, bundle identifier, icon, privacy manifest, and supported devices.
- [ ] Complete beta app description, feedback email, contact information, and `What to Test`.
- [ ] Start with internal TestFlight testers. Apple supports up to 100 App Store Connect users as internal testers.
- [ ] Use external testing only after internal acceptance. Apple supports up to 10,000 external testers, and the first external build generally requires Beta App Review.
- [ ] Remember that TestFlight builds expire after 90 days.
- [ ] Record pass or fail evidence against the exact commit, version, build, device, iOS version, and TestFlight build.

See Apple's [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

## Gate 7: Submit to App Review

- [ ] Select the exact accepted build.
- [ ] Complete App Privacy answers after the vendor and retention audit, not from assumptions.
- [ ] Complete export-compliance answers as a human legal attestation for that binary. See [Overview of export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance).
- [ ] Confirm the support and privacy URLs are live without authentication.
- [ ] Provide review notes and a deterministic review path. Location must remain optional.
- [ ] Confirm the reviewer can browse cities, open spots, inspect sky conditions, use the Now scrubber, save spots, and understand confidence and freshness without granting location.
- [ ] Confirm every external provider and content source is permitted for production App Store use.
- [ ] Complete the [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) review, especially Guideline 4.2 on minimum functionality for apps that wrap web technology.
- [ ] Submit using Apple's [submission workflow](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/).

## Release evidence record

Copy this block into the private release log for each candidate:

```text
Release owner:
Candidate commit (full SHA):
Branch or tag:
Marketing version:
Build number:
Bundle identifier: com.sadhvika.soleil
Public web origin:
Xcode version:
iOS SDK:
Archive creation date:
Archive validation result:
App Store Connect build state:
TestFlight build:
Target device: iPhone 17 Pro
Target iOS: 26.6
Device-family decision:
Privacy inventory approved by/date:
Export compliance attested by/date:
TestFlight acceptance approved by/date:
Known limitations:
App Review submission ID/date:
```
