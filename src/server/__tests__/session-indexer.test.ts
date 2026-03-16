import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionIndexer } from '../session-indexer';

describe('SessionIndexer', () => {
  let tmpDir: string;
  let mdRoot: string;
  let cacheDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-idx-'));
    mdRoot = path.join(tmpDir, 'docs');
    cacheDir = path.join(mdRoot, '.md_server');
    fs.mkdirSync(mdRoot, { recursive: true });
    fs.writeFileSync(path.join(mdRoot, 'README.md'), '# Test');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('builds index from Claude session files', async () => {
    const claudeDir = path.join(tmpDir, '.claude', 'projects', '-test-project');
    fs.mkdirSync(claudeDir, { recursive: true });
    const sessionFile = path.join(claudeDir, '1234567890.jsonl');
    const absReadmePath = path.join(mdRoot, 'README.md');

    const lines = [
      JSON.stringify({
        type: 'user', uuid: '1', sessionId: 'sess-1',
        timestamp: '2026-03-15T10:00:00Z',
        message: { role: 'user', content: 'Update readme' },
      }),
      JSON.stringify({
        type: 'assistant', uuid: '2', sessionId: 'sess-1',
        timestamp: '2026-03-15T10:01:00Z',
        message: { role: 'assistant', content: [
          { type: 'tool_use', name: 'Write', input: { file_path: absReadmePath, content: '# Updated' } },
        ] },
      }),
    ];
    fs.writeFileSync(sessionFile, lines.join('\n'));

    const indexer = new SessionIndexer(mdRoot, cacheDir);
    await indexer.buildIndex([{ provider: 'claude', paths: [claudeDir] }]);

    const sessions = indexer.getSessionsForFile('README.md');
    expect(sessions.length).toBe(1);
    expect(sessions[0].provider).toBe('claude');
    expect(sessions[0].summary).toBe('Update readme');
  });

  it('persists and loads index from cache', async () => {
    const claudeDir = path.join(tmpDir, '.claude', 'projects', '-test-project');
    fs.mkdirSync(claudeDir, { recursive: true });
    const sessionFile = path.join(claudeDir, '1234567890.jsonl');
    const absReadmePath = path.join(mdRoot, 'README.md');

    fs.writeFileSync(sessionFile, [
      JSON.stringify({
        type: 'user', uuid: '1', sessionId: 'sess-1',
        timestamp: '2026-03-15T10:00:00Z',
        message: { role: 'user', content: 'Update readme' },
      }),
      JSON.stringify({
        type: 'assistant', uuid: '2', sessionId: 'sess-1',
        timestamp: '2026-03-15T10:01:00Z',
        message: { role: 'assistant', content: [
          { type: 'tool_use', name: 'Write', input: { file_path: absReadmePath, content: '# Updated' } },
        ] },
      }),
    ].join('\n'));

    const indexer1 = new SessionIndexer(mdRoot, cacheDir);
    await indexer1.buildIndex([{ provider: 'claude', paths: [claudeDir] }]);

    const indexer2 = new SessionIndexer(mdRoot, cacheDir);
    await indexer2.buildIndex([{ provider: 'claude', paths: [claudeDir] }]);

    const sessions = indexer2.getSessionsForFile('README.md');
    expect(sessions.length).toBe(1);
  });

  it('returns empty array for files with no sessions', () => {
    const indexer = new SessionIndexer(mdRoot, cacheDir);
    const sessions = indexer.getSessionsForFile('nonexistent.md');
    expect(sessions).toEqual([]);
  });
});
