/* Physics Lab simulations. Each simulation is a plain object:
     { id, icon, title, blurb, params:[{k,label,min,max,step,v,unit}], options:[{k,label,choices:[[value,label]],v}],
       action?: label,            // a button (e.g. "Fire") calling sim.act(st, p)
       init(p) -> state, step(st, p, dt), draw(ctx, W, H, st, p, C), readouts(st, p) -> [[label, value, formula]],
       pointer?: { down(st,p,x,y,W,H), move(st,p,x,y,W,H), up(st,p) } }
   Texts are {en, hi}. Physics uses SI units; integration is RK4 / fixed sub-steps driven by physics.html. */
(function () {
  "use strict";
  const TAU = Math.PI * 2, rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
  const f = (v, d = 2) => (Number.isFinite(v) ? Number(v.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d }) : "—");
  const L = (en, hi) => ({ en, hi });

  function arrow(c, x1, y1, x2, y2, col, w = 2) {
    const a = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 2) return;
    c.strokeStyle = c.fillStyle = col; c.lineWidth = w;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    const hl = Math.min(10, len * 0.4);
    c.beginPath(); c.moveTo(x2, y2);
    c.lineTo(x2 - hl * Math.cos(a - 0.4), y2 - hl * Math.sin(a - 0.4));
    c.lineTo(x2 - hl * Math.cos(a + 0.4), y2 - hl * Math.sin(a + 0.4)); c.closePath(); c.fill();
  }
  function text(c, s, x, y, col, size = 12, align = "center", weight = 600) {
    c.font = `${weight} ${size}px system-ui, "Segoe UI", sans-serif`; c.fillStyle = col; c.textAlign = align; c.textBaseline = "middle"; c.fillText(s, x, y);
  }
  function rk4(y, deriv, dt) {
    const k1 = deriv(y), k2 = deriv(y.map((v, i) => v + (dt / 2) * k1[i])), k3 = deriv(y.map((v, i) => v + (dt / 2) * k2[i])),
          k4 = deriv(y.map((v, i) => v + dt * k3[i]));
    return y.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  function energyBars(c, x, y, h, items, C) {      // items: [[label, value, colour]]
    const max = Math.max(1e-9, ...items.map((it) => it[1]));           // tallest bar = largest value (E = KE + PE)
    items.forEach(([lab, v, col], i) => {
      const bx = x + i * 46, bh = (Math.max(0, v) / max) * h;
      c.fillStyle = C.line; c.fillRect(bx, y - h, 30, h);
      c.fillStyle = col; c.fillRect(bx, y - bh, 30, bh);
      text(c, lab, bx + 15, y + 12, C.muted, 11);
    });
  }
  const PLANETS = [["9.81", L("Earth", "पृथ्वी")], ["1.62", L("Moon", "चंद्रमा")], ["3.71", L("Mars", "मंगल")], ["24.79", L("Jupiter", "बृहस्पति")]];

  // =================================================================== 1. projectile
  const projectile = {
    id: "projectile", icon: "🎯", title: L("Projectile motion", "प्रक्षेप्य गति"),
    blurb: L("Launch a ball and see range, height and time of flight. Turn on air drag to see why real shots fall short.",
             "गेंद फेंकें और परास, ऊँचाई व उड्डयन काल देखें। वायु प्रतिरोध चालू करके देखें कि असली प्रक्षेप छोटे क्यों रहते हैं।"),
    params: [
      { k: "v", label: L("Launch speed u", "प्रक्षेपण चाल u"), min: 5, max: 60, step: 0.5, v: 25, unit: "m/s" },
      { k: "a", label: L("Angle θ", "कोण θ"), min: 5, max: 85, step: 1, v: 45, unit: "°" },
      { k: "h", label: L("Launch height", "प्रक्षेपण ऊँचाई"), min: 0, max: 40, step: 1, v: 0, unit: "m" },
      { k: "g", label: L("Gravity g", "गुरुत्व g"), min: 1, max: 25, step: 0.01, v: 9.81, unit: "m/s²", presets: PLANETS },
      { k: "drag", label: L("Air drag k", "वायु प्रतिरोध k"), min: 0, max: 0.05, step: 0.001, v: 0, unit: "1/m" },
    ],
    action: L("🚀 Launch", "🚀 फेंकें"),
    theory(p) {
      const th = rad(p.a), vx = p.v * Math.cos(th), vy = p.v * Math.sin(th);
      const T = (vy + Math.sqrt(vy * vy + 2 * p.g * p.h)) / p.g;
      return { T, H: p.h + (vy * vy) / (2 * p.g), R: vx * T };
    },
    init(p) { const th = this.theory(p); return { shots: [], cur: null, scaleR: Math.max(th.R, 10) * 1.12, scaleH: Math.max(th.H, 5) * 1.25 }; },
    act(st, p) {
      const th = rad(p.a);
      st.cur = { x: 0, y: p.h, vx: p.v * Math.cos(th), vy: p.v * Math.sin(th), t: 0, trail: [[0, p.h]], done: false, maxY: p.h, hue: st.shots.length };
      st.shots.push(st.cur);
      if (st.shots.length > 6) st.shots.shift();
      const t = this.theory(p);
      st.scaleR = Math.max(st.scaleR, t.R * 1.12, 10); st.scaleH = Math.max(st.scaleH, t.H * 1.25, 5);
    },
    step(st, p, dt) {
      const s = st.cur;
      if (!s || s.done) return;
      const sp = Math.hypot(s.vx, s.vy);
      const ax = -p.drag * sp * s.vx, ay = -p.g - p.drag * sp * s.vy;
      const nx = s.x + s.vx * dt + 0.5 * ax * dt * dt, ny = s.y + s.vy * dt + 0.5 * ay * dt * dt;   // exact for constant g
      if (ny < 0) {                                           // land exactly on the ground
        const k = s.y / (s.y - ny);
        s.x += s.vx * dt * k; s.y = 0; s.t += dt * k; s.done = true; s.trail.push([s.x, 0]); return;
      }
      s.x = nx; s.y = ny; s.vx += ax * dt; s.vy += ay * dt; s.t += dt;
      s.maxY = Math.max(s.maxY, s.y);
      if (s.trail.length === 0 || Math.hypot(s.x - s.trail[s.trail.length - 1][0], s.y - s.trail[s.trail.length - 1][1]) > st.scaleR / 300) s.trail.push([s.x, s.y]);
    },
    draw(c, W, H, st, p, C) {
      const m = 46, gx = m, gy = H - 40;
      const k = Math.min((W - 2 * m) / st.scaleR, (gy - 30) / st.scaleH);
      const X = (x) => gx + x * k, Y = (y) => gy - y * k;
      // grid + ground
      c.strokeStyle = C.grid; c.lineWidth = 1;
      const step = niceStep(st.scaleR / 8);
      for (let x = 0; x <= st.scaleR; x += step) { c.beginPath(); c.moveTo(X(x), Y(0)); c.lineTo(X(x), 20); c.stroke(); text(c, f(x, 0), X(x), gy + 14, C.muted, 11); }
      for (let y = step; y <= st.scaleH; y += step) { c.beginPath(); c.moveTo(gx, Y(y)); c.lineTo(W - 10, Y(y)); c.stroke(); text(c, f(y, 0), gx - 8, Y(y), C.muted, 11, "right"); }
      c.strokeStyle = C.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke();
      text(c, "x (m)", W - 30, gy + 26, C.muted, 11); text(c, "y (m)", gx, 12, C.muted, 11);
      if (p.h > 0) { c.fillStyle = C.line; c.fillRect(gx - 14, Y(p.h), 14, p.h * k); }
      // predicted path (no drag) — dashed
      const th = rad(p.a), tt = this.theory(p);
      c.setLineDash([5, 5]); c.strokeStyle = C.muted; c.lineWidth = 1.5; c.beginPath();
      for (let i = 0; i <= 60; i++) { const t = (tt.T * i) / 60; const x = p.v * Math.cos(th) * t, y = p.h + p.v * Math.sin(th) * t - 0.5 * p.g * t * t; i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)); }
      c.stroke(); c.setLineDash([]);
      // launcher
      arrow(c, X(0), Y(p.h), X(0) + 46 * Math.cos(th), Y(p.h) - 46 * Math.sin(th), C.accent, 3);
      // shots
      const cols = [C.accent, C.accent2, C.ok, C.warn, "#f472b6", "#22d3ee"];
      st.shots.forEach((s) => {
        const col = cols[s.hue % cols.length];
        c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath();
        s.trail.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.stroke();
        c.fillStyle = col; c.beginPath(); c.arc(X(s.x), Y(s.y), 7, 0, TAU); c.fill();
        if (s === st.cur && !s.done) {
          arrow(c, X(s.x), Y(s.y), X(s.x) + s.vx * 2.2, Y(s.y), C.ok, 2);
          arrow(c, X(s.x), Y(s.y), X(s.x), Y(s.y) - s.vy * 2.2, C.warn, 2);
        }
        if (s.done) text(c, `${f(s.x, 1)} m`, X(s.x), gy - 14, col, 12);
      });
    },
    readouts(st, p) {
      const t = this.theory(p), s = st.cur;
      return [
        [L("Time of flight T", "उड्डयन काल T"), `${f(t.T)} s`, p.h ? "T = (u sinθ + √(u²sin²θ + 2gh)) / g" : "T = 2u sinθ / g"],
        [L("Max height H", "अधिकतम ऊँचाई H"), `${f(t.H)} m`, "H = h + u² sin²θ / 2g"],
        [L("Range R", "परास R"), `${f(t.R)} m`, p.h ? "R = u cosθ · T" : "R = u² sin2θ / g"],
        [L("Best angle (h = 0)", "सर्वोत्तम कोण (h = 0)"), "45°", "R is largest when sin2θ = 1"],
        ...(s ? [[L("Flight now: t, x, y", "अभी: t, x, y"), `${f(s.t)} s · ${f(s.x, 1)} m · ${f(s.y, 1)} m`, ""],
                 [L("Velocity now", "अभी का वेग"), `${f(Math.hypot(s.vx, s.vy), 1)} m/s`, "v = √(vx² + vy²)"],
                 ...(s.done && p.drag > 0 ? [[L("Landed (with drag)", "गिरी (प्रतिरोध सहित)"), `${f(s.x, 1)} m (${f(100 * s.x / t.R, 0)}%)`, ""]] : [])] : []),
      ];
    },
  };
  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))), q = raw / p; return (q < 1.5 ? 1 : q < 3.5 ? 2 : q < 7.5 ? 5 : 10) * p; }

  // =================================================================== 2. pendulum
  const pendulum = {
    id: "pendulum", icon: "🕰", title: L("Simple pendulum", "सरल लोलक"),
    blurb: L("The period depends on length and gravity — not on the mass. Big swings take a little longer than the formula says.",
             "आवर्तकाल लंबाई और गुरुत्व पर निर्भर है — द्रव्यमान पर नहीं। बड़े दोलन सूत्र से थोड़ा अधिक समय लेते हैं।"),
    params: [
      { k: "L", label: L("Length L", "लंबाई L"), min: 0.2, max: 5, step: 0.05, v: 1.5, unit: "m" },
      { k: "th", label: L("Start angle θ₀", "आरंभिक कोण θ₀"), min: 2, max: 85, step: 1, v: 20, unit: "°" },
      { k: "g", label: L("Gravity g", "गुरुत्व g"), min: 1, max: 25, step: 0.01, v: 9.81, unit: "m/s²", presets: PLANETS },
      { k: "m", label: L("Bob mass m", "गोलक द्रव्यमान m"), min: 0.1, max: 5, step: 0.1, v: 1, unit: "kg" },
      { k: "b", label: L("Damping", "अवमंदन"), min: 0, max: 0.6, step: 0.01, v: 0, unit: "1/s" },
    ],
    init(p) { return { th: rad(p.th), w: 0, t: 0, lastCross: null, periods: [], trail: [] }; },
    step(st, p, dt) {
      const prev = st.th;
      [st.th, st.w] = rk4([st.th, st.w], ([th, w]) => [w, -(p.g / p.L) * Math.sin(th) - p.b * w], dt);
      st.t += dt;
      if (prev < 0 && st.th >= 0) {                               // upward zero crossing -> full period
        const tc = st.t - dt * (st.th / (st.th - prev));
        if (st.lastCross != null) { st.periods.push(tc - st.lastCross); if (st.periods.length > 3) st.periods.shift(); }
        st.lastCross = tc;
      }
    },
    draw(c, W, H, st, p, C) {
      const px = W / 2, py = 40, k = Math.min((H - 110) / p.L, (W / 2 - 40) / p.L) * 0.95;
      const bx = px + Math.sin(st.th) * p.L * k, by = py + Math.cos(st.th) * p.L * k;
      c.fillStyle = C.line; c.fillRect(px - 80, py - 10, 160, 8);
      c.setLineDash([3, 5]); c.strokeStyle = C.muted; c.lineWidth = 1; c.beginPath(); c.moveTo(px, py); c.lineTo(px, py + p.L * k + 20); c.stroke();
      c.beginPath(); c.arc(px, py, p.L * k, Math.PI / 2 - rad(p.th), Math.PI / 2 + rad(p.th)); c.stroke(); c.setLineDash([]);
      c.strokeStyle = C.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(px, py); c.lineTo(bx, by); c.stroke();
      const r = 10 + 6 * Math.cbrt(p.m);
      const grd = c.createRadialGradient(bx - r / 3, by - r / 3, 2, bx, by, r);
      grd.addColorStop(0, "#fff"); grd.addColorStop(1, C.accent);
      c.fillStyle = grd; c.beginPath(); c.arc(bx, by, r, 0, TAU); c.fill();
      text(c, `θ = ${f(deg(st.th), 1)}°`, px + 50, py + 30, C.ink, 13, "left");
      const KE = 0.5 * p.m * (p.L * st.w) ** 2, PE = p.m * p.g * p.L * (1 - Math.cos(st.th));
      energyBars(c, 24, H - 30, 110, [["KE", KE, C.ok], ["PE", PE, C.accent2], ["E", KE + PE, C.warn]], C);
    },
    readouts(st, p) {
      const T0 = TAU * Math.sqrt(p.L / p.g), meas = st.periods.length ? st.periods.reduce((a, b) => a + b) / st.periods.length : null;
      const KE = 0.5 * p.m * (p.L * st.w) ** 2, PE = p.m * p.g * p.L * (1 - Math.cos(st.th));
      return [
        [L("Period (small swings)", "आवर्तकाल (छोटे दोलन)"), `${f(T0, 3)} s`, "T = 2π√(L / g)"],
        [L("Period measured", "मापा गया आवर्तकाल"), meas ? `${f(meas, 3)} s (${meas > T0 ? "+" : ""}${f(100 * (meas / T0 - 1), 1)}%)` : "…", ""],
        [L("Frequency", "आवृत्ति"), `${f(1 / T0, 3)} Hz`, "f = 1 / T"],
        [L("Angle, angular speed", "कोण, कोणीय चाल"), `${f(deg(st.th), 1)}° · ${f(st.w, 2)} rad/s`, ""],
        [L("Kinetic energy", "गतिज ऊर्जा"), `${f(KE, 3)} J`, "KE = ½ m v²"],
        [L("Potential energy", "स्थितिज ऊर्जा"), `${f(PE, 3)} J`, "PE = m g L (1 − cosθ)"],
      ];
    },
  };

  // =================================================================== 3. spring – mass (SHM)
  const spring = {
    id: "spring", icon: "🌀", title: L("Spring–mass (SHM)", "कमानी–द्रव्यमान (सरल आवर्त गति)"),
    blurb: L("A stiffer spring or a lighter mass oscillates faster. Watch x, v and energy trade places every quarter cycle.",
             "कठोर कमानी या हल्का द्रव्यमान तेज़ दोलन करता है। हर चौथाई चक्र में x, v और ऊर्जा का आदान-प्रदान देखें।"),
    params: [
      { k: "k", label: L("Spring constant k", "कमानी नियतांक k"), min: 2, max: 200, step: 1, v: 40, unit: "N/m" },
      { k: "m", label: L("Mass m", "द्रव्यमान m"), min: 0.1, max: 5, step: 0.1, v: 1, unit: "kg" },
      { k: "A", label: L("Amplitude A", "आयाम A"), min: 0.05, max: 0.5, step: 0.01, v: 0.3, unit: "m" },
      { k: "c", label: L("Damping c", "अवमंदन c"), min: 0, max: 3, step: 0.05, v: 0, unit: "kg/s" },
    ],
    init(p) { return { x: p.A, v: 0, t: 0, hist: [] }; },
    step(st, p, dt) {
      [st.x, st.v] = rk4([st.x, st.v], ([x, v]) => [v, -(p.k / p.m) * x - (p.c / p.m) * v], dt);
      st.t += dt;
      const last = st.hist[st.hist.length - 1];
      if (!last || st.t - last[0] > 0.02) { st.hist.push([st.t, st.x]); if (st.hist.length > 400) st.hist.shift(); }
    },
    draw(c, W, H, st, p, C) {
      const wallX = 40, cy = H * 0.3, k = (W * 0.45) / 0.6, eqX = wallX + 0.6 * k * 0.9;
      const bx = eqX + st.x * k, bw = 40 + 20 * Math.cbrt(p.m);
      c.fillStyle = C.line; c.fillRect(wallX - 14, cy - 50, 14, 100);
      c.strokeStyle = C.muted; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(eqX, cy - 60); c.lineTo(eqX, cy + 60); c.stroke(); c.setLineDash([]);
      text(c, "x = 0", eqX, cy - 70, C.muted, 11);
      // zig-zag spring
      const n = 14, x0 = wallX, x1 = bx - bw / 2;
      c.strokeStyle = C.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, cy);
      for (let i = 1; i < n; i++) c.lineTo(x0 + ((x1 - x0) * i) / n, cy + (i % 2 ? -14 : 14));
      c.lineTo(x1, cy); c.stroke();
      c.fillStyle = C.accent; c.fillRect(bx - bw / 2, cy - bw / 2, bw, bw);
      text(c, `${p.m} kg`, bx, cy, "#fff", 12);
      c.strokeStyle = C.ink; c.beginPath(); c.moveTo(0, cy + bw / 2 + 2); c.lineTo(W, cy + bw / 2 + 2); c.stroke();
      arrow(c, bx, cy - bw / 2 - 12, bx + st.v * k * 0.25, cy - bw / 2 - 12, C.ok, 2);
      // x–t graph
      const gx = 40, gy = H * 0.72, gw = W - 80, gh = H * 0.22;
      c.strokeStyle = C.line; c.lineWidth = 1; c.strokeRect(gx, gy - gh, gw, 2 * gh);
      c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + gw, gy); c.stroke();
      text(c, "x(t)", gx + 18, gy - gh + 12, C.muted, 11);
      if (st.hist.length > 1) {
        const t0 = st.hist[0][0], span = Math.max(8, st.t - t0);
        c.strokeStyle = C.accent; c.lineWidth = 2; c.beginPath();
        st.hist.forEach(([t, x], i) => { const X = gx + ((t - t0) / span) * gw, Y = gy - (x / p.A) * gh * 0.9; i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
        c.stroke();
      }
      const KE = 0.5 * p.m * st.v * st.v, PE = 0.5 * p.k * st.x * st.x;
      energyBars(c, W - 160, H * 0.42, 70, [["KE", KE, C.ok], ["PE", PE, C.accent2], ["E", KE + PE, C.warn]], C);
    },
    readouts(st, p) {
      const w = Math.sqrt(p.k / p.m);
      return [
        [L("Angular frequency ω", "कोणीय आवृत्ति ω"), `${f(w, 3)} rad/s`, "ω = √(k / m)"],
        [L("Period T", "आवर्तकाल T"), `${f(TAU / w, 3)} s`, "T = 2π√(m / k)"],
        [L("Frequency f", "आवृत्ति f"), `${f(w / TAU, 3)} Hz`, "f = 1 / T"],
        [L("x, v, a now", "अभी x, v, a"), `${f(st.x, 3)} m · ${f(st.v, 2)} m/s · ${f(-(p.k / p.m) * st.x, 2)} m/s²`, "a = −ω² x"],
        [L("Max speed", "अधिकतम चाल"), `${f(w * p.A, 3)} m/s`, "v_max = ω A"],
        [L("Total energy", "कुल ऊर्जा"), `${f(0.5 * p.k * p.A * p.A, 3)} J`, "E = ½ k A²"],
      ];
    },
  };

  // =================================================================== 4. collisions (1-D)
  const collision = {
    id: "collision", icon: "🎱", title: L("1-D collisions", "एक-विमीय संघट्ट"),
    blurb: L("Momentum is always conserved. Kinetic energy is conserved only when e = 1 (elastic); with e = 0 the blocks stick.",
             "संवेग हमेशा संरक्षित रहता है। गतिज ऊर्जा केवल e = 1 (प्रत्यास्थ) पर संरक्षित; e = 0 पर गुटके चिपक जाते हैं।"),
    params: [
      { k: "m1", label: L("Mass m₁", "द्रव्यमान m₁"), min: 0.5, max: 10, step: 0.5, v: 2, unit: "kg" },
      { k: "u1", label: L("Velocity u₁", "वेग u₁"), min: -6, max: 6, step: 0.5, v: 4, unit: "m/s" },
      { k: "m2", label: L("Mass m₂", "द्रव्यमान m₂"), min: 0.5, max: 10, step: 0.5, v: 1, unit: "kg" },
      { k: "u2", label: L("Velocity u₂", "वेग u₂"), min: -6, max: 6, step: 0.5, v: -2, unit: "m/s" },
      { k: "e", label: L("Restitution e", "प्रत्यावस्थान गुणांक e"), min: 0, max: 1, step: 0.05, v: 1, unit: "" },
    ],
    after(p) {
      const P = p.m1 * p.u1 + p.m2 * p.u2, M = p.m1 + p.m2;
      return { v1: (P - p.m2 * p.e * (p.u1 - p.u2)) / M, v2: (P + p.m1 * p.e * (p.u1 - p.u2)) / M };
    },
    init(p) { return { x1: -3, x2: 3, v1: p.u1, v2: p.u2, hit: false, t: 0 }; },
    step(st, p, dt) {
      // replay: 3 s after the collision (or 6 s without one) start again
      if ((st.hit && st.t - st.hitT > 3) || (!st.hit && st.t > 6)) { Object.assign(st, this.init(p), { lang: st.lang }); return; }
      st.x1 += st.v1 * dt; st.x2 += st.v2 * dt; st.t += dt;
      const w1 = 0.3 * Math.cbrt(p.m1), w2 = 0.3 * Math.cbrt(p.m2);
      if (!st.hit && st.x1 + w1 / 2 >= st.x2 - w2 / 2 && st.v1 > st.v2) {
        const a = this.after(p); st.v1 = a.v1; st.v2 = a.v2; st.hit = true; st.hitT = st.t;
        const gap = st.x1 + w1 / 2 - (st.x2 - w2 / 2); st.x1 -= gap / 2; st.x2 += gap / 2;
      }
    },
    draw(c, W, H, st, p, C) {
      const k = W / 10, X = (x) => W / 2 + x * k, cy = H * 0.45;
      c.strokeStyle = C.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(0, cy + 60); c.lineTo(W, cy + 60); c.stroke();
      for (let x = -5; x <= 5; x++) text(c, `${x}`, X(x), cy + 76, C.muted, 10);
      [[st.x1, p.m1, st.v1, C.accent, "1"], [st.x2, p.m2, st.v2, C.accent2, "2"]].forEach(([x, m, v, col, n]) => {
        const s = 0.3 * Math.cbrt(m) * k;
        c.fillStyle = col; c.fillRect(X(x) - s / 2, cy + 60 - s, s, s);
        text(c, `m${n === "1" ? "₁" : "₂"} = ${m}`, X(x), cy + 60 - s / 2, "#fff", 12);
        arrow(c, X(x), cy + 60 - s - 18, X(x) + v * 18, cy + 60 - s - 18, col, 3);
        text(c, `${f(v, 2)} m/s`, X(x), cy + 60 - s - 34, col, 12);
      });
      if (st.hit) text(c, "💥", W / 2, 40, C.ink, 22);
    },
    readouts(st, p) {
      const a = this.after(p), pb = p.m1 * p.u1 + p.m2 * p.u2, pa = p.m1 * a.v1 + p.m2 * a.v2;
      const kb = 0.5 * p.m1 * p.u1 ** 2 + 0.5 * p.m2 * p.u2 ** 2, ka = 0.5 * p.m1 * a.v1 ** 2 + 0.5 * p.m2 * a.v2 ** 2;
      return [
        [L("Velocities after", "बाद के वेग"), `v₁ = ${f(a.v1)} · v₂ = ${f(a.v2)} m/s`, "v₁ = (m₁u₁ + m₂u₂ − m₂e(u₁ − u₂)) / (m₁ + m₂)"],
        [L("Momentum before → after", "संवेग पहले → बाद"), `${f(pb)} → ${f(pa)} kg·m/s`, "m₁u₁ + m₂u₂ = m₁v₁ + m₂v₂"],
        [L("Kinetic energy before → after", "गतिज ऊर्जा पहले → बाद"), `${f(kb)} → ${f(ka)} J`, "KE = ½ m v²"],
        [L("Energy lost (heat, sound)", "ऊर्जा हानि (ऊष्मा, ध्वनि)"), `${f(kb - ka)} J (${f(kb ? (100 * (kb - ka)) / kb : 0, 1)}%)`, ""],
        [L("Type", "प्रकार"), p.e === 1 ? L("Elastic", "प्रत्यास्थ") : p.e === 0 ? L("Perfectly inelastic", "पूर्णतः अप्रत्यास्थ") : L("Inelastic", "अप्रत्यास्थ"), "e = (v₂ − v₁) / (u₁ − u₂)"],
        ...(p.u1 <= p.u2 ? [[L("No collision", "संघट्ट नहीं"), L("block 1 must be faster than block 2", "गुटका 1, गुटके 2 से तेज़ होना चाहिए"), ""]] : []),
      ];
    },
  };

  // =================================================================== 5. thin lens
  const lens = {
    id: "lens", icon: "🔍", title: L("Lens ray diagram", "लेंस किरण आरेख"),
    blurb: L("Drag the object (the arrow). Three principal rays find the image; the lens formula gives the same answer.",
             "वस्तु (तीर) को खींचें। तीन मुख्य किरणें प्रतिबिंब ढूँढती हैं; लेंस सूत्र भी वही उत्तर देता है।"),
    params: [
      { k: "f", label: L("Focal length |f|", "फोकस दूरी |f|"), min: 5, max: 30, step: 0.5, v: 12, unit: "cm" },
      { k: "u", label: L("Object distance |u|", "वस्तु दूरी |u|"), min: 2, max: 60, step: 0.5, v: 30, unit: "cm" },
      { k: "ho", label: L("Object height", "वस्तु की ऊँचाई"), min: 1, max: 8, step: 0.5, v: 4, unit: "cm" },
    ],
    options: [{ k: "type", label: L("Lens", "लेंस"), choices: [["convex", L("Convex (converging)", "उत्तल (अभिसारी)")], ["concave", L("Concave (diverging)", "अवतल (अपसारी)")]], v: "convex" }],
    still: true,
    init() { return { drag: false }; },
    step() {},
    solve(p) {
      const F = p.type === "convex" ? p.f : -p.f, u = -p.u, den = 1 / F + 1 / u;     // Cartesian: 1/v − 1/u = 1/f
      if (Math.abs(den) < 1e-9) return { F, u, v: Infinity, m: Infinity };
      const v = 1 / den;
      return { F, u, v, m: v / u };
    },
    draw(c, W, H, st, p, C) {
      const s = this.solve(p), cx = W / 2, cy = H / 2;
      // zoom to fit object, image and both 2F points; keep the zoom fixed while the object is being dragged
      if (!st.drag || !st.k) {
        const vx = Number.isFinite(s.v) ? Math.min(Math.abs(s.v), 120) : 0, hi = Number.isFinite(s.v) ? Math.min(Math.abs(p.ho * s.m), 40) : 0;
        const span = Math.max(2.3 * p.f, p.u * 1.15, vx * 1.1, 20), tall = Math.max(p.ho, hi, 6) * 1.35;
        st.k = Math.min((W / 2 - 20) / span, (H / 2 - 30) / tall);
      }
      const k = st.k;
      const X = (x) => cx + x * k, Y = (y) => cy - y * k;
      st.cx = cx; st.cy = cy;
      c.strokeStyle = C.muted; c.lineWidth = 1; c.beginPath(); c.moveTo(0, cy); c.lineTo(W, cy); c.stroke();
      // lens
      const lh = 11 * k;
      c.strokeStyle = C.accent; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy - lh); c.lineTo(cx, cy + lh); c.stroke();
      const tip = p.type === "convex" ? 1 : -1;
      [[-1, cy - lh], [1, cy + lh]].forEach(([d, y]) => { c.beginPath(); c.moveTo(cx - 8, y - d * tip * 8); c.lineTo(cx, y); c.lineTo(cx + 8, y - d * tip * 8); c.stroke(); });
      [[-1, "F"], [1, "F′"], [-2, "2F"], [2, "2F′"]].forEach(([m, lab]) => { const x = X(m * p.f); c.fillStyle = C.ink; c.beginPath(); c.arc(x, cy, 3, 0, TAU); c.fill(); text(c, lab, x, cy + 14, C.muted, 11); });
      // object
      const ox = X(s.u), oy = Y(p.ho);
      arrow(c, ox, cy, ox, oy, C.ok, 3); text(c, L("Object", "वस्तु")[st.lang || "en"], ox, cy + 30, C.ok, 11);
      // rays: each hits the lens at height yh and then goes toward (real) / away from (virtual) the image point
      const raysAt = [p.ho, 0, (() => { const Fo = -s.F, t = -s.u / (Fo - s.u); return p.ho * (1 - t); })()];
      const cols = ["#f59e0b", "#38bdf8", "#f472b6"];
      const fin = Number.isFinite(s.v);
      const iy = fin ? p.ho * s.m : 0;
      raysAt.forEach((yh, i) => {
        if (!Number.isFinite(yh) || Math.abs(yh) > 60) return;
        c.strokeStyle = cols[i]; c.lineWidth = 1.8;
        c.beginPath(); c.moveTo(ox, oy); c.lineTo(X(0), Y(yh)); c.stroke();
        let dx, dy;
        if (!fin) { dx = -s.u; dy = -p.ho; }                     // object at F: every ray leaves parallel to the central ray
        else if (s.v > 0) { dx = s.v; dy = iy - yh; }
        else { dx = -s.v; dy = yh - iy; }
        const len = 300 / Math.hypot(dx, dy);
        c.beginPath(); c.moveTo(X(0), Y(yh)); c.lineTo(X(dx * len), Y(yh + dy * len)); c.stroke();
        if (fin && s.v < 0) { c.setLineDash([5, 5]); c.beginPath(); c.moveTo(X(0), Y(yh)); c.lineTo(X(s.v), Y(iy)); c.stroke(); c.setLineDash([]); }
      });
      if (fin && Math.abs(s.v) < 200) {
        if (s.v < 0) c.setLineDash([6, 4]);
        arrow(c, X(s.v), cy, X(s.v), Y(iy), C.accent2, 3); c.setLineDash([]);
        text(c, L("Image", "प्रतिबिंब")[st.lang || "en"], X(s.v), cy + (iy > 0 ? 30 : -30), C.accent2, 11);
      }
    },
    pointer: {
      down(st, p, x, y) { const ox = st.cx - p.u * st.k; if (Math.abs(x - ox) < 24) { st.drag = true; return true; } return false; },
      move(st, p, x) { if (!st.drag) return false; p.u = Math.max(2, Math.min(60, Math.round(((st.cx - x) / st.k) * 2) / 2)); return true; },
      up(st) { st.drag = false; },
    },
    readouts(st, p) {
      const s = this.solve(p), lang = st.lang || "en";
      if (!Number.isFinite(s.v)) return [[L("Image", "प्रतिबिंब"), L("at infinity (object at F)", "अनंत पर (वस्तु F पर)"), "1/v − 1/u = 1/f"]];
      const real = s.v > 0;
      const nature = [real ? L("real", "वास्तविक")[lang] : L("virtual", "आभासी")[lang], s.m < 0 ? L("inverted", "उल्टा")[lang] : L("erect", "सीधा")[lang],
                      Math.abs(s.m) > 1.001 ? L("magnified", "आवर्धित")[lang] : Math.abs(s.m) < 0.999 ? L("diminished", "छोटा")[lang] : L("same size", "समान आकार")[lang]].join(", ");
      return [
        [L("Focal length f", "फोकस दूरी f"), `${f(s.F, 1)} cm`, L("convex: +, concave: −", "उत्तल: +, अवतल: −")],
        [L("Object distance u", "वस्तु दूरी u"), `${f(s.u, 1)} cm`, L("measured from the lens, left is −", "लेंस से, बाईं ओर −")],
        [L("Image distance v", "प्रतिबिंब दूरी v"), `${f(s.v, 2)} cm`, "1/v − 1/u = 1/f"],
        [L("Magnification m", "आवर्धन m"), `${f(s.m, 3)}×`, "m = v / u = hᵢ / hₒ"],
        [L("Image height", "प्रतिबिंब ऊँचाई"), `${f(p.ho * s.m, 2)} cm`, "hᵢ = m · hₒ"],
        [L("Nature", "प्रकृति"), nature, ""],
        [L("Power", "क्षमता"), `${f(100 / s.F, 2)} D`, "P = 1 / f (f in m)"],
      ];
    },
  };

  // =================================================================== 6. circuit (Ohm's law)
  const circuit = {
    id: "circuit", icon: "🔋", title: L("Electric circuit (Ohm's law)", "विद्युत परिपथ (ओम का नियम)"),
    blurb: L("Change the voltage and resistors. Moving dots show the current — faster dots, more current.",
             "वोल्टता और प्रतिरोध बदलें। चलते बिंदु धारा दिखाते हैं — तेज़ बिंदु, अधिक धारा।"),
    params: [
      { k: "V", label: L("Battery voltage V", "बैटरी वोल्टता V"), min: 1, max: 24, step: 0.5, v: 12, unit: "V" },
      { k: "R1", label: L("Resistor R₁", "प्रतिरोध R₁"), min: 1, max: 100, step: 1, v: 10, unit: "Ω" },
      { k: "R2", label: L("Resistor R₂", "प्रतिरोध R₂"), min: 1, max: 100, step: 1, v: 20, unit: "Ω" },
    ],
    options: [{ k: "mode", label: L("Connection", "संयोजन"), choices: [["series", L("Series", "श्रेणीक्रम")], ["parallel", L("Parallel", "पार्श्वक्रम")]], v: "series" }],
    solve(p) {
      if (p.mode === "series") { const R = p.R1 + p.R2, I = p.V / R; return { R, I, I1: I, I2: I, V1: I * p.R1, V2: I * p.R2 }; }
      const R = (p.R1 * p.R2) / (p.R1 + p.R2), I = p.V / R;
      return { R, I, I1: p.V / p.R1, I2: p.V / p.R2, V1: p.V, V2: p.V };
    },
    init() { return { phase: 0 }; },
    step(st, p, dt) { st.phase += dt; },
    draw(c, W, H, st, p, C) {
      const s = this.solve(p);
      const l = W * 0.18, r = W * 0.82, t = H * 0.22, b = H * 0.78, mid = (t + b) / 2;
      c.lineWidth = 3; c.strokeStyle = C.ink;
      const resistor = (x1, y, x2, label) => {
        const n = 8, w = x2 - x1;
        c.beginPath(); c.moveTo(x1, y);
        for (let i = 1; i < n; i++) c.lineTo(x1 + (w * i) / n, y + (i % 2 ? -10 : 10));
        c.lineTo(x2, y); c.stroke(); text(c, label, (x1 + x2) / 2, y - 24, C.ink, 13);
      };
      const wire = (pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); };
      let paths;
      if (p.mode === "series") {
        wire([[l, mid - 20], [l, t], [l + (r - l) * 0.2, t]]); resistor(l + (r - l) * 0.2, t, l + (r - l) * 0.42, `R₁ = ${p.R1} Ω`);
        wire([[l + (r - l) * 0.42, t], [l + (r - l) * 0.58, t]]); resistor(l + (r - l) * 0.58, t, l + (r - l) * 0.8, `R₂ = ${p.R2} Ω`);
        wire([[l + (r - l) * 0.8, t], [r, t], [r, b], [l, b], [l, mid + 20]]);
        paths = [{ pts: [[l, mid], [l, t], [r, t], [r, b], [l, b], [l, mid]], I: s.I }];
      } else {
        const t2 = t + (b - t) * 0.42, x1 = l + (r - l) * 0.3, x2 = l + (r - l) * 0.7;
        wire([[l, mid - 20], [l, t], [x1, t]]); resistor(x1, t, x2, `R₁ = ${p.R1} Ω`); wire([[x2, t], [r, t], [r, b], [l, b], [l, mid + 20]]);
        wire([[l + (r - l) * 0.15, t], [l + (r - l) * 0.15, t2], [x1, t2]]); resistor(x1, t2, x2, `R₂ = ${p.R2} Ω`);
        wire([[x2, t2], [l + (r - l) * 0.85, t2], [l + (r - l) * 0.85, t]]);
        c.fillStyle = C.ink; [[l + (r - l) * 0.15, t], [l + (r - l) * 0.85, t]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill(); });
        paths = [{ pts: [[l + (r - l) * 0.15, t], [r, t]], I: s.I1, off: 0 }, { pts: [[l + (r - l) * 0.15, t], [l + (r - l) * 0.15, t2], [l + (r - l) * 0.85, t2], [l + (r - l) * 0.85, t]], I: s.I2 },
                 { pts: [[r, t], [r, b], [l, b], [l, t], [l + (r - l) * 0.15, t]], I: s.I }];
      }
      // battery (long + short plates)
      c.lineWidth = 4; c.beginPath(); c.moveTo(l - 22, mid - 20); c.lineTo(l + 22, mid - 20); c.stroke();
      c.lineWidth = 6; c.beginPath(); c.moveTo(l - 12, mid + 20); c.lineTo(l + 12, mid + 20); c.stroke();
      text(c, "+", l + 32, mid - 20, C.warn, 16); text(c, `${p.V} V`, l - 46, mid, C.ink, 14);
      // current dots (conventional current, + to −): speed ∝ current
      paths.forEach((pa) => {
        const segs = []; let total = 0;
        for (let i = 1; i < pa.pts.length; i++) { const d = Math.hypot(pa.pts[i][0] - pa.pts[i - 1][0], pa.pts[i][1] - pa.pts[i - 1][1]); segs.push(d); total += d; }
        const spacing = 34, shift = (st.phase * pa.I * 160) % spacing;
        c.fillStyle = C.warn;
        for (let d = shift; d < total; d += spacing) {
          let acc = 0, i = 0; while (i < segs.length && acc + segs[i] < d) { acc += segs[i]; i++; }
          if (i >= segs.length) break;
          const q = (d - acc) / segs[i], a = pa.pts[i], z = pa.pts[i + 1];
          c.beginPath(); c.arc(a[0] + (z[0] - a[0]) * q, a[1] + (z[1] - a[1]) * q, 4, 0, TAU); c.fill();
        }
      });
      text(c, `I = ${f(s.I, 3)} A`, (l + r) / 2, b + 26, C.warn, 14);
    },
    readouts(st, p) {
      const s = this.solve(p);
      return [
        [L("Equivalent resistance", "तुल्य प्रतिरोध"), `${f(s.R, 3)} Ω`, p.mode === "series" ? "R = R₁ + R₂" : "1/R = 1/R₁ + 1/R₂"],
        [L("Total current I", "कुल धारा I"), `${f(s.I, 3)} A`, "I = V / R"],
        [L("Through R₁, R₂", "R₁, R₂ में धारा"), `${f(s.I1, 3)} A · ${f(s.I2, 3)} A`, p.mode === "series" ? L("same current in series", "श्रेणीक्रम में समान धारा") : "I₁ = V / R₁, I₂ = V / R₂"],
        [L("Voltage across R₁, R₂", "R₁, R₂ पर वोल्टता"), `${f(s.V1, 2)} V · ${f(s.V2, 2)} V`, p.mode === "series" ? "V₁ = I R₁ (sum = V)" : L("same voltage in parallel", "पार्श्वक्रम में समान वोल्टता")],
        [L("Power", "शक्ति"), `${f(p.V * s.I, 2)} W`, "P = V I = I² R"],
      ];
    },
  };

  window.PHYSICS_SIMS = [projectile, pendulum, spring, collision, lens, circuit];
})();
