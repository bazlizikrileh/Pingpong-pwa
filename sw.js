// Service worker: simpan fail app supaya boleh dibuka walaupun internet lemah.
// Tukar VERSION setiap kali fail app berubah supaya pengguna dapat versi baharu.
const VERSION = 'v2.6.0';
const CACHE = `pingpong-${VERSION}`;
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'engine.js', 'store.js',
  'draw-anim.js', 'cloud.js', 'firebase-config.js', 'manifest.webmanifest', 'logos/kskpkpjb.webp', 'logos/ksas-pingpong.webp', 'logos/ksas.webp', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Rangkaian dahulu (supaya kemas kini cepat sampai), cache jika luar talian.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
