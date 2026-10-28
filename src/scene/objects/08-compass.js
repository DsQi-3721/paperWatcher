// Fig. 08 圆规 — desk-scene object, ported from stationery/src/08-compass.html by scripts/port-figures.mjs.
// The figure's own code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*),
// ctx.ui its ui (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are
// collected by the scene.
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: 95, v: 125, rot: 0 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 08 — School compass (圆规): a two-leg drawing compass lying on the 数学练习 sheet (S2) on the shared desk; it is
     picked up and stood on its needle only to draw, and laid back down after.
     Desk terms (u along the front edge, v toward the student; 1 unit = 1 mm) are this object's frame (ctx.desk); the
     task, centre O and the circles go on the left part of S2 through its own frame (pu across the page, pv down it);
     the calculator (10) lies on S2's right part.

     How it really works (each button is one of these):
     1. Open (张开): the two legs turn on one pivot screw through the hinge head. The screw and its lock nut squeeze two
        fibre friction washers between the knuckles, so the legs stay at whatever spread you set (the radius). You lift
        it, pull the legs apart, and put it back.
     2. Draw (画圆): the needle's point goes into the paper up to its shoulder, so it can't skid. You lean the compass a
        little the way it is going and twirl the knurled handle between finger and thumb; the whole compass turns about
        the needle, and the lead, at the set radius, draws the circle.
     3. If the needle only rests on the paper (not pressed in), the sideways pull of the lead drags it: the centre wanders
        and the hand's pressure closes the legs, so the line spirals inward instead of closing.
     4. Clamps: the needle sits in a sleeve at the end of one leg, held by a clamp screw; the lead sits in a split sleeve
        at the end of the other, squeezed by its clamp screw.
     5. Left on a desk it lies on its side: the lock nut under the hinge head and the lead sleeve take its weight (the
        legs tilt down about 2°), the needle and lead points just clear of the paper; the legs keep their spread.
     Student life: the 蚊香 (mosquito-coil) "circle" when the needle slips, and carving 早 into the desk with the needle,
     like Lu Xun did on his desk at 三味书屋.

     Parts:
     HEAD    two outer knuckles (needle leg) . middle knuckle (lead leg) . pivot screw (head, shank) . two friction
             washers . lock nut (hex) . handle stem (threaded into the head) . knurled handle . handle cap
     NEEDLE  needle leg (tapered bar) . needle sleeve . clamp screw (head, shank) . steel needle (shank, shoulder, point)
     LEAD    lead leg (tapered bar) . split lead sleeve . clamp screw (head, shank) . 2 mm lead (sharpened)
     DESK    the task and centre O printed on S2 . circles drawn on it . 早 carved into the bare desk top */

  /* ---------- on the shared desk: the left part of 数学练习 (S2); 早 goes into the bare desk beyond S2's right edge ---------- */
  const BH = ctx.deskZ, S2 = ctx.paper('S2'), ZP = S2.z;
  const O_PAPER = [58, 100];                            // the printed centre O on S2 (pu, pv)
  const CO = (() => { const q = undk(S2.dk(O_PAPER[0], O_PAPER[1], 0)); return [q[0], q[1]]; })();   // ... in this object's frame
  const RADII = [20, 30, 40];
  // where 早 gets carved: baseline-left on the bare desk at desk (u 318, v 94), between S2's right edge (u 302) and the
  // sharpener's pencil (u ~377), clear of the calculator and the paper pile
  const ZAO_AT = { u: 318 - PLACE.u, v: 94 - PLACE.v, size: 24 };
  // 早 in six strokes (u right, v up, in units of the character's height): 日, then 一, then the long 丨
  const ZAO = [
    [[.2, 1], [.2, .56]], [[.2, 1], [.8, 1], [.8, .56]], [[.2, .78], [.8, .78]], [[.2, .57], [.8, .57]],
    [[.02, .36], [.98, .36]], [[.5, .57], [.5, -.04]] ].map(sk => sk.map(([gu, gv]) => dk(ZAO_AT.u + gu*ZAO_AT.size, ZAO_AT.v - gv*ZAO_AT.size, BH + .02)));
  // the needle goes over each stroke three times (there, back, there): carving takes a few passes
  const ZAO_PASSES = ZAO.map(sk => [...sk, ...sk.slice(0, -1).reverse(), ...sk.slice(1)]);

  /* ---------- the compass ---------- */
  const CP_L = 96, CP_HR = 5.2;                          // hinge axis to either point; head (knuckle) radius
  const FIBRE = matOf('#d6573c');
  // a pose: H = hinge centre, g = unit down between the legs, w = unit across from the needle leg to the lead leg,
  // th = half the angle between the legs
  const cpRays = p => { const c = Math.cos(p.th), s = Math.sin(p.th); return { rn: norm(kAdd(kScl(p.g, c), kScl(p.w, -s))), rl: norm(kAdd(kScl(p.g, c), kScl(p.w, s))) }; };
  // standing on its two points: needle tip T, lead tip Ld, the head toward upr
  function cpApex(T, Ld, upr){
    const span = sub(Ld, T), len = kLen(span), w = kScl(span, 1/len), up = norm(sub(upr, kScl(w, dot(upr, w))));
    const h = Math.sqrt(CP_L*CP_L - len*len/4);
    return { H: kAdd(kLerp(T, Ld, .5), kScl(up, h)), g: kScl(up, -1), w, th: Math.asin(len/(2*CP_L)) };
  }
  // needle at T, lead on the paper r away at angle phi (desk terms), the handle leaning `lean` rad the way it turns
  function cpStand(T, phi, r, lean = 0){
    const wh = dkv(Math.cos(phi), Math.sin(phi), 0), nh = cross([0, 0, 1], wh);
    return cpApex(T, [T[0] + r*wh[0], T[1] + r*wh[1], ZP + .05], kAdd(kScl([0, 0, 1], Math.cos(lean)), kScl(nh, Math.sin(lean))));
  }
  // closed up and held like a pen, needle tip at T (for carving)
  const CP_HOLD = norm(dkv(-.35, .45, .82));
  function cpHeld(T){ const w0 = norm(sub([0, 0, 1], kScl(CP_HOLD, CP_HOLD[2])));
    return cpApex(T, kAdd(T, kScl(w0, 2*CP_L*Math.sin(.045))), CP_HOLD); }
  function cpLerp(a, b, k){ const g = norm(kLerp(a.g, b.g, k)); let w = kLerp(a.w, b.w, k); w = norm(sub(w, kScl(g, dot(w, g))));
    return { H: kLerp(a.H, b.H, k), g, w, th: a.th + (b.th - a.th)*k }; }
  const cpUp = (p, h) => ({ ...p, H: kAdd(p.H, [0, 0, h]) });
  const cpO = (z = ZP - .6) => dk(CO[0], CO[1], z);       // the needle planted at O (pressed in to its shoulder)
  const cpRest = st => cpStand(cpO(), st.phi, st.r, 0);
  // lying on its side on S2 below the construction: legs (spread to the set radius) pointing along the page to the
  // left and a little down it, the screw head up, the lock nut on the paper. The legs dip FLAT_TILT toward their
  // points so the lead sleeve rests on the paper too; nut and sleeve are what the compass stands on.
  const FLAT_HEAD = [125, 171], FLAT_DIR = [-Math.cos(.17), Math.sin(.17)];        // on S2 (pu, pv): hinge centre, legs' way
  const NUT_LO = 5.7, SLEEVE_R = 2.8, SLEEVE_AT = CP_L - 13;
  const FLAT_TILT = Math.asin((NUT_LO - SLEEVE_R)/SLEEVE_AT);
  // side +1: screw head up, lock nut on the paper; -1: turned over, screw head down (the lead leg on the other side)
  function cpFlat(st){
    const h = S2.dk(FLAT_HEAD[0], FLAT_HEAD[1], 0), e = S2.dk(FLAT_HEAD[0] + FLAT_DIR[0], FLAT_HEAD[1] + FLAT_DIR[1], 0);
    const gh = norm(sub(e, h)), side = st.flatSide || 1, w = [-gh[1]*side, gh[0]*side, 0];
    const g = norm(kAdd(kScl(gh, Math.cos(FLAT_TILT)), [0, 0, -Math.sin(FLAT_TILT)]));
    const n = norm(cross(g, w));
    return { H: [h[0], h[1], ZP + NUT_LO*Math.abs(n[2]) + .05], g, w, th: Math.asin(st.r/(2*CP_L)) };
  }
  // between two poses through the air: the hinge rides a hump high enough that no point dips into the paper while
  // the compass turns between lying and standing
  const segVia = (st, target, ms, hump) => ({ ms,
    start(){ this.from = st.pose; this.to = typeof target === 'function' ? target() : target; },
    step(k){ const e = ease(k); st.pose = cpUp(cpLerp(this.from, this.to, e), hump*Math.sin(Math.PI*e)); },
    end(){ st.pose = this.to; } });
  // picked up off the desk and stood upright over O (hovering there): it turns so the lead leg goes on the side it
  // was already on (st.phi follows the legs), so the compass turns the short way up
  const standUp = (st, hover = 16) => ({ ...segVia(st, () => cpUp(cpRest(st), hover), 620, 26),
    start(){ const w = st.pose.w; st.phi = Math.atan2(dot(w, DV), dot(w, DU)); this.from = st.pose; this.to = cpUp(cpRest(st), hover); st.lying = false; } });
  // laid back down on its side, from wherever it is, on whichever side is nearer (no half-turn in the air)
  const layDown = st => ({ ...segVia(st, () => cpFlat(st), 640, 26),
    start(){ const w = st.pose.w; st.flatSide = 1; const w1 = cpFlat(st).w; st.flatSide = dot(w, w1) >= 0 ? 1 : -1; this.from = st.pose; this.to = cpFlat(st); },
    end(){ st.pose = cpFlat(st); st.lying = true; st.planted = false; st.away = false; } });

  function cpGeom(p){
    const { rn, rl } = cpRays(p), n = norm(cross(p.g, p.w)), up = kScl(p.g, -1);
    return { rn, rl, n, up, T: kAt(p.H, rn, CP_L), Ld: kAt(p.H, rl, CP_L), outN: norm(kScl(cross(n, rn), -1)), outL: norm(cross(n, rl)) };
  }
  // a leg: a bar of rectangular section tapering from the head to its sleeve (hw = half width in the legs' plane, ht = half thickness)
  function cpBar(H, ray, b, n, s0, s1, hw0, hw1, ht, M){
    const ring = (s, hw) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => kAdd(kAt(H, ray, s), kAdd(kScl(b, hw*i), kScl(n, ht*j))));
    const A = ring(s0, hw0), B = ring(s1, hw1);
    let s = loft(A, B, nr => tone(nr, M));
    const capB = vis(ray), cap = capB ? B : A, cn = capB ? ray : kScl(ray, -1);
    if (vis(cn)) s += fill(pd(cap), tone(cn, M)) + ink(pd(cap), .7);
    return s + hullInk([...A, ...B], 1.3);
  }
  // a clamp screw sticking out of a sleeve: knurled head on a short neck
  function cpScrew(base, out, M = MAT.steel){
    return rod(base, kAt(base, out, .7), .85, M, toneI, .7, .85, 12) + rod(kAt(base, out, .7), kAt(base, out, 3.1), 1.75, M, toneI, .9, 1.75, 16);
  }
  // one leg, its sleeve, clamp screw and point (needle or lead), sorted along the leg
  function cpLeg(p, G, kind, m){
    const needle = kind === 'needle', ray = needle ? G.rn : G.rl, out = needle ? G.outN : G.outL, H = p.H;
    const items = [
      { name:'bar', s0: 3, s1: CP_L - 26.5, svg: cpBar(H, ray, out, G.n, 3, CP_L - 26.5, 2.7, 1.9, 1.6, m) },
      { name:'sleeve', s0: CP_L - 27, s1: CP_L - 13, svg: coaxSeg(H, ray, { s0: CP_L - 27, s1: CP_L - 13, r0: needle ? 2.4 : 2.8, M: MAT.steel, n: 18, w: 1, shade: toneI, hole1: needle ? .7 : 1.1 })
        + (needle ? '' : cpSlit(H, ray, G.n)) } ];
    if (needle) items.push(
      { name:'shank', s0: CP_L - 13, s1: CP_L - 2.6, svg: coaxSeg(H, ray, { s0: CP_L - 13, s1: CP_L - 2.6, r0: .6, M: MAT.steel, n: 10, w: .7, shade: toneI }) },
      { name:'shoulder', s0: CP_L - 2.6, s1: CP_L - 2.1, svg: coaxSeg(H, ray, { s0: CP_L - 2.6, s1: CP_L - 2.1, r0: .6, r1: .3, M: MAT.steel, n: 10, w: .6, shade: toneI }) },
      { name:'point', s0: CP_L - 2.1, s1: CP_L, svg: coaxSeg(H, ray, { s0: CP_L - 2.1, s1: CP_L, r0: .3, r1: .03, M: MAT.steel, n: 10, w: .6, shade: toneI }) });
    else items.push(
      { name:'lead', s0: CP_L - 13, s1: CP_L - 3.6, svg: coaxSeg(H, ray, { s0: CP_L - 13, s1: CP_L - 3.6, r0: 1.0, M: MAT.graphite, n: 12, w: .7, shade: toneI }) },
      { name:'tip', s0: CP_L - 3.6, s1: CP_L, svg: coaxSeg(H, ray, { s0: CP_L - 3.6, s1: CP_L, r0: 1.0, r1: .14, M: MAT.graphite, n: 12, w: .6, shade: toneI }) });
    const chain = coaxOrder(ray, items), screw = cpScrew(kAdd(kAt(H, ray, CP_L - 20), kScl(out, needle ? 2.3 : 2.7)), out);
    return vis(out) ? chain + screw : screw + chain;
  }
  // the lead sleeve is split along its length so the screw can squeeze it: the slit on the side that faces the viewer
  function cpSlit(H, ray, n){ const side = vis(n) ? n : kScl(n, -1);
    return `<path d="${pd([kAdd(kAt(H, ray, CP_L - 24), kScl(side, 2.82)), kAdd(kAt(H, ray, CP_L - 13.2), kScl(side, 2.82))], false)}" fill="none" stroke="${INK}" stroke-width=".8"/>`; }
  // the hinge head: three knuckles on the pivot axis, the screw head on one side, the hex lock nut on the other
  function cpHead(p, G, m){
    const H = p.H, n = G.n, S = (s0, s1, r0, M, extra = {}) => coaxSeg(H, n, { s0, s1, r0, M, n: extra.n || 28, w: extra.w || 1.2, shade: extra.shade || tone, ...extra });
    let slot = '';
    if (vis(n)){ const a = kAdd(kAt(H, n, 5.75), kScl(G.up, 1.6)), b = kAdd(kAt(H, n, 5.75), kScl(G.up, -1.6)); slot = `<path d="${pd([a, b], false)}" stroke="${INK}" stroke-width="1" fill="none"/>`; }
    return coaxOrder(n, [
      { name:'kA', s0: -5, s1: -1.9, svg: S(-5, -1.9, CP_HR, m) },
      { name:'kM', s0: -1.7, s1: 1.7, svg: S(-1.7, 1.7, CP_HR, m) },
      { name:'kB', s0: 1.9, s1: 5, svg: S(1.9, 5, CP_HR, m) },
      { name:'screw', s0: 5, s1: 5.7, svg: S(5, 5.7, 2.4, MAT.steel, { shade: toneI, w: .9 }) + slot },
      { name:'nut', s0: -5.7, s1: -5, svg: S(-5.7, -5, 2.7, MAT.steel, { shade: toneI, w: .9, n: 6, edges: .5 }) } ]);
  }
  // the knurled handle on its stem, up from the head
  function cpHandle(p, G){
    const H = p.H, up = G.up;
    let knurl = ''; for (let s = 9.6; s < 20.5; s += 1.15) for (const run of nearArc(kAt(H, up, s), up, 3.13, 24)) knurl += pd(run, false);
    return act('handle', coaxOrder(up, [
      { name:'stem', s0: 4.6, s1: 8.5, svg: coaxSeg(H, up, { s0: 4.6, s1: 8.5, r0: 1.5, M: MAT.steel, n: 14, w: .9, shade: toneI }) },
      { name:'grip', s0: 8.5, s1: 21, svg: coaxSeg(H, up, { s0: 8.5, s1: 21, r0: 3.1, M: MAT.steel, n: 24, w: 1.2 }) + (knurl ? `<path d="${knurl}" fill="none" stroke="${INK}" stroke-width=".5" opacity=".7"/>` : '') },
      { name:'cap', s0: 21, s1: 22.4, svg: coaxSeg(H, up, { s0: 21, s1: 22.4, r0: 3.1, r1: 2.0, M: MAT.steel, n: 24, w: 1.1 }) } ]));
  }
  function cpBody(p, m){
    const G = cpGeom(p), legs = vis(p.w) ? cpLeg(p, G, 'needle', m) + cpLeg(p, G, 'lead', m) : cpLeg(p, G, 'lead', m) + cpLeg(p, G, 'needle', m);
    const head = cpHead(p, G, m), handle = cpHandle(p, G);
    return legs + (vis(G.up) ? head + handle : handle + head);
  }
  // see-through: the pivot screw's shank and the friction washers between the knuckles, the handle's threaded stem,
  // the needle and the lead whole inside their sleeves, the clamp screws' shanks bearing on them
  function cpMech(p, st){
    const G = cpGeom(p), H = p.H, n = G.n;
    const thread = (o, d, s0, s1, r) => { let t = ''; for (let s = s0 + .3; s < s1; s += .45) for (const run of nearArc(kAt(o, d, s), d, r + .02, 14)) t += pd(run, false);
      return t ? `<path d="${t}" fill="none" stroke="${INK}" stroke-width=".35"/>` : ''; };
    const legIn = kind => { const needle = kind === 'needle', ray = needle ? G.rn : G.rl, out = needle ? G.outN : G.outL;
      const inner = needle ? coaxSeg(H, ray, { s0: CP_L - 26, s1: CP_L - 2.6, r0: .6, M: MAT.steel, n: 10, w: .7, shade: toneI })
                           : coaxSeg(H, ray, { s0: CP_L - 26, s1: CP_L - 3.6, r0: 1.0, M: MAT.graphite, n: 12, w: .7, shade: toneI });
      const r0 = needle ? .6 : 1.0, base = kAt(H, ray, CP_L - 20);
      const shaft = rod(kAdd(base, kScl(out, r0)), kAdd(base, kScl(out, needle ? 2.4 : 2.8)), .7, MAT.brass, toneI, .6, .7, 10);
      return vis(out) ? inner + shaft : shaft + inner; };
    const legs = vis(p.w) ? legIn('needle') + legIn('lead') : legIn('lead') + legIn('needle');
    const head = coaxSeg(H, n, { s0: -5.2, s1: 5.2, r0: 1.15, M: MAT.steel, n: 14, w: .8, shade: toneI }) + thread(H, n, -5.2, -1.9, 1.15)
      + coaxOrder(n, [
        { name:'wA', s0: -1.9, s1: -1.7, svg: coaxSeg(H, n, { s0: -1.95, s1: -1.65, r0: 4.9, M: FIBRE, n: 28, w: .8, shade: toneI, hole0: 1.15, hole1: 1.15, bore: MAT.steel.d }) },
        { name:'wB', s0: 1.7, s1: 1.9, svg: coaxSeg(H, n, { s0: 1.65, s1: 1.95, r0: 4.9, M: FIBRE, n: 28, w: .8, shade: toneI, hole0: 1.15, hole1: 1.15, bore: MAT.steel.d }) } ]);
    const stem = coaxSeg(H, G.up, { s0: 1.2, s1: 5.2, r0: 1.25, M: MAT.steel, n: 12, w: .7, shade: toneI }) + thread(H, G.up, 1.2, 5.2, 1.25);
    return legs + (vis(G.up) ? head + stem : stem + head);
  }
  function cpPts(p){ const G = cpGeom(p), pts = [G.T, G.Ld, kAt(p.H, G.up, 22.4)];
    for (const s of [-5.7, 5.7]) pts.push(...axisRing(kAt(p.H, G.n, s), G.n, CP_HR, 8));
    return pts; }
  // one solid shadow, built from the legs and the head (a hull of everything would fill in the space between the legs)
  function cpShadow(p){ const G = cpGeom(p), head = [...axisRing(kAt(p.H, G.n, -5.7), G.n, CP_HR, 10), ...axisRing(kAt(p.H, G.n, 5.7), G.n, CP_HR, 10), kAt(p.H, G.up, 22.4)];
    const leg = ray => [...axisRing(kAt(p.H, ray, 4), ray, 2.6, 6), ...axisRing(kAt(p.H, ray, CP_L - 14), ray, 2.8, 6), kAt(p.H, ray, CP_L)];
    return [head, leg(G.rn), leg(G.rl)].map(q => castShadow(q, ZP)).join(''); }

  /* ---------- the sheet, circles, carving ---------- */
  const lineSvg = (pts, col = GRAPHITE, w = .62) => pts && pts.length > 1 ? `<path d="${pd(pts, false)}" fill="none" stroke="${col}" style="stroke-width:${w}" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>` : '';
  // its part of S2 (the scene draws the sheet, its grid and title): the task, centre O, the circles drawn so far
  function worksheet(st){
    const z = ZP + .02, [ou, ov] = O_PAPER;
    let s = S2.deskText(8, 25, z, '作图题：以 O 为圆心画圆', 4.6, INK, 800);
    s += S2.deskText(8, 32, z, '（保留作图痕迹）', 3.4, '#5b564d', 700);
    s += fill(pd(Array.from({ length: 12 }, (_, i) => S2.dk(ou + .9*Math.cos(i/12*2*Math.PI), ov + .9*Math.sin(i/12*2*Math.PI), z + .01))), INK);
    s += S2.deskText(ou - 5.5, ov - 1.8, z, 'O', 4.2, INK, 800);
    for (const c of st.circles) s += lineSvg(c);
    s += lineSvg(st.trace);
    return s;
  }
  const zaoSvg = strokes => { if (!strokes.length) return '';
    const d = strokes.map(q => pd(q, false)).join(''), hi = strokes.map(q => pd(q.map(p => kAdd(p, dkv(.32, .38, 0))), false)).join('');
    return `<path d="${d}" fill="none" stroke="#6b4422" style="stroke-width:1.15" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="${hi}" fill="none" stroke="#f8deb0" style="stroke-width:.35" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`; };

  /* ---------- scene ---------- */
  function scene(st, m){
    const k = ease(st.xr || 0), p = st.pose;
    let s = zaoSvg(st.carved ? ZAO_PASSES : st.carve ? traceStrokes(ZAO_PASSES, st.carve.dist, 2).done : []);
    s += worksheet(st);
    s += cpShadow(p);
    let body = cpBody(p, m);
    if (k > 0) body = `<g opacity="${f(1 - .78*k)}">${body}</g><g opacity="${f(k)}">${cpMech(p, st)}</g>`;
    s += body;
    s += labels(st, k);
    return s;
  }
  function labels(st, k){
    const p = st.pose, G = cpGeom(p), pts = cpPts(p);
    const B = [Math.min(...pts.map(q => q[0])), Math.max(...pts.map(q => q[0])), Math.min(...pts.map(q => q[1])), Math.max(...pts.map(q => q[1])), ZP, Math.max(...pts.map(q => q[2]))];
    const turning = st.act === 'draw' || st.act === 'slip', side = vis(G.n) ? 1 : -1;
    if (k > .6) return zhCallouts([
      { at: kAt(p.H, G.n, side*3.2), text: '转轴螺丝', on: !!st.opening },
      { at: kAdd(kAt(p.H, G.n, side*1.8), kScl(G.up, -4.6)), text: '摩擦垫片', on: !!st.opening },
      { at: kAt(p.H, G.n, -side*5.4), text: '锁紧螺母', on: false },
      { at: kAt(p.H, G.up, 3), text: '手柄螺杆', on: turning },
      { at: kAt(p.H, G.rn, CP_L - 22), text: '针夹', on: false },
      { at: kAt(p.H, G.rn, CP_L - 2.4), text: '钢针台肩', on: turning && st.planted },
      { at: kAt(p.H, G.rl, CP_L - 22), text: '芯夹', on: false },
      { at: kAdd(kAt(p.H, G.rl, CP_L - 20), kScl(G.outL, 2)), text: '夹紧螺丝', on: false },
      { at: kAt(p.H, G.rl, CP_L - 8), text: '铅芯', on: turning } ], B);
    return zhCallouts([
      { at: kAt(p.H, G.up, 15), text: '手柄', on: turning },
      { at: kAt(p.H, G.n, side*5.7), text: '铰链头', on: !!st.opening },
      { at: kAt(p.H, G.rn, CP_L*.45), text: '针脚', on: false },
      { at: kAt(p.H, G.rl, CP_L*.45), text: '笔脚', on: false },
      { at: kAt(p.H, G.rn, CP_L - 1.5), text: '钢针', on: st.act === 'carve' || (turning && st.planted) },
      { at: kAt(p.H, G.rl, CP_L - 1.5), text: '铅芯', on: turning },
      { at: kAdd(kAt(p.H, G.rn, CP_L - 20), kScl(G.outN, 4.6)), text: '夹紧螺丝', on: false } ], B);
  }

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { open: '还在调半径', draw: '正在画圆', slip: '针还在滑……', carve: '正在刻字' };
  const busy = () => { if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等一下'); return true; };
  // lift it off the desk, spread or close the legs on the friction hinge in the hand, lay it back down
  function open(st, r){ if (busy()) return;
    if (r === st.r) return ui.flash(`已经是 ${r/10} cm 了`);
    kPlay(ui, 'open', [standUp(st),
      { ms: 520, start(){ this.r0 = st.r; st.opening = true; }, step(k){ st.r = this.r0 + (r - this.r0)*ease(k); st.pose = cpUp(cpRest(st), 16); }, end(){ st.r = r; st.opening = false; } },
      layDown(st) ],
      () => ui.flash(`半径 ${r/10} cm：转轴上的摩擦垫片让两脚停在这个角度`, 2000));
  }
  // picked up, the needle pressed into O, leaned and twirled by the handle: one full turn, the lead drawing the
  // circle; then laid down again
  function draw(st){ if (busy()) return;
    const T = cpO(), r = st.r, turn = 2*Math.PI + .14; let phi0 = 0;
    kPlay(ui, 'draw', [standUp(st),
      { ...segVia(st, () => cpRest(st), 260, 0), end(){ st.pose = cpRest(st); st.planted = true; } },
      { ms: 1500, start(){ phi0 = st.phi; st.act = 'draw'; st.trace = []; },
        step(k){ const e = ease(k), phi = phi0 + e*turn, lean = .22*Math.min(1, k/.15, (1 - k)/.15);
          st.pose = cpStand(T, phi, r, lean);
          const nT = Math.max(2, Math.round(e*96));
          st.trace = Array.from({ length: nT }, (_, i) => { const q = phi0 + e*turn*i/(nT - 1); return dk(CO[0] + r*Math.cos(q), CO[1] + r*Math.sin(q), ZP + .03); }); },
        end(){ st.phi = (phi0 + turn) % (2*Math.PI); st.circles.push(st.trace); if (st.circles.length > 7) st.circles.shift(); st.trace = []; st.pose = cpRest(st); st.act = null; st.drawn++; } },
      layDown(st) ],
      () => ui.flash(st.drawn === 1 ? '一笔画圆，首尾刚好接上' : `第 ${st.drawn} 个圆，半径 ${st.r/10} cm`));
  }
  // the needle only rests on the paper: the lead's drag pulls the centre away and the legs close, so the line spirals in
  const SLIP_DRIFT = norm(dkv(.55, -.83, 0)), SLIP_TURNS = 2.4*2*Math.PI;
  function slipAt(t, phi0, r0){ const sl = Math.max(0, Math.min(1, (t - .22)/.78)), e = sl*sl*(3 - 2*sl);
    return { c: kAdd(dk(CO[0], CO[1], ZP + .02), kScl(SLIP_DRIFT, 11*e)), r: r0*(1 - .58*e), phi: phi0 + t*SLIP_TURNS }; }
  const slipTrace = (t, phi0, r0) => { const n = Math.max(2, Math.round(t*260));
    return Array.from({ length: n }, (_, i) => { const z = slipAt(t*i/(n - 1), phi0, r0); return kAdd(z.c, kAdd(kScl(dkv(Math.cos(z.phi), Math.sin(z.phi)), z.r), [0, 0, .01])); }); };
  function slip(st){ if (busy()) return;
    const r0 = st.r, at = (t, phi0) => slipAt(t, phi0, r0);
    let phi0 = 0;
    kPlay(ui, 'slip', [standUp(st),
      // set down with the needle only resting on the surface
      { ...segVia(st, () => cpStand(dk(CO[0], CO[1], ZP + .02), st.phi, r0, 0), 300, 0), end(){ st.planted = false; } },
      { ms: 2300, start(){ phi0 = st.phi; st.act = 'slip'; st.trace = []; },
        step(k){ const t = ease(k), q = at(t, phi0), lean = .26*Math.min(1, k/.1);
          st.pose = cpStand(q.c, q.phi, q.r, lean);
          st.trace = slipTrace(t, phi0, r0); },
        end(){ st.circles.push(st.trace); if (st.circles.length > 7) st.circles.shift(); st.trace = []; st.act = null; st.away = true;
          ui.flash('针没扎进纸里，一转就滑——画成了一盘蚊香', 2600); } },
      { ms: 500, step(){} },
      layDown(st) ]);
  }
  // closed up, held like a pen, the needle scratches 早 into the bare desk, three passes a stroke. It is carried there
  // and back high over the desk (the calculator lies between O and the bare spot), never dragged through things.
  const CARRY = 60;
  function carve(st){ if (busy()) return;
    if (st.carved) return ui.flash('“早”已经刻好了，再刻就刻穿课桌了');
    const len = strokesLength(ZAO_PASSES), start = ZAO_PASSES[0][0];
    let last = start;
    kPlay(ui, 'carve', [
      { ...standUp(st, CARRY), start(){ const w = st.pose.w; st.phi = Math.atan2(dot(w, DV), dot(w, DU)); this.from = st.pose; this.to = cpUp(cpRest(st), CARRY); st.lying = false; st.act = 'carve'; st.away = true; } },
      segVia(st, () => cpUp(cpHeld(start), CARRY), 520, 0),
      segVia(st, () => cpHeld(start), 340, 0),
      { ms: len/90*1000, start(){ st.carve = { dist: 0 }; },
        step(k){ st.carve.dist = k*len; last = traceStrokes(ZAO_PASSES, st.carve.dist, 2).tip; st.pose = cpHeld(last); },
        end(){ st.carve = null; st.carved = true; } },
      segVia(st, () => cpUp(cpHeld(last), CARRY), 320, 0),
      segVia(st, () => cpUp(cpRest(st), CARRY), 520, 0),
      { ...layDown(st), ms: 800, end(){ st.pose = cpFlat(st); st.lying = true; st.planted = false; st.away = false; st.act = null; } } ],
      () => ui.flash('在课桌上刻了个“早”——鲁迅同款，班主任正往这边走', 2600));
  }

  const __cfg = ({
    fig:'08', turn:'full', title:'圆规', palette:'tomato',
    state:{ r: 30, phi: 0, pose: null, lying: true, flatSide: 1, planted: false, away: false, opening: false, act: null, trace: [], circles: [], drawn: 0, carve: null, carved: false },
    scene,
    stats: st => [ { label:'半径', value: (st.r/10).toFixed(1).replace('.0', '') + ' cm' }, { label:'画了', value: `${st.drawn} 个圆`, small: true } ],
    buttons:[
      { label:'张开', choices: st => RADII.map(r => ({ label: `${r/10} cm`, current: Math.abs(st.r - r) < .01, onClick: st => open(st, r) })) },
      { label:'画圆', onClick: draw },
      { label:'针滑了', onClick: slip },
      { label:'在桌上刻“早”', onClick: carve },
    ],
    acts:{ handle: st => draw(st) },
    params:(st, q) => {
      if (q.has('r')) st.r = Math.max(10, Math.min(60, +q.get('r')*10));
      if (q.has('phi')) st.phi = +q.get('phi')*Math.PI/180;
      st.pose = cpFlat(st);
      if (q.get('stand') === '1'){ st.pose = cpRest(st); st.lying = false; st.planted = true; }
      if (q.has('circles')) for (const r of q.get('circles').split('_')) st.circles.push(Array.from({ length: 97 }, (_, i) => dk(CO[0] + r*10*Math.cos(i/96*2*Math.PI), CO[1] + r*10*Math.sin(i/96*2*Math.PI), ZP + .03)));
      if (q.get('carved') === '1') st.carved = true;
      if (q.get('spiral') === '1'){ st.circles.push(slipTrace(1, 0, st.r)); st.drawn++; }
      if (q.has('lean')){ st.pose = cpStand(cpO(), st.phi, st.r, +q.get('lean')*Math.PI/180); st.lying = false; }
      if (q.get('pose') === 'held'){ st.pose = cpHeld(ZAO[1][1]); st.away = true; st.lying = false; }
    },
  });

  return ctx.adapt(__cfg, { seeThrough: true });
}
