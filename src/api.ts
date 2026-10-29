// Thin client for the local server.
import type { AiStatus, NotesFile, PaperMeta, Settings } from './types';
import type { BookMeta } from './books/types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

const get = <T>(url: string) => fetch(url).then((r) => json<T>(r));
/** the two libraries: papers (the piles) and books (the textbook's shelf) */
export type LibKind = 'papers' | 'books';
const send = <T>(method: string, url: string, body: unknown) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => json<T>(r));

/** POSTs JSON and calls onEvent for every NDJSON line of the streamed answer. */
export async function ndjsonPost(url: string, body: unknown, onEvent: (e: any) => void, signal?: AbortSignal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { onEvent(JSON.parse(line)); } catch (e) { console.warn('bad event', line, e); }
    }
  }
  if (buf.trim()) { try { onEvent(JSON.parse(buf)); } catch { /* ignore */ } }
}

export const api = {
  settings: () => get<Settings>('/api/settings'),
  saveSettings: (patch: Partial<Settings> | Record<string, unknown>) => send<Settings>('PUT', '/api/settings', patch),
  status: (force = false) => get<AiStatus>('/api/ai/status' + (force ? '?force=1' : '')),
  papers: () => get<PaperMeta[]>('/api/papers'),
  meta: (id: string) => get<PaperMeta>(`/api/papers/${id}`),
  paperTextStatus: (id: string, signal?: AbortSignal) => fetch(`/api/papers/${id}/text-status`, { signal }).then((r) => json<{ ready: boolean; characters: number }>(r)),
  patchMeta: (id: string, patch: Partial<PaperMeta>) => send<PaperMeta>('PATCH', `/api/papers/${id}`, patch),
  deletePaper: (id: string) => fetch(`/api/papers/${id}`, { method: 'DELETE' }).then((r) => json(r)),
  upload: (file: File | Blob, name: string) =>
    fetch('/api/papers/upload', { method: 'POST', body: file, headers: { 'X-Filename': encodeURIComponent(name) } }).then((r) => json<PaperMeta>(r)),
  fetchPaper: (url: string, onEvent: (e: any) => void, signal?: AbortSignal) => ndjsonPost('/api/papers/fetch', { url }, onEvent, signal),
  putText: (id: string, text: string) => fetch(`/api/papers/${id}/text`, { method: 'PUT', body: text }).then((r) => json(r)),
  putThumb: (id: string, jpeg: Blob) => fetch(`/api/papers/${id}/thumb`, { method: 'PUT', body: jpeg }).then((r) => json<PaperMeta>(r)),
  thumbUrl: (m: PaperMeta) => `/api/papers/${m.id}/thumb?v=${m.thumb}`,
  notes: (id: string) => get<NotesFile>(`/api/papers/${id}/notes`),
  saveNotes: (id: string, notes: NotesFile) => send('PUT', `/api/papers/${id}/notes`, notes),
  ask: (body: unknown, onEvent: (e: any) => void, signal?: AbortSignal) => ndjsonPost('/api/ai/ask', body, onEvent, signal),
  /* the reading shelf */
  books: () => get<BookMeta[]>('/api/books'),
  book: (id: string) => get<BookMeta>(`/api/books/${id}`),
  patchBook: (id: string, patch: Partial<BookMeta>) => send<BookMeta>('PATCH', `/api/books/${id}`, patch),
  deleteBook: (id: string) => fetch(`/api/books/${id}`, { method: 'DELETE' }).then((r) => json(r)),
  uploadBook: (file: File | Blob, name: string, format?: string) =>
    fetch('/api/books/upload', { method: 'POST', body: file, headers: { 'X-Filename': encodeURIComponent(name), ...(format ? { 'X-Format': format } : {}) } }).then((r) => json<BookMeta>(r)),
  fetchBook: (url: string, onEvent: (e: any) => void, signal?: AbortSignal) => ndjsonPost('/api/books/fetch', { url }, onEvent, signal),
  bookFile: (id: string) => fetch(`/api/books/${id}/file`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); }),
  putBookCover: (id: string, jpeg: Blob) => fetch(`/api/books/${id}/cover`, { method: 'PUT', body: jpeg }).then((r) => json<BookMeta>(r)),
  bookCoverUrl: (m: BookMeta) => `/api/books/${m.id}/cover?v=${m.cover}`,
  /* taking things off the desk, and finding them again */
  trashPaper: (id: string) => send<PaperMeta>('POST', `/api/papers/${id}/trash`, {}),
  trashBook: (id: string) => send<BookMeta>('POST', `/api/books/${id}/trash`, {}),
  /** what is in a bin, the latest first (purgedAt: its files are cleared, only the record is left) */
  trash: <T>(kind: LibKind) => get<T[]>(`/api/trash/${kind}`),
  restore: (kind: LibKind, id: string) => send<{ ok: true; result: 'restored' | 'merged' }>('POST', `/api/trash/${kind}/${id}/restore`, {}),
  purge: (kind: LibKind, id: string) => send('POST', `/api/trash/${kind}/${id}/purge`, {}),
  forget: (kind: LibKind, id: string) => fetch(`/api/trash/${kind}/${id}`, { method: 'DELETE' }).then((r) => json(r)),
  emptyTrash: (kind: LibKind) => send<{ cleared: number }>('POST', `/api/trash/${kind}/empty`, {}),
  trashPicUrl: (kind: LibKind, id: string) => `/api/trash/${kind}/${id}/pic`,
  /** many at once: tags on or off, or into the bin */
  batch: <T>(kind: LibKind, ids: string[], op: 'tag' | 'untag' | 'trash', tags: string[] = []) => send<T[]>('POST', `/api/library/${kind}/batch`, { ids, op, tags }),
  /** papers whose own text has every word asked for, with a line round the first */
  searchPapers: (q: string) => get<Array<{ id: string; snippet: string; hits: number }>>(`/api/papers-search?q=${encodeURIComponent(q)}`),
  /** arXiv's field and year for the arXiv papers that have none yet */
  enrichPapers: () => send<{ asked: number; found: number }>('POST', '/api/papers-enrich', {}),
  /** a book catalog page (OPDS feed), fetched by the server for us */
  catalog: (url: string) => fetch(`/api/catalog?url=${encodeURIComponent(url)}`, { headers: { 'X-PW': '1' } }).then((r) => json<{ text: string; type: string; url: string }>(r)),
};
