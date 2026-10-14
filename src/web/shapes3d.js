/* 3D Model & Calculator for 2D/3D mensuration shapes.
 *
 * ShapeExplorer.mount(containerEl)  builds the panel (shape picker, Three.js viewer, inputs, results)
 * ShapeExplorer.show("cone")        switches to a shape (used after a detection)
 * ShapeExplorer.has("cone")         true when the shape is supported
 *
 * Changing any dimension rebuilds the model with the new proportions and recalculates
 * every formula with the substituted values. Drag to rotate, wheel to zoom, double-click to reset.
 */
(function () {
  "use strict";
  const PI = Math.PI, sqrt = Math.sqrt;

  function n(x) {                       // number formatting for substitutions and results
    if (!isFinite(x)) return "—";
    const a = Math.abs(x);
    if (a !== 0 && (a >= 1e7 || a < 1e-3)) return x.toExponential(3);
    return String(Number(x.toFixed(a < 10 ? 3 : 2)));
  }
  const sq = (v) => `${n(v)}²`, cu = (v) => `${n(v)}³`;

  // [label, formula, substitution, value, unit power]
  const SHAPES = {
    // ------------------------------------------------------------------ 3D
    cube: {
      name: "Cube", dim: "3D", params: [["a", "edge", 3]],
      build: (p) => [new THREE.BoxGeometry(p.a, p.a, p.a)],
      calc: (p) => [
        ["Volume", "V = a³", cu(p.a), p.a ** 3, 3],
        ["Total surface area", "TSA = 6a²", `6 × ${sq(p.a)}`, 6 * p.a ** 2, 2],
        ["Lateral surface area", "LSA = 4a²", `4 × ${sq(p.a)}`, 4 * p.a ** 2, 2],
        ["Space diagonal", "d = a√3", `${n(p.a)} × √3`, p.a * sqrt(3), 1]],
    },
    cuboid: {
      name: "Cuboid", dim: "3D", params: [["l", "length", 5], ["b", "breadth", 3], ["h", "height", 2]],
      build: (p) => [new THREE.BoxGeometry(p.l, p.h, p.b)],
      calc: (p) => [
        ["Volume", "V = l × b × h", `${n(p.l)} × ${n(p.b)} × ${n(p.h)}`, p.l * p.b * p.h, 3],
        ["Total surface area", "TSA = 2(lb + bh + hl)", `2(${n(p.l * p.b)} + ${n(p.b * p.h)} + ${n(p.h * p.l)})`,
          2 * (p.l * p.b + p.b * p.h + p.h * p.l), 2],
        ["Lateral surface area", "LSA = 2h(l + b)", `2 × ${n(p.h)} × (${n(p.l)} + ${n(p.b)})`, 2 * p.h * (p.l + p.b), 2],
        ["Space diagonal", "d = √(l² + b² + h²)", `√(${sq(p.l)} + ${sq(p.b)} + ${sq(p.h)})`, sqrt(p.l ** 2 + p.b ** 2 + p.h ** 2), 1]],
    },
    sphere: {
      name: "Sphere", dim: "3D", params: [["r", "radius", 3]],
      build: (p) => [new THREE.SphereGeometry(p.r, 64, 32)],
      calc: (p) => [
        ["Volume", "V = (4/3)πr³", `(4/3) × π × ${cu(p.r)}`, 4 / 3 * PI * p.r ** 3, 3],
        ["Surface area", "SA = 4πr²", `4 × π × ${sq(p.r)}`, 4 * PI * p.r ** 2, 2],
        ["Diameter", "d = 2r", `2 × ${n(p.r)}`, 2 * p.r, 1]],
    },
    hemisphere: {
      name: "Hemisphere", dim: "3D", params: [["r", "radius", 3]],
      build: (p) => {
        const dome = new THREE.SphereGeometry(p.r, 64, 24, 0, 2 * PI, 0, PI / 2);
        const base = new THREE.CircleGeometry(p.r, 64);
        base.rotateX(PI / 2);
        return [dome, base];
      },
      calc: (p) => [
        ["Volume", "V = (2/3)πr³", `(2/3) × π × ${cu(p.r)}`, 2 / 3 * PI * p.r ** 3, 3],
        ["Curved surface area", "CSA = 2πr²", `2 × π × ${sq(p.r)}`, 2 * PI * p.r ** 2, 2],
        ["Total surface area", "TSA = 3πr²", `3 × π × ${sq(p.r)}`, 3 * PI * p.r ** 2, 2]],
    },
    cylinder: {
      name: "Cylinder", dim: "3D", params: [["r", "radius", 2], ["h", "height", 5]],
      build: (p) => [new THREE.CylinderGeometry(p.r, p.r, p.h, 64)],
      calc: (p) => [
        ["Volume", "V = πr²h", `π × ${sq(p.r)} × ${n(p.h)}`, PI * p.r ** 2 * p.h, 3],
        ["Curved surface area", "CSA = 2πrh", `2 × π × ${n(p.r)} × ${n(p.h)}`, 2 * PI * p.r * p.h, 2],
        ["Total surface area", "TSA = 2πr(r + h)", `2 × π × ${n(p.r)} × (${n(p.r)} + ${n(p.h)})`, 2 * PI * p.r * (p.r + p.h), 2]],
    },
    cone: {
      name: "Right Circular Cone", dim: "3D", params: [["r", "base radius", 3], ["h", "height", 5]],
      build: (p) => [new THREE.ConeGeometry(p.r, p.h, 64)],
      calc: (p) => {
        const l = sqrt(p.r ** 2 + p.h ** 2);
        return [
          ["Volume", "V = (1/3)πr²h", `(1/3) × π × ${sq(p.r)} × ${n(p.h)}`, PI * p.r ** 2 * p.h / 3, 3],
          ["Slant height", "l = √(r² + h²)", `√(${sq(p.r)} + ${sq(p.h)})`, l, 1],
          ["Curved surface area", "CSA = πrl", `π × ${n(p.r)} × ${n(l)}`, PI * p.r * l, 2],
          ["Total surface area", "TSA = πr(l + r)", `π × ${n(p.r)} × (${n(l)} + ${n(p.r)})`, PI * p.r * (l + p.r), 2]];
      },
    },
    square_pyramid: {
      name: "Square Pyramid", dim: "3D", params: [["a", "base side", 4], ["h", "height", 5]],
      build: (p) => {
        const g = new THREE.ConeGeometry(p.a / sqrt(2), p.h, 4, 1);
        g.rotateY(PI / 4);
        return [g];
      },
      calc: (p) => {
        const l = sqrt(p.h ** 2 + (p.a / 2) ** 2);
        return [
          ["Volume", "V = (1/3)a²h", `(1/3) × ${sq(p.a)} × ${n(p.h)}`, p.a ** 2 * p.h / 3, 3],
          ["Slant height", "l = √(h² + (a/2)²)", `√(${sq(p.h)} + ${sq(p.a / 2)})`, l, 1],
          ["Lateral surface area", "LSA = 2al", `2 × ${n(p.a)} × ${n(l)}`, 2 * p.a * l, 2],
          ["Total surface area", "TSA = a² + 2al", `${sq(p.a)} + 2 × ${n(p.a)} × ${n(l)}`, p.a ** 2 + 2 * p.a * l, 2]];
      },
    },
    triangular_prism: {
      name: "Triangular Prism", dim: "3D", note: "Isosceles triangular cross-section.",
      params: [["b", "triangle base", 4], ["h", "triangle height", 3], ["L", "prism length", 6]],
      build: (p) => {
        const s = new THREE.Shape();
        s.moveTo(-p.b / 2, 0); s.lineTo(p.b / 2, 0); s.lineTo(0, p.h); s.closePath();
        return [new THREE.ExtrudeGeometry(s, { depth: p.L, bevelEnabled: false })];
      },
      calc: (p) => {
        const side = sqrt((p.b / 2) ** 2 + p.h ** 2), per = p.b + 2 * side, base = 0.5 * p.b * p.h;
        return [
          ["Volume", "V = (½ × b × h) × L", `(½ × ${n(p.b)} × ${n(p.h)}) × ${n(p.L)}`, base * p.L, 3],
          ["Sloping side", "s = √((b/2)² + h²)", `√(${sq(p.b / 2)} + ${sq(p.h)})`, side, 1],
          ["Lateral surface area", "LSA = (b + 2s) × L", `(${n(p.b)} + 2 × ${n(side)}) × ${n(p.L)}`, per * p.L, 2],
          ["Total surface area", "TSA = LSA + b × h", `${n(per * p.L)} + ${n(p.b)} × ${n(p.h)}`, per * p.L + p.b * p.h, 2]];
      },
    },
    // ------------------------------------------------------------------ 2D
    circle: {
      name: "Circle", dim: "2D", params: [["r", "radius", 3]],
      shape: (p) => { const s = new THREE.Shape(); s.absarc(0, 0, p.r, 0, 2 * PI, false); return s; },
      calc: (p) => [
        ["Area", "A = πr²", `π × ${sq(p.r)}`, PI * p.r ** 2, 2],
        ["Circumference", "C = 2πr", `2 × π × ${n(p.r)}`, 2 * PI * p.r, 1],
        ["Diameter", "d = 2r", `2 × ${n(p.r)}`, 2 * p.r, 1]],
    },
    semicircle: {
      name: "Semicircle", dim: "2D", params: [["r", "radius", 3]],
      shape: (p) => { const s = new THREE.Shape(); s.moveTo(p.r, 0); s.absarc(0, 0, p.r, 0, PI, false); s.lineTo(p.r, 0); return s; },
      calc: (p) => [
        ["Area", "A = ½πr²", `½ × π × ${sq(p.r)}`, PI * p.r ** 2 / 2, 2],
        ["Perimeter", "P = πr + 2r", `π × ${n(p.r)} + 2 × ${n(p.r)}`, PI * p.r + 2 * p.r, 1],
        ["Arc length", "L = πr", `π × ${n(p.r)}`, PI * p.r, 1]],
    },
    ellipse: {
      name: "Ellipse", dim: "2D", params: [["a", "semi-major axis", 4], ["b", "semi-minor axis", 2.5]],
      shape: (p) => { const s = new THREE.Shape(); s.absellipse(0, 0, p.a, p.b, 0, 2 * PI, false, 0); return s; },
      calc: (p) => [
        ["Area", "A = πab", `π × ${n(p.a)} × ${n(p.b)}`, PI * p.a * p.b, 2],
        ["Perimeter (Ramanujan)", "P ≈ π[3(a + b) − √((3a + b)(a + 3b))]", `π[3(${n(p.a + p.b)}) − √(${n(3 * p.a + p.b)} × ${n(p.a + 3 * p.b)})]`,
          PI * (3 * (p.a + p.b) - sqrt((3 * p.a + p.b) * (p.a + 3 * p.b))), 1]],
    },
    square: {
      name: "Square", dim: "2D", params: [["a", "side", 4]],
      shape: (p) => poly([[-p.a / 2, -p.a / 2], [p.a / 2, -p.a / 2], [p.a / 2, p.a / 2], [-p.a / 2, p.a / 2]]),
      calc: (p) => [
        ["Area", "A = a²", sq(p.a), p.a ** 2, 2],
        ["Perimeter", "P = 4a", `4 × ${n(p.a)}`, 4 * p.a, 1],
        ["Diagonal", "d = a√2", `${n(p.a)} × √2`, p.a * sqrt(2), 1]],
    },
    rectangle: {
      name: "Rectangle", dim: "2D", params: [["l", "length", 6], ["b", "breadth", 3.5]],
      shape: (p) => poly([[-p.l / 2, -p.b / 2], [p.l / 2, -p.b / 2], [p.l / 2, p.b / 2], [-p.l / 2, p.b / 2]]),
      calc: (p) => [
        ["Area", "A = l × b", `${n(p.l)} × ${n(p.b)}`, p.l * p.b, 2],
        ["Perimeter", "P = 2(l + b)", `2 × (${n(p.l)} + ${n(p.b)})`, 2 * (p.l + p.b), 1],
        ["Diagonal", "d = √(l² + b²)", `√(${sq(p.l)} + ${sq(p.b)})`, sqrt(p.l ** 2 + p.b ** 2), 1]],
    },
    triangle: {
      name: "Triangle", dim: "2D", note: "Sides a, b, c with b as the base.",
      params: [["a", "left side", 5], ["b", "base", 6], ["c", "right side", 5]],
      check: (p) => (p.a + p.b > p.c && p.a + p.c > p.b && p.b + p.c > p.a) ? null
        : "These sides cannot form a triangle: each side must be shorter than the sum of the other two.",
      shape: (p) => {
        const x = (p.a ** 2 - p.c ** 2 + p.b ** 2) / (2 * p.b), y = sqrt(Math.max(p.a ** 2 - x ** 2, 0));
        return poly([[-p.b / 2, 0], [p.b / 2, 0], [x - p.b / 2, y]]);
      },
      calc: (p) => {
        const s = (p.a + p.b + p.c) / 2, A = sqrt(s * (s - p.a) * (s - p.b) * (s - p.c));
        return [
          ["Semi-perimeter", "s = (a + b + c) / 2", `(${n(p.a)} + ${n(p.b)} + ${n(p.c)}) / 2`, s, 1],
          ["Area (Heron)", "A = √(s(s − a)(s − b)(s − c))", `√(${n(s)} × ${n(s - p.a)} × ${n(s - p.b)} × ${n(s - p.c)})`, A, 2],
          ["Perimeter", "P = a + b + c", `${n(p.a)} + ${n(p.b)} + ${n(p.c)}`, 2 * s, 1],
          ["Height on base b", "h = 2A / b", `2 × ${n(A)} / ${n(p.b)}`, 2 * A / p.b, 1]];
      },
    },
    rhombus: {
      name: "Rhombus", dim: "2D", params: [["d1", "horizontal diagonal", 4], ["d2", "vertical diagonal", 6]],
      shape: (p) => poly([[0, p.d2 / 2], [p.d1 / 2, 0], [0, -p.d2 / 2], [-p.d1 / 2, 0]]),
      calc: (p) => {
        const a = 0.5 * sqrt(p.d1 ** 2 + p.d2 ** 2);
        return [
          ["Area", "A = ½ × d₁ × d₂", `½ × ${n(p.d1)} × ${n(p.d2)}`, p.d1 * p.d2 / 2, 2],
          ["Side", "a = ½√(d₁² + d₂²)", `½ × √(${sq(p.d1)} + ${sq(p.d2)})`, a, 1],
          ["Perimeter", "P = 4a", `4 × ${n(a)}`, 4 * a, 1]];
      },
    },
    parallelogram: {
      name: "Parallelogram", dim: "2D", params: [["b", "base", 6], ["a", "slant side", 3.5], ["h", "height", 3]],
      check: (p) => p.a >= p.h ? null : "The slant side a cannot be shorter than the height h.",
      shape: (p) => {
        const o = sqrt(Math.max(p.a ** 2 - p.h ** 2, 0));
        return poly([[-p.b / 2 - o / 2, -p.h / 2], [p.b / 2 - o / 2, -p.h / 2], [p.b / 2 + o / 2, p.h / 2], [-p.b / 2 + o / 2, p.h / 2]]);
      },
      calc: (p) => [
        ["Area", "A = b × h", `${n(p.b)} × ${n(p.h)}`, p.b * p.h, 2],
        ["Perimeter", "P = 2(a + b)", `2 × (${n(p.a)} + ${n(p.b)})`, 2 * (p.a + p.b), 1]],
    },
    trapezium: {
      name: "Trapezium", dim: "2D", note: "Isosceles trapezium.",
      params: [["a", "bottom parallel side", 7], ["b", "top parallel side", 4], ["h", "height", 3]],
      shape: (p) => poly([[-p.a / 2, -p.h / 2], [p.a / 2, -p.h / 2], [p.b / 2, p.h / 2], [-p.b / 2, p.h / 2]]),
      calc: (p) => {
        const leg = sqrt(((p.a - p.b) / 2) ** 2 + p.h ** 2);
        return [
          ["Area", "A = ½(a + b) × h", `½ × (${n(p.a)} + ${n(p.b)}) × ${n(p.h)}`, (p.a + p.b) * p.h / 2, 2],
          ["Slant side", "c = √(((a − b)/2)² + h²)", `√(${sq((p.a - p.b) / 2)} + ${sq(p.h)})`, leg, 1],
          ["Perimeter", "P = a + b + 2c", `${n(p.a)} + ${n(p.b)} + 2 × ${n(leg)}`, p.a + p.b + 2 * leg, 1]];
      },
    },
    pentagon: {
      name: "Regular Pentagon", dim: "2D", params: [["a", "side", 4]],
      shape: (p) => regular(5, p.a),
      calc: (p) => [
        ["Area", "A = ¼√(5(5 + 2√5)) a²", `1.7205 × ${sq(p.a)}`, 0.25 * sqrt(5 * (5 + 2 * sqrt(5))) * p.a ** 2, 2],
        ["Perimeter", "P = 5a", `5 × ${n(p.a)}`, 5 * p.a, 1]],
    },
    hexagon: {
      name: "Regular Hexagon", dim: "2D", params: [["a", "side", 4]],
      shape: (p) => regular(6, p.a),
      calc: (p) => [
        ["Area", "A = (3√3 / 2) a²", `2.5981 × ${sq(p.a)}`, 1.5 * sqrt(3) * p.a ** 2, 2],
        ["Perimeter", "P = 6a", `6 × ${n(p.a)}`, 6 * p.a, 1]],
    },
  };

  // Curved solids get a silhouette outline; these construction lines are drawn like a textbook figure
  // (inside the solid -> dashed in transparent mode). Coordinates match each shape's build() geometry.
  const CURVED = new Set(["sphere", "hemisphere", "cylinder", "cone"]);
  const ring = (r, y, k = 72) => [...Array(k)].map((_, i) => {
    const a = 2 * PI * i / k, b = 2 * PI * (i + 1) / k;
    return [[r * Math.cos(a), y, r * Math.sin(a)], [r * Math.cos(b), y, r * Math.sin(b)]];
  });
  const GUIDES = {
    sphere: (p) => [...ring(p.r, 0), [[0, 0, 0], [p.r, 0, 0]]],
    hemisphere: (p) => [[[0, 0, 0], [p.r, 0, 0]], [[0, 0, 0], [0, p.r, 0]]],
    cylinder: (p) => [[[0, -p.h / 2, 0], [0, p.h / 2, 0]], [[0, p.h / 2, 0], [p.r, p.h / 2, 0]]],
    cone: (p) => [[[0, -p.h / 2, 0], [0, p.h / 2, 0]], [[0, -p.h / 2, 0], [p.r, -p.h / 2, 0]], [[0, p.h / 2, 0], [p.r, -p.h / 2, 0]]],
    square_pyramid: (p) => [[[0, -p.h / 2, 0], [0, p.h / 2, 0]]],
    triangular_prism: (p) => [[[0, 0, p.L], [0, p.h, p.L]]],
    // 2D helper lines (drawn dashed on the flat shape)
    circle: (p) => [[[0, 0, 0], [p.r, 0, 0]]],
    semicircle: (p) => [[[0, 0, 0], [0, p.r, 0]]],
    ellipse: (p) => [[[0, 0, 0], [p.a, 0, 0]], [[0, 0, 0], [0, p.b, 0]]],
    rhombus: (p) => [[[-p.d1 / 2, 0, 0], [p.d1 / 2, 0, 0]], [[0, -p.d2 / 2, 0], [0, p.d2 / 2, 0]]],
    parallelogram: (p) => { const o = sqrt(Math.max(p.a ** 2 - p.h ** 2, 0)); const x = -p.b / 2 + o / 2; return [[[x, p.h / 2, 0], [x, -p.h / 2, 0]]]; },
    trapezium: (p) => [[[0, -p.h / 2, 0], [0, p.h / 2, 0]]],
  };

  // Dimension labels: [symbol, value, point on the figure in the same coordinates as build()/shape()]
  const LABELS = {
    cube: (p) => [["a", p.a, [0, -p.a / 2, p.a / 2]]],
    cuboid: (p) => [["l", p.l, [0, -p.h / 2, p.b / 2]], ["b", p.b, [p.l / 2, -p.h / 2, 0]], ["h", p.h, [-p.l / 2, 0, p.b / 2]]],
    sphere: (p) => [["r", p.r, [p.r / 2, 0, 0]]],
    hemisphere: (p) => [["r", p.r, [p.r / 2, 0, 0]]],
    cylinder: (p) => [["r", p.r, [p.r / 2, p.h / 2, 0]], ["h", p.h, [0, 0, 0]]],
    cone: (p) => [["r", p.r, [p.r / 2, -p.h / 2, 0]], ["h", p.h, [0, p.h / 6, 0]],
      ["l", sqrt(p.r ** 2 + p.h ** 2), [p.r / 2, 0, 0]]],
    square_pyramid: (p) => [["a", p.a, [0, -p.h / 2, p.a / 2]], ["h", p.h, [0, 0, 0]]],
    triangular_prism: (p) => [["b", p.b, [0, 0, p.L]], ["h", p.h, [0, p.h / 2, p.L]], ["L", p.L, [p.b / 2, 0, p.L / 2]]],
    circle: (p) => [["r", p.r, [p.r / 2, 0, 0]]],
    semicircle: (p) => [["r", p.r, [0, p.r / 2, 0]]],
    ellipse: (p) => [["a", p.a, [p.a / 2, 0, 0]], ["b", p.b, [0, p.b / 2, 0]]],
    square: (p) => [["a", p.a, [0, -p.a / 2, 0]]],
    rectangle: (p) => [["l", p.l, [0, -p.b / 2, 0]], ["b", p.b, [p.l / 2, 0, 0]]],
    triangle: (p) => {
      const x = (p.a ** 2 - p.c ** 2 + p.b ** 2) / (2 * p.b) - p.b / 2, y = sqrt(Math.max(p.a ** 2 - (x + p.b / 2) ** 2, 0));
      return [["b", p.b, [0, 0, 0]], ["a", p.a, [(x - p.b / 2) / 2, y / 2, 0]], ["c", p.c, [(x + p.b / 2) / 2, y / 2, 0]]];
    },
    rhombus: (p) => [["d₁", p.d1, [p.d1 / 4, 0, 0]], ["d₂", p.d2, [0, p.d2 / 4, 0]]],
    parallelogram: (p) => {
      const o = sqrt(Math.max(p.a ** 2 - p.h ** 2, 0));
      return [["b", p.b, [-o / 2, -p.h / 2, 0]], ["a", p.a, [p.b / 2, 0, 0]], ["h", p.h, [-p.b / 2 + o / 2, 0, 0]]];
    },
    trapezium: (p) => [["a", p.a, [0, -p.h / 2, 0]], ["b", p.b, [0, p.h / 2, 0]], ["h", p.h, [0, 0, 0]]],
    pentagon: (p) => [["a", p.a, [0, -p.a / (2 * Math.tan(PI / 5)), 0]]],
    hexagon: (p) => [["a", p.a, [p.a * sqrt(3) / 2, 0, 0]]],   // vertex on top -> right side is vertical
  };
  // ---------------------------------------------------------------- corners, diagonals, user lines
  // Corner coordinates match each build()/shape() geometry exactly (textbook lettering).
  const LETTERS = "ABCDEFGHIJKLMNOP";
  const LINE_COLOR = 0xf59e0b;
  const box = (l, hh, b) => [[-l / 2, -hh / 2, b / 2], [l / 2, -hh / 2, b / 2], [l / 2, -hh / 2, -b / 2], [-l / 2, -hh / 2, -b / 2],
    [-l / 2, hh / 2, b / 2], [l / 2, hh / 2, b / 2], [l / 2, hh / 2, -b / 2], [-l / 2, hh / 2, -b / 2]];   // ABCD bottom, EFGH top
  const VERTS = {
    cube: (p) => box(p.a, p.a, p.a),
    cuboid: (p) => box(p.l, p.h, p.b),
    square_pyramid: (p) => [[-p.a / 2, -p.h / 2, p.a / 2], [p.a / 2, -p.h / 2, p.a / 2], [p.a / 2, -p.h / 2, -p.a / 2],
      [-p.a / 2, -p.h / 2, -p.a / 2], [0, p.h / 2, 0]],                                                   // ABCD base, E apex
    triangular_prism: (p) => [[-p.b / 2, 0, p.L], [p.b / 2, 0, p.L], [0, p.h, p.L], [-p.b / 2, 0, 0], [p.b / 2, 0, 0], [0, p.h, 0]],  // ABC front, DEF back
  };
  const POLY2D = new Set(["square", "rectangle", "triangle", "rhombus", "parallelogram", "trapezium", "pentagon", "hexagon"]);
  const quadDiags = (faces) => faces.flatMap(([a, b, c, d]) => [[a, c], [b, d]]);
  const PRESETS = {
    cube: [{ name: "Face diagonals", pairs: quadDiags([[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) },
      { name: "Space diagonals", pairs: [[0, 6], [1, 7], [2, 4], [3, 5]] }],
    square_pyramid: [{ name: "Base diagonals", pairs: [[0, 2], [1, 3]] }],
    triangular_prism: [{ name: "Face diagonals", pairs: quadDiags([[0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]]) }],
  };
  PRESETS.cuboid = PRESETS.cube;
  function polygonDiagonals(k) {
    const out = [];
    for (let i = 0; i < k; i++) for (let j = i + 2; j < k; j++) if (!(i === 0 && j === k - 1)) out.push([i, j]);
    return out;
  }
  function vertsOf(key, p) {
    if (!p) return null;
    if (VERTS[key]) return VERTS[key](p);
    if (!POLY2D.has(key)) return null;
    const pts = SHAPES[key].shape(p).getPoints(1).filter((q, i, a) => i === 0 || Math.hypot(q.x - a[i - 1].x, q.y - a[i - 1].y) > 1e-9);
    if (pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-9) pts.pop();
    return pts.map((q) => [q.x, q.y, 0]);
  }
  const presetsFor = (key, V) => PRESETS[key] || (V && SHAPES[key].dim === "2D" && V.length > 3 ? [{ name: "All diagonals", pairs: polygonDiagonals(V.length) }] : []);
  const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  function segmentsGeometry(segs) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(segs.flat(2), 3));
    return g;
  }

  function poly(pts) {
    const s = new THREE.Shape();
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    return s;
  }
  function regular(k, side) {
    const R = side / (2 * Math.sin(PI / k));
    return poly([...Array(k)].map((_, i) => [R * Math.cos(PI / 2 + 2 * PI * i / k), R * Math.sin(PI / 2 + 2 * PI * i / k)]));
  }

  // ====================================================================== panel
  const state = { key: "cube", values: {}, unit: "cm", rotX: 0.45, rotY: -0.6, zoom: 1, auto: false, transparent: true };
  state.showLabels = true;
  state.lines = {};     // shape key -> [[i, j], ...] user/preset lines between corners
  state.pick = null;    // first corner chosen when drawing a line by clicking
  try { if (localStorage.getItem("iav-xp-transparent") === "0") state.transparent = false; } catch (_) {}
  try { if (localStorage.getItem("iav-xp-labels") === "0") state.showLabels = false; } catch (_) {}
  let ui = null, three = null;

  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    kids.flat(Infinity).forEach((c) => c != null && e.append(c.nodeType ? c : document.createTextNode(String(c))));
    return e;
  }

  function mount(container) {
    const select = h("select", { id: "xpShape", "aria-label": "Shape" },
      h("optgroup", { label: "3D solids" }, Object.entries(SHAPES).filter(([, s]) => s.dim === "3D").map(([k, s]) => h("option", { value: k }, s.name))),
      h("optgroup", { label: "2D shapes" }, Object.entries(SHAPES).filter(([, s]) => s.dim === "2D").map(([k, s]) => h("option", { value: k }, s.name))));
    const unit = h("select", { id: "xpUnit", "aria-label": "Unit" }, ["cm", "m", "mm", "in", "units"].map((u) => h("option", { value: u }, u)));
    const autoBtn = h("button", { class: "btn small", type: "button", "aria-pressed": "false" }, "Auto-rotate");
    const seeBtn = h("button", { class: "btn small" + (state.transparent ? " on" : ""), type: "button",
      "aria-pressed": String(state.transparent), title: "See-through faces with dashed hidden edges" }, "Transparent");
    const labelBtn = h("button", { class: "btn small" + (state.showLabels ? " on" : ""), type: "button",
      "aria-pressed": String(state.showLabels), title: "Show dimension values on the model" }, "Labels");
    labelBtn.onclick = () => {
      state.showLabels = !state.showLabels;
      labelBtn.classList.toggle("on", state.showLabels);
      labelBtn.setAttribute("aria-pressed", String(state.showLabels));
      try { localStorage.setItem("iav-xp-labels", state.showLabels ? "1" : "0"); } catch (_) {}
      kick();
    };
    seeBtn.onclick = () => {
      state.transparent = !state.transparent;
      seeBtn.classList.toggle("on", state.transparent);
      seeBtn.setAttribute("aria-pressed", String(state.transparent));
      try { localStorage.setItem("iav-xp-transparent", state.transparent ? "1" : "0"); } catch (_) {}
      update();
    };
    const resetBtn = h("button", { class: "btn small", type: "button" }, "Reset view");
    // "Big view": the model takes the full card width and most of the screen height; the table moves below
    let big = false;
    try { big = localStorage.getItem("iav-xp-big") === "1"; } catch (_) {}
    const bigBtn = h("button", { class: "btn small" + (big ? " on" : ""), type: "button", "aria-pressed": String(big),
      title: "Show the 3D model across the full width" }, "⛶ Big view");
    container.classList.toggle("xp-big", big);
    bigBtn.onclick = () => {
      big = !big;
      container.classList.toggle("xp-big", big);
      bigBtn.classList.toggle("on", big);
      bigBtn.setAttribute("aria-pressed", String(big));
      try { localStorage.setItem("iav-xp-big", big ? "1" : "0"); } catch (_) {}
      resize(); kick();
    };
    const canvasWrap = h("div", { class: "xp-canvas", tabindex: "0", role: "img", "aria-label": "3D model. Drag or use arrow keys to rotate." });
    const params = h("div", { class: "xp-params" });
    const results = h("div", { class: "xp-results" });
    const lines = h("div", { class: "xp-lines" });
    container.replaceChildren(
      h("div", { class: "xp-head" },
        h("h2", {}, "3D Model & Calculator"), h("span", { class: "badge", id: "xpDim" }, ""),
        h("span", { class: "spacer" }), select, unit, labelBtn, seeBtn, autoBtn, resetBtn, bigBtn),
      h("div", { class: "xp-body" },
        h("div", {}, canvasWrap, h("p", { class: "hint" }, "Drag to rotate · scroll to zoom · double-click to reset · arrow keys rotate when focused")),
        h("div", {}, params, results, lines)));
    const labels = h("div", { class: "xp-labels", "aria-hidden": "true" });
    canvasWrap.append(labels);
    ui = { root: container, select, unit, autoBtn, resetBtn, canvasWrap, params, results, lines, labels, dim: container.querySelector("#xpDim") };

    select.onchange = () => show(select.value);
    unit.onchange = () => { state.unit = unit.value; renderResults(); renderLines(); kick(); };
    autoBtn.onclick = () => { state.auto = !state.auto; autoBtn.setAttribute("aria-pressed", String(state.auto));
      autoBtn.classList.toggle("on", state.auto); kick(); };
    resetBtn.onclick = resetView;
    initThree();
    show(state.key);
  }

  function resetView() {
    const is2d = SHAPES[state.key].dim === "2D";
    state.rotX = is2d ? 0 : 0.45; state.rotY = is2d ? 0 : -0.6; state.zoom = 1;
    kick();
  }

  // ---------------------------------------------------------------- Three.js
  function initThree() {
    if (typeof THREE === "undefined") {
      ui.canvasWrap.append(h("div", { class: "msg warn" }, "3D library failed to load; the calculator still works."));
      return;
    }
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch (e) {
      ui.canvasWrap.append(h("div", { class: "msg warn" }, "WebGL is not available in this browser; the calculator still works."));
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    ui.canvasWrap.append(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 5000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(4, 8, 6);
    scene.add(sun);
    const pivot = new THREE.Group();
    scene.add(pivot);
    three = { renderer, scene, camera, pivot, objects: [], radius: 1, dirty: true };

    // pointer rotation
    const el = renderer.domElement;
    let drag = null, down = null, lastPick = 0;
    el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; down = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      state.rotY += (e.clientX - drag.x) * 0.01;
      state.rotX = Math.max(-PI / 2, Math.min(PI / 2, state.rotX + (e.clientY - drag.y) * 0.01));
      drag = { x: e.clientX, y: e.clientY };
      kick();
    });
    const end = () => { drag = null; down = null; };
    el.addEventListener("pointerup", (e) => {
      // a click (no drag) near a corner picks it; two corners make a line
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && pickCorner(e.clientX, e.clientY)) lastPick = Date.now();
      end();
    });
    el.addEventListener("pointercancel", end);
    el.addEventListener("wheel", (e) => { e.preventDefault(); state.zoom = Math.max(0.35, Math.min(4, state.zoom * (e.deltaY > 0 ? 1.1 : 0.9))); kick(); }, { passive: false });
    el.addEventListener("dblclick", () => { if (Date.now() - lastPick > 700) resetView(); });
    ui.canvasWrap.addEventListener("keydown", (e) => {
      const step = 0.12, keys = { ArrowLeft: [0, -step], ArrowRight: [0, step], ArrowUp: [-step, 0], ArrowDown: [step, 0] };
      if (keys[e.key]) { e.preventDefault(); state.rotX += keys[e.key][0]; state.rotY += keys[e.key][1]; kick(); }
      if (e.key === "+" || e.key === "=") { state.zoom = Math.max(0.35, state.zoom * 0.9); kick(); }
      if (e.key === "-") { state.zoom = Math.min(4, state.zoom * 1.1); kick(); }
    });
    new ResizeObserver(() => { resize(); kick(); }).observe(ui.canvasWrap);
    resize();
    loop();
  }

  function pickCorner(clientX, clientY) {
    const V = vertsOf(state.key, state.values[state.key]);
    if (!V || !three || !three.model) return false;
    const r = three.renderer.domElement.getBoundingClientRect();
    let best = -1, bestD = 16;   // px tolerance
    V.forEach((v, i) => {
      const q = new THREE.Vector3(...v).applyMatrix4(three.model.matrixWorld).project(three.camera);
      const d = Math.hypot((q.x + 1) / 2 * r.width - (clientX - r.left), (1 - q.y) / 2 * r.height - (clientY - r.top));
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0) {
      if (state.pick !== null) { state.pick = null; update(); }
      return false;
    }
    if (state.pick === null) state.pick = best;
    else if (state.pick === best) state.pick = null;
    else { addLine(state.pick, best); state.pick = null; }
    update();
    return true;
  }

  function addLine(i, j) {
    if (i === j) return;
    const list = state.lines[state.key] || (state.lines[state.key] = []);
    const [a, b] = i < j ? [i, j] : [j, i];
    if (!list.some(([x, y]) => x === a && y === b)) list.push([a, b]);
  }

  function renderLines() {
    const key = state.key, p = state.values[key], V = vertsOf(key, p);
    if (!V) {
      ui.lines.replaceChildren(...(SHAPES[key].dim === "3D"
        ? [h("p", { class: "hint" }, "Diagonals and corner-to-corner lines are available for shapes with corners (cube, cuboid, pyramid, prism, polygons).")]
        : []));
      return;
    }
    const list = state.lines[key] || (state.lines[key] = []);
    const has = (a, b) => list.some(([x, y]) => x === Math.min(a, b) && y === Math.max(a, b));
    const presets = presetsFor(key, V).map((pr) => {
      const on = pr.pairs.every(([a, b]) => has(a, b));
      return h("button", { class: "btn small" + (on ? " on" : ""), type: "button", "aria-pressed": String(on), onclick: () => {
        if (on) state.lines[key] = list.filter(([x, y]) => !pr.pairs.some(([a, b]) => Math.min(a, b) === x && Math.max(a, b) === y));
        else pr.pairs.forEach(([a, b]) => addLine(a, b));
        update();
      } }, pr.name);
    });
    const opts = () => V.map((_, i) => h("option", { value: String(i) }, LETTERS[i]));
    const from = h("select", { "aria-label": "Line from corner" }, opts()), to = h("select", { "aria-label": "Line to corner" }, opts());
    to.value = String(Math.min(2, V.length - 1));
    const sup = (v) => `${n(Math.abs(v))}²`;
    const rows = list.map(([i, j]) => {
      const d = V[i].map((c, k) => V[j][k] - c).filter((c) => Math.abs(c) > 1e-9);
      return h("tr", {},
        h("td", { class: "f" }, `${LETTERS[i]}${LETTERS[j]}`),
        h("td", { class: "w" }, d.length > 1 ? `= √(${d.map(sup).join(" + ")})` : ""),
        h("td", { class: "res" }, `${n(dist3(V[i], V[j]))} ${state.unit}`),
        h("td", {}, h("button", { class: "xp-x", type: "button", "aria-label": `Remove line ${LETTERS[i]}${LETTERS[j]}`,
          onclick: () => { state.lines[key] = list.filter(([x, y]) => !(x === i && y === j)); update(); } }, "×")));
    });
    ui.lines.replaceChildren(...[
      h("div", { class: "xp-lines-head" }, h("b", {}, "Lines & diagonals"), presets),
      h("div", { class: "row xp-draw" }, h("span", {}, "Draw"), from, h("span", {}, "to"), to,
        h("button", { class: "btn small", type: "button", onclick: () => { addLine(+from.value, +to.value); update(); } }, "Add line"),
        list.length ? h("button", { class: "btn small", type: "button", onclick: () => { state.lines[key] = []; state.pick = null; update(); } }, "Clear") : null),
      h("p", { class: "hint" }, state.pick !== null ? `Corner ${LETTERS[state.pick]} selected — click another corner to draw the line.`
        : "Or click two corners on the model."),
      rows.length ? h("div", { class: "table-wrap" }, h("table", { class: "xp-table" }, h("tbody", {}, rows))) : null].filter(Boolean));
  }

  function resize() {
    if (!three) return;
    const w = ui.canvasWrap.clientWidth || 400;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const big = ui.root.classList.contains("xp-big");
    const hgt = big ? clamp(Math.round(w * 0.6), 460, Math.max(460, Math.round(innerHeight * 0.78)))
                    : clamp(Math.round(w * 0.82), 380, Math.max(380, Math.round(innerHeight * 0.72)));
    three.renderer.setSize(w, hgt, false);
    three.renderer.domElement.style.width = "100%";
    three.renderer.domElement.style.height = hgt + "px";
    three.camera.aspect = w / hgt;
    three.camera.updateProjectionMatrix();
  }

  function kick() { if (three) three.dirty = true; }

  function loop() {
    requestAnimationFrame(loop);
    if (!three) return;
    if (state.auto) { state.rotY += 0.01; three.dirty = true; }
    if (!three.dirty) return;
    three.dirty = false;
    three.pivot.rotation.set(state.rotX, state.rotY, 0);
    const dist = three.radius / Math.sin((three.camera.fov * PI / 180) / 2) * 1.15 * state.zoom;
    three.camera.position.set(0, 0, dist);
    three.camera.lookAt(0, 0, 0);
    three.renderer.render(three.scene, three.camera);
    placeLabels();
  }

  // ---------------------------------------------------------------- dimension labels (HTML overlay)
  function placeLabels() {
    const layer = ui.labels;
    if (!layer) return;
    const p = state.values[state.key];
    if (!three.model || !p) { layer.replaceChildren(); return; }
    const items = [];   // [text, point, css class, nudge px]
    if (state.showLabels && LABELS[state.key]) {
      LABELS[state.key](p).forEach(([sym, value, pt]) => items.push([`${sym} = ${n(value)} ${state.unit}`, pt, "xp-label", 14]));
    }
    const V = vertsOf(state.key, p);
    if (V) {
      V.forEach((v, i) => items.push([LETTERS[i], v, "xp-vtx" + (state.pick === i ? " sel" : ""), 13]));
      const ls = state.lines[state.key] || [];
      // many lines: lengths stay in the list below the model so the figure stays readable
      if (ls.length <= 6) ls.forEach(([i, j]) => items.push([`${LETTERS[i]}${LETTERS[j]} = ${n(dist3(V[i], V[j]))} ${state.unit}`,
        V[i].map((c, k) => (c + V[j][k]) / 2), "xp-label xp-len", 4]));
    }
    const w = three.renderer.domElement.clientWidth, hgt = three.renderer.domElement.clientHeight;
    const toScreen = (v) => { v.project(three.camera); return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * hgt]; };
    const centre = toScreen(new THREE.Vector3().setFromMatrixPosition(three.model.matrixWorld));
    while (layer.children.length < items.length) layer.append(h("span", {}));
    while (layer.children.length > items.length) layer.lastChild.remove();
    items.forEach(([text, pt, cls, nudge], i) => {
      const [x, y] = toScreen(new THREE.Vector3(...pt).applyMatrix4(three.model.matrixWorld));
      // nudge away from the model centre so the label sits beside its line / corner rather than on it
      const dx = x - centre[0], dy = y - centre[1], len = Math.hypot(dx, dy) || 1;
      const el = layer.children[i];
      el.className = cls;
      el.textContent = text;
      el.style.left = `${x + dx / len * nudge}px`;
      el.style.top = `${y + dy / len * nudge}px`;
    });
  }

  function themeColor(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    try { return new THREE.Color(v || fallback); } catch (_) { return new THREE.Color(fallback); }
  }

  function rebuild(def, p) {
    if (!three) return;
    three.objects.forEach((o) => { three.pivot.remove(o); o.traverse((c) => { c.geometry && c.geometry.dispose(); c.material && c.material.dispose(); }); });
    three.objects = [];
    const color = themeColor("--accent", "#1f6feb"), ink = themeColor("--ink", "#1c2430");
    const group = new THREE.Group();
    if (def.dim === "3D") {
      const see = state.transparent;
      const curved = CURVED.has(state.key);
      const geoms = def.build(p);
      const off = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
      // line sets: sharp edges of every part + textbook construction lines (radius, height, equator)
      const lineSets = geoms.map((g) => new THREE.EdgesGeometry(g, 25));
      if (GUIDES[state.key]) lineSets.push(segmentsGeometry(GUIDES[state.key](p)));
      const span = Math.max(...def.params.map(([s]) => p[s]));

      geoms.forEach((g, i) => {
        if (see) {
          // invisible depth pre-pass: lines behind the front surface fail the depth test
          const depth = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, side: THREE.FrontSide, ...off }));
          depth.renderOrder = 0;
          // tinted see-through faces (stronger tint for curved solids, which have no edges to read)
          const faces = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.45, transparent: true,
            opacity: curved ? 0.42 : 0.3, depthWrite: false, side: THREE.DoubleSide, ...off }));
          faces.renderOrder = 2;
          group.add(depth, faces);
        } else {
          group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05,
            side: THREE.DoubleSide, ...off })));
        }
        if (curved && i === 0) {
          // silhouette outline: slightly larger back-face shell, visible only around the rim
          const hull = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: ink, side: THREE.BackSide, transparent: see }));
          hull.scale.setScalar(1.025);
          hull.renderOrder = 1;
          group.add(hull);
        }
      });
      lineSets.forEach((lines) => {
        // front lines solid (depth-tested)
        const front = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: ink, transparent: see }));
        front.renderOrder = 1;
        group.add(front);
        if (see) {
          // every line dashed on top: parts not covered by a solid line read as hidden lines
          const hidden = new THREE.LineSegments(lines, new THREE.LineDashedMaterial({ color: ink, dashSize: span * 0.04,
            gapSize: span * 0.03, transparent: true, opacity: 0.75, depthTest: false }));
          hidden.computeLineDistances();
          hidden.renderOrder = 3;
          group.add(hidden);
        }
      });
    } else {
      const shape = def.shape(p);
      group.add(new THREE.Mesh(new THREE.ShapeGeometry(shape, 64),
        new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide })));
      const pts = shape.getPoints(96).map((q) => new THREE.Vector3(q.x, q.y, 0.001));
      group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: ink })));
      if (GUIDES[state.key]) {   // radius / diagonal / height helper lines
        const span = Math.max(...def.params.map(([s]) => p[s]));
        const guide = new THREE.LineSegments(segmentsGeometry(GUIDES[state.key](p).map((s) => s.map(([x, y]) => [x, y, 0.002]))),
          new THREE.LineDashedMaterial({ color: ink, dashSize: span * 0.04, gapSize: span * 0.03 }));
        guide.computeLineDistances();
        group.add(guide);
      }
    }
    // corners + user / preset lines (always drawn on top so diagonals inside the solid stay visible)
    const V = vertsOf(state.key, p);
    if (V) {
      const ls = state.lines[state.key] || [];
      if (ls.length) {
        const ln = new THREE.LineSegments(segmentsGeometry(ls.map(([i, j]) => [V[i], V[j]])),
          new THREE.LineBasicMaterial({ color: LINE_COLOR, depthTest: false, transparent: true }));
        ln.renderOrder = 6;
        group.add(ln);
      }
      const dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints(V.map((v) => new THREE.Vector3(...v))),
        new THREE.PointsMaterial({ color: ink, size: 7, sizeAttenuation: false, depthTest: false, transparent: true }));
      dots.renderOrder = 7;
      group.add(dots);
      if (state.pick !== null && V[state.pick]) {
        const sel = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...V[state.pick])]),
          new THREE.PointsMaterial({ color: LINE_COLOR, size: 14, sizeAttenuation: false, depthTest: false, transparent: true }));
        sel.renderOrder = 8;
        group.add(sel);
      }
    }
    three.model = group;
    // centre the model on the pivot
    const box = new THREE.Box3().setFromObject(group), centre = box.getCenter(new THREE.Vector3());
    group.position.sub(centre);
    const size = box.getSize(new THREE.Vector3());
    three.radius = Math.max(size.length() / 2, 0.01);
    // 1-unit grid so size changes stay visible even though the camera re-frames the model
    const extent = Math.max(2, Math.ceil(Math.max(size.x, size.y, size.z) * 1.6));
    const span = extent % 2 ? extent + 1 : extent;
    const grid = new THREE.GridHelper(span, span, ink.clone().lerp(new THREE.Color(0x888888), 0.4), new THREE.Color(0x9aa7b4));
    grid.material.transparent = true;
    grid.material.opacity = 0.45;
    grid.renderOrder = -1;   // drawn first so it stays visible through a transparent model
    if (def.dim === "3D") grid.position.y = -size.y / 2;
    else { grid.rotation.x = PI / 2; grid.position.z = -0.01; }
    three.pivot.add(group, grid);
    three.objects = [group, grid];
    kick();
  }

  // ---------------------------------------------------------------- inputs & results
  function show(key) {
    if (!SHAPES[key] || !ui) return false;
    const def = SHAPES[key];
    const changed = key !== state.key;
    if (changed) state.pick = null;
    state.key = key;
    ui.select.value = key;
    ui.dim.textContent = def.dim;
    ui.dim.className = "badge" + (def.dim === "3D" ? " d3" : "");
    if (!state.values[key]) state.values[key] = Object.fromEntries(def.params.map(([s, , v]) => [s, v]));
    if (changed || !three || !three.objects.length) resetView();
    ui.params.replaceChildren(...[
      ...def.params.map(([sym, label]) => {
        const id = `xp_${key}_${sym}`;
        const val = state.values[key][sym];
        const num = h("input", { type: "number", id, min: "0.01", step: "0.1", value: String(val) });
        const rng = h("input", { type: "range", min: "0.1", max: String(Math.max(20, val * 2)), step: "0.1", value: String(val), "aria-label": `${sym} slider` });
        const set = (v, from) => {
          state.values[key][sym] = v;
          if (from !== num) num.value = String(v);
          if (from !== rng) { if (v > Number(rng.max)) rng.max = String(Math.ceil(v * 1.5)); rng.value = String(v); }
          update();
        };
        num.addEventListener("input", () => { const v = parseFloat(num.value); if (v > 0) set(v, num); else update(); });
        rng.addEventListener("input", () => set(parseFloat(rng.value), rng));
        return h("div", { class: "xp-param" },
          h("label", { for: id }, h("b", {}, sym), ` — ${label}`), h("div", { class: "row" }, num, rng));
      }),
      def.note ? h("p", { class: "hint" }, def.note) : null].filter(Boolean));  // native API would print null
    update();
    return true;
  }

  function update() {
    const def = SHAPES[state.key], p = state.values[state.key];
    const bad = def.params.find(([s]) => !(p[s] > 0));
    const err = bad ? `${bad[0]} must be greater than 0.` : (def.check ? def.check(p) : null);
    if (err) { ui.results.replaceChildren(h("div", { class: "msg err", role: "alert" }, err)); return; }
    rebuild(def, p);
    renderResults();
    renderLines();
  }

  function renderResults() {
    const def = SHAPES[state.key], p = state.values[state.key];
    if (def.params.some(([s]) => !(p[s] > 0)) || (def.check && def.check(p))) return;
    const sup = { 1: "", 2: "²", 3: "³" };
    ui.results.replaceChildren(h("div", { class: "table-wrap" }, h("table", { class: "xp-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Quantity"), h("th", {}, "Formula"), h("th", {}, "Working"), h("th", {}, "Result"))),
      h("tbody", {}, def.calc(p).map(([label, formula, subst, value, pow]) => h("tr", {},
        h("td", {}, label), h("td", { class: "f" }, formula), h("td", { class: "w" }, `= ${subst}`),
        h("td", { class: "res" }, `${n(value)} ${state.unit}${sup[pow] || ""}`)))))));
  }

  window.ShapeExplorer = { mount, show, has: (k) => !!SHAPES[k], shapes: SHAPES };
})();
