/// <reference types="node" />

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const temporaryDirectories: string[] = [];

const writeExecutable = async (path: string, source: string) => {
  await writeFile(path, source);
  await chmod(path, 0o755);
};

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('iOS archive verification report', () => {
  it('records source, lockfile, Xcode, and iPhoneOS SDK provenance', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'soleil-archive-report-'));
    temporaryDirectories.push(fixtureRoot);
    const archive = join(fixtureRoot, 'Soleil.xcarchive');
    const application = join(archive, 'Products', 'Applications', 'Soleil.app');
    const binaryDirectory = join(fixtureRoot, 'bin');
    const reportPath = join(fixtureRoot, 'report.json');
    await Promise.all([
      mkdir(application, { recursive: true }),
      mkdir(binaryDirectory, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(archive, 'Info.plist'), '<plist/>'),
      writeFile(join(application, 'Info.plist'), '<plist/>'),
      writeFile(join(application, 'PrivacyInfo.xcprivacy'), '<plist/>'),
    ]);

    await writeExecutable(join(binaryDirectory, 'xcodebuild'), `#!/bin/sh
printf 'Xcode 26.1\\nBuild version 17B55\\n'
`);
    await writeExecutable(join(binaryDirectory, 'xcrun'), `#!/bin/sh
case "$*" in
  *--show-sdk-version*) printf '26.1\\n' ;;
  *--show-sdk-build-version*) printf '23B74\\n' ;;
  *) exit 2 ;;
esac
`);
    await writeExecutable(join(binaryDirectory, 'plutil'), `#!/bin/sh
if [ "$1" = "-lint" ]; then exit 0; fi
case "$2" in
  ApplicationProperties.ApplicationPath) printf 'Applications/Soleil.app\\n' ;;
  CFBundleIdentifier|ApplicationProperties.CFBundleIdentifier) printf 'com.sadhvika.soleil\\n' ;;
  CFBundleShortVersionString|ApplicationProperties.CFBundleShortVersionString) printf '1.0\\n' ;;
  CFBundleVersion|ApplicationProperties.CFBundleVersion) printf '1\\n' ;;
  UIDeviceFamily) printf '[1,2]\\n' ;;
  *) exit 2 ;;
esac
`);

    const sourceCommit = '1234567890abcdef1234567890abcdef12345678';
    execFileSync(process.execPath, [
      join(repositoryRoot, 'scripts', 'verify-ios-archive.mjs'),
      '--archive', archive,
      '--marketing-version', '1.0',
      '--build-number', '1',
      '--source-commit', sourceCommit,
      '--report', reportPath,
    ], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        PATH: `${binaryDirectory}:${process.env.PATH}`,
      },
      stdio: 'pipe',
    });

    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    const lockfile = await readFile(join(repositoryRoot, 'package-lock.json'));
    expect(report.passed).toBe(true);
    expect(report.schemaVersion).toBe(1);
    expect(report.provenance).toEqual({
      sourceCommit,
      lockfile: {
        path: 'package-lock.json',
        sha256: createHash('sha256').update(lockfile).digest('hex'),
      },
      toolchain: {
        xcodeVersion: '26.1',
        xcodeBuild: '17B55',
        sdk: 'iphoneos',
        sdkVersion: '26.1',
        sdkBuild: '23B74',
      },
    });
  });
});
