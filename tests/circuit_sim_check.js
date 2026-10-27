// Circuit Lab engine checks against textbook answers (run by tests/test_circuit.py with Node).
"use strict";
const path = require("path");
const CS = require(path.join(__dirname, "..", "src", "web", "circuit_sim.js"));
const EX = require(path.join(__dirname, "..", "src", "web", "circuit_examples.js"));

let id = 0, failed = 0;
const part = (type, x, y, rot, p) => ({ id: "p" + (++id), type, x, y, rot: rot || 0,
  p: Object.assign({}, ...CS.PARTS[type].params.map((q) => ({ [q.k]: q.v })), p || {}) });
const W = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });
function run(c, t, dt, each) { const s = CS.create(c); while (s.t < t - 1e-12) { s.step(dt); if (each) each(s); } return s; }
function near(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  if (!ok) { failed++; console.log("FAIL " + name + ": got " + got + ", want " + want); } else console.log("ok   " + name);
}
function check(name, cond) { if (!cond) { failed++; console.log("FAIL " + name); } else console.log("ok   " + name); }

// voltage divider: 9 V across 1k + 2k -> 6 V
{ const r2 = part("resistor", 4, 0, 1, { R: 2000 });
  const s = run({ parts: [part("battery", 0, 0, 0, { V: 9, r: 0.001 }), part("resistor", 2, -2, 0, { R: 1000 }), r2, part("ground", 0, 2)], wires: [W(0, 2, 4, 2)] }, 1e-4, 1e-5);
  near("divider", s.partInfo(r2.id).v, 6, 0.002); }
// RC: tau = 1 s -> 63.2 %
{ const c = part("capacitor", 4, 0, 1, { C: 100e-6 });
  const s = run({ parts: [part("battery", 0, 0, 0, { V: 10, r: 0.001 }), part("resistor", 2, -2, 0, { R: 10000 }), c, part("ground", 0, 2)], wires: [W(0, 2, 4, 2)] }, 1, 1e-3);
  near("RC charge at tau", s.partInfo(c.id).v, 6.321, 0.004); }
// RL: tau = 0.1 s -> 0.632 A
{ const l = part("inductor", 4, 0, 1, { L: 1, R: 0 });
  const s = run({ parts: [part("battery", 0, 0, 0, { V: 10, r: 0.001 }), part("resistor", 2, -2, 0, { R: 10, Pmax: 100 }), l, part("ground", 0, 2)], wires: [W(0, 2, 4, 2)] }, 0.1, 1e-4);
  near("RL current at tau", s.partInfo(l.id).i, 0.632, 0.004); }
// LED: I = (Vs - Vf) / R, and it burns without a resistor
{ const d = part("led", 6, -2);
  const s = run({ parts: [part("battery", 0, 0, 0, { V: 5, r: 0.01 }), part("resistor", 2, -2, 0, { R: 330 }), d, part("ground", 0, 2)], wires: [W(8, -2, 8, 2), W(8, 2, 0, 2)] }, 1e-3, 1e-5);
  const i = s.partInfo(d.id); near("LED current", i.i, (5 - i.v) / 330, 0.001); check("red LED Vf 1.7-1.9 V", i.v > 1.7 && i.v < 1.9);
  const d2 = part("led", 2, -2);
  const s2 = run({ parts: [part("battery", 0, 0, 0, { V: 9, r: 0.1 }), d2, part("ground", 0, 2)], wires: [W(4, -2, 4, 2), W(4, 2, 0, 2)] }, 0.1, 1e-4);
  check("LED without resistor burns", !!s2.partInfo(d2.id).burnt); }
// blue LED (3 V) lights from 5 V through 100 ohm
{ const d = part("led", 6, -2, 0, { color: "blue" });
  const s = run({ parts: [part("battery", 0, 0, 0, { V: 5, r: 0.01 }), part("resistor", 2, -2, 0, { R: 100 }), d, part("ground", 0, 2)], wires: [W(8, -2, 8, 2), W(8, 2, 0, 2)] }, 1e-3, 1e-5);
  const i = s.partInfo(d.id); check("blue LED conducts at ~3 V", i.v > 2.8 && i.v < 3.3 && i.i > 0.015); }
// op-amp inverting x10
{ const u = part("opamp", 0, 0);
  const s = run({ parts: [part("battery", -8, 0, 0, { V: 1, r: 0.001 }), part("ground", -8, 2), u, part("resistor", -4, -2, 0, { R: 1000 }), part("resistor", 1, -4, 0, { R: 10000 }), part("ground", -2, 1)],
    wires: [W(-8, -2, -6, -2), W(-2, -2, -2, -1), W(-2, -2, -1, -2), W(-1, -2, -1, -4), W(3, -4, 3, 0)] }, 1e-3, 1e-5);
  near("op-amp gain -10", s.partInfo(u.id).v, -10, 0.002); }
// examples: each runs without burning anything and gives its stated result
const out = {};
for (const ex of EX) {
  const c = ex.make(), s = CS.create(c), dt = ex.id === "opamp" ? 1e-6 : ex.speed < 1 ? 5e-5 : 2e-4;
  const T = ex.id === "opamp" ? 0.002 : ex.speed < 1 ? 0.2 : 1.5;
  while (s.t < T) s.step(dt);
  const burnt = c.parts.filter((p) => s.partInfo(p.id).burnt).map((p) => p.label);
  check("example " + ex.id + " runs with nothing burnt", !burnt.length && !s.warn);
  out[ex.id] = (label) => s.partInfo(c.parts.find((p) => p.label === label).id);
}
near("example led: 15 mA", out.led("LED1").i, 0.0153, 0.03);
near("example divider: 6 V", out.divider("VM1").reading, 6, 0.002);
near("example bridge: ~15.4 V DC", out.bridge("VM1").reading, 15.4, 0.04);
near("example zener: 5.1 V", out.zener("VM1").reading, 5.13, 0.02);
check("example nightlight: LED off in light", out.nightlight("LED1").glow < 0.05);
check("example mosfet: motor turning", out.mosfet("M1").spin > 500);
console.log(failed ? failed + " FAILED" : "ALL PASSED");
process.exit(failed ? 1 : 0);
