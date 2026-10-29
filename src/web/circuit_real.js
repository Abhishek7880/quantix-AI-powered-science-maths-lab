/* Quantix Circuit Lab — the realistic look: parts drawn like the real thing on a perforated board (or a breadboard),
   with insulated coloured wires. Pure canvas drawing (no images), so it stays sharp at any zoom and works offline.
   Used by circuit_ui.js when the "Realistic" view is on:
       CircuitReal.board(ctx, view, W, H, colour)          perfboard background
       CircuitReal.wire(ctx, x1, y1, x2, y2, colour, sc, selected)
       CircuitReal.part(g, part, info, env)                -> false if the part keeps its schematic symbol
   g is the editor's pen (local grid units of the part -> screen, rotation and flip applied). */
(function () {
  "use strict";

  const WIRE_COLOURS = [["red", "#d62828"], ["black", "#262a30"], ["blue", "#1f6feb"], ["green", "#2da44e"], ["yellow", "#e3b341"],
    ["orange", "#f0883e"], ["white", "#e8eaed"], ["purple", "#8957e5"]];
  const BOARDS = { yellow: ["#d6cd6c", "#a99f45"], green: ["#2f7d4a", "#1f5634"], blue: ["#2d5a9e", "#1d3d6e"], white: ["#eceff3", "#b9c0ca"],
    black: ["#20242b", "#0d1014"], cream: ["#efe2c4", "#c7b48a"] };
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- drawing helpers (local part units)
  function rect(g, x1, y1, x2, y2) { const a = g.X(x1, y1), b = g.X(x2, y2); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])]; }
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function box(g, x1, y1, x2, y2, rad, fill, stroke, lw) {
    const r = rect(g, x1, y1, x2, y2), c = g.ctx;
    rr(c, r[0], r[1], r[2], r[3], rad * g.sc);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
  }
  // a gradient between two local points (it turns with the part)
  function grad(g, x1, y1, x2, y2, stops) {
    const a = g.X(x1, y1), b = g.X(x2, y2), gr = g.ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    stops.forEach((s, k) => gr.addColorStop(k / (stops.length - 1), s));
    return gr;
  }
  function radial(g, x, y, r, stops) {
    const c = g.X(x, y), R = r * g.sc, gr = g.ctx.createRadialGradient(c[0] - R * 0.3, c[1] - R * 0.35, R * 0.05, c[0], c[1], R);
    stops.forEach((s, k) => gr.addColorStop(k / (stops.length - 1), s));
    return gr;
  }
  function disc(g, x, y, r, fill, stroke, lw) {
    const c = g.X(x, y), ctx = g.ctx;
    ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(0.5, r * g.sc), 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function poly(g, pts, fill, stroke, lw) {
    const ctx = g.ctx; ctx.beginPath();
    for (let k = 0; k < pts.length; k += 2) { const s = g.X(pts[k], pts[k + 1]); k ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  // a tinned component lead: dark edge + bright core
  function lead(g, ...pts) {
    const ctx = g.ctx;
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#6b737d"; ctx.lineWidth = Math.max(1.6, g.sc * 0.14); g.line(...pts);
    ctx.strokeStyle = "#dfe3e8"; ctx.lineWidth = Math.max(0.7, g.sc * 0.05); g.line(...pts);
    ctx.restore();
  }
  function solder(g, x, y) { disc(g, x, y, 0.2, radial(g, x, y, 0.2, ["#ffffff", "#c3c9cf", "#7d858d"])); }
  function txt(g, x, y, s, size, colour, weight) { g.text(x, y, s, size, colour || "#fff", "center", weight || "700"); }
  function shadow(g, x1, y1, x2, y2, rad) {
    const ctx = g.ctx; ctx.save(); ctx.globalAlpha = 0.28; ctx.filter = "blur(" + Math.max(1, g.sc * 0.12) + "px)";
    box(g, x1 + 0.12, y1 + 0.18, x2 + 0.12, y2 + 0.18, rad, "#000"); ctx.restore();
  }
  function glow(g, x, y, r, colour, a) {
    if (!(a > 0.02)) return;
    const c = g.X(x, y), R = r * g.sc, ctx = g.ctx, gr = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], R);
    gr.addColorStop(0, colour); gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save(); ctx.globalAlpha = Math.min(1, a); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, TAU); ctx.fill(); ctx.restore();
  }
  function lcd(g, x1, y1, x2, y2, text, colour) {
    box(g, x1, y1, x2, y2, 0.12, "#0b1a10", "#2b3a30", 1);
    const r = rect(g, x1, y1, x2, y2), ctx = g.ctx, fs = Math.max(8, Math.min(r[3] * 0.72, r[2] / Math.max(4, String(text).length) * 1.55));
    ctx.save(); ctx.fillStyle = colour || "#7CFFB2"; ctx.font = "700 " + fs + "px JetBrains Mono, ui-monospace, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.shadowColor = colour || "#7CFFB2"; ctx.shadowBlur = 4;
    ctx.fillText(text, r[0] + r[2] / 2, r[1] + r[3] / 2 + 1); ctx.restore();
  }
  const cylinder = (g, x1, y1, x2, y2, cols, rad) => box(g, x1, y1, x2, y2, rad == null ? (y2 - y1) / 2 : rad, grad(g, 0, y1, 0, y2, cols));
  const plastic = (base) => ["rgba(255,255,255,.18)", base, base, "rgba(0,0,0,.35)"];

  // ---------------------------------------------------------------- the board
  let pat = null, patKey = "";
  function board(ctx, view, W, H, colour) {
    const c = BOARDS[colour] || BOARDS.yellow, sc = view.scale;
    ctx.fillStyle = c[0]; ctx.fillRect(0, 0, W, H);
    if (sc < 7) return;
    const key = colour + "|" + sc.toFixed(2);
    if (key !== patKey) {   // one grid cell with a plated hole, repeated by a pattern: thousands of holes, one fill
      const n = Math.max(2, Math.round(sc)), cv = document.createElement("canvas"); cv.width = cv.height = n;
      const x = cv.getContext("2d"), r = Math.max(1.2, n * 0.13);
      x.fillStyle = c[0]; x.fillRect(0, 0, n, n);
      x.fillStyle = c[1]; x.beginPath(); x.arc(n / 2, n / 2, r * 1.9, 0, TAU); x.fill();
      x.fillStyle = "rgba(255,255,255,.18)"; x.beginPath(); x.arc(n / 2 - r * 0.4, n / 2 - r * 0.4, r * 1.5, 0, TAU); x.fill();
      x.fillStyle = "#3a3320"; x.beginPath(); x.arc(n / 2, n / 2, r, 0, TAU); x.fill();
      pat = { p: ctx.createPattern(cv, "repeat"), n: n }; patKey = key;
    }
    ctx.save();
    const s = sc / pat.n;
    ctx.translate(view.ox - sc / 2, view.oy - sc / 2); ctx.scale(s, s);
    ctx.fillStyle = pat.p;
    ctx.fillRect(-(view.ox - sc / 2) / s, -(view.oy - sc / 2) / s, W / s, H / s);
    ctx.restore();
  }

  // ---------------------------------------------------------------- insulated wire
  function wire(ctx, x1, y1, x2, y2, colour, sc, sel) {
    const w = Math.max(3, sc * 0.3);
    ctx.save(); ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = w + 2; ctx.beginPath(); ctx.moveTo(x1 + 1, y1 + 2); ctx.lineTo(x2 + 1, y2 + 2); ctx.stroke();
    ctx.strokeStyle = sel ? "#38bdf8" : colour; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = Math.max(1, w * 0.25);   // shine along the insulation
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ox = (-dy / L) * w * 0.22, oy = (dx / L) * w * 0.22;
    ctx.beginPath(); ctx.moveTo(x1 - ox, y1 - oy); ctx.lineTo(x2 - ox, y2 - oy); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- parts
  const D = {
    resistor(g, p, info, env) {
      lead(g, -2, 0, -1.2, 0); lead(g, 1.2, 0, 2, 0);
      if (p.p.pkg === "smd") {
        box(g, -1.0, -0.5, 1.0, 0.5, 0.08, "#1b1d21"); box(g, -1.2, -0.5, -0.8, 0.5, 0.06, "#cfd4da"); box(g, 0.8, -0.5, 1.2, 0.5, 0.06, "#cfd4da");
        txt(g, 0, 0, env.smd(+p.p.R), 0.5, "#f1f1f1");
      } else {
        shadow(g, -1.45, -0.45, 1.45, 0.45, 0.4);
        cylinder(g, -1.45, -0.45, 1.45, 0.45, ["#f3e2b8", "#e2c58e", "#c8a76a", "#9b7c45"]);
        env.bands(+p.p.R, +p.p.tol).forEach((b, k) => { const x = [-0.85, -0.42, 0.01, 0.82][k]; box(g, x - 0.1, -0.45, x + 0.1, 0.45, 0.02, grad(g, 0, -0.45, 0, 0.45, ["rgba(255,255,255,.25)", b[0], b[0], "rgba(0,0,0,.4)"])); });
      }
      if (info && info.heat > 0.6) glow(g, 0, 0, 1.8, "rgba(255,90,30,.9)", (info.heat - 0.6) * 1.6);
    },
    pot(g, p) {
      lead(g, -2, 0, -1, 0); lead(g, 2, 0, 1, 0); lead(g, 0, -2, 0, -1.1);
      shadow(g, -1.3, -1.2, 1.3, 1.1, 0.2);
      box(g, -1.3, -1.2, 1.3, 1.1, 0.2, grad(g, 0, -1.2, 0, 1.1, plastic("#2560c8")));
      disc(g, 0, 0, 0.82, radial(g, 0, 0, 0.82, ["#ffffff", "#e8e8e8", "#a9adb3"]), "#7d838b");
      const a = (-135 + 270 * Math.min(1, Math.max(0, (+p.p.pos || 0) / 100))) * Math.PI / 180, c = g.X(0, 0), R = 0.62 * g.sc, ctx = g.ctx;
      ctx.save(); ctx.strokeStyle = "#333"; ctx.lineWidth = Math.max(1.5, g.sc * 0.12); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(c[0] - Math.sin(a) * R, c[1] + Math.cos(a) * R); ctx.lineTo(c[0] + Math.sin(a) * R, c[1] - Math.cos(a) * R); ctx.stroke(); ctx.restore();
    },
    ldr(g) {
      lead(g, -2, 0, -0.75, 0); lead(g, 0.75, 0, 2, 0);
      disc(g, 0, 0, 0.95, radial(g, 0, 0, 0.95, ["#fff7e6", "#f1c27d", "#c9853b"]), "#9a6a2c");
      const ctx = g.ctx; ctx.save(); ctx.strokeStyle = "#8a2f1a"; ctx.lineWidth = Math.max(1, g.sc * 0.08); ctx.lineJoin = "round";
      g.line(-0.55, -0.45, 0.55, -0.45, 0.55, -0.15, -0.55, -0.15, -0.55, 0.15, 0.55, 0.15, 0.55, 0.45, -0.55, 0.45); ctx.restore();
    },
    ntc(g) { lead(g, -2, 0, -0.45, 0); lead(g, 0.45, 0, 2, 0); disc(g, 0, 0, 0.55, radial(g, 0, 0, 0.55, ["#6ee7a8", "#1f8f55", "#0d4a2b"])); },
    capacitor(g, p, info, env) {
      lead(g, -2, 0, -0.35, 0); lead(g, 0.35, 0, 2, 0);
      shadow(g, -0.8, -1.0, 0.8, 1.0, 0.8);
      box(g, -0.8, -1.0, 0.8, 1.0, 0.8, radial(g, 0, 0, 1.1, ["#f2a65a", "#d2691e", "#8b4513"]));
      txt(g, 0, 0, env.capCode(+p.p.C), 0.45, "#3b1d07");
    },
    electrolytic(g, p, info, env) {
      lead(g, -2, 0, -1.25, 0); lead(g, 1.25, 0, 2, 0);
      shadow(g, -1.3, -0.8, 1.3, 0.8, 0.25);
      box(g, -1.3, -0.8, 1.3, 0.8, 0.25, grad(g, 0, -0.8, 0, 0.8, ["#5b7fd6", "#1d3b8a", "#162d6b", "#0b1838"]));
      box(g, 0.55, -0.8, 1.0, 0.8, 0.02, "rgba(220,228,245,.85)");
      txt(g, 0.78, -0.35, "−", 0.45, "#1d3b8a"); txt(g, 0.78, 0.35, "−", 0.45, "#1d3b8a");
      txt(g, -0.35, 0, env.fmt(+p.p.C, "F").replace(" ", ""), 0.42, "#e6ecff");
      if (info && info.burnt) glow(g, 0, 0, 1.6, "rgba(120,120,120,.8)", 0.8);
    },
    inductor(g) {
      lead(g, -2, 0, -1.4, 0); lead(g, 1.4, 0, 2, 0);
      cylinder(g, -1.4, -0.42, 1.4, 0.42, ["#5a5f66", "#2c3036", "#15181c"]);
      const ctx = g.ctx; ctx.save(); ctx.lineWidth = Math.max(1.5, g.sc * 0.16); ctx.lineCap = "round";
      for (let k = 0; k < 9; k++) { const x = -1.2 + k * 0.3; ctx.strokeStyle = k % 2 ? "#b8682a" : "#d98b46"; g.line(x, -0.5, x + 0.12, 0.5); }
      ctx.restore();
    },
    transformer(g) {
      lead(g, -2, -2, -1.3, -2, -1.3, -1.2); lead(g, -2, 2, -1.3, 2, -1.3, 1.2); lead(g, 2, -2, 1.3, -2, 1.3, -1.2); lead(g, 2, 2, 1.3, 2, 1.3, 1.2);
      shadow(g, -1.6, -1.9, 1.6, 1.9, 0.1);
      box(g, -1.6, -1.9, 1.6, 1.9, 0.1, grad(g, -1.6, 0, 1.6, 0, ["#8d939a", "#c4c9cf", "#7a8087"]));
      for (let k = -1.6; k <= 1.6; k += 0.27) { g.ctx.strokeStyle = "rgba(0,0,0,.18)"; g.ctx.lineWidth = 1; g.line(-1.6, k, 1.6, k); }
      box(g, -1.35, -1.2, -0.25, 1.2, 0.15, grad(g, -1.35, 0, -0.25, 0, ["#7a3d10", "#d98b46", "#7a3d10"]));
      box(g, 0.25, -1.2, 1.35, 1.2, 0.15, grad(g, 0.25, 0, 1.35, 0, ["#7a3d10", "#d98b46", "#7a3d10"]));
    },
    battery(g, p, info, env) {
      lead(g, 0, -2, 0, -1.6); lead(g, 0, 1.6, 0, 2);
      shadow(g, -1.0, -1.6, 1.0, 1.6, 0.2);
      box(g, -1.0, -1.6, 1.0, 1.6, 0.2, grad(g, -1.0, 0, 1.0, 0, ["#1a1a1a", "#4a4a4a", "#222", "#000"]));
      box(g, -1.0, -1.6, 1.0, -0.55, 0.2, grad(g, -1.0, 0, 1.0, 0, ["#8b0000", "#e53935", "#b71c1c", "#5c0000"]));
      box(g, -0.35, -1.85, 0.35, -1.6, 0.06, "#c9a227");
      txt(g, 0, -1.08, "+", 0.6, "#fff");
      lcdLike(g, -0.85, -0.25, 0.85, 0.55, env.fmt(+p.p.V, "V").replace(" ", ""));
      txt(g, 0, 1.15, "−", 0.6, "#bbb");
    },
    dcsupply(g, p, info, env) {
      lead(g, 0, -2, 0, -1.9); lead(g, 0, 1.9, 0, 2);
      shadow(g, -1.6, -1.9, 1.6, 1.9, 0.18);
      box(g, -1.6, -1.9, 1.6, 1.9, 0.18, grad(g, 0, -1.9, 0, 1.9, ["#e7eaee", "#c4cad1", "#9aa2ab"]));
      lcd(g, -1.35, -1.6, 1.35, -0.7, info ? env.fmt(info.v, "V").replace(" ", "") : env.fmt(+p.p.V, "V").replace(" ", ""));
      lcd(g, -1.35, -0.55, 1.35, 0.3, info ? env.fmt(Math.abs(info.i), "A").replace(" ", "") : "0A", "#ffb547");
      disc(g, -0.6, 1.05, 0.38, radial(g, -0.6, 1.05, 0.38, ["#ff8a80", "#d32f2f", "#7f0000"])); disc(g, 0.6, 1.05, 0.38, radial(g, 0.6, 1.05, 0.38, ["#9e9e9e", "#212121", "#000"]));
      const cc = info && info.rows && info.rows[0] && info.rows[0][1] === "CC";
      disc(g, 1.25, 1.55, 0.12, cc ? "#ff5252" : "#69f0ae");
    },
    acsource(g, p, info, env) {
      lead(g, 0, -2, 0, -1.9); lead(g, 0, 1.9, 0, 2);
      shadow(g, -1.7, -1.9, 1.7, 1.9, 0.18);
      box(g, -1.7, -1.9, 1.7, 1.9, 0.18, grad(g, 0, -1.9, 0, 1.9, ["#3b4652", "#232b33", "#151a1f"]));
      box(g, -1.45, -1.6, 1.45, 0.2, 0.1, "#0b1a10", "#2b3a30");
      const ctx = g.ctx; ctx.save(); ctx.strokeStyle = "#7CFFB2"; ctx.lineWidth = Math.max(1, g.sc * 0.07); ctx.beginPath();
      for (let k = 0; k <= 40; k++) { const x = -1.3 + 2.6 * k / 40, fr = (k / 20) % 1; let w;
        switch (p.p.wave) { case "square": w = fr < 0.5 ? 1 : -1; break; case "triangle": w = fr < 0.25 ? 4 * fr : fr < 0.75 ? 2 - 4 * fr : 4 * fr - 4; break; case "saw": w = 2 * fr - 1; break; default: w = Math.sin(fr * TAU); }
        const s = g.X(x, -0.7 - w * 0.6); k ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }
      ctx.stroke(); ctx.restore();
      txt(g, 0, 0.75, env.fmt(+p.p.f, "Hz").replace(" ", ""), 0.5, "#e6edf3"); txt(g, 0, 1.4, env.fmt(+p.p.Vp, "V").replace(" ", "") + " pk", 0.4, "#9fb1c4");
    },
    isource(g, p, info, env) {
      lead(g, 0, -2, 0, -1.3); lead(g, 0, 1.3, 0, 2);
      shadow(g, -1.2, -1.3, 1.2, 1.3, 0.25);
      box(g, -1.2, -1.3, 1.2, 1.3, 0.25, grad(g, 0, -1.3, 0, 1.3, plastic("#6d28d9")));
      const ctx = g.ctx; ctx.save(); ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.lineWidth = Math.max(1.5, g.sc * 0.12);
      g.line(0, 0.7, 0, -0.5); poly(g, [0, -0.85, -0.3, -0.4, 0.3, -0.4], "#fff"); ctx.restore();
      txt(g, 0, 1.0, env.fmt(+p.p.I, "A").replace(" ", ""), 0.38, "#eee");
    },
    ground(g) {
      lead(g, 0, 0, 0, 0.5);
      const ctx = g.ctx; ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = "#2da44e"; ctx.lineWidth = Math.max(2, g.sc * 0.16);
      g.line(-0.8, 0.55, 0.8, 0.55); g.line(-0.5, 0.85, 0.5, 0.85); g.line(-0.2, 1.15, 0.2, 1.15); ctx.restore();
    },
    diode(g, p, info, env, kind) {
      lead(g, -2, 0, -0.9, 0); lead(g, 0.9, 0, 2, 0);
      if (kind === "zener") {
        cylinder(g, -0.9, -0.38, 0.9, 0.38, ["#ffe0b2", "#ff9800", "#e65100", "#8d3b00"]);
        box(g, 0.45, -0.38, 0.7, 0.38, 0.02, "#111");
      } else {
        cylinder(g, -0.9, -0.38, 0.9, 0.38, ["#555", "#1a1a1a", "#0d0d0d", "#000"]);
        box(g, 0.45, -0.38, 0.7, 0.38, 0.02, grad(g, 0, -0.38, 0, 0.38, ["#fff", "#cfd4da", "#8e959d"]));
      }
    },
    led(g, p, info, env) {
      const col = env.ledRGB[p.p.color] || "#ff3030", lit = info && !info.burnt ? Math.min(1.2, info.glow || 0) : 0;
      lead(g, -2, 0, -0.5, 0); lead(g, 0.5, 0, 2, 0);
      glow(g, 0, 0, 2.6, col, lit * 0.9);
      disc(g, 0, 0, 0.82, "rgba(0,0,0,.25)");
      disc(g, 0, 0, 0.75, radial(g, 0, 0, 0.75, lit > 0.05 ? ["#ffffff", col, col] : ["rgba(255,255,255,.75)", shade(col, 0.55), shade(col, 0.3)]), "rgba(0,0,0,.35)");
      const c = g.X(0.62, 0), ctx = g.ctx; ctx.save(); ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = Math.max(1, g.sc * 0.06); g.line(0.6, -0.45, 0.6, 0.45); ctx.restore(); void c;
      if (info && info.burnt) disc(g, 0, 0, 0.5, "rgba(40,30,20,.75)");
    },
    bjt(g, p, info, env) {
      lead(g, -2, 0, -0.4, 0); lead(g, 1, -2, 1, -1.0, 0.45, -0.55); lead(g, 1, 2, 1, 1.0, 0.45, 0.55);
      shadow(g, -0.5, -1.0, 1.0, 1.0, 0.1);
      const ctx = g.ctx; ctx.save();
      const c = g.X(0.25, 0); ctx.beginPath();
      const a0 = (p.rot || 0) * Math.PI / 2 + (p.flip ? Math.PI : 0);
      ctx.arc(c[0], c[1], 1.0 * g.sc, a0 - Math.PI / 2, a0 + Math.PI / 2); ctx.closePath();
      ctx.fillStyle = grad(g, -0.7, 0, 1.25, 0, ["#4a4a4a", "#1c1c1c", "#0a0a0a"]); ctx.fill(); ctx.restore();
      txt(g, 0.55, 0, p.type === "npn" ? "547" : "557", 0.38, "#cfd2d6", "600");
    },
    mos(g, p) {
      lead(g, -2, 0, -0.9, 0); lead(g, 1, -2, 1, -1.4); lead(g, 1, 2, 1, 1.4);
      shadow(g, -0.9, -1.4, 1.6, 1.4, 0.1);
      box(g, 1.0, -1.4, 1.75, 1.4, 0.08, grad(g, 1.0, 0, 1.75, 0, ["#e6e9ec", "#a6adb4", "#7b828a"]));
      disc(g, 1.38, 0, 0.22, "#5b6168");
      box(g, -0.9, -1.4, 1.0, 1.4, 0.08, grad(g, -0.9, 0, 1.0, 0, ["#3a3a3a", "#151515", "#050505"]));
      txt(g, 0.05, 0, p.type === "nmos" ? "Z44N" : "9540", 0.36, "#cfd2d6", "600");
    },
    chip(g, p, info, env, name) {
      const def = env.PARTS[p.type], pins = def.pins, xs = pins.map((q) => q[0]), ys = pins.map((q) => q[1]);
      const x1 = Math.min(-1.2, Math.min(...xs) + 0.9), x2 = Math.max(1.2, Math.max(...xs) - 0.9), y1 = Math.min(-1.0, Math.min(...ys) - 0.7), y2 = Math.max(1.0, Math.max(...ys) + 0.7);
      pins.forEach((q) => {   // legs from the body to each pin
        const tx = q[0] < x1 ? x1 : q[0] > x2 ? x2 : q[0], ty = q[1] < y1 ? y1 : q[1] > y2 ? y2 : q[1];
        lead(g, q[0], q[1], tx, ty);
      });
      shadow(g, x1, y1, x2, y2, 0.15);
      box(g, x1, y1, x2, y2, 0.15, grad(g, 0, y1, 0, y2, ["#3d3f44", "#1c1d20", "#0d0e10"]));
      const n = g.X(x1, 0); g.ctx.save(); g.ctx.fillStyle = "#08090a"; g.ctx.beginPath(); g.ctx.arc(n[0], n[1], 0.35 * g.sc, 0, TAU); g.ctx.fill(); g.ctx.restore();
      txt(g, (x1 + x2) / 2, (y1 + y2) / 2, name, Math.min(0.55, (x2 - x1) / Math.max(4, name.length) * 1.6), "#d5d8dc", "600");
      if (info && info.glow > 0.05) disc(g, x2 - 0.35, y1 + 0.35, 0.12, "#ff5252");
    },
    switch(g, p) {
      const on = p.p.on === true || p.p.on === "true";
      lead(g, -2, 0, -1.3, 0); lead(g, 1.3, 0, 2, 0);
      shadow(g, -1.35, -0.8, 1.35, 0.8, 0.2);
      box(g, -1.35, -0.8, 1.35, 0.8, 0.2, grad(g, 0, -0.8, 0, 0.8, ["#5b6168", "#2b3036", "#16191c"]));
      box(g, -1.0, -0.55, 1.0, 0.55, 0.12, "#0b0d10");
      const x = on ? 0.15 : -1.0;
      box(g, x, -0.5, x + 0.85, 0.5, 0.1, grad(g, x, 0, x + 0.85, 0, on ? ["#ff8a80", "#e53935", "#8e0000"] : ["#9e9e9e", "#5f6368", "#2a2d31"]));
      txt(g, on ? -0.5 : 0.55, 0, on ? "I" : "O", 0.5, on ? "#7CFFB2" : "#9aa0a6");
    },
    button(g, p) {
      const on = p.p.on === true || p.p.on === "true";
      lead(g, -2, 0, -1.0, 0); lead(g, 1.0, 0, 2, 0);
      shadow(g, -1.1, -1.1, 1.1, 1.1, 0.15);
      box(g, -1.1, -1.1, 1.1, 1.1, 0.15, grad(g, 0, -1.1, 0, 1.1, ["#cfd4da", "#8e959d", "#5b6168"]));
      disc(g, 0, 0, on ? 0.68 : 0.78, radial(g, 0, 0, 0.78, on ? ["#c62828", "#8e0000", "#4a0000"] : ["#ff8a80", "#e53935", "#8e0000"]), "rgba(0,0,0,.4)");
    },
    spdt(g, p) {
      lead(g, -2, 0, -1.2, 0); lead(g, 2, -1, 1.2, -1, 1.2, -0.6); lead(g, 2, 1, 1.2, 1, 1.2, 0.6);
      shadow(g, -1.3, -0.65, 1.3, 0.65, 0.15);
      box(g, -1.3, -0.65, 1.3, 0.65, 0.15, grad(g, 0, -0.65, 0, 0.65, ["#4a4f55", "#202429", "#0e1013"]));
      const x = p.p.pos === "B" ? 0.1 : -0.9;
      box(g, x, -0.42, x + 0.8, 0.42, 0.08, grad(g, x, 0, x + 0.8, 0, ["#ffffff", "#d7dbe0", "#9aa1a9"]));
      txt(g, 1.55, -1.45, "A", 0.38, "#555"); txt(g, 1.55, 1.45, "B", 0.38, "#555");
    },
    relay(g, p, info) {
      const on = info && info.rows && info.rows[1] && info.rows[1][1] === "NO";
      [[-3, -2], [-3, 2], [3, 2], [3, -2], [3, 0]].forEach((q) => lead(g, q[0], q[1], q[0] < 0 ? -2.3 : 2.3, q[1]));
      shadow(g, -2.4, -1.9, 2.4, 1.9, 0.15);
      box(g, -2.4, -1.9, 2.4, 1.9, 0.15, grad(g, 0, -1.9, 0, 1.9, plastic("#1565c0")));
      txt(g, 0, -0.75, "SRD-" + String(Math.round(+p.p.Vcoil || 5)).padStart(2, "0") + "VDC", 0.42, "#e3f2fd");
      txt(g, 0, 0.1, "RELAY", 0.6, "#ffffff"); txt(g, 0, 0.9, "10A 250VAC", 0.36, "#bbdefb", "600");
      disc(g, 1.9, -1.45, 0.16, on ? "#69f0ae" : "#0d3b26");
    },
    fuse(g, p, info) {
      const blown = info && info.burnt;
      lead(g, -2, 0, -1.4, 0); lead(g, 1.4, 0, 2, 0);
      box(g, -1.15, -0.42, 1.15, 0.42, 0.18, "rgba(230,240,255,.35)", "rgba(255,255,255,.6)");
      const ctx = g.ctx; ctx.save(); ctx.strokeStyle = blown ? "#5d4037" : "#c0c6cc"; ctx.lineWidth = Math.max(1, g.sc * 0.05);
      if (blown) { g.line(-1.1, 0, -0.25, 0.1); g.line(0.25, -0.1, 1.1, 0); disc(g, 0, 0, 0.3, "rgba(60,40,30,.5)"); } else g.line(-1.1, 0, 1.1, 0);
      ctx.restore();
      cylinder(g, -1.5, -0.45, -0.95, 0.45, ["#f5f6f7", "#aab1b9", "#6f777f"], 0.08); cylinder(g, 0.95, -0.45, 1.5, 0.45, ["#f5f6f7", "#aab1b9", "#6f777f"], 0.08);
    },
    breaker(g, p, info) {
      const tripped = info && info.tripped, on = (p.p.on === true || p.p.on === "true") && !tripped;
      lead(g, 0, -2, 0, -1.75); lead(g, 0, 1.75, 0, 2);
      shadow(g, -1.0, -1.75, 1.0, 1.75, 0.12);
      box(g, -1.0, -1.75, 1.0, 1.75, 0.12, grad(g, -1.0, 0, 1.0, 0, ["#ffffff", "#eef0f2", "#c9ced4"]));
      disc(g, 0, -1.4, 0.16, "#9aa1a9"); disc(g, 0, 1.4, 0.16, "#9aa1a9");
      txt(g, 0, -0.85, (p.p.curve || "C") + String(Math.round(+p.p.Ir || 6)) + "A", 0.42, "#222");
      box(g, -0.55, -0.45, 0.55, 0.85, 0.08, "#2b2f35");
      const ty = on ? -0.4 : 0.35;
      box(g, -0.45, ty, 0.45, ty + 0.45, 0.06, grad(g, 0, ty, 0, ty + 0.45, on ? ["#ff7961", "#d32f2f"] : ["#d0d4d9", "#8e959d"]));
      box(g, -0.7, 1.0, 0.7, 1.25, 0.05, tripped ? "#ff1744" : on ? "#2e7d32" : "#9e9e9e");
      if (tripped) txt(g, 0, 1.6, "TRIP", 0.32, "#ff1744");
    },
    lamp(g, p, info) {
      const lit = info && !info.burnt ? Math.min(1.3, info.glow || 0) : 0;
      lead(g, -2, 0, -0.9, 0); lead(g, 0.9, 0, 2, 0);
      glow(g, 0, -0.2, 3.2, "rgba(255,210,90,1)", lit * 0.85);
      box(g, -0.55, 0.5, 0.55, 1.25, 0.12, grad(g, -0.55, 0, 0.55, 0, ["#8e959d", "#e0e4e8", "#7b828a"]));
      for (let k = 0; k < 3; k++) { g.ctx.strokeStyle = "rgba(0,0,0,.25)"; g.ctx.lineWidth = 1; g.line(-0.55, 0.68 + k * 0.2, 0.55, 0.62 + k * 0.2); }
      disc(g, 0, -0.35, 1.05, lit > 0.05 ? radial(g, 0, -0.35, 1.05, ["#fffbe6", "rgba(255,230,140," + (0.55 + lit * 0.4) + ")", "rgba(255,200,80," + (0.35 + lit * 0.4) + ")"]) : "rgba(225,235,245,.35)", "rgba(255,255,255,.75)", 1.2);
      const ctx = g.ctx; ctx.save(); ctx.lineWidth = Math.max(1, g.sc * 0.06); ctx.strokeStyle = lit > 0.05 ? "#fff3b0" : "#6d6d6d";
      g.line(-0.3, 0.5, -0.3, -0.35, -0.15, -0.55, 0, -0.35, 0.15, -0.55, 0.3, -0.35, 0.3, 0.5); ctx.restore();
      if (info && info.burnt) txt(g, 0, -0.35, "✕", 0.8, "#5d4037");
    },
    motor(g, p, info, env) {
      lead(g, -2, 0, -1.15, 0); lead(g, 1.15, 0, 2, 0);
      shadow(g, -1.15, -1.15, 1.15, 1.15, 1.15);
      disc(g, 0, 0, 1.15, radial(g, 0, 0, 1.15, ["#ffffff", "#c9ced4", "#7b828a"]), "#5b6168");
      disc(g, 0, 0, 0.45, "#c9a227", "#7a5d0b");
      const a = (env.state(p.id).ang || 0), c = g.X(0, 0), ctx = g.ctx;
      ctx.save(); ctx.strokeStyle = "#333"; ctx.lineWidth = Math.max(1.5, g.sc * 0.12); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0] + Math.cos(a) * 0.42 * g.sc, c[1] + Math.sin(a) * 0.42 * g.sc); ctx.stroke(); ctx.restore();
      txt(g, 0, 0.8, "M", 0.42, "#444");
    },
    fan(g, p, info, env) {
      lead(g, -2, 0, -1.65, 0); lead(g, 1.65, 0, 2, 0);
      shadow(g, -1.65, -1.65, 1.65, 1.65, 0.3);
      box(g, -1.65, -1.65, 1.65, 1.65, 0.3, grad(g, 0, -1.65, 0, 1.65, ["#4b5563", "#1f2937", "#111827"]));
      [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]].forEach((q) => disc(g, q[0], q[1], 0.14, "#0b0f14"));
      disc(g, 0, 0, 1.45, "#0b0f14");
      const a = env.state(p.id).ang || 0, c = g.X(0, 0), R = 1.35 * g.sc, ctx = g.ctx, spin = Math.abs((info && info.spin) || 0);
      ctx.save();
      for (let k = 0; k < 7; k++) {
        const b = a + k * TAU / 7;
        ctx.beginPath(); ctx.moveTo(c[0] + Math.cos(b) * R * 0.3, c[1] + Math.sin(b) * R * 0.3);
        ctx.quadraticCurveTo(c[0] + Math.cos(b + 0.55) * R * 0.95, c[1] + Math.sin(b + 0.55) * R * 0.95, c[0] + Math.cos(b + 0.28) * R, c[1] + Math.sin(b + 0.28) * R);
        ctx.lineTo(c[0] + Math.cos(b - 0.18) * R * 0.95, c[1] + Math.sin(b - 0.18) * R * 0.95); ctx.closePath();
        ctx.fillStyle = spin > 200 ? "rgba(96,165,250,.45)" : "#60a5fa"; ctx.fill();
      }
      ctx.restore();
      disc(g, 0, 0, 0.42, radial(g, 0, 0, 0.42, ["#e5e7eb", "#6b7280", "#374151"]));
    },
    buzzer(g, p, info) {
      lead(g, -2, 0, -1.05, 0); lead(g, 1.05, 0, 2, 0);
      shadow(g, -1.1, -1.1, 1.1, 1.1, 1.1);
      disc(g, 0, 0, 1.1, radial(g, 0, 0, 1.1, ["#555", "#1a1a1a", "#000"]), "#000");
      disc(g, 0, 0, 0.75, null, "rgba(255,255,255,.12)", 1); disc(g, 0, 0, 0.22, "#0a0a0a", "#333");
      txt(g, -0.6, -0.6, "+", 0.45, "#bbb");
      if (info && info.sound) {
        const ph = (performance.now() / 140) % 1, c = g.X(0, 0), ctx = g.ctx;
        ctx.save(); ctx.strokeStyle = "rgba(56,189,248,.8)"; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) { ctx.globalAlpha = 1 - ((k + ph) / 3); ctx.beginPath(); ctx.arc(c[0], c[1], (1.3 + (k + ph) * 0.45) * g.sc, -2.4, -0.75); ctx.stroke(); }
        ctx.restore();
      }
    },
    bell(g, p, info) {
      const ring = info && info.ring, sh = ring ? Math.sin(performance.now() / 30) * 0.12 : 0;
      lead(g, -2, 0, -1.0, 0); lead(g, 1.0, 0, 2, 0);
      box(g, -1.1, 0.75, 1.1, 1.15, 0.1, "#5b6168");
      const ctx = g.ctx; ctx.save();
      poly(g, [-1.05 + sh, 0.75, -0.75 + sh, -0.6, 0 + sh, -1.15, 0.75 + sh, -0.6, 1.05 + sh, 0.75], radial(g, sh, -0.3, 1.4, ["#fff4c2", "#f2c94c", "#a7781b"]), "#7a5d0b", 1.2);
      ctx.restore();
      disc(g, sh, -1.25, 0.16, "#a7781b");
      if (ring) { const c = g.X(0, -0.2); ctx.save(); ctx.strokeStyle = "rgba(242,201,76,.8)"; ctx.lineWidth = 2; for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.arc(c[0], c[1], (1.25 + k * 0.4) * g.sc, -2.6, -0.55); ctx.stroke(); } ctx.restore(); }
    },
    meter(g, p, info, env, letter) {
      lead(g, -2, 0, -1.3, 0); lead(g, 1.3, 0, 2, 0);
      shadow(g, -1.35, -0.85, 1.35, 0.85, 0.3);
      box(g, -1.35, -0.85, 1.35, 0.85, 0.3, grad(g, 0, -0.85, 0, 0.85, plastic(letter === "V" ? "#0277bd" : "#e0a800")));
      const r = info && info.reading != null ? env.fmt(info.reading, info.unit, 3).replace(" ", "") : "0" + letter;
      lcd(g, -1.1, -0.55, 1.1, 0.55, r);
      txt(g, -1.0, -1.15, "+", 0.45, "#d62828");
    },
    dmm(g, p, info, env) {
      const ctx = g.ctx;
      // probe leads: red from V/Ω/A, black from COM
      ctx.save(); ctx.lineCap = "round"; ctx.lineWidth = Math.max(2, g.sc * 0.16);
      ctx.strokeStyle = "#d62828"; g.line(-2, 0, -2, -0.6, -0.5, -0.6, -0.5, -0.9); ctx.strokeStyle = "#222"; g.line(2, 0, 2, -0.6, 0.5, -0.6, 0.5, -0.9); ctx.restore();
      shadow(g, -1.7, -4.4, 1.7, -0.9, 0.35);
      box(g, -1.7, -4.4, 1.7, -0.9, 0.35, grad(g, -1.7, 0, 1.7, 0, ["#ffd54f", "#fbc02d", "#c49000"]));
      box(g, -1.45, -4.2, 1.45, -1.05, 0.25, "#2b2f35");
      const show = info ? (info.display || (info.reading != null ? env.fmt(info.reading, info.unit, 4).replace(" ", "") : "0")) : "0.000";
      lcd(g, -1.25, -4.0, 1.25, -3.1, show);
      const modes = ["vdc", "vac", "adc", "aac", "ohm", "cont"], labels = ["V⎓", "V~", "A⎓", "A~", "Ω", "🔊"], m = Math.max(0, modes.indexOf(p.p.mode || "vdc"));
      disc(g, 0, -2.0, 0.62, radial(g, 0, -2.0, 0.62, ["#eeeeee", "#9e9e9e", "#424242"]), "#111");
      const a = -Math.PI * 0.75 + m * (Math.PI * 1.5 / 5), c = g.X(0, -2.0);
      ctx.save(); ctx.strokeStyle = "#111"; ctx.lineWidth = Math.max(2, g.sc * 0.12); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0] + Math.sin(a) * 0.55 * g.sc, c[1] - Math.cos(a) * 0.55 * g.sc); ctx.stroke(); ctx.restore();
      labels.forEach((l, k) => { const b = -Math.PI * 0.75 + k * (Math.PI * 1.5 / 5); g.text(Math.sin(b) * 0.98, -2.0 - Math.cos(b) * 0.98, l, 0.24, k === m ? "#ffd54f" : "#cfd2d6", "center", "700"); });
      disc(g, -0.5, -1.15, 0.13, "#d62828"); disc(g, 0.5, -1.15, 0.13, "#111", "#666");
    },
    wattmeter(g, p, info, env) {
      [[-2, -1], [2, -1], [-2, 1], [2, 1]].forEach((q) => lead(g, q[0], q[1], q[0] < 0 ? -1.55 : 1.55, q[1]));
      shadow(g, -1.6, -1.8, 1.6, 1.8, 0.2);
      box(g, -1.6, -1.8, 1.6, 1.8, 0.2, grad(g, 0, -1.8, 0, 1.8, ["#3b4652", "#232b33"]));
      box(g, -1.35, -1.55, 1.35, 0.75, 0.15, "#f7f3e8");
      const P = info && info.reading != null ? info.reading : 0, A = Math.abs(P);
      let fs = 1; while (fs < A) fs *= fs.toString()[0] === "1" ? 2 : fs.toString()[0] === "2" ? 2.5 : 2;   // 1, 2, 5, 10, 20, 50 ...
      const ctx = g.ctx, c = g.X(0, 0.55), R = 1.6 * g.sc;
      ctx.save(); ctx.strokeStyle = "#333"; ctx.lineWidth = 1;
      for (let k = 0; k <= 10; k++) { const a = -Math.PI * 0.8 + k * Math.PI * 0.06; ctx.beginPath(); ctx.moveTo(c[0] + Math.cos(a) * R * 0.78, c[1] + Math.sin(a) * R * 0.78); ctx.lineTo(c[0] + Math.cos(a) * R * (k % 5 ? 0.85 : 0.9), c[1] + Math.sin(a) * R * (k % 5 ? 0.85 : 0.9)); ctx.stroke(); }
      const f = Math.max(-0.05, Math.min(1.05, P / fs)), a = -Math.PI * 0.8 + f * Math.PI * 0.6;
      ctx.strokeStyle = "#d62828"; ctx.lineWidth = Math.max(1.5, g.sc * 0.07); ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0] + Math.cos(a) * R * 0.88, c[1] + Math.sin(a) * R * 0.88); ctx.stroke(); ctx.restore();
      txt(g, 0, -0.3, env.fmt(P, "W", 3).replace(" ", ""), 0.42, "#222");
      txt(g, 0, 1.25, "W  0–" + env.fmt(fs, "W").replace(" ", ""), 0.32, "#cfd8e3", "600");
    },
    text(g, p, info, env) { g.text(0, 0, String(p.p.text || ""), 0.6 * (+p.p.size || 1), env.ink, "center", "600"); },
    port(g, p) {
      poly(g, [-0.2, -0.45, 1.0, -0.45, 1.4, 0, 1.0, 0.45, -0.2, 0.45], "#0ea5e9", "#075985", 1);
      txt(g, 0.55, 0, String(p.p.name || "").slice(0, 5), 0.34, "#fff");
      disc(g, 0, 0, 0.16, "#dfe3e8", "#6b737d");
    },
  };
  function shade(hex, f) {
    const n = parseInt(String(hex).replace("#", "").slice(0, 6), 16);
    return "rgb(" + [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => Math.round(v * f)).join(",") + ")";
  }
  function lcdLike(g, x1, y1, x2, y2, text) { box(g, x1, y1, x2, y2, 0.1, "rgba(255,255,255,.9)"); txt(g, (x1 + x2) / 2, (y1 + y2) / 2, text, 0.42, "#111"); }

  // the breadboard: drawn in grid coordinates (no rotation)
  function breadboard(ctx, part, view, strip, cols) {
    const sc = view.scale, X = (x, y) => [view.ox + (part.x + x) * sc, view.oy + (part.y + y) * sc];
    const a = X(-1.5, -4.2), b = X(cols - 0.5, 14.2);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.3)"; ctx.shadowBlur = sc * 0.4; ctx.shadowOffsetY = sc * 0.15;
    rr(ctx, a[0], a[1], b[0] - a[0], b[1] - a[1], sc * 0.35); ctx.fillStyle = "#f4f4f2"; ctx.fill();
    ctx.shadowColor = "transparent";
    const ch = X(-1.5, 4.7), ch2 = X(cols - 0.5, 5.3);
    ctx.fillStyle = "#dcdcd8"; ctx.fillRect(ch[0], ch[1], ch2[0] - ch[0], ch2[1] - ch[1]);   // the centre channel
    const rail = (y, colour) => { const p1 = X(-0.8, y), p2 = X(cols - 1.2, y); ctx.strokeStyle = colour; ctx.lineWidth = Math.max(1, sc * 0.08); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); };
    rail(-3.8, "#d62828"); rail(-1.4, "#1f6feb"); rail(11.4, "#1f6feb"); rail(13.8, "#d62828");
    const hs = Math.max(1.5, sc * 0.24);
    for (let dx = 0; dx < cols; dx++) for (let dy = -3; dy <= 13; dy++) {
      if (!strip(part, part.x + dx, part.y + dy)) continue;
      const q = X(dx, dy);
      ctx.fillStyle = "#2b2b2b"; ctx.fillRect(q[0] - hs / 2, q[1] - hs / 2, hs, hs);
    }
    if (sc >= 12) {
      ctx.fillStyle = "#8a8a86"; ctx.font = "600 " + Math.max(7, sc * 0.36) + "px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      "abcde".split("").forEach((l, k) => { const q = X(-1, k); ctx.fillText(l, q[0], q[1]); });
      "fghij".split("").forEach((l, k) => { const q = X(-1, 6 + k); ctx.fillText(l, q[0], q[1]); });
      for (let dx = 0; dx < cols; dx += 5) { const q = X(dx, -0.8); ctx.fillText(String(dx + 1), q[0], q[1]); }
      ctx.fillStyle = "#d62828"; let q = X(-1, -3); ctx.fillText("+", q[0], q[1]); q = X(-1, 13); ctx.fillText("+", q[0], q[1]);
      ctx.fillStyle = "#1f6feb"; q = X(-1, -2); ctx.fillText("−", q[0], q[1]); q = X(-1, 12); ctx.fillText("−", q[0], q[1]);
    }
    ctx.restore();
  }

  // returns false when the part keeps its schematic drawing (7-segment display, which already looks real)
  function part(g, p, info, env) {
    const t = p.type;
    if (t === "seg7") return false;
    switch (t) {
      case "diode": case "schottky": case "zener": D.diode(g, p, info, env, t); break;
      case "npn": case "pnp": D.bjt(g, p, info, env); break;
      case "nmos": case "pmos": D.mos(g, p, info, env); break;
      case "voltmeter": D.meter(g, p, info, env, "V"); break;
      case "ammeter": D.meter(g, p, info, env, "A"); break;
      case "opamp": D.chip(g, p, info, env, "LM358"); break;
      case "timer555": D.chip(g, p, info, env, "NE555"); break;
      case "opto": D.chip(g, p, info, env, "PC817"); break;
      case "not": case "and": case "or": case "nand": case "nor": case "xor":
        D.chip(g, p, info, env, { not: "74HC04", and: "74HC08", or: "74HC32", nand: "74HC00", nor: "74HC02", xor: "74HC86" }[t]); break;
      default:
        if (env.PARTS[t] && env.PARTS[t].custom) { D.chip(g, p, info, env, String(env.PARTS[t].custom.name || "IC").slice(0, 10)); break; }
        if (!D[t]) return false;
        D[t](g, p, info, env);
    }
    if (info && info.burnt && t !== "fuse") {   // smoke over a burnt part
      const c = g.X(0, 0), ctx = g.ctx, ph = performance.now() / 600;
      ctx.save(); ctx.fillStyle = "rgba(40,30,25,.45)"; ctx.beginPath(); ctx.arc(c[0], c[1], g.sc * 1.0, 0, TAU); ctx.fill();
      for (let k = 0; k < 3; k++) { const f = (ph + k / 3) % 1; ctx.fillStyle = "rgba(130,130,130," + (0.5 * (1 - f)) + ")"; ctx.beginPath(); ctx.arc(c[0] + Math.sin(k * 2 + ph) * 5, c[1] - f * g.sc * 2.4, g.sc * (0.25 + f * 0.5), 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    return true;
  }

  window.CircuitReal = { board: board, wire: wire, part: part, breadboard: breadboard, solder: solder, WIRE_COLOURS: WIRE_COLOURS, BOARDS: Object.keys(BOARDS) };
})();
