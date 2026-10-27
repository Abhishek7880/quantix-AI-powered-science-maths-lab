/* Quantix Chemistry Lab — reaction engine (no DOM; also runs in Node for the tests).

   The beaker holds substances {f: formula, mol, state: s | l | aq | g}. Each time step every pair of substances
   (plus the water they are in, and the air when heated) is checked against school-chemistry rules:
     acid + base → salt + water · acid + carbonate → salt + water + CO2 · acid + metal (above H) → salt + H2
     reactive metal + water → hydroxide + H2 · metal + salt of a less reactive metal → displacement
     two dissolved salts → precipitate (solubility rules) · ammonium + base → NH3 · halogen displacement
     burning in air when heated · metal + non-metal when heated · catalysts (MnO2, KI with H2O2) · special cases.
   Products come from ion charges, equations are balanced automatically, reactions run at a rate that depends on
   the reactivity (so bubbles, colours and precipitates appear over time), and their heat changes the temperature.

       Chem.init(elementsFromElementsJson);
       const lab = Chem.lab({ capacity: 250 });
       lab.add("HCl", 50, "mL", 1); lab.add("Mg", 0.5, "g");
       lab.step(0.1, { heatW: 0 }); lab.view()     // contents, T, pH, colour, gases, precipitates, events
*/
(function (root) {
  "use strict";
  const T = (en, hi) => ({ en: en, hi: hi });
  const R_GAS = 24.0;     // L/mol at room temperature
  let EL = {};            // symbol -> element record (elements.json)

  // ------------------------------------------------------------------ ions
  const ION_NAME = {
    OH: T("hydroxide", "हाइड्रॉक्साइड"), Cl: T("chloride", "क्लोराइड"), Br: T("bromide", "ब्रोमाइड"), I: T("iodide", "आयोडाइड"), F: T("fluoride", "फ़्लोराइड"),
    NO3: T("nitrate", "नाइट्रेट"), SO4: T("sulfate", "सल्फ़ेट"), CO3: T("carbonate", "कार्बोनेट"), HCO3: T("hydrogencarbonate", "हाइड्रोजन कार्बोनेट"),
    PO4: T("phosphate", "फ़ॉस्फ़ेट"), CH3COO: T("acetate", "एसीटेट"), S: T("sulfide", "सल्फ़ाइड"), O: T("oxide", "ऑक्साइड"), CrO4: T("chromate", "क्रोमेट"),
    Cr2O7: T("dichromate", "डाइक्रोमेट"), MnO4: T("permanganate", "परमैंगनेट"),
  };
  const ANION = { OH: -1, Cl: -1, Br: -1, I: -1, F: -1, NO3: -1, SO4: -2, CO3: -2, HCO3: -1, PO4: -3, CH3COO: -1, S: -2, O: -2, CrO4: -2, Cr2O7: -2, MnO4: -1 };
  const POLY = new Set(["OH", "NO3", "SO4", "CO3", "HCO3", "PO4", "CH3COO", "CrO4", "Cr2O7", "MnO4", "NH4"]);
  // cation keys: element symbol (main charge) or symbol + charge for metals with two common ions
  const CATION_FIXED = { H: 1, NH4: 1, Fe2: 2, Fe3: 3, Cu: 2, Cu1: 1, Pb: 2, Sn: 2, Hg: 2, Mn: 2, Co: 2, Ni: 2, Cr3: 3, Ag: 1, Au: 3 };
  const ION_COLOUR = { Cu: "#2f7de1", Fe2: "#9fd18c", Fe3: "#c97a24", Ni: "#2fb36a", Co: "#e0709a", Mn: "#f2c9d4", Cr3: "#3f8f5a", MnO4: "#7b1fa2",
    CrO4: "#f2c40c", Cr2O7: "#f08a24" };
  const ION_STRENGTH = { Cu: 0.6, Fe2: 0.35, Fe3: 0.7, Ni: 0.6, Co: 0.6, Mn: 0.15, Cr3: 0.6, MnO4: 4, CrO4: 1.2, Cr2O7: 1.2 };
  // standard electrode potentials (V) for the metal / ion pair formed in water: the reactivity series
  const E0 = { Li: -3.04, Rb: -2.98, Cs: -3.03, K: -2.93, Ba: -2.91, Sr: -2.89, Ca: -2.87, Na: -2.71, Mg: -2.37, Be: -1.85, Al: -1.66, Ti: -1.63,
    Mn: -1.18, Zn: -0.76, Cr: -0.74, Fe: -0.44, Cd: -0.40, Co: -0.28, Ni: -0.25, Sn: -0.14, Pb: -0.13, H: 0, Cu: 0.34, Ag: 0.80, Hg: 0.85,
    Pd: 0.95, Pt: 1.18, Au: 1.50, Sc: -2.03, Y: -2.37, La: -2.38, Fr: -2.9, Ra: -2.8 };
  const METAL_CHARGE = { Fe: "Fe2", Cu: "Cu", Cr: "Cr3", Au: "Au" };   // ion formed when the metal dissolves
  const PRECIP_COLOUR = { "AgCl": "#f4f4f4", "AgBr": "#efe3b0", "AgI": "#f2df6a", "PbI2": "#ffd200", "PbCl2": "#f6f6f6", "PbSO4": "#f8f8f8", "BaSO4": "#fbfbfb",
    "CaSO4": "#f5f5f5", "CaCO3": "#fafafa", "BaCO3": "#fafafa", "Cu(OH)2": "#69a6ff", "Fe(OH)2": "#6f9d68", "Fe(OH)3": "#9c4f22", "Mg(OH)2": "#f5f5f5",
    "Zn(OH)2": "#f5f5f5", "Al(OH)3": "#eef3f7", "Ni(OH)2": "#59b36b", "Co(OH)2": "#c76b98", "Mn(OH)2": "#e9e1d5", "CuCO3": "#3fae9e", "Ag2CrO4": "#a3342a",
    "PbCrO4": "#f5c400", "BaCrO4": "#f2d02a", "CuS": "#151515", "PbS": "#181818", "Ag2S": "#191919", "ZnS": "#f7f7f2", "FeS": "#202020", "Ag2O": "#5a3a22",
    "Ag2CO3": "#f1eccf", "Pb(OH)2": "#f5f5f5", "Ca(OH)2": "#f4f4f4", "MgCO3": "#fafafa", "ZnCO3": "#fafafa", "FeCO3": "#c9c3a6", "Cr(OH)3": "#4e7f52" };
  const FLAME = { Li: "#e3132b", Na: "#ffb000", K: "#c58bff", Rb: "#d36bff", Cs: "#7d5cff", Ca: "#ff6a2a", Sr: "#ff2a2a", Ba: "#9bdc4a", Cu: "#2ad1a5", H: "#a9c8ff", Mg: "#ffffff" };
  const METAL_COLOUR = { Cu: "#c8743b", Au: "#d4af37", Ag: "#dcdcdc", Fe: "#7d7f84", Zn: "#a8b3bd", Mg: "#d4d8dc", Al: "#cfd2d6", Pb: "#6d727a", Na: "#cfcfcf",
    K: "#cfcac2", Li: "#d2d2d2", Ca: "#d6d6ca", Sn: "#bdbdbd", Ni: "#b7ae9c", Hg: "#c7c7c7", Pt: "#e5e4e2", Cr: "#c9ccd2", Mn: "#a9a39b", Co: "#8c95a1",
    S: "#f2d22e", C: "#262626", P: "#b5452f", I: "#3b2a4a", Br: "#8b2a10", Si: "#7a7f86" };

  function cationCharge(k) { if (CATION_FIXED[k]) return CATION_FIXED[k]; const e = EL[k]; return e && e.oxi_main && e.oxi_main.find((x) => x > 0) || 2; }
  const cationSym = (k) => (k === "NH4" ? "NH4" : k.replace(/\d+$/, ""));
  const isMetal = (sym) => { const e = EL[sym]; return !!e && /alkali|alkaline|transition|post|lanthanide|actinide/.test(e.cat); };
  const roman = (n) => ["", "I", "II", "III", "IV", "V", "VI"][n] || String(n);
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

  // formula of the compound of a cation and an anion, e.g. ("Fe3", "SO4") -> Fe2(SO4)3
  function saltFormula(cat, an) {
    const c = cationCharge(cat), a = -ANION[an];
    if (cat === "H" && an === "OH") return "H2O";
    if (cat === "H" && an === "O") return "H2O";
    const l = c * a / gcd(c, a), nc = l / c, na = l / a, cs = cationSym(cat);
    const part = (s, n, poly) => (n === 1 ? s : poly ? "(" + s + ")" + n : s + n);
    if (an === "CH3COO") return (na === 1 ? "CH3COO" : "(CH3COO)" + na) + part(cs, nc, cs === "NH4");
    return part(cs, nc, cs === "NH4") + part(an, na, POLY.has(an));
  }
  function saltName(cat, an, lang) {
    if (cat === "H") return null;
    const cs = cationSym(cat), e = EL[cs];
    let n = cs === "NH4" ? (lang === "hi" ? "अमोनियम" : "ammonium") : e ? (lang === "hi" ? e.name_hi : e.name) : cs;
    const multi = /^(Fe|Cu|Pb|Sn|Hg|Mn|Co|Ni|Cr|Au)$/.test(cs);
    if (multi) n += "(" + roman(cationCharge(cat)) + ")";
    return n + " " + ION_NAME[an][lang === "hi" ? "hi" : "en"];
  }
  // solubility rules (water, room temperature)
  function insoluble(cat, an) {
    const cs = cationSym(cat);
    if (/^(Li|Na|K|Rb|Cs|NH4|H)$/.test(cs)) return false;
    if (an === "NO3" || an === "CH3COO" || an === "MnO4" || an === "HCO3") return false;
    if (an === "Cl" || an === "Br" || an === "I") return /^(Ag|Pb|Hg|Cu1)$/.test(cat === "Cu1" ? "Cu1" : cs);
    if (an === "F") return /^(Ca|Mg|Ba|Sr|Pb)$/.test(cs);
    if (an === "SO4") return /^(Ba|Pb|Sr|Ca)$/.test(cs);
    if (an === "OH") return !/^(Ba|Sr)$/.test(cs);
    if (an === "CrO4") return /^(Ag|Pb|Ba)$/.test(cs);
    return true;   // CO3, PO4, S, O, Cr2O7 with metals that are not group 1
  }

  // ------------------------------------------------------------------ substances
  // kind: acid | base | salt | oxide | water | peroxide | organic | indicator | catalyst | gas | element
  const C = (id, f, en, hi, kind, extra) => Object.assign({ id: id, f: f, name: T(en, hi), kind: kind }, extra || {});
  const COMPOUNDS = [
    C("H2O", "H2O", "Water (distilled)", "पानी (आसुत)", "water", { state: "l", group: "basic" }),
    C("HCl", "HCl", "Hydrochloric acid", "हाइड्रोक्लोरिक अम्ल", "acid", { cat: "H", an: "Cl", state: "aq", conc: 1, hazard: "corrosive", group: "acid" }),
    C("H2SO4", "H2SO4", "Sulfuric acid (dilute)", "सल्फ़्यूरिक अम्ल (तनु)", "acid", { cat: "H", an: "SO4", state: "aq", conc: 1, hazard: "corrosive", group: "acid" }),
    C("HNO3", "HNO3", "Nitric acid", "नाइट्रिक अम्ल", "acid", { cat: "H", an: "NO3", state: "aq", conc: 2, hazard: "corrosive", oxidising: true, group: "acid" }),
    C("CH3COOH", "CH3COOH", "Acetic acid (vinegar)", "एसीटिक अम्ल (सिरका)", "acid", { cat: "H", an: "CH3COO", state: "aq", conc: 1, Ka: 1.8e-5, weak: true, group: "acid" }),
    C("NaOH", "NaOH", "Sodium hydroxide", "सोडियम हाइड्रॉक्साइड", "base", { cat: "Na", an: "OH", state: "aq", conc: 1, hazard: "corrosive", dH: -44.5, group: "base" }),
    C("KOH", "KOH", "Potassium hydroxide", "पोटैशियम हाइड्रॉक्साइड", "base", { cat: "K", an: "OH", state: "aq", conc: 1, hazard: "corrosive", group: "base" }),
    C("Ca(OH)2", "Ca(OH)2", "Limewater (calcium hydroxide)", "चूने का पानी (कैल्शियम हाइड्रॉक्साइड)", "base", { cat: "Ca", an: "OH", state: "aq", conc: 0.02, group: "base" }),
    C("NH3", "NH3", "Ammonia solution", "अमोनिया विलयन", "base", { state: "aq", conc: 1, Kb: 1.8e-5, weak: true, hazard: "irritant", group: "base" }),
    C("NaCl", "NaCl", "Sodium chloride (salt)", "सोडियम क्लोराइड (नमक)", "salt", { cat: "Na", an: "Cl", state: "s", group: "salt" }),
    C("KCl", "KCl", "Potassium chloride", "पोटैशियम क्लोराइड", "salt", { cat: "K", an: "Cl", state: "s", group: "salt" }),
    C("KBr", "KBr", "Potassium bromide", "पोटैशियम ब्रोमाइड", "salt", { cat: "K", an: "Br", state: "aq", conc: 0.5, group: "salt" }),
    C("KI", "KI", "Potassium iodide", "पोटैशियम आयोडाइड", "salt", { cat: "K", an: "I", state: "aq", conc: 0.5, group: "salt" }),
    C("AgNO3", "AgNO3", "Silver nitrate", "सिल्वर नाइट्रेट", "salt", { cat: "Ag", an: "NO3", state: "aq", conc: 0.1, hazard: "stains skin, toxic", group: "salt" }),
    C("Pb(NO3)2", "Pb(NO3)2", "Lead(II) nitrate", "लेड(II) नाइट्रेट", "salt", { cat: "Pb", an: "NO3", state: "aq", conc: 0.1, hazard: "toxic", group: "salt" }),
    C("CuSO4", "CuSO4", "Copper(II) sulfate", "कॉपर(II) सल्फ़ेट (नीला थोथा)", "salt", { cat: "Cu", an: "SO4", state: "aq", conc: 0.5, hazard: "harmful", group: "salt" }),
    C("FeSO4", "FeSO4", "Iron(II) sulfate", "आयरन(II) सल्फ़ेट (हरा कसीस)", "salt", { cat: "Fe2", an: "SO4", state: "aq", conc: 0.5, group: "salt" }),
    C("FeCl3", "FeCl3", "Iron(III) chloride", "आयरन(III) क्लोराइड", "salt", { cat: "Fe3", an: "Cl", state: "aq", conc: 0.5, hazard: "corrosive", group: "salt" }),
    C("ZnSO4", "ZnSO4", "Zinc sulfate", "ज़िंक सल्फ़ेट", "salt", { cat: "Zn", an: "SO4", state: "aq", conc: 0.5, group: "salt" }),
    C("MgSO4", "MgSO4", "Magnesium sulfate (Epsom salt)", "मैग्नीशियम सल्फ़ेट (एप्सम नमक)", "salt", { cat: "Mg", an: "SO4", state: "aq", conc: 0.5, group: "salt" }),
    C("BaCl2", "BaCl2", "Barium chloride", "बेरियम क्लोराइड", "salt", { cat: "Ba", an: "Cl", state: "aq", conc: 0.1, hazard: "toxic", group: "salt" }),
    C("CaCl2", "CaCl2", "Calcium chloride", "कैल्शियम क्लोराइड", "salt", { cat: "Ca", an: "Cl", state: "aq", conc: 0.5, group: "salt" }),
    C("Na2SO4", "Na2SO4", "Sodium sulfate", "सोडियम सल्फ़ेट", "salt", { cat: "Na", an: "SO4", state: "aq", conc: 0.5, group: "salt" }),
    C("Na2CO3", "Na2CO3", "Sodium carbonate (washing soda)", "सोडियम कार्बोनेट (धोने का सोडा)", "salt", { cat: "Na", an: "CO3", state: "aq", conc: 0.5, group: "salt" }),
    C("NaHCO3", "NaHCO3", "Sodium hydrogencarbonate (baking soda)", "सोडियम बाइकार्बोनेट (खाने का सोडा)", "salt", { cat: "Na", an: "HCO3", state: "s", group: "salt" }),
    C("CaCO3", "CaCO3", "Calcium carbonate (marble, chalk)", "कैल्शियम कार्बोनेट (संगमरमर, चॉक)", "salt", { cat: "Ca", an: "CO3", state: "s", group: "salt" }),
    C("NH4Cl", "NH4Cl", "Ammonium chloride", "अमोनियम क्लोराइड (नौसादर)", "salt", { cat: "NH4", an: "Cl", state: "s", group: "salt" }),
    C("NH4NO3", "NH4NO3", "Ammonium nitrate (cold pack)", "अमोनियम नाइट्रेट (कोल्ड पैक)", "salt", { cat: "NH4", an: "NO3", state: "s", dH: 25.7, hazard: "oxidiser", group: "salt" }),
    C("Na2S", "Na2S", "Sodium sulfide", "सोडियम सल्फ़ाइड", "salt", { cat: "Na", an: "S", state: "aq", conc: 0.1, hazard: "toxic gas with acids", group: "salt" }),
    C("K2CrO4", "K2CrO4", "Potassium chromate", "पोटैशियम क्रोमेट", "salt", { cat: "K", an: "CrO4", state: "aq", conc: 0.1, hazard: "toxic, carcinogen", group: "salt" }),
    C("K2Cr2O7", "K2Cr2O7", "Potassium dichromate", "पोटैशियम डाइक्रोमेट", "salt", { cat: "K", an: "Cr2O7", state: "aq", conc: 0.1, hazard: "toxic, oxidiser", group: "salt" }),
    C("KMnO4", "KMnO4", "Potassium permanganate", "पोटैशियम परमैंगनेट (लाल दवा)", "salt", { cat: "K", an: "MnO4", state: "aq", conc: 0.02, hazard: "oxidiser", group: "salt" }),
    C("NiSO4", "NiSO4", "Nickel(II) sulfate", "निकल(II) सल्फ़ेट", "salt", { cat: "Ni", an: "SO4", state: "aq", conc: 0.5, hazard: "harmful", group: "salt" }),
    C("CoCl2", "CoCl2", "Cobalt(II) chloride", "कोबाल्ट(II) क्लोराइड", "salt", { cat: "Co", an: "Cl", state: "aq", conc: 0.5, hazard: "harmful", group: "salt" }),
    C("CaO", "CaO", "Calcium oxide (quicklime)", "कैल्शियम ऑक्साइड (बिना बुझा चूना)", "oxide", { cat: "Ca", an: "O", state: "s", hazard: "corrosive", group: "oxide" }),
    C("MgO", "MgO", "Magnesium oxide", "मैग्नीशियम ऑक्साइड", "oxide", { cat: "Mg", an: "O", state: "s", group: "oxide" }),
    C("CuO", "CuO", "Copper(II) oxide", "कॉपर(II) ऑक्साइड", "oxide", { cat: "Cu", an: "O", state: "s", colour: "#1b1b1b", group: "oxide" }),
    C("Fe2O3", "Fe2O3", "Iron(III) oxide (rust)", "आयरन(III) ऑक्साइड (जंग)", "oxide", { cat: "Fe3", an: "O", state: "s", colour: "#8b3a1a", group: "oxide" }),
    C("MnO2", "MnO2", "Manganese dioxide (catalyst)", "मैंगनीज़ डाइऑक्साइड (उत्प्रेरक)", "catalyst", { state: "s", colour: "#2a2420", group: "oxide" }),
    C("SiO2", "SiO2", "Sand (silicon dioxide)", "रेत (सिलिकॉन डाइऑक्साइड)", "inert", { state: "s", colour: "#e6d3a3", group: "oxide" }),
    C("H2O2", "H2O2", "Hydrogen peroxide (6 %)", "हाइड्रोजन पेरॉक्साइड (6 %)", "peroxide", { state: "aq", conc: 1.8, hazard: "oxidiser", group: "other" }),
    C("C2H5OH", "C2H5OH", "Ethanol", "एथेनॉल", "organic", { state: "l", density: 0.789, hazard: "flammable", ignite: 365, group: "other" }),
    C("C6H12O6", "C6H12O6", "Glucose (sugar)", "ग्लूकोज़ (शर्करा)", "organic", { state: "s", ignite: 500, group: "other" }),
    C("CH4", "CH4", "Methane (natural gas)", "मीथेन (प्राकृतिक गैस)", "organic", { state: "g", hazard: "flammable", ignite: 580, group: "other" }),
    C("CO2", "CO2", "Carbon dioxide", "कार्बन डाइऑक्साइड", "gas", { state: "g", group: "other" }),
    C("phenolphthalein", "C20H14O4", "Phenolphthalein (indicator)", "फ़िनॉल्फ़्थेलिन (सूचक)", "indicator", { state: "aq", ind: "php", group: "ind" }),
    C("litmus", "litmus", "Litmus (indicator)", "लिटमस (सूचक)", "indicator", { state: "aq", ind: "litmus", group: "ind" }),
    C("methylorange", "C14H14N3NaO3S", "Methyl orange (indicator)", "मेथिल ऑरेंज (सूचक)", "indicator", { state: "aq", ind: "mo", group: "ind" }),
    C("universal", "universal", "Universal indicator", "सार्वत्रिक सूचक", "indicator", { state: "aq", ind: "uni", group: "ind" }),
  ];
  const BY_ID = {};
  COMPOUNDS.forEach((c) => { BY_ID[c.id] = c; });
  const DIATOMIC = { H: "H2", N: "N2", O: "O2", F: "F2", Cl: "Cl2", Br: "Br2", I: "I2" };
  const HALOGEN_ORDER = ["F", "Cl", "Br", "I"];

  // ------------------------------------------------------------------ formulas: parse, mass, balance
  function parse(f) {
    const out = {};
    if (f === "litmus" || f === "universal") return { C: 1 };
    const stack = [{}];
    const re = /([A-Z][a-z]?|\(|\)|\d+)/g;
    let m, last = null;
    const toks = [];
    while ((m = re.exec(f))) toks.push(m[1]);
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      if (tk === "(") { stack.push({}); last = null; }
      else if (tk === ")") {
        const grp = stack.pop(), n = /^\d+$/.test(toks[i + 1] || "") ? +toks[++i] : 1;
        const top = stack[stack.length - 1];
        Object.keys(grp).forEach((k) => { top[k] = (top[k] || 0) + grp[k] * n; });
        last = null;
      } else if (/^\d+$/.test(tk)) { if (last) { stack[stack.length - 1][last] += +tk - 1; } }
      else { const top = stack[stack.length - 1]; top[tk] = (top[tk] || 0) + 1; last = tk; }
    }
    Object.assign(out, stack[0]);
    return out;
  }
  function molarMass(f) {
    if (f === "litmus" || f === "universal") return 300;
    const p = parse(f);
    return Object.keys(p).reduce((s, k) => s + (EL[k] ? EL[k].mass : 0) * p[k], 0) || 1;
  }
  // smallest whole-number coefficients (reactants positive, products positive) by exact elimination
  function balance(reac, prod) {
    const species = reac.concat(prod), els = [];
    species.forEach((f) => Object.keys(parse(f)).forEach((e) => { if (!els.includes(e)) els.push(e); }));
    const n = species.length;
    const M = els.map((e) => species.map((f, j) => (parse(f)[e] || 0) * (j < reac.length ? 1 : -1)));
    // fraction-free Gaussian elimination to reduced row echelon form
    const rows = M.map((r) => r.slice());
    const piv = [];
    let r = 0;
    for (let c = 0; c < n && r < rows.length; c++) {
      let p = rows.findIndex((row, i) => i >= r && row[c] !== 0);
      if (p < 0) continue;
      [rows[r], rows[p]] = [rows[p], rows[r]];
      for (let i = 0; i < rows.length; i++) {
        if (i === r || rows[i][c] === 0) continue;
        const a = rows[r][c], b = rows[i][c];
        rows[i] = rows[i].map((v, k) => v * a - rows[r][k] * b);
        const g = rows[i].reduce((s, v) => gcd(s, v), 0) || 1;
        rows[i] = rows[i].map((v) => v / g);
      }
      piv.push(c); r++;
    }
    const free = [];
    for (let c = 0; c < n; c++) if (!piv.includes(c)) free.push(c);
    if (free.length !== 1) return null;   // not a single reaction
    const fc = free[0];
    // x_free = L (lcm of pivots), x_piv = -row[fc] * L / row[piv]
    let L = 1;
    piv.forEach((c, i) => { const a = Math.abs(rows[i][c]); L = L * a / gcd(L, a); });
    const x = new Array(n).fill(0);
    x[fc] = L;
    piv.forEach((c, i) => { x[c] = -rows[i][fc] * L / rows[i][c]; });
    if (x.some((v) => v <= 0)) { if (x.every((v) => v < 0)) x.forEach((v, i) => { x[i] = -v; }); else return null; }
    const g = x.reduce((s, v) => gcd(s, v), 0) || 1;
    return x.map((v) => v / g);
  }
  const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉" };
  const pretty = (f) => (f === "litmus" || f === "universal" ? f : f.replace(/(\d+)/g, (d) => d.split("").map((c) => SUB[c]).join("")));

  // ------------------------------------------------------------------ the lab
  const ROOM = 25;
  function init(elements) { EL = {}; (elements || []).forEach((e) => { EL[e.sym] = e; }); }

  function elementSubstance(sym) {
    const e = EL[sym];
    if (!e) return null;
    const f = DIATOMIC[sym] || sym, Tk = ROOM + 273.15;
    const state = e.bp && e.bp < Tk ? "g" : e.mp && e.mp > Tk ? "s" : e.bp ? "l" : "s";
    return { id: sym, f: f, name: T(e.name, e.name_hi), kind: "element", state: state, el: e };
  }
  function lookup(id) { return BY_ID[id] || elementSubstance(id); }

  function lab(opts) {
    opts = opts || {};
    const L = { capacity: opts.capacity || 250, T: ROOM, items: [], events: [], active: [], gas: {}, flame: null, light: 0, smoke: 0, time: 0, ind: null, stir: false, log: [] };
    const find = (f, state) => L.items.find((x) => x.f === f && (!state || x.state === state));
    function put(f, mol, state, meta) {
      if (mol <= 0) return;
      let it = find(f, state);
      if (!it) { it = Object.assign({ f: f, mol: 0, state: state }, meta || {}); L.items.push(it); }
      it.mol += mol;
      return it;
    }
    function take(f, mol, state) { const it = find(f, state); if (it) { it.mol -= mol; if (it.mol < 1e-12) L.items.splice(L.items.indexOf(it), 1); } }
    const water = () => { const w = find("H2O", "l"); return w ? w.mol * 18.015 : 0; };   // grams ≈ mL
    const volL = () => Math.max(1e-6, water() / 1000);
    function meta(sub) { return { el: sub.el, kind: sub.kind, cat: sub.cat, an: sub.an, id: sub.id, weak: sub.weak, Ka: sub.Ka, Kb: sub.Kb, oxidising: sub.oxidising, ind: sub.ind, colour: sub.colour, ignite: sub.ignite }; }

    // add a substance. unit: g | mg | mol | mL (solutions: conc mol/L; pure liquids: density) | drops
    function add(id, amount, unit, conc) {
      const sub = lookup(id);
      if (!sub) return null;
      amount = Math.max(0, +amount || 0);
      const M = molarMass(sub.f);
      let mol = 0, waterMol = 0;
      if (sub.kind === "indicator") { L.ind = sub.ind; put(sub.f, 1e-5, "aq", meta(sub)); waterMol = (unit === "mL" ? amount : 0.25) / 18.015; put("H2O", waterMol, "l", { kind: "water" }); log(sub, amount, unit); return sub; }
      if (sub.f === "H2O") { put("H2O", (unit === "g" || unit === "mL" ? amount : unit === "mol" ? amount * 18.015 : amount) / 18.015, "l", { kind: "water" }); log(sub, amount, unit); return sub; }
      if (unit === "mol") mol = amount;
      else if (unit === "mg") mol = amount / 1000 / M;
      else if (unit === "g") mol = amount / M;
      else if (unit === "mL" || unit === "drops") {
        const mL = unit === "drops" ? amount * 0.05 : amount;
        if (sub.state === "aq") { const c = conc != null ? +conc : sub.conc || 1; mol = c * mL / 1000; waterMol = Math.max(0, mL - mol * M / 1.5) / 18.015; }
        else if (sub.state === "g") mol = mL / 1000 / R_GAS;
        else mol = mL * (sub.density || (sub.el && sub.el.density) || 1) / M;
      }
      if (waterMol) put("H2O", waterMol, "l", { kind: "water" });
      const state = sub.state === "aq" ? "aq" : sub.state;
      put(sub.f, mol, state, meta(sub));
      dissolveAll();
      if (sub.dH && water() > 0 && sub.state === "s" || sub.dH && water() > 0 && unit !== "mL" && unit !== "drops") heat(-sub.dH * mol * 1000);    // dissolving solid NaOH warms, NH4NO3 cools
      log(sub, amount, unit, conc);
      return sub;
    }
    function log(sub, amount, unit, conc) { L.log.push({ id: sub.id, amount: amount, unit: unit, conc: conc }); }
    // soluble solids dissolve when there is water; insoluble ones stay as solids
    function dissolveAll() {
      if (water() <= 0) return;
      L.items.forEach((it) => {
        if (it.state !== "s" || !it.cat || !it.an) return;
        if (it.kind === "salt" || it.kind === "base") {
          if (!insoluble(it.cat, it.an)) it.state = "aq";
        }
      });
      merge();
    }
    function merge() {
      const out = [];
      L.items.forEach((it) => { const o = out.find((x) => x.f === it.f && x.state === it.state); if (o) o.mol += it.mol; else out.push(it); });
      L.items = out.filter((x) => x.mol > 1e-12);
    }
    // heat in joules (positive warms)
    function heatCap() { return water() * 4.18 + L.items.filter((x) => x.f !== "H2O").reduce((s, x) => s + x.mol * molarMass(x.f) * 0.9, 0) + 60; }
    function heat(J) { L.T += J / heatCap(); }

    // ------------------------------------------------------------------ reaction rules
    // each rule returns null or { key, reac: [[formula, state]...], prod: [[formula, state, extra]...], rate (1/s), dH (kJ per mol of the
    // first reactant's coefficient-1 unit), type, obs (what you see), sound, flame, light, smoke, gasColour }
    const aqOr = (it) => it.state === "aq" || it.state === "l";
    function ruleFor(a, b, wet) {
      const pick = (fn) => fn(a, b) || fn(b, a);
      return pick((x, y) => {
        const X = x.kind, Y = y.kind;
        // 1. neutralisation: acid + hydroxide / ammonia
        if (X === "acid" && wet && Y === "base" && y.an === "OH") return dbl(x, y, [[saltFormula(y.cat, x.an), y.cat, x.an], ["H2O", "l"]], { type: "neutral", rate: 6, dH: -57, perWater: true });
        if (X === "acid" && wet && y.f === "NH3") { const s = saltFormula("NH4", x.an); return mk(x, y, [[s, "aq", { kind: "salt", cat: "NH4", an: x.an }]], { type: "neutral", rate: 6, dH: -52 }); }
        // 2. acid + carbonate / hydrogencarbonate -> CO2
        if (X === "acid" && (y.an === "CO3" || y.an === "HCO3")) return dbl(x, y, [[saltFormula(y.cat, x.an), y.cat, x.an], ["H2O", "l"], ["CO2", "g"]], { type: "carbonate", rate: x.weak ? 0.6 : y.state === "s" ? 0.5 : 4, dH: -12, gas: "CO2" });
        // 3. acid + metal oxide
        if (X === "acid" && y.an === "O" && y.cat) return dbl(x, y, [[saltFormula(y.cat, x.an), y.cat, x.an], ["H2O", "l"]], { type: "oxide", rate: 0.4 * (L.T > 50 ? 3 : 1), dH: -60 });
        // 4. acid + sulfide -> H2S
        if (X === "acid" && y.an === "S") return dbl(x, y, [[saltFormula(y.cat, x.an), y.cat, x.an], ["H2S", "g"]], { type: "gas", rate: 3, dH: -20, gas: "H2S" });
        // 5. metals with acids
        if (X === "acid" && y.kind === "element" && isMetal(y.f) && E0[y.f] != null) {
          const ion = METAL_CHARGE[y.f] || y.f;
          if (x.oxidising && y.f !== "Au" && y.f !== "Pt") return mk(x, y, [[saltFormula(ion === "Fe2" ? "Fe3" : ion, "NO3"), "aq", { kind: "salt", cat: ion === "Fe2" ? "Fe3" : ion, an: "NO3" }], ["NO2", "g"], ["H2O", "l"]],
            { type: "oxacid", rate: 0.25, dH: -150, gas: "NO2", gasColour: "#a5471b" });
          if (E0[y.f] < -0.05) return mk(x, y, [[saltFormula(ion, x.an), insoluble(ion, x.an) ? "s" : "aq", { kind: "salt", cat: ion, an: x.an }], ["H2", "g"]],
            { type: "metalacid", rate: rateMetal(y.f) * (x.weak ? 0.15 : 1), dH: -96 * cationCharge(ion) * Math.abs(E0[y.f]) * 0.95, gas: "H2", flame: E0[y.f] < -2.8 ? y.f : null });
        }
        // 6. reactive metals with water
        if (X === "water" && wet && y.kind === "element" && isMetal(y.f) && E0[y.f] != null && (E0[y.f] <= -2.5 || (y.f === "Mg" && L.T > 70) || (y.f === "Ca"))) {
          const ion = y.f, hyd = saltFormula(ion, "OH");
          return mk(y, x, [[hyd, insoluble(ion, "OH") ? "s" : "aq", { kind: "base", cat: ion, an: "OH" }], ["H2", "g"]],
            { type: "metalwater", rate: { K: 3, Rb: 5, Cs: 8, Na: 1.2, Li: 0.35, Ba: 0.8, Sr: 0.6, Ca: 0.3, Mg: 0.03 }[y.f] || 0.5,
              dH: -96 * cationCharge(ion) * (Math.abs(E0[y.f]) - 0.83) * 0.95, gas: "H2", flame: /^(K|Rb|Cs)$/.test(y.f) ? y.f : y.f === "Na" && L.T > 60 ? "Na" : null, sound: /^(K|Rb|Cs)$/.test(y.f) ? "pop" : "fizz" });
        }
        // 7. basic oxides with water
        if (X === "water" && wet && y.an === "O" && /^(Ca|Ba|Sr|Na|K|Li|Mg)$/.test(cationSym(y.cat || ""))) {
          const hyd = saltFormula(y.cat, "OH");
          if (y.cat === "Mg" && L.T < 60) return null;
          return mk(y, x, [[hyd, insoluble(y.cat, "OH") ? "s" : "aq", { kind: "base", cat: y.cat, an: "OH" }]], { type: "slaking", rate: 0.8, dH: -65 });
        }
        // 8. metal displacement from a dissolved salt
        if (X === "element" && isMetal(x.f) && E0[x.f] != null && y.state === "aq" && y.cat && y.cat !== "H" && y.cat !== "NH4" && E0[cationSym(y.cat)] != null && x.state !== "aq") {
          const ys = cationSym(y.cat), dE = E0[ys] - E0[x.f];
          if (dE > 0.05 && E0[x.f] > -2.5) {
            const ion = METAL_CHARGE[x.f] || x.f;
            return mk(x, y, [[saltFormula(ion, y.an), insoluble(ion, y.an) ? "s" : "aq", { kind: "salt", cat: ion, an: y.an }], [ys, "s", { kind: "element", deposit: true }]],
              { type: "displace", rate: 0.12 * Math.min(4, 1 + dE), dH: -96 * cationCharge(y.cat) * dE * 0.9, deposit: ys });
          }
        }
        // 9. precipitation: two dissolved ionic compounds swap partners
        if (wet && x.state === "aq" && y.state === "aq" && x.cat && y.cat && x.an && y.an && x.cat !== "H" && y.cat !== "H" && !(x.an === "OH" && y.an === "OH")) {
          const p1 = insoluble(x.cat, y.an), p2 = insoluble(y.cat, x.an);
          if ((p1 || p2) && !(x.cat === y.cat || x.an === y.an)) {
            if (y.cat === "NH4" && x.an === "OH") return null;
            return mk(x, y, [[saltFormula(x.cat, y.an), p1 ? "s" : "aq", { kind: "salt", cat: x.cat, an: y.an }], [saltFormula(y.cat, x.an), p2 ? "s" : "aq", { kind: "salt", cat: y.cat, an: x.an }]],
              { type: "precip", rate: 8, dH: -20 });
          }
        }
        // 10. ammonium salt + strong base -> ammonia gas
        if (x.cat === "NH4" && y.an === "OH" && y.cat !== "NH4" && (x.state === "aq" || L.T > 50)) {
          return mk(x, y, [[saltFormula(y.cat, x.an), insoluble(y.cat, x.an) ? "s" : "aq", { kind: "salt", cat: y.cat, an: x.an }], ["NH3", "g"], ["H2O", "l"]], { type: "ammonia", rate: L.T > 50 ? 1 : 0.15, dH: 10, gas: "NH3" });
        }
        // 11. halogen displaces a less reactive halide
        if (X === "element" && /^(F|Cl|Br|I)$/.test(elSym(x)) && y.an && /^(Cl|Br|I)$/.test(y.an) && y.state === "aq" &&
          HALOGEN_ORDER.indexOf(elSym(x)) < HALOGEN_ORDER.indexOf(y.an)) {
          return mk(x, y, [[saltFormula(y.cat, elSym(x)), "aq", { kind: "salt", cat: y.cat, an: elSym(x) }], [y.an + "2", y.an === "I" ? "aq" : "aq", { kind: "element", halogenAq: y.an }]], { type: "halogen", rate: 2, dH: -40 });
        }
        // 12. catalysed decomposition of hydrogen peroxide
        if (X === "peroxide" && (y.f === "MnO2" || y.an === "I" || y.cat === "Fe3")) {
          return { key: "H2O2|" + y.f, reac: [["H2O2", x.state]], prod: [["H2O", "l"], ["O2", "g"]], cat: y.f, rate: y.f === "MnO2" ? 1.2 : 0.6, dH: -98, type: "catalyst", gas: "O2", foam: true };
        }
        // 13. copper(II) + ammonia: blue precipitate, then the deep-blue complex in excess
        if (x.cat === "Cu" && x.state === "aq" && y.f === "NH3") return mk(x, y, [["[Cu(NH3)4]" + x.an, "aq", { kind: "complex", colourHex: "#1b3ee0", strength: 1.6, an: x.an }]], { type: "complex", rate: 3, dH: -30, ratio: 4 });
        // 14. permanganate oxidises hydrogen peroxide in acid (decolourises)
        if (x.an === "MnO4" && y.kind === "peroxide" && L.items.some((i) => i.kind === "acid")) {
          return { key: "MnO4|H2O2", reac: [[x.f, "aq"], ["H2O2", y.state]], prod: [["MnO2", "s"], ["O2", "g"], ["H2O", "l"]], rate: 2, dH: -150, type: "redox", gas: "O2", coeffHint: true };
        }
        // 15. ammonia gas meets hydrogen chloride gas
        if (x.f === "NH3" && x.state === "g" && y.f === "HCl" && y.state === "g") return mk(x, y, [["NH4Cl", "s", { kind: "salt", cat: "NH4", an: "Cl" }]], { type: "smoke", rate: 5, dH: -176, smoke: true });
        // 16. hot, dry: metal + non-metal (halogen or sulfur), thermite, iron + sulfur
        if (!wet && L.T > 250 && X === "element" && isMetal(x.f) && y.kind === "element") {
          const ys = elSym(y);
          if (/^(F|Cl|Br|I)$/.test(ys)) return mk(x, y, [[saltFormula(METAL_CHARGE[x.f] === "Fe2" ? "Fe3" : (METAL_CHARGE[x.f] || x.f), ys), "s", { kind: "salt", cat: x.f, an: ys }]], { type: "synthesis", rate: 2, dH: -400, light: 0.6, flame: x.f });
          if (ys === "S") return mk(x, y, [[saltFormula(METAL_CHARGE[x.f] || x.f, "S"), "s", { kind: "salt", cat: METAL_CHARGE[x.f] || x.f, an: "S" }]], { type: "synthesis", rate: 0.8, dH: -100, light: 0.4 });
        }
        if (!wet && L.T > 600 && x.f === "Al" && y.f === "Fe2O3") return mk(x, y, [["Al2O3", "s", { kind: "oxide" }], ["Fe", "l", { kind: "element" }]], { type: "thermite", rate: 3, dH: -425, light: 1, flame: "Fe", sparks: true });
        return null;
      });
    }
    function elSym(it) { return it.el ? it.el.sym : String(it.f).replace(/2$/, ""); }
    function rateMetal(sym) { return { K: 6, Na: 4, Li: 2, Ca: 2, Ba: 3, Sr: 2.5, Mg: 0.8, Al: 0.12, Zn: 0.25, Fe: 0.06, Sn: 0.03, Pb: 0.01, Ni: 0.03, Co: 0.03, Mn: 0.4, Cr: 0.05, Cd: 0.05 }[sym] || 0.2; }
    // reaction where y's cation pairs with x's anion etc. (products given as [formula, cat, an] for salts)
    function dbl(x, y, prods, o) {
      return mk(x, y, prods.map((p) => (p.length === 3 && typeof p[1] === "string" && ANION[p[2]] != null ? [p[0], insoluble(p[1], p[2]) ? "s" : "aq", { kind: "salt", cat: p[1], an: p[2] }] : p)), o);
    }
    function mk(x, y, prods, o) {
      return Object.assign({ key: [x.f, y.f].sort().join("|") + "|" + (o.type || ""), reac: [[x.f, x.state], [y.f, y.state]], prod: prods }, o);
    }

    // burning in air when heated (dry substances, or gases)
    function burnRule(x) {
      const tTh = x.ignite || (x.kind === "element" ? { Mg: 470, Fe: 700, Na: 120, K: 70, Li: 180, Ca: 300, Al: 800, Zn: 460, Cu: 700, C: 450, S: 230, P: 240, H2: 500 }[x.f] : null);
      if (!tTh || L.T < tTh || x.state === "l" && x.kind === "element") return null;   // molten metal (e.g. thermite iron) is not re-burnt
      if (x.kind === "organic") {
        const p = parse(x.f), prods = [["CO2", "g"], ["H2O", "g"]];
        void p;
        return { key: "burn|" + x.f, reac: [[x.f, x.state], ["O2", "air"]], prod: prods, rate: 0.5, dH: { C2H5OH: -1367, CH4: -890, C6H12O6: -2803 }[x.f] || -1000, type: "combustion", flame: "H", light: 0.4 };
      }
      if (x.kind !== "element") return null;
      const s = elSym(x);
      if (s === "C") return { key: "burn|C", reac: [["C", x.state], ["O2", "air"]], prod: [["CO2", "g"]], rate: 0.1, dH: -394, type: "combustion", light: 0.3, flame: "C" };
      if (s === "S") return { key: "burn|S", reac: [["S", x.state], ["O2", "air"]], prod: [["SO2", "g"]], rate: 0.2, dH: -297, type: "combustion", flame: "S", gas: "SO2" };
      if (s === "P") return { key: "burn|P", reac: [["P", x.state], ["O2", "air"]], prod: [["P4O10", "s"]], rate: 0.6, dH: -746, type: "combustion", light: 0.6, smoke: true };
      if (s === "H") return { key: "burn|H2", reac: [["H2", x.state], ["O2", "air"]], prod: [["H2O", "g"]], rate: 5, dH: -286, type: "combustion", flame: "H", sound: "pop" };
      if (isMetal(s)) {
        const ion = s === "Fe" ? "Fe3" : METAL_CHARGE[s] || s;
        return { key: "burn|" + s, reac: [[s, x.state], ["O2", "air"]], prod: [[saltFormula(ion, "O"), "s", { kind: "oxide", cat: ion, an: "O" }]], rate: s === "Mg" ? 0.6 : 0.2,
          dH: { Mg: -601, Fe: -412, Na: -207, K: -181, Al: -838, Ca: -635, Zn: -350, Cu: -157, Li: -299 }[s] || -300, type: "combustion", light: s === "Mg" ? 1 : 0.4, flame: s, sparks: s === "Fe" };
      }
      return null;
    }

    // apply up to `ext` of reaction r (ext in "mol of the balanced reaction")
    function apply(r, coeffs, ext) {
      r.reac.forEach(([f, st], i) => { if (st !== "air") take(f, coeffs[i] * ext, st); });
      r.prod.forEach(([f, st, m], i) => {
        const c = coeffs[r.reac.length + i] * ext;
        if (st === "g") { L.gas[f] = (L.gas[f] || 0) + c; return; }      // gases leave the beaker as bubbles
        const it = put(f, c, st, m);
        if (m && m.halogenAq) it.colourHex = m.halogenAq === "I" ? "#9a5a14" : "#c96a1e";
        if (m && m.colourHex) { it.colourHex = m.colourHex; it.strength = m.strength; }
      });
      // dH is per mole of the reactant with the smallest coefficient (the metal, the carbonate, the fuel...), or per mole of water formed
      const ref = Math.min.apply(null, r.reac.map(([, st], i) => (st === "air" ? Infinity : coeffs[i])));
      heat(-r.dH * 1000 * ext * (r.perWater ? coeffs[coeffs.length - 1] : ref));
    }
    function equation(r, coeffs, lang) {
      const st = { s: "(s)", l: "(l)", aq: "(aq)", g: "(g)", air: "(g)" };
      const side = (list, off) => list.map(([f, s], i) => { const c = coeffs[off + i]; return (c === 1 ? "" : c + " ") + pretty(f === "O2" && s === "air" ? "O2" : f) + " " + (st[s] || ""); }).join(" + ");
      void lang;
      return side(r.reac, 0) + (r.cat ? " —" + pretty(r.cat) + "→ " : " → ") + side(r.prod.map((p) => [p[0], p[1]]), r.reac.length);
    }

    function step(dt, ctl) {
      ctl = ctl || {};
      L.time += dt;
      // burner and cooling: Newton's law towards room temperature
      const C = heatCap();
      L.T += ((ctl.heatW || 0) * dt) / C;
      L.T += (ROOM - L.T) * (1 - Math.exp(-dt * (water() > 0 ? 0.004 : 0.02)));
      // boiling: water above 100 °C turns to steam
      if (L.T > 100 && water() > 0) { const excess = (L.T - 100) * C; const vap = Math.min(water(), excess / 2260); take("H2O", vap / 18.015, "l"); L.gas.H2O = (L.gas.H2O || 0) + vap / 18.015; L.T = 100; }
      const wet = water() > 0.5;
      const decay = Math.exp(-dt * 1.5);
      Object.keys(L.gas).forEach((k) => { L.gas[k] *= decay; if (L.gas[k] < 1e-7) delete L.gas[k]; });
      L.flame = null; L.light *= decay; L.smoke *= Math.exp(-dt * 0.4);
      const fired = new Set();
      for (let pass = 0; pass < 4; pass++) {
        const items = L.items.slice();
        const cand = [];
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) { const r = ruleFor(items[i], items[j], wet); if (r) cand.push(r); }
          const b = !wet || items[i].state === "g" ? burnRule(items[i]) : null; if (b) cand.push(b);
        }
        if (!cand.length) break;
        let any = false;
        cand.forEach((r) => {
          if (fired.has(r.key)) return;
          const coeffs = r.coeffHint ? [2, 3, 2, 3, 2].slice(0, r.reac.length + r.prod.length) : balance(r.reac.map((x) => x[0]), r.prod.map((x) => x[0]));
          if (!coeffs) return;
          const amounts = r.reac.map(([f, st], i) => (st === "air" ? Infinity : ((find(f, st) || { mol: 0 }).mol) / coeffs[i]));
          const maxExt = Math.min.apply(null, amounts);
          if (!(maxExt > 1e-12)) return;
          const stir = ctl.stir ? 1.6 : 1, hot = Math.pow(2, (L.T - ROOM) / 10);    // rate doubles every 10 °C
          let ext = maxExt * (1 - Math.exp(-r.rate * stir * Math.min(hot, 16) * dt));
          if (maxExt - ext < 1e-9 || r.rate > 5) ext = Math.min(maxExt, Math.max(ext, maxExt * Math.min(1, r.rate * dt)));
          apply(r, coeffs, ext);
          fired.add(r.key); any = true;
          let ev = L.events.find((e) => e.key === r.key);
          if (!ev) { ev = { key: r.key, r: r, coeffs: coeffs, start: L.time, ext: 0, eq: equation(r, coeffs) }; L.events.push(ev); }
          ev.ext += ext; ev.last = L.time; ev.rateNow = ext / dt;
          if (r.flame && ext / dt > 1e-5) L.flame = r.flame;
          if (r.light) L.light = Math.max(L.light, r.light);
          if (r.smoke) L.smoke = Math.min(1, L.smoke + ext * 50);
        });
        merge();
        if (!any) break;
      }
      dissolveAll();
    }

    // ------------------------------------------------------------------ what you see
    function pH() {
      const V = volL();
      if (water() <= 0.5) return null;
      let H = 0, OH = 0, weakA = [], weakB = [];
      L.items.forEach((it) => {
        if (it.state !== "aq") return;
        const c = it.mol;
        if (it.kind === "acid") { if (it.weak) weakA.push([c / V, it.Ka]); else H += c * (it.an === "SO4" ? 2 : 1); }
        else if (it.kind === "base" && it.an === "OH") OH += c * cationCharge(it.cat);
        else if (it.f === "NH3") weakB.push([c / V, 1.8e-5]);
        else if (it.an === "CO3" && it.cat && it.cat !== "H") weakB.push([c / V, 2.1e-4]);
        else if (it.an === "HCO3") weakB.push([c / V, 2.3e-8]);
        else if (it.an === "CH3COO" && it.cat !== "H") weakB.push([c / V, 5.6e-10]);
        else if (it.cat === "NH4") weakA.push([c / V, 5.6e-10]);
        else if (/^(Fe3|Al|Cr3)$/.test(it.cat || "")) weakA.push([c / V, 6e-3]);
        else if (/^(Cu|Zn|Fe2)$/.test(it.cat || "")) weakA.push([c / V, 1e-7]);
      });
      const net = (H - OH) / V;
      if (Math.abs(net) > 1e-6) return net > 0 ? -Math.log10(net) : 14 + Math.log10(-net);
      const a = weakA.reduce((s, [c, k]) => s + Math.sqrt(k * c), 0), b = weakB.reduce((s, [c, k]) => s + Math.sqrt(k * c), 0);
      if (a > b && a > 1e-7) return -Math.log10(a - b + 1e-7);
      if (b > a && b > 1e-7) return 14 + Math.log10(b - a + 1e-7);
      return 7;
    }
    function indicatorColour(p) {
      if (p == null || !L.ind) return null;
      switch (L.ind) {
        case "php": return p < 8.2 ? null : ["#ff2fa8", Math.min(1, (p - 8.2) / 1.8) * 0.85];
        case "litmus": return p < 5 ? ["#e0303a", 0.6] : p > 8 ? ["#3150d6", 0.6] : ["#7d3fa8", 0.5];
        case "mo": return p < 3.1 ? ["#e8312a", 0.6] : p > 4.4 ? ["#f2c81c", 0.55] : ["#f07a1c", 0.6];
        default: {
          const stops = [[1, "#d7191c"], [3, "#f46d43"], [5, "#fdae61"], [6, "#fee08b"], [7, "#66bd63"], [8, "#1a9850"], [10, "#3288bd"], [12, "#5e4fa2"], [14, "#542788"]];
          let c = stops[0][1]; stops.forEach(([v, col]) => { if (p >= v - 0.5) c = col; });
          return [c, 0.6];
        }
      }
    }
    function liquidColour() {
      const V = volL();
      let r = 0, g = 0, b = 0, w = 0;
      const addCol = (hex, weight) => { const n = parseInt(hex.slice(1), 16); r += (n >> 16 & 255) * weight; g += (n >> 8 & 255) * weight; b += (n & 255) * weight; w += weight; };
      L.items.forEach((it) => {
        if (it.state !== "aq") return;
        const c = it.mol / V;
        if (it.colourHex) addCol(it.colourHex, Math.min(3, c * 4 * (it.strength || 1)));
        [it.cat, it.an].forEach((k) => { if (k && ION_COLOUR[k]) addCol(ION_COLOUR[k], Math.min(3, c * 4 * (ION_STRENGTH[k] || 0.5) * (k === it.an ? 1 : 1))); });
      });
      const ic = indicatorColour(pH());
      if (ic) addCol(ic[0], ic[1] * 2.5);
      if (!w) return { hex: "#cfe8ff", a: 0.25 };
      const hx = (v) => Math.round(Math.min(255, v / w)).toString(16).padStart(2, "0");
      return { hex: "#" + hx(r) + hx(g) + hx(b), a: Math.min(0.92, 0.3 + w * 0.25) };
    }
    function view(lang) {
      lang = lang === "hi" ? "hi" : "en";
      const contents = L.items.map((it) => {
        const M = molarMass(it.f);
        const name = it.cat && it.an && it.kind !== "acid" && !(it.cat === "H") ? saltName(it.cat, it.an, lang) : (lookup(it.id || it.f) || elementSubstance(it.f.replace(/2$/, "")) || {}).name;
        return { f: it.f, fp: pretty(it.f), state: it.state, mol: it.mol, g: it.mol * M, name: name ? (name[lang] || name.en || name) : it.f, deposit: !!it.deposit,
          colour: it.state === "s" ? (PRECIP_COLOUR[it.f] || it.colour || METAL_COLOUR[it.f] || "#e8e8e8") : null };
      });
      const events = L.events.map((e) => ({ eq: e.eq, type: e.r.type, active: L.time - e.last < 0.6 && e.rateNow > 1e-7, start: e.start, extent: e.ext, gas: e.r.gas || null, catalyst: e.r.cat || null }));
      const gases = Object.keys(L.gas).map((f) => ({ f: f, fp: pretty(f), rate: L.gas[f] * 1.5, colour: { NO2: "#a5471b", Cl2: "#bcd64a", Br2: "#b5531c", I2: "#7a3fa0", H2O: "#ffffff" }[f] || null }));
      return { T: L.T, pH: pH(), water: water(), capacity: L.capacity, volume: water() + L.items.filter((x) => x.state === "l" && x.f !== "H2O").reduce((s, x) => s + x.mol * molarMass(x.f) / 0.9, 0),
        colour: liquidColour(), contents: contents, events: events, gases: gases, flame: L.flame ? FLAME[L.flame] || "#ffb347" : null, light: L.light, smoke: L.smoke,
        precip: contents.filter((c) => c.state === "s").map((c) => ({ f: c.f, colour: c.colour, mol: c.mol, deposit: c.deposit, metal: !!METAL_COLOUR[c.f] })) };
    }
    function empty() { L.items = []; L.events = []; L.gas = {}; L.T = ROOM; L.ind = null; L.log = []; L.light = 0; L.smoke = 0; L.flame = null; }
    return { add: add, step: step, view: view, empty: empty, get T() { return L.T; }, set T(v) { L.T = v; }, get items() { return L.items; }, get events() { return L.events; }, L: L };
  }

  const api = { init: init, lab: lab, COMPOUNDS: COMPOUNDS, lookup: lookup, parse: parse, balance: balance, molarMass: molarMass, saltFormula: saltFormula,
    insoluble: insoluble, pretty: pretty, E0: E0, METAL_COLOUR: METAL_COLOUR, FLAME: FLAME, isMetal: isMetal, elementSubstance: elementSubstance };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChemEngine = api;
})(typeof self !== "undefined" ? self : this);
