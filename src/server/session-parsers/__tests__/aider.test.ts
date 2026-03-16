import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AiderSessionParser } from '../aider';

describe('AiderSessionParser', () => {
  it('extracts file references from aider chat history', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aider-parse-'));
    const historyFile = path.join(tmpDir, '.aider.chat.history.md');
    const mdRoot = tmpDir;

    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test');

    const history = `
#### 2026-03-15T10:00:00Z
> /add README.md

I'll update the README for you.

#### 2026-03-15T11:00:00Z
> Fix the typo in the intro
`;
    fs.writeFileSync(historyFile, history);

    const parser = new AiderSessionParser();
    const result = parser.parseSessionFile(historyFile, mdRoot);
    const readmeRefs = result.fileRefs.get('README.md') ?? [];

    expect(readmeRefs.length).toBeGreaterThanOrEqual(1);
    expect(readmeRefs[0].provider).toBe('aider');
    expect(readmeRefs[0].action).toBe('modified');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles empty history file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aider-parse-'));
    const historyFile = path.join(tmpDir, '.aider.chat.history.md');
    fs.writeFileSync(historyFile, '');

    const parser = new AiderSessionParser();
    const result = parser.parseSessionFile(historyFile, tmpDir);

    expect(result.fileRefs.size).toBe(0);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
