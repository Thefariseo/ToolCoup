#!/usr/bin/env python3
"""Derive every Praevex logo file from the five originals in assets/brand/source/.

  python3 scripts/build-brand.py

Writes public/brand/*.png (lockups, mark and stacked logo, each for dark and for light grounds),
app/icon.png, app/apple-icon.png, app/favicon.ico, app/opengraph-image.png, app/twitter-image.png.
The sources are raster engravings, so nothing here redraws the artwork: it only crops, trims, removes the
tagline where a version is wanted without it, and turns the black-on-white originals into transparent PNGs.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "brand" / "source"
OUT = ROOT / "public" / "brand"
APP = ROOT / "app"
FONTS = ROOT / "assets" / "fonts"
OUT.mkdir(parents=True, exist_ok=True)

INK = (6, 8, 8)            # the console's ground, #060808
BONE = (232, 226, 212)     # warm white used for chrome next to the logo


def trim(im, pad=0, thr=24):
    a = np.array(im.convert("RGBA"))[..., 3]
    ys, xs = np.where(a > thr)
    box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + 1 + pad, im.width), min(ys.max() + 1 + pad, im.height))
    return im.crop(box)


def to_height(im, h):
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def black_on_transparent(path):
    """The light originals are black ink on white paper: keep the ink as alpha, drop the paper (and its noise)."""
    g = np.array(Image.open(path).convert("L")).astype(np.float32)
    alpha = np.clip((255 - g - 8) * 255 / 232, 0, 255).astype(np.uint8)
    out = np.zeros(g.shape + (4,), np.uint8)
    out[..., 3] = alpha
    return Image.fromarray(out, "RGBA")


def save(im, name):
    im.save(OUT / name, optimize=True)
    print("brand/" + name, im.size)


# ------------------------------------------------------------------ dark grounds (transparent PNG, white ink)
both = Image.open(SRC / "lockups-transparent.webp").convert("RGBA")
# the lower logo of that sheet is the dark-ground version; the wordmark spans rows 738-885, the tagline 921-941
dark = both.crop((0, 600, both.width, 1030))
tagline_dark = trim(dark)
save(to_height(tagline_dark, 300), "praevex-lockup-tagline-dark.png")
nt = np.array(dark)
nt[(921 - 600 - 12):, 460:, 3] = 0          # erase the tagline, keep the statue's ground line
save(to_height(trim(Image.fromarray(nt, "RGBA")), 260), "praevex-lockup-dark.png")

stacked_dark = trim(Image.open(SRC / "stacked-dark.webp").convert("RGBA"))
save(to_height(stacked_dark, 520), "praevex-stacked-dark.png")
sd = np.array(Image.open(SRC / "stacked-dark.webp").convert("RGBA"))
mark_dark = trim(Image.fromarray(sd[:905], "RGBA"))     # statue, bird and ground line, above the wordmark
save(to_height(mark_dark, 520), "praevex-mark-dark.png")

# ------------------------------------------------------------------ light grounds (transparent PNG, black ink)
lock_l = black_on_transparent(SRC / "lockup-light.webp")
save(to_height(trim(lock_l), 260), "praevex-lockup-light.png")
save(to_height(trim(black_on_transparent(SRC / "lockup-tagline-light.webp")), 300), "praevex-lockup-tagline-light.png")
st_l = black_on_transparent(SRC / "stacked-light.webp")
save(to_height(trim(st_l), 520), "praevex-stacked-light.png")
sl = np.array(st_l)
save(to_height(trim(Image.fromarray(sl[:885], "RGBA")), 520), "praevex-mark-light.png")

# small files for the page chrome (a 36-48px logo does not need the 260px master)
for name in ("lockup-dark", "mark-dark", "lockup-light", "mark-light"):
    im = Image.open(OUT / f"praevex-{name}.png")
    save(to_height(im, 132), f"praevex-{name}-sm.png")

# ------------------------------------------------------------------ browser and home-screen icons
def tile(size, fill_ratio, rounded):
    base = Image.new("RGBA", (size, size), INK + (255,))
    m = to_height(mark_dark, round(size * fill_ratio))
    base.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    if rounded:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.2), fill=255)
        base.putalpha(mask)
    return base

tile(512, 0.8, True).save(APP / "icon.png", optimize=True)
tile(180, 0.78, False).convert("RGB").save(APP / "apple-icon.png", optimize=True)
tile(192, 0.8, True).save(OUT / "icon-192.png", optimize=True)
tile(512, 0.8, True).save(OUT / "icon-512.png", optimize=True)
ico = [tile(s, 0.88, False) for s in (48, 32, 16)]
ico[0].save(APP / "favicon.ico", format="ICO", sizes=[(48, 48), (32, 32), (16, 16)], append_images=ico[1:])
print("app icons written")

# ------------------------------------------------------------------ link preview, 1200x630
W, H = 1200, 630
card = Image.new("RGB", (W, H), INK)
d = ImageDraw.Draw(card)
logo = to_height(tagline_dark, 330)
card.paste(logo, ((W - logo.width) // 2, 92), logo)
d.line([(W // 2 - 60, 468), (W // 2 + 60, 468)], fill=(120, 124, 120), width=1)
f = ImageFont.truetype(str(FONTS / "IBMPlexSans-Regular.ttf"), 29)
line = "Monthly coup-risk forecasts for every country, filed in public and scored against what happens."
words, rows, cur = line.split(), [], ""
for w_ in words:
    t = (cur + " " + w_).strip()
    if d.textlength(t, font=f) > 880 and cur:
        rows.append(cur); cur = w_
    else:
        cur = t
rows.append(cur)
y = 500
for r in rows:
    d.text(((W - d.textlength(r, font=f)) / 2, y), r, font=f, fill=BONE)
    y += 40
card.save(APP / "opengraph-image.png", optimize=True)
card.save(APP / "twitter-image.png", optimize=True)
print("share image written", card.size)
