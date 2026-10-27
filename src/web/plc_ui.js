/* Quantix PLC Lab — ladder editor, live power flow, I/O panel, animated machines, Structured Text view.
   Engine: plc_engine.js. */
(function () {
  "use strict";
  const E = window.PLCEngine, EXAMPLES = E.EXAMPLES;
  const $ = (id) => document.getElementById(id);
  const STORE = "quantix-plc-v1";
  const scanMs = () => Math.max(1, Math.min(1000, +(S.prog && S.prog.scan) || 10));
  // machine settings (stored in the program, so they travel with save / share)
  const CFG = {
    motor: [["rpm", { en: "Rated speed", hi: "रेटेड गति" }, "rpm", 300, 3000, 10, 1450]],
    traffic: [["cars", { en: "Cars", hi: "कारें" }, "", 1, 6, 1, 3], ["carSpeed", { en: "Car speed", hi: "कार की गति" }, "px/s", 40, 320, 10, 140]],
    tank: [["fill", { en: "Pump flow", hi: "पंप प्रवाह" }, "%/s", 1, 30, 1, 9], ["drain", { en: "Outlet flow", hi: "आउटलेट प्रवाह" }, "%/s", 1, 30, 1, 6],
      ["low", { en: "LOW sensor height", hi: "LOW सेंसर ऊँचाई" }, "%", 5, 50, 1, 20], ["high", { en: "HIGH sensor height", hi: "HIGH सेंसर ऊँचाई" }, "%", 50, 98, 1, 85]],
    conveyor: [["speed", { en: "Belt speed", hi: "बेल्ट गति" }, "px/s", 40, 320, 10, 120], ["gap", { en: "New box every", hi: "हर इतने में नया बॉक्स" }, "s", 0.4, 5, 0.1, 1.6]],
    flasher: [["hue", { en: "Beacon colour", hi: "बीकन रंग" }, "°", 0, 359, 1, 28]],
    stardelta: [["rpm", { en: "Rated speed", hi: "रेटेड गति" }, "rpm", 300, 3000, 10, 1450]],
    panel: [],
  };
  const cfg = () => { const out = {}; (CFG[S.scene] || []).forEach((c) => { out[c[0]] = c[6]; }); return Object.assign(out, ((S.prog && S.prog.cfg) || {})[S.scene] || {}); };

  const TX = {
    en: { title: "PLC Lab", examples: "Examples", run: "▶ RUN", stop: "■ STOP", running: "RUN", stopped: "STOP", scan: "scan", scans: "scans",
      addRung: "+ Rung", addContact: "+ Contact", addBranch: "+ Parallel branch", addOut: "+ Output", del: "🗑 Delete", up: "↑", down: "↓", undo: "↶", redo: "↷", newProg: "New",
      ladder: "Ladder program", io: "Inputs & outputs", inputs: "Inputs", outputs: "Outputs", props: "Properties", tc: "Timers & counters", st: "Structured Text (IEC 61131-3)",
      tags: "Tag names", machine: "Machine", copy: "📋 Copy", save: "💾 Save", open: "📂 Open", share: "🔗 Share link", copied: "Copied", rungNote: "Rung comment",
      type: "Type", tag: "Address", preset: "Preset", presetS: "Preset (s)", presetN: "Preset (count)", a: "Value A", b: "Value B", op: "Compare",
      selectHint: "Click a contact, an output or a rung number to edit it. Contacts and outputs are buttons: Tab to them, Delete removes, arrows move between them.",
      button: "push button", switch: "switch", sensor: "sensor (machine)", kind: "Input kind", name: "Name",
      contactTypes: { NO: "Normally open  -| |-", NC: "Normally closed  -|/|-", P: "Rising edge  -|P|-", N: "Falling edge  -|N|-", CMP: "Compare  [A ? B]" },
      outTypes: { OUT: "Coil  -( )-", SET: "Set / latch  -(S)-", RST: "Reset / unlatch  -(R)-", TON: "On-delay timer TON", TOF: "Off-delay timer TOF", TP: "Pulse timer TP", CTU: "Count up CTU", CTD: "Count down CTD", RES: "Reset timer / counter RES" },
      t: "Timer", c: "Counter", acc: "ACC", pre: "PRE", dn: "DN", empty: "Add a rung to start.",
      keys: "Keys: Tab through contacts · Enter select · Delete remove · Ctrl+Z / Ctrl+Y · Space holds a push button",
      scenes: { motor: "Motor & fan", traffic: "Traffic junction", tank: "Water tank", conveyor: "Conveyor & photo-eye", flasher: "Warning beacon", stardelta: "Star–delta starter", panel: "Lamp panel" } },
    hi: { title: "पीएलसी लैब", examples: "उदाहरण", run: "▶ RUN", stop: "■ STOP", running: "RUN", stopped: "STOP", scan: "स्कैन", scans: "स्कैन",
      addRung: "+ रंग", addContact: "+ संपर्क", addBranch: "+ समांतर शाखा", addOut: "+ आउटपुट", del: "🗑 हटाएँ", up: "↑", down: "↓", undo: "↶", redo: "↷", newProg: "नया",
      ladder: "लैडर प्रोग्राम", io: "इनपुट और आउटपुट", inputs: "इनपुट", outputs: "आउटपुट", props: "गुण", tc: "टाइमर और काउंटर", st: "स्ट्रक्चर्ड टेक्स्ट (IEC 61131-3)",
      tags: "टैग नाम", machine: "मशीन", copy: "📋 कॉपी", save: "💾 सहेजें", open: "📂 खोलें", share: "🔗 शेयर लिंक", copied: "कॉपी हुआ", rungNote: "रंग टिप्पणी",
      type: "प्रकार", tag: "पता", preset: "प्रीसेट", presetS: "प्रीसेट (s)", presetN: "प्रीसेट (गिनती)", a: "मान A", b: "मान B", op: "तुलना",
      selectHint: "संपादन के लिए किसी संपर्क, आउटपुट या रंग संख्या पर क्लिक करें। संपर्क और आउटपुट बटन हैं: Tab से पहुँचें, Delete हटाता है, तीर से आगे-पीछे जाएँ।",
      button: "पुश बटन", switch: "स्विच", sensor: "सेंसर (मशीन)", kind: "इनपुट प्रकार", name: "नाम",
      contactTypes: { NO: "सामान्यतः खुला  -| |-", NC: "सामान्यतः बंद  -|/|-", P: "उठता किनारा  -|P|-", N: "गिरता किनारा  -|N|-", CMP: "तुलना  [A ? B]" },
      outTypes: { OUT: "कॉइल  -( )-", SET: "सेट / लैच  -(S)-", RST: "रीसेट / अनलैच  -(R)-", TON: "ऑन-डिले टाइमर TON", TOF: "ऑफ़-डिले टाइमर TOF", TP: "पल्स टाइमर TP", CTU: "ऊपर गिनती CTU", CTD: "नीचे गिनती CTD", RES: "टाइमर / काउंटर रीसेट RES" },
      t: "टाइमर", c: "काउंटर", acc: "ACC", pre: "PRE", dn: "DN", empty: "शुरू करने के लिए एक रंग जोड़ें।",
      keys: "कुंजियाँ: Tab से संपर्क · Enter चुनें · Delete हटाएँ · Ctrl+Z / Ctrl+Y · Space पुश बटन दबाए रखता है",
      scenes: { motor: "मोटर और पंखा", traffic: "ट्रैफ़िक चौराहा", tank: "पानी की टंकी", conveyor: "कन्वेयर और फ़ोटो-आई", flasher: "चेतावनी बीकन", stardelta: "स्टार–डेल्टा स्टार्टर", panel: "लैंप पैनल" } },
  };
  Object.assign(TX.en, { toolbox: "Instructions — click to insert after the selected item", contacts: "Contacts", outsLbl: "Outputs, timers, counters",
    quickTags: "Quick pick", unit: "Unit", machineCfg: "⚙ Machine settings", scanT: "Scan time", plusC: "Add a contact at the end of this rung", plusO: "Add an output to this rung",
    tip: ["Pick an example on the left, press the input buttons and watch the machine.", "Click any contact or output, then change it on the right — or click an instruction to insert one.", "Use + at the end of a rung to add contacts and outputs."], gotIt: "Got it" });
  Object.assign(TX.hi, { toolbox: "निर्देश — चुने गए के बाद जोड़ने के लिए क्लिक करें", contacts: "संपर्क", outsLbl: "आउटपुट, टाइमर, काउंटर",
    quickTags: "जल्दी चुनें", unit: "इकाई", machineCfg: "⚙ मशीन सेटिंग्स", scanT: "स्कैन समय", plusC: "इस रंग के अंत में संपर्क जोड़ें", plusO: "इस रंग में आउटपुट जोड़ें",
    tip: ["बाईं ओर से उदाहरण चुनें, इनपुट बटन दबाएँ और मशीन देखें।", "किसी संपर्क या आउटपुट पर क्लिक करें, फिर दाईं ओर बदलें — या कोई निर्देश क्लिक करके जोड़ें।", "रंग के अंत में + से संपर्क और आउटपुट जोड़ें।"], gotIt: "समझ गया" });
  const S = { lang: "en", prog: null, plc: null, running: true, sel: null, undo: [], redo: [], snap: "", scene: "motor", sceneState: {}, exId: null, colors: null, last: 0, acc: 0, lastUi: 0 };
  const t = (k) => TX[S.lang][k];
  const tr = (o) => (o == null ? "" : typeof o === "string" ? o : o[S.lang] || o.en);
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") el.className = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? "" : v);
    });
    kids.flat(Infinity).forEach((c) => c != null && c !== false && el.append(c.nodeType ? c : document.createTextNode(String(c))));
    return el;
  }
  const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const say = (m) => { $("say").textContent = ""; setTimeout(() => { $("say").textContent = m; }, 30); };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const nameOf = (tag) => { const base = String(tag || "").split(".")[0]; return (S.prog.names || {})[base] || ""; };

  // ------------------------------------------------------------------ program state, undo
  function rebuild(keepState) {
    const old = S.plc;
    S.plc = E.create(S.prog);
    if (keepState && old) ["I", "Q", "M"].forEach((a) => { for (let k = 0; k < E.AREAS[a]; k++) S.plc.set(a + k, old.get(a + k)); });
  }
  function commit() {
    const now = JSON.stringify(S.prog);
    if (now !== S.snap) { S.undo.push(S.snap); if (S.undo.length > 100) S.undo.shift(); S.redo = []; S.snap = now; }
    try { localStorage.setItem(STORE, now); } catch (_) { /* private mode */ }
    rebuild(true); renderAll();
  }
  function restore(json) { S.prog = JSON.parse(json); S.snap = json; S.sel = null; rebuild(true); renderAll(); }
  function undo() { if (!S.undo.length) return; S.redo.push(S.snap); restore(S.undo.pop()); }
  function redo() { if (!S.redo.length) return; S.undo.push(S.snap); restore(S.redo.pop()); }
  function normalise(p) {
    p.names = p.names || {}; p.inputs = p.inputs || {}; p.timers = p.timers || []; p.counters = p.counters || []; p.rungs = Array.isArray(p.rungs) ? p.rungs : [];
    for (let k = 0; k < 8; k++) { p.timers[k] = p.timers[k] || { preset: 1000 }; p.counters[k] = p.counters[k] || { preset: 5 }; }
    p.rungs.forEach((r) => { r.cond = r.cond || []; r.outs = r.outs || []; });
    return p;
  }
  function load(prog, exId) {
    if (S.snap) { S.undo.push(S.snap); S.redo = []; }
    S.prog = normalise(clone(prog)); S.exId = exId || null; S.sel = null;
    const ex = EXAMPLES.find((e) => e.id === exId);
    S.scene = ex ? ex.scene : (S.prog.scene || "panel");
    S.prog.scene = S.scene; S.sceneState = {};
    S.snap = JSON.stringify(S.prog);
    try { localStorage.setItem(STORE, S.snap); } catch (_) { /* private mode */ }
    rebuild(false); renderAll();
  }

  // ------------------------------------------------------------------ tree editing helpers
  function seriesAt(rung, path) {   // the series list that holds the item at path, and its index
    let list = rung.cond;
    for (let k = 0; k < path.length - 1; k += 2) list = list[path[k]].b[path[k + 1]];
    return { list: list, i: path[path.length - 1] };
  }
  function parentOr(rung, path) {
    if (path.length < 3) return null;
    let list = rung.cond;
    for (let k = 0; k < path.length - 3; k += 2) list = list[path[k]].b[path[k + 1]];
    return { or: list[path[path.length - 3]], list: list, i: path[path.length - 3], branch: path[path.length - 2] };
  }
  function cleanup(series) {   // drop empty branches, unwrap single-branch ORs
    for (let i = series.length - 1; i >= 0; i--) {
      const it = series[i];
      if (!E.isOr(it)) continue;
      it.b.forEach(cleanup);
      it.b = it.b.filter((s) => s.length);
      if (!it.b.length) series.splice(i, 1);
      else if (it.b.length === 1) series.splice(i, 1, ...it.b[0]);
    }
  }
  const newContact = () => ({ t: "NO", tag: "I0" });
  // insert any instruction from the toolbox: after the selected contact, or at the end of the selected / last rung
  function freeIndex(kind) {
    const used = new Set();
    S.prog.rungs.forEach((r) => r.outs.forEach((o) => { if ((kind === "T" && /^T/.test(o.t)) || (kind === "C" && /^CT/.test(o.t))) used.add(o.n); }));
    for (let k = 0; k < 8; k++) if (!used.has(k)) return k;
    return 0;
  }
  function insertInstr(type) {
    if (!S.prog.rungs.length) S.prog.rungs.push({ note: "", cond: [], outs: [] });
    const r = S.sel ? Math.min(S.sel.r, S.prog.rungs.length - 1) : S.prog.rungs.length - 1, rung = S.prog.rungs[r];
    if (/^(NO|NC|P|N|CMP)$/.test(type)) {
      const c = type === "CMP" ? { t: "CMP", op: ">=", a: "C0.ACC", b: 3 } : { t: type, tag: "I0" };
      if (S.sel && S.sel.kind === "c" && S.sel.r === r) { const at = seriesAt(rung, S.sel.path); at.list.splice(at.i + 1, 0, c); S.sel = { r: r, kind: "c", path: S.sel.path.slice(0, -1).concat(at.i + 1) }; }
      else { rung.cond.push(c); S.sel = { r: r, kind: "c", path: [rung.cond.length - 1] }; }
    } else {
      const o = /^(OUT|SET|RST)$/.test(type) ? { t: type, tag: "Q" + Math.min(7, rung.outs.length) } : type === "RES" ? { t: "RES", tag: "C0" } : { t: type, n: freeIndex(type[0] === "C" ? "C" : "T") };
      rung.outs.push(o); S.sel = { r: r, kind: "o", k: rung.outs.length - 1 };
    }
    commit();
    const el = S.sel.kind === "c" ? document.querySelector(`#ladder .contact[data-r="${S.sel.r}"][data-p="${S.sel.path.join(".")}"]`) : document.querySelector(`#ladder .out[data-r="${S.sel.r}"][data-o="${S.sel.k}"]`);
    if (el) el.focus();
    say(type);
  }
  const TOOL = [["NO", "┤ ├"], ["NC", "┤/├"], ["P", "┤P├"], ["N", "┤N├"], ["CMP", "[≥]"]];
  const TOOL_OUT = [["OUT", "( )"], ["SET", "(S)"], ["RST", "(R)"], ["TON", "TON"], ["TOF", "TOF"], ["TP", "TP"], ["CTU", "CTU"], ["CTD", "CTD"], ["RES", "RES"]];
  function renderToolbox() {
    const btn = ([k, sym], names) => h("button", { type: "button", class: "tool", title: names[k], "aria-label": names[k], onclick: () => insertInstr(k) }, h("span", { class: "tsym" }, sym), sym === k ? null : h("span", { class: "tname" }, k));
    fill($("toolbox"), h("div", { class: "lbl" }, t("toolbox")),
      h("div", { class: "toolrow", role: "group", "aria-label": t("contacts") }, TOOL.map((x) => btn(x, TX[S.lang].contactTypes))),
      h("div", { class: "toolrow", role: "group", "aria-label": t("outsLbl") }, TOOL_OUT.map((x) => btn(x, TX[S.lang].outTypes))));
  }
  function renderCfg() {
    const items = CFG[S.scene] || [];
    const box = $("sceneCfg");
    box.hidden = !items.length;
    if (!items.length) return;
    const cur = cfg();
    fill(box, h("summary", {}, t("machineCfg")), h("div", { class: "cfggrid" },
      items.map(([k, lab, unit, min, max, step]) => {
        const id = "cfg-" + k, out = h("output", { for: id }, String(cur[k]) + (unit ? " " + unit : ""));
        const r = h("input", { type: "range", id: id, min: min, max: max, step: step, oninput: (e) => {
          S.prog.cfg = S.prog.cfg || {}; S.prog.cfg[S.scene] = Object.assign({}, S.prog.cfg[S.scene], { [k]: +e.target.value });
          out.textContent = e.target.value + (unit ? " " + unit : ""); if (k === "cars") S.sceneState = {};
        }, onchange: () => { try { localStorage.setItem(STORE, JSON.stringify(S.prog)); } catch (_) { /* private */ } } });
        r.value = String(cur[k]);
        return h("label", { for: id, class: "cfgrow" }, h("span", {}, tr(lab)), r, out);
      })));
  }
  function renderTip() {
    let seen = false; try { seen = localStorage.getItem("quantix-plc-tip") === "1"; } catch (_) { /* private */ }
    $("tip").hidden = seen;
    if (!seen) fill($("tip"), h("ol", {}, t("tip").map((x) => h("li", {}, x))), h("button", { type: "button", class: "btn small", onclick: () => { $("tip").hidden = true; try { localStorage.setItem("quantix-plc-tip", "1"); } catch (_) { /* private */ } } }, t("gotIt")));
  }
  function addRung() {
    const r = S.sel ? S.sel.r + 1 : S.prog.rungs.length;
    S.prog.rungs.splice(r, 0, { note: "", cond: [newContact()], outs: [{ t: "OUT", tag: "Q0" }] });
    S.sel = { r: r, kind: "c", path: [0] }; commit();
  }
  function addContact() {
    if (!S.prog.rungs.length) return addRung();
    const r = S.sel ? S.sel.r : S.prog.rungs.length - 1, rung = S.prog.rungs[r];
    if (S.sel && S.sel.kind === "c") { const at = seriesAt(rung, S.sel.path); at.list.splice(at.i + 1, 0, newContact()); S.sel = { r: r, kind: "c", path: S.sel.path.slice(0, -1).concat(at.i + 1) }; }
    else { rung.cond.push(newContact()); S.sel = { r: r, kind: "c", path: [rung.cond.length - 1] }; }
    commit();
  }
  function addBranch() {
    if (!S.sel || S.sel.kind !== "c") { addContact(); return; }
    const rung = S.prog.rungs[S.sel.r], at = seriesAt(rung, S.sel.path), par = parentOr(rung, S.sel.path);
    if (par && at.list.length === 1) {   // already a branch of an OR on its own: add another branch to that OR
      par.or.b.push([newContact()]);
      S.sel = { r: S.sel.r, kind: "c", path: S.sel.path.slice(0, -2).concat(par.or.b.length - 1, 0) };
    } else {
      const item = at.list[at.i];
      at.list[at.i] = { t: "OR", b: [[item], [newContact()]] };
      S.sel = { r: S.sel.r, kind: "c", path: S.sel.path.concat(1, 0) };
    }
    commit();
  }
  function addOutput() {
    if (!S.prog.rungs.length) return addRung();
    const r = S.sel ? S.sel.r : S.prog.rungs.length - 1, rung = S.prog.rungs[r];
    rung.outs.push({ t: "OUT", tag: "Q" + Math.min(7, rung.outs.length + 1) });
    S.sel = { r: r, kind: "o", k: rung.outs.length - 1 }; commit();
  }
  function del() {
    if (!S.sel) return;
    const rung = S.prog.rungs[S.sel.r];
    if (S.sel.kind === "rung") S.prog.rungs.splice(S.sel.r, 1);
    else if (S.sel.kind === "o") rung.outs.splice(S.sel.k, 1);
    else { const at = seriesAt(rung, S.sel.path); at.list.splice(at.i, 1); cleanup(rung.cond); }
    S.sel = null; commit();
  }
  function moveRung(d) {
    if (!S.sel) return;
    const r = S.sel.r, to = r + d;
    if (to < 0 || to >= S.prog.rungs.length) return;
    const x = S.prog.rungs.splice(r, 1)[0]; S.prog.rungs.splice(to, 0, x); S.sel = { r: to, kind: "rung" }; commit();
  }
  function selected() {
    if (!S.sel) return null;
    const rung = S.prog.rungs[S.sel.r];
    if (!rung) return null;
    if (S.sel.kind === "o") return rung.outs[S.sel.k];
    if (S.sel.kind === "c") { const at = seriesAt(rung, S.sel.path); return at.list[at.i]; }
    return rung;
  }

  // ------------------------------------------------------------------ ladder rendering
  const SYM = { NO: "┤ ├", NC: "┤/├", P: "┤P├", N: "┤N├" };
  function tagLabel(tag) { const n = nameOf(tag); return n ? n.replace(/_/g, " ") : ""; }
  function contactEl(it, r, path) {
    const key = path.join("."), sel = S.sel && S.sel.r === r && S.sel.kind === "c" && S.sel.path.join(".") === key;
    const body = it.t === "CMP" ? h("span", { class: "cmp" }, String(it.a) + " " + ({ "==": "=", "!=": "≠", ">=": "≥", "<=": "≤" }[it.op] || it.op) + " " + String(it.b))
      : h("span", { class: "sym" }, SYM[it.t] || "┤ ├");
    return h("button", { type: "button", class: "el contact" + (sel ? " sel" : ""), "data-r": r, "data-p": key,
      "aria-label": (TX[S.lang].contactTypes[it.t] || it.t) + " " + (it.t === "CMP" ? it.a + " " + it.op + " " + it.b : it.tag + " " + tagLabel(it.tag)),
      onclick: () => { S.sel = { r: r, kind: "c", path: path }; renderAll(); } },
      h("span", { class: "nm" }, it.t === "CMP" ? "CMP" : tagLabel(it.tag) || " "), body, h("span", { class: "ad" }, it.t === "CMP" ? "" : it.tag));
  }
  function seriesEl(list, r, path) {
    return h("div", { class: "series" }, list.map((it, k) => {
      const p = path.concat(k);
      if (E.isOr(it)) return h("div", { class: "or", "data-r": r, "data-p": p.join(".") }, it.b.map((s, j) => h("div", { class: "branch" }, seriesEl(s, r, p.concat(j)), h("span", { class: "fillw" }))));
      return [h("span", { class: "w", "data-r": r, "data-w": p.join(".") }), contactEl(it, r, p)];
    }), h("span", { class: "w" }));
  }
  function outEl(o, r, k) {
    const sel = S.sel && S.sel.r === r && S.sel.kind === "o" && S.sel.k === k;
    let inner;
    if (/^(OUT|SET|RST)$/.test(o.t)) inner = [h("span", { class: "nm" }, tagLabel(o.tag) || " "), h("span", { class: "sym" }, { OUT: "( )", SET: "(S)", RST: "(R)" }[o.t]), h("span", { class: "ad" }, o.tag)];
    else if (/^T(ON|OF|P)$/.test(o.t)) inner = [h("span", { class: "fb" }, o.t + " T" + o.n), h("span", { class: "bar", "data-tm": o.n }, h("i")), h("span", { class: "ad", "data-tmt": o.n }, "")];
    else if (/^CT[UD]$/.test(o.t)) inner = [h("span", { class: "fb" }, o.t + " C" + o.n), h("span", { class: "ad", "data-ct": o.n }, "")];
    else inner = [h("span", { class: "fb" }, "RES"), h("span", { class: "ad" }, o.tag)];
    return h("button", { type: "button", class: "el out" + (sel ? " sel" : "") + (/^(OUT|SET|RST)$/.test(o.t) ? "" : " box"), "data-r": r, "data-o": k,
      "aria-label": (TX[S.lang].outTypes[o.t] || o.t) + " " + (o.tag || (o.t[0] === "C" ? "C" + o.n : "T" + o.n)),
      onclick: () => { S.sel = { r: r, kind: "o", k: k }; renderAll(); } }, inner);
  }
  function renderLadder() {
    const rungs = S.prog.rungs.map((rung, r) => h("div", { class: "rung" + (S.sel && S.sel.r === r && S.sel.kind === "rung" ? " sel" : ""), "data-r": r },
      h("button", { type: "button", class: "rnum", "aria-label": "Rung " + r, onclick: () => { S.sel = { r: r, kind: "rung" }; renderAll(); } }, String(r)),
      h("div", { class: "rungbody" },
        rung.note ? h("div", { class: "note" }, "// " + rung.note) : null,
        h("div", { class: "line" }, h("span", { class: "rail l" }), seriesEl(rung.cond, r, []),
          h("button", { type: "button", class: "plus", title: t("plusC"), "aria-label": t("plusC") + " " + r, onclick: () => { S.sel = { r: r, kind: "rung" }; insertInstr("NO"); } }, "+"),
          h("span", { class: "w grow", "data-end": r }),
          h("div", { class: "outs" }, rung.outs.map((o, k) => outEl(o, r, k)),
            h("button", { type: "button", class: "plus small", title: t("plusO"), "aria-label": t("plusO") + " " + r, onclick: () => { S.sel = { r: r, kind: "rung" }; insertInstr("OUT"); } }, "+")),
          h("span", { class: "rail r" })))));
    fill($("ladder"), rungs.length ? rungs : h("p", { class: "muted" }, t("empty")));
  }
  // power arriving at the item at path p: after the previous item, or (first item of a branch) into the OR itself
  function powerIn(pw, p) {
    const k = p[p.length - 1];
    if (k > 0) return !!pw[p.slice(0, -1).concat(k - 1).join(".")];
    if (p.length === 1) return true;
    return powerIn(pw, p.slice(0, -2));
  }
  // live colours: only class toggles, no rebuild (keeps keyboard focus)
  function paintLadder() {
    const plc = S.plc, act = S.running;
    document.querySelectorAll("#ladder .contact").forEach((b) => {
      const pw = plc.power(+b.dataset.r), key = b.dataset.p;
      b.classList.toggle("closed", act && !!pw[key + ":c"]); b.classList.toggle("on", act && !!pw[key]);
    });
    document.querySelectorAll("#ladder .w[data-w]").forEach((w) => {   // wire before an item is powered if the previous point is
      const r = +w.dataset.r, p = w.dataset.w.split("."), last = +p[p.length - 1], pw = plc.power(r);
      const into = powerIn(pw, p.map(Number));
      w.classList.toggle("on", act && into);
    });
    document.querySelectorAll("#ladder .or").forEach((o) => { o.classList.toggle("on", act && !!plc.power(+o.dataset.r)[o.dataset.p]); });
    document.querySelectorAll("#ladder [data-end]").forEach((w) => w.classList.toggle("on", act && !!plc.power(+w.dataset.end).end));
    document.querySelectorAll("#ladder .out").forEach((b) => b.classList.toggle("on", act && !!plc.power(+b.dataset.r)["o" + b.dataset.o]));
    document.querySelectorAll("#ladder [data-tm]").forEach((el) => {
      const n = +el.dataset.tm, tm = plc.timer(n), pre = S.prog.timers[n].preset;
      el.firstChild.style.width = Math.min(100, 100 * tm.acc / pre) + "%";
    });
    document.querySelectorAll("#ladder [data-tmt]").forEach((el) => { const n = +el.dataset.tmt, tm = plc.timer(n); el.textContent = (tm.acc / 1000).toFixed(1) + " / " + (S.prog.timers[n].preset / 1000).toFixed(1) + " s" + (tm.dn ? " ✓" : ""); });
    document.querySelectorAll("#ladder [data-ct]").forEach((el) => { const n = +el.dataset.ct, c = plc.counter(n); el.textContent = c.acc + " / " + S.prog.counters[n].preset + (c.dn ? " ✓" : ""); });
  }

  // ------------------------------------------------------------------ I/O panel
  const usedTags = () => {
    const used = new Set();
    S.prog.rungs.forEach((r) => { E.walk(r.cond, (c) => { if (c.tag) used.add(String(c.tag).split(".")[0]); }); r.outs.forEach((o) => { if (o.tag) used.add(o.tag); }); });
    Object.keys(S.prog.names).forEach((k) => used.add(k));
    return used;
  };
  function renderIO() {
    const used = usedTags(), ins = [], outs = [];
    for (let k = 0; k < 8; k++) {
      const tag = "I" + k;
      if (!used.has(tag)) continue;
      const kind = S.prog.inputs[tag] || "switch", name = (S.prog.names[tag] || tag).replace(/_/g, " ");
      const b = h("button", { type: "button", class: "inbtn " + kind, "data-in": tag, "aria-pressed": "false", disabled: kind === "sensor" ? true : null,
        title: kind === "sensor" ? t("sensor") : kind === "button" ? t("button") : t("switch") }, h("b", {}, tag), " " + name);
      if (kind === "button") {
        const down = (e) => { e.preventDefault(); S.plc.set(tag, true); }, up = () => S.plc.set(tag, false);
        b.addEventListener("pointerdown", down); b.addEventListener("pointerup", up); b.addEventListener("pointerleave", up);
        b.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); S.plc.set(tag, true); } });
        b.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") S.plc.set(tag, false); });
      } else if (kind === "switch") b.addEventListener("click", () => { S.plc.set(tag, !S.plc.get(tag)); say(tag + " " + (S.plc.get(tag) ? "ON" : "OFF")); });
      ins.push(b);
    }
    for (let k = 0; k < 8; k++) {
      const tag = "Q" + k;
      if (!used.has(tag)) continue;
      outs.push(h("span", { class: "lamp", "data-out": tag }, h("i", { "aria-hidden": "true" }), h("b", {}, tag), " " + (S.prog.names[tag] || "").replace(/_/g, " ")));
    }
    fill($("inputs"), ins); fill($("outputs"), outs);
  }
  function paintIO() {
    document.querySelectorAll("[data-in]").forEach((b) => { const on = S.plc.get(b.dataset.in); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    document.querySelectorAll("[data-out]").forEach((l) => l.classList.toggle("on", S.running && S.plc.get(l.dataset.out)));
  }

  // ------------------------------------------------------------------ properties panel
  const ALL_BITS = () => {
    const out = [];
    ["I", "Q", "M"].forEach((a) => { for (let k = 0; k < E.AREAS[a]; k++) out.push(a + k); });
    for (let k = 0; k < 8; k++) out.push("T" + k, "T" + k + ".TT");
    for (let k = 0; k < 8; k++) out.push("C" + k);
    return out;
  };
  function sel(id, options, value, onchange, label) {
    const s = h("select", { id: id, onchange: (e) => onchange(e.target.value) }, options.map(([v, lab]) => { const o = h("option", { value: v }, lab); if (String(v) === String(value)) o.selected = true; return o; }));
    return h("div", { class: "param" }, h("label", { for: id }, label), s);
  }
  function txt(id, value, onchange, label, mode) {
    return h("div", { class: "param" }, h("label", { for: id }, label), h("input", { id: id, type: "text", inputmode: mode || "text", value: String(value), onchange: (e) => onchange(e.target.value) }));
  }
  // named / used addresses as one-click chips
  function tagChips(onpick, current, filter) {
    const used = [...usedTags()].filter((g) => /^[IQM]\d+$/.test(g) && filter.test(g)).sort((a, b) => "IQM".indexOf(a[0]) - "IQM".indexOf(b[0]) || +a.slice(1) - +b.slice(1));
    if (!used.length) return null;
    return h("div", { class: "param" }, h("span", { class: "sublbl" }, t("quickTags")), h("div", { class: "chips" }, used.map((g) => h("button", { type: "button", class: "chip" + (g === current ? " on" : ""),
      onclick: () => onpick(g) }, g + (nameOf(g) ? " · " + nameOf(g).replace(/_/g, " ") : "")))));
  }
  function renderProps() {
    const box = $("props"), it = selected();
    if (!it) { fill(box, h("p", { class: "muted" }, t("selectHint"))); return; }
    const tagOpts = ALL_BITS().map((g) => [g, g + (nameOf(g) && !g.includes(".") ? " · " + nameOf(g).replace(/_/g, " ") : g.endsWith(".TT") ? " · timing" : "")]);
    if (S.sel.kind === "rung") {
      fill(box, h("h3", {}, "Rung " + S.sel.r), txt("pr-note", it.note || "", (v) => { it.note = v.slice(0, 80); commit(); }, t("rungNote")),
        h("div", { class: "row" }, h("button", { class: "btn small", type: "button", onclick: () => moveRung(-1) }, t("up")), h("button", { class: "btn small", type: "button", onclick: () => moveRung(1) }, t("down")),
          h("button", { class: "btn small danger", type: "button", onclick: del }, t("del"))));
      return;
    }
    if (S.sel.kind === "c") {
      const parts = [h("h3", {}, TX[S.lang].contactTypes[it.t] || it.t),
        sel("pr-type", Object.entries(TX[S.lang].contactTypes), it.t, (v) => { it.t = v; if (v === "CMP") { delete it.tag; it.op = ">="; it.a = "C0.ACC"; it.b = 3; } else if (!it.tag) { it.tag = "I0"; delete it.op; delete it.a; delete it.b; } commit(); }, t("type"))];
      if (it.t === "CMP") {
        const num = (v) => (isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : v.trim().toUpperCase());
        parts.push(txt("pr-a", it.a, (v) => { it.a = num(v); commit(); }, t("a") + " (T0.ACC ms, C0.ACC, 123)"),
          sel("pr-op", [[">", ">"], [">=", "≥"], ["<", "<"], ["<=", "≤"], ["==", "="], ["!=", "≠"]], it.op, (v) => { it.op = v; commit(); }, t("op")),
          txt("pr-b", it.b, (v) => { it.b = num(v); commit(); }, t("b")));
      } else {
        parts.push(sel("pr-tag", tagOpts, it.tag, (v) => { it.tag = v; commit(); }, t("tag")));
        parts.push(tagChips((g) => { it.tag = g; commit(); }, it.tag, /./));
      }
      parts.push(h("div", { class: "row" }, h("button", { class: "btn small", type: "button", onclick: addContact }, t("addContact")),
        h("button", { class: "btn small", type: "button", onclick: addBranch }, t("addBranch")), h("button", { class: "btn small danger", type: "button", onclick: del }, t("del"))));
      fill(box, parts); return;
    }
    const parts = [h("h3", {}, TX[S.lang].outTypes[it.t] || it.t),
      sel("pr-otype", Object.entries(TX[S.lang].outTypes), it.t, (v) => {
        it.t = v; delete it.n; delete it.tag;
        if (/^(OUT|SET|RST)$/.test(v)) it.tag = "Q0"; else if (v === "RES") it.tag = "C0"; else it.n = 0;
        commit();
      }, t("type"))];
    if (/^(OUT|SET|RST)$/.test(it.t)) { parts.push(sel("pr-otag", tagOpts.filter(([g]) => /^[QM]\d+$/.test(g)), it.tag, (v) => { it.tag = v; commit(); }, t("tag"))); parts.push(tagChips((g) => { it.tag = g; commit(); }, it.tag, /^[QM]/)); }
    else if (it.t === "RES") parts.push(sel("pr-res", [...Array(8).keys()].flatMap((k) => [["T" + k, "T" + k], ["C" + k, "C" + k]]), it.tag, (v) => { it.tag = v; commit(); }, t("tag")));
    else if (/^T/.test(it.t)) {
      parts.push(sel("pr-n", [...Array(8).keys()].map((k) => [k, "T" + k]), it.n, (v) => { it.n = +v; commit(); }, t("t")));
      const tm = S.prog.timers[it.n], unitNow = S.unit || "s", f = { ms: 1, s: 1000, min: 60000 }[unitNow];
      parts.push(h("div", { class: "param" }, h("label", { for: "pr-pre" }, t("preset")), h("span", { class: "numrow" },
        h("input", { id: "pr-pre", type: "text", inputmode: "decimal", value: String(Number((tm.preset / f).toPrecision(6))),
          onchange: (e) => { const x = Number(e.target.value); if (x > 0 && x * f <= 864e5) { tm.preset = Math.round(x * f); commit(); } } }),
        h("select", { "aria-label": t("unit"), onchange: (e) => { S.unit = e.target.value; renderProps(); } }, ["ms", "s", "min"].map((u) => { const o = h("option", { value: u }, u); if (u === unitNow) o.selected = true; return o; }))),
        h("div", { class: "chips" }, [100, 250, 500, 1000, 2000, 3000, 5000, 10000, 30000, 60000].map((ms) => h("button", { type: "button", class: "chip" + (tm.preset === ms ? " on" : ""),
          onclick: () => { tm.preset = ms; commit(); } }, ms < 1000 ? ms + " ms" : ms < 60000 ? ms / 1000 + " s" : ms / 60000 + " min")))));
    } else {
      parts.push(sel("pr-n", [...Array(8).keys()].map((k) => [k, "C" + k]), it.n, (v) => { it.n = +v; commit(); }, t("c")));
      parts.push(txt("pr-pre", S.prog.counters[it.n].preset, (v) => { const x = Math.round(Number(v)); if (x >= 0 && x <= 1e6) { S.prog.counters[it.n].preset = x; commit(); } }, t("presetN"), "numeric"));
      parts.push(h("div", { class: "chips" }, [1, 3, 5, 10, 12, 20, 50, 100].map((n) => h("button", { type: "button", class: "chip" + (S.prog.counters[it.n].preset === n ? " on" : ""), onclick: () => { S.prog.counters[it.n].preset = n; commit(); } }, String(n)))));
    }
    parts.push(h("div", { class: "row" }, h("button", { class: "btn small", type: "button", onclick: addOutput }, t("addOut")), h("button", { class: "btn small danger", type: "button", onclick: del }, t("del"))));
    fill(box, parts);
  }
  function renderTC() {
    const rows = [];
    const usedT = new Set(), usedC = new Set();
    S.prog.rungs.forEach((r) => { r.outs.forEach((o) => { if (/^T/.test(o.t)) usedT.add(o.n); if (/^CT/.test(o.t)) usedC.add(o.n); }); E.walk(r.cond, (c) => { const m = /^([TC])(\d+)/.exec(c.tag || c.a || ""); if (m) (m[1] === "T" ? usedT : usedC).add(+m[2]); }); });
    [...usedT].sort().forEach((n) => { const tm = S.plc.timer(n); rows.push(h("tr", {}, h("td", {}, "T" + n), h("td", { class: "mono" }, (tm.acc / 1000).toFixed(2) + " s"), h("td", { class: "mono" }, (S.prog.timers[n].preset / 1000).toFixed(2) + " s"), h("td", {}, tm.dn ? "✓" : tm.tt ? "…" : ""))); });
    [...usedC].sort().forEach((n) => { const c = S.plc.counter(n); rows.push(h("tr", {}, h("td", {}, "C" + n), h("td", { class: "mono" }, String(c.acc)), h("td", { class: "mono" }, String(S.prog.counters[n].preset)), h("td", {}, c.dn ? "✓" : ""))); });
    fill($("tc"), h("thead", {}, h("tr", {}, ["", t("acc"), t("pre"), t("dn")].map((x) => h("th", { scope: "col" }, x)))), h("tbody", {}, rows));
  }
  function renderTags() {
    const rows = [];
    ["I", "Q", "M"].forEach((a) => {
      for (let k = 0; k < 8; k++) {
        const tag = a + k;
        const name = h("input", { type: "text", value: (S.prog.names[tag] || "").replace(/_/g, " "), "aria-label": tag + " " + t("name"), maxlength: "20",
          onchange: (e) => { const v = e.target.value.trim().replace(/[^\p{L}\p{N} _-]/gu, "").replace(/\s+/g, "_"); if (v) S.prog.names[tag] = v; else delete S.prog.names[tag]; commit(); } });
        const kind = a === "I" ? h("select", { "aria-label": tag + " " + t("kind"), onchange: (e) => { S.prog.inputs[tag] = e.target.value; commit(); } },
          [["button", t("button")], ["switch", t("switch")], ["sensor", t("sensor")]].map(([v, l]) => { const o = h("option", { value: v }, l); if ((S.prog.inputs[tag] || "switch") === v) o.selected = true; return o; })) : null;
        rows.push(h("tr", {}, h("th", { scope: "row" }, tag), h("td", {}, name), h("td", {}, kind)));
      }
    });
    fill($("tags"), h("tbody", {}, rows));
  }
  function renderST() { $("st").textContent = E.stOf(S.prog, S.prog.names); }
  function renderAll() {
    renderLadder(); renderIO(); renderProps(); renderTC(); renderST(); renderToolbox(); renderCfg();
    $("scanSel").value = String(scanMs());
    const active = document.activeElement;
    if (!$("tagsBox").contains(active)) renderTags();
    fill($("sceneSel"), Object.entries(t("scenes")).map(([v, l]) => { const o = h("option", { value: v }, l); if (v === S.scene) o.selected = true; return o; }));
    const ex = EXAMPLES.find((e) => e.id === S.exId);
    $("exNote").hidden = !ex; if (ex) fill($("exNote"), h("b", {}, tr(ex.title) + ": "), tr(ex.blurb));
    document.querySelectorAll("#exList button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ex === S.exId)));
    paintLadder(); paintIO();
    // keep focus on the selected element after a rebuild
    if (S.sel && S.sel.kind !== "rung" && document.activeElement === document.body) {
      const q = S.sel.kind === "c" ? `#ladder .contact[data-r="${S.sel.r}"][data-p="${S.sel.path.join(".")}"]` : `#ladder .out[data-r="${S.sel.r}"][data-o="${S.sel.k}"]`;
      const el = document.querySelector(q); if (el) el.focus({ preventScroll: true });
    }
  }
  function renderText() {
    document.documentElement.lang = S.lang; document.title = t("title") + " · Quantix"; $("tTitle").textContent = t("title");
    [["exLbl", "examples"], ["ladderLbl", "ladder"], ["ioLbl", "io"], ["inLbl", "inputs"], ["outLbl", "outputs"], ["propsLbl", "props"], ["tcLbl", "tc"], ["stLbl", "st"], ["tagsLbl", "tags"],
      ["sceneLbl", "machine"], ["addRung", "addRung"], ["addContact", "addContact"], ["addBranch", "addBranch"], ["addOut", "addOut"], ["delBtn", "del"], ["newBtn", "newProg"],
      ["copyBtn", "copy"], ["saveBtn", "save"], ["openBtn", "open"], ["shareBtn", "share"], ["keys", "keys"]].forEach(([id, k]) => { $(id).textContent = t(k); });
    $("undoBtn").textContent = t("undo"); $("redoBtn").textContent = t("redo");
    fill($("exList"), EXAMPLES.map((ex) => h("button", { type: "button", class: "exbtn", "data-ex": ex.id, onclick: () => { load(ex.program(), ex.id); say(tr(ex.title)); } }, tr(ex.title))));
    document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === S.lang)));
    renderRun(); renderAll(); renderTip();
    $("scanLbl").textContent = t("scanT");
  }
  function renderRun() { $("runBtn").textContent = S.running ? t("stop") : t("run"); $("mode").textContent = S.running ? t("running") : t("stopped"); $("mode").classList.toggle("on", S.running); }

  // ------------------------------------------------------------------ machines (2D animated scenes). Each reads outputs and may drive sensor inputs.
  const SC = {
    motor(g, W, H, st, plc, dt) {
      st.speed = st.speed || 0; st.ang = st.ang || 0;
      st.speed += ((plc.get("Q0") && S.running ? 1 : 0) - st.speed) * Math.min(1, dt * (plc.get("Q0") ? 0.9 : 0.5));
      st.ang += st.speed * dt * 14;
      panel(g, 20, 20, 180, H - 40, [["START", "#22c55e", plc.get("I0")], ["STOP", "#ef4444", plc.get("I1")], ["O/L TRIP", "#f59e0b", plc.get("I2")]],
        [["STOPPED", "#ef4444", S.running && plc.get("Q1")], ["RUNNING", "#22c55e", S.running && plc.get("Q2")]]);
      const cx = W * 0.62, cy = H * 0.55;
      g.fillStyle = "#4b5563"; g.fillRect(cx - 130, cy + 55, 200, 16);
      const body = g.createLinearGradient(0, cy - 55, 0, cy + 55); body.addColorStop(0, "#94a3b8"); body.addColorStop(0.5, "#e2e8f0"); body.addColorStop(1, "#64748b");
      g.fillStyle = body; rr(g, cx - 120, cy - 55, 170, 110, 18); g.fill();
      g.strokeStyle = "rgba(0,0,0,.25)"; for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(cx - 105 + k * 22, cy - 55); g.lineTo(cx - 105 + k * 22, cy + 55); g.stroke(); }
      g.fillStyle = "#1f2937"; g.fillRect(cx + 50, cy - 6, 50, 12);
      g.save(); g.translate(cx + 112, cy);
      for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.save(); g.rotate(st.ang); g.fillStyle = "rgba(56,189,248,.85)"; g.beginPath(); g.ellipse(0, -36, 13, 34, 0.3, 0, Math.PI * 2); g.fill(); g.restore(); }
      g.fillStyle = "#0f172a"; g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fill(); g.restore();
      label(g, "M  " + Math.round(st.speed * cfg().rpm) + " rpm", cx - 35, cy + 95);
    },
    traffic(g, W, H, st, plc, dt) {
      const n = Math.round(cfg().cars);
      if (!st.cars || st.cars.length !== n) st.cars = Array.from({ length: n }, (_, k) => ({ x: -60 - k * 200 }));
      const roadY = H * 0.62, stopX = W * 0.55;
      g.fillStyle = "#334155"; g.fillRect(0, roadY - 40, W, 80); g.fillRect(stopX + 30, 0, 80, H);
      g.strokeStyle = "#f8fafc"; g.setLineDash([22, 18]); g.lineWidth = 3; g.beginPath(); g.moveTo(0, roadY); g.lineTo(W, roadY); g.stroke(); g.setLineDash([]);
      g.fillStyle = "#f8fafc"; g.fillRect(stopX + 20, roadY - 40, 6, 80);
      const red = S.running && plc.get("Q0"), yel = S.running && plc.get("Q1"), grn = S.running && plc.get("Q2");
      // lamp head
      const lx = stopX - 20, ly = roadY - 165;
      g.fillStyle = "#475569"; g.fillRect(lx + 20, ly + 140, 8, 70);
      g.fillStyle = "#111827"; rr(g, lx, ly, 48, 140, 10); g.fill();
      [[red, "#ef4444"], [yel, "#facc15"], [grn, "#22c55e"]].forEach(([on, c], k) => bulb(g, lx + 24, ly + 25 + k * 45, 16, c, on));
      // cars stop at the line unless green
      const go = grn;
      st.cars.sort((a, b) => b.x - a.x);
      st.cars.forEach((c, k) => {
        const ahead = k ? st.cars[k - 1].x - 110 : Infinity;
        let limit = ahead;
        if (!go && c.x < stopX - 60) limit = Math.min(limit, stopX - 60);
        c.x = Math.min(limit, c.x + cfg().carSpeed * dt);
        if (c.x > W + 80) c.x = Math.min(-80, st.cars[st.cars.length - 1].x - 140);
        car(g, c.x, roadY + 18, ["#38bdf8", "#f472b6", "#a3e635"][k % 3]);
      });
    },
    tank(g, W, H, st, plc, dt) {
      if (st.level == null) st.level = 0.5;
      const pump = S.running && plc.get("Q0"), valve = S.running && plc.get("Q1");
      const k = cfg(), lo = k.low / 100, hi = k.high / 100;
      st.level = Math.max(0, Math.min(1, st.level + ((pump ? k.fill / 100 : 0) - (valve ? k.drain / 100 : 0) - 0.004) * dt));
      plc.set("I1", st.level > lo); plc.set("I2", st.level > hi);
      const tx = W * 0.42, ty = 30, tw = 170, th = H - 70;
      g.fillStyle = "rgba(148,163,184,.25)"; rr(g, tx, ty, tw, th, 10); g.fill();
      const wh = th * st.level, wg = g.createLinearGradient(0, ty + th - wh, 0, ty + th); wg.addColorStop(0, "#38bdf8"); wg.addColorStop(1, "#0369a1");
      g.fillStyle = wg; g.fillRect(tx + 4, ty + th - wh, tw - 8, wh - 4);
      g.strokeStyle = "#94a3b8"; g.lineWidth = 3; rr(g, tx, ty, tw, th, 10); g.stroke();
      [[hi, "HIGH  I2", plc.get("I2")], [lo, "LOW  I1", plc.get("I1")]].forEach(([lv, txt, on]) => {
        const y = ty + th - th * lv; g.fillStyle = on ? "#22c55e" : "#64748b"; g.beginPath(); g.arc(tx + tw + 14, y, 7, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "rgba(148,163,184,.6)"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(tx, y); g.lineTo(tx + tw, y); g.stroke(); g.setLineDash([]);
        label(g, txt, tx + tw + 26, y + 4);
      });
      // pump + pipe in
      st.pa = (st.pa || 0) + (pump ? dt * 10 : 0);
      g.strokeStyle = "#64748b"; g.lineWidth = 12; g.beginPath(); g.moveTo(60, H - 40); g.lineTo(60, 20); g.lineTo(tx + 40, 20); g.lineTo(tx + 40, ty + 10); g.stroke();
      if (pump) { g.strokeStyle = "#38bdf8"; g.lineWidth = 6; g.setLineDash([10, 10]); g.lineDashOffset = -st.pa * 6; g.beginPath(); g.moveTo(60, H - 40); g.lineTo(60, 20); g.lineTo(tx + 40, 20); g.lineTo(tx + 40, ty + 10); g.stroke(); g.setLineDash([]); }
      g.fillStyle = pump ? "#22c55e" : "#475569"; g.beginPath(); g.arc(60, H - 60, 26, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(60, H - 60); g.rotate(st.pa); g.strokeStyle = "#0f172a"; g.lineWidth = 4; for (let k = 0; k < 3; k++) { g.rotate(2.09); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -18); g.stroke(); } g.restore();
      label(g, "PUMP Q0", 30, H - 18);
      // outlet
      g.strokeStyle = "#64748b"; g.lineWidth = 12; g.beginPath(); g.moveTo(tx + tw - 30, ty + th); g.lineTo(tx + tw - 30, H - 10); g.lineTo(W - 20, H - 10); g.stroke();
      g.fillStyle = valve ? "#22c55e" : "#ef4444"; g.beginPath(); g.moveTo(tx + tw + 20, H - 22); g.lineTo(tx + tw + 44, H + 2); g.lineTo(tx + tw + 44, H - 22); g.lineTo(tx + tw + 20, H + 2); g.closePath(); g.fill();
      label(g, "VALVE Q1", tx + tw + 52, H - 16);
      bulb(g, W - 50, 50, 18, "#ef4444", S.running && plc.get("Q2")); label(g, "ALARM Q2", W - 92, 92);
      label(g, Math.round(st.level * 100) + " %", tx + tw / 2 - 18, ty + th / 2);
    },
    conveyor(g, W, H, st, plc, dt) {
      st.boxes = st.boxes || []; st.spawn = st.spawn || 0; st.belt = st.belt || 0;
      const run = S.running && plc.get("Q0"), y = H * 0.6, x0 = 40, x1 = W - 90, eye = x0 + (x1 - x0) * 0.62;
      const kc = cfg();
      if (run) { st.belt += dt * kc.speed; st.spawn -= dt; if (st.spawn <= 0) { st.boxes.push({ x: x0 + 10, c: ["#f59e0b", "#a78bfa", "#38bdf8", "#f472b6"][st.boxes.length % 4] }); st.spawn = kc.gap; } }
      st.boxes.forEach((b) => { if (run || b.x > x1) b.x += (b.x > x1 ? 160 : kc.speed) * dt; });
      st.boxes = st.boxes.filter((b) => b.x < W + 60);
      const blocked = st.boxes.some((b) => b.x + 46 > eye && b.x < eye);
      plc.set("I2", blocked);
      g.fillStyle = "#1f2937"; rr(g, x0 - 20, y, x1 - x0 + 40, 26, 13); g.fill();
      g.strokeStyle = "#9ca3af"; g.lineWidth = 2; for (let x = x0 - 10 + (st.belt % 24); x < x1 + 10; x += 24) { g.beginPath(); g.moveTo(x, y + 3); g.lineTo(x - 8, y + 23); g.stroke(); }
      [x0, x1].forEach((x) => { g.fillStyle = "#6b7280"; g.beginPath(); g.arc(x, y + 13, 11, 0, Math.PI * 2); g.fill(); });
      st.boxes.forEach((b) => { const yy = b.x > x1 ? y - 44 + (b.x - x1) * 0.9 : y - 44; g.fillStyle = b.c; rr(g, b.x, yy, 46, 44, 5); g.fill(); g.strokeStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.moveTo(b.x, yy + 14); g.lineTo(b.x + 46, yy + 14); g.stroke(); });
      g.fillStyle = "#374151"; g.fillRect(eye - 3, y - 90, 6, 90);
      g.strokeStyle = blocked ? "rgba(239,68,68,.9)" : "rgba(239,68,68,.35)"; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(eye, y - 70); g.lineTo(eye, y - 5); g.stroke(); g.setLineDash([]);
      bulb(g, eye, y - 96, 8, "#ef4444", blocked); label(g, "PHOTO-EYE I2", eye - 46, y - 112);
      g.fillStyle = "#334155"; g.fillRect(W - 70, H - 40, 60, 34); label(g, "BIN", W - 56, H - 18);
      const c = plc.counter(0);
      label(g, "COUNT C0: " + c.acc + " / " + S.prog.counters[0].preset, 24, 30, 16);
      bulb(g, W - 40, 34, 14, "#22c55e", S.running && plc.get("Q1")); label(g, "BATCH DONE Q1", W - 160, 38);
      label(g, run ? "▶ BELT Q0" : "■ BELT Q0", 24, 56);
    },
    flasher(g, W, H, st, plc, dt) {
      st.a = (st.a || 0) + dt * 6;
      const on = S.running && plc.get("Q0"), cx = W / 2, cy = H * 0.45;
      g.fillStyle = "#475569"; g.fillRect(cx - 6, cy + 40, 12, H - cy - 50); g.fillStyle = "#1f2937"; rr(g, cx - 50, cy + 30, 100, 18, 6); g.fill();
      if (on) { g.save(); g.translate(cx, cy); g.rotate(st.a); const gr = g.createLinearGradient(0, 0, 220, 0); gr.addColorStop(0, "rgba(251,146,60,.7)"); gr.addColorStop(1, "rgba(251,146,60,0)");
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 220, -0.25, 0.25); g.closePath(); g.fill(); g.rotate(Math.PI); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 220, -0.25, 0.25); g.closePath(); g.fill(); g.restore(); }
      bulb(g, cx, cy, 34, "hsl(" + cfg().hue + ",95%,58%)", on); label(g, "BEACON Q0", cx - 40, H - 14);
    },
    stardelta(g, W, H, st, plc, dt) {
      st.speed = st.speed || 0; st.ang = st.ang || 0;
      const k1 = S.running && plc.get("Q0"), k2 = S.running && plc.get("Q1"), k3 = S.running && plc.get("Q2");
      const target = k1 && k3 ? 1 : k1 && k2 ? 0.58 : 0;
      st.speed += (target - st.speed) * Math.min(1, dt * 0.8); st.ang += st.speed * dt * 14;
      [["K1 MAIN", k1], ["K2 STAR  Y", k2], ["K3 DELTA  Δ", k3]].forEach(([n, on], k) => {
        const x = 24 + k * 118; g.fillStyle = on ? "#16a34a" : "#334155"; rr(g, x, 24, 104, 64, 10); g.fill();
        g.fillStyle = "#fff"; g.font = "700 13px system-ui"; g.fillText(n, x + 10, 50); g.font = "600 11px system-ui"; g.fillText(on ? "CLOSED" : "open", x + 10, 72);
      });
      const cx = W * 0.72, cy = H * 0.58;
      g.strokeStyle = "#94a3b8"; g.lineWidth = 3;
      if (k2) { label(g, "Y", cx - 8, cy + 8, 40); } else if (k3) { label(g, "Δ", cx - 12, cy + 10, 40); }
      g.beginPath(); g.arc(cx, cy, 70, 0, Math.PI * 2); g.stroke();
      g.save(); g.translate(cx, cy); g.rotate(st.ang); g.strokeStyle = "#38bdf8"; g.lineWidth = 5; for (let k = 0; k < 3; k++) { g.rotate(2.09); g.beginPath(); g.moveTo(0, 20); g.lineTo(0, 62); g.stroke(); } g.restore();
      // starting current indicator: star draws about 1/3 of the delta inrush
      const amps = k1 && k2 ? 2.2 * (1 - st.speed / 0.58 * 0.6) + 0.6 : k1 && k3 ? 1.6 * Math.max(0.15, 1 - st.speed) + 0.7 : 0;
      label(g, Math.round(st.speed * cfg().rpm) + " rpm", 24, 130, 16); label(g, "I ≈ " + amps.toFixed(1) + " × rated", 24, 154, 14);
      g.fillStyle = "#334155"; g.fillRect(24, 166, 240, 12); g.fillStyle = amps > 2 ? "#ef4444" : "#22c55e"; g.fillRect(24, 166, Math.min(240, amps / 4 * 240), 12);
    },
    panel(g, W, H, st, plc) {
      for (let k = 0; k < 8; k++) {
        const x = 50 + (k % 4) * ((W - 100) / 3.3), y = 60 + Math.floor(k / 4) * 110;
        bulb(g, x, y, 24, ["#ef4444", "#facc15", "#22c55e", "#38bdf8", "#a78bfa", "#fb923c", "#f472b6", "#f8fafc"][k], S.running && plc.get("Q" + k));
        label(g, "Q" + k + " " + (S.prog.names["Q" + k] || "").replace(/_/g, " "), x - 28, y + 46);
      }
    },
  };
  function rr(g, x, y, w, hh, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function label(g, txt, x, y, size) { g.fillStyle = S.colors.ink; g.font = "600 " + (size || 12) + "px JetBrains Mono, ui-monospace, monospace"; g.fillText(txt, x, y); }
  function bulb(g, x, y, r, col, on) {
    if (on) { const gr = g.createRadialGradient(x, y, 0, x, y, r * 3); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.globalAlpha = 0.55; g.beginPath(); g.arc(x, y, r * 3, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
    g.fillStyle = on ? col : "#1f2937"; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(148,163,184,.6)"; g.lineWidth = 2; g.stroke();
  }
  function car(g, x, y, col) { g.fillStyle = col; rr(g, x, y - 18, 80, 26, 8); g.fill(); rr(g, x + 14, y - 34, 46, 20, 7); g.fill(); g.fillStyle = "#0f172a"; [x + 16, x + 62].forEach((cx) => { g.beginPath(); g.arc(cx, y + 9, 8, 0, Math.PI * 2); g.fill(); }); }
  function panel(g, x, y, w, hh, buttons, lamps) {
    g.fillStyle = "rgba(148,163,184,.18)"; rr(g, x, y, w, hh, 12); g.fill();
    buttons.forEach(([n, c, on], k) => { const by = y + 34 + k * 52; g.fillStyle = c; g.globalAlpha = on ? 1 : 0.55; g.beginPath(); g.arc(x + 32, by, on ? 15 : 18, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; label(g, n, x + 58, by + 4); });
    lamps.forEach(([n, c, on], k) => { const by = y + 34 + (buttons.length + k) * 52; bulb(g, x + 32, by, 13, c, on); label(g, n, x + 58, by + 4); });
  }

  // ------------------------------------------------------------------ loop
  const cv = $("scene"), ctx = cv.getContext("2d");
  function sizeScene() { const r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function frame(now) {
    const dt = S.last ? Math.min(0.1, (now - S.last) / 1000) : 0;
    S.last = now;
    if (S.running) { S.acc += dt * 1000; let n = 0; const sm = scanMs(); while (S.acc >= sm && n < 40) { S.plc.scan(sm); S.acc -= sm; n++; } if (n === 40) S.acc = 0; }
    const r = cv.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    (SC[S.scene] || SC.panel)(ctx, r.width, r.height, S.sceneState, S.plc, dt);
    paintLadder(); paintIO();
    if (now - S.lastUi > 250) { S.lastUi = now; renderTC(); $("scanInfo").textContent = S.plc.scans + " " + t("scans"); }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ wiring
  $("runBtn").onclick = () => { S.running = !S.running; if (!S.running) { ["Q", "M"].forEach((a) => { for (let k = 0; k < E.AREAS[a]; k++) S.plc.set(a + k, false); }); } renderRun(); say(S.running ? "RUN" : "STOP"); };
  $("addRung").onclick = addRung; $("addContact").onclick = addContact; $("addBranch").onclick = addBranch; $("addOut").onclick = addOutput; $("delBtn").onclick = del;
  $("undoBtn").onclick = undo; $("redoBtn").onclick = redo;
  $("newBtn").onclick = () => load({ names: {}, inputs: { I0: "button", I1: "button" }, rungs: [{ note: "", cond: [{ t: "NO", tag: "I0" }], outs: [{ t: "OUT", tag: "Q0" }] }], scene: "panel" });
  $("scanSel").onchange = (e) => { S.prog.scan = +e.target.value; commit(); };
  $("sceneSel").onchange = (e) => { S.scene = e.target.value; S.prog.scene = S.scene; S.sceneState = {}; commit(); };
  $("copyBtn").onclick = () => { (navigator.clipboard ? navigator.clipboard.writeText($("st").textContent) : Promise.reject()).then(() => say(t("copied")), () => {}); };
  $("saveBtn").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S.prog, null, 1)], { type: "application/json" })); a.download = "ladder.quantix-plc.json"; a.click(); };
  $("openBtn").onclick = () => $("fileIn").click();
  $("fileIn").onchange = (e) => { const f = e.target.files[0]; if (f) f.text().then((x) => load(JSON.parse(x))).catch(() => say("✗ JSON")); e.target.value = ""; };
  const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  $("shareBtn").onclick = () => { const hsh = "#p=" + enc(S.prog); history.replaceState(null, "", hsh); if (window.QuantixShare && (navigator.share || window.QuantixAndroid)) { window.QuantixShare({ title: "PLC Lab · Quantix", url: location.href }); return; } (navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()).then(() => say(t("copied")), () => {}); };
  document.addEventListener("keydown", (e) => {
    const inLadder = $("ladder").contains(document.activeElement);
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === "z" && !/INPUT|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (ctrl && e.key.toLowerCase() === "y" && !/INPUT|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); redo(); return; }
    if (!inLadder) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); const b = document.activeElement; b.click(); del(); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "ArrowUp") {
      const els = [...document.querySelectorAll("#ladder .el, #ladder .rnum")], i = els.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
      const nx = els[Math.max(0, Math.min(els.length - 1, i + d))]; nx.focus(); nx.click();
    }
  });
  document.querySelectorAll(".lang button").forEach((b) => b.addEventListener("click", () => { S.lang = TX[b.dataset.lang] ? b.dataset.lang : "en"; try { localStorage.setItem("iav-formula-lang", S.lang); } catch (_) { /* private */ } renderText(); }));
  const rootEl = document.documentElement;
  function readColors() { const s = getComputedStyle(rootEl); S.colors = { ink: s.getPropertyValue("--ink").trim() || "#e6f0ff" }; }
  try { const th = localStorage.getItem("iav-theme"); if (th) rootEl.dataset.theme = th; } catch (_) { /* private */ }
  $("themeBtn").onclick = () => { const dark = rootEl.dataset.theme ? rootEl.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; rootEl.dataset.theme = dark ? "light" : "dark"; try { localStorage.setItem("iav-theme", rootEl.dataset.theme); } catch (_) { /* private */ } readColors(); };

  // start: share link > example hash > saved > motor example
  readColors(); new ResizeObserver(sizeScene).observe(cv); sizeScene();
  let lang = new URLSearchParams(location.search).get("lang");
  try { lang = lang || localStorage.getItem("iav-formula-lang"); } catch (_) { /* private */ }
  S.lang = TX[lang] ? lang : "en";
  let start = null, exId = null;
  const m = location.hash.match(/^#p=([\w-]+)/), mx = location.hash.match(/^#ex=([\w-]+)/);
  if (m) { try { start = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, "+").replace(/_/g, "/"))))); } catch (_) { start = null; } }
  if (!start && mx && EXAMPLES.some((e) => e.id === mx[1])) exId = mx[1];
  if (!start && !exId) { try { const s = localStorage.getItem(STORE); if (s) start = JSON.parse(s); } catch (_) { start = null; } }
  if (start && start.rungs) { S.prog = normalise(start); S.scene = start.scene || "panel"; S.snap = JSON.stringify(S.prog); rebuild(false); }
  else { const ex = EXAMPLES.find((e) => e.id === (exId || "motor")); S.prog = normalise(ex.program()); S.exId = ex.id; S.scene = ex.scene; S.prog.scene = ex.scene; S.snap = JSON.stringify(S.prog); rebuild(false); }
  renderText();
  requestAnimationFrame(frame);
  window.QuantixPLC = { state: S, load: (id) => { const ex = EXAMPLES.find((e) => e.id === id); load(ex.program(), id); } };
})();
