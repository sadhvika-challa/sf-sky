const CACHE_PREFIX = 'soleil-shell-';
const CACHE_NAME = `${CACHE_PREFIX}__SOLEIL_BUILD_ID__`;
const LEGACY_CACHE_NAMES = new Set(['soleil-v5']);
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

self.addEventListener('fetch', (event) => {
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
