/** Normalized PDF search with a map back to original character offsets for highlighting. */
export function searchable(text: string, caseSensitive = false) {
  let value = ''; const starts: number[] = [], ends: number[] = [];
  for (let i = 0; i < text.length;) {
    const start = i, ch = String.fromCodePoint(text.codePointAt(i)!); i += ch.length;
    if (ch === '\u00ad') continue;
    if (ch === '-' && /[a-zA-Z]/.test(text[start - 1] || '') && /^\s*\n\s*[a-zA-Z]/.test(text.slice(i))) { while (i < text.length && /\s/.test(text[i])) i++; continue; }
    let norm = ch.normalize('NFKC');
    if (!caseSensitive) norm = norm.toLowerCase();
    if (/\s/.test(norm)) { if (!value || value.endsWith(' ')) continue; norm = ' '; }
    for (const unit of norm) { value += unit; for (let k = 0; k < unit.length; k++) { starts.push(start); ends.push(i); } }
  }
  return { value, starts, ends };
}
export function findText(text: string, query: string, opts: { caseSensitive?: boolean; wholeWord?: boolean; limit?: number } = {}) {
  const index = searchable(text, opts.caseSensitive), needle = searchable(query, opts.caseSensitive).value.trim();
  const hits: Array<{ start: number; end: number }> = [];
  if (!needle) return hits;
  let from = 0;
  while (hits.length < (opts.limit ?? 2000)) {
    const at = index.value.indexOf(needle, from);
    if (at < 0) break;
    const end = at + needle.length;
    if (!opts.wholeWord || (!/[\p{L}\p{N}_]/u.test(index.value[at - 1] || '') && !/[\p{L}\p{N}_]/u.test(index.value[end] || ''))) hits.push({ start: index.starts[at], end: index.ends[end - 1] });
    from = at + Math.max(1, needle.length);
  }
  return hits;
}
