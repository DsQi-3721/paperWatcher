#!/usr/bin/env python3
"""Build the stationery figures: inline src/kit.js, then the Colorfigures build (inlines core.js, adds zoom etc.).

    python3 build.py                      # every src/NN-*.html -> NN-*.html next to this script
    python3 build.py src/01-pencil.html   # just one
"""
import glob, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.join(HERE, '..', '.claude', 'skills', 'colorfigures', 'scripts', 'build.py')
KIT = open(os.path.join(HERE, 'src', 'kit.js'), encoding='utf-8').read()

def build(src):
    page = open(src, encoding='utf-8').read()
    page, n = re.subn(r'<script\s+src=["\'](?:\./)?kit\.js["\']\s*>\s*</script>', lambda m: '<script>\n' + KIT + '\n</script>', page)
    if not n: sys.exit('no <script src="kit.js"></script> in ' + src)
    tmp = os.path.join(HERE, 'src', '.build-' + os.path.basename(src))
    open(tmp, 'w', encoding='utf-8').write(page)
    try: subprocess.run([sys.executable, SKILL, tmp, os.path.join(HERE, os.path.basename(src))], check=True)
    finally: os.remove(tmp)

for src in sys.argv[1:] or sorted(glob.glob(os.path.join(HERE, 'src', '[0-9][0-9]-*.html'))): build(src)
