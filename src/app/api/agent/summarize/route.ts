import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/server/config';
import { getAgentRegistry } from '@/server/agent-registry-singleton';
import { AgentExecutor } from '@/server/agent-executor';
import path from 'node:path';
import fs from 'node:fs';

interface SummaryCache {
  [filePath: string]: {
    agentId: string;
    summary: string;
    fileHash: string;
    timestamp: string;
  };
}

function getCachePath(rootDir: string): string {
  return path.join(rootDir, '.md_server', 'summaries.json');
}

function loadCache(rootDir: string): SummaryCache {
  try {
    return JSON.parse(fs.readFileSync(getCachePath(rootDir), 'utf-8'));
  } catch {
    return {};
  }
}

function saveCache(rootDir: string, cache: SummaryCache): void {
  const cacheDir = path.join(rootDir, '.md_server');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(getCachePath(rootDir), JSON.stringify(cache, null, 2));
}

function fileHash(absPath: string): string {
  try {
    const stat = fs.statSync(absPath);
    return `${stat.size}-${stat.mtimeMs}`;
  } catch {
    return '';
  }
}

export async function POST(request: NextRequest) {
  const config = getConfig();

  if (config.host !== 'localhost' && config.host !== '127.0.0.1') {
    if (process.env.MD_SERVE_ALLOW_REMOTE_AGENTS !== 'true') {
      return NextResponse.json({ error: 'Agent endpoints are localhost-only' }, { status: 403 });
    }
  }

  let body: { agentId?: string; filePath?: string; regenerate?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.agentId || !body.filePath) {
    return NextResponse.json({ error: 'Missing agentId or filePath' }, { status: 400 });
  }

  const absPath = path.resolve(config.rootDir, body.filePath);
  if (!absPath.startsWith(path.resolve(config.rootDir) + path.sep)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Check cache first (unless regenerate requested)
  const currentHash = fileHash(absPath);
  if (!body.regenerate) {
    const cache = loadCache(config.rootDir);
    const cached = cache[body.filePath];
    if (cached && cached.agentId === body.agentId && cached.fileHash === currentHash) {
      return NextResponse.json({ summary: cached.summary, cached: true });
    }
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

  // Save to cache
  const cache = loadCache(config.rootDir);
  cache[body.filePath] = {
    agentId: body.agentId,
    summary: result.summary!,
    fileHash: currentHash,
    timestamp: new Date().toISOString(),
  };
  saveCache(config.rootDir, cache);

  return NextResponse.json({ summary: result.summary });
}
