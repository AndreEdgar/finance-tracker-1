

// service-worker.js — app-shell caching with safe update flow (no auto skipWaiting)

const APP_CACHE = 'ft-app-v1';
const RUNTIME_CACHE = 'ft-runtime-v1';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Cache Firebase ESM URLs you import in app.js (update if you bump versions)
const FIREBASE_CDN = [
  'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js'
];

async function cacheCrossOrigin(cache, urls) {
  await Promise.all(urls.map(async (u) => {
    try {
      const req = new Request(u, { mode: 'no-cors' });
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        await cache.put(req, res);
      }
    } catch {}
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(APP_SHELL);
    await cacheCrossOrigin(cache, FIREBASE_CDN);
    // NO skipWaiting here — we’ll only activate immediately when the page requests it
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k !== APP_CACHE && k !== RUNTIME_CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const isNavigation = request.mode === 'navigate';

  if (isNavigation) {
    // Network-first for HTML
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(APP_CACHE);
        return cache.match('./index.html');
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    // Cache-first for same-origin static assets
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        if (request.method === 'GET' && fresh.ok) {
          await cache.put(request, fresh.clone());
        }
        return fresh;
      } catch {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Cross-origin (Firebase etc.) — network-first with runtime cache fallback
  event.respondWith((async () => {
    const runtime = await caches.open(RUNTIME_CACHE);
    try {
      const fresh = await fetch(request);
      if (request.method === 'GET') {
        await runtime.put(request, fresh.clone());
      }
      return fresh;
    } catch {
      const cached = await runtime.match(request);
      return cached || Response.error();
    }
  })());
});

// Allow the page to trigger immediate activation of a newly installed SW
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
