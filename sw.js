// Defines the name of the cache for this version of the app.
// Update this string when you deploy a new version to force a cache refresh.
const CACHE_NAME = 'luxemarks-cache-v5';

// Only cache critical local files during install.
// We remove './' to avoid 404s on servers that don't map root to index automatically during XHR.
// We remove external fonts from here; they will be cached at runtime (lazy caching).
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json'
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
      .catch((err) => console.error('Service Worker Install Failed:', err))
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
    // This ensures users always get the latest version if online, but works offline.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match('./index.html');
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
                    // Check if we received a valid response.
                    // Note: We ALLOW opaque responses (status 0, type 'opaque') for things like Google Fonts/External Images.
                    if (!networkResponse || (networkResponse.status !== 200 && networkResponse.status !== 0)) {
                        return networkResponse;
                    }

                    // Clone the response because it's a stream and can only be consumed once
                    const responseToCache = networkResponse.clone();

                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            try {
                                cache.put(event.request, responseToCache);
                            } catch (e) {
                                console.warn('Failed to cache resource:', event.request.url, e);
                            }
                        });

                    return networkResponse;
                }).catch(err => {
                    // Network failed and not in cache -> resource unavailable.
                    // Could return a fallback placeholder image here if needed.
                    throw err;
                });
            })
    );
});