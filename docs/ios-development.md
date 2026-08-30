# Soleil iOS development

Soleil uses one React application for the website, installable PWA, and Capacitor iOS shell. The iOS bundle identifier is `com.sadhvika.soleil`, and the native display name is `Soleil`.

## What the shell does

- Packages the production Vite output from `dist/` inside an iOS application.
- Keeps the website and PWA behavior unchanged in web browsers.
- Disables the web install prompt and service-worker registration only inside Capacitor.
- Requests location only after the existing `Use my location` action. The shell declares When In Use access and does not declare background location access.
- Keeps saved spots in Capacitor Preferences on iOS. This maps to `UserDefaults`, remains local to this installation, and is cleared if the app is uninstalled. The PWA continues to use transactional IndexedDB.
- Migrates an existing saved-spots value from WebView storage once when the native Preferences value is missing.
- Shares spot links using the canonical public website instead of a `capacitor://localhost` URL.
- Opens top-level external URLs with the iOS system handler through Capacitor's default navigation policy. No external host is permitted to replace the app's main WebView.

Location coordinates are session-only. They are not written to Preferences, IndexedDB, or local storage.

## Local workflow

Requirements:

- Node.js 22 or newer.
- A recent full Xcode installation that supports the connected iPhone's iOS version.
- An Apple ID selected by the developer in Xcode for local device signing.

Install dependencies and regenerate the native web bundle:

```bash
npm ci
npm run native:sync
```

Run the repository-level shell checks:

```bash
npm run ios:verify
```

Open the generated project:

```bash
npm run ios:open
```

In Xcode, select the `App` target, select the developer-owned signing team, choose the connected iPhone, and run. Signing identities, provisioning profiles, team IDs, Apple credentials, and device registrations must never be committed.

After any React or configuration change, run `npm run native:sync` before building again in Xcode.

## Public URL contract

Native share links currently use `https://go-outside-six.vercel.app`. A build can override this with `VITE_PUBLIC_WEB_ORIGIN`, but the value must be an HTTPS origin.

If Soleil moves to a custom domain, update the public origin, website metadata, Universal Links association, and App Store metadata as one coordinated release. Universal Links and warm or cold inbound app-link routing are not enabled in this shell because they require control of the deployed domain and Apple signing capabilities.

## Privacy and storage

`Info.plist` contains only `NSLocationWhenInUseUsageDescription` for location. There is no Always or background-location purpose string or capability.

`PrivacyInfo.xcprivacy` declares `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1`, as required by the Capacitor Preferences plugin. The manifest does not claim other data collection or required-reason API use.

App Store privacy answers remain a human release gate. They must be reviewed against the actual production build, forecast providers, map providers, diagnostics, and any analytics added later.

## Known gates before TestFlight

- Install and select a full Xcode toolchain, then compile and run on the target iPhone.
- Replace the generated Capacitor placeholder icon and splash assets. The current PWA artwork has transparency and is not accepted as a final opaque 1024 by 1024 App Store icon without design work.
- Enroll in the Apple Developer Program before TestFlight or App Store distribution.
- Select the signing team and create the App Store Connect app record as explicit human actions.
- Verify location allow, deny, approximate, retry, and Settings recovery on a physical iPhone.
- Verify saved spots across termination and relaunch, plus removal after uninstall.
- Review the privacy manifest and App Store privacy disclosures.
- Add Universal Links only after the canonical domain and associated-domain deployment are approved.

The shell intentionally contains no Apple team ID, signing certificate, provisioning profile, distribution upload, or App Store submission automation.
