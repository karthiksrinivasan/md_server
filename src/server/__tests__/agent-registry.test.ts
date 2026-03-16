import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRegistry, type AgentConfig } from '../agent-registry';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
const mockExecFileSync = vi.mocked(execFileSync);

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
    mockExecFileSync.mockImplementation((_cmd: string, args?: string[]) => {
      if (args && args[0] === 'claude') return Buffer.from('/usr/bin/claude');
      throw new Error('not found');
    });

    const registry = new AgentRegistry();
    await registry.detectAvailable();
    const available = registry.getAvailableAgents();

    expect(available.length).toBe(1);
    expect(available[0].id).toBe('claude');
  });

  it('returns empty when no agents are installed', async () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });

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
