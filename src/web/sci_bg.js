/* Animated "science lab" background: a drifting particle network (links to the pointer) and floating equations.
   Drawn on one fixed canvas behind the page; colours come from the CSS tokens --accent / --accent-2 / --ink.
   Pauses while the tab is hidden; draws a single still frame when the user prefers reduced motion. */
(function () {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cv = document.createElement("canvas");
  cv.className = "sci-bg";
  cv.setAttribute("aria-hidden", "true");
  document.body.prepend(cv);
  const ctx = cv.getContext("2d");
  if (!ctx) return;

  const GLYPHS = ["π", "∑", "∫", "√", "Δ", "θ", "λ", "∞", "Ω", "∂", "∇", "φ", "ħ", "μ", "E = mc²", "F = ma", "a² + b² = c²",
                  "e^(iπ) + 1 = 0", "PV = nRT", "sin²θ + cos²θ = 1", "λ = h/p", "V = πr²h", "∮ E·dA = q/ε₀", "v = u + at",
                  "F = Gm₁m₂/r²", "A = πr²", "c = λf", "∇·B = 0"];
  let W = 0, H = 0, dpr = 1, nodes = [], glyphs = [], raf = 0, last = 0, col = null;
  const mouse = { x: -1e4, y: -1e4 };
  const rnd = (a, b) => a + Math.random() * (b - a);

  function readColors() {
    const s = getComputedStyle(document.documentElement);
    const v = (n, f) => s.getPropertyValue(n).trim() || f;
    const dark = (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
    col = { a: v("--accent", "#38bdf8"), b: v("--accent-2", "#a78bfa"), ink: v("--ink", "#e6f0ff"), k: dark ? 1 : 0.75 };
  }

  function resize() {
    W = innerWidth; H = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.max(28, Math.min(110, Math.round((W * H) / 15000)));
    nodes = Array.from({ length: n }, () => ({ x: rnd(0, W), y: rnd(0, H), vx: rnd(-0.28, 0.28), vy: rnd(-0.28, 0.28),
                                              r: rnd(0.8, 2.2), hue: Math.random() < 0.7 ? "a" : "b" }));
    const g = Math.max(8, Math.min(24, Math.round(W / 80)));
    glyphs = Array.from({ length: g }, () => newGlyph(rnd(0, H)));
  }

  function newGlyph(y) {
    const t = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    const long = t.length > 2;
    return { t, x: rnd(0, W), y, vy: rnd(-0.32, -0.12), ph: rnd(0, 6.28), sway: rnd(6, 22), rot: rnd(-0.25, 0.25),
             size: long ? rnd(12, 16) : rnd(18, 30), a: long ? rnd(0.07, 0.14) : rnd(0.06, 0.13), hue: Math.random() < 0.5 ? "a" : "b" };
  }

  function frame(now) {
    const dt = last ? Math.min(50, now - last) / 16.67 : 1;
    last = now;
    ctx.clearRect(0, 0, W, H);

    // floating equations
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const g of glyphs) {
      g.y += g.vy * dt;
      g.ph += 0.01 * dt;
      if (g.y < -40) Object.assign(g, newGlyph(H + 40));
      ctx.save();
      ctx.translate(g.x + Math.sin(g.ph) * g.sway, g.y);
      ctx.rotate(g.rot);
      ctx.globalAlpha = g.a * col.k;
      ctx.fillStyle = col[g.hue];
      ctx.font = `italic ${g.size}px "Cambria Math", Cambria, Georgia, serif`;
      ctx.fillText(g.t, 0, 0);
      ctx.restore();
    }

    // particle network
    const LINK = 128, LINK2 = LINK * LINK;
    for (const p of nodes) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
      const mx = mouse.x - p.x, my = mouse.y - p.y, md = mx * mx + my * my;
      if (md < 160 * 160 && md > 1) { p.x += (mx / Math.sqrt(md)) * 0.25 * dt; p.y += (my / Math.sqrt(md)) * 0.25 * dt; }
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const q = nodes[j], dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
        if (d2 < LINK2) {
          ctx.globalAlpha = (1 - d2 / LINK2) * 0.28 * col.k;
          ctx.strokeStyle = col[p.hue];
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
      const mx = mouse.x - p.x, my = mouse.y - p.y, md = mx * mx + my * my;
      if (md < 170 * 170) {
        ctx.globalAlpha = (1 - md / (170 * 170)) * 0.55 * col.k;
        ctx.strokeStyle = col.a;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
      }
    }
    for (const p of nodes) {
      ctx.globalAlpha = 0.75 * col.k;
      ctx.fillStyle = col[p.hue];
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!reduce) raf = requestAnimationFrame(frame);
  }

  function start() { cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame); }

  readColors();
  resize();
  if (reduce) { frame(0); }
  else start();

  let rt = null;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { resize(); if (reduce) frame(0); }, 150); });
  addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  document.addEventListener("pointerleave", () => { mouse.x = mouse.y = -1e4; });
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancelAnimationFrame(raf); else if (!reduce) start(); });
  // theme toggle (data-theme) or OS theme change -> new colours
  new MutationObserver(() => { readColors(); if (reduce) frame(0); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColors(); if (reduce) frame(0); });
})();
