// One-shot codemod: turns each stationery figure page (stationery/src/NN-*.html) into a desk-scene object module
// (src/scene/objects/NN-name.js). The figure's script is wrapped unchanged in `export function create(ctx)`; locals
// at the top of the closure stand in for the page globals it used (its desk frame, ui, action lock, shadows, labels),
// and `ui = mountFigure({...})` becomes the config handed to ctx.adapt. After this runs, the object modules are the
// source: edit them, not the pages.
//
//   node scripts/port-figures.mjs            # all figures
//   node scripts/port-figures.mjs 01 04      # just these (overwrites them)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'stationery', 'src');
const OUT = join(ROOT, 'src', 'scene', 'objects');
const engine = await import(join(ROOT, 'src', 'scene', 'engine', 'index.js'));
// names the closure provides itself (frame-bound or hooked): never imported
const LOCAL = new Set(['castShadow', 'clipTo', 'makeDesk', 'makePlayer']);
const imports = Object.keys(engine).filter((n) => !LOCAL.has(n)).sort();

const want = new Set(process.argv.slice(2));
for (const file of readdirSync(SRC).filter((f) => /^\d\d-.*\.html$/.test(f)).sort()) {
  const n = file.slice(0, 2);
  if (want.size && !want.has(n)) continue;
  const html = readFileSync(join(SRC, file), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let code = scripts[scripts.length - 1];
  const labelsOnly = /xrMount\([^;]*labelsOnly:\s*true/.test(code);
  if (!/^let ui;$/m.test(code) || !/^ui = mountFigure\(/m.test(code)) throw new Error(`${file}: unexpected shape`);
  code = code
    .replace(/^let ui;$/m, 'let ui = ctx.ui;')
    .replace(/^ui = mountFigure\(/m, 'const __cfg = (')
    .replace(/^xrMount\(.*\);\s*$/m, '')
    // 11 redrew on a timer to let its lid "snap" mark fade; the scene decays it on its own clock (see ctx.adapt)
    .replace(/^setInterval\(.*\);\s*$/m, '');
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || file;
  const out = `// Fig. ${n} ${title} — desk-scene object, ported from stationery/src/${file} by scripts/port-figures.mjs.
// The figure's own code runs inside create(ctx): ctx.desk is its place on the shared desk (dk, dkv, DU, DV, desk*),
// ctx.ui its ui (animate, invalidate, flash), ctx.play its one-at-a-time action lock; castShadow and labels are
// collected by the scene.
import { ${imports.join(', ')} } from '../engine/index.js';

export function create(ctx) {
  const { DK, DU, DV, dk, dkv, undk, deskTop, deskBoard, deskSheet, deskText, deskHand, deskBoxPts, deskBox, deskSetup } = ctx.desk;
  const { kPlay, kBusy } = ctx.play;
  const castShadow = ctx.castShadow, clipTo = ctx.clipTo, zhCallouts = ctx.labels;
${code.replace(/^/gm, '  ').replace(/^\s+$/gm, '')}
  return ctx.adapt(__cfg, { seeThrough: ${!labelsOnly} });
}
`;
  const name = file.replace(/\.html$/, '.js');
  writeFileSync(join(OUT, name), out);
  writeFileSync(join(OUT, name.replace(/\.js$/, '.d.ts')), `import type { ObjectFactory } from '../types';\nexport declare const create: ObjectFactory;\n`);
  console.log('wrote src/scene/objects/' + name, labelsOnly ? '(labels only)' : '');
}
