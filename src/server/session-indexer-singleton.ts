import { SessionIndexer } from './session-indexer';
import { getAgentRegistry } from './agent-registry-singleton';
import os from 'node:os';
import path from 'node:path';

let instance: SessionIndexer | null = null;
let indexPromise: Promise<void> | null = null;

function expandHome(p: string): string {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

export function getSessionIndexer(mdRoot: string, cacheDir: string): SessionIndexer {
  if (!instance) {
    instance = new SessionIndexer(mdRoot, cacheDir);
    // Kick off index build in the background with provider paths from the registry
    const indexer = instance;
    indexPromise = getAgentRegistry().then((registry) => {
      const providers = registry.getAllConfigs()
        .filter((a) => a.sessionPaths.length > 0)
        .map((a) => ({ provider: a.id, paths: a.sessionPaths.map(expandHome) }));
      return indexer.buildIndex(providers);
    }).catch(() => {
      // Index build failed — sessions will return empty until next rescan
    });
  }
  return instance;
}

export function getIndexReady(): Promise<void> | null {
  return indexPromise;
}

export function resetSessionIndexer(): void {
  instance = null;
  indexPromise = null;
}
