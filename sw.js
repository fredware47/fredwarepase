const CACHE_NAME = 'fredware-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './cocina.html',
  './sala.html',
  './shared.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});