import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const failures = [];
const checks = [];

function check(label, passed, detail = '') {
  checks.push(label);
  if (!passed) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
}

const [contractText, manifestText, vercelText, index, main, routes, publicPage, scoreCard, serviceWorker] = await Promise.all([
  read('config/public-url-contract.json'),
  read('public/manifest.json'),
  read('vercel.json'),
  read('index.html'),
  read('src/main.tsx'),
  read('src/public/routes.ts'),
  read('src/public/PublicPage.tsx'),
  read('src/components/ScoreCard.tsx'),
  read('public/sw.js'),
]);

const contract = JSON.parse(contractText);
const manifest = JSON.parse(manifestText);
const vercel = JSON.parse(vercelText);
const publicPaths = Object.values(contract.paths);

check('Every public contract path is root absolute', publicPaths.every((path) => typeof path === 'string' && path.startsWith('/')));
check('Public contract paths are unique', new Set(publicPaths).size === publicPaths.length);
check('The application and installed PWA remain root scoped',
  contract.paths.app === '/'
    && contract.pwa.id === '/'
    && contract.pwa.startUrl === '/'
    && contract.pwa.scope === '/');

check('Manifest identity matches the public contract',
  manifest.id === contract.pwa.id
    && manifest.start_url === contract.pwa.startUrl
    && manifest.scope === contract.pwa.scope);

const contractIcons = contract.icons.map(({ src, contentType, width, height, purpose }) => ({
  src,
  sizes: `${width}x${height}`,
  type: contentType,
  purpose,
}));
check('Manifest icons match the public contract',
  JSON.stringify(manifest.icons) === JSON.stringify(contractIcons));

const expectedRewrites = [contract.paths.privacy, `${contract.paths.privacy}/`, contract.paths.support, `${contract.paths.support}/`]
  .map((source) => ({ source, destination: contract.paths.shell }));
check('Vercel public-page rewrites match the public contract without changing semantics',
  JSON.stringify(vercel.rewrites) === JSON.stringify(expectedRewrites));

check('HTML loads the contracted manifest path', index.includes(`rel="manifest" href="${contract.paths.manifest}"`));
for (const icon of contract.icons) {
  check(`HTML or manifest owns ${icon.src}`, index.includes(icon.src) || manifest.icons.some(({ src }) => src === icon.src));
}

check('Web registration consumes the service-worker path constant',
  main.includes('PUBLIC_SERVICE_WORKER_PATH') && main.includes('register(PUBLIC_SERVICE_WORKER_PATH)'));
check('Public routing consumes the privacy and support path constants',
  routes.includes('PUBLIC_PRIVACY_PATH') && routes.includes('PUBLIC_SUPPORT_PATH'));
check('Public navigation consumes the centralized path constants',
  publicPage.includes('PUBLIC_APP_PATH')
    && publicPage.includes('PUBLIC_PRIVACY_PATH')
    && publicPage.includes('PUBLIC_SUPPORT_PATH')
    && publicPage.includes('PUBLIC_THIRD_PARTY_NOTICES_PATH'));
check('Spot sharing consumes the root application path constant',
  scoreCard.includes('PUBLIC_APP_PATH') && scoreCard.includes('buildPublicShareUrl(`${PUBLIC_APP_PATH}?spot='));
check('Offline navigation falls back to the contracted shell path',
  serviceWorker.includes(`matchCurrentShell('${contract.paths.shell}')`));

const staticPaths = [
  contract.paths.shell,
  contract.paths.manifest,
  contract.paths.serviceWorker,
  contract.paths.thirdPartyNotices,
  ...contract.icons.map(({ src }) => src),
];
for (const path of staticPaths) {
  try {
    await access(new URL(`public/${path.slice(1)}`, root));
    check(`Static artifact exists for ${path}`, true);
  } catch {
    if (path === contract.paths.shell) {
      try {
        await access(new URL('index.html', root));
        check(`Static artifact exists for ${path}`, true);
      } catch {
        check(`Static artifact exists for ${path}`, false);
      }
    } else {
      check(`Static artifact exists for ${path}`, false);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Public URL contract verification failed:\n- ${failures.join('\n- ')}`);
}

console.log(`Public URL contract verification passed (${checks.length} checks).`);
