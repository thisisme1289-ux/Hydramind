// HydraMind Service Worker — v4
// Offline-first caching + background notification scheduling

const CACHE = 'hydramind-v4';

const PRECACHE = [
  './',
  './index.html',
  './quick-log.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(PRECACHE.map(url => cache.add(url).catch(()=>{})))
    ).then(() => self.skipWaiting())
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

// ── Notification click — open app when user taps notification ─────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
      // If app is already open, focus it
      for (const client of list) {
        if (client.url.includes('Hydramind') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});

// ── Message handler — receives schedule/cancel commands from the app ──────────
let reminderTimer = null;

self.addEventListener('message', e => {
  const data = e.data;
  if (!data || !data.type) return;

  // App says: schedule a reminder in X milliseconds
  if (data.type === 'SCHEDULE_REMINDER') {
    // Cancel any existing timer
    if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }

    const ms = data.ms || 7200000; // default 2 hours
    const title = data.title || 'Time to hydrate 💧';
    const body  = data.body  || 'Your scheduled interval has passed. Log your next drink.';

    reminderTimer = setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon:  './icon-192.png',
        badge: './icon-192.png',
        tag:   'hm-reminder',
        renotify: true,
        vibrate: [200, 100, 200],
        actions: [
          { action: 'log', title: 'Log drink' },
          { action: 'snooze', title: 'Snooze 30min' },
        ],
        data: { url: './index.html' }
      });
      reminderTimer = null;
    }, ms);

    // Confirm back to the page
    if (e.source) e.source.postMessage({ type: 'REMINDER_SCHEDULED', ms });
  }

  // App says: cancel any pending reminder
  if (data.type === 'CANCEL_REMINDER') {
    if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
  }

  // App says: show a notification immediately (e.g. goal reached)
  if (data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(data.title || 'HydraMind', {
      body:    data.body || '',
      icon:    './icon-192.png',
      badge:   './icon-192.png',
      tag:     data.tag || 'hm',
      vibrate: [100, 50, 100],
      data:    { url: './index.html' }
    });
  }

  // Handle snooze action
  if (data.type === 'SNOOZE') {
    if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
    reminderTimer = setTimeout(() => {
      self.registration.showNotification('Snoozed reminder 💧', {
        body:    'Your 30-minute snooze is up. Time to drink some water!',
        icon:    './icon-192.png',
        tag:     'hm-reminder',
        renotify: true,
        vibrate: [200, 100, 200],
      });
      reminderTimer = null;
    }, 30 * 60 * 1000);
  }
});

// ── Handle notification action buttons ───────────────────────────────────────
self.addEventListener('notificationclick', e => {
  const action = e.action;
  e.notification.close();

  if (action === 'snooze') {
    // Tell SW to snooze 30 min
    if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
    reminderTimer = setTimeout(() => {
      self.registration.showNotification('Snoozed reminder 💧', {
        body: 'Your 30-minute snooze is up. Time to drink some water!',
        icon: './icon-192.png',
        tag:  'hm-reminder',
        renotify: true,
        vibrate: [200, 100, 200],
      });
      reminderTimer = null;
    }, 30 * 60 * 1000);
    return;
  }

  // For 'log' action or normal tap — open the app
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
      for (const client of list) {
        if (client.url.includes('Hydramind') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
