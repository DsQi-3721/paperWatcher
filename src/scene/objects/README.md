# Desk objects

Each `NN-name.js` is one stationery figure from `stationery/src/` living on the shared classroom desk. It was
wrapped by `scripts/port-figures.mjs`: the figure's code runs unchanged inside `export function create(ctx)`, with
locals at the top of the closure standing in for the page globals it used. **These modules are now the source**
(the `stationery/` pages are the old standalone gallery and stay as they are).

## Coordinates
- World = the desk's frame. Desk terms: **u** along the front edge (to the right, seen by the student), **v** toward
  the student, both mm from the desk's centre; z up. World x = v, world y = -u.
- The desk is a big bare top (no legs, no floor, no chair): u -900…900, v -500…500, top at **z = 4** (`ctx.deskZ`;
  every figure stood on a 4 mm board, so objects rest at z = 4 as before). Things that go over an edge fall and are
  gone: below the top nothing is drawn, so remove a fallen thing (don't leave it at `ctx.floorZ`, which is only a
  depth to fall to).
- The 三八线 (chalk, drawn by the scene) is u = 0: the student's half is u < 0, the deskmate's u > 0.
- `PLACE = { u, v, rot }` (exported by each module) is where the module's own frame sat in the first layout.
  `src/scene/layout.ts` scatters the desk by moving whole groups rigidly (`GROUPS`, `GROUP_OF`): a shared paper with
  the objects working on it, or one object with its own props. The runtime applies the move to `ctx.desk` and to
  `ctx.paper(...)`, so a module's own coordinates keep working unchanged. G1 (S1 · 01 · 04 · 07) only slides back by
  the depth the desk grew, so the ruler's twang edge (`250 - PLACE.v` in its frame) is the real front edge; G2
  (S4 · 02 · 06) only slides toward the front, so the eraser's frame u is still desk u (its 三八线 test).

## ctx
| | |
|---|---|
| `ctx.desk` | the module's frame helpers (see above); `deskBoard()` draws nothing (the desk is the scene's) |
| `ctx.paper(id)` | a shared paper's own frame: `dk(pu, pv, z)` etc. with **pu across the page, pv down it, from its top-left corner**; `.w`, `.h`, `.z` (its top surface), `.thick`; `deskText` / `deskHand` write on it |
| `ctx.paper('book')` | the deskmate's closed 语文 textbook on their side (its cover's frame, `.z` = the cover): the sticky note's target |
| `ctx.onDesk(p)` | is a world point over the desk top (things that slide or fly off it fall and are gone) |
| `ctx.now()` | the scene's clock in ms (use it, or the `dt` of `ui.animate`, instead of `performance.now()`) |
| `ctx.later(ms, fn?, key?)` | wake once after ms while the desk is looked at: run fn, or just redraw (a clock's next minute) |
| `ctx.ui` | `{ st, animate(step), invalidate(), render(), flash(text, ms) }` — as before |
| `ctx.play` | `{ kPlay, kBusy }`: this object's own one-at-a-time lock |
| `castShadow(pts, z0)` | collected into the scene's shadow layer (clipped to the desk top); a mark is left in the string: what the figure drew **before its first `castShadow`** is its flat ground (marks on paper, crumbs), what comes after is its body |
| `zhCallouts(items)` | label items are collected; the scene draws them for the object whose menu is open |

The object's box (for sorting against other objects and placing its menu) is the bounds of every point drawn
through `pd()` after its first `castShadow`.

## Shared papers and props (drawn by the scene, `src/scene/layout.ts`; rects before the group move)
| id | what | first-layout rect (u0, v0, u1, v1), turn | bands (pv, from the top edge; the title is at pv ≈ 12) |
|---|---|---|---|
| S1 | 数学小测 16K | (-597, -14, -411, 248), 1.5° | 01 pencil 22–64 · 04 correction tape 72–150 · 07 ruler 158–250 |
| S4 | 英语默写 16K, red margin at pu 18 | (-190, -20, -6, 242), -1° | 02 click pen 22–120 · 06 eraser 128–250 |
| S2 | 数学练习 A4 long-ways, 5 mm grid | (6, 40, 302, 248), 1° | 08 compass: left part · 10 calculator: right part |
| S3 | 期中考试, a stack of 40 sheets | (22, -112, 238, 22), -2° | 14 binder clip / paperclips hold it · 09 stapler staples it |
| blank | the reading spot (A4), mid student's half | desk (-225, -188.5, -15, 108.5), -3° | nothing may lie on it, nor in the close top-down reading view round it (a paper lands here to be read; clicking it imports) |
| book | the deskmate's 语文 textbook | desk (557.5, 43, 742.5, 293), -8° | the sticky note "我是猪" goes on its cover |

Unique props stay with their object: 01 lead case · 03 字帖 + ink bottle · 05 memo pad and a small desk bin ·
09 staple box · 12 数学作业本 · 13 planner · 14 clip tray · 06 the deskmate's eraser (on the deskmate's side, u > 0).
The history piles take the two back corners and the left middle.

## New objects (15–20): written for the desk
These have no standalone page: they are written straight as desk modules, in the same style and to the same rules
as 01–14 (and the colorfigures skill: truth first, every angle, see-through for real mechanisms, labels on parts).
Each has a slot (its frame's origin is the slot's centre; stay inside the footprint; the reading window round the
blank sheet must stay clear, and so must the neighbours):

| n | id | what | PLACE (u, v, rot) | footprint u × v, max height |
|---|---|---|---|---|
| 15 | desk-calendar | 台历: A-frame desk flip calendar facing the student | (470, -430, 0) | 170 × 100, 130 |
| 16 | alarm-clock | 闹钟: twin-bell mechanical alarm clock | (-500, 300, 12) | 130 × 90, 150 |
| 17 | fish-tank | 小鱼缸: small glass tank, two fish, a hang-on filter | (-760, -370, 0) | 230 × 150, 190 |
| 18 | potted-plant | 小盆栽: a small pot with a plant, saucer, watering prop | (330, -300, 0) | 130 × 130, 240 |
| 19 | thermos | 保温杯: vacuum flask, screw lid, tea strainer | (-300, 400, 0) | 140 × 100 (lid set down beside), 240 |
| 20 | mp3-player | MP3 随身听 with wired earphones | (570, 390, -10) | 170 × 140, 15 |

- The real date and time are fine to use (`new Date()`): a calendar shows today, a clock today's time. For anything
  that changes with real time, call `ctx.later(ms)` from `scene()` (e.g. the ms to the next minute): the object is
  redrawn then, only while the desk is being looked at. `ctx.later(ms, fn, key)` runs fn instead (start a short
  animation: a fish's swim now and then). Never setInterval/setTimeout yourself; keep idle work rare and short.
- What an object says (`ui.flash`) is shown as a speech bubble coming out of it: write it as the object grumbling or
  remarking in the first person, short and playful (`咔哒还没按完`), not as a status line. Stats are not shown.
- The student can move and turn any object on the desk (arrange mode, done by the runtime and the scene). A module
  needs nothing for that, but must not assume absolute desk positions outside its own frame: desk edges only through
  `ctx.onDesk(worldPoint)`, papers only through `ctx.paper(id)`.

## Adapting a figure (checklist)
1. Remove its own board(s) and copies of shared papers; print only its band's text on the shared paper through
   `ctx.paper(id)` (and draw its marks at that paper's `.z`).
2. Re-anchor rest poses on the shared desk (true sizes, 1 unit = 1 mm). Remove `size/center: DESK.*` from the config
   and the `deskSetup` call.
3. Desk-edge logic (`DLU/2`, `DLV/2`) → `ctx.onDesk(worldPoint)` and the real edges; things leaving the desk fall and
   are removed.
4. `performance.now()` → `dt` / `ctx.now()`; `Math.random` → `kRng(seed)`; no `setInterval`/`setTimeout` loops (an
   animate step that ends).
5. Shadows: `castShadow(pts, z)` with the surface's z (no clip needed). Keep every rule of drawing from every angle.
6. Labels (`zhCallouts`) and stats stay as they were; buttons keep their real-use-first order.

## Checks
- `npx tsx --test tests/objects.test.ts` — every object, every button and choice, several cameras: must stay green.
- Dev server (already running): `http://127.0.0.1:5312/scene-lab.html`. Screenshots:
  `node scripts/scene-shot.mjs .shots/x.png 'focus=NN&zoom=4&yaw=18&pitch=42&labels=1&xr=1&run=NN:Label@300' 2500 1440 900 2`
  (`focus` centres on an object, `run` presses its buttons by label prefix at those ms; `Label>Choice` for pickers).
  Check yaw 18 / 110 / 200 / 290 and pitch 20 / 42 / 75, and a whole-desk shot (no `focus`) for neighbours.
