// Fig. 15 台历 — desk-scene object (written for the desk: no standalone page).
// Its code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*), ctx.ui its ui
// (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are collected by the scene.
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: 470, v: -430, rot: 0 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 15 — Desk calendar (台历): an A-frame flip calendar at the back of the deskmate's half, facing the student, with
     a red marker lying in the groove of its base. It shows the real date: this year's months from January to next
     January, today's square on the month we are in. Desk terms: u across (to the student's right), v toward the
     student, z up; 1 unit = 1 mm.

     How it really works:
     1. The stand is one strip of 2 mm grey board covered in printed paper, scored and folded into a triangle: a front
        face leaning back about 69 degrees, a steeper back face, and a flat base that runs on past the front foot into a
        shallow pen groove with a low lip. The faces meet at the top; the ends of the triangle are open (from the side
        you see into the hollow).
     2. Thirteen month pages (160 g paper, this January to next January) are punched along their top edge and bound to
        the top of the stand by a double-loop wire through the same holes in the board, so each page hinges on the wire.
     3. Turning a page: lift its bottom edge toward you, up over the top, and let it hang down the back. It bends as it
        goes (the free end leads), and the months gone by pile up on the back, printed side to the board, their blank
        backs (memo lines) outward. Turning back is the same the other way.
     4. A page: the month and the year with a small picture of the season at the top, a 7-column grid of the days
        (Sunday first), weekends and public holidays in red with the holiday's name.
     5. The red marker in the groove is for marking it.
     Student life: a red cross through every day that is over (又熬过一天), the exam day circled in red, the next few
     pages lifted to peek at the month the holidays start, and the 高考 countdown written across the top.

     Parts:
     STAND    front face . back face . base . pen groove and its lip . printed covering (the year on the back)
     BINDING  double-loop wire through the punched holes (one coil along the top)
     PAGES    13 month pages: the front stack, the back stack, a page being turned, pages lifted to peek . month, year,
              season picture, weekday row, date grid, holiday names, memo lines on the backs
     MARKS    red crosses on the days gone by . today's square . exam circles and their names . the countdown
     MARKER   chisel tip . nose . barrel . posted cap with its clip . end plug */

  /* ---------- the stand (this object's frame) ---------- */
  const BH = ctx.deskZ, Z_UP = [0, 0, 1];
  const W2 = 80, H = 118, VR = -10, VF = 36, VB = -40, TB = 1.8;     // half width; ridge height and v; feet v; board
  const BASE = { v0: VB - 1.5, v1: 50, h: 1.5 }, LIP = { v0: 48.6, v1: 50, h: 5 };
  const PW = 152, PL = 120, TP = .26, NPG = 13;                       // page width, length down the face, thickness; pages
  const sl2 = (v, z) => { const l = Math.hypot(v, z); return [v/l, z/l]; };
  const [fdv, fdz] = sl2(VF - VR, -H), [bdv, bdz] = sl2(VB - VR, -H);
  const D_F = dkv(0, fdv, fdz), N_F = dkv(0, -fdz, fdv);              // down the front face, its outward normal
  const D_B = dkv(0, bdv, bdz), N_B = dkv(0, bdz, -bdv);              // down the back face, its outward normal
  const LF = Math.hypot(VF - VR, H), LB = Math.hypot(VB - VR, H);
  // a page's angle round the top (0 = hanging straight down, growing toward the student, up and over to the back)
  const TH_F = Math.atan2(fdv, -fdz), TH_B = Math.atan2(bdv, -bdz) + 2*Math.PI, TH_UP = 2.84;
  const RIDGE = (u, lift = 0) => dk(u, VR, BH + H + lift);
  const COIL = { r: 4.2, z: BH + H + 1.4, u0: -W2 + 4, u1: W2 - 4, turns: 25 };
  const GREY = { l: '#ddd6c6', m: '#c4bba8', d: '#9a907c' };
  const MONO = "ui-monospace,Menlo,'PingFang SC',monospace", KAI = "'Kaiti SC','STKaiti','KaiTi','Songti SC',serif";
  const RED = '#d8453a', MARK = '#cf3a30', GRIDC = '#bdb4a3';

  /* ---------- the real date, the pages' months, holidays, exams ---------- */
  const NOW0 = new Date(), Y0 = NOW0.getFullYear();
  const pageYM = i => ({ y: Y0 + Math.floor(i/12), mo: i % 12 });
  const pageOf = (y, mo) => (y - Y0)*12 + mo;
  const daysIn = (y, mo) => new Date(y, mo + 1, 0).getDate();
  const todayOf = () => { const d = new Date(); return { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate(), t: new Date(d.getFullYear(), d.getMonth(), d.getDate()) }; };
  const dayDiff = (a, b) => Math.round((b - a)/864e5);
  const SPRING = { 2024: [2, 10], 2025: [1, 29], 2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3], 2031: [1, 23], 2032: [2, 11] };
  function holidayName(y, mo, d){
    if (mo === 0 && d === 1) return '元旦';
    if (mo === 4 && d <= 5) return d === 1 ? '劳动节' : '休';
    if (mo === 9 && d <= 7) return d === 1 ? '国庆节' : '休';
    const sp = SPRING[y];
    if (sp){ const k = dayDiff(new Date(y, sp[0] - 1, sp[1]), new Date(y, mo, d)); if (k >= -1 && k <= 6) return k === 0 ? '春节' : k === -1 ? '除夕' : '休'; }
    return null;
  }
  const nthWeekday = (y, mo, wd, n) => 1 + ((wd - new Date(y, mo, 1).getDay() + 7) % 7) + 7*(n - 1);
  const lastWeekday = (y, mo, wd) => { const last = daysIn(y, mo); return last - ((new Date(y, mo, last).getDay() - wd + 7) % 7); };
  // a school year's exams (the days most schools use: mid-terms on a Thursday, finals on a Wednesday)
  const EXAMS = [
    { y: Y0, mo: 0, d: nthWeekday(Y0, 0, 3, 3), name: '期末' }, { y: Y0, mo: 3, d: nthWeekday(Y0, 3, 4, 3), name: '期中' },
    { y: Y0, mo: 5, d: lastWeekday(Y0, 5, 3), name: '期末' }, { y: Y0, mo: 10, d: nthWeekday(Y0, 10, 4, 2), name: '期中' },
    { y: Y0 + 1, mo: 0, d: nthWeekday(Y0 + 1, 0, 3, 3), name: '期末' } ];
  // the holidays a student counts down to: the first day off of each
  const winterBreak = y => { const d = new Date(y, 0, nthWeekday(y, 0, 3, 3)); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return d; };
  const BREAKS = [
    { t: winterBreak(Y0), name: '寒假', len: 28 }, { t: new Date(Y0, 4, 1), name: '劳动节', len: 5 },
    { t: new Date(Y0, 6, nthWeekday(Y0, 6, 6, 2)), name: '暑假', len: 50 }, { t: new Date(Y0, 9, 1), name: '国庆', len: 7 },
    { t: new Date(Y0 + 1, 0, 1), name: '元旦', len: 1 }, { t: winterBreak(Y0 + 1), name: '寒假', len: 28 } ];
  const T0 = todayOf(), TODAY_PAGE = Math.max(0, Math.min(NPG - 1, pageOf(T0.y, T0.mo)));

  /* ---------- a page hung from the top: its line down the page bends by `bend` (rad over its length) ---------- */
  const dirVZ = th => [Math.sin(th), -Math.cos(th)], nrmVZ = th => [Math.cos(th), Math.sin(th)];
  function pageShape(th0, bend = 0, off = 0){
    const NS = Math.abs(bend) < 1e-6 ? 1 : 14, cs = [[0, 0]], ths = [];
    for (let i = 0; i <= NS; i++) ths.push(th0 + bend*i/NS);
    for (let i = 0; i < NS; i++){ const [dv, dz] = dirVZ((ths[i] + ths[i + 1])/2), h = PL/NS; cs.push([cs[i][0] + dv*h, cs[i][1] + dz*h]); }
    const at = b => { const x = Math.max(0, Math.min(NS, b/PL*NS)), i = Math.min(NS - 1, Math.floor(x)), t = x - i;
      return { c: [cs[i][0] + (cs[i + 1][0] - cs[i][0])*t, cs[i][1] + (cs[i + 1][1] - cs[i][1])*t], th: ths[i] + (ths[i + 1] - ths[i])*t }; };
    const pt = (a, b, lift = 0) => { const { c, th } = at(b), [nv, nz] = nrmVZ(th); return dk(-PW/2 + a, VR + c[0] + nv*(off + lift), BH + H + c[1] + nz*(off + lift)); };
    const nrm = b => { const [nv, nz] = nrmVZ(at(b).th); return dkv(0, nv, nz); };
    const tan = b => { const [dv, dz] = dirVZ(at(b).th); return dkv(0, dv, dz); };
    return { pt, nrm, tan, NS };
  }

  /* ---------- what is printed (and written) on a page ---------- */
  const MON_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const GA = 6, GB = 44, CW = (PW - 12)/7, CH = 12.4;                 // the date grid: left, top, cell
  const cellBox = (y, mo, d) => { const i = new Date(y, mo, 1).getDay() + d - 1, c = i % 7, r = Math.floor(i/7); return [GA + c*CW, GB + r*CH, GA + (c + 1)*CW, GB + (r + 1)*CH]; };
  // text lying on a page: its baseline at (a, b), reading across the page; hidden when the page turns its back
  const pgTx = (S, a, b, str, size, col = INK, weight = 700, anchor = 'start', font = MONO) =>
    `<text transform="${txM(P(...S.pt(a, b, .04)), Dv(...DU), Dv(...S.tan(b)))}" font-size="${f(size)}" fill="${col}" text-anchor="${anchor}" font-family="${font}" font-weight="${weight}">${str}</text>`;
  const pgPath = (S, pts, lift = .03) => pd(pts.map(([a, b]) => S.pt(a, b, lift)), false);
  function seasonPic(S, mo){
    const cx = 132, cy = 19;
    const P2 = (a, b) => [cx + a, cy + b];
    if (mo === 11 || mo <= 1){   // winter: a snowflake
      let d = '';
      for (let k = 0; k < 3; k++){ const t = k*Math.PI/3, c = Math.cos(t), s = Math.sin(t);
        d += pgPath(S, [P2(-10*c, -10*s), P2(10*c, 10*s)]);
        for (const sg of [-1, 1]){ const bx = sg*6.5*c, by = sg*6.5*s;
          d += pgPath(S, [P2(bx + sg*3*Math.cos(t + .7), by + sg*3*Math.sin(t + .7)), P2(bx, by), P2(bx + sg*3*Math.cos(t - .7), by + sg*3*Math.sin(t - .7))]); } }
      return `<path d="${d}" fill="none" stroke="#5b8fd6" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (mo <= 4){                // spring: a flower on a stem
      let s = `<path d="${pgPath(S, [P2(0, 3), P2(1.5, 10), P2(0, 14)])}" fill="none" stroke="#4f9a5c" stroke-width="1"/>`;
      for (let k = 0; k < 5; k++){ const t = k/5*2*Math.PI - Math.PI/2, pc = [Math.cos(t)*4.2, Math.sin(t)*4.2 - 2];
        const ring = Array.from({ length: 10 }, (_, j) => { const q = j/10*2*Math.PI; return S.pt(cx + pc[0] + 2.8*Math.cos(q), cy + pc[1] + 2.8*Math.sin(q), .03); });
        s += fill(pd(ring), '#f39ab8') + ink(pd(ring), .4); }
      const c0 = Array.from({ length: 10 }, (_, j) => { const q = j/10*2*Math.PI; return S.pt(cx + 1.6*Math.cos(q), cy - 2 + 1.6*Math.sin(q), .04); });
      return s + fill(pd(c0), '#f6c63a') + ink(pd(c0), .4);
    }
    if (mo <= 7){                // summer: the sun
      const disc = Array.from({ length: 16 }, (_, j) => { const q = j/16*2*Math.PI; return S.pt(cx + 5*Math.cos(q), cy + 5*Math.sin(q), .03); });
      let d = ''; for (let k = 0; k < 8; k++){ const t = k/8*2*Math.PI; d += pgPath(S, [P2(7*Math.cos(t), 7*Math.sin(t)), P2(10.5*Math.cos(t), 10.5*Math.sin(t))]); }
      return fill(pd(disc), '#f7b733') + ink(pd(disc), .5) + `<path d="${d}" fill="none" stroke="#e98a2c" stroke-width="1.1" stroke-linecap="round"/>`;
    }
    // autumn: a maple leaf
    const leaf = [[0, -10], [2, -5], [6, -7], [5, -2], [10, -1], [6, 2], [7, 5], [2, 4], [0, 7], [-2, 4], [-7, 5], [-6, 2], [-10, -1], [-5, -2], [-6, -7], [-2, -5]].map(([a, b]) => S.pt(cx + a, cy + b, .03));
    return fill(pd(leaf), '#e3672e') + ink(pd(leaf), .5) + `<path d="${pgPath(S, [P2(0, 6), P2(.6, 11)])}" fill="none" stroke="#9c4a1e" stroke-width=".9"/>`;
  }
  // everything on the printed side of month page i, laid on the page shape S (only what lies in b0..b1 of it)
  function pageContent(i, S, st, today, b0 = -1, b1 = 1e9){
    const { y, mo } = pageYM(i), inR = b => b >= b0 && b < b1;
    let s = '';
    if (inR(29)) s += pgTx(S, 9, 29, String(mo + 1), 20, INK, 800) + pgTx(S, mo >= 9 ? 33 : 22, 28.5, '月', 8.5, INK, 800, 'start', KAI);
    if (inR(18)) s += pgTx(S, 50, 18, MON_EN[mo], 5.4, INK, 800);
    if (inR(26)) s += pgTx(S, 50, 26, String(y), 4.6, mix(INK, '#ffffff', .3), 700);
    if (inR(19)) s += seasonPic(S, mo);
    if (inR(40)) WD.forEach((w, c) => { s += pgTx(S, GA + (c + .5)*CW, 40.5, w, 4.2, c === 0 || c === 6 ? RED : INK, 800, 'middle', KAI); });
    const rows = Math.ceil((new Date(y, mo, 1).getDay() + daysIn(y, mo))/7);
    let d = '';
    for (let r = 0; r <= rows; r++){ const b = GB + r*CH; if (inR(b)) d += pgPath(S, [[GA, b], [PW - GA, b]], .02); }
    const g0 = Math.max(GB, b0), g1 = Math.min(GB + rows*CH, b1);
    if (g1 > g0) for (let c = 0; c <= 7; c++){ const a = GA + c*CW; d += pgPath(S, [[a, g0], [a, g1]], .02); }
    if (d) s += `<path d="${d}" fill="none" stroke="${GRIDC}" stroke-width=".35"/>`;
    for (let dd = 1; dd <= daysIn(y, mo); dd++){
      const [x0, y0] = cellBox(y, mo, dd), wd = new Date(y, mo, dd).getDay(), hol = holidayName(y, mo, dd), red = wd === 0 || wd === 6 || !!hol;
      if (inR(y0 + 5.4)) s += pgTx(S, x0 + 2.2, y0 + 5.4, String(dd), 4.8, red ? RED : INK, 800);
      if (hol && inR(y0 + 10.4)) s += pgTx(S, x0 + 2.2, y0 + 10.4, hol, 2.9, RED, 700, 'start', KAI);
    }
    return s + marksOn(i, S, st, today, inR);
  }
  // the red marks on page i: today's square, crosses through days gone by, exam circles, the countdown
  const crossLines = (box, k) => { const [x0, y0, x1, y1] = box, a = [[x0 + 3, y0 + 2.2], [x1 - 3, y1 - 2.2]], b = [[x1 - 3, y0 + 2.2], [x0 + 3, y1 - 2.2]];
    const part = (q, t) => [q[0], [q[0][0] + (q[1][0] - q[0][0])*t, q[0][1] + (q[1][1] - q[0][1])*t]];
    return k <= 0 ? [] : k < .5 ? [part(a, k*2)] : [a, part(b, Math.min(1, (k - .5)*2))]; };
  const ringPath = (box, k) => { const [x0, y0, x1, y1] = box, cx = (x0 + x1)/2, cy = (y0 + y1)/2, ra = CW/2 + 2.6, rb = CH/2 + 2.4, out = [];
    const n = Math.max(2, Math.ceil(40*k)); for (let j = 0; j <= n; j++){ const t = -1.9 + (2*Math.PI + .5)*k*j/n, w = 1 + .05*Math.sin(3*t);
      out.push([cx + ra*w*Math.cos(t) + .8*Math.sin(t*2), cy + rb*w*Math.sin(t)]); }
    return out; };
  function marksOn(i, S, st, today, inR){
    const { y, mo } = pageYM(i);
    let s = '', d = '';
    if (y === today.y && mo === today.mo){ const [x0, y0, x1, y1] = cellBox(y, mo, today.d);
      if (inR((y0 + y1)/2)) s += `<path d="${pd([[x0 + .7, y0 + .7], [x1 - .7, y0 + .7], [x1 - .7, y1 - .7], [x0 + .7, y1 - .7]].map(([a, b]) => S.pt(a, b, .05)))}" fill="none" stroke="${RED}" stroke-width=".9" stroke-linejoin="round"/>`; }
    for (const c of st.cross[i] || []){ const box = cellBox(y, mo, c.d); if (inR((box[1] + box[3])/2)) for (const q of crossLines(box, c.k)) d += pgPath(S, q, .06); }
    for (const c of st.circles) if (c.p === i){ const box = cellBox(y, mo, c.d);
      if (inR((box[1] + box[3])/2)){ d += pgPath(S, ringPath(box, c.k), .06);
        if (c.k >= 1) s += `<text transform="${txM(P(...S.pt(box[2] - 1, box[1] - .6, .07)), Dv(...DU), Dv(...S.tan(box[1])))}" font-size="4.6" fill="${MARK}" font-family="${KAI}" font-weight="800" text-anchor="end">${c.name}</text>`; } }
    if (st.note && st.note.p === i && inR(37)){ const shown = st.note.text.slice(0, Math.floor(st.note.k + 1e-6));
      if (shown) s += `<text transform="${txM(P(...S.pt(48, 37, .07)), Dv(...DU), Dv(...S.tan(37)))}" font-size="5.6" fill="${MARK}" font-family="${KAI}" font-weight="800">${shown}</text>`; }
    if (d) s += `<path d="${d}" fill="none" stroke="${MARK}" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" opacity=".92"/>`;
    return s;
  }
  // the back of a page (what shows on the back of the stand): ruled memo lines
  function memoSide(S){
    const n = kScl(S.nrm(60), -1);
    if (!vis(n)) return '';
    let d = ''; for (let b = 30; b < PL - 8; b += 9) d += pd([S.pt(10, b, -.04), S.pt(PW - 10, b, -.04)], false);
    // the printing reads for someone behind the stand: across the page the other way
    const tb = S.tan(18), at = S.pt(PW - 12, 18, -.05);
    return `<path d="${d}" fill="none" stroke="#c9c1b0" stroke-width=".4"/>`
      + `<text transform="${txM(P(...at), Dv(...kScl(DU, -1)), Dv(...tb))}" font-size="5" fill="${mix(INK, '#ffffff', .35)}" font-family="${MONO}" font-weight="800">MEMO 备忘</text>`;
  }

  /* ---------- the stand's pieces ---------- */
  // a box from its centre and three unit axes, each face coloured by colOf(face index, normal): 0 +ax, 1 -ax, 2 +ay, 3 -ay, 4 +az, 5 -az
  function cbox(c, ax, ay, az, hx, hy, hz, colOf, w = .8){
    const v = (i, j, k) => [0, 1, 2].map(q => c[q] + ax[q]*hx*i + ay[q]*hy*j + az[q]*hz*k);
    const F = [[ax, [[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]], [kScl(ax,-1), [[-1,-1,-1],[-1,1,-1],[-1,1,1],[-1,-1,1]]],
               [ay, [[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]]], [kScl(ay,-1), [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]],
               [az, [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]], [kScl(az,-1), [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]]]];
    return F.map(([n, q], i) => vis(n) ? shape(q.map(([a, b, k]) => v(a, b, k)), colOf(i, n), w) : '').join('');
  }
  const boardCol = m => (i, n) => i === 4 ? tone(n, m) : toneI(n, GREY);
  function boardSvg(front, m){
    const D = front ? D_F : D_B, N = front ? N_F : N_B, L = front ? LF : LB;
    return cbox(kAdd(kAdd(RIDGE(0), kScl(D, L/2)), kScl(N, -TB/2)), DU, D, N, W2, L/2, TB/2, boardCol(m), .8);
  }
  // the base: inside the triangle its top is the board's grey inner side; the groove in front is covered like the faces
  const baseSvg = m => cbox(dk(0, (BASE.v0 + VF)/2, BH + BASE.h/2), DU, DV, Z_UP, W2, (VF - BASE.v0)/2, BASE.h/2, (i, n) => toneI(n, GREY), .8)
    + cbox(dk(0, (VF + BASE.v1)/2, BH + BASE.h/2), DU, DV, Z_UP, W2, (BASE.v1 - VF)/2, BASE.h/2, boardCol(m), .8);
  const lipSvg = m => cbox(dk(0, (LIP.v0 + LIP.v1)/2, BH + LIP.h/2), DU, DV, Z_UP, W2, (LIP.v1 - LIP.v0)/2, LIP.h/2, (i, n) => i === 2 || i === 4 ? tone(n, m) : toneI(n, GREY), .8);
  // a stack of n pages lying on a face, as one block
  function stackSvg(front, n){
    if (n <= 0) return '';
    const D = front ? D_F : D_B, N = front ? N_F : N_B, t = n*TP;
    return cbox(kAdd(kAdd(RIDGE(0), kScl(D, PL/2 + .4)), kScl(N, t/2)), DU, D, N, PW/2, PL/2, t/2, (i, nn) => toneI(nn, MAT.paper), .55);
  }
  // the print on the back of the stand (only seen while no month has been turned over yet)
  function backPrint(m){
    if (!vis(N_B)) return '';
    const R = kScl(DU, -1), at = b => kAdd(kAdd(RIDGE(0), kScl(D_B, b)), kScl(N_B, .05));
    const t = (p, str, size, col, w = 800, font = MONO) => `<text transform="${txM(P(...p), Dv(...R), Dv(...D_B))}" font-size="${size}" fill="${col}" text-anchor="middle" font-family="${font}" font-weight="${w}">${str}</text>`;
    return t(at(52), String(Y0), 24, INK) + t(at(70), '台 历', 9, INK, 800, KAI) + t(at(86), '好好学习 天天向上', 5, mix(INK, m.l, .3), 700, KAI);
  }

  /* ---------- the red marker ---------- */
  const PEN_C = matOf('#d94636'), FELT = matOf('#c93a2c');
  const REST = { o: dk(58, 42.3, BH + BASE.h + 6), d: kScl(DU, -1) };
  const WRITE_D = norm(kAdd(kAdd(kScl(N_F, .7), kScl(DU, .48)), kScl(Z_UP, .42)));
  function penSvg(p){
    const { o, d } = p, [e1, e2] = axisFrame(d), items = [];
    const seg = (name, g) => items.push({ name, s0: g.s0, s1: g.s1, svg: coaxSeg(o, d, g) });
    seg('tip', { s0: 0, s1: 4.5, r0: .9, r1: 2.6, M: FELT, n: 10, w: .7, shade: toneI });
    seg('nose', { s0: 4.5, s1: 14, r0: 3.4, r1: 5.4, M: MAT.plastic, n: 20, w: .9 });
    seg('barrel', { s0: 14, s1: 94, r0: 5.6, M: MAT.plastic, n: 22, w: 1.2 });
    seg('cap', { s0: 92, s1: 117, r0: 6.2, r1: 6.0, M: PEN_C, n: 22, w: 1.2 });
    seg('plug', { s0: 117, s1: 119.5, r0: 5.4, r1: 4.6, M: PEN_C, n: 20, w: .9 });
    let s = coaxOrder(d, items);
    const clip = obox(kAdd(kAt(o, d, 104), kScl(e2, 6.9)), d, e1, e2, 10, 1.3, .5, PEN_C, tone, .8);
    const n0 = e2, txt = vis(n0) ? txOn(kAdd(kAt(o, d, 55), kScl(n0, 5.65)), kScl(d, -1), n0, 'MARKER', 3.4, PEN_C.m, 800) : '';
    return vis(e2) ? s + txt + clip : clip + s + txt;
  }
  const penPts = p => { const out = []; for (const [s0, r] of [[0, 1], [14, 5.6], [94, 5.6], [119, 5]]) out.push(...axisRing(kAt(p.o, p.d, s0), p.d, r, 8)); return out; };
  const lerpPose = (a, b, e, h) => ({ o: kAdd(kLerp(a.o, b.o, e), [0, 0, h*Math.sin(Math.PI*e)]), d: norm(kLerp(a.d, b.d, e)) });

  /* ---------- the scene ---------- */
  const frontShape = n => pageShape(TH_F, 0, n*TP);
  function turningSvg(i, th, bend, off, st, today){
    // the page as strips down its length, back to front; the printed side's marks on the strips that face the viewer
    const S = pageShape(th, bend, off), items = [];
    for (let j = 0; j < S.NS; j++){
      const b0 = j*PL/S.NS, b1 = (j + 1)*PL/S.NS, q = [S.pt(0, b0), S.pt(PW, b0), S.pt(PW, b1), S.pt(0, b1)], n = S.nrm((b0 + b1)/2), fr = vis(n);
      let svg = face(pd(q), fr ? toneI(n, MAT.paper) : toneI(kScl(n, -1), { l: '#f6f1e4', m: '#e4dccb', d: '#c8bea9' }));
      if (fr) svg += pageContent(i, S, st, today, b0, b1);
      items.push({ at: avg(q), svg });
    }
    const out = [];
    for (let j = 0; j <= S.NS; j++) out.push(S.pt(PW, j*PL/S.NS));
    for (let j = S.NS; j >= 0; j--) out.push(S.pt(0, j*PL/S.NS));
    return byDepth(items) + ink(pd(out), .75);
  }
  function scheduleMidnight(){
    const d = new Date(), next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 5);
    ctx.later(next - d, undefined, 'midnight');
  }
  function scene(st, m){
    const today = todayOf();
    scheduleMidnight();
    const fl = st.flip, pk = st.peek;
    const frontTop = pk ? st.page + pk.n : fl && fl.dir > 0 ? st.page + 1 : st.page;
    const nFront = Math.max(0, NPG - frontTop), nBack = Math.max(0, fl && fl.dir < 0 ? st.page - 1 : st.page);
    const camF = dot(CAM_V, DV) >= 0, fV = vis(N_F), bV = vis(N_B);
    let s = castShadow([dk(-W2, BASE.v0, BH), dk(W2, BASE.v0, BH), dk(W2, BASE.v1, BH), dk(-W2, BASE.v1, BH), RIDGE(-W2), RIDGE(W2)], BH);
    s += castShadow(penPts(st.pen), BH);
    // the two faces, each with the pages lying on it
    let front = boardSvg(true, m), back = boardSvg(false, m);
    if (nFront){ const S = frontShape(nFront); front += act('page', stackSvg(true, nFront) + (fV ? pageContent(frontTop, S, st, today) : '')); }
    // (a page on the back has its printed side to the board: outward is against its normal)
    if (nBack){ const S = pageShape(TH_B, 0, -nBack*TP); back += act('back', stackSvg(false, nBack) + (bV ? memoSide(S) : '')); }
    else back += backPrint(m);
    // a page on its way over the top, or the pages lifted to peek: on a face's side they lie by that face; over the top, above all
    let turning = '', side = 'top';
    if (fl){ const off0 = (NPG - fl.i - .5)*TP, off1 = (fl.i + .5)*TP, e = fl.dir > 0 ? fl.e : 1 - fl.e;
      turning = turningSvg(fl.i, fl.th, fl.bend, off0 + (-off1 - off0)*e, st, today);
      const mid = fl.th + fl.bend/2; side = mid < Math.PI/2 ? 'front' : mid > 1.5*Math.PI ? 'back' : 'top'; }
    if (pk){ for (let j = pk.n - 1; j >= 0; j--) turning += turningSvg(st.page + j, pk.th - j*.035, pk.bend*(1 - j*.15), (NPG - st.page - j - .5)*TP, st, today); side = 'top'; }
    const behind = (side === 'front' && !camF) || (side === 'back' && camF);
    const coil = coilParts(dk(COIL.u0, VR, COIL.z), DU, 0, COIL.u1 - COIL.u0, COIL.r, COIL.turns, MAT.steel.l, .5);
    const penUp = st.pen !== REST, pen = act('pen', penSvg(st.pen)), lip = lipSvg(m), base = baseSvg(m);
    s += coil.far;
    if (turning && behind) s += turning;
    if (camF){
      s += back + (turning && side === 'back' && !behind ? turning : '') + base + front + (turning && side === 'front' ? turning : '');
      if (!penUp) s += pen;
      s += lip;
    } else {
      s += pen + lip + base + front + back + (turning && side === 'back' ? turning : '');
    }
    if (turning && side === 'top') s += turning;
    s += coil.near;
    if (camF && penUp) s += pen;
    s += labels(st, frontTop, nFront, nBack);
    return s;
  }
  function labels(st, frontTop, nFront, nBack){
    const S = frontShape(nFront), { y, mo } = pageYM(frontTop), circ = st.circles.find(c => c.p === frontTop);
    const items = [
      { at: kAdd(kAdd(RIDGE(-W2 + 8), kScl(D_B, LB*.55)), kScl(N_B, nBack*TP)), text: '台历架', on: false },
      { at: dk(-28, VR, COIL.z + COIL.r), text: '双线铁圈', on: !!st.flip || !!st.peek },
      { at: S.pt(24, 22), text: `${mo + 1}月`, on: !!st.peek },
      { at: kAdd(kAdd(RIDGE(30), kScl(D_B, LB*.4)), kScl(N_B, nBack*TP)), text: '翻过去的月份', on: !!st.flip },
      { at: kAt(st.pen.o, st.pen.d, 60), text: '红色记号笔', on: st.pen !== REST },
      { at: dk(-60, (LIP.v0 + VF)/2, BH + BASE.h), text: '笔槽', on: false },
      ...(circ ? [{ at: (() => { const b = cellBox(y, mo, circ.d); return S.pt((b[0] + b[2])/2, b[3] + 2); })(), text: '考试日', on: circ.k < 1 }] : []),
      ...(st.note && st.note.p === frontTop ? [{ at: S.pt(60, 35), text: '高考倒计时', on: st.note.k < st.note.text.length }] : []) ];
    return zhCallouts(items, []);
  }

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { flip: '正在翻页', mark: '正在画', peek: '在偷看', write: '正在写' };
  const busy = () => { if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等我一下'); return true; };
  // turn one page over (dir +1: this month goes to the back; -1: last month comes back to the front)
  function flipSeg(st, dir, ms = 620){
    return { ms, start(){ st.flip = dir > 0 ? { i: st.page, dir, th: TH_F, bend: 0, e: 0 } : { i: st.page - 1, dir, th: TH_B, bend: 0, e: 0 }; },
      step(k){ const e = ease(k), fl = st.flip; fl.e = e; fl.th = dir > 0 ? TH_F + (TH_B - TH_F)*e : TH_B + (TH_F - TH_B)*e; fl.bend = dir*.85*Math.sin(Math.PI*k); },
      end(){ st.page += dir; st.flip = null; } };
  }
  const flipsTo = (st, from, to, ms = 440) => { const out = []; for (let p = from; p !== to; p += Math.sign(to - from)) out.push(flipSeg(st, Math.sign(to - from), ms)); return out; };
  // the marker: out of the groove onto the page (the month on top of the front), along a path on the page, back
  const writeAt = (st, a, b) => ({ o: frontShape(NPG - st.page).pt(a, b, .3), d: WRITE_D });
  const penGo = (st, to, ms = 420, h = 30) => ({ ms, start(){ this.from = st.pen; this.to = typeof to === 'function' ? to() : to; },
    step(k){ st.pen = lerpPose(this.from, this.to, ease(k), h); }, end(){ st.pen = this.to; } });
  const penHome = st => ({ ...penGo(st, REST, 460, 34), end(){ st.pen = REST; } });

  function next(st){ if (busy()) return;
    if (st.page >= NPG - 1) return ui.flash(`后面没有了，我只印到${Y0 + 1}年1月`);
    const mo = pageYM(st.page + 1).mo + 1;
    kPlay(ui, 'flip', [flipSeg(st, 1)], () => ui.flash(st.page === TODAY_PAGE ? '翻回这个月了' : `翻篇了，${mo}月见`));
  }
  function prev(st){ if (busy()) return;
    if (st.page <= 0) return ui.flash(`再往前没有了，这是${Y0}年1月`);
    kPlay(ui, 'flip', [flipSeg(st, -1)], () => ui.flash(st.page === TODAY_PAGE ? '翻回这个月了' : `退回${pageYM(st.page).mo + 1}月——过去的就让它过去吧`));
  }
  const toToday = st => flipsTo(st, st.page, TODAY_PAGE);
  // cross off the first day of this month that is over and not crossed yet (today counts)
  function crossDay(st){ if (busy()) return;
    const t = todayOf(), p = pageOf(t.y, t.mo);
    if (p < 0 || p >= NPG) return ui.flash('这本台历管不到今天');
    const done = new Set((st.cross[p] || []).map(c => c.d));
    let d = 1; while (d <= t.d && done.has(d)) d++;
    if (d > t.d) return ui.flash('今天已经划掉了——明天的还不能划，急什么');
    const segs = [...toToday(st)], box = () => cellBox(t.y, t.mo, d);
    let c = null;
    segs.push(penGo(st, () => { const b = box(); return writeAt(st, b[0] + 3, b[1] + 2.2); }, 520, 40));
    segs.push({ ms: 520, start(){ c = { d, k: 0 }; (st.cross[p] = st.cross[p] || []).push(c); },
      step(k){ c.k = k; const b = box(), q = crossLines(b, k), last = q[q.length - 1]; if (last) st.pen = writeAt(st, ...last[1]); } });
    segs.push(penHome(st));
    kPlay(ui, 'mark', segs, () => ui.flash(d === t.d ? '又熬过一天！（虽然今天还没过完）' : `${d}号也补上了——又熬过一天`, 2400));
  }
  // circle the next exam day (turning to its month and back)
  function circleExam(st){ if (busy()) return;
    const t = todayOf(), ex = EXAMS.find(e => new Date(e.y, e.mo, e.d) >= t.t);
    if (!ex) return ui.flash('这本台历上没有考试了——好像也不是什么坏事');
    const p = pageOf(ex.y, ex.mo), when = `${ex.mo + 1}月${ex.d}日`;
    if (st.circles.some(c => c.p === p && c.d === ex.d)) return ui.flash(`${when}${ex.name}考试——早圈上了，躲不掉的`);
    const segs = [...flipsTo(st, st.page, p)], box = () => cellBox(ex.y, ex.mo, ex.d);
    let c = null;
    segs.push(penGo(st, () => { const b = box(), q = ringPath(b, .02); return writeAt(st, ...q[0]); }, 520, 40));
    segs.push({ ms: 950, start(){ c = { p, d: ex.d, name: ex.name, k: 0 }; st.circles.push(c); },
      step(k){ c.k = Math.min(1, k*1.02); const q = ringPath(box(), c.k); st.pen = writeAt(st, ...q[q.length - 1]); }, end(){ c.k = 1; } });
    segs.push(penHome(st), ...flipsTo(st, p, TODAY_PAGE));
    kPlay(ui, 'mark', segs, () => ui.flash(`${when}${ex.name}考试，红圈圈上了——别装没看见`, 2600));
  }
  // how many days to the next holiday: lift the pages up to its month and peek, then let them fall back
  function countDays(st){ if (busy()) return;
    const t = todayOf(), now = BREAKS.find(b => t.t >= b.t && dayDiff(b.t, t.t) < b.len);
    if (now) return ui.flash(`现在就在放${now.name}啊，还数什么！`);
    const nb = BREAKS.find(b => b.t > t.t);
    if (!nb) return ui.flash('这本台历上看不到下一个假期了');
    const n = dayDiff(t.t, nb.t), p = pageOf(nb.t.getFullYear(), nb.t.getMonth()), wb = BREAKS.find(b => b.name === '寒假' && b.t > t.t && b !== nb);
    const say = `离${nb.name}还有 ${n} 天` + (wb ? `，离寒假还有 ${dayDiff(t.t, wb.t)} 天` : '');
    const segs = [...toToday(st)];
    if (p === TODAY_PAGE) return kPlay(ui, 'peek', segs, () => ui.flash(`这个月就放${nb.name}！还有 ${n} 天`));
    const k = Math.min(p - TODAY_PAGE, NPG - TODAY_PAGE - 1);
    segs.push({ ms: 540, start(){ st.peek = { n: k, th: TH_F, bend: 0 }; }, step(q){ st.peek.th = TH_F + (TH_UP - TH_F)*ease(q); st.peek.bend = .55*Math.sin(Math.PI*Math.min(1, q*1.15)); } },
      { ms: 1500, start(){ ui.flash(`${say}——偷看一眼${nb.t.getMonth() + 1}月`, 2600); }, step(q){ st.peek.th = TH_UP + .03*Math.sin(q*Math.PI*4); st.peek.bend = .05*Math.sin(q*Math.PI*3); } },
      { ms: 430, step(q){ st.peek.th = TH_UP + (TH_F - TH_UP)*q*q; st.peek.bend = -.45*Math.sin(Math.PI*q); }, end(){ st.peek = null; } });
    kPlay(ui, 'peek', segs, () => ui.flash('看完了，翻回来——日子还得一天一天过', 2000));
  }
  // the 高考 countdown, written across the top of this month
  function countdown(st){ if (busy()) return;
    const t = todayOf();
    let g = new Date(t.y, 5, 7);
    if (t.t > new Date(t.y, 5, 9)) g = new Date(t.y + 1, 5, 7);
    if (t.t >= g) return ui.flash('今天就在考高考！还看什么台历');
    const n = dayDiff(t.t, g), text = `高考倒计时 ${n} 天`;
    if (st.note && st.note.p === TODAY_PAGE && st.note.text === text) return ui.flash(`已经写着了：还有 ${n} 天`);
    const segs = [...toToday(st)], CH_W = 5.6;
    segs.push(penGo(st, () => writeAt(st, 49, 36), 520, 40));
    segs.push({ ms: 1500, start(){ st.note = { p: TODAY_PAGE, text, k: 0 }; },
      step(k){ st.note.k = k*text.length; st.pen = writeAt(st, 49 + k*text.length*CH_W*.62, 36 + .8*Math.sin(k*text.length*Math.PI)); }, end(){ st.note.k = text.length; } });
    segs.push(penHome(st));
    kPlay(ui, 'write', segs, () => ui.flash(`距离高考还有 ${n} 天——每划掉一天，就少一天`, 2600));
  }

  const crossed0 = []; for (let d = 1; d < T0.d; d++) crossed0.push({ d, k: 1 });
  const __cfg = ({
    fig:'15', turn:'full', title:'台历', palette:'mustard',
    state:{ page: TODAY_PAGE, flip: null, peek: null, cross: { [TODAY_PAGE]: crossed0 }, circles: [], note: null, pen: REST },
    scene,
    buttons:[
      { label:'翻到下个月', onClick: next },
      { label:'翻回上个月', onClick: prev },
      { label:'圈出考试日', onClick: circleExam },
      { label:'划掉一天', onClick: crossDay },
      { label:'还有几天放假', onClick: countDays },
      { label:'高考倒计时', onClick: countdown },
    ],
    acts:{ page: st => next(st), back: st => prev(st), pen: st => crossDay(st) },
  });

  return ctx.adapt(__cfg, { seeThrough: false });
}
