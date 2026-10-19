const CACHE_PREFIX = 'soleil-shell-';
const CACHE_NAME = `${CACHE_PREFIX}__SOLEIL_BUILD_ID__`;
const LEGACY_CACHE_NAMES = new Set(['soleil-v5']);
const PHOTO_CACHE_NAME = 'soleil-photos-v1';
const PHOTO_CACHE_MAX_ENTRIES = 40;
const PHOTO_CACHE_MAX_BYTES = 20 * 1024 * 1024;
let photoCacheQueue = Promise.resolve();
const PRECACHE_URLS = [
  /* __SOLEIL_PRECACHE_URLS__ */
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        try {
          await Promise.all(PRECACHE_URLS.map(async (url) => {
            const request = new Request(url, { cache: 'reload' });
            const response = await fetch(request);
            if (!response.ok) {
              throw new Error(`Unable to precache ${url}: ${response.status}`);
            }
            await cache.put(url, response);
          }));
        } catch (error) {
          await caches.delete(CACHE_NAME);
          throw error;
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => (
            LEGACY_CACHE_NAMES.has(key) ||
            (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          ))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

async function matchCurrentShell(request) {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(request, { ignoreVary: true });
}

// Serialize recency updates and eviction so simultaneous requests share one budget.
function queuePhotoCache(operation) {
  photoCacheQueue = photoCacheQueue.catch(() => {}).then(operation);
  return photoCacheQueue;
}

async function storeViewedPhoto(request, response) {
  const body = await response.blob();
  if (body.size > PHOTO_CACHE_MAX_BYTES) return;
  const headers = new Headers(response.headers);
  headers.set('X-Soleil-Photo-Bytes', String(body.size));
  const stored = new Response(body, { status: response.status, headers });
  await queuePhotoCache(async () => {
    const cache = await caches.open(PHOTO_CACHE_NAME);
    await cache.delete(request);
    await cache.put(request, stored);
    const keys = await cache.keys();
    let bytes = 0;
    const sizes = [];
    for (const key of keys) {
      const item = await cache.match(key);
      const size = Number(item?.headers.get('X-Soleil-Photo-Bytes') ?? 0);
      sizes.push(size);
      bytes += size;
    }
    while (keys.length > PHOTO_CACHE_MAX_ENTRIES || bytes > PHOTO_CACHE_MAX_BYTES) {
      await cache.delete(keys.shift());
      bytes -= sizes.shift();
    }
  });
}

async function viewedPhoto(request, event) {
  const cache = await caches.open(PHOTO_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    event.waitUntil(storeViewedPhoto(request, cached.clone()).catch(() => {}));
    return cached;
  }
  const response = await fetch(request);
  if (response.ok && response.headers.get('Content-Type')?.startsWith('image/')) {
    event.waitUntil(storeViewedPhoto(request, response.clone()).catch(() => {}));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method === 'GET' && url.origin === self.location.origin &&
    /^\/spot-views\/.*\.(jpe?g|png|webp|avif)$/i.test(url.pathname)
  ) {
    event.respondWith(viewedPhoto(event.request, event));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => matchCurrentShell('/index.html'))
    );
    return;
  }

  event.respondWith(
    matchCurrentShell(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const url = new URL(event.request.url);
        if (
          response.ok &&
          url.origin === self.location.origin &&
          url.pathname.match(/\.(js|css|png|svg|woff2?)$/)
        ) {
          const clone = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          );
        }
        return response;
      });
    })
  );
});
