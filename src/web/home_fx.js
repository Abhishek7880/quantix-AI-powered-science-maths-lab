/* Home page motion: reveal-on-scroll, count-up stats, "Upload" CTA, subtle hero parallax. */
(function () {
  "use strict";
  const API = "/api/v1";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;

  // ---- reveal sections as they scroll into view (html.js-reveal is set in <head> so nothing flashes)
  const items = [...document.querySelectorAll(".reveal")];
  if (reduce || !("IntersectionObserver" in window)) items.forEach((el) => el.classList.add("in"));
  else {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    items.forEach((el, i) => { el.style.transitionDelay = `${Math.min(i, 4) * 70}ms`; io.observe(el); });
  }

  // ---- stats: live numbers from the API, counted up when visible
  const fmt = (n) => n.toLocaleString("en-IN");
  function countUp(el, to) {
    if (reduce) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 1400;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur), eased = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(to * eased));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  async function stats() {
    const out = {};
    try {
      const [sum, calc] = await Promise.all([
        fetch(`${API}/formulas`).then((r) => r.json()),
        fetch(`${API}/formulas/calc/index`).then((r) => r.json()),
      ]);
      if (sum.success) {
        out.formulas = sum.data.reduce((a, c) => a + c.formulas, 0);
        const m = sum.data.find((c) => c.id === "mensuration");
        if (m) out.shapes = m.sections - 1;                           // last section is unit conversions
      }
      if (calc.success) out.calc = Object.values(calc.data).reduce((a, c) => a + Object.values(c).reduce((b, v) => b + v.length, 0), 0);
    } catch (_) { /* API offline: keep the dashes */ }
    if (window.UNIT_DATA) out.units = window.UNIT_DATA.reduce((a, q) => a + q.units.length, 0);
    const box = document.querySelector(".stats");
    if (!box) return;
    const run = () => box.querySelectorAll("[data-count]").forEach((el) => {
      const v = out[el.dataset.count];
      if (v) countUp(el, v);
    });
    if (reduce || !("IntersectionObserver" in window)) { run(); return; }
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { run(); io.disconnect(); } });
    io.observe(box);
  }
  stats();

  // ---- "Upload an image" / Image Inspection tile: scroll to the drop zone and focus it
  document.querySelectorAll("[data-goto-drop]").forEach((a) => a.addEventListener("click", (e) => {
    const drop = document.getElementById("drop");
    if (!drop) return;
    e.preventDefault();
    drop.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    setTimeout(() => { drop.focus({ preventScroll: true }); drop.classList.add("ping"); setTimeout(() => drop.classList.remove("ping"), 1600); }, reduce ? 0 : 450);
  }));

  // ---- hero visual: gentle parallax with the pointer; SVG animations off for reduced motion
  const vis = document.querySelector(".hero-visual");
  if (vis) {
    const svg = vis.querySelector("svg");
    if (reduce && svg && svg.pauseAnimations) svg.pauseAnimations();
    if (!reduce) {
      let raf = 0;
      addEventListener("pointermove", (e) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
          vis.style.transform = `translate3d(${x * -14}px, ${y * -10}px, 0) rotateX(${y * 6}deg) rotateY(${x * -8}deg)`;
        });
      }, { passive: true });
    }
    orbitAndSwap(vis, svg);
  }

  // ---- hero atom: a new symbol on each electron after every full orbit, new formulas on the cards every 5 s,
  //      and the cards travel slowly round the outer ring (upright, 90 s per lap)
  function orbitAndSwap(vis, svg) {
    const SYMBOLS = ["π", "∑", "∫", "∂", "∞", "Δ", "θ", "λ", "Ω", "μ", "∇", "φ", "α", "β", "γ", "σ", "ω", "ħ", "√", "≈"];
    const FORMULAS = ["E = mc²", "a² + b² = c²", "V = ⅓πr²h", "λ = h / p", "F = ma", "PV = nRT", "A = πr²", "v = u + at",
      "s = ut + ½at²", "V = IR", "E = hν", "p = mv", "KE = ½mv²", "c = fλ", "V = ⁴⁄₃πr³", "T = 2π√(l/g)",
      "F = Gm₁m₂/r²", "Δx·Δp ≥ ħ/2", "e^(iπ) + 1 = 0", "W = Fd cos θ", "F = −kx", "Q = mcΔT", "P = VI"];
      // short ones only: the widest card decides how much room the atom gets
    const chips = [...vis.querySelectorAll(".chip-f")];
    chips.forEach((c) => { const s = document.createElement("span"); s.textContent = c.textContent; c.replaceChildren(s); });
    const swap = (el, text, cls = "swap") => {
      if (reduce) { el.textContent = text; return; }
      el.classList.add(cls);
      setTimeout(() => { el.textContent = text; el.classList.remove(cls); }, 350);
    };
    const pick = (pool, shown) => { const free = pool.filter((x) => !shown.includes(x)); return free[Math.floor(Math.random() * free.length)]; };

    // formulas: every 5 s, one after another (250 ms apart), never two cards with the same formula
    let fIdx = FORMULAS.length;                                   // cycle in a shuffled order, then reshuffle
    let order = [];
    const nextFormula = () => {
      if (fIdx >= order.length) { order = FORMULAS.slice().sort(() => Math.random() - 0.5); fIdx = 0; }
      const shown = chips.map((c) => c.firstChild.textContent);
      while (shown.includes(order[fIdx]) && fIdx < order.length - 1) fIdx++;
      return order[fIdx++];
    };
    setInterval(() => {
      if (document.hidden) return;
      chips.forEach((c, i) => setTimeout(() => {
        const t = nextFormula();
        if (reduce) { c.firstChild.textContent = t; return; }
        c.classList.add("swap");
        setTimeout(() => { c.firstChild.textContent = t; c.classList.remove("swap"); }, 350);
      }, i * 250));
    }, 5000);

    // electron symbols: count each electron's laps from the SVG clock
    const electrons = [...svg.querySelectorAll("animateMotion")].map((a) => ({
      anim: a, dur: parseFloat(a.getAttribute("dur")) || 8, text: a.parentNode.querySelector(".e-sym"), lap: null }));
    const lapCheck = () => {
      if (!svg.getCurrentTime) return;
      const now = svg.getCurrentTime();
      electrons.forEach((e) => {
        let start = 0;
        try { start = e.anim.getStartTime(); } catch (_) { return; }      // not started yet
        const lap = Math.floor((now - start) / e.dur);
        if (e.lap !== null && lap !== e.lap && e.text) swap(e.text, pick(SYMBOLS, electrons.map((x) => x.text && x.text.textContent)));
        e.lap = lap;
      });
    };

    // cards OUTSIDE the atom: each card's centre sits far enough out that its box never touches the atom's
    // circle (radius ATOM × half the drawing — just past the orbits and electron symbols; only the faint dotted
    // ring lies beyond), whatever its size and angle. The drawing is sized so the widest formula still fits beside
    // it. Too narrow for that (phones): one card above, one below.
    if (reduce) { setInterval(lapCheck, 500); return; }
    vis.classList.add("orbiting");
    const stage = vis.parentElement, ATOM = 0.9, GAP = 10;
    let mode = "ring", W = 0, rA = 0, maxCw = 0, ch = 0;
    const widest = () => {                                         // widest formula card, measured once with a clone
      const probe = chips[0].cloneNode(true);
      Object.assign(probe.style, { visibility: "hidden", transform: "none", left: "0", top: "0" });
      vis.append(probe);
      let w = 0;
      FORMULAS.forEach((f) => { probe.firstChild.textContent = f; w = Math.max(w, probe.offsetWidth); });
      ch = probe.offsetHeight;
      probe.remove();
      return w;
    };
    const layout = () => {
      vis.style.width = ""; vis.style.margin = "";
      maxCw = widest();
      const half = stage.clientWidth / 2;
      rA = Math.min(half - maxCw - GAP * 2, 215);                  // atom radius that leaves room for a card at the side
      mode = rA >= 130 ? "ring" : "stack";
      if (mode === "ring") {
        W = (2 * rA) / ATOM;
        vis.style.width = `${W}px`;
        vis.style.margin = `${ch + GAP * 2}px 0`;                  // room above / below for the cards
      } else {
        W = vis.offsetWidth;
        vis.style.margin = `${ch + GAP * 2}px 0`;
      }
      chips.forEach((c, i) => { c.hidden = mode === "stack" && i > 1; });
    };
    layout();
    addEventListener("resize", layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);   // widths change once fonts load
    const base = [-2.4, -0.55, 2.3, 0.75];                         // starting angles ≈ the old corner spots
    const LAP_MS = 90000, t0 = performance.now();
    let lastLap = 0;
    const frame = (now) => {
      const a0 = ((now - t0) / LAP_MS) * Math.PI * 2;
      chips.forEach((c, i) => {
        if (c.hidden) return;
        const cw = c.offsetWidth, h = c.offsetHeight;
        let x, y;
        if (mode === "ring") {
          const a = (base[i] ?? i * 1.57) + a0, cos = Math.cos(a), sin = Math.sin(a);
          const d = rA + Math.abs(cos) * cw / 2 + Math.abs(sin) * h / 2 + GAP;   // box just clears the atom circle
          x = W / 2 + cos * d - cw / 2; y = W / 2 + sin * d - h / 2;
        } else {
          x = W / 2 - cw / 2; y = i === 0 ? -h - GAP : W + GAP;
        }
        c.style.transform = `translate(${x}px, ${y}px)`;
      });
      if (now - lastLap > 200) { lastLap = now; lapCheck(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  root.classList.add("fx-ready");
})();
