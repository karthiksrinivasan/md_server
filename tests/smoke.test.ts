import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type ChildProcess, spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const PROJECT_ROOT = path.join(__dirname, '..');
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'docs');
const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;

let serverProcess: ChildProcess;

function findServerJs(): string {
  // In a normal checkout, server.js is at .next/standalone/server.js
  const directPath = path.join(PROJECT_ROOT, '.next', 'standalone', 'server.js');
  if (fs.existsSync(directPath)) return directPath;

  // In a git worktree, Next.js nests output under the worktree's relative path
  const result = execSync('find .next/standalone -name "server.js" -not -path "*/node_modules/*" -maxdepth 5', {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);

  if (result.length > 0) return path.join(PROJECT_ROOT, result[0]);
  throw new Error('server.js not found in .next/standalone/');
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

describe('Smoke Tests', () => {
  beforeAll(async () => {
    const serverJs = findServerJs();
    serverProcess = spawn('node', [serverJs], {
      env: {
        ...process.env,
        MD_SERVE_ROOT: FIXTURE_DIR,
        PORT: String(PORT),
        NODE_ENV: 'production',
      },
      stdio: 'pipe',
      cwd: PROJECT_ROOT,
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[server stderr] ${data.toString()}`);
    });

    await waitForServer(`${BASE_URL}/api/tree`);
  }, 60_000);

  afterAll(() => {
    if (serverProcess) serverProcess.kill('SIGTERM');
  });

  it('GET /api/tree — returns expected tree structure', async () => {
    const res = await fetch(`${BASE_URL}/api/tree`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('tree');
    expect(Array.isArray(data.tree)).toBe(true);
    const flatNames = flattenNames(data.tree);
    expect(flatNames).toContain('README.md');
    expect(flatNames).toContain('guide.md');
  });

  it('GET /api/file?path=README.md — returns content and frontmatter', async () => {
    const res = await fetch(`${BASE_URL}/api/file?path=README.md`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('content');
    expect(data).toHaveProperty('frontmatter');
    expect(data.content).toContain('# Project Overview');
    expect(data.frontmatter).toHaveProperty('title', 'Project README');
    expect(data.frontmatter.tags).toEqual(['docs', 'overview']);
  });

  it('GET /api/search?q=guide — returns search results', async () => {
    const res = await fetch(`${BASE_URL}/api/search?q=guide`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('results');
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBeGreaterThan(0);
    const paths = data.results.map((r: { path: string }) => r.path);
    expect(paths).toContain('guide.md');
  });

  it('GET /api/asset?path=images/diagram.png — returns image', async () => {
    const res = await fetch(`${BASE_URL}/api/asset?path=images/diagram.png`);
    expect(res.ok).toBe(true);
    const contentType = res.headers.get('content-type');
    expect(contentType).toMatch(/^image\/png/);
    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('GET /api/file?path=nonexistent.md — returns 404', async () => {
    const res = await fetch(`${BASE_URL}/api/file?path=nonexistent.md`);
    expect(res.status).toBe(404);
  });
});

interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

function flattenNames(nodes: TreeNode[]): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    result.push(node.name);
    if (node.children) result.push(...flattenNames(node.children));
  }
  return result;
}
