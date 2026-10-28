// Fig. 10 计算器 — desk-scene object, ported from stationery/src/10-calculator.html by scripts/port-figures.mjs.
// The figure's own code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*),
// ctx.ui its ui (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are
// collected by the scene.
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: 235, v: 165, rot: 0 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 10 — School calculator: an 8-digit, two-way-power (solar + button cell) desk calculator lying on the right part of
     the 数学练习 sheet (S2) on the shared desk; the sums it works are pencilled on S2 beside it. 1 unit = 1 mm.
     The calculator has its own frame: a across its width (to the right), b along its length toward the user (the keys end),
     z up from its underside; calP(a, b, z) gives the world point, so it can turn on the desk.

     How it really works (each button is one of these):
     1. A key is a plastic cap on a silicone rubber dome; pressing collapses the dome and the carbon pill under it bridges
        two interleaved copper combs on the circuit board. The chip (bonded straight onto the board, under a black epoxy
        blob) scans the combs, works the sum, and drives the LCD through a zebra strip: a rubber bar of alternating
        conducting and insulating layers pressed between the board's pads and the glass's contacts.
     2. The LCD is two glass plates with liquid crystal between them and polarisers outside; a driven segment turns dark.
     3. Power: an amorphous-silicon solar cell under the window over the display, wired to the board by two leads, and a
        button cell in a clip. This one's cell went flat years ago, so it runs on the solar cell alone: cover the cell and
        the voltage sags, the digits fade, and the chip forgets everything (it comes back showing 0.).
     4. Basic logic: immediate execution; = repeats the last operation (1 + 1 = = = counts up; with x the first number is
        the constant); dividing by zero or running past 8 digits shows E and locks the keys until AC or C.
     Student life: 0.7734 turned upside down reads hELLO; 1 / 0 = E; the deskmate's hand reaching over to cover the solar
     cell and wipe your sum; hammering = to watch it count.

     Parts:
     CASE     bottom shell . top case (a seam where they meet) . solar window . display bezel and its recessed window .
              keypad panel . key holes . printing
     KEYS     25 keycaps (digits, 00, point, operations, memory, AC/C, =), each with a flange that keeps it in its hole
     BOARD    circuit board . 4 screw posts . 25 pairs of interleaved key contacts . LCD pads . chip under its epoxy blob .
              traces
     KEYPAD   silicone dome sheet . 25 domes . 25 carbon pills
     DISPLAY  zebra strip . LCD frame . LCD glass (two plates) . polariser . 8 seven-segment digits with decimal points .
              M / E / minus indicators
     POWER    solar cell (4 cells in series) . its two leads . button cell (LR1130) . its clip . the clip's tab to the board
     DESK     four sums printed on S2 (answers pencilled in once worked) . the deskmate's hand (mitten-like: palm and fingers
              in one, a thumb) that covers the solar window */

  /* ---------- on the shared desk: lying on the right part of S2, a little crooked ---------- */
  const BH = ctx.deskZ, S2 = ctx.paper('S2'), ZP = S2.z;
  const CAL_AT = [233, 104];                                       // its centre on S2 (pu, pv)
  const [CAL_U, CAL_V] = (() => { const q = undk(S2.dk(CAL_AT[0], CAL_AT[1], 0)); return [q[0], q[1]]; })();
  const TH0 = -6*Math.PI/180;
  const CW = 96, CL = 140, CH = 13, CRAD = 7;
  const ZLCD = CH - 1.6;                                           // the LCD surface, at the bottom of the window's recess
  const WIN = [-40, -47, 40, -25];                                 // display window: a0, b0, a1, b1
  const SOLAR = [-8, -66, 42, -56];                                 // solar window
  const PAD = [-45.5, -14, 45.5, 68];                               // keypad panel

  /* ---------- the calculator's own frame (set once per drawing from the state) ---------- */
  let calCA = [1, 0, 0], calCB = [0, 1, 0], calO = [0, 0, 0];
  function calFrame(st){ const t = st.th; calCA = dkv(Math.cos(t), Math.sin(t)); calCB = dkv(-Math.sin(t), Math.cos(t)); calO = dk(CAL_U, CAL_V, ZP + st.lift); }
  const calP = (a, b, z) => [calO[0] + calCA[0]*a + calCB[0]*b, calO[1] + calCA[1]*a + calCB[1]*b, calO[2] + z];
  const calRR = (a0, b0, a1, b1, r, z, n = 4) => rrUV(a0, b0, a1, b1, r, n).map(([a, b]) => calP(a, b, z));
  const calRect = (a0, b0, a1, b1, z) => rectUV(a0, b0, a1, b1).map(([a, b]) => calP(a, b, z));
  const calBoxPts = (a0, b0, z0, a1, b1, z1) => oboxPts(calP((a0 + a1)/2, (b0 + b1)/2, (z0 + z1)/2), calCA, calCB, [0, 0, 1], (a1 - a0)/2, (b1 - b0)/2, (z1 - z0)/2);
  const calBox = (a0, b0, z0, a1, b1, z1, M, w = .7) => obox(calP((a0 + a1)/2, (b0 + b1)/2, (z0 + z1)/2), calCA, calCB, [0, 0, 1], (a1 - a0)/2, (b1 - b0)/2, (z1 - z0)/2, M, toneI, w);
  const calText = (a, b, z, str, size, col = INK, weight = 800, anchor = 'middle') => txOn(calP(a, b, z), calCA, [0, 0, 1], str, size, col, weight, anchor);
  const calStroke = (pts, col, w) => `<path d="${pd(pts, false)}" fill="none" stroke="${col}" style="stroke-width:${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

  /* ---------- keys ---------- */
  const K_DIG = MAT.plastic, K_OP = matOf('#5b5650'), K_MEM = matOf('#c6ccce'), K_AC = matOf('#ef6a4c'), K_EQ = matOf('#f4b829');
  const KEYROWS = [
    ['AC', 'C', 'sqrt', '%', '/'],
    ['MR', '7', '8', '9', '*'],
    ['M-', '4', '5', '6', '-'],
    ['M+', '1', '2', '3', '+'],
    ['MC', '0', '00', '.', '='] ];
  const KEYS = [];
  KEYROWS.forEach((row, r) => row.forEach((id, c) => {
    const M = /^[0-9.]|^00$/.test(id) ? K_DIG : id === 'AC' || id === 'C' ? K_AC : id === '=' ? K_EQ : id[0] === 'M' ? K_MEM : K_OP;
    KEYS.push({ id, a: -34.4 + 17.2*c, b: -5 + 16.4*r, M, ink: M === K_OP || M === K_AC ? '#ffffff' : INK }); }));
  const KEY_OF = Object.fromEntries(KEYS.map(k => [k.id, k]));
  // legends drawn as strokes (x right, y up on the key) for the signs a monospace font may not have
  const GLYPH = {
    '+': [[[-2.2, 0], [2.2, 0]], [[0, -2.2], [0, 2.2]]],
    '-': [[[-2.2, 0], [2.2, 0]]],
    '*': [[[-1.7, -1.7], [1.7, 1.7]], [[-1.7, 1.7], [1.7, -1.7]]],
    '/': [[[-2.2, 0], [2.2, 0]], [[0, 1.6], [0, 1.75]], [[0, -1.6], [0, -1.75]]],
    '=': [[[-2.2, .9], [2.2, .9]], [[-2.2, -.9], [2.2, -.9]]],
    'sqrt': [[[-2.8, -.2], [-2, -.5], [-.9, -2.2], [.4, 2.3], [2.8, 2.3]]] };
  function keySvg(K, st, z0){
    const kd = st.kd[K.id] || 0, z1 = CH + 2.6 - 1.7*kd;
    const A = calRR(K.a - 7, K.b - 6.5, K.a + 7, K.b + 6.5, 2.4, z0, 3), B = calRR(K.a - 6.6, K.b - 6.1, K.a + 6.6, K.b + 6.1, 2.1, z1, 3);
    let s = loft(A, B, n => toneI(n, K.M)) + fill(pd(B), K.M.l) + ink(pd(B), .6);
    const zt = z1 + .02;
    if (GLYPH[K.id]) s += GLYPH[K.id].map(g => calStroke(g.map(([x, y]) => calP(K.a + x, K.b - y, zt)), K.ink, .85)).join('');
    else s += calText(K.a, K.b + (K.id.length > 1 ? 1.4 : 2.1), zt, K.id, K.id.length > 1 ? 4.2 : 6, K.ink, 800);
    return act('key', s + hullInk([...A, ...B], 1), `data-k="${K.id}"`);
  }

  /* ---------- the arithmetic (a basic immediate-execution chip) ---------- */
  const calFresh = (mem = 0) => ({ cur: '0', acc: 0, op: null, fresh: true, kOp: null, kVal: 0, err: false, mem });
  const calRound = x => parseFloat(x.toPrecision(12));
  const calApply = (a, op, b) => calRound(op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a*b : b === 0 ? NaN : a/b);
  // a number as the display shows it: at most 8 digits, no trailing zeros after the point; null = too big (E)
  function calFmt(x){
    if (!isFinite(x)) return null;
    const neg = x < 0; x = Math.abs(x); if (x >= 1e8) return null;
    const il = Math.floor(x).toString().length; let s = x.toFixed(Math.max(0, 8 - il));
    if (s.replace('.', '').length > 8) s = s.slice(0, 9);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return (neg && +s !== 0 ? '-' : '') + s;
  }
  // one key into the chip; returns 'E' when it errors, 'locked' when it is ignored because of an error
  function calKey(c, id){
    if (c.err && id !== 'AC' && id !== 'C') return 'locked';
    const x = parseFloat(c.cur), set = r => { const s = calFmt(r); if (s == null){ c.err = true; c.cur = '0'; c.op = null; return false; } c.cur = s; return true; };
    if (/^[0-9]$|^00$/.test(id)){
      if (c.fresh){ c.cur = id === '00' ? '0' : id; c.fresh = false; return; }
      const room = 8 - c.cur.replace(/[-.]/g, '').length; if (room <= 0) return;
      c.cur = c.cur === '0' ? (id === '00' ? '0' : id) : c.cur + id.slice(0, room); return; }
    if (id === '.'){ if (c.fresh){ c.cur = '0.'; c.fresh = false; } else if (!c.cur.includes('.')) c.cur += '.'; return; }
    if ('+-*/'.includes(id)){
      if (c.op && !c.fresh && !set(calApply(c.acc, c.op, x))) return 'E';
      c.acc = parseFloat(c.cur); c.op = id; c.fresh = true; c.kOp = null; return; }
    if (id === '='){
      if (c.op){ const r = calApply(c.acc, c.op, x); c.kOp = c.op; c.kVal = c.op === '*' ? c.acc : x; c.op = null; c.fresh = true; if (!set(r)) return 'E'; }
      else if (c.kOp){ c.fresh = true; if (!set(c.kOp === '*' ? calApply(c.kVal, '*', x) : calApply(x, c.kOp, c.kVal))) return 'E'; }
      return; }
    if (id === 'sqrt'){ c.fresh = true; if (!set(x < 0 ? NaN : calRound(Math.sqrt(x)))) return 'E'; return; }
    if (id === '%'){ let r = x/100;
      if (c.op){ const a = c.acc; r = c.op === '*' ? a*x/100 : c.op === '/' ? (x === 0 ? NaN : a/x*100) : c.op === '+' ? a + a*x/100 : a - a*x/100; c.op = null; }
      c.fresh = true; if (!set(calRound(r))) return 'E'; return; }
    if (id === 'AC'){ Object.assign(c, calFresh(c.mem)); return; }
    if (id === 'C'){ c.cur = '0'; c.fresh = true; c.err = false; return; }
    if (id === 'M+' || id === 'M-'){ c.mem = calRound(c.mem + (id === 'M+' ? x : -x)); c.fresh = true; return; }
    if (id === 'MR'){ c.cur = calFmt(c.mem) || '0'; c.fresh = true; return; }
    if (id === 'MC'){ c.mem = 0; return; }
  }
  // what the LCD shows: 8 cells right-aligned, each a character and its decimal point; minus / E / M indicators
  function calCells(c){
    let s = c.err ? '0' : c.cur; const neg = s.startsWith('-'); if (neg) s = s.slice(1);
    const cells = [];
    for (const ch of s){ if (ch === '.'){ if (cells.length) cells[cells.length - 1].dp = true; else cells.push({ d: '0', dp: true }); } else cells.push({ d: ch, dp: false }); }
    if (!s.includes('.')) cells[cells.length - 1].dp = true;
    while (cells.length < 8) cells.unshift(null);
    return { cells: cells.slice(-8), neg, E: c.err, M: c.mem !== 0 };
  }

  /* ---------- power: solar cell only (the button cell is flat) ---------- */
  const calV = st => 1.55*Math.max(0, Math.min(1, 1 + .28*Math.log10(Math.max(1e-4, st.light))));
  const calContrast = st => Math.max(0, Math.min(1, (calV(st) - .85)/.45));

  /* ---------- the LCD ---------- */
  const SEG_T = 1.15;
  const hseg = (x0, x1, y) => [[x0, y], [x0 + SEG_T/2, y + SEG_T/2], [x1 - SEG_T/2, y + SEG_T/2], [x1, y], [x1 - SEG_T/2, y - SEG_T/2], [x0 + SEG_T/2, y - SEG_T/2]];
  const vseg = (x, y0, y1) => [[x, y0], [x + SEG_T/2, y0 + SEG_T/2], [x + SEG_T/2, y1 - SEG_T/2], [x, y1], [x - SEG_T/2, y1 - SEG_T/2], [x - SEG_T/2, y0 + SEG_T/2]];
  const SEG = { a: hseg(1.5, 6.1, 11), g: hseg(1.5, 6.1, 5.5), d: hseg(1.5, 6.1, 0), f: vseg(1, 5.8, 10.7), b: vseg(6.6, 5.8, 10.7),
    e: vseg(1, .3, 5.2), c: vseg(6.6, .3, 5.2), p: [[7.5, -.3], [8.5, -.3], [8.5, .7], [7.5, .7]] };
  const DIGIT = { '0':'abcdef', '1':'bc', '2':'abged', '3':'abgcd', '4':'fgbc', '5':'afgcd', '6':'afgedc', '7':'abc', '8':'abcdefg', '9':'abcdfg', '-':'g', 'E':'adefg' };
  const DIG_A0 = -29.6, DIG_W = 8.5, DIG_B = -29.4;                 // first cell's left, cell width, baseline (b)
  // the glass's face: background, faint unlit segments, the lit ones (fading with the voltage)
  function lcdFace(st, z){
    const cs = calCells(st.calc), con = st.dark ? 0 : calContrast(st);
    const at = (i, x, y) => calP(DIG_A0 + DIG_W*i + x + y*.09, DIG_B - y, z);
    let lit = '', dim = '';
    for (let i = 0; i < 8; i++){ const cell = cs.cells[i], on = cell ? DIGIT[cell.d] || '' : '';
      for (const k of 'abcdefgp'){ const isOn = k === 'p' ? !!(cell && cell.dp) : on.includes(k);
        const d = pd(SEG[k].map(([x, y]) => at(i, x, y))); if (isOn) lit += d; else dim += d; } }
    // indicators in the left margin: M (memory), E (error), minus
    const ind = (x, y) => calP(-37.4 + x + y*.09, DIG_B - y, z);
    const minus = pd(hseg(.4, 4.2, 4.6).map(([x, y]) => ind(x, y)));
    if (cs.neg) lit += minus; else dim += minus;
    let s = fill(pd(calRect(WIN[0], WIN[1], WIN[2], WIN[3], z - .005)), '#b9c5aa');
    s += `<path d="${dim}" fill="#1f241c" opacity=".06"/>`;
    if (con > 0 && lit) s += `<path d="${lit}" fill="#1f241c" opacity="${f(con)}"/>`;
    if (con > 0 && cs.M) s += `<g opacity="${f(con)}">${calText(-35.3, -38.3, z, 'M', 4, '#1f241c', 800)}</g>`;
    if (con > 0 && cs.E) s += `<g opacity="${f(con)}">${calText(-35.3, -31.6, z, 'E', 5.2, '#1f241c', 800)}</g>`;
    return s;
  }

  /* ---------- the closed calculator ---------- */
  function calSeam(z){   // the line where top case meets bottom shell, on the sides that face the viewer
    const ring = rrUV(-CW/2, -CL/2, CW/2, CL/2, CRAD, 5), n = ring.length; let d = '';
    for (let i = 0; i < n; i++){ const p = ring[i], q = ring[(i + 1) % n], e = [q[0] - p[0], q[1] - p[1]];
      const nr = kAdd(kScl(calCA, e[1]), kScl(calCB, -e[0])); if (vis(nr)) d += pd([calP(p[0], p[1], z), calP(q[0], q[1], z)], false); }
    return d ? `<path d="${d}" fill="none" stroke="${INK}" stroke-width=".7" opacity=".7"/>` : '';
  }
  function calBody(st, m){
    const A = calRR(-CW/2, -CL/2, CW/2, CL/2, CRAD, 0, 5), Bm = calRR(-CW/2, -CL/2, CW/2, CL/2, CRAD, CH - 1.4, 5), Bt = calRR(-CW/2 + 1, -CL/2 + 1, CW/2 - 1, CL/2 - 1, CRAD - 1, CH, 5);
    let s = loft(A, Bm, n => tone(n, m)) + loft(Bm, Bt, n => tone(n, m)) + fill(pd(Bt), tone([0, 0, 1], m)) + calSeam(5.5);
    const z = CH + .02;
    // solar window: four cells in series behind clear plastic
    s += shape(calRR(SOLAR[0], SOLAR[1], SOLAR[2], SOLAR[3], 1.5, z), '#2c2a2b', .8);
    s += fill(pd(calRect(SOLAR[0] + 1.5, SOLAR[1] + 1.5, SOLAR[2] - 1.5, SOLAR[3] - 1.5, z + .01)), '#6b2f35');
    let ln = ''; for (let i = 1; i < 4; i++){ const a = SOLAR[0] + 1.5 + i*(SOLAR[2] - SOLAR[0] - 3)/4; ln += pd([calP(a, SOLAR[1] + 1.5, z + .02), calP(a, SOLAR[3] - 1.5, z + .02)], false); }
    for (let b = SOLAR[1] + 3; b < SOLAR[3] - 2; b += 1.6) ln += pd([calP(SOLAR[0] + 1.5, b, z + .02), calP(SOLAR[2] - 1.5, b, z + .02)], false);
    s += `<path d="${ln}" fill="none" stroke="#a65a62" stroke-width=".5" opacity=".7"/>`;
    s += `<path d="${pd([calP(SOLAR[0] + 4, SOLAR[3] - 2, z + .03), calP(SOLAR[0] + 14, SOLAR[1] + 2, z + .03)], false)}" stroke="#ffffff" stroke-width="1.4" opacity=".35" stroke-linecap="round"/>`;
    s += calText(-44, -58.6, z, '学生计算器', 5, INK, 800, 'start') + calText(-44, -64.4, z, 'TWO WAY POWER', 2.4, INK, 700, 'start');
    s += calText(44, -16.2, z, '8 DIGITS', 2.6, INK, 700, 'end');
    // display bezel and its recessed window
    s += shape(calRR(-44, -51, 44, -21, 3, z), '#2f3133', .9);
    s += lcdWindow(st, true);
    // keypad panel and the holes the keys stand in
    s += shape(calRR(PAD[0], PAD[1], PAD[2], PAD[3], 4, z), '#3b3d40', .8);
    let holes = ''; for (const K of KEYS) holes += pd(calRR(K.a - 7.6, K.b - 7.1, K.a + 7.6, K.b + 7.1, 2.8, z + .01, 3));
    s += `<path d="${holes}" fill="#1a1b1c"/>`;
    s += hullInk([...A, ...Bt], 2.4);
    return s;
  }
  // the window's inner walls (the ones facing the viewer), then the LCD seen through the opening
  function lcdWindow(st, withFace){
    const [a0, b0, a1, b1] = WIN, z = CH + .03;
    let s = '';
    for (const [n, q] of [[calCB, [[a0, b0], [a1, b0]]], [kScl(calCB, -1), [[a0, b1], [a1, b1]]], [calCA, [[a0, b0], [a0, b1]]], [kScl(calCA, -1), [[a1, b0], [a1, b1]]]])
      if (vis(n)) s += fill(pd([calP(...q[0], ZLCD), calP(...q[1], ZLCD), calP(...q[1], z), calP(...q[0], z)]), '#232426');
    if (withFace) s += clipTo(calRect(a0, b0, a1, b1, z), lcdFace(st, ZLCD + .01));
    return s + ink(pd(calRect(a0, b0, a1, b1, z)), .9);
  }

  /* ---------- see-through: board, domes, zebra strip, glass, cells ---------- */
  const PCB_M = matOf('#3f8f5a'), GOLD = '#e0b84a';
  function calMech(st){
    const layers = [[], [], [], [], [], []], put = (l, at, svg) => layers[l].push({ at, svg });
    // bottom shell's floor and four screw posts
    layers[0].push({ at: calP(0, 0, 0), svg: `<g opacity=".55">${calBox(-CW/2 + 2, -CL/2 + 2, 0, CW/2 - 2, CL/2 - 2, 1.4, matOf('#d9d4c8'), .6)}</g>` });
    for (const [a, b] of [[-40, -50], [40, -50], [-40, 64], [40, 64]]){ const p = calP(a, b, 0);
      put(1, calP(a, b, 3), cyl(p[0], p[1], p[2] + 1.4, p[2] + 6, 1.6, matOf('#d9d4c8'), toneI, .7, 14)); }
    // button cell in its clip, under the brand print; the clip's tab runs to the board
    { const p = calP(-30, -61, 0);
      put(1, calP(-30, -61, 3), cyl(p[0], p[1], p[2] + 1.4, p[2] + 4.5, 5.8, MAT.steel, toneI, .9, 26)
        + calBox(-33, -66, 4.5, -27, -50, 5, MAT.steel, .6)
        + (vis([0, 0, 1]) ? calText(-30, -60, 4.52, '1130', 2.2, '#6d7275', 800) : '')); }
    // circuit board: interleaved key contacts, LCD pads, traces, the chip under its epoxy blob
    { const z = 7.21; let combA = '', combB = '', lit = '';
      for (const K of KEYS){ const on = (st.kd[K.id] || 0) > .75; let d1 = '', d2 = '';
        for (let i = 0; i < 4; i++){ const x = K.a - 3.6 + i*2.4; d1 += pd([calP(x, K.b - 3.6, z), calP(x, K.b + 2.4, z)], false); d2 += pd([calP(x + 1.2, K.b - 2.4, z), calP(x + 1.2, K.b + 3.6, z)], false); }
        d1 += pd([calP(K.a - 3.6, K.b + 3.6, z), calP(K.a + 3.6, K.b + 3.6, z)], false); d2 += pd([calP(K.a - 2.4, K.b - 3.6, z), calP(K.a + 4.8, K.b - 3.6, z)], false);
        if (on) lit += d1 + d2; else { combA += d1; combB += d2; } }
      let pads = ''; for (let a = -35; a <= 35; a += 1.4) pads += pd([calP(a, -27, z), calP(a, -25.6, z)], false);
      let tr = '';
      for (const K of KEYS) if (Math.abs(K.a) < 30 && K.b < 30) tr += pd([calP(K.a + 3.6, K.b - 4.2, z), calP(K.a + 3.6, -12, z), calP(0, -14.5, z)], false);
      tr += pd([calP(-30, -51, z), calP(-30, -40, z), calP(-6, -20, z)], false) + pd([calP(-4, -51, z), calP(-4, -21, z)], false);
      const pcb = calBox(-44, -53, 6, 44, 67, 7.2, PCB_M, .8)
        + `<path d="${tr}" fill="none" stroke="#7cc28f" style="stroke-width:.5" opacity=".8"/>`
        + `<path d="${combA + combB}" fill="none" stroke="${GOLD}" style="stroke-width:.55" stroke-linecap="round"/>`
        + (lit ? `<path d="${lit}" fill="none" stroke="#fff1a8" style="stroke-width:.75" stroke-linecap="round"/>` : '')
        + `<path d="${pads}" fill="none" stroke="${GOLD}" style="stroke-width:.8"/>`;
      put(2, calP(0, 0, 6.5), pcb);
      // epoxy blob: a low dome of rings
      const rings = [0, .5, .8, 1].map((t, i) => calRR(-4.4*Math.cos(t*1.2), -17.4 - 3.2*Math.cos(t*1.2), 4.4*Math.cos(t*1.2), -17.4 + 3.2*Math.cos(t*1.2), 3*Math.cos(t*1.2), 7.2 + 1.9*Math.sin(t*Math.PI/2), 3));
      let blob = ''; for (let i = 0; i < 3; i++) blob += loft(rings[i], rings[i + 1], n => toneI(n, DARK));
      put(3, calP(0, -17.4, 8), blob + fill(pd(rings[3]), DARK.l) + hullInk([...rings[0], ...rings[3]], .9)); }
    // silicone dome sheet: translucent, a dome under every key, a carbon pill under each dome
    { const SIL = { l:'#e3ebe9', m:'#cbd8d5', d:'#a7b8b4' };
      put(3, calP(0, 26, 7.5), `<g opacity=".7">${calBox(PAD[0] + 1, PAD[1] + 1, 7.2, PAD[2] - 1, PAD[3] - 1, 7.8, SIL, .6)}</g>`);
      for (const K of KEYS){ const kd = st.kd[K.id] || 0, top = 10.4 - 2.1*kd, pz = Math.max(7.25, top - 2.6);
        const pill = fill(pd(calRR(K.a - 2.2, K.b - 2.2, K.a + 2.2, K.b + 2.2, 2.2, pz, 3)), '#1d1a16');
        const A = calRR(K.a - 5, K.b - 5, K.a + 5, K.b + 5, 5, 7.8, 3), B = calRR(K.a - 3.4, K.b - 3.4, K.a + 3.4, K.b + 3.4, 3.4, top, 3);
        const dome = `<g opacity=".72">${loft(A, B, n => toneI(n, SIL)) + fill(pd(B), SIL.l)}</g>` + ink(pd(B), .5) + hullInk([...A, ...B], .6);
        put(4, calP(K.a, K.b, 8.5), pill + dome); } }
    // zebra strip under the glass's near edge, the frame under its far edge, the glass with its polariser and digits
    { let st2 = ''; for (let a = -35.5; a <= 35.5; a += .9) st2 += pd([calP(a, -27.2, 9.42), calP(a, -25.4, 9.42)], false);
      const ZEB = matOf('#d8c8c2');
      let zs = calBox(-36, -27.2, 7.2, 36, -25.4, 9.4, ZEB, .6) + `<path d="${st2}" fill="none" stroke="#3a3436" style="stroke-width:.35"/>`;
      if (vis(calCB)){ let fr = ''; for (let a = -35.5; a <= 35.5; a += .9) fr += pd([calP(a, -25.38, 7.3), calP(a, -25.38, 9.3)], false); zs += `<path d="${fr}" fill="none" stroke="#3a3436" style="stroke-width:.35"/>`; }
      put(4, calP(0, -26.3, 8.3), zs);
      put(4, calP(0, -46.5, 8.3), calBox(-41, -48, 7.2, 41, -45, 9.4, matOf('#9a9890'), .6));
      const glass = `<g opacity=".55">${calBox(-41, -48, 9.4, 41, -24, 11.2, MAT.clear, .6)}</g>` + lcdFace(st, 11.22);
      put(5, calP(0, -36, 10.3), glass);
      // solar cell, its two leads down to the board
      const cell = calBox(SOLAR[0] + 1, SOLAR[1] + 1, 10.4, SOLAR[2] - 1, SOLAR[3] - 1, 11.2, matOf('#7a3a41'), .6);
      let lines = ''; for (let i = 1; i < 4; i++){ const a = SOLAR[0] + 1 + i*(SOLAR[2] - SOLAR[0] - 2)/4; lines += pd([calP(a, SOLAR[1] + 1, 11.22), calP(a, SOLAR[3] - 1, 11.22)], false); }
      put(5, calP(17, -61, 10.8), cell + `<path d="${lines}" fill="none" stroke="#c0757d" style="stroke-width:.5"/>`);
      const lead = (a) => { const pts = [calP(a, SOLAR[3] - 1.4, 10.4), calP(a, SOLAR[3] + 1.5, 9.5), calP(a, -51.5, 7.25)];
        return `<path d="${pd(pts, false)}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/><path d="${pd(pts, false)}" fill="none" stroke="#d14a3a" stroke-width=".8" stroke-linecap="round"/>`; };
      put(4, calP(-4, -54, 9), lead(-4) + lead(38)); }
    return layers.map(l => byDepth(l)).join('');
  }

  /* ---------- its sums on S2 ---------- */
  const SUMS = [
    { label: '3.5 + 2.8', sheet: '3.5+2.8', keys: ['AC', '3', '.', '5', '+', '2', '.', '8', '='], ans: '6.3' },
    { label: '12 × 7', sheet: '12×7', keys: ['AC', '1', '2', '*', '7', '='], ans: '84' },
    { label: '100 ÷ 3', sheet: '100÷3', keys: ['AC', '1', '0', '0', '/', '3', '='], ans: '33.333333' },
    { label: '√2', sheet: '√2', keys: ['AC', '2', 'sqrt'], ans: '1.4142135' } ];
  // a column between the compass's construction (left) and the calculator (right): pu 110…160 of S2
  const COL_PU = 110, SUM_PV = [56, 68, 80, 92];
  const SUM_HAND = SUMS.map((q, i) => S2.deskHand(q.ans, COL_PU + 27, SUM_PV[i], ZP + .02, 4, 3 + 5*i, .64));
  function worksheet(st){
    const z = ZP + .02;
    let s = S2.deskText(COL_PU, 44, z, '计算：', 4.6, INK, 800);
    SUMS.forEach((q, i) => { s += S2.deskText(COL_PU, SUM_PV[i], z, q.sheet + ' =', 4, '#2c2a26', 700); });
    const lines = []; SUMS.forEach((q, i) => { if (st.solved[i]) lines.push(...SUM_HAND[i]); });
    return s + graphite(lines, GRAPHITE, .5, .9);
  }

  /* ---------- the deskmate's hand (it covers the solar window) ----------
     A mitten-like hand: palm and four fingers as one rounded slab, a thumb along its side. It reaches over from beyond the
     calculator's far end, fingers toward the student, the fingertips just past the solar window (the display stays in
     view). Drawn in the calculator's frame; k: 0 = up and away beyond the far end, 1 = lying on the calculator. */
  const SKIN = { l:'#f6d2b4', m:'#e6b591', d:'#b98563' };
  const HAND_A = [-21, 55], HAND_B = [-150, -53], HAND_T = 15;     // across (a), along (b: palm far, fingertips near), thickness
  function handAt(k){
    const e = ease(Math.max(0, Math.min(1, k))), lift = (1 - e)*110, back = (1 - e)*70;
    return (a, b, z) => calP(a, b - back, CH + 2.8 + lift + z);
  }
  function handParts(k){
    const H = handAt(k), ring = (z, inset) => rrUV(HAND_A[0] + inset, HAND_B[0] + inset, HAND_A[1] - inset, HAND_B[1] - inset, 26 - inset, 6).map(([a, b]) => H(a, b, z));
    return { H, A: ring(0, 0), B: ring(HAND_T, 3) };
  }
  const handPts = k => { const { H, A, B } = handParts(k); return [...A, ...B, H(HAND_A[0] - 12, -122, 8)]; };
  function handSvg(k){
    const { H, A, B } = handParts(k);
    let slab = loft(A, B, n => toneI(n, SKIN));
    if (vis([0, 0, 1])){
      slab += fill(pd(B), SKIN.l);
      // three grooves between the fingers, from the tips back to the knuckles
      let g = ''; for (const a of [-2, 17, 36]) g += pd([H(a, HAND_B[1] - 6, HAND_T + .05), H(a, -96, HAND_T + .05)], false);
      slab += `<path d="${g}" fill="none" stroke="${INK}" stroke-width=".7" opacity=".7"/>`;
      // the nails at the fingertips
      for (const a of [-11.5, 7.5, 26.5, 45]) slab += fill(pd(rrUV(a - 5, HAND_B[1] - 15, a + 5, HAND_B[1] - 6, 3.5, 3).map(([u, v]) => H(u, v, HAND_T + .06))), '#fbe3d2') + ink(pd(rrUV(a - 5, HAND_B[1] - 15, a + 5, HAND_B[1] - 6, 3.5, 3).map(([u, v]) => H(u, v, HAND_T + .06))), .5);
      slab += ink(pd(B), .8);
    }
    slab += hullInk([...A, ...B], 1.6);
    const thumb = rod(H(HAND_A[0] - 4, -128, 7), H(HAND_A[0] - 13, -88, 6.5), 8.5, SKIN, toneI, 1.2, 7.5, 16);
    // the thumb lies along the hand's -a side: in front of the slab when that side faces the viewer
    return vis(kScl(calCA, -1)) ? slab + thumb : thumb + slab;
  }

  /* ---------- scene ---------- */
  const boxOfPts = pts => [[0,1,2].map(i => Math.min(...pts.map(p => p[i]))), [0,1,2].map(i => Math.max(...pts.map(p => p[i])))];
  function calOutline(){ return [...calRR(-CW/2, -CL/2, CW/2, CL/2, CRAD, 0, 2), ...calRR(-CW/2, -CL/2, CW/2, CL/2, CRAD, CH + 2.6, 2)]; }
  function scene(st, m){
    calFrame(st);
    const k = ease(st.xr || 0);
    let s = worksheet(st);
    s += castShadow(calOutline(), ZP);
    if (st.hand > 0) s += castShadow(handPts(st.hand), ZP);
    // the calculator: case, then the keys (always above the top face), sorted among themselves
    let calc;
    if (k > 0) calc = `<g opacity="${f(1 - .8*k)}">${calBody(st, m)}</g><g opacity="${f(k)}">${calMech(st)}</g>`
      + `<g opacity="${f(1 - .45*k)}">${byDepth(KEYS.map(K => ({ at: calP(K.a, K.b, CH), svg: keySvg(K, st, CH - (CH - 10.4)*k) })))}</g>`;
    else calc = calBody(st, m) + byDepth(KEYS.map(K => ({ at: calP(K.a, K.b, CH), svg: keySvg(K, st, CH) })));
    s += calc;
    if (st.hand > 0) s += handSvg(st.hand);                            // lying on (or over) the calculator: above it
    s += labels(st, k);
    return s;
  }
  function labels(st, k){
    const o = calOutline(), B = [Math.min(...o.map(p => p[0])), Math.max(...o.map(p => p[0])), Math.min(...o.map(p => p[1])), Math.max(...o.map(p => p[1])), 0, CH];
    const kOn = id => (st.kd[id] || 0) > .3, anyKey = KEYS.some(K => kOn(K.id));
    if (k > .6) return zhCallouts([
      { at: calP(0, -36, 11.2), text: '液晶玻璃', on: calContrast(st) > .05 && !st.dark },
      { at: calP(30, -26.3, 9.4), text: '斑马条', on: calContrast(st) > .05 },
      { at: calP(-42, 30, 7.2), text: '电路板', on: false },
      { at: calP(KEY_OF['5'].a + 3.6, KEY_OF['5'].b, 7.2), text: '按键触点', on: anyKey },
      { at: calP(KEY_OF['9'].a, KEY_OF['9'].b - 4, 9.6), text: '硅胶按键垫', on: anyKey },
      { at: calP(KEY_OF['3'].a, KEY_OF['3'].b, 7.6), text: '导电碳粒', on: anyKey },
      { at: calP(0, -17.4, 9), text: '黑胶芯片', on: anyKey },
      { at: calP(-30, -61, 4.5), text: '纽扣电池', on: false },
      { at: calP(30, -61, 11.2), text: '太阳能电池', on: st.light > .2 },
      { at: calP(38, -54, 8.5), text: '引线', on: st.light > .2 },
      { at: calP(40, 64, 6), text: '螺丝柱', on: false } ], B);
    return zhCallouts([
      { at: calP(17, -61, CH), text: '太阳能板', on: st.light > .2 },
      { at: calP(10, -36, CH), text: '液晶屏', on: false },
      { at: calP(KEY_OF['5'].a, KEY_OF['5'].b, CH + 2.6), text: '数字键', on: anyKey },
      { at: calP(KEY_OF['+'].a, KEY_OF['+'].b, CH + 2.6), text: '运算键', on: false },
      { at: calP(KEY_OF['AC'].a, KEY_OF['AC'].b, CH + 2.6), text: 'AC 清零', on: kOn('AC') },
      { at: calP(-CW/2, 30, 6), text: '外壳', on: false } ], B);
  }

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { type: '还在按键……', flip: '正在翻过来', cover: '手还挡着呢', key: '还在按键……' };
  const busy = () => { if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等一下'); return true; };
  // a key goes down (the chip reads it at the bottom) and comes back up
  function keySegs(st, id, fast){
    return [{ ms: fast ? 45 : 75, step(k){ st.kd[id] = k; }, end(){ st.keys++; pressIt(st, id); } },
            { ms: fast ? 55 : 95, step(k){ st.kd[id] = 1 - k; }, end(){ delete st.kd[id]; } }];
  }
  function pressIt(st, id){
    if (calContrast(st) <= 0) return;                             // no power, no chip
    const r = calKey(st.calc, id);
    if (r === 'locked') ui.flash('出错了，先按 AC');
  }
  const flipSeg = st => ({ ms: 950, start(){ this.t0 = st.th; }, step(k){ st.th = this.t0 + Math.PI*ease(k); st.lift = 10*Math.sin(Math.PI*k); },
    end(){ st.th = this.t0 + Math.PI; st.lift = 0; st.flipped = !st.flipped; } });
  const unflip = st => st.flipped ? flipSeg(st) : null;
  function typeKeys(st, keys, fast){ const out = []; for (const id of keys) out.push(...keySegs(st, id, fast)); return out; }
  function solve(st, i){ if (busy()) return;
    const q = SUMS[i];
    kPlay(ui, 'type', [unflip(st), ...typeKeys(st, q.keys, false)], () => { st.solved[i] = true; if (i === 2) ui.flash('33.333333……除不尽，只好写到这里'); }); }
  function hello(st){ if (busy()) return;
    if (st.flipped) return kPlay(ui, 'flip', [flipSeg(st)]);
    const segs = st.calc.cur === '0.7734' && !st.calc.err ? [] : typeKeys(st, ['AC', '0', '.', '7', '7', '3', '4'], false);
    kPlay(ui, 'flip', [...segs, flipSeg(st)], () => ui.flash(st.calc.cur === '0.7734' ? '0.7734 倒过来看：hELLO' : '倒过来了', 2400)); }
  function divZero(st){ if (busy()) return;
    kPlay(ui, 'type', [unflip(st), ...typeKeys(st, ['AC', '1', '/', '0', '='], false)], () => ui.flash('1 ÷ 0 = E：计算器罢工，只认 AC', 2400)); }
  function spam(st){ if (busy()) return;
    const segs = [unflip(st), ...typeKeys(st, ['AC', '1', '+', '1', '='], false)]; for (let i = 0; i < 8; i++) segs.push(...keySegs(st, '=', true));
    kPlay(ui, 'type', segs, () => ui.flash(`1+1=====……每按一次等号再加 1，已经 ${st.calc.cur} 了`, 2400)); }
  // the deskmate's hand comes over and lies across the solar window; the voltage sags and the screen fades out; the hand goes
  function cover(st){ if (busy()) return;
    const segs = [unflip(st)];
    if (st.calc.cur === '0' && !st.calc.op) segs.push(...typeKeys(st, ['1', '2', '*', '7', '='], true));
    segs.push({ ms: 750, step(k){ st.hand = Math.max(.001, k); } });
    segs.push({ ms: 260, step(k){ st.hand = 1; st.light = 1 - .7*ease(k); } });
    segs.push({ ms: 1700, step(k){ st.light = .3*Math.pow(.004/.3, k); if (calContrast(st) <= 0 && !st.dark){ st.dark = true; } } });
    segs.push({ ms: 800, step(k){ st.hand = Math.max(.001, 1 - k);
        st.light = Math.min(1, .004 + k*2.5);
        if (st.dark && calContrast(st) > .1){ st.dark = false; st.calc = calFresh(); } },
      end(){ st.hand = 0; st.light = 1; if (st.dark){ st.dark = false; st.calc = calFresh(); } } });
    kPlay(ui, 'cover', segs, () => ui.flash('同桌伸手一挡太阳能板：电池早没电了，一挡就黑屏，刚算的全没了', 2600)); }
  // a key pressed straight on the drawing
  function keyClick(st, id){
    if (kBusy()) return busy();
    if (st.kd[id]) return;
    let t = 0; st.kd[id] = .01;
    ui.animate(dt => { t += dt*1000; if (t < 70){ st.kd[id] = t/70; return true; }
      if (!st.kdDone || !st.kdDone[id]){ (st.kdDone = st.kdDone || {})[id] = true; st.keys++; pressIt(st, id); }
      if (t < 160){ st.kd[id] = 1 - (t - 70)/90; return true; }
      delete st.kd[id]; delete st.kdDone[id]; return false; });
  }

  const __cfg = ({
    fig:'10', turn:'full', title:'计算器', palette:'mint',
    state:{ th: TH0, lift: 0, flipped: false, kd: {}, calc: calFresh(), light: 1, dark: false, hand: 0, keys: 0, solved: [false, false, false, false] },
    scene,
    stats: st => [ { label:'太阳能电压', value: calV(st).toFixed(2) + ' V' }, { label:'按键', value: String(st.keys), small: true } ],
    buttons:[
      { label:'算一道题', choices: st => SUMS.map((q, i) => ({ label: q.label + ' =', current: false, onClick: st => solve(st, i) })) },
      { label:'倒过来看', onClick: hello },
      { label:'除以零', onClick: divZero },
      { label:'狂按等号', onClick: spam },
      { label:'遮住太阳能板', onClick: cover },
    ],
    acts:{ key: (st, el) => keyClick(st, el.dataset.k) },
    params:(st, q) => {
      if (q.has('disp')){ st.calc.cur = q.get('disp'); st.calc.fresh = true; }
      if (q.get('err') === '1') st.calc.err = true;
      if (q.has('mem')) st.calc.mem = +q.get('mem');
      if (q.get('flip') === '1'){ st.th = TH0 + Math.PI; st.flipped = true; }
      if (q.has('light')) st.light = +q.get('light');
      if (q.has('key')) st.kd[q.get('key')] = 1;
      if (q.get('cov') === '1'){ st.hand = 1; st.light = .004; }
      if (q.has('solved')) for (let i = 0; i < Math.min(4, +q.get('solved')); i++) st.solved[i] = true;
    },
  });

  return ctx.adapt(__cfg, { seeThrough: true });
}
