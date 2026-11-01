import { h } from '../util/dom';
import { deskApi } from './api';
import { deskAction, DeskPanel } from './panel';
import type { MusicTrack, PlayerSnapshot } from './types';

const clock = (seconds: number) => Number.isFinite(seconds) && seconds > 0 ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';
const PREF = 'pw.music.preferences.v1';
export class MusicPlayer extends DeskPanel {
  audio = new Audio();
  tracks: MusicTrack[] = [];
  private current: MusicTrack | null = null;
  private restoreTime = 0;
  private preferences: { volume?: number; loop?: boolean; id?: string; time?: number } = {};
  private lastSnapshot = 0;
  private lastSaved = 0;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private progress = h('input', { type: 'range', min: 0, max: 0, step: .1, value: 0, 'aria-label': '播放进度' });
  private volumeControl = h('input', { type: 'range', min: 0, max: 1, step: .05, 'aria-label': '音量' });
  private time = h('span', { class: 'da-music-time' });
  private title = h('div', { class: 'da-music-title' });
  private playButton = deskAction('播放', () => void this.toggle(), 'primary');
  private loopButton = deskAction('单曲循环：关', () => this.repeat());
  private miniTitle = h('span');
  private miniPlay = deskAction('▶', () => void this.toggle());
  private mini: HTMLDivElement;
  private importing = false;
  onState: (state: PlayerSnapshot) => void = () => {};

  constructor(root: HTMLElement) {
    super(root, 'MP3 随身听', '导入本地音乐，或添加能直接播放的音频链接。', 'da-music');
    try {
      const saved = JSON.parse(localStorage.getItem(PREF) || '{}');
      if (saved && typeof saved === 'object') this.preferences = { volume: Number.isFinite(saved.volume) ? saved.volume : .5, loop: saved.loop === true,
        id: typeof saved.id === 'string' ? saved.id : undefined, time: Number.isFinite(saved.time) && saved.time > 0 ? saved.time : 0 };
    } catch { /* defaults */ }
    this.audio.preload = 'metadata'; this.audio.hidden = true; this.el.append(this.audio);
    this.audio.volume = typeof this.preferences.volume === 'number' ? Math.min(1, Math.max(0, this.preferences.volume)) : .5;
    this.audio.loop = this.preferences.loop === true;
    const open = deskAction('', () => void this.show(), 'da-mini-open'); open.append(h('span', null, '♫'), this.miniTitle); open.setAttribute('aria-label', '打开音乐播放器');
    this.mini = h('div', { class: 'da-music-mini', hidden: true }, open, this.miniPlay); root.append(this.mini);
    this.mini.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.mini.addEventListener('keydown', (e) => e.stopPropagation());
    this.progress.addEventListener('input', () => { if (Number.isFinite(this.audio.duration)) this.audio.currentTime = Math.min(this.audio.duration, +this.progress.value); this.update(true); });
    this.volumeControl.addEventListener('input', () => this.setVolume(+this.volumeControl.value));
    for (const event of ['play', 'pause', 'playing', 'waiting', 'durationchange', 'volumechange', 'seeked']) this.audio.addEventListener(event, () => this.update(true));
    this.audio.addEventListener('loadedmetadata', () => { if (this.restoreTime && Number.isFinite(this.audio.duration)) this.audio.currentTime = Math.min(this.restoreTime, Math.max(0, this.audio.duration - .1)); this.restoreTime = 0; this.update(true); });
    this.audio.addEventListener('timeupdate', () => { this.update(); if (Date.now() - this.lastSaved > 10000) this.persist(); });
    this.audio.addEventListener('ended', () => { if (!this.audio.loop) this.next(1); });
    this.audio.addEventListener('error', () => {
      this.message(this.current?.kind === 'url' ? '这个链接暂时无法播放。请使用音频文件直链；歌单网页、需要登录或已过期的链接不能直接播放。' : '无法播放这个音频，文件可能损坏或浏览器不支持其编码。', true);
      this.update(true);
    });
    window.addEventListener('beforeunload', () => this.saveNow());
  }
  async init() { try { await this.refresh(); } catch (e: any) { this.message(e.message, true); } }
  async show() { this.openPanel(); await this.init(); this.render(); }
  async refresh() {
    this.tracks = await deskApi.music();
    if (this.current) this.current = this.tracks.find((t) => t.id === this.current!.id) || null;
    if (!this.current && this.tracks.length) {
      const track = this.tracks.find((t) => t.id === this.preferences.id) || this.tracks[0];
      this.choose(track, false, track.id === this.preferences.id ? this.preferences.time || 0 : 0);
    }
    if (!this.tracks.length) { this.current = null; this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); }
    if (this.open) this.render(); this.update(true);
  }
  private choose(track: MusicTrack, play: boolean, position = 0) {
    this.audio.pause(); this.current = track; this.restoreTime = position;
    this.audio.src = track.kind === 'file' ? `/api/music/${track.id}/audio` : track.url!;
    this.message(''); if (this.open) this.render(); this.update(true); this.persist();
    if (play) void this.play();
  }
  private async play() {
    try { await this.audio.play(); this.message(''); }
    catch (e: any) {
      if (e.name !== 'AbortError') this.message(e.name === 'NotAllowedError' ? '浏览器需要一次点击才能播放，请再点“播放”。' : '播放失败，请检查文件格式或音频链接。', true);
    }
    this.update(true);
  }
  async toggle() {
    if (!this.current) { if (this.tracks.length) this.choose(this.tracks[0], true); else await this.show(); return; }
    if (this.audio.paused) await this.play(); else this.pause();
  }
  pause() { this.audio.pause(); this.persist(); this.update(true); }
  next(delta = 1) {
    if (!this.tracks.length) { void this.show(); return; }
    const i = this.tracks.findIndex((t) => t.id === this.current?.id);
    this.choose(this.tracks[(Math.max(0, i) + delta + this.tracks.length) % this.tracks.length], true);
  }
  setVolume(value: number) { this.audio.volume = Math.min(1, Math.max(0, value)); this.persist(); this.update(true); }
  repeat() { this.audio.loop = !this.audio.loop; this.persist(); this.update(true); }
  snapshot(): PlayerSnapshot {
    return { title: this.current?.title || '导入音乐', currentTime: this.audio.currentTime || 0, duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0,
      playing: !this.audio.paused && !this.audio.ended && this.audio.readyState >= 2, volume: this.audio.volume, loop: this.audio.loop,
      index: this.tracks.findIndex((t) => t.id === this.current?.id) + 1, total: this.tracks.length };
  }
  private update(force = false) {
    const state = this.snapshot();
    this.title.textContent = state.title;
    this.time.textContent = `${clock(state.currentTime)} / ${clock(state.duration)}`;
    this.progress.max = String(state.duration); this.progress.disabled = !state.duration;
    if (document.activeElement !== this.progress) this.progress.value = String(state.currentTime);
    this.volumeControl.value = String(state.volume);
    this.playButton.textContent = state.playing ? '暂停' : this.audio.paused ? '播放' : '加载中…';
    this.loopButton.textContent = `单曲循环：${state.loop ? '开' : '关'}`; this.loopButton.setAttribute('aria-pressed', String(state.loop));
    this.mini.hidden = !this.current; this.miniTitle.textContent = state.title; this.miniPlay.textContent = state.playing ? 'Ⅱ' : '▶'; this.miniPlay.setAttribute('aria-label', state.playing ? '暂停音乐' : '播放音乐');
    if (force || Date.now() - this.lastSnapshot > 1000) { this.lastSnapshot = Date.now(); this.onState(state); }
  }
  private persist() { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.saveNow(), 250); }
  private saveNow() {
    this.lastSaved = Date.now();
    try { localStorage.setItem(PREF, JSON.stringify({ volume: this.audio.volume, loop: this.audio.loop, id: this.current?.id, time: this.audio.currentTime })); } catch { /* playback still works without storage */ }
  }
  private render() {
    const file = h('input', { type: 'file', accept: 'audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.webm', multiple: true, 'aria-label': '导入本地音频' }); file.disabled = this.importing;
    file.addEventListener('change', async () => {
      const files = [...(file.files || [])]; if (!files.length || this.importing) return;
      this.importing = true; file.disabled = true; let added = 0;
      try {
        for (const f of files) { if (f.size > 200 * 1024 * 1024) throw new Error(`${f.name} 超过 200 MB`); this.message(`正在导入 ${added + 1} / ${files.length}：${f.name}`); await deskApi.upload(f); added++; }
        await this.refresh(); this.message(`已导入 ${added} 首，点击播放即可收听。`);
      } catch (e: any) { await this.refresh().catch(() => {}); this.message(`已导入 ${added} 首。${e.message}`, true); }
      finally { this.importing = false; this.render(); }
    });
    const url = h('input', { type: 'url', required: true, placeholder: 'https://…/music.mp3', 'aria-label': '音频直链' });
    const name = h('input', { type: 'text', placeholder: '曲名（可选）', maxLength: 200, 'aria-label': '音乐名称' });
    const add = h('button', { type: 'submit' }, '加入音乐库');
    const form = h('form', { class: 'da-music-link' }, url, name, add);
    form.addEventListener('submit', async (e) => { e.preventDefault(); add.disabled = true; try { await deskApi.addLink(url.value, name.value); await this.refresh(); this.message('链接已加入，点曲名播放。'); } catch (err: any) { this.message(err.message, true); } finally { add.disabled = false; } });
    const display = h('div', { class: 'da-player-display' }, h('span', null, 'PAPER WATCHER · MP3'), this.title, this.progress, this.time);
    const controls = h('div', { class: 'da-player-controls' }, deskAction('上一首', () => this.next(-1)), this.playButton, deskAction('下一首', () => this.next(1)), this.loopButton,
      h('label', { class: 'da-volume' }, '音量 ', this.volumeControl));
    const queue = h('ol', { class: 'da-playlist', 'aria-label': '音乐列表' });
    for (const track of this.tracks) {
      const play = deskAction('', () => this.choose(track, true), 'da-track'); play.append(h('strong', null, track.title), h('small', null, track.kind === 'file' ? `本地音频 · ${((track.bytes || 0) / 1024 / 1024).toFixed(1)} MB` : '音频直链'));
      const remove = deskAction('移出', async () => {
        try {
          if (this.current?.id === track.id) { this.pause(); this.current = null; }
          await deskApi.removeTrack(track.id, true); await this.refresh();
          this.status.replaceChildren(document.createTextNode('已移出音乐列表 '), deskAction('撤销', () => { void deskApi.removeTrack(track.id, false).then(() => this.refresh()).then(() => this.message('已恢复')).catch((e) => this.message(e.message, true)); }));
        } catch (e: any) { this.message(e.message, true); }
      }, 'quiet');
      queue.append(h('li', { class: track.id === this.current?.id ? 'active' : '' }, play, remove));
    }
    this.body.replaceChildren(display, controls, h('section', { class: 'da-music-import' }, h('label', null, '导入本地音频 ', file), form,
      h('p', { class: 'da-help' }, '支持浏览器可解码的 MP3、WAV、M4A、OGG、FLAC、AAC 等音频，每个文件最多 200 MB。链接需直接返回音频；网易云、汽水等歌单页面不能直接播放。')), queue);
    if (!this.tracks.length) this.body.append(h('div', { class: 'da-empty' }, '音乐库还是空的。先选一个音频文件，或粘贴音频直链。'));
    this.update(true);
  }
}
