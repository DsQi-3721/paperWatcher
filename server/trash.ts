// The bin, for papers and books taken off the desk. An item goes in whole: its folder is moved from data/<kind>/<id>
// to data/trash/<kind>/<id> (so putting it back is a rename, its notes, bookmarks and progress included). Its files
// are cleared 30 days later, or when asked; what stays for good is the record (meta.json, the first page or cover,
// the notes), so it can be found and brought back: importing the same file again (the same id) takes the record
// back in, and everything it kept comes with it. A record is only gone when it is wiped by hand.
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

export type TrashKind = 'papers' | 'books';
/** Days a thrown-away item keeps its files before they are cleared. */
export const KEEP_DAYS = 30;
const DAY = 86_400_000;
const ID_RE = /^[a-f0-9]{8,64}$/;

/** What a record keeps once the files are cleared: the meta, the picture, the notes. */
const KEEP: Record<TrashKind, (name: string) => boolean> = {
  papers: (n) => n === 'meta.json' || n === 'thumb.jpg' || n === 'notes.json',
  books: (n) => n === 'meta.json' || n === 'cover.jpg',
};

export interface TrashMeta { id: string; trashedAt?: number; purgedAt?: number; [k: string]: unknown }

export class Trash {
  readonly dir: string;
  constructor(root: string, readonly kind: TrashKind, private live: string, private dataFile: (meta: any) => string) {
    this.dir = path.join(root, kind);
  }

  itemDir(id: string) {
    if (!ID_RE.test(id)) throw new Error('Bad id');
    return path.join(this.dir, id);
  }
  private liveDir(id: string) { return path.join(this.live, id); }

  async meta(id: string): Promise<TrashMeta | null> {
    try { return JSON.parse(await fs.readFile(path.join(this.itemDir(id), 'meta.json'), 'utf8')); } catch { return null; }
  }
  private async writeMeta(id: string, meta: TrashMeta) {
    const file = path.join(this.itemDir(id), 'meta.json'), tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(meta, null, 2));
    await fs.rename(tmp, file);
  }
  /** Are the files still there (the paper's PDF, the book's file)? */
  private async hasFiles(id: string, meta: TrashMeta) {
    return !!(await fs.stat(path.join(this.itemDir(id), this.dataFile(meta))).catch(() => null))?.isFile();
  }

  /** Throw an item away: its whole folder goes in the bin (an older record of the same item is replaced). */
  async put(id: string): Promise<TrashMeta | null> {
    const from = this.liveDir(id), to = this.itemDir(id);
    if (!existsSync(from)) return null;
    await fs.mkdir(this.dir, { recursive: true });
    await fs.rm(to, { recursive: true, force: true });
    await fs.rename(from, to);
    const meta = (await this.meta(id)) || { id };
    const next: TrashMeta = { ...meta, id, trashedAt: Date.now() };
    delete next.purgedAt;
    await this.writeMeta(id, next);
    return next;
  }

  /** Everything in the bin, the latest first; files past their days are cleared on the way. */
  async list(now = Date.now()): Promise<TrashMeta[]> {
    let names: string[] = [];
    try { names = await fs.readdir(this.dir); } catch { return []; }
    const out: TrashMeta[] = [];
    for (const id of names) {
      if (!ID_RE.test(id)) continue;
      let meta = await this.meta(id);
      if (!meta) continue;
      if (!meta.purgedAt && !(await this.hasFiles(id, meta))) meta = { ...meta, purgedAt: meta.trashedAt || now };
      else if (!meta.purgedAt && (meta.trashedAt || 0) + KEEP_DAYS * DAY < now) meta = (await this.purge(id)) || meta;
      out.push(meta);
    }
    return out.sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
  }

  /** Clear an item's files now; the record stays. */
  async purge(id: string): Promise<TrashMeta | null> {
    const meta = await this.meta(id);
    if (!meta) return null;
    const dir = this.itemDir(id);
    for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
      if (!KEEP[this.kind](name)) await fs.rm(path.join(dir, name), { recursive: true, force: true });
    }
    const next = { ...meta, purgedAt: Date.now() };
    await this.writeMeta(id, next);
    return next;
  }

  /** Clear the files of everything in the bin (records stay). */
  async empty() {
    let n = 0;
    for (const m of await this.list()) if (!m.purgedAt && await this.purge(m.id)) n++;
    return n;
  }

  /** Wipe a record for good. */
  async forget(id: string) {
    await fs.rm(this.itemDir(id), { recursive: true, force: true });
  }

  /** Put an item back on the desk. Its files must still be there (a cleared one is brought back by importing it
   *  again). If the same item was imported again meanwhile, the bin's copy is folded into it (`merge`). */
  async restore(id: string, merge: (binDir: string, binMeta: TrashMeta) => Promise<void>): Promise<'restored' | 'merged' | 'missing' | 'purged'> {
    const meta = await this.meta(id);
    if (!meta) return 'missing';
    if (meta.purgedAt || !(await this.hasFiles(id, meta))) return 'purged';
    const to = this.liveDir(id), from = this.itemDir(id);
    const clean = { ...meta };
    delete clean.trashedAt;
    delete clean.purgedAt;
    if (existsSync(path.join(to, 'meta.json'))) {
      await merge(from, clean);
      await this.forget(id);
      return 'merged';
    }
    await fs.rm(to, { recursive: true, force: true });
    await this.writeMeta(id, clean);
    await fs.rename(from, to);
    return 'restored';
  }

  /** The same item imported again: what its record kept (meta without the bin's dates, and the kept files copied into
   *  the new folder where it has none of its own); the record goes. Null if there is none. */
  async takeBack(id: string): Promise<TrashMeta | null> {
    const meta = await this.meta(id);
    if (!meta) return null;
    const from = this.itemDir(id), to = this.liveDir(id);
    await fs.mkdir(to, { recursive: true });
    for (const name of await fs.readdir(from).catch(() => [] as string[])) {
      if (name === 'meta.json' || !KEEP[this.kind](name)) continue;
      if (!existsSync(path.join(to, name))) await fs.copyFile(path.join(from, name), path.join(to, name)).catch(() => {});
    }
    await this.forget(id);
    const clean = { ...meta };
    delete clean.trashedAt;
    delete clean.purgedAt;
    return clean;
  }
}

/** Tags as kept: trimmed, no '#', at most 24 characters each, at most 40, no repeats (case-insensitive). */
export function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [], seen = new Set<string>();
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const t = [...x.replace(/\s+/g, ' ').trim().replace(/^#+\s*/, '')].slice(0, 24).join('').trim();
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 40) break;
  }
  return out;
}
