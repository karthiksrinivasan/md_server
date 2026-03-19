import path from 'node:path';
import fs from 'node:fs/promises';
import watcher from '@parcel/watcher';
import picomatch from 'picomatch';
import type { FilterConfig } from './config';

const ASSET_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf',
]);

export interface WatchEvent {
  type: 'file:changed' | 'file:added' | 'file:removed' | 'asset:changed';
  path: string;
}

type EventCallback = (event: WatchEvent) => void;

export class FileWatcher {
  private subscription: watcher.AsyncSubscription | null = null;
  private callbacks: EventCallback[] = [];
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private rootDir = '';
  private excludeMatchers: ((path: string) => boolean)[] = [];
  private filterRegex: RegExp | null = null;

  onEvent(callback: EventCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx !== -1) this.callbacks.splice(idx, 1);
    };
  }

  async start(rootDir: string, filters: FilterConfig): Promise<void> {
    // Resolve symlinks so event paths (which use real paths) match
    this.rootDir = await fs.realpath(rootDir);
    const defaultExcludes = ['node_modules/**', '.git/**'];
    const allExcludes = [...defaultExcludes, ...filters.exclude];
    this.excludeMatchers = allExcludes.map((pattern) => picomatch(pattern));
    if (filters.filter) this.filterRegex = filters.filter;

    this.subscription = await watcher.subscribe(
      this.rootDir,
      (err, events) => {
        if (err) return;
        for (const event of events) {
          this.handleParcelEvent(event);
        }
      },
      {
        ignore: ['node_modules', '.git'],
      },
    );
  }

  private handleParcelEvent(event: watcher.Event): void {
    const absolutePath = event.path;
    const ext = path.extname(absolutePath).toLowerCase();
    const isMd = ext === '.md';
    const isAsset = ASSET_EXTENSIONS.has(ext);

    if (!isMd && !isAsset) return;

    const relPath = path.relative(this.rootDir, absolutePath);

    // Skip hidden files
    if (relPath.split(path.sep).some((seg) => seg.startsWith('.'))) return;

    if (this.excludeMatchers.some((matcher) => matcher(relPath))) return;
    if (isMd && this.filterRegex && !this.filterRegex.test(relPath)) return;

    let type: WatchEvent['type'];
    if (isAsset) {
      // Assets only emit 'asset:changed' for create/update
      if (event.type === 'delete') return;
      type = 'asset:changed';
    } else {
      switch (event.type) {
        case 'create':
          type = 'file:added';
          break;
        case 'delete':
          type = 'file:removed';
          break;
        case 'update':
          type = 'file:changed';
          break;
        default:
          return;
      }
    }

    const existingTimer = this.debounceTimers.get(relPath);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(relPath);
      const watchEvent: WatchEvent = { type, path: relPath };
      for (const callback of this.callbacks) callback(watchEvent);
    }, 300);
    this.debounceTimers.set(relPath, timer);
  }

  async stop(): Promise<void> {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;
    }
  }
}
