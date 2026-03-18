import path from 'node:path';
import fs from 'node:fs/promises';
import { watch, type FSWatcher } from 'chokidar';
import picomatch from 'picomatch';
import type { FilterConfig } from './config';

export interface WatchEvent {
  type: 'file:changed' | 'file:added' | 'file:removed';
  path: string;
}

type EventCallback = (event: WatchEvent) => void;

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private callbacks: EventCallback[] = [];
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private rootDir = '';
  private excludeMatchers: ((path: string) => boolean)[] = [];
  private filterRegex: RegExp | null = null;
  private readyTime = 0;

  onEvent(callback: EventCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx !== -1) this.callbacks.splice(idx, 1);
    };
  }

  async start(rootDir: string, filters: FilterConfig): Promise<void> {
    this.rootDir = rootDir;
    const defaultExcludes = ['node_modules/**', '.git/**'];
    const allExcludes = [...defaultExcludes, ...filters.exclude];
    this.excludeMatchers = allExcludes.map((pattern) => picomatch(pattern));
    if (filters.filter) this.filterRegex = filters.filter;

    this.watcher = watch(rootDir, {
      ignored: [/(^|[/\\])\./, '**/node_modules/**'],
      persistent: true,
      ignoreInitial: true,
    });

    return new Promise<void>((resolve) => {
      this.watcher!.on('ready', () => {
        this.readyTime = Date.now();
        this.watcher!.on('change', (filePath) => this.handleEvent('file:changed', filePath));
        this.watcher!.on('add', (filePath) => this.handleEvent('file:added', filePath));
        this.watcher!.on('unlink', (filePath) => this.handleEvent('file:removed', filePath));
        resolve();
      });
    });
  }

  private handleEvent(type: WatchEvent['type'], absolutePath: string): void {
    if (!absolutePath.endsWith('.md')) return;
    const relPath = path.relative(this.rootDir, absolutePath);
    if (this.excludeMatchers.some((matcher) => matcher(relPath))) return;
    if (this.filterRegex && !this.filterRegex.test(relPath)) return;

    const existingTimer = this.debounceTimers.get(relPath);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(relPath);
      // Async stale-event filter — does not block the event loop
      (async () => {
        if (type !== 'file:removed') {
          try {
            const stat = await fs.stat(absolutePath);
            if (stat.mtimeMs <= this.readyTime) return;
          } catch { return; }
        }
        const event: WatchEvent = { type, path: relPath };
        for (const callback of this.callbacks) callback(event);
      })();
    }, 300);
    this.debounceTimers.set(relPath, timer);
  }

  async stop(): Promise<void> {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    if (this.watcher) { await this.watcher.close(); this.watcher = null; }
  }
}
