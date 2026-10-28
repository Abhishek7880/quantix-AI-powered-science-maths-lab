"""Measure benchmark: photo-like renders with known real sizes (three.js in a headless browser).

    .venv\\Scripts\\python.exe tools\\make_measure_bench.py        # -> datasets/measure_bench/*.png + truth.json

3D scenes: a solid on a table, camera slightly above (like a phone photo); the true mm-per-pixel at the object's
distance is stored, as if a reference lay next to it. 2D scenes: flat paper cut-outs on a table, camera straight
down, with a ₹5 coin (25 mm) for the reference finder. Lighting, colours, table texture and camera angle vary.
Needs Playwright (any Python env) and the vendored three.js.
"""

from __future__ import annotations

import base64
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "datasets" / "measure_bench"

PAGE = r"""<!doctype html><html><body style="margin:0"><canvas id="c" width="1200" height="900"></canvas><script>
function render(sc) {
  const W = 1200, H = 900, cv = document.getElementById('c');
  const r = window.__r || (window.__r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }));
  r.setSize(W, H, false); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const s = new THREE.Scene(); s.background = new THREE.Color(sc.wall);
  const cam = new THREE.PerspectiveCamera(sc.fov, W / H, 1, 20000);
  s.add(new THREE.HemisphereLight(0xffffff, 0x404040, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(sc.light[0], sc.light[1], sc.light[2]); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -600, right: 600, top: 600, bottom: -600, near: 1, far: 5000 }); s.add(sun);
  // table with a fine noise texture
  const tc = document.createElement('canvas'); tc.width = tc.height = 512; const g = tc.getContext('2d');
  g.fillStyle = sc.table; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { g.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.06) + ')'; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(0,0,0,0.04)'; g.beginPath(); g.moveTo(0, Math.random() * 512); g.lineTo(512, Math.random() * 512); g.stroke(); }
  const tex = new THREE.CanvasTexture(tc); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 6);
  const table = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  table.rotation.x = -Math.PI / 2; table.receiveShadow = true; s.add(table);
  const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.45, metalness: 0.05 }, o || {}));
  sc.objects.forEach((o) => {
    let m;
    const k = o.kind, p = o.p;
    if (k === 'cylinder') { m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, p.h, 64), mat(o.color)); m.position.y = p.h / 2; }
    else if (k === 'mug') {
      m = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, p.h, 64), mat(o.color)); body.position.y = p.h / 2; m.add(body);
      const hd = new THREE.Mesh(new THREE.TorusGeometry(p.h * 0.28, p.r * 0.14, 16, 40, Math.PI), mat(o.color)); hd.rotation.z = -Math.PI / 2; hd.position.set(p.r, p.h / 2, 0); m.add(hd);
    }
    else if (k === 'sphere') { m = new THREE.Mesh(new THREE.SphereGeometry(p.r, 64, 48), mat(o.color)); m.position.y = p.r; }
    else if (k === 'hemisphere') { m = new THREE.Mesh(new THREE.SphereGeometry(p.r, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(o.color, { side: THREE.DoubleSide })); m.position.y = p.r; }
    else if (k === 'cube' || k === 'cuboid') { m = new THREE.Mesh(new THREE.BoxGeometry(p.l, p.h, p.b), mat(o.color)); m.position.y = p.h / 2; }
    else if (k === 'cone') { m = new THREE.Mesh(new THREE.ConeGeometry(p.r, p.h, 64), mat(o.color)); m.position.y = p.h / 2; }
    else if (k === 'coin') { m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 1.8, 64), mat(0xc9a64a, { metalness: 0.8, roughness: 0.3 })); m.position.y = 0.9; }
    else {   // flat paper shapes, 0.4 mm thick: circle, ellipse, polygon (n sides), rectangle, triangle
      const sh = new THREE.Shape();
      if (k === 'circle') sh.absarc(0, 0, p.r, 0, Math.PI * 2);
      else if (k === 'ellipse') sh.absellipse(0, 0, p.a, p.b, 0, Math.PI * 2);
      else if (k === 'rectangle' || k === 'square') { sh.moveTo(-p.l / 2, -p.b / 2); sh.lineTo(p.l / 2, -p.b / 2); sh.lineTo(p.l / 2, p.b / 2); sh.lineTo(-p.l / 2, p.b / 2); }
      else { const n = p.n, R = p.a / (2 * Math.sin(Math.PI / n)); for (let i = 0; i < n; i++) { const a = Math.PI / 2 + i * 2 * Math.PI / n; i ? sh.lineTo(R * Math.cos(a), R * Math.sin(a)) : sh.moveTo(R * Math.cos(a), R * Math.sin(a)); } }
      m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.4, bevelEnabled: false }), mat(o.color, { roughness: 0.9 }));
      m.rotation.x = -Math.PI / 2; m.position.y = 1.0;
    }
    m.position.x += o.x || 0; m.position.z += o.z || 0;
    if (o.rot) { if (m.rotation.x) m.rotation.z = o.rot; else m.rotation.y = o.rot; }   // flat pieces spin in the table plane
    m.traverse((q) => { if (q.isMesh) { q.castShadow = true; q.receiveShadow = true; } });
    s.add(m);
  });
  if (sc.topdown) cam.up.set(0, 0, -1);
  cam.position.set(sc.cam[0], sc.cam[1], sc.cam[2]); cam.lookAt(sc.look[0], sc.look[1], sc.look[2]);
  r.render(s, cam);
  // true scale at the target's distance (mm per pixel on a plane facing the camera through the look-at point)
  const d = cam.position.distanceTo(new THREE.Vector3(sc.look[0], sc.look[1], sc.look[2]));
  const mmpp = 2 * d * Math.tan(sc.fov * Math.PI / 360) / H;
  return { png: cv.toDataURL('image/png'), mm_per_px: mmpp };
}
</script></body></html>"""

COLORS = [0x2f6fd6, 0xe0613a, 0x3aa35b, 0xd4a017, 0x8e44ad, 0xc0392b, 0x16a085, 0xf2f2f2, 0x222831]
WALLS = [0xdfe6ee, 0xc9c2b8, 0x9fb3c8, 0xe8e2d6, 0x6b7280]
TABLES = ["#b08a5a", "#d9d4cc", "#6b7b8c", "#e9e9e9", "#8a6a4a"]


def scenes(rng: random.Random) -> list[dict]:
    out = []
    solids = [("cylinder", {"r": 40, "h": 120}), ("cylinder", {"r": 30, "h": 160}), ("mug", {"r": 40, "h": 95}),
              ("sphere", {"r": 50}), ("sphere", {"r": 35}), ("cube", {"l": 80, "h": 80, "b": 80}),
              ("cuboid", {"l": 140, "h": 60, "b": 70}), ("cuboid", {"l": 70, "h": 150, "b": 50}), ("cone", {"r": 45, "h": 110}),
              ("hemisphere", {"r": 70})]
    for k, p in solids:
        for _ in range(3):
            elev = rng.uniform(8, 28)
            dist = rng.uniform(550, 800)
            import math
            ty = (p.get("h") or 2 * p.get("r", 40)) / 2 if k != "hemisphere" else p["r"] / 2
            az = rng.uniform(-0.35, 0.35)
            cam = [dist * math.cos(math.radians(elev)) * math.sin(az), ty + dist * math.sin(math.radians(elev)), dist * math.cos(math.radians(elev)) * math.cos(az)]
            out.append({"kind3d": k, "truth": p, "dimension": "3D",
                        "sc": {"fov": 40, "wall": rng.choice(WALLS), "table": rng.choice(TABLES), "light": [rng.uniform(-400, 400), 900, rng.uniform(200, 700)],
                               "cam": cam, "look": [0, ty, 0], "objects": [{"kind": k, "p": p, "color": rng.choice(COLORS), "rot": rng.uniform(-0.6, 0.6)}]}})
    flats = [("circle", {"r": 50}), ("ellipse", {"a": 60, "b": 35}), ("square", {"l": 80, "b": 80}), ("rectangle", {"l": 120, "b": 60}),
             ("triangle", {"n": 3, "a": 100}), ("pentagon", {"n": 5, "a": 50}), ("hexagon", {"n": 6, "a": 45})]
    for k, p in flats:
        for _ in range(3):
            h = rng.uniform(380, 520)
            out.append({"kind2d": k, "truth": p, "dimension": "2D",
                        "sc": {"fov": 45, "wall": 0x000000, "table": rng.choice(TABLES), "light": [rng.uniform(-300, 300), 900, rng.uniform(-300, 300)],
                               "cam": [rng.uniform(-8, 8), h, rng.uniform(-8, 8) + 0.01], "look": [0, 0, 0], "topdown": True,
                               "objects": [{"kind": "triangle" if p.get("n") == 3 else "pentagon" if p.get("n") == 5 else "hexagon" if p.get("n") == 6 else k,
                                            "p": p, "color": rng.choice([c for c in COLORS if c != 0xf2f2f2]), "rot": rng.uniform(0, 3.14)},
                                           {"kind": "coin", "p": {"r": 12.5}, "x": rng.choice([-1, 1]) * 150, "z": rng.uniform(-80, 80)}]}})
    return out


def main() -> None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("Playwright is needed:  pip install playwright && playwright install chromium")
    rng = random.Random(7)
    OUT.mkdir(parents=True, exist_ok=True)
    truth = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        pg = None
        for i, s in enumerate(scenes(rng)):
            if pg:                                   # a fresh page per scene: the software GPU runs out of memory otherwise
                pg.close()
            pg = b.new_page(viewport={"width": 1200, "height": 900})
            pg.set_content(PAGE)
            pg.add_script_tag(path=str(ROOT / "src" / "web" / "vendor" / "three.min.js"))
            res = pg.evaluate("(sc) => render(sc)", s["sc"])
            name = f"{i:03d}_{s.get('kind3d') or s.get('kind2d')}.png"
            (OUT / name).write_bytes(base64.b64decode(res["png"].split(",", 1)[1]))
            truth.append({"file": name, "shape": s.get("kind3d") or s.get("kind2d"), "dimension": s["dimension"], "truth_mm": s["truth"],
                          "mm_per_px": res["mm_per_px"], "coin_mm": 25.0 if s["dimension"] == "2D" else None})
        b.close()
    (OUT / "truth.json").write_text(json.dumps(truth, indent=1), encoding="utf-8")
    print(f"{len(truth)} scenes in {OUT}")


if __name__ == "__main__":
    main()
