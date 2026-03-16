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
