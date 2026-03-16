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

const MAX_PROMPT_LENGTH = 10_000;
const MAX_SELECTION_LENGTH = 5_000;

function stripControlChars(input: string): string {
  return input.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

function shellEscape(arg: string): string {
  if (/^[\w./:=@-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
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
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return { error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters` };
    }
    if (selection && selection.length > MAX_SELECTION_LENGTH) {
      return { error: `Selection exceeds maximum length of ${MAX_SELECTION_LENGTH} characters` };
    }

    const args = interpolateArgs(agent.editArgs, {
      file: filePath,
      prompt: stripControlChars(prompt),
      selection: stripControlChars(selection ?? ''),
    });
    const result = await this.spawnAgent(agent.binary, args, agent.timeout ?? 120000);

    if (result.error) return { error: result.error };
    return { success: true };
  }

  buildResumeCommand(agent: AgentConfig, sessionId: string): string {
    if (!/^[\w./-]+$/.test(sessionId)) {
      return `# Invalid session ID: contains unsafe characters`;
    }
    const args = interpolateArgs(agent.resumeArgs, { sessionId });
    return [agent.binary, ...args].map(shellEscape).join(' ');
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
