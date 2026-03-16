import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CodexSessionParser } from '../codex';

describe('CodexSessionParser', () => {
  it('extracts file references from Codex JSONL sessions', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-parse-'));
    const sessionFile = path.join(tmpDir, 'rollout-abc123.jsonl');
    const mdRoot = '/Users/test/project';

    const lines = [
      JSON.stringify({
        type: 'user', role: 'user', content: 'Update the docs',
        cwd: '/Users/test/project', timestamp: '2026-03-15T10:00:00Z',
      }),
      JSON.stringify({
        type: 'assistant', role: 'assistant',
        content: [
          { type: 'tool_use', name: 'write_file', input: { path: 'README.md', content: '# Updated' } },
        ],
        cwd: '/Users/test/project', timestamp: '2026-03-15T10:01:00Z',
      }),
    ];
    fs.writeFileSync(sessionFile, lines.join('\n'));

    const parser = new CodexSessionParser();
    const result = parser.parseSessionFile(sessionFile, mdRoot);
    const readmeRefs = result.fileRefs.get('README.md') ?? [];

    expect(readmeRefs.length).toBe(1);
    expect(readmeRefs[0].provider).toBe('codex');
    expect(readmeRefs[0].action).toBe('modified');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles malformed lines gracefully', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-parse-'));
    const sessionFile = path.join(tmpDir, 'rollout-bad.jsonl');

    fs.writeFileSync(sessionFile, 'not json\n');

    const parser = new CodexSessionParser();
    const result = parser.parseSessionFile(sessionFile, '/tmp');

    expect(result.fileRefs.size).toBe(0);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
