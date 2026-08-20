/* Service worker: makes Jungle open instantly and play offline.
 *
 * Everything needed to play the computer is cached on the device - the rules,
 * the AI and the board all run locally anyway, so no connection is needed for
 * a game. Only the room API for playing a friend has to reach the server, and
 * those requests are deliberately never touched here.
 *
 * Bump CACHE when the shell files change so old copies get cleared out.
 */
var CACHE = 'jungle-v1';

var SHELL = [
  '/',
  '/static/style.css',
  '/static/rules.js',
  '/static/app.js',
  '/static/ai.js',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/icon-maskable-512.png',
  '/static/icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function freshen(req) {
  return fetch(req).then(function (res) {
    if (res && res.status === 200 && res.type === 'basic') {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Rooms are live by definition - a cached move would be a bug, and the long
  // poll must never be answered from a cache.
  if (url.pathname.indexOf('/api/') === 0) return;

  // Opening the app: serve the stored page at once, then quietly refresh it so
  // the next launch is up to date. This is what makes it open instantly even
  // when the free server is still waking up.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('/').then(function (hit) {
        var net = freshen(new Request('/')).catch(function () { return hit; });
        return hit || net;
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = freshen(req).catch(function () { return hit; });
      return hit || net;
    })
  );
});
