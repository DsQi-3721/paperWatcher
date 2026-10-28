// Dev page (book-lab.html): the book reader on its own over a desk-coloured backdrop, with a made-up novel, a made-up
// comic, or any book file. ?doc=novel|comic, ?file=/tests/books/x.epub (served by the dev server), ?at=chapter:offset,
// and any reader setting by name (?size=22&theme=night&spread=double). window.lab = { reader, doc, log }.
import '../styles/fonts';
import '../styles/base.css';
import '../styles/ui.css';
import '../styles/reading.css';
import '../styles/books.css';
import { Ambience } from '../ui/ambience';
import { parseBook } from './formats/index';
import { BookReader } from './reader/index';
import { sampleComic, sampleNovel } from './sample';
import { BOOK_SETTINGS_DEFAULT, type BookDoc, type BookFormat, type BookMeta, type BookSettings } from './types';

const host = document.getElementById('host')!;
const msg = document.getElementById('lab-msg')!;
const q = new URLSearchParams(location.search);
const amb = new Ambience(host);
amb.setReading(true);
let reader: BookReader | null = null;
const log: string[] = [];

function settings(): BookSettings {
  let s: BookSettings = { ...BOOK_SETTINGS_DEFAULT };
  try { s = { ...s, ...JSON.parse(localStorage.getItem('pw.book.settings') || '{}') }; } catch { /* fresh */ }
  for (const [k, v] of q) if (k in BOOK_SETTINGS_DEFAULT) (s as any)[k] = typeof (BOOK_SETTINGS_DEFAULT as any)[k] === 'number' ? +v : v === 'true' ? true : v === 'false' ? false : v;
  return s;
}

async function mount(doc: BookDoc, format: BookFormat) {
  reader?.destroy();
  (window as any).__ready = false;
  const meta: BookMeta = { id: 'lab', title: doc.title, author: doc.author, format, kind: doc.kind, addedAt: Date.now() };
  reader = new BookReader(host, doc, meta, settings(), {
    onProgress: (p) => { log.push(`progress ${p.chapter}:${p.offset} ${(p.percent * 100).toFixed(1)}%`); (window as any).__progress = p; },
    onSettings: (s) => { try { localStorage.setItem('pw.book.settings', JSON.stringify(s)); } catch { /* private */ } },
    onBookmarks: (b) => { (window as any).__bookmarks = b; },
    onClose: () => { log.push('close'); msg.textContent = 'closed'; },
    ambience: { panel: () => amb.panel(), immersive: () => amb.immersive, setImmersive: (on) => amb.setImmersive(on) },
  });
  const at = q.get('at')?.split(':').map(Number);
  await reader.open(at ? { chapter: at[0], offset: at[1] || 0, percent: 0, at: 0 } : undefined);
  (window as any).lab = { reader, doc, log };
  (window as any).__ready = true;
}

async function load(buf: ArrayBuffer, name: string) {
  msg.textContent = 'parsing ' + name + '…';
  const t0 = performance.now();
  try {
    const doc = await parseBook(buf, name);
    msg.textContent = `${name}: parsed in ${(performance.now() - t0).toFixed(0)} ms`;
    await mount(doc, (name.split('.').pop() || 'epub') as BookFormat);
  } catch (e) {
    msg.textContent = 'error: ' + (e as Error).message;
    console.error(e);
  }
}

document.getElementById('file')!.addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) await load(await f.arrayBuffer(), f.name);
});

(async () => {
  const file = q.get('file');
  if (file) await load(await (await fetch(file)).arrayBuffer(), file.split('/').pop() || 'book');
  else if (q.get('doc') === 'comic') await mount(sampleComic(12, q.get('rtl') !== 'false'), 'cbz');
  else await mount(await sampleNovel(), 'epub');
})();
