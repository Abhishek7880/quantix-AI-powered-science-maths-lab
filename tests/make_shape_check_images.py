"""Independent check images for the shape model, drawn with matplotlib (NOT the training generator).

Different renderer, line styles, fonts, perspective 3D surfaces and no dashed hidden edges, so
results on these show how well the model generalises beyond its synthetic training style.

  python tests/make_shape_check_images.py        -> samples/shapes/<class>_<n>.png
"""

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib import patches  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "samples" / "shapes"


def fig2d(name, patch, label=None, bg="white"):
    fig, ax = plt.subplots(figsize=(4, 4), dpi=100)
    fig.patch.set_facecolor(bg)
    ax.set_facecolor(bg)
    ax.add_patch(patch)
    if label:
        ax.text(*label)
    ax.set_xlim(-3, 3)
    ax.set_ylim(-3, 3)
    ax.set_aspect("equal")
    ax.axis("off")
    fig.savefig(OUT / f"{name}.png", facecolor=bg)
    plt.close(fig)


def fig3d(name, draw, elev=20, azim=35):
    fig = plt.figure(figsize=(4, 4), dpi=100)
    ax = fig.add_subplot(projection="3d")
    draw(ax)
    ax.view_init(elev=elev, azim=azim)
    ax.set_box_aspect((1, 1, 1))
    ax.axis("off")
    fig.savefig(OUT / f"{name}.png")
    plt.close(fig)


def box(ax, l, b, h, color):
    x = [0, l]; y = [0, b]; z = [0, h]
    v = np.array([[i, j, k] for i in x for j in y for k in z])
    faces = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]
    ax.add_collection3d(Poly3DCollection([v[f] for f in faces], facecolors=color, edgecolors="k", linewidths=1.2, alpha=0.9))
    m = max(l, b, h)
    ax.set_xlim(0, m); ax.set_ylim(0, m); ax.set_zlim(0, m)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # ---- 2D
    fig2d("circle_1", patches.Circle((0, 0), 2, fill=False, lw=3), (2.05, 0, "r = 4 cm"))
    fig2d("semicircle_1", patches.Wedge((0, -0.8), 2.4, 0, 180, fc="#f4a261", ec="k", lw=2))
    fig2d("ellipse_1", patches.Ellipse((0, 0), 5, 2.6, angle=20, fc="#90caf9", ec="#0d47a1", lw=2))
    fig2d("square_1", patches.Rectangle((-1.8, -1.8), 3.6, 3.6, fill=False, lw=4, ec="#333"), (-0.3, -2.4, "6 cm"))
    fig2d("rectangle_1", patches.Rectangle((-2.6, -1.2), 5.2, 2.4, fc="#a5d6a7", ec="k", lw=2), (-0.4, -1.7, "l = 9 cm"))
    fig2d("triangle_1", patches.Polygon([[-2.5, -1.8], [2.5, -1.8], [-0.6, 2.2]], fill=False, lw=3))
    fig2d("rhombus_1", patches.Polygon([[0, 2.6], [1.4, 0], [0, -2.6], [-1.4, 0]], fill=False, lw=3))
    fig2d("parallelogram_1", patches.Polygon([[-2.6, -1.3], [1.4, -1.3], [2.6, 1.3], [-1.4, 1.3]], fc="#ce93d8", ec="k", lw=2))
    fig2d("trapezium_1", patches.Polygon([[-2.6, -1.4], [2.6, -1.4], [1.2, 1.4], [-1.2, 1.4]], fill=False, lw=3))
    fig2d("pentagon_1", patches.RegularPolygon((0, 0), 5, radius=2.4, fc="#ffe082", ec="k", lw=2))
    fig2d("hexagon_1", patches.RegularPolygon((0, 0), 6, radius=2.4, fill=False, lw=3, ec="#1565c0"))
    fig2d("square_2", patches.Rectangle((-1.5, -1.5), 3, 3, angle=30, rotation_point="center", fc="#ef9a9a", ec="k", lw=2))
    fig2d("triangle_2", patches.RegularPolygon((0, -0.3), 3, radius=2.5, fc="#80cbc4", ec="k", lw=2))
    fig2d("circle_2", patches.Circle((0, 0), 2.3, fc="#ffcc80", ec="k", lw=1), bg="#f5f5f5")

    # ---- 3D
    u, v = np.mgrid[0:2 * np.pi:40j, 0:np.pi:20j]
    fig3d("sphere_1", lambda ax: ax.plot_surface(np.cos(u) * np.sin(v), np.sin(u) * np.sin(v), np.cos(v),
                                                  cmap="Blues", edgecolor="none"))
    u2, v2 = np.mgrid[0:2 * np.pi:40j, 0:np.pi / 2:12j]
    fig3d("hemisphere_1", lambda ax: (ax.plot_surface(np.cos(u2) * np.sin(v2), np.sin(u2) * np.sin(v2), np.cos(v2),
                                                      cmap="Oranges", edgecolor="none"), ax.set_zlim(-0.5, 1.2)))
    th, zz = np.mgrid[0:2 * np.pi:40j, 0:2:10j]
    fig3d("cylinder_1", lambda ax: (ax.plot_surface(np.cos(th), np.sin(th), zz, color="#81c784", edgecolor="none"),
                                    ax.plot(np.cos(th[:, 0]), np.sin(th[:, 0]), 2, "k"),
                                    ax.plot(np.cos(th[:, 0]), np.sin(th[:, 0]), 0, "k")), elev=25)
    rr, th2 = np.mgrid[0:1:10j, 0:2 * np.pi:40j]
    fig3d("cone_1", lambda ax: (ax.plot_surface(rr * np.cos(th2), rr * np.sin(th2), 2 * (1 - rr), cmap="Reds", edgecolor="none"),
                                ax.plot(np.cos(th2[0]), np.sin(th2[0]), 0, "k")), elev=18)
    fig3d("cube_1", lambda ax: box(ax, 1, 1, 1, "#90caf9"))
    fig3d("cuboid_1", lambda ax: box(ax, 2, 1, 0.8, "#ffab91"))

    def pyramid(ax):
        b = np.array([[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]]); apex = np.array([1, 1, 2.2])
        faces = [b] + [np.array([b[i], b[(i + 1) % 4], apex]) for i in range(4)]
        ax.add_collection3d(Poly3DCollection(faces, facecolors="#fff59d", edgecolors="k", linewidths=1.2))
        ax.set_xlim(0, 2); ax.set_ylim(0, 2); ax.set_zlim(0, 2.2)
    fig3d("square_pyramid_1", pyramid, elev=15)

    def prism(ax):
        t = np.array([[0, 0], [2, 0], [1, 1.6]])
        a = np.c_[t, np.zeros(3)]; b = np.c_[t, np.full(3, 2.5)]
        faces = [a, b] + [np.array([a[i], a[(i + 1) % 3], b[(i + 1) % 3], b[i]]) for i in range(3)]
        ax.add_collection3d(Poly3DCollection(faces, facecolors="#b39ddb", edgecolors="k", linewidths=1.2))
        ax.set_xlim(0, 2.5); ax.set_ylim(0, 2.5); ax.set_zlim(0, 2.5)
    fig3d("triangular_prism_1", prism, elev=22, azim=-35)
    print(f"Wrote {len(list(OUT.glob('*.png')))} images to {OUT}")


if __name__ == "__main__":
    sys.exit(main())
