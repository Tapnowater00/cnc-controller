#!/usr/bin/env python3
"""
Generate the CNC Controller app icon at multiple resolutions.

Design: a stylized work-origin marker.
- Rounded zinc-950 background.
- Outer cyan ring (the spindle/collet seen from above).
- Inner glowing green tool dot.
- White crosshair (the X/Y work-origin axes) through center.
- Subtle inner bevel for depth.

Outputs:
    build/icon.png       (1024x1024 master)
    build/icon-512.png   (Linux AppImage)
    build/icon-256.png
    build/icon.ico       (multi-resolution Windows icon: 16/24/32/48/64/128/256)
"""

from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

BUILD = Path(__file__).resolve().parent

ZINC_950   = (9, 9, 11)
ZINC_900   = (24, 24, 27)
ZINC_800   = (39, 39, 42)
BLUE_500   = (59, 130, 246)
BLUE_400   = (96, 165, 250)
GREEN_400  = (74, 222, 128)
GREEN_500  = (34, 197, 94)
AMBER_400  = (251, 191, 36)
WHITE      = (250, 250, 250)


def draw_icon(size: int) -> Image.Image:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    s = size  # shorthand
    cx, cy = s // 2, s // 2

    # Rounded background
    radius = int(s * 0.18)
    d.rounded_rectangle((0, 0, s, s), radius=radius, fill=ZINC_950)

    # Subtle inner border
    pad = max(2, int(s * 0.04))
    d.rounded_rectangle(
        (pad, pad, s - pad, s - pad),
        radius=radius - pad // 2,
        outline=ZINC_800,
        width=max(1, int(s * 0.008)),
    )

    # Soft glow under the spindle ring — done with a blurred ring on a
    # separate layer composited back in.
    glow = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    glow_r = int(s * 0.34)
    gw = max(2, int(s * 0.06))
    gd.ellipse(
        (cx - glow_r, cy - glow_r, cx + glow_r, cy + glow_r),
        outline=BLUE_400 + (120,),
        width=gw,
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=s * 0.025))
    img.alpha_composite(glow)

    # Spindle / collet outer ring (the dominant element)
    ring_r = int(s * 0.30)
    ring_w = max(2, int(s * 0.05))
    d.ellipse(
        (cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r),
        outline=BLUE_500,
        width=ring_w,
    )

    # Crosshair (X and Y work-origin axes) extending through the ring
    arm = int(s * 0.42)
    line_w = max(1, int(s * 0.025))
    # Horizontal (X)
    d.line((cx - arm, cy, cx + arm, cy), fill=WHITE, width=line_w)
    # Vertical (Y)
    d.line((cx, cy - arm, cx, cy + arm), fill=WHITE, width=line_w)

    # Tick marks at the ring intersections — adds the CNC scale feel
    tick = int(s * 0.035)
    tw = max(1, int(s * 0.018))
    for (tx, ty) in [(cx + ring_r, cy), (cx - ring_r, cy),
                     (cx, cy + ring_r), (cx, cy - ring_r)]:
        # Each tick is a small perpendicular bump
        if ty == cy:
            d.line((tx, cy - tick, tx, cy + tick), fill=AMBER_400, width=tw)
        else:
            d.line((cx - tick, ty, cx + tick, ty), fill=AMBER_400, width=tw)

    # Center tool dot (highlighted with a soft inner glow)
    dot_r = int(s * 0.06)
    inner_glow = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    igd = ImageDraw.Draw(inner_glow)
    igd.ellipse(
        (cx - dot_r * 2, cy - dot_r * 2, cx + dot_r * 2, cy + dot_r * 2),
        fill=GREEN_500 + (100,),
    )
    inner_glow = inner_glow.filter(ImageFilter.GaussianBlur(radius=s * 0.02))
    img.alpha_composite(inner_glow)

    d.ellipse(
        (cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r),
        fill=GREEN_400,
    )

    return img


def main() -> None:
    master = draw_icon(1024)
    master.save(BUILD / 'icon.png', optimize=True)

    # Sized PNGs
    for size in (512, 256):
        img = master.resize((size, size), Image.LANCZOS)
        img.save(BUILD / f'icon-{size}.png', optimize=True)

    # Multi-resolution .ico for Windows. PIL bundles a separate IFD per size.
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    master.save(BUILD / 'icon.ico', sizes=[(s, s) for s in ico_sizes])

    print('wrote:')
    for f in sorted(BUILD.glob('icon*')):
        print('  ', f, f.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
