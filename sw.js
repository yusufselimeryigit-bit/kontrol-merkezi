/* Kontrol Merkezi · service worker
   - HTML: önce ağ, olmazsa önbellek
   - aynı kökenli statik dosyalar: önce önbellek (arkada tazelenir)
   - API'ler ASLA önbelleğe alınmaz: başka kökenli hiçbir isteğe dokunulmaz
     (firebaseio, firebasedatabase, googleapis, gstatic, workers.dev …) */
const VERSION = 'km-v2.1.0';
const SHELL = ['./', 'index.html', 'veri.js', 'dersler.js', 'orb.js', 'logo/km1.js', 'logo/km7.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];
const NEVER = /firebaseio\.com|firebasedatabase\.app|googleapis\.com|gstatic\.com|workers\.dev/;

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || NEVER.test(url.href)) return;   // ağ yönetir, önbellek yok
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
