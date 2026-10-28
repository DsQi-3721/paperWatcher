// Fig. 01 自动铅笔 — desk-scene object, ported from stationery/src/01-mechanical-pencil.html by scripts/port-figures.mjs.
// The figure's own code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*),
// ctx.ui its ui (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are
// collected by the scene.
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: -520, v: 32, rot: 0 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 01 — Mechanical pencil (0.5 mm clutch pencil, P205 style), lying on a quiz sheet on a desk.
     The desk is turned toward the viewer (kit deskSetup): u along its front edge, v toward the viewer; 1 unit = 1 mm.
     The pencil is drawn on its own axis:
     s = mm from the tip of the lead sleeve toward the push cap.

     How it really works (each button is one of these):
     1. Click: the push cap pushes the eraser ferrule, the lead tube and the 3-jaw brass chuck forward against the main
        spring. The brass clutch ring round the jaws rides along and keeps them shut on the lead, so the lead goes forward
        too, until the ring meets its stop inside the front body (0.5 mm). The chuck goes on, out of the ring: its jaws
        spring open. Let go: the spring pushes everything back; the rubber retainer in the tip holds the lead, the open
        jaws slide back along it and the ring closes them again. The lead is now 0.5 mm further out.
     2. Writing wears the lead (~0.15 mm an answer here). Much more than ~2.5 mm out and it snaps at the sleeve.
     3. When the lead in the chuck gets too short to reach the jaws, the next click lets the next lead in the tube push
        the stub out; it takes a few clicks before the new lead shows.
     4. Refill: pull off the cap, pull the eraser out of its ferrule, slide leads from the lead case into the tube,
        put the eraser and cap back.
     Student life: clicking it ten times in an exam, the snapped lead flying at the next desk, spinning it round the thumb
     (and dropping it), "GOOD GOOD STUDY, DAY DAY UP" printed on the barrel.

     Parts:
     CASE    lead sleeve . front cone . cone ring . rubber grip (grooves) . hex barrel (print on three faces) . clip band .
             clip blade . clip tip . push cap . cap dome
     MECH    lead retainer (rubber, in the cone) . ring stop (shoulder in the front body) . chuck head (3 jaws) . chuck
             shaft . clutch ring . lead tube (clear) . tube collar . main spring . spring seat
     REFILL  eraser ferrule . eraser . cleaning pin . lead in the chuck . spare leads in the tube
     DESK    desk board . quiz sheet (printed questions, handwritten answers) . lead case (dark tray, clear lid, leads,
             sticker) . snapped lead bits */

  /* ---------- on the shared desk: the top band of the 数学试卷 (S1), the lead case beyond it ----------
     Desk terms (u right along the front edge, v toward the student) are this object's own frame (ctx.desk);
     writing goes on the shared paper through its own frame (pu across the page, pv down it). */
  const BH = ctx.deskZ;
  const S1 = ctx.paper('S1'), ZP = S1.z;
  const QS = [ { pv: 30, q: '1.  x + 3 = 5', a: 'x=2' }, { pv: 43, q: '2.  2y = 14', a: 'y=7' }, { pv: 56, q: '3.  6 × 6 =', a: '36' } ];
  const ANS = QS.map((q, i) => S1.deskHand(q.a, 102, q.pv, ZP + .02, 6.5, 11 + i*7));
  const CASE = [-40, -92, 26, -79], CASE_ZM = BH + 2.4, CASE_ZT = BH + 6, LEAD_L = 60;   // lead case beyond the far edge of S1: u0, v0, u1, v1
  const caseLead = (j, n = 12) => { const v = CASE[1] + 1.8 + j*(CASE[3] - CASE[1] - 3.6)/(n - 1); return [dk(CASE[0] + 3, v, CASE_ZM + .3), dk(CASE[0] + 3 + LEAD_L, v, CASE_ZM + .3)]; };

  /* ---------- the pencil ---------- */
  const R_LEAD = .26, R_GRIP = 4.3, R_HEX = 4.7, R_CAP = 3.7;
  const CLICK = 2.5, ADV = .5;                                   // cap travel per click, lead advance per click
  const HEX_IN = R_HEX*Math.cos(Math.PI/6);
  const REST = { o: S1.dk(22, 70, ZP + R_GRIP), d: norm(S1.dkv(1, -.04, 0)) };      // lying under question 3
  const FALLEN = { o: dk(-44, 46, ZP + R_GRIP), d: norm(dkv(.906, -.423, 0)) };
  const WRITE_D = norm(dkv(.62, .5, .6));                      // held the way a right-handed writer at the front holds it
  const REFILL = { o: dk(-62, -6, ZP + 6), d: norm(dkv(.8, .35, .45)) };
  const poseLerp = (a, b, k) => ({ o: kLerp(a.o, b.o, k), d: norm(kLerp(a.d, b.d, k)) });
  const lifted = (pose, k, h = 10) => ({ o: kAdd(pose.o, [0, 0, h*Math.sin(Math.PI*k)]), d: pose.d });
  const tipAt = (p, ext) => ({ o: kAt(p, WRITE_D, ext), d: WRITE_D });    // pose with the lead's tip at p

  // the mechanism's positions for the current press (0..1) and refill steps
  function mechOf(st){
    const tube = -CLICK*st.press, ring = -Math.min(CLICK*st.press, ADV);
    const jaw = Math.max(0, Math.min(1, (CLICK*st.press - ADV)/(CLICK - ADV)));
    return { tube, ring, jaw, cap: tube + 16*st.rc1, capLift: 12*st.rc2, er: tube + 10*st.re1, erLift: 7*st.re2 };
  }
  // print on three faces of the hex barrel (face centres at 30, 150, 330 degrees from e1)
  function barrelPrint(o, d){
    const [e1, e2] = axisFrame(d); let s = '';
    for (const [deg, str, at] of [[30, '0.5  HB', 82], [330, 'GOOD GOOD STUDY', 84], [150, 'DAY DAY UP', 84]]){
      const a = deg*Math.PI/180, n = kAdd(kScl(e1, Math.cos(a)), kScl(e2, Math.sin(a)));
      if (!vis(n)) continue;
      const v = cross(n, d), p = kAdd(kAdd(kAt(o, d, at), kScl(n, HEX_IN + .04)), kScl(v, -.85));
      s += txOn(p, d, n, str, 2.3, deg === 30 ? INK : '#ffffff', 800);
    }
    return s;
  }
  const grooves = (o, d) => { let s = ''; for (let x = 19.5; x < 41; x += 2.4) for (const run of nearArc(kAt(o, d, x), d, R_GRIP + .03, 30)) s += pd(run, false);
    return s ? `<path d="${s}" fill="none" stroke="${INK}" stroke-width=".55" opacity=".8"/>` : ''; };

  // the closed pencil: a row of solids on its axis, the clip beside it, cap and eraser apart while refilling
  function pencilBody(st, m){
    const { o, d } = st.pose, mc = mechOf(st), [e1, e2] = axisFrame(d), items = [];
    const seg = (name, g, extra = '') => items.push({ name, s0: g.s0, s1: g.s1, svg: coaxSeg(o, d, g) + extra });
    if (st.ext > .02) seg('lead', { s0: -st.ext, s1: 0, r0: R_LEAD, M: MAT.graphite, n: 10, w: .8, shade: toneI });
    seg('sleeve', { s0: 0, s1: 4, r0: .6, M: MAT.steel, n: 14, w: .9, hole0: .32, shade: toneI });
    seg('cone', { s0: 4, s1: 15, r0: 1.25, r1: 3.9, M: MAT.steel, n: 28, w: 1.2 });
    seg('cring', { s0: 15, s1: 16.5, r0: 4.0, M: MAT.steel, n: 28, w: 1 });
    seg('grip', { s0: 16.5, s1: 42, r0: R_GRIP, M: MAT.rubber, n: 28, w: 1.4 }, grooves(o, d));
    const capOff = mc.cap > .01 || st.rc2 > 0;                       // the back of the tube shows while the cap is away
    // the hex barrel in two lengths either side of the clip band, so the band's faces sort with it from either end
    seg('barrel', { s0: 42, s1: 112, r0: R_HEX, M: m, n: 6, w: 1.6, edges: .6 }, barrelPrint(o, d));
    seg('band', { s0: 112, s1: 120, r0: 5.0, M: MAT.steel, n: 28, w: 1 });
    seg('barrelEnd', { s0: 120, s1: 127, r0: R_HEX, M: m, n: 6, w: 1.6, edges: .6, hole1: 3.85 });
    // the cap slides along the axis over the tube's end, ferrule and eraser: only what is out of it is drawn (cut at its
    // mouth), so it never needs to be drawn over them; nothing is drawn inside the barrel either
    const oc = kAdd(o, [0, 0, mc.capLift]), cs0 = Math.max(127, 127 + mc.cap), cs1 = 139 + mc.cap, mouth = mc.capLift < 5 ? cs0 : 1e9;
    const cut = (name, g, org = o) => { const s1 = Math.min(g.s1, mouth); if (s1 > g.s0 + .01) items.push({ name, s0: g.s0, s1, svg: coaxSeg(org, d, { ...g, s1, hole1: s1 < g.s1 ? 0 : g.hole1 }) }); };
    if (capOff){
      cut('tubeEnd', { s0: 127, s1: 129 + mc.tube, r0: 1.55, M: MAT.plastic, n: 16, w: .8, shade: toneI });
      cut('ferrule', { s0: 129 + mc.tube, s1: 132 + mc.tube, r0: 2.5, M: MAT.steel, n: 20, w: .9, shade: toneI, hole1: 2.15 });
    }
    const loose = [];                                                  // cap / eraser lifted off the axis
    // the eraser: from where it comes out of the ferrule (on the axis) to its end
    const erG = (from = 131 + mc.er) => ({ s0: from, s1: 138 + mc.er, r0: 2.2, M: MAT.eraser, n: 20, w: 1, shade: toneI });
    if (capOff && st.re1 > 0 || st.re2 > 0){
      const oe = kAdd(o, [0, 0, mc.erLift]);
      if (mc.erLift < 5) cut('eraser', erG(Math.max(131 + mc.er, 132 + mc.tube)), oe);
      else loose.push({ box: boxAround([kAt(oe, d, 131 + mc.er), kAt(oe, d, 138 + mc.er)], 2.3), svg: coaxSeg(oe, d, erG()) });
    } else if (capOff) cut('eraser', erG(Math.max(131 + mc.er, 132 + mc.tube)));
    const cap = act('cap', coaxOrder(d, [{ s0: cs0, s1: cs1, svg: coaxSeg(oc, d, { s0: cs0, s1: cs1, r0: R_CAP, M: MAT.steel, n: 28, w: 1.2, hole0: capOff ? 3.25 : 0 }) },
      { s0: cs1, s1: cs1 + 1.6, svg: coaxSeg(oc, d, { s0: cs1, s1: cs1 + 1.6, r0: R_CAP, r1: 2.5, M: MAT.steel, n: 28, w: 1.2 }) }]));   // tube, dome: sorted for the view
    if (mc.capLift < 5) items.push({ name:'cap', s0: cs0, s1: cs1 + 1.6, svg: cap });
    else loose.push({ box: boxAround([kAt(oc, d, cs0), kAt(oc, d, cs1 + 1.6)], R_CAP), svg: cap });
    // clip: blade on the band, running toward the tip just clear of the barrel, a rounded tip touching it
    const bc = kAdd(kAt(o, d, 105.5), kScl(e2, 5.55));
    const clip = obox(bc, d, e1, e2, 12.8, 1.5, .3, MAT.steel, tone, .9)
      + rod(kAdd(kAdd(kAt(o, d, 93.4), kScl(e2, 5.15)), kScl(e1, -1.5)), kAdd(kAdd(kAt(o, d, 93.4), kScl(e2, 5.15)), kScl(e1, 1.5)), .55, MAT.steel, toneI, .8)
      + obox(kAdd(kAt(o, d, 118.5), kScl(e2, 5.3)), d, e1, e2, 1.6, 1.5, .45, MAT.steel, tone, .8);
    const chain = coaxOrder(d, items);
    return { svg: vis(e2) ? chain + clip : clip + chain, loose };
  }
  const boxAround = (pts, r) => [[0,1,2].map(i => Math.min(...pts.map(p => p[i])) - r), [0,1,2].map(i => Math.max(...pts.map(p => p[i])) + r)];

  /* ---------- pieces on the pencil's axis (the see-through) ---------- */
  // A solid on the axis that can be cut: draw(a, b) is its part between a and b (its bores only at its own ends); op:
  // drawn see-through. s0/s1 of g are on the axis of org.
  const cutSeg = (org, d, g, op) => (a, b) => { const s0 = Math.max(g.s0, a), s1 = Math.min(g.s1, b); if (s1 <= s0 + 1e-3) return '';
    const r = s => g.r0 + ((g.r1 ?? g.r0) - g.r0)*(s - g.s0)/(g.s1 - g.s0), at0 = s0 < g.s0 + 1e-6, at1 = s1 > g.s1 - 1e-6;
    const s = coaxSeg(org, d, { ...g, s0, s1, r0: r(s0), r1: r(s1), hole0: at0 ? g.hole0 : 0, hole1: at1 ? g.hole1 : 0 });
    return op ? `<g opacity="${op}">${s}</g>` : s; };
  const segSpec = (name, g, org, d, op) => ({ name, s0: g.s0, s1: g.s1, r: Math.max(g.r0, g.r1 ?? g.r0), draw: cutSeg(org, d, g, op) });
  // Pieces { name, s0, s1, r, draw(a, b) } on one axis in the right order from either end (r: how far out it reaches).
  // Each piece is cut at the ends of every wider piece round it, and that piece is drawn over the cuts inside it (or,
  // under: a spring's far half, they go over it). Everything else sorts along the axis: no face is ever drawn over
  // something in front of it.
  function nestChain(d, specs){
    const pieces = specs.flatMap(sp => { const c = [...new Set([sp.s0, sp.s1, ...specs.filter(q => q.r > sp.r).flatMap(q => [q.s0, q.s1]).filter(x => x > sp.s0 && x < sp.s1)])].sort((x, y) => x - y);
      return c.slice(1).map((b, i) => ({ sp, name: sp.name + '@' + i, s0: c[i], s1: b, over: [] })); });
    const items = [];
    for (const p of pieces){
      if (!(p.svg = p.sp.draw(p.s0, p.s1))) continue;
      for (const q of pieces) if (q.sp.r > p.sp.r && q.s0 <= p.s0 + 1e-6 && q.s1 >= p.s1 - 1e-6){ if (q.sp.under) p.over.push(q.name); else q.over.push(p.name); }
      items.push(p); }
    return coaxOrder(d, items);
  }

  // see-through: the working parts inside, each round part drawn over just what it wraps
  function pencilMech(st){
    const { o, d } = st.pose, mc = mechOf(st), t = mc.tube, [e1, e2] = axisFrame(d), oe = kAdd(o, [0, 0, mc.erLift]);
    const BRASS2 = matOf('#f0cf7a'), GREY = matOf('#a9a69f'), WHITE = MAT.plastic;
    const sprg = coilParts(o, d, 36, 48 + t, 2.3, 8, MAT.steel.l, .45), lead = (s0, w = .6) => ({ s0, s1: s0 + LEAD_L, r0: R_LEAD, M: MAT.graphite, n: 8, w, shade: toneI });
    const specs = [];
    // the lead in the chuck, spare leads lying in the tube (beside the axis: sorted as on it), leads being slid in, the
    // cleaning pin in the eraser
    if (st.lead > 0) specs.push(segSpec('lead', { ...lead(-st.ext), s1: -st.ext + st.lead }, o, d));
    for (let j = 0; j < st.spares; j++){ const a = .6 + j*2.3, off = kAdd(kScl(e1, .72*Math.cos(a)), kScl(e2, .72*Math.sin(a)));
      specs.push(segSpec('spare' + j, lead(Math.min(131 + t - LEAD_L - .5, 64 + 2.5*j + t), .5), kAdd(o, off), d)); }
    if (st.feed > 0) for (let j = 0; j < st.feedN; j++){ const fl = feedLead(st, j); if (fl && fl.slide) specs.push(segSpec('feed' + j, lead(fl.s0), o, d)); }
    specs.push(segSpec('pin', { s0: 132.5 + mc.er, s1: 137.6 + mc.er, r0: .32, M: MAT.steel, n: 10, w: .5, shade: toneI }, oe, d),
      // the parts the others ride in or on
      segSpec('ret', { s0: 4.6, s1: 8.4, r0: 1.05, M: MAT.rubber, n: 18, w: .8, shade: toneI, hole0: .3, hole1: .3 }, o, d),
      { name:'chuckH', s0: 19 + t, s1: 24 + t, r: 1.45 + .45*mc.jaw, draw: (a, b) => chuckHead(o, d, 19 + t, mc.jaw, a, b) },
      segSpec('chuckS', { s0: 24 + t, s1: 31 + t, r0: 1.15, M: MAT.brass, n: 18, w: .8, shade: toneI }, o, d),
      segSpec('tube', { s0: 31 + t, s1: 131 + t, r0: 1.55, M: MAT.clear, n: 20, w: .8, shade: toneI, hole1: 1.2, bore: '#9fb9bf' }, o, d, .55),
      segSpec('ferrule', { s0: 129 + t, s1: 132 + t, r0: 2.5, M: MAT.steel, n: 20, w: .8, shade: toneI, hole1: 2.15 }, o, d),
      segSpec('eraser', { s0: 131 + mc.er, s1: 138 + mc.er, r0: 2.2, M: MAT.eraser, n: 20, w: .8, shade: toneI }, oe, d, .6),
      // what wraps round them: the ring stop, the ring on the jaws, the spring's seat and collar, the spring
      segSpec('stop', { s0: 17.5, s1: 18.5, r0: 3.4, M: GREY, n: 24, w: .8, shade: toneI, hole0: 2.0, hole1: 2.0, bore: '#6d6a64' }, o, d),
      segSpec('ring', { s0: 19 + mc.ring, s1: 22.5 + mc.ring, r0: 2.3, M: BRASS2, n: 22, w: .9, shade: toneI, hole0: 1.55, hole1: 1.55, bore: MAT.brass.d }, o, d),
      segSpec('seat', { s0: 33, s1: 36, r0: 3.6, M: GREY, n: 24, w: .8, shade: toneI, hole0: 1.6, hole1: 1.6, bore: '#6d6a64' }, o, d),
      segSpec('collar', { s0: 48 + t, s1: 50 + t, r0: 2.7, M: WHITE, n: 22, w: .8, shade: toneI, hole0: 1.55, hole1: 1.55, bore: '#9fb9bf' }, o, d),
      { name:'sprFar', s0: 36, s1: 48 + t, r: 2.3, under: true, draw: () => sprg.far }, { name:'sprNear', s0: 36, s1: 48 + t, r: 2.3, draw: () => sprg.near });
    return nestChain(d, specs);
  }
  // the chuck's head: three jaws, a taper that the ring squeezes; open, the jaws spread and their slits widen (its part
  // between a and b)
  function chuckHead(o, d, s0, jaw, a = -1e9, b = 1e9){
    const r0 = 1.45 + .45*jaw, lo = Math.max(s0, a), hi = Math.min(s0 + 5, b); if (hi <= lo + 1e-3) return '';
    const r = x => r0 + (1.15 - r0)*(x - s0)/5;
    let s = coaxSeg(o, d, { s0: lo, s1: hi, r0: r(lo), r1: r(hi), M: MAT.brass, n: 21, w: .9, shade: toneI });
    const [e1, e2] = axisFrame(d), k0 = Math.max(0, (lo - s0)/3.6), k1 = Math.min(1, (hi - s0)/3.6);
    if (k1 > k0) for (let j = 0; j < 3; j++){ const ang = Math.PI/2 + j*2*Math.PI/3, rad = kAdd(kScl(e1, Math.cos(ang)), kScl(e2, Math.sin(ang)));
      if (!vis(rad)) continue;
      const A = kAdd(kAt(o, d, s0 - .02), kScl(rad, r0 + .02)), B = kAdd(kAt(o, d, s0 + 3.6), kScl(rad, 1.25));
      s += `<path d="${pd([kLerp(A, B, k0), kLerp(A, B, k1)], false)}" fill="none" stroke="${INK}" stroke-width="${f(.7 + 1.1*jaw)}" stroke-linecap="round"/>`; }
    return s;
  }

  /* ---------- leads moving from the case into the tube (refill) ---------- */
  // lead j: k 0..1 = case -> lined up behind the tube's open end (lifted over the desk) -> slid down into the tube
  function feedLead(st, j){
    const k = Math.max(0, Math.min(1, st.feed*1.25 - j*.25)); if (k <= 0 || k >= 1) return null;
    const { o, d } = st.pose, [a0, b0] = caseLead(st.caseN - 1 - j);
    if (k < .5){ const u = ease(k/.5), a1 = kAt(o, d, 131), b1 = kAt(o, d, 131 + LEAD_L);
      const up = [0, 0, 30*Math.sin(Math.PI*u)];
      return { a: kAdd(kLerp(a0, a1, u), up), b: kAdd(kLerp(b0, b1, u), up), slide: false }; }
    const u = ease((k - .5)/.5), s0 = 131 - LEAD_L*u;
    return { a: kAt(o, d, s0), b: kAt(o, d, s0 + LEAD_L), s0, slide: true };
  }
  // as seen from outside: only the part still out of the tube (the see-through has the sliding ones whole)
  function feedLeads(st){
    if (!(st.feed > 0)) return ''; const { o, d } = st.pose; let s = '';
    for (let j = 0; j < st.feedN; j++){ const fl = feedLead(st, j); if (!fl) continue;
      if (fl.slide){ const a = Math.max(fl.s0, 131.5); if (a < fl.s0 + LEAD_L - .2) s += coaxSeg(o, d, { s0: a, s1: fl.s0 + LEAD_L, r0: R_LEAD, M: MAT.graphite, n: 8, w: .6, shade: toneI }); }
      else s += rod(fl.a, fl.b, R_LEAD, MAT.graphite, toneI, .6, R_LEAD, 8); }
    return s;
  }

  function leadCase(st){
    const [u0, v0, u1, v1] = CASE;
    let s = deskBox(u0, v0, BH, u1, v1, CASE_ZM, DARK, toneI, 1.1);
    for (let j = 0; j < st.caseN - (st.feed > 0 ? st.feedN : 0); j++){ const [a, b] = caseLead(j); s += rod(a, b, R_LEAD, MAT.graphite, toneI, .5, R_LEAD, 8); }
    s += `<g opacity=".42">${deskBox(u0, v0, CASE_ZM, u1, v1, CASE_ZT, MAT.clear, toneI, .8)}</g>`;
    const top = rectUV(u1 - 24, v0 + 2.5, u1 - 4, v1 - 2.5).map(([u, v]) => dk(u, v, CASE_ZT + .02));
    s += shape(top, '#fff4d6', .6) + deskText(u1 - 14, (v0 + v1)/2 + 1.4, CASE_ZT + .03, '0.5 HB', 3.6, INK, 800, 'middle');
    s += `<path d="${pd([dk(u0 + 5, v1 - 2, CASE_ZT + .03), dk(u0 + 20, v0 + 2.5, CASE_ZT + .03)], false)}" stroke="#ffffff" stroke-width="1.6" opacity=".55" stroke-linecap="round"/>`;
    return s + hullInk(deskBoxPts(u0, v0, BH, u1, v1, CASE_ZT), 1.6);
  }

  /* ---------- the quiz sheet ---------- */
  // its band of the shared 数学试卷: three printed questions and the answers written so far
  function quizSheet(st){
    const z = ZP + .02;
    let s = '';
    const band = rectUV(4, 22, S1.w - 4, 64).map(([a, b]) => S1.dk(a, b, z));
    s += act('sheet', fill(pd(band), 'transparent'));
    for (const q of QS) s += S1.deskText(10, q.pv, z, q.q, 4.6, '#2c2a26', 700);
    const lines = [];
    for (let i = 0; i < 3; i++) if (st.done[i]) lines.push(...ANS[i]);
    if (st.ans) lines.push(...traceStrokes(ANS[st.ans.i], st.ans.dist).done);
    s += graphite(lines, GRAPHITE, .62, .92);
    return s;
  }
  const bitSvg = b => { const a = dk(b.u, b.v, ZP + R_LEAD), e = dk(b.u + b.len*Math.cos(b.a), b.v + b.len*Math.sin(b.a), ZP + R_LEAD);
    return rod(a, e, R_LEAD, MAT.graphite, toneI, .55, R_LEAD, 8); };

  /* ---------- scene ---------- */
  function pencilPts(st){ const { o, d } = st.pose, pts = [];
    for (const [s0, r] of [[-Math.max(0, st.ext), .3], [4, .7], [16, 4.1], [42, R_HEX], [126, R_HEX], [141, 2.6]]) pts.push(...axisRing(kAt(o, d, s0), d, r, 8));
    pts.push(kAdd(kAt(o, d, 112), kScl(axisFrame(d)[1], 6))); return pts; }
  function scene(st, m){
    const k = ease(st.xr || 0);
    let s = quizSheet(st);
    const casePts = deskBoxPts(CASE[0], CASE[1], BH, CASE[2], CASE[3], CASE_ZT);
    s += castShadow(casePts, BH);
    s += castShadow(pencilPts(st), ZP);
    for (const b of st.bits) s += bitSvg(b);
    // the pencil, the case and anything lifted off the pencil, sorted for the view
    const pb = pencilBody(st, m);
    let pen = pb.svg;
    if (k > 0) pen = `<g opacity="${f(1 - .8*k)}">${pen}</g><g opacity="${f(k)}">${pencilMech(st)}</g>`;
    const feed = feedLeads(st), tow = vis(st.pose.d);
    pen = (tow ? pen + feed : feed + pen);
    const pp = pencilPts(st);
    s += byDepth([
      { box: boxAround(casePts, 0), svg: leadCase(st) },
      { box: boxAround(pp, 0), svg: pen },
      ...pb.loose ]);
    if (st.fly){ const fl = st.fly, dir = norm(dkv(Math.cos(fl.a), Math.sin(fl.a), .45*Math.sin(2*fl.a)));
      s += rod(kAt(fl.p, dir, -fl.len/2), kAt(fl.p, dir, fl.len/2), R_LEAD, MAT.graphite, toneI, .6, R_LEAD, 8); }
    s += labels(st, k);
    return s;
  }
  function labels(st, k){
    const { o, d } = st.pose, [e1, e2] = axisFrame(d), mc = mechOf(st), up = s0 => kAdd(kAt(o, d, s0), kScl(e2, R_HEX));
    const pp = pencilPts(st), B = [Math.min(...pp.map(p => p[0])), Math.max(...pp.map(p => p[0])), Math.min(...pp.map(p => p[1])), Math.max(...pp.map(p => p[1])), 0, 12];
    if (k > .6) return zhCallouts([
      { at: kAt(o, d, 6.5), text: '止退胶', on: st.press > 0 },
      { at: kAt(o, d, 20.5 + mc.ring), text: '夹圈', on: st.press > 0 },
      { at: kAt(o, d, 26 + mc.tube), text: '三爪夹头', on: mc.jaw > 0 },
      { at: kAt(o, d, 34.5), text: '弹簧座', on: false },
      { at: kAt(o, d, 42 + mc.tube/2), text: '弹簧', on: st.press > 0 },
      { at: kAt(o, d, 49 + mc.tube), text: '挡圈', on: false },
      { at: kAt(o, d, 100 + mc.tube), text: '储芯管', on: st.feed > 0 },
      { at: kAt(o, d, 134.5 + mc.er), text: '橡皮', on: st.re1 > 0 },
      ...(st.spares ? [{ at: kAdd(kAt(o, d, 112), kScl(e2, .7)), text: '备用芯', on: st.feed > 0 }] : []),
      ...(st.ext > .05 ? [{ at: kAt(o, d, -st.ext), text: '笔芯', on: !!st.ans }] : []) ], B);
    return zhCallouts([
      { at: kAdd(kAt(o, d, 133 + mc.cap), [0, 0, mc.capLift + R_CAP*.7]), text: '按帽', on: st.press > 0 },
      { at: kAdd(kAt(o, d, 104), kScl(e2, 5.9)), text: '笔夹', on: false },
      { at: up(66), text: '六角笔杆', on: false },
      { at: kAt(o, d, 29), text: '握胶', on: !!st.ans },
      { at: kAt(o, d, 9), text: '前嘴', on: false },
      { at: kAt(o, d, 2), text: '导管', on: false },
      ...(st.ext > .05 ? [{ at: kAt(o, d, -st.ext), text: '笔芯', on: st.press > 0 || !!st.ans }] : []),
      { at: dk(CASE[0] + 10, CASE[3], CASE_ZT), text: '笔芯盒', on: st.feed > 0 } ], B);
  }

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { click: '咔哒还没按完', frenzy: '还在狂按……', write: '正在写', spin: '笔还在手上转', refill: '正在加芯' };
  const busy = () => { if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等一下'); return true; };
  const backToRest = st => (st.fallen || st.pose !== REST) ? { ms: 420, start(){ this.from = st.pose; }, step(k){ st.pose = lifted(poseLerp(this.from, REST, ease(k)), k, 8); }, end(){ st.pose = REST; st.fallen = false; } } : null;
  // one click: press (lead rides forward with the closed chuck until the ring stops), release
  function clickSegs(st, fast){
    let e0 = 0;
    return [{ ms: fast ? 45 : 85, start(){
        // a stub too short to reach the jaws: the next lead from the tube pushes it out
        if (st.lead - st.ext < 21 && st.lead > 0){ if (st.spares > 0){ st.bits.push(bitNear(st, Math.max(.5, st.lead - Math.max(0, st.ext)))); st.lead = LEAD_L; st.ext = -3; st.spares--; ui.flash('旧芯头被顶出来，新芯接上——再按几下'); }
          else { st.bits.push(bitNear(st, st.lead)); st.lead = 0; st.ext = 0; } }
        e0 = st.ext; },
      step(k){ st.press = k; if (st.lead > 0) st.ext = e0 + Math.min(ADV, CLICK*k); }, end(){ st.clicks++; } },
      { ms: fast ? 55 : 120, step(k){ st.press = 1 - k; } }];
  }
  function bitNear(st, len){ const { o, d } = st.pose, p = undk(kAt(o, d, -st.ext - 3)), dd = undk(kAdd(DK.concat(0), d)); return { u: p[0] - 3, v: p[1] + 2, len: Math.min(8, len), a: Math.atan2(dd[1], dd[0]) + 1.1 }; }
  function click(st){ if (busy()) return;
    if (!st.lead && !st.spares) return ui.flash('一根芯都没了——先加芯');
    kPlay(ui, 'click', [backToRest(st), ...clickSegs(st, false)], () => { if (!st.lead && !st.spares) ui.flash('最后一截芯掉出来了——没芯了'); }); }
  function frenzy(st){ if (busy()) return;
    if (!st.lead && !st.spares) return ui.flash('一根芯都没了——先加芯');
    const segs = [backToRest(st)]; for (let i = 0; i < 10; i++) segs.push(...clickSegs(st, true));
    kPlay(ui, 'frenzy', segs, () => ui.flash('咔哒咔哒咔哒……前桌回头瞪了你一眼', 2400)); }
  // a snapped piece of lead flies off toward the next desk and lands on the sheet
  function snap(st, len, vu = -16, vv = -72){
    const { o, d } = st.pose, p = kAt(o, d, -st.ext/2);
    st.ext = 0; st.lead = Math.max(0, st.lead - len);
    st.fly = { p, v: kAdd(dkv(vu, vv), [0, 0, 95]), a: 0, w: 26, len };
    ui.animate(dt => { const fl = st.fly; if (!fl) return false;
      fl.v[2] -= 330*dt; fl.p = kAdd(fl.p, kScl(fl.v, dt)); fl.a += fl.w*dt;
      if (fl.p[2] <= ZP + R_LEAD && fl.v[2] < 0){ const sp = S1.undk(fl.p), pu = Math.max(6, Math.min(S1.w - 10, sp[0])), pv = Math.max(4, Math.min(S1.h - 4, sp[1]));
        const q = undk(S1.dk(pu, pv, 0));
        st.bits.push({ u: q[0], v: q[1], len: fl.len, a: fl.a }); if (st.bits.length > 8) st.bits.shift(); st.fly = null; return false; }
      return true; });
  }
  function write(st){ if (busy()) return;
    if (!st.lead && !st.spares) return ui.flash('一根芯都没了——先加芯');
    if (st.done.every(Boolean)){ st.done = [false, false, false]; st.bits = []; ui.flash('三道题都写完了，换一张新的'); }
    const i = st.done.indexOf(false), sk = ANS[i], len = strokesLength(sk);
    const segs = [backToRest(st)];
    // no lead showing: click it out first (the real missing step)
    let need = 0, e = st.ext; while (e < .45 && need < 12){ e += ADV; need++; }
    if (need){ ui.flash(st.ext < 0 ? '新芯还没出来，先多按几下' : '芯没露出来，先咔哒一下'); for (let c = 0; c < need; c++) segs.push(...clickSegs(st, need > 2)); }
    segs.push({ ms: 420, start(){ this.from = st.pose; }, step(k){ st.pose = lifted(poseLerp(this.from, tipAt(sk[0][0], st.ext), ease(k)), k, 14); } });
    segs.push({ ms: 10, end(){
      if (st.ext > 2.5){   // too much lead out: it snaps the moment it touches the paper
        const len = st.ext; snap(st, len); st.pose = tipAt(sk[0][0], 0);
        ui.flash(len > 4 ? '啪！芯露太长一碰就断，弹到前桌后脑勺上了' : '啪！芯露太长，一落笔就断', 2400);
        st.snapped = true; } else st.snapped = false; } });
    segs.push({ ms: Math.max(500, len/36*1000), start(){ if (!st.snapped) st.ans = { i, dist: 0 }; },
      step(k){ if (st.snapped) return; st.ans.dist = k*len; st.pose = tipAt(traceStrokes(sk, st.ans.dist).tip, st.ext); },
      end(){ if (st.snapped) return; st.done[i] = true; st.ans = null; st.ext = Math.max(.05, st.ext - .15); st.lead -= .15; } });
    segs.push({ ms: 420, start(){ this.from = st.pose; }, step(k){ st.pose = lifted(poseLerp(this.from, REST, ease(k)), k, 10); }, end(){ st.pose = REST; } });
    kPlay(ui, 'write', segs);
  }
  // pen spinning round the thumb: up off the desk, two turns, back down; every third try it is dropped
  function spin(st){ if (busy()) return;
    const fail = st.spins % 3 === 2, PIV = dk(-8, 6, ZP + 30), SP = 52;
    const at = phi => { const d = norm(dkv(Math.cos(phi), Math.sin(phi), .1)); return { o: kAt(PIV, d, -SP), d }; };
    const phi0 = Math.atan2(-.04, 1);
    const segs = [backToRest(st),
      { ms: 280, start(){ this.from = st.pose; }, step(k){ st.pose = poseLerp(this.from, at(phi0), ease(k)); } },
      { ms: 980, step(k){ st.pose = at(phi0 + ease(k)*4*Math.PI); } }];
    if (!fail) segs.push({ ms: 320, start(){ this.from = st.pose; }, step(k){ st.pose = poseLerp(this.from, REST, ease(k)); }, end(){ st.pose = REST; } });
    else segs.push({ ms: 520, start(){ this.from = st.pose; }, step(k){
        const g = Math.min(1, k/.62), b = k > .62 ? 3.5*Math.sin(Math.PI*(k - .62)/.38) : 0;
        const p = poseLerp(this.from, FALLEN, g*g); st.pose = { o: kAdd(p.o, [0, 0, b]), d: p.d }; },
      end(){ st.pose = FALLEN; st.fallen = true;
        if (st.ext > 1.2){ const len = st.ext; snap(st, len, -24, -30); ui.flash('啪嗒——全班回头看你，芯也摔断了', 2400); }
        else ui.flash('啪嗒——全班回头看你', 2200); } });
    st.spins++;
    kPlay(ui, 'spin', segs, () => { if (!fail) ui.flash(st.spins > 3 ? `转了 ${st.spins} 次笔，一道题都没做` : '转笔成功，题还没做', 1800); });
  }
  // refill from the lead case: cap off, eraser out, two leads slid down into the tube, eraser and cap back
  function refill(st){ if (busy()) return;
    if (st.spares >= 8) return ui.flash('储芯管已经装满了');
    if (st.caseN <= 0) return ui.flash('笔芯盒也空了');
    st.feedN = Math.min(2, st.caseN, 8 - st.spares);
    kPlay(ui, 'refill', [backToRest(st),
      { ms: 420, start(){ this.from = st.pose; }, step(k){ st.pose = lifted(poseLerp(this.from, REFILL, ease(k)), k, 6); }, end(){ st.pose = REFILL; } },
      { ms: 280, step(k){ st.rc1 = ease(k); } }, { ms: 240, step(k){ st.rc2 = ease(k); } },
      { ms: 240, step(k){ st.re1 = ease(k); } }, { ms: 200, step(k){ st.re2 = ease(k); } },
      { ms: 1300, step(k){ st.feed = k; }, end(){ st.feed = 0; st.spares += st.feedN; st.caseN -= st.feedN; if (!st.lead){ st.lead = LEAD_L; st.ext = -3; st.spares--; } } },
      { ms: 200, step(k){ st.re2 = 1 - ease(k); } }, { ms: 240, step(k){ st.re1 = 1 - ease(k); } },
      { ms: 240, step(k){ st.rc2 = 1 - ease(k); } }, { ms: 280, step(k){ st.rc1 = 1 - ease(k); } },
      { ms: 420, start(){ this.from = st.pose; }, step(k){ st.pose = lifted(poseLerp(this.from, REST, ease(k)), k, 6); }, end(){ st.pose = REST; } } ],
      () => ui.flash(`加了 ${st.feedN} 根芯，储芯管里有 ${st.spares} 根`));
  }

  const __cfg = ({
    fig:'01', turn:'full', title:'自动铅笔', palette:'cobalt',
    state:{ pose: REST, ext: .5, lead: LEAD_L, spares: 3, caseN: 12, clicks: 0, press: 0, rc1: 0, rc2: 0, re1: 0, re2: 0, feed: 0, feedN: 0,
      done: [false, false, false], ans: null, bits: [], fly: null, fallen: false, spins: 0, snapped: false },
    scene,
    stats: st => [ { label:'露芯', value: Math.max(0, st.ext).toFixed(1) + ' mm' }, { label:'咔哒', value: String(st.clicks), small: true } ],
    buttons:[
      { label:'按一下', onClick: click },
      { label:'写答案', onClick: write },
      { label:'考试狂按', onClick: frenzy },
      { label:'转笔', onClick: spin },
      { label:'加芯', onClick: refill },
    ],
    acts:{ cap: st => click(st), sheet: st => write(st) },
    params:(st, q) => {
      if (q.has('ext')) st.ext = +q.get('ext');
      if (q.has('cap')) st.press = Math.max(0, Math.min(1, +q.get('cap')));
      if (q.has('spares')) st.spares = +q.get('spares');
      if (q.has('ans')) for (let i = 0; i < Math.min(3, +q.get('ans')); i++) st.done[i] = true;
      if (q.has('bits')) for (let i = 0; i < +q.get('bits'); i++) st.bits.push({ u: -60 + i*14, v: -34 + (i % 3)*9, len: 3 + i % 3, a: i*1.3 });
      const pose = q.get('pose');
      if (pose === 'write') st.pose = tipAt(ANS[1][0][0], Math.max(0, st.ext));
      if (pose === 'fallen'){ st.pose = FALLEN; st.fallen = true; }
      if (pose === 'spin'){ const d = norm(dkv(.3, 1, .1)); st.pose = { o: kAt(dk(-8, 6, ZP + 30), d, -52), d }; }
      if (pose === 'refill'){ st.pose = REFILL; st.rc1 = st.rc2 = st.re1 = st.re2 = 1; }
      if (q.has('feed')){ st.feedN = 2; st.feed = +q.get('feed'); }
    },
  });

  return ctx.adapt(__cfg, { seeThrough: true });
}
