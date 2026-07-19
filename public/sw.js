/* PinViz app-shell service worker — caches static assets only (not user photos). */
const CACHE = 'pinviz-shell-v1';
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache user blob: URLs or opaque media from camera.
  if (url.protocol === 'blob:') return;

  // Network-first for HTML navigations; cache-first for hashed assets + mediapipe.
  const isNav = req.mode === 'navigate';
  const isAsset =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/mediapipe/') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.svg');

  if (isNav) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    );
    return;
  }

  if (isAsset) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
