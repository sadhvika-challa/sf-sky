import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const serviceWorkerPath = path.join(dist, 'sw.js');
const BUILD_ID_MARKER = '__SOLEIL_BUILD_ID__';
const PRECACHE_MARKER = '  /* __SOLEIL_PRECACHE_URLS__ */';

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
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

const files = (await listFiles(dist))
  .filter((file) => file !== 'sw.js')
  .sort();
const precacheUrls = [
  '/',
  ...files.map((file) => `/${file.split('/').map(encodeURIComponent).join('/')}`),
];
const hash = createHash('sha256');
let source = await readFile(serviceWorkerPath, 'utf8');
hash.update('sw.js');
hash.update(source);
for (const file of files) {
  hash.update(file);
  hash.update(await readFile(path.join(dist, file)));
}
const buildId = hash.digest('hex').slice(0, 16);
const generatedEntries = precacheUrls.map((url) => `  ${JSON.stringify(url)},`).join('\n');

if (!source.includes(BUILD_ID_MARKER) || !source.includes(PRECACHE_MARKER)) {
  throw new Error('Service worker build markers are missing.');
}
source = source
  .replace(BUILD_ID_MARKER, buildId)
  .replace(PRECACHE_MARKER, generatedEntries);
if (source.includes(BUILD_ID_MARKER) || source.includes(PRECACHE_MARKER)) {
  throw new Error('Service worker build markers were not fully replaced.');
}
await writeFile(serviceWorkerPath, source);

console.log(`Finalized PWA shell ${buildId} with ${precacheUrls.length} URLs.`);
