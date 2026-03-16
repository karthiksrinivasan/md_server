export interface SessionRef {
  provider: string;
  sessionId: string;
  sessionFile: string;
  timestamp: string;
  summary?: string;
  action: 'created' | 'modified' | 'read';
  resumeCommand: string;
}

export interface ParseResult {
  fileRefs: Map<string, SessionRef[]>;
}

export interface SessionParser {
  parseSessionFile(filePath: string, mdRoot: string): ParseResult;
}

export interface SessionIndex {
  version: number;
  lastUpdated: string;
  providerState: Record<string, ProviderScanState>;
  files: Record<string, FileSessionEntry>;
}

export interface ProviderScanState {
  sessionFiles: Record<string, {
    mtime: number;
    size: number;
  }>;
}

export interface FileSessionEntry {
  sessions: SessionRef[];
}

export function isMdFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'markdown';
}

export function isWithinRoot(filePath: string, mdRoot: string): boolean {
  const path = require('node:path');
  const resolved = path.resolve(filePath);
  const resolvedRoot = path.resolve(mdRoot);
  return resolved.startsWith(resolvedRoot + path.sep) || resolved === resolvedRoot;
}
