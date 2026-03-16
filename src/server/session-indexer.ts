import fs from 'node:fs/promises';
import path from 'node:path';
import type { SessionIndex, SessionRef, ProviderScanState, SessionParser } from './session-parsers/types';
import { ClaudeSessionParser } from './session-parsers/claude';
import { CodexSessionParser } from './session-parsers/codex';
import { AiderSessionParser } from './session-parsers/aider';
import { OpenCodeSessionParser } from './session-parsers/opencode';

interface ProviderInput {
  provider: string;
  paths: string[];
}

const PARSERS: Record<string, SessionParser> = {
  claude: new ClaudeSessionParser(),
  codex: new CodexSessionParser(),
  aider: new AiderSessionParser(),
  opencode: new OpenCodeSessionParser(),
};

const INDEX_VERSION = 1;

export class SessionIndexer {
  private mdRoot: string;
  private cacheDir: string;
  private index: SessionIndex;
  private rescanTimer: NodeJS.Timeout | null = null;

  constructor(mdRoot: string, cacheDir: string) {
    this.mdRoot = mdRoot;
    this.cacheDir = cacheDir;
    this.index = {
      version: INDEX_VERSION,
      lastUpdated: '',
      providerState: {},
      files: {},
    };
  }

  async buildIndex(providers: ProviderInput[]): Promise<void> {
    const cachePath = path.join(this.cacheDir, 'session-index.json');

    // Load existing cache
    try {
      const raw = await fs.readFile(cachePath, 'utf-8');
      const cached: SessionIndex = JSON.parse(raw);
      if (cached && cached.version === INDEX_VERSION) {
        this.index = cached;
      }
    } catch {
      // No cache or invalid
    }

    // Scan each provider
    for (const { provider, paths } of providers) {
      const parser = PARSERS[provider];
      if (!parser) continue;

      const cachedState = this.index.providerState[provider] || { sessionFiles: {} };
      const newState: ProviderScanState = { sessionFiles: {} };

      for (const dir of paths) {
        try {
          await fs.access(dir);
        } catch {
          continue;
        }

        const sessionFiles = await this.findSessionFiles(dir, provider);
        for (const sessionFile of sessionFiles) {
          let stat: Awaited<ReturnType<typeof fs.stat>>;
          try {
            stat = await fs.stat(sessionFile);
          } catch {
            continue;
          }

          const cachedEntry = cachedState.sessionFiles[sessionFile];
          const isUnchanged = cachedEntry &&
            cachedEntry.mtime === stat.mtimeMs &&
            cachedEntry.size === stat.size;

          newState.sessionFiles[sessionFile] = {
            mtime: stat.mtimeMs,
            size: stat.size,
          };

          if (isUnchanged) continue;

          // Remove old refs from this session file
          for (const [filePath, entry] of Object.entries(this.index.files)) {
            entry.sessions = entry.sessions.filter((s) => s.sessionFile !== sessionFile);
            if (entry.sessions.length === 0) delete this.index.files[filePath];
          }

          // Parse and add new refs
          const parseResult = parser.parseSessionFile(sessionFile, this.mdRoot);
          for (const [relPath, refs] of parseResult.fileRefs) {
            if (!this.index.files[relPath]) {
              this.index.files[relPath] = { sessions: [] };
            }
            this.index.files[relPath].sessions.push(...refs);
          }
        }
      }

      this.index.providerState[provider] = newState;
    }

    this.index.lastUpdated = new Date().toISOString();

    // Persist
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(this.index, null, 2));
  }

  private async findSessionFiles(dir: string, provider: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...await this.findSessionFiles(fullPath, provider));
        } else if (this.isSessionFile(entry.name, provider)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory not accessible
    }
    return files;
  }

  private isSessionFile(name: string, provider: string): boolean {
    switch (provider) {
      case 'claude': return name.endsWith('.jsonl');
      case 'codex': return name.startsWith('rollout-') && name.endsWith('.jsonl');
      case 'aider': return name.endsWith('.md');
      case 'opencode': return name.endsWith('.json');
      default: return false;
    }
  }

  getSessionsForFile(relPath: string): SessionRef[] {
    const entry = this.index.files[relPath];
    if (!entry) return [];
    return [...entry.sessions].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  scheduleRescan(provider: string, paths: string[]): void {
    if (this.rescanTimer) clearTimeout(this.rescanTimer);
    this.rescanTimer = setTimeout(() => {
      this.buildIndex([{ provider, paths }]).catch(() => {
        // Rescan failed — will retry on next trigger
      });
      this.rescanTimer = null;
    }, 5000);
  }
}
