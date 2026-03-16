import fs from 'node:fs/promises';
import path from 'node:path';
import { FileWatcher } from './watcher';
import { getConfig } from './config';
import { invalidateTreeCache } from './tree-cache';
import { getSearchIndex } from './search-singleton';
import { trackActivity } from './activity';

let instance: FileWatcher | null = null;
let started = false;

export function getFileWatcher(): FileWatcher {
  if (!instance) {
    instance = new FileWatcher();
  }
  if (!started) {
    started = true;
    const config = getConfig();
    if (config.watch) {
      instance.start(config.rootDir, config.filters);

      instance.onEvent((event) => {
        // All downstream work runs async — never blocks the event loop
        (async () => {
          const done = trackActivity(
            event.type === 'file:added' ? 'Indexing new file'
              : event.type === 'file:removed' ? 'Updating index'
              : 'Syncing changes',
          );

          try {
            // Invalidate tree cache on structural changes
            if (event.type === 'file:added' || event.type === 'file:removed') {
              invalidateTreeCache();
            }

            // Keep search index in sync
            const index = getSearchIndex();
            if (event.type === 'file:removed') {
              index.remove(event.path);
            } else {
              // file:added or file:changed — read content and update index
              const absPath = path.join(config.rootDir, event.path);
              const raw = await fs.readFile(absPath, 'utf-8');
              index.update(event.path, raw);
            }
          } catch {
            // File may have been deleted between event and read
          } finally {
            done();
          }
        })();
      });
    }
  }
  return instance;
}

export function resetFileWatcher(): void {
  instance = null;
  started = false;
}
