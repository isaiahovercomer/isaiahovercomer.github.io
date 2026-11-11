// 只快取本頁（/line/）自己的靜態檔；LIFF 連結與其他網址一律直接走網路。
const CACHE = 'line-tools-v2';
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.webmanifest',
  'img/app-icon.svg',
  'img/signup.svg',
  'img/link-card.svg',
  'img/love-letter.svg',
  'img/favicon-32.png',
  'img/apple-touch-icon.png',
  'img/icon-192.png',
  'img/icon-512.png',
  'img/maskable-512.png',
];
const URLS = new Set(FILES.map((f) => new URL(f, self.registration.scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('line-tools-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  url.search = '';
  url.hash = '';
  if (!URLS.has(url.href)) return;

  // 先用網路取得最新版本，離線時再用快取。
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(url.href, copy));
        }
        return res;
      })
      .catch(() => caches.match(url.href).then((hit) => hit || caches.match(new URL('./', self.registration.scope).href)))
  );
});
