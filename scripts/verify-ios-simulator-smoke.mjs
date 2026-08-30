import { execFileSync } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const usage = `Usage: node scripts/verify-ios-simulator-smoke.mjs [options]

Options:
  --derived-data PATH     Xcode DerivedData output directory.
  --result-bundle PATH    Xcode result bundle path.
  --screenshot PATH       Simulator screenshot output path.
  --report PATH           Machine-readable JSON report path.
  --help                  Show this help.`;

const parseArguments = (args) => {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') {
      console.log(usage);
      process.exit(0);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
    if (argument === '--derived-data') options.derivedData = resolve(value);
    else if (argument === '--result-bundle') options.resultBundle = resolve(value);
    else if (argument === '--screenshot') options.screenshot = resolve(value);
    else if (argument === '--report') options.report = resolve(value);
    else throw new Error(`Unknown argument: ${argument}`);
    index += 1;
  }
  for (const required of ['derivedData', 'resultBundle', 'screenshot', 'report']) {
    if (!options[required]) throw new Error(`Missing required option: --${required.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}.`);
  }
  return options;
};

const options = parseArguments(process.argv.slice(2));
const run = (command, args, capture = false) => execFileSync(command, args, {
  encoding: capture ? 'utf8' : undefined,
  stdio: capture ? 'pipe' : 'inherit',
});
const capture = (command, args) => run(command, args, true).trim();
const exists = (path) => access(path).then(() => true, () => false);
const plistValue = (plist, key) => capture('plutil', ['-extract', key, 'raw', '-o', '-', '--', plist]);

const runtimeVersion = (runtime) => {
  const match = runtime.match(/\.iOS-(\d+)(?:-(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0)];
};
const compareVersions = (left, right) => right[0] - left[0] || right[1] - left[1];

const simulatorList = JSON.parse(capture('xcrun', ['simctl', 'list', 'devices', 'available', '-j']));
const candidates = Object.entries(simulatorList.devices ?? {})
  .flatMap(([runtime, devices]) => {
    const version = runtimeVersion(runtime);
    if (!version || version[0] < 26) return [];
    return devices
      .filter((device) => device.isAvailable !== false && device.name.startsWith('iPhone'))
      .map((device) => ({ ...device, runtime, version }));
  })
  .sort((left, right) => {
    const versionOrder = compareVersions(left.version, right.version);
    if (versionOrder !== 0) return versionOrder;
    const rank = (device) => device.name === 'iPhone 17 Pro' ? 0 : device.name.includes('Pro') ? 1 : 2;
    return rank(left) - rank(right) || left.name.localeCompare(right.name);
  });

if (candidates.length === 0) throw new Error('No available iPhone simulator with iOS 26 or later was found.');
const simulator = candidates[0];
const wasBooted = simulator.state === 'Booted';
if (!wasBooted) run('xcrun', ['simctl', 'boot', simulator.udid]);
run('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b']);

await Promise.all([
  mkdir(dirname(options.screenshot), { recursive: true }),
  mkdir(dirname(options.report), { recursive: true }),
  mkdir(dirname(options.resultBundle), { recursive: true }),
]);

run('xcodebuild', [
  '-project', 'ios/App/App.xcodeproj',
  '-scheme', 'App',
  '-configuration', 'Debug',
  '-destination', `id=${simulator.udid}`,
  '-derivedDataPath', options.derivedData,
  '-resultBundlePath', options.resultBundle,
  'CODE_SIGNING_ALLOWED=NO',
  'build',
]);

const appPath = join(options.derivedData, 'Build', 'Products', 'Debug-iphonesimulator', 'App.app');
if (!(await exists(appPath))) throw new Error(`Built simulator app was not found at ${appPath}.`);
const appInfo = join(appPath, 'Info.plist');
const bundleId = plistValue(appInfo, 'CFBundleIdentifier');
const displayName = plistValue(appInfo, 'CFBundleDisplayName');
if (bundleId !== 'com.sadhvika.soleil') throw new Error(`Unexpected simulator bundle ID: ${bundleId}.`);
if (displayName !== 'Soleil') throw new Error(`Unexpected simulator display name: ${displayName}.`);
if (!(await exists(join(appPath, 'public', 'index.html')))) throw new Error('The simulator app is missing its packaged React entry point.');
if (!(await exists(join(appPath, 'PrivacyInfo.xcprivacy')))) throw new Error('The simulator app is missing PrivacyInfo.xcprivacy.');

run('xcrun', ['simctl', 'install', simulator.udid, appPath]);
const launchOutput = capture('xcrun', ['simctl', 'launch', '--terminate-running-process', simulator.udid, bundleId]);
const pid = Number(launchOutput.match(/:\s*(\d+)\s*$/)?.[1]);
if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Simulator launch did not return an app process ID: ${launchOutput}.`);

await new Promise((resolveWait) => setTimeout(resolveWait, 10_000));
try {
  run('xcrun', ['simctl', 'spawn', simulator.udid, '/bin/kill', '-0', String(pid)]);
} catch {
  run('xcrun', ['simctl', 'spawn', simulator.udid, 'launchctl', 'procinfo', String(pid)]);
}
run('xcrun', ['simctl', 'io', simulator.udid, 'screenshot', options.screenshot]);
if (!(await exists(options.screenshot))) throw new Error('Simulator screenshot was not created.');

const sourceCommit = process.env.GITHUB_SHA ?? capture('git', ['rev-parse', 'HEAD']);
const report = {
  schemaVersion: 1,
  passed: true,
  sourceCommit,
  bundleId,
  displayName,
  simulator: {
    name: simulator.name,
    runtime: simulator.runtime,
    udid: simulator.udid,
  },
  processId: pid,
  appPath,
  screenshot: options.screenshot,
};
await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
console.log(`iOS Simulator smoke passed on ${simulator.name} (${simulator.runtime}); process ${pid} remained alive.`);

if (!wasBooted) run('xcrun', ['simctl', 'shutdown', simulator.udid]);
