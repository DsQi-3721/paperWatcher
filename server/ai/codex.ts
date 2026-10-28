// Codex CLI bridge: `codex exec --json`, one Codex thread per annotation thread (`codex exec resume <id>`).
// Codex signs in with a ChatGPT account, so this is also how the reader uses GPT without an API key.
import type { Settings } from '../store.ts';
import { runLines } from './proc.ts';
import type { Emit, RunOptions, RunResult } from './types.ts';

// Codex prefers a WebSocket transport and only falls back to HTTPS after several timeouts; on networks where
// WebSockets are blocked that costs two minutes per question. This provider is the built-in ChatGPT backend
// with WebSockets switched off.
const HTTP_PROVIDER = [
  '-c', 'model_providers.pwhttp={name="OpenAI (HTTPS)", base_url="https://chatgpt.com/backend-api/codex", wire_api="responses", requires_openai_auth=true, supports_websockets=false}',
  '-c', 'model_provider="pwhttp"',
];

export async function runCodex(s: Settings['codex'], o: RunOptions, emit: Emit): Promise<RunResult> {
  const common = [
    '--json',
    '--skip-git-repo-check',
    ...(s.model ? ['-m', s.model] : []),
    '-c', `model_reasoning_effort="${s.effort || 'low'}"`,
    '-c', `developer_instructions=${JSON.stringify(o.system)}`,
    ...(s.httpTransport ? HTTP_PROVIDER : []),
  ];
  const images = o.images.map((im) => `--image=${im.file}`);
  const args = o.sessionId
    ? ['exec', ...common, 'resume', ...images, o.sessionId, '-']
    : ['exec', ...common, '-s', 'read-only', '-C', o.cwd, ...images, '-'];

  let sessionId = o.sessionId;
  let lastMessage = '';
  let failed: string | null = null;

  const { code, stderr, aborted } = await runLines(s.bin || 'codex', args, { cwd: o.cwd, stdin: o.message, signal: o.signal }, (line) => {
    let ev: any;
    try { ev = JSON.parse(line); } catch { return; }
    switch (ev.type) {
      case 'thread.started':
        sessionId = ev.thread_id;
        emit({ type: 'session', sessionId: ev.thread_id });
        emit({ type: 'status', text: 'thinking' });
        break;
      case 'item.started':
        if (ev.item?.type === 'command_execution') emit({ type: 'tool', name: 'Shell', detail: String(ev.item.command || '').slice(0, 80) });
        break;
      case 'item.completed': {
        const it = ev.item || {};
        if (it.type === 'agent_message') {
          // A message followed by more work was a preamble; only the last one is the answer.
          if (lastMessage) emit({ type: 'status', text: lastMessage.slice(0, 120) });
          lastMessage = it.text || '';
        } else if (it.type === 'reasoning') {
          emit({ type: 'status', text: 'thinking' });
        } else if (it.type === 'error' && it.message && !/falling back/i.test(it.message)) {
          emit({ type: 'status', text: it.message });
        }
        break;
      }
      case 'error':
        if (ev.message && !/reconnecting/i.test(ev.message)) emit({ type: 'status', text: ev.message });
        break;
      case 'turn.failed':
        failed = ev.error?.message || 'Codex turn failed';
        break;
    }
  });

  if (aborted) throw new Error('Cancelled');
  const lost = /no rollout found|thread\/resume failed|thread not found|session not found/i;
  if (failed) throw Object.assign(new Error(failed), lost.test(failed) && o.sessionId ? { code: 'SESSION_LOST' } : {});
  if (!lastMessage) {
    const msg = (stderr || `codex exited with code ${code}`).trim().split('\n').slice(-6).join('\n');
    throw Object.assign(new Error(msg), lost.test(msg) && o.sessionId ? { code: 'SESSION_LOST' } : {});
  }
  emit({ type: 'delta', text: lastMessage });
  return { text: lastMessage.trim(), sessionId };
}
