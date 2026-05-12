// CashPhone Service Worker — גל מזרחי PWA upgrade
const CACHE_NAME = 'cashphone-v2-9';
const OFFLINE_URL = 'offline.html';

const SHELL_ASSETS = [
  '/', '/index.html', '/styles.css', '/app.js', '/offline.html', '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;800&family=Heebo:wght@400;500;700&display=swap'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', function(e){
  const url = new URL(e.request.url);

  // Firebase — תמיד רשת
  if(url.hostname.includes('firestore.googleapis.com') || url.hostname.includes('firebase')){
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({offline:true}), {headers:{'Content-Type':'application/json'}})
      )
    );
    return;
  }

  // Fonts — stale-while-revalidate
  if(url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('fonts.googleapis.com')){
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          const net = fetch(e.request).then(r => { cache.put(e.request, r.clone()); return r; });
          return cached || net;
        })
      )
    );
    return;
  }

  // ניווט — Network First + offline fallback
  if(e.request.mode === 'navigate'){
    e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // שאר — Cache First
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(r => {
        if(r && r.status === 200 && r.type !== 'opaque'){
          caches.open(CACHE_NAME).then(c => c.put(e.request, r.clone()));
        }
        return r;
      }).catch(() => new Response('', {status:408}));
    })
  );
});
