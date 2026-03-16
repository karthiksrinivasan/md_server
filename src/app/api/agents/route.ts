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
