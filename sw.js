/* Service Worker สำหรับ PWA: เปิดใช้งาน Offline ได้ และอัปเดตอัตโนมัติเมื่อออนไลน์ */
const CACHE = 'nle-tb-v74';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/style.css?v=74',
  './assets/monument.css?v=74',
  './assets/pixel.css?v=74',
  './assets/app.js?v=74',
  './assets/sync.js?v=74',
  './assets/firebase-config.js?v=74',
  './assets/icon-mv.svg',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './data/chapters.json',
  './data/abbr.json',
  './data/bacteria.json',
  './data/taxonomy.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('nle-tb-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // ไม่ยุ่งกับ Firebase / Google Auth / Firestore API
  if (
    url.hostname === 'generativelanguage.googleapis.com' ||
    url.hostname.endsWith('firebaseapp.com') ||
    url.hostname.endsWith('firebaseio.com') ||
    url.hostname.endsWith('identitytoolkit.googleapis.com') ||
    url.hostname.endsWith('securetoken.googleapis.com') ||
    url.hostname.endsWith('firestore.googleapis.com') ||
    url.hostname === 'accounts.google.com' ||
    url.hostname.endsWith('googleusercontent.com') ||
    (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))
  ) {
    return;
  }

  // Google Fonts: cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const cl = res.clone(); caches.open(CACHE).then(c => c.put(req, cl)); }
        return res;
      }).catch(() => hit))
    );
    return;
  }

  // ไฟล์ในโดเมนเดียวกัน: network-first แล้ว fallback cache (อัปเดตไว + ใช้ offline ได้)
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) {
          const cl = res.clone();
          caches.open(CACHE).then(c => c.put(req, cl));
        }
        return res;
      }).catch(() => caches.match(req).then(hit => {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }))
    );
  }
});
