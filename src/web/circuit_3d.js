/* Quantix Circuit Lab — 3D PCB view (three.js, vendored as window.THREE).
   One grid unit = 2.54 mm (the 0.1" pitch of real boards). Grid (x, y) maps to three (x, 0, y); the board's top is y = 0.
       const pcb = CircuitPCB3D.create(container);
       pcb.setCircuit(circuit);           // rebuild the board
       pcb.update(infos, sim);            // every frame: LEDs glow, lamps light, the motor spins, meters read
*/
(function () {
  "use strict";
  const THREE = window.THREE;
  const CS = window.CircuitSim;

  // ------------------------------------------------------------------ small helpers
  const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.55, metalness: 0.05 }, o || {}));
  const M = {
    board: mat(0x0b6b37, { roughness: 0.7 }), boardEdge: mat(0xc9b98a, { roughness: 0.9 }), copper: mat(0xe6a556, { metalness: 0.35, roughness: 0.4, emissive: 0x3a2000, emissiveIntensity: 0.25 }),
    pad: mat(0xf2f3f5, { metalness: 0.4, roughness: 0.3 }), lead: mat(0xdfe2e7, { metalness: 0.4, roughness: 0.35 }), black: mat(0x18191d, { roughness: 0.45 }),
    hole: mat(0x050505), white: mat(0xf2f2ee), steel: mat(0xcfd4db, { metalness: 0.45, roughness: 0.3 }), gold: mat(0xe0b84a, { metalness: 0.45, roughness: 0.35 }),
  };
  function box(w, hgt, d, m, x, y, z) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), m); o.position.set(x || 0, y || 0, z || 0); return o; }
  function cyl(r1, r2, len, m, seg) { return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg || 24), m); }
  // a cylinder between two points (used for component legs)
  function rod(a, b, r, m) {
    const va = new THREE.Vector3(a[0], a[1], a[2]), vb = new THREE.Vector3(b[0], b[1], b[2]), len = va.distanceTo(vb);
    const o = cyl(r, r, len, m, 8);
    o.position.copy(va).add(vb).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    return o;
  }
  function leg(g, pts, r) { for (let k = 0; k + 1 < pts.length; k++) g.add(rod(pts[k], pts[k + 1], r || 0.06, M.lead)); }
  // leg from a pin pad (px, pz) to a point under the body (bx, by, bz)
  function pinLeg(g, px, pz, bx, by, bz, r) { leg(g, [[px, 0.02, pz], [px, 0.22, pz], [bx, 0.22, bz], [bx, by, bz]], r); }

  function textCanvas(lines, opts) {
    opts = opts || {};
    const c = document.createElement("canvas"), g = c.getContext("2d");
    const size = opts.size || 64;
    g.font = (opts.weight || "700") + " " + size + "px " + (opts.font || "JetBrains Mono, Consolas, monospace");
    const w = Math.max.apply(null, lines.map((l) => g.measureText(l).width)) + size * 0.6;
    c.width = Math.ceil(w); c.height = Math.ceil(lines.length * size * 1.15 + size * 0.3);
    g.font = (opts.weight || "700") + " " + size + "px " + (opts.font || "JetBrains Mono, Consolas, monospace");
    if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, c.width, c.height); }
    g.fillStyle = opts.color || "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle";
    lines.forEach((l, k) => g.fillText(l, c.width / 2, size * 0.15 + size * 1.15 * (k + 0.5)));
    return c;
  }
  // flat text printed on a surface (silkscreen, chip markings)
  function printed(lines, height, opts) {
    const c = textCanvas(lines, opts), tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(height * c.width / c.height, height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  let haloTex = null;
  function halo(colour) {
    if (!haloTex) {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); haloTex = new THREE.CanvasTexture(c);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: colour, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    s.scale.set(3, 3, 1);
    return s;
  }

  // resistor colour code
  const BAND = ["#111111", "#7a4a1d", "#d42020", "#f08a10", "#f5d90a", "#1e9e3a", "#1f5fd6", "#8a3fd1", "#8d8d8d", "#f4f4f4"];
  function bands(R, tol) {
    if (!(R > 0)) return [BAND[0], BAND[0], BAND[0], "#d4af37"];
    let e = Math.floor(Math.log10(R)) - 1;
    let sig = Math.round(R / Math.pow(10, e));
    if (sig >= 100) { sig = Math.round(sig / 10); e += 1; }
    const d1 = Math.floor(sig / 10), d2 = sig % 10;
    const mult = e >= 0 && e <= 9 ? BAND[e] : e === -1 ? "#d4af37" : e === -2 ? "#c0c0c0" : BAND[0];
    const tc = { 1: "#7a4a1d", 2: "#d42020", 5: "#d4af37", 10: "#c0c0c0" }[tol] || "#d4af37";
    return [BAND[d1], BAND[d2], mult, tc];
  }

  // ------------------------------------------------------------------ component models (local frame: rotation 0)
  // Each returns a THREE.Group; g.userData holds live bits (glow material, halo, rotor, segments, screen).
  function axial(g, color, len, r, h) {   // body lying along x between pins at (±2, 0)
    const body = cyl(r, r, len, mat(color, { roughness: 0.5 }), 24); body.rotation.z = Math.PI / 2; body.position.y = h; g.add(body);
    leg(g, [[-2, 0.02, 0], [-2, h, 0], [-len / 2, h, 0]]); leg(g, [[2, 0.02, 0], [2, h, 0], [len / 2, h, 0]]);
    return body;
  }
  const BUILD = {
    resistor(g, p) {
      const h = 0.42, body = axial(g, 0xd8bf8a, 1.6, 0.3, h);
      const caps = [-0.72, 0.72].map((x) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), body.material); s.scale.set(0.6, 1, 1); s.position.set(x, h, 0); return s; });
      caps.forEach((c) => g.add(c));
      bands(+p.p.R, +p.p.tol).forEach((col, k) => {
        const b = cyl(0.312, 0.312, 0.12, mat(col, { roughness: 0.4 }), 24); b.rotation.z = Math.PI / 2; b.position.set(-0.55 + k * 0.32 + (k === 3 ? 0.15 : 0), h, 0); g.add(b);
      });
      g.userData.body = body.material;
    },
    pot(g) {
      g.add(box(2.0, 0.7, 1.6, mat(0x1c5fcf), 0, 0.45, -0.6));
      const knob = cyl(0.55, 0.55, 0.35, M.white); knob.position.set(0, 0.97, -0.6); g.add(knob);
      g.add(box(0.8, 0.08, 0.12, M.black, 0, 1.16, -0.6)); g.userData.knob = knob;
      pinLeg(g, -2, 0, -0.7, 0.2, 0.1); pinLeg(g, 2, 0, 0.7, 0.2, 0.1); pinLeg(g, 0, -2, 0, 0.2, -1.3);
    },
    ldr(g) {
      const d = cyl(0.42, 0.42, 0.14, mat(0xd47a1f)); d.rotation.x = Math.PI / 2; d.position.set(0, 1.0, 0); g.add(d);
      for (let k = 0; k < 4; k++) g.add(box(0.5, 0.04, 0.05, mat(0x2a1a0a), 0, 1.0 + 0.24 - k * 0.16, 0.075));
      pinLeg(g, -2, 0, -0.2, 0.6, 0); pinLeg(g, 2, 0, 0.2, 0.6, 0);
    },
    ntc(g) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), mat(0x1e1e22)); b.scale.set(1, 1.2, 0.6); b.position.set(0, 0.9, 0); g.add(b); pinLeg(g, -2, 0, -0.12, 0.6, 0); pinLeg(g, 2, 0, 0.12, 0.6, 0); },
    capacitor(g) {
      const d = cyl(0.6, 0.6, 0.26, mat(0xe0a034, { roughness: 0.35 })); d.rotation.x = Math.PI / 2; d.position.set(0, 1.0, 0); g.add(d);
      pinLeg(g, -2, 0, -0.25, 0.5, 0); pinLeg(g, 2, 0, 0.25, 0.5, 0);
    },
    electrolytic(g, p) {
      const big = +p.p.C >= 470e-6, r = big ? 0.85 : 0.62, hh = big ? 2.0 : 1.5;
      const can = cyl(r, r, hh, mat(0x1f3c8c, { roughness: 0.35 })); can.position.set(0, 0.3 + hh / 2, 0); g.add(can);
      const top = cyl(r * 0.97, r * 0.97, 0.03, M.steel); top.position.set(0, 0.3 + hh + 0.01, 0); g.add(top);
      g.add(box(0.05, 0.02, r * 1.5, M.black, 0, 0.3 + hh + 0.03, 0)); g.add(box(r * 1.5, 0.02, 0.05, M.black, 0, 0.3 + hh + 0.03, 0));
      const stripe = cyl(r * 1.005, r * 1.005, hh * 0.98, mat(0xd8dde8), 24); stripe.position.copy(can.position);   // − stripe facing pin 2
      stripe.geometry = new THREE.CylinderGeometry(r * 1.01, r * 1.01, hh * 0.98, 12, 1, true, Math.PI * 0.35, Math.PI * 0.3); g.add(stripe);
      pinLeg(g, -2, 0, -0.3, 0.3, 0); pinLeg(g, 2, 0, 0.3, 0.3, 0);
    },
    inductor(g) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.3, 14, 32), mat(0xb8661f, { metalness: 0.7, roughness: 0.35 })); t.position.set(0, 1.15, 0); g.add(t);
      const core = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.2, 10, 32), mat(0x2b2b2b)); core.position.copy(t.position); g.add(core);
      pinLeg(g, -2, 0, -0.6, 0.6, 0); pinLeg(g, 2, 0, 0.6, 0.6, 0);
    },
    transformer(g) {
      g.add(box(3.0, 2.4, 2.6, mat(0x3a3d44, { metalness: 0.5, roughness: 0.4 }), 0, 1.3, 0));
      for (let k = 0; k < 9; k++) g.add(box(3.04, 0.02, 2.64, mat(0x55585f, { metalness: 0.6 }), 0, 0.2 + k * 0.27, 0));
      const w = box(1.6, 2.5, 2.7, mat(0xc8742a, { metalness: 0.6, roughness: 0.35 }), 0, 1.3, 0); g.add(w);
      const lab = printed(["19:1"], 0.55, { color: "#ffffff" }); lab.position.set(0, 2.56, 0); g.add(lab); g.userData.label = lab;
      [[-2, -2], [-2, 2], [2, -2], [2, 2]].forEach(([x, z]) => pinLeg(g, x, z, x * 0.6, 0.2, z * 0.5));
    },
    diode(g, p, kind) {
      const glass = kind === "zener";
      const body = axial(g, glass ? 0xf08a30 : 0x1a1a1c, 1.1, 0.24, 0.35);
      if (glass) { body.material.transparent = true; body.material.opacity = 0.75; }
      const band = cyl(0.25, 0.25, 0.16, glass ? M.black : M.steel, 24); band.rotation.z = Math.PI / 2; band.position.set(0.38, 0.35, 0); g.add(band);
    },
    led(g, p) {
      const col = new THREE.Color(CS.LED_RGB[p.p.color] || "#ff3030");
      const m = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.05, transparent: true, opacity: 0.88, roughness: 0.15 });
      const base = cyl(0.36, 0.36, 0.12, m); base.position.set(0, 0.86, 0); g.add(base);
      const body = cyl(0.3, 0.3, 0.55, m); body.position.set(0, 1.18, 0); g.add(body);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.position.set(0, 1.45, 0); g.add(dome);
      pinLeg(g, -2, 0, -0.12, 0.8, 0, 0.05); pinLeg(g, 2, 0, 0.12, 0.8, 0, 0.05);
      const s = halo(col); s.position.set(0, 1.3, 0); g.add(s);
      g.userData.glow = m; g.userData.halo = s; g.userData.haloSize = 3.2;
    },
    to92(g, p, pins, mark) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1.0, 24, 1, false, -Math.PI / 2, Math.PI), M.black); b.position.set(-0.2, 0.95, 0); g.add(b);
      g.add(box(0.02, 1.0, 0.96, M.black, -0.2, 0.95, 0));
      const lab = printed([mark], 0.18, { color: "#d0d0d0" }); lab.rotation.set(0, -Math.PI / 2, 0); lab.position.set(-0.225, 1.0, 0); g.add(lab);
      pins.forEach(([px, pz], k) => pinLeg(g, px, pz, -0.2, 0.45, -0.32 + k * 0.32, 0.045));
    },
    to220(g, p, pins, mark) {
      g.add(box(1.0, 1.0, 0.45, M.black, 0, 1.1, 0));
      const tab = box(1.0, 0.75, 0.08, M.steel, 0, 1.95, -0.18); g.add(tab);
      const hole = cyl(0.16, 0.16, 0.1, M.hole); hole.rotation.x = Math.PI / 2; hole.position.set(0, 2.0, -0.18); g.add(hole);
      const lab = printed([mark], 0.2, { color: "#e0e0e0" }); lab.rotation.set(0, 0, 0); lab.position.set(0, 1.15, 0.23); g.add(lab);
      pins.forEach(([px, pz], k) => pinLeg(g, px, pz, -0.32 + k * 0.32, 0.6, 0, 0.05));
    },
    dip(g, p, pins, mark, n) {
      const len = n === 14 ? 2.0 : 1.3;
      g.add(box(len, 0.42, 0.85, M.black, 0, 0.62, 0));
      const dot = cyl(0.07, 0.07, 0.02, mat(0x444444)); dot.position.set(-len / 2 + 0.2, 0.84, 0.25); g.add(dot);
      const lab = printed([mark], 0.2, { color: "#e8e8e8" }); lab.position.set(0, 0.84, -0.05); g.add(lab);
      for (let k = 0; k < n / 2; k++) { const x = -len / 2 + 0.15 + k * (len - 0.3) / (n / 2 - 1 || 1); [-0.48, 0.48].forEach((z) => g.add(box(0.1, 0.4, 0.06, M.lead, x, 0.42, z))); }
      pins.forEach(([px, pz]) => leg(g, [[px, 0.02, pz], [px, 0.24, pz], [Math.max(-len / 2, Math.min(len / 2, px * 0.3)), 0.24, Math.max(-0.48, Math.min(0.48, pz))]], 0.045));
    },
    battery(g, p) {
      const cell = cyl(0.62, 0.62, 3.0, mat(0x1d1f24, { roughness: 0.35 })); cell.rotation.x = Math.PI / 2; cell.position.set(0, 0.75, 0); g.add(cell);
      const top = cyl(0.63, 0.63, 0.7, M.gold); top.rotation.x = Math.PI / 2; top.position.set(0, 0.75, -1.15); g.add(top);
      const nub = cyl(0.2, 0.2, 0.15, M.steel); nub.rotation.x = Math.PI / 2; nub.position.set(0, 0.75, -1.58); g.add(nub);
      const lab = printed([CS.fmt(+p.p.V, "V")], 0.42, { color: "#ffffff" }); lab.position.set(0, 1.38, 0.3); g.add(lab);
      g.add(box(1.5, 0.12, 3.6, mat(0x111111), 0, 0.08, 0));
      leg(g, [[0, 0.02, -2], [0, 0.6, -2], [0, 0.75, -1.65]], 0.07); leg(g, [[0, 0.02, 2], [0, 0.6, 2], [0, 0.75, 1.5]], 0.07);
    },
    terminal(g, p, colour, text) {
      g.add(box(1.4, 1.0, 4.6, mat(colour, { roughness: 0.5 }), 0, 0.55, 0));
      [-2, 2].forEach((z) => { const s = cyl(0.36, 0.36, 0.08, M.steel); s.position.set(0, 1.08, z); g.add(s); g.add(box(0.5, 0.04, 0.08, M.black, 0, 1.13, z)); });
      const lab = printed(text, 0.38, { color: "#ffffff" }); lab.rotation.set(-Math.PI / 2, 0, Math.PI / 2); lab.position.set(0, 1.07, 0); g.add(lab);
      const plus = printed(["+"], 0.5, { color: "#ff6060" }); plus.position.set(1.0, 0.02, -2); g.add(plus);
    },
    ground(g) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 8, 20), M.steel); ring.position.set(0, 0.55, 0); g.add(ring);
      leg(g, [[-0.28, 0.02, 0], [-0.28, 0.55, 0]], 0.05); leg(g, [[0.28, 0.02, 0], [0.28, 0.55, 0]], 0.05);
      const lab = printed(["GND"], 0.36, { color: "#ffffff" }); lab.position.set(0, 0.02, 0.9); g.add(lab);
    },
    switch(g, p) {
      g.add(box(1.8, 0.6, 1.0, M.black, 0, 0.4, 0));
      const lever = cyl(0.1, 0.12, 0.9, M.steel, 12); lever.position.set(0, 1.05, 0); lever.rotation.z = p.p.on === true ? -0.5 : 0.5; g.add(lever);
      g.userData.lever = lever;
      pinLeg(g, -2, 0, -0.7, 0.2, 0); pinLeg(g, 2, 0, 0.7, 0.2, 0);
    },
    button(g, p) {
      g.add(box(1.3, 0.45, 1.3, M.black, 0, 0.3, 0));
      const cap = cyl(0.42, 0.42, 0.35, mat(0xd62f2f, { roughness: 0.4 })); cap.position.set(0, p.p.on === true ? 0.62 : 0.72, 0); g.add(cap);
      g.userData.cap = cap;
      pinLeg(g, -2, 0, -0.55, 0.15, 0); pinLeg(g, 2, 0, 0.55, 0.15, 0);
    },
    spdt(g, p) {
      g.add(box(1.4, 0.55, 2.4, mat(0x2a2d33), 0, 0.4, 0));
      const k = box(0.4, 0.35, 0.45, M.steel, 0, 0.85, p.p.pos === "B" ? 0.45 : -0.45); g.add(k); g.userData.slider = k;
      pinLeg(g, -2, 0, -0.5, 0.15, 0); pinLeg(g, 2, -1, 0.5, 0.15, -0.6); pinLeg(g, 2, 1, 0.5, 0.15, 0.6);
    },
    relay(g) {
      g.add(box(4.2, 2.0, 3.0, mat(0x1d5bd8, { roughness: 0.4 }), 0, 1.1, 0));
      const lab = printed(["RELAY", "5VDC  10A"], 0.5, { color: "#ffffff" }); lab.position.set(0, 2.11, 0); g.add(lab);
      [[-3, -2], [-3, 2], [3, 2], [3, -2], [3, 0]].forEach(([x, z]) => pinLeg(g, x, z, x * 0.6, 0.1, z * 0.6));
    },
    fuse(g) {
      const glass = cyl(0.3, 0.3, 1.5, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.05 })); glass.rotation.z = Math.PI / 2; glass.position.set(0, 0.55, 0); g.add(glass);
      [-0.85, 0.85].forEach((x) => { const c = cyl(0.32, 0.32, 0.35, M.steel); c.rotation.z = Math.PI / 2; c.position.set(x, 0.55, 0); g.add(c); });
      const wire = cyl(0.025, 0.025, 1.4, mat(0x999999, { metalness: 0.8 })); wire.rotation.z = Math.PI / 2; wire.position.set(0, 0.55, 0); g.add(wire);
      g.userData.wire = wire;
      leg(g, [[-2, 0.02, 0], [-2, 0.55, 0], [-1.0, 0.55, 0]], 0.07); leg(g, [[2, 0.02, 0], [2, 0.55, 0], [1.0, 0.55, 0]], 0.07);
    },
    lamp(g) {
      const base = cyl(0.42, 0.42, 0.6, M.steel); base.position.set(0, 0.6, 0); g.add(base);
      const m = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffc840, emissiveIntensity: 0, transparent: true, opacity: 0.45, roughness: 0.05 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.8, 24, 18), m); bulb.position.set(0, 1.55, 0); g.add(bulb);
      const fil = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x553311, emissive: 0xffaa20, emissiveIntensity: 0 })); fil.position.set(0, 1.45, 0); g.add(fil);
      const s = halo(0xffd060); s.position.set(0, 1.55, 0); g.add(s);
      g.userData.glow = m; g.userData.fil = fil.material; g.userData.halo = s; g.userData.haloSize = 6;
      pinLeg(g, -2, 0, -0.2, 0.3, 0); pinLeg(g, 2, 0, 0.2, 0.3, 0);
    },
    motor(g) {
      const can = cyl(0.9, 0.9, 2.0, M.steel); can.rotation.z = Math.PI / 2; can.position.set(-0.2, 1.0, 0); g.add(can);
      const end = cyl(0.92, 0.92, 0.25, mat(0x222222)); end.rotation.z = Math.PI / 2; end.position.set(-1.25, 1.0, 0); g.add(end);
      const shaft = cyl(0.07, 0.07, 0.8, M.steel); shaft.rotation.z = Math.PI / 2; shaft.position.set(1.15, 1.0, 0); g.add(shaft);
      const rotor = new THREE.Group(); rotor.position.set(1.55, 1.0, 0);
      for (let k = 0; k < 3; k++) { const b = box(0.06, 1.1, 0.32, mat(0xff8a1c)); b.position.y = 0.45; const arm = new THREE.Group(); arm.add(b); arm.rotation.x = k * Math.PI * 2 / 3; rotor.add(arm); }
      g.add(rotor); g.userData.rotor = rotor;
      g.add(box(1.6, 0.3, 1.2, mat(0x333333), -0.2, 0.15, 0));
      pinLeg(g, -2, 0, -1.3, 0.6, 0.3); pinLeg(g, 2, 0, -1.3, 0.6, -0.3);
    },
    buzzer(g) {
      const b = cyl(0.7, 0.7, 0.7, M.black); b.position.set(0, 0.55, 0); g.add(b);
      const hole = cyl(0.15, 0.15, 0.02, M.hole); hole.position.set(0, 0.91, 0); g.add(hole);
      const s = halo(0x66ccff); s.position.set(0, 1.2, 0); g.add(s); g.userData.halo = s; g.userData.haloSize = 3; g.userData.buzz = true;
      pinLeg(g, -2, 0, -0.3, 0.2, 0); pinLeg(g, 2, 0, 0.3, 0.2, 0);
    },
    seg7(g) {
      g.add(box(4.6, 0.7, 5.4, mat(0x111214), 0, 0.5, -0.4));
      const segs = [[0, -2.2, 1.5, 0.28], [0.95, -1.15, 0.28, 1.6], [0.95, 0.6, 0.28, 1.6], [0, 1.6, 1.5, 0.28], [-0.95, 0.6, 0.28, 1.6], [-0.95, -1.15, 0.28, 1.6], [0, -0.3, 1.5, 0.28], [1.5, 1.7, 0.3, 0.3]];
      const mats = segs.map(([x, z, w, d]) => { const m = new THREE.MeshStandardMaterial({ color: 0x3a0b0b, emissive: 0xff2a1a, emissiveIntensity: 0 }); g.add(box(w, 0.04, d, m, x, 0.87, z - 0.4)); return m; });
      g.userData.segs = mats;
      for (let k = 0; k < 9; k++) leg(g, [[-4 + k, 0.02, 4], [-4 + k, 0.25, 4], [Math.max(-2, Math.min(2, -4 + k)), 0.25, 2.2]], 0.045);
    },
    meter(g, p, unit) {
      g.add(box(2.8, 1.0, 1.6, mat(0x15171c), 0, 0.6, -0.9));
      const c = document.createElement("canvas"); c.width = 256; c.height = 96;
      const tex = new THREE.CanvasTexture(c);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.86), new THREE.MeshBasicMaterial({ map: tex })); scr.rotation.x = -Math.PI / 2; scr.position.set(0, 1.11, -0.9); g.add(scr);
      g.userData.screen = { c: c, tex: tex, unit: unit, last: "" };
      pinLeg(g, -2, 0, -0.9, 0.2, -0.2); pinLeg(g, 2, 0, 0.9, 0.2, -0.2);
    },
  };
  function buildPart(p) {
    const g = new THREE.Group();
    switch (p.type) {
      case "diode": case "schottky": BUILD.diode(g, p, "diode"); break;
      case "zener": BUILD.diode(g, p, "zener"); break;
      case "npn": case "pnp": BUILD.to92(g, p, [[-2, 0], [1, -2], [1, 2]], p.type === "npn" ? "BC547" : "BC557"); break;
      case "nmos": case "pmos": BUILD.to220(g, p, [[-2, 0], [1, -2], [1, 2]], p.type === "nmos" ? "IRFZ44N" : "IRF9540"); break;
      case "opamp": BUILD.dip(g, p, [[-2, -1], [-2, 1], [3, 0]], "LM741", 8); break;
      case "timer555": BUILD.dip(g, p, CS.PARTS.timer555.pins, "NE555", 8); break;
      case "not": case "and": case "or": case "nand": case "nor": case "xor":
        BUILD.dip(g, p, CS.PARTS[p.type].pins, { not: "74HC04", and: "74HC08", or: "74HC32", nand: "74HC00", nor: "74HC02", xor: "74HC86" }[p.type], 14); break;
      case "dcsupply": BUILD.terminal(g, p, 0x1f8a4c, [CS.fmt(+p.p.V, "V") + " DC"]); break;
      case "acsource": BUILD.terminal(g, p, 0x2a63c9, ["AC " + CS.fmt(+p.p.f, "Hz")]); break;
      case "isource": BUILD.terminal(g, p, 0x8a4cd6, [CS.fmt(+p.p.I, "A")]); break;
      case "voltmeter": BUILD.meter(g, p, "V"); break;
      case "ammeter": BUILD.meter(g, p, "A"); break;
      default: (BUILD[p.type] || BUILD.resistor)(g, p);
    }
    return g;
  }

  // ------------------------------------------------------------------ the view
  function create(el) {
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch (_) { el.textContent = "3D needs WebGL, which this browser has turned off."; return { setCircuit() {}, update() {}, resize() {}, theme() {} }; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    el.append(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
    scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x203020, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.85); sun.position.set(12, 30, 18); scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9ec9ff, 0.35); rim.position.set(-20, 12, -16); scene.add(rim);
    let board = new THREE.Group(); scene.add(board);
    let parts = {};
    const view = { yaw: -0.55, pitch: 0.95, dist: 30, cx: 0, cz: 0, size: 20 };

    function placeCamera() {
      const d = view.dist;
      camera.position.set(view.cx + d * Math.cos(view.pitch) * Math.sin(view.yaw), d * Math.sin(view.pitch), view.cz + d * Math.cos(view.pitch) * Math.cos(view.yaw));
      camera.lookAt(view.cx, 0, view.cz);
    }
    function setCircuit(circuit) {
      scene.remove(board);
      board.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); });
      board = new THREE.Group(); scene.add(board); parts = {};
      let x1 = Infinity, z1 = Infinity, x2 = -Infinity, z2 = -Infinity;
      const add = (x, z) => { x1 = Math.min(x1, x); z1 = Math.min(z1, z); x2 = Math.max(x2, x); z2 = Math.max(z2, z); };
      circuit.parts.forEach((p) => CS.pinPositions(p).forEach((q) => add(q[0], q[1])));
      circuit.wires.forEach((w) => { add(w.x1, w.y1); add(w.x2, w.y2); });
      if (!isFinite(x1)) { x1 = -5; z1 = -4; x2 = 5; z2 = 4; }
      const m = 3, bx = (x1 + x2) / 2, bz = (z1 + z2) / 2, bw = x2 - x1 + 2 * m + 2, bd = z2 - z1 + 2 * m + 2;
      // board: FR-4 core + solder mask, rounded look via a slightly smaller top
      board.add(box(bw, 0.16, bd, M.boardEdge, bx, -0.09, bz));
      board.add(box(bw - 0.04, 0.02, bd - 0.04, M.board, bx, 0, bz));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        const hx = bx + sx * (bw / 2 - 0.9), hz = bz + sz * (bd / 2 - 0.9);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.55, 24), M.pad); ring.rotation.x = -Math.PI / 2; ring.position.set(hx, 0.012, hz); board.add(ring);
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), M.hole); hole.rotation.x = -Math.PI / 2; hole.position.set(hx, 0.013, hz); board.add(hole);
      });
      const brand = printed(["Quantix Circuit Lab"], 0.55, { color: "#ffffff", weight: "700" }); brand.position.set(bx - bw / 2 + 4.3, 0.012, bz + bd / 2 - 0.75); board.add(brand);
      // copper traces
      circuit.wires.forEach((w) => {
        const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        const tr = box(w.x1 === w.x2 ? 0.36 : len + 0.36, 0.03, w.x1 === w.x2 ? len + 0.36 : 0.36, M.copper, (w.x1 + w.x2) / 2, 0.016, (w.y1 + w.y2) / 2);
        board.add(tr);
      });
      // pads at every pin and trace end
      const padAt = new Set();
      const pad = (x, z) => { const k = x + "," + z; if (padAt.has(k)) return; padAt.add(k); const p = cyl(0.36, 0.36, 0.05, M.pad, 20); p.position.set(x, 0.03, z); board.add(p); const hl = cyl(0.12, 0.12, 0.06, M.hole, 12); hl.position.set(x, 0.035, z); board.add(hl); };
      circuit.parts.forEach((p) => CS.pinPositions(p).forEach((q) => pad(q[0], q[1])));
      // parts
      circuit.parts.forEach((p) => {
        const g = buildPart(p);
        g.position.set(p.x, 0, p.y); g.rotation.y = -(p.rot || 0) * Math.PI / 2;
        board.add(g); parts[p.id] = { g: g, p: p };
        if (p.type !== "ground") {
          const lab = printed([p.label], 0.62, { color: "#f4f4f4" });
          const bbox = new THREE.Box3().setFromObject(g);
          lab.position.set(p.x, 0.013, Math.min(bbox.min.z, p.y - 0.6) - 0.4); board.add(lab);
        }
      });
      view.cx = bx; view.cz = bz; view.size = Math.max(bw, bd);
      view.dist = Math.max(10, view.size * 0.95);
      placeCamera();
    }
    function screenText(scr, txt, burnt) {
      if (scr.last === txt) return;
      scr.last = txt;
      const g = scr.c.getContext("2d");
      g.fillStyle = burnt ? "#2a1a1a" : "#a9c99a"; g.fillRect(0, 0, 256, 96);
      g.fillStyle = "#1c2a18"; g.font = "700 46px JetBrains Mono, Consolas, monospace"; g.textAlign = "right"; g.textBaseline = "middle";
      g.fillText(txt, 244, 50);
      scr.tex.needsUpdate = true;
    }
    function update(infos, sim) {
      const now = performance.now();
      Object.keys(parts).forEach((id) => {
        const it = parts[id], u = it.g.userData, info = infos[id];
        if (!info) return;
        if (u.glow) {
          const gl = Math.max(0, Math.min(1.4, info.glow || 0));
          u.glow.emissiveIntensity = 0.05 + gl * 1.6;
          if (u.fil) u.fil.emissiveIntensity = gl * 3;
          if (u.halo) { u.halo.material.opacity = Math.min(0.95, gl * 0.85); const s = u.haloSize * (0.6 + 0.5 * gl); u.halo.scale.set(s, s, 1); }
        }
        if (u.buzz && u.halo) u.halo.material.opacity = info.sound ? 0.35 + 0.3 * Math.sin(now / 40) : 0;
        if (u.rotor) u.rotor.rotation.x = -(sim.state(id).ang || 0);
        if (u.segs) u.segs.forEach((m, k) => { m.emissiveIntensity = Math.min(2, ((info.segments || [])[k] || 0) * 2); });
        if (u.lever) u.lever.rotation.z = it.p.p.on === true ? -0.5 : 0.5;
        if (u.cap) u.cap.position.y = it.p.p.on === true ? 0.6 : 0.72;
        if (u.slider) u.slider.position.z = it.p.p.pos === "B" ? 0.45 : -0.45;
        if (u.knob) u.knob.rotation.y = -((+it.p.p.pos || 0) / 100 - 0.5) * 4.5;
        if (u.screen) screenText(u.screen, info.burnt ? "----" : CS.fmt(info.reading, u.screen.unit, 3).replace(" ", ""), !!info.burnt);
        if (u.wire) u.wire.visible = !info.burnt;
        if (info.burnt && !it.charred) {
          it.charred = true;
          it.g.traverse((o) => { if (o.material && o.material.color && o.material !== M.lead && o.material !== M.pad) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.25); if (o.material.emissive) o.material.emissiveIntensity = 0; } });
        } else if (!info.burnt && it.charred) { it.charred = false; }
      });
      renderer.render(scene, camera);
    }
    function resize() {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height, false);
      renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%";
      camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    }
    // orbit controls: drag rotate, right-drag / shift-drag pan, wheel zoom, double-click reset, arrow keys
    const dom = renderer.domElement;
    dom.tabIndex = 0; dom.setAttribute("role", "img"); dom.setAttribute("aria-label", "3D PCB view — arrow keys rotate, + and − zoom");
    let drag = null;
    dom.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; dom.setPointerCapture(e.pointerId); });
    dom.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.pan) { const s = view.dist / 600; view.cx -= (dx * Math.cos(view.yaw) - dy * Math.sin(view.yaw) * 0) * s; view.cz -= (-dx * Math.sin(view.yaw) + dy) * s * 0.9; }
      else { view.yaw -= dx * 0.008; view.pitch = Math.max(0.12, Math.min(1.5, view.pitch + dy * 0.006)); }
      placeCamera();
    });
    dom.addEventListener("pointerup", () => { drag = null; });
    dom.addEventListener("contextmenu", (e) => e.preventDefault());
    dom.addEventListener("wheel", (e) => { e.preventDefault(); view.dist = Math.max(4, Math.min(view.size * 4, view.dist * (e.deltaY > 0 ? 1.1 : 0.9))); placeCamera(); }, { passive: false });
    dom.addEventListener("dblclick", () => { view.yaw = -0.55; view.pitch = 0.95; view.dist = Math.max(10, view.size * 0.95); placeCamera(); });
    dom.addEventListener("keydown", (e) => {
      const k = e.key;
      if (k === "ArrowLeft") view.yaw += 0.12; else if (k === "ArrowRight") view.yaw -= 0.12;
      else if (k === "ArrowUp") view.pitch = Math.min(1.5, view.pitch + 0.08); else if (k === "ArrowDown") view.pitch = Math.max(0.12, view.pitch - 0.08);
      else if (k === "+" || k === "=") view.dist = Math.max(4, view.dist * 0.9); else if (k === "-") view.dist = Math.min(view.size * 4, view.dist * 1.1);
      else return;
      e.preventDefault(); placeCamera();
    });
    new ResizeObserver(resize).observe(el);
    resize();
    return { setCircuit: setCircuit, update: update, resize: resize, theme() {} };
  }

  window.CircuitPCB3D = { create: create, bands: bands };
})();
