// Fig. 19 保温杯 — desk-scene object (a new one, written for the desk: no standalone page).
// Its code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*), ctx.ui its ui
// (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are collected by the scene.
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: -300, v: 400, rot: 0 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 19 — 保温杯: a 500 ml stainless vacuum flask (Ø68, 205 mm closed) with a screw lid and a tea strainer, standing
     at the front of the student's half; when it is open its lid sits on the desk beside it. 1 unit = 1 mm. The flask is
     drawn on its own axis (s = mm up from its bottom), so it can be lifted, tipped to drink and shaken.

     How it really works (each button is one of these):
     1. Two 304 stainless walls, an outer shell and an inner liner, are welded together only at the mouth; the gap
        between them (about 2 mm) is pumped empty through a hole in the outer bottom, which is then sealed (a small
        brazed plug, hidden under the bottom). With no air in the gap, heat cannot leave the hot water by conduction or
        convection; the liner's outside is copper-plated, so the heat it radiates is mostly reflected back. What is
        left is the thin welded lip and the lid: hot water stays hot half a day.
     2. The lid is double-walled too. It screws onto the outer thread on the neck (pitch 3 mm, two and a half turns) and
        presses a silicone ring onto the lip: airtight, so no steam carries heat away and nothing leaks when shaken.
     3. The tea strainer hangs in the mouth by its flange, which the lid clamps onto the lip; tea leaves (or goji
        berries) stay in its perforated basket while the water flows through.
     4. Drinking: unscrew the lid, set it down, tip the flask until the water reaches the lip. Filling: carry it to the
        boiler room (开水房) and fill it to below the neck. The water level stays level whichever way it is tipped.
     Student life: every school has a 开水房 queue at break; the flask that says 多喝热水 to every problem; 保温杯里泡枸杞,
     the middle-aged way of looking after yourself, in a 14-year-old's flask; shaking the goji round to make the water red.

     Parts:
     FLASK   foot (rounded edge) . body (coated, prints front and back) . steel band . shoulder . neck with its outer
             thread . lip (the welded mouth)
     INSIDE  outer wall . inner liner, copper-plated outside . vacuum gap . sealed evacuation plug . water (level in the
             flask's tilt) . goji berries
     LID     skirt with grip ribs . rounded top . steel inlay . inner thread . silicone seal ring
     STRAINER flange on the lip . perforated basket . its bottom
     AIR     steam over the open mouth */

  const BH = ctx.deskZ, UP = [0, 0, 1];
  // the flask: radii and stations up its axis
  const R = 34, R_NECK = 30.5, R_MOUTH = 26.5, R_IN = 31, R_LIN = 31.7, R_WALL = 33.4;
  const S_FOOT = 4, S_BODY = 157, S_BAND = 160, S_SHO = 163.5, S_LIP = 175, S_BOT = 7;
  const W_MAX = 150;                                                 // water column when filled (to s 157, below the neck)
  const R_ST = 21, S_ST = 108, R_RIM = 29;                           // strainer basket (deep enough to steep), its bottom, its flange
  const L_SK = 36, L_TOP = 42, PITCH_T = 3, LID_TURNS = 2.5;         // lid skirt, top, thread pitch, turns to undo
  const RISE = PITCH_T*LID_TURNS;
  const FLASK_AT = [-34, -4], LID_AT = [38, 8];
  const REST = { o: dk(FLASK_AT[0], FLASK_AT[1], BH), d: UP };
  const LID_DESK = { o: dk(LID_AT[0], LID_AT[1], BH), d: UP };
  const STEEL = MAT.steel, STEEL_IN = { l:'#dfe3e4', m:'#b8bfc2', d:'#808a8e' }, MESH = { l:'#e7eaea', m:'#c3c9cb', d:'#8e979a' };
  const COPPER = { l:'#f3bf92', m:'#d99460', d:'#a1623a' }, SEAL = { l:'#eaf1f2', m:'#cddadd', d:'#a3b5b9' };
  const GOJI = { l:'#f2603f', m:'#d2432a', d:'#8c2615' };
  const WATER0 = '#d3ebf2', TEA = '#e8a95c';
  const waterCol = st => mix(WATER0, TEA, Math.min(1, st.tint));

  /* ---------- geometry on an axis ---------- */
  const radAt = (d, a) => { const [e1, e2] = axisFrame(d); return kAdd(kScl(e1, Math.cos(a)), kScl(e2, Math.sin(a))); };
  const ringAt = (o, d, s, r, n = 36, ph = 0) => axisRing(kAt(o, d, s), d, r, n, ph);
  const boxAround = (pts, r = 0) => [[0,1,2].map(i => Math.min(...pts.map(p => p[i])) - r), [0,1,2].map(i => Math.max(...pts.map(p => p[i])) + r)];
  // the side of a round part that faces a direction (for prints, labels)
  const sideToward = (d, w) => { const v = sub(w, kScl(d, dot(w, d))), l = kLen(v); return l < 1e-6 ? axisFrame(d)[1] : kScl(v, 1/l); };
  // a helix (a thread) round the axis: the runs on the side toward (front) or away from (back) the viewer
  function helixRuns(o, d, r, s0, s1, pitch, ph = 0, front = true){
    const turns = (s1 - s0)/pitch, N = Math.ceil(turns*44), runs = []; let run = null;
    for (let i = 0; i <= N; i++){ const t = i/N, a = ph + t*turns*2*Math.PI, rad = radAt(d, a), p = kAdd(kAt(o, d, s0 + (s1 - s0)*t), kScl(rad, r));
      if (vis(rad) === front){ if (!run) runs.push(run = []); run.push(p); } else run = null; }
    return runs.filter(q => q.length > 1);
  }
  // horizontal (round the axis) arcs on the far or near half of a ring
  function halfArc(o, d, s, r, front, n = 40){
    const runs = []; let run = null;
    for (let i = 0; i <= n; i++){ const rad = radAt(d, i/n*2*Math.PI), p = kAdd(kAt(o, d, s), kScl(rad, r));
      if (vis(rad) === front){ if (!run) runs.push(run = []); run.push(p); } else run = null; }
    return runs.filter(q => q.length > 1).map(q => pd(q, false)).join('');
  }

  /* ---------- the water: a column of fixed length along the axis, its surface level however the flask is tipped ---------- */
  const cavR = s => s <= S_BAND ? R_IN : s >= S_SHO ? R_MOUTH : R_IN + (R_MOUTH - R_IN)*(s - S_BAND)/(S_SHO - S_BAND);
  // (r, floor: the same level met on a narrower wall, the strainer's, from its bottom up)
  function waterSurf(o, d, w, n = 32, r = 0, floor = S_BOT){
    const [e1, e2] = axisFrame(d), mid = S_BOT + w, out = [];
    for (let i = 0; i < n; i++){ const a = i/n*2*Math.PI, rad = kAdd(kScl(e1, Math.cos(a)), kScl(e2, Math.sin(a))), rr = r || R_IN;
      const s = Math.max(floor, Math.min(S_LIP - .6, mid - rr*rad[2]/Math.max(.08, d[2])));
      out.push(kAdd(kAt(o, d, s), kScl(rad, r ? r : cavR(s) - .3))); }
    return out;
  }
  // how far it must be tipped (rad) for the water to reach the lip
  const drinkTilt = w => Math.min(80, Math.max(24, Math.atan((S_LIP - S_BOT - w)/R_IN)*180/Math.PI))*Math.PI/180;

  /* ---------- poses ---------- */
  const lidOn = st => st.lid === 'on';
  const lidPose = st => lidOn(st) ? { o: kAt(st.fp.o, st.fp.d, S_SHO + st.rise), d: st.fp.d, spin: st.spin } : st.lp;
  const mouthOpen = st => !lidOn(st) || st.rise > 5.5;

  /* ---------- the flask ---------- */
  // its body printing: a slogan on the front, a name sticker on the back, the capacity low on the side
  function bodyPrint(o, d){
    const nf = sideToward(d, DV), nb = kScl(nf, -1), ns = sideToward(d, DU);
    let s = '';
    if (vis(nf)){ const u = cross(nf, d);
      s += txOn(kAdd(kAt(o, d, 112), kScl(nf, R + .08)), u, nf, '长效保温', 5.2, '#fbf8ef', 800)
        + txOn(kAdd(kAt(o, d, 103), kScl(nf, R + .08)), u, nf, '304 不锈钢 · 500ml', 2.6, '#fbf8ef', 700); }
    if (vis(nb)){ const u = cross(nb, d), c = kAt(o, d, 70), p = q => kAdd(kAdd(kAt(o, d, q[1]), kScl(nb, R + .12)), kScl(u, q[0]));
      const lab = [[-17, 62], [17, 62], [17, 80], [-17, 80]].map(p);
      s += fill(pd(lab), '#fffaf0') + ink(pd(lab), .6) + txOn(kAdd(kAdd(c, kScl(nb, R + .16)), kScl(d, 4)), u, nb, '初二(3)班', 3.6, INK, 800)
        + txOn(kAdd(kAdd(c, kScl(nb, R + .16)), kScl(d, -3)), u, nb, '李小明', 3.4, '#c8352a', 800); }
    if (vis(ns)) s += `<path d="${pd([kAdd(kAt(o, d, 20), kScl(ns, R + .1)), kAdd(kAt(o, d, 140), kScl(ns, R + .1))], false)}" stroke="#ffffff" stroke-width="2.4" opacity=".22" stroke-linecap="round"/>`;
    return s;
  }
  // the closed parts of the flask on its axis: foot, body, band, shoulder, neck (with its thread)
  function flaskSegs(st, m){
    const { o, d } = st.fp, up = vis(d), items = [];
    const seg = (name, g, extra = '') => items.push({ name, s0: g.s0, s1: g.s1, svg: coaxSeg(o, d, g) + extra });
    seg('foot', { s0: 0, s1: S_FOOT, r0: R - 2.6, r1: R, M: m, n: 44, w: 1.3, cap: up ? false : undefined });
    seg('body', { s0: S_FOOT, s1: S_BODY, r0: R, M: m, n: 44, w: 1.5, cap: false }, bodyPrint(o, d));
    seg('band', { s0: S_BODY, s1: S_BAND, r0: R + .3, M: STEEL, n: 44, w: 1, cap: false, shade: toneI });
    seg('sho', { s0: S_BAND, s1: S_SHO, r0: R, r1: R_NECK, M: STEEL, n: 44, w: 1, cap: false, shade: toneI });
    const thr = helixRuns(o, d, R_NECK + .06, S_SHO + 1.5, S_LIP - 1.2, PITCH_T, 0, true);
    seg('neck', { s0: S_SHO, s1: S_LIP, r0: R_NECK, M: STEEL, n: 44, w: 1.1, cap: false, shade: toneI },
      thr.length ? `<path d="${thr.map(q => pd(q, false)).join('')}" fill="none" stroke="${INK}" stroke-width=".6" opacity=".7"/>` : '');
    return items;
  }
  // looking into the open mouth: the strainer's flange covers the lip's inside edge, so all that shows in the mouth is
  // the basket's opening, and through it its far wall, its bottom, the water inside it and the goji
  function mouthSvg(st){
    const { o, d } = st.fp;
    if (!vis(d)) return '';
    const lipO = ringAt(o, d, S_LIP, R_NECK, 44), lipI = ringAt(o, d, S_LIP, R_MOUTH, 44), opening = ringAt(o, d, S_LIP + .5, R_ST, 40);
    const sw = S_BOT + st.water, dz = Math.max(.08, d[2]), wet = st.water > .5 && sw + R_ST*Math.sqrt(Math.max(0, 1 - dz*dz))/dz > S_ST + .5;
    const stR = s => ringAt(o, d, s, R_ST, 32);
    let inside = fill(pd(opening), '#2b2622');
    inside += loft(stR(S_ST), stR(S_LIP), n => toneI(n, MESH), true);
    let dots = ''; for (let s = S_ST + 3; s < S_LIP - 1; s += 3.2) dots += halfArc(o, d, s, R_ST - .05, false, 36);
    if (dots) inside += `<path d="${dots}" fill="none" stroke="#6f777a" stroke-width=".55" stroke-dasharray=".5 1.3" stroke-linecap="round"/>`;
    inside += fill(pd(stR(S_ST)), MESH.m) + ink(pd(stR(S_ST)), .45);
    if (wet){ const surf = waterSurf(o, d, st.water, 40, R_ST - .3, S_ST);
      inside += `<g opacity=".82">${fill(pd(surf), waterCol(st))}</g>` + ink(pd(surf), .4); }
    inside += gojiIn(st);
    let s = clipTo(opening, inside);
    // the lip (the welded mouth), the strainer's flange lying on it, and a little tab to lift the strainer by
    s += `<path d="${pd(lipO)}${pd(lipI.slice().reverse())}" fill="${STEEL.l}" fill-rule="evenodd"/>` + ink(pd(lipO), .9) + ink(pd(lipI), .6);
    const fl0 = ringAt(o, d, S_LIP + .5, R_RIM, 40);
    s += act('strainer', `<path d="${pd(fl0)}${pd(opening.slice().reverse())}" fill="${MESH.l}" fill-rule="evenodd"/>` + ink(pd(fl0), .7) + ink(pd(opening), .55));
    const tr = sideToward(d, DU), tab = [kAdd(kAt(o, d, S_LIP + .5), kScl(tr, R_RIM - 1)), kAdd(kAt(o, d, S_LIP + 4), kScl(tr, R_RIM - 3)), kAdd(kAt(o, d, S_LIP + 4), kScl(tr, R_RIM - 7))];
    s += `<path d="${pd(tab, false)}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/><path d="${pd(tab, false)}" fill="none" stroke="${MESH.l}" stroke-width=".7" stroke-linecap="round"/>`;
    return s;
  }
  // goji in the strainer: floating at the water line, or resting on the strainer's bottom
  const gojiPos = (st, g) => { const { o, d } = st.fp, sw = S_BOT + st.water, wet = sw > S_ST + 2.4;
    const s = wet ? Math.min(S_LIP - 3, sw + .8) : S_ST + 2.4 + g.layer*3.2; return kAdd(kAt(o, d, s), kScl(radAt(d, g.a + st.swirl), g.rr)); };
  function gojiSvg(c, ax){
    const o = kAt(c, ax, -4.6);
    return coaxOrder(ax, [
      { s0: 0, s1: 2.2, svg: coaxSeg(o, ax, { s0: 0, s1: 2.2, r0: .7, r1: 2.3, M: GOJI, n: 10, w: .5, shade: toneI }) },
      { s0: 2.2, s1: 7, svg: coaxSeg(o, ax, { s0: 2.2, s1: 7, r0: 2.3, M: GOJI, n: 10, w: .5, shade: toneI, cap: false }) },
      { s0: 7, s1: 9.2, svg: coaxSeg(o, ax, { s0: 7, s1: 9.2, r0: 2.3, r1: .7, M: GOJI, n: 10, w: .5, shade: toneI }) } ]);
  }
  const gojiAxis = (st, g) => { const [e1, e2] = axisFrame(st.fp.d), a = g.ax + st.swirl; return norm(kAdd(kAdd(kScl(e1, Math.cos(a)), kScl(e2, Math.sin(a))), kScl(st.fp.d, .25))); };
  function gojiIn(st){
    if (!st.goji.length) return '';
    return byDepth(st.goji.map(g => { const c = gojiPos(st, g); return { at: c, box: [kAdd(c, [-4, -4, -2.5]), kAdd(c, [4, 4, 2.5])], svg: gojiSvg(c, gojiAxis(st, g)) }; }));
  }

  /* ---------- the lid ---------- */
  function lidSvg(st, m, lp){
    const { o, d, spin } = lp, up = vis(d), [e1, e2] = axisFrame(d);
    let ribs = ''; for (let i = 0; i < 48; i++){ const rad = radAt(d, spin + i/48*2*Math.PI); if (!vis(rad)) continue;
      ribs += pd([kAdd(kAt(o, d, 3), kScl(rad, R + .06)), kAdd(kAt(o, d, 25), kScl(rad, R + .06))], false); }
    const skirt = coaxSeg(o, d, { s0: 0, s1: L_SK, r0: R, M: m, n: 44, w: 1.3, cap: up ? false : undefined, hole0: R - 2.4, bore: '#2b2622' })
      + (ribs ? `<path d="${ribs}" fill="none" stroke="${INK}" stroke-width=".45" opacity=".5"/>` : '')
      + (up ? `<path d="${halfArc(o, d, 27.5, R + .06, true)}" fill="none" stroke="${INK}" stroke-width=".7" opacity=".7"/>` : '');
    let top = coaxSeg(o, d, { s0: L_SK, s1: L_TOP, r0: R, r1: R_NECK + .6, M: m, n: 44, w: 1.2, cap: up ? undefined : false });
    if (up){ const c = kAt(o, d, L_TOP + .05), inl = axisRing(c, d, 19, 36), hi = [kAdd(c, kAdd(kScl(e1, -12), kScl(e2, 9))), kAdd(c, kAdd(kScl(e1, -4), kScl(e2, 15)))];
      top += fill(pd(inl), STEEL.l) + ink(pd(inl), .6) + ink(pd(axisRing(c, d, 15.5, 36)), .35)
        + `<path d="${pd(hi, false)}" stroke="#ffffff" stroke-width="1.8" opacity=".6" stroke-linecap="round"/>`; }
    return act('lid', coaxOrder(d, [{ name: 'skirt', s0: 0, s1: L_SK, svg: skirt }, { name: 'ltop', s0: L_SK, s1: L_TOP, svg: top }])
      + hullInk([...ringAt(o, d, 0, R, 20), ...ringAt(o, d, L_TOP, R_NECK + .6, 20)], 1.7));
  }
  const lidPts = lp => [...ringAt(lp.o, lp.d, 0, R, 12), ...ringAt(lp.o, lp.d, L_TOP, R_NECK + .6, 12)];

  /* ---------- see-through: the two walls, the vacuum between them, the water, the seal ---------- */
  function flaskMech(st){
    const { o, d } = st.fp, wcol = waterCol(st);
    const lin = (r, s) => ringAt(o, d, s, r, 36);
    // the liner: far half seen from inside, then the water, goji, strainer, then its near half (copper-plated outside)
    const L0 = lin(R_LIN, S_BOT - .8), L1 = lin(R_LIN, S_BAND), L2 = lin(R_MOUTH + .9, S_SHO), L3 = lin(R_MOUTH + .9, S_LIP);
    let s = loft(L0, L1, n => toneI(n, STEEL_IN), true) + loft(L1, L2, n => toneI(n, STEEL_IN), true) + loft(L2, L3, n => toneI(n, STEEL_IN), true);
    // the sealed evacuation plug under the liner's bottom (in the vacuum gap)
    s += coaxSeg(o, d, { s0: 1.2, s1: 4.4, r0: 5.5, M: DARK, n: 16, w: .6, shade: toneI });
    // the water column
    if (st.water > .5){ const bot = lin(R_IN - .3, S_BOT), surf = waterSurf(o, d, st.water, 36);
      const wc = mix(wcol, '#6fa9bf', .38);
      s += `<g opacity=".72">${fill(pd(bot), mix(wc, '#3d6f80', .3))}${loft(bot, surf, n => toneI(n, matOf(wc)))}</g>` + fill(pd(surf), mix(wcol, '#a9d3e0', .3)) + ink(pd(surf), .6); }
    // the strainer's basket, whole
    const sb = ringAt(o, d, S_ST, R_ST, 28), stp = ringAt(o, d, S_LIP, R_ST, 28);
    s += `<g opacity=".75">${loft(sb, stp, n => toneI(n, MESH), true)}${fill(pd(sb), MESH.m)}</g>` + gojiIn(st)
      + `<g opacity=".6">${loft(sb, stp, n => toneI(n, MESH))}</g>` + ink(pd(sb), .5) + ink(pd(stp), .5);
    // the liner's near half, copper outside; the outer wall's inside (a fine line: the gap between them)
    s += `<g opacity=".5">${loft(L0, L1, n => toneI(n, COPPER))}${loft(L1, L2, n => toneI(n, COPPER))}</g>`;
    s += `<path d="${halfArc(o, d, 40, R_WALL, true)}${halfArc(o, d, 100, R_WALL, true)}" fill="none" stroke="${INK}" stroke-width=".5" stroke-dasharray="2 2" opacity=".6"/>`;
    s += ink(pd([kAdd(kAt(o, d, S_BOT - .8), kScl(sideToward(d, CAM_V), R_LIN)), kAdd(kAt(o, d, S_BAND), kScl(sideToward(d, CAM_V), R_LIN))], false), .7);
    // the outer thread on the neck, both halves
    const thrB = helixRuns(o, d, R_NECK + .06, S_SHO + 1.5, S_LIP - 1.2, PITCH_T, 0, false), thrF = helixRuns(o, d, R_NECK + .06, S_SHO + 1.5, S_LIP - 1.2, PITCH_T, 0, true);
    s += `<path d="${thrB.map(q => pd(q, false)).join('')}" fill="none" stroke="${INK}" stroke-width=".55" opacity=".45"/><path d="${thrF.map(q => pd(q, false)).join('')}" fill="none" stroke="${INK}" stroke-width=".8"/>`;
    return s;
  }
  function lidMech(st, lp){
    const { o, d, spin } = lp;
    // the seal ring pressed up inside the top, the inner thread round the skirt's inside
    const a0 = ringAt(o, d, L_SK - 1.5, R_NECK + .2, 36), a1 = ringAt(o, d, L_SK - 1.5, R_MOUTH - .5, 36), b0 = ringAt(o, d, L_SK + 1.2, R_NECK + .2, 36);
    let s = loft(a0, b0, n => toneI(n, SEAL)) + `<path d="${pd(a0)}${pd(a1.slice().reverse())}" fill="${SEAL.l}" fill-rule="evenodd" opacity=".95"/>` + ink(pd(a0), .5) + ink(pd(a1), .5);
    const th = helixRuns(o, d, R - 2.6, 2, 12, PITCH_T, spin, false).concat(helixRuns(o, d, R - 2.6, 2, 12, PITCH_T, spin, true));
    s += `<path d="${th.map(q => pd(q, false)).join('')}" fill="none" stroke="${INK}" stroke-width=".6" opacity=".7"/>`;
    return s;
  }

  /* ---------- steam: three wisps curling up from the open mouth ---------- */
  // each wisp is a ribbon round a curling centre line, wide where it leaves the water and thinning to nothing
  function steamSvg(st){
    if (st.steam <= .02 || !mouthOpen(st)) return '';
    const { o, d } = st.fp, top = kAt(o, d, S_LIP + 1.5), a = Math.min(1, st.steam);
    let s = '';
    for (let i = 0; i < 3; i++){
      const ph = st.steamT*1.7 + i*2.3, c = Math.cos(i*2.1 + .4)*9, e = Math.sin(i*2.1 + .4)*9, n = 18, ctr = [];
      for (let j = 0; j <= n; j++){ const t = j/n, h = 3 + t*(62 + 16*i)*Math.min(1.25, st.steam), sway = Math.sin(ph + t*5.4)*(1.5 + t*10);
        ctr.push(P(...kAdd(top, [c*(1 - t*.5) + sway*.6, e*(1 - t*.5) + t*t*12 + sway*.45, h]))); }
      const Lf = [], Rt = [];
      for (let j = 0; j <= n; j++){ const p0 = ctr[Math.max(0, j - 1)], p1 = ctr[Math.min(n, j + 1)], dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1;
        const t = j/n, w = (4.4 - i*.7)*CAM_K*(1 - .92*t)*(.75 + .25*Math.sin(ph*1.3 + t*7));
        Lf.push([ctr[j][0] - dy/l*w, ctr[j][1] + dx/l*w]); Rt.push([ctr[j][0] + dy/l*w, ctr[j][1] - dx/l*w]); }
      s += `<path d="${sp([...Lf, ...Rt.reverse()])}" fill="#ffffff" fill-opacity="${f(.74*a)}" stroke="${INK}" stroke-width=".7" stroke-opacity="${f(.32*a)}" stroke-linejoin="round"/>`;
    }
    return s;
  }

  /* ---------- scene ---------- */
  // its outline: foot, body, and the lid's skirt and rounded top while it is on (else the neck and lip)
  const flaskPts = st => { const { o, d } = st.fp, top = lidOn(st) ? [[S_SHO + st.rise + L_SK, R], [S_SHO + st.rise + L_TOP, R_NECK + .6]] : [[S_BAND, R], [S_LIP, R_NECK]];
    return [...ringAt(o, d, 0, R - 2.6, 14), ...ringAt(o, d, S_FOOT, R, 14), ...top.flatMap(([sv, r]) => ringAt(o, d, sv, r, 14))]; };
  function scene(st, m){
    const k = ease(st.xr || 0), lp = lidPose(st);
    let s = castShadow(flaskPts(st), BH);
    if (!lidOn(st)) s += castShadow(lidPts(lp), BH);
    // the flask: its closed parts in order on its axis, the lid on it while it is on the neck (wrapping the neck)
    const chain = flaskSegs(st, m);
    if (lidOn(st)){ const ls = S_SHO + st.rise; chain.push({ name: 'lid', s0: ls, s1: ls + L_TOP, svg: lidSvg(st, m, lp), over: ['neck'] }); }
    let flask = act('flask', coaxOrder(st.fp.d, chain) + (lidOn(st) ? '' : mouthSvg(st)) + hullInk(flaskPts(st), 2.2));
    if (k > 0) flask = `<g opacity="${f(1 - .78*k)}">${flask}</g><g opacity="${f(k)}">${flaskMech(st)}${lidOn(st) ? lidMech(st, lp) : ''}</g>`;
    const items = [{ box: boxAround(flaskPts(st), 1), svg: flask }];
    if (!lidOn(st)){ let lid = lidSvg(st, m, lp); if (k > 0) lid = `<g opacity="${f(1 - .78*k)}">${lid}</g><g opacity="${f(k)}">${lidMech(st, lp)}</g>`;
      items.push({ box: boxAround(lidPts(lp), 1), svg: lid }); }
    // goji on their way down into the mouth
    for (const g of st.fall) items.push({ box: [kAdd(g.p, [-5, -5, -5]), kAdd(g.p, [5, 5, 5])], svg: gojiSvg(g.p, g.ax) });
    s += byDepth(items) + steamSvg(st);
    s += labels(st, k);
    return s;
  }
  function labels(st, k){
    const { o, d } = st.fp, lp = lidPose(st), nv = sideToward(d, CAM_V), at = (sv, r) => kAdd(kAt(o, d, sv), kScl(nv, r));
    const B = [];
    const open = mouthOpen(st), moving = !!kBusy();
    if (k > .6) return zhCallouts([
      { at: at(118, R), text: '外壁', on: false },
      { at: at(60, R_LIN), text: '内胆（外面镀铜）', on: false },
      { at: at(86, R_WALL - .6), text: '真空层', on: st.temp > 70 },
      { at: kAt(o, d, 2.8), text: '抽真空封口', on: false },
      { at: at(S_SHO + 6, R_NECK), text: '螺纹', on: st.lid === 'on' && moving },
      { at: kAt(lp.o, lp.d, L_SK), text: '硅胶密封圈', on: st.lid === 'on' && st.rise < .5 },
      { at: at(S_ST + 8, R_ST), text: '茶隔', on: st.fall.length > 0 },
      ...(st.water > 2 ? [{ at: at(S_BOT + Math.min(st.water, 120)*.5, R_IN - 2), text: st.tint > .2 ? '枸杞水' : '开水', on: moving }] : []),
      ...(st.goji.length ? [{ at: gojiPos(st, st.goji[0]), text: '枸杞', on: st.swirl !== 0 || st.fall.length > 0 }] : []) ], B);
    return zhCallouts([
      { at: kAt(lp.o, lp.d, L_TOP), text: '杯盖', on: moving && (st.lid !== 'on' || st.rise > 0) },
      { at: at(85, R), text: '杯身', on: false },
      { at: at(S_BAND - 1, R + .3), text: '钢圈', on: false },
      ...(open ? [{ at: at(S_LIP, R_RIM), text: '茶隔', on: st.fall.length > 0 }, { at: at(S_SHO + 4, R_NECK), text: '杯口螺纹', on: false }] : []),
      ...(open && st.steam > .3 ? [{ at: kAt(o, d, S_LIP + 40), text: '热气', on: true }] : []) ], B);
  }

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { open: '还在拧呢', close: '还在拧呢', drink: '咕咚……等我喝完', fill: '打水去了，等会儿', goji: '枸杞还在往下掉', shake: '还在摇……', hot: '先听我说完' };
  const busy = () => { if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等一下'); return true; };
  const poseLerp = (a, b, e) => ({ o: kLerp(a.o, b.o, e), d: norm(kLerp(a.d, b.d, e)) });
  const lift = (p, h) => ({ o: kAdd(p.o, [0, 0, h]), d: p.d });
  const steamTo = (st, to, k) => { st.steam = st.steam + (to - st.steam)*k; st.steamT += .05; };
  const homeSeg = st => st.fp === REST ? null : { ms: 380, start(){ this.from = st.fp; }, step(k){ st.fp = poseLerp(this.from, REST, ease(k)); }, end(){ st.fp = REST; } };
  // unscrew: two and a half turns, the lid rising one thread pitch a turn; lift it clear, carry it over, set it down
  function openSegs(st){
    if (!lidOn(st)) return [];
    return [homeSeg(st),
      { ms: 1150, start(){ this.s0 = st.spin; }, step(k){ const e = ease(k); st.spin = this.s0 + LID_TURNS*2*Math.PI*e; st.rise = RISE*e; } },
      { ms: 280, start(){ const lp = lidPose(st); st.lid = 'off'; st.lp = { ...lp }; this.from = lp.o; },
        step(k){ st.lp = { ...st.lp, o: kAdd(this.from, [0, 0, 26*ease(k)]) }; steamTo(st, 1, k); } },
      { ms: 520, start(){ this.from = st.lp.o; this.to = kAdd(LID_DESK.o, [0, 0, 26]); this.sp = st.lp.spin; },
        step(k){ const e = ease(k); st.lp = { o: kAdd(kLerp(this.from, this.to, e), [0, 0, 18*Math.sin(Math.PI*e)]), d: UP, spin: this.sp + .6*e }; st.steamT += .05; } },
      { ms: 240, start(){ this.from = st.lp.o; }, step(k){ st.lp = { ...st.lp, o: kLerp(this.from, LID_DESK.o, ease(k)) }; st.steamT += .05; }, end(){ st.lp = { ...LID_DESK, spin: st.lp.spin }; } } ];
  }
  // put it back: pick it up, carry it over the neck, lower it onto the thread and screw it down
  function closeSegs(st){
    if (lidOn(st)) return [];
    return [homeSeg(st),
      { ms: 240, start(){ this.from = st.lp.o; }, step(k){ st.lp = { ...st.lp, o: kAdd(this.from, [0, 0, 26*ease(k)]) }; } },
      { ms: 520, start(){ this.from = st.lp.o; this.to = kAt(REST.o, UP, S_SHO + RISE + 26); this.sp = st.lp.spin; },
        step(k){ const e = ease(k); st.lp = { o: kAdd(kLerp(this.from, this.to, e), [0, 0, 18*Math.sin(Math.PI*e)]), d: UP, spin: this.sp - .6*e }; steamTo(st, 0, k*.6); } },
      { ms: 260, start(){ this.from = st.lp.o; }, step(k){ st.lp = { ...st.lp, o: kLerp(this.from, kAt(REST.o, UP, S_SHO + RISE), ease(k)) }; steamTo(st, 0, k); },
        end(){ st.lid = 'on'; st.rise = RISE; st.spin = st.lp.spin; st.steam = 0; } },
      { ms: 1150, start(){ this.s0 = st.spin; }, step(k){ const e = ease(k); st.spin = this.s0 - LID_TURNS*2*Math.PI*e; st.rise = RISE*(1 - e); }, end(){ st.rise = 0; } } ];
  }
  function open(st){ if (busy()) return;
    if (!lidOn(st)) return ui.flash('盖子早拧开啦——热气都跑了');
    kPlay(ui, 'open', openSegs(st), () => { if (st.temp > 80) ui.flash('呼——一股热气扑上来', 1800); });
  }
  function close(st){ if (busy()) return;
    if (lidOn(st)) return ui.flash('已经拧得紧紧的，一滴都不会漏');
    kPlay(ui, 'close', closeSegs(st), () => ui.flash('拧紧了，能保温一整天', 1600));
  }
  // drink: lift it, tip it until the water reaches the lip, a sip, back down
  function drink(st){ if (busy()) return;
    if (st.water < 3) return ui.flash('我已经空了……去开水房打一壶吧');
    const hot = st.temp > 78, sip = hot ? 2 : Math.min(st.water - 1, 9), th = drinkTilt(st.water);
    const DRINK = { o: kAdd(REST.o, kAdd(dkv(0, 22, 0), [0, 0, 62])), d: norm(kAdd(kScl(UP, Math.cos(th)), kScl(DV, Math.sin(th)))) };
    const segs = [...openSegs(st),
      { ms: 360, start(){ this.from = st.fp; }, step(k){ st.fp = poseLerp(this.from, lift(REST, 62*ease(k)), 1); st.steamT += .05; } },
      { ms: 520, start(){ this.from = st.fp; }, step(k){ st.fp = poseLerp(this.from, DRINK, ease(k)); st.steamT += .05; } },
      { ms: hot ? 380 : 760, start(){ this.w0 = st.water; }, step(k){ st.water = this.w0 - sip*k; st.steamT += .05; }, end(){ st.sips++; st.temp = Math.max(30, st.temp - (hot ? 2 : 4)); } },
      { ms: 480, start(){ this.from = st.fp; }, step(k){ st.fp = poseLerp(this.from, lift(REST, 62), ease(k)); st.steamT += .05; } },
      { ms: 380, start(){ this.from = st.fp; }, step(k){ st.fp = poseLerp(this.from, REST, ease(k)); }, end(){ st.fp = REST; } } ];
    kPlay(ui, 'drink', segs, () => ui.flash(hot ? '嘶——烫烫烫！刚打的开水，吹一吹再喝' : st.water < 10 ? '咕咚——快见底了' : '咕咚——温度刚好', 2000));
  }
  // fill: off to the boiler room and back, full to below the neck and steaming
  function fill_(st){ if (busy()) return;
    if (st.water > W_MAX - 8) return ui.flash('还满着呢，喝几口再去打');
    const segs = [...openSegs(st),
      { ms: 620, start(){ this.from = st.fp; }, step(k){ st.fp = poseLerp(this.from, lift(REST, 520), k*k); } },
      { ms: 520, step(){}, end(){ st.water = W_MAX - 2; st.temp = 97; st.tint = st.goji.length ? .25 : 0; st.steam = 1.25; } },
      { ms: 640, start(){ this.from = st.fp; }, step(k){ st.fp = poseLerp(this.from, REST, 1 - (1 - k)*(1 - k)); st.steamT += .06; }, end(){ st.fp = REST; } },
      { ms: 300, step(k){ steamTo(st, 1, k); } } ];
    kPlay(ui, 'fill', segs, () => ui.flash('去开水房排队打了一壶——满满的，烫手', 2200));
  }
  // goji: a handful dropped in, they land in the strainer and the water slowly turns red-gold
  function goji(st){ if (busy()) return;
    if (st.goji.length >= 18) return ui.flash('再放就成枸杞粥了');
    const rnd = kRng(31 + st.goji.length*7), n = 9, adds = [];
    // floating things drift to the wall (the water climbs it a little and pulls them over): they float round the edge
    for (let i = 0; i < n; i++) adds.push({ a: rnd()*2*Math.PI, rr: 11 + rnd()*6.5, ax: rnd()*2*Math.PI, layer: Math.floor((st.goji.length + i)/7), t0: i*.1 });
    const segs = [...openSegs(st),
      { ms: 1300, start(){ const top = kAt(REST.o, UP, S_LIP + 150); this.top = top; st.fall = []; },
        step(k){ const T = k*1.3;
          st.fall = adds.filter(g => T >= g.t0 && !g.done).map(g => { const t = Math.min(1, (T - g.t0)/.42), end = gojiPos({ ...st, fp: REST }, g);
            const p = kAdd(kLerp(kAdd(this.top, kScl(radAt(UP, g.a), g.rr*.4)), end, t), [0, 0, 0]); p[2] = this.top[2] + (end[2] - this.top[2])*t*t;
            if (t >= 1){ g.done = true; st.goji.push(g); }
            return { p, ax: norm([Math.cos(g.ax + T*6), Math.sin(g.ax + T*6), .4]) }; });
          st.tint = Math.max(st.tint, .25*k); st.steamT += .05; },
        end(){ for (const g of adds) if (!g.done){ g.done = true; st.goji.push(g); } st.fall = []; } },
      { ms: 1100, start(){ this.t0 = st.tint; }, step(k){ st.tint = this.t0 + (Math.min(1, this.t0 + .45) - this.t0)*ease(k); st.steamT += .05; } } ];
    kPlay(ui, 'goji', segs, () => ui.flash('人到中年不得已，保温杯里泡枸杞——可我才初二啊', 2600));
  }
  // shake: lid on (screw it on first if it is off), up, rock it side to side; the water sloshes, the goji swirl
  function shake(st){ if (busy()) return;
    const segs = [...closeSegs(st),
      { ms: 240, start(){ this.from = st.fp; }, step(k){ st.fp = poseLerp(this.from, lift(REST, 34), ease(k)); } },
      { ms: 1100, start(){ this.base = lift(REST, 34); this.w0 = st.swirl; },
        step(k){ const a = Math.sin(k*6*2*Math.PI)*16*Math.PI/180*(1 - .25*k);
          st.fp = { o: kAdd(this.base.o, [0, 0, 4*Math.abs(Math.sin(k*12*Math.PI))]), d: norm(kAdd(kScl(UP, Math.cos(a)), kScl(DU, Math.sin(a)))) };
          st.swirl = this.w0 + 3.5*Math.PI*ease(k); } },
      { ms: 300, start(){ this.from = st.fp; }, step(k){ st.fp = poseLerp(this.from, REST, ease(k)); }, end(){ st.fp = REST; st.swirl = 0; for (const g of st.goji) g.a += 3.5*Math.PI; } } ];
    kPlay(ui, 'shake', segs, () => { if (st.goji.length) st.tint = Math.min(1, st.tint + .2);
      ui.flash(st.goji.length ? '哗啦哗啦——枸杞都转晕了，水更红了' : st.water < 3 ? '空的，摇了个寂寞' : '哗啦哗啦——摇匀了，虽然只是一杯白开水', 2200); });
  }
  // its signature line: a little hop, and the answer to everything
  const LINES = ['多喝热水。', '感冒了？多喝热水。', '考砸了？多喝热水。', '头疼？多喝热水，万能的。', '失恋了？……多喝热水。', '作业写不完？那也得多喝热水。'];
  function hotWater(st){ if (busy()) return;
    const line = st.water < 3 ? '我自己都空了，还让你多喝热水' : LINES[st.line++ % LINES.length];
    kPlay(ui, 'hot', [homeSeg(st),
      { ms: 620, step(k){ st.fp = lift(REST, 12*Math.abs(Math.sin(k*2*Math.PI))*(1 - .4*k)); if (mouthOpen(st)) { st.steam = 1 + .35*Math.sin(Math.PI*k); st.steamT += .07; } }, end(){ st.fp = REST; if (mouthOpen(st)) st.steam = 1; } }],
      () => ui.flash(line, 2200));
  }

  const __cfg = ({
    fig:'19', turn:'full', title:'保温杯', palette:'blush',
    state:{ fp: REST, lid: 'on', rise: 0, spin: 0, lp: LID_DESK, water: 138, temp: 86, tint: 0, goji: [], fall: [], swirl: 0,
      steam: 0, steamT: 0, sips: 0, line: 0 },
    scene,
    stats: st => [ { label:'水温', value: Math.round(st.temp) + ' °C' }, { label:'剩水', value: Math.round(st.water/W_MAX*500) + ' ml', small: true } ],
    buttons:[
      { label:'拧开盖子', onClick: open },
      { label:'喝一口', onClick: drink },
      { label:'打开水', onClick: fill_ },
      { label:'拧紧盖子', onClick: close },
      { label:'泡枸杞', onClick: goji },
      { label:'摇一摇', onClick: shake },
      { label:'多喝热水', onClick: hotWater },
    ],
    acts:{ lid: st => (lidOn(st) ? open(st) : close(st)), flask: st => drink(st), strainer: st => goji(st) },
    params:(st, q) => {
      if (q.get('open') === '1'){ st.lid = 'off'; st.lp = { ...LID_DESK, spin: 0 }; st.steam = 1; }
      if (q.has('water')) st.water = Math.max(0, Math.min(W_MAX, +q.get('water')));
      if (q.has('goji')){ const rnd = kRng(5); for (let i = 0; i < +q.get('goji'); i++) st.goji.push({ a: rnd()*2*Math.PI, rr: 11 + rnd()*6.5, ax: rnd()*2*Math.PI, layer: Math.floor(i/7) }); st.tint = .6; }
      if (q.has('tilt')){ const th = +q.get('tilt')*Math.PI/180; st.fp = { o: kAdd(REST.o, [0, 0, 62]), d: norm(kAdd(kScl(UP, Math.cos(th)), kScl(DV, Math.sin(th)))) }; }
      if (q.has('rise')){ st.rise = Math.min(RISE, +q.get('rise')); st.spin = st.rise/PITCH_T*2*Math.PI; }
    },
  });

  return ctx.adapt(__cfg, { seeThrough: true });
}
