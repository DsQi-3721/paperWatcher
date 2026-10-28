// Fig. 17 小鱼缸 — desk-scene object (a new one, written for the desk: no standalone page).
// Its code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*), ctx.ui its ui
// (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are collected by the scene.
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, LOD, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: -760, v: -370, rot: 0 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 17 — 小鱼缸: a small open-top glass tank (172 x 100 x 132 mm, about 2 litres) in the back-left corner of the
     desk, with two goldfish, a gravel bed, a clump of tape grass, a little castle, a hang-on-back filter, a clip-on LED
     lamp, a magnetic glass cleaner and a tub of fish food beside it. Desk terms: u along the front edge, v toward the
     student (the front glass faces the student), z up; 1 unit = 1 mm.

     How it really works (each button is one of these):
     1. The filter hangs on the back rim. Its motor is a magnetic drive: a stator coil round a sealed well, and inside
        the well a magnet rotor carrying the impeller. The coil's alternating field turns the magnet, the impeller flings
        water out of the well, which pulls tank water up the intake tube (a slotted strainer keeps the fish out) into
        the filter box. The water rises through the cartridge (white floss catches dirt, black activated carbon soaks up
        smells and colour), overflows the spillway lip and falls back into the tank: the little waterfall stirs the
        surface and puts air in (the bubbles under it).
     2. Feeding: flakes float on the surface for a while, then soak up water and sink. Goldfish come up for them. What
        is not eaten sinks to the gravel and rots: feed a little, twice a day, no more.
     3. The lamp: an LED head on a gooseneck clipped to the rim. Plants need the light; fish see better in it.
     4. Algae grows as a green film on the glass, faster with light and with leftover food. The magnetic cleaner: a
        felt pad inside the glass and a handle outside, held together through the glass by two magnets; slide the
        handle and the pad wipes the inside clean (no wet hands).
     Student life: tapping the glass makes the fish dart off (they hear it as a bang: don't); the "seven-second
     memory" (a myth: goldfish remember for months, but every lap of the tank still looks new to them); and the names a
     class gives its goldfish (来财, 金宝, 年年有余 …).

     Parts:
     TANK    four glass panes . bottom frame . top rim (four bars) . the water (sides, surface, waterline) . gravel bed
             (pebbles) . uneaten food on the gravel . algae on the front glass
     FISH    2 goldfish: body (rings), tail fin, dorsal fin, pectoral, pelvic and anal fins, eyes, mouth, gill line
     DECOR   tape grass (7 ribbon leaves) . castle (base with a gate, two towers with roofs)
     FILTER  box . lid with a grille . hanger saddle on the rim . spillway channel and lip . waterfall . bubbles .
             intake tube . slotted strainer . power cord;
             inside: sealed motor well . stator coil . magnet rotor . impeller . filter cartridge (floss, carbon) . the
             water in the box . the flow path
     LAMP    rim clamp . gooseneck . head . LED face . light
     CLEANER outer handle with a grip . inner felt pad
     FOOD    tub . label . flip cap . flakes (in the air, floating, sinking) */

  /* ---------- layout (this object's frame: desk terms from PLACE) ---------- */
  const BH = ctx.deskZ;
  const T = { u0: -86, u1: 86, v0: -37, v1: 63 };                        // the glass box, outside
  const ZB = BH + 10, ZR = BH + 124, ZT = BH + 132;                       // top of the bottom frame; the rim band
  const GT = 4;                                                           // glass thickness
  const W = { u0: T.u0 + GT, u1: T.u1 - GT, v0: T.v0 + GT, v1: T.v1 - GT };   // inside the glass
  const FL = BH + 6, GB = BH + 31, GF = BH + 21;                          // inside floor; gravel top at the back / front
  const gravelZ = v => GB + (GF - GB)*(Math.max(W.v0, Math.min(W.v1, v)) - W.v0)/(W.v1 - W.v0);
  const LEVEL = BH + 110;                                                 // the water surface
  const FB = { u0: 26, u1: 80, v0: T.v0 - 30, v1: T.v0 - 2, z0: BH + 62, z1: BH + 140 };   // the filter box behind the back glass
  const HG = { u0: 34, u1: 70 };                                          // its hanger and spillway
  const LIPV = T.v0 + 14, LIPZ = BH + 125;                                // the spillway's front edge (inside the tank)
  const INT = { u: 76, v: T.v0 + 17, r: 4.4, z0: BH + 38, zs: BH + 60, z1: ZT + 3 };   // intake tube and its strainer
  const LMP = { cu: -62, hu: -40, hv: 4, hz: BH + 166, r: 19 };          // lamp: clamp u; head centre
  const TUB = { u: 102, v: 58, r: 13, h: 40, cap: 6 };                    // fish food
  const CAS = { u: 48, v: 38 };                                           // castle
  const MAG0 = { u: -56, z: BH + 46 };                                    // the cleaner's rest on the front glass
  const SAFE = { u0: W.u0 + 14, u1: W.u1 - 14, v0: W.v0 + 10, v1: W.v1 - 10 };

  /* ---------- materials ---------- */
  const GLASS = '#e2f3f4', EDGE = '#8fc0ba';
  const WATER = ['#7fc3d4', '#b2e6ef'];                                   // lamp off / on
  const TUBE = { l:'#a7b0b2', m:'#848e90', d:'#575f61' };
  const COPPER = { l:'#f0b070', m:'#c97c3c', d:'#7d4a1e' };
  const FLOSS = { l:'#fbfaf5', m:'#e8e4d8', d:'#bdb6a4' };
  const CARBON = { l:'#55575d', m:'#3a3c41', d:'#232428' };
  const STONE = { l:'#dcd6ca', m:'#bfb7a7', d:'#8d8577' }, ROOF = { l:'#f07c5c', m:'#d9583e', d:'#8e2f1d' };
  const GRAV = { l:'#e2d4ba', m:'#c8b493', d:'#998463' }, GRAV_COL = ['#8b8176', '#f4ede0', '#b9a07a', '#6c635a', '#d6c09f'];
  const LEAF = { l:'#86c96c', m:'#5ea64c', d:'#2f6b2a' }, LEAF2 = { l:'#a3d98c', m:'#7cbc64', d:'#407e35' };
  const GOLD = { l:'#ffb45e', m:'#f28a3a', d:'#a14f1c' }, RED = { l:'#ff8d6e', m:'#e65a3d', d:'#8a2c1b' };
  const TUBW = { l:'#fbfaf4', m:'#e6e2d6', d:'#b8b1a1' }, CAPR = { l:'#f06a4c', m:'#d14d33', d:'#7f2a1a' };
  const FELT = { l:'#f4f1ea', m:'#dad5ca', d:'#a9a294' };
  const FLAKE_COL = ['#f0a33c', '#e0583e', '#93c45a', '#f2d06b'];
  const FISHES = [{ L: 31, H: 14, tail: 21, M: GOLD }, { L: 26, H: 12, tail: 18, M: RED }];
  const NAMES = ['来财', '金宝', '年年有余', '大黄', '泡泡'];

  /* ---------- small helpers ---------- */
  // fine detail (texture specks, fin rays, printed words) only when the camera is close enough to see it
  const fine = () => LOD > .7;
  // a box in this frame, compact: its visible faces' fills merged by tone, one ink path for their outlines
  function boxM(u0, v0, z0, u1, v1, z1, M, shade = tone, w = 1){
    const c = (u, v, z) => dk(u, v, z), F = [
      [DV, [c(u0, v1, z0), c(u1, v1, z0), c(u1, v1, z1), c(u0, v1, z1)]], [kScl(DV, -1), [c(u1, v0, z0), c(u0, v0, z0), c(u0, v0, z1), c(u1, v0, z1)]],
      [kScl(DU, -1), [c(u0, v0, z0), c(u0, v1, z0), c(u0, v1, z1), c(u0, v0, z1)]], [DU, [c(u1, v1, z0), c(u1, v0, z0), c(u1, v0, z1), c(u1, v1, z1)]],
      [[0, 0, 1], [c(u0, v0, z1), c(u1, v0, z1), c(u1, v1, z1), c(u0, v1, z1)]], [[0, 0, -1], [c(u0, v0, z0), c(u0, v1, z0), c(u1, v1, z0), c(u1, v0, z0)]] ];
    const byCol = {}; let ed = '';
    for (const [n, q] of F){ if (!vis(n)) continue; const d = pd(q), col = shade(n, M); byCol[col] = (byCol[col] || '') + d; ed += d; }
    return Object.entries(byCol).map(([col, d]) => `<path d="${d}" fill="${col}" stroke="${col}" stroke-width=".7"/>`).join('') + (ed ? ink(ed, w) : '');
  }
  const boxOf = (pts, r = 0) => [[0,1,2].map(i => Math.min(...pts.map(p => p[i])) - r), [0,1,2].map(i => Math.max(...pts.map(p => p[i])) + r)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ringAt = (u, v, z, r, n = 24, ph = 0) => Array.from({length: n}, (_, i) => { const t = ph + i/n*2*Math.PI; return dk(u + r*Math.cos(t), v + r*Math.sin(t), z); });
  const circ = (p, r, col, w = .45) => { const q = P(...p); return `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${f(Math.max(.2, r*CAM_K))}" fill="${col}" stroke="${INK}" stroke-width="${w}"/>`; };
  const rotAbout = (v, k, a) => { const c = Math.cos(a), s2 = Math.sin(a), d = dot(k, v), x = cross(k, v); return [0, 1, 2].map(i => v[i]*c + x[i]*s2 + k[i]*d*(1 - c)); };
  const blend = (a, b, t) => a + (b - a)*t;
  // a point on a quad (q0 bottom-left, q1 bottom-right, q2 top-right, q3 top-left) at (a across, b up), 0..1
  const onQuad = (q, a, b) => kLerp(kLerp(q[0], q[1], a), kLerp(q[3], q[2], a), b);
  const rndA = kRng(4242);

  /* ---------- the glass box ---------- */
  const WALLS = [
    { id: 'front', n: DV, a: [T.u0, T.v1], b: [T.u1, T.v1] },
    { id: 'back', n: kScl(DV, -1), a: [T.u1, T.v0], b: [T.u0, T.v0] },
    { id: 'left', n: kScl(DU, -1), a: [T.u0, T.v0], b: [T.u0, T.v1] },
    { id: 'right', n: DU, a: [T.u1, T.v1], b: [T.u1, T.v0] } ];
  const paneQ = w => [dk(w.a[0], w.a[1], ZB), dk(w.b[0], w.b[1], ZB), dk(w.b[0], w.b[1], ZR), dk(w.a[0], w.a[1], ZR)];
  const BARS = [
    { id: 'front', n: DV, b: [T.u0 - 2, T.v1 - 4, T.u1 + 2, T.v1 + 2] },
    { id: 'back', n: kScl(DV, -1), b: [T.u0 - 2, T.v0 - 2, T.u1 + 2, T.v0 + 4] },
    { id: 'left', n: kScl(DU, -1), b: [T.u0 - 2, T.v0 + 4, T.u0 + 4, T.v1 - 4] },
    { id: 'right', n: DU, b: [T.u1 - 4, T.v0 + 4, T.u1 + 2, T.v1 - 4] } ];
  const barItem = (bar, M) => ({ box: boxOf(deskBoxPts(bar.b[0], bar.b[1], ZR, bar.b[2], bar.b[3], ZT)), svg: boxM(bar.b[0], bar.b[1], ZR, bar.b[2], bar.b[3], ZT, M, tone, 1) });
  const tankPts = () => deskBoxPts(T.u0 - 2, T.v0 - 2, BH, T.u1 + 2, T.v1 + 2, ZT);

  function paneSvg(w, near, st){
    const q = paneQ(w);
    let s = fill(pd(q), GLASS, `${'pointer-events="none" '}opacity="${near ? .14 : .22}"`);
    if (near){   // two streaks of reflected light
      for (const [a0, b0, a1, b1, wd] of [[.1, .9, .3, .22, 1.6], [.2, .94, .34, .5, 1]])
        s += `<path d="${pd([onQuad(q, a0, b0), onQuad(q, a1, b1)], false)}" stroke="#ffffff" stroke-width="${wd}" opacity=".5" stroke-linecap="round" pointer-events="none"/>`;
    }
    return s;
  }
  // the glass edges at the four corners: a green line (the glass seen edge-on) with fine ink each side
  function cornerSvg(c, near){
    const a = dk(c[0], c[1], ZB), b = dk(c[0], c[1], ZR);
    return `<path d="${pd([a, b], false)}" stroke="${EDGE}" stroke-width="${near ? 2.2 : 1.6}" opacity="${near ? .9 : .55}" stroke-linecap="round"/>`
      + `<path d="${pd([a, b], false)}" stroke="${INK}" stroke-width=".5" opacity="${near ? .8 : .4}"/>`;
  }

  /* ---------- algae on the front glass (inside) ---------- */
  const BLOTS = (() => { const r = kRng(77), out = [];
    for (let i = 0; i < 12; i++){ const p1 = r()*6, p2 = r()*6;
      out.push({ u: W.u0 + 12 + r()*(W.u1 - W.u0 - 24), z: ZB + 16 + r()*(LEVEL - ZB - 28), r: 6 + r()*7, e: .55 + r()*.5, a: r()*Math.PI, w: Array.from({length: 18}, (_, j) => 1 + .12*Math.sin(j/18*2*Math.PI*2 + p1) + .07*Math.sin(j/18*2*Math.PI*3 + p2)) }); }
    return out; })();
  function algaeSvg(st){
    let s = ''; const v = W.v1 - .3;
    BLOTS.forEach((b, i) => { const al = st.alg[i]; if (al < .03) return;
      const pts = b.w.filter((_, j) => fine() || j % 2 === 0).map((wq, j, ws) => { const t = j/ws.length*2*Math.PI, x = b.r*wq*Math.cos(t), y = b.r*b.e*wq*Math.sin(t);
        return dk(b.u + x*Math.cos(b.a) - y*Math.sin(b.a), v, Math.min(st.level - 1, b.z + x*Math.sin(b.a) + y*Math.cos(b.a))); });
      s += fill(pd(pts), '#7aa857', `pointer-events="none" opacity="${f(.26*al)}"`); });
    return s;
  }

  /* ---------- gravel ---------- */
  const SPECK = (() => { const r = kRng(171), mk = n => Array.from({length: n}, () => [r(), r(), .7 + r()*1.1, Math.floor(r()*5), r()*Math.PI]);
    return { top: mk(78), front: mk(36), back: mk(36), left: mk(18), right: mk(18) }; })();
  function gravelSvg(st){
    const tq = [dk(W.u0, W.v1, GF), dk(W.u1, W.v1, GF), dk(W.u1, W.v0, GB), dk(W.u0, W.v0, GB)];   // the top: front edge first
    const bq = [dk(W.u0, W.v1, FL), dk(W.u1, W.v1, FL), dk(W.u1, W.v0, FL), dk(W.u0, W.v0, FL)];
    const faces = [
      { id: 'front', n: DV, q: [bq[0], bq[1], tq[1], tq[0]] }, { id: 'back', n: kScl(DV, -1), q: [bq[2], bq[3], tq[3], tq[2]] },
      { id: 'left', n: kScl(DU, -1), q: [bq[3], bq[0], tq[0], tq[3]] }, { id: 'right', n: DU, q: [bq[1], bq[2], tq[2], tq[1]] },
      { id: 'top', n: [0, 0, 1], q: tq } ];
    let s = '';
    const dots = GRAV_COL.map(() => '');
    for (const fc of faces){ if (!vis(fc.n)) continue;
      s += face(pd(fc.q), toneI(fc.n, GRAV));
      const e1 = norm(sub(fc.q[1], fc.q[0])), e2 = norm(sub(fc.q[3], fc.q[0]));
      const fk = fine(), list = fk ? SPECK[fc.id] : SPECK[fc.id].filter((_, i) => i % 3 === 0), np = fk ? 6 : 4;
      for (const [a, b, r, ci, rot] of list){ const c = onQuad(fc.q, .02 + a*.96, .04 + b*.92);
        const pts = Array.from({length: np}, (_, j) => { const t = j/np*2*Math.PI + rot; return kAdd(kAdd(c, kScl(e1, r*1.25*Math.cos(t))), kScl(e2, r*.85*Math.sin(t))); });
        dots[ci] += pd(pts); } }
    s += dots.map((d, i) => d ? `<path d="${d}" fill="${GRAV_COL[i]}"${fine() ? ` stroke="${INK}" stroke-width=".25"` : ''}/>` : '').join('');
    // food nobody ate, rotting on the gravel
    for (const db of st.debris){ const z = gravelZ(db.v) + .2;
      const pts = Array.from({length: 5}, (_, j) => { const t = j/5*2*Math.PI + db.a; return dk(db.u + 1.3*Math.cos(t), db.v + .9*Math.sin(t), z); });
      s += fill(pd(pts), '#7a5a2e', 'opacity=".85"'); }
    return s;
  }

  /* ---------- tape grass ---------- */
  const PLANT = (() => { const r = kRng(57), out = [];
    for (let i = 0; i < 7; i++) out.push({ u: -68 + i*6.5 + r()*4, v: -16 + r()*12, L: 60 + r()*30, lu: (r() - .62)*30, lv: (r() - .25)*20, tw: (r() - .5)*2.4, ph: r()*Math.PI*2, w: 2.3 + r()*.9 });
    return out; })();
  function leafItem(lf, st){
    const z0 = gravelZ(lf.v) - 1, N = fine() ? 9 : 5, sway = 3.2*Math.sin(st.t*1.7 + lf.ph), top = Math.min(lf.L, st.level - z0 - 7), pts = [];
    for (let i = 0; i <= N; i++){ const t = i/N, c = dk(lf.u + (lf.lu + sway*t)*t*t, lf.v + lf.lv*t*t, z0 + top*t);
      const a = lf.ph + lf.tw*t, w = dkv(Math.cos(a), Math.sin(a), 0), hw = lf.w*(1 - .78*t);
      pts.push([kAdd(c, kScl(w, -hw)), kAdd(c, kScl(w, hw))]); }
    let s = '';
    for (let i = 0; i < N; i++){ const q = [pts[i][0], pts[i][1], pts[i+1][1], pts[i+1][0]];
      const n = norm(cross(sub(q[1], q[0]), sub(q[3], q[0])));
      s += face(pd(q), vis(n) ? toneI(n, LEAF) : toneI(kScl(n, -1), LEAF2)); }
    s += ink(pd([...pts.map(p => p[0]), ...pts.slice().reverse().map(p => p[1])]), .55);
    return { box: boxOf(pts.flat(), .5), svg: s };
  }

  /* ---------- castle ---------- */
  function castleItems(){
    const z0 = gravelZ(CAS.v) - 2, out = [];
    const bu0 = CAS.u - 15, bu1 = CAS.u + 15, bv0 = CAS.v - 8, bv1 = CAS.v + 8, bz1 = z0 + 13;
    let base = boxM(bu0, bv0, z0, bu1, bv1, bz1, STONE, toneI, .8);
    // stones drawn on the walls that show, and the gate on the front
    let st_ = '';
    if (fine()) for (const [n, fn] of [[DV, (a, z) => dk(bu0 + a, bv1 + .05, z)], [kScl(DV, -1), (a, z) => dk(bu1 - a, bv0 - .05, z)]]) if (vis(n))
      for (const z of [z0 + 5, z0 + 9]) st_ += pd([fn(1, z), fn(29, z)], false);
    if (st_) base += `<path d="${st_}" fill="none" stroke="${STONE.d}" stroke-width=".45"/>`;
    if (vis(DV)){ const g = [dk(CAS.u - 4.5, bv1 + .06, z0 + 2), dk(CAS.u + 4.5, bv1 + .06, z0 + 2), ...Array.from({length: 7}, (_, i) => { const t = i/6*Math.PI; return dk(CAS.u + 4.5*Math.cos(t), bv1 + .06, z0 + 7 + 4.5*Math.sin(t)); })];
      base += fill(pd(g), '#3a332c') + ink(pd(g), .5); }
    out.push({ box: boxOf(deskBoxPts(bu0, bv0, z0, bu1, bv1, bz1)), svg: base });
    for (const tw of [{ u: CAS.u - 8, v: CAS.v, r: 6.5, h: 24, rh: 13 }, { u: CAS.u + 9, v: CAS.v - 1, r: 5, h: 15, rh: 10 }]){
      const nt = fine() ? 16 : 10, A = ringAt(tw.u, tw.v, bz1, tw.r, nt), B = ringAt(tw.u, tw.v, bz1 + tw.h, tw.r, nt);
      let s = loft(A, B, n => toneI(n, STONE)) + hullInk([...A, ...B], .8);
      if (fine() && vis(DV)){ const wz = bz1 + tw.h*.55, wpt = [dk(tw.u - 1.2, tw.v + tw.r + .05, wz - 3), dk(tw.u + 1.2, tw.v + tw.r + .05, wz - 3), dk(tw.u + 1.2, tw.v + tw.r + .05, wz + 2), dk(tw.u, tw.v + tw.r + .05, wz + 3.2), dk(tw.u - 1.2, tw.v + tw.r + .05, wz + 2)]; s += fill(pd(wpt), '#3a332c'); }
      const R0 = ringAt(tw.u, tw.v, bz1 + tw.h, tw.r + 1.6, nt), apex = dk(tw.u, tw.v, bz1 + tw.h + tw.rh);
      s += loft(R0, R0.map(() => apex), n => toneI(n, ROOF)) + hullInk([...R0, apex], .8);
      out.push({ box: boxOf([...A, ...B, apex]), svg: s });
    }
    return out;
  }

  /* ---------- a goldfish: pose { p: [u, v, z] its middle, yaw, pitch, tail (phase), amp (bend) } ---------- */
  const PROF = [[0, .32, .26], [.08, .66, .58], [.2, .93, .88], [.36, 1, 1], [.52, .95, .93], [.66, .78, .74], [.8, .52, .48], [.92, .33, .3], [1, .25, .22]];
  const profAt = (t, k) => { for (let i = 1; i < PROF.length; i++) if (t <= PROF[i][0]){ const a = PROF[i-1], b = PROF[i], e = (t - a[0])/(b[0] - a[0]); return a[k] + (b[k] - a[k])*e; } return PROF[PROF.length - 1][k]; };
  const TAILP = [[0, 2.6], [5, 6.6], [13, 11.6], [19, 10.2], [16, 4.2], [11.5, 1], [16, -2.2], [19, -9.2], [13, -11.4], [5, -6.4], [0, -2.6]];
  function fishGeom(fs, dim){
    const cy = Math.cos(fs.yaw), sy = Math.sin(fs.yaw), cp = Math.cos(fs.pitch), spt = Math.sin(fs.pitch);
    const fw = norm(kAdd(kScl(dkv(cy, sy, 0), cp), [0, 0, spt])), side = norm(dkv(-sy, cy, 0)), up = norm(cross(fw, side));
    const c0 = dk(fs.p[0], fs.p[1], fs.p[2]), Lb = dim.L, hh = dim.H/2, ww = hh*.62, A = fs.amp, ph = fs.tail;
    const ctr = t => kAdd(kAdd(c0, kScl(fw, Lb*(.5 - t))), kScl(side, A*Math.sin(ph - 2.8*t)*t*t));
    const fk = fine(), nr = fk ? 14 : 9, prof = fk ? PROF : PROF.filter((_, i) => i !== 1 && i !== 4 && i !== 7);
    const rings = prof.map(([t, ph_, pw]) => { const c = ctr(t); return Array.from({length: nr}, (_, j) => { const a = j/nr*2*Math.PI;
      return kAdd(kAdd(c, kScl(side, ww*pw*Math.cos(a))), kScl(up, hh*ph_*(Math.sin(a) - .08))); }); });
    return { fw, side, up, ctr, rings, hh, ww };
  }
  function fishItem(fs, dim, i){
    const G = fishGeom(fs, dim), { fw, side, up, ctr, rings, hh, ww } = G, M = dim.M;
    const sc = dim.L/32, sN = vis(side) ? 1 : -1;
    const fk = fine();
    const fin = (pts, op = .86, rays = []) => fill(pd(pts), M.l, `opacity="${op}"`) + ink(pd(pts), .55)
      + (fk && rays.length ? `<path d="${rays.map(r => pd(r, false)).join('')}" fill="none" stroke="${M.d}" stroke-width=".4" opacity=".55"/>` : '');
    // tail: in the plane of its own direction (the bent body's end, beating) and up
    const tb = ctr(1), td0 = norm(sub(tb, ctr(.9))), wag = .3*Math.sin(fs.tail - 3.4)*fs.amp/2.6;
    const tdir = norm(rotAbout(td0, up, wag)), tup = norm(sub(up, kScl(tdir, dot(up, tdir))));
    const tP = ([x, y]) => kAdd(kAdd(tb, kScl(tdir, x*dim.tail/19)), kScl(tup, y*dim.tail/19*.95));
    const tailPts = TAILP.map(tP);
    const tail = fin(tailPts, .82, [[tP([0, 0]), tP([19, 10.2])], [tP([0, 0]), tP([16, 4.2])], [tP([0, 0]), tP([16, -2.2])], [tP([0, 0]), tP([19, -9.2])]]);
    // fins on the body
    const top = t => kAdd(ctr(t), kScl(up, hh*profAt(t, 1)*.9));
    const bot = t => kAdd(ctr(t), kScl(up, -hh*profAt(t, 1)*.98));
    const dorsal = fin([top(.3), kAdd(top(.36), kScl(up, 6*sc)), kAdd(top(.5), kScl(up, 7.5*sc)), kAdd(top(.62), kScl(up, 4.5*sc)), top(.72)], .9,
      [[top(.42), kAdd(top(.44), kScl(up, 6.5*sc))], [top(.56), kAdd(top(.56), kScl(up, 5.5*sc))]]);
    const anal = !fk ? '' : fin([bot(.7), kAdd(bot(.78), kAdd(kScl(up, -5*sc), kScl(fw, -2*sc))), kAdd(bot(.86), kScl(up, -3*sc)), bot(.86)], .85);
    // paired fins: a small fan from the lower flank, spread out sideways, back and down
    const fan = (t, s, out, back, down, low) => { const b0 = kAdd(kAdd(ctr(t), kScl(side, s*ww*profAt(t, 2)*.82)), kScl(up, -hh*profAt(t, 1)*low));
      const at_ = (a, b, c) => kAdd(b0, kAdd(kScl(fw, -a), kAdd(kScl(side, s*b), kScl(up, -c))));
      const pts = [b0, at_(back*.4, out, down*.35), at_(back*.82, out*.9, down*.75), at_(back, out*.4, down), at_(back*.45, 0, down*.2)];
      return fin(pts, .72, [[b0, pts[1]], [b0, pts[2]], [b0, pts[3]]]); };
    const pect = s => fan(.27, s, 7*sc, 9*sc, 3.6*sc, .45);
    const pelv = s => fk ? fan(.55, s, 3.2*sc, 6.5*sc, 5.2*sc, .75) : '';
    // the body: rings lofted, its nose closed
    let body = '';
    for (let j = 0; j < rings.length - 1; j++) body += loft(rings[j], rings[j + 1], n => tone(n, M));
    if (vis(fw)) body += fill(pd(rings[0]), tone(fw, M));
    const outline = hullInk(rings.flat(), 1);
    // the eye on the side toward the viewer, the gill line, the mouth
    const t0 = .15, ec = kAdd(kAdd(ctr(t0), kScl(up, hh*.3)), kScl(side, sN*ww*profAt(t0, 2)*.86));
    const disc = (c, r, dx = 0) => Array.from({length: 10}, (_, j) => { const t = j/10*2*Math.PI; return kAdd(c, kAdd(kScl(fw, r*Math.cos(t) + dx), kScl(up, r*Math.sin(t)))); });
    const eye = fill(pd(disc(ec, 2.1*sc)), '#ffffff') + (fk ? ink(pd(disc(ec, 2.1*sc)), .45) : '') + fill(pd(disc(ec, 1.25*sc, .35*sc)), '#1b1714') + (fk ? fill(pd(disc(kAdd(ec, kScl(up, .55*sc)), .35*sc, .7*sc)), '#ffffff') : '');
    const gc = ctr(.27), gill = !fk ? '' : `<path d="${pd(Array.from({length: 6}, (_, j) => { const a = -1.1 + j/5*2; return kAdd(kAdd(gc, kScl(side, sN*ww*profAt(.27, 2)*.98)), kAdd(kScl(up, hh*.8*Math.sin(a)), kScl(fw, -1.4*Math.cos(a)*sc))); }), false)}" fill="none" stroke="${M.d}" stroke-width=".55"/>`;
    const mouth = fk && vis(fw) ? fill(pd(Array.from({length: 8}, (_, j) => { const t = j/8*2*Math.PI; return kAdd(kAt(ctr(0), fw, .3), kAdd(kScl(side, 1.1*sc*Math.cos(t)), kScl(up, .7*sc*Math.sin(t) - hh*.05))); })), '#5a2a14') : '';
    const tailNear = dot(tdir, CAM_V) > 0;
    let s = anal + pect(-sN) + pelv(-sN) + (tailNear ? '' : tail) + body + outline + dorsal + gill + eye + mouth + pect(sN) + pelv(sN) + (tailNear ? tail : '');
    return { box: boxOf([...rings.flat(), ...tailPts], 1), svg: act('fish' + i, s), mouth: ctr(0) };
  }
  const mouthOf = (fs, dim) => { const c = Math.cos(fs.pitch); return [fs.p[0] + Math.cos(fs.yaw)*c*dim.L/2, fs.p[1] + Math.sin(fs.yaw)*c*dim.L/2, fs.p[2] + Math.sin(fs.pitch)*dim.L/2]; };

  /* ---------- the filter ---------- */
  function filterBox(m){
    let s = boxM(FB.u0, FB.v0, FB.z0, FB.u1, FB.v1, FB.z1, m, tone, 1.2);
    const LID = matOf(mix(m.d, '#000000', .15));
    s += boxM(FB.u0 - 1.5, FB.v0 - 1.5, FB.z1, FB.u1 + 1.5, FB.v1, FB.z1 + 4, LID, tone, 1);
    if (fine() && vis([0, 0, 1])){ let g = ''; for (let u = FB.u0 + 8; u < FB.u1 - 6; u += 5) g += pd([dk(u, FB.v0 + 5, FB.z1 + 4.05), dk(u, FB.v1 - 6, FB.z1 + 4.05)], false);
      s += `<path d="${g}" fill="none" stroke="${INK}" stroke-width=".7" opacity=".6"/>`; }
    if (fine() && vis(kScl(DV, -1))) s += txOn(dk((FB.u0 + FB.u1)/2, FB.v0 - .05, FB.z0 + 46), kScl(DU, -1), kScl(DV, -1), 'MINI FILTER', 4.2, '#ffffff', 800)
      + txOn(dk((FB.u0 + FB.u1)/2, FB.v0 - .05, FB.z0 + 38), kScl(DU, -1), kScl(DV, -1), '3W 静音', 3.4, '#ffffff', 700);
    return s;
  }
  // the saddle over the rim and the channel inside the tank that the water spills from
  function hangerSvg(m){
    return boxM(HG.u0, T.v0 - 3, ZT, HG.u1, T.v0 + 6, ZT + 6, m, tone, 1);
  }
  function spillSvg(st, m){
    const z1 = LIPZ;
    // the plate down the inside of the back glass, then the channel out from it
    let s = boxM(HG.u0, T.v0 + 4, z1 - 4, HG.u1, T.v0 + 6, ZT, m, tone, .9) + boxM(HG.u0, T.v0 + 6, z1 - 4, HG.u1, LIPV, z1, m, tone, .9);
    const wq = [dk(HG.u0 + 2.5, T.v0 + 6, z1 + .25), dk(HG.u1 - 2.5, T.v0 + 6, z1 + .25), dk(HG.u1 - 2.5, LIPV, z1 + .25), dk(HG.u0 + 2.5, LIPV, z1 + .25)];
    if (vis([0, 0, 1])) s += fill(pd(wq), '#a6dcec', 'opacity=".85"');
    // the falling sheet: over the lip, curving out a little, down to the surface
    const lv = st.level, N = fine() ? 6 : 3, ed = [];
    for (let i = 0; i <= N; i++){ const t = i/N; ed.push([LIPV + 4*Math.sqrt(t), z1 + .2 - (z1 + .2 - lv)*t*t]); }
    const sheet = [...ed.map(([v, z]) => dk(HG.u0 + 3, v, z)), ...ed.slice().reverse().map(([v, z]) => dk(HG.u1 - 3, v, z))];
    s += fill(pd(sheet), '#a9dff0', 'pointer-events="none" opacity=".6"');
    let str = ''; if (fine()) for (let u = HG.u0 + 7; u < HG.u1 - 5; u += 6) str += pd(ed.map(([v, z]) => dk(u, v + .1, z)), false);
    s += (str ? `<path d="${str}" fill="none" stroke="#ffffff" stroke-width=".7" opacity=".7"/>` : '') + ink(pd(sheet), .35);
    return s;
  }
  const BUB = (() => { const r = kRng(91); return Array.from({length: 10}, () => ({ u: HG.u0 + 6 + r()*(HG.u1 - HG.u0 - 12), v: LIPV + 3 + r()*10, d: 2 + r()*26, r: .5 + r()*1.1 })); })();
  function bubblesSvg(st){ let s = ''; for (const b of fine() ? BUB : BUB.slice(0, 4)){ const z = st.level - b.d - ((st.t*24 + b.d*3) % 6); s += circ(dk(b.u, b.v, z), b.r, '#effbff', .4); } return s; }
  function intakeSvg(lo, hi){
    let s = '';
    const a = Math.max(lo, INT.zs), b = Math.min(hi, INT.z1), o = dk(INT.u, INT.v, 0);
    if (b > a) s += coaxSeg(o, [0, 0, 1], { s0: a, s1: b, r0: INT.r, M: TUBE, n: 16, w: .9, shade: toneI, cap: b < INT.z1 - .01 ? false : undefined });
    const c = Math.max(lo, INT.z0), d = Math.min(hi, INT.zs);
    if (d > c){ s = coaxSeg(o, [0, 0, 1], { s0: c, s1: d, r0: 6.5, M: TUBE, n: 18, w: .9, shade: toneI }) + s;
      let sl = ''; if (fine()) for (let j = 0; j < 14; j++){ const t = j/14*2*Math.PI, rd = dkv(Math.cos(t), Math.sin(t), 0); if (!vis(rd)) continue;
        sl += pd([kAdd(dk(INT.u, INT.v, Math.max(c, INT.z0 + 3)), kScl(rd, 6.55)), kAdd(dk(INT.u, INT.v, Math.min(d, INT.zs - 3)), kScl(rd, 6.55))], false); }
      s += sl ? `<path d="${sl}" fill="none" stroke="#2c3133" stroke-width="1"/>` : ''; }
    return s;
  }
  const intakeBox = (lo, hi) => [[...dk(INT.u, INT.v, lo)].map((x, i) => i < 2 ? x - 7 : lo), [...dk(INT.u, INT.v, hi)].map((x, i) => i < 2 ? x + 7 : hi)];
  // the intake's elbow: a fitting on the tube's top, a bend back over the rim into the filter box
  function elbowSvg(){
    const top = dk(INT.u, INT.v, INT.z1), back = dk(INT.u, FB.v1 + 1, INT.z1);
    const fit = coaxSeg(dk(INT.u, INT.v, 0), [0, 0, 1], { s0: INT.z1 - 3, s1: INT.z1 + 3.5, r0: INT.r + 1, M: TUBE, n: 16, w: .9, shade: toneI });
    const run = rod(top, back, INT.r - .4, TUBE, toneI, .9, INT.r - .4, 14);
    return vis(DV) ? run + fit : fit + run;
  }
  // the power cord: down from the filter to the desk, then back (this frame's -v) along the desk to its edge and over
  // it (wherever the tank has been moved to: ctx.onDesk knows); if no edge comes within reach it ends on the desk
  function cordSvg(){
    const pts = [dk(66, FB.v0, FB.z0 + 8), dk(66, FB.v0 - 9, FB.z0 - 6), dk(64, FB.v0 - 14, BH + 30), dk(62, FB.v0 - 18, BH + 2.2)];
    const v0 = FB.v0 - 18, at = v => [62 - 5*Math.sin((v0 - v)/70), v], on_ = v => ctx.onDesk(dk(...at(v), BH));
    let v = v0; const MAX = 400;
    while (v0 - v < MAX && on_(v - 8)) v -= 8;
    while (v0 - v < MAX && on_(v - 1)) v -= 1;
    for (let w = v0 - 30; w > v; w -= 30) pts.push(dk(...at(w), BH + 2.2));
    if (v0 - v < MAX){ const [u1] = at(v); pts.push(dk(u1, v, BH + 2.2), dk(u1, v - 2.5, BH + 1), dk(u1, v - 3.5, BH - 3)); }
    else pts.push(dk(...at(v), BH + 2.2));
    const d = pd(pts, false);
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#4a4744" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  // see-through: the motor well, its coil and magnet rotor, the impeller, the cartridge, the water, the way it flows
  function filterMech(st){
    const parts = [], wu = 66, wv = -48, z0 = FB.z0 + 4;
    const put = (bx, svg) => parts.push({ box: bx, svg });
    const water = boxM(FB.u0 + 2, FB.v0 + 2, FB.z0 + 2, FB.u1 - 2, FB.v1 - 2, LIPZ, { l:'#bfe6f0', m:'#9fd2e0', d:'#78b3c4' }, toneI, .4);
    let s = `<g opacity=".32">${water}</g>`;
    // the sealed well (clear) with the magnet rotor in it, the coil round it, the impeller on top
    const wellA = ringAt(wu, wv, z0, 9, 20), wellB = ringAt(wu, wv, z0 + 24, 9, 20);
    const coilA = ringAt(wu, wv, z0 + 6, 13.5, 24), coilB = ringAt(wu, wv, z0 + 18, 13.5, 24);
    const holeA = ringAt(wu, wv, z0 + 6, 9.4, 20), holeB = ringAt(wu, wv, z0 + 18, 9.4, 20);
    let wd = ''; for (let j = 0; j < 30; j++){ const t = j/30*2*Math.PI, rd = dkv(Math.cos(t), Math.sin(t), 0); if (vis(rd)) wd += pd([kAdd(dk(wu, wv, z0 + 6.5), kScl(rd, 13.55)), kAdd(dk(wu, wv, z0 + 17.5), kScl(rd, 13.55))], false); }
    // the rotor: a magnet half red (N), half blue (S), turning with the impeller
    const rot = st.t*22, half = (a0, col) => { const A = Array.from({length: 9}, (_, j) => { const t = rot + a0 + j/8*Math.PI; return dk(wu + 6*Math.cos(t), wv + 6*Math.sin(t), z0 + 8); });
      const B = A.map(p => [p[0], p[1], z0 + 19]); return { side: loft([...A, dk(wu, wv, z0 + 8)], [...B, dk(wu, wv, z0 + 19)], n => toneI(n, col)), top: fill(pd(B), col.l) + ink(pd(B), .4) }; };
    const hN = half(0, { l:'#ef7a64', m:'#cf5038', d:'#7d2a1c' }), hS = half(Math.PI, { l:'#7fa6e6', m:'#5a82c6', d:'#2b3f6e' });
    let imp = ''; for (let j = 0; j < 5; j++){ const t = rot + j/5*2*Math.PI, d = dkv(Math.cos(t), Math.sin(t), 0), e = dkv(-Math.sin(t), Math.cos(t), 0);
      imp += obox(kAdd(dk(wu, wv, z0 + 21.5), kScl(d, 4.2)), d, e, [0, 0, 1], 4, .45, 2, FLOSS, toneI, .5); }
    const well = `<g opacity=".45">${loft(wellA, wellB, n => toneI(n, MAT.clear))}</g>` + ink(pd(wellB), .6);
    const coil = loft(holeA, holeB, n => toneI(n, COPPER), true) + hN.side + hS.side + loft(coilA, coilB, n => toneI(n, COPPER))
      + `<path d="${wd}" fill="none" stroke="${COPPER.d}" stroke-width=".45"/>`
      + `<path d="${pd(coilB)}${pd(holeB.slice().reverse())}" fill="${COPPER.m}" fill-rule="evenodd"/>` + ink(pd(holeB), .5) + hullInk([...coilA, ...coilB], .8);
    put(boxOf([...coilA, ...coilB, dk(wu, wv, z0 + 24)], 1), coil + hN.top + hS.top + imp + well);
    // the cartridge: a frame with floss facing the motor side, carbon granules behind it
    const cv0 = -45, cv1 = -41, cz0 = FB.z0 + 30, cz1 = FB.z1 - 10;
    let cart = boxM(FB.u0 + 4, cv0, cz0, FB.u1 - 4, cv1, cz1, FLOSS, toneI, .8);
    const r = kRng(3); let gr = '';
    const fv = vis(DV) ? cv1 + .05 : cv0 - .05;
    for (let i = 0; i < 46; i++){ const c = dk(FB.u0 + 7 + r()*(FB.u1 - FB.u0 - 14), fv, cz0 + 3 + r()*(cz1 - cz0 - 6)); gr += pd(Array.from({length: 5}, (_, j) => { const t = j/5*2*Math.PI; return kAdd(c, kAdd(kScl(DU, 1.1*Math.cos(t)), [0, 0, 1.1*Math.sin(t)])); })); }
    cart += `<path d="${gr}" fill="${CARBON.m}"/>`;
    put(boxOf(deskBoxPts(FB.u0 + 4, cv0, cz0, FB.u1 - 4, cv1, cz1)), cart);
    // the intake's way up over the rim and down into the well
    const ip = [dk(INT.u, INT.v, INT.z1), dk(INT.u, T.v0 - 1, ZT + 1), dk(wu + 6, FB.v1 - 6, FB.z1 - 6), dk(wu, wv, z0 + 24)];
    let tube = ''; for (let i = 0; i < ip.length - 1; i++) tube += rod(ip[i], ip[i + 1], 3.6, TUBE, toneI, .7, 3.6, 12);
    put(boxOf(ip, 4), `<g opacity=".8">${tube}</g>`);
    s += byDepth(parts);
    // the flow: up the intake, through the impeller, up through the cartridge, over the lip
    const fl = [[dk(INT.u - 9, INT.v, INT.z0 + 6), dk(INT.u - 9, INT.v, INT.z1 - 6)],
      [dk(wu - 14, wv - 6, z0 + 12), dk(FB.u0 + 8, FB.v0 + 6, cz1 - 4), dk(FB.u0 + 8, cv0 - 2, cz1 - 2)],
      [dk(40, cv1 + 2, cz0 + 10), dk(40, FB.v1 - 3, LIPZ - 6), dk(46, LIPV - 2, LIPZ + 1.5)],
      [dk(56, LIPV + 3, LIPZ - 4), dk(56, LIPV + 6, st.level - 10)]];
    for (const pth of fl){ const d = pd(pth, false), a = P(...pth[pth.length - 2]), b = P(...pth[pth.length - 1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const hd = [[b[0], b[1]], [b[0] - 4*Math.cos(ang - .45), b[1] - 4*Math.sin(ang - .45)], [b[0] - 4*Math.cos(ang + .45), b[1] - 4*Math.sin(ang + .45)]];
      s += `<path d="${d}" fill="none" stroke="#2f7fd8" stroke-width="1.3" stroke-dasharray="3 2.2" stroke-linecap="round"/>` + `<path d="${sp(hd)}" fill="#2f7fd8"/>`; }
    return s;
  }

  /* ---------- lamp ---------- */
  function lampParts(st, m){
    const clamp_ = boxM(LMP.cu - 7, T.v0 - 7, ZR - 7, LMP.cu + 7, T.v0 + 7, ZT + 5, DARK, tone, 1);
    const p0 = dk(LMP.cu, T.v0, ZT + 5), p1 = dk(LMP.cu, T.v0 - 4, BH + 178), p2 = dk(LMP.hu - 10, LMP.hv - 16, BH + 186), p3 = dk(LMP.hu, LMP.hv, LMP.hz + 6);
    const bez = t => [0, 1, 2].map(i => (1 - t)**3*p0[i] + 3*(1 - t)**2*t*p1[i] + 3*(1 - t)*t*t*p2[i] + t**3*p3[i]);
    const nk = Array.from({length: 9}, (_, i) => bez(i/8));
    let neck = '';
    if (fine()) for (let i = 0; i < nk.length - 1; i++) neck += rod(nk[i], nk[i + 1], 2.2, DARK, toneI, .8, 2.2, 10);
    else { const d = pd(nk, false); neck = `<path d="${d}" fill="none" stroke="${INK}" stroke-width="5.6"/><path d="${d}" fill="none" stroke="${DARK.m}" stroke-width="3.6"/>`; }
    const hc = dk(LMP.hu, LMP.hv, LMP.hz), hd = norm(dkv(0, .32, -1));
    const head = coaxSeg(hc, hd, { s0: -5, s1: 4, r0: LMP.r, M: m, n: 28, w: 1.2 });
    const lens = vis(hd) ? fill(pd(axisRing(kAt(hc, hd, 4.05), hd, LMP.r - 3, 24)), st.light > .5 ? '#fffbe2' : '#cfd6d8') : '';
    const glow = st.light > .01 ? fill(pd(axisRing(kAt(hc, hd, 3), hd, LMP.r + 5, 24)), '#fff3a8', `opacity="${f(.45*st.light)}"`) : '';
    // the light falling on the water
    let cone = '';
    if (st.light > .01){ const A = axisRing(kAt(hc, hd, 4), hd, LMP.r - 4, 16), lv = st.level, B = ringAt(LMP.hu, LMP.hv + 14, lv + .3, 46, 16);
      const surf = fill(pd(B), '#fff7c4', `pointer-events="none" opacity="${f(.2*st.light)}"`);
      cone = surf + `<g opacity="${f(.13*st.light)}" pointer-events="none">${loft(A, B, () => '#fff3b0')}</g>`; }
    return { clamp: clamp_, neck, head: glow + head + lens, cone, pts: [...axisRing(hc, hd, LMP.r, 8), p1, p2] };
  }

  /* ---------- the magnetic cleaner ---------- */
  function magOuter(st, m){ const { u, z } = st.mag, fr = vis(DV);
    const a = boxM(u - 15, T.v1 + .3, z - 10, u + 15, T.v1 + 9, z + 10, m, tone, 1), b = boxM(u - 9, T.v1 + 9, z - 3.2, u + 9, T.v1 + 12, z + 3.2, matOf(mix(m.l, '#ffffff', .35)), tone, .8);
    return act('magnet', fr ? a + b : b + a); }
  const magOuterBox = st => boxOf(deskBoxPts(st.mag.u - 15, T.v1 + .3, st.mag.z - 10, st.mag.u + 15, T.v1 + 12, st.mag.z + 10));
  function magInner(st){ const { u, z } = st.mag;
    return boxM(u - 13, W.v1 - 5, z - 8.5, u + 13, W.v1 - .3, z + 8.5, FELT, toneI, .8); }
  const magInnerBox = st => boxOf(deskBoxPts(st.mag.u - 13, W.v1 - 5, st.mag.z - 8.5, st.mag.u + 13, W.v1 - .3, st.mag.z + 8.5));

  /* ---------- the food tub: pose { o base centre, ax up its axis, fx its front } ---------- */
  const TUB_REST = { o: dk(TUB.u, TUB.v, BH), ax: [0, 0, 1], fx: DV.slice() };
  function tubParts(st){
    const { o, ax, fx } = st.tub, sx = cross(ax, fx);
    const body = coaxSeg(o, ax, { s0: 0, s1: TUB.h, r0: TUB.r, M: TUBW, n: 24, w: 1.2, hole1: st.tubOpen > .2 ? TUB.r - 1.6 : 0, bore: '#4a3220' });
    const band = loft(axisRing(kAt(o, ax, 12), ax, TUB.r + .05, 24), axisRing(kAt(o, ax, 29), ax, TUB.r + .05, 24), n => toneI(n, { l:'#ffe39a', m:'#f0c860', d:'#b38a2c' }));
    const lab = vis(fx) ? txOn(kAdd(kAt(o, ax, 22.6), kScl(fx, TUB.r + .12)), cross(fx, ax), fx, '鱼食', 6.4, INK, 800)
      + (fine() ? txOn(kAdd(kAt(o, ax, 16), kScl(fx, TUB.r + .12)), cross(fx, ax), fx, 'GOLDFISH', 2.6, '#8a5a12', 800) : '') : '';
    // the flip cap: on, or turned back on its hinge at the back of the rim
    const hinge = kAdd(kAt(o, ax, TUB.h), kScl(fx, -TUB.r)), ang = -1.9*st.tubOpen;
    const cax = rotAbout(ax, sx, ang), cfx = rotAbout(fx, sx, ang), cO = kAdd(hinge, kScl(cfx, TUB.r));
    const cap = coaxSeg(cO, cax, { s0: 0, s1: TUB.cap, r0: TUB.r + .7, M: CAPR, n: 24, w: 1.1 });
    const tow = vis(ax);
    let flk = '';
    if (st.tubOpen > .2 && tow){ const r = kRng(13); for (let i = 0; i < 9; i++){ const c = kAdd(kAt(o, ax, TUB.h + .05), kAdd(kScl(fx, (r() - .5)*16), kScl(sx, (r() - .5)*16)));
      flk += fill(pd([kAdd(c, kScl(fx, 1.2)), kAdd(c, kScl(sx, 1.2)), kAdd(c, kScl(fx, -1.2)), kAdd(c, kScl(sx, -1.1))]), FLAKE_COL[i % 4]); } }
    const capFirst = st.tubOpen > .2 ? !vis(kScl(fx, -1)) : !tow;
    const main = body + band + lab + flk;
    const svg = capFirst ? cap + main : main + cap;
    const pts = [...axisRing(o, ax, TUB.r, 8), ...axisRing(kAt(o, ax, TUB.h), ax, TUB.r, 8), ...axisRing(kAt(cO, cax, TUB.cap), cax, TUB.r, 8)];
    return { svg: act('tub', svg), pts };
  }

  /* ---------- flakes: { p: [u, v, z], vel, mode: air | float | sink, c, a, t } ---------- */
  function flakeSvg(fl){ const c = dk(fl.p[0], fl.p[1], fl.p[2]), a = fl.a, tilt = fl.mode === 'float' ? 0 : .6;
    const ex = dkv(Math.cos(a)*1.4, Math.sin(a)*1.4, 0), ey = kAdd(dkv(-Math.sin(a)*1, Math.cos(a)*1, 0), [0, 0, tilt]);
    return fill(pd([kAdd(c, ex), kAdd(c, ey), kAdd(c, kScl(ex, -1)), kAdd(c, kScl(ey, -.8))]), FLAKE_COL[fl.c]) + ink(pd([kAdd(c, ex), kAdd(c, ey), kAdd(c, kScl(ex, -1)), kAdd(c, kScl(ey, -.8))]), .25); }
  const inWater = p => p[0] > W.u0 && p[0] < W.u1 && p[1] > W.v0 && p[1] < W.v1;
  // the flakes' own physics, until every one has been eaten or lies on the gravel
  function runFlakes(st){
    if (st.flaking) return; st.flaking = true;
    ui.animate(dt => {
      st.t += dt;
      for (const fl of st.flakes){ fl.t += dt;
        if (fl.mode === 'air'){ fl.vel[2] = Math.max(-260, fl.vel[2] - 1100*dt); for (let i = 0; i < 3; i++) fl.p[i] += fl.vel[i]*dt; fl.a += dt*6;
          fl.p[0] = clamp(fl.p[0], W.u0 + 3, W.u1 - 3); fl.p[1] = clamp(fl.p[1], W.v0 + 3, W.v1 - 3);
          if (fl.p[2] <= st.level + .25){ fl.p[2] = st.level + .25; fl.mode = 'float'; fl.t = 0; st.ripples.push({ u: fl.p[0], v: fl.p[1], t: 0 }); } }
        else if (fl.mode === 'float'){ fl.p[0] += Math.sin(fl.t*1.3 + fl.a)*3*dt; fl.p[1] += 2*dt; if (fl.t > fl.wet){ fl.mode = 'sink'; fl.t = 0; } }
        else if (fl.mode === 'sink'){ fl.p[2] -= 11*dt; fl.p[0] += Math.sin(fl.t*2 + fl.a)*4*dt; fl.a += dt;
          fl.p[0] = clamp(fl.p[0], W.u0 + 3, W.u1 - 3); fl.p[1] = clamp(fl.p[1], W.v0 + 3, W.v1 - 3);
          if (fl.p[2] <= gravelZ(fl.p[1]) + .4){ fl.gone = true; st.debris.push({ u: fl.p[0], v: fl.p[1], a: fl.a }); if (st.debris.length > 24) st.debris.shift(); } } }
      st.flakes = st.flakes.filter(fl => !fl.gone);
      stepRipples(st, dt);
      if (!st.flakes.length && !st.ripples.length){ st.flaking = false; return false; }
      return true; });
  }
  function stepRipples(st, dt){ for (const r of st.ripples) r.t += dt; st.ripples = st.ripples.filter(r => r.t < 1.1); }
  function ripplesSvg(st){ let s = '';
    for (const r of st.ripples){ const rad = 3 + r.t*26, op = .7*(1 - r.t/1.1);
      const pts = Array.from({length: 20}, (_, j) => { const t = j/20*2*Math.PI; return dk(clamp(r.u + rad*Math.cos(t), W.u0, W.u1), clamp(r.v + rad*Math.sin(t), W.v0, W.v1), st.level + .1); });
      s += `<path d="${pd(pts)}" fill="none" stroke="#ffffff" stroke-width=".9" opacity="${f(op)}" pointer-events="none"/>`; }
    return s; }

  /* ---------- the water ---------- */
  function waterFaces(lv){
    const c = (u, v, z) => dk(u, v, z);
    return [
      { n: DV, q: [c(W.u0, W.v1, FL), c(W.u1, W.v1, FL), c(W.u1, W.v1, lv), c(W.u0, W.v1, lv)] },
      { n: kScl(DV, -1), q: [c(W.u1, W.v0, FL), c(W.u0, W.v0, FL), c(W.u0, W.v0, lv), c(W.u1, W.v0, lv)] },
      { n: kScl(DU, -1), q: [c(W.u0, W.v0, FL), c(W.u0, W.v1, FL), c(W.u0, W.v1, lv), c(W.u0, W.v0, lv)] },
      { n: DU, q: [c(W.u1, W.v1, FL), c(W.u1, W.v0, FL), c(W.u1, W.v0, lv), c(W.u1, W.v1, lv)] } ];
  }
  const waterCol = st => mix(WATER[0], WATER[1], st.light);

  /* ---------- the whole tank, layer by layer ---------- */
  function tankSvg(st, m, k){
    const lv = st.level, near = Object.fromEntries(WALLS.map(w => [w.id, vis(w.n)]));
    const M = m, wc = waterCol(st), lp = lampParts(st, M);
    let s = '';
    // 1. the bottom frame; what is outside the far walls (seen through the tank)
    s += boxM(T.u0 - 2, T.v0 - 2, BH, T.u1 + 2, T.v1 + 2, ZB, M, tone, 1.1);
    // a tap anywhere on the tank that isn't a fish or a part with its own use is a knock on the glass
    s += act('glass', `<path d="${sp(hull(tankPts().map(p => P(...p))))}" fill="#000000" fill-opacity="0"/>`);
    const filt = () => { const box_ = filterBox(M); return k > 0 ? `<g opacity="${f(1 - .8*k)}">${box_}</g><g opacity="${f(k)}">${filterMech(st)}</g>` : box_; };
    if (!near.back) s += cordSvg() + filt();
    if (!near.front) s += magOuter(st, M);
    // 2. the far glass, its corners, far rim bars, the far water
    for (const w of WALLS) if (!near[w.id]) s += paneSvg(w, false, st);
    if (!near.front) s += algaeSvg(st);
    const corners = [[T.u0, T.v0, ['back', 'left']], [T.u1, T.v0, ['back', 'right']], [T.u1, T.v1, ['front', 'right']], [T.u0, T.v1, ['front', 'left']]];
    for (const [cu, cv, ws] of corners) if (!ws.some(id => near[id])) s += cornerSvg([cu, cv], false);
    s += byDepth(BARS.filter(b => !near[b.id]).map(b => barItem(b, M)));
    for (const wf of waterFaces(lv)) if (!vis(wf.n)) s += fill(pd(wf.q), wc, 'pointer-events="none" opacity=".3"');
    // 3. underwater: gravel, then everything standing or swimming in the water, sorted
    // (only the fish take a click in here: everything else lets it through to the glass)
    const thru = it => ({ ...it, svg: `<g pointer-events="none">${it.svg}</g>` });
    s += `<g pointer-events="none">${gravelSvg(st)}</g>`;
    const items = [...castleItems(), ...PLANT.map(lf => leafItem(lf, st))].map(thru);
    st.fish.forEach((fs, i) => items.push(fishItem(fs, FISHES[i], i)));
    items.push(thru({ box: intakeBox(INT.z0, lv), svg: intakeSvg(INT.z0, lv) }));
    items.push(thru({ box: magInnerBox(st), svg: magInner(st) }));
    items.push(thru({ box: boxOf([dk(HG.u0, LIPV, lv - 34), dk(HG.u1, LIPV + 14, lv)]), svg: bubblesSvg(st) }));
    for (const fl of st.flakes) if (fl.mode === 'sink') items.push(thru({ box: boxOf([dk(...fl.p)], 1.5), svg: flakeSvg(fl) }));
    s += byDepth(items);
    // 4. the water in front of it all: the near sides, the surface with its light, ripples and floating flakes
    const surf = [dk(W.u0, W.v0, lv), dk(W.u1, W.v0, lv), dk(W.u1, W.v1, lv), dk(W.u0, W.v1, lv)];
    let wl = '';
    for (const wf of waterFaces(lv)) if (vis(wf.n)){ s += fill(pd(wf.q), wc, 'pointer-events="none" opacity=".16"'); wl += pd([wf.q[3], wf.q[2]], false); }
    s += fill(pd(surf), wc, 'pointer-events="none" opacity=".3"');
    s += `<path d="${pd([kLerp(surf[0], surf[2], .18), kLerp(surf[0], surf[2], .42)], false)}${pd([kLerp(surf[3], surf[1], .55), kLerp(surf[3], surf[1], .7)], false)}" stroke="#ffffff" stroke-width="1.3" opacity=".55" stroke-linecap="round" pointer-events="none"/>`;
    s += ripplesSvg(st);
    for (const fl of st.flakes) if (fl.mode === 'float') s += flakeSvg(fl);
    if (wl) s += `<path d="${wl}" fill="none" stroke="#3f8aa3" stroke-width="1" opacity=".85" pointer-events="none"/>`;
    // inside but above the water: the spillway and its waterfall, the intake tube's top, flakes falling in
    s += `<g pointer-events="none">${intakeSvg(lv, INT.z1) + spillSvg(st, M)}</g>`;
    for (const fl of st.flakes) if (fl.mode === 'air' && fl.p[2] < ZT && inWater(fl.p)) s += flakeSvg(fl);
    s += lp.cone;   // the lamp's light, falling through the open top onto the water
    // 5. the near glass, its algae, its corners, near rim bars, the outline; what is outside the near walls
    if (near.front) s += algaeSvg(st);
    for (const w of WALLS) if (near[w.id]) s += paneSvg(w, true, st);
    for (const [cu, cv, ws] of corners) if (ws.some(id => near[id])) s += cornerSvg([cu, cv], true);
    s += byDepth(BARS.filter(b => near[b.id]).map(b => barItem(b, M)));
    s += hullInk(tankPts(), 2.2);
    if (st.tap > 0) s += tapMarks(st);
    if (near.back) s += cordSvg() + filt();
    if (near.front) s += magOuter(st, M);
    // 6. on top: the filter's saddle, the lamp
    s += hangerSvg(M) + elbowSvg() + lp.clamp + act('lamp', lp.neck + lp.head);
    return s;
  }
  // the knock on the glass: three short strokes where it was hit
  function tapMarks(st){ const c = dk(st.tapAt[0], T.v1 + .5, st.tapAt[1]), k = st.tap; let d = '';
    for (const a of [-.9, 0, .9]){ const dir = kAdd(kScl(DU, Math.sin(a)), [0, 0, Math.cos(a)]); d += pd([kAdd(c, kScl(dir, 4 + 3*(1 - k))), kAdd(c, kScl(dir, 9 + 5*(1 - k)))], false); }
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" opacity="${f(k)}"/>`; }

  /* ---------- scene ---------- */
  function scene(st, m){
    const k = ease(st.xr || 0);
    // now and then the fish go for a little swim by themselves (only while someone is at the desk)
    ctx.later(15000 + 10000*rndA(), () => ambient(st), 'swim', true);
    const lp = lampParts(st, m), tb = tubParts(st);
    let s = castShadow([...tankPts(), ...deskBoxPts(FB.u0, FB.v0, FB.z0, FB.u1, FB.v1, FB.z1), ...lp.pts.map(p => [p[0], p[1], Math.min(p[2], BH + 150)])], BH);
    if (st.tubAway < .02) s += castShadow(tb.pts, BH);
    const tankBox = boxOf([...tankPts(), ...deskBoxPts(FB.u0, FB.v0, BH, FB.u1, FB.v1, FB.z1 + 4), dk(HG.u0, T.v0, ZT + 6)]);
    s += byDepth([{ box: tankBox, svg: tankSvg(st, m, k) }, { box: boxOf(tb.pts, .5), svg: tb.svg }]);
    for (const fl of st.flakes) if (fl.mode === 'air' && !(fl.p[2] < ZT && inWater(fl.p))) s += flakeSvg(fl);
    s += labels(st, k);
    return s;
  }
  function labels(st, k){
    const items = [];
    st.fish.forEach((fs, i) => items.push({ at: dk(fs.p[0], fs.p[1], fs.p[2] + FISHES[i].H*.5), text: st.names[i], on: st.busyFish === i || st.busyFish === 2 }));
    if (k > .6) items.push(
      { at: dk(INT.u, INT.v - 6.5, (INT.z0 + INT.zs)/2), text: '进水滤网', on: true },
      { at: dk(INT.u, INT.v, (INT.zs + st.level)/2 - 10), text: '进水管', on: true },
      { at: dk(66, -48 + 13.5, FB.z0 + 16), text: '电机线圈', on: true },
      { at: dk(66, -48, FB.z0 + 23), text: '叶轮', on: true },
      { at: dk(66 - 6, -48, FB.z0 + 14), text: '磁铁转子', on: true },
      { at: dk((FB.u0 + FB.u1)/2, -41, FB.z0 + 70), text: '滤棉', on: false },
      { at: dk(FB.u0 + 12, -45, FB.z0 + 50), text: '活性炭', on: false },
      { at: dk((HG.u0 + HG.u1)/2, LIPV, LIPZ), text: '出水口', on: true });
    else items.push(
      { at: dk((FB.u0 + FB.u1)/2, FB.v0 + 4, FB.z1 + 4), text: '过滤器', on: false },
      { at: dk(LMP.hu, LMP.hv, LMP.hz + 5), text: 'LED 灯', on: st.light > .5 },
      { at: dk(st.mag.u, T.v1 + 9, st.mag.z + 10), text: '磁力刷', on: st.wiping },
      { at: dk(PLANT[3].u, PLANT[3].v, gravelZ(PLANT[3].v) + 40), text: '水草', on: false },
      { at: dk(CAS.u - 8, CAS.v, gravelZ(CAS.v) + 40), text: '小城堡', on: false },
      { at: dk(-30, W.v1, GF - 3), text: '底砂', on: false },
      { at: kAt(st.tub.o, st.tub.ax, TUB.h), text: '鱼食', on: st.feeding });
    return zhCallouts(items, []);
  }

  /* ---------- swimming ---------- */
  const fwOf = fs => [Math.cos(fs.yaw)*Math.cos(fs.pitch), Math.sin(fs.yaw)*Math.cos(fs.pitch), Math.sin(fs.pitch)];
  const zLimits = (v, lv) => [gravelZ(v) + 11, lv - 8];
  function safeP(p, lv){ const u = clamp(p[0], SAFE.u0, SAFE.u1), v = clamp(p[1], SAFE.v0, SAFE.v1), [z0, z1] = zLimits(v, lv); return [u, v, clamp(p[2], z0, z1)]; }
  // a smooth swim from where a fish is to p1 (heading on from its own way), as a step function of eased progress
  function swimPlan(fs, p1, yaw1){
    const p0 = fs.p.slice(), d = kLen(sub(p1, p0)), f0 = fwOf(fs), f1 = [Math.cos(yaw1), Math.sin(yaw1), 0];
    return { p0, c1: kAdd(p0, kScl(f0, d*.42)), c2: kAdd(p1, kScl(f1, -d*.42)), p1, d };
  }
  function swimAt(fs, pl, e, dt, lv, beat = 1){
    const u = 1 - e, B = [0, 1, 2].map(i => u*u*u*pl.p0[i] + 3*u*u*e*pl.c1[i] + 3*u*e*e*pl.c2[i] + e*e*e*pl.p1[i]);
    const D = [0, 1, 2].map(i => 3*u*u*(pl.c1[i] - pl.p0[i]) + 6*u*e*(pl.c2[i] - pl.c1[i]) + 3*e*e*(pl.p1[i] - pl.c2[i]));
    fs.p = safeP(B, lv);
    const hz = Math.hypot(D[0], D[1]);
    if (hz > 1e-3) fs.yaw = Math.atan2(D[1], D[0]);
    fs.pitch = clamp(Math.atan2(D[2], Math.max(1e-3, hz))*.7, -.45, .45);
    fs.tail += dt*(7 + 11*beat); fs.amp = .8 + 2.2*beat;
  }
  function randomTarget(st, fs, r, reach = 42){ const p = safeP([fs.p[0] + (r() - .5)*2*reach, fs.p[1] + (r() - .5)*reach, fs.p[2] + (r() - .5)*30], st.level);
    return { p, yaw: Math.atan2(p[1] - fs.p[1], p[0] - fs.p[0]) + (r() - .5)*.6 }; }
  // a few fish moving at once (one plan each), as one kPlay segment
  function swimSeg(st, plans, ms, beat = 1){
    return { ms, start(){ this.last = 0; this.pl = plans(); }, step(k){ const dt = (k - this.last)*ms/1000; this.last = k; st.t += dt;
      this.pl.forEach((pl, i) => { if (pl) swimAt(st.fish[i], pl, ease(k), dt, st.level, beat*Math.sin(Math.PI*k)*.8 + .2); }); },
      end(){ for (const fs of st.fish) { fs.amp = .8; fs.pitch *= .5; } } };
  }
  function ambient(st){
    if (kBusy() || st.amb || st.flaking) return;
    const tok = {}, r = kRng(9 + Math.floor(rndA()*1e6)), ms = 1500;
    st.amb = tok;
    const plans = st.fish.map(fs => { const t = randomTarget(st, fs, r); return swimPlan(fs, t.p, t.yaw); });
    let tt = 0;
    ui.animate(dt => { if (st.amb !== tok) return false;
      tt += dt*1000; const k = Math.min(1, tt/ms); st.t += dt;
      plans.forEach((pl, i) => swimAt(st.fish[i], pl, ease(k), dt, st.level, Math.sin(Math.PI*k)*.7 + .15));
      if (k >= 1){ st.amb = null; for (const fs of st.fish) fs.amp = .8; return false; }
      return true; });
  }
  const stopAmbient = st => { st.amb = null; };

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { feed: '正在吃呢，别急', wipe: '正在擦玻璃', light: '等灯亮', tap: '还在发抖……', memo: '正在绕圈', name: '等一下' };
  const busy = () => { if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等一下'); return true; };
  const others = st => { st.fed = 0; };

  // 1. feed: the tub lifts, goes over the water, tips; flakes fall; the fish come up and eat
  function feed(st){ if (busy()) return; stopAmbient(st);
    const full = st.fed >= 2; st.fed++;
    const tilt = ax1 => { const kx = cross([0, 0, 1], ax1), ln = kLen(kx), ang = Math.atan2(ln, ax1[2]); return ln > 1e-6 ? norm(rotAbout(DV, kScl(kx, 1/ln), ang)) : DV.slice(); };
    const oAx = norm(dkv(-.45, -.25, -.86)), over = { o: dk(6, 20, BH + 196), ax: oAx, fx: tilt(oAx) };
    const up = { o: dk(TUB.u, TUB.v, BH + 150), ax: [0, 0, 1], fx: DV.slice() }, mid = { o: dk(30, 30, BH + 160), ax: [0, 0, 1], fx: DV.slice() };
    const poseLerp = (a, b, e) => { const kx = cross(a.ax, b.ax), ln = kLen(kx), ang = Math.atan2(ln, dot(a.ax, b.ax));
      const ax = ln > 1e-6 ? rotAbout(a.ax, kScl(kx, 1/ln), ang*e) : a.ax.slice(), fx = ln > 1e-6 ? rotAbout(a.fx, kScl(kx, 1/ln), ang*e) : a.fx.slice();
      return { o: kLerp(a.o, b.o, e), ax: norm(ax), fx: norm(fx) }; };
    const move = (a, b, ms) => ({ ms, step(k){ st.tub = poseLerp(a(), b(), ease(k)); st.tubAway = 1; } });
    const r = kRng(31 + st.feeds++);
    const segs = [
      { ms: 10, start(){ st.feeding = true; st.busyFish = 2; st.emitted = false; } },
      move(() => TUB_REST, () => up, 420), move(() => up, () => mid, 360), move(() => mid, () => over, 420),
      { ms: 200, step(k){ st.tubOpen = ease(k); } },
      { ms: 560, start(){ this.n = 0; }, step(k){ // shaken: flakes tumble out of the open end
          st.tub = { ...over, o: kAdd(over.o, [0, 0, 3*Math.sin(k*Math.PI*6)]) };
          const want = Math.floor(k*12); while (this.n < want){ this.n++; const mouth = kAt(st.tub.o, st.tub.ax, TUB.h + 1), q = undk(mouth);
            st.flakes.push({ p: [q[0] + (r() - .5)*10, q[1] + (r() - .5)*10, q[2]], vel: [(r() - .5)*30, (r() - .3)*30, -40 - r()*60], mode: 'air', c: Math.floor(r()*4), a: r()*6, t: 0, wet: 1.4 + r()*1.4 }); }
          runFlakes(st); } },
      { ms: 200, start(){ st.emitted = true; }, step(k){ st.tubOpen = 1 - ease(k); } },
      move(() => over, () => mid, 420), move(() => mid, () => up, 360), move(() => up, () => TUB_REST, 420),
      { ms: 10, start(){ st.tub = { ...TUB_REST }; st.tubAway = 0; } } ];
    // meanwhile the fish come up and eat (unless they have had too much)
    if (!full) fishEat(st, 1400, 3400);
    kPlay(ui, 'feed', segs, () => { st.feeding = false; st.busyFish = -1;
      for (let i = 0; i < Math.min(st.alg.length, 3); i++){ const j = Math.floor(r()*st.alg.length); st.alg[j] = Math.min(1, st.alg[j] + .4); }
      ui.flash(full ? '吃不下了……剩下的沉到底会把水弄臭的' : `吧唧吧唧——${st.names[0]}抢到的最多`, 2600); });
  }
  // the fish's part of feeding runs on its own clock: wait for the flakes, then chase the nearest one
  function fishEat(st, wait, ms){
    let t = 0; const chomp = [0, 0];
    ui.animate(dt => { t += dt*1000; st.t += dt;
      if (t < wait) return true;
      const lv = st.level;
      st.fish.forEach((fs, i) => { const dim = FISHES[i], mo = mouthOf(fs, dim);
        let best = null, bd = 1e9; for (const fl of st.flakes){ if (fl.mode === 'air' || fl.gone) continue; const d = kLen(sub(fl.p, mo)); if (d < bd){ bd = d; best = fl; } }
        if (!best){ fs.amp = Math.max(.8, fs.amp - dt*3); return; }
        const dx = best.p[0] - mo[0], dy = best.p[1] - mo[1], dz = best.p[2] - mo[2], want = Math.atan2(dy, dx);
        let dyaw = ((want - fs.yaw + Math.PI*3) % (Math.PI*2)) - Math.PI; fs.yaw += clamp(dyaw, -5*dt, 5*dt);
        fs.pitch = clamp(fs.pitch + clamp(Math.atan2(dz, Math.hypot(dx, dy)) - fs.pitch, -3*dt, 3*dt), -.6, .6);
        const sp_ = bd > 8 ? 85 : 30, fw = fwOf(fs);
        fs.p = safeP([fs.p[0] + fw[0]*sp_*dt, fs.p[1] + fw[1]*sp_*dt, fs.p[2] + fw[2]*sp_*dt], lv);
        fs.tail += dt*(9 + sp_*.12); fs.amp = 2.4;
        if (bd < 5){ best.gone = true; chomp[i]++; st.ripples.push({ u: best.p[0], v: best.p[1], t: .3 }); } });
      st.flakes = st.flakes.filter(fl => !fl.gone);
      if (t > wait + ms || (st.emitted && !st.flakes.length)){ for (const fs of st.fish){ fs.amp = .8; fs.pitch *= .4; } return false; }
      return true; });
  }
  // 2. wipe the front glass with the magnetic cleaner
  function wipe(st){ if (busy()) return; stopAmbient(st); others(st);
    if (st.alg.every(a => a < .05)) return ui.flash('玻璃已经很干净了，连我的倒影都看得见');
    const path = [[MAG0.u, MAG0.z], [-66, BH + 98], [-36, BH + 34], [-6, BH + 98], [24, BH + 34], [54, BH + 98], [66, BH + 40], [MAG0.u + 4, BH + 40], [MAG0.u, MAG0.z]];
    const lens = [0]; for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    const at = d => { let i = 1; while (i < path.length - 1 && lens[i] < d) i++; const e = (d - lens[i - 1])/((lens[i] - lens[i - 1]) || 1);
      return { u: path[i - 1][0] + (path[i][0] - path[i - 1][0])*e, z: path[i - 1][1] + (path[i][1] - path[i - 1][1])*e }; };
    kPlay(ui, 'wipe', [{ ms: 2600, start(){ st.wiping = true; }, step(k){ st.mag = at(ease(k)*lens[lens.length - 1]);
        BLOTS.forEach((b, i) => { if (Math.hypot(b.u - st.mag.u, (b.z - st.mag.z)*1.2) < b.r + 12) st.alg[i] = Math.max(0, st.alg[i] - .2); }); },
      end(){ st.mag = { ...MAG0 }; st.wiping = false; } }],
      () => ui.flash('玻璃擦亮了——终于看清外面那张大脸了', 2400));
  }
  // 3. the lamp
  function lamp(st){ if (busy()) return; stopAmbient(st); others(st);
    const on = st.light < .5;
    kPlay(ui, 'light', [{ ms: 360, start(){ this.l0 = st.light; }, step(k){ st.light = this.l0 + ((on ? 1 : 0) - this.l0)*ease(k); } }],
      () => ui.flash(on ? '开灯啦，鳞片闪闪的' : '关灯睡觉——鱼没有眼皮，只能睁着眼睡'));
  }
  // 4. knock on the glass: a bang to them; both dart off to the back, ripples on the surface
  function tap(st, at){ if (busy()) return; stopAmbient(st); others(st);
    st.tapAt = at || [10, BH + 72];
    const r = kRng(5 + st.taps++);
    kPlay(ui, 'tap', [
      { ms: 220, start(){ st.tap = 1; st.ripples.push({ u: st.tapAt[0], v: W.v1 - 6, t: 0 }); runFlakes(st); }, step(k){ st.tap = 1 - k*.5; } },
      swimSeg(st, () => st.fish.map((fs, i) => { const p = safeP([i ? 60 : -62, SAFE.v0 + 4 + r()*8, fs.p[2] + (r() - .5)*20], st.level); return swimPlan(fs, p, Math.atan2(p[1] - fs.p[1], p[0] - fs.p[0])); }), 520, 1.6),
      { ms: 160, step(k){ st.tap = .5*(1 - k); }, end(){ st.tap = 0; } } ],
      () => ui.flash('谁敲的？！吓得我差点跳出去', 2200));
  }
  // 5. the seven-second memory: one lap of the tank, and it all looks new again
  const MEMO = ['哇，好大的房子，我第一次来！', '咦……我刚才游过来是要干嘛的？', '你是谁？我们见过吗？', '这个城堡什么时候放的？好漂亮！'];
  function memory(st){ if (busy()) return; stopAmbient(st); others(st);
    const lv = st.level, z = (lv + gravelZ(20))/2 + 6;
    const way = [[-58, 4, z], [-30, 52, z + 8], [40, 50, z - 4], [58, 8, z + 6], [10, -10, z], [-24, 24, z - 4]];
    const segs = [{ ms: 10, start(){ st.busyFish = 0; } }];
    way.forEach((wp, i) => { const nx = way[(i + 1) % way.length];
      segs.push(swimSeg(st, () => [swimPlan(st.fish[0], safeP(wp, lv), Math.atan2(nx[1] - wp[1], nx[0] - wp[0])), null], 520, 1)); });
    kPlay(ui, 'memo', segs, () => { st.busyFish = -1; ui.flash(MEMO[st.memo++ % MEMO.length], 2600); });
  }
  // 6. a name for the big one
  function rename(st, name){ if (busy()) return; others(st);
    st.names[0] = name;
    const fs = st.fish[0], lv = st.level;
    kPlay(ui, 'name', [{ ms: 10, start(){ st.busyFish = 0; } },
      swimSeg(st, () => [swimPlan(fs, safeP([fs.p[0], SAFE.v1 - 4, lv - 18], lv), Math.PI/2), null], 600, 1),
      swimSeg(st, () => [swimPlan(fs, safeP([fs.p[0] + 10, SAFE.v1 - 8, lv - 22], lv), 0), null], 420, .6)],
      () => { st.busyFish = -1; ui.flash(`从今天起我叫「${name}」！`, 2400); });
  }
  // clicking a fish: it swims off, offended
  function poke(st, i){ if (busy()) return; stopAmbient(st);
    const fs = st.fish[i], r = kRng(70 + st.taps++), p = safeP([fs.p[0] + (fs.p[0] > 0 ? -50 : 50), fs.p[1] + (r() - .5)*30, fs.p[2] + (r() - .5)*20], st.level);
    kPlay(ui, 'tap', [swimSeg(st, () => st.fish.map((_, j) => j === i ? swimPlan(fs, p, Math.atan2(p[1] - fs.p[1], p[0] - fs.p[0])) : null), 620, 1.2)],
      () => ui.flash(i === 0 ? '看什么看，没见过鱼吐泡泡？' : '别戳我，我在思考鱼生'));
  }

  const FISH0 = [{ p: [-24, 30, BH + 70], yaw: Math.PI*.94, pitch: 0, tail: 0, amp: .8 }, { p: [26, 8, BH + 54], yaw: .4, pitch: 0, tail: 1.3, amp: .8 }];
  const __cfg = ({
    fig:'17', turn:'full', title:'小鱼缸', palette:'cobalt',
    state:{ level: LEVEL, fish: FISH0.map(x => ({ ...x, p: x.p.slice() })), names: ['金宝', '小红'], light: 1, mag: { ...MAG0 }, wiping: false,
      alg: BLOTS.map((_, i) => i % 2 ? 0 : .7), tub: { ...TUB_REST }, tubOpen: 0, tubAway: 0, feeding: false, feeds: 0, fed: 0,
      flakes: [], flaking: false, emitted: false, debris: [], ripples: [], tap: 0, tapAt: [10, BH + 72], taps: 0, memo: 0, busyFish: -1, amb: null, t: 0 },
    scene,
    buttons:[
      { label:'喂食', onClick: feed },
      { label:'擦玻璃', onClick: wipe },
      { label:'开灯 / 关灯', onClick: lamp },
      { label:'敲玻璃', onClick: st => tap(st) },
      { label:'七秒记忆', onClick: memory },
      { label:'给鱼起名', choices: st => NAMES.map(n => ({ label: n, current: st.names[0] === n, onClick: s2 => rename(s2, n) })) },
    ],
    acts:{ glass: st => tap(st), tub: st => feed(st), lamp: st => lamp(st), magnet: st => wipe(st), fish0: st => poke(st, 0), fish1: st => poke(st, 1) },
  });
  return ctx.adapt(__cfg, { seeThrough: true });
}
