"""Make every product photo square with a clean, consistent background.

Reads the original photos in data/products/ (never modified) and writes cleaned copies
to data/products_web/, which the backend serves at /media/products/. For each photo:

1. Find the background: near-black or near-white pixels connected to the image edge.
   Many originals have black backgrounds (a transparent PNG flattened onto black)
   or black side bars. Flooding from the edges leaves dark areas inside a garment alone.
2. Remove the thin dark fringe black backgrounds leave around the garment, and
   soften the cut-out edge so it blends smoothly.
3. Composite the garment onto white. White/ivory garments that were on black get a
   light gray backdrop instead, so they don't vanish into the page.
4. Pad the image to a square, centered, in the same background color.

Run from the hw4 folder:
    .venv/bin/python scripts/normalize_product_images.py
It prints a summary and writes data/products_web/_report.json listing what changed per file.
"""

from __future__ import annotations

import json
import sqlite3
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

HW4 = Path(__file__).resolve().parent.parent
SOURCE_DIR = HW4 / "data" / "products"
OUTPUT_DIR = HW4 / "data" / "products_web"
DB_PATH = HW4 / "data" / "campus_customs.db"

WHITE = (255, 255, 255)
LIGHT_GRAY = (236, 238, 241)  # Backdrop for white garments, so they stay visible.
WHITE_GARMENT_WORDS = ("white", "ivory", "cream", "natural", "oatmeal")

# A pixel is "near black" if every channel is at most DARK_MAX and it's neutral (channels within
# DARK_SPREAD of each other). Very dark navy shadows have a higher blue channel, so they're kept.
DARK_MAX = 12
DARK_SPREAD = 6
LIGHT_MIN = 244  # A pixel is "near white" if every channel is at least this.
JPEG_QUALITY = 92


def edge_connected(candidates: np.ndarray) -> np.ndarray:
    """Pixels in `candidates` connected (4-neighbour) to the image border."""
    h, w = candidates.shape
    seen = np.zeros_like(candidates, dtype=bool)
    queue: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if candidates[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if candidates[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and candidates[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return seen


def main_colors() -> dict[str, str]:
    """product_id -> the garment's main color (first entry of catalogue.colors)."""
    conn = sqlite3.connect(f"{DB_PATH.as_uri()}?mode=ro", uri=True)
    try:
        rows = conn.execute("SELECT product_id, colors FROM catalogue").fetchall()
    finally:
        conn.close()
    colors = {}
    for product_id, raw in rows:
        listed = json.loads(raw)
        colors[product_id] = listed[0].lower() if listed else ""
    return colors


def normalize(src: Path, main_color: str) -> tuple[Image.Image, dict]:
    img = Image.open(src).convert("RGB")
    pixels = np.asarray(img).astype(np.int16)
    darkest, lightest = pixels.max(axis=2), pixels.min(axis=2)

    black_bg = edge_connected((darkest <= DARK_MAX) & (darkest - lightest <= DARK_SPREAD))
    white_bg = edge_connected(lightest >= LIGHT_MIN)
    black_share = float(black_bg.mean())

    white_garment = any(word in main_color for word in WHITE_GARMENT_WORDS)
    had_black = black_share > 0.01
    backdrop = LIGHT_GRAY if (white_garment and had_black) else WHITE

    # Background mask: black background plus the (already white) edge-connected white area.
    background = black_bg | white_bg
    mask = Image.fromarray((background * 255).astype(np.uint8))
    if had_black:
        # Grow the mask 2px into the garment to drop the dark JPEG fringe left by black backgrounds.
        mask = mask.filter(ImageFilter.MaxFilter(5))
    mask = mask.filter(ImageFilter.GaussianBlur(1.0))  # soft edge

    composed = Image.composite(Image.new("RGB", img.size, backdrop), img, mask)

    w, h = composed.size
    side = max(w, h)
    square = Image.new("RGB", (side, side), backdrop)
    square.paste(composed, ((side - w) // 2, (side - h) // 2))

    info = {
        "source": f"data/products/{src.name}",
        "original_size": f"{w}x{h}",
        "output_size": f"{side}x{side}",
        "padded_to_square": w != h,
        "black_background_share": round(black_share, 3),
        "black_background_replaced": had_black,
        "backdrop": "light_gray (white garment)" if backdrop == LIGHT_GRAY else "white",
        "main_color": main_color,
    }
    return square, info


def run() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    colors = main_colors()
    report = {}
    for src in sorted(SOURCE_DIR.glob("*.jpg")):
        image, info = normalize(src, colors.get(src.stem, ""))
        image.save(OUTPUT_DIR / src.name, "JPEG", quality=JPEG_QUALITY, optimize=True)
        report[src.name] = info

    (OUTPUT_DIR / "_report.json").write_text(json.dumps(report, indent=2) + "\n")
    replaced = [n for n, i in report.items() if i["black_background_replaced"]]
    padded = [n for n, i in report.items() if i["padded_to_square"]]
    gray = [n for n, i in report.items() if i["backdrop"].startswith("light_gray")]
    print(f"Wrote {len(report)} images to {OUTPUT_DIR.relative_to(HW4)}/")
    print(f"  black background replaced: {len(replaced)}")
    print(f"  padded to square:          {len(padded)}")
    print(f"  light-gray backdrop (white garments on black): {len(gray)} {gray}")


if __name__ == "__main__":
    run()
