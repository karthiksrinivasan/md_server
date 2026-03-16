import fs from 'node:fs';
import path from 'node:path';
import type { SessionParser, SessionRef, ParseResult } from './types';
import { isMdFile, isWithinRoot } from './types';

const FILE_TOOLS: Record<string, 'modified' | 'read'> = {
  Write: 'modified',
  Edit: 'modified',
  Read: 'read',
};

export class ClaudeSessionParser implements SessionParser {
  parseSessionFile(sessionFilePath: string, mdRoot: string): ParseResult {
    const result: ParseResult = { fileRefs: new Map() };
    let content: string;
    try {
      content = fs.readFileSync(sessionFilePath, 'utf-8');
    } catch {
      return result;
    }

    const lines = content.split('\n').filter((l) => l.trim());
    let sessionId = '';
    let summary = '';
    const fileActions = new Map<string, { action: 'created' | 'modified' | 'read'; timestamp: string }>();

    for (const line of lines) {
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      if (!sessionId && entry.sessionId) {
        sessionId = entry.sessionId;
      }

      if (!summary && entry.type === 'user' && entry.message?.content) {
        const text = typeof entry.message.content === 'string'
          ? entry.message.content
          : entry.message.content.find?.((c: any) => c.type === 'text')?.text;
        if (text) {
          summary = text.slice(0, 200);
        }
      }

      if (entry.message?.content && Array.isArray(entry.message.content)) {
        for (const item of entry.message.content) {
          if (item.type === 'tool_use' && FILE_TOOLS[item.name] && item.input?.file_path) {
            const filePath = item.input.file_path;
            if (isMdFile(filePath) && isWithinRoot(filePath, mdRoot)) {
              const relPath = path.relative(mdRoot, filePath);
              const existing = fileActions.get(relPath);
              const action = FILE_TOOLS[item.name];
              if (!existing || (action === 'modified' && existing.action === 'read')) {
                fileActions.set(relPath, {
                  action,
                  timestamp: entry.timestamp || new Date().toISOString(),
                });
              }
            }
          }
        }
      }
    }

    for (const [relPath, info] of fileActions) {
      const ref: SessionRef = {
        provider: 'claude',
        sessionId,
        sessionFile: sessionFilePath,
        timestamp: info.timestamp,
        summary: summary || undefined,
        action: info.action,
        resumeCommand: /^[\w./-]+$/.test(sessionId) ? `claude --resume ${sessionId}` : '',
      };
      if (!result.fileRefs.has(relPath)) result.fileRefs.set(relPath, []);
      result.fileRefs.get(relPath)!.push(ref);
    }

    return result;
  }
}
