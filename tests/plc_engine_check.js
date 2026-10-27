// PLC Lab engine checks (run by tests/test_plc.py with Node).
"use strict";
const path = require("path");
const P = require(path.join(__dirname, "..", "src", "web", "plc_engine.js"));
let failed = 0;
const check = (name, cond) => { if (!cond) { failed++; console.log("FAIL " + name); } else console.log("ok   " + name); };
const ex = (id) => P.create(P.EXAMPLES.find((e) => e.id === id).program());
const run = (plc, ms, every) => { for (let t = 0; t < ms; t += 10) { plc.scan(10); if (every) every(plc, t); } };

// seal-in: start pulse latches, stop breaks, overload breaks
{ const p = ex("motor");
  p.set("I0", true); run(p, 30); p.set("I0", false); run(p, 50);
  check("motor latches after START is released", p.get("Q0") && p.get("Q2") && !p.get("Q1"));
  p.set("I1", true); run(p, 20); p.set("I1", false); run(p, 20);
  check("STOP unlatches", !p.get("Q0") && p.get("Q1"));
  p.set("I0", true); run(p, 20); p.set("I0", false); p.set("I2", true); run(p, 20);
  check("overload trips the motor", !p.get("Q0")); }
// traffic: green 5 s, yellow 2 s, red 5 s, repeating
{ const p = ex("traffic"); p.set("I0", true);
  const seq = []; let last = "";
  run(p, 25000, (q, t) => { const s = q.get("Q2") ? "G" : q.get("Q1") ? "Y" : q.get("Q0") ? "R" : "-"; if (s !== last) { seq.push([s, t]); last = s; } });
  const d = seq.slice(1).map((x, k) => [seq[k][0], x[1] - seq[k][1]]);
  check("traffic order G→Y→R→G", seq.map((x) => x[0]).join("").startsWith("GYRGYR"));
  check("green ≈ 5 s, yellow ≈ 2 s, red ≈ 5 s", Math.abs(d[0][1] - 5000) <= 20 && Math.abs(d[1][1] - 2000) <= 20 && Math.abs(d[2][1] - 5000) <= 30);
  check("never two lamps at once", (() => { const q = ex("traffic"); q.set("I0", true); let ok = true; run(q, 25000, (z) => { if ([z.get("Q0"), z.get("Q1"), z.get("Q2")].filter(Boolean).length !== 1) ok = false; }); return ok; })()); }
// conveyor: counts 5 rising edges then stops; reset clears
{ const p = ex("conveyor"); p.set("I0", true); run(p, 20); p.set("I0", false);
  for (let k = 0; k < 5; k++) { p.set("I2", true); run(p, 30); p.set("I2", false); run(p, 30); }
  check("5 boxes counted → belt stops, batch done", p.counter(0).acc === 5 && !p.get("Q0") && p.get("Q1"));
  p.set("I3", true); run(p, 20); p.set("I3", false); run(p, 20);
  check("reset clears the count", p.counter(0).acc === 0 && !p.get("Q1")); }
// flasher: 1 Hz, 50 % duty
{ const p = ex("flasher"); p.set("I0", true); let on = 0, edges = 0, last = false;
  run(p, 10000, (q) => { const v = q.get("Q0"); if (v) on++; if (v && !last) edges++; last = v; });
  check("flasher ≈ 1 Hz", edges >= 9 && edges <= 11);
  check("flasher ≈ 50 % on", Math.abs(on / 1000 - 0.5) < 0.03); }
// star-delta: star first, delta after 5 s, never both
{ const p = ex("stardelta"); p.set("I0", true); run(p, 20); p.set("I0", false);
  let both = false, starAt = null, deltaAt = null;
  run(p, 7000, (q, t) => { if (q.get("Q1") && q.get("Q2")) both = true; if (q.get("Q1") && starAt == null) starAt = t; if (q.get("Q2") && deltaAt == null) deltaAt = t; });
  check("star first, delta after ~5 s", starAt != null && deltaAt != null && Math.abs(deltaAt - 5000) < 50);
  check("star and delta never on together", !both); }
// structured text
{ const st = P.stOf(P.EXAMPLES[0].program(), P.EXAMPLES[0].names);
  check("ST seal-in line", st.includes("Motor := (Start OR Motor) AND NOT Stop AND NOT Overload;")); }
// edge contact and compare
{ const p = P.create({ rungs: [{ cond: [{ t: "P", tag: "I0" }], outs: [{ t: "CTU", n: 0 }] }, { cond: [{ t: "CMP", op: ">=", a: "C0.ACC", b: 3 }], outs: [{ t: "OUT", tag: "Q0" }] }], counters: [{ preset: 10 }] });
  for (let k = 0; k < 3; k++) { p.set("I0", true); run(p, 50); p.set("I0", false); run(p, 50); }
  check("rising-edge contact + compare ≥ 3", p.counter(0).acc === 3 && p.get("Q0")); }
console.log(failed ? failed + " FAILED" : "ALL PASSED");
process.exit(failed ? 1 : 0);
