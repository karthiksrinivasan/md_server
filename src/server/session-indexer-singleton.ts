import { SessionIndexer } from './session-indexer';

let instance: SessionIndexer | null = null;

export function getSessionIndexer(mdRoot: string, cacheDir: string): SessionIndexer {
  if (!instance) {
    instance = new SessionIndexer(mdRoot, cacheDir);
  }
  return instance;
}

export function resetSessionIndexer(): void {
  instance = null;
}
