#!/usr/bin/env python3
"""crop.py shot.png out.png x0 y0 x1 y1 [scale] — crop a region given in CSS px of a DSF=scale screenshot."""
import sys
from PIL import Image
src, out, *box = sys.argv[1:]
k = float(box[4]) if len(box) > 4 else 3
Image.open(src).crop(tuple(int(float(v)*k) for v in box[:4])).save(out)
