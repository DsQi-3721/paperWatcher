// Sorting a library without anyone doing the sorting: the groups a paper or a book falls into, worked out from what is
// known about it. For papers: read or not, notes, the student's tags, arXiv's field, topics found in the title, the
// year, authors met more than once. For books: how far read, tags, what kind of book, its language, authors.
// Pure functions over the lists the server sends (src/ui/library.ts shows them; the fan filters by them).
import type { BookMeta } from '../books/types';
import type { PaperMeta } from '../types';

export interface Group<T> {
  /** stable across lists (what the student picked stays picked when the list is fresher) */
  key: string;
  label: string;
  test(m: T): boolean;
  /** how many in the list */
  n: number;
}
export interface Section<T> { key: string; title: string; groups: Array<Group<T>> }

const DAY = 86_400_000;
const lc = (s: string) => s.toLowerCase();

/* ---------- tags ---------- */
/** A tag as written: trimmed, no '#', at most 24 characters (the server keeps them the same way). */
export function cleanTag(s: string) {
  return [...s.replace(/\s+/g, ' ').trim().replace(/^#+\s*/, '')].slice(0, 24).join('').trim();
}
/** Tags with how many carry each, most used first. */
export function tagCounts<T>(list: T[], tags: (m: T) => string[] | undefined) {
  const n = new Map<string, { tag: string; n: number }>();
  for (const m of list) for (const t of tags(m) || []) { const k = lc(t), x = n.get(k); if (x) x.n++; else n.set(k, { tag: t, n: 1 }); }
  return [...n.values()].sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'zh-Hans-CN'));
}
/** Which of eight soft colours a tag wears (always the same one). */
export function tagHue(t: string) {
  let h = 2166136261;
  for (const c of lc(t)) { h ^= c.codePointAt(0)!; h = Math.imul(h, 16777619); }
  return (h >>> 0) % 8;
}

/* ---------- papers ---------- */
/** arXiv's fields, in Chinese (the ones a reader of papers meets most). */
export const FIELDS: Record<string, string> = {
  'cs.LG': '机器学习', 'stat.ML': '统计机器学习', 'cs.CL': '计算语言学', 'cs.CV': '计算机视觉', 'cs.AI': '人工智能',
  'cs.NE': '神经与进化计算', 'cs.RO': '机器人', 'cs.IR': '信息检索', 'cs.CR': '密码与安全', 'cs.SD': '声音', 'eess.AS': '音频与语音',
  'eess.IV': '图像与视频', 'eess.SP': '信号处理', 'cs.DC': '分布式计算', 'cs.HC': '人机交互', 'cs.GR': '图形学', 'cs.MA': '多智能体',
  'cs.SI': '社会与信息网络', 'cs.DS': '数据结构与算法', 'cs.IT': '信息论', 'cs.SE': '软件工程', 'cs.PL': '编程语言', 'cs.DB': '数据库',
  'cs.GT': '博弈论', 'cs.CY': '计算与社会', 'cs.MM': '多媒体', 'math.OC': '优化与控制', 'math.ST': '统计理论', 'stat.ME': '统计方法',
  'q-bio.NC': '神经科学', 'quant-ph': '量子物理', 'physics.comp-ph': '计算物理', 'econ.EM': '计量经济',
};
export const fieldLabel = (f: string) => (FIELDS[f] ? `${FIELDS[f]} · ${f}` : f);

/** Topics a title speaks of (a paper can have several). Rough, but it needs nothing from anyone. */
export const TOPICS: Array<[string, RegExp]> = [
  ['大语言模型', /\b(large language models?|llms?|gpt-?\d*|chatgpt|instruction[- ]tun\w*|in-context|chain[- ]of[- ]thought|prompt\w*)\b/i],
  ['Transformer · 注意力', /\b(transformers?|attention|self-attention)\b/i],
  ['扩散 · 生成模型', /\b(diffusion|denoising|score[- ]based|generative|gans?|generative adversarial|vaes?|variational auto\w*|normali[sz]ing flows?)\b/i],
  ['强化学习', /\b(reinforcement|policy|policies|rewards?|q-learning|bandits?|actor-critic|rlhf)\b/i],
  ['视觉', /\b(images?|visual|vision|videos?|detection|segmentation|convolutional|cnns?|resnets?|vit|pixels?|3d)\b/i],
  ['语言 · 翻译', /\b(language|translation|nlp|texts?|words?|sentences?|bert|reading comprehension|question answering)\b/i],
  ['多模态', /\b(multimodal|multi-modal|vision[- ]language|clip|captioning)\b/i],
  ['优化 · 训练', /\b(optimi[sz]\w*|stochastic gradient|sgd|adam|convergence|normali[sz]ation|dropout|regulari[sz]\w*|training|learning rate)\b/i],
  ['序列 · 状态空间', /\b(state[- ]spaces?|sequence model\w*|recurrent|rnns?|lstm|mamba|ssms?)\b/i],
  ['鲁棒 · 安全', /\b(robust\w*|adversarial attacks?|adversarial examples?|safety|alignment|privacy|backdoor\w*|jailbreak\w*)\b/i],
  ['图网络', /\b(graphs?|gnns?|message passing)\b/i],
  ['语音 · 音频', /\b(speech|audio|acoustic|asr|tts|music)\b/i],
  ['机器人 · 控制', /\b(robot\w*|control|manipulation|locomotion|embodied)\b/i],
  ['检索 · 推荐', /\b(retrieval|recommend\w*|ranking|rag)\b/i],
  ['理论', /\b(theory|theoretical|provabl\w*|generali[sz]ation bounds?|sample complexity)\b/i],
  ['高效 · 压缩', /\b(efficient|efficiency|compression|quanti[sz]ation|pruning|distillation|sparse|sparsity|linear-time)\b/i],
];
/** The topics of a title (worked out once per title: the groups ask again and again). */
const topicMemo = new Map<string, string[]>();
export function topicsOf(title: string): string[] {
  let t = topicMemo.get(title);
  if (!t) {
    t = TOPICS.filter(([, re]) => re.test(title)).map(([x]) => x);
    if (topicMemo.size > 20000) topicMemo.clear();
    topicMemo.set(title, t);
  }
  return t;
}

/** The year a paper came out: as recorded, else from its arXiv number (YYMM.NNNNN, or the old archive/YYMMNNN). */
export function paperYear(m: Pick<PaperMeta, 'year' | 'arxivId'>): number | undefined {
  if (m.year) return m.year;
  const a = m.arxivId || '';
  let yy: number | undefined;
  const nw = /^(\d{2})(\d{2})\.\d{4,5}/.exec(a), old = /^[a-z][a-z.-]+\/(\d{2})\d{5}/i.exec(a);
  if (nw) yy = 2000 + +nw[1];
  else if (old) yy = +old[1] >= 91 ? 1900 + +old[1] : 2000 + +old[1];
  return yy;
}
/** 'He, Kaiming' and 'Kaiming He' are one person. */
export const authorName = (a: string) => (a.includes(',') ? a.split(',').map((x) => x.trim()).filter(Boolean).reverse().join(' ') : a.trim());

/** Everything a search for a paper looks through: title, authors, tags, arXiv number, field, year, topics. */
export function paperWords(m: PaperMeta) {
  const y = paperYear(m);
  return lc([m.title, ...(m.authors || []).map(authorName), ...(m.tags || []).map((t) => '#' + t), m.arxivId || '', m.fileName || '',
    m.field ? fieldLabel(m.field) : '', y ? String(y) : '', ...topicsOf(m.title)].join(' \u0001 '));
}

export function paperSections(list: PaperMeta[], now = Date.now()): Array<Section<PaperMeta>> {
  const read = (m: PaperMeta) => !!m.openedAt;
  const smart: Array<Omit<Group<PaperMeta>, 'n'>> = [
    { key: 'all', label: '全部', test: () => true },
    { key: 'unread', label: '没读过', test: (m) => !read(m) },
    { key: 'read', label: '读过', test: read },
    { key: 'notes', label: '有笔记', test: (m) => (m.notes || 0) > 0 },
    { key: 'new', label: '两周内放上的', test: (m) => now - (m.addedAt || 0) < 14 * DAY },
    { key: 'cold', label: '很久没翻', test: (m) => read(m) && now - (m.openedAt || 0) > 90 * DAY },
  ];
  const tags = tagCounts(list, (m) => m.tags);
  const fields = new Map<string, number>();
  for (const m of list) if (m.field) fields.set(m.field, (fields.get(m.field) || 0) + 1);
  const topics = new Map<string, number>();
  for (const m of list) for (const t of topicsOf(m.title)) topics.set(t, (topics.get(t) || 0) + 1);
  const years = new Map<number, number>();
  for (const m of list) { const y = paperYear(m); if (y) years.set(y, (years.get(y) || 0) + 1); }
  const authors = new Map<string, { name: string; n: number }>();
  // each paper's authors, as one key each ('He, Kaiming' = 'Kaiming He'), worked out once for the counts and the tests
  const keysOf = new Map<PaperMeta, Set<string>>();
  for (const m of list) {
    const ks = new Set<string>();
    for (const a of (m.authors || []).map(authorName)) { const k = lc(a); if (ks.has(k)) continue; ks.add(k); const x = authors.get(k); if (x) x.n++; else authors.set(k, { name: a, n: 1 }); }
    keysOf.set(m, ks);
  }
  const out: Array<Section<PaperMeta>> = [
    { key: 'look', title: '状态', groups: count(list, smart) },
    { key: 'tag', title: '标签', groups: count(list, [
      ...tags.map(({ tag }) => ({ key: 'tag:' + lc(tag), label: '#' + tag, test: (m: PaperMeta) => (m.tags || []).some((t) => lc(t) === lc(tag)) })),
      ...(tags.length ? [{ key: 'tag:-', label: '还没贴标签', test: (m: PaperMeta) => !(m.tags || []).length }] : []),
    ]) },
    { key: 'field', title: '领域', groups: count(list, [...fields.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => ({ key: 'field:' + f, label: fieldLabel(f), test: (m: PaperMeta) => m.field === f }))) },
    { key: 'topic', title: '主题', groups: count(list, [...topics.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => ({ key: 'topic:' + t, label: t, test: (m: PaperMeta) => topicsOf(m.title).includes(t) }))) },
    { key: 'year', title: '年份', groups: count(list, [...years.keys()].sort((a, b) => b - a).map((y) => ({ key: 'year:' + y, label: String(y), test: (m: PaperMeta) => paperYear(m) === y }))) },
    { key: 'author', title: '常读的作者', groups: count(list, [...authors.values()].filter((a) => a.n > 1).sort((a, b) => b.n - a.n).slice(0, 16)
      .map(({ name }) => { const k = lc(name); return { key: 'author:' + k, label: name, test: (m: PaperMeta) => (keysOf.get(m) ?? new Set((m.authors || []).map((x) => lc(authorName(x))))).has(k) }; })) },
  ];
  return out.filter((s) => s.groups.length);
}

/* ---------- books ---------- */
const KINDS: Array<[string, (m: BookMeta) => boolean]> = [
  ['小说 · 文字', (m) => ['epub', 'mobi', 'azw3', 'txt', 'fb2'].includes(m.format)],
  ['漫画', (m) => m.format === 'cbz'],
  ['杂志 · PDF', (m) => m.format === 'pdf'],
  ['网页 · 文档', (m) => m.format === 'html' || m.format === 'md'],
];
const LANGS: Record<string, string> = { zh: '中文', en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español', ru: 'Русский', it: 'Italiano', pt: 'Português' };
export const bookLang = (m: BookMeta) => (m.lang ? m.lang.toLowerCase().split(/[-_]/)[0] : '');
export const bookPercent = (m: BookMeta) => m.progress?.percent ?? 0;

export function bookWords(m: BookMeta) {
  const l = bookLang(m);
  return lc([m.title, m.author || '', ...(m.tags || []).map((t) => '#' + t), m.format, m.fileName || '', LANGS[l] || l].join(' \u0001 '));
}

export function bookSections(list: BookMeta[], now = Date.now()): Array<Section<BookMeta>> {
  const smart: Array<Omit<Group<BookMeta>, 'n'>> = [
    { key: 'all', label: '全部', test: () => true },
    { key: 'unread', label: '还没读', test: (m) => bookPercent(m) < 0.01 },
    { key: 'reading', label: '在读', test: (m) => bookPercent(m) >= 0.01 && bookPercent(m) < 0.97 },
    { key: 'done', label: '读完了', test: (m) => bookPercent(m) >= 0.97 },
    { key: 'marks', label: '有书签', test: (m) => (m.bookmarks || []).length > 0 },
    { key: 'new', label: '两周内放上的', test: (m) => now - (m.addedAt || 0) < 14 * DAY },
  ];
  const tags = tagCounts(list, (m) => m.tags);
  const langs = new Map<string, number>();
  for (const m of list) { const l = bookLang(m); if (l) langs.set(l, (langs.get(l) || 0) + 1); }
  const authors = new Map<string, { name: string; n: number }>();
  for (const m of list) { const a = (m.author || '').trim(); if (!a) continue; const k = lc(a), x = authors.get(k); if (x) x.n++; else authors.set(k, { name: a, n: 1 }); }
  const out: Array<Section<BookMeta>> = [
    { key: 'look', title: '状态', groups: count(list, smart) },
    { key: 'tag', title: '标签', groups: count(list, [
      ...tags.map(({ tag }) => ({ key: 'tag:' + lc(tag), label: '#' + tag, test: (m: BookMeta) => (m.tags || []).some((t) => lc(t) === lc(tag)) })),
      ...(tags.length ? [{ key: 'tag:-', label: '还没贴标签', test: (m: BookMeta) => !(m.tags || []).length }] : []),
    ]) },
    { key: 'kind', title: '类型', groups: count(list, KINDS.map(([label, test]) => ({ key: 'kind:' + label, label, test }))) },
    { key: 'lang', title: '语言', groups: count(list, [...langs.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => ({ key: 'lang:' + l, label: LANGS[l] || l, test: (m: BookMeta) => bookLang(m) === l }))) },
    { key: 'author', title: '作者', groups: count(list, [...authors.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'zh-Hans-CN')).slice(0, 20)
      .map(({ name }) => ({ key: 'author:' + lc(name), label: name, test: (m: BookMeta) => lc((m.author || '').trim()) === lc(name) }))) },
  ];
  return out.filter((s) => s.groups.length);
}

/** Count each group over the list; groups with nobody in them are left out (全部 always stays). */
function count<T>(list: T[], groups: Array<Omit<Group<T>, 'n'>>): Array<Group<T>> {
  const out: Array<Group<T>> = [];
  for (const g of groups) {
    let n = 0;
    for (const m of list) if (g.test(m)) n++;
    if (n || g.key === 'all') out.push({ ...g, n });
  }
  return out;
}

/** Find a group by key in sections (null: not there any more). */
export function findGroup<T>(sections: Array<Section<T>>, key: string): Group<T> | null {
  for (const s of sections) for (const g of s.groups) if (g.key === key) return g;
  return null;
}

/** Every word asked for is in the words (tags may be asked for as #tag or tag). */
export function matches(words: string, q: string) {
  const ws = lc(q).split(/\s+/).filter(Boolean);
  return ws.every((w) => words.includes(w));
}
