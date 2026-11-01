import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseVoice, DictationSpeech, englishVoices, voiceKey, waitForVoices } from '../src/deskapps/speech.ts';

const voice = (name: string, lang = 'en-US', extra = {}): SpeechSynthesisVoice => ({
  name, lang, voiceURI: `com.apple.speech.synthesis.voice.${name}`, localService: true, default: false, ...extra,
});
const samantha = voice('Samantha'), daniel = voice('Daniel', 'en-GB');

class FakeSynth extends EventTarget {
  list: SpeechSynthesisVoice[] = [];
  speaking = false;
  pending = false;
  spoken: SpeechSynthesisUtterance[] = [];
  getVoices() { return this.list; }
  speak(utterance: SpeechSynthesisUtterance) { this.spoken.push(utterance); this.speaking = true; }
  cancel() {
    if (this.speaking) this.spoken.at(-1)?.onerror?.({ error: 'canceled' } as SpeechSynthesisErrorEvent);
    this.speaking = false; this.pending = false;
  }
  load(voices: SpeechSynthesisVoice[]) { this.list = voices; this.dispatchEvent(new Event('voiceschanged')); }
  asSynth() { return this as unknown as SpeechSynthesis; }
}
function setup(voices: SpeechSynthesisVoice[] = [samantha]) {
  const synth = new FakeSynth(); synth.list = voices;
  const messages: { text: string; error?: boolean }[] = [];
  const speech = new DictationSpeech(synth.asSynth(), (text) => ({ text }) as SpeechSynthesisUtterance,
    (text, error) => messages.push({ text, error }));
  return { synth, speech, messages };
}

test('dictation avoids macOS novelty voices even when they are first, local or the system default', () => {
  const novelty = ['Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Fred', 'Good News', 'Jester', 'Junior', 'Kathy', 'Organ', 'Ralph', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox'].map((name) => voice(name, 'en-US', { default: true }));
  const voices = [...novelty, daniel, voice('Tingting', 'zh-CN'), samantha];
  assert.equal(chooseVoice(voices), samantha);
  assert.deepEqual(englishVoices(voices), [samantha, daniel]);
  assert.equal(chooseVoice([...voices].reverse()), samantha);
  assert.equal(chooseVoice(voices, voiceKey(novelty[0])), samantha);
  assert.equal(chooseVoice(novelty), undefined);
  assert.equal(chooseVoice([voice('Localized name', 'en_US', { voiceURI: 'com.apple.speech.synthesis.voice.Albert' })]), undefined);
});

test('manual English voice choices are honored, with natural cross-platform fallbacks', () => {
  assert.equal(chooseVoice([samantha, daniel], voiceKey(daniel)), daniel);
  assert.equal(chooseVoice([samantha], 'missing voice'), samantha);
  const google = voice('Google US English', 'en-US', { localService: false });
  assert.equal(chooseVoice([voice('Albert'), google]), google);
  const microsoft = voice('Microsoft Aria Online (Natural) - English (United States)', 'en-US', { localService: false });
  assert.equal(chooseVoice([microsoft]), microsoft);
});

test('pronunciation matches the selected accent and uses normal pitch, volume and rate', async () => {
  const { speech, synth } = setup([samantha, daniel]);
  await speech.speak('  self-attention  ', voiceKey(daniel));
  const utterance = synth.spoken[0];
  assert.equal(utterance.text, 'self-attention'); assert.equal(utterance.voice, daniel);
  assert.equal(utterance.lang, 'en-GB'); assert.equal(utterance.rate, 1);
  assert.equal(utterance.pitch, 1); assert.equal(utterance.volume, 1);
  await speech.speak('attention', '', .85);
  assert.equal(synth.spoken[1].rate, .85); assert.equal(synth.spoken[1].pitch, 1);
  speech.stop();
});

test('saved voice selection works when the browser loads its voice list asynchronously', async () => {
  const { speech, synth } = setup([]);
  const pending = speech.speak('attention', voiceKey(daniel));
  assert.equal(synth.spoken.length, 0);
  synth.load([voice('Albert'), samantha, daniel]);
  await pending;
  assert.equal(synth.spoken.length, 1); assert.equal(synth.spoken[0].voice, daniel);
  speech.stop();
});

test('voice discovery times out and can be cancelled without leaving listeners behind', async () => {
  const synth = new FakeSynth(), ctl = new AbortController();
  assert.deepEqual(await waitForVoices(synth.asSynth(), ctl.signal, 5), []);
  const waiting = waitForVoices(synth.asSynth(), ctl.signal);
  ctl.abort(); await assert.rejects(waiting, { name: 'AbortError' });
  await assert.rejects(waitForVoices(synth.asSynth(), ctl.signal), { name: 'AbortError' });
  synth.load([samantha]);
  assert.deepEqual(await waitForVoices(synth.asSynth(), new AbortController().signal), [samantha]);
});

test('closing while voices load prevents delayed pronunciation and ignores stale errors', async () => {
  const { speech, synth, messages } = setup([]);
  const pending = speech.speak('attention');
  speech.stop(); synth.load([samantha]); await pending;
  assert.equal(synth.spoken.length, 0); assert.equal(messages.some((m) => m.error), false);
  await speech.speak('attention'); speech.stop();
  synth.spoken[0].onerror?.({ error: 'synthesis-failed' } as SpeechSynthesisErrorEvent);
  assert.equal(messages.some((m) => m.error), false);
});

test('rapid repeated clicks only pronounce the latest request and do not build a speech queue', async () => {
  const { speech, synth, messages } = setup([]);
  const first = speech.speak('first'), second = speech.speak('second');
  synth.load([samantha]); await Promise.all([first, second]);
  assert.deepEqual(synth.spoken.map((u) => u.text), ['second']);
  const third = speech.speak('third'), fourth = speech.speak('fourth');
  await Promise.all([third, fourth]);
  assert.deepEqual(synth.spoken.map((u) => u.text), ['second', 'fourth']);
  assert.equal(messages.some((m) => m.error), false);
  const stopped = speech.speak('stop before replacement'); speech.stop(); await stopped;
  assert.equal(synth.spoken.length, 2);
});

test('no suitable English voice and genuine synthesis failures give actionable feedback', async () => {
  const { speech, synth, messages } = setup([voice('Albert'), voice('Tingting', 'zh-CN')]);
  await speech.speak('attention');
  assert.equal(synth.spoken.length, 0);
  assert.match(messages.at(-1)!.text, /系统语音设置/); assert.equal(messages.at(-1)!.error, true);
  synth.load([samantha]); await speech.speak('attention');
  synth.spoken[0].onerror?.({ error: 'synthesis-failed' } as SpeechSynthesisErrorEvent);
  assert.match(messages.at(-1)!.text, /换一个英语声音/); assert.equal(messages.at(-1)!.error, true);
  const count = messages.filter((m) => m.error).length;
  await speech.speak('attention');
  synth.spoken[1].onerror?.({ error: 'interrupted' } as SpeechSynthesisErrorEvent);
  assert.equal(messages.filter((m) => m.error).length, count);
  assert.equal(messages.at(-1)!.text, ''); speech.stop();
});
