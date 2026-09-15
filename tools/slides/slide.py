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

from PIL import Image, ImageChops, ImageDraw, ImageFont

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


def trim(img):
    """Drop the empty margin a logo file always ships with.

    Sizing a logo by its file is sizing its whitespace: two marks exported at
    the same pixel size land at different optical sizes on the slide. Trimming
    to the ink first makes --logo-h mean the same thing every time.
    """
    img = img.convert('RGBA')
    alpha = img.getchannel('A')
    box = alpha.getbbox() if alpha.getextrema()[0] < 250 else None
    if box is None:
        # Flat white background rather than transparency: measure against the
        # corner pixel, which is background on every logo export we have seen.
        rgb = img.convert('RGB')
        bg = Image.new('RGB', rgb.size, rgb.getpixel((0, 0)))
        box = ImageChops.difference(rgb, bg).convert('L').point(lambda v: 255 if v > 12 else 0).getbbox()
    img = img.crop(box) if box else img

    if img.getchannel('A').getextrema()[0] >= 250:
        # It came from a JPEG, so it has no transparency and a rectangular trim
        # leaves the background sitting in the corners. App icons are rounded
        # squares, so rounding the mask to match takes the corners off without
        # touching white that is part of the mark itself - keying out white
        # would have eaten the Vinted V.
        mask = Image.new('L', img.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, img.width - 1, img.height - 1],
            radius=round(min(img.size) * 0.225), fill=255)
        img.putalpha(mask)
    return img


def place(base, path, height, xy, anchor):
    mark = trim(Image.open(path))
    w = round(mark.width * height / mark.height)
    mark = mark.resize((w, height), Image.LANCZOS)
    x, y = xy
    if anchor == 'rb':
        x, y = x - w, y - height
    elif anchor == 'mt':
        x = x - w // 2
    base.alpha_composite(mark, (x, y))
    return height


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
    ap.add_argument('--logo', default='', help='brand mark, small, bottom right')
    ap.add_argument('--badge', default='', help='platform mark, large, under the caption')
    args = ap.parse_args()

    base = cover(Image.open(args.photo).convert('RGB')).convert('RGBA')
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

    if args.badge:
        place(base, args.badge, 300, (W // 2, y + 34), 'mt')

    if args.logo:
        # Bottom right, clear of TikTok's own furniture. Small on purpose: a
        # brand mark that competes with the photo is an advert, and this set
        # is not one.
        place(base, args.logo, 190, (W - SIDE, H - BOTTOM_SAFE), 'rb')

    if args.handle:
        h_font = ImageFont.truetype(MAIN_FONT, 40)
        draw.text((W - SIDE, H - BOTTOM_SAFE + 120), args.handle, font=h_font,
                  fill=(255, 255, 255, 220), anchor='ra', stroke_width=3, stroke_fill='black')

    base.convert('RGB').save(args.out, quality=95)
    print(f'{args.out}  {W}x{H}  "{args.text}"')


if __name__ == '__main__':
    main()
