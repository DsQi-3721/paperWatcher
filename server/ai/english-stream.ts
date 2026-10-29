import { normalizeEnglish, validateDrafts } from '../english.ts';
import type { EnglishDraft } from '../../src/english/types.ts';

/** Extract only complete objects in entries[] while JSON is still streaming.
 * Braces, commas and escaped quotes inside strings do not terminate an entry. */
export class EnglishEntryStream {
  private buffer = '';
  private position = 0;
  private started = false;
  private finished = false;
  private depth = 0;
  private quoted = false;
  private escaped = false;
  private start = -1;
  feed(delta: string): unknown[] {
    this.buffer += delta;
    const entries: unknown[] = [];
    if (!this.started) {
      const match = /"entries"\s*:\s*\[/.exec(this.buffer);
      if (!match) return entries;
      this.position = match.index + match[0].length;
      this.started = true;
    }
    for (; this.position < this.buffer.length && !this.finished; this.position++) {
      const char = this.buffer[this.position];
      if (this.quoted) {
        if (this.escaped) this.escaped = false;
        else if (char === '\\') this.escaped = true;
        else if (char === '"') this.quoted = false;
        continue;
      }
      if (char === '"') { this.quoted = true; continue; }
      if (char === '{') { if (this.depth++ === 0) this.start = this.position; }
      else if (char === '}' && this.depth > 0 && --this.depth === 0) {
        try { entries.push(JSON.parse(this.buffer.slice(this.start, this.position + 1))); } catch { /* final JSON validation reports malformed output */ }
      } else if (char === ']' && this.depth === 0) this.finished = true;
    }
    return entries;
  }
}

export async function extractEnglishEntries(options: {
  count: number; query: string; paper: { id: string; title: string }; text: string;
  signal: AbortSignal;
  generate(message: string, onEntry: (entry: unknown) => void): Promise<any>;
  onBatch(batch: number): void;
  onEntry(entry: EnglishDraft, completed: number): void;
}) {
  const entries: EnglishDraft[] = [], seen = new Set<string>();
  const accept = (raw: unknown) => {
    for (const entry of validateDrafts([raw], options.paper, options.text)) {
      const key = normalizeEnglish(entry.english).toLowerCase().replace(/[.!?]+$/, '');
      if (seen.has(key) || entries.length >= options.count) continue;
      seen.add(key); entries.push(entry); options.onEntry(entry, entries.length);
    }
  };
  let batch = 0;
  while (entries.length < options.count) {
    options.signal.throwIfAborted();
    const size = Math.min(20, options.count - entries.length), before = entries.length;
    options.onBatch(++batch);
    const message = `Select ${size} NEW distinct entries from this paper (overall target: ${options.count}). Include technical words, academic phrases and meaningful sentences unless the learning goal requests a specific category.
Learning goal: ${options.query || 'Improve academic English comprehension and expression.'}
Already selected; NEVER repeat: ${entries.map((e) => e.english).join(' | ') || '(none)'}
Return only grounded relevant items, without padding. Set "exhausted":true when there are no more relevant entries beyond this batch. Otherwise set "exhausted":false.`;
    const result = await options.generate(message, accept);
    if (!Array.isArray(result.entries)) throw new Error('AI 没有返回词条列表，请重试');
    // Also supports CLI providers and gateways that only return their final text.
    result.entries.forEach(accept);
    if (result.exhausted === true || entries.length === before || result.entries.length < size) break;
  }
  return entries;
}
