// Responses API bridge for Codex-compatible gateways. Each request carries the complete
// conversation so it also works with storage disabled and no server-side session.
import type { Settings } from '../store.ts';
import type { Emit, RunOptions, RunResult } from './types.ts';

export async function runResponses(s: Settings['openai'], o: RunOptions, emit: Emit): Promise<RunResult> {
  const base = (s.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const input: any[] = (o.history || []).map((h) => ({
    role: h.role === 'ai' ? 'assistant' : 'user', content: h.text,
  }));
  input.push({ role: 'user', content: [
    { type: 'input_text', text: o.message },
    ...o.images.map((im) => ({ type: 'input_image', image_url: `data:${im.mime};base64,${im.base64}` })),
  ] });
  emit({ type: 'status', text: 'thinking' });
  const res = await fetch(`${base}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {}) },
    body: JSON.stringify({ model: s.model, instructions: o.system, input, stream: true, store: false }),
    signal: o.signal,
  });
  if (!res.ok || !res.body) {
    let detail = await res.text().catch(() => '');
    try { detail = JSON.parse(detail).error?.message || detail; } catch { /* plain text */ }
    throw new Error(`API error ${res.status}: ${detail.slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', text = '', completed = false;
  let dataLines: string[] = [];
  const dispatch = () => {
    const data = dataLines.join('\n');
    dataLines = [];
    if (!data || data === '[DONE]') return;
    const event = JSON.parse(data);
    if (event.type === 'error' || event.type === 'response.failed' || event.type === 'response.incomplete') {
      const detail = event.error?.message || event.message || event.response?.error?.message
        || event.response?.incomplete_details?.reason || event.type;
      throw new Error(`Responses API: ${String(detail).slice(0, 400)}`);
    }
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      text += event.delta;
      emit({ type: 'delta', text: event.delta });
    }
    if (event.type === 'response.completed') {
      if (event.response?.status && event.response.status !== 'completed') {
        throw new Error(`Responses API: ${event.response.status}`);
      }
      // Some gateways send a completed response without preceding text deltas.
      if (!text) {
        text = (event.response?.output || []).filter((item: any) => item.type === 'message')
          .flatMap((item: any) => item.content || [])
          .filter((item: any) => item.type === 'output_text')
          .map((item: any) => item.text || '').join('');
        if (text) emit({ type: 'delta', text });
      }
      completed = true;
    }
  };
  const line = (value: string) => {
    value = value.replace(/\r$/, '');
    if (!value) dispatch();
    else if (value.startsWith('data:')) dataLines.push(value.slice(5).replace(/^ /, ''));
  };
  try {
    while (!completed) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0 && !completed) {
        line(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
      if (done) {
        if (!completed) { if (buffer) line(buffer); dispatch(); }
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!completed) throw new Error('Responses API stream ended before completion; please retry');
  if (!text.trim()) throw new Error('The model returned an empty answer');
  return { text: text.trim() };
}
