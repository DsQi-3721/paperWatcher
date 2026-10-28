// The list the desk shows (every paper, every book), kept in memory: each item's meta.json is read once and then
// only again after it changed, and the list's JSON is kept ready, so asking for the list again costs a stat of the
// folder instead of reading and parsing every meta.json in the library.
//
// It stays true to the files:
//   - this server's own writes mark the item to be looked at again before the next list (`touch`);
//   - changes made behind the server's back (another server on the same folder, a hand edit, a restored backup) are
//     seen through a recursive file watcher where the OS has a cheap one (FSEvents on macOS, Windows), through the
//     folder's own mtime (items added or removed), and through a look over every item's stat (stats only: a file is
//     read only when its stat changed) at most every few minutes with a watcher, every 2 s without one.
import { promises as fs, watch, type FSWatcher, type Stats } from 'node:fs';
import path from 'node:path';

export interface MetaCacheOptions<T> {
  /** the folder that holds one folder per item */
  dir: string;
  /** what an item folder's name looks like */
  idRe: RegExp;
  /** the file next to meta.json that must be there for the item to be listed (paper.pdf, book.<format>) */
  dataFile: (meta: T) => string;
  /** whether a file in an item folder matters to the list (meta.json and the data file) */
  matters: (name: string) => boolean;
  /** the list is newest first by this */
  sortKey: (meta: T) => number | undefined;
  /** what of an item goes in the list (default: all of meta.json) */
  listView?: (meta: T) => unknown;
  /** use a file watcher (default: where the OS watches a whole tree natively) */
  watch?: boolean;
  /** how long a full look over every item's stat may wait (default: 5 min with a watcher, 2 s without) */
  sweepMs?: number;
}

interface Item {
  /** meta.json's stat when it was read ('' when there was none) */
  sig: string;
  /** meta.json as listed (compact JSON, UTF-8), null when missing or unreadable */
  json: Buffer | null;
  data: string;
  key: number;
  listed: boolean;
}

/** With a watcher, a full look only guards against events the OS dropped; without one it is how outside edits show. */
const SWEEP_WATCHED_MS = 5 * 60_000;
const SWEEP_UNWATCHED_MS = 2_000;
/** Native recursive watching: one handle for the whole tree. (Elsewhere Node emulates it with a watch per folder.) */
const NATIVE_RECURSIVE_WATCH = process.platform === 'darwin' || process.platform === 'win32';

const sigOf = (st: Stats) => `${st.ino}:${st.size}:${st.mtimeMs}`;

/** A buffer of its own (not a slice of Node's shared 8 KB pool, which one old slice would keep alive after its item
 *  was rewritten): an item's JSON is freed when the item changes. */
function ownBuffer(s: string) {
  const b = Buffer.allocUnsafeSlow(Buffer.byteLength(s));
  b.write(s);
  return b;
}

/** Errors that pass (too many files open at once…): what is known stays, and is looked at again next time. Any other
 *  error means the file is not there or cannot be read, and the item is not listed, as before. */
const PASSING = new Set(['EMFILE', 'ENFILE', 'EAGAIN', 'EBUSY', 'EINTR', 'ENOMEM']);
const passing = (e: unknown) => PASSING.has((e as NodeJS.ErrnoException)?.code || '');

async function statOrNull(file: string) {
  try { return await fs.stat(file); } catch (e) { if (passing(e)) throw e; return null; }
}

/** meta.json read through one handle, so the stat recorded is the stat of what was read (null: not there). */
async function readMeta(file: string): Promise<{ sig: string; meta: unknown } | null> {
  let fh: fs.FileHandle;
  try { fh = await fs.open(file, 'r'); } catch (e) { if (passing(e)) throw e; return null; }
  try {
    const st = await fh.stat();
    if (!st.isFile()) return null;
    let meta: unknown = null;
    try {
      meta = JSON.parse(await fh.readFile('utf8'));
    } catch (e) {
      if (passing(e)) throw e;   // else unreadable or not JSON: not listed until it changes
    }
    return { sig: sigOf(st), meta };
  } finally {
    await fh.close().catch(() => {});
  }
}

async function eachLimit<T>(items: T[], limit: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  const worker = async () => { while (i < items.length) await fn(items[i++]); };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export class MetaCache<T> {
  private items = new Map<string, Item>();
  private dirty = new Set<string>();
  private loaded = false;
  private dirIno = -1;
  private dirMtime = -1;
  private lastSweep = 0;
  private sweepNext = true;
  private watcher: FSWatcher | null = null;
  private body: Buffer | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private o: MetaCacheOptions<T>) {}

  /** This server just changed item `id`'s files (wrote its meta, added or removed it): look again before the next list. */
  touch(id: string) {
    this.dirty.add(id);
  }

  /** The list as JSON, newest first: byte for byte what JSON.stringify of the metas (as listView shows them) would give. */
  async json(): Promise<Buffer> {
    await this.refresh();
    return (this.body ??= this.build());
  }

  /** The list as fresh objects (the caller may change them). */
  async list(): Promise<T[]> {
    return JSON.parse((await this.json()).toString('utf8')) as T[];
  }

  /** One refresh at a time; each picks up everything marked before it started. */
  private refresh(): Promise<void> {
    const run = this.queue.then(() => this.refreshNow());
    this.queue = run.catch(() => {});
    return run;
  }

  private async refreshNow() {
    const dir = this.o.dir;
    let st: Stats | null;
    try {
      st = await statOrNull(dir);
      if (!st) {
        await fs.mkdir(dir, { recursive: true }).catch(() => {});
        st = await statOrNull(dir);
      }
    } catch {
      this.sweepNext = true;   // a passing error: the list as known for now, a full look next time
      return;
    }
    // a new folder (first look, or the library folder was replaced): watch it before reading, so nothing that changes
    // while it is read goes unseen
    if (!this.loaded || !st || st.ino !== this.dirIno) {
      this.watch();
      this.sweepNext = true;
    }
    const sweep = this.sweepNext || Date.now() - this.lastSweep > (this.o.sweepMs ?? (this.watcher ? SWEEP_WATCHED_MS : SWEEP_UNWATCHED_MS));
    const dirChanged = !st || st.ino !== this.dirIno || st.mtimeMs !== this.dirMtime;
    const look = this.dirty;
    this.dirty = new Set();
    let ids: Iterable<string> = look;
    let listedDir = true;
    if (sweep || dirChanged) {
      let entries: string[] = [];
      try {
        if (st) entries = await fs.readdir(dir);
      } catch (e) {
        if (passing(e)) listedDir = false;
      }
      if (listedDir) {
        const names = new Set(entries.filter((n) => this.o.idRe.test(n)));
        for (const id of this.items.keys()) if (!names.has(id)) this.forget(id);
        if (sweep) ids = names;
        else for (const id of names) if (!this.items.has(id)) look.add(id);
      }
    }
    if (!listedDir) {
      // the folder could not be listed just now: what is known stays; everything is looked at next time
      for (const id of look) this.dirty.add(id);
      this.sweepNext = true;
      return;
    }
    if (sweep) {
      this.sweepNext = false;
      this.lastSweep = Date.now();
    }
    this.dirIno = st ? st.ino : -1;
    this.dirMtime = st ? st.mtimeMs : -1;
    this.loaded = true;
    await eachLimit([...ids], 32, (id) => this.lookAt(id));
  }

  private forget(id: string) {
    const it = this.items.get(id);
    if (!it) return;
    this.items.delete(id);
    if (it.listed) this.body = null;
  }

  /** Brings one item up to date with its files. */
  private async lookAt(id: string) {
    if (!this.o.idRe.test(id)) return;
    try {
      await this.update(id);
    } catch {
      this.dirty.add(id);   // a passing error: the item stays as it was known, and is looked at next time
    }
  }

  private async update(id: string) {
    const folder = path.join(this.o.dir, id);
    const metaFile = path.join(folder, 'meta.json');
    const old = this.items.get(id);
    const st = await statOrNull(metaFile);
    const sig = st?.isFile() ? sigOf(st) : '';
    let it: Item;
    if (old && old.sig === sig) {
      it = { ...old };
    } else {
      it = { sig: '', json: null, data: '', key: 0, listed: false };
      const got = sig ? await readMeta(metaFile) : null;
      if (got) {
        it.sig = got.sig;
        // what the original list did: any non-null meta.json, as it is
        if (got.meta) {
          const m = got.meta as T;
          it.json = ownBuffer(JSON.stringify(this.o.listView ? this.o.listView(m) : m));
          it.data = String(this.o.dataFile(m));
          it.key = Number(this.o.sortKey(m)) || 0;
        }
      }
    }
    if (!it.sig && !(await statOrNull(folder))?.isDirectory()) {
      this.forget(id);
      return;
    }
    it.listed = !!it.json && !!(await statOrNull(path.join(folder, it.data)))?.isFile();
    this.items.set(id, it);
    if (!old ? it.listed : old.listed !== it.listed || (it.listed && (old.key !== it.key || !old.json!.equals(it.json!)))) this.body = null;
  }

  private build(): Buffer {
    const listed = [...this.items.entries()].filter(([, it]) => it.listed);
    listed.sort(([a, x], [b, y]) => y.key - x.key || (a < b ? -1 : a > b ? 1 : 0));
    const parts: Buffer[] = [Buffer.from('[')];
    listed.forEach(([, it], i) => { if (i) parts.push(Buffer.from(',')); parts.push(it.json!); });
    parts.push(Buffer.from(']'));
    return Buffer.concat(parts);
  }

  private watch() {
    this.watcher?.close();
    this.watcher = null;
    if (!(this.o.watch ?? NATIVE_RECURSIVE_WATCH)) return;
    try {
      const w = watch(this.o.dir, { recursive: true, persistent: false });
      w.on('change', (_type, name) => this.changed(name == null ? null : String(name)));
      w.on('error', () => {
        w.close();
        if (this.watcher === w) { this.watcher = null; this.sweepNext = true; }
      });
      this.watcher = w;
    } catch {
      this.watcher = null;
    }
  }

  /** A watcher event: `name` is relative to the library folder ('<id>', '<id>/meta.json', …). */
  private changed(name: string | null) {
    if (name === null) { this.sweepNext = true; return; }
    const parts = name.split(/[\\/]/);
    if (!this.o.idRe.test(parts[0])) return;
    if (parts.length === 1 || (parts.length === 2 && this.o.matters(parts[1]))) this.dirty.add(parts[0]);
  }
}
