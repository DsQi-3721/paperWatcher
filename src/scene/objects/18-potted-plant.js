// Fig. 18 小盆栽 — desk-scene object (a new one, written for the desk: no standalone page).
// Its code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*), ctx.ui its ui
// (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are collected by the scene.
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, LOD, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: 330, v: -300, rot: 0 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 18 — 小盆栽: a ball cactus (仙人球, an Echinopsis) in a little terracotta pot on its saucer, a plastic name
     tag stuck in the soil ("小刺"), a face drawn on the pot in white marker, and a small watering can beside it. On the
     deskmate's half, at the back. Desk terms: u along the front edge, v toward the student, z up; 1 unit = 1 mm.

     How it really works (each button is one of these):
     1. The pot: unglazed terracotta breathes, so the soil dries evenly; a hole in the bottom lets extra water out (a bit
        of mesh over it keeps the soil in), a layer of clay pebbles (陶粒) under the soil keeps the roots out of standing
        water, and the saucer catches what drains. Cactus soil is gritty and fast-draining; a top dressing of small
        stones keeps the base of the plant dry.
     2. Watering: a cactus stores water in its ribbed body (the ribs let it swell and shrink); water it well, at the
        edge of the pot, then not again until the soil is dry right through. Too much water, or water left standing in
        the saucer, and the roots rot.
     3. Light: on a windowsill it leans toward the light; turning the pot now and then keeps it growing straight.
     4. Loosening the top of the soil (with whatever is at hand: the name tag) lets air in after it has packed down.
     5. An Echinopsis flowers from an areole on its side: a long hairy tube and a big pink trumpet that lasts a day; a
        happy one also makes pups round its base.
     Student life: the cactus "against computer radiation" (it blocks none: it only stops hands), and the classic
     advice to talk to your plant (it doesn't hear you, but a plant someone talks to gets looked at, and watered, and
     turned: and does grow better).

     Parts:
     POT      saucer (outer wall, inner wall, floor, rim) and the water in it . pot (outer wall, rim band, rim top,
              inner wall above the soil) . marker face . drainage hole . mesh over it . clay pebbles . soil (top,
              column) . top-dressing stones . the water in the soil
     PLANT    ball cactus (12 ribs, woolly crown, areoles with radial and central spines) . roots . flower (tube, petals,
              stamens) or bud . pup
     TOOLS    name tag (plastic, written on) . watering can (body, top opening, handle, spout, rose) . water drops .
              hearts (talking to it) */

  /* ---------- layout (this object's frame: desk terms from PLACE) ---------- */
  const BH = ctx.deskZ;
  const PC = [-10, -12];                                                 // the pot's axis (u, v)
  const SA = { rb: 41, rt: 47, h: 12, t: 3 };                            // saucer: bottom / top radius, height, wall
  const PB = BH + SA.t, PT = BH + 75, RIMZ = PT - 11;                   // pot bottom (on the saucer floor), top, rim band
  const R_BOT = 30, R_RIMB = 38.5, R_RIM = 41.5, R_IN = 36.5;
  const rOut = z => z >= RIMZ ? R_RIM : R_BOT + (R_RIMB - R_BOT)*(z - PB)/(RIMZ - PB);
  const rIn = z => Math.min(R_IN, rOut(Math.min(z, RIMZ)) - 4.5);
  const SOIL = PT - 8, DRAIN = PB + 14;                                  // soil surface; top of the clay pebbles
  const CAN = { u: 44, v: 40, rb: 16, rt: 14, h: 44 };                  // watering can (base centre)

  /* ---------- materials ---------- */
  const CLAY = { l:'#e8956a', m:'#c96f45', d:'#7e3f22' }, CLAY_IN = { l:'#b8653f', m:'#9a5233', d:'#5f3019' };
  const GREEN = { l:'#9ad172', m:'#5f9f48', d:'#2d5f2a' }, PUPG = { l:'#a9db82', m:'#6fae55', d:'#356b2e' };
  const SOIL_DRY = '#6b4a34', SOIL_WET = '#3b281d';
  const PINK = { l:'#ffd3e0', m:'#f49cbc', d:'#b4557b' }, PINK_IN = { l:'#fff2f6', m:'#fbd3e1', d:'#d28aa6' };
  const TAG = { l:'#fbfaf4', m:'#e7e3d8', d:'#b9b2a2' };
  const PEBBLE = ['#f1ece2', '#cfc8bb', '#a9a196', '#e2d6c0'];
  const CERAM = { l:'#e9a067', m:'#c97a45', d:'#8a4f2a' };               // clay pebbles (陶粒)
  const WATERC = '#9ccfe6';

  /* ---------- helpers ---------- */
  // fine detail (wool, crests, small print, pebble outlines) only when the camera is close enough to see it
  const fine = () => LOD > .7;
  const NR = () => fine() ? 36 : 20;                                    // facets round the pot and saucer
  const boxOf = (pts, r = 0) => [[0,1,2].map(i => Math.min(...pts.map(p => p[i])) - r), [0,1,2].map(i => Math.max(...pts.map(p => p[i])) + r)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rotAbout = (v, k, a) => { const c = Math.cos(a), s2 = Math.sin(a), d = dot(k, v), x = cross(k, v); return [0, 1, 2].map(i => v[i]*c + x[i]*s2 + k[i]*d*(1 - c)); };
  const pp = (x, y, z) => dk(PC[0] + x, PC[1] + y, z);                  // a point round the pot's axis (no turn)
  const ringP = (z, r, n = NR(), ph = 0) => Array.from({length: n}, (_, i) => { const t = ph + i/n*2*Math.PI; return pp(r*Math.cos(t), r*Math.sin(t), z); });
  const radial = t => dkv(Math.cos(t), Math.sin(t), 0);
  const nearAt = t => dot(radial(t), CAM_V) > 0;
  const circ = (p, r, col, w = .4) => { const q = P(...p); return `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${f(Math.max(.2, r*CAM_K))}" fill="${col}" stroke="${INK}" stroke-width="${w}"/>`; };
  // handwriting on a face (a Kaiti face, like a gel pen)
  const kai = (p, u, n, str, size, col = INK) => { const v = cross(n, u);
    return `<text transform="${txM(P(...p), Dv(...u), Dv(...v))}" font-size="${f(size)}" fill="${col}" text-anchor="middle" dominant-baseline="central" font-family="'Kaiti SC','STKaiti','KaiTi','Songti SC',serif" font-weight="700">${str}</text>`; };
  // the outline of a set of points, split: the edges running along far points (drawn early, behind what stands in
  // front of them) and the rest
  function splitHull(pts3, isFar, w){
    const h = hull(pts3.map((p, i) => { const q = P(...p); return [q[0], q[1], i]; }));
    let far = '', near = '';
    for (let i = 0; i < h.length; i++){ const a = h[i], b = h[(i + 1) % h.length], seg = `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`;
      if (isFar(a[2]) && isFar(b[2])) far += seg; else near += seg; }
    const st_ = d => d ? `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>` : '';
    return { far: st_(far), near: st_(near) };
  }
  // the flat top of a round wall between radii ri and ro at z, cut into its far half and its near half
  function rimHalves(z, ro, ri, M, n = NR()){
    let far = '', near = '', fo = [], no = [];
    for (let i = 0; i < n; i++){ const a0 = i/n*2*Math.PI, a1 = (i + 1)/n*2*Math.PI, am = (a0 + a1)/2;
      const q = [pp(ro*Math.cos(a0), ro*Math.sin(a0), z), pp(ro*Math.cos(a1), ro*Math.sin(a1), z), pp(ri*Math.cos(a1), ri*Math.sin(a1), z), pp(ri*Math.cos(a0), ri*Math.sin(a0), z)];
      const d = pd(q); if (nearAt(am)) near += d; else far += d;
      (nearAt(am) ? no : fo).push([q[0], q[1], q[3], q[2]]); }
    const col = M.l;
    const edge = list => list.length ? `<path d="${list.map(([o0, o1, i0, i1]) => pd([o0, o1], false) + pd([i0, i1], false)).join('')}" fill="none" stroke="${INK}" stroke-width=".9"/>` : '';
    return { far: far ? `<path d="${far}" fill="${col}" stroke="${col}" stroke-width=".5"/>` + edge(fo) : '', near: near ? `<path d="${near}" fill="${col}" stroke="${col}" stroke-width=".5"/>` + edge(no) : '' };
  }

  /* ---------- the plant's own frame: a point (x, y, z) from the base of the cactus, leaned and turned with the pot ---------- */
  function plantXf(st){
    const tau = st.turn, lam = st.lean*Math.PI/180, psi = st.leanDir, ax = [-Math.sin(psi), Math.cos(psi), 0];
    const c = Math.cos(tau), s2 = Math.sin(tau), sq = 1 + .07*Math.sin(st.wobT*30)*st.wob;
    return (x, y, z) => { let p = rotAbout([x, y, z*sq], ax, lam); p = [p[0]*c - p[1]*s2, p[0]*s2 + p[1]*c, p[2]]; return pp(p[0], p[1], SOIL + p[2]); };
  }
  const potXf = st => { const c = Math.cos(st.turn), s2 = Math.sin(st.turn); return (x, y, z) => pp(x*c - y*s2, x*s2 + y*c, z); };

  /* ---------- the ball cactus ---------- */
  const RB = 27, KZ = .95, PHMAX = 125*Math.PI/180, NRIB = 12;
  // a ribbed ball standing on the soil: its surface point at polar angle phi (from the top) and angle th round it
  const ballPt = (phi, th, R = RB, kz = KZ, ribs = NRIB, amp = .085, phmax = PHMAX) => {
    const s1 = Math.sin(phi), r = R*s1*(1 + amp*Math.cos(ribs*th)*Math.min(1, s1*1.3)), hc = -R*kz*Math.cos(phmax);
    return [r*Math.cos(th), r*Math.sin(th), hc + R*kz*Math.cos(phi)]; };
  const ballN = (phi, th, kz = KZ) => norm([Math.sin(phi)*Math.cos(th), Math.sin(phi)*Math.sin(th), Math.cos(phi)/kz]);
  const PHIS = [5, 15, 27, 40, 53, 66, 79, 92, 105, 116, 125].map(d => d*Math.PI/180);
  const AREO = (() => { const out = []; for (let j = 0; j < NRIB; j++) for (const d of [17, 31, 46, 61, 76, 91, 106]) out.push([d*Math.PI/180, j/NRIB*2*Math.PI + (d % 2 ? .02 : 0)]); return out; })();
  function ballSvg(xf, R, kz, ribs, amp, phmax, M, phis, areos, spikeK, crown){
    const fk = fine(), per = fk ? 4 : 2, th = Array.from({length: ribs*per}, (_, j) => j/(ribs*per)*2*Math.PI);
    if (!fk) phis = phis.filter((_, i) => i % 2 === 0 || i === phis.length - 1);
    const rings = phis.map(ph => th.map(t => xf(...ballPt(ph, t, R, kz, ribs, amp, phmax))));
    let s = '';
    for (let i = 0; i < rings.length - 1; i++) s += loft(rings[i], rings[i + 1], n => tone(n, M));
    const topN = norm(sub(xf(0, 0, 1), xf(0, 0, 0)));
    if (vis(topN)) s += fill(pd(rings[0]), tone(topN, M));
    s += hullInk(rings.flat(), 1.2);
    // the rib crests as fine lines on the side toward the viewer
    let crest = ''; if (fk) for (let j = 0; j < ribs; j++){ const t = j/ribs*2*Math.PI, run = [];
      for (let i = 1; i < phis.length; i++){ const p = xf(...ballPt(phis[i], t, R, kz, ribs, amp, phmax)), n = norm(sub(xf(...kAdd(ballPt(phis[i], t, R, kz, ribs, amp, phmax), ballN(phis[i], t, kz))), p)); if (vis(n)) run.push(p); else if (run.length){ if (run.length > 1) crest += pd(run, false); run.length = 0; } }
      if (run.length > 1) crest += pd(run, false); }
    if (crest) s += `<path d="${crest}" fill="none" stroke="${M.d}" stroke-width=".55" opacity=".7"/>`;
    // areoles: a tuft of wool and a star of spines on each rib's crest
    let wool = '', sp1 = '';
    // (from afar: every other areole, three spines each, one stroke: the spiky look without the fine work)
    const ar = fk ? areos : areos.filter((_, i) => i % 2 === 0), nsp = fk ? 5 : 2;
    for (const [ph, t] of ar){ const pl = ballPt(ph, t, R, kz, ribs, amp, phmax), p = xf(...pl), n = norm(sub(xf(...kAdd(pl, ballN(ph, t, kz))), p));
      if (!vis(n)) continue;
      const e1 = norm(cross(n, Math.abs(n[2]) > .95 ? [1, 0, 0] : [0, 0, 1])), e2 = cross(n, e1), ln = (R/RB)*(4.6 + 2.6*spikeK);
      if (fk) wool += pd(Array.from({length: 6}, (_, j) => { const a = j/6*2*Math.PI; return kAdd(kAdd(p, kScl(n, .3)), kAdd(kScl(e1, 1.25*(R/RB)*Math.cos(a)), kScl(e2, 1.25*(R/RB)*Math.sin(a)))); }));
      for (let k = 0; k < nsp; k++){ const a = k/nsp*2*Math.PI + .4; sp1 += pd([kAdd(p, kScl(n, .4)), kAdd(p, kAdd(kAdd(kScl(e1, ln*Math.cos(a)), kScl(e2, ln*Math.sin(a))), kScl(n, ln*.35)))], false); }
      sp1 += pd([kAdd(p, kScl(n, .4)), kAdd(p, kScl(n, ln*1.35))], false); }
    if (sp1) s += fk ? `<path d="${sp1}" fill="none" stroke="${INK}" stroke-width="1.15" stroke-linecap="round" opacity=".8"/><path d="${sp1}" fill="none" stroke="#f7e9b0" stroke-width=".55" stroke-linecap="round"/>`
      : `<path d="${sp1}" fill="none" stroke="#e9d68f" stroke-width=".8" stroke-linecap="round"/>`;
    if (wool) s += `<path d="${wool}" fill="#fbf6e6" stroke="${INK}" stroke-width=".3"/>`;
    if (crown && vis(topN)){ const c = xf(0, 0, ballPt(0, 0, R, kz, ribs, amp, phmax)[2] + .5), e1 = norm(cross(topN, [1, 0, 0])), e2 = cross(topN, e1);
      s += fill(pd(Array.from({length: 12}, (_, j) => { const a = j/12*2*Math.PI, rr = 4.2*(1 + .15*Math.sin(5*a)); return kAdd(c, kAdd(kScl(e1, rr*Math.cos(a)), kScl(e2, rr*Math.sin(a)))); })), '#fbf3df') + ink(pd(Array.from({length: 12}, (_, j) => { const a = j/12*2*Math.PI, rr = 4.2*(1 + .15*Math.sin(5*a)); return kAdd(c, kAdd(kScl(e1, rr*Math.cos(a)), kScl(e2, rr*Math.sin(a)))); })), .4); }
    return { svg: s, pts: rings.flat() };
  }

  /* ---------- the flower (or bud), on an areole near the top ---------- */
  const FL_AT = [34*Math.PI/180, 2*2*Math.PI/NRIB];
  function flowerItem(st, xf){
    const [ph, t] = FL_AT, base = ballPt(ph, t), n0 = ballN(ph, t), d = norm(kAdd(n0, [0, 0, 1.25])), g = st.flower >= 1 ? .45*st.budK + .55*st.bloom : 0;
    if (g < .02) return null;
    const open = st.bloom, TL = 32*g, e1 = norm(cross(d, [0, 0, 1])), e2 = cross(d, e1);
    const W = p => xf(...p), tip = kAt(base, d, TL);
    // the hairy tube
    let s = rod(W(base), W(tip), 1.9 + .5*g, { l:'#b9d58a', m:'#8fb46a', d:'#4f7038' }, toneI, .8, 2.8 + 1.4*open, 12);
    let hair = ''; for (let i = 1; i < 6; i++){ const c = kAt(base, d, TL*i/6); for (const a of [.6, 2.4, 4.2]){ const r_ = kAdd(kScl(e1, Math.cos(a)), kScl(e2, Math.sin(a))); hair += pd([W(kAdd(c, kScl(r_, 2.6))), W(kAdd(c, kAdd(kScl(r_, 4.8), kScl(d, 1.4))))], false); } }
    s += `<path d="${hair}" fill="none" stroke="#f6f0dc" stroke-width=".55" opacity=".9"/>`;
    // petals: two whorls flaring out of the tube's mouth
    const items = [];
    // broad petals with rounded tips, cupped a little: an outer whorl and a paler inner one
    const PET = [[0, .3], [.3, .52], [.62, .56], [.86, .42], [.97, .2], [1, 0]];
    for (const [cnt, len, wid, M, ph0] of [[10, 21, 8.4, PINK, 0], [8, 15, 6.6, PINK_IN, .3]]) for (let i = 0; i < cnt; i++){
      const a = ph0 + i/cnt*2*Math.PI, r_ = kAdd(kScl(e1, Math.cos(a)), kScl(e2, Math.sin(a))), sd = kAdd(kScl(e1, -Math.sin(a)), kScl(e2, Math.cos(a)));
      const L_ = len*(.35 + .65*Math.max(open, .2)), spread = .15 + .95*open, dir = norm(kAdd(kScl(d, 1), kScl(r_, spread))), w_ = wid*(.45 + .55*open);
      const b0 = kAdd(tip, kScl(r_, 2.6)), lift = kScl(r_, -L_*.08);
      const side_ = sg => PET.map(([t, w]) => kAdd(kAdd(kAdd(b0, kScl(dir, L_*t)), kScl(sd, sg*w_*w*.5)), kScl(lift, Math.sin(Math.PI*t)*(1 - Math.abs(w - .3)))));
      const q = [...side_(-1), ...side_(1).reverse().slice(1)].map(W);
      const nn = norm(cross(sub(q[5], q[0]), sub(q[q.length - 1], q[0])));
      const rib = !fine() ? '' : `<path d="${pd([W(kAdd(b0, kScl(dir, L_*.12))), W(kAdd(b0, kScl(dir, L_*.8)))], false)}" fill="none" stroke="${M.d}" stroke-width=".4" opacity=".55"/>`;
      items.push({ box: boxOf(q, .2), svg: face(pd(q), toneI(vis(nn) ? nn : kScl(nn, -1), M)) + rib + ink(pd(q), .45) }); }
    let petals = byDepth(items);
    if (open > .5 && vis(norm(sub(W(kAt(base, d, 1)), W(base))))){ let st_ = ''; for (let i = 0; i < 9; i++){ const a = i/9*2*Math.PI; st_ += pd([W(kAt(tip, d, .5)), W(kAdd(kAt(tip, d, 5), kAdd(kScl(e1, 2.2*Math.cos(a)), kScl(e2, 2.2*Math.sin(a)))))], false); }
      petals += `<path d="${st_}" fill="none" stroke="#e6c23a" stroke-width=".8"/>` + circ(W(kAt(tip, d, 6)), .9, '#f2d64a', .3); }
    const pts = [W(base), W(tip), ...items.flatMap(it => [it.box[0], it.box[1]])];
    const facingViewer = dot(norm(sub(W(kAdd(base, n0)), W(base))), CAM_V) > 0;
    return { near: facingViewer, svg: s + petals, pts };
  }

  /* ---------- the pup ---------- */
  const PUP_AT = [-.62, 28.6];                                          // angle round the axis, distance out
  function pupItem(st){
    if (!(st.pup > 0)) return null;
    const [a, r] = PUP_AT, k = st.pup, R = 7*k, ox = r*Math.cos(a), oy = r*Math.sin(a), px = potXf(st);
    const xf = (x, y, z) => px(ox + x, oy + y, SOIL + z - .5);
    const b = ballSvg(xf, R, .9, 8, .1, 120*Math.PI/180, PUPG, [8, 30, 55, 80, 100, 120].map(d => d*Math.PI/180), [[40*Math.PI/180, 0], [40*Math.PI/180, 2.4], [70*Math.PI/180, 4]], 0, false);
    return { near: nearAt(a + st.turn), svg: b.svg, pts: b.pts };
  }

  /* ---------- the name tag ---------- */
  const TAG_AT = 2.35, TAG_R = 31.5;
  function tagItem(st){
    const xf = potXf(st);
    let c, len, nrm, wdt;
    if (st.tagPose){ ({ c, len, nrm, wdt } = st.tagPose); }
    else { const a = TAG_AT, rd = [Math.cos(a), Math.sin(a), 0], lean = .17, up = norm([rd[0]*Math.sin(lean), rd[1]*Math.sin(lean), Math.cos(lean)]);
      c = kAdd([TAG_R*rd[0], TAG_R*rd[1], SOIL], kScl(up, 14)); len = up; nrm = norm(sub(rd, kScl(up, dot(rd, up)))); wdt = cross(len, nrm); }
    // turned with the pot (desk point from pot-frame point)
    const W = p => xf(...p), cw = W(c), lw = norm(sub(W(kAdd(c, len)), cw)), nw = norm(sub(W(kAdd(c, nrm)), cw)), ww = norm(sub(W(kAdd(c, wdt)), cw));
    // written down the tag, a character at a time, upright for whoever faces it
    let words = '';
    if (fine() && vis(nw)){ const down = kScl(lw, -1), R0 = Dv(...ww), D0 = Dv(...down), right = R0[0]*D0[1] - R0[1]*D0[0] >= 0 ? ww : kScl(ww, -1);
      const col = (str, size, off, top) => [...str].map((ch, i) => kai(kAdd(kAdd(kAdd(cw, kScl(nw, .75)), kScl(lw, top - i*size*1.08)), kScl(right, off)), right, cross(right, down), ch, size, '#2b3a8c')).join('');
      words = col('小刺', 6.6, 1.2, 11) + col('仙人球', 3, -3.6, 9); }
    const svg = obox(cw, nw, ww, lw, .7, 6, 15, TAG, toneI, .8) + words;
    return { box: boxOf(oboxPts(cw, nw, ww, lw, .7, 6, 15), .3), svg: act('tag', svg), near: dot(nw, CAM_V) > 0 };
  }

  /* ---------- the pot and saucer ---------- */
  const FACE_AT = Math.PI/2;                                            // the marker face, on the side toward the student
  const PEBS = (() => { const r = kRng(41), out = []; while (out.length < 46){ const a = r()*2*Math.PI, d = 23 + r()*(R_IN - 25); out.push([d*Math.cos(a), d*Math.sin(a), .8 + r()*1.1, Math.floor(r()*4), r()*3]); } return out; })();
  const CLODS = (() => { const r = kRng(43), out = []; for (let i = 0; i < 22; i++){ const a = r()*2*Math.PI, d = 23 + r()*(R_IN - 25); out.push([d*Math.cos(a), d*Math.sin(a), .9 + r()*1.2]); } return out; })();
  const DRAIN_BALLS = (() => { const r = kRng(47), out = []; for (let i = 0; i < 26; i++){ const a = r()*2*Math.PI, d = r()*(R_BOT - 7), z = PB + 3 + r()*(DRAIN - PB - 6); out.push([d*Math.cos(a), d*Math.sin(a), z, 2.6 + r()*1.4]); } return out; })();
  const ROOTS = (() => { const r = kRng(53), out = [];
    const grow = (p, dir, len, depth) => { const pts = [p]; let q = p, d = dir;
      for (let i = 0; i < 6; i++){ d = norm(kAdd(d, [(r() - .5)*.5, (r() - .5)*.5, -.12])); q = kAdd(q, kScl(d, len/6));
        const hr = Math.hypot(q[0], q[1]), lim = rIn(q[2]) - 3; if (hr > lim) q = [q[0]*lim/hr, q[1]*lim/hr, q[2]]; if (q[2] < DRAIN + 1) q[2] = DRAIN + 1; pts.push(q); }
      out.push({ pts, w: depth ? .7 : 1.1 });
      if (depth < 2) for (let k = 0; k < 2; k++){ const j = 2 + Math.floor(r()*3); grow(pts[j], norm(kAdd(d, [(r() - .5)*1.2, (r() - .5)*1.2, -.2])), len*.55, depth + 1); } };
    for (let i = 0; i < 6; i++){ const a = i/6*2*Math.PI + r()*.4; grow([7*Math.cos(a), 7*Math.sin(a), SOIL - 3], norm([Math.cos(a), Math.sin(a), -1.1]), 34 + r()*12, 0); }
    return out; })();

  function potSvg(st, m, k, inside){
    const near = [], tN = st.turn;
    // outer wall: the tapering body and the rim band; inner wall above the soil
    const A = ringP(PB, R_BOT), B = ringP(RIMZ, R_RIMB), B2 = ringP(RIMZ, R_RIM), T = ringP(PT, R_RIM), I0 = ringP(SOIL, R_IN), I1 = ringP(PT, R_IN);
    const hullPts = [...A, ...T], farIdx = i => i >= A.length && !nearAt((i - A.length)/T.length*2*Math.PI);
    const H = splitHull(hullPts, farIdx, 1.7), rim = rimHalves(PT, R_RIM, R_IN, CLAY);
    const ghost = s => k > 0 ? `<g opacity="${f(1 - .85*k)}">${s}</g>` : s;
    let s = ghost(loft(I0, I1, n => toneI(n, CLAY_IN), true) + rim.far + H.far) + potInside(st, k, false);
    // the soil (translucent in see-through, so what is under it shows) with its stones, clods and any water on it
    const soilCol = mix(SOIL_DRY, SOIL_WET, st.wet);
    s += fill(pd(ringP(SOIL, R_IN - .2)), soilCol, k > 0 ? `opacity="${f(1 - .55*k)}"` : '');
    if (st.puddle > .01) s += fill(pd(ringP(SOIL + .3, R_IN - 1.5)), WATERC, `pointer-events="none" opacity="${f(.55*st.puddle)}"`)
      + `<path d="${pd([pp(-18, -10, SOIL + .35), pp(-6, -22, SOIL + .35)], false)}" stroke="#ffffff" stroke-width="1.2" opacity="${f(.7*st.puddle)}"/>`;
    const xf0 = potXf(st);
    const pebs = PEBBLE.map(() => '');
    const fk = fine(), np = fk ? 6 : 4;
    for (const [x, y, r, ci, a] of fk ? PEBS : PEBS.filter((_, i) => i % 3 === 0)){ const c = xf0(x, y, SOIL + .25); pebs[ci] += pd(Array.from({length: np}, (_, j) => { const t = j/np*2*Math.PI + a; return kAdd(c, dkv(r*1.2*Math.cos(t), r*.85*Math.sin(t), 0)); })); }
    s += pebs.map((d, i) => d ? `<path d="${d}" fill="${PEBBLE[i]}"${fk ? ` stroke="${INK}" stroke-width=".25"` : ''}/>` : '').join('');
    if (st.loose > .01){ let cl = ''; for (const [x, y, r] of CLODS.slice(0, Math.round(CLODS.length*st.loose))){ const c = xf0(x, y, SOIL + .4); cl += pd(Array.from({length: 5}, (_, j) => { const t = j/5*2*Math.PI; return kAdd(c, dkv(r*Math.cos(t), r*.8*Math.sin(t), 0)); })); }
      s += `<path d="${cl}" fill="${mix(soilCol, '#000000', .25)}" stroke="${INK}" stroke-width=".25"/>`; }
    s += potInside(st, k, true) + inside;
    // near outer wall, rim band, rim top: ghosted in see-through
    let w = loft(A, B, n => tone(n, CLAY)) + loft(B2, T, n => tone(n, CLAY));
    // the rim band's lower edge, where it steps out from the body
    let lip = ''; { const run = []; for (let i = 0; i <= 36; i++){ const a = i/36*2*Math.PI; if (nearAt(a)) run.push(pp(R_RIM*Math.cos(a), R_RIM*Math.sin(a), RIMZ)); else if (run.length){ if (run.length > 1) lip += pd(run, false); run.length = 0; } } if (run.length > 1) lip += pd(run, false); }
    if (lip) w += `<path d="${lip}" fill="none" stroke="${INK}" stroke-width=".8"/>`;
    // the face drawn on it in white marker (turns with the pot)
    const fa = FACE_AT + tN;
    if (nearAt(fa)){ const z0 = BH + 38, on_ = (da, z) => { const r = rOut(z) + .15; return pp(r*Math.cos(fa + da), r*Math.sin(fa + da), z); };
      const eye = sgn => pd([on_(sgn*.22 - .07, z0 + 9), on_(sgn*.22, z0 + 11.5), on_(sgn*.22 + .07, z0 + 9)], false);
      const smile = pd(Array.from({length: 9}, (_, i) => { const t = -1 + i/4; return on_(t*.2, z0 + 1 - 4*(1 - t*t)); }), false);
      w += `<path d="${eye(-1)}${eye(1)}${smile}" fill="none" stroke="#fffaf0" stroke-width="1.5" stroke-linecap="round"/>`;
      const blush = sgn => pd(Array.from({length: 8}, (_, i) => { const t = i/8*2*Math.PI; return on_(sgn*.32 + .045*Math.cos(t), z0 + 4 + 1.6*Math.sin(t)); }));
      w += `<path d="${blush(-1)}${blush(1)}" fill="#f6a0a0" opacity=".7"/>`; }
    s += ghost(act('pot', w) + rim.near + H.near);
    return s;
  }
  // see-through: what is under the soil, inside the pot
  function potInside(st, k, roots){
    if (k <= 0) return '';
    if (roots){ const xf0 = potXf(st); let rt = ''; for (const r of ROOTS) rt += pd(r.pts.map(p => xf0(...p)), false);
      return `<g opacity="${f(k)}"><path d="${rt}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/><path d="${rt}" fill="none" stroke="#f2e6c8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></g>`; }
    const xf0 = potXf(st);
    let s = '';
    // the hole, the mesh over it, the clay pebbles, the soil column (its near side), the water in it, the roots
    s += fill(pd(ringP(PB + .2, 6.5, 20)), '#1d1612');
    const mesh = ringP(PB + 1.4, 10, 20); let g = '';
    for (let x = -8; x <= 8; x += 2.6) g += pd([pp(x, -Math.sqrt(100 - x*x), PB + 1.45), pp(x, Math.sqrt(100 - x*x), PB + 1.45)], false) + pd([pp(-Math.sqrt(100 - x*x), x, PB + 1.45), pp(Math.sqrt(100 - x*x), x, PB + 1.45)], false);
    s += fill(pd(mesh), '#9aa1a4', 'opacity=".7"') + `<path d="${g}" fill="none" stroke="#555b5e" stroke-width=".4"/>` + ink(pd(mesh), .4);
    const balls = DRAIN_BALLS.map(([x, y, z, r]) => ({ p: xf0(x, y, z), r })).sort((a, b) => depthOf(a.p) - depthOf(b.p));
    for (const b of balls){ const q = P(...b.p); s += circ(b.p, b.r, CERAM.m, .45) + `<circle cx="${f(q[0] - b.r*.35*CAM_K)}" cy="${f(q[1] - b.r*.35*CAM_K)}" r="${f(b.r*.32*CAM_K)}" fill="${CERAM.l}"/>`; }
    const colA = ringP(DRAIN, rIn(DRAIN) - .3), colB = ringP(SOIL, R_IN - .3);
    s += `<g opacity=".42">${loft(colA, colB, n => toneI(n, { l: '#8a6248', m: SOIL_DRY, d: '#3e2a1d' }))}</g>`;
    if (st.wet > .02){ const wz = DRAIN + (SOIL - DRAIN)*.85*st.wet;
      s += `<g opacity=".35">${loft(colA, ringP(wz, rIn(wz) - .3), () => '#4f7fa6')}</g>`; }
    return `<g opacity="${f(k)}">${s}</g>`;
  }
  function saucerSvg(st, contents, k){
    const A = ringP(BH, SA.rb), T = ringP(BH + SA.h, SA.rt), I0 = ringP(BH + SA.t, SA.rb - SA.t), I1 = ringP(BH + SA.h, SA.rt - SA.t);
    const H = splitHull([...A, ...T], i => i >= A.length && !nearAt((i - A.length)/T.length*2*Math.PI), 1.5);
    const rim = rimHalves(BH + SA.h, SA.rt, SA.rt - SA.t, CLAY);
    let s = loft(I0, I1, n => toneI(n, CLAY_IN), true) + fill(pd(I0), CLAY_IN.m) + rim.far + H.far;
    if (st.saucer > .01){ const z = BH + SA.t + 7*st.saucer, r = SA.rb - SA.t + (SA.rt - SA.rb)*(z - BH - SA.t)/(SA.h - SA.t);
      s += fill(pd(ringP(z, r)), WATERC, 'pointer-events="none" opacity=".6"') + `<path d="${pd(ringP(z + .05, r - 2.5, 36).slice(20, 27), false)}" fill="none" stroke="#ffffff" stroke-width="1" opacity=".7"/>`; }
    s += contents;
    s += loft(A, T, n => tone(n, CLAY)) + rim.near + H.near;
    return s;
  }

  /* ---------- the watering can: pose { o: [u, v, z] base centre, yaw: the spout's way, tilt } ---------- */
  const CAN_REST = { o: [CAN.u, CAN.v, BH], yaw: Math.atan2(-40, 12), tilt: 0 };
  const CAN_POUR = { o: [CAN.u + 6, CAN.v, BH + 90], yaw: Math.atan2(-52, -60), tilt: .87 };
  function canXf(pose){
    const c = Math.cos(pose.yaw), s2 = Math.sin(pose.yaw), ct = Math.cos(pose.tilt), stl = Math.sin(pose.tilt);
    return (a, b, z) => { const a2 = a*ct + (z - 22)*stl, z2 = 22 - a*stl + (z - 22)*ct; return dk(pose.o[0] + a2*c - b*s2, pose.o[1] + a2*s2 + b*c, pose.o[2] + z2); };
  }
  const SPOUT = [[12, 0, 8], [52, 0, 44]];
  function canParts(st, m){
    const X = canXf(st.can), n = fine() ? 28 : 14;
    const rg = (z, r) => Array.from({length: n}, (_, i) => { const t = i/n*2*Math.PI; return X(r*Math.cos(t), r*Math.sin(t), z); });
    const A = rg(0, CAN.rb), B = rg(CAN.h, CAN.rt);
    const up = norm(sub(X(0, 0, 1), X(0, 0, 0)));
    let body = loft(A, B, nn => tone(nn, m));
    if (vis(up)){ const op = rg(CAN.h + .05, CAN.rt - 2.2); body += fill(pd(B), m.l) + fill(pd(op), st.pouring > 0 ? '#5b8fb0' : '#3f5f73') + ink(pd(op), .6); }
    else body += fill(pd(A), tone(kScl(up, -1), m));
    // the brand-free print band and a little drawn sun on the body
    body += hullInk([...A, ...B], 1.6);
    const sdir = norm(sub(X(1, 0, 22), X(0, 0, 22)));
    const s0 = X(...SPOUT[0]), s1 = X(...SPOUT[1]), dsp = norm(sub(s1, s0));
    const spout = rod(s0, s1, 3.6, m, tone, 1, 2.6, 12);
    const roseA = X(...SPOUT[1]), roseB = kAdd(roseA, kScl(dsp, 6));
    let rose = rod(roseA, roseB, 2.6, MAT.steel, toneI, .9, 6.5, 16);
    if (fine() && vis(dsp)){ let holes = ''; const [e1, e2] = axisFrame(dsp); for (const [r, cnt] of [[0, 1], [2.6, 6], [4.6, 10]]) for (let i = 0; i < cnt; i++){ const a = i/cnt*2*Math.PI; holes += circ(kAdd(kAt(roseB, dsp, .05), kAdd(kScl(e1, r*Math.cos(a)), kScl(e2, r*Math.sin(a)))), .45, '#3a3f42', .2); } rose += holes; }
    const hp = [X(-11, 0, 40), X(-22, 0, 42), X(-28, 0, 32), X(-25, 0, 18), X(-15, 0, 12)];
    let handle = '';
    if (fine()) for (let i = 0; i < hp.length - 1; i++) handle += rod(hp[i], hp[i + 1], 2.6, m, tone, .9, 2.6, 10);
    else { const d = pd(hp, false); handle = `<path d="${d}" fill="none" stroke="${INK}" stroke-width="6.6"/><path d="${d}" fill="none" stroke="${m.m}" stroke-width="4.4"/>`; }
    const spNear = dot(sdir, CAM_V) > 0;
    const svg = spNear ? handle + body + spout + rose : spout + rose + body + handle;
    return { svg: act('can', svg), pts: [...A, ...B, roseB, ...hp], rose: roseB, dir: dsp };
  }

  /* ---------- drops, hearts ---------- */
  const dropSvg = p => { const q = P(...p); return `<ellipse cx="${f(q[0])}" cy="${f(q[1])}" rx="${f(.8*CAM_K)}" ry="${f(1.25*CAM_K)}" fill="${WATERC}" stroke="${INK}" stroke-width=".35"/>`; };
  const inPot = p => { const q = undk(p); return Math.hypot(q[0] - PC[0], q[1] - PC[1]) < R_IN && p[2] < PT; };
  function heartSvg(h){ const c = pp(h.x, h.y, h.z), q = P(...c), sz = 3.2*h.s*CAM_K, x = q[0], y = q[1];
    return `<path d="M${f(x)} ${f(y + sz*.9)}C${f(x - sz*1.6)} ${f(y - sz*.1)} ${f(x - sz*.7)} ${f(y - sz*1.3)} ${f(x)} ${f(y - sz*.45)}C${f(x + sz*.7)} ${f(y - sz*1.3)} ${f(x + sz*1.6)} ${f(y - sz*.1)} ${f(x)} ${f(y + sz*.9)}Z" fill="#f2668b" stroke="${INK}" stroke-width=".7" opacity="${f(h.o)}"/>`; }

  /* ---------- scene ---------- */
  function scene(st, m){
    const k = ease(st.xr || 0), xf = plantXf(st);
    const cact = ballSvg(xf, RB, KZ, NRIB, .085, PHMAX, GREEN, PHIS, AREO, st.spike, true);
    const fl = flowerItem(st, xf), pup = pupItem(st), tag = tagItem(st), cp = canParts(st, m);
    // shadows: the pot with its plant (one), the can
    let s = castShadow([...ringP(BH, SA.rt, 16), ...ringP(PT, R_RIM, 16), ...cact.pts.filter((_, i) => i % 6 === 0), ...(fl ? fl.pts : [])], BH)
      + castShadow(cp.pts.map(p => [p[0], p[1], Math.min(p[2], BH + 60)]), BH);
    // in the pot: what stands on the soil, back to front round the cactus
    const parts = [], push = (it, nearSide) => { if (it) parts.push({ it, near: nearSide }); };
    push(fl, fl && fl.near); push(pup, pup && pup.near); push(tag, tag.near);
    const drops = st.drops.filter(d => inPot(d.w));
    let plant = parts.filter(p => !p.near).map(p => p.it.svg).join('') + act('cactus', cact.svg) + parts.filter(p => p.near).map(p => p.it.svg).join('');
    plant += drops.map(d => dropSvg(d.w)).join('');
    const potGroup = saucerSvg(st, potSvg(st, m, k, plant), k);
    const potBox = boxOf([...ringP(BH, SA.rt, 12), ...ringP(PT, R_RIM, 12), ...cact.pts.filter((_, i) => i % 8 === 0), ...(fl ? fl.pts : [])]);
    s += byDepth([{ box: potBox, svg: potGroup }, { box: boxOf(cp.pts, .5), svg: cp.svg }]);
    s += st.drops.filter(d => !inPot(d.w)).map(d => dropSvg(d.w)).join('');
    s += st.hearts.map(heartSvg).join('');
    s += labels(st, k, fl, pup);
    return s;
  }
  function labels(st, k, fl, pup){
    const xf = plantXf(st), xf0 = potXf(st), items = [];
    if (k > .6){
      const rt = ROOTS[1].pts[3];
      items.push({ at: xf0(...rt), text: '根系', on: st.wet > .3 },
        { at: pp(0, -rIn(SOIL - 20) + 4, SOIL - 18), text: '培养土', on: false },
        { at: xf0(...DRAIN_BALLS[3].slice(0, 3)), text: '陶粒排水层', on: false },
        { at: pp(7, 3, PB + 1.5), text: '防漏网', on: false },
        { at: pp(0, -6, PB), text: '排水孔', on: st.saucer > .05 });
      if (st.saucer > .05) items.push({ at: pp(SA.rb - 6, 0, BH + SA.t + 7*st.saucer), text: '托盘积水', on: st.saucer > .8 });
      items.push({ at: xf(0, 0, 30), text: '仙人球', on: false });
    } else {
      items.push({ at: xf(...ballPt(50*Math.PI/180, 1.2)), text: '仙人球', on: st.spike > .1 || st.wob > .1 },
        { at: xf(...kAdd(ballPt(61*Math.PI/180, 0), [0, 0, 2])), text: '刺座', on: st.spike > .1 },
        { at: pp(-R_RIM*.6, R_RIM*.75, BH + 50), text: '花盆', on: st.turning },
        { at: pp(-SA.rt*.7, SA.rt*.7, BH + SA.h), text: '托盘', on: st.saucer > .8 },
        { at: canXf(st.can)(0, 0, CAN.h), text: '浇水壶', on: st.pouring > 0 },
        { at: potXf(st)(TAG_R*Math.cos(TAG_AT), TAG_R*Math.sin(TAG_AT), SOIL + 26), text: '名牌', on: !!st.tagPose },
        { at: pp(-26, 14, SOIL + .4), text: '铺面石', on: false });
      if (fl) items.push({ at: fl.pts[1], text: st.bloom > .5 ? '花' : '花苞', on: st.blooming });
      if (pup) items.push({ at: pup.pts[0], text: '小球', on: st.pup < 1 });
    }
    return zhCallouts(items, []);
  }

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { water: '还在浇呢', turn: '转着呢', loose: '在松土', talk: '在听你说', spike: '刺还竖着' };
  const busy = () => { if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等一下'); return true; };
  const poseLerp = (a, b, e, lift = 0) => ({ o: [0, 1, 2].map(i => a.o[i] + (b.o[i] - a.o[i])*e + (i === 2 ? lift*Math.sin(Math.PI*e) : 0)),
    yaw: a.yaw + (((b.yaw - a.yaw + Math.PI*3) % (Math.PI*2)) - Math.PI)*e, tilt: a.tilt + (b.tilt - a.tilt)*e });
  const moveCan = (st, from, to, ms, lift = 0) => ({ ms, step(k){ st.can = poseLerp(from, to, ease(k), lift); } });
  // pour: drops leave the rose along the spout, fall, soak into the soil (or splash out onto the saucer)
  function pourSeg(st, ms, amount){
    return { ms, start(){ st.pouring = 1; this.n = 0; this.r = kRng(61 + st.pours++); this.w0 = st.wet; this.last = 0; runDrops(st); },
      step(k){ const dt = (k - this.last)*ms/1000; this.last = k;
        st.can = { ...CAN_POUR, tilt: CAN_POUR.tilt + .04*Math.sin(k*30) };
        const X = canParts(st, PALS[st.pal] || PALS.mint), want = Math.floor(k*ms/1000*48);
        while (this.n < want){ this.n++; const r = this.r, jit = [(r() - .5)*2.4, (r() - .5)*2.4, (r() - .5)*2.4];
          st.drops.push({ w: kAdd(X.rose, jit), v: kAdd(kScl(X.dir, 130 + r()*40), [(r() - .5)*30, (r() - .5)*30, 0]) }); }
        st.wet = Math.min(1, this.w0 + amount*k); },
      end(){ st.pouring = 0; } };
  }
  function runDrops(st){
    if (st.dropping) return; st.dropping = true;
    ui.animate(dt => {
      for (const d of st.drops){ d.v[2] -= 2200*dt; d.w = kAdd(d.w, kScl(d.v, dt));
        const q = undk(d.w), hr = Math.hypot(q[0] - PC[0], q[1] - PC[1]);
        if (hr < R_IN - 1 && d.w[2] <= SOIL + .5) d.gone = true;
        else if (d.w[2] <= BH + SA.t + 1) d.gone = true; }
      st.drops = st.drops.filter(d => !d.gone);
      if (!st.drops.length && !st.pouring){ st.dropping = false; return false; }
      return true; });
  }
  // water seeping out of the hole into the saucer, after a while
  const seepSeg = (st, to, ms = 700) => ({ ms, start(){ this.s0 = st.saucer; }, step(k){ st.saucer = this.s0 + (to - this.s0)*ease(k); } });
  function dryLater(st){ ctx.later(40000, () => { st.wet = Math.max(0, st.wet - .55); st.puddle = 0; st.saucer = Math.max(0, st.saucer - .4); }, 'dry'); }

  function water(st){ if (busy()) return;
    if (st.wet > .55) return ui.flash('我还湿着呢！仙人球最怕水多，等土干透了再浇');
    kPlay(ui, 'water', [moveCan(st, CAN_REST, CAN_POUR, 700, 30), pourSeg(st, 1100, .7), { ms: 300, step(){} }, moveCan(st, CAN_POUR, CAN_REST, 700, 20), seepSeg(st, Math.min(1, st.saucer + .2))],
      () => { dryLater(st); ui.flash('咕嘟咕嘟，喝饱了——下次等土干透了再浇'); });
  }
  function overwater(st){ if (busy()) return;
    kPlay(ui, 'water', [moveCan(st, CAN_REST, CAN_POUR, 700, 30), pourSeg(st, 2600, 1), { ms: 260, step(k){ st.puddle = ease(k); } }, moveCan(st, CAN_POUR, CAN_REST, 700, 20), seepSeg(st, 1, 900)],
      () => { dryLater(st); ui.flash('停停停！根要烂啦！托盘里的水都满了', 2600); });
  }
  // turn the pot half round: the side that leaned to the light now faces away and grows back straight
  function turn(st){ if (busy()) return;
    kPlay(ui, 'turn', [{ ms: 1300, start(){ this.t0 = st.turn; this.l0 = st.lean; st.turning = true; }, step(k){ st.turn = this.t0 + Math.PI*ease(k); st.lean = Math.max(3, this.l0 - 3*k); }, end(){ st.turning = false; } }],
      () => ui.flash('换一面晒太阳——总晒一边会长歪的'));
  }
  // loosen the top of the soil with the name tag, then put it back
  function loosen(st){ if (busy()) return;
    const a = TAG_AT, rd = [Math.cos(a), Math.sin(a), 0], rest = () => { const lean = .17, up = norm([rd[0]*Math.sin(lean), rd[1]*Math.sin(lean), Math.cos(lean)]); return { c: kAdd([TAG_R*rd[0], TAG_R*rd[1], SOIL], kScl(up, 14)), len: up, nrm: norm(sub(rd, kScl(up, dot(rd, up)))), wdt: cross(up, norm(sub(rd, kScl(up, dot(rd, up))))) }; };
    const lerpT = (A, B, e, lift = 0) => { const len = norm(kLerp(A.len, B.len, e)), nrm0 = norm(kLerp(A.nrm, B.nrm, e)), nrm = norm(sub(nrm0, kScl(len, dot(nrm0, len)))); return { c: kAdd(kLerp(A.c, B.c, e), [0, 0, lift*Math.sin(Math.PI*e)]), len, nrm, wdt: cross(len, nrm) }; };
    const at = (ang, dz) => { const r = 30, len = norm([-.35*Math.cos(ang), -.35*Math.sin(ang), 1]), nrm = norm(cross([0, 0, 1], len)); return { c: kAdd([r*Math.cos(ang), r*Math.sin(ang), SOIL + 15 + dz], kScl(len, 0)), len, nrm: norm(sub(nrm, kScl(len, dot(nrm, len)))), wdt: cross(len, norm(sub(nrm, kScl(len, dot(nrm, len))))) }; };
    const segs = [{ ms: 360, start(){ st.tagPose = rest(); }, step(k){ st.tagPose = lerpT(rest(), { ...rest(), c: kAdd(rest().c, [0, 0, 22]) }, ease(k)); } }];
    let from = () => ({ ...rest(), c: kAdd(rest().c, [0, 0, 22]) });
    for (const [i, ang] of [[0, .4], [1, 1.6], [2, 3.4], [3, 5]].map(([i, a]) => [i, a])){
      const f0 = from;
      segs.push({ ms: 300, step(k){ st.tagPose = lerpT(f0(), at(ang, 4), ease(k), 6); } },
        { ms: 260, step(k){ st.tagPose = lerpT(at(ang, 4), at(ang, -6), Math.sin(Math.PI*k)); if (k > .5) st.loose = Math.min(1, st.loose + .02); } });
      from = () => at(ang, 4);
    }
    segs.push({ ms: 380, step(k){ st.tagPose = lerpT(from(), rest(), ease(k), 10); }, end(){ st.tagPose = null; st.loose = Math.min(1, st.loose + .3); } });
    kPlay(ui, 'loose', segs, () => ui.flash('松土好舒服，根能喘口气了'));
  }
  // talk to it: hearts drift over, it wobbles, and it grows (a bud, then the flower opens, then a pup)
  function talk(st){ if (busy()) return;
    const r = kRng(71 + st.talks++), stage = st.flower < 1 ? 'bud' : st.bloom < 1 ? 'bloom' : !st.pup ? 'pup' : 'listen';
    const hearts = { ms: 1300, start(){ st.hearts = [0, 1, 2].map(i => ({ x: -26 + i*24 + (r() - .5)*6, y: 58, z: BH + 46 + i*6, s: .8 + .3*r(), o: 0, ph: r()*6, d: i*.18 })); },
      step(k){ for (const h of st.hearts){ const e = clamp((k - h.d)/(1 - h.d), 0, 1); h.y = 58 - 52*ease(e); h.z = BH + 46 + 50*e + 4*Math.sin(e*9 + h.ph); h.x += Math.sin(e*7 + h.ph)*.3; h.o = e < .15 ? e/.15 : e > .85 ? (1 - e)/.15 : 1; } },
      end(){ st.hearts = []; } };
    const wob = { ms: 700, start(){ st.wob = 1; }, step(k){ st.wobT = k; st.wob = 1 - k; }, end(){ st.wob = 0; } };
    const grow = stage === 'bud' ? { ms: 900, start(){ st.flower = 1; st.bloom = 0; this.g = 0; }, step(k){ st.budK = ease(k); } }
      : stage === 'bloom' ? { ms: 1500, start(){ st.blooming = true; }, step(k){ st.bloom = ease(k); }, end(){ st.blooming = false; } }
      : stage === 'pup' ? { ms: 1100, step(k){ st.pup = Math.max(.05, ease(k)); } } : null;
    const line = { bud: '你说的我都听见了……冒了个花苞', bloom: '开花了！好看吧，只开一天哦', pup: '旁边冒出个小球——是我的崽', listen: '嗯嗯，我在听呢，说完记得浇水' }[stage];
    kPlay(ui, 'talk', [hearts, wob, grow], () => ui.flash(line, 2600));
  }
  // the radiation myth: it bristles
  function radiation(st){ if (busy()) return;
    kPlay(ui, 'spike', [{ ms: 1400, start(){ st.wob = .6; }, step(k){ st.spike = Math.sin(Math.PI*k); st.wobT = k*2; st.wob = .6*(1 - k); }, end(){ st.spike = 0; st.wob = 0; } }],
      () => ui.flash('防辐射？我就是个仙人球，只能防你的手', 2800));
  }
  function touch(st){ if (busy()) return;
    kPlay(ui, 'spike', [{ ms: 600, step(k){ st.spike = .7*Math.sin(Math.PI*k); }, end(){ st.spike = 0; } }], () => ui.flash('别摸，扎手！'));
  }

  const __cfg = ({
    fig:'18', turn:'full', title:'小盆栽', palette:'mint',
    state:{ turn: 0, lean: 9, leanDir: -.9, wet: .15, puddle: 0, saucer: 0, loose: 0, can: { ...CAN_REST, o: CAN_REST.o.slice() }, pouring: 0, pours: 0,
      drops: [], dropping: false, tagPose: null, flower: 0, bloom: 0, budK: 0, blooming: false, pup: 0, hearts: [], talks: 0, wob: 0, wobT: 0, spike: 0, turning: false },
    scene,
    buttons:[
      { label:'浇水', onClick: water },
      { label:'转一转晒太阳', onClick: turn },
      { label:'松松土', onClick: loosen },
      { label:'跟它说说话', onClick: talk },
      { label:'浇太多水', onClick: overwater },
      { label:'防辐射？', onClick: radiation },
    ],
    acts:{ can: st => water(st), cactus: st => touch(st), tag: st => loosen(st), pot: st => turn(st) },
  });
  return ctx.adapt(__cfg, { seeThrough: true });
}
