// 只快取本頁（/toolbox/）自己的靜態檔；LIFF 連結、後端 API 與其他網址一律直接走網路。
const CACHE = 'toolbox-v6';
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'config.js',
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
  'icons/map.json',
  'icons/morning-revival-today-site.png',
  'icons/interlinear-bible.png',
  'icons/forms-app-web.png',
  'icons/2026-tcchlife-pyramid.png',
  'icons/2026-twyp-chlife.png',
  'icons/taichung-church-reports-site.png',
  'icons/line-tools.png',
  'icons/line-signup.png',
  'icons/line-link-card.png',
  'icons/line-love-letter.png',
  'icons/line-prayer-wall.png',
  'icons/line-outreach.png',
  'icons/fulltime-weekly-report.png',
  'icons/pdb-workbench.png',
  'icons/numbered-score-studio.png',
  'icons/family-story-365.png',
  'icons/gospel-tracts-animation.png',
  'icons/curd-honey-bible-journey.png',
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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('toolbox-') && k !== CACHE).map((k) => caches.delete(k))))
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
