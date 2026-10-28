// The stationery the interface is made of, drawn like the things on the desk (see art/kit.ts): fine ink
// contours, clean flat colour in three tones, hatching in each material's deep tone, solid cobalt shadows from
// the one light (upper left). The desk objects in the corners have height and lean away from the middle of
// the screen like everything else on the desk, so they show the sides that face it. Static SVG, no filters.
import { blob, castShadow, cylinder, f, hatch, hullShadow, INK, P, poly, prism, rot, Rng, SHADOW, SUN, type Tone, type V } from '../art/kit';

const SH = `fill="${SHADOW}"`;
const wrap = (vb: string, body: string, cls = '') =>
  `<svg class="ico ${cls}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
const line = (d: string, w = 0.6, o = 0.55, c = INK) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-opacity="${o}" stroke-linecap="round"/>`;
const shape = (d: string, fill: string, w = 1.1, extra = '') => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" ${extra}/>`;
const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const seg = (a: [number, number], b: [number, number], w: number, c = INK, o = 1) => `<path d="M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}" stroke="${c}" stroke-width="${w}"${o < 1 ? ` stroke-opacity="${o}"` : ''} stroke-linecap="round"/>`;
const rect = (cx: number, cy: number, w: number, h: number, deg = 0): Array<[number, number]> =>
  rot([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], deg).map(([x, y]) => [x + cx, y + cy]);

/** Where the desk objects sit: top left (envelope, books), top right (lamp, notes, folder). */
const LEAN_TL: V = { x: -0.34, y: -0.22 };
const LEAN_TR: V = { x: 0.32, y: -0.24 };

/** A hexagonal pencil lying along x, tip at the right. Height 2·r around y = cy. */
function pencilBody(x0: number, x1: number, cy: number, r: number, paint: Tone, rng: Rng, label = '') {
  const e1 = x0 + r * 1.7, fe1 = e1 + r * 1.6, cone0 = x1 - r * 3.1, tip0 = x1 - r * 1.25;
  const top = cy - r, bot = cy + r, a = cy - r / 3, b2 = cy + r / 3;
  let s = `<path d="M${f(x0 + 3)} ${f(bot + 2.4)}H${f(cone0)}L${f(x1 + 2)} ${f(cy + 2.6)}L${f(cone0)} ${f(bot + 3.6)}H${f(x0 + 4)}Z" ${SH}/>`;
  // eraser
  s += shape(`M${f(x0 + 2)} ${f(top + 0.8)}H${f(e1)}V${f(bot - 0.8)}H${f(x0 + 2)}Q${f(x0)} ${f(bot - 0.8)} ${f(x0)} ${f(cy + r * 0.5)}V${f(cy - r * 0.5)}Q${f(x0)} ${f(top + 0.8)} ${f(x0 + 2)} ${f(top + 0.8)}Z`, P.blush.m);
  s += `<path d="M${f(x0 + 1.5)} ${f(top + 1.6)}H${f(e1)}V${f(a)}H${f(x0 + 1)}Z" fill="${P.blush.l}"/>`;
  s += `<path d="M${f(x0 + 1.5)} ${f(b2)}H${f(e1)}V${f(bot - 1.4)}H${f(x0 + 1.5)}Z" fill="${P.blush.d}"/>`;
  // ferrule
  s += shape(`M${f(e1)} ${f(top - 0.3)}H${f(fe1)}V${f(bot + 0.3)}H${f(e1)}Z`, P.metal.m);
  s += `<path d="M${f(e1)} ${f(top)}H${f(fe1)}V${f(a)}H${f(e1)}Z" fill="${P.metal.l}"/>`;
  s += `<path d="M${f(e1)} ${f(b2)}H${f(fe1)}V${f(bot)}H${f(e1)}Z" fill="${P.metal.d}"/>`;
  for (let i = 1; i < 5; i++) s += line(`M${f(e1 + ((fe1 - e1) * i) / 5)} ${f(top)}V${f(bot)}`, i % 2 ? 0.55 : 0.35, 0.7);
  // painted body: three facets, the lower one hatched in the paint's deep tone
  s += `<path d="M${f(fe1)} ${f(top)}H${f(cone0)}V${f(a)}H${f(fe1)}Z" fill="${paint.l}"/>`;
  s += `<path d="M${f(fe1)} ${f(a)}H${f(cone0)}V${f(b2)}H${f(fe1)}Z" fill="${paint.m}"/>`;
  const low = `M${f(fe1)} ${f(b2)}H${f(cone0)}V${f(bot)}H${f(fe1)}Z`;
  s += `<path d="${low}" fill="${paint.d}"/>` + hatch(low, [fe1, b2, cone0 - fe1, bot - b2], { gap: 1.7, angle: 62, opacity: 0.45, width: 0.4, color: paint.dd, rng });
  s += line(`M${f(fe1)} ${f(a)}H${f(cone0)}M${f(fe1)} ${f(b2)}H${f(cone0)}`, 0.45, 0.6, paint.dd);
  if (label) s += `<text x="${f(fe1 + 6)}" y="${f(cy + 1.9)}" font-family="'Architects Daughter', sans-serif" font-size="${f(r * 0.62)}" letter-spacing=".6" fill="${paint.dd}">${label}</text>`;
  // sharpened wood, scalloped paint edge, graphite
  s += `<path d="M${f(cone0)} ${f(top)}L${f(tip0)} ${f(cy - r * 0.36)}V${f(cy + r * 0.36)}L${f(cone0)} ${f(bot)}Z" fill="${P.wood.l}"/>`;
  s += `<path d="M${f(cone0)} ${f(b2)}L${f(tip0)} ${f(cy + r * 0.1)}V${f(cy + r * 0.36)}L${f(cone0)} ${f(bot)}Z" fill="${P.wood.m}"/>`;
  s += `<path d="M${f(cone0)} ${f(top)}Q${f(cone0 + r * 0.9)} ${f(top + r * 0.35)} ${f(cone0 + r * 0.25)} ${f(a)}Q${f(cone0 + r * 0.95)} ${f(cy)} ${f(cone0 + r * 0.25)} ${f(b2)}Q${f(cone0 + r * 0.9)} ${f(bot - r * 0.35)} ${f(cone0)} ${f(bot)}Z" fill="${paint.m}" stroke="${INK}" stroke-width=".6" stroke-opacity=".8"/>`;
  s += shape(`M${f(tip0)} ${f(cy - r * 0.38)}L${f(x1)} ${f(cy)}L${f(tip0)} ${f(cy + r * 0.38)}Z`, P.graphite, 0.8);
  s += line(`M${f(tip0 + 1)} ${f(cy - r * 0.16)}L${f(x1 - 1.5)} ${f(cy - 0.2)}`, 0.7, 0.6, '#fff');
  s += shape(`M${f(x0 + 2)} ${f(top + 0.8)}H${f(e1)}V${f(top)}H${f(cone0)}L${f(x1)} ${f(cy)}L${f(cone0)} ${f(bot)}H${f(e1)}V${f(bot - 0.8)}H${f(x0 + 2)}Q${f(x0)} ${f(bot - 0.8)} ${f(x0)} ${f(cy + r * 0.5)}V${f(cy - r * 0.5)}Q${f(x0)} ${f(top + 0.8)} ${f(x0 + 2)} ${f(top + 0.8)}Z`, 'none', 1.15);
  return s;
}

/** Writing tools on the scratch paper. The tip sits at the svg's bottom-left corner (0, H). */
export function penSvg(kind: 'ballpoint' | 'pencil'): string {
  const rng = new Rng(kind === 'pencil' ? 5 : 9);
  if (kind === 'pencil') {
    // drawn lying along x, then turned so the point lands on (0, 60) with the lit facet towards the light
    return wrap('0 0 60 60', `<g transform="translate(1 59) rotate(135) scale(1 -1) translate(-84 0)">${pencilBody(0, 84, 0, 5.2, P.mustard, rng)}</g>`, 'pen pencil');
  }
  // my pen: a cobalt fountain pen with a brass nib, the same blue as my ink
  const body = `<g transform="translate(1 59) rotate(-45)">
    <path d="M13 4.2L22 5.4H74Q80 5.4 81 0L13 -4.2L4 -2.2L0 0Z" ${SH} transform="translate(-.5 3.3)"/>
    ${shape('M13 -4.2L22 -5.4H74Q80 -5.4 81 0Q80 5.4 74 5.4H22L13 4.2Z', P.cobalt.m, 1.1)}
    <path d="M22 -5.2H74Q79 -5.2 80.4 -2H22Z" fill="${P.cobalt.l}"/>
    <path d="M22 2.2H80.4Q79 5.2 74 5.2H22Z" fill="${P.cobalt.d}"/>
    ${line('M24 -3.6H70', 0.9, 0.9, '#fff')}
    ${shape('M44 -5.8H48V5.8H44Z', P.brass.m, 0.8)}
    ${shape('M50 -1.6H76L78 0L76 1.6H50Z', P.brass.l, 0.7)}
    ${shape('M13 -4.2L4 -2.2L0 0L4 2.2L13 4.2Z', P.brass.m, 0.9)}
    <path d="M13 -4L4 -2.1L1.5 -.6H13Z" fill="${P.brass.l}"/>
    ${line('M1.5 0H9', 0.5, 0.9)}<circle cx="8.5" cy="0" r=".9" fill="${INK}"/>
  </g>`;
  return wrap('0 0 60 60', body, 'pen ballpoint');
}

const rngI = new Rng(21);

/* ---------- the desk objects in the corners, with height ---------- */

function envelopeIcon() {
  const lean = LEAN_TL, H = 2.5;
  const foot = rect(30, 32, 52, 36, -2);
  let s = castShadow(hullShadow(foot, H + 2));
  const env = prism({ pts: foot, z1: H, lean, tone: { l: '#fbf3df', m: '#f1e3c2', d: '#d9c193', dd: '#a88d5c' }, top: '#f6ebd2', rng: rngI, stroke: 1.1 });
  s += env.svg;
  const [a, b, c, d] = env.topPts;   // top-left, top-right, bottom-right, bottom-left (clockwise)
  const mid: [number, number] = lerp(lerp(a, b, 0.5), lerp(d, c, 0.5), 0.55);
  s += `<path d="${poly([d, mid, c])}" fill="#ead9b4" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>`;
  s += hatch(poly([d, mid, c]), [0, 0, 64, 64], { gap: 1.8, angle: 30, opacity: 0.35, width: 0.4, color: '#a88d5c', rng: rngI });
  s += `<path d="${poly([a, mid, b])}" fill="#fbf4e2" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>`;
  s += seg(lerp(a, mid, 0.08), lerp(a, mid, 0.55), 0.6, '#fff', 0.9);
  // wax seal where the flap meets
  const [sx, sy] = mid;
  s += `<path d="M${f(sx + 2.5)} ${f(sy + 2.5)}m-6.4 0a6.4 6 0 1 0 12.8 0a6.4 6 0 1 0 -12.8 0Z" ${SH}/>`;
  s += `<path d="${blobSeal(sx, sy)}" fill="${P.tomato.m}" stroke="${INK}" stroke-width=".9"/>`;
  s += `<path d="M${f(sx - 3.6)} ${f(sy - 1.4)}A4.4 4.4 0 0 1 ${f(sx + 0.6)} ${f(sy - 4.2)}" fill="none" stroke="${P.tomato.l}" stroke-width="1.2" stroke-linecap="round"/>`;
  s += `<path d="M${f(sx - 2.4)} ${f(sy + 0.4)}L${f(sx - 0.4)} ${f(sy + 2.4)}L${f(sx + 3)} ${f(sy - 2)}" fill="none" stroke="#fde7dc" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return wrap('0 0 64 64', s);
}
function blobSeal(cx: number, cy: number) {
  let d = '';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 6.2 + (i % 2 ? 0.9 : 0) + Math.sin(i * 2.3) * 0.4;
    d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * r) + ' ' + f(cy + Math.sin(a) * r * 0.94);
  }
  return d + 'Z';
}

function booksIcon() {
  const lean = LEAN_TL;
  const books: Array<{ c: [number, number]; w: number; h: number; deg: number; tone: Tone }> = [
    { c: [31, 41], w: 50, h: 30, deg: 2, tone: P.cobalt },
    { c: [32, 37], w: 44, h: 28, deg: -3, tone: P.tomato },
    { c: [31, 34], w: 40, h: 26, deg: 4, tone: P.mint },
  ];
  const T = 6;
  let s = castShadow(hullShadow(rect(31, 40, 50, 32, 0), 13));
  books.forEach((bk, i) => {
    const foot = rect(bk.c[0], bk.c[1], bk.w, bk.h, bk.deg);
    const z0 = i * T, z1 = z0 + T;
    const p = prism({
      pts: foot, z0, z1, lean, tone: { l: P.paper, m: '#f3ead6', d: '#e2d3b2', dd: '#b39f78' }, top: null, rng: rngI, stroke: 1,
      sideDetail: (face) => {
        // the covers at the bottom and top of each edge, the page block between
        const band = (t0: number, t1: number, fill: string) => `<path d="${poly([lerp(face[0], face[3], t0), lerp(face[1], face[2], t0), lerp(face[1], face[2], t1), lerp(face[0], face[3], t1)])}" fill="${fill}"/>`;
        let x = band(0, 0.2, bk.tone.dd) + band(0.8, 1, bk.tone.d);
        x += seg(lerp(face[0], face[3], 0.5), lerp(face[1], face[2], 0.5), 0.35, '#b39f78', 0.9);
        return x;
      },
    });
    s += p.svg;
    const tp = p.topPts;
    s += `<path d="${poly(tp)}" fill="${bk.tone.m}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`;
    s += `<path d="${poly([tp[0], tp[1], lerp(tp[1], tp[2], 0.22), lerp(tp[0], tp[3], 0.22)])}" fill="${bk.tone.l}"/>`;
    // the spine edge with its two raised bands
    s += seg(lerp(tp[0], tp[1], 0.14), lerp(tp[3], tp[2], 0.14), 0.7, bk.tone.dd, 0.8);
    if (i === books.length - 1) {
      const lab = [lerp(lerp(tp[0], tp[1], 0.34), lerp(tp[3], tp[2], 0.34), 0.32), lerp(lerp(tp[0], tp[1], 0.82), lerp(tp[3], tp[2], 0.82), 0.32), lerp(lerp(tp[0], tp[1], 0.82), lerp(tp[3], tp[2], 0.82), 0.66), lerp(lerp(tp[0], tp[1], 0.34), lerp(tp[3], tp[2], 0.34), 0.66)] as Array<[number, number]>;
      s += `<path d="${poly(lab)}" fill="${P.paper}" stroke="${INK}" stroke-width=".6"/>`;
      for (const t of [0.36, 0.64]) s += seg(lerp(lerp(lab[0], lab[3], t), lerp(lab[1], lab[2], t), 0.14), lerp(lerp(lab[0], lab[3], t), lerp(lab[1], lab[2], t), t < 0.5 ? 0.84 : 0.6), 0.5, bk.tone.dd, 0.8);
    }
  });
  return wrap('0 0 64 64', s);
}

/** The reading lamp, drawn in a three-quarter view so it reads at icon size: weighted base, two sprung arms,
 *  a conical shade whose mouth glows when the AI is thinking (`.lamp-bulb`). */
// reading glasses, folded on the desk: the reading light (blur, brightness) and the quiet mode
function glassesIcon() {
  let s = '';
  s += `<path d="M5 47Q7 43 18 43Q26 43 30 47Q34 43 45 43Q57 43 59 48Q59 54 46 55Q36 55 32 50Q28 55 18 55Q5 55 5 47Z" ${SH}/>`;
  // the temples, folded back behind the lenses
  s += `<path d="M7.5 31L20 22.5M56.5 31L44 22" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;
  s += `<path d="M7.5 31L20 22.5M56.5 31L44 22" fill="none" stroke="${P.tomato.m}" stroke-width="1.8" stroke-linecap="round"/>`;
  for (const cx of [19, 45]) {
    s += `<circle cx="${cx}" cy="36.5" r="11.6" fill="#d8ecf2" fill-opacity=".9" stroke="${INK}" stroke-width="3.4"/>`;
    s += `<circle cx="${cx}" cy="36.5" r="11.6" fill="none" stroke="${P.tomato.m}" stroke-width="1.7"/>`;
    s += `<path d="M${cx - 6.5} 32Q${cx - 3.5} 28 ${cx + 1.5} 27.6" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" opacity=".95"/>`;
  }
  s += `<path d="M29.6 34.6Q32 30.8 34.4 34.6" fill="none" stroke="${INK}" stroke-width="3.3" stroke-linecap="round"/>`;
  s += `<path d="M29.6 34.6Q32 30.8 34.4 34.6" fill="none" stroke="${P.tomato.m}" stroke-width="1.6" stroke-linecap="round"/>`;
  return wrap('0 0 64 64', s);
}

// the papers read so far, in a little pile like the piles on the desk (the shelf you can pick another paper from
// while reading): loose sheets a little askew, the top one a paper's first page
function papersIcon() {
  const lean = LEAN_TL, T = 1.7;
  const sheets: Array<{ c: [number, number]; deg: number; tint: string }> = [
    { c: [30.5, 38], deg: 8, tint: '#f6f1e3' },
    { c: [33.5, 36], deg: -6, tint: '#fbf8ef' },
    { c: [30, 34.5], deg: 3, tint: '#fffdf6' },
    { c: [32, 33], deg: -2.5, tint: P.paper },
  ];
  let s = castShadow(hullShadow(rect(31.5, 35.5, 44, 50, 1), sheets.length * T + 1.5));
  sheets.forEach((sh, i) => {
    const last = i === sheets.length - 1;
    const p = prism({ pts: rect(sh.c[0], sh.c[1], 36, 46, sh.deg), z0: i * T, z1: (i + 1) * T, lean, tone: { l: sh.tint, m: '#efe7d3', d: '#ddcfae', dd: '#b39f78' }, top: sh.tint, rng: rngI, stroke: last ? 1.1 : 0.8 });
    s += p.svg;
    if (!last) return;
    // the first page: a title, the authors, two columns of text with a figure in the right one
    const [a, b, c, d] = p.topPts;
    const at = (u: number, v: number) => lerp(lerp(a, b, u), lerp(d, c, u), v);
    s += seg(at(0.17, 0.12), at(0.83, 0.12), 2.1, INK, 0.85);
    s += seg(at(0.3, 0.2), at(0.7, 0.2), 0.9, INK, 0.45);
    for (let k = 0; k < 7; k++) {
      const v = 0.31 + k * 0.085;
      s += seg(at(0.12, v), at(k === 6 ? 0.34 : 0.46, v), 0.7, INK, 0.32);
      if (k > 2) s += seg(at(0.54, v), at(k === 6 ? 0.74 : 0.88, v), 0.7, INK, 0.32);
    }
    const fig = [at(0.54, 0.29), at(0.88, 0.29), at(0.88, 0.5), at(0.54, 0.5)];
    s += `<path d="${poly(fig)}" fill="#eef3fb" stroke="${INK}" stroke-width=".55" stroke-linejoin="round"/>`;
    [0.35, 0.55, 0.42, 0.7].forEach((hgt, k) => {
      const u0 = 0.59 + k * 0.07, base = 0.47;
      s += `<path d="${poly([at(u0, base), at(u0 + 0.045, base), at(u0 + 0.045, base - hgt * 0.15), at(u0, base - hgt * 0.15)])}" fill="${k % 2 ? P.cobalt.m : P.tomato.m}"/>`;
    });
  });
  return wrap('0 0 64 64', s);
}

function lampIcon() {
  let s = '';
  // its shadow on the desk, falling to the lower right
  s += `<path d="M10 56Q10 52 24 52Q38 52 40 55L58 61Q60 63 52 63L18 63Q10 62 10 56Z" ${SH}/>`;
  s += `<path d="M28 54L46 60L52 50L58 52" fill="none" stroke="${SHADOW}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  // base
  s += shape('M7 55Q7 49.5 22 49.5Q37 49.5 37 55Q37 60 22 60Q7 60 7 55Z', P.dark.d, 1.1);
  s += shape('M7.5 53.5Q7.5 48.5 22 48.5Q36.5 48.5 36.5 53.5Q36.5 57.8 22 57.8Q7.5 57.8 7.5 53.5Z', P.dark.m, 1);
  s += `<path d="M11.5 52Q16 50 23 50" fill="none" stroke="${P.dark.l}" stroke-width="1.4" stroke-linecap="round"/>`;
  // arms
  const arm = 'M22 52L15 31L34 17';
  s += `<path d="${arm}" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += `<path d="${arm}" fill="none" stroke="${P.metal.m}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += `<path d="M21.4 50.2L15.2 31.6M15.6 30.4L33 17.6" fill="none" stroke="#fff" stroke-width=".7" stroke-linecap="round" transform="translate(-.6 -.4)"/>`;
  s += `<path d="M18 46L13.6 36M14.6 34L24.4 27" fill="none" stroke="${INK}" stroke-width=".8" stroke-dasharray="1.2 1.1"/>`;
  for (const [x, y] of [[15, 31], [34, 17], [22, 51.6]]) s += `<circle cx="${x}" cy="${y}" r="2.7" fill="${P.metal.l}" stroke="${INK}" stroke-width=".9"/>`;
  // shade: a cone tilted down towards the desk, lit on top, its far wall seen inside the mouth
  s += shape('M31.5 12.5L45 4.5Q52 3 56.5 9.5Q60.5 16 57 24.5L42.5 24Q35 20.5 31.5 12.5Z', P.tomato.m, 1.1);
  s += `<path d="M33.5 12L45.5 5.6Q50.6 4.6 54 8.6L37.5 17.2Q34.8 15 33.5 12Z" fill="${P.tomato.l}"/>`;
  s += hatch('M42.5 24Q37.5 21.5 35.5 18L56.5 16.5Q58 20.5 57 24.5Z', [34, 15, 25, 11], { gap: 1.6, angle: 40, opacity: 0.5, width: 0.45, color: P.tomato.dd, rng: rngI });
  s += `<ellipse cx="50" cy="24.4" rx="7.6" ry="2.9" transform="rotate(4 50 24.4)" fill="${P.tomato.d}" stroke="${INK}" stroke-width="1"/>`;
  s += `<ellipse class="lamp-bulb" cx="50" cy="24.6" rx="5" ry="1.9" transform="rotate(4 50 24.6)" fill="#fbefd0"/>`;
  s += `<circle cx="34" cy="17" r="1.3" fill="${INK}"/>`;
  return wrap('0 0 64 64', s);
}

function stickyIcon() {
  const lean = LEAN_TR, H = 5;
  const foot = rect(30, 32, 44, 44, -3);
  let s = castShadow(hullShadow(foot, H + 1));
  const pad = prism({
    pts: foot, z1: H, lean, tone: P.mustard, top: null, rng: rngI, stroke: 1,
    sideDetail: (face) => [0.33, 0.66].map((t) => seg(lerp(face[0], face[3], t), lerp(face[1], face[2], t), 0.4, P.mustard.dd, 0.6)).join(''),
  });
  s += pad.svg;
  const [a, b, c, d] = pad.topPts;
  const k = 0.22;
  const cc1 = lerp(c, b, k), cc2 = lerp(c, d, k);
  s += `<path d="${poly([a, b, cc1, cc2, d])}" fill="${P.mustard.l}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`;
  s += `<path d="${poly([a, b, lerp(b, c, 0.16), lerp(a, d, 0.16)])}" fill="${P.mustard.m}"/>`;
  s += `<path d="${poly([cc1, cc2, lerp(lerp(cc1, cc2, 0.5), c, -0.9)])}" fill="#fff1c4" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>`;
  for (let i = 0; i < 3; i++) {
    const t = 0.36 + i * 0.17;
    const p0 = lerp(lerp(a, d, t), lerp(b, c, t), 0.12), p1 = lerp(lerp(a, d, t), lerp(b, c, t), i === 2 ? 0.52 : 0.8);
    s += `<path d="M${f(p0[0])} ${f(p0[1])}Q${f((p0[0] + p1[0]) / 2)} ${f((p0[1] + p1[1]) / 2 - 1.4)} ${f(p1[0])} ${f(p1[1])}" fill="none" stroke="#2a4a9e" stroke-width="1.1" stroke-linecap="round"/>`;
  }
  return wrap('0 0 64 64', s);
}

function folderIcon() {
  const lean = LEAN_TR, H = 3;
  const foot = rect(31, 34, 50, 38, 2);
  let s = castShadow(hullShadow(foot, H + 2));
  const back = prism({ pts: foot, z1: 1.5, lean, tone: { l: '#f2cf8f', m: '#e3b86c', d: '#b98a44', dd: '#7f5a25' }, top: '#e3b86c', rng: rngI, stroke: 1 });
  s += back.svg;
  // papers peeking out, then the front flap with its tab
  const [a, b, c, d] = back.topPts;
  const pa = lerp(a, d, -0.12), pb = lerp(b, c, -0.1);
  s += `<path d="${poly([lerp(pa, pb, 0.08), lerp(pa, pb, 0.86), lerp(lerp(b, c, 0.4), lerp(a, d, 0.4), 0.14), lerp(lerp(a, d, 0.4), lerp(b, c, 0.4), 0.08)])}" fill="${P.paper}" stroke="${INK}" stroke-width=".7"/>`;
  s += seg(lerp(lerp(pa, pb, 0.08), lerp(a, d, 0.4), 0.3), lerp(lerp(pa, pb, 0.7), lerp(b, c, 0.4), 0.3), 0.5, '#a88d5c', 0.8);
  const front = prism({ pts: rect(31, 38, 50, 30, 2), z0: 1.5, z1: H, lean, tone: { l: '#f8dba4', m: '#efca85', d: '#c9994f', dd: '#8a6328' }, top: '#f4d395', rng: rngI, stroke: 1.1 });
  s += front.svg;
  const ft = front.topPts;
  s += seg(lerp(ft[0], ft[3], 0.1), lerp(ft[1], ft[2], 0.1), 0.7, '#fff', 0.8);
  const [cx, cy] = lerp(lerp(ft[0], ft[1], 0.5), lerp(ft[3], ft[2], 0.5), 0.55);
  s += `<path d="M${f(cx)} ${f(cy + 7)}V${f(cy - 6)}M${f(cx - 5.4)} ${f(cy - 0.6)}L${f(cx)} ${f(cy - 6.2)}L${f(cx + 5.4)} ${f(cy - 0.6)}" fill="none" stroke="${P.tomato.d}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return wrap('0 0 64 64', s);
}

export const ICONS = {
  pencil: wrap('0 0 120 30', pencilBody(4, 114, 14, 7.2, P.mustard, rngI, 'HB · 2')),

  highlighter: wrap('0 0 120 30', `
    <path d="M9 23.5H96L112 19.5V25L96 27.5H9Z" ${SH}/>
    ${shape('M8 6.5Q4 6.5 4 10.5V18.5Q4 22.5 8 22.5H70V6.5Z', P.mint.m)}
    <path d="M8 7.5H70V11H5Q5.5 7.5 8 7.5Z" fill="${P.mint.l}"/>
    <path d="M5 18H70V21.5H8Q5.5 21.5 5 18Z" fill="${P.mint.d}"/>
    ${hatch('M5 18H70V21.5H8Q5.5 21.5 5 18Z', [4, 17, 67, 6], { gap: 1.6, angle: 60, opacity: 0.45, width: 0.4, color: P.mint.dd, rng: rngI })}
    ${shape('M12 10.5H58V18.5H12Z', P.paper, 0.6)}
    <text x="35" y="16.4" text-anchor="middle" font-family="'Architects Daughter', sans-serif" font-size="5" letter-spacing=".7" fill="${P.mint.dd}">TEXT·MARK</text>
    ${shape('M70 5.5H96Q100 5.5 100 9.5V19.5Q100 23.5 96 23.5H70Z', P.mint.d)}
    <path d="M71 6.5H96Q99 6.5 99 9.5V10H71Z" fill="${P.mint.m}"/>
    ${line('M74 5.5V23.5', 0.6, 0.6)}
    ${shape('M100 9.5L108 10.5V18.5L100 19.5Z', P.graphite, 0.9)}
    ${shape('M108 10.5L114.5 12.5V17L108 18.5Z', '#e8f59a', 0.8)}`),

  scissors: wrap('0 0 120 34', `
    <path d="M14 27Q22 33 34 28L52 23L115 22L56 30Q30 36 14 30Z" ${SH}/>
    ${shape('M50 14.2L112 7.2Q116 7 114.4 9.6L57 20.5Z', P.metal.l, 1)}
    ${line('M56 16.2L110 9', 0.5, 0.5)}
    ${shape('M50 19.8L112 26.8Q116 27 114.4 24.4L57 13.5Z', P.metal.m, 1)}
    ${line('M60 20.6L108 25.6', 0.5, 0.45)}
    ${shape('M34 12.5Q40 13 50 14.5L50 19.5Q40 21 34 21.5Z', P.metal.d, 0.9)}
    ${shape(`M22 2.6C31 2.6 37 6.4 37 10.6C37 14.8 31 18 22 18C13 18 7 14.8 7 10.6C7 6.4 13 2.6 22 2.6Z M22 6.6C16.5 6.6 13 8.4 13 10.4C13 12.4 16.5 14.2 22 14.2C27.5 14.2 31 12.4 31 10.4C31 8.4 27.5 6.6 22 6.6Z`, P.tomato.m, 1.1, 'fill-rule="evenodd"')}
    <path d="M10 8.6C12 5.4 17 3.8 22 3.8C27 3.8 31.5 5.4 34 8" fill="none" stroke="${P.tomato.l}" stroke-width="1.6" stroke-linecap="round"/>
    ${shape(`M22 16C31 16 37 19.6 37 23.8C37 28 31 31.4 22 31.4C13 31.4 7 28 7 23.8C7 19.6 13 16 22 16Z M22 20C16.5 20 13 21.8 13 23.8C13 25.8 16.5 27.6 22 27.6C27.5 27.6 31 25.8 31 23.8C31 21.8 27.5 20 22 20Z`, P.tomato.d, 1.1, 'fill-rule="evenodd"')}
    <circle cx="53" cy="17" r="2.9" fill="${P.brass.m}" stroke="${INK}" stroke-width=".8"/>${line('M51.4 17H54.6', 0.6, 0.9)}`),

  eraser: wrap('0 0 120 34', `
    <path d="M20 26H104L108 30H24Z" ${SH}/>
    ${shape('M22 6.5H98Q104 6.5 104 12.5V21.5Q104 26.5 98 26.5H22Q16 26.5 16 21.5V12Q16 6.5 22 6.5Z', P.ceramic.l)}
    <path d="M17 19H103V21.5Q103 25.5 98 25.5H22Q17 25.5 17 21.5Z" fill="${P.ceramic.d}"/>
    ${shape('M44 5.5H82V27.5H44Z', P.cobalt.m, 1)}
    <path d="M44.5 6H81.5V10H44.5Z" fill="${P.cobalt.l}"/>
    <path d="M44.5 22H81.5V27H44.5Z" fill="${P.cobalt.d}"/>
    <text x="63" y="18.6" text-anchor="middle" font-family="'Architects Daughter', sans-serif" font-size="7.2" letter-spacing="1.6" fill="#fdfbf3">SOFT</text>
    ${[[108, 12, 1.4], [111, 20, 1.1], [114, 15, 0.9]].map(([x, y, r]) => shape(blob(x, y, r, rngI, 5), P.ceramic.m, 0.45)).join('')}`),

  magnifier: wrap('0 0 64 64', `
    <path d="M36 42L53 60L59 56L42 38Z" ${SH}/>
    <circle cx="28.5" cy="29.5" r="18.5" fill="${SHADOW}" fill-opacity=".3" stroke="${SHADOW}" stroke-width="4.6"/>
    ${shape('M36 37L52 54Q55 57.5 52 59.5Q49 61.5 46 58.5L30 42Z', P.wood.m, 1.1)}
    <path d="M37 39L51 54" stroke="${P.wood.l}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M44 51L50 57Q51.6 58.4 50 59" stroke="${P.wood.d}" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    ${shape('M32 33L38.5 39.5L35.5 42.5L29 36Z', P.brass.m, 0.9)}
    <circle cx="24" cy="24" r="16.5" fill="#e8f5f7" fill-opacity=".6"/>
    <circle cx="24" cy="24" r="16.5" fill="none" stroke="${INK}" stroke-width="5.4"/>
    <circle cx="24" cy="24" r="16.5" fill="none" stroke="${P.brass.m}" stroke-width="3.4"/>
    <path d="M35.4 31.8A16.5 16.5 0 0 1 16 38.6" fill="none" stroke="${P.brass.d}" stroke-width="3.4"/>
    <path d="M10.5 18A15 15 0 0 1 19 9.2" fill="none" stroke="${P.brass.l}" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M15 19Q17.5 13.5 23 12.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M31 32Q29 34 26.5 34.5" fill="none" stroke="#fff" stroke-width="1.2" stroke-opacity=".8" stroke-linecap="round"/>`),

  ruler: wrap('0 0 64 64', `
    <path d="M11 14L61 48L54 59L4 25Z" fill="${SHADOW}" fill-opacity=".35"/>
    ${shape('M8 9L58 43L51 54L1 20Z', '#e6f6f8', 1, 'fill-opacity=".8"')}
    <path d="M8.6 10.2L56.8 43L56 44.3L7.8 11.5Z" fill="#fff"/>
    <path d="M2.2 19.4L50.6 52.4L51 53.4L1.6 20.6Z" fill="#9fd0da"/>
    ${line('M13 12.4L10.6 16M18 15.8L16.2 18.6M23 19.2L20.6 22.8M28 22.6L26.2 25.4M33 26L30.6 29.6M38 29.4L36.2 32.2M43 32.8L40.6 36.4M48 36.2L46.2 39', 0.6, 0.85)}
    <path d="M30 26L36 30L27 43L21 39Z" fill="#fff" fill-opacity=".4"/>`),

  sticky: stickyIcon(),
  envelope: envelopeIcon(),
  books: booksIcon(),
  papers: papersIcon(),
  lamp: lampIcon(),
  glasses: glassesIcon(),
  folder: folderIcon(),

  hand: wrap('0 0 64 64', `
    ${shape('M18 34L18 18Q18 14 21.5 14Q25 14 25 18L25 30L25 12Q25 8 28.5 8Q32 8 32 12L32 30L32 14Q32 10 35.5 10Q39 10 39 14L39 31L39 20Q39 16.5 42.5 16.5Q46 16.5 46 20L46 40Q46 54 34 56L30 56Q22 56 17 48L10 38Q8 34 11 32.5Q14 31 17 34Z', P.ceramic.l, 1.2)}`),

  // small glyphs drawn in the current text colour
  close: wrap('0 0 24 24', `<path d="M6.5 6.8Q12 11.2 17.6 17.4M17.2 6.4Q12 12.4 6.8 17.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`),
  copy: wrap('0 0 24 24', `<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M8.4 7.2L18 6.8L18.4 19L8.8 19.4Z" fill="${P.paper}"/><path d="M5.2 4.6L14.4 4.2L14.5 6.6M5.2 4.6L5.6 16.6L8.4 16.5"/><path d="M11 10.6H15.6M11 13.4H15.4M11 16.2H14" stroke-width="1.1"/></g>`),
  download: wrap('0 0 24 24', `<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.2L12.1 14.6M7.8 10.6L12.1 14.8L16.4 10.6M5 19.4Q12 18.6 19 19.4"/></g>`),
  trash: wrap('0 0 24 24', `<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7Q12 6.2 19 7M9.6 6.6L10.1 4.6L13.9 4.5L14.4 6.6M7 7.6L8 19.6L16 19.4L17 7.6"/><path d="M10.4 10.4L10.8 16.6M13.6 10.4L13.3 16.6" stroke-width="1.1"/></g>`),
  tag: wrap('0 0 24 24', `<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="M4.3 11.4L4.7 5.3Q4.8 4.7 5.4 4.6L11.6 4.3L19.5 12.2L12.1 19.6Z"/><circle cx="8.7" cy="8.7" r="1.5"/></g>`),
  filter: wrap('0 0 24 24', `<path d="M4.4 5.4Q12 4.6 19.6 5.4L13.8 12.4V18.4L10.2 19.8V12.4Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>`),
  plus: wrap('0 0 24 24', `<path d="M12 5.4Q11.7 12 12.2 18.6M5.4 12.2Q12 11.7 18.6 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`),
  minus: wrap('0 0 24 24', `<path d="M5.4 12.2Q12 11.7 18.6 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`),
  chevL: wrap('0 0 24 24', `<path d="M14.6 5.6Q10.4 9.2 8.6 12Q10.4 14.8 14.6 18.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`),
  chevR: wrap('0 0 24 24', `<path d="M9.4 5.6Q13.6 9.2 15.4 12Q13.6 14.8 9.4 18.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`),
  layoutColumn: wrap('0 0 24 24', `<g fill="${P.paper}" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M8 2.5H16V11H8Z M8 13H16V21.5H8Z"/></g><path d="M9.8 5H14.2M9.8 7H13.4M9.8 15.5H14.2M9.8 17.5H13" stroke="currentColor" stroke-width=".8" stroke-opacity=".6"/>`),
  layoutSpread: wrap('0 0 24 24', `<g fill="${P.paper}" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2.5 5H11.2V19H2.5Z M12.8 5H21.5V19H12.8Z"/></g><path d="M4.4 8H9.4M4.4 10.2H8.6M14.6 8H19.6M14.6 10.2H18.8" stroke="currentColor" stroke-width=".8" stroke-opacity=".6"/>`),
  layoutGrid: wrap('0 0 24 24', `<g fill="${P.paper}" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M2.5 3H7.5V10H2.5Z M9.5 3H14.5V10H9.5Z M16.5 3H21.5V10H16.5Z M2.5 13H7.5V20H2.5Z M9.5 13H14.5V20H9.5Z"/></g>`),
  fit: wrap('0 0 24 24', `<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 9L4.2 4.2L9 4.2M15 4.2L19.8 4.2L19.8 9M19.8 15L19.8 19.8L15 19.8M9 19.8L4.2 19.8L4.2 15"/></g>`),
  sparkle: wrap('0 0 24 24', `<path d="M12 2.5Q13 10 21.5 12Q13 14 12 21.5Q11 14 2.5 12Q11 10 12 2.5Z" fill="${P.mustard.m}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M12 6Q12.6 10.4 16.4 11.6" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/>`),
  paperclip: wrap('0 0 24 60', `<path d="M8 14L8 44Q8 52 14 52Q20 52 20 44L20 10Q20 4 14 4Q8 4 8 10L8 38Q8 42 12 42Q16 42 16 38L16 16" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M8 14L8 44Q8 52 14 52Q20 52 20 44L20 10Q20 4 14 4Q8 4 8 10L8 38Q8 42 12 42Q16 42 16 38L16 16" fill="none" stroke="${P.metal.m}" stroke-width="1.4" stroke-linecap="round"/>`),
};

export type IconName = keyof typeof ICONS;

