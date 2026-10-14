"""Formula calculator: turn a library formula such as "s = ut + ½at²" into an equation and solve it for any variable.

    parse_formula("v² = u² + 2as")                  -> equations with their variables
    solve(formula, target="u", values={...})        -> solutions + step-by-step working
    calculable_index()                              -> {category: {section_id: [item indexes]}} for the UI

The formula text uses the library's notation (Unicode superscripts/subscripts, ½, √, π, ·, ×, −, implicit
multiplication). It is normalised into a strict ASCII expression and only then handed to SymPy, so free text
from the custom-formula box cannot reach Python's eval with anything but arithmetic, names and brackets.
"""

from __future__ import annotations

import json
import keyword
import math
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from functools import lru_cache
from pathlib import Path

import sympy as sp
from sympy.parsing.sympy_parser import (convert_xor, factorial_notation, implicit_multiplication_application,
                                        parse_expr, split_symbols_custom, standard_transformations,
                                        _token_splittable)
from sympy.printing.str import StrPrinter

from src.errors import AppError, InputValidationError

GLOSSARY_FILE = Path(__file__).resolve().parent / "knowledge" / "formulas" / "calc_glossary.json"
MAX_LEN = 200
SOLVE_TIMEOUT_S = 8

SUPERSCRIPT = dict(zip("⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺⁽⁾ⁿⁱˣʸᵐᵏ", "0123456789-+()nixymk"))
SUBSCRIPT = dict(zip("₀₁₂₃₄₅₆₇₈₉ₙᵢₐₑₒₓₖₘₚₛₜᵣₗₕ", "0123456789niaeoxkmpstrlh"))
FRACTIONS = {"½": "(1/2)", "⅓": "(1/3)", "⅔": "(2/3)", "¼": "(1/4)", "¾": "(3/4)", "⅕": "(1/5)", "⅙": "(1/6)",
             "⅛": "(1/8)"}
GREEK = {"α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon", "ζ": "zeta", "η": "eta",
         "θ": "theta", "ι": "iota", "κ": "kappa", "λ": "lamda", "μ": "mu", "ν": "nu", "ξ": "xi", "ρ": "rho",
         "σ": "sigma", "τ": "tau", "υ": "upsilon", "φ": "phi", "ϕ": "phi", "χ": "chi", "ψ": "psi", "ω": "omega",
         "Γ": "Gamma", "Δ": "Delta", "Θ": "Theta", "Λ": "Lamda", "Ξ": "Xi", "Σ": "Sigma", "Φ": "Phi", "Ψ": "Psi", "Ω": "Omega"}
GREEK_BACK = {"pi": "π"}
for _ch, _name in GREEK.items():
    GREEK_BACK.setdefault(_name, _ch)          # phi -> φ (not the variant ϕ)
# multi-letter quantity names that must not be split into letters (KE is not K·E)
WHOLE_NAMES = ["KE_max", "KE", "PE", "TSA", "CSA", "LSA", "SI", "CI", "COP", "BE", "Re", "LCM", "HCF", "EMF"]
# kept whole only when they are the entire left-hand side ("GM = √(ab)"); elsewhere GM is G·M
LHS_WHOLE = {"AM", "GM", "HM", "SP", "CP", "MP", "CA", "SA", "LA"}
FUNCS = {"sin": sp.sin, "cos": sp.cos, "tan": sp.tan, "cot": sp.cot, "sec": sp.sec, "csc": sp.csc,
         "asin": sp.asin, "acos": sp.acos, "atan": sp.atan, "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh,
         "exp": sp.exp, "ln": sp.log, "log": lambda x: sp.log(x, 10), "log10": lambda x: sp.log(x, 10),
         "log2": lambda x: sp.log(x, 2), "sqrt": sp.sqrt, "cbrt": sp.cbrt, "abs": sp.Abs}
REJECT = re.compile(r"[≈≤≥<>⇒⇔→∫∑Σ∮∂∞∈∉∪∩⊂⊥∥∠△|…%°!≠±∓′″{}\[\]]|\blim\b|\bd/d|\bmod\b|\bif\b|\bfor\b|"
                    r"[ऀ-ॿ]|sin⁻¹|cos⁻¹|tan⁻¹|cot⁻¹|sec⁻¹|cosec⁻¹|\bdB\b|log[ₐₑₓ_]|:|"
                    r"\b[A-Za-z]\([A-Za-z]\)|"                                     # function notation P(E), f(x)
                    r"\b[A-Z][a-z]{2,}|"                                           # capitalised words: New, Old, Area
                    r"\bd[^\s/()]+/d[A-Za-zα-ωΑ-Ω]|"                               # derivatives such as dv/dx, dΦ/dt
                    r"\s(?:nm|eV|MeV|fm|Hz|kg|m/s²?|Pa|J|N)\s*$|"                   # a trailing unit: … nm
                    r"\d[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]*\s+(?:m|s|kg|g|N|J|W|Pa|Hz|V|A|C|T|K|eV|MeV|fm|nm|km|cm|mm|mol|rad|L|mL|h)"
                    r"(?:[/²³⁻¹·\s]|$)")                                            # a value with a unit: 9.8 m/s²
SAFE = re.compile(r"^[A-Za-z0-9_+\-*/(). ,]+$")
LABELS = {
    "en": {"formula": "Formula", "rearranged": "Rearranged for {t}", "substitute": "Substitute the values",
           "result": "Result", "numeric": "Solved numerically for {t}"},
    "hi": {"formula": "सूत्र", "rearranged": "{t} के लिए पुनर्व्यवस्थित", "substitute": "मान रखने पर",
           "result": "परिणाम", "numeric": "{t} का संख्यात्मक हल"},
}

_LOCALS = {**FUNCS, "pi": sp.pi, "E": sp.Symbol("E"), "I": sp.Symbol("I"), "N": sp.Symbol("N"),
           "S": sp.Symbol("S"), "Q": sp.Symbol("Q"), "O": sp.Symbol("O"), "beta": sp.Symbol("beta"),
           "gamma": sp.Symbol("gamma"), "zeta": sp.Symbol("zeta"), "Gamma": sp.Symbol("Gamma"),
           "lamda": sp.Symbol("lamda")}


class CalcError(AppError):
    status_code = 422
    error_code = "FORMULA_NOT_CALCULABLE"
    error_title = "Formula cannot be calculated"
    message = "This formula cannot be used in the calculator."


# ------------------------------------------------------------------ normalise + parse
def _split_ok(name: str) -> bool:
    """Split "ut" into u·t, but keep names with an underscore (v_0), Greek names and known quantities whole."""
    if name in _LOCALS or name in WHOLE_NAMES:
        return False
    return _token_splittable(name)


TRANSFORMS = standard_transformations + (factorial_notation, convert_xor, split_symbols_custom(_split_ok),
                                         implicit_multiplication_application)


def _split_before_subscript(m: re.Match) -> str:
    """The subscript belongs to the last letter only (nAev_d -> nAe v_d), unless the name is one quantity
    (omega_0, Delta_T, KE_max, lamda_max)."""
    whole = m.group(1) + m.group(2)
    if whole.lower() in GREEK_BACK or whole in WHOLE_NAMES or whole == "Delta" or whole in _LOCALS:
        return m.group(0)
    return f"{m.group(1)} {m.group(2)}_{m.group(3)}"


def normalise(text: str) -> str:
    """Library notation -> strict ASCII expression; raises CalcError when it is not plain arithmetic."""
    s = unicodedata.normalize("NFC", text).strip()
    if not s or len(s) > MAX_LEN:
        raise CalcError("Formula is empty or too long.")
    if REJECT.search(s):
        raise CalcError("Contains words, inequalities, limits, sums or integrals — not a plain calculation.")
    for word in re.findall(r"[A-Za-z]{4,}", s):                               # prose such as "then", "total"
        # prose is lower-case or Capitalised; mixed case like "nAev" is a product of variables
        if re.fullmatch(r"[A-Z]?[a-z]+", word) and word not in FUNCS and word.lower() not in ("cosec", "sqrt"):
            raise CalcError(f"'{word}' looks like a word, not a variable.")
    s = s.replace("−", "-").replace("–", "-").replace("×", "*").replace("·", "*").replace("⋅", "*") \
        .replace("∙", "*").replace("÷", "/").replace("^", "**").replace("cosec", "csc").replace("π", " pi ")
    for k, v in FRACTIONS.items():
        s = s.replace(k, v)
    s = re.sub(r"log₁₀", "log10", s)
    s = re.sub(r"log₂", "log2", s)
    s = re.sub(r"(?<![A-Za-z])e\s*\*\*\s*\(", "exp(", s)                      # e^(x) is the exponential
    s = re.sub(r"([A-Za-z])\(1/2\)", r"\1_half ", s)                            # T½ is the half-life
    sub_c, sup_c, greek_c = "".join(SUBSCRIPT), "".join(SUPERSCRIPT), "".join(GREEK) + "π"
    s = re.sub(rf"([A-Za-z])([{sup_c}]+)(_[A-Za-z0-9]+)", r"\1\3\2", s)       # v²_rms -> v_rms²
    s = re.sub(r"k_B(?=[A-Z])", "k_B ", s)                                     # k_BT -> k_B·T
    # "sin A sin B" is sin(A)·sin(B), "sin²θ" is sin(θ)², "sin 2θ" is sin(2θ)  (longest names first: sinh before sin)
    s = re.sub(rf"\b(sinh|cosh|tanh|log10|log2|sin|cos|tan|cot|sec|csc|ln|log|exp)([{sup_c}]*)\s*"
               rf"(\d*\.?\d*(?:[A-Za-z{greek_c}][{sub_c}]*(?:_[A-Za-z0-9]+)?)+)(?![A-Za-z{greek_c}(])",
               lambda m: f"{m.group(1)}({m.group(3)}){m.group(2)}", s)
    # textbook convention: p²/2m means p²/(2m)  (but never wrap a function name: "/ sin(θ)")
    s = re.sub(rf"/\s*(\d*(?:[A-Za-z{greek_c}][{sub_c}]*(?:_[A-Za-z0-9]+)?)+[{sup_c}]*)(?![A-Za-z{greek_c}(])",
               r"/(\1)", s)
    s = re.sub(f"Δ(KE|PE|[A-Za-z{greek_c}])", r" Delta_\1 ", s)               # Δx, ΔKE are one quantity
    s = re.sub(f"[{sub_c}]+", lambda m: "_" + "".join(SUBSCRIPT[c] for c in m.group()) + " ", s)
    for k, v in GREEK.items():
        s = s.replace(k, f" {v} ")
    s = re.sub(r"\s+_", "_", s).replace("Delta_ ", "Delta_")                 # " omega _0" -> "omega_0"
    s = re.sub("[" + "".join(SUPERSCRIPT) + "]+", lambda m: "**(" + "".join(SUPERSCRIPT[c] for c in m.group()) + ")", s)
    s = re.sub(r"√\s*\(", "sqrt(", s)
    s = re.sub(r"∛\s*\(", "cbrt(", s)
    s = re.sub(r"√\s*([A-Za-z0-9_.]+(?:\*\*\(\d+\))?)", r"sqrt(\1)", s)
    s = re.sub(r"∛\s*([A-Za-z0-9_.]+)", r"cbrt(\1)", s)
    s = re.sub(r"\b([A-Za-z]+)([A-Za-z])_([A-Za-z0-9]+)", _split_before_subscript, s)  # nAev_d -> nAe v_d
    s = re.sub(r"\s+", " ", s).strip()
    if not SAFE.search(s.replace("=", "")) or "__" in s or re.search(r"\.\s*[A-Za-z_]", s):
        raise CalcError("Unsupported characters in the formula.")
    if re.search(r"\d{16,}|\*\*\s*\(?\s*-?\d{3,}|\d\s*\)?\s*\*\*\s*\(?\s*\d+\s*\)?\s*\*\*", s):
        raise CalcError("Numbers or powers too large.")                         # 9^9^9 would never finish
    for name in WHOLE_NAMES:
        s = re.sub(rf"\b{name}\b", name + "_", s)                             # KE -> KE_ (kept whole, shown as KE)
    # "2as" contains the Python keyword "as": write it as a·s
    s = re.sub(r"(?<![A-Za-z_])[A-Za-z]+(?![A-Za-z_])", lambda m: " ".join(m.group()) if keyword.iskeyword(m.group()) else m.group(), s)
    return s


def _parse_side(side: str) -> sp.Expr:
    expr = parse_expr(side, local_dict=dict(_LOCALS), transformations=TRANSFORMS, evaluate=False)
    if not isinstance(expr, sp.Expr):
        raise CalcError("Not an arithmetic expression.")
    for a in sp.preorder_traversal(expr):                                     # no 9^9^9 style blow-ups
        if isinstance(a, sp.Pow) and a.exp.is_Number and abs(float(a.exp)) > 30:
            raise CalcError("Exponent too large.")
        if a.is_Number and abs(float(a)) > 1e15:
            raise CalcError("Number too large.")
    # safe now: evaluate for a clean form (2n − 1 instead of 2·n − 1·1)
    return parse_expr(side, local_dict=dict(_LOCALS), transformations=TRANSFORMS)


def _split_top(s: str, seps: str) -> list[str]:
    out, depth, cur = [], 0, ""
    for ch in s:
        depth += ch == "("
        depth -= ch == ")"
        if ch in seps and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    return out + [cur]


@lru_cache(maxsize=4096)
def parse_formula(text: str) -> tuple:
    """-> tuple of (lhs, rhs, source_text) for every equation in the formula ("v = gt;  h = ½gt²" gives two)."""
    eqs = []
    raw_parts = [p for p in _split_top(text, ";,") if p.strip()]
    for raw in raw_parts:
        if "=" not in raw:
            continue
        try:
            s = normalise(raw)
            sides = [x.strip() for x in s.split("=")]
            if len(sides) < 2 or not all(sides[:2]):
                continue
            if sides[0] in LHS_WHOLE:
                sides[0] += "_"
            lhs, rhs = _parse_side(sides[0]), _parse_side(sides[1])
        except CalcError:
            continue
        except Exception:   # SymPy tokenizer / syntax errors
            continue
        free = (lhs - rhs).free_symbols
        if len(free) < 2:
            continue
        diff = sp.expand(sp.expand_trig(lhs - rhs))
        if diff == 0:                                                         # identity such as (a+b)² = a²+2ab+b²
            continue
        eqs.append((lhs, rhs, raw.strip()))
    if not eqs:
        raise CalcError("No solvable equation (needs 'quantity = expression' with at least two variables).")
    return tuple(eqs)


# ------------------------------------------------------------------ display
def pretty_name(name: str) -> str:
    name = name.rstrip("_")
    if name.startswith("Delta_"):
        return "Δ" + pretty_name(name[6:])
    base, _, sub = name.partition("_")
    base = GREEK_BACK.get(base, base)
    if not sub:
        return base
    if sub == "half":
        return base + "½"
    tr = {v: k for k, v in SUBSCRIPT.items()}
    return base + ("".join(tr[c] for c in sub) if all(c in tr for c in sub) else "_" + sub)


def fmt_number(x: float) -> str:
    if x == 0:
        return "0"
    if not math.isfinite(x):
        return str(x)
    if abs(x) >= 1e7 or abs(x) < 1e-4:
        m, e = f"{x:.6e}".split("e")
        m = m.rstrip("0").rstrip(".")
        sup = str.maketrans("-0123456789", "⁻⁰¹²³⁴⁵⁶⁷⁸⁹")
        return f"{m} × 10{str(int(e)).translate(sup)}"
    s = f"{x:.6f}".rstrip("0").rstrip(".")
    return s if s not in ("-0", "") else "0"


class _Printer(StrPrinter):
    def _print_Symbol(self, expr):
        return pretty_name(expr.name)

    def _print_Pi(self, expr):
        return "π"

    def _print_log(self, expr):
        return f"ln({self._print(expr.args[0])})"

    def _print_exp(self, expr):
        return f"e^({self._print(expr.args[0])})"

    def _print_Float(self, expr):
        return fmt_number(float(expr))

    def _print_Pow(self, expr, rational=False):
        b, e = expr.as_base_exp()
        if e == sp.S.Half:
            return f"√({self._print(b)})"
        if e == -sp.S.Half:
            return f"1/√({self._print(b)})"
        base = self.parenthesize(b, 61)   # PRECEDENCE["Pow"] = 60
        if e.is_Integer and e > 0:
            return base + str(e).translate(str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹"))
        return super()._print_Pow(expr, rational)


def show(expr) -> str:
    return _Printer().doprint(expr).replace("**", "^").replace("*", "·")


def show_eq(lhs, rhs) -> str:
    return f"{show(lhs)} = {show(rhs)}"


# ------------------------------------------------------------------ glossary
@lru_cache(maxsize=1)
def _glossary() -> dict:
    return json.loads(GLOSSARY_FILE.read_text(encoding="utf-8"))


def variable_info(symbols, category: str | None, section_vars: dict | None, lang: str) -> list[dict]:
    g = _glossary()
    cat = g.get(category or "", {})
    out = []
    for s in sorted(symbols, key=lambda x: x.name):
        disp = pretty_name(s.name)
        entry = cat.get(disp) or g.get("_common", {}).get(disp)
        label = (section_vars or {}).get(disp) or ""
        if not label and entry:
            label = entry[1] if lang == "hi" and len(entry) > 1 and entry[1] else entry[0]
        default = entry[2] if entry and len(entry) > 2 else None
        out.append({"symbol": s.name, "display": disp, "label": label, "default": default})
    return out


TRIG = (sp.sin, sp.cos, sp.tan, sp.cot, sp.sec, sp.csc)


def angle_symbols(lhs, rhs) -> set[str]:
    """Variables used inside sin/cos/tan…: those are angles (the UI lets students type them in degrees)."""
    out = set()
    for node in sp.preorder_traversal(lhs - rhs):
        if isinstance(node, TRIG):
            out |= {s.name for s in node.free_symbols}
    return out


def describe(text: str, *, category: str | None = None, section_vars: dict | None = None, lang: str = "en") -> dict:
    eqs = parse_formula(text)
    out = []
    for i, (lhs, rhs, raw) in enumerate(eqs):
        syms = (lhs - rhs).free_symbols
        angles = angle_symbols(lhs, rhs)
        variables = variable_info(syms, category, section_vars, lang)
        for v in variables:
            v["angle"] = v["symbol"] in angles
        out.append({"index": i, "source": raw, "display": show_eq(lhs, rhs),
                    "lhs": lhs.name if isinstance(lhs, sp.Symbol) else None, "variables": variables})
    return {"formula": text, "equations": out}


# ------------------------------------------------------------------ solve
_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="formula-solve")


@lru_cache(maxsize=2048)
def _symbolic(text: str, eq_index: int, target: str):
    lhs, rhs, _ = parse_formula(text)[eq_index]
    t = sp.Symbol(target)
    if lhs == t:
        return (rhs,)
    return tuple(sp.solve(sp.Eq(lhs.doit(), rhs.doit()), t))


def _run(fn, *a):
    try:
        return _pool.submit(fn, *a).result(timeout=SOLVE_TIMEOUT_S)
    except FutureTimeout:
        raise CalcError("Solving took too long — try solving for a different variable.",
                        error_code="SOLVE_TIMEOUT", error_title="Solve timed out") from None


def _num_sym(v: float) -> sp.Symbol:
    """Numbers shown in the substitution step keep the formula's shape (no evaluation)."""
    txt = fmt_number(v)
    return sp.Symbol(f"({txt})" if v < 0 or " " in txt else txt)


def solve(text: str, target: str, values: dict[str, float], *, eq_index: int = 0, lang: str = "en",
          unit: str | None = None, angle_unit: str = "rad") -> dict:
    """Solve equation `eq_index` of `text` for `target`. With angle_unit="deg" the angle variables (those inside
    sin/cos/tan) are typed and reported in degrees."""
    L = LABELS.get(lang, LABELS["en"])
    eqs = parse_formula(text)
    if not 0 <= eq_index < len(eqs):
        raise InputValidationError(f"Equation index {eq_index} out of range (0..{len(eqs) - 1}).",
                                   error_code="BAD_EQUATION_INDEX", error_title="Unknown equation")
    if angle_unit not in ("rad", "deg"):
        raise InputValidationError("angle_unit must be 'rad' or 'deg'.", error_code="INVALID_ANGLE_UNIT",
                                   error_title="Invalid angle unit")
    lhs, rhs, _ = eqs[eq_index]
    syms = {s.name: s for s in (lhs - rhs).free_symbols}
    if target not in syms:
        raise InputValidationError(f"'{target}' is not a variable of this formula. Variables: {sorted(syms)}",
                                   error_code="UNKNOWN_VARIABLE", error_title="Unknown variable")
    need = sorted(n for n in syms if n != target)
    missing = [pretty_name(n) for n in need if values.get(n) is None]
    if missing:
        raise InputValidationError(f"Enter a value for: {', '.join(missing)}.", error_code="MISSING_VALUES",
                                   error_title="Values missing", details={"missing": missing})
    for n in need:
        if not isinstance(values[n], (int, float)) or not math.isfinite(float(values[n])):
            raise InputValidationError(f"Value of {pretty_name(n)} is not a finite number.",
                                       error_code="INVALID_VALUE", error_title="Invalid value")
    deg = angle_unit == "deg"
    angles = angle_symbols(lhs, rhs) if deg else set()
    to_rad = {n: (math.radians(float(values[n])) if n in angles else float(values[n])) for n in need}
    subs = {syms[n]: sp.Float(to_rad[n], 15) for n in need}
    shown = {syms[n]: (sp.Symbol(fmt_number(float(values[n])) + "°") if n in angles else _num_sym(float(values[n])))
             for n in need}
    t = syms[target]
    steps = [{"label": L["formula"], "text": show_eq(lhs, rhs)}]

    try:
        sols = _run(_symbolic, text, eq_index, target)
    except CalcError:
        raise
    except Exception:                                                         # NotImplementedError etc.
        sols = ()
    results = []

    def _approx(expr):
        try:
            v = complex(expr.subs(subs).doit().evalf(15))
            return (v.real < 0, abs(v.real)) if math.isfinite(v.real) else (True, math.inf)
        except (TypeError, ValueError, ZeroDivisionError):
            return (True, math.inf)

    sols = sorted(sols, key=_approx)                                          # positive (physical) root first
    for s in sols:
        if lhs != t:
            steps.append({"label": L["rearranged"].format(t=pretty_name(target)), "text": f"{show(t)} = {show(s)}"})
        with sp.evaluate(False):
            sub_view = s.xreplace(shown)
        steps.append({"label": L["substitute"], "text": f"{show(t)} = {show(sub_view)}"})
        try:
            val = complex(s.subs(subs).doit().evalf(15))
        except (TypeError, ValueError, ZeroDivisionError):
            continue
        if abs(val.imag) > 1e-9 * max(1.0, abs(val.real)) or not math.isfinite(val.real):
            continue
        results.append(val.real)
    if not sols:                                                              # numeric fallback
        f = (lhs - rhs).doit().subs(subs)
        for x0 in (1, 0.5, 10, 100, -1, 0.01, 1000):
            try:
                r = float(sp.nsolve(f, t, x0))
            except Exception:
                continue
            if math.isfinite(r) and all(abs(r - q) > 1e-9 * max(1, abs(q)) for q in results):
                results.append(r)
        if results:
            with sp.evaluate(False):
                steps.append({"label": L["numeric"].format(t=pretty_name(target)),
                              "text": show_eq(lhs.xreplace(shown), rhs.xreplace(shown))})
    if not results:
        raise CalcError("No real solution for these values (check signs, zero divisors or square roots of negatives).",
                        error_code="NO_REAL_SOLUTION", error_title="No real solution")
    results = sorted(set(round(r, 12) for r in results), key=lambda r: (r < 0, abs(r)))
    target_is_angle = target in angle_symbols(lhs, rhs)
    out = []
    for r in results:
        item = {"value": r, "display": fmt_number(r)}
        if target_is_angle:                                                   # radians and degrees
            item["degrees"] = math.degrees(r)
            item["display"] = f"{fmt_number(r)} rad = {fmt_number(math.degrees(r))}°"
        out.append(item)
    unit_txt = f" {unit}" if unit and lhs == t and not target_is_angle else ""
    steps.append({"label": L["result"],
                  "text": " ; ".join(f"{pretty_name(target)} = {o['display']}{unit_txt}" for o in out)})
    return {"target": target, "target_display": pretty_name(target), "solutions": out,
            "unit": unit_txt.strip() or None, "angle": target_is_angle, "steps": steps}


# ------------------------------------------------------------------ library index
UNIT_LIKE = re.compile(r"^[A-Za-zΩμ°/·²³⁻¹ ()]+$")


def item_unit(note: str) -> str | None:
    note = (note or "").strip()
    return note if note and len(note) <= 14 and UNIT_LIKE.match(note) and " " not in note.strip("() ") else None


SKIP_CATEGORIES = {"physics_units"}                 # unit identities (N = kg·m/s²), not calculations
# identities and symbolic rules: true for every value, nothing to calculate (vectors: a·b, a × b are not products)
SKIP_SECTIONS = {
    "vectors_stats": {"Vectors"},
    "algebra": {"Algebraic identities", "Laws of exponents", "Logarithms", "Complex numbers", "Matrices & determinants",
                "Inequalities & absolute value", "Functions & sets"},
    "trigonometry": {"Fundamental identities", "Allied (associated) angles", "Compound angles", "Multiple angles",
                     "Half angles", "Product ↔ sum formulas", "Inverse trigonometric functions", "General solutions",
                     "Series & hyperbolic (reference)"},
    "calculus": {"Standard limits", "Derivatives of standard functions", "Rules of differentiation", "Standard integrals",
                 "Integration techniques", "Definite integrals", "Area & volume by integration", "Differential equations"},
}


def _library_formula_ok(category: str, formula: str) -> bool:
    if category == "geometry" and re.search(r"[A-Z]{2}", formula):   # segment names AB, PT, not products
        return False
    try:
        eqs = parse_formula(formula)
    except Exception:
        return False
    for lhs, rhs, _ in eqs:
        names = {s.name for s in (lhs - rhs).free_symbols}
        if "i" in names and category in ("algebra", "vectors_stats"):  # complex unit / unit vector
            return False
    return True


@lru_cache(maxsize=1)
def calculable_index() -> dict:
    """{category_id: {section_id: [item indexes whose formula the calculator can solve]}} (English library)."""
    from src.formulas import load_library
    out: dict = {}
    for c in load_library("en"):
        if c["id"] in SKIP_CATEGORIES:
            continue
        for s in c["sections"]:
            if s["title"] in SKIP_SECTIONS.get(c["id"], ()):
                continue
            idx = [i for i, it in enumerate(s["items"]) if _library_formula_ok(c["id"], it[1])]
            if idx:
                out.setdefault(c["id"], {})[s["id"]] = idx
    return out


def library_item(category: str, section: str, index: int) -> tuple[dict, dict, list]:
    from src.formulas import get_category
    c = get_category(category)
    sec = next((s for s in c["sections"] if s["id"] == section), None)
    if sec is None or not 0 <= index < len(sec["items"]):
        raise InputValidationError(f"No formula #{index} in {category}/{section}.", status_code=404,
                                   error_code="FORMULA_NOT_FOUND", error_title="Formula not found")
    return c, sec, sec["items"][index]
