#!/usr/bin/env python3
"""Contactvellen voor de visuele kleurcontrole.

Bouwt PNG-rasters met de hoofdafbeelding van elke variant, met variantnaam, product
en EAN eronder. Bekijk die vellen met de Read-tool voordat je naar een marketplace
pusht: de kleurnaam in Shopify heeft eerder omgekeerd gestaan ten opzichte van het
beeld (Mavis, Lua, Miles), en dat is met datavergelijking niet te vinden.

Vereist alleen variant-images.json (uit map-images.js). Haalt de thumbnails zelf op.

    python3 sheets.py            # -> sheet-1.png, sheet-2.png, ...
"""
import io
import json
import math
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
CELL, PAD, LABEL_H, COLS, ROWS = 190, 12, 46, 6, 3


def load_font(size):
    for path in ('/System/Library/Fonts/Supplemental/Arial Bold.ttf',
                 '/System/Library/Fonts/Helvetica.ttc'):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def thumb(url):
    """Shopify levert een verkleinde versie via ?width= — scheelt fors downloaden."""
    try:
        req = urllib.request.Request(url.split('?')[0] + '?width=200',
                                     headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            return Image.open(io.BytesIO(r.read())).convert('RGB')
    except Exception:
        return None


def main():
    with open(os.path.join(HERE, 'variant-images.json'), encoding='utf-8') as f:
        variants = json.load(f)

    items = sorted(
        ((d['product'], d['variant'], ean, d['images'][0]['url'])
         for ean, d in variants.items() if d['images']),
        key=lambda x: (x[0], x[1]))

    with ThreadPoolExecutor(10) as pool:
        images = list(pool.map(thumb, (i[3] for i in items)))

    f_name, f_meta = load_font(13), load_font(11)
    per_sheet = COLS * ROWS
    sheets = []

    for start in range(0, len(items), per_sheet):
        batch = items[start:start + per_sheet]
        thumbs = images[start:start + per_sheet]
        rows = math.ceil(len(batch) / COLS)
        canvas = Image.new('RGB',
                           (COLS * (CELL + PAD) + PAD, rows * (CELL + LABEL_H + PAD) + PAD),
                           'white')
        draw = ImageDraw.Draw(canvas)

        for i, ((product, variant, ean, _), im) in enumerate(zip(batch, thumbs)):
            x = PAD + (i % COLS) * (CELL + PAD)
            y = PAD + (i // COLS) * (CELL + LABEL_H + PAD)
            if im is not None:
                im = im.copy()
                im.thumbnail((CELL, CELL))
                canvas.paste(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2))
            draw.rectangle([x, y, x + CELL, y + CELL], outline='#ddd')
            draw.text((x, y + CELL + 4), variant[:26], fill='black', font=f_name)
            draw.text((x, y + CELL + 20), product[:30], fill='#666', font=f_meta)
            draw.text((x, y + CELL + 33), ean, fill='#999', font=f_meta)

        name = os.path.join(HERE, f'sheet-{len(sheets) + 1}.png')
        canvas.save(name)
        sheets.append(name)

    print('\n'.join(os.path.basename(s) for s in sheets))
    print(f'{len(items)} varianten op {len(sheets)} vellen — bekijk ze met de Read-tool')


if __name__ == '__main__':
    main()
