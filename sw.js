const CACHE = 'roros-v41-desserts';
const ASSETS = [
  './','index.html','style.css','app.js','manifest.json','assets/logo.png','assets/gcash-qr.png','assets/app-download-qr.png',
  'assets/samgyup.png','assets/soy-garlic.png','assets/shawarma.png','assets/donkatsu.png','assets/bibimbap.png','assets/gochujang.png','assets/chick-fries.png',
  'assets/kimbap.jpg','assets/jjajangbap.jpg','assets/jjajangmyeon.jpg','assets/fishcake-on-stick.jpg','assets/tteokbokki.jpg','assets/coke-sakto.jpg','assets/sprite-sakto.jpg','assets/royal-sakto.jpg','assets/coke-vanilla.jpg','assets/bottled-water.jpg','assets/coffee-jelly.jpg','assets/pineapple-juice.jpg',
  'assets/tocilog.jpg','assets/longsilog.jpg','assets/tapsilog.jpg','assets/hotsilog.jpg','assets/cornsilog.jpg','assets/chiksilog.jpg','assets/shangsilog.jpg',
  'assets/chosilog.jpg','assets/waffle.jpg','assets/adobosilog.jpg','assets/spam-musubi.jpg',
  'assets/spaghetti.jpg','assets/pancit-palabok.jpg','assets/buldak-black.jpg','assets/kimchi-ramyeon.jpg',
  'assets/buko-salad.jpg','assets/buko-pandan.jpg','assets/mango-float.jpg'
];
self.addEventListener('install', event => { self.skipWaiting(); event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
});
