// Service Worker — Notifications Push
// Chez Christophe — App Commerçant

const CACHE_NAME = 'chez-christophe-v1';

// Installation
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// Réception d'une notification push
self.addEventListener('push', e => {
  const data = e.data?.json() || {};

  const titre = data.titre || 'Nouvelle commande';
  const corps = data.corps || 'Vous avez une nouvelle commande';
  const url = data.url || '/app-commercant.html';
  const icon = data.icon || '/icon-192.png';

  const options = {
    body: corps,
    icon: icon,
    badge: icon,
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: { url },
    actions: [
      { action: 'voir', title: '👀 Voir la commande' },
      { action: 'ignorer', title: 'Ignorer' },
    ]
  };

  e.waitUntil(
    self.registration.showNotification(titre, options)
  );
});

// Clic sur la notification
self.addEventListener('notificationclick', e => {
  e.notification.close();

  if (e.action === 'ignorer') return;

  const url = e.notification.data?.url || '/app-commercant.html';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes('app-commercant') && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});

// Sync en arrière-plan (nouvelle commande)
self.addEventListener('sync', e => {
  if (e.tag === 'sync-commandes') {
    e.waitUntil(syncCommandes());
  }
});

async function syncCommandes() {
  // Vérifier les nouvelles commandes toutes les 30s
  const r = await fetch('https://epvdzhzwfmtnioedyfgm.supabase.co/rest/v1/commandes?statut=eq.nouvelle&order=created_at.desc&limit=1', {
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdmR6aHp3Zm10bmlvZWR5ZmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDYwMTgsImV4cCI6MjA5MjAyMjAxOH0.NnMHas3OCJxfqQW3lUG9LDrklsuO_c9-Xpm41K5q1uc',
    }
  });
  const data = await r.json();
  if (data?.length > 0) {
    self.registration.showNotification('🛒 Nouvelle commande !', {
      body: `Commande ${data[0].numero} — ${data[0].total_ttc}€`,
      icon: '/icon-192.png',
      vibrate: [300, 100, 300],
      requireInteraction: true,
    });
  }
}
