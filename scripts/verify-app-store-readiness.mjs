import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { inspectMapProviderContract } from './map-provider-contract.mjs';

const root = new URL('../', import.meta.url);
const paths = {
  capacitor: 'capacitor.config.ts',
  iconContents: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json',
  info: 'ios/App/App/Info.plist',
  mapLayer: 'src/components/OpenFreeMapLayer.tsx',
  mapView: 'src/components/MapView.tsx',
  privacy: 'ios/App/App/PrivacyInfo.xcprivacy',
  project: 'ios/App/App.xcodeproj/project.pbxproj',
  runtime: 'src/platform/runtime.ts',
  splashContents: 'ios/App/App/Assets.xcassets/Splash.imageset/Contents.json',
  thirdPartyNotices: 'public/third-party-notices.txt',
};

const PLACEHOLDER_ICON_HASHES = new Set([
  // Capacitor 8 iOS template icon. Shipping it makes the app look unfinished.
  '29e4777e319de3ee5a52c3a8004ec19d0568414004257e36d7c94a077d71c93b',
]);
const PLACEHOLDER_SPLASH_HASHES = new Set([
  // Capacitor 8 iOS template splash screen.
  '1b5002b74a5500e697298ced06ca2811ac33f2771f236f3c720ff23243890530',
]);

const isApproved = (value) => value === 'approved';

const parseArguments = (args) => {
  const options = {
    expectedBuild: process.env.SOLEIL_BUILD_NUMBER,
    expectedMarketing: process.env.SOLEIL_MARKETING_VERSION,
    strict: process.env.SOLEIL_RELEASE_CANDIDATE === '1',
    approvals: {
      artwork: isApproved(process.env.SOLEIL_ARTWORK_APPROVAL),
      deviceFamily: isApproved(process.env.SOLEIL_DEVICE_FAMILY_APPROVAL),
      mapProvider: isApproved(process.env.SOLEIL_MAP_PROVIDER_APPROVAL),
      privacyAudit: isApproved(process.env.SOLEIL_PRIVACY_AUDIT_APPROVAL),
      publicOrigin: isApproved(process.env.SOLEIL_PUBLIC_ORIGIN_APPROVAL),
    },
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--strict') {
      options.strict = true;
    } else if (argument === '--marketing-version') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--marketing-version requires a value.');
      options.expectedMarketing = value;
      index += 1;
    } else if (argument === '--build-number') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--build-number requires a value.');
      options.expectedBuild = value;
      index += 1;
    } else if (argument === '--help') {
      console.log('Usage: npm run ios:release:verify -- [--strict] [--marketing-version 1.0.0] [--build-number 1]');
      console.log('Strict mode requires both intended versions and every applicable human gate to resolve.');
      console.log('Version environment: SOLEIL_RELEASE_CANDIDATE=1 SOLEIL_MARKETING_VERSION=1.0.0 SOLEIL_BUILD_NUMBER=1');
      console.log('Nonsecret attestations use the exact value "approved":');
      console.log('  SOLEIL_DEVICE_FAMILY_APPROVAL, SOLEIL_MAP_PROVIDER_APPROVAL,');
      console.log('  SOLEIL_PRIVACY_AUDIT_APPROVAL,');
      console.log('  SOLEIL_ARTWORK_APPROVAL, SOLEIL_PUBLIC_ORIGIN_APPROVAL');
      console.log('A structurally ineligible gate cannot be bypassed by an attestation.');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
};

const options = parseArguments(process.argv.slice(2));
const readText = (path) => readFile(new URL(path, root), 'utf8');
const readBytes = (path) => readFile(new URL(path, root));
const readSourceTree = async (relativeDirectory) => {
  const directory = new URL(`${relativeDirectory}/`, root);
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory() && entry.name === '__tests__') return [];
    if (entry.isDirectory()) return readSourceTree(relativePath);
    if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) return [];
    return [{ path: relativePath, source: await readText(relativePath) }];
  }));
  return nested.flat();
};

const [capacitor, info, mapLayer, mapView, privacy, project, runtime, iconContentsText, splashContentsText, thirdPartyNotices, sourceFiles] = await Promise.all([
  readText(paths.capacitor),
  readText(paths.info),
  readText(paths.mapLayer),
  readText(paths.mapView),
  readText(paths.privacy),
  readText(paths.project),
  readText(paths.runtime),
  readText(paths.iconContents),
  readText(paths.splashContents),
  readText(paths.thirdPartyNotices),
  readSourceTree('src'),
]);

const staticChecks = [];
const humanGates = [];
const check = (label, passed, detail) => staticChecks.push({ label, passed, detail });
const gate = (label, resolved, detail) => humanGates.push({ label, resolved, detail });

const capture = (source, expression, label) => {
  const match = source.match(expression);
  check(label, Boolean(match), match ? undefined : 'Required value was not found.');
  return match?.[1];
};

const uniqueSettingValues = (name) => [...new Set(
  [...project.matchAll(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]+)"|([^;]+));`, 'g'))]
    .map((match) => (match[1] ?? match[2]).trim()),
)];

const capacitorId = capture(capacitor, /\bappId:\s*['"]([^'"]+)['"]/, 'Capacitor app ID is declared');
const capacitorName = capture(capacitor, /\bappName:\s*['"]([^'"]+)['"]/, 'Capacitor app name is declared');
const displayName = capture(info, /<key>CFBundleDisplayName<\/key>\s*<string>([^<]+)<\/string>/, 'iOS display name is declared');
const infoBundleId = capture(info, /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/, 'Info.plist bundle ID binding is declared');
const infoMarketing = capture(info, /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/, 'Info.plist marketing version binding is declared');
const infoBuild = capture(info, /<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/, 'Info.plist build number binding is declared');

const bundleIds = uniqueSettingValues('PRODUCT_BUNDLE_IDENTIFIER');
const marketingVersions = uniqueSettingValues('MARKETING_VERSION');
const buildNumbers = uniqueSettingValues('CURRENT_PROJECT_VERSION');
const productNames = uniqueSettingValues('PRODUCT_NAME');
const deviceFamilies = uniqueSettingValues('TARGETED_DEVICE_FAMILY');

check('Debug and Release use one bundle ID', bundleIds.length === 1, `Found: ${bundleIds.join(', ') || 'none'}`);
check('Capacitor and Xcode bundle IDs match', bundleIds.length === 1 && capacitorId === bundleIds[0], `Capacitor: ${capacitorId}; Xcode: ${bundleIds.join(', ')}`);
check('Bundle ID is release-quality reverse DNS', bundleIds.length === 1 && /^(?!.*(?:^|\.)(?:example|placeholder|test)(?:\.|$))[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+){2,}$/.test(bundleIds[0]), `Found: ${bundleIds[0]}`);
check('Info.plist resolves the Xcode bundle ID', infoBundleId === '$(PRODUCT_BUNDLE_IDENTIFIER)', `Found: ${infoBundleId}`);
check('Capacitor and iOS display names match', Boolean(capacitorName) && capacitorName === displayName, `Capacitor: ${capacitorName}; iOS: ${displayName}`);
check('Display name is not a template placeholder', Boolean(displayName) && !/^(?:app|my app|capacitor|example)$/i.test(displayName.trim()), `Found: ${displayName}`);
check('Xcode product name is consistently target-derived', productNames.length === 1 && productNames[0] === '$(TARGET_NAME)', `Found: ${productNames.join(', ') || 'none'}`);

const validAppleVersion = (value, maximumLength = Number.POSITIVE_INFINITY) => (
  typeof value === 'string'
  && value.length <= maximumLength
  && /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,2}$/.test(value)
  && value.split('.').some((component) => Number(component) > 0)
);
check('Debug and Release use one marketing version', marketingVersions.length === 1, `Found: ${marketingVersions.join(', ') || 'none'}`);
check('Marketing version is valid and nonplaceholder', marketingVersions.length === 1 && validAppleVersion(marketingVersions[0]), `Found: ${marketingVersions[0]}`);
check('Info.plist resolves the marketing version', infoMarketing === '$(MARKETING_VERSION)', `Found: ${infoMarketing}`);
check('Debug and Release use one build number', buildNumbers.length === 1, `Found: ${buildNumbers.join(', ') || 'none'}`);
check('Build number is valid and nonplaceholder', buildNumbers.length === 1 && validAppleVersion(buildNumbers[0], 18), `Found: ${buildNumbers[0]}`);
check('Info.plist resolves the build number', infoBuild === '$(CURRENT_PROJECT_VERSION)', `Found: ${infoBuild}`);

gate(
  'Intended marketing version is explicit and matches Xcode',
  Boolean(options.expectedMarketing) && marketingVersions.length === 1 && marketingVersions[0] === options.expectedMarketing,
  options.expectedMarketing ? `Expected ${options.expectedMarketing}; found ${marketingVersions[0]}` : 'Supply --marketing-version or SOLEIL_MARKETING_VERSION.',
);
gate(
  'Intended build number is explicit and matches Xcode',
  Boolean(options.expectedBuild) && buildNumbers.length === 1 && buildNumbers[0] === options.expectedBuild,
  options.expectedBuild ? `Expected ${options.expectedBuild}; found ${buildNumbers[0]}` : 'Supply --build-number or SOLEIL_BUILD_NUMBER.',
);

check('Debug and Release use one device-family setting', deviceFamilies.length === 1, `Found: ${deviceFamilies.join(', ') || 'none'}`);
const familyIds = new Set((deviceFamilies[0] ?? '').replaceAll('"', '').split(',').map((value) => value.trim()).filter(Boolean));
check('iPhone is included in supported device families', familyIds.has('1'), `Found: ${[...familyIds].join(', ') || 'none'}`);
const deviceFamilyEligible = deviceFamilies.length === 1 && familyIds.has('1') && [...familyIds].every((family) => family === '1' || family === '2');
check('Device-family setting contains only supported iPhone or iPad IDs', deviceFamilyEligible, `Found: ${[...familyIds].join(', ') || 'none'}`);
gate(
  'Supported device families are an approved release choice',
  deviceFamilyEligible && options.approvals.deviceFamily,
  `${familyIds.has('2') ? 'The project includes iPad, including its QA and screenshot obligations.' : 'The project is iPhone-only.'} ${options.approvals.deviceFamily ? 'Approval attestation received.' : 'Set SOLEIL_DEVICE_FAMILY_APPROVAL=approved after approving this scope.'}`,
);

const capabilitiesBody = info.match(/<key>UIRequiredDeviceCapabilities<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] ?? '';
const capabilities = [...capabilitiesBody.matchAll(/<string>([^<]+)<\/string>/g)].map((match) => match[1]);
check('Required device capabilities specify arm64', capabilities.includes('arm64'), `Found: ${capabilities.join(', ') || 'none'}`);
check('Required device capabilities do not require legacy armv7', !capabilities.includes('armv7'), `Found: ${capabilities.join(', ') || 'none'}`);

const hasKey = (key) => new RegExp(`<key>${key}<\\/key>`).test(privacy);
const keyHasBoolean = (key) => new RegExp(`<key>${key}<\\/key>\\s*<(?:true|false)\\s*\\/>`).test(privacy);
const keyHasArray = (key) => new RegExp(`<key>${key}<\\/key>\\s*(?:<array(?:\\s[^>]*)?>[\\s\\S]*?<\\/array>|<array\\s*\\/>)`).test(privacy);
const trackingShapeValid = !hasKey('NSPrivacyTracking') || keyHasBoolean('NSPrivacyTracking');
const trackingDomainsShapeValid = !hasKey('NSPrivacyTrackingDomains') || keyHasArray('NSPrivacyTrackingDomains');
const collectedDataShapeValid = !hasKey('NSPrivacyCollectedDataTypes') || keyHasArray('NSPrivacyCollectedDataTypes');
check('Privacy tracking value is a Boolean when declared', trackingShapeValid);
check('Privacy tracking domains value is an array when declared', trackingDomainsShapeValid);
check('Privacy collected-data value is an array when declared', collectedDataShapeValid);
check('Privacy manifest declares required-reason API use', /<key>NSPrivacyAccessedAPITypes<\/key>\s*<array>[\s\S]+<\/array>/.test(privacy));
check('Privacy manifest declares UserDefaults reason CA92.1', /NSPrivacyAccessedAPICategoryUserDefaults[\s\S]*?<string>CA92\.1<\/string>/.test(privacy));
const privacyShapeEligible = trackingShapeValid && trackingDomainsShapeValid && collectedDataShapeValid;
gate(
  'Privacy manifest and App Store privacy answers match an approved audit',
  privacyShapeEligible && options.approvals.privacyAudit,
  `The collected-data key is ${hasKey('NSPrivacyCollectedDataTypes') ? 'declared as an array' : 'absent, which is structurally allowed'}. ${options.approvals.privacyAudit ? 'Privacy-audit attestation received.' : 'Set SOLEIL_PRIVACY_AUDIT_APPROVAL=approved only after auditing Soleil and its third parties.'}`,
);
check('Privacy manifest is a project file reference', /PrivacyInfo\.xcprivacy.*PBXFileReference/.test(project));
check('Privacy manifest belongs to the app Resources phase', /PrivacyInfo\.xcprivacy in Resources/.test(project));

const signingPatterns = [
  ['No Apple development team is committed', /\bDEVELOPMENT_TEAM\s*=/],
  ['No provisioning profile is committed in Xcode settings', /\bPROVISIONING_PROFILE(?:_SPECIFIER)?\s*=/],
];
for (const [label, expression] of signingPatterns) {
  check(label, !expression.test(project));
}
gate(
  'No legacy signing identity is committed',
  !/\bCODE_SIGN_IDENTITY\s*=/.test(project),
  /\bCODE_SIGN_IDENTITY\s*=/.test(project)
    ? 'The project still contains a legacy CODE_SIGN_IDENTITY setting. Remove it through the supported Xcode version, then validate automatic signing.'
    : 'No signing identity is pinned. The app target retains automatic signing.',
);

const listFiles = async (directoryUrl, prefix = '') => {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    if (entry.isDirectory()) files.push(...await listFiles(new URL(`${entry.name}/`, directoryUrl), relativePath));
    else files.push(relativePath);
  }
  return files;
};
const repositoryFiles = await listFiles(root);
const committedProfileCandidates = repositoryFiles.filter((path) => /\.(?:mobileprovision|provisionprofile|p12|cer|p8|pem|key)$/i.test(path));
check('No signing certificates or provisioning profiles are stored in the repository', committedProfileCandidates.length === 0, committedProfileCandidates.length > 0 ? `Found: ${committedProfileCandidates.join(', ')}` : undefined);

let iconContents;
try {
  iconContents = JSON.parse(iconContentsText);
} catch {
  iconContents = null;
}
const iconEntry = iconContents?.images?.find((image) => image.platform === 'ios' && image.size === '1024x1024' && image.filename);
check('App icon catalog declares a 1024x1024 iOS icon', Boolean(iconEntry), iconEntry ? undefined : 'No matching AppIcon entry was found.');
let iconEligible = false;
let iconEligibilityDetail = 'The required app icon is missing.';
if (iconEntry) {
  const iconPath = `ios/App/App/Assets.xcassets/AppIcon.appiconset/${iconEntry.filename}`;
  const icon = await readBytes(iconPath);
  const pngSignature = icon.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  check('App icon is a PNG', pngSignature, iconPath);
  if (pngSignature && icon.length >= 26) {
    const width = icon.readUInt32BE(16);
    const height = icon.readUInt32BE(20);
    const colorType = icon[25];
    check('App icon pixels are 1024x1024', width === 1024 && height === 1024, `Found: ${width}x${height}`);
    check('App icon has no alpha channel', colorType === 0 || colorType === 2, `PNG color type: ${colorType}`);
  }
  const iconHash = createHash('sha256').update(icon).digest('hex');
  iconEligible = pngSignature && icon.length >= 26 && icon.readUInt32BE(16) === 1024 && icon.readUInt32BE(20) === 1024 && (icon[25] === 0 || icon[25] === 2) && !PLACEHOLDER_ICON_HASHES.has(iconHash);
  iconEligibilityDetail = PLACEHOLDER_ICON_HASHES.has(iconHash) ? 'The app icon is the known Capacitor template placeholder.' : `App icon SHA-256: ${iconHash}.`;
}

let splashContents;
try {
  splashContents = JSON.parse(splashContentsText);
} catch {
  splashContents = null;
}
const splashFilenames = [...new Set((splashContents?.images ?? []).map((image) => image.filename).filter(Boolean))];
check('Splash catalog declares image files', splashFilenames.length > 0, splashFilenames.length > 0 ? undefined : 'No splash images were found.');
let splashEligible = splashFilenames.length > 0;
let placeholderSplashFound = false;
for (const filename of splashFilenames) {
  const splash = await readBytes(`ios/App/App/Assets.xcassets/Splash.imageset/${filename}`);
  const splashHash = createHash('sha256').update(splash).digest('hex');
  if (PLACEHOLDER_SPLASH_HASHES.has(splashHash)) {
    splashEligible = false;
    placeholderSplashFound = true;
  }
}
gate(
  'App icon and splash are eligible, approved release artwork',
  iconEligible && splashEligible && options.approvals.artwork,
  `${iconEligibilityDetail} ${placeholderSplashFound ? 'The splash is the known Capacitor template placeholder.' : 'No known Capacitor splash placeholder was found.'} Set SOLEIL_ARTWORK_APPROVAL=approved only after approving both assets.`,
);

const publicOrigin = runtime.match(/\bDEFAULT_PUBLIC_WEB_ORIGIN\s*=\s*['"]([^'"]+)['"]/)?.[1];
check('A canonical public web origin is declared', Boolean(publicOrigin), publicOrigin ? undefined : 'DEFAULT_PUBLIC_WEB_ORIGIN was not found.');
let productionOrigin = false;
if (publicOrigin) {
  try {
    const parsed = new URL(publicOrigin);
    const hostname = parsed.hostname.toLowerCase();
    const provisionalHost = hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname === '127.0.0.1'
      || hostname.endsWith('.vercel.app')
      || hostname.endsWith('.netlify.app')
      || hostname.endsWith('.pages.dev')
      || /(?:^|[.-])(?:preview|staging|provisional|test|dev)(?:[.-]|$)/.test(hostname);
    productionOrigin = parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash && !provisionalHost;
  } catch {
    productionOrigin = false;
  }
}
gate(
  'Canonical public origin is eligible and approved for production',
  productionOrigin && options.approvals.publicOrigin,
  `Found: ${publicOrigin ?? 'none'}. Use a stable HTTPS production origin without a path, then set SOLEIL_PUBLIC_ORIGIN_APPROVAL=approved after approval.`,
);

const sourceCorpus = sourceFiles.map(({ path, source }) => `// ${path}\n${source}`).join('\n');
const mapProviderContract = inspectMapProviderContract({ mapLayer, mapView, sourceCorpus });
const openFreeMapIntegrationEligible = mapProviderContract.eligible;

check(
  'Approved OpenFreeMap beta layer is structurally wired with no known alternate map provider',
  openFreeMapIntegrationEligible,
  openFreeMapIntegrationEligible
    ? 'MapView renders the credential-free layer, official styles and linked attribution are present, and no legacy TileLayer or known alternate map host was found. Live downstream hosts still require release capture.'
    : 'Expected a rendered OpenFreeMap layer with official styles and attribution, no credential, no legacy TileLayer, and no known alternate map host in src.',
);
const hasMapLicenseNotices = [
  'MAPLIBRE GL JS 5.17.0',
  'MAPLIBRE GL LEAFLET 0.1.3',
  'LEAFLET 1.9.4',
].every((notice) => thirdPartyNotices.includes(notice));
check(
  'Bundled map libraries have public third-party notices',
  hasMapLicenseNotices,
  hasMapLicenseNotices
    ? `${paths.thirdPartyNotices} includes the pinned MapLibre GL, MapLibre Leaflet, and Leaflet notices.`
    : `${paths.thirdPartyNotices} must include the pinned MapLibre GL, MapLibre Leaflet, and Leaflet notices.`,
);
gate(
  'Production map-provider terms and reliability risk are approved',
  openFreeMapIntegrationEligible && options.approvals.mapProvider,
  openFreeMapIntegrationEligible
    ? 'Development may proceed. Before private TestFlight, require written embedded-user age clarification or a recorded adult-only tester cohort, plus explicit no-SLA acceptance. Public release still requires the written clarification and live downstream-host audit, or an approved fallback. Set SOLEIL_MAP_PROVIDER_APPROVAL=approved only after the public-release evidence is complete.'
    : 'The production map integration is structurally ineligible and cannot be approved.',
);

const failedStatic = staticChecks.filter(({ passed }) => !passed);
const unresolvedGates = humanGates.filter(({ resolved }) => !resolved);
const symbol = (passed) => (passed ? 'PASS' : 'FAIL');

console.log('\nSoleil App Store release preflight');
console.log(`Mode: ${options.strict ? 'strict release candidate' : 'development'}`);
if (options.strict) {
  console.log('Strict boundary: matching intended versions, explicit approval attestations, eligible repository state, and removal of legacy signing identity are required.');
}
console.log('\nStatic checks');
for (const result of staticChecks) {
  console.log(`[${symbol(result.passed)}] ${result.label}${result.detail ? `: ${result.detail}` : ''}`);
}
console.log('\nHuman release gates');
if (humanGates.length === 0) console.log('[NONE] No conditional gates were evaluated.');
for (const result of humanGates) {
  console.log(`[${result.resolved ? 'RESOLVED' : 'OPEN'}] ${result.label}${result.detail ? `: ${result.detail}` : ''}`);
}

if (failedStatic.length > 0 || (options.strict && unresolvedGates.length > 0)) {
  console.error(`\nPreflight failed with ${failedStatic.length} static failure(s)${options.strict ? ` and ${unresolvedGates.length} open human gate(s)` : ''}.`);
  process.exitCode = 1;
} else {
  console.log(`\nPreflight passed ${staticChecks.length} static checks. ${unresolvedGates.length} human gate(s) remain open${options.strict ? '.' : ' and will become failures in strict mode.'}`);
}
