import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { OpenCodeSessionParser } from '../opencode';

describe('OpenCodeSessionParser', () => {
  it('extracts file references from OpenCode session JSON', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-parse-'));
    const sessionFile = path.join(tmpDir, 'session-001.json');
    const mdRoot = '/Users/test/project';

    const sessionData = {
      id: 'oc-session-001',
      messages: [
        { role: 'user', content: 'Update the changelog', timestamp: '2026-03-15T10:00:00Z' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', name: 'write_file', input: { path: '/Users/test/project/CHANGELOG.md', content: '# Changelog' } },
          ],
          timestamp: '2026-03-15T10:01:00Z',
        },
      ],
    };
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData));

    const parser = new OpenCodeSessionParser();
    const result = parser.parseSessionFile(sessionFile, mdRoot);
    const clRefs = result.fileRefs.get('CHANGELOG.md') ?? [];

    expect(clRefs.length).toBe(1);
    expect(clRefs[0].provider).toBe('opencode');
    expect(clRefs[0].sessionId).toBe('oc-session-001');
    expect(clRefs[0].action).toBe('modified');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles invalid JSON gracefully', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-parse-'));
    const sessionFile = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(sessionFile, 'not json');

    const parser = new OpenCodeSessionParser();
    const result = parser.parseSessionFile(sessionFile, '/tmp');

    expect(result.fileRefs.size).toBe(0);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
