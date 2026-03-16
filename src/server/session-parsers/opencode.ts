import fs from 'node:fs';
import path from 'node:path';
import type { SessionParser, SessionRef, ParseResult } from './types';
import { isMdFile, isWithinRoot } from './types';

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'patch', 'Write', 'Edit']);
const READ_TOOLS = new Set(['read_file', 'Read']);

export class OpenCodeSessionParser implements SessionParser {
  parseSessionFile(sessionFilePath: string, mdRoot: string): ParseResult {
    const result: ParseResult = { fileRefs: new Map() };
    let data: any;
    try {
      const raw = fs.readFileSync(sessionFilePath, 'utf-8');
      data = JSON.parse(raw);
    } catch {
      return result;
    }

    const sessionId = data.id || path.basename(sessionFilePath, '.json');
    const messages = data.messages || [];
    let summary = '';
    const fileActions = new Map<string, { action: 'modified' | 'read'; timestamp: string }>();

    for (const msg of messages) {
      if (!summary && msg.role === 'user' && typeof msg.content === 'string') {
        summary = msg.content.slice(0, 200);
      }

      if (msg.content && Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item.type !== 'tool_use') continue;
          const toolPath = item.input?.path || item.input?.file_path;
          if (!toolPath) continue;

          const isWrite = WRITE_TOOLS.has(item.name);
          const isRead = READ_TOOLS.has(item.name);
          if (!isWrite && !isRead) continue;

          const absPath = path.isAbsolute(toolPath) ? toolPath : path.resolve(mdRoot, toolPath);
          if (!isMdFile(absPath) || !isWithinRoot(absPath, mdRoot)) continue;

          const relPath = path.relative(mdRoot, absPath);
          const action = isWrite ? 'modified' : 'read';
          const existing = fileActions.get(relPath);
          if (!existing || (action === 'modified' && existing.action === 'read')) {
            fileActions.set(relPath, { action, timestamp: msg.timestamp || '' });
          }
        }
      }
    }

    for (const [relPath, info] of fileActions) {
      const ref: SessionRef = {
        provider: 'opencode',
        sessionId,
        sessionFile: sessionFilePath,
        timestamp: info.timestamp,
        summary: summary || undefined,
        action: info.action,
        resumeCommand: /^[\w./-]+$/.test(sessionId) ? `opencode --resume ${sessionId}` : '',
      };
      if (!result.fileRefs.has(relPath)) result.fileRefs.set(relPath, []);
      result.fileRefs.get(relPath)!.push(ref);
    }

    return result;
  }
}
