// ============================================================
//  MC STORE — SERVICE WORKER
//  Handles: caching, offline fallback, push notifications
// ============================================================

const CACHE_NAME    = 'mcstore-v1';
const OFFLINE_URL   = '/offline.html';

// Files to cache immediately on install
const PRECACHE = [
  '/app-skeleton.html',
  '/home.html',
  '/offline.html',
  '/manifest.json',
  '/favicon-192.png',
  '/favicon-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/db.js',
  '/session.js',
  '/auth.js',
];

// ── INSTALL: cache core files ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE).catch(() => {
        // Don't fail install if some files miss
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: network-first, fallback to cache ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, supabase API calls
  if (request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('firebaseapp.com')) return;
  if (url.hostname.includes('googleapis.com')) return;
  if (url.hostname.includes('cdnjs.cloudflare.com')) return;
  if (url.protocol === 'chrome-extension:') return;

  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful HTML/JS/CSS responses
        if (response.ok && (
          request.url.endsWith('.html') ||
          request.url.endsWith('.js') ||
          request.url.endsWith('.css') ||
          request.url.endsWith('.png') ||
          request.url.endsWith('.ico') ||
          request.url.endsWith('.json')
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(request).then(cached => {
          if (cached) return cached;
          // For navigation requests, show offline page
          if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
        });
      })
  );
});

// ── PUSH NOTIFICATIONS ──
self.addEventListener('push', event => {
  let data = {
    title: 'MC Store 🛍️',
    body:  'You have a new message!',
    icon:  '/favicon-192.png',
    url:   '/app-skeleton.html'
  };

  try {
    if (event.data) {
      const raw = event.data.json();
      data = { ...data, ...raw };
    }
  } catch(e) {
    try { data.body = event.data.text(); } catch {}
  }

  const options = {
    body:               data.body,
    icon:               data.icon || '/favicon-192.png',
    badge:              '/favicon-192.png',
    image:              data.image || undefined,
    vibrate:            [200, 100, 200, 100, 200],
    data:               { url: data.url || '/app-skeleton.html' },
    actions: [
      { action: 'open',    title: '🛍️ Open App' },
      { action: 'dismiss', title: 'Dismiss'      }
    ],
    requireInteraction: false,
    renotify:           true,
    tag:                'mcstore-notif-' + Date.now(),
    timestamp:          Date.now(),
    silent:             false
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );

  // Also post to open app windows so bell updates immediately
  event.waitUntil(
    self.clients.matchAll({ type:'window' }).then(clients => {
      clients.forEach(c => c.postMessage({ type:'pushReceived', data }));
    })
  );
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/app-skeleton.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes('app-skeleton') && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ── BACKGROUND SYNC (for offline orders) ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncOfflineOrders());
  }
});

async function syncOfflineOrders() {
  // Placeholder — future: sync any orders saved offline
  console.log('[SW] Background sync triggered');
}
