import { execFile as execFileCb } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

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
    summarizeArgs: ['-p', 'Summarize the following markdown document concisely in 3-5 bullet points. Respond with only the bullet points, no preamble.'],
    editArgs: ['--allowedTools', 'Edit,Write,Read', '-p', 'Edit the file {file}. {prompt}. Only modify the file, do not output anything else.'],
    resumeArgs: ['--resume', '{sessionId}'],
    sessionPaths: ['~/.claude/projects/'],
    timeout: 120000,
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    binary: 'codex',
    detectArgs: ['--version'],
    summarizeArgs: ['--quiet', 'Summarize the following markdown document concisely in 3-5 bullet points. Respond with only the bullet points.'],
    editArgs: ['--quiet', 'Edit the file {file}. {prompt}. Only modify the file, do not output anything else.'],
    resumeArgs: ['--resume', '{sessionId}'],
    sessionPaths: ['~/.codex/sessions/', '~/.codex/archived_sessions/'],
    timeout: 120000,
  },
  {
    id: 'aider',
    name: 'Aider',
    binary: 'aider',
    detectArgs: ['--version'],
    summarizeArgs: ['--message', 'Summarize the following markdown document concisely in 3-5 bullet points:\n\n{content}', '{file}'],
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
    summarizeArgs: ['--print', 'Summarize the following markdown document concisely in 3-5 bullet points. File: {file}\n\n{content}'],
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
    let raw: string;
    try {
      raw = fs.readFileSync(configPath, 'utf-8');
    } catch {
      // Config file doesn't exist — expected, skip silently
      return;
    }

    let custom: unknown;
    try {
      custom = JSON.parse(raw);
    } catch {
      console.warn(`[agent-registry] Invalid JSON in custom config: ${configPath}`);
      return;
    }

    if (!Array.isArray(custom)) {
      console.warn(`[agent-registry] Custom config must be a JSON array: ${configPath}`);
      return;
    }

    for (const agent of custom) {
      if (!agent || typeof agent !== 'object' || !('id' in agent) || typeof agent.id !== 'string') {
        console.warn(`[agent-registry] Skipping invalid agent entry in ${configPath}`);
        continue;
      }
      const existingIndex = this.configs.findIndex((a) => a.id === agent.id);
      if (existingIndex >= 0) {
        const override = agent as Record<string, unknown>;
        if (typeof override.binary === 'string' && !/^[\w./-]+$/.test(override.binary)) {
          console.warn(`[agent-registry] Skipping binary override for '${override.id}': unsafe binary name`);
          const { binary: _ignored, ...safeOverride } = override;
          this.configs[existingIndex] = { ...this.configs[existingIndex], ...safeOverride } as AgentConfig;
        } else {
          this.configs[existingIndex] = { ...this.configs[existingIndex], ...agent };
        }
      } else {
        // Validate required fields for entirely new agents
        const a = agent as Record<string, unknown>;
        if (typeof a.binary !== 'string' || !/^[\w./-]+$/.test(a.binary)) {
          console.warn(`[agent-registry] Skipping agent '${a.id}': missing or unsafe binary name`);
          continue;
        }
        if (!Array.isArray(a.summarizeArgs) || !Array.isArray(a.editArgs)) {
          console.warn(`[agent-registry] Skipping agent '${a.id}': missing summarizeArgs or editArgs`);
          continue;
        }
        this.configs.push(agent as AgentConfig);
      }
    }
  }

  async detectAvailable(): Promise<void> {
    this.available.clear();
    const checks = this.configs.map(async (agent) => {
      try {
        await execFile('which', [agent.binary], { stdio: 'pipe' } as any);
        this.available.add(agent.id);
      } catch {
        // Agent not installed
      }
    });
    await Promise.all(checks);
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
