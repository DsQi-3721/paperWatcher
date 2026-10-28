// Local persistence: one folder per paper under data/papers/<id>/ plus data/settings.json.
import { isUtf8 } from 'node:buffer';
import { createHash } from 'node:crypto';
import { constants as fsConstants, promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { MetaCache } from './metacache.ts';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const DATA_DIR = path.resolve(process.env.PW_DATA_DIR || path.join(ROOT, 'data'));
export const PAPERS_DIR = path.join(DATA_DIR, 'papers');

export interface PaperMeta {
  id: string;
  title: string;
  authors?: string[];
  abstract?: string;
  arxivId?: string;
  sourceUrl?: string;
  fileName?: string;
  pages?: number;
  addedAt: number;
  openedAt?: number;
  notes?: number;
  view?: { layout?: string; x?: number; y?: number; z?: number };
  /** When the first-page thumbnail was saved (absent: none yet). */
  thumb?: number;
}

export interface Settings {
  provider: 'claude' | 'codex' | 'openai';
  language: 'auto' | 'zh' | 'en';
  claude: { bin: string; model: string; effort: string; allowWeb: boolean; loadUserSettings: boolean };
  codex: { bin: string; model: string; effort: string; httpTransport: boolean; allowWeb: boolean };
  openai: { baseUrl: string; apiKey: string; model: string; fullText: boolean };
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'claude',
  language: 'auto',
  claude: { bin: 'claude', model: '', effort: 'low', allowWeb: false, loadUserSettings: false },
  codex: { bin: 'codex', model: '', effort: 'low', httpTransport: true, allowWeb: false },
  openai: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4.1-mini', fullText: true },
};

const ID_RE = /^[a-f0-9]{8,64}$/;

export function paperDir(id: string) {
  if (!ID_RE.test(id)) throw new Error('Bad paper id');
  return path.join(PAPERS_DIR, id);
}

export async function ensureDirs() {
  await fs.mkdir(PAPERS_DIR, { recursive: true });
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/* Writes to the same file are serialized, and each goes through its own temp file + rename. */
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  const settled = next.catch(() => undefined);
  locks.set(key, settled);
  settled.then(() => { if (locks.get(key) === settled) locks.delete(key); });
  return next;
}

let tmpSeq = 0;
/** Readers (the list, an agent reading paper.txt, the browser fetching a thumbnail) see the old file or the new one,
 *  never half of one; a temp file that could not be written is not left behind. */
export async function writeFileAtomic(file: string, data: string | Buffer) {
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.${(tmpSeq++).toString(36)}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

export async function writeJsonFile(file: string, data: unknown) {
  await writeFileAtomic(file, JSON.stringify(data, null, 2));
}

/** Writes `data` unless the file already holds exactly it (the same paper text sent again on every open). */
async function writeFileIfChanged(file: string, data: Buffer) {
  const st = await fs.stat(file).catch(() => null);
  if (st?.isFile() && st.size === data.length) {
    const old = await fs.readFile(file).catch(() => null);
    if (old?.equals(data)) return false;
  }
  await writeFileAtomic(file, data);
  return true;
}

/* ---------- settings ---------- */

function merge<T>(base: T, over: any): T {
  if (!over || typeof over !== 'object') return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const k of Object.keys(base as any)) {
    const b = (base as any)[k];
    const o = over[k];
    if (o === undefined) continue;
    out[k] = b && typeof b === 'object' && !Array.isArray(b) ? merge(b, o) : o;
  }
  return out;
}

export async function loadSettings(): Promise<Settings> {
  const raw = await readJsonFile<any>(path.join(DATA_DIR, 'settings.json'), {});
  return merge(DEFAULT_SETTINGS, raw);
}

export async function saveSettings(patch: any): Promise<Settings> {
  return withLock('settings', async () => {
    const cur = await loadSettings();
    const next = merge(cur, patch);
    await writeJsonFile(path.join(DATA_DIR, 'settings.json'), next);
    return next;
  });
}

/** Settings as sent to the browser: the API key is masked. */
export function publicSettings(s: Settings) {
  const key = s.openai.apiKey;
  return { ...s, openai: { ...s.openai, apiKey: key ? key.slice(0, 3) + '…' + key.slice(-4) : '', hasKey: !!key } };
}

/* ---------- papers ---------- */

export function hashPdf(buf: Buffer) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

/** Every paper with a meta.json and its PDF, the last read first (kept in memory, see metacache.ts). */
const library = new MetaCache<PaperMeta>({
  dir: PAPERS_DIR,
  idRe: ID_RE,
  dataFile: () => 'paper.pdf',
  matters: (name) => name === 'meta.json' || name === 'paper.pdf',
  sortKey: (m) => m.openedAt || m.addedAt,
  // the desk never shows the abstract (three quarters of a big library's list); it stays in meta.json and in
  // GET /api/papers/:id
  listView: ({ abstract: _a, ...rest }) => rest,
});

export function listPapers(): Promise<PaperMeta[]> {
  return library.list();
}

/** The same list as the JSON GET /api/papers sends, kept ready between changes. */
export function listPapersJson(): Promise<Buffer> {
  return library.json();
}

export async function getMeta(id: string): Promise<PaperMeta | null> {
  return readJsonFile<PaperMeta | null>(path.join(paperDir(id), 'meta.json'), null);
}

async function saveMetaUnlocked(meta: PaperMeta) {
  await fs.mkdir(paperDir(meta.id), { recursive: true });
  try {
    await writeJsonFile(path.join(paperDir(meta.id), 'meta.json'), meta);
  } finally {
    library.touch(meta.id);
  }
}

export function saveMeta(meta: PaperMeta) {
  return withLock('meta:' + meta.id, () => saveMetaUnlocked(meta));
}

/** Read-modify-write under the paper's meta lock, so concurrent patches never drop each other's fields. */
export function patchMeta(id: string, patch: Partial<PaperMeta>): Promise<PaperMeta | null> {
  return withLock('meta:' + id, async () => {
    const cur = await getMeta(id);
    if (!cur) return null;
    const next = { ...cur, ...patch, id: cur.id };
    // nothing new (the same view saved again, a notes save that kept the count): the file stays as it is
    if (JSON.stringify(next) !== JSON.stringify(cur)) await saveMetaUnlocked(next);
    return next;
  });
}

/** Stores a PDF (deduplicated by content hash) and returns its metadata. */
export async function addPaper(buf: Buffer, info: Partial<PaperMeta>): Promise<PaperMeta> {
  if (buf.subarray(0, 1024).indexOf('%PDF') < 0) throw new Error('This file does not look like a PDF');
  const id = hashPdf(buf);
  return withLock('meta:' + id, () => addPaperUnlocked(id, buf, info));
}

async function addPaperUnlocked(id: string, buf: Buffer, info: Partial<PaperMeta>): Promise<PaperMeta> {
  const dir = paperDir(id);
  await fs.mkdir(dir, { recursive: true });
  const existing = await getMeta(id);
  if (!existsSync(path.join(dir, 'paper.pdf'))) await writeFileAtomic(path.join(dir, 'paper.pdf'), buf);
  const meta: PaperMeta = {
    ...(existing || { addedAt: Date.now() }),
    ...Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined && v !== '')),
    id,
    title: existing?.title || info.title || info.fileName?.replace(/\.pdf$/i, '') || 'Untitled paper',
    addedAt: existing?.addedAt || Date.now(),
  } as PaperMeta;
  // Better metadata from a resolver wins over a filename-derived title.
  if (info.title && (!existing || existing.title === existing.fileName?.replace(/\.pdf$/i, ''))) meta.title = info.title;
  await saveMetaUnlocked(meta);
  return meta;
}

export async function deletePaper(id: string) {
  try {
    await fs.rm(paperDir(id), { recursive: true, force: true });
  } finally {
    library.touch(id);
  }
}

/** Missing notes are an empty notebook; a damaged file is an error (never silently replaced by nothing). */
export async function readNotes(id: string) {
  const file = path.join(paperDir(id), 'notes.json');
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (e: any) {
    if (e?.code === 'ENOENT') return { version: 1, annotations: [] };
    throw e;
  }
  try {
    return JSON.parse(raw);
  } catch {
    // one copy per damaged version, named by its mtime: the paper is opened (and this read) again and again
    const st = await fs.stat(file).catch(() => null);
    await fs.copyFile(file, file + '.damaged-' + Math.floor(st ? st.mtimeMs : Date.now()), fsConstants.COPYFILE_EXCL).catch(() => {});
    throw new Error('notes.json is damaged (a copy was kept next to it)');
  }
}

export async function writeNotes(id: string, notes: any) {
  if (!notes || !Array.isArray(notes.annotations)) throw new Error('Bad notes payload');
  await withLock('notes:' + id, async () => {
    await fs.mkdir(paperDir(id), { recursive: true });
    await writeFileIfChanged(path.join(paperDir(id), 'notes.json'), Buffer.from(JSON.stringify(notes, null, 2)));
  });
  await patchMeta(id, { notes: notes.annotations.length });
}

/** The paper's text for the agents. The desk sends it on every open: an unchanged text is not written again. */
export async function writePaperText(id: string, text: string | Buffer) {
  let buf = typeof text === 'string' ? Buffer.from(text) : text;
  if (!isUtf8(buf)) buf = Buffer.from(buf.toString('utf8'));   // as text: broken sequences become U+FFFD
  await withLock('text:' + id, () => writeFileIfChanged(path.join(paperDir(id), 'paper.txt'), buf));
}

export async function readPaperText(id: string): Promise<string> {
  return fs.readFile(path.join(paperDir(id), 'paper.txt'), 'utf8').catch(() => '');
}

/** The first page, small, for the bookshelf on the desk. */
export async function writeThumb(id: string, buf: Buffer) {
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw new Error('The thumbnail must be a JPEG');
  if (!existsSync(paperDir(id))) return null;
  await writeFileAtomic(thumbPath(id), buf);
  return patchMeta(id, { thumb: Date.now() });
}

export function thumbPath(id: string) {
  return path.join(paperDir(id), 'thumb.jpg');
}

/** Saves an image the AI should look at; returns the absolute path. */
export async function saveAsset(id: string, dataUrl: string): Promise<{ file: string; mime: string; base64: string }> {
  const m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/s.exec(dataUrl);
  if (!m) throw new Error('Bad image data');
  const base64 = m[3];
  const buf = Buffer.from(base64, 'base64');
  const name = createHash('sha1').update(buf).digest('hex').slice(0, 16) + '.' + (m[2] === 'jpeg' ? 'jpg' : m[2]);
  const dir = path.join(paperDir(id), 'assets');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  if (!existsSync(file)) await fs.writeFile(file, buf);
  return { file, mime: m[1], base64 };
}
