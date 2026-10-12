/* Service worker: menyimpan seluruh berkas aplikasi agar bisa dibuka tanpa internet.
 * Naikkan VERSI setiap kali ada perubahan berkas agar perangkat penguji mendapat versi terbaru. */
var VERSI = 'penguji-osce-v1.1.0';
var BERKAS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/config.js',
  './js/db.js',
  './js/rekap.js',
  './js/app.js',
  './vendor/xlsx.full.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png',
  './icons/logo-aipvogi.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSI).then(function (c) { return c.addAll(BERKAS); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSI; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API Google Apps Script tidak di-cache
  // config.js: utamakan jaringan agar perubahan URL API cepat berlaku
  if (url.pathname.endsWith('/js/config.js')) {
    e.respondWith(fetch(req).then(function (r) {
      var salin = r.clone(); caches.open(VERSI).then(function (c) { c.put(req, salin); }); return r;
    }).catch(function () { return caches.match(req); }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      if (r.ok) { var salin = r.clone(); caches.open(VERSI).then(function (c) { c.put(req, salin); }); }
      return r;
    }).catch(function () {
      if (req.mode === 'navigate') return caches.match('./index.html');
    });
  }));
});
