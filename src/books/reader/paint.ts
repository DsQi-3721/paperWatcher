// A laid-out page into DOM: one absolutely placed line per laid-out line, a span per fragment in the very font
// string pretext measured it with, so the page shows exactly what was measured. Justified lines are spread to the
// column's width by letter spacing (CJK) or word spacing (Latin). Text stays real text: it can be selected and copied.
import type { Item, Line, Page } from './flow';

export interface PaintOpts {
  /** a picture's URL by its key in the book */
  imgUrl(src: string): string;
  /** extra letter spacing every line already has (px) */
  letter: number;
  /** characters [o0, o1) of a chapter to mark (a search hit) */
  mark?: { chapter: number; o0: number; o1: number } | null;
  /** y added to every item (the scroll view stacks pages) */
  dy?: number;
}

const graphemes = (s: string) => { let n = 0; for (const _ of s) n++; return n; };

function lineEl(L: Line, page: Page, o: PaintOpts): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bk-line' + (L.cls ? ' ' + L.cls : '');
  const st = el.style;
  st.top = `${L.y + (o.dy ?? 0)}px`;
  st.left = `${L.x}px`;
  st.height = `${L.h}px`;
  st.lineHeight = `${L.h}px`;
  if (L.align === 'center') { st.width = `${L.maxW}px`; st.textAlign = 'center'; }
  let letter = o.letter, word = 0;
  if (L.justify) {
    // spread the gap left over the line: between words if it has spaces, else between characters
    const slack = L.maxW - L.w, txt = L.frags.map((f) => f.text).join('').replace(/\s+$/, '');
    const spaces = (txt.match(/ /g) || []).length, n = graphemes(txt.replace(/ /g, ''));
    if (spaces >= 2 && /[A-Za-z]/.test(txt)) word = slack / spaces;
    else if (n > 1) letter += slack / (n - 1);
  }
  if (letter) st.letterSpacing = `${letter.toFixed(3)}px`;
  if (word) st.wordSpacing = `${word.toFixed(3)}px`;
  const mark = o.mark && o.mark.chapter === page.chapter && o.mark.o1 > L.o0 && o.mark.o0 < L.o1 ? o.mark : null;
  for (const f of L.frags) {
    if (f.box) { const b = document.createElement('span'); b.className = 'bk-box'; b.style.width = `${f.w}px`; if (f.gap) b.style.marginLeft = `${f.gap}px`; el.append(b); continue; }
    let span: HTMLElement;
    if (f.href) { span = document.createElement('a'); (span as HTMLAnchorElement).dataset.href = f.href; }
    else span = document.createElement('span');
    span.className = 'bk-f' + (f.cls ? ' ' + f.cls : '');
    span.style.font = f.font;
    if (f.gap) span.style.marginLeft = `${f.gap.toFixed(2)}px`;
    if (f.ruby) {
      // the reading floats over the text without touching the line (a real <ruby> would push the line down)
      const rb = document.createElement('span'), rt = document.createElement('span');
      rb.className = 'bk-rb';
      rt.className = 'bk-rt';
      rt.textContent = f.ruby;
      rb.append(f.text, rt);
      span.append(rb);
    } else if (mark && mark.o1 > f.o0 && mark.o0 < f.o1) {
      // the hit inside this fragment (offsets map 1:1 unless white space was collapsed: then by proportion)
      const len = f.text.length, span0 = Math.max(1, f.o1 - f.o0);
      const a = Math.max(0, Math.round(((mark.o0 - f.o0) / span0) * len)), z = Math.min(len, Math.round(((mark.o1 - f.o0) / span0) * len));
      if (a > 0) span.append(f.text.slice(0, a));
      const mk = document.createElement('mark');
      mk.className = 'bk-mark';
      mk.textContent = f.text.slice(a, Math.max(a + 1, z));
      span.append(mk);
      if (z < len) span.append(f.text.slice(Math.max(a + 1, z)));
    } else span.textContent = f.text;
    span.dataset.o = String(f.o0);
    el.append(span);
  }
  if (L.bullet) { const b = document.createElement('span'); b.className = 'bk-bullet'; b.setAttribute('aria-hidden', 'true'); el.append(b); }
  el.dataset.o0 = String(L.o0);
  return el;
}

function itemEl(it: Item, page: Page, o: PaintOpts): HTMLElement {
  if (it.kind === 'line') return lineEl(it, page, o);
  if (it.kind === 'img') {
    const img = document.createElement('img');
    img.className = 'bk-img';
    img.src = o.imgUrl(it.src);
    img.alt = it.alt || '';
    img.draggable = false;
    img.decoding = 'async';
    Object.assign(img.style, { left: `${it.x}px`, top: `${it.y + (o.dy ?? 0)}px`, width: `${it.w}px`, height: `${it.h}px` });
    return img;
  }
  const hr = document.createElement('div');
  hr.className = 'bk-hr';
  hr.innerHTML = `<svg viewBox="0 0 120 12" preserveAspectRatio="none"><path d="M4 7 C 24 3, 38 10, 60 6 S 98 3, 116 7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  Object.assign(hr.style, { left: `${Math.round(it.w * 0.32)}px`, top: `${it.y + (o.dy ?? 0) + it.h / 2 - 6}px`, width: `${Math.round(it.w * 0.36)}px` });
  return hr;
}

/** A page's text area: the lines, pictures and rules at their places. */
export function paintPage(page: Page, o: PaintOpts): HTMLDivElement {
  const box = document.createElement('div');
  box.className = 'bk-text';
  const frag = document.createDocumentFragment();
  for (const it of page.items) frag.append(itemEl(it, page, o));
  box.append(frag);
  return box;
}

/** Items of a page added into an existing box, shifted down by dy (the scroll view). */
export function paintInto(box: HTMLElement, page: Page, o: PaintOpts) {
  const frag = document.createDocumentFragment();
  for (const it of page.items) frag.append(itemEl(it, page, o));
  box.append(frag);
}
