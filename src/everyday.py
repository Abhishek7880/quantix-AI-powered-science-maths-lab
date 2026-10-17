"""Everyday objects -> the geometric shape Quantix explains (3D model + mensuration formulas).

The open-vocabulary detector (YOLO-World, models/everyday/everyday.pt, built by tools/build_everyday_model.py) looks
for the names below. Each name maps to one of the shapes in src/knowledge/mensuration.json, plus a short Hindi name and
an optional note when the real object only approximates that shape (e.g. a tapered glass ≈ cylinder).
"""

from __future__ import annotations

# name the detector searches for: (shape key, Hindi name, note)
OBJECTS: dict[str, tuple[str, str, str]] = {
    # --- cylinders
    "mug": ("cylinder", "मग", ""),
    "cup": ("cylinder", "कप", "Most cups are close to a cylinder (slightly wider at the top = frustum)."),
    "drinking glass": ("cylinder", "गिलास", "A tapered glass is really a frustum; a cylinder is a close estimate."),
    "tin can": ("cylinder", "टिन का डिब्बा", ""),
    "soda can": ("cylinder", "कोल्ड-ड्रिंक कैन", ""),
    "water bottle": ("cylinder", "पानी की बोतल", "Body ≈ cylinder (ignore the neck)."),
    "bottle": ("cylinder", "बोतल", "Body ≈ cylinder (ignore the neck)."),
    "jar": ("cylinder", "जार", ""),
    "candle": ("cylinder", "मोमबत्ती", ""),
    "pipe": ("cylinder", "पाइप", "A hollow pipe uses the hollow-cylinder formulas."),
    "pencil": ("cylinder", "पेंसिल", ""),
    "pen": ("cylinder", "पेन", ""),
    "battery": ("cylinder", "बैटरी", ""),
    "drum": ("cylinder", "ढोल", ""),
    "bucket": ("cylinder", "बाल्टी", "A bucket is a frustum; a cylinder is a rough estimate."),
    "flower pot": ("cylinder", "गमला", "Usually a frustum."),
    "vase": ("cylinder", "फूलदान", ""),
    "thermos": ("cylinder", "थर्मस", ""),
    "steel tumbler": ("cylinder", "स्टील का गिलास", ""),
    "lota": ("sphere", "लोटा", "Body ≈ sphere."),
    "tiffin box": ("cylinder", "टिफ़िन", ""),
    "pressure cooker": ("cylinder", "प्रेशर कुकर", ""),
    "cooking pot": ("cylinder", "बर्तन", ""),
    "glue stick": ("cylinder", "गोंद की स्टिक", ""),
    "roll of tape": ("cylinder", "टेप रोल", "A tape roll is a hollow cylinder."),
    "toilet paper roll": ("cylinder", "टिशू रोल", ""),
    "coin": ("cylinder", "सिक्का", "A coin is a very short cylinder."),
    "cake": ("cylinder", "केक", ""),
    "log": ("cylinder", "लकड़ी का लट्ठा", ""),
    "pillar": ("cylinder", "खंभा", ""),
    "lipstick": ("cylinder", "लिपस्टिक", ""),
    "bangle": ("circle", "चूड़ी", "A ring shape (annulus)."),
    # --- spheres
    "ball": ("sphere", "गेंद", ""),
    "football": ("sphere", "फ़ुटबॉल", ""),
    "basketball": ("sphere", "बास्केटबॉल", ""),
    "cricket ball": ("sphere", "क्रिकेट गेंद", ""),
    "tennis ball": ("sphere", "टेनिस गेंद", ""),
    "globe": ("sphere", "ग्लोब", ""),
    "orange": ("sphere", "संतरा", ""),
    "apple": ("sphere", "सेब", ""),
    "lemon": ("sphere", "नींबू", ""),
    "tomato": ("sphere", "टमाटर", ""),
    "marble": ("sphere", "कंचा", ""),
    "pearl": ("sphere", "मोती", ""),
    "laddoo": ("sphere", "लड्डू", ""),
    "balloon": ("sphere", "गुब्बारा", ""),
    "watermelon": ("sphere", "तरबूज़", ""),
    "matka": ("sphere", "मटका", "A clay pot's body ≈ sphere."),
    "light bulb": ("sphere", "बल्ब", ""),
    # --- hemispheres
    "bowl": ("hemisphere", "कटोरा", ""),
    "katori": ("hemisphere", "कटोरी", ""),
    "dome": ("hemisphere", "गुंबद", ""),
    "helmet": ("hemisphere", "हेलमेट", ""),
    "half coconut shell": ("hemisphere", "आधा नारियल", ""),
    # --- cones
    "ice cream cone": ("cone", "आइसक्रीम कोन", ""),
    "traffic cone": ("cone", "ट्रैफ़िक कोन", ""),
    "party hat": ("cone", "पार्टी टोपी", ""),
    "funnel": ("cone", "कीप", ""),
    "birthday cap": ("cone", "जन्मदिन टोपी", ""),
    "tent": ("cone", "तंबू", "A round tent is a cone (often on a cylinder)."),
    "carrot": ("cone", "गाजर", ""),
    # --- cubes
    "dice": ("cube", "पासा", ""),
    "rubik's cube": ("cube", "रूबिक क्यूब", ""),
    "sugar cube": ("cube", "चीनी का क्यूब", ""),
    "ice cube": ("cube", "बर्फ़ का टुकड़ा", ""),
    # --- cuboids
    "book": ("cuboid", "किताब", ""),
    "notebook": ("cuboid", "कॉपी", ""),
    "box": ("cuboid", "डिब्बा", ""),
    "cardboard box": ("cuboid", "गत्ते का डिब्बा", ""),
    "matchbox": ("cuboid", "माचिस", ""),
    "brick": ("cuboid", "ईंट", ""),
    "mobile phone": ("cuboid", "मोबाइल फ़ोन", ""),
    "laptop": ("cuboid", "लैपटॉप", ""),
    "television": ("cuboid", "टीवी", ""),
    "remote control": ("cuboid", "रिमोट", ""),
    "keyboard": ("cuboid", "कीबोर्ड", ""),
    "microwave": ("cuboid", "माइक्रोवेव", ""),
    "refrigerator": ("cuboid", "फ़्रिज", ""),
    "suitcase": ("cuboid", "सूटकेस", ""),
    "pencil box": ("cuboid", "पेंसिल बॉक्स", ""),
    "eraser": ("cuboid", "रबड़", ""),
    "soap bar": ("cuboid", "साबुन", ""),
    "milk carton": ("cuboid", "दूध का डिब्बा", ""),
    "shoe box": ("cuboid", "जूते का डिब्बा", ""),
    "almirah": ("cuboid", "अलमारी", ""),
    "cupboard": ("cuboid", "कपबोर्ड", ""),
    "table": ("cuboid", "मेज़", "A table top is a thin cuboid."),
    "bed": ("cuboid", "पलंग", ""),
    "mattress": ("cuboid", "गद्दा", ""),
    "pillow": ("cuboid", "तकिया", ""),
    "chalk box": ("cuboid", "चॉक का डिब्बा", ""),
    "wallet": ("cuboid", "बटुआ", ""),
    "tablet computer": ("cuboid", "टैबलेट", ""),
    "speaker": ("cuboid", "स्पीकर", ""),
    "toaster": ("cuboid", "टोस्टर", ""),
    "oven": ("cuboid", "ओवन", ""),
    "door": ("cuboid", "दरवाज़ा", ""),
    "window": ("rectangle", "खिड़की", ""),
    "monitor": ("cuboid", "मॉनिटर", ""),
    "router": ("cuboid", "राउटर", ""),
    "chocolate bar": ("cuboid", "चॉकलेट", ""),
    "biscuit packet": ("cuboid", "बिस्किट का पैकेट", ""),
    "envelope": ("rectangle", "लिफ़ाफ़ा", ""),
    "photo frame": ("rectangle", "फ़ोटो फ़्रेम", ""),
    "paper sheet": ("rectangle", "काग़ज़", ""),
    "card": ("rectangle", "कार्ड", ""),
    # --- pyramids & prisms
    "pyramid": ("square_pyramid", "पिरामिड", ""),
    "toblerone": ("triangular_prism", "टॉबलेरोन", ""),
    "tent roof": ("triangular_prism", "तंबू की छत", ""),
    "doorstop wedge": ("triangular_prism", "वेज", ""),
    "samosa": ("square_pyramid", "समोसा", "A samosa is roughly a tetrahedron / pyramid."),
    # --- flat shapes
    "plate": ("circle", "थाली", ""),
    "clock": ("circle", "घड़ी", ""),
    "wall clock": ("circle", "दीवार घड़ी", ""),
    "pizza": ("circle", "पिज़्ज़ा", ""),
    "roti": ("circle", "रोटी", ""),
    "chapati": ("circle", "चपाती", ""),
    "cd": ("circle", "सीडी", ""),
    "wheel": ("circle", "पहिया", ""),
    "tyre": ("circle", "टायर", "A tyre is a ring (annulus)."),
    "button": ("circle", "बटन", ""),
    "frisbee": ("circle", "फ़्रिस्बी", ""),
    "mirror": ("rectangle", "शीशा", ""),
    "door mat": ("rectangle", "पायदान", ""),
    "chess board": ("square", "शतरंज बोर्ड", ""),
    "carrom board": ("square", "कैरम बोर्ड", ""),
    "tile": ("square", "टाइल", ""),
    "sandwich": ("triangle", "सैंडविच", "A cut sandwich is a triangle."),
    "pizza slice": ("triangle", "पिज़्ज़ा स्लाइस", "A pizza slice is a sector of a circle."),
    "road sign": ("triangle", "सड़क चिन्ह", ""),
    "kite": ("rhombus", "पतंग", ""),
    "egg": ("ellipse", "अंडा", "An egg is close to an ellipsoid."),
    "rugby ball": ("ellipse", "रग्बी गेंद", ""),
    "nut": ("hexagon", "नट", ""),
    "honeycomb": ("hexagon", "छत्ता", ""),
    "stop sign": ("hexagon", "स्टॉप चिन्ह", "Really an octagon."),
}

# Common objects the small COCO model (models/pretrained/yolo11n.pt) already knows well -> shape. Checked first.
COCO_OBJECTS: dict[str, tuple[str, str, str]] = {
    "cup": ("cylinder", "कप", "Most cups are close to a cylinder (slightly wider at the top = frustum)."),
    "bottle": ("cylinder", "बोतल", "Body ≈ cylinder (ignore the neck)."),
    "wine glass": ("cone", "वाइन गिलास", "The bowl of the glass is close to a cone."),
    "vase": ("cylinder", "फूलदान", ""), "cake": ("cylinder", "केक", ""), "baseball bat": ("cylinder", "बल्ला", ""),
    "potted plant": ("cylinder", "गमले का पौधा", "The pot is roughly a cylinder (really a frustum)."),
    "bowl": ("hemisphere", "कटोरा", ""), "sports ball": ("sphere", "गेंद", ""),
    "orange": ("sphere", "संतरा", ""), "apple": ("sphere", "सेब", ""), "carrot": ("cone", "गाजर", ""),
    "book": ("cuboid", "किताब", ""), "cell phone": ("cuboid", "मोबाइल फ़ोन", ""), "laptop": ("cuboid", "लैपटॉप", ""),
    "tv": ("cuboid", "टीवी", ""), "remote": ("cuboid", "रिमोट", ""), "keyboard": ("cuboid", "कीबोर्ड", ""),
    "microwave": ("cuboid", "माइक्रोवेव", ""), "oven": ("cuboid", "ओवन", ""), "toaster": ("cuboid", "टोस्टर", ""),
    "refrigerator": ("cuboid", "फ़्रिज", ""), "suitcase": ("cuboid", "सूटकेस", ""), "bed": ("cuboid", "पलंग", ""),
    "dining table": ("cuboid", "खाने की मेज़", "A table top is a thin cuboid."), "bench": ("cuboid", "बेंच", ""),
    "couch": ("cuboid", "सोफ़ा", ""), "clock": ("circle", "घड़ी", ""), "pizza": ("circle", "पिज़्ज़ा", ""),
    "frisbee": ("circle", "फ़्रिस्बी", ""), "sandwich": ("triangle", "सैंडविच", "A cut sandwich is a triangle."),
    "stop sign": ("hexagon", "स्टॉप चिन्ह", "Really an octagon."),
}
# Names the COCO model already covers — left out of the open-vocabulary list so it only handles the rest (a shorter
# list is more accurate). Glass-like names stay in: the COCO model is unsure about plain glasses and tumblers.
_COVERED = {"cup", "bottle", "water bottle", "bowl", "book", "notebook", "mobile phone", "laptop", "television", "monitor",
            "remote control", "keyboard", "microwave", "oven", "toaster", "refrigerator", "suitcase", "clock", "wall clock",
            "vase", "pizza", "cake", "sandwich", "carrot", "frisbee", "table", "bed", "orange", "apple", "ball", "football",
            "basketball", "tennis ball", "flower pot"}
EXTRA_NAMES = [n for n in OBJECTS if n not in _COVERED]
NAMES = list(OBJECTS)


def shape_of(name: str) -> dict | None:
    """Shape info for a detected everyday object name, or None if it isn't one of ours."""
    hit = OBJECTS.get(name) or COCO_OBJECTS.get(name)
    if not hit:
        return None
    shape, hi, note = hit
    return {"object": name, "object_hi": hi, "shape": shape, "note": note}


# ------------------------------------------------------------------ the automatic chain (light models first)
SHAPES_CONF, COCO_CONF, EXTRA_CONF = 0.5, 0.4, 0.25


def _overlap(a, b) -> float:
    """IoU, but also high when one box sits inside the other (one mug found as mug + rim + handle)."""
    ix = max(0.0, min(a.x2, b.x2) - max(a.x1, b.x1))
    iy = max(0.0, min(a.y2, b.y2) - max(a.y1, b.y1))
    inter = ix * iy
    area = lambda d: max(1e-9, (d.x2 - d.x1) * (d.y2 - d.y1))
    return max(inter / (area(a) + area(b) - inter), inter / min(area(a), area(b)))


def merge_duplicates(dets: list, infos: list) -> tuple[list, list]:
    """Keep the most confident box where boxes of the same shape overlap heavily."""
    order = sorted(range(len(dets)), key=lambda i: -dets[i].confidence)
    keep: list[int] = []
    for i in order:
        if all(not (dets[i].class_name == dets[k].class_name and _overlap(dets[i], dets[k]) > 0.6) for k in keep):
            keep.append(i)
    return [dets[i] for i in keep], [infos[i] for i in keep]


def annotate(img, dets: list, infos: list):
    """Boxes labelled 'mug → cylinder' (or just the shape for drawn shapes)."""
    import cv2
    out = img.copy()
    h, w = out.shape[:2]
    th = max(1, round(min(h, w) / 300))
    for d, info in zip(dets, infos):
        label = f"{info['object']} -> {d.class_name}" if info else d.class_name
        label += f" {d.confidence:.2f}"
        p1, p2 = (int(d.x1), int(d.y1)), (int(d.x2), int(d.y2))
        cv2.rectangle(out, p1, p2, (248, 189, 56), 2 * th)
        (tw, tht), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5 * th, th)
        y = max(p1[1], tht + 8)
        cv2.rectangle(out, (p1[0], y - tht - 8), (p1[0] + tw + 6, y), (248, 189, 56), -1)
        cv2.putText(out, label, (p1[0] + 3, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5 * th, (20, 16, 5), th, cv2.LINE_AA)
    return out


PHOTO_CONF = 0.5          # the COCO model is this sure about *anything* -> it's a real photo, not a drawing
CLEAR_PHOTO = 0.55        # colour flatness below this -> certainly a real photo (user photos 0.38–0.45)
FLAT_PHOTO = 0.80         # below this -> a photo unless the shapes model is very sure (noisy drawings sit at 0.63–0.73)
SURE_SHAPE_CONF = 0.85    # shapes model on drawings: 0.88–0.98


def flatness(img) -> float:
    """Share of a 64×64 thumbnail covered by its 4 most common colours (8 levels per channel).
    Drawings are flat (median 0.96), photos have shading and texture (median 0.41)."""
    import cv2
    import numpy as np
    small = cv2.resize(img, (64, 64), interpolation=cv2.INTER_AREA)
    _, counts = np.unique((small // 32).reshape(-1, 3), axis=0, return_counts=True)
    return float(np.sort(counts)[-4:].sum() / counts.sum())


def detect_auto(img, get_model) -> dict:
    """Decide photo vs drawing, then use the right models (measured on drawings + 128 real photos):
      real photo (COCO model confident about something)  -> everyday objects: COCO model, then open-vocabulary model
      drawing / unclear                                    -> shapes model if very sure, else open-vocabulary model,
                                                              else shapes model at its normal threshold
    `get_model(kind)` returns a src.inference.Detector for kind in {"shapes", "coco", "extra"} (loaded lazily, cached).
    Returns {detections, infos, annotated, latency_ms, stage}: detections use the shape as class_name, so the
    existing 3D model / formulas work unchanged; infos hold the everyday object for each detection (None for shapes)."""
    from src.inference import Detection
    total = 0.0

    def run(kind, conf):
        nonlocal total
        ds, _, ms = get_model(kind).predict(img, conf=conf, annotate=False)
        total += ms
        return ds

    def objects(raw, kind):
        dets, infos = [], []
        for d in raw:
            info = shape_of(d.class_name)
            if info:
                dets.append(Detection(d.class_id, info["shape"], d.confidence, d.x1, d.y1, d.x2, d.y2))
                infos.append(info | {"source": kind})
        return dets, infos

    def result(dets, infos, stage):
        dets, infos = merge_duplicates(dets, infos)
        return {"detections": dets, "infos": infos, "annotated": annotate(img, dets, infos), "latency_ms": total, "stage": stage}

    flat = flatness(img)
    coco_all = run("coco", 0.25)
    shapes = run("shapes", SHAPES_CONF)
    coco_sure = max((d.confidence for d in coco_all), default=0) >= PHOTO_CONF
    shape_sure = max((d.confidence for d in shapes), default=0) >= SURE_SHAPE_CONF
    # clearly textured -> photo; in-between (noisy drawings 0.63–0.73) -> photo unless the shapes model is very sure
    is_photo = flat < CLEAR_PHOTO or coco_sure or (flat < FLAT_PHOTO and not shape_sure)
    if is_photo:                                                                               # a real photo
        # never the shapes model's guess here: it was trained on drawings and calls a glass "cuboid 0.88"
        if get_model("ft") is not None:              # fine-tuned on visitors' corrections (tools/train_everyday.py)
            dets, infos = objects(run("ft", 0.5), "ft")
            if dets:
                return result(dets, infos, "ft")
        dets, infos = objects([d for d in coco_all if d.confidence >= COCO_CONF], "coco")
        if dets:
            return result(dets, infos, "coco")
        dets, infos = objects(run("extra", 0.3), "extra")
        if dets:
            return result(dets, infos, "extra")
        if flat >= 0.7 and shapes:                   # nearly flat: maybe a drawing after all
            return result(shapes, [None] * len(shapes), "shapes")
        return result([], [], "none")
    if shapes:                                                                                  # a drawing
        return result(shapes, [None] * len(shapes), "shapes")
    dets, infos = objects(run("extra", 0.35), "extra")
    return result(dets, infos, "extra" if dets else "none")
