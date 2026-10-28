#!/usr/bin/env python3
"""Render a thumbnail of every built figure for the gallery: thumbs/NN.png, cropped to the drawing.

    python3 thumbs.py          # all NN-*.html next to this script
    python3 thumbs.py 03 07    # just these
"""
import glob, os, subprocess, sys, tempfile
from PIL import Image, ImageChops
HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
os.makedirs(os.path.join(HERE, 'thumbs'), exist_ok=True)
# a figure whose best face is not its first state gets its own view here
VIEW = { '11': 'all=1', '08': 'circles=2_3&r=3' }

def shoot(html, out, q=''):
    raw = out + '.raw.png'
    with tempfile.TemporaryDirectory() as ud:
        subprocess.run([CHROME, '--headless=new', '--hide-scrollbars', f'--user-data-dir={ud}', '--window-size=800,600',
                        '--force-device-scale-factor=1.5', '--virtual-time-budget=2500', f'--screenshot={raw}',
                        f'file://{html}?thumb=1' + (('&' + q) if q else '')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    im = Image.open(raw).convert('RGB')
    # the paper colour is the top-left pixel; crop to everything that differs from it, with a margin
    bg = Image.new('RGB', im.size, im.getpixel((4, 4)))
    diff = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 28 else 0)
    box = diff.getbbox() or (0, 0, *im.size)
    m = 30; x0, y0, x1, y1 = max(0, box[0] - m), max(0, box[1] - m), min(im.width, box[2] + m), min(im.height, box[3] + m)
    # a 4:3 window round the drawing's centre, so the cards line up
    w, h = x1 - x0, y1 - y0
    if w / h > 4/3: h = w*3/4
    else: w = h*4/3
    cx, cy = (x0 + x1)/2, (y0 + y1)/2
    # keep the window on the shot (slide it in); if it is bigger than the shot, pad with the paper colour
    l = min(max(0, cx - w/2), max(0, im.width - w)); t = min(max(0, cy - h/2), max(0, im.height - h))
    canvas = Image.new('RGB', (int(w), int(h)), im.getpixel((4, 4)))
    canvas.paste(im.crop((int(l), int(t), int(min(im.width, l + w)), int(min(im.height, t + h)))),
                 (int((w - min(w, im.width))/2), int((h - min(h, im.height))/2)))
    crop = canvas.resize((720, 540), Image.LANCZOS)
    crop.save(out, optimize=True)
    os.remove(raw)

want = set(sys.argv[1:])
for html in sorted(glob.glob(os.path.join(HERE, '[0-9][0-9]-*.html'))):
    n = os.path.basename(html)[:2]
    if want and n not in want: continue
    shoot(html, os.path.join(HERE, 'thumbs', n + '.png'), VIEW.get(n, ''))
    print('thumbs/' + n + '.png')
