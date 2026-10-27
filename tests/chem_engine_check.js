// Chemistry Lab engine checks (run by tests/test_chemlab.py with Node).
"use strict";
const path = require("path");
const fs = require("fs");
const C = require(path.join(__dirname, "..", "src", "web", "chem_engine.js"));
C.init(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "knowledge", "elements.json"), "utf8")).elements);
let failed = 0;
const check = (name, cond, extra) => { if (!cond) { failed++; console.log("FAIL " + name + (extra ? "  " + extra : "")); } else console.log("ok   " + name + (extra ? "  " + extra : "")); };
const run = (lab, s, ctl) => { for (let t = 0; t < s; t += 0.05) lab.step(0.05, ctl); return lab.view(); };
const has = (v, f, st) => v.contents.some((c) => c.f === f && (!st || c.state === st));
const eq = (v, re) => v.events.some((e) => re.test(e.eq.replace(/[₀-₉]/g, (d) => "₀₁₂₃₄₅₆₇₈₉".indexOf(d))));

// balancing
check("balance Fe + O2 -> Fe2O3 = 4,3,2", JSON.stringify(C.balance(["Fe", "O2"], ["Fe2O3"])) === "[4,3,2]");
check("balance C2H5OH combustion = 1,3,2,3", JSON.stringify(C.balance(["C2H5OH", "O2"], ["CO2", "H2O"])) === "[1,3,2,3]");
check("balance Al + HCl = 2,6,2,3", JSON.stringify(C.balance(["Al", "HCl"], ["AlCl3", "H2"])) === "[2,6,2,3]");
check("salt formulas", C.saltFormula("Fe3", "SO4") === "Fe2(SO4)3" && C.saltFormula("NH4", "SO4") === "(NH4)2SO4" && C.saltFormula("Ca", "OH") === "Ca(OH)2" && C.saltFormula("Na", "CH3COO") === "CH3COONa");
check("molar mass of CuSO4 ≈ 159.6", Math.abs(C.molarMass("CuSO4") - 159.6) < 0.2);

// neutralisation: 50 mL 1 M HCl + 50 mL 1 M NaOH -> pH 7, warms ~6.8 °C
{ const L = C.lab(); L.add("HCl", 50, "mL", 1); L.add("NaOH", 50, "mL", 1); const v = run(L, 2);
  check("HCl + NaOH → NaCl + H2O", eq(v, /HCl.*NaOH.*→ NaCl.*H2O/) || eq(v, /NaOH.*HCl.*→ NaCl.*H2O/), v.events.map((e) => e.eq).join(" ; "));
  check("neutral pH ≈ 7", Math.abs(v.pH - 7) < 0.6, "pH " + v.pH.toFixed(2));
  check("temperature rises ~5-8 °C", v.T > 29 && v.T < 34, v.T.toFixed(1) + " °C"); }
// acid pH
{ const L = C.lab(); L.add("HCl", 100, "mL", 0.1); check("0.1 M HCl has pH ≈ 1", Math.abs(L.view().pH - 1) < 0.1, L.view().pH.toFixed(2)); }
{ const L = C.lab(); L.add("CH3COOH", 100, "mL", 0.1); check("0.1 M vinegar acid pH ≈ 2.9", Math.abs(L.view().pH - 2.87) < 0.15, L.view().pH.toFixed(2)); }
// magnesium + hydrochloric acid -> H2, ribbon used up
{ const L = C.lab(); L.add("HCl", 50, "mL", 1); L.add("Mg", 0.24, "g"); const v1 = run(L, 1);
  check("Mg + HCl fizzes H2", v1.gases.some((g) => g.f === "H2"), JSON.stringify(v1.gases.map((g) => g.f)));
  const v = run(L, 20);
  check("Mg + 2HCl → MgCl2 + H2", eq(v, /Mg.*2 HCl.*→ MgCl2.*H2/) || eq(v, /2 HCl.*Mg.*→ MgCl2.*H2/), v.events.map((e) => e.eq).join(" ; "));
  check("all 0.01 mol Mg used", !has(v, "Mg")); }
// copper does not react with dilute HCl
{ const L = C.lab(); L.add("HCl", 50, "mL", 1); L.add("Cu", 1, "g"); const v = run(L, 5); check("Cu + HCl: no reaction", !v.events.length && has(v, "Cu", "s")); }
// copper + nitric acid -> brown NO2
{ const L = C.lab(); L.add("HNO3", 50, "mL", 4); L.add("Cu", 0.5, "g"); const v = run(L, 3); check("Cu + HNO3 gives brown NO2", v.gases.some((g) => g.f === "NO2"), v.events.map((e) => e.eq).join(" ; ")); }
// sodium + water -> NaOH + H2, pink with phenolphthalein
{ const L = C.lab(); L.add("H2O", 100, "mL"); L.add("phenolphthalein", 1, "drops"); L.add("Na", 0.23, "g"); const v = run(L, 4);
  check("2Na + 2H2O → 2NaOH + H2", eq(v, /2 Na.*2 H2O.*→ 2 NaOH.*H2/), v.events.map((e) => e.eq).join(" ; "));
  check("solution turns basic (pH > 12)", v.pH > 12, "pH " + (v.pH || 0).toFixed(1));
  check("phenolphthalein pink", parseInt(v.colour.hex.slice(1, 3), 16) > 180 && parseInt(v.colour.hex.slice(5, 7), 16) > 100, v.colour.hex); }
// potassium + water -> lilac flame
{ const L = C.lab(); L.add("H2O", 100, "mL"); L.add("K", 0.2, "g"); L.step(0.05); const v = L.view(); check("K + water: lilac flame", v.flame === C.FLAME.K, String(v.flame)); }
// displacement: iron in copper sulfate -> copper deposit, green FeSO4
{ const L = C.lab(); L.add("CuSO4", 50, "mL", 0.5); L.add("Fe", 2, "g"); const v = run(L, 40);
  check("Fe + CuSO4 → FeSO4 + Cu", eq(v, /CuSO4.*Fe.*→ FeSO4.*Cu|Fe.*CuSO4.*→ FeSO4.*Cu/), v.events.map((e) => e.eq).join(" ; "));
  check("copper deposited", v.contents.some((c) => c.f === "Cu" && c.deposit)); }
// silver tree: copper in silver nitrate
{ const L = C.lab(); L.add("AgNO3", 50, "mL", 0.1); L.add("Cu", 1, "g"); const v = run(L, 40); check("Cu + 2AgNO3 → Cu(NO3)2 + 2Ag", eq(v, /Cu.*2 AgNO3.*→ Cu\(NO3\)2.*2 Ag|2 AgNO3.*Cu.*→ Cu\(NO3\)2.*2 Ag/), v.events.map((e) => e.eq).join(" ; ")); }
// precipitates
{ const L = C.lab(); L.add("Pb(NO3)2", 20, "mL", 0.1); L.add("KI", 20, "mL", 0.5); const v = run(L, 2);
  check("golden rain: yellow PbI2 precipitate", v.precip.some((p) => p.f === "PbI2"), v.events.map((e) => e.eq).join(" ; ")); }
{ const L = C.lab(); L.add("AgNO3", 20, "mL", 0.1); L.add("NaCl", 1, "g"); const v = run(L, 2); check("AgNO3 + NaCl → AgCl↓ white", v.precip.some((p) => p.f === "AgCl")); }
{ const L = C.lab(); L.add("BaCl2", 20, "mL", 0.1); L.add("Na2SO4", 20, "mL", 0.5); const v = run(L, 2); check("BaCl2 + Na2SO4 → BaSO4↓", v.precip.some((p) => p.f === "BaSO4")); }
{ const L = C.lab(); L.add("CuSO4", 20, "mL", 0.5); L.add("NaOH", 20, "mL", 1); const v = run(L, 2); check("CuSO4 + NaOH → blue Cu(OH)2↓", v.precip.some((p) => p.f === "Cu(OH)2")); }
{ const L = C.lab(); L.add("NaCl", 2, "g"); L.add("H2O", 50, "mL"); L.add("KI", 10, "mL", 0.5); const v = run(L, 2); check("NaCl + KI: no reaction (both soluble)", !v.events.length); }
// carbonate + acid
{ const L = C.lab(); L.add("CH3COOH", 100, "mL", 1); L.add("NaHCO3", 4.2, "g"); const v = run(L, 2); check("baking soda + vinegar → CO2", v.gases.some((g) => g.f === "CO2")); }
{ const L = C.lab(); L.add("HCl", 50, "mL", 2); L.add("CaCO3", 5, "g"); const v = run(L, 3); check("CaCO3 + 2HCl → CaCl2 + H2O + CO2", eq(v, /CaCO3.*2 HCl.*CaCl2.*H2O.*CO2|2 HCl.*CaCO3.*CaCl2.*H2O.*CO2/), v.events.map((e) => e.eq).join(" ; ")); }
// catalyst
{ const L = C.lab(); L.add("H2O2", 50, "mL"); L.add("MnO2", 0.5, "g"); const v = run(L, 2);
  check("H2O2 —MnO2→ H2O + O2 (catalyst kept)", v.gases.some((g) => g.f === "O2") && has(v, "MnO2", "s"), v.events.map((e) => e.eq).join(" ; ")); }
// ammonia complex, halogen displacement, cold pack, magnesium burning
{ const L = C.lab(); L.add("CuSO4", 20, "mL", 0.2); L.add("NH3", 30, "mL", 2); const v = run(L, 2); check("CuSO4 + NH3 → deep-blue complex", v.contents.some((c) => /Cu\(NH3\)4/.test(c.f)), v.colour.hex); }
{ const L = C.lab(); L.add("KI", 50, "mL", 0.5); L.add("Cl", 50, "mL"); const v = run(L, 2); check("Cl2 + 2KI → 2KCl + I2", eq(v, /Cl2.*2 KI.*→ 2 KCl.*I2|2 KI.*Cl2.*→ 2 KCl.*I2/), v.events.map((e) => e.eq).join(" ; ")); }
{ const L = C.lab(); L.add("H2O", 100, "mL"); L.add("NH4NO3", 10, "g"); check("NH4NO3 dissolving cools the water", L.view().T < 20, L.view().T.toFixed(1)); }
{ const L = C.lab(); L.add("Mg", 0.5, "g"); const v = run(L, 25, { heatW: 2000 }); check("Mg burns when heated (MgO, bright light)", has(v, "MgO") && eq(v, /2 Mg.*O2.*→ 2 MgO/), v.events.map((e) => e.eq).join(" ; ")); }
// noble gas, gold: honest no reaction
{ const L = C.lab(); L.add("HCl", 50, "mL", 6); L.add("Au", 1, "g"); L.add("Ar", 10, "mL"); const v = run(L, 5); check("Au and Ar: no reaction", !v.events.length); }
// every one of the 118 elements can be added without errors
{ let bad = 0; for (let z = 1; z <= 118; z++) { const e = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "knowledge", "elements.json"), "utf8")).elements[z - 1];
    try { const L = C.lab(); L.add("H2O", 50, "mL"); L.add(e.sym, 0.1, "g"); L.add("HCl", 20, "mL", 1); run(L, 1); L.view(); } catch (err) { bad++; console.log("   " + e.sym + ": " + err.message); } }
  check("all 118 elements + water + acid run without errors", bad === 0); }
console.log(failed ? failed + " FAILED" : "ALL PASSED");
process.exit(failed ? 1 : 0);
