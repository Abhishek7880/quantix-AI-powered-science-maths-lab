/* Quantix Chemistry Lab — shelf (compounds + all 118 elements), 3D beaker on a burner, observations, equations.
   Engine: chem_engine.js. 3D: three.js (vendored). Element data: /api/v1/elements. */
(function () {
  "use strict";
  const CE = window.ChemEngine, THREE = window.THREE;
  const $ = (id) => document.getElementById(id);
  const TX = {
    en: { title: "Chemistry Lab", shelf: "Chemical shelf", compounds: "Compounds", elements: "Elements (118)", search: "Search chemicals…", add: "＋ Add to beaker",
      amount: "Amount", conc: "Concentration", burner: "Burner", stir: "Stir", container: "Container", empty: "🧽 Empty & wash", speed: "Speed", start: "Start temp.",
      experiments: "Experiments…", obs: "Observations", contents: "In the beaker", eqs: "Reactions", safety: "Safety", noReact: "No reaction", nothing: "The beaker is empty. Pick a chemical on the left, set the amount and press Add.",
      temp: "Temperature", ph: "pH", volume: "Volume", state: { s: "solid", l: "liquid", aq: "solution", g: "gas" }, off: "Off", low: "Low", med: "Medium", high: "High",
      pick: "Pick a chemical from the shelf", hazard: "⚠", tip: ["Pick a chemical on the shelf (or a whole experiment).", "Set how much, then press Add — add a second chemical to make them react.", "Use the burner and stirrer; drag the beaker to look around."], gotIt: "Got it",
      containers: [["beaker250", "Beaker 250 mL"], ["beaker100", "Beaker 100 mL"], ["beaker600", "Beaker 600 mL"], ["flask", "Conical flask 250 mL"], ["tube", "Test tube 25 mL"], ["crucible", "Crucible (for strong heating)"]],
      groups: { basic: "Water", acid: "Acids", base: "Bases & alkalis", salt: "Salts", oxide: "Oxides & catalysts", other: "Other", ind: "Indicators" },
      types: { neutral: "Neutralisation", carbonate: "Acid + carbonate", oxide: "Acid + metal oxide", gas: "Gas given off", metalacid: "Metal + acid", oxacid: "Metal + oxidising acid",
        metalwater: "Metal + water", slaking: "Oxide + water", displace: "Displacement", precip: "Precipitation", ammonia: "Ammonium + alkali", halogen: "Halogen displacement",
        catalyst: "Catalysed decomposition", complex: "Complex ion", redox: "Redox", smoke: "Gas + gas", synthesis: "Synthesis (heated)", thermite: "Thermite", combustion: "Combustion" },
      see: { neutral: "Acid + base → salt + water. The mixture warms up; an indicator shows the pH change.", carbonate: "Fizzing: carbon dioxide bubbles out (it would turn limewater milky).",
        oxide: "The metal oxide dissolves in the acid and makes a salt solution.", gas: "Hydrogen sulfide gas: smells of rotten eggs — toxic!", metalacid: "Bubbles of hydrogen; the metal slowly dissolves (a lit splint would give a squeaky pop).",
        oxacid: "Brown, choking nitrogen dioxide gas; the solution changes colour.", metalwater: "The metal fizzes on the water giving hydrogen; the water turns alkaline.",
        slaking: "Quicklime reacts with water and gives out a lot of heat.", displace: "The more reactive metal pushes the other metal out of its salt — a metal coating appears.",
        precip: "A solid (precipitate) forms at once and settles.", ammonia: "Sharp-smelling ammonia gas is given off (turns damp red litmus blue).", halogen: "The more reactive halogen takes the place of the less reactive one: the colour changes.",
        catalyst: "Fast bubbling of oxygen; the catalyst is not used up (oxygen relights a glowing splint).", complex: "Deep blue copper–ammonia complex.", redox: "Purple permanganate loses its colour; oxygen bubbles.",
        smoke: "Thick white smoke of ammonium chloride.", synthesis: "The elements combine with a glow.", thermite: "Thermite! White-hot molten iron and showers of sparks.", combustion: "It burns in air and forms its oxide." },
      why: { below: "is below hydrogen in the reactivity series, so it cannot take hydrogen's place in the acid.", noble: "Noble gases have full outer electron shells and do not react.",
        soluble: "All the possible new combinations are soluble, so nothing happens — the ions just mix.", unreactive: "This substance does not react with the others under these conditions.", gold: "Gold and platinum are noble metals — almost nothing attacks them.",
        heat: "Try heating it (burner) — some reactions only start when hot." },
      hazards: { corrosive: "corrosive — wear goggles and gloves", toxic: "toxic", flammable: "flammable — keep flames away", oxidiser: "oxidiser", irritant: "irritant", radioactive: "radioactive — real samples need special labs",
        alkaliwater: "reacts violently with water", explosive: "explosive with water" } },
    hi: { title: "रसायन प्रयोगशाला", shelf: "रसायन शेल्फ़", compounds: "यौगिक", elements: "तत्व (118)", search: "रसायन खोजें…", add: "＋ बीकर में डालें",
      amount: "मात्रा", conc: "सांद्रता", burner: "बर्नर", stir: "हिलाएँ", container: "पात्र", empty: "🧽 खाली करें व धोएँ", speed: "गति", start: "प्रारंभिक ताप",
      experiments: "प्रयोग…", obs: "प्रेक्षण", contents: "बीकर में", eqs: "अभिक्रियाएँ", safety: "सुरक्षा", noReact: "कोई अभिक्रिया नहीं", nothing: "बीकर खाली है। बाईं ओर से रसायन चुनें, मात्रा तय करें और डालें दबाएँ।",
      temp: "तापमान", ph: "pH", volume: "आयतन", state: { s: "ठोस", l: "द्रव", aq: "विलयन", g: "गैस" }, off: "बंद", low: "कम", med: "मध्यम", high: "तेज़",
      pick: "शेल्फ़ से रसायन चुनें", hazard: "⚠", tip: ["शेल्फ़ से रसायन चुनें (या पूरा प्रयोग)।", "मात्रा तय करें और डालें दबाएँ — अभिक्रिया के लिए दूसरा रसायन डालें।", "बर्नर और स्टिरर चलाएँ; चारों ओर देखने के लिए बीकर को खींचें।"], gotIt: "समझ गया",
      containers: [["beaker250", "बीकर 250 mL"], ["beaker100", "बीकर 100 mL"], ["beaker600", "बीकर 600 mL"], ["flask", "शंक्वाकार फ़्लास्क 250 mL"], ["tube", "परखनली 25 mL"], ["crucible", "क्रूसिबल (तेज़ गर्म करने के लिए)"]],
      groups: { basic: "पानी", acid: "अम्ल", base: "क्षार", salt: "लवण", oxide: "ऑक्साइड और उत्प्रेरक", other: "अन्य", ind: "सूचक" },
      types: { neutral: "उदासीनीकरण", carbonate: "अम्ल + कार्बोनेट", oxide: "अम्ल + धातु ऑक्साइड", gas: "गैस निकली", metalacid: "धातु + अम्ल", oxacid: "धातु + ऑक्सीकारक अम्ल",
        metalwater: "धातु + पानी", slaking: "ऑक्साइड + पानी", displace: "विस्थापन", precip: "अवक्षेपण", ammonia: "अमोनियम + क्षार", halogen: "हैलोजन विस्थापन",
        catalyst: "उत्प्रेरित अपघटन", complex: "संकुल आयन", redox: "रेडॉक्स", smoke: "गैस + गैस", synthesis: "संयोजन (गर्म करके)", thermite: "थर्माइट", combustion: "दहन" },
      see: { neutral: "अम्ल + क्षार → लवण + पानी। मिश्रण गर्म होता है; सूचक pH बदलाव दिखाता है।", carbonate: "बुदबुदाहट: कार्बन डाइऑक्साइड निकलती है (चूने के पानी को दूधिया करती)।",
        oxide: "धातु ऑक्साइड अम्ल में घुलकर लवण विलयन बनाता है।", gas: "हाइड्रोजन सल्फ़ाइड गैस: सड़े अंडे जैसी गंध — विषैली!", metalacid: "हाइड्रोजन के बुलबुले; धातु धीरे-धीरे घुलती है (जलती तीली से 'पॉप' आवाज़)।",
        oxacid: "भूरी, दम घोंटने वाली नाइट्रोजन डाइऑक्साइड गैस; विलयन का रंग बदलता है।", metalwater: "धातु पानी पर बुदबुदाती है, हाइड्रोजन बनती है; पानी क्षारीय हो जाता है।",
        slaking: "बिना बुझा चूना पानी से अभिक्रिया कर बहुत ऊष्मा देता है।", displace: "अधिक सक्रिय धातु दूसरी धातु को उसके लवण से हटाती है — धातु की परत दिखती है।",
        precip: "तुरंत ठोस (अवक्षेप) बनता है और नीचे बैठता है।", ammonia: "तीखी गंध वाली अमोनिया गैस निकलती है (नम लाल लिटमस को नीला करती)।", halogen: "अधिक सक्रिय हैलोजन कम सक्रिय की जगह लेता है: रंग बदलता है।",
        catalyst: "ऑक्सीजन के तेज़ बुलबुले; उत्प्रेरक खर्च नहीं होता (ऑक्सीजन सुलगती तीली जला देती है)।", complex: "गहरा नीला कॉपर–अमोनिया संकुल।", redox: "बैंगनी परमैंगनेट रंगहीन होता है; ऑक्सीजन के बुलबुले।",
        smoke: "अमोनियम क्लोराइड का घना सफ़ेद धुआँ।", synthesis: "तत्व चमक के साथ जुड़ते हैं।", thermite: "थर्माइट! सफ़ेद-गर्म पिघला लोहा और चिंगारियों की बौछार।", combustion: "यह हवा में जलकर अपना ऑक्साइड बनाता है।" },
      why: { below: "सक्रियता श्रेणी में हाइड्रोजन से नीचे है, इसलिए अम्ल से हाइड्रोजन नहीं हटा सकता।", noble: "उत्कृष्ट गैसों के बाहरी कोश पूरे होते हैं, वे अभिक्रिया नहीं करतीं।",
        soluble: "सभी नए संयोजन घुलनशील हैं, इसलिए कुछ नहीं होता — आयन बस मिल जाते हैं।", unreactive: "यह पदार्थ इन परिस्थितियों में दूसरों से अभिक्रिया नहीं करता।", gold: "सोना और प्लैटिनम उत्कृष्ट धातुएँ हैं — इन पर लगभग कुछ असर नहीं करता।",
        heat: "गर्म करके देखें (बर्नर) — कुछ अभिक्रियाएँ गर्म होने पर ही शुरू होती हैं।" },
      hazards: { corrosive: "संक्षारक — चश्मा और दस्ताने पहनें", toxic: "विषैला", flammable: "ज्वलनशील — लौ से दूर रखें", oxidiser: "ऑक्सीकारक", irritant: "उत्तेजक", radioactive: "रेडियोधर्मी — असली नमूनों के लिए विशेष प्रयोगशाला",
        alkaliwater: "पानी से तेज़ अभिक्रिया करता है", explosive: "पानी के साथ विस्फोटक" } },
  };
  // texts for the reactions added later (merged into both languages)
  Object.assign(TX.en.types, { limewater: "CO₂ + limewater", selfignite: "Spontaneous ignition", iodinesmoke: "Metal + iodine", burnhalogen: "Burns in halogen", fluorine: "Fluorine attack",
    explosion: "Explosion", dehydration: "Dehydration", colourtest: "Colour test", cloudy: "Sulfur precipitate", iodine: "Iodide oxidised", benedict: "Benedict / Fehling test", mirror: "Silver mirror (Tollens)",
    amphoteric: "Amphoteric metal + alkali", bleach: "Chlorine water", starch: "Starch–iodine test", decomp: "Thermal decomposition", sublime: "Sublimation", flametest: "Flame test" });
  Object.assign(TX.hi.types, { limewater: "CO₂ + चूने का पानी", selfignite: "स्वतः प्रज्वलन", iodinesmoke: "धातु + आयोडीन", burnhalogen: "हैलोजन में जलना", fluorine: "फ़्लोरीन का हमला",
    explosion: "विस्फोट", dehydration: "निर्जलीकरण", colourtest: "रंग परीक्षण", cloudy: "सल्फ़र अवक्षेप", iodine: "आयोडाइड का ऑक्सीकरण", benedict: "बेनेडिक्ट / फ़ेलिंग परीक्षण", mirror: "चाँदी का दर्पण (टॉलेन्स)",
    amphoteric: "उभयधर्मी धातु + क्षार", bleach: "क्लोरीन जल", starch: "स्टार्च–आयोडीन परीक्षण", decomp: "ऊष्मीय अपघटन", sublime: "ऊर्ध्वपातन", flametest: "ज्वाला परीक्षण" });
  Object.assign(TX.en.see, { limewater: "Limewater turns milky: insoluble calcium carbonate forms — the test for carbon dioxide.", selfignite: "No burner needed: the mixture heats itself up and bursts into flame.",
    iodinesmoke: "A drop of water starts it: clouds of violet iodine vapour and a flash of flame.", burnhalogen: "The metal burns in the halogen gas on its own, making a salt smoke.",
    fluorine: "Fluorine is the most reactive element — it attacks this violently.", explosion: "The gas mixture explodes with a bang.", dehydration: "Concentrated acid pulls the water out of the sugar: a black column of carbon grows, steaming and hot.",
    colourtest: "A deep blood-red colour: the test for iron(III) ions.", cloudy: "Pale yellow sulfur slowly clouds the liquid (a cross under the beaker would disappear).", iodine: "The colourless solution turns brown as iodine forms.",
    benedict: "On heating, a brick-red precipitate of copper(I) oxide forms: a reducing sugar is present.", mirror: "Silver deposits on the glass as a shiny mirror: an aldehyde (glucose) is present.",
    amphoteric: "Aluminium and zinc also dissolve in strong alkali, giving hydrogen.", bleach: "Chlorine water is acidic and bleaches indicators and dyes.", starch: "Starch turns blue-black with iodine.",
    decomp: "Heating breaks the substance down into simpler ones.", sublime: "The solid turns straight into a coloured vapour without melting.", flametest: "Metal ions give each flame its own colour." });
  Object.assign(TX.hi.see, { limewater: "चूने का पानी दूधिया होता है: अघुलनशील कैल्शियम कार्बोनेट बनता है — कार्बन डाइऑक्साइड का परीक्षण।", selfignite: "बर्नर की ज़रूरत नहीं: मिश्रण ख़ुद गर्म होकर जल उठता है।",
    iodinesmoke: "पानी की एक बूँद से शुरू: बैंगनी आयोडीन वाष्प के बादल और लौ की चमक।", burnhalogen: "धातु हैलोजन गैस में अपने आप जलकर लवण का धुआँ बनाती है।",
    fluorine: "फ़्लोरीन सबसे क्रियाशील तत्व है — यह इस पर तेज़ हमला करती है।", explosion: "गैस मिश्रण धमाके के साथ फटता है।", dehydration: "सांद्र अम्ल चीनी से पानी खींच लेता है: भाप छोड़ता गर्म काला कार्बन स्तंभ उठता है।",
    colourtest: "गहरा ख़ूनी लाल रंग: आयरन(III) आयनों का परीक्षण।", cloudy: "हल्का पीला सल्फ़र धीरे-धीरे द्रव को धुंधला करता है।", iodine: "रंगहीन विलयन आयोडीन बनने से भूरा होता है।",
    benedict: "गर्म करने पर ईंट-लाल कॉपर(I) ऑक्साइड अवक्षेप: अपचायक शर्करा मौजूद है।", mirror: "चाँदी काँच पर चमकीले दर्पण की तरह जमती है: ऐल्डिहाइड (ग्लूकोज़) मौजूद है।",
    amphoteric: "ऐल्युमिनियम और ज़िंक तेज़ क्षार में भी घुलकर हाइड्रोजन देते हैं।", bleach: "क्लोरीन जल अम्लीय होता है और सूचकों का रंग उड़ा देता है।", starch: "स्टार्च आयोडीन के साथ नीला-काला होता है।",
    decomp: "गर्म करने से पदार्थ सरल पदार्थों में टूटता है।", sublime: "ठोस पिघले बिना सीधे रंगीन वाष्प बनता है।", flametest: "धातु आयन लौ को अपना रंग देते हैं।" });
  TX.en.pending = "Smouldering… it is heating itself up"; TX.hi.pending = "सुलग रहा है… ख़ुद गर्म हो रहा है";
  TX.en.flameBtn = "🔥 Flame test"; TX.hi.flameBtn = "🔥 ज्वाला परीक्षण";
  TX.en.flameNone = "No metal ions here to colour the flame."; TX.hi.flameNone = "लौ को रंग देने वाले धातु आयन नहीं हैं।";
  const S = { lang: "en", sel: null, amount: null, unit: "g", conc: null, heatW: 0, stir: false, speed: 1, container: "beaker250", tab: "compounds", lab: null, elements: [], ready: false, lastAddAt: -1, lastAdd: null, lastView: null };
  const t = (k) => TX[S.lang][k];
  const tr = (o) => (o == null ? "" : typeof o === "string" ? o : o[S.lang] || o.en);
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => { if (v == null || v === false) return; if (k === "class") el.className = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? "" : v); });
    kids.flat(Infinity).forEach((c) => c != null && c !== false && el.append(c.nodeType ? c : document.createTextNode(String(c))));
    return el;
  }
  const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const say = (m) => { $("say").textContent = ""; setTimeout(() => { $("say").textContent = m; }, 30); };
  const CAP = { beaker250: 250, beaker100: 100, beaker600: 600, flask: 250, tube: 25, crucible: 40 };

  // ------------------------------------------------------------------ experiments (sequences of additions)
  const EXP = [
    { id: "na", t: { en: "Sodium in water (+ phenolphthalein)", hi: "पानी में सोडियम (+ फ़िनॉल्फ़्थेलिन)" }, steps: [["H2O", 150, "mL"], ["phenolphthalein", 3, "drops"], ["Na", 0.3, "g"]] },
    { id: "k", t: { en: "Potassium in water (lilac flame)", hi: "पानी में पोटैशियम (बैंगनी लौ)" }, steps: [["H2O", 150, "mL"], ["K", 0.3, "g"]] },
    { id: "neut", t: { en: "Neutralisation with universal indicator", hi: "सार्वत्रिक सूचक के साथ उदासीनीकरण" }, steps: [["HCl", 50, "mL", 1], ["universal", 5, "drops"]], next: ["NaOH", 10, "mL", 1] },
    { id: "gold", t: { en: "Golden rain (lead iodide)", hi: "सुनहरी बारिश (लेड आयोडाइड)" }, steps: [["Pb(NO3)2", 50, "mL", 0.1], ["KI", 20, "mL", 0.5]] },
    { id: "nail", t: { en: "Iron nail in copper sulfate", hi: "कॉपर सल्फ़ेट में लोहे की कील" }, steps: [["CuSO4", 80, "mL", 0.5], ["Fe", 3, "g"]], speed: 5 },
    { id: "tree", t: { en: "Silver tree (copper in silver nitrate)", hi: "चाँदी का पेड़ (सिल्वर नाइट्रेट में कॉपर)" }, steps: [["AgNO3", 80, "mL", 0.1], ["Cu", 2, "g"]], speed: 5 },
    { id: "volcano", t: { en: "Baking-soda volcano", hi: "खाने के सोडे का ज्वालामुखी" }, steps: [["CH3COOH", 100, "mL", 1], ["universal", 3, "drops"], ["NaHCO3", 5, "g"]] },
    { id: "marble", t: { en: "Marble chips + hydrochloric acid", hi: "संगमरमर + हाइड्रोक्लोरिक अम्ल" }, steps: [["HCl", 80, "mL", 2], ["CaCO3", 5, "g"]] },
    { id: "mgacid", t: { en: "Magnesium + hydrochloric acid", hi: "मैग्नीशियम + हाइड्रोक्लोरिक अम्ल" }, steps: [["HCl", 80, "mL", 1], ["Mg", 0.5, "g"]] },
    { id: "h2o2", t: { en: "Hydrogen peroxide + catalyst (MnO2)", hi: "हाइड्रोजन पेरॉक्साइड + उत्प्रेरक (MnO2)" }, steps: [["H2O2", 80, "mL"], ["MnO2", 0.5, "g"]] },
    { id: "cuamm", t: { en: "Copper sulfate + ammonia (deep blue)", hi: "कॉपर सल्फ़ेट + अमोनिया (गहरा नीला)" }, steps: [["CuSO4", 50, "mL", 0.2], ["NH3", 5, "mL", 1]], next: ["NH3", 20, "mL", 2] },
    { id: "precip", t: { en: "Precipitates: silver chloride & barium sulfate", hi: "अवक्षेप: सिल्वर क्लोराइड और बेरियम सल्फ़ेट" }, steps: [["AgNO3", 40, "mL", 0.1], ["NaCl", 0.5, "g"]] },
    { id: "cuoh", t: { en: "Copper sulfate + sodium hydroxide", hi: "कॉपर सल्फ़ेट + सोडियम हाइड्रॉक्साइड" }, steps: [["CuSO4", 50, "mL", 0.5], ["NaOH", 20, "mL", 1]] },
    { id: "halogen", t: { en: "Chlorine water + potassium iodide", hi: "क्लोरीन जल + पोटैशियम आयोडाइड" }, steps: [["KI", 80, "mL", 0.5], ["Cl", 200, "mL"]] },
    { id: "nitric", t: { en: "Copper + nitric acid (brown gas)", hi: "कॉपर + नाइट्रिक अम्ल (भूरी गैस)" }, steps: [["HNO3", 50, "mL", 6], ["Cu", 1, "g"]] },
    { id: "cold", t: { en: "Instant cold pack (ammonium nitrate)", hi: "तुरंत ठंडा पैक (अमोनियम नाइट्रेट)" }, steps: [["H2O", 100, "mL"], ["NH4NO3", 25, "g"]] },
    { id: "hot", t: { en: "Quicklime + water (gets hot)", hi: "बिना बुझा चूना + पानी (गर्म होता है)" }, steps: [["H2O", 50, "mL"], ["CaO", 20, "g"]] },
    { id: "selfire", t: { en: "Potassium permanganate + glycerol (fire by itself)", hi: "पोटैशियम परमैंगनेट + ग्लिसरॉल (अपने आप आग)" }, container: "crucible", steps: [["KMnO4", 5, "g"], ["C3H8O3", 2, "mL"]] },
    { id: "purple", t: { en: "Aluminium + iodine + a drop of water (violet smoke)", hi: "ऐल्युमिनियम + आयोडीन + पानी की बूँद (बैंगनी धुआँ)" }, container: "crucible", steps: [["Al", 1, "g"], ["I", 5, "g"], ["H2O", 2, "drops"]] },
    { id: "snake", t: { en: "Sugar + concentrated sulfuric acid (carbon snake)", hi: "चीनी + सांद्र सल्फ़्यूरिक अम्ल (कार्बन साँप)" }, container: "beaker100", steps: [["C12H22O11", 20, "g"], ["H2SO4c", 10, "mL"]] },
    { id: "violetfire", t: { en: "Potassium chlorate + sugar + a drop of acid (violet fire)", hi: "पोटैशियम क्लोरेट + चीनी + अम्ल की बूँद (बैंगनी आग)" }, container: "crucible", steps: [["KClO3", 3, "g"], ["C12H22O11", 3, "g"], ["H2SO4c", 2, "drops"]] },
    { id: "nacl2", t: { en: "Sodium burns in chlorine", hi: "क्लोरीन में जलता सोडियम" }, container: "crucible", steps: [["Na", 0.5, "g"], ["Cl", 300, "mL"]] },
    { id: "volcano2", t: { en: "Ammonium dichromate volcano (heat)", hi: "अमोनियम डाइक्रोमेट ज्वालामुखी (गर्म)" }, container: "crucible", heat: 1200, speed: 2, steps: [["(NH4)2Cr2O7", 5, "g"]] },
    { id: "iodine", t: { en: "Heating iodine (violet vapour)", hi: "आयोडीन गर्म करना (बैंगनी वाष्प)" }, container: "crucible", heat: 400, speed: 2, steps: [["I", 2, "g"]] },
    { id: "soda", t: { en: "Heating baking soda (breaks down at ~80 °C)", hi: "खाने का सोडा गर्म करना (~80 °C पर टूटता है)" }, container: "crucible", heat: 200, speed: 2, steps: [["NaHCO3", 5, "g"]] },
    { id: "vitriol", t: { en: "Heating blue vitriol (blue → white)", hi: "नीला थोथा गर्म करना (नीला → सफ़ेद)" }, container: "crucible", heat: 400, speed: 2, steps: [["CuSO4.5H2O", 5, "g"]] },
    { id: "limewater", t: { en: "Limewater test for CO2", hi: "CO2 के लिए चूने के पानी का परीक्षण" }, steps: [["Ca(OH)2", 100, "mL", 0.02], ["CO2", 60, "mL"]] },
    { id: "blood", t: { en: "Iron(III) + thiocyanate (blood red)", hi: "आयरन(III) + थायोसायनेट (ख़ूनी लाल)" }, steps: [["FeCl3", 50, "mL", 0.05], ["KSCN", 10, "mL", 0.1]] },
    { id: "cross", t: { en: "Disappearing cross (thiosulfate + acid)", hi: "ग़ायब होता क्रॉस (थायोसल्फ़ेट + अम्ल)" }, steps: [["Na2S2O3", 80, "mL", 0.15], ["HCl", 10, "mL", 1]], speed: 2 },
    { id: "clock", t: { en: "Iodine + starch (blue-black)", hi: "आयोडीन + स्टार्च (नीला-काला)" }, steps: [["KI", 50, "mL", 0.1], ["starch", 5, "drops"], ["H2SO4", 10, "mL", 1], ["H2O2", 5, "mL"]] },
    { id: "benedict", t: { en: "Benedict / Fehling test for glucose (heat)", hi: "ग्लूकोज़ के लिए बेनेडिक्ट / फ़ेलिंग परीक्षण (गर्म)" }, heat: 500, steps: [["CuSO4", 30, "mL", 0.5], ["NaOH", 30, "mL", 1], ["C6H12O6", 3, "g"]], speed: 2 },
    { id: "mirror", t: { en: "Silver mirror (Tollens test, warm)", hi: "चाँदी का दर्पण (टॉलेन्स परीक्षण, गुनगुना)" }, heat: 300, steps: [["AgNO3", 40, "mL", 0.1], ["NH3", 20, "mL", 2], ["C6H12O6", 2, "g"]], speed: 2 },
    { id: "alnaoh", t: { en: "Aluminium in sodium hydroxide", hi: "सोडियम हाइड्रॉक्साइड में ऐल्युमिनियम" }, steps: [["NaOH", 80, "mL", 2], ["Al", 1, "g"]] },
    { id: "flameLi", t: { en: "Flame test: lithium (pink-crimson)", hi: "ज्वाला परीक्षण: लिथियम (गुलाबी-लाल)" }, container: "crucible", heat: 1500, steps: [["LiCl", 1, "g"]], flame: true },
    { id: "flameSr", t: { en: "Flame test: strontium (red)", hi: "ज्वाला परीक्षण: स्ट्रॉन्शियम (लाल)" }, container: "crucible", heat: 1500, steps: [["SrCl2", 1, "g"]], flame: true },
    { id: "flameBa", t: { en: "Flame test: barium (green)", hi: "ज्वाला परीक्षण: बेरियम (हरा)" }, container: "crucible", heat: 1500, steps: [["BaCl2", 1, "g"]], flame: true },
    { id: "flameCu", t: { en: "Flame test: copper (blue-green)", hi: "ज्वाला परीक्षण: कॉपर (नीला-हरा)" }, container: "crucible", heat: 1500, steps: [["CuCl2", 1, "g"]], flame: true },
    { id: "mgburn", t: { en: "Burning magnesium (crucible, heat)", hi: "जलता मैग्नीशियम (क्रूसिबल, गर्म)" }, container: "crucible", heat: 2000, speed: 5, steps: [["Mg", 0.5, "g"]] },
    { id: "thermite", t: { en: "Thermite (crucible, heat)", hi: "थर्माइट (क्रूसिबल, गर्म)" }, container: "crucible", heat: 2000, speed: 5, steps: [["Al", 2.7, "g"], ["Fe2O3", 8, "g"]] },
  ];

  // ------------------------------------------------------------------ shelf
  const CAT_COL = { alkali: "#f87171", alkaline: "#fb923c", transition: "#facc15", post: "#a3e635", metalloid: "#34d399", nonmetal: "#38bdf8", halogen: "#22d3ee", noble: "#a78bfa", lanthanide: "#f472b6", actinide: "#e879f9" };
  function renderShelf() {
    const q = $("search").value.trim().toLowerCase();
    $("tabC").setAttribute("aria-selected", String(S.tab === "compounds")); $("tabE").setAttribute("aria-selected", String(S.tab === "elements"));
    if (S.tab === "compounds") {
      const groups = {};
      CE.COMPOUNDS.filter((c) => !q || tr(c.name).toLowerCase().includes(q) || c.name.en.toLowerCase().includes(q) || c.f.toLowerCase().includes(q)).forEach((c) => { (groups[c.group || "other"] = groups[c.group || "other"] || []).push(c); });
      fill($("shelf"), Object.keys(t("groups")).filter((g) => groups[g]).map((g) => h("div", { class: "sgroup" }, h("div", { class: "lbl" }, t("groups")[g]),
        groups[g].map((c) => h("button", { type: "button", class: "chem" + (S.sel === c.id ? " on" : ""), "aria-pressed": String(S.sel === c.id), onclick: () => select(c.id) },
          h("span", { class: "cf" }, CE.pretty(c.f === "litmus" || c.f === "universal" || c.kind === "indicator" ? "ind" : c.f)), h("span", { class: "cn" }, tr(c.name)))))));
    } else {
      const els = S.elements.filter((e) => !q || e.sym.toLowerCase() === q || e.name.toLowerCase().includes(q) || (e.name_hi || "").includes(q) || String(e.z) === q);
      if (q) fill($("shelf"), h("div", { class: "elist" }, els.map((e) => elBtn(e, true))));
      else fill($("shelf"), h("div", { class: "ptable", role: "grid", "aria-label": t("elements") }, S.elements.map((e) => { const b = elBtn(e); b.style.gridRow = String(e.row); b.style.gridColumn = String(e.col); return b; })));
    }
  }
  function elBtn(e, wide) {
    return h("button", { type: "button", class: "el" + (wide ? " wide" : "") + (S.sel === e.sym ? " on" : ""), style: "--c:" + (CAT_COL[e.cat] || "#94a3b8"), title: e.z + " " + (S.lang === "hi" ? e.name_hi : e.name),
      "aria-label": e.z + " " + (S.lang === "hi" ? e.name_hi : e.name), "aria-pressed": String(S.sel === e.sym), onclick: () => select(e.sym) },
      h("b", {}, e.sym), wide ? h("span", {}, " " + (S.lang === "hi" ? e.name_hi : e.name)) : null);
  }
  function select(id) {
    S.sel = id;
    const sub = CE.lookup(id);
    const liquid = sub.state === "aq" || sub.state === "l" || sub.state === "g";
    S.unit = sub.kind === "indicator" ? "drops" : liquid ? "mL" : "g";
    S.amount = sub.kind === "indicator" ? 3 : sub.f === "H2O" ? 100 : liquid ? (sub.state === "g" ? 100 : 50) : sub.kind === "element" ? 0.5 : 2;
    S.conc = sub.state === "aq" && sub.conc ? sub.conc : null;
    renderShelf(); renderAdd(); say(tr(sub.name));
  }
  function hazardsOf(sub) {
    const hz = [], H = t("hazards");
    if (sub.hazard) sub.hazard.split(/,\s*/).forEach((x) => hz.push(H[x.split(" ")[0]] ? H[x.split(" ")[0]] : x));
    if (sub.el) {
      const e = sub.el;
      if (e.radioactive) hz.push(H.radioactive);
      if (e.cat === "alkali") hz.push(/^(K|Rb|Cs|Fr)$/.test(e.sym) ? H.explosive : H.alkaliwater);
      if (/^(Hg|Pb|As|Cd|Tl|Be|Cl|F|Br)$/.test(e.sym)) hz.push(H.toxic);
      if (/^(P|H)$/.test(e.sym)) hz.push(H.flammable);
    }
    return hz;
  }
  function renderAdd() {
    const box = $("addBox");
    if (!S.sel) { fill(box, h("p", { class: "muted" }, t("pick"))); return; }
    const sub = CE.lookup(S.sel), M = CE.molarMass(sub.f);
    const units = sub.kind === "indicator" ? ["drops", "mL"] : sub.state === "aq" ? ["mL", "drops"] : sub.state === "g" ? ["mL", "mol"] : sub.state === "l" ? ["mL", "g", "mol"] : ["g", "mg", "mol"];
    if (!units.includes(S.unit)) S.unit = units[0];
    const quick = { g: [0.1, 0.25, 0.5, 1, 2, 5, 10], mg: [10, 50, 100, 500], mL: sub.state === "g" ? [10, 50, 100, 250] : [1, 5, 10, 25, 50, 100], drops: [1, 3, 5, 10], mol: [0.001, 0.01, 0.05, 0.1] }[S.unit];
    const amt = h("input", { id: "amt", type: "text", inputmode: "decimal", value: String(S.amount), onchange: (e) => { const v = Number(e.target.value.replace(",", ".")); if (v > 0) S.amount = v; else e.target.value = String(S.amount); renderAddInfo(); } });
    const hz = hazardsOf(sub);
    fill(box,
      h("div", { class: "selname" }, h("b", {}, tr(sub.name)), " ", h("span", { class: "mono" }, CE.pretty(sub.f)), " · ", h("span", { class: "muted" }, t("state")[sub.state] || "")),
      hz.length ? h("div", { class: "hz" }, t("hazard") + " " + hz.join(" · ")) : null,
      h("div", { class: "addrow" },
        h("label", { for: "amt" }, t("amount")), amt,
        h("select", { "aria-label": t("amount"), onchange: (e) => { S.unit = e.target.value; renderAdd(); } }, units.map((u) => { const o = h("option", { value: u }, u); if (u === S.unit) o.selected = true; return o; }))),
      h("div", { class: "chips" }, quick.map((v) => h("button", { type: "button", class: "chip" + (v === S.amount ? " on" : ""), onclick: () => { S.amount = v; renderAdd(); } }, v + " " + S.unit))),
      sub.state === "aq" && sub.kind !== "indicator" ? [
        h("div", { class: "addrow" }, h("label", { for: "conc" }, t("conc")),
          h("input", { id: "conc", type: "text", inputmode: "decimal", value: String(S.conc), onchange: (e) => { const v = Number(e.target.value.replace(",", ".")); if (v > 0 && v <= 18) S.conc = v; else e.target.value = String(S.conc); renderAddInfo(); } }), h("span", { class: "unit" }, "mol/L")),
        h("div", { class: "chips" }, [0.01, 0.1, 0.5, 1, 2, 6].map((v) => h("button", { type: "button", class: "chip" + (v === S.conc ? " on" : ""), onclick: () => { S.conc = v; renderAdd(); } }, v + " M")))] : null,
      h("p", { class: "muted mono", id: "addInfo" }),
      h("button", { type: "button", class: "btn primary big", id: "addBtn", onclick: doAdd }, t("add")));
    renderAddInfo();
    void M;
  }
  function renderAddInfo() {
    const el = $("addInfo"); if (!el || !S.sel) return;
    const sub = CE.lookup(S.sel), M = CE.molarMass(sub.f);
    let mol = null;
    if (S.unit === "g") mol = S.amount / M; else if (S.unit === "mg") mol = S.amount / 1000 / M; else if (S.unit === "mol") mol = S.amount;
    else if (sub.state === "aq" && S.conc) mol = S.conc * (S.unit === "drops" ? S.amount * 0.05 : S.amount) / 1000;
    else if (sub.state === "g") mol = S.amount / 1000 / 24;
    el.textContent = "M = " + M.toFixed(2) + " g/mol" + (mol != null && sub.kind !== "indicator" ? " · n = " + fmtN(mol) + " mol · m = " + fmtN(mol * M) + " g" : "");
  }
  const fmtN = (x) => (x >= 100 ? x.toFixed(0) : x >= 1 ? x.toFixed(2) : x >= 0.01 ? x.toFixed(3) : x.toExponential(2));
  function doAdd() {
    if (!S.sel) return;
    const v = S.lab.view(), sub = CE.lookup(S.sel);
    S.lab.add(S.sel, S.amount, S.unit, S.conc);
    const after = S.lab.view();
    if (after.volume > CAP[S.container] * 1.05) say("⚠ overflow");
    S.lastAddAt = S.lab.L.time; S.lastAdd = S.sel; S.eventsBefore = v.events.length;
    drop(sub);
    say(t("add").replace("＋ ", "") + ": " + tr(sub.name));
    renderSide(true);
  }

  // ------------------------------------------------------------------ "no reaction" explanation
  function whyNot() {
    const v = S.lastView, W = t("why");
    if (!v || !S.lastAdd || S.lab.L.time - S.lastAddAt < 2.5 || v.events.length > S.eventsBefore) return null;
    if (v.contents.length < 2 && !v.water) return null;
    const sub = CE.lookup(S.lastAdd);
    const names = v.contents.map((c) => c.f);
    if (sub.el && sub.el.cat === "noble") return W.noble;
    if (sub.el && /^(Au|Pt)$/.test(sub.el.sym)) return W.gold;
    const acid = S.lab.items.some((i) => i.kind === "acid");
    if (sub.el && CE.isMetal(sub.el.sym) && acid && CE.E0[sub.el.sym] > 0) return (S.lang === "hi" ? sub.el.name_hi : sub.el.name) + " " + W.below;
    const metalIn = S.lab.items.find((i) => i.kind === "element" && CE.E0[i.f] > 0);
    if (metalIn && sub.kind === "acid") { const e = CE.elementSubstance(metalIn.f); return tr(e.name) + " " + W.below; }
    if (sub.kind === "salt" && S.lab.items.filter((i) => i.state === "aq" && i.cat).length >= 2) return W.soluble;
    if (names.length >= 2) return W.unreactive + " " + W.heat;
    return null;
  }

  // ------------------------------------------------------------------ side panel
  function renderSide(force) {
    const v = S.lab.view(S.lang);
    S.lastView = v;
    $("tVal").textContent = v.T.toFixed(1) + " °C";
    $("phVal").textContent = v.pH == null ? "—" : v.pH.toFixed(1);
    $("phVal").style.setProperty("--ph", v.pH == null ? "transparent" : phColour(v.pH));
    $("volVal").textContent = Math.round(v.volume) + " / " + CAP[S.container] + " mL";
    const evs = v.events.slice().reverse();
    const why = whyNot();
    if (!force && !v.pending && !(S.flameNote && S.flameNote.until > performance.now()) && S.sideKey === JSON.stringify([evs.map((e) => e.eq + e.active), v.contents.map((c) => c.f + c.state + c.mol.toPrecision(3)), why, S.lang])) return;
    S.sideKey = JSON.stringify([evs.map((e) => e.eq + e.active), v.contents.map((c) => c.f + c.state + c.mol.toPrecision(3)), why, S.lang]);
    const note = S.flameNote && S.flameNote.until > performance.now() ? h("div", { class: "ev live" }, h("div", { class: "evt" }, "🔥 " + t("types").flametest),
      h("div", { class: "eq" }, S.flameNote.colour ? h("span", { class: "dot", style: "background:" + S.flameNote.colour + ";width:14px;height:14px" }) : null, S.flameNote.text), h("div", { class: "see" }, t("see").flametest)) : null;
    const pend = v.pending && !evs.some((e) => e.active) ? h("div", { class: "ev none" }, h("div", { class: "evt" }, "⏳ " + (t("types")[v.pending] || "")), h("div", { class: "see" }, t("pending"))) : null;
    fill($("eqs"), note, pend, evs.length ? evs.map((e) => h("div", { class: "ev" + (e.active ? " live" : "") },
      h("div", { class: "evt" }, (e.active ? "● " : "✓ ") + (t("types")[e.type] || e.type)), h("div", { class: "eq" }, e.eq), h("div", { class: "see" }, t("see")[e.type] || ""))) :
      why ? h("div", { class: "ev none" }, h("div", { class: "evt" }, "✗ " + t("noReact")), h("div", { class: "see" }, why)) : h("p", { class: "muted" }, v.contents.length ? "" : t("nothing")));
    if (why && evs.length) $("eqs").prepend(h("div", { class: "ev none" }, h("div", { class: "evt" }, "✗ " + t("noReact") + " (" + S.lastAdd + ")"), h("div", { class: "see" }, why)));
    fill($("contents"), v.contents.length ? h("table", {}, h("tbody", {}, v.contents.map((c) => h("tr", {},
      h("td", {}, c.colour ? h("span", { class: "dot", style: "background:" + c.colour }) : null, h("b", { class: "mono" }, c.fp), h("br"), h("span", { class: "muted" }, c.name)),
      h("td", { class: "muted" }, t("state")[c.state] || c.state), h("td", { class: "mono" }, fmtN(c.g) + " g", h("br"), h("span", { class: "muted" }, fmtN(c.mol) + " mol")))))) : null);
    const hz = [];
    S.lab.items.forEach((it) => { const sub = CE.lookup(it.id || it.f); if (sub) hazardsOf(sub).forEach((x) => { if (!hz.includes(x)) hz.push(tr(sub.name) + ": " + x); }); });
    if (v.gases.some((g) => g.f === "NO2" || g.f === "H2S" || g.f === "SO2")) hz.push(S.lang === "hi" ? "विषैली गैस — फ़्यूम हुड में करें" : "toxic gas — do this in a fume cupboard");
    if (v.gases.some((g) => g.f === "H2")) hz.push(S.lang === "hi" ? "हाइड्रोजन ज्वलनशील है" : "hydrogen is flammable");
    fill($("safety"), hz.length ? h("ul", {}, [...new Set(hz)].slice(0, 8).map((x) => h("li", {}, "⚠ " + x))) : h("p", { class: "muted" }, "—"));
  }
  function phColour(p) { const stops = ["#d7191c", "#e8452c", "#f46d43", "#fdae61", "#fee08b", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850", "#3288bd", "#2b6cb0", "#5e4fa2", "#6a3d9a", "#542788", "#3f007d"]; return stops[Math.max(0, Math.min(14, Math.round(p)))]; }

  // ------------------------------------------------------------------ 3D scene
  const view = { yaw: 0.5, pitch: 0.32, dist: 9, cx: 0, cy: 1.6 };
  let renderer, scene, camera, G = {};
  const wrap = $("scene3d");
  function init3d() {
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (_) { wrap.textContent = "3D needs WebGL."; return false; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    wrap.append(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
    scene.add(new THREE.HemisphereLight(0xeef4ff, 0x30302a, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(4, 9, 6); scene.add(sun);
    G.glowLight = new THREE.PointLight(0xffffff, 0, 12); G.glowLight.position.set(0, 2.5, 0); scene.add(G.glowLight);
    // bench
    const bench = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.85 }));
    bench.position.y = -0.2; scene.add(bench);
    // burner + tripod
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.5, roughness: 0.35 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.18, 32), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 })); base.position.y = 0.09; scene.add(base);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.9, 20), steel); tube.position.y = 0.6; scene.add(tube);
    G.flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x4f8cff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    G.flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(G.flameOuter); scene.add(G.flameInner);
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.75, 8), steel); leg.position.set(Math.cos(a) * 1.05, 0.87, Math.sin(a) * 1.05); leg.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08); scene.add(leg); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.035, 8, 40), steel); ring.rotation.x = Math.PI / 2; ring.position.y = 1.75; scene.add(ring);
    const gauze = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.02, 2.1), new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.4, roughness: 0.7, transparent: true, opacity: 0.9 })); gauze.position.y = 1.77; scene.add(gauze);
    G.gauze = gauze;
    G.base = 1.79;
    G.vessel = new THREE.Group(); scene.add(G.vessel);
    G.bubbles = []; G.particles = []; G.solids = new THREE.Group(); G.vessel.add(G.solids);
    // sprites
    const tex = glowTexture();
    const sprite = (col, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); s.scale.set(size, size, 1); scene.add(s); return s; };
    G.flameSprite = sprite(0xffaa00, 1.2); G.glow = sprite(0xffffff, 5);
    G.cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0 })); G.cloud.scale.set(3, 2, 1); scene.add(G.cloud);
    G.smoke = []; for (let k = 0; k < 14; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xeeeeee, transparent: true, depthWrite: false, opacity: 0 })); s.userData = { y: Math.random() * 3, x: (Math.random() - 0.5) * 0.6 }; scene.add(s); G.smoke.push(s); }
    G.sparks = []; for (let k = 0; k < 60; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffcc66, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); s.scale.set(0.12, 0.12, 1); s.userData = { v: new THREE.Vector3(), life: 0 }; scene.add(s); G.sparks.push(s); }
    buildVessel();
    // orbit
    const dom = renderer.domElement;
    dom.tabIndex = 0; dom.setAttribute("role", "img"); dom.setAttribute("aria-label", "3D beaker on a Bunsen burner. Arrow keys rotate, + and − zoom.");
    let drag = null;
    dom.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); });
    dom.addEventListener("pointermove", (e) => { if (!drag) return; view.yaw -= (e.clientX - drag.x) * 0.008; view.pitch = Math.max(-0.05, Math.min(1.3, view.pitch + (e.clientY - drag.y) * 0.006)); drag = { x: e.clientX, y: e.clientY }; });
    dom.addEventListener("pointerup", () => { drag = null; });
    dom.addEventListener("wheel", (e) => { e.preventDefault(); view.dist = Math.max(4, Math.min(20, view.dist * (e.deltaY > 0 ? 1.08 : 0.92))); }, { passive: false });
    dom.addEventListener("keydown", (e) => {
      const k = e.key; if (k === "ArrowLeft") view.yaw += 0.12; else if (k === "ArrowRight") view.yaw -= 0.12; else if (k === "ArrowUp") view.pitch = Math.min(1.3, view.pitch + 0.08);
      else if (k === "ArrowDown") view.pitch = Math.max(-0.05, view.pitch - 0.08); else if (k === "+" || k === "=") view.dist = Math.max(4, view.dist * 0.9); else if (k === "-") view.dist = Math.min(20, view.dist * 1.1); else return;
      e.preventDefault();
    });
    new ResizeObserver(resize3d).observe(wrap); resize3d();
    return true;
  }
  function glowTexture() {
    const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  // vessel inner radius as a function of height (local units: 1 = 2.5 cm roughly)
  function shape() {
    switch (S.container) {
      case "beaker100": return { H: 1.6, r: () => 0.62, spout: true };
      case "beaker600": return { H: 2.7, r: () => 1.0, spout: true };
      case "flask": return { H: 2.6, r: (y) => (y < 1.7 ? 1.0 - y / 1.7 * 0.72 : 0.28), neck: 1.7 };
      case "tube": return { H: 2.6, r: () => 0.22, round: true };
      case "crucible": return { H: 0.75, r: (y) => 0.38 + y * 0.32, opaque: true };
      default: return { H: 2.0, r: () => 0.8, spout: true };
    }
  }
  function volumeAt(sh, y) { let v = 0; const n = 60; for (let k = 0; k < n; k++) { const yy = (k + 0.5) * y / n, r = sh.r(yy); v += Math.PI * r * r * y / n; } return v; }
  function levelFor(sh, mL) {   // liquid height for a volume, scaled so the full vessel holds CAP mL
    const full = volumeAt(sh, sh.H * 0.92), want = Math.min(1, mL / CAP[S.container]) * full;
    let lo = 0, hi = sh.H * 0.92; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (volumeAt(sh, m) < want) lo = m; else hi = m; }
    return lo;
  }
  function buildVessel() {
    G.vessel.children.slice().forEach((c) => { if (c !== G.solids) G.vessel.remove(c); });
    const sh = shape(); G.sh = sh;
    const pts = [], n = 40;
    pts.push(new THREE.Vector2(0.001, 0));
    for (let k = 0; k <= n; k++) { const y = sh.H * k / n; pts.push(new THREE.Vector2(sh.r(y) + 0.04, y)); }
    const glassMat = sh.opaque ? new THREE.MeshStandardMaterial({ color: 0xece6dc, roughness: 0.8, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: 0xdbeeff, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const glass = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), glassMat); G.vessel.add(glass); G.glassMat = glassMat; G.snakeMesh = null;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(sh.r(sh.H) + 0.04, 0.03, 8, 48), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = sh.H; G.vessel.add(rim);
    if (!sh.opaque) for (let k = 1; k <= 4; k++) {   // graduation marks
      const y = levelFor(sh, CAP[S.container] * k / 5), r = sh.r(y) + 0.045;
      const mark = new THREE.Mesh(new THREE.TorusGeometry(r, 0.006, 4, 24, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
      mark.rotation.x = Math.PI / 2; mark.rotation.z = 0.2; mark.position.y = y; G.vessel.add(mark);
    }
    G.liquidMat = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.3, roughness: 0.15, depthWrite: false });
    G.liquid = new THREE.Mesh(new THREE.BufferGeometry(), G.liquidMat); G.vessel.add(G.liquid); G.level = -1;
    G.sediment = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })); G.sediment.visible = false; G.vessel.add(G.sediment);
    G.vessel.position.y = S.container === "tube" ? 0 : G.base;
    G.gauze.visible = S.container !== "tube";
    view.cy = G.vessel.position.y + sh.H * 0.5;
  }
  function setLevel(y) {
    if (Math.abs(y - G.level) < 0.002) return;
    G.level = y; G.liquid.geometry.dispose();
    if (y < 0.01) { G.liquid.geometry = new THREE.BufferGeometry(); return; }
    // the vessels are straight or linearly tapered below the neck, so a frustum is exact
    const g = new THREE.CylinderGeometry(G.sh.r(y) - 0.006, G.sh.r(0) - 0.006, y, 48);
    g.translate(0, y / 2 + 0.004, 0);
    G.liquid.geometry = g;
  }  const rnd = (a, b) => a + Math.random() * (b - a);
  function drop(sub) {   // a splash of particles for what was just added
    if (!scene) return;
    if (sub.state === "s" && sub.kind !== "element") for (let k = 0; k < 40; k++) spawnParticle(sub.colour || "#f4f4f4", true);
  }
  function spawnParticle(colour, fromTop) {
    if (G.particles.length > 500) return;
    const m = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.012, 0.03), 5, 4), new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9 }));
    const top = Math.max(0.1, G.level), r = G.sh.r(top) * 0.85, a = rnd(0, Math.PI * 2), rr = Math.sqrt(Math.random()) * r;
    m.position.set(Math.cos(a) * rr, fromTop ? top : rnd(0.2, top), Math.sin(a) * rr);
    m.userData = { vy: -rnd(0.15, 0.45), settle: rnd(0.01, 0.05) };
    G.vessel.add(m); G.particles.push(m);
  }
  function updateScene(v, dt, now) {
    if (!scene) return;
    const sh = G.sh;
    // liquid
    const y = levelFor(sh, v.volume); setLevel(y);
    G.liquidMat.color.set(v.colour.hex); G.liquidMat.opacity = v.volume > 0 ? v.colour.a : 0;
    if (S.stir) G.liquid.rotation.y += dt * 4;
    // sediment layer from precipitates (not metals)
    const sed = v.precip.filter((p) => !p.metal);
    const sedMol = sed.reduce((s, p) => s + p.mol, 0);
    if (sedMol > 1e-6 && v.volume > 0) {
      const main = sed.slice().sort((a, b) => b.mol - a.mol)[0];
      const th = Math.min(0.25, 0.03 + sedMol * 6);
      G.sediment.visible = true; G.sediment.material.color.set(main.colour);
      const r = sh.r(th / 2) - 0.01; G.sediment.scale.set(r, th, r); G.sediment.position.y = th / 2 + 0.005;
      if (S.lastView && S.lastView.events.some((e) => e.type === "precip" && e.active) && Math.random() < 0.9) for (let k = 0; k < 4; k++) spawnParticle(main.colour, false);
    } else G.sediment.visible = false;
    // falling particles
    G.particles = G.particles.filter((m) => {
      m.position.y += m.userData.vy * dt * (S.stir ? 0.5 : 1);
      if (S.stir) { const a = Math.atan2(m.position.z, m.position.x) + dt * 2, rr = Math.hypot(m.position.x, m.position.z); m.position.x = Math.cos(a) * rr; m.position.z = Math.sin(a) * rr; }
      if (m.position.y < m.userData.settle + (G.sediment.visible ? G.sediment.scale.y : 0)) { G.vessel.remove(m); m.geometry.dispose(); return false; }
      return true;
    });
    // solid pieces: metals and undissolved solids
    const solids = v.contents.filter((c) => c.state === "s" && (CE.METAL_COLOUR[c.f] || !c.colour || c.deposit || /CaCO3|MnO2|CaO|MgO|CuO|Fe2O3|SiO2|NaHCO3|C6H12O6|NH4/.test(c.f)));
    const keySet = new Set(solids.map((c) => c.f));
    G.solids.children.slice().forEach((m) => { if (!keySet.has(m.userData.f)) G.solids.remove(m); });
    solids.forEach((c, i) => {
      let m = G.solids.children.find((x) => x.userData.f === c.f);
      const floats = /^(Na|K|Li|Rb|Cs)$/.test(c.f) && v.volume > 0;
      if (!m) {
        m = new THREE.Group(); m.userData = { f: c.f, phase: Math.random() * 6 };
        const col = c.deposit ? CE.METAL_COLOUR[c.f] : (c.colour || CE.METAL_COLOUR[c.f] || "#dddddd");
        const metal = !!CE.METAL_COLOUR[c.f];
        const count = c.deposit ? 26 : metal ? 1 : 8;
        for (let k = 0; k < count; k++) {
          const g = c.deposit ? new THREE.TetrahedronGeometry(0.05) : metal ? (floats ? new THREE.SphereGeometry(0.12, 14, 10) : new THREE.BoxGeometry(0.7, 0.06, 0.18)) : new THREE.DodecahedronGeometry(0.08);
          const p = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: col, metalness: metal ? 0.6 : 0.05, roughness: metal ? 0.35 : 0.8 }));
          if (count > 1) { const a = rnd(0, 6.28), rr = rnd(0, sh.r(0.1) * 0.7); p.position.set(Math.cos(a) * rr, rnd(0.02, 0.08), Math.sin(a) * rr); p.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); }
          m.add(p);
        }
        if (!c.deposit && metal && !floats) m.rotation.y = i * 0.9;
        G.solids.add(m);
      }
      const scale = c.deposit ? Math.min(1.6, 0.4 + c.mol * 40) : Math.max(0.15, Math.min(1.4, Math.cbrt(c.g / 1.5)));
      m.scale.set(scale, c.deposit ? scale : Math.max(scale, 0.5), scale);
      if (floats && v.volume > 0) { m.userData.phase += dt * 2.5; m.position.set(Math.cos(m.userData.phase) * sh.r(y) * 0.5, y + 0.02, Math.sin(m.userData.phase * 1.3) * sh.r(y) * 0.5); }
      else m.position.set(0, c.deposit ? 0.01 : 0.05 + i * 0.02, 0);
    });
    // bubbles
    const gasRate = v.gases.filter((g) => g.f !== "H2O").reduce((s, g) => s + g.rate, 0);
    const want = v.volume > 0 ? Math.min(160, Math.round(Math.log10(1 + gasRate * 2e4) * 40)) : 0;
    while (G.bubbles.length < want) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.015, 0.045), 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.05 }));
      const src = G.solids.children[0], a = rnd(0, 6.28), rr = rnd(0, sh.r(0.2) * 0.8);
      b.position.set(src ? src.position.x + rnd(-0.25, 0.25) : Math.cos(a) * rr, rnd(0, Math.max(0.05, y)), src ? src.position.z + rnd(-0.1, 0.1) : Math.sin(a) * rr);
      b.userData = { vy: rnd(0.4, 1.2) }; G.vessel.add(b); G.bubbles.push(b);
    }
    G.bubbles = G.bubbles.filter((b, k) => {
      b.position.y += b.userData.vy * dt; b.position.x += Math.sin(now / 200 + k) * dt * 0.05;
      if (b.position.y > y) { if (G.bubbles.length > want) { G.vessel.remove(b); b.geometry.dispose(); return false; } const src = G.solids.children[0]; b.position.y = 0.03; if (src) { b.position.x = src.position.x + rnd(-0.25, 0.25); b.position.z = src.position.z + rnd(-0.1, 0.1); } }
      return true;
    });
    // coloured gas above the liquid
    const coloured = v.gases.find((g) => g.colour && g.f !== "H2O" && g.rate > 1e-5);
    const top = G.vessel.position.y + sh.H;
    G.cloud.position.set(0, top + 0.6, 0);
    G.cloud.material.color.set(coloured ? coloured.colour : "#ffffff");
    G.cloud.material.opacity = coloured ? Math.min(0.75, Math.log10(1 + coloured.rate * 3e4) * 0.35) : Math.max(0, G.cloud.material.opacity - dt);
    // steam and smoke
    const steam = v.T > 85 && v.volume > 0 ? (v.T - 85) / 15 : 0, smoke = Math.max(v.smoke, steam * 0.6);
    G.smoke.forEach((s, k) => {
      s.userData.y += dt * (0.4 + k * 0.03); if (s.userData.y > 3) { s.userData.y = 0; s.userData.x = rnd(-0.3, 0.3); }
      s.position.set(s.userData.x + Math.sin(now / 900 + k) * 0.2, top + s.userData.y, Math.cos(k) * 0.2);
      const sz = 0.4 + s.userData.y * 0.5; s.scale.set(sz, sz, 1);
      s.material.opacity = smoke * (v.smoke > steam * 0.6 ? 0.6 : 0.35) * (1 - s.userData.y / 3);
      s.material.color.set(v.smoke > steam * 0.6 ? v.smokeHex : "#eeeeee");
    });
    // flame on the surface, bright light, sparks
    G.flameSprite.position.set(G.solids.children[0] ? G.solids.children[0].position.x : 0, G.vessel.position.y + Math.max(y, 0.3) + 0.25, G.solids.children[0] ? G.solids.children[0].position.z : 0);
    if (v.flameHex) { G.flameSprite.material.color.set(v.flameHex); G.flameSprite.material.opacity = 0.8 + Math.random() * 0.2; const s = 0.9 + Math.random() * 0.4; G.flameSprite.scale.set(s, s * 1.4, 1); }
    else G.flameSprite.material.opacity = Math.max(0, G.flameSprite.material.opacity - dt * 3);
    G.glow.position.set(0, G.vessel.position.y + sh.H * 0.6, 0); G.glow.material.opacity = Math.min(1, v.light); G.glowLight.intensity = v.light * 3; G.glowLight.position.copy(G.glow.position);
    const sparky = v.sparks || v.events.some((e) => e.active && (e.type === "thermite" || (e.type === "combustion" && /Fe/.test(e.eq))));
    G.sparks.forEach((s) => {
      const u = s.userData;
      if (u.life <= 0 && sparky && Math.random() < 0.3) { u.life = rnd(0.4, 1.2); s.position.set(0, G.vessel.position.y + sh.H, 0); u.v.set(rnd(-2, 2), rnd(2, 5), rnd(-2, 2)); }
      if (u.life > 0) { u.life -= dt; u.v.y -= 9 * dt; s.position.addScaledVector(u.v, dt); s.material.opacity = Math.min(1, u.life * 2); } else s.material.opacity = 0;
    });
    // carbon snake: a black porous column growing out of the sugar
    if (v.snake > 0.001) {
      if (!G.snakeMesh) { G.snakeMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 18, 6), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 })); G.vessel.add(G.snakeMesh); }
      const hgt = Math.min(sh.H * 2.4, v.snake * 3.2), rr = Math.min(sh.r(0) * 0.8, 0.45);
      G.snakeMesh.visible = true; G.snakeMesh.scale.set(rr, Math.max(0.01, hgt), rr); G.snakeMesh.position.y = hgt / 2;
      G.snakeMesh.rotation.y += dt * 0.2;
    } else if (G.snakeMesh) G.snakeMesh.visible = false;
    // silver mirror: the glass itself turns silvery
    if (G.glassMat && !sh.opaque) {
      const m = Math.min(1, v.mirror || 0);
      G.glassMat.color.setRGB(0.86, 0.93 - 0.08 * m, 1 - 0.15 * m); G.glassMat.opacity = 0.2 + 0.65 * m; G.glassMat.metalness = 0.1 + 0.8 * m;
    }
    // burner flame (a flame test colours it)
    const p = S.heatW / 2000;
    const ft = S.flameUntil > now;
    G.flameOuter.material.color.set(ft ? S.flameColour : "#4f8cff"); G.flameInner.material.color.set(ft ? S.flameColour : "#9fd0ff");
    G.flameOuter.visible = G.flameInner.visible = p > 0.01;
    G.flameOuter.scale.set(0.6 + p, 0.5 + p * 1.6, 0.6 + p); G.flameOuter.position.y = 1.05 + (0.3 * (0.5 + p * 1.6)) * 1;
    G.flameInner.scale.set(0.6 + p, 0.5 + p * 1.2, 0.6 + p); G.flameInner.position.y = 1.05 + 0.16 * (0.5 + p * 1.2);
    G.flameOuter.material.opacity = (ft ? 0.65 : 0.35) + 0.25 * Math.random();
    if (ft) { G.flameOuter.scale.multiplyScalar(1.35); }
    // camera
    camera.position.set(view.cx + view.dist * Math.cos(view.pitch) * Math.sin(view.yaw), view.cy + view.dist * Math.sin(view.pitch), view.dist * Math.cos(view.pitch) * Math.cos(view.yaw));
    camera.lookAt(view.cx, view.cy, 0);
    renderer.render(scene, camera);
  }
  function resize3d() { if (!renderer) return; const r = wrap.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%"; camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }

  // ------------------------------------------------------------------ controls & loop
  function renderControls() {
    fill($("containerSel"), t("containers").map(([v, l]) => { const o = h("option", { value: v }, l); if (v === S.container) o.selected = true; return o; }));
    fill($("expSel"), h("option", { value: "" }, t("experiments")), EXP.map((x) => h("option", { value: x.id }, tr(x.t))));
    const lab = S.heatW < 1 ? t("off") : S.heatW < 600 ? t("low") : S.heatW < 1300 ? t("med") : t("high");
    $("heatOut").textContent = lab + " · " + Math.round(S.heatW) + " W";
  }
  function runExperiment(id) {
    const x = EXP.find((e) => e.id === id); if (!x) return;
    S.lab.empty(); clearScene();
    if (x.container && x.container !== S.container) { S.container = x.container; S.lab.L.capacity = CAP[S.container]; buildVessel(); }
    else if (!x.container && S.container === "crucible") { S.container = "beaker250"; buildVessel(); }
    S.heatW = x.heat || 0; $("heat").value = String(S.heatW);
    S.speed = x.speed || 1; $("speedSel").value = String(S.speed);
    x.steps.forEach(([id2, amt, unit, conc], k) => setTimeout(() => { S.sel = id2; S.amount = amt; S.unit = unit; S.conc = conc != null ? conc : (CE.lookup(id2).conc || null); doAdd(); renderShelf(); renderAdd(); }, 700 * k));
    if (x.flame) setTimeout(flameTest, 700 * x.steps.length + 200);
    if (x.next) setTimeout(() => { const [id3, a3, u3, c3] = x.next; select(id3); S.amount = a3; S.unit = u3; S.conc = c3; renderAdd(); }, 700 * x.steps.length + 50);
    renderControls(); say(tr(x.t));
  }
  // flame test: the strongest-coloured metal in the beaker colours the burner flame for a few seconds
  function flameTest() {
    const cats = [];
    S.lab.items.forEach((it) => { const sym = it.cat ? String(it.cat).replace(/\d+$/, "") : CE.isMetal(it.f) ? it.f : null; if (sym && sym !== "H" && sym !== "NH4") cats.push([sym, it.mol]); });
    cats.sort((a, b) => b[1] - a[1]);
    const order = ["Li", "Sr", "Ba", "Cu", "K", "Ca", "Rb", "Cs", "B", "Pb", "Mn", "Fe", "Zn", "Na"];
    const sym = (cats.find((c) => order.includes(c[0])) || cats[0] || [])[0];
    const col = sym && ((CE.FLAME_EXTRA || {})[sym] || CE.FLAME[sym]);
    if (!col) { S.flameNote = { text: t("flameNone"), until: performance.now() + 4000 }; renderSide(true); return; }
    const e = S.elements.find((x) => x.sym === sym);
    S.flameColour = col; S.flameUntil = performance.now() + 7000; if (S.heatW < 600) { S.heatW = 1200; $("heat").value = "1200"; renderControls(); }
    S.flameNote = { text: (e ? (S.lang === "hi" ? e.name_hi : e.name) : sym) + " → " + col, colour: col, until: performance.now() + 7000 };
    renderSide(true); say(t("types").flametest + ": " + (e ? e.name : sym));
  }
  function clearScene() { S.flameNote = null; S.flameUntil = 0; if (!scene) return; G.particles.forEach((m) => G.vessel.remove(m)); G.particles = []; G.bubbles.forEach((b) => G.vessel.remove(b)); G.bubbles = []; G.solids.children.slice().forEach((c) => G.solids.remove(c)); }
  let last = 0, lastSide = 0;
  function frame(now) {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    if (S.ready) {
      const sim = dt * S.speed, steps = Math.max(1, Math.ceil(sim / 0.05));
      for (let k = 0; k < steps; k++) S.lab.step(sim / steps, { heatW: S.heatW, stir: S.stir });
      const v = S.lab.view(S.lang); S.lastView = v;
      updateScene(v, dt, now);
      if (now - lastSide > 300) { lastSide = now; renderSide(false); }
    }
    requestAnimationFrame(frame);
  }
  function renderText() {
    document.documentElement.lang = S.lang; document.title = t("title") + " · Quantix"; $("tTitle").textContent = t("title");
    [["flameBtn", "flameBtn"], ["shelfLbl", "shelf"], ["tabC", "compounds"], ["tabE", "elements"], ["burnerLbl", "burner"], ["stirLbl", "stir"], ["containerLbl", "container"], ["emptyBtn", "empty"], ["speedLbl", "speed"],
      ["obsLbl", "eqs"], ["contLbl", "contents"], ["safeLbl", "safety"], ["tLbl", "temp"], ["phLbl", "ph"], ["volLbl", "volume"]].forEach(([id, k]) => { $(id).textContent = t(k); });
    $("search").placeholder = t("search");
    document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === S.lang)));
    let seen = false; try { seen = localStorage.getItem("quantix-chem-tip") === "1"; } catch (_) { /* private */ }
    $("tip").hidden = seen;
    if (!seen) fill($("tip"), h("ol", {}, t("tip").map((x) => h("li", {}, x))), h("button", { type: "button", class: "btn small", onclick: () => { $("tip").hidden = true; try { localStorage.setItem("quantix-chem-tip", "1"); } catch (_) { /* private */ } } }, t("gotIt")));
    renderShelf(); renderAdd(); renderControls(); if (S.ready) renderSide(true);
  }

  $("tabC").onclick = () => { S.tab = "compounds"; renderShelf(); };
  $("tabE").onclick = () => { S.tab = "elements"; renderShelf(); };
  $("search").oninput = renderShelf;
  $("heat").oninput = (e) => { S.heatW = +e.target.value; renderControls(); };
  $("stir").onchange = (e) => { S.stir = e.target.checked; };
  $("speedSel").onchange = (e) => { S.speed = +e.target.value; };
  $("containerSel").onchange = (e) => { S.container = e.target.value; S.lab.L.capacity = CAP[S.container]; clearScene(); buildVessel(); renderSide(true); };
  $("flameBtn").onclick = flameTest;
  $("emptyBtn").onclick = () => { S.lab.empty(); clearScene(); S.lastAdd = null; renderSide(true); say(t("empty")); };
  $("expSel").onchange = (e) => { if (e.target.value) runExperiment(e.target.value); e.target.value = ""; };
  document.querySelectorAll(".lang button").forEach((b) => b.addEventListener("click", () => { S.lang = TX[b.dataset.lang] ? b.dataset.lang : "en"; try { localStorage.setItem("iav-formula-lang", S.lang); } catch (_) { /* private */ } renderText(); }));
  const rootEl = document.documentElement;
  try { const th = localStorage.getItem("iav-theme"); if (th) rootEl.dataset.theme = th; } catch (_) { /* private */ }
  $("themeBtn").onclick = () => { const dark = rootEl.dataset.theme ? rootEl.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; rootEl.dataset.theme = dark ? "light" : "dark"; try { localStorage.setItem("iav-theme", rootEl.dataset.theme); } catch (_) { /* private */ } };

  let lang = new URLSearchParams(location.search).get("lang");
  try { lang = lang || localStorage.getItem("iav-formula-lang"); } catch (_) { /* private */ }
  S.lang = TX[lang] ? lang : "en";
  renderText();
  fetch("/api/v1/elements").then((r) => r.json()).then((b) => {
    S.elements = b.data.elements; CE.init(S.elements);
    S.lab = CE.lab({ capacity: CAP[S.container] }); S.ready = true;
    init3d();
    const ex = location.hash.match(/^#ex=([\w-]+)/);
    if (ex) runExperiment(ex[1]); else select("HCl");
    renderText();
  }).catch(() => { $("eqs").textContent = "Could not load the element data."; });
  requestAnimationFrame(frame);
  window.QuantixChem = { state: S, run: runExperiment, add: (id, a, u, c) => { S.sel = id; S.amount = a; S.unit = u; S.conc = c; doAdd(); } };
})();
