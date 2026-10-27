/* Quantix Circuit Lab — the editor: schematic canvas, parts palette, properties, live meters, oscilloscope,
   examples, save / share, 3D PCB view (circuit_3d.js). Engine: circuit_sim.js. */
(function () {
  "use strict";
  const CS = window.CircuitSim, PARTS = CS.PARTS, EXAMPLES = window.CIRCUIT_EXAMPLES || [];
  const $ = (id) => document.getElementById(id);
  const fmt = CS.fmt;
  const STORE = "quantix-circuit-v1";

  // ------------------------------------------------------------------ text
  const TX = {
    en: { title: "Circuit Lab", parts: "Parts", search: "Search parts…", run: "▶ Run", pause: "❚❚ Pause", reset: "↺ Reset", speed: "Speed",
      select: "✥ Select", wire: "⟋ Wire", undo: "↶", redo: "↷", rotate: "⟳ Rotate", del: "🗑 Delete", dup: "⧉ Duplicate", fit: "⤢ Fit",
      clear: "New", examples: "Examples…", view2d: "Schematic", view3d: "3D PCB", props: "Properties", live: "Live values", scope: "Oscilloscope",
      ch: "CH", off: "— off —", voltage: "voltage", current: "current", tdiv: "Time / div", auto: "Auto", hold: "❚❚ Hold", go: "▶ Live",
      save: "💾 Save file", open: "📂 Open file", share: "🔗 Copy share link", png: "🖼 Image", bom: "📋 Parts list (CSV)", sound: "🔊 Sound", damage: "💥 Parts can burn",
      nothing: "Nothing selected. Pick a part on the left (or press Enter on it), then click the board to place it. Wire tool: click a pin, then click where the wire should go.",
      wireSel: "Wire", nodeV: "Node voltage", label: "Label", pins: "Pins", connect: "Connect to…", repair: "🔧 Repair", burnt: "BURNT",
      noGround: "No ground symbol: the − of the first source is used as 0 V.", conv: "The circuit did not settle in this step (check for shorts).",
      slowed: "Your computer can't keep up — running slower than the chosen speed.", t: "t", nodes: "nodes", empty: "Empty board — add parts or load an example.",
      placed: "placed", deleted: "deleted", copied: "Share link copied", copyFail: "Could not copy — the link is in the address bar.",
      bad: "Not a number. Examples: 4.7k, 10u, 2M2, 100n", col: ["Part", "Value", "V", "I", "P", ""], volts: "V", amps: "A", watts: "W",
      keys: "Keys: Arrows move · R rotate · Del delete · W wire · Esc select · Space run/pause (or press a selected switch) · Ctrl+Z / Ctrl+Y · +/− zoom · [ ] next part",
      tip3d: "Drag to rotate · wheel to zoom · double-click to reset. Live: LEDs, lamps and the motor follow the simulation.",
      rt: "real time", min: "Vmin", max: "Vmax", pp: "p-p", avg: "avg", rms: "RMS", freq: "f", place: "Click the board to place", wiring: "Click to finish the wire (Shift: vertical first) · Esc to stop",
      events: { burnt: "burnt out", reversed: "burst (reversed polarity)", overvoltage: "burst (over-voltage)", breakdown: "broke down (reverse voltage)", blown: "fuse blown" },
      speeds: [[1, "1 s / s (real time)"], [0.1, "100 ms / s"], [0.01, "10 ms / s"], [0.001, "1 ms / s"], [1e-4, "100 µs / s"], [1e-5, "10 µs / s"], [1e-6, "1 µs / s"], [0.05, "50 ms / s"]],
    },
    hi: { title: "सर्किट लैब", parts: "घटक", search: "घटक खोजें…", run: "▶ चलाएँ", pause: "❚❚ रोकें", reset: "↺ रीसेट", speed: "गति",
      select: "✥ चुनें", wire: "⟋ तार", undo: "↶", redo: "↷", rotate: "⟳ घुमाएँ", del: "🗑 हटाएँ", dup: "⧉ प्रति बनाएँ", fit: "⤢ फ़िट",
      clear: "नया", examples: "उदाहरण…", view2d: "आरेख", view3d: "3D पीसीबी", props: "गुण", live: "लाइव मान", scope: "ऑसिलोस्कोप",
      ch: "CH", off: "— बंद —", voltage: "वोल्टेज", current: "धारा", tdiv: "समय / खाना", auto: "स्वतः", hold: "❚❚ रोकें", go: "▶ लाइव",
      save: "💾 फ़ाइल सहेजें", open: "📂 फ़ाइल खोलें", share: "🔗 शेयर लिंक कॉपी करें", png: "🖼 चित्र", bom: "📋 घटक सूची (CSV)", sound: "🔊 ध्वनि", damage: "💥 घटक जल सकते हैं",
      nothing: "कुछ नहीं चुना। बाईं ओर से घटक चुनें (या उस पर Enter दबाएँ), फिर बोर्ड पर क्लिक करके रखें। तार: किसी पिन पर क्लिक करें, फिर जहाँ तार जाना है वहाँ क्लिक करें।",
      wireSel: "तार", nodeV: "नोड वोल्टेज", label: "नाम", pins: "पिन", connect: "इससे जोड़ें…", repair: "🔧 ठीक करें", burnt: "जला",
      noGround: "ग्राउंड नहीं है: पहले स्रोत का − 0 V माना गया।", conv: "इस चरण में सर्किट स्थिर नहीं हुआ (शॉर्ट सर्किट जाँचें)।",
      slowed: "कंप्यूटर साथ नहीं दे पा रहा — चुनी गति से धीमा चल रहा है।", t: "t", nodes: "नोड", empty: "बोर्ड खाली है — घटक जोड़ें या उदाहरण खोलें।",
      placed: "रखा गया", deleted: "हटाया गया", copied: "शेयर लिंक कॉपी हुआ", copyFail: "कॉपी नहीं हुआ — लिंक पता-पट्टी में है।",
      bad: "संख्या नहीं है। उदाहरण: 4.7k, 10u, 2M2, 100n", col: ["घटक", "मान", "V", "I", "P", ""], volts: "V", amps: "A", watts: "W",
      keys: "कुंजियाँ: तीर खिसकाएँ · R घुमाएँ · Del हटाएँ · W तार · Esc चुनें · Space चलाएँ/रोकें (या चुना स्विच दबाएँ) · Ctrl+Z / Ctrl+Y · +/− ज़ूम · [ ] अगला घटक",
      tip3d: "घुमाने के लिए खींचें · ज़ूम के लिए व्हील · रीसेट के लिए डबल-क्लिक। एलईडी, बल्ब और मोटर सिमुलेशन के साथ चलते हैं।",
      rt: "वास्तविक समय", min: "Vmin", max: "Vmax", pp: "p-p", avg: "औसत", rms: "RMS", freq: "f", place: "रखने के लिए बोर्ड पर क्लिक करें", wiring: "तार पूरा करने के लिए क्लिक करें (Shift: पहले खड़ा) · रोकने के लिए Esc",
      events: { burnt: "जल गया", reversed: "फट गया (उल्टी ध्रुवता)", overvoltage: "फट गया (अधिक वोल्टेज)", breakdown: "टूट गया (पश्च वोल्टेज)", blown: "फ़्यूज़ उड़ गया" },
      speeds: [[1, "1 s / s (वास्तविक समय)"], [0.1, "100 ms / s"], [0.01, "10 ms / s"], [0.001, "1 ms / s"], [1e-4, "100 µs / s"], [1e-5, "10 µs / s"], [1e-6, "1 µs / s"], [0.05, "50 ms / s"]],
    },
  };
  const S = {
    lang: "en", circuit: { parts: [], wires: [] }, sel: null, mode: "select", placing: null, wireStart: null, vFirst: false,
    hover: null, mouse: null, view: { scale: 22, ox: 0, oy: 0 }, running: true, speed: 1, sim: null, undo: [], redo: [], snap: "",
    view3d: false, sound: false, damage: true, slow: false, scopeHold: false, scope: { ch: [null, null], tdiv: 0, buf: [], last: -1 },
    flows: null, flowAt: 0, dotPhase: new Map(), colors: null, events: [], lastPanel: 0, pressing: null, exampleId: null,
  };
  const t = (k) => TX[S.lang][k];
  const tr = (o) => (o == null ? "" : typeof o === "string" ? o : o[S.lang] || o.en);
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    kids.flat(Infinity).forEach((c) => c != null && c !== false && el.append(c.nodeType ? c : document.createTextNode(String(c))));
    return el;
  }
  const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const announce = (msg) => { $("say").textContent = ""; setTimeout(() => { $("say").textContent = msg; }, 30); };

  function readColors() {
    const s = getComputedStyle(document.documentElement), v = (n, d) => s.getPropertyValue(n).trim() || d;
    const dark = (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
    S.colors = { ink: v("--ink", "#e6f0ff"), muted: v("--muted", "#93a6c4"), line: v("--line", "rgba(120,170,255,.15)"), accent: v("--accent", "#38bdf8"),
      accent2: v("--accent-2", "#a78bfa"), ok: v("--ok", "#3fb950"), warn: v("--warn", "#d29922"), err: v("--err", "#f85149"), panel: v("--panel-solid", "#0d1528"),
      grid: dark ? "rgba(140,180,255,.16)" : "rgba(20,60,140,.16)", wire: dark ? "#9fb3d1" : "#44546d", body: dark ? "#dbe7ff" : "#1c2638", dark: dark,
      pos: dark ? "#3ee07a" : "#12a150", neg: dark ? "#ff6b6b" : "#d92d2d" };
  }

  // ------------------------------------------------------------------ circuit model helpers
  let idCounter = 1;
  function newId() { let id; do { id = "p" + (idCounter++); } while (S.circuit.parts.some((p) => p.id === id)); return id; }
  function nextLabel(prefix) {
    let k = 1;
    const used = new Set(S.circuit.parts.map((p) => p.label));
    while (used.has(prefix + k)) k++;
    return prefix + k;
  }
  function newPart(type, x, y, rot) {
    const def = PARTS[type], p = {};
    def.params.forEach((q) => { p[q.k] = q.v; });
    return { id: newId(), type: type, x: x, y: y, rot: rot || 0, label: nextLabel(def.prefix), p: p };
  }
  const partById = (id) => S.circuit.parts.find((p) => p.id === id);
  function cleanCircuit(c) {
    const parts = (c && Array.isArray(c.parts) ? c.parts : []).filter((p) => p && PARTS[p.type]).map((p) => {
      const def = PARTS[p.type], params = {};
      def.params.forEach((q) => { params[q.k] = p.p && p.p[q.k] != null ? p.p[q.k] : q.v; });
      return { id: String(p.id || ""), type: p.type, x: Math.round(+p.x || 0), y: Math.round(+p.y || 0), rot: ((Math.round(+p.rot || 0) % 4) + 4) % 4, label: String(p.label || def.prefix).slice(0, 12), p: params };
    });
    const seen = new Set();
    parts.forEach((p) => { if (!p.id || seen.has(p.id)) p.id = "q" + Math.random().toString(36).slice(2, 8); seen.add(p.id); });
    const wires = (c && Array.isArray(c.wires) ? c.wires : []).map((w) => ({ x1: Math.round(+w.x1), y1: Math.round(+w.y1), x2: Math.round(+w.x2), y2: Math.round(+w.y2) }))
      .filter((w) => [w.x1, w.y1, w.x2, w.y2].every(isFinite) && (w.x1 !== w.x2 || w.y1 !== w.y2));
    return { parts: parts, wires: wires };
  }

  // undo / redo + autosave
  function snapshot() { return JSON.stringify(S.circuit); }
  function commit(rebuild) {
    const now = snapshot();
    if (now !== S.snap) { S.undo.push(S.snap); if (S.undo.length > 120) S.undo.shift(); S.redo = []; S.snap = now; }
    save();
    if (rebuild !== false) changed();
  }
  function changed() { S.sim.update(S.circuit); S.flows = null; if (S.view3d && S.pcb) S.pcb.setCircuit(S.circuit); renderPanels(true); }
  function restore(json) { S.circuit = cleanCircuit(JSON.parse(json)); S.snap = json; S.sel = null; save(); changed(); }
  function undo() { if (!S.undo.length) return; S.redo.push(S.snap); restore(S.undo.pop()); }
  function redo() { if (!S.redo.length) return; S.undo.push(S.snap); restore(S.redo.pop()); }
  function save() { try { localStorage.setItem(STORE, snapshot()); } catch (_) { /* private mode */ } }

  // ------------------------------------------------------------------ symbols
  // Drawn in each part's own grid units (rotation 0); pen() maps them to the screen.
  const BOX = {
    battery: [-1, -2, 1, 2], dcsupply: [-1.2, -2, 1.2, 2], acsource: [-1.2, -2, 1.2, 2], isource: [-1.2, -2, 1.2, 2], ground: [-0.8, -0.2, 0.8, 1.3],
    pot: [-2, -2, 2, 0.6], transformer: [-2, -2.3, 2, 2.3], npn: [-2, -2, 1.8, 2], pnp: [-2, -2, 1.8, 2], nmos: [-2, -2, 1.8, 2], pmos: [-2, -2, 1.8, 2],
    opamp: [-2, -2, 3, 2], timer555: [-3, -3, 3, 3], spdt: [-2, -1.4, 2, 1.4], relay: [-3, -2.3, 3, 2.3], seg7: [-4.4, -3.6, 4.4, 4],
    not: [-2, -1, 2, 1], and: [-2, -1.4, 2, 1.4], or: [-2, -1.4, 2, 1.4], nand: [-2, -1.4, 2, 1.4], nor: [-2, -1.4, 2, 1.4], xor: [-2, -1.4, 2, 1.4],
  };
  const boxOf = (type) => BOX[type] || [-2, -0.9, 2, 0.9];

  function valueText(p) {
    const q = p.p;
    switch (p.type) {
      case "resistor": return fmt(q.R, "Ω");
      case "capacitor": case "electrolytic": return fmt(q.C, "F");
      case "inductor": return fmt(q.L, "H");
      case "pot": return fmt(q.R, "Ω") + " · " + Math.round(q.pos) + "%";
      case "battery": case "dcsupply": return fmt(q.V, "V");
      case "acsource": return fmt(q.Vp, "V") + " " + fmt(q.f, "Hz");
      case "isource": return fmt(q.I, "A");
      case "zener": return fmt(q.Vz, "V");
      case "led": return tr((PARTS.led.params[0].choices.find((c) => c[0] === q.color) || [0, ""])[1]);
      case "transformer": return q.n + " : 1";
      case "fuse": return fmt(q.Ir, "A");
      case "lamp": return fmt(q.Vr, "V") + " " + fmt(q.Wr, "W");
      case "ldr": return fmt(q.lux, "lux");
      case "ntc": return q.T + " °C";
      case "npn": case "pnp": return "β " + q.beta;
      case "relay": return fmt(q.Vcoil, "V");
      default: return "";
    }
  }

  function pen(ctx, part) {
    const sc = S.view.scale, r = part.rot || 0;
    const X = (lx, ly) => { const q = CS.rotate([lx, ly], r); return [S.view.ox + (part.x + q[0]) * sc, S.view.oy + (part.y + q[1]) * sc]; };
    const g = {
      sc: sc, ctx: ctx,
      line(...pts) { ctx.beginPath(); for (let k = 0; k < pts.length; k += 2) { const s = X(pts[k], pts[k + 1]); k ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); } ctx.stroke(); },
      poly(pts, fillStyle, close) {
        ctx.beginPath(); for (let k = 0; k < pts.length; k += 2) { const s = X(pts[k], pts[k + 1]); k ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }
        if (close !== false) ctx.closePath();
        if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
        ctx.stroke();
      },
      circle(x, y, rad, fillStyle, noStroke) { const s = X(x, y); ctx.beginPath(); ctx.arc(s[0], s[1], rad * sc, 0, Math.PI * 2); if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); } if (!noStroke) ctx.stroke(); },
      arc(x, y, rad, a0, a1, ccw) { const s = X(x, y), off = r * Math.PI / 2; ctx.beginPath(); ctx.arc(s[0], s[1], rad * sc, a0 + off, a1 + off, !!ccw); ctx.stroke(); },
      text(x, y, str, size, colour, align, weight) {
        const s = X(x, y); ctx.save(); ctx.fillStyle = colour || S.colors.body; ctx.font = (weight || "600") + " " + Math.max(8, size * sc) + "px " + "JetBrains Mono, ui-monospace, monospace";
        ctx.textAlign = align || "center"; ctx.textBaseline = "middle"; ctx.fillText(str, s[0], s[1]); ctx.restore();
      },
      glow(x, y, rad, colour, a) {
        const s = X(x, y), R = rad * sc, gr = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], R);
        gr.addColorStop(0, colour); gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(s[0], s[1], R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      },
      X: X,
    };
    return g;
  }
  function arrow(g, x1, y1, x2, y2, size) {
    g.line(x1, y1, x2, y2);
    const a = Math.atan2(y2 - y1, x2 - x1), s = size || 0.3;
    g.poly([x2, y2, x2 - s * Math.cos(a - 0.45), y2 - s * Math.sin(a - 0.45), x2 - s * Math.cos(a + 0.45), y2 - s * Math.sin(a + 0.45)], g.ctx.strokeStyle);
  }
  function zigzag(g, x1, x2, amp) {
    const pts = [x1, 0], n = 6, w = (x2 - x1) / n;
    for (let k = 0; k < n; k++) pts.push(x1 + w * (k + 0.5), k % 2 ? amp : -amp);
    pts.push(x2, 0); g.line(...pts);
  }
  function coil(g, x1, x2, y, up) {
    const n = 4, w = (x2 - x1) / n;
    for (let k = 0; k < n; k++) g.arc(x1 + w * (k + 0.5), y, w / 2, Math.PI, 0, !!up);
  }
  const SYM = {
    resistor(g, p, info) {
      if (info && info.heat > 0.6) g.glow(0, 0, 1.6, "rgba(255,90,40,.9)", (info.heat - 0.6) * 1.5);
      g.line(-2, 0, -1.2, 0); g.line(1.2, 0, 2, 0); zigzag(g, -1.2, 1.2, 0.38);
    },
    pot(g, p) { g.line(-2, 0, -1.2, 0); g.line(1.2, 0, 2, 0); zigzag(g, -1.2, 1.2, 0.38); const x = -1.2 + 2.4 * Math.min(1, Math.max(0, p.p.pos / 100)); g.line(0, -2, 0, -1.3, x, -1.3); arrow(g, x, -1.3, x, -0.45, 0.28); },
    ldr(g) { g.line(-2, 0, -1.2, 0); g.line(1.2, 0, 2, 0); g.poly([-1.2, -0.42, 1.2, -0.42, 1.2, 0.42, -1.2, 0.42]); arrow(g, -1.1, -1.5, -0.45, -0.75, 0.24); arrow(g, -0.3, -1.6, 0.35, -0.85, 0.24); },
    ntc(g) { g.line(-2, 0, -1.2, 0); g.line(1.2, 0, 2, 0); g.poly([-1.2, -0.42, 1.2, -0.42, 1.2, 0.42, -1.2, 0.42]); g.line(-1.2, 0.8, -0.7, 0.8, 0.9, -0.8); g.text(1.3, -0.95, "−t°", 0.42); },
    capacitor(g) { g.line(-2, 0, -0.22, 0); g.line(0.22, 0, 2, 0); g.ctx.lineWidth *= 1.6; g.line(-0.22, -0.85, -0.22, 0.85); g.line(0.22, -0.85, 0.22, 0.85); },
    electrolytic(g) { g.line(-2, 0, -0.22, 0); g.line(0.35, 0, 2, 0); g.ctx.lineWidth *= 1.6; g.line(-0.22, -0.85, -0.22, 0.85); g.arc(1.3, 0, 0.98, Math.PI * 0.8, Math.PI * 1.2); g.ctx.lineWidth /= 1.6; g.text(-0.8, -0.75, "+", 0.6); },
    inductor(g) { g.line(-2, 0, -1.3, 0); g.line(1.3, 0, 2, 0); coil(g, -1.3, 1.3, 0, false); },
    transformer(g) {
      g.line(-2, -2, -0.9, -2, -0.9, -1.4); g.line(-2, 2, -0.9, 2, -0.9, 1.4); g.line(2, -2, 0.9, -2, 0.9, -1.4); g.line(2, 2, 0.9, 2, 0.9, 1.4);
      for (let k = 0; k < 4; k++) { g.arc(-0.9, -1.05 + k * 0.7, 0.35, -Math.PI / 2, Math.PI / 2, false); g.arc(0.9, -1.05 + k * 0.7, 0.35, Math.PI / 2, Math.PI * 1.5, false); }
      g.line(-0.15, -1.6, -0.15, 1.6); g.line(0.15, -1.6, 0.15, 1.6);
    },
    battery(g) {
      g.line(0, -2, 0, -0.35); g.line(0, 0.35, 0, 2);
      g.ctx.lineWidth *= 1.3; g.line(-0.85, -0.35, 0.85, -0.35); g.ctx.lineWidth *= 1.8; g.line(-0.45, 0.35, 0.45, 0.35); g.ctx.lineWidth /= 2.34;
      g.text(0.85, -1.1, "+", 0.62);
    },
    dcsupply(g) { g.line(0, -2, 0, -1); g.line(0, 1, 0, 2); g.circle(0, 0, 1); g.text(0, -0.45, "+", 0.6); g.text(0, 0.5, "−", 0.6); g.text(1.55, 0, "DC", 0.42, S.colors.muted); },
    acsource(g) {
      g.line(0, -2, 0, -1); g.line(0, 1, 0, 2); g.circle(0, 0, 1);
      const pts = []; for (let k = 0; k <= 20; k++) { const x = -0.6 + 1.2 * k / 20; pts.push(x, -0.35 * Math.sin((k / 20) * Math.PI * 2)); }
      // drawn horizontally regardless of rotation reads better: the wave is a local sketch
      g.line(...pts); g.text(0.75, -1.25, "+", 0.5);
    },
    isource(g) { g.line(0, -2, 0, -1); g.line(0, 1, 0, 2); g.circle(0, 0, 1); arrow(g, 0, 0.6, 0, -0.6, 0.3); },
    ground(g) { g.line(0, 0, 0, 0.55); g.line(-0.75, 0.55, 0.75, 0.55); g.line(-0.48, 0.82, 0.48, 0.82); g.line(-0.22, 1.09, 0.22, 1.09); },
    diode(g, p, info, kind) {
      g.line(-2, 0, -0.5, 0); g.line(0.5, 0, 2, 0);
      g.poly([-0.5, -0.55, -0.5, 0.55, 0.5, 0], kind === "led" && info && info.glow > 0.05 ? info.colour : S.colors.body);
      g.line(0.5, -0.55, 0.5, 0.55);
      if (kind === "zener") { g.line(0.5, -0.55, 0.25, -0.75); g.line(0.5, 0.55, 0.75, 0.75); }
      if (kind === "schottky") { g.line(0.5, -0.55, 0.25, -0.55, 0.25, -0.35); g.line(0.5, 0.55, 0.75, 0.55, 0.75, 0.35); }
      if (kind === "led") {
        if (info && info.glow > 0.05) g.glow(0, 0, 2.2, info.colour, Math.min(1, info.glow));
        arrow(g, 0.1, -0.85, 0.65, -1.45, 0.22); arrow(g, 0.55, -0.6, 1.1, -1.2, 0.22);
      }
    },
    bjt(g, p, pnp) {
      g.circle(0.35, 0, 1.3);
      g.line(-2, 0, -0.35, 0); g.ctx.lineWidth *= 1.8; g.line(-0.35, -0.75, -0.35, 0.75); g.ctx.lineWidth /= 1.8;
      // top lead goes to (1,-2), bottom to (1,2): NPN = collector top; PNP = emitter top
      g.line(-0.35, -0.35, 1, -1.15, 1, -2); g.line(-0.35, 0.35, 1, 1.15, 1, 2);
      if (!pnp) arrow(g, -0.35, 0.35, 0.75, 1.0, 0.32); else arrow(g, 0.95, -1.12, -0.15, -0.5, 0.32);
    },
    mos(g, p, pch) {
      g.circle(0.35, 0, 1.35);
      g.line(-2, 0, -0.6, 0); g.line(-0.6, -0.75, -0.6, 0.75);
      g.ctx.lineWidth *= 1.6; g.line(-0.25, -0.9, -0.25, -0.35); g.line(-0.25, -0.25, -0.25, 0.25); g.line(-0.25, 0.35, -0.25, 0.9); g.ctx.lineWidth /= 1.6;
      g.line(-0.25, -0.62, 1, -0.62, 1, -2); g.line(-0.25, 0.62, 1, 0.62, 1, 2); g.line(1, 0, 1, pch ? -0.62 : 0.62);
      if (!pch) arrow(g, 1, 0, -0.2, 0, 0.3); else arrow(g, -0.2, 0, 0.95, 0, 0.3);
      g.line(-0.25, 0, 1, 0);
    },
    opamp(g, p) {
      g.poly([-1.4, -1.9, -1.4, 1.9, 2.2, 0], S.colors.dark ? "rgba(56,189,248,.08)" : "rgba(10,132,214,.06)");
      g.line(-2, -1, -1.4, -1); g.line(-2, 1, -1.4, 1); g.line(2.2, 0, 3, 0);
      g.text(-0.95, -1, "−", 0.62); g.text(-0.95, 1, "+", 0.62); void p;
    },
    timer555(g) {
      g.poly([-2.3, -2.3, 2.3, -2.3, 2.3, 2.3, -2.3, 2.3], S.colors.dark ? "rgba(167,139,250,.10)" : "rgba(124,58,237,.06)");
      g.line(0, -3, 0, -2.3); g.line(0, 3, 0, 2.3); g.line(-3, -1, -2.3, -1); g.line(-3, 1, -2.3, 1); g.line(3, 1, 2.3, 1); g.line(3, -1, 2.3, -1);
      g.text(0, 0, "555", 0.75); g.text(0, -1.75, "VCC", 0.36, S.colors.muted); g.text(0, 1.8, "GND", 0.36, S.colors.muted);
      g.text(-1.65, -1, "TR", 0.36, S.colors.muted); g.text(-1.6, 1, "TH", 0.36, S.colors.muted); g.text(1.55, 1, "DIS", 0.36, S.colors.muted); g.text(1.55, -1, "OUT", 0.36, S.colors.muted);
    },
    gate(g, p) {
      const type = p.type, inv = /^(not|nand|nor)$/.test(type), x2 = inv ? 0.95 : 1.2;
      if (type === "not") { g.line(-2, 0, -1, 0); g.poly([-1, -0.9, -1, 0.9, 0.85, 0]); }
      else {
        g.line(-2, -1, -1, -1); g.line(-2, 1, -1, 1);
        if (type === "and" || type === "nand") { g.line(0, -1.2, -1.1, -1.2, -1.1, 1.2, 0, 1.2); g.arc(0, 0, 1.2, -Math.PI / 2, Math.PI / 2); }
        else {
          g.arc(-2.6, 0, 1.95, -0.66, 0.66);
          g.arc(-0.65, -2.2, 3.4, Math.PI * 0.5, Math.PI * 0.19, true); g.arc(-0.65, 2.2, 3.4, -Math.PI * 0.5, -Math.PI * 0.19);
          if (type === "xor") g.arc(-3.0, 0, 1.95, -0.62, 0.62);
        }
      }
      if (inv) g.circle(x2 + 0.15, 0, 0.17); g.line(inv ? x2 + 0.32 : x2, 0, 2, 0);
    },
    switch(g, p) {
      const on = p.p.on === true;
      g.line(-2, 0, -1, 0); g.line(1, 0, 2, 0); g.circle(-1, 0, 0.13, S.colors.body); g.circle(1, 0, 0.13, S.colors.body);
      g.ctx.lineWidth *= 1.4; g.line(-1, 0, on ? 1 : 0.85, on ? -0.1 : -0.85); g.ctx.lineWidth /= 1.4;
    },
    button(g, p) {
      const on = p.p.on === true, y = on ? -0.12 : -0.55;
      g.line(-2, 0, -1, 0); g.line(1, 0, 2, 0); g.circle(-1, 0, 0.13, S.colors.body); g.circle(1, 0, 0.13, S.colors.body);
      g.ctx.lineWidth *= 1.4; g.line(-1.1, y, 1.1, y); g.ctx.lineWidth /= 1.4; g.line(0, y, 0, y - 0.7); g.line(-0.4, y - 0.7, 0.4, y - 0.7);
    },
    spdt(g, p) {
      g.line(-2, 0, -0.9, 0); g.line(2, -1, 1, -1); g.line(2, 1, 1, 1);
      g.circle(-0.9, 0, 0.13, S.colors.body); g.circle(1, -1, 0.13, S.colors.body); g.circle(1, 1, 0.13, S.colors.body);
      g.ctx.lineWidth *= 1.4; g.line(-0.9, 0, 0.95, p.p.pos === "B" ? 0.85 : -0.85); g.ctx.lineWidth /= 1.4;
      g.text(1.55, -1.45, "A", 0.38, S.colors.muted); g.text(1.55, 1.45, "B", 0.38, S.colors.muted);
    },
    relay(g, p, info) {
      const on = info && info.rows && info.rows[1] && info.rows[1][1] === "NO";
      g.line(-3, -2, -1.9, -2, -1.9, -1); g.line(-3, 2, -1.9, 2, -1.9, 1);
      g.poly([-2.5, -1, -1.3, -1, -1.3, 1, -2.5, 1]); g.line(-2.5, 1, -1.3, -1);
      g.line(3, 2, 1, 2, 1, 1); g.line(3, -2, 2.1, -2, 2.1, -1.3); g.line(3, 0, 2.1, 0, 2.1, -0.15);
      g.circle(1, 1, 0.12, S.colors.body); g.ctx.lineWidth *= 1.4; g.line(1, 1, on ? 2.05 : 2.05, on ? -1.25 : -0.1); g.ctx.lineWidth /= 1.4;
      g.ctx.setLineDash([3, 3]); g.line(-1.3, 0, 1.45, on ? -0.6 : 0.4); g.ctx.setLineDash([]);
      g.text(2.6, -2.45, "NO", 0.34, S.colors.muted); g.text(2.6, 0.45, "NC", 0.34, S.colors.muted); g.text(2.3, 2.45, "COM", 0.34, S.colors.muted);
    },
    fuse(g, p, info) {
      g.line(-2, 0, -1.2, 0); g.line(1.2, 0, 2, 0); g.poly([-1.2, -0.38, 1.2, -0.38, 1.2, 0.38, -1.2, 0.38]);
      if (info && info.burnt) { g.line(-1.2, 0, -0.25, 0.15); g.line(0.25, -0.15, 1.2, 0); } else g.line(-1.2, 0, 1.2, 0);
    },
    lamp(g, p, info) {
      if (info && info.glow > 0.03) g.glow(0, 0, 2.6, "rgba(255,214,90,1)", Math.min(1, info.glow));
      g.line(-2, 0, -1, 0); g.line(1, 0, 2, 0); g.circle(0, 0, 1, info && info.glow > 0.03 ? "rgba(255,226,120," + Math.min(0.9, info.glow) + ")" : null);
      g.line(-0.7, -0.7, 0.7, 0.7); g.line(-0.7, 0.7, 0.7, -0.7);
    },
    motor(g, p, info) {
      g.line(-2, 0, -1.1, 0); g.line(1.1, 0, 2, 0); g.circle(0, 0, 1.1); g.text(0, 0, "M", 0.8);
      const a = (S.sim.state(p.id).ang || 0);
      const c1 = g.X(0, 0), R = 1.45 * g.sc;
      g.ctx.save(); g.ctx.strokeStyle = S.colors.accent; g.ctx.lineWidth = 2.2;
      for (let k = 0; k < 3; k++) { const b = a + k * 2.094; g.ctx.beginPath(); g.ctx.arc(c1[0], c1[1], R, b, b + 0.55); g.ctx.stroke(); }
      g.ctx.restore(); void info;
    },
    buzzer(g, p, info) {
      g.line(-2, 0, -1, 0); g.line(1, 0, 2, 0); g.line(-1, 0, -1, -0.4); g.line(1, 0, 1, -0.4);
      g.arc(0, -0.4, 1, Math.PI, 0); g.line(-1, -0.4, 1, -0.4);
      if (info && info.sound) { const ph = (performance.now() / 120) % 1; for (let k = 0; k < 2; k++) g.arc(0, -0.6, 1.4 + (k + ph) * 0.45, -2.3, -0.84); }
    },
    seg7(g, p, info) {
      g.poly([-4.4, -3.6, 4.4, -3.6, 4.4, 3.2, -4.4, 3.2], S.colors.dark ? "#06090f" : "#1a1d24");
      for (let k = 0; k < 9; k++) g.line(-4 + k, 3.2, -4 + k, 4);
      const lit = (info && info.segments) || [], on = (k) => lit[k] > 0.12;
      const segs = [[-1, -2.6, 1, -2.6], [1.2, -2.4, 1.2, -0.4], [1.2, 0.2, 1.2, 2.2], [-1, 2.4, 1, 2.4], [-1.2, 0.2, -1.2, 2.2], [-1.2, -2.4, -1.2, -0.4], [-1, -0.1, 1, -0.1]];
      g.ctx.save(); g.ctx.lineCap = "round";
      segs.forEach((s, k) => { g.ctx.lineWidth = g.sc * 0.36; g.ctx.strokeStyle = on(k) ? "#ff3b30" : "rgba(255,59,48,.12)"; g.line(...s); });
      g.ctx.restore();
      g.circle(1.9, 2.5, 0.2, on(7) ? "#ff3b30" : "rgba(255,59,48,.12)", true);
      "abcdefg".split("").concat(["dp", "C"]).forEach((n, k) => g.text(-4 + k, 2.8, n, 0.34, "#93a6c4"));
    },
    meter(g, p, info, letter) {
      g.line(-2, 0, -1.1, 0); g.line(1.1, 0, 2, 0); g.circle(0, 0, 1.1, S.colors.dark ? "rgba(56,189,248,.10)" : "rgba(10,132,214,.07)"); g.text(0, 0, letter, 0.85);
      g.text(-1.55, -0.55, "+", 0.5);
    },
  };
  function drawSymbol(ctx, part, info) {
    const g = pen(ctx, part);
    const burnt = info && info.burnt;
    ctx.save();
    ctx.lineWidth = Math.max(1.3, g.sc * 0.085); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = burnt ? "#6b4a3a" : S.colors.body;
    switch (part.type) {
      case "diode": case "zener": case "led": case "schottky": SYM.diode(g, part, info, part.type); break;
      case "npn": SYM.bjt(g, part, false); break; case "pnp": SYM.bjt(g, part, true); break;
      case "nmos": SYM.mos(g, part, false); break; case "pmos": SYM.mos(g, part, true); break;
      case "not": case "and": case "or": case "nand": case "nor": case "xor": SYM.gate(g, part); break;
      case "voltmeter": SYM.meter(g, part, info, "V"); break; case "ammeter": SYM.meter(g, part, info, "A"); break;
      default: (SYM[part.type] || SYM.resistor)(g, part, info);
    }
    if (burnt) {
      const c = g.X(0, 0);
      ctx.fillStyle = "rgba(60,40,30,.35)"; ctx.beginPath(); ctx.arc(c[0], c[1], g.sc * 1.2, 0, Math.PI * 2); ctx.fill();
      const ph = performance.now() / 600;
      for (let k = 0; k < 3; k++) { const f = (ph + k / 3) % 1; ctx.fillStyle = "rgba(130,130,130," + (0.5 * (1 - f)) + ")"; ctx.beginPath(); ctx.arc(c[0] + Math.sin(k * 2 + ph) * 5, c[1] - f * g.sc * 2.4, g.sc * (0.25 + f * 0.5), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ canvas & view
  const cv = $("cv"), ctx = cv.getContext("2d");
  let W = 0, H = 0;
  function resize() {
    const r = $("stage").getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (S.pcb) S.pcb.resize();
  }
  const toGrid = (px, py) => [(px - S.view.ox) / S.view.scale, (py - S.view.oy) / S.view.scale];
  const snapPt = (g) => [Math.round(g[0]), Math.round(g[1])];
  function bounds() {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const add = (x, y) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); };
    S.circuit.parts.forEach((p) => { const b = boxOf(p.type); [[b[0], b[1]], [b[2], b[3]]].forEach((q) => { const r = CS.rotate(q, p.rot); add(p.x + r[0], p.y + r[1]); }); });
    S.circuit.wires.forEach((w) => { add(w.x1, w.y1); add(w.x2, w.y2); });
    return isFinite(x1) ? [x1, y1, x2, y2] : null;
  }
  function fit() {
    const b = bounds();
    if (!b || !W) { S.view.scale = 22; S.view.ox = W / 2; S.view.oy = H / 2; return; }
    const pad = 3, sc = Math.min(W / (b[2] - b[0] + pad * 2), H / (b[3] - b[1] + pad * 2.6));
    S.view.scale = Math.max(8, Math.min(40, sc));
    S.view.ox = W / 2 - (b[0] + b[2]) / 2 * S.view.scale;
    S.view.oy = H / 2 - (b[1] + b[3]) / 2 * S.view.scale;
  }
  function zoomAt(f, px, py) {
    const g = toGrid(px, py), sc = Math.max(6, Math.min(70, S.view.scale * f));
    S.view.scale = sc; S.view.ox = px - g[0] * sc; S.view.oy = py - g[1] * sc;
  }

  // ------------------------------------------------------------------ hit testing
  function partBox(p) {
    const b = boxOf(p.type), a = CS.rotate([b[0], b[1]], p.rot), c = CS.rotate([b[2], b[3]], p.rot);
    return [p.x + Math.min(a[0], c[0]), p.y + Math.min(a[1], c[1]), p.x + Math.max(a[0], c[0]), p.y + Math.max(a[1], c[1])];
  }
  function hitPart(g) {
    for (let k = S.circuit.parts.length - 1; k >= 0; k--) {
      const p = S.circuit.parts[k], b = partBox(p);
      if (g[0] >= b[0] - 0.25 && g[0] <= b[2] + 0.25 && g[1] >= b[1] - 0.25 && g[1] <= b[3] + 0.25) return p;
    }
    return null;
  }
  function hitWire(g) {
    let best = -1, bd = 0.4;
    S.circuit.wires.forEach((w, k) => {
      const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L2 = dx * dx + dy * dy;
      const u = L2 ? Math.max(0, Math.min(1, ((g[0] - w.x1) * dx + (g[1] - w.y1) * dy) / L2)) : 0;
      const d = Math.hypot(g[0] - (w.x1 + u * dx), g[1] - (w.y1 + u * dy));
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }
  function allPins() {
    const out = [];
    S.circuit.parts.forEach((p) => CS.pinPositions(p).forEach((q, k) => out.push({ part: p, k: k, x: q[0], y: q[1] })));
    return out;
  }
  function pointConnected(x, y, skipWire) {
    if (allPins().some((q) => q.x === x && q.y === y)) return true;
    return S.circuit.wires.some((w, k) => k !== skipWire && CS.onSegment(x, y, w));
  }

  // ------------------------------------------------------------------ editing actions
  function addWire(a, b, vFirst) {
    if (a[0] === b[0] && a[1] === b[1]) return 0;
    const corner = vFirst ? [a[0], b[1]] : [b[0], a[1]];
    let n = 0;
    [[a, corner], [corner, b]].forEach((s) => { if (s[0][0] !== s[1][0] || s[0][1] !== s[1][1]) { S.circuit.wires.push({ x1: s[0][0], y1: s[0][1], x2: s[1][0], y2: s[1][1] }); n++; } });
    return n;
  }
  // keyboard / panel wiring between two pins: pick the L whose path does not touch any other pin or wire point
  function connectPins(a, b) {
    const pts = allPins().map((q) => [q.x, q.y]).concat(S.circuit.wires.flatMap((w) => [[w.x1, w.y1], [w.x2, w.y2]]));
    const clean = (corner) => [[a, corner], [corner, b]].every((s) => {
      const w = { x1: s[0][0], y1: s[0][1], x2: s[1][0], y2: s[1][1] };
      return pts.every((q) => !CS.onSegment(q[0], q[1], w) || (q[0] === a[0] && q[1] === a[1]) || (q[0] === b[0] && q[1] === b[1]) || (q[0] === corner[0] && q[1] === corner[1] && false));
    });
    const vFirst = !clean([b[0], a[1]]) && clean([a[0], b[1]]);
    addWire(a, b, vFirst);
  }
  // wires whose ends sit on a part's pins follow it when it moves or rotates
  function attachments(part) {
    const pins = CS.pinPositions(part), out = [];
    S.circuit.wires.forEach((w, k) => pins.forEach((q, pi) => {
      if (w.x1 === q[0] && w.y1 === q[1]) out.push({ k: k, end: 1, pin: pi });
      if (w.x2 === q[0] && w.y2 === q[1]) out.push({ k: k, end: 2, pin: pi });
    }));
    return out;
  }
  function followPins(part, att) {
    const pins = CS.pinPositions(part);
    att.forEach((a) => { const w = S.circuit.wires[a.k]; if (!w) return; if (a.end === 1) { w.x1 = pins[a.pin][0]; w.y1 = pins[a.pin][1]; } else { w.x2 = pins[a.pin][0]; w.y2 = pins[a.pin][1]; } });
  }
  function straighten() {   // diagonal wires (after a move) become two straight segments
    const out = [];
    S.circuit.wires.forEach((w) => {
      if (w.x1 === w.x2 && w.y1 === w.y2) return;
      if (w.x1 !== w.x2 && w.y1 !== w.y2) { out.push({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y1 }, { x1: w.x2, y1: w.y1, x2: w.x2, y2: w.y2 }); }
      else out.push(w);
    });
    S.circuit.wires = out;
  }
  function movePart(p, dx, dy) {
    const att = attachments(p);
    p.x += dx; p.y += dy;
    followPins(p, att); straighten(); commit();
  }
  function rotatePart(p) {
    const att = attachments(p);
    p.rot = ((p.rot || 0) + 1) % 4;
    followPins(p, att); straighten(); commit();
    announce(p.label + " ⟳ " + p.rot * 90 + "°");
  }
  function deleteSel() {
    if (!S.sel) return;
    if (S.sel.kind === "part") {
      const p = partById(S.sel.id); if (!p) return;
      S.circuit.parts = S.circuit.parts.filter((q) => q !== p); announce(p.label + " " + t("deleted"));
    } else S.circuit.wires.splice(S.sel.k, 1);
    S.sel = null; commit();
  }
  function duplicateSel() {
    if (!S.sel || S.sel.kind !== "part") return;
    const p = partById(S.sel.id); if (!p) return;
    const q = newPart(p.type, p.x + 3, p.y + 3, p.rot); q.p = JSON.parse(JSON.stringify(p.p));
    S.circuit.parts.push(q); S.sel = { kind: "part", id: q.id }; commit(); announce(q.label + " " + t("placed"));
  }
  function freeSpot(type) {
    const c = toGrid(W / 2, H / 2), base = snapPt(c);
    for (let r = 0; r < 30; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = base[0] + dx * 2, y = base[1] + dy * 2, b = boxOf(type);
      const box = [x + b[0] - 1, y + b[1] - 1, x + b[2] + 1, y + b[3] + 1];
      const clash = S.circuit.parts.some((p) => { const q = partBox(p); return !(q[2] < box[0] || q[0] > box[2] || q[3] < box[1] || q[1] > box[3]); });
      if (!clash) return [x, y];
    }
    return base;
  }
  function placePart(type, at) {
    const p = newPart(type, at[0], at[1], 0);
    S.circuit.parts.push(p); S.sel = { kind: "part", id: p.id };
    S.mode = "select"; S.placing = null; renderTools();
    commit(); announce(tr(PARTS[type].name) + " " + p.label + " " + t("placed"));
    return p;
  }
  function setMode(m) { S.mode = m; S.wireStart = null; if (m !== "place") S.placing = null; renderTools(); cv.style.cursor = m === "wire" ? "crosshair" : m === "place" ? "copy" : "default"; }

  // ------------------------------------------------------------------ pointer
  let drag = null;
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener("pointerdown", (e) => {
    cv.focus({ preventScroll: true });
    const [px, py] = local(e), g = toGrid(px, py), sp = snapPt(g);
    if (e.button === 1 || e.button === 2) { drag = { kind: "pan", sx: px, sy: py, ox: S.view.ox, oy: S.view.oy }; cv.setPointerCapture(e.pointerId); return; }
    if (S.mode === "place" && S.placing) { placePart(S.placing, sp); return; }
    if (S.mode === "wire") {
      if (!S.wireStart) { S.wireStart = sp; return; }
      if (sp[0] === S.wireStart[0] && sp[1] === S.wireStart[1]) { S.wireStart = null; return; }
      const before = S.circuit.wires.length;
      addWire(S.wireStart, sp, e.shiftKey !== S.vFirst);
      commit();
      const ends = pointConnected(sp[0], sp[1], S.circuit.wires.length - 1) && S.circuit.wires.length > before;
      S.wireStart = ends ? null : sp;
      return;
    }
    const p = hitPart(g);
    if (p) {
      S.sel = { kind: "part", id: p.id }; renderPanels(true);
      if (p.type === "button") { p.p.on = true; S.pressing = p; }
      drag = { kind: "part", part: p, start: sp, orig: [p.x, p.y], att: attachments(p), moved: false, before: snapshot(), wires: JSON.stringify(S.circuit.wires) };
      cv.setPointerCapture(e.pointerId);
      return;
    }
    const wk = hitWire(g);
    if (wk >= 0) { S.sel = { kind: "wire", k: wk }; renderPanels(true); drag = null; return; }
    S.sel = null; renderPanels(true);
    drag = { kind: "pan", sx: px, sy: py, ox: S.view.ox, oy: S.view.oy };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", (e) => {
    const [px, py] = local(e), g = toGrid(px, py);
    S.mouse = [px, py]; S.hover = snapPt(g);
    if (!drag) return;
    if (drag.kind === "pan") { S.view.ox = drag.ox + px - drag.sx; S.view.oy = drag.oy + py - drag.sy; return; }
    if (drag.kind === "part") {
      const sp = snapPt(g), nx = drag.orig[0] + sp[0] - drag.start[0], ny = drag.orig[1] + sp[1] - drag.start[1];
      if (nx !== drag.part.x || ny !== drag.part.y) {
        drag.part.x = nx; drag.part.y = ny; drag.moved = true;
        S.circuit.wires = JSON.parse(drag.wires); followPins(drag.part, drag.att);
        S.sim.update(S.circuit); S.flows = null;
      }
    }
  });
  function endDrag() {
    if (S.pressing) { S.pressing.p.on = false; S.pressing = null; renderPanels(true); }
    if (!drag) return;
    if (drag.kind === "part") {
      if (drag.moved) { straighten(); commit(); }
      else if (drag.part.type === "switch") { drag.part.p.on = !(drag.part.p.on === true); save(); renderPanels(true); announce(drag.part.label + ": " + (drag.part.p.on ? "ON" : "OFF")); }
      else if (drag.part.type === "spdt") { drag.part.p.pos = drag.part.p.pos === "B" ? "A" : "B"; save(); renderPanels(true); }
    }
    drag = null;
  }
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);
  cv.addEventListener("pointerleave", () => { S.mouse = null; });
  cv.addEventListener("wheel", (e) => { e.preventDefault(); const [px, py] = local(e); zoomAt(e.deltaY > 0 ? 0.9 : 1.1, px, py); }, { passive: false });
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  cv.addEventListener("dblclick", () => { if (S.mode === "wire") setMode("select"); });

  // ------------------------------------------------------------------ keyboard
  function selectNext(dir) {
    const ps = S.circuit.parts;
    if (!ps.length) return;
    let k = S.sel && S.sel.kind === "part" ? ps.findIndex((p) => p.id === S.sel.id) : -1;
    k = (k + dir + ps.length) % ps.length;
    S.sel = { kind: "part", id: ps[k].id }; renderPanels(true);
    const p = ps[k]; announce(p.label + " · " + tr(PARTS[p.type].name) + " · " + valueText(p));
  }
  cv.addEventListener("keydown", (e) => {
    const p = S.sel && S.sel.kind === "part" ? partById(S.sel.id) : null;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[k]) {
      e.preventDefault();
      const d = arrows[k];
      if (S.mode === "wire" && S.hover) { S.hover = [S.hover[0] + d[0], S.hover[1] + d[1]]; S.mouse = [S.view.ox + S.hover[0] * S.view.scale, S.view.oy + S.hover[1] * S.view.scale]; return; }
      if (p) movePart(p, d[0] * (e.shiftKey ? 4 : 1), d[1] * (e.shiftKey ? 4 : 1));
      else { S.view.ox -= d[0] * 40; S.view.oy -= d[1] * 40; }
      return;
    }
    if (S.mode === "wire" && (k === "Enter" || k === " ")) {
      e.preventDefault();
      if (!S.hover) S.hover = snapPt(toGrid(W / 2, H / 2));
      const sp = S.hover;
      if (!S.wireStart) S.wireStart = sp;
      else { addWire(S.wireStart, sp, S.vFirst); commit(); S.wireStart = pointConnected(sp[0], sp[1], S.circuit.wires.length - 1) ? null : sp; }
      return;
    }
    if (ctrl && k.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (ctrl && k.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (ctrl && k.toLowerCase() === "d") { e.preventDefault(); duplicateSel(); return; }
    if (ctrl) return;
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); deleteSel(); return; }
    if (k === "r" || k === "R") { if (p) rotatePart(p); return; }
    if (k === "w" || k === "W") { setMode(S.mode === "wire" ? "select" : "wire"); if (!S.hover) S.hover = snapPt(toGrid(W / 2, H / 2)); return; }
    if (k === "Escape") { if (S.wireStart) S.wireStart = null; else { setMode("select"); S.sel = null; renderPanels(true); } return; }
    if (k === "+" || k === "=") { zoomAt(1.15, W / 2, H / 2); return; }
    if (k === "-" || k === "_") { zoomAt(1 / 1.15, W / 2, H / 2); return; }
    if (k === "]") { selectNext(1); return; }
    if (k === "[") { selectNext(-1); return; }
    if (k === " ") {
      e.preventDefault();
      if (p && p.type === "switch") { p.p.on = !(p.p.on === true); save(); renderPanels(true); announce(p.label + ": " + (p.p.on ? "ON" : "OFF")); return; }
      if (p && p.type === "button") { p.p.on = true; S.pressing = p; renderPanels(true); return; }
      if (p && p.type === "spdt") { p.p.pos = p.p.pos === "B" ? "A" : "B"; save(); renderPanels(true); return; }
      toggleRun();
    }
  });
  cv.addEventListener("keyup", (e) => { if (e.key === " " && S.pressing) { S.pressing.p.on = false; S.pressing = null; renderPanels(true); } });

  // ------------------------------------------------------------------ current flow on wires (for the moving dots)
  function buildFlows() {
    const pinsAt = new Map(), pts = new Map();
    const keyOf = (x, y) => x + "," + y;
    S.circuit.parts.forEach((p) => CS.pinPositions(p).forEach((q, k) => { const key = keyOf(q[0], q[1]); pts.set(key, q); if (!pinsAt.has(key)) pinsAt.set(key, []); pinsAt.get(key).push([p.id, k]); }));
    S.circuit.wires.forEach((w) => { pts.set(keyOf(w.x1, w.y1), [w.x1, w.y1]); pts.set(keyOf(w.x2, w.y2), [w.x2, w.y2]); });
    const all = Array.from(pts.values());
    const edges = [];
    S.circuit.wires.forEach((w, wi) => {
      const on = all.filter((q) => CS.onSegment(q[0], q[1], w)).sort((a, b) => (a[0] - w.x1) * (w.x2 - w.x1) + (a[1] - w.y1) * (w.y2 - w.y1) - ((b[0] - w.x1) * (w.x2 - w.x1) + (b[1] - w.y1) * (w.y2 - w.y1)));
      for (let k = 0; k + 1 < on.length; k++) edges.push({ a: keyOf(on[k][0], on[k][1]), b: keyOf(on[k + 1][0], on[k + 1][1]), pa: on[k], pb: on[k + 1], wi: wi, i: 0 });
    });
    const adj = new Map();
    edges.forEach((e, k) => { [e.a, e.b].forEach((v) => { if (!adj.has(v)) adj.set(v, []); }); adj.get(e.a).push(k); adj.get(e.b).push(k); });
    S.flows = { edges: edges, adj: adj, pinsAt: pinsAt };
  }
  function updateFlows() {
    if (!S.flows) buildFlows();
    const F = S.flows, pc = S.sim.pinCurrents();
    const out = new Map();   // current leaving the wire network at each point (into device pins)
    F.pinsAt.forEach((list, key) => { let s = 0; list.forEach(([id, k]) => { const a = pc[id]; if (a && isFinite(a[k])) s += a[k]; }); out.set(key, s); });
    F.edges.forEach((e) => { e.i = 0; });
    const seen = new Set();
    F.adj.forEach((_, root) => {
      if (seen.has(root)) return;
      const order = [], parentEdge = new Map(), stack = [root];
      seen.add(root);
      while (stack.length) {
        const v = stack.pop(); order.push(v);
        F.adj.get(v).forEach((ek) => { const e = F.edges[ek], u = e.a === v ? e.b : e.a; if (!seen.has(u)) { seen.add(u); parentEdge.set(u, ek); stack.push(u); } });
      }
      const sub = new Map();
      for (let k = order.length - 1; k >= 0; k--) {
        const v = order[k], s = (sub.get(v) || 0) + (out.get(v) || 0);
        const ek = parentEdge.get(v);
        if (ek != null) {
          const e = F.edges[ek];
          e.i = e.b === v ? s : -s;   // positive: flows a -> b (towards the child that sinks it)
          const par = e.a === v ? e.b : e.a; sub.set(par, (sub.get(par) || 0) + s);
        }
      }
    });
  }

  // ------------------------------------------------------------------ drawing the board
  let lastFrame = 0;
  function draw(now) {
    const C = S.colors, sc = S.view.scale;
    ctx.clearRect(0, 0, W, H);
    // grid dots
    const x0 = Math.floor(-S.view.ox / sc), y0 = Math.floor(-S.view.oy / sc), x1 = x0 + Math.ceil(W / sc) + 1, y1 = y0 + Math.ceil(H / sc) + 1;
    ctx.fillStyle = C.grid;
    const step = sc < 12 ? 2 : 1;
    for (let x = x0; x <= x1; x++) { if (x % step) continue; for (let y = y0; y <= y1; y++) { if (y % step) continue; ctx.fillRect(S.view.ox + x * sc - 1, S.view.oy + y * sc - 1, 2, 2); } }
    // node voltage colouring range
    let vmax = 1;
    S.circuit.wires.forEach((w) => { const v = S.sim.pointVoltage(w.x1, w.y1); if (v != null) vmax = Math.max(vmax, Math.abs(v)); });
    const vcol = (v) => {
      if (v == null || !S.ran) return C.wire;
      const f = Math.min(1, Math.abs(v) / vmax);
      if (f < 0.04) return C.wire;
      return v > 0 ? mix(C.wire, C.pos, 0.35 + 0.65 * f) : mix(C.wire, C.neg, 0.35 + 0.65 * f);
    };
    // wires
    ctx.lineCap = "round";
    S.circuit.wires.forEach((w, k) => {
      const sel = S.sel && S.sel.kind === "wire" && S.sel.k === k;
      ctx.strokeStyle = sel ? C.accent : vcol(S.sim.pointVoltage(w.x1, w.y1));
      ctx.lineWidth = sel ? 4 : Math.max(2, sc * 0.11);
      ctx.beginPath(); ctx.moveTo(S.view.ox + w.x1 * sc, S.view.oy + w.y1 * sc); ctx.lineTo(S.view.ox + w.x2 * sc, S.view.oy + w.y2 * sc); ctx.stroke();
    });
    // junction dots: points where three or more things meet
    const deg = new Map(), bump = (x, y, n) => { const key = x + "," + y; deg.set(key, (deg.get(key) || 0) + n); };
    S.circuit.wires.forEach((w) => { bump(w.x1, w.y1, 1); bump(w.x2, w.y2, 1); });
    S.circuit.wires.forEach((w) => deg.forEach((d, key) => { const q = key.split(",").map(Number); if (CS.onSegment(q[0], q[1], w) && !(q[0] === w.x1 && q[1] === w.y1) && !(q[0] === w.x2 && q[1] === w.y2)) deg.set(key, d + 2); }));
    allPins().forEach((q) => bump(q.x, q.y, 1));
    deg.forEach((d, key) => { if (d < 3) return; const q = key.split(",").map(Number); ctx.fillStyle = vcol(S.sim.pointVoltage(q[0], q[1])); ctx.beginPath(); ctx.arc(S.view.ox + q[0] * sc, S.view.oy + q[1] * sc, Math.max(3, sc * 0.17), 0, Math.PI * 2); ctx.fill(); });
    // current dots
    if (S.ran && S.flows) {
      const dtReal = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
      ctx.fillStyle = C.dark ? "#ffe066" : "#e8a100";
      S.flows.edges.forEach((e, k) => {
        const i = e.i, a = Math.abs(i);
        if (a < 1e-7) return;
        const speed = Math.sign(i) * Math.min(5, 0.6 + Math.log10(a / 1e-7) * 0.7);   // grid units per second, log of current
        const ph = ((S.dotPhase.get(k) || 0) + speed * (S.running ? dtReal : 0)) % 1;
        S.dotPhase.set(k, ph);
        const len = Math.hypot(e.pb[0] - e.pa[0], e.pb[1] - e.pa[1]);
        for (let d = ((ph % 1) + 1) % 1; d < len; d += 1) {
          const f = d / len, x = e.pa[0] + (e.pb[0] - e.pa[0]) * f, y = e.pa[1] + (e.pb[1] - e.pa[1]) * f;
          ctx.beginPath(); ctx.arc(S.view.ox + x * sc, S.view.oy + y * sc, Math.max(2, sc * 0.11), 0, Math.PI * 2); ctx.fill();
        }
      });
    }
    // parts
    const infos = {};
    S.circuit.parts.forEach((p) => {
      const info = S.sim.partInfo(p.id); infos[p.id] = info;
      const sel = S.sel && S.sel.kind === "part" && S.sel.id === p.id;
      if (sel) { const b = partBox(p); ctx.save(); ctx.strokeStyle = C.accent; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.strokeRect(S.view.ox + (b[0] - 0.35) * sc, S.view.oy + (b[1] - 0.35) * sc, (b[2] - b[0] + 0.7) * sc, (b[3] - b[1] + 0.7) * sc); ctx.restore(); }
      drawSymbol(ctx, p, info);
      // pin dots
      CS.pinPositions(p).forEach((q) => { ctx.fillStyle = vcol(S.sim.pointVoltage(q[0], q[1])); ctx.beginPath(); ctx.arc(S.view.ox + q[0] * sc, S.view.oy + q[1] * sc, Math.max(2, sc * 0.1), 0, Math.PI * 2); ctx.fill(); });
      // label + value (never rotated)
      const b = partBox(p), vertical = (p.rot % 2 === 1) && !/^(battery|dcsupply|acsource|isource)$/.test(p.type) || (p.rot % 2 === 0 && /^(battery|dcsupply|acsource|isource)$/.test(p.type));
      const fs = Math.max(9, Math.min(14, sc * 0.5));
      ctx.font = "600 " + fs + "px JetBrains Mono, ui-monospace, monospace"; ctx.fillStyle = C.accent;
      let lx, ly;
      if (vertical) { ctx.textAlign = "left"; lx = S.view.ox + (b[2] + 0.45) * sc; ly = S.view.oy + (p.y - 0.25) * sc; }
      else { ctx.textAlign = "center"; lx = S.view.ox + p.x * sc; ly = S.view.oy + (b[1] - 0.55) * sc; }
      ctx.textBaseline = "middle";
      if (p.type !== "ground") ctx.fillText(p.label, lx, vertical ? ly : ly - fs * 0.55);
      const vt = valueText(p);
      if (vt) { ctx.fillStyle = C.muted; ctx.font = "500 " + (fs * 0.92) + "px JetBrains Mono, ui-monospace, monospace"; ctx.fillText(vt, lx, vertical ? ly + fs * 1.1 : ly + fs * 0.5); }
      if (info && info.reading != null) {
        const txt = fmt(info.reading, info.unit, 4), x = vertical ? lx : S.view.ox + p.x * sc, y = vertical ? ly + fs * 2.3 : S.view.oy + (b[3] + 0.8) * sc;
        ctx.font = "700 " + (fs * 1.05) + "px JetBrains Mono, ui-monospace, monospace";
        const wv = ctx.measureText(txt).width + 10;
        ctx.fillStyle = C.dark ? "#06101e" : "#0f1b2d"; roundRect(vertical ? x - 3 : x - wv / 2, y - fs * 0.8, wv, fs * 1.6, 5); ctx.fill();
        ctx.fillStyle = "#7CFFB2"; ctx.textAlign = vertical ? "left" : "center"; ctx.fillText(txt, vertical ? x + 2 : x, y);
      }
      if (info && info.burnt) { ctx.fillStyle = C.err; ctx.font = "700 " + fs + "px system-ui"; ctx.textAlign = "center"; ctx.fillText("💥 " + t("burnt"), S.view.ox + p.x * sc, S.view.oy + (b[3] + 0.9) * sc); }
    });
    // ghost of the part being placed / wire being drawn
    if (S.mode === "place" && S.placing && S.hover) {
      ctx.save(); ctx.globalAlpha = 0.5; drawSymbol(ctx, { id: "_ghost", type: S.placing, x: S.hover[0], y: S.hover[1], rot: 0, p: Object.fromEntries(PARTS[S.placing].params.map((q) => [q.k, q.v])) }, null); ctx.restore();
    }
    if (S.mode === "wire" && S.hover) {
      const hx = S.view.ox + S.hover[0] * sc, hy = S.view.oy + S.hover[1] * sc;
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hx, hy, 6, 0, Math.PI * 2); ctx.stroke();
      if (S.wireStart) {
        const a = S.wireStart, b = S.hover, corner = S.vFirst ? [a[0], b[1]] : [b[0], a[1]];
        ctx.setLineDash([6, 4]); ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.moveTo(S.view.ox + a[0] * sc, S.view.oy + a[1] * sc); ctx.lineTo(S.view.ox + corner[0] * sc, S.view.oy + corner[1] * sc); ctx.lineTo(hx, hy); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // hover tooltip
    if (S.mouse && S.mode === "select" && !drag) {
      const g = toGrid(S.mouse[0], S.mouse[1]), p = hitPart(g);
      let lines = null;
      if (p) {
        const i = infos[p.id];
        lines = [p.label + " · " + tr(PARTS[p.type].name)];
        if (i && p.type !== "ground") { lines.push("V " + fmt(i.v, "V") + "   I " + fmt(i.i, "A")); lines.push("P " + fmt(i.p, "W") + (i.burnt ? "   💥" : "")); }
      } else {
        const wk = hitWire(g);
        if (wk >= 0) { const w = S.circuit.wires[wk], v = S.sim.pointVoltage(w.x1, w.y1); lines = [t("nodeV") + ": " + fmt(v, "V")]; }
      }
      if (lines) {
        ctx.font = "500 12px JetBrains Mono, ui-monospace, monospace";
        const wv = Math.max.apply(null, lines.map((l) => ctx.measureText(l).width)) + 16, hv = lines.length * 16 + 10;
        let x = S.mouse[0] + 14, y = S.mouse[1] + 14;
        if (x + wv > W) x = S.mouse[0] - wv - 8; if (y + hv > H) y = S.mouse[1] - hv - 8;
        ctx.fillStyle = C.dark ? "rgba(6,12,26,.92)" : "rgba(255,255,255,.95)"; ctx.strokeStyle = C.line; roundRect(x, y, wv, hv, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.ink; ctx.textAlign = "left"; ctx.textBaseline = "top";
        lines.forEach((l, k) => ctx.fillText(l, x + 8, y + 6 + k * 16));
      }
    }
    if (!S.circuit.parts.length) { ctx.fillStyle = C.muted; ctx.font = "500 15px system-ui"; ctx.textAlign = "center"; ctx.fillText(t("empty"), W / 2, H / 2); }
    lastFrame = now;
    return infos;
  }
  function roundRect(x, y, w, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function mix(a, b, f) {
    const p = (c) => { if (c[0] === "#") { const n = parseInt(c.length === 4 ? c.replace(/^#(.)(.)(.)$/, "$1$1$2$2$3$3") : c.slice(1, 7), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; } const m = c.match(/[\d.]+/g) || [0, 0, 0]; return m.slice(0, 3).map(Number); };
    const x = p(a), y = p(b);
    return "rgb(" + x.map((v, k) => Math.round(v + (y[k] - v) * f)).join(",") + ")";
  }

  // ------------------------------------------------------------------ simulation loop + oscilloscope
  function autoDt() {
    let dt = Math.max(1e-7, Math.min(5e-4, S.speed / 2500));
    S.circuit.parts.forEach((p) => { if (p.type === "acsource") dt = Math.min(dt, 1 / (Math.max(0.01, +p.p.f || 50) * 120)); });
    return dt;
  }
  function scopeWindow() {
    if (S.scope.tdiv) return S.scope.tdiv * 10;
    const ex = EXAMPLES.find((x) => x.id === S.exampleId);
    let f = 0; S.circuit.parts.forEach((p) => { if (p.type === "acsource") f = Math.max(f, +p.p.f || 0); });
    if (f > 0 && S.speed <= 0.2) return 4 / f;
    return ex && ex.tdiv && Math.abs(ex.speed - S.speed) < 1e-12 ? ex.tdiv * 10 : S.speed * 3;
  }
  function sampleScope() {
    const sc = S.scope;
    if (S.scopeHold) return;
    const win = scopeWindow();
    if (sc.last >= 0 && S.sim.t - sc.last < win / 700) return;
    sc.last = S.sim.t;
    const vals = sc.ch.map((ch) => {
      if (!ch) return null;
      const i = S.sim.partInfo(ch.id);
      if (!i) return null;
      return ch.q === "i" ? i.i : (i.reading != null && ch.q === "v" && partById(ch.id).type === "voltmeter" ? i.v : i.v);
    });
    sc.buf.push([S.sim.t, vals[0], vals[1]]);
    const cut = S.sim.t - win * 1.05;
    let k = 0; while (k < sc.buf.length && sc.buf[k][0] < cut) k++;
    if (k) sc.buf.splice(0, k);
  }
  function advance(real) {
    const want = real * S.speed, dt = autoDt(), t0 = performance.now();
    let done = 0;
    S.slow = false;
    while (done < want - 1e-15) {
      const h = Math.min(dt, want - done);
      S.sim.step(h); done += h; sampleScope();
      if (performance.now() - t0 > 14) { S.slow = true; break; }
    }
    S.ran = true;
    if (S.sim.events.length) {
      S.sim.events.length = 0;
      S.circuit.parts.forEach((p) => { const st = S.sim.state(p.id); if (st.burnt && !st.told) { st.told = true; S.events.unshift([p.label, st.burnt]); announce(p.label + " " + (t("events")[st.burnt] || st.burnt)); } });
      S.events = S.events.slice(0, 6);
      renderPanels(true);
    }
  }
  function drawScope() {
    const c = $("scope"), g = c.getContext("2d"), r = c.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = r.width, hh = r.height, C = S.colors;
    g.fillStyle = "#04110c"; g.fillRect(0, 0, w, hh);
    g.strokeStyle = "rgba(80,255,170,.12)"; g.lineWidth = 1;
    for (let k = 1; k < 10; k++) { g.beginPath(); g.moveTo(w * k / 10, 0); g.lineTo(w * k / 10, hh); g.stroke(); }
    for (let k = 1; k < 8; k++) { g.beginPath(); g.moveTo(0, hh * k / 8); g.lineTo(w, hh * k / 8); g.stroke(); }
    g.strokeStyle = "rgba(80,255,170,.3)"; g.beginPath(); g.moveTo(0, hh / 2); g.lineTo(w, hh / 2); g.stroke();
    const buf = S.scope.buf, win = scopeWindow(), tEnd = buf.length ? buf[buf.length - 1][0] : 0, tStart = tEnd - win;
    const cols = ["#ffd84a", "#4ad7ff"], stats = [];
    [1, 2].forEach((ci) => {
      const pts = buf.filter((s) => s[ci] != null && s[0] >= tStart);
      if (!pts.length) { stats.push(null); return; }
      let mn = Infinity, mx = -Infinity, sum = 0, sq = 0;
      pts.forEach((s) => { mn = Math.min(mn, s[ci]); mx = Math.max(mx, s[ci]); sum += s[ci]; sq += s[ci] * s[ci]; });
      const avg = sum / pts.length, rms = Math.sqrt(sq / pts.length);
      let cross = []; for (let k = 1; k < pts.length; k++) if (pts[k - 1][ci] < avg && pts[k][ci] >= avg && mx - mn > 1e-9) cross.push(pts[k][0]);
      const f = cross.length > 1 ? (cross.length - 1) / (cross[cross.length - 1] - cross[0]) : 0;
      // vertical scale: symmetric around 0 when the signal crosses zero, else fit min..max
      const span = Math.max(Math.abs(mn), Math.abs(mx)) || 1, both = mn < 0 && mx > 0;
      const lo = both || mn >= 0 && mn < 0.2 * mx ? -span * (both ? 1.1 : 0.05) : mn - (mx - mn) * 0.15 - 1e-9;
      const hi = both ? span * 1.1 : mx + (mx - mn) * 0.15 + 1e-9;
      const lo2 = mn >= 0 && !both ? Math.min(lo, 0) : lo;
      g.strokeStyle = cols[ci - 1]; g.lineWidth = 1.8; g.beginPath();
      pts.forEach((s, k) => { const x = (s[0] - tStart) / win * w, y = hh - (s[ci] - lo2) / (hi - lo2) * hh; k ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
      stats.push({ mn: mn, mx: mx, avg: avg, rms: rms, f: f, lo: lo2, hi: hi });
    });
    // labels
    g.font = "600 11px JetBrains Mono, ui-monospace, monospace"; g.textBaseline = "top";
    g.fillStyle = "rgba(160,255,210,.8)"; g.textAlign = "right"; g.fillText(fmt(win / 10, "s") + "/div", w - 6, 5);
    const unitOf = (ch) => (ch && ch.q === "i" ? "A" : "V");
    const box = [];
    S.scope.ch.forEach((ch, k) => {
      const s = stats[k];
      if (!ch || !s) return;
      const p = partById(ch.id), u = unitOf(ch);
      g.fillStyle = cols[k]; g.textAlign = "left";
      g.fillText("CH" + (k + 1) + " " + (p ? p.label : "?") + " " + (ch.q === "i" ? "I" : "V") + "  " + fmt((s.hi - s.lo) / 8, u) + "/div", 6, 5 + k * 15);
      box.push([k, s, u]);
    });
    fill($("scopeStats"), box.map(([k, s, u]) => h("div", { class: "sstat", style: "--c:" + cols[k] },
      h("b", {}, "CH" + (k + 1)), " " + t("max") + " " + fmt(s.mx, u) + " · " + t("min") + " " + fmt(s.mn, u) + " · " + t("pp") + " " + fmt(s.mx - s.mn, u) +
      " · " + t("avg") + " " + fmt(s.avg, u) + " · " + t("rms") + " " + fmt(s.rms, u) + (s.f > 0 ? " · " + t("freq") + " " + fmt(s.f, "Hz") : ""))));
    void C;
  }

  // ------------------------------------------------------------------ sound (buzzers)
  let audio = null;
  function soundUpdate(infos) {
    const on = S.sound && S.running && S.circuit.parts.some((p) => p.type === "buzzer" && infos[p.id] && infos[p.id].sound);
    if (on && !audio) {
      try { const ac = new (window.AudioContext || window.webkitAudioContext)(), o = ac.createOscillator(), gn = ac.createGain(); o.type = "square"; o.frequency.value = 2400; gn.gain.value = 0.03; o.connect(gn); gn.connect(ac.destination); o.start(); audio = { ac: ac, o: o }; } catch (_) { audio = null; }
    } else if (!on && audio) { try { audio.o.stop(); audio.ac.close(); } catch (_) { /* ignore */ } audio = null; }
  }

  // ------------------------------------------------------------------ panels
  function renderPalette() {
    const q = $("psearch").value.trim().toLowerCase();
    const groups = CS.CATS.map(([cat, label]) => {
      const items = Object.values(PARTS).filter((d) => d.cat === cat && (!q || tr(d.name).toLowerCase().includes(q) || d.name.en.toLowerCase().includes(q) || d.type.includes(q)));
      if (!items.length) return null;
      return h("div", { class: "pgroup" }, h("div", { class: "lbl" }, tr(label)),
        items.map((d) => h("button", { type: "button", class: "pitem" + (S.placing === d.type ? " on" : ""), title: tr(d.blurb), "aria-pressed": String(S.placing === d.type),
          onclick: (e) => {
            if (e.detail === 0) { const at = freeSpot(d.type); placePart(d.type, at); cv.focus(); return; }   // keyboard: place at once
            S.placing = d.type; setMode("place"); renderPalette(); announce(t("place"));
          } }, h("span", { class: "pic", "aria-hidden": "true" }, d.icon), h("span", {}, tr(d.name)))));
    });
    fill($("palette"), groups);
  }
  function renderTools() {
    $("selBtn").setAttribute("aria-pressed", String(S.mode === "select" || S.mode === "place"));
    $("wireBtn").setAttribute("aria-pressed", String(S.mode === "wire"));
    $("hint").textContent = S.mode === "wire" ? t("wiring") : S.mode === "place" ? t("place") : t("keys");
    renderPalette();
  }
  function paramInput(p, q) {
    const id = "pp-" + q.k, val = p.p[q.k];
    const apply = () => { save(); renderPanels(true); if (S.view3d && S.pcb) S.pcb.setCircuit(S.circuit); };
    let control;
    if (q.choices) {
      control = h("select", { id: id, onchange: (e) => { const v = q.choices.find((c) => String(c[0]) === e.target.value); p.p[q.k] = v ? v[0] : q.v; commit(false); apply(); } },
        q.choices.map((c) => { const o = h("option", { value: String(c[0]) }, tr(c[1])); if (String(c[0]) === String(val)) o.selected = true; return o; }));
    } else if (q.bool) {
      control = h("input", { id: id, type: "checkbox", onchange: (e) => { p.p[q.k] = e.target.checked; apply(); } });
      control.checked = val === true;
    } else {
      const txt = h("input", { id: id, type: "text", inputmode: "decimal", value: q.unit === "%" || q.unit === "°C" || q.unit === "" || q.unit === ":1" ? String(val) : fmt(val, "").trim().replace(/\s/g, ""), "aria-describedby": id + "-u",
        onchange: (e) => {
          const v = CS.parseValue(e.target.value);
          if (!isFinite(v) || (q.min != null && v < q.min) || (q.max != null && v > q.max)) { e.target.setAttribute("aria-invalid", "true"); e.target.title = t("bad"); announce(t("bad")); return; }
          e.target.removeAttribute("aria-invalid"); p.p[q.k] = v; commit(false); apply();
        } });
      control = h("span", { class: "numrow" }, txt, h("span", { class: "unit", id: id + "-u" }, q.unit));
      if (q.slider) {
        const rng = h("input", { type: "range", min: q.log ? Math.log10(q.min) : q.min, max: q.log ? Math.log10(q.max) : q.max, step: q.log ? 0.01 : (q.max - q.min) / 200, "aria-label": tr(q.label),
          oninput: (e) => { const v = q.log ? Math.pow(10, +e.target.value) : +e.target.value; p.p[q.k] = Number(v.toPrecision(3)); txt.value = String(p.p[q.k]); save(); } });
        rng.value = String(q.log ? Math.log10(val) : val);
        control = h("span", { class: "sliderrow" }, rng, control);
      }
    }
    return h("div", { class: "param" }, h("label", { for: id }, tr(q.label)), control);
  }
  function infoRows(info) {
    if (!info) return [];
    const rows = [];
    if (!info.source || true) { rows.push(["V", fmt(info.v, "V")]); rows.push(["I", fmt(info.i, "A")]); rows.push(["P", fmt(info.p, "W")]); }
    if (info.reading != null) rows.unshift(["⊙", fmt(info.reading, info.unit, 4)]);
    (info.rows || []).forEach((r) => rows.push([r[0], typeof r[1] === "number" ? fmt(r[1], r[2]) : String(r[1])]));
    return rows;
  }
  function renderProps() {
    const box = $("props");
    if (!S.sel) {
      fill(box, h("p", { class: "muted" }, t("nothing")), S.events.length ? h("ul", { class: "events" }, S.events.map(([l, ev]) => h("li", {}, "💥 " + l + " " + (t("events")[ev] || ev)))) : null);
      return;
    }
    if (S.sel.kind === "wire") {
      const w = S.circuit.wires[S.sel.k];
      if (!w) { S.sel = null; return renderProps(); }
      fill(box, h("h3", {}, t("wireSel")), h("p", {}, t("nodeV") + ": ", h("b", { class: "mono" }, fmt(S.sim.pointVoltage(w.x1, w.y1), "V"))),
        h("button", { class: "btn small", type: "button", onclick: deleteSel }, t("del")));
      return;
    }
    const p = partById(S.sel.id);
    if (!p) { S.sel = null; return renderProps(); }
    const def = PARTS[p.type], info = S.sim.partInfo(p.id);
    const pinsNow = CS.pinPositions(p), others = allPins().filter((q) => q.part !== p);
    fill(box,
      h("h3", {}, h("span", { "aria-hidden": "true" }, def.icon + " "), tr(def.name)),
      info && info.burnt ? h("p", { class: "burnt" }, "💥 " + p.label + " " + (t("events")[info.burnt] || info.burnt) + " ", h("button", { class: "btn small", type: "button", onclick: () => { S.sim.repair(p.id); S.events = S.events.filter((e) => e[0] !== p.label); renderPanels(true); } }, t("repair"))) : null,
      h("p", { class: "blurb" }, tr(def.blurb)),
      h("div", { class: "param" }, h("label", { for: "pp-label" }, t("label")),
        h("input", { id: "pp-label", type: "text", value: p.label, maxlength: "12", onchange: (e) => { p.label = e.target.value.trim().slice(0, 12) || p.label; commit(false); renderPanels(true); } })),
      def.params.map((q) => paramInput(p, q)),
      h("div", { class: "row" },
        h("button", { class: "btn small", type: "button", onclick: () => rotatePart(p) }, t("rotate")),
        h("button", { class: "btn small", type: "button", onclick: duplicateSel }, t("dup")),
        h("button", { class: "btn small danger", type: "button", onclick: deleteSel }, t("del"))),
      h("table", { class: "kv" }, h("tbody", { id: "selLive" }, infoRows(info).map((r) => h("tr", {}, h("th", {}, r[0]), h("td", {}, r[1]))))),
      h("details", { class: "pins" }, h("summary", {}, t("pins") + " (" + def.pinNames.length + ")"),
        def.pinNames.map((nm, k) => h("div", { class: "pinrow" },
          h("span", { class: "mono" }, nm + " · " + fmt(info ? info.pinV[k] : 0, "V")),
          h("select", { "aria-label": p.label + " " + nm + " — " + t("connect"),
            onchange: (e) => { const o = others[+e.target.value]; if (!o) return; connectPins(pinsNow[k], [o.x, o.y]); commit(); e.target.value = ""; announce(p.label + "." + nm + " → " + o.part.label + "." + PARTS[o.part.type].pinNames[o.k]); } },
            h("option", { value: "" }, t("connect")), others.map((o, j) => h("option", { value: String(j) }, o.part.label + " · " + PARTS[o.part.type].pinNames[o.k])))))));
  }
  function renderLive() {
    if ($("live").contains(document.activeElement)) {   // keyboard user is in the table: update numbers only, keep focus
      const trs = $("live").querySelectorAll("tbody tr");
      S.circuit.parts.filter((p) => p.type !== "ground").forEach((p, k) => {
        const i = S.sim.partInfo(p.id) || {}, td = trs[k] ? trs[k].children : null;
        if (!td) return;
        td[2].textContent = fmt(i.v, "V"); td[3].textContent = fmt(i.i, "A"); td[4].textContent = fmt(i.p, "W");
      });
      return;
    }
    const rows = S.circuit.parts.filter((p) => p.type !== "ground").map((p) => {
      const i = S.sim.partInfo(p.id) || {};
      return h("tr", { class: (S.sel && S.sel.id === p.id ? "on" : "") + (i.burnt ? " burnt" : ""), tabindex: "0", onclick: () => { S.sel = { kind: "part", id: p.id }; renderPanels(true); },
        onkeydown: (e) => { if (e.key === "Enter") { S.sel = { kind: "part", id: p.id }; renderPanels(true); cv.focus(); } } },
        h("td", {}, p.label), h("td", { class: "mono" }, i.reading != null ? fmt(i.reading, i.unit, 4) : valueText(p)), h("td", { class: "mono" }, fmt(i.v, "V")), h("td", { class: "mono" }, fmt(i.i, "A")),
        h("td", { class: "mono" }, fmt(i.p, "W")), h("td", {}, i.burnt ? "💥" : i.glow > 0.15 ? "💡" : i.sound ? "🔔" : ""));
    });
    fill($("live"), h("thead", {}, h("tr", {}, t("col").map((c) => h("th", { scope: "col" }, c)))), h("tbody", {}, rows));
  }
  function renderStatus() {
    const parts = [t("t") + " = " + fmt(S.sim.t, "s"), S.sim.nodes + " " + t("nodes")];
    $("status").textContent = parts.join(" · ");
    const warn = [S.sim.noGround && S.circuit.parts.length ? t("noGround") : null, S.sim.warn ? t("conv") : null, S.slow ? t("slowed") : null].filter(Boolean);
    $("warn").textContent = warn.join(" ");
    $("warn").hidden = !warn.length;
  }
  function renderScopeSelects() {
    const opts = (sel) => [h("option", { value: "" }, t("off"))].concat(S.circuit.parts.filter((p) => p.type !== "ground").flatMap((p) => ["v", "i"].map((q) => {
      const o = h("option", { value: p.id + ":" + q }, p.label + " · " + (q === "v" ? t("voltage") : t("current")));
      if (sel && sel.id === p.id && sel.q === q) o.selected = true;
      return o;
    })));
    [0, 1].forEach((k) => {
      const el = $("ch" + (k + 1)), ch = S.scope.ch[k];
      if (ch && !partById(ch.id)) S.scope.ch[k] = null;
      fill(el, opts(S.scope.ch[k]));
    });
  }
  function renderPanels(force) {
    const now = performance.now();
    if (!force && now - S.lastPanel < 200) return;
    S.lastPanel = now;
    const active = document.activeElement;
    const inProps = active && $("props").contains(active) && /^(INPUT|SELECT)$/.test(active.tagName);
    if (force && !inProps) renderProps();
    else if (S.sel && S.sel.kind === "part") {
      const tb = $("selLive"), info = S.sim.partInfo(S.sel.id);
      if (tb && info) fill(tb, infoRows(info).map((r) => h("tr", {}, h("th", {}, r[0]), h("td", {}, r[1]))));
    }
    renderLive(); renderStatus();
    if (force) renderScopeSelects();
  }
  function renderAllText() {
    document.documentElement.lang = S.lang; document.title = t("title") + " · Quantix";
    $("tTitle").textContent = t("title");
    [["selBtn", "select"], ["wireBtn", "wire"], ["fitBtn", "fit"], ["newBtn", "clear"], ["v2d", "view2d"], ["v3d", "view3d"], ["saveBtn", "save"], ["openBtn", "open"],
      ["shareBtn", "share"], ["pngBtn", "png"], ["bomBtn", "bom"], ["resetBtn", "reset"], ["speedLbl", "speed"], ["tdivLbl", "tdiv"]].forEach(([id, k]) => { $(id).textContent = t(k); });
    $("undoBtn").textContent = t("undo"); $("redoBtn").textContent = t("redo");
    $("undoBtn").setAttribute("aria-label", "Undo (Ctrl+Z)"); $("redoBtn").setAttribute("aria-label", "Redo (Ctrl+Y)");
    $("partsLbl").textContent = t("parts"); $("psearch").placeholder = t("search"); $("propsLbl").textContent = t("props"); $("liveLbl").textContent = t("live"); $("scopeLbl").textContent = t("scope");
    $("soundLbl").textContent = t("sound"); $("damageLbl").textContent = t("damage"); $("tip3d").textContent = t("tip3d");
    fill($("speed"), t("speeds").slice().sort((a, b) => b[0] - a[0]).map(([v, lab]) => { const o = h("option", { value: String(v) }, lab); if (Math.abs(v - S.speed) < 1e-12) o.selected = true; return o; }));
    fill($("examples"), h("option", { value: "" }, t("examples")), EXAMPLES.map((ex) => h("option", { value: ex.id }, tr(ex.title))));
    const td = [0, 1e-5, 5e-5, 1e-4, 5e-4, 1e-3, 5e-3, 0.01, 0.05, 0.1, 0.5, 1];
    fill($("tdiv"), td.map((v) => { const o = h("option", { value: String(v) }, v ? fmt(v, "s") : t("auto")); if (v === S.scope.tdiv) o.selected = true; return o; }));
    $("holdBtn").textContent = S.scopeHold ? t("go") : t("hold");
    renderRun(); renderTools(); renderPanels(true); renderExampleNote();
    document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === S.lang)));
  }
  function renderRun() { $("runBtn").textContent = S.running ? t("pause") : t("run"); $("runBtn").setAttribute("aria-pressed", String(S.running)); }
  function renderExampleNote() {
    const ex = EXAMPLES.find((x) => x.id === S.exampleId);
    $("exNote").hidden = !ex; if (ex) fill($("exNote"), h("b", {}, tr(ex.title) + ": "), tr(ex.blurb));
  }
  function toggleRun() { S.running = !S.running; renderRun(); announce(S.running ? t("pause") : t("run")); }

  // ------------------------------------------------------------------ examples, files, sharing
  function loadCircuit(c, exampleId) {
    S.circuit = cleanCircuit(c); S.sel = null; S.exampleId = exampleId || null;
    idCounter = 1;
    S.sim = CS.create(S.circuit, { damage: S.damage }); S.scope.buf = []; S.scope.last = -1; S.ran = false; S.flows = null; S.events = [];
    const ex = EXAMPLES.find((x) => x.id === exampleId);
    if (ex) {
      S.speed = ex.speed; S.scope.tdiv = 0;
      S.scope.ch = (ex.scope || []).map(([label, q]) => { const p = S.circuit.parts.find((x) => x.label === label); return p ? { id: p.id, q: q } : null; });
      while (S.scope.ch.length < 2) S.scope.ch.push(null);
    } else {
      const firstLoad = S.circuit.parts.find((p) => /^(led|resistor|lamp|motor|capacitor)$/.test(p.type));
      S.scope.ch = [firstLoad ? { id: firstLoad.id, q: "v" } : null, null];
    }
    S.snap = snapshot(); save();
    if (S.view3d && S.pcb) S.pcb.setCircuit(S.circuit);
    fit(); renderAllText();
  }
  function loadExample(id) {
    const ex = EXAMPLES.find((x) => x.id === id);
    if (!ex) return;
    if (S.snap) { S.undo.push(S.snap); S.redo = []; }
    loadCircuit(ex.make(), id);
    S.running = true; renderRun();
    announce(tr(ex.title));
  }
  function download(name, type, data) {
    const a = document.createElement("a"), url = URL.createObjectURL(new Blob([data], { type: type }));
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function encode(c) { return btoa(unescape(encodeURIComponent(JSON.stringify(c)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function decode(s) { return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))))); }
  function bomCsv() {
    const rows = [["Label", "Part", "Value", "Parameters"]];
    S.circuit.parts.filter((p) => p.type !== "ground").forEach((p) => rows.push([p.label, PARTS[p.type].name.en, valueText(p),
      PARTS[p.type].params.map((q) => q.label.en + " = " + (typeof p.p[q.k] === "number" ? fmt(p.p[q.k], q.unit) : p.p[q.k])).join("; ")]));
    return rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\r\n");
  }

  // ------------------------------------------------------------------ 3D view
  // three.js (≈600 kB) and the 3D builder load only the first time someone opens the 3D view
  function loadScript(src) { return new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = bad; document.head.append(s); }); }
  function setView(three) {
    if (three && !window.CircuitPCB3D) {
      $("v3d").disabled = true;
      (window.THREE ? Promise.resolve() : loadScript("/web/vendor/three.min.js")).then(() => loadScript("/web/circuit_3d.js"))
        .then(() => { $("v3d").disabled = false; setView(true); }, () => { $("v3d").disabled = false; announce("3D could not load."); });
      return;
    }
    S.view3d = three;
    $("v2d").setAttribute("aria-pressed", String(!three)); $("v3d").setAttribute("aria-pressed", String(three));
    $("cv").hidden = three; $("pcb").hidden = !three; $("tip3d").hidden = !three;
    if (three) {
      if (!S.pcb) S.pcb = window.CircuitPCB3D.create($("pcb"));
      S.pcb.setCircuit(S.circuit); S.pcb.resize();
    }
  }

  // ------------------------------------------------------------------ main loop
  let last = 0;
  function frame(now) {
    const real = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (S.running && S.circuit.parts.length) advance(real);
    if (S.ran && (!S.flows || now - S.flowAt > 120)) { updateFlows(); S.flowAt = now; }
    let infos;
    if (!S.view3d) infos = draw(now);
    else { infos = {}; S.circuit.parts.forEach((p) => { infos[p.id] = S.sim.partInfo(p.id); }); S.pcb.update(infos, S.sim); }
    soundUpdate(infos);
    drawScope();
    renderPanels(false);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ wiring up the page
  $("runBtn").onclick = toggleRun;
  $("resetBtn").onclick = () => { S.sim.reset(); S.scope.buf = []; S.scope.last = -1; S.events = []; S.ran = false; S.circuit.parts.forEach((p) => { if (p.type === "button") p.p.on = false; }); renderPanels(true); };
  $("speed").onchange = (e) => { S.speed = +e.target.value; S.scope.buf = []; S.scope.last = -1; };
  $("selBtn").onclick = () => setMode("select");
  $("wireBtn").onclick = () => { setMode(S.mode === "wire" ? "select" : "wire"); cv.focus(); };
  $("undoBtn").onclick = undo; $("redoBtn").onclick = redo;
  $("fitBtn").onclick = () => { fit(); if (S.pcb && S.view3d) S.pcb.setCircuit(S.circuit); };
  $("newBtn").onclick = () => { if (S.snap) { S.undo.push(S.snap); S.redo = []; } loadCircuit({ parts: [], wires: [] }); };
  $("examples").onchange = (e) => { if (e.target.value) loadExample(e.target.value); e.target.value = ""; };
  $("v2d").onclick = () => setView(false); $("v3d").onclick = () => setView(true);
  $("psearch").oninput = renderPalette;
  $("ch1").onchange = $("ch2").onchange = (e) => {
    const k = e.target.id === "ch1" ? 0 : 1, v = e.target.value;
    S.scope.ch[k] = v ? { id: v.split(":")[0], q: v.split(":")[1] } : null;
    S.scope.buf = []; S.scope.last = -1;
  };
  $("tdiv").onchange = (e) => { S.scope.tdiv = +e.target.value; S.scope.buf = []; S.scope.last = -1; };
  $("holdBtn").onclick = () => { S.scopeHold = !S.scopeHold; $("holdBtn").textContent = S.scopeHold ? t("go") : t("hold"); };
  $("sound").onchange = (e) => { S.sound = e.target.checked; };
  $("damage").onchange = (e) => { S.damage = e.target.checked; S.sim.damage = S.damage; };
  $("saveBtn").onclick = () => download("circuit.quantix.json", "application/json", JSON.stringify(S.circuit, null, 1));
  $("openBtn").onclick = () => $("fileIn").click();
  $("fileIn").onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((txt) => { if (S.snap) { S.undo.push(S.snap); S.redo = []; } loadCircuit(JSON.parse(txt)); }).catch(() => announce("✗ JSON"));
    e.target.value = "";
  };
  $("shareBtn").onclick = () => {
    const url = location.origin + location.pathname + "#c=" + encode(S.circuit);
    history.replaceState(null, "", "#c=" + encode(S.circuit));
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => announce(t("copied")), () => announce(t("copyFail")));
    $("say").textContent = navigator.clipboard ? t("copied") : t("copyFail");
  };
  $("pngBtn").onclick = () => { const a = document.createElement("a"); a.href = cv.toDataURL("image/png"); a.download = "circuit.png"; a.click(); };
  $("bomBtn").onclick = () => download("circuit-parts.csv", "text/csv", "﻿" + bomCsv());

  function applyLang(l) {
    S.lang = TX[l] ? l : "en";
    try { localStorage.setItem("iav-formula-lang", S.lang); } catch (_) { /* private mode */ }
    renderAllText();
  }
  document.querySelectorAll(".lang button").forEach((b) => b.addEventListener("click", () => applyLang(b.dataset.lang)));
  const rootEl = document.documentElement;
  try { const th = localStorage.getItem("iav-theme"); if (th) rootEl.dataset.theme = th; } catch (_) { /* private mode */ }
  $("themeBtn").onclick = () => {
    const dark = rootEl.dataset.theme ? rootEl.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    rootEl.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("iav-theme", rootEl.dataset.theme); } catch (_) { /* private mode */ }
    readColors(); if (S.pcb) S.pcb.theme();
  };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColors(); if (S.pcb) S.pcb.theme(); });

  // start: shared link > autosave > first example
  readColors();
  new ResizeObserver(resize).observe($("stage"));
  resize();
  let lang = new URLSearchParams(location.search).get("lang");
  try { lang = lang || localStorage.getItem("iav-formula-lang"); } catch (_) { /* private mode */ }
  S.lang = TX[lang] ? lang : "en";
  let start = null, startEx = null;
  const m = location.hash.match(/^#c=([\w-]+)/);
  if (m) { try { start = decode(m[1]); } catch (_) { start = null; } }
  const exHash = location.hash.match(/^#ex=([\w-]+)/);
  if (!start && exHash && EXAMPLES.some((x) => x.id === exHash[1])) startEx = exHash[1];
  if (!start && !startEx) { try { const saved = localStorage.getItem(STORE); if (saved) start = JSON.parse(saved); } catch (_) { start = null; } }
  if (start && start.parts && start.parts.length) loadCircuit(start);
  else { const ex = EXAMPLES.find((x) => x.id === (startEx || "led")); loadCircuit(ex ? ex.make() : { parts: [], wires: [] }, ex && ex.id); }
  $("sound").checked = S.sound; $("damage").checked = S.damage;
  requestAnimationFrame(frame);
  window.QuantixCircuit = { state: S, loadExample: loadExample };   // for tests / debugging
})();
