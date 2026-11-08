// Service worker: всё приложение и зашифрованные данные лежат в кэше — школа открывается без интернета.
const VERSION = "08ca2edb8389";
const FILES = ["./","./app.js","./calcs.js","./crypto.js","./manifest.webmanifest","./markdown.js","./progress.js","./index.html","./styles.css","./views.js","./icon-192.png","./icon-512.png","./apple-touch-icon.png","./data.json"];
const CACHE = "school-" + VERSION;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("school-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Сначала кэш; новая версия ставится в фоне через install и применяется при следующем открытии.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
