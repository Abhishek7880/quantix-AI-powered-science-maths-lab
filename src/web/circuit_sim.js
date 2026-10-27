/* Quantix Circuit Lab — the simulation engine (no DOM; also runs in Node for the tests).

   A circuit is { parts: [{id, type, x, y, rot, label, p: {param: value}}], wires: [{x1, y1, x2, y2}] } on a grid.
   Pins and wire ends that meet on the same grid point (or touch a wire) are one electrical node.

   Method: modified nodal analysis with every source in Norton form (a source + its internal resistance), so the
   unknowns are just the node voltages. Each time step solves G·v = i; capacitors and inductors use backward-Euler
   companion models; diodes, LEDs, transistors, MOSFETs and op-amps are non-linear and solved by Newton–Raphson with
   SPICE-style junction voltage limiting. ICs (555, logic gates), relays, fuses and motors change state between steps.

       const sim = CircuitSim.create(circuit, { damage: true });
       sim.step(1e-5);                        // advance 10 µs
       sim.partInfo("p3")                     // { rows: [[label, value, unit]], v, i, p, glow, burnt, ... }
       sim.update(circuit)                    // after an edit: rebuild, keeping capacitor charge, motor speed, ...
*/
(function (root) {
  "use strict";

  const VT = 0.025852;          // thermal voltage at 27 °C
  const GMIN = 1e-9;            // tiny conductance from every node to ground: no floating node can break the solve
  const OPEN = 1e-12;           // conductance of an open switch / burnt part
  const T = (en, hi) => ({ en: en, hi: hi });

  // ------------------------------------------------------------------ catalogue
  // pins: grid offsets for rotation 0 (x right, y down). params: k, label, unit, v (default), live (changes take
  // effect while running without a rebuild), choices ([value, label]) for selects.
  const P = (k, en, hi, unit, v, extra) => Object.assign({ k: k, label: T(en, hi), unit: unit, v: v }, extra || {});
  const LED_COLOURS = [["red", T("Red", "लाल")], ["orange", T("Orange", "नारंगी")], ["yellow", T("Yellow", "पीला")],
    ["green", T("Green", "हरा")], ["blue", T("Blue", "नीला")], ["white", T("White", "सफ़ेद")], ["ir", T("Infra-red", "अवरक्त")]];
  const LED_VF = { red: 1.8, orange: 2.0, yellow: 2.1, green: 2.2, blue: 3.0, white: 3.1, ir: 1.3 };
  const LED_RGB = { red: "#ff3030", orange: "#ff8a1c", yellow: "#ffe234", green: "#36e05a", blue: "#3b7bff", white: "#f4f8ff", ir: "#9a3050" };
  const WAVES = [["sine", T("Sine", "साइन")], ["square", T("Square", "वर्ग")], ["triangle", T("Triangle", "त्रिभुज")], ["saw", T("Sawtooth", "आरी-दाँत")]];
  const CATS = [
    ["sources", T("Power & ground", "पावर और ग्राउंड")], ["passive", T("Passive parts", "निष्क्रिय घटक")],
    ["semi", T("Diodes & transistors", "डायोड और ट्रांज़िस्टर")], ["ic", T("ICs & logic", "आईसी और लॉजिक")],
    ["switch", T("Switches & protection", "स्विच और सुरक्षा")], ["out", T("Outputs & meters", "आउटपुट और मीटर")],
    ["sensor", T("Sensors", "सेंसर")],
  ];
  const TWO = [[-2, 0], [2, 0]];
  const VERT = [[0, -2], [0, 2]];
  const PARTS = {
    battery: { cat: "sources", icon: "🔋", prefix: "B", name: T("Battery", "बैटरी"), pins: VERT, pinNames: ["+", "−"],
      params: [P("V", "Voltage", "वोल्टेज", "V", 9, { min: 0, max: 1000 }), P("r", "Internal resistance", "आंतरिक प्रतिरोध", "Ω", 0.1, { min: 0.001, max: 1000 })],
      blurb: T("DC cell or battery pack: a voltage with a small internal resistance.", "डीसी सेल/बैटरी: वोल्टेज और छोटा आंतरिक प्रतिरोध।") },
    dcsupply: { cat: "sources", icon: "⚡", prefix: "PS", name: T("DC power supply", "डीसी पावर सप्लाई"), pins: VERT, pinNames: ["+", "−"],
      params: [P("V", "Voltage", "वोल्टेज", "V", 12, { min: 0, max: 1000, live: true }), P("Ilim", "Current limit", "धारा सीमा", "A", 1, { min: 0.001, max: 100, live: true })],
      blurb: T("Bench supply: constant voltage until the current limit, then constant current (CV / CC).", "बेंच सप्लाई: सीमा तक स्थिर वोल्टेज, फिर स्थिर धारा (CV/CC)।") },
    acsource: { cat: "sources", icon: "∿", prefix: "V", name: T("AC source / function generator", "एसी स्रोत / फ़ंक्शन जनरेटर"), pins: VERT, pinNames: ["+", "−"],
      params: [P("wave", "Waveform", "तरंग", "", "sine", { choices: WAVES, live: true }), P("Vp", "Peak voltage", "शिखर वोल्टेज", "V", 10, { min: 0, max: 1000, live: true }),
        P("f", "Frequency", "आवृत्ति", "Hz", 50, { min: 0.01, max: 1e6, live: true }), P("off", "DC offset", "डीसी ऑफ़सेट", "V", 0, { min: -1000, max: 1000, live: true }),
        P("ph", "Phase", "कला", "°", 0, { min: -360, max: 360, live: true })],
      blurb: T("Sine, square, triangle or sawtooth voltage. 230 V mains = 325 V peak at 50 Hz.", "साइन, वर्ग, त्रिभुज या आरी-दाँत वोल्टेज। 230 V मेन्स = 325 V शिखर, 50 Hz।") },
    isource: { cat: "sources", icon: "⇡", prefix: "I", name: T("Current source", "धारा स्रोत"), pins: VERT, pinNames: ["out", "in"],
      params: [P("I", "Current", "धारा", "A", 0.01, { min: -100, max: 100, live: true })],
      blurb: T("Pushes a fixed current out of the arrow end, whatever the voltage.", "तीर वाले सिरे से नियत धारा देता है, वोल्टेज कुछ भी हो।") },
    ground: { cat: "sources", icon: "⏚", prefix: "GND", name: T("Ground (0 V)", "ग्राउंड (0 V)"), pins: [[0, 0]], pinNames: ["0 V"], params: [],
      blurb: T("The 0 V reference. Every voltage on the page is measured from here.", "0 V संदर्भ। सभी वोल्टेज यहीं से नापे जाते हैं।") },

    resistor: { cat: "passive", icon: "▭", prefix: "R", name: T("Resistor", "प्रतिरोधक"), pins: TWO, pinNames: ["1", "2"],
      params: [P("R", "Resistance", "प्रतिरोध", "Ω", 1000, { min: 1e-3, max: 1e12, live: true }), P("Pmax", "Power rating", "शक्ति रेटिंग", "W", 0.25, { min: 0.01, max: 1000, live: true }),
        P("tol", "Tolerance", "सहनशीलता", "%", 5, { choices: [[1, T("1 % (brown)", "1 % (भूरा)")], [2, T("2 % (red)", "2 % (लाल)")], [5, T("5 % (gold)", "5 % (सुनहरा)")], [10, T("10 % (silver)", "10 % (चाँदी)")]] }),
        P("pkg", "Package", "पैकेज", "", "tht", { choices: [["tht", T("Through-hole (colour bands)", "थ्रू-होल (रंग पट्टियाँ)")], ["smd", T("SMD chip (number code)", "SMD चिप (संख्या कोड)")]] })],
      blurb: T("V = I × R. Burns if the power I²R goes above its rating.", "V = I × R. शक्ति I²R रेटिंग से ऊपर जाए तो जल जाता है।") },
    capacitor: { cat: "passive", icon: "⊣⊢", prefix: "C", name: T("Capacitor (ceramic / film)", "संधारित्र (सिरेमिक/फ़िल्म)"), pins: TWO, pinNames: ["1", "2"],
      params: [P("C", "Capacitance", "धारिता", "F", 1e-6, { min: 1e-15, max: 100, live: true }), P("Vmax", "Voltage rating", "वोल्टेज रेटिंग", "V", 50, { min: 1, max: 1e5, live: true }),
        P("V0", "Starting charge", "प्रारंभिक वोल्टेज", "V", 0, { min: -1e5, max: 1e5 })],
      blurb: T("Stores charge: i = C·dv/dt. Time constant τ = R·C.", "आवेश संचित करता है: i = C·dv/dt. समय स्थिरांक τ = R·C।") },
    electrolytic: { cat: "passive", icon: "⊣(", prefix: "C", name: T("Electrolytic capacitor (polarised)", "इलेक्ट्रोलाइटिक संधारित्र (ध्रुवीय)"), pins: TWO, pinNames: ["+", "−"],
      params: [P("C", "Capacitance", "धारिता", "F", 100e-6, { min: 1e-9, max: 100, live: true }), P("Vmax", "Voltage rating", "वोल्टेज रेटिंग", "V", 25, { min: 1, max: 1e4, live: true }),
        P("V0", "Starting charge", "प्रारंभिक वोल्टेज", "V", 0, { min: -1e4, max: 1e4 })],
      blurb: T("Large capacitance, but + must stay positive: reversed or over-voltage, it bursts.", "बड़ी धारिता, पर + धनात्मक रहना चाहिए: उल्टा या अधिक वोल्टेज हो तो फट जाता है।") },
    inductor: { cat: "passive", icon: "ᘐ", prefix: "L", name: T("Inductor", "प्रेरक"), pins: TWO, pinNames: ["1", "2"],
      params: [P("L", "Inductance", "प्रेरकत्व", "H", 0.01, { min: 1e-9, max: 1000, live: true }), P("R", "Winding resistance", "कुंडली प्रतिरोध", "Ω", 0.5, { min: 0, max: 1e6, live: true })],
      blurb: T("Opposes changes in current: v = L·di/dt. τ = L / R.", "धारा के बदलाव का विरोध करता है: v = L·di/dt. τ = L / R।") },
    pot: { cat: "passive", icon: "⟟", prefix: "RV", name: T("Potentiometer", "पोटेंशियोमीटर"), pins: [[-2, 0], [2, 0], [0, -2]], pinNames: ["A", "B", "W"],
      params: [P("R", "Total resistance", "कुल प्रतिरोध", "Ω", 10000, { min: 1, max: 1e9, live: true }), P("pos", "Wiper position", "वाइपर स्थिति", "%", 50, { min: 0, max: 100, live: true, slider: true })],
      blurb: T("Adjustable divider: the wiper W slides between A and B.", "समायोज्य विभाजक: वाइपर W, A और B के बीच खिसकता है।") },
    transformer: { cat: "passive", icon: "⫴", prefix: "T", name: T("Transformer", "ट्रांसफ़ॉर्मर"), pins: [[-2, -2], [-2, 2], [2, -2], [2, 2]], pinNames: ["P1", "P2", "S1", "S2"],
      params: [P("n", "Turns ratio (primary : secondary)", "फेरों का अनुपात (प्राथमिक : द्वितीयक)", ":1", 19, { min: 0.01, max: 1000 }),
        P("Lp", "Primary inductance", "प्राथमिक प्रेरकत्व", "H", 10, { min: 1e-6, max: 1e4 }), P("k", "Coupling", "युग्मन", "", 0.999, { min: 0.5, max: 0.99999 }),
        P("Rp", "Primary winding resistance", "प्राथमिक कुंडली प्रतिरोध", "Ω", 30, { min: 0.001, max: 1e5 }), P("Rs", "Secondary winding resistance", "द्वितीयक कुंडली प्रतिरोध", "Ω", 0.5, { min: 0.001, max: 1e5 })],
      blurb: T("Steps AC voltage down or up: Vs = Vp / n. 230 V → 12 V needs about 19 : 1.", "एसी वोल्टेज घटाता/बढ़ाता है: Vs = Vp / n. 230 V → 12 V के लिए लगभग 19 : 1।") },

    diode: { cat: "semi", icon: "▷|", prefix: "D", name: T("Diode (1N4007)", "डायोड (1N4007)"), pins: TWO, pinNames: ["A", "K"],
      params: [P("Is", "Saturation current", "संतृप्ति धारा", "A", 7e-9, { min: 1e-18, max: 1e-3 }), P("n", "Ideality factor", "आदर्शता गुणांक", "", 1.9, { min: 1, max: 3 }),
        P("Imax", "Max forward current", "अधिकतम अग्र धारा", "A", 1, { min: 0.001, max: 1000 }), P("PIV", "Max reverse voltage", "अधिकतम पश्च वोल्टेज", "V", 1000, { min: 1, max: 1e5 })],
      blurb: T("Lets current flow one way (A → K) after about 0.7 V. Used in rectifiers.", "धारा एक ही दिशा (A → K) में लगभग 0.7 V के बाद बहती है। रेक्टिफ़ायर में उपयोग।") },
    schottky: { cat: "semi", icon: "▷|", prefix: "D", name: T("Schottky diode (1N5819)", "शॉटकी डायोड (1N5819)"), pins: TWO, pinNames: ["A", "K"],
      params: [P("Is", "Saturation current", "संतृप्ति धारा", "A", 3e-6, { min: 1e-15, max: 1e-2 }), P("n", "Ideality factor", "आदर्शता गुणांक", "", 1.05, { min: 1, max: 3 }),
        P("Imax", "Max forward current", "अधिकतम अग्र धारा", "A", 1, { min: 0.001, max: 1000 }), P("PIV", "Max reverse voltage", "अधिकतम पश्च वोल्टेज", "V", 40, { min: 1, max: 1e4 })],
      blurb: T("Fast diode with a low drop (about 0.3 V).", "कम ड्रॉप (लगभग 0.3 V) वाला तेज़ डायोड।") },
    zener: { cat: "semi", icon: "▷Z", prefix: "D", name: T("Zener diode", "ज़ेनर डायोड"), pins: TWO, pinNames: ["A", "K"],
      params: [P("Vz", "Zener voltage", "ज़ेनर वोल्टेज", "V", 5.1, { min: 1, max: 400 }), P("Pmax", "Power rating", "शक्ति रेटिंग", "W", 0.5, { min: 0.05, max: 100 })],
      blurb: T("Conducts backwards at Vz: a simple voltage regulator.", "Vz पर उल्टी दिशा में चालन करता है: सरल वोल्टेज नियामक।") },
    led: { cat: "semi", icon: "💡", prefix: "LED", name: T("LED", "एलईडी"), pins: TWO, pinNames: ["A (+)", "K (−)"],
      params: [P("color", "Colour", "रंग", "", "red", { choices: LED_COLOURS }), P("Vf", "Forward voltage at 20 mA (0 = from colour)", "20 mA पर अग्र वोल्टेज (0 = रंग से)", "V", 0, { min: 0, max: 6 }),
        P("Imax", "Max current", "अधिकतम धारा", "A", 0.03, { min: 0.001, max: 10 }), P("size", "Size", "आकार", "", 5, { choices: [[3, T("3 mm", "3 mm")], [5, T("5 mm", "5 mm")], [10, T("10 mm", "10 mm")]] })],
      blurb: T("Lights up when current flows A → K. Always use a series resistor: R = (Vs − Vf) / I.", "A → K धारा बहने पर जलती है। हमेशा श्रेणी प्रतिरोधक लगाएँ: R = (Vs − Vf) / I।") },
    npn: { cat: "semi", icon: "Ⓝ", prefix: "Q", name: T("NPN transistor (BC547)", "एनपीएन ट्रांज़िस्टर (BC547)"), pins: [[-2, 0], [1, -2], [1, 2]], pinNames: ["B", "C", "E"],
      params: [P("beta", "Gain β (hFE)", "लाभ β (hFE)", "", 200, { min: 1, max: 2000 }), P("Icmax", "Max collector current", "अधिकतम कलेक्टर धारा", "A", 0.1, { min: 0.001, max: 100 }),
        P("Pmax", "Power rating", "शक्ति रेटिंग", "W", 0.5, { min: 0.01, max: 1000 })],
      blurb: T("A small base current controls a large collector current: Ic = β·Ib. Switch or amplifier.", "छोटी बेस धारा बड़ी कलेक्टर धारा नियंत्रित करती है: Ic = β·Ib. स्विच या एम्पलीफ़ायर।") },
    pnp: { cat: "semi", icon: "Ⓟ", prefix: "Q", name: T("PNP transistor (BC557)", "पीएनपी ट्रांज़िस्टर (BC557)"), pins: [[-2, 0], [1, 2], [1, -2]], pinNames: ["B", "C", "E"],
      params: [P("beta", "Gain β (hFE)", "लाभ β (hFE)", "", 200, { min: 1, max: 2000 }), P("Icmax", "Max collector current", "अधिकतम कलेक्टर धारा", "A", 0.1, { min: 0.001, max: 100 }),
        P("Pmax", "Power rating", "शक्ति रेटिंग", "W", 0.5, { min: 0.01, max: 1000 })],
      blurb: T("Like NPN with every polarity reversed: pull the base low to switch on.", "एनपीएन जैसा पर सारी ध्रुवता उलटी: चालू करने के लिए बेस को नीचे खींचें।") },
    nmos: { cat: "semi", icon: "Ⓜ", prefix: "Q", name: T("N-channel MOSFET (IRFZ44N)", "एन-चैनल मॉस्फ़ेट (IRFZ44N)"), pins: [[-2, 0], [1, -2], [1, 2]], pinNames: ["G", "D", "S"],
      params: [P("Vth", "Threshold voltage", "थ्रेशोल्ड वोल्टेज", "V", 3, { min: 0.2, max: 20 }), P("K", "Transconductance K", "ट्रांसकंडक्टेंस K", "A/V²", 5, { min: 1e-4, max: 1000 }),
        P("Idmax", "Max drain current", "अधिकतम ड्रेन धारा", "A", 40, { min: 0.01, max: 1000 })],
      blurb: T("Voltage-controlled switch: on when Vgs is above the threshold. Gate draws no current.", "वोल्टेज-नियंत्रित स्विच: Vgs थ्रेशोल्ड से ऊपर हो तो चालू। गेट धारा नहीं लेता।") },
    pmos: { cat: "semi", icon: "Ⓜ", prefix: "Q", name: T("P-channel MOSFET (IRF9540)", "पी-चैनल मॉस्फ़ेट (IRF9540)"), pins: [[-2, 0], [1, 2], [1, -2]], pinNames: ["G", "D", "S"],
      params: [P("Vth", "Threshold voltage", "थ्रेशोल्ड वोल्टेज", "V", 3, { min: 0.2, max: 20 }), P("K", "Transconductance K", "ट्रांसकंडक्टेंस K", "A/V²", 3, { min: 1e-4, max: 1000 }),
        P("Idmax", "Max drain current", "अधिकतम ड्रेन धारा", "A", 20, { min: 0.01, max: 1000 })],
      blurb: T("On when the gate is pulled below the source by more than the threshold.", "गेट, सोर्स से थ्रेशोल्ड से अधिक नीचे हो तो चालू।") },

    opamp: { cat: "ic", icon: "▷", prefix: "U", name: T("Op-amp", "ऑप-एम्प"), pins: [[-2, -1], [-2, 1], [3, 0]], pinNames: ["−", "+", "OUT"],
      params: [P("A", "Open-loop gain", "खुला-लूप लाभ", "", 1e5, { min: 10, max: 1e7 }), P("Vhi", "Output high (+rail)", "आउटपुट उच्च (+रेल)", "V", 12, { min: -100, max: 100, live: true }),
        P("Vlo", "Output low (−rail)", "आउटपुट निम्न (−रेल)", "V", -12, { min: -100, max: 100, live: true })],
      blurb: T("Amplifies V+ − V− hugely; with feedback: inverting gain −Rf/Rin, non-inverting 1 + Rf/Rg. Supplies are the rail settings.", "V+ − V− को बहुत बढ़ाता है; फ़ीडबैक के साथ: इनवर्टिंग लाभ −Rf/Rin, नॉन-इनवर्टिंग 1 + Rf/Rg. सप्लाई रेल सेटिंग हैं।") },
    timer555: { cat: "ic", icon: "⏱", prefix: "U", name: T("555 timer", "555 टाइमर"), pins: [[0, -3], [0, 3], [-3, -1], [-3, 1], [3, 1], [3, -1]], pinNames: ["VCC", "GND", "TRIG", "THR", "DIS", "OUT"],
      params: [],
      blurb: T("Output goes high when TRIG < ⅓ VCC, low when THR > ⅔ VCC; DIS shorts to GND while low. Astable: f ≈ 1.44 / ((R1 + 2R2)·C). RESET and CTRL are tied internally.", "TRIG < ⅓ VCC पर आउटपुट उच्च, THR > ⅔ VCC पर निम्न; निम्न रहते DIS, GND से जुड़ता है। अस्थिर: f ≈ 1.44 / ((R1 + 2R2)·C). RESET और CTRL अंदर जुड़े हैं।") },
    not: { cat: "ic", icon: "▷o", prefix: "U", name: T("NOT gate", "NOT गेट"), pins: [[-2, 0], [2, 0]], pinNames: ["A", "Y"], params: [], gate: true,
      blurb: T("5 V logic: output is the opposite of the input. Inputs above 2.5 V count as 1.", "5 V लॉजिक: आउटपुट इनपुट का उल्टा। 2.5 V से ऊपर का इनपुट 1 है।") },
    and: { cat: "ic", icon: "D", prefix: "U", name: T("AND gate", "AND गेट"), pins: [[-2, -1], [-2, 1], [2, 0]], pinNames: ["A", "B", "Y"], params: [], gate: true,
      blurb: T("Y = 1 only when A and B are both 1.", "Y = 1 केवल तब जब A और B दोनों 1 हों।") },
    or: { cat: "ic", icon: "⊃", prefix: "U", name: T("OR gate", "OR गेट"), pins: [[-2, -1], [-2, 1], [2, 0]], pinNames: ["A", "B", "Y"], params: [], gate: true,
      blurb: T("Y = 1 when A or B (or both) is 1.", "Y = 1 जब A या B (या दोनों) 1 हों।") },
    nand: { cat: "ic", icon: "Do", prefix: "U", name: T("NAND gate", "NAND गेट"), pins: [[-2, -1], [-2, 1], [2, 0]], pinNames: ["A", "B", "Y"], params: [], gate: true,
      blurb: T("Opposite of AND. Any logic circuit can be built from NAND gates alone.", "AND का उल्टा। केवल NAND गेटों से कोई भी लॉजिक बनाया जा सकता है।") },
    nor: { cat: "ic", icon: "⊃o", prefix: "U", name: T("NOR gate", "NOR गेट"), pins: [[-2, -1], [-2, 1], [2, 0]], pinNames: ["A", "B", "Y"], params: [], gate: true,
      blurb: T("Opposite of OR: Y = 1 only when both inputs are 0.", "OR का उल्टा: Y = 1 केवल जब दोनों इनपुट 0 हों।") },
    xor: { cat: "ic", icon: "⊻", prefix: "U", name: T("XOR gate", "XOR गेट"), pins: [[-2, -1], [-2, 1], [2, 0]], pinNames: ["A", "B", "Y"], params: [], gate: true,
      blurb: T("Y = 1 when the inputs are different.", "Y = 1 जब इनपुट अलग-अलग हों।") },

    switch: { cat: "switch", icon: "🎚", prefix: "SW", name: T("Switch (toggle)", "स्विच (टॉगल)"), pins: TWO, pinNames: ["1", "2"],
      params: [P("on", "Closed", "बंद (चालू)", "", false, { bool: true, live: true })],
      blurb: T("Click it (or press Space when selected) while running to flip it.", "चलते समय इसे क्लिक करें (या चुनकर Space दबाएँ)।") },
    button: { cat: "switch", icon: "⊙", prefix: "SW", name: T("Push button", "पुश बटन"), pins: TWO, pinNames: ["1", "2"],
      params: [P("on", "Pressed", "दबा हुआ", "", false, { bool: true, live: true })],
      blurb: T("Closed only while you hold it down (mouse or Space).", "केवल दबाए रखने तक बंद (माउस या Space)।") },
    spdt: { cat: "switch", icon: "⇋", prefix: "SW", name: T("Changeover switch (SPDT)", "चेंजओवर स्विच (SPDT)"), pins: [[-2, 0], [2, -1], [2, 1]], pinNames: ["COM", "A", "B"],
      params: [P("pos", "Position", "स्थिति", "", "A", { choices: [["A", T("A", "A")], ["B", T("B", "B")]], live: true })],
      blurb: T("COM connects to A or to B.", "COM, A या B से जुड़ता है।") },
    relay: { cat: "switch", icon: "⎍", prefix: "K", name: T("Relay (5 V coil)", "रिले (5 V कुंडली)"), pins: [[-3, -2], [-3, 2], [3, 2], [3, -2], [3, 0]], pinNames: ["Coil+", "Coil−", "COM", "NO", "NC"],
      params: [P("Vcoil", "Coil voltage", "कुंडली वोल्टेज", "V", 5, { min: 1, max: 400 }), P("Rcoil", "Coil resistance", "कुंडली प्रतिरोध", "Ω", 70, { min: 1, max: 1e6 }),
        P("Lcoil", "Coil inductance", "कुंडली प्रेरकत्व", "H", 0.05, { min: 1e-6, max: 100 })],
      blurb: T("Coil current pulls COM from NC to NO. Put a diode across the coil to absorb the switch-off spike.", "कुंडली धारा COM को NC से NO पर खींचती है। बंद होने के झटके के लिए कुंडली पर डायोड लगाएँ।") },
    fuse: { cat: "switch", icon: "⌁", prefix: "F", name: T("Fuse", "फ़्यूज़"), pins: TWO, pinNames: ["1", "2"],
      params: [P("Ir", "Rating", "रेटिंग", "A", 1, { min: 0.001, max: 1000 })],
      blurb: T("Melts open when the current stays above its rating. Reset restores it.", "धारा रेटिंग से ऊपर रहे तो पिघलकर खुल जाता है। रीसेट से ठीक होता है।") },

    lamp: { cat: "out", icon: "💡", prefix: "LP", name: T("Lamp (bulb)", "बल्ब"), pins: TWO, pinNames: ["1", "2"],
      params: [P("Vr", "Rated voltage", "रेटेड वोल्टेज", "V", 12, { min: 0.5, max: 1000 }), P("Wr", "Rated power", "रेटेड शक्ति", "W", 5, { min: 0.01, max: 10000 })],
      blurb: T("Glows with its power; R = V² / P. Burns out well above its rated voltage.", "शक्ति के अनुसार चमकता है; R = V² / P. रेटेड वोल्टेज से बहुत अधिक पर फ़्यूज़ हो जाता है।") },
    motor: { cat: "out", icon: "Ⓜ", prefix: "M", name: T("DC motor", "डीसी मोटर"), pins: TWO, pinNames: ["+", "−"],
      params: [P("R", "Armature resistance", "आर्मेचर प्रतिरोध", "Ω", 2, { min: 0.01, max: 1e4 }), P("ke", "Motor constant k", "मोटर स्थिरांक k", "V·s/rad", 0.01, { min: 1e-4, max: 10 }),
        P("J", "Inertia", "जड़त्व", "kg·m²", 2e-5, { min: 1e-8, max: 10 }), P("load", "Load torque", "लोड बलाघूर्ण", "N·m", 0, { min: 0, max: 100, live: true })],
      blurb: T("Speed rises until the back-EMF k·ω nearly equals the supply. More load → more current.", "गति तब तक बढ़ती है जब तक बैक-EMF k·ω सप्लाई के लगभग बराबर न हो। अधिक लोड → अधिक धारा।") },
    buzzer: { cat: "out", icon: "🔔", prefix: "BZ", name: T("Buzzer", "बज़र"), pins: TWO, pinNames: ["+", "−"],
      params: [P("R", "Resistance", "प्रतिरोध", "Ω", 120, { min: 1, max: 1e5 }), P("Von", "Sounds above", "इससे ऊपर बजता है", "V", 2, { min: 0.1, max: 100 })],
      blurb: T("Active buzzer: beeps when its voltage is above the threshold (turn on 🔊 to hear it).", "सक्रिय बज़र: वोल्टेज सीमा से ऊपर हो तो बजता है (सुनने के लिए 🔊 चालू करें)।") },
    seg7: { cat: "out", icon: "8", prefix: "DS", name: T("7-segment display", "सात-खंड डिस्प्ले"), pins: [[-4, 4], [-3, 4], [-2, 4], [-1, 4], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4]],
      pinNames: ["a", "b", "c", "d", "e", "f", "g", "dp", "COM"],
      params: [P("common", "Type", "प्रकार", "", "cathode", { choices: [["cathode", T("Common cathode", "कॉमन कैथोड")], ["anode", T("Common anode", "कॉमन एनोड")]] })],
      blurb: T("Seven LED bars a–g (+ dot). Common cathode: COM to 0 V, drive segments high through resistors.", "सात एलईडी खंड a–g (+ बिंदु)। कॉमन कैथोड: COM को 0 V, खंडों को प्रतिरोधकों से उच्च दें।") },
    voltmeter: { cat: "out", icon: "Ⓥ", prefix: "VM", name: T("Voltmeter", "वोल्टमीटर"), pins: TWO, pinNames: ["+", "−"],
      params: [P("mode", "Reading", "पठन", "", "dc", { choices: [["dc", T("DC (instant)", "डीसी (तत्काल)")], ["rms", T("AC RMS", "एसी RMS")]], live: true })],
      blurb: T("Connect across a part (in parallel). 10 MΩ: it barely disturbs the circuit.", "घटक के आर-पार (समांतर) जोड़ें। 10 MΩ: सर्किट को लगभग प्रभावित नहीं करता।") },
    ammeter: { cat: "out", icon: "Ⓐ", prefix: "AM", name: T("Ammeter", "एमीटर"), pins: TWO, pinNames: ["+", "−"],
      params: [P("mode", "Reading", "पठन", "", "dc", { choices: [["dc", T("DC (instant)", "डीसी (तत्काल)")], ["rms", T("AC RMS", "एसी RMS")]], live: true })],
      blurb: T("Connect in series (break the wire). 1 mΩ: almost no voltage drop.", "श्रेणी में जोड़ें (तार तोड़कर)। 1 mΩ: लगभग कोई वोल्टेज ड्रॉप नहीं।") },

    ldr: { cat: "sensor", icon: "☀", prefix: "LDR", name: T("Light sensor (LDR)", "प्रकाश सेंसर (LDR)"), pins: TWO, pinNames: ["1", "2"],
      params: [P("lux", "Light", "प्रकाश", "lux", 100, { min: 0.1, max: 100000, live: true, slider: true, log: true }), P("R10", "Resistance at 10 lux", "10 lux पर प्रतिरोध", "Ω", 20000, { min: 10, max: 1e8 })],
      blurb: T("Resistance falls as light rises: dark ≈ MΩ, daylight ≈ 100 Ω.", "प्रकाश बढ़ने पर प्रतिरोध घटता है: अँधेरा ≈ MΩ, दिन ≈ 100 Ω।") },
    ntc: { cat: "sensor", icon: "🌡", prefix: "TH", name: T("Thermistor (NTC 10k)", "थर्मिस्टर (NTC 10k)"), pins: TWO, pinNames: ["1", "2"],
      params: [P("T", "Temperature", "तापमान", "°C", 25, { min: -40, max: 150, live: true, slider: true }), P("R25", "Resistance at 25 °C", "25 °C पर प्रतिरोध", "Ω", 10000, { min: 1, max: 1e8 }),
        P("B", "Beta", "बीटा", "K", 3950, { min: 100, max: 10000 })],
      blurb: T("Resistance falls as it warms: R = R25·e^(B(1/T − 1/298 K)).", "गर्म होने पर प्रतिरोध घटता है: R = R25·e^(B(1/T − 1/298 K))।") },
  };
  Object.keys(PARTS).forEach((k) => { PARTS[k].type = k; });

  // ------------------------------------------------------------------ numbers: "4k7", "10u", "2.2M" <-> values
  const PREFIX = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, "μ": 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };
  function parseValue(text) {
    let s = String(text == null ? "" : text).trim().replace(/\s+/g, "").replace(/,/g, ".");
    s = s.replace(/(Ω|ohms?|ohm|F|H|Hz|V|A|W|s|%|°C|°|lux)$/i, (m) => (/^(m|M)$/.test(m) ? m : ""));   // drop a trailing unit
    if (s === "") return NaN;
    let m = s.match(/^([+-]?\d+)([fpnuµμmkKMGTR])(\d+)$/);             // 4k7 = 4.7k, 2R2 = 2.2
    if (m) return Number(m[1] + "." + m[3]) * (m[2] === "R" ? 1 : PREFIX[m[2]]);
    m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([fpnuµμmkKMGT]?)$/i);
    if (!m) return NaN;
    let pre = m[2];
    if (pre === "M" && /meg/i.test(text)) pre = "M";
    return Number(m[1]) * (pre ? PREFIX[pre] : 1);
  }
  function fmt(x, unit, digits) {
    unit = unit || "";
    if (x == null || !isFinite(x)) return "—";
    if (unit === "%" || unit === "°C" || unit === "°" || unit === ":1" || unit === "" || unit === "K" || unit === "lux" || unit === "rpm") {
      const a = Math.abs(x);
      const s = a >= 1000 || a === 0 ? x.toFixed(0) : a >= 10 ? x.toFixed(1) : a >= 0.01 ? x.toPrecision(3) : x.toExponential(2);
      return unit ? (unit === ":1" ? s + " : 1" : s + " " + unit) : s;
    }
    const a = Math.abs(x);
    if (a < 1e-15) return "0 " + unit;
    const steps = [[1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"], [1e-15, "f"]];
    for (let i = 0; i < steps.length; i++) {
      if (a >= steps[i][0] * 0.9995) {
        const v = x / steps[i][0];
        return Number(v.toPrecision(digits || 3)) + " " + steps[i][1] + unit;
      }
    }
    return x.toExponential(2) + " " + unit;
  }

  // ------------------------------------------------------------------ geometry
  function rotate(pt, rot) {
    let x = pt[0], y = pt[1];
    for (let i = 0; i < ((rot % 4) + 4) % 4; i++) { const t = x; x = -y; y = t; }
    return [x, y];
  }
  function pinPositions(part) {
    const def = PARTS[part.type];
    return def.pins.map((pt) => { const r = rotate(pt, part.rot || 0); return [part.x + r[0], part.y + r[1]]; });
  }
  const key = (x, y) => x + "," + y;
  function onSegment(px, py, w) {
    if (w.x1 === w.x2) return px === w.x1 && py >= Math.min(w.y1, w.y2) && py <= Math.max(w.y1, w.y2);
    if (w.y1 === w.y2) return py === w.y1 && px >= Math.min(w.x1, w.x2) && px <= Math.max(w.x1, w.x2);
    return false;
  }

  // nets: union-find over grid points. Returns { pointNet: Map(key -> net), pins: {partId: [net...]}, count }
  function connectivity(circuit) {
    const parent = new Map();
    const find = (a) => { let r = a; while (parent.get(r) !== r) r = parent.get(r); let x = a; while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n; } return r; };
    const add = (k) => { if (!parent.has(k)) parent.set(k, k); };
    const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    const pinPos = {};
    const points = [];
    circuit.parts.forEach((p) => { if (!PARTS[p.type]) return; pinPos[p.id] = pinPositions(p); pinPos[p.id].forEach((q) => { add(key(q[0], q[1])); points.push(q); }); });
    const wires = circuit.wires || [];
    wires.forEach((w) => { union(key(w.x1, w.y1), key(w.x2, w.y2)); points.push([w.x1, w.y1], [w.x2, w.y2]); });
    wires.forEach((w) => points.forEach((q) => { if (onSegment(q[0], q[1], w)) union(key(q[0], q[1]), key(w.x1, w.y1)); }));
    return { find: find, has: (k) => parent.has(k), pinPos: pinPos };
  }

  // ------------------------------------------------------------------ dense linear solver (partial pivoting)
  function solve(A, b, n) {
    for (let c = 0; c < n; c++) {
      let piv = c, best = Math.abs(A[c * n + c]);
      for (let r = c + 1; r < n; r++) { const v = Math.abs(A[r * n + c]); if (v > best) { best = v; piv = r; } }
      if (best < 1e-30) return false;
      if (piv !== c) {
        for (let k = c; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[piv * n + k]; A[piv * n + k] = t; }
        const t = b[c]; b[c] = b[piv]; b[piv] = t;
      }
      const d = A[c * n + c];
      for (let r = c + 1; r < n; r++) {
        const f = A[r * n + c] / d;
        if (f === 0) continue;
        for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
        b[r] -= f * b[c];
      }
    }
    for (let r = n - 1; r >= 0; r--) {
      let s = b[r];
      for (let k = r + 1; k < n; k++) s -= A[r * n + k] * b[k];
      b[r] = s / A[r * n + r];
    }
    return true;
  }

  // ------------------------------------------------------------------ device helpers
  // exp that can't overflow (linear beyond e^100: blue / white LEDs need e^60 at their 3 V forward voltage)
  function limexp(x) { return x > 100 ? Math.exp(100) * (1 + x - 100) : Math.exp(x); }
  function dlimexp(x) { return x > 100 ? Math.exp(100) : Math.exp(x); }
  function pnjlim(vnew, vold, vt, vcrit) {
    if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
      if (vold > 0) { const arg = 1 + (vnew - vold) / vt; vnew = arg > 0 ? vold + vt * Math.log(arg) : vcrit; }
      else vnew = vt * Math.log(vnew / vt);
    }
    return vnew;
  }
  const num = (v, d) => { const x = Number(v); return isFinite(x) ? x : d; };
  function waveValue(p, t) {
    const f = num(p.f, 50), ph = num(p.ph, 0) / 360;
    const x = f * t + ph, fr = x - Math.floor(x);
    let w;
    switch (p.wave) {
      case "square": w = fr < 0.5 ? 1 : -1; break;
      case "triangle": w = fr < 0.25 ? 4 * fr : fr < 0.75 ? 2 - 4 * fr : 4 * fr - 4; break;
      case "saw": w = 2 * fr - 1; break;
      default: w = Math.sin(2 * Math.PI * x);
    }
    return num(p.off, 0) + num(p.Vp, 10) * w;
  }
  function ledParams(colour, vfSet) {
    const vf = isFinite(+vfSet) && +vfSet > 0 ? +vfSet : LED_VF[colour] || 2, n = 2.0;
    return { n: n, Is: 0.02 / Math.exp(vf / (n * VT)), vf: vf };
  }

  // ------------------------------------------------------------------ device models
  // Each model returns { stamp(c), accept(c), info(c) }. c.v = node voltages of the current Newton iterate.
  // Stamp helpers on c: G(a, b, g); I(a, b, i) = source pushing i out of a and into b (through the device);
  // NL2(a, b, i, g, vlin) = non-linear branch a→b with current i and slope g, linearised at vlin.
  function burnCheck(st, ok, reason, c, instant) {
    if (!c.damage || st.burnt) return;
    if (ok) { st.over = 0; return; }
    st.over = (st.over || 0) + c.dt;
    if (instant || st.over > 0.02) { st.burnt = reason; c.events.push(reason); }
  }
  const MODELS = {
    resistor(e) {
      return {
        stamp(c) { c.G(e.n[0], e.n[1], e.st.burnt ? OPEN : 1 / Math.max(1e-6, num(e.p.R, 1000))); },
        accept(c) {
          const v = c.v[e.n[0]] - c.v[e.n[1]], R = Math.max(1e-6, num(e.p.R, 1000)), P = e.st.burnt ? 0 : v * v / R;
          burnCheck(e.st, P <= num(e.p.Pmax, 0.25) * 1.5, "burnt", c, P > num(e.p.Pmax, 0.25) * 6);
        },
        info(c) {
          const v = c.v[e.n[0]] - c.v[e.n[1]], i = e.st.burnt ? 0 : v / Math.max(1e-6, num(e.p.R, 1000));
          return { v: v, i: i, p: v * i, heat: Math.min(1, Math.abs(v * i) / num(e.p.Pmax, 0.25)) };
        },
      };
    },
    pot(e) {
      const parts = () => { const R = Math.max(1, num(e.p.R, 1e4)), a = Math.min(1, Math.max(0, num(e.p.pos, 50) / 100)); return [Math.max(0.5, R * a), Math.max(0.5, R * (1 - a))]; };
      return {
        stamp(c) { const r = parts(); c.G(e.n[0], e.n[2], 1 / r[0]); c.G(e.n[2], e.n[1], 1 / r[1]); },
        accept() {},
        info(c) {
          const r = parts(), va = c.v[e.n[0]], vb = c.v[e.n[1]], vw = c.v[e.n[2]];
          const i1 = (va - vw) / r[0], i2 = (vw - vb) / r[1];
          return { v: va - vb, i: i1, p: (va - vw) * i1 + (vw - vb) * i2, rows: [["Vwiper", vw - vb, "V"], ["R_AW", r[0], "Ω"], ["R_WB", r[1], "Ω"]] };
        },
      };
    },
    ldr(e) {
      const R = () => num(e.p.R10, 2e4) * Math.pow(Math.max(0.01, num(e.p.lux, 100)) / 10, -0.7);
      return {
        stamp(c) { c.G(e.n[0], e.n[1], 1 / R()); }, accept() {},
        info(c) { const v = c.v[e.n[0]] - c.v[e.n[1]], i = v / R(); return { v: v, i: i, p: v * i, rows: [["R", R(), "Ω"]] }; },
      };
    },
    ntc(e) {
      const R = () => num(e.p.R25, 1e4) * Math.exp(num(e.p.B, 3950) * (1 / (num(e.p.T, 25) + 273.15) - 1 / 298.15));
      return {
        stamp(c) { c.G(e.n[0], e.n[1], 1 / R()); }, accept() {},
        info(c) { const v = c.v[e.n[0]] - c.v[e.n[1]], i = v / R(); return { v: v, i: i, p: v * i, rows: [["R", R(), "Ω"]] }; },
      };
    },
    capacitor(e, polar) {
      const st = e.st;
      if (st.vc == null) st.vc = num(e.p.V0, 0);
      return {
        stamp(c) {
          if (st.burnt) { c.G(e.n[0], e.n[1], OPEN); return; }
          const g = num(e.p.C, 1e-6) / c.dt;
          c.G(e.n[0], e.n[1], g); c.I(e.n[1], e.n[0], g * st.vc);
        },
        accept(c) {
          const v = c.v[e.n[0]] - c.v[e.n[1]];
          st.i = st.burnt ? 0 : num(e.p.C, 1e-6) * (v - st.vc) / c.dt;
          st.vc = st.burnt ? 0 : v;
          const vmax = num(e.p.Vmax, 50);
          burnCheck(st, Math.abs(v) <= vmax * 1.15 && (!polar || v > -1.5), polar && v <= -1.5 ? "reversed" : "overvoltage", c, Math.abs(v) > vmax * 2);
        },
        info(c) {
          const v = c.v[e.n[0]] - c.v[e.n[1]], C = num(e.p.C, 1e-6);
          return { v: v, i: st.i || 0, p: v * (st.i || 0), rows: [["Q", C * v, "C"], ["E", 0.5 * C * v * v, "J"]], heat: Math.abs(v) / num(e.p.Vmax, 50) > 1 ? 1 : 0 };
        },
      };
    },
    inductor(e) {
      const st = e.st;
      if (st.il == null) st.il = 0;
      const geq = (c) => 1 / (Math.max(0, num(e.p.R, 0)) + num(e.p.L, 0.01) / c.dt);
      return {
        stamp(c) {   // i = (v + L/dt · i_prev) / (R + L/dt)
          const g = geq(c), L = num(e.p.L, 0.01);
          c.G(e.n[0], e.n[1], g); c.I(e.n[0], e.n[1], g * (L / c.dt) * st.il);
        },
        accept(c) { const v = c.v[e.n[0]] - c.v[e.n[1]], L = num(e.p.L, 0.01); st.il = geq(c) * (v + (L / c.dt) * st.il); },
        info(c) { const v = c.v[e.n[0]] - c.v[e.n[1]], L = num(e.p.L, 0.01); return { v: v, i: st.il, p: v * st.il, rows: [["E", 0.5 * L * st.il * st.il, "J"]] }; },
      };
    },
    transformer(e) {   // two coupled windings with resistance: v = R·i + L·di/dt (backward Euler, 2 × 2)
      const st = e.st;
      if (st.i1 == null) { st.i1 = 0; st.i2 = 0; }
      const mats = (c) => {
        const L1 = num(e.p.Lp, 10), n = Math.max(1e-3, num(e.p.n, 10)), k = Math.min(0.99999, num(e.p.k, 0.999)), L2 = L1 / (n * n), M = k * Math.sqrt(L1 * L2);
        const a = Math.max(1e-4, num(e.p.Rp, 30)) + L1 / c.dt, b = M / c.dt, d = Math.max(1e-4, num(e.p.Rs, 0.5)) + L2 / c.dt, det = a * d - b * b;
        const Y = [d / det, -b / det, a / det];
        const h1 = L1 / c.dt * st.i1 + b * st.i2, h2 = b * st.i1 + L2 / c.dt * st.i2;     // i = Y·(v + h)
        return { Y: Y, c1: Y[0] * h1 + Y[1] * h2, c2: Y[1] * h1 + Y[2] * h2 };
      };
      const cross = (c, a, b, x, y, g) => { c.A(a, x, g); c.A(a, y, -g); c.A(b, x, -g); c.A(b, y, g); };
      return {
        stamp(c) {
          const m = mats(c), p1 = e.n[0], p2 = e.n[1], s1 = e.n[2], s2 = e.n[3];
          c.G(p1, p2, m.Y[0]); c.G(s1, s2, m.Y[2]);
          cross(c, p1, p2, s1, s2, m.Y[1]); cross(c, s1, s2, p1, p2, m.Y[1]);
          c.I(p1, p2, m.c1); c.I(s1, s2, m.c2);
        },
        accept(c) {
          const m = mats(c), v1 = c.v[e.n[0]] - c.v[e.n[1]], v2 = c.v[e.n[2]] - c.v[e.n[3]];
          st.i1 = m.Y[0] * v1 + m.Y[1] * v2 + m.c1; st.i2 = m.Y[1] * v1 + m.Y[2] * v2 + m.c2;
        },
        info(c) {
          const v1 = c.v[e.n[0]] - c.v[e.n[1]], v2 = c.v[e.n[2]] - c.v[e.n[3]];
          return { v: v1, i: st.i1, p: v1 * st.i1 + v2 * st.i2, rows: [["Vp", v1, "V"], ["Vs", v2, "V"], ["Ip", st.i1, "A"], ["Is", -st.i2, "A"]] };
        },
      };
    },    battery(e) {
      return {
        stamp(c) { const r = Math.max(1e-4, num(e.p.r, 0.1)); c.G(e.n[0], e.n[1], 1 / r); c.I(e.n[1], e.n[0], num(e.p.V, 9) / r); },
        accept() {},
        info(c) { const v = c.v[e.n[0]] - c.v[e.n[1]], r = Math.max(1e-4, num(e.p.r, 0.1)), i = (num(e.p.V, 9) - v) / r; return { v: v, i: i, p: -v * i, source: true }; },
      };
    },
    dcsupply(e) {
      const st = e.st;
      const R = 0.005;
      const f = (vd) => {   // current out of + : a stiff voltage source until the limit, then constant current (soft minimum)
        const lim = Math.max(1e-6, num(e.p.Ilim, 1)), x = (num(e.p.V, 12) - vd) / R, sm = 0.01 * lim, z = (x - lim) / sm;
        const sp = z > 40 ? z : Math.log1p(Math.exp(z)), sig = z > 40 ? 1 : 1 / (1 + Math.exp(-z));
        return [x - sm * sp, -(1 - sig) / R];
      };
      return {
        stamp(c) {
          let vd = c.v[e.n[0]] - c.v[e.n[1]];
          if (st.vl != null && Math.abs(vd - st.vl) > 5) { vd = st.vl + Math.sign(vd - st.vl) * 5; c.limited(); }
          st.vl = vd;
          const r = f(vd);   // device current + → − through the supply is −i_out
          c.NL2(e.n[0], e.n[1], -r[0], -r[1] + 1e-6, vd);
        },
        accept(c) { st.vl = c.v[e.n[0]] - c.v[e.n[1]]; },
        info(c) {
          const v = c.v[e.n[0]] - c.v[e.n[1]], i = f(v)[0];
          return { v: v, i: i, p: -v * i, source: true, rows: [["mode", Math.abs(i) > 0.98 * num(e.p.Ilim, 1) ? "CC" : "CV", ""]] };
        },
      };
    },
    acsource(e) {
      const R = 0.01;
      return {
        stamp(c) { c.G(e.n[0], e.n[1], 1 / R); c.I(e.n[1], e.n[0], waveValue(e.p, c.t + c.dt) / R); },
        accept() {},
        info(c) { const v = c.v[e.n[0]] - c.v[e.n[1]], i = (waveValue(e.p, c.t) - v) / R; return { v: v, i: i, p: -v * i, source: true }; },
      };
    },
    isource(e) {
      return {
        stamp(c) { c.I(e.n[1], e.n[0], num(e.p.I, 0.01)); }, accept() {},
        info(c) { const v = c.v[e.n[0]] - c.v[e.n[1]], i = num(e.p.I, 0.01); return { v: v, i: i, p: -v * i, source: true }; },
      };
    },
    ground() { return { stamp() {}, accept() {}, info() { return { v: 0, i: 0, p: 0 }; } }; },
    diode(e, kind) {
      const st = e.st;
      const prm = () => {
        if (kind === "led") { const lp = ledParams(e.p.color, e.p.Vf); return { Is: lp.Is, nvt: lp.n * VT, bv: 5, isz: 1e-12 }; }
        if (kind === "zener") return { Is: 1e-12, nvt: 1.2 * VT, bv: num(e.p.Vz, 5.1), isz: 5e-3, zener: true };   // 5 mA at exactly Vz
        return { Is: num(e.p.Is, 7e-9), nvt: num(e.p.n, 1.9) * VT, bv: kind === "schottky" ? num(e.p.PIV, 40) * 1.2 : num(e.p.PIV, 1000) * 1.2, isz: 1e-12 };
      };
      const iv = (q, vd) => {
        let i = q.Is * (limexp(vd / q.nvt) - 1), g = q.Is / q.nvt * dlimexp(vd / q.nvt);
        const xr = -(vd + q.bv) / (q.zener ? 0.05 : q.nvt);     // reverse breakdown (sharp knee for the Zener)
        if (xr > -60) { const ex = limexp(xr), d = q.isz * dlimexp(xr) / (q.zener ? 0.05 : q.nvt); i -= q.isz * ex; g += d; }
        return [i, g];
      };
      return {
        stamp(c) {
          if (st.burnt) { c.G(e.n[0], e.n[1], OPEN); return; }
          const q = prm();
          let vd = c.v[e.n[0]] - c.v[e.n[1]];
          const old = st.vj == null ? 0 : st.vj;
          const vcrit = q.nvt * Math.log(q.nvt / (Math.SQRT2 * q.Is));
          let lim = vd;
          if (vd >= -q.bv * 0.5) lim = pnjlim(vd, old, q.nvt, vcrit);
          else { const x = -vd - q.bv, xo = -old - q.bv; lim = -(pnjlim(x, xo, q.zener ? 0.05 : q.nvt, 0.4) + q.bv); }
          if (Math.abs(lim - vd) > 1e-9) c.limited();
          st.vj = lim;
          const r = iv(q, lim);
          c.NL2(e.n[0], e.n[1], r[0], r[1] + GMIN, lim);
        },
        accept(c) {
          const q = prm(), vd = c.v[e.n[0]] - c.v[e.n[1]], i = st.burnt ? 0 : iv(q, vd)[0];
          st.i = i; st.vj = vd;
          if (kind === "led") burnCheck(st, i <= num(e.p.Imax, 0.03) * 1.6 && vd > -6, "burnt", c, i > num(e.p.Imax, 0.03) * 5);
          else if (kind === "zener") burnCheck(st, Math.abs(vd * i) <= num(e.p.Pmax, 0.5) * 1.5, "burnt", c, Math.abs(vd * i) > num(e.p.Pmax, 0.5) * 6);
          else burnCheck(st, i <= num(e.p.Imax, 1) * 1.5 && vd > -num(e.p.PIV, 1000), vd <= -num(e.p.PIV, 1000) ? "breakdown" : "burnt", c, i > num(e.p.Imax, 1) * 8);
        },
        info(c) {
          const vd = c.v[e.n[0]] - c.v[e.n[1]], i = st.burnt ? 0 : (st.i == null ? iv(prm(), vd)[0] : st.i);
          const out = { v: vd, i: i, p: vd * i };
          if (kind === "led") { out.glow = Math.max(0, Math.min(1.4, i / 0.015)); out.colour = LED_RGB[e.p.color] || LED_RGB.red; if (e.p.color === "ir") out.glow *= 0.15; }
          return out;
        },
      };
    },
    bjt(e, pol) {   // pol = +1 NPN, −1 PNP. Ebers–Moll transport model. Pins B, C, E.
      const st = e.st;
      const Is = 1e-14, bf = () => Math.max(1, num(e.p.beta, 200)), br = 2;
      const vcrit = VT * Math.log(VT / (Math.SQRT2 * Is));
      const evalAt = (vbe, vbc) => {
        const ef = limexp(vbe / VT), er = limexp(vbc / VT), gf = Is / VT * dlimexp(vbe / VT), gr = Is / VT * dlimexp(vbc / VT);
        const If = Is * (ef - 1), Ir = Is * (er - 1), B = bf();
        return { ic: If - Ir * (1 + 1 / br), ib: If / B + Ir / br, dic_dbe: gf, dic_dbc: -gr * (1 + 1 / br), dib_dbe: gf / B, dib_dbc: gr / br };
      };
      return {
        stamp(c) {
          const b = e.n[0], col = e.n[1], em = e.n[2];
          if (st.burnt) { c.G(b, em, OPEN); c.G(col, em, OPEN); return; }
          let vbe = pol * (c.v[b] - c.v[em]), vbc = pol * (c.v[b] - c.v[col]);
          const lbe = pnjlim(vbe, st.vbe == null ? 0 : st.vbe, VT, vcrit), lbc = pnjlim(vbc, st.vbc == null ? 0 : st.vbc, VT, vcrit);
          if (Math.abs(lbe - vbe) > 1e-9 || Math.abs(lbc - vbc) > 1e-9) c.limited();
          st.vbe = vbe = lbe; st.vbc = vbc = lbc;
          const m = evalAt(vbe, vbc);
          // terminal currents leaving each node into the device (B, C, E), as functions of (vb, vc, ve)
          const ic = pol * m.ic, ib = pol * m.ib;
          // d/dVb = dbe + dbc ; d/dVc = −dbc ; d/dVe = −dbe   (pol² = 1)
          const Jc = [m.dic_dbe + m.dic_dbc, -m.dic_dbc, -m.dic_dbe];
          const Jb = [m.dib_dbe + m.dib_dbc, -m.dib_dbc, -m.dib_dbe];
          const Je = [-(Jc[0] + Jb[0]), -(Jc[1] + Jb[1]), -(Jc[2] + Jb[2])];
          // linearisation point in node voltages that reproduces the limited junction voltages
          const vbL = c.v[b], veL = vbL - pol * vbe, vcL = vbL - pol * vbc;
          c.NL([b, col, em], [ib, ic, -(ib + ic)], [Jb, Jc, Je], [vbL, vcL, veL]);
          c.G(b, em, GMIN); c.G(b, col, GMIN);
        },
        accept(c) {
          const b = e.n[0], col = e.n[1], em = e.n[2];
          st.vbe = pol * (c.v[b] - c.v[em]); st.vbc = pol * (c.v[b] - c.v[col]);
          const m = evalAt(st.vbe, st.vbc), vce = pol * (c.v[col] - c.v[em]);
          st.ic = st.burnt ? 0 : m.ic; st.ib = st.burnt ? 0 : m.ib;
          const P = vce * st.ic + st.vbe * st.ib;
          burnCheck(st, Math.abs(st.ic) <= num(e.p.Icmax, 0.1) * 1.5 && P <= num(e.p.Pmax, 0.5) * 1.5, "burnt", c, P > num(e.p.Pmax, 0.5) * 6);
        },
        info(c) {
          const b = e.n[0], col = e.n[1], em = e.n[2], vce = c.v[col] - c.v[em], vbe = c.v[b] - c.v[em];
          const ic = (st.ic || 0) * pol, ib = (st.ib || 0) * pol;
          const sat = pol * vce < 0.25 && Math.abs(ic) > 1e-6, cut = Math.abs(ic) < 1e-7;
          return { v: vce, i: ic, p: vce * ic + vbe * ib, rows: [["Ib", ib, "A"], ["Ic", ic, "A"], ["Vbe", vbe, "V"], ["Vce", vce, "V"], ["region", cut ? "cutoff" : sat ? "saturation" : "active", ""]] };
        },
      };
    },
    mos(e, pol) {   // square-law MOSFET with smooth turn-on; pins G, D, S
      const st = e.st;
      const lam = 0.01, s = 0.03;
      const evalAt = (vgs, vds) => {   // vds >= 0 assumed
        const K = num(e.p.K, 5), x = (vgs - num(e.p.Vth, 3)) / s;
        const vov = x > 30 ? vgs - num(e.p.Vth, 3) : s * Math.log(1 + Math.exp(x));
        const dvov = x > 30 ? 1 : 1 / (1 + Math.exp(-x));
        let id, gm, gds;
        if (vds < vov) { id = K * (vov * vds - vds * vds / 2) * (1 + lam * vds); gm = K * vds * (1 + lam * vds) * dvov; gds = K * (vov - vds) * (1 + lam * vds) + K * (vov * vds - vds * vds / 2) * lam; }
        else { id = K / 2 * vov * vov * (1 + lam * vds); gm = K * vov * (1 + lam * vds) * dvov; gds = K / 2 * vov * vov * lam; }
        return { id: id, gm: gm, gds: gds + 1e-9 };
      };
      return {
        stamp(c) {
          const g = e.n[0], d = e.n[1], so = e.n[2];
          if (st.burnt) { c.G(d, so, OPEN); return; }
          let vgs = pol * (c.v[g] - c.v[so]), vds = pol * (c.v[d] - c.v[so]);
          if (st.vgs != null) {
            const cl = (x, o, m) => Math.abs(x - o) > m ? (c.limited(), o + Math.sign(x - o) * m) : x;
            vgs = cl(vgs, st.vgs, 1); vds = cl(vds, st.vds, 4);
          }
          st.vgs = vgs; st.vds = vds;
          const swap = vds < 0;                       // symmetric device: drain and source swap roles
          const m = swap ? evalAt(vgs - vds, -vds) : evalAt(vgs, vds);
          const id = pol * (swap ? -m.id : m.id);     // current into drain terminal
          // derivatives of the drain current w.r.t. (vg, vd, vs)
          let J;
          if (!swap) J = [m.gm, m.gds, -m.gm - m.gds];
          else J = [-m.gm, m.gm + m.gds, -m.gds];
          const vgL = c.v[g], vsL = vgL - pol * vgs, vdL = vsL + pol * vds;
          c.NL([d, so], [id, -id], [[J[0], J[1], J[2]], [-J[0], -J[1], -J[2]]], [vgL, vdL, vsL], [g, d, so]);
        },
        accept(c) {
          const g = e.n[0], d = e.n[1], so = e.n[2];
          st.vgs = pol * (c.v[g] - c.v[so]); st.vds = pol * (c.v[d] - c.v[so]);
          const swap = st.vds < 0, m = swap ? evalAt(st.vgs - st.vds, -st.vds) : evalAt(st.vgs, st.vds);
          st.id = st.burnt ? 0 : (swap ? -m.id : m.id);
          burnCheck(st, Math.abs(st.id) <= num(e.p.Idmax, 40) * 1.3, "burnt", c, Math.abs(st.id) > num(e.p.Idmax, 40) * 4);
        },
        info(c) {
          const g = e.n[0], d = e.n[1], so = e.n[2], vds = c.v[d] - c.v[so], id = pol * (st.id || 0);
          return { v: vds, i: id, p: vds * id, rows: [["Vgs", c.v[g] - c.v[so], "V"], ["Vds", vds, "V"], ["Id", id, "A"], ["Rds", Math.abs(id) > 1e-9 ? vds / id : Infinity, "Ω"]] };
        },
      };
    },
    opamp(e) {
      const st = e.st, Rout = 1;
      const target = (vdiff) => {
        const hi = num(e.p.Vhi, 12), lo = num(e.p.Vlo, -12), mid = (hi + lo) / 2, half = Math.max(1e-3, (hi - lo) / 2);
        const x = num(e.p.A, 1e5) * vdiff / half, th = Math.tanh(x);
        return [mid + half * th, num(e.p.A, 1e5) * (1 - th * th)];
      };
      return {
        stamp(c) {
          const nm = e.n[0], np = e.n[1], o = e.n[2];
          const vd = c.v[np] - c.v[nm];
          st.vd = vd;
          const t = target(vd), vo = c.v[o];
          // current leaving the output node into the op-amp: (vo − Vt(vp − vn)) / Rout
          const io = (vo - t[0]) / Rout;
          c.NL([o], [io], [[t[1] / Rout, -t[1] / Rout, 1 / Rout]], [c.v[nm], c.v[np], vo], [nm, np, o]);
          c.G(nm, np, 1e-7);   // 10 MΩ input resistance
        },
        accept(c) { st.vd = c.v[e.n[1]] - c.v[e.n[0]]; },
        info(c) {
          const vo = c.v[e.n[2]], io = (target(st.vd || 0)[0] - vo) / Rout;
          const sat = vo > num(e.p.Vhi, 12) - 0.2 || vo < num(e.p.Vlo, -12) + 0.2;
          return { v: vo, i: io, p: 0, rows: [["V+ − V−", st.vd || 0, "V"], ["Vout", vo, "V"], ["Iout", io, "A"], ["state", sat ? "saturated" : "linear", ""]] };
        },
      };
    },
    timer555(e) {
      const st = e.st;
      if (st.q == null) st.q = 1;
      return {
        stamp(c) {
          const vcc = e.n[0], gnd = e.n[1], dis = e.n[4], out = e.n[5];
          const Vcc = Math.max(0, (st.vcc == null ? 0 : st.vcc));
          c.G(vcc, gnd, 1 / 3000);                                  // quiescent current
          c.G(out, gnd, 1 / 10); c.I(gnd, out, (st.q ? Math.max(0, Vcc - 1.5) : 0.05) / 10);
          c.G(dis, gnd, st.q ? OPEN : 1 / 10);
          c.G(e.n[2], gnd, 1e-8); c.G(e.n[3], gnd, 1e-8);
        },
        accept(c) {
          const g = c.v[e.n[1]], Vcc = c.v[e.n[0]] - g, trig = c.v[e.n[2]] - g, thr = c.v[e.n[3]] - g;
          st.vcc = Vcc;
          if (Vcc < 2) st.q = 0;
          else if (trig < Vcc / 3) st.q = 1;
          else if (thr > 2 * Vcc / 3) st.q = 0;
        },
        info(c) {
          const g = c.v[e.n[1]];
          return { v: c.v[e.n[5]] - g, i: 0, p: 0, rows: [["OUT", st.q ? "HIGH" : "LOW", ""], ["Vout", c.v[e.n[5]] - g, "V"], ["TRIG", c.v[e.n[2]] - g, "V"], ["THR", c.v[e.n[3]] - g, "V"]] };
        },
      };
    },
    gate(e) {
      const st = e.st, type = e.type, nin = type === "not" ? 1 : 2;
      const logic = (a, b) => ({ not: !a, and: a && b, or: a || b, nand: !(a && b), nor: !(a || b), xor: a !== b })[type];
      if (st.y == null) st.y = logic(false, false) ? 1 : 0;
      return {
        stamp(c) {
          const o = e.n[nin];
          for (let k = 0; k < nin; k++) c.G(e.n[k], 0, 1e-6);         // 1 MΩ pull-down: open inputs read 0
          c.G(o, 0, 1 / 25); c.I(0, o, (st.y ? 5 : 0) / 25);
        },
        accept(c) {
          const a = c.v[e.n[0]] > 2.5, b = nin > 1 ? c.v[e.n[1]] > 2.5 : false;
          st.y = logic(a, b) ? 1 : 0;
        },
        info(c) {
          const ins = [];
          for (let k = 0; k < nin; k++) ins.push(c.v[e.n[k]] > 2.5 ? 1 : 0);
          return { v: c.v[e.n[nin]], i: 0, p: 0, rows: [["in", ins.join(" "), ""], ["out", st.y, ""]] };
        },
      };
    },
    switch(e) {
      const closed = () => e.p.on === true || e.p.on === "true";
      return {
        stamp(c) { c.G(e.n[0], e.n[1], closed() ? 1e3 : OPEN); }, accept() {},
        info(c) { const v = c.v[e.n[0]] - c.v[e.n[1]], i = v * (closed() ? 1e3 : OPEN); return { v: v, i: i, p: v * i, rows: [["state", closed() ? "closed" : "open", ""]] }; },
      };
    },
    spdt(e) {
      return {
        stamp(c) { const a = e.p.pos !== "B"; c.G(e.n[0], e.n[1], a ? 1e3 : OPEN); c.G(e.n[0], e.n[2], a ? OPEN : 1e3); }, accept() {},
        info(c) { const to = e.p.pos !== "B" ? 1 : 2, v = c.v[e.n[0]] - c.v[e.n[to]]; return { v: v, i: v * 1e3, p: 0, rows: [["COM →", e.p.pos !== "B" ? "A" : "B", ""]] }; },
      };
    },
    relay(e) {
      const st = e.st, coil = MODELS.inductor({ n: [e.n[0], e.n[1]], p: { L: 0, R: 0 }, st: st });
      const cp = () => ({ L: num(e.p.Lcoil, 0.05), R: num(e.p.Rcoil, 70) });
      if (st.on == null) st.on = false;
      return {
        stamp(c) {
          const q = cp(); coil.p = q;
          const g = 1 / (q.R + q.L / c.dt);
          c.G(e.n[0], e.n[1], g); c.I(e.n[0], e.n[1], g * (q.L / c.dt) * (st.il || 0));
          c.G(e.n[2], e.n[3], st.on ? 1e3 : OPEN); c.G(e.n[2], e.n[4], st.on ? OPEN : 1e3);
        },
        accept(c) {
          const q = cp(), v = c.v[e.n[0]] - c.v[e.n[1]];
          st.il = (v + (q.L / c.dt) * (st.il || 0)) / (q.R + q.L / c.dt);
          const pull = 0.7 * num(e.p.Vcoil, 5) / q.R, drop = 0.3 * num(e.p.Vcoil, 5) / q.R;
          if (!st.on && Math.abs(st.il) > pull) st.on = true;
          else if (st.on && Math.abs(st.il) < drop) st.on = false;
        },
        info(c) { const v = c.v[e.n[0]] - c.v[e.n[1]]; return { v: v, i: st.il || 0, p: v * (st.il || 0), rows: [["coil I", st.il || 0, "A"], ["COM →", st.on ? "NO" : "NC", ""]] }; },
      };
    },
    fuse(e) {
      const st = e.st, R = 0.02;
      return {
        stamp(c) { c.G(e.n[0], e.n[1], st.burnt ? OPEN : 1 / R); },
        accept(c) {
          const i = st.burnt ? 0 : (c.v[e.n[0]] - c.v[e.n[1]]) / R, r = num(e.p.Ir, 1);
          if (st.burnt) return;
          const x = Math.abs(i) / r;
          st.heat = Math.max(0, (st.heat || 0) + (x * x - 1) * c.dt);      // I²t above the rating
          if (x > 10 || st.heat > 0.05) { st.burnt = "blown"; c.events.push("blown"); }
        },
        info(c) { const v = c.v[e.n[0]] - c.v[e.n[1]], i = st.burnt ? 0 : v / R; return { v: v, i: i, p: v * i, rows: [["state", st.burnt ? "blown" : "ok", ""]] }; },
      };
    },
    lamp(e) {
      const st = e.st, R = () => Math.max(1e-3, num(e.p.Vr, 12) * num(e.p.Vr, 12) / num(e.p.Wr, 5));
      return {
        stamp(c) { c.G(e.n[0], e.n[1], st.burnt ? OPEN : 1 / R()); },
        accept(c) { const v = c.v[e.n[0]] - c.v[e.n[1]], P = v * v / R(); burnCheck(st, P <= num(e.p.Wr, 5) * 2, "burnt", c, P > num(e.p.Wr, 5) * 5); },
        info(c) { const v = c.v[e.n[0]] - c.v[e.n[1]], i = st.burnt ? 0 : v / R(), p = v * i; return { v: v, i: i, p: p, glow: st.burnt ? 0 : Math.min(1.4, Math.sqrt(Math.abs(p) / num(e.p.Wr, 5))) }; },
      };
    },
    motor(e) {
      const st = e.st;
      if (st.w == null) { st.w = 0; st.ang = 0; }
      return {
        stamp(c) {   // armature: R in series with back-EMF k·ω
          const R = Math.max(1e-3, num(e.p.R, 2));
          c.G(e.n[0], e.n[1], 1 / R); c.I(e.n[1], e.n[0], num(e.p.ke, 0.01) * st.w / R);
        },
        accept(c) {
          const R = Math.max(1e-3, num(e.p.R, 2)), k = num(e.p.ke, 0.01), v = c.v[e.n[0]] - c.v[e.n[1]], i = (v - k * st.w) / R;
          const torque = k * i - 1e-6 * st.w - Math.sign(st.w) * num(e.p.load, 0) * (Math.abs(st.w) > 1e-3 ? 1 : 0);
          st.w += torque / num(e.p.J, 2e-5) * c.dt;
          if (num(e.p.load, 0) > Math.abs(k * i) && Math.abs(st.w) < 0.5) st.w = 0;
          st.ang += st.w * c.dt; st.i = i;
        },
        info(c) {
          const v = c.v[e.n[0]] - c.v[e.n[1]], i = st.i || 0;
          return { v: v, i: i, p: v * i, spin: st.w, rows: [["speed", st.w * 60 / (2 * Math.PI), "rpm"], ["back-EMF", num(e.p.ke, 0.01) * st.w, "V"], ["torque", num(e.p.ke, 0.01) * i, "N·m"]] };
        },
      };
    },
    buzzer(e) {
      return {
        stamp(c) { c.G(e.n[0], e.n[1], 1 / Math.max(1, num(e.p.R, 120))); }, accept() {},
        info(c) { const v = c.v[e.n[0]] - c.v[e.n[1]], i = v / Math.max(1, num(e.p.R, 120)); return { v: v, i: i, p: v * i, sound: v > num(e.p.Von, 2) }; },
      };
    },
    seg7(e) {
      const st = e.st, lp = ledParams("red"), nvt = lp.n * VT, vcrit = nvt * Math.log(nvt / (Math.SQRT2 * lp.Is));
      st.vj = st.vj || [0, 0, 0, 0, 0, 0, 0, 0]; st.seg = st.seg || [0, 0, 0, 0, 0, 0, 0, 0];
      const ends = (k) => (e.p.common === "anode" ? [e.n[8], e.n[k]] : [e.n[k], e.n[8]]);
      return {
        stamp(c) {
          for (let k = 0; k < 8; k++) {
            const ab = ends(k), vd = c.v[ab[0]] - c.v[ab[1]], lim = pnjlim(vd, st.vj[k], nvt, vcrit);
            if (Math.abs(lim - vd) > 1e-9) c.limited();
            st.vj[k] = lim;
            c.NL2(ab[0], ab[1], lp.Is * (limexp(lim / nvt) - 1), lp.Is / nvt * dlimexp(lim / nvt) + GMIN, lim);
          }
        },
        accept(c) { for (let k = 0; k < 8; k++) { const ab = ends(k), vd = c.v[ab[0]] - c.v[ab[1]]; st.vj[k] = vd; st.seg[k] = lp.Is * (limexp(vd / nvt) - 1); } },
        info() {
          const lit = st.seg.map((i) => Math.max(0, Math.min(1.4, i / 0.01)));
          return { v: 0, i: st.seg.reduce((a, b) => a + Math.max(0, b), 0), p: 0, segments: lit, rows: [["lit", "abcdefg.".split("").filter((s, k) => lit[k] > 0.15).join(" ") || "—", ""]] };
        },
      };
    },
    voltmeter(e) {
      const st = e.st;
      return {
        stamp(c) { c.G(e.n[0], e.n[1], 1e-7); },
        accept(c) { const v = c.v[e.n[0]] - c.v[e.n[1]]; st.sq = (st.sq || 0) * Math.exp(-c.dt / 0.2) + v * v * (1 - Math.exp(-c.dt / 0.2)); },
        info(c) { const v = c.v[e.n[0]] - c.v[e.n[1]]; return { v: v, i: v * 1e-7, p: 0, reading: e.p.mode === "rms" ? Math.sqrt(st.sq || 0) : v, unit: "V" }; },
      };
    },
    ammeter(e) {
      const st = e.st, R = 1e-3;
      return {
        stamp(c) { c.G(e.n[0], e.n[1], 1 / R); },
        accept(c) { const i = (c.v[e.n[0]] - c.v[e.n[1]]) / R; st.sq = (st.sq || 0) * Math.exp(-c.dt / 0.2) + i * i * (1 - Math.exp(-c.dt / 0.2)); },
        info(c) { const i = (c.v[e.n[0]] - c.v[e.n[1]]) / R; return { v: i * R, i: i, p: i * i * R, reading: e.p.mode === "rms" ? Math.sqrt(st.sq || 0) : i, unit: "A" }; },
      };
    },
  };
  const MODEL_OF = {
    resistor: (e) => MODELS.resistor(e), pot: (e) => MODELS.pot(e), ldr: (e) => MODELS.ldr(e), ntc: (e) => MODELS.ntc(e),
    capacitor: (e) => MODELS.capacitor(e, false), electrolytic: (e) => MODELS.capacitor(e, true), inductor: (e) => MODELS.inductor(e),
    transformer: (e) => MODELS.transformer(e), battery: (e) => MODELS.battery(e), dcsupply: (e) => MODELS.dcsupply(e),
    acsource: (e) => MODELS.acsource(e), isource: (e) => MODELS.isource(e), ground: (e) => MODELS.ground(e),
    diode: (e) => MODELS.diode(e, "diode"), schottky: (e) => MODELS.diode(e, "schottky"), zener: (e) => MODELS.diode(e, "zener"), led: (e) => MODELS.diode(e, "led"),
    npn: (e) => MODELS.bjt(e, 1), pnp: (e) => MODELS.bjt(e, -1), nmos: (e) => MODELS.mos(e, 1), pmos: (e) => MODELS.mos(e, -1),
    opamp: (e) => MODELS.opamp(e), timer555: (e) => MODELS.timer555(e),
    not: (e) => MODELS.gate(e), and: (e) => MODELS.gate(e), or: (e) => MODELS.gate(e), nand: (e) => MODELS.gate(e), nor: (e) => MODELS.gate(e), xor: (e) => MODELS.gate(e),
    switch: (e) => MODELS.switch(e), button: (e) => MODELS.switch(e), spdt: (e) => MODELS.spdt(e), relay: (e) => MODELS.relay(e), fuse: (e) => MODELS.fuse(e),
    lamp: (e) => MODELS.lamp(e), motor: (e) => MODELS.motor(e), buzzer: (e) => MODELS.buzzer(e), seg7: (e) => MODELS.seg7(e),
    voltmeter: (e) => MODELS.voltmeter(e), ammeter: (e) => MODELS.ammeter(e),
  };

  // ------------------------------------------------------------------ the simulator
  function create(circuit, opts) {
    opts = opts || {};
    const S = { t: 0, damage: opts.damage !== false, states: {}, events: [], warn: null, circuit: null, n: 0, v: new Float64Array(1), els: [], netOfPin: {}, noGround: false, iters: 0 };

    function build(circ) {
      S.circuit = circ;
      const conn = connectivity(circ);
      const netId = new Map();
      let next = 1;
      const groundRoots = new Set();
      circ.parts.forEach((p) => { if (p.type === "ground" && conn.pinPos[p.id]) { const q = conn.pinPos[p.id][0]; groundRoots.add(conn.find(key(q[0], q[1]))); } });
      S.noGround = !groundRoots.size;
      if (S.noGround) {   // no ground symbol: the − of the first source (or any pin) becomes 0 V
        const src = circ.parts.find((p) => /^(battery|dcsupply|acsource|isource)$/.test(p.type)) || circ.parts.find((p) => PARTS[p.type]);
        if (src) { const pins = conn.pinPos[src.id], q = pins[pins.length > 1 ? 1 : 0]; groundRoots.add(conn.find(key(q[0], q[1]))); }
      }
      const nodeOf = (q) => {
        const r = conn.find(key(q[0], q[1]));
        if (groundRoots.has(r)) return 0;
        if (!netId.has(r)) netId.set(r, next++);
        return netId.get(r);
      };
      S.netOfPin = {};
      S.els = [];
      const keep = {};
      circ.parts.forEach((p) => {
        const def = PARTS[p.type];
        if (!def) return;
        const nodes = conn.pinPos[p.id].map(nodeOf);
        S.netOfPin[p.id] = nodes;
        const st = S.states[p.id] || {};
        keep[p.id] = st;
        const e = { id: p.id, type: p.type, n: nodes, p: p.p || {}, st: st };
        e.m = MODEL_OF[p.type](e);
        S.els.push(e);
      });
      S.states = keep;
      S.pointNode = (x, y) => (conn.has(key(x, y)) ? nodeOf([x, y]) : null);
      const n = next - 1;
      const oldV = S.v;
      S.n = n;
      S.v = new Float64Array(n + 1);
      if (oldV.length === S.v.length) S.v.set(oldV);
      S.A = new Float64Array(Math.max(1, n * n));
      S.b = new Float64Array(Math.max(1, n));
      S.conn = conn;
    }

    // stamping context
    const c = {
      v: null, dt: 1e-5, t: 0, damage: true, events: S.events, _lim: false,
      A(r, col, g) { if (r > 0 && col > 0) S.A[(r - 1) * S.n + (col - 1)] += g; },
      G(a, b, g) {
        const n = S.n, A = S.A;
        if (a > 0) A[(a - 1) * n + a - 1] += g;
        if (b > 0) A[(b - 1) * n + b - 1] += g;
        if (a > 0 && b > 0) { A[(a - 1) * n + b - 1] -= g; A[(b - 1) * n + a - 1] -= g; }
      },
      I(a, b, i) { if (a > 0) S.b[a - 1] -= i; if (b > 0) S.b[b - 1] += i; },
      NL2(a, b, i, g, vlin) { c.G(a, b, g); const ieq = i - g * vlin; c.I(a, b, ieq); },
      // rows: nodes whose KCL gets a current; I0[k] current leaving rows[k] into the device; J[k][j] = dI_k/dV(cols[j]),
      // linearised at node voltages vlin[j]
      NL(rows, I0, J, vlin, cols) {
        cols = cols || rows;
        for (let k = 0; k < rows.length; k++) {
          const r = rows[k];
          if (r <= 0) continue;
          let s = I0[k];
          for (let j = 0; j < cols.length; j++) { s -= J[k][j] * vlin[j]; if (cols[j] > 0) S.A[(r - 1) * S.n + cols[j] - 1] += J[k][j]; }
          S.b[r - 1] -= s;
        }
      },
      limited() { c._lim = true; },
    };

    function newton(dt) {
      const n = S.n;
      c.dt = dt; c.t = S.t; c.damage = S.damage;
      const v = new Float64Array(S.v);
      c.v = v;
      for (let it = 0; it < 80; it++) {
        S.A.fill(0); S.b.fill(0); c._lim = false;
        for (let k = 0; k < n; k++) S.A[k * n + k] += GMIN;
        for (let k = 0; k < S.els.length; k++) S.els[k].m.stamp(c);
        const A = S.A, x = S.b;
        if (n && !solve(A, x, n)) return null;
        let delta = 0;
        for (let k = 0; k < n; k++) {
          let nv = x[k];
          if (!isFinite(nv)) return null;
          const d = nv - v[k + 1];
          delta = Math.max(delta, Math.abs(d) / (1 + Math.abs(nv) * 1e-3));
          v[k + 1] = nv;
        }
        S.iters = it + 1;
        if (delta < 1e-6 && !c._lim) return v;
      }
      return null;
    }

    function step(dt) {
      let v = newton(dt);
      let used = dt;
      if (!v) {   // hard step (a switch flipped, a diode snapped on): retry with smaller steps
        let sub = dt;
        for (let k = 0; k < 4 && !v; k++) { sub /= 4; v = newton(sub); used = sub; }
        S.warn = v ? null : "convergence";
        if (!v) { c.v = S.v; used = dt; v = S.v; }
      } else S.warn = null;
      c.v = v; c.dt = used;
      S.v = v;
      for (let k = 0; k < S.els.length; k++) S.els[k].m.accept(c);
      S.t += used;
      return used;
    }

    function partInfo(id) {
      const e = S.els.find((x) => x.id === id);
      if (!e) return null;
      c.v = S.v; c.t = S.t;
      const r = e.m.info(c) || {};
      r.burnt = e.st.burnt || null;
      r.pinV = e.n.map((nd) => S.v[nd] || 0);
      return r;
    }

    // currents leaving each node into a device, from its own stamps evaluated at the solution: drives the moving
    // dots on the wires. Returns {partId: [current into the device at each pin]}.
    function pinCurrents() {
      const out = {};
      const n = S.n;
      const v = S.v;
      const save = { A: S.A, b: S.b, n: S.n };
      S.els.forEach((e) => {
        S.A = new Float64Array(Math.max(1, n * n)); S.b = new Float64Array(Math.max(1, n));
        const st = JSON.stringify(e.st);
        c.v = v; c._lim = false;
        e.m.stamp(c);
        Object.assign(e.st, JSON.parse(st));
        const leave = {};
        e.n.forEach((nd) => {
          if (nd <= 0 || leave[nd] != null) return;
          let s = -S.b[nd - 1];
          for (let j = 0; j < n; j++) s += S.A[(nd - 1) * n + j] * v[j + 1];
          leave[nd] = s;
        });
        const share = {};
        e.n.forEach((nd) => { share[nd] = (share[nd] || 0) + 1; });
        out[e.id] = e.n.map((nd) => (nd > 0 ? leave[nd] / share[nd] : NaN));
      });
      S.A = save.A; S.b = save.b;
      // ground pins: whatever balances the device's other pins
      Object.keys(out).forEach((id) => {
        const a = out[id];
        const known = a.filter((x) => !isNaN(x)).reduce((s, x) => s + x, 0), gcount = a.filter((x) => isNaN(x)).length;
        for (let k = 0; k < a.length; k++) if (isNaN(a[k])) a[k] = gcount ? -known / gcount : 0;
      });
      return out;
    }

    function reset() {
      S.t = 0; S.states = {}; S.events.length = 0; S.warn = null;
      build(S.circuit);
      S.v.fill(0);
    }

    build(circuit);
    return {
      get t() { return S.t; }, get warn() { return S.warn; }, get noGround() { return S.noGround; }, get nodes() { return S.n; },
      get events() { return S.events; }, get iterations() { return S.iters; },
      set damage(on) { S.damage = !!on; }, get damage() { return S.damage; },
      step: step, partInfo: partInfo, pinCurrents: pinCurrents, reset: reset,
      update(circ) { build(circ); },
      nodeVoltage(nd) { return S.v[nd] || 0; },
      pointVoltage(x, y) { const nd = S.pointNode ? S.pointNode(x, y) : null; return nd == null ? null : S.v[nd] || 0; },
      pointNode(x, y) { return S.pointNode ? S.pointNode(x, y) : null; },
      pinNodes(id) { return S.netOfPin[id] || []; },
      state(id) { return S.states[id] || {}; },
      repair(id) { if (S.states[id]) { delete S.states[id].burnt; S.states[id].over = 0; S.states[id].heat = 0; } },
    };
  }

  // resistor colour code: 4 bands (digit, digit, multiplier, tolerance) as CSS colours + names; SMD 3-digit code
  const BAND = [["#111111", "black"], ["#7a4a1d", "brown"], ["#d42020", "red"], ["#f08a10", "orange"], ["#f5d90a", "yellow"], ["#1e9e3a", "green"],
    ["#1f5fd6", "blue"], ["#8a3fd1", "violet"], ["#8d8d8d", "grey"], ["#f4f4f4", "white"]];
  function bands(R, tol) {
    if (!(R > 0)) return [BAND[0], BAND[0], BAND[0], ["#d4af37", "gold"]];
    let e = Math.floor(Math.log10(R)) - 1, sig = Math.round(R / Math.pow(10, e));
    if (sig >= 100) { sig = Math.round(sig / 10); e += 1; }
    const mult = e >= 0 && e <= 9 ? BAND[e] : e === -1 ? ["#d4af37", "gold"] : e === -2 ? ["#c0c0c0", "silver"] : BAND[0];
    const tc = { 1: BAND[1], 2: BAND[2], 5: ["#d4af37", "gold"], 10: ["#c0c0c0", "silver"] }[tol] || ["#d4af37", "gold"];
    return [BAND[Math.floor(sig / 10)], BAND[sig % 10], mult, tc];
  }
  function smdCode(R) {
    if (!(R > 0)) return "000";
    if (R < 10) return String(Number(R.toPrecision(2))).replace(".", "R");
    let e = Math.floor(Math.log10(R)) - 1, sig = Math.round(R / Math.pow(10, e));
    if (sig >= 100) { sig = Math.round(sig / 10); e += 1; }
    return String(sig) + String(e);
  }

  const api = { PARTS: PARTS, bands: bands, smdCode: smdCode, LED_VF: LED_VF, CATS: CATS, LED_RGB: LED_RGB, create: create, parseValue: parseValue, fmt: fmt, rotate: rotate,
    pinPositions: pinPositions, connectivity: connectivity, onSegment: onSegment, waveValue: waveValue };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CircuitSim = api;
})(typeof self !== "undefined" ? self : this);
