/* Service worker: makes Jungle open instantly and play offline.
 *
 * Everything needed to play the computer is cached on the device - the rules,
 * the AI and the board all run locally anyway, so no connection is needed for
 * a game. Only the room API for playing a friend has to reach the server, and
 * those requests are deliberately never touched here.
 *
 * The whole shell lives in ONE versioned cache, filled in a single pass at
 * install. That matters: refreshing files individually in the background can
 * leave a new app.js sitting next to last week's index.html, which breaks the
 * page in a way that is painful to debug.
 *
 * So: BUMP `CACHE` WHENEVER A SHELL FILE CHANGES. Nothing else triggers an
 * update, and installed copies will happily serve the old version forever.
 */
var CACHE = 'jungle-v10';

var SHELL = [
  '/',
  '/static/style.css',
  '/static/i18n.js',
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
      // cache: 'reload' so a stale HTTP cache cannot poison the new version
      .then(function (c) {
        return Promise.all(SHELL.map(function (url) {
          return fetch(new Request(url, { cache: 'reload' })).then(function (res) {
            if (res && res.ok) return c.put(url, res);
          });
        }));
      })
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

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Rooms are live by definition - a cached move would be a bug, and the long
  // poll must never be answered from a cache.
  if (url.pathname.indexOf('/api/') === 0) return;

  // Opening the app: serve the stored page at once. This is what makes it
  // open instantly even when the free server is still waking up.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('/', { cacheName: CACHE }).then(function (hit) {
        return hit || fetch(req);
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req, { cacheName: CACHE }).then(function (hit) {
      return hit || fetch(req);
    })
  );
});
