import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [
  config,
  info,
  privacy,
  project,
  packageManifest,
  nativeIndex,
  nativeConfig,
  packageJson,
  mainSource,
  installPromptSource,
  runtimeSource,
  preferencesSource,
  webManifest,
  serviceWorker,
] = await Promise.all([
  read('capacitor.config.ts'),
  read('ios/App/App/Info.plist'),
  read('ios/App/App/PrivacyInfo.xcprivacy'),
  read('ios/App/App.xcodeproj/project.pbxproj'),
  read('ios/App/CapApp-SPM/Package.swift'),
  read('ios/App/App/public/index.html'),
  read('ios/App/App/capacitor.config.json'),
  read('package.json'),
  read('src/main.tsx'),
  read('src/components/PWAInstallPrompt.tsx'),
  read('src/platform/runtime.ts'),
  read('src/platform/preferencesStorage.ts'),
  read('public/manifest.json'),
  read('public/sw.js'),
]);

const checks = [
  ['Capacitor app ID', config.includes("appId: 'com.sadhvika.soleil'")],
  ['Capacitor app name', config.includes("appName: 'Soleil'")],
  ['native web directory', config.includes("webDir: 'dist'")],
  ['exact Capacitor core pin', packageJson.includes('"@capacitor/core": "8.5.0"')],
  ['exact App Launcher pin', packageJson.includes('"@capacitor/app-launcher": "8.0.1"')],
  ['exact Capacitor iOS pin', packageJson.includes('"@capacitor/ios": "8.5.0"')],
  ['exact Capacitor CLI pin', packageJson.includes('"@capacitor/cli": "8.5.0"')],
  ['exact Preferences pin', packageJson.includes('"@capacitor/preferences": "8.0.1"')],
  ['Xcode bundle ID', project.includes('PRODUCT_BUNDLE_IDENTIFIER = com.sadhvika.soleil;')],
  ['When In Use location purpose', info.includes('<key>NSLocationWhenInUseUsageDescription</key>')],
  ['no background location purpose', !info.includes('NSLocationAlways')],
  ['Preferences plugin package', packageManifest.includes('CapacitorPreferences')],
  ['App Launcher plugin package', packageManifest.includes('CapacitorAppLauncher')],
  ['UserDefaults privacy category', privacy.includes('NSPrivacyAccessedAPICategoryUserDefaults')],
  ['UserDefaults approved reason', privacy.includes('<string>CA92.1</string>')],
  ['privacy manifest target membership', project.includes('PrivacyInfo.xcprivacy in Resources')],
  ['bundled Leaflet CSS', !nativeIndex.includes('unpkg.com/leaflet')],
  ['no committed live-reload URL', !config.includes('server:') && !nativeConfig.includes('"server"')],
  ['no in-WebView navigation allowlist', !config.includes('allowNavigation') && !nativeConfig.includes('allowNavigation')],
  ['no App Transport Security exception', !info.includes('NSAppTransportSecurity')],
  ['no background modes', !info.includes('UIBackgroundModes')],
  ['no committed Apple team', !project.includes('DEVELOPMENT_TEAM')],
  ['service worker retained for PWA', webManifest.includes('"display": "standalone"') && serviceWorker.length > 0],
  ['service worker disabled only in native', mainSource.includes("!isNativeRuntime() && 'serviceWorker' in navigator")],
  ['install prompt disabled in native', installPromptSource.includes('if (isNativeRuntime())')],
  ['canonical native HTTPS share origin', runtimeSource.includes("DEFAULT_PUBLIC_WEB_ORIGIN = 'https://go-outside-six.vercel.app'")],
  ['native durable null uses one set', preferencesSource.includes('encodeEnvelope(next.value)') && !preferencesSource.includes('preferences.remove(')],
];

const failures = checks.filter(([, passed]) => !passed).map(([label]) => label);
if (failures.length > 0) {
  throw new Error(`iOS shell verification failed: ${failures.join(', ')}`);
}

console.log(`iOS shell verification passed (${checks.length} checks).`);
