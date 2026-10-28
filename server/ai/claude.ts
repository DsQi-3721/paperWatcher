// Claude Code CLI bridge: `claude -p` with stream-json in and out, partial messages for live handwriting,
// one Claude session per annotation thread (created with --session-id, continued with --resume).
import { randomUUID } from 'node:crypto';
import type { Settings } from '../store.ts';
import { runLines } from './proc.ts';
import type { Emit, RunOptions, RunResult } from './types.ts';

function describeTool(input: any): string | undefined {
  if (!input) return undefined;
  const file = input.file_path || input.path;
  if (file) return String(file).split('/').pop();
  return input.pattern || input.query || input.url || input.description;
}

export async function runClaude(s: Settings['claude'], o: RunOptions, emit: Emit): Promise<RunResult> {
  try {
    return await runClaudeOnce(s, o, emit, false);
  } catch (e: any) {
    // Older Claude Code builds lack some flags: retry once with the minimal set.
    if (/unknown option|unrecognized|invalid option/i.test(e?.message || '')) return runClaudeOnce(s, o, emit, true);
    throw e;
  }
}

async function runClaudeOnce(s: Settings['claude'], o: RunOptions, emit: Emit, compat: boolean): Promise<RunResult> {
  const tools = ['Read', 'Grep', 'Glob', ...(s.allowWeb ? ['WebSearch', 'WebFetch'] : [])];
  const resuming = !!o.sessionId;
  const sessionId = o.sessionId || randomUUID();
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    ...(compat ? [] : ['--tools', tools.join(',')]),
    '--allowedTools', tools.join(','),
    ...(compat ? [] : ['--permission-mode', 'dontAsk', '--setting-sources', s.loadUserSettings ? 'user,project,local' : '', '--strict-mcp-config']),
    // File tools may only look inside this paper's folder (unless the reader chose to load their own settings).
    ...(compat || s.loadUserSettings ? [] : ['--restricted']),
    '--system-prompt', o.system,
    ...(s.model ? ['--model', s.model] : []),
    ...(s.effort && !compat ? ['--effort', s.effort] : []),
    ...(resuming ? ['--resume', sessionId] : ['--session-id', sessionId]),
  ];

  const content: any[] = o.images.map((im) => ({
    type: 'image',
    source: { type: 'base64', media_type: im.mime, data: im.base64 },
  }));
  content.push({ type: 'text', text: o.message });
  const stdin = JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n';

  let text = '';
  let resultText: string | null = null;
  let isError = false;
  let cost: number | undefined;
  let gotSession = sessionId;
  let toolsUsed = false;
  let textSinceTool = '';

  const { code, stderr, aborted } = await runLines(s.bin || 'claude', args, { cwd: o.cwd, stdin, signal: o.signal }, (line) => {
    let ev: any;
    try { ev = JSON.parse(line); } catch { return; }
    if (ev.type === 'system' && ev.subtype === 'init') {
      if (ev.session_id) { gotSession = ev.session_id; emit({ type: 'session', sessionId: gotSession }); }
      emit({ type: 'status', text: 'thinking' });
    } else if (ev.type === 'stream_event') {
      const e = ev.event;
      if (ev.parent_tool_use_id) return;
      if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
        text += e.delta.text;
        textSinceTool += e.delta.text;
        emit({ type: 'delta', text: e.delta.text });
      } else if (e?.type === 'content_block_start' && e.content_block?.type === 'tool_use') {
        toolsUsed = true;
        textSinceTool = '';
        emit({ type: 'tool', name: e.content_block.name });
      } else if (e?.type === 'content_block_start' && e.content_block?.type === 'thinking') {
        emit({ type: 'status', text: 'thinking' });
      }
    } else if (ev.type === 'assistant' && !ev.parent_tool_use_id) {
      for (const b of ev.message?.content || []) {
        if (b.type === 'tool_use') emit({ type: 'tool', name: b.name, detail: describeTool(b.input) });
      }
    } else if (ev.type === 'result') {
      resultText = typeof ev.result === 'string' ? ev.result : null;
      isError = !!ev.is_error || ev.subtype !== 'success';
      cost = ev.total_cost_usd;
      if (ev.session_id) gotSession = ev.session_id;
    }
  });

  if (aborted) throw new Error('Cancelled');
  if (isError || (code !== 0 && resultText === null)) {
    const msg = (resultText || stderr || `claude exited with code ${code}`).trim();
    if (/no conversation found/i.test(msg)) throw Object.assign(new Error(msg), { code: 'SESSION_LOST' });
    throw new Error(msg.split('\n').slice(-6).join('\n'));
  }
  // After tool calls the final answer is the text written since the last tool call.
  const finalText = (toolsUsed && textSinceTool.trim() ? textSinceTool : resultText ?? text).trim();
  return { text: finalText, sessionId: gotSession, cost };
}
