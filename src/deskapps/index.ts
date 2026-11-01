import type { DeskHome } from '../scene/home';
import { deskApi } from './api';
import { PlannerPanel, localDay } from './planner';
import { DictationPanel } from './dictation';
import { MusicPlayer } from './music';
import type { DictationWord, PlannerData, PlayerSnapshot } from './types';

export class DeskApps {
  planner: PlannerPanel;
  dictation: DictationPanel;
  music: MusicPlayer;
  private day = localDay();
  constructor(root: HTMLElement, private home: DeskHome, beforeOpen: () => void, openEnglish: () => void) {
    this.planner = new PlannerPanel(root); this.dictation = new DictationPanel(root); this.music = new MusicPlayer(root);
    for (const panel of [this.planner, this.dictation, this.music]) panel.onOpen = () => {
      for (const other of [this.planner, this.dictation, this.music]) if (other !== panel) other.hide();
      this.home.menu.close(); this.home.fan.close(); beforeOpen();
    };
    this.dictation.onNotebook = openEnglish;
    this.planner.onChange = (data) => { if (data.date === localDay()) this.showPlanner(data); else void deskApi.planner().then((d) => this.showPlanner(d)).catch(() => {}); };
    this.dictation.onChange = (words) => this.showWords(words);
    this.music.onState = (state) => this.showPlayer(state);
    home.onPlanner = () => void this.planner.show();
    home.onDictation = () => void this.dictation.show();
    const washi = home.scene.byId('washi-tape');
    if (washi) { washi.st.planner = { date: localDay(), items: [] }; washi.buttons.unshift({ label: '每日待办', onClick: () => void this.planner.show() }); washi.acts.planner = () => void this.planner.show(); }
    const pen = home.scene.byId('click-pen');
    if (pen) { pen.st.dictation = []; const write = pen.buttons.find((b) => b.label === '写听写'); if (write) write.onClick = () => void this.dictation.show(); pen.acts.sheet = () => void this.dictation.show(); }
    const eraser = home.scene.byId('eraser');
    if (eraser) { eraser.st.dictation = []; eraser.acts.sheet = () => void this.dictation.show(); }
    this.connectPlayer();
    const refresh = () => void this.refresh();
    window.addEventListener('pw-english-changed', () => { void deskApi.words().then((w) => this.showWords(w)).catch(() => {}); });
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
    setInterval(() => { const today = localDay(); if (today !== this.day) { this.day = today; refresh(); } }, 30_000);
    void this.refresh(); void this.music.init();
  }
  get open() { return this.planner.open || this.dictation.open || this.music.open; }
  close() { this.planner.hide(); this.dictation.hide(); this.music.hide(); }
  async refresh() { await Promise.allSettled([deskApi.planner().then((d) => this.showPlanner(d)), deskApi.words().then((w) => this.showWords(w))]); }
  private showPlanner(data: PlannerData) {
    const obj = this.home.scene.byId('washi-tape'); if (!obj) return;
    obj.st.planner = data; this.home.scene.invalidate(obj);
  }
  private showWords(words: DictationWord[]) {
    for (const id of ['click-pen', 'eraser']) { const obj = this.home.scene.byId(id); if (obj) { obj.st.dictation = words; this.home.scene.invalidate(obj); } }
  }
  private showPlayer(state: PlayerSnapshot) {
    const obj = this.home.scene.byId('mp3-player'); if (!obj) return;
    obj.st.audioModel = state; obj.st.on = true; obj.st.playing = state.playing; obj.st.loop = state.loop;
    obj.st.prog = state.duration ? state.currentTime / state.duration : 0; obj.st.scroll = state.currentTime * 3;
    obj.st.vol = state.volume > .7 ? 2 : state.volume > .3 ? 1 : 0;
    if (state.playing) { obj.st.flip = 0; obj.st.hidden = false; }
    if (this.home.scene.live && document.visibilityState === 'visible') this.home.scene.invalidate(obj);
  }
  private connectPlayer() {
    const obj = this.home.scene.byId('mp3-player'); if (!obj) return;
    const teacher = obj.buttons.find((b) => b.label === '老师来了'); const oldTeacher = teacher?.onClick;
    const hide = () => { this.music.pause(); oldTeacher?.(obj.st, obj.ui); };
    const extra = obj.buttons.filter((b) => b.label === '耳机线');
    obj.buttons = [
      { label: '音乐库', onClick: () => void this.music.show() },
      { label: '播放 / 暂停', onClick: () => void this.music.toggle() },
      { label: '换一首', choices: () => [{ label: '上一首', onClick: () => this.music.next(-1) }, { label: '下一首', onClick: () => this.music.next(1) }] },
      { label: '音量', choices: () => [0, .25, .5, .75, 1].map((volume) => ({ label: volume ? `${volume * 100}%` : '静音', current: Math.abs(this.music.audio.volume - volume) < .01, onClick: () => this.music.setVolume(volume) })) },
      { label: '单曲循环', onClick: () => this.music.repeat() }, ...extra, { label: '老师来了', onClick: hide },
    ];
    Object.assign(obj.acts, { play: () => void this.music.toggle(), bud: () => void this.music.toggle(), screen: () => void this.music.show(),
      menu: () => void this.music.show(), next: () => this.music.next(1), prev: () => this.music.next(-1),
      up: () => this.music.setVolume(this.music.audio.volume + .1), down: () => this.music.setVolume(this.music.audio.volume - .1), back: hide });
    this.showPlayer(this.music.snapshot());
  }
}
