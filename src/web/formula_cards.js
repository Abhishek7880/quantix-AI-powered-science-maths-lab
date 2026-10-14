/* Formula cards for the home page: every formula of the library, one card at a time.
   Mount: <section id="formulaCards"></section> + this script. Data: GET /api/v1/formulas?full=true&lang=…
   Auto-advances (pauses on hover / focus / hidden tab), ← → to move, Space to pause, shuffle, category filter,
   EN / हिन्दी (shared with the Formula Library), links to the library and to the 🧮 calculator. */
(function () {
  "use strict";
  const API = "/api/v1";
  const mount = document.getElementById("formulaCards");
  if (!mount) return;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const T = {
    en: { title: "Formula cards", all: "All categories", shuffle: "Shuffled", ordered: "In order", speed: "Speed",
          prev: "Previous formula", next: "Next formula", pause: "Pause", play: "Play", open: "Open in library",
          calc: "🧮 Calculate", copy: "Copy formula", copied: "Copied", hide: "Hide", show: "Show formula cards",
          loading: "Loading formulas…", offline: "Formula Library not reachable.", order: "Order", category: "Category",
          keys: "← → move · Space pause", sec: (s) => `${s} s` },
    hi: { title: "सूत्र कार्ड", all: "सभी श्रेणियाँ", shuffle: "मिश्रित क्रम", ordered: "क्रम से", speed: "गति",
          prev: "पिछला सूत्र", next: "अगला सूत्र", pause: "रोकें", play: "चलाएँ", open: "संग्रह में खोलें",
          calc: "🧮 गणना करें", copy: "सूत्र कॉपी करें", copied: "कॉपी हो गया", hide: "छिपाएँ", show: "सूत्र कार्ड दिखाएँ",
          loading: "सूत्र लोड हो रहे हैं…", offline: "सूत्र संग्रह उपलब्ध नहीं है।", order: "क्रम", category: "श्रेणी",
          keys: "← → आगे-पीछे · Space रोकें", sec: (s) => `${s} सेकंड` },
  };
  const S = { lang: "en", cards: [], deck: [], pos: 0, cat: "all", shuffle: true, ms: 6000, playing: true,
              hover: false, hidden: false, timer: null, started: 0, calc: {}, collapsed: false };
  const t = (k, ...a) => { const v = T[S.lang][k]; return typeof v === "function" ? v(...a) : v; };
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
                  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } } };

  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    kids.flat(Infinity).forEach((c) => c != null && c !== false && e.append(c.nodeType ? c : document.createTextNode(String(c))));
    return e;
  }
  const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));

  // ---------------------------------------------------------------- data
  async function load() {
    fill(mount, h("div", { class: "fc-empty" }, t("loading")));
    try {
      const [lib, calc] = await Promise.all([
        fetch(`${API}/formulas?full=true&lang=${S.lang}`).then((r) => r.json()),
        Object.keys(S.calc).length ? Promise.resolve(null) : fetch(`${API}/formulas/calc/index`).then((r) => r.json()).catch(() => null),
      ]);
      if (calc && calc.success) S.calc = calc.data;
      if (!lib.success) throw new Error(lib.message);
      S.cards = [];
      lib.data.forEach((c) => c.sections.forEach((s) => s.items.forEach((it, i) => S.cards.push({
        catId: c.id, cat: c.title, icon: c.icon || "•", secId: s.id, sec: s.title, sketch: s.sketch || null,
        name: it[0], formula: it[1], note: it[2] || "", idx: i,
      }))));
      S.cats = lib.data.map((c) => ({ id: c.id, title: c.title }));
      if (S.cat !== "all" && !S.cats.some((c) => c.id === S.cat)) S.cat = "all";
      buildDeck(true);
    } catch (_) {
      fill(mount, h("div", { class: "fc-empty" }, t("offline")));
    }
  }

  function buildDeck(keepCard) {
    const current = keepCard && S.deck[S.pos];
    S.deck = S.cards.filter((c) => S.cat === "all" || c.catId === S.cat);
    if (S.shuffle) {
      for (let i = S.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [S.deck[i], S.deck[j]] = [S.deck[j], S.deck[i]]; }
    }
    const same = current && S.deck.findIndex((c) => c.catId === current.catId && c.secId === current.secId && c.idx === current.idx);
    S.pos = same >= 0 ? same : 0;
    render();
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (S.collapsed) {
      stop();
      fill(mount, h("button", { class: "fc-btn fc-showbtn", type: "button", onclick: () => setCollapsed(false) }, "🃏 " + t("show")));
      return;
    }
    const c = S.deck[S.pos];
    if (!c) { fill(mount, h("div", { class: "fc-empty" }, t("loading"))); return; }
    const calcable = ((S.calc[c.catId] || {})[c.secId] || []).includes(c.idx);
    const live = S.playing ? "off" : "polite";        // don't announce every auto-advance to screen readers

    const sel = (label, value, opts, onchange) => h("label", { class: "fc-opt" }, h("span", {}, label),
      (() => { const s = h("select", { onchange: (e) => onchange(e.target.value) },
        opts.map(([v, txt]) => h("option", { value: v }, txt))); s.value = value; return s; })());

    fill(mount,
      h("div", { class: "fc-top" },
        h("h2", { class: "fc-title" }, "🃏 " + t("title")),
        h("span", { class: "fc-count" }, `${S.pos + 1} / ${S.deck.length}`),
        h("span", { class: "fc-spacer" }),
        sel(t("category"), S.cat, [["all", t("all")], ...S.cats.map((x) => [x.id, x.title])], (v) => { S.cat = v; save(); buildDeck(false); }),
        sel(t("order"), S.shuffle ? "1" : "0", [["1", t("shuffle")], ["0", t("ordered")]], (v) => { S.shuffle = v === "1"; save(); buildDeck(true); }),
        sel(t("speed"), String(S.ms), [3000, 6000, 10000, 15000].map((ms) => [String(ms), t("sec", ms / 1000)]),
          (v) => { S.ms = Number(v); save(); restart(); }),
        h("div", { class: "fc-lang", role: "group", "aria-label": "Language / भाषा" }, ["en", "hi"].map((l) =>
          h("button", { type: "button", lang: l, "aria-pressed": String(S.lang === l), onclick: () => setLang(l) }, l === "en" ? "EN" : "हिन्दी"))),
        h("button", { class: "fc-btn", type: "button", title: t("hide"), "aria-label": t("hide"), onclick: () => setCollapsed(true) }, "✕")),
      h("div", { class: "fc-body" },
        h("button", { class: "fc-nav", type: "button", "aria-label": t("prev"), onclick: () => step(-1) }, "‹"),
        h("article", { class: "fc-card" + (reduceMotion ? "" : " fc-anim"), tabindex: "0", "aria-roledescription": "slide",
                       "aria-live": live, "aria-label": `${c.cat} — ${c.name}`, onkeydown: onKey },
          h("div", { class: "fc-meta" }, h("span", { class: "fc-chip" }, `${c.icon} ${c.cat}`), h("span", { class: "fc-sec" }, c.sec)),
          h("div", { class: "fc-main" },
            c.sketch ? h("img", { class: "fc-sketch", src: `${API}/formulas/sketch/${c.sketch}.svg`, alt: "" }) : null,
            h("div", { class: "fc-text" },
              h("div", { class: "fc-name" }, c.name),
              h("div", { class: "fc-formula" }, c.formula),
              c.note ? h("div", { class: "fc-note" }, c.note) : null)),
          h("div", { class: "fc-actions" },
            h("a", { class: "fc-btn", href: `/formulas#${c.catId}` }, t("open")),
            calcable ? h("a", { class: "fc-btn fc-primary", href: `/formulas?calc=${encodeURIComponent(`${c.catId}/${c.secId}/${c.idx}`)}#${c.catId}` }, t("calc")) : null,
            h("button", { class: "fc-btn", type: "button", onclick: () => copy(c.formula) }, "⧉ " + t("copy")),
            h("span", { class: "fc-keys" }, t("keys")))),
        h("button", { class: "fc-nav", type: "button", "aria-label": t("next"), onclick: () => step(1) }, "›")),
      h("div", { class: "fc-foot" },
        h("button", { class: "fc-btn fc-play", type: "button", "aria-label": S.playing ? t("pause") : t("play"), title: S.playing ? t("pause") : t("play"),
                      onclick: togglePlay }, S.playing ? "❚❚" : "▶"),
        h("div", { class: "fc-progress", "aria-hidden": "true" }, h("div", { class: "fc-bar", id: "fcBar" }))));
    restart();
  }

  // ---------------------------------------------------------------- timer
  function stop() { clearTimeout(S.timer); S.timer = null; }
  function running() { return S.playing && !S.hover && !S.hidden && !S.collapsed && S.deck.length > 1; }
  function restart() {
    stop();
    const bar = document.getElementById("fcBar");
    if (bar) {
      bar.style.transition = "none";
      bar.style.width = "0%";
      if (running()) {
        void bar.offsetWidth;                          // restart the CSS transition
        bar.style.transition = `width ${S.ms}ms linear`;
        bar.style.width = "100%";
      }
    }
    if (running()) S.timer = setTimeout(() => step(1), S.ms);
  }
  function step(d) {
    if (!S.deck.length) return;
    S.pos = (S.pos + d + S.deck.length) % S.deck.length;
    const hadFocus = mount.contains(document.activeElement) && document.activeElement.classList.contains("fc-card");
    render();
    if (hadFocus) mount.querySelector(".fc-card").focus();
  }
  function togglePlay() { S.playing = !S.playing; save(); render(); mount.querySelector(".fc-play").focus(); }

  function onKey(e) {
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === " ") { e.preventDefault(); S.playing = !S.playing; save(); render(); mount.querySelector(".fc-card").focus(); }
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const ta = h("textarea", {}); ta.value = text; document.body.append(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) { /* ignored */ }
      ta.remove();
    }
    const b = mount.querySelector(".fc-actions button");
    if (b) { const old = b.textContent; b.textContent = "✓ " + t("copied"); setTimeout(() => { b.textContent = old; }, 1200); }
  }

  // the language key is shared with the Formula Library and the Unit Converter as a plain string ("en" / "hi")
  function setLang(l) { S.lang = l; try { localStorage.setItem("iav-formula-lang", l); } catch (_) { /* private mode */ } load(); }
  function setCollapsed(v) { S.collapsed = v; save(); render(); }
  function save() { store.set("iav-fcards", { cat: S.cat, shuffle: S.shuffle, ms: S.ms, playing: S.playing, collapsed: S.collapsed }); }

  // pause while the pointer or keyboard focus is on the strip, or the tab is hidden
  mount.addEventListener("mouseenter", () => { S.hover = true; restart(); });
  mount.addEventListener("mouseleave", () => { S.hover = mount.contains(document.activeElement); restart(); });
  mount.addEventListener("focusin", () => { S.hover = true; restart(); });
  mount.addEventListener("focusout", (e) => { if (!mount.contains(e.relatedTarget)) { S.hover = false; restart(); } });
  document.addEventListener("visibilitychange", () => { S.hidden = document.hidden; restart(); });

  const saved = store.get("iav-fcards", {});
  Object.assign(S, {
    cat: saved.cat || "all", shuffle: saved.shuffle !== false, ms: [3000, 6000, 10000, 15000].includes(saved.ms) ? saved.ms : 6000,
    playing: saved.playing !== false && !reduceMotion, collapsed: !!saved.collapsed,
    lang: (() => { try { return localStorage.getItem("iav-formula-lang") === "hi" ? "hi" : "en"; } catch (_) { return "en"; } })(),
  });
  load();
})();
