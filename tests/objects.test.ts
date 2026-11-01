// Every desk object, in node: built in its place, drawn from several cameras, every button (and every choice of a
// picker) pressed and run to the end on a 60 fps clock. Nothing may throw, draw NaN, or run forever.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/scene/engine/index.js';
import { OBJECTS } from '../src/scene/objects/index';
import { advanceClock, makeObject, type ObjHost } from '../src/scene/runtime';
import type { DeskObject } from '../src/scene/types';

const VIEWS: Array<[number, number]> = [[18, 42], [200, 30], [110, 70], [300, 15], [0, 89.9]];

function harness() {
  const steps = new Map<(dt: number) => boolean | void, DeskObject>();
  const flashes: string[] = [];
  const host: ObjHost = {
    animate: (obj, step) => { steps.set(step, obj); },
    invalidate: () => {},
    flash: (_obj, text) => { flashes.push(text); },
  };
  return { steps, flashes, host };
}

function check(obj: DeskObject, where: string) {
  const r = obj.render();
  for (const part of [r.ground, r.shadow, r.body]) assert.ok(!/NaN|undefined|Infinity/.test(part), `${obj.n} ${where}: bad number in svg`);
  for (const v of [...r.box[0], ...r.box[1]]) assert.ok(Number.isFinite(v), `${obj.n} ${where}: box not finite`);
  for (const l of r.labels) assert.ok(l.at.every(Number.isFinite), `${obj.n} ${where}: label ${l.text} not finite`);
  return r;
}

/** Run animations until nothing is left (at most `limit` simulated seconds), drawing every 4th frame. */
function settle(h: ReturnType<typeof harness>, obj: DeskObject, what: string, limit = 60) {
  let t = 0, frame = 0;
  while (h.steps.size) {
    for (const [step] of [...h.steps]) { if (step(1 / 60) === false) h.steps.delete(step); }
    advanceClock(1000 / 60);
    t += 1 / 60;
    if (++frame % 4 === 0) check(obj, `${what} t=${t.toFixed(2)}`);
    assert.ok(t < limit, `${obj.n} ${what}: still running after ${limit}s`);
  }
  check(obj, `${what} end`);
}

for (const entry of OBJECTS) {
  test(`${entry.n} ${entry.id}`, () => {
    E.setOrigin(0, 0, [0, 0], 4);
    E.setInk(0.8);
    const h = harness();
    const obj = makeObject(entry.create, entry.n, entry.id, entry.place, h.host);
    for (const [y, p] of VIEWS) { E.setCam(y, p); check(obj, `view ${y}/${p}`); }
    E.setCam(18, 42);
    for (const b of obj.buttons) {
      const presses = b.choices ? b.choices(obj.st).map((c) => `${b.label}>${c.label}`) : [b.label];
      for (const what of presses) {
        const [label, choice] = what.split('>');
        if (choice != null) {
          const c = b.choices!(obj.st).find((x) => x.label === choice)!;
          if (!c.disabled && !c.current) c.onClick(obj.st, obj.ui);
        } else b.onClick!(obj.st, obj.ui);
        settle(h, obj, what);
        void label;
      }
    }
    // see-through and its labels
    if (obj.seeThrough) { obj.st.xr = obj.st.xrT = 1; for (const [y, p] of VIEWS) { E.setCam(y, p); check(obj, `xr ${y}/${p}`); } }
  });
}

test('live planner, dictation and music data appear on the desk without injecting SVG markup', () => {
  E.setOrigin(0, 0, [0, 0], 4); E.setInk(.8); E.setCam(0, 89.9); E.setTextMin(0);
  const h = harness();
  const make = (id: string) => { const entry = OBJECTS.find((e) => e.id === id)!; return makeObject(entry.create, entry.n, entry.id, entry.place, h.host); };
  const svg = (obj: DeskObject) => { const r = check(obj, 'live data'); return r.ground + r.body; };
  const planner = make('washi-tape'); planner.st.planner = { date: '2026-11-01', items: [{ text: '<img>', done: true }] };
  assert.match(svg(planner), /data-planner/); assert.match(svg(planner), /&lt;img&gt;/); assert.doesNotMatch(svg(planner), /<img>/);
  const words = Array.from({ length: 4 }, (_, i) => ({ chinese: `新词${i}<`, previous: { answer: 'wrong<&', correct: false } }));
  const pen = make('click-pen'); pen.st.dictation = words;
  assert.match(svg(pen), /最新词本/); assert.match(svg(pen), /新词0&lt;/); assert.match(svg(pen), /wrong&lt;&amp;/);
  const eraser = make('eraser'); eraser.st.dictation = words; assert.match(svg(eraser), /新词3&lt;/);
  const player = make('mp3-player'); player.st.on = true; player.st.audioModel = { title: 'Music <img>', duration: 30, currentTime: 5, index: 1, total: 1 };
  assert.match(svg(player), /Music &lt;img&gt;/); assert.doesNotMatch(svg(player), /<img>/);
});
