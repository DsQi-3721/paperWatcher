// Fig. 16 闹钟 — desk-scene object (written for the desk: no standalone page).
// Its code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*), ctx.ui its ui
// (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are collected by the scene.
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: -500, v: 300, rot: 12 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 16 — Twin-bell alarm clock (双铃闹钟): the classic wind-up alarm clock on the student's half of the desk, its dial
     to the student. It keeps the real time (the hands are redrawn every minute while someone looks). Clock terms: x across
     the dial (to its right), y up, w out of the dial; desk terms as usual; 1 unit = 1 mm.

     How it really works:
     1. Two mainsprings, each a long flat steel spiral round its own arbor between the movement's two brass plates: one
        drives the clock, one the alarm. Each is wound by its butterfly key on the back (a ratchet clicks, so it cannot
        unwind backwards); a full wind runs the clock about a day and a half.
     2. Going train: the time spring turns the great wheel, which turns the centre wheel (once an hour: the minute hand's
        arbor), the third wheel, the fourth wheel and the escape wheel. The pallet fork lets the escape wheel through half
        a tooth at a time and kicks the balance wheel, which swings to and fro on its hairspring about two and a half
        times a second: the tick.
     3. Motion work, in front of the front plate: the cannon pinion on the centre arbor, the minute wheel and the hour
        wheel (carrying the hour hand, twelve times slower). The setting knob on the back turns the centre arbor (to set
        the time); the alarm-set knob turns the alarm-set wheel (the alarm hand) through its pinion.
     4. The alarm: the hour wheel has a pin, the alarm-set wheel a notch. When they meet, the hour wheel drops forward and
        frees the alarm train: the alarm spring spins the alarm wheels, and the alarm escape wheel rocks the hammer
        lever, whose arm sticks out of the top and beats between the two bells (about twenty strokes a second). The stop
        lever on top blocks the hammer.
     5. The bells are steel domes on posts screwed into the case; the case stands on two splayed feet. Ringing shakes it,
        and on a hard desk it walks.
     Student life: hitting the stop lever and sleeping "five more minutes" (it rings again), setting it ten minutes fast
     to trick yourself into getting up (and still sleeping the ten minutes), and the morning it rings and rings.

     Parts:
     CASE      drum . back cover (with its printing) . bezel . dial (numerals, minute ring, name) . crystal . two feet
               (legs and pads) . bell posts . two bells and their nuts . hammer arm and striker . stop lever
     HANDS     hour hand . minute hand . alarm hand . centre boss
     BACK      time key . alarm key . setting knob . alarm-set knob
     MOVEMENT  front plate . back plate . four pillars . time mainspring . alarm mainspring . great wheel . centre wheel
               and pinion . third wheel . fourth wheel . escape wheel . pallet fork . balance wheel . hairspring .
               alarm great wheel . alarm intermediate wheel . alarm escape wheel . hammer lever . cannon pinion .
               minute wheel . hour wheel . alarm-set wheel (the trip cam) . alarm-set pinion . arbors */

  /* ---------- sizes (clock terms, mm) ---------- */
  const BH = ctx.deskZ, Z_UP = [0, 0, 1];
  const R = 48, WD = 20, CY = 56.4;                                   // case radius, half depth; case centre above the soles
  const BEZ = { r0: 42.6, r1: 49.6, w0: 18.6, w1: 23.2 }, DIAL_W = 17.4, GLASS_W = 22.4;
  const BELL = { a: Math.PI/6, d: 54, r: 24, h: 18 };                 // axis angle from up, rim centre from the case centre, rim radius, height
  const HL = { x: 6, y: 30, w: 4.6 }, STRIKE = [0, 58.8], SR = 3.2;   // hammer lever pivot, striker centre, its radius
  const SWING = (6.2 - SR - .2)/Math.hypot(STRIKE[0] - HL.x, STRIKE[1] - HL.y);   // the lever's swing (rad) to touch each bell
  const FOOT = { a: 35*Math.PI/180, r: 64, ru: 5.6, rw: 11, h: 4 };   // feet: angle from down, pad centre from the case centre, pad half sizes
  const KEY_T = [-11.3, -11.3], KEY_A = [11.3, -11.3], KNOB_S = [0, 0], KNOB_A = [7.3, 12.6];
  const LEVER = { a: -20*Math.PI/180, w: -9 };                        // the stop lever on top (angle from up), its depth
  const RED = '#d8453a', DIALC = { l: '#fbf6e6', m: '#ece4cf', d: '#cbc1a8' }, BRASS = MAT.brass, STEEL = MAT.steel;
  const KAI = "'Kaiti SC','STKaiti','KaiTi','Songti SC',serif";

  /* ---------- where the clock is: its axes on the desk (turned, walked, rocked by ringing) ---------- */
  function pose(st){
    const t = st.turn + st.jt, c = Math.cos(t), s = Math.sin(t), r = st.rock;
    const X0 = dkv(c, s, 0), W0 = dkv(-s, c, 0);
    return { AX: kAdd(kScl(X0, Math.cos(r)), kScl(Z_UP, Math.sin(r))), AY: kAdd(kScl(X0, -Math.sin(r)), kScl(Z_UP, Math.cos(r))), AW: W0,
      O: dk(st.walk[0] + st.ju[0], st.walk[1] + st.ju[1], BH + st.hop) };
  }
  // a clock point (x across the dial, y up from the case centre, w out of the dial) in the world
  const CL = (q, x, y, w) => [0, 1, 2].map(i => q.O[i] + q.AX[i]*x + q.AY[i]*(y + CY) + q.AW[i]*w);
  const CLv = (q, x, y, w) => [0, 1, 2].map(i => q.AX[i]*x + q.AY[i]*y + q.AW[i]*w);
  const ringAt = (q, cx, cy, r, w, n = 32, ph = 0) => Array.from({ length: n }, (_, i) => { const t = ph + i/n*2*Math.PI; return CL(q, cx + r*Math.cos(t), cy + r*Math.sin(t), w); });
  // text lying on the dial (reading across it) or on the back cover (reading across it for someone behind)
  const dialTx = (q, x, y, w, str, size, col = INK, weight = 800, font = "ui-monospace,Menlo,'PingFang SC',monospace") =>
    `<text transform="${txM(P(...CL(q, x, y, w)), Dv(...q.AX), Dv(...kScl(q.AY, -1)))}" font-size="${f(size)}" fill="${col}" text-anchor="middle" font-family="${font}" font-weight="${weight}">${str}</text>`;
  const backTx = (q, x, y, str, size, col = INK, weight = 800) =>
    `<text transform="${txM(P(...CL(q, x, y, -WD - .05)), Dv(...kScl(q.AX, -1)), Dv(...kScl(q.AY, -1)))}" font-size="${f(size)}" fill="${col}" text-anchor="middle" font-family="${KAI}" font-weight="${weight}">${str}</text>`;

  /* ---------- the case ---------- */
  function drum(q, m){
    const A = ringAt(q, 0, 0, R, -WD, 36), B = ringAt(q, 0, 0, R, WD - 1.4, 36);
    let s = loft(A, B, n => tone(n, m));
    const back = kScl(q.AW, -1);
    if (vis(back)){ s += fill(pd(A), tone(back, m)) + ink(pd(A), 1);
      // pressed rings on the back cover
      for (const rr of [R - 4, 30]) s += `<path d="${pd(ringAt(q, 0, 0, rr, -WD - .03, 40))}" fill="none" stroke="${m.d}" stroke-width=".6" opacity=".55"/>`; }
    return s + hullInk([...A, ...B], 2.4);
  }
  const drumPts = q => [...ringAt(q, 0, 0, R, -WD, 16), ...ringAt(q, 0, 0, BEZ.r1, BEZ.w1, 16)];
  // the bezel, the dial behind the crystal; the hands go on top (handsSvg), the crystal last (glassSvg)
  function frontSvg(q){
    const F = q.AW;
    if (!vis(F)) return '';
    const o0 = ringAt(q, 0, 0, BEZ.r1, BEZ.w0, 36), o1 = ringAt(q, 0, 0, BEZ.r1, BEZ.w1, 36), i1 = ringAt(q, 0, 0, BEZ.r0, BEZ.w1, 36), i0 = ringAt(q, 0, 0, BEZ.r0, DIAL_W, 36);
    let s = loft(o0, o1, n => tone(n, METAL)) + loft(i1, i0, n => toneI(n, METAL), true);
    s += `<path d="${pd(o1)}${pd(i1.slice().reverse())}" fill="${tone(F, METAL)}" fill-rule="evenodd"/>` + ink(pd(o1), 1.1) + ink(pd(i1), .7);
    // the dial: minute ring, numerals, its name
    const D = ringAt(q, 0, 0, BEZ.r0, DIAL_W, 36);
    s += fill(pd(D), DIALC.l);
    let tk = '', tk5 = '';
    for (let i = 0; i < 60; i++){ const t = Math.PI/2 - i/60*2*Math.PI, c = Math.cos(t), sn = Math.sin(t), r0 = i % 5 ? 38.6 : 36.6;
      const seg = pd([CL(q, r0*c, r0*sn, DIAL_W + .03), CL(q, 40.6*c, 40.6*sn, DIAL_W + .03)], false); if (i % 5) tk += seg; else tk5 += seg; }
    s += `<path d="${tk}" fill="none" stroke="${INK}" stroke-width=".45"/><path d="${tk5}" fill="none" stroke="${INK}" stroke-width="1.2"/>`
      + `<path d="${pd(ringAt(q, 0, 0, 40.9, DIAL_W + .03, 48))}" fill="none" stroke="${INK}" stroke-width=".5"/>`;
    for (let i = 1; i <= 12; i++){ const t = Math.PI/2 - i/12*2*Math.PI, x = 30.5*Math.cos(t), y = 30.5*Math.sin(t);
      s += dialTx(q, x, y - 2.6, DIAL_W + .05, String(i), 7.4, INK, 800); }
    s += dialTx(q, 0, 14, DIAL_W + .05, '早起', 6.2, RED, 800, KAI) + dialTx(q, 0, -19.5, DIAL_W + .05, 'MECHANICAL · 双铃', 2.6, mix(INK, '#ffffff', .3), 700);
    return s;
  }
  function glassSvg(q){
    if (!vis(q.AW)) return '';
    const G = ringAt(q, 0, 0, BEZ.r0 - .3, GLASS_W, 40), arc = (r0, a0, a1) => { const out = []; for (let i = 0; i <= 8; i++){ const t = a0 + (a1 - a0)*i/8; out.push(CL(q, r0*Math.cos(t), r0*Math.sin(t), GLASS_W + .05)); } return out; };
    return `<path d="${pd(G)}" fill="${CLEAR.l}" opacity=".16"/>`
      + `<path d="${pd(arc(36, 2.2, 2.9), false)}" fill="none" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round" opacity=".42"/>`
      + `<path d="${pd(arc(31, 2.35, 2.6), false)}" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity=".38"/>`;
  }
  // hand shapes (along the hand: s from the centre; half widths), drawn on the dial at depth w
  const HAND_H = [[-6, 1.5], [4, 1.9], [13, 2.3], [16, 3.4], [19.5, 1.8], [23.5, 0]];
  const HAND_M = [[-8, 1.3], [6, 1.5], [30, 1.3], [35.5, 0]];
  const HAND_A = [[-4, .8], [16, .8], [16, 2.2], [20.5, 0]];
  function handShape(q, prof, ang, w){
    const dx = Math.sin(ang), dy = Math.cos(ang), px = Math.cos(ang), py = -Math.sin(ang), L = [], Rr = [];
    for (const [sx, hw] of prof){ L.push(CL(q, dx*sx - px*hw, dy*sx - py*hw, w)); Rr.push(CL(q, dx*sx + px*hw, dy*sx + py*hw, w)); }
    return [...L, ...Rr.reverse()];
  }
  function handsSvg(q, st){
    if (!vis(q.AW)) return '';
    const { h, mi } = shown(st), aM = mi/60*2*Math.PI, aH = (h % 12 + mi/60)/12*2*Math.PI, aA = st.alarm/720*2*Math.PI;
    const al = handShape(q, HAND_A, aA, DIAL_W + .9), hh = handShape(q, HAND_H, aH, DIAL_W + 1.6), mm = handShape(q, HAND_M, aM, DIAL_W + 2.3);
    let s = fill(pd(al), st.alarmOn ? RED : mix(RED, '#ffffff', .35)) + ink(pd(al), .5);
    s += fill(pd(hh), '#2a2622') + ink(pd(hh), .6) + fill(pd(mm), '#2a2622') + ink(pd(mm), .6);
    const boss = ringAt(q, 0, 0, 2.6, DIAL_W + 2.6, 14), pin = ringAt(q, 0, 0, 1.1, DIAL_W + 2.8, 10);
    return s + fill(pd(boss), '#3a3532') + ink(pd(boss), .5) + fill(pd(pin), METAL.m);
  }
  // the time it shows: the real time, plus however fast it has been set (and a turn of the setting knob in progress)
  function shown(st){ const d = new Date(), mins = d.getHours()*60 + d.getMinutes() + d.getSeconds()/60 + st.fast + st.fastAnim;
    const t = ((mins % 1440) + 1440) % 1440; return { h: Math.floor(t/60), mi: t % 60, mins: t }; }
  const hhmm = mins => { const t = ((Math.round(mins) % 1440) + 1440) % 1440; return `${Math.floor(t/60)}:${String(t % 60).padStart(2, '0')}`; };

  /* ---------- the bells, the hammer, the stop lever, the feet ---------- */
  function bellAxis(q, side){ return norm(CLv(q, side*Math.sin(BELL.a), Math.cos(BELL.a), 0)); }
  function bellSvg(q, side, st){
    const A = bellAxis(q, side), base = CL(q, 0, 0, 0), at = s => kAdd(base, kScl(A, s));
    const prof = []; for (let i = 0; i <= 6; i++){ const t = i/6, s = BELL.d + BELL.h*t; prof.push([s, BELL.r*Math.sqrt(Math.max(0, 1 - t*t*.93))]); }
    const rings = prof.map(([s, r]) => axisRing(at(s), A, Math.max(.6, r), 22));
    let inner = '', outer = '';
    for (let i = 0; i < rings.length - 1; i++){ inner += loft(rings[i], rings[i + 1], n => toneI(n, METAL), true); outer += loft(rings[i], rings[i + 1], n => tone(n, METAL)); }
    // the crown closes the dome (the nut sits on it)
    const crown = rings[rings.length - 1];
    if (vis(A)) outer += fill(pd(crown), tone(A, METAL));
    else inner = fill(pd(crown), toneI(kScl(A, -1), METAL)) + inner;
    // the post from the case into the bell, and the nut on its crown
    const post = coaxSeg(at(0), A, { s0: R - 2, s1: BELL.d + 2, r0: 2.2, M: STEEL, n: 12, w: .7 });
    const nut = coaxSeg(at(0), A, { s0: BELL.d + BELL.h - .5, s1: BELL.d + BELL.h + 3, r0: 3, M: STEEL, n: 6, w: .7, edges: .5 });
    const mouthVis = vis(kScl(A, -1));
    let s = post + inner + (mouthVis ? ink(pd(rings[0]), .9) : '') + outer + nut + hullInk(rings.flat(), 1.5);
    if (!mouthVis) s += ink(pd(rings[0]), .9);
    return s;
  }
  // ringing: comic vibration arcs round each bell's outer side, flickering with the strokes (drawn on screen)
  function ringLines(q, st){
    if (!(st.ring && st.ring.on)) return '';
    const [Xc, Yc] = P(...CL(q, 0, 20, 0)), flick = Math.floor(st.ring.t*14) % 2, k = st.ring.k;
    let d = '';
    for (const side of [-1, 1]){
      const A = bellAxis(q, side), [Xb, Yb] = P(...kAdd(CL(q, 0, 0, 0), kScl(A, BELL.d + BELL.h*.35))), a0 = Math.atan2(Yb - Yc, Xb - Xc);
      for (let i = flick; i < 3 + flick; i++){ const rr = CAM_K*(BELL.r + 4 + i*4.6*k), sp = .55 - i*.09;
        const x0 = Xb + rr*Math.cos(a0 - sp), y0 = Yb + rr*Math.sin(a0 - sp), x1 = Xb + rr*Math.cos(a0 + sp), y1 = Yb + rr*Math.sin(a0 + sp);
        d += `M${f(x0)} ${f(y0)}A${f(rr)} ${f(rr)} 0 0 1 ${f(x1)} ${f(y1)}`; }
    }
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>`;
  }
  const bellPts = (q, side) => { const A = bellAxis(q, side), c = kAdd(CL(q, 0, 0, 0), kScl(A, BELL.d)); return axisRing(c, A, BELL.r, 10).concat([kAdd(c, kScl(A, BELL.h + 3))]); };
  // the hammer lever's arm out of the top slot, its striker between the bells
  function hammerTip(st){ const a = st.ham*SWING, dx = STRIKE[0] - HL.x, dy = STRIKE[1] - HL.y; return [HL.x + dx*Math.cos(a) - dy*Math.sin(a), HL.y + dx*Math.sin(a) + dy*Math.cos(a)]; }
  function hammerSvg(q, st){
    const [tx, ty] = hammerTip(st), slotY = 47.6, k = (slotY - HL.y)/(ty - HL.y), sx = HL.x + (tx - HL.x)*k;
    const arm = rod(CL(q, sx, slotY, HL.w), CL(q, tx, ty - SR*.6, HL.w), .9, STEEL, toneI, .7);
    return arm + ball(CL(q, tx, ty, HL.w), SR, STEEL);
  }
  function leverSvg(q, st){
    const a = LEVER.a, r0 = R - 1, r1 = R + 9 - 3*st.press, dir = [Math.sin(a), Math.cos(a)];
    const p0 = CL(q, dir[0]*r0, dir[1]*r0, LEVER.w), p1 = CL(q, dir[0]*r1, dir[1]*r1, LEVER.w), d3 = norm(kSub3(p1, p0));
    return rod(p0, p1, 1.4, STEEL, toneI, .7) + coaxSeg(p1, d3, { s0: 0, s1: 2, r0: 4.4, r1: 4, M: DARK, n: 16, w: .8 });
  }
  const kSub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  // a steel ball: a sphere is a circle from every side (lit from the upper left like the rest)
  function ball(c, r, M){
    const [X, Y] = P(...c), rr = CAM_K*r;
    return `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(rr)}" fill="${M.m}"/><circle cx="${f(X - rr*.32)}" cy="${f(Y - rr*.32)}" r="${f(rr*.48)}" fill="${M.l}"/>`
      + `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(rr)}" fill="none" stroke="${INK}" stroke-width=".9"/>`;
  }
  function feetSvg(q){
    let s = '';
    for (const side of [-1, 1]){
      const dx = side*Math.sin(FOOT.a), dy = -Math.cos(FOOT.a);
      const pc = [dx*FOOT.r, dy*FOOT.r], y0 = -CY, y1 = -CY + FOOT.h;
      const ell = y => Array.from({ length: 18 }, (_, i) => { const t = i/18*2*Math.PI; return CL(q, pc[0] + FOOT.ru*Math.cos(t), y, FOOT.rw*Math.sin(t)); });
      const A = ell(y0), B = ell(y1);
      s += rod(CL(q, dx*(R - 3), dy*(R - 3), 0), CL(q, pc[0], y1 + 1, 0), 2.4, STEEL, toneI, .8);
      s += loft(A, B, n => toneI(n, DARK)) + (vis(q.AY) ? fill(pd(B), DARK.l) + ink(pd(B), .6) : '') + hullInk([...A, ...B], 1);
    }
    return s;
  }
  const feetPts = q => { const out = []; for (const side of [-1, 1]){ const x = side*Math.sin(FOOT.a)*FOOT.r; out.push(CL(q, x - FOOT.ru, -CY, -FOOT.rw), CL(q, x + FOOT.ru, -CY, FOOT.rw)); } return out; };

  /* ---------- the back: keys and knobs ---------- */
  function keySvg(q, at, ang){
    const [x, y] = at, b0 = -WD, b1 = -WD - 8, back = kScl(q.AW, -1);
    const stem = coaxSeg(CL(q, x, y, b0), back, { s0: 0, s1: 8, r0: 2.2, M: STEEL, n: 12, w: .7 });
    // the butterfly key: a flat blade across its stem, two rounded wings
    const ca = Math.cos(ang), sa = Math.sin(ang), wing = [];
    for (let i = 0; i <= 16; i++){ const t = i/16*2*Math.PI, r = 4 + 5.5*Math.abs(Math.cos(t))**.6; wing.push([r*Math.cos(t), (3.2 + 2.4*Math.abs(Math.cos(t)))*Math.sin(t)]); }
    const pts = wbk => wing.map(([a, bb]) => CL(q, x + a*ca - bb*sa, y + a*sa + bb*ca, wbk));
    const A = pts(b1), B = pts(b1 - 1.6);
    const cap = vis(back) ? B : A, cn = vis(back) ? back : q.AW;
    const blade = loft(A, B, n => toneI(n, STEEL)) + fill(pd(cap), toneI(cn, STEEL)) + ink(pd(cap), .7);
    return vis(back) ? stem + blade : blade + stem;
  }
  function knobSvg(q, at, r, ang, M){
    const [x, y] = at, back = kScl(q.AW, -1);
    let s = coaxSeg(CL(q, x, y, -WD), back, { s0: 0, s1: 6, r0: r, r1: r*.92, M, n: 18, w: .8, edges: .4, phase: ang });
    return s;
  }
  function backSvg(q, st){
    const back = kScl(q.AW, -1);
    let print = '';
    if (vis(back)) print = backTx(q, KEY_T[0], KEY_T[1] - 13, '走时', 3.6, INK) + backTx(q, KEY_A[0], KEY_A[1] - 13, '闹铃', 3.6, INK)
      + backTx(q, 0, -9.6, '拨针', 3, INK) + backTx(q, KNOB_A[0], KNOB_A[1] + 7.5, '定闹', 3, INK);
    const parts = [ act('key', keySvg(q, KEY_T, st.keyT)), act('key', keySvg(q, KEY_A, st.keyA)),
      knobSvg(q, KNOB_S, 5.2, st.knobS, DARK), knobSvg(q, KNOB_A, 4, st.knobA, DARK) ];
    return vis(back) ? print + parts.join('') : parts.join('');
  }

  /* ---------- the movement (see-through) ---------- */
  const MV = {
    G:  { x: -11.3, y: -11.3, r: 12.6, n: 40, w: -4.3 },  C:  { x: 0, y: 0, r: 12.5, n: 36, w: 1.5, pr: 3.4, pw: -4.3 },
    T3: { x: -8.9, y: 12.7, r: 9.5, n: 30, w: 4.9, pr: 3, pw: 1.5 }, T4: { x: -19.4, y: 18.8, r: 7.5, n: 24, w: -.1, pr: 2.6, pw: 4.9 },
    E:  { x: -17.7, y: 28.3, r: 6, n: 15, w: 3.6, pr: 2.2, pw: -.1, club: true },
    AG: { x: 11.3, y: -11.3, r: 12, n: 38, w: -4.3 },      AI: { x: 16, y: 2.8, r: 8.5, n: 26, w: .7, pr: 3, pw: -4.3 },
    AE: { x: 17.5, y: 14, r: 6, n: 12, w: 3.6, pr: 2.4, pw: .7, club: true },
    CP: { x: 0, y: 0, r: 3, n: 10, w: 12.6 },              MW: { x: 10.4, y: -6, r: 9, n: 30, w: 12.6, pr: 2.5, pw: 13.4 },
    HW: { x: 0, y: 0, r: 9.5, n: 32, w: 13.4 },            AC: { x: 0, y: 0, r: 10.4, n: 34, w: 14.4, notch: true },
    AK: { x: 7.3, y: 12.6, r: 4.2, n: 12, w: 14.4 },
  };
  const BAL = { x: -26, y: 20, r: 8.5, w: 6.8 }, PF = { x: -17.7, y: 36.5, w: 5 };
  const PLATES = [{ w: 8.6, t: 1.2 }, { w: -11.4, t: 1.2 }], PILLARS = [[-30, -22], [30, -22], [-26, 36], [26, 36]];
  const plateShape = (q, w) => rrUV(-34, -26, 34, 40, 11, 6).map(([x, y]) => CL(q, x, y, w));
  // a wheel: a toothed disc (its far face a shade darker, as its thickness), four crossings, a hub
  function wheel(q, g, ang, M = BRASS, frontFace = true){
    const T = .9, wf = frontFace ? g.w + T/2 : g.w - T/2, wb = frontFace ? g.w - T/2 : g.w + T/2, ring = (w) => {
      const out = []; for (let i = 0; i < g.n; i++){ const a0 = ang + i/g.n*2*Math.PI, da = 2*Math.PI/g.n;
        const prof = g.club ? [[0, g.r - 1.4], [.1, g.r], [.32, g.r - .3], [.55, g.r - 1.6]] : [[0, g.r - 1], [.18, g.r], [.48, g.r], [.66, g.r - 1]];
        for (const [fa, rr] of prof){ const a = a0 + fa*da; out.push(CL(q, g.x + rr*Math.cos(a), g.y + rr*Math.sin(a), w)); } } return out; };
    const F = ring(wf), Bk = ring(wb);
    let s = fill(pd(Bk), M.d) + fill(pd(F), M.l) + ink(pd(F), .35);
    if (g.r > 5.5){   // crossings: four spokes left between windows
      let win = ''; const ri = g.r*.3, ro = g.r - 2.2;
      for (let k = 0; k < 4; k++){ const a0 = ang + k*Math.PI/2 + .32, a1 = ang + (k + 1)*Math.PI/2 - .32, pts = [];
        for (let j = 0; j <= 5; j++){ const a = a0 + (a1 - a0)*j/5; pts.push(CL(q, g.x + ro*Math.cos(a), g.y + ro*Math.sin(a), wf + .02)); }
        for (let j = 5; j >= 0; j--){ const a = a0 + (a1 - a0)*j/5; pts.push(CL(q, g.x + ri*Math.cos(a), g.y + ri*Math.sin(a), wf + .02)); }
        win += pd(pts); }
      s += `<path d="${win}" fill="${M.d}" opacity=".85"/>`;
    }
    if (g.notch){ const a = ang + 1.1, pts = [[g.r + .2, -.12], [g.r - 3.2, -.07], [g.r - 3.2, .07], [g.r + .2, .12]].map(([r, da]) => CL(q, g.x + r*Math.cos(a + da), g.y + r*Math.sin(a + da), wf + .03));
      s += fill(pd(pts), '#2b2826'); }
    const hub = ringAt(q, g.x, g.y, Math.max(1.1, g.r*.16), wf + .04, 12);
    return s + fill(pd(hub), STEEL.m) + ink(pd(hub), .35);
  }
  const pinion = (q, x, y, r, n, w, ang, fr = true) => wheel(q, { x, y, r, n, w }, ang, STEEL, fr);
  function spiral(q, x, y, r0, r1, turns, w, ph){
    const pts = [], N = Math.round(turns*36);
    for (let i = 0; i <= N; i++){ const t = i/N, a = ph + t*turns*2*Math.PI, r = r0 + (r1 - r0)*t; pts.push(CL(q, x + r*Math.cos(a), y + r*Math.sin(a), w)); }
    const d = pd(pts, false);
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${STEEL.l}" stroke-width=".7" stroke-linejoin="round"/>`;
  }
  function movementSvg(q, st){
    const fr = vis(q.AW), items = [], add = (w, svg) => items.push({ w, svg });
    const r = st.rot;     // wheel angles
    // arbors first: thin steel pins between the plates
    let arb = '';
    for (const g of [MV.G, MV.C, MV.T3, MV.T4, MV.E, MV.AG, MV.AI, MV.AE, BAL, PF, HL, MV.AK, MV.MW])
      arb += rod(CL(q, g.x, g.y, PLATES[1].w), CL(q, g.x, g.y, g.x === 0 && g.y === 0 ? DIAL_W - .2 : g === MV.AK || g === MV.MW ? 15.2 : PLATES[0].w), .4, { l: STEEL.m, m: STEEL.d, d: '#6f777a' }, toneI, .25);
    add(-99, arb);
    for (const [i, pl] of PLATES.entries()){ const sh = plateShape(q, pl.w), holes = [MV.G, MV.C, MV.T3, MV.T4, MV.E, MV.AG, MV.AI, MV.AE, BAL, PF, HL];
      add(pl.w, `<g opacity="${i ? .5 : .32}"><path d="${pd(sh)}" fill="${BRASS.m}"/></g>` + ink(pd(sh), .7)
        + holes.map(g => ink(pd(ringAt(q, g.x, g.y, 1.4, pl.w + (fr ? .05 : -.05), 10)), .4)).join('')); }
    for (const [x, y] of PILLARS) add(-1.4, rod(CL(q, x, y, PLATES[1].w), CL(q, x, y, PLATES[0].w), 1.6, BRASS, toneI, .6));
    add(-8.4, spiral(q, KEY_T[0], KEY_T[1], 2.6, 12 - 1.6*st.windT, 4 + 3*st.windT, -8.4, r.S1));
    add(-8.4, spiral(q, KEY_A[0], KEY_A[1], 2.6, 11.5 - 1.6*st.windA, 4 + 3*st.windA, -8.4, r.S2));
    add(MV.G.w, wheel(q, MV.G, r.G, BRASS, fr));
    add(MV.C.pw, pinion(q, 0, 0, MV.C.pr, 9, MV.C.pw, r.C, fr)); add(MV.C.w, wheel(q, MV.C, r.C, BRASS, fr));
    add(MV.T3.pw, pinion(q, MV.T3.x, MV.T3.y, MV.T3.pr, 8, MV.T3.pw, r.T3, fr)); add(MV.T3.w, wheel(q, MV.T3, r.T3, BRASS, fr));
    add(MV.T4.pw, pinion(q, MV.T4.x, MV.T4.y, MV.T4.pr, 7, MV.T4.pw, r.T4, fr)); add(MV.T4.w, wheel(q, MV.T4, r.T4, BRASS, fr));
    add(MV.E.pw, pinion(q, MV.E.x, MV.E.y, MV.E.pr, 6, MV.E.pw, r.E, fr)); add(MV.E.w, wheel(q, MV.E, r.E, STEEL, fr));
    add(MV.AG.w, wheel(q, MV.AG, r.AG, BRASS, fr));
    add(MV.AI.pw, pinion(q, MV.AI.x, MV.AI.y, MV.AI.pr, 8, MV.AI.pw, r.AI, fr)); add(MV.AI.w, wheel(q, MV.AI, r.AI, BRASS, fr));
    add(MV.AE.pw, pinion(q, MV.AE.x, MV.AE.y, MV.AE.pr, 7, MV.AE.pw, r.AE, fr)); add(MV.AE.w, wheel(q, MV.AE, r.AE, STEEL, fr));
    // motion work in front of the front plate, the alarm-set wheel with its notch, the alarm-set pinion
    add(MV.CP.w, pinion(q, 0, 0, MV.CP.r, MV.CP.n, MV.CP.w, r.C, fr));
    add(MV.MW.w, wheel(q, MV.MW, r.MW, BRASS, fr)); add(MV.MW.pw, pinion(q, MV.MW.x, MV.MW.y, MV.MW.pr, 8, MV.MW.pw, r.MW, fr));
    add(MV.HW.w, wheel(q, MV.HW, r.HW, BRASS, fr)); add(MV.AC.w, wheel(q, MV.AC, r.AC, BRASS, fr)); add(MV.AK.w, pinion(q, MV.AK.x, MV.AK.y, MV.AK.r, MV.AK.n, MV.AK.w, r.AK, fr));
    // pallet fork: the anchor's two pallets on the escape wheel, its tail to the balance
    const pf = st.pf, pa = (x, y) => { const c = Math.cos(pf), s2 = Math.sin(pf), dx = x - PF.x, dy = y - PF.y; return CL(q, PF.x + dx*c - dy*s2, PF.y + dx*s2 + dy*c, PF.w); };
    const anchor = [pa(-24, 30.8), pa(-22.4, 30.2), pa(-18.6, 35), pa(-13, 30.2), pa(-11.4, 30.8), pa(-16.6, 37.8), pa(-18.8, 37.8)];
    add(PF.w, fill(pd(anchor), STEEL.m) + ink(pd(anchor), .5) + rod(pa(-17.7, 36.5), pa(-24.6, 25.4), .6, STEEL, toneI, .4) + fill(pd([pa(-18.4, 30.4), pa(-17.6, 30.4), pa(-17.6, 31.6), pa(-18.4, 31.6)]), RED));
    // balance: rim, two arms, the hairspring at its centre
    const bw = BAL.w, rimO = ringAt(q, BAL.x, BAL.y, BAL.r, bw, 28, st.bal), rimI = ringAt(q, BAL.x, BAL.y, BAL.r - 1.4, bw, 28, st.bal);
    let bs = `<path d="${pd(rimO)}${pd(rimI.slice().reverse())}" fill="${BRASS.l}" fill-rule="evenodd"/>` + ink(pd(rimO), .6) + ink(pd(rimI), .4);
    for (const a of [st.bal, st.bal + Math.PI]) bs += rod(CL(q, BAL.x, BAL.y, bw), CL(q, BAL.x + (BAL.r - 1)*Math.cos(a), BAL.y + (BAL.r - 1)*Math.sin(a), bw), .55, BRASS, toneI, .4);
    bs += spiral(q, BAL.x, BAL.y, 1, 5, 4, bw + .6, st.bal*.3);
    add(bw, bs);
    // the hammer lever inside: its pivot, its anchor on the alarm escape wheel, its arm up to the slot
    const ha = st.ham*SWING, hp = (x, y) => { const c = Math.cos(ha), s2 = Math.sin(ha), dx = x - HL.x, dy = y - HL.y; return CL(q, HL.x + dx*c - dy*s2, HL.y + dx*s2 + dy*c, HL.w); };
    const hanc = [hp(5, 31.5), hp(7, 31.5), hp(13.6, 19.4), hp(12.2, 18.6), hp(6.6, 28.6), hp(5.4, 28.6)];
    add(HL.w, fill(pd(hanc), STEEL.m) + ink(pd(hanc), .5) + rod(hp(HL.x, HL.y), hp(1.8, 47.6), .9, STEEL, toneI, .5) + rod(hp(12.9, 19), hp(18.6, 17), .7, STEEL, toneI, .4));
    items.sort((a, b) => fr ? a.w - b.w : b.w - a.w);
    return items.map(x => x.svg).join('');
  }

  /* ---------- the scene ---------- */
  const boxOf = (pts, r = 0) => [[0, 1, 2].map(i => Math.min(...pts.map(p => p[i])) - r), [0, 1, 2].map(i => Math.max(...pts.map(p => p[i])) + r)];
  function scene(st, m){
    ctx.later(60000 - (Date.now() % 60000) + 80, undefined, 'minute');
    const k = ease(st.xr || 0);
    if (st.xrT === 1 && !st.ticking) startTicking(st);
    const q = pose(st);
    let s = castShadow([...drumPts(q), ...bellPts(q, -1), ...bellPts(q, 1), ...feetPts(q)], BH);
    const front = vis(q.AW), back = vis(kScl(q.AW, -1));
    const top = byDepth([
      { at: CL(q, -BELL.d*Math.sin(BELL.a), BELL.d*Math.cos(BELL.a), 0), svg: act('bell', bellSvg(q, -1, st)) },
      { at: CL(q, BELL.d*Math.sin(BELL.a), BELL.d*Math.cos(BELL.a), 0), svg: act('bell', bellSvg(q, 1, st)) },
      { at: CL(q, 0, 52, HL.w), svg: hammerSvg(q, st) },
      { at: CL(q, R*Math.sin(LEVER.a), R*Math.cos(LEVER.a), LEVER.w), svg: act('stop', leverSvg(q, st)) } ]);
    const feet = feetSvg(q), keys = backSvg(q, st);
    const caseSvg = drum(q, m) + (front ? act('face', frontSvg(q)) : '');
    s += feet;
    if (!back) s += keys;
    if (k > 0){
      s += `<g opacity="${f(1 - .82*k)}">${caseSvg}${front ? handsSvg(q, st) + glassSvg(q) : ''}</g>`;
      s += `<g opacity="${f(k)}">${movementSvg(q, st)}</g>`;
      s += top + (back ? keys : '');
      if (front) s += handsSvg(q, st);
    } else {
      s += caseSvg + top + (front ? handsSvg(q, st) + glassSvg(q) : '') + (back ? keys : '');
    }
    s += ringLines(q, st);
    if (st.zz > 0) s += zzz(q, st.zz);
    s += labels(st, q, k);
    return s;
  }
  // "Zzz" rising from the clock while it is snoozed
  function zzz(q, t){
    let s = '';
    for (let i = 0; i < 3; i++){ const k = (t*1.2 + i/3) % 1, p = CL(q, -20 - 10*k + i*2, 74 + 26*k, 6), sz = 6 + 5*k;
      const [X, Y] = P(...p); s += `<text x="${f(X)}" y="${f(Y)}" font-size="${f(sz)}" fill="${INK}" opacity="${f(1 - k)}" font-family="ui-monospace,Menlo,monospace" font-weight="800">z</text>`; }
    return s;
  }
  function labels(st, q, k){
    const ringing = !!(st.ring && st.ring.on), B = [];
    if (k > .6) return zhCallouts([
      { at: CL(q, KEY_T[0] + 10, KEY_T[1] + 3, -8.4), text: '走时发条', on: st.winding === 'T' },
      { at: CL(q, KEY_A[0] - 9, KEY_A[1] - 4, -8.4), text: '闹铃发条', on: st.winding === 'A' || ringing },
      { at: CL(q, MV.C.x + 9, MV.C.y - 7, MV.C.w), text: '中心轮', on: !!st.ticking },
      { at: CL(q, MV.T3.x, MV.T3.y + 7, MV.T3.w), text: '三轮', on: !!st.ticking },
      { at: CL(q, MV.T4.x - 5, MV.T4.y, MV.T4.w), text: '四轮', on: !!st.ticking },
      { at: CL(q, MV.E.x + 4, MV.E.y + 3, MV.E.w), text: '擒纵轮', on: !!st.ticking },
      { at: CL(q, PF.x - 1, PF.y + 1, PF.w), text: '擒纵叉', on: !!st.ticking },
      { at: CL(q, BAL.x - BAL.r, BAL.y, BAL.w), text: '摆轮', on: !!st.ticking },
      { at: CL(q, BAL.x + 3, BAL.y + 1, BAL.w + .6), text: '游丝', on: !!st.ticking },
      { at: CL(q, MV.AE.x + 5, MV.AE.y, MV.AE.w), text: '闹铃擒纵轮', on: ringing },
      { at: CL(q, 3, 40, HL.w), text: '闹锤摆杆', on: ringing },
      { at: CL(q, 9, 3, MV.AC.w), text: '起闹凸轮', on: ringing },
      { at: CL(q, 30, -22, 0), text: '夹板', on: false } ], B);
    return zhCallouts([
      { at: kAdd(CL(q, 0, 0, 0), kScl(bellAxis(q, 1), BELL.d + 8)), text: '铃铛', on: ringing },
      { at: CL(q, ...hammerTip(st), HL.w), text: '闹锤', on: ringing },
      { at: CL(q, R*Math.sin(LEVER.a)*1.12, R*Math.cos(LEVER.a)*1.12, LEVER.w), text: '止闹杆', on: st.press > .1 },
      { at: CL(q, 14, 12, DIAL_W + 2), text: '分针', on: st.fastAnim !== 0 },
      { at: CL(q, -10, 4, DIAL_W + 1.6), text: '时针', on: st.fastAnim !== 0 },
      { at: CL(q, 8*Math.sin(st.alarm/720*2*Math.PI), 8*Math.cos(st.alarm/720*2*Math.PI), DIAL_W + .9), text: '闹针', on: st.setting },
      { at: CL(q, KEY_T[0], KEY_T[1], -WD - 9), text: '上弦钥匙', on: !!st.winding },
      { at: CL(q, KNOB_A[0], KNOB_A[1], -WD - 6), text: '定闹钮', on: st.setting },
      { at: CL(q, 0, 0, -WD - 6), text: '拨针钮', on: st.fastAnim !== 0 },
      { at: CL(q, Math.sin(FOOT.a)*FOOT.r, -CY + 2, 0), text: '钟脚', on: ringing } ], B);
  }

  /* ---------- the clock running: wheels, balance, ticks (only while the see-through is open) ---------- */
  function wheelAngles(st){
    const tt = st.tt, ticks = Math.floor(tt*5), beat = tt*5 - ticks;
    const E = -ticks*Math.PI/15 - Math.PI/15*Math.min(1, beat*6), T4 = -E*MV.E.pr/MV.T4.r, T3 = -T4*MV.T4.pr/MV.T3.r, C = -T3*MV.T3.pr/MV.C.r, G = -C*MV.C.pr/MV.G.r;
    const A = st.al, AE = A, AI = -AE*MV.AE.pr/MV.AI.r, AG = -AI*MV.AI.pr/MV.AG.r;
    st.rot = { E, T4, T3, C, G, S1: G, AE, AI, AG, S2: AG, MW: -C*MV.CP.r/MV.MW.r, HW: C/12, AC: st.alarm/720*2*Math.PI, AK: -st.alarm/720*2*Math.PI*MV.AC.r/MV.AK.r };
    st.bal = 3.5*Math.sin(2*Math.PI*2.5*tt);
    st.pf = (ticks % 2 ? 1 : -1)*.11*Math.min(1, beat*5);
  }
  function startTicking(st){
    st.ticking = true;
    ui.animate(dt => {
      st.tt += dt;
      wheelAngles(st);
      if (st.xrT !== 1 && (st.xr || 0) <= 0){ st.ticking = false; return false; }
      return true;
    });
  }

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { wind: '正在上弦', set: '正在拨闹针', fast: '正在拨针', snooze: '在赖床' };
  const ringing = st => !!(st.ring && st.ring.on);
  const busy = st => { if (ringing(st)) { ui.flash('我正在响！先按掉'); return true; } if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等我一下'); return true; };
  // ring: the hammer beats the bells, the clock shakes and walks; it stops when the alarm spring runs down or the lever is hit
  function ring(st, secs, anger = 1, done){
    const rnd = kRng(Math.floor(st.walkN++*7919 + 13));
    const dir = [rnd() - .5, rnd() - .5];
    st.ring = { on: true, t: 0, k: anger, secs };
    ui.animate(dt => {
      const r = st.ring;
      if (!r || !r.on){ settle(st); if (done) done(); return false; }
      r.t += dt;
      st.windA = Math.max(0, st.windA - dt*.035*anger);
      st.al += dt*40;
      wheelAngles(st);
      st.ham = Math.sin(r.t*2*Math.PI*19) > 0 ? 1 : -1;
      const a = anger;
      st.rock = (rnd() - .5)*.05*a; st.jt = (rnd() - .5)*.03*a; st.ju = [(rnd() - .5)*1.2*a, (rnd() - .5)*1.2*a]; st.hop = rnd()*.8*a;
      // it walks on the hard desk (never further than a few centimetres from where it stood)
      st.walk = [clampW(st.walk[0] + dir[0]*dt*14*a), clampW(st.walk[1] + dir[1]*dt*14*a)];
      st.turn += (dir[0] > 0 ? 1 : -1)*dt*.05*a;
      if (r.t >= r.secs || st.windA <= 0){ r.on = false; settle(st); if (st.windA <= 0) ui.flash('闹铃发条走完了……我响不动了'); if (done) done(); return false; }
      return true;
    });
  }
  const clampW = x => Math.max(-16, Math.min(16, x));
  function settle(st){ st.ham = 0; st.rock = 0; st.jt = 0; st.ju = [0, 0]; st.hop = 0; if (st.ring) st.ring.on = false; }
  function wind(st){ if (busy(st)) return;
    if (st.windT > .97 && st.windA > .97) return ui.flash('已经上满了，再拧发条要断了');
    const segs = [];
    const turns = (key, which, from, n) => { for (let i = 0; i < n; i++) segs.push({ ms: 230, start(){ st.winding = which; this.a0 = st[key]; this.w0 = st[from]; },
      step(k){ st[key] = this.a0 + Math.PI*ease(k); st[from] = Math.min(1, this.w0 + (1 - this.w0)/(n - i)*ease(k)); } },
      { ms: 70, step(){} }); };
    if (st.windT < .97) turns('keyT', 'T', 'windT', 5);
    if (st.windA < .97) turns('keyA', 'A', 'windA', 4);
    kPlay(ui, 'wind', segs, () => { st.winding = null; ui.flash('咔、咔、咔——上满了，够我走一天半'); });
  }
  const ALARMS = [[6, 0], [6, 30], [7, 0], [7, 30]];
  function setAlarm(st, h, mi){ if (busy(st)) return;
    const target = (h % 12)*60 + mi;
    kPlay(ui, 'set', [{ ms: 700, start(){ st.setting = true; this.a0 = st.alarm; this.k0 = st.knobA; let d = target - this.a0; while (d < 0) d += 720; this.d = d; },
      step(k){ st.alarm = (this.a0 + this.d*ease(k)) % 720; st.knobA = this.k0 - this.d/720*2*Math.PI*MV.AC.r/MV.AK.r*ease(k)*.25; },
      end(){ st.alarm = target; st.alarmOn = true; st.setting = false; st.alarmHM = [h, mi]; } }],
      () => ui.flash(`明早 ${h}:${String(mi).padStart(2, '0')} 叫你——起不来可别怪我`, 2400));
  }
  function ringNow(st){ if (busy(st)) return;
    if (st.windA < .08) return ui.flash('闹铃发条松了，我响不动——先上发条');
    ui.flash('叮铃铃铃铃——！起床了！', 1800);
    ring(st, 3, 1, () => { if (st.windA > 0) ui.flash('响完了。你醒了吗？'); });
  }
  function stop(st){
    if (!ringing(st)){ if (kBusy()) return ui.flash(BUSY[kBusy()] || '等我一下'); return ui.flash('我又没响，按我干嘛'); }
    st.ring.on = false;
    st.press = 1;
    let t = 0; ui.animate(dt => { t += dt; st.press = Math.max(0, 1 - t/.35); return t < .35; });
    ui.flash('好好好，不吵了');
  }
  // snooze: slap the lever, five "minutes" of Zzz, then it rings again, angrier
  function snooze(st){
    if (kBusy()) return ui.flash(BUSY[kBusy()] || '等我一下');
    if (st.windA < .15) return ui.flash('闹铃发条快没劲了，响不了两回——先上发条');
    const segs = [];
    if (!ringing(st)) segs.push({ ms: 900, start(){ ring(st, 30, 1); } });
    segs.push({ ms: 380, start(){ if (st.ring) st.ring.on = false; }, step(k){ st.press = k < .4 ? k/.4 : 1 - (k - .4)/.6; } },
      { ms: 1700, start(){ ui.flash('再睡五分钟……', 1500); }, step(k){ st.zz = k*2.2 + .001; }, end(){ st.zz = 0; } },
      { ms: 2300, start(){ ring(st, 2.3, 1.8); ui.flash('说好的五分钟呢？我又响了！叮铃铃铃——', 2600); }, step(){} });
    kPlay(ui, 'snooze', segs);
  }
  // set it ten minutes fast (the setting knob on the back), three times at most; a fourth turn puts it right again
  function fast10(st){ if (busy(st)) return;
    const back = st.fast >= 30, d = back ? -st.fast : 10;
    kPlay(ui, 'fast', [{ ms: 900, start(){ this.k0 = st.knobS; }, step(k){ st.fastAnim = d*ease(k); st.knobS = this.k0 + d/60*2*Math.PI*ease(k); },
      end(){ st.fast += d; st.fastAnim = 0; } }], () => {
      const real = shown({ fast: 0, fastAnim: 0 }).mins;
      if (back) ui.flash(`算了，拨回准点：现在真的是 ${hhmm(real)}`, 2400);
      else if (st.fast === 10) ui.flash('拨快十分钟——反正你知道我快，照样多睡十分钟', 2600);
      else ui.flash(`现在快了 ${st.fast} 分钟——自己骗自己`, 2400);
    });
  }
  function tellTime(st){
    if (ringing(st)) return stop(st);
    const t = shown(st).mins;
    ui.flash(st.fast ? `我显示 ${hhmm(t)}——其实我快了 ${st.fast} 分钟` : `现在 ${hhmm(t)}，${t < 360 ? '还早，再睡会儿' : t < 720 ? '该起了' : t < 1080 ? '下午了，别犯困' : '该写作业了'}`);
  }

  const __cfg = ({
    fig:'16', turn:'full', title:'闹钟', palette:'tomato',
    state:{ turn: 0, jt: 0, rock: 0, ju: [0, 0], hop: 0, walk: [0, 0], walkN: 0,
      windT: .55, windA: .6, keyT: .4, keyA: -.3, knobS: 0, knobA: 0, winding: null,
      alarm: 6*60 + 30, alarmOn: true, alarmHM: [6, 30], setting: false,
      fast: 0, fastAnim: 0, ring: null, ham: 0, press: 0, zz: 0,
      tt: 0, al: 0, bal: 0, pf: 0, ticking: false,
      rot: { E: 0, T4: 0, T3: 0, C: 0, G: 0, S1: 0, AE: 0, AI: 0, AG: 0, S2: 0, MW: 0, HW: 0, AC: 0, AK: 0 } },
    scene,
    buttons:[
      { label:'上发条', onClick: wind },
      { label:'定闹钟', choices: st => ALARMS.map(([h, mi]) => ({ label: `${h}:${String(mi).padStart(2, '0')}`, current: st.alarmOn && st.alarmHM[0] === h && st.alarmHM[1] === mi, onClick: st2 => setAlarm(st2, h, mi) })) },
      { label:'响铃', onClick: ringNow },
      { label:'按掉', onClick: stop },
      { label:'再睡五分钟', onClick: snooze },
      { label:'拨快十分钟', onClick: fast10 },
    ],
    acts:{ bell: st => ringNow(st), stop: st => stop(st), key: st => wind(st), face: st => tellTime(st) },
  });

  return ctx.adapt(__cfg, { seeThrough: true });
}
