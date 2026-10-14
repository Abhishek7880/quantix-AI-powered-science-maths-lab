"""Formula library: maths (arithmetic → calculus), mensuration with sketches, physics units & formulas.

Data lives in src/knowledge/formulas/*.json (one category per file). Mensuration is built from
src/knowledge/mensuration.json (the 19 shapes the detector recognises) + formulas/mensuration_extra.json,
one section per shape with a sketch.

    load_library(lang)                           -> list of categories ("en" or "hi")
    build_pdf(category_id | "all", section, lang) -> PDF bytes (mensuration sections include their sketch)

Hindi: src/knowledge/formulas/i18n/hi/*.json map English strings to Hindi. Strings without an entry
(pure maths such as "a² − b² = (a + b)(a − b)") are kept as they are.
"""

from __future__ import annotations

import io
import json
from datetime import date
from functools import lru_cache
from pathlib import Path

import matplotlib

from src.errors import ResourceNotFoundError, InputValidationError
from src.sketches import DRAW, render_sketch

KNOWLEDGE = Path(__file__).resolve().parent / "knowledge"
FORMULA_DIR = KNOWLEDGE / "formulas"
I18N_DIR = FORMULA_DIR / "i18n"
FONT_DIR = Path(__file__).resolve().parent / "fonts"
LANGUAGES = ("en", "hi")
UI_TEXT = {   # PDF labels
    "en": {"where": "Where", "name": "Name", "formula": "Formula", "note": "Note / unit", "page": "Formula Library · page",
           "generated": "Generated", "library": "Formula Library",
           "library_sub": "Mathematics (arithmetic to calculus), mensuration with sketches, physics units & formulas"},
    "hi": {"where": "जहाँ", "name": "नाम", "formula": "सूत्र", "note": "टिप्पणी / मात्रक", "page": "सूत्र संग्रह · पृष्ठ",
           "generated": "निर्मित", "library": "सूत्र संग्रह",
           "library_sub": "गणित (अंकगणित से कलन तक), चित्र सहित क्षेत्रमिति, भौतिकी के मात्रक एवं सूत्र"},
}
SHAPE_ORDER_2D = ["square", "rectangle", "triangle", "right_triangle", "equilateral_triangle", "parallelogram",
                  "rhombus", "trapezium", "kite", "pentagon", "hexagon", "circle", "semicircle", "sector",
                  "annulus", "ellipse"]
SHAPE_ORDER_3D = ["cube", "cuboid", "cylinder", "hollow_cylinder", "cone", "frustum", "sphere", "hemisphere",
                  "spherical_shell", "square_pyramid", "triangular_prism"]


def _mensuration_category() -> dict:
    shapes = json.loads((KNOWLEDGE / "mensuration.json").read_text(encoding="utf-8"))
    shapes.update(json.loads((FORMULA_DIR / "mensuration_extra.json").read_text(encoding="utf-8")))
    order = SHAPE_ORDER_2D + SHAPE_ORDER_3D + sorted(k for k in shapes if k not in SHAPE_ORDER_2D + SHAPE_ORDER_3D)
    sections = []
    for key in order:
        if key not in shapes:
            continue
        s = shapes[key]
        sections.append({
            "title": s["name"], "id": key, "dimension": s.get("dimension"),
            "sketch": key if key in DRAW else None,
            "variables": s.get("variables", {}), "note": s.get("note", ""),
            "items": [[f["label"], f["formula"], ""] for f in s.get("formulas", [])],
        })
    sections.append({"title": "Unit conversions for area & volume", "id": "conversions", "items": [
        ["Area", "1 m² = 10 000 cm²;  1 km² = 10⁶ m² = 100 ha", ""],
        ["Volume", "1 m³ = 10⁶ cm³ = 1000 L;  1 L = 1000 cm³ = 1000 mL", ""],
        ["Water", "1 L of water ≈ 1 kg;  1 m³ of water ≈ 1000 kg", ""],
        ["Scaling", "Scale length by k ⇒ area × k², volume × k³", ""],
    ]})
    return {"id": "mensuration", "title": "Mensuration (2D & 3D)", "icon": "▱", "order": 8,
            "description": "Area, perimeter, volume and surface area of every common 2D shape and 3D solid — "
                           "each with a labelled sketch.", "sections": sections}


def check_lang(lang: str | None) -> str:
    lang = (lang or "en").lower()
    if lang not in LANGUAGES:
        raise InputValidationError(f"Unsupported language '{lang}'. Use one of {list(LANGUAGES)}.",
                              error_code="UNSUPPORTED_LANGUAGE", error_title="Unsupported language")
    return lang


@lru_cache(maxsize=None)
def translations(lang: str) -> dict[str, str]:
    """English string -> translation, merged from every i18n/<lang>/*.json."""
    table: dict[str, str] = {}
    for f in sorted((I18N_DIR / lang).glob("*.json")):
        table.update(json.loads(f.read_text(encoding="utf-8")))
    return table


def _translate_category(c: dict, t: dict[str, str]) -> dict:
    def tr(x):
        return t.get(x, x) if isinstance(x, str) else x

    sections = []
    for sec in c["sections"]:
        out = {**sec, "title": tr(sec["title"]), "items": [[tr(x) for x in it] for it in sec["items"]]}
        if "variables" in sec:
            out["variables"] = {k: tr(v) for k, v in sec["variables"].items()}
            out["note"] = tr(sec.get("note", ""))
        sections.append(out)
    return {**c, "title": tr(c["title"]), "description": tr(c.get("description", "")), "sections": sections}


@lru_cache(maxsize=None)
def load_library(lang: str = "en") -> tuple:
    lang = check_lang(lang)
    if lang != "en":
        t = translations(lang)
        return tuple(_translate_category(c, t) for c in load_library("en"))
    cats = []
    for f in sorted(FORMULA_DIR.glob("[0-9]*.json")):
        cats.append(json.loads(f.read_text(encoding="utf-8")))
    cats.append(_mensuration_category())
    for c in cats:
        for i, s in enumerate(c["sections"]):
            s.setdefault("id", f"s{i}")
    cats.sort(key=lambda c: c.get("order", 99))
    return tuple(cats)


def summary(lang: str = "en") -> list[dict]:
    return [{"id": c["id"], "title": c["title"], "icon": c.get("icon", ""), "description": c.get("description", ""),
             "sections": len(c["sections"]), "formulas": sum(len(s["items"]) for s in c["sections"])}
            for c in load_library(lang)]


def get_category(cid: str, lang: str = "en") -> dict:
    for c in load_library(lang):
        if c["id"] == cid:
            return c
    raise ResourceNotFoundError(f"Formula category '{cid}' not found. Known: {[c['id'] for c in load_library()]}",
                                error_code="CATEGORY_NOT_FOUND", error_title="Category not found")


# ================================================================== PDF
def _fonts_dir() -> Path:
    return Path(matplotlib.get_data_path()) / "fonts" / "ttf"


def build_pdf(category: str = "all", section: str | None = None, lang: str = "en") -> tuple[bytes, str]:
    """PDF of one category, one section of it, or the whole library. Returns (bytes, file name)."""
    from fpdf import FPDF
    from fpdf.fonts import FontFace

    lang = check_lang(lang)
    ui = UI_TEXT[lang]
    hi = lang == "hi"
    if category == "all":
        cats = list(load_library(lang))
    else:
        c = get_category(category, lang)
        if section:
            secs = [s for s in c["sections"] if s["id"] == section or s["title"] == section]
            if not secs:
                raise ResourceNotFoundError(f"Section '{section}' not found in '{category}'.",
                                            error_code="SECTION_NOT_FOUND", error_title="Section not found")
            c = {**c, "sections": secs}
        cats = [c]

    fd = _fonts_dir()

    class PDF(FPDF):
        def footer(self):
            self.set_y(-12)
            self.set_font(TXT, "", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 8, f"{ui['page']} {self.page_no()}", align="C")

    pdf = PDF(format="A4")
    pdf.set_auto_page_break(True, margin=16)
    pdf.add_font("Sans", "", str(fd / "DejaVuSans.ttf"))
    pdf.add_font("Sans", "B", str(fd / "DejaVuSans-Bold.ttf"))
    pdf.add_font("Sans", "I", str(fd / "DejaVuSans-Oblique.ttf"))
    pdf.add_font("Serif", "", str(fd / "DejaVuSerif.ttf"))
    pdf.add_font("Serif", "I", str(fd / "DejaVuSerif-Italic.ttf"))
    TXT = "Sans"
    if hi:
        # Devanagari needs a Devanagari font plus text shaping (uharfbuzz) for conjuncts and matras.
        # Noto has no italic, so "I" maps to the upright face.
        for style, f in (("", "Regular"), ("B", "Bold"), ("I", "Regular")):
            pdf.add_font("Hi", style, str(FONT_DIR / f"NotoSansDevanagari-{f}.ttf"))
        pdf.set_text_shaping(True)
        TXT = "Hi"
    # ∮ is missing from DejaVu Serif and maths symbols from Noto Devanagari: fall back to DejaVu Sans
    pdf.set_fallback_fonts(["Sans", "Hi"] if hi else ["Sans"], exact_match=False)
    pdf.set_margins(14, 14, 14)
    pdf.add_page()

    # title block
    if section and len(cats) == 1:
        title, sub = cats[0]["sections"][0]["title"], cats[0]["title"]
    elif len(cats) == 1:
        title, sub = cats[0]["title"], cats[0].get("description", "")
    else:
        title, sub = ui["library"], ui["library_sub"]
    pdf.set_font(TXT, "B", 20)
    pdf.set_text_color(17, 24, 39)
    pdf.multi_cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(TXT, "", 10)
    pdf.set_text_color(90, 100, 115)
    pdf.multi_cell(0, 5.5, sub, new_x="LMARGIN", new_y="NEXT")
    pdf.multi_cell(0, 5.5, f"{ui['generated']} {date.today():%d-%m-%Y}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    head_style = FontFace(family=TXT, emphasis="B", color=(255, 255, 255), fill_color=(31, 111, 235))
    usable = pdf.w - pdf.l_margin - pdf.r_margin

    for ci, cat in enumerate(cats):
        if len(cats) > 1:
            if ci:
                pdf.add_page()
            pdf.set_font(TXT, "B", 16)
            pdf.set_text_color(31, 111, 235)
            pdf.multi_cell(0, 9, cat["title"], new_x="LMARGIN", new_y="NEXT")
            pdf.set_font(TXT, "", 9)
            pdf.set_text_color(90, 100, 115)
            pdf.multi_cell(0, 5, cat.get("description", ""), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)
        for sec in cat["sections"]:
            sketch = sec.get("sketch")
            need = 70 if sketch else 22
            if pdf.get_y() + need > pdf.h - pdf.b_margin:
                pdf.add_page()
            if not (section and len(cats) == 1):
                pdf.set_font(TXT, "B", 12.5)
                pdf.set_text_color(17, 24, 39)
                label = sec["title"] + (f"  ({sec['dimension']})" if sec.get("dimension") else "")
                pdf.multi_cell(0, 7, label, new_x="LMARGIN", new_y="NEXT")
            if sketch:
                y0 = pdf.get_y()
                img_w = 58
                info = pdf.image(io.BytesIO(render_sketch(sketch, "png")), x=pdf.l_margin, y=y0, w=img_w)
                img_h = getattr(info, "rendered_height", None) or img_w * 0.8
                pdf.set_xy(pdf.l_margin + img_w + 6, y0 + 2)
                pdf.set_font(TXT, "B", 9.5)
                pdf.set_text_color(17, 24, 39)
                pdf.cell(0, 5, ui["where"], new_x="LMARGIN", new_y="NEXT")
                for sym, meaning in sec.get("variables", {}).items():
                    pdf.set_x(pdf.l_margin + img_w + 6)
                    pdf.set_font("Serif", "I", 10)
                    pdf.cell(16, 5.5, sym)
                    pdf.set_font(TXT, "", 9.5)
                    pdf.cell(0, 5.5, meaning, new_x="LMARGIN", new_y="NEXT")
                if sec.get("note"):
                    pdf.set_x(pdf.l_margin + img_w + 6)
                    pdf.set_font(TXT, "I", 8.5)
                    pdf.set_text_color(90, 100, 115)
                    pdf.multi_cell(usable - img_w - 6, 4.6, sec["note"], new_x="LMARGIN", new_y="NEXT")
                pdf.set_y(max(pdf.get_y(), y0 + img_h) + 3)
            pdf.set_text_color(17, 24, 39)
            has_note = any(len(it) > 2 and it[2] for it in sec["items"])
            widths = (52, 82, usable - 134) if has_note else (60, usable - 60)
            pdf.set_font(TXT, "", 9)
            with pdf.table(col_widths=widths, headings_style=head_style, line_height=5.6, padding=1.6,
                           cell_fill_color=(243, 246, 250), cell_fill_mode="ROWS", first_row_as_headings=True) as t:
                head = t.row()
                for hname in ((ui["name"], ui["formula"], ui["note"]) if has_note else (ui["name"], ui["formula"])):
                    head.cell(hname)
                for it in sec["items"]:
                    row = t.row()
                    row.cell(it[0])
                    row.cell(it[1], style=FontFace(family="Serif", size_pt=10))
                    if has_note:
                        row.cell(it[2] if len(it) > 2 else "", style=FontFace(family=TXT, emphasis="I", size_pt=8,
                                                                               color=(90, 100, 115)))
            pdf.ln(4)

    name = "formula_library" if category == "all" else category + (f"_{sections_slug(section)}" if section else "")
    name += "" if lang == "en" else f"_{lang}"
    return bytes(pdf.output()), f"{name}.pdf"


def sections_slug(s: str) -> str:
    # ASCII only: the name goes into a Content-Disposition header (a Hindi section title must not break it)
    return "".join(ch if ch.isascii() and ch.isalnum() else "_" for ch in s).strip("_")[:40] or "section"
