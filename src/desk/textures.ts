// Textures generated once at startup: paper grain for the pages and cards. Bitmaps are cheap to
// composite (no live SVG filters), and generating them avoids shipping image assets.
import { Rng } from '../util/rng';

function grainCanvas(size: number, alpha: number, seed: number, tint = [66, 58, 44]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const rng = new Rng(seed);
  for (let i = 0; i < size * size; i++) {
    const v = rng.next();
    const a = v < 0.5 ? v * alpha * 2 : (1 - v) * alpha * 0.6;
    img.data[i * 4] = tint[0];
    img.data[i * 4 + 1] = tint[1];
    img.data[i * 4 + 2] = tint[2];
    img.data[i * 4 + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  // A few soft blotches so the grain is not uniform, like real paper fibres.
  for (let k = 0; k < 0; k++) {
    const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(size * 0.08, size * 0.25);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${tint.join(',')},${(alpha * 0.25).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${tint.join(',')},0)`);
    g.fillStyle = grad;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      g.save(); g.translate(ox, oy); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }
  return c.toDataURL('image/png');
}

/** Honey-coloured planks drawn the way an illustrator would: flat tone, long fine grain lines in a deeper brown, the odd
 *  cathedral figure, bevelled seams. Periodic horizontally and plank-aligned vertically, so it tiles. */
export function installTextures() {
  const root = document.documentElement.style;
  const paperGrain = grainCanvas(220, 0.07, 11, [90, 78, 58]);
  const pageGrain = grainCanvas(200, 0.06, 23, [90, 80, 60]);
  root.setProperty('--tex-paper', `url(${paperGrain})`);
  root.setProperty('--tex-page', `url(${pageGrain})`);
}
