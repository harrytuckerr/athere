const CACHE = 'athere-v20c';
const ASSETS = ['/'];
// Don't include manifest.json or icons in precache — they may not exist yet
// They'll be cached on first successful fetch instead

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .catch(() => {}) // Don't fail install on cache errors
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  
  // Never cache API calls, proxy requests, or external fetches
  if (url.pathname.startsWith('/api/') || url.pathname === '/proxy' || 
      url.hostname !== self.location.hostname || e.request.method !== 'GET') {
    return; // Let the browser handle it normally
  }
  
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok && url.origin === self.location.origin) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match('/')))
  );
});
