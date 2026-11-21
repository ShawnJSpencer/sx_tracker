// Offline cache for the app shell only. Never caches GitHub API traffic (her data).
const V = 'bloom-v4';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon2.svg', 'icon2-180.png',
  'js/app.js', 'js/config.js', 'js/util.js', 'js/store.js', 'js/sync.js', 'js/popover.js', 'js/log.js',
  'js/charts.js', 'js/insights.js', 'js/labs.js', 'js/report.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname === 'api.github.com') return;
  // network first so updates arrive; cache as offline fallback
  e.respondWith(fetch(e.request).then(r => { if (r.ok && (url.origin === location.origin || url.hostname.includes('fonts.g'))) { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request)));
});
