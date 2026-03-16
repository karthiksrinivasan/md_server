import fs from 'node:fs';
import path from 'node:path';
import type { SessionParser, SessionRef, ParseResult } from './types';
import { isMdFile, isWithinRoot } from './types';

export class AiderSessionParser implements SessionParser {
  parseSessionFile(historyFilePath: string, mdRoot: string): ParseResult {
    const result: ParseResult = { fileRefs: new Map() };
    let content: string;
    try {
      content = fs.readFileSync(historyFilePath, 'utf-8');
    } catch {
      return result;
    }

    if (!content.trim()) return result;

    const sessionBlocks = content.split(/^####\s+/m).filter((b) => b.trim());
    const fileActions = new Map<string, { action: 'modified' | 'read'; timestamp: string; summary: string }>();

    for (const block of sessionBlocks) {
      const timestampMatch = block.match(/^(\d{4}-\d{2}-\d{2}T[\d:]+Z?)/);
      const timestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString();

      const addMatches = block.matchAll(/>\s*\/add\s+(.+)/g);
      for (const match of addMatches) {
        const filePath = match[1].trim();
        if (!isMdFile(filePath)) continue;

        const absPath = path.resolve(mdRoot, filePath);
        if (!isWithinRoot(absPath, mdRoot)) continue;

        const relPath = path.relative(mdRoot, absPath);
        const userMsgMatch = block.match(/>\s*(?!\/)(.*)/);
        const summary = userMsgMatch ? userMsgMatch[1].trim().slice(0, 200) : '';

        fileActions.set(relPath, { action: 'modified', timestamp, summary });
      }

      const fenceMatches = block.matchAll(/```[\w]*\s+([\w/./-]+\.(?:md|markdown))/gi);
      for (const match of fenceMatches) {
        const filePath = match[1];
        const absPath = path.resolve(mdRoot, filePath);
        if (!isWithinRoot(absPath, mdRoot)) continue;

        const relPath = path.relative(mdRoot, absPath);
        if (!fileActions.has(relPath)) {
          fileActions.set(relPath, { action: 'modified', timestamp, summary: '' });
        }
      }
    }

    const sessionId = path.basename(historyFilePath, '.md');

    for (const [relPath, info] of fileActions) {
      const ref: SessionRef = {
        provider: 'aider',
        sessionId,
        sessionFile: historyFilePath,
        timestamp: info.timestamp,
        summary: info.summary || undefined,
        action: info.action,
        resumeCommand: 'aider',
      };
      if (!result.fileRefs.has(relPath)) result.fileRefs.set(relPath, []);
      result.fileRefs.get(relPath)!.push(ref);
    }

    return result;
  }
}
