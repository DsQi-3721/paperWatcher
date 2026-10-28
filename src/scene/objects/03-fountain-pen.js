// Fig. 03 钢笔 — desk-scene object, ported from stationery/src/03-fountain-pen.html by scripts/port-figures.mjs.
// The figure's own code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*),
// ctx.ui its ui (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are
// collected by the scene.
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: -100, v: -195, rot: 0 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 03 — Fountain pen with a piston converter, a bottle of blue-black ink, and a copybook sheet (钢笔字帖) near the
     far edge of the student's half of the desk. Desk terms: u along the front edge, v toward the student; 1 unit = 1 mm.
     The pen is drawn on its own axis: s = mm from the nib's tip toward the barrel's end.

     How it really works (each button is one of these):
     1. Cap: a snap cap with an inner cap that closes round the section, so the nib doesn't dry out. Pull it off, put it
        down; put it back on.
     2. Fill: unscrew the barrel (the converter sits in the section), dip the nib in the bottle so the breather hole is
        under the ink, turn the converter's knob: its threaded rod drives the piston down (air bubbles out through the
        feed), then back up, drawing ink up the feed's channel into the reservoir. Lift out, screw the barrel back on.
     3. Write: ink runs down the feed's channel by capillary action, along the slit between the nib's tines to the tip;
        the breather hole lets air back in. The reservoir slowly empties.
     Student life: flicking a reluctant pen (甩笔) sends the ink sitting at the nib flying on in a row of drops, onto the
     copybook, the fastest on over the far edge at the front classmate (off the desk: out of sight, gone); turning the
     knob down pushes a blob of ink out of the nib, blown into branches and dotted with blossoms makes a 墨梅 —
     "不要人夸好颜色，只留清气满乾坤".

     Parts:
     CAP     cap tube . finial . cap ring . clip root . clip blade . clip ball . inner cap
     NIB     steel nib (curved plate) . tines and slit . breather hole . imprint . tipping pellet
     FEED    feed . comb fins . ink channel
     BODY    section lip . section grip . section threads . barrel (print) . barrel finial
     CONV    converter cuff . clear reservoir . ink . piston . threaded rod . knob housing . knob
     DESK    copybook sheet (田字格 row, trace-over 永, written 永) . ink bottle (glass body, shoulder, neck, label,
             ink, bubbles) . bottle cap . ink drops . ink plum */

  /* ---------- on the desk (desk terms: u right along the front edge, v toward the student) ---------- */
  const BH = ctx.deskZ, ZP = BH + .4;
  const SHEET = [-82, -40, 52, 44];
  const rnd = kRng(331);                                          // bubbles and splashes, the same every time
  const BLUE = '#22346e', BLUEM = { l:'#4a64a8', m:'#22346e', d:'#121c3c' };
  const BOXW = 16, BOX_V = -27, BOX_U0 = -76, NBOX = 7;
  // 永 in a box (u right, v up, 0..1): dot, horizontal-turn-hook, horizontal-sweep, short left-falling, right-falling
  const YONG = [ [[.46,.97],[.53,.9],[.56,.85]],
    [[.28,.75],[.5,.78],[.56,.74],[.55,.14],[.52,.06],[.42,.13]],
    [[.14,.52],[.38,.55],[.41,.52],[.13,.2]],
    [[.84,.66],[.72,.55],[.58,.47]],
    [[.58,.47],[.7,.32],[.8,.2],[.94,.12]] ];
  const yongIn = i => YONG.map(sk => sk.map(([gu, gv]) => dk(BOX_U0 + i*BOXW + 2 + gu*12, BOX_V + BOXW - 2 - gv*12, ZP + .02)));
  const YONGS = Array.from({length: NBOX}, (_, i) => yongIn(i));
  const BOT = { u: 70, v: 30, r: 16, h: 22, sh: 3, nr: 12.5, nh: 5 };   // ink bottle: body radius / height, shoulder, neck
  const BOT_TOP = BH + BOT.h + BOT.sh + BOT.nh;
  const PLUM = { u: 40, v: 8 };

  /* ---------- the pen ---------- */
  const R_CAPT = 7.0, R_BARL = 6.0;
  const PIST0 = 46, PIST1 = 76;                                   // piston at the front / at the back of the reservoir
  const NIBM = { l:'#e3e7e7', m:'#b4bcbe', d:'#7f898c' }, NIBU = { l:'#a9b0b2', m:'#8c9496', d:'#636b6e' };
  const REST_C = { o: dk(-72, 36, ZP + R_CAPT), d: norm(dkv(1, -.03, 0)) };
  const REST_U = { o: dk(-72, 36, ZP + R_BARL), d: REST_C.d };
  const WRITE_D = norm(dkv(.62, .5, .6));
  const FILL = { o: dk(BOT.u + 2.5, BOT.v + .8, BH + 7), d: norm(dkv(-.32, -.1, .94)) };   // nib under the ink, axis through the neck
  const FLICK0 = { o: dk(-36, 36, ZP + 44), d: norm(dkv(.45, .5, .74)) }, FLICK1 = { o: dk(-36, 14, ZP + 24), d: norm(dkv(.55, .55, .63)) };
  const CAP_DESK = { o: dk(12, 70, BH + R_CAPT), d: norm(dkv(1, 0, 0)) };          // put down in front of the copybook
  const BAR_DESK = { o: dk(-70 - 37, 51, BH + R_BARL), d: norm(dkv(1, 0, 0)) };
  const poseLerp = (a, b, k) => ({ o: kLerp(a.o, b.o, k), d: norm(kLerp(a.d, b.d, k)) });
  const lifted = (pose, k, h = 10) => ({ o: kAdd(pose.o, [0, 0, h*Math.sin(Math.PI*k)]), d: pose.d });
  const restOf = st => st.capK > 0 || st.capPull > 0 ? REST_U : REST_C;
  const tipAt = p => ({ o: p, d: WRITE_D });
  const boxAround = (pts, r) => [[0,1,2].map(i => Math.min(...pts.map(p => p[i])) - r), [0,1,2].map(i => Math.max(...pts.map(p => p[i])) + r)];

  // where the cap and barrel are: on the pen, sliding off along it, or put down on the desk
  function capPose(st){ const pulled = { o: kAt(st.pose.o, st.pose.d, -32*st.capPull), d: st.pose.d };
    return st.capK > 0 ? lifted(poseLerp(pulled, CAP_DESK, ease(st.capK)), st.capK, 22) : pulled; }
  function barPose(st){ const pulled = { o: kAt(st.pose.o, st.pose.d, 3*st.bTurn + 36*st.bPull), d: st.pose.d };
    return st.bDesk > 0 ? lifted(poseLerp(pulled, BAR_DESK, ease(st.bDesk)), st.bDesk, 22) : pulled; }

  /* ---------- nib and feed ---------- */
  const NIB_R = s => .5 + 3.6*Math.pow(Math.min(1, s/17), .85);
  const NIB_HW = s => .32 + 3.2*(s >= 13 ? 1 : (s/13)*(s/13)*(3 - 2*s/13));
  // the nib: a curved steel plate from a to b (0..17.5 shows; the rest is in the section)
  function nibSvg(o, d, a = 0, b = 17.5){
    a = Math.max(0, a); b = Math.min(17.5, b); if (b <= a) return '';
    const [e1, e2] = axisFrame(d), N = 14, M = 8;
    const pt = (s, j, lift = 0) => { const r = NIB_R(s) + lift, ph = Math.min(1.3, NIB_HW(s)/r), t = Math.PI/2 - ph + 2*ph*j/M;
      return kAdd(kAt(o, d, s), kAdd(kScl(e1, r*Math.cos(t)), kScl(e2, r*Math.sin(t)))); };
    const rows = []; for (let i = 0; i <= N; i++){ const s = a + (b - a)*i/N; rows.push(Array.from({length: M + 1}, (_, j) => pt(s, j))); }
    let top = '', under = '';
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++){
      const q = [rows[i][j], rows[i][j+1], rows[i+1][j+1], rows[i+1][j]], ax = kAt(o, d, a + (b - a)*(i + .5)/N);
      let n = norm(cross(sub(q[1], q[0]), sub(q[3], q[0]))); if (dot(n, sub(avg(q), ax)) < 0) n = kScl(n, -1);
      if (vis(n)) top += face(pd(q), tone(n, NIBM)); else under += face(pd(q), toneI(kScl(n, -1), NIBU)); }
    let s = under + top;
    const e0 = rows.map(r => r[0]), eM = rows.map(r => r[M]);
    s += ink(pd([...e0.slice().reverse(), ...eM], false), .9);
    if (vis(e2)){
      if (a < 9.2) s += ink(pd([pt(a, M/2, .02), pt(Math.min(b, 9.2), M/2, .02)], false), .55);                 // the slit between the tines
      if (a < 9.6 && b > 9.6){ const c = pt(9.6, M/2, .03), r = .75; s += fill(pd(Array.from({length: 12}, (_, i) => { const t = i/12*2*Math.PI; return kAdd(c, kAdd(kScl(e1, r*Math.cos(t)), kScl(d, r*Math.sin(t)))); })), '#2a2622'); }
      if (a < 12 && b > 15){ const c = pt(13.2, M/2, .03);
        s += txOn(kAdd(c, kScl(e1, .7)), d, e2, 'F', 1.7, '#5f6668', 800)
          + `<path d="${pd([pt(11.2, 1.6, .03), pt(12.2, 2.5, .03), pt(11.6, 3.2, .03)], false)}" fill="none" stroke="#6d7577" stroke-width=".45"/>`
          + `<path d="${pd([pt(11.2, M - 1.6, .03), pt(12.2, M - 2.5, .03), pt(11.6, M - 3.2, .03)], false)}" fill="none" stroke="#6d7577" stroke-width=".45"/>`; }
    }
    if (a <= 0) s += rod(kAdd(kAt(o, d, -.25), kScl(e2, .3)), kAdd(kAt(o, d, .7), kScl(e2, .42)), .5, NIBM, toneI, .6);   // tipping pellet
    return s;
  }
  // the feed under it: black comb with fins; in see-through the ink channel along its top
  function feedSvg(o, d, a, b, channel = false){
    a = Math.max(2.5, a); b = Math.min(19, b); if (b <= a) return '';
    const [e1, e2] = axisFrame(d), of = kAdd(o, kScl(e2, -.95)), r = s => .9 + 1.8*(s - 2.5)/16.5;
    let s = coaxSeg(of, d, { s0: a, s1: b, r0: r(a), r1: r(b), M: DARK, n: 16, w: .8, shade: toneI });
    let fins = ''; for (let x = 6.5; x < 16.5; x += 1.25) if (x > a && x < b) for (const run of nearArc(kAt(of, d, x), d, r(x) + .02, 20)) fins += pd(run, false);
    if (fins) s += `<path d="${fins}" fill="none" stroke="#8a857c" stroke-width=".5"/>`;
    if (channel) s += `<path d="${pd([kAdd(kAt(of, d, a), kScl(e2, r(a) - .05)), kAdd(kAt(of, d, b), kScl(e2, r(b) - .05))], false)}" fill="none" stroke="#4f78d8" style="stroke-width:.55"/>`;
    return s;
  }
  const nibAssy = (o, d, a, b, channel) => { const [, e2] = axisFrame(d), n = nibSvg(o, d, a, b), fd = feedSvg(o, d, a, b, channel); return vis(e2) ? fd + n : n + fd; };

  /* ---------- everything inside the cap and barrel, as cuttable pieces on the axis ---------- */
  // each piece: { name, s0, s1, draw(a, b) } so a wrapper (cap, barrel) can hide the part it covers
  function innerSpecs(st, xr = false){
    const { o, d } = st.pose, pz = PIST0 + (PIST1 - PIST0)*st.piston, inkEnd = 45 + 30*st.ink;
    const cs = (g, a, b) => { const s0 = Math.max(g.s0, a), s1 = Math.min(g.s1, b); if (s1 <= s0) return '';
      const r = s => g.r0 + ((g.r1 ?? g.r0) - g.r0)*(s - g.s0)/(g.s1 - g.s0); return coaxSeg(o, d, { ...g, s0, s1, r0: r(s0), r1: r(s1) }); };
    const thread = (a, b) => { let t = ''; for (let x = 37.6; x < 41; x += .9) if (x > a && x < b) for (const run of nearArc(kAt(o, d, x), d, 4.92, 24)) t += pd(run, false);
      return t ? `<path d="${t}" fill="none" stroke="${INK}" stroke-width=".45" opacity=".7"/>` : ''; };
    const KNOB = { s0: 86, s1: 92, r0: 3.2, M: DARK, n: 12, w: .9, edges: .4, phase: st.knob*2*Math.PI, shade: toneI };
    return [
      { name:'nib', s0: 0, s1: 17, draw: (a, b) => nibAssy(o, d, a, Math.min(b, 17), xr) },   // (on into the section: hidden)
      { name:'lip', s0: 17, s1: 19, draw: (a, b) => cs({ s0: 17, s1: 19, r0: 4.5, r1: 4.6, M: DARK, n: 28, w: 1.1, hole0: 2.2, bore: '#141210' }, a, b) },
      { name:'grip', s0: 19, s1: 37, draw: (a, b) => cs({ s0: 19, s1: 37, r0: 4.15, r1: 4.5, M: DARK, n: 28, w: 1.2 }, a, b) },
      { name:'thread', s0: 37, s1: 41, draw: (a, b) => cs({ s0: 37, s1: 41, r0: 4.9, M: DARK, n: 28, w: 1 }, a, b) + thread(a, b) },
      { name:'cuff', s0: 41, s1: 45, draw: (a, b) => cs({ s0: 41, s1: 45, r0: 3.9, M: MAT.steel, n: 24, w: .9, shade: toneI }, a, b) },
      { name:'res', s0: 45, s1: 80, draw: (a, b) => {   // ink, piston and rod (end to end: sorted for the view) in the clear reservoir
        const s = coaxOrder(d, [[45, inkEnd, { r0: 3.0, M: BLUEM, n: 20, w: .5 }], [pz, pz + 3, { r0: 3.25, M: MAT.rubber, n: 20, w: .7 }], [pz + 3, 80, { r0: .9, M: MAT.steel, n: 10, w: .5 }]]
          .map(([s0, s1, g]) => ({ s0, s1, svg: cs({ s0, s1, ...g, shade: toneI }, a, b) })));
        return s + `<g opacity=".45">${cs({ s0: 45, s1: 80, r0: 3.4, M: MAT.clear, n: 24, w: .8, shade: toneI }, a, b)}</g>`; } },
      { name:'housing', s0: 80, s1: 86, draw: (a, b) => cs({ s0: 80, s1: 86, r0: 3.7, M: MAT.steel, n: 24, w: .9, shade: toneI }, a, b) },
      { name:'knob', s0: 86, s1: 93, draw: (a, b) => coaxOrder(d, [{ s0: 86, s1: 92, svg: cs(KNOB, a, b) },   // knob, its rounded end
        { s0: 92, s1: 93, svg: cs({ s0: 92, s1: 93, r0: 3.2, r1: 2.4, M: DARK, n: 12, w: .9, phase: st.knob*2*Math.PI, shade: toneI }, a, b) }]) } ];
  }
  // Cut the inner pieces at every edge of the wrappers, so each wrapper is drawn over just the pieces it covers
  function wrapChain(d, specs, wrappers, extra = []){
    const cuts = [...new Set([-1e3, 1e3, ...wrappers.flatMap(w => [w.s0, w.s1])])].sort((x, y) => x - y), items = [...extra];
    for (let i = 0; i < cuts.length - 1; i++){ const a = cuts[i], b = cuts[i + 1], cover = wrappers.filter(w => w.s0 <= a + 1e-6 && w.s1 >= b - 1e-6);
      for (const sp of specs){ if (sp.s1 <= a || sp.s0 >= b) continue; const svg = sp.draw(a, b); if (!svg) continue;
        const name = sp.name + '@' + i; items.push({ name, s0: Math.max(a, sp.s0), s1: Math.min(b, sp.s1), svg, over: sp.over ? sp.over.map(n => n + '@' + i) : null });
        for (const w of cover) (w.over = w.over || []).push(name); } }
    for (const w of wrappers) items.push(w);
    return coaxOrder(d, items);
  }

  /* ---------- cap and barrel ---------- */
  function capParts(st, m, cp, xr = false){
    const { o, d } = cp, [e1, e2] = axisFrame(d), off = st.capPull > 0 || st.capK > 0;
    // finial, tube, cap ring, the tube's last mm: end to end, so the ring's faces sort with the tube from either end
    const piece = g => ({ s0: g.s0, s1: g.s1, svg: coaxSeg(o, d, g) });
    const tube = act('cap', coaxOrder(d, [piece({ s0: -9, s1: -7, r0: 5.0, r1: R_CAPT, M: m, n: 32, w: 1.2 }),
      piece({ s0: -7, s1: 53, r0: R_CAPT, M: m, n: 32, w: 1.6 }), piece({ s0: 53, s1: 59, r0: R_CAPT + .15, M: MAT.steel, n: 32, w: 1 }),
      piece({ s0: 59, s1: 60, r0: R_CAPT, M: m, n: 32, w: 1.6, hole1: off ? 6.3 : 0, bore: '#1d1a16' })]));
    const clip = obox(kAdd(kAt(o, d, 14), kScl(e2, 8.1)), d, e1, e2, 19, 1.5, .4, MAT.steel, tone, .9)
      + obox(kAdd(kAt(o, d, -4.2), kScl(e2, 7.4)), d, e1, e2, 1.6, 1.5, .8, MAT.steel, tone, .8)
      + rod(kAdd(kAdd(kAt(o, d, 33.2), kScl(e2, 7.6)), kScl(e1, -1.4)), kAdd(kAdd(kAt(o, d, 33.2), kScl(e2, 7.6)), kScl(e1, 1.4)), .7, MAT.steel, toneI, .8);
    const svg = vis(e2) ? tube + clip : clip + tube;
    const inner = xr ? `<g opacity=".45">${coaxSeg(o, d, { s0: -5, s1: 23, r0: 5.4, M: MAT.plastic, n: 24, w: .7, shade: toneI, hole1: 4.6, bore: '#5e5a54' })}</g>` : '';
    return { svg, inner, pts: [...axisRing(kAt(o, d, -9), d, 5, 8), ...axisRing(kAt(o, d, 60), d, R_CAPT, 8), kAdd(kAt(o, d, 14), kScl(e2, 8.5))] };
  }
  // from = where it shows: 37 (its front end), or the cap's mouth while the cap is over its front
  function barrelParts(st, m, bp, from = 37){
    const { o, d } = bp, [e1, e2] = axisFrame(d), turn = st.bTurn*4*Math.PI, off = st.bTurn > 0;
    let svg = coaxOrder(d, [{ s0: from, s1: 121, svg: coaxSeg(o, d, { s0: from, s1: 121, r0: R_BARL + (5.6 - R_BARL)*(from - 37)/84, r1: 5.6, M: m, n: 32, w: 1.6, hole0: off ? 4.95 : 0, bore: '#1d1a16' }) },
      { s0: 121, s1: 124, svg: coaxSeg(o, d, { s0: 121, s1: 124, r0: 5.6, r1: 3.4, M: m, n: 32, w: 1.2 }) }]);   // barrel, finial: sorted for the view
    for (const [deg, str] of [[30, '天天向上'], [210, 'IRIDIUM POINT']]){
      const a = deg*Math.PI/180 + turn, n = kAdd(kScl(e1, Math.cos(a)), kScl(e2, Math.sin(a)));
      if (!vis(n)) continue; const v = cross(n, d);
      svg += txOn(kAdd(kAdd(kAt(o, d, 82), kScl(n, 5.88)), kScl(v, -1.1)), d, n, str, 3.0, deg === 30 ? '#ffffff' : INK, 800); }
    return { svg, pts: [...axisRing(kAt(o, d, 37), d, R_BARL, 8), ...axisRing(kAt(o, d, 124), d, 3.4, 8)] };
  }

  /* ---------- the copybook sheet, drops and plum ---------- */
  function copySheet(st){
    const [u0, v0, u1, v1] = SHEET, z = ZP + .02;
    let s = deskSheet(u0, v0, u1, v1, BH, .4, {});
    s += act('sheet', fill(pd(rectUV(u0, v0, u1, v1).map(([u, v]) => dk(u, v, z))), 'transparent'));
    s += deskText(-76, -32, z, '钢笔字帖', 5.6, INK, 800) + deskText(0, -32, z, '第 1 课  永字八法', 3.6, '#5b554c', 700);
    // the row of 田字格: solid boxes, dashed middle lines
    let box = '', mid = '';
    for (let i = 0; i < NBOX; i++){ const a = BOX_U0 + i*BOXW, b = a + BOXW;
      box += pd([dk(a, BOX_V, z), dk(b, BOX_V, z), dk(b, BOX_V + BOXW, z), dk(a, BOX_V + BOXW, z)]);
      mid += pd([dk(a + BOXW/2, BOX_V, z), dk(a + BOXW/2, BOX_V + BOXW, z)], false) + pd([dk(a, BOX_V + BOXW/2, z), dk(b, BOX_V + BOXW/2, z)], false); }
    s += `<path d="${box}" fill="none" stroke="#c9605a" stroke-width=".7"/><path d="${mid}" fill="none" stroke="#d98a84" stroke-width=".45" stroke-dasharray="1.6 1.4"/>`;
    s += graphite(YONGS[0], '#e9a7a2', 1.15, 1);                          // the trace-over model in the first box
    const lines = []; for (let i = 1; i <= st.written; i++) lines.push(...YONGS[i]);
    if (st.ans) lines.push(...traceStrokes(YONGS[st.ans.i], st.ans.dist).done);
    s += graphite(lines, BLUE, .6, .95);
    // the plum: a blob pushed out of the nib, branches blown from it, blossoms dotted on
    if (st.blob > 0){ const c = dk(PLUM.u, PLUM.v, z), r = 3.4*st.blob;
      s += fill(pd(Array.from({length: 18}, (_, i) => { const t = i/18*2*Math.PI, w = 1 + .12*Math.sin(3*t + 1); return kAdd(c, dkv(r*w*Math.cos(t), r*.8*w*Math.sin(t))); })), BLUE); }
    if (st.blow > 0) for (const br of PLUM_BR){ const k = Math.max(0, Math.min(1, (st.blow - br.t0)/(br.t1 - br.t0))); if (k <= 0) continue;
      const n = Math.max(2, Math.round(br.pts.length*k)), pts = br.pts.slice(0, n).map(([u, v]) => dk(u, v, z));
      s += `<path d="${pd(pts, false)}" fill="none" stroke="${BLUE}" style="stroke-width:${br.w}" stroke-linecap="round" stroke-linejoin="round"/>`; }
    for (let i = 0; i < st.blossoms; i++){ const [u, v] = PLUM_FL[i], k = i === st.blossoms - 1 ? st.blossomK : 1;
      const ring = Array.from({length: 26}, (_, j) => { const t = j/25*2*Math.PI*k, rr = 2.1 + .7*Math.cos(5*t); return dk(u + rr*Math.cos(t), v + rr*Math.sin(t), z); });
      s += `<path d="${pd(ring, false)}" fill="none" stroke="${BLUE}" style="stroke-width:.45" stroke-linecap="round"/>`;
      if (k >= 1) s += fill(pd(Array.from({length: 8}, (_, j) => { const t = j/8*2*Math.PI; return dk(u + .45*Math.cos(t), v + .45*Math.sin(t), z); })), BLUE); }
    return s;
  }
  // plum branches (seeded): the trunk up the page from the blob, side branches off it, twigs
  const { PLUM_BR, PLUM_FL } = (() => { const rnd = kRng(29), br = [], fl = [];
    const grow = (u, v, ang, len, w, t0, depth) => { const pts = [[u, v]]; let a = ang;
      for (let i = 0; i < 9; i++){ a += (rnd() - .5)*.5; u += Math.cos(a)*len/9; v += Math.sin(a)*len/9; pts.push([u, v]); }
      const t1 = t0 + .32 + .1*depth; br.push({ pts, w, t0, t1 });
      if (depth < 2) for (const side of [-1, 1]){ const j = 3 + Math.floor(rnd()*4), p = pts[j]; grow(p[0], p[1], a + side*(.55 + rnd()*.4), len*(.5 + rnd()*.15), w*.6, t0 + (t1 - t0)*j/9, depth + 1); }
      else fl.push(pts[pts.length - 1]); };
    grow(PLUM.u, PLUM.v, -Math.PI/2 - .1, 26, 1.2, 0, 0);
    return { PLUM_BR: br, PLUM_FL: fl.slice(0, 6) }; })();
  const dropSvg = dp => { const c = dk(dp.u, dp.v, dp.z + .03), a = dp.a, r = dp.r;
    return fill(pd(Array.from({length: 14}, (_, i) => { const t = i/14*2*Math.PI; const x = r*1.5*Math.cos(t), y = r*Math.sin(t); return kAdd(c, dkv(x*Math.cos(a) - y*Math.sin(a), x*Math.sin(a) + y*Math.cos(a))); })), BLUE, 'opacity=".92"')
      + [1.9, 2.6].map((k, i) => { const p = kAdd(c, dkv(r*k*Math.cos(a + (i ? .4 : -.3)), r*k*Math.sin(a + (i ? .4 : -.3)))); return fill(pd(Array.from({length: 8}, (_, j) => { const t = j/8*2*Math.PI; return kAdd(p, dkv(r*.3*Math.cos(t), r*.3*Math.sin(t))); })), BLUE); }).join(''); };

  /* ---------- the ink bottle and its cap ---------- */
  function bottle(st){
    const c = dk(BOT.u, BOT.v, 0), ring = (r, z, n = 32) => axisRing([c[0], c[1], z], [0, 0, 1], r, n);
    const z0 = BH, z1 = BH + BOT.h, z2 = z1 + BOT.sh, z3 = BOT_TOP, inkZ = BH + 1.5 + st.bottleInk;
    const GLASS = { l:'#eef7f8', m:'#cfe6ea', d:'#a6c6cc' };
    // the far wall (seen from inside), the ink and any bubbles, the nib dipping in, the near wall and label
    let far = `<g opacity=".4">${loft(ring(BOT.r, z0), ring(BOT.r, z1), n => toneI(n.map(v => -v), GLASS), true)}</g>`;
    let mid = cyl(c[0], c[1], BH + 1.5, inkZ, BOT.r - 1.2, BLUEM, toneI, .6, 32);
    for (const b of st.bubbles){ const p = [c[0] + b.x, c[1] + b.y, Math.min(inkZ - .6, BH + 3 + b.z)];
      mid += `<circle cx="${f(P(...p)[0])}" cy="${f(P(...p)[1])}" r="${f(b.r*CAM_K*.9)}" fill="#c9d8f2" stroke="${INK}" stroke-width=".5"/>`; }
    let near = `<g opacity=".38">${loft(ring(BOT.r, z0), ring(BOT.r, z1), n => toneI(n, GLASS))}</g>`
      + `<g opacity=".5">${loft(ring(BOT.r, z1), ring(BOT.nr, z2), n => toneI(n, GLASS))}${loft(ring(BOT.nr, z2), ring(BOT.nr, z3), n => toneI(n, GLASS))}</g>`
      + ink(pd(ring(BOT.nr, z3)), .9) + ink(pd(ring(BOT.nr - 1.3, z3)), .6);
    // label: a paper band round the front of the body, the name facing the desk's front
    const lab = loft(ring(BOT.r + .05, BH + 6), ring(BOT.r + .05, BH + 16), n => toneI(n, { l:'#fff4d6', m:'#ecdcb4', d:'#c7b58a' }));
    let txt = ''; const fn = DV; if (vis(fn)){ const p = kAdd(c, kScl(fn, BOT.r + .1)); txt = txOn([p[0], p[1], BH + 9.6], DU, fn, '蓝黑墨水', 3.4, BLUE, 800) + txOn([p[0], p[1], BH + 13.6], DU, fn, 'BLUE BLACK 60ml', 1.9, INK, 700); }
    near += lab + txt + hullInk([...ring(BOT.r, z0, 16), ...ring(BOT.r, z1, 16), ...ring(BOT.nr, z3, 16)], 1.8);
    return { far: far + mid, near, pts: [...ring(BOT.r, z0, 12), ...ring(BOT.r, z1, 12), ...ring(BOT.nr, z3, 12)] };
  }
  const BCAP = { u: 60, v: -30, r: 8, h: 11 };
  const bottleCap = () => { const c = dk(BCAP.u, BCAP.v, 0); return cyl(c[0], c[1], BH, BH + BCAP.h, BCAP.r, DARK, toneI, 1.4, 28)
    + (() => { let t = ''; for (let i = 0; i < 18; i++){ const a = i/18*2*Math.PI, rd = [Math.cos(a), Math.sin(a), 0]; if (vis(rd)) t += pd([[c[0] + rd[0]*BCAP.r, c[1] + rd[1]*BCAP.r, BH + 1.5], [c[0] + rd[0]*BCAP.r, c[1] + rd[1]*BCAP.r, BH + BCAP.h - 1.5]], false); }
      return `<path d="${t}" fill="none" stroke="#6d6862" stroke-width=".5"/>`; })(); };

  /* ---------- scene ---------- */
  function penSvg(st, m, xr){
    const { o, d } = st.pose, cp = capPose(st), bp = barPose(st), loose = [], wraps = [], extra = [];
    const capOn = st.capK === 0, barOn = st.bDesk === 0;
    const sOf = p => dot(sub(p, o), d);                                     // where an attached part sits on the pen's axis
    // capped, the barrel's front is in the cap: drawn from the cap's mouth on, the two meet there instead of overlapping
    const cs0 = sOf(cp.o), bs0 = sOf(bp.o), from = capOn && barOn ? Math.max(37, cs0 + 60 - bs0) : 37;
    const c = capParts(st, m, cp, xr), b = barrelParts(st, m, bp, from);
    if (capOn) wraps.push({ name: 'cap', s0: cs0 - 9, s1: cs0 + 60, svg: c.svg, over: [] });
    else loose.push({ box: boxAround(c.pts, 1), svg: c.svg });
    if (barOn) wraps.push({ name: 'barrel', s0: bs0 + from, s1: bs0 + 124, svg: b.svg, over: [] });
    else loose.push({ box: boxAround(b.pts, 1), svg: b.svg });
    const chain = wrapChain(d, innerSpecs(st), wraps, extra);
    const pts = [...(capOn ? c.pts : []), ...(barOn ? b.pts : []), ...axisRing(o, d, 1, 6), ...axisRing(kAt(o, d, 93), d, 3.2, 8), ...axisRing(kAt(o, d, 30), d, 4.6, 8)];
    return { svg: chain, loose, pts, capPts: c.pts, barPts: b.pts, inner: c.inner, capOn };
  }
  // see-through: the inside drawn whole over the ghosted pen (inner cap round the nib while it is capped, wrapping just
  // what it covers)
  function penMech(st, pn){
    const { o, d } = st.pose, s0 = dot(sub(capPose(st).o, o), d);
    return wrapChain(d, innerSpecs(st, true), pn.capOn && pn.inner ? [{ name: 'inner', s0: s0 - 5, s1: s0 + 23, svg: pn.inner, over: [] }] : []);
  }
  function scene(st, m){
    const k = ease(st.xr || 0);
    let s = copySheet(st);
    for (const dp of st.drops) s += dropSvg(dp);
    const pn = penSvg(st, m, k > 0), bt = bottle(st);
    s += castShadow(pn.pts, ZP);
    if (st.capK > 0) s += castShadow(pn.capPts, BH);
    if (st.bDesk > 0) s += castShadow(pn.barPts, BH);
    s += castShadow(bt.pts, BH);
    const bc = dk(BCAP.u, BCAP.v, 0); s += castShadow(axisRing([bc[0], bc[1], BH + BCAP.h], [0, 0, 1], BCAP.r, 12).concat(axisRing([bc[0], bc[1], BH], [0, 0, 1], BCAP.r, 12)), BH);
    let pen = pn.svg;
    if (k > 0) pen = `<g opacity="${f(1 - .8*k)}">${pen}</g><g opacity="${f(k)}">${penMech(st, pn)}</g>`;
    const fly = st.flying.map(dp => { const q = P(...dp.p); return `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${f(dp.r*CAM_K)}" fill="${BLUE}" stroke="${INK}" stroke-width=".5"/>`; }).join('');
    // the pen dips into the bottle: draw it between the bottle's far wall and its near wall
    const dipping = kLen(sub(st.pose.o, FILL.o)) < 30;
    const bAt = dk(BOT.u, BOT.v, 0), bBox = [[bAt[0] - BOT.r, bAt[1] - BOT.r, BH], [bAt[0] + BOT.r, bAt[1] + BOT.r, BOT_TOP]];
    const ppBox = boxAround(pn.pts, 0);
    const items = [
      { box: [[bc[0] - BCAP.r, bc[1] - BCAP.r, BH], [bc[0] + BCAP.r, bc[1] + BCAP.r, BH + BCAP.h]], svg: bottleCap() },
      ...pn.loose ];
    if (dipping) items.push({ box: bBox, svg: bt.far + pen + bt.near });
    else items.push({ box: bBox, svg: bt.far + bt.near }, { box: ppBox, svg: pen });
    s += byDepth(items) + fly;
    s += labels(st, k, pn);
    return s;
  }
  function labels(st, k, pn){
    const { o, d } = st.pose, [e1, e2] = axisFrame(d), cp = capPose(st), bp = barPose(st);
    const pp = pn.pts, B = [Math.min(...pp.map(p => p[0])), Math.max(...pp.map(p => p[0])), Math.min(...pp.map(p => p[1])), Math.max(...pp.map(p => p[1])), 0, 12];
    const capOn = st.capK === 0 && st.capPull === 0;
    if (k > .6) return zhCallouts([
      { at: kAdd(kAt(o, d, 5), kScl(e2, NIB_R(5))), text: '笔尖', on: !!st.ans },
      { at: kAdd(kAt(o, d, 9.6), kScl(e2, NIB_R(9.6))), text: '气孔', on: st.filling },
      { at: kAdd(kAt(o, d, 12), kScl(e2, -2.4)), text: '导墨舌', on: !!st.ans || st.filling },
      { at: kAt(o, d, 28), text: '握位', on: false },
      { at: kAt(o, d, 45 + 15*st.ink), text: '墨水', on: st.filling },
      { at: kAt(o, d, PIST0 + (PIST1 - PIST0)*st.piston + 1.5), text: '活塞', on: st.filling },
      { at: kAt(o, d, 83), text: '螺杆', on: st.filling },
      { at: kAt(o, d, 90), text: '旋钮', on: st.filling },
      ...(capOn ? [{ at: kAt(cp.o, cp.d, 10), text: '内帽', on: false }] : []) ], B);
    return zhCallouts([
      ...(st.capK === 0 ? [{ at: kAdd(kAt(cp.o, cp.d, 30), kScl(axisFrame(cp.d)[1], 8.4)), text: '笔夹', on: false }, { at: kAt(cp.o, cp.d, 4), text: '笔帽', on: st.capPull > 0 }] : []),
      ...(st.bDesk === 0 ? [{ at: kAt(bp.o, bp.d, 100), text: '笔杆', on: st.bTurn > 0 }] : []),
      ...(!capOn ? [{ at: kAdd(kAt(o, d, 6), kScl(e2, NIB_R(6))), text: '笔尖', on: !!st.ans }, { at: kAt(o, d, 28), text: '握位', on: false }] : []),
      ...(st.bTurn > .5 ? [{ at: kAt(o, d, 62), text: '吸墨器', on: st.filling }] : []),
      { at: dk(BOT.u - BOT.r*.7, BOT.v + BOT.r*.7, BH + BOT.h), text: '墨水瓶', on: st.filling } ], B);
  }

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { cap: '笔帽还在手上', fill: '正在吸墨水', write: '正在写', flick: '正在甩', plum: '正在画梅花' };
  const busy = () => { if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等一下'); return true; };
  const toRest = (st, h = 8, ms = 420) => ({ ms, start(){ this.from = st.pose; }, step(k){ st.pose = lifted(poseLerp(this.from, restOf(st), ease(k)), k, h); }, end(){ st.pose = restOf(st); } });
  const leadRest = st => st.pose === restOf(st) ? null : toRest(st);   // back to the desk first, if the pen is elsewhere
  const moveTo = (st, pose, h = 10, ms = 420) => ({ ms, start(){ this.from = st.pose; }, step(k){ st.pose = lifted(poseLerp(this.from, typeof pose === 'function' ? pose() : pose, ease(k)), k, h); } });
  // cap off: slide it off the nib, put it down on the desk (the pen settles onto its barrel); on: the reverse
  const uncapSegs = st => st.capK > 0 ? [] : [{ ms: 320, step(k){ st.capPull = ease(k); } }, { ms: 520, step(k){ st.capK = k; } }, toRest(st, 0, 180)];
  const recapSegs = st => [toRest(st, 0, 180), { ms: 520, step(k){ st.capK = 1 - k; } }, { ms: 320, step(k){ st.capPull = 1 - ease(k); }, end(){ st.pose = REST_C; } }];
  function capToggle(st){ if (busy()) return;
    const off = st.capK > 0;
    kPlay(ui, 'cap', off ? [leadRest(st), ...recapSegs(st)] : [leadRest(st), ...uncapSegs(st)], () => ui.flash(off ? '盖好了，笔尖不会干' : '笔帽放桌上了')); }
  function write(st){ if (busy()) return;
    if (st.ink < .03) return ui.flash('钢笔没墨了——先吸墨水');
    if (st.written >= NBOX - 1){ st.written = 0; ui.flash('一行写满了，换一张字帖'); }
    const i = st.written + 1, sk = YONGS[i], len = strokesLength(sk);
    kPlay(ui, 'write', [leadRest(st), ...uncapSegs(st), moveTo(st, () => tipAt(sk[0][0]), 14),
      { ms: Math.max(900, len/26*1000), start(){ st.ans = { i, dist: 0 }; }, step(k){ st.ans.dist = k*len; st.pose = tipAt(traceStrokes(sk, st.ans.dist, 2).tip); },
        end(){ st.written = i; st.ans = null; st.ink = Math.max(0, st.ink - .04); } },
      toRest(st, 10)], () => { if (st.written === 1) ui.flash('永字八法：点、横、竖、钩、提、撇、短撇、捺'); });
  }
  // fill from the bottle: barrel off, nib in, piston down (air out), piston up (ink in), out, barrel on
  function fillPen(st){ if (busy()) return;
    if (st.ink > .95) return ui.flash('已经吸满了');
    if (st.bottleInk < 3) return ui.flash('墨水瓶快见底了');
    const t0 = st.ink;
    kPlay(ui, 'fill', [leadRest(st), ...uncapSegs(st),
      { ms: 700, step(k){ st.bTurn = ease(k); } }, { ms: 320, step(k){ st.bPull = ease(k); } }, { ms: 560, step(k){ st.bDesk = k; } },
      moveTo(st, () => ({ o: kAdd(FILL.o, [0, 0, 26]), d: FILL.d }), 12, 600), moveTo(st, FILL, 0, 380),
      { ms: 700, start(){ this.p0 = st.piston; st.filling = true; }, step(k){ st.piston = this.p0*(1 - ease(k)); st.knob = -k*1.5; st.ink = Math.min(st.ink, st.piston);
          if (rnd() < .5 && st.bubbles.length < 10) st.bubbles.push({ x: (rnd() - .5)*3, y: (rnd() - .5)*3, z: 4, r: .5 + rnd()*.7 });
          for (const b of st.bubbles) b.z += .6; st.bubbles = st.bubbles.filter(b => b.z < 20); } },
      { ms: 1400, step(k){ st.piston = ease(k); st.knob = -1.5 + k*3; st.ink = Math.max(st.ink, st.piston); st.bottleInk = this.b0 - 1.2*(st.ink - t0); for (const b of st.bubbles) b.z += .8; st.bubbles = st.bubbles.filter(b => b.z < 20); },
        start(){ this.b0 = st.bottleInk; }, end(){ st.filling = false; st.bubbles = []; } },
      moveTo(st, () => ({ o: kAdd(FILL.o, [0, 0, 26]), d: FILL.d }), 0, 380), toRest(st, 12, 600),
      { ms: 560, step(k){ st.bDesk = 1 - k; } }, { ms: 320, step(k){ st.bPull = 1 - ease(k); } }, { ms: 650, step(k){ st.bTurn = 1 - ease(k); } } ],
      () => ui.flash('吸满了！擦干笔尖，旋好笔杆'));
  }
  // flick: a snap of the wrist that stops dead; the ink sitting in the nib and feed flies on in a row of drops
  function flick(st){ if (busy()) return;
    const dry = st.ink < .05; let off = 0, front = 0;
    kPlay(ui, 'flick', [leadRest(st), ...uncapSegs(st), moveTo(st, FLICK0, 6, 420),
      { ms: 150, start(){ this.from = st.pose; }, step(k){ st.pose = poseLerp(this.from, FLICK1, k*k); },
        end(){ if (dry) return; st.ink = Math.max(0, st.ink - .05);
          const tip = st.pose.o; [.35, .5, .65, .8, .95, 1.1, 1.3, 2.0, 2.4].forEach((sp, i) => { const side = (i % 2 ? 1 : -1)*(.03 + .02*i);
            st.flying.push({ p: tip.slice(), v: kAdd(dkv(side*420, -520*sp, 0), [0, 0, -240 + 90*sp]), r: .95 - .06*i }); });
          ui.animate(dt => { for (const dp of st.flying){ dp.v[2] -= 1900*dt; dp.p = kAdd(dp.p, kScl(dp.v, dt));
              const q = undk(dp.p), onDesk = ctx.onDesk(dp.p), onSheet = q[0] > SHEET[0] && q[0] < SHEET[2] && q[1] > SHEET[1] && q[1] < SHEET[3];
              if (onDesk){ const zs = onSheet ? ZP : BH;
                if (dp.p[2] <= zs && dp.v[2] < 0){ dp.done = true; st.drops.push({ u: q[0], v: q[1], z: zs, r: dp.r*1.5, a: Math.atan2(-1, (rnd() - .5)*.4) }); } }
              // past an edge and below the top: out of sight, gone (over the far edge, world x = v < -D/2: at the front classmate)
              else if (dp.p[2] < BH){ dp.done = true; if (dp.p[0] < 0 && !ctx.onDesk([dp.p[0], 0, BH])) front++; else off++; } }
            st.flying = st.flying.filter(dp => !dp.done); return st.flying.length > 0; }); } },
      { ms: 700, step(){} }, toRest(st, 8)],
      () => { const away = [front && `${front} 滴飞过桌沿，朝前桌同学飞去了`, off && `${off} 滴飞出了桌子`].filter(Boolean).join('，');
        ui.flash(dry ? '甩了半天，没墨甩不出来' : away ? `甩笔！一排墨点甩上字帖，还有 ${away}` : '甩笔！一排墨点甩在了字帖上', 2600); });
  }
  // ink plum: knob down pushes a blob out of the nib; blown into branches; blossoms dotted on with the nib
  function plum(st){ if (busy()) return;
    if (st.ink < .12) return ui.flash('墨不够挤了——先吸墨水');
    if (st.blossoms){ st.blob = 0; st.blow = 0; st.blossoms = 0; }
    const spot = dk(PLUM.u, PLUM.v, ZP + .4), segs = [leadRest(st), ...uncapSegs(st), moveTo(st, () => tipAt(kAdd(spot, [0, 0, 2])), 14),
      { ms: 800, start(){ this.p0 = st.piston; st.filling = true; }, step(k){ st.knob = -k; st.blob = ease(k); const v = this.p0 - .14*k; st.piston = v; st.ink = Math.min(st.ink, v); }, end(){ st.filling = false; } },
      moveTo(st, () => tipAt(kAdd(spot, [0, 0, 22])), 0, 300),
      { ms: 1500, step(k){ st.blow = k*1.6; } } ];
    PLUM_FL.forEach((p, i) => { const at = dk(p[0] + 2.8, p[1], ZP + .1);
      segs.push(moveTo(st, () => tipAt(at), 3, 200), { ms: 260, start(){ st.blossoms = i + 1; }, step(k){ st.blossomK = k; const t = k*2*Math.PI, rr = 2.1 + .7*Math.cos(5*t); st.pose = tipAt(dk(p[0] + rr*Math.cos(t), p[1] + rr*Math.sin(t), ZP + .1)); } }); });
    segs.push(toRest(st, 10));
    kPlay(ui, 'plum', segs, () => ui.flash('墨梅：不要人夸好颜色，只留清气满乾坤', 2800));
  }

  const __cfg = ({
    fig:'03', turn:'full', title:'钢笔', palette:'mustard',
    state:{ pose: REST_C, capPull: 0, capK: 0, bTurn: 0, bPull: 0, bDesk: 0, piston: .55, ink: .55, knob: 0, bottleInk: 17, bubbles: [],
      filling: false, written: 0, ans: null, drops: [], flying: [], blob: 0, blow: 0, blossoms: 0, blossomK: 1 },
    scene,
    stats: st => [ { label:'墨水', value: Math.round(st.ink*100) + '%' }, { label:'练字', value: st.written + ' 个', small: true } ],
    buttons:[
      { label:'拔帽 / 盖帽', onClick: capToggle },
      { label:'吸墨水', onClick: fillPen },
      { label:'练字', onClick: write },
      { label:'甩笔', onClick: flick },
      { label:'挤墨画梅花', onClick: plum },
    ],
    acts:{ cap: st => capToggle(st), sheet: st => write(st) },
    params:(st, q) => {
      if (q.get('cap') === '0'){ st.capPull = 1; st.capK = 1; st.pose = REST_U; }
      if (q.has('ink')){ st.ink = +q.get('ink'); st.piston = Math.max(st.piston, st.ink); }
      if (q.has('piston')) st.piston = +q.get('piston');
      if (q.has('written')) st.written = Math.min(NBOX - 1, +q.get('written'));
      if (q.get('barrel') === '0'){ st.bTurn = 1; st.bPull = 1; st.bDesk = 1; st.capPull = 1; st.capK = 1; st.pose = REST_U; }
      if (q.get('pose') === 'fill'){ st.bTurn = st.bPull = st.bDesk = 1; st.capPull = st.capK = 1; st.pose = FILL; }
      if (q.get('pose') === 'write'){ st.capPull = st.capK = 1; st.pose = tipAt(YONGS[1][1][0]); }
      if (q.get('pose') === 'flick'){ st.capPull = st.capK = 1; st.pose = FLICK0; }
      if (q.get('plum') === '1'){ st.blob = 1; st.blow = 1.6; st.blossoms = PLUM_FL.length; }
      if (q.get('drops') === '1') for (let i = 0; i < 6; i++) st.drops.push({ u: -10 + (i % 2)*3, v: -6 - i*8, z: ZP, r: 1.2 - .1*i, a: -1.5 });
    },
  });

  return ctx.adapt(__cfg, { seeThrough: true });
}
