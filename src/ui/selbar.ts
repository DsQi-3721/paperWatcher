// The sticky strip that appears next to a selection: ask the AI (typed or one-tap prompts), highlight,
// copy, export. It follows the selection while the camera moves.
import type { Selection } from '../select/selection';
import { HIGHLIGHTS, type HighlightColor } from '../theme';
import { h } from '../util/dom';
import { ICONS } from './icons';

export interface QuickAsk { key: string; label: string; prompt: string }

export interface SelbarActions {
  ask(prompt?: string): void;
  highlight(color: HighlightColor): void;
  copy(): void;
  exportMenu(anchor: HTMLElement): void;
  english(translate?: boolean): void;
}

export function quickAsksFor(sel: Selection, lang: 'zh' | 'en' | 'auto'): QuickAsk[] {
  const zh = lang !== 'en';
  const P = (zhText: string, enText: string) => (zh ? zhText : enText);
  const base: QuickAsk[] = [];
  if (sel.kind === 'region') {
    const what = sel.figKind === 'table' ? P('这张表', 'this table') : sel.figKind === 'equation' ? P('这个公式', 'this equation') : sel.figKind === 'algorithm' ? P('这个算法', 'this algorithm') : P('这张图', 'this figure');
    if (sel.figKind === 'equation') {
      base.push({ key: 'derive', label: P('逐项讲', 'Walk me through'), prompt: P('逐个解释这个公式里每个符号的含义，并说明它为什么成立、在论文里用来做什么。', 'Explain every symbol in this equation, why it holds, and what the paper uses it for.') });
      base.push({ key: 'intuit', label: P('直觉', 'Intuition'), prompt: P('用直觉和一个小例子讲讲这个公式在做什么。', 'Give me the intuition behind this equation with a tiny worked example.') });
    } else {
      base.push({ key: 'read', label: P('读懂它', 'Read it'), prompt: P(`带我读懂${what}：它在展示什么、怎么看、关键结论是什么？`, `Help me read ${what}: what it shows, how to read it, and the key takeaway.`) });
      base.push({ key: 'why', label: P('说明了什么', 'So what?'), prompt: P(`${what}支撑了论文的哪个论点？有没有值得怀疑的地方？`, `Which claim of the paper does ${what} support, and is anything about it questionable?`) });
    }
    base.push({ key: 'translate', label: P('翻译', 'Translate'), prompt: P('把这里的文字（包括图注）翻译成中文，术语保留英文。', 'Translate the text here (including the caption) into English.') });
    return base;
  }
  const unit = sel.unit;
  if (unit === 'word' || unit === 'phrase') {
    base.push({ key: 'define', label: P('什么意思', 'Meaning'), prompt: P('这个词在这篇论文里是什么意思？在哪里定义的，和常见用法有什么不同？', 'What does this term mean in this paper, where is it defined, and how does it differ from common usage?') });
    base.push({ key: 'translate', label: P('翻译', 'Translate'), prompt: P('翻译成中文，并给一句简短解释。', 'Translate and explain briefly.') });
  } else if (unit === 'section' || unit === 'paragraph') {
    base.push({ key: 'summary', label: P('讲要点', 'Key points'), prompt: P('这一部分在讲什么？用几条要点帮我抓住核心，并说明它在全文中的作用。', 'What is this part about? Give me the key points and its role in the paper.') });
    base.push({ key: 'explain', label: P('讲明白', 'Explain'), prompt: P('用通俗的话把这一段讲明白，难点多解释一下。', 'Explain this in plain words, spending more time on the hard parts.') });
    base.push({ key: 'translate', label: P('翻译', 'Translate'), prompt: P('翻译成中文（术语保留英文），保持原意。', 'Translate faithfully, keeping technical terms.') });
  } else {
    base.push({ key: 'explain', label: P('讲明白', 'Explain'), prompt: P('这句话是什么意思？为什么作者要这样说？', 'What does this mean, and why do the authors say it?') });
    base.push({ key: 'translate', label: P('翻译', 'Translate'), prompt: P('翻译成中文（术语保留英文）。', 'Translate faithfully, keeping technical terms.') });
    base.push({ key: 'example', label: P('举个例子', 'Example'), prompt: P('举一个具体的例子帮我理解。', 'Give me a concrete example to make this click.') });
  }
  base.push({ key: 'doubt', label: P('有疑问', 'Critique'), prompt: P('这里有什么隐含假设、局限或者值得质疑的地方？', 'What hidden assumptions, limitations or weak points are there here?') });
  return base;
}

export class Selbar {
  el: HTMLDivElement;
  private quick: HTMLDivElement;
  private hlRow: HTMLDivElement;
  private vocab: HTMLButtonElement;
  visible = false;

  constructor(root: HTMLElement, private actions: SelbarActions) {
    const askBtn = h('button', { class: 'sb-ask', type: 'button', title: '问 AI（回车）', html: `<span class="sb-pen">${ICONS.pencil}</span><span>问 AI…</span>` });
    askBtn.addEventListener('click', () => actions.ask());
    this.quick = h('div', { class: 'sb-quick' });
    this.hlRow = h('div', { class: 'sb-hl' });
    for (const c of Object.keys(HIGHLIGHTS) as HighlightColor[]) {
      const b = h('button', { class: `sb-chip c-${c}`, type: 'button', title: '高亮', style: `--c:${HIGHLIGHTS[c]}` });
      b.addEventListener('click', () => actions.highlight(c));
      this.hlRow.append(b);
    }
    const copy = h('button', { class: 'sb-ico', type: 'button', title: '复制 (⌘C)', html: ICONS.copy });
    copy.addEventListener('click', () => actions.copy());
    const exp = h('button', { class: 'sb-ico', type: 'button', title: '导出', html: ICONS.download });
    exp.addEventListener('click', () => actions.exportMenu(exp));
    this.vocab = h('button', { class: 'sb-vocab', type: 'button', onclick: () => actions.english() }, '加入词本');
    this.el = h('div', { class: 'selbar' }, askBtn, this.quick, this.vocab, h('span', { class: 'sb-sep' }), this.hlRow, copy, exp);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.append(this.el);
  }

  show(sel: Selection, lang: 'zh' | 'en' | 'auto') {
    this.quick.replaceChildren(...quickAsksFor(sel, lang).map((q) => {
      const b = h('button', { class: 'sb-q', type: 'button', title: q.prompt }, q.label);
      b.addEventListener('click', () => q.key === 'translate' && sel.kind === 'text' ? this.actions.english(true) : this.actions.ask(q.prompt));
      return b;
    }));
    this.hlRow.style.display = sel.kind === 'text' ? '' : 'none';
    this.vocab.hidden = sel.kind !== 'text';
    if (!this.visible) {
      this.el.classList.remove('on');
      void this.el.offsetWidth;
    }
    this.el.classList.add('on');
    this.visible = true;
  }

  hide() {
    this.el.classList.remove('on');
    this.visible = false;
  }

  /** Place under (or above) a screen rect, clamped to the window. */
  place(r: { x: number; y: number; w: number; h: number }) {
    if (!this.visible) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = this.el.offsetWidth || 420, hh = this.el.offsetHeight || 46;
    let x = r.x + r.w - w * 0.35;
    let y = r.y + r.h + 12;
    if (y + hh > vh - 70) y = r.y - hh - 14;
    x = Math.max(12, Math.min(vw - w - 12, x));
    y = Math.max(10, Math.min(vh - hh - 10, y));
    this.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) rotate(-0.6deg)`;
  }
}
