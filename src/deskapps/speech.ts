type Voice = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'voiceURI' | 'localService' | 'default'>;
const SPECIAL = new Set(['albert', 'badnews', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged', 'fred', 'goodnews', 'hysterical', 'jester', 'junior', 'kathy', 'organ', 'ralph', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox']);
const PREFERRED = ['samantha', 'alex', 'daniel', 'karen', 'moira', 'tessa', 'rishi'];
const lang = (v: Voice) => v.lang.replace(/_/g, '-');
const name = (v: Voice) => v.name.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
const compact = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
export const voiceKey = (v: Voice) => `${v.voiceURI || v.name}|${lang(v)}`;

/** macOS exposes singing, robotic and novelty voices alongside normal English speech. */
export function isEnglishVoice(v: Voice) {
  return /^en(?:-|$)/i.test(lang(v)) && !SPECIAL.has(compact(name(v))) && !SPECIAL.has(compact(v.voiceURI.split(/[./]/).at(-1) || ''));
}
export function englishVoices<T extends Voice>(voices: T[]): T[] {
  const score = (v: Voice) => {
    const preferred = PREFERRED.indexOf(name(v));
    return (preferred >= 0 ? 1000 - preferred * 50 : 0) + (/^en-US$/i.test(lang(v)) ? 80 : /^en-GB$/i.test(lang(v)) ? 50 : 0)
      + (/enhanced|premium|natural/i.test(v.name) ? 25 : 0) + (v.localService ? 10 : 0) + (v.default ? 5 : 0);
  };
  return voices.filter(isEnglishVoice).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}
export function chooseVoice<T extends Voice>(voices: T[], preferred = ''): T | undefined {
  const available = englishVoices(voices);
  return available.find((v) => voiceKey(v) === preferred) || available[0];
}

export function waitForVoices(synth: SpeechSynthesis, signal: AbortSignal, timeout = 2000): Promise<SpeechSynthesisVoice[]> {
  if (signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
  const loaded = synth.getVoices(); if (loaded.length) return Promise.resolve(loaded);
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', changed); signal.removeEventListener('abort', aborted); };
    const changed = () => { const voices = synth.getVoices(); if (voices.length) { cleanup(); resolve(voices); } };
    const aborted = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); resolve(synth.getVoices()); }, timeout);
    synth.addEventListener('voiceschanged', changed); signal.addEventListener('abort', aborted, { once: true }); changed();
  });
}

export class DictationSpeech {
  private request = 0;
  private pending: AbortController | null = null;
  private active: SpeechSynthesisUtterance | null = null;
  constructor(private synth: SpeechSynthesis, private create: (text: string) => SpeechSynthesisUtterance,
    private notify: (text: string, error?: boolean) => void) {}
  voices() { return englishVoices(this.synth.getVoices()); }
  stop() { this.request++; this.pending?.abort(); this.pending = null; this.synth.cancel(); this.active = null; }
  async speak(text: string, preferred = '', rate = 1) {
    if (!text.trim()) return;
    const wasSpeaking = this.synth.speaking || this.synth.pending;
    this.stop(); const request = this.request, ctl = this.pending = new AbortController();
    try {
      let voices = this.synth.getVoices();
      if (!voices.length) { this.notify('正在加载英语声音…'); voices = await waitForVoices(this.synth, ctl.signal); }
      if (request !== this.request) return;
      const voice = chooseVoice(voices, preferred);
      if (!voice) throw new Error('没有可用的普通英语声音。请在系统语音设置中添加英语声音后重试。');
      // Let a cancelled utterance leave the browser's speech queue before replacing it.
      if (wasSpeaking) await new Promise((resolve) => setTimeout(resolve, 50));
      if (request !== this.request || ctl.signal.aborted) return;
      const utterance = this.active = this.create(text.trim());
      utterance.voice = voice; utterance.lang = lang(voice); utterance.rate = rate === .85 ? .85 : 1; utterance.pitch = 1; utterance.volume = 1;
      utterance.onstart = () => { if (request === this.request) this.notify(`正在朗读 · ${voice.name}`); };
      utterance.onend = () => { if (request === this.request) { this.active = null; this.pending = null; this.notify(''); } };
      utterance.onerror = (event) => {
        if (request !== this.request) return;
        this.active = null; this.pending = null;
        if (event.error === 'canceled' || event.error === 'interrupted') this.notify('');
        else this.notify('朗读失败，请换一个英语声音后重试。', true);
      };
      this.synth.speak(utterance);
    } catch (error: any) {
      if (request === this.request && !ctl.signal.aborted) {
        this.active = null; this.pending = null; this.notify(error.message || '朗读失败，请重试', true);
      }
    }
  }
}
