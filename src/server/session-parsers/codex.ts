import fs from 'node:fs';
import path from 'node:path';
import type { SessionParser, SessionRef, ParseResult } from './types';
import { isMdFile, isWithinRoot } from './types';

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'patch']);
const READ_TOOLS = new Set(['read_file']);

export class CodexSessionParser implements SessionParser {
  parseSessionFile(sessionFilePath: string, mdRoot: string): ParseResult {
    const result: ParseResult = { fileRefs: new Map() };
    let content: string;
    try {
      content = fs.readFileSync(sessionFilePath, 'utf-8');
    } catch {
      return result;
    }

    const lines = content.split('\n').filter((l) => l.trim());
    let summary = '';
    let cwd = '';
    const fileActions = new Map<string, { action: 'modified' | 'read'; timestamp: string }>();

    const basename = path.basename(sessionFilePath, '.jsonl');
    const sessionId = basename.replace(/^rollout-/, '');

    for (const line of lines) {
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      if (!cwd && entry.cwd) cwd = entry.cwd;

      if (!summary && entry.role === 'user' && typeof entry.content === 'string') {
        summary = entry.content.slice(0, 200);
      }

      if (entry.content && Array.isArray(entry.content)) {
        for (const item of entry.content) {
          if (item.type === 'tool_use' && item.input?.path) {
            const isWrite = WRITE_TOOLS.has(item.name);
            const isRead = READ_TOOLS.has(item.name);
            if (!isWrite && !isRead) continue;

            const resolvedPath = path.isAbsolute(item.input.path)
              ? item.input.path
              : path.resolve(cwd || mdRoot, item.input.path);

            if (!isMdFile(resolvedPath) || !isWithinRoot(resolvedPath, mdRoot)) continue;

            const relPath = path.relative(mdRoot, resolvedPath);
            const action = isWrite ? 'modified' : 'read';
            const existing = fileActions.get(relPath);
            if (!existing || (action === 'modified' && existing.action === 'read')) {
              fileActions.set(relPath, { action, timestamp: entry.timestamp || '' });
            }
          }
        }
      }
    }

    for (const [relPath, info] of fileActions) {
      const ref: SessionRef = {
        provider: 'codex',
        sessionId,
        sessionFile: sessionFilePath,
        timestamp: info.timestamp,
        summary: summary || undefined,
        action: info.action,
        resumeCommand: `codex --resume ${sessionId}`,
      };
      if (!result.fileRefs.has(relPath)) result.fileRefs.set(relPath, []);
      result.fileRefs.get(relPath)!.push(ref);
    }

    return result;
  }
}
