import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ClaudeSessionParser } from '../claude';

describe('ClaudeSessionParser', () => {
  it('extracts file references from Write tool_use entries', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-parse-'));
    const sessionFile = path.join(tmpDir, '1234567890.jsonl');
    const mdRoot = '/Users/test/project';

    const lines = [
      JSON.stringify({
        type: 'user', uuid: '1', sessionId: 'session-abc',
        timestamp: '2026-03-15T10:00:00Z',
        message: { role: 'user', content: 'Update the readme' },
      }),
      JSON.stringify({
        type: 'assistant', uuid: '2', parentUuid: '1', sessionId: 'session-abc',
        timestamp: '2026-03-15T10:01:00Z',
        message: { role: 'assistant', content: [
          { type: 'tool_use', name: 'Write', input: { file_path: '/Users/test/project/README.md', content: '# Updated' } },
        ] },
      }),
    ];
    fs.writeFileSync(sessionFile, lines.join('\n'));

    const parser = new ClaudeSessionParser();
    const result = parser.parseSessionFile(sessionFile, mdRoot);
    const readmeRefs = result.fileRefs.get('README.md') ?? [];

    expect(readmeRefs.length).toBe(1);
    expect(readmeRefs[0].provider).toBe('claude');
    expect(readmeRefs[0].sessionId).toBe('session-abc');
    expect(readmeRefs[0].action).toBe('modified');
    expect(readmeRefs[0].summary).toBe('Update the readme');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects Edit tool_use as modified', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-parse-'));
    const sessionFile = path.join(tmpDir, '1234567890.jsonl');
    const mdRoot = '/Users/test/project';

    const lines = [
      JSON.stringify({
        type: 'user', uuid: '1', sessionId: 'session-def',
        timestamp: '2026-03-15T10:00:00Z',
        message: { role: 'user', content: 'Fix the docs' },
      }),
      JSON.stringify({
        type: 'assistant', uuid: '2', sessionId: 'session-def',
        timestamp: '2026-03-15T10:01:00Z',
        message: { role: 'assistant', content: [
          { type: 'tool_use', name: 'Edit', input: { file_path: '/Users/test/project/docs/guide.md', old_string: 'old', new_string: 'new' } },
        ] },
      }),
    ];
    fs.writeFileSync(sessionFile, lines.join('\n'));

    const parser = new ClaudeSessionParser();
    const result = parser.parseSessionFile(sessionFile, mdRoot);
    const guideRefs = result.fileRefs.get('docs/guide.md') ?? [];

    expect(guideRefs.length).toBe(1);
    expect(guideRefs[0].action).toBe('modified');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects Read tool_use as read action', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-parse-'));
    const sessionFile = path.join(tmpDir, '1234567890.jsonl');
    const mdRoot = '/Users/test/project';

    const lines = [
      JSON.stringify({
        type: 'user', uuid: '1', sessionId: 'session-ghi',
        timestamp: '2026-03-15T10:00:00Z',
        message: { role: 'user', content: 'Read the changelog' },
      }),
      JSON.stringify({
        type: 'assistant', uuid: '2', sessionId: 'session-ghi',
        timestamp: '2026-03-15T10:01:00Z',
        message: { role: 'assistant', content: [
          { type: 'tool_use', name: 'Read', input: { file_path: '/Users/test/project/CHANGELOG.md' } },
        ] },
      }),
    ];
    fs.writeFileSync(sessionFile, lines.join('\n'));

    const parser = new ClaudeSessionParser();
    const result = parser.parseSessionFile(sessionFile, mdRoot);
    const clRefs = result.fileRefs.get('CHANGELOG.md') ?? [];

    expect(clRefs.length).toBe(1);
    expect(clRefs[0].action).toBe('read');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ignores non-md file references', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-parse-'));
    const sessionFile = path.join(tmpDir, '1234567890.jsonl');
    const mdRoot = '/Users/test/project';

    const lines = [
      JSON.stringify({
        type: 'assistant', uuid: '1', sessionId: 'session-xyz',
        timestamp: '2026-03-15T10:00:00Z',
        message: { role: 'assistant', content: [
          { type: 'tool_use', name: 'Write', input: { file_path: '/Users/test/project/src/index.ts', content: 'code' } },
        ] },
      }),
    ];
    fs.writeFileSync(sessionFile, lines.join('\n'));

    const parser = new ClaudeSessionParser();
    const result = parser.parseSessionFile(sessionFile, mdRoot);

    expect(result.fileRefs.size).toBe(0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles malformed JSONL lines gracefully', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-parse-'));
    const sessionFile = path.join(tmpDir, '1234567890.jsonl');
    const mdRoot = '/Users/test/project';

    fs.writeFileSync(sessionFile, 'not json\n{invalid\n');

    const parser = new ClaudeSessionParser();
    const result = parser.parseSessionFile(sessionFile, mdRoot);

    expect(result.fileRefs.size).toBe(0);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
