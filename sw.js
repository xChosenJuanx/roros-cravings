const CACHE = 'roros-v21-silog-availability';
const ASSETS = [
  './','index.html','style.css','app.js','manifest.json','assets/logo.png','assets/gcash-qr.png',
  'assets/samgyup.png','assets/soy-garlic.png','assets/shawarma.png','assets/donkatsu.png','assets/bibimbap.png','assets/gochujang.png','assets/chick-fries.png',
  'assets/kimbap.jpg','assets/jjajangbap.jpg','assets/coke-sakto.jpg','assets/sprite-sakto.jpg','assets/royal-sakto.jpg','assets/coke-vanilla.jpg','assets/bottled-water.jpg','assets/coffee-jelly.jpg','assets/pineapple-juice.jpg',
  'assets/tocilog.jpg','assets/longsilog.jpg','assets/tapsilog.jpg','assets/hotsilog.jpg','assets/cornsilog.jpg','assets/chiksilog.jpg','assets/shangsilog.jpg'
];
self.addEventListener('install', event => { self.skipWaiting(); event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
});
