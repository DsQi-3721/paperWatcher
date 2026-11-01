import { h } from '../util/dom';
import { deskApi } from './api';
import { deskAction, DeskPanel } from './panel';
import type { DictationResult, DictationWord } from './types';

export class DictationPanel extends DeskPanel {
  private words: DictationWord[] = [];
  private answers = new Map<string, string>();
  private results = new Map<string, DictationResult>();
  private summary = h('span');
  private limit = 10;
  onChange: (words: DictationWord[]) => void = () => {};
  onNotebook: () => void = () => {};
  constructor(root: HTMLElement) { super(root, '英语默写', '来自词本里最新收集的单词和短语。看中文、听发音，再写英文。', 'da-dictation'); }
  async show() { this.openPanel(); await this.refresh(); }
  async refresh() {
    try { this.words = await deskApi.words(this.limit); this.render(); this.onChange(this.words); }
    catch (e: any) { this.message(e.message, true); }
  }
  private updateSummary() { const done = this.words.filter((w) => this.results.has(w.id)); const correct = done.filter((w) => this.results.get(w.id)?.correct); this.summary.textContent = `已检查 ${done.length} / ${this.words.length} 项 · 答对 ${correct.length} 项`; }
  private render() {
    const count = h('input', { type: 'number', min: 1, max: 50, value: this.limit, 'aria-label': '本轮默写数量' });
    const refresh = deskAction('刷新最新词条', () => { this.limit = Math.max(1, Math.min(50, +count.value || 10)); this.answers.clear(); this.results.clear(); this.message(''); void this.refresh(); });
    this.updateSummary();
    const toolbar = h('div', { class: 'da-dict-tools' }, h('label', null, '本轮数量 ', count), refresh, this.summary);
    const list = h('div', { class: 'da-dict-list' }, ...this.words.map((word, i) => this.card(word, i)));
    if (!this.words.length) list.append(h('div', { class: 'da-empty' }, h('p', null, '词本里还没有单词或短语。先从论文中收藏几个，就会出现在这里。'), deskAction('打开英语词本', () => { this.hide(); this.onNotebook(); }, 'primary')));
    this.body.replaceChildren(toolbar, h('p', { class: 'da-help' }, '忽略大小写、首尾空格和句末标点，按词本中的拼写检查；单词内部的连字符和撇号需要保留。'), list);
  }
  private card(word: DictationWord, i: number) {
    const answer = h('input', { type: 'text', value: this.answers.get(word.id) || '', placeholder: '输入英文单词或短语', autocomplete: 'off', spellcheck: false, autocapitalize: 'off', maxLength: 500, 'aria-label': `第 ${i + 1} 题英文答案` });
    answer.addEventListener('input', () => this.answers.set(word.id, answer.value));
    const feedback = h('div', { class: 'da-feedback', role: 'status', 'aria-live': 'polite' });
    const explain = (result: DictationResult) => { feedback.className = `da-feedback ${result.correct ? 'correct' : 'wrong'}`; feedback.replaceChildren(h('strong', null, result.correct ? '✓ 正确' : '✕ 再看一下拼写'), h('span', { lang: 'en' }, result.english), h('p', null, word.meaningZh)); };
    const previous = this.results.get(word.id); if (previous) explain(previous);
    const submit = h('button', { type: 'submit', class: 'primary' }, '检查答案');
    const form = h('form', { class: 'da-answer' }, answer, submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!answer.value.trim()) { answer.focus(); return; } submit.disabled = true;
      try { const result = await deskApi.check(word.id, answer.value); this.results.set(word.id, result); word.previous = result; explain(result); this.updateSummary(); this.onChange(this.words); }
      catch (err: any) { feedback.textContent = err.message; feedback.className = 'da-feedback wrong'; }
      finally { submit.disabled = false; }
    });
    const speak = deskAction('听发音', () => {
      const utterance = new SpeechSynthesisUtterance(word.english); utterance.lang = 'en-US'; utterance.rate = .85;
      const voices = speechSynthesis.getVoices(); utterance.voice = voices.find((v) => v.localService && v.lang.startsWith('en')) || voices.find((v) => v.lang.startsWith('en')) || null;
      speechSynthesis.cancel(); speechSynthesis.speak(utterance);
    });
    speak.disabled = !('speechSynthesis' in window);
    return h('article', { class: 'da-dict-card' }, h('div', { class: 'da-dict-question' }, h('span', { class: 'da-number' }, String(i + 1).padStart(2, '0')), h('h2', null, word.chinese), speak), form, feedback);
  }
}
