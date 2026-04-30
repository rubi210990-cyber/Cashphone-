// CashPhone Service Worker
// Version 1.1.0
const CACHE_NAME = 'cashphone-v2';
const RUNTIME_CACHE = 'cashphone-runtime-v2';

// קבצים בסיסיים שיישמרו בקאש מיד אחרי ההתקנה
const PRECACHE_URLS = [
  './',
  './index.html'
];

// התקנה - שמירת קבצים בסיסיים
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('Precache failed:', err))
  );
});

// הפעלה - ניקוי גירסאות ישנות של הקאש
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// תפיסת בקשות רשת
self.addEventListener('fetch', event => {
  // מטפל רק בבקשות GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // אל תיגע בכלום שקשור ל-Firebase, Google, Cloudinary, ב-APIs ובדומיינים חיצוניים
  // הם תמיד צריכים להיות חיים מהרשת
  const skipDomains = [
    'gstatic.com',           // סקריפטי Firebase!
    'googleapis.com',        // כל ה-APIs של Google
    'firebaseio.com',
    'firebase.com',
    'firebaseapp.com',
    'cloudfunctions.net',
    'cloudinary.com',
    'github.com',
    'githubusercontent.com',
    'api.exchangerate-api.com',
    'open.er-api.com',
    'api.frankfurter.app',
    'jsdelivr.net',          // CDN של ספריות
    'cdnjs.cloudflare.com'
  ];

  if (skipDomains.some(domain => url.hostname.includes(domain))) {
    return; // נותנים לדפדפן לטפל בבקשה רגילה - לא מתערבים
  }

  // רק לאתר עצמו (cashphone.co.il) - אסטרטגיה Network First
  // אסטרטגיה: Network First, fallback to Cache
  // זה מבטיח שהמשתמש תמיד מקבל את הגירסה הכי עדכנית כשיש רשת
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // אם התגובה תקינה - שומרים בקאש
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE)
            .then(cache => cache.put(event.request, responseToCache))
            .catch(() => {});
        }
        return response;
      })
      .catch(() => {
        // אין רשת - מנסים מהקאש
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          // אם אין כלום בקאש ואין רשת - לפחות נחזיר את ה-index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

// תקשורת מהאפליקציה ל-Service Worker
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
