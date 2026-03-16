# Agent Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add coding agent integration to md_server — AI-powered summarization, editing, and session history tracking across multiple coding agents (Claude Code, Codex, Aider, OpenCode).

**Architecture:** Layered modules within the existing Next.js process, following the established pattern of `src/server/*.ts` modules with singleton wrappers. Agent CLIs are invoked via `child_process.spawn`. Session history is indexed at startup and cached to `.md_server/session-index.json`. The existing chokidar file watcher handles UI refresh after agent edits.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, child_process.spawn, chokidar (existing)

**Spec:** `docs/superpowers/specs/2026-03-15-agent-integration-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/server/agent-registry.ts` | Agent config schema, built-in configs, detection via `which` |
| `src/server/agent-registry-singleton.ts` | Global singleton for agent registry |
| `src/server/agent-executor.ts` | Spawn agent CLI processes, handle timeout/errors |
| `src/server/session-indexer.ts` | Build/cache file→session index, incremental updates |
| `src/server/session-indexer-singleton.ts` | Global singleton for session indexer |
| `src/server/session-parsers/claude.ts` | Parse Claude Code JSONL sessions for file refs |
| `src/server/session-parsers/codex.ts` | Parse Codex JSONL sessions for file refs |
| `src/server/session-parsers/aider.ts` | Parse Aider chat history for file refs |
| `src/server/session-parsers/opencode.ts` | Parse OpenCode sessions for file refs |
| `src/server/session-parsers/types.ts` | Shared types for session parsers |
| `src/app/api/agents/route.ts` | GET /api/agents endpoint |
| `src/app/api/agent/summarize/route.ts` | POST /api/agent/summarize endpoint |
| `src/app/api/agent/edit/route.ts` | POST /api/agent/edit endpoint |
| `src/app/api/sessions/route.ts` | GET /api/sessions endpoint |
| `src/components/agent-toolbar.tsx` | Toolbar with Summarize/Edit/Sessions buttons |
| `src/components/agent-picker.tsx` | Dropdown for selecting which agent to use |
| `src/components/agent-badges.tsx` | Header badges showing detected agents |
| `src/components/selection-edit-bar.tsx` | Floating prompt bar on text selection |
| `src/components/sessions-panel.tsx` | Right sidebar panel showing sessions |
| `src/components/summary-modal.tsx` | Modal displaying AI-generated summary |
| `src/hooks/use-agents.ts` | Hook for fetching/managing agent state |
| `src/hooks/use-sessions.ts` | Hook for fetching sessions for current file |
| `src/hooks/use-text-selection.ts` | Hook for tracking text selection in markdown |

### New Test Files

| File | Tests |
|------|-------|
| `src/server/__tests__/agent-registry.test.ts` | Detection, config loading, custom agents |
| `src/server/__tests__/agent-executor.test.ts` | Spawn, timeout, error handling |
| `src/server/__tests__/session-indexer.test.ts` | Index build, cache, incremental updates |
| `src/server/session-parsers/__tests__/claude.test.ts` | Claude JSONL parsing |
| `src/server/session-parsers/__tests__/codex.test.ts` | Codex JSONL parsing |
| `src/server/session-parsers/__tests__/aider.test.ts` | Aider history parsing |
| `src/server/session-parsers/__tests__/opencode.test.ts` | OpenCode session parsing |
| `src/app/api/__tests__/agents.test.ts` | GET /api/agents |
| `src/app/api/__tests__/agent-summarize.test.ts` | POST /api/agent/summarize |
| `src/app/api/__tests__/agent-edit.test.ts` | POST /api/agent/edit |
| `src/app/api/__tests__/sessions.test.ts` | GET /api/sessions |

### Modified Files

| File | Change |
|------|--------|
| `src/app/layout-context.tsx` | Add agent/session state fields |
| `src/components/layout-shell.tsx` | Add agent badges to header |
| `src/app/[[...path]]/page.tsx` | Add agent toolbar, sessions panel, selection edit bar |

---

## Chunk 1: Agent Registry & Executor (Backend Core)

### Task 1: Agent Registry — Types and Built-in Configs

**Files:**
- Create: `src/server/agent-registry.ts`
- Test: `src/server/__tests__/agent-registry.test.ts`

- [ ] **Step 1: Write the failing test for agent config types and built-in detection**

```ts
// src/server/__tests__/agent-registry.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/__tests__/agent-registry.test.ts`
Expected: FAIL — module `../agent-registry` not found

- [ ] **Step 3: Implement AgentRegistry**

```ts
// src/server/agent-registry.ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface AgentConfig {
  id: string;
  name: string;
  binary: string;
  detectArgs: string[];
  summarizeArgs: string[];
  editArgs: string[];
  resumeArgs: string[];
  sessionPaths: string[];
  timeout?: number;
}

const BUILT_IN_AGENTS: AgentConfig[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    binary: 'claude',
    detectArgs: ['--version'],
    summarizeArgs: ['--print', 'Summarize the following markdown file concisely: {file}'],
    editArgs: ['--print', 'In the file {file}, find the section containing: {selection}. Apply this edit: {prompt}'],
    resumeArgs: ['--resume', '{sessionId}'],
    sessionPaths: ['~/.claude/projects/'],
    timeout: 120000,
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    binary: 'codex',
    detectArgs: ['--version'],
    summarizeArgs: ['--quiet', 'Summarize the following markdown file concisely: {file}'],
    editArgs: ['--quiet', 'In the file {file}, find the section containing: {selection}. Apply this edit: {prompt}'],
    resumeArgs: ['--resume', '{sessionId}'],
    sessionPaths: ['~/.codex/sessions/', '~/.codex/archived_sessions/'],
    timeout: 120000,
  },
  {
    id: 'aider',
    name: 'Aider',
    binary: 'aider',
    detectArgs: ['--version'],
    summarizeArgs: ['--message', 'Summarize the following markdown file concisely', '{file}'],
    editArgs: ['--message', '{prompt}', '{file}'],
    resumeArgs: [],
    sessionPaths: [],
    timeout: 120000,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    binary: 'opencode',
    detectArgs: ['--version'],
    summarizeArgs: ['--print', 'Summarize the following markdown file concisely: {file}'],
    editArgs: ['--print', 'In the file {file}, find the section containing: {selection}. Apply this edit: {prompt}'],
    resumeArgs: ['--resume', '{sessionId}'],
    sessionPaths: ['~/.local/share/opencode/'],
    timeout: 120000,
  },
];

export class AgentRegistry {
  private configs: AgentConfig[];
  private available: Set<string> = new Set();

  constructor(customConfigPath?: string) {
    this.configs = [...BUILT_IN_AGENTS];
    if (customConfigPath) {
      this.loadCustomConfigs(customConfigPath);
    }
  }

  private loadCustomConfigs(configPath: string): void {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const custom: AgentConfig[] = JSON.parse(raw);
      for (const agent of custom) {
        const existingIndex = this.configs.findIndex((a) => a.id === agent.id);
        if (existingIndex >= 0) {
          this.configs[existingIndex] = { ...this.configs[existingIndex], ...agent };
        } else {
          this.configs.push(agent);
        }
      }
    } catch {
      // Custom config file doesn't exist or is invalid — skip silently
    }
  }

  async detectAvailable(): Promise<void> {
    this.available.clear();
    for (const agent of this.configs) {
      try {
        execFileSync('which', [agent.binary], { stdio: 'pipe' });
        this.available.add(agent.id);
      } catch {
        // Agent not installed
      }
    }
  }

  getAllConfigs(): AgentConfig[] {
    return [...this.configs];
  }

  getAvailableAgents(): AgentConfig[] {
    return this.configs.filter((a) => this.available.has(a.id));
  }

  getAgent(id: string): AgentConfig | undefined {
    return this.configs.find((a) => a.id === id);
  }

  isAvailable(id: string): boolean {
    return this.available.has(id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/__tests__/agent-registry.test.ts`
Expected: PASS — all 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/server/agent-registry.ts src/server/__tests__/agent-registry.test.ts
git commit -m "feat: add agent registry with built-in configs and detection"
```

---

### Task 2: Agent Registry — Custom Config Loading

**Files:**
- Modify: `src/server/agent-registry.ts`
- Modify: `src/server/__tests__/agent-registry.test.ts`

- [ ] **Step 1: Write the failing test for custom config**

Add to `src/server/__tests__/agent-registry.test.ts`:

```ts
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
    expect(claude!.binary).toBe('claude'); // preserved from built-in

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles missing config file gracefully', () => {
    const registry = new AgentRegistry('/nonexistent/path/agents.json');
    const configs = registry.getAllConfigs();
    expect(configs.length).toBeGreaterThanOrEqual(4); // built-ins still loaded
  });
});
```

Add these imports at the top of the test file:

```ts
import fs from 'node:fs';
import path from 'node:path';
```

- [ ] **Step 2: Run test to verify it passes** (implementation already handles this)

Run: `npx vitest run src/server/__tests__/agent-registry.test.ts`
Expected: PASS — all 6 tests

- [ ] **Step 3: Commit**

```bash
git add src/server/__tests__/agent-registry.test.ts
git commit -m "test: add custom agent config loading tests"
```

---

### Task 3: Agent Executor

**Files:**
- Create: `src/server/agent-executor.ts`
- Test: `src/server/__tests__/agent-executor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/__tests__/agent-executor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentExecutor } from '../agent-executor';
import type { AgentConfig } from '../agent-registry';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

const mockSpawn = vi.mocked(spawn);

function createMockProcess(stdout = '', stderr = '', exitCode = 0) {
  const proc = new EventEmitter() as any;
  proc.stdout = Readable.from([stdout]);
  proc.stderr = Readable.from([stderr]);
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
  });

  it('summarize spawns correct command and returns stdout', async () => {
    mockSpawn.mockReturnValue(createMockProcess('This is a summary'));

    const executor = new AgentExecutor('/tmp/root');
    const result = await executor.summarize(testAgent, 'docs/readme.md');

    expect(mockSpawn).toHaveBeenCalledWith(
      'test-agent',
      ['--print', 'Summarize: docs/readme.md'],
      expect.objectContaining({ cwd: '/tmp/root', shell: false }),
    );
    expect(result).toEqual({ summary: 'This is a summary' });
  });

  it('edit spawns correct command with selection', async () => {
    mockSpawn.mockReturnValue(createMockProcess(''));

    const executor = new AgentExecutor('/tmp/root');
    const result = await executor.edit(testAgent, 'docs/readme.md', 'make it shorter', 'some selected text');

    expect(mockSpawn).toHaveBeenCalledWith(
      'test-agent',
      ['--print', 'Edit docs/readme.md: some selected text => make it shorter'],
      expect.objectContaining({ cwd: '/tmp/root', shell: false }),
    );
    expect(result).toEqual({ success: true });
  });

  it('edit without selection replaces {selection} with empty string', async () => {
    mockSpawn.mockReturnValue(createMockProcess(''));

    const executor = new AgentExecutor('/tmp/root');
    await executor.edit(testAgent, 'docs/readme.md', 'rewrite completely');

    expect(mockSpawn).toHaveBeenCalledWith(
      'test-agent',
      ['--print', 'Edit docs/readme.md:  => rewrite completely'],
      expect.objectContaining({ cwd: '/tmp/root' }),
    );
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/__tests__/agent-executor.test.ts`
Expected: FAIL — module `../agent-executor` not found

- [ ] **Step 3: Implement AgentExecutor**

```ts
// src/server/agent-executor.ts
import { spawn } from 'node:child_process';
import path from 'node:path';

import type { AgentConfig } from './agent-registry';

export interface SummarizeResult {
  summary?: string;
  error?: string;
}

export interface EditResult {
  success?: boolean;
  error?: string;
}

function interpolateArgs(args: string[], vars: Record<string, string>): string[] {
  return args.map((arg) => {
    let result = arg;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replaceAll(`{${key}}`, value);
    }
    return result;
  });
}

function validateFilePath(filePath: string, rootDir: string): boolean {
  const absolute = path.resolve(rootDir, filePath);
  const resolvedRoot = path.resolve(rootDir);
  return absolute.startsWith(resolvedRoot + path.sep) || absolute === resolvedRoot;
}

export class AgentExecutor {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async summarize(agent: AgentConfig, filePath: string): Promise<SummarizeResult> {
    if (!validateFilePath(filePath, this.rootDir)) {
      return { error: `File path is outside the served directory` };
    }

    const args = interpolateArgs(agent.summarizeArgs, { file: filePath });
    const result = await this.spawnAgent(agent.binary, args, agent.timeout ?? 120000);

    if (result.error) return { error: result.error };
    return { summary: result.stdout };
  }

  async edit(
    agent: AgentConfig,
    filePath: string,
    prompt: string,
    selection?: string,
  ): Promise<EditResult> {
    if (!validateFilePath(filePath, this.rootDir)) {
      return { error: `File path is outside the served directory` };
    }

    const args = interpolateArgs(agent.editArgs, {
      file: filePath,
      prompt,
      selection: selection ?? '',
    });
    const result = await this.spawnAgent(agent.binary, args, agent.timeout ?? 120000);

    if (result.error) return { error: result.error };
    return { success: true };
  }

  buildResumeCommand(agent: AgentConfig, sessionId: string): string {
    const args = interpolateArgs(agent.resumeArgs, { sessionId });
    return [agent.binary, ...args].join(' ');
  }

  private spawnAgent(
    binary: string,
    args: string[],
    timeout: number,
  ): Promise<{ stdout: string; error?: string }> {
    return new Promise((resolve) => {
      const proc = spawn(binary, args, {
        cwd: this.rootDir,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      const timer = setTimeout(() => {
        proc.kill();
        resolve({ stdout: '', error: `Agent timed out after ${timeout}ms` });
      }, timeout);

      proc.on('close', (code: number | null) => {
        clearTimeout(timer);
        if (code !== 0) {
          resolve({ stdout: '', error: stderr || `Agent exited with code ${code}` });
        } else {
          resolve({ stdout: stdout.trim() });
        }
      });
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/__tests__/agent-executor.test.ts`
Expected: PASS — all 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/server/agent-executor.ts src/server/__tests__/agent-executor.test.ts
git commit -m "feat: add agent executor with spawn, timeout, and path validation"
```

---

## Chunk 2: Session Parsers & Indexer

### Task 4: Session Parser Types

**Files:**
- Create: `src/server/session-parsers/types.ts`

- [ ] **Step 1: Create shared types**

```ts
// src/server/session-parsers/types.ts
export interface SessionRef {
  provider: string;
  sessionId: string;
  sessionFile: string;
  timestamp: string;
  summary?: string;
  action: 'created' | 'modified' | 'read';
  resumeCommand: string;
}

/** Result from parsing a session file — maps relative file paths to their session refs */
export interface ParseResult {
  fileRefs: Map<string, SessionRef[]>;
}

export interface SessionParser {
  parseSessionFile(filePath: string, mdRoot: string): ParseResult;
}

export interface SessionIndex {
  version: number;
  lastUpdated: string;
  providerState: Record<string, ProviderScanState>;
  files: Record<string, FileSessionEntry>;
}

export interface ProviderScanState {
  sessionFiles: Record<string, {
    mtime: number;
    size: number;
  }>;
}

export interface FileSessionEntry {
  sessions: SessionRef[];
}

/** Shared utility — checks if a file has a markdown extension */
export function isMdFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'markdown';
}

/** Shared utility — checks if a file path is within the given root */
export function isWithinRoot(filePath: string, mdRoot: string): boolean {
  const path = require('node:path');
  const resolved = path.resolve(filePath);
  const resolvedRoot = path.resolve(mdRoot);
  return resolved.startsWith(resolvedRoot + path.sep) || resolved === resolvedRoot;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/session-parsers/types.ts
git commit -m "feat: add session parser shared types"
```

---

### Task 5: Claude Code Session Parser

**Files:**
- Create: `src/server/session-parsers/claude.ts`
- Test: `src/server/session-parsers/__tests__/claude.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/session-parsers/__tests__/claude.test.ts
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
        type: 'user',
        uuid: '1',
        sessionId: 'session-abc',
        timestamp: '2026-03-15T10:00:00Z',
        message: { role: 'user', content: 'Update the readme' },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: '2',
        parentUuid: '1',
        sessionId: 'session-abc',
        timestamp: '2026-03-15T10:01:00Z',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              input: { file_path: '/Users/test/project/README.md', content: '# Updated' },
            },
          ],
        },
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
        type: 'user',
        uuid: '1',
        sessionId: 'session-def',
        timestamp: '2026-03-15T10:00:00Z',
        message: { role: 'user', content: 'Fix the docs' },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: '2',
        sessionId: 'session-def',
        timestamp: '2026-03-15T10:01:00Z',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Edit',
              input: { file_path: '/Users/test/project/docs/guide.md', old_string: 'old', new_string: 'new' },
            },
          ],
        },
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
        type: 'user',
        uuid: '1',
        sessionId: 'session-ghi',
        timestamp: '2026-03-15T10:00:00Z',
        message: { role: 'user', content: 'Read the changelog' },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: '2',
        sessionId: 'session-ghi',
        timestamp: '2026-03-15T10:01:00Z',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              input: { file_path: '/Users/test/project/CHANGELOG.md' },
            },
          ],
        },
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
        type: 'assistant',
        uuid: '1',
        sessionId: 'session-xyz',
        timestamp: '2026-03-15T10:00:00Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', name: 'Write', input: { file_path: '/Users/test/project/src/index.ts', content: 'code' } },
          ],
        },
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

    expect(result.fileRefs.size).toBe(0); // no crash
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/session-parsers/__tests__/claude.test.ts`
Expected: FAIL — module `../claude` not found

- [ ] **Step 3: Implement ClaudeSessionParser**

```ts
// src/server/session-parsers/claude.ts
import fs from 'node:fs';
import path from 'node:path';
import type { SessionParser, SessionRef, ParseResult } from './types';
import { isMdFile, isWithinRoot } from './types';

const FILE_TOOLS: Record<string, 'modified' | 'read'> = {
  Write: 'modified',
  Edit: 'modified',
  Read: 'read',
};

export class ClaudeSessionParser implements SessionParser {
  parseSessionFile(sessionFilePath: string, mdRoot: string): ParseResult {
    const result: ParseResult = { fileRefs: new Map() };
    let content: string;
    try {
      content = fs.readFileSync(sessionFilePath, 'utf-8');
    } catch {
      return result;
    }

    const lines = content.split('\n').filter((l) => l.trim());
    let sessionId = '';
    let summary = '';
    const fileActions = new Map<string, { action: 'created' | 'modified' | 'read'; timestamp: string }>();

    for (const line of lines) {
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      if (!sessionId && entry.sessionId) {
        sessionId = entry.sessionId;
      }

      if (!summary && entry.type === 'user' && entry.message?.content) {
        const text = typeof entry.message.content === 'string'
          ? entry.message.content
          : entry.message.content.find?.((c: any) => c.type === 'text')?.text;
        if (text) {
          summary = text.slice(0, 200);
        }
      }

      if (entry.message?.content && Array.isArray(entry.message.content)) {
        for (const item of entry.message.content) {
          if (item.type === 'tool_use' && FILE_TOOLS[item.name] && item.input?.file_path) {
            const filePath = item.input.file_path;
            if (isMdFile(filePath) && isWithinRoot(filePath, mdRoot)) {
              const relPath = path.relative(mdRoot, filePath);
              const existing = fileActions.get(relPath);
              const action = FILE_TOOLS[item.name];
              if (!existing || (action === 'modified' && existing.action === 'read')) {
                fileActions.set(relPath, {
                  action,
                  timestamp: entry.timestamp || new Date().toISOString(),
                });
              }
            }
          }
        }
      }
    }

    for (const [relPath, info] of fileActions) {
      const ref: SessionRef = {
        provider: 'claude',
        sessionId,
        sessionFile: sessionFilePath,
        timestamp: info.timestamp,
        summary: summary || undefined,
        action: info.action,
        resumeCommand: `claude --resume ${sessionId}`,
      };
      if (!result.fileRefs.has(relPath)) result.fileRefs.set(relPath, []);
      result.fileRefs.get(relPath)!.push(ref);
    }

    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/session-parsers/__tests__/claude.test.ts`
Expected: PASS — all 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/server/session-parsers/claude.ts src/server/session-parsers/__tests__/claude.test.ts
git commit -m "feat: add Claude Code session parser"
```

---

### Task 6: Codex Session Parser

**Files:**
- Create: `src/server/session-parsers/codex.ts`
- Test: `src/server/session-parsers/__tests__/codex.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/session-parsers/__tests__/codex.test.ts
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
        type: 'user',
        role: 'user',
        content: 'Update the docs',
        cwd: '/Users/test/project',
        timestamp: '2026-03-15T10:00:00Z',
      }),
      JSON.stringify({
        type: 'assistant',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'write_file',
            input: { path: 'README.md', content: '# Updated' },
          },
        ],
        cwd: '/Users/test/project',
        timestamp: '2026-03-15T10:01:00Z',
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/session-parsers/__tests__/codex.test.ts`
Expected: FAIL — module `../codex` not found

- [ ] **Step 3: Implement CodexSessionParser**

```ts
// src/server/session-parsers/codex.ts
import fs from 'node:fs';
import path from 'node:path';
import type { SessionParser, SessionRef, ParseResult } from './types';
import { isMdFile, isWithinRoot } from './types';

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'patch']);
const READ_TOOLS = new Set(['read_file']);

export class CodexSessionParser implements SessionParser {
  parseSessionFile(sessionFilePath: string, mdRoot: string): ParseResult {
    const result: ParseResult = { fileRefs: new Map() };
    let content: string;
    try {
      content = fs.readFileSync(sessionFilePath, 'utf-8');
    } catch {
      return result;
    }

    const lines = content.split('\n').filter((l) => l.trim());
    let summary = '';
    let cwd = '';
    const fileActions = new Map<string, { action: 'modified' | 'read'; timestamp: string }>();

    const basename = path.basename(sessionFilePath, '.jsonl');
    const sessionId = basename.replace(/^rollout-/, '');

    for (const line of lines) {
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      if (!cwd && entry.cwd) cwd = entry.cwd;

      if (!summary && entry.role === 'user' && typeof entry.content === 'string') {
        summary = entry.content.slice(0, 200);
      }

      if (entry.content && Array.isArray(entry.content)) {
        for (const item of entry.content) {
          if (item.type === 'tool_use' && item.input?.path) {
            const isWrite = WRITE_TOOLS.has(item.name);
            const isRead = READ_TOOLS.has(item.name);
            if (!isWrite && !isRead) continue;

            const resolvedPath = path.isAbsolute(item.input.path)
              ? item.input.path
              : path.resolve(cwd || mdRoot, item.input.path);

            if (!isMdFile(resolvedPath) || !isWithinRoot(resolvedPath, mdRoot)) continue;

            const relPath = path.relative(mdRoot, resolvedPath);
            const action = isWrite ? 'modified' : 'read';
            const existing = fileActions.get(relPath);
            if (!existing || (action === 'modified' && existing.action === 'read')) {
              fileActions.set(relPath, { action, timestamp: entry.timestamp || '' });
            }
          }
        }
      }
    }

    for (const [relPath, info] of fileActions) {
      const ref: SessionRef = {
        provider: 'codex',
        sessionId,
        sessionFile: sessionFilePath,
        timestamp: info.timestamp,
        summary: summary || undefined,
        action: info.action,
        resumeCommand: `codex --resume ${sessionId}`,
      };
      if (!result.fileRefs.has(relPath)) result.fileRefs.set(relPath, []);
      result.fileRefs.get(relPath)!.push(ref);
    }

    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/session-parsers/__tests__/codex.test.ts`
Expected: PASS — all 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/server/session-parsers/codex.ts src/server/session-parsers/__tests__/codex.test.ts
git commit -m "feat: add Codex session parser"
```

---

### Task 7: Aider Session Parser

**Files:**
- Create: `src/server/session-parsers/aider.ts`
- Test: `src/server/session-parsers/__tests__/aider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/session-parsers/__tests__/aider.test.ts
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

    // Create the target md file so it can be matched
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/session-parsers/__tests__/aider.test.ts`
Expected: FAIL — module `../aider` not found

- [ ] **Step 3: Implement AiderSessionParser**

```ts
// src/server/session-parsers/aider.ts
import fs from 'node:fs';
import path from 'node:path';
import type { SessionParser, SessionRef, ParseResult } from './types';
import { isMdFile, isWithinRoot } from './types';

export class AiderSessionParser implements SessionParser {
  parseSessionFile(historyFilePath: string, mdRoot: string): ParseResult {
    const result: ParseResult = { fileRefs: new Map() };
    let content: string;
    try {
      content = fs.readFileSync(historyFilePath, 'utf-8');
    } catch {
      return result;
    }

    if (!content.trim()) return result;

    const sessionBlocks = content.split(/^####\s+/m).filter((b) => b.trim());
    const fileActions = new Map<string, { action: 'modified' | 'read'; timestamp: string; summary: string }>();

    for (const block of sessionBlocks) {
      const timestampMatch = block.match(/^(\d{4}-\d{2}-\d{2}T[\d:]+Z?)/);
      const timestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString();

      const addMatches = block.matchAll(/>\s*\/add\s+(.+)/g);
      for (const match of addMatches) {
        const filePath = match[1].trim();
        if (!isMdFile(filePath)) continue;

        const absPath = path.resolve(mdRoot, filePath);
        if (!isWithinRoot(absPath, mdRoot)) continue;

        const relPath = path.relative(mdRoot, absPath);
        const userMsgMatch = block.match(/>\s*(?!\/)(.*)/);
        const summary = userMsgMatch ? userMsgMatch[1].trim().slice(0, 200) : '';

        fileActions.set(relPath, { action: 'modified', timestamp, summary });
      }

      const fenceMatches = block.matchAll(/```[\w]*\s+([\w/./-]+\.(?:md|markdown))/gi);
      for (const match of fenceMatches) {
        const filePath = match[1];
        const absPath = path.resolve(mdRoot, filePath);
        if (!isWithinRoot(absPath, mdRoot)) continue;

        const relPath = path.relative(mdRoot, absPath);
        if (!fileActions.has(relPath)) {
          fileActions.set(relPath, { action: 'modified', timestamp, summary: '' });
        }
      }
    }

    const sessionId = path.basename(historyFilePath, '.md');

    for (const [relPath, info] of fileActions) {
      const ref: SessionRef = {
        provider: 'aider',
        sessionId,
        sessionFile: historyFilePath,
        timestamp: info.timestamp,
        summary: info.summary || undefined,
        action: info.action,
        resumeCommand: 'aider',
      };
      if (!result.fileRefs.has(relPath)) result.fileRefs.set(relPath, []);
      result.fileRefs.get(relPath)!.push(ref);
    }

    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/session-parsers/__tests__/aider.test.ts`
Expected: PASS — all 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/server/session-parsers/aider.ts src/server/session-parsers/__tests__/aider.test.ts
git commit -m "feat: add Aider session parser"
```

---

### Task 8: OpenCode Session Parser

**Files:**
- Create: `src/server/session-parsers/opencode.ts`
- Test: `src/server/session-parsers/__tests__/opencode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/session-parsers/__tests__/opencode.test.ts
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
        {
          role: 'user',
          content: 'Update the changelog',
          timestamp: '2026-03-15T10:00:00Z',
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'write_file',
              input: { path: '/Users/test/project/CHANGELOG.md', content: '# Changelog' },
            },
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/session-parsers/__tests__/opencode.test.ts`
Expected: FAIL — module `../opencode` not found

- [ ] **Step 3: Implement OpenCodeSessionParser**

```ts
// src/server/session-parsers/opencode.ts
import fs from 'node:fs';
import path from 'node:path';
import type { SessionParser, SessionRef, ParseResult } from './types';
import { isMdFile, isWithinRoot } from './types';

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'patch', 'Write', 'Edit']);
const READ_TOOLS = new Set(['read_file', 'Read']);

export class OpenCodeSessionParser implements SessionParser {
  parseSessionFile(sessionFilePath: string, mdRoot: string): ParseResult {
    const result: ParseResult = { fileRefs: new Map() };
    let data: any;
    try {
      const raw = fs.readFileSync(sessionFilePath, 'utf-8');
      data = JSON.parse(raw);
    } catch {
      return result;
    }

    const sessionId = data.id || path.basename(sessionFilePath, '.json');
    const messages = data.messages || [];
    let summary = '';
    const fileActions = new Map<string, { action: 'modified' | 'read'; timestamp: string }>();

    for (const msg of messages) {
      if (!summary && msg.role === 'user' && typeof msg.content === 'string') {
        summary = msg.content.slice(0, 200);
      }

      if (msg.content && Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item.type !== 'tool_use') continue;
          const toolPath = item.input?.path || item.input?.file_path;
          if (!toolPath) continue;

          const isWrite = WRITE_TOOLS.has(item.name);
          const isRead = READ_TOOLS.has(item.name);
          if (!isWrite && !isRead) continue;

          const absPath = path.isAbsolute(toolPath) ? toolPath : path.resolve(mdRoot, toolPath);
          if (!isMdFile(absPath) || !isWithinRoot(absPath, mdRoot)) continue;

          const relPath = path.relative(mdRoot, absPath);
          const action = isWrite ? 'modified' : 'read';
          const existing = fileActions.get(relPath);
          if (!existing || (action === 'modified' && existing.action === 'read')) {
            fileActions.set(relPath, { action, timestamp: msg.timestamp || '' });
          }
        }
      }
    }

    for (const [relPath, info] of fileActions) {
      const ref: SessionRef = {
        provider: 'opencode',
        sessionId,
        sessionFile: sessionFilePath,
        timestamp: info.timestamp,
        summary: summary || undefined,
        action: info.action,
        resumeCommand: `opencode --resume ${sessionId}`,
      };
      if (!result.fileRefs.has(relPath)) result.fileRefs.set(relPath, []);
      result.fileRefs.get(relPath)!.push(ref);
    }

    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/session-parsers/__tests__/opencode.test.ts`
Expected: PASS — all 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/server/session-parsers/opencode.ts src/server/session-parsers/__tests__/opencode.test.ts
git commit -m "feat: add OpenCode session parser"
```

---

### Task 9: Session Indexer

**Files:**
- Create: `src/server/session-indexer.ts`
- Create: `src/server/session-indexer-singleton.ts`
- Test: `src/server/__tests__/session-indexer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/__tests__/session-indexer.test.ts
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
    // Create a fake Claude project directory
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

    // Build and persist
    const indexer1 = new SessionIndexer(mdRoot, cacheDir);
    await indexer1.buildIndex([{ provider: 'claude', paths: [claudeDir] }]);

    // Load from cache
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/__tests__/session-indexer.test.ts`
Expected: FAIL — module `../session-indexer` not found

- [ ] **Step 3: Implement SessionIndexer**

```ts
// src/server/session-indexer.ts
import fs from 'node:fs';
import path from 'node:path';
import type { SessionIndex, SessionRef, ProviderScanState, SessionParser } from './session-parsers/types';
import { ClaudeSessionParser } from './session-parsers/claude';
import { CodexSessionParser } from './session-parsers/codex';
import { AiderSessionParser } from './session-parsers/aider';
import { OpenCodeSessionParser } from './session-parsers/opencode';

interface ProviderInput {
  provider: string;
  paths: string[];
}

const PARSERS: Record<string, SessionParser> = {
  claude: new ClaudeSessionParser(),
  codex: new CodexSessionParser(),
  aider: new AiderSessionParser(),
  opencode: new OpenCodeSessionParser(),
};

const INDEX_VERSION = 1;

export class SessionIndexer {
  private mdRoot: string;
  private cacheDir: string;
  private index: SessionIndex;
  private rescanTimer: NodeJS.Timeout | null = null;

  constructor(mdRoot: string, cacheDir: string) {
    this.mdRoot = mdRoot;
    this.cacheDir = cacheDir;
    this.index = {
      version: INDEX_VERSION,
      lastUpdated: '',
      providerState: {},
      files: {},
    };
  }

  async buildIndex(providers: ProviderInput[]): Promise<void> {
    const cachePath = path.join(this.cacheDir, 'session-index.json');

    // Load existing cache
    try {
      const raw = fs.readFileSync(cachePath, 'utf-8');
      const cached: SessionIndex = JSON.parse(raw);
      if (cached && cached.version === INDEX_VERSION) {
        this.index = cached;
      }
    } catch {
      // No cache or invalid
    }

    // Scan each provider
    for (const { provider, paths } of providers) {
      const parser = PARSERS[provider];
      if (!parser) continue;

      const cachedState = this.index.providerState[provider] || { sessionFiles: {} };
      const newState: ProviderScanState = { sessionFiles: {} };

      for (const dir of paths) {
        if (!fs.existsSync(dir)) continue;

        const sessionFiles = this.findSessionFiles(dir, provider);
        for (const sessionFile of sessionFiles) {
          let stat: fs.Stats;
          try {
            stat = fs.statSync(sessionFile);
          } catch {
            continue;
          }

          const cachedEntry = cachedState.sessionFiles[sessionFile];
          const isUnchanged = cachedEntry &&
            cachedEntry.mtime === stat.mtimeMs &&
            cachedEntry.size === stat.size;

          newState.sessionFiles[sessionFile] = {
            mtime: stat.mtimeMs,
            size: stat.size,
          };

          if (isUnchanged) continue;

          // Remove old refs from this session file
          for (const [filePath, entry] of Object.entries(this.index.files)) {
            entry.sessions = entry.sessions.filter((s) => s.sessionFile !== sessionFile);
            if (entry.sessions.length === 0) delete this.index.files[filePath];
          }

          // Parse and add new refs keyed by file path
          const parseResult = parser.parseSessionFile(sessionFile, this.mdRoot);
          for (const [relPath, refs] of parseResult.fileRefs) {
            if (!this.index.files[relPath]) {
              this.index.files[relPath] = { sessions: [] };
            }
            this.index.files[relPath].sessions.push(...refs);
          }
        }
      }

      this.index.providerState[provider] = newState;
    }

    this.index.lastUpdated = new Date().toISOString();

    // Persist
    fs.mkdirSync(this.cacheDir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(this.index, null, 2));
  }

  private findSessionFiles(dir: string, provider: string): string[] {
    const files: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...this.findSessionFiles(fullPath, provider));
        } else if (this.isSessionFile(entry.name, provider)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory not accessible
    }
    return files;
  }

  private isSessionFile(name: string, provider: string): boolean {
    switch (provider) {
      case 'claude': return name.endsWith('.jsonl');
      case 'codex': return name.startsWith('rollout-') && name.endsWith('.jsonl');
      case 'aider': return name.endsWith('.md');
      case 'opencode': return name.endsWith('.json');
      default: return false;
    }
  }

  getSessionsForFile(relPath: string): SessionRef[] {
    const entry = this.index.files[relPath];
    if (!entry) return [];
    return [...entry.sessions].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /** Debounced re-scan for a specific provider (called after agent invocations) */
  scheduleRescan(provider: string, paths: string[]): void {
    if (this.rescanTimer) clearTimeout(this.rescanTimer);
    this.rescanTimer = setTimeout(() => {
      this.buildIndex([{ provider, paths }]);
      this.rescanTimer = null;
    }, 5000);
  }
}
```

- [ ] **Step 5: Run all parser and indexer tests**

Run: `npx vitest run src/server/__tests__/session-indexer.test.ts src/server/session-parsers/__tests__/`
Expected: PASS — all tests

- [ ] **Step 6: Create singleton**

```ts
// src/server/session-indexer-singleton.ts
import { SessionIndexer } from './session-indexer';

let instance: SessionIndexer | null = null;

export function getSessionIndexer(mdRoot: string, cacheDir: string): SessionIndexer {
  if (!instance) {
    instance = new SessionIndexer(mdRoot, cacheDir);
  }
  return instance;
}

export function resetSessionIndexer(): void {
  instance = null;
}
```

- [ ] **Step 7: Commit**

```bash
git add src/server/session-indexer.ts src/server/session-indexer-singleton.ts src/server/__tests__/session-indexer.test.ts src/server/session-parsers/
git commit -m "feat: add session indexer with cache and provider parsers"
```

---

## Chunk 3: API Routes

### Task 10: Agent Registry Singleton & GET /api/agents

**Files:**
- Create: `src/server/agent-registry-singleton.ts`
- Create: `src/app/api/agents/route.ts`
- Test: `src/app/api/__tests__/agents.test.ts`

- [ ] **Step 0: Create agent registry singleton**

```ts
// src/server/agent-registry-singleton.ts
import { AgentRegistry } from './agent-registry';

let instance: AgentRegistry | null = null;
let detected = false;

export async function getAgentRegistry(customConfigPath?: string): Promise<AgentRegistry> {
  if (!instance) {
    instance = new AgentRegistry(customConfigPath);
  }
  if (!detected) {
    await instance.detectAvailable();
    detected = true;
  }
  return instance;
}

export function resetAgentRegistry(): void {
  instance = null;
  detected = false;
}
```

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/__tests__/agents.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/config', () => ({
  getConfig: vi.fn(() => ({
    rootDir: '/tmp/test',
    port: 3030,
    host: 'localhost',
    open: false,
    watch: true,
    filters: { include: [], exclude: [], filter: null },
  })),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (typeof cmd === 'string' && cmd.includes('claude')) return Buffer.from('/usr/bin/claude');
    throw new Error('not found');
  }),
}));

import { GET } from '../agents/route';

describe('GET /api/agents', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns list of detected agents', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(data.agents)).toBe(true);
    // At least claude should be detected based on mock
    expect(data.agents.some((a: any) => a.id === 'claude')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/__tests__/agents.test.ts`
Expected: FAIL — module `../agents/route` not found

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/agents/route.ts
import { NextResponse } from 'next/server';
import { getAgentRegistry } from '@/server/agent-registry-singleton';
import { getConfig } from '@/server/config';
import path from 'node:path';

export async function GET() {
  const config = getConfig();
  const customConfigPath = path.join(config.rootDir, '.md_server', 'agents.json');
  const registry = await getAgentRegistry(customConfigPath);
  const agents = registry.getAvailableAgents().map(({ id, name, binary }) => ({ id, name, binary }));
  return NextResponse.json({ agents });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/__tests__/agents.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agents/route.ts src/app/api/__tests__/agents.test.ts
git commit -m "feat: add GET /api/agents endpoint"
```

---

### Task 11: POST /api/agent/summarize

**Files:**
- Create: `src/app/api/agent/summarize/route.ts`
- Test: `src/app/api/__tests__/agent-summarize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/__tests__/agent-summarize.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/server/config', () => ({
  getConfig: vi.fn(() => ({
    rootDir: '/tmp/test',
    port: 3030,
    host: 'localhost',
    open: false,
    watch: true,
    filters: { include: [], exclude: [], filter: null },
  })),
}));

vi.mock('@/server/agent-executor', () => ({
  AgentExecutor: vi.fn().mockImplementation(() => ({
    summarize: vi.fn().mockResolvedValue({ summary: 'A test summary' }),
  })),
}));

vi.mock('@/server/agent-registry', () => ({
  AgentRegistry: vi.fn().mockImplementation(() => ({
    detectAvailable: vi.fn(),
    getAgent: vi.fn((id: string) => id === 'claude' ? {
      id: 'claude', name: 'Claude Code', binary: 'claude',
      detectArgs: ['--version'], summarizeArgs: ['--print', '{file}'],
      editArgs: [], resumeArgs: [], sessionPaths: [], timeout: 120000,
    } : undefined),
    isAvailable: vi.fn((id: string) => id === 'claude'),
  })),
}));

import { POST } from '../agent/summarize/route';

describe('POST /api/agent/summarize', () => {
  it('returns summary from agent', async () => {
    const request = new NextRequest('http://localhost:3030/api/agent/summarize', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'claude', filePath: 'README.md' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.summary).toBe('A test summary');
  });

  it('returns 400 for missing params', async () => {
    const request = new NextRequest('http://localhost:3030/api/agent/summarize', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 404 for unknown agent', async () => {
    const request = new NextRequest('http://localhost:3030/api/agent/summarize', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'unknown', filePath: 'README.md' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/__tests__/agent-summarize.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/agent/summarize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/server/config';
import { getAgentRegistry } from '@/server/agent-registry-singleton';
import { AgentExecutor } from '@/server/agent-executor';
import path from 'node:path';

export async function POST(request: NextRequest) {
  const config = getConfig();

  // Localhost-only guard for agent endpoints
  if (config.host !== 'localhost' && config.host !== '127.0.0.1') {
    if (process.env.MD_SERVE_ALLOW_REMOTE_AGENTS !== 'true') {
      return NextResponse.json({ error: 'Agent endpoints are localhost-only' }, { status: 403 });
    }
  }

  let body: { agentId?: string; filePath?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.agentId || !body.filePath) {
    return NextResponse.json({ error: 'Missing agentId or filePath' }, { status: 400 });
  }

  // Path traversal validation
  const absPath = path.resolve(config.rootDir, body.filePath);
  if (!absPath.startsWith(path.resolve(config.rootDir) + path.sep)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const customConfigPath = path.join(config.rootDir, '.md_server', 'agents.json');
  const registry = await getAgentRegistry(customConfigPath);
  const agent = registry.getAgent(body.agentId);
  if (!agent || !registry.isAvailable(body.agentId)) {
    return NextResponse.json({ error: 'Agent not found or not available' }, { status: 404 });
  }

  const executor = new AgentExecutor(config.rootDir);
  const result = await executor.summarize(agent, body.filePath);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ summary: result.summary });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/__tests__/agent-summarize.test.ts`
Expected: PASS — all 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent/summarize/route.ts src/app/api/__tests__/agent-summarize.test.ts
git commit -m "feat: add POST /api/agent/summarize endpoint"
```

---

### Task 12: POST /api/agent/edit

**Files:**
- Create: `src/app/api/agent/edit/route.ts`
- Test: `src/app/api/__tests__/agent-edit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/__tests__/agent-edit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/server/config', () => ({
  getConfig: vi.fn(() => ({
    rootDir: '/tmp/test',
    port: 3030,
    host: 'localhost',
    open: false,
    watch: true,
    filters: { include: [], exclude: [], filter: null },
  })),
}));

vi.mock('@/server/agent-executor', () => ({
  AgentExecutor: vi.fn().mockImplementation(() => ({
    edit: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

vi.mock('@/server/agent-registry', () => ({
  AgentRegistry: vi.fn().mockImplementation(() => ({
    detectAvailable: vi.fn(),
    getAgent: vi.fn((id: string) => id === 'claude' ? {
      id: 'claude', name: 'Claude Code', binary: 'claude',
      detectArgs: ['--version'], summarizeArgs: [], editArgs: ['--print', '{prompt}'],
      resumeArgs: [], sessionPaths: [], timeout: 120000,
    } : undefined),
    isAvailable: vi.fn((id: string) => id === 'claude'),
  })),
}));

import { POST } from '../agent/edit/route';

describe('POST /api/agent/edit', () => {
  it('edits file with full-document prompt', async () => {
    const request = new NextRequest('http://localhost:3030/api/agent/edit', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'claude', filePath: 'README.md', prompt: 'rewrite it' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('edits file with selection', async () => {
    const request = new NextRequest('http://localhost:3030/api/agent/edit', {
      method: 'POST',
      body: JSON.stringify({
        agentId: 'claude', filePath: 'README.md',
        prompt: 'make shorter', selection: 'some text to edit',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('returns 400 for missing prompt', async () => {
    const request = new NextRequest('http://localhost:3030/api/agent/edit', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'claude', filePath: 'README.md' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/__tests__/agent-edit.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/agent/edit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/server/config';
import { getAgentRegistry } from '@/server/agent-registry-singleton';
import { AgentExecutor } from '@/server/agent-executor';
import path from 'node:path';

export async function POST(request: NextRequest) {
  const config = getConfig();

  if (config.host !== 'localhost' && config.host !== '127.0.0.1') {
    if (process.env.MD_SERVE_ALLOW_REMOTE_AGENTS !== 'true') {
      return NextResponse.json({ error: 'Agent endpoints are localhost-only' }, { status: 403 });
    }
  }

  let body: { agentId?: string; filePath?: string; prompt?: string; selection?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.agentId || !body.filePath || !body.prompt) {
    return NextResponse.json({ error: 'Missing agentId, filePath, or prompt' }, { status: 400 });
  }

  // Path traversal validation
  const absPath = path.resolve(config.rootDir, body.filePath);
  if (!absPath.startsWith(path.resolve(config.rootDir) + path.sep)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const customConfigPath = path.join(config.rootDir, '.md_server', 'agents.json');
  const registry = await getAgentRegistry(customConfigPath);
  const agent = registry.getAgent(body.agentId);
  if (!agent || !registry.isAvailable(body.agentId)) {
    return NextResponse.json({ error: 'Agent not found or not available' }, { status: 404 });
  }

  const executor = new AgentExecutor(config.rootDir);
  const result = await executor.edit(agent, body.filePath, body.prompt, body.selection);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/__tests__/agent-edit.test.ts`
Expected: PASS — all 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent/edit/route.ts src/app/api/__tests__/agent-edit.test.ts
git commit -m "feat: add POST /api/agent/edit endpoint"
```

---

### Task 13: GET /api/sessions

**Files:**
- Create: `src/app/api/sessions/route.ts`
- Test: `src/app/api/__tests__/sessions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/__tests__/sessions.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/server/config', () => ({
  getConfig: vi.fn(() => ({
    rootDir: '/tmp/test',
    port: 3030,
    host: 'localhost',
    open: false,
    watch: true,
    filters: { include: [], exclude: [], filter: null },
  })),
}));

vi.mock('@/server/session-indexer-singleton', () => ({
  getSessionIndexer: vi.fn(() => ({
    getSessionsForFile: vi.fn((filePath: string) => {
      if (filePath === 'README.md') {
        return [
          {
            provider: 'claude', sessionId: 'sess-1', sessionFile: '/tmp/session.jsonl',
            timestamp: '2026-03-15T10:00:00Z', summary: 'Updated readme',
            action: 'modified', resumeCommand: 'claude --resume sess-1',
          },
        ];
      }
      return [];
    }),
  })),
}));

import { GET } from '../sessions/route';

describe('GET /api/sessions', () => {
  it('returns sessions for a file', async () => {
    const request = new NextRequest('http://localhost:3030/api/sessions?file=README.md');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions.length).toBe(1);
    expect(data.sessions[0].provider).toBe('claude');
    expect(data.sessions[0].resumeCommand).toBe('claude --resume sess-1');
  });

  it('returns 400 when file param is missing', async () => {
    const request = new NextRequest('http://localhost:3030/api/sessions');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('returns empty array for file with no sessions', async () => {
    const request = new NextRequest('http://localhost:3030/api/sessions?file=unknown.md');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/__tests__/sessions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/server/config';
import { getSessionIndexer } from '@/server/session-indexer-singleton';
import path from 'node:path';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const filePath = searchParams.get('file');

  if (!filePath) {
    return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 });
  }

  const config = getConfig();
  const cacheDir = path.join(config.rootDir, '.md_server');
  const indexer = getSessionIndexer(config.rootDir, cacheDir);
  const sessions = indexer.getSessionsForFile(filePath);

  return NextResponse.json({ sessions });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/__tests__/sessions.test.ts`
Expected: PASS — all 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sessions/route.ts src/app/api/__tests__/sessions.test.ts
git commit -m "feat: add GET /api/sessions endpoint"
```

---

## Chunk 4: Frontend Components & Integration

### Task 14: Agent Context — State Management

**Files:**
- Modify: `src/app/layout-context.tsx`
- Create: `src/hooks/use-agents.ts`
- Create: `src/hooks/use-sessions.ts`

- [ ] **Step 1: Add agent state to LayoutContext**

Add to `src/app/layout-context.tsx`:

```ts
// Add to LayoutContextValue interface:
availableAgents: { id: string; name: string; binary: string }[];
setAvailableAgents: Dispatch<SetStateAction<{ id: string; name: string; binary: string }[]>>;
selectedAgent: string;
setSelectedAgent: Dispatch<SetStateAction<string>>;
isAgentWorking: boolean;
setIsAgentWorking: Dispatch<SetStateAction<boolean>>;
```

Add corresponding `useState` hooks in `LayoutProvider` and include in the context value.

- [ ] **Step 2: Create use-agents hook**

```ts
// src/hooks/use-agents.ts
'use client';

import { useEffect } from 'react';
import { useLayout } from '@/app/layout-context';

export function useAgents() {
  const { availableAgents, setAvailableAgents, selectedAgent, setSelectedAgent } = useLayout();

  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch('/api/agents');
        if (!res.ok) return;
        const data = await res.json();
        setAvailableAgents(data.agents);
        if (data.agents.length > 0 && !selectedAgent) {
          setSelectedAgent(data.agents[0].id);
        }
      } catch {
        // Agent detection failed — agents feature not available
      }
    }
    fetchAgents();
  }, [setAvailableAgents, selectedAgent, setSelectedAgent]);

  return { availableAgents, selectedAgent, setSelectedAgent };
}
```

- [ ] **Step 3: Create use-sessions hook**

```ts
// src/hooks/use-sessions.ts
'use client';

import { useState, useEffect } from 'react';

interface SessionRef {
  provider: string;
  sessionId: string;
  sessionFile: string;
  timestamp: string;
  summary?: string;
  action: 'created' | 'modified' | 'read';
  resumeCommand: string;
}

export function useSessions(filePath: string | null) {
  const [sessions, setSessions] = useState<SessionRef[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!filePath) {
      setSessions([]);
      return;
    }

    async function fetchSessions() {
      setLoading(true);
      try {
        const res = await fetch(`/api/sessions?file=${encodeURIComponent(filePath!)}`);
        if (!res.ok) return;
        const data = await res.json();
        setSessions(data.sessions);
      } catch {
        setSessions([]);
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, [filePath]);

  return { sessions, loading };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/layout-context.tsx src/hooks/use-agents.ts src/hooks/use-sessions.ts
git commit -m "feat: add agent/session state management and hooks"
```

---

### Task 15: Agent Badges Component

**Files:**
- Create: `src/components/agent-badges.tsx`
- Modify: `src/components/layout-shell.tsx`

- [ ] **Step 1: Create AgentBadges component**

```tsx
// src/components/agent-badges.tsx
'use client';

import { useAgents } from '@/hooks/use-agents';

export function AgentBadges() {
  const { availableAgents } = useAgents();

  if (availableAgents.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {availableAgents.map((agent) => (
        <span
          key={agent.id}
          className="px-2 py-0.5 text-xs rounded-md bg-primary/10 text-primary border border-primary/20"
        >
          {agent.name}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add AgentBadges to header in layout-shell.tsx**

In `src/components/layout-shell.tsx`, add after the `<span>md-serve</span>`:

```tsx
import { AgentBadges } from '@/components/agent-badges';

// In header, after <span>md-serve</span>:
<AgentBadges />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/agent-badges.tsx src/components/layout-shell.tsx
git commit -m "feat: add agent badges to header"
```

---

### Task 16: Agent Picker Component

**Files:**
- Create: `src/components/agent-picker.tsx`

- [ ] **Step 1: Create AgentPicker component**

```tsx
// src/components/agent-picker.tsx
'use client';

import { useAgents } from '@/hooks/use-agents';

interface AgentPickerProps {
  className?: string;
}

export function AgentPicker({ className }: AgentPickerProps) {
  const { availableAgents, selectedAgent, setSelectedAgent } = useAgents();

  if (availableAgents.length <= 1) return null;

  return (
    <select
      value={selectedAgent}
      onChange={(e) => setSelectedAgent(e.target.value)}
      className={`text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground ${className ?? ''}`}
      aria-label="Select agent"
    >
      {availableAgents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {agent.name}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/agent-picker.tsx
git commit -m "feat: add agent picker dropdown component"
```

---

### Task 17: Agent Toolbar Component

**Files:**
- Create: `src/components/agent-toolbar.tsx`
- Create: `src/components/summary-modal.tsx`

- [ ] **Step 1: Create SummaryModal component**

```tsx
// src/components/summary-modal.tsx
'use client';

interface SummaryModalProps {
  open: boolean;
  onClose: () => void;
  summary: string;
  loading: boolean;
}

export function SummaryModal({ open, onClose, summary, loading }: SummaryModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">AI Summary</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="animate-pulse text-muted-foreground text-sm">Generating summary...</div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{summary}</div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create AgentToolbar component**

```tsx
// src/components/agent-toolbar.tsx
'use client';

import { useState } from 'react';
import { useLayout } from '@/app/layout-context';
import { useAgents } from '@/hooks/use-agents';
import { AgentPicker } from '@/components/agent-picker';
import { SummaryModal } from '@/components/summary-modal';

interface AgentToolbarProps {
  filePath: string;
  onShowSessions?: () => void;
  sessionCount?: number;
}

export function AgentToolbar({ filePath, onShowSessions, sessionCount }: AgentToolbarProps) {
  const { availableAgents, selectedAgent } = useAgents();
  const { isAgentWorking, setIsAgentWorking } = useLayout();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  if (availableAgents.length === 0) return null;

  async function handleSummarize() {
    if (!selectedAgent) return;
    setSummaryOpen(true);
    setSummaryLoading(true);
    setIsAgentWorking(true);
    try {
      const res = await fetch('/api/agent/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgent, filePath }),
      });
      const data = await res.json();
      setSummary(data.summary || data.error || 'No summary generated');
    } catch {
      setSummary('Failed to generate summary');
    } finally {
      setSummaryLoading(false);
      setIsAgentWorking(false);
    }
  }

  async function handleEdit() {
    if (!selectedAgent) return;
    const prompt = window.prompt('Enter edit instruction for the entire document:');
    if (!prompt) return;

    setIsAgentWorking(true);
    try {
      await fetch('/api/agent/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgent, filePath, prompt }),
      });
      // File watcher handles UI refresh
    } catch {
      // Error handling via toast could be added later
    } finally {
      setIsAgentWorking(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-muted/30">
        <button
          type="button"
          onClick={handleSummarize}
          disabled={isAgentWorking}
          className="px-2.5 py-1 text-xs rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 disabled:opacity-50 transition-colors"
        >
          Summarize
        </button>
        <button
          type="button"
          onClick={handleEdit}
          disabled={isAgentWorking}
          className="px-2.5 py-1 text-xs rounded-md bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
        >
          Edit with AI
        </button>

        <AgentPicker />

        <div className="flex-1" />

        {sessionCount !== undefined && sessionCount > 0 && (
          <button
            type="button"
            onClick={onShowSessions}
            className="px-2.5 py-1 text-xs rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
          >
            Sessions ({sessionCount})
          </button>
        )}

        {isAgentWorking && (
          <span className="text-xs text-muted-foreground animate-pulse">Working...</span>
        )}
      </div>

      <SummaryModal
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        summary={summary}
        loading={summaryLoading}
      />
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/agent-toolbar.tsx src/components/summary-modal.tsx
git commit -m "feat: add agent toolbar and summary modal"
```

---

### Task 18: Selection Edit Bar

**Files:**
- Create: `src/hooks/use-text-selection.ts`
- Create: `src/components/selection-edit-bar.tsx`

- [ ] **Step 1: Create text selection hook**

```ts
// src/hooks/use-text-selection.ts
'use client';

import { useState, useEffect, useCallback } from 'react';

interface TextSelection {
  text: string;
  rect: DOMRect | null;
}

export function useTextSelection(containerRef: React.RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<TextSelection>({ text: '', rect: null });

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setSelection({ text: '', rect: null });
      return;
    }

    // Only track selections within our container
    const range = sel.getRangeAt(0);
    if (containerRef.current && !containerRef.current.contains(range.commonAncestorContainer)) {
      return;
    }

    const text = sel.toString().trim();
    if (!text) {
      setSelection({ text: '', rect: null });
      return;
    }

    const rect = range.getBoundingClientRect();
    setSelection({ text, rect });
  }, [containerRef]);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection({ text: '', rect: null });
  }, []);

  return { selection, clearSelection };
}
```

- [ ] **Step 2: Create SelectionEditBar component**

```tsx
// src/components/selection-edit-bar.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useAgents } from '@/hooks/use-agents';
import { useLayout } from '@/app/layout-context';
import { AgentPicker } from '@/components/agent-picker';

interface SelectionEditBarProps {
  selectedText: string;
  rect: DOMRect | null;
  filePath: string;
  onDone: () => void;
}

export function SelectionEditBar({ selectedText, rect, filePath, onDone }: SelectionEditBarProps) {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { selectedAgent } = useAgents();
  const { setIsAgentWorking } = useLayout();

  useEffect(() => {
    if (rect && inputRef.current) {
      inputRef.current.focus();
    }
  }, [rect]);

  if (!selectedText || !rect) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !selectedAgent) return;

    setIsAgentWorking(true);
    try {
      await fetch('/api/agent/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgent,
          filePath,
          prompt: prompt.trim(),
          selection: selectedText,
        }),
      });
    } catch {
      // Error handling
    } finally {
      setIsAgentWorking(false);
      setPrompt('');
      onDone();
    }
  }

  // Position the bar above the selection (fixed = relative to viewport, no scrollY needed)
  const top = Math.max(8, rect.top - 44);
  const left = Math.max(8, rect.left);

  return (
    <form
      onSubmit={handleSubmit}
      className="fixed z-50 flex items-center gap-1.5 px-2 py-1.5 bg-background border border-border rounded-lg shadow-lg"
      style={{ top: `${top}px`, left: `${left}px` }}
    >
      <input
        ref={inputRef}
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Edit instruction..."
        className="text-xs px-2 py-1 w-48 bg-muted border border-border rounded text-foreground placeholder:text-muted-foreground"
      />
      <AgentPicker className="text-[10px]" />
      <button
        type="submit"
        disabled={!prompt.trim()}
        className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground disabled:opacity-50"
      >
        Go
      </button>
      <button
        type="button"
        onClick={onDone}
        className="text-muted-foreground hover:text-foreground text-xs px-1"
        aria-label="Cancel"
      >
        &times;
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-text-selection.ts src/components/selection-edit-bar.tsx
git commit -m "feat: add text selection hook and floating edit bar"
```

---

### Task 19: Sessions Panel Component

**Files:**
- Create: `src/components/sessions-panel.tsx`

- [ ] **Step 1: Create SessionsPanel component**

```tsx
// src/components/sessions-panel.tsx
'use client';

import { useState } from 'react';
import { useSessions } from '@/hooks/use-sessions';

interface SessionsPanelProps {
  filePath: string | null;
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SessionsPanel({ filePath }: SessionsPanelProps) {
  const { sessions, loading } = useSessions(filePath);
  const [copied, setCopied] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="px-2 py-1">
        <p className="text-xs text-muted-foreground animate-pulse">Loading sessions...</p>
      </div>
    );
  }

  if (sessions.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Sessions
      </p>
      <div className="space-y-2">
        {sessions.map((session, i) => (
          <div
            key={`${session.sessionId}-${i}`}
            className="p-2 rounded-md border border-border bg-muted/30"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-primary">{session.provider}</span>
              <span className="text-[10px] text-muted-foreground">{timeAgo(session.timestamp)}</span>
            </div>
            {session.summary && (
              <p className="text-xs text-foreground mb-1.5 line-clamp-2">{session.summary}</p>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {session.action}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(session.resumeCommand);
                  setCopied(session.sessionId);
                  setTimeout(() => setCopied(null), 2000);
                }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
              >
                {copied === session.sessionId ? 'Copied!' : 'Copy resume cmd'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sessions-panel.tsx
git commit -m "feat: add sessions panel component"
```

---

### Task 20: Integration — Wire Everything Together

**Files:**
- Modify: `src/app/[[...path]]/page.tsx` (add toolbar + selection bar)
- Modify: `src/app/layout-client.tsx` (add sessions panel to right sidebar, agent badges to header)

- [ ] **Step 1: Add agent toolbar and selection edit bar to page.tsx**

Update `src/app/[[...path]]/page.tsx` — in `FileViewContent`:

1. Add imports:
```tsx
import { useRef } from 'react';
import { AgentToolbar } from '@/components/agent-toolbar';
import { SelectionEditBar } from '@/components/selection-edit-bar';
import { useTextSelection } from '@/hooks/use-text-selection';
import { useSessions } from '@/hooks/use-sessions';
```

2. Add hooks inside `FileViewContent` (after existing hooks):
```tsx
const contentRef = useRef<HTMLDivElement>(null);
const { selection, clearSelection } = useTextSelection(contentRef);
const { sessions } = useSessions(filePath);
```

3. Wrap the existing return to add toolbar above content and selection bar:
```tsx
return (
  <>
    <AgentToolbar filePath={filePath} sessionCount={sessions.length} />
    <div ref={contentRef}>
      <article>
        {hasFrontmatter && <FrontmatterCard data={fileData.frontmatter} />}
        <div className="prose prose-gray dark:prose-invert max-w-none">
          <MarkdownRenderer content={fileData.content} filePath={filePath} onHeadingsExtracted={handleHeadingsExtracted} />
        </div>
      </article>
    </div>
    <SelectionEditBar
      selectedText={selection.text}
      rect={selection.rect}
      filePath={filePath}
      onDone={clearSelection}
    />
  </>
);
```

The toolbar renders above the content, inside the existing `<main>` container from `layout-client.tsx`. No layout restructuring needed.

- [ ] **Step 2: Add SessionsPanel and AgentBadges to layout-client.tsx**

Update `src/app/layout-client.tsx`:

1. Add imports:
```tsx
import { SessionsPanel } from '@/components/sessions-panel';
import { AgentBadges } from '@/components/agent-badges';
```

2. In the `useLayout()` destructuring, add `currentFilePath`.

3. Add `<AgentBadges />` in the header, after the `md-serve` span:
```tsx
<span className="text-sm font-semibold mr-2 select-none">md-serve</span>
<AgentBadges />
```

4. Add `<SessionsPanel />` below `<OutlinePanel>` in the right sidebar (inside the existing `<div className="p-4 sticky top-0">`):
```tsx
<div className="p-4 sticky top-0">
  <OutlinePanel headings={headings} />
  {currentFilePath && (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
      <SessionsPanel filePath={currentFilePath} />
    </div>
  )}
</div>
```

The right sidebar is conditionally shown when `outlineOpen && headings.length > 0`. We should also show it when there are sessions, so update the condition:
```tsx
{outlineOpen && (headings.length > 0 || currentFilePath) && (
```

- [ ] **Step 2: Run the dev server and verify manually**

Run: `npm run dev`
- Navigate to a markdown file
- Verify: agent badges appear in header
- Verify: agent toolbar appears above content
- Verify: selecting text shows floating edit bar
- Verify: sessions panel shows in right sidebar (if sessions exist)

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All existing and new tests pass

- [ ] **Step 4: Commit**

```bash
git add src/app/\\[\\[...path\\]\\]/page.tsx
git commit -m "feat: integrate agent toolbar, selection edit bar, and sessions panel"
```

---

### Task 21: Final Integration Test

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run lint**

Run: `npx eslint`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Final commit if any fixes were needed**

Stage only the specific files that were modified to fix issues, then commit:
```bash
git commit -m "fix: resolve any build/lint issues from integration"
```
