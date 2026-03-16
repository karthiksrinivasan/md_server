import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRegistry, type AgentConfig } from '../agent-registry';

// Mock execFile as a callback-style function (promisify wraps it)
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
const mockExecFile = vi.mocked(execFile);

function mockWhichResult(predicate: (binary: string) => boolean) {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    // promisify calls execFile(cmd, args, opts, cb) — callback is the last arg
    const cb = args[args.length - 1] as (err: Error | null, result?: unknown) => void;
    const binArgs = args[1] as string[];
    if (binArgs && predicate(binArgs[0])) {
      cb(null, { stdout: `/usr/bin/${binArgs[0]}` });
    } else {
      cb(new Error('not found'));
    }
    return undefined as any;
  });
}

describe('AgentRegistry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns built-in agent configs', () => {
    const registry = new AgentRegistry();
    const builtins = registry.getAllConfigs();
    expect(builtins.length).toBeGreaterThanOrEqual(4);
    const ids = builtins.map((a) => a.id);
    expect(ids).toContain('claude');
    expect(ids).toContain('codex');
    expect(ids).toContain('aider');
    expect(ids).toContain('opencode');
  });

  it('detects available agents via which command', async () => {
    mockWhichResult((binary) => binary === 'claude');

    const registry = new AgentRegistry();
    await registry.detectAvailable();
    const available = registry.getAvailableAgents();

    expect(available.length).toBe(1);
    expect(available[0].id).toBe('claude');
  });

  it('returns empty when no agents are installed', async () => {
    mockWhichResult(() => false);

    const registry = new AgentRegistry();
    await registry.detectAvailable();
    const available = registry.getAvailableAgents();

    expect(available.length).toBe(0);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('AgentRegistry - custom configs', () => {
  it('loads custom agents from config file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-reg-'));
    const configPath = path.join(tmpDir, 'agents.json');
    fs.writeFileSync(configPath, JSON.stringify([
      {
        id: 'my-agent',
        name: 'My Agent',
        binary: 'my-agent',
        detectArgs: ['--version'],
        summarizeArgs: ['summarize', '{file}'],
        editArgs: ['edit', '{file}', '--prompt', '{prompt}'],
        resumeArgs: ['resume', '{sessionId}'],
        sessionPaths: [],
      },
    ]));

    const registry = new AgentRegistry(configPath);
    const configs = registry.getAllConfigs();
    expect(configs.find((a) => a.id === 'my-agent')).toBeTruthy();
    expect(configs.find((a) => a.id === 'my-agent')!.name).toBe('My Agent');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('overrides built-in config with custom config', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-reg-'));
    const configPath = path.join(tmpDir, 'agents.json');
    fs.writeFileSync(configPath, JSON.stringify([
      { id: 'claude', name: 'My Claude', timeout: 60000 },
    ]));

    const registry = new AgentRegistry(configPath);
    const claude = registry.getAgent('claude');
    expect(claude!.name).toBe('My Claude');
    expect(claude!.timeout).toBe(60000);
    expect(claude!.binary).toBe('claude');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles missing config file gracefully', () => {
    const registry = new AgentRegistry('/nonexistent/path/agents.json');
    const configs = registry.getAllConfigs();
    expect(configs.length).toBeGreaterThanOrEqual(4);
  });
});
