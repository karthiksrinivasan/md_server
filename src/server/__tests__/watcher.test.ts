import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { FileWatcher, type WatchEvent } from '../watcher';

// @parcel/watcher uses native OS APIs which may need a moment to settle
const SETTLE_MS = 1000;
const EVENT_WAIT_MS = 1500;

function waitFor(events: WatchEvent[], predicate: (e: WatchEvent) => boolean, timeout = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (events.some(predicate)) return resolve(true);
      if (Date.now() - start > timeout) return resolve(false);
      setTimeout(check, 100);
    };
    check();
  });
}

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
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    fs.writeFileSync(path.join(rootDir, 'existing.md'), '# Updated');
    const found = await waitFor(events, (e) => e.type === 'file:changed');
    expect(found).toBe(true);
    const changeEvent = events.find((e) => e.type === 'file:changed');
    expect(changeEvent!.path).toContain('existing.md');
  });

  it('detects file additions', async () => {
    watcher = new FileWatcher();
    const events: WatchEvent[] = [];
    watcher.onEvent((event) => events.push(event));
    await watcher.start(rootDir, { include: [], exclude: [], filter: null });
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    fs.writeFileSync(path.join(rootDir, 'new-file-' + Date.now() + '.md'), '# New File');
    const found = await waitFor(events, (e) => e.type === 'file:added');
    expect(found).toBe(true);
  });

  it('detects file removals', async () => {
    const tempFile = path.join(rootDir, 'to-delete.md');
    fs.writeFileSync(tempFile, '# Delete Me');
    watcher = new FileWatcher();
    const events: WatchEvent[] = [];
    watcher.onEvent((event) => events.push(event));
    await watcher.start(rootDir, { include: [], exclude: [], filter: null });
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    fs.unlinkSync(tempFile);
    const found = await waitFor(events, (e) => e.type === 'file:removed');
    expect(found).toBe(true);
  });

  it('only watches .md and asset files', async () => {
    watcher = new FileWatcher();
    const events: WatchEvent[] = [];
    watcher.onEvent((event) => events.push(event));
    await watcher.start(rootDir, { include: [], exclude: [], filter: null });
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    fs.writeFileSync(path.join(rootDir, 'ignored.txt'), 'not markdown');
    await new Promise((r) => setTimeout(r, EVENT_WAIT_MS));
    const txtEvents = events.filter((e) => e.path.endsWith('.txt'));
    expect(txtEvents.length).toBe(0);
  });

  it('detects asset changes', async () => {
    watcher = new FileWatcher();
    const events: WatchEvent[] = [];
    watcher.onEvent((event) => events.push(event));
    await watcher.start(rootDir, { include: [], exclude: [], filter: null });
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    fs.writeFileSync(path.join(rootDir, 'image.png'), Buffer.from('fake png'));
    const found = await waitFor(events, (e) => e.type === 'asset:changed' && e.path === 'image.png');
    expect(found).toBe(true);
  });

  it('respects exclude filters', async () => {
    const excludeDir = path.join(rootDir, 'drafts');
    fs.mkdirSync(excludeDir, { recursive: true });
    watcher = new FileWatcher();
    const events: WatchEvent[] = [];
    watcher.onEvent((event) => events.push(event));
    await watcher.start(rootDir, { include: [], exclude: ['drafts/**'], filter: null });
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    fs.writeFileSync(path.join(excludeDir, 'draft.md'), '# Draft');
    await new Promise((r) => setTimeout(r, EVENT_WAIT_MS));
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
    await new Promise((r) => setTimeout(r, EVENT_WAIT_MS));
    const afterStopEvents = events.filter((e) => e.path.includes('after-stop'));
    expect(afterStopEvents.length).toBe(0);
  });
});
