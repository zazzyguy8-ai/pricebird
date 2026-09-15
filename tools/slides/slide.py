#!/usr/bin/env python3
"""
Burn TikTok-style captions onto a photo, at the size TikTok photo mode wants.

The look is the one every reselling slideshow on the app uses: heavy white
sans, thick black stroke, centred, no box behind it. It reads on a bright
photo and on a dark one, which is why it won and why we are not inventing our
own.

    python3 slide.py photo.jpg out.png \
        --text "1. Find it in the bins" \
        --sub "(not a supplier)" \
        --at middle --handle "@theraghouse"

Text wraps itself and shrinks until it fits the safe width. Nothing is ever
clipped: if it will not fit at the smallest size the script says so and exits
rather than quietly cutting a word off.
"""

import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920                  # TikTok photo mode, 9:16
SIDE = 64                          # keeps text clear of the phone's edges
FONTS = '/mnt/skills/examples/canvas-design/canvas-fonts'
MAIN_FONT = os.path.join(FONTS, 'Outfit-Bold.ttf')
# The caption never starts lower than this: TikTok lays its own UI over the
# bottom fifth of the frame (caption, sound, buttons) and the right edge.
BOTTOM_SAFE = 360
TOP_SAFE = 180


def cover(img: Image.Image) -> Image.Image:
    """Fill 1080x1920 without squashing anything - crop the overflow instead."""
    scale = max(W / img.width, H / img.height)
    resized = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left = (resized.width - W) // 2
    top = (resized.height - H) // 2
    return resized.crop((left, top, left + W, top + H))


def wrap(draw, text, font, max_w):
    lines, line = [], ''
    for word in text.split():
        trial = f'{line} {word}'.strip()
        if draw.textlength(trial, font=font) <= max_w or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def fit(draw, text, max_w, start, floor=44):
    """Largest size at which the text wraps inside max_w. None if it never does."""
    for size in range(start, floor - 1, -2):
        font = ImageFont.truetype(MAIN_FONT, size)
        lines = wrap(draw, text, font, max_w)
        if all(draw.textlength(l, font=font) <= max_w for l in lines):
            return font, lines
    return None, None


def draw_block(draw, lines, font, top, stroke):
    gap = round(font.size * 1.14)
    for i, line in enumerate(lines):
        draw.text(
            (W // 2, top + i * gap), line,
            font=font, fill='white', anchor='ma',
            stroke_width=stroke, stroke_fill='black',
        )
    return top + len(lines) * gap


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('photo')
    ap.add_argument('out')
    ap.add_argument('--text', required=True)
    ap.add_argument('--sub', default='')
    ap.add_argument('--at', default='middle', choices=['top', 'middle', 'bottom'])
    ap.add_argument('--size', type=int, default=92)
    ap.add_argument('--handle', default='')
    # Photos do not put their subject in the same place twice. This nudges the
    # caption off whatever it landed on - negative is up.
    ap.add_argument('--offset', type=int, default=0)
    args = ap.parse_args()

    base = cover(Image.open(args.photo).convert('RGB'))
    draw = ImageDraw.Draw(base)
    max_w = W - SIDE * 2

    font, lines = fit(draw, args.text, max_w, args.size)
    if font is None:
        sys.exit(f'"{args.text}" will not fit on one slide. Shorten it - '
                 'a slide anyone can read in two seconds is about eight words.')

    sub_font, sub_lines = (None, [])
    if args.sub:
        sub_font, sub_lines = fit(draw, args.sub, max_w, round(args.size * 0.62))
        if sub_font is None:
            sys.exit(f'The second line "{args.sub}" will not fit. Shorten it.')

    block = round(font.size * 1.14) * len(lines)
    if sub_lines:
        block += round(sub_font.size * 1.2) * len(sub_lines) + 10

    if args.at == 'top':
        top = TOP_SAFE
    elif args.at == 'bottom':
        top = H - BOTTOM_SAFE - block
    else:
        top = (H - block) // 2

    top = max(TOP_SAFE, min(top + args.offset, H - BOTTOM_SAFE - block))
    y = draw_block(draw, lines, font, top, stroke=round(font.size * 0.09))
    if sub_lines:
        draw_block(draw, sub_lines, sub_font, y + 10, stroke=round(sub_font.size * 0.09))

    if args.handle:
        h_font = ImageFont.truetype(MAIN_FONT, 40)
        draw.text((W - SIDE, H - BOTTOM_SAFE + 120), args.handle, font=h_font,
                  fill=(255, 255, 255, 220), anchor='ra', stroke_width=3, stroke_fill='black')

    base.save(args.out, quality=95)
    print(f'{args.out}  {W}x{H}  "{args.text}"')


if __name__ == '__main__':
    main()
