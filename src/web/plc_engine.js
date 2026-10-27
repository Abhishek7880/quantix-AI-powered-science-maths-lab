/* Quantix PLC Lab — ladder logic engine (no DOM; also runs in Node for the tests).

   Program: { names: {I0: "Start", ...}, timers: [{preset: ms}], counters: [{preset: n}], rungs: [{note, cond, outs}] }
     cond  = series: [item, ...]           item = contact | {t: "OR", b: [series, series, ...]}
     contact: {t: "NO" | "NC" | "P" | "N", tag}         tag: I0-I7, Q0-Q7, M0-M15, T0-T7 (= done bit), C0-C7 (= done bit),
                                                         or T0.TT (timing) / T0.EN
              {t: "CMP", op: ">" | ">=" | "<" | "<=" | "==" | "!=", a, b}   a, b: number or T0.ACC (ms) / C0.ACC
     outs: [{t: "OUT" | "SET" | "RST", tag}, {t: "TON" | "TOF" | "TP", n}, {t: "CTU" | "CTD", n}, {t: "RES", tag: "T0" | "C0"}]
   One scan: inputs are read, rungs are solved top to bottom (later rungs see outputs written by earlier ones, as in a
   real PLC), timers advance by the scan time.
       const plc = PLCEngine.create(program);  plc.set("I0", true);  plc.scan(10);  plc.get("Q0")
*/
(function (root) {
  "use strict";
  const T = (en, hi) => ({ en: en, hi: hi });
  const AREAS = { I: 8, Q: 8, M: 16, T: 8, C: 8 };

  // ------------------------------------------------------------------ helpers
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const isOr = (it) => it && it.t === "OR";
  function walk(series, fn, path) {   // every contact with its path
    series.forEach((it, k) => {
      const p = (path || []).concat(k);
      if (isOr(it)) it.b.forEach((s, j) => walk(s, fn, p.concat(j)));
      else fn(it, p);
    });
  }
  function validTag(tag) {
    const m = /^([IQMTC])(\d{1,2})(\.(DN|TT|EN|ACC))?$/.exec(String(tag || ""));
    return !!m && +m[2] < AREAS[m[1]] && (!m[3] || "TC".includes(m[1]));
  }

  // ------------------------------------------------------------------ engine
  function create(program) {
    const prog = clone(program);
    prog.timers = prog.timers || []; prog.counters = prog.counters || [];
    for (let k = 0; k < AREAS.T; k++) prog.timers[k] = Object.assign({ preset: 1000 }, prog.timers[k] || {});
    for (let k = 0; k < AREAS.C; k++) prog.counters[k] = Object.assign({ preset: 5 }, prog.counters[k] || {});
    const S = { bits: {}, timers: [], counters: [], edges: {}, scans: 0, time: 0, power: [] };
    function reset() {
      S.bits = {}; S.edges = {}; S.scans = 0; S.time = 0; S.power = [];
      ["I", "Q", "M"].forEach((a) => { for (let k = 0; k < AREAS[a]; k++) S.bits[a + k] = false; });
      S.timers = prog.timers.map(() => ({ acc: 0, dn: false, tt: false, en: false }));
      S.counters = prog.counters.map(() => ({ acc: 0, dn: false, last: false }));
    }
    reset();

    function value(x) {   // number operand: constant, T0.ACC (ms) or C0.ACC
      if (typeof x === "number") return x;
      const m = /^([TC])(\d+)\.ACC$/.exec(String(x));
      if (m) return m[1] === "T" ? S.timers[+m[2]].acc : S.counters[+m[2]].acc;
      const n = Number(x);
      return isFinite(n) ? n : 0;
    }
    function bit(tag) {
      const m = /^([IQMTC])(\d+)(?:\.(DN|TT|EN))?$/.exec(String(tag || ""));
      if (!m) return false;
      if (m[1] === "T") { const t = S.timers[+m[2]]; return !!t && (m[3] === "TT" ? t.tt : m[3] === "EN" ? t.en : t.dn); }
      if (m[1] === "C") { const c = S.counters[+m[2]]; return !!c && c.dn; }
      return !!S.bits[m[1] + m[2]];
    }
    // power through a series; records each element's state for the live view (key "rung:path")
    function series(list, r, path, pin) {
      let pw = pin;
      list.forEach((it, k) => {
        const p = path.concat(k);
        if (isOr(it)) {
          let any = false;
          it.b.forEach((s, j) => { if (series(s, r, p.concat(j), pw)) any = true; });
          pw = any;
          S.power[r][p.join(".")] = pw;
        } else {
          const id = r + ":" + p.join(".");
          let on;
          switch (it.t) {
            case "NC": on = !bit(it.tag); break;
            case "P": case "N": {
              const now = bit(it.tag), was = !!S.edges[id];
              S.edges[id] = now;
              on = it.t === "P" ? now && !was : !now && was;
              break;
            }
            case "CMP": {
              const a = value(it.a), b = value(it.b);
              on = { ">": a > b, ">=": a >= b, "<": a < b, "<=": a <= b, "==": a === b, "!=": a !== b }[it.op || ">"];
              break;
            }
            default: on = bit(it.tag);
          }
          S.power[r][p.join(".") + ":c"] = on;    // the contact itself is closed
          pw = pw && on;
          S.power[r][p.join(".")] = pw;           // power after it
        }
      });
      return pw;
    }
    function output(o, pw, r, k) {
      const id = r + ":o" + k;
      switch (o.t) {
        case "OUT": S.bits[o.tag] = pw; break;
        case "SET": if (pw) S.bits[o.tag] = true; break;
        case "RST": if (pw) S.bits[o.tag] = false; break;
        case "TON": case "TOF": case "TP": {
          const t = S.timers[o.n], pre = prog.timers[o.n].preset;
          if (!t) break;
          if (o.t === "TON") {
            t.en = pw;
            if (pw) { t.acc = Math.min(pre, t.acc + S.dt); t.dn = t.acc >= pre; t.tt = !t.dn; } else { t.acc = 0; t.dn = false; t.tt = false; }
          } else if (o.t === "TOF") {
            t.en = pw;
            if (pw) { t.dn = true; t.acc = 0; t.tt = false; }
            else if (t.dn) { t.acc = Math.min(pre, t.acc + S.dt); t.tt = t.acc < pre; if (t.acc >= pre) { t.dn = false; t.tt = false; } }
          } else {   // TP: a fixed-length pulse on a rising edge
            const was = !!S.edges[id]; S.edges[id] = pw;
            if (pw && !was && !t.tt) { t.tt = true; t.acc = 0; }
            if (t.tt) { t.acc = Math.min(pre, t.acc + S.dt); if (t.acc >= pre) t.tt = false; }
            else if (!pw) t.acc = 0;
            t.dn = t.tt; t.en = pw;
          }
          break;
        }
        case "CTU": case "CTD": {
          const c = S.counters[o.n], pre = prog.counters[o.n].preset;
          if (!c) break;
          if (pw && !c.last) c.acc += o.t === "CTU" ? 1 : -1;
          c.last = pw;
          c.dn = o.t === "CTU" ? c.acc >= pre : c.acc <= 0;
          break;
        }
        case "RES": {
          if (!pw) break;
          const m = /^([TC])(\d+)$/.exec(o.tag || "");
          if (!m) break;
          if (m[1] === "T") S.timers[+m[2]] = { acc: 0, dn: false, tt: false, en: false };
          else { const c = S.counters[+m[2]]; c.acc = 0; c.dn = false; }
          break;
        }
        default:
      }
      S.power[r]["o" + k] = pw;
    }
    function scan(dtMs) {
      S.dt = dtMs;
      S.power = prog.rungs.map(() => ({}));
      prog.rungs.forEach((rung, r) => {
        const pw = series(rung.cond || [], r, [], true);
        S.power[r].end = pw;
        (rung.outs || []).forEach((o, k) => output(o, pw, r, k));
      });
      S.scans++; S.time += dtMs;
    }
    return {
      scan: scan, reset: reset, bit: bit, value: value,
      get: (tag) => bit(tag), set: (tag, v) => { if (/^[IQM]\d+$/.test(tag)) S.bits[tag] = !!v; },
      power: (r) => S.power[r] || {}, timer: (k) => S.timers[k], counter: (k) => S.counters[k],
      get scans() { return S.scans; }, get time() { return S.time; }, program: prog,
    };
  }

  // ------------------------------------------------------------------ IEC 61131-3 Structured Text view of a program
  function stOf(program, names) {
    const nm = (tag) => { const base = String(tag).split(".")[0]; return names && names[base] ? names[base].replace(/[^A-Za-z0-9_]/g, "_") + (String(tag).includes(".") ? "." + String(tag).split(".")[1] : "") : tag; };
    const tv = (tag) => { const m = /^([TC])(\d+)(?:\.(DN|TT|EN))?$/.exec(tag); if (!m) return nm(tag); const x = (m[1] === "T" ? "T" : "C") + m[2]; return m[1] === "T" ? (m[3] === "TT" ? "(" + x + ".IN AND NOT " + x + ".Q)" : x + ".Q") : x + ".Q"; };
    const opd = (x) => (typeof x === "number" ? String(x) : /^T\d+\.ACC$/.test(x) ? "TIME_TO_INT(" + x.split(".")[0] + ".ET)" : /^C\d+\.ACC$/.test(x) ? x.split(".")[0] + ".CV" : String(x));
    const ser = (list) => list.length ? list.map((it) => {
      if (isOr(it)) return "(" + it.b.map((s) => ser(s)).join(" OR ") + ")";
      if (it.t === "NC") return "NOT " + tv(it.tag);
      if (it.t === "P") return "R_TRIG(" + tv(it.tag) + ")";
      if (it.t === "N") return "F_TRIG(" + tv(it.tag) + ")";
      if (it.t === "CMP") return "(" + opd(it.a) + " " + ({ "==": "=", "!=": "<>" }[it.op] || it.op) + " " + opd(it.b) + ")";
      return tv(it.tag);
    }).join(" AND ") : "TRUE";
    const lines = [];
    (program.rungs || []).forEach((r, k) => {
      const e = ser(r.cond || []);
      if (r.note) lines.push("(* " + k + ": " + r.note.replace(/\*\)/g, "") + " *)");
      (r.outs || []).forEach((o) => {
        if (o.t === "OUT") lines.push(nm(o.tag) + " := " + e + ";");
        else if (o.t === "SET") lines.push("IF " + e + " THEN " + nm(o.tag) + " := TRUE; END_IF;");
        else if (o.t === "RST") lines.push("IF " + e + " THEN " + nm(o.tag) + " := FALSE; END_IF;");
        else if (/^T(ON|OF|P)$/.test(o.t)) lines.push("T" + o.n + "(IN := " + e + ", PT := T#" + (program.timers[o.n] || { preset: 1000 }).preset + "ms);   (* " + o.t + " *)");
        else if (o.t === "CTU") lines.push("C" + o.n + "(CU := " + e + ", PV := " + (program.counters[o.n] || { preset: 5 }).preset + ");   (* CTU *)");
        else if (o.t === "CTD") lines.push("C" + o.n + "(CD := " + e + ", PV := " + (program.counters[o.n] || { preset: 5 }).preset + ");   (* CTD *)");
        else if (o.t === "RES") lines.push("IF " + e + " THEN (* reset *) " + o.tag + "(" + (o.tag[0] === "T" ? "IN := FALSE" : "RESET := TRUE") + "); END_IF;");
      });
    });
    return lines.join("\n");
  }

  // ------------------------------------------------------------------ example programs (each drives a machine scene in plc_ui.js)
  const NO = (tag) => ({ t: "NO", tag: tag }), NC = (tag) => ({ t: "NC", tag: tag }), OR = (...b) => ({ t: "OR", b: b });
  const OUT = (tag) => ({ t: "OUT", tag: tag });
  const EXAMPLES = [
    { id: "motor", scene: "motor", title: T("Motor start / stop (seal-in)", "मोटर स्टार्ट / स्टॉप (सील-इन)"),
      blurb: T("Press START: the motor's own contact Q0 holds the rung on after you let go (seal-in / latch). STOP or an overload trip breaks it.",
        "START दबाएँ: छोड़ने के बाद भी मोटर का अपना संपर्क Q0 रंग को चालू रखता है (सील-इन / लैच)। STOP या ओवरलोड ट्रिप इसे तोड़ता है।"),
      inputs: { I0: "button", I1: "button", I2: "switch" },
      names: { I0: "Start", I1: "Stop", I2: "Overload", Q0: "Motor", Q1: "Stopped_lamp", Q2: "Running_lamp" },
      rungs: [
        { note: "Start / stop with seal-in", cond: [OR([NO("I0")], [NO("Q0")]), NC("I1"), NC("I2")], outs: [OUT("Q0")] },
        { note: "Indicator lamps", cond: [NC("Q0")], outs: [OUT("Q1")] },
        { note: "", cond: [NO("Q0")], outs: [OUT("Q2")] },
      ] },
    { id: "traffic", scene: "traffic", title: T("Traffic light sequence (timers)", "ट्रैफ़िक लाइट क्रम (टाइमर)"),
      blurb: T("Three on-delay timers in a chain: green 5 s → yellow 2 s → red 5 s, then T2 resets T0 and the cycle repeats.",
        "श्रृंखला में तीन ऑन-डिले टाइमर: हरा 5 s → पीला 2 s → लाल 5 s, फिर T2, T0 को रीसेट करता है और चक्र दोहराता है।"),
      inputs: { I0: "switch" }, names: { I0: "Run", Q0: "Red", Q1: "Yellow", Q2: "Green" },
      timers: [{ preset: 5000 }, { preset: 2000 }, { preset: 5000 }],
      rungs: [
        { note: "Green time", cond: [NO("I0"), NC("T2")], outs: [{ t: "TON", n: 0 }] },
        { note: "Yellow time", cond: [NO("T0")], outs: [{ t: "TON", n: 1 }] },
        { note: "Red time", cond: [NO("T1")], outs: [{ t: "TON", n: 2 }] },
        { note: "Lamps", cond: [NO("I0"), NC("T0")], outs: [OUT("Q2")] },
        { note: "", cond: [NO("T0"), NC("T1")], outs: [OUT("Q1")] },
        { note: "", cond: [OR([NO("T1")], [NC("I0")])], outs: [OUT("Q0")] },
      ] },
    { id: "tank", scene: "tank", title: T("Water tank level control", "पानी की टंकी स्तर नियंत्रण"),
      blurb: T("The pump starts when the water falls below the LOW sensor and runs until the HIGH sensor (hysteresis with a seal-in). An alarm lamp flashes if the tank stays empty for 8 s.",
        "पानी LOW सेंसर से नीचे जाने पर पंप चालू होता है और HIGH सेंसर तक चलता है (सील-इन से हिस्टेरेसिस)। टंकी 8 s तक खाली रहे तो अलार्म लैंप चमकता है।"),
      inputs: { I0: "switch", I1: "sensor", I2: "sensor", I3: "switch" },
      names: { I0: "Auto", I1: "Level_low", I2: "Level_high", I3: "Tap_open", Q0: "Pump", Q1: "Outlet_valve", Q2: "Alarm" },
      timers: [{ preset: 8000 }, { preset: 400 }, { preset: 400 }],
      rungs: [
        { note: "Pump: on below LOW, off at HIGH", cond: [NO("I0"), OR([NC("I1")], [NO("Q0")]), NC("I2")], outs: [OUT("Q0")] },
        { note: "Outlet valve follows the tap switch", cond: [NO("I3")], outs: [OUT("Q1")] },
        { note: "Empty for 8 s → alarm", cond: [NC("I1")], outs: [{ t: "TON", n: 0 }] },
        { note: "Flasher for the alarm lamp", cond: [NO("T0"), NC("T2")], outs: [{ t: "TON", n: 1 }] },
        { note: "", cond: [NO("T1")], outs: [{ t: "TON", n: 2 }] },
        { note: "", cond: [NO("T0"), NC("T1")], outs: [OUT("Q2")] },
      ] },
    { id: "conveyor", scene: "conveyor", title: T("Conveyor with box counter", "बॉक्स काउंटर के साथ कन्वेयर"),
      blurb: T("START runs the belt; the photo-eye I2 counts each box (CTU). After 5 boxes the counter is done: the belt stops and BATCH DONE lights. RESET clears the count.",
        "START बेल्ट चलाता है; फ़ोटो-आई I2 हर बॉक्स गिनती है (CTU)। 5 बॉक्स के बाद काउंटर पूरा: बेल्ट रुकती है और BATCH DONE जलता है। RESET गिनती साफ़ करता है।"),
      inputs: { I0: "button", I1: "button", I2: "sensor", I3: "button" },
      names: { I0: "Start", I1: "Stop", I2: "Photo_eye", I3: "Reset_count", Q0: "Conveyor", Q1: "Batch_done" },
      counters: [{ preset: 5 }],
      rungs: [
        { note: "Belt with seal-in, stops when the batch is full", cond: [OR([NO("I0")], [NO("Q0")]), NC("I1"), NC("C0")], outs: [OUT("Q0")] },
        { note: "Count boxes", cond: [NO("I2")], outs: [{ t: "CTU", n: 0 }] },
        { note: "Batch done lamp", cond: [NO("C0")], outs: [OUT("Q1")] },
        { note: "Reset the count", cond: [NO("I3")], outs: [{ t: "RES", tag: "C0" }] },
      ] },
    { id: "flasher", scene: "flasher", title: T("Flasher (two timers)", "फ़्लैशर (दो टाइमर)"),
      blurb: T("T0 and T1 reset each other, making a 1 Hz square wave: the beacon is on 0.5 s, off 0.5 s. Change the presets to change the rhythm.",
        "T0 और T1 एक-दूसरे को रीसेट करते हैं, 1 Hz वर्ग तरंग बनती है: बीकन 0.5 s चालू, 0.5 s बंद। लय बदलने के लिए प्रीसेट बदलें।"),
      inputs: { I0: "switch" }, names: { I0: "Enable", Q0: "Beacon" },
      timers: [{ preset: 500 }, { preset: 500 }],
      rungs: [
        { note: "Off time", cond: [NO("I0"), NC("T1")], outs: [{ t: "TON", n: 0 }] },
        { note: "On time", cond: [NO("T0")], outs: [{ t: "TON", n: 1 }] },
        { note: "Beacon", cond: [NO("T0")], outs: [OUT("Q0")] },
      ] },
    { id: "stardelta", scene: "stardelta", title: T("Star–delta motor starter", "स्टार–डेल्टा मोटर स्टार्टर"),
      blurb: T("START closes the main contactor K1 and the star contactor K2 (low starting current). After 5 s, K2 opens and the delta contactor K3 closes. K2 and K3 interlock: never both on.",
        "START मुख्य कॉन्टैक्टर K1 और स्टार कॉन्टैक्टर K2 बंद करता है (कम प्रारंभिक धारा)। 5 s बाद K2 खुलता है और डेल्टा कॉन्टैक्टर K3 बंद होता है। K2 और K3 इंटरलॉक: दोनों कभी साथ नहीं।"),
      inputs: { I0: "button", I1: "button" }, names: { I0: "Start", I1: "Stop", Q0: "K1_main", Q1: "K2_star", Q2: "K3_delta" },
      timers: [{ preset: 5000 }],
      rungs: [
        { note: "Main contactor with seal-in", cond: [OR([NO("I0")], [NO("Q0")]), NC("I1")], outs: [OUT("Q0")] },
        { note: "Star time", cond: [NO("Q0")], outs: [{ t: "TON", n: 0 }] },
        { note: "Star (interlocked with delta)", cond: [NO("Q0"), NC("T0"), NC("Q2")], outs: [OUT("Q1")] },
        { note: "Delta (interlocked with star)", cond: [NO("Q0"), NO("T0"), NC("Q1")], outs: [OUT("Q2")] },
      ] },
  ];
  EXAMPLES.forEach((ex) => {
    ex.program = () => ({ names: clone(ex.names), inputs: clone(ex.inputs), timers: clone(ex.timers || []), counters: clone(ex.counters || []), rungs: clone(ex.rungs) });
  });

  const api = { create: create, stOf: stOf, walk: walk, validTag: validTag, EXAMPLES: EXAMPLES, AREAS: AREAS, isOr: isOr };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PLCEngine = api;
})(typeof self !== "undefined" ? self : this);
