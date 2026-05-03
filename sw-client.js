// ============================================================
// Marchéo · Service Worker (côté client)
// Stratégies :
//  - Cache first  : assets statiques (CSS, fonts, logos, icons)
//  - Network first: HTML, API Supabase
//  - Stale while revalidate : images Storage Supabase
// ============================================================

const CACHE_VERSION = 'marcheo-v38-2026-05-demo-data-dashboard';
const CACHE_STATIC  = `${CACHE_VERSION}-static`;
const CACHE_RUNTIME = `${CACHE_VERSION}-runtime`;
const CACHE_IMAGES  = `${CACHE_VERSION}-images`;

const PRECACHE_URLS = [
  '/assets/css/marcheo-tokens.css',
  '/assets/css/marcheo-base.css',
  '/assets/css/marcheo-components.css',
  '/assets/core/init.js',
  '/assets/brand/logo.svg',
  '/assets/brand/logo-light.svg',
  '/assets/brand/monogram.svg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  const isSupabaseStorage = url.hostname === 'epvdzhzwfmtnioedyfgm.supabase.co'
                            && url.pathname.startsWith('/storage/');
  const isUnsplash = url.hostname === 'images.unsplash.com';
  const isFonts = url.hostname === 'fonts.googleapis.com'
                  || url.hostname === 'fonts.gstatic.com';

  if (url.origin !== location.origin && !isSupabaseStorage && !isUnsplash && !isFonts) return;

  // 1. API Supabase REST/Auth/Functions → toujours network (jamais en cache)
  if (url.hostname === 'epvdzhzwfmtnioedyfgm.supabase.co'
      && (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/functions/'))) {
    return;
  }

  // 2. Images → stale-while-revalidate
  if (isSupabaseStorage || isUnsplash || /\.(png|jpg|jpeg|webp|gif|svg|avif)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, CACHE_IMAGES));
    return;
  }

  // 3. Fonts Google → cache first
  if (isFonts) {
    event.respondWith(cacheFirst(req, CACHE_STATIC));
    return;
  }

  // 4. CSS/JS/woff statiques → stale while revalidate
  if (/\.(css|js|woff2?)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, CACHE_STATIC));
    return;
  }

  // 5. HTML → network first avec fallback offline
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(req, CACHE_RUNTIME));
    return;
  }

  event.respondWith(networkFirst(req, CACHE_RUNTIME));
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  } catch (e) {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response(
      '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hors-ligne · Marchéo</title><style>body{font-family:system-ui;background:#0F2C52;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:20px}h1{font-size:24px;margin-bottom:8px}p{opacity:.7;font-size:14px}</style></head><body><div><h1>📡 Pas de connexion</h1><p>Reconnectez-vous puis rafraîchissez la page.</p></div></body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
    );
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// ── Notifications push (préparation) ──
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'Marchéo', {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: data.url ? { url: data.url } : null,
      })
    );
  } catch (e) {}
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
