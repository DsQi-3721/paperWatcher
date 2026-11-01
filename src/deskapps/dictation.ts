import { h } from '../util/dom';
import { deskApi } from './api';
import { deskAction, DeskPanel } from './panel';
import type { DictationResult, DictationWord } from './types';
import { chooseVoice, DictationSpeech, voiceKey } from './speech';

export class DictationPanel extends DeskPanel {
  private words: DictationWord[] = [];
  private answers = new Map<string, string>();
  private results = new Map<string, DictationResult>();
  private summary = h('span');
  private limit = 10;
  private speech: DictationSpeech | null = null;
  private voice = '';
  private rate = 1;
  private voiceSelect = h('select', { 'aria-label': '英语发音声音' });
  private rateSelect = h('select', { 'aria-label': '发音语速' }, h('option', { value: '1' }, '正常'), h('option', { value: '0.85' }, '慢速'));
  onChange: (words: DictationWord[]) => void = () => {};
  onNotebook: () => void = () => {};
  constructor(root: HTMLElement) {
    super(root, '英语默写', '来自词本里最新收集的单词和短语。看中文、听发音，再写英文。', 'da-dictation');
    try { const saved = JSON.parse(localStorage.getItem('pw.dictation.speech.v1') || '{}'); this.voice = typeof saved?.voice === 'string' ? saved.voice : ''; this.rate = saved?.rate === .85 ? .85 : 1; } catch { /* defaults */ }
    if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
      this.speech = new DictationSpeech(speechSynthesis, (text) => new SpeechSynthesisUtterance(text), (text, error) => this.message(text, error));
      speechSynthesis.addEventListener('voiceschanged', () => this.updateVoices());
    }
    this.voiceSelect.addEventListener('change', () => { this.stopSpeech(); this.voice = this.voiceSelect.value; this.saveVoice(); });
    this.rateSelect.value = String(this.rate);
    this.rateSelect.addEventListener('change', () => { this.stopSpeech(); this.rate = +this.rateSelect.value; this.saveVoice(); });
    this.updateVoices();
  }
  override hide() { this.stopSpeech(); super.hide(); }
  private stopSpeech() { this.speech?.stop(); this.message(''); }
  private saveVoice() { try { localStorage.setItem('pw.dictation.speech.v1', JSON.stringify({ voice: this.voice, rate: this.rate })); } catch { /* speech works without storage */ } }
  private updateVoices() {
    const voices = this.speech?.voices() || [], recommended = chooseVoice(voices);
    // Voice lists can arrive after the panel opens; keep the saved preference until then.
    const selected = voices.some((v) => voiceKey(v) === this.voice) ? this.voice : '';
    this.voiceSelect.replaceChildren(h('option', { value: '' }, recommended ? `自动 · ${recommended.name} (${recommended.lang})` : '暂无普通英语声音'),
      ...voices.map((v) => h('option', { value: voiceKey(v) }, `${v.name} (${v.lang})`)));
    this.voiceSelect.value = selected; this.voiceSelect.disabled = !voices.length;
  }
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
    this.updateVoices();
    const preview = deskAction('试听', () => { void this.speech?.speak("Hello. Let's practice English.", this.voice, this.rate); }); preview.disabled = !this.speech;
    const speechControls = h('div', { class: 'da-speech-controls' }, h('label', null, '发音 ', this.voiceSelect), h('label', null, '语速 ', this.rateSelect), preview,
      deskAction('停止朗读', () => this.stopSpeech()));
    const list = h('div', { class: 'da-dict-list' }, ...this.words.map((word, i) => this.card(word, i)));
    if (!this.words.length) list.append(h('div', { class: 'da-empty' }, h('p', null, '词本里还没有单词或短语。先从论文中收藏几个，就会出现在这里。'), deskAction('打开英语词本', () => { this.hide(); this.onNotebook(); }, 'primary')));
    this.body.replaceChildren(toolbar, speechControls, h('p', { class: 'da-help' }, '忽略大小写、首尾空格和句末标点，按词本中的拼写检查；单词内部的连字符和撇号需要保留。'), list);
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
    const speak = deskAction('听发音', () => { void this.speech?.speak(word.english, this.voice, this.rate); });
    speak.disabled = !this.speech;
    return h('article', { class: 'da-dict-card' }, h('div', { class: 'da-dict-question' }, h('span', { class: 'da-number' }, String(i + 1).padStart(2, '0')), h('h2', null, word.chinese), speak), form, feedback);
  }
}
