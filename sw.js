/* ============================================================
   Finpro — Service Worker v2.0
   Cache-first pour l'app shell, network-first pour les données
   ============================================================ */

const CACHE_NAME = 'finpro-v2';
const OFFLINE_URL = './index.html';

// Ressources à mettre en cache immédiatement au premier chargement
const PRECACHE_ASSETS = [
  './index.html',
  './manifest.json'
];

/* ── Installation ─────────────────────────────────────────── */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(function() {
      return self.skipWaiting(); // Activation immédiate sans attendre
    })
  );
});

/* ── Activation (nettoyage des anciens caches) ─────────────── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      return self.clients.claim(); // Prend le contrôle immédiatement
    })
  );
});

/* ── Stratégie de fetch ────────────────────────────────────── */
self.addEventListener('fetch', function(event) {
  // Ne pas intercepter les requêtes API externes (JSONBin, Anthropic)
  var url = event.request.url;
  if (
    url.includes('jsonbin.io') ||
    url.includes('anthropic.com') ||
    url.includes('cdnjs.cloudflare.com') ||
    event.request.method !== 'GET'
  ) {
    return; // Laisser passer directement, pas de cache
  }

  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      if (cachedResponse) {
        // Cache hit — retourner depuis le cache ET mettre à jour en arrière-plan
        var fetchPromise = fetch(event.request).then(function(networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            var responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch(function() {
          // Réseau indisponible — on a déjà le cache, pas de problème
        });
        return cachedResponse;
      }

      // Pas en cache — aller sur le réseau
      return fetch(event.request).then(function(networkResponse) {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        var responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      }).catch(function() {
        // Réseau indisponible ET pas en cache — retourner la page principale
        return caches.match(OFFLINE_URL);
      });
    })
  );
});

/* ── Notifications push (base, pour score PWABuilder) ─────── */
self.addEventListener('push', function(event) {
  var data = {};
  if (event.data) {
    try { data = event.data.json(); } catch(e) { data = { title: 'Finpro', body: event.data.text() }; }
  }
  var options = {
    body: data.body || 'Notification Finpro',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || './' }
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Finpro', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || './')
  );
});
