/* Quantix offline support (service worker, served at /sw.js).
   The labs run entirely in the browser, so once visited (or pre-cached here) they also open with no internet:
   Circuits, PLC, Chemistry, Physics, Formulas, Converter, Graphs, Elements. Photo AI, Measure and the Solver need the
   server and show a friendly message when offline.
   Strategy: pages and data are network-first (always fresh when online, cached copy when offline); scripts, styles,
   images and fonts are cache-first with a background refresh. Bump VERSION to drop old caches. */
const VERSION = "quantix-v2";
const PAGES = ["/", "/circuit", "/plc", "/chemlab", "/physics", "/formulas", "/converter", "/graph", "/elements"];
const ASSETS = ["/web/lab.css", "/web/site.js", "/web/sci_bg.js", "/web/social_icons.js", "/web/favicon.svg", "/web/icon-512.png",
  "/web/circuit_sim.js", "/web/circuit_examples.js", "/web/circuit_ui.js", "/web/circuit_3d.js", "/web/plc_engine.js", "/web/plc_ui.js",
  "/web/chem_engine.js", "/web/chem_ui.js", "/web/physics.js", "/web/vendor/three.min.js", "/web/units.js", "/web/graph.js", "/web/mathexpr.js",
  "/web/formula_cards.js", "/web/shapes3d.js", "/api/v1/elements", "/api/v1/formulas"];
const NEVER = /^\/(api\/v1\/(predict|measure|feedback|contact|handwriting|solve|eq)|contact\/inbox)/;   // live-only requests

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(PAGES.concat(ASSETS).map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const offlinePage = () => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · Quantix</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#050a16;color:#e6f0ff;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px">
<div><h1 style="font-size:22px">You're offline</h1><p style="color:#93a6c4">This page needs the internet. These labs work offline:</p>
<p><a style="color:#38bdf8" href="/circuit">Circuits</a> · <a style="color:#38bdf8" href="/chemlab">Chem Lab</a> · <a style="color:#38bdf8" href="/plc">PLC</a> ·
<a style="color:#38bdf8" href="/physics">Physics</a> · <a style="color:#38bdf8" href="/formulas">Formulas</a> · <a style="color:#38bdf8" href="/converter">Converter</a> ·
<a style="color:#38bdf8" href="/graph">Graphs</a> · <a style="color:#38bdf8" href="/elements">Elements</a></p>
<button onclick="location.reload()" style="padding:12px 26px;border:0;border-radius:12px;background:#0284c7;color:#fff;font:600 16px system-ui">Try again</button></div>`,
  { headers: { "Content-Type": "text/html; charset=utf-8" } });

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  const same = url.origin === self.location.origin, font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!same && !font) return;
  if (same && NEVER.test(url.pathname)) return;
  const dynamic = req.mode === "navigate" || (same && url.pathname.startsWith("/api/"));
  if (dynamic) {   // network first, cached copy when offline
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: req.mode !== "navigate" }).then((hit) => hit || caches.match(url.pathname)
      .then((h2) => h2 || (req.mode === "navigate" ? offlinePage() : Response.error())))));
    return;
  }
  // static files: cache first (ignoring ?v=), refreshed in the background
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; });
    if (hit) { net.catch(() => null); return hit; }
    return net.catch(() => caches.match(req, { ignoreSearch: true }).then((h) => h || Response.error()));
  }));
});
