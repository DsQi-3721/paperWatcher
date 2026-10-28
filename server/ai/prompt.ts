// Builds the reading-companion instructions and the per-question messages for every provider.
import type { PaperMeta, Settings } from '../store.ts';

export interface SelectionInfo {
  kind: string;          // word | phrase | sentence | passage | paragraph | section | figure | table | equation | region | paper
  page?: number;         // 1-based
  pageEnd?: number;
  text?: string;         // exact selected text
  context?: string;      // surrounding text, the selection wrapped in ⟦ ⟧
  section?: string;      // enclosing section title
  label?: string;        // e.g. "Figure 3"
  caption?: string;
}

export interface AskBody {
  paperId: string;
  threadId: string;
  provider?: Settings['provider'];
  sessionId?: string;
  question: string;
  selection?: SelectionInfo;
  images?: string[];     // data URLs
  history?: Array<{ role: 'user' | 'ai'; text: string }>;
  outline?: string;      // "p.1 Introduction\np.3 2 Background …"
}

const KIND_LABEL: Record<string, string> = {
  word: 'a word', phrase: 'a phrase', sentence: 'a sentence', passage: 'a passage', paragraph: 'a paragraph',
  section: 'a whole section', figure: 'a figure', table: 'a table', equation: 'an equation', region: 'a region of the page',
  algorithm: 'an algorithm', paper: 'the whole paper',
};

function languageRule(lang: Settings['language']) {
  if (lang === 'zh') return 'Simplified Chinese (keep established technical terms in English in parentheses where it helps)';
  if (lang === 'en') return 'English';
  return "the language of the user's question (a question in Chinese gets an answer in Chinese, keeping established technical terms in English in parentheses where it helps)";
}

export function systemPrompt(opts: {
  meta: PaperMeta | null;
  settings: Settings;
  fileAccess: boolean;
  paperText?: string;
  outline?: string;
}) {
  const m = opts.meta;
  const title = m?.title ? `"${m.title}"` : 'an untitled paper';
  const authors = m?.authors?.length ? ` by ${m.authors.slice(0, 6).join(', ')}${m.authors.length > 6 ? ' et al.' : ''}` : '';
  const arxiv = m?.arxivId ? ` (arXiv:${m.arxivId})` : '';
  const pages = m?.pages ? ` ${m.pages} pages.` : '';
  const access = opts.fileAccess
    ? `The full text of the paper, with page markers like "=== Page 3 ===", is in ./paper.txt in your working directory. Each question already includes the selected text and its surroundings; open or grep paper.txt only when you need other parts of the paper (a definition, a later section, results, the appendix). Read-only: never modify files.`
    : opts.paperText
      ? `The full text of the paper follows, with page markers like "=== Page 3 ===".\n<paper>\n${opts.paperText}\n</paper>`
      : `Only the selected text and its surroundings are available to you.`;

  return `You are Paper Watcher, a sharp and warm research mentor reading a paper side by side with the user. The user marks a passage, figure, equation or section on the printed paper and asks about it. Your answer is handwritten onto a sheet of scratch paper lying next to the page, so write like a brilliant friend scribbling an explanation, not like a report.

Paper: ${title}${authors}${arxiv}.${pages}
${opts.outline ? `Outline:\n${opts.outline}\n` : ''}
${access}

How to answer
- Reply in ${languageRule(opts.settings.language)}.
- Stay on the exact selection and the question. Explain the idea, the intuition and the why; connect it to the rest of the paper when that helps (where a symbol is defined, where the idea is used, which results depend on it).
- Keep it short enough to fit on scratch paper: usually 60-220 words (or 120-400 Chinese characters). Go longer only when the user asks for depth or a derivation.
- Format: short paragraphs, "- " bullets, **bold** for the one or two key terms, inline math as $...$ and display math as $$...$$ (LaTeX). No headings, no tables, no code unless asked.
- When you rely on a specific place in the paper, cite it inline as <ref page="N">exact words copied from the paper</ref>: 4-12 words, verbatim, with the page where they appear. Only quote text that really is in the paper; use 0-3 refs per answer.
- Never narrate what you are doing ("Let me read the file..."); just answer.
- Finish with exactly one line <margin>gist</margin>: the takeaway someone would pencil into the paper's margin, at most 12 words (or 20 Chinese characters), in the reply's language.`;
}

export function firstTurnMessage(b: AskBody, hasImage: boolean) {
  const s = b.selection;
  const parts: string[] = [];
  if (s && s.kind !== 'paper') {
    const where = [
      s.page ? `page ${s.page}${s.pageEnd && s.pageEnd !== s.page ? `-${s.pageEnd}` : ''}` : '',
      s.section ? `section "${s.section}"` : '',
      s.label || '',
    ].filter(Boolean).join(', ');
    parts.push(`[I selected ${KIND_LABEL[s.kind] || s.kind}${where ? ` - ${where}` : ''}]`);
    if (s.text) parts.push(`"""\n${clip(s.text, 6000)}\n"""`);
    if (s.caption && !(s.text || '').includes(s.caption.slice(0, 40))) parts.push(`[Caption]\n${clip(s.caption, 1500)}`);
    if (s.context && s.context.trim() !== (s.text || '').trim()) {
      parts.push(`[Surrounding text - my selection is marked with ⟦ ⟧]\n"""\n${clip(s.context, 5000)}\n"""`);
    }
    if (hasImage) parts.push('[The attached image shows exactly what I selected on the page; trust it over garbled extracted text, especially for math.]');
  } else {
    parts.push('[Question about the whole paper]');
  }
  parts.push(`[My question]\n${b.question.trim()}`);
  return parts.join('\n\n');
}

export function followUpMessage(b: AskBody, hasImage: boolean) {
  return (hasImage ? '[Image attached]\n' : '') + b.question.trim();
}

function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + ' …' : s;
}
