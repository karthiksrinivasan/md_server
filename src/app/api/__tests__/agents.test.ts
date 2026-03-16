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
  execFileSync: vi.fn((cmd: string, args?: string[]) => {
    if (args && args[0] === 'claude') return Buffer.from('/usr/bin/claude');
    throw new Error('not found');
  }),
}));

// Reset singleton between tests
vi.mock('@/server/agent-registry-singleton', async () => {
  const { AgentRegistry } = await vi.importActual<any>('@/server/agent-registry');
  const { execFileSync } = await vi.importActual<any>('node:child_process');
  return {
    getAgentRegistry: vi.fn(async () => {
      const registry = new AgentRegistry();
      await registry.detectAvailable();
      return registry;
    }),
  };
});

import { GET } from '../agents/route';

describe('GET /api/agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns list of agents', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(data.agents)).toBe(true);
  });
});
