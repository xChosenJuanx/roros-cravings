const CACHE = 'roros-v18-chat-monitoring-only';
const ASSETS = ['./','index.html','style.css','app.js','manifest.json','assets/logo.png','assets/hungarian.png','assets/samgyup.png','assets/soy-garlic.png','assets/shawarma.png','assets/donkatsu.png','assets/bibimbap.png','assets/gochujang.png','assets/chick-fries.png'];
self.addEventListener('install', event => { self.skipWaiting(); event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
});
