// Fig. 20 MP3 — desk-scene object (a new one, written for the desk: no standalone page).
// Its code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*), ctx.ui its ui
// (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are collected by the scene.
import { AZ_MAX, AZ_MIN, BOARD, C, CAM_B0, CAM_D, CAM_K, CAM_LIM, CAM_R, CAM_U, CAM_V, CERAMIC, CLEAR, CLIP_PFX, DARK, DESK_Z, Dv, GRAPHITE, HAND, INK, INK_K, INK_REF_VB, L, LIN, MAT, METAL, OX, OY, P, P0, PALS, PITCH, PITCH0, PX, PY, PZ, RC, RCZ, S, SH, SHADOW, SHADOW_K, SHADOW_LEN, SOFT, TURNS, VIEW, VIEW_NAMES, WOOD, YAW, YAW0, _clipN, act, arcUV, avg, axisFrame, axisRing, board, boardTop, box, boxMid, byDepth, camBasis, camDot, coaxOrder, coaxSeg, coilParts, cross, cyl, cylX, depthOf, dot, ease, ellUV, extrude, f, face, facing, farHalf, fill, filterFor, graphite, handGlyphs, handStrokes, hull, hullInk, ink, inkScale, kAdd, kAt, kLen, kLerp, kRng, kScl, line, loft, matOf, mix, nearArc, nearHalf, norm, obox, oboxPts, on, openShell, paperSheet, pd, rectUV, rod, rotV, rotXY, rrUV, sepOrder, setCam, setClipPrefix, setInk, setLight, setOrigin, shape, sp, step3, strokesLength, sub, tone, toneI, traceStrokes, tx, txM, txOn, txY, txZ, vis, yawTurn } from '../engine/index.js';

/** Where this object's own frame sits on the desk (u along the front edge, v toward the student, mm from the
 *  desk's centre; rot degrees). The 三八线 is u = 0: the student's half is u < 0. */
export const PLACE = { u: 570, v: 390, rot: -10 };

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;

  /* Fig. 20 — MP3 随身听: a 2006-style flash MP3 player (40 x 86 x 11.5 mm, 2 GB) lying face up on the deskmate's side
     with its white earphones plugged in, the cable in loose loops on the desk, the two buds beside it. 1 unit = 1 mm.
     The player has its own frame: a across its face (to the right), b along it toward its bottom end (the student's
     side), z up from its back; mp(a, b, z) is the world point, so it can be lifted and flipped over.

     How it really works (each button is one of these):
     1. It is a small computer. The controller chip (the 炬力 ATJ2085 in most Chinese players of the time) reads the
        compressed MP3 frames from the NAND flash, decodes them (Huffman, inverse MDCT) to 44.1 kHz samples, and its DAC
        and headphone amplifier drive the 3.5 mm jack: tip = left, ring = right, sleeve = ground.
     2. Keys: under the 4-way pad and its centre button sit five tact switches, metal domes that click shut onto
        contacts on a small board; the chip polls them. Up/down = volume, left/right = previous/next, centre = play/pause.
     3. Screen: a 128 x 64 OLED behind the front glass, driven over a ribbon cable (FPC) folded round to the board.
     4. Power: a flat Li-ion cell (3.7 V, 300 mAh) under the pad, charged from the mini-USB port, which also shows the
        flash as a disk to copy songs onto. The hold switch on the side locks the keys in a pocket.
     5. Earphones: in each bud a dynamic driver (magnet, voice coil, paper-thin diaphragm) behind a grille; three thin
        wires in the cable to the plug, split in two at the Y-split.
     Student life: the earphone wire run up inside the sleeve to the hand propping the cheek in class; the same song on
     repeat for a whole term; the teacher coming down the aisle and the player turned face down in a second; and an
     earphone cable that ties itself into a knot in any pocket.

     Parts:
     PLAYER  front glass panel . screen (OLED) . 4-way pad with its icons . centre play key . M key . sides and back in the
             body colour . hold switch . mini-USB port . lanyard hole and cord . back label
     INSIDE  main board . controller chip . flash chip . crystal . headphone socket . ribbon cable . key board with five
             dome switches . Li-ion cell . its leads . USB socket
     EARPHONES plug (tip, ring, sleeve) . strain relief . cable . Y-split . two buds (housing, grille, colour ring, stem)
             . the driver in a bud */

  const BH = ctx.deskZ;
  const PW = 40, PL = 86, TH = 11.5, PRAD = 7;                           // player: width (a), length (b), thickness, corner
  const SCR = [-15, -37, 15, -15], BEZ = [-17.5, -40, 17.5, -11.5];      // OLED, the glass round it (a0, b0, a1, b1)
  const PAD = { a: 0, b: 15, r: 13.5, ri: 5.7 }, MKEY = { a: -13.5, b: 34 }, JACK = { a: 7, b: -PL/2 };
  const PLAYER_AT = { u: -44, v: 8, rot: 4 };
  const CORD = '#2b2826', BUDC = MAT.plastic;
  const FRONT = { l:'#3d3f46', m:'#2b2d32', d:'#1b1c20' };
  const SONGS = [
    { who: '周杰伦', what: '晴天', len: 269, line: '前奏一响，就回到初二那年' },
    { who: '林俊杰', what: '江南', len: 267, line: '这首能一直放到放学' },
    { who: '五月天', what: '倔强', len: 260, line: '体育课跑八百米就靠它了' },
    { who: 'S.H.E', what: '不想长大', len: 252, line: '小提琴一出来，全班都会哼' },
    { who: '陈奕迅', what: '十年', len: 205, line: '听着听着，作业就写完了' },
    { who: '王力宏', what: '唯一', len: 271, line: '借同桌的，记得还' } ];

  /* ---------- the player's own frame: placed, lifted, and turned over about its long axis ---------- */
  let pO = [0, 0, 0], pA = [1, 0, 0], pB = [0, 1, 0], pPhi = 0, pLift = 0;
  function pFrame(st){ const t = PLAYER_AT.rot*Math.PI/180; pA = dkv(Math.cos(t), Math.sin(t)); pB = dkv(-Math.sin(t), Math.cos(t));
    pO = dk(PLAYER_AT.u, PLAYER_AT.v, BH); pPhi = Math.PI*ease(Math.min(1, Math.max(0, st.flip))); pLift = st.lift; }
  const mp = (a, b, z) => { const c = Math.cos(pPhi), s = Math.sin(pPhi), zz = z - TH/2, aa = a*c - zz*s, z2 = a*s + zz*c + TH/2 + pLift;
    return [pO[0] + pA[0]*aa + pB[0]*b, pO[1] + pA[1]*aa + pB[1]*b, pO[2] + z2]; };
  const mpv = (na, nb, nz) => { const c = Math.cos(pPhi), s = Math.sin(pPhi), aa = na*c - nz*s, zz = na*s + nz*c; return [pA[0]*aa + pB[0]*nb, pA[1]*aa + pB[1]*nb, zz]; };
  const pRR = (a0, b0, a1, b1, r, z, n = 5) => rrUV(a0, b0, a1, b1, r, n).map(([a, b]) => mp(a, b, z));
  const pRect = (a0, b0, a1, b1, z) => rectUV(a0, b0, a1, b1).map(([a, b]) => mp(a, b, z));
  const pCirc = (a, b, r, z, n = 24) => Array.from({length: n}, (_, i) => { const t = i/n*2*Math.PI; return mp(a + r*Math.cos(t), b + r*Math.sin(t), z); });
  const pText = (a, b, z, str, size, col, weight = 800, anchor = 'middle') => txOn(mp(a, b, z), mpv(1, 0, 0), mpv(0, 0, 1), str, size, col, weight, anchor);
  const pStroke = (pts, col, w, extra = '') => `<path d="${pd(pts, false)}" fill="none" stroke="${col}" style="stroke-width:${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const boxAround = (pts, r = 0) => [[0,1,2].map(i => Math.min(...pts.map(p => p[i])) - r), [0,1,2].map(i => Math.max(...pts.map(p => p[i])) + r)];

  /* ---------- the closed player ---------- */
  // the joint between the front glass panel and the body, on the sides that face the viewer
  function seam(z){
    const ring = rrUV(-PW/2, -PL/2, PW/2, PL/2, PRAD, 5), n = ring.length; let d = '';
    for (let i = 0; i < n; i++){ const p = ring[i], q = ring[(i + 1) % n], e = [q[0] - p[0], q[1] - p[1]];
      if (vis(mpv(e[1], -e[0], 0))) d += pd([mp(p[0], p[1], z), mp(q[0], q[1], z)], false); }
    return d ? `<path d="${d}" fill="none" stroke="${INK}" stroke-width=".6" opacity=".75"/>` : '';
  }
  function playerBody(st, m){
    const A0 = pRR(-PW/2 + 1.2, -PL/2 + 1.2, PW/2 - 1.2, PL/2 - 1.2, PRAD - 1.2, 0), A1 = pRR(-PW/2, -PL/2, PW/2, PL/2, PRAD, 1.8);
    const A2 = pRR(-PW/2, -PL/2, PW/2, PL/2, PRAD, TH - 1.8), A3 = pRR(-PW/2 + .9, -PL/2 + .9, PW/2 - .9, PL/2 - .9, PRAD - .9, TH);
    const up = mpv(0, 0, 1);
    let s = loft(A0, A1, n => tone(n, m)) + loft(A1, A2, n => tone(n, m)) + loft(A2, A3, n => toneI(n, FRONT)) + seam(TH - 1.8);
    s += sideParts(st, m);
    if (vis(up)) s += fill(pd(A3), FRONT.m) + frontFace(st, m);
    else if (vis(kScl(up, -1))) s += fill(pd(A0), m.l) + backFace(st, m);
    return s + hullInk([...A0, ...A3, ...A1], 2);
  }
  // what is on the edges: hold switch on the right side, mini-USB at the bottom end, the lanyard hole at the top corner
  function sideParts(st, m){
    let s = '';
    if (vis(mpv(1, 0, 0))){ const slot = [mp(PW/2 + .02, -28, 4), mp(PW/2 + .02, -16, 4), mp(PW/2 + .02, -16, 7.5), mp(PW/2 + .02, -28, 7.5)];
      s += fill(pd(slot), '#1d1a16') + ink(pd(slot), .4);
      s += obox(mp(PW/2 + .4, st.hold ? -25 : -19, 5.75), mpv(1, 0, 0), mpv(0, 1, 0), mpv(0, 0, 1), .6, 2.6, 1.2, MAT.steel, toneI, .6); }
    if (vis(mpv(0, 1, 0))){ const q = [mp(-4, PL/2 + .02, 4), mp(4, PL/2 + .02, 4), mp(3, PL/2 + .02, 7), mp(-3, PL/2 + .02, 7)]; s += fill(pd(q), '#1d1a16') + ink(pd(q), .5); }
    return s;
  }
  function frontFace(st, m){
    const z = TH + .02;
    let s = '';
    // the glass panel's print: brand, capacity
    s += pText(0, -4.6, z, 'MP3 · 2GB', 2.4, '#9a9ca3', 800);
    // screen: the glass round it, the OLED behind it
    s += fill(pd(pRR(BEZ[0], BEZ[1], BEZ[2], BEZ[3], 2.2, z)), '#15161a') + ink(pd(pRR(BEZ[0], BEZ[1], BEZ[2], BEZ[3], 2.2, z)), .6);
    s += act('screen', clipTo(pRect(SCR[0], SCR[1], SCR[2], SCR[3], z + .01), screenFace(st, z + .02)) + ink(pd(pRect(SCR[0], SCR[1], SCR[2], SCR[3], z + .01)), .45));
    // the 4-way pad: a ring rocker with its four icons, the play key in its middle
    const ring = pCirc(PAD.a, PAD.b, PAD.r, z + .35, 36), hole = pCirc(PAD.a, PAD.b, PAD.ri, z + .35, 24);
    const pk = st.press, dip = st.pressK;
    let pad = `<path d="${pd(ring)}${pd(hole.slice().reverse())}" fill="#3f4148" fill-rule="evenodd"/>` + ink(pd(ring), .8) + ink(pd(hole), .6);
    // the pressed side of the rocker goes dark
    const quad = { up: -Math.PI/2, down: Math.PI/2, prev: Math.PI, next: 0 }[pk];
    if (quad != null && dip > .05){ const arc = []; for (let i = 0; i <= 10; i++){ const t = quad - .7 + 1.4*i/10; arc.push(mp(PAD.a + (PAD.r - .5)*Math.cos(t), PAD.b + (PAD.r - .5)*Math.sin(t), z + .36)); }
      for (let i = 10; i >= 0; i--){ const t = quad - .7 + 1.4*i/10; arc.push(mp(PAD.a + (PAD.ri + .5)*Math.cos(t), PAD.b + (PAD.ri + .5)*Math.sin(t), z + .36)); }
      pad += fill(pd(arc), '#26272c', `opacity="${f(dip)}"`); }
    const ic = (name, col) => padIcon(name, z + .38, col || (pk === name && dip > .3 ? m.l : '#c9cbd1'));
    pad += act('up', ic('up')) + act('down', ic('down')) + act('prev', ic('prev')) + act('next', ic('next'));
    // invisible click targets over each quarter of the ring
    for (const [name, t] of [['up', -Math.PI/2], ['down', Math.PI/2], ['prev', Math.PI], ['next', 0]]){ const q = [];
      for (let i = 0; i <= 6; i++){ const a = t - .78 + 1.56*i/6; q.push(mp(PAD.a + PAD.r*Math.cos(a), PAD.b + PAD.r*Math.sin(a), z + .4)); }
      for (let i = 6; i >= 0; i--){ const a = t - .78 + 1.56*i/6; q.push(mp(PAD.a + PAD.ri*Math.cos(a), PAD.b + PAD.ri*Math.sin(a), z + .4)); }
      pad += act(name, fill(pd(q), 'transparent')); }
    s += pad;
    // the play key: a round key standing out of the ring's middle (it goes down when pressed)
    const kz = .9 - .65*(pk === 'play' ? dip : 0), o = mp(PAD.a, PAD.b, z), d = mpv(0, 0, 1);
    s += act('play', coaxSeg(o, d, { s0: 0, s1: kz, r0: 5, M: matOf('#55575e'), n: 24, w: .7, shade: toneI }) + padIcon('play', z + kz + .02, pk === 'play' && dip > .3 ? m.l : '#e6e7ea'));
    // the M key, small, at the bottom corner; its label
    s += act('menu', coaxSeg(mp(MKEY.a, MKEY.b, z), d, { s0: 0, s1: .7 - .5*(pk === 'menu' ? dip : 0), r0: 2.6, M: matOf('#55575e'), n: 16, w: .55, shade: toneI })
      + pText(MKEY.a, MKEY.b + 1.1, z + .75, 'M', 2.6, '#e6e7ea', 800));
    s += pText(13.5, 35.2, z, 'HOLD', 1.9, '#86888f', 800);
    // a gleam across the glass below the pad
    s += `<path d="${pd([mp(8, 41, z + .03), mp(17, 30, z + .03)], false)}" stroke="#ffffff" stroke-width="1.4" opacity=".16" stroke-linecap="round"/>`;
    return s;
  }
  // the icons on the pad: + / - for volume, |<< >>| for songs, play/pause on the key
  function padIcon(name, z, col){
    const at = (a, b) => mp(a, b, z);
    if (name === 'up' || name === 'down'){ const b0 = PAD.b + (name === 'up' ? -9.6 : 9.6);
      return pStroke([at(-1.6, b0), at(1.6, b0)], col, .7) + (name === 'up' ? pStroke([at(0, b0 - 1.6), at(0, b0 + 1.6)], col, .7) : ''); }
    if (name === 'prev' || name === 'next'){ const sg = name === 'next' ? 1 : -1, a0 = PAD.a + sg*9.6;
      const tri = (x) => fill(pd([at(a0 + sg*(x - 1.3), PAD.b - 1.2), at(a0 + sg*(x + .1), PAD.b), at(a0 + sg*(x - 1.3), PAD.b + 1.2)]), col);
      return tri(-.6) + tri(.8) + pStroke([at(a0 + sg*1.3, PAD.b - 1.2), at(a0 + sg*1.3, PAD.b + 1.2)], col, .45); }
    // play: a triangle and two bars
    return fill(pd([at(-2.4, PAD.b - 1.4), at(-.4, PAD.b), at(-2.4, PAD.b + 1.4)]), col) + pStroke([at(1, PAD.b - 1.3), at(1, PAD.b + 1.3)], col, .55) + pStroke([at(2.3, PAD.b - 1.3), at(2.3, PAD.b + 1.3)], col, .55);
  }
  // the OLED: dark when off; on: a status line, the song title running along, a progress bar and the times
  function screenFace(st, z){
    let s = fill(pd(pRect(SCR[0] - 1, SCR[1] - 1, SCR[2] + 1, SCR[3] + 1, z)), st.on ? '#06090d' : '#17191d');
    if (!st.on){ s += `<path d="${pd([mp(-10, -36, z + .01), mp(-14, -20, z + .01)], false)}" stroke="#ffffff" stroke-width="1.2" opacity=".14" stroke-linecap="round"/>`; return s; }
    const CY = '#7fe6ff', WH = '#e8fbff', song = SONGS[st.song];
    // status: play or pause, repeat-one, the track number, battery
    if (st.playing) s += fill(pd([mp(-13.6, -35.2, z), mp(-11.2, -34, z), mp(-13.6, -32.8, z)]), CY);
    else s += pStroke([mp(-13.3, -35.1, z), mp(-13.3, -32.9, z)], CY, .55) + pStroke([mp(-12.2, -35.1, z), mp(-12.2, -32.9, z)], CY, .55);
    s += pText(-8.2, -32.9, z, `${st.song + 1}/${SONGS.length}`, 2, CY, 700, 'start');
    if (st.loop) s += pText(2.5, -32.9, z, '单曲', 2, '#ffd36b', 800, 'middle');
    const bat = pRect(9.6, -35.3, 13.4, -32.9, z); s += ink(pd(bat), .3).replace(INK, CY) + fill(pd(pRect(9.9, -35, 12.4, -33.2, z)), CY) + fill(pd(pRect(13.4, -34.6, 13.9, -33.6, z)), CY);
    // the title, running right to left while it plays
    const title = `${song.who} - ${song.what}`, size = 4.2, wTitle = [...title].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e7f ? 1 : .6)*size, 0) + 10;
    const x0 = SCR[0] + 1 - (st.scroll % wTitle);
    s += pText(x0, -25.6, z, title, size, WH, 800, 'start') + pText(x0 + wTitle, -25.6, z, title, size, WH, 800, 'start');
    // volume bar while it changes, else the progress bar and the times
    if (st.volShow > .02){ s += `<g opacity="${f(Math.min(1, st.volShow*2))}">` + pText(-13.4, -18.6, z, 'VOL', 2, CY, 800, 'start');
      for (let i = 0; i < 10; i++){ const on = i < [3, 6, 10][st.vol]; s += fill(pd(pRect(-7 + i*2, -19.4 - i*.25, -5.8 + i*2, -18.2, z)), on ? CY : '#1d3c45'); }
      s += '</g>'; }
    else { s += fill(pd(pRect(-13.5, -21.4, 13.5, -20.6, z)), '#1d3c45') + fill(pd(pRect(-13.5, -21.4, -13.5 + 27*st.prog, -20.6, z)), CY);
      const tm = sec => `${String(Math.floor(sec/60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
      s += pText(-13.5, -16.6, z, tm(st.prog*song.len), 2, CY, 700, 'start') + pText(13.5, -16.6, z, tm(song.len), 2, CY, 700, 'end'); }
    return s;
  }
  // the back, when it lies face down: the label
  function backFace(st, m){
    // printed on the back: read with the player turned over, so it runs along -a with the back (-z) as its face
    const z = -.02, lab = pRR(-14, -24, 14, 8, 2, z), bt = (a, b, str, size, col, w) => txOn(mp(a, b, z - .01), mpv(-1, 0, 0), mpv(0, 0, -1), str, size, col, w, 'middle');
    return fill(pd(lab), '#f4f1e8') + ink(pd(lab), .5) + bt(0, -18, 'MP3 PLAYER', 2.6, INK, 800) + bt(0, -13.4, '2GB · USB 2.0', 2, INK, 700)
      + bt(0, -9, 'S/N 2006-0815', 1.8, '#6d6862', 700) + bt(0, -2.2, '深圳制造', 2.2, INK, 800) + act('back', fill(pd(pRR(-PW/2 + 1.2, -PL/2 + 1.2, PW/2 - 1.2, PL/2 - 1.2, PRAD - 1.2, z - .01)), 'transparent'));
  }

  /* ---------- see-through: the boards, the chips, the cell, the socket ---------- */
  const PCB = matOf('#3f8f5a'), GOLD = '#e0b84a';
  const pBox = (a0, b0, z0, a1, b1, z1, M, w = .6) => obox(mp((a0 + a1)/2, (b0 + b1)/2, (z0 + z1)/2), mpv(1, 0, 0), mpv(0, 1, 0), mpv(0, 0, 1), (a1 - a0)/2, (b1 - b0)/2, (z1 - z0)/2, M, toneI, w);
  function playerMech(st){
    const L = [[], [], [], [], []], put = (l, a, b, z, svg) => L[l].push({ at: mp(a, b, z), svg });
    // the cell under the key board, its two leads to the main board
    put(0, 0, 20, 2, pBox(-17.5, 1, .9, 17.5, 40.5, 4.6, matOf('#c9d3dc'), .7) + pText(0, 39.6, 4.62, 'Li-ion 3.7V 300mAh', 1.8, '#59636b', 800));
    for (const [a, col] of [[-6, '#d14a3a'], [-3, '#2b2826']]) put(1, a, 2, 4.8, pStroke([mp(a, 4, 4.4), mp(a, 1, 5.2), mp(a, -1.5, 4)], INK, 1.3) + pStroke([mp(a, 4, 4.4), mp(a, 1, 5.2), mp(a, -1.5, 4)], col, .6));
    // the main board under the screen: controller, flash, crystal, the headphone socket at its top edge
    let tr = ''; for (let i = 0; i < 7; i++) tr += pd([mp(-12 + i*3.6, -6, 3.81), mp(-12 + i*3.6, -14, 3.81), mp(-6 + i*1.2, -18, 3.81)], false);
    put(1, 0, -22, 3.3, pBox(-18, -41, 2.8, 18, -2, 3.8, PCB, .7) + `<path d="${tr}" fill="none" stroke="#7cc28f" style="stroke-width:.4" opacity=".8"/>`);
    const qfp = pBox(-11, -27, 3.8, -2, -18, 4.9, DARK, .6); let pins = '';
    for (let i = 0; i < 9; i++){ const t = -10.5 + i; pins += pd([mp(t, -27.8, 3.85), mp(t, -27, 3.85)], false) + pd([mp(t, -18, 3.85), mp(t, -17.2, 3.85)], false); }
    put(2, -6.5, -22.5, 4.4, qfp + `<path d="${pins}" fill="none" stroke="${MAT.steel.m}" style="stroke-width:.35"/>` + pText(-6.5, -21.6, 4.92, 'ATJ2085', 1.6, '#9a9ca3', 800));
    put(2, 8.5, -24, 4.4, pBox(3, -32, 3.8, 14, -16, 4.8, DARK, .6) + pText(8.5, -23.4, 4.82, 'NAND 2GB', 1.6, '#9a9ca3', 800));
    put(2, -12, -8, 4.3, pBox(-14.5, -10, 3.8, -9.5, -6.5, 5.2, MAT.steel, .5));
    put(2, JACK.a, JACK.b + 5, 5.8, pBox(JACK.a - 3.6, JACK.b + .4, 2.4, JACK.a + 3.6, JACK.b + 10, 9.2, matOf('#3a3c42'), .7));
    // the key board over the cell, its five dome switches under the pad
    put(3, 0, 18, 6.6, `<g opacity=".82">${pBox(-15.5, 2.5, 6.2, 15.5, 36.5, 6.9, PCB, .6)}</g>`);
    for (const [a, b] of [[0, PAD.b], [0, PAD.b - 9.6], [0, PAD.b + 9.6], [-9.6, PAD.b], [9.6, PAD.b], [MKEY.a, MKEY.b]]){ const lit = { play: [0, PAD.b], up: [0, PAD.b - 9.6], down: [0, PAD.b + 9.6], prev: [-9.6, PAD.b], next: [9.6, PAD.b], menu: [MKEY.a, MKEY.b] }[st.press];
      const on = lit && lit[0] === a && lit[1] === b && st.pressK > .4;
      put(4, a, b, 7.4, coaxSeg(mp(a, b, 6.9), mpv(0, 0, 1), { s0: 0, s1: on ? .35 : .8, r0: 2.6, r1: 1.6, M: on ? matOf('#fff1a8') : MAT.steel, n: 16, w: .5, shade: toneI })); }
    // the USB socket at the bottom end, the screen's glass and its ribbon cable folded round to the main board
    put(1, 0, PL/2 - 3, 5, pBox(-4.2, PL/2 - 7, 3.4, 4.2, PL/2 - .4, 6.8, MAT.steel, .6));
    put(4, 0, -26, 9.6, `<g opacity=".7">${pBox(SCR[0] - 1.5, SCR[1] - 1.5, 8.8, SCR[2] + 1.5, SCR[3] + 1.5, 10.2, matOf('#9fb3bd'), .5)}</g>`);
    put(3, 0, -10.5, 6, pStroke([mp(-6, -14, 8.8), mp(-6, -10.5, 8.4), mp(-6, -9.5, 5.2), mp(-6, -10.5, 3.9)], INK, 2.4) + pStroke([mp(-6, -14, 8.8), mp(-6, -10.5, 8.4), mp(-6, -9.5, 5.2), mp(-6, -10.5, 3.9)], '#e3a04a', 1.6));
    return L.map(l => byDepth(l)).join('');
  }

  /* ---------- earphones: plug, cable, Y-split, two buds ---------- */
  // the cable's way across the desk (u, v from this object's origin, height above the desk), neat and knotted
  const MAIN0 = [[-36, -60], [-22, -69], [0, -67], [20, -57], [32, -39], [34, -17], [24, 1], [6, 11], [-4, 27], [2, 45], [18, 56], [36, 52]];
  const LEFT0 = [[48, 42], [56, 26], [56, 8], [51, -6], [46.3, -15.1]];
  const RIGHT0 = [[50, 61], [64, 59], [73, 47], [76, 33]];
  const KNOT = [14, -4];
  const MAIN1 = MAIN0.map((p, i) => i === 0 ? p : i === MAIN0.length - 1 ? [30, 16] : [KNOT[0] + (15 + 7*Math.sin(i*1.7))*Math.cos(i*2.35), KNOT[1] + (13 + 6*Math.cos(i*1.3))*Math.sin(i*2.35)]);
  const LEFT1 = LEFT0.map((p, i) => i === LEFT0.length - 1 ? [30, -4] : [KNOT[0] + 11*Math.cos(i*2.9 + 1), KNOT[1] + 10*Math.sin(i*2.9 + 1)]);
  const RIGHT1 = RIGHT0.map((p, i) => i === RIGHT0.length - 1 ? [43, 22] : [KNOT[0] + 12*Math.cos(i*2.6 + 2.2), KNOT[1] + 11*Math.sin(i*2.6 + 2.2)]);
  const BUDS0 = [{ h: [40, -32], s: [.35, .94], tilt: .35 }, { h: [70, 15], s: [.33, .94], tilt: -.3 }];
  const BUDS1 = [{ h: [22, -19], s: [.6, .8], tilt: .9 }, { h: [37, 6], s: [.42, .9], tilt: -.8 }];
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t];
  // Catmull-Rom through control points (3D), per samples a span
  function spline(ctrl, per = 6){
    const out = [];
    for (let i = 0; i < ctrl.length - 1; i++){ const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      for (let j = 0; j < per; j++){ const t = j/per, t2 = t*t, t3 = t2*t;
        out.push([0, 1, 2].map(k => .5*(2*p1[k] + (-p0[k] + p2[k])*t + (2*p0[k] - 5*p1[k] + 4*p2[k] - p3[k])*t2 + (-p0[k] + 3*p1[k] - 3*p2[k] + p3[k])*t3))); } }
    out.push(ctrl[ctrl.length - 1].slice());
    return out;
  }
  // how high a point of the knot lies: crossings sit on each other
  const knotZ = (i, t) => 1 + t*1.6*(.5 + .5*Math.sin(i*2.9));
  const wiggle = (st, i) => st.wig ? [Math.sin(st.wig*9 + i*1.3)*2.2*Math.sin(Math.PI*st.wigK), Math.cos(st.wig*7 + i*.9)*2*Math.sin(Math.PI*st.wigK)] : [0, 0];
  function earphones(st){
    const t = ease(Math.min(1, Math.max(0, st.tangle))), W = (uv, z) => dk(uv[0], uv[1], BH + z);
    const plugEnd = mp(JACK.a, JACK.b - 15.5, TH/2), plugOut = mp(JACK.a, JACK.b - 22, TH/2 - 1.6);
    const main = [plugEnd, plugOut, ...MAIN0.map((p, i) => { const q = lerp2(p, MAIN1[i], t), w = wiggle(st, i); return W([q[0] + w[0], q[1] + w[1]], i === 0 ? 2.2 : knotZ(i, t)); })];
    const split = main[main.length - 1];
    const buds = BUDS0.map((b, i) => { const h = lerp2(b.h, BUDS1[i].h, t), sd = norm([...lerp2(b.s, BUDS1[i].s, t), 0]), tl = b.tilt + (BUDS1[i].tilt - b.tilt)*t;
      const sw = norm(dkv(sd[0], sd[1], 0)), up = [0, 0, 1], side = cross(up, sw), th = Math.atan(Math.abs(Math.sin(tl))*.9);
      const ax = norm(kAdd(up, kScl(side, Math.sin(tl)*.9)));             // the grille faces up, the bud leans on its rim
      const hc = W(h, 4.2*Math.cos(th) + 7.9*Math.sin(th) + .1);
      const stemA = kAdd(hc, kScl(sw, 7.4)), tip = kAdd(stemA, kScl(sw, 11));
      return { hc, ax, sw, stemA, tip: [tip[0], tip[1], BH + 2.2] }; });
    const left = [split, ...LEFT0.slice(0, -1).map((p, i) => W(lerp2(p, LEFT1[i], t), knotZ(i + 3, t))), buds[0].tip];
    const right = [split, ...RIGHT0.slice(0, -1).map((p, i) => W(lerp2(p, RIGHT1[i], t), knotZ(i + 7, t))), buds[1].tip];
    return { plugEnd, main: spline(main), left: spline(left), right: spline(right), split, buds };
  }
  // a stretch of cable: an ink edge under the white cord, as wide as the real thing (Ø 2 mm)
  // (butt ends: the stretches meet end to end without a seam; where the cable crosses itself, the upper one's edges show)
  const cordSvg = (pts, col = '#f6f5f0') => `<path d="${pd(pts, false)}" fill="none" stroke="${INK}" style="stroke-width:${f(2.9*CAM_K)}" stroke-linejoin="round"/>`
    + `<path d="${pd(pts, false)}" fill="none" stroke="${col}" style="stroke-width:${f(1.9*CAM_K)}" stroke-linejoin="round"/>`;
  function cableItems(pts){
    const items = [];
    for (let i = 0; i < pts.length - 1; i += 4){ const run = pts.slice(i, Math.min(pts.length, i + 5)); if (run.length > 1) items.push({ box: boxAround(run, 1.1), svg: cordSvg(run) }); }
    return items;
  }
  function plugSvg(st){
    const d = mpv(0, -1, 0), o = mp(JACK.a, JACK.b + .3, TH/2);
    return act('plug', coaxOrder(d, [
      { name: 'body', s0: 0, s1: 9, svg: coaxSeg(o, d, { s0: 0, s1: 9, r0: 3, M: BUDC, n: 18, w: .9, shade: toneI }) },
      { name: 'relief', s0: 9, s1: 15.5, svg: coaxSeg(o, d, { s0: 9, s1: 15.5, r0: 2.5, r1: 1.3, M: BUDC, n: 16, w: .8, shade: toneI }) } ]));
  }
  const plugPts = () => [...axisRing(mp(JACK.a, JACK.b, TH/2), mpv(0, -1, 0), 3, 8), ...axisRing(mp(JACK.a, JACK.b - 15.5, TH/2), mpv(0, -1, 0), 1.4, 8)];
  // a bud: grille up, housing in white, a colour ring (L / R), the stem lying along the desk to its cable
  function budSvg(b, i, m, k){
    const { hc, ax } = b, o = kAt(hc, ax, -4.2);
    let s = coaxOrder(ax, [
      { name: 'back', s0: 0, s1: 3.6, svg: coaxSeg(o, ax, { s0: 0, s1: 3.6, r0: 6, r1: 7.9, M: BUDC, n: 24, w: .9, shade: toneI, cap: vis(ax) ? false : undefined }) },
      { name: 'ring', s0: 3.6, s1: 4.6, svg: coaxSeg(o, ax, { s0: 3.6, s1: 4.6, r0: 8.1, M: m, n: 24, w: .7, shade: toneI, cap: false }) },
      { name: 'front', s0: 4.6, s1: 8.4, svg: coaxSeg(o, ax, { s0: 4.6, s1: 8.4, r0: 7.9, r1: 7.6, M: BUDC, n: 24, w: .9, shade: toneI, cap: vis(ax) ? undefined : false }) } ]);
    if (vis(ax)){ const g = axisRing(kAt(o, ax, 8.45), ax, 6.1, 24); s += fill(pd(g), '#3b3d43') + ink(pd(g), .5);
      let holes = ''; for (const [rr, n] of [[1.2, 6], [3.2, 12], [5, 16]]) for (const p of axisRing(kAt(o, ax, 8.5), ax, rr, n)){ const q = P(...p); holes += `M${f(q[0] - .5)} ${f(q[1])}h1`; }
      s += `<path d="${holes}" stroke="#8b8e96" style="stroke-width:${f(.9*CAM_K)}" stroke-linecap="round"/>`; }
    { const n = kScl(b.sw, -1); if (vis(n)) s += txOn(kAdd(kAt(o, ax, 1.6), kScl(n, 7.3)), cross([0, 0, -1], n), n, i ? 'R' : 'L', 2.4, INK, 800); }
    const stem = rod(b.stemA, kAdd(b.stemA, kScl(b.sw, 11)), 2.3, BUDC, toneI, .8, 1.5, 12);
    s = vis(kScl(b.sw, -1)) ? stem + s : s + stem;
    if (k > 0) s = `<g opacity="${f(1 - .75*k)}">${s}</g><g opacity="${f(k)}">${coaxSeg(o, ax, { s0: 2, s1: 4.4, r0: 4.6, M: DARK, n: 18, w: .5, shade: toneI })}${`<g opacity=".7">${coaxSeg(o, ax, { s0: 5.8, s1: 6.4, r0: 6.6, r1: 5.2, M: matOf('#e9d7a8'), n: 18, w: .4, shade: toneI })}</g>`}</g>`;
    return act('bud', s);
  }
  const budPts = b => [...axisRing(kAt(b.hc, b.ax, -4.2), b.ax, 7.9, 10), ...axisRing(kAt(b.hc, b.ax, 4.2), b.ax, 7.6, 10), kAdd(b.stemA, kScl(b.sw, 11))];
  // the lanyard: a black cord loop from the hole at the top corner, lying on the desk, with its toggle bead
  function lanyard(st){
    // on the desk off the player's top corner (in the player's place, not turned over with it), back into the hole
    const dp = (a, b) => [pO[0] + pA[0]*a + pB[0]*b, pO[1] + pA[1]*a + pB[1]*b, BH + .8];
    const h0 = mp(-15.5, -40.5, TH/2), loop = [[-17, -46], [-24, -53], [-35, -55], [-44, -49], [-46, -39], [-40, -32], [-30, -33], [-22, -38]].map(([a, b]) => dp(a, b));
    const pts = spline([h0, ...loop, h0], 4), bead = dp(-45.5, -44);
    return pStroke(pts, INK, f(2.2*CAM_K)) + pStroke(pts, CORD, f(1.2*CAM_K)) + rod(kAdd(bead, [0, -3, .6]), kAdd(bead, [0, 3, .6]), 2.2, matOf('#3d3935'), toneI, .6, 2.2, 10);
  }

  /* ---------- music notes rising from the buds while it plays ---------- */
  function notesSvg(st, buds, m){
    if (st.noteA <= .02) return '';
    let s = '';
    const n = [2, 3, 5][st.vol], big = [.75, 1, 1.35][st.vol];
    buds.forEach((b, i) => { for (let j = 0; j < n; j++){
      const ph = ((st.noteT*.55 + j/n + i*.37) % 1), p = kAdd(b.hc, [Math.sin(ph*6 + j)*6, Math.cos(ph*5 + i)*4, 8 + ph*42]);
      const q = P(...p), sc = CAM_K*big*(.8 + .4*Math.sin(j*1.7)), a = st.noteA*Math.sin(Math.PI*ph);
      const head = `M${f(q[0] - 2.2*sc)} ${f(q[1])}a${f(2.2*sc)} ${f(1.6*sc)} -20 1 0 ${f(4.4*sc)} 0a${f(2.2*sc)} ${f(1.6*sc)} -20 1 0 ${f(-4.4*sc)} 0Z`;
      const stem = `M${f(q[0] + 1.9*sc)} ${f(q[1] - .4*sc)}V${f(q[1] - 8.5*sc)}q${f(1.6*sc)} ${f(2.4*sc)} ${f(3.4*sc)} ${f(3.2*sc)}`;
      s += `<g opacity="${f(a)}"><path d="${head}" fill="${m.l}" stroke="${INK}" style="stroke-width:${f(.5*sc)}"/><path d="${stem}" fill="none" stroke="${INK}" style="stroke-width:${f(.6*sc)}" stroke-linecap="round"/></g>`; } });
    return s;
  }

  /* ---------- scene ---------- */
  const playerPts = () => [...pRR(-PW/2, -PL/2, PW/2, PL/2, PRAD, 0, 2), ...pRR(-PW/2, -PL/2, PW/2, PL/2, PRAD, TH + .9, 2)];
  function scene(st, m){
    pFrame(st);
    const k = ease(st.xr || 0), ep = earphones(st);
    let s = lanyard(st);
    s += castShadow(playerPts(), BH) + castShadow(plugPts(), BH) + ep.buds.map(b => castShadow(budPts(b), BH)).join('');
    let player = playerBody(st, m);
    if (k > 0) player = `<g opacity="${f(1 - .8*k)}">${player}</g><g opacity="${f(k)}">${playerMech(st)}</g>`;
    const items = [{ box: boxAround(playerPts()), svg: player }, { box: boxAround(plugPts(), .5), svg: plugSvg(st) }];
    // the cable on the desk, its split and the buds: all of it the 'cable' to click
    const cab = [...cableItems(ep.main), ...cableItems(ep.left), ...cableItems(ep.right)];
    const yd = norm(sub(ep.left[2], ep.main[ep.main.length - 3])), ys = coaxSeg(kAt(ep.split, yd, -4.5), yd, { s0: 0, s1: 9, r0: 2.4, r1: 2.1, M: BUDC, n: 12, w: .7, shade: toneI });
    cab.push({ box: boxAround([kAt(ep.split, yd, -5), kAt(ep.split, yd, 5)], 2.6), svg: ys });
    for (const c of cab) c.svg = act('cable', c.svg);
    ep.buds.forEach((b, i) => items.push({ box: boxAround(budPts(b), .5), svg: budSvg(b, i, m, k) }));
    s += byDepth([...cab, ...items]);
    s += notesSvg(st, ep.buds, m);
    s += labels(st, k, ep);
    return s;
  }
  function labels(st, k, ep){
    const B = [], busyNow = kBusy(), fu = st.flip < .5;
    if (k > .6) return zhCallouts([
      { at: mp(-6.5, -22.5, 4.9), text: '主控芯片（炬力）', on: st.playing },
      { at: mp(8.5, -24, 4.8), text: '闪存', on: st.playing },
      { at: mp(-12, -8, 5.2), text: '晶振', on: st.on },
      { at: mp(JACK.a, JACK.b + 6, 9.2), text: '耳机插座', on: st.playing },
      { at: mp(-6, -10, 6.5), text: '屏幕排线', on: st.on },
      { at: mp(9.6, PAD.b, 7.5), text: '按键开关', on: !!st.press && st.pressK > .3 },
      { at: mp(16.5, 38.5, 4.6), text: '锂电池', on: false },
      { at: mp(0, PL/2 - 3, 6.8), text: 'USB 接口', on: false },
      { at: kAt(ep.buds[0].hc, ep.buds[0].ax, -1), text: '发声单元', on: st.noteA > .1 } ], B);
    return zhCallouts([
      ...(fu ? [{ at: mp(0, -26, TH), text: '屏幕', on: st.on },
        { at: mp(0, PAD.b, TH + .9), text: '播放 / 暂停', on: st.press === 'play' },
        { at: mp(9.6, PAD.b, TH), text: '上一首 / 下一首', on: st.press === 'next' || st.press === 'prev' },
        { at: mp(0, PAD.b - 9.6, TH), text: '音量', on: st.press === 'up' || st.press === 'down' }] : [{ at: mp(0, -10, 0), text: '背面标签', on: false }]),
      { at: mp(JACK.a, JACK.b - 8, TH/2), text: '耳机插头', on: false },
      { at: ep.main[Math.floor(ep.main.length*.45)], text: '耳机线', on: busyNow === 'tangle' },
      { at: ep.split, text: '分线器', on: false },
      { at: ep.buds[1].hc, text: '耳塞', on: st.noteA > .1 },
      { at: mp(PW/2, -22, 5.75), text: '锁定键', on: false } ], B);
  }

  /* ---------- actions ---------- */
  let ui = ctx.ui;
  const BUSY = { press: '按键还没弹起来', play: '放着呢', tangle: '线还在缠……', untangle: '还在解……别催', flip: '在翻了在翻了' };
  const busy = () => { if (!kBusy()) return false; ui.flash(BUSY[kBusy()] || '等一下'); return true; };
  const pressSeg = (st, key, ms = 170) => ({ ms, start(){ st.press = key; }, step(k){ st.pressK = Math.sin(Math.PI*k); }, end(){ st.pressK = 0; st.press = null; } });
  // a few seconds of playing: the title runs, the time goes on, notes come out of the buds, then they settle
  const playSeg = (st, ms = 3000) => ({ ms, start(){ this.s0 = st.scroll; this.p0 = st.prog; },
    step(k){ st.noteT += .016; st.noteA = Math.min(1, k*5, (1 - k)*4); st.scroll = this.s0 + k*ms/1000*9; st.prog = Math.min(.999, this.p0 + k*ms/1000/SONGS[st.song].len); },
    end(){ st.noteA = 0; } });
  const flipSegs = (st, to) => [{ ms: 200, step(k){ st.lift = 16*ease(k); } }, { ms: 430, start(){ this.f0 = st.flip; }, step(k){ st.flip = this.f0 + (to - this.f0)*ease(k); }, end(){ st.flip = to; } }, { ms: 200, step(k){ st.lift = 16*(1 - ease(k)); }, end(){ st.lift = 0; } }];
  const faceUp = st => st.flip > .5 ? flipSegs(st, 0) : [];
  function play(st){ if (busy()) return;
    const segs = [...faceUp(st)];
    if (st.flip > .5) ui.flash('还扣着呢——先翻过来');
    if (st.playing && st.on) return kPlay(ui, 'press', [...segs, pressSeg(st, 'play'), { ms: 10, end(){ st.playing = false; } }], () => ui.flash('暂停——这首还没听完呢'));
    const sg = SONGS[st.song];
    kPlay(ui, 'play', [...segs, pressSeg(st, 'play'), { ms: 10, end(){ st.on = true; st.playing = true; st.hidden = false; if (st.loop) st.loopN++; } }, playSeg(st)],
      () => ui.flash(st.loop ? `单曲循环第 ${st.loopN} 遍：${sg.who}《${sg.what}》` : `${sg.who}《${sg.what}》——${sg.line}`, 2600));
  }
  function song(st, i){ if (busy()) return;
    const back = i < st.song, n = Math.max(1, Math.abs(i - st.song)), segs = [...faceUp(st)];
    for (let j = 0; j < n; j++) segs.push(pressSeg(st, back ? 'prev' : 'next', 140), { ms: 30, end(){ st.song = (st.song + (back ? -1 : 1) + SONGS.length) % SONGS.length; st.prog = 0; st.scroll = 0; } });
    segs.push({ ms: 10, end(){ st.song = i; st.on = true; st.playing = true; } }, playSeg(st, 2600));
    kPlay(ui, 'play', segs, () => ui.flash(`下一首：${SONGS[i].who}《${SONGS[i].what}》`, 2200));
  }
  function volume(st, v){ if (busy()) return;
    const up = v > st.vol, segs = [...faceUp(st)];
    for (let j = 0; j < Math.abs(v - st.vol); j++) segs.push(pressSeg(st, up ? 'up' : 'down', 150), { ms: 60, start(){ st.volShow = 1; st.on = true; }, end(){ st.vol += up ? 1 : -1; } });
    segs.push({ ms: 900, step(k){ st.volShow = 1 - k*k; if (st.playing){ st.noteT += .016; st.noteA = Math.min(1, k*5, (1 - k)*3); } }, end(){ st.volShow = 0; st.noteA = 0; } });
    kPlay(ui, 'press', segs, () => ui.flash(v === 2 ? '开到最大——同桌都跟着哼起来了' : v === 0 ? '小声点，别被前排听见' : '正好', 2200));
  }
  // the cable ties itself into a knot (a pocket's work) / is picked loose again, slowly
  function tangle(st){ if (busy()) return;
    if (st.tangle > .5) return ui.flash('已经缠成一团了，还要怎样');
    kPlay(ui, 'tangle', [{ ms: 1300, start(){ st.wig = 0; }, step(k){ st.tangle = k; st.wig += .05; st.wigK = k; }, end(){ st.tangle = 1; st.wig = 0; } }],
      () => ui.flash('在口袋里放了一秒，拿出来就成这样了', 2400));
  }
  function untangle(st){ if (busy()) return;
    if (st.tangle < .5) return ui.flash('线是顺的，没打结');
    kPlay(ui, 'untangle', [{ ms: 2600, start(){ st.wig = 0; }, step(k){ st.tangle = 1 - ease(k)*(1 - .08*Math.sin(k*5*Math.PI)); st.wig += .045; st.wigK = k; }, end(){ st.tangle = 0; st.wig = 0; } }],
      () => ui.flash('解了半节课，终于解开了', 2400));
  }
  // the teacher comes down the aisle: stop it, screen off, turn it face down; again: they have gone, turn it back
  function teacher(st){ if (busy()) return;
    if (st.flip > .5) return kPlay(ui, 'flip', [...flipSegs(st, 0), { ms: 10, end(){ st.on = true; } }], () => ui.flash('老师走了——翻回来接着听', 2000));
    kPlay(ui, 'flip', [{ ms: 60, end(){ st.playing = false; st.on = false; st.noteA = 0; st.hidden = true; } }, ...flipSegs(st, 1)], () => ui.flash('嘘——老师来了，赶紧扣过来', 2200));
  }
  function repeat(st){ if (busy()) return;
    kPlay(ui, 'press', [...faceUp(st), pressSeg(st, 'menu'), { ms: 10, end(){ st.loop = !st.loop; st.on = true; if (st.loop) st.loopN = Math.max(st.loopN, 99); } }],
      () => ui.flash(st.loop ? `单曲循环开了——这首已经听了 ${st.loopN} 遍，还是好听` : '取消单曲循环——换换口味', 2400));
  }

  const __cfg = ({
    fig:'20', turn:'full', title:'MP3', palette:'cobalt',
    state:{ flip: 0, lift: 0, on: false, playing: false, song: 0, vol: 1, volShow: 0, scroll: 0, prog: .32, tangle: 0, wig: 0, wigK: 0,
      noteT: 0, noteA: 0, press: null, pressK: 0, loop: false, loopN: 98, hidden: false, hold: false },
    scene,
    stats: st => [ { label:'正在放', value: `${SONGS[st.song].what}` }, { label:'音量', value: ['小', '中', '大'][st.vol], small: true } ],
    buttons:[
      { label:'播放 / 暂停', onClick: play },
      { label:'换一首', choices: st => SONGS.map((sg, i) => ({ label: `${sg.who} - ${sg.what}`, current: i === st.song && st.playing, onClick: st => song(st, i) })) },
      { label:'音量', choices: st => ['小声', '正常', '最大'].map((lb, i) => ({ label: lb, current: i === st.vol, onClick: st => volume(st, i) })) },
      { label:'单曲循环', onClick: repeat },
      { label:'耳机线', choices: st => [
        { label:'缠成一团', onClick: tangle, disabled: st.tangle > .5, why:'已经缠成一团了' },
        { label:'解开', onClick: untangle, disabled: st.tangle < .5, why:'线是顺的' } ] },
      { label:'老师来了', onClick: teacher },
    ],
    acts:{ play: st => play(st), next: st => song(st, (st.song + 1) % SONGS.length), prev: st => song(st, (st.song + SONGS.length - 1) % SONGS.length),
      up: st => volume(st, Math.min(2, st.vol + 1)), down: st => volume(st, Math.max(0, st.vol - 1)), menu: st => repeat(st),
      screen: st => play(st), cable: st => (st.tangle > .5 ? untangle(st) : tangle(st)), back: st => teacher(st), bud: st => play(st), plug: () => ui.flash('插得好好的，别拔') },
    params:(st, q) => {
      if (q.get('on') === '1'){ st.on = true; st.playing = true; }
      if (q.has('song')) st.song = +q.get('song') % SONGS.length;
      if (q.has('tangle')) st.tangle = +q.get('tangle');
      if (q.has('flip')) st.flip = +q.get('flip');
      if (q.has('notes')){ st.noteA = 1; st.noteT = +q.get('notes'); }
    },
  });

  return ctx.adapt(__cfg, { seeThrough: true });
}
