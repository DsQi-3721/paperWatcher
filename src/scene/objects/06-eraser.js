// Fig. 06 橡皮 — desk-scene object, ported from stationery/src/06-eraser.html by scripts/port-figures.mjs.
// The figure's own code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*),
// ctx.ui its ui (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are
// collected by the scene.
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: 0, v: 190, rot: 0 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 06 — Eraser: a big white PVC "4B" eraser in a printed card sleeve, on the shared classroom desk.
     Desk terms: u along the desk's front edge, v toward the student (this object's own frame, ctx.desk, with its origin
     on the 三八线: u > 0 is the deskmate's side); 1 unit = 1 mm. The pencil words it rubs out are in the lower band of the
     shared 英语默写 sheet (S4, pv 128–250); the deskmate's eraser lies across the line on the bare desk, near the front
     edge. Things that go over an edge of the desk fall and are gone (nothing is drawn below the top).
     The eraser is drawn in its own frame: a along its length (+a = the working end), b across, c through its thickness.

     How it really works (each button is one of these):
     1. Erasing: the soft PVC is rubbed over the pencil marks. Graphite only sits on the paper's fibres; the eraser is
        a little sticky and softer than the paper, so friction tears off its own surface: the torn-off PVC rolls up into
        crumbs (橡皮屑) that wrap the graphite flakes and carry them away. So the mark fades pass by pass, the working end
        gets shorter, its edges round off and turn grey, and crumbs pile up beside the word.
     2. Rubbed too hard on thin exercise paper, the paper's own fibres pill and tear first: a hole.
     3. Crumbs are loose: a breath pushes them across the desk, where they slide and stop by friction (or drop off).
     4. The card sleeve is only a sleeve: it slides off. Underneath, the legend: write the name of the one you like on
        your eraser, use it up without anyone seeing it, and it comes true.
     5. Flick fight: a flicked eraser slides on the desk and slows by friction; hitting the other one hands most of its
        momentum over. Over the line chalked down the middle of the desk (三八线), it belongs to the deskmate.
     Parts:
     ERASER   PVC body . working end (worn, rounded, grey) . far end . card sleeve (four printed faces, two open ends,
              card edge) . secret name (blue ballpoint initials + heart, under the sleeve)
     DESK     its band of the shared 英语默写 sheet (pencil words, holes) . deskmate's eraser (blue sleeve) . crumbs
              (the chalk 三八线 and the desk are the scene's) */

  /* ---------- on the shared desk: the lower band of the 英语默写 (S4) ---------- */
  const BH = ctx.deskZ;
  const S4 = ctx.paper('S4'), S2 = ctx.paper('S2'), ZP = S4.z;
  const WSIZE = 6.8, WORD_PU = 22;                                 // words start right of S4's red margin (pu 18)
  const PAGES = [['hello', '1+1=3', 'ocean', 'bacon'], ['cabin', '2+2=5', 'lion', 'bean']];
  const WORD_PV = [138, 150, 162, 174];                            // standing on S4's rules
  const wordStrokes = (pg, i) => S4.deskHand(PAGES[pg][i], WORD_PU, WORD_PV[i], ZP + .02, WSIZE, 21 + i*5 + pg*31);
  const wordLen = (pg, i) => (PAGES[pg][i].length*.78 - .1)*WSIZE;
  // a point on S4 (pu across, pv down the page) in this object's own frame (u, v)
  const onS4 = (pu, pv) => { const p = undk(S4.dk(pu, pv, 0)); return [p[0], p[1]]; };
  // the word's rubbing line, mid-height, as two points in this object's frame
  const wordLine = (pg, i) => { const pv = WORD_PV[i] - WSIZE*.42; return [onS4(WORD_PU, pv), onS4(WORD_PU + wordLen(pg, i), pv)]; };
  // what a crumb or an eraser rests on here: S4, S2, or the bare desk (things off the desk top fall)
  const onPaper = (Pp, p) => { const q = Pp.undk(p); return q[0] >= 0 && q[0] <= Pp.w && q[1] >= 0 && q[1] <= Pp.h; };
  const surfZ = (u, v) => { const p = dk(u, v, 0); return onPaper(S4, p) ? S4.z : onPaper(S2, p) ? S2.z : BH; };

  /* ---------- the eraser ---------- */
  const EL = 56, EW = 24, ET = 13, SL = 19, SLT = .5;             // body length, width, thickness; sleeve half-length, card thickness
  const SL_OFF = 30;                                               // pulled back this far, the sleeve uncovers the name
  const ERASER = MAT.eraser, PEN_BLUE = '#2b4fb3';
  const THEIRS = { l:'#7fb0f0', m:'#5a86cc', d:'#2c4677' };
  // frame from heading h (deg, in desk terms), pitch p (deg, working end tipped down), roll r (deg, about the length)
  function erFrame(h, p, r){
    const H = h*Math.PI/180, Pp = p*Math.PI/180, R = r*Math.PI/180;
    const A0 = dkv(Math.cos(H), Math.sin(H), 0), B0 = dkv(-Math.sin(H), Math.cos(H), 0), C0 = [0, 0, 1];
    const A = kAdd(kScl(A0, Math.cos(Pp)), kScl(C0, -Math.sin(Pp))), C1 = kAdd(kScl(C0, Math.cos(Pp)), kScl(A0, Math.sin(Pp)));
    return { A, B: kAdd(kScl(B0, Math.cos(R)), kScl(C1, Math.sin(R))), C: kAdd(kScl(C1, Math.cos(R)), kScl(B0, -Math.sin(R))) };
  }
  const erW = (e, a, b, c) => [e.o[0] + e.A[0]*a + e.B[0]*b + e.C[0]*c, e.o[1] + e.A[1]*a + e.B[1]*b + e.C[1]*c, e.o[2] + e.A[2]*a + e.B[2]*b + e.C[2]*c];
  // side profile (a, c): the working end's edges round off as it wears
  function erProfile(wear){
    const a0 = -EL/2, a1 = EL/2 - wear, t = ET/2, rw = Math.min(4.6, .8 + wear*1.1), r0 = .8;
    return [...arcUV(a1 - rw, -t + rw, rw, -90, 0, 5), ...arcUV(a1 - rw, t - rw, rw, 0, 90, 5), ...arcUV(a0 + r0, t - r0, r0, 90, 180, 3), ...arcUV(a0 + r0, -t + r0, r0, 180, 270, 3)];
  }
  // keep the part of a convex profile between a = lo and a = hi
  function erClip(poly, lo, hi){
    const cut = (pts, keep, x) => { const o = []; for (let i = 0; i < pts.length; i++){ const p = pts[i], q = pts[(i + 1) % pts.length], kp = keep(p), kq = keep(q);
      if (kp) o.push(p); if (kp !== kq){ const t = (x - p[0])/(q[0] - p[0]); o.push([x, p[1] + (q[1] - p[1])*t]); } } return o; };
    return cut(cut(poly, p => p[0] >= lo - 1e-6, lo), p => p[0] <= hi + 1e-6, hi);
  }
  // the eraser's geometry points (local), for settling it on the desk and for its shadow
  function erLocalPts(g){ const pts = [];
    for (const [a, c] of erProfile(g.wear)) for (const b of [-EW/2, EW/2]) pts.push([a, b, c]);
    if (g.sleeveOn) for (const a of [-SL + g.sOff, SL + g.sOff]) for (const b of [-1, 1]) for (const c of [-1, 1]) pts.push([a, b*(EW/2 + SLT), c*(ET/2 + SLT)]);
    return pts; }
  // place an eraser: centre over (u, v), frame (h, p, r), lifted by lift above the point where its lowest point touches
  function erPlace(g){
    const fr = erFrame(g.h, g.p, g.r), lp = erLocalPts(g), zs = lp.map(([a, b, c]) => fr.A[2]*a + fr.B[2]*b + fr.C[2]*c);
    const e = { ...g, ...fr, o: dk(g.u, g.v, (g.zBase ?? ZP) - Math.min(...zs) + (g.lift || 0)) };
    e.pts = lp.map(([a, b, c]) => erW(e, a, b, c)); return e; }
  // (u, v) of the centre that puts the lowest point of the eraser (frame h, p, r) on the desk point (cu, cv)
  function erCentreFor(g, cu, cv){ const e = erPlace({ ...g, u: 0, v: 0 }); let lo = e.pts[0];
    for (const q of e.pts) if (q[2] < lo[2]) lo = q;
    const d = undk(lo); return [cu - d[0], cv - d[1]]; }

  // one block of the body between a = lo and hi, extruded across its width; the worn end greys
  function erPiece(e, lo, hi, M){
    const pr = erClip(erProfile(e.wear), lo, hi); if (pr.length < 3) return '';
    const SM = { l: mix(M.l, '#8e8f94', e.smudge || 0), m: mix(M.m, '#76777c', e.smudge || 0), d: mix(M.d, '#5d5e63', e.smudge || 0) };
    const A = pr.map(([a, c]) => erW(e, a, -EW/2, c)), B = pr.map(([a, c]) => erW(e, a, EW/2, c));
    let s = loft(A, B, n => tone(n, dot(n, e.A) > .45 ? SM : M));
    for (const [ring, n] of [[B, e.B], [A, kScl(e.B, -1)]]) if (vis(n)) s += fill(pd(ring), tone(n, M)) + ink(pd(ring), .8);
    return s + hullInk([...A, ...B], 1.9);
  }
  // strokes on the top face (+c) in local (a, b), clipped to a in [lo, hi]
  function erFaceStrokes(e, strokes, lo, hi, col, w){
    if (!vis(e.C)) return ''; let d = '';
    for (const sk of strokes){ let run = [];
      const flush = () => { if (run.length > 1) d += pd(run.map(([a, b]) => erW(e, a, b, ET/2 + .03)), false); run = []; };
      for (let i = 0; i < sk.length; i++){ const p = sk[i], q = sk[i + 1], inP = p[0] >= lo && p[0] <= hi;
        if (inP) run.push(p);
        if (q){ const inQ = q[0] >= lo && q[0] <= hi;
          if (inP !== inQ){ const x = inP ? (q[0] > hi ? hi : lo) : (p[0] > hi ? hi : lo), t = (x - p[0])/(q[0] - p[0]); const m = [x, p[1] + (q[1] - p[1])*t];
            if (inP){ run.push(m); flush(); } else run.push(m); } } }
      flush(); }
    return d ? `<path d="${d}" fill="none" stroke="${col}" style="stroke-width:${w}" stroke-linecap="round" stroke-linejoin="round"/>` : '';
  }
  // the secret: initials and a heart in blue ballpoint, along the eraser, letters standing toward -b. Whose initials
  // is the desk's setting (TA, 'him / her', unless you write someone's in the desk settings): one to four capitals,
  // written smaller the more there are, so they and the heart always fit under the sleeve. Each letter is a few pen
  // strokes in a box 0.56 wide and 1 tall (v up).
  const GLYPHS = {
    A: [[[0, 0], [.28, 1], [.56, 0]], [[.1, .36], [.46, .36]]],
    B: [[[0, 0], [0, 1], [.38, 1], [.5, .9], [.5, .62], [.38, .52], [0, .52]], [[.38, .52], [.54, .42], [.54, .1], [.4, 0], [0, 0]]],
    C: [[[.54, .84], [.42, .98], [.18, .98], [.04, .82], [0, .5], [.04, .18], [.18, .02], [.42, .02], [.54, .16]]],
    D: [[[0, 0], [0, 1], [.3, 1], [.5, .82], [.56, .5], [.5, .18], [.3, 0], [0, 0]]],
    E: [[[.54, 1], [0, 1], [0, 0], [.54, 0]], [[0, .52], [.42, .52]]],
    F: [[[.54, 1], [0, 1], [0, 0]], [[0, .52], [.42, .52]]],
    G: [[[.54, .84], [.42, .98], [.18, .98], [.04, .82], [0, .5], [.04, .18], [.18, .02], [.42, .02], [.56, .16], [.56, .44], [.3, .44]]],
    H: [[[0, 1], [0, 0]], [[.56, 1], [.56, 0]], [[0, .52], [.56, .52]]],
    I: [[[.28, 1], [.28, 0]], [[.1, 1], [.46, 1]], [[.1, 0], [.46, 0]]],
    J: [[[.56, 1], [.56, .2], [.44, .02], [.16, .02], [.02, .2]]],
    K: [[[0, 1], [0, 0]], [[.56, 1], [0, .42]], [[.18, .58], [.56, 0]]],
    L: [[[0, 1], [0, 0], [.54, 0]]],
    M: [[[0, 0], [0, 1], [.28, .48], [.56, 1], [.56, 0]]],
    N: [[[0, 0], [0, 1], [.56, 0], [.56, 1]]],
    O: [[[.28, 1], [.06, .86], [0, .5], [.06, .14], [.28, 0], [.5, .14], [.56, .5], [.5, .86], [.28, 1]]],
    P: [[[0, 0], [0, 1], [.4, 1], [.54, .88], [.54, .62], [.4, .5], [0, .5]]],
    Q: [[[.28, 1], [.06, .86], [0, .5], [.06, .14], [.28, 0], [.5, .14], [.56, .5], [.5, .86], [.28, 1]], [[.34, .24], [.58, -.04]]],
    R: [[[0, 0], [0, 1], [.4, 1], [.54, .88], [.54, .62], [.4, .5], [0, .5]], [[.3, .5], [.56, 0]]],
    S: [[[.54, .86], [.4, 1], [.14, 1], [.02, .86], [.04, .66], [.5, .36], [.54, .14], [.4, 0], [.14, 0], [0, .14]]],
    T: [[[0, 1], [.56, 1]], [[.28, 1], [.28, 0]]],
    U: [[[0, 1], [0, .22], [.12, .02], [.44, .02], [.56, .22], [.56, 1]]],
    V: [[[0, 1], [.28, 0], [.56, 1]]],
    W: [[[0, 1], [.12, 0], [.28, .62], [.44, 0], [.56, 1]]],
    X: [[[0, 1], [.56, 0]], [[.56, 1], [0, 0]]],
    Y: [[[0, 1], [.28, .5], [.56, 1]], [[.28, .5], [.28, 0]]],
    Z: [[[0, 1], [.54, 1], [.02, 0], [.56, 0]]],
  };
  // where the initials and the heart go along the eraser (under the sleeve), and how big
  const NAME_SPAN = [-10.5, 12.8], HEART_R = 3.2, NAME_GAP = 2.06, LETTER_STEP = .78;
  const nameMemo = new Map();
  function nameStrokes(name){
    const key = String(name || '');
    let out = nameMemo.get(key);
    if (out) return out;
    const letters = [...key.toUpperCase()].filter(c => GLYPHS[c]).slice(0, 4), n = letters.length;
    const units = n ? (n - 1)*LETTER_STEP + .56 : 0, room = NAME_SPAN[1] - NAME_SPAN[0] - 2*HEART_R;
    const k = n ? Math.min(8, (room - NAME_GAP)/units) : 8;
    const x0 = NAME_SPAN[0] + (room - (n ? units*k + NAME_GAP : 0))/2;
    const g = (pts, du) => pts.map(([u, v]) => [x0 + (u + du)*k, -.6 + (.5 - v)*k]);
    out = [];
    letters.forEach((c, i) => { for (const stroke of GLYPHS[c]) out.push(g(stroke, i*LETTER_STEP)); });
    const hx = x0 + (n ? units*k + NAME_GAP : 0) + HEART_R;
    out.push(Array.from({length: 29}, (_, i) => { const t = i/28*2*Math.PI; return [hx + HEART_R*Math.pow(Math.sin(t), 3), -.6 - (13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t) + 6)*.255]; }));
    nameMemo.set(key, out);
    return out;
  }

  // the card sleeve: four printed faces and the card edge at the open end that faces the viewer
  function erSleeve(e, s0, s1, M, print, open){
    const hb = EW/2 + SLT, hc = ET/2 + SLT, Q = (a, b, c) => erW(e, a, b, c);
    const faces = [[e.C, [[s0, -hb, hc], [s1, -hb, hc], [s1, hb, hc], [s0, hb, hc]], 'top'], [kScl(e.C, -1), [[s0, -hb, -hc], [s1, -hb, -hc], [s1, hb, -hc], [s0, hb, -hc]], 'bot'],
      [e.B, [[s0, hb, -hc], [s1, hb, -hc], [s1, hb, hc], [s0, hb, hc]], 'side'], [kScl(e.B, -1), [[s0, -hb, -hc], [s1, -hb, -hc], [s1, -hb, hc], [s0, -hb, hc]], 'side2']];
    let s = '';
    for (const [n, q, kind] of faces){ if (!vis(n)) continue;
      s += shape(q.map(p => Q(...p)), tone(n, M), .8);
      const sgn = kind === 'bot' ? -1 : 1, cc = sgn*hc + sgn*.03, mid = (s0 + s1)/2;
      if (kind === 'top' || kind === 'bot'){
        s += fill(pd([[mid + 2, -hb + .3, cc], [s1 - 1.5, -hb + .3, cc], [s1 - 1.5, hb - .3, cc], [mid + 2, hb - .3, cc]].map(p => Q(...p))), '#fbf6ea');
        if (print){ s += txOn(kAdd(Q(mid - 8, 0, cc), kScl(e.B, sgn*3.1)), e.A, n, '4B', 9, '#ffffff', 900);
          s += txOn(kAdd(Q(mid + 2 + (s1 - 1.5 - mid - 2)/2, 0, cc), kScl(e.B, sgn*1.2)), e.A, n, '考试专用', 3.3, INK, 800); } }
      else { const sb = kind === 'side' ? hb + .03 : -hb - .03, dir = kind === 'side' ? e.A : kScl(e.A, -1);
        s += fill(pd([[mid + 2, sb, -hc + .4], [s1 - 1.5, sb, -hc + .4], [s1 - 1.5, sb, hc - .4], [mid + 2, sb, hc - .4]].map(p => Q(...p))), '#fbf6ea');
        if (print) s += txOn(kAdd(Q(mid - 8, sb, 0), kScl(e.C, -1.2)), dir, n, 'ERASER', 3.1, '#ffffff', 900); } }
    // card edge round the open end facing the viewer (with the dark inside showing if nothing fills it)
    for (const [a, n] of [[s1, e.A], [s0, kScl(e.A, -1)]]){ if (!vis(n)) continue;
      const out = [[a, -hb, -hc], [a, hb, -hc], [a, hb, hc], [a, -hb, hc]], inn = [[a, -hb + SLT, -hc + SLT], [a, hb - SLT, -hc + SLT], [a, hb - SLT, hc - SLT], [a, -hb + SLT, hc - SLT]];
      if (open) s += fill(pd(inn.map(p => Q(...p))), '#3a2f2a');
      s += `<path d="${pd(out.map(p => Q(...p)))}${pd(inn.map(p => Q(...p)))}" fill="#efe6d2" fill-rule="evenodd" stroke="${INK}" stroke-width=".6"/>`; }
    const all = []; for (const a of [s0, s1]) for (const b of [-hb, hb]) for (const c of [-hc, hc]) all.push(Q(a, b, c));
    return s + hullInk(all, 1.5);
  }
  // a whole eraser: the body either side of its sleeve, ordered for the view, the name (opts.name: its strokes) on the
  // top face
  function erDraw(e, M, sleeveM, opts = {}){
    const a1 = EL/2 - e.wear, sOn = e.sleeveOn, s0 = -SL + (e.sOff || 0), s1 = SL + (e.sOff || 0);
    if (!sOn) return erPiece(e, -EL/2, a1, M) + (opts.name ? erFaceStrokes(e, opts.name, -EL/2, a1, PEN_BLUE, .7) : '');
    const lo = [-EL/2, Math.min(s0, a1)], hi = [Math.max(s1, -EL/2), a1];
    const pLo = lo[1] > lo[0] + .05 ? erPiece(e, lo[0], lo[1], M) + (opts.name ? erFaceStrokes(e, opts.name, lo[0], lo[1], PEN_BLUE, .7) : '') : '';
    const pHi = hi[1] > hi[0] + .05 ? erPiece(e, hi[0], hi[1], M) + (opts.name ? erFaceStrokes(e, opts.name, hi[0], hi[1], PEN_BLUE, .7) : '') : '';
    const open = s0 < -EL/2 - .5, sl = opts.name ? act('sleeve', erSleeve(e, s0, s1, sleeveM, true, open)) : erSleeve(e, s0, s1, sleeveM, true, open);
    return vis(e.A) ? pLo + sl + pHi : pHi + sl + pLo;
  }

  /* ---------- poses ---------- */
  // mine on S4 below the words; the deskmate's across the line on the bare desk, 24 mm in from the desk's front edge:
  // a flick pushes it toward that edge, the second (harder) one over it
  const HOME = { u: -32, v: -2, h: -6, p: 0, r: 0 };
  const THEM_HOME = { u: 32, v: 61, h: 20, p: 0, r: 0 };
  const ERASE_ANG = { h: -140, p: 45, r: 0 };            // held at 45 degrees, leaning to the right like a right hand holds it
  // my eraser's placed pose (sleeve, wear and all) from the state
  function mine(st){
    return erPlace({ ...st.me, wear: st.wear, smudge: Math.min(.55, st.erased*.05), sleeveOn: true, sOff: -st.sleeve*SL_OFF });
  }
  /* ---------- the sheet, words, holes, chalk line, crumbs ---------- */
  function holePath(h){ const rnd = kRng(h.seed), pts = [];
    for (let i = 0; i < 18; i++){ const t = i/18*2*Math.PI, r = .78 + .32*rnd(); pts.push(dk(h.u + Math.cos(t)*h.w*r, h.v + Math.sin(t)*h.hh*r, ZP + .03)); }
    return pts; }
  function sheet(st){
    const z = ZP + .02;
    let s = act('sheet', fill(pd(rectUV(18, 128, S4.w - 2, 250).map(([a, b]) => S4.dk(a, b, z))), 'transparent'));
    for (const h of st.holes){ const hp = holePath(h);
      s += fill(pd(hp), '#ddc28f') + `<path d="${pd(hp)}" fill="none" stroke="${INK}" stroke-width=".7"/>`;   // the desk shows through
      // torn paper fibres curling at the rim
      const rnd = kRng(h.seed + 3); let fl = '';
      for (let i = 0; i < 9; i++){ const p = hp[(i*2) % hp.length], q = hp[(i*2 + 1) % hp.length], m = kLerp(p, q, .5); fl += pd([p, kAdd(m, [ (rnd() - .5)*1.2, (rnd() - .5)*1.2, .6]), q]); }
      s += `<path d="${fl}" fill="#fbf8f0" stroke="${INK}" stroke-width=".4"/>`; }
    for (let i = 0; i < 4; i++){ const w = st.words[i]; if (w.hole) continue;
      const op = .92*(1 - w.erased);
      if (w.erased > 0 && w.erased < 1) s += graphite(wordStrokes(st.page, i), '#9a9ca3', 2.2, .18*(1 - w.erased));   // smear
      if (op > .01) s += graphite(wordStrokes(st.page, i), GRAPHITE, .7, op); }
    return s;
  }
  const CRUMB = matOf('#efece4'), CRUMB_G = matOf('#c9c8c6'), PILL = matOf('#fffaf0');
  function crumbSvg(c){ const ca = Math.cos(c.a), sa = Math.sin(c.a), z = (c.z ?? ZP) + c.r;
    return rod(dk(c.u - ca*c.len/2, c.v - sa*c.len/2, z), dk(c.u + ca*c.len/2, c.v + sa*c.len/2, z), c.r, c.paper ? PILL : c.grey ? CRUMB_G : CRUMB, toneI, .45, c.r, 8); }

  /* ---------- scene ---------- */
  const boxOf = pts => [[0,1,2].map(i => Math.min(...pts.map(p => p[i]))), [0,1,2].map(i => Math.max(...pts.map(p => p[i])))];
  function scene(st, m){
    let s = sheet(st);
    const me = mine(st);
    let them = st.them.gone ? null : erPlace({ ...st.them, wear: 1.5, sleeveOn: true, sOff: 0, zBase: st.them.zBase });
    // dropping past the front edge: seen from the far side of the desk it is behind the desk once it is below the top;
    // from the near side it shows tipping over the edge, and is gone once all of it is below the top
    if (them && st.them.zBase != null && (CAM_V[0] < 0 ? them.o[2] < BH : Math.max(...them.pts.map(p => p[2])) < BH)) them = null;
    // crumbs lie flat on the paper and desk, under the bodies; one blown over an edge is gone as it drops below the top
    for (const c of st.crumbs) if (!c.air || c.z >= BH) s += crumbSvg(c);
    // shadows: one per eraser, on the desk (none once the deskmate's has dropped below the edge)
    s += castShadow(me.pts, ZP);
    if (them && them.o[2] > ZP - 5) s += castShadow(them.pts, ZP);
    const items = [
      { box: boxOf(me.pts), svg: act('mine', erDraw(me, ERASER, m, { name: nameStrokes(st.name) })) } ];
    if (them) items.push({ box: boxOf(them.pts), svg: act('them', erDraw(them, ERASER, THEIRS)) });
    s += byDepth(items);
    s += labels(st, me, them);
    return s;
  }
  function labels(st, me, them){
    const pts = [...me.pts, ...(them ? them.pts : [])], B = [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[1])), 0, 10];
    const it = [];
    it.push({ at: erW(me, -st.sleeve*SL_OFF - 6, 0, ET/2 + SLT), text: '纸套', on: kBusy() === 'sleeve' });
    it.push({ at: erW(me, EL/2 - st.wear, 0, 0), text: '擦角', on: kBusy() === 'erase' || kBusy() === 'hard' });
    if (st.sleeve > .6) it.push({ at: erW(me, -2, 0, ET/2), text: '名字', on: true });
    if (st.crumbs.length){ const c = st.crumbs[st.crumbs.length - 1]; it.push({ at: dk(c.u, c.v, ZP + 1), text: '橡皮屑', on: kBusy() === 'blow' }); }
    it.push({ at: dk(0, -40, BH), text: '三八线', on: st.over });
    if (them) it.push({ at: erW(them, 0, 0, ET/2 + SLT), text: '同桌的橡皮', on: kBusy() === 'flick' });
    if (st.holes.length){ const h = st.holes[st.holes.length - 1]; it.push({ at: dk(h.u, h.v, ZP), text: '擦破的洞', on: false }); }
    return zhCallouts(it, B);
  }

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { erase: '正在擦', hard: '正在使劲擦', blow: '正在吹', sleeve: '纸套还在动', flick: '橡皮还在滑', home: '橡皮在拿回来' };
  const busy = () => { if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等一下'); return true; };
  const sameAs = (a, b) => ['u', 'v', 'h', 'p', 'r', 'lift'].every(k => Math.abs((a[k] || 0) - (b[k] || 0)) < .01);
  const lerpPose = (a, b, k) => { const o = {}; for (const key of ['u', 'v', 'h', 'p', 'r', 'lift']) o[key] = (a[key] || 0) + ((b[key] || 0) - (a[key] || 0))*k; return o; };
  function backHome(st){
    if (sameAs(st.me, HOME)) return null;
    return { ms: 520, start(){ this.from = { ...st.me }; }, step(k){ st.me = lerpPose(this.from, HOME, ease(k)); st.me.lift = 8*Math.sin(Math.PI*k); }, end(){ st.me = { ...HOME }; st.over = false; } };
  }
  function newPageIfDone(st){ if (st.words.every(w => w.erased >= 1 || w.hole)){ st.page = (st.page + 1) % PAGES.length; st.words = PAGES[0].map(() => ({ erased: 0, hole: false })); st.holes = []; ui.flash('这页擦干净了，换一页新作业'); return true; } return false; }
  // rub the next word: pick the eraser up, tip its working end onto the word, rub to and fro, put it back
  function erase(st, hard){ if (busy()) return;
    newPageIfDone(st);
    const i = st.words.findIndex(w => w.erased < 1 && !w.hole), [wa, wb] = wordLine(st.page, i);
    const passes = hard ? 7 : 4, ms = hard ? 210 : 330;
    const at = (cu, cv) => { const [u, v] = erCentreFor({ ...ERASE_ANG, wear: st.wear, sleeveOn: st.sleeve < .999, sOff: -st.sleeve*SL_OFF }, cu, cv); return { u, v, ...ERASE_ANG }; };
    const segs = [backHome(st), { ms: 460, start(){ this.from = { ...st.me }; }, step(k){ st.me = lerpPose(this.from, at(wa[0], wa[1]), ease(k)); st.me.lift = 10*Math.sin(Math.PI*k); } }];
    const wl = Math.hypot(wb[0] - wa[0], wb[1] - wa[1]);
    for (let p = 0; p < passes; p++){ const from = p % 2 ? wb : wa, to = p % 2 ? wa : wb;
      segs.push({ ms, step(k){ const e = ease(k), cu = from[0] + (to[0] - from[0])*e, cv = from[1] + (to[1] - from[1])*e + 1.6*Math.sin(e*Math.PI*2);
        st.me = at(cu, cv); st.me.lift = 0;
        const w = st.words[i]; w.erased = Math.min(1, (p + k)/passes);
        const dist = wl*k; if (dist - this.last > (hard ? 9 : 10)){ this.last = dist; addCrumb(st, cu, cv, hard); } },
        start(){ this.last = 0; }, end(){ st.wear = Math.min(EL*.62, st.wear + (hard ? .9 : .55)); } }); }
    segs.push({ ms: 10, end(){ st.words[i].erased = 1; st.erasedCount++; st.erased++;
      if (hard){ st.words[i].hole = true; st.holes.push({ u: (wa[0] + wb[0])/2, v: (wa[1] + wb[1])/2, w: wl/2 + 2, hh: 5.2, seed: 7 + st.holes.length*13 });
        for (let j = 0; j < 4; j++) addCrumb(st, wa[0] + (wb[0] - wa[0])*j/3, wa[1] + (wb[1] - wa[1])*j/3, true, true);
        ui.flash('用力过猛——作业纸擦破了一个洞', 2200); } } });
    segs.push({ ms: 480, start(){ this.from = { ...st.me }; }, step(k){ st.me = lerpPose(this.from, HOME, ease(k)); st.me.lift = 10*Math.sin(Math.PI*k); }, end(){ st.me = { ...HOME }; } });
    kPlay(ui, hard ? 'hard' : 'erase', segs, () => { if (!hard && st.erasedCount === 2) ui.flash('1+1=3 擦掉了，假装没写错'); });
  }
  function addCrumb(st, u, v, hard, paper){ const r = kRng(st.crumbs.length*7 + 3 + (st.seed++));
    // crumbs roll up along the rubbing path and get pushed off its sides
    const side = r() < .5 ? -1 : 1;
    st.crumbs.push({ u: u + (r() - .5)*6, v: v + side*(3.4 + r()*2.6), a: r()*Math.PI, len: paper ? 2 + r()*1.4 : 2.8 + r()*2.6, r: paper ? .6 : .7 + r()*.35, grey: !paper && r() < .5, paper });
    if (st.crumbs.length > 60) st.crumbs.shift(); }
  // blow the crumbs: a puff toward the deskmate's side; they slide and stop by friction, or drop off the desk
  function blow(st){ if (busy()) return;
    if (!st.crumbs.length) return ui.flash('桌上没有橡皮屑——先擦点东西');
    const r = kRng(41 + st.seed++);
    for (const c of st.crumbs){ c.vu = 170 + 130*r(); c.vv = (r() - .5)*24; c.w = (r() - .5)*14; c.z = ZP; c.vz = 0; c.air = false; }   // blown sideways, toward the deskmate
    kPlay(ui, 'blow', [{ ms: 1500, start(){ this.k0 = 0; }, step(k){ const dt = (k - this.k0)*1.5; this.k0 = k; for (const c of st.crumbs){
        if (c.air){ if (c.z > ctx.floorZ){ c.vz -= 2600*dt; c.z = Math.max(ctx.floorZ, c.z + c.vz*dt); c.u += c.vu*dt*.3; c.v += c.vv*dt*.3; } continue; }
        const sp = Math.hypot(c.vu, c.vv); if (sp > 0){ const nsp = Math.max(0, sp - 260*dt); c.vu *= nsp/sp; c.vv *= nsp/sp; }
        c.u += c.vu*dt; c.v += c.vv*dt; c.a += c.w*dt*(Math.hypot(c.vu, c.vv)/200);
        if (ctx.onDesk(dk(c.u, c.v, 0))) c.z = surfZ(c.u, c.v); else { c.air = true; c.vz = 0; } } } }],
      () => { st.crumbs = st.crumbs.filter(c => !c.air); const over = st.crumbs.filter(c => c.u > 0).length;
        ui.flash(over ? `${over} 粒橡皮屑吹过了三八线——同桌：你越界了！` : '吹干净了', 2400); });
  }
  // slide the card sleeve off the far end (the legend under it), or back on
  function sleeve(st){ if (busy()) return;
    const off = st.sleeve < .5;
    kPlay(ui, 'sleeve', [backHome(st), { ms: 900, step(k){ st.sleeve = off ? ease(k) : 1 - ease(k); } }],
      () => ui.flash(off ? '传说：写上喜欢的人的名字，用完之前没被人看到，就能成真' : '赶紧套回去，别被同桌看见', 2600));
  }
  // flick fight: my eraser slides across the desk at the deskmate's; momentum passes over on contact
  function flick(st){ if (busy()) return;
    const shown = st.sleeve > .5;
    if (st.them.gone) st.them = { ...THEM_HOME, gone: false, zBase: undefined };
    const me = { u: st.me.u, v: st.me.v, h: st.me.h, vu: 0, vv: 0, w: 0 }, th = { u: st.them.u, v: st.them.v, h: st.them.h, vu: 0, vv: 0, w: 0, z: 0, vz: 0, fall: false };
    const segs = [];
    if (st.me.p || st.me.lift || st.me.u > -12) segs.push(backHome(st));      // over the line: fetch it back first
    let hit = false, fell = false;
    segs.push({ ms: 2200, start(){ const sm = { u: st.me.u, v: st.me.v }; me.u = sm.u; me.v = sm.v; me.h = st.me.h;
        const dx = th.u - me.u, dy = th.v - me.v, L = Math.hypot(dx, dy), v0 = Math.min(420, 260 + 60*st.flicks);   // a little harder each time
        me.vu = v0*dx/L; me.vv = v0*dy/L + 12; me.w = 210; this.k0 = 0; st.flicks++; },
      step(k){ const dt = (k - this.k0)*2.2; this.k0 = k;
        const mu = me.u, mv = me.v;
        for (const o of [me, th]){ if (o.fall) continue; const sp = Math.hypot(o.vu, o.vv); if (sp > 0){ const nsp = Math.max(0, sp - 400*dt); o.vu *= nsp/sp; o.vv *= nsp/sp; }
          o.u += o.vu*dt; o.v += o.vv*dt; o.w *= Math.max(0, 1 - 1.6*dt); o.h += o.w*dt; }
        // mine stops at the desk's edge rather than going over it
        if (!ctx.onDesk(dk(me.u, me.v, 0))){ me.u = mu; me.v = mv; me.vu = me.vv = 0; me.w = 0; }
        const dx = th.u - me.u, dy = th.v - me.v, L = Math.hypot(dx, dy);
        if (!th.fall && L < 31){ const nx = dx/L, ny = dy/L, vn = (me.vu - th.vu)*nx + (me.vv - th.vv)*ny;
          if (vn > 0){ me.vu -= .82*vn*nx; me.vv -= .82*vn*ny; th.vu += .82*vn*nx; th.vv += .82*vn*ny; th.w = 260; me.w *= .3; hit = true; }
          const push = (31 - L)/2; me.u -= nx*push; me.v -= ny*push; th.u += nx*push; th.v += ny*push; }
        // over the real edge of the desk, the deskmate's eraser tips off and drops out of sight (nothing is drawn below the
        // top; the fall runs on a little below it, then it is gone)
        if (!th.fall && !ctx.onDesk(dk(th.u, th.v, 0))){ th.fall = true; fell = true; th.vz = 0; }
        if (th.fall && ZP + th.z > ctx.floorZ){ th.vz -= 2400*dt; th.z = Math.max(ctx.floorZ - ZP, th.z + th.vz*dt); th.u += th.vu*dt*.6; th.v += th.vv*dt*.6; }
        st.me = { u: me.u, v: me.v, h: me.h, p: 0, r: 0, lift: 0 };
        st.them = { u: th.u, v: th.v, h: th.h, p: th.fall ? Math.min(80, -th.z*1.5) : 0, r: 0, gone: th.fall && ZP + th.z <= BH - 70, zBase: th.fall ? ZP + th.z : undefined };
        const still = !th.fall && Math.hypot(me.vu, me.vv) < 1 && Math.hypot(th.vu, th.vv) < 1;
        if (still || st.them.gone) this.done = true; },
      end(){} });
    kPlay(ui, 'flick', segs, () => {
      st.over = st.me.u > 0;
      if (fell){ st.them.gone = true; st.flicks = 0; ui.flash('同桌的橡皮被弹下了桌——你赢了', 2400); }
      else if (shown && hit) ui.flash('名字被同桌看见了——传说失效', 2600);
      else if (st.over) ui.flash('你的橡皮过了三八线——按规矩归同桌了', 2400);
      else ui.flash(hit ? '撞上了！再弹一次' : '没够着', 1800); });
  }

  const __cfg = ({
    fig:'06', turn:'full', title:'橡皮', palette:'tomato',
    state:{ name: 'TA', me: { ...HOME }, them: { ...THEM_HOME, gone: false }, wear: 0, erased: 0, erasedCount: 0, page: 0,
      words: PAGES[0].map(() => ({ erased: 0, hole: false })), holes: [], crumbs: [], sleeve: 0, over: false, seed: 1, flicks: 0 },
    scene,
    stats: st => [ { label:'橡皮剩', value: Math.round(100*(EL - st.wear)/EL) + '%' }, { label:'擦掉', value: st.erasedCount + ' 个字', small: true } ],
    buttons:[
      { label:'擦掉', onClick: st => erase(st, false) },
      { label:'吹橡皮屑', onClick: blow },
      { label:'用力擦', onClick: st => erase(st, true) },
      { label:'抽出纸套', onClick: sleeve },
      { label:'弹橡皮', onClick: flick },
    ],
    acts:{ mine: st => erase(st, false), sheet: st => erase(st, false), sleeve: st => sleeve(st), them: st => flick(st) },
    params:(st, q) => {
      if (q.has('wear')) st.wear = +q.get('wear');
      if (q.has('erased')) for (let i = 0; i < Math.min(4, +q.get('erased')); i++){ st.words[i].erased = 1; st.erasedCount++; st.erased++; }
      if (q.has('crumbs')) for (let i = 0; i < +q.get('crumbs'); i++){ const [u, v] = onS4(WORD_PU + 4 + (i % 6)*6, WORD_PV[0] + Math.floor(i/6)*12); addCrumb(st, u, v, false); }
      if (q.has('hole')){ const [a, b] = wordLine(0, 1); st.words[1].hole = true; st.holes.push({ u: (a[0] + b[0])/2, v: (a[1] + b[1])/2, w: Math.hypot(b[0] - a[0], b[1] - a[1])/2 + 2, hh: 5.2, seed: 7 }); }
      if (q.has('sleeve')) st.sleeve = Math.max(0, Math.min(1, +q.get('sleeve')));
      if (q.get('pose') === 'erase'){ const [a] = wordLine(0, 0), [u, v] = erCentreFor({ ...ERASE_ANG, wear: st.wear, sleeveOn: true, sOff: -st.sleeve*SL_OFF }, a[0], a[1]); st.me = { u, v, ...ERASE_ANG }; }
      if (q.get('pose') === 'over'){ st.me = { u: 14, v: -8, h: 70, p: 0, r: 0 }; st.over = true; }
      if (q.get('them') === 'gone') st.them.gone = true;
    },
  });

  return ctx.adapt(__cfg, { seeThrough: false });
}
