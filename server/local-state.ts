import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, writeFileAtomic } from './store.ts';

/** Small local tools serialize their writes and never replace a damaged file with empty data. */
export class LocalState<T extends { version: number }> {
  private lock: Promise<unknown> = Promise.resolve();
  readonly file: string;
  constructor(name: string, private initial: T, private valid: (value: any) => boolean) { this.file = path.join(DATA_DIR, name); }
  async read(): Promise<T> {
    try {
      const value = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (!this.valid(value)) throw new Error('Invalid structure');
      return value;
    } catch (e: any) {
      if (e.code === 'ENOENT') return structuredClone(this.initial);
      throw new Error(`${path.basename(this.file)} 无法读取，原文件已保留，请先修复或恢复备份`);
    }
  }
  change<R>(fn: (value: T) => R | Promise<R>): Promise<R> {
    const task = this.lock.then(async () => {
      const value = await this.read(), result = await fn(value);
      await fs.mkdir(DATA_DIR, { recursive: true });
      await writeFileAtomic(this.file, JSON.stringify(value, null, 2), 0o600);
      return result;
    });
    this.lock = task.catch(() => {});
    return task;
  }
}
