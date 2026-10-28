# 文具盒 · Stationery set

A set of interactive stationery figures made with the Colorfigures skill (`.claude/skills/colorfigures`). It is
separate from Paper Watcher: nothing in `src/` or the app loads these files.

Open `index.html` for the gallery, or any `NN-*.html` on its own (each is one self-contained file). Drag to turn the
figure, use See-through to look inside, Labels to name the parts. The buttons run the real use first, then the
school-days ones.

## Layout

- `src/NN-*.html`: the figure sources. They load `core.js` (a copy of the skill's engine, for working in the browser)
  and `kit.js` (helpers shared by the set: Chinese labels, things on an axis, the desk turned toward the viewer,
  paper and handwriting, one-action-at-a-time sequencing).
- `NN-*.html`: the built single-file figures.
- `thumbs/NN.png`: gallery thumbnails.

## Commands

    python3 build.py                 # build every src/NN-*.html (inlines kit.js, then the skill's build.py)
    python3 build.py src/01-mechanical-pencil.html
    python3 thumbs.py                # re-render the gallery thumbnails (needs Chrome and Pillow)
    ./shoot.sh 01-mechanical-pencil.html p 'yaw=200' 'xr=1&labels=1'   # headless checks into shots/

`shots/` is scratch output from `shoot.sh` (safe to empty).
