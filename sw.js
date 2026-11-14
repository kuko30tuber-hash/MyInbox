/* OwnInbox offline support: the app itself is kept on the device so it opens without internet.
   Your mail, calendar and Spotify data never go through this file. */
const CACHE = "owninbox-v7";
const SHELL = ["/", "index.html", "app.css", "app.js", "boot.js", "google-shim.js", "config.js", "logo.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "manifest.webmanifest"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  /* the app's own files: newest from the network; the saved copy when offline,
     or when a slow connection takes longer than 2.5 seconds (the newer copy is still saved for next time) */
  if (url.origin === location.origin) {
    if (url.pathname.startsWith("/.netlify/")) return;
    const key = req.mode === "navigate" ? "index.html" : req;
    const saved = () => caches.match(key, { ignoreSearch: true }).then((r) => r || caches.match("index.html"));
    const net = fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
      return res;
    });
    e.respondWith(new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => { caches.match(key, { ignoreSearch: true }).then((r) => { if (r && !done) { done = true; resolve(r); } }); }, 2500);
      net.then((res) => { clearTimeout(t); if (!done) { done = true; resolve(res); } })
         .catch(() => { clearTimeout(t); if (!done) { done = true; resolve(saved()); } });
    }));
    e.waitUntil(net.catch(() => {}));
    return;
  }
  /* fonts: saved once, refreshed in the background */
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
/* tapping a notification brings the app to the front */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => { for (const w of ws) { if ("focus" in w) return w.focus(); } return self.clients.openWindow("/"); }));
});
