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

  let body: { agentId?: string; filePath?: string };
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
