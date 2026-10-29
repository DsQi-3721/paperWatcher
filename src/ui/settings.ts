// The AI index card: which reading companion to use and how.
import { api } from '../api';
import type { AiStatus, Provider, Settings } from '../types';
import { debounce, h } from '../util/dom';
import { ICONS } from './icons';

export class SettingsCard {
  el: HTMLDivElement;
  private body: HTMLDivElement;
  private s: Settings | null = null;
  private st: AiStatus | null = null;
  private save = debounce(async (patch: any) => {
    try {
      this.s = await api.saveSettings(patch);
      this.onChange(this.s);
    } catch (e: any) {
      this.toast('保存失败：' + e.message, 'error');
    }
  }, 350);
  onChange: (s: Settings) => void = () => {};

  constructor(root: HTMLElement, private toast: (m: string, k?: 'info' | 'error' | 'ok') => void) {
    this.body = h('div', { class: 'set-body' });
    const close = h('button', { class: 'card-close', type: 'button', html: ICONS.close, title: '收起' });
    close.addEventListener('click', () => this.hide());
    this.el = h('div', { class: 'card settings' }, close, h('div', { class: 'card-title' }, '阅读伙伴 · AI'), this.body);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.hide(); });
    root.append(this.el);
  }

  get open() { return this.el.classList.contains('on'); }

  async show() {
    this.el.classList.add('on');
    this.body.replaceChildren(h('div', { class: 'set-loading' }, '看看你桌上有哪些 AI…'));
    try {
      [this.s, this.st] = await Promise.all([api.settings(), api.status(true)]);
      this.render();
    } catch (e: any) {
      this.body.replaceChildren(h('div', { class: 'set-err' }, '读不到设置：' + e.message));
    }
  }

  hide() { this.el.classList.remove('on'); }

  toggle() { if (this.open) this.hide(); else this.show(); }

  private render() {
    const s = this.s!, st = this.st!;
    const prov = (id: Provider, name: string, sub: string, ok: boolean, detail: string) => {
      const b = h('button', { class: `prov${s.provider === id ? ' on' : ''}${ok ? '' : ' missing'}`, type: 'button' },
        h('span', { class: 'prov-name' }, name), h('span', { class: 'prov-sub' }, sub), h('span', { class: 'prov-st' }, detail));
      b.addEventListener('click', () => { s.provider = id; this.save({ provider: id }); this.render(); });
      return b;
    };
    const field = (label: string, input: HTMLElement, hint?: string) => h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, label), input, hint ? h('span', { class: 'fld-h' }, hint) : null);
    const text = (val: string, ph: string, onInput: (v: string) => void, type = 'text') => {
      const i = h('input', { type, value: val, placeholder: ph, spellcheck: false, autocomplete: 'off' }) as HTMLInputElement;
      i.addEventListener('input', () => onInput(i.value));
      return i;
    };
    const select = (val: string, opts: Array<[string, string]>, onChange: (v: string) => void) => {
      const sel = h('select', null, ...opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l))) as HTMLSelectElement;
      sel.addEventListener('change', () => onChange(sel.value));
      return sel;
    };
    const check = (val: boolean, label: string, onChange: (v: boolean) => void) => {
      const c = h('input', { type: 'checkbox', checked: val }) as HTMLInputElement;
      c.addEventListener('change', () => onChange(c.checked));
      return h('label', { class: 'chk' }, c, h('span', { class: 'chk-box' }), h('span', null, label));
    };
    const efforts: Array<[string, string]> = [['low', '快 · low'], ['medium', '适中 · medium'], ['high', '深思 · high']];

    const provRow = h('div', { class: 'provs' },
      prov('claude', 'Claude Code', '本地 claude CLI', st.claude.installed, st.claude.installed ? (st.claude.version || '已安装') : '未找到 claude'),
      prov('codex', 'Codex · GPT', '本地 codex CLI（ChatGPT 账号）', st.codex.installed, st.codex.installed ? (st.codex.login || st.codex.version || '已安装') : '未找到 codex'),
      prov('openai', 'OpenAI 兼容 API', '网页 / 自建 GPT 接口', st.openai.configured, st.openai.configured ? (s.openai.model || '已配置') : '需要 API Key'),
    );
    let detail: HTMLElement;
    if (s.provider === 'claude') {
      detail = h('div', { class: 'set-detail' },
        field('模型', text(s.claude.model, '默认（跟随 claude 设置）· sonnet / opus / haiku', (v) => this.save({ claude: { model: v.trim() } }))),
        field('思考深度', select(s.claude.effort, efforts, (v) => this.save({ claude: { effort: v } })), 'low 回答最快，适合边读边问'),
        check(s.claude.allowWeb, '允许上网查资料（WebSearch / WebFetch）', (v) => this.save({ claude: { allowWeb: v } })),
        check(s.claude.loadUserSettings, '加载我的 Claude Code 设置（hooks、插件、权限；启动更慢，且不再把读文件限制在本论文文件夹）', (v) => this.save({ claude: { loadUserSettings: v } })),
        field('程序路径', text(s.claude.bin, 'claude', (v) => this.save({ claude: { bin: v.trim() || 'claude' } }))),
        h('div', { class: 'set-note' }, 'Claude 以受限模式运行：只有只读工具（Read/Grep/Glob），且只能读这篇论文的文件夹（含全文 paper.txt）。每条笔记是一个独立会话，追问时上下文连续。'),
      );
    } else if (s.provider === 'codex') {
      detail = h('div', { class: 'set-detail' },
        field('模型', text(s.codex.model, '默认（跟随 ~/.codex/config.toml）', (v) => this.save({ codex: { model: v.trim() } }))),
        field('思考深度', select(s.codex.effort, efforts, (v) => this.save({ codex: { effort: v } })), 'low 回答最快'),
        check(s.codex.httpTransport, '走 HTTPS 连接（网络屏蔽 WebSocket 时能快很多，推荐）', (v) => this.save({ codex: { httpTransport: v } })),
        field('程序路径', text(s.codex.bin, 'codex', (v) => this.save({ codex: { bin: v.trim() || 'codex' } }))),
        h('div', { class: 'set-note' }, 'Codex 使用你登录的 ChatGPT 账号，沙箱为只读。没有登录的话，在终端运行 codex login。'),
      );
    } else {
      detail = h('div', { class: 'set-detail' },
        field('接口地址', text(s.openai.baseUrl, 'https://api.openai.com/v1', (v) => this.save({ openai: { baseUrl: v.trim() } })), '也可以填 Ollama / LM Studio / DeepSeek 等兼容地址'),
        field('接口类型', select(s.openai.protocol, [['chat', 'Chat Completions'], ['responses', 'Responses（Codex 兼容）']], (v) => this.save({ openai: { protocol: v } }))),
        field('API Key', text(s.openai.hasKey ? s.openai.apiKey : '', 'sk-…', (v) => this.save({ openai: { apiKey: v.trim() } }), 'password'), '只保存在本机 data/settings.json'),
        field('模型', text(s.openai.model, 'gpt-4.1-mini', (v) => this.save({ openai: { model: v.trim() } }))),
        check(s.openai.fullText, '把全文一起发给模型（问得更准，费 token 更多）', (v) => this.save({ openai: { fullText: v } })),
      );
    }
    const lang = field('回答语言', select(s.language, [['auto', '跟着我的问题'], ['zh', '中文'], ['en', 'English']], (v) => this.save({ language: v })));
    const refresh = h('button', { class: 'set-refresh', type: 'button' }, '重新检测');
    refresh.addEventListener('click', () => this.show());
    this.body.replaceChildren(provRow, detail, h('div', { class: 'set-foot' }, lang, refresh));
  }
}
