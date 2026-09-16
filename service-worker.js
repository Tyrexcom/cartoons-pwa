/* service-worker.js — offline caching for Мультфильмы PWA */

var CACHE_VERSION = 'cartoons-v2';
var STATIC_CACHE = 'cartoons-static-' + CACHE_VERSION;
var IMAGE_CACHE = 'cartoons-images-' + CACHE_VERSION;

/* Files to cache on install — same-origin only */
var STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './manifest.json',
  './data/cartoons.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png'
];

/* Install: cache static assets */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(function (cache) {
        /* cache.addAll fails entirely if one resource fails, so cache individually */
        return Promise.all(
          STATIC_ASSETS.map(function (url) {
            return cache.add(url).catch(function () {
              /* skip resources that fail (e.g. apple-touch-icon on some hosts) */
            });
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

/* Activate: clean old caches */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k.startsWith('cartoons-') && k !== STATIC_CACHE && k !== IMAGE_CACHE;
            })
            .map(function (k) {
              return caches.delete(k);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

/* Fetch handler */
self.addEventListener('fetch', function (e) {
  var req = e.request;

  /* Only handle GET */
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  /* Same-origin: cache-first, then network, then fallback */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req)
        .then(function (cached) {
          if (cached) return cached;
          return fetch(req)
            .then(function (res) {
              if (res && res.status === 200) {
                var clone = res.clone();
                caches.open(STATIC_CACHE).then(function (cache) {
                  cache.put(req, clone).catch(function () {});
                });
              }
              return res;
            })
            .catch(function () {
              /* fallback to cached index.html for navigation requests */
              if (req.mode === 'navigate') {
                return caches.match('./index.html');
              }
              return caches.match(req);
            });
        })
    );
    return;
  }

  /* Cross-origin images: runtime cache with fallback */
  if (req.destination === 'image') {
    e.respondWith(
      caches.match(req)
        .then(function (cached) {
          if (cached) return cached;
          return fetch(req)
            .then(function (res) {
              if (res && res.status === 200 && res.type === 'basic') {
                var clone = res.clone();
                caches.open(IMAGE_CACHE).then(function (cache) {
                  cache.put(req, clone).catch(function () {});
                });
              }
              /* Even opaque (CORS) responses can be cached */
              if (res && (res.status === 200 || res.status === 0)) {
                var clone2 = res.clone();
                caches.open(IMAGE_CACHE).then(function (cache) {
                  cache.put(req, clone2).catch(function () {});
                });
              }
              return res;
            })
            .catch(function () {
              /* Return a fallback SVG placeholder */
              var fallback = new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600">' +
                '<rect width="400" height="600" fill="#F0EBE5"/>' +
                '<text x="200" y="300" font-size="24" text-anchor="middle" fill="#A09AA8" font-family="sans-serif">' +
                'Нет изображения</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
              );
              return fallback;
            });
        })
    );
    return;
  }

  /* Let other cross-origin requests pass through */
});
