import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, getMeta, readPaperText, writeFileAtomic } from './store.ts';
import type { EnglishDraft, EnglishEntry } from '../src/english/types.ts';

export const normalizeEnglish = (text: string) => text.normalize('NFKC').replace(/\u00ad/g, '').replace(/[‐‑–]/g, '-').replace(/\s+/g, ' ').trim();
const keyOf = (text: string) => normalizeEnglish(text).toLowerCase().replace(/[.!?]+$/, '');
export function englishCount(value: unknown) {
  const n = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1) throw new Error('提取数量请输入大于 0 的整数');
  return n;
}
export function paperPages(text: string) {
  const out: Array<{ page: number; text: string }> = [];
  const pattern = /=== Page (\d+) ===\s*([\s\S]*?)(?==== Page \d+ ===|$)/g;
  for (const m of text.matchAll(pattern)) out.push({ page: +m[1], text: normalizeEnglish(m[2]) });
  return out.length ? out : [{ page: 1, text: normalizeEnglish(text) }];
}
function occurrences(text: string, term: string) {
  const escaped = normalizeEnglish(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...text.matchAll(new RegExp(`(?<![a-zA-Z])${escaped}(?![a-zA-Z])`, 'gi'))].length;
}

/** Only examples found in the actual paper can enter the notebook. Page/frequency are calculated here. */
export function validateDrafts(raw: unknown, paper: { id: string; title: string }, text: string): EnglishDraft[] {
  if (!Array.isArray(raw)) throw new Error('AI 没有返回词条列表，请重试');
  const pages = paperPages(text), seen = new Set<string>(), out: EnglishDraft[] = [];
  const joined = pages.map((p) => p.text).join(' ');
  let offset = 0;
  const spans = pages.map((p) => { const span = { ...p, start: offset }; offset += p.text.length + 1; return span; });
  for (const x of raw) {
    if (!x || !['word', 'phrase', 'sentence'].includes(x.kind)) continue;
    const fields = ['english', 'chinese', 'meaningEn', 'meaningZh'];
    if (fields.some((k) => typeof x[k] !== 'string' || !x[k].trim() || x[k].length > 3000)) continue;
    const english = normalizeEnglish(x.english), key = keyOf(english);
    if (!/[a-zA-Z]/.test(english) || !/[\u3400-\u9fff]/.test(x.chinese + x.meaningZh) || seen.has(key)) continue;
    const example = x.source?.exampleEn ?? x.exampleEn, translation = x.source?.exampleZh ?? x.exampleZh;
    if (typeof example !== 'string' || typeof translation !== 'string' || !/[\u3400-\u9fff]/.test(translation) || example.length > 5000 || translation.length > 5000) continue;
    const quote = normalizeEnglish(example);
    if (!quote || !keyOf(quote).includes(key)) continue;
    const at = joined.toLowerCase().indexOf(quote.toLowerCase());
    if (at < 0) continue;
    const page = spans.findLast((p) => p.start <= at)!;
    seen.add(key);
    out.push({ kind: x.kind, english, chinese: x.chinese.trim(), meaningEn: x.meaningEn.trim(), meaningZh: x.meaningZh.trim(),
      source: { paperId: paper.id, title: paper.title, page: page.page, exampleEn: quote, exampleZh: translation.trim(),
        occurrences: occurrences(joined, english) } });
  }
  return out;
}

const file = path.join(DATA_DIR, 'english-notebook.json');
let lock: Promise<unknown> = Promise.resolve();
async function read(): Promise<EnglishEntry[]> {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (value.version !== 1 || !Array.isArray(value.entries)) throw new Error('Invalid notebook');
    return value.entries;
  } catch (e: any) {
    if (e.code === 'ENOENT') return [];
    throw new Error('英语笔记文件无法读取；原文件已保留，请先修复或恢复备份');
  }
}
function mutate<T>(fn: (entries: EnglishEntry[]) => T | Promise<T>): Promise<T> {
  const next = lock.then(async () => {
    const entries = await read();
    const result = await fn(entries);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await writeFileAtomic(file, JSON.stringify({ version: 1, entries }, null, 2), 0o600);
    return result;
  });
  lock = next.catch(() => {});
  return next;
}
export async function listEnglish() { return (await read()).filter((e) => !e.deletedAt); }
export async function collectEnglish(raw: unknown, collectionId: string) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 50 || typeof collectionId !== 'string' || !/^[\w-]{8,100}$/.test(collectionId)) throw new Error('收藏请求无效');
  const valid: EnglishDraft[] = [];
  const grouped = new Map<string, unknown[]>();
  for (const entry of raw) {
    const id = entry?.source?.paperId;
    if (typeof id !== 'string') throw new Error('词条缺少论文来源');
    grouped.set(id, [...(grouped.get(id) || []), entry]);
  }
  for (const [id, items] of grouped) {
    const meta = await getMeta(id);
    if (!meta) throw new Error('来源论文不存在');
    valid.push(...validateDrafts(items, meta, await readPaperText(id)));
  }
  if (valid.length !== raw.length) throw new Error('部分词条或原句无法核对，请重新生成');
  return mutate((entries) => {
    const now = Date.now(), results: EnglishEntry[] = [];
    for (const draft of valid) {
      const id = createHash('sha256').update(keyOf(draft.english)).digest('hex').slice(0, 20);
      let entry = entries.find((x) => x.id === id);
      if (!entry) {
        entry = { ...draft, id, sources: [], collectionCount: 0, collectionIds: [], createdAt: now, collectedAt: now, learned: false };
        entries.push(entry);
      }
      if (!entry.collectionIds.includes(collectionId)) {
        entry.collectionCount++;
        entry.collectionIds.push(collectionId);
        entry.collectedAt = now;
        Object.assign(entry, draft);
        const source = entry.sources.findIndex((s) => s.paperId === draft.source.paperId && s.exampleEn === draft.source.exampleEn);
        if (source < 0) entry.sources.push(draft.source); else entry.sources[source] = draft.source;
        delete entry.deletedAt;
      }
      results.push(entry);
    }
    return results;
  });
}
export async function patchEnglish(id: string, patch: { learned?: boolean; deleted?: boolean }) {
  return mutate((entries) => {
    const e = entries.find((x) => x.id === id);
    if (!e) throw new Error('词条不存在');
    if (typeof patch.learned === 'boolean') e.learned = patch.learned;
    if (patch.deleted === true) e.deletedAt = Date.now();
    if (patch.deleted === false) delete e.deletedAt;
    return e;
  });
}
