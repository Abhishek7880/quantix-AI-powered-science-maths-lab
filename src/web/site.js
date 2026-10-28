/* Shared page chrome for every page: the standard tab menu (filled into an empty <nav>), the footer with
   "Contact us", and the dark / light toggle on pages without their own handler. Follows the shared language
   setting (html[lang]). */
(function () {
  "use strict";
  const TABS = [["/", "Home", "Image Inspection — home"], ["/measure", "Measure", "Measure real objects in a photo"],
                ["/formulas", "Formulas", "Formula Library"], ["/elements", "Elements", "Periodic Table"], ["/chemlab", "Chem Lab", "Chemistry Lab"],
                ["/physics", "Physics", "Physics Lab"], ["/circuit", "Circuits", "Circuit Lab"], ["/plc", "PLC", "PLC Lab"], ["/handwriting", "Solver", "Equation Solver (handwriting)"],
                ["/converter", "Converter", "Unit Converter"], ["/graph", "Graphs", "Graph Plotter"]];
  const FOOT = {
    en: { tag: "AI-powered science & maths lab", contact: "Contact us", sub: "Questions, ideas or a bug? We read every message.", top: "↑ Top", skip: "Skip to content",
          follow: "Follow us", social: "Social media", newTab: "opens in a new tab", by: "Designed & built by",
          learn: "📚 Learn:", lf: "Formulas", le: "Elements", lc: "Unit conversions", app: "Android app" },
    hi: { tag: "AI-संचालित विज्ञान और गणित लैब", contact: "संपर्क करें", sub: "प्रश्न, सुझाव या गड़बड़ी? हम हर संदेश पढ़ते हैं।", top: "↑ ऊपर", skip: "मुख्य सामग्री पर जाएँ",
          follow: "हमें फ़ॉलो करें", social: "सोशल मीडिया", newTab: "नए टैब में खुलता है", by: "रचना एवं निर्माण",
          learn: "📚 सीखें:", lf: "सूत्र", le: "तत्व", lc: "मात्रक रूपांतरण", app: "एंड्रॉइड ऐप" },
  };
  const LEARN_BASE = "";   // Learn pages live on the main site; the static Lite build sets its full address here
  const root = document.documentElement;
  const AUTHOR = { name: "Abhishek Yadav", url: "https://github.com/Abhishek7880" };   // signature in every footer

  // author credit for search engines / link previews, and the handwriting font for the signature
  if (!document.querySelector('meta[name="author"]')) {
    const m = document.createElement("meta"); m.name = "author"; m.content = AUTHOR.name; document.head.append(m);
  }
  const sigFont = document.createElement("link");
  sigFont.rel = "stylesheet"; sigFont.href = "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600;700&display=swap";
  document.head.append(sigFont);

  // "Skip to content": the first Tab stop on every page jumps past the header and tabs
  const main = document.querySelector("main");
  const skip = document.createElement("a");
  if (main) {
    if (!main.id) main.id = "main";
    main.tabIndex = -1;
    skip.className = "skip-link"; skip.href = "#" + main.id;
    document.body.prepend(skip);
  }
  try { const th = localStorage.getItem("iav-theme"); if (th) root.dataset.theme = th; } catch (_) { /* private mode */ }

  // menu: only fills a page's empty <nav> (pages with a static menu keep theirs)
  const nav = document.querySelector("header nav");
  if (nav && !nav.children.length) {
    TABS.forEach(([href, label, full]) => {
      const a = document.createElement("a");
      a.href = href; a.textContent = label; a.title = full;
      if (location.pathname === href) { a.className = "on"; a.setAttribute("aria-current", "page"); }
      nav.append(a);
    });
  }

  // installable web app + offline labs (sw.js); the Lite static site has no /sw.js and simply skips this
  if (!document.querySelector('link[rel="manifest"]')) {
    const m = document.createElement("link"); m.rel = "manifest"; m.href = "/web/manifest.webmanifest"; document.head.append(m);
  }
  const APP = !!window.QuantixAndroid;              // inside the Android app (it packs its own offline copy)
  if (APP && "serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  } else if ("serviceWorker" in navigator && (location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { /* not available on this host */ }));
  }

  // phones: a ☰ button opens the tabs as a drawer (plus Share / Reload in the Android app)
  const header = document.querySelector("header");
  if (nav && header) {
    const mb = document.createElement("button");
    mb.type = "button"; mb.className = "menu-btn"; mb.textContent = "☰";
    mb.setAttribute("aria-expanded", "false"); mb.setAttribute("aria-label", "Menu");
    header.append(mb);
    const setOpen = (open) => {
      header.classList.toggle("nav-open", open); document.body.classList.toggle("nav-open", open);
      mb.setAttribute("aria-expanded", String(open)); mb.textContent = open ? "✕" : "☰";
      if (open) { const a = nav.querySelector("a.on") || nav.querySelector("a"); if (a) a.focus(); }
    };
    mb.addEventListener("click", () => setOpen(!header.classList.contains("nav-open")));
    nav.addEventListener("click", (e) => { if (e.target.closest("a, .nav-extra")) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && header.classList.contains("nav-open")) { setOpen(false); mb.focus(); } });
    document.addEventListener("click", (e) => { if (header.classList.contains("nav-open") && !header.contains(e.target)) setOpen(false); });
    const extra = (label, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "nav-extra"; b.textContent = label; b.addEventListener("click", fn); nav.append(b); return b; };
    const HI = () => root.lang === "hi";
    if (navigator.share || APP) extra(HI() ? "📤 यह पेज शेयर करें" : "📤 Share this page", () => share({ title: document.title, url: location.href }));
    if (APP) {
      extra(HI() ? "⟳ पुनः लोड" : "⟳ Reload", () => location.reload());
      if (QuantixAndroid.shareApp) extra(HI() ? "📲 ऐप शेयर करें" : "📲 Share the app", () => QuantixAndroid.shareApp());
      if (QuantixAndroid.checkUpdate) extra(HI() ? "🔄 अपडेट जाँचें" : "🔄 Check for updates", () => QuantixAndroid.checkUpdate());
      if (QuantixAndroid.version) {
        const v = document.createElement("span"); v.className = "nav-extra app-ver";
        v.textContent = `Quantix ${QuantixAndroid.version()} · ${HI() ? "लैब ऑफ़लाइन भी चलते हैं" : "labs work offline too"}`;
        nav.append(v);
      }
    }
    window.__quantixMenu = setOpen;
  }
  function share(d) {
    if (window.QuantixAndroid && QuantixAndroid.share) QuantixAndroid.share(d.title || "Quantix", d.url || location.href);
    else if (navigator.share) navigator.share(d).catch(() => {});
  }
  window.QuantixShare = share;
  // the Android app follows the page theme for its status bar
  function reportTheme() {
    if (!window.QuantixAndroid || !QuantixAndroid.theme) return;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    QuantixAndroid.theme(dark, getComputedStyle(root).getPropertyValue("--bg").trim() || (dark ? "#050a16" : "#eef3fb"));
  }
  new MutationObserver(reportTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", reportTheme);
  addEventListener("load", reportTheme);

  // footer
  const foot = document.createElement("footer");
  foot.className = "site-foot";
  foot.innerHTML = `<div class="sf-brand"><b>Quant<span class="grad">ix</span></b><span class="sf-tag"></span>
      <a class="sf-sign" href="${AUTHOR.url}" target="_blank" rel="noopener noreferrer author">
        <span class="sf-by"></span>
        <span class="sig-wrap"><span class="sig">${AUTHOR.name}</span>
          <svg class="sig-swoosh" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path d="M3 11 C 45 3, 95 14, 140 7 S 190 4, 197 9"/>
            <path class="spark" d="M3 11 C 45 3, 95 14, 140 7 S 190 4, 197 9"/></svg></span></a>
      <span class="sf-role" hidden></span><span class="sf-reach" hidden></span></div>
    <div class="sf-mid"><span class="sf-sub"></span> <a class="sf-contact" href="/contact">✉ <span></span></a> <a class="sf-app" href="/web/app/Quantix.apk" download="Quantix.apk">📱 <span></span></a>
      <nav class="sf-learn" aria-label="Learn"><b></b> <a data-l="lf"></a> · <a data-l="le"></a> · <a data-l="lc"></a></nav></div>
    <div class="sf-end"><nav class="sf-social" hidden></nav><span>© ${new Date().getFullYear()}</span><a class="sf-top" href="#">↑</a></div>`;
  document.body.append(foot);
  foot.querySelector(".sf-top").addEventListener("click", (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: "smooth" }); });
  if (location.pathname === "/contact") foot.querySelector(".sf-contact").setAttribute("aria-current", "page");

  // the signature "writes itself" the first time the footer scrolls into view
  const sign = foot.querySelector(".sf-sign");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { sign.classList.add("on"); io.disconnect(); } });
    io.observe(sign);
  } else sign.classList.add("on");

  // social links (config.yaml → social:): icons in the footer of every page, plus a "Follow us" block on pages
  // that have an element with [data-social]. Brand icons load from social_icons.js only when there are links.
  const social = foot.querySelector(".sf-social");
  let socialLinks = [];
  function socialIcon(id) {
    const NS = "http://www.w3.org/2000/svg", [d, colour] = (window.SOCIAL_ICONS || {})[id] || [];
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    if (d) { const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); svg.append(p); }
    if (colour) svg.style.setProperty("--brand", colour);
    return svg;
  }
  function socialLink(l, L, withName) {
    const a = document.createElement("a");
    a.href = l.url; a.target = "_blank"; a.rel = "noopener noreferrer me";
    a.className = "social-link"; a.dataset.platform = l.id; a.title = l.name;
    a.setAttribute("aria-label", `${l.name} (${L.newTab})`);
    a.append(socialIcon(l.id));
    if (withName || !window.SOCIAL_ICONS) { const s = document.createElement("span"); s.textContent = l.name; a.append(s); }
    return a;
  }
  function renderSocial(L) {
    social.setAttribute("aria-label", L.social);
    social.replaceChildren(...socialLinks.map((l) => socialLink(l, L, false)));
    social.hidden = !socialLinks.length;
    document.querySelectorAll("[data-social]").forEach((box) => {
      const title = document.createElement("b"); title.className = "social-title"; title.textContent = L.follow;
      const row = document.createElement("div"); row.className = "social-row";
      row.append(...socialLinks.map((l) => socialLink(l, L, true)));
      box.replaceChildren(title, row);
      box.hidden = !socialLinks.length;
    });
  }
  // signature details from config.yaml → author: (name, title, email, phone, link). Email and phone are written
  // in by script, not in the page source, which keeps them away from simple address-harvesting bots.
  function applyAuthor(a) {
    if (!a) return;
    foot.querySelector(".sig").textContent = a.name;
    if (a.url) sign.href = a.url; else { sign.removeAttribute("href"); sign.removeAttribute("target"); }
    AUTHOR.name = a.name;
    const role = foot.querySelector(".sf-role"), reach = foot.querySelector(".sf-reach");
    role.textContent = a.title || ""; role.hidden = !a.title;
    const items = [];
    if (a.email) { const m = document.createElement("a"); m.href = "mailto:" + a.email; m.textContent = "✉ " + a.email; items.push(m); }
    if (a.phone) { const t = document.createElement("a"); t.href = "tel:" + a.phone_tel; t.textContent = "📱 " + a.phone; items.push(t); }
    reach.replaceChildren(...items); reach.hidden = !items.length;
  }
  fetch("/api/v1/social").then((r) => r.json()).then((b) => {
    if (!b || !b.success) return;
    applyAuthor(b.data.author);
    texts();
    if (!b.data.links.length) return;
    socialLinks = b.data.links;
    const show = () => renderSocial(FOOT[root.lang === "hi" ? "hi" : "en"]);
    if (window.SOCIAL_ICONS) { show(); return; }
    const sc = document.createElement("script");
    sc.src = "/web/social_icons.js"; sc.onload = show; sc.onerror = show;        // without icons: plain links
    document.head.append(sc);
  }).catch(() => { /* offline: no social links */ });

  function texts() {
    const L = FOOT[root.lang === "hi" ? "hi" : "en"];
    if (socialLinks.length) renderSocial(L);
    foot.querySelector(".sf-tag").textContent = L.tag;
    foot.querySelector(".sf-sub").textContent = L.sub;
    foot.querySelector(".sf-contact span").textContent = L.contact;
    const app = foot.querySelector(".sf-app");
    app.querySelector("span").textContent = L.app; app.hidden = /QuantixApp/.test(navigator.userAgent);   // not shown inside the app itself
    foot.querySelector(".sf-top").textContent = L.top;
    foot.querySelector(".sf-by").textContent = L.by;
    const hi = root.lang === "hi" ? "/hi" : "";       // Hindi Learn pages exist for formulas and elements
    const learnHref = { lf: `${hi}/learn/formulas/`, le: `${hi}/learn/elements/`, lc: "/learn/convert/" };
    foot.querySelector(".sf-learn b").textContent = L.learn;
    foot.querySelectorAll(".sf-learn a").forEach((a) => { a.textContent = L[a.dataset.l]; a.href = LEARN_BASE + learnHref[a.dataset.l]; });
    foot.querySelector(".sf-sign").setAttribute("aria-label", `${L.by} ${AUTHOR.name} — GitHub (${L.newTab})`);
    skip.textContent = L.skip;
  }
  texts();
  new MutationObserver(texts).observe(root, { attributes: true, attributeFilter: ["lang"] });

  if (APP) appMode();

  /* ---------------------------------------------------------------- Android app: feels like an app, not a website
     bottom tab bar + Labs sheet, pull to refresh, tap vibration, back closes menus first, offline badge,
     "internet needed" popup when a live feature can't reach the server. */
  function appMode() {
    const A = window.QuantixAndroid, path = location.pathname.replace(/\/$/, "") || "/";
    root.classList.add("in-app");
    const css = document.createElement("style");
    css.textContent = `
      html.in-app { -webkit-tap-highlight-color: transparent; overscroll-behavior-y: none; }
      html.in-app body { padding-bottom: calc(64px + env(safe-area-inset-bottom)); animation: qx-in .18s ease-out; }
      @keyframes qx-in { from { opacity: 0; transform: translateY(6px); } }
      html.in-app button, html.in-app a, html.in-app .tool, html.in-app header { -webkit-touch-callout: none; user-select: none; }
      html.in-app .skip-link, html.in-app .sf-learn { display: none; }
      .qx-tabs { position: fixed; left: 0; right: 0; bottom: 0; z-index: 900; display: flex; height: calc(60px + env(safe-area-inset-bottom));
        padding-bottom: env(safe-area-inset-bottom); background: color-mix(in srgb, var(--bg, #050a16) 88%, transparent);
        backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-top: 1px solid var(--line, #1e293b); }
      .qx-tabs > * { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; border: 0; background: none;
        color: var(--muted, #93a6c4); font: 600 11px system-ui, sans-serif; text-decoration: none; padding: 0; min-width: 0; cursor: pointer; }
      .qx-tabs svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; transition: transform .15s; }
      .qx-tabs .on { color: var(--accent, #38bdf8); }
      .qx-tabs .on svg { transform: translateY(-1px) scale(1.08); }
      .qx-tabs .on::before { content: ""; position: absolute; top: 0; width: 28px; height: 3px; border-radius: 0 0 3px 3px; background: currentColor; }
      .qx-tabs > * { position: relative; }
      .qx-dim { position: fixed; inset: 0; z-index: 950; background: rgba(2,6,16,.55); opacity: 0; pointer-events: none; transition: opacity .2s; }
      .qx-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 960; background: var(--panel, #0b1426); color: var(--ink, #e6f0ff);
        border-radius: 20px 20px 0 0; padding: 10px 16px calc(18px + env(safe-area-inset-bottom)); transform: translateY(105%); transition: transform .24s cubic-bezier(.2,.8,.2,1);
        box-shadow: 0 -10px 40px rgba(0,0,0,.4); border-top: 1px solid var(--line, #1e293b); }
      .qx-sheet.open { transform: none; } .qx-sheet.open + .qx-dim, .qx-dim.open { opacity: 1; pointer-events: auto; }
      .qx-sheet .grab { width: 40px; height: 4px; border-radius: 4px; background: var(--line, #334155); margin: 0 auto 12px; }
      .qx-sheet h3 { margin: 0 0 12px; font: 700 16px system-ui, sans-serif; }
      .qx-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
      .qx-grid a { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 4px; border-radius: 14px; text-decoration: none;
        color: inherit; background: color-mix(in srgb, var(--accent, #38bdf8) 8%, transparent); font: 600 12px system-ui, sans-serif; text-align: center; }
      .qx-grid a b { font-size: 26px; line-height: 1; } .qx-grid a.on { outline: 2px solid var(--accent, #38bdf8); }
      .qx-ptr { position: fixed; top: -44px; left: 50%; z-index: 980; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center;
        background: var(--panel, #0b1426); box-shadow: 0 4px 16px rgba(0,0,0,.35); opacity: 0; transform: translate(-50%, 0); pointer-events: none; }
      .qx-ptr svg { width: 22px; height: 22px; fill: none; stroke: var(--accent, #38bdf8); stroke-width: 2.4; stroke-linecap: round; }
      .qx-ptr.spin svg { animation: qx-spin .7s linear infinite; } @keyframes qx-spin { to { transform: rotate(360deg); } }
      .qx-off { position: fixed; top: calc(8px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); z-index: 970; display: none;
        padding: 4px 12px; border-radius: 999px; background: #b45309; color: #fff; font: 600 12px system-ui, sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,.3); }
      html.is-offline .qx-off { display: block; }
      .app-ver { opacity: .65; font-size: 12px; cursor: default; }
      html.in-app .toast { bottom: calc(78px + env(safe-area-inset-bottom)) !important; z-index: 990 !important; }
      html.in-app .drawer { bottom: calc(60px + env(safe-area-inset-bottom)) !important; }`;
    document.head.append(css);

    const hi = () => root.lang === "hi";
    const tap = () => { try { A.haptic && A.haptic(); } catch (_) { /* older app */ } };
    const I = { home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
                measure: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
                labs: '<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 006.2 21h11.6a2 2 0 001.7-2.5L14 9V3"/><path d="M7 15h10"/>',
                formulas: '<path d="M18 4H6l6 8-6 8h12"/>',
                more: '<path d="M4 6h16M4 12h16M4 18h16"/>' };
    const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;
    const LABS = [["/circuit", "🔌", "Circuits", "सर्किट"], ["/chemlab", "⚗️", "Chem Lab", "रसायन"], ["/plc", "🏭", "PLC", "पीएलसी"],
                  ["/physics", "🧲", "Physics", "भौतिकी"], ["/elements", "🧪", "Elements", "तत्व"], ["/converter", "🔁", "Converter", "रूपांतरक"],
                  ["/graph", "📈", "Graphs", "ग्राफ़"], ["/handwriting", "✍️", "Solver", "हल करें"]];
    const inLabs = LABS.some(([p]) => p === path);

    const tabs = document.createElement("nav");
    tabs.className = "qx-tabs"; tabs.setAttribute("aria-label", "App");
    const sheet = document.createElement("div"), dim = document.createElement("div");
    sheet.className = "qx-sheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); dim.className = "qx-dim";
    const off = document.createElement("div"); off.className = "qx-off";
    function render() {
      const L = (en, h) => (hi() ? h : en);
      tabs.innerHTML = `<a href="/" class="${path === "/" ? "on" : ""}">${svg("home")}<span>${L("Home", "होम")}</span></a>
        <a href="/measure" class="${path === "/measure" ? "on" : ""}">${svg("measure")}<span>${L("Measure", "मापन")}</span></a>
        <button type="button" data-k="labs" class="${inLabs ? "on" : ""}">${svg("labs")}<span>${L("Labs", "लैब")}</span></button>
        <a href="/formulas" class="${path === "/formulas" ? "on" : ""}">${svg("formulas")}<span>${L("Formulas", "सूत्र")}</span></a>
        <button type="button" data-k="more">${svg("more")}<span>${L("More", "और")}</span></button>`;
      sheet.innerHTML = `<div class="grab"></div><h3>${L("Labs & tools", "लैब और उपकरण")}</h3><div class="qx-grid">${
        LABS.map(([p, e, en, h]) => `<a href="${p}" class="${p === path ? "on" : ""}"><b>${e}</b>${hi() ? h : en}</a>`).join("")}</div>`;
      off.textContent = L("Offline", "ऑफ़लाइन");
    }
    render();
    new MutationObserver(render).observe(root, { attributes: true, attributeFilter: ["lang"] });
    document.body.append(tabs, sheet, dim, off);
    const setSheet = (open) => { sheet.classList.toggle("open", open); dim.classList.toggle("open", open); };
    tabs.addEventListener("click", (e) => {
      const b = e.target.closest("[data-k]");
      if (!b) return;
      if (b.dataset.k === "labs") setSheet(!sheet.classList.contains("open"));
      else if (window.__quantixMenu) { setSheet(false); window.__quantixMenu(!document.body.classList.contains("nav-open")); e.stopPropagation(); }
    });
    dim.addEventListener("click", () => setSheet(false));
    // swipe the sheet down to close it
    let sy = null;
    sheet.addEventListener("touchstart", (e) => { sy = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener("touchmove", (e) => { if (sy != null && e.touches[0].clientY - sy > 60) { setSheet(false); sy = null; } }, { passive: true });

    // the hardware back button closes the sheet / menu / an open dialog before leaving the page
    window.__quantixBack = () => {
      if (sheet.classList.contains("open")) { setSheet(false); return true; }
      if (document.body.classList.contains("nav-open") && window.__quantixMenu) { window.__quantixMenu(false); return true; }
      const dlg = document.querySelector("dialog[open]");
      if (dlg) { dlg.close(); return true; }
      // a page's own panel (element details, formula drawer, slide-overs): Escape, else its close button
      const panel = [...document.querySelectorAll('[aria-modal="true"]')].find((p) => p !== sheet && !p.hidden && p.offsetParent !== null);
      if (panel) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        if (panel.hidden || panel.offsetParent === null) return true;
        const x = panel.querySelector('[aria-label="Close"], [aria-label="close"], .close, .x');
        if (x) { x.click(); return true; }
      }
      return false;
    };

    // a light vibration on taps, like native controls (respects the phone's "touch feedback" setting)
    document.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest("button, a, summary, [role=tab], [role=button], input[type=checkbox], input[type=radio], label")) tap();
    }, true);

    // online / offline: badge, and a popup when a live feature fails to reach the server
    const setNet = (ok) => root.classList.toggle("is-offline", !ok);
    try { setNet(A.isOnline ? A.isOnline() : navigator.onLine); } catch (_) { /* older app */ }
    addEventListener("quantix-net", (e) => setNet(e.detail));
    const live = /\/api\/v1\/(predict|measure\/(references|shapes)|feedback|contact|handwriting|solve|eq|formulas\/(pdf|calc\/solve)|chemistry)/;
    const f0 = window.fetch.bind(window);
    window.fetch = (input, init) => f0(input, init).catch((err) => {
      const u = typeof input === "string" ? input : (input && input.url) || "";
      if (live.test(u) && A.needInternet) A.needInternet();
      throw err;
    });

    // pull down at the top of a page to refresh (not on the lab boards, where dragging moves parts)
    const NO_PTR = /^\/(circuit|plc|chemlab|physics|graph|measure|handwriting)$/;
    if (!NO_PTR.test(path)) {
      const ptr = document.createElement("div");
      ptr.className = "qx-ptr";
      ptr.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>';
      document.body.append(ptr);
      let y0 = null, pull = 0;
      const scrolledParent = (el) => { for (; el && el !== document.body; el = el.parentElement) if (el.scrollTop > 0) return true; return false; };
      const reset = () => { ptr.style.transition = "transform .2s, opacity .2s"; ptr.style.transform = "translate(-50%, 0)"; ptr.style.opacity = "0"; };
      addEventListener("touchstart", (e) => {
        y0 = (scrollY > 0 || e.touches.length > 1 || sheet.classList.contains("open") || document.body.classList.contains("nav-open")
              || e.target.closest("canvas, input, textarea, select, [contenteditable], .qx-tabs") || scrolledParent(e.target)) ? null : e.touches[0].clientY;
        pull = 0; ptr.style.transition = "none";
      }, { passive: true });
      addEventListener("touchmove", (e) => {
        if (y0 == null) return;
        const d = e.touches[0].clientY - y0;
        if (d <= 0 || scrollY > 0) { pull = 0; reset(); return; }
        pull = Math.min(120, d * 0.5);
        ptr.style.transform = `translate(-50%, ${pull + 44}px) rotate(${pull * 3}deg)`;
        ptr.style.opacity = String(Math.min(1, pull / 60));
      }, { passive: true });
      addEventListener("touchend", () => {
        if (y0 == null) return;
        y0 = null;
        if (pull >= 64) { tap(); ptr.style.transform = "translate(-50%, 104px)"; ptr.classList.add("spin"); setTimeout(() => location.reload(), 150); }
        else reset();
        pull = 0;
      });
    }
  }

  // theme toggle for pages that do not wire their own
  addEventListener("load", () => {
    const b = document.getElementById("themeBtn");
    if (b && !b.onclick) {
      b.onclick = () => {
        const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
        root.dataset.theme = dark ? "light" : "dark";
        try { localStorage.setItem("iav-theme", root.dataset.theme); } catch (_) { /* private mode */ }
      };
    }
  });
})();
