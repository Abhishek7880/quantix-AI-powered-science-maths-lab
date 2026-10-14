/* Quantix Lite — the free static version (Hugging Face Static Space). Loaded first on every page by
   tools/build_static.py. It answers the pages' /api/v1/... requests inside the browser, so the pages themselves stay
   exactly the same as on the full server:
     • read-only data (formulas, elements, settings…) → pre-built JSON files in /static-api/
     • formula calculator, equation solver, molar mass → the project's own Python code (src/formula_calc.py,
       src/eqsolve.py, src/chemistry.py) running in the browser with Pyodide (Python + SymPy, loaded on first use)
     • formula PDFs → pre-made files in /pdf/ (link clicks are redirected)
     • contact form → Web3Forms (emails the owner; key in /static-api/site.json)
     • photo AI (shape detection, Measure, handwriting recognition) → a clear "full version only" message
   Every answer uses the same {code, success, message, data | error} envelope as the real API. */
(function () {
  "use strict";
  const PREFIX = "/api/v1/";
  const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
  const realFetch = window.fetch.bind(window);
  const lang = () => { try { return localStorage.getItem("iav-formula-lang") === "hi" ? "hi" : "en"; } catch (_) { return "en"; } };

  // ------------------------------------------------------------------ envelope helpers
  const reply = (body) => new Response(JSON.stringify(body), { status: body.code, headers: { "Content-Type": "application/json" } });
  const ok = (data, message, code = 200) => reply({ code, success: true, message, data });
  const fail = (code, errorCode, title, content, message, data) =>
    reply(Object.assign({ code, success: false, message: message || title, error: { errorCode, errorTitle: title, errorContent: content } },
                        data ? { data } : {}));

  // the same file name rule as tools/build_static.py: route + sorted query, unsafe characters -> "_"
  function dataFile(route, params) {
    const q = [...params.entries()].sort((a, b) => (a[0] + "=" + a[1] < b[0] + "=" + b[1] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("&");
    return "/static-api/" + (route + (q ? "__" + q : "")).replace(/[^A-Za-z0-9._-]/g, "_") + ".json";
  }
  const cache = {};
  const getJSON = (url) => (cache[url] = cache[url] || realFetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.json(); }));
  const site = () => getJSON("/static-api/site.json");

  // ------------------------------------------------------------------ small status toast ("loading the maths engine…")
  let toastEl = null;
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.setAttribute("role", "status");
      toastEl.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:9999;max-width:min(420px,calc(100vw - 32px));" +
        "padding:10px 14px;border-radius:12px;font:600 13.5px system-ui,sans-serif;color:#e6f0ff;" +
        "background:rgba(10,20,40,.92);border:1px solid rgba(120,170,255,.35);box-shadow:0 10px 30px rgba(0,0,0,.35)";
      document.body.append(toastEl);
    }
    toastEl.textContent = text || ""; toastEl.hidden = !text;
  }

  // ------------------------------------------------------------------ Python in the browser (Pyodide)
  const BRIDGE = `
import json, sys
sys.path.insert(0, "/home/pyodide")
from src.errors import AppError

def quantix_call(name, args_json):
    a = json.loads(args_json)
    try:
        if name == "molar_mass":
            from src import chemistry
            r = chemistry.molar_mass(a["formula"]); msg = f"M({r['formula']}) = {r['molar_mass']} g/mol"
        elif name == "describe":
            from src import formula_calc as fc
            r = fc.describe(a["text"], category=a.get("category"), section_vars=a.get("section_vars"), lang=a.get("lang", "en"))
            r["unit"] = a.get("unit"); msg = f"{len(r['equations'])} equation(s)"
        elif name == "solve":
            from src import formula_calc as fc
            r = fc.solve(a["text"], a["solve_for"], a.get("values") or {}, eq_index=a.get("equation", 0), lang=a.get("lang", "en"),
                         unit=a.get("unit"), angle_unit=a.get("angle_unit", "deg"))
            msg = r["steps"][-1]["text"]
        elif name == "item_unit":
            from src import formula_calc as fc
            r = fc.item_unit(a.get("note") or ""); msg = ""
        elif name == "eq_solve":
            from src import eqsolve
            r = eqsolve.solve_text(a.get("text", ""), a.get("lang", "en")); msg = f"{r['kind']}"
        else:
            raise ValueError(name)
        return json.dumps({"ok": True, "data": r, "message": msg}, default=str)
    except AppError as e:
        return json.dumps({"ok": False, "status": e.status_code, "code": e.error_code, "title": e.error_title,
                           "content": e.error_content, "message": e.message, "details": e.details}, default=str)
    except Exception as e:
        return json.dumps({"ok": False, "status": 500, "code": "INTERNAL_ERROR", "title": "Internal error",
                           "content": f"{type(e).__name__}: {e}", "message": "The request could not be completed."})
`;
  let pyCore = null, pySympy = null;
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.append(s); });
  }
  function pyodide(needSympy) {
    if (!pyCore) pyCore = (async () => {
      toast(lang() === "hi" ? "⏳ गणित इंजन लोड हो रहा है (पहली बार ~10 सेकंड)…" : "⏳ Loading the maths engine (first time only, ~10 s)…");
      await loadScript(PYODIDE + "pyodide.js");
      const py = await window.loadPyodide({ indexURL: PYODIDE });
      const files = await getJSON("/py/manifest.json");
      for (const f of files) {
        const buf = new Uint8Array(await (await realFetch("/py/" + f)).arrayBuffer());
        const dir = ("/home/pyodide/" + f).split("/").slice(0, -1).join("/");
        py.FS.mkdirTree(dir);
        py.FS.writeFile("/home/pyodide/" + f, buf);
      }
      py.runPython(BRIDGE);
      return py;
    })();
    if (!needSympy) return pyCore.finally(() => toast(""));
    if (!pySympy) pySympy = pyCore.then(async (py) => { await py.loadPackage(["sympy"]); return py; });
    return pySympy.finally(() => toast(""));
  }
  async function callPy(name, args, needSympy = true) {
    let py;
    try { py = await pyodide(needSympy); }
    catch (e) {
      toast("");
      return fail(503, "ENGINE_UNAVAILABLE", "Maths engine could not load",
        "The in-browser Python engine (Pyodide) could not be downloaded — check the internet connection and reload.");
    }
    const r = JSON.parse(py.globals.get("quantix_call")(name, JSON.stringify(args)));
    if (r.ok) return ok(r.data, r.message);
    return fail(r.status, r.code, r.title, r.content, r.message, r.details);
  }

  // ------------------------------------------------------------------ calculator: library formula -> text, variables, unit
  async function calcTarget(b) {
    const L = b.lang === "hi" ? "hi" : "en";
    if (b.category && b.section != null && b.index != null) {
      const en = (await getJSON(dataFile("formulas", new URLSearchParams("full=true&lang=en")))).data;
      const loc = (await getJSON(dataFile("formulas", new URLSearchParams(`full=true&lang=${L}`)))).data;
      const cat = en.find((c) => c.id === b.category), sec = cat && cat.sections.find((s) => s.id === b.section);
      const item = sec && sec.items[b.index];
      if (!item) return { error: fail(404, "FORMULA_NOT_FOUND", "Formula not found", `No formula #${b.index} in ${b.category}/${b.section}.`) };
      const locSec = (loc.find((c) => c.id === b.category) || { sections: [] }).sections.find((s) => s.id === b.section) || {};
      return { text: item[1], category: b.category, section_vars: locSec.variables || null, note: item[2] || "" };
    }
    if (b.formula && String(b.formula).trim()) return { text: b.formula, category: b.category || null, section_vars: null, note: "" };
    return { error: fail(400, "FORMULA_REQUIRED", "Formula required", "Send either 'formula' or 'category' + 'section' + 'index'.") };
  }
  async function unitOf(note) {
    if (!note) return null;
    const r = await (await callPy("item_unit", { note })).json();
    return r.success ? r.data : null;
  }

  // ------------------------------------------------------------------ contact form -> Web3Forms
  const TOPICS = { general: "General question", bug: "Bug report", feature: "Feature idea", data: "Wrong formula / data", other: "Other" };
  async function contact(b) {
    const s = await site();
    if (b.website) return fail(400, "CONTACT_REJECTED", "Message rejected", "Spam check failed.");
    const fields = {};
    if (String(b.name || "").trim().length < 2) fields.name = "name_short";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(b.email || "").trim())) fields.email = "email_invalid";
    if (b.phone && !/^\+?[\d\s()-]{6,20}$/.test(b.phone)) fields.phone = "phone_invalid";
    if (String(b.message || "").trim().length < 10) fields.message = "message_short";
    if (b.topic && !TOPICS[b.topic]) fields.topic = "topic_invalid";
    if (((b.message || "").match(/https?:\/\//g) || []).length > 3) fields.message = "too_many_links";
    if (Object.keys(fields).length) return fail(400, "CONTACT_INVALID", "Please check the form", "Some fields are not valid.", null, { fields });
    if (!s.form_key) {
      return fail(503, "CONTACT_OFFLINE", "Contact form not connected yet",
        `Please email ${s.contact_email || "the site owner"} directly.`, `Please email ${s.contact_email || "us"} directly.`);
    }
    const d = new Date(), ticket = `AVL-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const topic = TOPICS[b.topic] || TOPICS.general;
    try {
      const r = await realFetch("https://api.web3forms.com/submit", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ access_key: s.form_key, subject: `[Quantix] ${ticket} · ${topic} · ${String(b.name).slice(0, 60)}`,
          from_name: "Quantix", replyto: b.email, name: b.name, email: b.email, phone: b.phone || "", topic,
          subject_line: b.subject || "", message: b.message, page: b.page || location.pathname, ticket, language: b.lang || "en" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.success) throw new Error(j.message || r.status);
    } catch (e) {
      return fail(502, "CONTACT_SEND_FAILED", "Message could not be sent",
        `The form service did not accept the message (${e.message}). Please email ${s.contact_email || "us"} directly.`);
    }
    return ok({ ticket }, `Message received — ticket ${ticket}`, 201);
  }

  // ------------------------------------------------------------------ the fetch hook
  const FULL_ONLY = /^(predict\/|measure\/(references|shapes)|handwriting\/(recognize|relayout))/;
  async function handle(url, init) {
    const route = url.pathname.slice(PREFIX.length).replace(/\/+$/, "");
    const method = String((init && init.method) || "GET").toUpperCase();
    let body = {};
    if (method !== "GET" && init && typeof init.body === "string") { try { body = JSON.parse(init.body); } catch (_) {} }
    if (FULL_ONLY.test(route)) {
      const s = await site();
      return fail(501, "FULL_VERSION_ONLY", "Available in the full version",
        `Photo AI needs the Quantix server, so it is not part of this free online version. The full version is free to run on your own PC: ${s.github}`,
        lang() === "hi" ? "यह सुविधा पूर्ण संस्करण में उपलब्ध है (अपने कंप्यूटर पर चलाएँ — GitHub देखें)।"
                        : "Photo AI is available in the full version — run Quantix on your own PC (see GitHub).");
    }
    if (route === "chemistry/molar-mass") return callPy("molar_mass", { formula: url.searchParams.get("formula") || "" }, false);
    if (route === "handwriting/solve") return callPy("eq_solve", { text: body.text, lang: body.lang });
    if (route === "formulas/calc/describe" || route === "formulas/calc/solve") {
      const t = await calcTarget(body);
      if (t.error) return t.error;
      const unit = await unitOf(t.note);
      return route.endsWith("describe")
        ? callPy("describe", { text: t.text, category: t.category, section_vars: t.section_vars, lang: body.lang, unit })
        : callPy("solve", { text: t.text, solve_for: body.solve_for, values: body.values, equation: body.equation || 0,
                            lang: body.lang, unit, angle_unit: body.angle_unit || "deg" });
    }
    if (route === "contact" && method === "POST") return contact(body);
    if (method === "GET") {
      try { const j = await getJSON(dataFile(route, url.searchParams)); return reply(j); }
      catch (_) { /* fall through to 404 */ }
    }
    return fail(404, "ROUTE_NOT_FOUND", "Route not found", `${method} /api/v1/${route} is not part of the static site.`);
  }
  window.fetch = function (input, init) {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.origin === location.origin && url.pathname.startsWith(PREFIX)) return handle(url, init);
    return realFetch(input, init);
  };

  // ------------------------------------------------------------------ PDF links -> pre-made files
  document.addEventListener("click", async (e) => {
    const a = e.target.closest && e.target.closest('a[href*="/api/v1/formulas/pdf"]');
    if (!a) return;
    e.preventDefault();
    const u = new URL(a.href, location.href), p = u.searchParams;
    if (p.get("lang") === "en") p.delete("lang");
    const key = [...p.entries()].sort().map(([k, v]) => `${k}=${v}`).join("&");
    const idx = await getJSON("/static-api/pdf-index.json").catch(() => ({}));
    const f = idx[key];
    if (!f) { toast("PDF not found"); setTimeout(() => toast(""), 2500); return; }
    const dl = document.createElement("a");
    dl.href = f.url; dl.download = f.name; document.body.append(dl); dl.click(); dl.remove();
  }, true);

  // ------------------------------------------------------------------ "Lite" note on the photo-AI pages
  document.addEventListener("DOMContentLoaded", async () => {
    const page = location.pathname.replace(/\/$/, "/index.html");
    const notes = {
      "/measure.html": ["Manual measuring works here (draw across the coin to set the scale, then measure). Auto-find and auto-measure need the AI of the full version.",
                        "हाथ से मापना यहीं काम करता है (स्केल के लिए सिक्के पर रेखा खींचें, फिर मापें)। ऑटो-खोज और ऑटो-माप पूर्ण संस्करण के AI से होते हैं।"],
      "/handwriting.html": ["Reading handwriting from a photo needs the full version — but you can type any equation below and solve it here.",
                            "फ़ोटो से लिखावट पढ़ना पूर्ण संस्करण में है — पर नीचे कोई भी समीकरण टाइप करके यहीं हल करें।"],
      "/index.html": ["Shape recognition from photos works in the full version — everything else on this site works right here.",
                      "फ़ोटो से आकृति पहचान पूर्ण संस्करण में है — बाकी सब कुछ यहीं काम करता है।"],
    };
    const n = notes[page];
    if (!n) return;
    const s = await site().catch(() => ({}));
    const bar = document.createElement("div");
    bar.className = "lite-note";
    bar.style.cssText = "margin:12px clamp(16px,1.8vw,36px) 0;padding:10px 14px;border-radius:12px;font-size:14px;" +
      "border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--ink)";
    const txt = document.createElement("span");
    txt.textContent = "✨ Quantix Lite · " + n[lang() === "hi" ? 1 : 0] + " ";
    bar.append(txt);
    if (s.github) {
      const a = document.createElement("a");
      a.href = s.github; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = "GitHub ↗";
      a.style.cssText = "color:var(--accent);font-weight:700";
      bar.append(a);
    }
    const main = document.querySelector("main");
    if (main) main.before(bar);
  });
})();
