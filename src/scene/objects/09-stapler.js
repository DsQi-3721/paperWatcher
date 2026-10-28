// Fig. 09 订书机 — desk-scene object, ported from stationery/src/09-stapler.html by scripts/port-figures.mjs.
// The figure's own code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*),
// ctx.ui its ui (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are
// collected by the scene.
import { S3_HOLD } from './14-clips.js';
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: 0, v: 0, rot: 0 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 09 — Desk stapler (订书机, 12# / 24/6 staples) beside the shared 期中考试 stack (S3), with a box of staples.
     This object's frame is the desk's own (PLACE 0, 0): u along the front edge, v toward the student. The stapler lies
     just right of S3, its nose toward the stack; it has its own frame: x from its front (x = 0) back to the hinge,
     y across, z up from the desk top; 1 unit = 1 mm.

     How it really works (each button is one of these):
     1. Load (装书钉): lift the top cover on its hinge pin; its link pulls the pusher back to the rear of the channel.
        Drop a strip of staples from the box astride the rail in the channel; close the cover and the pusher's spring
        shoves the strip forward until the front staple sits under the driver blade.
     2. Staple (订): press the cover. First cover and magazine go down together (the leaf return spring under the
        magazine gives) until the magazine's nose rests on the paper. Then the cover goes on alone (the cover spring
        gives): the driver blade shears the front staple off the strip and drives it down through the paper; its legs hit
        the two grooves in the anvil and curl inward under the paper. Let go: both springs lift everything, and the pusher
        moves the strip on by one staple (0.62 mm).
     3. With no paper the staple folds shut on the anvil itself and drops off (a wasted staple).
     4. A stack thicker than the 6 mm legs can pierce stops them on top: the driver buckles the staple and it jams in
        the nose; you have to open the cover and pick it out.
     On this desk: 订作业 slides the top two sheets of S3 into the throat and staples them along the right edge near the
     corner (the stapler slides along the edge to each spot); 订一沓卷子 slides most of the stack in at once: a 24/6 staple
     goes through about 20 sheets, more and its legs buckle and jam. Neither works while a binder clip or a paperclip holds
     the stack (14 says so through S3_HOLD).
     Student life: clicking it empty just to hear the 咔嚓, and trying to staple a whole stack of test papers at once.

     Parts:
     BASE      rubber foot . base plate . anvil with two clinch grooves . rear bracket (two cheeks) . hinge pin .
               leaf return spring and its rivet
     MAGAZINE  channel bottom . two side walls . nose plate . rail . staple strip . pusher (block, tab) . pusher spring .
               rear post . spring seat . cover spring
     COVER     shell (No.12 on the side) . two hinge flanges . driver blade
     DESK      the top sheets of S3 while they slide (staples left in them) . box of staples (strips) . wasted staples */

  /* ---------- desk ---------- */
  const BH = ctx.deskZ, Z0 = ctx.deskZ;
  const S3 = ctx.paper('S3');                                     // the 期中考试 stack: pu across, pv down the page
  const S3_TURN = Math.atan2(S3.DU[0], -S3.DU[1]);                // its turn on the desk (rad)
  const S3_N = Math.max(1, Math.round(S3.thick/.12));             // sheets in it

  /* ---------- stapler frame ---------- */
  const SU = 247, SV = 8, HX = 120, HZ = 19;                      // front of the base in desk terms; hinge pin (x, z)
  let svNow = 0;                                                   // how far the stapler has slid along the stack's edge (v)
  const spW = (x, y, z) => dk(SU + x, SV + svNow + y, Z0 + z);     // base frame -> world (z from the desk top)
  // a part turned about the hinge pin by a (rad, front up): its own point -> world, and its axes in world
  const spR = a => (x, y, z) => { const dx = x - HX, dz = z - HZ, c = Math.cos(a), s = Math.sin(a); return spW(HX + dx*c + dz*s, y, HZ - dx*s + dz*c); };
  const spAx = a => [kAdd(kScl(DU, Math.cos(a)), [0, 0, -Math.sin(a)]), DV, kAdd(kScl(DU, Math.sin(a)), [0, 0, Math.cos(a)])];
  const spZ = (a, x, z) => HZ - (x - HX)*Math.sin(a) + (z - HZ)*Math.cos(a);
  // the turn at which point (x, z) of a part comes down to height zt
  function spSolve(x, z, zt){ let lo = -.25, hi = 1; for (let i = 0; i < 44; i++){ const mid = (lo + hi)/2; if (spZ(mid, x, z) > zt) hi = mid; else lo = mid; } return (lo + hi)/2; }
  function spBox(a, x0, y0, z0, x1, y1, z1, M, shade = toneI, w = .8){ const [ax, ay, az] = spAx(a);
    return obox(spR(a)((x0 + x1)/2, (y0 + y1)/2, (z0 + z1)/2), ax, ay, az, (x1 - x0)/2, (y1 - y0)/2, (z1 - z0)/2, M, shade, w); }
  function spBoxPts(a, x0, y0, z0, x1, y1, z1){ const [ax, ay, az] = spAx(a);
    return oboxPts(spR(a)((x0 + x1)/2, (y0 + y1)/2, (z0 + z1)/2), ax, ay, az, (x1 - x0)/2, (y1 - y0)/2, (z1 - z0)/2); }

  const PITCH_S = .62, STRIP_N = 100, CAP_N = 180, X0 = 2.45;  // staple pitch, staples per strip, channel capacity, front staple
  const A_M0 = Math.asin(8/118);                                 // magazine at rest: nose 8 mm above the anvil
  const DLT0 = Math.asin(8.5/117.3);                             // cover above the magazine at rest (driver clear of the strip)
  const A_OPEN = 42*Math.PI/180;
  const ANVIL = 7.2, BLADE = [2.4, 3.0, 7.9];                    // anvil top; driver blade x0, x1, bottom (cover frame)
  const BASEM = matOf('#4a4642'), RECESS = '#2b2523', PUSHM = matOf('#3f4448'), BOXM = matOf('#f2c230');
  const HEAD_PROF = [[0, 21.5], [0, 29], [1.4, 33.6], [5.5, 37.4], [17, 40.6], [60, 43], [100, 42.6], [122, 39.6], [131, 34.5], [133, 27], [129, 21.5]];

  /* ---------- the papers ---------- */
  const HW_PINS = [S3.h - 10, S3.h - 34];                         // staple spots (pv) along S3's right edge, near its corner
  const THICK_PV = S3.h - 22;                                     // where 订一沓卷子 tries to staple
  const PIN_IN = 6.3;                                             // staples go 6.3 mm in from the paper's edge
  const BOX = [394, -11, 460, 7, 11];                             // box of staples: u0, v0, u1, v1, height
  const LOOSE_AT = [[262, 31, .3], [272, 36, 2.2], [283, 32, 1.1], [292, 37, 2.8], [303, 31, .7], [314, 35, 1.7]];

  /* ---------- drawing the stapler ---------- */
  // cover shell: the profile swept across y = -11..11; its open underside shows dark
  function coverShell(a, m){
    const R = spR(a), [ax, ay, az] = spAx(a), A = HEAD_PROF.map(([x, z]) => R(x, -11, z)), B = HEAD_PROF.map(([x, z]) => R(x, 11, z));
    let s = loft(A, B, n => dot(n, az) < -.9 ? RECESS : tone(n, m));
    for (const [cap, n] of [[A, kScl(ay, -1)], [B, ay]]) if (vis(n)) s += fill(pd(cap), tone(n, m)) + ink(pd(cap), 1.2);
    if (vis(ay)) s += txOn(R(70, 11.05, 28.6), ax, ay, 'No.12', 4.2, mix(m.m, '#000000', .5), 800);
    return s + hullInk([...A, ...B], 2.3);
  }
  // a staple standing in the column under the driver: crown top at ct; legs straight down to the anvil, the rest curled in
  function stapleCol(ct, mode, surf){
    const xc = 2.75, M = MAT.steel, p = [], cb = ct - .5, lb = cb - 6;
    if (mode === 'jam' && lb < surf){   // legs stopped on the stack and buckled: zigzags squashed into the space left
      const h = Math.max(.6, cb - surf), z = q => surf + h*q;
      for (const sy of [-1, 1]){ const y = sy*6, pts = [[xc, y, cb], [xc + 1.3, y - sy*.4, z(.72)], [xc - 1.1, y - sy*.2, z(.42)], [xc + .9, y - sy*.7, z(.15)], [xc + .2, y - sy*1.6, surf + .1]].map(q => spW(...q));
        p.push(pts.slice(1).map((q, i) => rod(pts[i], q, .28, M, toneI, .5, .28, 8)).join('')); }
      const bow = [[xc, -6.25, cb + .25], [xc - .5, 0, cb + 1.4], [xc, 6.25, cb + .25]].map(q => spW(...q));
      return p.join('') + rod(bow[0], bow[1], .3, M, toneI, .6, .3, 8) + rod(bow[1], bow[2], .3, M, toneI, .6, .3, 8);
    }
    const fold = Math.max(0, ANVIL - lb), lz0 = Math.max(lb, ANVIL);
    const legs = [-1, 1].map(sy => obox(spW(xc, sy*6, (cb + lz0)/2), DU, DV, [0, 0, 1], .31, .25, Math.max(.01, (cb - lz0)/2), M, toneI, .5)
      + (fold > .05 ? obox(spW(xc, sy*(6.25 - fold/2), ANVIL + .25), DU, DV, [0, 0, 1], .31, fold/2, .25, M, toneI, .5) : ''));
    const order = vis(DV) ? legs : legs.slice().reverse();
    return order.join('') + obox(spW(xc, 0, ct - .25), DU, DV, [0, 0, 1], .31, 6.25, .25, M, toneI, .6);
  }
  // what is inside the channel: rail, the strip astride it, pusher, its spring, rear post, the staple being driven, blade
  function channelInside(st, a, ah){
    const R = spR(a), M = MAT.steel, parts = [];
    const rail = spBox(a, 3.2, -5.2, 8.4, 116, 5.2, 13.9, matOf('#9aa3a7'), toneI, .6);   // under everything that rides on it
    const n = st.count - (st.drive ? 1 : 0), x0 = X0 + (st.drive ? PITCH_S : 0) + st.slideIn, x1 = x0 + n*PITCH_S;
    if (n > 0){ let lines = '';
      const [ax, ay, az] = spAx(a);
      if (vis(az)) for (let i = 1; i < Math.min(n, 140); i++){ const x = x0 + i*PITCH_S; lines += pd([R(x, -6.2, 14.92), R(x, 6.2, 14.92)], false); }
      parts.push({ x: (x0 + x1)/2, svg: spBox(a, x0, 5.75, 8.4, x1, 6.25, 14.4, M, toneI, .5) + spBox(a, x0, -6.25, 8.4, x1, -5.75, 14.4, M, toneI, .5)
        + spBox(a, x0, -6.25, 14.4, x1, 6.25, 14.9, M, toneI, .6) + (lines ? `<path d="${lines}" fill="none" stroke="${INK}" stroke-width=".25" opacity=".35"/>` : '') }); }
    // pusher sits behind the strip (or pulled back while the cover is open)
    const xp = x1 + (st.pullBack || 0)*(112 - x1 - 7);
    parts.push({ x: xp + 3.5, svg: spBox(a, xp, -6.5, 14, xp + 7, 6.5, 17.6, PUSHM, toneI, .8) + spBox(a, xp + 2, -2, 17.6, xp + 5, 2, 19.6, PUSHM, toneI, .7)
      + spBox(a, xp + .3, 5.6, 9, xp + 6.7, 6.5, 14, PUSHM, toneI, .6) + spBox(a, xp + .3, -6.5, 9, xp + 6.7, -5.6, 14, PUSHM, toneI, .6) });
    const sp = coilParts(R(xp + 7, 0, 17.2), spAx(a)[0], 0, Math.max(1, 116 - xp - 7), 1.6, Math.max(3, (116 - xp - 7)/3.2), MAT.steel.l, .4);
    parts.push({ x: (xp + 116)/2, svg: sp.far + sp.near });
    parts.push({ x: 117.5, svg: spBox(a, 116, -3, 8.4, 119, 3, 19, M, toneI, .7) });                               // rear post
    const tow = vis(spAx(a)[0]);
    parts.sort((p, q) => tow ? p.x - q.x : q.x - p.x);
    let s = rail + parts.map(p => p.svg).join('');
    if (st.drive) s += stapleCol(st.drive.ct, st.drive.mode, st.drive.surf);
    if (st.jam && !st.drive) s += jammedSvg(a);
    // driver blade, hanging from the cover into the nose
    s += spBox(ah, BLADE[0], -6.3, BLADE[2], BLADE[1], 6.3, 23, matOf('#b8bfc2'), toneI, .7);
    return s;
  }
  const jammedSvg = a => { const R = spR(a), M = MAT.steel, pts = [[2.75, -6, 11.5], [3.6, -5, 9.5], [2.2, -4.2, 7.4], [3.4, -3.4, 6.2]].map(q => R(...q)), pts2 = [[2.75, 6, 11.5], [1.9, 5.2, 9.8], [3.5, 4.6, 7.8], [2.4, 3.7, 6.4]].map(q => R(...q));
    return [pts, pts2].map(q => q.slice(1).map((p, i) => rod(q[i], p, .28, M, toneI, .5, .28, 8)).join('')).join('')
      + rod(R(2.75, -6.25, 11.8), R(2.3, 0, 13), .3, M, toneI, .6, .3, 8) + rod(R(2.3, 0, 13), R(2.75, 6.25, 11.8), .3, M, toneI, .6, .3, 8); };
  // the leaf return spring between base and magazine
  function leafSpring(am){
    const zMb = spZ(am, 40, 7.6) - .1, A = [96, 6.6], Bc = [62, 6.9], Cc = [40, zMb], pts = [];
    for (let i = 0; i <= 10; i++){ const t = i/10, x = (1-t)*(1-t)*A[0] + 2*(1-t)*t*Bc[0] + t*t*Cc[0], z = (1-t)*(1-t)*A[1] + 2*(1-t)*t*Bc[1] + t*t*Cc[1]; pts.push([x, z]); }
    let s = '';
    for (let i = 0; i < 10; i++){ const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], q = [spW(x0, -3.5, z0), spW(x1, -3.5, z1), spW(x1, 3.5, z1), spW(x0, 3.5, z0)];
      let nr = norm(cross(sub(q[1], q[0]), sub(q[3], q[0]))); if (!vis(nr)) nr = kScl(nr, -1); s += face(pd(q), toneI(nr, MAT.steel)); }
    s += ink(pd([...pts.map(([x, z]) => spW(x, -3.5, z)), ...pts.slice().reverse().map(([x, z]) => spW(x, 3.5, z))]), .8);
    return s + obox(spW(96, 0, 6.75), DU, DV, [0, 0, 1], 1.4, 1.4, .25, MAT.steel, toneI, .5);
  }
  // the cover spring: a coil standing on its seat across the channel, up to the cover's underside
  function coverSpring(am, ah){ const R = spR(am), [, , az] = spAx(am), top = spZ(ah, 103, 21.5), base = R(103, 0, 21.6), len = Math.min(8, Math.max(1.5, top - base[2]));
    const c = coilParts(base, az, 0, len, 2.2, 4, MAT.steel.l, .45);
    return { far: c.far, near: c.near, seat: spBox(am, 100, -7.5, 21, 106, 7.5, 21.6, MAT.steel, toneI, .6) }; }
  // the anvil plate and its two clinch grooves
  function anvilSvg(){
    let s = spBox(0, 3, -6.5, 6.5, 17, 6.5, ANVIL, MAT.steel, toneI, .8);
    if (vis([0, 0, 1])) for (const sy of [-1, 1]) s += shape(rrUV(9.3, sy > 0 ? 1.2 : -6.7, 11.5, sy > 0 ? 6.7 : -1.2, .9).map(([x, y]) => spW(x, y, ANVIL + .01)), '#9aa3a7', .5);
    return s;
  }
  function baseSvg(){
    const A = rrUV(1.5, -15.5, 132.5, 15.5, 6).map(([x, y]) => spW(x, y, 0)), B = rrUV(1.5, -15.5, 132.5, 15.5, 6).map(([x, y]) => spW(x, y, 1.6));
    const C = rrUV(0, -17, 134, 17, 7).map(([x, y]) => spW(x, y, 1.6)), D = rrUV(0, -17, 134, 17, 7).map(([x, y]) => spW(x, y, 6.5));
    return loft(A, B, n => toneI(n, DARK)) + hullInk([...A, ...B], 1) + loft(C, D, n => tone(n, BASEM)) + fill(pd(D), BASEM.l) + ink(pd(D), 1) + hullInk([...C, ...D], 2);
  }
  const cheek = sy => spBox(0, 110, sy > 0 ? 12 : -14, 6.5, 132, sy > 0 ? 14 : -12, 26, BASEM, tone, 1);
  const pinEnd = sy => { const a = spW(HX, sy*14, HZ), b = spW(HX, sy*14.8, HZ); return rod(a, b, 1.5, MAT.steel, toneI, .8, 1.5, 14); };
  const flanges = (ah, sy) => spBox(ah, 112, sy > 0 ? 10.2 : -11, 15, 128, sy > 0 ? 11 : -10.2, 22, MAT.steel, toneI, .7);

  /* ---------- the papers ---------- */
  // where a spot of S3 (pu, pv) is in the stapler's frame, with the sheets slid du along the page (and the stapler at sv)
  const sheetToSp = (pu, pv, du, sv = svNow) => { const q = undk(S3.dk(pu + du, pv, 0)); return [q[0] - SU, q[1] - SV - sv]; };
  // how far to slide the sheets (along S3's pu) so a spot 6.3 mm in from their right edge lands under the driver (x = 2.75)
  function slideFor(pv){ const p0 = sheetToSp(S3.w - PIN_IN, pv, 0, 0); return (2.75 - p0[0])/Math.cos(S3_TURN); }
  // where the stapler must slide (along v) for that spot to be on its centre line, once the sheets are in
  function svFor(pv, du){ return sheetToSp(S3.w - PIN_IN, pv, du, 0)[1]; }
  // height of a sheet lying on the stack, rising onto the base where it goes into the throat (x = stapler x of the point)
  const sheetZ = (x, zf, za) => x <= -12 ? zf : x >= 2.5 ? za : zf + (za - zf)*(x + 12)/14.5;
  // the top two sheets of S3 slid du into the throat: drawn in strips so the part over the base rises onto the anvil
  function topSheets(st){
    const du = st.hw.du, w = S3.w, h = S3.h, cols = [0, w - 40, w - 26, w - 18, w - 12, w - 8, w - 4, w];
    const lay = (dz, dv, col) => { let s = '';
      const P3 = (a, b) => { const q = S3.dk(a + du, b + dv, 0), x = undk(q)[0] - SU; return [q[0], q[1], sheetZ(x, S3.z + dz, Z0 + ANVIL + .2 + dz)]; };
      for (let i = 0; i < cols.length - 1; i++) s += fill(pd([P3(cols[i], 0), P3(cols[i + 1], 0), P3(cols[i + 1], h), P3(cols[i], h)]), col);
      s += ink(pd([...cols.map(a => P3(a, 0)), ...cols.slice().reverse().map(a => P3(a, h))]), .8);
      return s; };
    let s = lay(-.11, .9, '#f4efe2') + lay(.01, 0, MAT.paper.l);
    // the top sheet's rules (as the stack's own: every 11 mm from 24 mm down), its printed title, the staples in the pair
    const zt = S3.z + .02, P2 = (a, b) => S3.dk(a + du, b, zt);
    let rl = ''; for (let b = 24; b < h - 3; b += 11) rl += pd([P2(2, b), P2(w - 42, b)], false);
    s += `<path d="${rl}" fill="none" stroke="#9fb6d6" stroke-width=".55"/>`;
    s += txOn(P2(8, 12), S3.DU, [0, 0, 1], '期中考试', 6.4, INK, 800, 'start');
    for (const [pu, pv] of st.hw.pins) s += pinSvg(pu + du, pv, (() => { const q = S3.dk(pu + du, pv, 0), x = undk(q)[0] - SU; return sheetZ(x, S3.z, Z0 + ANVIL + .3); })());
    return s;
  }
  // a staple's crown seen on top of the paper, along the paper's edge (its legs are clinched underneath)
  const pinSvg = (pu, pv, z) => obox(S3.dk(pu, pv, z + .25), S3.DU, S3.DV, [0, 0, 1], .31, 6.25, .25, MAT.steel, toneI, .6);
  // the top of the stack (all but the bottom two sheets) slid into the throat: a block that tips up onto the anvil
  function topBlock(st){
    const n = S3_N - 2, tn = n*.12, du = st.blk.du, k = st.blk.k;
    const zBot0 = S3.z - tn, rise = (Z0 + ANVIL - zBot0)*k, tilt = Math.atan2(rise, S3.w);
    const ax = kAdd(kScl(S3.DU, Math.cos(tilt)), [0, 0, Math.sin(tilt)]), ay = S3.DV, az = kAdd(kScl(S3.DU, -Math.sin(tilt)), [0, 0, Math.cos(tilt)]);
    const base0 = kAdd(S3.dk(du, 0, zBot0), [0, 0, 0]);                         // its far-left bottom corner, the hinge of the tilt
    const c = kAdd(kAdd(kAdd(base0, kScl(ax, S3.w/2)), kScl(ay, S3.h/2)), kScl(az, tn/2));
    let s = obox(c, ax, ay, az, S3.w/2, S3.h/2, tn/2, MAT.paper, toneI, .9);
    let ln = '';
    for (const [nn, hn, along, ha] of [[ax, S3.w/2, ay, S3.h/2], [ay, S3.h/2, ax, S3.w/2]]) for (const sg of [1, -1]){ const nv = kScl(nn, sg); if (!vis(nv)) continue;
      const fc = kAt(c, nv, hn + .02); for (let z = -tn/2 + .4; z < tn/2 - .1; z += .4){ const b2 = kAt(fc, az, z); ln += pd([kAt(b2, along, -ha + .3), kAt(b2, along, ha - .3)], false); } }
    if (ln) s += `<path d="${ln}" fill="none" stroke="#b9b09b" stroke-width=".35"/>`;
    if (vis(az)){ const top = kAt(c, az, tn/2 + .02), at = (a, b) => kAdd(kAt(top, ax, a - S3.w/2), kScl(ay, b - S3.h/2));
      s += txOn(at(8, 12), ax, az, '期中考试', 6.4, INK, 800, 'start') + txOn(at(52, 12), ax, az, `共 ${S3_N} 张`, 3.4, '#5b564d', 700, 'start'); }
    return s;
  }
  // box of staples: a strip of staples shows on top while there are any
  function boxSvg(st){
    const [u0, v0, u1, v1, h] = BOX; let s = deskBox(u0, v0, BH, u1, v1, BH + h, BOXM, toneI, 1.1);
    const z = BH + h + .02;
    if (vis([0, 0, 1])){
      s += shape(rectUV(u0 + 1.5, v0 + 1.5, u1 - 1.5, v1 - 1.5).map(([u, v]) => dk(u, v, z)), '#6b5a2a', .6);
      for (let i = 0; i < Math.min(2, st.boxN); i++){ const vc = v0 + 5.2 + i*7.6;
        s += shape(rectUV(u0 + 3, vc - 3.1, u0 + 3 + STRIP_N*PITCH_S, vc + 3.1).map(([u, v]) => dk(u, v, z + .03)), '#dfe3e4', .6);
        let ln = ''; for (let k = 4; k < STRIP_N*PITCH_S; k += 4) ln += pd([dk(u0 + 3 + k, vc - 3, z + .05), dk(u0 + 3 + k, vc + 3, z + .05)], false);
        s += `<path d="${ln}" fill="none" stroke="#8f989b" stroke-width=".3"/>`; } }
    if (vis(DV)) s += txOn(dk(u0 + 6, v1 + .05, BH + 6.6), DU, DV, '12# 订书钉', 4.2, INK, 800, 'start') + txOn(dk(u1 - 5, v1 + .05, BH + 6.6), DU, DV, '1000枚', 3.4, INK, 800, 'end');
    return s;
  }
  // a strip on its way from the box into the channel: lifted out, over the open cover, dropped in behind the others
  function flyingStrip(st){
    const t = st.fresh; if (!(t > 0 && t < 1)) return '';
    const [u0, v0] = BOX, from = dk(u0 + 3 + STRIP_N*PITCH_S/2, v0 + 5.2, BH + BOX[4] - 1);
    const xs = X0 + st.count*PITCH_S, to = spR(st.am)(xs + STRIP_N*PITCH_S/2, 0, 11.65);
    const k = ease(t), p = kAdd(kLerp(from, to, k), [0, 0, 40*Math.sin(Math.PI*Math.min(1, k*1.15))]);
    const hl = STRIP_N*PITCH_S/2, M = MAT.steel;
    return obox(kAdd(p, [0, 0, 3]), DU, DV, [0, 0, 1], hl, 6.25, .25, M, toneI, .7) + obox(kAdd(p, kScl(DV, 6)), DU, DV, [0, 0, 1], hl, .25, 3, M, toneI, .5)
      + obox(kAdd(p, kScl(DV, -6)), DU, DV, [0, 0, 1], hl, .25, 3, M, toneI, .5);
  }
  const looseSvg = l => { const [u, v, a] = l, c = Math.cos(a), s2 = Math.sin(a), at = (x, y) => dk(u + x*c - y*s2, v + x*s2 + y*c, BH + .35);
    const shp = l[3] === 'bent' ? [[-6, 1.2], [-6, 0], [-2, .6], [0, -.4], [3, .5], [6, 0], [6, 1.5]] : [[-.6, 1.2], [-6.2, 1.2], [-6.2, 0], [6.2, 0], [6.2, 1.2], [.6, 1.2]];
    const d = pd(shp.map(([x, y]) => at(x, y)), false);
    return `<path d="${d}" fill="none" stroke="${INK}" style="stroke-width:.95" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#dfe3e4" style="stroke-width:.45" stroke-linejoin="round" stroke-linecap="round"/>`; };

  /* ---------- the stapler, assembled for the view ---------- */
  function stapler(st, m, k){
    const am = st.am, ah = st.ah, near = vis(DV) ? 1 : -1, front = vis(kScl(DU, -1));
    const docs = (st.hw.du > .01 ? topSheets(st) : '') + (st.blk.du > .01 ? topBlock(st) : '');
    const cs = coverSpring(am, ah);
    // magazine: far wall, inside, near wall; the nose plate with whichever side faces the viewer
    const wall = sy => spBox(am, 1.5, sy > 0 ? 6.8 : -7.5, 7.6, 126, sy > 0 ? 7.5 : -6.8, 21, MAT.steel, toneI, .9);
    const nose = spBox(am, 1.5, -7.5, 9.2, 2.3, 7.5, 21, MAT.steel, toneI, .9);
    const bottom = spBox(am, 3.2, -7.5, 7.6, 126, 7.5, 8.4, MAT.steel, toneI, .9);
    const inside = channelInside(st, am, ah) + cs.far + cs.seat + cs.near;
    let mag = bottom + wall(-near) + (front ? '' : nose) + inside + wall(near) + (front ? nose : '');
    const cover = coverShell(ah, m);
    const under = baseSvg() + anvilSvg() + leafSpring(am) + docs;
    const shell = cheek(-near) + pinEnd(-near) + flanges(ah, -near) + mag + flanges(ah, near) + act('cover', cover) + cheek(near) + pinEnd(near);
    if (!(k > 0)) return under + shell;
    // see-through: the base stays; the cheeks, channel and cover fade and the working parts are drawn again over them
    const mech = channelInside(st, am, ah) + cs.far + cs.seat + cs.near + rod(spW(HX, -14, HZ), spW(HX, 14, HZ), 1.2, MAT.steel, toneI, .7, 1.2, 12);
    return under + `<g opacity="${f(1 - .75*k)}">${shell}</g><g opacity="${f(k)}">${mech}</g>`;
  }
  const staplerPts = st => [...spBoxPts(0, 0, -17, 0, 134, 17, 6.5), ...spBoxPts(st.am, 1.5, -7.5, 7.6, 126, 7.5, 21), ...HEAD_PROF.flatMap(([x, z]) => [spR(st.ah)(x, -11, z), spR(st.ah)(x, 11, z)])];
  // sort the things on the desk by desk-square boxes (u, v, z): separated along an axis, the nearer one goes later
  function deskSort(items){
    const ax = [vis(DU), vis(DV), vis([0, 0, 1])];
    const sep = (p, q) => { for (let i = 0; i < 3; i++){ if (p.b[1][i] <= q.b[0][i] + 1e-6) return ax[i] ? -1 : 1; if (q.b[1][i] <= p.b[0][i] + 1e-6) return ax[i] ? 1 : -1; } return 0; };
    const dep = p => depthOf(dk((p.b[0][0] + p.b[1][0])/2, (p.b[0][1] + p.b[1][1])/2, (p.b[0][2] + p.b[1][2])/2));
    return items.filter(Boolean).sort((p, q) => sep(p, q) || dep(p) - dep(q)).map(p => p.svg).join('');
  }
  const dbox = pts => { const q = pts.map(undk); return [[0, 1, 2].map(i => Math.min(...q.map(p => p[i]))), [0, 1, 2].map(i => Math.max(...q.map(p => p[i])))]; };

  /* ---------- scene ---------- */
  function scene(st, m){
    const k = ease(st.xr || 0);
    svNow = st.sv;
    // flat on the stack and the desk: staples left in S3's top sheets, wasted staples
    let s = '';
    if (st.hw.du <= .01) for (const [pu, pv] of st.hw.pins) s += pinSvg(pu, pv, S3.z);
    if (st.blk.du <= .01) for (const [pu, pv] of st.blkPins) s += pinSvg(pu, pv, S3.z);
    for (const l of st.loose) s += looseSvg(l);
    const [u0, v0, u1, v1, h] = BOX;
    const bp = deskBoxPts(u0, v0, BH, u1, v1, BH + h);
    s += castShadow(bp, BH);
    s += castShadow([...spBoxPts(0, 0, -17, 0, 134, 17, 6.5), ...spBoxPts(st.am, 1.5, -7.5, 7.6, 126, 7.5, 21), ...spBoxPts(0, 110, -14, 6.5, 132, 14, 26)], BH)
      + castShadow(HEAD_PROF.flatMap(([x, z]) => [spR(st.ah)(x, -11, z), spR(st.ah)(x, 11, z)]), BH);
    const sp = staplerPts(st);
    const items = [
      { b: dbox(sp), svg: stapler(st, m, k) },
      { b: dbox(bp), svg: boxSvg(st) } ];
    s += deskSort(items) + flyingStrip(st) + (st.flyOut ? st.flyOut() : '');
    s += labels(st, k);
    return s;
  }
  function labels(st, k){
    const am = st.am, ah = st.ah, sp = staplerPts(st), near = vis(DV) ? 1 : -1;
    const B = [Math.min(...sp.map(p => p[0])), Math.max(...sp.map(p => p[0])), Math.min(...sp.map(p => p[1])), Math.max(...sp.map(p => p[1])), 0, 30];
    const pressing = st.act === 'staple' || st.act === 'empty' || st.act === 'jam';
    if (k > .6){ const xp = X0 + st.count*PITCH_S;
      return zhCallouts([
        { at: spR(ah)(2.7, 0, 16), text: '打钉片', on: !!st.drive },
        ...(st.count ? [{ at: spR(am)(X0 + Math.min(st.count, 60)*PITCH_S/2, near*6.25, 14.9), text: '书钉排', on: !!st.drive }] : []),
        { at: spR(am)(xp + 3.5, 0, 17.6), text: '推钉器', on: st.pullBack > 0 },
        { at: spR(am)((xp + 116)/2 + 4, 0, 18.8), text: '推钉弹簧', on: st.pullBack > 0 },
        { at: spR(am)(100, near*5.2, 13.9), text: '导轨', on: false },
        { at: spR(am)(103, 0, 25), text: '上盖弹簧', on: pressing },
        { at: spW(70, 0, 7.6), text: '复位弹簧', on: pressing },
        { at: spW(10, near*6.5, ANVIL), text: '钉砧', on: !!st.drive },
        { at: spW(HX, near*14, HZ), text: '转轴', on: st.act === 'load' } ], B); }
    return zhCallouts([
      { at: spR(ah)(70, 0, 43), text: '上盖', on: pressing || st.act === 'load' },
      { at: spR(am)(60, near*7.5, 12), text: '钉槽', on: st.act === 'load' },
      { at: spW(60, near*17, 4), text: '底座', on: false },
      { at: spW(10, 0, ANVIL), text: '钉砧', on: !!st.drive },
      { at: spW(HX, near*14.8, HZ), text: '转轴', on: st.act === 'load' },
      { at: dk(BOX[0] + 10, BOX[3], BH + BOX[4]), text: '订书钉盒', on: st.fresh > 0 },
      { at: S3.dk(S3.w - 20, S3.h - 4, S3.z), text: '试卷', on: st.hw.du > .01 || st.blk.du > .01 } ], B);
  }

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { load: '正在装钉', staple: '正在订', empty: '咔嚓还没按完', jam: '正在订那沓卷子', clear: '正在抠卡住的钉' };
  const busy = () => { if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等一下'); return true; };
  // press the cover with paper (or nothing) under the nose: surf = height of the paper's top over the anvil
  function pressSegs(st, mode, surf){
    const aMag = Math.max(0, spSolve(2.3, 7.6, surf + .03));
    const target = mode === 'jam' ? surf + 6.5 - 2.6 : mode === 'empty' ? ANVIL + 1 : surf + .5;
    const aEnd = spSolve(BLADE[0] + .3, BLADE[2], target), natural = () => spZ(st.am, 2.75, 14.9);
    return [
      { ms: 230, start(){ this.a0 = st.am; this.h0 = st.ah; st.act = mode === 'paper' ? 'staple' : mode; },
        step(k){ const e = ease(k); st.am = this.a0 + (aMag - this.a0)*e; st.ah = st.am + DLT0; } },
      { ms: 260, start(){ this.h0 = st.ah; this.top = natural(); st.drive = st.count ? { ct: this.top, mode, surf } : null; },
        step(k){ const e = k*k*(3 - 2*k); st.ah = this.h0 + (aEnd - this.h0)*e; const blade = spZ(st.ah, BLADE[0] + .3, BLADE[2]); if (st.drive) st.drive.ct = Math.min(this.top, blade); } },
      { ms: 110, step(){} } ];
  }
  function releaseSegs(st, after){
    return [
      { ms: 220, start(){ this.h = st.ah; after(); }, step(k){ st.ah = this.h + (st.am + DLT0 - this.h)*ease(k); } },
      { ms: 220, start(){ this.a = st.am; }, step(k){ st.am = this.a + (A_M0 - this.a)*ease(k); st.ah = st.am + DLT0; }, end(){ st.am = A_M0; st.ah = A_M0 + DLT0; st.act = null; } } ];
  }
  // out of staples, or a staple jammed in the nose: what a person does first
  function precheck(st){
    if (st.jam) return clearSegs(st);
    return null;
  }
  function clearSegs(st){
    return [
      { ms: 420, start(){ this.h = st.ah; st.act = 'clear'; }, step(k){ st.ah = this.h + (30*Math.PI/180 - this.h)*ease(k); } },
      { ms: 520, start(){ st.jam = false; const p0 = spR(st.am)(2.75, 0, 9), slot = LOOSE_AT[st.loose.length % LOOSE_AT.length], to = dk(slot[0], slot[1], BH + .4);
          st.flyOut = () => { const t = this.t || 0, p = kAdd(kLerp(p0, to, t), [0, 0, 22*Math.sin(Math.PI*t)]);
          return rod(kAdd(p, kScl(DV, -6)), kAdd(p, [0, 0, 1.5]), .3, MAT.steel, toneI, .6, .3, 8) + rod(kAdd(p, [0, 0, 1.5]), kAdd(p, kScl(DV, 6)), .3, MAT.steel, toneI, .6, .3, 8); }; },
        step(k){ this.t = k; }, end(){ st.flyOut = null; st.loose.push([...LOOSE_AT[st.loose.length % LOOSE_AT.length].slice(0, 3), 'bent']); } },
      { ms: 380, start(){ this.h = st.ah; }, step(k){ st.ah = this.h + (A_M0 + DLT0 - this.h)*ease(k); }, end(){ st.act = null; ui.flash('掀开上盖，用指甲把卡住的钉抠了出来', 2000); } } ];
  }
  function load(st){ if (busy()) return;
    if (st.count + STRIP_N > CAP_N) return ui.flash('钉槽还满着，用掉一些再装');
    if (st.boxN <= 0) return ui.flash('订书钉盒空了');
    kPlay(ui, 'load', [...(precheck(st) || []),
      { ms: 560, start(){ this.h = st.ah; st.act = 'load'; }, step(k){ const e = ease(k); st.ah = this.h + (A_OPEN - this.h)*e; st.pullBack = e; } },
      { ms: 1100, start(){ st.fresh = .001; }, step(k){ st.fresh = Math.max(.001, Math.min(.999, k)); }, end(){ st.fresh = 0; st.count += STRIP_N; st.boxN--; st.slideIn = 0; } },
      { ms: 520, start(){ this.h = st.ah; }, step(k){ const e = ease(k); st.ah = this.h + (A_M0 + DLT0 - this.h)*e; st.pullBack = 1 - e; }, end(){ st.pullBack = 0; st.act = null; } } ],
      () => ui.flash(`装进一排 ${STRIP_N} 颗，推钉器把它们推到最前面`, 2000));
  }
  // the stack is held by a binder clip or a paperclip (14): the sheets can't be slid off it
  function held(){
    if (S3_HOLD.clip){ ui.flash('长尾夹夹着这沓卷子，抽不出来——先把长尾夹取下来'); return true; }
    if (S3_HOLD.paperclip){ ui.flash('回形针别着卷子角，先把回形针取下来'); return true; }
    return false;
  }
  // the stapler slides along the stack's edge to a spot, the sheets slide into its throat (and back out afterwards)
  const slideIn = (st, key, pv) => { const du = slideFor(pv), sv = svFor(pv, du);
    return { ms: 460, start(){ this.d0 = st[key].du; this.s0 = st.sv; }, step(e){ const g = ease(e); st[key].du = this.d0 + (du - this.d0)*g; st.sv = this.s0 + (sv - this.s0)*g; } }; };
  const slideOut = (st, key) => ({ ms: 420, start(){ this.d0 = st[key].du; this.s0 = st.sv; }, step(e){ const g = ease(e); st[key].du = this.d0*(1 - g); st.sv = this.s0*(1 - g); },
    end(){ st[key].du = 0; st.sv = 0; } });
  // staple the top two sheets of the stack: along the right edge near the corner, two staples
  function staple(st){ if (busy()) return;
    if (held()) return;
    if (!st.count && !st.jam) return ui.flash('没钉了：空按也订不上，先装书钉');
    if (st.hw.pins.length >= HW_PINS.length){ st.hw.pins = []; ui.flash('这两张订好了——再订上面两张'); }
    const pv = HW_PINS[st.hw.pins.length];
    const segs = [...(precheck(st) || [])];
    segs.push(slideIn(st, 'hw', pv));
    segs.push(...pressSegs(st, 'paper', 7.4));
    segs.push(...releaseSegs(st, () => { if (st.drive){ st.hw.pins.push([S3.w - PIN_IN, pv]); st.count--; st.drive = null; st.stapled++; } }));
    segs.push(slideOut(st, 'hw'));
    kPlay(ui, 'staple', segs, () => ui.flash(st.hw.pins.length >= HW_PINS.length ? '咔嚓两下，右边两颗钉，这两张订好了' : '咔嚓——钉脚穿过两张纸，在钉砧上弯进去', 1800));
  }
  // clicking it with nothing under: the staple folds shut on the anvil and drops off onto the desk
  function empty(st){ if (busy()) return;
    if (!st.count && !st.jam) return ui.flash('连钉都没了，只剩空响');
    const segs = [...(precheck(st) || [])];
    segs.push(...pressSegs(st, 'empty', ANVIL));
    segs.push(...releaseSegs(st, () => { if (!st.drive) return; st.count--; st.drive = null; st.wasted++;
      const p0 = spW(10, 0, ANVIL + .5), slot = LOOSE_AT[st.loose.length % LOOSE_AT.length], end = dk(slot[0], slot[1], BH + .4); let t = 0;
      st.flyOut = () => { const p = kAdd(kLerp(p0, end, t), [0, 0, 16*Math.sin(Math.PI*t)]); return obox(p, DU, DV, [0, 0, 1], .6, 6.25, .5, MAT.steel, toneI, .6); };
      ui.animate(dt => { t = Math.min(1, t + dt/.5); if (t >= 1){ st.flyOut = null; st.loose.push(slot.slice(0, 3)); if (st.loose.length > 12) st.loose.shift(); return false; } return true; }); }));
    kPlay(ui, 'empty', segs, () => ui.flash(st.wasted > 2 ? `空按了 ${st.wasted} 下，桌上一堆折好的钉` : '咔嚓——空按一下，一颗钉白白折在钉砧上掉了', 2000));
  }
  // most of the stack at once: a 24/6 staple's 6 mm legs get through about 20 sheets; more, and they buckle and jam
  const CAPACITY = 20;
  function thick(st){ if (busy()) return;
    if (held()) return;
    if (!st.count && !st.jam) return ui.flash('没钉了：先装书钉');
    const n = S3_N - 2, tn = n*.12, jam = n > CAPACITY;
    const segs = [...(precheck(st) || [])];
    segs.push(slideIn(st, 'blk', THICK_PV));
    segs.push({ ms: 300, step(e){ st.blk.k = ease(e); } });
    segs.push(...pressSegs(st, jam ? 'jam' : 'paper', ANVIL + tn));
    segs.push(...releaseSegs(st, () => { if (!st.drive) return; st.count--; st.drive = null;
      if (jam){ st.jam = true; st.wasted++; } else { st.blkPins.push([S3.w - PIN_IN, THICK_PV]); st.stapled++; } }));
    segs.push({ ms: 260, step(e){ st.blk.k = 1 - ease(e); } });
    segs.push(slideOut(st, 'blk'));
    kPlay(ui, 'jam', segs, () => ui.flash(jam ? `一沓 ${n} 张太厚，钉脚扎不透就弯了——卡钉！` : `${n} 张一下订穿了——这还不算一沓`, 2400));
  }

  const __cfg = ({
    fig:'09', turn:'full', title:'订书机', palette:'mint',
    state:{ am: A_M0, ah: A_M0 + DLT0, count: 36, boxN: 8, wasted: 0, stapled: 0, pullBack: 0, slideIn: 0, fresh: 0, drive: null, jam: false,
      hw: { du: 0, pins: [] }, blk: { du: 0, k: 0 }, blkPins: [], sv: 0, loose: [], act: null, flyOut: null },
    scene,
    stats: st => [ { label:'书钉', value: String(st.count) }, { label:'浪费', value: String(st.wasted), small: true } ],
    buttons:[
      { label:'装书钉', onClick: load },
      { label:'订作业', onClick: staple },
      { label:'空按咔嚓', onClick: empty },
      { label:'订一沓卷子', onClick: thick },
    ],
    acts:{ cover: st => staple(st) },
    params:(st, q) => {
      if (q.has('count')) st.count = Math.max(0, Math.min(CAP_N, +q.get('count')));
      if (q.has('open')){ st.ah = +q.get('open')*Math.PI/180; st.pullBack = 1; }
      if (q.has('fresh')){ st.fresh = +q.get('fresh'); st.ah = A_OPEN; st.pullBack = 1; }
      if (q.has('pins')) st.hw.pins = HW_PINS.slice(0, +q.get('pins')).map(pv => [S3.w - PIN_IN, pv]);
      if (q.has('slid')){ st.hw.du = slideFor(HW_PINS[0]); st.sv = svFor(HW_PINS[0], st.hw.du); }
      if (q.get('jam') === '1') st.jam = true;
      if (q.has('loose')) for (let i = 0; i < +q.get('loose'); i++) st.loose.push([...LOOSE_AT[i % LOOSE_AT.length].slice(0, 3), i % 3 === 2 ? 'bent' : 'shut']);
      if (q.has('drive')){ const mode = q.get('mode') || 'paper', surf = mode === 'jam' ? ANVIL + (S3_N - 2)*.12 : mode === 'empty' ? ANVIL : 7.4;
        if (mode === 'paper'){ st.hw.du = slideFor(HW_PINS[0]); st.sv = svFor(HW_PINS[0], st.hw.du); }
        if (mode === 'jam'){ st.blk.du = slideFor(THICK_PV); st.blk.k = 1; st.sv = svFor(THICK_PV, st.blk.du); }
        st.am = Math.max(0, spSolve(2.3, 7.6, surf + .03)); st.ah = st.am + DLT0;
        const ct = spZ(st.am, 2.75, 14.9) - +q.get('drive'); st.drive = { ct, mode, surf };
        st.ah = spSolve(BLADE[0] + .3, BLADE[2], ct); }
    },
  });

  return ctx.adapt(__cfg, { seeThrough: true });
}
