import { NextResponse } from 'next/server';
import { getAgentRegistry } from '@/server/agent-registry-singleton';

export async function GET() {
  const registry = await getAgentRegistry();
  const agents = registry.getAvailableAgents().map(({ id, name, binary }) => ({ id, name, binary }));
  return NextResponse.json({ agents });
}
