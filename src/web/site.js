/* Shared page chrome for every page: the standard tab menu (filled into an empty <nav>), the footer with
   "Contact us", and the dark / light toggle on pages without their own handler. Follows the shared language
   setting (html[lang]). */
(function () {
  "use strict";
  const TABS = [["/", "Home", "Image Inspection — home"], ["/measure", "Measure", "Measure real objects in a photo"],
                ["/formulas", "Formulas", "Formula Library"], ["/elements", "Elements", "Periodic Table"],
                ["/physics", "Physics", "Physics Lab"], ["/circuit", "Circuits", "Circuit Lab"], ["/handwriting", "Solver", "Equation Solver (handwriting)"],
                ["/converter", "Converter", "Unit Converter"], ["/graph", "Graphs", "Graph Plotter"]];
  const FOOT = {
    en: { tag: "AI-powered science & maths lab", contact: "Contact us", sub: "Questions, ideas or a bug? We read every message.", top: "↑ Top", skip: "Skip to content",
          follow: "Follow us", social: "Social media", newTab: "opens in a new tab", by: "Designed & built by",
          learn: "📚 Learn:", lf: "Formulas", le: "Elements", lc: "Unit conversions" },
    hi: { tag: "AI-संचालित विज्ञान और गणित लैब", contact: "संपर्क करें", sub: "प्रश्न, सुझाव या गड़बड़ी? हम हर संदेश पढ़ते हैं।", top: "↑ ऊपर", skip: "मुख्य सामग्री पर जाएँ",
          follow: "हमें फ़ॉलो करें", social: "सोशल मीडिया", newTab: "नए टैब में खुलता है", by: "रचना एवं निर्माण",
          learn: "📚 सीखें:", lf: "सूत्र", le: "तत्व", lc: "मात्रक रूपांतरण" },
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
    <div class="sf-mid"><span class="sf-sub"></span> <a class="sf-contact" href="/contact">✉ <span></span></a>
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
