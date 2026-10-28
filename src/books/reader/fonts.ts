// The reader's typefaces and how a run of text is set: one CSS font string, used both by pretext (which measures
// with canvas) and by the page's spans, so what is measured is what is drawn.

export interface FontDef { key: string; name: string; family: string; sample: string }

export const FONTS: FontDef[] = [
  // 自动: 文楷 for a Chinese / Japanese / Korean book, the serif for a book in Latin letters (fontDef decides)
  { key: 'auto', name: '自动', family: '"LXGW WenKai", "Kaiti SC", "STKaiti", serif', sample: '自' },
  { key: 'kai', name: '文楷', family: '"LXGW WenKai", "Kaiti SC", "STKaiti", serif', sample: '永' },
  { key: 'song', name: '宋体', family: '"Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif', sample: '永' },
  { key: 'hei', name: '黑体', family: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif', sample: '永' },
  { key: 'serif', name: '衬线', family: '"Cormorant Garamond", Georgia, "Songti SC", serif', sample: 'Ag' },
  { key: 'sans', name: '无衬线', family: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif', sample: 'Ag' },
  { key: 'mono', name: '等宽', family: '"Courier Prime", ui-monospace, Menlo, "LXGW WenKai", monospace', sample: 'Ag' },
];
export const MONO_FAMILY = '"Courier Prime", ui-monospace, Menlo, "PingFang SC", monospace';

export const fontDef = (key: string, latin = false) =>
  key === 'auto' ? FONTS.find((f) => f.key === (latin ? 'serif' : 'kai'))! : FONTS.find((f) => f.key === key) ?? FONTS[1];

/** Is this a book in Latin letters (its language, or failing that most of its first pages' letters)? */
export function isLatinBook(lang: string | undefined, sample: string) {
  if (lang) return !/^(zh|ja|ko|cmn|yue|wuu|lzh)/i.test(lang);
  let cjk = 0, latin = 0;
  for (const c of sample) { const u = c.codePointAt(0)!; if (u >= 0x3000 && u < 0xa000) cjk++; else if ((u >= 65 && u <= 90) || (u >= 97 && u <= 122)) latin++; }
  return latin > cjk * 3;
}

export interface Face { family: string; size: number; bold?: boolean; italic?: boolean }
/** The CSS font shorthand for a face (also what canvas and pretext read). */
export const fontString = (f: Face) => `${f.italic ? 'italic ' : ''}${f.bold ? 700 : 400} ${Math.round(f.size * 100) / 100}px ${f.family}`;

// What is loaded is kept per face, not per font string: which @font-face files a text needs depends on the family,
// weight, style and the characters, never on the size, so every size of a face shares one record (changing the text
// size loads nothing again, and the record does not grow with each size tried). Characters are kept as code points.
const ready = new Map<string, Set<number>>();
const inflight = new Map<string, Promise<void>>();
/** The face a font string is set in: the font string without its size. */
const faceKey = (font: string) => font.replace(/(^|\s)\d+(?:\.\d+)?px\s+/, '$1');
/** A text's code points, each once (in the order met). */
function codePoints(text: string): number[] {
  const seen = new Set<number>();
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d < 0xe000) { c = ((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000; i++; }
    }
    seen.add(c);
  }
  return [...seen];
}
/** The distinct faces of some font strings, each with one of its font strings (to ask FontFaceSet.load with). */
function facesOf(fonts: Iterable<string>) {
  const out = new Map<string, string>();
  for (const f of fonts) { const k = faceKey(f); if (!out.has(k)) out.set(k, f); }
  return out;
}

/** Wait until the faces that set this text are loaded (web fonts come in unicode-range slices: the characters
 *  decide which slices). Measuring before that would measure the fallback face. */
export async function loadFaces(fonts: Iterable<string>, text: string) {
  const chars = codePoints(text);
  await Promise.all([...facesOf(fonts)].map(async ([key, font]) => {
    // an earlier load of this face first, so the characters it brought count
    for (let prev = inflight.get(key); prev; prev = inflight.get(key)) await prev;
    let have = ready.get(key);
    if (!have) ready.set(key, (have = new Set()));
    const need = chars.filter((c) => !have!.has(c));
    if (!need.length && have.size) return;
    const job = (async () => {
      // FontFaceSet.load takes a sample text: in slices so one call never gets huge
      const all = need.length ? need : [0x61];
      for (let i = 0; i < all.length; i += 3000) await document.fonts.load(font, String.fromCodePoint(...all.slice(i, i + 3000))).catch(() => undefined);
      for (const c of need) have!.add(c);
    })();
    inflight.set(key, job);
    await job;
    if (inflight.get(key) === job) inflight.delete(key);
  }));
}

/** Are these faces loaded for every character of this text already (so text can be measured right now)? */
export function facesReady(fonts: Iterable<string>, text: string) {
  const sets: Array<Set<number>> = [];
  for (const key of facesOf(fonts).keys()) {
    if (inflight.has(key)) return false;
    const have = ready.get(key);
    if (!have) return false;
    sets.push(have);
  }
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d < 0xe000) { c = ((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000; i++; }
    }
    for (const have of sets) if (!have.has(c)) return false;
  }
  return true;
}
/** Is a face of these fonts being loaded right now (facesReady is false while it is)? */
export function facesLoading(fonts: Iterable<string>) {
  for (const key of facesOf(fonts).keys()) if (inflight.has(key)) return true;
  return false;
}
