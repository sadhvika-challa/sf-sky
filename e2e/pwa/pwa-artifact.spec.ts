import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ANDROID_CHROME_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 16; Pixel 9 Pro) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';
const IOS_IN_APP_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Mobile/15E148 Instagram 410.0.0.0.0';

interface AppManifestResult {
  url: string;
  data: string;
  errors: Array<{ message: string }>;
}

interface InstallabilityResult {
  installabilityErrors: Array<{
    errorId: string;
    errorArguments: Array<{ name: string; value: string }>;
  }>;
}

interface SoleilManifest {
  name: string;
  short_name: string;
  id: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  orientation: string;
  icons: Array<{
    src: string;
    sizes: string;
    type: string;
    purpose: string;
  }>;
}

async function waitForControlledShell(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() =>
    navigator.serviceWorker.controller?.scriptURL ?? null,
  )).toContain('/sw.js');
}

async function selectOceanBeach(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Search spots' })).toBeVisible();
  await page.getByRole('button', { name: 'Search spots' }).click();
  const search = page.getByRole('dialog', { name: 'Search spots' });
  await search.getByPlaceholder('Search spots…').fill('Ocean Beach');
  await search.getByRole('button', { name: /Ocean Beach/ }).click();
}

async function openAndroidContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    userAgent: ANDROID_CHROME_USER_AGENT,
    serviceWorkers: 'block',
  });
}

async function listFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path.join(directory, entry.name), relative));
    } else {
      files.push(relative);
    }
  }
  return files;
}

async function expectedShellBuildId(): Promise<string> {
  const root = process.cwd();
  const dist = path.join(root, 'dist');
  const files = (await listFiles(dist)).filter((file) => file !== 'sw.js').sort();
  const hash = createHash('sha256');
  hash.update('sw.js');
  hash.update(await readFile(path.join(root, 'public/sw.js')));
  for (const file of files) {
    hash.update(file);
    hash.update(await readFile(path.join(dist, file)));
  }
  return hash.digest('hex').slice(0, 16);
}

test('ships an installable production manifest with valid declared icons', async ({ page }) => {
  await page.goto('/');
  await waitForControlledShell(page);

  const cdp = await page.context().newCDPSession(page);
  const appManifest = await cdp.send('Page.getAppManifest') as AppManifestResult;
  expect(appManifest.errors).toEqual([]);
  expect(appManifest.url).toBe(new URL('/manifest.json', page.url()).toString());

  const manifest = JSON.parse(appManifest.data) as SoleilManifest;
  expect(manifest).toMatchObject({
    name: 'Soleil',
    short_name: 'Soleil',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FDF8F0',
    theme_color: '#D97706',
    orientation: 'portrait',
  });

  await expect.poll(async () => {
    const result = await cdp.send('Page.getInstallabilityErrors') as InstallabilityResult;
    return result.installabilityErrors;
  }).toEqual([]);

  const iconEvidence = await page.evaluate(async (icons) => Promise.all(
    icons.map(async (icon) => {
      const response = await fetch(icon.src);
      const bitmap = await createImageBitmap(await response.blob());
      const evidence = {
        src: icon.src,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
        width: bitmap.width,
        height: bitmap.height,
      };
      bitmap.close();
      return evidence;
    }),
  ), manifest.icons);

  expect(iconEvidence).toEqual([
    expect.objectContaining({ src: '/icons/icon-192.png', ok: true, contentType: 'image/png', width: 192, height: 192 }),
    expect.objectContaining({ src: '/icons/icon-512.png', ok: true, contentType: 'image/png', width: 512, height: 512 }),
    expect.objectContaining({ src: '/icons/apple-touch-icon.png', ok: true, contentType: 'image/png', width: 180, height: 180 }),
  ]);

  const shellNames = await page.evaluate(async () =>
    (await caches.keys()).filter((name) => name.startsWith('soleil-shell-')),
  );
  expect(shellNames).toContain(`soleil-shell-${await expectedShellBuildId()}`);
});

test('offers Android installation only when the browser provides a working prompt', async ({ browser }) => {
  const desktopContext = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto('/');
    await expect(desktopPage.getByRole('button', { name: 'Search spots' })).toBeVisible();
    const desktopEventWasCanceled = await desktopPage.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(desktopEventWasCanceled).toBe(false);
  } finally {
    await desktopContext.close();
  }

  const unavailableContext = await openAndroidContext(browser);
  try {
    const unavailablePage = await unavailableContext.newPage();
    await unavailablePage.goto('/');
    await selectOceanBeach(unavailablePage);
    await expect(unavailablePage.getByRole('dialog', { name: 'Install Soleil' })).toHaveCount(0);
  } finally {
    await unavailableContext.close();
  }

  const inAppContext = await browser.newContext({
    userAgent: IOS_IN_APP_USER_AGENT,
    serviceWorkers: 'block',
  });
  try {
    const inAppPage = await inAppContext.newPage();
    await inAppPage.goto('/');
    await selectOceanBeach(inAppPage);
    await expect(inAppPage.getByRole('dialog', { name: 'Add Soleil to your Home Screen' })).toHaveCount(0);
  } finally {
    await inAppContext.close();
  }

  const availableContext = await openAndroidContext(browser);
  try {
    const availablePage = await availableContext.newPage();
    await availablePage.goto('/');
    await expect(availablePage.getByRole('button', { name: 'Search spots' })).toBeVisible();
    await availablePage.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      const state = window as Window & { __soleilInstallPromptCalls?: number };
      Object.defineProperties(event, {
        platforms: { value: ['web'] },
        prompt: {
          value: async () => {
            state.__soleilInstallPromptCalls = (state.__soleilInstallPromptCalls ?? 0) + 1;
          },
        },
        userChoice: {
          value: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
        },
      });
      window.dispatchEvent(event);
    });

    await selectOceanBeach(availablePage);
    const prompt = availablePage.getByRole('dialog', { name: 'Install Soleil' });
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('Live weather, maps, and directions still need a connection.');
    await prompt.getByRole('button', { name: 'Install to Home Screen' }).click();
    await expect.poll(() => availablePage.evaluate(() =>
      (window as Window & { __soleilInstallPromptCalls?: number }).__soleilInstallPromptCalls ?? 0,
    )).toBe(1);
  } finally {
    await availableContext.close();
  }
});

test('keeps keyboard focus inside the install dialog and restores it on Escape', async ({ browser }) => {
  const context = await openAndroidContext(browser);
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Search spots' })).toBeVisible();
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.defineProperties(event, {
        platforms: { value: ['web'] },
        prompt: { value: async () => undefined },
        userChoice: {
          value: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
        },
      });
      window.dispatchEvent(event);
    });
    await selectOceanBeach(page);

    const prompt = page.getByRole('dialog', { name: 'Install Soleil' });
    const spotSheet = page.getByRole('dialog', { name: 'Ocean Beach sky scores' });
    const spotSheetModalState = await spotSheet.getAttribute('aria-modal');
    const close = prompt.getByRole('button', { name: 'Close install prompt' });
    const last = prompt.getByRole('button', { name: 'Not now' });
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(last).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(prompt).toBeHidden();
    await expect(spotSheet).toBeVisible();
    await expect(spotSheet).toHaveAttribute('aria-modal', spotSheetModalState ?? 'true');
    await expect.poll(() => spotSheet.evaluate((sheet) =>
      sheet === document.activeElement || sheet.contains(document.activeElement),
    )).toBe(true);
  } finally {
    await context.close();
  }
});

test('keeps Saved Spots open when the timed install prompt owns Escape', async ({ browser }) => {
  const context = await openAndroidContext(browser);
  try {
    const page = await context.newPage();
    await page.clock.install();
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Search spots' })).toBeVisible();
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.defineProperties(event, {
        platforms: { value: ['web'] },
        prompt: { value: async () => undefined },
        userChoice: {
          value: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
        },
      });
      window.dispatchEvent(event);
    });
    await page.clock.runFor(100);

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /Saved spots/i }).click();
    const savedSpots = page.getByRole('dialog', { name: 'Saved spots' });
    await expect(savedSpots).toBeVisible();
    await page.clock.runFor(30_000);

    const prompt = page.getByRole('dialog', { name: 'Install Soleil' });
    await expect(prompt).toBeVisible();
    await expect(prompt.getByRole('button', { name: 'Close install prompt' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(prompt.getByRole('button', { name: 'Install to Home Screen' })).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(prompt).toBeHidden();
    await expect(savedSpots).toBeVisible();
    await expect.poll(() => savedSpots.evaluate((sheet) =>
      sheet === document.activeElement || sheet.contains(document.activeElement),
    )).toBe(true);
  } finally {
    await context.close();
  }
});

test('cold-starts a hydrated catalog offline from one complete revisioned shell', async ({ context, page }) => {
  await page.goto('/manifest.json');
  await page.evaluate(async () => {
    const wrongShell = '<!doctype html><title>Wrong shell</title><h1>Wrong shell</h1>';
    const legacy = await caches.open('soleil-v5');
    await legacy.put('/index.html', new Response(wrongShell, {
      headers: { 'content-type': 'text/html' },
    }));
    const unrelated = await caches.open('unrelated-product-cache');
    await unrelated.put('/index.html', new Response(wrongShell, {
      headers: { 'content-type': 'text/html' },
    }));
    await unrelated.put('/icons/icon-192.png', new Response('wrong icon', {
      headers: { 'content-type': 'text/plain' },
    }));
  });

  await page.goto('/');
  await waitForControlledShell(page);

  const entryAssets = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
    'script[src], link[rel="stylesheet"][href]',
  )).map((element) => {
    const candidate = element instanceof HTMLScriptElement ? element.src : element.href;
    return new URL(candidate);
  }).filter((url) => url.origin === window.location.origin).map((url) => url.pathname));
  expect(entryAssets.length).toBeGreaterThanOrEqual(2);

  const cacheEvidence = await page.evaluate(async (requiredAssets) => {
    const names = await caches.keys();
    const shellNames = names.filter((name) => name.startsWith('soleil-shell-'));
    const shell = shellNames.length === 1 ? await caches.open(shellNames[0]) : null;
    const cachedPaths = shell
      ? (await shell.keys()).map((request) => new URL(request.url).pathname)
      : [];
    const cachedAssetSizes = shell
      ? Object.fromEntries(await Promise.all(requiredAssets.map(async (asset) => {
        const response = await shell.match(asset);
        const size = response ? (await response.arrayBuffer()).byteLength : 0;
        return [asset, size];
      })))
      : {};
    const unrelatedIndex = await (await caches.open('unrelated-product-cache'))
      .match('/index.html');
    return {
      names,
      shellNames,
      cachedPaths,
      cachedAssetSizes,
      unrelatedIndex: await unrelatedIndex?.text(),
    };
  }, entryAssets);
  expect(cacheEvidence.shellNames).toHaveLength(1);
  expect(cacheEvidence.names).not.toContain('soleil-v5');
  expect(cacheEvidence.names).toContain('unrelated-product-cache');
  expect(cacheEvidence.unrelatedIndex).toContain('Wrong shell');
  for (const asset of entryAssets) {
    expect(cacheEvidence.cachedPaths).toContain(asset);
    expect(cacheEvidence.cachedAssetSizes[asset]).toBeGreaterThan(0);
  }
  expect(cacheEvidence.cachedPaths).toContain('/index.html');
  expect(cacheEvidence.cachedPaths).toContain('/manifest.json');

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await page.close();
  await context.setOffline(true);

  const offlinePage = await context.newPage();
  try {
    const response = await offlinePage.goto('/offline-check?city=austin', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);
    await expect(offlinePage.getByText('Wrong shell')).toHaveCount(0);
    await expect(offlinePage.getByRole('region', { name: 'Location preferences' })).toBeVisible();
    await expect(offlinePage.getByRole('button', { name: 'Search spots' })).toBeVisible();

    await offlinePage.getByRole('button', { name: 'Search spots' }).click();
    const search = offlinePage.getByRole('dialog', { name: 'Search spots' });
    await search.getByPlaceholder('Search spots…').fill('Ocean Beach');
    await expect(search.getByRole('button', { name: /Ocean Beach/ })).toBeVisible();

    const offlineStatic = await offlinePage.evaluate(async () => {
      const response = await fetch('/icons/icon-192.png');
      return { ok: response.ok, contentType: response.headers.get('content-type') };
    });
    expect(offlineStatic).toEqual({ ok: true, contentType: 'image/png' });

    const apiWasInvented = await offlinePage.evaluate(async () => {
      try {
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0');
        return response.ok;
      } catch {
        return false;
      }
    });
    expect(apiWasInvented).toBe(false);
  } finally {
    await context.setOffline(false);
  }
});

test('keeps the public privacy and support documents available offline', async ({ context, page }) => {
  await page.goto('/');
  await waitForControlledShell(page);
  await context.setOffline(true);

  try {
    const pages = [
      ['/soleil/privacy', 'Your sky plans should stay yours.'],
      ['/soleil/support', 'Help with Soleil'],
    ] as const;

    for (const [path, heading] of pages) {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.locator('.leaflet-container')).toHaveCount(0);
    }
  } finally {
    await context.setOffline(false);
  }
});
