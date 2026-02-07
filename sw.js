// Defines the name of the cache for this version of the app.
// Update this string when you deploy a new version to force a cache refresh.
const CACHE_NAME = 'luxemarks-cache-v4';

// Lists the core files (app shell) to be cached when the service worker is installed.
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  'https://fonts.googleapis.com/icon?family=Material+Icons+Round',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  // Note: Actual .woff2 font files are cached dynamically by the fetch handler below
];

// 'install' event: Caches the app shell and forces the SW to become active immediately.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching App Shell');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// 'activate' event: Cleans up old caches and claims clients immediately.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

// 'fetch' event: Intercepts network requests.
self.addEventListener('fetch', (event) => {
    // Only intercept GET requests.
    if (event.request.method !== 'GET') return;
  
    const url = event.request.url;

    // 1. API Calls: Network Only (Never cache)
    const isApiCall = [
        'serpapi.com',
        'microlink.io',
        'corsproxy.io',
        'api.allorigins.win',
        'googleapis.com/generateContent'
    ].some(domain => url.includes(domain));

    if (isApiCall) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 2. Navigation (HTML): Network First, Fallback to Cache
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match('./index.html') || caches.match('./');
                })
        );
        return;
    }

    // 3. Static Assets (JS, CSS, Images, Fonts): Stale-While-Revalidate / Dynamic Cache
    // Try cache first. If missing, fetch from network AND cache it for next time.
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request).then((networkResponse) => {
                    // Check if we received a valid response
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
                        return networkResponse;
                    }

                    // Clone the response because it's a stream and can only be consumed once
                    const responseToCache = networkResponse.clone();

                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });

                    return networkResponse;
                });
            })
    );
});
