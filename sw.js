// HydraMind Service Worker — v5
// Offline-first + notification support

const CACHE = 'hydramind-v6';

const PRECACHE = [
  './',
  './index.html',
  './app.html',
  './about.html',
  './quick-log.html',
  './manifest.json',
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
  './assets/screenshots/app-dashboard.png',
  './assets/screenshots/quick-log.png',
  './assets/screenshots/about-page.png',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(PRECACHE.map(url => cache.add(url).catch(()=>{}))))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch (offline-first) ─────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.hostname === 'api.open-meteo.com') {
    e.respondWith(fetch(e.request).catch(() => new Response('{}', {headers:{'Content-Type':'application/json'}})));
    return;
  }
  if (url.hostname.includes('fonts.google') || url.hostname.includes('fonts.gstatic')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => null);
      return cached || net;
    })
  );
});

// ── Show notification (called via message from page) ─────────────────────────
self.addEventListener('message', e => {
  if (!e.data || !e.data.type) return;

  if (e.data.type === 'SHOW_NOTIFICATION') {
    e.waitUntil(
      self.registration.showNotification(e.data.title || 'HydraMind', {
        body:     e.data.body || '',
        icon:     './icon-192.png',
        badge:    './icon-192.png',
        tag:      e.data.tag || 'hm',
        renotify: true,
        vibrate:  [200, 100, 200],
        actions:  [{ action:'open', title:'Log drink' }],
        data:     { url: './app.html' }
      })
    );
  }

  if (e.data.type === 'CANCEL_REMINDER') {
    // Nothing to cancel — timers now managed in localStorage by the page
  }
});

// ── Notification tap — open the app ──────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
      for (const client of list) {
        if (client.url.includes('Hydramind') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./app.html');
    })
  );
});
