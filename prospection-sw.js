// Service Worker de la carte de prospection (/prospection) — usage hors réseau.
// Page : réseau d'abord, cache en secours. Leaflet et fonds de carte : cache d'abord.
// Les appels de données (OpenStreetMap/Overpass, registre, Supabase) ne passent jamais par le cache :
// la page garde déjà ses données et sa file d'envoi dans le stockage local.
const VERSION = 'prospection-v1';
const CACHE_PAGE = VERSION + '-page';
const CACHE_TUILES = VERSION + '-tuiles';
const MAX_TUILES = 3000;
let ajoutsDepuisRognage = 0;

const PRECACHE = [
  '/prospection',
  '/icon-192.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_PAGE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(cles => Promise.all(cles.filter(k => k.startsWith('prospection-') && !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function rognerTuiles() {
  const cache = await caches.open(CACHE_TUILES);
  const cles = await cache.keys();
  for (let i = 0; i < cles.length - MAX_TUILES; i++) await cache.delete(cles[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Page de prospection : réseau d'abord.
  if (req.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then(r => { const copie = r.clone(); caches.open(CACHE_PAGE).then(c => c.put('/prospection', copie)); return r; })
        .catch(() => caches.match('/prospection'))
    );
    return;
  }

  // Fonds de carte OpenStreetMap : cache d'abord (les zones déjà parcourues restent visibles hors réseau).
  if (url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(
      caches.open(CACHE_TUILES).then(async cache => {
        const deja = await cache.match(req);
        if (deja) return deja;
        const r = await fetch(req);
        if (r.ok) { cache.put(req, r.clone()); if (++ajoutsDepuisRognage >= 100) { ajoutsDepuisRognage = 0; rognerTuiles(); } }
        return r;
      })
    );
    return;
  }

  // Leaflet : cache d'abord.
  if (url.hostname === 'unpkg.com') {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
  }
});
