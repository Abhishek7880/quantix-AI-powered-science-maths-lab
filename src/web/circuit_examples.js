/* Quantix Circuit Lab — ready-made example circuits (grid coordinates; see circuit_sim.js for pin positions).
   Each example: id, title, blurb (en / hi), speed (simulated seconds per real second), tdiv (scope time/div),
   scope channels ([label, "v" | "i"]) and build() -> { parts, wires }. */
(function (root) {
  "use strict";
  const T = (en, hi) => ({ en: en, hi: hi });

  function maker() {
    const counts = {}, parts = [], wires = [];
    const CS = root.CircuitSim || (typeof require !== "undefined" ? require("./circuit_sim.js") : null);
    let n = 0;
    function P(type, x, y, rot, p, label) {
      const def = CS.PARTS[type];
      counts[def.prefix] = (counts[def.prefix] || 0) + 1;
      const params = {};
      def.params.forEach((q) => { params[q.k] = q.v; });
      Object.assign(params, p || {});
      const part = { id: "e" + (++n), type: type, x: x, y: y, rot: rot || 0, label: label || def.prefix + counts[def.prefix], p: params };
      parts.push(part);
      return part;
    }
    function L() {   // polyline of axis-aligned segments: L(x1, y1, x2, y2, x3, y3, ...)
      const a = arguments;
      for (let k = 0; k + 3 < a.length; k += 2) wires.push({ x1: a[k], y1: a[k + 1], x2: a[k + 2], y2: a[k + 3] });
    }
    return { P: P, L: L, done: () => ({ parts: parts, wires: wires }) };
  }

  const EXAMPLES = [
    { id: "led", title: T("LED with resistor and switch", "प्रतिरोधक और स्विच के साथ एलईडी"), speed: 1, tdiv: 0.2, scope: [["LED1", "i"], ["R1", "v"]],
      blurb: T("9 V → switch → 470 Ω → red LED. I = (9 − 1.8) / 470 ≈ 15 mA. Click the switch; try deleting the resistor and see the LED burn.",
        "9 V → स्विच → 470 Ω → लाल एलईडी। I = (9 − 1.8) / 470 ≈ 15 mA. स्विच क्लिक करें; प्रतिरोधक हटाकर एलईडी जलते देखें।"),
      build(m) {
        m.P("battery", 0, 4, 0, { V: 9 }); m.P("ground", 0, 6);
        m.P("switch", 4, 0, 0, { on: true }); m.P("resistor", 8, 0, 0, { R: 470 }); m.P("led", 12, 2, 1, { color: "red" });
        m.L(0, 2, 0, 0, 2, 0); m.L(10, 0, 12, 0); m.L(12, 4, 12, 6, 0, 6);
      } },
    { id: "divider", title: T("Voltage divider and potentiometer", "वोल्टेज विभाजक और पोटेंशियोमीटर"), speed: 1, tdiv: 0.2, scope: [["VM1", "v"], ["VM2", "v"]],
      blurb: T("Vout = Vin × R2 / (R1 + R2) = 12 × 10k / 20k = 6 V. Move the potentiometer wiper to set any voltage from 0 to 12 V.",
        "Vout = Vin × R2 / (R1 + R2) = 12 × 10k / 20k = 6 V. पोटेंशियोमीटर का वाइपर खिसकाकर 0 से 12 V तक कोई भी वोल्टेज पाएँ।"),
      build(m) {
        m.P("battery", 0, 4, 0, { V: 12 }); m.P("ground", 0, 8);
        m.P("resistor", 6, 2, 1, { R: 10000 }); m.P("resistor", 6, 6, 1, { R: 10000 });
        m.P("voltmeter", 10, 6, 1); m.P("pot", 14, 4, 1, { R: 10000, pos: 50 }); m.P("voltmeter", 18, 6, 1);
        m.L(0, 2, 0, 0, 6, 0); m.L(6, 0, 14, 0, 14, 2); m.L(0, 6, 0, 8, 6, 8); m.L(6, 4, 10, 4); m.L(10, 8, 6, 8);
        m.L(14, 6, 14, 8, 10, 8); m.L(16, 4, 18, 4); m.L(18, 8, 14, 8);
      } },
    { id: "rc", title: T("RC charging and discharging", "RC आवेशन और निरावेशन"), speed: 1, tdiv: 0.5, scope: [["C1", "v"], ["R1", "i"]],
      blurb: T("10 kΩ × 100 µF: τ = R·C = 1 s. The capacitor reaches 63 % in 1 τ and ~99 % in 5 τ. Flip SW1 to B to discharge.",
        "10 kΩ × 100 µF: τ = R·C = 1 s. संधारित्र 1 τ में 63 % और 5 τ में ~99 % तक आवेशित होता है। निरावेशन के लिए SW1 को B पर करें।"),
      build(m) {
        m.P("battery", 0, 4, 0, { V: 10 }); m.P("ground", 0, 6);
        m.P("spdt", 4, 1, 2, { pos: "A" }); m.P("resistor", 8, 1, 0, { R: 10000 }); m.P("capacitor", 10, 3, 1, { C: 100e-6 }); m.P("voltmeter", 13, 3, 1);
        m.L(0, 2, 2, 2); m.L(2, 0, -2, 0, -2, 6, 0, 6); m.L(10, 5, 10, 6, 0, 6); m.L(10, 1, 13, 1); m.L(13, 5, 10, 5);
      } },
    { id: "halfwave", title: T("Half-wave rectifier with smoothing", "स्मूदिंग के साथ अर्ध-तरंग दिष्टकारी"), speed: 0.05, tdiv: 0.005, scope: [["V1", "v"], ["R1", "v"]],
      blurb: T("The diode passes only the positive half; the 470 µF capacitor fills the gaps. Ripple ≈ I / (f·C). Delete C1 to see the raw pulses.",
        "डायोड केवल धनात्मक आधा भाग पास करता है; 470 µF संधारित्र खाली जगह भरता है। रिपल ≈ I / (f·C). कच्ची तरंग देखने के लिए C1 हटाएँ।"),
      build(m) {
        m.P("acsource", 0, 4, 0, { Vp: 12, f: 50 }); m.P("ground", 0, 6);
        m.P("diode", 4, 0); m.P("electrolytic", 8, 2, 1, { C: 470e-6 }); m.P("resistor", 12, 2, 1, { R: 1000 });
        m.L(0, 2, 0, 0, 2, 0); m.L(6, 0, 8, 0, 12, 0); m.L(8, 4, 8, 6); m.L(12, 4, 12, 6, 0, 6);
      } },
    { id: "bridge", title: T("230 V mains → 15 V DC power supply", "230 V मेन्स → 15 V डीसी पावर सप्लाई"), speed: 0.05, tdiv: 0.005, scope: [["C1", "v"], ["D1", "i"]],
      blurb: T("Transformer 19 : 1 (325 V peak → 17 V peak), bridge rectifier (4 diodes), 1000 µF smoothing, LED power indicator. Output ≈ 17 − 1.6 = 15.5 V.",
        "ट्रांसफ़ॉर्मर 19 : 1 (325 V शिखर → 17 V शिखर), ब्रिज रेक्टिफ़ायर (4 डायोड), 1000 µF स्मूदिंग, एलईडी पावर संकेतक। आउटपुट ≈ 17 − 1.6 = 15.5 V।"),
      build(m) {
        m.P("acsource", 0, 4, 0, { Vp: 325, f: 50 }); m.P("ground", 0, 6); m.P("transformer", 4, 4, 0, { n: 19 });
        m.P("diode", 8, 0, 3); m.P("diode", 8, 6, 3); m.P("diode", 12, 2, 3); m.P("diode", 12, 8, 3);
        m.P("electrolytic", 16, 0, 1, { C: 1000e-6, Vmax: 35 }); m.P("resistor", 20, 0, 1, { R: 1000 }); m.P("led", 20, 4, 1, { color: "green" });
        m.P("voltmeter", 24, 0, 1); m.P("ground", 16, 10);
        m.L(0, 2, 2, 2); m.L(0, 6, 2, 6); m.L(6, 2, 8, 2); m.L(8, 4, 8, 2); m.L(6, 6, 12, 6); m.L(12, 4, 12, 6);
        m.L(8, 8, 8, 10); m.L(8, -2, 12, -2, 16, -2, 20, -2, 24, -2); m.L(12, 0, 12, -2);
        m.L(8, 10, 12, 10, 16, 10, 20, 10, 24, 10); m.L(16, 2, 16, 10); m.L(20, 6, 20, 10); m.L(24, 2, 24, 10);
      } },
    { id: "zener", title: T("Zener voltage regulator", "ज़ेनर वोल्टेज नियामक"), speed: 1, tdiv: 0.2, scope: [["VM1", "v"], ["D1", "i"]],
      blurb: T("The 5.1 V Zener holds the output steady. Change the battery from 9 V to 15 V: the output barely moves, the extra drops across R1.",
        "5.1 V ज़ेनर आउटपुट स्थिर रखता है। बैटरी 9 V से 15 V करें: आउटपुट लगभग नहीं बदलता, अतिरिक्त वोल्टेज R1 पर गिरता है।"),
      build(m) {
        m.P("battery", 0, 4, 0, { V: 12 }); m.P("ground", 0, 6);
        m.P("resistor", 2, 0, 0, { R: 470 }); m.P("zener", 6, 2, 3, { Vz: 5.1 }); m.P("resistor", 10, 2, 1, { R: 1000 }); m.P("voltmeter", 13, 2, 1);
        m.L(0, 2, 0, 0); m.L(4, 0, 6, 0, 10, 0, 13, 0); m.L(6, 4, 6, 6); m.L(10, 4, 10, 6, 0, 6); m.L(13, 4, 10, 4);
      } },
    { id: "nightlight", title: T("Automatic night light (LDR + transistor)", "स्वचालित नाइट लाइट (LDR + ट्रांज़िस्टर)"), speed: 1, tdiv: 0.2, scope: [["LED1", "i"], ["Q1", "v"]],
      blurb: T("Bright light: the LDR's resistance is low, the base voltage stays under 0.6 V and the LED is off. Slide the light down (dark): the transistor switches the LED on.",
        "तेज़ रोशनी: LDR का प्रतिरोध कम, बेस वोल्टेज 0.6 V से कम, एलईडी बंद। रोशनी कम करें (अँधेरा): ट्रांज़िस्टर एलईडी चालू करता है।"),
      build(m) {
        m.P("battery", 0, 4, 0, { V: 9 }); m.P("ground", 0, 10);
        m.P("resistor", 4, -4, 1, { R: 47000 }); m.P("ldr", 4, 4, 1, { lux: 500 }); m.P("resistor", 8, 4, 0, { R: 10000 });
        m.P("npn", 12, 4); m.P("resistor", 13, -4, 1, { R: 470 }); m.P("led", 13, 0, 1, { color: "white" });
        m.L(0, 2, 0, -6, 13, -6); m.L(4, -2, 4, 2); m.L(4, 0, 6, 0, 6, 4); m.L(4, 6, 4, 10); m.L(13, 6, 13, 10); m.L(0, 6, 0, 10, 13, 10);
      } },
    { id: "mosfet", title: T("MOSFET motor driver with flyback diode", "फ़्लाईबैक डायोड के साथ मॉस्फ़ेट मोटर ड्राइवर"), speed: 1, tdiv: 0.2, scope: [["M1", "i"], ["Q1", "v"]],
      blurb: T("SW1 pulls the gate to 12 V and the MOSFET switches the motor. R2 keeps the gate at 0 V when the switch is open. Add load torque and watch the current rise.",
        "SW1 गेट को 12 V पर खींचता है और मॉस्फ़ेट मोटर चालू करता है। स्विच खुला हो तो R2 गेट को 0 V पर रखता है। लोड बलाघूर्ण बढ़ाकर धारा बढ़ते देखें।"),
      build(m) {
        m.P("battery", 0, 4, 0, { V: 12 }); m.P("ground", 0, 10);
        m.P("motor", 12, -2, 1); m.P("diode", 15, -2, 3); m.P("nmos", 11, 2);
        m.P("switch", 6, -2, 1, { on: true }); m.P("resistor", 6, 6, 1, { R: 10000 });
        m.L(0, 2, 0, -4, 15, -4); m.L(12, 0, 15, 0); m.L(12, 4, 12, 10); m.L(6, 0, 6, 4); m.L(6, 2, 9, 2); m.L(6, 8, 6, 10); m.L(0, 6, 0, 10, 12, 10);
      } },
    { id: "opamp", title: T("Op-amp inverting amplifier (×10)", "ऑप-एम्प इनवर्टिंग एम्पलीफ़ायर (×10)"), speed: 0.001, tdiv: 0.0005, scope: [["V1", "v"], ["U1", "v"]],
      blurb: T("Gain = −Rf / Rin = −10k / 1k = −10. A 0.5 V, 1 kHz input becomes 5 V, flipped. Raise the input above 1.2 V and the output clips at the ±12 V rails.",
        "लाभ = −Rf / Rin = −10k / 1k = −10. 0.5 V, 1 kHz इनपुट 5 V उल्टा बनता है। इनपुट 1.2 V से अधिक करें तो आउटपुट ±12 V पर कट जाता है।"),
      build(m) {
        m.P("acsource", -8, 4, 0, { Vp: 0.5, f: 1000 }); m.P("ground", -8, 6);
        m.P("opamp", 0, 0); m.P("resistor", -4, -2, 0, { R: 1000 }); m.P("resistor", 1, -4, 0, { R: 10000 }); m.P("ground", -2, 3);
        m.P("resistor", 6, 2, 1, { R: 10000 }); m.P("ground", 6, 6);
        m.L(-8, 2, -8, -2, -6, -2); m.L(-2, -2, -2, -1); m.L(-2, -2, -1, -2, -1, -4); m.L(3, -4, 3, 0, 6, 0); m.L(-2, 1, -2, 3); m.L(6, 4, 6, 6);
      } },
    { id: "blinker", title: T("555 timer LED blinker", "555 टाइमर एलईडी ब्लिंकर"), speed: 1, tdiv: 0.2, scope: [["C1", "v"], ["U1", "v"]],
      blurb: T("Astable 555: f ≈ 1.44 / ((R1 + 2·R2)·C) = 1.44 / (21 kΩ × 47 µF) ≈ 1.5 Hz. The capacitor swings between ⅓ and ⅔ of 9 V.",
        "अस्थिर 555: f ≈ 1.44 / ((R1 + 2·R2)·C) = 1.44 / (21 kΩ × 47 µF) ≈ 1.5 Hz. संधारित्र 9 V के ⅓ और ⅔ के बीच झूलता है।"),
      build(m) {
        m.P("battery", -10, 0, 0, { V: 9 }); m.P("ground", -10, 10); m.P("timer555", 0, 0);
        m.P("resistor", 8, -4, 1, { R: 1000 }); m.P("resistor", 8, 3, 1, { R: 10000 }); m.P("electrolytic", -5, 8, 1, { C: 47e-6 });
        m.P("resistor", 11, 1, 1, { R: 470 }); m.P("led", 11, 5, 1, { color: "red" });
        m.L(-10, -2, -10, -6, 8, -6); m.L(0, -3, 0, -6); m.L(8, -2, 8, 1); m.L(3, 1, 8, 1); m.L(8, 5, 8, 6, -5, 6);
        m.L(-5, 6, -5, -1, -3, -1); m.L(-5, 1, -3, 1); m.L(3, -1, 11, -1); m.L(11, 7, 11, 10);
        m.L(-10, 2, -10, 10, 11, 10); m.L(0, 3, 0, 10);
      } },
    { id: "relay", title: T("Relay switching a 12 V lamp", "12 V बल्ब चलाता रिले"), speed: 1, tdiv: 0.1, scope: [["K1", "i"], ["LP1", "i"]],
      blurb: T("Hold the push button: coil current pulls the contact from NC to NO and the lamp lights. D1 absorbs the coil's switch-off voltage spike.",
        "पुश बटन दबाए रखें: कुंडली धारा संपर्क को NC से NO पर खींचती है और बल्ब जलता है। D1 कुंडली के बंद होने के वोल्टेज झटके को सोखता है।"),
      build(m) {
        m.P("battery", 0, 4, 0, { V: 12 }); m.P("ground", 0, 8);
        m.P("relay", 10, 2, 0, { Vcoil: 12, Rcoil: 280 }); m.P("button", 5, -2, 1); m.P("diode", 3, 2, 3); m.P("lamp", 17, -2, 1, { Vr: 12, Wr: 5 });
        m.L(0, 2, 0, -4, 17, -4); m.L(5, 0, 7, 0); m.L(3, 0, 5, 0); m.L(3, 4, 7, 4); m.L(7, 4, 7, 8); m.L(13, 0, 17, 0); m.L(13, 4, 13, 8); m.L(0, 6, 0, 8, 13, 8);
      } },
    { id: "logic", title: T("AND gate with two switches", "दो स्विच के साथ AND गेट"), speed: 1, tdiv: 0.2, scope: [["U1", "v"], ["LED1", "i"]],
      blurb: T("The LED lights only when SW1 AND SW2 are both on. Swap the gate for OR, XOR or NAND to check each truth table.",
        "एलईडी तभी जलती है जब SW1 और SW2 दोनों चालू हों। हर सत्य सारणी जाँचने के लिए गेट को OR, XOR या NAND से बदलें।"),
      build(m) {
        m.P("battery", -12, 4, 0, { V: 5 }); m.P("ground", -12, 6);
        m.P("switch", -6, -1, 0, { on: true }); m.P("switch", -6, 1, 0, { on: false }); m.P("and", 0, 0);
        m.P("resistor", 4, 0, 0, { R: 330 }); m.P("led", 6, 2, 1, { color: "green" });
        m.L(-12, 2, -12, -4, -8, -4, -8, -1); m.L(-8, 1, -8, -1); m.L(-4, -1, -2, -1); m.L(-4, 1, -2, 1); m.L(6, 4, 6, 6, -12, 6);
      } },
  ];
  EXAMPLES.forEach((ex) => { ex.make = () => { const m = maker(); ex.build(m); return m.done(); }; });

  if (typeof module !== "undefined" && module.exports) module.exports = EXAMPLES;
  else root.CIRCUIT_EXAMPLES = EXAMPLES;
})(typeof self !== "undefined" ? self : this);
