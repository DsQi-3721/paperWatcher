// OpenAI-compatible Chat Completions bridge (OpenAI, Azure-style gateways, DeepSeek, Ollama, LM Studio, vLLM…).
// Stateless: the browser sends the thread history with every question.
import type { Settings } from '../store.ts';
import type { Emit, RunOptions, RunResult } from './types.ts';
import { runResponses } from './responses.ts';

export async function runOpenAI(s: Settings['openai'], o: RunOptions, emit: Emit): Promise<RunResult> {
  if (s.protocol === 'responses') return runResponses(s, o, emit);
  const base = (s.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const messages: any[] = [{ role: 'system', content: o.system }];
  for (const h of o.history || []) messages.push({ role: h.role === 'ai' ? 'assistant' : 'user', content: h.text });
  const content: any[] = [{ type: 'text', text: o.message }];
  for (const im of o.images) content.push({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.base64}` } });
  messages.push({ role: 'user', content: o.images.length ? content : o.message });

  emit({ type: 'status', text: 'thinking' });
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: s.model, stream: true, messages }),
    signal: o.signal,
  });
  if (!res.ok || !res.body) {
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    try { detail = JSON.parse(detail).error?.message || detail; } catch { /* not JSON */ }
    throw new Error(`API error ${res.status}: ${detail.slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let text = '';
  let thinking = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let j: any;
      try { j = JSON.parse(data); } catch { continue; }
      const d = j.choices?.[0]?.delta;
      if (!d) continue;
      if (d.reasoning_content || d.reasoning) {
        if (!thinking) { thinking = true; emit({ type: 'status', text: 'thinking' }); }
      }
      if (typeof d.content === 'string' && d.content) {
        text += d.content;
        emit({ type: 'delta', text: d.content });
      }
    }
  }
  if (!text.trim()) throw new Error('The model returned an empty answer');
  return { text: text.trim() };
}
