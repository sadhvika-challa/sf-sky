import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const contractPath = new URL('config/public-url-contract.json', root);

const readContract = async () => JSON.parse(await readFile(contractPath, 'utf8'));

export function parsePublicOrigin(candidate) {
  if (!candidate) throw new Error('--origin requires a value.');

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`Public origin is not a valid URL: ${candidate}`);
  }

  const eligible = url.protocol === 'https:'
    && !url.username
    && !url.password
    && url.pathname === '/'
    && !url.search
    && !url.hash;
  if (!eligible) {
    throw new Error('Public origin must be an HTTPS origin without credentials, a path, a query, or a hash.');
  }

  return url.origin;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasContentType(response, expression, label) {
  const contentType = response.headers.get('content-type') ?? '';
  assert(expression.test(contentType), `${label} returned unexpected Content-Type: ${contentType || 'missing'}`);
}

function verifyPng(bytes, icon) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  assert(bytes.length >= 24, `${icon.src} is too short to be a PNG.`);
  assert(signature.every((value, index) => bytes[index] === value), `${icon.src} does not have a PNG signature.`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert(view.getUint32(16) === icon.width, `${icon.src} width does not match ${icon.width}px.`);
  assert(view.getUint32(20) === icon.height, `${icon.src} height does not match ${icon.height}px.`);
}

async function fetchDirect(origin, path, label, fetchImpl, accept) {
  const url = new URL(path, `${origin}/`);
  const response = await fetchImpl(url, {
    redirect: 'manual',
    headers: {
      accept,
      'user-agent': 'SoleilPublicReleaseVerifier/1.0',
    },
    signal: AbortSignal.timeout(15_000),
  });

  assert(
    response.status === 200,
    `${label} must return a direct anonymous 200. Received ${response.status}${response.headers.get('location') ? ` with Location ${response.headers.get('location')}` : ''}.`,
  );
  const responseUrl = new URL(response.url || url);
  assert(responseUrl.origin === origin, `${label} resolved outside the approved origin: ${responseUrl.origin}`);
  assert(
    responseUrl.pathname === url.pathname && responseUrl.search === url.search,
    `${label} changed the requested path or query from ${url.pathname}${url.search} to ${responseUrl.pathname}${responseUrl.search}.`,
  );
  return { response, url };
}

export async function verifyPublicOrigin({ origin: candidate, fetchImpl = fetch } = {}) {
  const origin = parsePublicOrigin(candidate);
  const contract = await readContract();
  const evidence = [];

  const htmlChecks = [
    [contract.paths.app, 'App shell'],
    [`${contract.paths.app}?spot=public-origin-verification&view=now`, 'Shared spot route'],
    [contract.paths.privacy, 'Privacy page'],
    [contract.paths.support, 'Support page'],
  ];
  for (const [path, label] of htmlChecks) {
    const { response, url } = await fetchDirect(origin, path, label, fetchImpl, 'text/html');
    hasContentType(response, /^text\/html(?:;|$)/i, label);
    const html = await response.text();
    assert(/<title>\s*Soleil\s*<\/title>/i.test(html), `${label} does not identify the Soleil document.`);
    assert(/id=["']root["']/i.test(html), `${label} does not contain the Soleil application root.`);
    evidence.push({ label, url: url.toString(), status: response.status, contentType: response.headers.get('content-type') });
  }

  const manifestResult = await fetchDirect(
    origin,
    contract.paths.manifest,
    'PWA manifest',
    fetchImpl,
    'application/manifest+json, application/json',
  );
  hasContentType(manifestResult.response, /^application\/(?:manifest\+json|json)(?:;|$)/i, 'PWA manifest');
  const manifest = await manifestResult.response.json();
  assert(manifest.name === 'Soleil', `PWA manifest name must be Soleil. Received: ${manifest.name ?? 'missing'}`);
  assert(manifest.id === contract.pwa.id, `PWA manifest id must be ${contract.pwa.id}. Received: ${manifest.id ?? 'missing'}`);
  assert(manifest.start_url === contract.pwa.startUrl, `PWA manifest start_url must be ${contract.pwa.startUrl}. Received: ${manifest.start_url ?? 'missing'}`);
  assert(manifest.scope === contract.pwa.scope, `PWA manifest scope must be ${contract.pwa.scope}. Received: ${manifest.scope ?? 'missing'}`);
  assert(manifest.display === 'standalone', `PWA manifest display must be standalone. Received: ${manifest.display ?? 'missing'}`);
  const manifestIcons = new Map((manifest.icons ?? []).map((icon) => [icon.src, icon]));
  for (const icon of contract.icons) {
    const declaration = manifestIcons.get(icon.src);
    assert(declaration, `PWA manifest does not declare ${icon.src}.`);
    assert(declaration.type === icon.contentType, `${icon.src} manifest type must be ${icon.contentType}.`);
    assert(declaration.sizes === `${icon.width}x${icon.height}`, `${icon.src} manifest size must be ${icon.width}x${icon.height}.`);
    assert(declaration.purpose === icon.purpose, `${icon.src} manifest purpose must be ${icon.purpose}.`);
  }
  evidence.push({
    label: 'PWA manifest',
    url: manifestResult.url.toString(),
    status: manifestResult.response.status,
    contentType: manifestResult.response.headers.get('content-type'),
  });

  const workerResult = await fetchDirect(
    origin,
    contract.paths.serviceWorker,
    'Service worker',
    fetchImpl,
    'application/javascript, text/javascript',
  );
  hasContentType(workerResult.response, /^(?:application|text)\/javascript(?:;|$)/i, 'Service worker');
  const worker = await workerResult.response.text();
  assert(/addEventListener\(['"]install['"]/.test(worker), 'Service worker does not contain an install handler.');
  assert(/addEventListener\(['"]fetch['"]/.test(worker), 'Service worker does not contain a fetch handler.');
  evidence.push({
    label: 'Service worker',
    url: workerResult.url.toString(),
    status: workerResult.response.status,
    contentType: workerResult.response.headers.get('content-type'),
  });

  for (const icon of contract.icons) {
    const result = await fetchDirect(origin, icon.src, `Icon ${icon.src}`, fetchImpl, icon.contentType);
    hasContentType(result.response, new RegExp(`^${icon.contentType.replace('/', '\\/')}(?:;|$)`, 'i'), `Icon ${icon.src}`);
    verifyPng(new Uint8Array(await result.response.arrayBuffer()), icon);
    evidence.push({
      label: `Icon ${icon.src}`,
      url: result.url.toString(),
      status: result.response.status,
      contentType: result.response.headers.get('content-type'),
    });
  }

  return { origin, evidence };
}

function parseArguments(args) {
  if (args.includes('--help')) {
    return { help: true };
  }
  if (args.length !== 2 || args[0] !== '--origin' || !args[1]) {
    throw new Error('Usage: npm run public:release:verify -- --origin https://example.com');
  }
  return { origin: args[1] };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: npm run public:release:verify -- --origin https://example.com');
    console.log('Performs anonymous, read-only checks. It does not deploy, change DNS, or approve the origin.');
    return;
  }

  const result = await verifyPublicOrigin({ origin: options.origin });
  for (const item of result.evidence) {
    console.log(`PASS ${item.label}: ${item.status} ${item.contentType} ${item.url}`);
  }
  console.log(`Public release origin passed (${result.evidence.length} checks): ${result.origin}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
