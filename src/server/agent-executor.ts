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
