// Fig. 04 修正带 — desk-scene object, ported from stationery/src/04-correction-tape.html by scripts/port-figures.mjs.
// The figure's own code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*),
// ctx.ui its ui (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are
// collected by the scene.
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: -508, v: 112, rot: 0 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 04 — Correction tape dispenser (5 mm x 6 m), its band of the shared 数学小测 (S1) with a wrong answer in pen,
     and a wooden pencil. Desk terms (u along the front edge, v toward the student; 1 unit = 1 mm) are this object's
     frame (ctx.desk); the quiz is printed on S1 through the paper's own frame (pu across the page, pv down it).
     The dispenser is drawn in its own frame: a = toward the nose, b = "up" in its side profile, c = across its thickness
     (c > 0 is the clear half). Side profile = convex hull of the supply-reel bulge, the take-up bulge and the nose.

     How it really works:
     1. The shell (an opaque half and a clear half) holds two reels on posts. The supply reel carries the tape: a clear
        PET carrier film with the white correction coating on it. Behind the supply reel sits a big gear; it meshes with a
        small gear behind the take-up reel (17 : 8), so the take-up always tries to turn faster than it needs to. A slip
        clutch (a friction spring between the small gear and the take-up spool) lets it slip, so the film stays taut.
     2. The tape runs off the supply reel, round a guide post, down the nose and round the front edge of the transfer head,
        coating side out; then the bare film runs back up round a second post onto the take-up reel.
     3. Correcting: press the head flat on the paper and pull it along. The paper grips the coating, so the coating stays
        on the paper behind the head; the pull turns the supply reel, the gears turn the take-up, the bare film winds in.
        The coating is dry at once: you can write straight on it.
     4. Lift the head off while still pulling hard and film is yanked out past the head: a slack loop hangs out of the
        nose and the next stroke smears. The take-up spool has a hex socket open through the shell: turn it with a pencil
        tip and the slip clutch lets the spool wind the loose film back in.
     Student life: a white "runway" pulled across the desk (6 m goes fast), and the pencil in the gear hole.

     Parts:
     SHELL   opaque half (grip ridges, sticker) . clear half (socket hole) . seam . nose . transfer head
     REELS   supply roll (white coating on film) . supply hub and its holes . big gear . supply post . take-up film roll .
             take-up hub with hex socket . small gear . slip clutch spring . take-up post
     FILM    supply guide post . return guide post . coated film down the nose . bare film back up . slack loop
     DESK    S1 band: questions 4-6, answers in blue pen (the wrong one), red marks . white strips . wooden 2B pencil */

  /* ---------- on the shared desk: its band of S1 (pv 72-150), the runway on the free desk behind S1 ---------- */
  const BH = ctx.deskZ;
  const S1 = ctx.paper('S1'), ZP = S1.z;
  const s1L = (pu, pv) => { const q = undk(S1.dk(pu, pv, 0)); return [q[0], q[1]]; };   // a point on S1, in this object's desk terms
  // questions 4-6 of the quiz, on S1's rules; the answers were written in blue pen, the second one wrong
  const QS = [ { pv: 95, q: '4.  3 + 4 =', a: '7' }, { pv: 108, q: '5.  2x = 14', a: 'x=8' }, { pv: 121, q: '6.  9 - 5 =', a: '4' } ];
  const ANS_PU = 46, PEN_BLUE = '#2b54b4';
  const PEN_ANS = QS.map((q, i) => S1.deskHand(q.a, ANS_PU, q.pv, ZP + .02, 4.6, 21 + i*5));
  const NEW_ANS = S1.deskHand('x=7', ANS_PU + .6, QS[1].pv - .6, ZP + .06, 3.9, 33);
  const FIX = { pu0: ANS_PU - 3, pu1: ANS_PU + 14, pv: QS[1].pv - 2.4 };   // the strip over the wrong answer: S1 centre line
  // the "runway": across the free desk behind S1, between the paper's head and the lead case (desk v -30, u -585 to -425)
  const RUN = { u0: -585 - PLACE.u, u1: -425 - PLACE.u, v: -30 - PLACE.v };
  const TAPE_W = 5, TOTAL = 6000;                                   // mm

  /* ---------- the dispenser, in its own frame ---------- */
  const CT_S = [0, 0], CT_T = [-5, 24.5];                           // supply / take-up reel centres
  const R_SG = 17, R_TG = 8, R_SHUB = 7, R_THUB = 5.5, SH_T = 9;    // gear pitch radii (25 apart), hub radii, half thickness
  const CT_G1 = [31, -9], CT_G2 = [34, .5], R_POST = 1.7;
  const CT_NOSE = [70, -25], CT_N = norm([70, -25, 0]).slice(0, 2), CT_NP = [-CT_N[1], CT_N[0]];   // along the nose, and square to it ("up")
  const CT_HC = [CT_NOSE[0] + CT_N[0]*1.5, CT_NOSE[1] + CT_N[1]*1.5];  // transfer head centre
  const ctH = (i, j) => [CT_HC[0] + CT_N[0]*4.2*i + CT_NP[0]*2.4*j, CT_HC[1] + CT_N[1]*4.2*i + CT_NP[1]*2.4*j];
  const HEAD_TIP = ctH(1, -1), HEAD_TOP = ctH(1, 1);                 // front-bottom edge (on the paper), front-top edge
  const CT_PROF = (() => { const pts = [], ring = (c, r, n) => { for (let i = 0; i < n; i++){ const t = i/n*2*Math.PI; pts.push([c[0] + r*Math.cos(t), c[1] + r*Math.sin(t)]); } };
    ring(CT_S, 22, 36); ring(CT_T, 13.5, 24); ring([CT_NOSE[0] - CT_N[0]*4.5, CT_NOSE[1] - CT_N[1]*4.5], 4.6, 14);
    return hull(pts); })();
  const CT_CEN = CT_PROF.reduce((a, p) => [a[0] + p[0]/CT_PROF.length, a[1] + p[1]/CT_PROF.length], [0, 0]);
  const rSupply = left => Math.sqrt(R_SHUB**2 + (15**2 - R_SHUB**2)*Math.max(0, left)/TOTAL);
  const rTake = used => Math.sqrt(R_THUB**2 + (10**2 - R_THUB**2)*Math.min(TOTAL, used)/TOTAL);
  const ctAt = (pose, pa, pb, pc) => { const b = cross(pose.c, pose.a); return [0, 1, 2].map(i => pose.o[i] + pose.a[i]*pa + b[i]*pb + pose.c[i]*pc); };
  const ctB = pose => cross(pose.c, pose.a);

  // poses: lying flat on S1 to the right of its questions, clear side up, nose toward them; held upright, clear side
  // toward the student, nose down-left
  const ctRotZ = (v, t) => [v[0]*Math.cos(t) - v[1]*Math.sin(t), v[0]*Math.sin(t) + v[1]*Math.cos(t), v[2]];   // turn about the vertical
  // turned 10 degrees nose-up the page, so the head stays clear of question 7's line below (spans pu 81-183, pv 91-150)
  const REST = { o: S1.dk(160, 128, ZP + SH_T), a: ctRotZ(kScl(S1.DU, -1), .17), c: [0, 0, 1] };
  const USE_A = ctRotZ(norm(kAdd(kScl(DU, -Math.cos(.06)), [0, 0, -Math.sin(.06)])), -.17), USE_C = ctRotZ(DV, -.17);
  function useAt(u, v, z, lift = 0){ const h = ctAt({ o: [0, 0, 0], a: USE_A, c: USE_C }, HEAD_TIP[0], HEAD_TIP[1], 0);
    return { o: kAdd(sub(dk(u, v, z), h), [0, 0, lift]), a: USE_A, c: USE_C }; }
  const ctLerp = (A, B, k) => { const a = norm(kLerp(A.a, B.a, k)); let c = kLerp(A.c, B.c, k); c = norm(sub(c, kScl(a, dot(a, c)))); return { o: kLerp(A.o, B.o, k), a, c }; };
  const ctArc = (p, k, h) => ({ ...p, o: kAdd(p.o, [0, 0, h*Math.sin(Math.PI*k)]) });

  // tangent points from point q to the circle (c, r)
  function ctTangents(q, c, r){ const dx = q[0] - c[0], dy = q[1] - c[1], d = Math.hypot(dx, dy); if (d <= r) return [c, c];
    const a = Math.atan2(dy, dx), b = Math.acos(r/d); return [a + b, a - b].map(t => [c[0] + r*Math.cos(t), c[1] + r*Math.sin(t)]); }
  // the film's path in the profile: off the supply (bottom side) round post 1 to the head; back from the head round post 2 onto the take-up
  function filmPath(st){
    const rs = rSupply(st.left), rt = rTake(TOTAL - st.left);
    const p1 = ctTangents(CT_G1, CT_S, rs).sort((x, y) => x[1] - y[1])[0];
    const p2 = ctTangents(CT_G2, CT_T, rt).sort((x, y) => Math.hypot(y[0] - CT_S[0], y[1] - CT_S[1]) - Math.hypot(x[0] - CT_S[0], x[1] - CT_S[1]))[0];
    return { out: [p1, [CT_G1[0], CT_G1[1] - R_POST], ctH(-1, -1.08), HEAD_TIP], ret: [HEAD_TOP, ctH(-1, 1.08), [CT_G2[0], CT_G2[1] + R_POST], p2], rs, rt };
  }
  // a ribbon of film along a path in the profile, TAPE_W wide across c; two-sided
  function ribbon(pose, path, col, op = 1, c0 = -TAPE_W/2, c1 = TAPE_W/2){
    let s = '';
    for (let i = 0; i < path.length - 1; i++){ const p = path[i], q = path[i + 1];
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < .05) continue;
      const quad = [ctAt(pose, p[0], p[1], c0), ctAt(pose, q[0], q[1], c0), ctAt(pose, q[0], q[1], c1), ctAt(pose, p[0], p[1], c1)];
      let n = norm(cross(sub(quad[1], quad[0]), sub(quad[3], quad[0]))); if (!vis(n)) n = kScl(n, -1);
      s += `<path d="${pd(quad)}" fill="${toneI(n, col)}" stroke="${INK}" stroke-width=".45" stroke-linejoin="round" opacity="${op}"/>`; }
    return s;
  }
  // a thin gear on the profile plane: far face dark, near face lit, teeth all round, turned by th
  function ctGear(pose, cen, r, n, th, c0, c1, M){
    const pts = c => { const o = []; for (let j = 0; j < n; j++) for (const [f0, rr] of [[0, r - 1], [.18, r + 1], [.42, r + 1], [.6, r - 1]]){ const t = th + (j + f0)/n*2*Math.PI; o.push(ctAt(pose, cen[0] + rr*Math.cos(t), cen[1] + rr*Math.sin(t), c)); } return o; };
    const near = vis(pose.c) ? c1 : c0, far = near === c1 ? c0 : c1, cn = near === c1 ? pose.c : kScl(pose.c, -1);
    let s = fill(pd(pts(far)), M.d) + ink(pd(pts(far)), .5) + fill(pd(pts(near)), toneI(cn, M)) + ink(pd(pts(near)), .7);
    // a ring of lightening holes, so the turning shows
    for (let j = 0; j < 5; j++){ const t = th + j/5*2*Math.PI, rr = r*.62, hr = r*.16;
      const ring = Array.from({length:10}, (_, i) => { const u = i/10*2*Math.PI; return ctAt(pose, cen[0] + rr*Math.cos(t) + hr*Math.cos(u), cen[1] + rr*Math.sin(t) + hr*Math.sin(u), near); });
      s += fill(pd(ring), M.d) + ink(pd(ring), .4); }
    return s;
  }
  // a reel: a roll of tape (or film) on its hub, axis along c; marks on the hub turn with it
  function ctReel(pose, cen, r, rhub, th, M, hubM, op = 1, socket = false){
    const o = ctAt(pose, cen[0], cen[1], 0), d = pose.c;
    let s = coaxSeg(o, d, { s0: -TAPE_W/2, s1: TAPE_W/2, r0: r, M, n: 30, w: .9, shade: toneI });
    const capC = vis(d) ? TAPE_W/2 + .02 : -TAPE_W/2 - .02;
    let lines = '';
    for (let rr = rhub + 1.4; rr < r - .5; rr += 1.5) lines += pd(Array.from({length:24}, (_, i) => { const t = i/24*2*Math.PI; return ctAt(pose, cen[0] + rr*Math.cos(t), cen[1] + rr*Math.sin(t), capC); }));
    if (lines) s += `<path d="${lines}" fill="none" stroke="${INK}" stroke-width=".25" opacity=".35"/>`;
    s += coaxSeg(kAt(o, d, 0), d, { s0: -TAPE_W/2 - .6, s1: TAPE_W/2 + .6, r0: rhub, M: hubM, n: 22, w: .8, shade: toneI });
    const hc = vis(d) ? TAPE_W/2 + .62 : -TAPE_W/2 - .62;
    if (socket){   // hex socket for a pencil tip
      const hx = Array.from({length:6}, (_, i) => { const t = th + i/6*2*Math.PI; return ctAt(pose, cen[0] + 2.2*Math.cos(t), cen[1] + 2.2*Math.sin(t), hc); });
      s += fill(pd(hx), '#2a2622') + ink(pd(hx), .5);
    } else for (let j = 0; j < 3; j++){ const t = th + j/3*2*Math.PI;
      const ring = Array.from({length:8}, (_, i) => { const u = i/8*2*Math.PI; return ctAt(pose, cen[0] + 4.4*Math.cos(t) + 1.1*Math.cos(u), cen[1] + 4.4*Math.sin(t) + 1.1*Math.sin(u), hc); });
      s += fill(pd(ring), hubM.d) + ink(pd(ring), .35); }
    return op < 1 ? `<g opacity="${op}">${s}</g>` : s;
  }
  const CT_CLEAR = { l:'#dff3fb', m:'#b9dfee', d:'#8dbccf' };
  const TAPE_M = { l:'#fdfcf6', m:'#ecebe2', d:'#c9c7bb' }, FILM_M = { l:'#d9eef6', m:'#b5d9e6', d:'#87b3c3' };
  const HUB_M = matOf('#f2efe6'), GEAR_M = matOf('#f4f1e8');
  // the slack loop of film hanging out past the head (sl 0..1), drooping toward the desk
  function loopPath(sl){ const p = (t) => { const a = Math.PI*t, ln = 16*sl, w = 6*sl;
      return [HEAD_TIP[0] + (HEAD_TOP[0] - HEAD_TIP[0])*t + CT_N[0]*ln*Math.sin(a) + CT_NP[0]*w*Math.sin(2*a)*.5,
              HEAD_TIP[1] + (HEAD_TOP[1] - HEAD_TIP[1])*t + CT_N[1]*ln*Math.sin(a) + CT_NP[1]*w*Math.sin(2*a)*.5]; };
    return Array.from({length:13}, (_, i) => p(i/12)); }

  // everything inside the shell, sorted through the thickness for the view
  function ctInside(st, pose, xr){
    const fp = filmPath(st), toward = vis(pose.c), items = [];
    const put = (c0, c1, svg) => items.push({ c: (c0 + c1)/2, svg });
    put(-6.6, -5, ctGear(pose, CT_S, R_SG, 34, st.ths, -6.6, -5, GEAR_M));
    put(-6.6, -5, ctGear(pose, CT_T, R_TG, 16, st.thg + .1, -6.6, -5, GEAR_M));
    if (xr){ const cl = coilParts(ctAt(pose, CT_T[0], CT_T[1], 0), pose.c, -4.9, -3.3, 4.2, 3, '#e3c25a', .5);
      put(-4.9, -3.3, cl.far + cl.near); }
    put(-8, -2.6, coaxSeg(ctAt(pose, CT_S[0], CT_S[1], 0), pose.c, { s0: -8, s1: -2.6, r0: 2.4, M: HUB_M, n: 16, w: .6, shade: toneI }));
    put(-8, -2.6, coaxSeg(ctAt(pose, CT_T[0], CT_T[1], 0), pose.c, { s0: -8, s1: -2.6, r0: 2.4, M: HUB_M, n: 16, w: .6, shade: toneI }));
    // the tape layer: posts, rolls, film, head
    let layer = '';
    for (const g of [CT_G1, CT_G2]) layer += coaxSeg(ctAt(pose, g[0], g[1], 0), pose.c, { s0: -7.8, s1: 7.8, r0: R_POST, M: HUB_M, n: 14, w: .6, shade: toneI });
    layer += ribbon(pose, fp.ret, FILM_M, .8) + ribbon(pose, fp.out, TAPE_M);
    layer += ctReel(pose, CT_S, fp.rs, R_SHUB, st.ths, TAPE_M, HUB_M);
    layer += ctReel(pose, CT_T, Math.max(fp.rt, R_THUB + .3), R_THUB, st.tht, FILM_M, matOf('#e9e4d6'), .92, true);
    put(-3, 3, layer);
    items.sort((p, q) => toward ? p.c - q.c : q.c - p.c);
    return items.map(x => x.svg).join('');
  }
  // the transfer head poking out of the nose, and the slack loop
  function ctHead(st, pose){
    const cen = ctAt(pose, CT_HC[0], CT_HC[1], 0), ax = norm(sub(ctAt(pose, CT_HC[0] + CT_N[0], CT_HC[1] + CT_N[1], 0), ctAt(pose, CT_HC[0], CT_HC[1], 0)));
    const ay = norm(sub(ctAt(pose, CT_HC[0] + CT_NP[0], CT_HC[1] + CT_NP[1], 0), ctAt(pose, CT_HC[0], CT_HC[1], 0)));
    let s = obox(cen, ax, ay, pose.c, 4.2, 2.4, 3.7, matOf('#f6f3ea'), toneI, .8);
    // the tape wrapping the front edge: a thin white band over the head's front face
    s += ribbon(pose, [ctH(1.04, -1.04), ctH(1.06, 0), ctH(1.04, 1.04)], TAPE_M, 1);
    if (st.slack > .01) s += ribbon(pose, loopPath(st.slack).map(p => p), FILM_M, .85) + ribbon(pose, loopPath(st.slack).slice(0, 6), TAPE_M, 1);
    return s;
  }
  function ctShell(st, m, pose){
    const ring = c => CT_PROF.map(([a, b]) => ctAt(pose, a, b, c)), A = ring(-SH_T), M0 = ring(0), B = ring(SH_T);
    const cdir = pose.c, ncol = kScl(cdir, -1), front = vis(cdir);
    // the opaque half: outer face with grip ridges and a sticker, read along the nose
    let colCap = '';
    if (vis(ncol)){ colCap = fill(pd(A), tone(ncol, m));
      const inset = CT_PROF.map(([a, b]) => { const dx = a - CT_CEN[0], dy = b - CT_CEN[1], l = Math.hypot(dx, dy); return ctAt(pose, CT_CEN[0] + dx*(1 - 2.2/l), CT_CEN[1] + dy*(1 - 2.2/l), -SH_T - .02); });
      colCap += `<path d="${pd(inset)}" fill="none" stroke="${INK}" stroke-width=".5" opacity=".45"/>`;
      let rid = ''; for (let i = 0; i < 6; i++){ const t = 40 + i*3.2; rid += pd([ctAt(pose, t, -14.5 + i*.2, -SH_T - .03), ctAt(pose, t + 1.2, -4 - i*.9, -SH_T - .03)], false); }
      colCap += `<path d="${rid}" fill="none" stroke="${INK}" stroke-width=".7" opacity=".6"/>`;
      const st0 = rrUV(-12, 2, 14, 13, 3).map(([a, b]) => ctAt(pose, a, b, -SH_T - .03));
      colCap += shape(st0, '#fff4d6', .6) + txOn(ctAt(pose, 1, 6.2, -SH_T - .05), pose.a, ncol, '5mm x 6m', 3.4, INK, 800)
        + txOn(ctAt(pose, 1, 10.6, -SH_T - .05), pose.a, ncol, 'CORRECTION', 2.6, INK, 700);
      colCap += ink(pd(A), 1.5); }
    const colIn = loft(A, M0, n => mix(toneI(kScl(n, -1), m), '#000000', .12), true);
    const colOut = loft(A, M0, n => tone(n, m));
    const floor = fill(pd(CT_PROF.map(([a, b]) => ctAt(pose, a, b, -7.9))), mix(m.d, m.m, .45));
    const clearW = `<g opacity=".5">${loft(M0, B, n => tone(n, CT_CLEAR))}</g>`;
    let clearCap = '';
    if (front){ clearCap = `<g opacity=".3">${fill(pd(B), CT_CLEAR.l)}</g>` + ink(pd(B), 1.2);
      const hole = Array.from({length:18}, (_, i) => { const t = i/18*2*Math.PI; return ctAt(pose, CT_T[0] + 3.4*Math.cos(t), CT_T[1] + 3.4*Math.sin(t), SH_T + .02); });
      clearCap += ink(pd(hole), .8);
      clearCap += `<path d="${pd([ctAt(pose, -14, -12, SH_T + .03), ctAt(pose, 6, 14, SH_T + .03)], false)}" stroke="#ffffff" stroke-width="2.4" opacity=".4" stroke-linecap="round"/>`
        + `<path d="${pd([ctAt(pose, 30, -16, SH_T + .03), ctAt(pose, 52, -20, SH_T + .03)], false)}" stroke="#ffffff" stroke-width="1.6" opacity=".38" stroke-linecap="round"/>`; }
    const seam = `<path d="${pd(M0)}" fill="none" stroke="${INK}" stroke-width=".6" opacity=".7"/>`;
    const inside = ctInside(st, pose, false), head = ctHead(st, pose), sil = hullInk([...A, ...B], 2.4);
    if (front) return colIn + floor + inside + colOut + clearW + seam + clearCap + head + sil;
    return inside + clearW + head + colOut + seam + colCap + sil;
  }
  const ctPts = pose => [...CT_PROF.map(([a, b]) => ctAt(pose, a, b, -SH_T)), ...CT_PROF.map(([a, b]) => ctAt(pose, a, b, SH_T)), ctAt(pose, HEAD_TIP[0], HEAD_TIP[1], 0)];

  /* ---------- the wooden pencil (2B, for answer cards) ---------- */
  const WP_R = 4.0, WP_IN = WP_R*Math.cos(Math.PI/6), WP_L = 112;      // a pencil already half used
  const WP_REST = { o: S1.dk(60, 11, ZP + WP_IN), d: S1.DU.slice(), roll: 0 };   // across the head of S1, right of its title
  const WP_WRITE_D = norm(dkv(.62, .5, .6));
  const PENCIL_Y = { l:'#ffd34d', m:'#e9b52a', d:'#a87b12' };
  function wpBody(p){
    const { o, d } = p, ph = p.roll || 0, items = [], [e1, e2] = axisFrame(d);
    const seg = (name, g, extra = '') => items.push({ name, s0: g.s0, s1: g.s1, svg: coaxSeg(o, d, { phase: ph, ...g }) + extra });
    seg('lead', { s0: 0, s1: 2.6, r0: .25, r1: .95, M: MAT.graphite, n: 12, w: .7, shade: toneI });
    seg('wood', { s0: 2.6, s1: 17, r0: .95, r1: 3.6, M: MAT.wood, n: 18, w: 1, shade: toneI });
    let pr = '';
    for (const [deg, str, col] of [[30, '2B  考试专用', INK], [210, '2B  考试专用', INK], [150, 'HB-2B', '#7a4b06']]){
      const a = ph + deg*Math.PI/180, n = kAdd(kScl(e1, Math.cos(a)), kScl(e2, Math.sin(a)));
      if (!vis(n)) continue; const v = cross(n, d);
      pr += txOn(kAdd(kAdd(kAt(o, d, 58), kScl(n, WP_IN + .04)), kScl(v, -.8)), d, n, str, 2.3, col, 800); }
    seg('body', { s0: 17, s1: 97, r0: WP_R, M: PENCIL_Y, n: 6, w: 1.4, edges: .55 }, pr);
    let rings = ''; for (const x of [98.5, 103.5]) for (const run of nearArc(kAt(o, d, x), d, 3.82, 24)) rings += pd(run, false);
    seg('ferrule', { s0: 97, s1: 105, r0: 3.78, M: MAT.steel, n: 24, w: 1, shade: toneI }, rings ? `<path d="${rings}" fill="none" stroke="${INK}" stroke-width=".5"/>` : '');
    seg('eraser', { s0: 105, s1: WP_L, r0: 3.5, r1: 3.3, M: matOf('#f4a3a8'), n: 24, w: 1, shade: toneI });
    return coaxOrder(d, items);
  }
  const wpPts = p => [...axisRing(p.o, p.d, .3, 6), ...axisRing(kAt(p.o, p.d, 17), p.d, WP_R, 8), ...axisRing(kAt(p.o, p.d, WP_L), p.d, 3.5, 8)];
  const wpLerp = (a, b, k) => ({ o: kLerp(a.o, b.o, k), d: norm(kLerp(a.d, b.d, k)), roll: (a.roll || 0) + ((b.roll || 0) - (a.roll || 0))*k });
  const wpArc = (p, k, h) => ({ ...p, o: kAdd(p.o, [0, 0, h*Math.sin(Math.PI*k)]) });

  /* ---------- its band of S1 ---------- */
  function stripSvg(u0, u1, v, z){ if (u1 - u0 < .05) return '';
    const q = [dk(u0, v - TAPE_W/2, z), dk(u1, v - TAPE_W/2, z), dk(u1, v + TAPE_W/2, z), dk(u0, v + TAPE_W/2, z)];
    return fill(pd(q), '#fdfcf8') + `<path d="${pd(q)}" fill="none" stroke="#a9a496" stroke-width=".35"/>`; }
  // a white strip lying along one of S1's lines (pu across, pv its centre line)
  function stripS1(pu0, pu1, pv, z){ if (pu1 - pu0 < .05) return '';
    const q = [S1.dk(pu0, pv - TAPE_W/2, z), S1.dk(pu1, pv - TAPE_W/2, z), S1.dk(pu1, pv + TAPE_W/2, z), S1.dk(pu0, pv + TAPE_W/2, z)];
    return fill(pd(q), '#fdfcf8') + `<path d="${pd(q)}" fill="none" stroke="#a9a496" stroke-width=".35"/>`; }
  function quizSheet(st){
    const z = ZP + .02;
    let s = '';
    for (const q of QS) s += S1.deskText(10, q.pv, z, q.q, 4.6, '#2c2a26', 700);
    s += graphite([].concat(...PEN_ANS), PEN_BLUE, .55, .95);
    // the red marks of a checked paper: ticks on the right answers, a cross on the wrong one
    const tick = pv => [S1.dk(ANS_PU + 16, pv - 1.5, z), S1.dk(ANS_PU + 18, pv + .4, z), S1.dk(ANS_PU + 22.5, pv - 5, z)];
    s += graphite([tick(QS[0].pv), tick(QS[2].pv)], '#d8443a', .6, .9);
    const c0 = QS[1].pv - 4.2, c1 = QS[1].pv + .8;
    s += graphite([[S1.dk(ANS_PU + 19, c0, z), S1.dk(ANS_PU + 24, c1, z)], [S1.dk(ANS_PU + 24, c0, z), S1.dk(ANS_PU + 19, c1, z)]], '#d8443a', .6, .9);
    if (st.fixU > FIX.pu0) s += stripS1(FIX.pu0, st.fixU, FIX.pv, ZP + .05);
    const lines = []; if (st.wrote) lines.push(...NEW_ANS); if (st.ans) lines.push(...traceStrokes(NEW_ANS, st.ans).done);
    s += graphite(lines, GRAPHITE, .5, .92);
    return s;
  }

  /* ---------- scene ---------- */
  const boxAround = (pts, r = 0) => [[0,1,2].map(i => Math.min(...pts.map(p => p[i])) - r), [0,1,2].map(i => Math.max(...pts.map(p => p[i])) + r)];
  function scene(st, m){
    const k = ease(st.xr || 0), pose = st.tp;
    let s = quizSheet(st);
    for (const r of st.runs) s += stripSvg(r.u0, r.u1, RUN.v, BH + .03);
    if (st.runU > RUN.u0) s += stripSvg(RUN.u0, st.runU, RUN.v, BH + .03);
    s += castShadow(ctPts(pose), ZP) + castShadow(wpPts(st.wp), ZP);
    let tape = act('tape', ctShell(st, m, pose));
    if (k > 0) tape = `<g opacity="${f(1 - .78*k)}">${tape}</g><g opacity="${f(k)}">${ctInside(st, pose, true)}${ctHead(st, pose)}</g>`;
    const tp = ctPts(pose), pp = wpPts(st.wp);
    s += byDepth([{ box: boxAround(tp), svg: tape }, { box: boxAround(pp), svg: wpBody(st.wp) }]);
    s += labels(st, k);
    return s;
  }
  function labels(st, k){
    const pose = st.tp, at = (a, b, c) => ctAt(pose, a, b, c), tp = ctPts(pose), fp = filmPath(st), B = [...[0, 1].flatMap(i => [Math.min(...tp.map(p => p[i])), Math.max(...tp.map(p => p[i]))]), 0, 12];
    const run = st.dragging, cfront = vis(pose.c) ? 1 : -1;
    if (k > .6) return zhCallouts([
      { at: at(CT_S[0] - fp.rs*.7, CT_S[1] + fp.rs*.7, TAPE_W/2*cfront), text: '供带轮', on: run },
      { at: at(CT_T[0] - 2, CT_T[1] + fp.rt, TAPE_W/2*cfront), text: '收带轮', on: run || st.turning },
      { at: at(CT_S[0] + R_SG*.7, CT_S[1] + R_SG*.7, -5), text: '大齿轮', on: run },
      { at: at(CT_T[0] - R_TG, CT_T[1] + 2, -5), text: '小齿轮', on: run },
      { at: at(CT_T[0] + 4.2, CT_T[1], -4), text: '滑动离合', on: run || st.turning },
      { at: at(CT_G1[0], CT_G1[1], 7), text: '导柱', on: run },
      { at: at(CT_G2[0], CT_G2[1], 7), text: '回带导柱', on: run },
      { at: at((fp.out[1][0] + fp.out[2][0])/2, (fp.out[1][1] + fp.out[2][1])/2, 0), text: '白色涂层', on: run },
      { at: at((fp.ret[1][0] + fp.ret[2][0])/2, (fp.ret[1][1] + fp.ret[2][1])/2, 0), text: '空底膜', on: run },
      { at: at(HEAD_TIP[0], HEAD_TIP[1], 0), text: '修正头', on: run } ], B);
    return zhCallouts([
      { at: at(CT_S[0] - 10, CT_S[1] - 6, SH_T*cfront), text: cfront > 0 ? '透明壳' : '外壳', on: false },
      { at: at(CT_S[0] + 4, CT_S[1] + fp.rs*.5, TAPE_W/2*cfront), text: '供带轮', on: run },
      { at: at(CT_T[0], CT_T[1] - 3, SH_T*cfront), text: '收带轮孔', on: st.turning },
      { at: at(HEAD_TIP[0], HEAD_TIP[1], 0), text: '修正头', on: run },
      ...(st.slack > .3 ? [{ at: at(...loopPath(st.slack)[6], 0), text: '松出来的带子', on: true }] : []) ], B);
  }

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { fix: '正在涂', write: '正在写', run: '跑道还没拉完', tight: '正在转紧' };
  const busy = () => { if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等一下'); return true; };
  const tapeHome = st => ({ ms: 420, start(){ this.from = st.tp; }, step(k){ st.tp = ctArc(ctLerp(this.from, REST, ease(k)), k, 12); }, end(){ st.tp = REST; } });
  const pencilHome = st => ({ ms: 420, start(){ this.from = st.wp; }, step(k){ st.wp = wpArc(wpLerp(this.from, WP_REST, ease(k)), k, 10); }, end(){ st.wp = WP_REST; } });
  // pull the head from A to B (desk terms) at height z: the coating stays behind on the surface, the reels turn
  function dragSegs(st, A, B, z, ms, onK){
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]), at = e => [A[0] + (B[0] - A[0])*e, A[1] + (B[1] - A[1])*e];
    return [
      { ms: 430, start(){ this.from = st.tp; }, step(k){ st.tp = ctArc(ctLerp(this.from, useAt(A[0], A[1], z, 4), ease(k)), k, 16); } },
      { ms: 140, step(k){ st.tp = useAt(A[0], A[1], z, 4*(1 - k)); } },
      { ms, start(){ st.dragging = true; this.e = 0; }, step(k){ const e = ease(k), du = L*(e - this.e); this.e = e; onK(e);
          const rs = rSupply(st.left); st.left = Math.max(0, st.left - du); st.ths += du/rs; st.thg = -st.ths*R_SG/R_TG;
          st.tht -= du/Math.max(R_THUB, rTake(TOTAL - st.left)); const p = at(e); st.tp = useAt(p[0], p[1], z); },
        end(){ st.dragging = false; } } ];
  }
  function wrongFix(st, then){
    if (st.fixU > FIX.pu1 - .5) return then ? then() : ui.flash(st.wrote ? '已经改好了：x=7' : '已经涂白了，写上新答案吧');
    const segs = [];
    if (st.slack > .05){ ui.flash('带子松了，先用铅笔转紧', 2000); segs.push(...tightSegs(st)); }
    const A = s1L(FIX.pu0, FIX.pv), B = s1L(FIX.pu1, FIX.pv);
    segs.push(...dragSegs(st, A, B, ZP, 900, e => { st.fixU = FIX.pu0 + (FIX.pu1 - FIX.pu0)*e; }),
      { ms: 160, step(k){ st.tp = useAt(B[0], B[1], ZP, 10*ease(k)); } }, tapeHome(st));
    kPlay(ui, 'fix', segs, () => { if (then) then(); else ui.flash('错的 x=8 涂白了，一点划痕都看不见'); });
  }
  function fixWrong(st){ if (busy()) return; wrongFix(st); }
  function writeNew(st){ if (busy()) return;
    if (st.wrote) return ui.flash('已经写好了：x=7');
    const go = () => {
      const sk = NEW_ANS, len = strokesLength(sk), at = p => ({ o: p, d: WP_WRITE_D, roll: 0 });
      kPlay(ui, 'write', [
        { ms: 460, start(){ this.from = st.wp; }, step(k){ st.wp = wpArc(wpLerp(this.from, at(sk[0][0]), ease(k)), k, 16); } },
        { ms: Math.max(600, len/30*1000), start(){ st.ans = 0; }, step(k){ st.ans = k*len; st.wp = at(traceStrokes(sk, st.ans).tip); }, end(){ st.ans = null; st.wrote = true; } },
        pencilHome(st) ], () => ui.flash('修正带是干的，马上就能写'));
    };
    if (st.fixU < FIX.pu1 - .5){ ui.flash('先把错的 x=8 涂掉'); wrongFix(st, go); } else go();
  }
  function runway(st){ if (busy()) return;
    if (st.left < 200) return ui.flash('带子快用完了，拉不出一条跑道');
    const segs = [];
    if (st.slack > .05){ segs.push(...tightSegs(st)); }
    const before = st.left;
    segs.push(...dragSegs(st, [RUN.u0, RUN.v], [RUN.u1, RUN.v], BH, 2000, e => { st.runU = RUN.u0 + (RUN.u1 - RUN.u0)*e; }),
      // yanked up while still pulling: film is dragged out past the head into a loose loop
      { ms: 260, start(){ st.runs.push({ u0: RUN.u0, u1: RUN.u1 }); st.runU = RUN.u0 - 1; },
        step(k){ st.tp = useAt(RUN.u1 + 8*k, RUN.v, BH, 22*ease(k)); st.slack = ease(k); st.left = Math.max(0, st.left - 0); } },
      tapeHome(st));
    kPlay(ui, 'run', segs, () => ui.flash(`桌上一条白跑道，用掉 ${((before - st.left)/1000).toFixed(2)} 米；一甩手，带子松出一个圈`, 2800));
  }
  // a pencil tip in the take-up spool's hex socket: turning it winds the loose film back in (the slip clutch lets it).
  // The dispenser is held up in one hand, the pencil comes in square to its clear face.
  const HOLD = useAt(...s1L(40, 106), ZP, 7);
  function tightSegs(st){
    const sock = ctAt(HOLD, CT_T[0], CT_T[1], SH_T - 4.5), dv = HOLD.c;
    const at = (back, roll) => ({ o: kAt(sock, dv, back), d: dv, roll });
    return [
      { ms: 440, start(){ this.from = st.tp; }, step(k){ st.tp = ctArc(ctLerp(this.from, HOLD, ease(k)), k, 10); }, end(){ st.tp = HOLD; } },
      { ms: 480, start(){ this.from = st.wp; }, step(k){ st.wp = wpArc(wpLerp(this.from, at(16, 0), ease(k)), k, 20); } },
      { ms: 220, step(k){ st.wp = at(16*(1 - ease(k)), 0); } },
      { ms: 1100, start(){ st.turning = true; this.s0 = st.slack; this.t0 = st.tht; },
        step(k){ const e = ease(k); st.wp = at(0, -e*6*Math.PI); st.slack = this.s0*(1 - e); st.tht = this.t0 - e*6*Math.PI; },
        end(){ st.turning = false; st.slack = 0; } },
      { ms: 220, step(k){ st.wp = at(16*ease(k), -6*Math.PI); } },
      pencilHome(st), tapeHome(st) ];
  }
  function tighten(st){ if (busy()) return;
    const was = st.slack > .05;
    kPlay(ui, 'tight', tightSegs(st), () => ui.flash(was ? '铅笔插进小齿轮的孔，转几圈带子就紧了' : '带子本来就是紧的，转了个寂寞'));
  }

  const __cfg = ({
    fig:'04', turn:'full', title:'修正带', palette:'blush',
    state:{ tp: REST, wp: WP_REST, left: TOTAL, ths: 0, thg: 0, tht: 0, fixU: FIX.pu0, wrote: false, ans: null,
      runs: [], runU: RUN.u0 - 1, slack: 0, dragging: false, turning: false },
    scene,
    stats: st => [ { label:'剩余', value: (st.left/1000).toFixed(2) + ' m' } ],
    buttons:[
      { label:'涂改', onClick: fixWrong },
      { label:'写上新答案', onClick: writeNew },
      { label:'桌上拉跑道', onClick: runway },
      { label:'铅笔转紧', onClick: tighten },
    ],
    acts:{ tape: st => fixWrong(st) },
    params:(st, q) => {
      if (q.has('left')) st.left = +q.get('left');
      if (q.get('fixed') === '1') st.fixU = FIX.pu1;
      if (q.get('wrote') === '1'){ st.fixU = FIX.pu1; st.wrote = true; }
      if (q.has('slack')) st.slack = +q.get('slack');
      if (q.get('runs') === '1') st.runs.push({ u0: RUN.u0, u1: RUN.u1 });
      const pose = q.get('pose');
      if (pose === 'use') st.tp = useAt(...s1L(FIX.pu0 + 6, FIX.pv), ZP);
      if (pose === 'run') st.tp = useAt(RUN.u0 + 80, RUN.v, BH);
      if (pose === 'tight'){ st.tp = HOLD; st.wp = { o: ctAt(HOLD, CT_T[0], CT_T[1], SH_T - 4.5), d: HOLD.c, roll: 0 }; }
      if (q.has('th')){ st.ths = +q.get('th'); st.thg = -st.ths*R_SG/R_TG; st.tht = -st.ths*2.2; }
    },
  });

  return ctx.adapt(__cfg, { seeThrough: true });
}
