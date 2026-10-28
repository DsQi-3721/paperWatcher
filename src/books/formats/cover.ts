// A book's cover for the desk's textbook and the fan: its own cover picture (or the first picture / page), as a JPEG
// at most 640 px tall, and its main colour (the textbook's boards take it). A book with no picture gets one drawn in
// the app's look: a cloth cover in a colour of its own, a cream label with the title and author, a little ink doodle.
import type { BookDoc } from '../types';

const PALETTE = ['#3f6fb0', '#c94f3d', '#2f7a5a', '#8a5fb4', '#d9a43a', '#4c4e55', '#b5653a', '#2d6e7e'];
const INK = '#231e16', CREAM = '#fbf6e8';
const MAX_H = 640;

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export async function coverFor(doc: BookDoc, info: { title: string; author?: string }): Promise<{ jpeg: Blob; color: string }> {
  let canvas: HTMLCanvasElement | null = null;
  try {
    let src: Blob | null = doc.cover ?? null;
    if (!src && doc.kind === 'flow') {
      // a picture at the very start of the book (before much text) is its cover
      let text = 0;
      for (const b of doc.chapters[0]?.blocks.slice(0, 6) ?? []) {
        if (b.t === 'img') { src = doc.resources.get(b.src) ?? null; break; }
        if ('runs' in b) text += b.runs.reduce((a, r) => a + r.text.length, 0);
        if (text > 200) break;
      }
    }
    if (src) canvas = await drawBlob(src);
    else if (doc.kind === 'fixed' && doc.pages > 0) canvas = fit(await doc.render(0, 480));
  } catch { canvas = null; }
  if (canvas && canvas.width > 8 && canvas.height > 8) return { jpeg: await jpeg(canvas), color: mainColour(canvas) };
  const color = PALETTE[hash(info.title || 'book') % PALETTE.length];
  return { jpeg: await jpeg(await drawCover(info.title || '未命名', info.author, color)), color };
}

/** A picture blob onto a canvas at most MAX_H tall. */
async function drawBlob(blob: Blob): Promise<HTMLCanvasElement> {
  try { return fit(await createImageBitmap(blob)); } catch {
    const url = URL.createObjectURL(blob);
    try { const img = new Image(); img.src = url; await img.decode(); return fit(img); } finally { URL.revokeObjectURL(url); }
  }
}
function fit(src: HTMLCanvasElement | ImageBitmap | HTMLImageElement): HTMLCanvasElement {
  const w0 = 'naturalWidth' in src ? src.naturalWidth : src.width, h0 = 'naturalHeight' in src ? src.naturalHeight : src.height;
  const k = Math.min(1, MAX_H / Math.max(1, h0), MAX_H / Math.max(1, w0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k));
  c.height = Math.max(1, Math.round(h0 * k));
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  if ('close' in src) (src as ImageBitmap).close?.();
  return c;
}
const jpeg = (c: HTMLCanvasElement) => new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('toBlob failed'))), 'image/jpeg', 0.85));

/** The cover's main colour: frequent, fairly saturated, neither near-white nor near-black. */
export function mainColour(c: HTMLCanvasElement): string {
  const w = 48, h = Math.max(1, Math.round((48 * c.height) / c.width));
  const s = document.createElement('canvas');
  s.width = w; s.height = h;
  const g = s.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(c, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = { n: 0, r: 0, g: 0, b: 0 };
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    const r = px[i], gg = px[i + 1], b = px[i + 2];
    const [, sat, lig] = hsl(r, gg, b);
    const wt = sat * sat * Math.max(0, 1 - Math.abs(lig - 0.5) * 1.6) + 0.015;
    const key = ((r >> 5) << 6) | ((gg >> 5) << 3) | (b >> 5);
    const e = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n += wt; e.r += r * wt; e.g += gg * wt; e.b += b * wt;
    bins.set(key, e);
    total = { n: total.n + 1, r: total.r + r, g: total.g + gg, b: total.b + b };
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of bins.values()) if (!best || e.n > best.n) best = e;
  let r = 63, gg = 111, b = 176;
  if (best && best.n > 0) { r = best.r / best.n; gg = best.g / best.n; b = best.b / best.n; }
  else if (total.n) { r = total.r / total.n; gg = total.g / total.n; b = total.b / total.n; }
  let [hue, sat, lig] = hsl(r, gg, b);
  lig = Math.min(0.58, Math.max(0.3, lig));
  if (sat > 0.08) sat = Math.max(0.3, Math.min(0.75, sat));
  return hex(...rgb(hue, sat, lig));
}
function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function rgb(h: number, s: number, l: number): [number, number, number] {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const shade = (c: string, k: number) => { const n = parseInt(c.slice(1), 16); return hex(((n >> 16) & 255) * k, ((n >> 8) & 255) * k, (n & 255) * k); };

/* ---------- a cover drawn for a book with none ---------- */
const WRAP_TOKEN = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F\u3040-\u30FF\uAC00-\uD7AF]|[^\s\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F\u3040-\u30FF\uAC00-\uD7AF]+|\s+/g;
function wrap(g: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const tok of text.match(WRAP_TOKEN) ?? []) {
    if (/^\s+$/.test(tok)) { if (line) line += ' '; continue; }
    if (g.measureText(line + tok).width <= width) { line += tok; continue; }
    if (line.trim()) lines.push(line.trim());
    line = '';
    // a word longer than the line: by characters
    let piece = '';
    for (const ch of tok) { if (g.measureText(piece + ch).width > width && piece) { lines.push(piece); piece = ''; } piece += ch; }
    line = piece;
  }
  if (line.trim()) lines.push(line.trim());
  if (lines.length > maxLines) { const kept = lines.slice(0, maxLines); kept[maxLines - 1] = kept[maxLines - 1].replace(/.$/, '…'); return kept; }
  return lines;
}

async function drawCover(title: string, author: string | undefined, cloth: string): Promise<HTMLCanvasElement> {
  const W = 600, H = 840, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const face = '"LXGW WenKai", "Kaiti SC", "STKaiti", "Songti SC", serif';
  try { await Promise.race([document.fonts.load(`700 60px ${face}`, title), new Promise((r) => setTimeout(r, 1200))]); } catch { /* the fallback face */ }
  // cloth, with a faint weave
  g.fillStyle = cloth;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.06;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1;
  for (let x = -H; x < W; x += 7) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H, H); g.stroke(); }
  g.globalAlpha = 1;
  // the spine's hinge on the left
  g.fillStyle = shade(cloth, 0.8);
  g.fillRect(0, 0, 46, H);
  g.strokeStyle = 'rgba(255,255,255,.28)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(50, 0); g.lineTo(50, H); g.stroke();
  // an ink border
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.strokeRect(66, 24, W - 90, H - 48);
  // the label: title (as big as fits in three lines) and author
  g.textBaseline = 'alphabetic';
  let size = 66, lines: string[] = [];
  // as big as lets the whole title fit in three lines; at the smallest size, cut it with an ellipsis
  for (; size > 34; size -= 4) { g.font = `700 ${size}px ${face}`; if (wrap(g, title, 360, 99).length <= 3) break; }
  g.font = `700 ${size}px ${face}`;
  lines = wrap(g, title, 360, 3);
  const lh = size * 1.22, authorH = author ? 44 : 0, boxH = Math.max(180, lines.length * lh + authorH + 70), bx = 96, by = 150, bw = W - 162;
  g.fillStyle = CREAM;
  roundRect(g, bx, by, bw, boxH, 10);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 2.5;
  g.stroke();
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.font = `700 ${size}px ${face}`;
  lines.forEach((l, i) => g.fillText(l, bx + bw / 2, by + 34 + size + i * lh));
  if (author) {
    g.font = `400 26px ${face}`;
    g.fillStyle = shade(INK, 1.6);
    g.fillText(wrap(g, author, 340, 1)[0] || author, bx + bw / 2, by + boxH - 28);
  }
  doodle(g, hash(title) % 4, bx + bw / 2, Math.min(H - 150, by + boxH + (H - by - boxH) / 2 + 10));
  return c;
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
/** A small ink doodle under the label: a boat on waves, a moon and stars, a branch, an open book. */
function doodle(g: CanvasRenderingContext2D, kind: number, cx: number, cy: number) {
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = INK;
  g.fillStyle = CREAM;
  g.lineWidth = 3;
  g.lineJoin = g.lineCap = 'round';
  const path = (d: string, fill = true) => { const p = new Path2D(d); if (fill) g.fill(p); g.stroke(p); };
  if (kind === 0) {
    path('M-90 10 L90 10 L66 42 L-66 42 Z');
    path('M0 10 L0 -86 L58 2 Z');
    g.strokeStyle = CREAM;
    path('M-130 66 Q-100 54 -70 66 T-10 66 T50 66 T110 66 T140 64', false);
  } else if (kind === 1) {
    path('M30 -60 A70 70 0 1 0 30 80 A54 54 0 1 1 30 -60 Z');
    for (const [x, y, r] of [[-90, -50, 11], [96, -30, 8], [80, 60, 6]]) path(`M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3} Z`);
  } else if (kind === 2) {
    path('M-110 70 Q0 30 110 -70', false);
    for (const [x, y, a] of [[-60, 46, -0.5], [-10, 24, 0.5], [30, 0, -0.6], [70, -36, 0.4]]) {
      g.save(); g.translate(x, y); g.rotate(a);
      path('M0 0 Q20 -26 46 -10 Q24 10 0 0 Z');
      g.restore();
    }
  } else {
    path('M0 -40 Q-50 -64 -110 -46 L-110 50 Q-50 32 0 56 Z');
    path('M0 -40 Q50 -64 110 -46 L110 50 Q50 32 0 56 Z');
    for (const y of [-20, 0, 20]) { path(`M-90 ${y - 14} Q-50 ${y - 26} -16 ${y - 8}`, false); path(`M16 ${y - 8} Q50 ${y - 26} 90 ${y - 14}`, false); }
  }
  g.restore();
}
