// Events streamed to the browser while an AI answer is being produced.
export type AiEvent =
  | { type: 'status'; text: string }
  | { type: 'tool'; name: string; detail?: string }
  | { type: 'delta'; text: string }
  | { type: 'session'; sessionId: string }
  | { type: 'done'; sessionId?: string; text: string; cost?: number }
  | { type: 'error'; message: string };

export type Emit = (e: AiEvent) => void;

export interface Image { file: string; mime: string; base64: string }

export interface RunOptions {
  cwd: string;
  system: string;
  message: string;
  images: Image[];
  sessionId?: string;            // resume this session when set
  history?: Array<{ role: 'user' | 'ai'; text: string }>;
  signal: AbortSignal;
}

export interface RunResult { text: string; sessionId?: string; cost?: number }
