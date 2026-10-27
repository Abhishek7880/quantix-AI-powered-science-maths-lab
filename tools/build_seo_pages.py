"""Generate Quantix's "Learn" pages: one finished, Google-readable HTML page per topic.

    .venv\\Scripts\\python.exe tools\\build_seo_pages.py          # -> build/seo/  (then deploy as usual)

  /learn/formulas/<category>/<section>/      every formula section (110) — English, and Hindi under /hi/learn/…
  /learn/elements/<element>/                 every element (118) — English and Hindi
  /learn/convert/<unit>-to-<unit>/           common unit conversions (value tables + formula)
  /learn/…/ index pages, and build/seo/sitemap.xml (main pages + all of the above)

The pages are plain HTML (no data loading), so search engines read every formula, value and fact. They use the
site's shared look (lab.css + site.js: menu, footer, theme) and link back into the interactive tools — the 🧮 calculator
for each formula, the periodic table and the converter. On the server Caddy serves them as files (no Python work).
"""

from __future__ import annotations

import html
import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src import chemistry, formula_calc, formulas  # noqa: E402
from src.config import load_config  # noqa: E402

OUT = ROOT / "build" / "seo"
SITE = (load_config().site.public_url or "https://quantix-ai-abhi.duckdns.org").rstrip("/")
OG_IMAGE = f"{SITE}/web/og-image.png"
MAIN_PAGES = ["/", "/formulas", "/elements", "/physics", "/circuit", "/plc", "/handwriting", "/measure", "/converter", "/graph", "/contact"]
UNITS_PER_QUANTITY = 99         # conversion pages between every pair of units within a quantity
e = lambda s: html.escape(str(s), quote=True)

T = {   # page text, English / Hindi
    "en": {"home": "Home", "learn": "Learn", "formulas": "Formulas", "elements": "Elements", "convert": "Unit conversions",
           "formula": "Formula", "name": "Name", "note": "Note", "solve": "🧮 Solve step by step", "variables": "What the letters mean",
           "related": "Related", "other_lang": "हिन्दी में पढ़ें", "open_lib": "Open in the interactive Formula Library",
           "sec_title": "{s} Formulas — {c}", "sec_h1": "{s} formulas",
           "sec_desc": "All {n} {s} formulas ({c}){ex} — with what each letter means and a free step-by-step calculator.",
           "sec_intro": "{n} formulas for {s}, from the {c} section of the Quantix formula library. Tap 🧮 next to a formula to "
                        "solve it for any variable with step-by-step working.",
           "el_title": "{n} ({s}) — Element {z}: Properties, Uses & Facts",
           "el_desc": "{n} ({s}), atomic number {z}: atomic mass {m}, electron configuration {c}, {cat}. Properties, uses and discovery.",
           "facts": "Key facts", "uses": "Uses", "discovery": "Discovery", "z": "Atomic number", "mass": "Atomic mass",
           "cat": "Category", "pos": "Group / period / block", "config": "Electron configuration", "shells": "Electrons per shell",
           "en": "Electronegativity (Pauling)", "radius": "Atomic radius", "density": "Density", "mp": "Melting point",
           "bp": "Boiling point", "ie": "First ionisation energy", "oxi": "Common oxidation states", "crust": "Abundance in Earth's crust",
           "ancient": "Known since ancient times", "prev": "Previous", "next": "Next", "periodic": "Open the interactive periodic table",
           "molar": "Molar mass", "learn_title": "Learn — Formulas, Elements & Unit Conversions",
           "learn_desc": "Free reference pages: 1,022 maths & physics formulas, all 118 elements and common unit conversions, with calculators.",
           "formulas_title": "Maths & Physics Formulas — Complete List", "elements_title": "All 118 Chemical Elements — Properties & Uses",
           "convert_title": "Unit Conversions — Length, Area, Mass, Volume & More",
           "formulas_desc": "All {n} maths and physics formulas by topic — algebra, trigonometry, mensuration, calculus, physics — with calculators.",
           "elements_desc": "Every chemical element from hydrogen to oganesson: atomic number, mass, configuration, properties and uses.",
           "convert_desc": "Common unit conversions with formulas and value tables: length, area, volume, mass, speed, energy and more.",
           "categories": {"nonmetal": "Non-metal", "noble-gas": "Noble gas", "alkali-metal": "Alkali metal",
                          "alkaline-earth-metal": "Alkaline earth metal", "metalloid": "Metalloid", "halogen": "Halogen",
                          "post-transition-metal": "Post-transition metal", "transition-metal": "Transition metal",
                          "lanthanide": "Lanthanide", "actinide": "Actinide", "unknown": "Unknown"}},
    "hi": {"home": "होम", "learn": "सीखें", "formulas": "सूत्र", "elements": "तत्व", "convert": "मात्रक रूपांतरण",
           "formula": "सूत्र", "name": "नाम", "note": "टिप्पणी", "solve": "🧮 चरण-दर-चरण हल करें", "variables": "अक्षरों का अर्थ",
           "related": "संबंधित", "other_lang": "Read in English", "open_lib": "इंटरैक्टिव सूत्र संग्रह में खोलें",
           "sec_title": "{s} के सूत्र — {c}", "sec_h1": "{s} के सूत्र",
           "sec_desc": "{s} के सभी {n} सूत्र ({c}){ex} — हर अक्षर का अर्थ और मुफ़्त चरण-दर-चरण कैलकुलेटर के साथ।",
           "sec_intro": "{s} के {n} सूत्र, Quantix सूत्र संग्रह के {c} भाग से। किसी भी चर का मान चरण-दर-चरण निकालने के लिए सूत्र के "
                        "पास 🧮 दबाएँ।",
           "el_title": "{n} ({s}) — तत्व {z}: गुण, उपयोग और तथ्य",
           "el_desc": "{n} ({s}), परमाणु क्रमांक {z}: परमाणु द्रव्यमान {m}, इलेक्ट्रॉन विन्यास {c}। गुण, उपयोग और खोज।",
           "facts": "मुख्य तथ्य", "uses": "उपयोग", "discovery": "खोज", "z": "परमाणु क्रमांक", "mass": "परमाणु द्रव्यमान",
           "cat": "श्रेणी", "pos": "समूह / आवर्त / ब्लॉक", "config": "इलेक्ट्रॉन विन्यास", "shells": "प्रति कोश इलेक्ट्रॉन",
           "en": "विद्युत-ऋणात्मकता (पॉलिंग)", "radius": "परमाणु त्रिज्या", "density": "घनत्व", "mp": "गलनांक", "bp": "क्वथनांक",
           "ie": "प्रथम आयनन ऊर्जा", "oxi": "सामान्य ऑक्सीकरण अवस्थाएँ", "crust": "पृथ्वी की पपड़ी में मात्रा",
           "ancient": "प्राचीन काल से ज्ञात", "prev": "पिछला", "next": "अगला", "periodic": "इंटरैक्टिव आवर्त सारणी खोलें",
           "molar": "मोलर द्रव्यमान", "learn_title": "सीखें — सूत्र, तत्व और मात्रक रूपांतरण",
           "learn_desc": "मुफ़्त संदर्भ पृष्ठ: 1,022 गणित व भौतिकी सूत्र और सभी 118 तत्व, कैलकुलेटर के साथ।",
           "formulas_title": "गणित और भौतिकी के सूत्र — पूरी सूची", "elements_title": "सभी 118 रासायनिक तत्व — गुण और उपयोग",
           "convert_title": "मात्रक रूपांतरण",
           "formulas_desc": "विषय के अनुसार सभी {n} गणित व भौतिकी सूत्र — बीजगणित, त्रिकोणमिति, क्षेत्रमिति, कलन, भौतिकी — कैलकुलेटर के साथ।",
           "elements_desc": "हाइड्रोजन से ओगानेसन तक हर रासायनिक तत्व: परमाणु क्रमांक, द्रव्यमान, विन्यास, गुण और उपयोग।",
           "convert_desc": "",
           "categories": {"nonmetal": "अधातु", "noble-gas": "उत्कृष्ट गैस", "alkali-metal": "क्षार धातु",
                          "alkaline-earth-metal": "क्षारीय मृदा धातु", "metalloid": "उपधातु", "halogen": "हैलोजन",
                          "post-transition-metal": "संक्रमणोत्तर धातु", "transition-metal": "संक्रमण धातु",
                          "lanthanide": "लैंथेनाइड", "actinide": "ऐक्टिनाइड", "unknown": "अज्ञात"}},
}

# page styles: src/web/learn.css (shared by every Learn page, cached by browsers)

LOGO = ('<svg class="logo" viewBox="-50 -50 100 100" aria-hidden="true"><defs><radialGradient id="lgCore"><stop offset="0" '
        'stop-color="#fff"/><stop offset=".45" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)" '
        'stop-opacity="0"/></radialGradient></defs><g class="lg-orbits" fill="none" stroke-width="3"><ellipse rx="44" ry="15" '
        'stroke="var(--accent)"/><ellipse rx="44" ry="15" stroke="var(--accent-2)" transform="rotate(60)"/><ellipse rx="44" '
        'ry="15" stroke="var(--accent)" transform="rotate(120)" opacity=".75"/></g><circle r="12" fill="url(#lgCore)" '
        'class="lg-core"/></svg>')


def slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower().replace("&", " and ").replace("²", "2").replace("³", "3")).strip("-")
    return s or "item"


def page(lang: str, path: str, title: str, desc: str, body: str, crumbs: list[tuple[str, str]], alt: str | None = None) -> str:
    """One complete page in the site's look. `crumbs` = [(label, path)…] ending with this page."""
    L = T[lang]
    url = SITE + path
    alts = ""
    if alt:
        en_p, hi_p = (path, alt) if lang == "en" else (alt, path)
        alts = (f'<link rel="alternate" hreflang="en" href="{SITE}{en_p}">\n<link rel="alternate" hreflang="hi" href="{SITE}{hi_p}">\n'
                f'<link rel="alternate" hreflang="x-default" href="{SITE}{en_p}">\n')
    ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": SITE + p} for i, (n, p) in enumerate(crumbs)]}
    crumb_html = " › ".join(f'<a href="{e(p)}">{e(n)}</a>' if i < len(crumbs) - 1 else e(n) for i, (n, p) in enumerate(crumbs))
    alt_link = f'<a class="lang-alt" href="{e(alt)}" hreflang="{"hi" if lang == "en" else "en"}">{e(L["other_lang"])}</a>' if alt else ""
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)} | Quantix</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
{alts}<meta property="og:type" content="article">
<meta property="og:site_name" content="Quantix">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{OG_IMAGE}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/web/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/web/apple-touch-icon.png">
<meta name="theme-color" content="#050a16">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@500;600;700&display=swap">
<link rel="stylesheet" href="/web/learn.css">
<link rel="stylesheet" href="/web/lab.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<header>
  <a class="brand" href="/" aria-label="Quantix — home">{LOGO}<span><span class="bt">Quant<span class="grad">ix</span></span><span class="kicker">{e(L["learn"])}</span></span></a>
  <nav aria-label="Pages"></nav>
  <span class="spacer"></span>
  <button class="btn small" id="themeBtn" type="button" aria-label="Toggle dark mode">◐</button>
</header>
<main>
<article class="learn">
<p class="crumbs">{alt_link}{crumb_html}</p>
{body}
</article>
</main>
<script src="/web/site.js"></script>
</body>
</html>
"""


def write(path: str, text: str) -> None:
    f = OUT / path.strip("/") / "index.html"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(text, encoding="utf-8")


def fmt(x: float) -> str:
    if x == 0:
        return "0"
    a = abs(x)
    if 1e-4 <= a < 1e9:
        s = f"{x:.6g}"
        if "e" not in s:
            return f"{float(s):,.10f}".rstrip("0").rstrip(".") if "." in s else f"{int(float(s)):,}"
    m, ex = f"{x:.5e}".split("e")
    return f"{float(m):g} × 10{''.join('⁰¹²³⁴⁵⁶⁷⁸⁹'[int(d)] if d.isdigit() else '⁻' for d in str(int(ex)))}"


# ------------------------------------------------------------------ formulas
def section_paths(lib_en: list[dict]) -> dict:
    """(category id, section id) -> /learn/formulas/<cat>/<section-slug>/"""
    seen, out = set(), {}
    for cat in lib_en:
        for sec in cat["sections"]:
            s = slug(sec["title"])
            while (cat["id"], s) in seen:
                s += "-2"
            seen.add((cat["id"], s))
            out[(cat["id"], sec["id"])] = f"/learn/formulas/{cat['id']}/{s}/"
    return out


def formula_paths(lib_en: list[dict], sec_path: dict, calc: dict) -> dict:
    """(category, section, item index) -> /learn/formulas/<cat>/<section>/<formula-slug>/ for every calculable formula."""
    out = {}
    for cat in lib_en:
        for sec in cat["sections"]:
            used = set()
            for i in calc.get(cat["id"], {}).get(sec["id"], []):
                s = slug(sec["items"][i][0])
                while s in used:
                    s += "-2"
                used.add(s)
                out[(cat["id"], sec["id"], i)] = sec_path[(cat["id"], sec["id"])] + s + "/"
    return out


SHAPE_CATS = {"mensuration", "geometry"}
NICE = [7, 5, 10, 4, 3, 8, 6, 2, 12, 9, 11]           # example values tried for the known variables
FT = {   # per-formula page text
    "en": {"title": "{t} Formula — Calculator & Solved Example", "h1": "{t}",
           "desc": "{t}: {f}. What each letter means, a solved example ({ex}) and a free step-by-step calculator.",
           "formula": "Formula", "means": "Where", "example": "Solved example", "given": "Given",
           "find": "Find", "steps": "Step-by-step", "answer": "Answer", "calc": "Calculator", "solve_for": "Solve for",
           "go": "Calculate", "howto": "How to calculate {t}", "faq": "Frequently asked questions",
           "q_formula": "What is the formula for {t}?", "q_example": "What is {t} when {given}?",
           "a_formula": "The formula is {f}, where {w}.", "a_example": "{target} = {ans}. Substitute the values into {f} and simplify.",
           "how1": "Write down the formula: {f}.", "how2": "Note the known values ({vars}).",
           "how3": "Substitute them and simplify to find {target}.", "how4": "Use the calculator above to solve for any letter.",
           "topic": "All {s} formulas", "units": "Use the same units for all lengths (e.g. all in cm); areas come out in cm², volumes in cm³.",
           "fill": "Fill in the known values.", "err": "Could not solve — check the values."},
    "hi": {"title": "{t} — सूत्र, कैलकुलेटर और हल किया गया उदाहरण", "h1": "{t}",
           "desc": "{t}: {f}। हर अक्षर का अर्थ, हल किया गया उदाहरण ({ex}) और मुफ़्त चरण-दर-चरण कैलकुलेटर।",
           "formula": "सूत्र", "means": "जहाँ", "example": "हल किया गया उदाहरण", "given": "दिया है",
           "find": "ज्ञात करें", "steps": "चरण-दर-चरण", "answer": "उत्तर", "calc": "कैलकुलेटर", "solve_for": "किसका मान निकालें",
           "go": "गणना करें", "howto": "{t} कैसे निकालें", "faq": "अक्सर पूछे जाने वाले प्रश्न",
           "q_formula": "{t} का सूत्र क्या है?", "q_example": "जब {given} हो तो {t} क्या होगा?",
           "a_formula": "सूत्र {f} है, जहाँ {w}।", "a_example": "{target} = {ans}। मानों को {f} में रखकर सरल करें।",
           "how1": "सूत्र लिखें: {f}।", "how2": "ज्ञात मान लिखें ({vars})।", "how3": "मान रखकर सरल करें और {target} ज्ञात करें।",
           "how4": "किसी भी अक्षर का मान निकालने के लिए ऊपर दिए कैलकुलेटर का उपयोग करें।",
           "topic": "{s} के सभी सूत्र", "units": "सभी लंबाइयाँ एक ही मात्रक में लें (जैसे cm); क्षेत्रफल cm² और आयतन cm³ में आएगा।",
           "fill": "ज्ञात मान भरें।", "err": "हल नहीं हो सका — मान जाँचें।"},
}


def formula_title(lang: str, cat_id: str, item: str, section: str) -> str:
    """'Volume of a Sphere' / 'गोले का आयतन'; formulas outside geometry keep their own name."""
    if cat_id not in SHAPE_CATS:
        return item if lang == "hi" or section.lower() in item.lower() or len(item.split()) > 1 else f"{item} ({section})"
    if lang == "en":
        art = "an" if section[:1].lower() in "aeiou" else "a"
        return f"{item} of {art} {section}"
    obl = section[:-1] + "े" if section.endswith("ा") else section          # गोला -> गोले (का)
    return f"{obl} {'की' if item.endswith(('ि', 'ी', 'ई')) else 'का'} {item}"


def worked_example(text: str, cat_id: str, sec_vars, lang: str, unit):
    """Pick friendly values for every letter except the left-hand side and solve with the real calculator."""
    d = formula_calc.describe(text, category=cat_id, section_vars=sec_vars, lang=lang)
    eq = d["equations"][0]
    variables = eq["variables"]
    target = eq.get("lhs") or variables[0]["symbol"]
    known = [v for v in variables if v["symbol"] != target]
    for shift in range(4):
        vals = {}
        for k, v in enumerate(known):
            vals[v["symbol"]] = (30, 45, 60, 37)[(k + shift) % 4] if v.get("angle") else NICE[(k + shift) % len(NICE)]
        try:
            r = formula_calc.solve(text, target, vals, lang=lang, unit=unit, angle_unit="deg")
        except Exception:                                                   # noqa: BLE001 — try other values
            continue
        sol = [s for s in r["solutions"] if isinstance(s.get("value"), (int, float)) and math.isfinite(s["value"])]
        if sol:
            return {"variables": variables, "target": target, "values": vals, "solve": r, "answer": sol[0]}
    return {"variables": variables, "target": target, "values": None, "solve": None, "answer": None}


EXAMPLE_CACHE = ROOT / "build" / "formula-examples.json"
EXAMPLE_TIMEOUT_S = 20


def _example_worker(args):
    """Runs in a child process: no thread pool (a stuck SymPy solve then only stalls this process, which is killed)."""
    formula_calc.IN_BROWSER = True
    return worked_example(*args)


def solve_examples(tasks: dict) -> dict:
    """{key: (text, cat, sec_vars, lang, unit)} -> {key: example}. Cached in build/formula-examples.json; uncached ones
    run in parallel processes with a hard per-formula time limit (a formula that takes longer gets no worked example)."""
    import multiprocessing as mp
    cache = json.loads(EXAMPLE_CACHE.read_text(encoding="utf-8")) if EXAMPLE_CACHE.is_file() else {}
    todo = [k for k in tasks if k not in cache]
    if todo:
        print(f"  solving {len(todo)} worked examples ({len(tasks) - len(todo)} cached)…", flush=True)
        pool, done = mp.Pool(max(1, (os.cpu_count() or 2) - 1)), 0
        jobs = {k: pool.apply_async(_example_worker, (tasks[k],)) for k in todo}
        for k, job in jobs.items():
            try:
                cache[k] = job.get(timeout=EXAMPLE_TIMEOUT_S)
            except mp.TimeoutError:                                   # stuck: restart the pool, resubmit the rest
                cache[k] = None
                pool.terminate()
                pool = mp.Pool(max(1, (os.cpu_count() or 2) - 1))
                for k2 in todo:
                    if k2 not in cache and k2 != k:
                        jobs[k2] = pool.apply_async(_example_worker, (tasks[k2],))
            except Exception:                                         # noqa: BLE001 — this formula gets no example
                cache[k] = None
            done += 1
            if done % 50 == 0:
                print(f"  … {done}/{len(todo)}", flush=True)
                EXAMPLE_CACHE.parent.mkdir(parents=True, exist_ok=True)
                EXAMPLE_CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        pool.terminate()
        EXAMPLE_CACHE.parent.mkdir(parents=True, exist_ok=True)
        EXAMPLE_CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return {k: cache.get(k) or None for k in tasks}


def build_formula_pages() -> list[str]:
    urls = []
    lib = {"en": formulas.load_library("en"), "hi": formulas.load_library("hi")}
    calc = formula_calc.calculable_index()
    sec_path = section_paths(lib["en"])
    fpath = formula_paths(lib["en"], sec_path, calc)
    tasks = {}
    for lang in ("en", "hi"):
        for ci, cat in enumerate(lib[lang]):
            cat_en = lib["en"][ci]
            for si, sec in enumerate(cat["sections"]):
                sec_en = cat_en["sections"][si]
                for i in calc.get(cat_en["id"], {}).get(sec_en["id"], []):
                    it = sec_en["items"][i]
                    unit = formula_calc.item_unit(it[2] if len(it) > 2 else "")
                    key = f"{lang}|{cat_en['id']}|{sec_en['id']}|{i}|{it[1]}"
                    tasks[key] = (it[1], cat_en["id"], sec.get("variables"), lang, unit)
    examples = solve_examples(tasks)
    for lang in ("en", "hi"):
        L, F = T[lang], FT[lang]
        pre = "" if lang == "en" else "/hi"
        for ci, cat in enumerate(lib[lang]):
            cat_en = lib["en"][ci]
            for si, sec in enumerate(cat["sections"]):
                sec_en = cat_en["sections"][si]
                for i in calc.get(cat_en["id"], {}).get(sec_en["id"], []):
                    item, item_en = sec["items"][i], sec_en["items"][i]
                    path = pre + fpath[(cat_en["id"], sec_en["id"], i)]
                    alt = ("/hi" if lang == "en" else "") + fpath[(cat_en["id"], sec_en["id"], i)]
                    unit = formula_calc.item_unit(item_en[2] if len(item_en) > 2 else "")
                    ex = examples[f"{lang}|{cat_en['id']}|{sec_en['id']}|{i}|{item_en[1]}"]
                    if not ex:                                            # no example: still describe the letters
                        try:
                            d = formula_calc.describe(item_en[1], category=cat_en["id"], section_vars=sec.get("variables"), lang=lang)
                            eq0 = d["equations"][0]
                            ex = {"variables": eq0["variables"], "target": eq0.get("lhs") or eq0["variables"][0]["symbol"],
                                  "values": None, "solve": None, "answer": None}
                        except Exception:                                 # noqa: BLE001
                            continue
                    name = formula_title(lang, cat_en["id"], item[0], sec["title"])
                    labels = {v["symbol"]: (v.get("label") or "") for v in ex["variables"]}
                    labels[ex["target"]] = labels.get(ex["target"]) or item[0]
                    where = ", ".join(f"{v['display']} = {labels[v['symbol']] or v['display']}" for v in ex["variables"])
                    body = [f'<h1>{e(F["h1"].format(t=name))}</h1>',
                            f'<div class="card"><p class="big f" style="font-family:Cambria Math,Cambria,Georgia,serif">{e(item[1])}</p>'
                            f'<p class="lead">{e(F["means"])}: {e(where)}</p>'
                            + (f'<p class="lead">{e(F["units"])}</p>' if cat_en["id"] in SHAPE_CATS else "") + "</div>"]
                    given_txt = ""
                    if ex["answer"]:
                        given_txt = ", ".join(f"{k} = {fmt(v)}{'°' if any(x['symbol'] == k and x.get('angle') for x in ex['variables']) else ''}"
                                              for k, v in ex["values"].items())
                        steps = "".join(f"<li><b>{e(s['label'])}:</b> <span class=\"f\">{e(s['text'])}</span></li>" for s in ex["solve"]["steps"])
                        body.append(f'<h2>{e(F["example"])}</h2><div class="card"><p><b>{e(F["given"])}:</b> {e(given_txt)}<br>'
                                    f'<b>{e(F["find"])}:</b> {e(ex["target"])} ({e(labels[ex["target"]])})</p>'
                                    f'<ol class="steps">{steps}</ol>'
                                    f'<p class="big">{e(F["answer"])}: {e(ex["target"])} = {e(ex["answer"]["display"])}'
                                    f'{(" " + e(unit)) if unit else ""}</p></div>')
                    calc_vars = [{"s": v["symbol"], "d": v["display"], "l": labels[v["symbol"]], "a": bool(v.get("angle"))} for v in ex["variables"]]
                    body.append(f'<h2>{e(F["calc"])}</h2><div class="card qcalc" data-cat="{e(cat_en["id"])}" data-sec="{e(sec_en["id"])}" '
                                f'data-idx="{i}" data-lang="{lang}" data-target="{e(ex["target"])}" '
                                f'data-vars="{e(json.dumps(calc_vars, ensure_ascii=False))}" '
                                f'data-t="{e(json.dumps({k: F[k] for k in ("solve_for", "go", "fill", "err", "answer")}, ensure_ascii=False))}">'
                                f'<noscript>{e(F["fill"])}</noscript></div>')
                    var_list = ", ".join(v["display"] for v in ex["variables"] if v["symbol"] != ex["target"])
                    how = [F["how1"].format(f=item[1]), F["how2"].format(vars=var_list), F["how3"].format(target=ex["target"]), F["how4"]]
                    body.append(f'<h2>{e(F["howto"].format(t=name))}</h2><ol class="steps">' + "".join(f"<li>{e(h)}</li>" for h in how) + "</ol>")
                    faq = [(F["q_formula"].format(t=name), F["a_formula"].format(f=item[1], w=where))]
                    if ex["answer"]:
                        faq.append((F["q_example"].format(t=name, given=given_txt),
                                    F["a_example"].format(target=ex["target"], ans=ex["answer"]["display"] + (f" {unit}" if unit else ""), f=item[1])))
                    body.append(f'<h2>{e(F["faq"])}</h2>' + "".join(f'<div class="card"><h3>{e(q)}</h3><p>{e(a)}</p></div>' for q, a in faq))
                    sibs = [f'<a href="{pre}{fpath[(cat_en["id"], sec_en["id"], j)]}">{e(sec["items"][j][0])}</a>'
                            for j in calc.get(cat_en["id"], {}).get(sec_en["id"], []) if j != i]
                    topic_name = (sec["title"][:-1] + "े") if lang == "hi" and sec["title"].endswith("ा") else sec["title"]   # गोला -> गोले के
                    body.append(f'<h2>{e(F["topic"].format(s=topic_name))}</h2><div class="links">'
                                f'<a href="{pre}{sec_path[(cat_en["id"], sec_en["id"])]}">{e(sec["title"])} →</a>{"".join(sibs)}</div>')
                    faq_ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
                        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}
                    body.append(f'<script type="application/ld+json">{json.dumps(faq_ld, ensure_ascii=False)}</script>')
                    body.append('<script src="/web/learn.js" defer></script>')
                    ex_short = f"{given_txt} → {ex['target']} = {ex['answer']['display']}" if ex["answer"] else item[1]
                    crumbs = [(L["home"], "/"), (L["formulas"], f"{pre}/learn/formulas/"), (sec["title"], pre + sec_path[(cat_en["id"], sec_en["id"])]),
                              (item[0], path)]
                    write(path, page(lang, path, F["title"].format(t=name), F["desc"].format(t=name, f=item[1], ex=ex_short)[:300],
                                     "\n".join(body), crumbs, alt))
                    urls.append(path)
    return urls


def build_formulas() -> list[str]:
    urls = []
    lib = {"en": formulas.load_library("en"), "hi": formulas.load_library("hi")}
    calc = formula_calc.calculable_index()
    sec_path = section_paths(lib["en"])
    fpath = formula_paths(lib["en"], sec_path, calc)
    for lang in ("en", "hi"):
        L = T[lang]
        pre = "" if lang == "en" else "/hi"
        hub = []
        for ci, cat in enumerate(lib[lang]):
            cat_en = lib["en"][ci]
            hub.append(f'<h2>{e(cat["title"])}</h2><div class="grid">')
            for si, sec in enumerate(cat["sections"]):
                sec_en = cat_en["sections"][si]
                path = pre + sec_path[(cat_en["id"], sec_en["id"])]
                alt = ("/hi" if lang == "en" else "") + sec_path[(cat_en["id"], sec_en["id"])]
                ok = set(calc.get(cat_en["id"], {}).get(sec_en["id"], []))
                rows = []
                for i, it in enumerate(sec["items"]):
                    solve = (f' <a class="solve" href="/formulas?calc={cat_en["id"]}/{sec_en["id"]}/{i}">{e(L["solve"])}</a>'
                             if i in ok else "")
                    note = f"<td>{e(it[2]) if len(it) > 2 and it[2] else ''}</td>"
                    fp = fpath.get((cat_en["id"], sec_en["id"], i))
                    name_html = f'<a href="{pre}{fp}">{e(it[0])}</a>' if fp else e(it[0])     # -> the formula's own page
                    rows.append(f"<tr><td>{name_html}</td><td class=\"f\">{e(it[1])}{solve}</td>{note}</tr>")
                names = [it[0] for it in sec["items"][:3]]
                ex = (": " + ", ".join(names) + ("…" if len(sec["items"]) > 3 else "")) if names else ""
                title = L["sec_title"].format(s=sec["title"], c=cat["title"])
                desc = L["sec_desc"].format(n=len(sec["items"]), s=sec["title"], c=cat["title"], ex=ex)[:300]
                body = [f'<h1>{e(L["sec_h1"].format(s=sec["title"]))}</h1>',
                        f'<p class="lead">{e(L["sec_intro"].format(n=len(sec["items"]), s=sec["title"], c=cat["title"]))}</p>']
                if sec.get("sketch"):
                    body.append(f'<div class="card"><img class="sketch" src="/api/v1/formulas/sketch/{e(sec["sketch"])}.svg" '
                                f'alt="{e(sec["title"])}" width="300" height="220" loading="lazy"></div>')
                body.append(f'<div class="card"><table><thead><tr><th>{e(L["name"])}</th><th>{e(L["formula"])}</th>'
                            f'<th>{e(L["note"])}</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>')
                if sec.get("variables"):
                    vs = "".join(f"<tr><td class=\"f\">{e(k)}</td><td>{e(v)}</td></tr>" for k, v in sec["variables"].items())
                    body.append(f'<h2>{e(L["variables"])}</h2><div class="card"><table><tbody>{vs}</tbody></table></div>')
                if sec.get("note"):
                    body.append(f'<p class="lead">{e(sec["note"])}</p>')
                body.append(f'<p><a class="cta" href="/formulas">{e(L["open_lib"])}</a></p>')
                others = [f'<a href="{pre}{sec_path[(cat_en["id"], s2["id"])]}">{e(cat["sections"][j]["title"])}</a>'
                          for j, s2 in enumerate(cat_en["sections"]) if j != si]
                if others:
                    body.append(f'<h2>{e(L["related"])}: {e(cat["title"])}</h2><div class="links">{"".join(others)}</div>')
                crumbs = [(L["home"], "/"), (L["formulas"], f"{pre}/learn/formulas/"), (cat["title"], f"{pre}/learn/formulas/#{cat_en['id']}"),
                          (sec["title"], path)]
                write(path, page(lang, path, title, desc, "\n".join(body), crumbs, alt))
                urls.append(path)
                hub.append(f'<a href="{path}">{e(sec["title"])}<small>{len(sec["items"])} {e(L["formulas"].lower())}</small></a>')
            hub.append("</div>")
            hub[-len(cat["sections"]) - 2] = hub[-len(cat["sections"]) - 2].replace("<h2>", f'<h2 id="{cat_en["id"]}">', 1)
        n = sum(len(s["items"]) for c in lib[lang] for s in c["sections"])
        hub_path = f"{pre}/learn/formulas/"
        write(hub_path, page(lang, hub_path, L["formulas_title"], L["formulas_desc"].format(n=f"{n:,}"),
                             f'<h1>{e(L["formulas_title"])}</h1><p class="lead">{e(L["formulas_desc"].format(n=f"{n:,}"))}</p>' + "".join(hub),
                             [(L["home"], "/"), (L["formulas"], hub_path)], ("/hi" if lang == "en" else "") + "/learn/formulas/"))
        urls.append(hub_path)
    return urls


# ------------------------------------------------------------------ elements
def build_elements() -> list[str]:
    urls = []
    els = chemistry.elements()
    path_of = {el["z"]: f"/learn/elements/{slug(el['name'])}/" for el in els}
    for lang in ("en", "hi"):
        L = T[lang]
        pre = "" if lang == "en" else "/hi"
        cards = []
        for i, el in enumerate(els):
            name = el["name_hi"] if lang == "hi" and el.get("name_hi") else el["name"]
            cat = L["categories"].get(el.get("cat"), el.get("cat") or "")
            path = pre + path_of[el["z"]]
            rows = [(L["z"], el["z"]), (L["mass"], f'{el["mass"]} u'), (L["molar"], f'{el["mass"]} g/mol'), (L["cat"], cat),
                    (L["pos"], f'{el.get("group") or "—"} / {el.get("period")} / {el.get("block")}'),
                    (L["config"], el.get("config")), (L["shells"], ", ".join(map(str, el.get("shells") or [])))]
            opt = [("en", L["en"], ""), ("radius", L["radius"], " pm"), ("density", L["density"], " g/cm³"),
                   ("ie1", L["ie"], " eV")]
            rows += [(lab, f"{el[k]}{unit}") for k, lab, unit in opt if el.get(k) is not None]
            for k in ("mp", "bp"):
                if el.get(k) is not None:
                    rows.append((L[k], f'{el[k]} K ({el[k] - 273.15:.2f} °C)'))
            if el.get("oxi_main"):
                rows.append((L["oxi"], ", ".join(f"{o:+d}" for o in el["oxi_main"])))
            if el.get("crust_ppm"):
                rows.append((L["crust"], f'{el["crust_ppm"]:g} ppm'))
            table = "".join(f"<tr><th scope=\"row\">{e(a)}</th><td>{e(b)}</td></tr>" for a, b in rows if b not in (None, ""))
            uses = el.get("uses_hi") if lang == "hi" and el.get("uses_hi") else el.get("uses")
            disc = L["ancient"] if el.get("ancient") else ", ".join(x for x in (str(el.get("year") or ""), el.get("discoverers") or "") if x)
            body = [f'<h1>{e(name)} ({e(el["sym"])})</h1>',
                    f'<p class="big">{e(L["z"])} {el["z"]} · {e(cat)}</p>',
                    f'<div class="card"><table><tbody>{table}</tbody></table></div>']
            if uses:
                body.append(f'<h2>{e(L["uses"])}</h2><p class="lead">{e(uses)}</p>')
            if disc:
                body.append(f'<h2>{e(L["discovery"])}</h2><p class="lead">{e(disc)}</p>')
            body.append(f'<p><a class="cta" href="/elements">{e(L["periodic"])}</a></p>')
            nav = []
            if i > 0:
                p_ = els[i - 1]
                nav.append(f'<a href="{pre}{path_of[p_["z"]]}">← {e(L["prev"])}: {e(p_["name_hi"] if lang == "hi" and p_.get("name_hi") else p_["name"])}</a>')
            if i < len(els) - 1:
                n_ = els[i + 1]
                nav.append(f'<a href="{pre}{path_of[n_["z"]]}">{e(L["next"])}: {e(n_["name_hi"] if lang == "hi" and n_.get("name_hi") else n_["name"])} →</a>')
            body.append(f'<div class="links">{"".join(nav)}</div>')
            title = L["el_title"].format(n=name, s=el["sym"], z=el["z"])
            desc = L["el_desc"].format(n=name, s=el["sym"], z=el["z"], m=el["mass"], c=el.get("config"), cat=cat)
            crumbs = [(L["home"], "/"), (L["elements"], f"{pre}/learn/elements/"), (name, path)]
            write(path, page(lang, path, title, desc, "\n".join(body), crumbs, ("/hi" if lang == "en" else "") + path_of[el["z"]]))
            urls.append(path)
            cards.append(f'<a href="{path}"><b>{e(el["sym"])}</b> {e(name)}<small>{el["z"]} · {e(cat)}</small></a>')
        hub_path = f"{pre}/learn/elements/"
        write(hub_path, page(lang, hub_path, L["elements_title"], L["elements_desc"],
                             f'<h1>{e(L["elements_title"])}</h1><p class="lead">{e(L["elements_desc"])}</p><div class="grid">{"".join(cards)}</div>',
                             [(L["home"], "/"), (L["elements"], hub_path)], ("/hi" if lang == "en" else "") + "/learn/elements/"))
        urls.append(hub_path)
    return urls


# ------------------------------------------------------------------ unit conversions (English)
def load_units() -> list[dict]:
    # units.js turns every row into {s, en, hi, factor, to(), from()}; linear units have a numeric factor
    js = ("global.window={};require(process.argv[1]);const out=window.UNIT_DATA.map(q=>({id:q.id,en:q.en,units:q.units"
          ".filter(u=>typeof u.factor==='number').map(u=>({s:u.s,en:u.en,f:u.factor}))}));"
          "console.log(JSON.stringify(out))")
    r = subprocess.run(["node", "-e", js, str(ROOT / "src" / "web" / "units.js")], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


TEMPS = {("C", "F"): (lambda c: c * 9 / 5 + 32, "°F = °C × 9/5 + 32"), ("F", "C"): (lambda f: (f - 32) * 5 / 9, "°C = (°F − 32) × 5/9"),
         ("C", "K"): (lambda c: c + 273.15, "K = °C + 273.15"), ("K", "C"): (lambda k: k - 273.15, "°C = K − 273.15"),
         ("F", "K"): (lambda f: (f - 32) * 5 / 9 + 273.15, "K = (°F − 32) × 5/9 + 273.15"),
         ("K", "F"): (lambda k: (k - 273.15) * 9 / 5 + 32, "°F = (K − 273.15) × 9/5 + 32")}
TNAME = {"C": ("Celsius", "°C"), "F": ("Fahrenheit", "°F"), "K": ("Kelvin", "K")}


def conv_page(path, a_name, a_sym, b_name, b_sym, qty, fn, formula_txt, related, values) -> str:
    one = fn(1)
    rows = "".join(f"<tr><td>{fmt(v)} {e(a_sym)}</td><td>{fmt(fn(v))} {e(b_sym)}</td></tr>" for v in values)
    title = f"Convert {a_name.title()} to {b_name.title()} ({a_sym} to {b_sym})"
    desc = f"{a_name} to {b_name} converter: 1 {a_sym} = {fmt(one)} {b_sym}. Formula, worked examples and a {a_sym} → {b_sym} table."
    body = (f'<h1>{e(a_name.title())} to {e(b_name.title())}</h1>'
            f'<p class="big">1 {e(a_sym)} = {fmt(one)} {e(b_sym)}</p>'
            f'<div class="card"><p><b>Formula:</b> <span class="f" style="font-family:Cambria Math,Cambria,Georgia,serif">{e(formula_txt)}</span></p>'
            f'<p><b>Example:</b> 10 {e(a_sym)} = {fmt(fn(10))} {e(b_sym)}</p></div>'
            f'<h2>{e(a_sym)} to {e(b_sym)} table</h2><div class="card"><table><thead><tr><th>{e(a_name.title())}</th>'
            f'<th>{e(b_name.title())}</th></tr></thead><tbody>{rows}</tbody></table></div>'
            f'<p><a class="cta" href="/converter">Open the {e(qty.lower())} converter</a></p>'
            f'<h2>Related {e(qty.lower())} conversions</h2><div class="links">{related}</div>')
    crumbs = [("Home", "/"), ("Unit conversions", "/learn/convert/"), (f"{a_sym} to {b_sym}", path)]
    return page("en", path, title, desc, body, crumbs)


def build_conversions() -> list[str]:
    urls, hub = [], []
    values = [1, 2, 5, 10, 20, 25, 50, 100, 250, 500, 1000]
    for q in load_units():
        if q["id"] == "temperature":
            pairs = []
            for (a, b), (fn, ftxt) in TEMPS.items():
                path = f"/learn/convert/{slug(TNAME[a][0])}-to-{slug(TNAME[b][0])}/"
                pairs.append((path, TNAME[a], TNAME[b], fn, ftxt))
            for path, (an, asym), (bn, bsym), fn, ftxt in pairs:
                rel = "".join(f'<a href="{p}">{e(x[1])} → {e(y[1])}</a>' for p, x, y, _, _ in pairs if p != path)
                write(path, conv_page(path, an, asym, bn, bsym, "Temperature", fn, ftxt, rel, [-40, -10, 0, 10, 20, 25, 30, 37, 50, 100, 200]))
                urls.append(path)
            hub.append(f'<h2 id="temperature">Temperature</h2><div class="grid">' + "".join(
                f'<a href="{p}">{e(x[0])} → {e(y[0])}<small>{e(x[1])} to {e(y[1])}</small></a>' for p, x, y, _, _ in pairs) + "</div>")
            continue
        units = q["units"][:UNITS_PER_QUANTITY]
        if len(units) < 2:
            continue
        pairs = []
        for a in units:
            for b in units:
                if a is b:
                    continue
                k = a["f"] / b["f"]
                path = f"/learn/convert/{slug(a['en'])}-to-{slug(b['en'])}/"
                pairs.append((path, a, b, k))
        for path, a, b, k in pairs:
            rel = "".join(f'<a href="{p}">{e(x["s"])} → {e(y["s"])}</a>' for p, x, y, _ in pairs if p != path and (x is a or y is a))
            write(path, conv_page(path, a["en"], a["s"], b["en"], b["s"], q["en"], lambda v, k=k: v * k,
                                  f"{b['s']} = {a['s']} × {fmt(k)}", rel, values))
            urls.append(path)
        hub.append(f'<h2 id="{q["id"]}">{e(q["en"])}</h2><div class="grid">' + "".join(
            f'<a href="{p}">{e(a["en"])} → {e(b["en"])}<small>{e(a["s"])} to {e(b["s"])}</small></a>' for p, a, b, _ in pairs) + "</div>")
    L = T["en"]
    write("/learn/convert/", page("en", "/learn/convert/", L["convert_title"], L["convert_desc"],
                                  f'<h1>{e(L["convert_title"])}</h1><p class="lead">{e(L["convert_desc"])}</p>' + "".join(hub),
                                  [("Home", "/"), ("Unit conversions", "/learn/convert/")]))
    urls.append("/learn/convert/")
    return urls


def build_learn_hub() -> list[str]:
    urls = []
    for lang in ("en", "hi"):
        L = T[lang]
        pre = "" if lang == "en" else "/hi"
        links = [(f"{pre}/learn/formulas/", L["formulas_title"], L["formulas_desc"].format(n="1,022")),
                 (f"{pre}/learn/elements/", L["elements_title"], L["elements_desc"])]
        if lang == "en":
            links.append(("/learn/convert/", L["convert_title"], L["convert_desc"]))
        cards = "".join(f'<a href="{p}"><b>{e(t)}</b><small>{e(d)}</small></a>' for p, t, d in links)
        path = f"{pre}/learn/"
        write(path, page(lang, path, L["learn_title"], L["learn_desc"],
                         f'<h1>{e(L["learn_title"])}</h1><p class="lead">{e(L["learn_desc"])}</p><div class="grid">{cards}</div>',
                         [(L["home"], "/"), (L["learn"], path)], ("/hi" if lang == "en" else "") + "/learn/"))
        urls.append(path)
    return urls


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    urls = build_learn_hub() + build_formulas() + build_formula_pages() + build_elements() + build_conversions()
    all_urls = MAIN_PAGES + urls
    sm = "".join(f"  <url><loc>{e(SITE + u)}</loc></url>\n" for u in all_urls)
    (OUT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                     + sm + "</urlset>\n", encoding="utf-8")
    files = list(OUT.rglob("*.html"))
    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file()) / 1e6
    print(f"Learn pages: {len(files)} pages, {size:.1f} MB in {OUT} — sitemap with {len(all_urls)} URLs")
    print(f"  formulas EN+HI: {sum(1 for u in urls if '/formulas/' in u)}, elements EN+HI: {sum(1 for u in urls if '/elements/' in u)}, "
          f"conversions: {sum(1 for u in urls if '/convert/' in u)}")


if __name__ == "__main__":
    main()
