import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { analyzeVisualReadiness } from './png-visual-readiness.mjs';

const usage = `Usage: node scripts/verify-ios-simulator-smoke.mjs [options]

Options:
  --derived-data PATH     Xcode DerivedData output directory.
  --result-bundle PATH    Xcode result bundle path.
  --screenshot PATH       Simulator screenshot output path.
  --log PATH              Simulator application log output path.
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
    else if (argument === '--log') options.log = resolve(value);
    else if (argument === '--report') options.report = resolve(value);
    else throw new Error(`Unknown argument: ${argument}`);
    index += 1;
  }
  for (const required of ['derivedData', 'resultBundle', 'screenshot', 'log', 'report']) {
    if (!options[required]) throw new Error(`Missing required option: --${required.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}.`);
  }
  return options;
};

const options = parseArguments(process.argv.slice(2));
const run = (command, args, captureOutput = false) => execFileSync(command, args, {
  encoding: captureOutput ? 'utf8' : undefined,
  stdio: captureOutput ? 'pipe' : 'inherit',
});
const capture = (command, args) => run(command, args, true).trim();
const tryCapture = (command, args) => {
  try {
    return capture(command, args);
  } catch {
    return null;
  }
};
const exists = (path) => access(path).then(() => true, () => false);
const plistValue = (plist, key) => capture('plutil', ['-extract', key, 'raw', '-o', '-', '--', plist]);
const runtimeVersion = (runtime) => {
  const match = runtime.match(/\.iOS-(\d+)(?:-(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0)];
};
const compareVersions = (left, right) => right[0] - left[0] || right[1] - left[1];
const errorText = (error) => error instanceof Error ? error.message : String(error);

await Promise.all([
  mkdir(dirname(options.screenshot), { recursive: true }),
  mkdir(dirname(options.log), { recursive: true }),
  mkdir(dirname(options.report), { recursive: true }),
  mkdir(dirname(options.resultBundle), { recursive: true }),
]);

let simulator;
let wasBooted = false;
let appWasInstalled = false;
let appInstalled = false;
let pid;
let bundleId;
let displayName;
let appPath;
let visualAnalysis;
let screenshotAttempts = 0;
let primaryFailure = null;
const cleanupFailures = [];

try {
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
      const rank = (device) => device.name === 'iPhone 17 Pro' ? 0 : device.name.includes('Pro') ? 1 : 2;
      const deviceOrder = rank(left) - rank(right);
      if (deviceOrder !== 0) return deviceOrder;
      const versionOrder = compareVersions(left.version, right.version);
      if (versionOrder !== 0) return versionOrder;
      const stateOrder = Number(right.state === 'Booted') - Number(left.state === 'Booted');
      return stateOrder || left.name.localeCompare(right.name);
    });

  if (candidates.length === 0) throw new Error('No available iPhone simulator with iOS 26 or later was found.');
  simulator = candidates[0];
  wasBooted = simulator.state === 'Booted';
  if (!wasBooted) run('xcrun', ['simctl', 'boot', simulator.udid]);
  run('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b']);

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

  appPath = join(options.derivedData, 'Build', 'Products', 'Debug-iphonesimulator', 'App.app');
  if (!(await exists(appPath))) throw new Error(`Built simulator app was not found at ${appPath}.`);
  const appInfo = join(appPath, 'Info.plist');
  bundleId = plistValue(appInfo, 'CFBundleIdentifier');
  displayName = plistValue(appInfo, 'CFBundleDisplayName');
  if (bundleId !== 'com.sadhvika.soleil') throw new Error(`Unexpected simulator bundle ID: ${bundleId}.`);
  if (displayName !== 'Soleil') throw new Error(`Unexpected simulator display name: ${displayName}.`);
  if (!(await exists(join(appPath, 'public', 'index.html')))) throw new Error('The simulator app is missing its packaged React entry point.');
  if (!(await exists(join(appPath, 'PrivacyInfo.xcprivacy')))) throw new Error('The simulator app is missing PrivacyInfo.xcprivacy.');

  appWasInstalled = tryCapture('xcrun', ['simctl', 'get_app_container', simulator.udid, bundleId, 'app']) !== null;
  run('xcrun', ['simctl', 'install', simulator.udid, appPath]);
  appInstalled = true;
  const launchOutput = capture('xcrun', ['simctl', 'launch', '--terminate-running-process', simulator.udid, bundleId]);
  pid = Number(launchOutput.match(/:\s*(\d+)\s*$/)?.[1]);
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Simulator launch did not return an app process ID: ${launchOutput}.`);

  for (let attempt = 1; attempt <= 9; attempt += 1) {
    screenshotAttempts = attempt;
    await new Promise((resolveWait) => setTimeout(resolveWait, 5_000));
    const processAlive = tryCapture('xcrun', ['simctl', 'spawn', simulator.udid, '/bin/kill', '-0', String(pid)]) !== null
      || tryCapture('xcrun', ['simctl', 'spawn', simulator.udid, 'launchctl', 'procinfo', String(pid)]) !== null;
    if (!processAlive) throw new Error(`Soleil process ${pid} exited before visual readiness.`);
    run('xcrun', ['simctl', 'io', simulator.udid, 'screenshot', options.screenshot]);
    visualAnalysis = analyzeVisualReadiness(await readFile(options.screenshot));
    if (visualAnalysis.visuallyReady) break;
  }
  if (!visualAnalysis?.visuallyReady) {
    throw new Error(`Soleil stayed alive but did not render a nonblank UI after ${screenshotAttempts * 5} seconds. Visual analysis: ${JSON.stringify(visualAnalysis)}.`);
  }
} catch (error) {
  primaryFailure = errorText(error);
} finally {
  if (simulator && pid) {
    const applicationLog = tryCapture('xcrun', [
      'simctl', 'spawn', simulator.udid,
      'log', 'show', '--last', '3m', '--style', 'compact',
      '--predicate', `processIdentifier == ${pid}`,
    ]);
    await writeFile(options.log, applicationLog ?? 'Application logs were unavailable.\n');
  } else {
    await writeFile(options.log, 'The application did not launch, so no process log was available.\n');
  }

  if (simulator && bundleId && appInstalled) {
    try {
      run('xcrun', ['simctl', 'terminate', simulator.udid, bundleId]);
    } catch (error) {
      cleanupFailures.push(`terminate: ${errorText(error)}`);
    }
    if (!appWasInstalled) {
      try {
        run('xcrun', ['simctl', 'uninstall', simulator.udid, bundleId]);
      } catch (error) {
        cleanupFailures.push(`uninstall: ${errorText(error)}`);
      }
    }
  }
  if (simulator && !wasBooted) {
    try {
      run('xcrun', ['simctl', 'shutdown', simulator.udid]);
    } catch (error) {
      cleanupFailures.push(`shutdown: ${errorText(error)}`);
    }
  }

  const sourceCommit = process.env.GITHUB_SHA ?? tryCapture('git', ['rev-parse', 'HEAD']);
  const report = {
    schemaVersion: 1,
    passed: primaryFailure === null && cleanupFailures.length === 0 && visualAnalysis?.visuallyReady === true,
    sourceCommit,
    bundleId,
    displayName,
    simulator: simulator ? {
      name: simulator.name,
      runtime: simulator.runtime,
      udid: simulator.udid,
    } : null,
    processId: pid ?? null,
    app: appPath ? basename(appPath) : null,
    screenshot: basename(options.screenshot),
    applicationLog: basename(options.log),
    screenshotAttempts,
    visualAnalysis: visualAnalysis ?? null,
    failure: primaryFailure,
    cleanupFailures,
  };
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
}

if (primaryFailure || cleanupFailures.length > 0) {
  const details = [primaryFailure, ...cleanupFailures].filter(Boolean).join(' | ');
  throw new Error(`iOS Simulator smoke failed: ${details}`);
}
console.log(`iOS Simulator smoke passed on ${simulator.name} (${simulator.runtime}); process ${pid} rendered a nonblank UI.`);
