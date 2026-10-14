"""Train the handwritten-symbol classifier used by src/handwriting.py.

    python tools/train_handwriting.py --hasy PATH/TO/HASYv2 --mnist PATH/FOR/MNIST [--epochs 12]

Data (credit both when sharing the model):
  * HASYv2 — handwritten mathematical symbols, Martin Thoma, ODC Open Database License v1.0
    https://zenodo.org/records/259444
  * MNIST — handwritten digits, Y. LeCun, C. Cortes, C. J. C. Burges (downloaded by torchvision)

Validation is on writers the model never saw (HASYv2 split by user id) plus the MNIST test set, so the reported
accuracy is what a new person's handwriting gets. Output: models/handwriting/symbols.pt (+ symbols.json).
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
import sys
import time
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.handwriting import MODEL_DIR, MODEL_FILE, SIZE, _net, normalize_symbol  # noqa: E402

# HASYv2 LaTeX name -> our class
HASY_MAP = {**{str(d): str(d) for d in range(10)}, "x": "x", "y": "y", "z": "z", "a": "a", "b": "b", "c": "c", "n": "n",
            "+": "plus", "\\times": "times", "\\div": "div", "/": "slash", "\\pi": "pi"}
PARENS_PER_SIDE = 1500                     # synthetic "(" and ")" (HASYv2 has none)
MNIST_PER_DIGIT = 2500


def load_hasy(root: Path) -> tuple[list, list, list]:
    imgs, labels, users = [], [], []
    with open(root / "hasy-data-labels.csv", newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            cls = HASY_MAP.get(row["latex"])
            if cls is None:
                continue
            g = cv2.imread(str(root / row["path"]), cv2.IMREAD_GRAYSCALE)
            if g is None:
                continue
            imgs.append((g < 128).astype(np.uint8) * 255)
            labels.append(cls)
            users.append(row["user_id"])
    return imgs, labels, users


def load_mnist(root: Path, train: bool, per_digit: int | None) -> tuple[list, list]:
    from torchvision.datasets import MNIST
    ds = MNIST(str(root), train=train, download=True)
    data, targets = ds.data.numpy(), ds.targets.numpy()
    idx = np.arange(len(targets))
    rng = np.random.default_rng(0)
    rng.shuffle(idx)
    imgs, labels, count = [], [], Counter()
    for i in idx:
        d = int(targets[i])
        if per_digit and count[d] >= per_digit:
            continue
        count[d] += 1
        imgs.append((data[i] > 100).astype(np.uint8) * 255)
        labels.append(str(d))
    return imgs, labels


def synth_paren(rng: random.Random, right: bool) -> np.ndarray:
    """A hand-drawn-looking "(" or ")": an arc with random curvature, length, wobble and pen width.
    (HASYv2 has no parentheses.)"""
    img = np.zeros((96, 96), np.uint8)
    R = rng.uniform(28, 90)
    span = rng.uniform(55, 115) * math.pi / 180
    mid = math.pi + rng.uniform(-0.15, 0.15)
    cx = 48 + R * math.cos(mid) * -1
    pts = []
    for i in range(24):
        a = mid - span / 2 + span * i / 23
        x, y = cx + R * math.cos(a), 48 + R * math.sin(a) * rng.uniform(0.95, 1.05)
        pts.append([x + rng.gauss(0, 0.8), y + rng.gauss(0, 0.8)])
    p = np.array(pts)
    p[:, 1] = 48 + (p[:, 1] - 48) * (70 / max(1e-6, np.ptp(p[:, 1])))       # roughly a symbol's height
    if right:
        p[:, 0] = 96 - p[:, 0]
    cv2.polylines(img, [p.astype(np.int32)], False, 255, rng.choice([3, 4, 5, 6, 7]), cv2.LINE_AA)
    return img


def augment(ink: np.ndarray, rng: random.Random) -> np.ndarray:
    """Random slant / rotation / scale / stroke thickness on an upscaled mask, then the shared normalisation."""
    big = cv2.resize(ink, None, fx=3, fy=3, interpolation=cv2.INTER_NEAREST)
    h, w = big.shape
    big = cv2.copyMakeBorder(big, h // 3, h // 3, w // 3, w // 3, cv2.BORDER_CONSTANT, value=0)
    h, w = big.shape
    m = cv2.getRotationMatrix2D((w / 2, h / 2), rng.uniform(-12, 12), rng.uniform(0.85, 1.1))
    m[0, 1] += rng.uniform(-0.25, 0.25)                                  # slant
    big = cv2.warpAffine(big, m, (w, h), flags=cv2.INTER_LINEAR)
    r = rng.random()
    if r < 0.3:
        big = cv2.erode(big, np.ones((2, 2), np.uint8))
    elif r < 0.75:
        k = rng.choice([2, 3, 4, 5])
        big = cv2.dilate(big, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    return normalize_symbol(big)


def plain(ink: np.ndarray) -> np.ndarray:
    big = cv2.resize(ink, None, fx=3, fy=3, interpolation=cv2.INTER_NEAREST)
    return normalize_symbol(cv2.dilate(big, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))))


class DS(torch.utils.data.Dataset):
    def __init__(self, imgs, ys, train):
        self.imgs, self.ys, self.train, self.rng = imgs, ys, train, random.Random(0)

    def __len__(self):
        return len(self.ys)

    def __getitem__(self, i):
        x = augment(self.imgs[i], self.rng) if self.train else plain(self.imgs[i])
        return torch.from_numpy(x).unsqueeze(0), self.ys[i]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hasy", type=Path, required=True)
    ap.add_argument("--mnist", type=Path, required=True)
    ap.add_argument("--epochs", type=int, default=12)
    a = ap.parse_args()
    torch.manual_seed(0)
    random.seed(0)

    h_imgs, h_lab, h_users = load_hasy(a.hasy)
    users = sorted(set(h_users))
    random.Random(1).shuffle(users)
    held = set(users[: len(users) // 5])                                  # 20 % of writers never seen in training
    tr = [(i, l) for i, l, u in zip(h_imgs, h_lab, h_users) if u not in held]
    va = [(i, l) for i, l, u in zip(h_imgs, h_lab, h_users) if u in held]
    m_tr = load_mnist(a.mnist, True, MNIST_PER_DIGIT)
    m_va = load_mnist(a.mnist, False, 300)
    tr += list(zip(*m_tr))
    va += list(zip(*m_va))
    prng = random.Random(7)
    for right, name in ((False, "lpar"), (True, "rpar")):
        tr += [(synth_paren(prng, right), name) for _ in range(PARENS_PER_SIDE)]
        va += [(synth_paren(prng, right), name) for _ in range(150)]
    classes = sorted({l for _, l in tr})
    ci = {c: i for i, c in enumerate(classes)}
    print("classes:", classes)
    print("train counts:", dict(Counter(l for _, l in tr)))
    print(f"train {len(tr)} · validation {len(va)} (held-out writers)")

    ytr = [ci[l] for _, l in tr]
    counts = Counter(ytr)
    weights = [1.0 / counts[y] for y in ytr]
    sampler = torch.utils.data.WeightedRandomSampler(weights, num_samples=min(len(ytr), 60000), replacement=True)
    dl_tr = torch.utils.data.DataLoader(DS([i for i, _ in tr], ytr, True), batch_size=256, sampler=sampler, num_workers=0)
    dl_va = torch.utils.data.DataLoader(DS([i for i, _ in va], [ci[l] for _, l in va], False), batch_size=512, num_workers=0)

    net = _net(len(classes))
    opt = torch.optim.AdamW(net.parameters(), lr=2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=a.epochs * len(dl_tr))
    lossf = nn.CrossEntropyLoss(label_smoothing=0.05)
    best, best_state = 0.0, None
    for ep in range(a.epochs):
        t0 = time.time()
        net.train()
        for xb, yb in dl_tr:
            opt.zero_grad()
            lossf(net(xb), yb).backward()
            opt.step()
            sched.step()
        net.eval()
        correct, n, per = 0, 0, Counter()
        tot = Counter()
        with torch.no_grad():
            for xb, yb in dl_va:
                p = net(xb).argmax(1)
                correct += int((p == yb).sum())
                n += len(yb)
                for t_, p_ in zip(yb.tolist(), p.tolist()):
                    tot[t_] += 1
                    per[t_] += int(t_ == p_)
        acc = correct / n
        print(f"epoch {ep + 1}/{a.epochs}  val acc {acc:.4f}  ({time.time() - t0:.0f}s)", flush=True)
        if acc > best:
            best, best_state = acc, {k: v.clone() for k, v in net.state_dict().items()}
            per_class = {classes[k]: round(per[k] / tot[k], 4) for k in sorted(tot)}

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": best_state, "classes": classes, "size": SIZE}, MODEL_FILE)
    meta = {"trained": True, "classes": classes, "val_accuracy": round(best, 4), "per_class_accuracy": per_class,
            "validation": "HASYv2 writers held out (20 %) + MNIST test subset", "train_samples": len(tr),
            "data": ["HASYv2 (Martin Thoma, ODbL 1.0, https://zenodo.org/records/259444)",
                     "MNIST (LeCun, Cortes, Burges)", "synthetic hand-drawn parentheses (tools/train_handwriting.py)"]}
    (MODEL_DIR / "symbols.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"saved {MODEL_FILE} — best validation accuracy {best:.4f}")


if __name__ == "__main__":
    main()
