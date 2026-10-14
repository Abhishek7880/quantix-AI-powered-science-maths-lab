"""Solve, simplify or plot one line of maths typed or read from handwriting (SymPy only — no OpenCV / PyTorch, so
the static site can run it in the browser with Pyodide). Used by src/handwriting.py and the /handwriting/solve route."""

from __future__ import annotations

import math

from src.errors import InputValidationError


SUP = str.maketrans("0123456789+-xyn()", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ˣʸⁿ⁽⁾")


def pretty(text: str) -> str:
    import re
    s = re.sub(r"\^\(([0-9xyn+\-]+)\)", lambda m: m.group(1).translate(SUP), text)
    return s.replace("*", "×").replace("-", "−")


# ------------------------------------------------------------------ solving
def solve_text(text: str, lang: str = "en") -> dict:
    """Solve / simplify / plot the recognised (or corrected) text."""
    import sympy as sp

    from src import formula_calc as fc
    H = {"en": {"eq": "Equation", "move": "Bring every term to one side", "factor": "Factorise", "disc": "Discriminant",
                "qf": "Quadratic formula", "sol": "Solution", "sols": "Solutions", "value": "Value", "expand": "Expanded",
                "fact": "Factorised", "simp": "Simplified", "func": "Function of x", "check": "Check"},
         "hi": {"eq": "समीकरण", "move": "सभी पदों को एक ओर लाएँ", "factor": "गुणनखंड", "disc": "विविक्तकर",
                "qf": "द्विघात सूत्र", "sol": "हल", "sols": "हल", "value": "मान", "expand": "विस्तारित",
                "fact": "गुणनखंडित", "simp": "सरलीकृत", "func": "x का फलन", "check": "जाँच"}}[lang if lang == "hi" else "en"]
    raw = (text or "").strip()
    if not raw:
        raise InputValidationError("Nothing to solve.", error_code="EMPTY_EXPRESSION", error_title="Empty expression")
    if raw.count("=") > 1:
        raise InputValidationError("Only one '=' is supported.", error_code="TOO_MANY_EQUALS", error_title="Too many '='")
    try:
        s = fc.normalise(raw)
        parts = [fc._parse_side(p.strip()) for p in s.split("=")] if "=" in s else [fc._parse_side(s)]
    except Exception as e:
        raise InputValidationError(f"Could not read '{raw}' as maths: {getattr(e, 'error_content', e)}", error_code="EXPRESSION_INVALID",
                                   error_title="Not a valid expression") from None
    show = fc.show
    steps: list[dict] = []
    out = {"input": raw, "pretty": pretty(raw), "steps": steps}
    x, y = sp.Symbol("x"), sp.Symbol("y")

    if len(parts) == 1:                                        # expression: evaluate / simplify
        e = parts[0]
        if not e.free_symbols:
            val = sp.nsimplify(e) if e.is_number else e
            steps.append({"label": H["value"], "text": f"{show(e)} = {show(sp.simplify(e))}"})
            out.update(kind="value", value=float(sp.N(e)), exact=show(sp.simplify(val)))
        else:
            ex, fa, si = sp.expand(e), sp.factor(e), sp.simplify(e)
            steps += [{"label": H["expand"], "text": show(ex)}, {"label": H["fact"], "text": show(fa)}, {"label": H["simp"], "text": show(si)}]
            out.update(kind="expression")
            if e.free_symbols == {x}:
                out["plot"] = _plot_points(e, x)
        return out

    lhs, rhs = parts
    syms = (lhs - rhs).free_symbols
    steps.append({"label": H["eq"], "text": f"{show(lhs)} = {show(rhs)}"})
    if y in syms and syms <= {x, y}:                           # relation in x and y -> plot
        sol = fc._run(lambda: sp.solve(sp.Eq(lhs, rhs), y))
        out.update(kind="relation", graph=raw.replace("**", "^"))
        if sol:
            for f_ in sol[:2]:
                steps.append({"label": H["func"], "text": f"y = {show(f_)}"})
            out["plot"] = _plot_points(sol[:2], x)                # both branches of e.g. a circle
            out["y_of_x"] = show(sol[0])
        return out
    if not syms:                                               # "1 + 1 = 2": just check it
        l_, r_ = sp.nsimplify(sp.simplify(lhs)), sp.nsimplify(sp.simplify(rhs))
        true = bool(sp.simplify(l_ - r_) == 0)
        steps.append({"label": H["check"], "text": f"{show(lhs)} = {show(l_)} ; {show(rhs)} = {show(r_)}"})
        out.update(kind="check", correct=true, verdict=("✓ " + ("सही" if lang == "hi" else "True")) if true
                   else ("✗ " + ("गलत" if lang == "hi" else "False") + f": {show(l_)} ≠ {show(r_)}"))
        return out
    if len(syms) != 1:
        out.update(kind="formula", note="Several unknowns — use the 🧮 Formula calculator to solve for one of them."
                   if lang != "hi" else "कई अज्ञात — किसी एक का मान निकालने के लिए 🧮 सूत्र कैलकुलेटर का उपयोग करें।")
        return out
    v = next(iter(syms))
    expr = sp.expand(lhs - rhs)
    if rhs != 0 or sp.expand(lhs) != lhs:
        steps.append({"label": H["move"], "text": f"{show(expr)} = 0"})
    poly = sp.Poly(expr, v) if expr.is_polynomial(v) else None
    if poly is not None and poly.degree() == 2:
        a, b, c = poly.all_coeffs()
        D = sp.simplify(b * b - 4 * a * c)
        steps.append({"label": H["disc"], "text": f"D = b² − 4ac = ({show(b)})² − 4·({show(a)})·({show(c)}) = {show(D)}"})
        fa = sp.factor(expr)
        if fa != expr:
            steps.append({"label": H["factor"], "text": f"{show(fa)} = 0"})
        steps.append({"label": H["qf"], "text": f"{show(v)} = (−b ± √D) / 2a = ({show(-b)} ± √({show(D)})) / {show(2 * a)}"})
    elif poly is not None and poly.degree() >= 3:
        fa = sp.factor(expr)
        if fa != expr:
            steps.append({"label": H["factor"], "text": f"{show(fa)} = 0"})
    sols = fc._run(lambda: sp.solve(sp.Eq(lhs, rhs), v))
    real = [s_ for s_ in sols if s_.is_real is not False]
    shown = [f"{show(v)} = {show(sp.nsimplify(s_) if s_.is_number else s_)}" + (f"  ≈ {float(sp.N(s_)):.6g}" if s_.is_number and s_.is_real and not s_.is_Integer else "")
             for s_ in real]
    cplx = [s_ for s_ in sols if s_.is_real is False]
    shown += [f"{show(v)} = {show(s_).replace('I', 'i')}  (complex)" for s_ in cplx]
    steps.append({"label": H["sols"] if len(shown) > 1 else H["sol"], "text": " ; ".join(shown) if shown else "—"})
    if real and all(s_.is_number for s_ in real):
        chk = [show(sp.nsimplify(lhs.subs(v, s_))) + " = " + show(sp.nsimplify(rhs.subs(v, s_))) for s_ in real[:2]]
        steps.append({"label": H["check"], "text": " ; ".join(chk)})
    out.update(kind="equation", variable=str(v), solutions=[float(sp.N(s_)) for s_ in real if s_.is_number],
               complex_solutions=[show(s_).replace("I", "i") for s_ in cplx])
    if v == x:
        out["plot"] = _plot_points(expr, x)
    return out


def _plot_points(fs, x, lo: float = -10, hi: float = 10, n: int = 401) -> dict:
    """Sample one or more functions of x on [lo, hi]; gaps (outside the domain, poles) are None."""
    import sympy as sp
    series = []
    for f in (fs if isinstance(fs, (list, tuple)) else [fs]):
        fn = sp.lambdify(x, f, "math")
        pts = []
        for i in range(n):
            xv = lo + (hi - lo) * i / (n - 1)
            try:
                yv = float(fn(xv))
                pts.append([round(xv, 4), round(yv, 5)] if math.isfinite(yv) and abs(yv) < 1e6 else [round(xv, 4), None])
            except (ValueError, ZeroDivisionError, OverflowError, TypeError):
                pts.append([round(xv, 4), None])
        series.append(pts)
    return {"x": [lo, hi], "series": series}
