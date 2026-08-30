import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

const usage = `Usage: npm run ios:archive:verify -- --archive PATH --marketing-version VERSION --build-number NUMBER [options]

Options:
  --bundle-id ID           Expected bundle ID. Defaults to com.sadhvika.soleil.
  --device-families IDS    Expected UIDeviceFamily values. Defaults to 1,2.
  --source-commit SHA      Full source commit. Defaults to the checked-out Git HEAD.
  --lockfile PATH          Dependency lockfile. Defaults to package-lock.json.
  --report PATH            Write a JSON verification report.
  --help                   Show this help.`;

const parseArguments = (args) => {
  const options = {
    bundleId: 'com.sadhvika.soleil',
    deviceFamilies: ['1', '2'],
    lockfile: resolve('package-lock.json'),
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') {
      console.log(usage);
      process.exit(0);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
    if (argument === '--archive') options.archive = resolve(value);
    else if (argument === '--bundle-id') options.bundleId = value;
    else if (argument === '--marketing-version') options.marketingVersion = value;
    else if (argument === '--build-number') options.buildNumber = value;
    else if (argument === '--device-families') options.deviceFamilies = value.split(',').map((item) => item.trim()).filter(Boolean);
    else if (argument === '--source-commit') options.sourceCommit = value;
    else if (argument === '--lockfile') options.lockfile = resolve(value);
    else if (argument === '--report') options.report = resolve(value);
    else throw new Error(`Unknown argument: ${argument}`);
    index += 1;
  }

  for (const required of ['archive', 'marketingVersion', 'buildNumber']) {
    if (!options[required]) throw new Error(`Missing required option: --${required.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}.`);
  }
  return options;
};

const options = parseArguments(process.argv.slice(2));
const checks = [];
const check = (label, passed, expected, actual) => checks.push({ label, passed, expected, actual });
const pathExists = async (path) => access(path).then(() => true, () => false);
const plistValue = (plist, keyPath, format = 'raw') => execFileSync(
  'plutil',
  ['-extract', keyPath, format, '-o', '-', '--', plist],
  { encoding: 'utf8' },
).trim();
const commandOutput = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();

let provenance;
try {
  const sourceCommit = options.sourceCommit ?? commandOutput('git', ['rev-parse', 'HEAD']);
  const lockfile = await readFile(options.lockfile);
  const xcodeLines = commandOutput('xcodebuild', ['-version']).split(/\r?\n/);
  const xcodeVersion = xcodeLines[0]?.replace(/^Xcode\s+/, '') ?? '';
  const xcodeBuild = xcodeLines[1]?.replace(/^Build version\s+/, '') ?? '';
  const sdkVersion = commandOutput('xcrun', ['--sdk', 'iphoneos', '--show-sdk-version']);
  const sdkBuild = commandOutput('xcrun', ['--sdk', 'iphoneos', '--show-sdk-build-version']);

  check('Source provenance uses a full Git commit SHA', /^[a-f0-9]{40}$/i.test(sourceCommit), '40 hexadecimal characters', sourceCommit);
  check('Dependency provenance uses the repository package-lock.json', options.lockfile === resolve('package-lock.json'), resolve('package-lock.json'), options.lockfile);
  check('Xcode provenance includes a version', Boolean(xcodeVersion), 'nonempty Xcode version', xcodeVersion || 'none');
  check('Xcode provenance includes a build', Boolean(xcodeBuild), 'nonempty Xcode build', xcodeBuild || 'none');
  check('iOS SDK provenance includes a version', Boolean(sdkVersion), 'nonempty iOS SDK version', sdkVersion || 'none');
  check('iOS SDK provenance includes a build', Boolean(sdkBuild), 'nonempty iOS SDK build', sdkBuild || 'none');

  provenance = {
    sourceCommit,
    lockfile: {
      path: relative(process.cwd(), options.lockfile) || basename(options.lockfile),
      sha256: createHash('sha256').update(lockfile).digest('hex'),
    },
    toolchain: {
      xcodeVersion,
      xcodeBuild,
      sdk: 'iphoneos',
      sdkVersion,
      sdkBuild,
    },
  };
} catch (error) {
  checks.push({
    label: 'Archive provenance inspection completed',
    passed: false,
    expected: 'source, dependency, Xcode, and iOS SDK provenance readable',
    actual: error instanceof Error ? error.message : String(error),
  });
}

let archiveInfo;
let appPath;
let appInfo;

try {
  check('Archive path has the .xcarchive extension', options.archive.endsWith('.xcarchive'), '*.xcarchive', options.archive);
  check('Archive path is a directory', (await stat(options.archive)).isDirectory(), 'directory', options.archive);

  archiveInfo = join(options.archive, 'Info.plist');
  const applicationDirectory = join(options.archive, 'Products', 'Applications');
  const apps = (await readdir(applicationDirectory)).filter((entry) => entry.endsWith('.app'));
  check('Archive contains exactly one application', apps.length === 1, 'one .app', apps.join(', ') || 'none');
  if (apps.length !== 1) throw new Error('Cannot identify one archived application.');

  appPath = join(applicationDirectory, apps[0]);
  appInfo = join(appPath, 'Info.plist');
  const archiveApplicationPath = plistValue(archiveInfo, 'ApplicationProperties.ApplicationPath');
  check(
    'Archive metadata points to the archived application',
    archiveApplicationPath === `Applications/${basename(appPath)}`,
    `Applications/${basename(appPath)}`,
    archiveApplicationPath,
  );

  const actualBundleId = plistValue(appInfo, 'CFBundleIdentifier');
  const actualMarketingVersion = plistValue(appInfo, 'CFBundleShortVersionString');
  const actualBuildNumber = plistValue(appInfo, 'CFBundleVersion');
  const actualDeviceFamilies = JSON.parse(plistValue(appInfo, 'UIDeviceFamily', 'json')).map(String).sort();
  const expectedDeviceFamilies = [...options.deviceFamilies].sort();

  check('Archived app bundle ID matches', actualBundleId === options.bundleId, options.bundleId, actualBundleId);
  check('Archived app marketing version matches', actualMarketingVersion === options.marketingVersion, options.marketingVersion, actualMarketingVersion);
  check('Archived app build number matches', actualBuildNumber === options.buildNumber, options.buildNumber, actualBuildNumber);
  check(
    'Archived app device families match',
    JSON.stringify(actualDeviceFamilies) === JSON.stringify(expectedDeviceFamilies),
    expectedDeviceFamilies.join(','),
    actualDeviceFamilies.join(','),
  );
  const hasCodeSignature = await pathExists(join(appPath, '_CodeSignature'));
  const hasProvisioningProfile = await pathExists(join(appPath, 'embedded.mobileprovision'));
  check(
    'Archived app has no code signature',
    !hasCodeSignature,
    'no _CodeSignature directory',
    hasCodeSignature ? 'code signature directory present' : 'none',
  );
  check(
    'Archived app has no embedded provisioning profile',
    !hasProvisioningProfile,
    'no embedded.mobileprovision',
    hasProvisioningProfile ? 'provisioning profile present' : 'none',
  );

  check(
    'Archive metadata bundle ID matches',
    plistValue(archiveInfo, 'ApplicationProperties.CFBundleIdentifier') === options.bundleId,
    options.bundleId,
    plistValue(archiveInfo, 'ApplicationProperties.CFBundleIdentifier'),
  );
  check(
    'Archive metadata marketing version matches',
    plistValue(archiveInfo, 'ApplicationProperties.CFBundleShortVersionString') === options.marketingVersion,
    options.marketingVersion,
    plistValue(archiveInfo, 'ApplicationProperties.CFBundleShortVersionString'),
  );
  check(
    'Archive metadata build number matches',
    plistValue(archiveInfo, 'ApplicationProperties.CFBundleVersion') === options.buildNumber,
    options.buildNumber,
    plistValue(archiveInfo, 'ApplicationProperties.CFBundleVersion'),
  );

  const privacyManifest = join(appPath, 'PrivacyInfo.xcprivacy');
  check('Archived app contains PrivacyInfo.xcprivacy', (await stat(privacyManifest)).isFile(), 'file present', privacyManifest);
  execFileSync('plutil', ['-lint', '--', archiveInfo], { stdio: 'pipe' });
  execFileSync('plutil', ['-lint', '--', appInfo], { stdio: 'pipe' });
  execFileSync('plutil', ['-lint', '--', privacyManifest], { stdio: 'pipe' });
  check('Archived property lists are valid', true, 'valid plists', 'valid plists');
} catch (error) {
  checks.push({
    label: 'Archive inspection completed',
    passed: false,
    expected: 'all archive files readable',
    actual: error instanceof Error ? error.message : String(error),
  });
}

const failures = checks.filter(({ passed }) => !passed);
const report = {
  schemaVersion: 1,
  archive: options.archive,
  app: appPath,
  provenance,
  expected: {
    bundleId: options.bundleId,
    marketingVersion: options.marketingVersion,
    buildNumber: options.buildNumber,
    deviceFamilies: options.deviceFamilies,
  },
  checks,
  passed: failures.length === 0,
};

if (options.report) {
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
}

for (const result of checks) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'}: ${result.label}`);
  if (!result.passed) console.log(`  Expected: ${result.expected}\n  Actual: ${result.actual}`);
}

if (failures.length > 0) {
  throw new Error(`iOS archive verification failed (${failures.length} check${failures.length === 1 ? '' : 's'}).`);
}

console.log(`iOS archive verification passed (${checks.length} checks).`);
