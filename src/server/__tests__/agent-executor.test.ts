import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentExecutor } from '../agent-executor';
import type { AgentConfig } from '../agent-registry';
import { Writable } from 'node:stream';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn(),
    },
  };
});

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

const mockSpawn = vi.mocked(spawn);
const mockReadFileSync = vi.mocked(fs.readFileSync);

function createMockStdin() {
  return { write: vi.fn(), end: vi.fn() } as any;
}

function createMockProcess(stdout = '', stderr = '', exitCode = 0) {
  const proc = new EventEmitter() as any;
  proc.stdout = Readable.from([stdout]);
  proc.stderr = Readable.from([stderr]);
  proc.stdin = createMockStdin();
  proc.kill = vi.fn();
  setTimeout(() => proc.emit('close', exitCode), 10);
  return proc;
}

const testAgent: AgentConfig = {
  id: 'test-agent',
  name: 'Test Agent',
  binary: 'test-agent',
  detectArgs: ['--version'],
  summarizeArgs: ['--print', 'Summarize: {file}'],
  editArgs: ['--print', 'Edit {file}: {selection} => {prompt}'],
  resumeArgs: ['--resume', '{sessionId}'],
  sessionPaths: [],
  timeout: 5000,
};

describe('AgentExecutor', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: file reads succeed
    mockReadFileSync.mockReturnValue('# Test Content\n\nSome markdown text.');
  });

  it('summarize reads file and spawns correct command', async () => {
    mockSpawn.mockReturnValue(createMockProcess('This is a summary'));

    const executor = new AgentExecutor('/tmp/root');
    const result = await executor.summarize(testAgent, 'docs/readme.md');

    expect(mockReadFileSync).toHaveBeenCalledWith('/tmp/root/docs/readme.md', 'utf-8');
    expect(mockSpawn).toHaveBeenCalledWith(
      'test-agent',
      ['--print', 'Summarize: docs/readme.md'],
      expect.objectContaining({ cwd: '/tmp/root', shell: false }),
    );
    expect(result).toEqual({ summary: 'This is a summary' });
  });

  it('summarize returns error when file cannot be read', async () => {
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const executor = new AgentExecutor('/tmp/root');
    const result = await executor.summarize(testAgent, 'docs/readme.md');

    expect(result).toEqual({ error: expect.stringContaining('Could not read file') });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('edit spawns correct command with selection', async () => {
    mockSpawn.mockReturnValue(createMockProcess(''));

    const executor = new AgentExecutor('/tmp/root');
    const result = await executor.edit(testAgent, 'docs/readme.md', 'make it shorter', 'some selected text');

    expect(mockSpawn).toHaveBeenCalledWith(
      'test-agent',
      expect.arrayContaining(['--print']),
      expect.objectContaining({ cwd: '/tmp/root', shell: false }),
    );
    expect(result).toEqual({ success: true });
  });

  it('edit without selection works', async () => {
    mockSpawn.mockReturnValue(createMockProcess(''));

    const executor = new AgentExecutor('/tmp/root');
    const result = await executor.edit(testAgent, 'docs/readme.md', 'rewrite completely');

    expect(mockSpawn).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it('returns error when process exits with non-zero code', async () => {
    mockSpawn.mockReturnValue(createMockProcess('', 'Something went wrong', 1));

    const executor = new AgentExecutor('/tmp/root');
    const result = await executor.summarize(testAgent, 'docs/readme.md');

    expect(result).toEqual({ error: 'Something went wrong' });
  });

  it('returns error on timeout', async () => {
    const proc = new EventEmitter() as any;
    proc.stdout = Readable.from([]);
    proc.stderr = Readable.from([]);
    proc.stdin = createMockStdin();
    proc.kill = vi.fn();
    // Never emits 'close' — simulates hang
    mockSpawn.mockReturnValue(proc);

    const shortTimeoutAgent = { ...testAgent, timeout: 50 };
    const executor = new AgentExecutor('/tmp/root');
    const result = await executor.summarize(shortTimeoutAgent, 'docs/readme.md');

    expect(result).toEqual({ error: expect.stringContaining('timed out') });
    expect(proc.kill).toHaveBeenCalled();
  });

  it('validates file path stays within root', async () => {
    const executor = new AgentExecutor('/tmp/root');
    const result = await executor.summarize(testAgent, '../../../etc/passwd');

    expect(result).toEqual({ error: expect.stringContaining('outside') });
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
