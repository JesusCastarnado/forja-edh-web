// Service worker de Forja EDH: hace la web instalable como app y la abre sin conexión.
// Estrategia «red primero»: siempre se pide la versión nueva y la copia guardada solo se usa si no
// hay internet, así un cambio publicado se ve al momento. Lo de otros sitios (Scryfall, Supabase,
// EDHREC…) y /api/ no se toca: va siempre directo a la red.
const CACHE = "forja-v1";
const SHELL = ["/", "/index.html", "/css/styles.css", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === "navigate" ? caches.match("/index.html") : Response.error())))
  );
});
