// Service worker: caches every file the app needs so it starts and works offline.
// Bump VERSION when files change.

const VERSION = 'spike-1';
const FILES = [
  './',
  './index.html',
  './app.js',
  './db-worker.js',
  './capacity-worker.js',
  './manifest.webmanifest',
  './icon.png',
  './vendor/index.mjs',
  './vendor/sqlite3.wasm',
  './pack/core.sqlite',
  './pack/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Cache first; the network is only used for files that are not cached.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit ?? fetch(event.request)));
});
