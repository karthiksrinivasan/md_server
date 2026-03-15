import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { FileWatcher, type WatchEvent } from '../watcher';

describe('FileWatcher', () => {
  const rootDir = path.join(os.tmpdir(), 'watcher-test-' + Date.now());
  let watcher: FileWatcher;

  beforeAll(() => {
    fs.mkdirSync(path.join(rootDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'existing.md'), '# Existing');
    fs.writeFileSync(path.join(rootDir, 'sub', 'nested.md'), '# Nested');
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
    }
  });

  afterAll(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('detects file changes', async () => {
    watcher = new FileWatcher();
    const events: WatchEvent[] = [];
    watcher.onEvent((event) => events.push(event));
    await watcher.start(rootDir, { include: [], exclude: [], filter: null });
    await new Promise((r) => setTimeout(r, 500));
    fs.writeFileSync(path.join(rootDir, 'existing.md'), '# Updated');
    await new Promise((r) => setTimeout(r, 800));
    expect(events.some((e) => e.type === 'file:changed')).toBe(true);
    const changeEvent = events.find((e) => e.type === 'file:changed');
    expect(changeEvent!.path).toContain('existing.md');
  });

  it('detects file additions', async () => {
    watcher = new FileWatcher();
    const events: WatchEvent[] = [];
    watcher.onEvent((event) => events.push(event));
    await watcher.start(rootDir, { include: [], exclude: [], filter: null });
    await new Promise((r) => setTimeout(r, 500));
    fs.writeFileSync(path.join(rootDir, 'new-file.md'), '# New File');
    await new Promise((r) => setTimeout(r, 800));
    expect(events.some((e) => e.type === 'file:added')).toBe(true);
  });

  it('detects file removals', async () => {
    const tempFile = path.join(rootDir, 'to-delete.md');
    fs.writeFileSync(tempFile, '# Delete Me');
    watcher = new FileWatcher();
    const events: WatchEvent[] = [];
    watcher.onEvent((event) => events.push(event));
    await watcher.start(rootDir, { include: [], exclude: [], filter: null });
    await new Promise((r) => setTimeout(r, 500));
    fs.unlinkSync(tempFile);
    await new Promise((r) => setTimeout(r, 800));
    expect(events.some((e) => e.type === 'file:removed')).toBe(true);
  });

  it('only watches .md files', async () => {
    watcher = new FileWatcher();
    const events: WatchEvent[] = [];
    watcher.onEvent((event) => events.push(event));
    await watcher.start(rootDir, { include: [], exclude: [], filter: null });
    await new Promise((r) => setTimeout(r, 500));
    fs.writeFileSync(path.join(rootDir, 'ignored.txt'), 'not markdown');
    await new Promise((r) => setTimeout(r, 800));
    const txtEvents = events.filter((e) => e.path.endsWith('.txt'));
    expect(txtEvents.length).toBe(0);
  });

  it('respects exclude filters', async () => {
    const excludeDir = path.join(rootDir, 'drafts');
    fs.mkdirSync(excludeDir, { recursive: true });
    watcher = new FileWatcher();
    const events: WatchEvent[] = [];
    watcher.onEvent((event) => events.push(event));
    await watcher.start(rootDir, { include: [], exclude: ['drafts/**'], filter: null });
    await new Promise((r) => setTimeout(r, 500));
    fs.writeFileSync(path.join(excludeDir, 'draft.md'), '# Draft');
    await new Promise((r) => setTimeout(r, 800));
    const draftEvents = events.filter((e) => e.path.includes('drafts'));
    expect(draftEvents.length).toBe(0);
  });

  it('stops cleanly', async () => {
    watcher = new FileWatcher();
    const events: WatchEvent[] = [];
    watcher.onEvent((event) => events.push(event));
    await watcher.start(rootDir, { include: [], exclude: [], filter: null });
    await watcher.stop();
    fs.writeFileSync(path.join(rootDir, 'after-stop.md'), '# After Stop');
    await new Promise((r) => setTimeout(r, 800));
    const afterStopEvents = events.filter((e) => e.path.includes('after-stop'));
    expect(afterStopEvents.length).toBe(0);
  });
});
