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
  publicContractText,
  mainSource,
  mapLayerSource,
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
  read('config/public-url-contract.json'),
  read('src/main.tsx'),
  read('src/components/OpenFreeMapLayer.tsx'),
  read('src/components/PWAInstallPrompt.tsx'),
  read('src/platform/runtime.ts'),
  read('src/platform/preferencesStorage.ts'),
  read('public/manifest.json'),
  read('public/sw.js'),
]);

const publicContract = JSON.parse(publicContractText);
const publicOrigin = runtimeSource.match(/\bDEFAULT_PUBLIC_WEB_ORIGIN\s*=\s*['"]([^'"]+)['"]/)?.[1];
let structurallyEligiblePublicOrigin = false;
if (publicOrigin) {
  try {
    const parsed = new URL(publicOrigin);
    structurallyEligiblePublicOrigin = parsed.protocol === 'https:'
      && !parsed.username
      && !parsed.password
      && parsed.pathname === '/'
      && !parsed.search
      && !parsed.hash
      && parsed.origin === publicOrigin;
  } catch {
    structurallyEligiblePublicOrigin = false;
  }
}

const parsedWebManifest = JSON.parse(webManifest);
const contractIcons = publicContract.icons.map(({ src, width, height, contentType, purpose }) => (
  `${src}|${width}x${height}|${contentType}|${purpose}`
));
const manifestIcons = (parsedWebManifest.icons ?? []).map(({ src, sizes, type, purpose }) => (
  `${src}|${sizes}|${type}|${purpose}`
));

const checks = [
  ['Capacitor app ID', config.includes("appId: 'com.sadhvika.soleil'")],
  ['Capacitor app name', config.includes("appName: 'Soleil'")],
  ['native web directory', config.includes("webDir: 'dist'")],
  ['exact Capacitor core pin', packageJson.includes('"@capacitor/core": "8.5.0"')],
  ['exact App Launcher pin', packageJson.includes('"@capacitor/app-launcher": "8.0.1"')],
  ['exact Capacitor iOS pin', packageJson.includes('"@capacitor/ios": "8.5.0"')],
  ['exact Capacitor CLI pin', packageJson.includes('"@capacitor/cli": "8.5.0"')],
  ['exact Preferences pin', packageJson.includes('"@capacitor/preferences": "8.0.1"')],
  ['exact MapLibre GL pin', packageJson.includes('"maplibre-gl": "5.17.0"')],
  ['exact MapLibre Leaflet binding pin', packageJson.includes('"@maplibre/maplibre-gl-leaflet": "0.1.3"')],
  ['Xcode bundle ID', project.includes('PRODUCT_BUNDLE_IDENTIFIER = com.sadhvika.soleil;')],
  ['When In Use location purpose', info.includes('<key>NSLocationWhenInUseUsageDescription</key>')],
  ['no background location purpose', !info.includes('NSLocationAlways')],
  ['Preferences plugin package', packageManifest.includes('CapacitorPreferences')],
  ['App Launcher plugin package', packageManifest.includes('CapacitorAppLauncher')],
  ['UserDefaults privacy category', privacy.includes('NSPrivacyAccessedAPICategoryUserDefaults')],
  ['UserDefaults approved reason', privacy.includes('<string>CA92.1</string>')],
  ['privacy manifest target membership', project.includes('PrivacyInfo.xcprivacy in Resources')],
  ['bundled Leaflet CSS', !nativeIndex.includes('unpkg.com/leaflet')],
  ['approved OpenFreeMap beta styles', mapLayerSource.includes('https://tiles.openfreemap.org/styles/liberty') && mapLayerSource.includes('https://tiles.openfreemap.org/styles/positron')],
  ['no legacy CARTO map source', !mapLayerSource.includes('cartocdn.com') && !mapLayerSource.includes('CARTO')],
  ['no map credential in source', !/(?:api_?key|apikey|access_token)=/i.test(mapLayerSource)],
  ['no committed live-reload URL', !config.includes('server:') && !nativeConfig.includes('"server"')],
  ['no in-WebView navigation allowlist', !config.includes('allowNavigation') && !nativeConfig.includes('allowNavigation')],
  ['no App Transport Security exception', !info.includes('NSAppTransportSecurity')],
  ['no background modes', !info.includes('UIBackgroundModes')],
  ['no committed Apple team', !project.includes('DEVELOPMENT_TEAM')],
  ['automatic signing retained', (project.match(/CODE_SIGN_STYLE = Automatic;/g) ?? []).length === 2],
  ['no committed signing identity', !project.includes('CODE_SIGN_IDENTITY')],
  ['no committed provisioning profile', !/PROVISIONING_PROFILE(?:_SPECIFIER)?\s*=/.test(project)],
  ['service worker retained for PWA', webManifest.includes('"display": "standalone"') && serviceWorker.length > 0],
  ['public route contract is root scoped', publicContract.paths.app === '/' && publicContract.pwa.id === '/' && publicContract.pwa.startUrl === '/' && publicContract.pwa.scope === '/'],
  ['manifest identity matches public route contract', parsedWebManifest.id === publicContract.pwa.id && parsedWebManifest.start_url === publicContract.pwa.startUrl && parsedWebManifest.scope === publicContract.pwa.scope],
  ['manifest icons match public route contract', JSON.stringify(manifestIcons) === JSON.stringify(contractIcons)],
  ['service worker path matches public route contract', mainSource.includes(`register(PUBLIC_SERVICE_WORKER_PATH)`) && publicContract.paths.serviceWorker === '/sw.js'],
  ['service worker disabled only in native',
    mainSource.includes("'serviceWorker' in navigator")
      && mainSource.includes("import('./platform/runtime.ts')")
      && /if\s*\(\s*!isNativeRuntime\(\)(?:\s*&&\s*'serviceWorker' in navigator)?\s*\)/.test(mainSource)],
  ['install prompt disabled in native', installPromptSource.includes('if (isNativeRuntime())')],
  ['canonical native share fallback is an HTTPS root origin', structurallyEligiblePublicOrigin],
  ['native durable null uses one set', preferencesSource.includes('encodeEnvelope(next.value)') && !preferencesSource.includes('preferences.remove(')],
];

const failures = checks.filter(([, passed]) => !passed).map(([label]) => label);
if (failures.length > 0) {
  throw new Error(`iOS shell verification failed: ${failures.join(', ')}`);
}

console.log(`iOS shell verification passed (${checks.length} checks).`);
