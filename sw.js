/* Service worker: lưu sẵn giao diện app để mở nhanh và mở được cả khi mạng yếu.
 * Dữ liệu (Google Apps Script) không đi qua đây — luôn lấy mới từ máy chủ.
 * Khi sửa code, tăng VERSION để điện thoại tải bản mới. */
var VERSION = 'leeming-v5';
var NETWORK_ONLY = /(^|\.)(open-meteo\.com|overpass-api\.de|overpass\.kumi\.systems|script\.google\.com|script\.googleusercontent\.com)$/;
var SHELL = [
  './', 'index.html', 'css/app.css', 'js/config.js', 'js/gas-shim.js', 'js/context.js', 'js/app.js', 'backend/Code.gs',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Mạng trước, hỏng mạng thì dùng bản đã lưu (để bản sửa code luôn tới được điện thoại).
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  var isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  // Thời tiết, bản đồ quán và Apps Script luôn lấy trực tiếp từ mạng, không lưu lại.
  if (NETWORK_ONLY.test(url.hostname)) return;
  if (!sameOrigin && !isFont) return;
  // File của app luôn hỏi lại máy chủ (cache: 'no-cache'), không lấy bản cũ trong bộ nhớ đệm trình duyệt
  // — GitHub Pages cho trình duyệt giữ file 10 phút, đủ để điện thoại chạy code cũ sau khi đã cập nhật.
  e.respondWith(
    (sameOrigin ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req)).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: sameOrigin }).then(function (hit) { return hit || caches.match('index.html'); });
    })
  );
});
