// Fig. 02 按动中性笔 — desk-scene object, ported from stationery/src/02-click-pen.html by scripts/port-figures.mjs.
// The figure's own code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*),
// ctx.ui its ui (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are
// collected by the scene.
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: -110, v: 20, rot: 0 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 02 — Retractable gel pen (0.5 mm, push button), lying on the shared 英语默写 sheet (S4) on the classroom desk.
     Desk terms: u along the desk's front edge, v toward the student (this object's own frame, ctx.desk); 1 unit = 1 mm.
     The dictation is printed and written in S4's top band (pv 22–120) through the paper's own frame.
     The pen is drawn on its own axis: s = mm from the hole in the front cone toward the push button.

     How it really works (each button is one of these):
     1. Click (rotating cam, the "Parker" mechanism): the button is the back end of a plunger whose front end is a crown of
        angled teeth. In front of it sits the rotor: a short cylinder with matching teeth at its back and four lugs on its
        side. The lugs ride in channels between four ribs moulded inside the barrel; each rib ends in a V-notch.
        Pressing pushes plunger, rotor and refill forward against the return spring until the lugs clear the ribs; the
        angled teeth turn the rotor a little. Let go: the spring pushes everything back, the lugs land on the ribs' angled
        ends and turn on: they either rest in the notches (refill held out, button low) or slide back down the channels
        (refill drawn in, button high). Each click turns the rotor 45 degrees and swaps the two.
     2. The return spring sits round the refill's tip, between a step inside the front cone and a collar on the refill.
     3. The gel refill: a clear tube, the ink column at the tip end, a clear grease plug (follower) on top that follows the
        ink down as it is used, a metal tip with a 0.5 mm ball. A pen left a week in the pencil case has dried gel at the
        ball: it skips until the ball is rolled wet again.
     Student life: clicking it twelve times in an exam, scribbling circles in the corner to get the ink going, unscrewing
     the front to launch the spring across the desk (and then the pen won't retract), "逢考必过" printed on the barrel.

     Parts:
     CASE    front cone . rubber grip (16 ridges) . chrome joint ring . barrel (print on two sides) . back ring . clip blade .
             clip tip . push button (plunger end)
     MECH    plunger . plunger teeth . rotor . rotor teeth . 4 rotor lugs . 4 barrel ribs (V-notched ends) . return spring .
             spring step (inside the cone)
     REFILL  ball . tip cone . tip holder . collar . clear tube . gel ink column . follower plug
     DESK    its band of the shared 英语默写 sheet (printed prompts, handwritten answers, scribbled circles) */

  /* ---------- on the shared desk: the top band of the 英语默写 (S4) ----------
     Prompts on S4's rules (pv 42, 54, 66), right of its red margin (pu 18); the answers written after them. */
  const BH = ctx.deskZ;
  const S4 = ctx.paper('S4'), ZP = S4.z;
  const QS = [ { pv: 41, q: '1.  你好', a: 'hello' }, { pv: 53, q: '2.  很好的', a: 'nice' }, { pv: 65, q: '3.  狮子', a: 'lion' } ];
  const GEL = '#1d2130';
  const ANS = QS.map((q, i) => S4.deskHand(q.a, 62, q.pv, ZP + .02, 6, 5 + i*9, .7));
  // scribbled loops in the band's top right corner: the ball rolls until the gel flows
  const SCRIB = [Array.from({length: 281}, (_, i) => { const t = i/280, a = t*7*2*Math.PI; return S4.dk(146 + 24*t + 4.4*Math.cos(a), 29 + 4*Math.sin(a), ZP + .02); })];
  const SCRIB_DRY = .55;                                            // share of the scribble before the ink comes

  /* ---------- the pen ---------- */
  const R_BAR = 5.3, R_RING = 5.6, R_GRIPP = 4.9;
  const RS_IN = 2.5, RS_OUT = -2.3, RS_PUSH = -5.5;               // where the ball is: drawn in, held out, pushed to the stop
  const REF_L = 108, ROT_L = 9, PL_L = 15.5;                       // refill, rotor, plunger lengths
  const SPR_FREE = 17, SPR_R = 1.7;
  const REST = { o: S4.dk(20, 88, ZP + R_RING), d: norm(S4.dkv(1, -.03, 0)) };   // lying across the sheet under the dictation
  const HELD = { o: S4.dk(26, 60, ZP + 30), d: norm(S4.dkv(1, -.12, .1)) };
  const WRITE_D = norm(dkv(.62, .5, .6));
  // where the launched spring lands: bare desk beyond S4's far edge (desk u -118, v -84), clear of the fountain pen's
  // copybook further back and of the blank reading sheet to the left
  const SPR_DESK = { c: dk(-8, -104, BH + SPR_R), a: norm(dkv(.8, .6, 0)) };
  const poseLerp = (a, b, k) => ({ o: kLerp(a.o, b.o, k), d: norm(kLerp(a.d, b.d, k)) });
  const lifted = (pose, k, h = 10) => ({ o: kAdd(pose.o, [0, 0, h*Math.sin(Math.PI*k)]), d: pose.d });
  const tipAt = (p, rs) => ({ o: kAt(p, WRITE_D, -rs), d: WRITE_D });     // pose with the ball at p
  const boxAround = (pts, r) => [[0,1,2].map(i => Math.min(...pts.map(p => p[i])) - r), [0,1,2].map(i => Math.max(...pts.map(p => p[i])) + r)];

  // the front section (cone + grip + joint ring) unscrews: turns 2.5 times coming 9 mm off, then is pulled clear and lifted
  function frontOf(st){
    const off = -(9*st.front + 40*st.frontOff), turn = st.front*5*Math.PI, lift = 12*st.frontLift;
    return { off, turn, lift, o: kAdd(kAt(st.pose.o, st.pose.d, off), [0, 0, lift]) };
  }
  // the spring: seated in the pen, sliding off the tip, flying, or lying on the desk -> { o, d, s0, s1 } or null
  function springOf(st){
    const { o, d } = st.pose, fr = frontOf(st);
    if (st.spr === 'pen'){
      const seat = fr.lift > .5 ? -1e9 : 9 + fr.off, s1 = st.rs + 22 - 30*st.sprSlide;
      return { o, d, s0: Math.min(Math.max(seat, s1 - SPR_FREE), s1 - 2), s1 };
    }
    if (st.spr === 'fly'){ const f = st.sprFly; return { o: kAt(f.c, f.a, -SPR_FREE/2), d: f.a, s0: 0, s1: SPR_FREE }; }
    if (st.spr === 'desk') return { o: kAt(SPR_DESK.c, SPR_DESK.a, -SPR_FREE/2), d: SPR_DESK.a, s0: 0, s1: SPR_FREE };
    return null;
  }
  // its coil (9 turns), only between a and b if given (each turn where it is on the whole coil): { far, near } halves
  function springParts(sp, a = -1e9, b = 1e9){
    const [e1, e2] = axisFrame(sp.d), N = 252, far = [], near = [];
    let run = null, side = null;
    for (let i = 0; i <= N; i++){ const s = sp.s0 + (sp.s1 - sp.s0)*i/N; if (s < a - 1e-6 || s > b + 1e-6){ run = null; continue; }
      const t = i/N*9*2*Math.PI, rad = kAdd(kScl(e1, Math.cos(t)), kScl(e2, Math.sin(t))), p = kAdd(kAt(sp.o, sp.d, s), kScl(rad, SPR_R)), nr = vis(rad);
      if (run && nr === side) run.push(p); else { if (run) run.push(p); run = [p]; (nr ? near : far).push(run); side = nr; } }
    const draw = runs => runs.filter(q => q.length > 1).map(q => `<path d="${pd(q, false)}" fill="none" stroke="${INK}" stroke-width="${f(.45*2.4)}" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="${pd(q, false)}" fill="none" stroke="${MAT.steel.l}" stroke-width="${f(.45)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    return { far: draw(far), near: draw(near) };
  }
  // ... as two pieces round the refill (sorted as just round its 1.85 tube): the far half under what it wraps, the near over
  const springSpecs = sp => [{ name: 'sprFar', s0: sp.s0, s1: sp.s1, r: 2, under: true, draw: (a, b) => springParts(sp, a, b).far },
    { name: 'sprNear', s0: sp.s0, s1: sp.s1, r: 2, draw: (a, b) => springParts(sp, a, b).near }];

  // print on two sides of the round barrel
  function barrelPrint(o, d){
    const [e1, e2] = axisFrame(d); let s = '';
    for (const [deg, str, at, size, col] of [[35, '逢考必过', 84, 3.4, '#c8352a'], [215, '0.5 GEL INK', 80, 2.5, INK], [125, '0.5 GEL INK', 80, 2.5, INK]]){
      const a = deg*Math.PI/180, n = kAdd(kScl(e1, Math.cos(a)), kScl(e2, Math.sin(a)));
      if (!vis(n)) continue;
      const v = cross(n, d), p = kAdd(kAdd(kAt(o, d, at), kScl(n, R_BAR + .05)), kScl(v, -size*.35));
      s += txOn(p, d, n, str, size, col, 800);
    }
    return s;
  }
  const grooves = (o, d, s0, s1, r, step) => { let s = ''; for (let x = s0; x < s1; x += step) for (const run of nearArc(kAt(o, d, x), d, r + .03, 30)) s += pd(run, false);
    return s ? `<path d="${s}" fill="none" stroke="${INK}" stroke-width=".5" opacity=".7"/>` : ''; };

  /* ---------- pieces on the pen's axis ---------- */
  // A solid on the axis that can be cut: draw(a, b) is its part between a and b (its bores only at its own ends, `extra`
  // only while it is whole). s0/s1 of g are on the axis of org.
  const cutSeg = (org, d, g, extra = '') => (a, b) => { const s0 = Math.max(g.s0, a), s1 = Math.min(g.s1, b); if (s1 <= s0 + 1e-3) return '';
    const r = s => g.r0 + ((g.r1 ?? g.r0) - g.r0)*(s - g.s0)/(g.s1 - g.s0), at0 = s0 < g.s0 + 1e-6, at1 = s1 > g.s1 - 1e-6;
    return coaxSeg(org, d, { ...g, s0, s1, r0: r(s0), r1: r(s1), hole0: at0 ? g.hole0 : 0, hole1: at1 ? g.hole1 : 0 }) + (at0 && at1 ? extra : ''); };
  const segSpec = (name, g, org, d, extra) => ({ name, s0: g.s0, s1: g.s1, r: Math.max(g.r0, g.r1 ?? g.r0), draw: cutSeg(org, d, g, extra) });
  // Pieces { name, s0, s1, r, draw(a, b) } on one axis in the right order from either end (r: how far out it reaches).
  // Each piece is cut at the ends of every wider piece round it; that piece is drawn over the cuts inside it, or
  // (hide: an opaque case) they are not drawn at all, or (under: a spring's far half) they go over it. Everything
  // else sorts along the axis: no face is ever drawn over something in front of it.
  function nestChain(d, specs){
    const pieces = specs.flatMap(sp => { const c = [...new Set([sp.s0, sp.s1, ...specs.filter(q => q.r > sp.r).flatMap(q => [q.s0, q.s1]).filter(x => x > sp.s0 && x < sp.s1)])].sort((x, y) => x - y);
      return c.slice(1).map((b, i) => ({ sp, name: sp.name + '@' + i, s0: c[i], s1: b, over: [] })); });
    const items = [];
    for (const p of pieces){
      const around = pieces.filter(q => q.sp.r > p.sp.r && q.s0 <= p.s0 + 1e-6 && q.s1 >= p.s1 - 1e-6);
      if (around.some(q => q.sp.hide) || !(p.svg = p.sp.draw(p.s0, p.s1))) continue;
      for (const q of around) if (q.sp.under) p.over.push(q.name); else q.over.push(p.name);
      items.push(p); }
    return coaxOrder(d, items);
  }
  // the refill's front end (s from the pen's tip): ball, tip cone, holder, the tube with its ink (to sEnd), the collar
  function refillSpecs(o, d, rs, ink, sEnd = rs + REF_L){
    return [segSpec('ball', { s0: rs, s1: rs + .6, r0: .3, M: MAT.steel, n: 14, w: .6, shade: toneI }, o, d),
      segSpec('tcone', { s0: rs + .5, s1: rs + 5, r0: .45, r1: 1.0, M: MAT.steel, n: 14, w: .7, shade: toneI }, o, d),
      segSpec('holder', { s0: rs + 5, s1: rs + 10, r0: 1.0, r1: 1.35, M: MAT.brass, n: 14, w: .8, shade: toneI }, o, d),
      { name: 'tube', s0: rs + 10, s1: sEnd, r: 1.85, draw: (a, b) => refillTube(o, d, rs, ink, a - rs, b - rs) },
      segSpec('collar', { s0: rs + 21, s1: rs + 22.5, r0: 2.2, M: MAT.plastic, n: 18, w: .7, shade: toneI }, o, d)];
  }
  // the refill tube, its ink and follower (end to end: sorted for the view), the clear tube over them
  function refillTube(o, d, rs, ink, s0 = 10, s1 = REF_L){
    const a = Math.max(rs + s0, rs + 10), b = rs + s1; if (b <= a) return '';
    const inkEnd = rs + 10 + 80*ink, fol = [inkEnd, inkEnd + 3], col = [];
    if (inkEnd > a){ const g = { s0: a, s1: Math.min(inkEnd, b), r0: 1.5, M: { l:'#3a4058', m: GEL, d:'#0e1018' }, n: 14, w: .5, shade: toneI }; col.push({ s0: g.s0, s1: g.s1, svg: coaxSeg(o, d, g) }); }
    if (fol[1] > a && fol[0] < b){ const g = { s0: Math.max(a, fol[0]), s1: Math.min(b, fol[1]), r0: 1.5, M: matOf('#e9efe6'), n: 14, w: .5, shade: toneI }; col.push({ s0: g.s0, s1: g.s1, svg: coaxSeg(o, d, g) }); }
    return coaxOrder(d, col) + `<g opacity=".5">${coaxSeg(o, d, { s0: a, s1: b, r0: 1.85, M: MAT.clear, n: 18, w: .8, shade: toneI, hole1: 1.5, bore: '#c9dde0' })}</g>`;
  }

  // the closed pen: a row of solids on its axis, the clip beside it; the front section apart while it is unscrewed
  function penBody(st, m){
    const { o, d } = st.pose, [e1, e2] = axisFrame(d), fr = frontOf(st), specs = [], loose = [];
    const seg = (name, g, extra = '') => specs.push({ ...segSpec(name, g, o, d, extra), hide: true });
    // inside: the refill's front end, its collar, the spring; drawn only where they are out of the case (the ball and
    // tip out of the cone; with the front section coming off, whatever it no longer covers)
    specs.push(...refillSpecs(o, d, st.rs, st.ink, 46));
    const sp = springOf(st);
    if (sp && st.spr === 'pen') specs.push(...springSpecs(sp));
    // front section: cone, ridged grip, joint ring; the case round all that while it is on the axis
    const fParts = [['cone', { s0: 0, s1: 13, r0: 1.25, r1: 4.4, M: MAT.plastic, n: 28, w: 1.2, hole0: .95 }, ''],
      ['grip', { s0: 13, s1: 44, r0: R_GRIPP, M: MAT.rubber, n: 16, w: 1.4, edges: .45, phase: fr.turn }, grooves(fr.o, d, 15, 21, R_GRIPP, 2)],
      ['joint', { s0: 44, s1: 46, r0: 5.15, M: MAT.steel, n: 28, w: .9, hole1: st.front > .05 ? 4.6 : 0 }, '']];
    if (fr.lift < 4) for (const [name, g, extra] of fParts){ const sg = segSpec(name, g, fr.o, d, extra);
      specs.push({ ...sg, s0: g.s0 + fr.off, s1: g.s1 + fr.off, hide: true, draw: (a, b) => sg.draw(a - fr.off, b - fr.off) }); }
    else { const pts = [kAt(fr.o, d, 0), kAt(fr.o, d, 46)];
      loose.push({ box: boxAround(pts, 5.2), svg: coaxOrder(d, fParts.map(([name, g, extra]) => ({ name, s0: g.s0, s1: g.s1, svg: coaxSeg(fr.o, d, g) + extra }))) }); }
    // barrel, back ring, button
    seg('barrel', { s0: 46, s1: 118, r0: R_BAR, M: m, n: 30, w: 1.6, hole0: st.front > .05 ? 4.3 : 0 }, barrelPrint(o, d));
    const btnEnd = st.rs + REF_L + ROT_L + PL_L, flush = btnEnd < 128;
    seg('ring', { s0: 118, s1: 127.5, r0: R_RING, M: MAT.plastic, n: 30, w: 1.3, hole1: 3.1, bore: flush ? DARK.l : '#1d1a16' });
    if (!flush) specs.push({ name:'btn', s0: 127.5, s1: btnEnd, r: 3.0, hide: true, draw: () => act('btn', coaxOrder(d, [   // button, its rounded end
      { s0: 127.4, s1: btnEnd - 1, svg: coaxSeg(o, d, { s0: 127.4, s1: btnEnd - 1, r0: 3.0, M: DARK, n: 24, w: 1.1 }) },
      { s0: btnEnd - 1, s1: btnEnd, svg: coaxSeg(o, d, { s0: btnEnd - 1, s1: btnEnd, r0: 3.0, r1: 2.2, M: DARK, n: 24, w: 1.1 }) }])) });
    // clip: blade from the back ring toward the tip, clear of the barrel, a rounded tip touching it
    const bc = kAdd(kAt(o, d, 104), kScl(e2, 6.35));
    const clip = obox(bc, d, e1, e2, 18, 1.7, .45, MAT.plastic, tone, .9)
      + rod(kAdd(kAdd(kAt(o, d, 86.6), kScl(e2, 5.75)), kScl(e1, -1.7)), kAdd(kAdd(kAt(o, d, 86.6), kScl(e2, 5.75)), kScl(e1, 1.7)), .7, MAT.plastic, toneI, .8)
      + obox(kAdd(kAt(o, d, 121), kScl(e2, 6.0)), d, e1, e2, 2.5, 1.7, .6, MAT.plastic, tone, .8);
    const chain = nestChain(d, specs);
    return { svg: vis(e2) ? chain + clip : clip + chain, loose };
  }

  // see-through: refill, spring, rotor and plunger inside the barrel
  function penMech(st){
    const { o, d } = st.pose, [e1, e2] = axisFrame(d), rs = st.rs, fr = frontOf(st);
    const rot0 = rs + REF_L, pl0 = rot0 + ROT_L, th = st.theta*Math.PI/180;
    const radial = a => kAdd(kScl(e1, Math.cos(a)), kScl(e2, Math.sin(a)));
    const RIB = { l:'#c9c3b8', m:'#aaa397', d:'#857e72' }, ROTM = matOf('#f0f0ea'), PLM = DARK;
    let back = '', front = '';
    // barrel ribs (fixed, on the inside wall) and rotor lugs: the ones turned away go behind, the rest in front
    for (let k = 0; k < 4; k++){ const a = k*Math.PI/2, rd = radial(a), c = kAdd(kAt(o, d, 116), kScl(rd, 3.75)), tg = cross(d, rd);
      const rib = obox(c, d, tg, rd, 7, .7, .45, RIB, toneI, .7)
        + `<path d="${pd([kAdd(kAt(o, d, 109), kAdd(kScl(rd, 3.4), kScl(tg, -.7))), kAdd(kAt(o, d, 110.2), kScl(rd, 3.4)), kAdd(kAt(o, d, 109), kAdd(kScl(rd, 3.4), kScl(tg, .7)))], false)}" fill="none" stroke="${INK}" stroke-width=".6"/>`;
      if (vis(rd)) front += rib; else back += rib; }
    const lugs = ['', ''];   // turned away, facing the viewer
    for (let k = 0; k < 4; k++){ const a = th + k*Math.PI/2, rd = radial(a), tg = cross(d, rd), c = kAdd(kAt(o, d, rot0 + 6.3), kScl(rd, 2.95));
      lugs[vis(rd) ? 1 : 0] += obox(c, d, tg, rd, 1.3, .55, .45, ROTM, toneI, .6); }
    // teeth: a zigzag round the plunger/rotor joint, near half only
    const teeth = (s, r, n, ph) => { let out = ''; const pts = [];
      for (let i = 0; i <= n*2; i++){ const a = ph + i/(n*2)*2*Math.PI, rd = radial(a); pts.push([kAdd(kAt(o, d, s + (i % 2 ? .8 : -.8)), kScl(rd, r + .02)), vis(rd)]); }
      let run = []; for (const [p, v] of pts){ if (v) run.push(p); else { if (run.length > 1) out += pd(run, false); run = []; } } if (run.length > 1) out += pd(run, false);
      return out ? `<path d="${out}" fill="none" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>` : ''; };
    const sp = springOf(st), plBody = { s0: pl0, s1: pl0 + 9, r0: 2.5, M: PLM, n: 20, w: .9, shade: toneI };
    // the refill and spring, the step in the cone they press on, rotor (its lugs either side of it) and plunger: in
    // order on the axis, each round piece over just what it wraps
    const specs = [...refillSpecs(o, d, rs, st.ink), ...(sp && st.spr === 'pen' ? springSpecs(sp) : []),
      { name:'rotor', s0: rot0, s1: pl0, r: 2.5, draw: () => lugs[0] + coaxSeg(o, d, { s0: rot0, s1: pl0, r0: 2.5, M: ROTM, n: 20, w: .9, shade: toneI }) + teeth(pl0, 2.5, 6, th) + lugs[1] },
      { name:'plBody', s0: pl0, s1: pl0 + 9, r: 2.5, draw: (a, b) => cutSeg(o, d, plBody)(a, b) + (a < pl0 + 1e-6 ? teeth(pl0 + .02, 2.52, 6, th + Math.PI/6) : '') },
      segSpec('plFlange', { s0: pl0 + 5.5, s1: pl0 + 7, r0: 3.6, M: PLM, n: 20, w: .8, shade: toneI }, o, d),
      segSpec('plStem', { s0: pl0 + 9, s1: pl0 + PL_L - 1, r0: 3.0, M: PLM, n: 20, w: .9, shade: toneI }, o, d)];
    if (fr.lift < 2){ const stp = segSpec('step', { s0: 8, s1: 9, r0: 2.7, M: matOf('#d8d4ca'), n: 22, w: .6, shade: toneI, hole0: 1.25, hole1: 1.25 }, fr.o, d);
      specs.push({ ...stp, s0: 8 + fr.off, s1: 9 + fr.off, draw: (a, b) => stp.draw(a - fr.off, b - fr.off) }); }
    return back + nestChain(d, specs) + front;
  }

  /* ---------- its band of the shared sheet ---------- */
  function dictSheet(st){
    const z = ZP + .02;
    let s = act('sheet', fill(pd(rectUV(18, 22, S4.w - 2, 120).map(([a, b]) => S4.dk(a, b, z))), 'transparent'));
    s += S4.deskText(22, 29, z, 'Unit 3  听写', 4.2, '#2c2a26', 700);
    for (const q of QS) s += S4.deskText(22, q.pv, z, q.q, 4.6, '#2c2a26', 700);
    // handwriting: solid where the gel flowed, broken where the ball was dry
    const solid = [], skip = [];
    for (let i = 0; i < 3; i++) if (st.done[i]) (st.skip[i] ? skip : solid).push(...ANS[i]);
    if (st.ans) (st.ans.skip ? skip : solid).push(...traceStrokes(ANS[st.ans.i], st.ans.dist).done);
    if (st.scrib > 0){ const L = strokesLength(SCRIB), done = traceStrokes(SCRIB, st.scrib*L).done[0] || [];
      const cut = Math.round(SCRIB_DRY*280); skip.push(done.slice(0, cut + 1)); if (done.length > cut) (st.scribWet ? solid : skip).push(done.slice(cut)); }
    s += graphite(solid.filter(q => q.length > 1), GEL, .55, .95);
    const sk = skip.filter(q => q.length > 1);
    if (sk.length) s += `<path d="${sk.map(q => pd(q, false)).join('')}" fill="none" stroke="${GEL}" style="stroke-width:.5;stroke-dasharray:1.4 1.9" stroke-linecap="round" opacity=".55"/>`;
    return s;
  }

  /* ---------- scene ---------- */
  function penPts(st){ const { o, d } = st.pose, fr = frontOf(st), pts = [];
    for (const [s0, r] of [[Math.min(0, st.rs), .4], [46, R_BAR], [127.5, R_RING], [st.rs + REF_L + ROT_L + PL_L, 3]]) pts.push(...axisRing(kAt(o, d, s0), d, r, 8));
    for (const [s0, r] of [[0, 1.3], [13, 4.4], [46, 5.2]]) pts.push(...axisRing(kAt(fr.o, d, s0), d, r, 8));
    pts.push(kAdd(kAt(o, d, 104), kScl(axisFrame(d)[1], 6.8))); return pts; }
  function scene(st, m){
    const k = ease(st.xr || 0);
    let s = dictSheet(st);
    const pp = penPts(st);
    s += castShadow(pp, ZP);
    const sp = springOf(st);
    const pb = penBody(st, m);
    let pen = pb.svg;
    if (k > 0) pen = `<g opacity="${f(1 - .8*k)}">${pen}</g><g opacity="${f(k)}">${penMech(st)}</g>`;
    const parts = [{ box: boxAround(pp, 0), svg: pen }, ...pb.loose];
    if (sp && st.spr !== 'pen'){ const c = springParts(sp), ends = [kAt(sp.o, sp.d, sp.s0), kAt(sp.o, sp.d, sp.s1)];
      if (st.spr === 'desk') s += castShadow([...axisRing(ends[0], sp.d, SPR_R, 8), ...axisRing(ends[1], sp.d, SPR_R, 8)], BH);
      parts.push({ box: boxAround(ends, SPR_R), svg: c.far + c.near }); }
    s += byDepth(parts);
    s += labels(st, k);
    return s;
  }
  function labels(st, k){
    const { o, d } = st.pose, [e1, e2] = axisFrame(d), rs = st.rs, fr = frontOf(st), pp = penPts(st);
    const B = [Math.min(...pp.map(p => p[0])), Math.max(...pp.map(p => p[0])), Math.min(...pp.map(p => p[1])), Math.max(...pp.map(p => p[1])), 0, 12];
    const sp = springOf(st), sprAt = sp ? kAt(sp.o, sp.d, (sp.s0 + sp.s1)/2) : null;
    if (k > .6) return zhCallouts([
      { at: kAt(o, d, rs + REF_L + ROT_L + 12), text: '按杆', on: st.pressing },
      { at: kAdd(kAt(o, d, rs + REF_L + 4), kScl(e2, 2.5)), text: '旋转凸轮', on: st.pressing },
      { at: kAdd(kAt(o, d, 116), kScl(e2, -3.9)), text: '导轨', on: st.pressing },
      { at: kAt(o, d, rs + 60), text: '笔芯', on: !!st.ans },
      { at: kAt(o, d, rs + 10 + 40*st.ink), text: '墨水', on: !!st.ans },
      { at: kAt(o, d, rs + 11.5 + 80*st.ink), text: '跟随剂', on: false },
      ...(sp && st.spr === 'pen' ? [{ at: sprAt, text: '弹簧', on: st.pressing }] : []),
      { at: kAt(o, d, rs + .3), text: '笔珠', on: !!st.ans || st.scribbling } ], B);
    return zhCallouts([
      { at: kAt(o, d, rs + REF_L + ROT_L + PL_L - 1), text: '按头', on: st.pressing },
      { at: kAdd(kAt(o, d, 100), kScl(e2, 6.8)), text: '笔夹', on: false },
      { at: kAdd(kAt(o, d, 70), kScl(e2, R_BAR)), text: '笔杆', on: false },
      { at: kAt(fr.o, d, 30), text: '握胶', on: st.front > 0 },
      { at: kAt(fr.o, d, 6), text: '笔头', on: false },
      ...(rs < 0 ? [{ at: kAt(o, d, rs), text: '笔尖', on: !!st.ans }] : []),
      ...(sp && st.spr !== 'pen' ? [{ at: sprAt, text: '弹簧', on: st.spr === 'fly' }] : []) ], B);
  }

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { click: '咔哒还没按完', frenzy: '还在狂按……', write: '正在写', scrib: '还在画圈', rocket: '正在拆笔' };
  const busy = () => { if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等一下'); return true; };
  const atRest = st => st.pose === REST;
  const backToRest = st => atRest(st) ? null : { ms: 420, start(){ this.from = st.pose; }, step(k){ st.pose = lifted(poseLerp(this.from, REST, ease(k)), k, 8); }, end(){ st.pose = REST; } };
  // one click: plunger, rotor and refill go in to the stop (the rotor turns half a step on the teeth), then the spring
  // brings them back and the rotor turns the other half: refill held out or drawn in. No spring: nothing comes back.
  function clickSegs(st, fast){
    let r0 = 0, t0 = 0, goOut = false;
    return [{ ms: fast ? 45 : 85, start(){ r0 = st.rs; t0 = st.theta; goOut = !st.out; st.pressing = true; },
        step(k){ st.rs = r0 + (RS_PUSH - r0)*ease(k); st.theta = t0 + 22.5*ease(k); }, end(){ st.clicks++; } },
      { ms: fast ? 55 : 130, start(){ r0 = st.rs; t0 = st.theta; },
        step(k){ st.theta = t0 + 22.5*ease(k); if (st.noSpring) return; st.rs = r0 + ((goOut ? RS_OUT : RS_IN) - r0)*ease(k); },
        end(){ st.out = goOut; st.pressing = false; } }];
  }
  function click(st){ if (busy()) return;
    kPlay(ui, 'click', [backToRest(st), ...clickSegs(st, false)], () => {
      if (st.noSpring) ui.flash('弹簧还在桌上——按头按下去就弹不回来了'); }); }
  function frenzy(st){ if (busy()) return;
    const segs = [backToRest(st)]; for (let i = 0; i < 12; i++) segs.push(...clickSegs(st, true));
    kPlay(ui, 'frenzy', segs, () => ui.flash(st.noSpring ? '按了十二下，一下都没弹回来——弹簧还在桌上' : '咔哒咔哒咔哒……后桌：你再按一下试试', 2400)); }
  // out first, if the refill is drawn in (the real missing step)
  const outSegs = st => st.rs > 0 ? clickSegs(st, false) : [];
  function write(st){ if (busy()) return;
    if (st.front > 0) return ui.flash('笔头还拆着');
    if (st.ink <= .02) return ui.flash('笔芯写空了');
    if (st.done.every(Boolean)){ st.done = [false, false, false]; st.skip = [false, false, false]; st.scrib = 0; st.scribWet = false; ui.flash('听写写完了，换一张'); }
    const i = st.done.indexOf(false), sk = ANS[i], len = strokesLength(sk), dry = st.dry > .3;
    if (st.rs > 0) ui.flash('笔尖还缩着，先按出来');
    kPlay(ui, 'write', [backToRest(st), ...outSegs(st),
      { ms: 420, start(){ this.from = st.pose; }, step(k){ st.pose = lifted(poseLerp(this.from, tipAt(sk[0][0], st.rs), ease(k)), k, 14); } },
      { ms: Math.max(600, len/34*1000), start(){ st.ans = { i, dist: 0, skip: dry }; },
        step(k){ st.ans.dist = k*len; st.pose = tipAt(traceStrokes(sk, st.ans.dist).tip, st.rs); },
        end(){ st.done[i] = true; st.skip[i] = dry; st.ans = null; st.ink = Math.max(0, st.ink - .012); } },
      { ms: 420, start(){ this.from = st.pose; }, step(k){ st.pose = lifted(poseLerp(this.from, REST, ease(k)), k, 10); }, end(){ st.pose = REST; } } ],
      () => { if (dry) ui.flash('断水了，写出来一截一截的——在角上画几圈', 2400); });
  }
  // scribble loops in the corner: the ball rolls, the dried gel at it softens, the ink comes
  function scribble(st){ if (busy()) return;
    if (st.front > 0) return ui.flash('笔头还拆着');
    const wasDry = st.dry > .3, L = strokesLength(SCRIB);
    kPlay(ui, 'scrib', [backToRest(st), ...outSegs(st),
      { ms: 420, start(){ this.from = st.pose; }, step(k){ st.pose = lifted(poseLerp(this.from, tipAt(SCRIB[0][0], st.rs), ease(k)), k, 14); } },
      { ms: 2200, start(){ st.scrib = 0; st.scribWet = !wasDry; st.scribbling = true; },
        step(k){ st.scrib = k; if (k > SCRIB_DRY){ st.scribWet = true; st.dry = 0; } st.pose = tipAt(traceStrokes(SCRIB, k*L).tip, st.rs); },
        end(){ st.scribbling = false; st.ink = Math.max(0, st.ink - .01); } },
      { ms: 420, start(){ this.from = st.pose; }, step(k){ st.pose = lifted(poseLerp(this.from, REST, ease(k)), k, 10); }, end(){ st.pose = REST; } } ],
      () => ui.flash(wasDry ? '画到第四圈，出水了！' : '本来就出水……纸角又多了一团圈圈', 2200));
  }
  // unscrew the front, launch the spring off the refill across the desk; screw the front back on without it
  const hold = st => [backToRest(st), { ms: 380, start(){ this.from = st.pose; }, step(k){ st.pose = poseLerp(this.from, HELD, ease(k)); }, end(){ st.pose = HELD; } }];
  const unscrew = st => [{ ms: 700, step(k){ st.front = ease(k); } }, { ms: 320, step(k){ st.frontOff = ease(k); } }, { ms: 260, step(k){ st.frontLift = ease(k); } }];
  const screwOn = st => [{ ms: 260, step(k){ st.frontLift = 1 - ease(k); } }, { ms: 320, step(k){ st.frontOff = 1 - ease(k); } }, { ms: 650, step(k){ st.front = 1 - ease(k); } }];
  const putDown = st => ({ ms: 420, start(){ this.from = st.pose; }, step(k){ st.pose = poseLerp(this.from, REST, ease(k)); }, end(){ st.pose = REST; } });
  function launch(st){ if (busy()) return;
    if (st.spr !== 'pen') return ui.flash('弹簧已经在桌上了');
    let p0 = null, a0 = null;
    kPlay(ui, 'rocket', [...hold(st), ...unscrew(st),
      { ms: 300, step(k){ st.sprSlide = ease(k); } },
      { ms: 820, start(){ const sp = springOf(st); p0 = kAt(sp.o, sp.d, (sp.s0 + sp.s1)/2); a0 = sp.d; st.spr = 'fly'; st.sprFly = { c: p0, a: a0 }; },
        step(k){ const c = kLerp(p0, SPR_DESK.c, k); c[2] += 48*Math.sin(Math.PI*k)*(1 - .25*k); const sp = k*3.2*Math.PI;
          st.sprFly = { c, a: norm(kLerp(kAdd(kScl(a0, Math.cos(sp)), [0, 0, Math.sin(sp)]), SPR_DESK.a, k*k)) }; },
        end(){ st.spr = 'desk'; st.sprSlide = 0; st.noSpring = true; ui.flash('弹簧火箭发射！嗖——越过默写纸落在了前面', 1800); } },
      ...screwOn(st), putDown(st)],
      () => ui.flash('笔装回去了……弹簧还在桌上', 2000));
  }
  function pickUp(st){ if (busy()) return;
    if (st.spr === 'pen') return ui.flash('弹簧还在笔里');
    let p1 = null;
    kPlay(ui, 'rocket', [...hold(st), ...unscrew(st),
      { ms: 700, start(){ st.sprSlide = 1; st.spr = 'pen'; const sp = springOf(st); p1 = { c: kAt(sp.o, sp.d, (sp.s0 + sp.s1)/2), a: sp.d }; st.spr = 'fly'; st.sprFly = { c: SPR_DESK.c, a: SPR_DESK.a }; },
        step(k){ const c = kLerp(SPR_DESK.c, p1.c, ease(k)); c[2] += 22*Math.sin(Math.PI*k); st.sprFly = { c, a: norm(kLerp(SPR_DESK.a, p1.a, ease(k))) }; },
        end(){ st.spr = 'pen'; } },
      { ms: 300, step(k){ st.sprSlide = 1 - ease(k); } },
      ...screwOn(st),
      { ms: 160, start(){ this.r0 = st.rs; st.noSpring = false; }, step(k){ st.rs = this.r0 + ((st.out ? RS_OUT : RS_IN) - this.r0)*ease(k); } },
      putDown(st)],
      () => ui.flash('弹簧装回去了，又能按了'));
  }

  const __cfg = ({
    fig:'02', turn:'full', title:'按动中性笔', palette:'mint',
    state:{ pose: REST, rs: RS_IN, out: false, theta: 45, clicks: 0, ink: .86, dry: 1, pressing: false,
      done: [false, false, false], skip: [false, false, false], ans: null, scrib: 0, scribWet: false, scribbling: false,
      front: 0, frontOff: 0, frontLift: 0, spr: 'pen', sprSlide: 0, sprFly: null, noSpring: false },
    scene,
    stats: st => [ { label:'咔哒', value: String(st.clicks) }, { label:'墨水', value: Math.round(st.ink*100) + '%', small: true } ],
    buttons:[
      { label:'按一下', onClick: click },
      { label:'写听写', onClick: write },
      { label:'考试狂按', onClick: frenzy },
      { label:'画圈出水', onClick: scribble },
      { label:'弹簧火箭', choices: st => [
        { label:'拆开发射', onClick: launch, disabled: st.spr !== 'pen', why:'弹簧已经在桌上了' },
        { label:'捡回来装好', onClick: pickUp, disabled: st.spr === 'pen', why:'弹簧还在笔里' } ] },
    ],
    acts:{ btn: st => click(st), sheet: st => write(st) },
    params:(st, q) => {
      if (q.get('out') === '1'){ st.out = true; st.rs = RS_OUT; st.theta = 0; }
      if (q.has('rs')) st.rs = +q.get('rs');
      if (q.has('dry')) st.dry = +q.get('dry');
      if (q.has('ink')) st.ink = +q.get('ink');
      if (q.has('ans')) for (let i = 0; i < Math.min(3, +q.get('ans')); i++) st.done[i] = true;
      if (q.has('scrib')){ st.scrib = +q.get('scrib'); st.scribWet = st.scrib > SCRIB_DRY; }
      if (q.get('pose') === 'write'){ st.out = true; st.rs = RS_OUT; st.pose = tipAt(ANS[1][0][0], RS_OUT); }
      if (q.get('pose') === 'held') st.pose = HELD;
      if (q.has('front')){ st.pose = HELD; st.front = Math.min(1, +q.get('front')); st.frontOff = Math.max(0, Math.min(1, +q.get('front') - 1)); st.frontLift = Math.max(0, Math.min(1, +q.get('front') - 2)); }
      if (q.has('slide')) st.sprSlide = +q.get('slide');
      if (q.get('spring') === 'desk'){ st.spr = 'desk'; st.noSpring = true; }
    },
  });

  return ctx.adapt(__cfg, { seeThrough: true });
}
