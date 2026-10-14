/* Graph Plotter: Cartesian plane (2D) and 3D space with live parameters.
 *
 * Each input row is one of:
 *   points      A(2,3)   |  A(1,2) B(5,5)  |  (0,0) (4,0) (4,3)   |  P(1,2,3) Q(4,5,6)   (3D)
 *   equation    y = 2x + 1  |  2x + 3y = 6  |  x^2 + y^2 = 25  |  y = a sin(bx + c)  |  x + y + z = 6  |  z = x^2 - y^2
 *   expression  sin(x)  (-> y = sin(x))   |  2^10 (-> calculator value)
 * Any letter other than x, y, z becomes a slider parameter.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#ca8a04", "#db2777"];
  const AXES = new Set(["x", "y", "z"]);
  const state = { mode: "2d", deg: false, items: [], params: {}, trig: true, nextId: 1 };
  let models = [];   // compiled items

  // ---------------------------------------------------------------- helpers
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === "class") e.className = v;
      else if (k === "style") e.style.cssText = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    kids.flat(Infinity).forEach((c) => c != null && c !== false && e.append(c.nodeType ? c : document.createTextNode(String(c))));
    return e;
  }
  function n(x, d = 4) {
    if (!isFinite(x)) return x > 0 ? "∞" : x < 0 ? "−∞" : "undefined";
    if (Math.abs(x) < 1e-10) return "0";
    const a = Math.abs(x);
    if (a >= 1e7 || a < 1e-4) return x.toExponential(3);
    return String(Number(x.toFixed(d)));
  }
  const pt = (p) => `(${p.map((v) => n(v, 3)).join(", ")})`;
  // angles are always shown in both units; the Deg/Rad switch only changes how sin(), cos() ... read their input
  const angle = (r, d = 2) => `${n(r * 180 / Math.PI, d)}° (${n(r, 4)} rad)`;
  function linForm(coeffs, names, constant) {   // tidy "ax + by + c = 0": leading term positive, no 1x, no +-
    let k = coeffs.concat([constant]);
    const lead = k.find((v) => Math.abs(v) > 1e-12);
    if (lead < 0) k = k.map((v) => -v);
    const terms = [];
    k.forEach((v, i) => {
      if (Math.abs(v) < 1e-12) return;
      const name = names[i] || "", mag = Math.abs(v), coef = name && Math.abs(mag - 1) < 1e-12 ? "" : n(mag);
      const sign = v < 0 ? "−" : "+";
      terms.push(terms.length ? ` ${sign} ${coef}${name}` : `${v < 0 ? "−" : ""}${coef}${name}`);
    });
    return (terms.join("") || "0") + " = 0";
  }
  function scope(extra) {
    const s = { __deg: state.deg };
    Object.entries(state.params).forEach(([k, p]) => { s[k] = p.value; });
    return Object.assign(s, extra);
  }
  function parseExpr(src) {
    try { return window.MathExpr.parse(src); }
    catch (e) { throw new Error(e.message || String(e)); }
  }

  // ---------------------------------------------------------------- item parsing
  const POINT_RE = /^\s*([A-Za-z][A-Za-z0-9']*)?\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*[,;]?/;

  function splitTop(s) {      // split by top-level commas
    const out = []; let depth = 0, cur = "";
    for (const ch of s) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function tryPoints(src) {
    let rest = src.trim(), pts = [], auto = 0;
    if (!rest.includes(",") || rest.includes("=")) return null;
    while (rest.length) {
      const m = POINT_RE.exec(rest);
      if (!m) return null;
      const parts = splitTop(m[2]);
      if (parts.length < 2 || parts.length > 3) return null;
      const coords = parts.map((p) => parseExpr(p));
      pts.push({ label: m[1] || null, coords });
      rest = rest.slice(m[0].length).trim();
    }
    if (!pts.length) return null;
    const names = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    pts.forEach((p) => { if (!p.label) { while (pts.some((q) => q.label === names[auto])) auto++; p.label = names[auto++] || "P"; } });
    const vars = new Set();
    pts.forEach((p) => p.coords.forEach((c) => c.vars.forEach((v) => vars.add(v))));
    return { kind: "points", pts, vars, dims: Math.max(...pts.map((p) => p.coords.length)) };
  }

  function compileItem(src) {
    const s = src.trim();
    if (!s) return null;
    const pts = tryPoints(s);
    if (pts) return pts;
    const eq = s.split("=");
    if (eq.length > 2) throw new Error("Use a single '=' sign");
    if (eq.length === 2) {
      if (!eq[0].trim() || !eq[1].trim()) throw new Error("Both sides of '=' need an expression");
      const L = parseExpr(eq[0]), R = parseExpr(eq[1]);
      const vars = new Set([...L.vars, ...R.vars]);
      const isVar = (e, v) => e.vars.size === 1 && e.vars.has(v) && e.ast.k === "var";
      const F = (sc) => L.fn(sc) - R.fn(sc);
      if (vars.has("z")) {
        if (isVar(L, "z") && !R.vars.has("z")) return { kind: "surface", f: R.fn, F, vars };
        if (isVar(R, "z") && !L.vars.has("z")) return { kind: "surface", f: L.fn, F, vars };
        return { kind: "implicit3", F, vars };
      }
      if (isVar(L, "y") && !R.vars.has("y")) return { kind: "fx", f: R.fn, F, vars, uses: R.vars };
      if (isVar(R, "y") && !L.vars.has("y")) return { kind: "fx", f: L.fn, F, vars, uses: L.vars };
      if (isVar(L, "x") && !R.vars.has("x")) return { kind: "fy", g: R.fn, F, vars };
      if (isVar(R, "x") && !L.vars.has("x")) return { kind: "fy", g: L.fn, F, vars };
      return { kind: "implicit", F, vars };
    }
    const E = parseExpr(s);
    if (E.vars.has("z")) return { kind: "implicit3", F: E.fn, vars: E.vars };
    if (E.vars.has("x") && E.vars.has("y")) {
      return state.mode === "3d" ? { kind: "surface", f: E.fn, F: (sc) => E.fn(sc) - sc.z, vars: E.vars }
        : { kind: "implicit", F: E.fn, vars: E.vars };
    }
    if (E.vars.has("x")) return { kind: "fx", f: E.fn, F: (sc) => E.fn(sc) - sc.y, vars: E.vars };
    if (E.vars.has("y")) return { kind: "fy", g: E.fn, F: (sc) => E.fn(sc) - sc.x, vars: E.vars };
    return { kind: "value", f: E.fn, vars: E.vars };
  }

  // ---------------------------------------------------------------- shape analysis (numeric)
  function linear2(F) {         // F(x,y) = a x + b y + c ?
    const s = scope(), at = (x, y) => F(Object.assign(s, { x, y, z: 0 }));
    const c = at(0, 0), a = at(1, 0) - c, b = at(0, 1) - c;
    if (![a, b, c].every(isFinite) || (Math.abs(a) < 1e-12 && Math.abs(b) < 1e-12)) return null;
    const tol = 1e-7 * (1 + Math.abs(a) + Math.abs(b) + Math.abs(c));
    for (const [x, y] of [[2.3, -1.7], [-3.1, 4.2], [0.7, 0.9], [7.5, 3.3]]) if (!(Math.abs(at(x, y) - (a * x + b * y + c)) < tol * (1 + Math.abs(x) + Math.abs(y)))) return null;
    return { a, b, c };
  }
  function conic2(F) {          // A x² + B xy + C y² + D x + E y + F0
    const s = scope(), at = (x, y) => F(Object.assign(s, { x, y, z: 0 }));
    const F0 = at(0, 0), A = (at(2, 0) - 2 * at(1, 0) + F0) / 2, D = at(1, 0) - F0 - A;
    const C = (at(0, 2) - 2 * at(0, 1) + F0) / 2, E = at(0, 1) - F0 - C, B = at(1, 1) - A - C - D - E - F0;
    if (![A, B, C, D, E, F0].every(isFinite)) return null;
    const scale = 1 + Math.abs(A) + Math.abs(B) + Math.abs(C) + Math.abs(D) + Math.abs(E) + Math.abs(F0);
    for (const [x, y] of [[2.3, -1.7], [-3.1, 4.2], [0.7, 0.9], [5.5, -2.5]]) {
      const v = A * x * x + B * x * y + C * y * y + D * x + E * y + F0;
      if (!(Math.abs(at(x, y) - v) < 1e-7 * scale * (1 + x * x + y * y))) return null;
    }
    return { A, B, C, D, E, F0 };
  }
  function linear3(F) {
    const s = scope(), at = (x, y, z) => F(Object.assign(s, { x, y, z }));
    const d = at(0, 0, 0), a = at(1, 0, 0) - d, b = at(0, 1, 0) - d, c = at(0, 0, 1) - d;
    if (![a, b, c, d].every(isFinite) || Math.hypot(a, b, c) < 1e-12) return null;
    const tol = 1e-7 * (1 + Math.abs(a) + Math.abs(b) + Math.abs(c) + Math.abs(d));
    for (const [x, y, z] of [[2.3, -1.7, 0.4], [-3.1, 4.2, 2.2], [0.7, 0.9, -5]]) if (!(Math.abs(at(x, y, z) - (a * x + b * y + c * z + d)) < tol * 10)) return null;
    return { a, b, c, d };
  }
  function sphere3(F) {         // k(x²+y²+z²) + Dx + Ey + Fz + G
    const s = scope(), at = (x, y, z) => F(Object.assign(s, { x, y, z }));
    const G = at(0, 0, 0), k = (at(2, 0, 0) - 2 * at(1, 0, 0) + G) / 2;
    if (!isFinite(k) || Math.abs(k) < 1e-12) return null;
    const D = at(1, 0, 0) - G - k, E = at(0, 1, 0) - G - k, Fz = at(0, 0, 1) - G - k;
    for (const [x, y, z] of [[2.3, -1.7, 0.4], [-3.1, 4.2, 2.2], [0.7, 0.9, -5]]) {
      const v = k * (x * x + y * y + z * z) + D * x + E * y + Fz * z + G;
      if (!(Math.abs(at(x, y, z) - v) < 1e-6 * (1 + Math.abs(v)))) return null;
    }
    const c = [-D / (2 * k), -E / (2 * k), -Fz / (2 * k)], r2 = c[0] ** 2 + c[1] ** 2 + c[2] ** 2 - G / k;
    return r2 > 0 ? { centre: c, r: Math.sqrt(r2) } : null;
  }

  function polygonDiagonals(k) {   // vertex index pairs that are not sides
    const out = [];
    for (let i = 0; i < k; i++) for (let j = i + 2; j < k; j++) if (!(i === 0 && j === k - 1)) out.push([i, j]);
    return out;
  }

  function roots(f, x0, x1, samples = 1200) {
    const out = [];
    let px = x0, pv = f(x0);
    for (let i = 1; i <= samples; i++) {
      const x = x0 + (x1 - x0) * i / samples, v = f(x);
      if (isFinite(v) && isFinite(pv)) {
        if (v === 0) out.push(x);
        else if (pv * v < 0) {
          let a = px, b = x, fa = pv;
          for (let k = 0; k < 60; k++) { const m = (a + b) / 2, fm = f(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } }
          const r = (a + b) / 2;
          if (Math.abs(f(r)) < 1e-6 * (1 + Math.abs(pv) + Math.abs(v))) out.push(r);  // reject jumps (asymptotes)
        }
      }
      px = x; pv = v;
      if (out.length > 30) break;
    }
    return out.filter((r, i) => i === 0 || Math.abs(r - out[i - 1]) > 1e-7);
  }

  function trigInfo(f, uses) {   // amplitude / period / midline for periodic functions
    const s = scope(), at = (x) => f(Object.assign(s, { x }));
    let lo = Infinity, hi = -Infinity;
    const span = state.deg ? 1440 : 8 * Math.PI;
    for (let i = 0; i <= 12000; i++) { const v = at(-span + 2 * span * i / 12000); if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    if (!isFinite(lo) || hi - lo < 1e-12 || hi - lo > 1e6) return null;
    const mid = (hi + lo) / 2;
    const ups = roots((x) => at(x) - mid, -span, span, 4000).filter((x) => at(x + span / 4000) > mid);
    let period = null;
    if (ups.length >= 2) {
      const diffs = ups.slice(1).map((v, i) => v - ups[i]).sort((a, b) => a - b);
      const cand = diffs[0];
      const ok = [0.3, 1.7, -2.9, 5.1].every((x) => Math.abs(at(x + cand) - at(x)) < 1e-4 * (1 + hi - lo));
      if (ok) period = cand;
    }
    return { amplitude: (hi - lo) / 2, midline: mid, max: hi, min: lo, period };
  }

  // ---------------------------------------------------------------- build models from input rows
  function rebuild() {
    const usedParams = new Set();
    models = state.items.map((it) => {
      try {
        const m = compileItem(it.src);
        if (!m) return { it, kind: "empty" };
        m.it = it;
        m.vars.forEach((v) => { if (!AXES.has(v)) usedParams.add(v); });
        if (m.kind === "points" && m.dims === 3 && state.mode === "2d") m.note = "3D point — switch to 3D space to see the z value.";
        if (["surface", "implicit3"].includes(m.kind) && state.mode === "2d") m.note = "Uses z — shown in 3D space mode.";
        return m;
      } catch (e) {
        return { it, kind: "error", error: e.message };
      }
    });
    // add sliders for new parameters, drop unused ones
    usedParams.forEach((k) => { if (!state.params[k]) state.params[k] = { value: 1, min: -10, max: 10, step: 0.1, playing: false, dir: 1 }; });
    Object.keys(state.params).forEach((k) => { if (!usedParams.has(k)) delete state.params[k]; });
    renderRows();
    renderParams();
    refresh();
  }

  // everything that depends on parameter values
  function refresh() {
    models.forEach((m) => { m.info = analyse(m); });
    renderAnalysis();
    if (state.mode === "2d") draw2d(); else build3d();
  }

  // ---------------------------------------------------------------- analysis text per item
  function analyse(m) {
    const s = scope(), rows = [], marks = [];
    const add = (k, v) => rows.push([k, v]);
    try {
      if (m.kind === "error") return { rows: [["Error", m.error]], error: true };
      if (m.kind === "empty") return { rows: [] };
      if (m.kind === "value") { add("Value", n(m.f(s), 8)); return { rows }; }
      if (m.kind === "points") {
        const P = m.pts.map((p) => {
          const c = p.coords.map((e) => e.fn(s));
          while (c.length < 3) c.push(0);
          return { label: p.label, c, dims: p.coords.length };
        });
        m.values = P;
        const is3 = state.mode === "3d" && m.dims === 3;
        const D = is3 ? 3 : 2;
        const show = (q) => `${q.label}${pt(q.c.slice(0, D))}`;
        if (P.length === 1) {
          const [x, y, z] = P[0].c;
          add("Point", show(P[0]));
          if (is3) {
            const r = Math.hypot(x, y, z);
            add("Distance from origin", `√(x² + y² + z²) = ${n(r)}`);
            if (r > 0) {
              add("Direction cosines", `l = ${n(x / r)}, m = ${n(y / r)}, n = ${n(z / r)}`);
              add("Angles with axes", `α = ${angle(Math.acos(x / r), 2)}, β = ${angle(Math.acos(y / r), 2)}, γ = ${angle(Math.acos(z / r), 2)}`);
            }
          } else {
            const r = Math.hypot(x, y), th = Math.atan2(y, x);
            const quad = x === 0 || y === 0 ? (x === 0 && y === 0 ? "origin" : "on an axis") : x > 0 ? (y > 0 ? "I" : "IV") : (y > 0 ? "II" : "III");
            add("Quadrant", quad);
            add("Distance from origin", `r = √(${n(x)}² + ${n(y)}²) = ${n(r)}`);
            if (r > 0) {
              add("Angle with +x axis", `θ = tan⁻¹(y/x) = ${angle(th < 0 ? th + 2 * Math.PI : th, 3)}`);
              add("sin θ", `y / r = ${n(y / r)}`);
              add("cos θ", `x / r = ${n(x / r)}`);
              add("tan θ", x !== 0 ? `y / x = ${n(y / x)}` : "undefined (x = 0)");
              add("Polar form", `(r, θ) = (${n(r)}, ${angle(th < 0 ? th + 2 * Math.PI : th, 3)})`);
            }
          }
        } else if (P.length === 2) {
          const [A, B] = P, d = B.c.map((v, i) => v - A.c[i]);
          const len = Math.hypot(...d.slice(0, D));
          add("Points", `${show(A)}, ${show(B)}`);
          add(`Distance ${A.label}${B.label}`, `√(${d.slice(0, D).map((v) => `(${n(v)})²`).join(" + ")}) = ${n(len)}`);
          add("Midpoint", pt(A.c.slice(0, D).map((v, i) => (v + B.c[i]) / 2)));
          if (is3) {
            add("Direction ratios", `${n(d[0])} : ${n(d[1])} : ${n(d[2])}`);
            if (len > 0) {
              add("Direction cosines", `l = ${n(d[0] / len)}, m = ${n(d[1] / len)}, n = ${n(d[2] / len)}`);
              add("Angles with axes", ["x", "y", "z"].map((ax, i) => `${ax}: ${angle(Math.acos(d[i] / len), 2)}`).join(", "));
            }
            add("Line (symmetric form)", `(x − ${n(A.c[0])})/${n(d[0])} = (y − ${n(A.c[1])})/${n(d[1])} = (z − ${n(A.c[2])})/${n(d[2])}`);
          } else {
            const [x1, y1] = A.c, [x2, y2] = B.c;
            if (Math.abs(x2 - x1) < 1e-12) {
              add("Slope", "undefined (vertical line)");
              add("Equation", `x = ${n(x1)}`);
              add("Angle with x-axis", angle(Math.PI / 2));
            } else {
              const m_ = (y2 - y1) / (x2 - x1), c = y1 - m_ * x1, th = Math.atan(m_);
              add("Slope", `m = (${n(y2)} − ${n(y1)}) / (${n(x2)} − ${n(x1)}) = ${n(m_)}`);
              add("Equation", `y = ${n(m_)}x ${c < 0 ? "−" : "+"} ${n(Math.abs(c))}`.replace(" + 0", ""));
              add("General form", linForm([y2 - y1, x1 - x2], ["x", "y"], x2 * y1 - x1 * y2));
              add("Angle with x-axis", `θ = tan⁻¹(m) = ${angle(th < 0 ? th + Math.PI : th, 3)}`);
              add("sin θ, cos θ", `${n(Math.sin(th < 0 ? th + Math.PI : th))}, ${n(Math.cos(th < 0 ? th + Math.PI : th))}`);
            }
          }
        } else {
          const V = P.map((q) => q.c.slice(0, D));
          const sides = V.map((v, i) => Math.hypot(...v.map((x, k) => x - V[(i + 1) % V.length][k])));
          add("Vertices", P.map(show).join(", "));
          add("Side lengths", P.map((q, i) => `${q.label}${P[(i + 1) % P.length].label} = ${n(sides[i])}`).join(", "));
          add("Perimeter", n(sides.reduce((a, b) => a + b, 0)));
          let area;
          if (D === 2) {
            area = Math.abs(V.reduce((acc, v, i) => acc + v[0] * V[(i + 1) % V.length][1] - V[(i + 1) % V.length][0] * v[1], 0)) / 2;
            add("Area (shoelace)", `½ |Σ (xᵢyᵢ₊₁ − xᵢ₊₁yᵢ)| = ${n(area)}`);
          } else if (V.length === 3) {
            const u = V[1].map((x, k) => x - V[0][k]), w = V[2].map((x, k) => x - V[0][k]);
            const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
            area = Math.hypot(...cr) / 2;
            add("Area", `½ |AB × AC| = ${n(area)}`);
            const dd = -(cr[0] * V[0][0] + cr[1] * V[0][1] + cr[2] * V[0][2]);
            add("Plane through the points", linForm(cr, ["x", "y", "z"], dd));
          }
          add("Centroid", pt(V[0].map((_, k) => V.reduce((a, v) => a + v[k], 0) / V.length)));
          if (V.length >= 4) {
            const diags = polygonDiagonals(V.length);
            add(`Diagonals (${diags.length})`, diags.map(([i, j]) => `${P[i].label}${P[j].label} = ${n(Math.hypot(...V[i].map((x, k) => x - V[j][k])))}`).join(", "));
          }
          if (V.length === 3) {
            const [a, b, c] = [sides[1], sides[2], sides[0]];   // opposite A, B, C
            const angA = Math.acos((b * b + c * c - a * a) / (2 * b * c)), angB = Math.acos((a * a + c * c - b * b) / (2 * a * c));
            const angC = Math.PI - angA - angB;
            add("Angles (cosine rule)", `∠${P[0].label} = ${angle(angA, 2)}, ∠${P[1].label} = ${angle(angB, 2)}, ∠${P[2].label} = ${angle(angC, 2)}`);
            const eq = (p, q) => Math.abs(p - q) < 1e-9 * (1 + p);
            const bySide = eq(a, b) && eq(b, c) ? "equilateral" : eq(a, b) || eq(b, c) || eq(a, c) ? "isosceles" : "scalene";
            const big = Math.max(angA, angB, angC);
            const byAngle = Math.abs(big - Math.PI / 2) < 1e-9 ? "right-angled" : big > Math.PI / 2 ? "obtuse" : "acute";
            add("Triangle type", `${bySide}, ${byAngle}`);
          }
        }
        return { rows };
      }
      if (state.mode === "2d" && ["fx", "fy", "implicit"].includes(m.kind)) {
        const L = linear2(m.F);
        if (L) {
          const { a, b, c } = L;
          m.linear = L;
          add("Type", "Straight line");
          add("General form", linForm([a, b], ["x", "y"], c));
          if (Math.abs(b) > 1e-12) {
            const slope = -a / b, k = -c / b, th = Math.atan(slope);
            add("Slope-intercept", `y = ${n(slope)}x ${k < 0 ? "−" : "+"} ${n(Math.abs(k))}`.replace(" + 0", ""));
            add("Slope", `m = −a/b = ${n(slope)}`);
            add("y-intercept", `(0, ${n(k)})`);
            marks.push({ p: [0, k], text: `(0, ${n(k, 2)})` });
            add("Angle with x-axis", `θ = tan⁻¹(m) = ${angle(th < 0 ? th + Math.PI : th, 3)}`);
            add("sin θ, cos θ, tan θ", `${n(Math.sin(th < 0 ? th + Math.PI : th))}, ${n(Math.cos(th < 0 ? th + Math.PI : th))}, ${n(slope)}`);
          } else add("Slope", "undefined (vertical line)");
          if (Math.abs(a) > 1e-12) { add("x-intercept", `(${n(-c / a)}, 0)`); marks.push({ p: [-c / a, 0], text: `(${n(-c / a, 2)}, 0)` }); }
          add("Distance from origin", `|c| / √(a² + b²) = ${n(Math.abs(c) / Math.hypot(a, b))}`);
          return { rows, marks };
        }
        const Q = conic2(m.F);
        if (Q) {
          const { A, B, C, D: Dx, E, F0 } = Q, disc = B * B - 4 * A * C;
          if (Math.abs(B) < 1e-9 && Math.abs(A - C) < 1e-9 * (1 + Math.abs(A)) && Math.abs(A) > 1e-12) {
            const cx = -Dx / (2 * A), cy = -E / (2 * A), r2 = cx * cx + cy * cy - F0 / A;
            if (r2 > 0) {
              const r = Math.sqrt(r2);
              m.circle = { cx, cy, r };
              add("Type", "Circle");
              add("Centre", pt([cx, cy]));
              add("Radius", `r = ${n(r)}`);
              add("Standard form", `(x ${cx < 0 ? "+" : "−"} ${n(Math.abs(cx))})² + (y ${cy < 0 ? "+" : "−"} ${n(Math.abs(cy))})² = ${n(r2)}`);
              add("Area", `πr² = ${n(Math.PI * r2)}`);
              add("Circumference", `2πr = ${n(2 * Math.PI * r)}`);
              marks.push({ p: [cx, cy], text: `centre ${pt([cx, cy])}` });
              return { rows, marks };
            }
          }
          add("Type", Math.abs(A) + Math.abs(B) + Math.abs(C) < 1e-12 ? "Line" : disc < -1e-12 ? "Ellipse" : Math.abs(disc) <= 1e-12 ? "Parabola" : "Hyperbola");
          add("Coefficients", `A=${n(A)}, B=${n(B)}, C=${n(C)}, D=${n(Dx)}, E=${n(E)}, F=${n(F0)}`);
          add("Discriminant", `B² − 4AC = ${n(disc)}`);
        }
        if (m.kind === "fx") {
          const f = (x) => m.f(Object.assign(scope(), { x }));
          add("y-intercept", `f(0) = ${n(f(0))}`);
          if (isFinite(f(0))) marks.push({ p: [0, f(0)], text: `(0, ${n(f(0), 2)})` });
          const [x0, x1] = view2d ? [view2d.x0(), view2d.x1()] : [-10, 10];
          const zs = roots(f, x0, x1);
          add("x-intercepts (in view)", zs.length ? zs.slice(0, 8).map((r) => n(r, 3)).join(", ") + (zs.length > 8 ? " …" : "") : "none");
          zs.slice(0, 12).forEach((r) => marks.push({ p: [r, 0], text: n(r, 2) }));
          if (/sin|cos|tan|sec|csc|cot/.test(m.it.src)) {
            const T = trigInfo(m.f);
            if (T) {
              add("Amplitude", n(T.amplitude, 3));
              add("Midline", `y = ${n(T.midline, 3)}`);
              add("Maximum / minimum", `${n(T.max, 3)} / ${n(T.min, 3)}`);
              const k = T.period && n(T.period / Math.PI, 3);
              add("Period", T.period ? `${n(T.period)}${state.deg ? "°" : ` (= ${k === "1" ? "" : k}π)`}` : "not periodic");
            }
          }
        }
        if (!rows.length) add("Type", "Implicit curve");
        return { rows, marks };
      }
      if (m.kind === "implicit3" || m.kind === "surface") {
        const L = linear3(m.F);
        if (L) {
          const { a, b, c, d } = L, nn = Math.hypot(a, b, c);
          m.plane = L;
          add("Type", "Plane");
          add("Equation", linForm([a, b, c], ["x", "y", "z"], d));
          add("Normal vector", `n = (${n(a)}, ${n(b)}, ${n(c)})`);
          ["x", "y", "z"].forEach((ax, i) => { const k = [a, b, c][i]; add(`${ax}-intercept`, Math.abs(k) > 1e-12 ? n(-d / k) : "none (parallel)"); });
          add("Distance from origin", `|d| / |n| = ${n(Math.abs(d) / nn)}`);
          add("Normal angles with axes", ["x", "y", "z"].map((ax, i) => `${ax}: ${angle(Math.acos([a, b, c][i] / nn), 2)}`).join(", "));
          return { rows };
        }
        const S = m.kind === "implicit3" ? sphere3(m.F) : null;
        if (S) {
          m.sphere = S;
          add("Type", "Sphere");
          add("Centre", pt(S.centre));
          add("Radius", n(S.r));
          add("Volume", `(4/3)πr³ = ${n(4 / 3 * Math.PI * S.r ** 3)}`);
          add("Surface area", `4πr² = ${n(4 * Math.PI * S.r ** 2)}`);
          return { rows };
        }
        if (m.kind === "surface") {
          add("Type", "Surface z = f(x, y)");
          add("f(0, 0)", n(m.f(Object.assign(scope(), { x: 0, y: 0 }))));
          return { rows };
        }
        return { rows: [["Note", "In 3D, planes, spheres and z = f(x, y) surfaces are supported."]], error: true };
      }
      if (state.mode === "3d" && ["fx", "fy", "implicit"].includes(m.kind)) add("Note", "2D curve drawn in the xy-plane (z = 0).");
      return { rows, marks };
    } catch (e) {
      return { rows: [["Error", e.message]], error: true };
    }
  }

  function intersections() {
    const lines = models.filter((m) => m.linear && state.mode === "2d");
    const curves = models.filter((m) => state.mode === "2d" && ["fx", "fy", "implicit"].includes(m.kind) && m.info && !m.info.error);
    const out = [];
    for (let i = 0; i < curves.length; i++) {
      for (let j = i + 1; j < curves.length; j++) {
        const A = curves[i], B = curves[j];
        let pts = [];
        if (A.linear && B.linear) {
          const { a: a1, b: b1, c: c1 } = A.linear, { a: a2, b: b2, c: c2 } = B.linear, det = a1 * b2 - a2 * b1;
          if (Math.abs(det) > 1e-12) pts = [[(b1 * c2 - b2 * c1) / det, (c1 * a2 - c2 * a1) / det]];
        } else if (A.linear || B.linear) {
          const L = (A.linear ? A : B).linear, other = A.linear ? B : A;
          const dir = [-L.b, L.a], nl = Math.hypot(...dir), p0 = [-L.a * L.c / (L.a ** 2 + L.b ** 2), -L.b * L.c / (L.a ** 2 + L.b ** 2)];
          const span = view2d ? Math.hypot(view2d.x1() - view2d.x0(), view2d.y1() - view2d.y0()) : 40;
          const g = (t) => other.F(Object.assign(scope(), { x: p0[0] + dir[0] / nl * t, y: p0[1] + dir[1] / nl * t }));
          pts = roots(g, -span, span, 3000).map((t) => [p0[0] + dir[0] / nl * t, p0[1] + dir[1] / nl * t]);
        } else if (A.kind === "fx" && B.kind === "fx") {
          const d = (x) => A.f(Object.assign(scope(), { x })) - B.f(Object.assign(scope(), { x }));
          const [x0, x1] = view2d ? [view2d.x0(), view2d.x1()] : [-10, 10];
          pts = roots(d, x0, x1, 3000).map((x) => [x, A.f(Object.assign(scope(), { x }))]);
        }
        pts.slice(0, 40).forEach((p) => out.push({ p, a: A, b: B }));
      }
    }
    void lines;
    return out;
  }

  // ---------------------------------------------------------------- UI: rows, params, analysis
  function renderRows() {
    const list = $("rows");
    list.replaceChildren(...state.items.map((it, idx) => {
      const m = models[idx] || {};
      const input = h("input", { type: "text", value: it.src, spellcheck: "false", "aria-label": `Expression ${idx + 1}`,
        placeholder: idx === 0 ? "e.g. y = 2x + 1   or   A(2,3)" : "" });
      input.addEventListener("input", () => { it.src = input.value; scheduleRebuild(); });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); addRow("", idx + 1); }
        if (e.key === "Backspace" && !input.value && state.items.length > 1) { e.preventDefault(); removeRow(idx, true); }
      });
      return h("div", { class: "row-item" + (m.kind === "error" ? " bad" : "") },
        h("span", { class: "dot", style: `background:${it.color}` }),
        h("div", { class: "row-main" }, input,
          m.kind === "error" ? h("div", { class: "row-err" }, m.error) : m.note ? h("div", { class: "row-note" }, m.note) : null),
        h("button", { class: "icon", type: "button", "aria-label": "Remove", onclick: () => removeRow(idx) }, "×"));
    }));
  }
  let rebuildTimer = null;
  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      const active = document.activeElement, pos = active && active.selectionStart, idx = [...$("rows").querySelectorAll("input")].indexOf(active);
      rebuild();
      if (idx >= 0) { const inp = $("rows").querySelectorAll("input")[idx]; inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (_) {} }
    }, 250);
  }
  function addRow(src, at) {
    const it = { id: state.nextId++, src: src || "", color: PALETTE[(state.nextId - 2) % PALETTE.length] };
    state.items.splice(at === undefined ? state.items.length : at, 0, it);
    rebuild();
    const inputs = $("rows").querySelectorAll("input");
    const target = inputs[at === undefined ? inputs.length - 1 : at];
    if (target && !src) target.focus();
  }
  function removeRow(idx, focusPrev) {
    state.items.splice(idx, 1);
    if (!state.items.length) state.items.push({ id: state.nextId++, src: "", color: PALETTE[0] });
    rebuild();
    if (focusPrev) { const inputs = $("rows").querySelectorAll("input"); (inputs[Math.max(0, idx - 1)] || inputs[0]).focus(); }
  }

  function renderParams() {
    const box = $("params");
    const keys = Object.keys(state.params).sort();
    $("paramsCard").hidden = !keys.length;
    box.replaceChildren(...keys.map((k) => {
      const p = state.params[k];
      const num = h("input", { type: "number", step: "any", value: String(p.value), "aria-label": `${k} value` });
      const rng = h("input", { type: "range", min: String(p.min), max: String(p.max), step: String(p.step), value: String(p.value), "aria-label": `${k} slider` });
      const lo = h("input", { type: "number", step: "any", value: String(p.min), class: "mini", "aria-label": `${k} minimum` });
      const hi = h("input", { type: "number", step: "any", value: String(p.max), class: "mini", "aria-label": `${k} maximum` });
      const play = h("button", { class: "icon play" + (p.playing ? " on" : ""), type: "button", "aria-label": `Animate ${k}` }, p.playing ? "❚❚" : "▶");
      const set = (v, from) => {
        if (!isFinite(v)) return;
        p.value = v;
        if (from !== num) num.value = String(Number(v.toFixed(4)));
        if (from !== rng) rng.value = String(v);
        refresh();
      };
      num.addEventListener("input", () => { const v = parseFloat(num.value); if (isFinite(v)) { if (v < p.min) { p.min = Math.floor(v); rng.min = lo.value = String(p.min); } if (v > p.max) { p.max = Math.ceil(v); rng.max = hi.value = String(p.max); } set(v, num); } });
      rng.addEventListener("input", () => set(parseFloat(rng.value), rng));
      lo.addEventListener("change", () => { const v = parseFloat(lo.value); if (isFinite(v) && v < p.max) { p.min = v; rng.min = String(v); } });
      hi.addEventListener("change", () => { const v = parseFloat(hi.value); if (isFinite(v) && v > p.min) { p.max = v; rng.max = String(v); } });
      play.onclick = () => { p.playing = !p.playing; play.textContent = p.playing ? "❚❚" : "▶"; play.classList.toggle("on", p.playing); if (p.playing) animate(); };
      p.sync = (v) => { num.value = String(Number(v.toFixed(3))); rng.value = String(v); };
      return h("div", { class: "param" },
        h("div", { class: "param-top" }, h("b", {}, k), h("span", {}, "="), num, play),
        h("div", { class: "param-range" }, lo, rng, hi));
    }));
  }
  let animating = false;
  function animate() {
    if (animating) return;
    animating = true;
    let last = performance.now();
    const tick = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      const live = Object.values(state.params).filter((p) => p.playing);
      if (!live.length) { animating = false; return; }
      live.forEach((p) => {
        p.value += p.dir * (p.max - p.min) * dt / 4;          // full sweep in about 4 s
        if (p.value > p.max) { p.value = p.max; p.dir = -1; }
        if (p.value < p.min) { p.value = p.min; p.dir = 1; }
        p.sync && p.sync(p.value);
      });
      refresh();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function renderAnalysis() {
    const box = $("analysis");
    const cards = models.map((m) => {
      if (!m.info || !m.info.rows.length) return null;
      return h("div", { class: "acard" + (m.info.error ? " bad" : "") },
        h("div", { class: "acard-head" }, h("span", { class: "dot", style: `background:${m.it.color}` }), h("code", {}, m.it.src)),
        h("table", {}, h("tbody", {}, m.info.rows.map(([k, v]) => h("tr", {}, h("th", {}, k), h("td", {}, v))))));
    }).filter(Boolean);
    const inter = state.mode === "2d" ? intersections() : [];
    lastIntersections = inter;
    if (inter.length) {
      cards.push(h("div", { class: "acard" }, h("div", { class: "acard-head" }, h("b", {}, "Intersection points")),
        h("table", {}, h("tbody", {}, inter.slice(0, 10).map((q) => h("tr", {},
          h("th", {}, h("span", { class: "dot", style: `background:${q.a.it.color}` }), " ∩ ", h("span", { class: "dot", style: `background:${q.b.it.color}` })),
          h("td", {}, pt(q.p)))),
          inter.length > 10 ? h("tr", {}, h("th", {}, ""), h("td", {}, `… and ${inter.length - 10} more in view`)) : null))));
    }
    box.replaceChildren(...(cards.length ? cards : [h("p", { class: "hint" }, "Type an expression to see its analysis here.")]));
  }
  let lastIntersections = [];

  // ================================================================= 2D canvas
  const view = { cx: 0, cy: 0, scale: 40 };
  let view2d = null, canvas, ctx, cssW = 800, cssH = 560, hover = null;

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }

  function setup2d() {
    canvas = $("plot2d");
    ctx = canvas.getContext("2d");
    const wrap = $("plotWrap");
    new ResizeObserver(() => { resize2d(); if (state.mode === "2d") draw2d(); }).observe(wrap);
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      hover = [e.clientX - r.left, e.clientY - r.top];
      if (drag) {
        view.cx = drag.cx - (e.clientX - drag.x) / view.scale;
        view.cy = drag.cy + (e.clientY - drag.y) / view.scale;
        draw2d();
        scheduleAnalysis();
      } else draw2d();
      const [wx, wy] = toWorld(hover[0], hover[1]);
      $("coords").textContent = `x = ${n(wx, 3)}, y = ${n(wy, 3)}`;
    });
    canvas.addEventListener("pointerleave", () => { hover = null; draw2d(); });
    const end = () => { drag = null; };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    canvas.addEventListener("dblclick", resetView);
    canvas.addEventListener("keydown", (e) => {
      const step = 40 / view.scale, k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (k) { e.preventDefault(); view.cx += k[0]; view.cy += k[1]; draw2d(); }
      if (e.key === "+" || e.key === "=") zoomAt(1.2, cssW / 2, cssH / 2);
      if (e.key === "-") zoomAt(1 / 1.2, cssW / 2, cssH / 2);
    });
    resize2d();
  }
  let analysisTimer = null;
  function scheduleAnalysis() { clearTimeout(analysisTimer); analysisTimer = setTimeout(() => { models.forEach((m) => { m.info = analyse(m); }); renderAnalysis(); draw2d(); }, 200); }
  function zoomAt(f, sx, sy) {
    const [wx, wy] = toWorld(sx, sy);
    view.scale = Math.min(5000, Math.max(0.5, view.scale * f));
    view.cx = wx - (sx - cssW / 2) / view.scale;
    view.cy = wy + (sy - cssH / 2) / view.scale;
    draw2d();
    scheduleAnalysis();
  }
  function resetView() { view.cx = 0; view.cy = 0; view.scale = Math.max(8, Math.min(cssW, cssH) / 22); if (state.mode === "2d") { draw2d(); scheduleAnalysis(); } else if (three) { three.rotX = 0.5; three.rotY = -0.7; three.zoom = 1; three.dirty = true; } }
  function resize2d() {
    const wrap = $("plotWrap");
    cssW = wrap.clientWidth || 800;
    cssH = Math.max(360, Math.min(720, Math.round(cssW * 0.68)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view2d = { x0: () => toWorld(0, 0)[0], x1: () => toWorld(cssW, 0)[0], y0: () => toWorld(0, cssH)[1], y1: () => toWorld(0, 0)[1] };
  }
  const toScreen = (x, y) => [cssW / 2 + (x - view.cx) * view.scale, cssH / 2 - (y - view.cy) * view.scale];
  const toWorld = (sx, sy) => [view.cx + (sx - cssW / 2) / view.scale, view.cy - (sy - cssH / 2) / view.scale];

  function draw2d() {
    if (!ctx || state.mode !== "2d") return;
    const ink = css("--ink") || "#1c2430", muted = css("--muted") || "#5d6b7e", line = css("--line") || "#dde3ea", bg = (css("--panel-solid") || css("--panel")) || "#fff";
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cssW, cssH);
    // grid
    const step = niceStep(80 / view.scale), minor = step / 5;
    const [x0, y1] = toWorld(0, 0), [x1, y0] = toWorld(cssW, cssH);
    ctx.lineWidth = 1;
    for (const [s, alpha] of [[minor, 0.35], [step, 0.9]]) {
      ctx.strokeStyle = line; ctx.globalAlpha = alpha; ctx.beginPath();
      for (let x = Math.ceil(x0 / s) * s; x <= x1; x += s) { const [sx] = toScreen(x, 0); ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, cssH); }
      for (let y = Math.ceil(y0 / s) * s; y <= y1; y += s) { const [, sy] = toScreen(0, y); ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(cssW, Math.round(sy) + 0.5); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // axes
    const [ox, oy] = toScreen(0, 0);
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(0, oy); ctx.lineTo(cssW, oy); ctx.moveTo(ox, 0); ctx.lineTo(ox, cssH); ctx.stroke();
    ctx.fillStyle = muted; ctx.font = "12px system-ui, Segoe UI, sans-serif";
    const lx = Math.min(Math.max(ox, 4), cssW - 30), ly = Math.min(Math.max(oy, 14), cssH - 4);
    const fmt = (v) => n(Math.round(v / step) * step, 6);
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { if (Math.abs(x) < step / 2) continue; const [sx] = toScreen(x, 0); ctx.fillText(fmt(x), sx, Math.min(ly + 4, cssH - 16)); }
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { if (Math.abs(y) < step / 2) continue; const [, sy] = toScreen(0, y); ctx.fillText(fmt(y), Math.max(lx - 4, 26), sy); }
    ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("O", ox + 4, oy + 4);
    ctx.font = "italic 600 14px Cambria, Georgia, serif"; ctx.fillStyle = ink;
    ctx.fillText("x", cssW - 14, Math.min(Math.max(oy - 20, 2), cssH - 18)); ctx.fillText("y", Math.min(Math.max(ox + 6, 2), cssW - 14), 4);

    models.forEach((m) => { try { drawItem2d(m); } catch (_) { /* bad values: skip */ } });
    // with many points, draw markers only (values stay listed in the analysis) to avoid overlapping text
    const fewCross = lastIntersections.length <= 6;
    lastIntersections.forEach((q) => { const [sx, sy] = toScreen(...q.p); marker(sx, sy, ink, "x"); if (fewCross) label(sx, sy, pt(q.p), ink); });
    if (hover) {
      ctx.strokeStyle = muted; ctx.globalAlpha = 0.4; ctx.setLineDash([3, 4]); ctx.beginPath();
      ctx.moveTo(hover[0], 0); ctx.lineTo(hover[0], cssH); ctx.moveTo(0, hover[1]); ctx.lineTo(cssW, hover[1]); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }

  function marker(sx, sy, color, kind) {
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
    if (kind === "x") { ctx.beginPath(); ctx.moveTo(sx - 5, sy - 5); ctx.lineTo(sx + 5, sy + 5); ctx.moveTo(sx + 5, sy - 5); ctx.lineTo(sx - 5, sy + 5); ctx.stroke(); return; }
    ctx.beginPath(); ctx.arc(sx, sy, kind === "small" ? 3.5 : 5, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = (css("--panel-solid") || css("--panel")) || "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
  }
  function label(sx, sy, text, color, dx = 8, dy = -8) {
    ctx.font = "600 12px system-ui, Segoe UI, sans-serif";
    const w = ctx.measureText(text).width;
    let x = sx + dx, y = sy + dy - 14;
    if (x + w + 8 > cssW) x = sx - dx - w - 8;
    if (y < 2) y = sy + 6;
    ctx.fillStyle = (css("--panel-solid") || css("--panel")) || "#fff"; ctx.globalAlpha = 0.85; ctx.fillRect(x - 3, y - 1, w + 6, 17); ctx.globalAlpha = 1;
    ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(text, x, y + 1);
  }
  function dashed(x1, y1, x2, y2, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]); ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
  }

  function drawItem2d(m) {
    const color = m.it.color, s = scope();
    ctx.lineWidth = 2.5; ctx.strokeStyle = color; ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (m.kind === "points" && m.values) {
      const P = m.values.map((q) => ({ ...q, s: toScreen(q.c[0], q.c[1]) }));
      if (P.length === 2) {           // infinite line (faint) + segment + midpoint
        const [A, B] = P, dx = B.s[0] - A.s[0], dy = B.s[1] - A.s[1], L = Math.hypot(dx, dy) || 1, k = 4000 / L;
        ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(A.s[0] - dx * k, A.s[1] - dy * k); ctx.lineTo(A.s[0] + dx * k, A.s[1] + dy * k); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(...A.s); ctx.lineTo(...B.s); ctx.stroke();
        const mid = [(A.c[0] + B.c[0]) / 2, (A.c[1] + B.c[1]) / 2], ms = toScreen(...mid);
        marker(ms[0], ms[1], color, "small"); label(ms[0], ms[1], `M${pt(mid)}`, color, 8, 22);
        // run / rise right triangle (slope)
        if (state.trig && Math.abs(dx) > 1 && Math.abs(dy) > 1) {
          dashed(A.s[0], A.s[1], B.s[0], A.s[1], color); dashed(B.s[0], A.s[1], B.s[0], B.s[1], color);
          label((A.s[0] + B.s[0]) / 2, A.s[1], `Δx = ${n(B.c[0] - A.c[0], 3)}`, color, -20, A.s[1] < B.s[1] ? 0 : 24);
          label(B.s[0], (A.s[1] + B.s[1]) / 2, `Δy = ${n(B.c[1] - A.c[1], 3)}`, color, 8, 8);
          // angle arc at A between the horizontal and AB (screen angles, y down)
          const ref = dx >= 0 ? 0 : Math.PI, ang = Math.atan2(dy, dx);
          let diff = ang - ref;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff <= -Math.PI) diff += 2 * Math.PI;
          ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(A.s[0], A.s[1], 26, ref, ang, diff < 0); ctx.stroke();
        }
      } else if (P.length > 2) {
        ctx.globalAlpha = 0.15; ctx.fillStyle = color; ctx.beginPath(); P.forEach((q, i) => (i ? ctx.lineTo(...q.s) : ctx.moveTo(...q.s))); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1; ctx.stroke();
        if (state.trig && P.length >= 4) polygonDiagonals(P.length).forEach(([i, j]) => dashed(...P[i].s, ...P[j].s, color));
      } else if (P.length === 1 && state.trig) {   // trigonometry view: r, θ and the right triangle
        const [x, y] = P[0].c, [sx, sy] = P[0].s, [ox, oy] = toScreen(0, 0);
        if (x !== 0 || y !== 0) {
          ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(sx, sy); ctx.stroke();
          dashed(sx, sy, sx, oy, color);
          const th = Math.atan2(y, x), r = Math.hypot(x, y);
          ctx.beginPath(); ctx.arc(ox, oy, 30, 0, -th, true); ctx.stroke();   // always the positive (anticlockwise) angle
          label(ox + 34 * Math.cos(th / 2), oy - 34 * Math.sin(th / 2), `θ = ${angle(th < 0 ? th + 2 * Math.PI : th, 2)}`, color, 4, 4);
          label((ox + sx) / 2, (oy + sy) / 2, `r = ${n(r, 3)}`, color, -60, -4);
          label(sx, (sy + oy) / 2, `y = ${n(y, 3)}`, color, 6, 8);
          label((ox + sx) / 2, oy, `x = ${n(x, 3)}`, color, -20, y >= 0 ? 24 : -4);
        }
      }
      P.forEach((q) => { marker(q.s[0], q.s[1], color); label(q.s[0], q.s[1], `${q.label}${pt([q.c[0], q.c[1]])}`, color); });
      return;
    }
    if (m.kind === "fx") {
      ctx.beginPath();
      let pen = false, prev = null;
      for (let px = 0; px <= cssW; px += 1) {
        const x = toWorld(px, 0)[0], y = m.f(Object.assign(s, { x }));
        const sy = toScreen(0, y)[1];
        if (!isFinite(y) || (prev !== null && Math.abs(sy - prev) > cssH * 1.5)) { pen = false; prev = isFinite(y) ? sy : null; continue; }
        const cy = Math.max(-cssH, Math.min(2 * cssH, sy));
        if (pen) ctx.lineTo(px, cy); else { ctx.moveTo(px, cy); pen = true; }
        prev = sy;
      }
      ctx.stroke();
    } else if (m.kind === "fy") {
      ctx.beginPath();
      let pen = false, prev = null;
      for (let py = 0; py <= cssH; py += 1) {
        const y = toWorld(0, py)[1], x = m.g(Object.assign(s, { y }));
        const sx = toScreen(x, 0)[0];
        if (!isFinite(x) || (prev !== null && Math.abs(sx - prev) > cssW * 1.5)) { pen = false; prev = isFinite(x) ? sx : null; continue; }
        const cx = Math.max(-cssW, Math.min(2 * cssW, sx));
        if (pen) ctx.lineTo(cx, py); else { ctx.moveTo(cx, py); pen = true; }
        prev = sx;
      }
      ctx.stroke();
    } else if (m.kind === "implicit") {
      contour(m.F, s);
    } else if (["surface", "implicit3"].includes(m.kind)) {
      return;
    }
    // decorations from the analysis
    if (m.circle) {
      const { cx, cy, r } = m.circle, [sx, sy] = toScreen(cx, cy), [ex, ey] = toScreen(cx + r, cy);
      dashed(sx, sy, ex, ey, color); label((sx + ex) / 2, sy, `r = ${n(r, 3)}`, color, -20, -2);
    }
    if (m.linear && state.trig && Math.abs(m.linear.a) > 1e-12 && Math.abs(m.linear.b) > 1e-12) {
      const { a, b, c } = m.linear, xi = -c / a, [sx, sy] = toScreen(xi, 0), th = Math.atan(-a / b), t = th < 0 ? th + Math.PI : th;
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, 24, 0, -t, true); ctx.stroke();
      label(sx + 28 * Math.cos(t / 2), sy - 28 * Math.sin(t / 2), `θ = ${angle(t, 2)}`, color, 4, 2);
    }
    const marks = (m.info && m.info.marks) || [];
    marks.forEach((k) => {
      if (!k.p.every(isFinite)) return;
      const [sx, sy] = toScreen(...k.p);
      if (sx < -20 || sx > cssW + 20 || sy < -20 || sy > cssH + 20) return;
      marker(sx, sy, color, "small");
      if (marks.length <= 6) label(sx, sy, k.text, color);
    });
  }

  function contour(F, s) {
    const cell = 5, cols = Math.ceil(cssW / cell) + 1, rows = Math.ceil(cssH / cell) + 1;
    const val = new Float64Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const [x, y] = toWorld(i * cell, j * cell);
      val[j * cols + i] = F(Object.assign(s, { x, y }));
    }
    ctx.beginPath();
    const interp = (a, b) => a / (a - b);
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const v = [val[j * cols + i], val[j * cols + i + 1], val[(j + 1) * cols + i + 1], val[(j + 1) * cols + i]];
      if (!v.every(isFinite)) continue;
      const x = i * cell, y = j * cell, pts = [];
      const edges = [[0, 1, (t) => [x + t * cell, y]], [1, 2, (t) => [x + cell, y + t * cell]], [3, 2, (t) => [x + t * cell, y + cell]], [0, 3, (t) => [x, y + t * cell]]];
      edges.forEach(([a, b, at]) => { if ((v[a] < 0) !== (v[b] < 0)) pts.push(at(interp(v[a], v[b]))); });
      if (pts.length === 2) { ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); }
      else if (pts.length === 4) {
        const [cx, cy] = toWorld(x + cell / 2, y + cell / 2), centre = F(Object.assign(s, { x: cx, y: cy }));
        if ((centre < 0) === (v[0] < 0)) { ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.moveTo(...pts[2]); ctx.lineTo(...pts[3]); }
        else { ctx.moveTo(...pts[0]); ctx.lineTo(...pts[3]); ctx.moveTo(...pts[1]); ctx.lineTo(...pts[2]); }
      }
    }
    ctx.stroke();
  }

  // ================================================================= 3D space
  let three = null;
  const R3 = 10;   // half-size of the 3D box
  const m2t = (x, y, z) => new THREE.Vector3(x, z, -y);   // maths (z up) -> three.js (y up)

  function setup3d() {
    if (three || typeof THREE === "undefined") return;
    const wrap = $("plotWrap");
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch (e) { $("msg3d").hidden = false; return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.id = "plot3d";
    renderer.domElement.tabIndex = 0;
    wrap.append(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(10, 20, 15); scene.add(sun);
    const pivot = new THREE.Group(); scene.add(pivot);
    renderer.localClippingEnabled = true;
    // clip surfaces at the walls of the [-R3, R3]^3 box; planes follow the rotating pivot (updated every frame)
    const clipBase = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((v) => new THREE.Plane(new THREE.Vector3(...v), R3 + 0.001));
    const clip = clipBase.map((p) => p.clone());
    three = { renderer, scene, camera, pivot, content: new THREE.Group(), labels: [], rotX: 0.5, rotY: -0.7, zoom: 1, dirty: true, clip, clipBase };
    pivot.add(three.content);
    const el = renderer.domElement;
    let drag = null;
    el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      three.rotY += (e.clientX - drag.x) * 0.01;
      three.rotX = Math.max(-1.5, Math.min(1.5, three.rotX + (e.clientY - drag.y) * 0.01));
      drag = { x: e.clientX, y: e.clientY }; three.dirty = true;
    });
    el.addEventListener("pointerup", () => { drag = null; });
    el.addEventListener("wheel", (e) => { e.preventDefault(); three.zoom = Math.max(0.3, Math.min(3, three.zoom * (e.deltaY > 0 ? 1.1 : 0.9))); three.dirty = true; }, { passive: false });
    el.addEventListener("dblclick", resetView);
    el.addEventListener("keydown", (e) => {
      const k = { ArrowLeft: [0, -0.1], ArrowRight: [0, 0.1], ArrowUp: [-0.1, 0], ArrowDown: [0.1, 0] }[e.key];
      if (k) { e.preventDefault(); three.rotX += k[0]; three.rotY += k[1]; three.dirty = true; }
    });
    new ResizeObserver(() => { size3d(); }).observe(wrap);
    size3d();
    (function loop() {
      requestAnimationFrame(loop);
      if (!three.dirty || state.mode !== "3d") return;
      three.dirty = false;
      pivot.rotation.set(three.rotX, three.rotY, 0);
      pivot.updateMatrixWorld(true);
      three.clip.forEach((p, i) => p.copy(three.clipBase[i]).applyMatrix4(pivot.matrixWorld));
      camera.position.set(0, 0, R3 * 4.2 * three.zoom); camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      placeLabels3d();
    })();
  }
  function size3d() {
    if (!three) return;
    const w = $("plotWrap").clientWidth || 800, hgt = Math.max(360, Math.min(720, Math.round(w * 0.68)));
    three.renderer.setSize(w, hgt, false);
    three.renderer.domElement.style.width = w + "px"; three.renderer.domElement.style.height = hgt + "px";
    three.camera.aspect = w / hgt; three.camera.updateProjectionMatrix(); three.dirty = true;
  }

  function clear3d() {
    three.content.traverse((o) => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); });
    three.pivot.remove(three.content);
    three.content = new THREE.Group();
    three.pivot.add(three.content);
    three.labels = [];
  }
  function line3(points, color, dashedLine, opacity = 1) {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    const mat = dashedLine ? new THREE.LineDashedMaterial({ color, dashSize: 0.35, gapSize: 0.25, transparent: opacity < 1, opacity })
      : new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    const l = new THREE.Line(g, mat);
    if (dashedLine) l.computeLineDistances();
    three.content.add(l);
    return l;
  }
  function dot3(p, color, r = 0.18) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshStandardMaterial({ color }));
    s.position.copy(p); three.content.add(s);
  }
  const lab3 = (p, text, color, cls) => three.labels.push({ p, text, color, cls });

  function build3d() {
    if (state.mode !== "3d") return;
    setup3d();
    if (!three) return;
    clear3d();
    const ink = new THREE.Color(css("--ink") || "#1c2430"), muted = new THREE.Color(css("--muted") || "#5d6b7e");
    // axes, ticks, grid on the xy-plane
    [[1, 0, 0, "#dc2626", "x"], [0, 1, 0, "#16a34a", "y"], [0, 0, 1, "#2563eb", "z"]].forEach(([a, b, c, col, name]) => {
      line3([m2t(-R3 * a, -R3 * b, -R3 * c), m2t(R3 * a, R3 * b, R3 * c)], new THREE.Color(col));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 12), new THREE.MeshBasicMaterial({ color: col }));
      cone.position.copy(m2t(R3 * a, R3 * b, R3 * c));
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), m2t(a, b, c).normalize());
      three.content.add(cone);
      lab3(m2t((R3 + 0.9) * a, (R3 + 0.9) * b, (R3 + 0.9) * c), name, col, "axis");
      for (let t = -R3 + 2; t < R3; t += 2) if (t !== 0) lab3(m2t(t * a, t * b, t * c), String(t), muted.getStyle(), "tick");
    });
    const grid = new THREE.GridHelper(2 * R3, 2 * R3, muted, muted);
    grid.material.transparent = true; grid.material.opacity = 0.25;
    three.content.add(grid);
    lab3(m2t(0, 0, 0), "O", muted.getStyle(), "tick");

    models.forEach((m) => {
      const color = new THREE.Color(m.it.color), s = scope();
      try {
        if (m.kind === "points" && m.values) {
          const P = m.values.map((q) => ({ ...q, v: m2t(q.c[0], q.c[1], q.c[2]) }));
          P.forEach((q) => {
            dot3(q.v, color);
            lab3(q.v, `${q.label}${pt(q.c)}`, m.it.color);
            if (P.length === 1) {   // projection lines to the axes / xy-plane
              const foot = m2t(q.c[0], q.c[1], 0);
              line3([q.v, foot], color, true, 0.8);
              line3([foot, m2t(q.c[0], 0, 0)], color, true, 0.6);
              line3([foot, m2t(0, q.c[1], 0)], color, true, 0.6);
              line3([m2t(0, 0, 0), q.v], color, false, 0.6);
            }
          });
          if (P.length === 2) {
            line3([P[0].v, P[1].v], color);
            const mid = P[0].c.map((v, i) => (v + P[1].c[i]) / 2);
            dot3(m2t(...mid), color, 0.12); lab3(m2t(...mid), `M${pt(mid)}`, m.it.color);
          } else if (P.length > 2) {
            line3([...P.map((q) => q.v), P[0].v], color);
            if (P.length >= 4) polygonDiagonals(P.length).forEach(([i, j]) => line3([P[i].v, P[j].v], color, true, 0.8));
            if (P.length === 3) {
              const g = new THREE.BufferGeometry().setFromPoints(P.map((q) => q.v));
              three.content.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })));
            }
          }
        } else if (m.plane) {
          drawPlane(m.plane, color, m.it.color);
        } else if (m.sphere) {
          const sp = new THREE.Mesh(new THREE.SphereGeometry(m.sphere.r, 48, 32),
            new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
          sp.position.copy(m2t(...m.sphere.centre)); three.content.add(sp);
          dot3(m2t(...m.sphere.centre), color, 0.12); lab3(m2t(...m.sphere.centre), `C${pt(m.sphere.centre)}, r = ${n(m.sphere.r, 3)}`, m.it.color);
        } else if (m.kind === "surface") {
          drawSurface(m.f, color, s);
        } else if (m.kind === "fx") {
          const pts = [];
          for (let i = 0; i <= 400; i++) { const x = -R3 + 2 * R3 * i / 400, y = m.f(Object.assign(s, { x })); if (isFinite(y) && Math.abs(y) <= R3) pts.push(m2t(x, y, 0)); else if (pts.length > 1) { line3(pts.splice(0), color); } else pts.length = 0; }
          if (pts.length > 1) line3(pts, color);
        }
      } catch (_) { /* skip bad item */ }
    });
    three.dirty = true;
  }

  function drawPlane({ a, b, c, d }, color, hex) {
    // polygon = plane ∩ cube [-R3, R3]^3
    const pts = [], C = [-R3, R3];
    const edges = [];
    for (const y of C) for (const z of C) edges.push([[-R3, y, z], [R3, y, z]]);
    for (const x of C) for (const z of C) edges.push([[x, -R3, z], [x, R3, z]]);
    for (const x of C) for (const y of C) edges.push([[x, y, -R3], [x, y, R3]]);
    const f = (p) => a * p[0] + b * p[1] + c * p[2] + d;
    edges.forEach(([p, q]) => {
      const fp = f(p), fq = f(q);
      if ((fp <= 0 && fq >= 0) || (fp >= 0 && fq <= 0)) {
        if (Math.abs(fp - fq) < 1e-12) return;
        const t = fp / (fp - fq);
        pts.push(p.map((v, i) => v + (q[i] - v) * t));
      }
    });
    const uniq = pts.filter((p, i) => pts.findIndex((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-6) === i);
    if (uniq.length >= 3) {
      const cen = [0, 1, 2].map((k) => uniq.reduce((s, p) => s + p[k], 0) / uniq.length);
      const nrm = [a, b, c], u = Math.abs(a) < 0.9 * Math.hypot(a, b, c) ? cross(nrm, [1, 0, 0]) : cross(nrm, [0, 1, 0]), v = cross(nrm, u);
      uniq.sort((p, q) => Math.atan2(dot(sub(p, cen), v), dot(sub(p, cen), u)) - Math.atan2(dot(sub(q, cen), v), dot(sub(q, cen), u)));
      const tri = [];
      for (let i = 1; i < uniq.length - 1; i++) tri.push(uniq[0], uniq[i], uniq[i + 1]);
      const g = new THREE.BufferGeometry().setFromPoints(tri.map((p) => m2t(...p)));
      g.computeVertexNormals();
      three.content.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false })));
      line3([...uniq, uniq[0]].map((p) => m2t(...p)), color, false, 0.9);
    }
    // intercepts and the "intercept triangle" traces on the coordinate planes
    const ints = [[a, 0], [b, 1], [c, 2]].map(([k, i]) => (Math.abs(k) > 1e-12 ? (() => { const p = [0, 0, 0]; p[i] = -d / k; return p; })() : null));
    ints.forEach((p, i) => { if (p && Math.abs(p[i]) <= R3 * 1.5) { dot3(m2t(...p), color, 0.15); lab3(m2t(...p), `${"xyz"[i]}-int ${pt(p)}`, hex); } });
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (ints[i] && ints[j]) line3([m2t(...ints[i]), m2t(...ints[j])], color, true);
  }
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];

  function drawSurface(f, color, s) {
    const N = 60, pos = [], col = [], idx = [], zs = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = -R3 + 2 * R3 * i / N, y = -R3 + 2 * R3 * j / N, z = f(Object.assign(s, { x, y }));
      zs.push(isFinite(z) && Math.abs(z) <= R3 * 50 ? z : NaN);   // the box clipping planes trim it cleanly
      const v = m2t(x, y, isFinite(zs[zs.length - 1]) ? z : 0);
      pos.push(v.x, v.y, v.z);
    }
    const fin = zs.filter(isFinite).map((z) => Math.max(-R3, Math.min(R3, z))), lo = Math.min(...fin), hi = Math.max(...fin);
    zs.forEach((z) => { const t = isFinite(z) && hi > lo ? (z - lo) / (hi - lo) : 0.5, c = new THREE.Color().setHSL(0.66 - 0.66 * t, 0.75, 0.5); col.push(c.r, c.g, c.b); });
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d2 = c + 1;
      if ([a, b, c, d2].every((k) => isFinite(zs[k]))) idx.push(a, c, b, b, c, d2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    three.content.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.85, roughness: 0.6, clippingPlanes: three.clip })));
    three.content.add(new THREE.LineSegments(new THREE.WireframeGeometry(g), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.12, clippingPlanes: three.clip })));
  }

  function placeLabels3d() {
    const layer = $("labels3d");
    const w = three.renderer.domElement.clientWidth, hgt = three.renderer.domElement.clientHeight;
    while (layer.children.length < three.labels.length) layer.append(h("span", {}));
    while (layer.children.length > three.labels.length) layer.lastChild.remove();
    three.content.updateMatrixWorld();
    three.labels.forEach((L, i) => {
      const v = L.p.clone().applyMatrix4(three.content.matrixWorld).project(three.camera);
      const el = layer.children[i];
      el.className = "l3 " + (L.cls || "");
      el.textContent = L.text;
      el.style.color = L.color;
      el.style.left = `${(v.x + 1) / 2 * w}px`;
      el.style.top = `${(1 - v.y) / 2 * hgt}px`;
      el.hidden = v.z > 1;
    });
  }

  // ================================================================= mode, examples, init
  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
    $("plot2d").hidden = mode !== "2d";
    $("labels3d").hidden = mode !== "3d";
    $("coords").hidden = mode !== "2d";
    if (mode === "3d") { setup3d(); if (three) { three.renderer.domElement.hidden = false; size3d(); } }
    else if (three) three.renderer.domElement.hidden = true;
    renderExamples();
    rebuild();
  }
  const EXAMPLES = {
    "2d": ["A(3,4)", "A(1,2) B(6,5)", "(0,0) (4,0) (4,3)", "y = 2x + 1", "2x + 3y = 6", "x^2 + y^2 = 25", "y = a sin(bx + c)", "y = tan(x)", "y = x^2 - 4x + 3", "(x-2)^2/9 + y^2/4 = 1", "y = m x + k"],
    "3d": ["x + y + z = 6", "2x - y + 3z = 12", "P(1,2,3) Q(4,5,6)", "A(4,0,0) B(0,3,0) C(0,0,5)", "x^2 + y^2 + z^2 = 16", "z = (x^2 - y^2) / 5", "z = 3sin(x/2)cos(y/2)", "P(3,4,5)"],
  };
  function renderExamples() {
    $("examples").replaceChildren(...EXAMPLES[state.mode].map((ex) => h("button", { class: "chip", type: "button", onclick: () => {
      const empty = state.items.findIndex((it) => !it.src.trim());
      if (empty >= 0) state.items[empty].src = ex; else state.items.push({ id: state.nextId++, src: ex, color: PALETTE[state.items.length % PALETTE.length] });
      rebuild();
    } }, ex)));
  }

  function init() {
    setup2d();
    document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    document.querySelectorAll("[data-angle]").forEach((b) => b.addEventListener("click", () => {
      state.deg = b.dataset.angle === "deg";
      document.querySelectorAll("[data-angle]").forEach((x) => x.classList.toggle("on", x === b));
      refresh();
    }));
    $("trigToggle").addEventListener("change", (e) => { state.trig = e.target.checked; draw2d(); });
    $("addRow").onclick = () => addRow("");
    $("clearAll").onclick = () => { state.items = [{ id: state.nextId++, src: "", color: PALETTE[0] }]; rebuild(); };
    $("zoomIn").onclick = () => (state.mode === "2d" ? zoomAt(1.25, cssW / 2, cssH / 2) : three && (three.zoom *= 0.85, three.dirty = true));
    $("zoomOut").onclick = () => (state.mode === "2d" ? zoomAt(0.8, cssW / 2, cssH / 2) : three && (three.zoom *= 1.15, three.dirty = true));
    $("resetView").onclick = resetView;
    new MutationObserver(() => { draw2d(); if (three) { build3d(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    // /graph?e=y%3Dx%5E2&e=... opens with those expressions (used by the handwriting solver); otherwise two examples
    const given = new URLSearchParams(location.search).getAll("e").map((s) => s.trim()).filter(Boolean).slice(0, 8);
    (given.length ? given : ["y = 2x + 1", "A(3,4)"]).forEach((src, i) => state.items.push({ id: i + 1, src, color: PALETTE[i % PALETTE.length] }));
    state.nextId = state.items.length + 1;
    resetView();
    renderExamples();
    rebuild();
  }

  window.GraphPlotter = { init, state, setMode, rebuild, _models: () => models };
})();
