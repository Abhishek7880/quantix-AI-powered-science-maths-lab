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
  const s2 = run({ parts: [part("battery", 0, 0, 0, { V: 9, r: 0.1 }), d2, part("ground", 0, 2)], wires: [W(4, -2, 4, 2), W(4, 2, 0, 2)] }, 6, 1e-3);
  check("LED without resistor burns (after a few seconds)", !!s2.partInfo(d2.id).burnt); }
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

// ---------------------------------------------------------------- breadboard, meters, breaker, fan, opto, ICs, analysis
// breadboard: resistor and LED joined only through a column of holes; without the board the LED stays dark
{ const mk = (withBoard) => {
    const r = part("resistor", 4, 1, 0, { R: 470 }), d = part("led", 8, 2), parts = [part("battery", -6, 0, 0, { V: 9, r: 0.01 }), r, d, part("ground", -6, 2)];
    if (withBoard) parts.push(part("breadboard", 0, 0));
    return { c: { parts: parts, wires: [W(-6, -2, 2, -2), W(2, -2, 2, 0), W(10, 4, 10, 6), W(10, 6, -6, 6), W(-6, 6, -6, 2)] }, d: d };
  };
  const a = mk(true), s = run(a.c, 2e-3, 1e-5);
  near("breadboard column joins R and LED", s.partInfo(a.d.id).i, (9 - s.partInfo(a.d.id).v) / 470, 0.01);
  const b = mk(false), s2 = run(b.c, 2e-3, 1e-5);
  check("no breadboard: LED dark", Math.abs(s2.partInfo(b.d.id).i) < 1e-6);
  check("rail gap every 5 holes", CS.bbStrip({ x: 0, y: 0 }, 4, -3) === "r+" && CS.bbStrip({ x: 0, y: 0 }, 5, -3) === null); }
// multimeter: ohms on an unpowered resistor, OL when open, volts on a battery
{ const m = part("dmm", 0, 0, 0, { mode: "ohm" }), r = part("resistor", 0, 4, 0, { R: 4700 });
  const s = run({ parts: [m, r], wires: [W(-2, 0, -2, 4), W(2, 0, 2, 4)] }, 1e-3, 1e-5);
  near("DMM ohms reads 4.7 k", s.partInfo(m.id).reading, 4700, 0.01);
  const m2 = part("dmm", 0, 0, 0, { mode: "ohm" }), s2 = run({ parts: [m2], wires: [] }, 1e-3, 1e-5);
  check("DMM ohms open = OL", s2.partInfo(m2.id).display === "OL");
  const m3 = part("dmm", 4, 0, 1, { mode: "vdc" }), s3 = run({ parts: [part("battery", 0, 0, 0, { V: 9, r: 0.01 }), m3, part("ground", 0, 2)], wires: [W(0, -2, 4, -2), W(0, 2, 4, 2)] }, 1e-3, 1e-5);
  near("DMM volts reads 9 V", s3.partInfo(m3.id).reading, 9, 0.002); }
// wattmeter: 12 V across 6 ohm -> 24 W
{ const wm = part("wattmeter", 5, 0), load = part("resistor", 9, 1, 1, { R: 6, Pmax: 100 });
  const s = run({ parts: [part("battery", 0, 0, 0, { V: 12, r: 0.001 }), wm, load, part("ground", 0, 3)],
    wires: [W(0, -2, 3, -2), W(3, -2, 3, -1), W(7, -1, 9, -1), W(3, 1, 3, 2), W(3, 2, 8, 2), W(8, 2, 8, -1), W(7, 1, 7, 3), W(0, 2, 0, 3), W(0, 3, 9, 3)] }, 1, 1e-3);
  near("wattmeter 24 W", s.partInfo(wm.id).reading, 24, 0.01); }
// breaker: 4x overload trips in a fraction of a second; a dead short trips at once; switching on again resets it
{ const mk = (R) => { const cb = part("breaker", 4, 0, 0, { Ir: 6 }), c = { parts: [part("battery", 0, 0, 0, { V: 12, r: 0.01 }), cb, part("resistor", 8, 0, 1, { R: R, Pmax: 1e4 }), part("ground", 0, 4)],
    wires: [W(0, -2, 4, -2), W(4, 2, 8, 2), W(8, -2, 10, -2), W(10, -2, 10, 4), W(10, 4, 0, 4), W(0, 4, 0, 2)] }; return { c: c, cb: cb }; };
  const a = mk(0.5), s = CS.create(a.c);
  s.step(1e-3); check("breaker carries 4x at first", Math.abs(s.partInfo(a.cb.id).i) > 20);
  while (s.t < 0.5) s.step(1e-3);
  check("breaker trips on 4x overload", s.partInfo(a.cb.id).tripped && Math.abs(s.partInfo(a.cb.id).i) < 1e-3);
  s.repair(a.cb.id); s.step(1e-4); check("breaker reset conducts", Math.abs(s.partInfo(a.cb.id).i) > 20);
  const b = mk(0.01), s2 = CS.create(b.c); s2.step(1e-4); s2.step(1e-4);
  check("breaker trips at once on a short", s2.partInfo(b.cb.id).tripped);
  const c6 = mk(4), s3 = run(c6.c, 2, 1e-3); check("breaker holds its rated load", !s3.partInfo(c6.cb.id).tripped); }
// fan: spins up and settles (air drag)
{ const f = part("fan", 4, 0, 1), s = run({ parts: [part("battery", 0, 0, 0, { V: 12, r: 0.01 }), f, part("ground", 0, 2)], wires: [W(0, -2, 4, -2), W(0, 2, 4, 2)] }, 3, 1e-3);
  const w1 = s.partInfo(f.id).spin; s.step(1e-3); for (let k = 0; k < 500; k++) s.step(1e-3);
  check("fan spins", w1 > 50); near("fan settles", s.partInfo(f.id).spin, w1, 0.05); }
// optocoupler: LED on -> output transistor saturates; LED off -> output at the supply
{ const mk = (v) => { const u = part("opto", 0, 0), c = { parts: [part("battery", -8, 0, 0, { V: v, r: 0.01 }), part("resistor", -5, -1, 0, { R: 330 }), u, part("ground", -8, 3),
      part("battery", 8, 0, 0, { V: 5, r: 0.01 }), part("resistor", 5, -2, 0, { R: 1000 }), part("ground", 2, 3)],
    wires: [W(-8, -2, -7, -2), W(-7, -2, -7, -1), W(-3, -1, -2, -1), W(-2, 1, -2, 2), W(-2, 2, -8, 2), W(-8, 2, -8, 3), W(7, -2, 8, -2), W(3, -2, 2, -2), W(2, -2, 2, -1), W(2, 1, 2, 2), W(2, 2, 8, 2), W(2, 2, 2, 3)] }; return { c: c, u: u }; };
  const on = mk(5), s = run(on.c, 2e-3, 1e-5); check("opto on: output saturated", s.partInfo(on.u.id).v < 0.5);
  const off = mk(0), s2 = run(off.c, 2e-3, 1e-5); check("opto off: output high", s2.partInfo(off.u.id).v > 4.5); }
// custom IC: a 1k/1k divider made with the IC creator gives half the input
{ const inner = { parts: [part("port", 0, -4, 0, { name: "IN" }), part("resistor", 0, -2, 1, { R: 1000 }), part("port", 0, 0, 0, { name: "OUT" }), part("resistor", 0, 2, 1, { R: 1000 }), part("port", 0, 4, 0, { name: "GND" })], wires: [] };
  const type = CS.defineIC("div_test", { name: "Divider", pinNames: ["IN", "GND", "OUT"], circuit: inner });
  const ic = { id: "ic1", type: type, x: 0, y: 0, rot: 0, label: "IC1", p: {} }, vm = part("voltmeter", 6, 0, 1);
  const c = { parts: [part("battery", -8, 0, 0, { V: 10, r: 0.001 }), ic, vm, part("ground", -8, 3)],
    wires: [W(-8, -2, -3, -2), W(-3, -2, -3, -1), W(-8, 2, -3, 2), W(-3, 2, -3, 1), W(3, 0, 4, 0), W(4, 0, 4, -2), W(4, -2, 6, -2), W(6, 2, 6, 3), W(6, 3, -8, 3), W(-8, 3, -8, 2)] };
  const s = run(c, 1e-3, 1e-5);
  near("custom IC divider gives 5 V", s.partInfo(vm.id).reading, 5, 0.002);
  const k = CS.kirchhoff(s);
  check("Kirchhoff: every node balances (KCL)", k.kcl.length >= 2 && k.kcl.every((n) => n.ok));
  const net = CS.spice(s, { stop: 1e-3 });
  check("SPICE netlist lists the IC's inside resistors", (net.match(/^R\S*\s/mg) || []).length >= 2 && /\.tran/.test(net) && /\.end/.test(net)); }
// Kirchhoff loops on a two-loop circuit: every loop sums to zero and names its parts
{ const c = { parts: [part("battery", 0, 0, 0, { V: 9, r: 0.01 }), part("resistor", 2, -2, 0, { R: 1000 }), part("resistor", 4, 0, 1, { R: 2000 }), part("resistor", 8, 0, 1, { R: 3000 }), part("ground", 0, 2)],
    wires: [W(4, -2, 8, -2), W(0, 2, 8, 2)] };
  const s = run(c, 1e-4, 1e-5), k = CS.kirchhoff(s);
  check("Kirchhoff: 2 independent loops", k.kvl.length === 2);
  check("Kirchhoff: loops sum to 0 V (KVL)", k.kvl.every((l) => l.ok && l.terms.length >= 2)); }
// SPICE: an LED circuit exports a diode model, a source and the analysis
{ const s = run({ parts: [part("battery", 0, 0, 0, { V: 5 }), part("resistor", 2, -2, 0, { R: 330 }), part("led", 6, -2), part("ground", 0, 2)], wires: [W(8, -2, 8, 2), W(8, 2, 0, 2)] }, 1e-4, 1e-5);
  const net = CS.spice(s);
  check("SPICE: LED model + source + .end", /\.model DLED_RED D\(/.test(net) && /^V\S* /m.test(net) && /^D\S* /m.test(net) && /\.end/.test(net)); }
// overload: a 12 V fan on 440 V runs at first, heats up (heat bar), burns after ~4 s and stops; Repair brings it back
{ const f = part("fan", 4, 0, 1), sw = part("switch", 2, -2, 0, { on: true }), bat = part("battery", 0, 0, 0, { V: 440, r: 0.1 });
  const c = { parts: [bat, sw, f, part("ground", 0, 2)], wires: [W(0, -2, 0, -2), W(4, 2, 0, 2)] };
  const s = CS.create(c);
  while (s.t < 1) s.step(1e-3);
  const i1 = s.partInfo(f.id);
  check("overloaded fan spins at first", Math.abs(i1.spin) > 50 && !i1.burnt);
  check("overloaded fan heats up (stress shown)", i1.stress > 0.15 && i1.stress < 0.5);
  while (s.t < 3.5) s.step(1e-3);
  check("fan not yet burnt at 3.5 s", !s.partInfo(f.id).burnt);
  while (s.t < 5) s.step(1e-3);
  const i2 = s.partInfo(f.id);
  check("fan burns after about 4 s", i2.burnt === "burnt" && i2.stress === 1 && Math.abs(i2.i) < 1e-6);
  while (s.t < 8) s.step(1e-3);
  check("burnt fan coasts to a stop", Math.abs(s.partInfo(f.id).spin) < 5);
  bat.p.V = 12; s.update(c); s.repair(f.id);
  while (s.t < 11) s.step(1e-3);
  const i3 = s.partInfo(f.id);
  check("repaired fan on 12 V runs and stays cool", !i3.burnt && Math.abs(i3.spin) > 50 && i3.stress === 0); }
// within ratings nothing heats up
{ const d = part("led", 6, -2), s = run({ parts: [part("battery", 0, 0, 0, { V: 5, r: 0.01 }), part("resistor", 2, -2, 0, { R: 330 }), d, part("ground", 0, 2)], wires: [W(8, -2, 8, 2), W(8, 2, 0, 2)] }, 10, 1e-3);
  check("LED with resistor: no heat after 10 s", !s.partInfo(d.id).burnt && s.partInfo(d.id).stress === 0); }
// flip mirrors a part left to right
{ const q = CS.pinPositions({ type: "npn", x: 0, y: 0, rot: 0, flip: true });
  check("flip mirrors the base pin", q[0][0] === 2 && q[0][1] === 0); }
console.log(failed ? failed + " FAILED" : "ALL PASSED");
process.exit(failed ? 1 : 0);
