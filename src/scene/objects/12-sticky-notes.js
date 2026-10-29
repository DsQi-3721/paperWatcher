// Fig. 12 便利贴 — desk-scene object, ported from stationery/src/12-sticky-notes.html by scripts/port-figures.mjs.
// The figure's own code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*),
// ctx.ui its ui (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are
// collected by the scene.
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: -490, v: -192, rot: 0 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 12 — Sticky notes (便利贴): a 76 x 76 mm pad, a gel pen and an exercise book at the back of the student's half
     of the shared desk; the "我是猪" note goes on the cover of the deskmate's 语文 textbook lying on their half (drawn by
     the scene: ctx.paper('book')). Desk terms: u along the front edge, v toward the student, z up; 1 unit = 1 mm.

     How it really works:
     1. A pad is ~100 sheets of thin paper (0.1 mm each). On the back of each sheet, along its top edge, is a 15 mm band
        of repositionable adhesive (tiny elastic microspheres: only their tips touch, so it grips lightly and lets go
        clean). Each band sticks to the face of the sheet under it: the pad is held together by those bands alone.
     2. Writing: a gel pen on the top sheet, which lies flat on the pad.
     3. Peeling: lift the free bottom edge and pull it off sideways; the sheet curls up from the glued edge, the band
        lets go, and the sheet sticks wherever it is pressed down (paper, a book cover, cloth: lightly).
     4. Student life: a stick figure drawn in the corner of every sheet, a bit different each time, becomes a flipbook
        when the free edges are bent up under the thumb and let slip one by one (each falling sheet shows its drawing,
        fast enough to look like motion). And "我是猪" stuck on the deskmate's textbook: the light adhesive grips the
        glossy cover just enough, and it stays there all afternoon before anyone notices.

     Parts:
     PAD     sheets (stacked edges) . adhesive band on the back of each sheet's top edge . corner stick figure (frame per
             sheet) . the top sheet (memo) . a peeled sheet (front, back, band)
     PEN     tip . front cone . rubber grip . barrel . end plug . clip
     DESK    exercise book (kraft cover, title, name lines, page block) . notes stuck on it
     BOOK    (the scene's: the deskmate's 语文 textbook) . the note stuck on its cover */

  /* ---------- layout (this object's frame: desk terms from PLACE) ---------- */
  const BH = ctx.deskZ;
  const SN = 76, BAND = 15, SNT = .12, N0 = 60;                          // sheet size, adhesive band, sheet thickness
  const PAD = [-102, -30];                                              // the pad's far-left corner (u, v)
  const padTop = n => BH + Math.max(1, n)*SNT;
  const NB = [4, -34, 100, 70], NBH = 3.2;                              // exercise book
  // the deskmate's 语文 textbook on their half (the scene's): its cover's own frame, pu across, pv down, .z = the cover.
  // The note goes on it a little crooked, under the title box (the title still shows), reading the same way as the book.
  const TB = ctx.paper('book');
  const ON_BOOK = { pu: 92, pv: 98, r: -7 };
  const MEMOS = ['背单词', '交作业', '带饭卡', '改错题'];
  const PIG = '我是猪';
  const INKC = '#28306b';
  const BOOK_SLOTS = [ { c: [34, -4], r: -4 }, { c: [64, 14], r: 6 }, { c: [40, 36], r: -2 }, { c: [68, 42], r: 8 } ];

  /* ---------- a sheet that can lie flat, curl and fly: frame F = { O top-left corner, X across, Y down the sheet, N front } ---------- */
  function snPt(F, a, b, k){
    let y = b, z = 0;
    if (k > 1e-5 && b > BAND){ const th = k*(b - BAND); y = BAND + Math.sin(th)/k; z = (1 - Math.cos(th))/k; }
    return [0, 1, 2].map(i => F.O[i] + F.X[i]*a + F.Y[i]*y + F.N[i]*z);
  }
  const snTan = (F, b, k) => k > 1e-5 && b > BAND ? norm(kAdd(kScl(F.Y, Math.cos(k*(b - BAND))), kScl(F.N, Math.sin(k*(b - BAND))))) : F.Y;
  const snFrameAt = (c, rotDeg, z) => { const r = rotDeg*Math.PI/180, X = norm(dkv(Math.cos(r), Math.sin(r))), Y = norm(dkv(-Math.sin(r), Math.cos(r)));
    return { O: kAdd(kAdd(dk(c[0], c[1], z), kScl(X, -SN/2)), kScl(Y, -SN/2)), X, Y, N: [0, 0, 1] }; };
  const padFrame = n => ({ O: dk(PAD[0], PAD[1], padTop(n) + .02), X: DU, Y: DV, N: [0, 0, 1] });
  const bookFrame = i => { const sl = BOOK_SLOTS[i % 4]; return snFrameAt(sl.c, sl.r, BH + NBH + .06 + .05*i); };
  const coverFrame = () => { const r = ON_BOOK.r*Math.PI/180;
    const X = norm(kAdd(kScl(TB.DU, Math.cos(r)), kScl(TB.DV, Math.sin(r)))), Y = norm(kAdd(kScl(TB.DU, -Math.sin(r)), kScl(TB.DV, Math.cos(r))));
    return { O: TB.dk(ON_BOOK.pu, ON_BOOK.pv, TB.z + .06), X, Y, N: [0, 0, 1] }; };
  function snLerpFrame(A, B, e, arc){
    const X = norm(kLerp(A.X, B.X, e)), y0 = kLerp(A.Y, B.Y, e), Y = norm(kAdd(y0, kScl(X, -dot(X, y0))));
    return { O: kAdd(kLerp(A.O, B.O, e), [0, 0, arc*Math.sin(Math.PI*e)]), X, Y, N: cross(X, Y) };
  }
  const sheetMat = m => { const l = mix(m.l, '#ffffff', .5); return { l, m: mix(l, m.m, .3), d: mix(l, m.d, .42) }; };
  // text written on a sheet (a gel-pen hand: a Kaiti face), on the tangent plane where it sits
  function snTx(F, k, a, b, str, size, col = INKC, weight = 700){
    const p = snPt(F, a, b, k), tb = snTan(F, b, k), n = cross(F.X, tb);
    if (!vis(n) || !str) return '';
    return `<text transform="${txM(P(...p), Dv(...F.X), Dv(...tb))}" font-size="${f(size)}" fill="${col}" font-family="'Kaiti SC','STKaiti','KaiTi','Songti SC',serif" font-weight="${weight}">${str}</text>`;
  }
  // the stick figure in a sheet's bottom-right corner: frame i of a jumping jack, local (a, b) in a 20 mm box
  function snFigure(i){
    const ph = ((i % 8) + 8) % 8/8*2*Math.PI, h = Math.max(0, Math.sin(ph))*5, arm = Math.sin(ph), sp = Math.max(0, Math.sin(ph))*3;
    const hb = 5 - h, neck = 7.4 - h, hip = 13 - h, foot = 19 - h;
    const head = Array.from({length: 11}, (_, j) => { const t = j/10*2*Math.PI; return [10 + 2.2*Math.cos(t), hb + 2.2*Math.sin(t)]; });
    return [head, [[10, neck], [10, hip]], [[9 - sp, foot], [10, hip], [11 + sp, foot]],
      [[5, neck + 2 - 4*arm], [10, neck + 1.4], [15, neck + 2 - 4*arm]], [[2, 19.8], [18, 19.8]]];
  }
  const FIG_A0 = 53, FIG_B0 = 52;
  function snFigureSvg(F, k, i){
    const lines = snFigure(i).map(l => l.map(([a, b]) => snPt(F, FIG_A0 + a, FIG_B0 + b, k)));
    const nrm = cross(F.X, snTan(F, FIG_B0 + 10, k)); if (!vis(nrm)) return '';
    return `<path d="${lines.map(l => pd(l, false)).join('')}" fill="none" stroke="${INKC}" style="stroke-width:.55" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  // One sheet as a little mesh (so it can curl): front in the pad colour, back a shade greyer with the adhesive band
  // along its top edge; the memo and the corner figure on the front.
  function snSheet(F, k, m, memo, fig, w = 1){
    const M = sheetMat(m), bl = mix(M.l, '#e6e0cf', .45), BK = { l: bl, m: mix(bl, '#000000', .07), d: mix(bl, '#000000', .16) }, band = mix(bl, '#c9b46a', .38);
    const bs = [0, BAND/2, BAND]; for (let j = 1; j <= 10; j++) bs.push(BAND + (SN - BAND)*j/10);
    const as = [0, SN/4, SN/2, SN*3/4, SN], quads = [];
    for (let j = 0; j < bs.length - 1; j++){ const bm = (bs[j] + bs[j+1])/2, n = cross(F.X, snTan(F, bm, k));
      for (let i = 0; i < 4; i++){ const q = [snPt(F, as[i], bs[j], k), snPt(F, as[i+1], bs[j], k), snPt(F, as[i+1], bs[j+1], k), snPt(F, as[i], bs[j+1], k)];
        const fr = vis(n), col = fr ? toneI(n, M) : bm < BAND ? band : toneI(kScl(n, -1), BK);
        quads.push({ at: avg(q), ab: [as[i], as[i+1], bs[j], bs[j+1]], svg: face(pd(q), col) + (!fr && bm < BAND && i === 1 ? `<path d="${pd([snPt(F, 4, 4, k), snPt(F, SN - 4, 4, k)], false)}" stroke="#ffffff" stroke-width="1.2" opacity=".5"/>` : '') }); } }
    // the writing lies on the sheet: drawn over every patch except those rising in front of it (a curl coming up
    // toward the viewer), which are drawn after it
    const marks = [];
    if (memo) marks.push({ a: memo.a + memo.size, b: memo.base - memo.size*.4, fp: [memo.a, memo.a + memo.text.length*memo.size*1.05, memo.base - memo.size, memo.base + 2], svg: snTx(F, k, memo.a, memo.base, memo.text.slice(0, Math.floor(memo.shown + 1e-6)), memo.size) });
    if (fig != null) marks.push({ a: FIG_A0 + 10, b: FIG_B0 + 10, fp: [FIG_A0, FIG_A0 + 20, FIG_B0 - 2, FIG_B0 + 21], svg: snFigureSvg(F, k, fig) });
    // a patch under the writing itself can never be in front of it
    const under = (q, fp) => q.ab[0] < fp[1] && q.ab[1] > fp[0] && q.ab[2] < fp[3] && q.ab[3] > fp[2];
    const ahead = q => marks.some(mk => { if (under(q, mk.fp)) return false;
      const p = snPt(F, mk.a, mk.b, k), n = cross(F.X, snTan(F, mk.b, k)), sg = dot(n, CAM_V) >= 0 ? 1 : -1;
      return sg*dot(sub(q.at, p), n) > 3 && dot(sub(q.at, p), CAM_V) > 0; });
    const fr = quads.filter(q => ahead(q)), bk = quads.filter(q => !ahead(q));
    let s = byDepth(bk) + marks.map(mk => mk.svg).join('') + byDepth(fr);
    const edge = [...as.map(a => snPt(F, a, 0, k)), ...bs.slice(1).map(b => snPt(F, SN, b, k)), ...as.slice().reverse().slice(1).map(a => snPt(F, a, SN, k)), ...bs.slice().reverse().slice(1).map(b => snPt(F, 0, b, k))];
    return s + ink(pd(edge), w);
  }
  const memoOf = text => text === PIG ? { text, size: 19, a: 9, base: 50, shown: 0 } : { text, size: 14, a: 8, base: 42, shown: 0 };

  /* ---------- the pad ---------- */
  function padSvg(st, m, k){
    const n = st.n, M = sheetMat(m), z1 = padTop(n);
    if (n <= 0) return '';
    const [u0, v0] = PAD;
    let s = deskBox(u0, v0, BH, u0 + SN, v0 + SN, z1, M, toneI, 1.1);
    // the sheets' edges on the sides that face the viewer
    let d = '';
    for (const [n3, a, b] of [[kScl(DU, -1), [u0, v0], [u0, v0 + SN]], [DU, [u0 + SN, v0], [u0 + SN, v0 + SN]], [kScl(DV, -1), [u0, v0], [u0 + SN, v0]], [DV, [u0, v0 + SN], [u0 + SN, v0 + SN]]])
      if (vis(n3)) for (let j = 2; j < n; j += 3){ const z = BH + j*SNT; d += pd([dk(a[0], a[1], z), dk(b[0], b[1], z)], false); }
    if (d) s += `<path d="${d}" fill="none" stroke="${M.d}" stroke-width=".35" opacity=".8"/>`;
    // the top sheet: memo and corner figure (while flipping: the latest sheet to fall)
    const F = padFrame(n), top = st.flip ? st.flip.shown : n - 1;
    if (!st.flip && st.memo) s += snTx(F, 0, st.memo.a, st.memo.base, st.memo.text.slice(0, Math.floor(st.memo.shown + 1e-6)), st.memo.size);
    s += snFigureSvg(F, 0, top);
    s += hullInk(deskBoxPts(u0, v0, BH, u0 + SN, v0 + SN, z1), 1.4);
    if (k > 0){   // see-through: the adhesive bands, one under every sheet, stacked along the glued top edge
      const zb = j => BH + j*SNT; let bl = '';
      for (let j = 1; j < n; j += 2) for (const [n3, a, b] of [[kScl(DU, -1), [u0, v0], [u0, v0 + BAND]], [DU, [u0 + SN, v0], [u0 + SN, v0 + BAND]]])
        if (vis(n3)) bl += pd([dk(a[0], a[1], zb(j)), dk(b[0], b[1], zb(j))], false);
      s = `<g opacity="${f(1 - .65*k)}">${s}</g><g opacity="${f(k)}">${`<g opacity=".7">${deskBox(u0, v0, BH, u0 + SN, v0 + BAND, z1, { l:'#f6dc7a', m:'#e2c35a', d:'#b8983a' }, toneI, .9)}</g>`
        + `<path d="${bl}" fill="none" stroke="#8a6d1c" stroke-width=".45"/>` + ink(pd([dk(u0, v0 + BAND, z1 + .02), dk(u0 + SN, v0 + BAND, z1 + .02)], false), .9)}</g>`;
    }
    return act('pad', s);
  }
  const padPts = n => deskBoxPts(PAD[0], PAD[1], BH, PAD[0] + SN, PAD[1] + SN, padTop(n));

  /* ---------- the exercise book ---------- */
  const KRAFT = { l:'#e6cfa4', m:'#cfb388', d:'#a58a62' };
  function bookSvg(st, m){
    const [u0, v0, u1, v1] = NB, zt = BH + NBH;
    let s = deskBox(u0, v0, BH, u1, v1, zt, KRAFT, toneI, 1.1);
    // page block: the pages show as a pale band on the three open sides
    let d = '';
    for (const [n3, a, b] of [[DU, [u1, v0], [u1, v1]], [DV, [u0, v1], [u1, v1]], [kScl(DV, -1), [u0, v0], [u1, v0]]])
      if (vis(n3)) for (const z of [BH + .9, BH + 1.6, BH + 2.3]) d += pd([dk(a[0], a[1], z), dk(b[0], b[1], z)], false);
    if (d) s += `<path d="${d}" fill="none" stroke="#fffdf4" stroke-width=".7"/>`;
    s += shape(rectUV(u0 + 8, v0 + 8, u1 - 8, v0 + 26).map(([u, v]) => dk(u, v, zt + .02)), '#fff7e6', .6)
      + deskText((u0 + u1)/2, v0 + 21, zt + .03, '英语笔记', 8.4, INK, 800, 'middle');
    for (const [lab, v] of [['班级', v1 - 22], ['姓名', v1 - 10]]) s += deskText(u0 + 12, v, zt + .03, lab, 4.8, INK, 700)
      + `<path d="${pd([dk(u0 + 26, v + .6, zt + .03), dk(u1 - 12, v + .6, zt + .03)], false)}" fill="none" stroke="${INK}" stroke-width=".6"/>`;
    s += hullInk(deskBoxPts(u0, v0, BH, u1, v1, zt), 1.5);
    // notes stuck on the cover, in the order they were stuck
    st.book.forEach((nt, i) => { s += snSheet(bookFrame(i), 0, m, nt.memo, nt.fig, .9); });
    return `<g data-english-notebook="true" role="button" tabindex="0" aria-label="英语笔记">${s}</g>`;
  }

  /* ---------- the gel pen ---------- */
  const PEN_REST = { o: dk(-96, 84, BH + 4.4), d: DU };
  const PEN_WD = norm(dkv(.62, .5, .6));
  const penTipAt = p => ({ o: kAt(p, PEN_WD, 0), d: PEN_WD });
  function penSvg(st){
    const { o, d } = st.pen, [e1, e2] = axisFrame(d), items = [];
    const seg = (name, g) => items.push({ name, s0: g.s0, s1: g.s1, svg: coaxSeg(o, d, g) });
    seg('tip', { s0: 0, s1: 3.5, r0: .35, r1: 1.5, M: MAT.steel, n: 12, w: .8, shade: toneI });
    seg('cone', { s0: 3.5, s1: 10, r0: 1.5, r1: 3.6, M: MAT.clear, n: 22, w: 1 });
    seg('grip', { s0: 10, s1: 36, r0: 4.0, M: MAT.rubber, n: 24, w: 1.3 });
    seg('barrel', { s0: 36, s1: 126, r0: 4.3, M: MAT.plastic, n: 24, w: 1.4 });
    seg('plug', { s0: 126, s1: 131, r0: 4.0, r1: 3.1, M: MAT.rubber, n: 24, w: 1.1 });
    let s = coaxOrder(d, items);
    const clip = obox(kAdd(kAt(o, d, 112), kScl(e2, 5.1)), d, e1, e2, 13, 1.4, .45, MAT.rubber, tone, .9)
      + obox(kAdd(kAt(o, d, 124.5), kScl(e2, 4.6)), d, e1, e2, 1.6, 1.4, .7, MAT.rubber, tone, .8);
    // the brand-free print on the barrel
    const n0 = norm(kAdd(kScl(e1, .5), kScl(e2, .87)));
    const txt = vis(n0) ? txOn(kAdd(kAt(o, d, 80), kScl(n0, 4.32)), d, n0, '0.5 GEL', 2.6, '#3a3a3a', 800) : '';
    s = vis(e2) ? s + txt + clip : clip + s + txt;
    return act('pen', s);
  }
  const penPts = st => { const { o, d } = st.pen, pts = []; for (const [s0, r] of [[0, .4], [10, 3.6], [36, 4.3], [126, 4.3], [131, 3.1]]) pts.push(...axisRing(kAt(o, d, s0), d, r, 8)); return pts; };

  /* ---------- scene ---------- */
  const boxOf = (pts, r = 0) => [[0,1,2].map(i => Math.min(...pts.map(p => p[i])) - r), [0,1,2].map(i => Math.max(...pts.map(p => p[i])) + r)];
  function scene(st, m){
    const k = ease(st.xr || 0);
    // the note stuck on the deskmate's book lies flat on its cover: drawn with the flat marks, before the shadows
    let s = st.pig ? act('cover', snSheet(coverFrame(), 0, m, { text: PIG, size: 19, a: 9, base: 50, shown: 3 }, null, 1)) : '';
    s += castShadow(padPts(st.n), BH) + castShadow(deskBoxPts(...NB.slice(0, 2), BH, ...NB.slice(2), BH + NBH), BH) + castShadow(penPts(st), BH);
    s += byDepth([
      { box: boxOf(deskBoxPts(NB[0], NB[1], BH, NB[2], NB[3], BH + NBH + 1)), svg: bookSvg(st, m) },
      { box: boxOf(padPts(st.n)), svg: padSvg(st, m, k) },
      { box: boxOf(penPts(st)), svg: penSvg(st) } ]);
    // the sheet on its way (peeled, flying) and the flipbook's bundle of bent-up sheets
    if (st.mv) s += snSheet(st.mv.F, st.mv.k, m, st.mv.memo, st.mv.fig, 1);
    if (st.flip){ const fl = st.flip, F = padFrame(st.n);
      if (fl.falling != null) s += snSheet({ ...F, O: kAdd(F.O, [0, 0, .06]) }, fl.kf, m, null, fl.falling, .8);
      if (fl.held > 0){ s += snSheet({ ...F, O: kAdd(F.O, [0, 0, .12]) }, fl.kb*.92, m, null, st.n - 2, .8);
        s += snSheet({ ...F, O: kAdd(F.O, [0, 0, .2]) }, fl.kb, m, st.memo, st.n - 1, 1); } }
    s += labels(st, k);
    return s;
  }
  function labels(st, k){
    const [u0, v0] = PAD, zt = padTop(st.n), mv = st.mv;
    const items = [
      { at: dk(u0 + 2, v0 + SN*.7, BH + 3), text: '便利贴本', on: !!mv || !!st.flip },
      { at: mv ? snPt(mv.F, SN/2, 6, mv.k) : dk(u0 + SN*.5, v0 + 4, zt), text: '背胶条', on: !!mv },
      { at: dk(u0 + FIG_A0 + 10, v0 + FIG_B0 + 10, zt), text: '翻页小人', on: !!st.flip },
      { at: kAt(st.pen.o, st.pen.d, 60), text: '中性笔', on: st.pen !== PEN_REST },
      { at: dk(NB[2] - 6, NB[3] - 6, BH + NBH), text: '英语笔记', on: false },
      // the deskmate's book is across the desk: named only once the note goes there
      ...(st.pig || mv?.to === 'cover' ? [{ at: TB.dk(TB.w*.22, TB.h*.6, TB.z), text: '同桌的语文书', on: true }] : []) ];
    return zhCallouts(items, []);
  }

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { write: '正在写', peel: '正在撕', pig: '正在搞事', flip: '小人还在跳' };
  const busy = () => { if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等一下'); return true; };
  const lerpPose = (a, b, e, h) => ({ o: kAdd(kLerp(a.o, b.o, e), [0, 0, h*Math.sin(Math.PI*e)]), d: norm(kLerp(a.d, b.d, e)) });
  // the pen writes text on the top sheet: it goes over each character (a quick zigzag in its box) while it appears
  function writeSegs(st, text){
    const segs = [], memo = memoOf(text), path = [];
    [...text].forEach((ch, i) => { const w = memo.size*1.02, a0 = memo.a + i*w, b1 = memo.base, b0 = b1 - memo.size*.85;
      for (const [x, y] of [[.15, .1], [.8, .2], [.2, .45], [.85, .55], [.3, .85], [.9, .95]]) path.push([a0 + x*w*.85, b0 + y*(b1 - b0), i]); });
    segs.push({ ms: 420, start(){ this.from = st.pen; st.memo = memo; }, step(e){ const F = padFrame(st.n); st.pen = lerpPose(this.from, penTipAt(snPt(F, path[0][0], path[0][1], 0)), ease(e), 16); } });
    segs.push({ ms: 380*text.length, step(e){ const F = padFrame(st.n), x = e*(path.length - 1), i = Math.floor(x), t = x - i, p0 = path[i], p1 = path[Math.min(path.length - 1, i + 1)];
        st.pen = penTipAt(kAdd(snPt(F, p0[0] + (p1[0] - p0[0])*t, p0[1] + (p1[1] - p0[1])*t, 0), [0, 0, .3*Math.sin(Math.PI*t)]));
        memo.shown = Math.min(text.length, x/6 + .2); },
      end(){ memo.shown = text.length; } });
    segs.push({ ms: 420, start(){ this.from = st.pen; }, step(e){ st.pen = lerpPose(this.from, PEN_REST, ease(e), 16); }, end(){ st.pen = PEN_REST; } });
    return segs;
  }
  // peel the top sheet sideways off the pad (it curls up from its glued edge) and stick it on a target
  function peelSegs(st, target){
    return [
      { ms: 380, start(){ const n = st.n; st.n = n - 1; st.mv = { F: padFrame(n), F0: padFrame(n), k: 0, memo: st.memo, fig: n - 1, to: target }; st.memo = null; },
        step(e){ st.mv.k = ease(e)/30; st.mv.F = { ...st.mv.F0, O: kAdd(st.mv.F0.O, kScl(DU, -3*e)) }; } },
      // across the 三八线 to the deskmate's book is a long throw: slower, and higher over the things on the desk
      { ms: target === 'cover' ? 1150 : 760, start(){ this.F1 = target === 'cover' ? coverFrame() : bookFrame(st.book.length); this.F0 = st.mv.F; },
        step(e){ const g = ease(e); st.mv.F = snLerpFrame(this.F0, this.F1, g, target === 'cover' ? 130 : 30); st.mv.k = (1 - g)/30; } },
      { ms: 160, step(){}, end(){ const mv = st.mv; st.mv = null;
        if (target === 'cover') st.pig = true; else st.book.push({ memo: mv.memo, fig: mv.fig }); st.stuck++; } } ];
  }
  function nextMemo(st){ const t = MEMOS[st.memoI % MEMOS.length]; st.memoI++; return t; }
  function write(st){ if (busy()) return;
    if (st.n <= 0) return ui.flash('这本用完了');
    if (st.memo) return ui.flash('这张已经写了——先撕下来贴上');
    kPlay(ui, 'write', writeSegs(st, nextMemo(st)));
  }
  function peel(st){ if (busy()) return;
    if (st.n <= 0) return ui.flash('这本用完了');
    const segs = [];
    if (!st.memo){ ui.flash('先写上要记的事'); segs.push(...writeSegs(st, nextMemo(st))); }
    segs.push(...peelSegs(st, 'book'));
    kPlay(ui, 'peel', segs, () => { if (st.book.length > 4) ui.flash('作业本上贴满了'); });
  }
  function pig(st){ if (busy()) return;
    if (st.pig) return ui.flash('同桌的语文书上已经贴着一张了');
    if (st.n <= 1) return ui.flash('纸不够了');
    const segs = [];
    if (st.memo){ ui.flash('这张写了别的——先贴到作业本上'); segs.push(...peelSegs(st, 'book')); }
    segs.push(...writeSegs(st, PIG), ...peelSegs(st, 'cover'));
    kPlay(ui, 'pig', segs, () => ui.flash('轻轻一按就粘住了——同桌一下午都没发现', 2600));
  }
  // flipbook: bend the top sheets' free edges up under the thumb, let them slip one by one
  function flip(st){ if (busy()) return;
    if (st.n < 10) return ui.flash('剩下的纸太少，翻不出动画');
    const F = Math.min(24, st.n - 2), FALL = 75;
    const segs = [{ ms: 320, start(){ st.flip = { held: F, kb: 0, falling: null, kf: 0, shown: st.n - F - 1 }; }, step(e){ st.flip.kb = ease(e)/30; } }];
    for (let c = 0; c < F; c++) segs.push({ ms: FALL, start(){ st.flip.falling = st.n - F + c; st.flip.held = F - c - 1; },
      step(e){ st.flip.kf = (1 - e*e)/30; }, end(){ st.flip.shown = st.n - F + c; st.flip.falling = null; } });
    segs.push({ ms: 60, step(){}, end(){ st.flip = null; } });
    kPlay(ui, 'flip', segs, () => ui.flash('火柴人跳起来了——这节课又没听', 2200));
  }

  const __cfg = ({
    fig:'12', turn:'full', title:'便利贴', palette:'mustard',
    state:{ n: N0, memo: null, memoI: 0, book: [], stuck: 0, pig: false, mv: null, flip: null, pen: PEN_REST },
    scene,
    stats: st => [ { label:'剩余', value: `${st.n} 张` }, { label:'贴出', value: String(st.stuck), small: true } ],
    buttons:[
      { label:'写一张', onClick: write },
      { label:'撕下贴上', onClick: peel },
      { label:'翻页动画', onClick: flip },
      { label:'贴“我是猪”', onClick: pig },
    ],
    acts:{ pad: st => peel(st), pen: st => write(st), cover: st => pig(st) },
    params:(st, q) => {
      if (q.has('n')) st.n = Math.max(0, Math.min(N0, +q.get('n')));
      if (q.has('memo')){ const i = +q.get('memo'); st.memo = memoOf(i < 0 ? PIG : MEMOS[i % 4]); st.memo.shown = st.memo.text.length; }
      if (q.has('book')) for (let i = 0; i < +q.get('book'); i++){ const mm = memoOf(MEMOS[i % 4]); mm.shown = 3; st.book.push({ memo: mm, fig: st.n + i }); st.stuck++; }
      if (q.get('pig') === '1'){ st.pig = true; st.stuck++; }
      if (q.has('peel')){ const e = +q.get('peel'), F0 = padFrame(st.n), F1 = q.get('to') === 'cover' ? coverFrame() : bookFrame(st.book.length);
        const mm = memoOf(q.get('to') === 'cover' ? PIG : MEMOS[0]); mm.shown = 3;
        st.mv = e < .35 ? { F: F0, k: (e/.35)/30, memo: mm, fig: st.n - 1 } : { F: snLerpFrame(F0, F1, (e - .35)/.65, 30), k: (1 - (e - .35)/.65)/30, memo: mm, fig: st.n - 1 }; st.n--; }
      if (q.has('flip')){ const c = +q.get('flip'); st.flip = { held: Math.max(0, 23 - c), kb: 1/30, falling: st.n - 24 + c, kf: .5/30, shown: st.n - 25 + c }; }
      if (q.get('pen') === 'write'){ st.memo = memoOf(MEMOS[0]); st.memo.shown = 1; st.pen = penTipAt(snPt(padFrame(st.n), 22, 38, 0)); }
    },
  });

  return ctx.adapt(__cfg, { seeThrough: true });
}
