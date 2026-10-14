/* Safe maths-expression parser and evaluator (no eval / new Function).
 *
 *   const e = MathExpr.parse("2x^2 - 3sin(x) + a");   // throws MathExpr.ParseError on bad input
 *   e.vars        -> Set {"x", "a"}                    // free variables (x, y, z and parameters)
 *   e.fn({x: 1, a: 2})  -> number                      // evaluate
 *
 * Supports: + - * / ^, unary minus, implicit multiplication (2x, 3(x+1), (x)(y), 2sin(x), ab = a*b),
 * |x| for abs, n! factorial, π / pi / e, ² ³, × ÷ −, functions sin cos tan sec csc cot asin acos atan
 * sinh cosh tanh sqrt cbrt abs ln log log2 log10 exp floor ceil round sign min max.
 * Trig uses degrees when scope.__deg is true.
 */
(function () {
  "use strict";

  class ParseError extends Error {}

  const FUNCS = {
    sin: 1, cos: 1, tan: 1, sec: 1, csc: 1, cot: 1, asin: 1, acos: 1, atan: 1, arcsin: 1, arccos: 1, arctan: 1,
    sinh: 1, cosh: 1, tanh: 1, sqrt: 1, cbrt: 1, abs: 1, ln: 1, log: 1, log2: 1, log10: 1, exp: 1,
    floor: 1, ceil: 1, round: 1, sign: 1, min: 2, max: 2,
  };
  const CONSTS = { pi: Math.PI, e: Math.E };
  const NAMES = [...Object.keys(FUNCS), ...Object.keys(CONSTS)].sort((a, b) => b.length - a.length);

  function normalise(src) {
    return String(src)
      .replace(/π/g, "pi").replace(/θ/g, "t").replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-")
      .replace(/²/g, "^2").replace(/³/g, "^3").replace(/\*\*/g, "^");
  }

  function tokenize(src) {
    const s = normalise(src), out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
        if (!m) throw new ParseError(`Bad number near "${s.slice(i, i + 6)}"`);
        out.push({ t: "num", v: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      if (/[A-Za-z]/.test(c)) {
        const rest = s.slice(i).toLowerCase();
        const name = NAMES.find((n) => rest.startsWith(n));   // longest function/constant name first
        if (name && FUNCS[name]) { out.push({ t: "fn", v: name }); i += name.length; continue; }
        if (name && CONSTS[name] !== undefined) { out.push({ t: "num", v: CONSTS[name], c: name }); i += name.length; continue; }
        // single-letter variable, optionally followed by digits as a subscript (a1, x2)
        const m = /^[A-Za-z]\d*/.exec(s.slice(i));
        out.push({ t: "var", v: m[0] });
        i += m[0].length;
        continue;
      }
      if ("+-*/^(),|!".includes(c)) { out.push({ t: c }); i++; continue; }
      throw new ParseError(`Unexpected character "${c}"`);
    }
    return out;
  }

  function parse(src) {
    const toks = tokenize(src);
    if (!toks.length) throw new ParseError("Empty expression");
    let pos = 0;
    const peek = () => toks[pos], take = () => toks[pos++];
    const expect = (t) => { if (!peek() || peek().t !== t) throw new ParseError(`Expected "${t}"`); return take(); };
    const startsPrimary = (tk) => tk && (tk.t === "num" || tk.t === "var" || tk.t === "fn" || tk.t === "(");

    function expr() {
      let node = term();
      while (peek() && (peek().t === "+" || peek().t === "-")) {
        const op = take().t;
        node = { k: "bin", op, a: node, b: term() };
      }
      return node;
    }
    function term() {
      let node = unary();
      for (;;) {
        const tk = peek();
        if (tk && (tk.t === "*" || tk.t === "/")) { take(); node = { k: "bin", op: tk.t, a: node, b: unary() }; }
        else if (startsPrimary(tk)) node = { k: "bin", op: "*", a: node, b: power() };   // implicit multiplication
        else return node;
      }
    }
    function unary() {
      const tk = peek();
      if (tk && tk.t === "-") { take(); return { k: "neg", a: unary() }; }
      if (tk && tk.t === "+") { take(); return unary(); }
      return power();
    }
    function power() {
      const base = postfix();
      if (peek() && peek().t === "^") { take(); return { k: "bin", op: "^", a: base, b: unary() }; }
      return base;
    }
    function postfix() {
      let node = primary();
      while (peek() && peek().t === "!") { take(); node = { k: "fact", a: node }; }
      return node;
    }
    function primary() {
      const tk = take();
      if (!tk) throw new ParseError("Expression ends too early");
      if (tk.t === "num") return { k: "num", v: tk.v };
      if (tk.t === "var") return { k: "var", v: tk.v };
      if (tk.t === "(") { const e = expr(); expect(")"); return e; }
      if (tk.t === "|") { const e = expr(); expect("|"); return { k: "call", f: "abs", args: [e] }; }
      if (tk.t === "fn") {
        const args = [];
        if (peek() && peek().t === "(") {
          take();
          args.push(expr());
          while (peek() && peek().t === ",") { take(); args.push(expr()); }
          expect(")");
        } else {
          args.push(power());                      // sin x, sin 2x -> sin(x), sin(2)*x
        }
        if (args.length !== FUNCS[tk.v]) throw new ParseError(`${tk.v}() takes ${FUNCS[tk.v]} argument(s)`);
        return { k: "call", f: tk.v, args };
      }
      throw new ParseError(`Unexpected "${tk.t}"`);
    }

    const ast = expr();
    if (pos < toks.length) throw new ParseError(`Unexpected "${toks[pos].t === "var" ? toks[pos].v : toks[pos].t}"`);
    const vars = new Set();
    (function walk(n) {
      if (n.k === "var") vars.add(n.v);
      ["a", "b"].forEach((k) => n[k] && walk(n[k]));
      (n.args || []).forEach(walk);
    })(ast);
    return { ast, vars, fn: compile(ast) };
  }

  function fact(n) {
    if (n < 0 || !Number.isInteger(n)) return NaN;
    let r = 1;
    for (let i = 2; i <= n && r < Infinity; i++) r *= i;
    return r;
  }

  function compile(n) {
    switch (n.k) {
      case "num": { const v = n.v; return () => v; }
      case "var": { const v = n.v; return (s) => (s[v] === undefined ? NaN : s[v]); }
      case "neg": { const a = compile(n.a); return (s) => -a(s); }
      case "fact": { const a = compile(n.a); return (s) => fact(a(s)); }
      case "bin": {
        const a = compile(n.a), b = compile(n.b);
        switch (n.op) {
          case "+": return (s) => a(s) + b(s);
          case "-": return (s) => a(s) - b(s);
          case "*": return (s) => a(s) * b(s);
          case "/": return (s) => a(s) / b(s);
          case "^": return (s) => {
            const x = a(s), y = b(s);
            if (x < 0 && !Number.isInteger(y)) {          // real odd roots: (-8)^(1/3) = -2
              const inv = 1 / y, r = Math.round(inv);
              if (Math.abs(inv - r) < 1e-9 && r % 2 !== 0) return -Math.pow(-x, y);
            }
            return Math.pow(x, y);
          };
        }
        break;
      }
      case "call": {
        const args = n.args.map(compile), f = n.f;
        const ang = (s, v) => (s.__deg ? v * Math.PI / 180 : v);
        const inv = (s, v) => (s.__deg ? v * 180 / Math.PI : v);
        const a0 = args[0], a1 = args[1];
        switch (f) {
          case "sin": return (s) => Math.sin(ang(s, a0(s)));
          case "cos": return (s) => Math.cos(ang(s, a0(s)));
          case "tan": return (s) => Math.tan(ang(s, a0(s)));
          case "sec": return (s) => 1 / Math.cos(ang(s, a0(s)));
          case "csc": return (s) => 1 / Math.sin(ang(s, a0(s)));
          case "cot": return (s) => 1 / Math.tan(ang(s, a0(s)));
          case "asin": case "arcsin": return (s) => inv(s, Math.asin(a0(s)));
          case "acos": case "arccos": return (s) => inv(s, Math.acos(a0(s)));
          case "atan": case "arctan": return (s) => inv(s, Math.atan(a0(s)));
          case "ln": return (s) => Math.log(a0(s));
          case "log": case "log10": return (s) => Math.log10(a0(s));
          case "log2": return (s) => Math.log2(a0(s));
          case "min": return (s) => Math.min(a0(s), a1(s));
          case "max": return (s) => Math.max(a0(s), a1(s));
          default: { const m = Math[f]; return (s) => m(a0(s)); }   // sinh cosh tanh sqrt cbrt abs exp floor ceil round sign
        }
      }
    }
    throw new ParseError("Cannot compile expression");
  }

  window.MathExpr = { parse, ParseError, FUNCS };
})();
