/* Built-in calculator on each Learn formula page (tools/build_seo_pages.py writes the .qcalc box with the formula's
   letters). Choose the letter to find, type the others, and the site's calculator API solves it step by step — the same
   engine as the Formula Library. Works with keyboard only (a real form: Tab between fields, Enter calculates). */
(function () {
  "use strict";
  const el = (tag, props, ...kids) => {
    const n = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => (k.startsWith("on") ? n.addEventListener(k.slice(2), v) : n.setAttribute(k, v)));
    kids.flat().forEach((c) => c != null && n.append(c));
    return n;
  };
  document.querySelectorAll(".qcalc").forEach((box, n) => {
    const vars = JSON.parse(box.dataset.vars || "[]"), T = JSON.parse(box.dataset.t || "{}");
    let target = box.dataset.target || (vars[0] && vars[0].s);
    const form = el("form", { class: "qc-form", novalidate: "" });
    const chips = el("div", { class: "qc-chips", role: "radiogroup", "aria-label": T.solve_for });
    const fields = el("div", { class: "qc-fields" });
    const out = el("div", { class: "qc-out", "aria-live": "polite" });
    const render = () => {
      chips.replaceChildren(el("span", { class: "qc-lbl" }, T.solve_for + ":"), ...vars.map((v) => el("button", {
        type: "button", class: "qc-chip", role: "radio", "aria-checked": String(v.s === target), title: v.l || v.d,
        onclick: () => { target = v.s; render(); out.replaceChildren(); },
      }, v.d)));
      fields.replaceChildren(...vars.filter((v) => v.s !== target).map((v) => {
        const id = `qc${n}-${v.s.replace(/\W/g, "_")}`;
        return el("label", { class: "qc-field", for: id }, el("span", {}, `${v.d}${v.a ? " (°)" : ""}`, el("small", {}, v.l || "")),
          el("input", { id, name: v.s, inputmode: "decimal", autocomplete: "off", required: "" }));
      }));
    };
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const values = {};
      for (const inp of fields.querySelectorAll("input")) {
        const x = Number(String(inp.value).replace(/,/g, ""));
        if (inp.value.trim() === "" || !Number.isFinite(x)) { out.replaceChildren(el("p", { class: "qc-err" }, T.fill)); inp.focus(); return; }
        values[inp.name] = x;
      }
      out.replaceChildren(el("p", {}, "…"));
      try {
        const r = await fetch("/api/v1/formulas/calc/solve", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: box.dataset.cat, section: box.dataset.sec, index: Number(box.dataset.idx),
                                 solve_for: target, values, lang: box.dataset.lang, angle_unit: "deg" }) });
        const b = await r.json();
        if (!b.success) { out.replaceChildren(el("p", { class: "qc-err" }, (b.error && b.error.errorContent) || T.err)); return; }
        out.replaceChildren(el("ol", { class: "steps" }, b.data.steps.map((s) => el("li", {}, el("b", {}, s.label + ": "), el("span", { class: "f" }, s.text)))),
          el("p", { class: "big" }, `${T.answer}: ${b.message}`));
      } catch (_) { out.replaceChildren(el("p", { class: "qc-err" }, T.err)); }
    });
    render();
    form.append(chips, fields, el("button", { type: "submit", class: "cta qc-go" }, T.go));
    box.replaceChildren(form, out);
  });
})();
