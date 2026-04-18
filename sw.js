// Service Worker v2 — Notifications Push VAPID
// Chez Christophe — App Commerçant

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });

// Réception notification push
self.addEventListener('push', e => {
  let data = {};
  try {
    data = e.data?.json() || {};
  } catch(err) {
    data = { titre: '🛒 Nouvelle commande !', corps: e.data?.text() || '' };
  }

  const titre  = data.titre || '🛒 Nouvelle commande !';
  const corps  = data.corps || 'Une nouvelle commande vous attend';
  const url    = data.url   || '/app-commercant.html';

  e.waitUntil(
    self.registration.showNotification(titre, {
      body: corps,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
      data: { url },
      actions: [
        { action: 'voir',    title: '👀 Voir' },
        { action: 'ignorer', title: 'Ignorer' },
      ]
    })
  );
});

// Clic sur la notification
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'ignorer') return;

  const url = e.notification.data?.url || '/app-commercant.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        for (const c of list) {
          if (c.url.includes('app-commercant') && 'focus' in c) return c.focus();
        }
        return clients.openWindow(url);
      })
  );
});
