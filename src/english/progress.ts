import { h } from '../util/dom';
import type { EnglishProgress } from './types';

/** Counts verified entries, not a guessed percentage of model runtime. */
export class EnglishProgressView {
  el = h('section', { class: 'en-progress', hidden: true, 'aria-label': 'AI 学习任务进度' });
  private phase = h('strong');
  private elapsed = h('span', { class: 'en-elapsed' });
  private bar = h('progress', { 'aria-label': '词条核对进度' });
  private counts = h('span');
  private chars = h('span');
  private latest = h('div', { class: 'en-progress-latest' });
  private timer?: ReturnType<typeof setInterval>;
  private startTime = 0;
  private stoppedAt = 0;
  private mode: 'extract' | 'selection' | 'translate' = 'extract';
  private state: EnglishProgress = { phase: 'reading', text: '' };

  constructor() {
    const close = h('button', { type: 'button', class: 'en-progress-close', 'aria-label': '收起进度', title: '收起进度（不取消任务）', onclick: () => this.dismiss() }, '×');
    this.el.append(h('div', { class: 'en-progress-head' }, this.phase, h('div', { class: 'en-progress-tools' }, this.elapsed, close)), this.bar,
      h('div', { class: 'en-progress-counts' }, this.counts, this.chars), this.latest);
  }
  dismiss() {
    this.el.hidden = true;
    clearInterval(this.timer); this.timer = undefined;
  }
  start(mode: typeof this.mode, target: number) {
    clearInterval(this.timer);
    this.mode = mode; this.startTime = Date.now(); this.stoppedAt = 0;
    this.state = { phase: 'reading', text: '准备论文文字…', target: mode === 'translate' ? undefined : target, completed: 0, chars: 0 };
    this.el.hidden = false; this.el.classList.remove('error'); this.paint();
    this.timer = setInterval(() => this.paint(), 1000);
  }
  update(progress: Partial<EnglishProgress>) { this.state = { ...this.state, ...progress }; this.paint(); }
  finish(text: string, completed?: number, error = false) {
    clearInterval(this.timer); this.timer = undefined; this.stoppedAt = Date.now();
    this.state = { ...this.state, phase: error ? 'stopped' : 'complete', text, completed: completed ?? this.state.completed };
    this.el.classList.toggle('error', error); this.paint();
  }
  private paint() {
    this.phase.textContent = this.state.text;
    const seconds = Math.max(0, Math.floor(((this.stoppedAt || Date.now()) - this.startTime) / 1000));
    this.elapsed.textContent = `已用 ${seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ` : ''}${seconds % 60} 秒`;
    const { phase, target, completed = 0, chars = 0, pagesDone, pagesTotal } = this.state;
    if (phase === 'reading' && pagesTotal) {
      this.bar.max = pagesTotal; this.bar.value = pagesDone || 0;
      this.counts.textContent = `已读取 ${pagesDone || 0} / ${pagesTotal} 页`;
    } else if (this.mode !== 'translate' && target && (completed > 0 || phase === 'complete' || phase === 'stopped')) {
      this.bar.max = target; this.bar.value = completed;
      this.counts.textContent = `已核对 ${completed} / ${target} 项${this.state.batch ? ` · 第 ${this.state.batch} 批` : ''}`;
    } else {
      this.bar.removeAttribute('value');
      this.counts.textContent = phase === 'reading' ? '读取论文文字' : this.mode === 'translate' ? '正在翻译' : `已核对 0 / ${target} 项 · 等待完整词条`;
    }
    if (this.mode === 'translate' && phase === 'complete') { this.bar.max = 1; this.bar.value = 1; this.counts.textContent = '翻译完成'; }
    if (phase === 'stopped' && this.mode === 'translate') { this.bar.max = 1; this.bar.value = 0; this.counts.textContent = '任务已停止'; }
    this.chars.textContent = chars ? `已生成 ${chars.toLocaleString()} 字符` : '';
    this.latest.textContent = this.state.latest ? `最近完成：${this.state.latest}`
      : seconds >= 30 && phase === 'waiting' ? '仍在等待模型输出，可随时取消。' : '';
  }
}
