// Service worker: simpan fail app supaya boleh dibuka walaupun internet lemah.
// Tukar VERSION setiap kali fail app berubah supaya pengguna dapat versi baharu.
const VERSION = 'v3.49.0';
const CACHE = `pingpong-${VERSION}`;
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'engine.js', 'store.js',
  'draw-anim.js', 'cloud.js', 'live.js', 'draw-video.js', 'recap-video.js', 'sound.js', 'vendor/mp4-muxer.js', 'poster.js', 'reg-poster.js', 'poster-real.js', 'poster-kit.js', 'vendor/qrcode.js', 'push.js', 'push-config.js', 'firebase-config.js', 'manifest.webmanifest', 'logos/kskpkpjb.webp', 'logos/ksas-pingpong.webp', 'logos/ksas.webp', 'icons/pp-192.png', 'icons/pp-512.png', 'icons/pp-apple-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('pingpong-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Rangkaian dahulu (supaya kemas kini cepat sampai), cache jika luar talian.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // cache: 'no-cache' → sentiasa semak versi terkini dengan pelayan (GitHub Pages menyimpan fail 10 minit dalam cache pelayar)
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

// Push dari pelayan (Cloudflare Worker): papar notifikasi walaupun app ditutup
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Pingpong Portal', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, icon: 'icons/pp-192.png', badge: 'icons/pp-192.png', vibrate: [200, 100, 200], timestamp: Date.now(), requireInteraction: false, data: { url: d.url || '' },
  }));
});
// Ketik notifikasi → buka app pada halaman berkaitan
self.addEventListener('notificationclick', e => {
  e.notification.close();
  // hanya buka halaman dalam app ini (elak pautan luar daripada notifikasi palsu)
  let url = (e.notification.data && e.notification.data.url) || '';
  try { if (new URL(url, self.registration.scope).origin !== self.location.origin) url = ''; } catch { url = ''; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs[0];
    if (c) { if (url) c.navigate(new URL(url, self.registration.scope).href).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(new URL(url || './', self.registration.scope).href);
  }));
});
